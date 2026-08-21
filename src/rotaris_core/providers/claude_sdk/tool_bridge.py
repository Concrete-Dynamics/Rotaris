"""Publish Rotaris's own tools to the Claude Agent SDK (SWR-779).

The Agent SDK can host an MCP server *inside* the calling process: no subprocess,
no stdio transport, just Python callables it invokes directly. That is the seam
this module uses. Every tool a persona already has — the hardened terminal, the
file engine, todo, delegate, whatever the persona's ``tools:`` list resolved to —
is published under one server so Claude reasons and acts with Rotaris's
capabilities rather than a parallel set of its own.

Two properties matter and both come from deriving everything from the resolved
:class:`~openhands.sdk.tool.ToolDefinition`:

* A tool cannot describe itself differently to Claude than it does to any other
  model — name, description and input schema all come from the definition.
* A call is validated into the tool's own ``Action`` model and executed by the
  tool's own executor, so the permission wrapper, the sandbox, and the
  observation type all still apply.

Every invocation is also recorded in a :class:`ToolInvocationLog`. The Agent SDK
tells us a tool *result* through the message stream without telling us which
Python call produced it, and the real ``Observation`` object is what downstream
outcome classification (terminal exit codes, edited files) needs. Matching on
tool name plus arguments recovers that link, and is safe under parallel tool
calls in a way that matching on order alone would not be.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk.tool import ToolDefinition

_log = logging.getLogger(__name__)

#: The MCP server name Rotaris publishes its tools under. Part of the public
#: tool names Claude sees (``mcp__rotaris__<tool>``), so changing it changes
#: every ``allowed_tools`` entry.
ROTARIS_SERVER_NAME = "rotaris"

_MAX_RESULT_CHARS = 30_000


@traces(SWR.SWR_779)
def mcp_tool_name(server_name: str, tool_name: str) -> str:
    """Return the fully-qualified name the SDK exposes an in-process tool under."""
    return f"mcp__{server_name}__{tool_name}"


@traces(SWR.SWR_779)
@dataclass(frozen=True, slots=True)
class ToolInvocation:
    """One completed call of a published tool, with its real domain objects."""

    tool_name: str
    arguments: dict[str, Any]
    action: Any | None = None
    observation: Any | None = None
    error: str | None = None


@traces(SWR.SWR_779)
class ToolInvocationLog:
    """Correlates a tool result from Claude's stream back to what actually ran.

    Keyed by ``(tool_name, arguments)`` rather than by arrival order: Claude may
    issue several tool calls in one turn and they complete out of order, but two
    concurrent calls of the same tool with the same arguments are
    indistinguishable anyway, so consuming either one is correct.
    """

    def __init__(self) -> None:
        self._entries: list[ToolInvocation] = []

    def record(self, invocation: ToolInvocation) -> None:
        self._entries.append(invocation)

    def pop(self, tool_name: str, arguments: Mapping[str, Any]) -> ToolInvocation | None:
        """Return and consume the recorded call matching *tool_name*/*arguments*."""
        key = _argument_key(arguments)
        for index, entry in enumerate(self._entries):
            if entry.tool_name == tool_name and _argument_key(entry.arguments) == key:
                return self._entries.pop(index)
        return None

    def __len__(self) -> int:
        return len(self._entries)


@traces(SWR.SWR_779)
@dataclass(frozen=True, slots=True)
class BridgedTools:
    """The published server plus everything a caller needs to wire it up."""

    server: Any
    server_name: str
    tool_names: tuple[str, ...]
    definitions: dict[str, Any] = field(default_factory=dict)
    invocations: ToolInvocationLog = field(default_factory=ToolInvocationLog)
    #: Rotaris tool name → the same coroutine the SDK server calls. Kept so a
    #: caller can execute a published tool without speaking MCP.
    handlers: dict[str, Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]] = field(
        default_factory=dict,
    )

    @property
    def mcp_servers(self) -> dict[str, Any]:
        """The ``mcp_servers`` mapping to hand to ``ClaudeAgentOptions``."""
        return {self.server_name: self.server}


@traces(SWR.SWR_778, SWR.SWR_779)
def build_tool_server(
    definitions: Sequence[ToolDefinition[Any, Any]],
    *,
    server_name: str = ROTARIS_SERVER_NAME,
    version: str = "1.0.0",
    conversation_provider: Callable[[], Any] | None = None,
    invocations: ToolInvocationLog | None = None,
) -> BridgedTools:
    """Publish *definitions* as one in-process MCP server for the Agent SDK.

    ``conversation_provider`` supplies the object a tool executor receives as its
    ``conversation`` argument. Meta-scheduling tools (``wait_for_tasks``, the
    delegate tool) drive the conversation they run inside, so handing them the
    Claude-backed conversation keeps them working on this backend too.
    """
    from claude_agent_sdk import SdkMcpTool, create_sdk_mcp_server

    log = invocations if invocations is not None else ToolInvocationLog()
    sdk_tools: list[Any] = []
    by_name: dict[str, Any] = {}
    handlers: dict[str, Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]] = {}

    for definition in definitions:
        name = str(getattr(definition, "name", "") or "")
        if not name:
            continue
        if name in by_name:
            _log.debug("Skipping duplicate tool %r when publishing to the Agent SDK", name)
            continue
        by_name[name] = definition
        handlers[name] = _make_handler(definition, name, log, conversation_provider)
        sdk_tools.append(
            SdkMcpTool(
                name=name,
                description=str(getattr(definition, "description", "") or ""),
                input_schema=_input_schema(definition),
                handler=handlers[name],
            ),
        )

    server = create_sdk_mcp_server(name=server_name, version=version, tools=sdk_tools)
    return BridgedTools(
        server=server,
        server_name=server_name,
        tool_names=tuple(mcp_tool_name(server_name, name) for name in by_name),
        definitions=by_name,
        invocations=log,
        handlers=handlers,
    )


def _input_schema(definition: ToolDefinition[Any, Any]) -> dict[str, Any]:
    """Return the JSON Schema Claude should validate this tool's input against."""
    try:
        schema = definition.to_mcp_tool().get("inputSchema")
    except Exception:  # noqa: BLE001 - a broken schema must not drop the tool
        _log.exception("Could not derive an MCP schema for tool %r", definition.name)
        schema = None
    if isinstance(schema, Mapping):
        return dict(schema)
    return {"type": "object", "properties": {}}


def _make_handler(
    definition: ToolDefinition[Any, Any],
    name: str,
    log: ToolInvocationLog,
    conversation_provider: Callable[[], Any] | None,
) -> Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]:
    """Build the async MCP handler that runs one Rotaris tool."""

    async def handler(args: dict[str, Any]) -> dict[str, Any]:
        arguments = dict(args or {})
        conversation = conversation_provider() if conversation_provider is not None else None

        try:
            action = definition.action_type.model_validate(arguments)
        except Exception as exc:  # noqa: BLE001 - report bad input, never crash
            message = f"Invalid arguments for {name}: {exc}"
            log.record(ToolInvocation(tool_name=name, arguments=arguments, error=message))
            return _error_result(message)

        try:
            observation = await definition.acall(action, conversation)
        except Exception as exc:  # noqa: BLE001 - a tool failure is a tool result
            message = f"{type(exc).__name__}: {exc}"
            _log.warning("Tool %s failed while running for the Claude backend: %s", name, message)
            log.record(
                ToolInvocation(
                    tool_name=name,
                    arguments=arguments,
                    action=action,
                    error=message,
                ),
            )
            return _error_result(message)

        log.record(
            ToolInvocation(
                tool_name=name,
                arguments=arguments,
                action=action,
                observation=observation,
            ),
        )
        return _success_result(observation)

    return handler


def _success_result(observation: Any) -> dict[str, Any]:
    text = render_observation(observation)
    result: dict[str, Any] = {
        "content": [{"type": "text", "text": text}],
        "isError": bool(getattr(observation, "is_error", False)),
    }
    structured = _structured(observation)
    if structured is not None:
        result["structuredContent"] = structured
    return result


def _error_result(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}], "isError": True}


@traces(SWR.SWR_779)
def render_observation(observation: Any) -> str:
    """Render an ``Observation`` as the text Claude should reason over.

    Prefers the observation's own ``to_llm_content`` — that is what the tool
    author wrote for a model to read — and falls back to a plain rendering so an
    observation without it still says something useful rather than nothing.
    """
    parts: list[str] = []
    content = getattr(observation, "to_llm_content", None)
    if isinstance(content, Sequence) and not isinstance(content, str | bytes):
        for item in content:
            text = getattr(item, "text", None)
            if text:
                parts.append(str(text))
    if not parts:
        text = getattr(observation, "text", None)
        parts = [str(text)] if text else [str(observation)]

    rendered = "\n".join(parts)
    if len(rendered) > _MAX_RESULT_CHARS:
        return rendered[:_MAX_RESULT_CHARS] + "\n…[truncated]"
    return rendered


def _structured(observation: Any) -> dict[str, Any] | None:
    dump = getattr(observation, "model_dump", None)
    if not callable(dump):
        return None
    try:
        data = dump(mode="json")
    except Exception:  # noqa: BLE001 - structured output is a nicety
        return None
    return data if isinstance(data, dict) else None


def _argument_key(arguments: Mapping[str, Any]) -> str:
    try:
        return json.dumps(arguments, sort_keys=True, default=str)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return repr(sorted(arguments.items(), key=lambda item: item[0]))


__all__ = [
    "ROTARIS_SERVER_NAME",
    "BridgedTools",
    "ToolInvocation",
    "ToolInvocationLog",
    "build_tool_server",
    "mcp_tool_name",
    "render_observation",
]
