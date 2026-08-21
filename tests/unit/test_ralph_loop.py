from __future__ import annotations

import asyncio
import datetime as dt
import json
from typing import Any

import pytest

from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact, EscalationSignal
from rotaris_core.ralph import (
    RalphIterationOutcome,
    RalphIterationState,
    RalphLoop,
    RalphProgressFile,
    RalphStopCondition,
)
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.ralph.state import summarize_run_progress
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.state import SessionState
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask
from rotaris_core.tui.ralph_loop import TuiRalphLoop
from rotaris_core.tui.transcript_archiver import TranscriptArchiver


class MockState:
    def __init__(self, events=None):
        self.events = events or []


class MockToolEvent:
    def __init__(self, tool_name: str, action: str) -> None:
        self.tool_name = tool_name
        self.action = action
        self.tool_call_id = f"{tool_name}-call"


class MockConversation:
    def __init__(self, events=None, should_fail=False, delay=0):
        self.state = MockState(events or [])
        self.should_fail = should_fail
        self.delay = delay
        self.closed = False
        self.paused = False
        self.message_sent = None
        # Set externally to simulate a todo tool firing during run().
        self.todo_state_to_fire: TodoList | None = None
        self._todo_callback: Any = None
        self._default_event_added = False

    def send_message(self, msg):
        self.message_sent = msg

    def run(self):
        import time

        if self.delay:
            time.sleep(self.delay)
        if self.should_fail:
            raise RuntimeError("Agent failed")
        if self.todo_state_to_fire is not None and self._todo_callback is not None:
            self._todo_callback(self.todo_state_to_fire)
        # Emit a synthetic tool event on the first run so the transcript produces
        # "executed_work" and the scheduler passes through to the summary agent.
        if not self._default_event_added:
            self.state.events.append(MockToolEvent("delegate", "default work"))
            self._default_event_added = True

    def pause(self):
        self.paused = True

    def close(self):
        self.closed = True


class MockSummaryAgent:
    def __init__(self, report=None):
        self._report = report

    async def generate_report(self, record, transcript, *, fallback_status="failed"):
        del transcript
        return self._report or ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status=fallback_status if fallback_status != "failed" else "succeeded",
            summary="Done",
        )


class StubTuiApp:
    def __init__(self) -> None:
        from rotaris_core.tui.run_timer import RunTimer

        self._render_state = type("RenderState", (), {"last_context_tokens": 0})()
        self._run_timer = RunTimer()
        self._live_stream_messages: dict[str, Any] = {}
        self.safe_dispatch_calls: list[tuple[Any, tuple[Any, ...]]] = []
        self.notifications: list[tuple[str, str, float | None]] = []

    def call_from_thread(self, callback, *args):
        return callback(*args)

    def safe_call_from_thread(self, callback, *args):
        self.safe_dispatch_calls.append((callback, args))
        callback(*args)
        return True

    def _refresh_widgets(self) -> None:
        return None

    def request_widget_refresh(self) -> None:
        return None

    def notify(
        self,
        message: str,
        *,
        severity: str = "information",
        timeout: float | None = None,
    ) -> None:
        self.notifications.append((message, severity, timeout))


def make_config() -> RotarisConfig:
    return RotarisConfig(runtime=RuntimePolicy(child_timeout=5))


def make_loop(report=None) -> RalphLoop:
    loop = RalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(report=report),
        conversation_factory=lambda agent: MockConversation(),
    )
    if report is not None:

        async def _run_child(
            record,
            agent,
            *,
            manager=None,
            agent_factory=None,
            **kwargs,
        ):
            del record, agent, manager, agent_factory, kwargs
            return report

        loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    return loop


def make_todo(*tasks: TodoTask) -> TodoList:
    return TodoList(phases=[TodoPhase(name="Phase 1", tasks=list(tasks))])


def make_tui_loop(
    report=None,
) -> tuple[
    TuiRalphLoop,
    dict[str, Any],
    list[tuple[str, str]],
    SessionState,
    list[list[str]],
]:
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="session-tui",
        workspace_root="/tmp/test",
        created_at=now,
        updated_at=now,
    )
    runtime_kwargs: dict[str, Any] = {}
    stored_reports: list[tuple[str, str]] = []
    sync_calls: list[list[str]] = []
    loop = TuiRalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(report=report),
        state=state,
        app=StubTuiApp(),
        sync_children=lambda manager: sync_calls.append(
            [record.canonical_name for record in manager.snapshot_children()],
        ),
        dispatch_ui=lambda callback, *args: callback(*args),
        set_live_activity=lambda *args, **kwargs: None,
        push_activity_event=lambda *args, **kwargs: None,
        notify_child_spawn=lambda *args, **kwargs: None,
        apply_conversation_event=lambda *args, **kwargs: None,
        apply_token_event=lambda *args, **kwargs: None,
        update_agent_todo=lambda todo: None,
        persist_state=lambda: None,
        clear_live_stream=lambda agent_name: None,
        store_report=lambda agent_name, content: stored_reports.append((agent_name, content)),
    )

    def _agent_factory(
        persona: str,
        rk: dict[str, Any] | None = None,
        model_override: str | None = None,
    ) -> dict[str, Any]:
        del model_override
        if rk:
            runtime_kwargs.update(rk)
        return {"persona": persona}

    loop._test_agent_factory = _agent_factory  # type: ignore[attr-defined]
    return loop, runtime_kwargs, stored_reports, state, sync_calls


def _transcript_event(index: int) -> dict[str, str]:
    return {"role": "agent", "content": f"event-{index}"}


def _archived_events(archiver: TranscriptArchiver) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in archiver.path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


@verifies(SWR.SWR_548, SWR.SWR_549, SWR.SWR_551)
def test_ralph_iteration_outcome_values_exist():
    assert RalphIterationOutcome.COMPLETED == "completed"
    assert RalphIterationOutcome.ABANDONED == "abandoned"
    assert RalphIterationOutcome.PENDING == "pending"


