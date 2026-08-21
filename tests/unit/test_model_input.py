from __future__ import annotations

from typing import Any

import pytest
from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.model_input import (
    _MODEL_INPUT_CONTEXT,
    _SANITIZED_ERROR_PLACEHOLDER,
    _ensure_reasoning_content,
    _estimate_token_count,
    _fill_missing_tool_responses,
    _get_message_tool_call_id,
    _get_tool_call_id,
    _get_tool_calls,
    _merge_split_assistant_messages,
    _message_role,
    _replace_message_content,
    _truncate_text,
    progressive_truncate_results,
    sanitize_messages,
    sanitize_tool_errors,
    validate_request_serialization,
    wrap_llm_completion,
)
from rotaris_core.reqtocode import SWR, verifies


def _message(role: str, text: str) -> Message:
    return Message(role=role, content=[TextContent(text=text)])


def _set_model(name: str) -> Any:
    """Set the model context var — mirror of what ``model_input_context`` does."""
    from rotaris_core.model_input import ModelInputContext

    return _MODEL_INPUT_CONTEXT.set(ModelInputContext(model=name))


@verifies(SWR.SWR_350, SWR.SWR_1315, SWR.SWR_1321)
def test_sanitizer_keeps_current_leading_system_prompt() -> None:
    current = _message("system", "current system")
    user = _message("user", "do work")

    result = sanitize_messages([current, user])

    assert result.messages == [current, user]
    assert result.dropped_stale_system_messages == 0


@verifies(SWR.SWR_350, SWR.SWR_1315, SWR.SWR_1321)
def test_sanitizer_drops_stale_system_messages_after_history_begins() -> None:
    current = _message("system", "current system")
    stale = _message("system", "old system")
    user = _message("user", "do work")

    result = sanitize_messages([current, user, stale])

    assert result.messages == [current, user]
    assert result.dropped_stale_system_messages == 1


@verifies(SWR.SWR_350, SWR.SWR_1316, SWR.SWR_1321)
def test_sanitizer_drops_historical_tool_description_payloads() -> None:
    current = _message("system", "current system")
    stale_tools = _message(
        "user",
        "# Available tools\n- `read_file` — read files with this tool\n- `write_file` — edit files",
    )
    useful = _message("assistant", "I used read_file successfully.")

    result = sanitize_messages([current, stale_tools, useful])

    assert result.messages == [current, useful]
    assert result.dropped_stale_tool_descriptions == 1


@verifies(SWR.SWR_350, SWR.SWR_1316)
def test_sanitizer_preserves_normal_tool_and_user_history() -> None:
    messages = [
        {"role": "system", "content": "current"},
        {"role": "user", "content": "please inspect tools.py"},
        {"role": "tool", "tool_name": "grep", "content": "src/tools.py:1:match"},
        {"role": "assistant", "content": "The grep result is useful."},
    ]

    result = sanitize_messages(messages)

    assert result.messages == messages
    assert result.input_messages_before == 4
    assert result.input_messages_after == 4


# --- Phase A.5: missing tool-response synthesis tests ---


def test_get_tool_calls_from_dict() -> None:
    msg = {
        "role": "assistant",
        "tool_calls": [{"id": "call_1", "name": "grep"}, {"id": "call_2", "name": "read_file"}],
    }
    result = _get_tool_calls(msg)
    assert len(result) == 2
    assert result[0]["id"] == "call_1"


def test_get_tool_calls_empty_when_none() -> None:
    msg = {"role": "assistant", "content": "no tools"}
    assert _get_tool_calls(msg) == []


def test_get_tool_call_id_from_dict() -> None:
    entry = {"id": "call_abc", "name": "grep"}
    assert _get_tool_call_id(entry) == "call_abc"


def test_get_tool_call_id_falls_back_to_tool_call_id_key() -> None:
    entry = {"tool_call_id": "call_xyz", "name": "read_file"}
    assert _get_tool_call_id(entry) == "call_xyz"


def test_get_message_tool_call_id_from_dict() -> None:
    msg = {"role": "tool", "tool_call_id": "call_foo", "content": "result"}
    assert _get_message_tool_call_id(msg) == "call_foo"


