from __future__ import annotations

from io import StringIO

from rich.console import Console

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.palette import RenderPalette
from rotaris_core.tui.themes import get_theme
from rotaris_core.tui.widgets.agent_status import AgentStatusPane


def _render_text(widget: AgentStatusPane) -> str:
    console = Console(file=StringIO(), force_terminal=True, width=120)
    console.print(widget._build_renderable())
    return console.file.getvalue()


@verifies(SWR.SWR_1003, SWR.SWR_1009, SWR.SWR_1414)
def test_agent_status_pane_animates_running_tool() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "display_name": "Test Agent",
                "state": "running",
                "activity_icon": "ANIMATED_TOOL",
                "activity_text": "find: scanning docs",
                "activity_phase": "tool",
                "persona": "Tester",
                "started_at": 0.0,
            },
        ],
    )

    widget._animation_frame = 0
    output = _render_text(widget)

    assert "⠋ find: scanning docs" in output
    assert "[TOOL]" not in output


@verifies(SWR.SWR_1003, SWR.SWR_1009)
def test_agent_status_pane_animates_summarizing_activity() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "display_name": "Test Agent",
                "state": "summarizing",
                "activity_icon": "ANIMATED_THINKING",
                "activity_text": "Summarizing response",
                "activity_phase": "summarizing",
                "persona": "Tester",
                "started_at": 0.0,
            },
        ],
    )

    widget._animation_frame = 0
    output = _render_text(widget)

    assert "⠋ Summarizing response" in output
    assert "summarizing" in output


@verifies(SWR.SWR_1003, SWR.SWR_1009, SWR.SWR_1414)
def test_agent_status_pane_renders_static_check_after_success() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "display_name": "Test Agent",
                "state": "running",
                "activity_icon": "[+]",
                "activity_text": "find: scanning docs",
                "activity_phase": "completed",
                "persona": "Tester",
                "started_at": 0.0,
            },
        ],
    )

    output = _render_text(widget)

    assert "[+] find: scanning docs" in output
    assert "[OK]" not in output
    assert "[TOOL]" not in output
    assert "⠋ find: scanning docs" not in output


@verifies(SWR.SWR_1003, SWR.SWR_1009, SWR.SWR_1015, SWR.SWR_1414)
def test_agent_status_pane_uses_non_emoji_error_symbol() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "display_name": "Test Agent",
                "state": "failed",
                "activity_icon": "[-]",
                "activity_text": "find failed",
                "activity_phase": "failed",
                "persona": "Tester",
                "started_at": 0.0,
            },
        ],
    )

    output = _render_text(widget)

    assert "[-] find failed" in output
    assert "❌" not in output


@verifies(SWR.SWR_1414)
def test_agent_status_pane_animates_waiting_activity_with_single_symbol() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "display_name": "Test Agent",
                "state": "running",
                "activity_icon": "ANIMATED_WAITING",
                "activity_text": "Waiting on child agents",
                "activity_phase": "waiting",
                "persona": "Tester",
                "started_at": 0.0,
            },
        ],
    )

    widget._animation_frame = 0
    output = _render_text(widget)
    assert "◴ Waiting on child agents" in output

    widget._animation_frame = 1
    output = _render_text(widget)
    assert "◷ Waiting on child agents" in output

    widget._animation_frame = 2
    output = _render_text(widget)
    assert "◶ Waiting on child agents" in output

    widget._animation_frame = 3
    output = _render_text(widget)
    assert "◵ Waiting on child agents" in output


@verifies(SWR.SWR_1079)
def test_agent_status_pane_sorts_serialized_timestamps_newest_first() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "older",
                "canonical_name": "older",
                "persona": "Tester",
                "state": "queued",
                "spawned_at": "2026-06-09T12:16:10.195712Z",
            },
            {
                "name": "newer",
                "canonical_name": "newer",
                "persona": "Tester",
                "state": "queued",
                "spawned_at": "2026-06-09T12:18:10.195712Z",
            },
        ],
    )

    assert widget._flattened_order() == ["newer", "older"]


