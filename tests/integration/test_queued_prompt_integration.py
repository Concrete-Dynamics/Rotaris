from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence

import pytest

from rotaris_core.api.prompts import prompt_api
from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.core.prompt_types import PromptRegistry, QueuedStatus
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.ralph import RalphLoop
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask


# Mocking classes used by RalphLoop
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

    def conversation_factory(agent):
        return MockConversation(events=[MockToolEvent("bash")])

    return RalphLoop(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=5)),
        workspace_root="/tmp/test",
        summary_agent=summary_agent,
        conversation_factory=conversation_factory,
    )


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


@pytest.fixture(autouse=True)
def cleanup_registry():
    """Ensure PromptRegistry is clean before and after each test."""
    registry = PromptRegistry()
    # Clear internal dicts since it's a singleton
    with registry._lock:
        registry._steering_prompts.clear()
        registry._queued_prompts.clear()
    yield
    with registry._lock:
        registry._steering_prompts.clear()
        registry._queued_prompts.clear()


@verifies(SWR.SWR_1005)
@pytest.mark.asyncio
async def test_queued_prompt_triggers_new_task_after_current_work_completes():
    """Verifies that a queued prompt is detected and added as a new TodoPhase
    once the current TodoList is empty.
    """
    # 1. Setup: Initial TodoList with 1 task
    todo = make_todo(1)
    task_id = todo.phases[0].tasks[0].id

    # We want the first task to succeed.
    # We need two reports because the loop will run TWO iterations.
    reports = [
        make_report(task_id, "succeeded", "First task complete"),
        make_report("queued-task-id", "succeeded", "Queued task complete"),
    ]
    loop = make_loop(reports)

    # 2. Queue a prompt
    queued_content = "This is a queued prompt"
    queued_id = prompt_api.submit_queued(queued_content, {"context": "test"})

    # Verify it's in the registry as QUEUED
    registry = PromptRegistry()
    queued_prompts = registry.get_queued_prompts()
    assert len(queued_prompts) == 1
    assert queued_prompts[0].id == queued_id
    assert queued_prompts[0].status == QueuedStatus.QUEUED

    # 3. Run the loop
    def agent_factory_wrapper(persona, kwargs=None):
        class SimpleAgent:
            def __init__(self, p):
                self.persona = p

        return SimpleAgent(persona)

    # Run the loop in a background task to allow interleaving if needed
    # but since we already queued it, it should be picked up at the end of the first task.
    loop_task = asyncio.create_task(
        loop.run(todo, agent_factory=agent_factory_wrapper, session_id="session-queued-test"),
    )

    # Wait for it to finish
    progress = await loop_task

    # 4. Assertions

    # Total tasks should be 2: original task + 1 queued task
    assert progress.total_tasks == 2

    # Check if the queued task was added to the todo list
    # It should be in a NEW phase named "Queued Prompts"
    queued_phase = next((p for p in todo.phases if p.name == "Queued Prompts"), None)
    assert queued_phase is not None, (
        f"Expected a 'Queued Prompts' phase to be created. Phases: {todo.phases}"
    )
    assert len(queued_phase.tasks) == 1

    queued_task = queued_phase.tasks[0]
    assert queued_task.description == queued_content
    assert queued_task.name == f"Queued Prompt: {queued_id[:8]}"

    # Check if prompt status was updated to TRIGGERED
    triggered_prompt = next((p for p in registry.get_queued_prompts() if p.id == queued_id), None)
    assert triggered_prompt is not None
    assert triggered_prompt.status == QueuedStatus.TRIGGERED

    # Check iterations:
    # Iteration 1: Original task
    # Iteration 2: Queued task (the loop should have run it)
    assert len(progress.iterations) == 2