def test_fill_missing_tool_responses_noop_when_all_responded() -> None:
    messages = [
        {"role": "system", "content": "hello"},
        {"role": "user", "content": "do it"},
        {
            "role": "assistant",
            "tool_calls": [{"id": "call_1", "name": "read_file"}],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": "file contents"},
    ]
    result = _fill_missing_tool_responses(messages)
    assert result == messages


def test_fill_missing_tool_responses_synthesizes_orphaned_tool_response() -> None:
    messages = [
        {"role": "system", "content": "hello"},
        {"role": "user", "content": "do it"},
        {
            "role": "assistant",
            "tool_calls": [
                {"id": "call_1", "name": "grep"},
                {"id": "call_2", "name": "read_file"},
            ],
        },
        # Only call_2 has a response — call_1 is orphaned
        {"role": "tool", "tool_call_id": "call_2", "content": "file contents"},
    ]
    result = _fill_missing_tool_responses(messages)

    # Should have 5 messages now (original 4 + 1 synthetic)
    assert len(result) == 5

    # The synthetic response should be inserted after the assistant message (index 3)
    synthetic = result[3]
    assert synthetic["role"] == "tool"
    assert synthetic["tool_call_id"] == "call_1"
    assert "not available" in synthetic["content"]

    # Original tool response should still be there
    assert result[4]["tool_call_id"] == "call_2"


def test_fill_missing_tool_responses_handles_multiple_orphans_in_same_message() -> None:
    messages = [
        {"role": "system", "content": "hello"},
        {
            "role": "assistant",
            "tool_calls": [
                {"id": "call_a", "name": "grep"},
                {"id": "call_b", "name": "glob"},
                {"id": "call_c", "name": "read_file"},
            ],
        },
        # Only call_c responded
        {"role": "tool", "tool_call_id": "call_c", "content": "file"},
    ]
    result = _fill_missing_tool_responses(messages)

    assert len(result) == 5  # 3 orig + 2 synthetic
    # Both orphans should have synthetic responses
    synth_ids = {
        m["tool_call_id"] for m in result if isinstance(m, dict) and m.get("role") == "tool"
    }
    assert synth_ids == {"call_a", "call_b", "call_c"}


def test_fill_missing_tool_responses_noop_without_tool_calls() -> None:
    messages = [
        {"role": "system", "content": "hello"},
        {"role": "user", "content": "a question"},
        {"role": "assistant", "content": "an answer"},
    ]
    result = _fill_missing_tool_responses(messages)
    assert result == messages


def test_fill_missing_tool_responses_preserves_non_dict_messages() -> None:
    msg = Message(role="tool", content=[TextContent(text="real result")], tool_call_id="call_ok")
    messages: list[Any] = [
        {"role": "system", "content": "hello"},
        {
            "role": "assistant",
            "tool_calls": [{"id": "call_ok", "name": "read_file"}],
        },
        msg,
    ]
    result = _fill_missing_tool_responses(messages)
    assert result == messages  # all responded, no change


# --- Phase A.4: merge split assistant messages tests ---


def test_merge_split_assistant_messages_noop_when_no_split() -> None:
    """No change when all tool_calls are responded to before the next assistant message."""
    messages: list[Any] = [
        {
            "role": "assistant",
            "tool_calls": [{"id": "call_a"}, {"id": "call_b"}],
        },
        {"role": "tool", "tool_call_id": "call_a", "content": "ok"},
        {"role": "tool", "tool_call_id": "call_b", "content": "ok"},
    ]
    result = _merge_split_assistant_messages(messages)
    assert result == messages


def test_merge_split_assistant_messages_noop_when_no_tool_calls() -> None:
    """No change when assistant messages have no tool_calls."""
    messages: list[Any] = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "bye"},
        {"role": "assistant", "content": "goodbye"},
    ]
    result = _merge_split_assistant_messages(messages)
    assert result == messages


def test_merge_split_assistant_messages_merges_when_split() -> None:
    """The canonical SDK-batch-interleaving bug: call_02 error fires between
    call_02 and call_03 ActionEvents, splitting the batch into two assistant
    messages.  Responses for call_00 and call_01 come last."""
    messages: list[Any] = [
        {
            "role": "assistant",
            "tool_calls": [
                {"id": "call_00"},
                {"id": "call_01"},
                {"id": "call_02"},
            ],
        },
        {"role": "tool", "tool_call_id": "call_02", "content": "error"},
        {
            "role": "assistant",
            "tool_calls": [{"id": "call_03"}],
        },
        {"role": "tool", "tool_call_id": "call_03", "content": "error"},
        {"role": "tool", "tool_call_id": "call_00", "content": "ok"},
        {"role": "tool", "tool_call_id": "call_01", "content": "ok"},
    ]
    result = _merge_split_assistant_messages(messages)

    # The two assistant messages are merged into one.
    assert len(result) == 5
    first = result[0]
    assert _message_role(first) == "assistant"
    merged_ids = {_get_tool_call_id(tc) for tc in _get_tool_calls(first)}
    assert merged_ids == {"call_00", "call_01", "call_02", "call_03"}
    # All tool responses still present.
    tool_ids = {_get_message_tool_call_id(m) for m in result if _message_role(m) == "tool"}
    assert tool_ids == {"call_00", "call_01", "call_02", "call_03"}


