"""Qt thread bridge for running Rotaris orchestration without blocking UI."""

from __future__ import annotations

import asyncio
import copy
import logging
import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast

from PySide6.QtCore import QObject, QThread, QTimer, Signal, Slot
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.runchannel import InProcessRunControl, RunControl
from rotaris_core.session.transcript import (
    TranscriptRecorder,
    register_transcript_recorder,
    wire_publisher,
)

from rotaris.models.state import TranscriptDelta

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris_core.permissions import EffectiveMode
    from rotaris_core.tools.ask_questions import AskQuestionsStep

    from rotaris.models.store import WorkspaceStore
    from rotaris.services.config_service import ConfigService
    from rotaris.services.session_projection import (
        SessionProjection,
        SessionProjectionContext,
    )
    from rotaris.services.todo_editing import TodoEditOperation


_log = logging.getLogger(__name__)

#: How a check's outcome reads as a transcript row status (SWR-2609). A skip is
#: deliberately ``blocked`` rather than ``ok``: nothing was verified, and a green
#: row would say the opposite. A timeout reads as a failure because that is what
#: the completion gate makes of it.
_VERIFIER_ROW_STATUS: dict[str, str] = {
    "passed": "ok",
    "failed": "failed",
    "timeout": "failed",
    "skipped": "blocked",
}

#: How long a row the view already holds may go on growing before the view is
#: told (SWR-2454). A streamed row changes once per token; at 20 Hz the view
#: sees the growth as growth, and SWR-2454's 250 ms budget has five times this
#: to spare.
_GROWTH_PUBLISH_MS = 50.0

#: A row the view has never seen is published at once, with no floor under it.
#: A floor was tried and removed: rows are appended at the rate the run produces
#: messages and tool results, which is nothing like the rate it produces tokens,
#: so there is no burst worth protecting against — and on Windows, whose timers
#: land on a ~15.6 ms tick, even a 16 ms floor cost a tick per row and pushed
#: the measured p95 from 3 ms to 1581 ms. Growth is where the throttling belongs.

#: How often a session this process is *not* running is read. Its rows arrive
#: only through ``poll_followed_session``, so this is that session's latency.
_FOLLOW_POLL_MS = 750

#: How often a session this process *is* running is reconciled (SWR-2454). The
#: run reports its own changes, so this read is no longer how the view learns
#: anything — it is the backstop that repairs whatever the push channel missed.
#: Left at the old 750 ms it was pure addition: the whole-state read and the
#: whole projection it feeds, at the old rate, on top of the new channel.
_RECONCILE_POLL_MS = 2000


