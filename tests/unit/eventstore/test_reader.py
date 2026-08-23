"""Unit coverage for reading a stored session back (SWR-2902).

The two failure modes this module exists to prevent are both here: a store
written by a *newer* build (an event type this one has never heard of) and a
store written by a *killed* run (a half-written final line).  Neither may raise,
and neither may silently swallow the events around it.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

import pytest
from pydantic import ValidationError

from rotaris_core.events.schema import (
    AnyEvent,
    IterationStartEvent,
    SessionStartEvent,
    ToolStartEvent,
    serialize_event,
)
from rotaris_core.eventstore.reader import (
    KNOWN_EVENT_TYPES,
    StoredEvent,
    StoreReadWarning,
    read_event_models,
    read_events,
    read_session_events,
    tail_events,
    tail_session_events,
)
from rotaris_core.eventstore.writer import open_session_store
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


def _write_store(path: Path, lines: list[str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _line(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


@verifies(SWR.SWR_2902)
def test_known_event_types_are_derived_from_the_schemas_union() -> None:
    """Productive use: a new event type is added to the wire schema.
    Expected outcome: the reader recognizes it without anyone editing a second
    list — the known set is read off the discriminated union itself."""
    assert "session.start" in KNOWN_EVENT_TYPES
    assert "tool.finish" in KNOWN_EVENT_TYPES
    assert "result" in KNOWN_EVENT_TYPES
    assert "definitely.not.an.event" not in KNOWN_EVENT_TYPES
    # Every member of the published union must be classified as known.
    assert len(KNOWN_EVENT_TYPES) >= 14


@verifies(SWR.SWR_2902)
def test_events_are_returned_in_emission_order(tmp_path: Path) -> None:
    """Productive use: a user asks what a finished run actually did.
    Expected outcome: the stored events come back in the order the run emitted
    them, with their payloads unchanged."""
    events = [
        SessionStartEvent(session_id="s", task="ship it"),
        IterationStartEvent(session_id="s", iteration=1),
        IterationStartEvent(session_id="s", iteration=2),
    ]
    path = _write_store(tmp_path / "events.jsonl", [serialize_event(e) for e in events])

    stored = list(read_events(path))

    assert [s.event_type for s in stored] == ["session.start", "iteration.start", "iteration.start"]
    assert [s.iteration for s in stored] == [None, 1, 2]
    assert [s.line_number for s in stored] == [1, 2, 3]
    assert all(s.known for s in stored)
    assert stored[0].session_id == "s"
    assert stored[0].schema_version == 1
    assert stored[0].timestamp == events[0].timestamp
    assert stored[0].payload["task"] == "ship it"


@verifies(SWR.SWR_2902)
def test_an_unknown_event_type_comes_back_opaque_with_its_payload_intact(
    tmp_path: Path,
) -> None:
    """Productive use: an older build reads a store written by a newer one that
    added event types (SWR-1831).
    Expected outcome: the unknown line is neither dropped nor raised — it is
    returned as an opaque record, distinguishable from a known one, with every
    field the newer build wrote still present."""
    future = {
        "schema_version": 2,
        "event": "context.compacted",
        "timestamp": "2026-08-09T10:00:00+00:00",
        "session_id": "s",
        "iteration": 3,
        "tokens_reclaimed": 4096,
    }
    path = _write_store(
        tmp_path / "events.jsonl",
        [
            serialize_event(IterationStartEvent(session_id="s", iteration=3)),
            _line(future),
            serialize_event(IterationStartEvent(session_id="s", iteration=4)),
        ],
    )

    stored = list(read_events(path))

    assert [s.event_type for s in stored] == [
        "iteration.start",
        "context.compacted",
        "iteration.start",
    ]
    unknown = stored[1]
    assert unknown.known is False, "an unknown type must be distinguishable from a known one"
    assert stored[0].known is True
    assert stored[2].known is True
    assert unknown.payload == future, "the raw payload must survive verbatim"
    assert unknown.schema_version == 2
    assert unknown.iteration == 3
    # Strict reconstruction is the opt-in that is allowed to refuse it.
    with pytest.raises(ValidationError):
        unknown.as_model()
    assert isinstance(stored[0].as_model(), IterationStartEvent)


@verifies(SWR.SWR_2902)
def test_a_truncated_final_line_warns_and_keeps_every_preceding_event(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: a run is killed mid-write and its store ends in a partial
    JSON fragment.
    Expected outcome: every event before the fragment is read, the fragment is
    skipped with a warning, and nothing raises."""
    good = [serialize_event(IterationStartEvent(session_id="s", iteration=i)) for i in (1, 2)]
    path = tmp_path / "events.jsonl"
    path.write_text("\n".join(good) + '\n{"event":"iteration.start","iter', encoding="utf-8")

    warnings: list[StoreReadWarning] = []
    with caplog.at_level(logging.WARNING, logger="rotaris_core.eventstore.reader"):
        stored = list(read_events(path, on_warning=warnings.append))

    assert [s.iteration for s in stored] == [1, 2]
    assert len(warnings) == 1
    assert warnings[0].line_number == 3
    assert "not valid JSON" in warnings[0].reason
    assert any(record.levelno == logging.WARNING for record in caplog.records)
    # Read-only: the damaged file is left exactly as it was found.
    assert path.read_text(encoding="utf-8").endswith('"iter')


