"""Textual TUI application facade for Rotaris.

Provides :class:`RotarisTuiApp`, the main Textual :class:`App` subclass that wires
together all screens, widgets, navigation, model management, and the run
controller.  Kept thin per the architecture discipline — behaviour lives in
helper modules under ``tui/``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from collections import deque
from typing import TYPE_CHECKING, Any, ClassVar, cast

from textual import work
from textual.app import App
from textual.binding import Binding
from textual.reactive import reactive

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.app_artifacts import (
    current_artifact_store,
    enter_artifact_inspector,
    exit_artifact_inspector,
    exit_artifact_inspector_now,
    focus_artifact,
    focus_artifact_action,
    focused_child_state,
    save_artifact,
    visible_artifact_records,
)
from rotaris_core.tui.app_models import (
    active_model_config,
    apply_runtime_model_selection,
    configured_starting_model_key,
    persist_session_model_state,
    refresh_composer_meta,
    reset_active_model_to_config,
    resolve_runtime_model_base_url,
    restore_session_model_state,
    sync_session_model_state,
    update_composer_model,
)
from rotaris_core.tui.app_navigation import (
    focus_child,
    focus_next_sibling,
    focus_parent,
    focus_prev_sibling,
    focus_sibling,
    get_agent_tree,
    input_has_focus,
    merge_activity_into_child,
    merge_live_agent_activity,
    sync_parent_activity_from_manager,
)
from rotaris_core.tui.app_run import TuiRunController
from rotaris_core.tui.app_runtime import (
    find_open_tool_event,
    flush_scheduled_widget_refresh,
    persist_ui_edit_diff,
    placeholder_stream_agents,
    render_chat_event,
    render_live_stream_message,
    request_widget_refresh,
    tool_event_key,
    tool_event_label,
    upsert_tool_transcript_event,
)
from rotaris_core.tui.app_settings import (
    dev_options_state,
    persist_compressor_config,
    persist_config_sections,
    persist_display_config,
    read_scope_runtime_config,
    reload_config_after_settings_save,
    scope_runtime_memory_setting,
    show_compression_settings,
    show_dev_options,
    show_mcp_secrets,
    show_mcp_servers,
    show_provider_settings,
    show_tool_result_settings,
    toggle_memory_diagnostics_scope,
)
from rotaris_core.tui.messages import (
    ForceCompress,
    LogoutMessage,
    NewSession,
    PauseRun,
    PopInput,
    RunCompleted,
    SendToBackground,
    SetTheme,
    StashInput,
    StopRun,
    ToggleReasoning,
    ToggleToolEvents,
)
from rotaris_core.tui.screens.modals import (
    MessageLimitConfirmScreen,
    QuotaWaitScreen,
    ShortcutHelpScreen,
)
from rotaris_core.tui.shortcuts import format_leader_chord, leader_binding_key, leader_help_lines

__all__ = [
    "ForceCompress",
    "RotarisTuiApp",
    "LogoutMessage",
    "NewSession",
    "PauseRun",
    "PopInput",
    "RunCompleted",
    "SendToBackground",
    "SetTheme",
    "StashInput",
    "StopRun",
    "ToggleReasoning",
    "ToggleToolEvents",
]

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from textual.events import Key

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.artifacts import ArtifactRecord, SessionArtifactStore
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.runtime_interrupts import DoubleCtrlCHandler
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState
    from rotaris_core.tui.stash import PromptStash

_log = logging.getLogger(__name__)


def _log_suppressed_empty_stream_chunk(agent_name: str, persona: str, chunk: object) -> None:
    if not _log.isEnabledFor(logging.DEBUG):
        return

    chunk_repr = repr(chunk)
    if len(chunk_repr) > 500:
        chunk_repr = chunk_repr[:497] + "..."
    _log.debug(
        "Suppressed empty stream chunk for agent %s persona=%s type=%s chunk=%s",
        agent_name,
        persona,
        type(chunk).__name__,
        chunk_repr,
    )


@traces(
    SWR.SWR_1001,
    SWR.SWR_1006,
    SWR.SWR_1016,
    SWR.SWR_1085,
    SWR.SWR_1090,
    SWR.SWR_1305,
    SWR.SWR_1309,
    SWR.SWR_1310,
    SWR.SWR_1311,
    SWR.SWR_1312,
)
@traces(
    SWR.SWR_1183, SWR.SWR_1220, SWR.SWR_1442, SWR.SWR_1443, SWR.SWR_1444, SWR.SWR_1447, SWR.SWR_1448
)
class RotarisTuiApp(App[None]):
    """Main Textual application for Rotaris.

    Owns session lifecycle, run control, navigation, model management, and
    artifact inspection.  Delegates screen composition and rendering to helper
    modules under ``tui/``.
    """

    TITLE = "Rotaris"
    CSS_PATH = "styles/app.tcss"
    ENABLE_COMMAND_PALETTE = False
    NOTIFICATION_TIMEOUT: ClassVar[float] = 8
    QUIT_FORCE_DELAY_SECONDS: ClassVar[float] = 5.0

    def get_css_variables(self) -> dict[str, str]:
        """Return CSS variable overrides merged with the current theme."""
        from rotaris_core.tui.themes import get_theme  # noqa: PLC0415

        return {
            **super().get_css_variables(),
            **get_theme().css_variables(),
            # Layout proportions — edit here to change the 3-pane split.
            # Referenced in app.tcss as $layout-left-col, $layout-right-col, etc.
            "layout-left-col": "7fr",
            "layout-right-col": "3fr",
            "layout-right-agents-h": "3fr",
            "layout-right-info-h": "2fr",
            "layout-right-todo-h": "2fr",
        }

    BINDINGS = [
        Binding("q", "force_quit", "Force Quit", show=True),
        Binding("ctrl+down", "focus_child", "Focus Child", show=False, priority=True),
        Binding("ctrl+up", "focus_parent", "Focus Parent", show=False, priority=True),
        Binding(
            "ctrl+right",
            "focus_next_sibling",
            "Next Sibling",
            show=False,
            priority=True,
        ),
        Binding("ctrl+left", "focus_prev_sibling", "Prev Sibling", show=False, priority=True),
        Binding("alt+down", "next_artifact", "Next Artifact", show=False, priority=True),
        Binding("alt+up", "prev_artifact", "Previous Artifact", show=False, priority=True),
        Binding("alt+right", "enter_artifact", "Inspect Artifact", show=False),
        Binding("alt+left", "exit_artifact", "Exit Artifact", show=False),
    ]

    current_session: reactive[SessionState | None] = reactive(None)
    _show_tool_events_fallback: bool = False

    @property
    def show_tool_events(self) -> bool:
        """Whether tool call results are shown in the transcript.

        Reads from the persisted ``config.display.show_tool_results`` field.
        Falls back to the session-only instance attribute when no config is loaded.
        """
        if self.config is not None:
            return self.config.display.show_tool_results
        return self._show_tool_events_fallback

    @show_tool_events.setter
    def show_tool_events(self, value: bool) -> None:
        if self.config is not None:
            self.config.display.show_tool_results = value
        else:
            self._show_tool_events_fallback = value

    _show_tool_inputs_fallback: bool = True

    @property
    def show_tool_inputs(self) -> bool:
        """Whether tool call inputs (commands/arguments) are shown in the transcript.

        Reads from the persisted ``config.display.show_tool_inputs`` field.
        Falls back to the session-only instance attribute when no config is loaded.
        """
        if self.config is not None:
            return self.config.display.show_tool_inputs
        return self._show_tool_inputs_fallback

    @show_tool_inputs.setter
    def show_tool_inputs(self, value: bool) -> None:
        if self.config is not None:
            self.config.display.show_tool_inputs = value
        else:
            self._show_tool_inputs_fallback = value

    # Default: reasoning visible. Click on the chat panel or press 'r' to
    # toggle the collapsed/expanded state. Showing reasoning live during
    # streaming surfaces what slow reasoning models (e.g. GPT-5) are
    # actually doing instead of leaving the user staring at a frozen
    # "Thinking…" badge for several minutes.
    show_reasoning: reactive[bool] = reactive(False)
    focused_agent_id: reactive[str | None] = reactive(None)
    focused_artifact_id: reactive[str | None] = reactive(None)
    artifact_inspect_mode: reactive[bool] = reactive(False)

    def __init__(
        self,
        session_manager: SessionManager | None = None,
        config: RotarisConfig | None = None,
        interrupt_handler: DoubleCtrlCHandler | None = None,
        startup_model_errors: bool = False,  # noqa: FBT001, FBT002
        show_onboarding_review: bool = False,  # noqa: FBT001, FBT002
        **kwargs: Any,  # noqa: ANN401
    ) -> None:
        """Initialize the Rotaris application.

        Args:
            session_manager: Optional session manager for persistence.
            config: Optional :class:`RotarisConfig` loaded from the workspace.
            interrupt_handler: Optional double-Ctrl+C interrupt handler.
            startup_model_errors: Show model error recovery on mount.
            show_onboarding_review: Show onboarding review before main screen.
            **kwargs: Forwarded to :class:`App`.
        """
        super().__init__(**kwargs)
        from rotaris_core.tui.render_state import RenderState  # noqa: PLC0415
        from rotaris_core.tui.run_timer import RunTimer  # noqa: PLC0415

        self._render_state = RenderState()
        self._run_timer = RunTimer()
        self.session_manager = session_manager
        self.config = config
        self.interrupt_handler = interrupt_handler
        self._startup_model_errors = startup_model_errors
        self._show_onboarding_review = show_onboarding_review
        self._run_task: asyncio.Task[Any] | None = None
        self._active_ralph_loop: RalphLoop | None = None
        self._live_agent_activity: dict[str, dict[str, Any]] = {}
        self._live_stream_messages: dict[str, dict[str, Any]] = {}
        self._open_tool_events: dict[tuple[str, str], dict[str, Any]] = {}
        self._recent_activity_events: deque[dict[str, Any]] = deque(maxlen=12)
        self._min_widget_refresh_interval = 0.120
        self._ctrl_c_count = 0
        self._pending_exit_after_run = False
        self._shutdown_force_deadline: float | None = None
        self._shutdown_countdown_seconds: int | None = None
        self._force_exit: Callable[[int], None] = os._exit
        self._quota_wait_prompt_visible = False
        self._message_limit_prompt_visible = False
        self._provider_settings_prompt_visible = False
        self._prompt_stash: PromptStash | None = None
        self.active_model_key: str | None = None
        self._runtime_model_configs: dict[str, Any] = {}
        self._artifact_store_cache_session_id: str | None = None
        self._artifact_store_cache: SessionArtifactStore | None = None
        self._artifact_save_tasks: set[asyncio.Task[None]] = set()
        self._leader_pending_until: float | None = None
        self._pending_clear_confirmation_until: float | None = None
        # Cached character count of the rendered system prompt for the default persona.
        # Computed once at init so every token estimate includes static context overhead.
        self._system_prompt_chars: int = 0
        if config is not None:
            persona_cfg = config.personas.get(config.default_persona)
            if persona_cfg is not None:
                self.active_model_key = self._configured_starting_model_key()
                from rotaris_core.agents.factory import (  # noqa: PLC0415
                    _inject_model_family_variant,
                    _render_prompt,
                    load_system_prompt,
                )

                prompt = load_system_prompt(persona_cfg)
                prompt = _inject_model_family_variant(prompt, persona_cfg, persona_cfg.model)
                prompt = _render_prompt(prompt, persona_cfg, config)
                self._system_prompt_chars = len(prompt)

    def _configured_starting_model_key(self) -> str | None:
        return configured_starting_model_key(self)

    def safe_call_from_thread(self, callback: Callable[..., None], *args: Any) -> bool:  # noqa: ANN401
        """Thread-safe helper that invokes *callback* on the Textual event loop.

        Returns ``True`` if the call was dispatched or executed, ``False`` if
        the loop is closed or the app is not running.
        """
        if threading.current_thread() is threading.main_thread():
            callback(*args)
            return True

        loop = getattr(self, "_loop", None)
        if loop is None or loop.is_closed():
            return False

        try:
            self.call_from_thread(callback, *args)
        except RuntimeError as exc:
            if str(exc) != "App is not running":
                raise
            return False
        return True

    def _reset_active_model_to_config(self) -> None:
        reset_active_model_to_config(self)

    def _active_model_config(self) -> Any | None:  # noqa: ANN401
        return active_model_config(self)

    def _restore_session_model_state(self) -> None:
        restore_session_model_state(self, _log)

    def _sync_session_model_state(self) -> None:
        sync_session_model_state(self)

    def _persist_session_model_state(self) -> None:
        persist_session_model_state(self, _log)

    @traces(SWR.SWR_833)
    def on_mount(self) -> None:
        """Push the main screen and start background health / animation ticks."""
        from rotaris_core.tui.screens.main import MainScreen  # noqa: PLC0415

        if self._show_onboarding_review:
            # Push onboarding review first — user sees this before anything else.
            self.action_show_startup_models(onboarding=True, push_before_main=True)
        elif self._startup_model_errors:
            # Existing behavior: push MainScreen then modal for error recovery.
            self.push_screen(MainScreen())
            self.action_show_startup_models()
        else:
            # Normal path: just MainScreen.
            self.push_screen(MainScreen())

        self._notify_leader_warning()
        self._check_provider_health()
        self.set_interval(0.25, self._tick_live_animation)
        self.set_interval(0.25, self._tick_shutdown_countdown)
        self.set_interval(0.1, self._tick_leader_pending)

    def _notify_leader_warning(self) -> None:
        if self.config is None:
            return
        warning = self.config.tui.keyboard.leader_warning
        if warning:
            self.notify(warning, severity="warning", timeout=6)

    def leader_key(self) -> str:
        """Return the configured leader key (default ``Ctrl+X``)."""
        if self.config is None:
            return "Ctrl+X"
        return self.config.tui.keyboard.leader

    def leader_binding(self) -> str:
        """Return the leader key in Textual binding format."""
        return leader_binding_key(self.leader_key())

    def format_leader_chord(self, key: str) -> str:
        """Format *key* as a leader chord string for display."""
        return format_leader_chord(self.leader_key(), key)

    def leader_pending(self) -> bool:
        """Return ``True`` while the leader key has been pressed and a chord is expected."""
        return self._leader_pending_until is not None

    def _tick_leader_pending(self) -> None:
        if self._leader_pending_until is None:
            return
        if time.monotonic() >= self._leader_pending_until:
            self._clear_leader_pending()

    def _set_leader_pending(self) -> None:
        self._leader_pending_until = time.monotonic() + 5.0
        self._refresh_composer_meta()
        # Blur the currently focused widget so character keys bubble up
        # to App.on_key instead of being consumed by Input/TextArea.
        if self.focused is not None:
            self.focused.blur()

    def _clear_leader_pending(self) -> None:
        if self._leader_pending_until is None:
            return
        self._leader_pending_until = None
        self._refresh_composer_meta()
        # Restore focus to the composer input
        try:
            from rotaris_core.tui.widgets.input_composer import InputComposer  # noqa: PLC0415

            composer = self.screen.query_one(InputComposer)
            composer.input_widget.focus()
        except Exception:
            pass

    def on_key(self, event: Key) -> None:
        """Handle key events: leader chords, escape from artifact inspector."""
        # If leader is already pending, dispatch the mnemonic key
        if self._leader_pending_until is not None:
            event.prevent_default()
            event.stop()
            if event.key in ("escape", "ctrl+c"):
                self._clear_leader_pending()
                return
            key_char = (event.character or "").lower()
            self._clear_leader_pending()
            self._dispatch_leader_command(key_name=event.key.lower(), key_char=key_char)
            return

        # Check if the leader key itself was pressed
        if event.key.lower() != self.leader_binding():
            if event.key == "escape" and self.artifact_inspect_mode:
                from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor  # noqa: PLC0415

                if self.screen.query(ArtifactEditor):
                    event.prevent_default()
                    event.stop()
                    self.exit_artifact_inspector(require_confirm=True)
            return
        event.prevent_default()
        event.stop()
        self._set_leader_pending()

    def _dispatch_leader_command(self, *, key_name: str, key_char: str) -> bool:  # noqa: C901
        command_key = key_char or key_name
        # Support Ctrl+<key> after the leader chord (e.g. Ctrl+X then Ctrl+S)
        if key_name.startswith("ctrl+") and len(key_name) == 6:
            command_key = key_name[5:]
        if command_key == "question_mark":
            command_key = "?"
        if command_key == "p":
            self.action_command_palette()
            return True
        if command_key == "m":
            self.action_show_runtime_models()
            return True
        if command_key == "q":
            self.request_quit(source=self.format_leader_chord("q"))
            return True
        if command_key == "s":
            self.action_leader_save_or_stash()
            return True
        if command_key == "r":
            self.action_toggle_reasoning()
            return True
        if command_key == "e":
            self.action_toggle_multiline_composer()
            return True
        if command_key == "?":
            self.action_show_shortcut_help()
            return True
        if command_key == "/":
            self.action_transcript_search()
            return True
        return False

    @work(exclusive=True, thread=False)
    async def _check_provider_health(self) -> None:
        if self.config is None:
            return
        from rotaris_core.auth.provider_settings import (  # noqa: PLC0415
            check_configured_provider_health,
        )

        issues = await check_configured_provider_health(self.config)
        if not issues:
            return
        first = issues[0]
        self.notify(first.message, severity="warning", timeout=12)
        if first.can_edit_api_key and not self._provider_settings_prompt_visible:
            self._provider_settings_prompt_visible = True
            self.action_show_provider_settings(first.provider_id)

    def _tick_live_animation(self) -> None:
        if self.current_session is None or self.current_session.execution_status != "running":
            return
        if (
            self._live_stream_messages
            or self._run_timer.is_active()
            or (self.show_tool_events and self.focused_agent_id is not None)
            or self.focused_agent_id is not None
        ):
            self.request_widget_refresh()

    def _tick_shutdown_countdown(self) -> None:
        if self._shutdown_force_deadline is None:
            return
        if not self._run_is_active():
            self._complete_pending_exit_after_run()
            return

        remaining = max(0, int(self._shutdown_force_deadline - time.monotonic() + 0.999))
        if remaining != self._shutdown_countdown_seconds:
            self._shutdown_countdown_seconds = remaining
            self._apply_shutdown_activity(
                f"Stopping... force quit in {remaining}s" if remaining > 0 else "Force quitting...",
            )

        if time.monotonic() >= self._shutdown_force_deadline:
            self._record_shutdown_message("Graceful shutdown timed out. Force quitting now.")
            self._force_quit_now()

    def _run_is_active(self) -> bool:
        return self._run_task is not None and not self._run_task.done()

    def run_is_active(self) -> bool:
        """Return ``True`` while an agent run is in progress."""
        return self._run_is_active()

    def start_run(self, task_text: str) -> None:
        """Start a new agent run with the given *task_text*."""
        self._start_run(task_text)

    def _clear_shutdown_state(self) -> None:
        self._pending_exit_after_run = False
        self._shutdown_force_deadline = None
        self._shutdown_countdown_seconds = None
        self._ctrl_c_count = 0

    def _complete_pending_exit_after_run(self) -> None:
        if not self._pending_exit_after_run or self._run_is_active():
            return
        if self.session_manager is not None:
            self.session_manager.shutdown_mcp()
        self._clear_shutdown_state()
        self.exit()

    def _record_shutdown_message(self, text: str) -> None:
        if self.current_session is None:
            return
        if self.current_session.transcript_events:
            last_event = self.current_session.transcript_events[-1]
            if last_event.get("role") == "system" and last_event.get("content") == text:
                return
        self.current_session.transcript_events.append({"role": "system", "content": text})
        if self.session_manager is not None:
            try:
                # Shutdown is in progress — a debounced save may never fire.
                self.session_manager.persister.flush_sync(self.current_session)
            except Exception:  # noqa: BLE001
                _log.exception("Failed to persist shutdown status message")
        self.request_widget_refresh()

    def _apply_shutdown_activity(self, text: str) -> None:
        agent_names: list[str] = []
        if self.current_session is not None:
            for child in self.current_session.child_states:
                canonical_name = str(child.get("canonical_name") or child.get("name") or "").strip()
                if canonical_name:
                    agent_names.append(canonical_name)
                    self._live_agent_activity[canonical_name] = {
                        **self._live_agent_activity.get(canonical_name, {}),
                        "persona": str(child.get("persona") or "agent"),
                        "activity_icon": "!",
                        "activity_text": text,
                        "activity_phase": "stopping",
                    }
        if not agent_names and self._live_agent_activity:
            for canonical_name, activity in list(self._live_agent_activity.items()):
                self._live_agent_activity[canonical_name] = {
                    **activity,
                    "activity_icon": "!",
                    "activity_text": text,
                    "activity_phase": "stopping",
                }
        self.request_widget_refresh()

    def _force_quit_now(self) -> None:
        if self.session_manager is not None:
            self.session_manager.shutdown_mcp()
        self.request_interrupt_stop(force=True)
        self._apply_shutdown_activity("Force quitting...")
        self._force_exit(130)

    def _handle_quit_request(self, *, source: str) -> None:
        if not self._run_is_active():
            self._clear_shutdown_state()
            self.exit()
            return

        if self._shutdown_force_deadline is not None:
            self._record_shutdown_message(f"{source} requested immediate force quit.")
            self._force_quit_now()
            return

        self._pending_exit_after_run = True
        # Use a shorter initial force-deadline so the UI responds quickly.
        self._shutdown_force_deadline = time.monotonic() + 2.0
        self._shutdown_countdown_seconds = None
        self.request_interrupt_stop(force=False)
        self._record_shutdown_message(
            f"{source} requested shutdown. Waiting for active agents to stop before exit. "
            f"The app will force quit in 2s if still blocked.",
        )
        self._apply_shutdown_activity("Stopping... force quit in 2s")
        self.notify(
            ("Stopping agents... force quit in 2s if still blocked."),
            title="Quit requested",
            severity="warning",
            timeout=4,
        )

    async def action_quit(self) -> None:
        """Request application quit via leader chord."""
        self.request_quit(source=self.format_leader_chord("q"))

    def action_force_quit(self) -> None:
        """Immediate force quit — no grace period. Used by single-press 'q'."""
        self._force_quit_now()

    def watch_current_session(self, current_session: SessionState | None) -> None:
        """React to session changes: reset render state, hydrate tracker, clear caches."""
        from rotaris_core.tracking.tracker import GlobalTracker  # noqa: PLC0415

        tracker = GlobalTracker()
        if current_session is None:
            tracker.reset()
        else:
            from rotaris_core.session.metrics import hydrate_tracker_from_session  # noqa: PLC0415
            from rotaris_core.session.state import SessionState as _SessionState  # noqa: PLC0415

            if isinstance(current_session, _SessionState):
                hydrate_tracker_from_session(current_session, tracker)
            else:
                tracker.reset()
        if current_session is None or current_session.execution_status != "running":
            self._live_stream_messages.clear()
            self._open_tool_events.clear()
            self._render_state.reset_live()
        if current_session is None:
            self._artifact_store_cache_session_id = None
            self._artifact_store_cache = None
            self.focused_artifact_id = None
            self.artifact_inspect_mode = False
        del current_session
        self._render_state.reset()
        self._refresh_widgets()

    def watch_focused_agent_id(self, focused_agent_id: str | None) -> None:
        """React to focused agent changes: reset related render state."""
        del focused_agent_id
        self.focused_artifact_id = None
        self._render_state.last_context_tokens = 0
        self._render_state.chat_needs_full_rebuild = True
        self._render_state.last_chat_event_count = 0
        self._refresh_widgets()

    def watch_focused_artifact_id(self, focused_artifact_id: str | None) -> None:
        """React to focused artifact changes: refresh widgets."""
        del focused_artifact_id
        self._refresh_widgets()

    def _tool_event_key(self, event: object) -> str | None:
        return tool_event_key(event)

    def _tool_event_label(self, event: object) -> str:
        return tool_event_label(event)

    def _find_open_tool_event(
        self,
        transcript_events: list[dict[str, Any]],
        agent_name: str,
        tool_key: str | None,
        tool_label: str,
    ) -> dict[str, Any] | None:
        return find_open_tool_event(self, transcript_events, agent_name, tool_key, tool_label)

    def _upsert_tool_transcript_event(
        self,
        transcript_events: list[dict[str, Any]],
        agent_name: str,
        event: object,
        update: dict[str, str],
    ) -> dict[str, Any]:
        return upsert_tool_transcript_event(self, transcript_events, agent_name, event, update)

    def _persist_ui_edit_diff(
        self,
        session: SessionState,
        *,
        agent_name: str,
        tool_entry: dict[str, Any] | None,
        event: object,
    ) -> None:
        persist_ui_edit_diff(
            self,
            session,
            agent_name=agent_name,
            tool_entry=tool_entry,
            event=event,
            logger=_log,
        )

    def request_widget_refresh(self) -> None:
        """Schedule a widget refresh for the next frame."""
        request_widget_refresh(self)

    def _flush_scheduled_widget_refresh(self) -> None:
        flush_scheduled_widget_refresh(self)

    def _placeholder_stream_agents(self, transcript_events: list[dict[str, Any]]) -> set[str]:
        return placeholder_stream_agents(self, transcript_events)

    def _render_live_stream_message(
        self,
        chat_panel: Any,  # noqa: ANN401
        stream: dict[str, Any],
        hide_header: bool = False,  # noqa: FBT001, FBT002
    ) -> None:
        render_live_stream_message(self, chat_panel, stream, hide_header=hide_header)

    def _render_chat_event(
        self,
        chat_panel: Any,  # noqa: ANN401
        event: dict[str, Any],
        placeholder_stream_agents: set[str] | None = None,
        hide_header: bool = False,  # noqa: FBT001, FBT002
    ) -> None:
        render_chat_event(
            self,
            chat_panel,
            event,
            placeholder_agents=placeholder_stream_agents,
            hide_header=hide_header,
        )

    def _refresh_widgets(self) -> None:
        from rotaris_core.tui.screen_refresh import refresh_widgets  # noqa: PLC0415

        refresh_widgets(self)

    @work
    async def action_show_session_picker(self) -> None:
        """Open the session picker screen to load a previous session."""
        if not self.session_manager:
            self.notify(
                "No session manager available. Start with a config file.",
                severity="warning",
            )
            return

        def select_session(session_id: str | None) -> None:
            if session_id and self.session_manager:
                try:
                    self.current_session = self.session_manager.load_session(
                        session_id,
                    )
                except FileNotFoundError:
                    self.notify(
                        f"Session [b]{session_id}[/b] not found.",
                        severity="error",
                    )
                except ValueError as exc:
                    self.notify(
                        f"Corrupt session snapshot: {exc}",
                        severity="error",
                    )
                except Exception as exc:  # noqa: BLE001
                    _log.exception("Failed to load session %s", session_id)
                    self.notify(
                        f"Unable to load session: {exc}",
                        severity="error",
                    )
                else:
                    self._restore_session_model_state()
                    self._update_composer_model()
                    if self.current_session.execution_status == "paused_message_limit":
                        self._show_reattached_message_limit_prompt()
                    self.notify(f"Loaded session [b]{session_id}[/b]")

        from rotaris_core.tui.screens.session_picker import SessionPickerScreen  # noqa: PLC0415

        self.push_screen(SessionPickerScreen(self.session_manager), select_session)

    def action_show_mcp_servers(self) -> None:
        """Open the MCP servers management screen."""
        show_mcp_servers(self)

    def action_show_mcp_secrets(self) -> None:
        """Open the MCP secrets management screen."""
        show_mcp_secrets(self)

    def action_show_improvement_proposals(self) -> None:
        """Open the most-recent improvement artifact for the current session.

        REQ-20260515-POSTRUN-IMPROVE-T008. Surfaces a no-op notification when
        there is no active session or no artifact has been produced yet.
        """
        from rotaris_core.improvement.persistence import (  # noqa: PLC0415
            list_improvement_artifact_ids,
            load_improvement_artifact,
        )
        from rotaris_core.tui.screens.improvement_proposals import (  # noqa: PLC0415
            ImprovementProposalsScreen,
        )

        if self.session_manager is None or self.current_session is None:
            self.notify(
                "No active session — start a run first.",
                severity="warning",
            )
            return
        workspace_root = self.session_manager.workspace_root
        try:
            artifact_ids = list_improvement_artifact_ids(workspace_root)
        except OSError as exc:
            self.notify(
                f"Could not list improvement artifacts: {exc}",
                severity="error",
            )
            return
        if not artifact_ids:
            self.notify(
                "No improvement artifacts yet — finish a task run first.",
                severity="information",
            )
            return
        try:
            artifact = load_improvement_artifact(workspace_root, artifact_ids[-1])
        except (OSError, ValueError) as exc:
            self.notify(
                f"Could not load improvement artifact: {exc}",
                severity="error",
            )
            return
        self.push_screen(
            ImprovementProposalsScreen(artifact, workspace_root),
        )

    def action_show_startup_models(
        self,
        onboarding: bool = False,  # noqa: FBT001, FBT002
        push_before_main: bool = False,  # noqa: FBT001, FBT002
    ) -> None:
        """Open the startup model configuration screen."""
        if self.config is None:
            self.notify("No config available.", severity="warning")
            return

        from rotaris_core.config.loader import load_config  # noqa: PLC0415
        from rotaris_core.tui.screens.startup_models import (  # noqa: PLC0415
            StartupModelsResult,
            StartupModelsScreen,
        )

        current_config = self.config

        def on_close(result: StartupModelsResult | None) -> None:
            if result is None or not result.saved:
                if push_before_main:
                    from rotaris_core.tui.screens.main import MainScreen  # noqa: PLC0415

                    self.push_screen(MainScreen())
                return

            try:
                self.config = load_config(current_config.workspace_root)
            except Exception as exc:  # noqa: BLE001
                _log.exception("Failed to reload config after startup model save")
                self.notify(f"Saved settings but failed to reload config: {exc}", severity="error")
                return

            persona_cfg = self.config.personas.get(self.config.default_persona)
            if persona_cfg is not None:
                self._runtime_model_configs.clear()
                self.active_model_key = persona_cfg.model
            self._update_composer_model()
            self._refresh_widgets()

            if result.path is not None:
                self.notify(f"Saved startup models to {result.path}")
            else:
                self.notify("Saved startup models")

            if push_before_main:
                from rotaris_core.tui.screens.main import MainScreen  # noqa: PLC0415

                self.push_screen(MainScreen())

        self.push_screen(StartupModelsScreen(self.config, onboarding_review=onboarding), on_close)

    def action_show_runtime_models(self) -> None:
        """Open the runtime model picker screen."""
        if self.config is None:
            self.notify("No config available.", severity="warning")
            return

        from rotaris_core.tui.screens.runtime_models import (  # noqa: PLC0415
            RuntimeModelResult,
            RuntimeModelsScreen,
        )

        def on_close(result: RuntimeModelResult | None) -> None:
            self._apply_runtime_model_selection(result)

        self.push_screen(RuntimeModelsScreen(self.config), on_close)

    def action_show_provider_settings(self, provider_id: str | None = None) -> None:
        """Open the provider settings screen, optionally scoped to *provider_id*."""
        show_provider_settings(self, provider_id)

    def _show_quota_wait_model_picker(self, actor: str) -> None:
        if self.config is None:
            self.notify("No config available.", severity="warning")
            return

        from rotaris_core.tui.screens.runtime_models import (  # noqa: PLC0415
            RuntimeModelResult,
            RuntimeModelsScreen,
        )

        def on_close(result: RuntimeModelResult | None) -> None:
            if result is None:
                return
            self._apply_runtime_model_selection(result)
            scheduler = getattr(self._active_ralph_loop, "scheduler", None)
            if scheduler is None:
                return
            model_key = result.selection.qualified_model_id
            if (
                scheduler.resolve_quota_wait(
                    actor,
                    action="change_model",
                    model_override=model_key,
                )
                and self.current_session is not None
            ):
                self.current_session.execution_status = "running"
                self.current_session.wait_state = None
                if self.session_manager is not None:
                    try:
                        self.session_manager.persister.request_save(self.current_session)
                    except Exception:  # noqa: BLE001
                        _log.exception("Failed to persist resumed session after model change")

        self.push_screen(RuntimeModelsScreen(self.config), on_close)

    def _apply_runtime_model_selection(self, result: object | None) -> None:
        apply_runtime_model_selection(self, result, _log)

    def _resolve_runtime_model_base_url(self, provider_id: str) -> str | None:
        return resolve_runtime_model_base_url(provider_id)

    def action_show_tool_result_settings(self) -> None:
        """Open the tool result display settings screen."""
        show_tool_result_settings(self, _log)

    def action_show_compression_settings(self) -> None:
        """Open the context compression settings screen."""
        show_compression_settings(self, _log)

    def action_show_dev_options(self) -> None:
        """Open the developer options screen."""
        show_dev_options(self)

    def action_toggle_multiline_composer(self) -> None:
        """Toggle the composer between single-line and multi-line mode."""
        from textual.css.query import NoMatches  # noqa: PLC0415

        from rotaris_core.tui.widgets.input_composer import InputComposer  # noqa: PLC0415

        try:
            composer = self.screen.query_one(InputComposer)
        except (NoMatches, Exception):
            return
        composer.action_toggle_multiline()

    def action_leader_save_or_stash(self) -> None:
        """Save the active surface or stash the current input."""
        if self._save_active_surface():
            return
        self.action_stash_input()

    def _save_active_surface(self) -> bool:
        from textual.css.query import NoMatches  # noqa: PLC0415

        from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor  # noqa: PLC0415

        if hasattr(self.screen, "action_save_settings"):
            cast("Any", self.screen).action_save_settings()
            return True
        if hasattr(self.screen, "action_save"):
            cast("Any", self.screen).action_save()
            return True
        try:
            editor = self.screen.query_one(ArtifactEditor)
        except (NoMatches, Exception):
            return False
        editor.action_save_artifact()
        return True

    def request_quit(self, *, source: str) -> None:
        """Request application quit, passing through to the shutdown handler."""
        self._handle_quit_request(source=source)

    def action_show_shortcut_help(self) -> None:
        """Show a help screen listing leader chords and slash commands."""
        from rotaris_core.tui.widgets.slash_commands import (  # noqa: PLC0415
            create_builtin_registry,
        )

        registry = create_builtin_registry()
        slash_lines = [f"/{cmd.name}  {cmd.description}" for cmd in registry.list_commands()]
        body = "\n".join(
            [
                f"Leader: {self.leader_key()}",
                "",
                "Leader chords",
                *leader_help_lines(self.leader_key()),
                "",
                "Slash commands",
                *slash_lines,
            ],
        )
        self.push_screen(ShortcutHelpScreen(body=body))

    def action_transcript_search(self) -> None:
        """Open the transcript search screen."""
        from rotaris_core.tui.screens.transcript_search import (
            TranscriptSearchScreen,  # noqa: PLC0415
        )

        if self.current_session is None:
            self.notify("No active session to search.", severity="warning")
            return
        if not self.current_session.transcript_events:
            self.notify("Transcript is empty — nothing to search.", severity="warning")
            return
        self.push_screen(TranscriptSearchScreen(self))

    def action_command_palette(self) -> None:
        """Open the command palette / cheatsheet screen."""
        from rotaris_core.tui.screens.command_palette_cheatsheet import (  # noqa: PLC0415
            CommandPaletteCheatsheetScreen,
        )

        self.push_screen(CommandPaletteCheatsheetScreen(self))

    @work(exclusive=True, thread=False)
    async def _start_run(self, task_text: str) -> None:
        await TuiRunController(self, _log).start(task_text)

    def request_interrupt_stop(self, *, force: bool) -> None:
        """Signal the active RalphLoop to stop, or cancel the run task."""
        if self._active_ralph_loop is not None:
            self._active_ralph_loop.request_shutdown(force=force)
        elif self._run_task is not None and not self._run_task.done():
            self._run_task.cancel()
        self._quota_wait_prompt_visible = False
        self._message_limit_prompt_visible = False
        if self.current_session is not None:
            self.current_session.execution_status = "paused"
            self.current_session.wait_state = None
            if self.session_manager is not None:
                try:
                    self.session_manager.persister.request_save(self.current_session)
                except Exception:  # noqa: BLE001
                    _log.exception("Failed to persist paused session during SIGINT")

    def try_copy_to_clipboard(self, text: str) -> bool:
        """Copy *text* to the system clipboard.

        Tries platform clipboard tools first because they give definitive
        success/failure feedback. Falls back to OSC 52 terminal escape which is
        fire-and-forget (cannot verify).

        Returns True if an external clipboard tool succeeded.
        """
        import shutil  # noqa: PLC0415
        import subprocess  # noqa: PLC0415

        self._clipboard = text

        for cmd in ("clip", "clip.exe", "xclip", "xsel", "wl-copy", "pbcopy"):
            path = shutil.which(cmd)
            if path is None:
                continue
            args: list[str] = [path]
            if cmd in {"clip", "clip.exe"}:
                pass
            elif cmd == "xclip":
                args += ["-selection", "clipboard"]
            elif cmd == "xsel":
                args += ["--clipboard", "--input"]
            try:
                subprocess.run(  # noqa: S603
                    args,
                    input=text.encode("utf-8"),
                    check=True,
                    timeout=2,
                )
            except (subprocess.SubprocessError, OSError):
                continue
            return True

        if self._driver is not None:
            import base64  # noqa: PLC0415

            b64 = base64.b64encode(text.encode("utf-8")).decode("utf-8")
            try:
                self._driver.write(f"\x1b]52;c;{b64}\a")
            except Exception:  # noqa: BLE001
                return False
            return True

        return False

    def clipboard_failure_message(self) -> str:
        """Return a human-readable message when clipboard copy fails."""
        import os  # noqa: PLC0415

        if os.name == "nt":
            return "Copy failed — Windows clipboard integration is unavailable"
        return "Copy failed — install xclip, xsel, wl-copy, or use a terminal with OSC52"

    def action_help_quit(self) -> None:
        """Override Textual's Ctrl+C handler: stop agents or quit instead of showing a hint."""
        if self.leader_pending():
            self._clear_leader_pending()
            return

        selected = self.screen.get_selected_text()
        if selected:
            ok = self.try_copy_to_clipboard(selected)
            self.screen.clear_selection()
            if ok:
                self.notify("Copied to clipboard", timeout=1.5)
            else:
                self.notify(
                    self.clipboard_failure_message(),
                    severity="warning",
                    timeout=3,
                )
            return

        self._handle_quit_request(source="Ctrl+C")

    def on_stop_run(self, message: StopRun) -> None:
        """Handle stop-run request: interrupt agents and persist paused state."""
        del message
        if self._run_task is None or self._run_task.done() or self.current_session is None:
            self.notify("No active run to stop.", severity="warning")
            return

        # Use the shared interrupt path so we (1) signal pause() to the SDK
        # conversation and (2) cancel the asyncio task. Calling ``cancel()``
        # alone leaves the to_thread worker running ``conversation.run`` with
        # no termination hint, and the subsequent ``conversation.close()`` in
        # the scheduler's ``finally`` would then block the event loop.
        self.request_interrupt_stop(force=False)
        self.current_session.execution_status = "paused"
        self.current_session.wait_state = None
        if self.session_manager:
            try:
                self.session_manager.persister.request_save(self.current_session)
            except Exception as exc:  # noqa: BLE001
                _log.exception("Failed to save session after stop")
                self.notify(
                    f"Run stopped but save failed: {exc}",
                    severity="error",
                )
                return
        self.notify("Run stopped.")

    def on_pause_run(self, message: PauseRun) -> None:
        """Handle pause-run request: interrupt agents gracefully."""
        del message
        if self._run_task is None or self._run_task.done() or self.current_session is None:
            self.notify("No active run to pause.", severity="warning")
            return

        self.request_interrupt_stop(force=False)
        self.notify("Pausing run\u2026 current step will complete first.", severity="warning")

    @traces(SWR.SWR_1272, SWR.SWR_1274)
    async def on_load_transcript_page(self, message: object) -> None:  # noqa: C901
        """Load a page of archived transcript events from the JSONL archive.

        Triggered by ``LoadTranscriptPage`` when the user scrolls near the top
        of the ChatPanel.  Finds the oldest sentinel event, loads its page from
        the archiver via ``asyncio.to_thread``, and prepends the events.
        """
        del message
        if self.current_session is None:
            return
        events = self.current_session.transcript_events
        # Find the oldest sentinel event (role == "page").
        sentinel_idx: int | None = None
        sentinel_event: dict[str, Any] | None = None
        for i, event in enumerate(events):
            if event.get("role") == "page":
                sentinel_idx = i
                sentinel_event = event
                break
        if sentinel_idx is None or sentinel_event is None:
            return

        archiver = getattr(self._active_ralph_loop, "_archiver", None)
        if archiver is None and self.session_manager is not None:
            from rotaris_core.tui.transcript_archiver import TranscriptArchiver  # noqa: PLC0415

            page_size = self.config.transcript.archive_page_size if self.config is not None else 50
            archiver = TranscriptArchiver(
                self.session_manager.session_dir(self.current_session.session_id),
                page_size=page_size,
            )
        if archiver is None:
            return

        offset = sentinel_event.get("offset")
        if not isinstance(offset, int):
            return

        try:
            page_events = await archiver.read_page(offset)
        except Exception:  # noqa: BLE001
            _log.exception("Failed to load transcript page %s", offset)
            self.notify("Failed to load older messages", severity="warning")
            return

        if not page_events:
            # Empty page — remove the sentinel to avoid repeated attempts.
            del events[sentinel_idx]
        else:
            # Replace the current sentinel with the loaded page.  If older
            # pages remain, keep a sentinel at the top so another scroll-up can
            # continue walking backward through the archive.
            replacement = list(page_events)
            if offset > 0:
                replacement.insert(
                    0,
                    {
                        "role": "page",
                        "offset": offset - 1,
                        "count": archiver.event_count_for_page(offset - 1),
                    },
                )
            events[sentinel_idx : sentinel_idx + 1] = replacement

        self._render_state.chat_needs_full_rebuild = True
        self.request_widget_refresh()

    def clear_transcript_with_confirmation(self) -> None:
        """Clear the transcript after a two-step /clear confirmation."""
        if self.current_session is None or not self.current_session.transcript_events:
            self.notify("No transcript to clear.", severity="warning")
            return

        now = time.monotonic()
        if (
            self._pending_clear_confirmation_until is None
            or now > self._pending_clear_confirmation_until
        ):
            self._pending_clear_confirmation_until = now + 5.0
            self.notify("Run /clear again within 5s to clear the transcript.", severity="warning")
            return

        self._pending_clear_confirmation_until = None
        self.current_session.transcript_events.clear()
        self._live_stream_messages.clear()
        self._open_tool_events.clear()
        self._render_state.reset()
        if self.session_manager is not None:
            try:
                self.session_manager.persister.request_save(self.current_session)
            except Exception:  # noqa: BLE001
                _log.exception("Failed to persist cleared transcript")
        self.request_widget_refresh()
        self.notify("Transcript cleared.", severity="information")

    def cancel_current_context(self) -> None:
        """Cancel the current modal, screen, or run based on context."""
        from rotaris_core.tui.screens.main import MainScreen  # noqa: PLC0415
        from rotaris_core.tui.screens.modals import (  # noqa: PLC0415
            DiscardArtifactEditsScreen,
            MessageLimitConfirmScreen,
            QuotaWaitScreen,
        )

        if isinstance(self.screen, MessageLimitConfirmScreen):
            self.screen.action_cancel_run()
            return

        if isinstance(self.screen, QuotaWaitScreen):
            self.screen.action_wait()
            return
        if isinstance(self.screen, DiscardArtifactEditsScreen):
            self.screen.action_cancel()
            return
        if not isinstance(self.screen, MainScreen):
            if hasattr(self.screen, "action_dismiss_screen"):
                cast("Any", self.screen).action_dismiss_screen()
                return
            if hasattr(self.screen, "action_cancel"):
                cast("Any", self.screen).action_cancel()
                return
            self.screen.dismiss(None)
            return
        if self._run_task is None or self._run_task.done() or self.current_session is None:
            self.notify("Nothing active to cancel.", severity="warning")
            return
        self.post_message(StopRun())

    @traces(SWR.SWR_916, SWR.SWR_918)
    def _show_reattached_message_limit_prompt(self) -> None:
        """Show and resolve a durable message-limit pause without an active loop."""
        session = self.current_session
        if session is None or self._message_limit_prompt_visible:
            return
        message_limit = session.message_limit
        if message_limit is None:
            session.execution_status = "paused"
            self.notify(
                "Paused session has no message limit to resume.",
                severity="warning",
            )
            if self.session_manager is not None:
                self.session_manager.persister.request_save(session)
            return

        usage = session.global_token_usage
        token_usage = f"Input: {usage.prompt_tokens:,} / Output: {usage.completion_tokens:,}"
        self._message_limit_prompt_visible = True

        def _handle_result(result: str | None) -> None:
            self._message_limit_prompt_visible = False
            if result is None or self.current_session is None:
                return
            if result == "double":
                self.current_session.message_limit = message_limit * 2
            self.current_session.execution_status = "paused" if result == "cancel" else "idle"
            if self.session_manager is not None:
                signal_file = (
                    self.session_manager.session_dir(self.current_session.session_id)
                    / ".message_limit_paused"
                )
                try:
                    signal_file.unlink(missing_ok=True)
                    self.session_manager.persister.request_save(self.current_session)
                except OSError:
                    _log.exception("Failed to resolve reattached message limit pause")

        self.push_screen(
            MessageLimitConfirmScreen(
                message_count=session.message_count,
                message_limit=message_limit,
                token_usage=token_usage,
            ),
            _handle_result,
        )

    @traces(SWR.SWR_917)
    def action_resume_paused_message_limit(self) -> None:
        """Open the confirmation dialog for a message-limit-paused session."""
        if (
            self.current_session is not None
            and self.current_session.execution_status == "paused_message_limit"
        ):
            self._show_reattached_message_limit_prompt()

    @traces(SWR.SWR_912, SWR.SWR_918)
    def show_message_limit_prompt(
        self,
        *,
        message_count: int,
        message_limit: int,
        token_usage: str,
        on_resolve: Callable[[str], None],
    ) -> None:
        """Persist the pause and display the message-limit confirmation modal."""
        if self.current_session is None or self._message_limit_prompt_visible:
            return
        self.current_session.execution_status = "paused_message_limit"
        self.current_session.message_count = message_count
        self.current_session.message_limit = message_limit
        if self.session_manager is not None:
            try:
                self.session_manager.persister.request_save(self.current_session)
            except Exception:  # noqa: BLE001
                _log.exception("Failed to persist message limit paused state")

        self._message_limit_prompt_visible = True

        def _handle_result(result: str | None) -> None:
            self._message_limit_prompt_visible = False
            if result is None:
                return
            if result == "double" and self.current_session is not None:
                self.current_session.message_limit = message_limit * 2
            if result != "cancel" and self.current_session is not None:
                self.current_session.execution_status = "running"
            if self.current_session is not None and self.session_manager is not None:
                try:
                    self.session_manager.persister.request_save(self.current_session)
                except Exception:  # noqa: BLE001
                    _log.exception("Failed to persist message limit resolution")
            on_resolve(result)

        self.push_screen(
            MessageLimitConfirmScreen(
                message_count=message_count,
                message_limit=message_limit,
                token_usage=token_usage,
            ),
            _handle_result,
        )

    def show_quota_wait_prompt(  # noqa: C901
        self,
        *,
        actor: str,
        message: str,
        model: str | None,
        wait_seconds: int,
        allow_auto_resume: bool,
    ) -> None:
        """Display a quota-wait prompt and push a modal for model change or retry."""
        if self.current_session is None:
            return

        model_label = model or "current provider/model"
        if allow_auto_resume:
            wait_text = (
                f"{message}\n\nRetrying automatically in about {wait_seconds}s for "
                f"{model_label}. You can keep waiting, cancel the run, or change to a "
                "different model now."
            )
        else:
            wait_text = (
                f"{message}\n\n{model_label} is marked exhausted for this session. "
                "Keep waiting if you expect the provider quota to recover, cancel the run, "
                "or choose a different model to resume immediately."
            )
        self.current_session.execution_status = "waiting"
        self.current_session.wait_state = {
            "actor": actor,
            "message": message,
            "model": model_label,
            "wait_seconds": wait_seconds,
            "allow_auto_resume": allow_auto_resume,
        }
        if (
            not self.current_session.transcript_events
            or self.current_session.transcript_events[-1].get("content") != wait_text
        ):
            self.current_session.transcript_events.append(
                {
                    "role": "system",
                    "content": wait_text,
                },
            )
        if self.session_manager is not None:
            try:
                self.session_manager.persister.request_save(self.current_session)
            except Exception:  # noqa: BLE001
                _log.exception("Failed to persist quota wait state")
        self.request_widget_refresh()

        if self._quota_wait_prompt_visible:
            return

        self._quota_wait_prompt_visible = True

        def _handle_result(result: str | None) -> None:
            self._quota_wait_prompt_visible = False
            if result == "cancel":
                self.post_message(StopRun())
                return
            if result == "change_model":
                self._show_quota_wait_model_picker(actor)
                return
            if result == "wait":
                scheduler = getattr(self._active_ralph_loop, "scheduler", None)
                if scheduler is not None:
                    scheduler.resolve_quota_wait(actor, action="retry")
                if self.current_session is not None:
                    self.current_session.execution_status = "running"
                    self.current_session.wait_state = None
                return

        self.push_screen(
            QuotaWaitScreen(
                title="Provider quota exhausted",
                body=wait_text,
                allow_auto_resume=allow_auto_resume,
            ),
            _handle_result,
        )

    async def on_force_compress(self, message: ForceCompress) -> None:  # noqa: C901
        """Handle force-compress request: trigger context compression on all active agents."""
        del message
        from rotaris_core.orchestrator.scheduler_compression import (  # noqa: PLC0415
            force_compress_child,
        )

        if self._active_ralph_loop is None:
            self.notify("No running agents to compress.", severity="warning")
            return

        scheduler = getattr(self._active_ralph_loop, "scheduler", None)
        if scheduler is None:
            self.notify("No running agents to compress.", severity="warning")
            return

        conversation_lock = getattr(scheduler, "_conversation_lock", None)
        active_conversations_map = getattr(scheduler, "_active_conversations", None)
        if not isinstance(active_conversations_map, dict) or conversation_lock is None:
            self.notify("No running agents to compress.", severity="warning")
            return

        with conversation_lock:
            conversations = dict(active_conversations_map)

        if not conversations:
            self.notify("No running agents to compress.", severity="warning")
            return

        n = len(conversations)
        self.notify(f"Compressing context for {n} agent(s)\u2026", severity="information")

        from rotaris_core.tui.live_activity import describe_compression_event  # noqa: PLC0415

        for name in conversations:
            self._live_agent_activity[name] = describe_compression_event("compressing", name)

        async def _compress_one(name: str, conv: object) -> tuple[str, Exception | None]:
            try:
                await force_compress_child(scheduler, name, conv)
                return name, None
            except Exception as exc:  # noqa: BLE001
                return name, exc

        results: list[tuple[str, Exception | None]] = await asyncio.gather(
            *(_compress_one(name, conv) for name, conv in conversations.items()),
        )

        for name in conversations:
            self._live_agent_activity.pop(name, None)

        errors: list[tuple[str, str]] = []
        success_count = 0
        for name, exc in results:
            if exc is None:
                success_count += 1
            else:
                errors.append((name, str(exc)[:120]))

        for name, reason in errors:
            self.notify(f"Compression failed for {name}: {reason}", severity="error")

        if success_count > 0 or not errors:
            self.notify(f"Context compressed for {success_count} agent(s).", severity="information")

    def on_new_session(self, message: NewSession) -> None:
        """Handle new-session request: create a fresh session and reset model state."""
        del message
        if not self.session_manager or not self.config:
            self.notify(
                "No session manager or config available.",
                severity="error",
            )
            return
        try:
            self._reset_active_model_to_config()
            self.current_session = self.session_manager.create_session(self.config)
        except RuntimeError as exc:
            self.notify(
                f"Session lock conflict: {exc}",
                severity="error",
            )
        except Exception as exc:  # noqa: BLE001
            _log.exception("Failed to create session")
            self.notify(
                f"Unable to create session: {exc}",
                severity="error",
            )
        else:
            self.notify(
                f"Created session [b]{self.current_session.session_id}[/b]",
            )

    def on_toggle_tool_events(self, message: ToggleToolEvents) -> None:
        """Handle toggle-tool-events message: flip visibility and persist."""
        del message
        self.show_tool_events = not self.show_tool_events
        self._persist_display_config()
        self._refresh_widgets()
        state = "visible" if self.show_tool_events else "hidden"
        self.notify(f"Tool results {state}")

    def on_toggle_reasoning(self, message: ToggleReasoning) -> None:
        """Handle toggle-reasoning message: flip reasoning visibility."""
        del message
        self.show_reasoning = not self.show_reasoning
        self._refresh_widgets()
        state = "visible" if self.show_reasoning else "hidden"
        self.notify(f"Reasoning {state}")

    def _persist_display_config(self) -> None:
        """Write the current ``display`` settings to the workspace agents.yaml."""
        persist_display_config(self)

    def _persist_compressor_config(self) -> None:
        """Write the current ``compressor`` settings to the workspace agents.yaml."""
        persist_compressor_config(self)

    def _persist_config_sections(self, sections: dict[str, Any], *, scope: str) -> None:
        persist_config_sections(self, sections, scope=scope)

    def toggle_memory_diagnostics_scope(self, scope: str) -> Any:  # noqa: ANN401
        """Toggle memory diagnostics for the given configuration *scope*."""
        return toggle_memory_diagnostics_scope(self, scope)

    def _reload_config_after_settings_save(self) -> None:
        reload_config_after_settings_save(self)

    def _scope_runtime_memory_setting(self, scope: str) -> bool | None:
        return scope_runtime_memory_setting(self, scope)

    def _read_scope_runtime_config(self, scope: str) -> dict[str, Any] | None:
        return read_scope_runtime_config(self, scope)

    def _dev_options_state(self) -> Any:  # noqa: ANN401
        return dev_options_state(self)

    def action_toggle_reasoning(self) -> None:
        """Keyboard / action-link entry point used by the Ctrl+R binding and by
        clicks on the chat panel (see ``ChatPanel.on_click``). Routed through
        the same ``ToggleReasoning`` message as the command palette so all
        paths share one code path.
        """
        self.post_message(ToggleReasoning())

    def _merge_live_agent_activity(
        self,
        child_states: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return merge_live_agent_activity(self, child_states)

    def _get_agent_tree(self) -> tuple[list[dict[str, Any]], dict[str, list[str]], dict[str, str]]:
        """Return (flat_agents, children_by_parent, parent_of) for navigation."""
        return get_agent_tree(self)

    def _merge_activity_into_child(self, child: dict[str, Any]) -> dict[str, Any]:
        return merge_activity_into_child(self, child)

    def _sync_parent_activity_from_manager(self, manager: Any) -> None:  # noqa: ANN401
        sync_parent_activity_from_manager(self, manager)

    def action_focus_child(self) -> None:
        """Move focus to the child widget of the current selection."""
        focus_child(self)

    def action_focus_parent(self) -> None:
        """Move focus to the parent widget of the current selection."""
        focus_parent(self)

    def action_focus_next_sibling(self) -> None:
        """Move focus to the next sibling widget."""
        focus_next_sibling(self)

    def action_focus_prev_sibling(self) -> None:
        """Move focus to the previous sibling widget."""
        focus_prev_sibling(self)

    def _input_has_focus(self) -> bool:
        return input_has_focus(self)

    def _focus_sibling(self, *, direction: int) -> None:
        focus_sibling(self, direction=direction)

    def _current_artifact_store(self) -> SessionArtifactStore | None:
        return current_artifact_store(self, _log)

    def _visible_artifact_records(self) -> list[ArtifactRecord]:
        return visible_artifact_records(self, _log)

    def _focused_child_state(self) -> dict[str, Any] | None:
        return focused_child_state(self)

    async def action_next_artifact(self) -> None:
        """Move artifact focus to the next artifact."""
        if self._input_has_focus() and not self.artifact_inspect_mode:
            return
        await self._focus_artifact_action(direction=1)

    async def action_prev_artifact(self) -> None:
        """Move artifact focus to the previous artifact."""
        if self._input_has_focus() and not self.artifact_inspect_mode:
            return
        await self._focus_artifact_action(direction=-1)

    async def _focus_artifact_action(self, *, direction: int) -> None:
        await focus_artifact_action(self, direction=direction, logger=_log)

    def _focus_artifact(self, *, direction: int) -> None:
        focus_artifact(self, direction=direction, logger=_log)

    async def action_enter_artifact(self) -> None:
        """Open the focused artifact in the inspector."""
        if self._input_has_focus():
            return
        if self.focused_artifact_id is None:
            self._focus_artifact(direction=1)
        if self.focused_artifact_id is None:
            return
        await self._enter_artifact_inspector(self.focused_artifact_id)

    def action_exit_artifact(self) -> None:
        """Exit the artifact inspector, confirming unsaved edits if needed."""
        self.exit_artifact_inspector(require_confirm=True)

    async def _enter_artifact_inspector(self, artifact_id: str) -> None:
        await enter_artifact_inspector(self, artifact_id, logger=_log)

    def exit_artifact_inspector(self, *, require_confirm: bool) -> None:
        """Exit the artifact inspector, optionally confirming unsaved changes."""
        exit_artifact_inspector(self, require_confirm=require_confirm)

    def _exit_artifact_inspector_now(self) -> None:
        exit_artifact_inspector_now(self)

    def save_artifact(self, artifact_id: str, body_markdown: str) -> None:
        """Persist the given artifact's markdown body."""
        save_artifact(self, artifact_id, body_markdown, logger=_log)

    def on_send_to_background(self, message: SendToBackground) -> None:
        """Handle send-to-background: persist the session as background."""
        del message
        if self._run_task is None or self._run_task.done() or self.current_session is None:
            self.notify("No active run to send to background.", severity="warning")
            return

        self.current_session.execution_status = "background"
        if self.session_manager:
            try:
                self.session_manager.persister.request_save(self.current_session)
            except Exception as exc:  # noqa: BLE001
                _log.exception("Failed to save session for background handoff")
                self.notify(
                    f"Background handoff save failed: {exc}",
                    severity="error",
                )
                return

        self.notify(
            "Session saved. Background execution not yet supported — session state preserved.",
        )

    def action_cycle_model(self) -> None:
        """Open the runtime model picker to cycle the active model."""
        self.action_show_runtime_models()

    def _cycle_configured_model(self) -> None:
        if self.config is None:
            return
        model_keys = list(self.config.models.keys())
        if not model_keys:
            self.notify("No models configured.", severity="warning")
            return
        if self.active_model_key in model_keys:
            idx = model_keys.index(self.active_model_key)
            self.active_model_key = model_keys[(idx + 1) % len(model_keys)]
        else:
            self.active_model_key = model_keys[0]
        self._update_composer_model()
        self.notify(f"Model: {self.active_model_key}")

    def _update_composer_model(self) -> None:
        update_composer_model(self)

    def _refresh_composer_meta(self) -> None:
        refresh_composer_meta(self)

    def handle_queued_prompt(self, text: str) -> None:
        """Queue a prompt for the next iteration."""
        self._handle_queued_prompt(text)

    def handle_steering_prompt(self, text: str) -> None:
        """Send a steering prompt to the active child agent."""
        self._handle_steering_prompt(text)

    def _get_active_child_id(self) -> str | None:
        if self._active_ralph_loop is None:
            return None
        scheduler = getattr(self._active_ralph_loop, "scheduler", None)
        if scheduler is None:
            return None

        conversation_lock = getattr(scheduler, "_conversation_lock", None)
        active_conversations = getattr(scheduler, "_active_conversations", None)
        if (
            conversation_lock is None
            or not hasattr(conversation_lock, "__enter__")
            or not isinstance(active_conversations, dict)
        ):
            return None

        typed_conversation_lock = cast("Any", conversation_lock)
        typed_active_conversations = cast("dict[str, Any]", active_conversations)

        with typed_conversation_lock:
            active_child_ids = list(typed_active_conversations.keys())

        if not active_child_ids:
            return None
        if self.focused_agent_id in active_child_ids:
            return self.focused_agent_id
        return active_child_ids[0]

    def _handle_queued_prompt(self, text: str) -> None:
        from rotaris_core.api.prompts import prompt_api  # noqa: PLC0415

        prompt_api.submit_queued(text)
        self.notify("Prompt queued for the next iteration.")
        self._render_state.chat_needs_full_rebuild = True
        self.request_widget_refresh()

    def unqueue_prompt(self, prompt_id: str) -> None:
        """Remove a previously queued prompt by its id."""
        from rotaris_core.api.prompts import prompt_api  # noqa: PLC0415

        try:
            prompt_api.unqueue(prompt_id)
        except (KeyError, ValueError) as exc:
            self.notify(str(exc), severity="warning")
            return
        self.notify("Queued prompt removed.")
        self._render_state.chat_needs_full_rebuild = True
        self.request_widget_refresh()
        if self._render_state.refresh_scheduled:
            self._flush_scheduled_widget_refresh()

    def _handle_steering_prompt(self, text: str) -> None:
        from rotaris_core.api.prompts import prompt_api  # noqa: PLC0415

        child_id = self._get_active_child_id()
        if child_id is None:
            self._handle_queued_prompt(text)
            self.notify(
                "No active child to steer; queued for the next iteration.",
                severity="warning",
            )
            return

        prompt_api.submit_steering(child_id, text)
        self.notify(f"Steering sent to {child_id}.")

    def on_input_composer_cycle_model(self, message: Any) -> None:  # noqa: ANN401
        """Handle cycle-model action from the input composer widget."""
        del message
        self.action_show_runtime_models()

    def on_input_composer_open_settings(self, message: Any) -> None:  # noqa: ANN401
        """Handle open-settings action from the input composer widget."""
        del message
        self.action_command_palette()

    def on_info_pane_focus_artifact(self, message: Any) -> None:  # noqa: ANN401
        """Handle click on an artifact entry in the info pane."""
        self.focused_artifact_id = message.artifact_id

    async def on_logout_message(self, message: LogoutMessage) -> None:
        """Handle logout request: clear tokens for the given provider."""
        from rotaris_core.auth.logout import (  # noqa: PLC0415
            UnknownLogoutProviderError,
            logout_provider,
        )
        from rotaris_core.auth.storage import TokenStorage  # noqa: PLC0415

        storage = TokenStorage()
        try:
            result = logout_provider(message.provider_id, storage=storage)
        except UnknownLogoutProviderError as exc:
            self.notify(str(exc), severity="error")
        except OSError as exc:
            self.notify(
                f"Logout failed for {message.provider_id.strip().lower()}: {exc}",
                severity="error",
            )
        else:
            self.notify(result.message, severity=result.severity)

    def on_set_theme(self, message: SetTheme) -> None:
        """Handle theme change: apply new theme and refresh CSS."""
        from rotaris_core.tui.themes import set_theme  # noqa: PLC0415

        try:
            set_theme(message.name)
        except ValueError as exc:
            self.notify(str(exc), severity="error")
            return
        self.refresh_css()
        self.notify(f"Theme: {message.name}")

    # -- Prompt stash --------------------------------------------------------

    def _get_prompt_stash(self) -> PromptStash:
        if self._prompt_stash is None:
            from rotaris_core.tui.stash import PromptStash  # noqa: PLC0415

            self._prompt_stash = PromptStash()
        return self._prompt_stash

    def prompt_history_path(self) -> Path | None:
        """Return the path to the prompt history JSON file, or ``None``."""
        if self.config is None:
            return None
        return self.config.workspace_root / ".rotaris" / "prompt_history.json"

    @traces(SWR.SWR_1114)
    def action_stash_input(self) -> None:
        """Save the current composer text to the prompt stash."""
        from textual.css.query import NoMatches  # noqa: PLC0415

        from rotaris_core.tui.widgets.input_composer import InputComposer  # noqa: PLC0415

        try:
            composer = self.screen.query_one(InputComposer)
        except (NoMatches, Exception):
            return
        text = composer.get_text()
        if not text:
            self.notify("Nothing to stash.", severity="warning")
            return
        stash = self._get_prompt_stash()
        stash.push(text)
        composer.set_text("")
        composer.update_stash_count(stash.size)
        self.notify(f"Input stashed ({stash.size} in stack)")

    def on_stash_input(self, message: StashInput) -> None:
        """Handle stash-input message: delegate to ``action_stash_input``."""
        del message
        self.action_stash_input()

    @traces(SWR.SWR_1117, SWR.SWR_1118)
    def on_pop_input(self, message: PopInput) -> None:
        """Handle pop-input message: restore the last stashed text."""
        del message
        from textual.css.query import NoMatches  # noqa: PLC0415

        from rotaris_core.tui.widgets.input_composer import InputComposer  # noqa: PLC0415

        try:
            composer = self.screen.query_one(InputComposer)
        except (NoMatches, Exception):
            return
        stash = self._get_prompt_stash()
        entry = stash.pop()
        if entry is None:
            self.notify("Stash is empty.", severity="warning")
            return
        current = composer.get_text()
        if current:
            composer.set_text(current + entry)
        else:
            composer.set_text(entry)
        composer.update_stash_count(stash.size)
        self.notify(f"Input restored ({stash.size} remaining)")
