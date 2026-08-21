"""Compressor agent — internal context compression.

The Compressor is NOT a public persona. It must never be registered
with the SDK's register_agent. The only entry point is run_compressor(),
called exclusively by the Scheduler when context exceeds threshold.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable  # noqa: TC003 - Pydantic resolves this at runtime.
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from openhands.sdk.context.condenser.base import (
    CondensationRequirement,
    NoCondensationAvailableException,
    RollingCondenser,
)
from openhands.sdk.context.condenser.utils import get_total_token_count
from openhands.sdk.event.condenser import Condensation, CondensationSummaryEvent
from openhands.sdk.event.llm_convertible import ActionEvent, MessageEvent, ObservationEvent
from openhands.sdk.llm.llm import LLM  # noqa: TC002
from openhands.sdk.llm.message import Message, TextContent
from pydantic import Field

from rotaris_core.config.compression import resolve_compression_threshold
from rotaris_core.llm_threads import call_llm_detached
from rotaris_core.model_input import sanitize_completion_messages
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from openhands.sdk.context.view import View

    from rotaris_core.config.schema import RotarisConfig

_log = logging.getLogger(__name__)

COMPRESSOR_SYSTEM_PROMPT = """You are the Compressor agent. You will receive a sequence of
conversation turns representing prior agent work, often as action/observation pairs.

Compress the history into a concise but information-dense summary that preserves:
- every file path mentioned
- all tool calls and whether they succeeded or failed
- all decisions made and the rationale behind them
- every error message encountered
- the current state of progress / what the agent was last doing

You must output ONLY valid JSON matching exactly this schema:
{
  "compressed_history": "string — concise narrative of what happened",
  "files_touched": ["list of file paths mentioned"],
  "tool_calls_summary": "string — brief summary of tools used and results",
  "key_decisions": ["list of important decisions made"],
  "errors_encountered": ["list of error messages"],
  "current_state": "string — what the agent was last doing"
}

