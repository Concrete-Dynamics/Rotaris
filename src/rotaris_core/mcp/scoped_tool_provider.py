"""Persona-scoped MCP tool provider — where a grant becomes a fact.

``PersonaConfig.mcp_tools`` says which MCP tools a persona may call (SWR-3008).
This is the seam that makes that true rather than advertised: it wraps any
:class:`MCPToolProvider` and returns only the granted tools, so an ungranted tool
is never in the list the SDK hands to the model (SWR-3009).

It calls the wrapped provider **once per server**, which is what makes the filter
honest: the SDK's aggregate tool list carries no server attribution, and guessing
it from tool names would let one server's open grant leak another's withheld tool.
Rotaris' own :class:`~rotaris_core.mcp.shared_tool_provider.SharedMCPToolProvider`
already works this way and caches per server, so scoping costs no extra process.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.config.mcp_grants import (
    resolve_mcp_tool_grants,
    tool_is_granted,
    warn_once_about_unknown_grants,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from openhands.sdk.mcp.config import MCPServer as SDKMCPServer
    from openhands.sdk.mcp.tool import MCPToolDefinition

    from rotaris_core.config.mcp_grants import GrantMap
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig

_log = logging.getLogger(__name__)


@traces(SWR.SWR_3009)
class ScopedMCPToolProvider:
    """An :class:`MCPToolProvider` that yields one persona's granted tools only."""

    def __init__(
        self,
        inner: Any,
        grants: GrantMap,
        server_configs: dict[str, Any] | None = None,
        *,
        persona_name: str = "",
    ) -> None:
        self._inner = inner
        self._grants = grants
        self._server_configs = server_configs or {}
        self._persona_name = persona_name

    def create_tools(
        self,
        mcp_config: dict[str, SDKMCPServer],
        timeout: float = 30.0,
        *,
        on_tools_changed: Callable[[Sequence[MCPToolDefinition]], None] | None = None,
    ) -> Any:
        from rotaris_core.mcp.shared_tool_provider import AggregateMCPClient

        granted: list[MCPToolDefinition] = []
        for server_name, server_spec in mcp_config.items():
            server_cfg = self._server_configs.get(server_name)
            client = self._inner.create_tools(
                {server_name: server_spec},
                timeout,
                on_tools_changed=self._scoped_tools_changed(
                    server_name,
                    server_cfg,
                    on_tools_changed,
                ),
            )
            tools = list(client.tools)
            warn_once_about_unknown_grants(
                server_name,
                (tool.name for tool in tools),
                self._grants,
            )
            kept = [
                tool
                for tool in tools
                if tool_is_granted(server_name, tool.name, self._grants, server_cfg)
            ]
            if len(kept) < len(tools):
                _log.debug(
                    "Persona '%s' is granted %d of %d '%s' tools.",
                    self._persona_name or "?",
                    len(kept),
                    len(tools),
                    server_name,
                )
            granted.extend(kept)

        return AggregateMCPClient(granted)

    def _scoped_tools_changed(
        self,
        server_name: str,
        server_cfg: Any,
        callback: Callable[[Sequence[MCPToolDefinition]], None] | None,
    ) -> Callable[[Sequence[MCPToolDefinition]], None] | None:
        """Apply the grant to tools a server discloses later, too.

        A progressive-disclosure server can push new tools after connect; without
        this they would reach the agent unfiltered and undo the grant mid-run.
        """
        if callback is None:
            return None

        def _filtered(tools: Sequence[MCPToolDefinition]) -> None:
            kept = [
                tool
                for tool in tools
                if tool_is_granted(server_name, tool.name, self._grants, server_cfg)
            ]
            if kept:
                callback(kept)

        return _filtered


@traces(SWR.SWR_3009)
def scope_tool_provider_for_persona(
    provider: Any | None,
    persona: PersonaConfig | None,
    config: RotarisConfig,
) -> Any | None:
    """Wrap *provider* so it serves only *persona*'s granted MCP tools.

    Returns the provider unchanged when the persona is unknown or grants nothing
    to narrow — the caller then gets exactly today's behaviour. When there is no
    provider but there are grants, the SDK's default provider is wrapped, so a
    host that never built a session-scoped one is still held to the grant.
    """
    if persona is None:
        return provider

    grants = resolve_mcp_tool_grants(persona, config)
    server_configs = {
        name: config.mcp_servers[name] for name in grants if name in config.mcp_servers
    }
    needs_scoping = any(allowed is not None for allowed in grants.values()) or any(
        cfg.disabled_tools for cfg in server_configs.values()
    )
    if not needs_scoping:
        return provider

    inner = provider
    if inner is None:
        from openhands.sdk.mcp.utils import DefaultMCPToolProvider

        inner = DefaultMCPToolProvider()

    return ScopedMCPToolProvider(
        inner,
        grants,
        server_configs,
        persona_name=persona.name,
    )