@verifies(SWR.SWR_1271, SWR.SWR_1273)
def test_tui_loop_trim_archives_real_events_without_rearchiving_sentinel(tmp_path) -> None:
    loop, _runtime_kwargs, _stored_reports, state, _sync_calls = make_tui_loop()
    archiver = TranscriptArchiver(tmp_path, page_size=2)
    loop._archiver = archiver
    loop._max_transcript_events = 3
    state.transcript_events = [_transcript_event(i) for i in range(4)]

    loop._trim_session_state()

    assert state.transcript_events == [
        {"role": "page", "offset": 0, "count": 1},
        _transcript_event(1),
        _transcript_event(2),
        _transcript_event(3),
    ]
    assert _archived_events(archiver) == [_transcript_event(0)]

    state.transcript_events.append(_transcript_event(4))
    loop._trim_session_state()

    assert state.transcript_events == [
        {"role": "page", "offset": 0, "count": 2},
        _transcript_event(2),
        _transcript_event(3),
        _transcript_event(4),
    ]
    assert _archived_events(archiver) == [
        _transcript_event(0),
        _transcript_event(1),
    ]

    state.transcript_events.append(_transcript_event(5))
    loop._trim_session_state()

    assert state.transcript_events == [
        {"role": "page", "offset": 1, "count": 1},
        _transcript_event(3),
        _transcript_event(4),
        _transcript_event(5),
    ]
    archived = _archived_events(archiver)
    assert archived == [_transcript_event(0), _transcript_event(1), _transcript_event(2)]
    assert all(event["role"] != "page" for event in archived)


@verifies(SWR.SWR_124, SWR.SWR_125)
def test_tui_loop_notifies_provider_quota_exhaustion_once() -> None:
    loop, _runtime_kwargs, _stored_reports, _state, _sync_calls = make_tui_loop()

    loop.scheduler.diagnostics.issue(
        kind="provider_quota_exhausted",
        severity="error",
        actor="worker",
        message="Provider quota exhausted for model openai/gpt-4o.",
        metadata={"model": "openai/gpt-4o"},
    )
    loop.scheduler.diagnostics.issue(
        kind="child_exception",
        severity="error",
        actor="worker",
        message="Provider quota exhausted for model openai/gpt-4o.",
    )

    assert loop._app.notifications == [
        ("Provider quota exhausted for model openai/gpt-4o.", "error", 10.0),
    ]


@verifies(SWR.SWR_118, SWR.SWR_119, SWR.SWR_121)
def test_ralph_iteration_state_serialization():
    state = RalphIterationState(
        iteration_number=2,
        task_id="task-1",
        task_name="Build feature",
        started_at=dt.datetime(2026, 1, 1, tzinfo=dt.UTC),
        ended_at=dt.datetime(2026, 1, 1, 0, 1, tzinfo=dt.UTC),
        outcome=RalphIterationOutcome.COMPLETED,
        report_summary="Finished successfully",
        agent_response="User-facing response",
    )

    payload = state.model_dump(mode="json")

    assert payload["iteration_number"] == 2
    assert payload["task_id"] == "task-1"
    assert payload["outcome"] == "completed"
    assert payload["report_summary"] == "Finished successfully"
    assert payload["agent_response"] == "User-facing response"


@verifies(SWR.SWR_118, SWR.SWR_119)
def test_ralph_progress_file_defaults():
    progress = RalphProgressFile(session_id="session-1", started_at=dt.datetime.now(dt.UTC))

    assert progress.iterations == []
    assert progress.total_tasks == 0
    assert progress.completed_tasks == 0
    assert progress.abandoned_tasks == 0
    assert progress.stop_reason is None


@verifies(SWR.SWR_121)
def test_summarize_run_progress_success() -> None:
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC))

    assert summarize_run_progress(progress) == ("completed", "Run completed.", "information")


@verifies(SWR.SWR_548, SWR.SWR_551)
def test_summarize_run_progress_user_stop_is_paused() -> None:
    progress = RalphProgressFile(
        session_id="s",
        started_at=dt.datetime.now(dt.UTC),
        stop_reason="stopped by user",
    )

    assert summarize_run_progress(progress) == (
        "paused",
        "Run paused: interrupted by user.",
        "warning",
    )


@verifies(SWR.SWR_549, SWR.SWR_551)
def test_summarize_run_progress_failure() -> None:
    progress = RalphProgressFile(
        session_id="s",
        started_at=dt.datetime.now(dt.UTC),
        abandoned_tasks=1,
        iterations=[
            RalphIterationState(
                iteration_number=1,
                task_id="task-1",
                task_name="task",
                started_at=dt.datetime.now(dt.UTC),
                ended_at=dt.datetime.now(dt.UTC),
                outcome=RalphIterationOutcome.ABANDONED,
                report_summary=(
                    "Child failed: LLM provider rate limit hit. Retry after about 30s."
                ),
            ),
        ],
    )

    assert summarize_run_progress(progress) == (
        "failed",
        "Run failed: LLM provider rate limit hit. Retry after about 30s.",
        "error",
    )


@verifies(SWR.SWR_549, SWR.SWR_551)
def test_summarize_run_progress_partial_failure() -> None:
    progress = RalphProgressFile(
        session_id="s",
        started_at=dt.datetime.now(dt.UTC),
        completed_tasks=2,
        abandoned_tasks=1,
    )

    assert summarize_run_progress(progress) == (
        "completed",
        "Run completed with failures: 2 completed, 1 abandoned.",
        "warning",
    )


@verifies(SWR.SWR_123)
def test_stop_condition_all_tasks_completed_returns_true():
    todo = make_todo(
        TodoTask(name="A", status=TaskStatus.COMPLETED),
        TodoTask(name="B", status=TaskStatus.ABANDONED),
    )
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), iterations=[])

    assert RalphStopCondition.should_stop(progress, todo, None, None) == (
        True,
        "all tasks completed",
    )


@verifies(SWR.SWR_123)
def test_stop_condition_iteration_limit_reached_returns_true():
    progress = RalphProgressFile(
        session_id="s",
        started_at=dt.datetime.now(dt.UTC),
        iterations=[
            RalphIterationState(
                iteration_number=1,
                task_id="t1",
                task_name="Task 1",
                started_at=dt.datetime.now(dt.UTC),
            ),
        ],
    )
    todo = make_todo(TodoTask(name="A"))

    assert RalphStopCondition.should_stop(progress, todo, 1, None) == (
        True,
        "iteration limit reached",
    )


@verifies(SWR.SWR_123)
def test_stop_condition_time_limit_reached_returns_true():
    progress = RalphProgressFile(
        session_id="s",
        started_at=dt.datetime.now(dt.UTC) - dt.timedelta(seconds=10),
    )
    todo = make_todo(TodoTask(name="A"))

    assert RalphStopCondition.should_stop(progress, todo, None, 1) == (True, "time limit reached")


@verifies(SWR.SWR_123)
def test_stop_condition_no_pending_tasks_returns_true():
    todo = make_todo(TodoTask(name="A", status=TaskStatus.ABANDONED))
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC))

    assert RalphStopCondition.should_stop(progress, todo, None, None) == (True, "no pending tasks")


