"""Unit tests for session-scoped shared MCP client infrastructure."""

from __future__ import annotations

import asyncio
import contextlib
import threading

import pytest
from openhands.sdk.mcp.tool import MCPToolExecutor

from rotaris_core.mcp.session_manager import SessionMCPManager
from rotaris_core.mcp.shared_client import SharedMCPClient
from rotaris_core.reqtocode import SWR, verifies

# ---------------------------------------------------------------------------
# SharedMCPClient
# ---------------------------------------------------------------------------


class FakeMCPClient:
    """Minimal fake matching the MCPClient interface our wrapper needs."""

    def __init__(self) -> None:
        self._closed = False
        self._tools: list[object] = []
        self._connected = True
        self._call_log: list[str] = []

    def sync_close(self) -> None:
        self._closed = True
        self._call_log.append("sync_close")

    def is_connected(self) -> bool:
        return self._connected and not self._closed

    async def connect(self) -> None:
        self._connected = True

    async def call_tool_mcp(self, name: str, arguments: dict) -> object:
        self._call_log.append(f"call_tool_mcp:{name}")
        return {"result": f"ok-{name}"}

    def call_async_from_sync(self, fn, *args, **kwargs) -> object:
        self._call_log.append("call_async_from_sync")
        return None


@verifies(SWR.SWR_1731)
def test_shared_client_sync_close_is_noop() -> None:
    real = FakeMCPClient()
    shared = SharedMCPClient(real)  # type: ignore[arg-type]

    shared.sync_close()

    assert real._closed is False
    assert shared._closed is False
    assert shared.is_connected() is True


@verifies(SWR.SWR_1731)
def test_shared_client_rebinds_sdk_tool_executors_before_agent_teardown() -> None:
    """Productive use: sequential agents can reuse one session-scoped MCP connection.

    Expected outcome: closing one agent's SDK tool executor leaves the shared
    connection available to later agents.
    """
    real = FakeMCPClient()
    executor = MCPToolExecutor(tool_name="lsp_formatting", client=real)  # type: ignore[arg-type]
    real._tools = [type("FakeTool", (), {"executor": executor})()]

    shared = SharedMCPClient(real)  # type: ignore[arg-type]
    executor.close()

    assert executor.client is shared
    assert real._closed is False
    assert shared.is_connected() is True


@verifies(SWR.SWR_1731)
def test_shared_client_force_close_kills_real() -> None:
    real = FakeMCPClient()
    shared = SharedMCPClient(real)  # type: ignore[arg-type]

    shared.force_close()

    assert real._closed is True
    assert shared._closed is False  # property always returns False


@verifies(SWR.SWR_1731)
def test_shared_client_delegates_is_connected() -> None:
    real = FakeMCPClient()
    shared = SharedMCPClient(real)  # type: ignore[arg-type]

    assert shared.is_connected() is True
    real.sync_close()
    assert shared.is_connected() is False


@verifies(SWR.SWR_1731)
def test_shared_client_delegates_call_tool_mcp_serially() -> None:
    real = FakeMCPClient()
    shared = SharedMCPClient(real)  # type: ignore[arg-type]

    import asyncio

    async def _call() -> None:
        await shared.call_tool_mcp("test_tool", {})

    asyncio.run(_call())

    assert "call_tool_mcp:test_tool" in real._call_log


@verifies(SWR.SWR_1731)
def test_shared_client_call_tool_mcp_is_thread_safe() -> None:
    """Concurrent call_tool_mcp calls are serialised by the internal lock."""
    real = FakeMCPClient()
    shared = SharedMCPClient(real)  # type: ignore[arg-type]
    results: list[int] = []
    errors: list[Exception] = []

    import asyncio

    async def _worker(n: int) -> None:
        try:
            await shared.call_tool_mcp(f"tool_{n}", {})
            results.append(n)
        except Exception as exc:
            errors.append(exc)

    async def _run_all() -> None:
        await asyncio.gather(*(_worker(i) for i in range(10)))

    asyncio.run(_run_all())

    assert len(errors) == 0
    assert len(results) == 10
    assert len(real._call_log) == 10


@pytest.mark.timeout(1)
@verifies(SWR.SWR_1731)
def test_shared_client_queues_calls_without_blocking_the_event_loop() -> None:
    """Productive use: concurrent child agents can share an MCP tool connection.

    Expected outcome: a queued call does not freeze the event loop while another
    call awaits the MCP server.
    """

    class BlockingMCPClient(FakeMCPClient):
        def __init__(self) -> None:
            super().__init__()
            self.first_call_started = asyncio.Event()
            self.allow_first_call_to_finish = asyncio.Event()

        async def call_tool_mcp(self, name: str, arguments: dict) -> object:
            self._call_log.append(f"call_tool_mcp:{name}")
            if name == "first":
                self.first_call_started.set()
                await self.allow_first_call_to_finish.wait()
            return {"result": f"ok-{name}"}

    real = BlockingMCPClient()
    shared = SharedMCPClient(real)  # type: ignore[arg-type]

    async def run_calls() -> None:
        first = asyncio.create_task(shared.call_tool_mcp("first", {}))
        await real.first_call_started.wait()

        second = asyncio.create_task(shared.call_tool_mcp("second", {}))
        await asyncio.sleep(0)
        assert not second.done()

        loop_probe = asyncio.create_task(asyncio.sleep(0))
        await asyncio.wait_for(loop_probe, timeout=0.1)

        real.allow_first_call_to_finish.set()
        await asyncio.wait_for(asyncio.gather(first, second), timeout=0.1)

    asyncio.run(run_calls())
    assert real._call_log == ["call_tool_mcp:first", "call_tool_mcp:second"]


