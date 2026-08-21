"""TUI-bound RalphLoop subclass and iteration observer.

Wires the Ralph run loop into the Textual TUI via observer callbacks,
debounced persistence, and scheduler-issue notifications.
"""

from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING, Any, Literal

from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.ralph.loop import RalphLoop
from rotaris_core.ralph.state import RalphIterationOutcome
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.improvement.collector import ImprovementCollector
    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.session.state import SessionState
    from rotaris_core.tui.app import RotarisTuiApp


class TuiRalphLoop(RalphLoop):
    """RalphLoop variant that bridges the run loop into the Textual TUI.

    Accepts TUI callbacks for live activity, agent display sync, child
    spawn notifications, conversation/token events, and state persistence.
    """

    def __init__(  # noqa: ANN401
        self,
        *,
        config: RotarisConfig,
        workspace_root: str,
        summary_agent: Any,  # noqa: ANN401
        state: SessionState,
        app: RotarisTuiApp,
        sync_children: Callable[..., None],
        dispatch_ui: Callable[..., None],
        set_live_activity: Callable[..., None],
        push_activity_event: Callable[..., None],
        notify_child_spawn: Callable[..., None],
        apply_conversation_event: Callable[..., None],
        apply_token_event: Callable[..., None],
        update_agent_todo: Callable[..., None],
        persist_state: Callable[[], None],
        clear_live_stream: Callable[[str], None],
        store_report: Callable[[str, str], None],
        improvement_collector_factory: Callable[[], ImprovementCollector] | None = None,
        improvement_context_provider: Callable[[], dict[str, Any]] | None = None,
    ) -> None:
        """Create a TUI-wired Ralph run loop.

        Args:
            config: Rotaris configuration.
            workspace_root: Absolute path to the workspace root.
            summary_agent: Agent factory for summary/triage runs.
            state: Mutable session state.
            app: The Textual RotarisTuiApp instance.
            sync_children: Callback to sync child agent display.
            dispatch_ui: Thread-safe UI dispatch (safe_call_from_thread).
            set_live_activity: Callback to update live-activity widget.
            push_activity_event: Callback to append an activity timeline event.
            notify_child_spawn: Callback when a child agent is spawned.
            apply_conversation_event: Callback for conversation events.
            apply_token_event: Callback for streaming token chunks.
            update_agent_todo: Callback to update agent todo display.
            persist_state: Callback to write session state to disk.
            clear_live_stream: Callback to clear a live-stream buffer.
            store_report: Callback to store a child agent's final report.
            improvement_collector_factory: Optional factory for improvement collection.
            improvement_context_provider: Optional provider for improvement context.
        """
        session_manager = getattr(app, "session_manager", None)
        from rotaris_core.improvement.types import RunType  # noqa: PLC0415
        from rotaris_core.session.diagnostics import conversations_dir  # noqa: PLC0415

        conversation_persistence_dir = (
            conversations_dir(session_manager.session_dir(state.session_id))
            if session_manager is not None
            else None
        )
        super().__init__(
            config=config,
            workspace_root=workspace_root,
            summary_agent=summary_agent,
            conversation_persistence_dir=conversation_persistence_dir,
            run_type=RunType.TASK_RUN,
            improvement_collector_factory=improvement_collector_factory,
            improvement_context_provider=improvement_context_provider,
            mcp_manager=session_manager.mcp_manager if session_manager is not None else None,
        )
        self._state = state
        self._message_count = state.message_count
        self._message_limit = state.message_limit or config.runtime.message_limit
        if state.message_limit is None:
            state.message_limit = self._message_limit
        self._app = app
        self._sync_children = sync_children
        self._dispatch_ui = dispatch_ui
        self._set_live_activity = set_live_activity
        self._push_activity_event = push_activity_event
        self._notify_child_spawn = notify_child_spawn
        self._apply_conversation_event = apply_conversation_event
        self._apply_token_event = apply_token_event
        self._update_agent_todo = update_agent_todo
        self._persist_state = persist_state
        self._clear_live_stream = clear_live_stream
        self._store_report = store_report
        # Debounce window for intra-iteration persistence calls. The end-of-
        # iteration call always forces a flush; transient progress updates
        # within the same window are coalesced.
        self._persist_debounce_seconds = 0.25
        self._last_persist_at = 0.0
        self._notified_issue_keys: set[tuple[str, str, str]] = set()
        self._quota_notified_agents: set[str] = set()
        # Bounded in-memory transcript — older events are evicted to a
        # disk-backed JSONL archive and replaced with page sentinels.
        self._max_transcript_events = config.transcript.max_in_memory_events
        self._max_report_artifacts = 100
        self._archiver: Any = None
        self._eviction_lock = threading.Lock()
        self._next_page_offset: int = 0
        self.scheduler.set_diagnostic_issue_callback(self._notify_scheduler_issue)
        self._observer = TuiIterationObserver(self)

    @traces(SWR.SWR_910, SWR.SWR_918)
    def _record_message_count(self) -> None:
        """Persist the completed-iteration counter and active session limit."""
        self._state.message_count = self._message_count
        self._state.message_limit = self._message_limit
        self._persist_state_now()

    @traces(SWR.SWR_1271)
    def _trim_session_state(self) -> None:
        """Evict oldest transcript events to disk-backed JSONL archive.

        When the in-memory event count exceeds ``max_in_memory_events``,
        the oldest events are appended to the archive and replaced with
        a ``{"role": "page", "offset": N, "count": M}`` sentinel.
        """
        events = self._state.transcript_events
        real_event_count = sum(1 for event in events if event.get("role") != "page")
        excess = real_event_count - self._max_transcript_events
        if excess <= 0:
            # Artifacts still use simple truncation.
            artifacts = self._state.report_artifacts
            if len(artifacts) > self._max_report_artifacts:
                del artifacts[: len(artifacts) - self._max_report_artifacts]
            return

        self._ensure_archiver()
        if self._archiver is None:
            # Without a session directory there is no durable archive target.
            # Keep the TUI bounded by dropping oldest real events.
            with self._eviction_lock:
                remaining_to_drop = excess
                kept_events: list[dict[str, Any]] = []
                for event in events:
                    if event.get("role") != "page" and remaining_to_drop > 0:
                        remaining_to_drop -= 1
                        continue
                    kept_events.append(event)
                events[:] = kept_events
        else:
            # Capture oldest non-sentinel events under lock — the session
            # persist path (write_split_state) may iterate transcript_events
            # concurrently.  Existing page sentinels are metadata and must not
            # be archived as transcript content.
            with self._eviction_lock:
                remaining_to_evict = excess
                evicted: list[dict[str, Any]] = []
                kept_events = []
                for event in events:
                    if event.get("role") == "page":
                        continue
                    if remaining_to_evict > 0:
                        evicted.append(event)
                        remaining_to_evict -= 1
                        continue
                    kept_events.append(event)
                events[:] = kept_events

            # Write archive outside the lock.
            self._archiver.append(evicted)
            newest_offset = self._archiver.newest_page_offset()
            if newest_offset is not None:
                sentinel: dict[str, Any] = {
                    "role": "page",
                    "offset": newest_offset,
                    "count": self._archiver.event_count_for_page(newest_offset),
                }
                with self._eviction_lock:
                    events.insert(0, sentinel)
                self._next_page_offset = newest_offset + 1

        # Artifacts use simple truncation.
        artifacts = self._state.report_artifacts
        if len(artifacts) > self._max_report_artifacts:
            del artifacts[: len(artifacts) - self._max_report_artifacts]

    def _ensure_archiver(self) -> None:
        if self._archiver is not None:
            return
        from rotaris_core.tui.transcript_archiver import TranscriptArchiver  # noqa: PLC0415

        session_manager = getattr(self._app, "session_manager", None)
        session_dir = (
            session_manager.session_dir(self._state.session_id) if session_manager else None
        )
        if session_dir is None:
            return
        self._archiver = TranscriptArchiver(
            session_dir,
            page_size=self.config.transcript.archive_page_size,
        )
        newest_offset = self._archiver.newest_page_offset()
        if newest_offset is not None:
            self._next_page_offset = newest_offset + 1

    def _persist_state_debounced(self) -> None:
        """Persist state, skipping if a recent write already covered us.

        Used for intra-iteration progress markers where missing one update
        is harmless because the next forced ``_persist_state()`` (e.g. at
        iteration end) always writes a complete snapshot.
        """
        now = time.monotonic()
        if now - self._last_persist_at < self._persist_debounce_seconds:
            return
        self._last_persist_at = now
        self._trim_session_state()
        self._persist_state()

    def _persist_state_now(self) -> None:
        """Force an immediate snapshot write."""
        self._last_persist_at = time.monotonic()
        self._trim_session_state()
        self._persist_state()

    def _scheduler_issue_notification_text(self, kind: str, actor: str, message: str) -> str | None:
        if kind == "provider_quota_exhausted":
            if actor:
                self._quota_notified_agents.add(actor)
            return message
        if kind != "child_exception":
            return None
        if actor and actor in self._quota_notified_agents:
            return None
        return f"{actor} failed: {message}" if actor else message

    def _build_scheduler_issue_notification(
        self,
        issue: dict[str, Any],
    ) -> (
        tuple[
            tuple[str, str, str],
            str,
            Literal["information", "warning", "error"],
            float,
        ]
        | None
    ):
        kind = str(issue.get("kind") or "")
        actor = str(issue.get("actor") or "")
        message = str(issue.get("message") or "").strip()
        raw_severity = str(issue.get("severity") or "warning")
        severity: Literal["information", "warning", "error"]
        if raw_severity == "error":
            severity = "error"
        elif raw_severity == "warning":
            severity = "warning"
        else:
            severity = "information"
        if not message:
            return None

        text = self._scheduler_issue_notification_text(kind, actor, message)
        if text is None:
            return None

        issue_key = (kind, actor, text)
        timeout = 10.0 if severity == "error" else 8.0
        return issue_key, text, severity, timeout

    def _notify_scheduler_issue(self, issue: dict[str, Any]) -> None:
        kind = str(issue.get("kind") or "")
        if kind == "provider_quota_exhausted":
            metadata = issue.get("metadata")
            if isinstance(metadata, dict):
                provider_exhausted = bool(metadata.get("provider_exhausted"))
                model = str(metadata.get("model") or "").strip()
                if (
                    provider_exhausted
                    and model
                    and model not in self._state.exhausted_provider_models
                ):
                    self._state.exhausted_provider_models.append(model)
                    self._persist_state_debounced()
                wait_seconds = metadata.get("wait_seconds")
                if isinstance(wait_seconds, int) and wait_seconds > 0:
                    actor = str(issue.get("actor") or "")
                    message = str(issue.get("message") or "").strip()
                    allow_auto_resume = bool(metadata.get("allow_auto_resume", True))
                    model_or_none: str | None = model or None
                    self._dispatch_ui(
                        lambda: self._app.show_quota_wait_prompt(
                            actor=actor,
                            message=message,
                            model=model_or_none,
                            wait_seconds=wait_seconds,
                            allow_auto_resume=allow_auto_resume,
                        ),
                    )
                    return

        payload = self._build_scheduler_issue_notification(issue)
        if payload is None:
            return

        issue_key, text, severity, timeout = payload
        if issue_key in self._notified_issue_keys:
            return
        self._notified_issue_keys.add(issue_key)
        self._dispatch_ui(
            lambda: self._app.notify(
                text,
                severity=severity,
                timeout=timeout,
            ),
        )


