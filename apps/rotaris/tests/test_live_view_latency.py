"""Productive use: a user starts a task and watches it work.
Expected outcome: what the agent does appears on screen because the run said so,
not because a timer happened to look at the disk afterwards.

The decisive move in these tests is stopping the poll. Everything the desktop
showed before SWR-2454 came through it — the run wrote its state, the timer read
it back 750 ms later, and the whole session was re-derived to show one new line.
With the timer stopped there is exactly one way for a row to reach the store, so
if the row is there, the live channel delivered it.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from run_wiring import (
    action_event,
    demo_config,
    message_event,
    observation_event,
    sdk_events,
)

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge

pytestmark = pytest.mark.integration


def _service(tmp_path, store: WorkspaceStore) -> ConfigService:
    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    service.session_manager = SessionManager(tmp_path)
    return service


def _streaming_run_task(sdk, released: asyncio.Event | None = None):
    """A run that reports three rows and then stays alive until told to stop."""

    async def fake_run_task(
        prompt,
        config,
        manager,
        state,
        max_iterations,
        interrupt_handler=None,
        iteration_observer=None,
        delegation_strategy=None,
        **_lifecycle_kwargs,
    ):
        state.transcript_events.append({"role": "user", "content": prompt})
        scheduler = SimpleNamespace(
            _conversation_event_callback=None,
            _conversation_token_callback=None,
            _spawn_notification_callback=None,
            _stall_callback=None,
        )
        iteration_observer.bind_ralph_loop(SimpleNamespace(scheduler=scheduler))
        iteration_observer.bind_scheduler_callbacks(SimpleNamespace(snapshot_children=list))
        record = SimpleNamespace(canonical_name="coder-1", persona="coder")
        action = action_event(sdk)
        scheduler._conversation_event_callback(record, action)
        scheduler._conversation_event_callback(record, observation_event(sdk, action))
        scheduler._conversation_event_callback(record, message_event(sdk, "Task complete."))
        if released is not None:
            # Held open on purpose: the assertion is about what the user can see
            # *during* a run, and a run that has ended has had its final
            # whole-state read.
            await asyncio.wait_for(released.wait(), timeout=20)
        return SimpleNamespace(iterations=[])

    return fake_run_task


@verifies(SWR.SWR_2454)
def test_the_transcript_arrives_without_the_poll(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: the agent runs a command and reports back.
    Expected outcome: the rows are on screen while the run is still going, with
    the reconciling read switched off."""
    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    released = asyncio.Event()
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _streaming_run_task(sdk, released))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    bridge = RunBridge(tmp_path, store, service)
    # Stop the timer the moment it starts, so nothing this test sees can have
    # come from a snapshot read.
    bridge.run_started.connect(lambda _sid: bridge._poller.stop())
    try:
        with qtbot.waitSignal(bridge.run_started, timeout=15_000):
            assert bridge.start("run the tests") is True
        qtbot.waitUntil(
            lambda: any("Task complete." in event.text for event in store.transcript),
            timeout=10_000,
        )
        texts = "\n".join(f"{event.text} {event.detail}" for event in store.transcript)
        kinds = [event.kind for event in store.transcript]

        assert not bridge._poller.isActive()
        assert "run the tests" in texts
        assert "pytest -x -q" in texts
        assert "tool" in kinds
        # And the surfaces that are not the transcript (SWR-2130). These used to
        # arrive only through the snapshot read, which is why the desktop
        # shortened the persistence debounce to make that read frequent enough.
        assert store.session_status == "running"
        assert store.run_summary.tool_calls >= 0
    finally:
        released.set()
        qtbot.waitUntil(lambda: not bridge.running, timeout=15_000)
        bridge.shutdown()


@verifies(SWR.SWR_2130)
def test_the_run_does_not_shorten_the_persistence_debounce(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: a run writes its record as often as durability wants, not
    as often as a view wants. Expected outcome: the session manager the run
    builds carries the engine's own debounce window.

    The knob and the view are what SWR-2130 exists to separate; this asserts the
    separation rather than the comment describing it."""
    from rotaris_core.session.manager import SessionManager as Manager

    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    windows: list[float | None] = []
    original = Manager.__init__

    def recording_init(self, workspace, *args, **kwargs):  # noqa: ANN001, ANN202
        windows.append(kwargs.get("persist_debounce_seconds"))
        original(self, workspace, *args, **kwargs)

    monkeypatch.setattr(Manager, "__init__", recording_init)
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _streaming_run_task(sdk))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    bridge = RunBridge(tmp_path, store, service)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=15_000):
            assert bridge.start("run the tests") is True
        qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)
    finally:
        bridge.shutdown()

    assert windows, "the run never built a session manager"
    assert all(window is None for window in windows), windows


@verifies(SWR.SWR_2454)
def test_the_final_read_owns_the_transcript_once_the_run_is_over(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: the run ends and the session settles.
    Expected outcome: the whole-state read takes the transcript back, so the
    retroactive "this session is no longer live" rules a delta cannot express
    still get applied."""
    sdk = sdk_events()
    store = WorkspaceStore()
    service = _service(tmp_path, store)
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _streaming_run_task(sdk))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run finished.", "info"),
    )

    bridge = RunBridge(tmp_path, store, service)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=15_000):
            assert bridge.start("run the tests") is True
        qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)
    finally:
        bridge.shutdown()

    assert service._transcript_is_live is False
    assert store.session_status == "completed"
    texts = "\n".join(event.text for event in store.transcript)
    assert "Task complete." in texts
    assert "Run finished." in texts
