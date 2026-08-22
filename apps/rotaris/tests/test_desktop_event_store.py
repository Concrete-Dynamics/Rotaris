"""A desktop run leaves the same event store behind as a headless one (SWR-2901).

Rotaris does not go through ``rotaris_core.run_host.execute_run``; its run
workers drive ``cli.background._run_task`` directly, one layer below where the
event store is attached. That shortcut used to skip the store entirely, so the
CLI and the Python SDK persisted their runs while the *primary* interface — the
one whose sessions a user actually wants to replay and export — persisted
nothing.

These tests prove the wiring through its user-observable effect: the file a
replay or a trajectory export reads afterwards. Only the agent runtime is faked,
and it is faked as a publisher — a stand-in for the Ralph loop, which is what
puts ``session.start`` on the bus in a real run. Everything downstream of the
bus is real: the bus, the storing tee, the writer and the JSONL on disk.

The terminal ``result`` event is asserted deliberately and not as an
afterthought. It is the half that proves the detach happens *after* the run's
last publication; without that ordering every stored desktop session would look
like a process that was killed mid-run.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest
from rotaris_core.config import loader as config_loader
from rotaris_core.events.bus import publish, reset_event_registry, resolve_event_sink
from rotaris_core.events.schema import SessionStartEvent
from rotaris_core.eventstore import (
    event_store_path,
    reset_event_store_registry,
    resolve_event_store,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _clean_registries() -> Any:
    """No sink or store may survive into — or out of — one of these tests."""
    reset_event_registry()
    reset_event_store_registry()
    yield
    reset_event_registry()
    reset_event_store_registry()


def _workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A workspace whose config comes from the repository and nowhere else."""
    empty_global = tmp_path / "empty-global"
    empty_global.mkdir()
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", empty_global)
    root = tmp_path / "workspace"
    root.mkdir()
    return root


def _bridge(root: Path, store: WorkspaceStore) -> RunBridge:
    service = ConfigService(root, store)
    # Loaded directly rather than through ``service.load()``: that probes every
    # configured provider and costs seconds this flow never reads.
    service.config = config_loader.load_config(root)
    service.session_manager = SessionManager(root)
    return RunBridge(root, store, service)  # type: ignore[arg-type]


def _publishing_run_task(seen: dict[str, Any]) -> Any:
    """Stand in for the agent runtime, publishing what the Ralph loop publishes.

    A real ``_run_task`` builds a :class:`~rotaris_core.ralph.loop.RalphLoop`
    which puts ``session.start`` on the bus before the first iteration. The fake
    does the same one call earlier, so an assertion about that line is an
    assertion that the store was already listening when the run began.
    """

    async def fake_run_task(
        prompt: str,
        _config: Any,
        _manager: Any,
        state: Any,
        _max_iterations: Any,
        **kwargs: Any,
    ) -> Any:
        seen["session_id"] = state.session_id
        seen["stream_events"] = kwargs.get("stream_events")
        seen["sink_registered"] = resolve_event_sink(state.session_id) is not None
        publish(state.session_id, SessionStartEvent(session_id=state.session_id, task=prompt))
        return SimpleNamespace(iterations=[], stop_reason="")

    return fake_run_task


def _patch_runtime(monkeypatch: pytest.MonkeyPatch, run_task: Any) -> None:
    monkeypatch.setattr("rotaris_core.cli.background._run_task", run_task)
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda _progress: ("completed", "Run completed.", "info"),
    )


def _stored_events(root: Path, session_id: str) -> list[dict[str, Any]]:
    """Every line of the session's store, parsed one line at a time.

    Line-by-line on purpose: the store's promise is that each line is one
    complete wire event, and reading the file as a whole would hide a line that
    is not.
    """
    path = event_store_path(SessionManager(root).session_dir(session_id))
    assert path.exists(), f"no event store at {path}"
    events: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        events.append(json.loads(line))
    return events


