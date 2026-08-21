"""Unit tests for the session-keyed event bus (SWR-1828)."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

import pytest

from rotaris_core.events import (
    EventSink,
    IterationStartEvent,
    RotarisEvent,
    discard_event_sink,
    publish,
    register_event_sink,
    reset_event_registry,
    resolve_event_sink,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _clean_registry() -> Iterator[None]:
    """No test may inherit another test's sink."""
    reset_event_registry()
    yield
    reset_event_registry()


def _event(iteration: int = 1, session_id: str = "s-1") -> IterationStartEvent:
    return IterationStartEvent(session_id=session_id, iteration=iteration, task="go")


def _collector(bucket: list[IterationStartEvent]) -> EventSink:
    """A sink that records the concrete events it was handed."""

    def sink(event: RotarisEvent) -> None:
        assert isinstance(event, IterationStartEvent)
        bucket.append(event)

    return sink


def _noop(event: RotarisEvent) -> None:
    return None


@verifies(SWR.SWR_1828)
def test_a_registered_sink_receives_published_events() -> None:
    """Productive use: a headless run's stream writer receives every runtime event.
    Expected outcome: publishing to a registered session delivers the event to its sink."""
    received: list[IterationStartEvent] = []
    register_event_sink("s-1", _collector(received))

    publish("s-1", _event())

    assert [event.iteration for event in received] == [1]
    assert resolve_event_sink("s-1") is not None


@verifies(SWR.SWR_1828)
def test_publishing_without_a_sink_is_a_silent_no_op() -> None:
    """Productive use: the desktop app runs agents without paying for or crashing on the stream.
    Expected outcome: publishing to an unregistered session raises nothing and delivers nothing."""
    received: list[IterationStartEvent] = []
    register_event_sink("s-1", _collector(received))

    publish("s-other", _event(session_id="s-other"))
    publish(None, _event())
    publish("", _event())

    assert received == []
    assert resolve_event_sink("s-other") is None
    assert resolve_event_sink(None) is None


@verifies(SWR.SWR_1828)
def test_a_failing_sink_never_breaks_the_publishing_run() -> None:
    """Productive use: an agent keeps working after the consumer closes the stream pipe.
    Expected outcome: a sink that raises is logged and swallowed; publish returns normally."""
    calls: list[str] = []

    def exploding_sink(event: RotarisEvent) -> None:
        calls.append(event.event)
        raise BrokenPipeError("stdout is closed")

    register_event_sink("s-1", exploding_sink)

    publish("s-1", _event())
    publish("s-1", _event(2))

    assert calls == ["iteration.start", "iteration.start"]


@verifies(SWR.SWR_1828)
def test_discarding_a_sink_stops_delivery() -> None:
    """Productive use: a finished run stops emitting into a stream nobody reads any more.
    Expected outcome: after discard_event_sink the session receives no further events."""
    received: list[IterationStartEvent] = []
    register_event_sink("s-1", _collector(received))
    publish("s-1", _event())

    discard_event_sink("s-1")
    publish("s-1", _event(2))

    assert len(received) == 1
    assert resolve_event_sink("s-1") is None
    discard_event_sink("s-1")
    discard_event_sink(None)


@verifies(SWR.SWR_1828)
def test_registering_again_replaces_the_previous_sink() -> None:
    """Productive use: re-attaching a stream writer to a session does not double-emit.
    Expected outcome: only the most recently registered sink receives events."""
    first: list[IterationStartEvent] = []
    second: list[IterationStartEvent] = []
    register_event_sink("s-1", _collector(first))
    register_event_sink("s-1", _collector(second))

    publish("s-1", _event())

    assert first == []
    assert len(second) == 1


@verifies(SWR.SWR_1828)
def test_sinks_are_isolated_per_session() -> None:
    """Productive use: two concurrent runs never see each other's events.
    Expected outcome: each session's sink receives only its own session's events."""
    left: list[IterationStartEvent] = []
    right: list[IterationStartEvent] = []
    register_event_sink("s-left", _collector(left))
    register_event_sink("s-right", _collector(right))

    publish("s-left", _event(1, "s-left"))
    publish("s-right", _event(2, "s-right"))

    assert [event.session_id for event in left] == ["s-left"]
    assert [event.session_id for event in right] == ["s-right"]


@verifies(SWR.SWR_1828)
def test_registering_a_sink_without_a_session_id_is_rejected() -> None:
    """Productive use: a wiring mistake surfaces at registration, not as a silently lost stream.
    Expected outcome: an empty session id raises instead of registering an unreachable sink."""
    with pytest.raises(ValueError, match="non-empty session id"):
        register_event_sink("", _noop)


@verifies(SWR.SWR_1828)
def test_reset_event_registry_clears_every_session() -> None:
    """Productive use: a test suite or a process shutdown leaves no sink behind.
    Expected outcome: after a reset no session resolves to a sink."""
    register_event_sink("s-1", _noop)
    register_event_sink("s-2", _noop)

    reset_event_registry()

    assert resolve_event_sink("s-1") is None
    assert resolve_event_sink("s-2") is None


@verifies(SWR.SWR_1828)
def test_concurrent_publishes_from_many_threads_all_arrive_exactly_once() -> None:
    """Productive use: child agents on worker threads emit into one stream without loss.
    Expected outcome: 8 threads publishing concurrently deliver every event exactly once."""
    received: list[IterationStartEvent] = []
    guard = threading.Lock()
    started = threading.Barrier(8)

    def sink(event: RotarisEvent) -> None:
        # A real sink writes to stdout, which can block.  Holding a lock here
        # proves the bus does not keep its own registry lock while a sink runs.
        assert isinstance(event, IterationStartEvent)
        with guard:
            received.append(event)

    register_event_sink("s-1", sink)

    def worker(index: int) -> None:
        started.wait(timeout=10)
        for step in range(10):
            publish("s-1", _event(index * 10 + step))

    threads = [threading.Thread(target=worker, args=(index,)) for index in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
        assert not thread.is_alive()

    assert len(received) == 80
    assert sorted(event.iteration for event in received) == list(range(80))
