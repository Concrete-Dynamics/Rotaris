"""How a stored run is printed (SWR-2904).

Rotaris has two command surfaces — the Typer CLI and the argparse headless one —
and both must show the same thing, so the rendering lives here rather than in
either of them.  It is also why nothing in this module imports ``typer``: the
headless entry point deliberately pulls in no UI library.

The same reasoning already shaped ``format_checkpoint_rows`` and
``format_artifact_rows``; this is that convention applied to the event store.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable

    from rotaris_core.eventstore.reader import StoredEvent
    from rotaris_core.eventstore.sessions import StoredSession

#: Envelope fields every event carries.  Excluded from a replay row's detail
#: column because the columns beside it already show them.
_ENVELOPE_FIELDS = frozenset({"event", "schema_version", "session_id", "timestamp"})

#: How much of one event's detail a replay row shows.  A tool argument can be a
#: whole file; a listing row cannot.
_DETAIL_LIMIT = 110


def _detail(stored: StoredEvent) -> str:
    """A compact rendering of everything the envelope columns do not show."""
    payload: dict[str, Any] = {
        key: value for key, value in stored.payload.items() if key not in _ENVELOPE_FIELDS
    }
    if not payload:
        return ""
    rendered = json.dumps(payload, sort_keys=True, default=str)
    if len(rendered) > _DETAIL_LIMIT:
        return rendered[: _DETAIL_LIMIT - 1] + "..."
    return rendered


@traces(SWR.SWR_2904)
def format_replay_row(stored: StoredEvent) -> str:
    """One human-readable line per event: when, what, and the rest.

    An unknown type is marked rather than hidden — a user reading a store
    written by a newer build should see that this Rotaris does not recognise the
    record, *and* still see the record (SWR-2902's forward compatibility, not
    re-decided here).
    """
    marker = "" if stored.known else " (unknown)"
    stamp = stored.timestamp or "-"
    return f"  {stamp}  {stored.event_type}{marker}  {_detail(stored)}".rstrip()


def _format_span(session: StoredSession) -> str:
    """The time-span column: ``start -> end``, or ``-`` when unstamped."""
    started = session.started_at
    ended = session.ended_at
    if started is None:
        return "-"
    start_text = started.replace(microsecond=0).isoformat()
    if ended is None or ended == started:
        return start_text
    return f"{start_text} -> {ended.replace(microsecond=0).isoformat()}"


@traces(SWR.SWR_2904)
def format_stored_session_rows(sessions: Iterable[StoredSession]) -> list[str]:
    """Render the ``events list`` table, one aligned row per session.

    The truncation suffix is not decoration: an event count read off a capped
    store counts what *survived*, and printing it bare would let a user mistake
    a trimmed history for a whole run.
    """
    rows = list(sessions)
    if not rows:
        return []
    width = max(len(session.session_id) for session in rows)
    lines: list[str] = []
    for session in rows:
        suffix = f"  truncated (-{session.dropped_events})" if session.truncated else ""
        lines.append(
            f"  {session.session_id.ljust(width)}  "
            f"{session.event_count:>6} events  {_format_span(session)}{suffix}",
        )
    return lines
