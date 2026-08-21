"""Tests for TranscriptSearchScreen and the /search slash command.

REQ-20260616-009f.
"""

from unittest.mock import MagicMock

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.screens.transcript_search import (
    TranscriptSearchScreen,
    _display_text_from_event,
    _searchable_text_from_event,
)
from rotaris_core.tui.widgets.slash_commands import create_builtin_registry

# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_app_with_session(
    transcript_events: list[dict[str, object]] | None = None,
) -> MagicMock:
    """Create a mock RotarisTuiApp with an optional session containing transcript events."""
    app = MagicMock()
    if transcript_events is not None:
        session = MagicMock()
        session.transcript_events = transcript_events
        app.current_session = session
    else:
        app.current_session = None
    return app


# ── _display_text_from_event ─────────────────────────────────────────────────


@verifies(SWR.SWR_1180)
def test_display_text_uses_content_first() -> None:
    event = {"role": "agent", "content": "Hello world", "name": "bot"}
    assert _display_text_from_event(event) == "Hello world"


@verifies(SWR.SWR_1180)
def test_display_text_falls_back_to_reasoning() -> None:
    event = {"role": "thinking", "content": "", "reasoning": "Let me think…"}
    assert _display_text_from_event(event) == "Let me think…"


@verifies(SWR.SWR_1180)
def test_display_text_falls_back_to_tool_name() -> None:
    event = {"role": "tool", "content": "", "tool_name": "read_file"}
    assert _display_text_from_event(event) == "read_file"


@verifies(SWR.SWR_1180)
def test_display_text_falls_back_to_name() -> None:
    event = {"role": "child", "content": "", "name": "child-agent"}
    assert _display_text_from_event(event) == "[child-agent]"


@verifies(SWR.SWR_1180)
def test_display_text_truncates_long_content() -> None:
    event = {"role": "agent", "content": "x" * 200}
    result = _display_text_from_event(event, max_len=20)
    assert len(result) <= 20
    assert result.endswith("…")


@verifies(SWR.SWR_1180)
def test_display_text_empty_event() -> None:
    assert _display_text_from_event({}) == "(empty)"


# ── _searchable_text_from_event ──────────────────────────────────────────────


@verifies(SWR.SWR_1180)
def test_searchable_text_includes_all_fields() -> None:
    event = {
        "role": "agent",
        "content": "Hello",
        "reasoning": "Think",
        "name": "bot",
        "tool_name": "grep",
        "persona": "orchestrator",
        "phase": "completed",
    }
    text = _searchable_text_from_event(event)
    assert "Hello" in text
    assert "Think" in text
    assert "bot" in text
    assert "grep" in text
    assert "orchestrator" in text
    assert "completed" in text
    assert "agent" in text


@verifies(SWR.SWR_1180)
def test_searchable_text_handles_empty_event() -> None:
    text = _searchable_text_from_event({})
    assert text == ""


# ── TranscriptSearchScreen – build_search_index ──────────────────────────────


@verifies(SWR.SWR_1180)
def test_build_index_empty_for_no_session() -> None:
    app = _make_app_with_session(None)
    screen = TranscriptSearchScreen(app)
    screen._build_search_index()
    assert screen._search_index == []


@verifies(SWR.SWR_1180)
def test_build_index_populates_from_transcript_events() -> None:
    events: list[dict[str, object]] = [
        {"role": "user", "content": "What is this?"},
        {"role": "agent", "content": "This is a test.", "name": "bot"},
    ]
    app = _make_app_with_session(events)
    screen = TranscriptSearchScreen(app)
    screen._build_search_index()

    assert len(screen._search_index) == 2
    assert screen._search_index[0]["role"] == "user"
    assert screen._search_index[0]["event_index"] == 0
    assert screen._search_index[1]["role"] == "agent"
    assert screen._search_index[1]["event_index"] == 1


