"""Drive `_SessionObserver` with real SDK events, the way a live run does.

Two test modules need the same seam: SDK event → ``_SessionObserver`` →
persisted session → ``ConfigService.apply_session`` → ``WorkspaceStore``. Before
this module they shared it by importing private helpers across test files, which
made one module's refactor able to break another's collection.

Everything here is real except the LLM and the scheduler: real OpenHands event
objects, a real ``SessionManager`` writing to a real directory, and the same
callback binding ``RunBridge._RunWorker`` performs. That is what makes an
assertion about a transcript row mean the shipped pipeline produced it.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
from rotaris_core.session.manager import SessionManager

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import _SessionObserver

if TYPE_CHECKING:
    from pathlib import Path

__all__ = [
    "ObserverHarness",
    "action_event",
    "demo_config",
    "feed_conversation",
    "message_event",
    "observation_event",
    "sdk_events",
    "token_chunk",
]


def feed_conversation(state: Any, record: Any, *events: object) -> None:
    """Record conversation events the way ``orchestrator/child_run`` does.

    A fake ``_run_task`` stands in for the engine, so it has to do the engine's
    half of the seam. The transcript is written by the session's own recorder
    (SWR-2454), reached through the registry — *not* by whatever conversation
    callback a host installed, because a host replaces that callback and would
    then be the only host whose runs recorded anything.
    """
    from rotaris_core.session.transcript import resolve_transcript_recorder

    recorder = resolve_transcript_recorder(state.session_id)
    if recorder is None:
        return
    for event in events:
        recorder.record_conversation_event(record.canonical_name, record.persona, event)


def sdk_events():
    """The SDK event classes plus two concrete tool types to instantiate them.

    Imported lazily: the OpenHands SDK is heavy, and modules that only need the
    fakes should not pay for it at collection time.
    """
    from openhands.sdk.event.llm_convertible.action import ActionEvent
    from openhands.sdk.event.llm_convertible.message import MessageEvent
    from openhands.sdk.event.llm_convertible.observation import (
        AgentErrorEvent,
        ObservationEvent,
    )
    from openhands.sdk.llm import Message, MessageToolCall, TextContent
    from openhands.sdk.tool import Action, Observation

    class DemoAction(Action):
        command: str = ""

    class DemoObservation(Observation):
        output: str = ""
        ui_diff: dict[str, object] | None = None

        @property
        def to_llm_content(self):  # noqa: ANN202
            return [TextContent(text=self.output)]

    return SimpleNamespace(
        ActionEvent=ActionEvent,
        MessageEvent=MessageEvent,
        ObservationEvent=ObservationEvent,
        AgentErrorEvent=AgentErrorEvent,
        Message=Message,
        MessageToolCall=MessageToolCall,
        TextContent=TextContent,
        DemoAction=DemoAction,
        DemoObservation=DemoObservation,
    )


def action_event(
    sdk,
    call_id: str = "call-1",
    command: str = "pytest -x -q",
    tool_name: str = "shell",
    **kwargs,
):
    """An agent's tool call, as the SDK emits it."""
    tool_call = sdk.MessageToolCall(
        id=call_id,
        name=tool_name,
        arguments=f'{{"command": "{command}"}}',
        origin="completion",
    )
    kwargs.setdefault("thought", [])
    return sdk.ActionEvent(
        source="agent",
        tool_name=tool_name,
        tool_call_id=call_id,
        tool_call=tool_call,
        action=sdk.DemoAction(command=command),
        llm_response_id="resp-1",
        **kwargs,
    )


def observation_event(
    sdk,
    action,
    output: str = "3 passed",
    *,
    ui_diff: dict[str, object] | None = None,
):
    """The environment's answer to ``action``, closing that tool call."""
    return sdk.ObservationEvent(
        source="environment",
        tool_name=action.tool_name,
        tool_call_id=action.tool_call_id,
        action_id=action.id,
        observation=sdk.DemoObservation(output=output, ui_diff=ui_diff),
    )


def message_event(sdk, text: str):
    """A committed assistant message."""
    return sdk.MessageEvent(
        source="agent",
        llm_message=sdk.Message(role="assistant", content=[sdk.TextContent(text=text)]),
    )


