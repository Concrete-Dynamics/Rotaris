from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.ralph import RalphIterationOutcome, RalphLoop
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from collections.abc import Sequence


class MockToolEvent:
    def __init__(self, tool_name: str = "bash", action: str = ""):
        self.tool_name = tool_name
        self.action = action


class MockState:
    def __init__(self, events=None):
        self.events = events or []


class MockConversation:
    def __init__(self, events=None, should_fail=False, delay=0):
        self.state = MockState(events or [])
        self.should_fail = should_fail
        self.delay = delay
        self.closed = False
        self.paused = False
        self.message_sent = None

    def send_message(self, msg):
        self.message_sent = msg

    def run(self):
        import time

        if self.delay:
            time.sleep(self.delay)
        if self.should_fail:
            raise RuntimeError("Agent failed")

    def pause(self):
        self.paused = True

    def close(self):
        self.closed = True


class MockSummaryAgent:
    def __init__(self, reports: Sequence[ChildReportArtifact] | None = None):
        self._reports = list(reports or [])
        self.calls = []

    async def generate_report(self, record, transcript, *, fallback_status="failed"):
        self.calls.append((record, transcript, fallback_status))
        if self._reports:
            return self._reports.pop(0)
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status=fallback_status if fallback_status != "failed" else "succeeded",
            summary="Done",
        )


def make_loop(reports: Sequence[ChildReportArtifact] | None = None) -> RalphLoop:
    summary_agent = MockSummaryAgent(reports=reports)
    report_queue = list(reports or [])

    def conversation_factory(agent):
        del agent
        return MockConversation(events=[MockToolEvent("bash")])

    loop = RalphLoop(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=5)),
        workspace_root="/tmp/test",
        summary_agent=summary_agent,
        conversation_factory=conversation_factory,
    )

    async def _run_child(
        record,
        agent,
        *,
        manager=None,
        agent_factory=None,
        **kwargs,
    ):
        del agent, manager, agent_factory, kwargs
        if report_queue:
            return report_queue.pop(0)
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Done",
        )

    loop.scheduler.run_child = _run_child  # type: ignore[method-assign]
    return loop


def make_todo(task_count: int) -> TodoList:
    return TodoList(
        phases=[
            TodoPhase(
                name="Phase 1",
                tasks=[
                    TodoTask(name=f"Task {index}", description=f"Do task {index}")
                    for index in range(1, task_count + 1)
                ],
            ),
        ],
    )


def make_report(task_id: str, status: str, summary: str) -> ChildReportArtifact:
    return ChildReportArtifact(
        agent_name=task_id,
        persona="orchestrator",
        status=status,
        summary=summary,
    )


@verifies(SWR.SWR_117, SWR.SWR_120, SWR.SWR_125)
@pytest.mark.asyncio
async def test_single_task_loop_completes_one_task() -> None:
    todo = make_todo(1)
    loop = make_loop([make_report(todo.phases[0].tasks[0].id, "succeeded", "Task complete")])

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-1",
    )

    assert progress.completed_tasks == 1
    assert progress.abandoned_tasks == 0
    assert progress.stop_reason == "all tasks completed"
    assert len(progress.iterations) == 1
    assert progress.iterations[0].outcome == RalphIterationOutcome.COMPLETED
    assert todo.phases[0].tasks[0].status == TaskStatus.COMPLETED


@verifies(SWR.SWR_117, SWR.SWR_123, SWR.SWR_125)
@pytest.mark.asyncio
async def test_multi_task_loop_completes_all_tasks_sequentially():
    todo = make_todo(3)
    reports = [
        make_report(task.id, "succeeded", f"Completed {task.name}") for task in todo.phases[0].tasks
    ]
    loop = make_loop(reports)

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-2",
    )

    assert progress.completed_tasks == 3
    assert progress.abandoned_tasks == 0
    assert len(progress.iterations) == 3
    assert progress.stop_reason == "all tasks completed"
    assert all(task.status == TaskStatus.COMPLETED for task in todo.phases[0].tasks)


