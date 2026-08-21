from __future__ import annotations

import asyncio
import time
from collections import deque
from threading import Event, Lock
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator import (
    ChildManager,
    ChildTaskRecord,
    ChildTaskState,
    DelegateAction,
    RotarisDelegateExecutor,
    RotarisDelegateTool,
    Scheduler,
)
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.testing.lorem import LoremMarkdownGenerator
from rotaris_core.tools.wait_for_tasks import WaitForTasksAction, WaitForTasksExecutor

_lorem = LoremMarkdownGenerator(seed=314)
CHILD_FINAL_TEXT = _lorem.markdown(words=70)
TEXT_A = _lorem.markdown(words=25)
TEXT_B = _lorem.markdown(words=25)
TEXT_FAILED = _lorem.markdown(words=15)
TEXT_PIPELINE = _lorem.markdown(words=40)
TEXT_BG = _lorem.markdown(words=30)
TEXT_FAST = _lorem.markdown(words=12)
TEXT_SLOW = _lorem.markdown(words=12)
TEXT_FIRST = _lorem.markdown(words=20)
TEXT_SECOND = _lorem.markdown(words=20)

if TYPE_CHECKING:
    from collections.abc import Callable


class MockState:
    def __init__(self, events: list[object] | None = None):
        self.events = events or []


class MockTextPart:
    def __init__(self, text: str):
        self.text = text


class MockLLMMessage:
    def __init__(self, content: list[MockTextPart]):
        self.content = content


class MockMessageEvent:
    def __init__(self, source: str, texts: list[str]):
        self.source = source
        self.llm_message = MockLLMMessage([MockTextPart(text) for text in texts])


class MockToolEvent:
    def __init__(self, tool_name: str = "bash", action: str = ""):
        self.tool_name = tool_name
        self.action = action


class ConcurrencyTracker:
    def __init__(self):
        self._lock = Lock()
        self.current = 0
        self.max_active = 0

    def enter(self) -> None:
        with self._lock:
            self.current += 1
            self.max_active = max(self.max_active, self.current)

    def exit(self) -> None:
        with self._lock:
            self.current -= 1


class MockConversation:
    def __init__(
        self,
        *,
        events: list[object] | None = None,
        should_fail: bool = False,
        delay: float = 0,
        tracker: ConcurrencyTracker | None = None,
    ):
        self.state = MockState(events)
        self.should_fail = should_fail
        self.delay = delay
        self.tracker = tracker
        self.closed = False
        self.paused = False
        self.message_sent: str | None = None

    def send_message(self, msg: str) -> None:
        self.message_sent = msg

    def run(self) -> None:
        if self.tracker is not None:
            self.tracker.enter()
        try:
            if self.delay:
                time.sleep(self.delay)
            if self.should_fail:
                raise RuntimeError("Agent failed")
        finally:
            if self.tracker is not None:
                self.tracker.exit()

    def pause(self) -> None:
        self.paused = True

    def close(self) -> None:
        self.closed = True


class BlockingConversation(MockConversation):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.started = Event()
        self.release = Event()

    def run(self) -> None:
        if self.tracker is not None:
            self.tracker.enter()
        try:
            self.started.set()
            self.release.wait(timeout=1)
            if self.should_fail:
                raise RuntimeError("Agent failed")
        finally:
            if self.tracker is not None:
                self.tracker.exit()

    def pause(self) -> None:
        self.paused = True
        self.release.set()

    def close(self) -> None:
        self.closed = True
        self.release.set()


async def _raise_timeout(*args, **kwargs) -> None:
    del args, kwargs
    raise TimeoutError


class MockSummaryAgent:
    def __init__(self, statuses: dict[str, str] | None = None):
        self.statuses = statuses or {}
        self.calls: list[tuple[str, list[dict[str, str]]]] = []

    async def generate_report(
        self,
        record: ChildTaskRecord,
        transcript: list[dict[str, str]],
        *,
        fallback_status: str = "failed",
    ) -> ChildReportArtifact:
        self.calls.append((record.canonical_name, transcript, fallback_status))
        status = self.statuses.get(record.canonical_name, "succeeded")
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status=status,
            summary=f"{record.canonical_name} {status}",
        )


