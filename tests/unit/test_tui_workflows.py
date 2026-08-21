"""TUI workflow tests — three mandatory categories (REQ-003, REQ-004, REQ-005).

Category 1 — Full user workflow paths  (REQ-003): A-to-Z flows using Pilot.
Category 2 — Alternative workflow paths (REQ-004): non-default entry points.
Category 3 — Random interaction tests  (REQ-005): unexpected actions, no crash.
Snapshot tests — visual regression     (REQ-011): pytest-textual-snapshot.

Every simulated interaction is followed by ``await pilot.pause()`` before any
assertion, ensuring the Textual message queue has fully drained (REQ-012).

Run snapshot baseline update (after visual review) with::

    pytest tests/unit/test_tui_workflows.py --snapshot-update
"""

from __future__ import annotations

import asyncio
import contextlib
import threading
import time
from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock

import pytest

from rotaris_core import __version__
from rotaris_core.config.defaults import DEFAULT_CONFIG
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask
from rotaris_core.tui.app import RotarisTuiApp, ToggleToolEvents
from rotaris_core.tui.widgets.agent_status import AgentStatusPane
from rotaris_core.tui.widgets.chat_panel import ChatPanel
from rotaris_core.tui.widgets.info_pane import InfoPane
from rotaris_core.tui.widgets.input_composer import InputComposer
from rotaris_core.tui.widgets.todo_pane import TodoPane

if TYPE_CHECKING:
    from textual.pilot import Pilot


async def _press_leader_shortcut(pilot: Pilot[Any], key: str, *, leader: str = "ctrl+x") -> None:
    await pilot.press(leader)
    await pilot.pause()
    await pilot.press(key)
    await pilot.pause()


def _session_with_transcript(line_count: int) -> MagicMock:
    session = MagicMock()
    session.execution_status = "succeeded"
    session.child_states = []
    session.transcript_events = [
        {"role": "system", "content": f"line-{index}"} for index in range(line_count)
    ]
    session.todo_state = None
    session.agent_todo_state = None
    return session


# ---------------------------------------------------------------------------
# Category 1: Full User Workflow Tests (REQ-003)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1002, SWR.SWR_1005, SWR.SWR_1203, SWR.SWR_1208, SWR.SWR_1210)
async def test_full_workflow_type_and_submit_via_enter_adds_user_message() -> None:
    """Full A-to-Z: user types text and presses Enter → ChatPanel records the message."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        chat = app.screen.query_one(ChatPanel)
        initial_lines = len(chat.lines)

        await pilot.press("h", "e", "l", "l", "o")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()

        assert len(chat.lines) > initial_lines


@verifies(SWR.SWR_1002, SWR.SWR_1204)
async def test_full_workflow_no_session_adds_user_and_system_messages() -> None:
    """Without a session manager, submitting records a user message and a system fallback notice."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        chat = app.screen.query_one(ChatPanel)

        await pilot.press("h", "i")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()

        # Both user message and system fallback notice must have been written.
        assert len(chat.lines) >= 2


@verifies(SWR.SWR_1005)
async def test_full_workflow_multiline_type_and_submit_via_ctrl_j() -> None:
    """Full workflow via multiline path: leader-E → type → Ctrl+J → message in ChatPanel."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        chat = app.screen.query_one(ChatPanel)
        initial_lines = len(chat.lines)

        # Toggle to multiline mode.
        await _press_leader_shortcut(pilot, "e")
        composer = app.screen.query_one(InputComposer)
        assert composer.multiline is True

        # Type and submit via Ctrl+J.
        await pilot.press("h", "i")
        await pilot.pause()
        await pilot.press("ctrl+j")
        await pilot.pause()

        assert len(chat.lines) > initial_lines


@verifies(SWR.SWR_1203)
async def test_full_workflow_empty_input_does_not_add_message() -> None:
    """Submitting an empty Input produces no ChatPanel entry — blank messages are ignored."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        chat = app.screen.query_one(ChatPanel)
        initial_lines = len(chat.lines)

        # Press Enter without typing anything.
        await pilot.press("enter")
        await pilot.pause()

        assert len(chat.lines) == initial_lines


