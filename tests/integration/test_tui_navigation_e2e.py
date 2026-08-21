from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

from rotaris_core.config.defaults import DEFAULT_CONFIG
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask
from rotaris_core.tui.app import RotarisTuiApp
from rotaris_core.tui.widgets.chat_panel import ChatPanel
from rotaris_core.tui.widgets.info_pane import InfoPane
from rotaris_core.tui.widgets.input_composer import InputComposer

_ROOT = {
    "name": "root",
    "canonical_name": "orch",
    "persona": "orchestrator",
    "state": "running",
    "parent_agent_id": "",
}
_CHILD_A = {
    "name": "impl",
    "canonical_name": "orch.impl",
    "persona": "coding-agent",
    "state": "running",
    "parent_agent_id": "orch",
}
_CHILD_B = {
    "name": "test",
    "canonical_name": "orch.test",
    "persona": "tester",
    "state": "running",
    "parent_agent_id": "orch",
}
_GRANDCHILD = {
    "name": "sub",
    "canonical_name": "orch.impl.sub",
    "persona": "coding-agent",
    "state": "running",
    "parent_agent_id": "orch.impl",
}
_CHILD_C = {
    "name": "docs",
    "canonical_name": "orch.docs",
    "persona": "docs-writer",
    "state": "running",
    "parent_agent_id": "orch",
}


def _make_session(
    agents: list[dict[str, Any]],
    events: list[dict[str, Any]] | None = None,
    *,
    todo_state: dict[str, Any] | None = None,
) -> MagicMock:
    session = MagicMock()
    session.child_states = agents
    session.transcript_events = events or []
    session.todo_state = todo_state
    session.agent_todo_state = None
    session.execution_status = "running"
    session.token_usage = {"total_tokens": 0}
    return session


async def _focus_chat(app: RotarisTuiApp, pilot: Any) -> None:
    chat = app.screen.query_one(ChatPanel)
    chat.focus()
    await pilot.pause()


@verifies(SWR.SWR_1006)
async def test_navigation_moves_through_tree_and_wraps_siblings() -> None:
    app = RotarisTuiApp()

    async with app.run_test() as pilot:
        await pilot.pause()
        app.current_session = _make_session([_ROOT, _CHILD_A, _GRANDCHILD])
        await pilot.pause()
        await _focus_chat(app, pilot)

        await pilot.press("ctrl+down")
        await pilot.pause()
        assert app.focused_agent_id == _ROOT["canonical_name"]

        await pilot.press("ctrl+down")
        await pilot.pause()
        assert app.focused_agent_id == _CHILD_A["canonical_name"]

        await pilot.press("ctrl+up")
        await pilot.pause()
        assert app.focused_agent_id == _ROOT["canonical_name"]

        await pilot.press("ctrl+up")
        await pilot.pause()
        assert app.focused_agent_id is None

        app.current_session = _make_session([_ROOT, _CHILD_A, _CHILD_B, _CHILD_C])
        await pilot.pause()
        await _focus_chat(app, pilot)

        app.focused_agent_id = _CHILD_A["canonical_name"]
        await pilot.pause()

        await pilot.press("ctrl+right")
        await pilot.pause()
        assert app.focused_agent_id == _CHILD_B["canonical_name"]

        await pilot.press("ctrl+right")
        await pilot.pause()
        assert app.focused_agent_id == _CHILD_C["canonical_name"]

        await pilot.press("ctrl+right")
        await pilot.pause()
        assert app.focused_agent_id == _CHILD_A["canonical_name"]


@verifies(SWR.SWR_1419, SWR.SWR_1420, SWR.SWR_1421, SWR.SWR_1423, SWR.SWR_1424)
async def test_info_pane_reflects_session_data_and_cached_context_tokens() -> None:
    app = RotarisTuiApp(config=DEFAULT_CONFIG)
    todo = TodoList(phases=[TodoPhase(name="main", tasks=[TodoTask(name="Ship tests")])])
    transcript_events = [
        {"role": "user", "content": "Investigate compression support"},
        {"role": "agent", "name": "orch", "content": "Collected context and drafted plan"},
    ]

    async with app.run_test() as pilot:
        await pilot.pause()
        app.current_session = _make_session(
            [_ROOT, _CHILD_A],
            transcript_events,
            todo_state=todo.model_dump(mode="json"),
        )
        await pilot.pause()

        info_pane = app.screen.query_one(InfoPane)
        expected_tokens = (
            app._system_prompt_chars
            + sum(len(str(event["content"])) for event in transcript_events)
        ) // 4

        assert info_pane.model_name == DEFAULT_CONFIG.personas[DEFAULT_CONFIG.default_persona].model
        assert info_pane.workspace == str(DEFAULT_CONFIG.workspace_root)
        assert info_pane.token_estimate == expected_tokens
        assert info_pane.mcp_servers
        assert info_pane.tools
        app._render_state.last_context_tokens = 85_000
        app._refresh_widgets()
        assert info_pane.context_tokens == 85_000


@verifies(SWR.SWR_1421)
async def test_chat_panel_breadcrumb_and_filter_integration() -> None:
    app = RotarisTuiApp()
    events = [
        {"role": "user", "content": "Check agent outputs"},
        {"role": "agent", "name": _ROOT["canonical_name"], "content": "root message"},
        {"role": "agent", "name": _CHILD_A["canonical_name"], "content": "child message"},
        {"role": "agent", "name": _CHILD_B["canonical_name"], "content": "sibling message"},
        {"role": "system", "content": "run complete"},
    ]

    async with app.run_test() as pilot:
        await pilot.pause()
        app.current_session = _make_session([_ROOT, _CHILD_A, _CHILD_B], events)
        await pilot.pause()

        app.focused_agent_id = _CHILD_A["canonical_name"]
        await pilot.pause()

        chat_panel = app.screen.query_one(ChatPanel)
        rendered = "\n".join(line.text for line in chat_panel.lines)

        assert chat_panel._breadcrumb is not None
        assert _ROOT["canonical_name"] in chat_panel._breadcrumb
        assert _CHILD_A["canonical_name"] in chat_panel._breadcrumb
        assert "Check agent outputs" in rendered
        assert "child message" in rendered
        assert "run complete" in rendered
        assert "root message" not in rendered
        assert "sibling message" not in rendered


@verifies(SWR.SWR_1415, SWR.SWR_1418, SWR.SWR_1433)
async def test_navigation_moves_into_agents_from_input_focus() -> None:
    app = RotarisTuiApp()

    async with app.run_test() as pilot:
        await pilot.pause()
        app.current_session = _make_session([_ROOT, _CHILD_A])
        await pilot.pause()

        composer = app.screen.query_one(InputComposer)
        await pilot.press("h", "e", "l", "l", "o")
        await pilot.pause()

        await pilot.press("ctrl+down")
        await pilot.pause()
        await pilot.press("ctrl+down")
        await pilot.pause()

        assert composer.input_widget.value == "hello"
        assert app.focused_agent_id == _CHILD_A["canonical_name"]