class ConversationFactory:
    def __init__(self, conversations: list[MockConversation]):
        self._conversations = deque(conversations)

    def __call__(self, agent: object) -> MockConversation:
        del agent
        return self._conversations.popleft()


class AgentStub:
    def __init__(self, persona: str):
        self.persona = persona


def make_manager(policy: RuntimePolicy | None = None) -> ChildManager:
    return ChildManager(
        parent_agent_id="parent",
        current_depth=0,
        policy=policy or RuntimePolicy(max_children=8, max_depth=3),
    )


def make_scheduler(
    *,
    child_timeout: int = 10,
    conversations: list[MockConversation] | None = None,
    statuses: dict[str, str] | None = None,
) -> tuple[Scheduler, MockSummaryAgent]:
    scheduler = Scheduler(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=child_timeout)),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(statuses=statuses),
        conversation_factory=ConversationFactory(conversations or [MockConversation()]),
    )
    summary_agent = scheduler.summary_agent
    return scheduler, summary_agent


def make_agent(persona: str) -> AgentStub:
    return AgentStub(persona)


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
@verifies(SWR.SWR_2132)
async def test_single_child_delegation_e2e_succeeds_with_report() -> None:
    """Productive use: a parent delegates work and receives the child’s usable result.
    Expected outcome: real scheduler wiring completes without a terminal summary call."""
    manager = make_manager()
    conversation = MockConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [CHILD_FINAL_TEXT])],
    )
    scheduler, summary_agent = make_scheduler(conversations=[conversation])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)

    observation = executor(
        DelegateAction(persona="builder", task_name="child", task="finish feature"),
    )

    await scheduler.spawn_children(manager, make_agent)
    terminal = await scheduler.wait_for_any_terminal(manager)

    assert observation.status == "queued"
    assert len(terminal) == 1
    record, report = terminal[0]
    assert record.canonical_name == "child"
    assert record.state == ChildTaskState.SUCCEEDED
    assert report.status == "succeeded"
    assert report.summary == "Child completed."
    assert conversation.message_sent is not None
    assert conversation.message_sent.startswith("AUTHORITATIVE WORKSPACE ROOT:\n")
    assert conversation.message_sent.endswith("\n\nfinish feature")
    assert conversation.closed is True
    assert summary_agent.calls == []