def token_chunk(text: str = "", reasoning: str = ""):
    """One streaming delta, shaped the way the completion callback receives it."""
    delta = SimpleNamespace(content=text or None, tool_calls=None)
    if reasoning:
        delta.reasoning_content = reasoning
    return SimpleNamespace(choices=[SimpleNamespace(delta=delta)])


def demo_config() -> RotarisConfig:
    """A two-persona config: an orchestrator that delegates and a coder that works."""
    return RotarisConfig(
        default_persona="orchestrator",
        large_model="test/model",
        models={"test/model": ModelConfig(provider="test", model_id="m", max_input_tokens=100_000)},
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator", model="test/model", thinking="high", tools=["delegate"]
            ),
            "coder": PersonaConfig(
                name="coder", model="test/model", thinking="medium", tools=["shell"]
            ),
        },
    )


class ObserverHarness:
    """Drives _SessionObserver exactly the way RunBridge._RunWorker does."""

    def __init__(self, tmp_path: Path) -> None:
        self.loop = asyncio.new_event_loop()
        self.manager = SessionManager(tmp_path)
        self.state = self.manager.create_session(demo_config())
        self.observer = _SessionObserver(self.loop, self.manager, self.state)
        self.scheduler = SimpleNamespace(
            _conversation_event_callback=None,
            _conversation_token_callback=None,
            _spawn_notification_callback=None,
            _stall_callback=None,
        )
        # The callback record is a live child in the real scheduler, so expose
        # the same child through the fake manager's snapshots.
        self.records: list[SimpleNamespace] = [
            SimpleNamespace(
                canonical_name="coder-1",
                persona="coder",
                model_dump=lambda *, mode: {
                    "canonical_name": "coder-1",
                    "persona": "coder",
                    "state": "running",
                    "parent_agent_id": "orchestrator",
                },
            )
        ]
        self.child_manager = SimpleNamespace(snapshot_children=lambda: list(self.records))
        self.observer.bind_ralph_loop(SimpleNamespace(scheduler=self.scheduler))
        self.observer.bind_scheduler_callbacks(self.child_manager)
        self.record = SimpleNamespace(canonical_name="coder-1", persona="coder")

    def _recorder(self) -> Any:
        """The run's transcript writer, found the way the engine finds it.

        Through the registry rather than off the observer, because that is the
        seam: ``orchestrator/child_run`` resolves the recorder for the session it
        is running and hands it each event, and the desktop's observer is
        whoever happened to register one first (SWR-2454).
        """
        from rotaris_core.session.transcript import resolve_transcript_recorder

        recorder = resolve_transcript_recorder(self.state.session_id)
        assert recorder is not None, "the observer registers one when it is built"
        return recorder

    def event(self, event: object, record: Any = None) -> None:
        """One conversation event, attributed to *record* (this run's child by default).

        Both halves, in the engine's order: the transcript is recorded first,
        then the host callback runs for what it still owns — the token
        accounting and the agent tree.
        """
        record = record if record is not None else self.record
        self._recorder().record_conversation_event(record.canonical_name, record.persona, event)
        callback = self.scheduler._conversation_event_callback
        if callback is not None:
            callback(record, event)

    def token(self, chunk: object) -> None:
        self._recorder().record_token_chunk(self.record.canonical_name, self.record.persona, chunk)

    def drain(self) -> None:
        self.loop.run_until_complete(asyncio.sleep(0))

    def reload_into_store(self, tmp_path: Path) -> WorkspaceStore:
        # Same guarantee the bridge relies on: persister.flush serializes with
        # any in-flight debounced write before the final snapshot lands.
        self.loop.run_until_complete(self.manager.persister.flush(self.state))
        store = WorkspaceStore()
        service = ConfigService(tmp_path, store)
        service.config = demo_config()
        service.session_manager = SessionManager(tmp_path)
        service.load_session(self.state.session_id)
        return store

    def close(self) -> None:
        self.manager.release_lock(self.state.session_id)
        self.loop.close()
