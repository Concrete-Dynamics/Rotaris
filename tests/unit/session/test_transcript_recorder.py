"""The run's own record of what it said (SWR-2454 / SWR-1829).

Row *construction* — which SDK event becomes which row, how a streamed message
folds into its committed copy, when a reasoning burst is a duplicate — is
exercised against real SDK events through the desktop's wiring
(`apps/rotaris/tests/test_run_wiring_e2e.py`), because that is where real events
are cheap to build. What is pinned here is what the recorder owes its callers
now that it is engine code and not a desktop detail: which rows it reports as
settled, what reaches the wire and when, and that nothing watching it can reach
back into the run.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState
from rotaris_core.session.transcript import (
    TranscriptRecorder,
    discard_transcript_recorder,
    ensure_transcript_recorder,
    register_transcript_recorder,
    reset_transcript_recorders,
    resolve_transcript_recorder,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _clean_registry() -> Iterator[None]:
    """A recorder left registered would write one test's rows into the next."""
    reset_transcript_recorders()
    yield
    reset_transcript_recorders()


def _state(session_id: str = "s-1") -> SessionState:
    now = dt.datetime.now(dt.UTC)
    return SessionState(
        session_id=session_id,
        workspace_root="/workspace",
        created_at=now,
        updated_at=now,
    )


def _recorder(
    state: SessionState | None = None,
) -> tuple[
    TranscriptRecorder,
    list[tuple[dict[str, Any], ...]],
    list[tuple[int, dict[str, Any]]],
]:
    changes: list[tuple[dict[str, Any], ...]] = []
    published: list[tuple[int, dict[str, Any]]] = []
    recorder = TranscriptRecorder(
        state if state is not None else _state(),
        on_change=changes.append,
        publish=lambda index, row: published.append((index, dict(row))),
    )
    return recorder, changes, published


@verifies(SWR.SWR_2454)
def test_every_row_a_run_records_is_stamped_and_placed() -> None:
    """Productive use: a session started from a terminal is opened in the window.
    Expected outcome: its rows render like any other — they carry the clock stamp
    the transcript shows, and each knows where it sits."""
    recorder, _changes, _published = _recorder()

    prompt = recorder.record_user("fix the parser")
    notice = recorder.record_system("Intent classified: bug_fix")

    assert prompt["ts"] and notice["ts"]
    assert recorder.index_of(prompt) == 0
    assert recorder.index_of(notice) == 1
    assert [row["role"] for row in recorder.state.transcript_events] == ["user", "system"]


@verifies(SWR.SWR_1829, SWR.SWR_2454)
def test_a_row_reaches_the_wire_when_it_is_written() -> None:
    """Productive use: someone outside the process is watching this run.
    Expected outcome: each row is offered as it is written, with the index that
    tells a consumer where to put it."""
    recorder, _changes, published = _recorder()

    recorder.record_user("fix the parser")
    recorder.record_agent("coder-1", "Looking at the tokenizer.")

    assert [index for index, _row in published] == [0, 1]
    assert published[1][1]["content"] == "Looking at the tokenizer."


@verifies(SWR.SWR_2454)
def test_a_settled_row_is_named_because_nothing_else_could_find_it() -> None:
    """Productive use: a check the user watched start finally finishes.
    Expected outcome: the recorder says which row settled. It has already let go
    of it, so a host asking ``held_rows`` would not hear about it — and a host
    that never heard would leave that row out of the change it reports."""
    recorder, changes, published = _recorder()
    check = type("Check", (), {"name": "pytest", "command": "pytest -q"})()
    recorder.record_verifier_check_started(1, check, 0, started=1000.0)
    row = recorder.held_rows()[0]
    published.clear()

    result = type(
        "Result", (), {"status": "passed", "output_excerpt": "12 passed", "duration_s": 2.0}
    )()
    recorder.record_verifier_check_finished(1, result, 0)

    assert recorder.held_rows() == [], "the row is finished; it is not held any more"
    assert changes[-1] == (row,), "so the change has to name it"
    assert published[-1][0] == 0, "and the wire is told again, at the index it already had"
    assert row["status"] == "ok"
    assert row["detail"] == "12 passed"


@verifies(SWR.SWR_2454)
def test_a_check_that_was_never_announced_still_gets_a_row() -> None:
    """Productive use: a permission denial kills a check before it starts.
    Expected outcome: the suite's account of itself has a line for it, rather
    than a check that silently never happened."""
    recorder, _changes, _published = _recorder()
    result = type(
        "Result",
        (),
        {
            "status": "skipped",
            "name": "ruff",
            "command": "ruff check",
            "skip_reason": "denied",
            "duration_s": 0.0,
        },
    )()

    recorder.record_verifier_check_finished(1, result, 0)

    row = recorder.state.transcript_events[0]
    assert row["role"] == "verifier"
    assert row["status"] == "blocked"
    assert row["detail"] == "denied"


