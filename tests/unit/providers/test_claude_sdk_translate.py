"""Productive use: a developer watching a Claude-backed run sees the same stream of
answers, tool calls and results Rotaris shows for every other provider.
Expected outcome: each Agent SDK message shape becomes Rotaris's own event values,
and a message shape Rotaris does not know is ignored rather than breaking the run."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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
from rotaris_core.providers.claude_sdk.translate import translate_message
from rotaris_core.reqtocode import SWR, verifies


@dataclass
class _Content:
    """Stand-in for an ``AssistantMessage``/``UserMessage``."""

    content: Any


@dataclass
class _Stream:
    """Stand-in for a ``StreamEvent`` (``include_partial_messages``)."""

    event: dict[str, Any]


@dataclass
class _Result:
    """Stand-in for a ``ResultMessage``."""

    subtype: str = "success"
    num_turns: int = 1
    result: str = ""
    is_error: bool = False
    session_id: str = ""
    total_cost_usd: float | None = None
    usage: dict[str, Any] = field(default_factory=dict)


@dataclass
class _System:
    """Stand-in for a ``SystemMessage``."""

    subtype: str
    data: dict[str, Any]


@dataclass
class _Text:
    text: str


@dataclass
class _Thinking:
    thinking: str
    signature: str = ""


@dataclass
class _ToolUse:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class _ToolResult:
    tool_use_id: str
    content: Any = None
    is_error: bool = False


@verifies(SWR.SWR_779)
def test_assistant_text_block_becomes_assistant_text() -> None:
    assert translate_message(_Content([_Text(text="Here is the fix.")])) == [
        AssistantText(text="Here is the fix."),
    ]


@verifies(SWR.SWR_779)
def test_blank_assistant_text_is_dropped() -> None:
    assert translate_message(_Content([_Text(text="   ")])) == []


@verifies(SWR.SWR_779)
def test_thinking_block_becomes_thinking_text() -> None:
    assert translate_message(_Content([_Thinking(thinking="Weighing options")])) == [
        ThinkingText(text="Weighing options"),
    ]


@verifies(SWR.SWR_779)
def test_completed_tool_use_carries_authoritative_arguments() -> None:
    message = _Content([_ToolUse(id="call-1", name="mcp__rotaris__shell", input={"cmd": "ls"})])

    assert translate_message(message) == [
        ToolCalled(call_id="call-1", tool_name="mcp__rotaris__shell", arguments={"cmd": "ls"}),
    ]


@verifies(SWR.SWR_779)
def test_tool_result_block_flattens_its_content() -> None:
    message = _Content(
        [_ToolResult(tool_use_id="call-1", content=[{"type": "text", "text": "file.py"}])],
    )

    assert translate_message(message) == [
        ToolResulted(call_id="call-1", content="file.py", is_error=False),
    ]


@verifies(SWR.SWR_779)
def test_failed_tool_result_keeps_its_error_flag() -> None:
    message = _Content([_ToolResult(tool_use_id="call-1", content="boom", is_error=True)])

    assert translate_message(message) == [
        ToolResulted(call_id="call-1", content="boom", is_error=True),
    ]


@verifies(SWR.SWR_779)
def test_one_message_can_carry_text_and_a_tool_call() -> None:
    message = _Content(
        [
            _Text(text="Listing the directory."),
            _ToolUse(id="call-2", name="mcp__rotaris__shell", input={"cmd": "ls"}),
        ],
    )

    assert translate_message(message) == [
        AssistantText(text="Listing the directory."),
        ToolCalled(call_id="call-2", tool_name="mcp__rotaris__shell", arguments={"cmd": "ls"}),
    ]


@verifies(SWR.SWR_779)
def test_streamed_text_delta_becomes_a_display_only_delta() -> None:
    message = _Stream(
        {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hel"}},
    )

    assert translate_message(message) == [TextDelta(text="Hel")]


@verifies(SWR.SWR_779)
def test_streamed_thinking_delta_becomes_a_thinking_delta() -> None:
    message = _Stream(
        {"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "Hmm"}},
    )

    assert translate_message(message) == [ThinkingDelta(text="Hmm")]


@verifies(SWR.SWR_779)
def test_streamed_tool_start_and_input_delta_are_separate_from_the_completed_call() -> None:
    """A partial argument fragment must never be mistaken for real arguments."""
    start = _Stream(
        {
            "type": "content_block_start",
            "index": 1,
            "content_block": {"type": "tool_use", "id": "call-3", "name": "mcp__rotaris__shell"},
        },
    )
    delta = _Stream(
        {
            "type": "content_block_delta",
            "index": 1,
            "delta": {"type": "input_json_delta", "partial_json": '{"cmd": "l'},
        },
    )

    assert translate_message(start) == [
        ToolStarted(call_id="call-3", tool_name="mcp__rotaris__shell"),
    ]
    events = translate_message(delta)
    assert events == [ToolInputDelta(call_id="1", partial_json='{"cmd": "l')]
    assert not isinstance(events[0], ToolCalled)


@verifies(SWR.SWR_779)
def test_text_content_block_start_produces_nothing() -> None:
    message = _Stream(
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
    )

    assert translate_message(message) == []


@verifies(SWR.SWR_779)
def test_init_system_message_announces_the_session() -> None:
    message = _System(
        subtype="init",
        data={"session_id": "sess-1", "model": "sonnet", "tools": ["mcp__rotaris__shell"]},
    )

    assert translate_message(message) == [
        SessionStarted(session_id="sess-1", model="sonnet", tools=("mcp__rotaris__shell",)),
    ]


@verifies(SWR.SWR_779)
def test_other_system_messages_produce_nothing() -> None:
    assert translate_message(_System(subtype="compact_boundary", data={})) == []


@verifies(SWR.SWR_779)
def test_result_message_carries_usage_and_cost() -> None:
    message = _Result(
        subtype="success",
        num_turns=3,
        result="All tests pass.",
        session_id="sess-1",
        total_cost_usd=0.042,
        usage={"input_tokens": 100, "output_tokens": 20},
    )

    assert translate_message(message) == [
        RunFinished(
            subtype="success",
            text="All tests pass.",
            is_error=False,
            session_id="sess-1",
            num_turns=3,
            total_cost_usd=0.042,
            usage={"input_tokens": 100, "output_tokens": 20},
        ),
    ]


@verifies(SWR.SWR_779)
def test_error_result_is_marked_as_an_error() -> None:
    events = translate_message(_Result(subtype="error_max_turns", is_error=True))

    assert len(events) == 1
    finished = events[0]
    assert isinstance(finished, RunFinished)
    assert finished.is_error
    assert finished.subtype == "error_max_turns"


@verifies(SWR.SWR_779)
def test_unknown_message_shape_translates_to_nothing() -> None:
    """A newer SDK message type must be ignored, not raise mid-run."""

    @dataclass
    class _Future:
        something_new: str = "value"

    assert translate_message(_Future()) == []
    assert translate_message(object()) == []


@verifies(SWR.SWR_779)
def test_dict_shaped_content_blocks_are_understood() -> None:
    """Blocks that arrive as plain JSON translate the same as dataclass blocks."""
    message = _Content(
        [
            {"type": "text", "text": "done"},
            {"type": "tool_use", "id": "call-4", "name": "shell", "input": {"cmd": "pwd"}},
        ],
    )

    assert translate_message(message) == [
        AssistantText(text="done"),
        ToolCalled(call_id="call-4", tool_name="shell", arguments={"cmd": "pwd"}),
    ]
