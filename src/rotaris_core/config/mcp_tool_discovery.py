from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.config.mcp_resolution import resolve_stdio_server_command_args
from rotaris_core.config.schema import MCPServerConfig, MCPToolInfo
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

_log = logging.getLogger(__name__)

_DISCOVERY_TIMEOUT_SECONDS = 30.0
_HEALTH_PROBE_TIMEOUT_SECONDS = 8.0
_TOOL_CACHE: dict[tuple[Any, ...], tuple[MCPToolInfo, ...]] = {}
_logged_discovery_failures: set[tuple[Any, ...]] = set()


@dataclass(frozen=True)
class MCPHealthResult:
    """Outcome of a single, uncached connectivity probe against an MCP server."""

    healthy: bool
    tool_count: int | None
    error: str | None


@traces(SWR.SWR_1732)
def probe_mcp_server_health(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
    *,
    timeout_seconds: float = _HEALTH_PROBE_TIMEOUT_SECONDS,
) -> MCPHealthResult:
    """Connect to a server and report reachability. Never raises; never cached.

    Unlike ``list_mcp_server_tools``, every call re-connects — this is for live
    status indicators, not for building the persona prompt's tool catalogue.
    """
    try:
        tools = _run_tool_discovery(
            server_name,
            server_cfg,
            workspace_root,
            timeout_seconds=timeout_seconds,
        )
    except (
        OSError,
        RuntimeError,
        ImportError,
        ValueError,
        # covers asyncio.TimeoutError (same class in Python 3.11+)
        TimeoutError,
        ExceptionGroup,
    ) as exc:
        return MCPHealthResult(healthy=False, tool_count=None, error=str(exc))
    return MCPHealthResult(healthy=True, tool_count=len(tools), error=None)


def clear_mcp_tool_discovery_cache() -> None:
    """Clear cached MCP tool metadata. Intended for tests and config reload boundaries."""
    _TOOL_CACHE.clear()
    _logged_discovery_failures.clear()


def was_mcp_discovery_failed(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
) -> bool:
    """Return True if the last discovery attempt for this server ended in a failure."""
    return _cache_key(server_name, server_cfg, workspace_root) in _logged_discovery_failures


@traces(SWR.SWR_1721)
def list_mcp_server_tools(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
    *,
    timeout_seconds: float = _DISCOVERY_TIMEOUT_SECONDS,
) -> list[MCPToolInfo]:
    """Return visible tools reported by the running MCP server via tools/list."""
    cache_key = _cache_key(server_name, server_cfg, workspace_root)
    cached = _TOOL_CACHE.get(cache_key)
    if cached is None:
        try:
            discovered = _run_tool_discovery(
                server_name,
                server_cfg,
                workspace_root,
                timeout_seconds=timeout_seconds,
            )
        except (
            OSError,
            RuntimeError,
            ImportError,
            ValueError,
            # covers asyncio.TimeoutError (same class in Python 3.11+)
            TimeoutError,
            ExceptionGroup,
        ) as exc:
            if cache_key not in _logged_discovery_failures:
                _logged_discovery_failures.add(cache_key)
                _log.warning(
                    "Could not list tools for MCP server '%s'; prompt will show the server "
                    "without tool details: %s",
                    server_name,
                    exc,
                )
            discovered = []
        cached = tuple(discovered)
        _TOOL_CACHE[cache_key] = cached

    disabled_tools = set(server_cfg.disabled_tools)
    visible = [tool for tool in cached if tool.name not in disabled_tools]

    tool_name_map = server_cfg.tool_name_map or {}
    if tool_name_map:
        renamed: list[MCPToolInfo] = []
        for tool in visible:
            friendly = tool_name_map.get(tool.name)
            if friendly is not None:
                renamed.append(MCPToolInfo(name=friendly, description=tool.description))
            else:
                renamed.append(tool)
        return renamed
    return visible


