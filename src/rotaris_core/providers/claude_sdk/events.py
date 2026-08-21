"""Rotaris's own event vocabulary for a Claude Agent SDK run (SWR-779).

These are the only values that cross the ``providers/claude_sdk`` boundary. The
Agent SDK's own types (``StreamEvent``, ``AssistantMessage``, ``ToolUseBlock``,
``ToolResultBlock``, ``ResultMessage``) stop at :mod:`~.translate`; everything
downstream — the conversation facade, the scheduler, the TUI, the desktop app —
sees only the dataclasses below.

The split between the *delta* events and the *completed* ones is deliberate and
is the rule the conversation facade follows: stream deltas are for showing
progress, completed events are authoritative. A partial ``tool.input`` JSON
fragment must never be treated as a tool's arguments.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from rotaris_core.reqtocode import SWR, traces


@dataclass(frozen=True, slots=True)
class SessionStarted:
    """The SDK announced the session it opened and what it can reach."""

    session_id: str = ""
    model: str = ""
    tools: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class TextDelta:
    """A fragment of assistant text, for live display only."""

    text: str


@dataclass(frozen=True, slots=True)
class ThinkingDelta:
    """A fragment of extended thinking, for live display only."""

    text: str


@dataclass(frozen=True, slots=True)
class ToolStarted:
    """A tool call began streaming; its arguments are not known yet."""

    call_id: str
    tool_name: str


@dataclass(frozen=True, slots=True)
class ToolInputDelta:
    """A fragment of a tool call's argument JSON, for live display only."""

    call_id: str
    partial_json: str


@traces(SWR.SWR_779)
@dataclass(frozen=True, slots=True)
class ToolCalled:
    """A complete tool call: this is the authoritative view of its arguments."""

    call_id: str
    tool_name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@traces(SWR.SWR_779)
@dataclass(frozen=True, slots=True)
class ToolResulted:
    """A tool call's outcome as Claude received it."""

    call_id: str
    content: str = ""
    is_error: bool = False


@traces(SWR.SWR_779)
@dataclass(frozen=True, slots=True)
class AssistantText:
    """A completed block of assistant prose."""

    text: str


@dataclass(frozen=True, slots=True)
class ThinkingText:
    """A completed block of extended thinking."""

    text: str


@traces(SWR.SWR_779)
@dataclass(frozen=True, slots=True)
class RunFinished:
    """The end of one agent turn, with its terminal status and usage."""

    subtype: str = ""
    text: str = ""
    is_error: bool = False
    session_id: str = ""
    num_turns: int = 0
    total_cost_usd: float | None = None
    usage: dict[str, Any] = field(default_factory=dict)


#: Every value the Claude backend may hand to the rest of Rotaris.
AgentEvent = (
    SessionStarted
    | TextDelta
    | ThinkingDelta
    | ToolStarted
    | ToolInputDelta
    | ToolCalled
    | ToolResulted
    | AssistantText
    | ThinkingText
    | RunFinished
)

__all__ = [
    "AgentEvent",
    "AssistantText",
    "RunFinished",
    "SessionStarted",
    "TextDelta",
    "ThinkingDelta",
    "ThinkingText",
    "ToolCalled",
    "ToolInputDelta",
    "ToolResulted",
    "ToolStarted",
]