def test_merge_split_assistant_messages_merges_multiple_splits() -> None:
    """Handles more than one split in a single batch."""
    messages: list[Any] = [
        {"role": "assistant", "tool_calls": [{"id": "call_00"}, {"id": "call_01"}]},
        {"role": "tool", "tool_call_id": "call_01", "content": "error"},
        {"role": "assistant", "tool_calls": [{"id": "call_02"}]},
        {"role": "tool", "tool_call_id": "call_02", "content": "error"},
        {"role": "assistant", "tool_calls": [{"id": "call_03"}]},
        {"role": "tool", "tool_call_id": "call_03", "content": "error"},
        {"role": "tool", "tool_call_id": "call_00", "content": "ok"},
    ]
    result = _merge_split_assistant_messages(messages)

    # All three assistant messages merged into one.
    assert len(result) == 5
    merged_ids = {_get_tool_call_id(tc) for tc in _get_tool_calls(result[0])}
    assert merged_ids == {"call_00", "call_01", "call_02", "call_03"}


def test_merge_split_assistant_messages_does_not_merge_across_user_message() -> None:
    """A user message between the two assistant messages prevents merging."""
    messages: list[Any] = [
        {"role": "assistant", "tool_calls": [{"id": "call_00"}]},
        {"role": "tool", "tool_call_id": "call_00", "content": "ok"},
        {"role": "user", "content": "correction"},
        {"role": "assistant", "tool_calls": [{"id": "call_01"}]},
        {"role": "tool", "tool_call_id": "call_01", "content": "ok"},
    ]
    result = _merge_split_assistant_messages(messages)
    # No merge; call_00 is fully responded before the user message.
    assert len(result) == 5


# --- Phase B: tool-error sanitization tests ---


@verifies(SWR.SWR_322)
def test_sanitize_tool_errors_redacts_parse_error_string() -> None:
    messages = [
        {"role": "system", "content": "current"},
        {"role": "user", "content": "do something"},
        {
            "role": "tool",
            "tool_name": "todo",
            "content": "Expecting property name enclosed in double quotes: line 1 column 3559",
        },
    ]

    result = sanitize_tool_errors(messages)

    assert result[2]["content"] == _SANITIZED_ERROR_PLACEHOLDER


@verifies(SWR.SWR_322)
def test_sanitize_tool_errors_redacts_unparseable_json_error() -> None:
    messages = [
        {"role": "tool", "tool_name": "read_file", "content": "unparseable JSON"},
    ]

    result = sanitize_tool_errors(messages)

    assert result[0]["content"] == _SANITIZED_ERROR_PLACEHOLDER


@verifies(SWR.SWR_350)
def test_sanitize_tool_errors_preserves_normal_tool_output() -> None:
    messages = [
        {"role": "tool", "tool_name": "read_file", "content": "Line 1: def foo():"},
    ]

    result = sanitize_tool_errors(messages)

    assert result[0]["content"] == "Line 1: def foo():"


@verifies(SWR.SWR_350)
def test_sanitize_tool_errors_preserves_non_tool_roles() -> None:
    messages = [
        {"role": "user", "content": "Expecting property name enclosed in double quotes"},
        {"role": "assistant", "content": "I see the error"},
    ]

    result = sanitize_tool_errors(messages)

    assert result == messages  # User/assistant messages are not sanitized


@verifies(SWR.SWR_350)
def test_sanitize_tool_errors_handles_textcontent_list() -> None:
    msg = Message(
        role="tool",
        content=[TextContent(text="Extra data: line 1 column 42")],
    )

    result = sanitize_tool_errors([msg])

    content = result[0].content
    assert isinstance(content, list)
    assert content[0].text == _SANITIZED_ERROR_PLACEHOLDER


# --- Phase C: pre-flight validation tests ---


@verifies(SWR.SWR_539)
def test_validate_request_serialization_accepts_valid_messages() -> None:
    messages = [
        {"role": "system", "content": "hello"},
        {"role": "user", "content": "hi"},
    ]

    assert validate_request_serialization(messages) is True


