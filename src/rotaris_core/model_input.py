from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import random
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openhands.sdk.llm.message import TextContent

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_TOOL_DESCRIPTION_PATTERNS = (
    re.compile(r"(?im)^\s*#+\s*(available\s+)?tools\b"),
    re.compile(r"(?im)^\s*###\s*tools\s+overview\b"),
    re.compile(r"(?im)^\s*-\s*`[^`]+`\s+[—-]\s+.*\btool\b"),
    re.compile(r"(?im)\[\[ROTARIS:TOOLS_SECTION\]\]"),
)

# Patterns that indicate a raw JSON parse error in tool output that could
# corrupt LLM request serialization if fed back verbatim.
_DANGEROUS_ERROR_PATTERNS = (
    re.compile(r"Expecting property name enclosed in double quotes"),
    re.compile(r"Expecting value"),
    re.compile(r"Expecting ':' delimiter"),
    re.compile(r"Extra data"),
    re.compile(r"Invalid control character"),
    re.compile(r"Unterminated string"),
    re.compile(r"unparseable JSON"),
)

_SANITIZED_ERROR_PLACEHOLDER = (
    "[Tool call arguments were malformed — the error has been sanitized to prevent "
    "request corruption. The agent should retry with corrected JSON.]"
)


@dataclass(frozen=True, slots=True)
class ModelInputContext:
    session_dir: str | None = None
    actor: str | None = None
    model: str | None = None
    purpose: str | None = None


_MODEL_INPUT_CONTEXT: contextvars.ContextVar[ModelInputContext | None] = contextvars.ContextVar(
    "rotaris_model_input_context",
    default=None,
)

# Fallback model name for _ensure_reasoning_content when no model_input_context
# is active (e.g. parent-resume paths that bypass child_run's context manager).
# Set by wrap_llm_completion on every wrapped LLM call.
_last_known_model: str | None = None


@dataclass(frozen=True, slots=True)
class SanitizationResult:
    messages: list[Any]
    dropped_stale_system_messages: int
    dropped_stale_tool_descriptions: int
    input_messages_before: int
    input_messages_after: int

    @property
    def changed(self) -> bool:
        return (
            self.dropped_stale_system_messages > 0
            or self.dropped_stale_tool_descriptions > 0
            or self.input_messages_before != self.input_messages_after
        )


def _looks_like_json_parse_error(text: str) -> bool:
    """Return True if text contains a raw JSON parse error that could corrupt LLM requests."""
    if not text:
        return False
    return any(pattern.search(text) for pattern in _DANGEROUS_ERROR_PATTERNS)


def sanitize_message_content(message: Any) -> Any:
    """Sanitize a single message, redacting dangerous tool-error content.

    Returns the message (possibly modified) if it's an object with mutable
    content, or the original value for immutable/unsupported types.
    """
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str) and _looks_like_json_parse_error(content):
            _log.debug("Sanitizing tool-error content in dict message")
            return {**message, "content": _SANITIZED_ERROR_PLACEHOLDER}
        return message

    content = getattr(message, "content", None)
    if content is None:
        return message

    if isinstance(content, str) and _looks_like_json_parse_error(content):
        _log.debug("Sanitizing tool-error content in message object")
        try:
            return message.model_copy(update={"content": _SANITIZED_ERROR_PLACEHOLDER})
        except (AttributeError, TypeError):
            return message

    if isinstance(content, list):
        any_bad = any(
            isinstance(item, TextContent) and _looks_like_json_parse_error(item.text)
            for item in content
        )
        if any_bad:
            sanitized = [
                (
                    TextContent(text=_SANITIZED_ERROR_PLACEHOLDER)
                    if isinstance(item, TextContent) and _looks_like_json_parse_error(item.text)
                    else item
                )
                for item in content
            ]
            try:
                return message.model_copy(update={"content": sanitized})
            except (AttributeError, TypeError):
                return message

    return message


def sanitize_tool_errors(messages: list[Any]) -> list[Any]:
    """Scan all messages for raw JSON parse errors in tool output and redact them.

    When a tool call fails because of malformed JSON arguments, the SDK injects
    the raw error text back into the conversation. If this error text contains
    unquoted JSON property names or other characters that violate the JSON
    specification, the next LLM API call can be rejected with a 400 error.
    """
    result: list[Any] = []
    for msg in messages:
        role = _message_role(msg)
        if role == "tool":
            result.append(sanitize_message_content(msg))
        else:
            result.append(msg)
    return result


