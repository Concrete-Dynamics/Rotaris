from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.sdk_text import content_is_internal_deliberation, sanitize_visible_text
from rotaris_core.tools.terminal_outcome import classify_terminal_observation

_MAX_TEXT_CHARS = 90
_TOOL_SUCCESS_STATUSES = {"completed", "done", "ok", "success", "succeeded"}
_TOOL_FAILURE_STATUSES = {"blocked", "cancelled", "error", "failed"}
_TOOL_SUCCESS_ICON = "✓"


@traces(SWR.SWR_1009, SWR.SWR_1218)
def describe_sdk_event(event: object) -> dict[str, str] | None:
    """Map OpenHands SDK events to lightweight TUI activity updates."""
    from openhands.sdk.event.acp_tool_call import ACPToolCallEvent
    from openhands.sdk.event.condenser import Condensation, CondensationRequest
    from openhands.sdk.event.conversation_error import ConversationErrorEvent
    from openhands.sdk.event.hook_execution import HookExecutionEvent
    from openhands.sdk.event.llm_convertible.action import ActionEvent
    from openhands.sdk.event.llm_convertible.message import MessageEvent
    from openhands.sdk.event.llm_convertible.observation import (
        AgentErrorEvent,
        ObservationEvent,
        UserRejectObservation,
    )

    if isinstance(event, ActionEvent):
        detail = _summarize_action(event, truncate=True)
        feed_detail = _summarize_action(event, truncate=False)
        tool_label = event.tool_name.replace("_", " ")
        return {
            "activity_phase": "tool",
            "activity_icon": "ANIMATED_TOOL",
            "activity_text": detail,
            "feed_icon": "ANIMATED_TOOL",
            "feed_text": f"{tool_label}: {feed_detail}",
        }

    if isinstance(event, CondensationRequest):
        return describe_compression_event("start")

    if isinstance(event, Condensation):
        return describe_compression_event("done")

    if isinstance(event, ObservationEvent):
        tool_label = event.tool_name.replace("_", " ")
        observation = getattr(event, "observation", None)
        result_text = _observation_text(observation)
        outcome = _terminal_outcome_for_event(event.tool_name, observation)
        if outcome is not None and outcome.kind in {
            "shell_failure",
            "timeout",
            "invalid_request",
            "execution_error",
        }:
            summary = outcome.summary or result_text or tool_label
            return {
                "activity_phase": "failed",
                "activity_icon": "✗",
                "activity_text": _truncate(summary),
                "feed_icon": "✗",
                "feed_text": result_text or summary,
                "feed_replaces_content": "true",
            }
        if outcome is not None and outcome.kind in {"suspicious_success", "soft_pause"}:
            summary = outcome.summary or result_text or tool_label
            return {
                "activity_phase": "blocked",
                "activity_icon": "!",
                "activity_text": _truncate(summary),
                "feed_icon": "!",
                "feed_text": result_text or summary,
                "feed_replaces_content": "true",
            }
        update = {
            "activity_phase": "completed",
            "activity_icon": _TOOL_SUCCESS_ICON,
            "activity_text": tool_label,
            "feed_icon": _TOOL_SUCCESS_ICON,
            "feed_text": result_text or tool_label,
        }
        if result_text:
            update["feed_replaces_content"] = "true"
        return update

    if isinstance(event, UserRejectObservation):
        tool_label = event.tool_name.replace("_", " ")
        reason = _truncate(event.rejection_reason)
        return {
            "activity_phase": "blocked",
            "activity_icon": "✗",
            "activity_text": f"{tool_label} blocked: {reason}",
            "feed_icon": "✗",
            "feed_text": f"{tool_label} blocked: {reason}",
        }

    if isinstance(event, AgentErrorEvent):
        return {
            "activity_phase": "failed",
            "activity_icon": "✗",
            "activity_text": _truncate(event.error),
            "feed_icon": "✗",
            "feed_text": _truncate(event.error),
        }

    if isinstance(event, ACPToolCallEvent):
        title = _truncate(event.title)
        status = str(event.status or "running").lower()
        is_error = bool(getattr(event, "is_error", False))
        if is_error or status in _TOOL_FAILURE_STATUSES:
            return {
                "activity_phase": "failed",
                "activity_icon": "✗",
                "activity_text": f"{title} failed",
                "feed_icon": "✗",
                "feed_text": f"{title} failed",
            }
        if status in _TOOL_SUCCESS_STATUSES:
            return {
                "activity_phase": "completed",
                "activity_icon": _TOOL_SUCCESS_ICON,
                "activity_text": title,
                "feed_icon": _TOOL_SUCCESS_ICON,
                "feed_text": title,
            }
        return {
            "activity_phase": "tool",
            "activity_icon": "ANIMATED_TOOL",
            "activity_text": title,
            "feed_icon": "ANIMATED_TOOL",
            "feed_text": title,
        }

    if isinstance(event, HookExecutionEvent):
        tool_label = event.tool_name.replace("_", " ") if event.tool_name else event.hook_event_type
        status = "blocked" if event.blocked else ("failed" if not event.success else "ran")
        return {
            "activity_phase": "hook",
            "activity_icon": "[HOOK]",
            "activity_text": f"Hook {status}: {tool_label}",
            "feed_icon": "[HOOK]",
            "feed_text": f"Hook {status}: {tool_label}",
        }

    if isinstance(event, ConversationErrorEvent):
        detail = _truncate(f"{event.code}: {event.detail}")
        return {
            "activity_phase": "failed",
            "activity_icon": "✗",
            "activity_text": detail,
            "feed_icon": "✗",
            "feed_text": detail,
        }

    if isinstance(event, MessageEvent) and event.source == "agent":
        tool_call_name = _message_tool_call_name(event.llm_message)
        if tool_call_name is not None:
            tool_label = tool_call_name.replace("_", " ")
            return {
                "activity_phase": "tool",
                "activity_icon": "ANIMATED_TOOL",
                "activity_text": f"Calling {tool_label}",
                "feed_icon": "ANIMATED_TOOL",
                "feed_text": f"Calling {tool_label}",
            }

        message_text = _message_text(event.llm_message.content)
        if message_text:
            preview = _truncate(message_text)
            return {
                "activity_phase": "completed",
                "activity_icon": _TOOL_SUCCESS_ICON,
                "activity_text": "Response ready",
                "feed_icon": _TOOL_SUCCESS_ICON,
                "feed_text": preview,
            }

        if event.reasoning_content or event.thinking_blocks:
            return {
                "activity_phase": "thinking",
                "activity_icon": "ANIMATED_THINKING",
                "activity_text": "Thinking...",
                "feed_icon": "ANIMATED_THINKING",
                "feed_text": "Thinking...",
            }

    if getattr(event, "event_type", None) == "compression":
        phase = getattr(event, "phase", "start")
        agent_name = getattr(event, "agent_name", "")
        return describe_compression_event(str(phase), str(agent_name))

    return None