@verifies(SWR.SWR_2808, SWR.SWR_2809)
@pytest.mark.asyncio
async def test_question_intent_delegation_succeeds_without_a_task_advancing_tool() -> None:
    """Productive use: a user asks what the codebase does and gets an answer back.

    Expected outcome: the run the playbook routed to `answer-only` completes through
    the real delegate → scheduler → report path, with no corrective prompt sent for
    the file edits that route forbids.
    """
    manager = make_manager()
    conversation = MockConversation(
        events=[
            MockMessageEvent("assistant", [CHILD_FINAL_TEXT]),
            MockToolEvent("think", "answer-only route"),
            MockToolEvent("finish", "Answered the question."),
        ],
    )
    scheduler, summary_agent = make_scheduler(conversations=[conversation])
    scheduler.run_intent = "question"
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)

    executor(
        DelegateAction(
            persona="orchestrator",
            task_name="child",
            task="what does this codebase do?",
        ),
    )

    await scheduler.spawn_children(manager, make_agent)
    terminal = await scheduler.wait_for_any_terminal(manager)

    assert len(terminal) == 1
    record, report = terminal[0]
    assert record.state == ChildTaskState.SUCCEEDED
    assert report.status == "succeeded"
    assert "routes it to an answer" in report.summary
    assert report.last_response is not None
    assert CHILD_FINAL_TEXT in report.last_response
    # The conversation ran once: no recovery prompt contradicting the route.
    assert conversation.message_sent is not None
    assert "task-advancing tool" not in conversation.message_sent
    assert summary_agent.calls == []


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_two_parallel_children_run_concurrently_and_both_succeed() -> None:
    manager = make_manager()
    tracker = ConcurrencyTracker()
    scheduler, _ = make_scheduler(
        conversations=[
            MockConversation(delay=0.2, tracker=tracker, events=[MockToolEvent("bash")]),
            MockConversation(delay=0.2, tracker=tracker, events=[MockToolEvent("bash")]),
        ],
    )
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)

    executor(DelegateAction(persona="builder", task_name="child_a", task="task a"))
    executor(DelegateAction(persona="reviewer", task_name="child_b", task="task b"))

    await scheduler.spawn_children(manager, make_agent)
    collected: list[tuple[ChildTaskRecord, ChildReportArtifact]] = []
    while not manager.all_terminal:
        collected.extend(await scheduler.wait_for_any_terminal(manager))

    assert scheduler._active_tasks == {}
    assert tracker.max_active == 2
    assert {record.canonical_name for record, _ in collected} == {"child_a", "child_b"}
    assert all(record.state == ChildTaskState.SUCCEEDED for record, _ in collected)
    assert all(report.status == "succeeded" for _, report in collected)


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_dependency_chain_promotes_ready_child_after_parent_success() -> None:
    manager = make_manager()
    scheduler, summary_agent = make_scheduler(
        conversations=[
            MockConversation(
                events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_A])],
            ),
            MockConversation(
                events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_B])],
            ),
        ],
    )
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)

    first = executor(DelegateAction(persona="builder", task_name="A", task="task A"))
    second = executor(
        DelegateAction(
            persona="reviewer",
            task_name="B",
            task="task B",
            depends_on=["A"],
        ),
    )

    await scheduler.spawn_children(manager, make_agent)
    first_terminal = await scheduler.wait_for_any_terminal(manager)
    second_terminal = await scheduler.wait_for_any_terminal(manager)

    assert first.status == "queued"
    assert second.status == "waiting_on_dependencies"
    assert scheduler._active_tasks == {}
    assert first_terminal[0][0].canonical_name == "A"
    assert first_terminal[0][0].state == ChildTaskState.SUCCEEDED
    assert second_terminal[0][0].canonical_name == "B"
    assert second_terminal[0][0].state == ChildTaskState.SUCCEEDED
    assert summary_agent.calls == []


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_dependency_failure_cascades_to_blocked_child() -> None:
    manager = make_manager()
    scheduler, _ = make_scheduler(
        conversations=[MockConversation(events=[MockMessageEvent("assistant", [TEXT_FAILED])])],
        statuses={"A": "failed"},
    )
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)

    executor(DelegateAction(persona="builder", task_name="A", task="task A"))
    waiting = executor(
        DelegateAction(
            persona="reviewer",
            task_name="B",
            task="task B",
            depends_on=["A"],
        ),
    )

    await scheduler.spawn_children(manager, make_agent)
    terminal = await scheduler.wait_for_any_terminal(manager)
    summaries = {
        item["canonical_name"]: item["state"] for item in manager.get_all_children_summary()
    }

    assert waiting.status == "waiting_on_dependencies"
    assert len(terminal) == 1
    assert terminal[0][0].canonical_name == "A"
    assert terminal[0][0].state == ChildTaskState.FAILED
    assert terminal[0][1].status == "failed"
    assert manager._children["B"].state == ChildTaskState.BLOCKED
    assert summaries == {"A": "failed", "B": "blocked"}
    assert manager.all_terminal is True


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_timeout_marks_child_failed_and_returns_timeout_report() -> None:
    manager = make_manager()
    conversation = MockConversation()
    scheduler, summary_agent = make_scheduler(child_timeout=1, conversations=[conversation])
    scheduler._run_with_stall_watchdog = _raise_timeout
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)

    executor(DelegateAction(persona="builder", task_name="slow_child", task="slow task"))

    await scheduler.spawn_children(manager, make_agent)
    terminal = await scheduler.wait_for_any_terminal(manager)

    assert len(terminal) == 1
    record, report = terminal[0]
    assert record.canonical_name == "slow_child"
    assert record.state == ChildTaskState.FAILED
    assert report.status == "failed"
    assert report.summary == "Child timed out after 1s"
    assert conversation.paused is True
    assert conversation.closed is True
    assert summary_agent.calls == []


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_cancel_children_cancels_all_active_conversations() -> None:
    manager = make_manager()
    first_conversation = BlockingConversation()
    second_conversation = BlockingConversation()
    scheduler, _ = make_scheduler(conversations=[first_conversation, second_conversation])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)

    executor(DelegateAction(persona="builder", task_name="child_a", task="task a"))
    executor(DelegateAction(persona="reviewer", task_name="child_b", task="task b"))

    await scheduler.spawn_children(manager, make_agent)
    assert await asyncio.to_thread(first_conversation.started.wait, 1)
    assert await asyncio.to_thread(second_conversation.started.wait, 1)
    active_tasks = list(scheduler._active_tasks.values())
    await scheduler.cancel_children(manager)

    assert all(task.cancelled() for task in active_tasks)
    assert scheduler._active_tasks == {}
    assert first_conversation.paused is True
    assert second_conversation.paused is True
    assert first_conversation.closed is True
    assert second_conversation.closed is True


