"""Session-scoped MCP tool provider — SDK integration point.

Implements the :class:`MCPToolProvider` protocol so the SDK's
``LocalConversation`` uses session-scoped shared MCP clients instead of
creating a new connection per conversation.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from openhands.sdk.mcp.client import MCPClient
    from openhands.sdk.mcp.config import MCPServer as SDKMCPServer
    from openhands.sdk.mcp.tool import MCPToolDefinition

    from rotaris_core.config.schema import PersonaConfig, RotarisConfig
    from rotaris_core.mcp.session_manager import SessionMCPManager

_log = logging.getLogger(__name__)

_LSP_INIT_TIMEOUT_SECONDS = 15.0
"""Also the budget for the other per-server post-connect calls below."""


@traces(SWR.SWR_1731)
class SharedMCPToolProvider:
    """Session-scoped :class:`MCPToolProvider`.

    On first call for a server, creates a real ``MCPClient`` via the SDK's
    ``create_mcp_tools()``, wraps it in a :class:`SharedMCPClient` whose
    ``sync_close`` is a no-op, and caches it in the
    :class:`SessionMCPManager`. Subsequent calls return a lightweight
    aggregate whose ``.tools`` lists every cached server's tools. Individual
    ``MCPToolExecutor`` instances retain their per-server
    :class:`SharedMCPClient` reference, so ``call_tool`` routes correctly.
    """

    def __init__(
        self,
        manager: SessionMCPManager,
        workspace_root: Path | str | None = None,
    ) -> None:
        self._manager = manager
        self._workspace_root = Path(workspace_root) if workspace_root is not None else None

    def create_tools(
        self,
        mcp_config: dict[str, SDKMCPServer],
        timeout: float = 30.0,
        *,
        on_tools_changed: Callable[[Sequence[MCPToolDefinition]], None] | None = None,
    ) -> Any:
        """Create (or reuse) shared MCP clients for every server in *mcp_config*.

        Returns a synthetic client whose ``.tools`` aggregates all tools
        from all servers.  Individual tool executors already hold references
        to their per-server :class:`SharedMCPClient`.
        """
        all_tools: list[MCPToolDefinition] = []

        for server_name, server_spec in mcp_config.items():
            shared = self._manager.get_or_create(server_name)
            if shared is not None:
                # Already cached — reuse
                all_tools.extend(shared.tools)
                continue

            # First caller for this server — create the real client.
            single_config: dict[str, Any] = {server_name: server_spec}
            try:
                real_client = _create_real_mcp_client(
                    single_config,
                    timeout=timeout,
                    on_tools_changed=on_tools_changed,
                )
            except Exception:
                _log.exception(
                    "Failed to create MCP client for shared server '%s'",
                    server_name,
                )
                continue

            shared = self._manager.cache_client(server_name, real_client)
            if (
                server_name == "lsp"
                and self._workspace_root is not None
                and not _init_lsp_server(shared, self._workspace_root)
            ):
                self._manager.discard_client(server_name, shared)
                continue
            elif server_name == "git" and self._workspace_root is not None:
                _init_git_server(shared, self._workspace_root)
            elif server_name == "serena" and self._workspace_root is not None:
                _probe_serena_binding(shared, self._workspace_root)
            all_tools.extend(shared.tools)

        return AggregateMCPClient(all_tools)

    @traces(SWR.SWR_3009)
    def for_persona(self, persona: PersonaConfig, config: RotarisConfig) -> Any:
        """A view of this provider serving only *persona*'s granted MCP tools.

        The same :class:`SessionMCPManager` and workspace root back the view, so
        one Serena process per session stays one process; only the tool list the
        SDK is handed differs per persona.
        """
        from rotaris_core.mcp.scoped_tool_provider import scope_tool_provider_for_persona

        return scope_tool_provider_for_persona(self, persona, config)


def _init_lsp_server(shared: Any, workspace_root: Path) -> bool:
    """Explicitly call ``lsp_init`` so lsp-mcp doesn't fall back to its
    persisted ``lastRoot`` (a stale/unrelated workspace) for auto-init.

    Reached only for a server a *user* named ``lsp``: SWR-2818 removed it from
    the defaults, because Serena answers the same questions already bound to the
    run's workspace. Keyed on the name rather than on the default entry, so
    configuring it back costs nothing.
    """
    init_tool = next((t for t in shared.tools if t.name.endswith("lsp_init")), None)
    if init_tool is None:
        return True
    try:
        shared.call_async_from_sync(
            shared.call_tool_mcp,
            init_tool.name,
            {"root": str(workspace_root)},
            timeout=_LSP_INIT_TIMEOUT_SECONDS,
        )
    except Exception:
        _log.exception("lsp_init call failed for workspace '%s'", workspace_root)
        return False

    return True


def _init_git_server(shared: Any, workspace_root: Path) -> None:
    """Set git-mcp's workspace before agents can invoke Git tools."""
    init_tool = next(
        (tool for tool in shared.tools if tool.name.endswith("git_set_working_dir")),
        None,
    )
    if init_tool is None:
        return
    try:
        shared.call_async_from_sync(
            shared.call_tool_mcp,
            init_tool.name,
            {"path": str(workspace_root)},
            timeout=_LSP_INIT_TIMEOUT_SECONDS,
        )
    except Exception:
        _log.exception(
            "git_set_working_dir call failed for workspace '%s'",
            workspace_root,
        )


