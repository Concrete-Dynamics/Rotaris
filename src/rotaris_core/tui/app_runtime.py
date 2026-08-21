from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import logging

    from rotaris_core.session.state import SessionState
    from rotaris_core.tui.app import RotarisTuiApp


def tool_event_key(event: object) -> str | None:
    tool_call_id = str(getattr(event, "tool_call_id", "") or "").strip()
    if tool_call_id:
        return f"tool:{tool_call_id}"

    action_id = str(getattr(event, "action_id", "") or "").strip()
    if action_id:
        return f"action:{action_id}"

    tool_name = str(getattr(event, "tool_name", "") or getattr(event, "title", "") or "").strip()
    if tool_name:
        return f"name:{tool_name}"
    return None


def tool_event_label(event: object) -> str:
    tool_name = str(getattr(event, "tool_name", "") or "").strip()
    if tool_name:
        return tool_name.replace("_", " ")
    return str(getattr(event, "title", "") or "").strip()


def find_open_tool_event(
    app: RotarisTuiApp,
    transcript_events: list[dict[str, Any]],
    agent_name: str,
    tool_key: str | None,
    tool_label: str,
) -> dict[str, Any] | None:
    if tool_key is not None:
        cached = app._open_tool_events.get((agent_name, tool_key))
        if cached is not None and any(event is cached for event in transcript_events):
            return cached
        app._open_tool_events.pop((agent_name, tool_key), None)

    for entry in reversed(transcript_events):
        if entry.get("role") != "tool":
            continue
        if str(entry.get("name", "")) != agent_name:
            continue
        if tool_key is not None and str(entry.get("tool_event_key", "")) == tool_key:
            return entry
        if (
            tool_label
            and str(entry.get("tool_name", "")) == tool_label
            and not bool(entry.get("tool_terminal"))
        ):
            return entry
    return None


@traces(SWR.SWR_1084, SWR.SWR_1218)
def upsert_tool_transcript_event(
    app: RotarisTuiApp,
    transcript_events: list[dict[str, Any]],
    agent_name: str,
    event: object,
    update: dict[str, str],
) -> dict[str, Any]:
    key = tool_event_key(event)
    label = tool_event_label(event)
    phase = str(update["activity_phase"])
    icon = str(update["feed_icon"])
    text = str(update["feed_text"]).strip()
    replace_content = str(update.get("feed_replaces_content", "")).lower() == "true"
    is_terminal = phase in {"completed", "failed", "blocked"}
    is_success = phase == "completed"

    entry = find_open_tool_event(app, transcript_events, agent_name, key, label)
    if entry is None:
        entry = {
            "role": "tool",
            "name": agent_name,
            "icon": icon,
            "content": text or label or "Tool",
            "phase": phase,
            "tool_name": label,
            "tool_terminal": is_terminal,
        }
        if key is not None:
            entry["tool_event_key"] = key
        transcript_events.append(entry)
    else:
        previous_icon = str(entry.get("icon", ""))
        previous_phase = str(entry.get("phase", ""))
        previous_terminal = bool(entry.get("tool_terminal", False))
        entry["icon"] = icon
        entry["phase"] = phase
        entry["tool_terminal"] = is_terminal
        if key is not None:
            entry["tool_event_key"] = key
        if label and not str(entry.get("tool_name", "")):
            entry["tool_name"] = label

        current_text = str(entry.get("content", "")).strip()
        content_changed = False
        if text and (replace_content or not is_success or not current_text):
            if entry.get("content") != text:
                entry["content"] = text
                content_changed = True
        elif not current_text:
            fallback = label or "Tool"
            if entry.get("content") != fallback:
                entry["content"] = fallback
                content_changed = True
        if (
            content_changed
            or previous_icon != icon
            or previous_phase != phase
            or previous_terminal != is_terminal
        ):
            app._render_state.chat_needs_full_rebuild = True

    if key is not None:
        if is_terminal:
            app._open_tool_events.pop((agent_name, key), None)
        else:
            app._open_tool_events[(agent_name, key)] = entry

    return entry


def persist_ui_edit_diff(
    app: RotarisTuiApp,
    session: SessionState,
    *,
    agent_name: str,
    tool_entry: dict[str, Any] | None,
    event: object,
    logger: logging.Logger,
) -> None:
    if tool_entry is None:
        return

    observation = getattr(event, "observation", None)
    raw_diff = getattr(observation, "ui_diff", None)
    if not isinstance(raw_diff, dict):
        return

    from rotaris_core.edit_diff import EditDiffArtifact

    tool_name = str(tool_entry.get("tool_name", "") or getattr(event, "tool_name", "")).strip()
    current_tool_key = str(tool_entry.get("tool_event_key", "")).strip() or None
    diff_id = (
        f"{agent_name}:{current_tool_key}"
        if current_tool_key is not None
        else f"{agent_name}:{tool_name}:{len(session.ui_edit_diffs)}"
    )
    try:
        diff = EditDiffArtifact.model_validate(
            {
                **raw_diff,
                "diff_id": diff_id,
                "agent_name": agent_name,
                "tool_name": tool_name,
                "tool_event_key": current_tool_key,
            },
        )
    except Exception:  # noqa: BLE001
        logger.exception("Ignoring invalid UI edit diff payload for %s", agent_name)
        return

    payload = diff.model_dump(mode="json")
    for index, existing in enumerate(session.ui_edit_diffs):
        if str(existing.get("diff_id", "")) != diff_id:
            continue
        if existing != payload:
            session.ui_edit_diffs[index] = payload
            app._render_state.chat_needs_full_rebuild = True
        return

    session.ui_edit_diffs.append(payload)
    app._render_state.chat_needs_full_rebuild = True