@verifies(SWR.SWR_123)
def test_stop_condition_should_continue_returns_false():
    todo = make_todo(
        TodoTask(name="A", status=TaskStatus.COMPLETED),
        TodoTask(name="B", status=TaskStatus.PENDING),
    )
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC))

    assert RalphStopCondition.should_stop(progress, todo, None, None) == (False, "")


@verifies(SWR.SWR_118, SWR.SWR_526)
def test_find_next_pending_returns_first_pending_task():
    loop = make_loop()
    first = TodoTask(name="A", status=TaskStatus.COMPLETED)
    second = TodoTask(name="B", status=TaskStatus.PENDING)
    third = TodoTask(name="C", status=TaskStatus.PENDING)
    todo = make_todo(first, second, third)

    assert loop._find_next_pending(todo) is second


@verifies(SWR.SWR_123)
def test_find_next_pending_returns_none_when_all_done():
    loop = make_loop()
    todo = make_todo(
        TodoTask(name="A", status=TaskStatus.COMPLETED),
        TodoTask(name="B", status=TaskStatus.ABANDONED),
    )

    assert loop._find_next_pending(todo) is None


@verifies(SWR.SWR_118, SWR.SWR_121)
@pytest.mark.asyncio
async def test_run_iteration_success_marks_task_completed_and_updates_progress():
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="Completed work",
        final_response="Here is the real answer",
    )
    loop = make_loop(report=report)
    task = TodoTask(name="A", description="Do A")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        1,
        task,
        progress,
        lambda persona, rk=None: {"persona": persona},
        todo,
    )

    assert task.status == TaskStatus.COMPLETED
    assert progress.completed_tasks == 1
    assert progress.abandoned_tasks == 0
    assert result.outcome == RalphIterationOutcome.COMPLETED
    assert result.report_summary == "Completed work"
    assert result.agent_response == "Here is the real answer"


@verifies(SWR.SWR_2426)
@pytest.mark.asyncio
async def test_run_iteration_gives_root_agent_child_identity() -> None:
    """Productive use: the root agent delegates work and later polls it with
    background_output / wait_for_tasks.
    Expected outcome: the root runtime kwargs carry the iteration record's own
    identity (like scheduler.spawn_children does for children), so delegate and
    the lookup tools agree on one parent name and valid task ids never resolve
    to not_found.
    """
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="Completed work",
    )
    loop = make_loop(report=report)
    seen: dict[str, Any] = {}

    def factory(persona: str, rk: dict[str, Any] | None = None) -> dict[str, Any]:
        seen.update(rk or {})
        return {"persona": persona}

    task = TodoTask(name="A", description="Do A")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    await loop._run_iteration(1, task, progress, factory, todo)

    manager = seen["child_manager"]
    record = manager.get_record_by_task_id(seen["child_task_id"])
    assert record is not None
    assert seen["child_canonical_name"] == record.canonical_name
    assert seen["session_id"] == loop.scheduler.binding_session_id
    # The manager was rebound to the root record, so a delegated child's parent
    # matches the identity the lookup tools received — the not_found regression.
    child = manager.spawn_child("delegated-work", "coding-agent", "payload")
    assert child.parent_agent_id == seen["child_canonical_name"]


@verifies(SWR.SWR_123, SWR.SWR_210)
@pytest.mark.asyncio
async def test_run_stops_after_circuit_breaker_escalation() -> None:
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="failed",
        summary="Child session aborted after repeated recovery attempts.",
        escalation=EscalationSignal(
            session_id="conv-1",
            consecutive_activation_count=3,
            reason="repeated_loop_detection",
        ),
    )
    loop = make_loop(report=report)
    todo = make_todo(
        TodoTask(name="A", description="Do A"),
        TodoTask(name="B", description="Do B"),
    )

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-stop",
    )

    assert len(progress.iterations) == 1
    assert progress.abandoned_tasks == 1
    assert progress.stop_reason == "agent session aborted"
    assert todo.phases[0].tasks[0].status == TaskStatus.ABANDONED
    assert todo.phases[0].tasks[1].status == TaskStatus.PENDING


@verifies(SWR.SWR_121)
@pytest.mark.asyncio
async def test_run_iteration_cancelled_marks_task_abandoned() -> None:
    """Tasks that return 'cancelled' must not be retried."""
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="cancelled",
        summary="Agent could not proceed",
    )
    loop = make_loop(report=report)
    task = TodoTask(name="A", description="Do A")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        1,
        task,
        progress,
        lambda persona, rk=None: {"persona": persona},
        todo,
    )

    assert task.status == TaskStatus.ABANDONED
    assert progress.abandoned_tasks == 1
    assert progress.completed_tasks == 0
    assert result.outcome == RalphIterationOutcome.ABANDONED


@verifies(SWR.SWR_121)
@pytest.mark.asyncio
async def test_run_iteration_blocked_marks_task_pending() -> None:
    """Tasks that return 'blocked' must be re-queued (PENDING), not abandoned.

    Coordinator-only personas (e.g. orchestrator) may delegate work and end their
    conversation before results arrive.  ``blocked`` means the agent is waiting —
    the task should be retried in the next iteration, not cancelled.
    """
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="blocked",
        summary="Waiting for delegated children",
    )
    loop = make_loop(report=report)
    task = TodoTask(name="A", description="Do A")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        1,
        task,
        progress,
        lambda persona, rk=None: {"persona": persona},
        todo,
    )

    assert task.status == TaskStatus.PENDING
    assert progress.abandoned_tasks == 0
    assert progress.completed_tasks == 0
    assert result.outcome == RalphIterationOutcome.PENDING


@verifies(SWR.SWR_122, SWR.SWR_123)
@pytest.mark.asyncio
async def test_run_does_not_loop_on_cancelled() -> None:
    """A single-task run must stop after one iteration when status is cancelled."""
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="cancelled",
        summary="Cancelled by user",
    )
    loop = make_loop(report=report)
    todo = make_todo(TodoTask(name="A", description="Do A"))

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-no-loop",
    )

    # Must stop after exactly one iteration, not retry up to max_iterations.
    assert len(progress.iterations) == 1
    assert progress.abandoned_tasks == 1
    assert progress.completed_tasks == 0


# ---------------------------------------------------------------------------
# TODO-completeness validation gate
# ---------------------------------------------------------------------------


