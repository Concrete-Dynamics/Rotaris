"""Productive use: one agent waits for a permission decision while its siblings keep working.
Expected outcome: only the asking call is suspended; approving it runs the real tool, and a
run that ends while a call waits does not leave that agent hanging."""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING, Any

import pytest
from openhands.sdk.event import ActionEvent, AgentErrorEvent, ObservationEvent
from openhands.sdk.llm import MessageToolCall, TextContent
from openhands.sdk.tool import Action, Observation, ToolDefinition, ToolExecutor

from rotaris_core.agents.safe_agent import RotarisAgent
from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    ApprovalHost,
    ApprovalOption,
    BrokeredApprovalResolver,
    Decision,
    DecisionSource,
    PermissionDecision,
    PermissionEngine,
    PermissionPolicy,
    PermissionRequest,
    discard_approval_host,
    register_approval_host,
    register_permission_engine,
    reset_approval_registry,
    reset_permission_registry,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence
    from pathlib import Path

SESSION_ID = "approval-session"


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
    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, action: EchoAction, conversation: object = None) -> EchoObservation:
        del conversation
        self.calls.append(action.command)
        return EchoObservation(ran=action.command)


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    reset_permission_registry()
    reset_approval_registry()
    yield
    reset_permission_registry()
    reset_approval_registry()


def _ask_agent(
    tmp_path: Path,
    binding_key: str,
    persona: str,
    executor: RecordingExecutor,
) -> RotarisAgent:
    """An agent in ``ask`` mode whose approvals route through the session host."""
    from openhands.sdk.llm.llm import LLM

    tool = EchoTool.create(executor=executor)[0]
    agent = RotarisAgent(
        llm=LLM(model="openai/gpt-4o-mini", api_key="test", service_id="test"),
        tools=[],
        permission_binding_key=binding_key,
    )
    agent._tools = {"terminal": tool}  # noqa: SLF001
    agent._initialized = True  # noqa: SLF001
    register_permission_engine(
        binding_key,
        PermissionEngine(
            policy=PermissionPolicy(default_decision=Decision.ASK, preset_name="ask"),
            path_auth=PathAuth(tmp_path),
            persona=persona,
            headless=False,
            agent_id=persona,
            approval_resolver=BrokeredApprovalResolver(
                session_id=SESSION_ID,
                agent_id=persona,
                timeout=10.0,
            ),
        ),
    )
    return agent


def _action_event(command: str, call_id: str = "call-1") -> ActionEvent:
    return ActionEvent(
        thought=[TextContent(text="run it")],
        action=EchoAction(command=command),
        tool_name="terminal",
        tool_call_id=call_id,
        tool_call=MessageToolCall(
            id=call_id,
            name="terminal",
            arguments=f'{{"command": "{command}"}}',
            origin="completion",
        ),
        llm_response_id="resp-1",
    )


class _CollectingHost:
    """Stands in for the desktop UI: records requests, answers on demand."""

    def __init__(self) -> None:
        self.shown: list[dict[str, Any]] = []
        self.dismissed: list[str] = []
        self.arrived = threading.Event()
        self.host = ApprovalHost(present=self._present, dismiss=self.dismissed.append)

    def _present(self, payload: dict[str, Any]) -> None:
        self.shown.append(payload)
        self.arrived.set()

    def answer(self, index: int, option: ApprovalOption) -> bool:
        return self.host.barrier.resolve(str(self.shown[index]["request_id"]), option)


