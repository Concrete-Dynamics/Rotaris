from __future__ import annotations

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo import TodoAction, TodoExecutor
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask


@verifies(SWR.SWR_517, SWR.SWR_518, SWR.SWR_522)
def test_todo_list_crud_helpers() -> None:
    task = TodoTask(id="task1", name="Task 1")
    phase = TodoPhase(id="phase1", name="Phase 1", tasks=[task])
    todo_list = TodoList(phases=[phase])

    assert todo_list.get_task_by_id("task1") == task
    assert todo_list.get_phase_by_id("phase1") == phase
    assert todo_list.get_task_by_id("missing") is None
    assert todo_list.get_phase_by_id("missing") is None


@verifies(SWR.SWR_519, SWR.SWR_524)
def test_replace_preserves_completed_tasks() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(
                    id="phase1",
                    name="Phase 1",
                    tasks=[TodoTask(id="task1", name="Old", status=TaskStatus.COMPLETED)],
                ),
            ],
        ),
    )

    obs = executor(
        TodoAction(
            operation="replace",
            payload={
                "phases": [
                    {
                        "id": "phase1",
                        "name": "Phase 1",
                        "tasks": [{"id": "task1", "name": "New", "status": "PENDING"}],
                    },
                ],
            },
        ),
    )

    assert not obs.is_error
    assert obs.state.get_task_by_id("task1").status == TaskStatus.COMPLETED
    assert obs.state.get_task_by_id("task1").name == "Old"


@verifies(SWR.SWR_519, SWR.SWR_524)
def test_replace_allows_in_progress_task_to_be_updated() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(
                    id="phase1",
                    name="Phase 1",
                    tasks=[TodoTask(id="task1", name="Current", status=TaskStatus.IN_PROGRESS)],
                ),
            ],
        ),
    )

    obs = executor(
        TodoAction(
            operation="replace",
            payload={
                "phases": [
                    {
                        "id": "phase1",
                        "name": "Phase 1",
                        "tasks": [{"id": "task1", "name": "Updated", "status": "PENDING"}],
                    },
                ],
            },
        ),
    )

    assert not obs.is_error
    assert obs.state.get_task_by_id("task1").status == TaskStatus.PENDING
    assert obs.state.get_task_by_id("task1").name == "Updated"


@verifies(SWR.SWR_519, SWR.SWR_522)
def test_add_phase_creates_new_phase() -> None:
    obs = TodoExecutor()(
        TodoAction(operation="add_phase", payload={"name": "Phase 1", "tasks": []}),
    )

    assert not obs.is_error
    assert len(obs.state.phases) == 1
    assert obs.state.phases[0].name == "Phase 1"


@verifies(SWR.SWR_519, SWR.SWR_522)
def test_add_task_adds_to_existing_phase() -> None:
    executor = TodoExecutor(TodoList(phases=[TodoPhase(id="phase1", name="Phase 1", tasks=[])]))

    obs = executor(
        TodoAction(
            operation="add_task",
            payload={"phase_id": "phase1", "task": {"id": "task1", "name": "Task 1"}},
        ),
    )

    assert not obs.is_error
    assert obs.state.get_task_by_id("task1").name == "Task 1"


@verifies(SWR.SWR_519)
def test_add_task_accepts_flat_payload_shape() -> None:
    executor = TodoExecutor(TodoList(phases=[TodoPhase(id="phase1", name="Phase 1", tasks=[])]))

    obs = executor(
        TodoAction(
            operation="add_task",
            payload={"phase_id": "phase1", "name": "Task 1", "description": "flat"},
        ),
    )

    assert not obs.is_error
    task = obs.state.get_task_by_id(obs.state.phases[0].tasks[0].id)
    assert task is not None
    assert task.name == "Task 1"
    assert task.description == "flat"


@verifies(SWR.SWR_520, SWR.SWR_521)
def test_update_changes_status() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(id="phase1", name="Phase 1", tasks=[TodoTask(id="task1", name="Task 1")]),
            ],
        ),
    )

    obs = executor(
        TodoAction(operation="update", payload={"task_id": "task1", "status": "COMPLETED"}),
    )

    assert not obs.is_error
    assert obs.state.get_task_by_id("task1").status == TaskStatus.COMPLETED


@verifies(SWR.SWR_520, SWR.SWR_521)
def test_update_changes_name() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(id="phase1", name="Phase 1", tasks=[TodoTask(id="task1", name="Task 1")]),
            ],
        ),
    )

    obs = executor(TodoAction(operation="update", payload={"task_id": "task1", "name": "Renamed"}))

    assert not obs.is_error
    assert obs.state.get_task_by_id("task1").name == "Renamed"


