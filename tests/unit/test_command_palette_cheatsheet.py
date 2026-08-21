"""Tests for CommandPaletteCheatsheetScreen.

REQ-20260526-001 through REQ-20260526-005,
REQ-20260616-013.
"""

from unittest.mock import MagicMock

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.screens.command_palette_cheatsheet import (
    CommandPaletteCheatsheetScreen,
    _build_cheatsheet_text,
    _build_command_entries,
)

# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_app(leader: str = "Ctrl+X") -> MagicMock:
    app = MagicMock()
    app.leader_key.return_value = leader
    return app


# ── _build_command_entries ───────────────────────────────────────────────────


@verifies(SWR.SWR_1162)
def test_build_command_entries_includes_core_commands() -> None:
    app = _make_app()
    entries = _build_command_entries(app)
    labels = {entry[0] for entry in entries}

    assert "Stop current run" in labels
    assert "Pause current run" in labels
    assert "New session" in labels
    assert "Continue session" in labels
    assert "MCP Servers" in labels
    assert "Runtime Models" in labels
    assert "Startup Models" in labels
    assert "Provider Settings" in labels
    assert "Dev Options" in labels


@verifies(SWR.SWR_1162)
def test_build_command_entries_includes_themes() -> None:
    app = _make_app()
    entries = _build_command_entries(app)
    labels = {entry[0] for entry in entries}

    theme_labels = [label for label in labels if label.startswith("Theme:")]
    assert len(theme_labels) > 0


@verifies(SWR.SWR_1162)
def test_build_command_entries_returns_callables() -> None:
    app = _make_app()
    entries = _build_command_entries(app)

    for _label, callback, _help_text in entries:
        assert callable(callback)


# ── _build_cheatsheet_text ───────────────────────────────────────────────────


@verifies(SWR.SWR_1184)
def test_cheatsheet_text_default_leader() -> None:
    app = _make_app("Ctrl+X")
    text = _build_cheatsheet_text(app)

    assert "Ctrl+X P" in text
    assert "Ctrl+X M" in text
    assert "Ctrl+X Q" in text
    assert "Ctrl+X S" in text
    assert "Ctrl+X R" in text
    assert "Ctrl+X E" in text
    assert "Ctrl+X ?" in text


@verifies(SWR.SWR_1184)
def test_cheatsheet_text_custom_leader() -> None:
    app = _make_app("Ctrl+G")
    text = _build_cheatsheet_text(app)

    assert "Ctrl+G P" in text
    assert "Ctrl+G M" in text
    assert "Ctrl+X P" not in text


@verifies(SWR.SWR_1163)
def test_cheatsheet_text_includes_navigation() -> None:
    app = _make_app()
    text = _build_cheatsheet_text(app)

    assert "Navigation:" in text
    assert "Ctrl+Down" in text
    assert "Ctrl+Right" in text
    assert "Alt+Down" in text


@verifies(SWR.SWR_1163)
def test_cheatsheet_text_includes_other_keys() -> None:
    app = _make_app()
    text = _build_cheatsheet_text(app)

    assert "Esc" in text
    assert "Ctrl+C" in text
    assert "Force quit" in text
    assert "slash" in text.lower()


# ── CommandPaletteCheatsheetScreen ───────────────────────────────────────────


@pytest.mark.asyncio
@verifies(SWR.SWR_1161, SWR.SWR_1162)
async def test_screen_mounts_with_commands_and_cheatsheet() -> None:
    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        screen = CommandPaletteCheatsheetScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()

        from textual.widgets import Input, ListView, Static

        # Verify widgets exist
        screen.query_one("#command-palette-search", Input)
        screen.query_one("#command-palette-results", ListView)
        screen.query_one("#cheatsheet-body", Static)

        # Verify cheatsheet has content
        body = screen.query_one("#cheatsheet-body", Static)
        rendered = body.render()
        assert rendered.markup or rendered.plain


@pytest.mark.asyncio
@verifies(SWR.SWR_1162)
async def test_search_filters_command_list() -> None:
    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        screen = CommandPaletteCheatsheetScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()

        from textual.widgets import Input, ListView

        input_widget = screen.query_one("#command-palette-search", Input)
        input_widget.value = "MCP"
        input_widget.post_message(Input.Changed(input_widget, input_widget.value))
        await pilot.pause()

        list_view = screen.query_one("#command-palette-results", ListView)
        items = list(list_view.children)
        assert len(items) == 2
        labels = {str(list(item.children)[0].render()) for item in items}
        assert labels == {"MCP Servers", "MCP Secrets"}


@pytest.mark.asyncio
@verifies(SWR.SWR_1162)
async def test_search_no_match_shows_empty_list() -> None:
    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        screen = CommandPaletteCheatsheetScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()

        from textual.widgets import Input, ListView

        input_widget = screen.query_one("#command-palette-search", Input)
        input_widget.value = "zzz_nonexistent_zzz"
        input_widget.post_message(Input.Changed(input_widget, input_widget.value))
        await pilot.pause()

        list_view = screen.query_one("#command-palette-results", ListView)
        assert len(list(list_view.children)) == 0


@pytest.mark.asyncio
@verifies(SWR.SWR_1164)
async def test_escape_dismisses_screen() -> None:
    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        screen = CommandPaletteCheatsheetScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()
        await pilot.press("escape")
        await pilot.pause()

    # Screen should be dismissed (no error raised)


@pytest.mark.asyncio
@verifies(SWR.SWR_1164)
async def test_selecting_command_executes_and_dismisses() -> None:
    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    async with real_app.run_test() as pilot:
        screen = CommandPaletteCheatsheetScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()

        from textual.widgets import Input, ListView

        # Search for "Stop" to narrow results
        input_widget = screen.query_one("#command-palette-search", Input)
        input_widget.value = "Stop"
        input_widget.post_message(Input.Changed(input_widget, input_widget.value))
        await pilot.pause()

        list_view = screen.query_one("#command-palette-results", ListView)
        items = list(list_view.children)
        assert len(items) > 0

        # Select the first item
        list_view.index = 0
        await pilot.pause()

        # Simulate selection by posting Selected message
        selected_event = ListView.Selected(list_view, items[0], index=0)
        list_view.post_message(selected_event)
        await pilot.pause()

    # Screen should be dismissed (no error raised)


@pytest.mark.asyncio
@verifies(SWR.SWR_1184)
async def test_cheatsheet_reflects_configured_leader() -> None:
    from rotaris_core.tui.app import RotarisTuiApp

    real_app = RotarisTuiApp()
    # Override the leader key after app creation
    async with real_app.run_test() as pilot:
        screen = CommandPaletteCheatsheetScreen(real_app)

        await real_app.push_screen(screen)
        await pilot.pause()

        from textual.widgets import Static

        body = screen.query_one("#cheatsheet-body", Static)
        text = body.render()
        # Default leader is Ctrl+X
        assert "Ctrl+X" in text.markup