@verifies(SWR.SWR_2901)
def test_a_desktop_run_leaves_a_replayable_event_store(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: a user runs a task in Rotaris and later wants to see what happened.
    Expected outcome: the session's evidence directory holds the run's events, opened by
    the session-start line and closed by the terminal result."""
    root = _workspace(tmp_path, monkeypatch)
    seen: dict[str, Any] = {}
    _patch_runtime(monkeypatch, _publishing_run_task(seen))
    store = WorkspaceStore()
    bridge = _bridge(root, store)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=60_000):
            assert bridge.start("summarize the repository") is True
    finally:
        bridge.shutdown()

    session_id = seen["session_id"]
    # The store was attached before the runtime ran, which is the only placement
    # that catches the run's first line.
    assert seen["sink_registered"] is True
    # The loop's own events are what the store persists; a run that emits none
    # of them would attach a store to an empty history.
    assert seen["stream_events"] is True

    events = _stored_events(root, session_id)
    kinds = [event["event"] for event in events]
    assert kinds[0] == "session.start"
    assert kinds[-1] == "result"
    # Every line carries the SWR-1829 envelope, addressed to this session.
    assert all(event["session_id"] == session_id for event in events)
    assert all(isinstance(event["schema_version"], int) for event in events)
    assert all(event["timestamp"] for event in events)

    start = events[0]
    assert start["task"] == "summarize the repository"

    terminal = events[-1]
    assert terminal["result"]["session_id"] == session_id
    assert terminal["result"]["status"] == "completed"


@verifies(SWR.SWR_2901)
def test_the_store_is_released_when_the_run_ends(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: a user finishes one run and immediately starts another.
    Expected outcome: the finished session's store is closed, so nothing can append to
    its history afterwards."""
    root = _workspace(tmp_path, monkeypatch)
    seen: dict[str, Any] = {}
    _patch_runtime(monkeypatch, _publishing_run_task(seen))
    store = WorkspaceStore()
    bridge = _bridge(root, store)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=60_000):
            assert bridge.start("summarize the repository") is True
    finally:
        bridge.shutdown()

    session_id = seen["session_id"]
    assert resolve_event_sink(session_id) is None
    assert resolve_event_store(session_id) is None

    # An event that escapes a finished run cannot extend its history.
    before = len(_stored_events(root, session_id))
    publish(session_id, SessionStartEvent(session_id=session_id, task="a later run"))
    assert len(_stored_events(root, session_id)) == before


@verifies(SWR.SWR_2901)
def test_a_run_that_dies_before_it_starts_still_stores_how_it_ended(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: a user's run dies immediately because their model provider refused.
    Expected outcome: the stored session ends with a terminal result naming the failure,
    not with silence a reader would read as a killed process.

    The runtime is faked as raising *before* publishing anything, which is the
    real shape of a failure inside ``_run_task``'s intent classification: the
    Ralph loop that would have published ``session.start`` is never built.

    The desktop used to store *only* the terminal line for this case, because it
    drove the loop directly and the lifecycle that publishes ``session.start``
    lived a layer above it. Now that both hosts share ``execute_run``, the run
    that died has the same three lines a headless one would — which is the point
    of there being one lifecycle. What the assertion is really about is
    unchanged: the last line says how the run ended, so a finished run cannot be
    mistaken for an abandoned one."""
    root = _workspace(tmp_path, monkeypatch)
    sessions: list[str] = []

    async def exploding_run_task(
        _prompt: str,
        _config: Any,
        _manager: Any,
        state: Any,
        _max_iterations: Any,
        **_kwargs: Any,
    ) -> Any:
        sessions.append(state.session_id)
        raise RuntimeError("the model provider refused")

    _patch_runtime(monkeypatch, exploding_run_task)
    store = WorkspaceStore()
    bridge = _bridge(root, store)
    try:
        with qtbot.waitSignal(bridge.run_failed, timeout=60_000):
            assert bridge.start("summarize the repository") is True
    finally:
        bridge.shutdown()

    assert sessions
    events = _stored_events(root, sessions[0])
    assert [event["event"] for event in events] == ["session.start", "session.end", "result"]
    terminal = events[-1]["result"]
    assert terminal["status"] == "error"
    assert "the model provider refused" in terminal["error"]


@verifies(SWR.SWR_2901)
def test_a_store_that_cannot_be_opened_does_not_fail_the_run(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: a user's session directory is read-only or their disk is full.
    Expected outcome: they lose this session's stored history, not the run itself."""
    root = _workspace(tmp_path, monkeypatch)
    seen: dict[str, Any] = {}
    _patch_runtime(monkeypatch, _publishing_run_task(seen))

    def refuse(*_args: Any, **_kwargs: Any) -> Any:
        raise OSError("read-only file system")

    # Patched where the lifecycle binds it. The desktop used to attach the store
    # itself; now ``run_host.execute_run`` does it for every host, so this is the
    # name that has to fail for the run to meet a store it cannot open.
    monkeypatch.setattr("rotaris_core.run_host.attach_session_store", refuse)

    store = WorkspaceStore()
    bridge = _bridge(root, store)
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=60_000):
            assert bridge.start("summarize the repository") is True
    finally:
        bridge.shutdown()

    assert seen["session_id"]
    assert seen["sink_registered"] is False
    assert not event_store_path(SessionManager(root).session_dir(seen["session_id"])).exists()
