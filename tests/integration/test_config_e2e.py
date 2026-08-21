from __future__ import annotations

import shutil
from typing import TYPE_CHECKING

from rotaris_core.config import loader
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

    import pytest


def _copy_config_files(source_dir: Path, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for file_name in ("agents.yaml", "models.yml"):
        source_file = source_dir / file_name
        if source_file.exists():
            shutil.copy2(source_file, target_dir / file_name)


@verifies(SWR.SWR_309, SWR.SWR_310)
def test_config_e2e_global_and_workspace_merge(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    global_config_dir: Path,
    workspace_config_dir: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    workspace_root = tmp_path / "workspace"
    workspace_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    workspace_root.mkdir()
    _copy_config_files(global_config_dir, global_dir)
    _copy_config_files(workspace_config_dir, workspace_dir)
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    config = loader.load_config(workspace_root)

    assert config.workspace_root == workspace_root
    assert config.personas["coding-agent"].model == "claude"
    assert config.personas["coding-agent"].summary_model == "gpt4-mini"
    assert config.personas["coding-agent"].tools == [
        "write_file",
        "read_file",
        "terminal",
        "git_commit",
        "fetch",
    ]
    assert config.personas["orchestrator"].model == "gpt4"
    assert config.models["gpt4"].model_id == "openai/gpt-4o"
    assert config.models["gpt4-mini"].model_id == "openai/gpt-4o-mini"
    assert config.models["claude"].model_id == "anthropic/claude-sonnet-4-20250514"
    assert config.models["local-llama"].model_id == "ollama/llama3.2"
    assert config.runtime.max_children == 4
    assert config.runtime.child_timeout == 600
    assert config.runtime.max_depth == 3


@verifies(SWR.SWR_1729)
def test_global_mcp_servers_survive_workspace_without_mcp(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Global MCP servers must persist into the merged config when the workspace
    agents.yaml does not define any mcp_servers key."""
    global_dir = tmp_path / "global-config"
    workspace_root = tmp_path / "workspace"
    workspace_config_dir = workspace_root / loader.WORKSPACE_CONFIG_DIR_NAME
    global_dir.mkdir()
    workspace_root.mkdir()
    workspace_config_dir.mkdir()

    (global_dir / "agents.yaml").write_text(
        "mcp_servers:\n"
        "  lsp:\n"
        "    command: npx\n"
        '    args: ["-y", "@theupsider/lsp-mcp@latest"]\n'
        "  tavily:\n"
        "    type: http\n"
        "    url: https://mcp.tavily.com/mcp/\n"
        "personas:\n"
        "  orchestrator:\n"
        "    name: orchestrator\n"
        "    model: gpt-4o\n"
        "    tools:\n"
        "      - delegate\n"
        "      - read_file\n"
        "    delegates_to:\n"
        "      - coding-agent\n"
        "  coding-agent:\n"
        "    name: coding-agent\n"
        "    model: gpt-4o\n"
        "    mcp_servers:\n"
        "      - lsp\n"
        "    tools:\n"
        "      - write_file\n"
        "      - read_file\n"
        "      - terminal\n",
    )
    (workspace_config_dir / "agents.yaml").write_text(
        "personas:\n"
        "  coding-agent:\n"
        "    name: coding-agent\n"
        "    model: claude\n"
        "    tools:\n"
        "      - write_file\n"
        "      - read_file\n"
        "      - terminal\n"
        "      - fetch\n",
    )

    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    config = loader.load_config(workspace_root)

    # Global MCP servers must be present.
    assert "lsp" in config.mcp_servers
    assert "tavily" in config.mcp_servers
    assert config.mcp_servers["lsp"].command == "npx"
    assert config.mcp_servers["tavily"].type == "http"

    # Persona references to MCP servers should survive.
    assert "lsp" in config.personas["coding-agent"].mcp_servers

    # Workspace override for model + tools still applies.
    assert config.personas["coding-agent"].model == "claude"
    assert "fetch" in config.personas["coding-agent"].tools

    # Source tracking: global servers should be tagged as "yaml" (from global scope).
    assert config.mcp_server_sources["lsp"] == "yaml"
    assert config.mcp_server_sources["tavily"] == "yaml"
