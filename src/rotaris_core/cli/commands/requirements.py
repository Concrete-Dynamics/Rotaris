"""``rotaris-cli requirements`` — run a requirement without the desktop (SWR-3416).

The requirement flow, its worktree isolation and its run seam all live in
``rotaris_core`` precisely so the desktop is not in the dependency path of a
headless run.  Until this group existed the only production consumer of that
seam was the desktop's ``AgentRunHost``, which made "the headless CLI is another
consumer" a sentence in a requirement rather than a thing a user could type.

It copies ``events`` (SWR-2904) rather than inventing a convention:
``register(app)``, an explicit ``--workspace`` defaulting to the current
directory, and exit codes CI can branch on:

* ``0`` — the command did what it said, **including an empty result**.  "This
  workspace has no requirements" is an answer, not a failure.
* ``1`` — the flow ran and did not reach a reviewable result.  The requirement is
  ``Blocked`` and the stage that stopped it is named on stderr.
* ``2`` — no requirement store, no such requirement, no commit to run from, no
  migration worklist waiting, an approval nobody named themselves for, or a
  release the workspace refuses.

Progress goes to stderr and the outcome to stdout, so a pipe receives the one
line saying where the requirement ended while a human still watches the stages.

The configuration is loaded — an unreadable ``agents.yaml`` is a sentence, never
a traceback — and handed to the run, but deliberately not linted the way ``run``
lints it: this command does not start the loop itself, and an unusable model
configuration comes back from the flow as a ``Blocked`` requirement naming the
stage and the reason, which is the answer this command owes in every other
failure too.

Everything the command composes comes from
:func:`~rotaris_core.requirements.execution.cli_host.run_requirement`; the two
CLI surfaces differ in their argument parsing and nowhere else.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Annotated

import typer

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.requirements.execution.cli_host import HeadlessReport


def _progress(line: str) -> None:
    """One stage or run event, where diagnostics belong."""
    typer.echo(line, err=True)


def _render(
    workspace: Path,
    body: Callable[[Path], HeadlessReport | None],
) -> None:
    """Print what *body* found: detail on stderr, the last word on stdout.

    The two reporting commands differ in which body they call and in nothing
    else, so the convention — the absent-store sentence, the stream each line
    goes to, the exit code — is decided here rather than twice.
    """
    report = body(workspace)
    if report is None:
        typer.echo(f"No requirement store exists in {workspace}.", err=True)
        return
    for line in report.progress:
        _progress(line)
    typer.echo(report.summary)


@traces(SWR.SWR_3416)
def register(app: typer.Typer) -> None:
    requirements_app = typer.Typer(
        help="Run and inspect the requirements this workspace delivers.",
    )

    @requirements_app.command("run")
    @traces(SWR.SWR_3416)
    def run_requirement_command(
        requirement: Annotated[
            str,
            typer.Argument(help="Requirement id, as printed by 'requirements list'."),
        ],
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
        config_path: Annotated[
            Path | None,
            typer.Option("--config", "-c", help="Path to agents.yaml config override."),
        ] = None,
        max_iterations: Annotated[
            int | None,
            typer.Option("--max-iterations", help="Cap Ralph loop iterations per unit run."),
        ] = None,
        base: Annotated[
            str,
            typer.Option("--base", help="Commit the run's worktree is cut from."),
        ] = "",
        flow_id: Annotated[
            str,
            typer.Option("--flow-id", help="Resume this flow instead of starting a new one."),
        ] = "",
        actor: Annotated[
            str,
            typer.Option("--actor", help="Name recorded on the release in the audit trail."),
        ] = "",
    ) -> None:
        """Take one requirement from Ready to a reviewable result, headlessly."""
        from rotaris_core.cli.app import _load_cli_config
        from rotaris_core.cli.config_errors import CLIConfigLoadError
        from rotaris_core.requirements.execution.cli_host import run_requirement

        workspace_root = (workspace or Path.cwd()).resolve()
        try:
            config = _load_cli_config(workspace_root, config_path)
        except CLIConfigLoadError as exc:
            for message in exc.messages:
                typer.echo(f"Config error: {message}", err=True)
            raise typer.Exit(code=1) from exc

        outcome = run_requirement(
            workspace_root,
            requirement,
            config=config,
            base_commit=base,
            max_iterations=max_iterations,
            flow_id=flow_id,
            actor_name=actor,
            progress=_progress,
        )
        if outcome.code == 0:
            typer.echo(outcome.message)
            return
        typer.echo(f"Error: {outcome.message}", err=True)
        raise typer.Exit(code=outcome.code)

    @requirements_app.command("list")
    @traces(SWR.SWR_3416, SWR.SWR_3201)
    def list_requirements(
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """List this workspace's requirements and the state delivery holds them in."""
        from rotaris_core.requirements.execution.cli_host import requirement_rows

        workspace_root = (workspace or Path.cwd()).resolve()
        rows = requirement_rows(workspace_root)
        if rows is None:
            typer.echo(f"No requirement store exists in {workspace_root}.", err=True)
            return
        if not rows:
            typer.echo(f"The requirement store in {workspace_root} is empty.", err=True)
            return
        for row in rows:
            typer.echo(row)

    @requirements_app.command("verify")
    @traces(SWR.SWR_3615, SWR.SWR_3221)
    def verify_requirements_command(
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """Run this workspace's check suite once and record what it verified.

        The second consumer of the verification pass, and the reason the pass
        lives in the engine rather than beside the board (SWR-3416). What a user
        gets here and what the Verify button produces are the same records from
        the same code, not two implementations that agree today.

        Exit codes follow this group's convention: ``0`` for an answer, including
        "nothing was verified" — a workspace that declares no checks has told the
        truth, and telling it is not a failure.
        """
        from rotaris_core.requirements.execution.cli_host import verification_report

        _render((workspace or Path.cwd()).resolve(), verification_report)

    @requirements_app.command("evaluate")
    @traces(SWR.SWR_3515, SWR.SWR_3502)
    def evaluate_requirements_command(
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """Re-evaluate this workspace: what moved, what it costs, what it asks for.

        The second consumer of the propagation pass, and the reason the pass lives
        in the engine rather than beside the board (SWR-3515). What a user gets
        here and what opening the Requirements area produces are the same rules
        over the same stores, not two implementations that agree today.

        Exit codes follow this group's convention: ``0`` for an answer, including
        "nothing changed" — an unedited workspace has told the truth, and telling
        it is not a failure.
        """
        from rotaris_core.requirements.execution.cli_host import evaluation_report

        _render((workspace or Path.cwd()).resolve(), evaluation_report)

    @requirements_app.command("migrate")
    @traces(SWR.SWR_3507, SWR.SWR_3508, SWR.SWR_3512)
    def migrate_requirement_command(
        requirement: Annotated[
            str | None,
            typer.Argument(
                help="Requirement whose worklist to approve. Omit to list what is waiting.",
            ),
        ] = None,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
        actor: Annotated[
            str,
            typer.Option("--actor", help="Person approving the worklist, for the audit trail."),
        ] = "",
    ) -> None:
        """Approve a planned migration worklist, or list the worklists waiting.

        The headless half of SWR-3507's last criterion, and the reason the
        migration lane is reachable at all: ``accept_migration`` had no caller on
        any surface, so a worklist could be planned and never carried out.

        Two invocations, deliberately: ``requirements evaluate`` plans a worklist
        and asks about it, this approves it and plans the unit, and
        ``requirements run`` carries it out. Nothing here touches a source file —
        which is what makes "the worklist is inspectable before any code changes"
        something a user can check rather than something the code claims.

        Exit codes follow this group's convention: ``0`` for an answer, including
        an empty listing; ``1`` when the approval ran and produced no reviewable
        result — a worklist whose sites have moved since it was planned; ``2``
        for no store, no such requirement, nothing waiting, or no ``--actor``.
        """
        from rotaris_core.requirements.execution.cli_host import (
            migration_offer,
            pending_migrations,
        )

        workspace_root = (workspace or Path.cwd()).resolve()
        if requirement is None:
            waiting = pending_migrations(workspace_root)
            if waiting is None:
                typer.echo(f"No requirement store exists in {workspace_root}.", err=True)
                return
            if not waiting:
                typer.echo(f"No migration worklist is waiting in {workspace_root}.", err=True)
                return
            for req_id in waiting:
                typer.echo(req_id)
            return

        outcome = migration_offer(workspace_root, requirement, actor_name=actor)
        if outcome.code == 0:
            typer.echo(outcome.message)
            return
        typer.echo(f"Error: {outcome.message}", err=True)
        raise typer.Exit(code=outcome.code)

    app.add_typer(requirements_app, name="requirements")