@verifies(SWR.SWR_2504)
def test_pending_approval_suspends_only_the_asking_call(tmp_path: Path) -> None:
    ui = _CollectingHost()
    register_approval_host(SESSION_ID, ui.host)
    waiting_executor = RecordingExecutor()
    sibling_executor = RecordingExecutor()
    waiting_agent = _ask_agent(tmp_path, f"{SESSION_ID}/coder", "coder", waiting_executor)
    sibling_agent = _ask_agent(tmp_path, f"{SESSION_ID}/tester", "tester", sibling_executor)

    events: list[Any] = []

    def _dispatch_waiting() -> None:
        events.extend(
            waiting_agent._execute_action_event(None, _action_event("git push"))  # type: ignore[arg-type]  # noqa: SLF001
        )

    waiter = threading.Thread(target=_dispatch_waiting)
    waiter.start()
    assert ui.arrived.wait(timeout=5)

    # The sibling's own approval resolves while the first agent is still blocked.
    assert waiting_executor.calls == []
    sibling_thread = threading.Thread(
        target=lambda: sibling_agent._execute_action_event(  # noqa: SLF001
            None,  # type: ignore[arg-type]
            _action_event("pytest -q", call_id="call-2"),
        ),
    )
    sibling_thread.start()
    while len(ui.shown) < 2:  # noqa: ASYNC110 - plain thread handshake
        threading.Event().wait(0.01)
    assert ui.answer(1, ApprovalOption.APPROVE_ONCE) is True
    sibling_thread.join(timeout=5)

    assert sibling_executor.calls == ["pytest -q"]
    assert waiting_executor.calls == []

    assert ui.answer(0, ApprovalOption.APPROVE_ONCE) is True
    waiter.join(timeout=5)

    assert waiting_executor.calls == ["git push"]
    assert isinstance(events[0], ObservationEvent)
    assert ui.dismissed  # resolved requests are cleared from the host's UI state


@verifies(SWR.SWR_2504)
def test_denied_approval_refuses_the_call_and_keeps_the_run_going(tmp_path: Path) -> None:
    ui = _CollectingHost()
    register_approval_host(SESSION_ID, ui.host)
    executor = RecordingExecutor()
    agent = _ask_agent(tmp_path, f"{SESSION_ID}/coder", "coder", executor)

    events: list[Any] = []
    waiter = threading.Thread(
        target=lambda: events.extend(
            agent._execute_action_event(None, _action_event("rm -rf build"))  # type: ignore[arg-type]  # noqa: SLF001
        ),
    )
    waiter.start()
    assert ui.arrived.wait(timeout=5)
    assert ui.answer(0, ApprovalOption.DENY) is True
    waiter.join(timeout=5)

    assert executor.calls == []
    assert isinstance(events[0], AgentErrorEvent)
    assert "Permission denied" in events[0].error


@verifies(SWR.SWR_2504)
def test_run_teardown_releases_a_call_still_waiting_for_approval(tmp_path: Path) -> None:
    ui = _CollectingHost()
    register_approval_host(SESSION_ID, ui.host)
    executor = RecordingExecutor()
    agent = _ask_agent(tmp_path, f"{SESSION_ID}/coder", "coder", executor)

    events: list[Any] = []
    waiter = threading.Thread(
        target=lambda: events.extend(
            agent._execute_action_event(None, _action_event("git push"))  # type: ignore[arg-type]  # noqa: SLF001
        ),
    )
    waiter.start()
    assert ui.arrived.wait(timeout=5)

    discard_approval_host(SESSION_ID)
    waiter.join(timeout=5)

    assert not waiter.is_alive()
    assert executor.calls == []
    assert isinstance(events[0], AgentErrorEvent)


@verifies(SWR.SWR_2504)
def test_session_approval_skips_the_prompt_for_the_same_command(tmp_path: Path) -> None:
    ui = _CollectingHost()
    register_approval_host(SESSION_ID, ui.host)
    executor = RecordingExecutor()
    agent = _ask_agent(tmp_path, f"{SESSION_ID}/coder", "coder", executor)

    waiter = threading.Thread(
        target=lambda: agent._execute_action_event(  # noqa: SLF001
            None,  # type: ignore[arg-type]
            _action_event("git push"),
        ),
    )
    waiter.start()
    assert ui.arrived.wait(timeout=5)
    assert ui.answer(0, ApprovalOption.APPROVE_SESSION) is True
    waiter.join(timeout=5)

    agent._execute_action_event(None, _action_event("git push", call_id="call-2"))  # type: ignore[arg-type]  # noqa: SLF001

    assert executor.calls == ["git push", "git push"]
    assert len(ui.shown) == 1


