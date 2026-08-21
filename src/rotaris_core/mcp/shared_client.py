"""No-op-close wrapper around ``MCPClient`` for session-scoped MCP connections.

``SharedMCPClient`` delegates all operations to a real :class:`MCPClient`
but makes :meth:`sync_close` a no-op so the underlying transport (stdio
subprocess, HTTP session) survives individual conversation teardowns.
Only :meth:`force_close` actually tears down the real client.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterator

    from openhands.sdk.mcp.client import MCPClient
    from openhands.sdk.mcp.tool import MCPToolDefinition


@traces(SWR.SWR_1731)
class SharedMCPClient:
    """Wraps a real ``MCPClient`` with a no-op ``sync_close``.

    Thread-safe for concurrent ``call_tool_mcp`` invocations from separate
    conversations sharing the same transport. Access to the underlying
    client is serialised via a per-instance lock.
    """

    def __init__(self, real_client: MCPClient) -> None:
        self._real = real_client
        self._lock = asyncio.Lock()
        self._bind_tool_executors()

    # ------------------------------------------------------------------
    # properties
    # ------------------------------------------------------------------

    @property
    def tools(self) -> list[MCPToolDefinition]:
        """Return a copy of the real client's tool definitions."""
        self._bind_tool_executors()
        return list(self._real._tools)  # noqa: SLF001 — fastmcp Client stores tools here

    @property
    def _tools(self) -> list[MCPToolDefinition]:
        """Backdoor for SDK internals that read ``client._tools``."""
        self._bind_tool_executors()
        return self._real._tools  # noqa: SLF001

    def _bind_tool_executors(self) -> None:
        """Route SDK tool execution and teardown through this shared wrapper."""
        for tool in self._real._tools:  # noqa: SLF001
            executor = getattr(tool, "executor", None)
            if executor is not None and getattr(executor, "client", None) is self._real:
                executor.client = self

    # ------------------------------------------------------------------
    # delegated fastmcp / MCPClient methods
    # ------------------------------------------------------------------

    def is_connected(self) -> bool:
        return self._real.is_connected()

    async def connect(self) -> None:
        await self._real.connect()

    async def call_tool_mcp(self, name: str, arguments: dict[str, Any]) -> Any:
        """Serialised call_tool_mcp — only one tool runs per transport at a time."""
        async with self._lock:
            return await self._real.call_tool_mcp(name=name, arguments=arguments)

    def call_async_from_sync(self, awaitable_or_fn: Any, *args: Any, **kwargs: Any) -> Any:
        return self._real.call_async_from_sync(awaitable_or_fn, *args, **kwargs)

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    def sync_close(self) -> None:
        """No-op: the shared transport must survive individual conversation teardowns."""

    def force_close(self) -> None:
        """Actually tear down the real client. Called once at session shutdown."""
        self._real.sync_close()

    @property
    def _closed(self) -> bool:
        """Expose ``_closed`` flag matching ``MCPClient`` for SDK introspection.

        Always ``False`` because the shared transport is never closed by a
        single conversation.  The SDK's ``MCPToolExecutor.call_tool`` checks
        this flag to decide whether to return the "client has been closed"
        error.
        """
        return False

    # Context-manager support (SDK iterates tools via iteration protocol)
    def __iter__(self) -> Iterator[MCPToolDefinition]:
        return iter(self._real._tools)  # noqa: SLF001

    def __len__(self) -> int:
        return len(self._real._tools)  # noqa: SLF001
