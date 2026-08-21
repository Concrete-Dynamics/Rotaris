"""TUI tests for the MCP Secrets screen.

REQ-20260526-004 — validates scope toggle, expected-keys hint, save/delete with
workspace vs global scope selection, and empty-state handling.
"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from textual.widgets import DataTable, Input, Select, Static

from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import RotarisTuiApp
from rotaris_core.tui.screens.mcp_secrets import (
    SCOPE_WORKSPACE,
    MCPSecretsScreen,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_secrets_store(secrets: dict[str, dict[str, str]]) -> MagicMock:
    """Create a mock ``_load_secrets_file`` that returns *secrets*.

    *secrets* keys are server names, values are ``{key: value}`` dicts.
    """

    def loader(config_dir: Path) -> dict[str, dict[str, str]]:
        return secrets if isinstance(config_dir, Path) else {}

    return MagicMock(side_effect=loader)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_config() -> RotarisConfig:
    """Minimal config with one MCP server that declares an env var."""
    cfg = RotarisConfig()
    cfg.mcp_servers = {
        "tavily": MCPServerConfig(
            type="http",
            url="http://localhost:0",
            env={"TAVILY_API_KEY": "${TAVILY_API_KEY}"},
        ),
        "lsp": MCPServerConfig(
            type="stdio",
            command="npx",
            args=["-y", "@theupsider/lsp-mcp@latest"],
            env={},  # no env vars
        ),
    }
    cfg.mcp_server_sources = {"tavily": "default", "lsp": "default"}
    cfg.workspace_root = Path("/fake/workspace")
    return cfg


@pytest.fixture
def mock_set_unset_secrets(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Track calls to set_secret / unset_secret.

    Targets ``rotaris_core.config.secrets`` because those functions are
    imported lazily inside method bodies, not at module level.
    """
    tracker = MagicMock()
    monkeypatch.setattr(
        "rotaris_core.config.secrets.set_secret",
        tracker.set_secret,
    )
    monkeypatch.setattr(
        "rotaris_core.config.secrets.unset_secret",
        tracker.unset_secret,
    )
    return tracker


