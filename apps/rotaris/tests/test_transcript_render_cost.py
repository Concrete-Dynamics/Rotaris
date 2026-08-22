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
from rotaris.views.transcript import (
    TranscriptDelegate,
    TranscriptListView,
    _event_identity,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.unit

#: Long enough that an O(rowCount) relayout is unmistakable next to an O(1)
#: one, short enough that building the fixture stays under a second.
_LONG = 400


def _event(index: int, suffix: str = "") -> TranscriptEvent:
    """One row of a plausible transcript: prose, then a tool call, then a user turn.

    Every row says something different. A transcript of four hundred identical
    messages is a fixture no session produces, and it would quietly exercise
    only the duplicate-identity path — which
    `test_the_reader_keeps_their_place_among_rows_that_repeat_themselves` takes
    on deliberately instead.
    """
    if index % 3 == 0:
        return TranscriptEvent(
            f"12:00:{index % 60:02d}",
            "orchestrator",
            f"Step {index}. {'lorem ipsum dolor sit amet ' * 8}{suffix}",
        )
    if index % 3 == 1:
        return TranscriptEvent(
            f"12:00:{index % 60:02d}",
            "coder",
            f"pytest -q tests/test_{index}.py{suffix}",
            kind="tool",
            tool="Bash",
            detail="exit 0",
            status="ok",
            duration=1.2,
            event_key=f"call-{index}",
        )
    return TranscriptEvent(
        f"12:00:{index % 60:02d}", "you", f"and then? ({index}){suffix}", kind="user"
    )


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


def _top_row(view: TranscriptListView) -> tuple[int, int]:
    """The row at the top of the viewport, and where its top edge sits."""
    row = view.indexAt(view.viewport().rect().topLeft()).row()
    return row, view.visualRect(view.transcript_model.index(row, 0)).top()


@verifies(SWR.SWR_2452)
def test_a_reader_who_is_not_at_the_tail_keeps_their_place(qtbot) -> None:
    """Rows arriving below must not move the text somebody is reading."""
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)
    scrollbar = view.verticalScrollBar()
    scrollbar.setValue(scrollbar.maximum() // 2)
    settle(qtbot)
    anchored = _top_row(view)

    for extra in range(6):
        view.set_events([*events, *(_event(_LONG + index) for index in range(extra + 1))])
    settle(qtbot)

    assert _top_row(view) == anchored


@verifies(SWR.SWR_2452)
def test_a_row_growing_above_the_viewport_does_not_move_the_reader(qtbot) -> None:
    """The case a saved pixel position gets wrong, and an anchored row does not."""
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)
    scrollbar = view.verticalScrollBar()
    scrollbar.setValue(scrollbar.maximum() // 2)
    settle(qtbot)
    anchored = _top_row(view)

    # A message far above the viewport gains several lines.
    grown = list(events)
    grown[2] = _event(2, suffix="\n\n" + "a much longer explanation\n" * 12)
    view.set_events(grown)
    settle(qtbot)

    assert _top_row(view) == anchored


@verifies(SWR.SWR_2452)
def test_following_the_tail_lands_at_the_bottom_in_one_step(qtbot) -> None:
    """No pass of the event loop shows the viewport anywhere but the bottom."""
    events = _transcript(_LONG)
    view = _settled_view(qtbot, events)
    scrollbar = view.verticalScrollBar()
    assert view.following_tail
    assert scrollbar.value() == scrollbar.maximum()

    view.set_events([*events, _event(_LONG), _event(_LONG + 1)])

    assert scrollbar.value() == scrollbar.maximum(), (
        "the tail was not reached synchronously - the viewport is showing a "
        "position it will jump away from on the next frame"
    )


@verifies(SWR.SWR_2452)
def test_the_reader_keeps_their_place_among_rows_that_repeat_themselves(qtbot) -> None:
    """A transcript says `ok` a hundred times, and the anchor still means one of them.

    Row identity is content, so every repeat of a message shares it. Resolving
    an anchor to the *first* row carrying that identity throws a reader who is
    a thousand rows further down back to the top - which is what a parallel
    test run caught, on a fixture whose rows all said the same thing.
    """
    events = [
        TranscriptEvent(f"12:00:{index % 60:02d}", "coder", "ok", kind="user")
        for index in range(_LONG)
    ]
    view = _settled_view(qtbot, events)
    scrollbar = view.verticalScrollBar()
    scrollbar.setValue(scrollbar.maximum() // 2)
    settle(qtbot)
    anchored = _top_row(view)
    assert anchored[0] > 1, "fixture too short to tell a near match from a far one"

    view.set_events([*events, TranscriptEvent("12:01", "coder", "ok", kind="user")])
    settle(qtbot)

    assert _top_row(view) == anchored


def _stale_rows(view: TranscriptListView) -> list[tuple[int, int, int]]:
    """Rows whose recorded height disagrees with a measurement taken now.

    The invariant the whole design rests on: measuring only what moved has to
    leave the same geometry that measuring everything would. Anything this
    returns is a row the reader sees at the wrong height, or a row below it
    sitting at the wrong offset.
    """
    before = [view._geometry.height(row) for row in range(len(view._geometry))]
    # The reference has to be what a view built from scratch would show, so the
    # delegate's derived state is dropped too. Re-measuring against a stale
    # recent-tool set would agree with itself and prove nothing.
    view.transcript_delegate._recent_tool_cache = None
    view.remeasure_all()
    after = [view._geometry.height(row) for row in range(len(view._geometry))]
    return [
        (row, was, now)
        for row, (was, now) in enumerate(zip(before, after, strict=True))
        if was != now
    ]


def _tool(index: int) -> TranscriptEvent:
    """A tool row with enough output that collapsing it changes its height."""
    return TranscriptEvent(
        f"12:00:{index % 60:02d}",
        "coder",
        f"cmd {index}",
        kind="tool",
        tool="Bash",
        detail="exit 0\n" + f"output line {index}\n" * 12,
        status="ok",
        duration=1.2,
        event_key=f"call-{index}",
    )


def _auto_collapsing_view(qtbot, *, grouped: bool = False) -> TranscriptListView:
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_auto_collapse_getter(lambda: True)
    view.set_group_tools_getter(lambda: grouped)
    view.resize(900, 600)
    view.show()
    qtbot.waitExposed(view)
    return view


@verifies(SWR.SWR_2452)
def test_expanding_a_tool_group_leaves_no_row_at_a_stale_height(qtbot) -> None:
    """Auto-collapse ties a row's height to rows nowhere near it.

    Only the two most recent tool rows render open, so expanding a group at the
    bottom of the transcript can close a tool row at the top - sixty rows from
    anything that structurally changed. A view that re-measures the whole list
    on every change covers for that by accident; one that measures only what
    moved has to be told, and this is the test that says so.
    """
    events = [
        TranscriptEvent("12:00:00", "coder", "starting"),
        _tool(1),
        *[TranscriptEvent(f"12:01:{i % 60:02d}", "coder", f"note {i}") for i in range(60)],
        _tool(4),
        _tool(5),
        _tool(6),
    ]
    view = _auto_collapsing_view(qtbot, grouped=True)
    view.set_events(events)
    settle(qtbot)
    _force_layout(view)
    assert not _stale_rows(view), "the transcript was already stale before anything moved"

    delegate = view.transcript_delegate
    header = next(e for e in view.transcript_model.events if e.kind == "tool_group")
    identity = _event_identity(header)

    delegate._expanded_groups.add(identity)
    delegate._recent_tool_cache = None
    view.refresh_grouping()
    settle(qtbot)
    assert not _stale_rows(view), "expanding the group left rows at a height nobody re-measured"

    delegate._expanded_groups.discard(identity)
    delegate._recent_tool_cache = None
    view.refresh_grouping()
    settle(qtbot)
    assert not _stale_rows(view), "collapsing the group left rows at a height nobody re-measured"


@verifies(SWR.SWR_2452)
def test_streamed_appends_leave_no_row_at_a_stale_height(qtbot) -> None:
    """The same invariant along the path a live run actually takes."""
    view = _auto_collapsing_view(qtbot)
    events = [TranscriptEvent("12:00:00", "coder", "starting"), _tool(1)]
    view.set_events(events)
    settle(qtbot)
    _force_layout(view)

    for index in range(2, 12):
        arriving = (
            _tool(index)
            if index % 2
            else TranscriptEvent(f"12:00:{index}", "coder", f"note {index}")
        )
        events = [*events, arriving]
        view.set_events(events)
        settle(qtbot)
        assert not _stale_rows(view), f"append {index} left rows at a stale height"


@verifies(SWR.SWR_2452)
def test_truncating_the_tail_leaves_no_row_at_a_stale_height(qtbot) -> None:
    """Removing rows moves the recent-tool pair backwards, opening an older row."""
    view = _auto_collapsing_view(qtbot)
    events = [
        _tool(index) if index % 2 else TranscriptEvent("12:00", "coder", f"note {index}")
        for index in range(10)
    ]
    view.set_events(events)
    settle(qtbot)
    _force_layout(view)
    assert not _stale_rows(view)

    view.set_events(events[:5])
    settle(qtbot)

    assert not _stale_rows(view), "truncation left rows at a stale height"
