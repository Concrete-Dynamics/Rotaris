"""Productive use: a persona's own tools are the tools Claude gets to use, so work
done on the Claude backend goes through Rotaris's executors, permissions and sandbox.
Expected outcome: a published tool keeps its identity and schema, calling it runs the
real executor, a failure comes back as a tool error, and every call can be correlated
back to the Action/Observation it produced."""

from __future__ import annotations

from typing import Any

import pytest
from openhands.sdk.llm.message import TextContent
from openhands.sdk.tool import Action, Observation, ToolDefinition, ToolExecutor

from rotaris_core.providers.claude_sdk.tool_bridge import (
    ToolInvocation,
    ToolInvocationLog,
    build_tool_server,
    mcp_tool_name,
    render_observation,
)
from rotaris_core.reqtocode import SWR, verifies


class _GreetAction(Action):
    name: str = ""
    excited: bool = False


class _GreetObservation(Observation):
    pass


class _GreetExecutor(ToolExecutor):
    def __call__(self, action: _GreetAction, conversation: Any = None) -> _GreetObservation:
        suffix = "!" if action.excited else "."
        return _GreetObservation(content=[TextContent(text=f"Hello {action.name}{suffix}")])


class _ExplodingExecutor(ToolExecutor):
    def __call__(self, action: _GreetAction, conversation: Any = None) -> _GreetObservation:
        raise RuntimeError("the sandbox refused this command")


class _GreetTool(ToolDefinition[_GreetAction, _GreetObservation]):
    name = "greet"

    @classmethod
    def create(cls, conv_state: Any = None, **params: Any) -> list[_GreetTool]:
        return [
            cls(
                description="Greet somebody by name.",
                action_type=_GreetAction,
                observation_type=_GreetObservation,
                executor=params.get("executor") or _GreetExecutor(),
            ),
        ]


def _greet_tool(executor: ToolExecutor | None = None) -> ToolDefinition:
    return _GreetTool.create(executor=executor)[0]


@verifies(SWR.SWR_779)
def test_published_tool_keeps_its_rotaris_name_description_and_schema() -> None:
    bridged = build_tool_server([_greet_tool()])

    assert bridged.tool_names == ("mcp__rotaris__greet",)
    assert mcp_tool_name("rotaris", "greet") == "mcp__rotaris__greet"
    assert bridged.mcp_servers == {"rotaris": bridged.server}

    schema = bridged.definitions["greet"].to_mcp_tool()["inputSchema"]
    assert set(schema["properties"]) == {"name", "excited"}


@verifies(SWR.SWR_779)
async def test_calling_a_published_tool_runs_the_real_executor() -> None:
    bridged = build_tool_server([_greet_tool()])

    result = await bridged.handlers["greet"]({"name": "Ada", "excited": True})

    assert result["isError"] is False
    assert result["content"] == [{"type": "text", "text": "Hello Ada!"}]
    assert result["structuredContent"]["is_error"] is False


@verifies(SWR.SWR_779)
async def test_calling_a_published_tool_records_the_real_action_and_observation() -> None:
    bridged = build_tool_server([_greet_tool()])

    await bridged.handlers["greet"]({"name": "Ada"})
    invocation = bridged.invocations.pop("greet", {"name": "Ada"})

    assert invocation is not None
    assert isinstance(invocation.action, _GreetAction)
    assert invocation.action.name == "Ada"
    assert isinstance(invocation.observation, _GreetObservation)
    assert render_observation(invocation.observation) == "Hello Ada."


@verifies(SWR.SWR_779)
async def test_failing_tool_is_reported_as_an_error_result() -> None:
    bridged = build_tool_server([_greet_tool(_ExplodingExecutor())])

    result = await bridged.handlers["greet"]({"name": "Ada"})

    assert result["isError"] is True
    assert "the sandbox refused this command" in result["content"][0]["text"]
    invocation = bridged.invocations.pop("greet", {"name": "Ada"})
    assert invocation is not None
    assert invocation.observation is None
    assert invocation.error is not None


@verifies(SWR.SWR_779)
async def test_invalid_arguments_are_reported_instead_of_raising() -> None:
    bridged = build_tool_server([_greet_tool()])

    result = await bridged.handlers["greet"]({"name": {"not": "a string"}})

    assert result["isError"] is True
    assert "Invalid arguments for greet" in result["content"][0]["text"]


@verifies(SWR.SWR_779)
def test_invocation_log_hands_back_each_call_exactly_once() -> None:
    log = ToolInvocationLog()
    log.record(ToolInvocation(tool_name="greet", arguments={"name": "Ada"}, observation="first"))
    log.record(ToolInvocation(tool_name="greet", arguments={"name": "Grace"}, observation="second"))

    grace = log.pop("greet", {"name": "Grace"})
    assert grace is not None
    assert grace.observation == "second"
    assert log.pop("greet", {"name": "Grace"}) is None

    ada = log.pop("greet", {"name": "Ada"})
    assert ada is not None
    assert ada.observation == "first"
    assert len(log) == 0


@verifies(SWR.SWR_779)
def test_invocation_log_ignores_key_order_but_not_values() -> None:
    log = ToolInvocationLog()
    log.record(
        ToolInvocation(tool_name="greet", arguments={"name": "Ada", "excited": True}),
    )

    assert log.pop("greet", {"excited": True, "name": "Ada"}) is not None
    log.record(ToolInvocation(tool_name="greet", arguments={"name": "Ada"}))
    assert log.pop("greet", {"name": "Grace"}) is None


@verifies(SWR.SWR_779)
async def test_the_conversation_is_handed_to_the_tool_executor() -> None:
    """Meta-scheduling tools drive the conversation they run inside."""
    seen: list[Any] = []

    class _RecordingExecutor(ToolExecutor):
        def __call__(self, action: _GreetAction, conversation: Any = None) -> _GreetObservation:
            seen.append(conversation)
            return _GreetObservation(content=[TextContent(text="ok")])

    sentinel = object()
    bridged = build_tool_server(
        [_greet_tool(_RecordingExecutor())],
        conversation_provider=lambda: sentinel,
    )

    await bridged.handlers["greet"]({"name": "Ada"})

    assert seen == [sentinel]


@verifies(SWR.SWR_779)
def test_a_duplicate_tool_name_is_published_once() -> None:
    bridged = build_tool_server([_greet_tool(), _greet_tool()])

    assert bridged.tool_names == ("mcp__rotaris__greet",)


@verifies(SWR.SWR_779)
def test_render_observation_truncates_a_huge_result() -> None:
    observation = _GreetObservation(content=[TextContent(text="x" * 40_000)])

    rendered = render_observation(observation)

    assert rendered.endswith("[truncated]")
    assert len(rendered) < 40_000


@pytest.mark.parametrize("server_name", ["rotaris", "child-tools"])
@verifies(SWR.SWR_779)
def test_server_name_is_part_of_the_allowed_tool_names(server_name: str) -> None:
    bridged = build_tool_server([_greet_tool()], server_name=server_name)

    assert bridged.tool_names == (f"mcp__{server_name}__greet",)
    assert set(bridged.mcp_servers) == {server_name}