@verifies(SWR.SWR_104, SWR.SWR_554)
@pytest.mark.asyncio
async def test_delegate_tool_create_pipeline_runs_end_to_end() -> None:
    """Productive use: an orchestrator delegates through the tool named in its prompt.
    Expected outcome: the created runtime tool is named `delegate` and the child completes.
    """
    manager = make_manager()
    conversation = MockConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_PIPELINE])],
    )
    scheduler, _ = make_scheduler(conversations=[conversation])
    tools = RotarisDelegateTool.create(
        child_manager=manager,
        scheduler=scheduler,
        agent_factory=make_agent,
    )

    observation = tools[0].executor(
        DelegateAction(persona="builder", task_name="tool_child", task="pipeline task"),
    )
    await scheduler.spawn_children(manager, make_agent)
    terminal = await scheduler.wait_for_any_terminal(manager)

    assert len(tools) == 1
    assert tools[0].name == "delegate"
    assert observation.canonical_name == "tool_child"
    assert observation.status == "queued"
    assert len(terminal) == 1
    assert terminal[0][0].canonical_name == "tool_child"
    assert terminal[0][0].state == ChildTaskState.SUCCEEDED
    assert terminal[0][1].status == "succeeded"
    assert conversation.message_sent is not None
    assert conversation.message_sent.startswith("AUTHORITATIVE WORKSPACE ROOT:\n")
    assert conversation.message_sent.endswith("\n\npipeline task")


# ---------------------------------------------------------------------------
# Drives a background child through the scheduler's background-drain path and
# verifies a [BACKGROUND TASK COMPLETED] notification is injected into the
# parent conversation without invoking conversation.run().
# ---------------------------------------------------------------------------


