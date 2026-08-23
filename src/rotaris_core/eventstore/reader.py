"""Reading a stored session back, without re-running anything (SWR-2902).

Three guarantees shape every function here:

* **Streaming.**  Reading is a generator over lines, never a full-file load.  A
  long session must be traversable — and filterable — without materializing its
  whole history, so nothing in this module calls ``read_text``.
* **Forward compatibility.**  A line whose ``event`` discriminator this build
  does not know comes back as a :class:`StoredEvent` with ``known=False`` and
  its raw payload intact.  It is never dropped and never raises.  This is not a
  nicety: event types arrive incrementally (SWR-1831), and a reader written
  before them must still read a store written after them — as must an older
  build reading a newer store.  Strict model reconstruction stays available
  through :func:`read_event_models` for callers that want it.
* **Read-only.**  Nothing here rewrites, compacts or repairs the store.  A
  corrupt or truncated final line — a run killed mid-write — is skipped with a
  warning and leaves the file exactly as it was.
* **Resumable.**  :func:`tail_events` reads only what was appended after a
  recorded byte position, so following a session still being written costs what
  it wrote rather than what it has written in total (SWR-2454).  It is the one
  path that treats a partial trailing line as ordinary rather than as damage:
  a live run is mid-``write``, and that line is read once it is whole.

The set of known event types is derived from the schema's discriminated union
at import time rather than hard-coded, so a new event class becomes "known"
the moment it joins the union.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, get_args

from rotaris_core.events.schema import AnyEvent
from rotaris_core.eventstore.writer import event_store_path
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Iterator

_log = logging.getLogger(__name__)

#: How much of an unreadable line a warning quotes.  Enough to recognize it,
#: little enough that a megabyte of garbage does not land in a log file.
_EXCERPT_LIMIT = 200


def _discover_known_event_types() -> frozenset[str]:
    """Read the ``event`` literals out of the schema's discriminated union.

    Derived rather than listed: a hard-coded set would silently classify a newly
    added event type as unknown, which is the exact failure this module exists
    to prevent.
    """
    args = get_args(AnyEvent)
    union = args[0] if args else AnyEvent
    names: set[str] = set()
    for member in get_args(union):
        fields = getattr(member, "model_fields", None)
        if not fields:
            continue
        field = fields.get("event")
        default = getattr(field, "default", None)
        if isinstance(default, str) and default:
            names.add(default)
    return frozenset(names)


#: Every ``event`` value this build can reconstruct into a typed model.
KNOWN_EVENT_TYPES: frozenset[str] = _discover_known_event_types()


@traces(SWR.SWR_2902)
@dataclass(frozen=True, slots=True)
class StoreReadWarning:
    """One line the reader could not use, and why.

    Carried as data rather than only logged so a caller — an exporter, a CLI, a
    test — can count and report damage instead of grepping log output.
    """

    line_number: int
    reason: str
    excerpt: str = ""

    def __str__(self) -> str:
        return f"line {self.line_number}: {self.reason}"


@traces(SWR.SWR_2902)
@dataclass(frozen=True, slots=True)
class StoredEvent:
    """One event read back from the store.

    ``payload`` is the decoded JSON object exactly as it was written — the raw
    record, never re-serialized through a model, so an unknown event's fields
    survive a round trip through a build that has never heard of them.

    ``known`` is the distinguishing flag: ``True`` when :attr:`event_type` is a
    discriminator this build can reconstruct (see :meth:`as_model`), ``False``
    for an opaque record from a newer — or older — writer.
    """

    payload: dict[str, Any]
    line_number: int = 0
    known: bool = True

    @classmethod
    def from_payload(cls, payload: dict[str, Any], line_number: int = 0) -> StoredEvent:
        """Wrap a decoded object, classifying it against the known union."""
        event_type = payload.get("event")
        known = isinstance(event_type, str) and event_type in KNOWN_EVENT_TYPES
        return cls(payload=payload, line_number=line_number, known=known)

    @property
    def event_type(self) -> str:
        """The ``event`` discriminator, or ``""`` when the line carried none."""
        value = self.payload.get("event")
        return value if isinstance(value, str) else ""

    @property
    def session_id(self) -> str:
        """The envelope's session id, or ``""``."""
        value = self.payload.get("session_id")
        return value if isinstance(value, str) else ""

    @property
    def timestamp(self) -> str:
        """The envelope's ISO-8601 stamp, or ``""``."""
        value = self.payload.get("timestamp")
        return value if isinstance(value, str) else ""

    @property
    def schema_version(self) -> int | None:
        """The envelope's schema version, or ``None`` when absent/malformed."""
        value = self.payload.get("schema_version")
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    @property
    def iteration(self) -> int | None:
        """The Ralph iteration this event belongs to, when it carries one."""
        value = self.payload.get("iteration")
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    @traces(SWR.SWR_2902, SWR.SWR_2904)
    def as_line(self) -> str:
        """Re-render this record as the JSONL line it was written as.

        Byte-identical to what :func:`~rotaris_core.events.schema.serialize_event`
        produced — same separators, same key sorting, same ASCII escaping — which
        is what lets ``events replay --json`` feed the very tooling that consumes
        the live stream.  Rendered from the raw payload rather than from a
        reconstructed model, so an unknown event round-trips too.
        """
        return json.dumps(self.payload, separators=(",", ":"), sort_keys=True, default=str)

    @traces(SWR.SWR_2902)
    def as_model(self) -> AnyEvent:
        """Reconstruct the typed event model — the explicit strict path.

        Raises ``pydantic.ValidationError`` for an unknown discriminator.  That
        is the opt-in: the default read path returns this record opaque instead,
        and a caller asking for a model is asking to be told when it cannot have
        one.
        """
        from rotaris_core.events.schema import parse_event

        return parse_event(self.payload)