def _cache_key(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
) -> tuple[Any, ...]:
    return (
        server_name,
        server_cfg.type,
        server_cfg.command,
        tuple(server_cfg.args),
        tuple(sorted(server_cfg.env.items())),
        server_cfg.cwd,
        server_cfg.url,
        tuple(sorted((server_cfg.headers or {}).items())),
        str(workspace_root),
    )


def _run_tool_discovery(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
    *,
    timeout_seconds: float,
) -> list[MCPToolInfo]:
    def _run() -> list[MCPToolInfo]:
        return asyncio.run(
            asyncio.wait_for(
                _list_mcp_tools_async(server_name, server_cfg, workspace_root),
                timeout=timeout_seconds,
            ),
        )

    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    if running_loop and running_loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(_run).result(timeout=timeout_seconds + 5.0)

    return _run()


async def _list_mcp_tools_async(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
) -> list[MCPToolInfo]:
    if server_cfg.type == "stdio":
        return await _list_stdio_mcp_tools(server_name, server_cfg, workspace_root)
    if server_cfg.type == "http":
        return await _list_http_mcp_tools(server_cfg)
    return await _list_sse_mcp_tools(server_cfg)


async def _list_stdio_mcp_tools(
    server_name: str,
    server_cfg: MCPServerConfig,
    workspace_root: Path,
) -> list[MCPToolInfo]:
    from mcp import StdioServerParameters
    from mcp.client.stdio import stdio_client

    command, args = resolve_stdio_server_command_args(
        server_name,
        server_cfg.command or "",
        list(server_cfg.args),
        workspace_root,
    )
    params = StdioServerParameters(
        command=command,
        args=args,
        env=dict(server_cfg.env),
        cwd=server_cfg.cwd or str(workspace_root),
    )

    # Capture tools inside the context-manager body so they survive
    # cleanup races.  stdio_client.__aexit__ may raise ExceptionGroup
    # when asyncio.run() destroys the event loop before the subprocess
    # pipes are fully closed (BrokenResourceError).  The tools were
    # already returned by the server at that point.
    tools_holder: list[MCPToolInfo] = []
    try:
        async with stdio_client(params) as streams:
            read_stream, write_stream = streams
            tools_holder[:] = await _tools_from_session(read_stream, write_stream)
    except ExceptionGroup:
        if tools_holder:
            _log.debug(
                "MCP server '%s' returned %d tools; ignoring spurious "
                "ExceptionGroup from stdio_client cleanup.",
                server_name,
                len(tools_holder),
            )
            return list(tools_holder)
        raise
    return list(tools_holder)


async def _list_http_mcp_tools(server_cfg: MCPServerConfig) -> list[MCPToolInfo]:
    from mcp.client.streamable_http import streamablehttp_client

    async with streamablehttp_client(
        server_cfg.url or "",
        headers=server_cfg.headers,
    ) as streams:
        read_stream, write_stream = streams[0], streams[1]
        return await _tools_from_session(read_stream, write_stream)


async def _list_sse_mcp_tools(server_cfg: MCPServerConfig) -> list[MCPToolInfo]:
    from mcp.client.sse import sse_client

    async with sse_client(
        server_cfg.url or "",
        headers=server_cfg.headers,
    ) as streams:
        read_stream, write_stream = streams[0], streams[1]
        return await _tools_from_session(read_stream, write_stream)


async def _tools_from_session(read_stream: Any, write_stream: Any) -> list[MCPToolInfo]:
    from mcp import ClientSession

    async with ClientSession(read_stream, write_stream) as session:
        await session.initialize()
        result = await session.list_tools()

    tools: list[MCPToolInfo] = []
    for raw_tool in getattr(result, "tools", []):
        raw_name = getattr(raw_tool, "name", "")
        if not isinstance(raw_name, str) or raw_name == "":
            continue
        raw_description = getattr(raw_tool, "description", "") or ""
        tools.append(MCPToolInfo(name=raw_name, description=str(raw_description)))
    return tools
