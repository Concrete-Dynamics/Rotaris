import asyncio
import json
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest
from openhands.sdk.llm.exceptions.types import LLMBadRequestError, LLMRateLimitError

from rotaris_core.agents.circuit_breaker import CircuitBreakerActivation
from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.core.prompt_types import PromptRegistry, SteeringPrompt, SteeringStatus
from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildNotification, ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.delegate_tool import DelegateAction, RotarisDelegateExecutor
from rotaris_core.orchestrator.report import Artifact, ChildReportArtifact, EscalationSignal
from rotaris_core.orchestrator.scheduler import Scheduler
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.testing.lorem import LoremMarkdownGenerator

FINAL_TEXT = LoremMarkdownGenerator(seed=101).markdown(words=90)


class MockState:
    def __init__(self, events=None, execution_status=None):
        self.events = events or []
        self.execution_status = execution_status


class MockConversation:
    def __init__(
        self,
        events=None,
        should_fail=False,
        delay=0,
        callbacks=None,
        token_callbacks=None,
        run_events=None,
        token_events=None,
        on_run=None,
        execution_status=None,
    ):
        self.state = MockState(events or [], execution_status=execution_status)
        self.should_fail = should_fail
        self.delay = delay
        self.closed = False
        self.paused = False
        self.message_sent = None
        self.messages_sent = []
        self.callbacks = callbacks or []
        self.run_events = run_events or []
        self.token_callbacks = token_callbacks or []
        self.token_events = token_events or []
        self.on_run = on_run
        self.run_count = 0

    def send_message(self, msg):
        self.message_sent = msg
        self.messages_sent.append(msg)

    def run(self):
        import time

        self.run_count += 1
        if self.delay:
            time.sleep(self.delay)
        if self.on_run is not None:
            self.on_run(self)
            return
        # When no custom run logic is supplied, no events were pre-seeded, and the
        # conversation won't raise, emit a synthetic tool event so the transcript
        # produces "executed_work".  Tests that pre-set their own events in the
        # constructor must include at least one tool event if they expect success.
        # Subclasses that override run() control their own event emission.
        if not self.should_fail and self.run_count == 1 and not self.state.events:
            self.state.events.append(MockToolEvent("delegate", "default work"))
        for token_event in self.token_events:
            for callback in self.token_callbacks:
                callback(token_event)
        for event in self.run_events:
            for callback in self.callbacks:
                callback(event)
        if self.should_fail:
            raise RuntimeError("Agent failed")

    def pause(self):
        self.paused = True

    def close(self):
        self.closed = True


class MockSummaryAgent:
    def __init__(self, report=None):
        self._report = report
        self.calls = []

    async def generate_report(self, record, transcript, *, fallback_status="failed"):
        self.calls.append((record, transcript, fallback_status))
        return self._report or ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status=fallback_status if fallback_status != "failed" else "succeeded",
            summary="Done",
        )


class FailingSummaryAgent:
    async def generate_report(self, record, transcript, *, fallback_status="failed"):
        del record, transcript, fallback_status
        raise RuntimeError("summary unavailable")


class MockTextPart:
    def __init__(self, text):
        self.text = text


class MockLLMMessage:
    def __init__(self, content):
        self.content = content


class MockMessageEvent:
    def __init__(self, source, texts):
        self.source = source
        self.llm_message = MockLLMMessage([MockTextPart(text) for text in texts])


class MockToolEvent:
    def __init__(self, tool_name, action):
        self.tool_name = tool_name
        self.action = action
        self.tool_call_id = f"{tool_name}-call"


class MockObservationEvent:
    def __init__(self, tool_name, tool_call_id, observation="ok"):
        self.tool_name = tool_name
        self.tool_call_id = tool_call_id
        self.observation = observation


class MockACPToolCallEvent:
    def __init__(self, title, tool_call_id, status=None, *, is_error=False):
        self.title = title
        self.tool_call_id = tool_call_id
        self.status = status
        self.is_error = is_error


def make_config(child_timeout=10):
    return RotarisConfig(runtime=RuntimePolicy(child_timeout=child_timeout))


class MockCircuitBreaker:
    def __init__(self, activations=None):
        self.activations = list(activations or [])
        self.calls = []

    async def classify(self, **kwargs):
        self.calls.append(kwargs)
        if self.activations:
            return self.activations.pop(0)
        raise AssertionError("No more circuit-breaker activations configured")


def make_scheduler(
    config=None,
    summary_report=None,
    conv=None,
    circuit_breaker=None,
    artifact_store=None,
):
    cfg = config or make_config()
    summary_agent = MockSummaryAgent(report=summary_report)

    def factory(agent, callbacks=None, token_callbacks=None):
        del agent
        if conv is not None:
            conv.callbacks = callbacks or []
            conv.token_callbacks = token_callbacks or []
            return conv
        return MockConversation(callbacks=callbacks, token_callbacks=token_callbacks)

    scheduler = Scheduler(
        config=cfg,
        workspace_root="/tmp/test",
        summary_agent=summary_agent,
        conversation_factory=factory,
        circuit_breaker=circuit_breaker,
        artifact_store=artifact_store,
    )
    return scheduler, summary_agent


@verifies(SWR.SWR_548, SWR.SWR_2132)
def test_scheduler_issue_callback_receives_issue_payload() -> None:
    scheduler, _ = make_scheduler()
    seen: list[dict[str, object | None]] = []

    scheduler.set_diagnostic_issue_callback(lambda issue: seen.append(issue))

    scheduler.diagnostics.issue(
        kind="provider_quota_exhausted",
        severity="error",
        actor="worker",
        message="Provider quota exhausted for model openai/gpt-4o.",
        metadata={"model": "openai/gpt-4o"},
    )

    assert seen == [
        {
            "id": None,
            "kind": "provider_quota_exhausted",
            "severity": "error",
            "actor": "worker",
            "message": "Provider quota exhausted for model openai/gpt-4o.",
            "evidence_ref": None,
            "metadata": {"model": "openai/gpt-4o"},
        },
    ]


@verifies(SWR.SWR_548)
def test_resume_messages_truncate_oversized_child_detail() -> None:
    scheduler, _ = make_scheduler()
    record = ChildTaskRecord(
        name="worker",
        canonical_name="worker",
        persona="librarian",
        task_payload="inspect",
    )
    oversized = "X" * 5000
    report = ChildReportArtifact(
        agent_name="worker",
        persona="librarian",
        status="succeeded",
        summary="Found all tests",
        final_response=oversized,
    )

    child_message = scheduler._build_child_resume_message([(record, report)])
    wait_message = scheduler._build_wait_resume_message([(record, report)])

    assert "[truncated, 1000 more chars]" in child_message
    assert "[truncated, 1000 more chars]" in wait_message
    assert child_message.count("X") == 4000
    assert wait_message.count("X") == 4000


async def _raise_timeout(*args, **kwargs):
    del args, kwargs
    raise TimeoutError


async def _run_watchdog_with_virtual_time(
    monkeypatch: pytest.MonkeyPatch,
    scheduler: Scheduler,
    conversation: MockConversation,
    record: ChildTaskRecord,
    last_activity: list[float],
    *,
    stall_timeout_override: int,
    release_after_sleep: int,
    on_sleep=None,
    active_tool_call_ids: set[str] | None = None,
) -> None:
    real_sleep = asyncio.sleep
    clock = {"now": 0.0}
    sleep_count = 0
    release = asyncio.Event()

    def _monotonic() -> float:
        return clock["now"]

    async def _fake_sleep(delay: float) -> None:
        nonlocal sleep_count
        sleep_count += 1
        clock["now"] += delay
        if on_sleep is not None:
            on_sleep(sleep_count, clock, release, last_activity)
        if sleep_count >= release_after_sleep:
            release.set()
        await real_sleep(0)

    async def _fake_to_thread(func, *args, **kwargs):
        await release.wait()
        return func(*args, **kwargs)

    # The watchdog reads the clock from scheduler_watchdog.py / child_run.py;
    # patching the shared time module's attribute covers both.
    monkeypatch.setattr("rotaris_core.orchestrator.scheduler_watchdog.time.monotonic", _monotonic)
    monkeypatch.setattr("rotaris_core.orchestrator.scheduler.asyncio.sleep", _fake_sleep)
    monkeypatch.setattr("rotaris_core.orchestrator.scheduler.asyncio.to_thread", _fake_to_thread)
    # The actual asyncio.to_thread call lives inside scheduler_watchdog.py
    # since the watchdog was extracted to its own module.
    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler_watchdog.asyncio.to_thread", _fake_to_thread
    )

    await scheduler._run_with_stall_watchdog(
        conversation,
        record,
        last_activity,
        stall_timeout_override=stall_timeout_override,
        active_tool_call_ids=active_tool_call_ids,
    )


def make_manager():
    return ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=RuntimePolicy(max_children=8, max_depth=3),
    )


def make_record(name="child", persona="builder", task_payload="do work"):
    return ChildTaskRecord(
        name=name,
        canonical_name=name,
        persona=persona,
        task_payload=task_payload,
        state=ChildTaskState.RUNNING,
        parent_agent_id="parent",
        depth=1,
    )


@verifies(SWR.SWR_111, SWR.SWR_2426)
def test_background_spawn_resume_advertises_only_direct_children() -> None:
    """Productive use: a nested agent can identify its active delegated work.
    Expected outcome: resume guidance names its child but not itself or a sibling.
    """
    scheduler, _ = make_scheduler()
    manager = make_manager()
    caller = manager.spawn_child(
        "caller",
        "builder",
        "coordinate work",
        run_in_background=True,
        parent_agent_id="orchestrator",
    )
    direct_child = manager.spawn_child(
        "direct-child",
        "analyst",
        "analyse",
        run_in_background=True,
        parent_agent_id=caller.canonical_name,
    )
    sibling = manager.spawn_child(
        "sibling",
        "builder",
        "unrelated work",
        run_in_background=True,
        parent_agent_id="orchestrator",
    )

    message = scheduler._build_background_spawn_resume_message(manager, caller)

    assert direct_child.task_id in message
    assert caller.task_id not in message
    assert sibling.task_id not in message


