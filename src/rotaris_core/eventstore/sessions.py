"""Finding and summarizing the sessions that have a store (SWR-2904).

``events list`` needs one thing the reader, the query API and the exporter do not
provide: *which* sessions can be replayed at all, and enough of a summary to pick
one — how many events, over what time span, and whether the cap dropped any.

Deliberately given a **sessions root**, not a workspace: the fact that a
workspace keeps its sessions in ``.rotaris/sessions`` belongs to
``session.manager``, and re-deriving it here would be a third copy of a layout
that has one owner.  The caller passes the directory; this module only knows
that each entry inside it is a session directory that may contain a store.

Summarizing streams the store rather than loading it (the reader's guarantee),
so listing a workspace with a very long session costs one pass and no memory
spike.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from rotaris_core.eventstore.query import parse_timestamp
from rotaris_core.eventstore.writer import event_store_path, read_store_metadata
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

#: Sort key for a session whose events carry no usable timestamp at all.  Older
#: than anything real, so a damaged store sorts last instead of first.
_NO_TIMESTAMP = datetime.min.replace(tzinfo=UTC)


@traces(SWR.SWR_2904)
@dataclass(frozen=True, slots=True)
class StoredSession:
    """One replayable session, as ``events list`` describes it.

    ``truncated`` is carried alongside the count on purpose: an event count read
    off a capped store is a count of what *survived*, and presenting it without
    the flag would let a user mistake a trimmed history for the whole run.
    """

    session_id: str
    session_dir: Path
    event_count: int = 0
    first_timestamp: str = ""
    last_timestamp: str = ""
    truncated: bool = False
    dropped_events: int = 0

    @property
    def started_at(self) -> datetime | None:
        """When the first surviving event happened, if it says."""
        return parse_timestamp(self.first_timestamp)

    @property
    def ended_at(self) -> datetime | None:
        """When the last surviving event happened, if it says."""
        return parse_timestamp(self.last_timestamp)

    @property
    def sort_key(self) -> datetime:
        """Recency, for "newest first"; missing stamps sort oldest."""
        return self.ended_at or self.started_at or _NO_TIMESTAMP


@traces(SWR.SWR_2904)
def has_event_store(session_dir: Path | str) -> bool:
    """Whether *session_dir* has a store file at all.

    An *empty* store still counts: a session that started and emitted nothing is
    a session a user can ask about, and hiding it would make "the run left no
    trace" indistinguishable from "there is no such run".
    """
    return event_store_path(Path(session_dir)).exists()


def _stamp_of(line: str) -> str:
    """The ``timestamp`` of one stored line, or ``""`` if it has none.

    Defensive rather than strict: a listing must survive the half-written final
    line a killed run leaves behind, and losing one bound of a time span is a far
    better outcome than refusing to list the session at all.
    """
    try:
        payload = json.loads(line)
    except ValueError:
        return ""
    if not isinstance(payload, dict):
        return ""
    stamp = payload.get("timestamp")
    return stamp if isinstance(stamp, str) else ""


@traces(SWR.SWR_2904)
def summarize_stored_session(
    session_dir: Path | str,
    *,
    session_id: str = "",
) -> StoredSession:
    """Count and time-span one session's store in a single streaming pass.

    Deliberately **not** built on :func:`read_session_events`: a listing needs a
    line count and two timestamps, and decoding every event to get them costs one
    ``json.loads`` per stored event per session — a workspace of long sessions
    would parse millions of objects before printing its first row.  So the pass
    counts lines and decodes only the first and the last one.

    The consequence is stated rather than hidden: the count is *stored lines*,
    which for a store written only by ``serialize_event`` is the event count.  A
    run killed mid-write can leave one unparseable line that this counts and
    ``replay`` skips; a chooser being one off on a damaged store is worth the two
    orders of magnitude, and the exact number is what ``export`` reports.
    """
    directory = Path(session_dir)
    count = 0
    first_line = ""
    last_line = ""
    path = event_store_path(directory)
    try:
        with path.open(encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line:
                    continue
                count += 1
                if not first_line:
                    first_line = line
                last_line = line
    except OSError:
        # A store that cannot be read is an empty one here, exactly as the
        # reader treats it: a listing must never fail on one bad session.
        _log.warning("Could not read the event store at %s.", path, exc_info=True)

    metadata = read_store_metadata(directory)
    return StoredSession(
        session_id=session_id or directory.name,
        session_dir=directory,
        event_count=count,
        first_timestamp=_stamp_of(first_line) if first_line else "",
        last_timestamp=_stamp_of(last_line) if last_line else "",
        truncated=metadata.truncated,
        dropped_events=metadata.dropped_events,
    )


@traces(SWR.SWR_2904)
def list_stored_sessions(sessions_root: Path | str) -> list[StoredSession]:
    """Every session under *sessions_root* that has a store, newest first.

    A missing root is an empty list, not an error: a workspace where nothing has
    run yet is a normal thing to ask about.
    """
    root = Path(sessions_root)
    if not root.is_dir():
        return []
    sessions = [
        summarize_stored_session(child)
        for child in sorted(root.iterdir())
        if child.is_dir() and has_event_store(child)
    ]
    # ``session_id`` breaks ties so two sessions written in the same second — or
    # two empty stores with no stamps at all — still list in a stable order.
    sessions.sort(key=lambda session: (session.sort_key, session.session_id), reverse=True)
    return sessions


@traces(SWR.SWR_2904)
def resolve_stored_session(sessions_root: Path | str, session_id: str) -> Path | None:
    """The session directory for *session_id*, or ``None`` if it has no store.

    *session_id* is untrusted input from a command line, so it is resolved and
    checked to be **inside** *sessions_root* before anything is read.  Without
    that, ``pathlib`` would honour an absolute path (it discards the left
    operand) and would not normalise ``..``, so ``events replay
    ../../elsewhere/.rotaris/sessions/<id> -w .`` would print a store from
    outside the workspace the user named — while ``--workspace`` and the
    not-found message both promise the command is scoped to it.
    """
    if not session_id:
        return None
    root = Path(sessions_root)
    candidate = root / session_id
    try:
        resolved = candidate.resolve()
        if not resolved.is_relative_to(root.resolve()):
            return None
    except OSError:
        return None
    if not resolved.is_dir() or not has_event_store(resolved):
        return None
    return resolved
