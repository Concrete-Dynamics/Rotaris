"""End-to-end Serena initialization against a real stdio MCP server (SWR-2803, SWR-2804).

Nothing here is mocked except the model itself. A genuine FastMCP server runs in
a subprocess and is discovered the way a user's Serena would be — through
``<workspace>/.mcp.json`` and :func:`rotaris_core.config.loader.load_config` — so
the test exercises MCP config resolution, client startup, tool-schema exposure,
tool dispatch and teardown, not just the runner's bookkeeping.

The stub records every invocation to a JSONL file, which is what lets the
assertions be about *tools that actually ran* rather than about a model's claim
that they did.
"""

from __future__ import annotations

import asyncio
import json
import sys
import textwrap
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config import loader
from rotaris_core.config.loader import load_config
from rotaris_core.config.project_init_state import read_initialization_state
from rotaris_core.init.registry import SERENA_TASK, run_pending_tasks
from rotaris_core.init.serena_task import SERENA_TASK_ID
from rotaris_core.reqtocode import SWR, verifies
from tests.integration.scripted_llm import ScriptedLLM, say, tool_call

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig

pytestmark = pytest.mark.asyncio

_STUB_SOURCE = """
import json
import sys

from mcp.server.fastmcp import FastMCP

# The call log path arrives as argv[1]: the SDK normalizes an stdio MCP server
# with an empty `env`, and the mcp client then launches it with an empty
# environment, so an env var would not survive the hand-off.
LOG = sys.argv[1]

mcp = FastMCP("serena")


def _record(tool, arguments):
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"tool": tool, "arguments": arguments}) + "\\n")
        handle.flush()


# No `activate_project`: a Serena launched with `--project` (SWR-2905) runs in
# single-project mode and stops advertising it. A stub that still offered it
# would let a regression here pass unnoticed.
@mcp.tool(description="Analyse the project and write its durable onboarding memories.")
def onboarding() -> str:
    _record("onboarding", {})
    return "Wrote memories: core, tech_stack, suggested_commands, conventions, task_completion"


@mcp.tool(description="Write a durable project memory.")
def write_memory(memory_name: str, content: str) -> str:
    _record("write_memory", {"memory_name": memory_name})
    return "Memory written: " + memory_name


@mcp.tool(description="List the memories Serena holds for the active project.")
def list_memories() -> str:
    _record("list_memories", {})
    return "core, tech_stack, suggested_commands"


if __name__ == "__main__":
    mcp.run()
"""


@dataclass(frozen=True)
class SerenaStub:
    """A live FastMCP stdio server standing in for Serena, plus its call log."""

    server: Path
    log: Path

    def calls(self) -> list[dict[str, Any]]:
        """Every tool invocation the server actually served, in order."""
        if not self.log.exists():
            return []
        raw = self.log.read_text(encoding="utf-8").splitlines()
        return [json.loads(line) for line in raw if line.strip()]

    def called_tools(self) -> list[str]:
        return [call["tool"] for call in self.calls()]

    def workspace(self, tmp_path: Path, name: str, files: dict[str, str]) -> Path:
        """Build a workspace whose ``.mcp.json`` points ``serena`` at this stub."""
        workspace = tmp_path / name
        (workspace / ".rotaris").mkdir(parents=True)
        for relative, content in files.items():
            (workspace / relative).write_text(content, encoding="utf-8")
        (workspace / ".mcp.json").write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "serena": {
                            "command": sys.executable,
                            "args": [str(self.server), str(self.log)],
                        },
                    },
                },
            ),
            encoding="utf-8",
        )
        return workspace


@pytest.fixture
def serena_stub(tmp_path: Path) -> SerenaStub:
    """Write the stub server and give it a fresh, per-test call log."""
    server = tmp_path / "serena_stub.py"
    server.write_text(textwrap.dedent(_STUB_SOURCE).strip() + "\n", encoding="utf-8")
    return SerenaStub(server=server, log=tmp_path / "serena_calls.jsonl")


