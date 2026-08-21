"""Productive use: a child running on a Claude Code subscription is scheduled,
watched, paused and reported on exactly like a child on any other provider.
Expected outcome: one persistent session per child records Claude's answers and tool
work on the transcript the scheduler reads, honours pause/close, and reports its
token usage — and personas on other providers are left alone."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from openhands.sdk import LLM, Agent
from openhands.sdk.event import ActionEvent, MessageEvent, ObservationEvent
from openhands.sdk.llm.message import TextContent
from openhands.sdk.tool import (
    Action,
    Observation,
    Tool,
    ToolDefinition,
    ToolExecutor,
    register_tool,
)
from pydantic import SecretStr

from rotaris_core.providers.claude_sdk.conversation import (
    ClaudeSDKConversation,
    claude_sdk_conversation_if_supported,
    is_claude_code_agent,
)
from rotaris_core.providers.claude_sdk.events import (
    AgentEvent,
    AssistantText,
    RunFinished,
    SessionStarted,
    TextDelta,
    ToolCalled,
    ToolResulted,
)
from rotaris_core.reqtocode import SWR, verifies


class _NoteAction(Action):
    text: str = ""


class _NoteObservation(Observation):
    pass


class _NoteExecutor(ToolExecutor):
    def __call__(self, action: _NoteAction, conversation: Any = None) -> _NoteObservation:
        return _NoteObservation(content=[TextContent(text=f"noted: {action.text}")])


class _NoteTool(ToolDefinition[_NoteAction, _NoteObservation]):
    name = "note"

    @classmethod
    def create(cls, conv_state: Any = None, **params: Any) -> list[_NoteTool]:
        return [
            cls(
                description="Write a note.",
                action_type=_NoteAction,
                observation_type=_NoteObservation,
                executor=_NoteExecutor(),
            ),
        ]


register_tool("ClaudeSdkNoteTool", _NoteTool)


class _FakeSession:
    """A Claude session that replays a scripted turn and runs real tools."""

    def __init__(self, config: Any, tools: Any, script: Any) -> None:
        self.config = config
        self.tools = tools
        self.script = script
        self.connected = False
        self.connects = 0
        self.disconnects = 0
        self.interrupts = 0
        self.prompts: list[str] = []

    async def connect(self) -> None:
        self.connected = True
        self.connects += 1

    async def disconnect(self) -> None:
        self.connected = False
        self.disconnects += 1

    async def interrupt(self) -> None:
        self.interrupts += 1

    async def run(self, prompt: str) -> Any:
        self.prompts.append(prompt)
        async for event in self.script(self, prompt):
            yield event


def _build_conversation(
    script: Any,
    tmp_path: Any,
    *,
    sessions: list[_FakeSession] | None = None,
    events: list[Any] | None = None,
    tokens: list[Any] | None = None,
    model: str = "claude-code/sonnet",
) -> ClaudeSDKConversation:
    created = sessions if sessions is not None else []

    def factory(config: Any, tools: Any) -> _FakeSession:
        session = _FakeSession(config, tools, script)
        created.append(session)
        return session

    llm = LLM(model=model, usage_id="claude-sdk-test", api_key=SecretStr("test"))
    agent = Agent(llm=llm, tools=[Tool(name="ClaudeSdkNoteTool")])
    return ClaudeSDKConversation(
        agent,
        workspace=tmp_path,
        callbacks=[events.append] if events is not None else None,
        token_callbacks=[tokens.append] if tokens is not None else None,
        session_factory=factory,
        token_loader=lambda: "sk-ant-oat-test-token",
    )


async def _answer_and_use_a_tool(session: _FakeSession, prompt: str) -> Any:
    yield SessionStarted(session_id="sess-1", model="sonnet", tools=list(session.tools.tool_names))
    yield TextDelta(text="Writ")
    yield TextDelta(text="ing")
    yield AssistantText(text="Writing that down.")
    arguments = {"text": prompt}
    yield ToolCalled(call_id="call-1", tool_name="mcp__rotaris__note", arguments=arguments)
    result = await session.tools.handlers["note"](arguments)
    yield ToolResulted(
        call_id="call-1",
        content=result["content"][0]["text"],
        is_error=bool(result["isError"]),
    )
    yield AssistantText(text="Noted it.")
    yield RunFinished(
        subtype="success",
        text="Noted it.",
        session_id="sess-1",
        num_turns=2,
        total_cost_usd=0.25,
        usage={
            "input_tokens": 120,
            "output_tokens": 30,
            "cache_read_input_tokens": 10,
            "cache_creation_input_tokens": 5,
        },
    )


async def _answer_only(session: _FakeSession, prompt: str) -> Any:
    yield AssistantText(text=f"Answering: {prompt}")
    yield RunFinished(subtype="success", text="done", session_id="sess-1", num_turns=1)


@verifies(SWR.SWR_778)
def test_run_records_assistant_text_and_tool_calls_on_the_transcript(tmp_path: Any) -> None:
    tokens: list[Any] = []
    conversation = _build_conversation(_answer_and_use_a_tool, tmp_path, tokens=tokens)
    try:
        conversation.send_message("remember the deploy step")
        conversation.run()

        events = list(conversation.state.events)
        user_messages = [
            event for event in events if isinstance(event, MessageEvent) and event.source == "user"
        ]
        assistant_texts = [
            content.text
            for event in events
            if isinstance(event, MessageEvent) and event.source == "agent"
            for content in event.llm_message.content
            if isinstance(content, TextContent)
        ]
        actions = [event for event in events if isinstance(event, ActionEvent)]
        observations = [event for event in events if isinstance(event, ObservationEvent)]

        assert [c.text for m in user_messages for c in m.llm_message.content] == [
            "remember the deploy step",
        ]
        assert "Writing that down." in assistant_texts
        assert "Noted it." in assistant_texts

        # The tool call carries Rotaris's own tool name, not the mcp__ wire name,
        # so tool tracking and diagnostics recognise it.
        assert [action.tool_name for action in actions] == ["note"]
        assert actions[0].action is not None
        assert actions[0].action.text == "remember the deploy step"
        assert actions[0].tool_call_id == "call-1"

        # The observation is the real object the executor produced, so outcome
        # classification keeps working.
        assert [observation.tool_name for observation in observations] == ["note"]
        assert isinstance(observations[0].observation, _NoteObservation)
        assert observations[0].action_id == actions[0].id
        assert "noted: remember the deploy step" in str(observations[0].observation)

        # Streaming text reaches the UI as it arrives.
        assert tokens == ["Writ", "ing"]
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_run_invokes_the_scheduler_callbacks_for_every_recorded_event(tmp_path: Any) -> None:
    emitted: list[Any] = []
    conversation = _build_conversation(_answer_and_use_a_tool, tmp_path, events=emitted)
    try:
        conversation.send_message("remember this")
        conversation.run()

        assert [type(event).__name__ for event in emitted] == [
            type(event).__name__ for event in conversation.state.events
        ]
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_follow_up_turn_reuses_the_connected_session(tmp_path: Any) -> None:
    """A todo correction must reach a model that remembers the work so far."""
    sessions: list[_FakeSession] = []
    conversation = _build_conversation(_answer_only, tmp_path, sessions=sessions)
    try:
        conversation.send_message("first task")
        conversation.run()
        conversation.send_message("actually, also update the changelog")
        conversation.run()

        assert len(sessions) == 1
        assert sessions[0].connects == 1
        assert sessions[0].prompts == ["first task", "actually, also update the changelog"]
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_pause_interrupts_and_close_disconnects_the_session(tmp_path: Any) -> None:
    sessions: list[_FakeSession] = []
    conversation = _build_conversation(_answer_only, tmp_path, sessions=sessions)
    conversation.send_message("start working")
    conversation.run()

    conversation.pause()
    assert sessions[0].interrupts == 1

    conversation.close()
    assert sessions[0].disconnects == 1
    assert sessions[0].connected is False


@verifies(SWR.SWR_778)
def test_run_usage_is_recorded_on_the_agent_llm_metrics(tmp_path: Any) -> None:
    conversation = _build_conversation(_answer_and_use_a_tool, tmp_path)
    try:
        conversation.send_message("note this")
        conversation.run()

        usage = conversation.agent.llm.metrics.accumulated_token_usage
        assert usage is not None
        assert usage.prompt_tokens == 120
        assert usage.completion_tokens == 30
        assert usage.cache_read_tokens == 10
        assert usage.cache_write_tokens == 5
        assert conversation.agent.llm.metrics.accumulated_cost == 0.25
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_the_personas_own_tools_are_the_tools_claude_is_given(tmp_path: Any) -> None:
    conversation = _build_conversation(_answer_only, tmp_path)
    try:
        assert "mcp__rotaris__note" in conversation.tool_names
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_native_loop_claims_only_claude_code_agents(tmp_path: Any) -> None:
    claude_llm = LLM(model="claude-code/sonnet", usage_id="a", api_key=SecretStr("test"))
    other_llm = LLM(model="anthropic/claude-sonnet-4-5", usage_id="b", api_key=SecretStr("test"))
    claude_agent = Agent(llm=claude_llm, tools=[])
    other_agent = Agent(llm=other_llm, tools=[])

    assert is_claude_code_agent(claude_agent) is True
    assert is_claude_code_agent(other_agent) is False
    assert claude_sdk_conversation_if_supported(other_agent, workspace=tmp_path) is None

    conversation = claude_sdk_conversation_if_supported(claude_agent, workspace=tmp_path)
    assert isinstance(conversation, ClaudeSDKConversation)
    conversation.close()


@verifies(SWR.SWR_778)
def test_native_loop_can_be_disabled_by_runtime_policy(tmp_path: Any) -> None:
    from rotaris_core.config.schema import RuntimePolicy

    assert RuntimePolicy().claude_sdk_native_loop is True

    llm = LLM(model="claude-code/sonnet", usage_id="a", api_key=SecretStr("test"))
    agent = Agent(llm=llm, tools=[])

    disabled = RuntimePolicy(claude_sdk_native_loop=False)
    assert (
        claude_sdk_conversation_if_supported(
            agent,
            workspace=tmp_path,
            enabled=disabled.claude_sdk_native_loop,
        )
        is None
    )


@verifies(SWR.SWR_778)
def test_conversation_exposes_the_workspace_the_scheduler_validates(tmp_path: Any) -> None:
    conversation = _build_conversation(_answer_only, tmp_path)
    try:
        assert str(conversation.workspace.working_dir) == str(tmp_path)
        assert str(conversation.state.workspace.working_dir) == str(tmp_path)
        assert conversation.id is not None
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_run_without_a_pending_message_does_nothing(tmp_path: Any) -> None:
    sessions: list[_FakeSession] = []
    conversation = _build_conversation(_answer_only, tmp_path, sessions=sessions)
    try:
        conversation.run()

        assert sessions == []
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_a_failing_turn_surfaces_to_the_scheduler(tmp_path: Any) -> None:
    """A broken session must fail the child, not hang the stall watchdog."""

    async def _explode(session: _FakeSession, prompt: str) -> Any:
        yield AssistantText(text="starting")
        raise RuntimeError("claude transport died")

    conversation = _build_conversation(_explode, tmp_path)
    try:
        conversation.send_message("do the thing")
        try:
            conversation.run()
        except RuntimeError as exc:
            assert "claude transport died" in str(exc)
        else:
            raise AssertionError("run() should have raised the session failure")

        status = str(getattr(conversation.state.execution_status, "value", ""))
        assert status == "error"
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_no_agent_sdk_type_reaches_the_transcript(tmp_path: Any) -> None:
    """The provider boundary is real: only Rotaris/OpenHands types are recorded."""
    conversation = _build_conversation(_answer_and_use_a_tool, tmp_path)
    try:
        conversation.send_message("note this")
        conversation.run()

        for event in conversation.state.events:
            module = type(event).__module__
            assert not module.startswith("claude_agent_sdk"), module
    finally:
        conversation.close()


@verifies(SWR.SWR_778)
def test_normalized_events_are_rotaris_owned_values() -> None:
    """The union the boundary exports contains no SDK type."""
    for member in AgentEvent.__args__:  # type: ignore[attr-defined]
        assert member.__module__ == "rotaris_core.providers.claude_sdk.events"


@verifies(SWR.SWR_778)
def test_agent_sdk_imports_stay_inside_the_provider_boundary() -> None:
    """``claude_agent_sdk`` may only be named where the boundary lives."""
    import rotaris_core

    root = Path(rotaris_core.__file__).parent
    allowed = {
        root / "providers" / "claude_code_runtime.py",
        *(root / "providers" / "claude_sdk").glob("*.py"),
    }

    offenders = sorted(
        str(path.relative_to(root))
        for path in root.rglob("*.py")
        if path not in allowed and "claude_agent_sdk" in path.read_text(encoding="utf-8")
    )

    assert offenders == []
