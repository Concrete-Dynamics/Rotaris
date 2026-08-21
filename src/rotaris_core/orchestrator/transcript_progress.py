"""Transcript extraction and stall/progress assessment.

Converts SDK conversation events into simple transcript dicts and classifies
whether a child agent produced substantive execution. Pure, dependency-light
logic carved out of ``scheduler`` so it can be exercised in isolation.
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass
from typing import Any

from rotaris_core.orchestrator.report import extract_final_response
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.sdk_text import (
    contains_tool_call_markup,
    content_is_internal_deliberation,
    sanitize_visible_text,
)

_HOUSEKEEPING_TOOL_NAMES = frozenset(
    {
        "todo",
        "thinktool",
        "think",
    },
)

#: Tools by which a child declares the run over. Kept apart from housekeeping
#: (SWR-2808): ending a run is a completion signal, not bookkeeping. Folding the
#: two together made the correct terminator strictly worse than omitting it — a
#: child that answered and stopped scored ``message_only`` and could be accepted,
#: while the same child that answered and called ``finish`` scored
#: ``housekeeping_only`` and had no acceptance path at all.
_TERMINAL_TOOL_NAMES = frozenset(
    {
        "finishtool",
        "finish",
    },
)


def _format_tool_counts(tool_names: tuple[str, ...] | list[str]) -> str:
    """Render tool calls as a compact count summary like ``8 (grep:5, glob:3)``.

    Avoids the historical ``tools=[grep, grep, grep, glob, ...]`` noise where the
    same tool repeated many times dominated the log line for long-running agents.
    """
    if not tool_names:
        return "0 (none)"
    counts: dict[str, int] = {}
    for name in tool_names:
        counts[name] = counts.get(name, 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    breakdown = ", ".join(f"{name}:{count}" for name, count in ordered)
    return f"{len(tool_names)} ({breakdown})"


@dataclass(frozen=True)
class ProgressAssessment:
    """Classify whether a child produced substantive execution."""

    outcome: str
    has_substantive_tool_call: bool
    has_housekeeping_tool_call: bool
    has_user_visible_message: bool
    has_reasoning_only: bool
    has_suppressed_tool_call_markup: bool
    final_response: str | None
    tool_names: tuple[str, ...]
    has_terminal_tool_call: bool = False


@traces(SWR.SWR_547, SWR.SWR_548, SWR.SWR_549, SWR.SWR_2808)
class TranscriptProgressMixin:
    """Transcript extraction + progress classification for the scheduler."""

    _TRANSCRIPT_CACHE_ATTR = "_rotaris_transcript_cache"

    def _get_transcript_for_conversation(self, conversation: Any) -> list[dict[str, Any]]:
        """Return the extracted transcript for ``conversation``, incrementally.

        Caches a per-conversation list of already-extracted events so each
        scheduler iteration only converts the new suffix of
        ``conversation.state.events`` rather than re-walking the whole
        history. The cache is invalidated if the events list shrinks
        (e.g. after compaction).
        """
        events_obj = getattr(getattr(conversation, "state", None), "events", None)
        events: list[object] = list(events_obj) if events_obj is not None else []
        cache = getattr(conversation, self._TRANSCRIPT_CACHE_ATTR, None)
        if (
            not isinstance(cache, dict)
            or not isinstance(cache.get("events"), list)
            or cache.get("len", 0) > len(events)
        ):
            cache = {"len": 0, "events": []}
        if cache["len"] < len(events):
            new_extracted = self._extract_transcript_events(events[cache["len"] :])
            cache["events"].extend(new_extracted)
            cache["len"] = len(events)
            with contextlib.suppress(Exception):
                setattr(conversation, self._TRANSCRIPT_CACHE_ATTR, cache)
        return list(cache["events"])

    def _extract_transcript_events(self, events: list[object]) -> list[dict[str, Any]]:
        """Convert SDK Event objects to simple dicts for summary agent."""
        extracted: list[dict[str, Any]] = []
        for event in events:
            if hasattr(event, "llm_message") and event.llm_message:
                parts: list[str] = []
                suppressed_tool_call_markup = False
                reasoning_only = bool(
                    getattr(event.llm_message, "reasoning_content", None)
                    or getattr(event.llm_message, "responses_reasoning_item", None)
                    or getattr(event.llm_message, "thinking_blocks", None),
                )
                for content in getattr(event.llm_message, "content", []) or []:
                    text = getattr(content, "text", None)
                    if text is not None:
                        raw_text = str(text)
                        suppressed_tool_call_markup = (
                            suppressed_tool_call_markup or contains_tool_call_markup(raw_text)
                        )
                        if content_is_internal_deliberation(raw_text):
                            reasoning_only = True
                            continue
                        cleaned = sanitize_visible_text(raw_text).strip()
                        if cleaned:
                            parts.append(cleaned)
                payload: dict[str, Any] = {
                    "role": getattr(event, "source", "unknown"),
                    "content": "\n".join(parts),
                }
                if reasoning_only and not any(part.strip() for part in parts):
                    payload["reasoning_only"] = True
                if suppressed_tool_call_markup:
                    payload["suppressed_tool_call_markup"] = True
                extracted.append(payload)
                continue

            if hasattr(event, "tool_name"):
                extracted.append(
                    {
                        "role": "tool",
                        "tool_name": event.tool_name,
                        "content": str(getattr(event, "action", "")),
                    },
                )

        return extracted

    def _assess_transcript_progress(
        self,
        transcript: list[dict[str, Any]],
    ) -> ProgressAssessment:
        has_substantive_tool_call = False
        has_housekeeping_tool_call = False
        has_terminal_tool_call = False
        has_user_visible_message = False
        has_reasoning_only = False
        has_suppressed_tool_call_markup = False
        tool_names: list[str] = []

        for event in transcript:
            role = str(event.get("role", "")).lower()
            tool_name = event.get("tool_name")
            if isinstance(tool_name, str) and tool_name:
                normalized = tool_name.strip().lower()
                tool_names.append(normalized)
                if normalized in _TERMINAL_TOOL_NAMES:
                    has_terminal_tool_call = True
                elif normalized in _HOUSEKEEPING_TOOL_NAMES:
                    has_housekeeping_tool_call = True
                else:
                    has_substantive_tool_call = True
                continue

            if event.get("reasoning_only"):
                has_reasoning_only = True
            if event.get("suppressed_tool_call_markup"):
                has_suppressed_tool_call_markup = True

            if role in {"assistant", "agent"} and str(event.get("content", "")).strip():
                has_user_visible_message = True

        if has_substantive_tool_call:
            outcome = "executed_work"
        elif has_terminal_tool_call and has_user_visible_message:
            # The child declared the run over *and* left something to hand back.
            # Distinct from housekeeping so route-aware acceptance (SWR-2809) has
            # something to key on; still recovery-eligible, so a premature finish
            # on an execution route is corrected and failed exactly as before.
            outcome = "answered"
        elif has_housekeeping_tool_call:
            outcome = "housekeeping_only"
        elif has_suppressed_tool_call_markup:
            outcome = "malformed_tool_attempt"
        elif has_user_visible_message:
            outcome = "message_only"
        else:
            outcome = "empty_stalled"

        return ProgressAssessment(
            outcome=outcome,
            has_substantive_tool_call=has_substantive_tool_call,
            has_housekeeping_tool_call=has_housekeeping_tool_call,
            has_user_visible_message=has_user_visible_message,
            has_reasoning_only=has_reasoning_only,
            has_suppressed_tool_call_markup=has_suppressed_tool_call_markup,
            final_response=extract_final_response(transcript),
            tool_names=tuple(tool_names),
            has_terminal_tool_call=has_terminal_tool_call,
        )