def _make_loop_with_todo_fire(
    report: ChildReportArtifact,
    agent_todo_state: TodoList,
) -> RalphLoop:
    """Build a RalphLoop whose MockConversation fires the todo callback on run().

    The conversation factory closes over a shared dict so the todo_state_callback
    wired into runtime_kwargs (captured during agent_factory call) is available
    when conversation.run() executes.
    """
    captured_rk: dict[str, Any] = {}
    conv = MockConversation()
    conv.todo_state_to_fire = agent_todo_state

    def _conv_factory(agent):
        del agent
        conv._todo_callback = captured_rk.get("todo_state_callback")
        return conv

    def _agent_factory(persona, rk=None):
        if rk:
            captured_rk.update(rk)
        return {"persona": persona}

    loop = RalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(report=report),
        conversation_factory=_conv_factory,
    )

    async def _run_child(
        record,
        agent,
        *,
        manager=None,
        agent_factory=None,
        **kwargs,
    ):
        del record, agent, manager, agent_factory, kwargs
        callback = captured_rk.get("todo_state_callback")
        if callback is not None:
            callback(agent_todo_state)
        return report

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    # Expose so callers can use it as the agent_factory argument to _run_iteration / run.
    loop._test_agent_factory = _agent_factory  # type: ignore[attr-defined]
    return loop


@verifies(SWR.SWR_122, SWR.SWR_3004)
@pytest.mark.asyncio
async def test_succeeded_report_requeues_task_when_todo_has_pending_tasks():
    """Summary-agent 'succeeded' must requeue the task when PENDING todos remain."""
    succeeded_report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
        key_findings="Some findings",
    )
    agent_todo = TodoList(
        phases=[
            TodoPhase(
                name="Implementation",
                tasks=[
                    TodoTask(name="Update panel focus styles", status=TaskStatus.PENDING),
                    TodoTask(name="Verify tests pass", status=TaskStatus.COMPLETED),
                ],
            ),
        ],
    )
    loop = _make_loop_with_todo_fire(succeeded_report, agent_todo)
    task = TodoTask(name="Fix focus styles", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        # type: ignore[attr-defined]
        1,
        task,
        progress,
        loop._test_agent_factory,
        todo,
    )

    assert task.status == TaskStatus.PENDING
    assert progress.abandoned_tasks == 0
    assert progress.completed_tasks == 0
    assert result.outcome == RalphIterationOutcome.PENDING
    assert "incomplete" in result.report_summary
    assert "Update panel focus styles" in result.report_summary
    assert "RALPH CONTINUATION" in task.execution_payload
    assert "do not end your turn" in task.execution_payload


@verifies(SWR.SWR_121)
@pytest.mark.asyncio
async def test_succeeded_report_preserved_when_all_agent_todos_completed():
    """Summary-agent 'succeeded' must not be overridden when all todos are COMPLETED."""
    succeeded_report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
    )
    agent_todo = TodoList(
        phases=[
            TodoPhase(
                name="Implementation",
                tasks=[
                    TodoTask(name="Update panel focus styles", status=TaskStatus.COMPLETED),
                    TodoTask(name="Verify tests pass", status=TaskStatus.COMPLETED),
                ],
            ),
        ],
    )
    loop = _make_loop_with_todo_fire(succeeded_report, agent_todo)
    task = TodoTask(name="Fix focus styles", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        # type: ignore[attr-defined]
        1,
        task,
        progress,
        loop._test_agent_factory,
        todo,
    )

    assert task.status == TaskStatus.COMPLETED
    assert progress.completed_tasks == 1
    assert result.outcome == RalphIterationOutcome.COMPLETED
    assert result.report_summary == "All done"


# ---------------------------------------------------------------------------
# auto_retries_validation — correction retry tests
# ---------------------------------------------------------------------------


class _SequentialTodoConversation(MockConversation):
    """Fires a different TodoList state on each successive call to run()."""

    def __init__(self, todo_states: list[TodoList]) -> None:
        super().__init__()
        self._todo_states = list(todo_states)
        self._run_count = 0
        self.correction_messages_received: list[str] = []

    def send_message(self, msg: str) -> None:
        # Track messages after the initial task payload (those are corrections).
        if self._run_count > 0 or self.message_sent is not None:
            self.correction_messages_received.append(msg)
        self.message_sent = msg

    def run(self) -> None:
        if self._run_count < len(self._todo_states) and self._todo_callback is not None:
            self._todo_callback(self._todo_states[self._run_count])
        self._run_count += 1
        if not self._default_event_added:
            self.state.events.append(MockToolEvent("delegate", "default work"))
            self._default_event_added = True


def _make_loop_with_sequential_todos(
    report: ChildReportArtifact,
    todo_states: list[TodoList],
    auto_retries_validation: int,
) -> tuple[RalphLoop, _SequentialTodoConversation]:
    """Build a RalphLoop with a conversation that fires sequential todo states."""
    captured_rk: dict[str, Any] = {}
    conv = _SequentialTodoConversation(todo_states)

    def _conv_factory(agent: Any) -> _SequentialTodoConversation:
        del agent
        conv._todo_callback = captured_rk.get("todo_state_callback")
        return conv

    def _agent_factory(persona: str, rk: dict[str, Any] | None = None) -> dict[str, Any]:
        if rk:
            captured_rk.update(rk)
        return {"persona": persona}

    config = RotarisConfig(
        runtime=RuntimePolicy(child_timeout=5, auto_retries_validation=auto_retries_validation),
    )
    loop = RalphLoop(
        config=config,
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(report=report),
        conversation_factory=_conv_factory,
    )
    loop._test_agent_factory = _agent_factory  # type: ignore[attr-defined]
    return loop, conv


@verifies(SWR.SWR_122)
@pytest.mark.asyncio
async def test_auto_retries_validation_retries_on_incomplete_todos_and_succeeds() -> None:
    """When auto_retries_validation=1, a correction message is sent and the run succeeds.

    First run: todos have one PENDING task → correction is injected.
    Second run: all todos COMPLETED → task succeeds.
    """
    succeeded_report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
    )
    pending_state = TodoList(
        phases=[
            TodoPhase(
                name="Work",
                tasks=[
                    TodoTask(name="Write tests", status=TaskStatus.PENDING),
                ],
            ),
        ],
    )
    completed_state = TodoList(
        phases=[
            TodoPhase(
                name="Work",
                tasks=[
                    TodoTask(name="Write tests", status=TaskStatus.COMPLETED),
                ],
            ),
        ],
    )
    loop, conv = _make_loop_with_sequential_todos(
        succeeded_report,
        [pending_state, completed_state],
        auto_retries_validation=1,
    )
    task = TodoTask(name="Implement feature", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        # type: ignore[attr-defined]
        1,
        task,
        progress,
        loop._test_agent_factory,
        todo,
    )

    # After the correction retry, the task must be COMPLETED.
    assert task.status == TaskStatus.COMPLETED
    assert progress.completed_tasks == 1
    assert progress.abandoned_tasks == 0
    assert result.outcome == RalphIterationOutcome.COMPLETED
    # The conversation must have received a correction message.
    assert conv.correction_messages_received, "expected a correction message to be sent"
    assert "Write tests" in conv.correction_messages_received[0]
    assert "incomplete" in conv.correction_messages_received[0]


