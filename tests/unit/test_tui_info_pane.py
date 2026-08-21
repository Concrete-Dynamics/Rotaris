from typing import Any

import pytest
from rich.console import Console
from textual.app import App, ComposeResult

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.widgets.info_pane import InfoPane


class MinimalApp(App[None]):
    def compose(self) -> ComposeResult:
        yield InfoPane()


@pytest.fixture
def minimal_app() -> MinimalApp:
    return MinimalApp()


def get_text(renderable: Any) -> str:
    console = Console(width=200, force_terminal=False, color_system=None)
    with console.capture() as capture:
        console.print(renderable)
    return capture.get()


def get_info_pane_text(info_pane: InfoPane) -> str:
    return get_text(info_pane._build_renderable())


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_renders_yaml_source_indicator(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {"name": "fs-server", "status": "active", "source": "yaml", "type": "stdio"},
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "● fs-server" in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_renders_discovered_project_indicator(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {
                    "name": "proj-server",
                    "status": "active",
                    "source": "discovered-project",
                    "type": "stdio",
                },
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "◆ proj-server" in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_renders_discovered_user_indicator(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {
                    "name": "user-server",
                    "status": "active",
                    "source": "discovered-user",
                    "type": "stdio",
                },
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "◇ user-server" in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_renders_default_indicator(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {"name": "def-server", "status": "active", "source": "default", "type": "stdio"},
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "○ def-server" in text_content


@verifies(SWR.SWR_1424, SWR.SWR_1259)
@pytest.mark.asyncio
async def test_info_pane_renders_unavailable_with_source_glyph(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {
                    "name": "proj-server",
                    "status": "unavailable",
                    "source": "discovered-project",
                    "type": "stdio",
                },
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "◆ proj-server" in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_renders_http_transport_hint(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {"name": "http-server", "status": "active", "source": "yaml", "type": "http"},
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "● http-server [http]" in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_renders_sse_transport_hint(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {"name": "sse-server", "status": "active", "source": "yaml", "type": "sse"},
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "● sse-server [sse]" in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_omits_transport_hint_for_stdio(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {"name": "stdio-server", "status": "active", "source": "yaml", "type": "stdio"},
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "● stdio-server" in text_content
        assert "[stdio]" not in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_handles_unknown_source_label_gracefully(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {
                    "name": "future-server",
                    "status": "active",
                    "source": "future-source",
                    "type": "stdio",
                },
            ],
        )
        await pilot.pause()
        text_content = get_info_pane_text(info_pane)
        assert "○ future-server" in text_content


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_handles_resize_during_render(minimal_app: MinimalApp) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            mcp_servers=[
                {"name": "fs-server", "status": "active", "source": "yaml", "type": "stdio"},
            ],
        )
        await pilot.resize_terminal(40, 20)
        await pilot.resize_terminal(120, 30)
        await pilot.pause()
        assert info_pane.is_mounted


@verifies(SWR.SWR_1424)
@pytest.mark.asyncio
async def test_info_pane_renders_read_artifacts_as_filled_indicator(
    minimal_app: MinimalApp,
) -> None:
    async with minimal_app.run_test() as pilot:
        info_pane = minimal_app.query_one(InfoPane)
        info_pane.update_info(
            has_session=True,
            artifacts_received=[
                {
                    "id": "art_read",
                    "slug": "read-notes",
                    "title": "Read Notes",
                    "kind": "child_report",
                    "read": True,
                    "edited": False,
                },
                {
                    "id": "art_unread",
                    "slug": "unread-notes",
                    "title": "Unread Notes",
                    "kind": "child_report",
                    "read": False,
                    "edited": False,
                },
            ],
        )
        await pilot.pause()

        text_content = get_info_pane_text(info_pane)
        assert "● read-notes" in text_content
        assert "○ unread-notes" in text_content
