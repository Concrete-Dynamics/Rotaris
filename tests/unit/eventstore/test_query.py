"""Unit coverage for filtering and replaying a stored session (SWR-2902).

Filters are the difference between "here is a 40 000-line file" and "here is
what the run did in iteration 3".  They must compose, preserve order, stream,
and return an empty result as an answer rather than an error.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from rotaris_core.events.schema import (
    IterationEndEvent,
    IterationStartEvent,
    PermissionDecisionEvent,
    SessionStartEvent,
    ToolStartEvent,
    serialize_event,
)
from rotaris_core.eventstore.query import (
    EventQuery,
    iter_with_iteration,
    parse_timestamp,
    query_events,
    replay_session,
)
from rotaris_core.eventstore.reader import StoredEvent, read_events
from rotaris_core.eventstore.writer import open_session_store
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

_BASE = datetime(2026, 8, 9, 12, 0, 0, tzinfo=UTC)


def _at(offset_seconds: int) -> str:
    return (_BASE + timedelta(seconds=offset_seconds)).isoformat()


def _session_lines() -> list[str]:
    """A small but realistic run: two iterations with tools and a denial."""
    return [
        serialize_event(SessionStartEvent(session_id="s", task="t", timestamp=_at(0))),
        serialize_event(IterationStartEvent(session_id="s", iteration=1, timestamp=_at(1))),
        serialize_event(
            ToolStartEvent(session_id="s", tool_name="read", call_id="c1", timestamp=_at(2)),
        ),
        serialize_event(IterationEndEvent(session_id="s", iteration=1, timestamp=_at(3))),
        serialize_event(IterationStartEvent(session_id="s", iteration=2, timestamp=_at(4))),
        serialize_event(
            PermissionDecisionEvent(
                session_id="s",
                tool_name="bash",
                decision="deny",
                timestamp=_at(5),
            ),
        ),
        serialize_event(
            ToolStartEvent(session_id="s", tool_name="write", call_id="c2", timestamp=_at(6)),
        ),
        serialize_event(IterationEndEvent(session_id="s", iteration=2, timestamp=_at(7))),
    ]


def _stored(payload: dict[str, Any]) -> StoredEvent:
    return StoredEvent.from_payload(payload)


@verifies(SWR.SWR_2902)
def test_filtering_by_event_type_returns_exactly_those_events_in_order() -> None:
    """Productive use: a user asks which tools a finished run called.
    Expected outcome: only the tool events come back, in the run's original
    order."""
    result = list(query_events(_session_lines(), EventQuery.build(event_types=["tool.start"])))

    assert [s.event_type for s in result] == ["tool.start", "tool.start"]
    assert [s.payload["tool_name"] for s in result] == ["read", "write"]


@verifies(SWR.SWR_2902)
def test_filtering_by_iteration_returns_everything_that_happened_inside_it() -> None:
    """Productive use: an operator investigates what happened in iteration 2.
    Expected outcome: everything the run did between that iteration's start and
    end — including the tool calls and permission decisions that carry no
    iteration field of their own — and nothing from outside it."""
    result = list(query_events(_session_lines(), EventQuery.build(iterations=[2])))

    assert [s.event_type for s in result] == [
        "iteration.start",
        "permission.decision",
        "tool.start",
        "iteration.end",
    ]

    first = list(query_events(_session_lines(), EventQuery.build(iterations=[1])))
    assert [s.event_type for s in first] == [
        "iteration.start",
        "tool.start",
        "iteration.end",
    ]

    both = list(query_events(_session_lines(), EventQuery.build(iterations=[1, 2])))
    # session.start happened before any iteration opened, so it belongs to none.
    assert "session.start" not in [s.event_type for s in both]
    assert len(both) == len(_session_lines()) - 1


@verifies(SWR.SWR_2902)
def test_events_outside_every_iteration_belong_to_none_of_them() -> None:
    """Productive use: a run's opening and closing events are not part of any
    iteration.
    Expected outcome: the iteration context closes at iteration.end, so a
    trailing session.end is not attributed to the iteration before it."""
    lines = [
        *_session_lines(),
        serialize_event(SessionStartEvent(session_id="s", task="t", timestamp=_at(8))),
    ]

    paired = list(iter_with_iteration(read_events(lines)))

    assert [iteration for _stored, iteration in paired] == [
        None,  # session.start
        1,
        1,
        1,
        2,
        2,
        2,
        2,
        None,  # after iteration.end closed the context
    ]


@verifies(SWR.SWR_2902)
def test_filtering_by_a_time_window_is_inclusive_on_both_bounds() -> None:
    """Productive use: an incident is narrowed to a two-second window.
    Expected outcome: the events stamped inside the window, bounds included."""
    window = EventQuery.build(
        since=_BASE + timedelta(seconds=2),
        until=_BASE + timedelta(seconds=4),
    )

    result = list(query_events(_session_lines(), window))

    assert [s.timestamp for s in result] == [_at(2), _at(3), _at(4)]


@verifies(SWR.SWR_2902)
def test_filters_compose_and_an_empty_result_is_a_normal_answer() -> None:
    """Productive use: a user asks for the tool calls of iteration 2, then for
    the tool calls of an iteration that had none.
    Expected outcome: the composed filter returns exactly the intersection, and
    a query matching nothing returns an empty stream instead of raising."""
    lines = _session_lines()

    composed = EventQuery.build(
        event_types=["tool.start", "permission.decision"],
        iterations=[2],
    )
    assert [s.event_type for s in query_events(lines, composed)] == [
        "permission.decision",
        "tool.start",
    ]

    # The same filter over an iteration that made no tool calls is legitimately
    # empty — and an empty result is an answer, not an error.
    assert list(query_events(lines, EventQuery.build(event_types=["child.spawn"]))) == []

    narrowed = EventQuery.build(
        event_types=["tool.start"],
        since=_BASE + timedelta(seconds=3),
    )
    assert [s.payload["tool_name"] for s in query_events(lines, narrowed)] == ["write"]

    assert list(query_events(lines, EventQuery.build(event_types=["nothing.here"]))) == []
    assert len(list(query_events(lines, None))) == len(lines)
    assert len(list(query_events(lines, EventQuery()))) == len(lines)


@verifies(SWR.SWR_2902)
def test_an_unknown_event_type_stays_queryable() -> None:
    """Productive use: a store written by a newer build is filtered by an older
    reader.
    Expected outcome: unknown events are matched by the same filters as known
    ones — forward compatibility survives the query layer."""
    future = json.dumps(
        {
            "schema_version": 2,
            "event": "context.compacted",
            "timestamp": _at(2),
            "session_id": "s",
            "iteration": 1,
        },
        sort_keys=True,
    )
    lines = [*_session_lines(), future]

    by_type = list(query_events(lines, EventQuery.build(event_types=["context.compacted"])))
    assert len(by_type) == 1
    assert by_type[0].known is False

    by_iteration = list(query_events(lines, EventQuery.build(iterations=[1])))
    assert "context.compacted" in [s.event_type for s in by_iteration]


@verifies(SWR.SWR_2902)
def test_querying_streams_and_does_not_read_ahead() -> None:
    """Productive use: the first matching event of a long session is wanted.
    Expected outcome: the query pulls lines only until it has one match, so a
    filtered traversal costs no more than the reader's own streaming."""
    pulled: list[int] = []

    def _lines() -> Iterator[str]:
        for index in range(1, 501):
            pulled.append(index)
            event = (
                ToolStartEvent(session_id="s", tool_name="t", call_id=str(index))
                if index == 3
                else IterationStartEvent(session_id="s", iteration=index)
            )
            yield serialize_event(event)

    stream = query_events(_lines(), EventQuery.build(event_types=["tool.start"]))
    match = next(stream)

    assert match.payload["call_id"] == "3"
    assert pulled == [1, 2, 3], "the query materialized more of the session than it needed"


