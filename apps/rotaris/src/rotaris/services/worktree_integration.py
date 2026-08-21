"""Hidden agent-backed integration of accepted session worktrees."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, QThread, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

from rotaris.services.run_bridge import (
    RunLifecycleExtras,
    accepts_extra_observers,
    install_run_lifecycle_extras,
)

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

    async def _execute(self) -> None:
        from rotaris_core.cli.background import _run_task, config_for_session_worktree
        from rotaris_core.improvement import RunType
        from rotaris_core.session.manager import SessionManager
        from rotaris_core.session.state import SessionWorktree
        from rotaris_core.session.worktrees import GitWorktreeService

        manager = SessionManager(self.workspace, persist_debounce_seconds=0.5)
        source_states = [
            manager.read_session_snapshot(session_id) for session_id in self.session_ids
        ]
        integration_state = manager.create_session(self.config, internal=True)
        integration_state.run_type = RunType.INTEGRATION_RUN
        await manager.persister.flush(integration_state)
        self.started.emit(integration_state.session_id)
        extras = RunLifecycleExtras(session_id="", observers=(), notice="", runner=None)
        service = GitWorktreeService(
            self.workspace,
            storage_subpath=self.config.worktree_storage_subpath,
        )
        plan = None
        try:
            self.progress.emit("Preparing isolated integration workspace…")
            plan = service.prepare_integration(manager, source_states, integration_state.session_id)
            integration_state.worktree = SessionWorktree(
                path=str(plan.integration_path),
                branch=plan.integration_branch,
                base_branch=plan.base_branch,
                base_revision=plan.base_revision,
                created_by_session=True,
                merge_status="integrating",
                integration_session_id=integration_state.session_id,
            )
            run_config = config_for_session_worktree(self.config, manager, integration_state)
            integration_state.config_snapshot = run_config.model_dump(mode="json")
            integration_state.execution_status = "running"
            await manager.persister.flush(integration_state)
            self.progress.emit("Integration agent is merging selected worktrees…")
            # Same composition as an ordinary desktop run: the integration agent
            # edits a real tree with real tools, so the user's lifecycle hooks
            # and per-iteration checkpoints apply to it too. Registered here and
            # discarded in this method's ``finally``.
            extras = install_run_lifecycle_extras(
                config=run_config,
                session_manager=manager,
                state=integration_state,
            )
            if extras.notice:
                self.notice.emit(extras.notice)
            run_kwargs: dict[str, Any] = {
                "delegation_strategy": "single",
                "run_type": RunType.INTEGRATION_RUN,
            }
            if extras.observers and accepts_extra_observers(_run_task):
                run_kwargs["extra_observers"] = extras.observers
            result = await _run_task(
                service.integration_prompt(plan),
                run_config,
                manager,
                integration_state,
                run_config.runtime.max_iterations,
                **run_kwargs,
            )
            from rotaris_core.ralph.state import summarize_run_progress

            status, summary, _severity = summarize_run_progress(result)
            integration_state.execution_status = status
            integration_state.transcript_events.append({"role": "system", "content": summary})
            if status != "completed":
                raise RuntimeError(summary or "Integration agent did not complete the merge.")
            self.progress.emit("Verifying integration and updating base branch…")
            service.finalize_integration(manager, plan)
            plan = None
            integration_state.worktree.merge_status = "merged"
            await manager.persister.flush(integration_state)
            self.succeeded.emit("Selected worktree changes are now on the base branch.")
        except Exception as exc:
            integration_state.execution_status = "failed"
            await manager.persister.flush(integration_state)
            if plan is not None:
                service.release_failed_integration(manager, plan)
                raise RuntimeError(
                    f"{exc} Base was left untouched. Retained integration worktree: "
                    f"{plan.integration_path} (branch {plan.integration_branch})."
                ) from exc
            raise
        finally:
            finish_notice = extras.finish_notice()
            extras.discard()
            if finish_notice:
                self.notice.emit(finish_notice)
            manager.release_lock(integration_state.session_id)