@verifies(SWR.SWR_122)
@pytest.mark.asyncio
async def test_auto_retries_validation_zero_requeues_without_retry() -> None:
    """When auto_retries_validation=0 (default), incomplete todos are requeued.

    No correction message should be sent; the task returns to pending for the next iteration.
    """
    succeeded_report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
    )
    pending_state = TodoList(
        phases=[
            TodoPhase(
                name="Work",
                tasks=[
                    TodoTask(name="Write tests", status=TaskStatus.PENDING),
                ],
            ),
        ],
    )
    # Only one state: PENDING — no second chance.
    loop, conv = _make_loop_with_sequential_todos(
        succeeded_report,
        [pending_state],
        auto_retries_validation=0,
    )
    task = TodoTask(name="Implement feature", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        # type: ignore[attr-defined]
        1,
        task,
        progress,
        loop._test_agent_factory,
        todo,
    )

    assert task.status == TaskStatus.PENDING
    assert progress.abandoned_tasks == 0
    assert progress.completed_tasks == 0
    assert result.outcome == RalphIterationOutcome.PENDING
    # No correction message should have been sent.
    assert conv.correction_messages_received == []


@verifies(SWR.SWR_122)
@pytest.mark.asyncio
async def test_run_retries_same_task_after_incomplete_todo_guard() -> None:
    """The next Ralph iteration should retry the same task after an incomplete-todo requeue."""
    succeeded_report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
    )
    pending_state = TodoList(
        phases=[
            TodoPhase(
                name="Work",
                tasks=[
                    TodoTask(name="Write tests", status=TaskStatus.PENDING),
                ],
            ),
        ],
    )
    completed_state = TodoList(
        phases=[
            TodoPhase(
                name="Work",
                tasks=[
                    TodoTask(name="Write tests", status=TaskStatus.COMPLETED),
                ],
            ),
        ],
    )
    loop, _conv = _make_loop_with_sequential_todos(
        succeeded_report,
        [pending_state, completed_state],
        auto_retries_validation=0,
    )
    todo = make_todo(TodoTask(name="Implement feature", description="Do it"))

    progress = await loop.run(
        todo,
        agent_factory=loop._test_agent_factory,  # type: ignore[attr-defined]
        session_id="session-retry-incomplete-todo",
        max_iterations=2,
    )

    assert len(progress.iterations) == 2
    assert progress.iterations[0].outcome == RalphIterationOutcome.PENDING
    assert progress.iterations[1].outcome == RalphIterationOutcome.COMPLETED
    assert progress.completed_tasks == 1
    assert progress.abandoned_tasks == 0
    assert todo.phases[0].tasks[0].status == TaskStatus.COMPLETED


@verifies(SWR.SWR_122)
@pytest.mark.asyncio
async def test_tui_run_iteration_requeues_task_when_todo_has_pending_tasks() -> None:
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
        final_response="Need one more pass",
    )
    pending_state = TodoList(
        phases=[
            TodoPhase(
                name="Implementation",
                tasks=[
                    TodoTask(name="Write tests", status=TaskStatus.PENDING),
                ],
            ),
        ],
    )
    loop, runtime_kwargs, stored_reports, state, _sync_calls = make_tui_loop(report=report)

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del agent, manager, agent_factory, kwargs
        runtime_kwargs["todo_state_callback"](pending_state)

        return report

    # type: ignore[method-assign]
    loop.scheduler.run_child = _patched_run_child

    task = TodoTask(name="Implement feature", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        1,
        task,
        progress,
        loop._test_agent_factory,  # type: ignore[attr-defined]
        todo,
    )

    assert task.status == TaskStatus.PENDING
    assert result.outcome == RalphIterationOutcome.PENDING
    assert "incomplete" in result.report_summary
    assert "RALPH CONTINUATION" in task.execution_payload
    assert state.todo_state is not None
    assert len(state.report_artifacts) == 1
    assert stored_reports == [("task-1", "Need one more pass")]


@verifies(SWR.SWR_119)
@pytest.mark.asyncio
async def test_tui_run_iteration_syncs_children_on_spawn_and_stall_callbacks() -> None:
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
    )
    loop, _runtime_kwargs, _stored_reports, _state, sync_calls = make_tui_loop(report=report)

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del agent, agent_factory, kwargs
        assert manager is not None
        delegated = manager.spawn_child("delegated", "builder", "do work")
        delegated.transition(ChildTaskState.RUNNING)

        spawn_callback = loop.scheduler._spawn_notification_callback
        assert spawn_callback is not None
        sync_count_before_spawn = len(sync_calls)
        spawn_callback(delegated)
        assert len(sync_calls) == sync_count_before_spawn + 1
        assert sync_calls[-1] == [record.canonical_name, delegated.canonical_name]

        stall_callback = loop.scheduler._stall_callback
        assert stall_callback is not None
        sync_count_before_stall = len(sync_calls)
        stall_callback(delegated, 91.0, "stalled")
        assert len(sync_calls) == sync_count_before_stall + 1
        assert sync_calls[-1] == [record.canonical_name, delegated.canonical_name]

        return report

    # type: ignore[method-assign]
    loop.scheduler.run_child = _patched_run_child

    task = TodoTask(name="Implement feature", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    await loop._run_iteration(
        1,
        task,
        progress,
        loop._test_agent_factory,  # type: ignore[attr-defined]
        todo,
    )


@verifies(SWR.SWR_119)
@pytest.mark.asyncio
async def test_tui_run_iteration_routes_token_callbacks_through_safe_dispatch() -> None:
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
    )
    loop, _runtime_kwargs, _stored_reports, _state, _sync_calls = make_tui_loop(report=report)

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del agent, manager, agent_factory, kwargs
        token_callback = loop.scheduler._conversation_token_callback
        assert token_callback is not None
        token_callback(record, "late token")
        return report

    # type: ignore[method-assign]
    loop.scheduler.run_child = _patched_run_child

    task = TodoTask(name="Implement feature", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        1,
        task,
        progress,
        loop._test_agent_factory,  # type: ignore[attr-defined]
        todo,
    )

    assert result.outcome == RalphIterationOutcome.COMPLETED
    assert loop._app.safe_dispatch_calls
    callback, args = loop._app.safe_dispatch_calls[-1]
    assert callback == loop._apply_token_event
    assert args[-1] == "late token"


