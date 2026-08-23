"""Unit tests for the per-persona MCP tool grant resolver.

The resolver is the single answer two consumers rely on — the prompt renderer that
*describes* MCP tools and the provider that *creates* them (SWR-3009). Everything
here is about the rules that answer has to obey: an absent grant is not an empty
one, a server's own denial outranks a persona's grant, a grant entry the running
server does not ship must not break anything, and a client-prefixed tool name is
still the same tool.
"""

from __future__ import annotations

import logging

from rotaris_core.config.mcp_grants import (
    granted_tool_names,
    resolve_mcp_tool_grants,
    tool_is_granted,
    warn_once_about_unknown_grants,
)
from rotaris_core.config.schema import MCPServerConfig, PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies


def _config(**servers: MCPServerConfig) -> RotarisConfig:
    return RotarisConfig(mcp_servers=dict(servers) or {"serena": MCPServerConfig(command="uvx")})


def _persona(**kwargs: object) -> PersonaConfig:
    base: dict[str, object] = {"name": "analyst", "model": "small_model"}
    base.update(kwargs)
    return PersonaConfig(**base)  # type: ignore[arg-type]


@verifies(SWR.SWR_3009)
def test_a_persona_without_a_grant_keeps_the_whole_server() -> None:
    """Productive use: an agents.yaml written before grants existed keeps working.

    Expected outcome: the server resolves to ``None`` — "everything" — so no tool
    the persona could call yesterday disappears today.
    """
    config = _config(serena=MCPServerConfig(command="uvx"))
    persona = _persona(mcp_servers=["serena"])

    grants = resolve_mcp_tool_grants(persona, config)

    assert grants == {"serena": None}
    assert tool_is_granted("serena", "replace_symbol_body", grants) is True


@verifies(SWR.SWR_3009)
def test_a_grant_withholds_every_tool_it_does_not_name() -> None:
    config = _config(serena=MCPServerConfig(command="uvx"))
    persona = _persona(mcp_servers=["serena"], mcp_tools={"serena": ["find_symbol"]})

    grants = resolve_mcp_tool_grants(persona, config)

    assert tool_is_granted("serena", "find_symbol", grants) is True
    assert tool_is_granted("serena", "replace_symbol_body", grants) is False


@verifies(SWR.SWR_3009)
def test_a_grant_for_one_server_does_not_reach_another() -> None:
    """Productive use: a persona carries both a reference server and Serena.

    Expected outcome: the reference server's open grant does not smuggle in a Serena tool that
    Serena's own grant withheld.
    """
    config = _config(
        serena=MCPServerConfig(command="uvx"),
        reference=MCPServerConfig(command="npx"),
    )
    persona = _persona(
        mcp_servers=["serena", "reference"],
        mcp_tools={"serena": ["find_symbol"]},
    )

    grants = resolve_mcp_tool_grants(persona, config)

    assert grants["reference"] is None
    assert tool_is_granted("reference", "reference_read", grants) is True
    assert tool_is_granted("serena", "rename_symbol", grants) is False


@verifies(SWR.SWR_3009)
def test_disabled_tools_deny_a_name_the_grant_allows() -> None:
    """Productive use: `disabled_tools` finally means the model cannot call it.

    Expected outcome: the server's denial wins over the persona's grant, so the
    server's restricted list is enforced by the runtime.
    """
    server = MCPServerConfig(command="npx", disabled_tools=["reference_admin"])
    config = _config(reference=server)
    persona = _persona(
        mcp_servers=["reference"],
        mcp_tools={"reference": ["reference_read", "reference_admin"]},
    )

    grants = resolve_mcp_tool_grants(persona, config)

    assert tool_is_granted("reference", "reference_read", grants, server) is True
    assert tool_is_granted("reference", "reference_admin", grants, server) is False


@verifies(SWR.SWR_3009)
def test_disabled_tools_deny_even_without_a_persona_grant() -> None:
    server = MCPServerConfig(command="npx", disabled_tools=["reference_admin"])
    config = _config(reference=server)
    persona = _persona(mcp_servers=["reference"])

    grants = resolve_mcp_tool_grants(persona, config)

    assert tool_is_granted("reference", "reference_admin", grants, server) is False
    assert tool_is_granted("reference", "reference_read", grants, server) is True


@verifies(SWR.SWR_3009)
def test_a_client_prefixed_tool_name_matches_its_unprefixed_grant() -> None:
    """Productive use: the SDK's default provider prefixes names per server.

    Expected outcome: a grant written against the names Serena itself reports
    still matches, rather than silently withholding every tool.
    """
    config = _config(serena=MCPServerConfig(command="uvx"))
    persona = _persona(mcp_servers=["serena"], mcp_tools={"serena": ["find_symbol"]})

    grants = resolve_mcp_tool_grants(persona, config)

    assert tool_is_granted("serena", "serena_find_symbol", grants) is True
    assert tool_is_granted("serena", "mcp-serena-find_symbol", grants) is True
    assert tool_is_granted("serena", "serena_rename_symbol", grants) is False


@verifies(SWR.SWR_3009)
def test_a_grant_entry_the_server_does_not_ship_is_inert(caplog) -> None:
    """Productive use: a Serena release renames a tool a grant list still mentions.

    Expected outcome: the run continues with the tools that do exist, and the
    stale entry is reported once at INFO rather than failing anything.
    """
    config = _config(serena=MCPServerConfig(command="uvx"))
    persona = _persona(
        mcp_servers=["serena"],
        mcp_tools={"serena": ["find_symbol", "a_tool_from_a_future_release"]},
    )
    grants = resolve_mcp_tool_grants(persona, config)
    discovered = ["find_symbol", "rename_symbol"]

    with caplog.at_level(logging.INFO, logger="rotaris_core.config.mcp_grants"):
        warn_once_about_unknown_grants("serena", discovered, grants)

    assert granted_tool_names("serena", discovered, grants) == ["find_symbol"]
    assert "a_tool_from_a_future_release" in caplog.text


@verifies(SWR.SWR_3009)
def test_a_server_the_persona_does_not_carry_is_absent_from_the_grants() -> None:
    config = _config(serena=MCPServerConfig(command="uvx"))
    persona = _persona(mcp_servers=["serena", "not_configured_anywhere"])

    grants = resolve_mcp_tool_grants(persona, config)

    assert set(grants) == {"serena"}