@verifies(SWR.SWR_1203, SWR.SWR_1154, SWR.SWR_1155)
async def test_full_workflow_prompt_history_cycles_from_newest_to_empty() -> None:
    """Submitted prompts are recalled with Up/Down and return to the unsent state at the tail."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        composer = app.screen.query_one(InputComposer)

        for prompt in ("alpha", "beta", "gamma"):
            await pilot.press(*list(prompt))
            await pilot.pause()
            await pilot.press("enter")
            await pilot.pause()

        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "gamma"

        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "beta"

        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "alpha"

        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "alpha"

        await pilot.press("down")
        await pilot.pause()
        assert composer.input_widget.value == "beta"

        await pilot.press("down")
        await pilot.pause()
        assert composer.input_widget.value == "gamma"

        await pilot.press("down")
        await pilot.pause()
        assert composer.input_widget.value == ""


@verifies(SWR.SWR_1005, SWR.SWR_1203, SWR.SWR_1160)
async def test_full_workflow_prompt_history_persists_across_app_restarts(tmp_path: Any) -> None:
    """Submitted prompts survive app restart when both apps point at the same workspace."""
    config = DEFAULT_CONFIG.model_copy(update={"workspace_root": tmp_path})

    first_app = RotarisTuiApp(config=config)
    async with first_app.run_test() as pilot:
        await pilot.pause()
        composer = first_app.screen.query_one(InputComposer)
        assert composer.prompt_history_path == tmp_path / ".rotaris" / "prompt_history.json"

        await pilot.press("r", "e", "u", "s", "e")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()

    second_app = RotarisTuiApp(config=config)
    async with second_app.run_test() as pilot:
        await pilot.pause()
        composer = second_app.screen.query_one(InputComposer)

        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "reuse"


# ---------------------------------------------------------------------------
# Category 2: Alternative Workflow Path Tests (REQ-004)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1204, SWR.SWR_1208, SWR.SWR_1210, SWR.SWR_1211)
async def test_alt_path_submit_via_ctrl_j_in_multiline_mode() -> None:
    """Alternative submit: leader-E to enter multiline, then Ctrl+J instead of Enter."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        chat = app.screen.query_one(ChatPanel)
        initial_lines = len(chat.lines)

        await _press_leader_shortcut(pilot, "e")  # enter multiline mode
        await pilot.press("t", "e", "s", "t")
        await pilot.pause()
        await pilot.press("ctrl+j")  # submit — alternative to Enter
        await pilot.pause()

        assert len(chat.lines) > initial_lines


@verifies(SWR.SWR_1309)
async def test_alt_path_ctrl_q_exits_app_without_crash() -> None:
    """Alternative exit path: leader-Q quits the app without raising any exception."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        await _press_leader_shortcut(pilot, "q")
    # Reaching this point without an exception means the test passes.


@verifies(SWR.SWR_1303, SWR.SWR_1309)
async def test_alt_path_ctrl_q_stops_active_run_and_keeps_app_responsive() -> None:
    """Alternative exit path: leader-Q during an active run must keep the TUI responsive."""
    app = RotarisTuiApp()
    stop_calls: list[bool] = []

    def _request_interrupt_stop(*, force: bool) -> None:
        stop_calls.append(force)

    async with app.run_test() as pilot:
        await pilot.pause()
        session = MagicMock()
        session.token_usage = {"total_tokens": 0}
        session.execution_status = "running"
        session.child_states = [
            {
                "name": "root-task",
                "canonical_name": "root-task",
                "persona": "orchestrator",
                "state": "running",
            },
        ]
        session.transcript_events = []
        session.todo_state = None
        session.agent_todo_state = None
        app.current_session = session
        active_task = asyncio.create_task(asyncio.sleep(60))
        app._run_task = active_task
        app.request_interrupt_stop = _request_interrupt_stop
        await pilot.pause()

        await _press_leader_shortcut(pilot, "q")

        assert stop_calls == [False]
        assert app._pending_exit_after_run is True
        assert app.screen.query_one(ChatPanel) is not None
        assert app.screen.query_one(InputComposer) is not None

        await pilot.press("f5")
        await pilot.pause()
        assert app.screen.query_one(AgentStatusPane) is not None


@verifies(SWR.SWR_1309, SWR.SWR_1311)
async def test_alt_path_ctrl_q_late_safe_dispatch_is_ignored_after_loop_is_unavailable() -> None:
    """Late shutdown callbacks must be dropped once the Textual loop is unavailable."""
    app = RotarisTuiApp()
    stop_calls: list[bool] = []
    dispatched: list[str] = []

    def _request_interrupt_stop(*, force: bool) -> None:
        stop_calls.append(force)

    async with app.run_test() as pilot:
        await pilot.pause()
        session = MagicMock()
        session.token_usage = {"total_tokens": 0}
        session.execution_status = "running"
        session.child_states = [
            {
                "name": "root-task",
                "canonical_name": "root-task",
                "persona": "orchestrator",
                "state": "running",
            },
        ]
        session.transcript_events = []
        session.todo_state = None
        session.agent_todo_state = None
        app.current_session = session
        active_task = asyncio.create_task(asyncio.sleep(60))
        app._run_task = active_task
        app.request_interrupt_stop = _request_interrupt_stop
        await pilot.pause()

        await _press_leader_shortcut(pilot, "q")

        app._loop = None
        results: list[bool] = []

        worker = threading.Thread(
            target=lambda: results.append(
                app.safe_call_from_thread(lambda value: dispatched.append(value), "late-token"),
            ),
            daemon=True,
        )
        worker.start()
        worker.join()

        assert stop_calls == [False]
        assert results == [False]
        assert dispatched == []

        active_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await active_task

        app._run_task = None
        app._clear_shutdown_state()
        active_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await active_task


@verifies(SWR.SWR_1085)
async def test_alt_path_toggle_tool_events_flips_reactive() -> None:
    """Alternative: posting ToggleToolEvents (e.g. via command palette) flips show_tool_events."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        assert app.show_tool_events is False

        app.post_message(ToggleToolEvents())
        await pilot.pause()
        assert app.show_tool_events is True

        app.post_message(ToggleToolEvents())
        await pilot.pause()
        assert app.show_tool_events is False