@verifies(SWR.SWR_126, SWR.SWR_127)
@pytest.mark.asyncio
async def test_run_child_success_returns_terminal_response_without_summary_agent():
    record = make_record()
    conversation = MockConversation(
        events=[
            MockToolEvent("write_file", "edit src/app.py"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ],
    )
    report = ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="succeeded",
        summary="Completed",
    )
    scheduler, summary_agent = make_scheduler(summary_report=report, conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.summary == "Child completed."
    assert result.final_response == FINAL_TEXT
    assert record.state == ChildTaskState.RUNNING
    assert conversation.message_sent == "do work"
    assert conversation.closed is True
    assert summary_agent.calls == []


@verifies(SWR.SWR_1524)
@pytest.mark.asyncio
async def test_run_child_prefers_authored_artifact_and_skips_summary_agent(tmp_path: Path):
    record = make_record(name="planner-child", persona="planner")
    record.task_id = "bg_plan1234"
    conversation = MockConversation(
        events=[
            MockToolEvent("artifact_write", "publish plan"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ],
    )
    store = SessionArtifactStore(tmp_path)
    artifact = store.publish(
        slug="plan-v1",
        title="Plan v1",
        body="# Plan v1\n\nUse the authored artifact.",
        persona=record.persona,
        tags=["plan"],
        source_task_id=record.task_id,
        canonical_name=record.canonical_name,
    )
    record.produced_artifact_ids.append(artifact.id)
    scheduler, summary_agent = make_scheduler(conv=conversation, artifact_store=store)

    result = await scheduler.run_child(record, agent=object())

    assert summary_agent.calls == []
    assert record.state == ChildTaskState.RUNNING
    assert result.summary == artifact.summary
    assert result.final_response == artifact.body_markdown
    assert result.artifacts == [
        Artifact(
            type="agent_published",
            description=f"{artifact.id} [{artifact.slug}] {artifact.title}",
        ),
    ]


@verifies(SWR.SWR_548)
def test_resume_messages_include_artifact_refs() -> None:
    scheduler, _ = make_scheduler()
    record = ChildTaskRecord(
        name="worker",
        canonical_name="worker",
        persona="planner",
        task_payload="inspect",
    )
    report = ChildReportArtifact(
        agent_name="worker",
        persona="planner",
        status="succeeded",
        summary="Authored artifact ready",
        artifacts=[
            Artifact(
                type="agent_published",
                description="art_12345678 [plan-v1] Plan v1",
            ),
        ],
    )

    child_message = scheduler._build_child_resume_message([(record, report)])
    wait_message = scheduler._build_wait_resume_message([(record, report)])

    assert "art_12345678 [plan-v1] Plan v1" in child_message
    assert "art_12345678 [plan-v1] Plan v1" in wait_message


@verifies(SWR.SWR_1134)
def test_inject_pending_steering_prompts_sends_only_pending_and_marks_injected() -> None:
    scheduler, _ = make_scheduler()
    record = make_record()
    conversation = MockConversation()
    registry = PromptRegistry()
    pending_prompt = SteeringPrompt(target_child_id=record.canonical_name, content="Use rg")
    injected_prompt = SteeringPrompt(
        target_child_id=record.canonical_name,
        content="Already handled",
        status=SteeringStatus.INJECTED,
    )

    with registry._lock:
        registry._steering_prompts = {
            record.canonical_name: [pending_prompt, injected_prompt],
        }

    callback_count = {"count": 0}

    assert scheduler._inject_pending_steering_prompts(
        conversation,
        record,
        on_injected=lambda: callback_count.__setitem__("count", callback_count["count"] + 1),
    )

    prompts = registry.get_steering_prompts(record.canonical_name)
    assert conversation.messages_sent == ["[STEERING PROMPT]\nUse rg"]
    assert callback_count["count"] == 1
    assert prompts[0].status == SteeringStatus.INJECTED
    assert prompts[1].status == SteeringStatus.INJECTED

    with registry._lock:
        registry._steering_prompts = {}


@verifies(SWR.SWR_1134)
@pytest.mark.asyncio
async def test_run_child_reruns_when_steering_arrives_after_run_returns() -> None:
    record = make_record()
    conversation = MockConversation()
    report = ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="succeeded",
        summary="Completed",
    )
    scheduler, _ = make_scheduler(summary_report=report, conv=conversation)
    registry = PromptRegistry()
    run_calls = {"count": 0}

    async def _patched_run_with_stall_watchdog(*args, **kwargs):
        del args, kwargs
        run_calls["count"] += 1
        if run_calls["count"] == 1:
            prompt = SteeringPrompt(target_child_id=record.canonical_name, content="Use rg")
            with registry._lock:
                registry._steering_prompts = {record.canonical_name: [prompt]}
            return
        conversation.state.events = [
            MockToolEvent("write_file", "edit src/app.py"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ]

    # type: ignore[method-assign]
    scheduler._run_with_stall_watchdog = _patched_run_with_stall_watchdog

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert conversation.messages_sent == ["do work", "[STEERING PROMPT]\nUse rg"]
    assert run_calls["count"] == 2

    with registry._lock:
        registry._steering_prompts = {}


@verifies(SWR.SWR_127, SWR.SWR_143)
@pytest.mark.asyncio
async def test_run_child_does_not_construct_a_summary_agent():
    record = make_record()
    conversation = MockConversation(
        events=[
            MockToolEvent("write_file", "edit src/app.py"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ],
    )
    created_on_threads: list[int] = []
    summary_agent = MockSummaryAgent()

    def summary_factory(persona):
        assert persona == record.persona
        created_on_threads.append(threading.get_ident())
        return summary_agent

    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=summary_factory,
        conversation_factory=lambda agent, callbacks=None, token_callbacks=None: (
            _conversation_with_callbacks(
                conversation,
                callbacks,
            )
        ),
    )

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert created_on_threads == []
    assert summary_agent.calls == []


@verifies(SWR.SWR_112)
@pytest.mark.asyncio
async def test_run_child_agent_fails_returns_failed_report():
    record = make_record()
    conversation = MockConversation(should_fail=True)
    scheduler, _ = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert "Agent failed" in result.summary
    assert record.state == ChildTaskState.FAILED


@verifies(SWR.SWR_112)
@pytest.mark.asyncio
async def test_run_child_timeout_returns_failed_report_and_pauses():
    record = make_record()
    conversation = MockConversation()
    scheduler, _ = make_scheduler(config=make_config(child_timeout=1), conv=conversation)
    scheduler._run_with_stall_watchdog = _raise_timeout

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert result.summary == "Child timed out after 1s"
    assert record.state == ChildTaskState.FAILED
    assert conversation.paused is True
    assert conversation.closed is True


@verifies(SWR.SWR_112)
@pytest.mark.asyncio
async def test_run_child_always_closes_conversation_on_success_and_failure():
    success_record = make_record(name="success")
    success_conversation = MockConversation()
    success_scheduler, _ = make_scheduler(conv=success_conversation)

    failure_record = make_record(name="failure")
    failure_conversation = MockConversation(should_fail=True)
    failure_scheduler, _ = make_scheduler(conv=failure_conversation)

    await success_scheduler.run_child(success_record, agent=object())
    await failure_scheduler.run_child(failure_record, agent=object())

    assert success_conversation.closed is True
    assert failure_conversation.closed is True


@verifies(SWR.SWR_642)
@pytest.mark.asyncio
async def test_run_child_forwards_streaming_token_callbacks() -> None:
    record = make_record()
    conversation = MockConversation(token_events=["chunk-1", "chunk-2"])
    streamed: list[object] = []
    scheduler, _ = make_scheduler(conv=conversation)
    scheduler._conversation_token_callback = lambda child_record, chunk: streamed.append(
        (child_record.canonical_name, chunk),
    )

    await scheduler.run_child(record, agent=object())

    assert streamed == [("child", "chunk-1"), ("child", "chunk-2")]


@verifies(SWR.SWR_642)
@pytest.mark.asyncio
async def test_run_child_provides_internal_token_callback_without_external_listener() -> None:
    record = make_record()
    conversation = MockConversation(token_events=["chunk-1"])
    scheduler, _ = make_scheduler(conv=conversation)

    await scheduler.run_child(record, agent=object())

    assert len(conversation.token_callbacks) == 1


@pytest.mark.asyncio
@verifies(SWR.SWR_1548)
async def test_run_child_logs_standard_tool_elapsed_ms(caplog) -> None:
    import logging
    import time

    record = make_record()
    conversation = MockConversation(
        events=[
            MockToolEvent("grep", "search docs"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ],
    )

    def _on_run(conv: MockConversation) -> None:
        for callback in conv.callbacks:
            callback(MockToolEvent("grep", "search docs"))
        time.sleep(0.01)
        for callback in conv.callbacks:
            callback(MockObservationEvent("grep", "grep-call"))

    conversation.on_run = _on_run
    scheduler, _ = make_scheduler(conv=conversation)

    with caplog.at_level(logging.INFO, logger="rotaris_core.orchestrator.scheduler"):
        result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    timing_logs = [
        rec.getMessage()
        for rec in caplog.records
        if "tool grep call_id=grep-call" in rec.getMessage()
    ]
    assert len(timing_logs) == 1
    assert "status=completed" in timing_logs[0]
    assert int(timing_logs[0].rsplit("elapsed_ms=", maxsplit=1)[1]) >= 1


@pytest.mark.asyncio
@verifies(SWR.SWR_1548)
async def test_run_child_logs_acp_tool_elapsed_ms_once(caplog) -> None:
    import logging
    import time

    record = make_record()
    conversation = MockConversation(
        events=[
            MockToolEvent("terminal", "pytest -q"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ],
    )

    def _on_run(conv: MockConversation) -> None:
        for callback in conv.callbacks:
            callback(MockACPToolCallEvent("Terminal task", "acp-1", "running"))
        time.sleep(0.01)
        for callback in conv.callbacks:
            callback(MockACPToolCallEvent("Terminal task", "acp-1", "running"))
        for callback in conv.callbacks:
            callback(MockACPToolCallEvent("Terminal task", "acp-1", "completed"))

    conversation.on_run = _on_run
    scheduler, _ = make_scheduler(conv=conversation)

    with caplog.at_level(logging.INFO, logger="rotaris_core.orchestrator.scheduler"):
        result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    timing_logs = [
        rec.getMessage()
        for rec in caplog.records
        if "tool Terminal task call_id=acp-1" in rec.getMessage()
    ]
    assert len(timing_logs) == 1
    assert "status=completed" in timing_logs[0]
    assert int(timing_logs[0].rsplit("elapsed_ms=", maxsplit=1)[1]) >= 1


@verifies(SWR.SWR_126, SWR.SWR_2132)
@pytest.mark.asyncio
async def test_run_child_returns_terminal_response_without_summary_generation() -> None:
    record = make_record()
    conversation = MockConversation(
        events=[
            MockToolEvent("terminal", "pytest -q"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ],
    )

    def factory(agent):
        del agent
        return conversation

    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=FailingSummaryAgent(),
        conversation_factory=factory,
    )

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert result.final_response == FINAL_TEXT
    assert result.summary == "Child completed."


@verifies(SWR.SWR_547, SWR.SWR_2132)
@pytest.mark.asyncio
async def test_run_child_retries_once_then_fails_when_only_housekeeping_tools_run() -> None:
    record = make_record()

    class HousekeepingOnlyConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            self.state.events.append(
                MockMessageEvent(
                    "assistant",
                    ["Intent: Explicit - I will investigate.\n\nI've established the plan."],
                ),
            )
            self.state.events.append(MockToolEvent("todo", "create phased plan"))

    conversation = HousekeepingOnlyConversation()
    scheduler, summary_agent = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert "never executed a task-advancing tool call" in result.summary
    assert result.final_response is None
    assert result.last_response is not None
    assert "established the plan" in result.last_response
    assert conversation.run_count == 2
    assert len(conversation.messages_sent) == 2
    assert "task-advancing tool" in conversation.messages_sent[1]
    assert summary_agent.calls == []
    assert record.state == ChildTaskState.FAILED


@verifies(SWR.SWR_547)
@pytest.mark.asyncio
async def test_run_child_retries_once_then_fails_when_raw_tool_markup_is_emitted() -> None:
    record = make_record()

    class MessageOnlyConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            self.state.events.append(
                MockMessageEvent(
                    "assistant",
                    [
                        "I will inspect the focus styling next. "
                        '<|channel>call:todo{operation:<|">add_phase<|">}<tool_call|>',
                    ],
                ),
            )

    conversation = MessageOnlyConversation()
    scheduler, summary_agent = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert "raw tool-call markup" in result.summary
    assert result.final_response == "I will inspect the focus styling next."
    assert conversation.run_count == 2
    assert len(conversation.messages_sent) == 2
    assert "Do not narrate a tool call in plain text" in conversation.messages_sent[1]
    assert summary_agent.calls == []
    assert record.state == ChildTaskState.FAILED


@verifies(SWR.SWR_548)
@pytest.mark.asyncio
async def test_run_child_allows_orchestrator_message_only_after_recovery() -> None:
    record = make_record(persona="orchestrator")

    class ClarifyingConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            self.state.events.append(
                MockMessageEvent(
                    "assistant",
                    ["Scope unclear. Which session ID should I inspect next?"],
                ),
            )

    conversation = ClarifyingConversation()
    scheduler, summary_agent = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert "direct response" in result.summary
    assert result.final_response == "Scope unclear. Which session ID should I inspect next?"
    assert conversation.run_count == 2
    assert len(conversation.messages_sent) == 2
    assert "task-advancing tool" in conversation.messages_sent[1]
    assert summary_agent.calls == []
    assert record.state == ChildTaskState.RUNNING


class AnswerOnlyConversation(MockConversation):
    """Answers the question, thinks, and terminates — no file edits."""

    ANSWER = "Rotaris is an AI agent orchestration framework."

    def run(self) -> None:
        self.run_count += 1
        self.state.events.append(MockMessageEvent("assistant", [self.ANSWER]))
        self.state.events.append(MockToolEvent("think", "answer-only route"))
        self.state.events.append(MockToolEvent("finish", "Answered the question."))


@verifies(SWR.SWR_2809)
@pytest.mark.asyncio
async def test_run_child_accepts_answer_on_answer_only_route_without_recovery() -> None:
    """A question-intent run must not be failed for not editing files."""
    record = make_record(persona="orchestrator")
    conversation = AnswerOnlyConversation()
    scheduler, summary_agent = make_scheduler(conv=conversation)
    scheduler.run_intent = "question"

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert "routes it to an answer" in result.summary
    # The child ended on `finish`, so the answer rides on `last_response` (SWR-2132).
    assert result.last_response is not None
    assert AnswerOnlyConversation.ANSWER in result.last_response
    assert conversation.run_count == 1
    assert conversation.messages_sent == [] or "task-advancing tool" not in "".join(
        conversation.messages_sent,
    )
    assert summary_agent.calls == []
    assert record.state == ChildTaskState.RUNNING


@verifies(SWR.SWR_2809)
@pytest.mark.asyncio
async def test_run_child_still_fails_same_transcript_on_execution_route() -> None:
    """The guard is route-aware, not disabled: an implementation intent still fails."""
    record = make_record(persona="orchestrator")
    conversation = AnswerOnlyConversation()
    scheduler, _ = make_scheduler(conv=conversation)
    scheduler.run_intent = "large_feature"

    result = await scheduler.run_child(record, agent=object())

    assert conversation.run_count == 2
    assert len(conversation.messages_sent) == 2
    assert "task-advancing tool" in conversation.messages_sent[1]
    # The orchestrator persona keeps its post-recovery direct-response acceptance,
    # so this lands on the message-only path — but only after the corrective prompt
    # was sent, never as a silent success.
    assert "routes it to an answer" not in result.summary


@verifies(SWR.SWR_2809)
@pytest.mark.asyncio
async def test_run_child_fails_answer_only_route_on_malformed_tool_markup() -> None:
    """Raw tool-call markup is a defect on every route, answer-only included."""
    record = make_record(persona="orchestrator")

    class MarkupConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            self.state.events.append(
                MockMessageEvent(
                    "assistant",
                    ['Checking next. <|channel>call:todo{operation:<|">add<|">}<tool_call|>'],
                ),
            )

    conversation = MarkupConversation()
    scheduler, _ = make_scheduler(conv=conversation)
    scheduler.run_intent = "question"

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert "raw tool-call markup" in result.summary
    assert conversation.run_count == 2
    assert record.state == ChildTaskState.FAILED


@verifies(SWR.SWR_2809)
@pytest.mark.asyncio
async def test_run_child_fails_answer_only_route_when_nothing_was_produced() -> None:
    """No final response means nothing to hand back, so the stall still fails."""
    record = make_record(persona="builder")

    class SilentConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            self.state.events.append(MockToolEvent("todo", "create phased plan"))

    conversation = SilentConversation()
    scheduler, _ = make_scheduler(conv=conversation)
    scheduler.run_intent = "question"

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert result.final_response is None
    assert conversation.run_count == 2
    assert record.state == ChildTaskState.FAILED


@verifies(SWR.SWR_2809)
@pytest.mark.asyncio
async def test_run_child_keeps_stall_guard_when_intent_is_unclassified() -> None:
    """An empty run intent must not open the answer-only escape hatch."""
    record = make_record()
    conversation = AnswerOnlyConversation()
    scheduler, _ = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert scheduler.run_intent == ""
    assert result.status == "failed"
    assert "task-advancing tool call" in result.summary
    assert conversation.run_count == 2
    assert record.state == ChildTaskState.FAILED


@verifies(SWR.SWR_549, SWR.SWR_2132)
@pytest.mark.asyncio
async def test_run_child_returns_orchestrator_terminal_response_without_summary_normalization() -> (
    None
):
    record = make_record(persona="orchestrator")
    conversation = MockConversation(
        events=[
            MockToolEvent("delegate", "spawn worker"),
            MockMessageEvent("assistant", ["Work in progress was interrupted"]),
        ],
    )
    report = ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="failed",
        summary="The run was interrupted mid-execution.",
    )
    scheduler, _ = make_scheduler(summary_report=report, conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert result.summary == "Child completed."
    assert result.final_response == "Work in progress was interrupted"


@verifies(SWR.SWR_549, SWR.SWR_2132)
@pytest.mark.asyncio
async def test_run_child_normalizes_failed_to_partial_when_executed_work_with_final_response() -> (
    None
):
    """Completed work returns its direct final response without a summary LLM."""
    record = make_record(persona="builder")
    conversation = MockConversation(
        events=[
            MockToolEvent("write_file", "edit src/app.py"),
            MockToolEvent("terminal", "pytest -q"),
            MockMessageEvent("assistant", ["Tests passed after the fix."]),
        ],
    )
    report = ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="failed",
        summary="The write_file tool encountered an error, but the test passed.",
    )
    scheduler, _ = make_scheduler(summary_report=report, conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert result.final_response == "Tests passed after the fix."


@verifies(SWR.SWR_549, SWR.SWR_2132)
@pytest.mark.asyncio
async def test_run_child_preserves_success_without_a_terminal_response() -> None:
    """Completed work remains succeeded when no assistant text follows its tool call."""
    record = make_record(persona="builder")
    conversation = MockConversation(
        events=[
            MockToolEvent("write_file", "edit src/app.py"),
        ],
    )
    report = ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="failed",
        summary="Something went wrong.",
    )
    scheduler, _ = make_scheduler(summary_report=report, conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert result.final_response is None
    assert result.last_response is None


@pytest.mark.asyncio
@verifies(SWR.SWR_1549)
async def test_run_child_and_mark_terminal_records_terminal_conversation_index(
    tmp_path: Path,
) -> None:
    record = make_record(persona="builder")
    record.conversation_id = "conv-terminal"
    manager = ChildManager("parent", 0, RuntimePolicy())
    manager._children[record.canonical_name] = record
    report = ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="succeeded",
        summary="Done",
    )
    conversation = MockConversation(events=[MockToolEvent("terminal", "pytest -q")])
    scheduler = Scheduler(
        config=make_config(),
        workspace_root=str(tmp_path),
        summary_agent=MockSummaryAgent(report=report),
        conversation_factory=lambda agent, callbacks=None, token_callbacks=None: conversation,
        conversation_persistence_dir=tmp_path,
    )
    agent = SimpleNamespace(llm=SimpleNamespace(model="test-model"))

    result = await scheduler._run_child_and_mark_terminal(
        record,
        agent,
        manager=manager,
        agent_factory=lambda *args, **kwargs: agent,
    )

    assert result.status == "succeeded"
    index_path = tmp_path / "evidence" / "conversations" / "index.json"
    entries = json.loads(index_path.read_text(encoding="utf-8"))["conversations"]
    entry = next(e for e in entries if e["agent_name"] == record.canonical_name)
    assert entry["status"] == "succeeded"


@verifies(SWR.SWR_547)
@pytest.mark.asyncio
async def test_run_child_preserves_failed_when_no_substantive_tool_calls() -> None:
    """Summary LLM returned 'failed' and child only did housekeeping — keep failed."""
    record = make_record(persona="builder")
    conversation = MockConversation(
        events=[
            MockToolEvent("todo", "create phased plan"),
            MockMessageEvent("assistant", ["I've created a plan."]),
        ],
    )
    report = ChildReportArtifact(
        agent_name=record.canonical_name,
        persona=record.persona,
        status="failed",
        summary="No substantive work was completed.",
    )
    scheduler, _ = make_scheduler(summary_report=report, conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"


@verifies(SWR.SWR_547, SWR.SWR_548)
@pytest.mark.asyncio
async def test_run_child_recovers_after_housekeeping_only_first_pass() -> None:
    record = make_record()

    class RecoveringConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            if self.run_count == 1:
                self.state.events.append(
                    MockMessageEvent("assistant", ["Intent: Explicit - I will investigate."]),
                )
                self.state.events.append(MockToolEvent("todo", "create phased plan"))
                return

            self.state.events.append(MockToolEvent("read_file", "read src/app.py"))
            self.state.events.append(MockMessageEvent("assistant", ["Found the bug."]))

    conversation = RecoveringConversation()
    scheduler, summary_agent = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert result.final_response == "Found the bug."
    assert conversation.run_count == 2
    assert len(conversation.messages_sent) == 2
    assert "task-advancing tool" in conversation.messages_sent[1]
    assert summary_agent.calls == []


@verifies(SWR.SWR_131)
@pytest.mark.asyncio
async def test_run_child_recovers_when_conversation_gets_stuck() -> None:
    record = make_record()
    config = make_config()

    class RecoveringStuckConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            if self.run_count == 1:
                self.state.events.append(MockMessageEvent("assistant", ["still planning"]))
                self.state.execution_status = "stuck"
                return

            self.state.execution_status = "running"
            # Include a tool call so transcript produces "executed_work" and falls through
            # to the summary agent (not the stall recovery path).
            self.state.events.append(MockToolEvent("write_file", "apply fix"))
            self.state.events.append(MockMessageEvent("assistant", ["recovered answer"]))

    conversation = RecoveringStuckConversation()
    scheduler, summary_agent = make_scheduler(
        config=config,
        conv=conversation,
        circuit_breaker=MockCircuitBreaker(
            [
                CircuitBreakerActivation(
                    loop_detected=True,
                    corrective_message="Stop repeating the same path and try one different step.",
                ),
            ],
        ),
    )

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert result.final_response == "recovered answer"
    assert record.state == ChildTaskState.RUNNING
    assert conversation.run_count == 2
    assert conversation.messages_sent == [
        "do work",
        "Stop repeating the same path and try one different step.",
    ]
    assert summary_agent.calls == []


@verifies(SWR.SWR_133)
@pytest.mark.asyncio
async def test_run_child_returns_failed_report_when_stuck_recovery_is_exhausted() -> None:
    record = make_record()

    class EscalatingStuckConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            self.state.events.append(
                MockMessageEvent("assistant", [f"still stuck {self.run_count}"]),
            )
            self.state.execution_status = "stuck"

    conversation = EscalatingStuckConversation()
    scheduler, summary_agent = make_scheduler(
        conv=conversation,
        circuit_breaker=MockCircuitBreaker(
            [
                CircuitBreakerActivation(
                    loop_detected=True,
                    corrective_message="Try a different approach.",
                ),
                CircuitBreakerActivation(
                    loop_detected=True,
                    corrective_message="Try a different approach.",
                ),
            ],
        ),
    )

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert result.summary == "Child session aborted after repeated recovery attempts."
    assert result.escalation == EscalationSignal(
        session_id=record.conversation_id or "child",
        consecutive_activation_count=3,
        reason="repeated_loop_detection",
    )
    assert conversation.messages_sent == [
        "do work",
        "Try a different approach.",
        "Try a different approach.",
    ]
    assert record.state == ChildTaskState.FAILED
    assert summary_agent.calls == []


@verifies(SWR.SWR_112, SWR.SWR_135)
@pytest.mark.asyncio
async def test_run_child_returns_failed_report_when_conversation_errors() -> None:
    record = make_record()
    conversation = MockConversation(
        events=[MockMessageEvent("assistant", ["still planning"])],
        execution_status="error",
    )
    scheduler, summary_agent = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert result.summary == "Child stalled: conversation entered ERROR state"
    assert result.final_response == "still planning"
    assert record.state == ChildTaskState.FAILED
    assert summary_agent.calls == []


@pytest.mark.asyncio
@verifies(SWR.SWR_919)
async def test_run_child_skips_condense_for_codex_unsupported_parameter() -> None:
    record = make_record()

    class UnsupportedParameterConversation(MockConversation):
        def run(self) -> None:
            raise LLMBadRequestError("Unsupported parameter: prompt_cache_retention")

        def condense(self) -> None:
            raise AssertionError("condense should not run for unsupported parameters")

    conversation = UnsupportedParameterConversation()
    scheduler, summary_agent = make_scheduler(conv=conversation)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert result.summary == (
        "Child failed: Codex compatibility error: backend rejected parameter "
        "'prompt_cache_retention'. This backend only accepts a reduced Responses "
        "parameter set."
    )
    assert record.state == ChildTaskState.FAILED
    assert summary_agent.calls == []


@verifies(SWR.SWR_901, SWR.SWR_902)
@pytest.mark.asyncio
async def test_run_child_uses_same_tier_fallback_on_rate_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = make_record()
    seen_issues: list[dict[str, object | None]] = []
    factory_calls: list[str] = []

    monkeypatch.setattr(
        Scheduler,
        "_same_tier_fallback_models",
        lambda self, current_model: ["backup-medium"],
    )

    class RateLimitedConversation(MockConversation):
        def run(self) -> None:
            raise LLMRateLimitError("429 Too Many Requests. Retry-After: 30")

    class SuccessfulConversation(MockConversation):
        def run(self) -> None:
            self.state.events.append(MockToolEvent("delegate", "fallback work"))
            self.state.events.append(MockMessageEvent("assistant", [FINAL_TEXT]))

    def conversation_factory(agent, callbacks=None, token_callbacks=None):
        model = getattr(getattr(agent, "llm", None), "model", "")
        if model == "backup-medium":
            return SuccessfulConversation(callbacks=callbacks, token_callbacks=token_callbacks)
        return RateLimitedConversation(callbacks=callbacks, token_callbacks=token_callbacks)

    scheduler = Scheduler(
        config=RotarisConfig(medium_model="primary-medium"),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=conversation_factory,
    )
    scheduler.set_diagnostic_issue_callback(lambda issue: seen_issues.append(issue))

    def agent_factory(persona, runtime_kwargs=None, model_override=None):
        del persona, runtime_kwargs
        if model_override is None:
            raise AssertionError("fallback agent_factory call expected a model override")
        factory_calls.append(model_override)
        return SimpleNamespace(llm=SimpleNamespace(model=model_override))

    primary_agent = SimpleNamespace(llm=SimpleNamespace(model="primary-medium"))
    result = await scheduler.run_child(record, agent=primary_agent, agent_factory=agent_factory)

    assert result.status == "succeeded"
    assert result.final_response == FINAL_TEXT
    assert factory_calls == ["backup-medium"]
    assert [issue["kind"] for issue in seen_issues] == ["quota_fallback"]


@verifies(SWR.SWR_901, SWR.SWR_903)
@pytest.mark.asyncio
async def test_run_child_waits_and_retries_after_provider_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = make_record()
    seen_issues: list[dict[str, object | None]] = []
    wait_attempts: list[int] = []

    def quota_then_success(conversation: MockConversation) -> None:
        if conversation.run_count < 3:
            raise LLMRateLimitError("429 Too Many Requests. Retry-After: 1")
        conversation.state.events.append(MockToolEvent("delegate", "recovered after wait"))
        conversation.state.events.append(MockMessageEvent("assistant", ["all clear"]))

    def fake_quota_wait_seconds(
        self: Scheduler,
        exc: Exception,
        *,
        attempt: int,
    ) -> int:
        del self, exc
        wait_attempts.append(attempt)
        return 0

    monkeypatch.setattr(Scheduler, "_quota_wait_seconds", fake_quota_wait_seconds)

    conversation = MockConversation(on_run=quota_then_success)
    scheduler, _ = make_scheduler(conv=conversation)
    scheduler.set_diagnostic_issue_callback(lambda issue: seen_issues.append(issue))

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert conversation.run_count == 3
    assert wait_attempts == [1, 2]
    assert [issue["metadata"] for issue in seen_issues] == [
        {
            "attempt": 1,
            "model": "?",
            "wait_seconds": 0,
            "allow_auto_resume": True,
            "provider_exhausted": False,
        },
        {
            "attempt": 2,
            "model": "?",
            "wait_seconds": 0,
            "allow_auto_resume": True,
            "provider_exhausted": False,
        },
    ]


@verifies(SWR.SWR_907, SWR.SWR_908)
@pytest.mark.asyncio
async def test_run_child_requires_manual_model_change_after_insufficient_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = make_record()
    seen_issues: list[dict[str, object | None]] = []
    factory_calls: list[str] = []

    monkeypatch.setattr(
        Scheduler,
        "_same_tier_fallback_models",
        lambda self, current_model: [],
    )

    class QuotaConversation(MockConversation):
        def run(self) -> None:
            raise LLMRateLimitError(
                '429 {"error":{"type":"insufficient_quota","code":"insufficient_quota"}}',
            )

    class SuccessfulConversation(MockConversation):
        def run(self) -> None:
            self.state.events.append(MockToolEvent("delegate", "manual fallback"))
            self.state.events.append(MockMessageEvent("assistant", ["manual recovery"]))

    def conversation_factory(agent, callbacks=None, token_callbacks=None):
        model = getattr(getattr(agent, "llm", None), "model", "")
        if model == "manual-medium":
            return SuccessfulConversation(callbacks=callbacks, token_callbacks=token_callbacks)
        return QuotaConversation(callbacks=callbacks, token_callbacks=token_callbacks)

    scheduler = Scheduler(
        config=RotarisConfig(medium_model="primary-medium"),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=conversation_factory,
    )

    def issue_callback(issue: dict[str, object | None]) -> None:
        seen_issues.append(issue)
        asyncio.get_running_loop().call_soon(
            lambda: scheduler.resolve_quota_wait(
                record.canonical_name,
                action="change_model",
                model_override="manual-medium",
            ),
        )

    scheduler.set_diagnostic_issue_callback(issue_callback)

    def agent_factory(persona, runtime_kwargs=None, model_override=None):
        del persona, runtime_kwargs
        if model_override is None:
            raise AssertionError("manual change should provide a model override")
        factory_calls.append(model_override)
        return SimpleNamespace(llm=SimpleNamespace(model=model_override))

    primary_agent = SimpleNamespace(llm=SimpleNamespace(model="primary-medium"))
    result = await scheduler.run_child(record, agent=primary_agent, agent_factory=agent_factory)

    assert result.status == "succeeded"
    assert result.final_response == "manual recovery"
    assert factory_calls == ["manual-medium"]
    assert scheduler._exhausted_provider_models == {"primary-medium"}
    assert seen_issues[0]["metadata"] == {
        "attempt": 1,
        "model": "primary-medium",
        "wait_seconds": 60,
        "allow_auto_resume": False,
        "provider_exhausted": True,
    }


@verifies(SWR.SWR_208)
@pytest.mark.asyncio
async def test_run_child_injects_circuit_breaker_message_and_resumes() -> None:
    record = make_record()
    config = make_config()
    config.circuit_breaker.tool_call_threshold = 1
    config.circuit_breaker.message_count_threshold = 50

    class BreakerConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            if self.run_count == 1:
                tool_event = MockToolEvent("grep", "repeat search")
                self.state.events.append(tool_event)
                for callback in self.callbacks:
                    callback(tool_event)
                self.state.events.append(MockMessageEvent("assistant", ["still circling"]))
                return

            self.state.events.append(MockMessageEvent("assistant", ["final answer"]))

    conversation = BreakerConversation()
    scheduler, _ = make_scheduler(
        config=config,
        conv=conversation,
        circuit_breaker=MockCircuitBreaker(
            [
                CircuitBreakerActivation(
                    loop_detected=True,
                    corrective_message="Stop searching and inspect the target file directly.",
                ),
            ],
        ),
    )

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert result.final_response == "final answer"
    assert conversation.messages_sent == [
        "do work",
        "Stop searching and inspect the target file directly.",
    ]


@verifies(SWR.SWR_216)
@pytest.mark.asyncio
async def test_run_child_passes_only_recent_events_to_circuit_breaker() -> None:
    record = make_record()
    config = make_config()
    config.circuit_breaker.tool_call_threshold = 1
    config.circuit_breaker.message_count_threshold = 50
    config.circuit_breaker.max_recent_events = 5
    breaker = MockCircuitBreaker(
        [
            CircuitBreakerActivation(
                loop_detected=True,
                corrective_message="Use the recent evidence only.",
            ),
        ],
    )

    class BreakerConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            if self.run_count == 1:
                for i in range(30):
                    event = MockToolEvent("grep", f"search {i}")
                    self.state.events.append(event)
                    for callback in self.callbacks:
                        callback(event)
                return

            self.state.events.append(MockMessageEvent("assistant", ["final answer"]))

    conversation = BreakerConversation()
    scheduler, _ = make_scheduler(config=config, conv=conversation, circuit_breaker=breaker)

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    breaker_events = breaker.calls[0]["events"]
    assert len(breaker_events) == 5
    assert [event.action for event in breaker_events] == [f"search {i}" for i in range(25, 30)]


@verifies(SWR.SWR_210)
@pytest.mark.asyncio
async def test_run_child_returns_failed_report_on_circuit_breaker_escalation() -> None:
    record = make_record()
    config = make_config()
    config.circuit_breaker.tool_call_threshold = 1
    config.circuit_breaker.message_count_threshold = 50

    class EscalatingConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            tool_event = MockToolEvent("grep", f"repeat search {self.run_count}")
            self.state.events.append(tool_event)
            for callback in self.callbacks:
                callback(tool_event)
            self.state.events.append(
                MockMessageEvent("assistant", [f"attempt {self.run_count} is still in progress"]),
            )

    conversation = EscalatingConversation()
    breaker = MockCircuitBreaker(
        [
            CircuitBreakerActivation(loop_detected=False, corrective_message=None),
            CircuitBreakerActivation(loop_detected=False, corrective_message=None),
        ],
    )
    scheduler, summary_agent = make_scheduler(
        config=config,
        conv=conversation,
        circuit_breaker=breaker,
    )

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "failed"
    assert result.summary == "Child session aborted after repeated recovery attempts."
    assert result.escalation == EscalationSignal(
        session_id=record.conversation_id or "child",
        consecutive_activation_count=3,
        reason="repeated_loop_detection",
    )
    assert record.state == ChildTaskState.FAILED
    assert summary_agent.calls == []


@verifies(SWR.SWR_643)
@pytest.mark.asyncio
async def test_run_child_streams_conversation_events_to_callback() -> None:
    record = make_record()
    streamed_events = [
        MockToolEvent("grep", "searching docs"),
        MockMessageEvent("assistant", [FINAL_TEXT]),
    ]
    # Pre-seed a tool event so the transcript produces "executed_work" even though
    # run_events are fired as callbacks only (not added to state.events).
    conversation = MockConversation(
        events=[
            MockToolEvent("grep", "searching docs"),
            MockMessageEvent("assistant", [FINAL_TEXT]),
        ],
        run_events=streamed_events,
    )
    received: list[tuple[str, object]] = []
    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent, callbacks=None: MockConversation(
            events=conversation.state.events,
            callbacks=callbacks,
            run_events=streamed_events,
        ),
        conversation_event_callback=lambda child, event: received.append(
            (child.canonical_name, event),
        ),
    )

    result = await scheduler.run_child(record, agent=object())

    assert result.status == "succeeded"
    assert [name for name, _ in received] == ["child", "child"]
    assert isinstance(received[0][1], MockToolEvent)
    assert isinstance(received[1][1], MockMessageEvent)


@verifies(SWR.SWR_1829, SWR.SWR_2454)
@pytest.mark.asyncio
async def test_run_child_puts_what_the_agent_said_on_the_event_stream(tmp_path) -> None:
    """Productive use: a run happening in another process — a CLI run, a headless
    CI run — is watched from somewhere else. Expected outcome: what the agent
    said is on the stream, so the watcher can show the conversation rather than
    only the mechanics of it.

    The emission sits here, below every host, on purpose: a host that installs
    its own conversation callback replaces the one the runner set, so an emitter
    hanging off that callback would emit for some hosts and not others."""
    from rotaris_core.events import register_event_sink, reset_event_registry

    reset_event_registry()
    captured: list[object] = []
    register_event_sink("s-1", captured.append)
    try:
        record = make_record()
        streamed = [MockMessageEvent("agent", ["I fixed the failing assertion."])]
        scheduler = Scheduler(
            config=make_config(),
            workspace_root=str(tmp_path / "workspace"),
            summary_agent=MockSummaryAgent(),
            conversation_persistence_dir=tmp_path
            / "sessions"
            / "s-1"
            / "evidence"
            / "conversations",
            conversation_factory=lambda agent, callbacks=None: MockConversation(
                events=[
                    MockToolEvent("grep", "searching docs"),
                    MockMessageEvent("agent", [FINAL_TEXT]),
                ],
                callbacks=callbacks,
                run_events=streamed,
            ),
        )
        assert scheduler.binding_session_id == "s-1", "the bus key is the session id"

        await scheduler.run_child(record, agent=object())
    finally:
        reset_event_registry()

    said = [event for event in captured if event.event == "agent.message"]
    assert [event.text for event in said] == ["I fixed the failing assertion."]
    assert said[0].agent_name == record.canonical_name
    assert said[0].persona == record.persona


@verifies(SWR.SWR_104, SWR.SWR_111)
@pytest.mark.asyncio
async def test_run_child_executes_delegated_children_and_resumes_parent() -> None:
    manager = make_manager()
    root_record = manager.spawn_child("root", "orchestrator", "coordinate work")
    manager.rebind_parent(root_record.canonical_name)
    root_record.transition(ChildTaskState.RUNNING)

    def root_on_run(conversation: MockConversation) -> None:
        if conversation.run_count == 1:
            manager.spawn_child("worker", "builder", "implement change")
            # Simulate the delegate tool call appearing in the transcript.
            conversation.state.events.append(MockToolEvent("delegate", "spawn worker"))
            conversation.state.events.append(MockMessageEvent("assistant", ["delegating work"]))
        else:
            conversation.state.events.append(MockToolEvent("write_file", "integrate result"))
            conversation.state.events.append(
                MockMessageEvent("assistant", ["final integrated answer"]),
            )

    root_conversation = MockConversation(on_run=root_on_run)
    # Child also needs a tool event to produce "executed_work" and pass through to summary agent.
    child_conversation = MockConversation(
        events=[
            MockToolEvent("terminal", "run tests"),
            MockMessageEvent("assistant", ["worker done"]),
        ],
    )
    conversations = iter([root_conversation, child_conversation])
    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent, callbacks=None: _conversation_with_callbacks(
            next(conversations),
            callbacks,
        ),
    )

    result = await scheduler.run_child(
        root_record,
        agent=object(),
        manager=manager,
        agent_factory=lambda persona: object(),
    )

    assert result.status == "succeeded"
    assert result.final_response == "final integrated answer"
    assert len(root_conversation.messages_sent) == 2
    assert root_conversation.messages_sent[0] == "coordinate work"
    assert "**worker** (builder) [succeeded]" in root_conversation.messages_sent[1]
    assert manager._children["worker"].state == ChildTaskState.SUCCEEDED


@verifies(SWR.SWR_140)
@pytest.mark.asyncio
async def test_run_child_delegate_resume_reminds_parent_of_open_todos() -> None:
    manager = make_manager()
    root_record = manager.spawn_child("root", "orchestrator", "coordinate work")
    manager.rebind_parent(root_record.canonical_name)
    root_record.transition(ChildTaskState.RUNNING)

    def root_on_run(conversation: MockConversation) -> None:
        if conversation.run_count == 1:
            manager.spawn_child("worker", "builder", "implement change")
            conversation.state.events.append(MockToolEvent("delegate", "spawn worker"))
            conversation.state.events.append(MockMessageEvent("assistant", ["delegating work"]))
        else:
            conversation.state.events.append(MockToolEvent("write_file", "integrate result"))
            conversation.state.events.append(
                MockMessageEvent("assistant", ["final integrated answer"]),
            )

    root_conversation = MockConversation(on_run=root_on_run)
    child_conversation = MockConversation(
        events=[
            MockToolEvent("terminal", "run tests"),
            MockMessageEvent("assistant", ["worker done"]),
        ],
    )
    conversations = iter([root_conversation, child_conversation])
    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent, callbacks=None: _conversation_with_callbacks(
            next(conversations),
            callbacks,
        ),
    )

    result = await scheduler.run_child(
        root_record,
        agent=object(),
        manager=manager,
        agent_factory=lambda persona: object(),
        open_todo_items_provider=lambda: ["Review failing tests", "Update orchestrator todo"],
    )

    assert result.status == "succeeded"
    resume_message = root_conversation.messages_sent[1]
    assert "**worker** (builder) [succeeded]" in resume_message
    assert "Your open todo items are:" in resume_message
    assert "Review failing tests" in resume_message
    assert "Update orchestrator todo" in resume_message


@verifies(SWR.SWR_143)
@pytest.mark.asyncio
async def test_run_child_delegate_resume_condenses_bad_request_and_retries() -> None:
    manager = make_manager()
    root_record = manager.spawn_child("root", "orchestrator", "coordinate work")
    manager.rebind_parent(root_record.canonical_name)
    root_record.transition(ChildTaskState.RUNNING)

    class ResumeBadRequestConversation(MockConversation):
        def __init__(self) -> None:
            super().__init__()
            self.condense_calls = 0

        def run(self) -> None:
            self.run_count += 1
            if self.run_count == 1:
                manager.spawn_child("worker", "builder", "implement change")
                self.state.events.append(MockToolEvent("delegate", "spawn worker"))
                self.state.events.append(MockMessageEvent("assistant", ["delegating work"]))
                return
            if self.run_count == 2:
                raise LLMBadRequestError(
                    "Expecting property name enclosed in double quotes: line 1 column 3559",
                )

            self.state.events.append(MockToolEvent("write_file", "integrate result"))
            self.state.events.append(MockMessageEvent("assistant", ["final integrated answer"]))

        def condense(self) -> None:
            self.condense_calls += 1

    root_conversation = ResumeBadRequestConversation()
    child_conversation = MockConversation(
        events=[
            MockToolEvent("terminal", "run tests"),
            MockMessageEvent("assistant", ["worker done"]),
        ],
    )
    conversations = iter([root_conversation, child_conversation])
    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent, callbacks=None: _conversation_with_callbacks(
            next(conversations),
            callbacks,
        ),
    )

    result = await scheduler.run_child(
        root_record,
        agent=object(),
        manager=manager,
        agent_factory=lambda persona: object(),
    )

    assert result.status == "succeeded"
    assert result.final_response == "final integrated answer"
    assert root_conversation.condense_calls == 1
    assert root_conversation.run_count == 3
    assert len(root_conversation.messages_sent) == 2
    assert root_conversation.messages_sent[1].startswith(
        "Child task updates are available. Continue orchestration",
    )