@verifies(SWR.SWR_539)
def test_validate_request_serialization_accepts_openhands_message_objects() -> None:
    messages = [
        _message("system", "current"),
        _message("user", "please continue"),
        Message(role="tool", content=[TextContent(text="tool result")], tool_call_id="call-1"),
    ]

    assert validate_request_serialization(messages) is True


@verifies(SWR.SWR_539)
def test_validate_request_serialization_rejects_unserializable() -> None:
    # A raw bytes object cannot be JSON-serialized by json.dumps.

    class Unserializable:
        pass

    messages: list[Any] = [
        {"role": "system", "content": "hello"},
        {"role": "tool", "content": Unserializable()},
    ]

    assert validate_request_serialization(messages) is False


@verifies(SWR.SWR_539)
def test_validate_request_serialization_logs_one_bounded_warning(caplog: Any) -> None:
    messages: list[Any] = [
        _message("system", "current"),
        {"role": "tool", "content": {"nested": object()}},
    ]

    assert validate_request_serialization(messages) is False

    warnings = [
        record.message
        for record in caplog.records
        if record.levelname == "WARNING" and "LLM request serialization failed" in record.message
    ]
    assert len(warnings) == 1
    assert "$[1].content.nested" in warnings[0]


# --- Phase C: progressive truncation tests ---


@verifies(SWR.SWR_850)
def test_truncate_text_elides_long_string() -> None:
    result = _truncate_text("a" * 1000, 0.3)

    assert len(result) < 500  # truncated
    assert "[... truncated" in result


@verifies(SWR.SWR_850)
def test_truncate_text_preserves_short_string() -> None:
    result = _truncate_text("short", 0.3)

    assert result == "short"


@verifies(SWR.SWR_850)
def test_truncate_text_enforces_minimum_length() -> None:
    result = _truncate_text("x" * 5000, 0.01)

    assert len(result) >= 200  # minimum floor
    assert "[... truncated" in result


@verifies(SWR.SWR_850)
def test_truncate_text_noop_at_full_fraction() -> None:
    text = "some text here"
    assert _truncate_text(text, 1.0) == text


@verifies(SWR.SWR_850)
def test_replace_message_content_dict() -> None:
    msg = {"role": "tool", "content": "original"}
    replaced = _replace_message_content(msg, "new")

    assert replaced["content"] == "new"
    assert replaced["role"] == "tool"


@verifies(SWR.SWR_850)
def test_replace_message_content_message_object() -> None:
    msg = Message(role="tool", content=[TextContent(text="original")])
    replaced = _replace_message_content(msg, "new")

    assert replaced is not msg
    content = replaced.content
    assert isinstance(content, list)
    assert content[0].text == "new"


@verifies(SWR.SWR_850)
def test_estimate_token_count() -> None:
    messages = [
        {"role": "system", "content": "hello"},  # 5 chars
        {"role": "tool", "content": "abcdefgh"},  # 8 chars
    ]

    # 13 total chars / 4 = 3.25 → 3
    assert _estimate_token_count(messages) == 3


@verifies(SWR.SWR_850)
def test_progressive_truncate_below_threshold_is_noop() -> None:
    token = _set_model("deepseek/deepseek-v4-pro")  # 1M context
    try:
        messages = [
            {"role": "system", "content": "hello"},
            {"role": "tool", "tool_name": "read_file", "content": "a" * 100},
        ]

        result = progressive_truncate_results(messages, safe_ratio=0.75)

        # 105 chars / 4 ≈ 26 tokens << 750k threshold → no truncation
        assert result == messages
    finally:
        _MODEL_INPUT_CONTEXT.reset(token)


@verifies(SWR.SWR_850)
def test_progressive_truncate_preserves_newest_tool_result() -> None:
    # 1M context → 750k token threshold
    token = _set_model("deepseek/deepseek-v4-pro")
    try:
        # Need ≈3.2M total chars to exceed 75% of 1,048,576 tokens at 4 chars/token.
        # Use 2 x 1.8M-char tool results → ~900k estimated tokens → over threshold.
        old_chunk = "x" * 1_800_000
        new_chunk = "x" * 1_800_000
        messages = [
            {"role": "system", "content": "s"},
            # Oldest tool result — should be truncated most
            {"role": "tool", "tool_name": "read_file", "content": old_chunk},
            # Newest tool result — should be preserved most
            {"role": "tool", "tool_name": "read_file", "content": new_chunk},
        ]

        result = progressive_truncate_results(messages, safe_ratio=0.75)

        old_text = result[1]["content"]
        new_text = result[2]["content"]

        # Oldest should be shorter (more aggressively truncated)
        assert len(old_text) < len(new_text), (
            f"Oldest ({len(old_text)}) should be shorter than newest ({len(new_text)})"
        )
        # Newest should still have its full content
        assert "[... truncated" not in new_text
    finally:
        _MODEL_INPUT_CONTEXT.reset(token)


