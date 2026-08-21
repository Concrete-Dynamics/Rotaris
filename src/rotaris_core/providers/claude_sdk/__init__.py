"""The Claude Agent SDK backend for Rotaris (SWR-778, SWR-779).

This package is a boundary. Inside it, Claude Agent SDK types are used freely;
outside it, nothing sees them. What crosses the line is a conversation object the
scheduler already knows how to drive and, for callers that want the raw stream,
Rotaris's own event dataclasses.

Imports are lazy so that merely importing :mod:`rotaris_core.providers` does not
require ``claude-agent-sdk`` to be installed — the SDK is only needed when a
Claude-backed child actually runs.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.providers.claude_sdk.events import (
    AgentEvent,
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

if TYPE_CHECKING:
    from rotaris_core.providers.claude_sdk.conversation import (
        ClaudeSDKConversation,
        claude_sdk_conversation_if_supported,
        is_claude_code_agent,
    )
    from rotaris_core.providers.claude_sdk.session import (
        ClaudeAgentSession,
        ClaudeSessionConfig,
    )
    from rotaris_core.providers.claude_sdk.tool_bridge import (
        ROTARIS_SERVER_NAME,
        BridgedTools,
        build_tool_server,
    )

_LAZY: dict[str, str] = {
    "ClaudeSDKConversation": "conversation",
    "claude_sdk_conversation_if_supported": "conversation",
    "is_claude_code_agent": "conversation",
    "ClaudeAgentSession": "session",
    "ClaudeSessionConfig": "session",
    "BridgedTools": "tool_bridge",
    "build_tool_server": "tool_bridge",
    "ROTARIS_SERVER_NAME": "tool_bridge",
}


def __getattr__(name: str) -> Any:
    module_name = _LAZY.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib

    module = importlib.import_module(f"{__name__}.{module_name}")
    return getattr(module, name)


__all__ = [
    "ROTARIS_SERVER_NAME",
    "AgentEvent",
    "AssistantText",
    "BridgedTools",
    "ClaudeAgentSession",
    "ClaudeSDKConversation",
    "ClaudeSessionConfig",
    "RunFinished",
    "SessionStarted",
    "TextDelta",
    "ThinkingDelta",
    "ThinkingText",
    "ToolCalled",
    "ToolInputDelta",
    "ToolResulted",
    "ToolStarted",
    "build_tool_server",
    "claude_sdk_conversation_if_supported",
    "is_claude_code_agent",
    "translate_message",
]