def validate_request_serialization(messages: list[Any]) -> bool:
    """Verify the full messages list can be serialized through supported schemas.

    Returns True if serialization succeeds, False otherwise.
    Logs one bounded warning with the first unsupported path on failure.

    OpenHands SDK messages are Pydantic models. Validate them through their
    explicit schema layer instead of treating every SDK object as a raw
    ``json.dumps`` failure.
    """
    serializable = _to_validation_jsonable(messages)
    try:
        json.dumps(serializable)
    except (TypeError, ValueError) as exc:
        path = _first_unserializable_path(serializable)
        _log.warning("LLM request serialization failed at %s: %s", path, exc)
        return False
    return True


def _to_validation_jsonable(value: Any) -> Any:
    """Convert SDK/Pydantic values to JSON-compatible structures for validation."""
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return _to_validation_jsonable(model_dump(mode="json"))
        except TypeError:
            return _to_validation_jsonable(model_dump())

    if isinstance(value, Mapping):
        return {key: _to_validation_jsonable(item) for key, item in value.items()}

    if isinstance(value, tuple):
        return [_to_validation_jsonable(item) for item in value]

    if isinstance(value, list):
        return [_to_validation_jsonable(item) for item in value]

    return value


def _first_unserializable_path(value: Any, path: str = "$") -> str:
    """Return the first path that cannot be represented as ordinary JSON."""
    if value is None or isinstance(value, str | int | float | bool):
        return path

    if isinstance(value, Mapping):
        for key, item in value.items():
            if not (key is None or isinstance(key, str | int | float | bool)):
                return f"{path}.<key>"
            child = _first_unserializable_path(item, f"{path}.{key}")
            if child != f"{path}.{key}":
                return child
            try:
                json.dumps(item)
            except (TypeError, ValueError):
                return f"{path}.{key}"
        return path

    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        for index, item in enumerate(value):
            child_path = f"{path}[{index}]"
            child = _first_unserializable_path(item, child_path)
            if child != child_path:
                return child
            try:
                json.dumps(item)
            except (TypeError, ValueError):
                return child_path
        return path

    try:
        json.dumps(value)
    except (TypeError, ValueError):
        return path
    return path


@contextlib.contextmanager
def model_input_context(
    *,
    session_dir: str | None = None,
    actor: str | None = None,
    model: str | None = None,
    purpose: str | None = None,
) -> Any:
    token = _MODEL_INPUT_CONTEXT.set(
        ModelInputContext(
            session_dir=session_dir,
            actor=actor,
            model=model,
            purpose=purpose,
        ),
    )
    try:
        yield
    finally:
        _MODEL_INPUT_CONTEXT.reset(token)


def sanitize_messages(messages: list[Any]) -> SanitizationResult:
    """Remove stale system/tool-instruction history from an LLM message list.

    The current system prompt is represented by the leading system-message run
    in the model call. Any later system messages came from persisted history or
    injected runtime notes and must not override the current prompt/tool schema.
    """
    kept: list[Any] = []
    seen_non_system = False
    dropped_system = 0
    dropped_tool_desc = 0

    for message in messages:
        role = _message_role(message)
        if role == "system":
            if seen_non_system:
                dropped_system += 1
                continue
            kept.append(message)
            continue

        seen_non_system = True
        if _looks_like_historical_tool_description(message):
            dropped_tool_desc += 1
            continue
        kept.append(message)

    return SanitizationResult(
        messages=kept,
        dropped_stale_system_messages=dropped_system,
        dropped_stale_tool_descriptions=dropped_tool_desc,
        input_messages_before=len(messages),
        input_messages_after=len(kept),
    )


def _estimate_token_count(messages: list[Any]) -> int:
    """Rough token estimate: total text chars / 4."""
    total_chars = 0
    for msg in messages:
        total_chars += len(_message_text(msg))
    return total_chars // 4


def _truncate_text(text: str, fraction: float) -> str:
    """Truncate text to a fraction of its original length, appending an elision marker."""
    if fraction >= 1.0 or not text:
        return text
    max_len = max(200, int(len(text) * fraction))
    truncated = text[:max_len].rstrip()
    if len(truncated) < len(text):
        remaining = len(text) - len(truncated)
        return f"{truncated}\n[... truncated, {remaining} chars omitted]"
    return text