@verifies(SWR.SWR_110)
@pytest.mark.asyncio
async def test_run_child_pauses_parent_after_delegate_to_avoid_stuck_loop() -> None:
    manager = make_manager()
    root_record = manager.spawn_child("root", "orchestrator", "coordinate work")
    manager.rebind_parent(root_record.canonical_name)
    root_record.transition(ChildTaskState.RUNNING)

    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent, callbacks=None: _conversation_with_callbacks(
            next(conversations),
            callbacks,
        ),
    )
    delegate_executor = RotarisDelegateExecutor(
        manager,
        scheduler,
        lambda persona: object(),
    )

    class DelegatingConversation(MockConversation):
        def run(self) -> None:
            self.run_count += 1
            if self.run_count == 1:
                delegate_executor(
                    DelegateAction(
                        persona="builder",
                        task_name="worker",
                        task="implement change",
                        run_in_background=False,
                    ),
                    conversation=self,
                )
                # Record the delegate call as a tool event so progress is "executed_work".
                self.state.events.append(MockToolEvent("delegate", "spawn worker"))
                self.state.events.append(MockMessageEvent("assistant", ["delegating work"]))
                if not self.paused:
                    self.state.execution_status = "stuck"
                return

            self.state.events.append(MockToolEvent("write_file", "integrate result"))
            self.state.events.append(MockMessageEvent("assistant", ["final integrated answer"]))

    root_conversation = DelegatingConversation()
    child_conversation = MockConversation(
        events=[
            MockToolEvent("terminal", "run tests"),
            MockMessageEvent("assistant", ["worker done"]),
        ],
    )
    conversations = iter([root_conversation, child_conversation])

    result = await scheduler.run_child(
        root_record,
        agent=object(),
        manager=manager,
        agent_factory=lambda persona: object(),
    )

    assert result.status == "succeeded"
    assert result.final_response == "final integrated answer"
    assert root_conversation.run_count == 2
    assert root_conversation.paused is True
    assert manager._children["worker"].state == ChildTaskState.SUCCEEDED