@verifies(SWR.SWR_119)
@pytest.mark.asyncio
async def test_tui_run_iteration_syncs_children_when_manager_spawns_child() -> None:
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="All done",
    )
    loop, _runtime_kwargs, _stored_reports, _state, sync_calls = make_tui_loop(report=report)

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del agent, agent_factory, kwargs
        assert manager is not None
        sync_count_before_spawn = len(sync_calls)
        manager.spawn_child("delegated", "builder", "do work")
        assert len(sync_calls) == sync_count_before_spawn + 1
        assert sync_calls[-1] == [record.canonical_name, "delegated"]
        return report

    # type: ignore[method-assign]
    loop.scheduler.run_child = _patched_run_child

    task = TodoTask(name="Implement feature", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    await loop._run_iteration(
        1,
        task,
        progress,
        loop._test_agent_factory,  # type: ignore[attr-defined]
        todo,
    )


# ---------------------------------------------------------------------------
# Nested agent_factory passes runtime_kwargs (delegate tool fix)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_116, SWR.SWR_2423)
@pytest.mark.asyncio
async def test_nested_child_factory_passes_runtime_kwargs_to_nested_agents() -> None:
    """Productive use: root and delegated agents can use runtime-bound interactive tools.
    Expected outcome: root and nested factories receive the same scheduler prompt barrier.
    """
    succeeded_report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="Done",
    )

    # Capture all agent_factory calls: (persona, runtime_kwargs)
    captured_calls: list[tuple[str, dict[str, Any] | None]] = []

    def _agent_factory(
        persona: str,
        rk: dict[str, Any] | None = None,
        model_override: str | None = None,
    ) -> dict[str, Any]:
        captured_calls.append((persona, rk))
        return {"persona": persona}

    # The scheduler's run_child will call agent_factory(nested_persona, rk) when
    # spawning nested children. To intercept this, we patch run_child so it calls
    # the nested_child_factory directly with a synthetic persona.
    nested_factory_holder: list[Any] = []

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kw):
        # Capture the nested agent_factory so we can test it directly.
        if agent_factory is not None:
            nested_factory_holder.append(agent_factory)
        # Replicate the minimal state transition run_child performs before returning.

        return succeeded_report

    loop = RalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(report=succeeded_report),
        conversation_factory=lambda agent: MockConversation(),
    )
    # type: ignore[method-assign]
    loop.scheduler.run_child = _patched_run_child

    task = TodoTask(name="A", description="Do A")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    await loop._run_iteration(1, task, progress, _agent_factory, todo)

    root_runtime = captured_calls[0][1]
    assert root_runtime is not None
    assert root_runtime["user_prompt_barrier"] is loop.scheduler.user_prompt_barrier

    # The nested_child_factory must have been passed to run_child.
    assert nested_factory_holder, "expected agent_factory to be forwarded to run_child"

    nested_factory = nested_factory_holder[0]

    # Calling the nested factory with a persona should yield non-None runtime_kwargs.
    nested_factory("planner")

    # Find the call made by the nested factory (all calls after the first top-level one).
    nested_calls = [(p, rk) for p, rk in captured_calls if p == "planner"]
    assert nested_calls, "nested factory did not call agent_factory for 'planner'"

    _, nested_rk = nested_calls[0]
    assert nested_rk is not None, (
        "nested child received None runtime_kwargs (delegate tool would be dropped)"
    )
    assert "child_manager" in nested_rk, "nested runtime_kwargs missing 'child_manager'"
    assert "scheduler" in nested_rk, "nested runtime_kwargs missing 'scheduler'"
    assert "agent_factory" in nested_rk, "nested runtime_kwargs missing 'agent_factory'"
    assert nested_rk["user_prompt_barrier"] is loop.scheduler.user_prompt_barrier


# ---------------------------------------------------------------------------
# Regression: completion activity is shown on success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@verifies(SWR.SWR_119)
async def test_tui_run_iteration_sets_completion_activity_on_success() -> None:
    """After a successful run_child, the last set_live_activity call must be "Completed".

    Regression: a bare ``raise`` in the ``finally`` block of
    ``TuiRalphLoop._run_iteration`` prevented the post-``run_child`` cleanup code
    from executing, leaving ``activity_phase="summarizing"`` stuck forever.
    """
    report = ChildReportArtifact(
        agent_name="task-1",
        persona="orchestrator",
        status="succeeded",
        summary="Completed work",
        final_response="Here is the real answer",
    )
    loop, _runtime_kwargs, _stored_reports, _state, _sync_calls = make_tui_loop(report=report)

    # Capture set_live_activity calls to verify the final phase.
    live_activity_calls: list[dict[str, Any]] = []

    def _capture_live_activity(
        canonical_name: str,
        persona: str,
        activity_icon: str = "",
        activity_text: str = "",
        activity_phase: str = "",
    ) -> None:
        live_activity_calls.append(
            {
                "canonical_name": canonical_name,
                "persona": persona,
                "activity_text": activity_text,
                "activity_phase": activity_phase,
            },
        )

    # type: ignore[method-assign]
    loop._set_live_activity = _capture_live_activity

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del agent, manager, agent_factory, kwargs
        return report

    # type: ignore[method-assign]
    loop.scheduler.run_child = _patched_run_child

    task = TodoTask(name="Implement feature", description="Do it")
    todo = make_todo(task)
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)

    result = await loop._run_iteration(
        1,
        task,
        progress,
        loop._test_agent_factory,  # type: ignore[attr-defined]
        todo,
    )

    assert result.outcome == RalphIterationOutcome.COMPLETED
    assert live_activity_calls, "Expected at least one set_live_activity call"
    last_call = live_activity_calls[-1]
    assert last_call["activity_text"] == "Completed", (
        f"Expected final activity 'Completed' but got {last_call['activity_text']!r}"
    )
    assert last_call["activity_phase"] == "completed", (
        f"Expected final activity_phase 'completed' but got {last_call['activity_phase']!r}"
    )


