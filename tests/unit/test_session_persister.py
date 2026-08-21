from __future__ import annotations

import asyncio
import datetime as dt
import logging
import threading
import time
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.persister import SessionPersister
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    import pytest


def make_state(status: str = "running", **overrides: Any) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    defaults: dict[str, Any] = {
        "session_id": "persist-test",
        "workspace_root": "/tmp/test",
        "created_at": now,
        "updated_at": now,
        "execution_status": status,
    }
    defaults.update(overrides)
    return SessionState(**defaults)


class RecordingManager(SessionManager):
    """SessionManager whose snapshot writes are recorded instead of hitting disk."""

    def __init__(self, workspace_root: Path) -> None:
        super().__init__(workspace_root)
        self.snapshots: list[SessionState] = []
        self.write_threads: list[int] = []
        #: ``enter:<status>`` / ``exit:<status>`` per write, in the order the
        #: writes actually reached the "disk" — the thing the race corrupts.
        self.write_log: list[str] = []
        self._write_gates: dict[str, threading.Event] = {}

        def record_snapshot(state: SessionState) -> None:
            status = state.execution_status
            self.write_log.append(f"enter:{status}")
            gate = self._write_gates.get(status)
            if gate is not None:
                assert gate.wait(5.0), f"the write gate for {status!r} was never opened"
            self.snapshots.append(state)
            self.write_threads.append(threading.get_ident())
            self.write_log.append(f"exit:{status}")

        self.persistence.save_snapshot = record_snapshot  # type: ignore[method-assign]

    def hold_writes_for(self, status: str) -> threading.Event:
        """Park writes of *status* inside ``save_snapshot`` until the event is set."""
        gate = threading.Event()
        self._write_gates[status] = gate
        return gate

    @property
    def written_statuses(self) -> list[str]:
        """Execution statuses that reached disk, in the order they landed."""
        return [
            entry.removeprefix("exit:") for entry in self.write_log if entry.startswith("exit:")
        ]


class GatedCommit:
    """Hold a persister write open between its snapshot and its disk commit.

    Wraps ``SessionPersister._commit``: the point where a write has already
    captured its deep copy *and* its generation but has not yet taken the
    commit lock. It is the only place a write can be parked without also
    parking the terminal save, which is what lets a test pin the interleaving
    instead of hoping for it.
    """

    def __init__(self, persister: SessionPersister) -> None:
        self.entered = threading.Event()
        self.release = threading.Event()
        self.finished = threading.Event()
        self._inner = persister._commit
        persister._commit = self  # type: ignore[method-assign, assignment]

    def __call__(self, snapshot: SessionState, generation: int) -> None:
        self.entered.set()
        assert self.release.wait(5.0), "the gated commit was never released"
        try:
            self._inner(snapshot, generation)
        finally:
            self.finished.set()


async def until(predicate: Callable[[], bool], *, what: str, timeout: float = 5.0) -> None:
    """Yield to the loop until *predicate* holds — a handshake, not a fixed sleep."""
    deadline = time.monotonic() + timeout
    while not predicate():
        assert time.monotonic() < deadline, f"timed out waiting for {what}"
        await asyncio.sleep(0.005)


