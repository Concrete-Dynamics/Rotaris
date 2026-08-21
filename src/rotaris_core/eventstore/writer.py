"""Durable per-session event store — the writing half (SWR-2901).

Every event a run emits is appended to ``<session_dir>/evidence/events.jsonl``,
one serialized event per line, in emission order.  The file deliberately follows
the convention the other evidence files already established
(``evidence/permissions.jsonl``, ``evidence/tool-calls.jsonl``) rather than
inventing a second one: same directory, same JSONL shape, same
:func:`~rotaris_core.fs.atomic_write` primitive for the rewriting path, same
module-level lock as ``session.diagnostics._append_jsonl``.

A line is exactly what :func:`~rotaris_core.events.schema.serialize_event`
produces, so a consumer that can read the stdout stream (SWR-1828) can read the
store, and vice versa.

Two properties are load-bearing:

* **The store never fails a run.**  Every public entry point swallows its
  exceptions into a logged warning and reports failure through a return value.
  Losing a stored event is acceptable; failing a run because of the store is
  not.
* **Growth is bounded.**  Past ``max_events`` the oldest lines are dropped, and
  the fact that lines were dropped is recorded in a sidecar
  ``evidence/events.meta.json`` so a reader can never mistake a truncated
  history for a complete one.  The marker lives beside the store rather than
  inside it, because a marker line inside the JSONL would break the "every line
  is a wire event" promise the reader and the exporter both rely on.

Sessions bind late, exactly like the event bus (SWR-1828) and the permission
audit log (SWR-2506): a module-level registry behind an ``RLock`` with
register / resolve / discard / reset, so a writer several layers deep can
address a session without a store threaded through every constructor.

Kept import-light on purpose (same reason as ``rotaris_core.events``): nothing
here reaches ``rotaris_core.tools`` or ``rotaris_core.config``, both of which
drag in the agent SDK.
"""

from __future__ import annotations

import json
import logging
import threading
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from typing import TYPE_CHECKING, Any

from rotaris_core.events.schema import serialize_event
from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.events.schema import RotarisEvent

_log = logging.getLogger(__name__)

#: The store itself: one serialized event per line, in emission order.
EVENT_STORE_FILENAME = "events.jsonl"

#: The truncation marker.  Absent means "nothing was ever dropped".
EVENT_STORE_METADATA_FILENAME = "events.meta.json"

#: Default per-session cap.  Generous enough that an ordinary run never trims,
#: small enough that a runaway loop cannot fill a disk.
DEFAULT_MAX_EVENTS = 20_000

#: How far past the cap the file may grow before a trim runs, as a fraction of
#: the cap.  A trim rewrites the whole file, so trimming on *every* append past
#: the cap would make each append O(max_events).  Deriving the slack from the
#: cap instead amortizes that to a constant — roughly ``_TRIM_SLACK_DIVISOR``
#: lines rewritten per appended event — at any cap size, and keeps a small cap
#: exact (a cap under the divisor has no slack at all).
_TRIM_SLACK_DIVISOR = 8

#: One lock for every store, mirroring ``session.diagnostics``: two writers on
#: one file can interleave mid-line, and a trim rewrites a file another writer
#: may be appending to.
_WRITE_LOCK = threading.Lock()

_stores_lock = RLock()
_stores: dict[str, SessionEventStore] = {}


@traces(SWR.SWR_2901)
def evidence_dir(session_dir: Path) -> Path:
    """The session's evidence directory — where the other JSONL evidence lives."""
    return session_dir / "evidence"


@traces(SWR.SWR_2901)
def event_store_path(session_dir: Path) -> Path:
    """Path of the event store for *session_dir*."""
    return evidence_dir(session_dir) / EVENT_STORE_FILENAME


@traces(SWR.SWR_2901)
def event_store_metadata_path(session_dir: Path) -> Path:
    """Path of the truncation marker that accompanies the store."""
    return evidence_dir(session_dir) / EVENT_STORE_METADATA_FILENAME