def _replace_message_content(message: Any, new_text: str) -> Any:
    """Return a copy of *message* with its text content replaced."""
    if isinstance(message, dict):
        return {**message, "content": new_text}
    content = getattr(message, "content", None)
    if content is None:
        return message
    if isinstance(content, str):
        try:
            return message.model_copy(update={"content": new_text})
        except (AttributeError, TypeError):
            return message
    if isinstance(content, list):
        new_content = [
            TextContent(text=new_text) if isinstance(item, TextContent) else item
            for item in content
        ]
        try:
            return message.model_copy(update={"content": new_content})
        except (AttributeError, TypeError):
            return message
    return message


@traces(SWR.SWR_851)
def progressive_truncate_results(
    messages: list[Any],
    *,
    safe_ratio: float = 0.75,
    max_aggressiveness: float = 0.85,
) -> list[Any]:
    """Progressively truncate older tool results as context pressure increases.

    When the estimated token usage exceeds ``safe_ratio * context_window``,
    older tool-role message content is truncated more aggressively than
    newer content. This preserves the agent's recent working context while
    letting ancient file reads fade out smoothly.

    The context window is resolved from the current model via the known-model
    registry in ``providers/limits.py``. When the model is unknown the messages
    are returned unchanged.

    Args:
        messages: LLM message list to potentially truncate.
        safe_ratio: fraction of context window below which no truncation occurs.
        max_aggressiveness: max fraction of content to remove from the
            oldest tool result at full pressure.

    Returns:
        (possibly modified) message list.

    """
    ctx = _MODEL_INPUT_CONTEXT.get()
    if ctx is None or ctx.model is None:
        return messages

    from rotaris_core.providers.limits import resolve_known_token_limits

    known_input, _ = resolve_known_token_limits(ctx.model)
    if known_input is None:
        return messages

    context_window = known_input
    threshold = int(context_window * safe_ratio)
    estimated = _estimate_token_count(messages)
    if estimated <= threshold:
        return messages

    # Normalised pressure: 0 at threshold, 1 at full context window.
    overflow = estimated - threshold
    budget = context_window - threshold
    pressure = min(1.0, overflow / max(1, budget))

    # Collect tool-role message indices.
    tool_indices = [i for i, m in enumerate(messages) if _message_role(m) == "tool"]
    if not tool_indices:
        return messages

    n_tools = len(tool_indices)
    for rank, idx in enumerate(tool_indices):
        age_factor = rank / max(1, n_tools - 1)  # 0 = oldest, 1 = newest
        reduction = pressure * (1.0 - age_factor) * max_aggressiveness
        if reduction <= 0:
            continue
        msg = messages[idx]
        text = _message_text(msg)
        if not text:
            continue
        truncated = _truncate_text(text, 1.0 - reduction)
        messages[idx] = _replace_message_content(msg, truncated)

    return messages


@traces(SWR.SWR_1315, SWR.SWR_1316)
def sanitize_completion_messages(messages: Any) -> Any:
    if not isinstance(messages, list):
        return messages
    result = sanitize_messages(messages)
    # Phase A.4: merge split assistant messages caused by SDK batch interleaving.
    # When the SDK emits parallel tool calls but a tool-not-found AgentErrorEvent
    # fires synchronously between ActionEvents, events_to_messages() splits one
    # LLM response into multiple assistant messages.  Strict APIs (DeepSeek)
    # reject any assistant message that appears before all tool_call_ids from a
    # preceding assistant message are responded to.
    messages_sanitized = _merge_split_assistant_messages(result.messages)
    # Phase A.5: ensure every assistant tool_call_id has a corresponding tool
    # response message.  When a tool call fails (e.g. "Tool not found") the
    # SDK may not emit a tool response, leaving orphaned tool_call_ids in the
    # message history.  Strict APIs (Deepseek) reject the request with
    # "insufficient tool messages following tool_calls message".
    messages_sanitized = _fill_missing_tool_responses(messages_sanitized)
    # Phase B: sanitize tool-error content.
    messages_sanitized = sanitize_tool_errors(messages_sanitized)
    # Phase C: progressive truncation of old tool results.
    messages_sanitized = progressive_truncate_results(messages_sanitized)
    # Phase D: ensure reasoning_content is present on assistant messages
    # when the model requires echo-back (e.g. DeepSeek V4 thinking mode).
    # Prefer the model_input_context; fall back to the last known model
    # set by wrap_llm_completion (covers parent-resume paths where context
    # is not active).
    ctx = _MODEL_INPUT_CONTEXT.get()
    model_name = (ctx.model if ctx is not None else None) or _last_known_model
    if model_name:
        messages_sanitized = _ensure_reasoning_content(messages_sanitized, model_name)
    _record_model_input(result)
    return messages_sanitized