def _emit_warning(
    warning: StoreReadWarning,
    on_warning: Callable[[StoreReadWarning], None] | None,
) -> None:
    """Report a skipped line: to the caller if it asked, to the log otherwise."""
    _log.warning("Skipping unreadable event-store %s (%r).", warning, warning.excerpt)
    if on_warning is not None:
        on_warning(warning)


def _iter_lines(source: Path | str | Iterable[str]) -> Iterator[tuple[int, str]]:
    """Yield ``(line_number, line)`` lazily from a path or any line iterable.

    A missing store is an empty session, not an error: a run that emitted
    nothing, or a session inspected before its first event, both read as zero
    events.  An unreadable one *is* worth a warning, but still not an exception.
    """
    if isinstance(source, str | Path):
        path = Path(source)
        if not path.exists():
            return
        try:
            handle = path.open(encoding="utf-8")
        except OSError:
            _log.warning("Could not open the event store at %s.", path, exc_info=True)
            return
        with handle:
            for number, line in enumerate(handle, start=1):
                yield number, line
        return
    for number, line in enumerate(source, start=1):
        yield number, line


def _decode_line(
    line: str,
    line_number: int,
    on_warning: Callable[[StoreReadWarning], None] | None,
) -> StoredEvent | None:
    """Turn one raw line into a :class:`StoredEvent`, or warn and return ``None``."""
    stripped = line.strip()
    if not stripped:
        return None
    excerpt = stripped[:_EXCERPT_LIMIT]
    try:
        payload = json.loads(stripped)
    except ValueError as exc:
        # The truncated-tail case: a run killed mid-write leaves a partial JSON
        # fragment.  Every preceding event is still perfectly good.
        _emit_warning(StoreReadWarning(line_number, f"not valid JSON ({exc})", excerpt), on_warning)
        return None
    if not isinstance(payload, dict):
        _emit_warning(StoreReadWarning(line_number, "not a JSON object", excerpt), on_warning)
        return None
    if not isinstance(payload.get("event"), str) or not payload["event"]:
        # No discriminator at all is malformed, not "unknown": there is nothing
        # for a consumer to dispatch on, so the line is not an event.
        _emit_warning(
            StoreReadWarning(line_number, "no 'event' discriminator", excerpt),
            on_warning,
        )
        return None
    return StoredEvent.from_payload(payload, line_number)


