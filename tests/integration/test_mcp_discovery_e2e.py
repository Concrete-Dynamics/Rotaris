from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest
from openhands.sdk.llm.llm import LLM

from rotaris_core.agents.factory import create_agent_for_persona
from rotaris_core.config import loader
from rotaris_core.config.loader import load_config
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies


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


def write_mcp_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def _write_agents_yaml(config_dir: Path, content: str) -> None:
    (config_dir / "agents.yaml").write_text(content, encoding="utf-8")


def _make_llm() -> LLM:
    return LLM(model="openai/gpt-4o-mini", api_key="test")


def _user_mcp_path(fake_home: Path) -> Path:
    if sys.platform == "darwin":
        return fake_home / "Library" / "Application Support" / "mcp.json"
    if sys.platform == "win32":
        return fake_home / "AppData" / "Roaming" / "mcp.json"
    return fake_home / ".config" / "mcp.json"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_project_mcp_json_flows_to_config(workspace: Path) -> None:
    write_mcp_json(
        workspace / ".mcp.json",
        {
            "mcpServers": {
                "stdio-server": {"command": "node", "args": ["server.js"]},
                "http-server": {"type": "http", "url": "https://example.com/mcp"},
            },
        },
    )

    config = load_config(workspace)

    assert "stdio-server" in config.mcp_servers
    assert "http-server" in config.mcp_servers
    assert config.mcp_servers["stdio-server"].type == "stdio"
    assert config.mcp_servers["stdio-server"].command == "node"
    assert config.mcp_servers["http-server"].type == "http"
    assert config.mcp_servers["http-server"].url == "https://example.com/mcp"
    assert config.mcp_server_sources["stdio-server"] == "discovered-project"
    assert config.mcp_server_sources["http-server"] == "discovered-project"