# ── Phase A.4 helpers ──────────────────────────────────────────────────────


def _set_message_tool_calls(message: Any, tool_calls: list[Any]) -> Any:
    """Return a copy of *message* with its tool_calls list replaced."""
    if isinstance(message, dict):
        return {**message, "tool_calls": tool_calls}
    try:
        return message.model_copy(update={"tool_calls": tool_calls})
    except (AttributeError, TypeError):
        return message


def _merge_split_assistant_messages(messages: list[Any]) -> list[Any]:
    """Merge consecutive split assistant messages caused by SDK batch interleaving.

    When the SDK processes parallel tool calls and a tool-not-found error fires
    synchronously between ActionEvents from the same LLM response,
    ``events_to_messages()`` breaks the single batch into multiple assistant
    messages because its look-ahead stops at the first non-ActionEvent.

    Example broken sequence::

        AssistantMsg([A, B, C])   # batched before the AgentErrorEvent
        ToolMsg(C_error)          # error for C
        AssistantMsg([D])         # new "batch" starting after the error
        ToolMsg(D_error)
        ToolMsg(A)
        ToolMsg(B)

    DeepSeek (and other strict APIs) reject ``AssistantMsg([D])`` because
    ``A`` and ``B`` from the first assistant message are still unanswered.

    This function detects the pattern and merges such consecutive assistant
    messages back into a single one::

        AssistantMsg([A, B, C, D])   # merged
        ToolMsg(C_error)
        ToolMsg(D_error)
        ToolMsg(A)
        ToolMsg(B)
    """
    result = list(messages)
    while True:
        merged_in_pass = False
        i = 0
        while i < len(result):
            msg = result[i]
            if _message_role(msg) != "assistant":
                i += 1
                continue
            tool_calls_a = _get_tool_calls(msg)
            if not tool_calls_a:
                i += 1
                continue

            # Track tool_call_ids from this assistant message that still need
            # a tool response before the next assistant message.
            pending_ids: set[str] = {_get_tool_call_id(tc) for tc in tool_calls_a}
            pending_ids.discard("")

            # Scan forward: consume tool responses; stop at the next assistant
            # message or a non-tool/non-assistant message.
            did_merge = False
            j = i + 1
            while j < len(result) and pending_ids:
                role_j = _message_role(result[j])
                if role_j == "tool":
                    pending_ids.discard(_get_message_tool_call_id(result[j]))
                    j += 1
                elif role_j == "assistant":
                    if pending_ids:
                        # Another assistant message appeared before all
                        # pending tool_calls were responded to.  Merge its
                        # tool_calls into the current assistant message.
                        tool_calls_b = _get_tool_calls(result[j])
                        if tool_calls_b:
                            combined = list(tool_calls_a) + list(tool_calls_b)
                            result[i] = _set_message_tool_calls(msg, combined)
                            result.pop(j)
                            did_merge = True
                            merged_in_pass = True
                            _log.debug(
                                "Phase A.4: merged split assistant message "
                                "(pending=%d, absorbed %d extra tool_calls)",
                                len(pending_ids),
                                len(tool_calls_b),
                            )
                    break
                else:
                    # User/system message — no more responses for this batch.
                    break

            if did_merge:
                # Re-check the same index: the merged message may still have
                # additional splits after it.
                continue
            i += 1

        if not merged_in_pass:
            break  # Stable — no merges in this pass.

    return result


# ── Phase A.5 helpers ──────────────────────────────────────────────────────


def _get_tool_calls(message: Any) -> list[Any]:
    """Extract tool_calls list from an assistant message (dict or object)."""
    if isinstance(message, dict):
        return message.get("tool_calls") or []
    tc = getattr(message, "tool_calls", None)
    return tc if isinstance(tc, list) else []


def _get_tool_call_id(entry: Any) -> str:
    """Extract the ``id`` (tool_call_id) from a single tool_call entry."""
    if isinstance(entry, dict):
        return str(entry.get("id") or entry.get("tool_call_id") or "")
    tc_id = getattr(entry, "id", None) or getattr(entry, "tool_call_id", None)
    return str(tc_id) if tc_id else ""


