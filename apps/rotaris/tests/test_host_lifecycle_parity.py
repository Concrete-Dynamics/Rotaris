"""Productive use: a person runs the same task from the desktop that a script
runs from the SDK, and afterwards both sessions can be replayed, exported and
resumed the same way.
Expected outcome: the two runs are the same run — same lifecycle events, in the
same order, with the same terminal status and the same released resources.

This is SWR-2453 stated as a test rather than as a rule. The point is not that
the desktop currently calls ``execute_run``; it is that a lifecycle behaviour
added to the engine reaches every host without anything under ``apps/rotaris/``
being changed to receive it. The last assertion is the one that keeps that true:
it registers a behaviour the engine did not have and finds it in both runs.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest
from rotaris_core.events.bus import reset_event_registry
from rotaris_core.eventstore import event_store_path, reset_event_store_registry
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from run_wiring import demo_config

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration

TASK = "count to three"


@pytest.fixture(autouse=True)
def _clean_registries() -> Any:
    reset_event_registry()
    reset_event_store_registry()
    yield
    reset_event_registry()
    reset_event_store_registry()


def _fake_run_task(seen: list[str] | None = None) -> Any:
    """The agent runtime, replaced by something that finishes immediately.

    Identical for both hosts on purpose: any difference the test finds is a
    difference in the *lifecycle*, which is the only thing being compared.
    """

    async def run_task(
        prompt: str,
        _config: Any,
        _manager: Any,
        state: Any,
        _max_iterations: Any,
        **_kwargs: Any,
    ) -> Any:
        if seen is not None:
            seen.append(state.session_id)
        state.transcript_events.append({"role": "user", "content": prompt})
        return SimpleNamespace(iterations=[], stop_reason="")

    return run_task


def _patch_runtime(monkeypatch: pytest.MonkeyPatch, seen: list[str] | None = None) -> None:
    monkeypatch.setattr("rotaris_core.cli.background._run_task", _fake_run_task(seen))
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda _progress: ("completed", "Run finished.", "info"),
    )


def _stored(root: Path, session_id: str) -> list[dict[str, Any]]:
    path = event_store_path(SessionManager(root).session_dir(session_id))
    assert path.exists(), f"no event store at {path}"
    return [
        json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()
    ]


def _headless_run(root: Path) -> str:
    """A run as the CLI and the Python SDK make it: ``execute_run``, nothing else."""
    from rotaris_core.run_host import RunRequest, execute_run

    config = demo_config()
    config.workspace_root = root
    result = asyncio.run(execute_run(RunRequest(task=TASK, config=config), SessionManager(root)))
    return result.session_id


def _desktop_run(root: Path, qtbot) -> str:
    """A run as a person makes it: the window's run bridge, on its own thread."""
    store = WorkspaceStore()
    service = ConfigService(root, store)
    config = demo_config()
    config.workspace_root = root
    service.config = config
    service.session_manager = SessionManager(root)
    bridge = RunBridge(root, store, service)
    started: list[str] = []
    bridge.run_started.connect(started.append)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=20_000):
            assert bridge.start(TASK) is True
        qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)
    finally:
        bridge.shutdown()
    assert started, "the desktop run never reported a session"
    return started[0]


@verifies(SWR.SWR_2453, SWR.SWR_1830)
def test_a_desktop_run_and_a_headless_run_leave_the_same_lifecycle(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: the same task, from the window and from a script.
    Expected outcome: the same events in the same order, and a session on either
    side that reads back as the same kind of thing."""
    _patch_runtime(monkeypatch)
    headless_root = tmp_path / "headless"
    desktop_root = tmp_path / "desktop"
    headless_root.mkdir()
    desktop_root.mkdir()

    headless_id = _headless_run(headless_root)
    reset_event_registry()
    reset_event_store_registry()
    desktop_id = _desktop_run(desktop_root, qtbot)

    headless_events = [event["event"] for event in _stored(headless_root, headless_id)]
    desktop_events = [event["event"] for event in _stored(desktop_root, desktop_id)]

    assert headless_events == desktop_events, (headless_events, desktop_events)
    assert headless_events[0] == "session.start"
    assert headless_events[-1] == "result"

    headless_state = SessionManager(headless_root).read_session_snapshot(headless_id)
    desktop_state = SessionManager(desktop_root).read_session_snapshot(desktop_id)
    assert headless_state.execution_status == desktop_state.execution_status == "completed"
    assert headless_state.run_type == desktop_state.run_type
    # Both locks released: a session either host left locked could not be
    # resumed, and only one of them used to release it in a ``finally``.
    for root, session_id in ((headless_root, headless_id), (desktop_root, desktop_id)):
        manager = SessionManager(root)
        assert manager.acquire_lock(session_id) is True
        manager.release_lock(session_id)


@verifies(SWR.SWR_2453)
def test_a_lifecycle_behaviour_added_to_the_engine_reaches_both_hosts(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: someone adds something every run should do.
    Expected outcome: both hosts do it, with nothing under ``apps/rotaris/``
    changed to receive it — which is the whole of "no host carries a private
    re-composition of the lifecycle"."""
    from rotaris_core import run_host

    fired: list[tuple[str, str]] = []
    original = run_host.persist_session_state

    def recording_persist(manager: Any, state: Any) -> None:
        """Stands in for a behaviour the lifecycle grew, and only the lifecycle."""
        fired.append((state.session_id, "persisted"))
        original(manager, state)

    monkeypatch.setattr(run_host, "persist_session_state", recording_persist)
    _patch_runtime(monkeypatch)
    headless_root = tmp_path / "headless"
    desktop_root = tmp_path / "desktop"
    headless_root.mkdir()
    desktop_root.mkdir()

    headless_id = _headless_run(headless_root)
    reset_event_registry()
    reset_event_store_registry()
    desktop_id = _desktop_run(desktop_root, qtbot)

    by_session = {session_id for session_id, _ in fired}
    assert headless_id in by_session
    assert desktop_id in by_session
