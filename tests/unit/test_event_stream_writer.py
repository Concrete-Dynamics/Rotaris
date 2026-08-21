"""Unit coverage for the JSONL sink behind ``--output-format stream-json`` (SWR-1828).

Everything here is about the *writing* half of the stdout contract: one event is
one flushed line, concurrent emitters cannot tear a line, and a consumer that
walks away ends the stream instead of the run.
"""

from __future__ import annotations

import io
import json
import sys
import threading
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.events.bus import publish, register_event_sink, reset_event_registry
from rotaris_core.events.schema import (
    ErrorEvent,
    ResultEvent,
    SessionStartEvent,
    ToolStartEvent,
    parse_event,
)
from rotaris_core.events.stream import (
    OUTPUT_FORMAT_STREAM_JSON,
    OUTPUT_FORMAT_TEXT,
    OUTPUT_FORMATS,
    JsonlEventStream,
    stream_json_sink,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _clean_event_registry() -> Iterator[None]:
    """No sink may survive a test: a leaked one would write into the next run."""
    reset_event_registry()
    yield
    reset_event_registry()


class _RecordingStream(io.StringIO):
    """A text stream that remembers when it was flushed and how it was written."""

    def __init__(self) -> None:
        super().__init__()
        self.writes: list[str] = []
        self.flush_count = 0
        self.content_at_flush: list[str] = []

    def write(self, text: str) -> int:  # type: ignore[override]
        self.writes.append(text)
        return super().write(text)

    def flush(self) -> None:
        super().flush()
        self.flush_count += 1
        self.content_at_flush.append(self.getvalue())


def _lines(stream: io.StringIO) -> list[str]:
    return [line for line in stream.getvalue().split("\n") if line]


@verifies(SWR.SWR_1828, SWR.SWR_1829)
def test_each_event_becomes_one_parseable_jsonl_line() -> None:
    """Productive use: an automation pipes a Rotaris run into a JSON reader.
    Expected outcome: every event arrives as exactly one line that decodes back
    into the same typed event the run emitted."""
    target = io.StringIO()
    sink = JsonlEventStream(target)

    sink(SessionStartEvent(session_id="s-1", task="ship it"))
    sink(ToolStartEvent(session_id="s-1", tool_name="bash", arguments={"cmd": "ls"}))
    sink(ResultEvent(session_id="s-1", result={"status": "completed"}))

    lines = _lines(target)
    assert len(lines) == 3
    events = [parse_event(json.loads(line)) for line in lines]
    assert [event.event for event in events] == ["session.start", "tool.start", "result"]
    assert events[0].session_id == "s-1"


@verifies(SWR.SWR_1828)
def test_every_line_is_flushed_before_the_next_event_is_written() -> None:
    """Productive use: a CI job tails the stream while the run is still going.
    Expected outcome: each event is readable the moment it is emitted, not only
    once the process exits."""
    target = _RecordingStream()
    sink = JsonlEventStream(target)

    sink(ErrorEvent(session_id="s-1", message="first"))
    assert target.flush_count == 1
    assert target.content_at_flush[0].endswith("\n")
    assert '"first"' in target.content_at_flush[0]

    sink(ErrorEvent(session_id="s-1", message="second"))
    assert target.flush_count == 2
    # One write call per event: a split write could be interleaved by another
    # writer on the same stream even while this sink holds its own lock.
    assert len(target.writes) == 2


@verifies(SWR.SWR_1828)
def test_concurrent_emitters_never_tear_a_line() -> None:
    """Productive use: a delegating run emits events from worker threads and the
    event loop at once.
    Expected outcome: the consumer still sees whole JSON objects, one per line."""
    target = io.StringIO()
    sink = JsonlEventStream(target)
    barrier = threading.Barrier(4)

    def _emit(worker: int) -> None:
        barrier.wait()
        for index in range(25):
            sink(ErrorEvent(session_id="s-1", message=f"worker-{worker}-{index}", detail="x" * 200))

    threads = [threading.Thread(target=_emit, args=(worker,)) for worker in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    lines = _lines(target)
    assert len(lines) == 100
    for line in lines:
        assert parse_event(json.loads(line)).event == "error"


@verifies(SWR.SWR_1828)
def test_a_consumer_that_hangs_up_ends_the_stream_not_the_run() -> None:
    """Productive use: a user runs `rotaris-headless run --output-format stream-json | head -1`.
    Expected outcome: the closed pipe is absorbed silently; the run keeps going."""

    class _BrokenStream(io.StringIO):
        def write(self, text: str) -> int:  # type: ignore[override]
            raise BrokenPipeError(32, "broken pipe")

    sink = JsonlEventStream(_BrokenStream())

    sink(ErrorEvent(session_id="s-1", message="one"))
    sink(ErrorEvent(session_id="s-1", message="two"))

    assert sink.closed is True


@verifies(SWR.SWR_1828)
def test_writing_to_an_already_closed_file_is_absorbed() -> None:
    """Productive use: a host tears down its output stream before the run's last event.
    Expected outcome: the late event is dropped rather than raised into the runtime."""
    target = io.StringIO()
    target.close()
    sink = JsonlEventStream(target)

    sink(ErrorEvent(session_id="s-1", message="late"))

    assert sink.closed is True


@verifies(SWR.SWR_1828)
def test_stdout_is_resolved_at_write_time_not_at_construction() -> None:
    """Productive use: the CLI builds the sink at start-up, before a host redirects stdout.
    Expected outcome: events land on whichever stdout is installed when they are written."""
    sink = stream_json_sink()
    replacement = io.StringIO()
    original = sys.stdout
    sys.stdout = replacement
    try:
        sink(ErrorEvent(session_id="s-1", message="redirected"))
    finally:
        sys.stdout = original

    assert '"redirected"' in replacement.getvalue()


@verifies(SWR.SWR_1828)
def test_close_flushes_is_idempotent_and_leaves_the_underlying_stream_open() -> None:
    """Productive use: the CLI closes the stream after the terminal event.
    Expected outcome: nothing further is written, and the process keeps its stdout."""
    target = _RecordingStream()
    sink = JsonlEventStream(target)

    sink(ErrorEvent(session_id="s-1", message="one"))
    sink.close()
    sink.close()
    sink(ErrorEvent(session_id="s-1", message="dropped"))

    assert sink.closed is True
    assert target.closed is False
    assert len(_lines(target)) == 1
    assert "dropped" not in target.getvalue()


@verifies(SWR.SWR_1828)
def test_an_unserializable_event_is_dropped_without_breaking_the_stream() -> None:
    """Productive use: a future event type carries a payload the serializer rejects.
    Expected outcome: that one line is lost; every later event still reaches the consumer."""
    target = io.StringIO()
    sink = JsonlEventStream(target)

    class _Hostile:
        event = "hostile"

        def model_dump(self, **_kwargs: Any) -> Any:
            raise RuntimeError("cannot dump")

    sink(_Hostile())  # type: ignore[arg-type]
    sink(ErrorEvent(session_id="s-1", message="still here"))

    lines = _lines(target)
    assert len(lines) == 1
    assert parse_event(json.loads(lines[0])).event == "error"


@verifies(SWR.SWR_1828)
def test_the_sink_is_usable_as_a_registered_event_sink() -> None:
    """Productive use: the run publishes events without knowing where they go.
    Expected outcome: a registered JSONL sink turns published events into stream lines."""
    target = io.StringIO()
    register_event_sink("s-1", stream_json_sink(target))

    publish("s-1", SessionStartEvent(session_id="s-1", task="ship it"))
    publish("s-other", SessionStartEvent(session_id="s-other", task="not mine"))

    lines = _lines(target)
    assert len(lines) == 1
    assert json.loads(lines[0])["task"] == "ship it"


@verifies(SWR.SWR_1828)
def test_output_format_names_are_the_two_documented_spellings() -> None:
    """Productive use: a script writer reads `--output-format` values from the CLI help.
    Expected outcome: exactly 'text' and 'stream-json' are offered, in that order."""
    assert OUTPUT_FORMATS == (OUTPUT_FORMAT_TEXT, OUTPUT_FORMAT_STREAM_JSON)
    assert OUTPUT_FORMAT_TEXT == "text"
    assert OUTPUT_FORMAT_STREAM_JSON == "stream-json"
