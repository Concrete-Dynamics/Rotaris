"""Productive use: a Ralph loop runs for hours and the user watches it the whole
time. Expected outcome: what the desktop does to show one new line costs the same
in hour three as it did in minute one, and a view that breaks costs the view.

These pin the two halves of SWR-2454 that are properties rather than appearances:
the work per update is bounded by the change, and the run cannot be harmed by
whatever is watching it.
"""

from __future__ import annotations

import asyncio
import datetime as dt
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import TranscriptEvent
from rotaris.models.store import WorkspaceStore
from rotaris.services.run_bridge import _SessionObserver
from rotaris.views.transcript import TranscriptListModel

if TYPE_CHECKING:
    from rotaris.models.state import TranscriptDelta

pytestmark = pytest.mark.unit


class _Persister:
    """Records that the record was asked to catch up, and nothing else."""

    def __init__(self) -> None:
        self.saves = 0

    def request_save(self, _state: Any) -> None:
        self.saves += 1


def _observer(rows: int = 0) -> tuple[_SessionObserver, list[TranscriptDelta]]:
    """An observer over a session that already holds *rows* settled rows."""
    state = SimpleNamespace(
        session_id="s1",
        transcript_events=[
            {"role": "assistant", "name": "coder", "content": f"line {i}"} for i in range(rows)
        ],
        ui_edit_diffs=[],
        child_states=[],
    )
    manager = SimpleNamespace(persister=_Persister(), session_dir=lambda _id: None)
    observer = _SessionObserver(asyncio.new_event_loop(), manager, state)
    # A session resumed mid-flight has rows the observer never appended, exactly
    # as here; the first delta is what tells the view about them.
    seen: list[TranscriptDelta] = []
    observer.bind_delta_sink(seen.append)
    observer._publish_delta(())  # noqa: SLF001 - the first report, as a run start makes it
    seen.clear()
    return observer, seen


@verifies(SWR.SWR_2454)
@pytest.mark.parametrize("length", [30, 300, 3000])
def test_one_new_row_sends_one_new_row_whatever_the_session_holds(length: int) -> None:
    """Productive use: the agent says one more thing.
    Expected outcome: the desktop is handed one row, not the conversation."""
    observer, seen = _observer(length)
    observer._recorder._append({"role": "assistant", "name": "coder", "content": "and one more"})  # noqa: SLF001
    observer._touch()  # noqa: SLF001

    assert len(seen) == 1
    assert len(seen[0].rows) == 1
    assert seen[0].first == length


@verifies(SWR.SWR_2454)
def test_a_streaming_row_costs_that_row_and_what_follows_it() -> None:
    """Productive use: the model streams a sentence into a row that is already on
    screen. Expected outcome: the delta reaches back to that row and no further,
    however much came before it."""
    observer, seen = _observer(3000)
    streamed = observer._recorder._append({"role": "agent", "name": "coder", "content": "thin"})  # noqa: SLF001
    observer._recorder._stream_segments["coder"] = streamed  # noqa: SLF001
    observer._touch()  # noqa: SLF001
    seen.clear()

    streamed["content"] = "thinking about it"
    observer._touch()  # noqa: SLF001

    assert len(seen) == 1
    assert seen[0].first == 3000
    assert len(seen[0].rows) == 1
    assert seen[0].rows[0]["content"] == "thinking about it"


@verifies(SWR.SWR_2454)
def test_the_view_is_handed_copies_not_the_rows_the_run_is_writing() -> None:
    """Productive use: the run keeps streaming while the UI thread reads what it
    was handed. Expected outcome: the two never share a row."""
    observer, seen = _observer(0)
    streamed = observer._recorder._append({"role": "agent", "name": "coder", "content": "one"})  # noqa: SLF001
    observer._recorder._stream_segments["coder"] = streamed  # noqa: SLF001
    observer._touch()  # noqa: SLF001

    delivered = seen[0].rows[0]
    streamed["content"] = "one two"

    assert delivered["content"] == "one"
    assert delivered is not streamed


@verifies(SWR.SWR_2454)
def test_a_broken_view_costs_the_view_and_not_the_run() -> None:
    """Productive use: something is wrong with the window — a consumer raises on
    every delta. Expected outcome: the run's record is still written, its
    transcript is intact, and nothing propagates back into it."""
    observer, _seen = _observer(5)

    def explode(_delta: TranscriptDelta) -> None:
        raise RuntimeError("the view is on fire")

    observer.bind_delta_sink(explode)
    before = observer.manager.persister.saves
    observer._recorder._append({"role": "assistant", "name": "coder", "content": "still fine"})  # noqa: SLF001
    observer._touch()  # noqa: SLF001

    assert observer.manager.persister.saves == before + 1
    assert observer.state.transcript_events[-1]["content"] == "still fine"


@verifies(SWR.SWR_2454)
def test_no_consumer_at_all_is_not_a_special_case() -> None:
    """Productive use: a background run nobody is looking at.
    Expected outcome: it persists exactly as it would with a watcher."""
    observer, _seen = _observer(5)
    observer.bind_delta_sink(None)
    before = observer.manager.persister.saves
    observer._recorder._append({"role": "assistant", "name": "coder", "content": "unwatched"})  # noqa: SLF001
    observer._touch()  # noqa: SLF001

    assert observer.manager.persister.saves == before + 1


