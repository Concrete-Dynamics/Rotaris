"""Apply screen view-model state to TUI widgets."""

from __future__ import annotations

import time
from typing import Any

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_1279)
def refresh_widgets(app: Any) -> None:
    from textual.app import ScreenStackError
    from textual.css.query import NoMatches

    from rotaris_core.tui.view_model import build_screen_view_model

    app._render_state.refresh_scheduled = False
    app._render_state.last_widget_refresh_at = time.monotonic()

    vm = build_screen_view_model(
        session=app.current_session,
        config=app.config,
        render_state=app._render_state,
        focused_agent_id=app.focused_agent_id,
        active_model_key=app.active_model_key,
        show_tool_events=app.show_tool_events,
        live_agent_activity=app._live_agent_activity,
        recent_activity_events=list(app._recent_activity_events),
        system_prompt_chars=app._system_prompt_chars,
        merged_child_states=app._merge_live_agent_activity(
            app.current_session.child_states if app.current_session else [],
        ),
        artifact_store=app._current_artifact_store(),
        focused_artifact_id=app.focused_artifact_id,
    )

    from rotaris_core.tui.widgets.agent_status import AgentStatusPane

    try:
        screen = app.screen
        agent_pane = screen.query_one(AgentStatusPane)
    except (ScreenStackError, NoMatches):
        return

    from rotaris_core.tui.widgets.top_bar import TopBar

    try:
        top_bar = screen.query_one(TopBar)
    except NoMatches:
        pass
    else:
        top_bar.update_focus_badge(vm.focused_badge)

    from rotaris_core.tui.widgets.chat_panel import ChatPanel

    try:
        chat_panel = screen.query_one(ChatPanel)
    except NoMatches:
        pass
    else:
        transcript_events = vm.transcript_events
        if app.focused_agent_id is not None:
            filtered_events = []
            for event in transcript_events:
                role = event.get("role")
                if role in ("user", "system") or str(event.get("name", "")) == app.focused_agent_id:
                    filtered_events.append(event)
            transcript_events = filtered_events

            _, _, parent_of = app._get_agent_tree()
            path_parts = [app.focused_agent_id]
            curr = app.focused_agent_id
            while parent_of.get(curr):
                curr = parent_of[curr]
                path_parts.append(curr)

            path_parts.reverse()
            breadcrumb = "🔍 " + " › ".join(path_parts)
            chat_panel.set_breadcrumb(breadcrumb)
        else:
            # Tool events are only meaningful in focused (per-agent) view.
            transcript_events = [
                e for e in transcript_events if e.get("role") not in {"tool", "edit_diff"}
            ]
            chat_panel.set_breadcrumb(None)

        queued_prompts = []
        if app.focused_agent_id is None:
            from rotaris_core.core.prompt_types import PromptRegistry, QueuedStatus

            queued_prompts = [
                prompt
                for prompt in PromptRegistry().get_queued_prompts()
                if prompt.status is QueuedStatus.QUEUED
            ]

        placeholder_stream_agents = app._placeholder_stream_agents(transcript_events)
        tool_result_max_lines = 0
        tool_input_max_lines = 0
        if app.config is not None:
            tool_result_max_lines = app.config.display.tool_result_max_lines
            tool_input_max_lines = app.config.display.tool_input_max_lines
        stable_event_count = _first_placeholder_stream_index(
            transcript_events,
            placeholder_stream_agents,
        )
        chat_panel.set_transcript(
            transcript_events,
            placeholder_stream_agents=placeholder_stream_agents,
            live_stream_messages=app._live_stream_messages,
            queued_prompts=queued_prompts,
            focused_agent_id=app.focused_agent_id,
            show_reasoning=app.show_reasoning,
            show_tool_events=app.show_tool_events,
            show_tool_inputs=app.show_tool_inputs,
            tool_result_max_lines=tool_result_max_lines,
            tool_input_max_lines=tool_input_max_lines,
        )
        app._render_state.last_chat_event_count = stable_event_count
        app._render_state.last_chat_show_reasoning = app.show_reasoning
        app._render_state.chat_needs_full_rebuild = False
        app._render_state.last_queued_prompt_count = len(queued_prompts)

    agent_pane.update_agents(
        vm.child_states,
        list(app._recent_activity_events),
        show_activity_log=app.show_tool_events,
    )
    agent_pane.focused_agent_id = app.focused_agent_id
    agent_pane.refresh()

    from rotaris_core.tui.widgets.todo_pane import TodoPane

    try:
        todo_pane = screen.query_one(TodoPane)
    except NoMatches:
        return
    if vm.todo is None:
        todo_pane.todo = None
        todo_pane.refresh()
    else:
        todo_pane.update_todos(vm.todo, source=vm.todo_source)

    from rotaris_core.tui.widgets.info_pane import InfoPane

    try:
        info_pane = screen.query_one(InfoPane)
    except NoMatches:
        pass
    else:
        info_pane.update_info(warnings=vm.warnings_list, **vm.info_kwargs)

    from rotaris_core.tui.widgets.spinner import SpinnerWidget

    try:
        spinner = screen.query_one(SpinnerWidget)
    except NoMatches:
        pass
    else:
        spinner.set_active(vm.is_running)
        spinner.set_session_id(vm.session_id)

    from rotaris_core.tui.widgets.input_composer import InputComposer

    try:
        composer = screen.query_one(InputComposer)
    except NoMatches:
        pass
    else:
        composer.update_timer(app._run_timer.format_display())


def _first_placeholder_stream_index(
    transcript_events: list[dict[str, Any]],
    placeholder_stream_agents: set[str],
) -> int:
    if not placeholder_stream_agents:
        return len(transcript_events)
    for index, event in enumerate(transcript_events):
        if event.get("role") != "agent":
            continue
        if str(event.get("content", "")).strip():
            continue
        if str(event.get("name", "")).strip() in placeholder_stream_agents:
            return index
    return len(transcript_events)


def _render_transcript_event(
    app: Any,
    chat_panel: Any,
    event: dict[str, Any],
    placeholder_stream_agents: set[str],
    last_speaker_key: str | None,
) -> str | None:
    role = event.get("role", "")
    name = event.get("name", "")
    persona = event.get("persona", "")
    speaker_key = f"{role}:{name}:{persona}"
    hide_header = speaker_key == last_speaker_key and role in (
        "user",
        "agent",
        "system",
    )
    app._render_chat_event(
        chat_panel,
        event,
        placeholder_stream_agents,
        hide_header=hide_header,
    )
    return speaker_key if role in ("user", "agent", "system") else None
