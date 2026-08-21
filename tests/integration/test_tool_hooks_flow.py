"""Configured tool hooks govern a real agent run (SWR-2702).

Nothing is faked below the LLM: the hooks come out of a real layered config, run
as real host processes, and steer a real ``LocalConversation`` stepping a real
``RotarisAgent`` over real tool definitions. Only the network call is scripted,
so what the test proves is the product's own behaviour — a workspace that
declares a ``pre_tool`` guard really does stop the agent's call, and a
``post_tool`` hook really does see the calls that happened and only those.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from textwrap import dedent
from typing import TYPE_CHECKING, Any

import pytest
import yaml
from openhands.sdk.event import AgentErrorEvent

from rotaris_core.agents.safe_agent import RotarisAgent
from rotaris_core.config import loader
from rotaris_core.core.path_auth import PathAuth
from rotaris_core.hooks.models import resolve_hooks
from rotaris_core.hooks.registry import register_hook_runner, reset_hook_registry
from rotaris_core.hooks.runner import HookRunner
from rotaris_core.permissions import (
    ALLOW_ALL_POLICY,
    PermissionEngine,
    register_permission_engine,
    reset_permission_registry,
)
from rotaris_core.reqtocode import SWR, verifies
from tests.integration.scripted_llm import (
    RecordingMCPToolProvider,
    ScriptedLLM,
    say,
    tool_call,
)

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

pytestmark = pytest.mark.integration

_SESSION_ID = "20260808-101500-abcdef123456"
_BINDING_KEY = f"{_SESSION_ID}/coder"


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    """No hook runner and no permission engine may survive one test into the next."""
    reset_hook_registry()
    reset_permission_registry()
    yield
    reset_hook_registry()
    reset_permission_registry()


def _shell(*parts: str) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline(parts)
    return shlex.join(parts)


def _script(tmp_path: Path, name: str, body: str, *args: str) -> str:
    path = tmp_path / name
    path.write_text(dedent(body).lstrip(), encoding="utf-8")
    return _shell(sys.executable, str(path), *args)


_READ_PAYLOAD = (
    "import json, pathlib, sys\npayload = json.loads(sys.stdin.buffer.read().decode('utf-8'))\n"
)

_RECORD_PAYLOAD = _READ_PAYLOAD + (
    "with pathlib.Path(sys.argv[1]).open('a', encoding='utf-8') as handle:\n"
    "    handle.write(json.dumps(payload) + '\\n')\n"
)


def _schema(*fields: str) -> dict[str, Any]:
    """A permissive-enough MCP input schema: the SDK validates arguments against it."""
    return {"type": "object", "properties": {name: {"type": "string"} for name in fields}}


def _payloads(log: Path) -> list[dict[str, Any]]:
    if not log.exists():
        return []
    return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if line]


def _workspace_with_hooks(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[Path, Path, Path]:
    """A workspace whose config declares a deploy guard and an audit hook.

    Returns the workspace and the two JSON-lines files the hooks record into.
    """
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)

    workspace = tmp_path / "workspace"
    (workspace / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir(parents=True)

    guard_log = tmp_path / "guard.jsonl"
    audit_log = tmp_path / "audit.jsonl"
    guard = _script(
        tmp_path,
        "guard.py",
        _RECORD_PAYLOAD
        + "sys.stderr.write('production deploys need a human on the call')\n"
        + "sys.exit(2)\n",
        str(guard_log),
    )
    auditor = _script(tmp_path, "audit.py", _RECORD_PAYLOAD + "sys.exit(0)\n", str(audit_log))

    (workspace / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml").write_text(
        yaml.safe_dump(
            {
                "hooks": {
                    "entries": [
                        {
                            "name": "guard-deploys",
                            "event": "pre_tool",
                            "matcher": "deploy",
                            "command": guard,
                            "timeout_seconds": 60,
                        },
                        {
                            "name": "audit-every-call",
                            "event": "post_tool",
                            "command": auditor,
                            "timeout_seconds": 60,
                        },
                    ],
                },
            },
        ),
        encoding="utf-8",
    )
    return workspace, guard_log, audit_log


def _agent(llm: Any, workspace: Path) -> RotarisAgent:
    """A ``RotarisAgent`` bound to this session, with its tools served over MCP."""
    register_permission_engine(
        _BINDING_KEY,
        PermissionEngine(
            policy=ALLOW_ALL_POLICY,
            path_auth=PathAuth(workspace),
            persona="coder",
            headless=True,
        ),
    )
    return RotarisAgent(
        llm=llm,
        tools=[],
        mcp_config={"stub": {"command": "never-started"}},
        permission_binding_key=_BINDING_KEY,
    )


def _run(agent: RotarisAgent, workspace: Path, provider: RecordingMCPToolProvider) -> list[Any]:
    from openhands.sdk import LocalConversation

    conversation = LocalConversation(
        agent=agent,
        workspace=workspace,
        visualizer=None,
        delete_on_close=False,
        max_iteration_per_run=10,
        mcp_tool_provider=provider,
    )
    try:
        conversation.send_message("Deploy to production, then leave a note.")
        conversation.run()
        return list(conversation.state.events)
    finally:
        conversation.close()


@verifies(SWR.SWR_2702)
def test_a_workspaces_hooks_block_one_call_and_audit_the_rest_of_a_real_run(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a team declares a pre_tool guard on their deploy tool and a post_tool
    audit hook on everything, then lets an agent loose on the workspace.
    Expected outcome: the deploy never runs and the agent is told why in the hook's own
    words, the note tool runs untouched, and the audit hook records exactly the calls that
    really happened, with the session's own id and the arguments redacted."""
    workspace, guard_log, audit_log = _workspace_with_hooks(tmp_path, monkeypatch)

    config = loader.load_config(workspace)
    hooks = resolve_hooks(config)
    assert [hook.name for hook in hooks] == ["guard-deploys", "audit-every-call"]
    # U8 registers the runner inside the run host; a test that owns its own
    # session registers it directly.
    register_hook_runner(
        _SESSION_ID,
        HookRunner(session_id=_SESSION_ID, workspace=workspace, hooks=hooks),
    )

    provider = RecordingMCPToolProvider(
        {"deploy": "deployed", "notes": "noted"},
        schemas={"deploy": _schema("target", "api_key"), "notes": _schema("text")},
    )
    scripted = ScriptedLLM(
        [
            tool_call("deploy", target="production", api_key="sk-live-not-a-real-key"),
            tool_call("notes", text="deploy was refused"),
            say("I could not deploy, so I left a note instead."),
        ],
    )

    events = _run(_agent(scripted.llm, workspace), workspace, provider)

    assert scripted.exhausted
    # The blocked call never reached the tool — asserted on the provider's own
    # record, not on anything the hook wrote.
    assert not provider.called("deploy")
    assert provider.called("notes")

    refusals = [
        event.error
        for event in events
        if isinstance(event, AgentErrorEvent) and event.tool_name == "deploy"
    ]
    assert refusals == [
        "Blocked by hook 'guard-deploys'. production deploys need a human on the call "
        "The 'deploy' call was not executed. Choose a different approach or ask the user "
        "to adjust the hook configuration.",
    ]

    # The pre_tool hook saw the call it matched, and only that one.
    guard_payloads = _payloads(guard_log)
    assert [entry["tool_name"] for entry in guard_payloads] == ["deploy"]
    assert guard_payloads[0]["event"] == "pre_tool"
    assert guard_payloads[0]["session_id"] == _SESSION_ID
    assert guard_payloads[0]["workspace"] == str(workspace)
    assert guard_payloads[0]["arguments"]["data"]["target"] == "production"
    assert guard_payloads[0]["arguments"]["data"]["api_key"] == "***"
    assert "sk-live-not-a-real-key" not in json.dumps(guard_payloads[0])

    # The post_tool hook fired for the call that ran and not for the blocked one.
    audit_payloads = _payloads(audit_log)
    assert [entry["tool_name"] for entry in audit_payloads] == ["notes"]
    assert audit_payloads[0]["event"] == "post_tool"
    assert audit_payloads[0]["session_id"] == _SESSION_ID
    assert audit_payloads[0]["arguments"]["data"]["text"] == "deploy was refused"


