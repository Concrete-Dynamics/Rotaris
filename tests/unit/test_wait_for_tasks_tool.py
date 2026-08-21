"""Tests for wait_for_tasks tool."""

from __future__ import annotations

import threading
import time

import pytest

from rotaris_core.config.schema import RuntimePolicy
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.wait_for_tasks import (
    WaitForTasksAction,
    WaitForTasksExecutor,
)


class PauseableConversation:
    def __init__(self) -> None:
        self.paused = False

    def pause(self) -> None:
        self.paused = True


@pytest.fixture
def policy() -> RuntimePolicy:
    return RuntimePolicy(max_children=8, max_depth=3)


@pytest.fixture
def manager(policy: RuntimePolicy) -> ChildManager:
    return ChildManager(parent_agent_id="parent", current_depth=1, policy=policy)


def _make_report(
    name: str = "child",
    persona: str = "builder",
) -> ChildReportArtifact:
    return ChildReportArtifact(
        agent_name=name,
        persona=persona,
        status="succeeded",
        summary="Done",
    )


@verifies(SWR.SWR_142, SWR.SWR_2426)
def test_pauses_when_tasks_active(manager: ChildManager) -> None:
    """Productive use: a nested agent can wait for one direct child by task ID.
    Expected outcome: the requested direct child enters the wait barrier.
    """
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    task_id = record.task_id
    conversation = PauseableConversation()

    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    obs = executor(
        WaitForTasksAction(task_ids=[task_id]),
        conversation=conversation,
    )

    assert conversation.paused is True
    assert obs.already_done is False
    assert task_id in obs.queued_ids


@verifies(SWR.SWR_142)
def test_no_pause_when_all_terminal(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    task_id = record.task_id
    report = _make_report()

    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, report)

    conversation = PauseableConversation()
    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    obs = executor(
        WaitForTasksAction(task_ids=[task_id]),
        conversation=conversation,
    )

    assert conversation.paused is False
    assert obs.already_done is True
    assert task_id in obs.queued_ids


@verifies(SWR.SWR_142, SWR.SWR_2426)
def test_empty_list_waits_for_all(manager: ChildManager) -> None:
    """Productive use: a nested agent can wait for all work it delegated.
    Expected outcome: only its active direct children enter the wait barrier.
    """
    r1 = manager.spawn_child("w1", "builder", "task 1", run_in_background=True)
    r2 = manager.spawn_child("w2", "builder", "task 2", run_in_background=True)
    unrelated = manager.spawn_child(
        "sibling-work",
        "builder",
        "unrelated task",
        run_in_background=True,
        parent_agent_id="sibling",
    )
    conversation = PauseableConversation()

    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    obs = executor(
        WaitForTasksAction(task_ids=[]),
        conversation=conversation,
    )

    assert conversation.paused is True
    assert obs.already_done is False
    assert set(obs.queued_ids) == {r1.task_id, r2.task_id}
    assert unrelated.task_id not in obs.queued_ids


@verifies(SWR.SWR_142)
def test_rejects_wait_for_callers_own_task(manager: ChildManager) -> None:
    """Productive use: a delegating agent can recover from an invalid self-wait.
    Expected outcome: its conversation remains runnable instead of deadlocking."""
    child = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    conversation = PauseableConversation()
    executor = WaitForTasksExecutor(
        manager,
        current_task_id="bg_current",
        parent_canonical_name="parent",
    )

    with pytest.raises(ValueError, match="own task"):
        executor(
            WaitForTasksAction(task_ids=["bg_current", child.task_id]),
            conversation=conversation,
        )

    assert conversation.paused is False
    assert manager.wait_barrier.consume(conversation) is None


@verifies(SWR.SWR_142)
def test_empty_wait_excludes_callers_own_task(manager: ChildManager) -> None:
    """Productive use: a delegating agent can wait for all of its child work.
    Expected outcome: its own still-running task is not included in that wait."""
    current = manager.spawn_child("current", "builder", "current work", run_in_background=True)
    child = manager.spawn_child("worker", "builder", "child work", run_in_background=True)
    conversation = PauseableConversation()
    executor = WaitForTasksExecutor(
        manager,
        current_task_id=current.task_id,
        parent_canonical_name="parent",
    )

    observation = executor(WaitForTasksAction(task_ids=[]), conversation=conversation)

    assert observation.queued_ids == [child.task_id]
    assert conversation.paused is True
    assert manager.wait_barrier.consume(conversation) == [child.task_id]


@verifies(SWR.SWR_142)
def test_empty_list_with_all_terminal_returns_done(manager: ChildManager) -> None:
    r1 = manager.spawn_child("w1", "builder", "task 1", run_in_background=True)
    r1.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("w1", ChildTaskState.SUCCEEDED, _make_report("w1"))

    conversation = PauseableConversation()
    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    obs = executor(
        WaitForTasksAction(task_ids=[]),
        conversation=conversation,
    )

    assert conversation.paused is False
    assert obs.already_done is True


@verifies(SWR.SWR_142)
def test_wait_request_lands_in_manager_wait_barrier(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    conversation = PauseableConversation()

    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    executor(WaitForTasksAction(task_ids=[record.task_id]), conversation=conversation)

    assert manager.wait_barrier.consume(conversation) == [record.task_id]
    assert not hasattr(conversation, "_rotaris_waited_ids")


@verifies(SWR.SWR_142)
def test_already_done_does_not_register_wait(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, _make_report())

    conversation = PauseableConversation()
    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    obs = executor(WaitForTasksAction(task_ids=[record.task_id]), conversation=conversation)

    assert obs.already_done is True
    assert manager.wait_barrier.consume(conversation) is None


@verifies(SWR.SWR_142)
def test_to_llm_content_waiting(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    obs = executor(WaitForTasksAction(task_ids=[record.task_id]))

    content = obs.to_llm_content
    assert len(content) == 1
    assert "Waiting for tasks" in content[0].text


@verifies(SWR.SWR_142)
def test_to_llm_content_already_done(manager: ChildManager) -> None:
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    report = _make_report()
    record.transition(ChildTaskState.RUNNING)
    manager.mark_child_terminal("worker", ChildTaskState.SUCCEEDED, report)

    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    obs = executor(WaitForTasksAction(task_ids=[record.task_id]))

    content = obs.to_llm_content
    assert len(content) == 1
    assert "already complete" in content[0].text


@verifies(SWR.SWR_142)
def test_wait_executor_does_not_block_on_slow_pause(manager: ChildManager) -> None:
    """Executor runs inside conversation.run()'s own call stack — the run
    loop cannot honor the pause until the executor returns, so the executor
    must never wait for pause() to land (was a guaranteed 20s stall)."""
    record = manager.spawn_child("worker", "builder", "do work", run_in_background=True)
    release = threading.Event()

    class _SlowPauseConversation:
        def pause(self) -> None:
            release.wait(timeout=30)

    executor = WaitForTasksExecutor(manager, parent_canonical_name="parent")
    conversation = _SlowPauseConversation()

    started = time.monotonic()
    observation = executor(
        WaitForTasksAction(task_ids=[record.task_id]),
        conversation=conversation,
    )
    elapsed = time.monotonic() - started
    release.set()

    assert elapsed < 2.0, f"executor blocked {elapsed:.1f}s on its own pause"
    assert observation.already_done is False
    assert manager.wait_barrier.consume(conversation) == [record.task_id]