class TuiIterationObserver(RalphIterationObserver):
    """Mirrors Ralph iteration lifecycle into the TUI.

    All hooks run on the event loop thread except ``on_child_spawned``,
    which the delegate tool can fire from an ``asyncio.to_thread`` worker —
    that one marshals through ``dispatch_ui`` (``safe_call_from_thread``).
    """

    def __init__(self, loop: TuiRalphLoop) -> None:
        """Create an observer backed by the given TUI loop.

        Args:
            loop: The TuiRalphLoop whose private members are observed.
        """
        self._loop = loop

    @traces(SWR.SWR_911, SWR.SWR_912, SWR.SWR_914, SWR.SWR_918)
    def on_message_limit_reached(self, message_count: int, message_limit: int) -> None:
        """Persist paused state and dispatch the confirmation modal."""
        lp = self._loop
        usage = lp._state.global_token_usage  # noqa: SLF001
        token_usage = f"Input: {usage.prompt_tokens:,} / Output: {usage.completion_tokens:,}"
        lp._state.execution_status = "paused_message_limit"  # noqa: SLF001
        lp._persist_state_now()  # noqa: SLF001
        lp._dispatch_ui(  # noqa: SLF001
            lambda: lp._app.show_message_limit_prompt(  # noqa: SLF001
                message_count=message_count,
                message_limit=message_limit,
                token_usage=token_usage,
                on_resolve=lp.resolve_message_limit_pause,
            )
        )

    def on_child_spawned(self, record: Any, manager: ChildManager) -> None:  # noqa: ANN401
        """Notify TUI about a child agent spawning via dispatch_ui."""
        lp = self._loop
        lp._dispatch_ui(lp._notify_child_spawn, record)  # noqa: SLF001
        lp._dispatch_ui(lp._sync_children, manager)  # noqa: SLF001

    def on_child_created(self, record: Any, manager: ChildManager, todo: Any) -> None:  # noqa: ANN401
        """Sync children, update todo state, and persist after child creation."""
        lp = self._loop
        lp._sync_children(manager)  # noqa: SLF001
        lp._state.todo_state = todo.model_dump(mode="json")  # noqa: SLF001
        lp._persist_state_debounced()  # noqa: SLF001

    def on_child_running(self, record: Any, manager: ChildManager) -> None:  # noqa: ANN401
        """Set live activity to thinking state when child begins running."""
        lp = self._loop
        lp._app._run_timer.start_segment()  # noqa: SLF001
        lp._set_live_activity(  # noqa: SLF001
            record.canonical_name,
            record.persona,
            activity_icon="ANIMATED_THINKING",
            activity_text="Thinking...",
            activity_phase="thinking",
        )
        lp._push_activity_event(  # noqa: SLF001
            record.canonical_name,
            "ANIMATED_THINKING",
            "Thinking...",
            "thinking",
        )
        lp._sync_children(manager)  # noqa: SLF001
        lp._persist_state_debounced()  # noqa: SLF001

    def on_child_terminal(self, record: Any, manager: ChildManager) -> None:  # noqa: ANN401
        """Sync and persist a child after its terminal state is committed."""
        del record
        lp = self._loop
        lp._dispatch_ui(lp._sync_children, manager)  # noqa: SLF001
        lp._dispatch_ui(lp._persist_state_debounced)  # noqa: SLF001

    def on_todo_state(self, todo: Any) -> None:  # noqa: ANN401
        """Dispatch updated todo state to the agent display."""
        lp = self._loop
        lp._dispatch_ui(lp._update_agent_todo, todo)  # noqa: SLF001

    def extra_runtime_kwargs(self) -> dict[str, Any]:
        """Return MCP failure and issue callbacks for the child runtime."""
        lp = self._loop

        def _mcp_failure_callback(warning_message: str) -> None:
            lp._dispatch_ui(  # noqa: SLF001
                lambda msg=warning_message: lp._app.notify(  # noqa: SLF001
                    msg,
                    severity="warning",
                    timeout=8.0,
                ),
            )

        def _mcp_issue_callback(warning_message: str) -> None:
            lp.scheduler.diagnostics.issue(
                kind="mcp_config",
                severity="warning",
                actor="orchestrator",
                message=warning_message,
            )

        return {
            "mcp_failure_callback": _mcp_failure_callback,
            "mcp_issue_callback": _mcp_issue_callback,
        }

    def bind_scheduler_callbacks(self, manager: ChildManager) -> None:
        """Wire iteration lifecycle callbacks into the scheduler."""
        lp = self._loop
        lp.scheduler._conversation_event_callback = lambda event_record, event: lp._dispatch_ui(  # noqa: SLF001
            lp._apply_conversation_event,  # noqa: SLF001
            event_record.canonical_name,
            event_record.persona,
            manager,
            event,
        )
        lp.scheduler._conversation_token_callback = lambda token_record, chunk: (  # type: ignore[assignment]  # scheduler attribute accepts broader callable type  # noqa: SLF001
            lp._app.safe_call_from_thread(  # noqa: SLF001
                lp._apply_token_event,  # noqa: SLF001
                token_record.canonical_name,
                token_record.persona,
                chunk,
            )
        )
        lp.scheduler._spawn_notification_callback = lambda spawned_record: lp._sync_children(  # noqa: SLF001
            manager,
        )

        def _apply_stall_event(
            canonical: str,
            persona_name: str,
            elapsed: float,
            phase: str,
        ) -> None:
            if phase == "stalled":
                text = f"Waiting on LLM ({int(elapsed)}s)…"
                icon = "[!]"
                activity_phase = "stalled"
            else:
                text = "Thinking..."
                icon = "ANIMATED_THINKING"
                activity_phase = "thinking"
            lp._set_live_activity(  # noqa: SLF001
                canonical,
                persona_name,
                activity_icon=icon,
                activity_text=text,
                activity_phase=activity_phase,
            )
            # Surface the stall (or recovery) on the in-chat streaming line so
            # the user sees an updating elapsed counter even when no reasoning
            # chunks are arriving.
            stream = lp._app._live_stream_messages.get(canonical)  # noqa: SLF001
            if stream is None:
                stream = lp._app._live_stream_messages.setdefault(  # noqa: SLF001
                    canonical,
                    {
                        "persona": persona_name,
                        "content": "",
                        "reasoning": "",
                        "phase": "thinking",
                        "thinking_started_at": time.monotonic() - max(0.0, elapsed),
                        "stalled": phase == "stalled",
                    },
                )
            else:
                stream["stalled"] = phase == "stalled"
                if not stream.get("thinking_started_at"):
                    stream["thinking_started_at"] = time.monotonic() - max(0.0, elapsed)
            lp._sync_children(manager)  # noqa: SLF001
            lp._app.request_widget_refresh()  # noqa: SLF001

        lp.scheduler._stall_callback = lambda stall_record, elapsed, phase: lp._dispatch_ui(  # noqa: SLF001
            _apply_stall_event,
            stall_record.canonical_name,
            stall_record.persona,
            elapsed,
            phase,
        )

    def unbind_scheduler_callbacks(self) -> None:
        """Clear the summarizing callback from the scheduler."""

    def on_last_prompt_tokens(self, record: Any, tokens: int) -> None:  # noqa: ANN401
        """Update the cached context token count in the TUI render state."""
        lp = self._loop

        def update_cached_context_tokens(value: int) -> None:
            lp._app._render_state.last_context_tokens = value  # noqa: SLF001
            lp._app._refresh_widgets()  # noqa: SLF001

        lp._dispatch_ui(update_cached_context_tokens, int(tokens))  # noqa: SLF001

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        """Record global token usage from the tracker into session state."""
        lp = self._loop
        from rotaris_core.tracking.tracker import GlobalTracker  # noqa: PLC0415

        aggregate = GlobalTracker().get_global_tokens()
        if aggregate.total_tokens > 0:
            lp._state.token_usage = aggregate.model_dump(mode="json")  # noqa: SLF001
        elif usage is not None and lp._state.token_usage is None:  # noqa: SLF001
            lp._state.token_usage = usage  # noqa: SLF001

    def on_iteration_end(  # noqa: ANN401
        self,
        record: Any,  # noqa: ANN401
        report: Any,  # noqa: ANN401
        manager: ChildManager,
        todo: Any,  # noqa: ANN401
        outcome: RalphIterationOutcome,
    ) -> None:
        """Update live activity, sync children, store report, and persist state."""
        lp = self._loop
        if outcome == RalphIterationOutcome.COMPLETED:
            icon, text, phase = "", "Completed", "completed"
        elif outcome == RalphIterationOutcome.ABANDONED:
            icon, text, phase = "✗", report.summary, "failed"
        else:
            icon, text, phase = "", "Continuing next iteration", "pending"
        lp._set_live_activity(  # noqa: SLF001
            record.canonical_name,
            record.persona,
            activity_icon=icon,
            activity_text=text,
            activity_phase=phase,
        )
        lp._push_activity_event(record.canonical_name, icon, text, phase)  # noqa: SLF001
        lp._sync_children(manager)  # noqa: SLF001
        lp._state.todo_state = todo.model_dump(mode="json")  # noqa: SLF001
        lp._state.report_artifacts.append(report.model_dump(mode="json"))  # noqa: SLF001
        lp._store_report(report.agent_name, report.final_response or report.summary)  # noqa: SLF001
        lp._persist_state_now()  # noqa: SLF001
