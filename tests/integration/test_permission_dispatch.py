"""Productive use: a denied tool call is refused at the dispatch seam instead of running.
Expected outcome: the executor is never reached, the agent gets a tool result naming
the rule, and the run continues."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from openhands.sdk.event import ActionEvent, AgentErrorEvent, ObservationEvent
from openhands.sdk.llm import MessageToolCall, TextContent
from openhands.sdk.tool import Action, Observation, ToolDefinition, ToolExecutor

from rotaris_core.agents.safe_agent import RotarisAgent
from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    ALLOW_ALL_POLICY,
    Decision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRule,
    command_matcher,
    escalation_matcher,
    register_permission_engine,
    reset_permission_registry,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence
    from pathlib import Path


class EchoAction(Action):
    command: str = ""


class EchoObservation(Observation):
    ran: str = ""

    @property
    def agent_observation(self) -> list[TextContent]:
        return [TextContent(text=self.ran)]


class EchoTool(ToolDefinition[EchoAction, EchoObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[EchoTool]:
        del conv_state
        return [
            cls(
                name="terminal",
                description="Run a shell command.",
                action_type=EchoAction,
                observation_type=EchoObservation,
                executor=kwargs["executor"],
            ),
        ]


class RecordingExecutor(ToolExecutor[EchoAction, EchoObservation]):
    """Stands in for a real tool so 'never executed' is directly observable."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, action: EchoAction, conversation: object = None) -> EchoObservation:
        del conversation
        self.calls.append(action.command)
        return EchoObservation(ran=action.command)


@pytest.fixture(autouse=True)
def _clean_registry() -> Iterator[None]:
    reset_permission_registry()
    yield
    reset_permission_registry()


def _agent_with_policy(
    tmp_path: Path,
    policy: PermissionPolicy,
    executor: RecordingExecutor,
) -> RotarisAgent:
    """A RotarisAgent holding one gated tool, wired to *policy* via the registry."""
    from openhands.sdk.llm.llm import LLM

    tool = EchoTool.create(executor=executor)[0]
    agent = RotarisAgent(
        llm=LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
        tools=[],
        permission_binding_key="test-session/coder",
    )
    # tools_map is what _execute_action_event resolves against; populate the
    # backing private attr so the test needs no live conversation to initialise.
    agent._tools = {"terminal": tool}  # noqa: SLF001
    agent._initialized = True  # noqa: SLF001
    register_permission_engine(
        "test-session/coder",
        PermissionEngine(
            policy=policy,
            path_auth=PathAuth(tmp_path),
            persona="coder",
            headless=True,
        ),
    )
    return agent


def _action_event(command: str) -> ActionEvent:
    return ActionEvent(
        thought=[TextContent(text="run it")],
        action=EchoAction(command=command),
        tool_name="terminal",
        tool_call_id="call-1",
        tool_call=MessageToolCall(
            id="call-1",
            name="terminal",
            arguments=f'{{"command": "{command}"}}',
            origin="completion",
        ),
        llm_response_id="resp-1",
    )


@verifies(SWR.SWR_2501)
def test_denied_call_never_reaches_the_executor(tmp_path: Path) -> None:
    executor = RecordingExecutor()
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
    agent = _agent_with_policy(tmp_path, policy, executor)

    events = agent._execute_action_event(None, _action_event("rm -rf /"))  # type: ignore[arg-type]  # noqa: SLF001

    assert executor.calls == []
    assert len(events) == 1
    error = events[0]
    assert isinstance(error, AgentErrorEvent)
    assert error.tool_call_id == "call-1"
    assert error.tool_name == "terminal"
    assert "deny-recursive-delete" in error.error
    assert "recursive delete" in error.error


@verifies(SWR.SWR_2501)
def test_denial_is_returned_as_a_tool_result_not_an_abort(tmp_path: Path) -> None:
    executor = RecordingExecutor()
    policy = PermissionPolicy(default_decision=Decision.DENY, preset_name="restricted")
    agent = _agent_with_policy(tmp_path, policy, executor)

    events = agent._execute_action_event(None, _action_event("ls"))  # type: ignore[arg-type]  # noqa: SLF001

    message = events[0].to_llm_message()  # type: ignore[union-attr]
    assert message.role == "tool"
    assert message.tool_call_id == "call-1"
    assert "restricted" in str(message.content[0].text)  # type: ignore[union-attr]