class _RecordingConversation(MockConversation):
    """Conversation stub that retains every message sent and counts run() calls."""

    def __init__(self, **kwargs: object) -> None:
        super().__init__(**kwargs)
        self.sent_messages: list[str] = []
        self.run_call_count = 0

    def send_message(self, msg: str) -> None:
        super().send_message(msg)
        self.sent_messages.append(msg)

    def run(self) -> None:
        self.run_call_count += 1
        super().run()


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_background_child_completion_injects_notification_into_parent_e2e() -> None:
    """REQ-20260416-120000-007: a background-flagged child reaching SUCCEEDED
    state during the background drain must result in a notification message
    being injected into the parent conversation, and the parent must NOT have
    its own run() invoked as a side-effect of the notification.
    """
    parent_conversation = _RecordingConversation()
    child_conversation = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_BG])],
    )

    manager = make_manager()
    scheduler, _summary = make_scheduler(conversations=[child_conversation])

    # Spawn one background child via the delegate executor.
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    observation = executor(
        DelegateAction(
            persona="builder",
            task_name="bg-child",
            task="background work",
            run_in_background=True,
        ),
    )
    assert observation.status == "queued"

    # Run the background drain end-to-end: spawn → child completes →
    # ChildManager enqueues ChildNotification → scheduler injects message.
    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )
    await scheduler._run_background_drain(
        manager,
        make_agent,
        parent_conversation,
        parent_record,
    )
    if scheduler._active_tasks:
        await asyncio.gather(*list(scheduler._active_tasks.values()))
    await scheduler._drain_delegated_children(
        manager,
        make_agent,
        parent_conversation,
        parent_record,
    )

    # The parent conversation should have received exactly two messages:
    #   1. the [BACKGROUND TASK COMPLETED] notification
    #   2. the all-done resume message (still_running=0 path)
    notifications = [
        m for m in parent_conversation.sent_messages if m.startswith("[BACKGROUND TASK COMPLETED]")
    ]
    assert len(notifications) == 1, (
        f"expected exactly one notification, got {parent_conversation.sent_messages}"
    )

    notif = notifications[0]
    assert "bg-child" in notif
    assert "All background tasks have completed." in notif

    # The first run resumes after background spawn; the second resumes after
    # notification injection. Notification injection itself is send_message-only.
    assert parent_conversation.run_call_count == 2, (
        "Parent should run once after spawn and once after completion. Got "
        f"{parent_conversation.run_call_count} run() calls."
    )


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_background_notification_signals_remaining_running_count() -> None:
    """REQ-20260416-120000-007: when a background child completes while
    siblings are still running, the injected notification advertises the
    correct still_running_count and instructs the parent to keep working.
    """
    fast_child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_FAST])],
    )
    # Slow child holds the drain open by sleeping during run(), giving the
    # fast child a chance to complete and emit its notification first.
    slow_child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_SLOW])],
        delay=0.05,
    )
    parent_conversation = _RecordingConversation()

    manager = make_manager()
    scheduler, _summary = make_scheduler(
        conversations=[fast_child, slow_child],
    )

    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    executor(
        DelegateAction(
            persona="builder",
            task_name="fast",
            task="fast",
            run_in_background=True,
        ),
    )
    executor(
        DelegateAction(
            persona="builder",
            task_name="slow",
            task="slow",
            run_in_background=True,
        ),
    )

    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )
    await scheduler._run_background_drain(
        manager,
        make_agent,
        parent_conversation,
        parent_record,
    )
    if scheduler._active_tasks:
        await asyncio.gather(*list(scheduler._active_tasks.values()))
    await scheduler._drain_delegated_children(
        manager,
        make_agent,
        parent_conversation,
        parent_record,
    )

    notifications = [
        m for m in parent_conversation.sent_messages if m.startswith("[BACKGROUND TASK COMPLETED]")
    ]
    assert len(notifications) == 2, (
        f"expected two notifications, got {parent_conversation.sent_messages}"
    )

    # First notification must reference the still-running sibling. Order is
    # not guaranteed by completion timing in the queue, but at least one of
    # the two notifications must mention "still in progress" and at least
    # one must mention "All background tasks have completed".
    assert any("still in progress" in n for n in notifications), notifications
    assert any("All background tasks have completed." in n for n in notifications), notifications

    # First run resumes after spawn; second resumes after queued notifications.
    assert parent_conversation.run_call_count == 2, (
        "Parent should run once after spawn and once after notifications. Got "
        f"{parent_conversation.run_call_count} run() calls."
    )


# ---------------------------------------------------------------------------
# Regression: double-resume bug (0.61.2)
# When a parent used wait_for_tasks (conversation.paused=True), the background
# drain would resume the parent inside the while loop AND then send a second
# "all done" resume after the loop, crashing the orchestrator with
# ConversationRunError.  The fix adds a parent_was_resumed guard.
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_background_drain_does_not_double_resume_after_wait_for_tasks() -> None:
    """Regression: parent paused via wait_for_tasks must be resumed exactly once.

    Before the fix, the drain would call conversation.run() twice — once inside
    the while loop (when the paused parent is resumed to process results) and
    once unconditionally after the loop with the "all done" message.  The second
    call crashed because the conversation was already finished.
    """
    child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_BG])],
    )
    parent = _RecordingConversation()
    parent.paused = True  # Simulate wait_for_tasks pausing the conversation

    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[child])

    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    observation = executor(
        DelegateAction(
            persona="builder",
            task_name="bg-child",
            task="background work",
            run_in_background=True,
        ),
    )
    assert observation.status == "queued"

    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )
    manager.wait_barrier.request_wait(parent, [observation.task_id])
    await scheduler._run_background_drain(manager, make_agent, parent, parent_record)

    # The drain must resume the parent exactly once.  A second resume would
    # crash with ConversationRunError, which this test would capture as a
    # test failure (exception propagates).
    assert parent.run_call_count == 1, (
        f"Parent must be resumed exactly once after wait_for_tasks, "
        f"got {parent.run_call_count} run() calls"
    )


