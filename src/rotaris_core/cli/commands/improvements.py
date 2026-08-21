"""``rotaris-cli improvements`` — history and rollback of improvement runs.

SWR-1640 records what an improvement artifact said at every point in its life and
SWR-1641 makes an applied improvement run reversible; both are unreachable
without a command surface, so this group mirrors ``rotaris-cli checkpoints``
exactly — ``register(app)``, an explicit ``--workspace`` defaulting to the
current directory, ``--yes`` for scripted use, ``--force`` to override the
dirty-workspace refusal, and exit codes CI can branch on:

* ``0`` — the command did what it said, including a declined confirmation, which
  leaves the workspace untouched.
* ``1`` — a rollback was refused or failed; the reason is on stderr.
* ``2`` — the artifact does not exist, or a rollback was asked for unattended
  without ``--yes``.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Annotated

import typer

from rotaris_core.reqtocode import SWR, traces


def _stdin_is_interactive() -> bool:
    """Whether there is a human on stdin to answer a confirmation prompt."""
    stream = sys.stdin
    try:
        return stream is not None and stream.isatty()
    except (AttributeError, OSError, ValueError):
        return False


@traces(SWR.SWR_1642)
def register(app: typer.Typer) -> None:
    improvements_app = typer.Typer(
        help="Inspect improvement artifacts and roll back an applied improvement run.",
    )

    @improvements_app.command("list")
    def list_improvements(
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """List this workspace's improvement artifacts, newest first."""
        from rotaris_core.improvement.persistence import list_improvement_artifacts
        from rotaris_core.improvement.reporting import format_artifact_rows

        workspace_root = (workspace or Path.cwd()).resolve()
        artifacts = list_improvement_artifacts(workspace_root)
        if not artifacts:
            typer.echo(f"No improvement artifacts exist in {workspace_root}.", err=True)
            return
        for row in format_artifact_rows(artifacts):
            typer.echo(row)

    @improvements_app.command("show")
    def show_improvement(
        artifact_id: Annotated[
            str,
            typer.Argument(help="Improvement artifact id, as printed by 'improvements list'."),
        ],
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """Show one artifact's proposals and its recorded version history."""
        from rotaris_core.improvement.history import list_artifact_versions
        from rotaris_core.improvement.persistence import load_improvement_artifact
        from rotaris_core.improvement.reporting import (
            format_history_rows,
            format_proposal_rows,
            format_status_counts,
        )

        workspace_root = (workspace or Path.cwd()).resolve()
        try:
            artifact = load_improvement_artifact(workspace_root, artifact_id)
        except (OSError, ValueError) as exc:
            typer.echo(
                f"No improvement artifact {artifact_id} exists in {workspace_root}.",
                err=True,
            )
            raise typer.Exit(code=2) from exc

        generated = artifact.generated_at.replace(microsecond=0).isoformat()
        typer.echo(f"Artifact {artifact.artifact_id}")
        typer.echo(f"  generated  {generated}")
        typer.echo(f"  session    {artifact.source_session_id}")
        typer.echo(f"  proposals  {format_status_counts(artifact)}")
        point = artifact.rollback_point
        if point is None:
            typer.echo("  rollback   no rollback point recorded")
        else:
            typer.echo(f"  rollback   {point.ref} ({point.commit[:12]})")
        if artifact.rolled_back_at is not None:
            rolled = artifact.rolled_back_at.replace(microsecond=0).isoformat()
            typer.echo(f"  rolled back {rolled}")

        typer.echo("")
        for row in format_proposal_rows(artifact):
            typer.echo(row)

        typer.echo("")
        typer.echo("History:")
        for row in format_history_rows(list_artifact_versions(workspace_root, artifact_id)):
            typer.echo(row)

    @improvements_app.command("rollback")
    def rollback_improvement(
        artifact_id: Annotated[
            str,
            typer.Argument(help="Improvement artifact id whose applied run to undo."),
        ],
        force: Annotated[
            bool,
            typer.Option("--force", help="Overwrite changes made since the improvement run."),
        ] = False,
        yes: Annotated[
            bool,
            typer.Option("--yes", "-y", help="Skip the confirmation prompt."),
        ] = False,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """Undo an applied improvement run, restoring its pre-run workspace."""
        from rotaris_core.improvement.persistence import list_improvement_artifact_ids
        from rotaris_core.improvement.reporting import format_rollback_preview_lines
        from rotaris_core.improvement.rollback import ImprovementRollbackService

        workspace_root = (workspace or Path.cwd()).resolve()
        if artifact_id not in list_improvement_artifact_ids(workspace_root):
            typer.echo(
                f"No improvement artifact {artifact_id} exists in {workspace_root}.",
                err=True,
            )
            raise typer.Exit(code=2)

        service = ImprovementRollbackService(workspace_root)
        preview = service.preview(artifact_id)
        for line in format_rollback_preview_lines(preview):
            typer.echo(line)
        if preview.blocked_reason and not force:
            typer.echo(preview.blocked_reason, err=True)
            raise typer.Exit(code=1)

        if not yes:
            if not _stdin_is_interactive():
                typer.echo("Error: a non-interactive rollback requires --yes.", err=True)
                raise typer.Exit(code=2)
            typer.echo(f"Roll back improvement {artifact_id} in {service.tree_root}? [y/N]")
            if sys.stdin.readline().strip().lower() not in {"y", "yes"}:
                typer.echo("Rollback cancelled.")
                return

        result = service.rollback(artifact_id, force=force)
        if not result.restored:
            typer.echo(result.blocked_reason, err=True)
            raise typer.Exit(code=1)
        typer.echo(
            f"Rolled back improvement {artifact_id}; {len(result.changed_paths)} file(s) changed.",
        )
        if result.reverted_proposal_ids:
            typer.echo(
                f"{len(result.reverted_proposal_ids)} proposal(s) returned to pending_review: "
                f"{', '.join(result.reverted_proposal_ids)}",
            )
        if result.safety_point is not None:
            typer.echo(
                f"Safety checkpoint {result.safety_point.sequence} holds the pre-rollback state.",
            )
        if result.warning:
            # The tree is already back; this is a bookkeeping failure the user
            # has to know about, not a reason to claim the rollback failed.
            typer.echo(result.warning, err=True)

    app.add_typer(improvements_app, name="improvements")
