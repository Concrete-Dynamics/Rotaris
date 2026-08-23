"""Productive use: the user watches a run with tool grouping on — the default.
Expected outcome: the transcript keeps up, and the rows it shows are the rows
grouping says it should show.

Grouping rewrites which rows exist, so a boundary in source events is not a
boundary in displayed ones. That used to make the incremental path refuse, and
the refusal was not caught: a delta that mutated a row already on screen was
dropped rather than falling back, so a streaming row's token estimate sat still
while its clock ran (SWR-2454, SWR-2432).

Everything here drives ``TranscriptListView`` directly. The grouping rule is a
pure function over a sequence, so the assertion that matters is that the
incremental path and the whole-list path produce *the same list* — which is
checked against ``group_tool_runs`` itself rather than against a hand-written
expectation that could drift from it.
"""

from __future__ import annotations

import pytest
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import TranscriptEvent
from rotaris.views.transcript import TranscriptListView, group_tool_runs

pytestmark = pytest.mark.unit


def _tool(
    tool: str, text: str = "", *, role: str = "coder-1", status: str = "ok"
) -> TranscriptEvent:
    return TranscriptEvent(
        timestamp="12:00:00", role=role, text=text or tool, kind="tool", tool=tool, status=status
    )


def _message(text: str, *, role: str = "coder-1") -> TranscriptEvent:
    return TranscriptEvent(timestamp="12:00:00", role=role, text=text, kind="message")


def _thinking(text: str, *, role: str = "coder-1") -> TranscriptEvent:
    return TranscriptEvent(timestamp="12:00:00", role=role, text=text, kind="thinking")


def _view(qtbot, *, grouping: bool = True) -> TranscriptListView:
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_group_tools_getter(lambda: grouping)
    return view


def _displayed(view: TranscriptListView) -> list[tuple[str, str]]:
    return [(event.kind, event.text) for event in view.transcript_model.events]


def _expected(view: TranscriptListView, events: list[TranscriptEvent]) -> list[tuple[str, str]]:
    """What the whole-list path would show for *events* — the reference answer."""
    projected = group_tool_runs(events, view.transcript_delegate.expanded_groups)
    return [(event.kind, event.text) for event in projected]


@verifies(SWR.SWR_2454, SWR.SWR_2432)
def test_a_streaming_row_grows_on_screen_with_grouping_on(qtbot) -> None:
    """Productive use: the model is reasoning, and the row says how long and how
    much. Expected outcome: the estimate climbs while it streams.

    The reported defect, at its smallest: the row exists, the delta mutates it in
    place, and with grouping on nothing reached the view."""
    view = _view(qtbot)
    events = [_message("what does this codebase do?"), _thinking("reasoning · ~1 tok")]
    assert view.set_events(list(events))

    events[-1] = _thinking("reasoning · ~123 tok")
    assert view.apply_events_delta(1, [events[-1]]) is True

    assert _displayed(view) == _expected(view, events)
    assert ("thinking", "reasoning · ~123 tok") in _displayed(view)


@verifies(SWR.SWR_2432, SWR.SWR_2454)
def test_a_tool_row_joining_a_run_regroups_the_run(qtbot) -> None:
    """Productive use: a third read_file lands on a run of two.
    Expected outcome: the group header counts three, not a stray row beside a
    header of two."""
    view = _view(qtbot)
    events = [_message("go"), _tool("read_file", "a"), _tool("read_file", "b")]
    assert view.set_events(list(events))
    grouped_two = _displayed(view)

    events.append(_tool("read_file", "c"))
    assert view.apply_events_delta(3, [events[-1]]) is True

    assert _displayed(view) == _expected(view, events)
    assert _displayed(view) != grouped_two


@verifies(SWR.SWR_2432, SWR.SWR_2454)
def test_a_run_that_falls_below_the_minimum_ungroups(qtbot) -> None:
    """Productive use: the tail of a run is replaced by something else.
    Expected outcome: what is left reads as ordinary rows, not as a group of one.

    The shrinking direction, which is the one a boundary computed from the *new*
    source alone would get wrong."""
    view = _view(qtbot)
    events = [_message("go"), _tool("read_file", "a"), _tool("read_file", "b")]
    assert view.set_events(list(events))

    events[2:] = [_message("done")]
    assert view.apply_events_delta(2, [events[2]]) is True

    assert _displayed(view) == _expected(view, events)


@verifies(SWR.SWR_2432, SWR.SWR_2454)
def test_a_tool_row_changing_family_splits_the_run(qtbot) -> None:
    """Productive use: a row that was a read becomes a write.
    Expected outcome: it leaves the run it was in, and the run re-forms without
    it. Requires backing up over the run in front of the boundary."""
    view = _view(qtbot)
    events = [_tool("read_file", "a"), _tool("read_file", "b"), _tool("read_file", "c")]
    assert view.set_events(list(events))

    events[2] = _tool("write_file", "c")
    assert view.apply_events_delta(2, [events[2]]) is True

    assert _displayed(view) == _expected(view, events)


@verifies(SWR.SWR_2432, SWR.SWR_2454)
def test_the_incremental_and_whole_list_paths_agree_row_for_row(qtbot) -> None:
    """Productive use: an ordinary run — messages, reasoning, runs of tool calls.
    Expected outcome: feeding it a row at a time through the delta path leaves
    exactly what feeding it whole would have.

    The property the other tests are instances of. Two derivations of one list
    that must not be allowed to disagree."""
    view = _view(qtbot)
    script: list[TranscriptEvent] = [
        _message("go"),
        _thinking("thinking"),
        _tool("read_file", "a"),
        _tool("read_file", "b"),
        _tool("read_file", "c"),
        _message("found it"),
        _tool("grep", "x"),
        _tool("glob", "y"),
        _tool("write_file", "z"),
        _thinking("more thinking"),
        _tool("read_file", "d", role="coder-2"),
        _message("done"),
    ]
    assert view.set_events([script[0]])

    for index in range(1, len(script)):
        assert view.apply_events_delta(index, [script[index]]) is True, f"refused at {index}"
        assert _displayed(view) == _expected(view, script[: index + 1]), f"diverged at {index}"


@verifies(SWR.SWR_2454)
def test_grouping_off_still_takes_the_plain_boundary(qtbot) -> None:
    """Productive use: the user turned grouping off.
    Expected outcome: unchanged behaviour — the source boundary is the displayed
    boundary, and no regrouping happens at all."""
    view = _view(qtbot, grouping=False)
    events = [_message("go"), _tool("read_file", "a"), _tool("read_file", "b")]
    assert view.set_events(list(events))

    events.append(_message("done"))
    assert view.apply_events_delta(3, [events[-1]]) is True

    assert _displayed(view) == [(event.kind, event.text) for event in events]
