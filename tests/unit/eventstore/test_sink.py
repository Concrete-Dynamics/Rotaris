"""The seam that makes a run persist what it emits (SWR-2901).

The store existed as a library for a whole wave without anything calling it, so
these are the promises the wiring itself has to keep: a run with no stream is
still stored, a run with a stream is stored *and* streamed, and a finished run
stops appending even if a late event reaches its old sink.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.events.bus import publish, register_event_sink, reset_event_registry
from rotaris_core.events.schema import IterationStartEvent, ResultEvent, ToolStartEvent
from rotaris_core.eventstore import (
    StoringEventSink,
    attach_session_store,
    detach_session_store,
    read_session_events,
    reset_event_store_registry,
    resolve_event_store,
    session_store_of,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from rotaris_core.events.schema import RotarisEvent

pytestmark = pytest.mark.unit

_SESSION = "sink0001"


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    """A store or sink left registered would bleed one run into the next."""
    reset_event_registry()
    reset_event_store_registry()
    yield
    reset_event_registry()
    reset_event_store_registry()


class _Recorder:
    """A host sink, of the kind the headless CLI and the SDK pass in."""

    def __init__(self) -> None:
        self.events: list[RotarisEvent] = []

    def __call__(self, event: RotarisEvent) -> None:
        self.events.append(event)

    @property
    def names(self) -> list[str]:
        return [event.event for event in self.events]


@verifies(SWR.SWR_2901)
def test_a_run_without_a_stream_still_leaves_its_events_on_disk(tmp_path: Path) -> None:
    """Productive use: a user runs a task interactively, with no ``--output-format
    stream-json`` and nobody consuming events.
    Expected outcome: the session still has a complete history afterwards — that
    a run was not streamed is not a reason for it to be untraceable."""
    sink = attach_session_store(tmp_path, session_id=_SESSION)

    sink(IterationStartEvent(session_id=_SESSION, iteration=1, task="fix the parser"))
    sink(ToolStartEvent(session_id=_SESSION, tool_name="bash", call_id="c1"))

    stored = list(read_session_events(tmp_path))
    assert [record.event_type for record in stored] == ["iteration.start", "tool.start"]
    assert sink.downstream is None


@verifies(SWR.SWR_2901)
def test_a_streamed_run_is_both_persisted_and_forwarded_in_order(tmp_path: Path) -> None:
    """Productive use: a CI job consumes the live stream and later wants the same
    history off disk.
    Expected outcome: the consumer and the store see the same events in the same
    order, so the two are interchangeable inputs."""
    recorder = _Recorder()
    sink = attach_session_store(tmp_path, session_id=_SESSION, downstream=recorder)

    sink(IterationStartEvent(session_id=_SESSION, iteration=1, task="fix the parser"))
    sink(ToolStartEvent(session_id=_SESSION, tool_name="bash", call_id="c1"))

    assert recorder.names == ["iteration.start", "tool.start"]
    assert [record.event_type for record in read_session_events(tmp_path)] == recorder.names
    assert sink.downstream is recorder


@verifies(SWR.SWR_2901)
def test_an_event_survives_on_disk_even_when_the_consumer_breaks(tmp_path: Path) -> None:
    """Productive use: a consumer's stdout pipe is closed mid-run.
    Expected outcome: the event is already persisted before the consumer is
    offered it, so a broken stream costs the stream and not the history — and the
    bus still turns the failure into a warning rather than failing the run."""

    def _broken(_event: RotarisEvent) -> None:
        raise RuntimeError("the consumer went away")

    register_event_sink(
        _SESSION, attach_session_store(tmp_path, session_id=_SESSION, downstream=_broken)
    )

    publish(_SESSION, IterationStartEvent(session_id=_SESSION, iteration=1, task="t"))

    assert [record.event_type for record in read_session_events(tmp_path)] == ["iteration.start"]


@verifies(SWR.SWR_2901)
def test_a_detached_session_stops_appending_through_the_same_sink(tmp_path: Path) -> None:
    """Productive use: a run ends and something still holds its sink object.
    Expected outcome: the sink is inert once the run detached its store, so a
    late event cannot append to a session whose history is already final."""
    sink = attach_session_store(tmp_path, session_id=_SESSION)
    sink(IterationStartEvent(session_id=_SESSION, iteration=1, task="t"))

    detach_session_store(_SESSION)
    sink(ResultEvent(session_id=_SESSION, result={"status": "completed"}))

    assert [record.event_type for record in read_session_events(tmp_path)] == ["iteration.start"]
    assert resolve_event_store(_SESSION) is None
    assert session_store_of(_SESSION) is None


@verifies(SWR.SWR_2901)
def test_attaching_registers_the_store_where_the_run_can_report_on_it(tmp_path: Path) -> None:
    """Productive use: a host wants to tell the user where the history landed.
    Expected outcome: the store is reachable by session id, and it points at the
    session's evidence directory rather than at some second convention."""
    attach_session_store(tmp_path, session_id=_SESSION)

    store = session_store_of(_SESSION)

    assert store is not None
    assert store.path == tmp_path / "evidence" / "events.jsonl"
    assert store.path.exists(), "the store is created up front, like the other evidence files"


@verifies(SWR.SWR_2901)
def test_one_sessions_sink_never_writes_into_another_sessions_store(tmp_path: Path) -> None:
    """Productive use: two runs share a process, as they do in the SDK.
    Expected outcome: each run's history stays its own — a sink persists for the
    session it was attached for, not for whichever id an event happens to carry."""
    first = tmp_path / "first"
    second = tmp_path / "second"
    attach_session_store(second, session_id="other001")
    sink = attach_session_store(first, session_id=_SESSION)

    sink(IterationStartEvent(session_id="other001", iteration=1, task="t"))

    assert [record.event_type for record in read_session_events(first)] == ["iteration.start"]
    assert list(read_session_events(second)) == []


@verifies(SWR.SWR_2901)
def test_a_sink_for_an_unregistered_session_is_a_silent_no_op(tmp_path: Path) -> None:
    """Productive use: a host builds a sink for a session it never attached.
    Expected outcome: nothing is written and nothing raises — the store must
    never be the reason a run fails."""
    sink = StoringEventSink("nobody01")

    sink(IterationStartEvent(session_id="nobody01", iteration=1, task="t"))

    assert list(read_session_events(tmp_path)) == []