@verifies(SWR.SWR_122, SWR.SWR_123)
@pytest.mark.asyncio
async def test_failed_task_is_abandoned_and_loop_continues_to_next_task():
    todo = make_todo(2)
    reports = [
        make_report(todo.phases[0].tasks[0].id, "failed", "First failed"),
        make_report(todo.phases[0].tasks[1].id, "succeeded", "Second completed"),
    ]
    loop = make_loop(reports)

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-3",
    )

    assert progress.completed_tasks == 1
    assert progress.abandoned_tasks == 1
    assert len(progress.iterations) == 2
    assert progress.iterations[0].outcome == RalphIterationOutcome.ABANDONED
    assert progress.iterations[1].outcome == RalphIterationOutcome.COMPLETED
    assert todo.phases[0].tasks[0].status == TaskStatus.ABANDONED
    assert todo.phases[0].tasks[1].status == TaskStatus.COMPLETED
    assert progress.stop_reason == "all tasks completed"


@verifies(SWR.SWR_123)
@pytest.mark.asyncio
async def test_iteration_limit_stops_after_requested_number_of_tasks():
    todo = make_todo(5)
    reports = [
        make_report(task.id, "succeeded", f"Completed {task.name}") for task in todo.phases[0].tasks
    ]
    loop = make_loop(reports)

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-4",
        max_iterations=2,
    )

    assert progress.completed_tasks == 2
    assert progress.abandoned_tasks == 0
    assert len(progress.iterations) == 2
    assert progress.stop_reason == "iteration limit reached"
    assert [task.status for task in todo.phases[0].tasks] == [
        TaskStatus.COMPLETED,
        TaskStatus.COMPLETED,
        TaskStatus.PENDING,
        TaskStatus.PENDING,
        TaskStatus.PENDING,
    ]


@verifies(SWR.SWR_123)
@pytest.mark.asyncio
async def test_empty_todo_stops_immediately_with_no_pending_tasks():
    todo = TodoList(phases=[])
    loop = make_loop()

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-5",
    )

    assert progress.completed_tasks == 0
    assert progress.abandoned_tasks == 0
    assert progress.iterations == []
    assert progress.stop_reason == "no pending tasks"


# ── a run that ends leaves no record claiming to run (SWR-2906) ──────────────


class _SnapshotObserver(RalphIterationObserver):
    """Mirrors child records into a snapshot the way the hosts persist them.

    ``RunBridge._apply`` and the TUI's ``sync_children`` both do exactly this —
    merge ``snapshot_children()`` by canonical name into ``SessionState.child_states``
    — and that snapshot is what every reader takes as the truth about a session
    after the run is over.
    """

    def __init__(self) -> None:
        self.child_states: dict[str, dict[str, object]] = {}

    def _mirror(self, manager) -> None:  # type: ignore[no-untyped-def]
        for record in manager.snapshot_children():
            self.child_states[record.canonical_name] = record.model_dump(mode="json")

    def on_child_created(self, record, manager, todo) -> None:  # type: ignore[no-untyped-def]
        del record, todo
        self._mirror(manager)

    def on_child_running(self, record, manager) -> None:  # type: ignore[no-untyped-def]
        del record
        self._mirror(manager)

    def on_iteration_end(self, record, report, manager, todo, outcome) -> None:  # type: ignore[no-untyped-def]
        del record, report, todo, outcome
        self._mirror(manager)


@verifies(SWR.SWR_2912)
@pytest.mark.asyncio
async def test_a_run_that_ends_while_delegating_persists_no_running_agent() -> None:
    """Productive use: a user reopens a run that stopped mid-delegation.
    Expected outcome: the snapshot names no agent that is still running."""
    todo = make_todo(1)
    task_id = todo.phases[0].tasks[0].id
    loop = make_loop(
        [
            make_report(task_id, "blocked", "Delegated the work and ended my turn"),
            make_report(task_id, "blocked", "Still waiting on the delegated work"),
        ]
    )
    observer = _SnapshotObserver()
    loop._observer = observer  # noqa: SLF001

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: {"persona": persona},
        session_id="session-blocked",
        max_iterations=2,
    )

    assert progress.stop_reason == "iteration limit reached"
    assert observer.child_states, "the run recorded no agents at all"
    still_running = [
        name
        for name, raw in observer.child_states.items()
        if not ChildTaskState(str(raw["state"])).is_terminal()
    ]
    assert still_running == []