@traces(SWR.SWR_2901)
def resolve_store_session_id(session_dir: Path | None, session_id: str = "") -> str:
    """Resolve the session key a store registers under.

    Mirrors ``session.diagnostics.bus_session_id`` and
    ``permissions.audit`` deliberately — an explicit id wins, the session
    directory's name is the fallback, because that name *is* the session id
    everywhere in this codebase.  Duplicated here rather than imported so this
    package stays free of the session/agent import graph.

    Returns ``""`` when neither is available; :func:`store_event` treats that as
    a silent no-op, so a caller never has to guard.
    """
    resolved = session_id.strip()
    if resolved:
        return resolved
    return session_dir.name if session_dir is not None else ""


@traces(SWR.SWR_2901)
@dataclass(frozen=True, slots=True)
class StoreMetadata:
    """What the store knows about itself beyond its lines.

    ``truncated`` is the one fact a reader must never miss: a capped store holds
    the *newest* events, and presenting that as a complete run would be a lie.
    """

    truncated: bool = False
    dropped_events: int = 0
    max_events: int | None = None
    last_trimmed_at: str = ""

    def to_payload(self) -> dict[str, Any]:
        """Render as the JSON object stored in ``events.meta.json``."""
        return {
            "truncated": self.truncated,
            "dropped_events": self.dropped_events,
            "max_events": self.max_events,
            "last_trimmed_at": self.last_trimmed_at,
        }

    @classmethod
    def from_payload(cls, payload: Any) -> StoreMetadata:
        """Rebuild from a decoded sidecar, tolerating anything malformed."""
        if not isinstance(payload, dict):
            return cls()
        dropped = payload.get("dropped_events", 0)
        max_events = payload.get("max_events")
        return cls(
            truncated=bool(payload.get("truncated", False)),
            dropped_events=int(dropped) if isinstance(dropped, int) else 0,
            max_events=max_events if isinstance(max_events, int) else None,
            last_trimmed_at=str(payload.get("last_trimmed_at", "")),
        )


@traces(SWR.SWR_2901)
def read_store_metadata(target: Path) -> StoreMetadata:
    """Read the truncation marker for a session directory or a store path.

    Accepts either the session directory or the ``events.jsonl`` path itself, so
    a caller holding only one of the two never has to reconstruct the other.  A
    missing or unreadable marker means "nothing was dropped" — the common case,
    and never an error.
    """
    if target.name == EVENT_STORE_METADATA_FILENAME:
        meta_path = target
    elif target.name == EVENT_STORE_FILENAME:
        meta_path = target.parent / EVENT_STORE_METADATA_FILENAME
    else:
        meta_path = event_store_metadata_path(target)
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return StoreMetadata()
    return StoreMetadata.from_payload(payload)


