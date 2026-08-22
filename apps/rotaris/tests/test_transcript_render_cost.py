"""What a transcript refresh is allowed to cost (SWR-2452).

These are behavioural tests about *work*, not about pixels. They count calls
into ``TranscriptDelegate.sizeHint`` — the expensive thing a transcript
refresh can do — because the defect they exist to prevent is invisible in any
assertion about content: the rows were always correct, they just got measured
and laid out N at a time on every keystroke of streamed output, and the view
painted the half-built result.

Counts, never pixel heights: the offscreen platform has none of the host's
fonts, so every measured height here is a fiction. How *many* measurements
happen is not.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from ui_query import settle

from rotaris.models.state import TranscriptEvent
from rotaris.views.transcript import TranscriptDelegate, TranscriptListView

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit

#: Long enough that an O(rowCount) relayout is unmistakable next to an O(1)
#: one, short enough that building the fixture stays under a second.
_LONG = 400


def _event(index: int, suffix: str = "") -> TranscriptEvent:
    """One row of a plausible transcript: prose, then a tool call, then a user turn."""
    if index % 3 == 0:
        return TranscriptEvent(
            f"12:00:{index % 60:02d}",
            "orchestrator",
            f"Considering the next step. {'lorem ipsum dolor sit amet ' * 8}{suffix}",
        )
    if index % 3 == 1:
        return TranscriptEvent(
            f"12:00:{index % 60:02d}",
            "coder",
            f"pytest -q{suffix}",
            kind="tool",
            tool="Bash",
            detail="exit 0",
            status="ok",
            duration=1.2,
            event_key=f"call-{index}",
        )
    return TranscriptEvent(f"12:00:{index % 60:02d}", "you", f"and then? {suffix}", kind="user")


def _transcript(count: int) -> list[TranscriptEvent]:
    return [_event(index) for index in range(count)]


@contextmanager
def _counting_measurements(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[int]]:
    """Count every ``sizeHint`` the view asks the delegate for, inside the block."""
    calls: list[int] = []
    original = TranscriptDelegate.sizeHint

    def counted(self: TranscriptDelegate, option: object, index: object) -> object:
        calls.append(index.row())  # type: ignore[attr-defined]
        return original(self, option, index)  # type: ignore[arg-type]

    monkeypatch.setattr(TranscriptDelegate, "sizeHint", counted)
    try:
        yield calls
    finally:
        monkeypatch.setattr(TranscriptDelegate, "sizeHint", original)


def _settled_view(qtbot, events: list[TranscriptEvent]) -> TranscriptListView:
    """A shown, fully laid-out transcript — the state a reader is looking at.

    `settle` earns its place: showing a scrollbar is a deferred layout in Qt,
    and it takes width out of the viewport when it arrives. A view queried
    before that lands is still mid-load, and every measurement it then makes
    would be charged to whatever the test does next.
    """
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.resize(900, 600)
    view.show()
    qtbot.waitExposed(view)
    view.set_events(events)
    settle(qtbot)
    _force_layout(view)
    return view


def _force_layout(view: TranscriptListView) -> None:
    """Ask for the geometry the way a paint would, so nothing is left pending."""
    model = view.transcript_model
    for row in range(model.rowCount()):
        view.visualRect(model.index(row, 0))


@verifies(SWR.SWR_2452)
def test_appending_one_event_does_not_remeasure_the_transcript(
    qtbot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A new row costs a new row's measurement — not the whole conversation's.

    Attribution makes a row's height depend on the role of the row before it,
    so the appended row and the one it lands behind are both fair game. Nothing
    else is.
    """
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)

    with _counting_measurements(monkeypatch) as calls:
        view.set_events([*events, _event(_LONG)])
        _force_layout(view)

    assert len(calls) <= 4, (
        f"appending one row to a {_LONG}-row transcript measured {len(calls)} rows "
        f"(rows {sorted(set(calls))[:12]}...) - the layout is being rebuilt from scratch"
    )


@verifies(SWR.SWR_2452)
def test_a_growing_tail_row_does_not_remeasure_the_transcript(
    qtbot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Streaming mutates the last row several times a second; each is one row's work."""
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)

    with _counting_measurements(monkeypatch) as calls:
        grown = [*events[:-1], _event(_LONG - 1, suffix=" and one more clause")]
        view.set_events(grown)
        _force_layout(view)

    assert len(calls) <= 4, (
        f"growing the tail row of a {_LONG}-row transcript measured {len(calls)} rows - "
        "a streamed answer would pay this several times a second"
    )


@verifies(SWR.SWR_2452)
def test_no_pass_of_the_event_loop_sees_a_half_laid_out_transcript(qtbot) -> None:
    """The blank, stated as a property.

    Batched layout laid rows out `batchSize` at a time across event-loop passes,
    and a row it had not reached yet had a zero-height rect — so it painted as
    background. With the viewport pinned to the tail, that read as the whole
    transcript going blank and coming back.
    """
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)

    view.set_events([*events, _event(_LONG)])

    model = view.transcript_model
    unlaid = [
        row for row in range(model.rowCount()) if view.visualRect(model.index(row, 0)).height() <= 0
    ]
    assert not unlaid, (
        f"{len(unlaid)} of {model.rowCount()} rows had no height after a refresh "
        f"(first: {unlaid[:5]}) - those rows paint as background"
    )


@verifies(SWR.SWR_2452)
def test_painting_costs_the_visible_rows_only(qtbot, monkeypatch: pytest.MonkeyPatch) -> None:
    """A repaint of a long transcript is bounded by the viewport, not the history."""
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)

    with _counting_measurements(monkeypatch) as calls:
        view.viewport().repaint()

    assert not calls, (
        f"repainting measured {len(calls)} rows - a repaint runs on hover and on every "
        "live tick, and must never re-measure anything"
    )


@verifies(SWR.SWR_2452)
def test_a_height_only_resize_does_not_remeasure(qtbot, monkeypatch: pytest.MonkeyPatch) -> None:
    """Row height is a function of row width, so only a width change invalidates it."""
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)

    with _counting_measurements(monkeypatch) as calls:
        view.resize(view.width(), view.height() + 120)
        _force_layout(view)

    assert not calls, (
        f"a height-only resize measured {len(calls)} rows - dragging the window edge "
        "would re-measure the whole conversation on every frame"
    )