@verifies(SWR.SWR_2902)
def test_blank_lines_non_objects_and_missing_discriminators_are_handled(tmp_path: Path) -> None:
    """Productive use: a store is concatenated, hand-edited or partly clobbered.
    Expected outcome: blank lines are ignored silently, a non-object and an
    envelope with no 'event' field are skipped with warnings, and the valid
    events around them are still returned."""
    path = tmp_path / "events.jsonl"
    path.write_text(
        "\n".join(
            [
                serialize_event(IterationStartEvent(session_id="s", iteration=1)),
                "",
                "   ",
                "[1, 2, 3]",
                _line({"schema_version": 1, "timestamp": "", "session_id": "s"}),
                serialize_event(IterationStartEvent(session_id="s", iteration=2)),
            ],
        )
        + "\n",
        encoding="utf-8",
    )

    warnings: list[StoreReadWarning] = []
    stored = list(read_events(path, on_warning=warnings.append))

    assert [s.iteration for s in stored] == [1, 2]
    reasons = [w.reason for w in warnings]
    assert reasons == ["not a JSON object", "no 'event' discriminator"]


@verifies(SWR.SWR_2902)
def test_reading_is_streaming_and_pulls_only_what_it_yields() -> None:
    """Productive use: a long session is traversed for its first few events.
    Expected outcome: the reader consumes exactly the lines it has yielded — it
    never materializes the whole history to hand back one event."""
    pulled: list[int] = []

    def _lines() -> Iterator[str]:
        for index in range(1, 1001):
            pulled.append(index)
            yield serialize_event(IterationStartEvent(session_id="s", iteration=index))

    stream = read_events(_lines())
    first = next(stream)

    assert first.iteration == 1
    assert pulled == [1], "the reader read ahead instead of streaming"

    second = next(stream)
    assert second.iteration == 2
    assert pulled == [1, 2]


@verifies(SWR.SWR_2902)
def test_a_missing_store_reads_as_an_empty_session(tmp_path: Path) -> None:
    """Productive use: a session is inspected before it emitted anything.
    Expected outcome: an empty result, which is a normal answer rather than an
    error."""
    assert list(read_events(tmp_path / "nothing" / "events.jsonl")) == []
    assert list(read_session_events(tmp_path / "no-such-session")) == []


@verifies(SWR.SWR_2902)
def test_a_session_directory_reads_the_store_written_into_it(tmp_path: Path) -> None:
    """Productive use: a caller holds a session directory, not a file path.
    Expected outcome: the events the writer stored under that directory are the
    events the reader returns."""
    session_dir = tmp_path / "session-1"
    store = open_session_store(session_dir, max_events=None)
    store.append(SessionStartEvent(session_id="session-1", task="t"))
    store.append(IterationStartEvent(session_id="session-1", iteration=1))

    stored = list(read_session_events(session_dir))

    assert [s.event_type for s in stored] == ["session.start", "iteration.start"]


@verifies(SWR.SWR_2902)
def test_strict_model_reconstruction_is_available_as_an_opt_in(tmp_path: Path) -> None:
    """Productive use: a caller wants typed models and would rather fail loudly
    than handle an opaque record.
    Expected outcome: read_event_models yields real event models, and raises on
    the first line whose type this build does not know."""
    known = _write_store(
        tmp_path / "known.jsonl",
        [
            serialize_event(SessionStartEvent(session_id="s", task="t")),
            serialize_event(ToolStartEvent(session_id="s", tool_name="bash", call_id="c")),
        ],
    )

    models: list[AnyEvent] = list(read_event_models(known))
    assert isinstance(models[0], SessionStartEvent)
    assert isinstance(models[1], ToolStartEvent)
    assert models[0].task == "t"

    unknown = _write_store(
        tmp_path / "unknown.jsonl",
        [_line({"schema_version": 1, "event": "context.compacted", "session_id": "s"})],
    )
    with pytest.raises(ValidationError):
        list(read_event_models(unknown))