@traces(
    SWR.SWR_2007,
    SWR.SWR_2024,
    SWR.SWR_2064,
    SWR.SWR_2065,
    SWR.SWR_2066,
    SWR.SWR_2067,
    SWR.SWR_2085,
    SWR.SWR_2401,
    SWR.SWR_2404,
    SWR.SWR_2412,
    SWR.SWR_2414,
    SWR.SWR_2415,
    SWR.SWR_2434,
    SWR.SWR_561,
)
class RunBridge(QObject):
    run_started = Signal(str)
    run_finished = Signal(str)
    run_failed = Signal(str)
    refresh_failed = Signal(str)
    store_updated = Signal()
    compression_finished = Signal(int, str)  # success count, error summary
    #: session id, execution status, worktree branch — published on every
    #: refresh so a coordinator can keep unfocused session rows live.
    session_summary = Signal(str, str, str)
    #: session id, resolved worktree branch — emitted before the agent starts.
    worktree_resolved = Signal(str, str)
    #: This handle has (or no longer has) post-run analysis in flight.
    improvement_activity_changed = Signal(bool)
    _refresh_requested = Signal(str, int, object)

    def __init__(
        self,
        workspace: Path,
        store: WorkspaceStore,
        config_service: ConfigService,
        diagnostics: Any | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self.workspace = workspace
        self.store = store
        self.config_service = config_service
        # Only the focused handle owns the shared store surfaces. A background
        # handle still refreshes its own session, but publishes a summary
        # instead of overwriting the focused run's projection and queue.
        self.projection_enabled = True
        # Single-handle hosts keep driving the store's analysis indicator; a
        # coordinator turns this off and aggregates across handles instead.
        self.owns_improvement_indicator = True
        if diagnostics is None:
            from rotaris.diagnostics import NoopDiagnostics

            diagnostics = NoopDiagnostics()
        self.diagnostics = diagnostics
        self._thread: QThread | None = None
        self._worker: _RunWorker | None = None
        self._refresh_thread: QThread | None = None
        self._refresh_worker: _SessionRefreshWorker | None = None
        self._improvement_thread: QThread | None = None
        self._improvement_worker: _ImprovementWorker | None = None
        self._queued_improvement_jobs: list[object] = []
        self._improvement_active = False
        self._session_id = ""
        # True from start() until the worker reports finished/failed. The
        # QThread outlives the run by a moment (its event loop still has to
        # quit), so restart decisions — e.g. the auth-failure fallback retry
        # fired from the run_failed handler — must key off this flag, not
        # QThread.isRunning(); start() then joins the winding-down thread.
        self._run_active = False
        self._refresh_busy = False
        self._refresh_pending = False
        self._refresh_pending_final = False
        self._refresh_generation = 0
        self._refresh_inflight_generation = 0
        self._refresh_inflight_final = False
        self._final_completion: tuple[str, str] | None = None
        self._final_refresh_attempts = 0
        self._shutting_down = False
        self._poller = QTimer(self)
        self._poller.setInterval(_FOLLOW_POLL_MS)
        self._poller.timeout.connect(self._poll)

    @property
    def _control(self) -> RunControl:
        """Every reach into the live run goes through here.

        The handle keeps its own "is a run active" question — that is about this
        window's state — and the control owns *how* the run is reached, which is
        the half that changes when a run stops sharing this process (SWR-2426).

        Built on first use rather than in ``__init__`` so that it reads the
        handle's current state through the two accessors below, and so a handle
        built without running ``__init__`` still answers "there is no run"
        instead of raising.
        """
        control = getattr(self, "_control_impl", None)
        if control is None:
            control = InProcessRunControl(
                lambda: getattr(self, "_session_id", ""),
                lambda: getattr(self, "_worker", None) if self.running else None,
            )
            self._control_impl = control
        return control

    @property
    def running(self) -> bool:
        return getattr(self, "_run_active", False)

    @property
    def session_id(self) -> str:
        """Session this handle drives ('' before the run reports started)."""
        return self._session_id

    @traces(SWR.SWR_2434, SWR.SWR_2454)
    def set_projection_enabled(self, enabled: bool) -> None:
        """Focus (or unfocus) this handle's writes to the shared store.

        Losing focus also hands the transcript back to the reconciling read:
        the store is about to hold a different session, and a projector seeded
        on this one would place the next delta against the wrong transcript.
        """
        self.projection_enabled = enabled
        if not enabled:
            self.config_service.release_transcript_delta_feed()

    @traces(SWR.SWR_2454)
    def follow_session(self, session_id: str) -> bool:
        """Watch a session this process is not running.

        A run in this process reports its transcript directly; a run in another
        process cannot, so its rows are read from the session's event store
        instead (SWR-2454 § Reach). Both end at the same delta and the same
        projector — the store carries the run's own rows, so following one and
        reopening it afterwards show the same conversation.

        Refused while this handle has a run of its own: that run is the authority
        on its transcript, and a second writer would fight it.
        """
        if self.running or self._shutting_down or not session_id:
            return False
        if not self.config_service.follow_session(session_id):
            return False
        self._session_id = session_id
        # A foreign session has no push channel: this read *is* its latency.
        self._poller.setInterval(_FOLLOW_POLL_MS)
        self._poller.start()
        return True

    @traces(SWR.SWR_2504)
    def resolve_approval(self, request_id: str, option: str) -> bool:
        """Answer one pending permission approval shown by Rotaris."""
        return bool(self._control.resolve_approval(request_id, option))

    def resolve_questions(self, agent_id: str, prompt_id: str, answers: object) -> bool:
        """Resolve the exact pending prompt shown by Rotaris."""
        return bool(self._control.resolve_questions(agent_id, prompt_id, _answers_of(answers)))

    def cancel_questions(self, agent_id: str, prompt_id: str) -> bool:
        """Cancel the exact pending prompt shown by Rotaris."""
        return bool(self._control.cancel_questions(agent_id, prompt_id))

    def start(
        self,
        prompt: str,
        session_id: str | None = None,
        isolation: Any | None = None,
        *,
        new_session_id: str | None = None,
        run_config: Any | None = None,
    ) -> bool:
        """Start (or restart) this handle's run.

        ``new_session_id`` pre-assigns the identity of a session that does not
        exist yet, so a caller can show the run in its lists before the worker
        reports back. ``run_config`` pins an immutable configuration snapshot;
        without one the current desktop settings are snapshotted here.
        """
        if self._run_active or self._final_completion is not None or not prompt.strip():
            return False
        # Reap the previous run's thread before creating a new one — the old
        # reference is only dropped after a join (see _join_thread).
        if not self._join_thread():
            return False
        if self.config_service.config is None:
            self.config_service.load()
        thread = QThread(self)
        worker = _RunWorker(
            self.workspace,
            run_config if run_config is not None else self.config_service.build_run_config(),
            prompt.strip(),
            session_id,
            self.store.delegation.strategy,
            isolation,
            new_session_id=new_session_id,
        )
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.started.connect(self._on_started)
        worker.finished.connect(self._on_finished)
        worker.failed.connect(self._on_failed)
        worker.compression_finished.connect(self.compression_finished.emit)
        worker.improvement_job_ready.connect(self._queue_improvement_job)
        worker.worktree_ready.connect(self._on_worktree_ready)
        worker.hook_notice.connect(self._on_hook_notice)
        worker.transcript_delta.connect(self._on_transcript_delta)
        worker.session_facts.connect(self._on_session_facts)
        worker.finished.connect(thread.quit)
        worker.failed.connect(thread.quit)
        self._thread = thread
        self._worker = worker
        thread.start()
        self._run_active = True
        return True

    @Slot(str)
    @traces(SWR.SWR_2701, SWR.SWR_2704)
    def _on_hook_notice(self, message: str) -> None:
        """Surface a hook advisory as a persistent warning the user can act on.

        Persistent on purpose: "your hooks did not run" outlives a toast, and a
        user who cannot tell a blocked hook from a broken one will conclude the
        feature is broken.

        Written straight to the store rather than re-emitted for the window to
        relay: a run handle may sit behind a coordinator that owns the window's
        signal wiring, and a notice that only some hosts forward is a notice the
        user sometimes does not get.
        """
        if not message or self._shutting_down:
            return
        from rotaris.models.state import NoticeSeverity, UiNotice

        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.WARNING,
                title="Lifecycle hooks need your attention",
                message=message,
                persistent=True,
                action_label="Open hook settings",
                action_id="settings.hooks",
            )
        )

    @Slot(str, str)
    @traces(SWR.SWR_2415)
    def _on_worktree_ready(self, session_id: str, branch: str) -> None:
        """Publish the resolved branch before the agent begins work."""
        self._session_id = session_id
        self.worktree_resolved.emit(session_id, branch)

    def steer(self, agent_id: str, text: str) -> bool:
        return bool(self._control.steer(agent_id, text))

    @traces(SWR.SWR_2434)
    def queue_prompt(self, text: str) -> str:
        """Queue a follow-up owned by — and only consumable by — this run."""
        return self._control.queue_prompt(text).value

    def edit_queued_prompt(self, prompt_id: str, text: str) -> bool:
        return bool(self._control.edit_queued_prompt(prompt_id, text))

    def delete_queued_prompt(self, prompt_id: str) -> bool:
        return bool(self._control.delete_queued_prompt(prompt_id))

    def cancel_agent(self, agent_id: str) -> bool:
        return bool(self._control.cancel_agent(agent_id))

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        """Stop the check the verifier is running, leaving the run active.

        Returns False when nothing is being verified, so a host may wire this
        to an always-present control without tracking the phase itself.
        """
        return bool(self._control.skip_verifier_check())

    def pause(self) -> bool:
        """Ask the run to finish its current step, then stop (graceful — as
        opposed to :meth:`cancel`, which cancels the run task outright)."""
        return bool(self._control.pause())

    def pause_agent(self, agent_id: str) -> bool:
        """Graceful pause only applies to the whole run (orchestrator node) —
        there's no per-child equivalent, mirroring the TUI's loop-level /pause."""
        if agent_id != "orchestrator":
            return False
        return self.pause()

    def switch_entry_model(self, model_key: str) -> bool:
        """Point the active run's entry persona at another model.

        Takes effect from the next Ralph iteration (each iteration spawns a
        fresh entry agent); the in-flight iteration finishes on its current
        model. Used to switch back to the primary model after the user
        re-authenticated its provider while the run continued on the fallback.
        """
        return bool(self._control.switch_entry_model(model_key))

    def switch_entry_reasoning(self, reasoning: str) -> bool:
        """Point the active run's entry persona at another reasoning level.

        Takes effect from the next Ralph iteration (each iteration spawns a
        fresh entry agent); the in-flight iteration finishes on its current
        reasoning. Used to change entry-agent reasoning without restarting the
        run.
        """
        return bool(self._control.switch_entry_reasoning(reasoning))

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    def set_permission_mode(self, mode: str) -> bool:
        """Switch the active run's permission mode (SWR-2503 mid-session change).

        Unlike the model and reasoning switches, this does not wait for the next
        Ralph iteration: it re-points the policy of every engine already built
        for this session, so the run's very next tool call is judged under the
        new mode. Returns ``False`` when there is no run to change.
        """
        return bool(self._control.set_permission_mode(mode))

    def force_compress(self) -> bool:
        """Request context compression for every currently active conversation."""
        return bool(self._control.force_compress())

    def clear_transcript(self) -> bool:
        """Clear and persist transcript state on the active run loop."""
        return bool(self._control.clear_transcript())

    def edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str = "",
    ) -> bool:
        """Write a desktop todo edit into the active agent's live list."""
        return bool(self._control.edit_todo(operation, target_id, text))

    def cancel(self) -> None:
        self._control.cancel()

    def shutdown(self) -> None:
        self._shutting_down = True
        self._poller.stop()
        self._refresh_pending = False
        self._refresh_pending_final = False
        self._final_completion = None
        self.cancel()
        self._queued_improvement_jobs.clear()
        self._cancel_improvement_collection()
        if self._thread is not None and self._thread.isRunning():
            self._thread.quit()
        # App shutdown must not destroy the QThread while its worker is still
        # unwinding an uninterruptible SDK/network call.
        self._join_thread(timeout_ms=None)
        self._stop_refresh_worker()
        self._set_improvement_active(False)

    @traces(SWR.SWR_2415)
    def _set_improvement_active(self, active: bool) -> None:
        """Publish this handle's improvement activity.

        Handles that share a window with other runs hand ownership of the
        indicator to the coordinator, which ORs every handle together — one run
        finishing its analysis must not clear another run's indicator.
        """
        self._improvement_active = active
        if self.owns_improvement_indicator:
            self.store.set_improvement_collection_active(active)
        self.improvement_activity_changed.emit(active)

    @property
    def improvement_active(self) -> bool:
        """True while this handle has improvement analysis queued or running."""
        return self._improvement_active

    @Slot(object)
    @traces(SWR.SWR_2414)
    def _queue_improvement_job(self, job: object) -> None:
        """Run terminal improvement analysis separately from the task worker."""
        if self._shutting_down:
            cancel = getattr(job, "request_cancel", None)
            if callable(cancel):
                cancel()
            return
        self._queued_improvement_jobs.append(job)
        self._set_improvement_active(True)
        self._start_next_improvement_job()

    def _start_next_improvement_job(self) -> None:
        if self._shutting_down or self._improvement_thread is not None:
            return
        if not self._queued_improvement_jobs:
            self._set_improvement_active(False)
            return

        job = self._queued_improvement_jobs.pop(0)
        thread = QThread(self)
        worker = _ImprovementWorker(job)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.completed.connect(thread.quit)
        worker.failed.connect(thread.quit)
        worker.completed.connect(self._on_improvement_completed)
        worker.failed.connect(self._on_improvement_failed)
        thread.finished.connect(worker.deleteLater)
        thread.finished.connect(self._on_improvement_thread_finished)
        self._improvement_thread = thread
        self._improvement_worker = worker
        thread.start()

    def _cancel_improvement_collection(self) -> None:
        worker = self._improvement_worker
        if worker is not None:
            worker.cancel()
        thread = self._improvement_thread
        if thread is not None and thread.isRunning():
            thread.quit()
            thread.wait()
        self._improvement_worker = None
        self._improvement_thread = None

    @Slot(object)
    def _on_improvement_completed(self, result: object) -> None:
        if self._shutting_down:
            return

        cancelled = bool(getattr(result, "cancelled", False))
        artifact_id = getattr(result, "artifact_id", None)
        proposal_count = int(getattr(result, "proposal_count", 0))
        if artifact_id is not None:
            self.config_service.refresh_improvement_proposals()
            if not cancelled:
                from rotaris.models.state import NoticeSeverity, UiNotice

                if proposal_count:
                    suffix = "proposal" if proposal_count == 1 else "proposals"
                    self.store.publish_notice(
                        UiNotice(
                            id=self.store.new_notice_id(),
                            severity=NoticeSeverity.SUCCESS,
                            title=f"{proposal_count} improvement {suffix} ready",
                            persistent=True,
                            action_label="Review proposals",
                            action_id="library.proposals",
                        )
                    )
                else:
                    self.store.publish_notice(
                        UiNotice(
                            id=self.store.new_notice_id(),
                            severity=NoticeSeverity.INFO,
                            title="Improvement analysis complete — no proposals",
                            persistent=True,
                        )
                    )

    @Slot(str)
    def _on_improvement_failed(self, _message: str) -> None:
        if self._shutting_down:
            return

    @Slot()
    def _on_improvement_thread_finished(self) -> None:
        thread = self._improvement_thread
        if thread is not None:
            # QThread.finished precedes the final OS-thread join by a moment;
            # keep the Python wrapper alive until that join is complete.
            thread.wait()
        self._improvement_worker = None
        self._improvement_thread = None
        if not self._shutting_down:
            self._start_next_improvement_job()

    @Slot(str)
    def _on_started(self, session_id: str) -> None:
        self._session_id = session_id
        self._ensure_refresh_worker()
        # This run reports its own changes, so the read becomes the reconciler
        # rather than the channel (SWR-2454, SWR-2130).
        self._poller.setInterval(_RECONCILE_POLL_MS)
        self._poller.start()
        self.run_started.emit(session_id)

    @Slot(str)
    def _on_finished(self, status: str) -> None:
        self._run_active = False
        self._poller.stop()
        self._begin_final_refresh("finished", status)

    @Slot(str)
    def _on_failed(self, message: str) -> None:
        self._run_active = False
        self._poller.stop()
        self._begin_final_refresh("failed", message)

    @Slot(object)
    @traces(SWR.SWR_2454)
    def _on_transcript_delta(self, delta: object) -> None:
        """Put a live run's transcript change on screen. Qt thread, queued.

        Guarded by the same two conditions the refresh is: a background run
        keeps producing deltas but only the focused handle may write the shared
        transcript, and a handle that is shutting down writes nothing at all.

        Never raises past this frame. The reconciling read is the backstop: a
        delta that cannot be applied costs one refresh of latency, never a row.
        """
        if not self.projection_enabled or self._shutting_down:
            return
        try:
            self.config_service.apply_transcript_delta(cast("TranscriptDelta", delta))
        except Exception:  # noqa: BLE001 - a view failure must not reach the run
            _log.warning("Could not apply a transcript delta; reconciling instead.", exc_info=True)
            self.config_service.release_transcript_delta_feed()
            return
        self.store_updated.emit()

    @Slot(object)
    @traces(SWR.SWR_2130)
    def _on_session_facts(self, facts: object) -> None:
        """Put everything but the transcript on screen. Qt thread, queued.

        Same guards and the same promise as :meth:`_on_transcript_delta`: only
        the focused handle writes the shared store, and a failure here costs one
        reconcile of latency rather than anything the run cares about.
        """
        if not self.projection_enabled or self._shutting_down:
            return
        try:
            self.config_service.apply_session_facts(facts)
        except Exception:  # noqa: BLE001 - a view failure must not reach the run
            _log.warning("Could not apply session facts; reconciling instead.", exc_info=True)
            return
        self.session_summary.emit(
            self._session_id,
            str(getattr(facts, "execution_status", "") or ""),
            str(getattr(getattr(facts, "worktree", None), "branch", "") or ""),
        )
        self.store_updated.emit()

    @Slot()
    def _poll(self) -> None:
        with self.diagnostics.span("RunBridge._poll"):
            self.sync_queued_prompts()
            if not self._session_id:
                return
            if self.projection_enabled:
                # Cheap and first: a followed session's new rows come out of its
                # store at a cost bounded by what it added (SWR-2454). Nothing
                # happens here for a run in this process — that one reports its
                # own transcript, and no follower was started for it.
                self.config_service.poll_followed_session()
            self._request_refresh()

    def _ensure_refresh_worker(self) -> None:
        if self._refresh_thread is not None:
            return
        config = self.config_service.config
        if config is None:
            raise RuntimeError("Cannot start session refresh before configuration is loaded")
        thread = QThread(self)
        worker = _SessionRefreshWorker(self.workspace, config)
        worker.moveToThread(thread)
        self._refresh_requested.connect(worker.refresh)
        worker.completed.connect(self._on_refresh_completed)
        worker.failed.connect(self._on_refresh_failed)
        thread.finished.connect(worker.deleteLater)
        self._refresh_thread = thread
        self._refresh_worker = worker
        thread.start()

    def _stop_refresh_worker(self) -> None:
        thread = self._refresh_thread
        if thread is None:
            return
        thread.quit()
        thread.wait()
        thread.deleteLater()
        self._refresh_thread = None
        self._refresh_worker = None
        self._refresh_busy = False

    def _request_refresh(self, *, final: bool = False) -> None:
        if not self._session_id or self._shutting_down:
            return
        if self._refresh_busy:
            self._refresh_pending = True
            self._refresh_pending_final = self._refresh_pending_final or final
            return
        self._ensure_refresh_worker()
        self._refresh_generation += 1
        self._refresh_inflight_generation = self._refresh_generation
        self._refresh_inflight_final = final
        self._refresh_busy = True
        self._refresh_requested.emit(
            self._session_id,
            self._refresh_generation,
            self.config_service.projection_context(),
        )

    @Slot(str, int, object, float, float)
    def _on_refresh_completed(
        self,
        session_id: str,
        generation: int,
        projection: object,
        load_ms: float,
        projection_ms: float,
    ) -> None:
        if generation != self._refresh_inflight_generation:
            return
        was_final = self._refresh_inflight_final
        self._refresh_busy = False
        recorder = getattr(self.diagnostics, "record_duration", None)
        if recorder is not None:
            recorder("session.load", load_ms)
            recorder("session.projection", projection_ms)
        if session_id == self._session_id and not self._shutting_down:
            typed = cast("SessionProjection", projection)
            # A background run keeps refreshing its own snapshot, but only the
            # focused handle may rewrite the shared transcript/agents/KPIs.
            if self.projection_enabled:
                self.config_service.apply_session_projection(typed)
                self.store_updated.emit()
            self.session_summary.emit(
                session_id,
                str(getattr(typed, "session_status", "") or ""),
                str(getattr(typed, "worktree_branch", "") or ""),
            )
        if self._refresh_pending:
            pending_final = self._refresh_pending_final
            self._refresh_pending = False
            self._refresh_pending_final = False
            self._request_refresh(final=pending_final)
        elif was_final:
            self._complete_run_signal()

    @Slot(str, int, str)
    def _on_refresh_failed(self, session_id: str, generation: int, message: str) -> None:
        del session_id
        if generation != self._refresh_inflight_generation:
            return
        was_final = self._refresh_inflight_final
        self._refresh_busy = False
        if self._refresh_pending:
            pending_final = self._refresh_pending_final
            self._refresh_pending = False
            self._refresh_pending_final = False
            self._request_refresh(final=pending_final)
            return
        if was_final and self._final_refresh_attempts < 3:
            QTimer.singleShot(100, self._request_final_refresh_attempt)
            return
        if was_final:
            self.refresh_failed.emit(f"Final session refresh failed after 3 attempts: {message}")
            self._complete_run_signal()

    @traces(SWR.SWR_2507, SWR.SWR_2454)
    def _begin_final_refresh(self, kind: str, payload: str) -> None:
        # The run is over, so its delta feed is over: the final read is the
        # authority on what the session ended up as, and it has to be allowed to
        # write the transcript. It is also the read that applies the retroactive
        # "this session is no longer live" rules — an unsettled tool row, an
        # unstamped reasoning burst — which no delta can express.
        self.config_service.release_transcript_delta_feed()
        self._final_completion = (kind, payload)
        self._final_refresh_attempts = 0
        if not self._session_id:
            # The run failed before it announced a session — a refused sandbox
            # (SWR-2507), a lock it could not take — so there is no snapshot to
            # read back. Report it now: _request_refresh drops a refresh with no
            # session id, which would leave the failure unreported *and* the
            # handle pinned by an unfinished completion.
            self._complete_run_signal()
            return
        self._request_final_refresh_attempt()

    def _request_final_refresh_attempt(self) -> None:
        if self._final_completion is None or self._shutting_down:
            return
        self._final_refresh_attempts += 1
        self._request_refresh(final=True)

    def _complete_run_signal(self) -> None:
        completion = self._final_completion
        if completion is None:
            return
        self._final_completion = None
        self.config_service.refresh_sessions()
        self.config_service.refresh_improvement_proposals()
        self._stop_refresh_worker()
        kind, payload = completion
        if kind == "finished":
            self.run_finished.emit(payload)
        else:
            self.run_failed.emit(payload)

    @traces(SWR.SWR_2434)
    def sync_queued_prompts(self) -> None:
        """Refresh desktop queue from thread-safe backend registry state.

        Scoped to this handle's session once it has one, and written to the
        store only while this handle is the focused run — a background run must
        not replace the focused run's visible queue.
        """
        if not self.projection_enabled:
            return
        from rotaris_core.api.prompts import prompt_api
        from rotaris_core.core.prompt_types import QueuedStatus

        from rotaris.models.state import QueuedPromptItem

        pending = [
            QueuedPromptItem(prompt.id, prompt.content)
            for prompt in prompt_api.list_queued(self._session_id or None)
            if prompt.status is QueuedStatus.QUEUED
        ]
        self.store.set_queued_prompts(pending)

    def _join_thread(self, *, timeout_ms: int | None = 5000) -> bool:
        """Join and release the worker thread — the only place thread refs die.

        Thread/worker references are deliberately NOT cleared from a
        ``thread.finished`` slot: that delivery is queued, so it can land after
        a new run has already started and would then null the new run's worker
        (destroying its C++ object before its queued ``run`` slot executes —
        the run silently never starts). Instead the previous run is reaped
        synchronously here, called only from ``start`` and ``shutdown``.

        The join itself matters too: ``finished`` fires when the thread's event
        loop stops, but the OS thread winds down a moment later. Destroying the
        bridge (the QThread's C++ parent) in that window is a Qt process abort
        ("QThread: Destroyed while thread is still running"). After ``finished``
        this wait is a microsecond-level join. Normal restarts use a 5s cap;
        app shutdown waits until completion because destroying a live QThread
        aborts the process.
        """
        thread = self._thread
        if thread is None:
            return True
        joined = thread.wait() if timeout_ms is None else thread.wait(timeout_ms)
        if not joined:
            return False
        self._thread = None
        self._worker = None
        return True