@verifies(SWR.SWR_1005)
async def test_alt_path_multiline_toggle_back_carries_text_to_single_line() -> None:
    """Alt path: enter multiline, type, toggle back — text carries to the single-line Input."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        composer = app.screen.query_one(InputComposer)

        await _press_leader_shortcut(pilot, "e")  # single-line → multiline
        assert composer.multiline is True

        await pilot.press("h", "i")
        await pilot.pause()

        await _press_leader_shortcut(pilot, "e")  # multiline → single-line
        assert composer.multiline is False
        # Text must have been carried back (newlines replaced with spaces).
        assert composer.input_widget.value == "hi"


@verifies(SWR.SWR_1005, SWR.SWR_1159)
async def test_alt_path_multiline_history_toggle_preserves_loaded_prompt() -> None:
    """History-loaded prompt transfers cleanly when toggling between single-line and multiline."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        composer = app.screen.query_one(InputComposer)

        for prompt in ("first prompt", "second prompt"):
            await pilot.press(*list(prompt))
            await pilot.pause()
            await pilot.press("enter")
            await pilot.pause()

        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "second prompt"

        await _press_leader_shortcut(pilot, "e")
        assert composer.multiline is True
        assert composer.textarea_widget.text == "second prompt"

        await pilot.press("up")
        await pilot.pause()
        assert composer.textarea_widget.text == "first prompt"

        await _press_leader_shortcut(pilot, "e")
        assert composer.multiline is False
        assert composer.input_widget.value == "first prompt"


@verifies(SWR.SWR_1169)
async def test_alt_path_command_palette_opens_and_dismisses() -> None:
    """Leader-P opens the command palette, and Escape cleanly returns to the main screen."""
    from rotaris_core.tui.screens.command_palette_cheatsheet import CommandPaletteCheatsheetScreen

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        await _press_leader_shortcut(pilot, "p")
        assert isinstance(app.screen, CommandPaletteCheatsheetScreen)

        await pilot.press("escape")
        await pilot.pause()
        # Main screen must be restored.
        assert app.screen.__class__.__name__ == "MainScreen"


# ---------------------------------------------------------------------------
# Category 3: Random Interaction Tests (REQ-005)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1205, SWR.SWR_1208, SWR.SWR_1210, SWR.SWR_1211)
async def test_random_interactions_do_not_crash_and_leave_widgets_queryable() -> None:
    """Unexpected key paths keep the app usable across several interaction patterns."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        await pilot.press("f5")
        await pilot.pause()
        assert app.screen.query_one(InputComposer) is not None
        assert app.screen.query_one(ChatPanel) is not None

        await pilot.press("escape")
        await pilot.pause()
        assert app.screen.query_one(AgentStatusPane) is not None
        assert app.screen.query_one(TodoPane) is not None

        for key in ("f1", "f2", "f3", "f4", "f6", "f7", "f8", "f9", "f10"):
            await pilot.press(key)
        await pilot.pause()
        assert app.screen.query_one(ChatPanel) is not None
        assert app.screen.query_one(InputComposer) is not None
        assert app.screen.query_one(AgentStatusPane) is not None
        assert app.screen.query_one(TodoPane) is not None

        composer = app.screen.query_one(InputComposer)

        for _ in range(6):  # three full on/off cycles
            await _press_leader_shortcut(pilot, "e")

        # After an even number of toggles, multiline must be back to False.
        assert composer.multiline is False
        assert app.screen.query_one(InputComposer) is not None

        await pilot.press("h", "e", "y")
        await pilot.pause()
        await pilot.press("f5")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()
        assert app.screen.query_one(ChatPanel) is not None


@verifies(SWR.SWR_1205, SWR.SWR_1157)
async def test_random_history_edit_keeps_navigation_anchored_to_loaded_entry() -> None:
    """Editing a recalled prompt keeps further Up navigation moving toward older entries."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        composer = app.screen.query_one(InputComposer)

        for prompt in ("one", "two", "three"):
            await pilot.press(*list(prompt))
            await pilot.pause()
            await pilot.press("enter")
            await pilot.pause()

        await pilot.press("up")
        await pilot.pause()
        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "two"

        await pilot.press("!")
        await pilot.pause()
        assert composer.input_widget.value == "two!"

        await pilot.press("up")
        await pilot.pause()
        assert composer.input_widget.value == "one"


