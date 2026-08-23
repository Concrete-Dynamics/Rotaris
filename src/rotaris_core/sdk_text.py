from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable

_TOOL_CALL_SUBSTRINGS: tuple[str, ...] = (
    "<tool_call|>",
    "<|tool_call|>",
    "<|channel>",
    "<tool_call>",
    "</tool_call>",
    "<|im_start|>",
    "<|im_end|>",
)

_TOOL_CALL_MARKERS: tuple[str, ...] = (
    "<tool_call|>",
    "<|tool_call|>",
    "<|channel>",
    "<tool_call>",
    "</tool_call>",
)

_INLINE_INTERNAL_MARKERS: tuple[str, ...] = (
    "<channel|>",
    "<think>",
    "</think>",
    '<|">',
    '<|"|>',
    "<|'>",
)

_INTERNAL_EXACT_TOKENS = frozenset(
    {
        "thought",
        "<channel|>",
        "<think>",
        "</think>",
        '<|">',
        '<|"|>',
        "<|'>",
    },
)

_INTERNAL_DELIBERATION_PHRASES: tuple[str, ...] = (
    "i have been failing to",
    "the tool documentation specifies",
    "i will now proceed with",
    "wait, i should",
    "one more thing",
    "the error said",
    "so i will use",
    "actually, i'll use",
    "i just need to",
    "i need to find",
    "previously failed because",
)

_SCHEMA_IDENTIFIER_TOKENS: tuple[str, ...] = (
    "haet edit",
    "haet_edit",
    "hunk",
    "operation",
    "anchor_line_number",
    "end_anchor_line_number",
    "end_anchor",
    "insert_before",
    "insert_after",
    "input should be",
)

_INTERNAL_SEGMENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"<tool_call>.*?</tool_call>", re.DOTALL),
    re.compile(r"<\|channel\>.*?(?:<tool_call\|>|$)", re.DOTALL),
    re.compile(r"<\|tool_call\|>.*$", re.DOTALL),
    re.compile(r"<tool_call\|>.*$", re.DOTALL),
    re.compile(r"(^|\s)call:[A-Za-z_][A-Za-z0-9_-]*\{.*\}\s*$", re.DOTALL),
)


@traces(SWR.SWR_647)
def sanitize_visible_text(content: object) -> str:
    """Strip model-internal reasoning/tool-call markup from mixed text."""
    if not isinstance(content, str):
        return ""

    had_tool_call_markup = contains_tool_call_markup(content)
    cleaned = content
    for pattern in _INTERNAL_SEGMENT_PATTERNS:
        cleaned = pattern.sub("", cleaned)
    for marker in _TOOL_CALL_SUBSTRINGS:
        cleaned = cleaned.replace(marker, "")
    for marker in _INLINE_INTERNAL_MARKERS:
        cleaned = cleaned.replace(marker, "")

    # Both tidy-ups are anchored away from the start of a line: leading spaces
    # are Markdown structure — a nested list item, an indented code line — and
    # collapsing them flattens the list and unindents the code (SWR-1217). What
    # is left is what marker removal actually leaves behind: a doubled space
    # inside a sentence, and trailing space before a newline.
    cleaned = re.sub(r"(?<=\S)[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    if had_tool_call_markup:
        cleaned = cleaned.rstrip()
    return cleaned


def content_is_internal(content: object) -> bool:
    """Return True when content is only model-internal markup."""
    if not isinstance(content, str):
        return False

    stripped = content.strip()
    if not stripped:
        return False
    if stripped in _INTERNAL_EXACT_TOKENS:
        return True
    return sanitize_visible_text(content).strip() == ""


def content_is_internal_deliberation(content: object) -> bool:
    """Heuristically detect leaked tool-debugging/self-correction monologue."""
    if not isinstance(content, str):
        return False

    cleaned = sanitize_visible_text(content).strip()
    if not cleaned:
        return False

    lowered = cleaned.lower()
    phrase_hits = sum(1 for phrase in _INTERNAL_DELIBERATION_PHRASES if phrase in lowered)
    schema_hits = sum(1 for token in _SCHEMA_IDENTIFIER_TOKENS if token in lowered)
    quoted_schema_hits = sum(
        1
        for token in ("replace", "delete", "insert_before", "insert_after", "operation", "anchor")
        if f"`{token}`" in cleaned or f"'{token}'" in cleaned or f'"{token}"' in cleaned
    )
    return phrase_hits >= 2 and (schema_hits >= 2 or quoted_schema_hits >= 2)


def contains_tool_call_markup(content: object) -> bool:
    """Return True when text includes raw tool-call markup tokens."""
    if not isinstance(content, str):
        return False
    return any(marker in content for marker in _TOOL_CALL_MARKERS) or bool(
        _INTERNAL_SEGMENT_PATTERNS[-1].search(content),
    )


@traces(SWR.SWR_647, SWR.SWR_1829)
def visible_message_text(items: Iterable[Any] | None) -> str:
    """Reduce one SDK message's content parts to the text a person should read.

    Applies the two rules above part by part — drop leaked deliberation, strip
    internal markup from what is left — and joins what survives.  ``""`` when
    nothing does, which is a real answer: a message whose whole content was
    tool-call markup is not a message anybody should be shown.

    Lives here rather than in a host because two of them now need the same
    answer: the desktop puts it in the transcript and the event stream puts it on
    the wire (SWR-1829), and a foreign session is watched through the second
    while a local one is watched through the first.  Two implementations of
    "what did the agent say" would make those two views of one run disagree.
    """
    parts: list[str] = []
    for item in items or ():
        raw_text = getattr(item, "text", None)
        if not raw_text or content_is_internal_deliberation(raw_text):
            continue
        cleaned = sanitize_visible_text(raw_text).strip()
        if cleaned:
            parts.append(cleaned)
    return "\n".join(parts).strip()
