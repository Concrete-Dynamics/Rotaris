"""Tool hooks around the agent's dispatch gate (SWR-2702).

The gate itself is the subject here: which of the permission check, the
``pre_tool`` hook and the tool body run, in what order, and what the agent is
handed back. Every hook is a real script run through the user's shell, as in
``tests/unit/test_hook_runner.py`` — a mocked runner would prove the wiring
against a mock rather than against the exit-code semantics the feature is.
"""

from __future__ import annotations

import json
import logging
import os
import shlex
import subprocess
import sys
from textwrap import dedent
from typing import TYPE_CHECKING, Any

import pytest
from openhands.sdk.event import ActionEvent, AgentErrorEvent, ObservationEvent
from openhands.sdk.llm import MessageToolCall, TextContent
from openhands.sdk.tool import Action, Observation, ToolDefinition, ToolExecutor

from rotaris_core.agents.safe_agent import RotarisAgent, _hook_session_id
from rotaris_core.core.path_auth import PathAuth
from rotaris_core.hooks.models import ResolvedHook
from rotaris_core.hooks.registry import (
    register_hook_runner,
    reset_hook_registry,
)
from rotaris_core.hooks.runner import HookOutcome, HookRunner
from rotaris_core.permissions import (
    ALLOW_ALL_POLICY,
    Decision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRule,
    register_permission_engine,
    reset_permission_registry,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence
    from pathlib import Path

pytestmark = pytest.mark.unit

#: The session this agent's tool calls belong to, and the registry key its
#: hooks are published under.
_SESSION_ID = "hook-session"
_BINDING_KEY = f"{_SESSION_ID}/coder"


# ---------------------------------------------------------------------------
# A gated tool whose execution is directly observable


class ShellAction(Action):
    command: str = ""
    token: str = ""


class ShellObservation(Observation):
    ran: str = ""


class ShellTool(ToolDefinition[ShellAction, ShellObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[ShellTool]:
        del conv_state
        return [
            cls(
                name="terminal",
                description="Run a shell command.",
                action_type=ShellAction,
                observation_type=ShellObservation,
                executor=kwargs["executor"],
            ),
        ]


class RecordingExecutor(ToolExecutor[ShellAction, ShellObservation]):
    """Stands in for a real tool so 'never executed' is directly observable."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, action: ShellAction, conversation: object = None) -> ShellObservation:
        del conversation
        self.calls.append(action.command)
        return ShellObservation(
            ran=action.command,
            content=[TextContent(text=f"ran: {action.command}")],
        )


class FailingExecutor(ToolExecutor[ShellAction, ShellObservation]):
    """A tool that raises, so the SDK returns an error instead of an observation."""

    def __call__(self, action: ShellAction, conversation: object = None) -> ShellObservation:
        del conversation
        raise ValueError(f"the tool is out of order: {action.command}")


class RecordingRunner(HookRunner):
    """A real runner that also records which events the gate asked it to run.

    Subclassed rather than patched because :class:`HookRunner` uses ``__slots__``:
    the recording has to come from a type, not from an attribute assignment.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.events_run: list[str] = []

    def run_pre_tool(self, **kwargs: Any) -> tuple[HookOutcome, ...]:
        self.events_run.append("pre_tool")
        return super().run_pre_tool(**kwargs)

    def run_post_tool(self, **kwargs: Any) -> tuple[HookOutcome, ...]:
        self.events_run.append("post_tool")
        return super().run_post_tool(**kwargs)


# ---------------------------------------------------------------------------
# Hook scripts


def _shell(*parts: str) -> str:
    """Quote *parts* the way the shell this platform hands hooks to expects."""
    if os.name == "nt":
        return subprocess.list2cmdline(parts)
    return shlex.join(parts)


def _script(tmp_path: Path, name: str, body: str, *args: str) -> str:
    """Write a hook script and return the shell command line that runs it."""
    path = tmp_path / name
    path.write_text(dedent(body).lstrip(), encoding="utf-8")
    return _shell(sys.executable, str(path), *args)


#: Reads the payload off stdin as bytes, so the hook decodes UTF-8 rather than
#: the console code page.
_READ_PAYLOAD = (
    "import json, pathlib, sys\npayload = json.loads(sys.stdin.buffer.read().decode('utf-8'))\n"
)

#: Appends the payload the hook was handed to a JSON-lines file, so the test can
#: read back both *that* it fired and *what* it was told.
_RECORD_PAYLOAD = _READ_PAYLOAD + (
    "with pathlib.Path(sys.argv[1]).open('a', encoding='utf-8') as handle:\n"
    "    handle.write(json.dumps(payload) + '\\n')\n"
)


def _recorder(tmp_path: Path, name: str, log: Path, exit_code: int = 0, stderr: str = "") -> str:
    """A hook that records its payload, optionally complains, and exits *exit_code*."""
    body = _RECORD_PAYLOAD
    if stderr:
        body += f"sys.stderr.write({stderr!r})\n"
    body += f"sys.exit({exit_code})\n"
    return _script(tmp_path, name, body, str(log))


def _payloads(log: Path) -> list[dict[str, Any]]:
    if not log.exists():
        return []
    return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if line]


def _hook(
    command: str,
    *,
    event: str = "pre_tool",
    matcher: str = "",
    name: str = "test-hook",
    index: int = 0,
) -> ResolvedHook:
    return ResolvedHook(
        name=name,
        event=event,
        matcher=matcher,
        command=command,
        timeout_seconds=30.0,
        required=False,
        source="workspace",
        index=index,
    )


# ---------------------------------------------------------------------------
# The agent under test


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    """Neither a permission engine nor a hook runner may survive into the next test."""
    reset_permission_registry()
    reset_hook_registry()
    yield
    reset_permission_registry()
    reset_hook_registry()


def _agent(tmp_path: Path, executor: Any, policy: PermissionPolicy) -> RotarisAgent:
    """A ``RotarisAgent`` holding one gated tool, wired to *policy* via the registry."""
    from openhands.sdk.llm.llm import LLM

    tool = ShellTool.create(executor=executor)[0]
    agent = RotarisAgent(
        llm=LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
        tools=[],
        permission_binding_key=_BINDING_KEY,
    )
    # tools_map is what the SDK's dispatch resolves against; populating the
    # backing private attr lets the gate run without a live conversation.
    agent._tools = {"terminal": tool}  # noqa: SLF001
    agent._initialized = True  # noqa: SLF001
    register_permission_engine(
        _BINDING_KEY,
        PermissionEngine(
            policy=policy,
            path_auth=PathAuth(tmp_path),
            persona="coder",
            headless=True,
        ),
    )
    return agent


def _register_runner(
    tmp_path: Path,
    *hooks: ResolvedHook,
    session_id: str = _SESSION_ID,
) -> RecordingRunner:
    workspace = tmp_path / "workspace"
    workspace.mkdir(exist_ok=True)
    runner = RecordingRunner(session_id=session_id, workspace=workspace, hooks=hooks)
    register_hook_runner(session_id, runner)
    return runner


def _action_event(command: str, *, call_id: str = "call-1", token: str = "") -> ActionEvent:
    return ActionEvent(
        thought=[TextContent(text="run it")],
        action=ShellAction(command=command, token=token),
        tool_name="terminal",
        tool_call_id=call_id,
        tool_call=MessageToolCall(
            id=call_id,
            name="terminal",
            arguments=json.dumps({"command": command, "token": token}),
            origin="completion",
        ),
        llm_response_id="resp-1",
    )


def _dispatch(agent: RotarisAgent, event: ActionEvent) -> list[Any]:
    return agent._execute_action_event(None, event)  # type: ignore[arg-type]  # noqa: SLF001


# ---------------------------------------------------------------------------
# pre_tool


@verifies(SWR.SWR_2702)
def test_a_pre_tool_hook_exiting_two_stops_the_tool_from_running(tmp_path: Path) -> None:
    """Productive use: a developer bans force pushes by exiting 2 from a pre_tool hook.
    Expected outcome: the tool never runs, and the agent is handed the hook's own reason
    as a tool result it can correlate with the call it made."""
    executor = RecordingExecutor()
    guard = _script(
        tmp_path,
        "guard.py",
        """
        import sys
        sys.stdin.buffer.read()
        sys.stderr.write("force pushes are banned on this repository")
        sys.exit(2)
        """,
    )
    _register_runner(tmp_path, _hook(guard, name="no-force-push"))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    events = _dispatch(agent, _action_event("git push --force"))

    assert executor.calls == []
    assert len(events) == 1
    error = events[0]
    assert isinstance(error, AgentErrorEvent)
    assert error.tool_name == "terminal"
    assert error.tool_call_id == "call-1"
    # The refusal the runner phrased, verbatim — same shape as a policy deny.
    assert error.error == (
        "Blocked by hook 'no-force-push'. force pushes are banned on this repository "
        "The 'terminal' call was not executed. Choose a different approach or ask the "
        "user to adjust the hook configuration."
    )


@verifies(SWR.SWR_2501, SWR.SWR_2702)
def test_a_call_the_policy_denies_never_reaches_a_hook(tmp_path: Path) -> None:
    """Productive use: a user's audit hook only ever sees calls that were really going
    to happen, not the ones policy already refused.
    Expected outcome: the denied call is refused by the policy alone — no hook process
    is started, and the refusal still names the rule rather than a hook."""
    executor = RecordingExecutor()
    log = tmp_path / "pre.jsonl"
    runner = _register_runner(tmp_path, _hook(_recorder(tmp_path, "pre.py", log)))
    policy = PermissionPolicy(
        rules=(
            PermissionRule(
                "deny-recursive-delete",
                Decision.DENY,
                tools=frozenset({"terminal"}),
                matcher=lambda command: "rm -rf" in command,
                description="recursive delete",
            ),
        ),
    )
    agent = _agent(tmp_path, executor, policy)

    events = _dispatch(agent, _action_event("rm -rf /"))

    assert executor.calls == []
    assert runner.events_run == []
    assert _payloads(log) == []
    assert isinstance(events[0], AgentErrorEvent)
    assert "deny-recursive-delete" in events[0].error


@verifies(SWR.SWR_2702)
def test_a_blocked_call_never_reaches_the_post_tool_hook(tmp_path: Path) -> None:
    """Productive use: a formatting post_tool hook is not woken up by an edit that a
    pre_tool guard stopped from ever happening.
    Expected outcome: the post_tool hook records nothing for the blocked call."""
    executor = RecordingExecutor()
    post_log = tmp_path / "post.jsonl"
    _register_runner(
        tmp_path,
        _hook(_script(tmp_path, "block.py", "import sys\nsys.stdin.buffer.read()\nsys.exit(2)\n")),
        _hook(_recorder(tmp_path, "post.py", post_log), event="post_tool", index=1),
    )
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    _dispatch(agent, _action_event("git push --force"))

    assert executor.calls == []
    assert _payloads(post_log) == []


@verifies(SWR.SWR_2702)
def test_a_failing_hook_warns_the_user_without_blocking_the_call(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Productive use: a developer's hook is broken (it exits 3), and they need to find
    out rather than silently lose either the hook or their agent's work.
    Expected outcome: the tool still runs, the agent sees an ordinary tool result, and
    the failure is reported to the user."""
    executor = RecordingExecutor()
    broken = _script(
        tmp_path,
        "broken.py",
        """
        import sys
        sys.stdin.buffer.read()
        sys.stderr.write("hook interpreter is misconfigured")
        sys.exit(3)
        """,
    )
    _register_runner(tmp_path, _hook(broken, name="lint-guard"))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    with caplog.at_level(logging.WARNING, logger="rotaris_core.agents.safe_agent"):
        events = _dispatch(agent, _action_event("git status"))

    assert executor.calls == ["git status"]
    assert not any(isinstance(event, AgentErrorEvent) for event in events)
    warnings = [record.getMessage() for record in caplog.records]
    assert any("lint-guard" in warning and "exited 3" in warning for warning in warnings)


# ---------------------------------------------------------------------------
# post_tool


@verifies(SWR.SWR_2702)
def test_post_tool_feedback_reaches_the_agent_beside_the_tool_result(tmp_path: Path) -> None:
    """Productive use: a test-runner post_tool hook tells the agent its edit broke the
    suite, without throwing away what the tool actually returned.
    Expected outcome: the call stands, and the single tool message the agent reads
    carries both the tool's own output and the hook's sentence."""
    executor = RecordingExecutor()
    complainer = _script(
        tmp_path,
        "complain.py",
        """
        import sys
        sys.stdin.buffer.read()
        sys.stderr.write("the unit suite is now red")
        sys.exit(2)
        """,
    )
    _register_runner(tmp_path, _hook(complainer, event="post_tool", name="run-tests"))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    events = _dispatch(agent, _action_event("pytest -q"))

    assert executor.calls == ["pytest -q"]
    assert len(events) == 1
    observation = events[0]
    assert isinstance(observation, ObservationEvent)
    message = observation.to_llm_message()
    assert message.role == "tool"
    assert message.tool_call_id == "call-1"
    rendered = " ".join(str(getattr(part, "text", "")) for part in message.content)
    assert "ran: pytest -q" in rendered
    assert "Hook 'run-tests' reported after the 'terminal' call: the unit suite is now red" in (
        rendered
    )


@verifies(SWR.SWR_2702)
def test_post_tool_feedback_survives_a_tool_that_produced_no_observation(tmp_path: Path) -> None:
    """Productive use: a hook's message is not lost just because the tool call it followed
    failed and produced an error instead of a result.
    Expected outcome: the agent still reads the hook's sentence, and the tool's own failure
    is still reported as the failure it was."""
    executor = FailingExecutor()
    complainer = _script(
        tmp_path,
        "complain_on_error.py",
        """
        import sys
        sys.stdin.buffer.read()
        sys.stderr.write("that tool has been failing all morning")
        sys.exit(2)
        """,
    )
    _register_runner(tmp_path, _hook(complainer, event="post_tool", name="flaky-watch"))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    events = _dispatch(agent, _action_event("deploy"))

    assert isinstance(events[0], AgentErrorEvent)
    assert "the tool is out of order" in events[0].error
    rendered = " ".join(
        str(getattr(part, "text", ""))
        for event in events[1:]
        for part in event.to_llm_message().content
    )
    assert "that tool has been failing all morning" in rendered


@verifies(SWR.SWR_2702)
def test_a_post_tool_hook_sees_the_calls_that_actually_ran(tmp_path: Path) -> None:
    """Productive use: an audit hook keeps a record of every tool call the agent really
    made in a session.
    Expected outcome: one payload per executed call, each naming the tool and carrying
    the result the tool produced."""
    executor = RecordingExecutor()
    log = tmp_path / "audit.jsonl"
    _register_runner(tmp_path, _hook(_recorder(tmp_path, "audit.py", log), event="post_tool"))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    _dispatch(agent, _action_event("git status", call_id="call-1"))
    _dispatch(agent, _action_event("ls -la", call_id="call-2"))

    recorded = _payloads(log)
    assert [entry["command"] for entry in recorded] == ["git status", "ls -la"]
    assert {entry["event"] for entry in recorded} == {"post_tool"}
    assert {entry["tool_name"] for entry in recorded} == {"terminal"}
    assert "git status" in json.dumps(recorded[0]["result"])


# ---------------------------------------------------------------------------
# What the hook is told, and which hooks are consulted at all


@verifies(SWR.SWR_2702)
def test_the_hook_payload_carries_the_call_context_with_secrets_redacted(tmp_path: Path) -> None:
    """Productive use: a hook can branch on which session and which tool it is looking at
    without a credential in the agent's arguments leaking into the hook's own logs.
    Expected outcome: the JSON on stdin names the tool, the session and the workspace, and
    the credential-shaped argument arrives masked."""
    executor = RecordingExecutor()
    log = tmp_path / "payload.jsonl"
    _register_runner(tmp_path, _hook(_recorder(tmp_path, "payload.py", log)))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    _dispatch(agent, _action_event("deploy", token="hunter2-super-secret"))

    (payload,) = _payloads(log)
    assert payload["event"] == "pre_tool"
    assert payload["tool_name"] == "terminal"
    assert payload["session_id"] == _SESSION_ID
    assert payload["workspace"] == str(tmp_path / "workspace")
    assert payload["command"] == "deploy"
    assert payload["arguments"]["command"] == "deploy"
    assert payload["arguments"]["token"] == "***"
    assert "hunter2-super-secret" not in json.dumps(payload)


@verifies(SWR.SWR_2702, SWR.SWR_2502)
def test_a_hook_matcher_selects_on_the_command_text_not_the_tool_name(tmp_path: Path) -> None:
    """Productive use: a developer writes ``matcher: "git push *"`` and expects it to catch
    exactly the pushes, not every call to the terminal tool.
    Expected outcome: the push is blocked and the status call runs, which is only possible
    if the gate hands the hook runner the command the tool was called with."""
    executor = RecordingExecutor()
    guard = _script(
        tmp_path,
        "push_guard.py",
        """
        import sys
        sys.stdin.buffer.read()
        sys.stderr.write("pushes go through review")
        sys.exit(2)
        """,
    )
    _register_runner(tmp_path, _hook(guard, matcher="git push *", name="review-pushes"))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    allowed = _dispatch(agent, _action_event("git status", call_id="call-1"))
    blocked = _dispatch(agent, _action_event("git push --force", call_id="call-2"))

    assert executor.calls == ["git status"]
    assert isinstance(allowed[0], ObservationEvent)
    assert isinstance(blocked[0], AgentErrorEvent)
    assert blocked[0].tool_call_id == "call-2"
    assert "review-pushes" in blocked[0].error


@verifies(SWR.SWR_2702)
def test_only_the_events_a_session_declared_hooks_for_are_run(tmp_path: Path) -> None:
    """Productive use: a session that declares only a post_tool hook pays nothing for the
    pre_tool half of the feature on the hottest path in the product.
    Expected outcome: the gate asks the runner for post_tool only, and the tool runs."""
    executor = RecordingExecutor()
    log = tmp_path / "post.jsonl"
    runner = _register_runner(
        tmp_path,
        _hook(_recorder(tmp_path, "post.py", log), event="post_tool"),
    )
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    _dispatch(agent, _action_event("git status"))

    assert runner.events_run == ["post_tool"]
    assert executor.calls == ["git status"]


@verifies(SWR.SWR_2702)
def test_a_session_with_no_registered_runner_dispatches_exactly_as_before(tmp_path: Path) -> None:
    """Productive use: the overwhelming majority of runs configure no hooks at all and must
    not pay for the feature.
    Expected outcome: the tool runs and produces the same single observation it always did."""
    executor = RecordingExecutor()
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    events = _dispatch(agent, _action_event("git status"))

    assert executor.calls == ["git status"]
    assert len(events) == 1
    assert isinstance(events[0], ObservationEvent)
    assert events[0].extended_content == []


@verifies(SWR.SWR_2702)
def test_hooks_registered_for_another_session_never_fire(tmp_path: Path) -> None:
    """Productive use: one workspace's guardrails must not fire on another workspace's
    tool calls when two sessions run side by side.
    Expected outcome: the blocking hook registered under a different session is not
    consulted, and this session's call runs."""
    executor = RecordingExecutor()
    _register_runner(
        tmp_path,
        _hook(_script(tmp_path, "other.py", "import sys\nsys.stdin.buffer.read()\nsys.exit(2)\n")),
        session_id="a-different-session",
    )
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    events = _dispatch(agent, _action_event("git status"))

    assert executor.calls == ["git status"]
    assert isinstance(events[0], ObservationEvent)


@verifies(SWR.SWR_2702)
def test_the_runner_is_resolved_per_call_so_a_re_registration_takes_effect(tmp_path: Path) -> None:
    """Productive use: a resumed session gets the hooks its own run registered, not the
    ones a previous run of the same process left behind.
    Expected outcome: after the session's runner is replaced, the next tool call is
    governed by the new runner."""
    executor = RecordingExecutor()
    first_log = tmp_path / "first.jsonl"
    second_log = tmp_path / "second.jsonl"
    _register_runner(tmp_path, _hook(_recorder(tmp_path, "first.py", first_log)))
    agent = _agent(tmp_path, executor, ALLOW_ALL_POLICY)

    _dispatch(agent, _action_event("git status", call_id="call-1"))
    _register_runner(tmp_path, _hook(_recorder(tmp_path, "second.py", second_log)))
    _dispatch(agent, _action_event("ls", call_id="call-2"))

    assert [entry["command"] for entry in _payloads(first_log)] == ["git status"]
    assert [entry["command"] for entry in _payloads(second_log)] == ["ls"]


@verifies(SWR.SWR_2702)
def test_the_session_id_is_read_off_the_agents_permission_binding_key() -> None:
    """Productive use: hooks find their own session without a second parameter threaded
    through every agent-construction path.
    Expected outcome: a binding key built with a session yields that session id, and one
    built without a session yields nothing rather than a persona name."""
    from rotaris_core.agents.tool_registration import build_binding_key

    with_session = build_binding_key({"session_id": "20260808-120000-abc123"}, "coder")
    without_session = build_binding_key(None, "coder")

    assert _hook_session_id(with_session) == "20260808-120000-abc123"
    assert _hook_session_id(without_session) is None
    assert _hook_session_id(None) is None
    assert _hook_session_id("") is None