@verifies(SWR.SWR_1715, SWR.SWR_1716, SWR.SWR_1730)
def test_e2e_user_and_project_mcp_json_merge(
    workspace: Path,
    isolated_home: Path,
) -> None:
    user_path = _user_mcp_path(isolated_home)
    user_path.parent.mkdir(parents=True, exist_ok=True)
    write_mcp_json(
        user_path,
        {"mcpServers": {"alpha": {"command": "alpha-cmd"}}},
    )
    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"beta": {"command": "beta-cmd"}}},
    )

    config = load_config(workspace)

    assert "alpha" in config.mcp_servers, "user-level server must be discovered"
    assert config.mcp_server_sources["alpha"] == "discovered-user"
    assert "beta" in config.mcp_servers
    assert config.mcp_server_sources["beta"] == "discovered-project"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_yaml_overrides_discovered_same_name(workspace: Path) -> None:
    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"foo": {"command": "discoveredcmd"}}},
    )
    _write_agents_yaml(
        workspace / ".rotaris",
        "mcp_servers:\n  foo:\n    command: yamlcmd\n",
    )

    config = load_config(workspace)

    assert config.mcp_servers["foo"].command == "yamlcmd"
    assert config.mcp_server_sources["foo"] == "yaml"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_envfile_resolution_through_load_config(workspace: Path) -> None:
    (workspace / ".env").write_text("API_KEY=secret123\n", encoding="utf-8")
    write_mcp_json(
        workspace / ".mcp.json",
        {
            "mcpServers": {
                "myserver": {
                    "command": "myserver-bin",
                    "envFile": ".env",
                },
            },
        },
    )

    config = load_config(workspace)

    assert "myserver" in config.mcp_servers
    assert config.mcp_servers["myserver"].env.get("API_KEY") == "secret123"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_invalid_mcp_json_does_not_break_load(workspace: Path) -> None:
    (workspace / ".mcp.json").write_text(
        '{"mcpServers": {"bad": {"command": "x"},}}',
        encoding="utf-8",
    )

    config = load_config(workspace)

    assert isinstance(config, RotarisConfig)
    assert "bad" not in config.mcp_servers


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_discovered_http_server_reaches_agent_mcp_config(workspace: Path) -> None:
    write_mcp_json(
        workspace / ".mcp.json",
        {
            "mcpServers": {
                "tavily": {
                    "type": "http",
                    "url": "https://x.example.com",
                    "headers": {"X-Auth": "tok"},
                },
            },
        },
    )
    _write_agents_yaml(
        workspace / ".rotaris",
        (
            "personas:\n"
            "  web-agent:\n"
            "    name: web-agent\n"
            "    model: gpt-4o-mini\n"
            "    system_prompt: test\n"
            "    mcp_servers:\n"
            "      - tavily\n"
        ),
    )

    config = load_config(workspace)
    persona = config.personas["web-agent"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = agent.mcp_config or {}
    assert "tavily" in mcp_servers
    entry = mcp_servers["tavily"]
    assert entry.transport == "streamable-http"
    assert entry.url == "https://x.example.com"
    assert entry.headers is not None
    assert entry.headers["X-Auth"].get_secret_value() == "tok"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_discovered_npm_alias_resolved_for_factory(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/npx" if cmd == "npx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"mypkg": {"command": "@scope/pkg", "args": ["--flag"]}}},
    )
    _write_agents_yaml(
        workspace / ".rotaris",
        (
            "personas:\n"
            "  pkg-agent:\n"
            "    name: pkg-agent\n"
            "    model: gpt-4o-mini\n"
            "    system_prompt: test\n"
            "    mcp_servers:\n"
            "      - mypkg\n"
        ),
    )

    config = load_config(workspace)
    persona = config.personas["pkg-agent"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = agent.mcp_config or {}
    assert "mypkg" in mcp_servers
    entry = mcp_servers["mypkg"]
    assert entry.command == "npx"
    assert entry.args[:2] == ["-y", "@scope/pkg"]
    assert "--flag" in entry.args


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_discovered_uvx_alias_resolved(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/uvx" if cmd == "uvx" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"uvx-tool": {"command": "uvx:foo-pkg"}}},
    )
    _write_agents_yaml(
        workspace / ".rotaris",
        (
            "personas:\n"
            "  uvx-agent:\n"
            "    name: uvx-agent\n"
            "    model: gpt-4o-mini\n"
            "    system_prompt: test\n"
            "    mcp_servers:\n"
            "      - uvx-tool\n"
        ),
    )

    config = load_config(workspace)
    persona = config.personas["uvx-agent"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = agent.mcp_config or {}
    assert "uvx-tool" in mcp_servers
    entry = mcp_servers["uvx-tool"]
    assert entry.command == "uvx"
    assert entry.args == ["foo-pkg"]


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_http_server_skips_path_check_in_factory(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"remote": {"type": "http", "url": "https://remote.example.com/mcp"}}},
    )
    _write_agents_yaml(
        workspace / ".rotaris",
        (
            "personas:\n"
            "  http-agent:\n"
            "    name: http-agent\n"
            "    model: gpt-4o-mini\n"
            "    system_prompt: test\n"
            "    mcp_servers:\n"
            "      - remote\n"
        ),
    )

    config = load_config(workspace)
    persona = config.personas["http-agent"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = agent.mcp_config or {}
    assert "remote" in mcp_servers
    assert mcp_servers["remote"].transport == "streamable-http"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_yaml_only_config_unchanged_behavior(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_which(cmd: str) -> str | None:
        return "/usr/bin/node" if cmd == "node" else None

    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", fake_which)

    _write_agents_yaml(
        workspace / ".rotaris",
        (
            "personas:\n"
            "  yaml-agent:\n"
            "    name: yaml-agent\n"
            "    model: gpt-4o-mini\n"
            "    system_prompt: test\n"
            "    mcp_servers:\n"
            "      - srv-a\n"
            "      - srv-b\n"
            "mcp_servers:\n"
            "  srv-a:\n"
            "    command: node\n"
            "    args:\n"
            "      - a.js\n"
            "  srv-b:\n"
            "    command: node\n"
            "    args:\n"
            "      - b.js\n"
        ),
    )

    config = load_config(workspace)

    assert "srv-a" in config.mcp_servers
    assert "srv-b" in config.mcp_servers
    assert config.mcp_server_sources.get("srv-a") == "yaml"
    assert config.mcp_server_sources.get("srv-b") == "yaml"

    persona = config.personas["yaml-agent"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = agent.mcp_config or {}
    assert "srv-a" in mcp_servers
    assert "srv-b" in mcp_servers
    assert mcp_servers["srv-a"].command == "node"
    assert mcp_servers["srv-b"].command == "node"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_invalid_server_name_in_mcp_json_skipped(workspace: Path) -> None:
    write_mcp_json(
        workspace / ".mcp.json",
        {
            "mcpServers": {
                "good": {"command": "good-cmd"},
                "1bad": {"command": "bad-cmd"},
                "has space": {"command": "also-bad"},
            },
        },
    )

    config = load_config(workspace)

    assert "good" in config.mcp_servers
    assert "1bad" not in config.mcp_servers
    assert "has space" not in config.mcp_servers


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_mcp_server_referenced_by_persona_but_not_resolvable(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"ghost": {"command": "totally-nonexistent-binary-xyz"}}},
    )
    _write_agents_yaml(
        workspace / ".rotaris",
        (
            "personas:\n"
            "  ghost-agent:\n"
            "    name: ghost-agent\n"
            "    model: gpt-4o-mini\n"
            "    system_prompt: test\n"
            "    mcp_servers:\n"
            "      - ghost\n"
        ),
    )

    config = load_config(workspace)
    assert "ghost" in config.mcp_servers

    persona = config.personas["ghost-agent"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = agent.mcp_config or {}
    assert "ghost" not in mcp_servers


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_non_object_root_in_mcp_json_does_not_break_load(workspace: Path) -> None:
    (workspace / ".mcp.json").write_text('["not", "an", "object"]', encoding="utf-8")

    config = load_config(workspace)

    assert isinstance(config, RotarisConfig)


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_project_overrides_user_server_same_name(
    workspace: Path,
    isolated_home: Path,
) -> None:
    user_path = _user_mcp_path(isolated_home)
    user_path.parent.mkdir(parents=True, exist_ok=True)
    write_mcp_json(
        user_path,
        {"mcpServers": {"shared": {"command": "user-cmd"}}},
    )
    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"shared": {"command": "project-cmd"}}},
    )

    config = load_config(workspace)

    assert config.mcp_servers["shared"].command == "project-cmd"
    assert config.mcp_server_sources["shared"] == "discovered-project"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_servers_key_alias_accepted(workspace: Path) -> None:
    write_mcp_json(
        workspace / ".mcp.json",
        {"servers": {"alt-server": {"command": "alt-cmd"}}},
    )

    config = load_config(workspace)

    assert "alt-server" in config.mcp_servers
    assert config.mcp_server_sources["alt-server"] == "discovered-project"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_workspace_placeholder_resolved_in_cwd(workspace: Path) -> None:
    write_mcp_json(
        workspace / ".mcp.json",
        {
            "mcpServers": {
                "localserver": {
                    "command": "local-cmd",
                    "cwd": "${workspaceFolder}/tools",
                },
            },
        },
    )

    config = load_config(workspace)

    assert "localserver" in config.mcp_servers
    assert config.mcp_servers["localserver"].cwd == str(workspace / "tools")


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_sse_server_discovered_and_skips_path_check(
    workspace: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("rotaris_core.config.mcp_resolution.shutil.which", lambda _: None)

    write_mcp_json(
        workspace / ".mcp.json",
        {"mcpServers": {"events": {"type": "sse", "url": "https://events.example.com"}}},
    )
    _write_agents_yaml(
        workspace / ".rotaris",
        (
            "personas:\n"
            "  sse-agent:\n"
            "    name: sse-agent\n"
            "    model: gpt-4o-mini\n"
            "    system_prompt: test\n"
            "    mcp_servers:\n"
            "      - events\n"
        ),
    )

    config = load_config(workspace)
    assert config.mcp_servers["events"].type == "sse"

    persona = config.personas["sse-agent"]
    agent = create_agent_for_persona(persona, config)(_make_llm())

    mcp_servers: dict[str, Any] = agent.mcp_config or {}
    assert "events" in mcp_servers
    assert mcp_servers["events"].transport == "sse"
    assert mcp_servers["events"].url == "https://events.example.com"


@verifies(SWR.SWR_1715, SWR.SWR_1716)
def test_e2e_discovered_server_env_merged_with_envfile(workspace: Path) -> None:
    (workspace / ".env").write_text("BASE=base-val\nOVERRIDDEN=from-file\n", encoding="utf-8")
    write_mcp_json(
        workspace / ".mcp.json",
        {
            "mcpServers": {
                "merge-srv": {
                    "command": "merge-cmd",
                    "envFile": ".env",
                    "env": {"EXTRA": "extra-val", "OVERRIDDEN": "from-env"},
                },
            },
        },
    )

    config = load_config(workspace)

    assert "merge-srv" in config.mcp_servers
    env = config.mcp_servers["merge-srv"].env
    assert env.get("BASE") == "base-val"
    assert env.get("EXTRA") == "extra-val"
    assert env.get("OVERRIDDEN") == "from-env"
