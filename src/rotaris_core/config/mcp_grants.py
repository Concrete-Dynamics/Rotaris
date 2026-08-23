"""Per-persona MCP tool grants — the one place the rule is written down.

A persona names MCP *servers* (``mcp_servers``); ``PersonaConfig.mcp_tools`` narrows
that to the tools of each server it may actually call (SWR-3008). Two consumers ask
the same question about the same persona and must never disagree: the prompt
renderer, which describes the tools, and the tool provider, which creates them
(SWR-3009). Both go through :func:`resolve_mcp_tool_grants` and
:func:`tool_is_granted` so there is exactly one answer.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable

    from rotaris_core.config.schema import MCPServerConfig, PersonaConfig, RotarisConfig

_log = logging.getLogger(__name__)

#: server name → allowed original tool names, or ``None`` for "the whole server".
#: ``None`` is not the same as an empty set: it is the pre-grant behaviour every
#: configuration written before SWR-3008 relies on.
GrantMap = dict[str, "frozenset[str] | None"]

_logged_unknown_grants: set[tuple[str, str]] = set()


@traces(SWR.SWR_3009)
def resolve_mcp_tool_grants(persona: PersonaConfig, config: RotarisConfig) -> GrantMap:
    """Return this persona's MCP tool grant per server it is configured with.

    Only servers the persona actually names are present. A server the persona
    names without a grant entry maps to ``None`` — the whole surface.
    """
    declared = persona.mcp_tools or {}
    grants: GrantMap = {}
    for server_name in persona.mcp_servers:
        if server_name not in config.mcp_servers:
            continue
        allowed = declared.get(server_name)
        grants[server_name] = None if allowed is None else frozenset(allowed)
    return grants


@traces(SWR.SWR_3009)
def tool_is_granted(
    server_name: str,
    tool_name: str,
    grants: GrantMap,
    server_cfg: MCPServerConfig | None = None,
) -> bool:
    """Whether *tool_name*, as the server reports it, may be handed to the model.

    A denial wins over a grant: the server's ``disabled_tools`` is checked first,
    which is what finally gives that field runtime force rather than leaving it a
    prompt-only courtesy (SWR-3009).
    """
    candidates = _candidate_tool_names(server_name, tool_name)
    if server_cfg is not None and candidates & set(server_cfg.disabled_tools):
        return False
    allowed = grants.get(server_name, None)
    if allowed is None:
        return True
    return bool(candidates & allowed)


@traces(SWR.SWR_3009)
def granted_tool_names(
    server_name: str,
    discovered: Iterable[str],
    grants: GrantMap,
    server_cfg: MCPServerConfig | None = None,
) -> list[str]:
    """Filter *discovered* server tool names down to the granted ones, in order."""
    return [name for name in discovered if tool_is_granted(server_name, name, grants, server_cfg)]


@traces(SWR.SWR_3009)
def warn_once_about_unknown_grants(
    server_name: str,
    discovered: Iterable[str],
    grants: GrantMap,
) -> None:
    """Log, once per process, grant entries the running server does not ship.

    Never an error: a server version is not a contract, and a run must not fail
    because a pinned build renamed a tool a grant list still mentions.
    """
    allowed = grants.get(server_name)
    if not allowed:
        return
    unknown = sorted(allowed - set(discovered))
    for name in unknown:
        key = (server_name, name)
        if key in _logged_unknown_grants:
            continue
        _logged_unknown_grants.add(key)
        _log.info(
            "MCP server '%s' does not ship a tool named '%s'; the grant entry has no effect.",
            server_name,
            name,
        )


def _candidate_tool_names(server_name: str, tool_name: str) -> set[str]:
    """Every spelling of *tool_name* a grant list could reasonably have used.

    Rotaris' shared provider connects one client per server, so names arrive
    exactly as the server reports them — but the SDK's default provider puts all
    servers in one FastMCP config, which prefixes them with the server name, and
    grants are written against the unprefixed names.

    The unprefixed candidate is *added*, never substituted: a server may already
    report tool names carrying the same prefix as its configured name, and stripping
    that prefix outright could produce a name no grant or ``disabled_tools`` entry
    mentions.
    """
    candidates = {tool_name}
    for prefix in (f"{server_name}_", f"mcp-{server_name}-", f"mcp__{server_name}__"):
        if tool_name.startswith(prefix):
            candidates.add(tool_name[len(prefix) :])
    return candidates