@verifies(SWR.SWR_1003, SWR.SWR_1055)
def test_agent_status_pane_groups_children_under_parent_with_indentation() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "child",
                "canonical_name": "parent.child",
                "persona": "Tester",
                "state": "queued",
                "parent_agent_id": "parent",
                "spawned_at": "2026-06-09T12:18:10.195712Z",
            },
            {
                "name": "parent",
                "canonical_name": "parent",
                "persona": "Coordinator",
                "state": "running",
                "spawned_at": "2026-06-09T12:16:10.195712Z",
            },
            {
                "name": "sibling",
                "canonical_name": "parent.sibling",
                "persona": "Tester",
                "state": "queued",
                "parent_agent_id": "parent",
                "spawned_at": "2026-06-09T12:17:10.195712Z",
            },
        ],
    )

    palette = RenderPalette.from_theme(get_theme())
    child_row = widget._render_compact_row(
        widget._agent_by_canonical("parent.child") or {},
        palette,
    )
    sibling_row = widget._render_compact_row(
        widget._agent_by_canonical("parent.sibling") or {},
        palette,
    )

    assert widget._flattened_order() == ["parent", "parent.child", "parent.sibling"]
    # Non-last child renders with ├─ tree connector; last child renders with └─.
    assert child_row.plain.startswith("  ├─ ")
    assert sibling_row.plain.startswith("  └─ ")


@verifies(SWR.SWR_1003)
def test_agent_status_pane_renders_elapsed_from_serialized_datetimes() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "display_name": "Test Agent",
                "canonical_name": "test_agent",
                "state": "succeeded",
                "activity_icon": "[+]",
                "activity_text": "done",
                "activity_phase": "completed",
                "persona": "Tester",
                "spawned_at": "2026-05-21T10:00:00+00:00",
                "completed_at": "2026-05-21T10:02:03+00:00",
            },
        ],
    )

    output = _render_text(widget)

    assert "2m 3s" in output


@verifies(SWR.SWR_1003)
def test_agent_status_summary_keeps_blocked_out_of_fail_count() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "blocked_agent",
                "canonical_name": "blocked_agent",
                "persona": "Tester",
                "state": "blocked",
            },
            {
                "name": "failed_agent",
                "canonical_name": "failed_agent",
                "persona": "Tester",
                "state": "failed",
            },
        ],
    )

    summary = widget._render_summary().plain

    assert "block 1" in summary
    assert "fail 1" in summary


@verifies(SWR.SWR_1076)
def test_agent_status_pane_collapses_empty_recent_activity_log() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "canonical_name": "test_agent",
                "persona": "Tester",
                "state": "running",
            },
        ],
        activity_events=[],
        show_activity_log=True,
    )

    output = _render_text(widget)

    assert "Recent Activity: none" in output
    assert "No tool events yet." not in output


@verifies(SWR.SWR_1076, SWR.SWR_1055)
def test_agent_status_pane_caps_recent_activity_to_bottom_third_budget() -> None:
    widget = AgentStatusPane()

    widget.update_agents(
        [
            {
                "name": "test_agent",
                "canonical_name": "test_agent",
                "persona": "Tester",
                "state": "running",
            },
        ],
        activity_events=[
            {
                "agent_name": f"agent-{index}",
                "text": f"event-{index}",
            }
            for index in range(5)
        ],
        show_activity_log=True,
    )

    assert widget._activity_log_line_budget(pane_height=12) == 4

    palette = RenderPalette.from_theme(get_theme())
    activity = widget._render_activity_log(palette, pane_height=12)
    output = activity.plain

    assert "── Recent Activity ──" in output
    assert "event-0" not in output
    assert "event-1" not in output
    assert "event-3" in output
    assert "event-4" in output
    assert "⋮ 3 older event(s)" in output