def _resolve_via_host(
    option: ApprovalOption | None,
    *,
    timeout: float = 10.0,
) -> PermissionDecision:
    """Drive one approval to its end, answering with *option* (``None`` = never)."""
    ui = _CollectingHost()
    register_approval_host(SESSION_ID, ui.host)
    resolver = BrokeredApprovalResolver(session_id=SESSION_ID, agent_id="coder", timeout=timeout)
    request = PermissionRequest(tool_name="terminal", persona="coder", command="git push")
    pending = PermissionDecision(Decision.ASK, "preset:ask", "mode 'ask' defaults to ask.")

    resolved: list[PermissionDecision] = []
    waiter = threading.Thread(target=lambda: resolved.append(resolver.resolve(request, pending)))
    waiter.start()
    if option is not None:
        assert ui.arrived.wait(timeout=5)
        assert ui.answer(0, option) is True
    waiter.join(timeout=10)
    return resolved[0]


@verifies(SWR.SWR_2506)
def test_the_audit_trail_tells_apart_who_decided_an_ask(tmp_path: Path) -> None:
    """A user deny, a headless deny and a timeout all carry the same ``rule_id``;
    only the resolution source (SWR-2506) distinguishes them in the audit log."""
    del tmp_path

    assert _resolve_via_host(ApprovalOption.APPROVE_ONCE).source is DecisionSource.USER_ONCE
    assert _resolve_via_host(ApprovalOption.APPROVE_SESSION).source is DecisionSource.USER_SESSION
    assert _resolve_via_host(ApprovalOption.DENY).source is DecisionSource.USER_DENY
    assert _resolve_via_host(None, timeout=0.05).source is DecisionSource.TIMEOUT


@verifies(SWR.SWR_2506)
def test_a_headless_deny_is_audited_as_the_policy_that_produced_it() -> None:
    resolver = BrokeredApprovalResolver(session_id=SESSION_ID, agent_id="coder")
    request = PermissionRequest(tool_name="terminal", persona="coder", command="git push")
    pending = PermissionDecision(Decision.ASK, "preset:ask", "mode 'ask' defaults to ask.")

    # No host at all: the run has nobody who could answer.
    decision = resolver.resolve(request, pending)

    assert decision.decision is Decision.DENY
    assert decision.source is DecisionSource.HEADLESS_POLICY


@verifies(SWR.SWR_2504)
def test_scheduler_stop_releases_a_call_waiting_for_approval(tmp_path: Path) -> None:
    """A stop must not wait out the approval timeout before the run can end."""
    from types import SimpleNamespace

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.scheduler import Scheduler

    ui = _CollectingHost()
    register_approval_host(SESSION_ID, ui.host)
    executor = RecordingExecutor()
    agent = _ask_agent(tmp_path, f"{SESSION_ID}/coder", "coder", executor)

    config = RotarisConfig(workspace_root=tmp_path)
    scheduler = Scheduler(
        config=config,
        workspace_root=str(tmp_path),
        summary_agent=SimpleNamespace(),
    )
    scheduler.binding_session_id = SESSION_ID
    # No live conversations: this exercises the barrier release, not pausing.
    scheduler._active_conversations = {}  # noqa: SLF001
    scheduler._loop = SimpleNamespace(is_closed=lambda: True)  # type: ignore[assignment]  # noqa: SLF001

    events: list[Any] = []
    waiter = threading.Thread(
        target=lambda: events.extend(
            agent._execute_action_event(None, _action_event("git push"))  # type: ignore[arg-type]  # noqa: SLF001
        ),
    )
    waiter.start()
    assert ui.arrived.wait(timeout=5)

    scheduler.request_stop()
    waiter.join(timeout=5)

    assert not waiter.is_alive()
    assert executor.calls == []
    assert isinstance(events[0], AgentErrorEvent)