# ---------------------------------------------------------------------------
# 1. Full User Workflow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@verifies(SWR.SWR_1725, SWR.SWR_1727)
async def test_mcp_secrets_full_workflow(
    mock_config: RotarisConfig,
    mock_set_unset_secrets: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Full workflow: open screen, pick server, add secret, verify persistence."""
    workspace_dir = tmp_path / ".rotaris"
    workspace_dir.mkdir()
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()

    server_envs = {"tavily": ["TAVILY_API_KEY"], "lsp": []}
    load_mock = _make_secrets_store({})
    monkeypatch.setattr(
        "rotaris_core.config.secrets._load_secrets_file",
        load_mock,
    )

    screen = MCPSecretsScreen(
        server_names=["tavily", "lsp"],
        workspace_root=tmp_path,
        workspace_config_dir=workspace_dir,
        global_config_dir=global_dir,
        server_envs=server_envs,
    )

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(screen)
        await pilot.pause()

        # --- Select "tavily" server ---
        screen.query_one("#mcp-secrets-server-select", Select).value = "tavily"
        screen._load_server("tavily")
        await pilot.pause()

        # Verify expected keys hint
        expected = screen.query_one("#mcp-secrets-expected", Static)
        assert "TAVILY_API_KEY" in str(expected.render())

        # Verify status line mentions saving to Workspace
        status = screen.query_one("#mcp-secrets-status", Static)
        assert "0 env var(s) stored" in str(status.render())
        assert "Workspace" in str(status.render())

        # --- Add a secret ---
        key_input = screen.query_one("#mcp-secrets-key-input", Input)
        value_input = screen.query_one("#mcp-secrets-value-input", Input)

        await pilot.click(key_input)
        await pilot.pause()
        await pilot.press(*list("TAVILY_API_KEY"))
        await pilot.pause()

        await pilot.click(value_input)
        await pilot.pause()
        await pilot.press(*list("tvly-test123"))
        await pilot.pause()

        # Save via Ctrl+S
        await pilot.press("ctrl+s")
        await pilot.pause()

        # Verify set_secret called with workspace config dir
        mock_set_unset_secrets.set_secret.assert_called_once()
        args = mock_set_unset_secrets.set_secret.call_args[0]
        assert args[0] == workspace_dir  # config_dir = workspace
        assert args[1] == "tavily"
        assert args[2] == "TAVILY_API_KEY"
        assert args[3] == "tvly-test123"

        # After save, table should show the entry. Re-load is simulated via mock.
        # Since the mock returns empty, table stays empty — but the point is
        # set_secret was called correctly. Let's re-patch the mock to return data.
        load_mock2 = _make_secrets_store({"tavily": {"TAVILY_API_KEY": "tvly-test123"}})
        monkeypatch.setattr(
            "rotaris_core.config.secrets._load_secrets_file",
            load_mock2,
        )

        # Trigger re-load by switching server and back
        screen.query_one("#mcp-secrets-server-select", Select).value = "lsp"
        screen._load_server("lsp")
        await pilot.pause()
        screen.query_one("#mcp-secrets-server-select", Select).value = "tavily"
        screen._load_server("tavily")
        await pilot.pause()

        table = screen.query_one("#mcp-secrets-table", DataTable)
        assert table.row_count == 1
        row = table.get_row_at(0)
        assert row[0] == "TAVILY_API_KEY"  # Key column
        # Value column is masked
        assert row[2] == SCOPE_WORKSPACE  # Scope column

        # --- Dismiss ---
        await pilot.press("escape")
        await pilot.pause()
        assert not screen.is_active


# ---------------------------------------------------------------------------
# 2. Alternative Workflow Paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@verifies(SWR.SWR_1725, SWR.SWR_1727)
async def test_mcp_secrets_global_scope_save(
    mock_config: RotarisConfig,
    mock_set_unset_secrets: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Save a secret to Global scope instead of Workspace."""
    workspace_dir = tmp_path / ".rotaris"
    workspace_dir.mkdir()
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()

    load_mock = _make_secrets_store({})
    monkeypatch.setattr(
        "rotaris_core.config.secrets._load_secrets_file",
        load_mock,
    )

    screen = MCPSecretsScreen(
        server_names=["tavily"],
        workspace_root=tmp_path,
        workspace_config_dir=workspace_dir,
        global_config_dir=global_dir,
        server_envs={"tavily": ["TAVILY_API_KEY"]},
    )

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(screen)
        await pilot.pause()

        # Select "tavily"
        screen.query_one("#mcp-secrets-server-select", Select).value = "tavily"
        screen._load_server("tavily")
        await pilot.pause()

        # Switch scope to Global
        scope_select = screen.query_one("#mcp-secrets-scope-select", Select)
        await pilot.click(scope_select)
        await pilot.pause()
        await pilot.press("down", "enter")  # "Global"
        await pilot.pause()

        status = screen.query_one("#mcp-secrets-status", Static)
        assert "Global" in str(status.render())

        # Add secret
        key_input = screen.query_one("#mcp-secrets-key-input", Input)
        value_input = screen.query_one("#mcp-secrets-value-input", Input)
        await pilot.click(key_input)
        await pilot.pause()
        await pilot.press(*list("TAVILY_API_KEY"))
        await pilot.pause()
        await pilot.click(value_input)
        await pilot.pause()
        await pilot.press(*list("global-key-456"))
        await pilot.pause()

        await pilot.press("ctrl+s")
        await pilot.pause()

        mock_set_unset_secrets.set_secret.assert_called_once()
        args = mock_set_unset_secrets.set_secret.call_args[0]
        assert args[0] == global_dir  # written to global, not workspace
        assert args[1] == "tavily"
        assert args[2] == "TAVILY_API_KEY"
        assert args[3] == "global-key-456"


@pytest.mark.asyncio
@verifies(SWR.SWR_1725, SWR.SWR_1727)
async def test_mcp_secrets_delete_secret(
    mock_config: RotarisConfig,
    mock_set_unset_secrets: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Delete a secret from the selected scope."""
    workspace_dir = tmp_path / ".rotaris"
    workspace_dir.mkdir()
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()

    load_mock = _make_secrets_store(
        {"tavily": {"TAVILY_API_KEY": "tvly-abc", "TAVILY_EXTRA": "extra-val"}},
    )
    monkeypatch.setattr(
        "rotaris_core.config.secrets._load_secrets_file",
        load_mock,
    )

    screen = MCPSecretsScreen(
        server_names=["tavily"],
        workspace_root=tmp_path,
        workspace_config_dir=workspace_dir,
        global_config_dir=global_dir,
        server_envs={"tavily": ["TAVILY_API_KEY"]},
    )

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(screen)
        await pilot.pause()

        # Select "tavily"
        screen.query_one("#mcp-secrets-server-select", Select).value = "tavily"
        screen._load_server("tavily")
        await pilot.pause()

        table = screen.query_one("#mcp-secrets-table", DataTable)
        assert table.row_count == 2

        # Focus table, move cursor to first row, then delete
        table.focus()
        await pilot.pause()
        await pilot.press("enter")  # select first row (cursor_type="row")
        await pilot.pause()
        await pilot.press("d")  # delete
        await pilot.pause()

        mock_set_unset_secrets.unset_secret.assert_called_once()
        args = mock_set_unset_secrets.unset_secret.call_args[0]
        assert args[0] == workspace_dir  # default scope = workspace
        assert args[1] == "tavily"
        assert args[2] == "TAVILY_API_KEY"


@pytest.mark.asyncio
@verifies(SWR.SWR_1725, SWR.SWR_1727)
async def test_mcp_secrets_empty_state(
    tmp_path: Path,
) -> None:
    """Screen with no servers shows empty-state message."""
    workspace_dir = tmp_path / ".rotaris"
    workspace_dir.mkdir()
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()

    screen = MCPSecretsScreen(
        server_names=[],
        workspace_root=tmp_path,
        workspace_config_dir=workspace_dir,
        global_config_dir=global_dir,
    )

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(screen)
        await pilot.pause()

        status = screen.query_one("#mcp-secrets-status", Static)
        assert "No MCP servers configured." in str(status.render())

        # Escape dismisses
        await pilot.press("escape")
        await pilot.pause()
        assert not screen.is_active


@pytest.mark.asyncio
@verifies(SWR.SWR_1725, SWR.SWR_1727)
async def test_mcp_secrets_no_expected_keys(
    mock_config: RotarisConfig,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Server with no expected env keys shows no hint."""
    workspace_dir = tmp_path / ".rotaris"
    workspace_dir.mkdir()
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()

    load_mock = _make_secrets_store({})
    monkeypatch.setattr(
        "rotaris_core.config.secrets._load_secrets_file",
        load_mock,
    )

    screen = MCPSecretsScreen(
        server_names=["tavily"],
        workspace_root=tmp_path,
        workspace_config_dir=workspace_dir,
        global_config_dir=global_dir,
        server_envs={},  # no expected keys
    )

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(screen)
        await pilot.pause()

        # Select "tavily"
        screen.query_one("#mcp-secrets-server-select", Select).value = "tavily"
        screen._load_server("tavily")
        await pilot.pause()

        expected = screen.query_one("#mcp-secrets-expected", Static)
        assert str(expected.render()) == ""


# ---------------------------------------------------------------------------
# 3. Random Interaction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@verifies(SWR.SWR_1725, SWR.SWR_1727)
async def test_mcp_secrets_random_interaction(
    mock_config: RotarisConfig,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Random keystrokes and resize must not crash the screen."""
    workspace_dir = tmp_path / ".rotaris"
    workspace_dir.mkdir()
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()

    load_mock = _make_secrets_store({})
    monkeypatch.setattr(
        "rotaris_core.config.secrets._load_secrets_file",
        load_mock,
    )

    screen = MCPSecretsScreen(
        server_names=["tavily"],
        workspace_root=tmp_path,
        workspace_config_dir=workspace_dir,
        global_config_dir=global_dir,
        server_envs={"tavily": ["TAVILY_API_KEY"]},
    )

    app = RotarisTuiApp()
    async with app.run_test() as pilot:
        await pilot.pause()
        app.push_screen(screen)
        await pilot.pause()

        # Random keys
        await pilot.press("q", "x", "tab", "pageup", "f5", "pagedown")
        await pilot.pause()

        # Resize
        from textual.events import Resize
        from textual.geometry import Size

        screen.post_message(Resize(Size(120, 40), Size(80, 24)))
        await pilot.pause()

        # Should still be functional
        assert screen.query_one("#mcp-secrets-title", Static) is not None
        assert screen.query_one("#mcp-secrets-server-select", Select) is not None

        # Escape dismisses
        await pilot.press("escape")
        await pilot.pause()
        assert not screen.is_active
