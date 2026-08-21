"""Hermetic registry-to-CLI Serena setup flow (SWR-2820)."""

from __future__ import annotations

import json
import sys
import textwrap
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.project_init_state import read_initialization_state
from rotaris_core.config.schema import MCPServerConfig, RotarisConfig
from rotaris_core.init.registry import run_pending_tasks
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration

_SERENA_CLI_STUB = """
import json
import sys
from pathlib import Path

log_path = Path(sys.argv[1])
args = sys.argv[2:]
workspace = Path(args[-1])

if args[:2] == ["project", "create"]:
    project_dir = workspace / ".serena"
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "project.yml").write_text("language_servers: [python]\\n", encoding="utf-8")
elif args[:2] == ["project", "index"]:
    cache = workspace / ".serena" / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "symbols.json").write_text("{}\\n", encoding="utf-8")
elif args[:2] == ["memories", "initialize"]:
    memories = workspace / ".serena" / "memories"
    memories.mkdir(parents=True, exist_ok=True)
    (memories / "memory_maintenance.md").write_text("ready\\n", encoding="utf-8")

with log_path.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(args) + "\\n")

print("ok")
"""


def _config(workspace: Path, executable: Path, log_path: Path) -> RotarisConfig:
    return RotarisConfig(
        workspace_root=workspace,
        mcp_servers={
            "serena": MCPServerConfig(
                command=sys.executable,
                args=[str(executable), str(log_path), "start-mcp-server"],
            ),
        },
    )


def _recorded_commands(log_path: Path) -> list[list[str]]:
    return [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines()]


def _workspace(tmp_path: Path, files: dict[str, str]) -> tuple[Path, Path, Path]:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / ".rotaris").mkdir()
    for relative, content in files.items():
        path = workspace / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    executable = tmp_path / "serena_cli.py"
    executable.write_text(textwrap.dedent(_SERENA_CLI_STUB), encoding="utf-8")
    return workspace, executable, tmp_path / "commands.jsonl"


@verifies(SWR.SWR_2820)
def test_deterministic_setup_initializes_a_code_workspace_without_a_model(tmp_path: Path) -> None:
    """Productive use: a developer opens a fresh code workspace with Serena available.

    Expected outcome: the registered background task calls the local Serena CLI without a
    model or prompt, persists its artifacts, and records successful initialization."""
    workspace, executable, log_path = _workspace(
        tmp_path,
        {"src/main.py": "def main() -> None: ...\n", "src/client.ts": "export {};\n"},
    )

    results = run_pending_tasks(_config(workspace, executable, log_path), workspace)

    assert [(result.task_id, result.status) for result in results] == [("serena-setup", "success")]
    assert _recorded_commands(log_path) == [
        ["project", "create", "--ls", "python", "--ls", "typescript", str(workspace)],
        ["project", "index", str(workspace)],
        ["memories", "initialize", str(workspace)],
    ]
    assert (workspace / ".serena" / "project.yml").exists()
    assert (workspace / ".serena" / "cache" / "symbols.json").exists()
    assert (workspace / ".serena" / "memories" / "memory_maintenance.md").exists()
    assert read_initialization_state(workspace).completed == ["serena-setup"]


@verifies(SWR.SWR_2820)
def test_a_workspace_with_an_existing_project_file_still_indexes(tmp_path: Path) -> None:
    """Productive use: a developer reopens a workspace that already carries a Serena project
    file, or retries after project creation succeeded but indexing failed.

    Expected outcome: the registry leaves the existing project file alone and still builds
    the symbol cache and memory layout before recording completion."""
    workspace, executable, log_path = _workspace(
        tmp_path, {"src/main.py": "def main() -> None: ...\n"}
    )
    (workspace / ".serena").mkdir()
    (workspace / ".serena" / "project.yml").write_text(
        "language_servers: [python]\n", encoding="utf-8"
    )

    results = run_pending_tasks(_config(workspace, executable, log_path), workspace)

    assert [(result.task_id, result.status) for result in results] == [("serena-setup", "success")]
    assert _recorded_commands(log_path) == [
        ["project", "index", str(workspace)],
        ["memories", "initialize", str(workspace)],
    ]
    assert (workspace / ".serena" / "cache" / "symbols.json").exists()
    assert (workspace / ".serena" / "memories" / "memory_maintenance.md").exists()
    assert read_initialization_state(workspace).completed == ["serena-setup"]


@verifies(SWR.SWR_2820, SWR.SWR_2804)
def test_docs_only_project_is_set_up_without_indexing(tmp_path: Path) -> None:
    """Productive use: a developer opens a fresh documentation-only workspace.

    Expected outcome: Serena writes its project configuration, skips code-only work, and the
    registry records the task without creating a symbol cache or memory layout."""
    workspace, executable, log_path = _workspace(tmp_path, {"README.md": "# Notes\n"})

    results = run_pending_tasks(_config(workspace, executable, log_path), workspace)

    assert [(result.task_id, result.status) for result in results] == [("serena-setup", "success")]
    assert _recorded_commands(log_path) == [["project", "create", str(workspace)]]
    assert (workspace / ".serena" / "project.yml").exists()
    assert not (workspace / ".serena" / "cache").exists()
    assert not (workspace / ".serena" / "memories").exists()
    assert read_initialization_state(workspace).completed == ["serena-setup"]
