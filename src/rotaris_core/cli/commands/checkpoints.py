"""``rotaris-cli checkpoints`` — list and restore a session's checkpoints.

Rotaris is the primary interface for SWR-2437; this is the headless equivalent
of the same two calls into
:class:`rotaris_core.session.checkpoint_restore.CheckpointRestorer`, so the CLI
and the desktop app cannot drift apart on what a restore does.

``restore`` is destructive, so it refuses to run unattended without ``--yes``
rather than blocking on a pipe that will never answer.
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


@traces(SWR.SWR_2437)
def register(app: typer.Typer) -> None:
    checkpoints_app = typer.Typer(help="Inspect and roll back a session's checkpoints.")

    @checkpoints_app.command("list")
    def list_checkpoints(
        session: Annotated[
            str,
            typer.Option("--session", "-s", help="Session id whose checkpoints to list."),
        ],
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """List the checkpoints recorded for a session."""
        from rotaris_core.session.checkpoint_restore import (
            CheckpointRestorer,
            format_checkpoint_rows,
        )
        from rotaris_core.session.manager import SessionManager

        workspace_root = (workspace or Path.cwd()).resolve()
        restorer = CheckpointRestorer(
            session_manager=SessionManager(workspace_root),
            session_id=session,
        )
        recorded = restorer.list_checkpoints()
        if not recorded:
            typer.echo(f"No checkpoints are recorded for session {session}.", err=True)
            return
        for row in format_checkpoint_rows(recorded):
            typer.echo(row)

    @checkpoints_app.command("restore")
    def restore(
        session: Annotated[
            str,
            typer.Option("--session", "-s", help="Session id to roll back."),
        ],
        sequence: Annotated[
            int,
            typer.Option("--sequence", help="Checkpoint sequence number to restore."),
        ],
        force: Annotated[
            bool,
            typer.Option("--force", help="Overwrite uncommitted changes that are in the way."),
        ] = False,
        yes: Annotated[
            bool,
            typer.Option("--yes", "-y", help="Skip the confirmation prompt."),
        ] = False,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """Restore a session's working tree to one of its checkpoints."""
        from rotaris_core.session.checkpoint_restore import (
            CheckpointRestorer,
            format_preview_lines,
        )
        from rotaris_core.session.manager import SessionManager

        workspace_root = (workspace or Path.cwd()).resolve()
        restorer = CheckpointRestorer(
            session_manager=SessionManager(workspace_root),
            session_id=session,
        )
        preview = restorer.preview(sequence)
        if preview is None:
            typer.echo(
                f"No checkpoint {sequence} is recorded for session {session}.",
                err=True,
            )
            raise typer.Exit(code=2)

        for line in format_preview_lines(preview):
            typer.echo(line)
        if preview.blocked_reason and not force:
            # Refuse through the restorer rather than here, so the refusal lands
            # in the session's audit trail exactly as an unattended one would.
            # Asking to confirm something already known to be doomed would be
            # worse than paying for the second inspection.
            typer.echo(restorer.restore(sequence, force=force).blocked_reason, err=True)
            raise typer.Exit(code=1)

        if not yes:
            if not _stdin_is_interactive():
                typer.echo("Error: a non-interactive restore requires --yes.", err=True)
                raise typer.Exit(code=2)
            typer.echo(f"Restore checkpoint {sequence} into {restorer.tree_root}? [y/N]")
            if sys.stdin.readline().strip().lower() not in {"y", "yes"}:
                typer.echo("Restore cancelled.")
                return

        result = restorer.restore(sequence, force=force)
        if not result.restored:
            typer.echo(result.blocked_reason, err=True)
            raise typer.Exit(code=1)
        typer.echo(f"Restored checkpoint {sequence}; {len(result.changed_paths)} file(s) changed.")
        if result.safety_checkpoint is not None:
            typer.echo(
                f"Safety checkpoint {result.safety_checkpoint.sequence} holds the "
                f"pre-restore state."
            )
        else:
            typer.echo(
                "No safety checkpoint was needed: the working tree already matched the last commit."
            )

    app.add_typer(checkpoints_app, name="checkpoints")
