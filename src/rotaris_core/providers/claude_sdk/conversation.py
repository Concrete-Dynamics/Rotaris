"""A Claude-backed conversation the Ralph loop can drive unchanged (SWR-778).

Rotaris's scheduler does not know what a conversation *is*. It knows what a
conversation *does*: ``send_message`` then a blocking ``run()``, ``pause()`` to
interrupt, ``close()`` to release, ``state.events`` to read back what happened.
Everything downstream — transcript extraction, stall detection, tool timing,
the report builder, the TUI, the desktop app — reads that surface duck-typed.

So the Claude Agent SDK is integrated *at that surface*, not deeper. Claude owns
the reasoning/tool loop inside one turn; Rotaris keeps the loop above it: which
child runs, in which workspace, with which tools, when to correct it, when to
stop it, and what the run produced.

Two consequences shape this module:

* ``run()`` must **block** — the scheduler drives it through
  ``asyncio.to_thread`` and its stall watchdog times it. The Agent SDK is async,
  so this owns a private event-loop thread and blocks the caller on it.
* Events are handed to the caller's thread, not the loop thread. Callbacks in
  the scheduler mutate run records and feed UI queues, and upstream
  ``LocalConversation`` invokes them from the thread that called ``run()``.
  Matching that keeps every existing callback's threading assumptions true.
"""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.providers.claude_sdk.events import (
    AssistantText,
    RunFinished,
    SessionStarted,
    TextDelta,
    ThinkingText,
    ToolCalled,
    ToolResulted,
)
from rotaris_core.providers.claude_sdk.session import ClaudeAgentSession, ClaudeSessionConfig
from rotaris_core.providers.claude_sdk.tool_bridge import ROTARIS_SERVER_NAME, build_tool_server
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine, Sequence

    from rotaris_core.providers.claude_sdk.events import AgentEvent

_log = logging.getLogger(__name__)

#: Model prefix that marks an agent as belonging to the claude-code provider.
#: ``build_claude_code_llm`` (SWR-777) already stamps it, so opting a persona in
#: is a provider choice rather than a separate switch.
CLAUDE_CODE_MODEL_PREFIX = "claude-code/"

_QUEUE_POLL_SECONDS = 0.05
_INTERRUPT_TIMEOUT_SECONDS = 10.0
_CLOSE_TIMEOUT_SECONDS = 10.0


class _EventLoopThread:
    """A private asyncio loop so a blocking caller can drive async work."""

    def __init__(self, name: str) -> None:
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._serve, name=name, daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def submit(self, coro: Coroutine[Any, Any, Any]) -> Any:
        return asyncio.run_coroutine_threadsafe(coro, self._loop)

    def stop(self) -> None:
        if self._loop.is_closed():
            return
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=_CLOSE_TIMEOUT_SECONDS)
        if not self._thread.is_alive():
            self._loop.close()


