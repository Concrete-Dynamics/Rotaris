"""Session-scoped routing above one :class:`RunBridge` per concurrent run.

Rotaris used to own exactly one bridge, so "the run" and "the workspace" were
the same thing. The coordinator keeps that facade — every control the views
already call still routes to the *focused* run — while giving each session its
own worker, thread, refresh cycle, prompt queue and improvement job.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris.models.store import WorkspaceStore
    from rotaris.services.config_service import ConfigService
    from rotaris.services.run_bridge import RunBridge


@traces(SWR.SWR_2415, SWR.SWR_2434)
class RunCoordinator(QObject):
    """Own every live run in one workspace and route commands by focus."""

    # ── facade signals: the focused run only, so single-run views are unchanged
    run_started = Signal(str)
    run_finished = Signal(str)
    run_failed = Signal(str)
    refresh_failed = Signal(str)
    store_updated = Signal()
    compression_finished = Signal(int, str)  # success count, error summary

    # ── session-aware signals: every run, including background ones
    session_run_started = Signal(str)  # session id
    session_run_finished = Signal(str, str)  # session id, status
    session_run_failed = Signal(str, str)  # session id, message
    focus_changed = Signal(str)  # session id

    def __init__(
        self,
        workspace: Path,
        store: WorkspaceStore,
        config_service: ConfigService,
        diagnostics: Any | None = None,
        parent: QObject | None = None,
        bridge_factory: Callable[[], RunBridge] | None = None,
    ) -> None:
        super().__init__(parent)
        self.workspace = workspace
        self.store = store
        self.config_service = config_service
        self.diagnostics = diagnostics
        self._bridge_factory = bridge_factory or self._default_bridge_factory
        self._handles: dict[str, RunBridge] = {}
        self._focused_id = ""

    # ── handle lifecycle ──────────────────────────────────────────────────

    def _default_bridge_factory(self) -> RunBridge:
        from rotaris.services.run_bridge import RunBridge

        return RunBridge(
            self.workspace,
            self.store,
            self.config_service,
            self.diagnostics,
            parent=self,
        )

    def _create_handle(self, session_id: str) -> RunBridge:
        handle = self._bridge_factory()
        # The coordinator ORs analysis activity across handles; a single handle
        # must not clear an indicator another run still needs.
        handle.owns_improvement_indicator = False
        handle.set_projection_enabled(False)
        handle.run_started.connect(lambda _sid, key=session_id: self._on_started(key))
        handle.run_finished.connect(lambda status, key=session_id: self._on_finished(key, status))
        handle.run_failed.connect(lambda message, key=session_id: self._on_failed(key, message))
        handle.store_updated.connect(lambda key=session_id: self._on_store_updated(key))
        handle.refresh_failed.connect(
            lambda message, key=session_id: self._on_refresh_failed(key, message)
        )
        handle.compression_finished.connect(
            lambda count, summary, key=session_id: self._on_compression_finished(
                key, count, summary
            )
        )
        handle.session_summary.connect(self._on_session_summary)
        handle.worktree_resolved.connect(self._on_worktree_resolved)
        handle.improvement_activity_changed.connect(self._on_improvement_activity)
        self._handles[session_id] = handle
        return handle

    # ── public coordinator API ────────────────────────────────────────────

    @property
    def focused_session_id(self) -> str:
        """Session whose transcript, controls and queue the workspace shows."""
        return self._focused_id

    @property
    def active_session_ids(self) -> list[str]:
        """Sessions with a run in flight; paused and terminal runs are absent."""
        return [key for key, handle in self._handles.items() if handle.running]

    @property
    def session_ids(self) -> list[str]:
        """Every session this coordinator has a handle for, live or finished."""
        return list(self._handles)

    def handle_for(self, session_id: str) -> RunBridge | None:
        return self._handles.get(session_id)

    @traces(SWR.SWR_2415, SWR.SWR_3612)
    def launch_new(
        self,
        prompt: str,
        *,
        isolation: Any | None = None,
        run_config: Any | None = None,
        requirement_id: str = "",
        unit_id: str = "",
    ) -> str:
        """Start an additional run and focus it. Returns its session id, or ''.

        Isolation is mandatory while another run is active: two runs sharing one
        working tree would overwrite each other's edits.

        *requirement_id* and *unit_id* say what the run is for (SWR-3612). Both
        default to empty, which is what a person starting a run from the composer
        means — not "unknown" — and nothing is rendered for it.
        """
        from rotaris_core.session.manager import SessionManager

        if not prompt.strip():
            return ""
        session_id = getattr(isolation, "session_id", None) or SessionManager.new_session_id()
        if self.isolation_required and isolation is None:
            from rotaris_core.session.worktrees import WorktreeLaunchRequest

            isolation = WorktreeLaunchRequest(session_id=session_id)
        if run_config is None:
            run_config = self._snapshot_run_config()

        handle = self._create_handle(session_id)
        self._publish_starting_row(
            session_id,
            isolation,
            prompt,
            requirement_id=requirement_id,
            unit_id=unit_id,
        )
        self.focus(session_id)
        try:
            started = handle.start(
                prompt,
                None,
                isolation,
                new_session_id=session_id,
                run_config=run_config,
            )
        except Exception:
            self._discard_handle(session_id)
            raise
        if not started:
            self._discard_handle(session_id)
            return ""
        return session_id

    @traces(SWR.SWR_2415)
    def resume(
        self,
        session_id: str,
        prompt: str,
        *,
        run_config: Any | None = None,
    ) -> bool:
        """Continue a persisted session as an additional concurrent run."""
        if not session_id or not prompt.strip():
            return False
        existing = self._handles.get(session_id)
        if existing is not None and existing.running:
            return False
        if self.isolation_required and not self._is_isolated_session(session_id):
            # The base working tree already belongs to the running session.
            return False
        handle = existing if existing is not None else self._create_handle(session_id)
        self.focus(session_id)
        return handle.start(
            prompt,
            session_id,
            None,
            run_config=run_config if run_config is not None else self._snapshot_run_config(),
        )

    @traces(SWR.SWR_2415)
    def focus(self, session_id: str) -> bool:
        """Project ``session_id`` into the workspace without touching lifecycles.

        Background runs keep running, keep refreshing their own snapshot and
        keep their queued prompts; only what the window renders changes.
        """
        if session_id == self._focused_id:
            return True
        previous = self._handles.get(self._focused_id)
        if previous is not None:
            previous.set_projection_enabled(False)
        self._focused_id = session_id
        self.store.set_focused_session(session_id)
        if session_id:
            self._load_focused_projection(session_id)
        handle = self._handles.get(session_id)
        if handle is not None:
            handle.set_projection_enabled(True)
            handle.sync_queued_prompts()
        else:
            self.store.set_queued_prompts([])
        self.focus_changed.emit(session_id)
        return True

    @property
    def isolation_required(self) -> bool:
        """True when a new run must get its own worktree to start safely."""
        return bool(self.active_session_ids)

    @traces(SWR.SWR_2415)
    def shutdown_all(self) -> None:
        """Ask every run to stop, then wait for all of them.

        Requests come first so the runs unwind in parallel; shutting handles
        down one at a time would serialize every SDK call still in flight.
        """
        for handle in self._handles.values():
            handle.cancel()
        for handle in self._handles.values():
            handle.shutdown()
        self.store.set_improvement_collection_active(False)

    # ── RunBridge facade (focused run) ────────────────────────────────────

    @property
    def _focused(self) -> RunBridge | None:
        return self._handles.get(self._focused_id)

    @property
    def running(self) -> bool:
        handle = self._focused
        return handle is not None and handle.running

    @property
    def any_running(self) -> bool:
        return bool(self.active_session_ids)

    @property
    def session_id(self) -> str:
        return self._focused_id

    def start(
        self,
        prompt: str,
        session_id: str | None = None,
        isolation: Any | None = None,
        **kwargs: Any,
    ) -> bool:
        """Single-run entry point kept for the composer and existing callers."""
        if session_id:
            return self.resume(session_id, prompt, run_config=kwargs.get("run_config"))
        return bool(
            self.launch_new(
                prompt,
                isolation=isolation,
                run_config=kwargs.get("run_config"),
            )
        )

    def steer(self, agent_id: str, text: str) -> bool:
        handle = self._focused
        return handle is not None and handle.steer(agent_id, text)

    def queue_prompt(self, text: str) -> str:
        handle = self._focused
        return handle.queue_prompt(text) if handle is not None else ""

    def edit_queued_prompt(self, prompt_id: str, text: str) -> bool:
        handle = self._focused
        return handle is not None and handle.edit_queued_prompt(prompt_id, text)

    def delete_queued_prompt(self, prompt_id: str) -> bool:
        handle = self._focused
        return handle is not None and handle.delete_queued_prompt(prompt_id)

    def sync_queued_prompts(self) -> None:
        handle = self._focused
        if handle is not None:
            handle.sync_queued_prompts()

    def cancel_agent(self, agent_id: str) -> bool:
        handle = self._focused
        return handle is not None and handle.cancel_agent(agent_id)

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        """Skip the focused run's running check. Parallel runs verify separately,
        so this addresses the run the user is watching and no other."""
        handle = self._focused
        return handle is not None and handle.skip_verifier_check()

    def pause(self) -> bool:
        handle = self._focused
        return handle is not None and handle.pause()

    def pause_agent(self, agent_id: str) -> bool:
        handle = self._focused
        return handle is not None and handle.pause_agent(agent_id)

    def switch_entry_model(self, model_key: str) -> bool:
        handle = self._focused
        return handle is not None and handle.switch_entry_model(model_key)

    def switch_entry_reasoning(self, reasoning: str) -> bool:
        handle = self._focused
        return handle is not None and handle.switch_entry_reasoning(reasoning)

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    def set_permission_mode(self, mode: str) -> bool:
        """Switch the focused run's permission mode.

        Only the focused session, matching the model and reasoning switches:
        a background run keeps the mode it launched with. The persisted
        workspace setting is what governs runs started afterwards.
        """
        handle = self._focused
        return handle is not None and handle.set_permission_mode(mode)

    def force_compress(self) -> bool:
        handle = self._focused
        return handle is not None and handle.force_compress()

    def clear_transcript(self) -> bool:
        handle = self._focused
        return handle is not None and handle.clear_transcript()

    def edit_todo(self, operation: Any, target_id: str, text: str = "") -> bool:
        handle = self._focused
        return handle is not None and handle.edit_todo(operation, target_id, text)

    @traces(SWR.SWR_2504)
    def resolve_approval(self, request_id: str, option: str) -> bool:
        """Answer a blocked tool call from the desktop approval modal.

        The workspace only renders the focused session's pending approvals, so
        that handle answers first. A decision can still arrive just after focus
        moved on (the modal outlives the switch), so the other live handles are
        tried as a fallback rather than reporting the answer as undeliverable.
        """
        handle = self._focused
        if handle is not None and handle.resolve_approval(request_id, option):
            return True
        return any(
            other.resolve_approval(request_id, option)
            for other in self._handles.values()
            if other is not handle
        )

    def resolve_questions(self, agent_id: str, prompt_id: str, answers: object) -> bool:
        handle = self._focused
        return handle is not None and handle.resolve_questions(agent_id, prompt_id, answers)

    def cancel_questions(self, agent_id: str, prompt_id: str) -> bool:
        handle = self._focused
        return handle is not None and handle.cancel_questions(agent_id, prompt_id)

    @traces(SWR.SWR_2415)
    def cancel(self) -> None:
        """Cancel the focused run only — other runs continue untouched."""
        handle = self._focused
        if handle is not None:
            handle.cancel()

    def shutdown(self) -> None:
        self.shutdown_all()

    # ── handle signal fan-in ──────────────────────────────────────────────

    def _on_started(self, session_id: str) -> None:
        self.session_run_started.emit(session_id)
        self.store.update_session_summary(session_id, status="running")
        if session_id == self._focused_id:
            self.run_started.emit(session_id)

    @traces(SWR.SWR_2415)
    def _on_finished(self, session_id: str, status: str) -> None:
        """Terminal handling; background runs never interrupt the focused one."""
        self.session_run_finished.emit(session_id, status)
        self.store.update_session_summary(session_id, status=status)
        if session_id == self._focused_id:
            self.run_finished.emit(status)

    @traces(SWR.SWR_2415)
    def _on_failed(self, session_id: str, message: str) -> None:
        self.session_run_failed.emit(session_id, message)
        self.store.update_session_summary(session_id, status="failed")
        if session_id == self._focused_id:
            self.run_failed.emit(message)

    def _on_store_updated(self, session_id: str) -> None:
        if session_id == self._focused_id:
            self.store_updated.emit()

    def _on_refresh_failed(self, session_id: str, message: str) -> None:
        if session_id == self._focused_id:
            self.refresh_failed.emit(message)

    def _on_compression_finished(self, session_id: str, count: int, summary: str) -> None:
        if session_id == self._focused_id:
            self.compression_finished.emit(count, summary)

    @Slot(str, str, str)
    def _on_session_summary(self, session_id: str, status: str, branch: str) -> None:
        self.store.update_session_summary(session_id, status=status, branch=branch)

    @Slot(str, str)
    def _on_worktree_resolved(self, session_id: str, branch: str) -> None:
        self.store.update_session_summary(session_id, branch=branch)

    @Slot(bool)
    @traces(SWR.SWR_2415)
    def _on_improvement_activity(self, _active: bool) -> None:
        """Indicator stays lit while *any* handle still analyses its run."""
        self.store.set_improvement_collection_active(
            any(handle.improvement_active for handle in self._handles.values())
        )

    # ── internals ─────────────────────────────────────────────────────────

    def _snapshot_run_config(self) -> Any:
        """Pin configuration at launch so later edits cannot alter a live run."""
        if self.config_service is None:
            return None
        if getattr(self.config_service, "config", None) is None:
            self.config_service.load()
        return self.config_service.build_run_config()

    @traces(SWR.SWR_2907, SWR.SWR_3612)
    def _publish_starting_row(
        self,
        session_id: str,
        isolation: Any | None,
        prompt: str,
        *,
        requirement_id: str = "",
        unit_id: str = "",
    ) -> None:
        from rotaris_core.session.task_context import build_task_display_name

        from rotaris.models.state import SessionInfo

        branch = getattr(isolation, "branch", None) or ""
        self.store.upsert_session(
            SessionInfo(
                id=session_id,
                # Label the row by what the run does from the moment it appears
                # (SWR-2907); no snapshot exists yet to derive it from.
                name=build_task_display_name(prompt) if prompt.strip() else session_id,
                status="starting",
                branch=branch or "—",
                detail="Starting…",
                # What the run is for, from the moment it appears (SWR-3612).
                # The launcher knows this before the session's first metadata
                # write does, so a requirement run is never briefly anonymous.
                requirement_id=requirement_id,
                unit_id=unit_id,
            )
        )

    def _load_focused_projection(self, session_id: str) -> None:
        if self.config_service is None:
            return
        try:
            self.config_service.load_session(session_id)
        except (KeyError, OSError, RuntimeError, ValueError):
            # A session that has not persisted its first snapshot yet: the
            # handle's own refresh publishes the projection moments later.
            self.store.clear_session()
            self.store.session_name = session_id
            self.store.set_session_status("starting")

    def _is_isolated_session(self, session_id: str) -> bool:
        for session in self.store.sessions:
            if session.id == session_id:
                return bool(session.branch) and session.branch != "—"
        return True

    def _discard_handle(self, session_id: str) -> None:
        handle = self._handles.pop(session_id, None)
        if handle is not None:
            handle.shutdown()
            handle.deleteLater()
