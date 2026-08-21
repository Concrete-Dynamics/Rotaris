"""``rotaris-cli events`` — list, replay and export stored runs (SWR-2904).

The store (SWR-2901), its query API (SWR-2902) and the trajectory export
(SWR-2903) were reachable only from Python.  This group is the command surface,
and it copies ``checkpoints`` (SWR-2437) and ``improvements`` (SWR-1642) rather
than inventing a third convention: ``register(app)``, an explicit
``--workspace`` defaulting to the current directory, and exit codes CI can
branch on:

* ``0`` — the command did what it said, **including an empty result**.  "This
  run made no tool calls" is an answer a user asked for, not a failure.
* ``2`` — the session has no store in that workspace, or a ``--since`` /
  ``--until`` value could not be parsed.

Two behaviours are load-bearing rather than cosmetic:

* ``replay --json`` writes the store's lines back out byte-for-byte
  (:meth:`~rotaris_core.eventstore.reader.StoredEvent.as_line`), so a stored run
  and a live ``--output-format stream-json`` run are interchangeable inputs to
  the same consumer.
* An event type this build does not know is **displayed**, never dropped and
  never fatal.  The reader already decided that (SWR-2902); re-deciding it here
  would mean a CLI that crashes on a store written by a newer Rotaris.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Annotated

import typer

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from datetime import datetime

    from rotaris_core.eventstore import StoreReadWarning


def _sessions_root(workspace: Path | None) -> tuple[Path, Path]:
    """Resolve ``(workspace_root, sessions_root)`` for a ``--workspace`` option.

    The session directory layout has one owner, ``session.manager``; asking it
    is what keeps this command finding the same sessions ``rotaris run`` writes.
    """
    from rotaris_core.session.manager import SessionManager

    workspace_root = (workspace or Path.cwd()).resolve()
    return workspace_root, SessionManager(workspace_root).sessions_dir


def _resolve_session_dir(session_id: str, workspace: Path | None) -> Path:
    """The session directory for *session_id*, or exit 2 naming the workspace."""
    from rotaris_core.eventstore import resolve_stored_session

    workspace_root, sessions_root = _sessions_root(workspace)
    session_dir = resolve_stored_session(sessions_root, session_id)
    if session_dir is None:
        typer.echo(
            f"No stored session {session_id} exists in {workspace_root}.",
            err=True,
        )
        raise typer.Exit(code=2)
    return session_dir


def _parse_bound(value: str | None, flag: str) -> datetime | None:
    """Parse an ISO-8601 filter bound, or exit 2 saying which flag was wrong."""
    if value is None:
        return None
    from rotaris_core.eventstore import parse_timestamp

    parsed = parse_timestamp(value)
    if parsed is None:
        typer.echo(f"Error: {flag} expects an ISO-8601 timestamp, not {value!r}.", err=True)
        raise typer.Exit(code=2)
    return parsed


def _warn(warning: StoreReadWarning) -> None:
    """Report an unreadable line without failing the command."""
    typer.echo(f"Warning: skipped unreadable event-store {warning}.", err=True)


@traces(SWR.SWR_2904)
def register(app: typer.Typer) -> None:
    events_app = typer.Typer(
        help="Inspect, replay and export the events a finished run left behind.",
    )

    @events_app.command("list")
    def list_sessions(
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """List the sessions that have a stored event history, newest first."""
        from rotaris_core.eventstore import format_stored_session_rows, list_stored_sessions

        workspace_root, sessions_root = _sessions_root(workspace)
        sessions = list_stored_sessions(sessions_root)
        if not sessions:
            typer.echo(f"No session in {workspace_root} has a stored event history.", err=True)
            return
        for row in format_stored_session_rows(sessions):
            typer.echo(row)

    @events_app.command("replay")
    def replay(
        session_id: Annotated[
            str,
            typer.Argument(help="Session id, as printed by 'events list'."),
        ],
        event_types: Annotated[
            list[str] | None,
            typer.Option("--type", "-t", help="Only this event type; repeatable."),
        ] = None,
        iterations: Annotated[
            list[int] | None,
            typer.Option("--iteration", "-i", help="Only this Ralph iteration; repeatable."),
        ] = None,
        since: Annotated[
            str | None,
            typer.Option("--since", help="Only events at or after this ISO-8601 timestamp."),
        ] = None,
        until: Annotated[
            str | None,
            typer.Option("--until", help="Only events at or before this ISO-8601 timestamp."),
        ] = None,
        as_json: Annotated[
            bool,
            typer.Option("--json", help="One JSON event per line, as the live stream emits."),
        ] = False,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """Replay one session's stored events in emission order."""
        from rotaris_core.eventstore import EventQuery, format_replay_row, replay_session

        session_dir = _resolve_session_dir(session_id, workspace)
        query = EventQuery.build(
            event_types=event_types or None,
            iterations=iterations or None,
            since=_parse_bound(since, "--since"),
            until=_parse_bound(until, "--until"),
        )
        # Warnings go to stderr even on the ``--json`` path, so a pipe receives
        # events only and a human still learns the store had a damaged line.
        for stored in replay_session(session_dir, query, on_warning=_warn):
            typer.echo(stored.as_line() if as_json else format_replay_row(stored))

    @events_app.command("export")
    def export(
        session_ids: Annotated[
            list[str],
            typer.Argument(help="One or more session ids; several export as one batch."),
        ],
        output: Annotated[
            Path | None,
            typer.Option("--output", "-o", help="Write here instead of stdout."),
        ] = None,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        """Export stored runs as trajectory documents for an evaluation harness."""
        from rotaris_core.eventstore import (
            batch_document,
            export_session,
            trajectory_document,
            write_trajectories,
            write_trajectory,
        )

        directories = [_resolve_session_dir(session_id, workspace) for session_id in session_ids]
        trajectories = [export_session(directory, on_warning=_warn) for directory in directories]
        for trajectory in trajectories:
            if trajectory.summary.runs > 1:
                # The store is per session (SWR-2901) and a resumed run appends
                # to it, so a resumed session exports as one document covering
                # several runs.  Said out loud, because a harness reading it as
                # a single run would silently sum two runs' totals.
                typer.echo(
                    f"Warning: session {trajectory.session_id} holds "
                    f"{trajectory.summary.runs} runs (it was resumed); this document "
                    "covers all of them, and its identity is the most recent one.",
                    err=True,
                )
            if trajectory.truncated:
                # A warning, not a failure: the export is still the best record
                # of that run, and a harness that refuses partial runs can read
                # the same fact off ``truncated`` in the document.
                typer.echo(
                    f"Warning: session {trajectory.session_id} dropped "
                    f"{trajectory.dropped_events} event(s) to the store cap; "
                    "this export is not the complete run.",
                    err=True,
                )

        single = len(trajectories) == 1
        if output is not None:
            written = (
                write_trajectory(trajectories[0], output)
                if single
                else write_trajectories(trajectories, output)
            )
            typer.echo(f"Wrote {len(trajectories)} trajectory document(s) to {written}.", err=True)
            return

        document = trajectory_document(trajectories[0]) if single else batch_document(trajectories)
        # ``sys.stdout.write`` rather than ``typer.echo``: a multi-megabyte
        # document is written once instead of being re-wrapped line by line.
        sys.stdout.write(json.dumps(document, sort_keys=True, indent=2, default=str) + "\n")

    app.add_typer(events_app, name="events")
