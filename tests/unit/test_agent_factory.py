from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

from openhands.sdk import Agent
from openhands.sdk.llm.llm import LLM

from rotaris_core.agents import factory
from rotaris_core.agents.agents_md_loader import clear_agents_md_cache
from rotaris_core.agents.factory import TOOL_NAME_MAP, create_agent_for_persona, load_system_prompt
from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.config.schema import (
    MCPServerConfig,
    MCPToolInfo,
    ModelConfig,
    PersonaConfig,
    RotarisConfig,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.mcp_toggles import MCPToggleStore


@verifies(SWR.SWR_553)
def test_load_system_prompt_returns_inline_prompt() -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o", system_prompt="inline prompt")

    assert load_system_prompt(persona) == "inline prompt"


@verifies(SWR.SWR_553)
def test_load_system_prompt_loads_prompt_file() -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o", system_prompt_file="tester.md")

    assert "persona for Rotaris" in load_system_prompt(persona)


@verifies(SWR.SWR_553)
def test_load_system_prompt_returns_empty_when_not_configured() -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o")

    assert load_system_prompt(persona) == ""


@verifies(SWR.SWR_553)
def test_load_system_prompt_supports_defaults_relative_path() -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o", system_prompt_file="prompts/tester.md")

    assert "persona for Rotaris" in load_system_prompt(persona)


@verifies(SWR.SWR_325)
def test_default_personas_with_mcp_servers_include_mcp_placeholder() -> None:
    for persona in DEFAULT_PERSONAS.values():
        if not persona.mcp_servers:
            continue

        prompt = load_system_prompt(persona)
        assert "[[ROTARIS:MCP_SECTION]]" in prompt, (
            f"{persona.name} prompt must render MCP servers when mcp_servers are configured"
        )


@verifies(SWR.SWR_2416)
def test_orchestrator_prompt_uses_playbook_placeholder() -> None:
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt_file="prompts/orchestrator.md",
    )

    prompt = load_system_prompt(persona)

    assert "Phase 0: Intent Classification" not in prompt
    assert "# Intent Classification Gate" not in prompt
    assert "[[ROTARIS:PLAYBOOK]]" in prompt


@verifies(SWR.SWR_641, SWR.SWR_643)
def test_orchestrator_prompt_forbids_plan_only_completion_for_exploration() -> None:
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt_file="prompts/orchestrator.md",
    )

    prompt = load_system_prompt(persona)

    assert "Plan-only responses" in prompt
    assert "Final responses must describe completed work, not merely announced intent." in prompt


@verifies(SWR.SWR_344)
def test_librarian_prompt_uses_single_visible_reply_wording() -> None:
    persona = PersonaConfig(
        name="librarian",
        model="gpt-4o",
        system_prompt_file="prompts/librarian.md",
    )

    prompt = load_system_prompt(persona)

    assert "External Reference Specialist" in prompt
    assert "put only the final report in the final response" not in prompt


@verifies(SWR.SWR_115, SWR.SWR_660)
def test_create_agent_for_persona_returns_callable() -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o")
    config = RotarisConfig(personas={persona.name: persona})

    agent_factory = create_agent_for_persona(persona, config)

    assert callable(agent_factory)


@verifies(SWR.SWR_329)
def test_factory_passes_context_condenser_to_agent() -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o", tools=["fetch"])
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")
    condenser = object()

    with (
        patch("rotaris_core.agents.factory.Agent") as mock_agent_cls,
        patch("rotaris_core.agents.compressor.build_context_condenser", return_value=condenser),
    ):
        create_agent_for_persona(persona, config)(llm)

    assert mock_agent_cls.call_args is not None
    assert mock_agent_cls.call_args.kwargs["condenser"] is condenser


@verifies(SWR.SWR_329)
def test_factory_builds_agent_with_distinct_main_and_condenser_usage_ids() -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o", tools=["fetch"])
    config = RotarisConfig(
        personas={persona.name: persona},
        models={
            "gpt-4o-mini": ModelConfig(provider="openai", model_id="gpt-4o-mini"),
        },
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test", usage_id="agent-main")

    agent = create_agent_for_persona(persona, config)(llm)

    assert agent.condenser is not None
    assert agent.condenser.llm.usage_id.startswith("condenser-gpt-4o-mini-gpt-4o-")
    assert agent.condenser.llm.usage_id != agent.llm.usage_id


@verifies(SWR.SWR_634, SWR.SWR_663)
def test_factory_returns_agent_with_mapped_tools() -> None:
    persona = PersonaConfig(
        name="coding-agent",
        model="gpt-4o",
        system_prompt="backend prompt",
        tools=[
            "read_file",
            "write_file",
            "terminal",
            "git_commit",
            "todo",
            "fetch",
        ],
    )
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert isinstance(agent, Agent)
    assert agent.llm is llm
    assert [tool.name for tool in agent.tools] == [
        "read_file",
        "write_file",
        "terminal",
        "git_commit",
        "todo",
        "fetch",
    ]
    assert agent.agent_context is not None


@verifies(SWR.SWR_450)
def test_factory_injects_workspace_agents_md_skill(tmp_path: Path) -> None:
    clear_agents_md_cache()
    (tmp_path / ".git").mkdir()
    (tmp_path / "AGENTS.md").write_text("workspace instructions\n", encoding="utf-8")

    persona = PersonaConfig(name="tester", model="gpt-4o")
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_path)
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert agent.agent_context is not None
    skills_by_name = {skill.name: skill for skill in agent.agent_context.skills}
    # No skills exist under this workspace, and user-scope roots are isolated,
    # so AGENTS.md is the only thing that can reach the agent's context here.
    assert set(skills_by_name) == {"workspace_agents_context"}
    workspace_skill = skills_by_name["workspace_agents_context"]
    assert workspace_skill.trigger is None
    assert "workspace instructions" in workspace_skill.content


