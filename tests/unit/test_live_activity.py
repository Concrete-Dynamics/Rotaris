from __future__ import annotations

from openhands.sdk.event.llm_convertible.action import ActionEvent
from openhands.sdk.event.llm_convertible.message import MessageEvent
from openhands.sdk.event.llm_convertible.observation import ObservationEvent
from openhands.sdk.llm import MessageToolCall
from openhands.sdk.llm.message import Message, TextContent
from openhands.tools.terminal.definition import TerminalAction

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.live_activity import _summarize_action, describe_sdk_event


@verifies(SWR.SWR_633)
def test_terminal_action_feed_preserves_full_command_while_activity_is_compact() -> None:
    long_command = (
        "pytest tests/unit/test_tui_app.py::test_start_run_resolves_tool_animation_to_static_"
        "indicator tests/unit/test_tui_streaming.py::test_extract_stream_text_suppresses_plain_"
        "raw_tool_call_text --maxfail=1 --disable-warnings"
    )
    event = ActionEvent.model_construct(
        source="agent",
        tool_name="terminal",
        tool_call_id="call-1",
        action=TerminalAction(command=long_command),
        summary="running targeted regression tests",
    )

    update = describe_sdk_event(event)

    assert update is not None
    assert update["activity_text"].endswith("…")
    assert len(update["activity_text"]) == 90
    assert update["feed_text"] == f"terminal: $ {long_command}"


@verifies(SWR.SWR_633)
def test_agent_message_event_marks_response_ready() -> None:
    event = MessageEvent.model_construct(
        source="agent",
        llm_message=Message(
            role="assistant",
            content=[TextContent(text="Done. Updated the config and verified it.")],
        ),
    )

    update = describe_sdk_event(event)

    assert update is not None
    assert update["activity_phase"] == "completed"
    assert update["activity_icon"] == "✓"
    assert update["activity_text"] == "Response ready"
    assert update["feed_icon"] == "✓"
    assert update["feed_text"] == "Done. Updated the config and verified it."


@verifies(SWR.SWR_633)
def test_agent_message_event_surfaces_structured_tool_call_as_loading() -> None:
    event = MessageEvent.model_construct(
        source="agent",
        llm_message=Message(
            role="assistant",
            content=[],
            tool_calls=[
                MessageToolCall(
                    id="call_delegate",
                    name="delegate",
                    arguments='{"persona":"planner"}',
                    origin="completion",
                ),
            ],
        ),
    )

    update = describe_sdk_event(event)

    assert update is not None
    assert update["activity_phase"] == "tool"
    assert update["activity_icon"] == "ANIMATED_TOOL"
    assert update["activity_text"] == "Calling delegate"
    assert update["feed_icon"] == "ANIMATED_TOOL"
    assert update["feed_text"] == "Calling delegate"


@verifies(SWR.SWR_633)
def test_observation_event_surfaces_result_text_for_transcript() -> None:
    event = ObservationEvent.model_construct(
        source="environment",
        tool_name="grep",
        tool_call_id="call-1",
        observation=type(
            "ObservationStub",
            (),
            {"to_llm_content": [TextContent(text="tests/unit/test_live_activity.py: result line")]},
        )(),
        action_id="action-1",
    )

    update = describe_sdk_event(event)

    assert update is not None
    assert update["activity_phase"] == "completed"
    assert update["activity_text"] == "grep"
    assert update["feed_icon"] == "✓"
    assert update["feed_text"] == "tests/unit/test_live_activity.py: result line"
    assert update["feed_replaces_content"] == "true"


@verifies(SWR.SWR_512)
def test_summarize_terminal_action_bare_command() -> None:
    event = ActionEvent.model_construct(
        source="agent",
        tool_name="terminal",
        tool_call_id="call-1",
        action=TerminalAction(command="npm install"),
        summary=None,
    )
    result = _summarize_action(event, truncate=False)
    assert result == "$ npm install"


@verifies(SWR.SWR_512)
def test_summarize_terminal_action_with_timeout() -> None:
    event = ActionEvent.model_construct(
        source="agent",
        tool_name="terminal",
        tool_call_id="call-1",
        action=TerminalAction(command="npm install", timeout=120),
        summary=None,
    )
    result = _summarize_action(event, truncate=False)
    assert result == "$ npm install [timeout: 120s]"


@verifies(SWR.SWR_512)
def test_summarize_terminal_action_with_reset() -> None:
    event = ActionEvent.model_construct(
        source="agent",
        tool_name="terminal",
        tool_call_id="call-1",
        action=TerminalAction(command="npm install", reset=True),
        summary=None,
    )
    result = _summarize_action(event, truncate=False)
    assert result == "$ npm install [reset]"


@verifies(SWR.SWR_512)
def test_summarize_terminal_action_with_is_input() -> None:
    event = ActionEvent.model_construct(
        source="agent",
        tool_name="terminal",
        tool_call_id="call-1",
        action=TerminalAction(command="C-c", is_input=True),
        summary=None,
    )
    result = _summarize_action(event, truncate=False)
    assert result == "$ C-c (input)"


@verifies(SWR.SWR_512)
def test_summarize_terminal_action_all_metadata_flags() -> None:
    event = ActionEvent.model_construct(
        source="agent",
        tool_name="terminal",
        tool_call_id="call-1",
        action=TerminalAction(command="make build", timeout=30, reset=True),
        summary=None,
    )
    result = _summarize_action(event, truncate=False)
    assert result == "$ make build [timeout: 30s] [reset]"


@verifies(SWR.SWR_512)
def test_summarize_terminal_action_truncation() -> None:
    long_command = (
        "pytest tests/unit/test_tui_app.py::test_start_run_resolves_tool_animation_to_static_"
        "indicator tests/unit/test_tui_streaming.py::test_extract_stream_text_suppresses_"
        "plain_raw_tool_call_text --maxfail=1 --disable-warnings"
    )
    event = ActionEvent.model_construct(
        source="agent",
        tool_name="terminal",
        tool_call_id="call-1",
        action=TerminalAction(command=long_command, timeout=10),
        summary=None,
    )
    result = _summarize_action(event, truncate=True)
    assert result.endswith("…")
    assert len(result) == 90