@verifies(SWR.SWR_851)
def test_progressive_truncate_unknown_model_is_noop() -> None:
    token = _set_model("openai/never-heard-of-this-model")
    try:
        messages = [
            {"role": "system", "content": "s"},
            {"role": "tool", "tool_name": "read_file", "content": "x" * 500_000},
        ]

        result = progressive_truncate_results(messages)

        assert result == messages
    finally:
        _MODEL_INPUT_CONTEXT.reset(token)


@verifies(SWR.SWR_851)
def test_progressive_truncate_no_model_context_is_noop() -> None:
    # No _MODEL_INPUT_CONTEXT set
    messages = [
        {"role": "system", "content": "s"},
        {"role": "tool", "tool_name": "read_file", "content": "x" * 500_000},
    ]

    result = progressive_truncate_results(messages)

    assert result == messages


# --- Phase D: reasoning_content safety net tests ---


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_noop_when_no_prior_reasoning() -> None:
    """Messages with no prior reasoning_content are NOT patched.

    If no assistant message in the history has ever produced reasoning_content,
    there is nothing to echo back and DeepSeek does not require the field yet.
    The old behaviour of injecting '' was wrong because to_chat_dict() drops
    empty strings before the API call.
    """
    messages: list[Any] = [
        {"role": "system", "content": "hello"},
        {"role": "user", "content": "do work"},
        {"role": "assistant", "content": "I will help"},
        {"role": "tool", "tool_call_id": "call_1", "content": "result"},
        {"role": "assistant", "content": "done", "tool_calls": []},
    ]
    result = _ensure_reasoning_content(messages, "deepseek/deepseek-v4-pro")

    # Nothing patched — no prior reasoning_content to propagate.
    assert result[2].get("reasoning_content") is None or not result[2].get("reasoning_content")
    assert result[4].get("reasoning_content") is None or not result[4].get("reasoning_content")


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_propagates_to_subsequent_messages() -> None:
    """The canonical session-8cb3b67e3c82 bug: split assistant messages from one
    LLM batch where only the first has reasoning_content.  The subsequent ones
    must receive the same value so it survives to_chat_dict()'s truthy guard."""
    messages: list[Any] = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "task"},
        {"role": "assistant", "content": "thinking", "reasoning_content": "My reasoning here"},
        {"role": "tool", "tool_call_id": "c0", "content": "error"},
        # Split message from same LLM batch — no reasoning_content.
        {"role": "assistant", "content": "", "tool_calls": [{"id": "c1"}]},
        {"role": "tool", "tool_call_id": "c1", "content": "error"},
        # Third split from same batch.
        {"role": "assistant", "content": "", "tool_calls": [{"id": "c2"}]},
        {"role": "tool", "tool_call_id": "c2", "content": "error"},
    ]

    result = _ensure_reasoning_content(messages, "deepseek/deepseek-v4-pro")

    # First message preserved.
    assert result[2]["reasoning_content"] == "My reasoning here"
    # Subsequent split messages propagated with the real value (not "").
    assert result[4]["reasoning_content"] == "My reasoning here"
    assert result[6]["reasoning_content"] == "My reasoning here"


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_injects_for_deepseek_v4_flash() -> None:
    """DeepSeek V4 Flash also requires reasoning echo when a prior message has rc."""
    messages: list[Any] = [
        {"role": "assistant", "content": "step 1", "reasoning_content": "thinking A"},
        {"role": "tool", "tool_call_id": "c0", "content": "ok"},
        {"role": "assistant", "content": "step 2"},
    ]

    result = _ensure_reasoning_content(messages, "deepseek/deepseek-v4-flash")

    assert result[2]["reasoning_content"] == "thinking A"


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_preserves_existing_reasoning() -> None:
    """Messages that already have reasoning_content are not modified;
    subsequent messages with None get the preceding real value."""
    messages: list[Any] = [
        {"role": "assistant", "content": "hello", "reasoning_content": "chain of thought"},
        {"role": "assistant", "content": "more", "reasoning_content": None},
    ]

    result = _ensure_reasoning_content(messages, "deepseek/deepseek-v4-pro")

    assert result[0]["reasoning_content"] == "chain of thought"  # preserved
    assert result[1]["reasoning_content"] == "chain of thought"  # propagated


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_skips_non_thinking_model() -> None:
    """GPT-4o does not require reasoning echo — messages pass through unchanged."""
    messages: list[Any] = [
        {"role": "assistant", "content": "hello"},
    ]
    original = list(messages)

    result = _ensure_reasoning_content(messages, "openai/gpt-4o")

    assert result == original


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_ignores_non_assistant() -> None:
    """System, user, and tool messages are never patched."""
    messages: list[Any] = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "user"},
        {"role": "tool", "tool_call_id": "t1", "content": "result"},
    ]

    result = _ensure_reasoning_content(messages, "deepseek/deepseek-v4-pro")

    assert result == messages  # unchanged


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_handles_message_objects_no_prior_rc() -> None:
    """SDK Message object without any prior reasoning_content is NOT patched."""
    msg = Message(role="assistant", content=[TextContent(text="thinking...")])

    result = _ensure_reasoning_content([msg], "deepseek/deepseek-v4-pro")

    # No preceding rc — nothing to propagate.
    assert getattr(result[0], "reasoning_content", None) is None


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_handles_message_objects_with_prior_rc() -> None:
    """SDK Message object gets propagated rc from preceding message."""
    first = Message(
        role="assistant",
        content=[TextContent(text="first")],
        reasoning_content="batch reasoning",
    )
    second = Message(role="assistant", content=[TextContent(text="second")])

    result = _ensure_reasoning_content([first, second], "deepseek/deepseek-v4-pro")

    assert result[0].reasoning_content == "batch reasoning"  # unchanged
    assert result[1].reasoning_content == "batch reasoning"  # propagated


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_skips_message_with_existing_rc() -> None:
    """SDK Message with existing reasoning_content is not modified."""
    msg = Message(
        role="assistant",
        content=[TextContent(text="done")],
        reasoning_content="existing",
    )

    result = _ensure_reasoning_content([msg], "deepseek/deepseek-v4-pro")

    assert result[0] is msg  # identity preserved


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_empty_list() -> None:
    """Empty message list is handled without error."""
    result = _ensure_reasoning_content([], "deepseek/deepseek-v4-pro")
    assert result == []