# ---------------------------------------------------------------------------
# Layout Regression Tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1428)
async def test_layout_prompt_corner_shows_current_version() -> None:
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        composer = app.screen.query_one(InputComposer)

        assert composer.border_subtitle == f" v{__version__} "


@verifies(
    SWR.SWR_1029,
    SWR.SWR_1030,
    SWR.SWR_1031,
    SWR.SWR_1032,
    SWR.SWR_1035,
    SWR.SWR_1429,
    SWR.SWR_1045,
    SWR.SWR_1082,
)
async def test_layout_right_rail_panels_scroll_independently_with_default_split() -> None:
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        agent_pane = app.screen.query_one(AgentStatusPane)
        info_pane = app.screen.query_one(InfoPane)
        todo_pane = app.screen.query_one(TodoPane)
        agent_scroll = app.screen.query_one("#agent-status")
        info_scroll = app.screen.query_one("#info-pane")
        todo_scroll = app.screen.query_one("#todo-pane")

        agent_pane.update_agents(
            [
                {
                    "canonical_name": f"agent-{index}",
                    "name": f"agent-{index}",
                    "persona": f"worker-{index}",
                    "state": "running",
                    "started_at": time.monotonic(),
                    "tool_call_count": index,
                }
                for index in range(160)
            ],
        )
        info_pane.update_info(
            model_name="openai/gpt-5.4",
            workspace="/tmp/very/long/workspace/path",
            token_estimate=123_456,
            tools=[{"name": f"tool-{index}", "used": index % 2 == 0} for index in range(120)],
            warnings=[{"level": "warning", "text": f"warning {index}"} for index in range(80)],
            todos_summary="\n".join(f"task {index}" for index in range(120)),
        )
        todo_pane.update_todos(
            TodoList(
                phases=[
                    TodoPhase(
                        name="Execution",
                        tasks=[TodoTask(name=f"task {index}") for index in range(160)],
                    ),
                ],
            ),
        )
        await pilot.pause()

        agent_height = agent_scroll.outer_size.height
        info_height = info_scroll.outer_size.height
        todo_height = todo_scroll.outer_size.height

        assert agent_scroll.max_scroll_y > 0
        assert info_scroll.max_scroll_y > 0
        assert todo_scroll.max_scroll_y > 0
        assert abs(agent_height - info_height) <= 6
        assert agent_height >= todo_height * 2 - 8
        assert agent_height <= todo_height * 2 + 8
        assert info_height >= todo_height * 2 - 8
        assert info_height <= todo_height * 2 + 8

        agent_scroll.scroll_end(animate=False)
        await pilot.pause()

        assert agent_scroll.scroll_y > 0
        assert info_scroll.scroll_y == 0
        assert todo_scroll.scroll_y == 0