@verifies(SWR.SWR_2501)
def test_permitted_call_reaches_the_executor_unchanged(tmp_path: Path) -> None:
    executor = RecordingExecutor()
    agent = _agent_with_policy(tmp_path, ALLOW_ALL_POLICY, executor)

    events = agent._execute_action_event(None, _action_event("git status"))  # type: ignore[arg-type]  # noqa: SLF001

    assert executor.calls == ["git status"]
    assert len(events) == 1
    assert isinstance(events[0], ObservationEvent)


@verifies(SWR.SWR_2501)
def test_agent_without_a_registered_engine_still_executes(tmp_path: Path) -> None:
    """A wiring gap must not silently break runs — it falls back to the default engine."""
    executor = RecordingExecutor()
    agent = _agent_with_policy(tmp_path, ALLOW_ALL_POLICY, executor)
    object.__setattr__(agent, "permission_binding_key", "never-registered")

    events = agent._execute_action_event(None, _action_event("echo hi"))  # type: ignore[arg-type]  # noqa: SLF001

    assert executor.calls == ["echo hi"]
    assert isinstance(events[0], ObservationEvent)


@verifies(SWR.SWR_2501)
def test_permission_binding_key_survives_agent_serialisation(tmp_path: Path) -> None:
    """The key must be JSON-safe: the agent spec is persisted in ConversationState."""
    agent = _agent_with_policy(tmp_path, ALLOW_ALL_POLICY, RecordingExecutor())

    dumped: dict[str, Any] = agent.model_dump(mode="json")

    assert dumped["permission_binding_key"] == "test-session/coder"


def _pattern_policy() -> PermissionPolicy:
    """A policy whose single deny rule is expressed as a command pattern."""
    return PermissionPolicy(
        rules=(
            PermissionRule(
                "deny-recursive-delete",
                Decision.DENY,
                tools=frozenset({"terminal"}),
                matcher=command_matcher("rm -rf *"),
                description="recursive delete",
            ),
        ),
    )


@verifies(SWR.SWR_2502)
def test_pattern_denied_command_never_reaches_the_shell(tmp_path: Path) -> None:
    executor = RecordingExecutor()
    agent = _agent_with_policy(tmp_path, _pattern_policy(), executor)

    events = agent._execute_action_event(None, _action_event("rm -rf /"))  # type: ignore[arg-type]  # noqa: SLF001

    assert executor.calls == []
    assert isinstance(events[0], AgentErrorEvent)
    assert "deny-recursive-delete" in events[0].error


@verifies(SWR.SWR_2502)
def test_pattern_deny_catches_the_destructive_half_of_a_compound_command(
    tmp_path: Path,
) -> None:
    """Chaining a denied command behind an allowed one must not smuggle it through."""
    executor = RecordingExecutor()
    agent = _agent_with_policy(tmp_path, _pattern_policy(), executor)

    events = agent._execute_action_event(  # noqa: SLF001
        None,  # type: ignore[arg-type]
        _action_event("git status && rm -rf /"),
    )

    assert executor.calls == []
    assert isinstance(events[0], AgentErrorEvent)


@verifies(SWR.SWR_2502)
def test_pattern_rule_does_not_block_lookalike_commands(tmp_path: Path) -> None:
    """Token matching, not substring: 'rm -r build/' is a different command."""
    executor = RecordingExecutor()
    agent = _agent_with_policy(tmp_path, _pattern_policy(), executor)

    for command in ("git status", "rm -r build/"):
        events = agent._execute_action_event(None, _action_event(command))  # type: ignore[arg-type]  # noqa: SLF001
        assert isinstance(events[0], ObservationEvent)

    assert executor.calls == ["git status", "rm -r build/"]


@verifies(SWR.SWR_2502)
def test_unreadable_command_escalates_instead_of_running(tmp_path: Path) -> None:
    """An ask on an undecidable command; with no approval UI it fails safe to deny."""
    executor = RecordingExecutor()
    policy = PermissionPolicy(
        rules=(
            PermissionRule(
                "ask-unreadable",
                Decision.ASK,
                tools=frozenset({"terminal"}),
                matcher=escalation_matcher(),
                description="effect cannot be determined statically",
            ),
        ),
    )
    agent = _agent_with_policy(tmp_path, policy, executor)

    events = agent._execute_action_event(  # noqa: SLF001
        None,  # type: ignore[arg-type]
        _action_event("sh -c 'rm -rf /'"),
    )

    assert executor.calls == []
    assert isinstance(events[0], AgentErrorEvent)
    assert "ask-unreadable" in events[0].error
