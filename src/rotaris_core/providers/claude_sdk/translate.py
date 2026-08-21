"""Claude Agent SDK messages → Rotaris's own events (SWR-779).

This module is the boundary. It is deliberately **structural**: it inspects the
attributes a message carries rather than importing the SDK's classes and running
``isinstance`` against them. Two reasons, both practical.

First, it makes translation a pure function over plain objects, so the whole
event vocabulary can be tested without a Claude Code install or a live session.
Second, the Agent SDK adds message and block types between releases; a structural
reader ignores a shape it does not know instead of raising in the middle of a
run, which is the right failure mode for a translator that sits between a model
and a user's workspace.

An unrecognised message translates to no events at all. That is not an error —
it is the contract.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

from rotaris_core.providers.claude_sdk.events import (
    AssistantText,
    RunFinished,
    SessionStarted,
    TextDelta,
    ThinkingDelta,
    ThinkingText,
    ToolCalled,
    ToolInputDelta,
    ToolResulted,
    ToolStarted,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.providers.claude_sdk.events import AgentEvent

_UNSET = object()


@traces(SWR.SWR_779)
def translate_message(message: object) -> list[AgentEvent]:
    """Return the Rotaris events one Agent SDK message carries.

    The order of the checks matters: partial stream events are the most frequent
    message by far, and a ``ResultMessage`` must be recognised before the generic
    content-bearing shapes because it also carries a ``result`` payload.
    """
    stream_event = getattr(message, "event", _UNSET)
    if isinstance(stream_event, Mapping):
        return _translate_stream_event(stream_event)

    if hasattr(message, "num_turns") and hasattr(message, "subtype"):
        return [_translate_result(message)]

    if hasattr(message, "subtype") and hasattr(message, "data"):
        return _translate_system(message)

    content = getattr(message, "content", _UNSET)
    if content is not _UNSET:
        return _translate_content(content)

    return []


def _translate_stream_event(event: Mapping[str, Any]) -> list[AgentEvent]:
    """Translate one raw streaming event (``include_partial_messages``)."""
    event_type = event.get("type")

    if event_type == "content_block_start":
        block = event.get("content_block") or {}
        if isinstance(block, Mapping) and block.get("type") == "tool_use":
            return [
                ToolStarted(
                    call_id=str(block.get("id") or ""),
                    tool_name=str(block.get("name") or ""),
                ),
            ]
        return []

    if event_type == "content_block_delta":
        delta = event.get("delta") or {}
        if not isinstance(delta, Mapping):
            return []
        delta_type = delta.get("type")
        if delta_type == "text_delta":
            return [TextDelta(text=str(delta.get("text") or ""))]
        if delta_type == "thinking_delta":
            return [ThinkingDelta(text=str(delta.get("thinking") or ""))]
        if delta_type == "input_json_delta":
            return [
                ToolInputDelta(
                    # The index is all a raw delta carries; the completed
                    # ``ToolCalled`` is what anyone acting on arguments must use.
                    call_id=str(event.get("index", "")),
                    partial_json=str(delta.get("partial_json") or ""),
                ),
            ]
        return []

    return []


def _translate_system(message: object) -> list[AgentEvent]:
    """Translate the SDK's ``system`` messages; only ``init`` is interesting."""
    if str(getattr(message, "subtype", "")) != "init":
        return []
    data = getattr(message, "data", None)
    if not isinstance(data, Mapping):
        data = {}
    raw_tools = data.get("tools")
    tools = tuple(str(name) for name in raw_tools) if isinstance(raw_tools, list) else ()
    return [
        SessionStarted(
            session_id=str(data.get("session_id") or ""),
            model=str(data.get("model") or ""),
            tools=tools,
        ),
    ]


def _translate_result(message: object) -> AgentEvent:
    usage = getattr(message, "usage", None)
    cost = getattr(message, "total_cost_usd", None)
    return RunFinished(
        subtype=str(getattr(message, "subtype", "") or ""),
        text=str(getattr(message, "result", "") or ""),
        is_error=bool(getattr(message, "is_error", False)),
        session_id=str(getattr(message, "session_id", "") or ""),
        num_turns=int(getattr(message, "num_turns", 0) or 0),
        total_cost_usd=float(cost) if isinstance(cost, int | float) else None,
        usage=dict(usage) if isinstance(usage, Mapping) else {},
    )


def _translate_content(content: object) -> list[AgentEvent]:
    """Translate the content blocks of a completed assistant or user message."""
    if isinstance(content, str):
        return [AssistantText(text=content)] if content.strip() else []
    if not isinstance(content, list):
        return []

    events: list[AgentEvent] = []
    for block in content:
        events.extend(_translate_block(block))
    return events


def _translate_block(block: object) -> list[AgentEvent]:
    if isinstance(block, Mapping):
        block = _MappingBlock(block)

    tool_use_id = getattr(block, "tool_use_id", _UNSET)
    if tool_use_id is not _UNSET:
        return [
            ToolResulted(
                call_id=str(tool_use_id or ""),
                content=_render_tool_result(getattr(block, "content", None)),
                is_error=bool(getattr(block, "is_error", False)),
            ),
        ]

    tool_input = getattr(block, "input", _UNSET)
    if tool_input is not _UNSET and hasattr(block, "name"):
        return [
            ToolCalled(
                call_id=str(getattr(block, "id", "") or ""),
                tool_name=str(getattr(block, "name", "") or ""),
                arguments=dict(tool_input) if isinstance(tool_input, Mapping) else {},
            ),
        ]

    thinking = getattr(block, "thinking", _UNSET)
    if thinking is not _UNSET:
        text = str(thinking or "")
        return [ThinkingText(text=text)] if text.strip() else []

    text_value = getattr(block, "text", _UNSET)
    if text_value is not _UNSET:
        text = str(text_value or "")
        return [AssistantText(text=text)] if text.strip() else []

    return []


class _MappingBlock:
    """Attribute view over a dict-shaped content block.

    The SDK hands back dataclass blocks, but a tool result's nested content is
    plain JSON, and some transports round-trip blocks as dicts. Reading both
    through one accessor keeps :func:`_translate_block` free of shape checks.
    """

    __slots__ = ("_data",)

    def __init__(self, data: Mapping[str, Any]) -> None:
        self._data = data

    def __getattr__(self, name: str) -> Any:
        try:
            return self._data[name]
        except KeyError as exc:  # pragma: no cover - defensive
            raise AttributeError(name) from exc


def _render_tool_result(content: object) -> str:
    """Flatten a tool result payload into the text Claude was shown."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, Mapping):
        text = content.get("text")
        return str(text) if text is not None else _dump(content)
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            rendered = _render_tool_result(item)
            if rendered:
                parts.append(rendered)
        return "\n".join(parts)
    text_attr = getattr(content, "text", None)
    if text_attr is not None:
        return str(text_attr)
    return str(content)


def _dump(value: Mapping[str, Any]) -> str:
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return str(value)


__all__ = ["translate_message"]