@verifies(SWR.SWR_2902)
def test_reading_never_rewrites_or_repairs_the_store(tmp_path: Path) -> None:
    """Productive use: the same store is read repeatedly by different tools.
    Expected outcome: reading is a pure read — the bytes on disk and their
    modification time are untouched, so no reader can corrupt another's view."""
    path = tmp_path / "events.jsonl"
    path.write_text(
        serialize_event(IterationStartEvent(session_id="s", iteration=1)) + "\nbroken{",
        encoding="utf-8",
    )
    before = path.read_bytes()

    assert len(list(read_events(path))) == 1
    assert len(list(read_events(path))) == 1
    assert path.read_bytes() == before


@verifies(SWR.SWR_2902)
def test_a_stored_event_classifies_itself_from_its_payload() -> None:
    """Productive use: a consumer builds a record from a line it already decoded.
    Expected outcome: the record reports the envelope fields it has and says so
    honestly when a field is missing or the wrong type."""
    known = StoredEvent.from_payload({"event": "tool.start", "session_id": "s"}, line_number=7)
    assert known.known is True
    assert known.line_number == 7

    odd = StoredEvent.from_payload(
        {"event": "not.real", "session_id": 5, "timestamp": None, "schema_version": True},
    )
    assert odd.known is False
    assert odd.event_type == "not.real"
    assert odd.session_id == ""
    assert odd.timestamp == ""
    assert odd.schema_version is None, "a bool must not be read as a schema version"
    assert odd.iteration is None
    assert str(StoreReadWarning(3, "not valid JSON")) == "line 3: not valid JSON"


# ---------------------------------------------------------------------------
# Following a store that is still being written (SWR-2454).  Everything above
# reads a finished session; these read one that is not finished yet, which is a
# different problem: the file grows under the reader, and the cost of looking
# again must be the cost of what arrived rather than of what is there.
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2902, SWR.SWR_2454)
def test_following_a_growing_store_reads_only_what_arrived(tmp_path: Path) -> None:
    """Productive use: a user watches a run happening in another process.
    Expected outcome: each look returns the events since the last one, not the
    session so far — which is what stops a long session costing more to watch
    than a short one."""
    path = tmp_path / "events.jsonl"
    _write_store(path, [_line({"event": "session.start", "session_id": "s"})])

    first = tail_events(path)
    assert [event.event_type for event in first.events] == ["session.start"]
    assert first.offset == path.stat().st_size

    with path.open("a", encoding="utf-8") as handle:
        handle.write(_line({"event": "agent.message", "session_id": "s", "text": "on it"}) + "\n")
        handle.write(_line({"event": "tool.start", "session_id": "s"}) + "\n")

    second = tail_events(path, first.offset)

    assert [event.event_type for event in second.events] == ["agent.message", "tool.start"]
    assert second.offset == path.stat().st_size
    assert second.restarted is False


@verifies(SWR.SWR_2902, SWR.SWR_2454)
def test_a_store_that_gained_nothing_answers_nothing(tmp_path: Path) -> None:
    """Productive use: the watched run is thinking and has said nothing yet.
    Expected outcome: an empty answer at the same position — idle costs nothing
    and re-reads no history."""
    path = _write_store(tmp_path / "events.jsonl", [_line({"event": "session.start"})])
    first = tail_events(path)

    again = tail_events(path, first.offset)

    assert again.events == ()
    assert again.offset == first.offset
    assert again.restarted is False