@verifies(SWR.SWR_2702)
def test_a_post_tool_hook_steers_the_agent_without_discarding_the_tool_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a workspace's post_tool hook exits 2 to tell the agent its edit left
    the tree dirty, and the agent has to be able to read both that message and what the
    tool itself returned.
    Expected outcome: the tool's own output and the hook's sentence arrive in the same tool
    message, and the run continues rather than being aborted."""
    global_dir = tmp_path / "global"
    global_dir.mkdir()
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", global_dir)
    workspace = tmp_path / "workspace"
    (workspace / loader.WORKSPACE_CONFIG_DIR_NAME).mkdir(parents=True)

    complainer = _script(
        tmp_path,
        "complain.py",
        """
        import sys
        sys.stdin.buffer.read()
        sys.stderr.write("the working tree is dirty after that edit")
        sys.exit(2)
        """,
    )
    (workspace / loader.WORKSPACE_CONFIG_DIR_NAME / "agents.yaml").write_text(
        yaml.safe_dump(
            {
                "hooks": {
                    "entries": [
                        {
                            "name": "tree-check",
                            "event": "post_tool",
                            "matcher": "edit",
                            "command": complainer,
                            "timeout_seconds": 60,
                        },
                    ],
                },
            },
        ),
        encoding="utf-8",
    )

    config = loader.load_config(workspace)
    register_hook_runner(
        _SESSION_ID,
        HookRunner(session_id=_SESSION_ID, workspace=workspace, hooks=resolve_hooks(config)),
    )

    provider = RecordingMCPToolProvider(
        {"edit": "wrote 3 lines"},
        schemas={"edit": _schema("path")},
    )
    scripted = ScriptedLLM(
        [
            tool_call("edit", path="README.md"),
            say("Cleaning up next."),
        ],
    )

    events = _run(_agent(scripted.llm, workspace), workspace, provider)

    assert scripted.exhausted
    assert provider.called("edit")
    tool_messages = [
        event.to_llm_message()
        for event in events
        if getattr(event, "tool_name", None) == "edit" and hasattr(event, "to_llm_message")
    ]
    rendered = [
        " ".join(str(getattr(part, "text", "")) for part in message.content)
        for message in tool_messages
        if message.role == "tool"
    ]
    assert len(rendered) == 1
    assert "wrote 3 lines" in rendered[0]
    assert "the working tree is dirty after that edit" in rendered[0]
    # Feedback is not a refusal: nothing in this run may look like a blocked call.
    assert not any(isinstance(event, AgentErrorEvent) for event in events)