@verifies(SWR.SWR_104)
@pytest.mark.asyncio
async def test_background_drain_paused_parent_with_multiple_children_no_crash() -> None:
    """Regression: paused parent with multiple background children does not crash.

    Two children complete in separate batches; the drain resumes the parent
    once per batch (2×).  The critical regression check is that the drain
    does NOT attempt a third "all done" resume after the loop — that would
    raise ConversationRunError and crash the orchestrator.
    """
    first = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_FIRST])],
    )
    second = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_SECOND])],
    )
    parent = _RecordingConversation()
    parent.paused = True  # wait_for_tasks pause

    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[first, second])

    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    first_obs = executor(
        DelegateAction(persona="builder", task_name="first", task="first", run_in_background=True),
    )
    second_obs = executor(
        DelegateAction(
            persona="builder", task_name="second", task="second", run_in_background=True
        ),
    )

    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )
    manager.wait_barrier.request_wait(parent, [first_obs.task_id, second_obs.task_id])
    await scheduler._run_background_drain(manager, make_agent, parent, parent_record)

    # The wait barrier resumes the parent once with all requested results.
    assert parent.run_call_count == 1, (
        f"Parent must be resumed once after wait_for_tasks, got {parent.run_call_count} run() calls"
    )


class _ScriptedParentConversation(_RecordingConversation):
    """Parent whose run() triggers a scripted side effect on specific run counts.

    Simulates a parent agent that calls wait_for_tasks or delegates more
    children *during a resumed run* — i.e. inside conversation.run() invoked
    by the drain's resume path.
    """

    def __init__(self, **kwargs: object) -> None:
        super().__init__(**kwargs)
        self.on_run: dict[int, Callable[[], object]] = {}

    def run(self) -> None:
        super().run()
        action = self.on_run.pop(self.run_call_count, None)
        if action is not None:
            action()


# ---------------------------------------------------------------------------
# Regression: one-shot drain (session 20260707-103842-887caa4f194c)
# wait_for_tasks called during a *resumed* run registered a barrier request
# that was never consumed — the drain checked the barrier only at entry.
# The parent ended "blocked" and Ralph spawned a duplicate orchestrator.
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_104)
async def test_wait_for_tasks_during_resumed_run_is_honored() -> None:
    """Barrier registered during the spawn-resume run must be consumed:
    the drain loops back, waits for the child, and resumes the parent with
    results instead of falling through to summarization."""
    child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_BG])],
    )
    parent = _ScriptedParentConversation()
    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[child])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    observation = executor(
        DelegateAction(
            persona="builder",
            task_name="bg-child",
            task="background work",
            run_in_background=True,
        ),
    )
    # During run #1 (the "Background tasks have started" resume) the parent
    # calls wait_for_tasks on the just-spawned child.
    parent.on_run[1] = lambda: manager.wait_barrier.request_wait(
        parent,
        [observation.task_id],
    )
    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )

    await asyncio.wait_for(
        scheduler._drain_delegated_children(manager, make_agent, parent, parent_record),
        timeout=10,
    )

    wait_resumes = [
        m
        for m in parent.sent_messages
        if m.startswith("Background tasks you waited for have completed")
    ]
    assert len(wait_resumes) == 1, parent.sent_messages
    assert "**bg-child**" in wait_resumes[0]
    # Run #1 = spawn resume, run #2 = wait-results resume. No third resume:
    # the completion notification for the waited child must be discarded,
    # not re-injected as a duplicate.
    assert parent.run_call_count == 2, parent.sent_messages
    assert not any(m.startswith("[BACKGROUND TASK COMPLETED]") for m in parent.sent_messages), (
        parent.sent_messages
    )