@traces(SWR.SWR_2905)
def _probe_serena_binding(shared: Any, workspace_root: Path) -> bool:
    """Confirm Serena came up bound to *workspace_root*; report, do not repair.

    Serena is bound at launch by ``--project`` (SWR-2905), so there is nothing to
    activate here — but "bound" is an assumption until something project-scoped
    answers, and a silent mis-binding would have every agent in the run resolving
    symbols against the wrong tree. ``list_memories`` is the cheapest tool Serena
    refuses to serve without an active project, which is exactly the question.

    Unlike ``lsp_init``, a failure does **not** discard the client: Serena's
    symbolic tools stay useful even when its memory store does not answer, and
    dropping the server would cost the run its code intelligence to punish a
    probe. Returns whether the probe succeeded, for callers that want to log it.
    """
    probe_tool = next(
        (tool for tool in shared.tools if tool.name.endswith("list_memories")),
        None,
    )
    if probe_tool is None:
        # An older Serena, or a stub that does not serve memories. The binding is
        # still a launch argument; there is simply nothing here to confirm it.
        return True
    try:
        shared.call_async_from_sync(
            shared.call_tool_mcp,
            probe_tool.name,
            {},
            timeout=_LSP_INIT_TIMEOUT_SECONDS,
        )
    except Exception:
        _log.warning(
            "Serena did not answer a project-scoped call for workspace '%s'; "
            "its symbolic tools remain available but may not be bound to this project.",
            workspace_root,
            exc_info=True,
        )
        return False
    return True


def _create_real_mcp_client(
    single_config: dict[str, Any],
    *,
    timeout: float,
    on_tools_changed: Callable[[Sequence[MCPToolDefinition]], None] | None = None,
) -> MCPClient:
    """Create and connect a real ``MCPClient`` for a single server."""
    from openhands.sdk.mcp.utils import create_mcp_tools

    if on_tools_changed is None:
        return create_mcp_tools(single_config, timeout=timeout)
    return create_mcp_tools(
        single_config,
        timeout=timeout,
        on_tools_changed=on_tools_changed,
    )


class AggregateMCPClient:
    """Minimal ``MCPClient``-like object exposing a merged tool list.

    Only the ``tools`` property and iteration protocol are used by the SDK
    in the :meth:`_runtime_mcp_tools` path.  Individual
    :class:`MCPToolExecutor` instances know their own per-server
    :class:`SharedMCPClient`, so ``call_tool_mcp`` is never called on this
    aggregate.
    """

    def __init__(self, tools: list[MCPToolDefinition]) -> None:
        self._tools = tools

    @property
    def tools(self) -> list[MCPToolDefinition]:
        return list(self._tools)

    def sync_close(self) -> None:
        """No-op: per-server clients handle their own lifecycle."""

    @property
    def _closed(self) -> bool:
        return False

    def __iter__(self) -> Any:
        return iter(self._tools)

    def __len__(self) -> int:
        return len(self._tools)