@traces(SWR.SWR_778)
class ClaudeSDKConversation:
    """A conversation whose turns are executed by a persistent Claude session.

    The object satisfies the conversation surface the scheduler drives. Its
    ``state`` is a real OpenHands ``ConversationState``, and the events recorded
    on it are real ``MessageEvent``/``ActionEvent``/``ObservationEvent`` values —
    not lookalikes — because the tool bridge executes Rotaris's own tools and so
    produces the genuine ``Action`` and ``Observation`` objects the rest of the
    system classifies outcomes from.
    """

    def __init__(
        self,
        agent: Any,
        *,
        workspace: Any,
        persistence_dir: Any = None,
        callbacks: Sequence[Any] | None = None,
        token_callbacks: Sequence[Any] | None = None,
        session_factory: Callable[[ClaudeSessionConfig, Any], Any] | None = None,
        token_loader: Callable[[], str | None] | None = None,
        max_turns: int | None = None,
        conversation_id: uuid.UUID | None = None,
    ) -> None:
        from openhands.sdk.conversation.state import ConversationState
        from openhands.sdk.workspace import LocalWorkspace

        self.agent = agent
        self._callbacks = list(callbacks or [])
        self._token_callbacks = list(token_callbacks or [])
        self._session_factory = session_factory
        self._token_loader = token_loader
        self._max_turns = max_turns

        resolved_workspace = (
            workspace
            if hasattr(workspace, "working_dir")
            else LocalWorkspace(working_dir=str(Path(workspace)))
        )
        self._workspace = resolved_workspace

        self._state = ConversationState.create(
            id=conversation_id or uuid.uuid4(),
            agent=agent,
            workspace=resolved_workspace,
            persistence_dir=str(persistence_dir) if persistence_dir is not None else None,
        )

        self._outbox: queue.Queue[tuple[str, Any]] = queue.Queue()
        self._pending: list[str] = []
        self._pending_lock = threading.Lock()
        self._loop = _EventLoopThread(name=f"claude-sdk-{self._state.id}")
        self._session: Any | None = None
        self._closed = False
        self._paused = False
        self._turn = 0
        self._claude_session_id = ""
        #: Claude's ``tool_use`` id → the ``ActionEvent`` id we recorded for it,
        #: so an observation can be linked back to the action that caused it.
        self._action_ids: dict[str, str] = {}
        #: Claude's ``tool_use`` id → (rotaris tool name, arguments), used to find
        #: the real executor result when the tool's output comes back.
        self._calls: dict[str, tuple[str, dict[str, Any]]] = {}
        self._tool_definitions: list[Any] = []

        self._initialize_agent()
        self._tools = build_tool_server(
            list(self._tool_definitions),
            conversation_provider=lambda: self,
        )

    # ------------------------------------------------------------------
    # Conversation surface
    # ------------------------------------------------------------------

    @property
    def id(self) -> Any:
        return self._state.id

    @property
    def state(self) -> Any:
        return self._state

    @property
    def workspace(self) -> Any:
        return self._workspace

    @property
    def tool_names(self) -> tuple[str, ...]:
        """The fully-qualified names Claude may call without a prompt."""
        return self._tools.tool_names

    @traces(SWR.SWR_778)
    def send_message(self, message: Any, sender: str | None = None) -> None:
        """Queue a user message for the next :meth:`run`.

        The message is recorded immediately so a paused or crashed run still
        shows what the child was asked; it is only *sent* when ``run()`` drives
        the turn, which is what upstream ``LocalConversation`` does too.
        """
        from openhands.sdk.event import MessageEvent
        from openhands.sdk.llm.message import Message, TextContent

        text = _message_text(message)
        if not text.strip():
            return

        with self._pending_lock:
            self._pending.append(text)

        self._deliver(
            MessageEvent(
                source="user",
                llm_message=Message(role="user", content=[TextContent(text=text)]),
                sender=sender,
            ),
        )

    @traces(SWR.SWR_778)
    def run(self) -> None:
        """Run every queued message to completion, blocking until Claude stops."""
        from openhands.sdk.conversation.state import ConversationExecutionStatus

        if self._closed:
            raise RuntimeError("Conversation is closed")

        self._paused = False
        with self._pending_lock:
            prompts = list(self._pending)
            self._pending.clear()
        if not prompts:
            return

        self._set_status(ConversationExecutionStatus.RUNNING)
        try:
            for prompt in prompts:
                if self._paused:
                    break
                self._turn += 1
                future = self._loop.submit(self._run_turn(prompt))
                self._pump(future)
        except BaseException:
            self._set_status(ConversationExecutionStatus.ERROR)
            raise
        else:
            self._set_status(
                ConversationExecutionStatus.PAUSED
                if self._paused
                else ConversationExecutionStatus.FINISHED,
            )

    @traces(SWR.SWR_778)
    def pause(self) -> None:
        """Interrupt the in-flight turn; ``run()`` returns once Claude stops."""
        self._paused = True
        session = self._session
        if session is None:
            return
        try:
            self._loop.submit(session.interrupt()).result(timeout=_INTERRUPT_TIMEOUT_SECONDS)
        except Exception:  # noqa: BLE001 - pause must never raise into the caller
            _log.debug("Claude session interrupt did not complete cleanly", exc_info=True)

    @traces(SWR.SWR_778)
    def close(self) -> None:
        """Disconnect the session and stop the private event loop."""
        if self._closed:
            return
        self._closed = True
        session = self._session
        self._session = None
        if session is not None:
            try:
                self._loop.submit(session.disconnect()).result(timeout=_CLOSE_TIMEOUT_SECONDS)
            except Exception:  # noqa: BLE001 - teardown is best effort
                _log.debug("Claude session disconnect did not complete cleanly", exc_info=True)
        self._loop.stop()

    def condense(self) -> None:
        """No-op: Claude Code compacts its own context.

        The scheduler calls this after a context-length failure. On the LiteLLM
        path Rotaris must condense the history it owns; here the history lives
        inside the Claude session, which compacts itself, so there is nothing
        truthful for Rotaris to do.
        """
        _log.debug("condense() is a no-op on the Claude backend; the SDK compacts its own context")

    def __enter__(self) -> ClaudeSDKConversation:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Turn execution
    # ------------------------------------------------------------------

    async def _run_turn(self, prompt: str) -> None:
        session = await self._ensure_session()
        async for event in session.run(prompt):
            self._translate(event)

    async def _ensure_session(self) -> Any:
        if self._session is not None:
            return self._session
        config = self._session_config()
        factory = self._session_factory
        session = (
            factory(config, self._tools)
            if factory is not None
            else ClaudeAgentSession(config, tools=self._tools)
        )
        await session.connect()
        self._session = session
        return session

    def _session_config(self) -> ClaudeSessionConfig:
        model = str(getattr(getattr(self.agent, "llm", None), "model", "") or "")
        if model.startswith(CLAUDE_CODE_MODEL_PREFIX):
            model = model[len(CLAUDE_CODE_MODEL_PREFIX) :]

        return ClaudeSessionConfig(
            model=model,
            system_prompt=self._system_prompt(),
            cwd=str(getattr(self._workspace, "working_dir", "")) or None,
            max_turns=self._max_turns,
            oauth_token=self._load_token(),
        )

    def _system_prompt(self) -> str | None:
        try:
            prompt = self.agent.static_system_message
        except Exception:  # noqa: BLE001 - a missing prompt must not block the run
            _log.debug("Agent has no static system message", exc_info=True)
            return None
        text = str(prompt or "").strip()
        return text or None

    def _load_token(self) -> str | None:
        if self._token_loader is not None:
            return self._token_loader()
        from rotaris_core.auth.storage import TokenStorage
        from rotaris_core.providers.claude_code import CLAUDE_CODE_PROVIDER_ID

        token_set = TokenStorage().load(CLAUDE_CODE_PROVIDER_ID)
        return None if token_set is None else token_set.access_token

    def _pump(self, future: Any) -> None:
        """Drain the outbox on the calling thread until the turn is done."""
        while True:
            try:
                kind, payload = self._outbox.get(timeout=_QUEUE_POLL_SECONDS)
            except queue.Empty:
                if future.done():
                    break
                continue
            if kind == "token":
                self._emit_token(payload)
            else:
                self._deliver(payload)
        future.result()

    # ------------------------------------------------------------------
    # Event translation (runs on the loop thread; only enqueues)
    # ------------------------------------------------------------------

    def _translate(self, event: AgentEvent) -> None:
        if isinstance(event, SessionStarted):
            self._claude_session_id = event.session_id
            return
        if isinstance(event, TextDelta):
            if event.text:
                self._outbox.put(("token", event.text))
            return
        if isinstance(event, AssistantText):
            self._outbox.put(("event", self._assistant_event(event.text)))
            return
        if isinstance(event, ThinkingText):
            self._outbox.put(("event", self._assistant_event(event.text, thinking=True)))
            return
        if isinstance(event, ToolCalled):
            action_event = self._action_event(event)
            if action_event is not None:
                self._outbox.put(("event", action_event))
            return
        if isinstance(event, ToolResulted):
            observation_event = self._observation_event(event)
            if observation_event is not None:
                self._outbox.put(("event", observation_event))
            return
        if isinstance(event, RunFinished):
            self._record_usage(event)

    def _assistant_event(self, text: str, *, thinking: bool = False) -> Any:
        from openhands.sdk.event import MessageEvent
        from openhands.sdk.llm.message import Message, TextContent

        message = Message(role="assistant", content=[TextContent(text=text)])
        if thinking:
            # Rotaris's progress classifier reads ``reasoning_content`` to tell
            # deliberation apart from output; extended thinking is exactly that.
            message = Message(
                role="assistant",
                content=[TextContent(text=text)],
                reasoning_content=text,
            )
        return MessageEvent(source="agent", llm_message=message)

    def _action_event(self, event: ToolCalled) -> Any:
        from openhands.sdk.event import ActionEvent
        from openhands.sdk.llm.message import MessageToolCall

        tool_name = self._local_tool_name(event.tool_name)
        arguments = dict(event.arguments)
        self._calls[event.call_id] = (tool_name, arguments)

        action_event = ActionEvent(
            source="agent",
            thought=[],
            action=self._build_action(tool_name, arguments),
            tool_name=tool_name,
            tool_call_id=event.call_id,
            tool_call=MessageToolCall(
                id=event.call_id,
                name=tool_name,
                arguments=json.dumps(arguments, default=str),
                origin="completion",
            ),
            llm_response_id=self._llm_response_id(),
        )
        self._action_ids[event.call_id] = action_event.id
        return action_event

    def _observation_event(self, event: ToolResulted) -> Any:
        from openhands.sdk.event import ObservationEvent

        tool_name, arguments = self._calls.pop(event.call_id, ("", {}))
        action_id = self._action_ids.pop(event.call_id, "")
        if not action_id:
            # A result without a recorded call is a tool Rotaris never published
            # (or one whose call arrived after its result); nothing downstream
            # can attribute it, so recording it would only add noise.
            return None

        invocation = self._tools.invocations.pop(tool_name, arguments)
        observation = None if invocation is None else invocation.observation
        if observation is None:
            observation = self._fallback_observation(tool_name, event)

        return ObservationEvent(
            source="environment",
            tool_name=tool_name,
            tool_call_id=event.call_id,
            observation=observation,
            action_id=action_id,
        )

    def _build_action(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Validate arguments into the tool's real ``Action`` when we can."""
        from openhands.sdk.mcp.definition import MCPToolAction

        definition = self._tools.definitions.get(tool_name)
        if definition is not None:
            try:
                return definition.action_type.model_validate(arguments)
            except Exception:  # noqa: BLE001 - the handler reports invalid input
                _log.debug("Could not build a typed action for %r", tool_name, exc_info=True)
        return MCPToolAction(data=arguments)

    def _fallback_observation(self, tool_name: str, event: ToolResulted) -> Any:
        from openhands.sdk.llm.message import TextContent
        from openhands.sdk.mcp.definition import MCPToolObservation

        return MCPToolObservation(
            tool_name=tool_name,
            content=[TextContent(text=event.content)],
            is_error=event.is_error,
        )

    def _local_tool_name(self, name: str) -> str:
        prefix = f"mcp__{self._tools.server_name}__"
        return name[len(prefix) :] if name.startswith(prefix) else name

    def _llm_response_id(self) -> str:
        session = self._claude_session_id or str(self._state.id)
        return f"claude-{session}-{self._turn}"

    @traces(SWR.SWR_778)
    def _record_usage(self, event: RunFinished) -> None:
        """Fold Claude's reported usage into the agent's own LLM metrics."""
        metrics = getattr(getattr(self.agent, "llm", None), "metrics", None)
        if metrics is None:
            return
        usage = event.usage or {}
        try:
            metrics.add_token_usage(
                prompt_tokens=int(usage.get("input_tokens", 0) or 0),
                completion_tokens=int(usage.get("output_tokens", 0) or 0),
                cache_read_tokens=int(usage.get("cache_read_input_tokens", 0) or 0),
                cache_write_tokens=int(usage.get("cache_creation_input_tokens", 0) or 0),
                context_window=0,
                response_id=self._llm_response_id(),
            )
            if event.total_cost_usd:
                metrics.add_cost(float(event.total_cost_usd))
        except Exception:  # noqa: BLE001 - accounting must not fail a run
            _log.debug("Could not record Claude usage on the agent metrics", exc_info=True)

    # ------------------------------------------------------------------
    # Plumbing
    # ------------------------------------------------------------------

    def _initialize_agent(self) -> None:
        """Resolve the agent's tools against this conversation's state."""
        agent = self.agent
        if getattr(agent, "supports_openhands_tools", True):
            agent._initialize(self._state)  # noqa: SLF001 - upstream's own init path
        try:
            agent.init_state(self._state, on_event=self._deliver)
        except Exception:  # noqa: BLE001 - a missing hook must not block the run
            _log.debug("Agent init_state failed; continuing without it", exc_info=True)

        try:
            self._tool_definitions = list(agent.tools_map.values())
        except Exception:  # noqa: BLE001 - an agent without tools is still usable
            _log.debug("Agent exposes no resolved tools", exc_info=True)
            self._tool_definitions = []

    def _deliver(self, event: Any) -> None:
        with self._state:
            self._state.append_event(event)
        for callback in self._callbacks:
            try:
                callback(event)
            except Exception:  # noqa: BLE001 - one bad callback must not kill the run
                _log.exception("Conversation callback failed on the Claude backend")

    def _emit_token(self, chunk: Any) -> None:
        for callback in self._token_callbacks:
            try:
                callback(chunk)
            except Exception:  # noqa: BLE001 - streaming display is not critical
                _log.exception("Token callback failed on the Claude backend")

    def _set_status(self, status: Any) -> None:
        with self._state:
            self._state.execution_status = status


def _message_text(message: Any) -> str:
    if isinstance(message, str):
        return message
    parts = [
        str(getattr(item, "text", ""))
        for item in getattr(message, "content", []) or []
        if getattr(item, "text", "")
    ]
    return "\n".join(parts)


@traces(SWR.SWR_778)
def is_claude_code_agent(agent: Any) -> bool:
    """Whether *agent*'s model routes through the claude-code provider."""
    model = str(getattr(getattr(agent, "llm", None), "model", "") or "")
    return model.startswith(CLAUDE_CODE_MODEL_PREFIX)


@traces(SWR.SWR_778)
def claude_sdk_conversation_if_supported(
    agent: Any,
    *,
    workspace: Any,
    persistence_dir: Any = None,
    callbacks: Sequence[Any] | None = None,
    token_callbacks: Sequence[Any] | None = None,
    enabled: bool = True,
) -> ClaudeSDKConversation | None:
    """Return a Claude-backed conversation, or ``None`` to use the default one.

    This is the whole selection rule, in one place: the agent's model must name
    the claude-code provider, and the runtime policy must not have turned the
    native loop off. Everything else about the child — persona, tools, workspace,
    prompts — is unchanged, so switching backends is a provider choice rather
    than a different way of running a task.
    """
    if not enabled or not is_claude_code_agent(agent):
        return None
    return ClaudeSDKConversation(
        agent,
        workspace=workspace,
        persistence_dir=persistence_dir,
        callbacks=callbacks,
        token_callbacks=token_callbacks,
    )


__all__ = [
    "CLAUDE_CODE_MODEL_PREFIX",
    "ROTARIS_SERVER_NAME",
    "ClaudeSDKConversation",
    "claude_sdk_conversation_if_supported",
    "is_claude_code_agent",
]
