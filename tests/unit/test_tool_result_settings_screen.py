"""TUI tests for ToolResultSettingsScreen — three mandatory categories.

Category 1 — Full workflow: toggle switches, select line counts, save.
Category 2 — Alternative paths: dismiss without save.
Category 3 — Random interaction: unmapped keys, resize.
"""

from __future__ import annotations

import pytest
from textual.widgets import Select, Switch

from rotaris_core.config.schema import TuiDisplayConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp
from rotaris_core.tui.screens.tool_result_settings import (
    ToolResultSettingsScreen,
)


async def _press_leader_shortcut(pilot, key: str) -> None:
    await pilot.press("ctrl+x")
    await pilot.pause()
    await pilot.press(key)
    await pilot.pause()


@verifies(SWR.SWR_1086, SWR.SWR_1089, SWR.SWR_1083, SWR.SWR_1090)
@pytest.mark.asyncio
async def test_tool_result_full_workflow_toggle_and_save() -> None:
    """Full workflow: open screen, toggle switches, change selects, save."""
    display = TuiDisplayConfig()
    assert display.show_tool_results is True
    assert display.show_tool_inputs is True
    assert display.tool_result_max_lines == 10
    assert display.tool_input_max_lines == 2

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app.push_screen(
            ToolResultSettingsScreen(display),
            callback=lambda r: setattr(app, "result", r),
        )
        await pilot.pause()

        assert isinstance(app.screen, ToolResultSettingsScreen)

        # Toggle off tool results.
        result_switch = app.screen.query_one("#tool-result-show-switch", Switch)
        assert result_switch.value is True
        await pilot.click("#tool-result-show-switch")
        await pilot.pause()

        # Toggle off tool inputs.
        input_switch = app.screen.query_one("#tool-input-show-switch", Switch)
        assert input_switch.value is True
        await pilot.click("#tool-input-show-switch")
        await pilot.pause()

        # Change result lines to 50.
        result_select = app.screen.query_one("#tool-result-lines-select", Select)
        result_select.value = "50"
        await pilot.pause()

        # Change input lines to 5.
        input_select = app.screen.query_one("#tool-input-lines-select", Select)
        input_select.value = "5"
        await pilot.pause()

        # Save.
        await _press_leader_shortcut(pilot, "s")

    # Verify result.
    result = getattr(app, "result", None)
    assert result is not None
    assert result.saved is True
    assert result.display.show_tool_results is False
    assert result.display.show_tool_inputs is False
    assert result.display.tool_result_max_lines == 50
    assert result.display.tool_input_max_lines == 5


@verifies(SWR.SWR_1086)
@pytest.mark.asyncio
async def test_tool_result_alt_dismiss_without_save() -> None:
    """Alternative path: open, toggle some settings, dismiss without saving."""
    display = TuiDisplayConfig()
    assert display.show_tool_results is True

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app.push_screen(
            ToolResultSettingsScreen(display),
            callback=lambda r: setattr(app, "result", r),
        )
        await pilot.pause()

        assert isinstance(app.screen, ToolResultSettingsScreen)

        await pilot.click("#tool-result-show-switch")
        await pilot.pause()

        # Dismiss via escape — no save.
        await pilot.press("escape")
        await pilot.pause()

    result = getattr(app, "result", None)
    assert result is not None
    assert result.saved is False
    # Original display should be unchanged.
    assert display.show_tool_results is True


@verifies(SWR.SWR_1086)
@pytest.mark.asyncio
async def test_tool_result_alt_dismiss_via_save_no_changes() -> None:
    """Alternative path: save with no changes — still returns saved=True."""
    display = TuiDisplayConfig()

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app.push_screen(
            ToolResultSettingsScreen(display),
            callback=lambda r: setattr(app, "result", r),
        )
        await pilot.pause()

        assert isinstance(app.screen, ToolResultSettingsScreen)

        await _press_leader_shortcut(pilot, "s")

    result = getattr(app, "result", None)
    assert result is not None
    assert result.saved is True


@verifies(SWR.SWR_1086)
@pytest.mark.asyncio
async def test_tool_result_random_interaction_no_crash() -> None:
    """Random interaction: unmapped keys and resize must not crash."""
    display = TuiDisplayConfig()

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()

        app.push_screen(ToolResultSettingsScreen(display))
        await pilot.pause()

        assert isinstance(app.screen, ToolResultSettingsScreen)

        # Unmapped keys.
        await pilot.press("q", "f5", "tab", "pageup", "pagedown", "x")
        await pilot.pause()

        # Resize.
        from textual.events import Resize
        from textual.geometry import Size

        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        # Still fine.
        assert isinstance(app.screen, ToolResultSettingsScreen)

        # Can dismiss.
        await pilot.press("escape")
        await pilot.pause()
