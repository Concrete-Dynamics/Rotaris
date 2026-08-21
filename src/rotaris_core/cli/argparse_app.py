"""Headless argparse CLI entry point for Rotaris.

This module provides the same functionality as the Typer CLI but uses only
stdlib argparse, imports no UI libraries, and is suitable for background /
CI / headless execution.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from pydantic import ValidationError

from rotaris_core.events.stream import OUTPUT_FORMAT_TEXT, OUTPUT_FORMATS
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.cli.auth_flow import LoginUI
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.execution.cli_host import HeadlessReport
    from rotaris_core.session.checkpoint_restore import CheckpointRestorer


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rotaris-headless",
        description="CLI-native agentic orchestration framework (headless)",
    )
    subparsers = parser.add_subparsers(
        dest="command",
        help="Available commands",
    )

    run_parser = subparsers.add_parser("run", help="Execute a task in background mode")
    run_parser.add_argument(
        "task",
        nargs="?",
        default=None,
        help="Task to execute (validated at runtime)",
    )
    run_parser.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    run_parser.add_argument(
        "-s",
        "--session",
        type=str,
        default=None,
        help="Continue an existing session by ID",
    )
    run_parser.add_argument(
        "--isolate",
        action="store_true",
        default=False,
        help="Create a dedicated Git worktree for this new session",
    )
    run_parser.add_argument(
        "--worktree",
        type=Path,
        default=None,
        help="Attach this new session to an existing Git worktree",
    )
    run_parser.add_argument(
        "--worktree-branch",
        type=str,
        default=None,
        help="Branch name for --isolate (default: generated from the session ID)",
    )
    run_parser.add_argument(
        "-c",
        "--config",
        type=Path,
        default=None,
        help="Path to agents.yaml config override",
    )
    run_parser.add_argument(
        "-p",
        "--persona",
        type=str,
        default=None,
        help="Override the default entry persona",
    )
    run_parser.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="Cap Ralph loop iterations (default: from config)",
    )
    run_parser.add_argument(
        "--unsafe-outside-workspace",
        action="store_true",
        default=False,
        help="Allow file operations outside workspace (default: false)",
    )
    run_parser.add_argument(
        "--output-format",
        choices=list(OUTPUT_FORMATS),
        default=OUTPUT_FORMAT_TEXT,
        help=(
            "Output channel: 'text' (default) prints human-readable progress; "
            "'stream-json' emits one JSON event per line on stdout and moves "
            "all diagnostics to stderr."
        ),
    )
    run_parser.add_argument(
        "--logout",
        type=str,
        default=None,
        help=(
            "Sign out of a provider and exit (for example 'copilot', 'codex', "
            "or 'openai-compatible--my-label')."
        ),
    )

    sessions_parser = subparsers.add_parser("sessions", help="List available sessions")
    sessions_parser.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    sessions_parser.add_argument(
        "--repair",
        action="store_true",
        help=(
            "Mark every session whose process died as interrupted, so its "
            "checkpoints can be restored and its workspace integrated again."
        ),
    )

    subparsers.add_parser("version", help="Show version")

    login_parser = subparsers.add_parser("login", help="Authenticate an AI provider")
    login_parser.add_argument(
        "provider",
        nargs="?",
        default=None,
        help="Provider to authenticate",
    )
    login_parser.add_argument(
        "--reauth",
        action="store_true",
        default=False,
        help="Force re-authentication",
    )
    login_parser.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )

    logout_parser = subparsers.add_parser("logout", help="Sign out of an auth provider")
    logout_parser.add_argument(
        "provider",
        nargs="?",
        default=None,
        type=str,
        help=(
            "Provider to sign out of (for example 'copilot', 'codex', "
            "or 'openai-compatible--my-label'). Omit to choose interactively."
        ),
    )

    checkpoints_parser = subparsers.add_parser(
        "checkpoints", help="Inspect and roll back a session's checkpoints"
    )
    checkpoint_commands = checkpoints_parser.add_subparsers(dest="checkpoints_command")
    checkpoints_list = checkpoint_commands.add_parser(
        "list", help="List the checkpoints recorded for a session"
    )
    checkpoints_list.add_argument(
        "-s", "--session", required=True, help="Session id whose checkpoints to list"
    )
    checkpoints_list.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    checkpoints_restore = checkpoint_commands.add_parser(
        "restore", help="Restore a session's working tree to one of its checkpoints"
    )
    checkpoints_restore.add_argument(
        "-s", "--session", required=True, help="Session id to roll back"
    )
    checkpoints_restore.add_argument(
        "--sequence", type=int, required=True, help="Checkpoint sequence number to restore"
    )
    checkpoints_restore.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="Overwrite uncommitted changes that are in the way",
    )
    checkpoints_restore.add_argument(
        "--yes", "-y", action="store_true", default=False, help="Skip the confirmation prompt"
    )
    checkpoints_restore.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )

    # The event store is at its most useful exactly here — a CI job that has no
    # terminal and only its exit code — so the headless surface carries the same
    # ``events`` group as the Typer CLI (SWR-2904).
    events_parser = subparsers.add_parser(
        "events", help="Inspect, replay and export the events a finished run left behind"
    )
    event_commands = events_parser.add_subparsers(dest="events_command")
    events_list = event_commands.add_parser(
        "list", help="List the sessions that have a stored event history"
    )
    events_list.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    events_replay = event_commands.add_parser(
        "replay", help="Replay one session's stored events in emission order"
    )
    events_replay.add_argument("session", help="Session id, as printed by 'events list'")
    events_replay.add_argument(
        "-t",
        "--type",
        dest="event_types",
        action="append",
        default=None,
        help="Only this event type; repeatable",
    )
    events_replay.add_argument(
        "-i",
        "--iteration",
        dest="iterations",
        action="append",
        type=int,
        default=None,
        help="Only this Ralph iteration; repeatable",
    )
    events_replay.add_argument(
        "--since", default=None, help="Only events at or after this ISO-8601 timestamp"
    )
    events_replay.add_argument(
        "--until", default=None, help="Only events at or before this ISO-8601 timestamp"
    )
    events_replay.add_argument(
        "--json",
        dest="as_json",
        action="store_true",
        default=False,
        help="One JSON event per line, exactly as the live stream emits them",
    )
    events_replay.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    events_export = event_commands.add_parser(
        "export", help="Export stored runs as trajectory documents"
    )
    events_export.add_argument(
        "session", nargs="+", help="One or more session ids; several export as one batch"
    )
    events_export.add_argument(
        "-o", "--output", type=Path, default=None, help="Write here instead of stdout"
    )
    events_export.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )

    # A requirement run is the case SWR-3416 exists for: an engine seam the
    # desktop is only *one* consumer of. This group is the headless consumer,
    # and it is what makes a requirement runnable in CI and on a machine with no
    # display at all.
    requirements_parser = subparsers.add_parser(
        "requirements",
        help="Run and inspect the requirements this workspace delivers",
    )
    requirement_commands = requirements_parser.add_subparsers(dest="requirements_command")
    requirements_run = requirement_commands.add_parser(
        "run", help="Take one requirement from Ready to a reviewable result"
    )
    requirements_run.add_argument("requirement", help="Requirement id, as printed by 'list'")
    requirements_run.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    requirements_run.add_argument(
        "-c",
        "--config",
        type=Path,
        default=None,
        help="Path to agents.yaml config override",
    )
    requirements_run.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="Cap Ralph loop iterations for each unit run (default: from config)",
    )
    requirements_run.add_argument(
        "--base",
        type=str,
        default="",
        help="Commit the run's worktree is cut from (default: the workspace's HEAD)",
    )
    requirements_run.add_argument(
        "--flow-id",
        type=str,
        default="",
        help="Resume the flow with this id instead of starting a new one",
    )
    requirements_run.add_argument(
        "--actor",
        type=str,
        default="",
        help="Name recorded on the release in the audit trail",
    )
    requirements_list = requirement_commands.add_parser(
        "list", help="List this workspace's requirements and their delivery state"
    )
    requirements_list.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    # `verify` and `evaluate` exist on both surfaces because everything in this
    # group does. A subcommand present on `rotaris-cli` and missing on
    # `rotaris-headless` is the half-reachable seam SWR-3416 exists to prevent —
    # the machine with no display is the one that has the CLI and not the app.
    requirements_verify = requirement_commands.add_parser(
        "verify", help="Run this workspace's check suite once and record what it verified"
    )
    requirements_verify.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    requirements_evaluate = requirement_commands.add_parser(
        "evaluate", help="Re-evaluate this workspace: what moved, and what it costs"
    )
    requirements_evaluate.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )

    requirements_migrate = requirement_commands.add_parser(
        "migrate",
        help="Approve a planned migration worklist, or list the worklists waiting",
    )
    requirements_migrate.add_argument(
        "requirement",
        nargs="?",
        default=None,
        help="Requirement whose worklist to approve. Omit to list what is waiting.",
    )
    requirements_migrate.add_argument(
        "-w",
        "--workspace",
        type=Path,
        default=None,
        help="Workspace root directory (default: current working directory)",
    )
    requirements_migrate.add_argument(
        "--actor",
        default="",
        help="Person approving the worklist, for the audit trail",
    )

    providers_parser = subparsers.add_parser("providers", help="Manage AI providers")
    provider_commands = providers_parser.add_subparsers(dest="providers_command")
    delete_parser = provider_commands.add_parser(
        "delete", help="Delete a user-defined OpenAI-compatible provider"
    )
    delete_parser.add_argument("provider", help="Explicit provider ID to delete")
    delete_parser.add_argument(
        "--yes", "-y", action="store_true", help="Skip the irreversible deletion confirmation"
    )

    return parser


def _load_config(workspace_root: Path, config_path: Path | None) -> RotarisConfig:
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
        print(message, file=sys.stderr)

    def warning(self, message: str) -> None:
        print(message, file=sys.stderr)

    def error(self, message: str) -> None:
        print(message, file=sys.stderr)


@traces(SWR.SWR_1828)
def _cmd_run(args: argparse.Namespace) -> int:
    from rotaris_core.cli.config_errors import CLIConfigLoadError
    from rotaris_core.cli.startup_recovery import maybe_refresh_models_for_config_error

    if args.logout is not None:
        return _cmd_logout(args.logout)

    if args.task is None and args.session is None:
        print("Error: task is required for headless mode", file=sys.stderr)
        return 1

    workspace_root = (args.workspace or Path.cwd()).resolve()
    try:
        config = _load_config(workspace_root, args.config)
    except CLIConfigLoadError as exc:
        if maybe_refresh_models_for_config_error(
            exc.messages,
            workspace_root=workspace_root,
            ui=_StartupRecoveryUI(),
        ):
            try:
                config = _load_config(workspace_root, args.config)
            except CLIConfigLoadError as retry_exc:
                for message in retry_exc.messages:
                    print(f"Config error: {message}", file=sys.stderr)
                return 1
        else:
            for message in exc.messages:
                print(f"Config error: {message}", file=sys.stderr)
            return 1

    from rotaris_core.config.validation import validate_config

    errors = validate_config(config)
    if errors:
        for err in errors:
            print(f"Config error: {err}", file=sys.stderr)
        return 1

    if args.persona:
        config.default_persona = args.persona
    if args.unsafe_outside_workspace:
        config.runtime.allow_outside_workspace = True

    from rotaris_core.session.manager import SessionManager

    session_manager = SessionManager(workspace_root)

    task = args.task or ""
    # ``typer.Exit`` is a ``click.exceptions.Exit`` (a RuntimeError), *not* a
    # ``SystemExit``, so catching only the latter used to let a failing run
    # escape as an unhandled exception.  SWR-1828 requires the process exit
    # code to be the run's outcome, so both are translated into a return code.
    from click.exceptions import Exit as ClickExit

    from rotaris_core.cli.background import run_background

    try:
        run_background(
            task=task,
            config=config,
            session_manager=session_manager,
            session_id=args.session,
            max_iterations=args.max_iterations,
            isolate=args.isolate,
            worktree_path=args.worktree,
            worktree_branch=args.worktree_branch,
            output_format=args.output_format,
        )
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else 1
    except ClickExit as exc:
        return exc.exit_code if isinstance(exc.exit_code, int) else 1
    return 0


@traces(SWR.SWR_2437, SWR.SWR_2817)
def _cmd_sessions(args: argparse.Namespace) -> int:
    workspace_root = (args.workspace or Path.cwd()).resolve()

    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.recovery import (
        INTERRUPTED_EXECUTION_STATUS,
        detect_stale_sessions,
        repair_stale_sessions,
    )

    mgr = SessionManager(workspace_root)
    if getattr(args, "repair", False):
        repaired = repair_stale_sessions(mgr)
        if not repaired:
            print("No session was left marked as running by a stopped process.")
        for entry in repaired:
            print(
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
        print(
            f"  {session_data['session_id']}  "
            f"{session_data.get('updated_at', 'unknown')}  "
            f"{session_data.get('schema_version', '?')}  {status}",
        )
    return 0


def _cmd_version() -> int:
    from rotaris_core import __version__

    print(f"Rotaris {__version__}")
    return 0


class _StdinUI:
    def choose_provider(self, options: list[tuple[str, str]]) -> str | None:
        print("Choose provider:")
        for index, (_, display_name) in enumerate(options, start=1):
            print(f"{index}) {display_name}")
        raw = sys.stdin.readline().strip()
        if raw == "":
            return None
        try:
            selected = int(raw)
        except ValueError:
            return None
        if selected < 1 or selected > len(options):
            return None
        return options[selected - 1][0]

    def prompt_text(self, prompt: str, *, default: str | None = None) -> str | None:
        suffix = f" [{default}]" if default else ""
        print(f"{prompt}{suffix}")
        raw = sys.stdin.readline().strip()
        return raw or default

    def prompt_secret(self, prompt: str) -> str | None:
        print(prompt)
        raw = sys.stdin.readline().strip()
        return raw or None

    def choose_model(
        self,
        prompt: str,
        options: list[tuple[str, str]],
        *,
        default: str | None = None,
        allow_skip: bool = False,
    ) -> str | None:
        print(prompt)
        option_map: dict[str, str] = {}
        default_choice = "0" if allow_skip and default is None else ""
        if allow_skip:
            print("0) inherit/default")
        for index, (model_id, label) in enumerate(options, start=1):
            print(f"{index}) {label} [{model_id}]")
            option_map[str(index)] = model_id
            if model_id == default:
                default_choice = str(index)
        raw = sys.stdin.readline().strip()
        if raw == "":
            raw = default_choice
        if allow_skip and raw == "0":
            return None
        return option_map.get(raw, default)

    def info(self, message: str) -> None:
        print(f"[INFO] {message}")

    def show_auth_prompt(
        self,
        *,
        verification_url: str,
        user_code: str,
        message: str,
    ) -> None:
        if user_code:
            # Device Code flow — user must open URL and enter a code manually
            print(message)
            print(f"URL: {verification_url}")
            print(f"Code: {user_code}")
        else:
            # PKCE browser flow — browser will open automatically
            print("Opening your browser for login...")
            print(f"If your browser did not open, visit: {verification_url}")

    def warning(self, message: str) -> None:
        print(f"[WARN] {message}", file=sys.stderr)

    def error(self, message: str) -> None:
        print(f"[ERROR] {message}", file=sys.stderr)

    def confirm(self, prompt: str, *, default: bool = False) -> bool:
        suffix = " [Y/n]" if default else " [y/N]"
        print(f"{prompt}{suffix}")
        raw = sys.stdin.readline().strip().lower()
        if raw == "":
            return default
        if raw in {"y", "yes"}:
            return True
        if raw in {"n", "no"}:
            return False
        return default

    def choose_recovery(self) -> str:
        print("No models were discovered. Choose recovery:")
        print("1) retry")
        print("2) try other provider")
        print("3) advanced config")
        print("4) abort")
        raw = sys.stdin.readline().strip()
        return {
            "1": "retry",
            "2": "try-other-provider",
            "3": "advanced-config",
            "4": "abort",
        }.get(raw, "abort")


def _cmd_login(args: argparse.Namespace) -> int:
    from rotaris_core.cli import auth_flow

    workspace_root = (args.workspace or Path.cwd()).resolve()
    result = auth_flow.run_login(
        args.provider,
        workspace_root=workspace_root,
        reauth=args.reauth,
        ui=cast("LoginUI", _StdinUI()),
    )
    _StdinUI().info(result.message)
    return 0 if result.success else 1


def _resolve_logout_provider_id(provider_id: str | None) -> str:
    from rotaris_core.cli.logout_selection import resolve_logout_provider_id

    return resolve_logout_provider_id(provider_id)


def _cmd_logout(provider_id: str | None) -> int:
    from rotaris_core.auth.logout import UnknownLogoutProviderError, logout_provider
    from rotaris_core.auth.storage import TokenStorage
    from rotaris_core.cli.logout_selection import LogoutSelectionError

    try:
        resolved_provider_id = _resolve_logout_provider_id(provider_id)
    except LogoutSelectionError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    try:
        result = logout_provider(resolved_provider_id, storage=TokenStorage())
    except UnknownLogoutProviderError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except OSError as exc:
        normalized = resolved_provider_id.strip().lower()
        print(f"Logout failed for {normalized}: {exc}", file=sys.stderr)
        return 1

    print(result.message)
    return 0


def _cmd_delete_provider(provider_id: str, *, yes: bool) -> int:
    from rotaris_core.auth.provider_settings import delete_openai_compatible_provider

    if not yes:
        if not sys.stdin.isatty():
            print("Error: non-interactive provider deletion requires --yes", file=sys.stderr)
            return 2
        print(
            f"Delete {provider_id} user-wide? Workspace model references will not be changed. [y/N]"
        )
        if sys.stdin.readline().strip().lower() not in {"y", "yes"}:
            print("Deletion cancelled.")
            return 0
    result = delete_openai_compatible_provider(provider_id)
    print(result.message, file=sys.stdout if result.success else sys.stderr)
    return 0 if result.success else 2


def _checkpoint_restorer(args: argparse.Namespace) -> CheckpointRestorer:
    from rotaris_core.session.checkpoint_restore import CheckpointRestorer
    from rotaris_core.session.manager import SessionManager

    workspace_root = (args.workspace or Path.cwd()).resolve()
    return CheckpointRestorer(
        session_manager=SessionManager(workspace_root),
        session_id=args.session,
    )


def _stdin_is_interactive() -> bool:
    """Whether there is a human on stdin to answer a confirmation prompt."""
    stream = sys.stdin
    try:
        return stream is not None and stream.isatty()
    except (AttributeError, OSError, ValueError):
        return False


@traces(SWR.SWR_2437)
def _cmd_checkpoints_list(args: argparse.Namespace) -> int:
    from rotaris_core.session.checkpoint_restore import format_checkpoint_rows

    recorded = _checkpoint_restorer(args).list_checkpoints()
    if not recorded:
        print(f"No checkpoints are recorded for session {args.session}.", file=sys.stderr)
        return 0
    for row in format_checkpoint_rows(recorded):
        print(row)
    return 0


@traces(SWR.SWR_2437)
def _cmd_checkpoints_restore(args: argparse.Namespace) -> int:
    """Preview, confirm and apply a rollback; non-zero when it did not happen."""
    from rotaris_core.session.checkpoint_restore import format_preview_lines

    restorer = _checkpoint_restorer(args)
    preview = restorer.preview(args.sequence)
    if preview is None:
        print(
            f"No checkpoint {args.sequence} is recorded for session {args.session}.",
            file=sys.stderr,
        )
        return 2

    for line in format_preview_lines(preview):
        print(line)
    if preview.blocked_reason and not args.force:
        # Refuse through the restorer rather than here, so the refusal lands in
        # the session's audit trail exactly as an unattended one would. Asking
        # to confirm something already known to be doomed would be worse than
        # paying for the second inspection.
        blocked = restorer.restore(args.sequence, force=args.force)
        print(blocked.blocked_reason, file=sys.stderr)
        return 1

    if not args.yes:
        if not _stdin_is_interactive():
            print("Error: a non-interactive restore requires --yes.", file=sys.stderr)
            return 2
        print(f"Restore checkpoint {args.sequence} into {restorer.tree_root}? [y/N]")
        if sys.stdin.readline().strip().lower() not in {"y", "yes"}:
            print("Restore cancelled.")
            return 0

    result = restorer.restore(args.sequence, force=args.force)
    if not result.restored:
        print(result.blocked_reason, file=sys.stderr)
        return 1
    print(f"Restored checkpoint {args.sequence}; {len(result.changed_paths)} file(s) changed.")
    if result.safety_checkpoint is not None:
        print(f"Safety checkpoint {result.safety_checkpoint.sequence} holds the pre-restore state.")
    else:
        print("No safety checkpoint was needed: the working tree already matched the last commit.")
    return 0


def _events_sessions_root(args: argparse.Namespace) -> tuple[Path, Path]:
    """Resolve ``(workspace_root, sessions_root)`` for an ``events`` subcommand.

    The session directory layout has one owner, ``session.manager``; asking it
    is what keeps these commands finding the same sessions ``run`` writes.
    """
    from rotaris_core.session.manager import SessionManager

    workspace_root = (args.workspace or Path.cwd()).resolve()
    return workspace_root, SessionManager(workspace_root).sessions_dir


def _events_warn(warning: object) -> None:
    """Report an unreadable store line without failing the command."""
    print(f"Warning: skipped unreadable event-store {warning}.", file=sys.stderr)


@traces(SWR.SWR_2904)
def _cmd_events_list(args: argparse.Namespace) -> int:
    from rotaris_core.eventstore import format_stored_session_rows, list_stored_sessions

    workspace_root, sessions_root = _events_sessions_root(args)
    sessions = list_stored_sessions(sessions_root)
    if not sessions:
        print(f"No session in {workspace_root} has a stored event history.", file=sys.stderr)
        return 0
    for row in format_stored_session_rows(sessions):
        print(row)
    return 0


def _events_session_dir(args: argparse.Namespace, session_id: str) -> Path | None:
    """The session directory for *session_id*, or ``None`` after reporting it."""
    from rotaris_core.eventstore import resolve_stored_session

    workspace_root, sessions_root = _events_sessions_root(args)
    session_dir = resolve_stored_session(sessions_root, session_id)
    if session_dir is None:
        print(f"No stored session {session_id} exists in {workspace_root}.", file=sys.stderr)
        return None
    return session_dir


@traces(SWR.SWR_2904)
def _cmd_events_replay(args: argparse.Namespace) -> int:
    from rotaris_core.eventstore import (
        EventQuery,
        format_replay_row,
        parse_timestamp,
        replay_session,
    )

    session_dir = _events_session_dir(args, args.session)
    if session_dir is None:
        return 2
    bounds: dict[str, Any] = {}
    for flag, raw in (("since", args.since), ("until", args.until)):
        if raw is None:
            continue
        parsed = parse_timestamp(raw)
        if parsed is None:
            print(f"Error: --{flag} expects an ISO-8601 timestamp, not {raw!r}.", file=sys.stderr)
            return 2
        bounds[flag] = parsed

    query = EventQuery.build(
        event_types=args.event_types or None,
        iterations=args.iterations or None,
        **bounds,
    )
    # Warnings go to stderr even on the ``--json`` path, so a pipe receives
    # events only and a human still learns the store had a damaged line.
    for stored in replay_session(session_dir, query, on_warning=_events_warn):
        print(stored.as_line() if args.as_json else format_replay_row(stored))
    return 0


@traces(SWR.SWR_2904)
def _cmd_events_export(args: argparse.Namespace) -> int:
    import json

    from rotaris_core.eventstore import (
        batch_document,
        export_session,
        trajectory_document,
        write_trajectories,
        write_trajectory,
    )

    directories: list[Path] = []
    for session_id in args.session:
        session_dir = _events_session_dir(args, session_id)
        if session_dir is None:
            return 2
        directories.append(session_dir)

    trajectories = [export_session(directory, on_warning=_events_warn) for directory in directories]
    for trajectory in trajectories:
        if trajectory.summary.runs > 1:
            # The store is per session (SWR-2901) and a resumed run appends to
            # it, so a resumed session exports as one document covering several
            # runs.  Said out loud, because a harness reading it as a single run
            # would silently sum two runs' totals.
            print(
                f"Warning: session {trajectory.session_id} holds "
                f"{trajectory.summary.runs} runs (it was resumed); this document "
                "covers all of them, and its identity is the most recent one.",
                file=sys.stderr,
            )
        if trajectory.truncated:
            # A warning, not a failure: the export is still the best record of
            # that run, and a harness that refuses partial runs reads the same
            # fact off ``truncated`` in the document itself.
            print(
                f"Warning: session {trajectory.session_id} dropped "
                f"{trajectory.dropped_events} event(s) to the store cap; "
                "this export is not the complete run.",
                file=sys.stderr,
            )

    single = len(trajectories) == 1
    if args.output is not None:
        written = (
            write_trajectory(trajectories[0], args.output)
            if single
            else write_trajectories(trajectories, args.output)
        )
        print(f"Wrote {len(trajectories)} trajectory document(s) to {written}.", file=sys.stderr)
        return 0

    document = trajectory_document(trajectories[0]) if single else batch_document(trajectories)
    print(json.dumps(document, sort_keys=True, indent=2, default=str))
    return 0


@traces(SWR.SWR_3416)
def _cmd_requirements_run(args: argparse.Namespace) -> int:
    """One requirement, from Ready to a reviewable result, with no desktop.

    The command SWR-3416 promises. Everything it needs is composed by
    :func:`~rotaris_core.requirements.execution.cli_host.run_requirement`, so the
    headless surface and the Typer one drive one object rather than two.

    Progress goes to stderr and the outcome to stdout, so a pipe receives the one
    line that says where the requirement ended while a human still watches the
    stages go past.

    The configuration is *loaded* — an unreadable ``agents.yaml`` is a sentence,
    never a traceback — and handed to the run, but deliberately not linted the
    way ``run`` lints it: this command does not start the loop itself, and an
    unusable model configuration comes back from the flow as a ``Blocked``
    requirement naming the stage and the reason, which is the answer this command
    owes the user in every other failure too.
    """
    from rotaris_core.cli.config_errors import CLIConfigLoadError

    workspace_root = (args.workspace or Path.cwd()).resolve()
    try:
        config = _load_config(workspace_root, args.config)
    except CLIConfigLoadError as exc:
        for message in exc.messages:
            print(f"Config error: {message}", file=sys.stderr)
        return 1

    from rotaris_core.requirements.execution.cli_host import run_requirement

    outcome = run_requirement(
        workspace_root,
        args.requirement,
        config=config,
        base_commit=args.base,
        max_iterations=args.max_iterations,
        flow_id=args.flow_id,
        actor_name=args.actor,
        progress=lambda line: print(line, file=sys.stderr),
    )
    if outcome.code == 0:
        print(outcome.message)
    else:
        print(f"Error: {outcome.message}", file=sys.stderr)
    return outcome.code


@traces(SWR.SWR_3416, SWR.SWR_3201)
def _cmd_requirements_list(args: argparse.Namespace) -> int:
    """Every requirement this workspace has, with the state delivery holds it in."""
    from rotaris_core.requirements.execution.cli_host import requirement_rows

    workspace_root = (args.workspace or Path.cwd()).resolve()
    rows = requirement_rows(workspace_root)
    if rows is None:
        print(f"No requirement store exists in {workspace_root}.", file=sys.stderr)
        return 0
    if not rows:
        print(f"The requirement store in {workspace_root} is empty.", file=sys.stderr)
        return 0
    for row in rows:
        print(row)
    return 0


@traces(SWR.SWR_3507, SWR.SWR_3508, SWR.SWR_3512)
def _cmd_requirements_migrate(args: argparse.Namespace) -> int:
    """Approve a planned migration worklist, or say which ones are waiting.

    The command that makes the migration lane reachable: until it existed,
    ``accept_migration`` — the only path from a planned worklist to changed code
    — had no caller on any surface.

    Nothing here writes to a source file. It records an approval and plans one
    execution unit; ``requirements run`` is what carries it out, in that unit's
    own worktree, and only a passing suite lands it. Two commands rather than
    one, because "the worklist is inspectable before any code changes" (SWR-3507)
    is only a property if a user can stop between them.
    """
    from rotaris_core.requirements.execution.cli_host import (
        migration_offer,
        pending_migrations,
    )

    workspace_root = (args.workspace or Path.cwd()).resolve()
    if args.requirement is None:
        waiting = pending_migrations(workspace_root)
        if waiting is None:
            print(f"No requirement store exists in {workspace_root}.", file=sys.stderr)
            return 0
        if not waiting:
            print(f"No migration worklist is waiting in {workspace_root}.", file=sys.stderr)
            return 0
        for req_id in waiting:
            print(req_id)
        return 0

    outcome = migration_offer(workspace_root, args.requirement, actor_name=args.actor)
    if outcome.code == 0:
        print(outcome.message)
    else:
        print(f"Error: {outcome.message}", file=sys.stderr)
    return outcome.code


@traces(SWR.SWR_3416, SWR.SWR_3615, SWR.SWR_3515)
def _cmd_requirements_report(
    args: argparse.Namespace,
    body: Callable[[Path], HeadlessReport | None],
) -> int:
    """Print what *body* found: detail on stderr, the last word on stdout.

    The whole of ``verify`` and ``evaluate`` on this surface. Both call the same
    function the typer surface calls, so the two parsers differ in their argument
    parsing and nowhere else (SWR-3416).
    """
    workspace_root = (args.workspace or Path.cwd()).resolve()
    report = body(workspace_root)
    if report is None:
        print(f"No requirement store exists in {workspace_root}.", file=sys.stderr)
        return 0
    for line in report.progress:
        print(line, file=sys.stderr)
    print(report.summary)
    return 0


@traces(SWR.SWR_775, SWR.SWR_1817, SWR.SWR_1818, SWR.SWR_1819, SWR.SWR_1820, SWR.SWR_1826)
def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "run":
        return _cmd_run(args)
    if args.command == "sessions":
        return _cmd_sessions(args)
    if args.command == "version":
        return _cmd_version()
    if args.command == "login":
        return _cmd_login(args)
    if args.command == "logout":
        return _cmd_logout(args.provider)
    if args.command == "providers" and args.providers_command == "delete":
        return _cmd_delete_provider(args.provider, yes=args.yes)
    if args.command == "checkpoints":
        if args.checkpoints_command == "list":
            return _cmd_checkpoints_list(args)
        if args.checkpoints_command == "restore":
            return _cmd_checkpoints_restore(args)
    if args.command == "events":
        if args.events_command == "list":
            return _cmd_events_list(args)
        if args.events_command == "replay":
            return _cmd_events_replay(args)
        if args.events_command == "export":
            return _cmd_events_export(args)
    if args.command == "requirements":
        if args.requirements_command == "run":
            return _cmd_requirements_run(args)
        if args.requirements_command == "list":
            return _cmd_requirements_list(args)
        if args.requirements_command == "migrate":
            return _cmd_requirements_migrate(args)
        if args.requirements_command in {"verify", "evaluate"}:
            from rotaris_core.requirements.execution.cli_host import (
                evaluation_report,
                verification_report,
            )

            return _cmd_requirements_report(
                args,
                verification_report if args.requirements_command == "verify" else evaluation_report,
            )
    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