@verifies(SWR.SWR_450, SWR.SWR_455)
def test_factory_skips_workspace_agents_md_skill_when_disabled(tmp_path: Path) -> None:
    clear_agents_md_cache()
    (tmp_path / ".git").mkdir()
    (tmp_path / "AGENTS.md").write_text("workspace instructions\n", encoding="utf-8")

    persona = PersonaConfig(name="tester", model="gpt-4o")
    config = RotarisConfig(
        personas={persona.name: persona},
        workspace_root=tmp_path,
        inject_agents_md=False,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert agent.agent_context is not None
    # AGENTS.md exists in the workspace but injection is off, so nothing is left
    # to inject: the catalog is empty and no persona memory is configured.
    assert [skill.name for skill in agent.agent_context.skills] == []


@verifies(SWR.SWR_346)
def test_coordinator_only_persona_strips_non_orchestration_tools() -> None:
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt="coord prompt",
        tools=["delegate", "todo", "haet_read", "terminal", "fetch"],
        coordinator_only=True,
    )
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert [tool.name for tool in agent.tools] == ["todo", "haet_read", "fetch"]


@verifies(SWR.SWR_342, SWR.SWR_343)
def test_coordinator_only_persona_keeps_delegate_support_with_runtime_context() -> None:
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt="coord prompt",
        tools=["delegate", "todo", "haet_read"],
        coordinator_only=True,
    )
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    runtime_kwargs = {
        "child_manager": object(),
        "scheduler": object(),
        "agent_factory": lambda persona_name, runtime_kwargs=None: None,
    }

    agent = create_agent_for_persona(persona, config, runtime_kwargs=runtime_kwargs)(llm)

    assert [tool.name for tool in agent.tools] == [
        "delegate",
        "background_output",
        "wait_for_tasks",
        "todo",
        "haet_read",
    ]
    assert agent.system_prompt_kwargs.get("persona_prompt") == "coord prompt"
    assert agent.include_default_tools == []


