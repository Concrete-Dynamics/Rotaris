"""Serena reaches developer personas through the normal MCP discovery path (SWR-2801).

Serena is a built-in default MCP server, so a workspace with no custom config already
requests it. These tests exercise both halves of the requirement: the tools show up when
Serena is resolvable, and the persona keeps working when it is not.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from openhands.sdk.llm.llm import LLM

from rotaris_core.agents.factory import create_agent_for_persona, resolve_persona_runtime
from rotaris_core.config import loader
from rotaris_core.config.defaults import (
    SERENA_EDIT_TOOLS,
    SERENA_MEMORY_WRITE_TOOLS,
    SERENA_PINNED_VERSION,
    SERENA_READ_TOOLS,
)
from rotaris_core.config.loader import load_config
from rotaris_core.config.mcp_tool_discovery import clear_mcp_tool_discovery_cache
from rotaris_core.config.schema import MCPToolInfo
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.integration


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setattr(Path, "home", staticmethod(lambda: fake_home))
    monkeypatch.setenv("APPDATA", str(fake_home / "AppData" / "Roaming"))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(fake_home / ".config"))
    return fake_home


@pytest.fixture
def workspace(tmp_path: Path, isolated_home: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / ".rotaris").mkdir()
    empty_global = tmp_path / "empty_global"
    empty_global.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", empty_global)
    return ws


def _make_llm() -> LLM:
    return LLM(model="openai/gpt-4o-mini", api_key="test")


def _mcp_config_for(persona_name: str, workspace: Path) -> dict[str, Any]:
    config = load_config(workspace)
    assert "serena" in config.mcp_servers, "serena must be a built-in default MCP server"
    persona = config.personas[persona_name]
    assert "serena" in persona.mcp_servers

    agent = create_agent_for_persona(persona, config)(_make_llm())
    return dict(agent.mcp_config or {})


@verifies(SWR.SWR_2801)
def test_serena_tools_available_to_orchestrator(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer with ``uv`` on PATH opens a workspace and the orchestrator can
    reach Serena's symbolic code-intelligence tools without any configuration.
    Expected outcome: the built orchestrator agent carries a stdio ``serena`` MCP entry launched
    through ``uvx``."""
    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda cmd: "/usr/bin/uvx" if cmd == "uvx" else None,
    )

    mcp_servers = _mcp_config_for("orchestrator", workspace)

    assert "serena" in mcp_servers
    entry = mcp_servers["serena"]
    assert entry.transport == "stdio"
    assert entry.command == "uvx"
    assert "start-mcp-server" in entry.args