@verifies(SWR.SWR_1180)
def test_build_index_includes_all_roles() -> None:
    events: list[dict[str, object]] = [
        {"role": "user", "content": "hi"},
        {"role": "agent", "content": "hi"},
        {"role": "tool", "content": "hi"},
        {"role": "system", "content": "hi"},
        {"role": "child", "content": "hi"},
        {"role": "thinking", "content": "hi"},
        {"role": "edit_diff", "content": "hi"},
    ]
    app = _make_app_with_session(events)
    screen = TranscriptSearchScreen(app)
    screen._build_search_index()

    assert len(screen._search_index) == 7


# ── TranscriptSearchScreen – UI integration ──────────────────────────────────


@pytest.mark.asyncio
@verifies(SWR.SWR_1180)
async def test_filter_matches_content_case_insensitive() -> None:
    events: list[dict[str, object]] = [
        {"role": "agent", "content": "Hello World"},
        {"role": "user", "content": "Goodbye"},
    ]

    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        session = MagicMock()
        session.transcript_events = events
        session.agent_todo_state = None
        session.token_usage = {"total_tokens": 0}
        session.child_states = []
        session.todo_state = None
        real_app.current_session = session
        screen = TranscriptSearchScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()

        from textual.widgets import Input, ListView

        input_widget = screen.query_one("#transcript-search-input", Input)
        input_widget.value = "hello"
        input_widget.post_message(Input.Changed(input_widget, input_widget.value))
        await pilot.pause()

        list_view = screen.query_one("#transcript-search-results", ListView)
        items = list(list_view.children)
        assert len(items) == 1


@pytest.mark.asyncio
@verifies(SWR.SWR_1180)
async def test_filter_no_matches_shows_empty_state() -> None:
    events: list[dict[str, object]] = [
        {"role": "agent", "content": "Hello World"},
    ]

    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        session = MagicMock()
        session.transcript_events = events
        session.agent_todo_state = None
        session.token_usage = {"total_tokens": 0}
        session.child_states = []
        session.todo_state = None
        real_app.current_session = session
        screen = TranscriptSearchScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()

        from textual.widgets import Input, ListView

        input_widget = screen.query_one("#transcript-search-input", Input)
        input_widget.value = "zzz_no_match_zzz"
        input_widget.post_message(Input.Changed(input_widget, input_widget.value))
        await pilot.pause()

        list_view = screen.query_one("#transcript-search-results", ListView)
        assert len(list(list_view.children)) == 0


@pytest.mark.asyncio
@verifies(SWR.SWR_1180)
async def test_escape_dismisses_without_side_effect() -> None:
    events: list[dict[str, object]] = [
        {"role": "agent", "content": "Test"},
    ]

    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        session = MagicMock()
        session.transcript_events = events
        session.agent_todo_state = None
        session.token_usage = {"total_tokens": 0}
        session.child_states = []
        session.todo_state = None
        real_app.current_session = session
        screen = TranscriptSearchScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()
        await pilot.press("escape")
        await pilot.pause()

    # Screen should be dismissed (no error raised)


# ── /search slash command ────────────────────────────────────────────────────


@verifies(SWR.SWR_1180)
def test_slash_command_search_pushes_screen_when_session_has_events() -> None:
    registry = create_builtin_registry()
    app = _make_app_with_session(
        [{"role": "user", "content": "Hello"}],
    )

    result = registry.execute("/search", app)
    assert result is True
    app.push_screen.assert_called_once()


@verifies(SWR.SWR_1180)
def test_slash_command_search_warns_when_no_session() -> None:
    registry = create_builtin_registry()
    app = _make_app_with_session(None)

    result = registry.execute("/search", app)
    assert result is True
    app.notify.assert_called_once()
    assert "No active session" in app.notify.call_args.args[0]
    app.push_screen.assert_not_called()


@verifies(SWR.SWR_1180)
def test_slash_command_search_warns_when_empty_transcript() -> None:
    registry = create_builtin_registry()
    app = _make_app_with_session([])

    result = registry.execute("/search", app)
    assert result is True
    app.notify.assert_called_once()
    assert "empty" in app.notify.call_args.args[0].lower()
    app.push_screen.assert_not_called()