def request_widget_refresh(app: RotarisTuiApp) -> None:
    now = time.monotonic()
    if now - app._render_state.last_widget_refresh_at >= app._min_widget_refresh_interval:
        app._refresh_widgets()
        return
    if app._render_state.refresh_scheduled:
        return
    delay = max(
        0.0,
        app._min_widget_refresh_interval - (now - app._render_state.last_widget_refresh_at),
    )
    app._render_state.refresh_scheduled = True
    app.set_timer(delay, app._flush_scheduled_widget_refresh)


def flush_scheduled_widget_refresh(app: RotarisTuiApp) -> None:
    app._render_state.refresh_scheduled = False
    app._refresh_widgets()


def placeholder_stream_agents(
    app: RotarisTuiApp,
    transcript_events: list[dict[str, Any]],
) -> set[str]:
    agents: set[str] = set()
    for event in transcript_events:
        if event.get("role") != "agent":
            continue
        if str(event.get("content", "")).strip():
            continue
        agent_name = str(event.get("name", "")).strip()
        if agent_name and agent_name in app._live_stream_messages:
            agents.add(agent_name)
    return agents


def render_live_stream_message(
    app: RotarisTuiApp,
    chat_panel: Any,
    stream: dict[str, Any],
    *,
    hide_header: bool = False,
) -> None:
    started_at = float(stream.get("thinking_started_at", 0.0) or 0.0)
    elapsed = (time.monotonic() - started_at) if started_at else None
    chat_panel.add_streaming_agent_message(
        str(stream.get("persona", "agent")),
        str(stream.get("content", "")),
        phase=str(stream.get("phase", "streaming")),
        reasoning=str(stream.get("reasoning", "")),
        show_reasoning=app.show_reasoning,
        elapsed_thinking=elapsed,
        stalled=bool(stream.get("stalled", False)),
        hide_header=hide_header,
    )


def render_chat_event(
    app: RotarisTuiApp,
    chat_panel: Any,
    event: dict[str, Any],
    *,
    placeholder_agents: set[str] | None = None,
    hide_header: bool = False,
) -> None:
    role = event.get("role")
    content = str(event.get("content", ""))
    if role == "user":
        chat_panel.add_user_message(content, hide_header=hide_header)
    elif role == "agent":
        agent_name = str(event.get("name", "agent"))
        if not content:
            if placeholder_agents and agent_name in placeholder_agents:
                stream = app._live_stream_messages.get(agent_name)
                if stream is not None:
                    render_live_stream_message(
                        app,
                        chat_panel,
                        stream,
                        hide_header=hide_header,
                    )
            return
        reasoning = str(event.get("reasoning", ""))
        if reasoning:
            chat_panel.add_reasoning_block(
                reasoning,
                event.get("thinking_duration"),
                show_reasoning=app.show_reasoning,
            )
        chat_panel.add_agent_message(agent_name, content, hide_header=hide_header)
    elif role == "thinking":
        if not content:
            return
        chat_panel.add_reasoning_block(
            content,
            event.get("thinking_duration"),
            show_reasoning=app.show_reasoning,
        )
    elif role == "child":
        chat_panel.add_child_spawn_message(
            str(event.get("name", "child")),
            str(event.get("persona", "")),
            content,
        )
    elif role == "tool":
        has_phase = "phase" in event
        if has_phase:
            if not app.show_tool_events:
                return
            max_lines = None
            if app.config is not None and app.config.display.tool_result_max_lines > 0:
                max_lines = app.config.display.tool_result_max_lines
            chat_panel.add_tool_event(
                str(event.get("icon", "")),
                content,
                str(event.get("phase", "tool")),
                max_lines=max_lines,
                kind="result",
            )
        else:
            if not app.show_tool_inputs:
                return
            max_lines = None
            if app.config is not None and app.config.display.tool_input_max_lines > 0:
                max_lines = app.config.display.tool_input_max_lines
            chat_panel.add_tool_event(
                str(event.get("icon", "")),
                content,
                "tool",
                max_lines=max_lines,
                kind="input",
            )
    elif role == "edit_diff":
        if not app.show_tool_events:
            return
        chat_panel.add_diff_block(event.get("diff", {}))
    elif role == "system":
        chat_panel.add_system_message(content, hide_header=hide_header)
    else:
        chat_panel.add_system_message(content, hide_header=hide_header)