def _conversation_with_callbacks(conversation: MockConversation, callbacks) -> MockConversation:
    conversation.callbacks = callbacks or []
    return conversation


@verifies(SWR.SWR_139)
@pytest.mark.asyncio
async def test_spawn_children_sets_ready_records_running_and_creates_tasks():
    manager = make_manager()
    child_a = manager.spawn_child("child_a", "builder", "task a")
    child_b = manager.spawn_child("child_b", "builder", "task b")
    # The children must still be in flight while the assertions look at them, so
    # the conversation blocks until the test releases it; a mock that returned
    # immediately would let a child reach SUCCEEDED before the first assertion.
    still_running = threading.Event()
    scheduler, _ = make_scheduler(conv=MockConversation(on_run=lambda conv: still_running.wait(10)))

    await scheduler.spawn_children(manager, agent_factory=lambda persona: {"persona": persona})

    try:
        assert child_a.state == ChildTaskState.RUNNING
        assert child_b.state == ChildTaskState.RUNNING
        assert set(scheduler._active_tasks) == {"child_a", "child_b"}
    finally:
        still_running.set()
        await scheduler.cancel_children(manager)


@verifies(SWR.SWR_139, SWR.SWR_1042)
@pytest.mark.asyncio
async def test_spawn_children_passes_todo_callback_runtime_kwargs_when_supported():
    manager = make_manager()
    manager.spawn_child("child", "builder", "task")
    scheduler, _ = make_scheduler(conv=MockConversation(delay=0.2))
    seen_runtime_kwargs: dict[str, object] = {}

    def agent_factory(persona, runtime_kwargs=None, model_override=None):
        del persona, model_override
        seen_runtime_kwargs.update(runtime_kwargs or {})
        return object()

    await scheduler.spawn_children(manager, agent_factory=agent_factory)

    assert "todo_state_callback" in seen_runtime_kwargs
    assert callable(seen_runtime_kwargs["todo_state_callback"])

    await scheduler.cancel_children(manager)