@verifies(SWR.SWR_111, SWR.SWR_142, SWR.SWR_2426)
async def test_nested_agent_resume_and_wait_scope_to_direct_child() -> None:
    """Productive use: a running coding agent can delegate and await analysis.
    Expected outcome: resume guidance and an empty wait target only its direct child.
    """
    child_conversation = _RecordingConversation(
        delay=0.05,
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_BG])],
    )
    parent = _ScriptedParentConversation()
    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[child_conversation])
    caller = manager.spawn_child(
        "coding-agent",
        "builder",
        "implement feature",
        run_in_background=True,
        parent_agent_id="orchestrator",
    )
    caller.transition(ChildTaskState.RUNNING)
    delegate = RotarisDelegateExecutor(
        manager,
        scheduler,
        make_agent,
        parent_canonical_name=caller.canonical_name,
    )
    delegated = delegate(
        DelegateAction(
            persona="analyst",
            task_name="nested-analysis",
            task="analyse the implementation",
            run_in_background=True,
        )
    )
    observations = []
    wait_executor = WaitForTasksExecutor(
        manager,
        current_task_id=caller.task_id,
        parent_canonical_name=caller.canonical_name,
    )
    parent.on_run[1] = lambda: observations.append(
        wait_executor(WaitForTasksAction(task_ids=[]), conversation=parent)
    )

    await scheduler._run_background_drain(manager, make_agent, parent, caller)
    handled = await scheduler._run_wait_barrier_if_requested(manager, make_agent, parent, caller)

    spawn_messages = [
        message
        for message in parent.sent_messages
        if message.startswith("Background tasks have started")
    ]
    assert handled is True
    assert len(spawn_messages) == 1
    assert delegated.task_id in spawn_messages[0]
    assert caller.task_id not in spawn_messages[0]
    assert len(observations) == 1
    assert observations[0].queued_ids == [delegated.task_id]
    assert observations[0].already_done is False


@verifies(SWR.SWR_104)
async def test_delegation_during_resumed_run_spawns_in_same_drain() -> None:
    """A child delegated during a resumed run must be spawned by the same
    drain call — not silently left QUEUED for a future iteration."""
    first_child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_FIRST])],
    )
    second_child = _RecordingConversation(
        events=[MockToolEvent("bash"), MockMessageEvent("assistant", [TEXT_SECOND])],
    )
    parent = _ScriptedParentConversation()
    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[first_child, second_child])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    first_observation = executor(
        DelegateAction(
            persona="builder",
            task_name="first",
            task="first work",
            run_in_background=True,
        ),
    )
    # During run #1 the parent delegates a second background child; during
    # run #2 it waits on both, so the drain must hold until both complete.
    second_task_ids: list[str] = []

    def _delegate_second() -> None:
        observation = executor(
            DelegateAction(
                persona="builder",
                task_name="second",
                task="second work",
                run_in_background=True,
            ),
        )
        assert observation.task_id is not None
        second_task_ids.append(observation.task_id)

    parent.on_run[1] = _delegate_second
    assert first_observation.task_id is not None
    parent.on_run[2] = lambda: manager.wait_barrier.request_wait(
        parent,
        [first_observation.task_id, *second_task_ids],
    )
    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )

    await asyncio.wait_for(
        scheduler._drain_delegated_children(manager, make_agent, parent, parent_record),
        timeout=10,
    )

    states = {record.canonical_name: record.state for record in manager.snapshot_children()}
    assert states["first"] == ChildTaskState.SUCCEEDED, (
        states,
        parent.run_call_count,
        parent.sent_messages,
        second_task_ids,
        list(scheduler._active_tasks),
    )
    assert states["second"] == ChildTaskState.SUCCEEDED, (
        "child delegated during a resumed run must be spawned by the same drain"
    )
    # Spawned once, not once per drain iteration. Read from the task payload,
    # which `run_child` sends exactly once when a child starts: counting `run()`
    # calls also counts the resume a sibling's drain performs on this
    # conversation, and whether that happens depends only on how far the two
    # children overlap — which is a property of the machine, not of the drain.
    task_prompts = [message for message in second_child.sent_messages if "second work" in message]
    assert len(task_prompts) == 1
    wait_resumes = [
        m
        for m in parent.sent_messages
        if m.startswith("Background tasks you waited for have completed")
    ]
    assert len(wait_resumes) == 1, parent.sent_messages
    assert "**second**" in wait_resumes[0]