@verifies(SWR.SWR_1033, SWR.SWR_1037)
async def test_layout_agent_panel_remeasures_when_details_wrap() -> None:
    app = RotarisTuiApp()
    async with app.run_test(size=(70, 18)) as pilot:
        await pilot.pause()

        agent_pane = app.screen.query_one(AgentStatusPane)
        agent_scroll = app.screen.query_one("#agent-status")

        agent_pane.update_agents(
            [
                {
                    "canonical_name": "agent-1",
                    "name": "agent-1",
                    "persona": "worker",
                    "state": "running",
                    "started_at": time.monotonic(),
                    "tool_call_count": 1,
                    "activity_text": "short",
                    "activity_phase": "tool",
                },
            ],
        )
        await pilot.pause()

        short_height = agent_pane.virtual_size.height
        short_max_scroll = agent_scroll.max_scroll_y

        agent_pane.update_agents(
            [
                {
                    "canonical_name": "agent-1",
                    "name": "agent-1",
                    "persona": "worker-with-a-very-long-persona-name",
                    "state": "running",
                    "started_at": time.monotonic(),
                    "tool_call_count": 2,
                    "activity_icon": "ANIMATED_TOOL",
                    "activity_text": (
                        "This is a very long activity detail that should wrap across "
                        "multiple visual lines in the agent panel so the scroll region "
                        "must grow to keep the bottom of the entry reachable."
                    ),
                    "activity_phase": "tool",
                },
            ],
        )
        await pilot.pause()

        assert agent_pane.virtual_size.height > short_height
        assert agent_scroll.max_scroll_y > short_max_scroll


# ---------------------------------------------------------------------------
# Snapshot Tests — Visual Regression (REQ-011)
# ---------------------------------------------------------------------------
# On first run these tests will FAIL (no baseline SVG yet).
# After visually confirming the rendered output is correct, commit the
# baseline with:  pytest tests/unit/test_tui_workflows.py --snapshot-update


@verifies(SWR.SWR_1209)
def test_snapshot_initial_app_layout(snap_compare: Any) -> None:
    """Baseline snapshot: initial RotarisTuiApp layout with no session and an empty chat."""
    assert snap_compare(RotarisTuiApp())


@verifies(SWR.SWR_1209)
def test_snapshot_after_user_message_submitted(snap_compare: Any) -> None:
    """Snapshot: layout after a user submits a message (no-session fallback state visible)."""

    async def run_before(pilot: Pilot[Any]) -> None:
        await pilot.press("h", "e", "l", "l", "o")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()

    assert snap_compare(RotarisTuiApp(), run_before=run_before)


@verifies(SWR.SWR_1209)
def test_snapshot_multiline_mode_active(snap_compare: Any) -> None:
    """Snapshot: layout when multiline mode is toggled on (TextArea visible, Input hidden)."""

    async def run_before(pilot: Pilot[Any]) -> None:
        await _press_leader_shortcut(pilot, "e")

    assert snap_compare(RotarisTuiApp(), run_before=run_before)


@verifies(SWR.SWR_1209)
def test_snapshot_chat_with_streaming_markdown(snap_compare: Any) -> None:
    """Snapshot: chat panel renders streaming markdown with bold, code, list, and links."""

    async def run_before(pilot: Pilot[Any]) -> None:
        chat = pilot.app.screen.query_one(ChatPanel)
        # Add a realistic streaming message with mixed markdown content.
        stream_text = (
            "Here is my analysis:\n\n"
            "- **Bold finding**: the config is correct\n"
            "- `code snippet`: `import reactor`\n"
            "- Reference: https://example.com/docs\n\n"
            "Status: **all clear**"
        )
        chat.add_streaming_agent_message(
            "worker",
            stream_text,
            phase="streaming",
        )
        await pilot.pause()

    assert snap_compare(RotarisTuiApp(), run_before=run_before)


# ---------------------------------------------------------------------------
# Mouse-wheel routing — REQ-20260426-020611-006: scroll events stay inside
# the hovered/focused panel and do not bubble to siblings.
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1034)
async def test_mouse_wheel_scroll_on_agents_pane_does_not_move_other_rail_panels() -> None:
    """REQ-20260426-020611-006: scrolling the agent-status panel via mouse
    wheel must not displace the info or todo panels in the right rail nor
    the chat panel on the left.
    """
    from textual import events

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        agent_pane = app.screen.query_one(AgentStatusPane)
        agent_scroll = app.screen.query_one("#agent-status")
        info_scroll = app.screen.query_one("#info-pane")
        todo_scroll = app.screen.query_one("#todo-pane")
        chat = app.screen.query_one(ChatPanel)

        # Fill the agents pane with enough content to overflow.
        agent_pane.update_agents(
            [
                {
                    "canonical_name": f"agent-{idx}",
                    "name": f"agent-{idx}",
                    "persona": f"worker-{idx}",
                    "state": "running",
                    "started_at": time.monotonic(),
                    "tool_call_count": idx,
                }
                for idx in range(160)
            ],
        )
        await pilot.pause()

        assert agent_scroll.max_scroll_y > 0
        baseline_chat_y = chat.scroll_y
        baseline_info_y = info_scroll.scroll_y
        baseline_todo_y = todo_scroll.scroll_y

        # Dispatch several mouse-scroll-down events directly to the agent
        # scroll container. The Textual scroll container handles the event
        # locally without bubbling, which is the routing contract under test.
        for _ in range(10):
            agent_scroll.post_message(
                events.MouseScrollDown(
                    widget=agent_scroll,
                    x=1,
                    y=1,
                    delta_x=0,
                    delta_y=1,
                    button=0,
                    shift=False,
                    meta=False,
                    ctrl=False,
                    screen_x=1,
                    screen_y=1,
                ),
            )
        await pilot.pause()

        assert agent_scroll.scroll_y > 0, "agents scroll container did not consume the wheel events"
        assert info_scroll.scroll_y == baseline_info_y, (
            "info pane moved when wheel was routed to agents"
        )
        assert todo_scroll.scroll_y == baseline_todo_y, (
            "todo pane moved when wheel was routed to agents"
        )
        assert chat.scroll_y == baseline_chat_y, "chat panel moved when wheel was routed to agents"