class _SessionRefreshWorker(QObject):
    """Read and project persisted state without occupying the Qt event loop."""

    completed = Signal(str, int, object, float, float)
    failed = Signal(str, int, str)

    def __init__(self, workspace: Path, config: Any) -> None:
        super().__init__()
        from rotaris.services.session_projection import SessionProjectionReader

        self._reader = SessionProjectionReader(workspace, config)

    @Slot(str, int, object)
    def refresh(self, session_id: str, generation: int, context: object) -> None:
        try:
            result = self._reader.read(
                session_id,
                cast("SessionProjectionContext", context),
            )
        except Exception as exc:
            self.failed.emit(session_id, generation, str(exc))
            return
        self.completed.emit(
            session_id,
            generation,
            result.projection,
            result.load_ms,
            result.projection_ms,
        )


@traces(SWR.SWR_2414)
class _ImprovementWorker(QObject):
    """Own one optional collector job on its own cancellable Qt worker thread."""

    completed = Signal(object)
    failed = Signal(str)

    def __init__(self, job: object) -> None:
        super().__init__()
        self._job = job
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[Any] | None = None

    @Slot()
    def run(self) -> None:
        try:
            result = asyncio.run(self._execute())
        except asyncio.CancelledError:
            self.completed.emit(SimpleNamespace(artifact_id=None, proposal_count=0, cancelled=True))
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(str(exc))
        else:
            self.completed.emit(result)

    async def _execute(self) -> object:
        self._loop = asyncio.get_running_loop()
        self._task = asyncio.current_task()
        try:
            return await cast("Any", self._job).run()
        finally:
            self._task = None
            self._loop = None

    def cancel(self) -> None:
        cancel = getattr(self._job, "request_cancel", None)
        if callable(cancel):
            cancel()
        loop, task = self._loop, self._task
        if loop is not None and task is not None and not task.done():
            loop.call_soon_threadsafe(task.cancel)


