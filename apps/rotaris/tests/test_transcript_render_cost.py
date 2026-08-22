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

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import TranscriptEvent
from rotaris.views.transcript import TranscriptListView

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


def _settled_view(qtbot, events: list[TranscriptEvent]) -> TranscriptListView:
    """A shown, fully laid-out transcript — the state a reader is looking at."""
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.resize(900, 600)
    view.show()
    qtbot.waitExposed(view)
    view.set_events(events)
    _force_layout(view)
    return view


def _force_layout(view: TranscriptListView) -> None:
    """Ask for the geometry the way a paint would, so nothing is left pending."""
    model = view.transcript_model
    for row in range(model.rowCount()):
        view.visualRect(model.index(row, 0))


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