@verifies(SWR.SWR_520)
def test_remove_task_removes_task() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(id="phase1", name="Phase 1", tasks=[TodoTask(id="task1", name="Task 1")]),
            ],
        ),
    )

    obs = executor(TodoAction(operation="remove_task", payload={"task_id": "task1"}))

    assert not obs.is_error
    assert obs.state.get_task_by_id("task1") is None


@verifies(SWR.SWR_523)
def test_in_progress_invariant_allows_only_one_task() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(
                    id="phase1",
                    name="Phase 1",
                    tasks=[TodoTask(id="task1", name="Task 1", status=TaskStatus.IN_PROGRESS)],
                ),
            ],
        ),
    )

    with pytest.raises(ValueError, match="Only one task can be IN_PROGRESS"):
        executor(
            TodoAction(
                operation="add_task",
                payload={
                    "phase_id": "phase1",
                    "task": {"id": "task2", "name": "Task 2", "status": "IN_PROGRESS"},
                },
            ),
        )


@verifies(SWR.SWR_523)
def test_in_progress_conflict_error_mentions_active_task() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(
                    id="phase1",
                    name="Phase 1",
                    tasks=[TodoTask(id="task1", name="Task 1", status=TaskStatus.IN_PROGRESS)],
                ),
            ],
        ),
    )

    with pytest.raises(ValueError, match=r"Active task: task1 \(Task 1\)"):
        executor(
            TodoAction(
                operation="add_task",
                payload={
                    "phase_id": "phase1",
                    "task": {"id": "task2", "name": "Task 2", "status": "IN_PROGRESS"},
                },
            ),
        )


@verifies(SWR.SWR_520, SWR.SWR_521)
def test_update_rejects_noop_change() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(
                    id="phase1",
                    name="Phase 1",
                    tasks=[
                        TodoTask(
                            id="task1",
                            name="Task 1",
                            status=TaskStatus.COMPLETED,
                            description="Already done",
                        ),
                    ],
                ),
            ],
        ),
    )

    with pytest.raises(ValueError, match="Todo update made no changes"):
        executor(
            TodoAction(
                operation="update",
                payload={"task_id": "task1", "status": "COMPLETED"},
            ),
        )


@verifies(SWR.SWR_525, SWR.SWR_1425)
def test_todo_observation_to_llm_content_is_compact() -> None:
    task = TodoTask(id="task1", name="Task 1", description="x" * 500)
    obs = TodoExecutor(TodoList(phases=[TodoPhase(id="phase1", name="Phase 1", tasks=[task])]))(
        TodoAction(operation="update", payload={"task_id": "task1", "name": "Renamed"}),
    )

    rendered = obs.to_llm_content[0].text
    assert "Todo state:" in rendered
    assert "phase1" in rendered
    assert "task1" in rendered
    assert "x" * 120 not in rendered


@verifies(SWR.SWR_519)
def test_unknown_operation_raises_value_error() -> None:
    """Unknown operation must raise ValueError (not ValidationError) so the SDK
    can feed it back to the LLM as an error observation rather than crashing.
    """
    executor = TodoExecutor()

    with pytest.raises(ValueError, match="Unsupported operation"):
        executor(TodoAction(operation="validate_task", payload={}))


@verifies(SWR.SWR_519)
def test_unknown_operation_action_constructs_without_validation_error() -> None:
    """TodoAction must accept any string for operation — pydantic must NOT reject
    unknown values at construction time (that's the executor's job).
    """
    action = TodoAction(operation="validate_task", payload={})
    assert action.operation == "validate_task"


@verifies(SWR.SWR_519)
def test_replace_with_no_matching_completed_tasks_is_clean_replacement() -> None:
    executor = TodoExecutor(
        TodoList(
            phases=[
                TodoPhase(
                    id="phase1",
                    name="Phase 1",
                    tasks=[TodoTask(id="task1", name="Old", status=TaskStatus.COMPLETED)],
                ),
            ],
        ),
    )

    obs = executor(
        TodoAction(
            operation="replace",
            payload={
                "phases": [
                    {
                        "id": "phase2",
                        "name": "Phase 2",
                        "tasks": [{"id": "task2", "name": "New Task", "status": "PENDING"}],
                    },
                ],
            },
        ),
    )

    assert not obs.is_error
    assert obs.state.get_task_by_id("task1") is None
    assert obs.state.get_task_by_id("task2").status == TaskStatus.PENDING