@verifies(SWR.SWR_104)
async def test_drain_loop_terminates_when_spawn_makes_no_progress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Children that stay QUEUED/WAITING (spawn makes no progress) must not
    cause an infinite spawn/resume loop: exactly one resume, then return."""
    parent = _ScriptedParentConversation()
    manager = make_manager()
    scheduler, _ = make_scheduler(conversations=[])
    executor = RotarisDelegateExecutor(manager, scheduler, make_agent)
    executor(
        DelegateAction(
            persona="builder",
            task_name="stuck",
            task="never spawns",
            run_in_background=True,
        ),
    )

    async def _spawn_nothing(manager: object, agent_factory: object) -> list[str]:
        del manager, agent_factory
        return []

    monkeypatch.setattr(scheduler, "spawn_children", _spawn_nothing)
    parent_record = ChildTaskRecord(
        name="parent",
        canonical_name="parent",
        persona="orchestrator",
        task_payload="test",
    )

    await asyncio.wait_for(
        scheduler._drain_delegated_children(manager, make_agent, parent, parent_record),
        timeout=10,
    )

    assert parent.run_call_count == 1, (
        "stuck children must yield exactly one resume, not an infinite loop"
    )


@verifies(SWR.SWR_156)
async def test_pre_flight_intent_classification_gates_orchestrator_tool_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Top-level orchestrator tool set is governed by pre-flight intent classification.

    When the classified intent is EXPLICIT_TRIVIAL the orchestrator factory receives
    ``intent_tools`` in runtime_kwargs and ``_apply_tool_restrictions`` must pass
    write tools through (overriding coordinator_only).  For a complex intent
    (MODERATE_FEATURE) no ``intent_tools`` is injected and coordinator_only strips
    write tools as before.
    """
    from openhands.sdk.llm.llm import LLM

    from rotaris_core.agents.factory import create_agent_for_persona
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig
    from rotaris_core.ralph.intent_classifier import IntentCategory, intent_tools_for

    # Build a minimal orchestrator persona that declares the extended tool set.
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        system_prompt="orchestrator prompt",
        tools=[
            "delegate",
            "todo",
            "haet_read",
            "artifact_read",
            "artifact_list",
            "read_file",
            "write_file",
            "grep",
            "glob",
            "grep",
            "fetch",
            "terminal",
            "git_commit",
        ],
        coordinator_only=True,
    )
    config = RotarisConfig(
        default_persona="orchestrator",
        personas={persona.name: persona},
    )
    llm = LLM(model="openai/gpt-4o-mini", api_key="test")

    # Delegate tool requires these three keys regardless of intent.
    delegate_support = {
        "child_manager": object(),
        "scheduler": object(),
        "agent_factory": lambda persona_name, runtime_kwargs=None: None,
    }

    # --- Simple intent: explicit_trivial should allow write tools ---
    trivial_intent_tools = intent_tools_for(IntentCategory.EXPLICIT_TRIVIAL)
    assert trivial_intent_tools is not None, "explicit_trivial must declare allowed_tools"

    trivial_agent = create_agent_for_persona(
        persona,
        config,
        runtime_kwargs={**delegate_support, "intent_tools": trivial_intent_tools},
    )(llm)
    trivial_tool_names = {t.name for t in trivial_agent.tools}
    assert "write_file" in trivial_tool_names, (
        f"write_file absent from trivial agent tools: {trivial_tool_names}"
    )
    assert "read_file" in trivial_tool_names

    # --- Complex intent: moderate_feature should fall back to coordinator_only ---
    complex_intent_tools = intent_tools_for(IntentCategory.MODERATE_FEATURE)
    assert complex_intent_tools is None, (
        "moderate_feature must not declare allowed_tools (returns None)"
    )

    # When no intent_tools is injected, coordinator_only strips write tools
    # while retaining read tools needed for context gathering.
    complex_agent = create_agent_for_persona(
        persona,
        config,
        runtime_kwargs={**delegate_support},  # no intent_tools
    )(llm)
    complex_tool_names = {t.name for t in complex_agent.tools}
    assert "write_file" not in complex_tool_names, (
        f"write_file must be absent for coordinator-only fallback: {complex_tool_names}"
    )
    assert "read_file" in complex_tool_names