def _get_message_tool_call_id(message: Any) -> str:
    """Extract ``tool_call_id`` from a tool-role message (dict or object)."""
    if isinstance(message, dict):
        return str(message.get("tool_call_id") or "")
    tc_id = getattr(message, "tool_call_id", None)
    return str(tc_id) if tc_id else ""


def _fill_missing_tool_responses(messages: list[Any]) -> list[Any]:
    """Synthesize error tool-response messages for orphaned tool_call_ids.

    When an assistant message contains ``tool_calls`` but the SDK fails to
    generate tool response messages for some of those calls (e.g. because the
    tool was not found), strict LLM APIs reject the request.  This function
    detects orphaned IDs and inserts synthetic error responses so the message
    history remains valid.
    """
    # Collect tool_call_ids from assistant messages.
    called_ids: dict[str, int] = {}  # tool_call_id → message index
    for i, msg in enumerate(messages):
        if _message_role(msg) != "assistant":
            continue
        for tc in _get_tool_calls(msg):
            tc_id = _get_tool_call_id(tc)
            if tc_id:
                called_ids[tc_id] = i

    if not called_ids:
        return list(messages)

    # Collect tool_call_ids from tool-role messages.
    responded_ids: set[str] = set()
    for msg in messages:
        if _message_role(msg) != "tool":
            continue
        tc_id = _get_message_tool_call_id(msg)
        if tc_id:
            responded_ids.add(tc_id)

    # Find orphaned IDs.
    orphaned = [tid for tid in called_ids if tid not in responded_ids]
    if not orphaned:
        return list(messages)

    # Build synthetic tool error responses.
    synthetic_responses: list[dict[str, Any]] = []
    for tc_id in orphaned:
        _log.debug(
            "Synthesizing tool error response for orphaned tool_call_id=%s",
            tc_id,
        )
        synthetic_responses.append(
            {
                "role": "tool",
                "tool_call_id": tc_id,
                "content": (
                    "[Tool call failed: the requested tool was not available. "
                    "Check the list of available tools in the system prompt and "
                    "retry with a supported tool.]"
                ),
            }
        )

    # Insert synthetic responses after the last assistant message that
    # contains orphaned tool calls.
    last_orphaned_idx = max(called_ids[tc_id] for tc_id in orphaned)
    insert_at = last_orphaned_idx + 1
    result = list(messages)
    for offset, synth in enumerate(synthetic_responses):
        result.insert(insert_at + offset, synth)

    return result


def _get_message_reasoning_content(msg: Any) -> str | None:
    """Return the reasoning_content of a message if non-empty, else None."""
    if isinstance(msg, dict):
        rc = msg.get("reasoning_content")
    else:
        rc = getattr(msg, "reasoning_content", None)
    return rc if rc else None


def _ensure_reasoning_content(messages: list[Any], model_name: str) -> list[Any]:
    """Propagate ``reasoning_content`` to assistant messages that are missing it.

    DeepSeek V4 in thinking mode and similar models reject API requests when
    any prior assistant message is missing its ``reasoning_content`` field.
    This function scans assistant-role messages and, for any message that lacks
    a non-empty ``reasoning_content``, injects the most-recently-seen non-empty
    value from a preceding assistant message.

    Injecting ``""`` (empty string) is intentionally avoided: the OpenHands SDK
    ``Message.to_chat_dict()`` applies a truthy guard (``if self.reasoning_content``)
    before including the field, so empty strings are stripped before the API
    call, causing DeepSeek to reject the request again.

    When no preceding non-empty reasoning_content exists there is nothing to
    propagate, so the message is left untouched — the model has not yet produced
    any reasoning and DeepSeek does not require echo-back yet.

    Args:
        messages: The (already sanitized) message list.
        model_name: The litellm model name (e.g. ``"deepseek/deepseek-v4-pro"``).

    Returns:
        The message list, possibly with assistant messages patched in place.
    """
    from rotaris_core.models.thinking_catalog import model_requires_reasoning_echo

    if not model_requires_reasoning_echo(model_name):
        return messages

    last_reasoning: str | None = None
    injected_count = 0
    for i, msg in enumerate(messages):
        if _message_role(msg) != "assistant":
            continue
        rc = _get_message_reasoning_content(msg)
        if rc:
            # Non-empty reasoning content — track it for potential propagation.
            last_reasoning = rc
        elif last_reasoning and _patch_missing_reasoning_content(
            messages, i, msg, value=last_reasoning
        ):
            # A prior message had reasoning content — propagate the most recent
            # real value so the field is non-empty and survives to_chat_dict()'s
            # truthy check.  Injecting "" is intentionally avoided.
            injected_count += 1

    if injected_count:
        _log.debug(
            "Propagated reasoning_content to %d assistant message(s) for model %r",
            injected_count,
            model_name,
        )

    return messages