@verifies(SWR.SWR_1034, SWR.SWR_1082)
async def test_mouse_wheel_scroll_on_chat_does_not_move_right_rail_panels() -> None:
    """REQ-20260426-020611-006 (reverse direction): scrolling on the chat
    panel must not budge the right-rail scroll containers.
    """
    from textual import events

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        chat = app.screen.query_one(ChatPanel)
        agent_scroll = app.screen.query_one("#agent-status")
        info_scroll = app.screen.query_one("#info-pane")
        todo_scroll = app.screen.query_one("#todo-pane")

        for idx in range(200):
            chat.add_system_message(f"line-{idx}")
        await pilot.pause()

        baseline_agent = agent_scroll.scroll_y
        baseline_info = info_scroll.scroll_y
        baseline_todo = todo_scroll.scroll_y

        # Scroll up on the chat panel — chat enters paused-follow state and
        # auto_scroll flips off. Right-rail panels must remain untouched.
        for _ in range(5):
            chat.post_message(
                events.MouseScrollUp(
                    widget=chat,
                    x=1,
                    y=1,
                    delta_x=0,
                    delta_y=1,
                    button=0,
                    shift=False,
                    meta=False,
                    ctrl=False,
                    screen_x=1,
                    screen_y=1,
                ),
            )
        await pilot.pause()

        assert agent_scroll.scroll_y == baseline_agent
        assert info_scroll.scroll_y == baseline_info
        assert todo_scroll.scroll_y == baseline_todo


@verifies(SWR.SWR_1036, SWR.SWR_1040)
async def test_right_rail_scroll_regions_fill_available_height_across_terminal_sizes() -> None:
    """REQ-20260426-020611-NF-004:
    Scroll regions fill the full available height without dead space.
    """
    for size in ((80, 24), (100, 40), (80, 60)):
        app = RotarisTuiApp()
        async with app.run_test(size=size) as pilot:
            await pilot.pause()

            right_pane = app.screen.query_one("#right-pane")
            agent_scroll = app.screen.query_one("#agent-status")
            info_scroll = app.screen.query_one("#info-pane")
            todo_scroll = app.screen.query_one("#todo-pane")

            total_h = (
                agent_scroll.outer_size.height
                + info_scroll.outer_size.height
                + todo_scroll.outer_size.height
            )
            expected_h = right_pane.content_size.height

            # The sum of heights should equal the available height (allow <=1 row slack)
            assert expected_h - 1 <= total_h <= expected_h + 1, (
                f"Dead space detected at size {size}. Total widgets height: {total_h}, "
                f"Available right pane height: {expected_h}"
            )

            # The 2:2:1 approximate ratio is maintained
            agent_h = agent_scroll.outer_size.height
            info_h = info_scroll.outer_size.height
            assert abs(agent_h - info_h) <= 8
            assert agent_h >= info_h - 8