@verifies(SWR.SWR_140)
@pytest.mark.asyncio
async def test_inject_notification_reminds_parent_of_open_todos() -> None:
    scheduler, _ = make_scheduler()
    conversation = MockConversation()
    notification = ChildNotification(
        task_id="bg_12345678",
        canonical_name="worker",
        description="implement change",
        state=ChildTaskState.SUCCEEDED,
        duration_s=1.2,
        still_running_count=0,
    )

    await scheduler._inject_notification(
        notification,
        conversation,
        open_todo_items=["Review failing tests", "Update orchestrator todo"],
    )

    message = conversation.messages_sent[0]
    assert "[BACKGROUND TASK COMPLETED]" in message
    assert "All background tasks have completed." in message
    assert "Your open todo items are:" in message
    assert "Review failing tests" in message
    assert "Update orchestrator todo" in message


@pytest.mark.asyncio
@verifies(SWR.SWR_140)
async def test_inject_notification_mentions_published_artifacts() -> None:
    scheduler, _ = make_scheduler()
    conversation = MockConversation()
    notification = ChildNotification(
        task_id="bg_12345678",
        canonical_name="worker",
        description="implement change",
        state=ChildTaskState.SUCCEEDED,
        duration_s=1.2,
        still_running_count=0,
        artifact_ids=["art_12345678"],
    )

    await scheduler._inject_notification(notification, conversation)

    message = conversation.messages_sent[0]
    assert "Published artifacts" in message
    assert "art_12345678" in message