def _patch_missing_reasoning_content(
    messages: list[Any], index: int, msg: Any, *, value: str = ""
) -> bool:
    """Patch a single message with missing reasoning_content. Returns True if patched."""
    if isinstance(msg, dict):
        if msg.get("reasoning_content"):  # already non-empty
            return False
        messages[index] = {**msg, "reasoning_content": value}
        return True

    rc = getattr(msg, "reasoning_content", None)
    if rc:  # already non-empty — nothing to do
        return False
    try:
        messages[index] = msg.model_copy(update={"reasoning_content": value})
    except (AttributeError, TypeError):
        return False
    return True


def wrap_llm_completion[T](llm: T) -> T:
    """Wrap an OpenHands LLM instance so every completion call is sanitized."""
    if getattr(llm, "_rotaris_model_input_sanitized", False):
        return llm

    original_completion = getattr(llm, "completion")  # noqa: B009
    # Capture model name for defensive reasoning_content propagation.
    # This survives outside model_input_context (e.g. parent-resume paths).
    _captured_model = (
        str(getattr(llm, "model", "")).strip()
        or str(getattr(getattr(llm, "config", None), "model", "")).strip()
        or None
    )

    def _completion(messages: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal _captured_model
        global _last_known_model
        _last_known_model = _captured_model
        sanitized = sanitize_completion_messages(messages)
        # Phase D: pre-flight JSON validation gate — sampled at 1% to avoid
        # O(tokens) CPU overhead on every LLM call while still catching
        # serialization regressions in production.
        if random.random() < 0.01 and not validate_request_serialization(sanitized):
            _log.error(
                "LLM request serialization failed after sanitization — "
                "this should not happen; filing a diagnostic event.",
            )
        try:
            return original_completion(sanitized, *args, **kwargs)
        except RuntimeError as exc:
            if "No active exception to reraise" in str(exc):
                _log.critical(
                    "Bare 'raise' without active exception in LLM completion; "
                    "likely concurrency edge case on thread boundary. "
                    "Retrying once.",
                    exc_info=True,
                )
                # Retry once — the bare ``raise`` bug is non-deterministic
                # (thread timing), so a retry almost always succeeds.
                return original_completion(sanitized, *args, **kwargs)
            raise

    object.__setattr__(llm, "completion", _completion)
    object.__setattr__(llm, "_rotaris_model_input_sanitized", True)
    return llm


def _message_role(message: Any) -> str:
    if isinstance(message, dict):
        return str(message.get("role", "")).lower()
    return str(getattr(message, "role", "")).lower()


def _looks_like_historical_tool_description(message: Any) -> bool:
    role = _message_role(message)
    if role not in {"user", "assistant"}:
        return False
    text = _message_text(message)
    if not text:
        return False
    return sum(1 for pattern in _TOOL_DESCRIPTION_PATTERNS if pattern.search(text)) >= 2


def _message_text(message: Any) -> str:
    content = (
        message.get("content") if isinstance(message, dict) else getattr(message, "content", None)
    )
    return _content_text(content)


def _content_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, TextContent):
        return content.text
    if isinstance(content, list):
        return "\n".join(part for item in content if (part := _content_text(item)))
    if isinstance(content, dict):
        text = content.get("text")
        return text if isinstance(text, str) else ""
    text = getattr(content, "text", None)
    return text if isinstance(text, str) else ""


def _record_model_input(result: SanitizationResult) -> None:
    context = _MODEL_INPUT_CONTEXT.get()
    if context is None or context.session_dir is None:
        return
    try:
        from rotaris_core.session.diagnostics import record_model_input

        record_model_input(
            Path(context.session_dir),
            actor=context.actor,
            model=context.model,
            purpose=context.purpose,
            dropped_stale_system_messages=result.dropped_stale_system_messages,
            dropped_stale_tool_descriptions=result.dropped_stale_tool_descriptions,
            input_messages_before=result.input_messages_before,
            input_messages_after=result.input_messages_after,
        )
    except Exception:
        # Sanitization is safety-critical; diagnostics must never break model calls.
        return
