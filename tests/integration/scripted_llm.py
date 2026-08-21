"""Drive a real ``Agent``/``LocalConversation`` through a scripted LLM (no network).

This is a **non-test module inside the ``tests`` package** — the same shape as
``tests.capability.harness``. Import it, do not collect it::

    from tests.integration.scripted_llm import (
        RecordingMCPToolProvider,
        ScriptedLLM,
        say,
        tool_call,
    )

Why it exists
-------------

The repository already knows two ways to test agent behaviour, and neither
exercises the loop this harness targets:

* ``tests/integration/test_permission_denial_e2e.py`` synthesizes SDK events by
  hand — no agent ever steps, so nothing about tool dispatch is proven.
* ``tests/integration/test_compression_e2e.py`` replaces the whole conversation
  with a mock — useful for the surrounding orchestration, useless for what the
  agent itself does with a tool call.

A scripted LLM sits at the one seam that has to be faked (the network call) and
leaves everything downstream real: the SDK's tool-call parsing, argument
validation against each tool's schema, executor dispatch, and the
``ActionEvent``/``ObservationEvent`` pairs the run leaves behind. That is
exactly the evidence a caller like ``rotaris_core.init.serena_task`` reasons about,
so the tests prove the real thing.

Two pieces
----------

:class:`ScriptedLLM`
    Wraps a genuine :class:`openhands.sdk.LLM` and replaces only ``completion``.
    Each script entry is one assistant turn: tool calls, a final text message,
    or both. Turns are consumed in order; running off the end raises
    :class:`ScriptExhaustedError` rather than hanging or improvising.

:class:`RecordingMCPToolProvider`
    Stands in for an MCP server without spawning one. It hands the conversation
    real :class:`~openhands.sdk.mcp.tool.MCPToolDefinition` objects — so tool
    names, schemas and event shapes match production — backed by in-process
    responders that record every invocation.

Usage
-----

::

    scripted = ScriptedLLM(
        [
            tool_call("onboarding"),
            say("onboarding: success\\nsummary: memories written"),
        ],
    )
    provider = RecordingMCPToolProvider({"onboarding": "memories written"})

    result = await run_serena_initialization(
        workspace, config, llm=scripted.llm, mcp_tool_provider=provider,
    )

    assert provider.called("onboarding")
    assert scripted.exhausted

A turn may combine both parts — ``ScriptedTurn(text=..., tool_calls=(...))`` —
but note the SDK treats a turn that contains tool calls as "keep going", so a
run only finishes on a turn with no tool calls.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping, Sequence

    from openhands.sdk import LLM

__all__ = [
    "RecordingMCPToolProvider",
    "ScriptExhaustedError",
    "ScriptedLLM",
    "ScriptedToolCall",
    "ScriptedTurn",
    "ToolInvocation",
    "say",
    "tool_call",
    "turn",
]

DEFAULT_TEST_MODEL = "openai/gpt-4o-mini"
"""Placeholder model id used across this repo's SDK tests."""


# ---------------------------------------------------------------------------
# Script vocabulary


class ScriptExhaustedError(RuntimeError):
    """The agent asked for one more completion than the script provides.

    Raised instead of returning a filler turn: an unscripted step means the
    agent did something the test did not predict, and silently absorbing it
    would turn a real behavioural change into a green test.
    """


@dataclass(frozen=True)
class ScriptedToolCall:
    """One tool call the scripted assistant turn will emit."""

    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ScriptedTurn:
    """One assistant response: optional text, optional tool calls.

    A turn with tool calls continues the agent loop; a turn without them ends
    it. ``reasoning`` populates ``reasoning_content`` for models that emit it.
    """

    text: str = ""
    tool_calls: tuple[ScriptedToolCall, ...] = ()
    reasoning: str | None = None


def say(text: str, *, reasoning: str | None = None) -> ScriptedTurn:
    """A final, text-only assistant turn — this is what ends an agent run."""
    return ScriptedTurn(text=text, reasoning=reasoning)


def tool_call(name: str, /, **arguments: Any) -> ScriptedTurn:
    """A turn that calls exactly one tool with keyword arguments."""
    return ScriptedTurn(tool_calls=(ScriptedToolCall(name=name, arguments=dict(arguments)),))


def turn(
    *calls: ScriptedToolCall | tuple[str, dict[str, Any]],
    text: str = "",
    reasoning: str | None = None,
) -> ScriptedTurn:
    """A turn with text and/or several tool calls, for parallel-call scripts."""
    normalized = tuple(
        item if isinstance(item, ScriptedToolCall) else ScriptedToolCall(item[0], dict(item[1]))
        for item in calls
    )
    return ScriptedTurn(text=text, tool_calls=normalized, reasoning=reasoning)


