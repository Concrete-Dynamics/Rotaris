"""Productive use: a user with a Claude Code subscription starts a Rotaris run, Claude
does the work with Rotaris's own tools, and the run finishes like any other run.
Expected outcome: the scheduler drives a claude-code child through a persistent Claude
session, the child's transcript shows the answer and the tool work, the change lands in
the workspace, and the Ralph loop completes the task and reports on it.

The Claude *transport* is faked (a real one would need a live subscription); everything
above it — conversation selection, the tool bridge, event normalization, the scheduler,
the report path and the Ralph loop — is the real code."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest
from openhands.sdk import LLM, Agent
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

from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.orchestrator.scheduler import Scheduler
from rotaris_core.providers.claude_sdk import conversation as conversation_module
from rotaris_core.providers.claude_sdk.events import (
    AssistantText,
    RunFinished,
    SessionStarted,
    TextDelta,
    ToolCalled,
    ToolResulted,
)
from rotaris_core.ralph import RalphIterationOutcome, RalphLoop
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from collections.abc import Iterator

WORKSPACE_NOTE = "notes.md"


class _WriteNoteAction(Action):
    filename: str = WORKSPACE_NOTE
    text: str = ""


class _WriteNoteObservation(Observation):
    pass


class _WriteNoteExecutor(ToolExecutor):
    """Writes inside the workspace — the real side effect a run is judged by."""

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    def __call__(
        self,
        action: _WriteNoteAction,
        conversation: Any = None,
    ) -> _WriteNoteObservation:
        target = self._workspace / action.filename
        target.write_text(action.text, encoding="utf-8")
        return _WriteNoteObservation(
            content=[TextContent(text=f"wrote {len(action.text)} chars to {action.filename}")],
        )


_workspace_for_tool: dict[str, Path] = {}


class _WriteNoteTool(ToolDefinition[_WriteNoteAction, _WriteNoteObservation]):
    name = "write_note"

    @classmethod
    def create(cls, conv_state: Any = None, **params: Any) -> list[_WriteNoteTool]:
        workspace = Path(_workspace_for_tool["path"])
        return [
            cls(
                description="Write a note file into the workspace.",
                action_type=_WriteNoteAction,
                observation_type=_WriteNoteObservation,
                executor=_WriteNoteExecutor(workspace),
            ),
        ]


register_tool("ClaudeSdkWriteNoteTool", _WriteNoteTool)


class _FakeClaudeSession:
    """Stands in for a connected ``ClaudeSDKClient``.

    It behaves the way the real session does at the boundary: it is connected
    once, replays a turn as normalized events, and genuinely calls the published
    Rotaris tool — so the executor, the workspace write and the observation are
    all real.
    """

    instances: list[_FakeClaudeSession] = []

    def __init__(self, config: Any, *, tools: Any = None, client_factory: Any = None) -> None:
        del client_factory
        self.config = config
        self.tools = tools
        self.connected = False
        self.prompts: list[str] = []
        self.interrupts = 0
        _FakeClaudeSession.instances.append(self)

    async def connect(self) -> None:
        self.connected = True

    async def disconnect(self) -> None:
        self.connected = False

    async def interrupt(self) -> None:
        self.interrupts += 1

    async def run(self, prompt: str) -> Any:
        self.prompts.append(prompt)
        yield SessionStarted(session_id="sess-int", model=self.config.model, tools=())
        yield TextDelta(text="Writing the note")
        yield AssistantText(text="I will write the note now.")

        arguments = {"filename": WORKSPACE_NOTE, "text": "deploy on friday"}
        yield ToolCalled(
            call_id="call-1",
            tool_name="mcp__rotaris__write_note",
            arguments=arguments,
        )
        result = await self.tools.handlers["write_note"](arguments)
        yield ToolResulted(
            call_id="call-1",
            content=result["content"][0]["text"],
            is_error=bool(result["isError"]),
        )

        yield AssistantText(text="Wrote notes.md with the deploy step.")
        yield RunFinished(
            subtype="success",
            text="Wrote notes.md with the deploy step.",
            session_id="sess-int",
            num_turns=2,
            total_cost_usd=0.02,
            usage={"input_tokens": 200, "output_tokens": 40},
        )


class _RecordingSummaryAgent:
    """Records what it is asked to summarise; the scheduler may not need it."""

    def __init__(self) -> None:
        self.transcripts: list[list[dict[str, Any]]] = []

    async def generate_report(
        self,
        record: Any,
        transcript: Any,
        *,
        fallback_status: str = "failed",
    ) -> ChildReportArtifact:
        del fallback_status
        self.transcripts.append(list(transcript or []))
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Done",
        )


@pytest.fixture(autouse=True)
def _fake_claude_transport(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    """Swap the real Claude session for the fake one, for this test only."""
    _FakeClaudeSession.instances.clear()
    _workspace_for_tool["path"] = tmp_path
    monkeypatch.setattr(conversation_module, "ClaudeAgentSession", _FakeClaudeSession)
    monkeypatch.setattr(
        conversation_module.ClaudeSDKConversation,
        "_load_token",
        lambda self: "sk-ant-oat-test-token",
    )
    yield
    _FakeClaudeSession.instances.clear()


def _claude_agent() -> Agent:
    llm = LLM(model="claude-code/sonnet", usage_id="claude-code-int", api_key=SecretStr("test"))
    return Agent(llm=llm, tools=[Tool(name="ClaudeSdkWriteNoteTool")])


def _child_record(name: str = "note-writer") -> ChildTaskRecord:
    return ChildTaskRecord(
        name=name,
        canonical_name=name,
        session_id="claude-session",
        persona="developer",
        task_payload="Write notes.md with the deploy step",
        state=ChildTaskState.RUNNING,
        depth=1,
    )


@verifies(SWR.SWR_778)
@pytest.mark.asyncio
async def test_scheduler_runs_a_claude_code_child_and_reports_its_work(tmp_path: Path) -> None:
    seen_events: list[Any] = []
    streamed: list[Any] = []
    scheduler = Scheduler(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=60, child_stall_timeout=60)),
        workspace_root=str(tmp_path),
        summary_agent=_RecordingSummaryAgent(),
        conversation_event_callback=lambda record, event: seen_events.append(event),
        conversation_token_callback=lambda record, chunk: streamed.append(chunk),
    )

    report = await scheduler.run_child(_child_record(), _claude_agent())

    # The child ran on a Claude session, not the LiteLLM conversation.
    assert len(_FakeClaudeSession.instances) == 1
    session = _FakeClaudeSession.instances[0]
    assert session.prompts, "the child's task never reached the Claude session"
    assert str(session.config.cwd) == str(tmp_path)
    assert session.prompts[0].strip(), "the child's task payload was empty"

    # Claude's tools were Rotaris's tools, and the work landed in the workspace.
    assert (tmp_path / WORKSPACE_NOTE).read_text(encoding="utf-8") == "deploy on friday"

    # The scheduler saw the tool work through its normal event seam, under
    # Rotaris's tool name — that is what tool timing and diagnostics key on.
    tool_names = [getattr(event, "tool_name", None) for event in seen_events]
    assert "write_note" in tool_names
    assert any(getattr(event, "observation", None) is not None for event in seen_events)
    assert "Writing the note" in "".join(str(chunk) for chunk in streamed)

    # No Agent SDK type escaped the provider boundary into the scheduler.
    assert not any(type(event).__module__.startswith("claude_agent_sdk") for event in seen_events)

    assert report.status == "succeeded"
    assert "Wrote notes.md" in f"{report.final_response} {report.last_response}"


@verifies(SWR.SWR_778)
@pytest.mark.asyncio
async def test_scheduler_falls_back_to_the_shim_when_the_native_loop_is_disabled(
    tmp_path: Path,
) -> None:
    """With the policy off, nothing about the run reaches a Claude session."""
    built: list[Any] = []

    def _factory_probe(agent: Any, callbacks: Any = None, token_callbacks: Any = None) -> Any:
        del callbacks, token_callbacks
        built.append(agent)
        raise AssertionError("the default conversation factory should have been used")

    scheduler = Scheduler(
        config=RotarisConfig(
            runtime=RuntimePolicy(child_timeout=60, claude_sdk_native_loop=False),
        ),
        workspace_root=str(tmp_path),
        summary_agent=_RecordingSummaryAgent(),
    )

    conversation = None
    try:
        conversation = scheduler._default_conversation_factory(  # noqa: SLF001
            _claude_agent(),
            callbacks=[],
            token_callbacks=[],
        )
        assert not isinstance(conversation, conversation_module.ClaudeSDKConversation)
        assert _FakeClaudeSession.instances == []
    finally:
        if conversation is not None:
            conversation.close()
        assert built == []


@verifies(SWR.SWR_778)
@pytest.mark.asyncio
async def test_ralph_loop_completes_a_task_on_the_claude_backend(tmp_path: Path) -> None:
    summary_agent = _RecordingSummaryAgent()
    loop = RalphLoop(
        config=RotarisConfig(runtime=RuntimePolicy(child_timeout=60, child_stall_timeout=60)),
        workspace_root=str(tmp_path),
        summary_agent=summary_agent,
    )

    task = TodoTask(name="Write the deploy note", description="Write notes.md")
    task.set_execution_context("Write notes.md with the deploy step")
    todo = TodoList(phases=[TodoPhase(name="Phase 1", tasks=[task])])

    progress = await loop.run(
        todo,
        agent_factory=lambda persona, rk=None: _claude_agent(),
        session_id="claude-sdk-e2e",
    )

    assert progress.completed_tasks == 1
    assert progress.abandoned_tasks == 0
    assert progress.iterations[0].outcome == RalphIterationOutcome.COMPLETED
    assert task.status == TaskStatus.COMPLETED

    # The user's workspace actually changed, by way of a Rotaris tool Claude called.
    assert (tmp_path / WORKSPACE_NOTE).read_text(encoding="utf-8") == "deploy on friday"

    # And the session was closed behind the child.
    assert _FakeClaudeSession.instances
    assert all(not session.connected for session in _FakeClaudeSession.instances)
