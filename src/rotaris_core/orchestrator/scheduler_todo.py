"""Todo tracking helpers for the Scheduler."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    OpenTodoItemsProvider = Callable[[], list[str]]

_log = logging.getLogger(__name__)


@dataclass(slots=True)
class _OpenTodoTracker:
    extractor: Callable[[Any], list[str]]
    items: list[str] = field(default_factory=list)

    def capture(self, todo: Any) -> None:
        self.items[:] = self.extractor(todo)

    def snapshot(self) -> list[str]:
        return list(self.items)


def make_open_todo_tracker(
    extractor: Callable[[Any], list[str]],
) -> tuple[Callable[[Any], None], OpenTodoItemsProvider]:
    tracker = _OpenTodoTracker(extractor=extractor)
    return tracker.capture, tracker.snapshot


def extract_open_todo_items(todo: Any) -> list[str]:
    from rotaris_core.tools.todo_state import TaskStatus, TodoList

    try:
        parsed = todo if isinstance(todo, TodoList) else TodoList.model_validate(todo)
    except Exception:  # noqa: BLE001
        _log.exception("Failed to parse todo state for open-item reminder")
        return []

    return [
        task.name
        for phase in parsed.phases
        for task in phase.tasks
        if task.status in {TaskStatus.PENDING, TaskStatus.IN_PROGRESS}
    ]


def get_open_todo_items(
    provider: OpenTodoItemsProvider | None,
) -> list[str]:
    if provider is None:
        return []
    try:
        return [item for item in provider() if item.strip()]
    except Exception:  # noqa: BLE001
        _log.exception("Failed to collect open todo items for reminder")
        return []


@traces(SWR.SWR_122)
def build_open_todo_reminder_lines(open_todo_items: list[str] | None) -> list[str]:
    if not open_todo_items:
        return []

    lines = ["", "Your open todo items are:"]
    for item in open_todo_items[:5]:
        lines.append(f"- {item}")
    remaining = len(open_todo_items) - 5
    if remaining > 0:
        lines.append(f"- ...and {remaining} more")
    lines.append("Keep your todo list current as you continue.")
    return lines