# ---------------------------------------------------------------------------
# Scripted LLM


class ScriptedLLM:
    """A real SDK ``LLM`` whose ``completion`` replays a fixed script.

    Only ``completion`` is replaced — via ``object.__setattr__``, the same
    mechanism :func:`rotaris_core.model_input.wrap_llm_completion` uses on a frozen
    pydantic model — so the instance stays a genuine ``LLM`` and can be handed
    straight to ``create_agent_for_persona(...)(llm)``.

    Attributes:
        llm: The ``LLM`` instance to give to the agent factory.
        prompts: The message list of every completion call, in order. Assert on
            these to prove what actually reached the model (e.g. that the system
            prompt carried the classification).
        tools_offered: The tool names offered on each completion call, in order.
            Use this to prove a persona's toolset reached the model.

    Thread safety: ``completion`` is called from the conversation's worker
    thread, so the cursor is advanced under a lock.
    """

    def __init__(
        self,
        script: Iterable[ScriptedTurn],
        *,
        model: str = DEFAULT_TEST_MODEL,
        api_key: str = "test",
        usage_id: str = "scripted-llm",
    ) -> None:
        self._script: tuple[ScriptedTurn, ...] = tuple(script)
        self._cursor = 0
        self._call_index = 0
        self._lock = threading.Lock()
        self.prompts: list[list[Any]] = []
        self.tools_offered: list[list[str]] = []
        self.llm = self._build_llm(model=model, api_key=api_key, usage_id=usage_id)

    # -- introspection ----------------------------------------------------

    @property
    def turns_consumed(self) -> int:
        """How many scripted turns the agent has pulled so far."""
        return self._cursor

    @property
    def exhausted(self) -> bool:
        """Whether every scripted turn was used — the usual end-of-test assert."""
        return self._cursor >= len(self._script)

    # -- construction -----------------------------------------------------

    def _build_llm(self, *, model: str, api_key: str, usage_id: str) -> LLM:
        from openhands.sdk import LLM

        llm = LLM(model=model, api_key=api_key, usage_id=usage_id)
        object.__setattr__(llm, "completion", self._completion)
        # Rotaris's own LLM wrapper is idempotent through this flag; setting
        # it keeps a wrapped-again LLM from double-sanitizing the script.
        object.__setattr__(llm, "_rotaris_model_input_sanitized", True)
        return llm

    # -- the seam ---------------------------------------------------------

    def _completion(self, messages: Any = None, **kwargs: Any) -> Any:
        """Stand in for ``LLM.completion``; positional or keyword ``messages``."""
        from litellm.types.utils import ModelResponse
        from openhands.sdk.llm.llm_response import LLMResponse
        from openhands.sdk.llm.utils.metrics import MetricsSnapshot

        payload = messages if messages is not None else kwargs.get("messages")
        tools = kwargs.get("tools") or []

        with self._lock:
            if self._cursor >= len(self._script):
                raise ScriptExhaustedError(
                    f"The agent requested completion #{self._cursor + 1} but the script "
                    f"only defines {len(self._script)} turn(s). Either the agent took an "
                    f"unexpected step, or the script is missing its final text turn.",
                )
            scripted = self._script[self._cursor]
            self._cursor += 1
            self._call_index += 1
            call_index = self._call_index
            self.prompts.append(list(payload or []))
            self.tools_offered.append([str(getattr(tool, "name", tool)) for tool in tools])

        return LLMResponse(
            message=self._render(scripted, call_index),
            metrics=MetricsSnapshot(model_name=str(getattr(self.llm, "model", "scripted"))),
            raw_response=ModelResponse(
                id=f"scripted-{call_index}",
                choices=[],
                created=0,
                model=str(getattr(self.llm, "model", "scripted")),
                object="chat.completion",
            ),
        )

    def _render(self, scripted: ScriptedTurn, call_index: int) -> Any:
        from openhands.sdk.llm.message import Message, MessageToolCall, TextContent

        calls = [
            MessageToolCall(
                id=f"scripted-call-{call_index}-{position}",
                name=call.name,
                arguments=json.dumps(call.arguments),
                origin="completion",
            )
            for position, call in enumerate(scripted.tool_calls)
        ]
        return Message(
            role="assistant",
            content=[TextContent(text=scripted.text)] if scripted.text else [],
            reasoning_content=scripted.reasoning,
            tool_calls=calls or None,
        )


# ---------------------------------------------------------------------------
# In-process MCP stand-in


@dataclass(frozen=True)
class ToolInvocation:
    """One recorded call into a :class:`RecordingMCPToolProvider` tool."""

    name: str
    arguments: dict[str, Any]