@verifies(SWR.SWR_143)
@pytest.mark.asyncio
async def test_spawn_children_builds_agents_off_main_thread():
    manager = make_manager()
    child = manager.spawn_child("child", "builder", "task")
    scheduler, _ = make_scheduler(conv=MockConversation(delay=0.2))
    created_on_threads: list[int] = []

    def agent_factory(persona):
        assert persona == child.persona
        created_on_threads.append(threading.get_ident())
        return {"persona": persona}

    await scheduler.spawn_children(manager, agent_factory=agent_factory)

    assert child.state == ChildTaskState.RUNNING
    assert created_on_threads
    assert created_on_threads[0] != threading.get_ident()

    await scheduler.cancel_children(manager)


@verifies(SWR.SWR_140)
@pytest.mark.asyncio
async def test_spawn_children_notifies_when_record_starts_running() -> None:
    manager = make_manager()
    child = manager.spawn_child("child", "builder", "task")
    scheduler, _ = make_scheduler(conv=MockConversation(delay=0.2))
    notifications: list[tuple[str, ChildTaskState]] = []

    def _on_spawn(record: ChildTaskRecord) -> None:
        notifications.append((record.canonical_name, record.state))

    scheduler._spawn_notification_callback = _on_spawn

    await scheduler.spawn_children(manager, agent_factory=lambda persona: {"persona": persona})

    assert notifications == [(child.canonical_name, ChildTaskState.RUNNING)]

    await scheduler.cancel_children(manager)


@verifies(SWR.SWR_112)
@pytest.mark.asyncio
async def test_spawn_children_marks_agent_factory_failure_terminal() -> None:
    manager = make_manager()
    child = manager.spawn_child("child", "missing-persona", "task")
    scheduler, _ = make_scheduler()

    def agent_factory(persona):
        raise ValueError(f"Unknown persona: {persona}")

    await scheduler.spawn_children(manager, agent_factory=agent_factory)

    terminal = manager.get_newly_terminal()
    assert len(terminal) == 1
    record, report = terminal[0]
    assert record.canonical_name == child.canonical_name
    assert record.state == ChildTaskState.FAILED
    assert report.status == "failed"
    assert "Unknown persona: missing-persona" in report.summary
    assert scheduler._active_tasks == {}


@verifies(SWR.SWR_115)
def test_validate_conversation_workspace_rejects_mismatch(tmp_path: Path) -> None:
    expected = tmp_path / "expected"
    actual = tmp_path / "actual"
    expected.mkdir()
    actual.mkdir()
    scheduler, _ = make_scheduler()
    scheduler.workspace_root = str(expected)
    conversation = SimpleNamespace(workspace=SimpleNamespace(working_dir=str(actual)))

    with pytest.raises(RuntimeError, match="workspace mismatch"):
        scheduler._validate_conversation_workspace(conversation, make_record())


@verifies(SWR.SWR_112)
@pytest.mark.asyncio
async def test_cancel_children_cancels_active_tasks():
    manager = make_manager()
    child = manager.spawn_child("child", "builder", "task")
    scheduler, _ = make_scheduler(conv=MockConversation(delay=3))
    await scheduler.spawn_children(manager, agent_factory=lambda persona: object())

    task = scheduler._active_tasks[child.canonical_name]
    await scheduler.cancel_children(manager)

    assert task.cancelled() is True
    assert child.state == ChildTaskState.CANCELLED
    assert scheduler._active_tasks == {}


@verifies(SWR.SWR_112)
@pytest.mark.asyncio
async def test_cancel_children_marks_active_children_terminal() -> None:
    manager = make_manager()
    child = manager.spawn_child("child", "builder", "task")
    scheduler, _ = make_scheduler(conv=MockConversation(delay=3))
    await scheduler.spawn_children(manager, agent_factory=lambda persona: object())

    await scheduler.cancel_children(manager)
    terminal = manager.get_newly_terminal()

    assert len(terminal) == 1
    record, report = terminal[0]
    assert record.canonical_name == child.canonical_name
    assert record.state == ChildTaskState.CANCELLED
    assert report.status == "cancelled"


@pytest.mark.asyncio
@verifies(SWR.SWR_112)
async def test_cancel_child_cancels_only_selected_active_task() -> None:
    manager = make_manager()
    first = manager.spawn_child("first", "builder", "task")
    second = manager.spawn_child("second", "builder", "task")
    scheduler, _ = make_scheduler(conv=MockConversation(delay=3))
    await scheduler.spawn_children(manager, agent_factory=lambda persona: object())

    accepted = await scheduler.cancel_child(manager, first.canonical_name)

    assert accepted is True
    assert first.state == ChildTaskState.CANCELLED
    assert second.state == ChildTaskState.RUNNING
    await scheduler.cancel_children(manager)


@pytest.mark.asyncio
@verifies(SWR.SWR_112)
async def test_cancel_child_cancels_queued_child_and_blocks_dependents() -> None:
    manager = make_manager()
    first = manager.spawn_child("first", "builder", "task")
    dependent = manager.spawn_child(
        "dependent",
        "builder",
        "task",
        depends_on=[first.canonical_name],
    )
    scheduler, _ = make_scheduler()

    accepted = await scheduler.cancel_child(manager, first.canonical_name)

    assert accepted is True
    assert first.state == ChildTaskState.CANCELLED
    assert dependent.state == ChildTaskState.BLOCKED


