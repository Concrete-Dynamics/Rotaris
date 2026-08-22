"""Productive use: a Ralph loop runs for hours and the user watches it the whole
time. Expected outcome: what the desktop does to show one new line costs the same
in hour three as it did in minute one, and a view that breaks costs the view.

These pin the two halves of SWR-2454 that are properties rather than appearances:
the work per update is bounded by the change, and the run cannot be harmed by
whatever is watching it.
"""

from __future__ import annotations

import asyncio
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
    observer._append_row({"role": "assistant", "name": "coder", "content": "and one more"})  # noqa: SLF001
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
    streamed = observer._append_row({"role": "agent", "name": "coder", "content": "thin"})  # noqa: SLF001
    observer._stream_segments["coder"] = streamed  # noqa: SLF001
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
    streamed = observer._append_row({"role": "agent", "name": "coder", "content": "one"})  # noqa: SLF001
    observer._stream_segments["coder"] = streamed  # noqa: SLF001
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
    observer._append_row({"role": "assistant", "name": "coder", "content": "still fine"})  # noqa: SLF001
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
    observer._append_row({"role": "assistant", "name": "coder", "content": "unwatched"})  # noqa: SLF001
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
