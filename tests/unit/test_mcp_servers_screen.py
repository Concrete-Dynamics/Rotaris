import json
from pathlib import Path

import pytest
from textual.widgets import DataTable

from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp
from rotaris_core.tui.mcp_toggles import MCPToggleStore
from rotaris_core.tui.screens.mcp_servers import MCPServersScreen


@pytest.fixture
def mock_config() -> RotarisConfig:
    cfg = RotarisConfig()
    cfg.mcp_servers = {
        "test_server": MCPServerConfig(
            type="stdio",
            command="echo",
            args=["hello"],
        ),
    }
    cfg.mcp_server_sources = {"test_server": "yaml"}
    return cfg


@verifies(SWR.SWR_1708)
@pytest.mark.asyncio
async def test_mcp_servers_screen_full_workflow(
    mock_config: RotarisConfig,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Full workflow using slash command
    toggle_file = tmp_path / "mcp_toggles.json"
    toggle_file.write_text(json.dumps({"test_server": True}))

    # Patch global config dir so MCPToggleStore uses the tmp file
    monkeypatch.setattr("rotaris_core.tui.mcp_toggles._DEFAULT_TOGGLE_PATH", toggle_file)

    app = RotarisTuiApp(config=mock_config)
    async with app.run_test() as pilot:
        await pilot.pause()

        # Type /mcp and enter
        from rotaris_core.tui.widgets.input_composer import InputComposer

        composer = app.screen.query_one(InputComposer)
        composer.set_text("/mcp")
        composer.input_widget.focus()
        await pilot.pause()
        # First Enter accepts the active slash-command suggestion; second
        # Enter submits the selected command.
        await pilot.press("enter")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()

        # Should be on MCPServersScreen
        assert isinstance(app.screen, MCPServersScreen)
        table = app.screen.query_one(DataTable)
        assert table.row_count == 1

        # Check initial state (enabled)
        row = table.get_row_at(0)
        assert row[4] == "[x]"

        # Press space to toggle
        await pilot.press("space")
        await pilot.pause()

        # Should now be disabled
        row = table.get_row_at(0)
        assert row[4] == "[ ]"

        store = MCPToggleStore(path=toggle_file)
        assert store.is_enabled("test_server") is False

        # Press escape to close
        await pilot.press("escape")
        await pilot.pause()

        # Should be back to main screen
        from rotaris_core.tui.screens.main import MainScreen

        assert isinstance(app.screen, MainScreen)


@verifies(SWR.SWR_1708)
@pytest.mark.asyncio
async def test_mcp_servers_alternative_path(
    mock_config: RotarisConfig,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    toggle_file = tmp_path / "mcp_toggles.json"
    monkeypatch.setattr("rotaris_core.tui.mcp_toggles._DEFAULT_TOGGLE_PATH", toggle_file)

    app = RotarisTuiApp(config=mock_config)
    async with app.run_test() as pilot:
        await pilot.pause()

        # Action directly
        app.action_show_mcp_servers()
        await pilot.pause()

        assert isinstance(app.screen, MCPServersScreen)

        # Test enter binding instead of space
        await pilot.press("enter")
        await pilot.pause()

        table = app.screen.query_one(DataTable)
        row = table.get_row_at(0)
        assert row[4] == "[ ]"

        await pilot.press("escape")
        await pilot.pause()

        # Command palette path
        app.action_command_palette()
        await pilot.pause()

        await pilot.press("M", "C", "P")
        await pilot.pause()

        await pilot.press("enter")
        await pilot.pause()

        assert isinstance(app.screen, MCPServersScreen)
        table = app.screen.query_one(DataTable)
        row = table.get_row_at(0)
        assert row[4] == "[ ]"  # State persisted from earlier toggle!


@verifies(SWR.SWR_1708)
@pytest.mark.asyncio
async def test_mcp_servers_random_interaction(
    mock_config: RotarisConfig,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    toggle_file = tmp_path / "mcp_toggles.json"
    monkeypatch.setattr("rotaris_core.tui.mcp_toggles._DEFAULT_TOGGLE_PATH", toggle_file)

    app = RotarisTuiApp(config=mock_config)
    async with app.run_test() as pilot:
        await pilot.pause()

        app.action_show_mcp_servers()
        await pilot.pause()

        assert isinstance(app.screen, MCPServersScreen)

        # Random keys
        await pilot.press("q", "tab", "pageup", "x")
        await pilot.pause()

        # Resize
        from textual.events import Resize
        from textual.geometry import Size

        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        # Should still be fine
        assert isinstance(app.screen, MCPServersScreen)


@verifies(SWR.SWR_1708)
@pytest.mark.asyncio
async def test_mcp_servers_empty_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    toggle_file = tmp_path / "mcp_toggles.json"
    monkeypatch.setattr("rotaris_core.tui.mcp_toggles._DEFAULT_TOGGLE_PATH", toggle_file)

    cfg = RotarisConfig()
    cfg.mcp_servers = {}

    app = RotarisTuiApp(config=cfg)
    async with app.run_test() as pilot:
        await pilot.pause()

        app.action_show_mcp_servers()
        await pilot.pause()

        assert isinstance(app.screen, MCPServersScreen)
        from textual.widgets import Static

        statics = app.screen.query(Static)
        assert any("No MCP servers configured." in str(s.render()) for s in statics)

        # Space/enter should do nothing gracefully
        await pilot.press("space")
        await pilot.pause()

        await pilot.press("enter")
        await pilot.pause()

        # Escape closes it
        await pilot.press("escape")
        await pilot.pause()
        from rotaris_core.tui.screens.main import MainScreen

        assert isinstance(app.screen, MainScreen)
