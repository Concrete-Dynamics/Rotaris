"""CLI entry point for Rotaris."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING, Annotated

import typer
from pydantic import ValidationError

from rotaris_core.cli.commands.checkpoints import register as _register_checkpoints
from rotaris_core.cli.commands.config import register as _register_config
from rotaris_core.cli.commands.events import register as _register_events
from rotaris_core.cli.commands.improvements import register as _register_improvements
from rotaris_core.cli.commands.login import register as _register_login
from rotaris_core.cli.commands.models import register as _register_models
from rotaris_core.cli.commands.providers import register as _register_providers
from rotaris_core.cli.commands.requirements import register as _register_requirements
from rotaris_core.cli.commands.secrets import register as _register_secrets
from rotaris_core.cli.commands.setup import register as _register_setup
from rotaris_core.events.stream import (
    OUTPUT_FORMAT_STREAM_JSON,
    OUTPUT_FORMAT_TEXT,
    OUTPUT_FORMATS,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.cli.auth_flow import LoginUI
    from rotaris_core.config.schema import RotarisConfig

app = typer.Typer(name="rotaris-cli", help="CLI-native agentic orchestration framework")

_register_login(app)
_register_models(app)
_register_providers(app)
_register_secrets(app)
_register_config(app)
_register_checkpoints(app)
_register_improvements(app)
_register_events(app)
_register_requirements(app)
_register_setup(app)


def _load_cli_config(workspace_root: Path, config_path: Path | None) -> RotarisConfig:
    from rotaris_core.cli.config_errors import wrap_config_validation_error
    from rotaris_core.config.loader import (
        _load_yaml_file,
        _merge_config_data,
        load_config,
    )
    from rotaris_core.config.schema import RotarisConfig

    try:
        config = load_config(workspace_root)
        if config_path is None:
            return config

        override_data = _load_yaml_file(config_path)
        merged_data = _merge_config_data(config.model_dump(mode="python"), override_data)
        merged_data["workspace_root"] = workspace_root
        return RotarisConfig.model_validate(merged_data)
    except ValidationError as exc:
        raise wrap_config_validation_error(exc) from exc


class _StartupRecoveryUI:
    def info(self, message: str) -> None:
        typer.echo(message, err=True)

    def warning(self, message: str) -> None:
        typer.echo(message, err=True)

    def error(self, message: str) -> None:
        typer.echo(message, err=True)


@traces(SWR.SWR_833)
def _detect_onboarding_review(workspace_root: Path, config: RotarisConfig) -> bool:
    """Detect first-run OAuth onboarding: startup slots are in the snapshot only.

    After an OAuth auto-login (Copilot, OpenAI, Anthropic), startup slot
    assignments are written to the model snapshot but the bootstrap agents.yaml
    retains all-null slots.  Return True when the raw YAML has null slots while
    the resolved config has real model assignments — the user should review.

    OpenAI-compatible providers with ``configure_models=True`` write directly
    to agents.yaml, so this check returns False for them.
    """
    from rotaris_core.config.startup_models import _load_agents_yaml, agents_yaml_path

    _onboarding_slots = (
        "small_model",
        "medium_model",
        "large_model",
        "default_summary_model",
        "fallback_model",
        "improvement_collector_model",
    )

    raw_yaml = _load_agents_yaml(agents_yaml_path(workspace_root))
    all_null_in_yaml = all(raw_yaml.get(s) is None for s in _onboarding_slots)
    any_non_null_in_config = any(getattr(config, s, None) is not None for s in _onboarding_slots)
    return all_null_in_yaml and any_non_null_in_config


@app.command()
@traces(SWR.SWR_1828)
def run(
    task: Annotated[
        str | None,
        typer.Argument(help="Task to execute (omit for interactive TUI)"),
    ] = None,
    background: Annotated[
        bool,
        typer.Option("--background", "-b", help="Run in background mode"),
    ] = False,
    workspace: Annotated[
        Path | None,
        typer.Option("--workspace", "-w", help="Workspace root (default: CWD)"),
    ] = None,
    session: Annotated[
        str | None,
        typer.Option("--session", "-s", help="Continue existing session"),
    ] = None,
    isolate: Annotated[
        bool,
        typer.Option("--isolate", help="Create a dedicated Git worktree for this new session"),
    ] = False,
    worktree: Annotated[
        Path | None,
        typer.Option("--worktree", help="Attach this new session to an existing Git worktree"),
    ] = None,
    worktree_branch: Annotated[
        str | None,
        typer.Option(
            "--worktree-branch",
            help="Branch name for --isolate (default: generated from the session ID)",
        ),
    ] = None,
    config_path: Annotated[
        Path | None,
        typer.Option("--config", "-c", help="Path to agents.yaml config"),
    ] = None,
    persona: Annotated[
        str | None,
        typer.Option("--persona", "-p", help="Override default persona"),
    ] = None,
    max_iterations: Annotated[
        int | None,
        typer.Option("--max-iterations", help="Max Ralph loop iterations"),
    ] = None,
    unsafe_outside_workspace: Annotated[
        bool,
        typer.Option(
            "--unsafe-outside-workspace",
            help="Allow file ops outside workspace",
        ),
    ] = False,
    output_format: Annotated[
        str,
        typer.Option(
            "--output-format",
            help=(
                "Output channel: 'text' (default) prints human-readable progress; "
                "'stream-json' emits one JSON event per line on stdout, moves all "
                "diagnostics to stderr, and implies --background."
            ),
        ),
    ] = OUTPUT_FORMAT_TEXT,
    logout_provider: Annotated[
        str | None,
        typer.Option(
            "--logout",
            help=(
                "Sign out of a provider and exit (for example 'copilot', "
                "'codex', or 'openai-compatible--my-label'). Clears stored "
                "credentials while retaining provider configuration."
            ),
        ),
    ] = None,
) -> None:
    """Run a task or start interactive TUI."""
    workspace_root = (workspace or Path.cwd()).resolve()

    if logout_provider is not None:
        _run_logout(logout_provider)
        return

    if output_format not in OUTPUT_FORMATS:
        typer.echo(
            f"Error: unknown --output-format {output_format!r}; expected one of "
            f"{', '.join(OUTPUT_FORMATS)}.",
            err=True,
        )
        raise typer.Exit(code=2)

    if output_format == OUTPUT_FORMAT_STREAM_JSON:
        # The TUI owns the whole terminal, so it can never share a process with
        # a machine-readable stdout stream (SWR-1828).  Rather than silently
        # producing an unusable stream, refuse a TUI-shaped invocation and force
        # the background path for everything else.
        if not task:
            typer.echo(
                "Error: --output-format stream-json requires a task; it cannot start "
                "the interactive TUI.",
                err=True,
            )
            raise typer.Exit(code=2)
        background = True

    if (isolate or worktree is not None or worktree_branch is not None) and not (
        background and task
    ):
        typer.echo(
            "Worktree session options require a task with --background.",
            err=True,
        )
        raise typer.Exit(code=1)

    from rotaris_core.cli.config_errors import CLIConfigLoadError
    from rotaris_core.cli.startup_recovery import maybe_refresh_models_for_config_error

    try:
        config = _load_cli_config(workspace_root, config_path)
    except CLIConfigLoadError as exc:
        if maybe_refresh_models_for_config_error(
            exc.messages,
            workspace_root=workspace_root,
            ui=_StartupRecoveryUI(),
        ):
            try:
                config = _load_cli_config(workspace_root, config_path)
            except CLIConfigLoadError as retry_exc:
                for message in retry_exc.messages:
                    typer.echo(f"Config error: {message}", err=True)
                raise typer.Exit(code=1) from retry_exc
        else:
            for message in exc.messages:
                typer.echo(f"Config error: {message}", err=True)
            raise typer.Exit(code=1) from exc

    from rotaris_core.config.validation import validate_config

    show_onboarding_review = False

    errors = validate_config(config)
    if errors:
        # First-run convenience: validation explicitly recommended `rotaris-cli login`
        # -> auto-launch login. Skip in --background (non-interactive).
        needs_login = any("rotaris-cli login" in err for err in errors)
        if needs_login and not background:
            typer.echo(
                "No models configured. Launching 'rotaris-cli login' to set up a provider...",
                err=True,
            )
            from typing import cast

            from rotaris_core.cli import auth_flow
            from rotaris_core.cli.commands.login import _RichUI

            login_result = auth_flow.run_login(
                None,
                workspace_root=workspace_root,
                reauth=False,
                ui=cast("LoginUI", _RichUI()),
            )
            if not login_result.success:
                typer.echo(login_result.message, err=True)
                raise typer.Exit(code=1)
            typer.echo(login_result.message)
            config = _load_cli_config(workspace_root, config_path)
            show_onboarding_review = _detect_onboarding_review(workspace_root, config)
            errors = validate_config(config)
        if errors:
            # If the remaining errors are "references unknown model" (stale model
            # references after a provider change), launch the TUI with the startup
            # model editor open so the user can fix them interactively.
            has_unknown_model = any("unknown model" in err for err in errors)
            if has_unknown_model and not background:
                for err in errors:
                    typer.echo(f"Config error: {err}", err=True)
                typer.echo("Launching startup model editor to fix model assignments...", err=True)
                from rotaris_core.runtime_interrupts import DoubleCtrlCHandler
                from rotaris_core.session.manager import SessionManager
                from rotaris_core.tui import RotarisTuiApp

                session_manager = SessionManager(workspace_root)
                interrupt_handler = DoubleCtrlCHandler()
                tui = RotarisTuiApp(
                    session_manager=session_manager,
                    config=config,
                    startup_model_errors=True,
                    show_onboarding_review=False,
                )
                if hasattr(tui, "interrupt_handler"):
                    tui.interrupt_handler = interrupt_handler
                interrupt_handler.set_callbacks(
                    on_first_interrupt=lambda: tui.request_interrupt_stop(force=False),
                    on_second_interrupt=lambda: tui.request_interrupt_stop(force=True),
                )
                interrupt_handler.install()
                try:
                    tui.run()
                finally:
                    interrupt_handler.restore()
                return
            for err in errors:
                typer.echo(f"Config error: {err}", err=True)
            raise typer.Exit(code=1)

    if not show_onboarding_review:
        show_onboarding_review = _detect_onboarding_review(workspace_root, config)

    if persona:
        config.default_persona = persona
    if unsafe_outside_workspace:
        config.runtime.allow_outside_workspace = True

    from rotaris_core.session.manager import SessionManager

    session_manager = SessionManager(workspace_root)

    if background and task:
        from rotaris_core.cli.background import run_background

        run_background(
            task=task,
            config=config,
            session_manager=session_manager,
            session_id=session,
            max_iterations=max_iterations,
            isolate=isolate,
            worktree_path=worktree,
            worktree_branch=worktree_branch,
            output_format=output_format,
        )
        return

    from rotaris_core.runtime_interrupts import DoubleCtrlCHandler
    from rotaris_core.tui import RotarisTuiApp

    interrupt_handler = DoubleCtrlCHandler()
    tui = RotarisTuiApp(
        session_manager=session_manager,
        config=config,
        show_onboarding_review=show_onboarding_review,
    )
    if hasattr(tui, "interrupt_handler"):
        tui.interrupt_handler = interrupt_handler
    interrupt_handler.set_callbacks(
        on_first_interrupt=lambda: tui.request_interrupt_stop(force=False),
        on_second_interrupt=lambda: tui.request_interrupt_stop(force=True),
    )
    interrupt_handler.install()
    try:
        tui.run()
    finally:
        interrupt_handler.restore()


@app.command()
@traces(SWR.SWR_2437, SWR.SWR_2817)
def sessions(
    workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    repair: Annotated[
        bool,
        typer.Option(
            "--repair",
            help=(
                "Mark every session whose process died as interrupted, so its "
                "checkpoints can be restored and its workspace integrated again."
            ),
        ),
    ] = False,
) -> None:
    """List available sessions."""
    workspace_root = (workspace or Path.cwd()).resolve()

    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.recovery import (
        INTERRUPTED_EXECUTION_STATUS,
        detect_stale_sessions,
        repair_stale_sessions,
    )

    mgr = SessionManager(workspace_root)
    if repair:
        repaired = repair_stale_sessions(mgr)
        if not repaired:
            typer.echo("No session was left marked as running by a stopped process.")
        for entry in repaired:
            typer.echo(
                f"  repaired {entry.session_id}  {entry.execution_status} -> "
                f"{INTERRUPTED_EXECUTION_STATUS}  ({entry.reason})",
            )

    # A session whose process is gone is marked in the plain listing too, so a
    # user can see why a restore or an integration is stuck without having to
    # know the concept exists.
    stale_ids = {entry.session_id for entry in detect_stale_sessions(mgr)}
    for session_data in mgr.list_sessions():
        status = str(session_data.get("execution_status", "unknown"))
        if session_data["session_id"] in stale_ids:
            status = f"{status} (stale)"
        typer.echo(
            f"  {session_data['session_id']}  {session_data.get('updated_at', 'unknown')}  "
            f"{session_data.get('schema_version', '?')}  {status}",
        )


@app.command()
def version() -> None:
    """Show version."""
    from rotaris_core import __version__

    typer.echo(f"Rotaris {__version__}")


def _run_logout(provider_id: str) -> None:
    """Delete stored tokens for ``provider_id`` and print a user-facing result.

    Implements REQ-20260424-190500-001/003/004/006: a first-class logout
    operation, available via ``rotaris-cli logout <provider>`` and
    ``rotaris-cli run --logout <provider>``, that's scoped to a single provider
    and reports one of three outcomes (deleted, no-op, failed).
    """
    from rotaris_core.auth.logout import UnknownLogoutProviderError, logout_provider
    from rotaris_core.auth.storage import TokenStorage

    storage = TokenStorage()
    try:
        result = logout_provider(provider_id, storage=storage)
    except UnknownLogoutProviderError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=2) from exc
    except OSError as exc:
        normalized = provider_id.strip().lower()
        typer.echo(f"Logout failed for {normalized}: {exc}", err=True)
        raise typer.Exit(code=1) from exc

    typer.echo(result.message)


def _resolve_logout_provider_id(provider_id: str | None) -> str:
    from rotaris_core.cli.logout_selection import resolve_logout_provider_id

    return resolve_logout_provider_id(provider_id)


@app.command()
def logout(
    provider: Annotated[
        str | None,
        typer.Argument(
            help=(
                "Auth provider to sign out of (for example 'copilot', 'codex', "
                "or 'openai-compatible--my-label'). Clears stored credentials; "
                "provider configuration is retained. Omit to choose interactively."
            ),
        ),
    ] = None,
) -> None:
    """Sign out of an auth provider."""
    try:
        resolved_provider_id = _resolve_logout_provider_id(provider)
    except RuntimeError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1) from exc

    _run_logout(resolved_provider_id)


@traces(SWR.SWR_1800, SWR.SWR_3715)
def main() -> None:
    command = next((arg for arg in sys.argv[1:] if not arg.startswith("-")), "")
    if command not in {"setup", "version", "--version"}:
        from rotaris_core.setup import ensure_bundled_setup

        ensure_bundled_setup(stream=sys.stderr)
    app()
