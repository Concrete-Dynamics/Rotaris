"""Session-scoped MCP client manager.

Owns one long-lived :class:`SharedMCPClient` per MCP server name, created
lazily on first use.  Stdio-based servers (LSP, filesystem, etc.) start
once and run until :meth:`shutdown` tears them down at app exit.
"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING

from rotaris_core.mcp.shared_client import SharedMCPClient
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk.mcp.client import MCPClient

_log = logging.getLogger(__name__)


@traces(SWR.SWR_1731)
class SessionMCPManager:
    """Per-session registry of shared MCP clients.

    Thread-safe lazy creation.  Call :meth:`shutdown` once at session end
    to tear down all subprocesses / connections.
    """

    def __init__(self) -> None:
        self._clients: dict[str, SharedMCPClient] = {}
        self._lock = threading.Lock()
        self._shutdown = False

    def get_or_create(self, server_name: str) -> SharedMCPClient | None:
        """Return the cached shared client for *server_name*, or ``None``.

        Does NOT create a client — the caller must call :meth:`cache_client`
        after creating and connecting a real ``MCPClient``. This two-step
        pattern lets the caller execute the slow subprocess-spawning work
        outside the lock while still getting safe double-checked caching.
        """
        with self._lock:
            if self._shutdown:
                return None
            return self._clients.get(server_name)

    def cache_client(self, server_name: str, real_client: MCPClient) -> SharedMCPClient:
        """Wrap *real_client* and cache it under *server_name*.

        Returns the :class:`SharedMCPClient` wrapper.  Must be called while
        holding the knowledge that no cached client exists for *server_name*
        (e.g. after a ``get_or_create`` miss).

        Raises:
            RuntimeError: If the manager has been shut down.
        """
        with self._lock:
            if self._shutdown:
                real_client.sync_close()
                raise RuntimeError(f"SessionMCPManager is shut down; cannot cache '{server_name}'.")
            if server_name in self._clients:
                # Race: another thread cached between our get_or_create
                # check and this call. Discard the duplicate.
                real_client.sync_close()
                return self._clients[server_name]

            shared = SharedMCPClient(real_client)
            self._clients[server_name] = shared
            _log.info("Cached shared MCP client for '%s'", server_name)
            return shared

    def discard_client(self, server_name: str, client: SharedMCPClient) -> bool:
        """Remove and close *client* only when it is still the cached instance.

        A failed stdio transport cannot be reused by later conversations. The
        identity check prevents an older failing caller from evicting a newer
        replacement client.
        """
        with self._lock:
            if self._clients.get(server_name) is not client:
                return False
            del self._clients[server_name]

        try:
            client.force_close()
        except Exception:  # noqa: BLE001
            _log.exception("Error discarding shared MCP client '%s'", server_name)
        else:
            _log.info("Discarded failed shared MCP client '%s'", server_name)
        return True

    def shutdown(self) -> None:
        """Tear down all cached shared clients.  Idempotent."""
        with self._lock:
            if self._shutdown:
                return
            self._shutdown = True
            clients = list(self._clients.items())
            self._clients.clear()

        for server_name, shared in clients:
            try:
                shared.force_close()
            except Exception:
                _log.exception(
                    "Error shutting down shared MCP client for '%s'",
                    server_name,
                )
        _log.info("SessionMCPManager shutdown complete (%d client(s))", len(clients))
