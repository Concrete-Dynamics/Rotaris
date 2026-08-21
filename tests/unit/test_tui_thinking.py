from __future__ import annotations

from unittest.mock import MagicMock

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp, ToggleReasoning


async def _press_leader_shortcut(pilot, key: str) -> None:
    await pilot.press("ctrl+x")
    await pilot.pause()
    await pilot.press(key)
    await pilot.pause()


def _make_reasoning_session() -> MagicMock:
    session = MagicMock()
    session.token_usage = {"total_tokens": 0}
    session.child_states = []
    session.transcript_events = [
        {
            "role": "agent",
            "name": "test-agent",
            "content": "visible answer",
            "reasoning": "internal thought process",
            "thinking_duration": 2.5,
        },
    ]
    session.todo_state = None
    session.agent_todo_state = None
    session.execution_status = "completed"
    return session


@verifies(
    SWR.SWR_1012,
    SWR.SWR_1213,
    SWR.SWR_1214,
    SWR.SWR_1219,
    SWR.SWR_1220,
    SWR.SWR_1221,
    SWR.SWR_1222,
    SWR.SWR_1223,
    SWR.SWR_1224,
    SWR.SWR_1225,
    SWR.SWR_1230,
    SWR.SWR_1231,
)
async def test_reasoning_toggle_and_session_rendering() -> None:
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        assert app.show_reasoning is False
        app.post_message(ToggleReasoning())
        await pilot.pause()
        assert app.show_reasoning is True

        app.current_session = _make_reasoning_session()
        await pilot.pause()

        from rotaris_core.tui.widgets.chat_panel import ChatPanel

        chat_panel = app.screen.query_one(ChatPanel)
        full_text = "\n".join(str(line) for line in chat_panel.lines)
        assert "internal thought process" in full_text

        app.post_message(ToggleReasoning())
        await pilot.pause()
        assert app.show_reasoning is False
        app.current_session = _make_reasoning_session()
        await pilot.pause()

        full_text = "\n".join(str(line) for line in chat_panel.lines)
        assert "internal thought process" not in full_text
        assert "Thought" in full_text


@verifies(
    SWR.SWR_1215,
    SWR.SWR_1216,
    SWR.SWR_1217,
    SWR.SWR_1218,
    SWR.SWR_1223,
    SWR.SWR_1226,
    SWR.SWR_1227,
    SWR.SWR_1228,
    SWR.SWR_1229,
)
async def test_chat_panel_reasoning_helpers_render_duration_and_streaming_state() -> None:
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        from rotaris_core.tui.widgets.chat_panel import ChatPanel

        chat_panel = app.screen.query_one(ChatPanel)
        chat_panel.add_reasoning_block("some reasoning", duration=5.0)
        full_text = "\n".join(str(line) for line in chat_panel.lines)
        assert "Thought for 5s" in full_text
        assert "some reasoning" in full_text

        chat_panel.add_streaming_agent_message(
            "test-persona",
            "",
            phase="thinking",
            reasoning="",
            show_reasoning=False,
        )
        full_text = "\n".join(str(line) for line in chat_panel.lines)
        assert "thinking" in full_text
        assert "Thinking" in full_text


# ---------------------------------------------------------------------------
# Category 1 + 2: Reasoning Toggle — Alternative Path + Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1173)
async def test_reasoning_alt_toggle_via_shortcut() -> None:
    """Alternative path: toggle reasoning via the leader chord."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        assert app.show_reasoning is False

        await _press_leader_shortcut(pilot, "r")
        assert app.show_reasoning is True

        await _press_leader_shortcut(pilot, "r")
        assert app.show_reasoning is False


@verifies(SWR.SWR_1012, SWR.SWR_1230)
async def test_reasoning_alt_toggle_with_session_shows_button() -> None:
    """Alternative path: toggle button appears in chat panel when reasoning exists."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app.current_session = _make_reasoning_session()
        await pilot.pause()

        from rotaris_core.tui.widgets.chat_panel import ChatPanel

        chat_panel = app.screen.query_one(ChatPanel)
        assert len(chat_panel._reasoning_header_lines) > 0


@verifies(SWR.SWR_1012, SWR.SWR_1173)
async def test_reasoning_random_unmapped_keys_no_crash() -> None:
    """Random interaction: unmapped keys while reasoning is visible must not crash."""
    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app.show_reasoning = True
        app.current_session = _make_reasoning_session()
        await pilot.pause()

        # Unmapped keys.
        await pilot.press("f5", "f1", "pageup", "pagedown", "tab")
        await pilot.pause()

        # Resize.
        from textual.events import Resize
        from textual.geometry import Size

        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        from rotaris_core.tui.widgets.chat_panel import ChatPanel

        assert app.screen.query_one(ChatPanel) is not None
