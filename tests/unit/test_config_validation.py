from __future__ import annotations

from pathlib import Path

from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
from rotaris_core.config.validation import validate_config
from rotaris_core.reqtocode import SWR, verifies


def make_config(**overrides: object) -> RotarisConfig:
    data: dict[str, object] = {
        "default_persona": "orchestrator",
        "default_summary_model": "gpt-4o-mini",
        "small_model": "gpt-4o-mini",
        "medium_model": "gpt-4o",
        "large_model": "gpt-4o",
        "fallback_model": "gpt-4o-mini",
        "personas": {
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                delegates_to=["tester"],
            ),
            "tester": PersonaConfig(name="tester", model="gpt-4o"),
        },
        "models": {
            "gpt-4o": ModelConfig(provider="openai", model_id="openai/gpt-4o"),
            "gpt-4o-mini": ModelConfig(provider="openai", model_id="openai/gpt-4o-mini"),
        },
        "mcp_servers": {},
        "workspace_root": Path("/workspace"),
    }
    data.update(overrides)
    return RotarisConfig.model_validate(data)


@verifies(SWR.SWR_309)
def test_validate_config_valid_returns_empty_list() -> None:
    config = make_config()

    assert validate_config(config) == []


@verifies(SWR.SWR_309)
def test_validate_config_persona_references_missing_model() -> None:
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="missing-model"),
        },
    )

    errors = validate_config(config)

    assert any("unknown model 'missing-model'" in error for error in errors)


@verifies(SWR.SWR_3008)
def test_mcp_tool_grant_for_an_uncarried_server_is_rejected() -> None:
    """Productive use: a user narrows a persona's MCP tools and gets told if it missed.

    Expected outcome: a grant naming a server the persona does not list in
    ``mcp_servers`` is a config error, not a silent no-op that reads like a
    working restriction.
    """
    from rotaris_core.config.schema import MCPServerConfig

    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                mcp_servers=["serena"],
                mcp_tools={"serena": ["find_symbol"], "git": ["git_status"]},
            ),
        },
        mcp_servers={
            "serena": MCPServerConfig(command="uvx"),
            "git": MCPServerConfig(command="npx"),
        },
    )

    errors = validate_config(config)

    assert any("does not list in mcp_servers" in error for error in errors)
    assert not any("'serena'" in error and "mcp_servers" in error for error in errors)


@verifies(SWR.SWR_309)
def test_validate_config_missing_default_persona() -> None:
    config = make_config(default_persona="missing")

    errors = validate_config(config)

    assert any(error == "Default persona 'missing' does not exist" for error in errors)


@verifies(SWR.SWR_304)
def test_validate_config_delegate_to_unknown_persona() -> None:
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                delegates_to=["missing"],
            ),
        },
    )

    errors = validate_config(config)

    assert any("delegates to unknown persona 'missing'" in error for error in errors)


@verifies(SWR.SWR_108)
def test_validate_config_detects_cycle() -> None:
    config = make_config(
        personas={
            "a": PersonaConfig(name="a", model="gpt-4o", delegates_to=["b"]),
            "b": PersonaConfig(name="b", model="gpt-4o", delegates_to=["a"]),
        },
        default_persona="a",
    )

    errors = validate_config(config)

    assert any(error == "Delegate cycle detected: a -> b -> a" for error in errors)


@verifies(SWR.SWR_108)
def test_validate_config_detects_self_delegation_cycle() -> None:
    config = make_config(
        personas={
            "a": PersonaConfig(name="a", model="gpt-4o", delegates_to=["a"]),
        },
        default_persona="a",
    )

    errors = validate_config(config)

    assert any(error == "Delegate cycle detected: a -> a" for error in errors)


@verifies(SWR.SWR_540, SWR.SWR_544)
def test_validate_config_duplicate_tool_names() -> None:
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                tools=["terminal"],
                custom_tools=["terminal"],
            ),
        },
    )

    errors = validate_config(config)

    assert any("duplicate tool 'terminal'" in error for error in errors)


@verifies(SWR.SWR_540)
def test_validate_config_rejects_unknown_tool_name() -> None:
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                tools=["typo_tool"],
            ),
        },
    )

    errors = validate_config(config)

    assert any("unknown tool 'typo_tool'" in error for error in errors)


@verifies(SWR.SWR_540)
def test_validate_config_rejects_internal_tool_name() -> None:
    """Internal-only tools like 'file_viewer' must not be usable via YAML."""
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                tools=["file_viewer"],
            ),
        },
    )

    errors = validate_config(config)

    assert any("unknown tool 'file_viewer'" in error for error in errors)


@verifies(SWR.SWR_540)
def test_validate_config_accepts_all_public_tools() -> None:
    from rotaris_core.agents.factory import ALLOWED_PUBLIC_TOOL_NAMES

    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                tools=sorted(ALLOWED_PUBLIC_TOOL_NAMES - {"delegate"}),
            ),
        },
    )

    errors = validate_config(config)

    assert not any("unknown tool" in error for error in errors)


@verifies(SWR.SWR_541)
def test_validate_config_accepts_mcp_server_as_tool() -> None:
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                tools=["playwright"],
            ),
        },
        mcp_servers={"playwright": {"command": "playwright-mcp"}},
    )

    errors = validate_config(config)

    assert not any("unknown tool 'playwright'" in error for error in errors)


@verifies(SWR.SWR_316)
def test_validate_config_valid_complex_cross_references() -> None:
    config = make_config(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                summary_model="gpt-4o-mini",
                delegates_to=["coding-agent", "tester"],
                mcp_servers=["playwright"],
            ),
            "coding-agent": PersonaConfig(
                name="coding-agent",
                model="gpt-4o",
                summary_model="gpt-4o-mini",
                delegates_to=["tester"],
                tools=["terminal"],
                custom_tools=["git_commit"],
                mcp_servers=["filesystem"],
            ),
            "tester": PersonaConfig(name="tester", model="gpt-4o"),
        },
        mcp_servers={
            "playwright": {"command": "playwright-mcp"},
            "filesystem": {"command": "filesystem-mcp"},
        },
    )

    assert validate_config(config) == []
