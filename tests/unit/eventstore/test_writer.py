"""Unit coverage for the durable per-session event store writer (SWR-2901).

The productive question behind every test here is the same: after a run ends,
can someone still see what it did?  That needs the store to keep emission order,
to keep the wire envelope byte-for-byte, to stay bounded without lying about it,
and — above all — never to take a run down with it.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.events.schema import (
    IterationStartEvent,
    SessionStartEvent,
    ToolStartEvent,
    serialize_event,
)
from rotaris_core.eventstore.writer import (
    EVENT_STORE_FILENAME,
    EVENT_STORE_METADATA_FILENAME,
    SessionEventStore,
    discard_event_store,
    event_store_path,
    open_session_store,
    read_store_metadata,
    register_event_store,
    reset_event_store_registry,
    resolve_event_store,
    resolve_store_session_id,
    store_event,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator


@pytest.fixture(autouse=True)
def _clean_store_registry() -> Iterator[None]:
    """A store left registered would append one session's events to another's."""
    reset_event_store_registry()
    yield
    reset_event_store_registry()


def _lines(path: Path) -> list[str]:
    return [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


@verifies(SWR.SWR_2901)
def test_events_are_appended_in_emission_order_with_the_wire_envelope(tmp_path: Path) -> None:
    """Productive use: an operator inspects a finished run's history on disk.
    Expected outcome: the store holds one JSON object per event, in the order the
    run emitted them, with the same envelope the stdout stream would have shown."""
    session_dir = tmp_path / "session-a"
    store = open_session_store(session_dir, max_events=None)

    events = [
        SessionStartEvent(session_id="session-a", task="write docs"),
        IterationStartEvent(session_id="session-a", iteration=1, task="write docs"),
        IterationStartEvent(session_id="session-a", iteration=2, task="write docs"),
    ]
    for event in events:
        assert store.append(event) is True

    stored = _lines(event_store_path(session_dir))
    assert stored == [serialize_event(event) for event in events]

    payloads = [json.loads(line) for line in stored]
    assert [payload["event"] for payload in payloads] == [
        "session.start",
        "iteration.start",
        "iteration.start",
    ]
    assert [payload["schema_version"] for payload in payloads] == [1, 1, 1]
    assert [payload.get("iteration") for payload in payloads] == [None, 1, 2]


@verifies(SWR.SWR_2901)
def test_the_store_lives_next_to_the_other_evidence_files(tmp_path: Path) -> None:
    """Productive use: someone who already knows evidence/permissions.jsonl looks
    for the event history.
    Expected outcome: it is in the same evidence directory under the same JSONL
    convention, created up front like the other evidence files."""
    session_dir = tmp_path / "session-b"
    store = open_session_store(session_dir)

    assert store.path == session_dir / "evidence" / EVENT_STORE_FILENAME
    assert store.path.exists(), "initialize() must create the file like the other evidence files"
    assert store.path.read_text(encoding="utf-8") == ""
    assert store.metadata_path == session_dir / "evidence" / EVENT_STORE_METADATA_FILENAME
    assert not store.metadata_path.exists(), "an untruncated store carries no truncation marker"


@verifies(SWR.SWR_2901)
def test_the_session_id_falls_back_to_the_session_directory_name(tmp_path: Path) -> None:
    """Productive use: a writer several layers deep persists events without a
    session id threaded through its constructors.
    Expected outcome: an explicit id wins and the directory name is the fallback,
    exactly as the event bus and the audit log resolve it."""
    session_dir = tmp_path / "20260809-abc"

    assert resolve_store_session_id(session_dir) == "20260809-abc"
    assert resolve_store_session_id(session_dir, "explicit") == "explicit"
    assert resolve_store_session_id(session_dir, "   ") == "20260809-abc"
    assert resolve_store_session_id(None) == ""
    assert SessionEventStore(session_dir).session_id == "20260809-abc"


@verifies(SWR.SWR_2901)
def test_a_write_failure_warns_and_never_reaches_the_caller(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: a run happens on a full disk or a read-only directory.
    Expected outcome: the run continues and the store reports its own failure —
    losing a stored event is acceptable, failing a run because of the store is
    not."""
    session_dir = tmp_path / "session-c"
    session_dir.mkdir()
    # A *file* where the evidence directory belongs: every mkdir and every open
    # underneath it fails, which is the closest portable stand-in for a
    # read-only or full target.
    (session_dir / "evidence").write_text("not a directory", encoding="utf-8")

    store = SessionEventStore(session_dir)
    with caplog.at_level(logging.WARNING, logger="rotaris_core.eventstore.writer"):
        assert store.initialize() is False
        assert store.append(IterationStartEvent(session_id="session-c", iteration=1)) is False

    assert any("event store" in record.message.lower() for record in caplog.records)
    assert any(record.levelno == logging.WARNING for record in caplog.records)