@verifies(SWR.SWR_2905)
def test_serena_is_bound_to_the_run_workspace(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer starts a run and the orchestrator's first tool call is
    work, because Serena came up already knowing which project it is serving.
    Expected outcome: the resolved launch names the run's workspace, which is what puts
    Serena in single-project mode and removes its activation tools from the schema."""
    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda cmd: "/usr/bin/uvx" if cmd == "uvx" else None,
    )

    entry = _mcp_config_for("orchestrator", workspace)["serena"]

    assert list(entry.args)[-2:] == ["--project", str(workspace)]


@verifies(SWR.SWR_2905)
def test_serena_binding_follows_an_isolated_worktree(
    workspace: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer runs a session isolated in a git worktree, and its agents
    resolve symbols in that tree rather than in the repository it was branched from.
    Expected outcome: the launch names the worktree, because it is resolved from the config
    the run executes in — the one `config_for_session_worktree` rewrote."""
    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda cmd: "/usr/bin/uvx" if cmd == "uvx" else None,
    )
    worktree = tmp_path / "worktrees" / "session-1"
    worktree.mkdir(parents=True)

    config = load_config(workspace).model_copy(update={"workspace_root": worktree})
    persona = config.personas["orchestrator"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    entry = dict(agent.mcp_config or {})["serena"]

    assert list(entry.args)[-2:] == ["--project", str(worktree)]


@verifies(SWR.SWR_2818)
def test_developer_persona_gets_serena_and_no_lsp_server(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer opens a workspace with no custom config and every agent
    that touches code reaches exactly one language-server backend.
    Expected outcome: each code-facing persona's built MCP config carries ``serena`` and no
    ``lsp`` entry — the removal reaches the agent, not just the defaults dict."""
    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda cmd: "/usr/bin/uvx" if cmd == "uvx" else None,
    )

    for persona_name in ("orchestrator", "coding-agent", "codebase-analyst", "verifier"):
        mcp_servers = _mcp_config_for(persona_name, workspace)

        assert "serena" in mcp_servers, persona_name
        assert "lsp" not in mcp_servers, persona_name


@verifies(SWR.SWR_2819)
def test_the_pinned_serena_release_survives_command_resolution(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: the Serena a run actually launches is the release this repository
    was tested against, not whatever upstream pushed since.
    Expected outcome: the pin reaches the resolved launch alongside the per-run
    ``--project`` binding — the two fill-ins do not displace each other."""
    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda cmd: "/usr/bin/uvx" if cmd == "uvx" else None,
    )

    entry = _mcp_config_for("coding-agent", workspace)["serena"]
    args = list(entry.args)

    assert args[args.index("--from") + 1] == f"serena-agent=={SERENA_PINNED_VERSION}"
    assert not [argument for argument in args if "git+" in argument]
    assert args[-2:] == ["--project", str(workspace)]


#: Every tool `serena-agent==1.7.0` advertises under `--context ide`, captured from
#: the pinned build itself (SWR-2819) — the same list the grant sets in
#: `config/defaults.py` were written from. Recorded rather than discovered live,
#: because `tests/conftest.py::_isolate_runtime_mcp_discovery` keeps the suite from
#: launching configured MCP servers. Refresh it alongside `SERENA_PINNED_VERSION`:
#:
#:     uv run python -c "
#:     from pathlib import Path
#:     from rotaris_core.config.defaults import DEFAULT_MCP_SERVERS
#:     from rotaris_core.config.mcp_tool_discovery import list_mcp_server_tools
#:     for t in list_mcp_server_tools('serena', DEFAULT_MCP_SERVERS['serena'], Path.cwd()):
#:         print(t.name)"
PINNED_SERENA_TOOLS = (
    "replace_content",
    "replace_in_files",
    "replace_symbol_body",
    "insert_after_symbol",
    "insert_before_symbol",
    "search_for_pattern",
    "get_symbols_overview",
    "find_symbol",
    "find_referencing_symbols",
    "find_implementations",
    "find_declaration",
    "get_diagnostics_for_file",
    "rename_symbol",
    "safe_delete_symbol",
    "write_memory",
    "read_memory",
    "list_memories",
    "delete_memory",
    "rename_memory",
    "edit_memory",
    "open_dashboard",
    "onboarding",
    "initial_instructions",
)


@verifies(SWR.SWR_3008)
def test_persona_grants_narrow_the_pinned_serena_surface(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: the grants describe the Serena a run actually launches.

    Expected outcome: fed the pinned build's own tool list, a read-only persona's
    resolved runtime carries Serena's lookups and none of its editing tools, an
    implementation persona's carries both, and every name the grant sets mention
    is a tool that build really ships — which is what makes them explicit rather
    than aspirational.
    """
    monkeypatch.setattr(
        "rotaris_core.config.mcp_tool_discovery._run_tool_discovery",
        lambda *_args, **_kwargs: [MCPToolInfo(name=name) for name in PINNED_SERENA_TOOLS],
    )
    monkeypatch.setattr(
        "rotaris_core.config.mcp_resolution.shutil.which",
        lambda cmd: "/usr/bin/uvx" if cmd == "uvx" else None,
    )
    clear_mcp_tool_discovery_cache()
    config = load_config(workspace)

    def _resolved(persona_name: str) -> set[str]:
        runtime = resolve_persona_runtime(
            config.personas[persona_name],
            config,
            raw_prompt="[[ROTARIS:MCP_SECTION]]",
        )
        return {name for name, _description in runtime.mcp_server_tools.get("serena", [])}

    analyst = _resolved("codebase-analyst")
    coder = _resolved("coding-agent")

    # Every Serena persona carries the memory store (SWR-2822); only the editing
    # tools separate a persona that changes code from one that reads it.
    memories = set(SERENA_MEMORY_WRITE_TOOLS)
    assert analyst == set(SERENA_READ_TOOLS) | memories
    assert not (analyst & set(SERENA_EDIT_TOOLS))
    assert coder == set(SERENA_READ_TOOLS) | set(SERENA_EDIT_TOOLS) | memories
    unknown = (set(SERENA_READ_TOOLS) | set(SERENA_EDIT_TOOLS) | memories) - set(
        PINNED_SERENA_TOOLS
    )
    assert not unknown, f"grant sets name tools the pinned build does not ship: {sorted(unknown)}"


@verifies(SWR.SWR_2801)
def test_persona_works_without_serena(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a developer without ``uv`` installed still gets a working orchestrator.
    Expected outcome: the agent builds, ``serena`` is silently absent from its MCP config, and the
    rest of the persona's toolset (HTTP MCP servers and built-in tools) is unchanged."""
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _cmd: None)

    config = load_config(workspace)
    persona = config.personas["orchestrator"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = dict(agent.mcp_config or {})
    assert "serena" not in mcp_servers, "unresolvable Serena must not reach the agent"
    # tavily is an HTTP server, so it is unaffected by the missing local binary.
    assert "tavily" in mcp_servers

    tool_names = {tool.name for tool in agent.tools}
    assert "read_file" in tool_names, "remaining toolset must stay intact without Serena"