@verifies(SWR.SWR_757)
def test_ensure_reasoning_content_none_model_name() -> None:
    """None model name is treated as not requiring echo."""
    messages: list[Any] = [
        {"role": "assistant", "content": "hello"},
    ]

    result = _ensure_reasoning_content(messages, "")

    assert result == messages  # unchanged — empty string is falsy for model check


class _BareRaiseLLM:
    """Stand-in LLM whose first completion trips the bare-``raise`` concurrency bug."""

    def __init__(self, errors: list[Exception]) -> None:
        self._errors = errors
        self.calls: list[Any] = []

    def completion(self, messages: Any, *args: Any, **kwargs: Any) -> str:
        self.calls.append(messages)
        if self._errors:
            raise self._errors.pop(0)
        return "ok"


@verifies(SWR.SWR_2110)
def test_wrapped_completion_retries_once_after_bare_raise_runtime_error(caplog: Any) -> None:
    """Productive use: a run survives the non-deterministic thread-boundary bug.
    Expected outcome: the wrapper logs a critical diagnostic and retries the call once."""
    llm = _BareRaiseLLM([RuntimeError("No active exception to reraise")])
    wrapped = wrap_llm_completion(llm)

    with caplog.at_level("CRITICAL"):
        result = wrapped.completion([Message(role="user", content=[TextContent(text="hi")])])

    assert result == "ok"
    assert len(llm.calls) == 2
    assert any("Bare 'raise' without active exception" in r.message for r in caplog.records)


@verifies(SWR.SWR_2110)
def test_wrapped_completion_propagates_other_runtime_errors() -> None:
    """Productive use: genuine runtime failures still surface instead of being retried away.
    Expected outcome: an unrelated `RuntimeError` propagates after a single call."""
    llm = _BareRaiseLLM([RuntimeError("event loop is closed")])
    wrapped = wrap_llm_completion(llm)

    with pytest.raises(RuntimeError, match="event loop is closed"):
        wrapped.completion([Message(role="user", content=[TextContent(text="hi")])])

    assert len(llm.calls) == 1