@verifies(SWR.SWR_2902, SWR.SWR_2454)
def test_a_line_still_being_written_is_read_once_it_is_whole(tmp_path: Path) -> None:
    """Productive use: the look lands in the middle of an append.
    Expected outcome: the half-written line is left for next time and arrives
    intact, rather than being read as damage and lost — a live run is mid-write
    all the time, and that is not the same as a killed one."""
    path = tmp_path / "events.jsonl"
    path.write_text(
        _line({"event": "session.start", "session_id": "s"}) + "\n" + '{"event":"agent.mess',
        encoding="utf-8",
    )
    warnings: list[StoreReadWarning] = []

    first = tail_events(path, on_warning=warnings.append)

    assert [event.event_type for event in first.events] == ["session.start"]
    assert warnings == [], "a partial trailing line is a live writer, not a corrupt store"

    with path.open("a", encoding="utf-8") as handle:
        handle.write('age","session_id":"s","text":"done"}\n')

    second = tail_events(path, first.offset)

    assert [event.event_type for event in second.events] == ["agent.message"]
    assert second.events[0].payload["text"] == "done"


@verifies(SWR.SWR_2902, SWR.SWR_2454, SWR.SWR_2901)
def test_a_store_the_cap_shortened_is_read_again_and_flagged(tmp_path: Path) -> None:
    """Productive use: a long run hits the store's cap, so its oldest events are
    dropped and the file gets shorter under a viewer that was following it.
    Expected outcome: the follow does not resume into the middle of a line — the
    store is read whole and reported as restarted, so a reader discards what it
    derived instead of appending to a history that no longer exists."""
    path = _write_store(
        tmp_path / "events.jsonl",
        [_line({"event": "session.start", "session_id": "s"})] * 4,
    )
    ahead = tail_events(path).offset

    _write_store(path, [_line({"event": "result", "session_id": "s"})])
    restarted = tail_events(path, ahead)

    assert restarted.restarted is True
    assert [event.event_type for event in restarted.events] == ["result"]
    assert restarted.offset == path.stat().st_size


@verifies(SWR.SWR_2902, SWR.SWR_2454)
def test_a_position_that_is_no_longer_a_line_boundary_restarts(tmp_path: Path) -> None:
    """Productive use: the file a viewer was following was replaced by a longer
    one, so its size proves nothing. Expected outcome: the position is checked
    against the line break it was placed after, and a position that no longer
    sits on one is treated as belonging to a file that is gone."""
    path = _write_store(tmp_path / "events.jsonl", [_line({"event": "session.start"})])
    ahead = tail_events(path).offset

    path.write_text("x" * (ahead * 3) + "\n", encoding="utf-8")
    tail = tail_events(path, ahead)

    assert tail.restarted is True
    assert tail.events == (), "the replacement holds no events, and none were invented"
    assert tail.offset == path.stat().st_size


@verifies(SWR.SWR_2902, SWR.SWR_2454)
def test_a_store_that_does_not_exist_yet_is_an_empty_answer(tmp_path: Path) -> None:
    """Productive use: a session is watched before its run has emitted anything.
    Expected outcome: no events and no exception, exactly as a whole read of a
    missing store gives."""
    missing = tmp_path / "never" / "events.jsonl"

    assert tail_events(missing).events == ()
    assert tail_events(missing).offset == 0
    assert tail_session_events(tmp_path / "session").events == ()


@verifies(SWR.SWR_2902, SWR.SWR_2454)
def test_a_corrupt_line_in_a_tail_is_skipped_and_reported(tmp_path: Path) -> None:
    """Productive use: one appended line is garbage.
    Expected outcome: the events around it still arrive, the caller is told, and
    the position still advances past it — a bad line must not stall the follow."""
    path = _write_store(tmp_path / "events.jsonl", [_line({"event": "session.start"})])
    start = tail_events(path).offset
    with path.open("a", encoding="utf-8") as handle:
        handle.write("{ not json\n")
        handle.write(_line({"event": "result"}) + "\n")
    warnings: list[StoreReadWarning] = []

    tail = tail_events(path, start, on_warning=warnings.append)

    assert [event.event_type for event in tail.events] == ["result"]
    assert len(warnings) == 1
    assert tail.offset == path.stat().st_size


@verifies(SWR.SWR_2902, SWR.SWR_2454)
def test_following_a_session_directory_finds_its_store(tmp_path: Path) -> None:
    """Productive use: a caller has a session directory, not a file path.
    Expected outcome: the same answer, resolved through the store's own layout."""
    session_dir = tmp_path / "sessions" / "s-1"
    store = open_session_store(session_dir, session_id="s-1")
    store.append(SessionStartEvent(session_id="s-1", task="ship it"))

    tail = tail_session_events(session_dir)

    assert [event.event_type for event in tail.events] == ["session.start"]
    assert tail.offset > 0
