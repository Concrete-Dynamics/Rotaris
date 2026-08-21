"""The persistent Claude Agent SDK session behind a Rotaris child (SWR-778).

One :class:`ClaudeAgentSession` wraps one ``ClaudeSDKClient`` for the lifetime of
one child task. That is the difference from the SWR-777 shim: the shim issued a
stateless ``query()`` per LLM completion, so a follow-up turn — a todo
correction, a steering prompt, a repair continuation — met a model that had never
seen the work it was being asked to continue. A connected client keeps the
conversation, which is what makes the Ralph loop's correction machinery mean
anything on this backend.

The session is async and speaks only Rotaris's events (:mod:`~.events`); the
synchronous facade the scheduler drives lives in :mod:`~.conversation`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from rotaris_core.providers.claude_sdk.translate import translate_message
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable, Mapping, Sequence

    from rotaris_core.providers.claude_sdk.events import AgentEvent
    from rotaris_core.providers.claude_sdk.tool_bridge import BridgedTools

_log = logging.getLogger(__name__)

SDK_MISSING_MESSAGE = (
    "The 'claude-agent-sdk' package is required for the claude-code provider "
    "but is not installed. Install it with 'uv add claude-agent-sdk' and make "
    "sure Claude Code itself is installed "
    "(curl -fsSL https://claude.ai/install.sh | bash)."
)


@traces(SWR.SWR_778)
@dataclass(frozen=True)
class ClaudeSessionConfig:
    """Everything one Claude session needs, resolved before it connects."""

    model: str
    system_prompt: str | None = None
    cwd: str | None = None
    max_turns: int | None = None
    oauth_token: str | None = None
    env: Mapping[str, str] = field(default_factory=dict)
    permission_mode: str | None = None
    include_partial_messages: bool = True
    #: Claude Code's own built-in tools to allow alongside Rotaris's. The empty
    #: default means *none*: Rotaris publishes its own hardened terminal, file
    #: engine and the rest through the tool bridge, and letting Claude reach past
    #: them would route work around Rotaris's permission and sandbox layers.
    #: ``None`` means "leave the SDK's default set alone".
    builtin_tools: tuple[str, ...] | None = ()
    #: Extra fully-qualified tool names to allow without a permission prompt.
    extra_allowed_tools: tuple[str, ...] = ()
    #: Claude Code settings scopes to load. ``None`` (the default) loads none, so
    #: a Rotaris run does not silently inherit the user's interactive Claude
    #: Code configuration.
    setting_sources: tuple[str, ...] | None = None


@traces(SWR.SWR_778)
class ClaudeAgentSession:
    """A connected Claude Agent SDK client, yielding Rotaris events.

    ``client_factory`` exists so the whole session can be driven by a fake in
    tests: nothing here needs a Claude Code install to be exercised.
    """

    def __init__(
        self,
        config: ClaudeSessionConfig,
        *,
        tools: BridgedTools | None = None,
        client_factory: Callable[[Any], Any] | None = None,
    ) -> None:
        self._config = config
        self._tools = tools
        self._client_factory = client_factory
        self._client: Any | None = None

    @property
    def connected(self) -> bool:
        return self._client is not None

    @property
    def config(self) -> ClaudeSessionConfig:
        return self._config

    @traces(SWR.SWR_778)
    def build_options(self) -> Any:
        """Assemble the ``ClaudeAgentOptions`` this session connects with."""
        options_cls = _options_cls()
        config = self._config

        env = dict(config.env)
        if config.oauth_token:
            env["CLAUDE_CODE_OAUTH_TOKEN"] = config.oauth_token

        allowed = list(self._tools.tool_names) if self._tools is not None else []
        allowed.extend(config.extra_allowed_tools)

        kwargs: dict[str, Any] = {
            "model": config.model,
            "env": env,
            "allowed_tools": allowed,
            "include_partial_messages": config.include_partial_messages,
        }
        if self._tools is not None:
            kwargs["mcp_servers"] = self._tools.mcp_servers
        if config.system_prompt is not None:
            kwargs["system_prompt"] = config.system_prompt
        if config.cwd is not None:
            kwargs["cwd"] = config.cwd
        if config.max_turns is not None:
            kwargs["max_turns"] = config.max_turns
        if config.permission_mode is not None:
            kwargs["permission_mode"] = config.permission_mode
        if config.builtin_tools is not None:
            kwargs["tools"] = list(config.builtin_tools)
        if config.setting_sources is not None:
            kwargs["setting_sources"] = list(config.setting_sources)

        return options_cls(**kwargs)

    @traces(SWR.SWR_778)
    async def connect(self) -> None:
        """Open the session, refusing to start on a conflicting credential.

        The SWR-777 precheck runs here rather than per request: a connected
        client outlives any single turn, so the environment that would divert
        billing away from the subscription has to be checked before the
        transport exists, not after.
        """
        if self._client is not None:
            return

        from rotaris_core.providers.claude_code import ensure_no_conflicting_credentials

        ensure_no_conflicting_credentials(self._config.env or None)

        options = self.build_options()
        factory = self._client_factory
        if factory is None:
            factory = _default_client_factory()
        client = factory(options)
        await client.connect()
        self._client = client

    @traces(SWR.SWR_778)
    async def disconnect(self) -> None:
        """Close the session and release its transport, tolerating a dead one."""
        client = self._client
        self._client = None
        if client is None:
            return
        try:
            await client.disconnect()
        except Exception:  # noqa: BLE001 - teardown must not raise into shutdown
            _log.debug("Claude session disconnect failed; transport already gone", exc_info=True)

    @traces(SWR.SWR_778)
    async def run(self, prompt: str) -> AsyncIterator[AgentEvent]:
        """Send *prompt* and yield Rotaris events until the turn completes."""
        if self._client is None:
            await self.connect()
        client = self._client
        if client is None:  # pragma: no cover - connect() either sets or raises
            raise RuntimeError("Claude session is not connected")

        await client.query(prompt)
        async for message in client.receive_response():
            for event in translate_message(message):
                yield event

    @traces(SWR.SWR_778)
    async def interrupt(self) -> None:
        """Ask Claude to abandon the in-flight turn."""
        client = self._client
        if client is None:
            return
        try:
            await client.interrupt()
        except Exception:  # noqa: BLE001 - an interrupt is best effort
            _log.debug("Claude session interrupt failed", exc_info=True)


@traces(SWR.SWR_778)
def resolve_allowed_tools(tools: BridgedTools | None, extra: Sequence[str] = ()) -> tuple[str, ...]:
    """Return the tool names a session should allow without a prompt."""
    names = list(tools.tool_names) if tools is not None else []
    names.extend(extra)
    return tuple(names)


def _options_cls() -> Any:
    try:
        from claude_agent_sdk import ClaudeAgentOptions
    except ImportError as exc:  # pragma: no cover - exercised by the install path
        raise RuntimeError(SDK_MISSING_MESSAGE) from exc
    return ClaudeAgentOptions


def _default_client_factory() -> Callable[[Any], Any]:
    try:
        from claude_agent_sdk import ClaudeSDKClient
    except ImportError as exc:  # pragma: no cover - exercised by the install path
        raise RuntimeError(SDK_MISSING_MESSAGE) from exc
    return lambda options: ClaudeSDKClient(options=options)


__all__ = [
    "SDK_MISSING_MESSAGE",
    "ClaudeAgentSession",
    "ClaudeSessionConfig",
    "resolve_allowed_tools",
]
