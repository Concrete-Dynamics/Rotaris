from unittest.mock import MagicMock

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.providers.command_palette import RotarisCommandPalette


@verifies(SWR.SWR_1169)
@pytest.mark.asyncio
async def test_command_palette_search_mcp() -> None:
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    hits = [hit async for hit in provider.search("mcp")]
    assert any(h.help == "Manage MCP server toggles" for h in hits)

    # Execute it to make sure it calls action_show_mcp_servers
    mcp_hit = next(h for h in hits if h.help == "Manage MCP server toggles")
    mcp_hit.command()
    mock_app.action_show_mcp_servers.assert_called_once()


@verifies(SWR.SWR_806)
@pytest.mark.asyncio
async def test_command_palette_search_runtime_models() -> None:
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    hits = [hit async for hit in provider.search("runtime models")]
    runtime_hit = next(
        h for h in hits if h.help == "Select a runtime provider model for this session"
    )

    runtime_hit.command()

    mock_app.action_show_runtime_models.assert_called_once()


@pytest.mark.asyncio
@verifies(SWR.SWR_761)
async def test_command_palette_search_provider_settings() -> None:
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    hits = [hit async for hit in provider.search("provider settings")]
    provider_hit = next(
        h for h in hits if h.help == "Edit provider credentials and connection settings"
    )

    provider_hit.command()

    mock_app.action_show_provider_settings.assert_called_once()


@pytest.mark.asyncio
@verifies(SWR.SWR_1500)
async def test_command_palette_search_dev_options() -> None:
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    hits = [hit async for hit in provider.search("dev options")]
    dev_hit = next(
        h for h in hits if h.help == "Open developer options and advanced diagnostics toggles"
    )

    dev_hit.command()

    mock_app.action_show_dev_options.assert_called_once()


@verifies(SWR.SWR_1169)
@pytest.mark.asyncio
async def test_command_palette_discover_mcp() -> None:
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    hits = [hit async for hit in provider.discover()]
    assert any(h.help == "Manage MCP server toggles" for h in hits)

    mcp_hit = next(h for h in hits if h.help == "Manage MCP server toggles")
    mcp_hit.command()
    mock_app.action_show_mcp_servers.assert_called_once()


@verifies(SWR.SWR_806)
@pytest.mark.asyncio
async def test_command_palette_discover_runtime_models() -> None:
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    hits = [hit async for hit in provider.discover()]
    runtime_hit = next(
        h for h in hits if h.help == "Select a runtime provider model for this session"
    )

    runtime_hit.command()

    mock_app.action_show_runtime_models.assert_called_once()


@pytest.mark.asyncio
@verifies(SWR.SWR_1500)
async def test_command_palette_discover_dev_options() -> None:
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    hits = [hit async for hit in provider.discover()]
    dev_hit = next(
        h for h in hits if h.help == "Open developer options and advanced diagnostics toggles"
    )

    dev_hit.command()

    mock_app.action_show_dev_options.assert_called_once()


@verifies(SWR.SWR_917)
@pytest.mark.asyncio
async def test_paused_message_limit_command_is_gated_and_dispatches() -> None:
    """Productive use: user can reopen confirmation for a paused session.
    Expected outcome: palette exposes and dispatches the action only in paused-limit state."""
    mock_screen = MagicMock()
    mock_app = MagicMock()
    mock_screen.app = mock_app
    provider = RotarisCommandPalette(mock_screen)

    mock_app.current_session = None
    assert not [hit async for hit in provider.search("continue paused")]
    assert not [
        hit
        async for hit in provider.discover()
        if hit.help == "Open message-limit confirmation for paused session"
    ]

    mock_app.current_session = MagicMock(execution_status="paused_message_limit")
    search_hits = [hit async for hit in provider.search("continue paused")]
    paused_hit = next(
        hit
        for hit in search_hits
        if hit.help == "Open message-limit confirmation for paused session"
    )
    paused_hit.command()
    mock_app.action_resume_paused_message_limit.assert_called_once()

    discover_hits = [hit async for hit in provider.discover()]
    assert any(
        hit.help == "Open message-limit confirmation for paused session" for hit in discover_hits
    )