# ---------------------------------------------------------------------------
# Chat scroll-position stability — paused users must not be snapped back
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1426, SWR.SWR_1427)
async def test_chat_scroll_position_stable_across_incremental_rebuilds() -> None:
    """Regression: when paused, incremental refresh ticks (streaming updates)
    must NOT reset scroll_y back to the saved position on every frame.

    Before the fix, ``end_rebuild()`` always called ``_restore_scroll`` whenever
    ``_following`` was False, so any manual scroll the user made was undone
    at the very next streaming tick.
    """
    from textual import events

    app = RotarisTuiApp()
    async with app.run_test(size=(120, 40)) as pilot:
        await pilot.pause()

        # Fill the panel through the production path.  Writing rows directly
        # races the app's own startup refresh, which replaces the transcript
        # and collapses the scroll range out from under the assertion.
        app.current_session = _session_with_transcript(200)
        app._refresh_widgets()
        await pilot.pause()

        chat = app.screen.query_one(ChatPanel)
        chat.mark_stable()
        assert chat.max_scroll_y > 50, "panel must be scrollable for this regression"

        # Simulate user scrolling up — enters paused mode.
        chat.post_message(
            events.MouseScrollUp(
                widget=chat,
                x=1,
                y=1,
                delta_x=0,
                delta_y=1,
                button=0,
                shift=False,
                meta=False,
                ctrl=False,
                screen_x=1,
                screen_y=1,
            ),
        )
        await pilot.pause()

        assert not chat._following, "expected paused mode after scroll-up"
        assert not chat.auto_scroll

        # Manually position the scroll to some mid-point (simulates user
        # independently scrolling after the initial pause).
        chat._programmatic_scroll = True
        chat.scroll_y = 50.0
        chat._programmatic_scroll = False
        await pilot.pause()

        # Simulate several incremental (non-full) rebuild calls — these happen
        # on every streaming tick.  stable_strip_count is already 200 so
        # clear_volatile() removes nothing, mirroring the production path.
        for _ in range(5):
            chat._in_full_rebuild = False  # ensure it's an incremental pass
            chat.clear_volatile()
            chat.mark_stable()
            chat.end_rebuild()
            await pilot.pause()

        # Scroll position must remain at 50, not snapped to _saved_scroll_y.
        assert chat.scroll_y == pytest.approx(50.0, abs=2), (
            f"scroll_y was reset by an incremental rebuild tick: {chat.scroll_y}"
        )


@verifies(SWR.SWR_1426, SWR.SWR_1427)
async def test_scrollbar_drag_pauses_follow_mode() -> None:
    """Productive use: TUI user can drag the transcript scrollbar upward.
    Expected outcome: auto-follow pauses and leaves older transcript content readable.
    """
    app = RotarisTuiApp()
    async with app.run_test(size=(120, 40)) as pilot:
        await pilot.pause()

        app.current_session = _session_with_transcript(200)
        app._refresh_widgets()
        await pilot.pause()
        chat = app.screen.query_one(ChatPanel)

        assert chat._following, "should start in follow mode"
        assert chat.auto_scroll
        assert chat.max_scroll_y > 30

        # Simulate a scrollbar drag: directly mutate scroll_y as Textual does
        # internally when the scrollbar thumb is moved.  This does NOT dispatch
        # a MouseScrollUp event, so the old code would miss it.
        chat.scroll_y = 30.0
        await pilot.pause()

        assert not chat._following, "scrollbar drag should have paused follow mode"
        assert not chat.auto_scroll
        assert "paused" in chat.border_subtitle


@verifies(SWR.SWR_1426, SWR.SWR_1427)
async def test_scrollbar_drag_to_bottom_resumes_follow_mode() -> None:
    """Productive use: TUI user can drag the transcript scrollbar back to bottom.
    Expected outcome: auto-follow resumes for new transcript output.
    """
    from textual import events

    app = RotarisTuiApp()
    async with app.run_test(size=(120, 40)) as pilot:
        await pilot.pause()

        app.current_session = _session_with_transcript(200)
        app._refresh_widgets()
        await pilot.pause()
        chat = app.screen.query_one(ChatPanel)

        chat.post_message(
            events.MouseScrollUp(
                widget=chat,
                x=1,
                y=1,
                delta_x=0,
                delta_y=1,
                button=0,
                shift=False,
                meta=False,
                ctrl=False,
                screen_x=1,
                screen_y=1,
            ),
        )
        await pilot.pause()
        assert not chat._following

        # Drag the scrollbar all the way back to the end.
        chat.scroll_end(animate=False)
        await pilot.pause()

        assert chat._following, "dragging to bottom should resume follow mode"
        assert chat.auto_scroll
        assert chat.border_subtitle == " live "