@verifies(SWR.SWR_2454)
def test_clearing_the_transcript_reports_a_beginning_rather_than_a_gap() -> None:
    """Productive use: the user clears the chat mid-run.
    Expected outcome: the view is told to start over, not left holding rows the
    session no longer has."""
    observer, seen = _observer(10)
    observer.state.transcript_events.clear()
    observer._touch()  # noqa: SLF001

    assert len(seen) == 1
    assert seen[0].first == 0
    assert seen[0].rows == []


@verifies(SWR.SWR_2454)
@pytest.mark.parametrize("length", [30, 300, 3000])
def test_applying_a_delta_to_the_store_does_not_read_the_whole_transcript(
    length: int,
) -> None:
    """Productive use: the same one row, arriving at the view.
    Expected outcome: the model touches the rows that changed. ``sync`` has to
    find the boundary and compares every row before it; ``apply_delta`` is told
    where it is."""
    store = WorkspaceStore()
    model = TranscriptListModel()
    store.transcript_delta.connect(lambda first, rows: model.apply_delta(first, list(rows)))
    rows = [
        TranscriptEvent(timestamp="12:00:00", role="assistant", text=f"line {i}")
        for i in range(length)
    ]
    store.set_transcript(list(rows))
    model.sync(list(rows))
    model.operation_counts.update(dict.fromkeys(model.operation_counts, 0))

    store.apply_transcript_delta(
        length, [TranscriptEvent(timestamp="12:00:00", role="assistant", text="one more")]
    )

    assert model.rowCount() == length + 1
    assert model.operation_counts["insert"] == 1
    assert model.operation_counts["reset"] == 0
    assert model.operation_counts["refused"] == 0


@verifies(SWR.SWR_2130)
@pytest.mark.parametrize("length", [30, 300, 3000])
def test_the_facts_payload_does_not_carry_the_session_it_describes(length: int) -> None:
    """Productive use: the agent tree and the todos update while a long session
    runs. Expected outcome: what is sent is bounded by what is happening, not by
    how much has happened — the transcript has its own channel and must not be
    copied into this one as well."""
    from rotaris_core.session.state import SessionState

    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="s1",
        workspace_root="/workspace",
        created_at=now,
        updated_at=now,
        transcript_events=[
            {"role": "assistant", "name": "coder", "content": f"line {i}"} for i in range(length)
        ],
        ui_edit_diffs=[{"diff_id": f"d{i}"} for i in range(length)],
        report_artifacts=[{"id": f"r{i}"} for i in range(length)],
        child_states=[{"canonical_name": "coder-1", "persona": "coder", "state": "running"}],
    )
    manager = SimpleNamespace(persister=_Persister(), session_dir=lambda _id: None)
    observer = _SessionObserver(asyncio.new_event_loop(), manager, state)
    seen: list[Any] = []
    observer.bind_facts_sink(seen.append)

    observer._save()  # noqa: SLF001

    assert len(seen) == 1
    facts = seen[0]
    assert facts.transcript_events == []
    assert facts.ui_edit_diffs == []
    assert facts.report_artifacts == []
    # What the live surfaces read is there, and copied — the run keeps writing
    # the originals while the Qt thread reads what it was handed.
    assert facts.child_states == state.child_states
    assert facts.child_states is not state.child_states
    assert facts.execution_status == state.execution_status


@verifies(SWR.SWR_2130)
def test_a_broken_facts_consumer_costs_the_view_and_not_the_run() -> None:
    """Productive use: the same failure as for the transcript, on the other
    channel. Expected outcome: the record is still written."""
    observer, _seen = _observer(3)

    def explode(_facts: Any) -> None:
        raise RuntimeError("the view is on fire")

    observer.bind_facts_sink(explode)
    before = observer.manager.persister.saves
    observer._save()  # noqa: SLF001

    assert observer.manager.persister.saves == before + 1


@verifies(SWR.SWR_2454, SWR.SWR_2504)
def test_a_delta_that_only_removes_rows_removes_them() -> None:
    """Productive use: the user answers the approval the run was blocked on, and
    the row saying so has to go. Expected outcome: the rows are removed, and the
    model is not asked to redraw a range that does not exist."""
    store = WorkspaceStore()
    model = TranscriptListModel()
    store.transcript_delta.connect(lambda first, rows: model.apply_delta(first, list(rows)))
    rows = [
        TranscriptEvent(timestamp="12:00:00", role="assistant", text="recorded"),
        TranscriptEvent(timestamp="", role="coder-1", text="Approval needed", kind="approval"),
    ]
    store.set_transcript(list(rows))
    model.sync(list(rows))
    model.operation_counts.update(dict.fromkeys(model.operation_counts, 0))

    store.apply_transcript_delta(1, [])

    assert model.rowCount() == 1
    assert [event.kind for event in store.transcript] == ["message"]
    assert model.operation_counts["remove"] == 1
    assert model.operation_counts["update"] == 0


@verifies(SWR.SWR_2454)
def test_a_delta_that_does_not_fit_is_refused_rather_than_guessed_at() -> None:
    """Productive use: a delta arrives for a transcript the view no longer holds.
    Expected outcome: nothing is applied, so the reconciling read can put it
    right — a wrong transcript is worse than a late one."""
    store = WorkspaceStore()
    store.set_transcript([TranscriptEvent(timestamp="12:00:00", role="assistant", text="one")])
    received: list[int] = []
    store.transcript_delta.connect(lambda first, _rows: received.append(first))

    store.apply_transcript_delta(
        5, [TranscriptEvent(timestamp="12:00:00", role="assistant", text="two")]
    )

    assert received == []
    assert len(store.transcript) == 1