# ---------------------------------------------------------------------------
# SessionMCPManager
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1731)
def test_manager_caches_client() -> None:
    manager = SessionMCPManager()

    assert manager.get_or_create("lsp") is None  # not cached yet

    real = FakeMCPClient()
    shared = manager.cache_client("lsp", real)  # type: ignore[arg-type]

    assert shared is not None
    assert isinstance(shared, SharedMCPClient)

    # Second lookup returns the cached client
    cached = manager.get_or_create("lsp")
    assert cached is shared


@verifies(SWR.SWR_1731)
def test_manager_cache_client_double_check_handles_race() -> None:
    """Race: two threads both miss get_or_create, first wins, second discards."""
    manager = SessionMCPManager()

    real1 = FakeMCPClient()
    real2 = FakeMCPClient()

    shared1 = manager.cache_client("srv", real1)  # type: ignore[arg-type]
    # Second client is discarded; real1's wrapper is returned
    shared2 = manager.cache_client("srv", real2)  # type: ignore[arg-type]

    assert shared1 is shared2
    assert real2._closed is True  # duplicate was closed


@verifies(SWR.SWR_1731)
def test_manager_discards_only_the_failed_shared_client() -> None:
    """Productive use: later child agents can recover after an MCP transport fails.

    Expected outcome: the failed client is closed and removed without removing a
    replacement client cached by another caller.
    """
    manager = SessionMCPManager()
    failed_real = FakeMCPClient()
    failed_shared = manager.cache_client("lsp", failed_real)  # type: ignore[arg-type]

    assert manager.discard_client("lsp", failed_shared) is True
    assert failed_real._closed is True
    assert manager.get_or_create("lsp") is None

    replacement_real = FakeMCPClient()
    replacement_shared = manager.cache_client("lsp", replacement_real)  # type: ignore[arg-type]

    assert manager.discard_client("lsp", failed_shared) is False
    assert manager.get_or_create("lsp") is replacement_shared
    assert replacement_real._closed is False


@verifies(SWR.SWR_1731)
def test_manager_shutdown_closes_all() -> None:
    manager = SessionMCPManager()
    real_a = FakeMCPClient()
    real_b = FakeMCPClient()
    manager.cache_client("a", real_a)  # type: ignore[arg-type]
    manager.cache_client("b", real_b)  # type: ignore[arg-type]

    manager.shutdown()

    assert real_a._closed is True
    assert real_b._closed is True
    assert manager.get_or_create("a") is None
    assert manager.get_or_create("b") is None


@verifies(SWR.SWR_1731)
def test_manager_shutdown_is_idempotent() -> None:
    manager = SessionMCPManager()
    real = FakeMCPClient()
    manager.cache_client("x", real)  # type: ignore[arg-type]

    manager.shutdown()
    manager.shutdown()  # second call should not fail

    assert real._closed is True


@verifies(SWR.SWR_1731)
def test_manager_cache_after_shutdown_raises() -> None:
    manager = SessionMCPManager()
    manager.shutdown()

    real = FakeMCPClient()
    with pytest.raises(RuntimeError, match="shut down"):
        manager.cache_client("late", real)  # type: ignore[arg-type]


@verifies(SWR.SWR_1731)
def test_manager_cache_after_shutdown_closes_real_client() -> None:
    """When caching fails after shutdown, the real client that was created
    outside the lock is cleaned up (no leaked subprocess)."""
    manager = SessionMCPManager()
    manager.shutdown()

    real = FakeMCPClient()
    with contextlib.suppress(RuntimeError):
        manager.cache_client("late", real)  # type: ignore[arg-type]

    assert real._closed is True


@verifies(SWR.SWR_1731)
def test_manager_concurrent_get_or_create_is_safe() -> None:
    """Hammer get_or_create from many threads; verify no errors."""
    manager = SessionMCPManager()
    real = FakeMCPClient()
    manager.cache_client("shared", real)  # type: ignore[arg-type]

    errors: list[Exception] = []

    def _worker() -> None:
        try:
            for _ in range(200):
                result = manager.get_or_create("shared")
                if result is None:
                    errors.append(RuntimeError("unexpected None"))
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=_worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0