@traces(SWR.SWR_2901)
class SessionEventStore:
    """Append-only JSONL store for one session's events.

    Args:
        session_dir: The session directory; the store lands in its
            ``evidence/`` sub-directory.
        session_id: Explicit session id.  Falls back to the directory name, the
            same resolution the bus and the audit log use.
        max_events: Cap on retained lines.  ``None`` — and only ``None`` —
            disables trimming, which is what a test or a short-lived tool wants;
            a run always sets a number.  A non-positive cap is rejected rather
            than quietly read as "unbounded", because a config value of ``0``
            means "keep nothing" to everyone who writes it and unlimited growth
            is the opposite of what they asked for.

    Every method except the constructor is failure-isolated: nothing raises into
    the caller.  A bad ``max_events`` is a programming error, not a runtime one,
    so it is the one thing that does raise.
    """

    __slots__ = (
        "_dropped",
        "_line_count",
        "_max_events",
        "_meta_path",
        "_path",
        "_session_id",
    )

    def __init__(
        self,
        session_dir: Path,
        *,
        session_id: str = "",
        max_events: int | None = DEFAULT_MAX_EVENTS,
    ) -> None:
        if max_events is not None and max_events <= 0:
            raise ValueError("max_events must be positive; pass None for an unbounded store.")
        self._path = event_store_path(session_dir)
        self._meta_path = event_store_metadata_path(session_dir)
        self._session_id = resolve_store_session_id(session_dir, session_id)
        self._max_events = max_events
        self._line_count: int | None = None
        # ``None`` means "not read from disk yet".  Seeding it lazily rather than
        # in the constructor keeps the constructor free of I/O *and* keeps the
        # count cumulative: a second store opened over a session that was
        # already trimmed must not reset the total back to zero, or the sidecar
        # — and every export built from it — would under-report the loss.
        self._dropped: int | None = None

    @property
    def session_id(self) -> str:
        """The key this store registers under."""
        return self._session_id

    @property
    def path(self) -> Path:
        """Where the JSONL lines land."""
        return self._path

    @property
    def metadata_path(self) -> Path:
        """Where the truncation marker lands."""
        return self._meta_path

    @property
    def max_events(self) -> int | None:
        """The configured cap, or ``None`` when growth is unbounded."""
        return self._max_events

    @property
    def dropped_events(self) -> int:
        """How many lines this session has lost to the cap, ever.

        Cumulative across store instances: a session re-opened after an earlier
        run trimmed it still reports the earlier loss, because a reader asking
        "how much history is missing" means the file, not this object.
        """
        with _WRITE_LOCK:
            return self._dropped_total_locked()

    @traces(SWR.SWR_2901)
    def initialize(self) -> bool:
        """Create the evidence directory and an empty store if absent.

        Mirrors ``initialize_session_diagnostics``, which creates the other
        evidence files up front so an inspector finds a session's full shape
        even before anything was written.  Returns ``False`` on failure.
        """
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            if not self._path.exists():
                atomic_write(self._path, "")
        except Exception:  # noqa: BLE001 - the store must never fail a run
            _log.warning("Could not initialize the event store at %s.", self._path, exc_info=True)
            return False
        return True

    @traces(SWR.SWR_2901)
    def append(self, event: RotarisEvent) -> bool:
        """Append one event as exactly one line.  Returns whether it landed.

        Serialization happens outside the lock: an unserializable event is a bug
        in the event, not a reason to hold up every other session's writer.
        """
        try:
            line = serialize_event(event)
        except Exception:  # noqa: BLE001 - one bad event must not end the store
            _log.warning(
                "Dropping an unserializable %r event from the store.",
                getattr(event, "event", "?"),
                exc_info=True,
            )
            return False
        return self.append_line(line)

    @traces(SWR.SWR_2901)
    def append_line(self, line: str) -> bool:
        """Append one already-serialized event line.  Never raises.

        The newline check is the same one :func:`serialize_event` makes: one
        event is one line, and a smuggled line break would silently turn one
        stored event into two unreadable halves.
        """
        if "\n" in line or "\r" in line:
            _log.warning("Refusing to store an event line containing a line break.")
            return False
        try:
            with _WRITE_LOCK:
                self._append_locked(line)
        except Exception:  # noqa: BLE001 - a full disk must not fail a run
            _log.warning("Could not append an event to %s.", self._path, exc_info=True)
            return False
        return True

    @traces(SWR.SWR_2901)
    def metadata(self) -> StoreMetadata:
        """The truncation state of this store, as a reader would see it."""
        with _WRITE_LOCK:
            dropped = self._dropped_total_locked()
        return StoreMetadata(
            truncated=dropped > 0,
            dropped_events=dropped,
            max_events=self._max_events,
        )

    def _dropped_total_locked(self) -> int:
        """Total dropped lines, seeded from the sidecar on first use."""
        if self._dropped is None:
            self._dropped = read_store_metadata(self._meta_path).dropped_events
        return self._dropped

    def _append_locked(self, line: str) -> None:
        """Write one line and trim if the file has outgrown its cap."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # ``newline=""`` so an appended line ends in the same single ``\n``
        # ``atomic_write`` produces.  Without it Python's text mode would
        # translate to CRLF on Windows and a trimmed store would end up with
        # mixed line endings — which breaks the promise that a stored line is
        # byte-for-byte what ``serialize_event`` returned.
        with self._path.open("a", encoding="utf-8", newline="") as handle:
            handle.write(line + "\n")

        if self._max_events is None:
            return
        if self._line_count is None:
            self._line_count = self._count_lines()
        else:
            self._line_count += 1
        slack = self._max_events // _TRIM_SLACK_DIVISOR
        if self._line_count > self._max_events + slack:
            self._trim_locked()

    def _count_lines(self) -> int:
        """Count non-empty lines currently in the store."""
        total = 0
        with self._path.open(encoding="utf-8") as handle:
            for existing in handle:
                if existing.strip():
                    total += 1
        return total

    def _trim_locked(self) -> None:
        """Drop the oldest lines, keep the newest ``max_events``, mark the loss.

        The bounded ``deque`` is the same ring buffer
        ``session.diagnostics._append_jsonl`` uses, and the rewrite goes through
        ``atomic_write`` so a crash mid-trim cannot leave a half-written store.
        Recounting from the file (rather than trusting the running counter) is
        what keeps the cap honest if anything else ever appended to this path.

        The counters are updated only *after* the rewrite succeeded: on a full
        disk the rewrite raises, and a counter claiming the file was already
        trimmed would under-enforce the cap from then on.
        """
        if self._max_events is None:  # pragma: no cover - guarded by the caller
            return
        kept: deque[str] = deque(maxlen=self._max_events)
        total = 0
        with self._path.open(encoding="utf-8") as handle:
            for existing in handle:
                stripped = existing.rstrip("\n").rstrip("\r")
                if stripped:
                    total += 1
                    kept.append(stripped)
        dropped = total - len(kept)
        if dropped <= 0:
            self._line_count = total
            return
        # Read before the write: the sidecar may already record an earlier run's
        # losses, and this trim adds to them rather than replacing them.
        previous = self._dropped_total_locked()
        atomic_write(self._path, "\n".join(kept) + "\n")
        self._line_count = len(kept)
        self._dropped = previous + dropped
        self._write_metadata_locked(self._dropped)

    def _write_metadata_locked(self, dropped: int) -> None:
        """Record that a truncation happened, next to the store."""
        payload = StoreMetadata(
            truncated=True,
            dropped_events=dropped,
            max_events=self._max_events,
            last_trimmed_at=datetime.now(UTC).isoformat(),
        ).to_payload()
        atomic_write(self._meta_path, json.dumps(payload, sort_keys=True, default=str) + "\n")


@traces(SWR.SWR_2901)
def open_session_store(
    session_dir: Path | str,
    *,
    session_id: str = "",
    max_events: int | None = DEFAULT_MAX_EVENTS,
    initialize: bool = True,
) -> SessionEventStore:
    """Build (and by default create) the store for one session directory."""
    store = SessionEventStore(Path(session_dir), session_id=session_id, max_events=max_events)
    if initialize:
        store.initialize()
    return store


@traces(SWR.SWR_2901)
def register_event_store(session_id: str, store: SessionEventStore) -> None:
    """Publish where one session's events are persisted; replaces any previous store."""
    if not session_id:
        raise ValueError("An event store needs a non-empty session id.")
    with _stores_lock:
        _stores[session_id] = store


@traces(SWR.SWR_2901)
def resolve_event_store(session_id: str | None) -> SessionEventStore | None:
    """Return the store registered for *session_id*, or ``None``.

    Never falls back to another session's store: one run's history must not land
    in another run's file.
    """
    if not session_id:
        return None
    with _stores_lock:
        return _stores.get(session_id)


@traces(SWR.SWR_2901)
def discard_event_store(session_id: str | None) -> None:
    """Stop persisting for *session_id* once its run is over."""
    if not session_id:
        return
    with _stores_lock:
        _stores.pop(session_id, None)


@traces(SWR.SWR_2901)
def reset_event_store_registry() -> None:
    """Clear every registration (test isolation and full-process shutdown)."""
    with _stores_lock:
        _stores.clear()


@traces(SWR.SWR_2901)
def store_event(session_id: str | None, event: RotarisEvent) -> bool:
    """Persist *event* into the session's store, if one is registered.

    Silent when no store is registered — every existing test and the desktop app
    run without one and must neither pay for the store nor crash because of it —
    and forgiving when the store fails, for the same reason
    ``events.bus.publish`` is.
    """
    store = resolve_event_store(session_id)
    if store is None:
        return False
    return store.append(event)
