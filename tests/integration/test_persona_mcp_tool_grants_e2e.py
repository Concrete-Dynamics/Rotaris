"""A read-only persona cannot reach Serena's editing tools (SWR-3008, SWR-3009).

Nothing is mocked here except the model. A real FastMCP stdio server stands in for
Serena, discovered the way a user's would be — through ``<workspace>/.mcp.json`` and
:func:`rotaris_core.config.loader.load_config` — and the run goes through the
scheduler's own conversation path, which is where the persona's grant is applied.

The server records every invocation to a JSONL file, so the assertion is about a
tool that *ran*, not about a model's claim that one did. The read-only persona is
scripted to reach for an editing tool on purpose: the point of the requirement is
that there is nothing there to reach.
"""

from __future__ import annotations

import json
import sys
import textwrap
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.agents.factory import create_agent_for_persona
from rotaris_core.config import loader
from rotaris_core.config.defaults import SERENA_EDIT_TOOLS
from rotaris_core.config.loader import load_config
from rotaris_core.config.mcp_tool_discovery import (
    _run_tool_discovery,
    clear_mcp_tool_discovery_cache,
)
from rotaris_core.mcp.session_manager import SessionMCPManager
from rotaris_core.mcp.shared_tool_provider import SharedMCPToolProvider
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.scheduler import Scheduler
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

LOG = sys.argv[1]

mcp = FastMCP("serena")