# ---------------------------------------------------------------------------
# New Session Creation Workflow
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1169, SWR.SWR_1023)
async def test_full_workflow_new_session_creation_via_command_palette() -> None:
    """Full workflow: create a new session via the command palette."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        # Open command palette.
        await _press_leader_shortcut(pilot, "p")
        await pilot.pause()

        # Search for "New session".
        await pilot.press("N", "e", "w", " ", "s", "e", "s", "s", "i", "o", "n")
        await pilot.pause()

        # Tab from the search Input to the ListView, then down to highlight the
        # first matching item, then enter to select it.
        await pilot.press("tab")
        await pilot.pause()
        await pilot.press("down")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()

        # The command palette dismisses itself after selection.  Give the
        # event loop a moment to process the NewSession message and any
        # pending render ticks.
        await pilot.pause(0.3)

        # Should be back on main screen.
        from rotaris_core.tui.screens.main import MainScreen

        assert isinstance(app.screen, MainScreen)


# ---------------------------------------------------------------------------
# Command Palette — Full Workflow + Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1169)
async def test_full_workflow_command_palette_execute_action() -> None:
    """Full workflow: open command palette, search, execute an action."""
    from rotaris_core.tui.screens.command_palette_cheatsheet import CommandPaletteCheatsheetScreen

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        await _press_leader_shortcut(pilot, "p")

        # The command palette cheatsheet should now be the active screen.
        assert isinstance(app.screen, CommandPaletteCheatsheetScreen), (
            f"Expected CommandPaletteCheatsheetScreen, got {app.screen!r}"
        )

        # Dismiss cleanly.
        await pilot.press("escape")
        await pilot.pause()

        from rotaris_core.tui.screens.main import MainScreen

        assert isinstance(app.screen, MainScreen)


@verifies(SWR.SWR_1169, SWR.SWR_1205)
async def test_random_command_palette_resize_no_crash() -> None:
    """Random: resizing while command palette is open must not crash."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        await _press_leader_shortcut(pilot, "p")

        from textual.events import Resize
        from textual.geometry import Size

        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        await pilot.press("f5", "tab")
        await pilot.pause()

        await pilot.press("escape")
        await pilot.pause()


# ---------------------------------------------------------------------------
# Toggle Tool Events — Full Workflow + Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1085, SWR.SWR_1088)
async def test_full_workflow_tool_events_toggle_during_session() -> None:
    """Full workflow: toggle tool events while a session is active."""
    from unittest.mock import MagicMock

    from rotaris_core.tui.app import ToggleToolEvents

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        # Set up a mock session.
        session = MagicMock()
        session.token_usage = {"total_tokens": 0}
        session.execution_status = "running"
        session.child_states = []
        session.transcript_events = []
        session.todo_state = None
        session.agent_todo_state = None
        app.current_session = session
        await pilot.pause()

        assert app.show_tool_events is False

        app.post_message(ToggleToolEvents())
        await pilot.pause()
        assert app.show_tool_events is True

        app.post_message(ToggleToolEvents())
        await pilot.pause()
        assert app.show_tool_events is False


@verifies(SWR.SWR_1085, SWR.SWR_1205)
async def test_random_tool_events_toggle_during_input_no_crash() -> None:
    """Random: rapid tool-event toggle while typing must not crash."""
    from rotaris_core.tui.app import ToggleToolEvents

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        # Type some text, toggle rapidly, type more.
        await pilot.press("h", "e", "l", "l", "o")
        app.post_message(ToggleToolEvents())
        await pilot.pause()
        app.post_message(ToggleToolEvents())
        await pilot.pause()
        await pilot.press(" ", "w", "o", "r", "l", "d")
        await pilot.pause()

        assert app.screen.query_one("#input-composer") is not None


# ---------------------------------------------------------------------------
# Leader-Q Quit — Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1205, SWR.SWR_1309)
async def test_random_ctrl_q_double_press_no_crash() -> None:
    """Random: pressing leader-Q twice in rapid succession must not crash."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        await _press_leader_shortcut(pilot, "q")
        await _press_leader_shortcut(pilot, "q")

    # Reaching here without exception means pass.


# ---------------------------------------------------------------------------
# Active Run — Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1205)
async def test_random_active_run_unmapped_keys_no_crash() -> None:
    """Random: hitting unmapped keys during active run must not crash."""
    from unittest.mock import MagicMock

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        session = MagicMock()
        session.token_usage = {"total_tokens": 0}
        session.execution_status = "running"
        session.child_states = [
            {
                "name": "root-task",
                "canonical_name": "root-task",
                "persona": "orchestrator",
                "state": "running",
            },
        ]
        session.transcript_events = []
        session.todo_state = None
        session.agent_todo_state = None
        app.current_session = session
        await pilot.pause()

        # Unmapped keys during run.
        await pilot.press("f1", "f2", "f3", "f4", "f6", "f7", "f8", "f9", "f10", "f12")
        await pilot.pause()

        # Resize during run.
        from textual.events import Resize
        from textual.geometry import Size

        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        # Widgets still queryable.
        assert app.screen.query_one("#input-composer") is not None
        assert app.screen.query_one("#chat-panel") is not None
