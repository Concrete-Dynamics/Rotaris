from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.messages import RunCompleted

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.tui.app import RotarisTuiApp

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


@traces(SWR.SWR_157)
class TuiRunController:
    def __init__(self, app: RotarisTuiApp, logger: logging.Logger) -> None:
        self.app = app
        self._logger = logger

    async def start(self, task_text: str) -> None:
        app = self.app
        logger = self._logger

        current_task = asyncio.current_task()
        if current_task is not None:
            app._run_task = current_task  # noqa: SLF001

        if not app.session_manager or not app.config:
            app.notify(
                "No session manager or config available.",
                severity="warning",
            )
            app._run_task = None  # noqa: SLF001
            return

        from rotaris_core.llm_errors import format_llm_runtime_error  # noqa: PLC0415
        from rotaris_core.ralph import bootstrap  # noqa: PLC0415
        from rotaris_core.ralph.intent_classifier import (  # noqa: PLC0415
            classification_status_text,
            intent_tools_for,
            summarize_intent_fallback_reason,
        )
        from rotaris_core.ralph.state import summarize_run_progress  # noqa: PLC0415
        from rotaris_core.sdk_text import content_is_internal_deliberation  # noqa: PLC0415
        from rotaris_core.tui.streaming import extract_stream_text  # noqa: PLC0415

        session_manager = app.session_manager
        config = app.config
        run_message: RunCompleted | None = None
        cleanup_logging: Callable[[], None] | None = None
        announced_child_spawns: set[str] = set()
        ralph: RalphLoop | None = None
        post_run_improvement_job: Any | None = None

        if app.current_session is None:
            app.current_session = session_manager.create_session(config)

        state = app.current_session
        if state is None:
            app._run_task = None  # noqa: SLF001
            return
        app._sync_session_model_state()  # noqa: SLF001
        state.wait_state = None

        session_dir = session_manager.session_dir(state.session_id)
        state.transcript_events.append(
            {
                "role": "user",
                "content": task_text,
            },
        )
        classification_status_event: dict[str, Any] = {
            "role": "system",
            "content": "Classifying intent...",
        }
        state.transcript_events.append(classification_status_event)
        app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001
        app.request_widget_refresh()
        classification = await bootstrap.classify_run_intent(
            config,
            task_text,
            entrypoint="tui",
            progress=state.ralph_progress,
            # Read before the assignment below overwrites it: on a resume this
            # still holds the *previous* run's intent, which is what an
            # unclassifiable continuation prompt inherits (SWR-176).
            prior_intent=state.run_intent,
            todo_state=state.todo_state,
        )
        intent_tools = intent_tools_for(classification.intent)
        state.run_intent = classification.intent.value
        classification_prompt_text = f"Intent classified: {classification.intent.value}"
        final_classification_text = classification_status_text(classification)
        classification_status_event["content"] = classification_prompt_text
        app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001
        app.request_widget_refresh()
        from rotaris_core.session.diagnostics import (  # noqa: PLC0415
            debug_log_path,
            emit_timeline_event,
        )

        emit_timeline_event(
            session_dir,
            "intent_classified",
            actor="tui",
            message=final_classification_text,
            metadata={"fallback": classification.fallback, "reason": classification.reason},
        )

        todo, _top_level_task = bootstrap.build_run_todo(state, task_text, session_dir)
        classification_status_event["content"] = final_classification_text
        fallback_reason = (
            summarize_intent_fallback_reason(classification.reason)
            if classification.fallback
            else None
        )
        if fallback_reason:
            app.notify(
                f"Intent classifier fallback: {fallback_reason}", severity="warning", timeout=8
            )
        app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001
        app.request_widget_refresh()

        from rotaris_core.runtime_logging import configure_session_logging  # noqa: PLC0415

        cleanup_logging = configure_session_logging(
            debug_log_path(session_dir),
            level=config.runtime.session_log_level,
        )
        emit_timeline_event(
            session_dir,
            "run_start",
            actor="tui",
            message=f"Starting TUI run for session {state.session_id}",
            metadata={"workspace_root": str(config.workspace_root)},
        )
        logger.info(
            "Starting TUI run for session %s in %s",
            state.session_id,
            config.workspace_root,
        )

        from rotaris_core.session.metrics import (  # noqa: PLC0415
            hydrate_tracker_from_session,
            sync_tracker_to_session,
        )

        hydrate_tracker_from_session(state)

        def persist_state() -> None:
            sync_tracker_to_session(state)
            session_manager.persister.request_save(state)
            app._refresh_widgets()  # noqa: SLF001

        def reset_live_activity() -> None:
            app._live_agent_activity.clear()  # noqa: SLF001
            app._live_stream_messages.clear()  # noqa: SLF001
            app._open_tool_events.clear()  # noqa: SLF001
            app._render_state.reset_live()  # noqa: SLF001
            app._recent_activity_events.clear()  # noqa: SLF001
            announced_child_spawns.clear()

        def set_live_activity(
            agent_name: str,
            persona: str,
            *,
            activity_icon: str,
            activity_text: str,
            activity_phase: str,
        ) -> None:
            app._live_agent_activity[agent_name] = {  # noqa: SLF001
                "persona": persona,
                "activity_icon": activity_icon,
                "activity_text": activity_text,
                "activity_phase": activity_phase,
            }

        def update_live_stream(
            agent_name: str,
            persona: str,
            *,
            text_delta: str = "",
            reasoning_delta: str = "",
            phase: str,
        ) -> None:
            if text_delta and agent_name in app._live_stream_messages:  # noqa: SLF001
                candidate = app._live_stream_messages[agent_name]["content"] + text_delta  # noqa: SLF001
                if content_is_internal_deliberation(candidate):
                    clear_live_stream(agent_name)
                    text_delta = ""
                    phase = "thinking"

            if agent_name not in app._render_state.open_text_segments_by_agent and text_delta:  # noqa: SLF001
                _commit_pending_reasoning(agent_name)
                placeholder: dict[str, Any] = {"role": "agent", "name": agent_name, "content": ""}
                state.transcript_events.append(placeholder)
                app._render_state.open_text_segments_by_agent[agent_name] = placeholder  # noqa: SLF001

            stream_state = app._live_stream_messages.setdefault(  # noqa: SLF001
                agent_name,
                {
                    "persona": persona,
                    "content": "",
                    "reasoning": "",
                    "phase": phase,
                    "thinking_started_at": 0.0,
                    "stalled": False,
                },
            )
            stream_state["persona"] = persona
            stream_state["phase"] = phase
            if text_delta:
                stream_state["content"] += text_delta
            if reasoning_delta:
                stream_state["reasoning"] += reasoning_delta
            if phase == "thinking" and not stream_state["thinking_started_at"]:
                stream_state["thinking_started_at"] = time.monotonic()
            if phase != "thinking":
                stream_state["stalled"] = False

        def clear_live_stream(agent_name: str) -> None:
            app._live_stream_messages.pop(agent_name, None)  # noqa: SLF001

        def _get_open_text_segment(agent_name: str) -> dict[str, Any] | None:
            segment = app._render_state.open_text_segments_by_agent.get(agent_name)  # noqa: SLF001
            if segment is None:
                return None
            if any(event is segment for event in state.transcript_events):
                return segment
            app._render_state.open_text_segments_by_agent.pop(agent_name, None)  # noqa: SLF001
            return None

        def _remove_open_text_segment_event(agent_name: str, segment: dict[str, Any]) -> None:
            with contextlib.suppress(ValueError):
                state.transcript_events.remove(segment)
            app._render_state.open_text_segments_by_agent.pop(agent_name, None)  # noqa: SLF001
            app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001

        def _open_text_segment(agent_name: str) -> dict[str, Any]:
            segment = _get_open_text_segment(agent_name)
            if segment is not None:
                return segment
            segment = {"role": "agent", "name": agent_name, "content": ""}
            state.transcript_events.append(segment)
            app._render_state.open_text_segments_by_agent[agent_name] = segment  # noqa: SLF001
            return segment

        def _close_open_text_segment(agent_name: str) -> None:
            app._render_state.open_text_segments_by_agent.pop(agent_name, None)  # noqa: SLF001

        def _finalize_open_text_segment(agent_name: str) -> None:
            segment = _get_open_text_segment(agent_name)
            live_text = str(app._live_stream_messages.get(agent_name, {}).get("content", ""))  # noqa: SLF001

            if segment is None:
                clear_live_stream(agent_name)
                return

            if live_text:
                if str(segment.get("content", "")) != live_text:
                    segment["content"] = live_text
                    app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001
                prior_snapshot = app._render_state.last_visible_text_snapshot_by_agent.get(  # noqa: SLF001
                    agent_name,
                    "",
                )
                app._render_state.last_visible_text_snapshot_by_agent[agent_name] = (  # noqa: SLF001
                    prior_snapshot + live_text
                )
            elif not str(segment.get("content", "")).strip():
                _remove_open_text_segment_event(agent_name, segment)
                clear_live_stream(agent_name)
                return

            _close_open_text_segment(agent_name)
            clear_live_stream(agent_name)

        def _persist_visible_text(
            agent_name: str,
            content: str,
            *,
            terminal: bool = False,
        ) -> None:
            if not content:
                if terminal:
                    _close_open_text_segment(agent_name)
                    app._render_state.last_visible_text_snapshot_by_agent.pop(agent_name, None)  # noqa: SLF001
                    clear_live_stream(agent_name)
                return

            segment = _get_open_text_segment(agent_name)
            prior_snapshot = app._render_state.last_visible_text_snapshot_by_agent.get(  # noqa: SLF001
                agent_name,
                "",
            )
            snapshot_matches = bool(prior_snapshot) and content.startswith(prior_snapshot)
            if prior_snapshot and not snapshot_matches:
                if segment is not None and str(segment.get("content", "")).strip():
                    _close_open_text_segment(agent_name)
                    segment = None
                prior_snapshot = ""

            suffix = content[len(prior_snapshot) :] if prior_snapshot else content
            if suffix:
                if segment is None:
                    segment = _open_text_segment(agent_name)
                current_content = str(segment.get("content", ""))
                next_content = suffix if not current_content else current_content + suffix
                if current_content != next_content:
                    segment["content"] = next_content
                    app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001
            elif segment is not None and not str(segment.get("content", "")).strip():
                _remove_open_text_segment_event(agent_name, segment)

            app._render_state.last_visible_text_snapshot_by_agent[agent_name] = content  # noqa: SLF001
            clear_live_stream(agent_name)

            if terminal:
                _close_open_text_segment(agent_name)
                app._render_state.last_visible_text_snapshot_by_agent.pop(agent_name, None)  # noqa: SLF001

        def _commit_pending_reasoning(agent_name: str) -> None:
            stream_data = app._live_stream_messages.get(agent_name, {})  # noqa: SLF001
            accumulated_reasoning = str(stream_data.get("reasoning", ""))
            if not accumulated_reasoning:
                return
            thinking_started_at = stream_data.get("thinking_started_at", 0.0)
            thinking_duration: float | None = None
            if thinking_started_at:
                with contextlib.suppress(ValueError, TypeError):
                    thinking_duration = round(time.monotonic() - float(thinking_started_at), 1)
            thinking_event: dict[str, Any] = {
                "role": "thinking",
                "name": agent_name,
                "content": accumulated_reasoning,
            }
            if thinking_duration is not None:
                thinking_event["thinking_duration"] = thinking_duration
            state.transcript_events.append(thinking_event)
            stream_data["reasoning"] = ""
            stream_data["thinking_started_at"] = 0.0
            app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001

        def update_agent_todo(todo: Any) -> None:  # noqa: ANN401
            state.agent_todo_state = todo.model_dump(mode="json")
            app.request_widget_refresh()

        def push_activity_event(agent_name: str, icon: str, text: str, phase: str = "tool") -> None:
            normalized = text.strip()
            if not normalized:
                return
            entry = {
                "agent_name": agent_name,
                "icon": icon,
                "text": normalized,
                "phase": phase,
            }
            if app._recent_activity_events and app._recent_activity_events[-1] == entry:  # noqa: SLF001
                return
            app._recent_activity_events.append(entry)  # noqa: SLF001

        def sync_children(manager: ChildManager | None = None) -> None:
            if manager is None:
                state.child_states = []
                app._render_state.last_sync_version = -1  # noqa: SLF001
                app._render_state.cached_child_dicts = []  # noqa: SLF001
                return
            children = manager.snapshot_children()
            for record in children:
                store_child_spawn(record)
            app._sync_parent_activity_from_manager(manager)  # noqa: SLF001
            if manager._version != app._render_state.last_sync_version:  # noqa: SLF001
                app._render_state.cached_child_dicts = [  # noqa: SLF001
                    record.model_dump(mode="json") for record in children
                ]
                app._render_state.last_sync_version = manager._version  # noqa: SLF001
            for record in children:
                if record.state.is_terminal():
                    key = record.canonical_name
                    if key in app._live_agent_activity:  # noqa: SLF001
                        activity = app._live_agent_activity[key]  # noqa: SLF001
                        if activity.get("activity_phase") == "summarizing":
                            terminal_state = str(record.state)
                            if terminal_state == "succeeded":
                                app._live_agent_activity[key] = {  # noqa: SLF001
                                    **activity,
                                    "activity_icon": "",
                                    "activity_text": "Completed",
                                    "activity_phase": "completed",
                                }
                            elif terminal_state == "failed":
                                app._live_agent_activity[key] = {  # noqa: SLF001
                                    **activity,
                                    "activity_icon": "✗",
                                    "activity_text": "Failed",
                                    "activity_phase": "failed",
                                }
            state.child_states = [
                app._merge_activity_into_child(dict(d))  # noqa: SLF001
                for d in app._render_state.cached_child_dicts  # noqa: SLF001
            ]

        def store_report(record_name: str, response_text: str) -> None:
            _persist_visible_text(record_name, response_text, terminal=True)

        def store_child_spawn(record: ChildTaskRecord) -> None:
            canonical_name = str(record.canonical_name)
            if canonical_name in announced_child_spawns:
                return
            parent_agent_id = str(record.parent_agent_id or "")
            if not parent_agent_id or parent_agent_id == "ralph":
                return
            announced_child_spawns.add(canonical_name)
            state.transcript_events.append(
                {
                    "role": "child",
                    "name": canonical_name,
                    "persona": record.persona,
                    "parent_name": parent_agent_id,
                    "content": record.task_payload,
                },
            )

        def _persist_tool_event(agent_name: str, event: object) -> dict[str, Any] | None:
            from openhands.sdk.event.acp_tool_call import ACPToolCallEvent  # noqa: PLC0415
            from openhands.sdk.event.condenser import (  # noqa: PLC0415
                Condensation,
                CondensationRequest,
            )
            from openhands.sdk.event.conversation_error import (  # noqa: PLC0415
                ConversationErrorEvent,
            )
            from openhands.sdk.event.hook_execution import HookExecutionEvent  # noqa: PLC0415
            from openhands.sdk.event.llm_convertible.action import ActionEvent  # noqa: PLC0415
            from openhands.sdk.event.llm_convertible.observation import (  # noqa: PLC0415
                AgentErrorEvent,
                ObservationEvent,
                UserRejectObservation,
            )

            from rotaris_core.tui.live_activity import describe_sdk_event  # noqa: PLC0415

            if not isinstance(
                event,
                Condensation
                | CondensationRequest
                | ActionEvent
                | ObservationEvent
                | UserRejectObservation
                | AgentErrorEvent
                | ACPToolCallEvent
                | HookExecutionEvent
                | ConversationErrorEvent,
            ):
                return None
            update = describe_sdk_event(event)
            if update is None:
                return None
            _commit_pending_reasoning(agent_name)
            _finalize_open_text_segment(agent_name)
            entry = app._upsert_tool_transcript_event(  # noqa: SLF001
                state.transcript_events,
                agent_name,
                event,
                update,
            )
            app._persist_ui_edit_diff(  # noqa: SLF001
                state,
                agent_name=agent_name,
                tool_entry=entry,
                event=event,
            )
            return entry

        def apply_conversation_event(
            agent_name: str,
            persona: str,
            manager: ChildManager,
            event: object,
        ) -> None:
            from openhands.sdk.event.condenser import Condensation  # noqa: PLC0415

            from rotaris_core.tracking.tracker import GlobalTracker  # noqa: PLC0415
            from rotaris_core.tui.live_activity import describe_sdk_event  # noqa: PLC0415

            _persist_agent_message_event(agent_name, event)
            persisted_tool_event = _persist_tool_event(agent_name, event)
            if isinstance(event, Condensation):
                from uuid import uuid4  # noqa: PLC0415

                GlobalTracker().track_compression_completion(
                    agent_name,
                    event.llm_response_id or str(uuid4()),
                )
                emit_timeline_event(
                    session_dir,
                    "compression",
                    actor=agent_name,
                    message="Conversation compression completed",
                    metadata={"llm_response_id": event.llm_response_id},
                )
            elif (
                getattr(event, "event_type", None) == "compression"
                and getattr(event, "phase", None) == "done"
            ):
                from uuid import uuid4  # noqa: PLC0415

                GlobalTracker().track_compression_completion(agent_name, str(uuid4()))
                emit_timeline_event(
                    session_dir,
                    "compression",
                    actor=agent_name,
                    message="Conversation compression completed",
                )
            update = describe_sdk_event(event)
            if state.execution_status == "waiting":
                state.execution_status = "running"
                state.wait_state = None
                persist_state()
            if update is not None:
                activity_icon = update["activity_icon"]
                activity_text = update["activity_text"]
                activity_phase = update["activity_phase"]
                feed_icon = update["feed_icon"]
                feed_text = update["feed_text"]
                if persisted_tool_event is not None:
                    activity_icon = str(persisted_tool_event.get("icon", activity_icon))
                    activity_phase = str(persisted_tool_event.get("phase", activity_phase))
                    feed_icon = activity_icon
                    feed_text = str(persisted_tool_event.get("content", feed_text))
                set_live_activity(
                    agent_name,
                    persona,
                    activity_icon=activity_icon,
                    activity_text=activity_text,
                    activity_phase=activity_phase,
                )
                push_activity_event(
                    agent_name,
                    feed_icon,
                    feed_text,
                    activity_phase,
                )
            sync_children(manager)
            app.request_widget_refresh()

        def _persist_agent_message_event(agent_name: str, event: object) -> None:
            from rotaris_core.sdk_text import sanitize_visible_text  # noqa: PLC0415

            source = str(getattr(event, "source", ""))
            llm_message = getattr(event, "llm_message", None)
            if source != "agent" or llm_message is None:
                return

            content_parts: list[str] = []
            for item in getattr(llm_message, "content", []) or []:
                if getattr(item, "type", None) in {"tool_use", "tool_call"}:
                    continue
                raw_text = getattr(item, "text", None)
                if content_is_internal_deliberation(raw_text):
                    continue
                cleaned = sanitize_visible_text(raw_text).strip()
                if cleaned:
                    content_parts.append(cleaned)
            content = "\n".join(content_parts).strip()
            if not content:
                return
            _commit_pending_reasoning(agent_name)
            _persist_visible_text(agent_name, content)

        def apply_token_event(
            agent_name: str,
            persona: str,
            chunk: object,
        ) -> None:
            text_delta, has_reasoning = extract_stream_text(chunk)
            reasoning_delta = ""
            if has_reasoning:
                from rotaris_core.tui.streaming import extract_reasoning_text  # noqa: PLC0415

                reasoning_delta = extract_reasoning_text(chunk)
            if not text_delta and not has_reasoning:
                _log_suppressed_empty_stream_chunk(agent_name, persona, chunk)
                return

            if state.execution_status == "waiting":
                state.execution_status = "running"
                state.wait_state = None
                persist_state()
            phase = "streaming" if text_delta else "thinking"
            update_live_stream(
                agent_name,
                persona,
                text_delta=text_delta,
                reasoning_delta=reasoning_delta,
                phase=phase,
            )
            set_live_activity(
                agent_name,
                persona,
                activity_icon=">" if text_delta else "ANIMATED_THINKING",
                activity_text="Writing response..." if text_delta else "Thinking...",
                activity_phase="responding" if text_delta else "thinking",
            )
            app.request_widget_refresh()

        def dispatch_ui(callback: Callable[..., None], *args: Any) -> None:  # noqa: ANN401
            app.safe_call_from_thread(callback, *args)

        reset_live_activity()
        app._run_timer.start_run()  # noqa: SLF001
        state.execution_status = "running"
        app._refresh_composer_meta()  # noqa: SLF001
        state.todo_state = todo.model_dump(mode="json")
        persist_state()

        try:
            _auth_model_key = app.active_model_key
            if _auth_model_key:
                _auth_model_cfg = app._active_model_config()  # noqa: SLF001
                if _auth_model_cfg is not None and _auth_model_cfg.auth_provider is not None:
                    from rotaris_core.auth.manager import AuthManager  # noqa: PLC0415
                    from rotaris_core.auth.provider import (  # noqa: PLC0415
                        AuthFlowType,
                        AuthStatus,
                        DeviceCodePrompt,
                    )
                    from rotaris_core.auth.storage import TokenStorage  # noqa: PLC0415

                    _auth_provider_id: str = _auth_model_cfg.auth_provider
                    _auth_storage = TokenStorage()
                    _auth_mgr = AuthManager(storage=_auth_storage)

                    def _build_auth_failure_message(provider_id: str, mgr: AuthManager) -> str:
                        err = mgr.get_last_error(provider_id)
                        if err:
                            return f"Authentication failed for {provider_id}: {err}."
                        return f"Authentication failed for {provider_id}."

                    async def _recover_api_key_provider(
                        provider_id: str,
                        storage: TokenStorage,
                        mgr: AuthManager,
                        failure_message: str,
                    ) -> str | None:
                        from rotaris_core.auth.provider_settings import (  # noqa: PLC0415
                            get_provider_settings,
                        )

                        settings = get_provider_settings(provider_id, storage=storage)
                        if settings.auth_flow != AuthFlowType.API_KEY:
                            return None

                        state.transcript_events.append(
                            {"role": "system", "content": failure_message}
                        )
                        app._refresh_widgets()  # noqa: SLF001
                        app.notify(failure_message, severity="warning", timeout=8)

                        from rotaris_core.tui.screens.provider_settings import (  # noqa: PLC0415
                            ProviderSettingsResult,
                            ProviderSettingsScreen,
                        )

                        retry_future: asyncio.Future[ProviderSettingsResult | None] = (
                            asyncio.Future()
                        )
                        app.push_screen(
                            ProviderSettingsScreen(provider_id),
                            lambda r: retry_future.set_result(r),
                        )
                        result = await retry_future
                        app._provider_settings_prompt_visible = False  # noqa: SLF001

                        if result is not None and result.saved:
                            return await mgr.get_token(provider_id)
                        return None

                    _auth_status = await _auth_mgr.check_status(_auth_provider_id)

                    if _auth_status != AuthStatus.AUTHENTICATED:

                        async def _on_auth_prompt(prompt: DeviceCodePrompt | str) -> None:
                            if isinstance(prompt, DeviceCodePrompt):
                                state.transcript_events.append(
                                    {
                                        "role": "system",
                                        "content": (
                                            f"**{_auth_provider_id}** — open this URL to "
                                            f"authenticate:\n\n"
                                            f"  {prompt.verification_uri}\n\n"
                                            f"Enter code: **{prompt.user_code}**\n\n"
                                            f"_Expires in {prompt.expires_in}s_"
                                        ),
                                    },
                                )
                            elif False:
                                state.transcript_events.append(
                                    {
                                        "role": "system",
                                        "content": f"[{_auth_provider_id}] {prompt}",
                                    },
                                )
                            app._refresh_widgets()  # noqa: SLF001

                        state.transcript_events.append(
                            {
                                "role": "system",
                                "content": f"Authentication required for {_auth_provider_id}\u2026",
                            },
                        )
                        app._refresh_widgets()  # noqa: SLF001

                        _auth_token = await _auth_mgr.get_token(
                            _auth_provider_id,
                            on_prompt=_on_auth_prompt,
                        )
                        if _auth_token is None:
                            _auth_failure_message = _build_auth_failure_message(
                                _auth_provider_id,
                                _auth_mgr,
                            )

                            _retried = await _recover_api_key_provider(
                                _auth_provider_id,
                                _auth_storage,
                                _auth_mgr,
                                _auth_failure_message,
                            )
                            if _retried is not None:
                                _auth_token = _retried

                            if _auth_token is None:
                                _auth_failure_message = _build_auth_failure_message(
                                    _auth_provider_id,
                                    _auth_mgr,
                                )
                                state.transcript_events.append(
                                    {
                                        "role": "system",
                                        "content": f"{_auth_failure_message} Run aborted.",
                                    },
                                )
                                app._refresh_widgets()  # noqa: SLF001
                                state.execution_status = "failed"
                                run_message = RunCompleted(
                                    _auth_failure_message,
                                    severity="error",
                                )
                                return
                        state.transcript_events.append(
                            {
                                "role": "system",
                                "content": f"Authenticated with {_auth_provider_id} \u2713",
                            },
                        )
                        app._refresh_widgets()  # noqa: SLF001

            # The TUI registers no interactive approval host, so a permissive
            # permission mode is downgraded to 'ask' here unless the workspace
            # opted in to unsandboxed autonomy (SWR-2508).
            from rotaris_core.permissions import (  # noqa: PLC0415
                announce_effective_permission_mode,
            )

            _effective_mode = announce_effective_permission_mode(state, config)
            if _effective_mode.downgraded:
                emit_timeline_event(
                    session_dir,
                    "permission_mode_downgraded",
                    actor="tui",
                    message=_effective_mode.reason,
                    metadata={
                        "requested_mode": _effective_mode.requested,
                        "effective_mode": _effective_mode.mode,
                    },
                )
                app._render_state.chat_needs_full_rebuild = True  # noqa: SLF001
            persist_state()

            # Every permission decision of this run is audited from here on
            # (SWR-2506).
            from rotaris_core.permissions import register_audit_session  # noqa: PLC0415

            register_audit_session(state.session_id, session_dir)

            from rotaris_core.tui.ralph_loop import TuiRalphLoop  # noqa: PLC0415

            ralph = TuiRalphLoop(
                config=config,
                workspace_root=str(config.workspace_root),
                state=state,
                app=app,
                sync_children=sync_children,
                dispatch_ui=dispatch_ui,
                set_live_activity=set_live_activity,
                push_activity_event=push_activity_event,
                notify_child_spawn=store_child_spawn,
                apply_conversation_event=apply_conversation_event,
                apply_token_event=apply_token_event,
                update_agent_todo=update_agent_todo,
                persist_state=persist_state,
                clear_live_stream=clear_live_stream,
                store_report=store_report,
                summary_agent=bootstrap.make_summary_agent_factory(config),
                improvement_collector_factory=bootstrap.make_improvement_collector_factory(
                    config,
                ),
                improvement_context_provider=bootstrap.make_improvement_context_provider(state),
            )
            ralph.run_intent = classification.intent.value
            app._active_ralph_loop = ralph  # noqa: SLF001

            def _augment_runtime_kwargs(persona: str, kwargs: dict[str, Any]) -> None:
                def _update_context_tokens_live(tokens: int) -> None:
                    app._render_state.last_context_tokens = tokens  # noqa: SLF001
                    app.request_widget_refresh()

                kwargs["condenser_token_callback"] = lambda tokens: app.safe_call_from_thread(
                    _update_context_tokens_live, tokens
                )

            def _resolve_model(
                persona: str,
                persona_config: Any,  # noqa: ANN401
                model_override: str | None,
            ) -> tuple[Any, Any, str]:
                if model_override is not None:
                    model_key = model_override
                else:
                    model_key = (
                        app.active_model_key
                        if persona == config.default_persona and app.active_model_key
                        else persona_config.model
                    )
                effective_persona_config = (
                    persona_config.model_copy(update={"model": model_key})
                    if model_key != persona_config.model
                    else persona_config
                )
                effective_config = config
                if model_key in app._runtime_model_configs:  # noqa: SLF001
                    effective_config = config.model_copy(
                        update={
                            "models": {
                                **config.models,
                                model_key: app._runtime_model_configs[model_key],  # noqa: SLF001
                            },
                            "personas": {
                                **config.personas,
                                persona: effective_persona_config,
                            },
                        },
                    )
                return effective_config, effective_persona_config, model_key

            agent_factory = bootstrap.make_agent_factory(
                config,
                intent_tools=intent_tools,
                intent=classification.intent.value,
                resolve_model=_resolve_model,
                augment_runtime_kwargs=_augment_runtime_kwargs,
            )

            progress = await ralph.run(
                todo=todo,
                agent_factory=agent_factory,
                session_id=state.session_id,
                max_iterations=config.runtime.max_iterations,
            )
            bootstrap.apply_progress_to_state(state, progress, todo, ralph)
            execution_status, run_text, severity = summarize_run_progress(progress)
            state.execution_status = execution_status
            run_message = RunCompleted(run_text, severity=severity)
            state.transcript_events.append(
                {
                    "role": "system",
                    "content": run_message.text,
                },
            )
            post_run_improvement_job = ralph.capture_post_run_improvement_job(
                session_id=state.session_id,
                progress=progress,
                todo=todo,
            )
            # Persist the terminal task outcome before the optional collector
            # starts so a slow analysis pass cannot keep the task run live.
            session_manager.persister.flush_sync(state)
            if post_run_improvement_job is not None:
                result = await post_run_improvement_job.run()
                bootstrap.apply_post_run_improvement_result(state, result)
        except asyncio.CancelledError:
            if state.execution_status not in {"stopped", "paused"}:
                if (
                    app._shutdown_force_deadline is not None  # noqa: SLF001
                    and time.monotonic() >= app._shutdown_force_deadline  # noqa: SLF001
                ):
                    state.execution_status = "stopped"
                    if not state.transcript_events or state.transcript_events[-1].get(
                        "content",
                    ) != ("Run forcefully stopped by user."):
                        state.transcript_events.append(
                            {
                                "role": "system",
                                "content": "Run forcefully stopped by user.",
                            },
                        )
                elif state.execution_status != "paused":
                    state.execution_status = "paused"
                    if not state.transcript_events or state.transcript_events[-1].get(
                        "content",
                    ) != ("Run paused: interrupted by user."):
                        state.transcript_events.append(
                            {
                                "role": "system",
                                "content": "Run paused: interrupted by user.",
                            },
                        )
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("TUI run failed")
            state.execution_status = "failed"
            run_message = RunCompleted(
                f"Run failed: {format_llm_runtime_error(exc)}",
                severity="error",
            )
            state.transcript_events.append(
                {
                    "role": "system",
                    "content": run_message.text,
                },
            )
        finally:
            logger.info("Finished TUI run for session %s", state.session_id)
            from rotaris_core.permissions import discard_audit_session  # noqa: PLC0415

            discard_audit_session(state.session_id)
            emit_timeline_event(
                session_dir,
                "run_end",
                actor="tui",
                message=f"Finished TUI run for session {state.session_id}",
                metadata={"execution_status": state.execution_status},
            )
            app._live_stream_messages.clear()  # noqa: SLF001
            app._render_state.open_text_segments_by_agent.clear()  # noqa: SLF001
            app._render_state.last_visible_text_snapshot_by_agent.clear()  # noqa: SLF001
            app._run_timer.end_run()  # noqa: SLF001
            state.wait_state = None
            app._quota_wait_prompt_visible = False  # noqa: SLF001
            # Guaranteed final write: bypass the debounce so the run's last
            # state survives even if the app exits right after this.
            sync_tracker_to_session(state)
            session_manager.persister.flush_sync(state)
            app._refresh_widgets()  # noqa: SLF001
            if run_message is not None:
                app.screen.post_message(run_message)
            if app._run_task is current_task:  # noqa: SLF001
                app._run_task = None  # noqa: SLF001
            if ralph is not None and app._active_ralph_loop is ralph:  # noqa: SLF001
                app._artifact_store_cache = ralph.artifact_store  # noqa: SLF001
                app._artifact_store_cache_session_id = state.session_id  # noqa: SLF001
                app._active_ralph_loop = None  # noqa: SLF001
            app._refresh_composer_meta()  # noqa: SLF001
            if cleanup_logging is not None:
                cleanup_logging()
            app._complete_pending_exit_after_run()  # noqa: SLF001