@verifies(SWR.SWR_2454)
def test_clearing_lets_go_of_every_row_the_run_was_still_writing() -> None:
    """Productive use: the user clears the chat while an agent is mid-sentence.
    Expected outcome: nothing is held afterwards. A retained reference would have
    the next token appended to a row the transcript no longer has."""
    recorder, changes, _published = _recorder()
    recorder._stream_segments["coder-1"] = recorder.record_agent("coder-1", "half a thou")  # noqa: SLF001

    recorder.clear()

    assert recorder.state.transcript_events == []
    assert recorder.held_rows() == []
    assert recorder.index_of({"role": "agent"}) is None
    assert changes[-1] == ()


@verifies(SWR.SWR_2454)
def test_a_resumed_session_can_locate_the_rows_it_already_had() -> None:
    """Productive use: a session is picked back up and keeps going.
    Expected outcome: the rows already on disk are placed, so a host describing a
    change can say where it starts instead of resending the session."""
    state = _state()
    state.transcript_events.extend(
        {"role": "agent", "content": f"line {index}"} for index in range(5)
    )

    recorder, _changes, _published = _recorder(state)

    assert recorder.index_of(state.transcript_events[3]) == 3
    assert recorder.index_of(recorder.record_user("and now this")) == 5


@verifies(SWR.SWR_2454)
def test_a_broken_watcher_costs_the_watcher_and_not_the_run() -> None:
    """Productive use: whatever is watching this run is broken.
    Expected outcome: the row is still recorded. The transcript is the run's own
    record, and it does not depend on anyone reading it."""
    state = _state()
    recorder = TranscriptRecorder(
        state,
        on_change=lambda _settled: (_ for _ in ()).throw(RuntimeError("the view is on fire")),
        publish=lambda _index, _row: (_ for _ in ()).throw(RuntimeError("the stream is down")),
    )

    recorder.record_user("fix the parser")

    assert [row["content"] for row in state.transcript_events] == ["fix the parser"]


@verifies(SWR.SWR_2454)
def test_the_runner_takes_the_recorder_a_host_already_registered() -> None:
    """Productive use: the desktop wants to watch every change, so it builds its
    own recorder before the run starts. Expected outcome: the runner uses that
    one — one recorder and one transcript, whoever is watching."""
    state = _state()
    mine = TranscriptRecorder(state)
    register_transcript_recorder("s-1", mine)

    assert ensure_transcript_recorder("s-1", state) is mine


@verifies(SWR.SWR_2454)
def test_a_recorder_left_behind_by_a_dead_run_is_not_handed_to_the_next_one() -> None:
    """Productive use: a run dies before its teardown and the session is resumed.
    Expected outcome: the resumed run gets a recorder for *its* record. Reusing
    the stale one would write the new run's rows into an object nobody saves."""
    abandoned = TranscriptRecorder(_state())
    register_transcript_recorder("s-1", abandoned)
    resumed = _state()

    recorder = ensure_transcript_recorder("s-1", resumed)

    assert recorder is not abandoned
    assert recorder.state is resumed
    assert resolve_transcript_recorder("s-1") is recorder


@verifies(SWR.SWR_2454)
def test_discarding_stops_the_recording_for_good() -> None:
    """Productive use: an event escapes a conversation's teardown after the run
    is over. Expected outcome: it finds no recorder, rather than appending to a
    session that has ended."""
    register_transcript_recorder("s-1", TranscriptRecorder(_state()))

    discard_transcript_recorder("s-1")

    assert resolve_transcript_recorder("s-1") is None


@verifies(SWR.SWR_2454)
def test_one_run_never_records_into_another_runs_transcript() -> None:
    """Productive use: two sessions run at once in one desktop process.
    Expected outcome: each resolves its own. A fallback here would be worse than
    no rows at all — it would put one run's words in another's history."""
    register_transcript_recorder("s-1", TranscriptRecorder(_state("s-1")))

    assert resolve_transcript_recorder("s-2") is None
    assert resolve_transcript_recorder(None) is None
    assert resolve_transcript_recorder("") is None
    with pytest.raises(ValueError, match="non-empty session id"):
        register_transcript_recorder("", TranscriptRecorder(_state()))