@verifies(SWR.SWR_2902)
def test_a_session_is_replayed_from_its_directory_without_re_running_anything(
    tmp_path: Path,
) -> None:
    """Productive use: a user finishes a run and afterwards retrieves its history.
    Expected outcome: replaying the session directory yields the stored events in
    emission order, filterable, and leaves the store untouched."""
    session_dir = tmp_path / "session-x"
    store = open_session_store(session_dir, max_events=None)
    for line in _session_lines():
        store.append_line(line)
    before = store.path.read_bytes()

    full = list(replay_session(session_dir))
    assert [s.event_type for s in full] == [
        "session.start",
        "iteration.start",
        "tool.start",
        "iteration.end",
        "iteration.start",
        "permission.decision",
        "tool.start",
        "iteration.end",
    ]

    denials = list(
        replay_session(session_dir, EventQuery.build(event_types=["permission.decision"])),
    )
    assert [s.payload["decision"] for s in denials] == ["deny"]
    assert store.path.read_bytes() == before


@verifies(SWR.SWR_2902)
def test_timestamps_without_an_offset_are_read_as_utc() -> None:
    """Productive use: a hand-written or older store carries naive timestamps.
    Expected outcome: they stay comparable against an aware window instead of
    silently matching nothing."""
    assert parse_timestamp("") is None
    assert parse_timestamp("not a time") is None
    assert parse_timestamp("2026-08-09T12:00:00") == _BASE
    assert parse_timestamp("2026-08-09T12:00:00+00:00") == _BASE

    naive_window = EventQuery(since=datetime(2026, 8, 9, 12, 0, 0))  # noqa: DTZ001 - the point
    assert naive_window.matches(_stored({"event": "e", "timestamp": _at(5)})) is True
    assert naive_window.matches(_stored({"event": "e"})) is False, "no stamp cannot match a window"


@verifies(SWR.SWR_2902)
def test_a_query_reports_whether_it_filters_anything() -> None:
    """Productive use: a caller decides whether to bother filtering at all.
    Expected outcome: an all-None query says it is empty; any set field says it
    is not."""
    assert EventQuery().is_empty is True
    assert EventQuery.build().is_empty is True
    assert EventQuery.build(event_types=["a"]).is_empty is False
    assert EventQuery.build(iterations=[1]).is_empty is False
    assert EventQuery.build(since=_BASE).is_empty is False
    assert EventQuery.build(until=_BASE).is_empty is False
