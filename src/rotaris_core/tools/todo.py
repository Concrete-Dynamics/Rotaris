from __future__ import annotations

from typing import TYPE_CHECKING, Any, Self

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence


_MAX_SUMMARY_DESCRIPTION_CHARS = 80

_TODO_TOOL_DESCRIPTION = (
    "Manage a phased todo list. Use operation='add_phase' with "
    "payload={'name': <phase name>, 'tasks': []}. Use operation='add_task' with "
    "payload={'phase_id': <phase id>, 'task': {'name': <task name>, "
    "'description': <optional>, 'status': 'PENDING'|'IN_PROGRESS'|'COMPLETED'|"
    "'ABANDONED'}}. Flat add_task payloads are also accepted: "
    "payload={'phase_id': <phase id>, 'name': <task name>, ...}. "
    "Use operation='update' with payload containing 'task_id' plus any of "
    "'status', 'name', or 'description'. Use operation='remove_task' with "
    "payload={'task_id': <task id>}. Use operation='replace' only when "
    "replacing the full phased todo list. Keep entries concise. Only one "
    "task can be IN_PROGRESS at a time."
)


class TodoAction(Action):
    operation: str = Field(
        ...,
        description=(
            "Todo operation name. Valid values: replace, add_phase, add_task, update, remove_task."
        ),
    )
    payload: dict[str, Any] = Field(default_factory=dict)


class TodoObservation(Observation):
    state: TodoList = Field(default_factory=TodoList)

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        summary = _render_todo_summary(self.state)
        text = (self.text or "") + ("\n" if self.text and summary else "") + summary
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


@traces(SWR.SWR_517, SWR.SWR_519, SWR.SWR_520, SWR.SWR_521, SWR.SWR_523, SWR.SWR_524)
class TodoExecutor(ToolExecutor[TodoAction, TodoObservation]):
    def __init__(
        self,
        initial_state: TodoList | None = None,
        on_state_change: Callable[[TodoList], None] | None = None,
    ) -> None:
        self.state = initial_state.model_copy(deep=True) if initial_state else TodoList()
        self._on_state_change = on_state_change

    def __call__(self, action: TodoAction, conversation: object = None) -> TodoObservation:
        del conversation
        obs = self._execute(action)
        if self._on_state_change is not None:
            self._on_state_change(self.state)
        return obs

    def _execute(self, action: TodoAction) -> TodoObservation:
        if action.operation == "replace":
            incoming = TodoList.model_validate(action.payload)
            protected = {
                task.id: task.model_copy(deep=True)
                for phase in self.state.phases
                for task in phase.tasks
                if task.status in {TaskStatus.COMPLETED, TaskStatus.ABANDONED}
            }
            for phase in incoming.phases:
                phase.tasks = [protected.get(task.id, task) for task in phase.tasks]
            self._ensure_single_in_progress(incoming)
            self.state = incoming
            return TodoObservation.from_text("Replaced todo list", state=self.state)

        if action.operation == "add_phase":
            phase = TodoPhase.model_validate(action.payload)
            self.state.phases.append(phase)
            return TodoObservation.from_text("Added phase", state=self.state)

        if action.operation == "add_task":
            phase_id_raw = action.payload.get("phase_id")
            if not phase_id_raw or (isinstance(phase_id_raw, str) and not phase_id_raw.strip()):
                if self.state.phases:
                    hints = ", ".join(f"{p.id} ({p.name})" for p in self.state.phases)
                    raise ValueError(
                        f"Missing required payload field: phase_id. Available phases: {hints}",
                    )
                raise ValueError(
                    "Missing required payload field: phase_id. No phases exist yet — "
                    "call add_phase first.",
                )
            phase_id = str(phase_id_raw)
            task_payload = _normalize_add_task_payload(action.payload)
            found_phase = self.state.get_phase_by_id(phase_id)
            if found_phase is None:
                hints = ", ".join(f"{p.id} ({p.name})" for p in self.state.phases)
                raise ValueError(f"Unknown phase: {phase_id!r}. Available phases: {hints}")
            phase = found_phase
            task = TodoTask.model_validate(task_payload)
            if task.status == TaskStatus.IN_PROGRESS:
                self._ensure_can_mark_in_progress(task.id)
            phase.tasks.append(task)
            return TodoObservation.from_text("Added task", state=self.state)

        if action.operation == "update":
            task_id = _require_payload_value(action.payload, "task_id", state=self.state)
            found_task = self.state.get_task_by_id(task_id)
            if found_task is None:
                raise ValueError(f"Unknown task: {task_id}")
            task = found_task
            changed = False
            if "status" in action.payload:
                new_status = TaskStatus(action.payload["status"])
                if new_status != task.status:
                    if new_status == TaskStatus.IN_PROGRESS:
                        self._ensure_can_mark_in_progress(task.id)
                    task.status = new_status
                    changed = True
            if "name" in action.payload:
                new_name = str(action.payload["name"])
                if new_name != task.name:
                    task.name = new_name
                    changed = True
            if "description" in action.payload:
                new_description = action.payload["description"]
                if new_description != task.description:
                    task.description = new_description
                    changed = True
            if not changed:
                raise ValueError(
                    "Todo update made no changes. Provide a different status, name, or description.",
                )
            self._ensure_single_in_progress(self.state)
            return TodoObservation.from_text("Updated task", state=self.state)

        if action.operation == "remove_task":
            task_id = _require_payload_value(action.payload, "task_id", state=self.state)
            for phase in self.state.phases:
                for index, task in enumerate(phase.tasks):
                    if task.id == task_id:
                        phase.tasks.pop(index)
                        return TodoObservation.from_text("Removed task", state=self.state)
            raise ValueError(f"Unknown task: {task_id}")

        raise ValueError(f"Unsupported operation: {action.operation}")

    def _ensure_single_in_progress(self, state: TodoList) -> None:
        count = sum(
            1
            for phase in state.phases
            for task in phase.tasks
            if task.status == TaskStatus.IN_PROGRESS
        )
        if count > 1:
            raise ValueError("Only one task can be IN_PROGRESS at a time")

    def _ensure_can_mark_in_progress(self, task_id: str) -> None:
        active = next(
            (
                task
                for phase in self.state.phases
                for task in phase.tasks
                if task.status == TaskStatus.IN_PROGRESS and task.id != task_id
            ),
            None,
        )
        if active is not None:
            raise ValueError(
                "Only one task can be IN_PROGRESS at a time. "
                f"Active task: {active.id} ({active.name}). Mark it COMPLETED or ABANDONED "
                "before moving another task to IN_PROGRESS.",
            )