class RecordingObserver:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.outcomes: list[Any] = []
        self.runtime_extra_used = False

    def on_iteration_start(self, iteration_num, task):
        self.calls.append("iteration_start")

    def on_child_spawned(self, record, manager):
        self.calls.append("child_spawned")

    def on_child_created(self, record, manager, todo):
        self.calls.append("child_created")

    def on_child_running(self, record, manager):
        self.calls.append("child_running")

    def on_todo_state(self, todo):
        self.calls.append("todo_state")

    def extra_runtime_kwargs(self):
        self.runtime_extra_used = True
        return {"observer_marker": True}

    def bind_scheduler_callbacks(self, manager):
        self.calls.append("bind")

    def unbind_scheduler_callbacks(self):
        self.calls.append("unbind")

    def on_last_prompt_tokens(self, record, tokens):
        self.calls.append("last_prompt_tokens")

    def on_token_aggregate(self, usage):
        self.calls.append("token_aggregate")

    def on_iteration_end(self, record, report, manager, todo, outcome):
        self.calls.append("iteration_end")
        self.outcomes.append(outcome)


@verifies(SWR.SWR_119)
async def test_iteration_observer_hooks_fire_in_order():
    observer = RecordingObserver()
    loop = RalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent: MockConversation(),
        iteration_observer=observer,
    )
    task = TodoTask(name="observed", description="observed")
    task.set_execution_context("observed")
    todo = make_todo(task)
    captured_kwargs: dict[str, Any] = {}

    def agent_factory(persona, runtime_kwargs=None, model_override=None):
        if runtime_kwargs:
            captured_kwargs.update(runtime_kwargs)
        return {"persona": persona}

    await loop.run(todo=todo, agent_factory=agent_factory, session_id="obs", max_iterations=1)

    expected = [
        "iteration_start",
        "child_created",
        "child_running",
        "bind",
        "unbind",
        "token_aggregate",
        "iteration_end",
    ]
    # child_spawned / todo_state / last_prompt_tokens are conditional on the
    # mock environment; filter to the mandatory hooks before comparing order.
    mandatory = [c for c in observer.calls if c in expected]
    assert mandatory == expected
    assert observer.runtime_extra_used
    assert captured_kwargs.get("observer_marker") is True
    assert observer.outcomes == [RalphIterationOutcome.COMPLETED]


@verifies(SWR.SWR_119)
async def test_iteration_observer_unbind_called_on_child_failure():
    observer = RecordingObserver()
    loop = RalphLoop(
        config=make_config(),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent: MockConversation(should_fail=True),
        iteration_observer=observer,
    )
    task = TodoTask(name="failing", description="failing")
    task.set_execution_context("failing")
    todo = make_todo(task)

    await loop.run(
        todo=todo,
        agent_factory=lambda persona, rk=None, model_override=None: {"persona": persona},
        session_id="obs-fail",
        max_iterations=1,
    )

    assert "bind" in observer.calls
    assert "unbind" in observer.calls
    assert observer.calls.index("unbind") > observer.calls.index("bind")


@verifies(SWR.SWR_121)
async def test_tui_run_iteration_blocked_requeues_task_as_pending() -> None:
    blocked_report = ChildReportArtifact(
        agent_name="ralph-child",
        persona="orchestrator",
        status="blocked",
        summary="Delegated to background children; waiting",
    )
    loop, _runtime_kwargs, _stored, _state, _sync = make_tui_loop(report=blocked_report)

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del record, agent, manager, agent_factory, kwargs
        return blocked_report

    loop.scheduler.run_child = _patched_run_child  # type: ignore[method-assign]

    task = TodoTask(name="delegating", description="delegating")
    task.set_execution_context("delegating")
    todo = make_todo(task)
    progress = RalphProgressFile(
        session_id="session-tui",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
    )

    iteration = await loop._run_iteration(
        iteration_num=1,
        task=task,
        progress=progress,
        agent_factory=loop._test_agent_factory,  # type: ignore[attr-defined]
        todo=todo,
    )

    # "blocked" means background children are still running — the task is
    # re-queued (base semantics), NOT abandoned, and children are NOT cancelled.
    assert iteration.outcome == RalphIterationOutcome.PENDING
    assert task.status == TaskStatus.PENDING
    assert progress.abandoned_tasks == 0


@verifies(SWR.SWR_123)
async def test_tui_escalation_sets_session_abort() -> None:
    escalated_report = ChildReportArtifact(
        agent_name="ralph-child",
        persona="tester",
        status="failed",
        summary="Escalating",
        escalation=EscalationSignal(
            session_id="session-tui",
            consecutive_activation_count=3,
            reason="unrecoverable",
        ),
    )
    loop, _runtime_kwargs, _stored, _state, _sync = make_tui_loop(report=escalated_report)

    async def _patched_run_child(record, agent, *, manager=None, agent_factory=None, **kwargs):
        del record, agent, manager, agent_factory, kwargs
        return escalated_report

    loop.scheduler.run_child = _patched_run_child  # type: ignore[method-assign]

    task = TodoTask(name="escalating", description="escalating")
    task.set_execution_context("escalating")
    todo = make_todo(task)
    progress = RalphProgressFile(
        session_id="session-tui",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
    )

    await loop._run_iteration(
        iteration_num=1,
        task=task,
        progress=progress,
        agent_factory=loop._test_agent_factory,  # type: ignore[attr-defined]
        todo=todo,
    )

    assert loop._session_abort_requested is True


@verifies(SWR.SWR_911, SWR.SWR_914)
def test_resolve_message_limit_pause_records_action_and_releases_gate() -> None:
    """Productive use: user can resume a run paused at its message limit.
    Expected outcome: chosen action releases the loop-level pause gate."""
    loop = make_loop()
    loop._message_limit_pause_event.clear()

    loop.resolve_message_limit_pause("continue")

    assert loop._message_limit_pause_result == "continue"
    assert loop._message_limit_pause_event.is_set()


@verifies(SWR.SWR_2416)
def test_budgeted_policy_clamps_child_limits_to_the_orchestrator_playbook() -> None:
    """The BUDGET slot must bind the scheduler, not only the prompt text."""
    from rotaris_core.config.defaults import DEFAULT_PERSONAS

    loop = RalphLoop(
        config=RotarisConfig(
            runtime=RuntimePolicy(child_timeout=5),
            personas=dict(DEFAULT_PERSONAS),
        ),
        workspace_root="/tmp/test",
        summary_agent=MockSummaryAgent(),
        conversation_factory=lambda agent: MockConversation(),
    )

    # Unclassified run: nothing to clamp against.
    assert loop._budgeted_policy() is loop.config.runtime  # noqa: SLF001

    # `small_feature` gives the orchestrator a `tight` budget.
    loop.run_intent = "small_feature"
    clamped = loop._budgeted_policy()  # noqa: SLF001
    assert clamped.max_active_children < loop.config.runtime.max_active_children
    assert clamped.max_children < loop.config.runtime.max_children
    # Unrelated policy fields survive the clamp.
    assert clamped.child_timeout == 5