#: What a stub tool returns: literal text, a callable over the parsed arguments,
#: or an exception instance — the latter is surfaced to the agent as an error
#: observation, exactly as a failing MCP server would be.
type ToolResponder = str | Callable[[dict[str, Any]], str] | BaseException


class RecordingMCPToolProvider:
    """An ``MCPToolProvider`` that serves in-process tools and records every call.

    The conversation cannot tell it apart from a real provider: it returns
    genuine ``MCPToolDefinition`` objects, so the LLM sees the declared schemas,
    the SDK validates arguments against them, and the run produces the same
    ``ActionEvent``/``ObservationEvent`` pairs a live server would.

    Prefer a real stdio server (see ``tests/integration/test_serena_init_flow.py``)
    when the point is that MCP wiring works end to end; use this when the point
    is agent behaviour and a subprocess is just cost.

    Args:
        tools: Tool name → responder. A responder is literal text, a callable
            over the parsed arguments returning text, or an exception instance
            to raise.
        schemas: Optional tool name → JSON Schema for the tool's arguments.
            Defaults to a permissive object schema, which is right for
            assertions about *whether* a tool fired.
        descriptions: Optional tool name → description shown to the model.
    """

    def __init__(
        self,
        tools: Mapping[str, ToolResponder],
        *,
        schemas: Mapping[str, dict[str, Any]] | None = None,
        descriptions: Mapping[str, str] | None = None,
    ) -> None:
        self._responders: dict[str, ToolResponder] = dict(tools)
        self._schemas = dict(schemas or {})
        self._descriptions = dict(descriptions or {})
        self.calls: list[ToolInvocation] = []
        self.create_tools_calls: list[dict[str, Any]] = []

    # -- assertions -------------------------------------------------------

    def called(self, name: str) -> bool:
        """Whether *name* was invoked at least once."""
        return any(call.name == name for call in self.calls)

    def call_count(self, name: str) -> int:
        return sum(1 for call in self.calls if call.name == name)

    def arguments_for(self, name: str) -> list[dict[str, Any]]:
        """Every argument dict *name* was called with, in order."""
        return [call.arguments for call in self.calls if call.name == name]

    @property
    def called_names(self) -> list[str]:
        """Tool names in invocation order, repeats included."""
        return [call.name for call in self.calls]

    # -- MCPToolProvider protocol ----------------------------------------

    def create_tools(
        self,
        mcp_config: Mapping[str, Any],
        timeout: float = 30.0,
        *,
        on_tools_changed: Callable[..., None] | None = None,
    ) -> Any:
        del on_tools_changed
        self.create_tools_calls.append({"servers": sorted(mcp_config), "timeout": timeout})
        return _StubMCPClient(tools=[self._build_tool(name) for name in self._responders])

    # -- internals --------------------------------------------------------

    def _build_tool(self, name: str) -> Any:
        import mcp.types
        from openhands.sdk.mcp.tool import MCPToolAction, MCPToolDefinition, MCPToolObservation

        schema = self._schemas.get(name) or {"type": "object", "properties": {}}
        return MCPToolDefinition(
            description=self._descriptions.get(name, f"Recording stub for {name}."),
            action_type=MCPToolAction,
            observation_type=MCPToolObservation,
            executor=_recording_executor(name, self._responders[name], self.calls),
            mcp_tool=mcp.types.Tool(name=name, description=name, inputSchema=schema),
        )


@dataclass
class _StubMCPClient:
    """Minimal stand-in for the SDK's MCP client — the conversation reads ``.tools``."""

    tools: Sequence[Any]


def _recording_executor(
    name: str,
    responder: ToolResponder,
    sink: list[ToolInvocation],
) -> Any:
    """Build the executor backing one stub tool.

    ``ToolExecutor`` is imported lazily and the subclass is defined here rather
    than at module scope so importing this harness stays cheap for tests that
    only want :class:`ScriptedLLM`.
    """
    from openhands.sdk.mcp.tool import MCPToolObservation
    from openhands.sdk.tool import ToolExecutor

    class _RecordingExecutor(ToolExecutor):  # type: ignore[type-arg]
        """Executes a stub tool, recording the invocation before responding."""

        def __call__(self, action: Any, conversation: Any = None) -> Any:
            del conversation
            arguments = dict(getattr(action, "data", None) or {})
            sink.append(ToolInvocation(name=name, arguments=arguments))

            if isinstance(responder, BaseException):
                return MCPToolObservation.from_text(
                    text=f"{type(responder).__name__}: {responder}",
                    is_error=True,
                    tool_name=name,
                )
            text = responder(arguments) if callable(responder) else str(responder)
            return MCPToolObservation.from_text(text=text, is_error=False, tool_name=name)

        def close(self) -> None:
            """Nothing to release — present because the SDK closes runtime tools."""

    return _RecordingExecutor()