@traces(SWR.SWR_2507)
def _sandbox_verdict(run_config: Any) -> tuple[bool, str]:
    """``(sandboxed, backend name)`` for the config this run really launched with.

    Raises :class:`SandboxUnavailableError` when the config asks for a sandbox
    the host cannot provide, because SWR-2507 forbids downgrading that session
    to unsandboxed execution.

    The verdict comes from :func:`ensure_sandbox_available` rather than a second
    :func:`sandbox_status` call: one host probe decides both whether the run may
    start and what the snapshot records, so the two can never disagree, and the
    raised error carries the reason and remediation the window has to show.
    """
    from rotaris_core.sandbox.session import ensure_sandbox_available, resolve_sandbox_spec

    # ``workspace_root`` is read leniently: an ``off`` config never reaches a
    # path that needs it, and a host that hands the worker a duck-typed config
    # must not fail a run that asked for no sandbox at all.
    spec = resolve_sandbox_spec(run_config, getattr(run_config, "workspace_root", ""))
    if spec is None:
        return (False, "")
    return (True, ensure_sandbox_available(spec).name)


class _RunWorker(QObject):
    started = Signal(str)
    finished = Signal(str)
    failed = Signal(str)
    compression_finished = Signal(int, str)
    improvement_job_ready = Signal(object)
    #: session id, resolved worktree branch — emitted once isolation is set up
    #: and always before the agent starts working.
    worktree_ready = Signal(str, str)
    #: A hook advisory this run has to show the user (SWR-2701, SWR-2704).
    #: Never carries a hook's command text.
    hook_notice = Signal(str)
    #: One :class:`~rotaris.models.state.TranscriptDelta` (SWR-2454). Emitted
    #: from the run's own thread and delivered queued, which is the whole of
    #: what this worker's observer is allowed to do with Qt.
    transcript_delta = Signal(object)
    #: The session record without its unbounded lists (SWR-2130) — everything
    #: the view shows that is not the transcript.
    session_facts = Signal(object)

    def __init__(
        self,
        workspace: Path,
        config: Any,
        prompt: str,
        session_id: str | None,
        delegation_strategy: str,
        isolation: Any | None = None,
        *,
        new_session_id: str | None = None,
    ) -> None:
        super().__init__()
        self.workspace = workspace
        self.config = config
        self.prompt = prompt
        self.session_id = session_id
        self.delegation_strategy = delegation_strategy
        self.isolation = isolation
        self.new_session_id = new_session_id
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[Any] | None = None
        self._cancel: asyncio.Event | None = None
        self._observer: _SessionObserver | None = None
        self._failure_detail = ""
        # Session whose approval host this worker registered (SWR-2504); kept
        # separate from ``session_id`` because a fresh run only learns its id
        # once the session exists.
        self._approval_session_id = ""
        # The config this run actually launched with (worktree-adjusted); the
        # mid-run mode change (SWR-2503) must re-resolve against it, not the
        # pre-launch copy.
        self._run_config: Any | None = None

    @Slot()
    def run(self) -> None:
        try:
            status = asyncio.run(self._execute())
        except Exception as exc:
            self.failed.emit(str(exc))
        else:
            if status == "failed":
                # RalphLoop caught the run's exception internally and only
                # summarized it into the progress file ("Run failed: ...").
                # Route it through `failed` so the window runs the same
                # recovery (fallback retry + reauth prompt) as for raised
                # exceptions — otherwise in-run auth failures end the session
                # with a plain "failed" toast and no recovery.
                self.failed.emit(self._failure_detail or "Run failed.")
            else:
                self.finished.emit(status)

    async def _execute(self) -> str:
        """Run this handle's task through the one host-neutral lifecycle.

        Everything from "which session is this" to "release the lock" lives in
        :func:`~rotaris_core.run_host.execute_run`, which the CLI and the Python
        SDK already use. The desktop used to drive ``cli.background._run_task``
        one layer below it and keep its own copy of the surrounding lifecycle —
        the event-store attach, the terminal ``result`` event, the hook runner,
        the checkpoint observer. Two copies of "which session am I and who holds
        its lock" disagree the moment one of them is fixed, and this one already
        had a gap the other did not: a run that died during intent
        classification was stored without its ``session.start``.

        What stays here is genuinely this host's: a Qt signal per lifecycle
        moment, an observer that needs the live :class:`SessionState`, and the
        approval host that lets the window answer an ``ask`` decision.
        """
        # No persistence-debounce override any more, and that absence is the
        # point (SWR-2130). The desktop used to construct its SessionManager
        # with a 0.5s window because it polled the persisted snapshot to drive a
        # live view, which paid in write amplification for a property the
        # durability layer was never meant to provide. Both halves of the view
        # now hear from the run directly — the transcript as deltas (SWR-2454),
        # everything else as facts — so the window goes back to being chosen on
        # durability grounds alone, which is the engine's default.
        from rotaris_core.run_host import RunRequest, execute_run
        from rotaris_core.session.manager import SessionManager

        manager = SessionManager(self.workspace)
        self._loop = asyncio.get_running_loop()
        self._cancel = asyncio.Event()

        def _on_session_ready(state: Any) -> Any:
            from rotaris_core.cli.background import config_for_session_worktree

            # The config the run really launched with: the mid-run permission
            # mode change (SWR-2503) must re-resolve against the worktree-rooted
            # copy, not the pre-launch one.
            self._run_config = config_for_session_worktree(self.config, manager, state)
            worktree = getattr(state, "worktree", None)
            self.worktree_ready.emit(state.session_id, getattr(worktree, "branch", "") or "")
            self.started.emit(state.session_id)
            observer = _SessionObserver(asyncio.get_running_loop(), manager, state)
            # The live channel (SWR-2454). ``emit`` is the sink's whole job: Qt
            # queues the delivery to the receiver's thread, so nothing on the
            # run's side waits for the view and no Qt object is reachable from
            # the run.
            observer.bind_delta_sink(self.transcript_delta.emit)
            observer.bind_facts_sink(self.session_facts.emit)
            self._observer = observer
            self._register_approval_host(observer, state.session_id)
            return observer

        request = RunRequest(
            task=self.prompt,
            config=self.config,
            session_id=self.session_id,
            max_iterations=self.config.runtime.max_iterations,
            new_session_id=self.new_session_id or getattr(self.isolation, "session_id", None),
            delegation_strategy=self.delegation_strategy,
            **_isolation_request_fields(self.isolation),
        )
        try:
            result = await execute_run(
                request,
                manager,
                on_session_ready=_on_session_ready,
                improvement_job_sink=self.improvement_job_ready.emit,
                cancel_event=self._cancel,
                notice=self.hook_notice.emit,
            )
        finally:
            from rotaris_core.permissions import discard_approval_host

            if self._observer is not None:
                # Anything the rate limiter is still holding, before the loop
                # this run owns goes away with it (SWR-2454).
                self._observer.flush_publications()
            discard_approval_host(self._approval_session_id)
            self._approval_session_id = ""
            self._task = None
            self._loop = None
            self._cancel = None
            self._observer = None

        status = self._status_of(result)
        # What the window shows when it offers recovery. ``error`` is the
        # rendered runtime failure; ``summary`` carries the loop's own wording
        # for a run that failed without raising, which is the case the auth
        # fallback is triggered from.
        self._failure_detail = (result.error or result.summary or "") if status == "failed" else ""
        return status

    @staticmethod
    def _status_of(result: Any) -> str:
        """The status string this window's signals are written against.

        ``RunResult.status`` is the machine-facing outcome; the window speaks
        the session's own ``execution_status`` vocabulary, and a run that never
        started has no session status at all.
        """
        from rotaris_core.run_result import RunStatus

        if result.status is RunStatus.INTERRUPTED:
            return "paused"
        if result.status in (RunStatus.FAILED, RunStatus.ERROR):
            return "failed"
        if result.status is RunStatus.MAX_ITERATIONS:
            return "max_iterations"
        return "completed"

    @traces(SWR.SWR_2504)
    def _register_approval_host(self, observer: _SessionObserver, session_id: str) -> None:
        """Make this run's ``ask`` decisions resolvable from the desktop UI.

        Registered before the run starts so every agent built during it — root,
        child, nested — resolves an interactive host rather than the fail-safe
        deny path.
        """
        from rotaris_core.permissions import ApprovalHost, register_approval_host

        register_approval_host(
            session_id,
            ApprovalHost(
                present=observer.present_approval,
                dismiss=observer.dismiss_approval,
            ),
        )
        self._approval_session_id = session_id

    def cancel(self) -> None:
        """Ask the run to stop, from the Qt thread.

        Setting the lifecycle's cancel event rather than cancelling the task:
        ``execute_run`` gives the loop its grace period and still reports a
        terminal result, where a bare ``task.cancel`` unwound through whichever
        await happened to be in flight.
        """
        loop, cancel = self._loop, self._cancel
        if loop is not None and cancel is not None:
            loop.call_soon_threadsafe(cancel.set)

    def cancel_pending_questions(self) -> None:
        """Release synchronous tool waits before cancelling the async run."""
        ralph = self._observer.ralph if self._observer is not None else None
        if ralph is not None:
            ralph.scheduler.user_prompt_barrier.cancel_all()

    @traces(SWR.SWR_2423)
    def resolve_questions(self, agent_id: str, prompt_id: str, answers: object) -> bool:
        """Answer the exact prompt *agent_id* is waiting on."""
        return self._finish_questions(agent_id, prompt_id, answers)

    @traces(SWR.SWR_2423)
    def cancel_questions(self, agent_id: str, prompt_id: str) -> bool:
        """Withdraw that prompt without answering it."""
        return self._finish_questions(agent_id, prompt_id, None)

    def _finish_questions(self, agent_id: str, prompt_id: str, answers: object | None) -> bool:
        """Resolve or cancel one waiting conversation's prompt.

        Reached through the run's observer, which is what actually holds the
        loop. This used to be done from the handle by reading a ``_ralph``
        attribute off the worker — an attribute the worker has never had, so
        every answer the user typed was dropped and the prompt sat there until
        it timed out. Its test built a double that *did* have one, which is why
        nothing said so.
        """
        ralph = self._observer.ralph if self._observer is not None else None
        scheduler = getattr(ralph, "scheduler", None)
        if scheduler is None:
            return False
        barrier = getattr(scheduler, "user_prompt_barrier", None)
        conversation = getattr(scheduler, "_active_conversations", {}).get(agent_id)
        if barrier is None or conversation is None:
            return False
        if answers is None:
            return bool(barrier.cancel(conversation, prompt_id))
        return bool(barrier.resolve(conversation, prompt_id, _answers_of(answers)))

    @traces(SWR.SWR_2504)
    def cancel_pending_approvals(self) -> None:
        """Release dispatches blocked on an approval so the run can stop."""
        from rotaris_core.permissions import resolve_approval_host

        host = resolve_approval_host(self._approval_session_id)
        if host is not None:
            host.barrier.cancel_all()

    def pause(self) -> bool:
        # RalphLoop.request_shutdown is documented as safe to call from the
        # UI thread directly (it dispatches its own daemon-thread work) — the
        # same pattern the TUI uses from its synchronous action handlers.
        ralph = self._observer.ralph if self._observer is not None else None
        if ralph is None:
            return False
        ralph.request_shutdown(force=False)
        return True

    def cancel_agent(self, agent_id: str) -> bool:
        return self._observer.cancel_agent(agent_id) if self._observer is not None else False

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        return self._observer.skip_verifier_check() if self._observer is not None else False

    def switch_entry_model(self, model_key: str) -> bool:
        observer = self._observer
        if observer is None:
            return False
        observer.switch_entry_model(model_key)
        return True

    def switch_entry_reasoning(self, reasoning: str) -> bool:
        observer = self._observer
        if observer is None:
            return False
        observer.switch_entry_reasoning(reasoning)
        return True

    @traces(SWR.SWR_2503, SWR.SWR_2506, SWR.SWR_2508, SWR.SWR_2509)
    def set_permission_mode(self, mode: str) -> bool:
        """Switch the live run to *mode*, effective from its next tool call.

        Runs synchronously on the calling (GUI) thread rather than hopping to
        the run's loop: dispatches happen on SDK worker threads, so hopping
        would let calls in between be judged under the old mode. The registries
        it touches are lock-guarded and ``set_policy`` re-reads nothing eagerly.
        """
        from rotaris_core.permissions import change_session_permission_mode

        observer, session_id = self._observer, self._approval_session_id
        if observer is None or not session_id:
            return False
        effective = change_session_permission_mode(
            session_id,
            mode,
            config=self._run_config or self.config,
        )
        observer.apply_permission_mode(effective)
        return True

    def force_compress(self) -> bool:
        loop, observer = self._loop, self._observer
        ralph = observer.ralph if observer is not None else None
        scheduler = getattr(ralph, "scheduler", None)
        if loop is None or scheduler is None:
            return False
        conversation_lock = getattr(scheduler, "_conversation_lock", None)
        active_map = getattr(scheduler, "_active_conversations", None)
        if conversation_lock is None or not isinstance(active_map, dict):
            return False
        with conversation_lock:
            conversations = dict(active_map)
        if not conversations:
            return False

        future = asyncio.run_coroutine_threadsafe(
            self._compress_conversations(scheduler, conversations),
            loop,
        )

        def done(result: Any) -> None:
            try:
                success_count, errors = result.result()
            except Exception as exc:  # noqa: BLE001
                self.compression_finished.emit(0, str(exc))
            else:
                self.compression_finished.emit(success_count, errors)

        future.add_done_callback(done)
        return True

    def clear_transcript(self) -> bool:
        observer = self._observer
        if observer is None:
            return False
        observer.clear_transcript()
        return True

    def edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str = "",
    ) -> bool:
        observer = self._observer
        if observer is None:
            return False
        return observer.edit_todo(operation, target_id, text)

    async def _compress_conversations(
        self,
        scheduler: Any,
        conversations: dict[str, Any],
    ) -> tuple[int, str]:
        from rotaris_core.orchestrator.scheduler_compression import force_compress_child

        async def compress_one(name: str, conversation: Any) -> tuple[str, Exception | None]:
            try:
                await force_compress_child(scheduler, name, conversation)
            except Exception as exc:  # noqa: BLE001
                return name, exc
            return name, None

        results = await asyncio.gather(
            *(compress_one(name, conversation) for name, conversation in conversations.items())
        )
        errors = [f"{name}: {error}" for name, error in results if error is not None]
        return len(results) - len(errors), "; ".join(errors)


