"""Filtering and replaying a stored session (SWR-2902).

A query is a value: build one, hand it around, compose it with a reader.  The
three filters — event type, iteration, time window — are ANDed, and an empty
result is a normal answer rather than an error, because "this run made no tool
calls" is a fact a caller asked for.

Filtering is applied *inside* the stream, one event at a time, so a query over a
long session never materializes the history it is filtering.

The iteration filter deserves a note.  Only three event types carry an
``iteration`` field of their own; a tool call, a permission decision or an error
does not, even though it plainly happened *inside* an iteration.  Filtering on
the field alone would answer "what happened in iteration 2?" with three
bookkeeping events and silently drop everything a user actually wanted, so the
iteration an event belongs to is tracked from the surrounding
``iteration.start`` / ``iteration.end`` boundaries as the stream is read.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.eventstore.reader import read_events
from rotaris_core.eventstore.writer import event_store_path
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Iterator

    from rotaris_core.eventstore.reader import StoredEvent, StoreReadWarning

#: The two events that open and close an iteration.  Only these move the
#: iteration context; anything else either states its own iteration or inherits
#: the one currently open.
_ITERATION_START = "iteration.start"
_ITERATION_END = "iteration.end"


@traces(SWR.SWR_2902)
def parse_timestamp(value: str) -> datetime | None:
    """Parse an envelope timestamp into an aware UTC datetime, or ``None``.

    Naive stamps are read as UTC: every timestamp the schema writes is UTC, and
    a hand-written fixture that dropped the offset should still be comparable
    rather than silently unmatchable.
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed


def _as_utc(moment: datetime) -> datetime:
    """Normalize a filter bound so comparisons never mix naive and aware."""
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment


@traces(SWR.SWR_2902)
@dataclass(frozen=True)
class EventQuery:
    """A composable filter over stored events.

    Every field is optional and ``None`` means "do not filter on this".  Set
    fields are ANDed.  Both time bounds are inclusive.

    An event that belongs to no iteration at all — ``session.start``, or
    anything emitted between iterations — does not match an iteration filter,
    and a stamp-less line does not match a time filter.  Excluding them is the
    honest answer: the query asked for events in iteration 3, and an event that
    happened outside every iteration is not one of them.

    Use :meth:`build` to construct one from lists, tuples or generators; the
    fields themselves are frozen sets so a query stays hashable and comparable.
    """

    event_types: frozenset[str] | None = None
    iterations: frozenset[int] | None = None
    since: datetime | None = None
    until: datetime | None = None

    def __post_init__(self) -> None:
        # Bounds are normalized once, here, rather than on every comparison:
        # mixing a naive bound with an aware timestamp raises, and a query is
        # compared against every event in a session.
        if self.since is not None:
            object.__setattr__(self, "since", _as_utc(self.since))
        if self.until is not None:
            object.__setattr__(self, "until", _as_utc(self.until))

    @classmethod
    def build(
        cls,
        *,
        event_types: Iterable[str] | None = None,
        iterations: Iterable[int] | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> EventQuery:
        """Construct from any iterables — the friendly constructor."""
        return cls(
            event_types=None if event_types is None else frozenset(event_types),
            iterations=None if iterations is None else frozenset(iterations),
            since=since,
            until=until,
        )

    @property
    def is_empty(self) -> bool:
        """Whether this query filters nothing out."""
        return (
            self.event_types is None
            and self.iterations is None
            and self.since is None
            and self.until is None
        )

    @traces(SWR.SWR_2902)
    def matches(self, stored: StoredEvent, effective_iteration: int | None = None) -> bool:
        """Whether *stored* satisfies every active filter.

        Args:
            stored: The event to test.
            effective_iteration: The iteration this event belongs to, when the
                caller knows it from the surrounding stream.  ``None`` falls back
                to the event's own ``iteration`` field, so a caller matching a
                single event out of context still gets a sensible answer.
        """
        if self.event_types is not None and stored.event_type not in self.event_types:
            return False
        if self.iterations is not None:
            iteration = effective_iteration if effective_iteration is not None else stored.iteration
            if iteration is None or iteration not in self.iterations:
                return False
        if self.since is not None or self.until is not None:
            moment = parse_timestamp(stored.timestamp)
            if moment is None:
                return False
            if self.since is not None and moment < self.since:
                return False
            if self.until is not None and moment > self.until:
                return False
        return True


@traces(SWR.SWR_2902)
def iter_with_iteration(events: Iterable[StoredEvent]) -> Iterator[tuple[StoredEvent, int | None]]:
    """Pair each event with the iteration it belongs to, streaming.

    An event that states its own ``iteration`` keeps it.  Everything else
    inherits the iteration currently open — the one an ``iteration.start``
    announced — and falls back to ``None`` once ``iteration.end`` closed it, so
    the events a run emits between iterations belong to none of them.
    """
    current: int | None = None
    for stored in events:
        explicit = stored.iteration
        if stored.event_type == _ITERATION_START and explicit is not None:
            current = explicit
        yield stored, explicit if explicit is not None else current
        if stored.event_type == _ITERATION_END:
            current = None


@traces(SWR.SWR_2902)
def query_events(
    source: Path | str | Iterable[str],
    query: EventQuery | None = None,
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> Iterator[StoredEvent]:
    """Stream the events of *source* that satisfy *query*, in original order.

    ``query=None`` reads everything, which makes this the one entry point a
    caller needs whether or not it filters.
    """
    events = read_events(source, on_warning=on_warning)
    for stored, iteration in iter_with_iteration(events):
        if query is None or query.matches(stored, iteration):
            yield stored


@traces(SWR.SWR_2902)
def replay_session(
    session_dir: Path | str,
    query: EventQuery | None = None,
    *,
    on_warning: Callable[[StoreReadWarning], None] | None = None,
) -> Iterator[StoredEvent]:
    """Replay one session's stored events in emission order.

    "Replay" here is reading, not re-execution: the run is over, and this hands
    back exactly what it emitted, filtered if asked.  Reading never modifies the
    store.
    """
    return query_events(
        event_store_path(Path(session_dir)),
        query,
        on_warning=on_warning,
    )