class TodoTool(ToolDefinition[TodoAction, TodoObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        initial_state = kwargs.get("initial_state")
        return [
            cls(
                description=_TODO_TOOL_DESCRIPTION,
                action_type=TodoAction,
                observation_type=TodoObservation,
                executor=TodoExecutor(initial_state=initial_state),
            ),
        ]


def _require_payload_value(
    payload: dict[str, Any],
    key: str,
    *,
    state: TodoList | None = None,
) -> str:
    value = payload.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        if key == "task_id" and state is not None:
            all_tasks = [
                f"{task.id} ({task.name})" for phase in state.phases for task in phase.tasks
            ]
            if all_tasks:
                hints = ", ".join(all_tasks)
                raise ValueError(f"Missing required payload field: {key}. Available tasks: {hints}")
        raise ValueError(f"Missing required payload field: {key}")
    return str(value)


def _normalize_add_task_payload(payload: dict[str, Any]) -> dict[str, Any]:
    nested = payload.get("task")
    if isinstance(nested, dict):
        return nested

    flat_payload = dict(payload)
    flat_payload.pop("phase_id", None)
    if "title" in flat_payload and "name" not in flat_payload:
        flat_payload["name"] = flat_payload.pop("title")

    if not flat_payload:
        raise ValueError(
            "Missing required payload field: task. For add_task, pass either "
            "payload['task'] or flat task fields such as name/description/status.",
        )
    if "name" not in flat_payload:
        raise ValueError("Missing required payload field: task.name")
    return flat_payload


def _render_todo_summary(state: TodoList) -> str:
    if not state.phases:
        return "Todo state: empty"

    lines = ["Todo state:"]
    for phase in state.phases:
        lines.append(f"- Phase {phase.id} :: {phase.name}")
        if not phase.tasks:
            lines.append("  - no tasks")
            continue
        for task in phase.tasks:
            line = f"  - {task.id} :: {task.name} [{task.status}]"
            description = (task.description or "").strip()
            if description:
                compact = " ".join(description.split())
                if len(compact) > _MAX_SUMMARY_DESCRIPTION_CHARS:
                    compact = compact[: _MAX_SUMMARY_DESCRIPTION_CHARS - 1].rstrip() + "…"
                line += f" — {compact}"
            lines.append(line)
    return "\n".join(lines)