@verifies(SWR.SWR_501, SWR.SWR_553)
def test_orchestrator_receives_runtime_playbook() -> None:
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt="start\n[[ROTARIS:PLAYBOOK]]\nend",
        tools=[],
        coordinator_only=True,
    )
    config = RotarisConfig(default_persona="orchestrator", personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(
        persona,
        config,
        runtime_kwargs={"intent": "small_feature"},
    )(llm)

    rendered = agent.system_prompt_kwargs.get("persona_prompt") or ""
    assert "[[ROTARIS:PLAYBOOK]]" not in rendered
    assert "## Active Playbook" in rendered
    assert rendered.startswith("start\n")
    assert rendered.endswith("\nend")


@verifies(SWR.SWR_2425)
def test_planner_cell_is_sized_for_the_configured_coding_agent() -> None:
    """The planner's task sizing follows the executor's tier, its autonomy its own."""
    planner = PersonaConfig(name="planner", model="large_model")
    coder = PersonaConfig(name="coding-agent", model="small_model")
    config = RotarisConfig(
        default_persona="orchestrator",
        personas={
            "orchestrator": PersonaConfig(name="orchestrator", model="large_model"),
            planner.name: planner,
            coder.name: coder,
        },
    )

    cell = factory.resolve_playbook_for_persona("planner", config, "moderate_feature")

    assert cell is not None
    assert cell.tier == "large_model"
    assert cell.consumer_source == "coding-agent"
    assert cell.consumer_tier == "small_model"
    assert cell.variants["CHUNKING"] == "micro-slice"
    assert cell.variants["OUTPUT"] == "strict-schema"
    assert cell.variants["AUTONOMY"] == "full"


@verifies(SWR.SWR_2425)
def test_planner_cell_is_unchanged_when_the_coding_agent_is_large() -> None:
    personas = {
        "orchestrator": PersonaConfig(name="orchestrator", model="large_model"),
        "planner": PersonaConfig(name="planner", model="large_model"),
        "coding-agent": PersonaConfig(name="coding-agent", model="large_model"),
    }
    config = RotarisConfig(default_persona="orchestrator", personas=personas)

    cell = factory.resolve_playbook_for_persona("planner", config, "moderate_feature")

    assert cell is not None
    assert cell.consumer_tier == ""
    assert cell.variants["CHUNKING"] == "whole-feature"
    assert cell.variants["OUTPUT"] == "structured"


@verifies(SWR.SWR_2425)
def test_planner_cell_follows_the_owner_persona_for_refactor_intents() -> None:
    """`refactor` is owned by `refactorer`, so that is the planner's consumer."""
    personas = {
        "orchestrator": PersonaConfig(name="orchestrator", model="large_model"),
        "planner": PersonaConfig(name="planner", model="large_model"),
        "coding-agent": PersonaConfig(name="coding-agent", model="large_model"),
        "refactorer": PersonaConfig(name="refactorer", model="small_model"),
    }
    config = RotarisConfig(default_persona="orchestrator", personas=personas)

    cell = factory.resolve_playbook_for_persona("planner", config, "refactor")

    assert cell is not None
    assert cell.consumer_source == "refactorer"
    assert cell.consumer_tier == "small_model"
    assert cell.variants["CHUNKING"] == "micro-slice"


@verifies(SWR.SWR_347, SWR.SWR_501)
def test_intent_tools_grant_write_access_for_explicit_trivial() -> None:
    """When intent_tools includes write_file, the coordinator persona gets it in its tools."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt="coord prompt",
        tools=["todo", "read_file", "write_file"],
        coordinator_only=True,
    )
    config = RotarisConfig(
        default_persona="orchestrator",
        personas={persona.name: persona},
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(
        persona,
        config,
        runtime_kwargs={"intent_tools": ["todo", "read_file", "write_file"]},
    )(llm)

    tool_names = [t.name for t in agent.tools]
    assert "write_file" in tool_names
    assert "read_file" in tool_names


@verifies(SWR.SWR_347)
def test_intent_tools_absent_falls_back_to_coordinator_only() -> None:
    """When runtime_kwargs has no intent_tools, coordinator_only strips write tools
    but keeps read_file (coordinator tool)."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt="coord prompt",
        tools=["todo", "haet_read", "read_file", "write_file"],
        coordinator_only=True,
    )
    config = RotarisConfig(
        default_persona="orchestrator",
        personas={persona.name: persona},
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(
        persona,
        config,
        runtime_kwargs={"intent": "small_feature"},
    )(llm)

    tool_names = [t.name for t in agent.tools]
    assert "write_file" not in tool_names
    assert "read_file" in tool_names  # read_file is a coordinator tool
    assert "todo" in tool_names


@verifies(SWR.SWR_347)
def test_intent_tools_only_applied_to_default_persona() -> None:
    """intent_tools in runtime_kwargs does NOT affect non-default personas."""
    persona = PersonaConfig(
        name="coding-agent",
        model="gpt-4o",
        system_prompt="coder prompt",
        tools=["todo", "haet_read"],
        coordinator_only=True,
    )
    config = RotarisConfig(
        default_persona="orchestrator",  # coding-agent is NOT the default
        personas={persona.name: persona},
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    # coordinator_only=True with no default persona override → write tools stripped
    agent = create_agent_for_persona(
        persona,
        config,
        runtime_kwargs={"intent_tools": ["todo", "haet_read", "write_file"]},
    )(llm)

    tool_names = [t.name for t in agent.tools]
    assert "write_file" not in tool_names
    # coordinator_only still in effect for this non-default persona
    assert "haet_read" in tool_names


@verifies(SWR.SWR_1706, SWR.SWR_1708)
def test_factory_attaches_persona_mcp_servers(tmp_path: Path) -> None:
    persona = PersonaConfig(
        name="tester",
        model="gpt-4o",
        tools=["terminal"],
        mcp_servers=["filesystem", "playwright"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "filesystem": MCPServerConfig(
                command="npx",
                args=["@modelcontextprotocol/server-filesystem", str(tmp_path)],
            ),
            "playwright": MCPServerConfig(command="npx", args=["@playwright/mcp", "--headless"]),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert [tool.name for tool in agent.tools] == ["terminal"]
    assert set(agent.mcp_config) == {"filesystem", "playwright"}
    filesystem = agent.mcp_config["filesystem"]
    assert filesystem.transport == "stdio"
    assert filesystem.command == "npx"
    assert filesystem.args == ["@modelcontextprotocol/server-filesystem", str(tmp_path)]
    assert filesystem.env == {}
    assert filesystem.cwd == str(tmp_path)
    playwright = agent.mcp_config["playwright"]
    assert playwright.transport == "stdio"
    assert playwright.command == "npx"
    assert playwright.args == ["@playwright/mcp", "--headless"]
    assert playwright.env == {}
    assert playwright.cwd == str(tmp_path)


@verifies(SWR.SWR_726)
def test_resolve_mcp_config_no_longer_injects_tools_key(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """_normalize_mcp_server_config no longer adds a ``tools`` key.

    SDK v1.34+ MCPServer model uses ``extra='forbid'`` and rejects unexpected
    keys.  The ``disabled_tools`` / ``tool_name_map`` are still applied at the
    prompt-rendering layer via ``list_mcp_server_tools()``.
    """
    from rotaris_core.agents.factory import _resolve_mcp_config

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: "/usr/bin/npx")

    persona = PersonaConfig(
        name="tester",
        model="gpt-4o",
        mcp_servers=["lsp"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "lsp": MCPServerConfig(
                command="npx",
                args=["-y", "@theupsider/lsp-mcp@latest"],
                disabled_tools=["lsp_hover", "lsp_completion"],
            ),
        },
        workspace_root=tmp_path,
    )

    result, _warnings = _resolve_mcp_config(persona, config)

    # The server config is present …
    assert "lsp" in result
    assert result["lsp"]["transport"] == "stdio"
    # … but the FastMCP ``tools`` transforms key must NOT be injected (SDK rejects it).
    assert "tools" not in result["lsp"]


@verifies(SWR.SWR_1715)
def test_default_tavily_mcp_uses_http_transport(tmp_path: Path, monkeypatch) -> None:
    from rotaris_core.agents.factory import _resolve_mcp_config
    from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS

    persona = PersonaConfig(
        name="worker",
        model="gpt-4o",
        mcp_servers=["tavily"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={"tavily": DEFAULT_MCP_SERVERS["tavily"]},
        workspace_root=tmp_path,
    )

    result, _warnings = _resolve_mcp_config(persona, config)

    assert result == {
        "tavily": {
            "transport": "streamable-http",
            "url": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}",
            "timeout": 600.0,
        },
    }


@verifies(SWR.SWR_507)
def test_default_playwright_mcp_uses_npx_package_runner(tmp_path: Path, monkeypatch) -> None:
    from rotaris_core.agents.factory import _resolve_mcp_config
    from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS

    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda cmd: "/usr/bin/npx" if cmd == "npx" else None,
    )

    persona = PersonaConfig(
        name="tester",
        model="gpt-4o",
        mcp_servers=["playwright"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={"playwright": DEFAULT_MCP_SERVERS["playwright"]},
        workspace_root=tmp_path,
    )

    result, _warnings = _resolve_mcp_config(persona, config)

    assert result == {
        "playwright": {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@playwright/mcp@latest", "--headless"],
            "env": {},
            "cwd": str(tmp_path),
        },
    }


@verifies(SWR.SWR_1710)
def test_factory_treats_legacy_mcp_tool_names_as_mcp_servers(tmp_path: Path) -> None:
    persona = PersonaConfig(
        name="docs-writer",
        model="gpt-4o",
        tools=["filesystem", "fetch"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "filesystem": MCPServerConfig(
                command="npx",
                args=["@modelcontextprotocol/server-filesystem", str(tmp_path)],
            ),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert [tool.name for tool in agent.tools] == ["fetch"]
    assert set(agent.mcp_config) == {"filesystem"}
    filesystem = agent.mcp_config["filesystem"]
    assert filesystem.transport == "stdio"
    assert filesystem.command == "npx"
    assert filesystem.args == ["@modelcontextprotocol/server-filesystem", str(tmp_path)]
    assert filesystem.env == {}
    assert filesystem.cwd == str(tmp_path)


@verifies(SWR.SWR_1714)
def test_render_prompt_uses_runtime_mcp_tool_descriptions(
    tmp_path: Path,
    monkeypatch,
) -> None:
    from rotaris_core.agents.factory import _render_prompt

    def fake_runtime_mcp_tools(
        server_name: str,
        config: RotarisConfig,
        grants: object = None,
    ) -> list[MCPToolInfo]:
        assert server_name == "lsp"
        assert "lsp" in config.mcp_servers
        return [MCPToolInfo(name="runtime_definition", description="from running server")]

    monkeypatch.setattr(
        "rotaris_core.agents.factory._runtime_mcp_tools",
        fake_runtime_mcp_tools,
    )

    persona = PersonaConfig(
        name="tester",
        model="gpt-4o",
        mcp_servers=["lsp"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "lsp": MCPServerConfig(
                command="npx",
                tools=[
                    {"name": "stale_config_tool", "description": "from config"},
                ],
            ),
        },
        workspace_root=tmp_path,
    )

    prompt = _render_prompt("[[ROTARIS:MCP_SECTION]]", persona, config)

    assert "runtime_definition" in prompt
    assert "from running server" in prompt
    assert "stale_config_tool" not in prompt


@verifies(SWR.SWR_3009)
def test_the_prompt_lists_exactly_the_mcp_tools_the_persona_is_granted(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Productive use: an agent's prompt is a promise about what it can call.

    Expected outcome: a persona granted only Serena's lookups reads a prompt that
    names those and not the editing tools — the same resolver decides both, so a
    prompt cannot advertise a tool the runtime withholds.
    """
    from rotaris_core.agents.factory import _render_prompt

    monkeypatch.setattr(
        "rotaris_core.config.mcp_tool_discovery.list_mcp_server_tools",
        lambda *_args, **_kwargs: [
            MCPToolInfo(name="find_symbol", description="look a symbol up"),
            MCPToolInfo(name="replace_symbol_body", description="rewrite a symbol"),
        ],
    )
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: "/usr/bin/uvx")

    persona = PersonaConfig(
        name="codebase-analyst",
        model="gpt-4o",
        system_prompt="[[ROTARIS:MCP_SECTION]]",
        mcp_servers=["serena"],
        mcp_tools={"serena": ["find_symbol"]},
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={"serena": MCPServerConfig(command="uvx")},
        workspace_root=tmp_path,
    )

    prompt = _render_prompt("[[ROTARIS:MCP_SECTION]]", persona, config)

    assert "find_symbol" in prompt
    assert "replace_symbol_body" not in prompt


@verifies(SWR.SWR_501)
def test_render_prompt_omits_unavailable_stdio_mcp_server(tmp_path: Path, monkeypatch) -> None:
    from rotaris_core.agents.factory import _render_prompt

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    persona = PersonaConfig(
        name="tester",
        model="gpt-4o",
        system_prompt="[[ROTARIS:MCP_SECTION]]",
        mcp_servers=["missing"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "missing": MCPServerConfig(
                command="definitely-not-installed",
                tools=[{"name": "missing_tool", "description": "not available"}],
            ),
        },
        workspace_root=tmp_path,
    )

    prompt = _render_prompt("[[ROTARIS:MCP_SECTION]]", persona, config)

    assert "No MCP servers configured" in prompt
    assert "missing_tool" not in prompt


@verifies(SWR.SWR_1707)
def test_factory_rewrites_missing_filesystem_mcp_root_to_workspace() -> None:
    persona = PersonaConfig(
        name="tester",
        model="gpt-4o",
        tools=["filesystem"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "filesystem": MCPServerConfig(
                command="npx",
                args=["@modelcontextprotocol/server-filesystem", "/tmp/does-not-exist"],
            ),
        },
        workspace_root=Path(),
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"filesystem"}
    filesystem = agent.mcp_config["filesystem"]
    assert filesystem.transport == "stdio"
    assert filesystem.command == "npx"
    assert filesystem.args == ["@modelcontextprotocol/server-filesystem", "."]
    assert filesystem.env == {}
    assert filesystem.cwd == "."


@verifies(SWR.SWR_304)
def test_factory_handles_shell_tool_when_stdio_lacks_encoding(monkeypatch) -> None:
    class StreamWithoutEncoding:
        def write(self, text: str) -> int:
            return len(text)

        def flush(self) -> None:
            return None

        def isatty(self) -> bool:
            return True

    for module_name in tuple(sys.modules):
        if module_name == "libtmux" or module_name.startswith("libtmux."):
            sys.modules.pop(module_name, None)
        if module_name == "openhands.tools.terminal" or module_name.startswith(
            "openhands.tools.terminal.",
        ):
            sys.modules.pop(module_name, None)

    monkeypatch.setattr(sys, "stdout", StreamWithoutEncoding())
    monkeypatch.setattr(sys, "stderr", StreamWithoutEncoding())
    monkeypatch.setattr(factory, "_custom_tools_registered", False)
    monkeypatch.setattr(factory, "_sdk_terminal_registered", False)

    persona = PersonaConfig(name="tester", model="gpt-4o", tools=["terminal"])
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert [tool.name for tool in agent.tools] == ["terminal"]
    assert agent.include_default_tools == []


@verifies(SWR.SWR_304)
def test_factory_handles_write_file_with_import(monkeypatch) -> None:
    persona = PersonaConfig(name="tester", model="gpt-4o", tools=["write_file"])
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert [tool.name for tool in agent.tools] == ["write_file"]
    assert agent.include_default_tools == []


@verifies(SWR.SWR_554)
def test_factory_renders_runtime_tool_names_into_prompt() -> None:
    persona = PersonaConfig(
        name="coding-agent",
        model="gpt-4o",
        system_prompt="Tools:\n[[ROTARIS:TOOLS_SECTION]]",
        tools=["write_file", "terminal"],
    )
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert agent.system_prompt_kwargs is not None
    rendered = str(agent.system_prompt_kwargs.get("persona_prompt", ""))
    assert "`write_file`" in rendered
    assert "`terminal`" in rendered


@verifies(SWR.SWR_554)
def test_tool_name_mapping_is_applied() -> None:
    assert TOOL_NAME_MAP == {
        "ask_questions": "ask_questions",
        "delegate": "delegate",
        "read_file": "read_file",
        "write_file": "write_file",
        "terminal": "terminal",
        "git_commit": "git_commit",
        "todo": "todo",
        "fetch": "fetch",
        "grep": "grep",
        "glob": "glob",
        "background_output": "background_output",
        "wait_for_tasks": "wait_for_tasks",
        "haet": "haet_edit",
        "haet_edit": "haet_edit",
        "haet_read": "haet_read",
        "artifact_read": "artifact_read",
        "artifact_list": "artifact_list",
        "artifact_write": "artifact_write",
    }


@verifies(SWR.SWR_301)
def test_prompts_dir_points_to_agents_prompts() -> None:
    assert Path(factory.__file__).parent / "prompts" == factory.PROMPTS_DIR


@verifies(SWR.SWR_557, SWR.SWR_2426)
def test_child_agent_todo_does_not_fire_parent_callback() -> None:
    """Regression: child agent todo calls must not contaminate the parent's _last_todo_state.

    When a child agent is created with runtime_kwargs=None, its todo factory must be
    re-registered with on_state_change=None so that todo calls from the child do NOT fire
    the parent's capture callback.  Previously the global SDK registry retained the
    parent's factory, causing child todo operations to overwrite the parent's captured
    state and produce false "incomplete todos" failures.
    """
    from openhands.sdk.tool import resolve_tool

    from rotaris_core.tools.todo import TodoAction

    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    # 1. Build the parent with its capture callback (simulates RalphLoop wiring
    #    _capture_todo_state) so its binding is live in the registry.
    fired: list[object] = []
    parent_persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt="orchestrator prompt",
        tools=["todo"],
    )
    parent_config = RotarisConfig(personas={parent_persona.name: parent_persona})
    create_agent_for_persona(
        parent_persona,
        parent_config,
        runtime_kwargs={"todo_state_callback": fired.append},
    )(llm)

    # 2. Create a child agent with no runtime_kwargs (simulates spawn_children path).
    child_persona = PersonaConfig(
        name="librarian",
        model="gpt-4o",
        system_prompt="librarian prompt",
        tools=["todo"],
    )
    config = RotarisConfig(personas={child_persona.name: child_persona})
    # runtime_kwargs=None is passed to create_agent_for_persona (not to the inner factory).
    child = create_agent_for_persona(child_persona, config, runtime_kwargs=None)(llm)

    # 3. Resolve the child's own todo spec (as the SDK does when initializing a child
    #    conversation) and get the executor.
    child_spec = next(t for t in child.tools if t.name == "todo")
    tools = resolve_tool(child_spec, None)  # type: ignore[arg-type]
    assert tools, "todo factory returned no tools"
    executor = tools[0].executor
    assert executor is not None

    # 4. Simulate the child calling todo — the parent callback must NOT fire.
    executor(TodoAction(operation="add_phase", payload={"name": "Planning", "tasks": []}))

    assert fired == [], (
        "Parent _last_todo_state was contaminated by a child agent todo call. "
        "The child's todo spec must resolve to its own binding, which has no callback."
    )

    # 5. The reverse direction: building the child must not have clobbered the
    #    parent's binding, so the parent's own todo tool still reports to it.
    parent_agent = create_agent_for_persona(
        parent_persona,
        parent_config,
        runtime_kwargs={"todo_state_callback": fired.append},
    )(llm)
    parent_spec = next(t for t in parent_agent.tools if t.name == "todo")
    parent_executor = resolve_tool(parent_spec, None)[0].executor  # type: ignore[arg-type]
    assert parent_executor is not None
    parent_executor(TodoAction(operation="add_phase", payload={"name": "Planning", "tasks": []}))

    assert len(fired) == 1


@verifies(SWR.SWR_1713)
def test_http_mcp_server_skips_path_check(monkeypatch, tmp_path: Path) -> None:
    """HTTP servers bypass shutil.which; included even when PATH returns nothing."""
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    persona = PersonaConfig(
        name="web-agent",
        model="gpt-4o",
        mcp_servers=["remote"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "remote": MCPServerConfig(type="http", url="http://example.com/mcp"),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"remote"}
    remote = agent.mcp_config["remote"]
    assert remote.transport == "streamable-http"
    assert remote.url == "http://example.com/mcp"


@verifies(SWR.SWR_1713)
def test_sse_mcp_server_skips_path_check(monkeypatch, tmp_path: Path) -> None:
    """SSE servers bypass shutil.which; included even when PATH returns nothing."""
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    persona = PersonaConfig(
        name="web-agent",
        model="gpt-4o",
        mcp_servers=["events"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "events": MCPServerConfig(type="sse", url="http://example.com/events"),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"events"}
    events = agent.mcp_config["events"]
    assert events.transport == "sse"
    assert events.url == "http://example.com/events"


@verifies(SWR.SWR_1709)
def test_http_mcp_server_includes_headers(monkeypatch, tmp_path: Path) -> None:
    """HTTP servers pass headers through to the resolved config dict."""
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    persona = PersonaConfig(
        name="web-agent",
        model="gpt-4o",
        mcp_servers=["auth-remote"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "auth-remote": MCPServerConfig(
                type="http",
                url="http://example.com/mcp",
                headers={"X-Auth": "v"},
            ),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"auth-remote"}
    auth_remote = agent.mcp_config["auth-remote"]
    assert auth_remote.transport == "streamable-http"
    assert auth_remote.url == "http://example.com/mcp"
    assert auth_remote.headers is not None
    assert auth_remote.headers["X-Auth"].get_secret_value() == "v"


@verifies(SWR.SWR_726, SWR.SWR_1715)
def test_npm_package_in_command_is_resolved_for_path_check(monkeypatch, tmp_path: Path) -> None:
    """@scope/pkg resolves to npx; PATH check uses 'npx', not '@scope/pkg'."""

    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/npx" if cmd == "npx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["mypkg"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "mypkg": MCPServerConfig(command="@scope/pkg", args=["--verbose"]),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert "mypkg" in agent.mcp_config
    mcp_entry = agent.mcp_config["mypkg"]
    assert mcp_entry.command == "npx"
    assert mcp_entry.args is not None
    assert mcp_entry.args[:2] == ["-y", "@scope/pkg"]
    assert "--verbose" in mcp_entry.args


@verifies(SWR.SWR_1716)
def test_uvx_prefix_in_command_resolved(monkeypatch, tmp_path: Path) -> None:
    """uvx:foo resolves to ('uvx', ['foo']); PATH check uses 'uvx'."""

    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/uvx" if cmd == "uvx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["pytools"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "pytools": MCPServerConfig(command="uvx:foo"),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert "pytools" in agent.mcp_config
    mcp_entry = agent.mcp_config["pytools"]
    assert mcp_entry.command == "uvx"
    assert mcp_entry.args == ["foo"]


@verifies(SWR.SWR_1711)
def test_stdio_command_path_check_applies_to_resolved_command(monkeypatch, tmp_path: Path) -> None:
    """@scope/pkg resolves to npx; server excluded when 'npx' is absent from PATH."""
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["missing-pkg"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "missing-pkg": MCPServerConfig(command="@scope/pkg"),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert agent.mcp_config == {}


@verifies(SWR.SWR_1712)
def test_legacy_yaml_npx_invocation_unchanged(monkeypatch, tmp_path: Path) -> None:
    """command='npx' with explicit args is a known executable; passes through unchanged."""

    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/npx" if cmd == "npx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["legacy-pkg"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "legacy-pkg": MCPServerConfig(command="npx", args=["-y", "@scope/pkg"]),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"legacy-pkg"}
    legacy_pkg = agent.mcp_config["legacy-pkg"]
    assert legacy_pkg.transport == "stdio"
    assert legacy_pkg.command == "npx"
    assert legacy_pkg.args == ["-y", "@scope/pkg"]
    assert legacy_pkg.env == {}
    assert legacy_pkg.cwd == str(tmp_path)


@verifies(SWR.SWR_1707)
def test_filesystem_package_workspace_path_injected(monkeypatch, tmp_path: Path) -> None:
    """Filesystem package with no trailing path arg gets workspace_root appended."""

    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/npx" if cmd == "npx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["filesystem"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "filesystem": MCPServerConfig(
                command="npx",
                args=["-y", "@modelcontextprotocol/server-filesystem"],
            ),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"filesystem"}
    filesystem = agent.mcp_config["filesystem"]
    assert filesystem.transport == "stdio"
    assert filesystem.command == "npx"
    assert filesystem.args == ["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)]
    assert filesystem.env == {}
    assert filesystem.cwd == str(tmp_path)


@verifies(SWR.SWR_1707)
def test_filesystem_package_via_npm_alias_workspace_injected(monkeypatch, tmp_path: Path) -> None:
    """command='@modelcontextprotocol/server-filesystem' resolves; workspace injected."""

    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/npx" if cmd == "npx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["filesystem"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "filesystem": MCPServerConfig(command="@modelcontextprotocol/server-filesystem"),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"filesystem"}
    filesystem = agent.mcp_config["filesystem"]
    assert filesystem.transport == "stdio"
    assert filesystem.command == "npx"
    assert filesystem.args == ["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)]
    assert filesystem.env == {}
    assert filesystem.cwd == str(tmp_path)


@verifies(SWR.SWR_727)
def test_stdio_cwd_passed_through(monkeypatch, tmp_path: Path) -> None:
    """Cwd field on a stdio config appears in the normalized output dict."""

    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/node" if cmd == "node" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["myserver"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "myserver": MCPServerConfig(command="node", args=["server.js"], cwd="/tmp"),
        },
        workspace_root=tmp_path,
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert set(agent.mcp_config) == {"myserver"}
    myserver = agent.mcp_config["myserver"]
    assert myserver.transport == "stdio"
    assert myserver.command == "node"
    assert myserver.args == ["server.js"]
    assert myserver.env == {}
    assert myserver.cwd == "/tmp"


@verifies(SWR.SWR_1733)
def test_normalize_does_not_mutate_input_config(tmp_path: Path) -> None:
    """_normalize_mcp_server_config must not mutate MCPServerConfig.args."""
    from rotaris_core.agents.factory import _normalize_mcp_server_config

    original_args = ["-y", "@modelcontextprotocol/server-filesystem"]
    server_cfg = MCPServerConfig(command="npx", args=list(original_args))

    _normalize_mcp_server_config("filesystem", server_cfg, tmp_path)

    assert list(server_cfg.args) == original_args


@verifies(SWR.SWR_1708)
def test_resolve_mcp_config_excludes_disabled_servers(tmp_path: Path, monkeypatch) -> None:
    from rotaris_core.agents.factory import _resolve_mcp_config

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: "/usr/bin/npx")

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["filesystem", "playwright"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "filesystem": MCPServerConfig(
                command="npx",
                args=["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
            ),
            "playwright": MCPServerConfig(command="npx", args=["-y", "@playwright/mcp"]),
        },
        workspace_root=tmp_path,
    )
    toggle_store = MCPToggleStore(path=tmp_path / "toggles.json")
    toggle_store.set_enabled("playwright", False)

    result, _warnings = _resolve_mcp_config(persona, config, toggle_store=toggle_store)

    assert result == {
        "filesystem": {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
            "env": {},
            "cwd": str(tmp_path),
        },
    }


@verifies(SWR.SWR_1708)
def test_resolve_mcp_config_default_all_enabled_when_no_toggle_file(
    tmp_path: Path,
    monkeypatch,
) -> None:
    from rotaris_core.agents.factory import _resolve_mcp_config

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: "/usr/bin/npx")

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["filesystem", "playwright"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "filesystem": MCPServerConfig(
                command="npx",
                args=["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
            ),
            "playwright": MCPServerConfig(command="npx", args=["-y", "@playwright/mcp"]),
        },
        workspace_root=tmp_path,
    )
    toggle_store = MCPToggleStore(path=tmp_path / "toggles.json")

    result, _warnings = _resolve_mcp_config(persona, config, toggle_store=toggle_store)

    assert result == {
        "filesystem": {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
            "env": {},
            "cwd": str(tmp_path),
        },
        "playwright": {
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@playwright/mcp"],
            "env": {},
            "cwd": str(tmp_path),
        },
    }


@verifies(SWR.SWR_1711)
def test_resolve_mcp_config_toggle_filter_runs_before_path_check(
    tmp_path: Path,
    monkeypatch,
) -> None:
    from rotaris_core.agents.factory import _resolve_mcp_config

    def fail_if_called(_: str) -> str | None:
        raise AssertionError("PATH check should not run for disabled MCP servers")

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fail_if_called)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["disabled-server"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={"disabled-server": MCPServerConfig(command="definitely-not-on-path-xyz")},
        workspace_root=tmp_path,
    )
    toggle_store = MCPToggleStore(path=tmp_path / "toggles.json")
    toggle_store.set_enabled("disabled-server", False)

    result, _warnings = _resolve_mcp_config(persona, config, toggle_store=toggle_store)

    assert result == {}


@verifies(SWR.SWR_1729)
def test_resolve_mcp_config_warns_when_server_not_in_config(tmp_path: Path) -> None:
    """When a persona references an MCP server that is not in config.mcp_servers,
    the server name should appear in the returned warnings list."""
    from rotaris_core.agents.factory import _resolve_mcp_config

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["ghost-server"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={},
        workspace_root=tmp_path,
    )

    result, warnings = _resolve_mcp_config(persona, config)

    assert result == {}
    assert len(warnings) == 1
    assert "ghost-server" in warnings[0]
    assert "not configured" in warnings[0]


@verifies(SWR.SWR_1729)
def test_resolve_mcp_config_warns_when_command_not_on_path(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """When a configured MCP server's command is not on PATH, the server name
    should appear in the returned warnings list."""
    from rotaris_core.agents.factory import _resolve_mcp_config

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["offline-server"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "offline-server": MCPServerConfig(
                command="definitely-not-on-path-xyzzy",
                args=["--verbose"],
            ),
        },
        workspace_root=tmp_path,
    )

    result, warnings = _resolve_mcp_config(persona, config)

    assert result == {}
    assert len(warnings) >= 1
    assert any("offline-server" in w and "not found on PATH" in w for w in warnings)


@verifies(SWR.SWR_1729)
def test_resolve_mcp_config_no_warnings_when_everything_works(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """When all MCP servers are configured and available, warnings should be empty."""
    from rotaris_core.agents.factory import _resolve_mcp_config

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: "/usr/bin/npx")

    persona = PersonaConfig(
        name="coder",
        model="gpt-4o",
        mcp_servers=["lsp"],
    )
    config = RotarisConfig(
        personas={persona.name: persona},
        mcp_servers={
            "lsp": MCPServerConfig(command="npx", args=["-y", "@theupsider/lsp-mcp"]),
        },
        workspace_root=tmp_path,
    )

    result, warnings = _resolve_mcp_config(persona, config)

    assert "lsp" in result
    assert warnings == []


@verifies(SWR.SWR_1814)
def test_register_haet_tool_factories_exposes_read_alias(tmp_path: Path) -> None:
    from openhands.sdk.tool import resolve_tool
    from openhands.sdk.tool.spec import Tool as ToolSpec

    from rotaris_core.agents.factory import _register_haet_tool_factories
    from rotaris_core.haet.tool import HAETReadAction

    (tmp_path / "sample.py").write_text("alpha\n", encoding="utf-8")

    _register_haet_tool_factories(tmp_path)

    tools = resolve_tool(ToolSpec(name="read"), None)  # type: ignore[arg-type]
    assert tools, "read alias returned no tools"

    executor = tools[0].executor
    assert executor is not None
    observation = executor(HAETReadAction(file_path="sample.py"))

    assert observation.is_error is False
    assert "alpha" in observation.text


@verifies(SWR.SWR_2426)
def test_bound_tool_params_are_json_serialisable() -> None:
    """Productive use: a child agent's conversation state can be persisted and resumed.
    Expected outcome: every Tool spec params dict survives a JSON round-trip, so no live
    runtime object ever leaks into ConversationState."""
    import json

    persona = PersonaConfig(
        name="analyst",
        model="gpt-4o",
        system_prompt="analyse",
        tools=["delegate", "todo", "artifact_read", "artifact_write"],
        can_publish_artifacts=True,
    )
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    runtime_kwargs = {
        "child_manager": object(),
        "scheduler": object(),
        "agent_factory": lambda persona_name, runtime_kwargs=None: None,
        "artifact_store": object(),
        "todo_state_callback": lambda todo: None,
        "child_canonical_name": "run-architecture",
        "child_task_id": "bg_7f07bc93",
    }

    agent = create_agent_for_persona(persona, config, runtime_kwargs=runtime_kwargs)(llm)

    bound = {tool.name: tool.params for tool in agent.tools}
    for name, params in bound.items():
        assert json.loads(json.dumps(params)) == params, f"{name} params are not JSON-safe"

    assert bound["artifact_write"]["canonical_name"] == "run-architecture"
    assert bound["artifact_write"]["task_id"] == "bg_7f07bc93"
    assert bound["todo"]["binding_key"] == "run-architecture"


@verifies(SWR.SWR_3004)
def test_persona_agent_registers_no_default_sdk_tools() -> None:
    """Productive use: an agent ends its run by answering, not by calling a tool.

    Expected outcome: no built-in SDK tool (terminal completion, think) is
    registered, so the only completion signal is a final assistant message.
    """
    persona = PersonaConfig(name="tester", model="gpt-4o", tools=["write_file"])
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    agent = create_agent_for_persona(persona, config)(llm)

    assert agent.include_default_tools == []
    assert not [tool.name for tool in agent.tools if tool.name.lower() in {"finish", "think"}]
