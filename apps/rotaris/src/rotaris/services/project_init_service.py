"""Runs the workspace's pending initialization tasks off the Qt GUI thread.

An initialization run drives an LLM agent conversation and MCP calls, so it can
take minutes: doing it on the event loop would freeze every other Rotaris view
while the modal claims to be "in progress". This worker owns that run and
reports it back as Qt signals, which Qt delivers on the receiving object's
thread — so nothing here ever touches a widget.

The worker is as task-agnostic as the registry it calls: it hands
:func:`rotaris_core.init.registry.run_pending_tasks` a progress callback and
forwards whatever comes back. It never names a task, so a future
initialization task needs no change here either.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, QThread, Signal
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.init.registry import InitTask, InitTaskResult

_log = logging.getLogger(__name__)


class _RunCancelledError(Exception):
    """Raised out of the progress callback to end a run at a task boundary."""


@traces(SWR.SWR_2802)
class ProjectInitService(QThread):
    """Executes the still-pending initialization tasks and streams the outcome.

    Signal order for a run with one task:
    ``task_started`` → ``step_reported``\\* → ``task_finished`` → ``run_finished``.
    A run that ends in `run_failed` reported nothing; a run that ends in
    `run_finished` may still carry failed :class:`InitTaskResult` entries,
    because one task failing does not abort the others and records nothing —
    which is exactly what makes the modal's retry meaningful.
    """

    #: task id, display label — one task is about to run
    task_started = Signal(str, str)
    #: task id, step name, step status, step detail — one step finished
    step_reported = Signal(str, str, str, str)
    #: task id, InitTaskResult — one task finished (success, skip or failure)
    task_finished = Signal(str, object)
    #: list[InitTaskResult] — the whole run finished, in task order
    run_finished = Signal(object)
    #: message — the run itself broke down and recorded nothing
    run_failed = Signal(str)
    #: the run stopped at a task boundary because the host is shutting down
    run_cancelled = Signal()

    def __init__(
        self,
        config: RotarisConfig,
        workspace_root: Path,
        *,
        tasks: Sequence[InitTask] | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._config = config
        self._workspace_root = workspace_root
        self._tasks = None if tasks is None else list(tasks)
        self._cancelled = False

    # ── QThread body ────────────────────────────────────────────────────

    def run(self) -> None:
        """Execute every runnable task. Runs on the worker thread, not the GUI."""
        from rotaris_core.init import registry

        try:
            results = registry.run_pending_tasks(
                self._config,
                self._workspace_root,
                tasks=self._tasks,
                on_progress=self._on_progress,
                # Forwarded to every runner (SWR-2821). `cancel()` alone only stops
                # the *next* task from starting; a runner that launches a
                # subprocess — indexing a large repository takes minutes — needs
                # to hear about it too, or closing Rotaris leaves that process
                # walking the user's tree.
                is_cancelled=self._is_cancelled,
            )
        except _RunCancelledError:
            self.run_cancelled.emit()
            return
        except Exception as exc:
            # A broken run must reach the modal as a retryable error rather
            # than die silently on a worker thread nobody is watching.
            _log.warning("Project initialization run failed.", exc_info=True)
            self.run_failed.emit(str(exc) or exc.__class__.__name__)
            return

        self.run_finished.emit(list(results))

    # ── Lifecycle ───────────────────────────────────────────────────────

    def cancel(self) -> None:
        """Ask the run to stop at the next task boundary.

        A task already in flight is not interrupted — an MCP conversation has
        no safe cut point — so this only prevents the *next* one from starting.
        """
        self._cancelled = True
        self.requestInterruption()

    def shutdown(self, timeout_ms: int = 5000) -> bool:
        """Stop the run without prompting and return once the thread is gone.

        Called from the host's ``closeEvent``, so it must never open a dialog
        or block the shutdown path forever. Signals are muted first: a result
        delivered into a window that is being torn down helps nobody. A task
        that outlives *timeout_ms* is terminated, which is a last resort and
        deliberately preferred over leaving a live thread behind at exit.
        """
        self.cancel()
        self.blockSignals(True)
        if not self.isRunning():
            return True
        if self.wait(timeout_ms):
            return True
        _log.warning("Project initialization did not stop in time; terminating the worker.")
        self.terminate()
        return bool(self.wait(1000))

    # ── Internals ───────────────────────────────────────────────────────

    def _is_cancelled(self) -> bool:
        """Whether the run should stop. Polled by runners, on the worker thread."""
        return self._cancelled or self.isInterruptionRequested()

    def _on_progress(self, task: InitTask, result: InitTaskResult | None) -> None:
        """Registry progress callback. Runs on the worker thread."""
        if result is None:
            # Only a task that has not started yet can be dropped; a finished
            # one is already recorded and its report is worth delivering.
            if self._cancelled:
                raise _RunCancelledError
            self.task_started.emit(task.id, task.label)
            return
        for step in result.steps:
            self.step_reported.emit(task.id, step.name, step.status, step.detail)
        self.task_finished.emit(task.id, result)
