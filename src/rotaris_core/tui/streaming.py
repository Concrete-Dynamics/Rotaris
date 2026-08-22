from __future__ import annotations

from typing import Any

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.sdk_text import content_is_internal as _sdk_content_is_internal
from rotaris_core.sdk_text import content_is_internal_deliberation, sanitize_visible_text


@traces(SWR.SWR_1217)
def extract_stream_text(chunk: object) -> tuple[str, bool]:
    """Return text delta plus whether the chunk contained reasoning/thinking data."""
    if isinstance(chunk, str):
        if content_is_internal_deliberation(chunk):
            return "", True
        return sanitize_visible_text(chunk), _content_is_internal(chunk)

    text_parts: list[str] = []
    has_reasoning = False

    for choice in getattr(chunk, "choices", []) or []:
        delta = getattr(choice, "delta", None)
        if delta is None:
            continue

        delta_text, delta_has_reasoning = _extract_visible_delta_text(delta)
        if delta_text:
            text_parts.append(delta_text)
        has_reasoning = has_reasoning or delta_has_reasoning

    return ("".join(text_parts), has_reasoning)


@traces(SWR.SWR_1012)
def extract_reasoning_text(chunk: object) -> str:
    """Return reasoning/thinking text content from a streaming chunk."""
    if isinstance(chunk, str):
        return ""

    reasoning_parts: list[str] = []

    for choice in getattr(chunk, "choices", []) or []:
        delta = getattr(choice, "delta", None)
        if delta is None:
            continue

        reasoning_parts.extend(_extract_reasoning_parts(delta))

    return "".join(reasoning_parts)


def _extract_visible_delta_text(delta: object) -> tuple[str, bool]:
    # When the delta carries tool calls, skip text content entirely — the raw
    # tool-call arguments are not human-readable text.
    if _get_field(delta, "tool_calls"):
        return "", False

    content = _get_field(delta, "content")
    has_reasoning = _has_reasoning(delta)
    delta_text_parts: list[str] = []

    for raw_part in _coerce_text_parts(content):
        cleaned, part_has_reasoning = _sanitize_stream_part(raw_part)
        if cleaned:
            delta_text_parts.append(cleaned)
        has_reasoning = has_reasoning or part_has_reasoning

    if not delta_text_parts:
        return "", has_reasoning

    separator = "\n" if isinstance(content, list) else ""
    return separator.join(delta_text_parts), has_reasoning


def _sanitize_stream_part(raw_part: str) -> tuple[str, bool]:
    if content_is_internal_deliberation(raw_part):
        return "", True

    cleaned = sanitize_visible_text(raw_part)
    if cleaned.strip():
        return cleaned, False
    if raw_part and not raw_part.strip():
        # Whitespace is content while a message streams (SWR-1217). A provider
        # sends the blank line between two Markdown blocks as a delta of its
        # own, and the space between two words the same way; dropping either
        # welds the pieces together, so the paragraph after a heading is parsed
        # as part of the heading. Returned raw rather than sanitised: on a
        # whitespace-only delta the tidy-up has nothing left to remove but the
        # indentation the line after it needs.
        return raw_part, False
    if _content_is_internal(raw_part):
        return "", True
    return "", False


def _extract_reasoning_parts(delta: object) -> list[str]:
    parts: list[str] = []
    parts.extend(_string_field_values(delta, "reasoning_content"))

    thinking_blocks = _get_field(delta, "thinking_blocks")
    if isinstance(thinking_blocks, list):
        for block in thinking_blocks:
            parts.extend(_first_non_empty_string_fields(block, "thinking", "text"))

    parts.extend(_string_field_values(delta, "reasoning"))

    reasoning_items = _get_field(delta, "reasoning_items")
    if isinstance(reasoning_items, list):
        for item in reasoning_items:
            parts.extend(_first_non_empty_string_fields(item, "text", "content"))

    return parts


def _string_field_values(payload: object, *names: str) -> list[str]:
    values: list[str] = []
    for name in names:
        value = _get_field(payload, name)
        if isinstance(value, str) and value:
            values.append(value)
    return values


def _first_non_empty_string_fields(payload: object, *names: str) -> list[str]:
    for name in names:
        value = _get_field(payload, name)
        if isinstance(value, str) and value:
            return [value]
    return []


def _has_reasoning(delta: object) -> bool:
    if _get_field(delta, "reasoning_content"):
        return True
    if _get_field(delta, "thinking_blocks"):
        return True
    if _get_field(delta, "reasoning"):
        return True
    return bool(_get_field(delta, "reasoning_items"))


def _content_is_internal(content: object) -> bool:
    return _sdk_content_is_internal(content)


def _get_field(payload: object, name: str) -> Any:
    if isinstance(payload, dict):
        return payload.get(name)
    return getattr(payload, name, None)


def _coerce_text_parts(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            parts.extend(_coerce_text_parts(item))
        return parts
    if isinstance(value, dict):
        text = value.get("text")
        if isinstance(text, str):
            return [text]
        return []

    text_attr = getattr(value, "text", None)
    if isinstance(text_attr, str):
        return [text_attr]
    return []