def _record(tool, arguments):
    with open(LOG, "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"tool": tool, "arguments": arguments}) + "\\n")
        handle.flush()


@mcp.tool(description="Find a symbol by name path.")
def find_symbol(name_path: str) -> str:
    _record("find_symbol", {"name_path": name_path})
    return "def deploy() -> None: ..."


@mcp.tool(description="Replace the body of a symbol.")
def replace_symbol_body(name_path: str, body: str) -> str:
    _record("replace_symbol_body", {"name_path": name_path, "body": body})
    return "replaced"


@mcp.tool(description="List this project's memories.")
def list_memories() -> str:
    _record("list_memories", {})
    return "[]"


@mcp.tool(description="Write a project memory.")
def write_memory(memory_name: str, content: str) -> str:
    _record("write_memory", {"memory_name": memory_name, "content": content})
    return "written"


if __name__ == "__main__":
    mcp.run()
"""


#: Serena confirms at startup that it came up bound to the run's workspace by calling
#: ``list_memories`` — the cheapest tool it refuses to serve without an active project
#: (SWR-2905, ``shared_tool_provider._probe_serena_binding``). The stub really receives
#: it, before any agent turn.
#:
#: It is *permitted* below rather than *expected*: the probe runs under a 15s budget and
#: a loaded parallel run can spend it, so an exact sequence containing it makes these
#: tests fail on machine speed. What each test asserts instead is that the tool it cares
#: about ran, and that nothing ran which is neither that tool nor this probe — the same
#: claim, without the timing.
BINDING_PROBE = "list_memories"


@dataclass(frozen=True)
class SerenaStub:
    """A live FastMCP stdio server serving a read, an editing and two memory tools."""

    server: Path
    log: Path

    def called_tools(self) -> list[str]:
        if not self.log.exists():
            return []
        raw = self.log.read_text(encoding="utf-8").splitlines()
        return [json.loads(line)["tool"] for line in raw if line.strip()]

    def workspace(self, tmp_path: Path) -> Path:
        workspace = tmp_path / "code-project"
        (workspace / ".rotaris").mkdir(parents=True)
        (workspace / "deploy.py").write_text("def deploy() -> None:\n    ...\n", encoding="utf-8")
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
    server = tmp_path / "serena_stub.py"
    server.write_text(textwrap.dedent(_STUB_SOURCE).strip() + "\n", encoding="utf-8")
    return SerenaStub(server=server, log=tmp_path / "serena_calls.jsonl")


@pytest.fixture
def real_mcp_discovery(monkeypatch: pytest.MonkeyPatch) -> None:
    """Undo the suite-wide discovery stub so the stub server is really listed.

    ``tests/conftest.py::_isolate_runtime_mcp_discovery`` keeps unrelated tests
    from launching configured MCP servers. This test's server is a local Python
    process it writes itself, and the grant has to be read against the tools that
    server actually reports.
    """
    clear_mcp_tool_discovery_cache()
    monkeypatch.setattr(
        "rotaris_core.config.mcp_tool_discovery._run_tool_discovery",
        _run_tool_discovery,
    )
    yield
    clear_mcp_tool_discovery_cache()


def _load(workspace: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> RotarisConfig:
    """Load the workspace config, isolated from global config, with MCP dispatch unlocked.

    The loaded config is narrowed to the one MCP server these tests are about.
    ``load_config`` merges the shipped defaults in beside the workspace's own
    ``.mcp.json``, and :func:`real_mcp_discovery` hands discovery back to the real
    implementation — so without this the run also starts Tavily over HTTPS and the
    ``npx``/``uvx`` servers, each fetched from a package registry and each waited
    on for the full 30s discovery budget. That is a network dependency, a source
    of flakes on a cold cache, and it made these three tests the slowest in the
    suite by an order of magnitude (134s of a 722s serial run). None of it is what
    the requirement is about: the grant is read against the tools *this* server
    reports, and the stub is the only server that reports any.
    """
    empty_global = tmp_path / "empty-global"
    empty_global.mkdir(exist_ok=True)
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", empty_global)

    config = load_config(workspace)
    assert "serena" in config.mcp_servers, "the workspace's .mcp.json declares the stub"
    runtime = config.runtime.model_copy(
        update={
            "permission_mode": "autonomous",
            "allow_unsandboxed_autonomous": True,
            "child_timeout": 120,
            "child_stall_timeout": 120,
        },
    )
    return config.model_copy(
        update={
            "runtime": runtime,
            "mcp_servers": {"serena": config.mcp_servers["serena"]},
        },
    )


class _RecordingSummaryAgent:
    def summarize(self, *_args: Any, **_kwargs: Any) -> str:
        return "done"


@verifies(SWR.SWR_3008, SWR.SWR_3009, SWR.SWR_3010)
async def test_a_read_only_persona_never_receives_a_serena_edit_tool(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    serena_stub: SerenaStub,
    real_mcp_discovery: None,
) -> None:
    """Productive use: a user delegates a codebase question and the tree is not touched.

    Expected outcome: the analyst calls Serena's symbol lookup and the live server
    records it; the editing tool the model then reaches for was never in the
    agent's tool list, so the server never receives it. The record the desktop
    inspector reads back names the same set.
    """
    workspace = serena_stub.workspace(tmp_path)
    config = _load(workspace, tmp_path, monkeypatch)
    persona = config.personas["codebase-analyst"]
    assert persona.read_only is True
    assert "serena" in persona.mcp_servers

    scripted = ScriptedLLM(
        [
            tool_call("find_symbol", name_path="deploy"),
            tool_call("replace_symbol_body", name_path="deploy", body="raise SystemExit"),
            say("The `deploy` function takes no arguments and returns None."),
        ],
        model="openai/gpt-4o-mini",
    )
    agent = create_agent_for_persona(persona, config)(scripted.llm)

    manager = SessionMCPManager()
    scheduler = Scheduler(
        config=config,
        workspace_root=str(workspace),
        summary_agent=_RecordingSummaryAgent(),
        mcp_tool_provider=SharedMCPToolProvider(manager, workspace_root=workspace),
    )
    record = ChildTaskRecord(
        name="analyst",
        canonical_name="analyst",
        persona="codebase-analyst",
        task_payload="What does deploy() do?",
        state=ChildTaskState.RUNNING,
        depth=1,
    )

    try:
        await scheduler.run_child(record, agent)
    finally:
        manager.shutdown()

    # The live server served the lookup and was never asked to edit anything.
    served = serena_stub.called_tools()
    assert "find_symbol" in served
    assert set(served) <= {BINDING_PROBE, "find_symbol"}

    # And the reason is that there was nothing to call: the editing tool was
    # never offered to the model on any turn.
    offered = {name for turn in scripted.tools_offered for name in turn}
    assert "find_symbol" in offered
    assert not offered & set(SERENA_EDIT_TOOLS)

    # The record the run wrote — the same one the inspector reads — says so too:
    # the lookup and the memory store, and nothing that edits the tree.
    granted = set(record.granted_mcp_tools["serena"])
    assert granted == {"find_symbol", "list_memories", "write_memory"}
    assert "read_file" in record.granted_tools


@verifies(SWR.SWR_3008)
async def test_an_implementation_persona_still_gets_the_editing_tool(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    serena_stub: SerenaStub,
    real_mcp_discovery: None,
) -> None:
    """Productive use: the persona whose job is changing code can still change it.

    Expected outcome: `coding-agent` reaches the same live server's editing tool
    and it runs — the grant narrows by role, it does not disarm Serena.
    """
    workspace = serena_stub.workspace(tmp_path)
    config = _load(workspace, tmp_path, monkeypatch)
    persona = config.personas["coding-agent"]

    scripted = ScriptedLLM(
        [
            tool_call("replace_symbol_body", name_path="deploy", body="print('deployed')"),
            say("Rewrote `deploy` to print instead of doing nothing."),
        ],
        model="openai/gpt-4o-mini",
    )
    agent = create_agent_for_persona(persona, config)(scripted.llm)

    manager = SessionMCPManager()
    scheduler = Scheduler(
        config=config,
        workspace_root=str(workspace),
        summary_agent=_RecordingSummaryAgent(),
        mcp_tool_provider=SharedMCPToolProvider(manager, workspace_root=workspace),
    )
    record = ChildTaskRecord(
        name="coder",
        canonical_name="coder",
        persona="coding-agent",
        task_payload="Make deploy() print.",
        state=ChildTaskState.RUNNING,
        depth=1,
    )

    try:
        await scheduler.run_child(record, agent)
    finally:
        manager.shutdown()

    served = serena_stub.called_tools()
    assert "replace_symbol_body" in served
    assert set(served) <= {BINDING_PROBE, "replace_symbol_body"}
    assert set(record.granted_mcp_tools["serena"]) == {
        "find_symbol",
        "replace_symbol_body",
        "list_memories",
        "write_memory",
    }


@verifies(SWR.SWR_2822)
async def test_a_working_persona_may_record_a_project_memory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    serena_stub: SerenaStub,
    real_mcp_discovery: None,
) -> None:
    """Productive use: an agent that works out something durable about the repository
    records it, so the next agent reads it instead of working it out again.

    Expected outcome: a persona declared ``read_only`` reaches the live server's
    memory tools and they run. ``read_only`` is about the working tree, and the
    memory store is not part of it — without this the store has no writer at all
    now that the initializer no longer runs (SWR-2820).
    """
    workspace = serena_stub.workspace(tmp_path)
    config = _load(workspace, tmp_path, monkeypatch)
    persona = config.personas["codebase-analyst"]
    assert persona.read_only is True

    scripted = ScriptedLLM(
        [
            tool_call("list_memories"),
            tool_call(
                "write_memory",
                memory_name="deploy_entry_point",
                content="`deploy()` in deploy.py is the only entry point; it takes no arguments.",
            ),
            say("Recorded where the deploy entry point lives."),
        ],
        model="openai/gpt-4o-mini",
    )
    agent = create_agent_for_persona(persona, config)(scripted.llm)

    manager = SessionMCPManager()
    scheduler = Scheduler(
        config=config,
        workspace_root=str(workspace),
        summary_agent=_RecordingSummaryAgent(),
        mcp_tool_provider=SharedMCPToolProvider(manager, workspace_root=workspace),
    )
    record = ChildTaskRecord(
        name="analyst",
        canonical_name="analyst",
        persona="codebase-analyst",
        task_payload="Where is the deploy entry point?",
        state=ChildTaskState.RUNNING,
        depth=1,
    )

    try:
        await scheduler.run_child(record, agent)
    finally:
        manager.shutdown()

    # The live server really served both halves of the store to the model. The write is
    # counted rather than merely present: it is the half that did not exist before.
    served = serena_stub.called_tools()
    assert served.count("write_memory") == 1
    assert served.count("list_memories") >= 1
    assert set(served) <= {BINDING_PROBE, "list_memories", "write_memory"}
    # And a read-only persona still cannot touch the tree through Serena.
    assert not set(record.granted_mcp_tools["serena"]) & set(SERENA_EDIT_TOOLS)
