from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rich.console import Group
from rich.text import Text
from textual.containers import VerticalScroll
from textual.widgets import Static

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.todo_state import TaskStatus, TodoList
from rotaris_core.tui.palette import RenderPalette
from rotaris_core.tui.themes import get_theme

if TYPE_CHECKING:
    from rich.console import RenderableType


@traces(SWR.SWR_1004, SWR.SWR_1031, SWR.SWR_1043, SWR.SWR_1044, SWR.SWR_1045, SWR.SWR_1048)
class TodoPane(VerticalScroll):
    def __init__(self, **kwargs: Any) -> None:
        kwargs.pop("shrink", None)
        super().__init__(**kwargs)
        self._content = Static()
        self.todo: TodoList | None = None
        self.source: str = "plan"
        self.border_title = " todo "
        self.border_subtitle = "idle"
        p = RenderPalette.from_theme(get_theme())
        self.styles.border = ("solid", p.border)

    def compose(self) -> Any:
        yield self._content

    def update_todos(self, todo: TodoList, *, source: str = "agent") -> None:
        self.todo = todo
        self.source = source
        self.border_subtitle = source
        p = RenderPalette.from_theme(get_theme())
        self.styles.border = ("solid", p.green) if todo else ("solid", p.border)
        self._content.update(self._build_renderable())

    def _build_renderable(self) -> RenderableType:
        p = RenderPalette.from_theme(get_theme())

        if not self.todo:
            empty = Text()
            empty.append("\nNo tasks yet.\n\n", style=f"bold {p.fg_muted}")
            empty.append(
                "The agent's todo list will appear here once it starts planning.",
                style=p.fg_dim,
            )
            return empty

        summary = self._render_summary()
        out = Text()

        for phase in self.todo.phases:
            out.append(f"{phase.name.lower()}  ", style=f"bold {p.fg}")
            out.append(f"{len(phase.tasks)} tasks\n", style=p.fg_muted)
            for task in phase.tasks:
                if task.status == TaskStatus.COMPLETED:
                    out.append("  [x] ", style=f"bold {p.blue}")
                    out.append(f"{task.name}\n", style=p.blue)
                else:
                    out.append("  [ ] ", style=f"bold {p.fg_subtle}")
                    out.append(f"{task.name}\n", style=p.fg)

        body = Group(summary, Text(""), out)
        return body

    def _render_summary(self) -> Text:
        p = RenderPalette.from_theme(get_theme())

        if self.todo is None:
            raise RuntimeError("Todo summary requested without a todo model")

        completed = 0
        in_progress = 0
        pending = 0
        failed = 0
        for phase in self.todo.phases:
            for task in phase.tasks:
                if task.status == TaskStatus.COMPLETED:
                    completed += 1
                elif task.status == TaskStatus.IN_PROGRESS:
                    in_progress += 1
                elif task.status == TaskStatus.ABANDONED:
                    failed += 1
                else:
                    pending += 1

        summary = Text()
        items = [
            ("[x]", completed, p.blue),
            ("[>]", in_progress, p.green),
            ("[ ]", pending, p.fg_subtle),
            ("[-]", failed, p.red),
        ]
        for index, (icon, value, color) in enumerate(items):
            if index:
                summary.append("  ")
            summary.append(icon, style=f"bold {color}")
            summary.append(f" {value}", style=f"bold {p.fg}")
        return summary