@traces(SWR.SWR_2428)
def _is_terminal_tool(tool_name: str) -> bool:
    """True for the shell tool under any of the names it has been called."""
    return tool_name.strip().lower() in {"terminal", "bash"}


@traces(SWR.SWR_2615)
def _gate_warning_for(result: Any) -> str:
    """The "no quality gate" sentence this run reported, or "".

    Read off the run rather than composed here. The verifier owns the sentence
    for the same reason it owns the verdict: a host that phrased it itself would
    eventually phrase it differently from the child report describing the same
    run — and the desktop is deliberately not allowed to reach into the verifier
    to ask.
    """
    return str(getattr(result, "gate_warning", "") or "")


class _SessionObserver:
    """Persist scheduler snapshots for the GUI poller without touching Qt.

    What this no longer does is build transcript rows. That moved into
    ``rotaris_core.session.transcript.TranscriptRecorder`` (SWR-2454), so a run
    started from a terminal keeps the same transcript a run started from this
    window does, and there is one derivation of what a row says rather than one
    per host. This observer owns the recorder for its run and turns what the
    recorder reports into the two things a desktop needs: a durable save and a
    delta for the view.
    """

    def __init__(self, loop: asyncio.AbstractEventLoop, manager: Any, state: Any) -> None:
        self.loop = loop
        self.manager = manager
        self.state = state
        # Read by the backend's entry-model resolver on every agent spawn
        # (ralph/bootstrap.py::make_entry_model_resolver). The GUI thread
        # writes it via switch_entry_model; a plain attribute write is atomic,
        # so no lock is needed for this single-value handoff.
        self.entry_model_override: str | None = None
        self.entry_reasoning_override: str | None = None
        self.ralph: Any | None = None
        self._child_managers: dict[str, Any] = {}
        # The engine writes the transcript; this observer watches it write
        # (SWR-2454). Every row this desktop used to build — a streamed message,
        # a reasoning burst, a tool call and its result — is built by
        # ``TranscriptRecorder`` now, in ``rotaris_core``, so a run started from
        # the CLI records exactly what a run started from here records. Reaching
        # for it before the run begins is what makes that true: the runner takes
        # the recorder that is already registered rather than making a plain one,
        # so there is one recorder and one transcript, whoever is watching.
        session_id = str(getattr(state, "session_id", "") or "")
        self._recorder = TranscriptRecorder(
            state,
            on_change=self._on_transcript_change,
            # A record with no session id belongs to no run, so there is no bus
            # key to publish under and nothing outside this process to reach.
            publish=wire_publisher(session_id) if session_id else None,
        )
        if session_id:
            register_transcript_recorder(session_id, self._recorder)
        # TodoExecutor invokes on_todo_state with its mutable state object.
        # Keep that exact reference so desktop edits affect next iteration.
        self._live_todo: Any | None = None
        # The running suite's control handle (SWR-2610), held only while a suite
        # is in flight so the GUI's Skip can never address a finished run.
        self._verifier_control: Any | None = None
        # ── the live channel (SWR-2454) ───────────────────────────────────
        #
        # This observer already knew every change as it happened; what it did
        # with that knowledge was write it to disk and let a timer find it
        # again. ``_delta_sink`` is the other half: the same change, handed
        # straight to the view. Durability and liveness are now two consumers
        # of one event rather than one pretending to be the other (SWR-2130).
        self._delta_sink: Callable[[TranscriptDelta], None] | None = None
        #: Where everything that is *not* the transcript goes (SWR-2130): the
        #: agent tree, todos, approvals, verifier progress, token counts. All of
        #: it is bounded by how much is happening at once, so it travels whole
        #: rather than as a diff.
        self._facts_sink: Callable[[Any], None] | None = None
        #: How many rows the view has been told about, and how many edit diffs.
        #: A delta carries what came after these.
        self._emitted_len = 0
        self._emitted_diff_len = 0
        #: The publication rate limiter (SWR-2454). The run reports a change per
        #: streamed token; the view cannot consume one per token, and does not
        #: need to. See :meth:`_request_publish`.
        self._publish_handle: asyncio.TimerHandle | None = None
        self._last_published_at = 0.0
        #: Rows the recorder let go of since the last publication. They have to
        #: be remembered rather than used immediately: the delta boundary is
        #: computed from the held rows *plus* these, and coalescing means a row
        #: may settle in a window that publishes nothing.
        self._pending_settled: list[dict[str, Any]] = []

    def _on_transcript_change(self, settled: tuple[dict[str, Any], ...]) -> None:
        """The recorder changed the transcript: make it durable, then visible.

        *settled* is the rows the recorder has let go of. It has to say so
        explicitly, because a row it no longer holds is a row
        :meth:`_held_rows` will not report — and the delta boundary is computed
        from exactly those two answers.
        """
        self._touch(*settled)

    @traces(SWR.SWR_2454)
    def bind_delta_sink(self, sink: Callable[[TranscriptDelta], None] | None) -> None:
        """Where transcript changes go, besides the session record.

        A sink that raises, blocks or is absent must cost the view and nothing
        else, so this is the only thing the run knows about its consumer and
        :meth:`_publish_delta` is where that promise is kept.
        """
        self._delta_sink = sink

    def _held_rows(self) -> list[dict[str, Any]]:
        """Every transcript row the run may still mutate in place.

        The streamed tail, an open tool call, an unsettled check, a reasoning
        burst that may still be folded. Bounded by how much is happening at
        once — agents, in-flight calls, checks — and not by how long the session
        has been running, which is what makes the delta boundary cheap to
        compute and cheap to send. The recorder owns the answer because it owns
        the rows.
        """
        return self._recorder.held_rows()

    def _save(self) -> None:
        """Make the session record current, then report it. The transcript did not change.

        These surfaces — approvals, questions, todos, child state, verifier
        progress, token counts — are bounded by how much is happening at once
        rather than by how long the session has run, which is why they travel
        whole while the transcript travels as a delta.

        They used to reach the view only through the reconciling read, and the
        desktop shortened the persistence debounce to make that read frequent
        enough to feel live — the coupling SWR-2130 names. Reporting them here
        is what lets that window go back to being about durability.
        """
        self.manager.persister.request_save(self.state)
        self._request_publish()

    @traces(SWR.SWR_2130, SWR.SWR_2454)
    def _publish_facts(self) -> None:
        """Hand the view everything about this run except its transcript.

        The payload is the session record with its two unbounded lists emptied.
        Copying the *record* rather than a hand-listed set of fields is
        deliberate: the projection reads a great many of them, and a list here
        would be a second statement of what the projection needs, drifting the
        first time someone adds a field to either.

        Mutable containers the run keeps writing are deep-copied; scalars are
        not. What is left out is what grows with the session — the transcript
        (it has its own channel), the edit diffs (likewise), and the report,
        checkpoint and compression histories, which no live surface reads.

        Never raises, for the same reason :meth:`_publish_delta` does not.
        """
        sink = self._facts_sink
        if sink is None:
            return
        try:
            facts = self.state.model_copy(deep=False)
            facts.transcript_events = []
            facts.ui_edit_diffs = []
            facts.report_artifacts = []
            facts.checkpoints = []
            facts.seen_compression_ids = {}
            facts.child_states = copy.deepcopy(self.state.child_states)
            facts.todo_state = copy.deepcopy(self.state.todo_state)
            facts.agent_todo_state = copy.deepcopy(self.state.agent_todo_state)
            facts.pending_approvals = copy.deepcopy(self.state.pending_approvals)
            facts.pending_questions = copy.deepcopy(self.state.pending_questions)
            facts.verifier_state = copy.deepcopy(self.state.verifier_state)
            facts.token_usage = copy.deepcopy(self.state.token_usage)
            facts.agent_metrics = copy.deepcopy(self.state.agent_metrics)
            sink(facts)
        except Exception:  # noqa: BLE001 - the view is not allowed to fail the run
            _log.warning("Could not publish session facts; the view will reconcile.")

    @traces(SWR.SWR_2130)
    def bind_facts_sink(self, sink: Callable[[Any], None] | None) -> None:
        """Where everything but the transcript goes. Same contract as the delta sink."""
        self._facts_sink = sink

    def _touch(self, *rows: dict[str, Any]) -> None:
        """Make the change durable, then make it visible — in that order.

        Args:
            rows: Rows this change mutated that the observer has already let go
                of. Anything it still holds is found by :meth:`_held_rows`, so
                the ordinary call needs no arguments.

        Durable first, deliberately: a view that has seen an event the record
        has not is a view that can contradict a resume, which is the one thing
        SWR-2454 forbids outright.
        """
        self.manager.persister.request_save(self.state)
        self._pending_settled.extend(rows)
        self._request_publish()

    @traces(SWR.SWR_2454)
    def _request_publish(self) -> None:
        """Report this change to the view, at a rate the view can consume.

        The run reports a change *per streamed token*. Publishing each one puts
        a transcript delta and a whole session projection on the Qt thread per
        token, which is what the 750 ms poll used to coalesce and what nothing
        replaced when the push channel took over: the event loop stops draining
        and the window stops responding.

        So publication is rate-limited with a trailing emit — but only for the
        change that needs it, because the two kinds do not read the same to a
        person:

        * A row the view has **not seen at all** is what is read as latency. It
          goes out at once, with nothing in front of it.
        * A row the view **already has**, growing in place as it streams, goes
          out on the tick. Well inside SWR-2454's 250 ms budget, and an order of
          magnitude fewer projections per second than one per token.

        The payload is built when it is sent, not when the change happened,
        which is the point of limiting here rather than on the Qt side: the deep
        copies in :meth:`_publish_facts` and :meth:`_publish_delta` leave the
        per-token path entirely, so the run loop gets the saving too.

        Coalescing loses nothing. A pending publication reads the state as it is
        when it fires, so it carries every change that arrived while it waited.
        """
        if len(self.state.transcript_events) > self._emitted_len:
            # A row the view has never seen. Any pending tick is subsumed: this
            # publication carries everything, growth included.
            self._cancel_pending_publish()
            self._publish_now()
            return
        if self._publish_handle is not None:
            # Already scheduled; it will read this change when it fires.
            return
        waited_ms = (time.monotonic() - self._last_published_at) * 1000.0
        if waited_ms >= _GROWTH_PUBLISH_MS:
            self._publish_now()
            return
        # A loop that cannot schedule — closing with the run, or a stand-in a
        # test handed us — leaves no later to wait for, so send it now.
        call_later = getattr(self.loop, "call_later", None)
        if call_later is None:
            self._publish_now()
            return
        try:
            self._publish_handle = call_later(
                (_GROWTH_PUBLISH_MS - waited_ms) / 1000.0, self._publish_now
            )
        except RuntimeError:
            self._publish_now()

    def _cancel_pending_publish(self) -> None:
        handle, self._publish_handle = self._publish_handle, None
        if handle is not None:
            handle.cancel()

    def _publish_now(self) -> None:
        """Send both channels and reset the window. The timer's whole body."""
        self._publish_handle = None
        self._last_published_at = time.monotonic()
        settled = tuple(self._pending_settled)
        self._pending_settled.clear()
        self._publish_delta(settled)
        # A transcript change almost always rides with one elsewhere — the tool
        # row and the agent's active-tool chips are one event seen twice — and
        # the facts payload is bounded, so reporting both is cheaper than
        # working out whether this particular change needed it.
        self._publish_facts()

    @traces(SWR.SWR_2454)
    def flush_publications(self) -> None:
        """Send whatever the limiter is still holding. Called as the run ends.

        Not strictly required — the final whole-state read is the backstop for
        anything the push channel misses — but a run whose last row arrives a
        refresh late looks like a run that lost it.
        """
        self._cancel_pending_publish()
        self._publish_now()

    @traces(SWR.SWR_2454)
    def _publish_delta(self, extra_rows: tuple[dict[str, Any], ...] = ()) -> None:
        """Send the changed part of the transcript to the view, if anyone is listening.

        The boundary is the earliest row that can still change — every held row,
        and the end of what the view was last told about. Everything from there
        on is copied and sent; nothing before it moved.

        Never raises. A broken view consumer degrades the view, exactly as a
        broken event-bus consumer degrades the stream and not the run.
        """
        sink = self._delta_sink
        if sink is None:
            return
        try:
            rows = self.state.transcript_events
            total = len(rows)
            if total < self._emitted_len:
                # The transcript shrank — only ``clear_transcript`` does that.
                # There is no delta to describe, so the whole thing is sent
                # again from row zero; a consumer reads ``first == 0`` as "start
                # over from this", which is also what makes a clear cost nothing
                # to deliver.
                self._reset_delta_tracking()
                self._emitted_len = total
                self._emitted_diff_len = len(self.state.ui_edit_diffs)
                sink(
                    TranscriptDelta(
                        first=0,
                        rows=copy.deepcopy(rows),
                        new_diffs=copy.deepcopy(self.state.ui_edit_diffs),
                        personas=self._persona_map(),
                    )
                )
                return
            first = min(
                [self._emitted_len]
                + [
                    index
                    for index in (
                        self._recorder.index_of(row) for row in (*self._held_rows(), *extra_rows)
                    )
                    if index is not None
                ]
            )
            if first >= total and self._emitted_diff_len >= len(self.state.ui_edit_diffs):
                return
            diffs = self.state.ui_edit_diffs
            payload = TranscriptDelta(
                first=first,
                # Copied at the boundary: these dicts are the run's own rows and
                # it goes on mutating them. Handing the live ones to another
                # thread is the race this copy exists to prevent.
                rows=copy.deepcopy(rows[first:]),
                new_diffs=copy.deepcopy(diffs[self._emitted_diff_len :]),
                personas=self._persona_map(),
            )
            self._emitted_len = total
            self._emitted_diff_len = len(diffs)
            sink(payload)
        except Exception:  # noqa: BLE001 - the view is not allowed to fail the run
            _log.warning("Could not publish a transcript delta; the view will reconcile.")

    def _reset_delta_tracking(self) -> None:
        """Forget what the view was told; the next delta starts from nothing."""
        self._recorder.reindex()
        self._emitted_len = 0
        self._emitted_diff_len = 0

    def _persona_map(self) -> dict[str, str]:
        """Agent name → persona, for rows that do not carry one themselves.

        Bounded by the number of agents, rebuilt per delta rather than cached:
        a child that appears between two deltas has to be able to colour the
        rows it is already producing.
        """
        personas: dict[str, str] = {}
        for child in self.state.child_states:
            persona = str(child.get("persona") or "")
            if not persona:
                continue
            for key in ("canonical_name", "name", "agent_id"):
                value = str(child.get(key) or "")
                if value:
                    personas[value] = persona
        return personas

    @traces(SWR.SWR_2434)
    def bind_ralph_loop(self, ralph: Any) -> None:
        self.ralph = ralph
        # Rotaris can run several loops at once against one registry, so each
        # loop may only consume the prompts queued against its own session.
        ralph.queued_prompt_session_id = getattr(self.state, "session_id", "") or ""

    def switch_entry_model(self, model_key: str) -> None:
        """Move the entry persona to ``model_key`` from the next iteration on."""
        import contextlib

        self.entry_model_override = model_key
        # RuntimeError: event loop already closed — the run ended; the override
        # still sticks for consistency but nothing is left to announce it to.
        with contextlib.suppress(RuntimeError):
            self.loop.call_soon_threadsafe(
                self._append_system_row,
                f"Switching to model {model_key} from the next iteration.",
            )

    def switch_entry_reasoning(self, reasoning: str) -> None:
        """Move the entry persona to ``reasoning`` from the next iteration on."""
        import contextlib

        self.entry_reasoning_override = reasoning
        with contextlib.suppress(RuntimeError):
            self.loop.call_soon_threadsafe(
                self._append_system_row,
                f"Switching to reasoning {reasoning} from the next iteration.",
            )

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    def apply_permission_mode(self, effective: EffectiveMode) -> None:
        """Announce a mid-run permission mode change in the session."""
        import contextlib

        with contextlib.suppress(RuntimeError):
            self.loop.call_soon_threadsafe(self._apply_permission_mode, effective)

    @traces(SWR.SWR_2509)
    def _apply_permission_mode(self, effective: EffectiveMode) -> None:
        """Write the mode change into the transcript, qualified by what it missed.

        The transcript row is the confirmation a desktop user actually reads, so
        it must never be broader than what happened (SWR-2509). A persona pin
        stricter than the chosen mode keeps that persona where it is, and an
        unqualified "changed to 'X'" would tell the user they had reined in — or
        loosened — agents that never moved.
        """
        self.state.permission_mode = effective.mode
        if effective.downgraded:
            self._append_system_row(effective.reason)
            return
        message = (
            f"Permission mode changed to '{effective.mode}' — it applies from the next tool call."
        )
        skipped = tuple(getattr(effective, "skipped_personas", ()) or ())
        if skipped:
            noun = "persona" if len(skipped) == 1 else "personas"
            names = ", ".join(skipped)
            message += (
                f" It does not apply to the {noun} {names}: their persona pin is "
                "stricter than the mode you chose."
            )
        self._append_system_row(message)

    def clear_transcript(self) -> None:
        self.loop.call_soon_threadsafe(self._clear_transcript)

    def _clear_transcript(self) -> None:
        self._recorder.clear()

    def _append_system_row(self, content: str) -> None:
        self._recorder.record_system(content)

    # ── verification phase (SWR-2609 / SWR-2610) ──────────────────────────
    #
    # These hooks are invoked by the Ralph loop on its own event-loop thread,
    # the same thread that owns ``self.state``, so they write the snapshot
    # directly instead of marshalling like the GUI-thread entry points below.

    @traces(SWR.SWR_2609)
    def on_verifier_started(self, iteration_num: int, suite: Any, control: Any) -> None:
        """Announce that the workspace's own checks are what the run now waits on."""
        del iteration_num
        self._verifier_control = control
        checks = list(getattr(suite, "checks", ()) or ())
        self.state.verifier_state = {
            "active": True,
            "check": "",
            "command": "",
            "index": 0,
            "total": len(checks),
            "started_at": time.time(),
            "deadline_s": 0.0,
        }
        self._save()

    @traces(SWR.SWR_2609)
    def on_verifier_check_started(
        self,
        iteration_num: int,
        check: Any,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        """Open a live row for one check and point the header at it."""
        name = str(getattr(check, "name", "") or "check")
        command = str(getattr(check, "command", "") or "")
        started = time.time()
        self.state.verifier_state = {
            "active": True,
            "check": name,
            "command": command,
            "index": index,
            "total": total,
            "started_at": started,
            "deadline_s": float(deadline_s),
        }
        self._recorder.record_verifier_check_started(iteration_num, check, index, started)

    @traces(SWR.SWR_2609, SWR.SWR_2610)
    def on_verifier_check_finished(
        self,
        iteration_num: int,
        result: Any,
        index: int,
        total: int,
    ) -> None:
        """Settle the check's row on its own outcome, not on the suite's."""
        del total
        self._recorder.record_verifier_check_finished(iteration_num, result, index)

    @traces(SWR.SWR_2609)
    def on_verifier_run(self, iteration_num: int, result: Any) -> None:
        """End the verification phase, whatever the suite concluded.

        And carry forward the one thing that outlives it: whether this workspace
        has a gate at all (SWR-2615). A run that verified nothing has nothing in
        flight to say so, which is precisely why its silence used to read as
        "verified".
        """
        del iteration_num
        self._verifier_control = None
        self._recorder.clear_verifier_rows()
        self.state.verifier_state = None
        self.state.gate_warning = _gate_warning_for(result)
        self._save()

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        """Ask the running check to stop. Safe to call with no suite in flight.

        Marshalled onto the loop thread on purpose: the runner arms and disarms
        the control there between checks, so skipping from the GUI thread could
        otherwise kill the terminal of the check that came *after* the one the
        user meant.
        """
        if self._verifier_control is None or self.loop.is_closed():
            return False
        try:
            self.loop.call_soon_threadsafe(self._skip_verifier_check)
        except RuntimeError:
            return False
        return True

    def _skip_verifier_check(self) -> None:
        control = self._verifier_control
        if control is None:
            return
        try:
            control.skip_current()
        except Exception:  # noqa: BLE001 - a failed skip must not end the run
            _log.warning("Could not skip the running verifier check", exc_info=True)

    def cancel_agent(self, agent_id: str) -> bool:
        manager = self._child_managers.get(agent_id)
        if self.ralph is None or manager is None or self.loop.is_closed():
            return False
        try:
            asyncio.run_coroutine_threadsafe(
                self.ralph.scheduler.cancel_child(manager, agent_id),
                self.loop,
            )
        except RuntimeError:
            return False
        return True

    def on_iteration_start(self, _iteration_num: int, task: Any) -> None:
        self.loop.call_soon_threadsafe(self._set_todo_task, task.id, "IN_PROGRESS")

    def on_child_spawned(self, _record: Any, manager: Any) -> None:
        self._schedule_manager(manager)

    def on_child_created(self, _record: Any, manager: Any, todo: Any) -> None:
        self._remember_manager(manager)
        self.loop.call_soon_threadsafe(self._apply, manager.snapshot_children(), todo)

    def on_child_running(self, _record: Any, manager: Any) -> None:
        self._schedule_manager(manager)

    def on_child_terminal(self, _record: Any, manager: Any) -> None:
        self._schedule_manager(manager)

    def on_todo_state(self, todo: Any) -> None:
        self._live_todo = todo
        self.loop.call_soon_threadsafe(self._apply_todo, todo)

    def edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str = "",
    ) -> bool:
        if self._live_todo is None or getattr(self.loop, "is_closed", lambda: False)():
            return False
        if operation not in {"add", "remove", "rename"}:
            return False
        if operation != "remove" and not text.strip():
            return False
        self.loop.call_soon_threadsafe(self._edit_todo, operation, target_id, text)
        return True

    def extra_runtime_kwargs(self) -> dict[str, Any]:
        return {}

    def bind_scheduler_callbacks(self, manager: Any) -> None:
        if self.ralph is None:
            return
        scheduler = self.ralph.scheduler

        def _conversation_event(record: Any, event: object) -> None:
            # The rows are not built here any more: ``child_run`` hands every
            # conversation event to the session's recorder before this callback
            # runs (SWR-2454). What is left is what belongs to this host — the
            # token accounting and the agent-tree refresh.
            self._capture_live_prompt_tokens(record)
            self._schedule_manager(manager)

        def _spawn_notification(_record: Any) -> None:
            # Fires when the scheduler flips a queued child to RUNNING (and on
            # other internal state changes) — without this, delegated children
            # stay shown as "queued" in the UI until the whole iteration ends.
            self._schedule_manager(manager)

        def _stall(_record: Any, _elapsed: float, _phase: str) -> None:
            self._schedule_manager(manager)

        def _questions_stored(
            conversation: object,
            prompt_id: str,
            steps: list[AskQuestionsStep],
        ) -> None:
            conversation_id = getattr(conversation, "id", None)
            with scheduler._conversation_lock:
                agent_id = next(
                    (
                        name
                        for name, active in scheduler._active_conversations.items()
                        if getattr(active, "id", None) == conversation_id
                    ),
                    "",
                )
            if not agent_id:
                raise RuntimeError("Prompt conversation is not active.")
            raw_steps = [step.model_dump(mode="json") for step in steps]
            self.loop.call_soon_threadsafe(
                self._store_pending_questions,
                agent_id,
                prompt_id,
                raw_steps,
            )
            self._schedule_manager(manager)

        self.ralph.scheduler._conversation_event_callback = _conversation_event
        self.ralph.scheduler._spawn_notification_callback = _spawn_notification
        self.ralph.scheduler._stall_callback = _stall
        self.ralph.scheduler.on_questions_stored = _questions_stored

    def unbind_scheduler_callbacks(self) -> None:
        if self.ralph is not None:
            self.ralph.scheduler.on_questions_stored = None

    @traces(SWR.SWR_2504)
    def present_approval(self, payload: dict[str, Any]) -> None:
        """Publish one pending approval for the desktop UI.

        Runs on the blocked agent's dispatch thread, so it only hands the
        payload to the run loop and returns immediately.
        """
        self.loop.call_soon_threadsafe(self._store_pending_approval, dict(payload))

    @traces(SWR.SWR_2504)
    def dismiss_approval(self, request_id: str) -> None:
        """Drop a resolved (or timed-out) approval from the persisted state."""
        self.loop.call_soon_threadsafe(self._clear_pending_approval, request_id)

    def _store_pending_approval(self, payload: dict[str, Any]) -> None:
        request_id = str(payload.get("request_id", ""))
        if not request_id:
            return
        pending = dict(self.state.pending_approvals or {})
        pending[request_id] = payload
        self.state.pending_approvals = pending
        self._save()

    def _clear_pending_approval(self, request_id: str) -> None:
        pending = dict(self.state.pending_approvals or {})
        if pending.pop(request_id, None) is None:
            return
        self.state.pending_approvals = pending
        self._save()

    def _store_pending_questions(
        self,
        agent_id: str,
        prompt_id: str,
        steps: list[dict[str, Any]],
    ) -> None:
        self.state.pending_questions = {
            "agent_id": agent_id,
            "prompt_id": prompt_id,
            "steps": steps,
        }
        self._save()

    def on_last_prompt_tokens(self, record: Any, tokens: int) -> None:
        self.loop.call_soon_threadsafe(self._set_prompt_tokens, record.canonical_name, tokens)

    def _capture_live_prompt_tokens(self, record: Any) -> None:
        """Capture prompt usage after each model turn, while child still runs."""
        if self.ralph is None:
            return
        active_conversations = getattr(self.ralph.scheduler, "_active_conversations", {})
        conversation = active_conversations.get(record.canonical_name)
        agent = getattr(conversation, "agent", None)
        llm = getattr(agent, "llm", None)
        if llm is None:
            return

        from rotaris_core.cost import extract_cost_usage
        from rotaris_core.tokens import get_last_prompt_token_count
        from rotaris_core.tracking.tracker import GlobalTracker

        tokens = get_last_prompt_token_count(llm)
        if tokens is not None and tokens > 0:
            self.loop.call_soon_threadsafe(
                self._set_prompt_tokens,
                record.canonical_name,
                int(tokens),
            )

        GlobalTracker().set_agent_cost(record.canonical_name, extract_cost_usage(llm))

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        if usage is not None:
            self.loop.call_soon_threadsafe(self._set_tokens, usage)

    def on_iteration_end(
        self,
        _record: Any,
        _report: Any,
        manager: Any,
        todo: Any,
        _outcome: Any,
    ) -> None:
        self._remember_manager(manager)
        self.loop.call_soon_threadsafe(self._recorder.finish_all_thinking)
        self.loop.call_soon_threadsafe(self._apply, manager.snapshot_children(), todo)

    def _schedule_manager(self, manager: Any) -> None:
        snapshots = manager.snapshot_children()
        self._remember_manager(manager, snapshots)
        self.loop.call_soon_threadsafe(self._apply, snapshots, None)

    def _remember_manager(self, manager: Any, records: list[Any] | None = None) -> None:
        snapshots = records if records is not None else manager.snapshot_children()
        for record in snapshots:
            self._child_managers[record.canonical_name] = manager

    _TERMINAL_CHILD_STATES = frozenset({"succeeded", "failed", "cancelled", "blocked"})

    def _apply(self, records: list[Any], todo: Any | None) -> None:
        existing = {
            str(item.get("canonical_name") or item.get("name")): item
            for item in self.state.child_states
        }
        for record in records:
            payload = record.model_dump(mode="json")
            name = str(payload.get("canonical_name") or payload.get("name"))
            if str(payload.get("state", "")).lower() in self._TERMINAL_CHILD_STATES:
                # A child that ended mid-call must not keep stale active chips.
                self._recorder.forget_active_tools(name)
            payload["active_tools"] = self._recorder.active_tool_names(name)
            existing[name] = payload
        self.state.child_states = list(existing.values())
        if todo is not None:
            self.state.todo_state = todo.model_dump(mode="json")
        self._save()

    def _apply_todo(self, todo: Any) -> None:
        self.state.agent_todo_state = todo.model_dump(mode="json")
        self._save()

    def _edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str,
    ) -> None:
        todo = self._live_todo
        if todo is None:
            return
        from rotaris.services.todo_editing import edit_todo_list

        if edit_todo_list(todo, operation, target_id, text):
            self._apply_todo(todo)

    def _set_todo_task(self, task_id: str, status: str) -> None:
        for phase in (self.state.todo_state or {}).get("phases", []):
            for task in phase.get("tasks", []):
                if task.get("id") == task_id:
                    task["status"] = status
        self._save()

    def _set_prompt_tokens(self, agent_name: str, tokens: int) -> None:
        from rotaris_core.session.state import AgentMetrics

        metrics = self.state.agent_metrics.setdefault(agent_name, AgentMetrics())
        metrics.last_prompt_tokens = tokens
        self.state.root_context_tokens = tokens
        self._save()

    def _set_tokens(self, usage: dict[str, Any]) -> None:
        self.state.token_usage = usage
        self._save()


def _isolation_request_fields(isolation: Any) -> dict[str, Any]:
    """Translate the window's isolation choice into ``RunRequest`` fields."""
    if isolation is None:
        return {}
    if getattr(isolation, "create", True):
        return {"isolate": True, "worktree_branch": getattr(isolation, "branch", None)}
    path = getattr(isolation, "path", None)
    if path is None:
        raise RuntimeError("An existing worktree path is required.")
    from pathlib import Path as _Path

    return {"worktree_path": _Path(path)}


def _answers_of(answers: object) -> dict[str, dict[str, str | None]]:
    """The plain answer payload, whatever shape the window handed over.

    A ``QuestionAnswers`` is a UI model; only what is inside it can cross into
    a run, which is the whole reason the control interface takes a mapping.
    """
    if isinstance(answers, dict):
        return answers
    return dict(getattr(answers, "answers", {}) or {})
