"""Host-neutral mutations for live and persisted Rotaris todo lists."""

from __future__ import annotations

from typing import Any, Literal

from rotaris_core.reqtocode import SWR, traces

TodoEditOperation = Literal["add", "remove", "rename"]


@traces(SWR.SWR_2028)
def edit_todo_list(
    todo: Any,
    operation: TodoEditOperation,
    target_id: str,
    text: str = "",
) -> bool:
    """Mutate one backend ``TodoList`` in place; return whether it changed."""
    cleaned = text.strip()
    if operation == "add":
        if not cleaned:
            return False
        phase = todo.get_phase_by_id(target_id)
        if phase is None:
            return False
        from rotaris_core.tools.todo_state import TodoTask

        phase.tasks.append(TodoTask(name=cleaned))
        return True
    if operation == "rename":
        if not cleaned:
            return False
        task = todo.get_task_by_id(target_id)
        if task is None or task.name == cleaned:
            return False
        task.name = cleaned
        return True
    if operation == "remove":
        for phase in todo.phases:
            for index, task in enumerate(phase.tasks):
                if task.id == target_id:
                    phase.tasks.pop(index)
                    return True
        return False
    return False