def _terminal_outcome_for_event(tool_name: str, observation: object | None) -> Any | None:
    normalized = tool_name.strip().lower().replace(" ", "_")
    if normalized not in {"terminal", "bash"} or observation is None:
        return None
    return classify_terminal_observation(observation)


def describe_compression_event(phase: str, agent_name: str = "") -> dict[str, str]:
    if phase == "done":
        text = "Context compressed"
        icon = ""
        feed_icon = ""
    else:
        text = "Compressing context…"
        icon = "[COMP]"
        feed_icon = "[COMP]"

    feed_prefix = f"{agent_name}: " if agent_name else ""
    activity_phase = "thinking" if phase == "done" else "compressing"
    return {
        "activity_phase": activity_phase,
        "activity_icon": icon,
        "activity_text": text,
        "feed_icon": feed_icon,
        "feed_text": f"{feed_prefix}{text}",
    }


def _summarize_action(event: Any, *, truncate: bool) -> str:
    terminal_command = _terminal_command(event)
    if terminal_command is not None:
        text = f"$ {terminal_command}" if terminal_command else "$ [empty command]"
        action = getattr(event, "action", None)
        if action is not None:
            if getattr(action, "is_input", False):
                text += " (input)"
            timeout = getattr(action, "timeout", None)
            if timeout is not None:
                timeout_str = f"{timeout:g}s"
                text += f" [timeout: {timeout_str}]"
            if getattr(action, "reset", False):
                text += " [reset]"
        return _truncate(text) if truncate else _normalize(text)

    if event.summary:
        summary = str(event.summary)
        return _truncate(summary) if truncate else _normalize(summary)

    tool_label = str(event.tool_name).replace("_", " ")
    action = getattr(event, "action", None)
    if action is not None:
        try:
            arguments = action.model_dump(exclude_none=True)
        except AttributeError:
            arguments = {}
        if isinstance(arguments, dict):
            arguments = {
                k: v for k, v in arguments.items() if k not in {"tool_name", "tool_call_id"}
            }
            if arguments:
                first_value = next(iter(arguments.values()))
                text = f"{tool_label}: {first_value}"
                return _truncate(text) if truncate else _normalize(text)

    return f"Running {tool_label}"


def _message_text(content: Sequence[object]) -> str:
    parts: list[str] = []
    for item in content:
        raw_text = getattr(item, "text", None)
        if content_is_internal_deliberation(raw_text):
            continue
        cleaned = sanitize_visible_text(raw_text).strip()
        if cleaned:
            parts.append(cleaned)
    return " ".join(parts)


def _observation_text(observation: object | None) -> str:
    if observation is None:
        return ""

    content = getattr(observation, "to_llm_content", None)
    if content is None:
        content = getattr(observation, "content", None)
    if not isinstance(content, Sequence) or isinstance(content, str):
        return ""

    parts: list[str] = []
    for item in content:
        raw_text = getattr(item, "text", item if isinstance(item, str) else None)
        if content_is_internal_deliberation(raw_text):
            continue
        cleaned = sanitize_visible_text(raw_text).strip()
        if cleaned:
            parts.append(cleaned)
    return "\n".join(parts)


def _message_tool_call_name(message: Any) -> str | None:
    tool_calls = getattr(message, "tool_calls", None)
    if isinstance(tool_calls, Sequence):
        for tool_call in tool_calls:
            tool_name = getattr(tool_call, "name", None)
            if isinstance(tool_name, str) and tool_name.strip():
                return tool_name.strip()

    content = getattr(message, "content", None)
    if not isinstance(content, Sequence):
        return None

    for item in content:
        item_type = str(getattr(item, "type", "") or "").lower()
        if item_type not in {"tool_use", "tool_call"}:
            continue

        tool_name = getattr(item, "name", None)
        if isinstance(tool_name, str) and tool_name.strip():
            return tool_name.strip()

    return None


def _truncate(text: str) -> str:
    normalized = _normalize(text)
    if len(normalized) <= _MAX_TEXT_CHARS:
        return normalized
    return normalized[: _MAX_TEXT_CHARS - 1].rstrip() + "…"


def _normalize(text: str) -> str:
    return " ".join(text.split())


def _terminal_command(event: Any) -> str | None:
    tool_name = str(getattr(event, "tool_name", ""))
    if tool_name != "terminal":
        return None

    action = getattr(event, "action", None)
    command = getattr(action, "command", None)
    if isinstance(command, str):
        return command
    return None
