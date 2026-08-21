"""TodoPane rendering of the agent todo list."""

from __future__ import annotations

from rich.console import Console

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask
from rotaris_core.tui.widgets.todo_pane import TodoPane


def _render(todo: TodoList) -> str:
    pane = TodoPane()
    pane.todo = todo
    # `no_color` drops the colour codes but not the rest of the SGR styling, and
    # Rich still emits that whenever it believes it is writing to a terminal --
    # which `FORCE_COLOR` in the environment is enough to convince it of, even
    # under `capture()`. The bold runs around the checkbox then split it from the
    # task name, so `[x] done task` stops being a substring of the render. Saying
    # outright that this console is not a terminal keeps the output plain text
    # regardless of the environment the suite is run in.
    console = Console(width=80, no_color=True, legacy_windows=False, force_terminal=False)
    with console.capture() as capture:
        console.print(pane._build_renderable())
    return capture.get()


@verifies(SWR.SWR_1044, SWR.SWR_1049)
def test_todo_pane_renders_markdown_checkboxes_per_task_status() -> None:
    """Productive use: operators read progress as a familiar Markdown checklist.
    Expected outcome: completed tasks render `[x]`, every other status renders `[ ]`."""
    todo = TodoList(
        phases=[
            TodoPhase(
                name="Main",
                tasks=[
                    TodoTask(name="done task", status=TaskStatus.COMPLETED),
                    TodoTask(name="running task", status=TaskStatus.IN_PROGRESS),
                    TodoTask(name="pending task", status=TaskStatus.PENDING),
                    TodoTask(name="dropped task", status=TaskStatus.ABANDONED),
                ],
            )
        ]
    )

    rendered = _render(todo)

    assert "[x] done task" in rendered
    assert "[ ] running task" in rendered
    assert "[ ] pending task" in rendered
    assert "[ ] dropped task" in rendered


@verifies(SWR.SWR_1044)
def test_todo_pane_drops_legacy_chip_labels_and_keeps_phase_headers() -> None:
    """Productive use: the pane stays readable in a narrow right rail.
    Expected outcome: phase headers survive, the old `done`/`run`/`todo`/`drop` chips do not."""
    todo = TodoList(
        phases=[
            TodoPhase(name="Research", tasks=[TodoTask(name="a", status=TaskStatus.COMPLETED)]),
            TodoPhase(name="Build", tasks=[TodoTask(name="b", status=TaskStatus.PENDING)]),
        ]
    )

    rendered = _render(todo)

    assert "research" in rendered
    assert "build" in rendered
    for chip in (" done ", " run ", " todo ", " drop "):
        assert chip not in rendered