@verifies(SWR.SWR_2130)
async def test_request_save_writes_once_within_debounce_window(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    state = make_state()

    persister.request_save(state)
    persister.request_save(state)
    persister.request_save(state)
    await asyncio.sleep(0.05)

    assert len(manager.snapshots) == 1


@verifies(SWR.SWR_2130)
async def test_parked_save_is_written_by_timer_without_further_calls(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=0.05)
    state = make_state()

    persister.request_save(state)
    await asyncio.sleep(0.02)
    assert len(manager.snapshots) == 1  # first write is immediate

    state.transcript_events.append({"role": "user", "content": "late"})
    persister.request_save(state)  # inside debounce window — parked
    assert len(manager.snapshots) == 1

    await asyncio.sleep(0.15)  # timer fires without any further request_save
    assert len(manager.snapshots) == 2
    assert manager.snapshots[-1].transcript_events == [{"role": "user", "content": "late"}]


@verifies(SWR.SWR_2130)
async def test_written_snapshot_is_a_deep_copy_with_latest_state(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    state = make_state()

    persister.request_save(state)
    await asyncio.sleep(0.05)

    snapshot = manager.snapshots[-1]
    assert snapshot is not state
    state.transcript_events.append({"role": "user", "content": "after write"})
    assert snapshot.transcript_events == []


@verifies(SWR.SWR_2130)
async def test_non_running_status_flushes_immediately_and_synchronously(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    running = make_state()
    persister.request_save(running)
    await asyncio.sleep(0.05)
    assert len(manager.snapshots) == 1

    paused = make_state(status="paused")
    persister.request_save(paused)  # inside debounce window, but paused → immediate
    assert len(manager.snapshots) == 2


@verifies(SWR.SWR_2130)
def test_request_save_without_event_loop_falls_back_to_sync_write(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    state = make_state()

    persister.request_save(state)

    assert len(manager.snapshots) == 1


@verifies(SWR.SWR_2130)
async def test_flush_writes_pending_state_and_cancels_timer(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=60.0)
    state = make_state()

    persister.request_save(state)
    await asyncio.sleep(0.05)
    state.transcript_events.append({"role": "user", "content": "flushed"})
    persister.request_save(state)  # parked behind the 60 s debounce

    await persister.flush(state)

    assert len(manager.snapshots) == 2
    assert manager.snapshots[-1].transcript_events == [{"role": "user", "content": "flushed"}]

    await asyncio.sleep(0.1)  # timer must not produce a third write
    assert len(manager.snapshots) == 2


@verifies(SWR.SWR_2130)
async def test_debounced_write_happens_off_the_event_loop_thread(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)

    persister.request_save(make_state())
    await asyncio.sleep(0.05)

    assert manager.write_threads[-1] != threading.get_ident()


@verifies(SWR.SWR_2130)
async def test_flush_updates_live_state_updated_at(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    state = make_state()
    before = state.updated_at

    await asyncio.sleep(0.01)
    await persister.flush(state)

    assert state.updated_at > before


@verifies(SWR.SWR_2130)
def test_session_manager_persister_property_is_cached(tmp_path: Path) -> None:
    manager = SessionManager(tmp_path)
    assert manager.persister is manager.persister


# --- A finished run must never stay recorded as ``running`` -------------------
#
# The debounced ``"running"`` write goes out under ``asyncio.shield``, so the
# terminal save cancelling the debounce timer does not stop it. These four
# tests pin the *outcome* — the terminal state is what stays on disk — under
# every interleaving of the two writes, rather than the timing that happens to
# make one of them win.


@verifies(SWR.SWR_2130)
async def test_terminal_save_survives_a_shielded_running_write_still_in_flight(
    tmp_path: Path,
) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    gate = manager.hold_writes_for("running")
    state = make_state("running")

    persister.request_save(state)
    await until(lambda: "enter:running" in manager.write_log, what="the running write to start")

    # Opened from a background thread: the terminal save runs on the event loop
    # thread and may have to wait for the in-flight write, so the loop cannot be
    # the one to open the gate. The delay only has to outlast the two statements
    # below (microseconds), and erring the other way makes the test pass without
    # proving anything rather than fail spuriously.
    threading.Timer(0.1, gate.set).start()

    state.execution_status = "completed"
    persister.request_save(state)

    await until(lambda: "exit:running" in manager.write_log, what="the running write to land")
    await asyncio.sleep(0.05)
    assert manager.written_statuses[-1] == "completed"


@verifies(SWR.SWR_2130)
async def test_a_stale_running_write_is_dropped_instead_of_overwriting_a_terminal_save(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    commit = GatedCommit(persister)
    state = make_state("running")

    persister.request_save(state)
    await until(commit.entered.is_set, what="the running write to reach its commit")

    state.execution_status = "completed"
    with caplog.at_level(logging.WARNING, logger="rotaris_core.session.persister"):
        persister.request_save(state)
        assert manager.written_statuses == ["completed"]

        commit.release.set()  # the shielded running write finishes *after* the terminal save
        await until(commit.finished.is_set, what="the stale running write to settle")

    assert manager.written_statuses == ["completed"]
    assert "Dropped a stale session write" in caplog.text


@verifies(SWR.SWR_2130)
async def test_terminal_save_wins_when_the_shielded_running_write_lands_first(
    tmp_path: Path,
) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    commit = GatedCommit(persister)
    state = make_state("running")

    persister.request_save(state)
    await until(commit.entered.is_set, what="the running write to reach its commit")

    commit.release.set()  # inverted: the shielded running write finishes first
    await until(commit.finished.is_set, what="the running write to land")

    state.execution_status = "completed"
    persister.request_save(state)

    await asyncio.sleep(0.05)
    assert manager.written_statuses == ["running", "completed"]


@verifies(SWR.SWR_2130)
async def test_a_save_for_one_session_never_drops_a_write_for_another(tmp_path: Path) -> None:
    """One persister serves every session of its manager — staleness is per session."""
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    commit = GatedCommit(persister)

    persister.request_save(make_state("running", session_id="session-a"))
    await until(commit.entered.is_set, what="session A's write to reach its commit")

    # The user switches sessions: a later save for a *different* session lands
    # first. It writes a different directory and says nothing about session A.
    persister.flush_sync(make_state("paused", session_id="session-b"))

    commit.release.set()
    await until(commit.finished.is_set, what="session A's write to settle")

    assert [snapshot.session_id for snapshot in manager.snapshots] == ["session-b", "session-a"]


@verifies(SWR.SWR_2130)
async def test_flush_sync_does_not_interleave_with_an_in_flight_write(tmp_path: Path) -> None:
    manager = RecordingManager(tmp_path)
    persister = SessionPersister(manager, debounce_seconds=5.0)
    gate = manager.hold_writes_for("running")

    persister.request_save(make_state("running"))
    await until(lambda: "enter:running" in manager.write_log, what="the running write to start")

    started_flush = threading.Event()
    finished_flush = threading.Event()

    def flush_from_another_thread() -> None:
        started_flush.set()
        persister.flush_sync(make_state("completed"))
        finished_flush.set()

    flusher = threading.Thread(target=flush_from_another_thread, daemon=True)
    flusher.start()
    await until(started_flush.is_set, what="the flushing thread to start")
    await asyncio.sleep(0.05)

    assert manager.write_log == ["enter:running"], "flush_sync wrote into an in-flight write"

    gate.set()
    await until(finished_flush.is_set, what="flush_sync to finish")
    flusher.join(timeout=5.0)
    assert manager.write_log == [
        "enter:running",
        "exit:running",
        "enter:completed",
        "exit:completed",
    ]