@verifies(SWR.SWR_2809)
def test_run_intent_propagates_to_the_scheduler() -> None:
    """The scheduler's stall guard cannot be route-aware without the intent."""
    loop = make_loop()

    assert loop.run_intent == ""
    assert loop.scheduler.run_intent == ""

    loop.run_intent = "question"

    assert loop.run_intent == "question"
    assert loop.scheduler.run_intent == "question"


@verifies(SWR.SWR_2416)
def test_budgeted_policy_falls_back_to_the_configured_policy_on_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loop = make_loop()
    loop.run_intent = "small_feature"

    def _boom(*args: object, **kwargs: object) -> None:
        raise RuntimeError("matrix exploded")

    monkeypatch.setattr("rotaris_core.agents.factory.resolve_playbook_for_persona", _boom)

    assert loop._budgeted_policy() is loop.config.runtime  # noqa: SLF001


# ── a run that ends leaves no record claiming to run (SWR-2906) ──────────────
"""Productive use: a user reopens a session whose run has ended.
Expected outcome: no agent in it still claims to be running."""


class _ManagerCapture(RalphIterationObserver):
    """Keeps the per-iteration ``ChildManager``, which the loop owns privately."""

    def __init__(self) -> None:
        self.manager: Any | None = None
        self.record: Any | None = None

    def on_child_created(self, record, manager, todo) -> None:  # type: ignore[no-untyped-def]
        del todo
        self.manager = manager
        self.record = record


async def _run_one_iteration(loop: RalphLoop) -> _ManagerCapture:
    capture = _ManagerCapture()
    loop._observer = capture  # noqa: SLF001
    task = TodoTask(name="A", description="Do A")
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)
    await loop._run_iteration(  # noqa: SLF001
        1,
        task,
        progress,
        lambda persona, rk=None: {"persona": persona},
        make_todo(task),
    )
    return capture


@verifies(SWR.SWR_2912)
@pytest.mark.asyncio
async def test_a_blocked_iteration_leaves_its_record_terminal() -> None:
    """A delegating orchestrator ends its conversation; its record must end with it.

    This is the exact shape that left ``1 live`` on a completed run: the agent
    delegated, the task was re-queued, and the record stayed ``running`` in the
    snapshot for every host to read back.
    """
    loop = make_loop(
        report=ChildReportArtifact(
            agent_name="task-1",
            persona="orchestrator",
            status="blocked",
            summary="Waiting for delegated children",
        )
    )

    capture = await _run_one_iteration(loop)

    assert capture.record.state is ChildTaskState.SUCCEEDED
    # Not BLOCKED: the hosts render that as a failure, and an ordinary
    # delegation is not one. The outstanding work rides on the task's status.
    assert capture.record.state is not ChildTaskState.BLOCKED


@verifies(SWR.SWR_2912)
@pytest.mark.asyncio
async def test_a_requeued_iteration_leaves_its_record_terminal() -> None:
    """The plain re-queue fallthrough closes its record too."""
    loop = make_loop(
        report=ChildReportArtifact(
            agent_name="task-1",
            persona="orchestrator",
            status="needs_more_work",
            summary="Not finished yet",
        )
    )

    capture = await _run_one_iteration(loop)

    assert capture.record.state is ChildTaskState.SUCCEEDED


async def _run_one_failing_iteration(loop: RalphLoop, error: BaseException) -> _ManagerCapture:
    """Drive one iteration whose child run raises, and keep its manager."""
    capture = _ManagerCapture()
    loop._observer = capture  # noqa: SLF001

    async def _raise(*args: object, **kwargs: object) -> None:
        del args, kwargs
        raise error

    loop.scheduler.run_child = _raise  # type: ignore[method-assign]

    task = TodoTask(name="A", description="Do A")
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)
    with pytest.raises(type(error)):
        await loop._run_iteration(  # noqa: SLF001
            1,
            task,
            progress,
            lambda persona, rk=None: {"persona": persona},
            make_todo(task),
        )
    return capture


@verifies(SWR.SWR_2912)
@pytest.mark.asyncio
async def test_a_cancelled_iteration_leaves_its_record_cancelled() -> None:
    """Cancelling a run closes the record the scheduler's own sweep walks past.

    ``cancel_children`` iterates the scheduler's *dispatched* tasks, and the
    iteration's own record is awaited inline — it was never among them.
    """
    capture = await _run_one_failing_iteration(make_loop(), asyncio.CancelledError())

    assert capture.record.state is ChildTaskState.CANCELLED
    assert capture.manager.all_terminal


@verifies(SWR.SWR_2912)
@pytest.mark.asyncio
async def test_a_crashed_iteration_leaves_its_record_failed() -> None:
    capture = await _run_one_failing_iteration(make_loop(), RuntimeError("agent exploded"))

    assert capture.record.state is ChildTaskState.FAILED
    assert capture.manager.all_terminal


@verifies(SWR.SWR_2912)
@pytest.mark.asyncio
async def test_a_cancelled_iteration_also_closes_a_child_it_never_dispatched() -> None:
    """A delegated child that never got a slot must not outlive the run either."""
    capture = _ManagerCapture()
    loop = make_loop()
    loop._observer = capture  # noqa: SLF001

    async def _cancel_after_delegating(*args: object, **kwargs: object) -> None:
        del args, kwargs
        capture.manager.spawn_child("helper", "coder", "never dispatched")
        raise asyncio.CancelledError

    loop.scheduler.run_child = _cancel_after_delegating  # type: ignore[method-assign]

    task = TodoTask(name="A", description="Do A")
    progress = RalphProgressFile(session_id="s", started_at=dt.datetime.now(dt.UTC), total_tasks=1)
    with pytest.raises(asyncio.CancelledError):
        await loop._run_iteration(  # noqa: SLF001
            1,
            task,
            progress,
            lambda persona, rk=None: {"persona": persona},
            make_todo(task),
        )

    assert capture.manager._children["helper"].state is ChildTaskState.CANCELLED  # noqa: SLF001
    assert capture.manager.all_terminal