Do not add commentary. Do not wrap the JSON in markdown fences. Output ONLY valid JSON."""

_MAX_COMPRESS_INPUT_CHARS = 50_000
_MAX_FALLBACK_CHARS = 4_000
_CONDENSER_KEEP_FIRST_EVENTS = 2


def _has_condensed_history(events: Sequence[object]) -> bool:
    return any(isinstance(event, CondensationSummaryEvent) for event in events)


def _render_condensed_summary(payload: dict[str, Any]) -> str:
    sections: list[str] = []

    history = str(payload.get("compressed_history", "")).strip()
    if history:
        sections.append("Previous work summary:\n" + history)

    tool_calls_summary = str(payload.get("tool_calls_summary", "")).strip()
    if tool_calls_summary:
        sections.append("Tool activity:\n" + tool_calls_summary)

    current_state = str(payload.get("current_state", "")).strip()
    if current_state:
        sections.append("Current state:\n" + current_state)

    for label, key in (
        ("Files touched", "files_touched"),
        ("Key decisions", "key_decisions"),
        ("Errors encountered", "errors_encountered"),
    ):
        values = [item for item in payload.get(key, []) if isinstance(item, str) and item.strip()]
        if values:
            sections.append(label + ":\n- " + "\n- ".join(values))

    if not sections:
        return "Previous work summary unavailable. Continue from the remaining preserved context."

    return "\n\n".join(sections)


def _extract_transcript_events(events: list[object]) -> list[dict[str, Any]]:
    transcript: list[dict[str, Any]] = []

    for event in events:
        if isinstance(event, CondensationSummaryEvent):
            transcript.append({"role": "user", "content": event.summary})
            continue

        if isinstance(event, ActionEvent):
            transcript.append(
                {
                    "role": "tool",
                    "tool_name": event.tool_name,
                    "content": (
                        str(event.action) if event.action is not None else str(event.tool_call)
                    ),
                },
            )
            continue

        if isinstance(event, ObservationEvent):
            transcript.append(
                {
                    "role": "tool",
                    "tool_name": event.tool_name,
                    "content": str(event.observation),
                },
            )
            continue

        if isinstance(event, MessageEvent):
            content = Compressor._message_text_from_message(event.llm_message)
            transcript.append({"role": event.source, "content": content})
            continue

        llm_message = getattr(event, "llm_message", None)
        if llm_message is not None:
            content = Compressor._message_text_from_message(llm_message)
            transcript.append({"role": getattr(event, "source", "unknown"), "content": content})

    return transcript


@traces(SWR.SWR_1401, SWR.SWR_1402, SWR.SWR_1403, SWR.SWR_1404)
class RotarisCondenser(RollingCondenser):
    """OpenHands condenser that reuses Rotaris's Compressor output.

    Limits the number of compressions per agent lifetime to prevent quality
    degradation from repeated condensation (each compression loses information).
    After ``max_compressions`` compressions, further condensation is refused;
    the agent will instead receive a ``LLMContextWindowExceedError`` from the SDK.
    """

    llm: LLM
    threshold_tokens: int
    preserve_recent: int = 4
    keep_first: int = _CONDENSER_KEEP_FIRST_EVENTS
    chars_per_token: int = 4
    max_compressions: int = 3
    on_token_update: Callable[[int], None] | None = Field(default=None, exclude=True)
    _compression_count: int = 0

    def handles_condensation_requests(self) -> bool:
        return True

    def condensation_requirement(
        self,
        view: View,
        agent_llm: LLM | None = None,
    ) -> CondensationRequirement | None:
        if view.unhandled_condensation_request:
            return CondensationRequirement.HARD

        if agent_llm is None:
            return None

        if self._compression_count >= self.max_compressions:
            _log.warning(
                "Condenser: max compressions reached (%d/%d); refusing further condensation",
                self._compression_count,
                self.max_compressions,
            )
            return None

        from rotaris_core.tokens import get_last_prompt_token_count

        events = list(view.events)
        has_condensed_history = _has_condensed_history(events)

        # Prefer the server-reported prompt-token count from the agent LLM's
        # usage metrics — it is accurate for every model provider, including
        # custom vLLM endpoints where litellm's tokenizer database returns 0.
        total_tokens = None
        if not has_condensed_history:
            total_tokens = get_last_prompt_token_count(agent_llm)

        if total_tokens is None:
            # After a condensation summary lands in the view, the previous
            # server-reported prompt count is stale because it was measured
            # before the event window changed. Recompute from the current view.
            try:
                total_tokens = get_total_token_count(events, agent_llm)
            except Exception:
                _log.exception("Failed to count context tokens for condenser")
                total_tokens = 0

        # For custom/unknown models (e.g. vLLM endpoints with stream=True that
        # don't echo back usage stats in streaming chunks), both
        # get_last_prompt_token_count and get_total_token_count may return 0.
        # Fall back to a character-length estimate so compression still fires.
        if not total_tokens:
            from openhands.sdk.event.base import LLMConvertibleEvent as _LLMConv

            try:
                messages = _LLMConv.events_to_messages(events)
                total_chars = sum(
                    sum(len(getattr(part, "text", "") or "") for part in (msg.content or []))
                    for msg in messages
                )
            except Exception:
                total_chars = 0
            chars_per_token = max(self.chars_per_token, 1)
            total_tokens = total_chars // chars_per_token
            if total_tokens:
                _log.debug(
                    "Condenser token check (char-estimate): %d tokens "
                    "(threshold %d, events %d, chars %d)",
                    total_tokens,
                    self.threshold_tokens,
                    len(view.events),
                    total_chars,
                )

        if total_tokens <= 0 and len(events) > 0:
            _log.warning(
                "Condenser: token count is 0 despite %d events — all counting "
                "methods (LLM metrics, litellm tokenizer, char-estimate) returned "
                "0 or None. Context compression cannot fire. "
                "Check whether the model provider reports usage stats.",
                len(events),
            )

        _log.warning(
            "Condenser token check: %d tokens (threshold %d, events %d)",
            total_tokens,
            self.threshold_tokens,
            len(view.events),
        )

        if total_tokens > 0 and self.on_token_update is not None:
            self.on_token_update(total_tokens)

        if total_tokens >= self.threshold_tokens:
            return CondensationRequirement.SOFT
        return None

    def get_condensation(
        self,
        view: View,
        agent_llm: LLM | None = None,
    ) -> Condensation:
        del agent_llm

        forgetting_start, forgetting_end = self._condensation_window(view)
        forgotten_events = view.events[forgetting_start:forgetting_end]
        if not forgotten_events:
            _log.warning(
                "Condenser: no safe condensation window in %d events "
                "(keep_first=%d, preserve_recent=%d); skipping",
                len(view.events),
                self.keep_first,
                self.preserve_recent,
            )
            raise NoCondensationAvailableException("No safe event range available for condensation")

        if len(forgotten_events) <= 1:
            _log.warning(
                "Condenser: condensation window too small (%d event); skipping",
                len(forgotten_events),
            )
            raise NoCondensationAvailableException("Condensation window too small")

        transcript = _extract_transcript_events(list(forgotten_events))
        if not transcript:
            _log.warning(
                "Condenser: transcript empty after extracting %d events; skipping",
                len(forgotten_events),
            )
            raise NoCondensationAvailableException(
                "No transcript content available for condensation",
            )

        _log.info(
            "Condenser: compressing %d events (forgetting %d–%d of %d total)",
            len(forgotten_events),
            forgetting_start,
            forgetting_end,
            len(view.events),
        )
        payload = asyncio.run(self._compress_transcript(transcript))
        summary = _render_condensed_summary(payload)

        llm_response_id = self._new_llm_response_id()
        condensation = Condensation(
            forgotten_event_ids={event.id for event in forgotten_events},
            summary=summary,
            summary_offset=forgetting_start,
            llm_response_id=llm_response_id,
        )
        self._compression_count += 1
        _log.info(
            "Condenser: compression %d/%d complete — %d events replaced with summary (%d chars)",
            self._compression_count,
            self.max_compressions,
            len(forgotten_events),
            len(summary),
        )
        return condensation

    async def _compress_transcript(self, transcript: list[dict[str, Any]]) -> dict[str, Any]:
        compressor = Compressor(llm=self.llm, timeout=120.0)
        return await compressor.compress_context(transcript, preserve_recent=0)

    def _condensation_window(self, view: View) -> tuple[int, int]:
        forgetting_start = view.manipulation_indices.find_next(self.keep_first)
        naive_tail_start = max(forgetting_start, len(view.events) - max(self.preserve_recent, 0))
        forgetting_end = view.manipulation_indices.find_next(naive_tail_start)

        if forgetting_end <= forgetting_start < len(view.events):
            forgetting_end = view.manipulation_indices.find_next(forgetting_start + 1)

        return forgetting_start, forgetting_end

    def _new_llm_response_id(self) -> str:
        return f"rotaris-condenser-{uuid4()}"


@traces(
    SWR.SWR_1405,
    SWR.SWR_1406,
    SWR.SWR_1407,
    SWR.SWR_1408,
    SWR.SWR_1409,
    SWR.SWR_1410,
    SWR.SWR_1411,
    SWR.SWR_1412,
    SWR.SWR_1413,
    SWR.SWR_1432,
)
class Compressor:
    def __init__(self, llm: LLM, timeout: float = 120.0) -> None:
        self.llm = llm
        self.timeout = timeout

    async def compress_context(
        self,
        messages: list[dict[str, Any]],
        preserve_recent: int = 4,
    ) -> dict[str, Any]:
        preserve_count = max(preserve_recent, 0)
        preserved_messages = messages[-preserve_count:] if preserve_count else []
        compressible_messages = messages[:-preserve_count] if preserve_count else list(messages)

        if not compressible_messages:
            return {
                "compressed_history": "",
                "preserved_messages": preserved_messages,
                "files_touched": [],
                "tool_calls_summary": "No earlier messages required compression.",
                "key_decisions": [],
                "errors_encountered": [],
                "current_state": "Recent messages preserved verbatim.",
            }

        transcript = self._format_messages_for_compression(compressible_messages)

        async def _run() -> dict[str, Any]:
            base_prompt = (
                "Compress the following conversation history into the required JSON schema.\n"
                "Preserve all concrete file paths, tool results, decisions, errors, "
                "and current progress.\n\n"
                f"Conversation history to compress:\n{transcript}"
            )

            try:
                first_output = await self._request_completion(base_prompt)
                parsed = self._parse_compression_result(first_output)
            except Exception as first_error:
                _log.warning("Compressor first pass failed: %s", first_error)
                retry_prompt = (
                    f"{base_prompt}\n\n"
                    "Previous response could not be parsed as the required JSON object. "
                    f"Parse error: {first_error}\n"
                    "Return ONLY corrected JSON."
                )
                try:
                    second_output = await self._request_completion(retry_prompt)
                    parsed = self._parse_compression_result(second_output)
                except Exception as second_error:
                    _log.warning("Compressor retry failed: %s", second_error)
                    return self._fallback_compression(transcript, preserved_messages)

            parsed["preserved_messages"] = preserved_messages
            return parsed

        try:
            return await asyncio.wait_for(_run(), timeout=self.timeout)
        except TimeoutError:
            _log.warning("Compression timed out after %ss", self.timeout)
            return self._fallback_compression(transcript, preserved_messages)

    async def _request_completion(self, prompt: str) -> str:
        # Detached so a hung provider cannot outlive self.timeout and stall the
        # host's loop shutdown; see rotaris_core.llm_threads.
        response = await call_llm_detached(
            self.llm.completion,
            sanitize_completion_messages(
                [
                    Message(role="system", content=[TextContent(text=COMPRESSOR_SYSTEM_PROMPT)]),
                    Message(role="user", content=[TextContent(text=prompt)]),
                ],
            ),
        )
        return self._response_text(response)

    @staticmethod
    def _message_text_from_message(message: object) -> str:
        parts: list[str] = []
        for item in getattr(message, "content", []) or []:
            if isinstance(item, TextContent):
                parts.append(item.text)
                continue

            text = getattr(item, "text", None)
            if isinstance(text, str):
                parts.append(text)

        return "\n".join(part for part in parts if part).strip()

    def _response_text(self, response: object) -> str:
        message = getattr(response, "message", None)
        if message is None:
            raise ValueError("LLM response did not include a message")

        parts: list[str] = []
        for item in getattr(message, "content", []) or []:
            if isinstance(item, TextContent):
                parts.append(item.text)
            else:
                text = getattr(item, "text", None)
                if isinstance(text, str):
                    parts.append(text)

        text = "\n".join(part for part in parts if part).strip()
        if not text:
            raise ValueError("LLM response message was empty")
        return text

    def _format_messages_for_compression(self, messages: list[dict[str, Any]]) -> str:
        if not messages:
            return "No messages to compress."

        lines: list[str] = []
        for message in messages:
            role = str(message.get("role", "unknown"))
            tool_name = message.get("tool_name")
            content = self._message_content_text(message.get("content"))
            content = content.strip().replace("\n", " ")
            prefix = f"[{role}]"
            if tool_name:
                prefix = f"[{role}:{tool_name}]"
            lines.append(f"{prefix} {content}".rstrip())

        transcript = "\n".join(lines)
        if len(transcript) <= _MAX_COMPRESS_INPUT_CHARS:
            return transcript
        return transcript[: _MAX_COMPRESS_INPUT_CHARS - 1].rstrip() + "…"

    def _parse_compression_result(self, llm_output: str) -> dict[str, Any]:
        cleaned_output = llm_output.strip()
        if cleaned_output.startswith("```"):
            cleaned_output = re.sub(r"^```[a-zA-Z0-9_-]*\\n?", "", cleaned_output)
            cleaned_output = re.sub(r"\\n?```$", "", cleaned_output).strip()

        try:
            payload = json.loads(cleaned_output)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned_output, re.DOTALL)
            if match is None:
                raise
            payload = json.loads(match.group())

        if not isinstance(payload, dict):
            raise ValueError("Compression result must be a JSON object")

        compressed_history = payload.get("compressed_history", "")
        tool_calls_summary = payload.get("tool_calls_summary", "")
        current_state = payload.get("current_state", "")

        return {
            "compressed_history": compressed_history if isinstance(compressed_history, str) else "",
            "files_touched": self._string_list(payload.get("files_touched")),
            "tool_calls_summary": tool_calls_summary if isinstance(tool_calls_summary, str) else "",
            "key_decisions": self._string_list(payload.get("key_decisions")),
            "errors_encountered": self._string_list(payload.get("errors_encountered")),
            "current_state": current_state if isinstance(current_state, str) else "",
        }

    def _fallback_compression(
        self,
        raw_messages_text: str,
        preserved_messages: list[dict[str, Any]],
    ) -> dict[str, Any]:
        _log.warning("Using fallback compressor output")
        truncated = raw_messages_text[:_MAX_FALLBACK_CHARS].rstrip()
        if len(raw_messages_text) > _MAX_FALLBACK_CHARS:
            truncated += "…"
        return {
            "compressed_history": truncated,
            "preserved_messages": preserved_messages,
            "files_touched": [],
            "tool_calls_summary": (
                "Structured compression unavailable; raw transcript excerpt preserved."
            ),
            "key_decisions": [],
            "errors_encountered": [],
            "current_state": "Compression fallback generated after LLM output could not be parsed.",
        }

    def _message_content_text(self, content: object) -> str:
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = [self._message_content_text(item) for item in content]
            return " ".join(part for part in parts if part)
        if isinstance(content, dict):
            text = content.get("text")
            if isinstance(text, str):
                return text
            return json.dumps(content, ensure_ascii=False, sort_keys=True)
        return str(content)

    def _string_list(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, str)]


def build_compressor(config: RotarisConfig) -> Compressor:
    """Build a Compressor from config. NOT registered in agent registry."""
    from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model

    llm = load_llm_for_model(
        config,
        config.compressor.model,
        usage_id=build_llm_usage_id("compressor", model_name=config.compressor.model),
    )
    return Compressor(llm=llm, timeout=config.compressor.timeout_seconds)


def build_context_condenser(
    config: RotarisConfig,
    model_name: str,
    on_token_update: Callable[[int], None] | None = None,
) -> RotarisCondenser:
    """Build the SDK condenser used by task-running agents."""
    from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model

    persona_model = config.models.get(model_name)
    resolved_threshold = resolve_compression_threshold(config, persona_model)
    threshold = resolved_threshold.tokens
    threshold_source = resolved_threshold.source
    _log.warning(
        "Condenser threshold for model %s: %d [%s]",
        model_name,
        threshold,
        threshold_source,
    )

    # If the configured compressor model isn't in the models registry, fall back
    # to config.fallback_model so users don't need to set up a separate model
    # just for compression.
    compressor_model = config.compressor.model
    if config.models.get(compressor_model) is None and config.fallback_model:
        compressor_model = config.fallback_model

    llm = load_llm_for_model(
        config,
        compressor_model,
        usage_id=build_llm_usage_id(
            "condenser",
            model_name=compressor_model,
            scope=model_name,
        ),
    )
    return RotarisCondenser(
        llm=llm,
        threshold_tokens=threshold,
        preserve_recent=config.compressor.preserve_recent_turns,
        chars_per_token=config.compressor.chars_per_token,
        on_token_update=on_token_update,
    )


async def run_compressor(
    config: RotarisConfig,
    messages: list[dict[str, Any]],
    preserve_recent: int | None = None,
) -> dict[str, Any]:
    """Run the internal compressor for over-threshold conversation history."""
    compressor = build_compressor(config)
    preserve_count = (
        config.compressor.preserve_recent_turns if preserve_recent is None else preserve_recent
    )
    return await compressor.compress_context(messages, preserve_recent=preserve_count)
