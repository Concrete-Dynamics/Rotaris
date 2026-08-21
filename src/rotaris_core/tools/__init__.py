"""Public tool surface, re-exported lazily.

Importing any submodule of a package runs this ``__init__`` first, so an eager
barrel here put the whole agent tool stack behind ``rotaris_core.tools.<x>``.
``tui/widgets/todo_pane.py`` only wants the ``TodoList`` dataclasses out of
``todo_state``, but that pulled ``ask_questions`` -> ``openhands.sdk`` ->
litellm: ~15.7s of the 16.6s it took to import ``rotaris_core.tui.app``, paid by
the TUI at startup and by all 19 TUI test modules.

The names below stay importable from this package exactly as before; they are
resolved from their submodule on first attribute access instead of at import.
``TYPE_CHECKING`` keeps the real imports visible to mypy, so nothing is
weakened to ``Any`` -- the lazy resolver only exists at runtime.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rotaris_core.tools.ask_questions import (
        AskQuestionsAction,
        AskQuestionsExecutor,
        AskQuestionsObservation,
        AskQuestionsOption,
        AskQuestionsStep,
        AskQuestionsTool,
    )
    from rotaris_core.tools.background_output import (
        BackgroundOutputAction,
        BackgroundOutputExecutor,
        BackgroundOutputObservation,
        BackgroundOutputTool,
    )
    from rotaris_core.tools.fetch import (
        FetchAction,
        FetchExecutor,
        FetchObservation,
        FetchTool,
    )
    from rotaris_core.tools.file_engine import FileToolEngine
    from rotaris_core.tools.file_read import (
        ReadFileAction,
        ReadFileExecutor,
        ReadFileObservation,
        ReadFileTool,
    )
    from rotaris_core.tools.file_write import (
        WriteFileAction,
        WriteFileExecutor,
        WriteFileObservation,
        WriteFileTool,
    )
    from rotaris_core.tools.git_commit import (
        GitCommitAction,
        GitCommitExecutor,
        GitCommitObservation,
        GitCommitTool,
    )
    from rotaris_core.tools.plugin_loader import load_plugin, load_plugins_from_dirs
    from rotaris_core.tools.terminal import (
        HardenedTerminalAction,
        HardenedTerminalExecutor,
        HardenedTerminalObservation,
        HardenedTerminalTool,
    )
    from rotaris_core.tools.todo import (
        TodoAction,
        TodoExecutor,
        TodoObservation,
        TodoTool,
    )
    from rotaris_core.tools.todo_state import (
        TaskStatus,
        TodoList,
        TodoPhase,
        TodoTask,
    )
    from rotaris_core.tools.wait_for_tasks import (
        WaitForTasksAction,
        WaitForTasksExecutor,
        WaitForTasksObservation,
        WaitForTasksTool,
    )
else:
    #: Exported name -> the submodule of ``rotaris_core.tools`` that defines it.
    _EXPORT_SOURCES = {
        "AskQuestionsAction": "ask_questions",
        "AskQuestionsExecutor": "ask_questions",
        "AskQuestionsObservation": "ask_questions",
        "AskQuestionsOption": "ask_questions",
        "AskQuestionsStep": "ask_questions",
        "AskQuestionsTool": "ask_questions",
        "BackgroundOutputAction": "background_output",
        "BackgroundOutputExecutor": "background_output",
        "BackgroundOutputObservation": "background_output",
        "BackgroundOutputTool": "background_output",
        "FetchAction": "fetch",
        "FetchExecutor": "fetch",
        "FetchObservation": "fetch",
        "FetchTool": "fetch",
        "FileToolEngine": "file_engine",
        "GitCommitAction": "git_commit",
        "GitCommitExecutor": "git_commit",
        "GitCommitObservation": "git_commit",
        "GitCommitTool": "git_commit",
        "HardenedTerminalAction": "terminal",
        "HardenedTerminalExecutor": "terminal",
        "HardenedTerminalObservation": "terminal",
        "HardenedTerminalTool": "terminal",
        "ReadFileAction": "file_read",
        "ReadFileExecutor": "file_read",
        "ReadFileObservation": "file_read",
        "ReadFileTool": "file_read",
        "TaskStatus": "todo_state",
        "TodoAction": "todo",
        "TodoExecutor": "todo",
        "TodoList": "todo_state",
        "TodoObservation": "todo",
        "TodoPhase": "todo_state",
        "TodoTask": "todo_state",
        "TodoTool": "todo",
        "WaitForTasksAction": "wait_for_tasks",
        "WaitForTasksExecutor": "wait_for_tasks",
        "WaitForTasksObservation": "wait_for_tasks",
        "WaitForTasksTool": "wait_for_tasks",
        "WriteFileAction": "file_write",
        "WriteFileExecutor": "file_write",
        "WriteFileObservation": "file_write",
        "WriteFileTool": "file_write",
        "load_plugin": "plugin_loader",
        "load_plugins_from_dirs": "plugin_loader",
    }

    def __getattr__(name):
        """Resolve a re-exported name from its submodule on first access."""
        source = _EXPORT_SOURCES.get(name)
        if source is None:
            raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
        from importlib import import_module

        value = getattr(import_module(f"{__name__}.{source}"), name)
        globals()[name] = value  # cached: __getattr__ is skipped from here on
        return value

    def __dir__():
        return sorted([*globals(), *_EXPORT_SOURCES])


__all__ = [
    "AskQuestionsAction",
    "AskQuestionsExecutor",
    "AskQuestionsObservation",
    "AskQuestionsOption",
    "AskQuestionsStep",
    "AskQuestionsTool",
    "BackgroundOutputAction",
    "BackgroundOutputExecutor",
    "BackgroundOutputObservation",
    "BackgroundOutputTool",
    "FetchAction",
    "FetchExecutor",
    "FetchObservation",
    "FetchTool",
    "FileToolEngine",
    "GitCommitAction",
    "GitCommitExecutor",
    "GitCommitObservation",
    "GitCommitTool",
    "HardenedTerminalAction",
    "HardenedTerminalExecutor",
    "HardenedTerminalObservation",
    "HardenedTerminalTool",
    "ReadFileAction",
    "ReadFileExecutor",
    "ReadFileObservation",
    "ReadFileTool",
    "TaskStatus",
    "TodoAction",
    "TodoExecutor",
    "TodoList",
    "TodoObservation",
    "TodoPhase",
    "TodoTask",
    "TodoTool",
    "WaitForTasksAction",
    "WaitForTasksExecutor",
    "WaitForTasksObservation",
    "WaitForTasksTool",
    "WriteFileAction",
    "WriteFileExecutor",
    "WriteFileObservation",
    "WriteFileTool",
    "load_plugin",
    "load_plugins_from_dirs",
]