@traces(SWR.SWR_2902)
def read_events(
    source: Path | str | Iterable[str],
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> Iterator[StoredEvent]:
    """Stream a store's events in emission order.

    Args:
        source: The store path, or any iterable of lines.  The iterable form is
            what makes this usable over a socket, a captured stdout stream or a
            test fixture without a file.
        on_warning: Called for each skipped line.  Defaults to logging only.

    Unknown event types are yielded opaque (``known=False``); corrupt lines are
    skipped with a warning.  Nothing raises.
    """
    for line_number, line in _iter_lines(source):
        stored = _decode_line(line, line_number, on_warning)
        if stored is not None:
            yield stored


@traces(SWR.SWR_2902)
def read_session_events(
    session_dir: Path | str,
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> Iterator[StoredEvent]:
    """Stream the store of one session directory in emission order."""
    return read_events(event_store_path(Path(session_dir)), on_warning=on_warning)


@traces(SWR.SWR_2902, SWR.SWR_2454)
@dataclass(frozen=True, slots=True)
class StoreTail:
    """What a store gained since a caller last looked, and where it now ends.

    ``offset`` is what the *next* call passes back in.  It is a byte position and
    it is only ever placed after a completed line, which is the whole reason this
    type exists rather than a plain list: a store is appended to by a live run, so
    a read can land mid-line, and a caller that remembered the end of the file
    would resume in the middle of an event and lose it.
    """

    events: tuple[StoredEvent, ...]
    offset: int
    #: The file no longer contains what was read before — it shrank, or a new
    #: session reused the path.  ``events`` then holds the file read from the
    #: beginning, and a caller holding derived state must discard it rather than
    #: append to it.
    restarted: bool = False


@traces(SWR.SWR_2902, SWR.SWR_2454)
def tail_events(
    path: Path | str,
    offset: int = 0,
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> StoreTail:
    """Read only what was appended to a store after *offset*.

    The incremental counterpart to :func:`read_events`: following a session that
    is still being written costs what the session wrote, not what it has written
    in total.  That is what lets a viewer watch a run in another process without
    re-reading its whole history on every look (SWR-2454) — the session state
    files are rewritten whole and offer no such position.

    Three cases, and each is a normal answer rather than an error:

    * **Nothing new.**  Empty events, the same offset back.
    * **A partial trailing line.**  A run mid-``write``.  The complete lines are
      returned and the offset stops before the fragment, so the next call reads
      that line once it is whole.  A partial line is never warned about — it is
      not damage, it is a file being written — which is what distinguishes this
      from :func:`read_events`, whose truncated tail really is a killed run.
    * **The store no longer contains what was read.**  The cap dropped its
      oldest lines (SWR-2901), or the file was replaced.  Read from the
      beginning and answer ``restarted=True``.

    Detecting that third case is not free of assumptions, and the assumption is
    worth stating.  Two cheap checks are made: the file is now shorter than the
    position, and the byte before the position is not the line break a position
    is only ever placed after.  Together they catch a truncation and almost every
    replacement.  What neither catches is a file replaced by different content of
    the *same* length whose boundary happens to fall in the same place — for
    which a size is simply not evidence.  That case is out of reach here rather
    than handled: a store path is
    ``<session_dir>/evidence/events.jsonl`` and a session id is never reused, so
    two different histories do not share one path.  A caller that does not have
    that guarantee needs a stronger identity than an offset.

    Bytes, not characters: the offset has to survive multi-byte content, and a
    text-mode position is not addable.  Decoding happens per line, and an
    undecodable line is warned about and skipped like any other bad line.
    """
    resolved = Path(path)
    try:
        size = resolved.stat().st_size
    except OSError:
        # Missing is empty, exactly as it is for ``read_events``: a session
        # inspected before its first event has nothing to add, not a failure.
        return StoreTail(events=(), offset=0, restarted=offset > 0)

    start = max(0, int(offset))
    restarted = start > size
    if restarted:
        start = 0

    try:
        with resolved.open("rb") as handle:
            if start > 0 and not restarted:
                handle.seek(start - 1)
                if handle.read(1) != b"\n":
                    # The position is not on a line boundary any more, so it is
                    # not this file's position.
                    restarted = True
                    start = 0
            if start == size:
                return StoreTail(events=(), offset=size, restarted=restarted)
            handle.seek(start)
            chunk = handle.read()
    except OSError:
        _log.warning("Could not read the event store at %s.", resolved, exc_info=True)
        return StoreTail(events=(), offset=start, restarted=restarted)

    consumed = chunk.rfind(b"\n")
    if consumed < 0:
        # Not one complete line yet.  Hold the position: the fragment is read
        # again next time, when it has its newline.
        return StoreTail(events=(), offset=start, restarted=restarted)
    complete = chunk[: consumed + 1]

    events: list[StoredEvent] = []
    # Line numbers are relative to the read, not to the file: the caller asked
    # for what is new, and counting from the start of the file would mean
    # scanning it — which is the cost this function exists to avoid.
    for number, raw in enumerate(complete.split(b"\n"), start=1):
        if not raw:
            continue
        try:
            line = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            _emit_warning(
                StoreReadWarning(number, f"not valid UTF-8 ({exc})", repr(raw[:_EXCERPT_LIMIT])),
                on_warning,
            )
            continue
        stored = _decode_line(line, number, on_warning)
        if stored is not None:
            events.append(stored)

    return StoreTail(events=tuple(events), offset=start + consumed + 1, restarted=restarted)


@traces(SWR.SWR_2902, SWR.SWR_2454)
def tail_session_events(
    session_dir: Path | str,
    offset: int = 0,
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> StoreTail:
    """Read what one session's store gained after *offset*."""
    return tail_events(event_store_path(Path(session_dir)), offset, on_warning=on_warning)


@traces(SWR.SWR_2902)
def read_event_models(
    source: Path | str | Iterable[str],
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> Iterator[AnyEvent]:
    """Stream the store as typed event models — strict reconstruction, opt-in.

    Raises ``pydantic.ValidationError`` on the first line whose ``event`` value
    this build does not know.  Callers that must not break on a newer store use
    :func:`read_events` instead; this exists for the ones that would rather fail
    loudly than handle an opaque record.
    """
    for stored in read_events(source, on_warning=on_warning):
        yield stored.as_model()