@verifies(SWR.SWR_1025)
def test_default_conversation_factory_uses_persistence_dir(tmp_path, monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    class FakeConversation:
        def __init__(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr("openhands.sdk.LocalConversation", FakeConversation)
    scheduler = Scheduler(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_persistence_dir=tmp_path,
    )

    scheduler._default_conversation_factory(agent=object())

    assert calls
    assert calls[0]["persistence_dir"] == tmp_path / "event_logs"
    assert (tmp_path / "event_logs").is_dir()


@verifies(SWR.SWR_123)
@pytest.mark.asyncio
async def test_request_stop_pauses_and_cancels_inflight_run_child() -> None:
    record = make_record()
    conversation = MockConversation(delay=0.2)
    scheduler, _ = make_scheduler(conv=conversation)

    task = asyncio.create_task(scheduler.run_child(record, agent=object()))
    await asyncio.sleep(0.01)
    scheduler.request_stop(force=False)

    with pytest.raises(asyncio.CancelledError):
        await task

    assert conversation.paused is True
    assert conversation.closed is True


@verifies(SWR.SWR_123)
@pytest.mark.asyncio
async def test_request_stop_force_closes_active_conversation() -> None:
    record = make_record()
    conversation = MockConversation(delay=0.2)
    scheduler, _ = make_scheduler(conv=conversation)

    task = asyncio.create_task(scheduler.run_child(record, agent=object()))
    await asyncio.sleep(0.01)
    scheduler.request_stop(force=True)

    with pytest.raises(asyncio.CancelledError):
        await task

    assert conversation.paused is True
    assert conversation.closed is True


@verifies(SWR.SWR_107, SWR.SWR_128)
@pytest.mark.asyncio
async def test_wait_for_any_terminal_returns_completed_record_with_report():
    manager = make_manager()
    manager.spawn_child("child", "builder", "task")
    scheduler, _ = make_scheduler()
    await scheduler.spawn_children(manager, agent_factory=lambda persona: object())

    terminal = await scheduler.wait_for_any_terminal(manager)

    assert len(terminal) == 1
    record, report = terminal[0]
    assert record.canonical_name == "child"
    assert record.state == ChildTaskState.SUCCEEDED
    assert report.status == "succeeded"
    assert scheduler._active_tasks == {}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("report_status", "expected_state"),
    [
        ("succeeded", ChildTaskState.SUCCEEDED),
        ("partial", ChildTaskState.SUCCEEDED),
        ("blocked", ChildTaskState.BLOCKED),
        ("cancelled", ChildTaskState.CANCELLED),
        ("failed", ChildTaskState.FAILED),
    ],
)
@verifies(SWR.SWR_112)
async def test_wait_for_any_terminal_preserves_non_failure_report_statuses(
    report_status: str,
    expected_state: ChildTaskState,
) -> None:
    manager = make_manager()
    record = manager.spawn_child("child", "builder", "task")
    record.transition(ChildTaskState.RUNNING)
    scheduler, _ = make_scheduler()

    async def _complete() -> ChildReportArtifact:
        return ChildReportArtifact(
            agent_name="child",
            persona="builder",
            status=report_status,
            summary=f"{report_status} summary",
        )

    scheduler._active_tasks[record.canonical_name] = asyncio.create_task(_complete())

    terminal = await scheduler.wait_for_any_terminal(manager)

    assert len(terminal) == 1
    terminal_record, terminal_report = terminal[0]
    assert terminal_record.state == expected_state
    assert manager._children[record.canonical_name].state == expected_state
    assert terminal_report.status == report_status


@verifies(SWR.SWR_112)
@pytest.mark.asyncio
async def test_wait_for_any_terminal_with_no_tasks_returns_manager_newly_terminal():
    manager = make_manager()
    record = manager.spawn_child("child", "builder", "task")
    record.transition(ChildTaskState.RUNNING)
    report = ChildReportArtifact(
        agent_name="child",
        persona="builder",
        status="succeeded",
        summary="Done",
    )
    manager.mark_child_terminal("child", ChildTaskState.SUCCEEDED, report)
    scheduler, _ = make_scheduler()

    terminal = await scheduler.wait_for_any_terminal(manager)

    assert terminal == [(record, report)]


@verifies(SWR.SWR_642)
def test_extract_transcript_events_converts_message_and_tool_events():
    scheduler, _ = make_scheduler()
    events = [
        MockMessageEvent(
            "assistant",
            [
                "line 1",
                'line 2 <|channel>call:todo{operation:<|">add_phase<|">}<tool_call|>',
            ],
        ),
        MockToolEvent("bash", "pytest -q"),
        object(),
    ]

    assert scheduler._extract_transcript_events(events) == [
        {
            "role": "assistant",
            "content": "line 1\nline 2",
            "suppressed_tool_call_markup": True,
        },
        {"role": "tool", "tool_name": "bash", "content": "pytest -q"},
    ]


@verifies(SWR.SWR_642)
def test_extract_transcript_events_suppresses_internal_tool_debug_monologue() -> None:
    scheduler, _ = make_scheduler()
    events = [
        MockMessageEvent(
            "assistant",
            [
                (
                    "I have been failing to provide the required `operation` field in my "
                    "`write_file` calls. The tool documentation specifies each edit must "
                    "include `operation`, so I will use `replace`."
                ),
            ],
        ),
    ]

    assert scheduler._extract_transcript_events(events) == [
        {
            "role": "assistant",
            "content": "",
            "reasoning_only": True,
        },
    ]


@verifies(SWR.SWR_642)
def test_extract_transcript_events_marks_plain_raw_tool_call_as_suppressed() -> None:
    scheduler, _ = make_scheduler()
    events = [
        MockMessageEvent(
            "assistant",
            [
                (
                    'call:terminal{command:grep -r "\\$theme-" '
                    "src/rotaris_core/tui/styles/app.tcss | head -n 20,security_risk:LOW,"
                    "summary:List theme variables to find suitable focus color.}"
                ),
            ],
        ),
    ]

    assert scheduler._extract_transcript_events(events) == [
        {
            "role": "assistant",
            "content": "",
            "suppressed_tool_call_markup": True,
        },
    ]


@verifies(SWR.SWR_547)
def test_assess_transcript_progress_treats_todo_only_as_housekeeping() -> None:
    scheduler, _ = make_scheduler()

    progress = scheduler._assess_transcript_progress(
        [
            {"role": "assistant", "content": "Intent: Explicit - I will investigate."},
            {"role": "tool", "tool_name": "todo", "content": "create phased plan"},
        ],
    )

    assert progress.outcome == "housekeeping_only"
    assert progress.has_substantive_tool_call is False
    assert progress.has_housekeeping_tool_call is True
    assert progress.has_user_visible_message is True


@verifies(SWR.SWR_547)
def test_assess_transcript_progress_detects_suppressed_tool_markup() -> None:
    scheduler, _ = make_scheduler()

    progress = scheduler._assess_transcript_progress(
        [
            {
                "role": "assistant",
                "content": "I will inspect the focus styling next.",
                "suppressed_tool_call_markup": True,
                "reasoning_only": False,
            },
        ],
    )

    assert progress.outcome == "malformed_tool_attempt"
    assert progress.has_suppressed_tool_call_markup is True
    assert progress.has_substantive_tool_call is False


@verifies(SWR.SWR_2808)
def test_assess_transcript_progress_treats_finish_plus_text_as_answered() -> None:
    """Ending a run is a completion signal, not housekeeping."""
    scheduler, _ = make_scheduler()

    progress = scheduler._assess_transcript_progress(
        [
            {"role": "assistant", "content": "Rotaris is an agent orchestration framework."},
            {"role": "tool", "tool_name": "think", "content": "answer-only route"},
            {"role": "tool", "tool_name": "finish", "content": "Answered the question."},
        ],
    )

    assert progress.outcome == "answered"
    assert progress.has_terminal_tool_call is True
    assert progress.has_substantive_tool_call is False


@verifies(SWR.SWR_2808)
def test_assess_transcript_progress_finish_without_text_is_not_answered() -> None:
    """A bare terminator hands nothing back, so it stays a stall."""
    scheduler, _ = make_scheduler()

    progress = scheduler._assess_transcript_progress(
        [
            {"role": "tool", "tool_name": "todo", "content": "create phased plan"},
            {"role": "tool", "tool_name": "FinishTool", "content": "done"},
        ],
    )

    assert progress.outcome == "housekeeping_only"
    assert progress.has_terminal_tool_call is True


@verifies(SWR.SWR_2808)
def test_assess_transcript_progress_substantive_tool_outranks_finish() -> None:
    scheduler, _ = make_scheduler()

    progress = scheduler._assess_transcript_progress(
        [
            {"role": "tool", "tool_name": "write_file", "content": "src/x.py"},
            {"role": "assistant", "content": "Edited the module."},
            {"role": "tool", "tool_name": "finish", "content": "done"},
        ],
    )

    assert progress.outcome == "executed_work"
    assert progress.has_substantive_tool_call is True


@verifies(SWR.SWR_547, SWR.SWR_551)
def test_assess_transcript_progress_with_session_fixture_detects_housekeeping_only() -> None:
    scheduler, _ = make_scheduler()
    fixture_path = Path(__file__).resolve().parent.parent / "fixtures" / "f62432f855bf.json"
    payload = json.loads(fixture_path.read_text())

    progress = scheduler._assess_transcript_progress(payload["transcript_events"])

    assert progress.outcome == "housekeeping_only"
    assert progress.has_housekeeping_tool_call is True
    assert progress.has_substantive_tool_call is False
    assert progress.final_response is None


@verifies(SWR.SWR_104, SWR.SWR_143)
@pytest.mark.asyncio
async def test_full_flow_spawns_two_children_and_collects_reports():
    manager = make_manager()
    manager.spawn_child("child_a", "builder", "task a")
    manager.spawn_child("child_b", "reviewer", "task b")
    scheduler, _ = make_scheduler()

    await scheduler.spawn_children(manager, agent_factory=lambda persona: {"persona": persona})

    collected = []
    while not manager.all_terminal:
        collected.extend(await scheduler.wait_for_any_terminal(manager))

    assert {record.canonical_name for record, _ in collected} == {"child_a", "child_b"}
    assert all(record.state == ChildTaskState.SUCCEEDED for record, _ in collected)
    assert all(report.status == "succeeded" for _, report in collected)
    assert scheduler._active_tasks == {}


@verifies(SWR.SWR_547)
@pytest.mark.asyncio
async def test_run_child_logs_stall_warning_when_no_events_arrive(
    caplog,
    monkeypatch: pytest.MonkeyPatch,
):
    """When the conversation.run thread is silent for stall_timeout seconds the
    watchdog must log a STALLED warning. The hard timeout still enforces a kill.
    """
    import logging

    cfg = RotarisConfig(runtime=RuntimePolicy(child_timeout=2, child_stall_timeout=1))

    conv = MockConversation()
    scheduler, _ = make_scheduler(config=cfg, conv=conv)
    record = make_record()
    last_activity = [0.0]

    with caplog.at_level(logging.WARNING, logger="rotaris_core.orchestrator.scheduler"):
        await _run_watchdog_with_virtual_time(
            monkeypatch,
            scheduler,
            conv,
            record,
            last_activity,
            stall_timeout_override=1,
            release_after_sleep=1,
        )

    stall_msgs = [
        rec
        for rec in caplog.records
        if "STALLED" in rec.getMessage() and record.canonical_name in rec.getMessage()
    ]
    assert stall_msgs, "expected at least one STALLED warning log entry"


@verifies(SWR.SWR_547)
@pytest.mark.asyncio
async def test_watchdog_does_not_label_active_tool_as_llm_stall(
    caplog,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import logging

    cfg = RotarisConfig(runtime=RuntimePolicy(child_timeout=2, child_stall_timeout=1))

    conv = MockConversation()
    scheduler, _ = make_scheduler(config=cfg, conv=conv)
    record = make_record()
    last_activity = [0.0]

    with caplog.at_level(logging.INFO, logger="rotaris_core.orchestrator.scheduler"):
        await _run_watchdog_with_virtual_time(
            monkeypatch,
            scheduler,
            conv,
            record,
            last_activity,
            stall_timeout_override=1,
            release_after_sleep=1,
            active_tool_call_ids={"terminal-call"},
        )

    messages = [rec.getMessage() for rec in caplog.records]
    assert not any("STALLED" in message for message in messages)
    assert any("waiting on 1 active tool call" in message for message in messages)


@verifies(SWR.SWR_548)
@pytest.mark.asyncio
async def test_stall_callback_invoked_on_stall_and_recovery(
    monkeypatch: pytest.MonkeyPatch,
):
    """The scheduler must invoke ``stall_callback`` with phase='stalled' when the
    watchdog fires, and 'recovered' when activity resumes before completion.
    """
    cfg = RotarisConfig(runtime=RuntimePolicy(child_timeout=4, child_stall_timeout=1))

    conv = MockConversation()
    events: list[tuple[str, str, float]] = []

    def _cb(record, elapsed, phase):
        events.append((record.canonical_name, phase, elapsed))

    scheduler, _ = make_scheduler(config=cfg, conv=conv)
    scheduler._stall_callback = _cb
    record = make_record()
    last_activity = [0.0]

    def _recover_on_second_tick(_sleep_count, clock, _release, last_seen):
        if _sleep_count == 2:
            last_seen[0] = clock["now"]

    await _run_watchdog_with_virtual_time(
        monkeypatch,
        scheduler,
        conv,
        record,
        last_activity,
        stall_timeout_override=1,
        release_after_sleep=2,
        on_sleep=_recover_on_second_tick,
    )

    phases = [phase for _, phase, _ in events]
    assert "stalled" in phases, f"expected 'stalled' phase, got {phases}"
    assert "recovered" in phases, f"expected 'recovered' phase, got {phases}"


@verifies(SWR.SWR_1711)
@pytest.mark.asyncio
async def test_per_persona_stall_timeout_overrides_global(caplog, monkeypatch: pytest.MonkeyPatch):
    """When ``PersonaConfig.stall_timeout`` is set, the watchdog uses it instead
    of ``runtime.child_stall_timeout``.
    """
    import logging

    from rotaris_core.config.schema import PersonaConfig

    persona_cfg = PersonaConfig(
        name="builder",
        model="m",
        stall_timeout=10,  # high → no stall during a brief silence
    )
    cfg = RotarisConfig(
        runtime=RuntimePolicy(child_timeout=3, child_stall_timeout=1),
        personas={"builder": persona_cfg},
    )

    conv = MockConversation()
    scheduler, _ = make_scheduler(config=cfg, conv=conv)
    record = make_record()
    last_activity = [0.0]

    with caplog.at_level(logging.WARNING, logger="rotaris_core.orchestrator.scheduler"):
        await _run_watchdog_with_virtual_time(
            monkeypatch,
            scheduler,
            conv,
            record,
            last_activity,
            stall_timeout_override=10,
            release_after_sleep=1,
        )

    # Per-persona stall_timeout=10s → no STALLED warning during a 1.5s pause.
    stall_msgs = [r for r in caplog.records if "STALLED" in r.getMessage()]
    assert not stall_msgs, (
        f"per-persona stall_timeout=10 should suppress warnings; got: {stall_msgs}"
    )


@verifies(SWR.SWR_203)
@pytest.mark.asyncio
async def test_fallback_model_retries_once_on_hard_timeout():
    """When the child hits the hard child_timeout AND the persona has a
    ``fallback_model``, the scheduler must retry once with a new agent built
    via the supplied ``agent_factory(persona, runtime_kwargs, model_override)``.
    """
    from rotaris_core.config.schema import PersonaConfig

    persona_cfg = PersonaConfig(
        name="builder",
        model="primary",
        fallback_model="backup",
    )
    cfg = RotarisConfig(
        runtime=RuntimePolicy(child_timeout=1, child_stall_timeout=10),
        personas={"builder": persona_cfg},
    )

    factory_calls: list[str | None] = []

    class FastConversation(MockConversation):
        def run(self):
            self.state.events.append(MockToolEvent("delegate", "fallback work"))

    conv_holder = {"primary_used": False}

    def factory(agent, callbacks=None, token_callbacks=None):
        # First conversation hangs (primary), second succeeds (fallback).
        if not conv_holder["primary_used"]:
            conv_holder["primary_used"] = True
            c = MockConversation()
        else:
            c = FastConversation()
        c.callbacks = callbacks or []
        c.token_callbacks = token_callbacks or []
        return c

    summary_agent = MockSummaryAgent()
    scheduler = Scheduler(
        config=cfg,
        workspace_root="/tmp/test",
        summary_agent=summary_agent,
        conversation_factory=factory,
    )
    call_count = 0

    async def _timeout_then_succeed(
        conversation,
        record,
        last_activity,
        stall_timeout_override=None,
        on_steering_injected=None,
        active_tool_call_ids=None,
        recent_tool_calls=None,
        last_llm_event_type=None,
    ):
        del (
            record,
            last_activity,
            stall_timeout_override,
            on_steering_injected,
            active_tool_call_ids,
            recent_tool_calls,
            last_llm_event_type,
        )
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise TimeoutError
        conversation.run()

    scheduler._run_with_stall_watchdog = _timeout_then_succeed

    def agent_factory(persona, runtime_kwargs=None, model_override=None):
        factory_calls.append(model_override)
        return object()

    record = make_record()
    report = await scheduler.run_child(
        record,
        agent=object(),
        agent_factory=agent_factory,
    )

    assert factory_calls == ["backup"], (
        f"expected one fallback factory call with 'backup', got {factory_calls}"
    )
    assert report.status == "succeeded", (
        f"fallback retry should succeed; got status={report.status}"
    )


@verifies(SWR.SWR_203)
@pytest.mark.asyncio
async def test_run_child_retries_transient_llm_runtime_error_once() -> None:
    cfg = RotarisConfig(runtime=RuntimePolicy(auto_retries_transient=1))
    conversation = MockConversation()
    scheduler, _ = make_scheduler(config=cfg, conv=conversation)
    call_count = 0

    class MidStreamFallbackError(RuntimeError):
        pass

    async def _transient_then_succeed(
        conversation,
        record,
        last_activity,
        stall_timeout_override=None,
        on_steering_injected=None,
        active_tool_call_ids=None,
        recent_tool_calls=None,
        last_llm_event_type=None,
    ):
        del record, last_activity, stall_timeout_override, on_steering_injected
        del active_tool_call_ids, recent_tool_calls, last_llm_event_type
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise MidStreamFallbackError(
                "APIConnectionError: peer closed connection without sending complete "
                "message body (incomplete chunked read)",
            )
        conversation.state.events.append(MockToolEvent("delegate", "recovered work"))

    scheduler._run_with_stall_watchdog = _transient_then_succeed

    report = await scheduler.run_child(make_record(), agent=object())

    assert call_count == 2
    assert report.status == "succeeded"


@verifies(SWR.SWR_162)
def test_graceful_pause_delegates_to_conversation_control(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scheduler, _ = make_scheduler()
    seen: dict[str, object] = {}

    def fake_graceful_pause(
        conversation,
        canonical_name,
        *,
        registry,
        tool_deadline,
        force_close_when_stuck=False,
        force_close_on_deadline=True,
        poll_interval=0.5,
    ):
        del poll_interval
        seen.update(
            conversation=conversation,
            canonical_name=canonical_name,
            registry=registry,
            tool_deadline=tool_deadline,
            force_close_when_stuck=force_close_when_stuck,
            force_close_on_deadline=force_close_on_deadline,
        )

    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler.graceful_pause_conversation",
        fake_graceful_pause,
    )
    conv = MockConversation()
    scheduler._graceful_pause_conversation(conv, "child-x", force_close_when_stuck=True)

    assert seen["conversation"] is conv
    assert seen["canonical_name"] == "child-x"
    assert seen["registry"] is scheduler._tool_activity
    assert seen["force_close_when_stuck"] is True
    assert seen["force_close_on_deadline"] is True
    assert seen["tool_deadline"] == float(scheduler.config.runtime.graceful_pause_tool_deadline)


@verifies(SWR.SWR_548)
def test_wait_and_child_resume_messages_share_report_line_format() -> None:
    scheduler, _ = make_scheduler()
    record = ChildTaskRecord(
        name="worker",
        canonical_name="worker",
        persona="builder",
        task_payload="inspect",
    )
    report = ChildReportArtifact(
        agent_name="worker",
        persona="builder",
        status="succeeded",
        summary="Did the thing",
        key_findings="Detail line",
        final_response="Detail line",
    )

    child_message = scheduler._build_child_resume_message([(record, report)])
    wait_message = scheduler._build_wait_resume_message([(record, report)])

    expected_bullet = "- **worker** (builder) [succeeded]"
    assert expected_bullet in child_message
    assert expected_bullet in wait_message
    assert "Result from worker:\nDetail line" in child_message
    assert "Result from worker:\nDetail line" in wait_message


@verifies(SWR.SWR_107)
@pytest.mark.asyncio
async def test_wait_for_any_terminal_only_names_ignores_other_tasks() -> None:
    manager = make_manager()
    fresh = manager.spawn_child("fresh-child", "builder", "task")
    fresh.transition(ChildTaskState.RUNNING)
    outer = manager.spawn_child("outer-parent", "orchestrator", "coordinate")
    outer.transition(ChildTaskState.RUNNING)
    scheduler, _ = make_scheduler()

    async def _complete_fresh() -> ChildReportArtifact:
        return ChildReportArtifact(
            agent_name="fresh-child",
            persona="builder",
            status="succeeded",
            summary="Done",
        )

    never_done: asyncio.Future[ChildReportArtifact] = asyncio.get_running_loop().create_future()

    async def _never() -> ChildReportArtifact:
        return await never_done

    scheduler._active_tasks["fresh-child"] = asyncio.create_task(_complete_fresh())
    outer_task = asyncio.create_task(_never())
    scheduler._active_tasks["outer-parent"] = outer_task

    terminal = await scheduler.wait_for_any_terminal(manager, only_names={"fresh-child"})

    names = [record.canonical_name for record, _ in terminal]
    assert names == ["fresh-child"]
    # The unfiltered (outer) task must not have been awaited or completed.
    assert not outer_task.done()
    outer_task.cancel()


@verifies(SWR.SWR_2426, SWR.SWR_2427)
@pytest.mark.asyncio
async def test_spawn_children_binds_tools_per_child_not_last_created(tmp_path: Path) -> None:
    """Productive use: two children of one persona spawned in the same pass each publish
    artifacts under their own name.
    Expected outcome: resolving each child's tools after both agents exist yields
    executors carrying that child's canonical name and task id."""
    from openhands.sdk.llm.llm import LLM
    from openhands.sdk.tool.registry import resolve_tool

    from rotaris_core.agents.factory import create_agent_for_persona
    from rotaris_core.config.schema import PersonaConfig

    store = SessionArtifactStore(tmp_path)
    manager = make_manager()
    first = manager.spawn_child("run-architecture", "analyst", "map the architecture")
    second = manager.spawn_child("run-tests-ui", "analyst", "map the UI tests")

    persona = PersonaConfig(
        name="analyst",
        model="gpt-4o",
        system_prompt="analyse",
        tools=["artifact_read", "artifact_write"],
        can_publish_artifacts=True,
    )
    config = RotarisConfig(personas={persona.name: persona})
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")
    agents: dict[str, object] = {}

    def agent_factory(persona_name, runtime_kwargs=None, model_override=None):
        del persona_name, model_override
        kwargs = dict(runtime_kwargs or {})
        kwargs["artifact_store"] = store
        agent = create_agent_for_persona(persona, config, runtime_kwargs=kwargs)(llm)
        agents[kwargs["child_canonical_name"]] = agent
        return agent

    scheduler, _ = make_scheduler(conv=MockConversation(delay=0.2), artifact_store=store)

    # Both agents are constructed here; tools are only resolved afterwards, the
    # way the SDK defers resolution to conversation start.
    await scheduler.spawn_children(manager, agent_factory=agent_factory)

    for record in (first, second):
        agent = agents[record.canonical_name]
        spec = next(t for t in agent.tools if t.name == "artifact_write")
        executor = resolve_tool(spec, None)[0].executor
        assert executor.canonical_name == record.canonical_name
        assert executor.task_id == record.task_id

    await scheduler.cancel_children(manager)