@verifies(SWR.SWR_2901)
def test_an_unserializable_event_is_dropped_rather_than_raised(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: a bug produces an event that cannot be rendered.
    Expected outcome: that one event is dropped with a warning and every later
    event still lands."""

    def _explode(_event: object) -> str:
        raise RuntimeError("boom")

    session_dir = tmp_path / "session-d"
    store = open_session_store(session_dir, max_events=None)

    monkeypatch.setattr("rotaris_core.eventstore.writer.serialize_event", _explode)
    with caplog.at_level(logging.WARNING, logger="rotaris_core.eventstore.writer"):
        assert store.append(IterationStartEvent(session_id="session-d", iteration=1)) is False
    monkeypatch.undo()
    assert store.append(IterationStartEvent(session_id="session-d", iteration=2)) is True

    stored = _lines(store.path)
    assert len(stored) == 1
    assert json.loads(stored[0])["iteration"] == 2


@verifies(SWR.SWR_2901)
def test_a_line_break_inside_an_event_line_is_refused(tmp_path: Path) -> None:
    """Productive use: a caller hands the store a pre-serialized line.
    Expected outcome: a smuggled newline is refused rather than silently turning
    one stored event into two unreadable halves."""
    store = open_session_store(tmp_path / "session-e", max_events=None)

    assert store.append_line('{"event":"a"}\n{"event":"b"}') is False
    assert _lines(store.path) == []


@verifies(SWR.SWR_2901)
def test_the_cap_keeps_the_newest_events_and_records_the_truncation(tmp_path: Path) -> None:
    """Productive use: a runaway loop emits far more events than the session cap.
    Expected outcome: the store keeps the newest events, stays bounded, and says
    that it dropped some — a reader can never mistake it for a complete run."""
    session_dir = tmp_path / "session-f"
    store = open_session_store(session_dir, max_events=4)

    for iteration in range(1, 11):
        assert (
            store.append(IterationStartEvent(session_id="session-f", iteration=iteration)) is True
        )

    payloads = [json.loads(line) for line in _lines(store.path)]
    assert [payload["iteration"] for payload in payloads] == [7, 8, 9, 10]
    assert store.dropped_events == 6
    assert store.metadata().truncated is True

    marker = read_store_metadata(session_dir)
    assert marker.truncated is True
    assert marker.dropped_events == 6
    assert marker.max_events == 4
    assert marker.last_trimmed_at


@verifies(SWR.SWR_2901)
def test_the_dropped_count_accumulates_across_stores_over_one_session(tmp_path: Path) -> None:
    """Productive use: a session is resumed, or inspected by a second process,
    after an earlier run already lost events to the cap.
    Expected outcome: the recorded loss is the session's total, not the current
    object's — under-reporting it would let an export claim less history is
    missing than really is."""
    session_dir = tmp_path / "session-resumed"
    first = open_session_store(session_dir, max_events=2)
    for iteration in range(1, 6):
        first.append(IterationStartEvent(session_id="s", iteration=iteration))
    assert first.dropped_events == 3

    second = open_session_store(session_dir, max_events=2)
    # A fresh store over an already-trimmed session knows what it inherited.
    assert second.dropped_events == 3
    assert second.metadata().truncated is True

    for iteration in range(6, 10):
        second.append(IterationStartEvent(session_id="s", iteration=iteration))

    assert second.dropped_events == 7
    assert read_store_metadata(session_dir).dropped_events == 7
    assert [json.loads(line)["iteration"] for line in _lines(second.path)] == [8, 9]


@verifies(SWR.SWR_2901)
def test_a_non_positive_cap_is_refused_rather_than_read_as_unbounded(tmp_path: Path) -> None:
    """Productive use: an operator configures the cap and types 0 for "off".
    Expected outcome: it fails loudly instead of silently granting unlimited
    growth — the opposite of what the number says."""
    with pytest.raises(ValueError, match="max_events must be positive"):
        SessionEventStore(tmp_path / "s", max_events=0)
    with pytest.raises(ValueError, match="max_events must be positive"):
        open_session_store(tmp_path / "s", max_events=-1)

    assert open_session_store(tmp_path / "s", max_events=None).max_events is None


@verifies(SWR.SWR_2901)
def test_stored_lines_end_the_same_way_whether_appended_or_trimmed(tmp_path: Path) -> None:
    """Productive use: a consumer splits the store on newlines, or hashes it
    against the stream the run emitted.
    Expected outcome: every line ends in a single \\n on every platform, before
    and after a trim — appending and rewriting must not disagree."""
    session_dir = tmp_path / "session-endings"
    store = open_session_store(session_dir, max_events=4)

    for iteration in range(1, 4):
        store.append(IterationStartEvent(session_id="s", iteration=iteration))
    assert b"\r\n" not in store.path.read_bytes()

    for iteration in range(4, 12):
        store.append(IterationStartEvent(session_id="s", iteration=iteration))
    raw = store.path.read_bytes()
    assert b"\r\n" not in raw
    assert raw.count(b"\n") == 4


@verifies(SWR.SWR_2901)
def test_an_untruncated_store_reports_no_truncation(tmp_path: Path) -> None:
    """Productive use: a reader must tell a complete history from a capped one.
    Expected outcome: a store that never hit its cap reports truncated=False, and
    so does a session that has no marker file at all."""
    session_dir = tmp_path / "session-g"
    store = open_session_store(session_dir, max_events=100)
    for iteration in range(5):
        store.append(IterationStartEvent(session_id="session-g", iteration=iteration))

    assert store.metadata().truncated is False
    assert store.dropped_events == 0
    assert read_store_metadata(session_dir).truncated is False
    assert read_store_metadata(store.path).truncated is False
    assert read_store_metadata(tmp_path / "no-such-session").truncated is False


@verifies(SWR.SWR_2901)
def test_a_corrupt_truncation_marker_reads_as_untruncated(tmp_path: Path) -> None:
    """Productive use: a marker file is damaged by an interrupted write.
    Expected outcome: reading it degrades to "nothing known to be dropped"
    instead of raising at the reader."""
    session_dir = tmp_path / "session-h"
    store = open_session_store(session_dir)
    store.metadata_path.write_text("{not json", encoding="utf-8")

    assert read_store_metadata(session_dir).truncated is False


@verifies(SWR.SWR_2901)
def test_registered_stores_are_addressed_by_session_and_never_shared(tmp_path: Path) -> None:
    """Productive use: two runs persist concurrently in one process.
    Expected outcome: each session's events land in its own store, an unknown
    session is a silent no-op, and discarding one leaves the other intact."""
    first = open_session_store(tmp_path / "run-1", max_events=None)
    second = open_session_store(tmp_path / "run-2", max_events=None)
    register_event_store("run-1", first)
    register_event_store("run-2", second)

    assert resolve_event_store("run-1") is first
    assert resolve_event_store("run-2") is second
    assert resolve_event_store("run-3") is None
    assert resolve_event_store(None) is None

    assert store_event("run-1", IterationStartEvent(session_id="run-1", iteration=1)) is True
    assert store_event("run-2", IterationStartEvent(session_id="run-2", iteration=2)) is True
    # No store registered: silent, and definitely not another session's file.
    assert store_event("run-3", IterationStartEvent(session_id="run-3", iteration=3)) is False
    assert store_event(None, IterationStartEvent(iteration=4)) is False

    assert [json.loads(line)["iteration"] for line in _lines(first.path)] == [1]
    assert [json.loads(line)["iteration"] for line in _lines(second.path)] == [2]

    discard_event_store("run-1")
    assert resolve_event_store("run-1") is None
    assert resolve_event_store("run-2") is second


@verifies(SWR.SWR_2901)
def test_registering_a_store_without_a_session_id_is_a_programming_error() -> None:
    """Productive use: a caller wires the store before it knows the session.
    Expected outcome: it fails loudly at registration rather than silently
    swallowing a whole run's history."""
    with pytest.raises(ValueError, match="non-empty session id"):
        register_event_store("", SessionEventStore(Path(".")))


@verifies(SWR.SWR_2901)
def test_stored_tool_arguments_keep_the_schemas_redaction(tmp_path: Path) -> None:
    """Productive use: a tool call carries an API key in its arguments.
    Expected outcome: what lands on disk is what the wire schema masked — the
    store adds no second redaction pass and leaks no credential."""
    store = open_session_store(tmp_path / "session-i", max_events=None)
    store.append(
        ToolStartEvent(
            session_id="session-i",
            tool_name="bash",
            call_id="c1",
            arguments={"command": "curl -H 'Authorization: Bearer sk-live-super-secret'"},
        ),
    )

    text = store.path.read_text(encoding="utf-8")
    assert "sk-live-super-secret" not in text
    assert "bash" in text
