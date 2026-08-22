"""Hidden agent-backed integration of accepted session worktrees.

The integration run is a run like any other (SWR-2453): it goes through
:func:`rotaris_core.run_host.execute_run`, so it gets the event store, the
``session.start``/``session.end`` pair, the lifecycle hooks, the per-iteration
checkpoints and a terminal result derived the one way — none of which it had
while it drove the runtime a layer below and hand-composed a subset by hand.

What stays here is the part that is genuinely this agent's and not any run's:
reserving the source worktrees, preparing the merged tree to work in, and
deciding afterwards whether the base branch may move.
"""

from __future__ import annotations

import asyncio
from functools import partial
from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, QThread, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path


@traces(SWR.SWR_2413)
class WorktreeIntegrationBridge(QObject):
    """Run exactly one invisible integration session while exposing progress signals."""

    started = Signal(str)
    progress = Signal(str)
    succeeded = Signal(str)
    failed = Signal(str)
    #: A hook advisory for the user (SWR-2701, SWR-2704). Separate from
    #: ``progress``, which drives a dialog label that disappears; a hook that
    #: did not run has to survive the dialog.
    notice = Signal(str)

    def __init__(self, workspace: Path, config_service: Any, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.workspace = workspace.resolve()
        self.config_service = config_service
        self._thread: QThread | None = None
        self._worker: _WorktreeIntegrationWorker | None = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.isRunning()

    def start(self, session_ids: list[str]) -> bool:
        if self.running or not session_ids:
            return False
        thread = QThread(self)
        worker = _WorktreeIntegrationWorker(
            self.workspace,
            self.config_service.build_run_config(),
            session_ids,
        )
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.started.connect(self.started)
        worker.progress.connect(self.progress)
        worker.succeeded.connect(self.succeeded)
        worker.failed.connect(self.failed)
        worker.notice.connect(self.notice)
        worker.succeeded.connect(thread.quit)
        worker.failed.connect(thread.quit)
        thread.finished.connect(worker.deleteLater)
        thread.finished.connect(self._finished)
        self._thread = thread
        self._worker = worker
        thread.start()
        return True

    def _finished(self) -> None:
        thread = self._thread
        self._thread = None
        self._worker = None
        if thread is not None:
            thread.deleteLater()


@traces(SWR.SWR_2413, SWR.SWR_2436, SWR.SWR_2701)
class _WorktreeIntegrationWorker(QObject):
    started = Signal(str)
    progress = Signal(str)
    succeeded = Signal(str)
    failed = Signal(str)
    notice = Signal(str)

    def __init__(self, workspace: Path, config: Any, session_ids: list[str]) -> None:
        super().__init__()
        self.workspace = workspace
        self.config = config
        self.session_ids = session_ids

    @Slot()
    def run(self) -> None:
        try:
            asyncio.run(self._execute())
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(str(exc))

    @traces(SWR.SWR_2453)
    async def _execute(self) -> None:
        from rotaris_core.improvement import RunType
        from rotaris_core.run_host import RunRequest, execute_run
        from rotaris_core.session.manager import SessionManager
        from rotaris_core.session.worktrees import GitWorktreeService

        manager = SessionManager(self.workspace)
        source_states = [
            manager.read_session_snapshot(session_id) for session_id in self.session_ids
        ]
        # The id is minted rather than the session created. ``prepare_integration``
        # needs a *name* to build its branch and worktree path from — the locks it
        # takes are the source sessions' — and creating the session here would take
        # this session's lock too, which ``execute_run`` then could not acquire:
        # the lock is an O_EXCL file behind a stale-pid reaper, so a live holder is
        # refused even when the live holder is us.
        session_id = manager.new_session_id()
        self.started.emit(session_id)
        service = GitWorktreeService(
            self.workspace,
            storage_subpath=self.config.worktree_storage_subpath,
        )
        plan = None
        try:
            self.progress.emit("Preparing isolated integration workspace…")
            plan = service.prepare_integration(manager, source_states, session_id)
            self.progress.emit("Integration agent is merging selected worktrees…")
            result = await execute_run(
                RunRequest(
                    task=service.integration_prompt(plan),
                    config=self.config,
                    max_iterations=self.config.runtime.max_iterations,
                    new_session_id=session_id,
                    # Attached, not created: the merged tree already exists, and
                    # binding it here is what roots the run's config in it.
                    worktree_path=plan.integration_path,
                    delegation_strategy="single",
                    run_type=RunType.INTEGRATION_RUN,
                    internal=True,
                ),
                manager,
                on_session_ready=partial(_stamp_integration_binding, manager, session_id),
                notice=self.notice.emit,
            )
            if not _completed(result):
                raise RuntimeError(
                    result.error or result.summary or "Integration agent did not complete the merge."
                )
            self.progress.emit("Verifying integration and updating base branch…")
            service.finalize_integration(manager, plan)
            plan = None
            state = manager.read_session_snapshot(session_id)
            if state.worktree is not None:
                state.worktree.merge_status = "merged"
                manager.flush_session(state)
            self.succeeded.emit("Selected worktree changes are now on the base branch.")
        except Exception as exc:
            # The lifecycle already released this session's lock and recorded its
            # terminal status. What is left is the *integration's* own undo: the
            # source worktrees this run reserved, and the base branch it must not
            # have moved.
            if plan is not None:
                service.release_failed_integration(manager, plan)
                raise RuntimeError(
                    f"{exc} Base was left untouched. Retained integration worktree: "
                    f"{plan.integration_path} (branch {plan.integration_branch})."
                ) from exc
            raise


def _completed(result: Any) -> bool:
    """Whether the run reached a successful terminal state.

    Read off the lifecycle's own :class:`~rotaris_core.run_result.RunResult`
    rather than re-derived from the progress file: two answers to "how did this
    run end" is the defect SWR-1828 exists to remove, and the integration path
    used to hold the second one.
    """
    from rotaris_core.run_result import RunStatus

    return bool(getattr(result, "status", None) is RunStatus.COMPLETED)


@traces(SWR.SWR_2413, SWR.SWR_2453)
def _stamp_integration_binding(manager: Any, session_id: str, state: Any) -> None:
    """Record what makes this session's worktree an *integration* worktree.

    ``execute_run`` binds the tree and writes the config rooted in it; what it
    cannot know is why the tree exists. These three fields are what the merge
    surfaces read, and they are written here — on the lifecycle's own
    "the session now exists" callback — because the lifecycle's last persist
    happens just before it, so nothing else would write them until the first
    save of the run.
    """
    from rotaris_core.run_host import persist_session_state

    binding = getattr(state, "worktree", None)
    if binding is None:  # pragma: no cover - a bind failure ends the run first
        return
    binding.created_by_session = True
    binding.merge_status = "integrating"
    binding.integration_session_id = session_id
    persist_session_state(manager, state)