def _load(workspace: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> RotarisConfig:
    """Load the workspace config with global config isolated, then unlock MCP dispatch.

    ``autonomous`` + the unsandboxed opt-in is the posture under which an
    unattended run may dispatch MCP tools without an approval prompt; without it
    SWR-2508 downgrades to ``ask`` and every Serena call is denied.
    """
    empty_global = tmp_path / "empty-global"
    empty_global.mkdir(exist_ok=True)
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", empty_global)

    config = load_config(workspace)
    runtime = config.runtime.model_copy(
        update={"permission_mode": "autonomous", "allow_unsandboxed_autonomous": True},
    )
    return config.model_copy(update={"runtime": runtime})


@verifies(SWR.SWR_2803, SWR.SWR_2804, SWR.SWR_2905)
async def test_code_project_activates_and_onboards_via_real_mcp_server(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    serena_stub: SerenaStub,
) -> None:
    """Productive use: a user initializes a real code workspace and Serena is set up for it.
    Expected outcome: a live Serena MCP server receives `onboarding` and reports the memories
    it wrote, the workspace config records the task as completed for a `code` project, and the
    run spends no turn on activation — the server was already bound to the project."""
    workspace = serena_stub.workspace(
        tmp_path,
        "code-project",
        {
            "pyproject.toml": "[project]\nname = 'demo'\n",
            "demo.py": "def main() -> None:\n    print('demo')\n",
            "README.md": "# Demo\n",
        },
    )
    config = _load(workspace, tmp_path, monkeypatch)
    assert "serena" in config.mcp_servers

    scripted = ScriptedLLM(
        [
            tool_call("onboarding"),
            tool_call("write_memory", memory_name="core", content="A demo project."),
            say(
                "onboarding: success\nsummary: Serena is set up and holds this project's memories.",
            ),
        ],
    )

    # Dispatched the way Rotaris dispatches it — through the generic registry —
    # so this covers the runner, the blocking adapter and the marker write the
    # registry owns, not just the runner in isolation.
    results = await asyncio.to_thread(
        run_pending_tasks,
        config,
        workspace,
        tasks=[SERENA_TASK],
        llm=scripted.llm,
        timeout_seconds=120.0,
    )
    assert len(results) == 1
    result = results[0]

    assert result.succeeded, result.error
    assert result.classification == "code"
    assert result.activation == "success"
    assert result.onboarding == "success"

    # The subprocess really ran onboarding and really wrote a memory — and nothing
    # else. An agent that went looking for an activation tool would show up here
    # as an extra call.
    assert serena_stub.called_tools() == ["onboarding", "write_memory"]

    # Both halves came back through the conversation. `onboarding` alone is not
    # enough: it returns instructions, and the memory only exists once the write
    # succeeded (SWR-2803).
    for tool in ("onboarding", "write_memory"):
        record = next(entry for entry in result.tool_calls if entry.name == tool)
        assert record.ok is True, tool

    state = read_initialization_state(workspace)
    assert state.completed == [SERENA_TASK_ID]
    assert state.classification == "code"


@verifies(SWR.SWR_2803, SWR.SWR_2804)
async def test_docs_only_project_activates_without_onboarding(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    serena_stub: SerenaStub,
) -> None:
    """Productive use: a user initializes a documentation-only workspace.
    Expected outcome: the live Serena server is never asked to onboard it, activation is
    still reported as done, and the config records a `non-code` classification."""
    workspace = serena_stub.workspace(
        tmp_path,
        "docs-project",
        {"README.md": "# Handbook\n", "guide.md": "Chapter 1\n"},
    )
    config = _load(workspace, tmp_path, monkeypatch)

    scripted = ScriptedLLM(
        [
            say(
                "onboarding: skipped-no-code\n"
                "summary: Serena is activated; this project has no code to onboard.",
            ),
        ],
    )

    # Dispatched the way Rotaris dispatches it — through the generic registry —
    # so this covers the runner, the blocking adapter and the marker write the
    # registry owns, not just the runner in isolation.
    results = await asyncio.to_thread(
        run_pending_tasks,
        config,
        workspace,
        tasks=[SERENA_TASK],
        llm=scripted.llm,
        timeout_seconds=120.0,
    )
    assert len(results) == 1
    result = results[0]

    assert result.succeeded, result.error
    assert result.classification == "non-code"
    assert result.activation == "success"
    assert result.onboarding == "skipped-no-code"

    assert serena_stub.called_tools() == []

    state = read_initialization_state(workspace)
    assert state.completed == [SERENA_TASK_ID]
    assert state.classification == "non-code"


@verifies(SWR.SWR_2803, SWR.SWR_2905)
async def test_serena_tools_reach_the_model_with_their_descriptions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    serena_stub: SerenaStub,
) -> None:
    """Productive use: the initializer can only work if Serena's tools reach the model.
    Expected outcome: the live server's tool names are offered on every completion
    alongside the persona's read-only file tools, no write tool is present, and no
    activation tool is offered for the model to waste a turn on."""
    workspace = serena_stub.workspace(tmp_path, "toolset-project", {"demo.py": "x = 1\n"})
    config = _load(workspace, tmp_path, monkeypatch)

    scripted = ScriptedLLM(
        [
            tool_call("onboarding"),
            tool_call("write_memory", memory_name="core", content="A demo project."),
            say("onboarding: success\nsummary: Done."),
        ],
    )

    # Dispatched the way Rotaris dispatches it — through the generic registry —
    # so this covers the runner, the blocking adapter and the marker write the
    # registry owns, not just the runner in isolation.
    results = await asyncio.to_thread(
        run_pending_tasks,
        config,
        workspace,
        tasks=[SERENA_TASK],
        llm=scripted.llm,
        timeout_seconds=120.0,
    )
    assert len(results) == 1
    result = results[0]

    assert result.succeeded, result.error
    offered = set(scripted.tools_offered[0])
    assert {"onboarding", "list_memories"} <= offered
    assert {"read_file", "grep", "glob"} <= offered
    assert not offered & {"write_file", "terminal", "haet_edit", "delegate"}
    assert "activate_project" not in offered
