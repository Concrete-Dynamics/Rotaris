"""Deciding whether a session's ``execution_status`` is still telling the truth.

Every session here is a real :class:`SessionManager` on ``tmp_path`` with a real
lock file, because the whole question is what is on disk. The pid used for "this
process is gone" comes from a real child process that is spawned and waited for,
never from a guessed number: a guessed pid can be recycled and the test would
then assert the opposite of what it claims.

Half of these tests are about the *ambiguous* cases, and they all assert the same
direction — live. Reporting a live session dead lets a checkpoint restore race a
running run and corrupt the file that holds the undo history; reporting a dead
session live only leaves the user where they already were.
"""

from __future__ import annotations

import datetime as dt
import gc
import json
import subprocess
import sys
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.liveness import pid_is_alive
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.recovery import (
    ACTIVE_EXECUTION_STATUSES,
    INTERRUPTED_EXECUTION_STATUS,
    ORPHANED_CHILD_STATE,
    TERMINAL_CHILD_STATES,
    detect_stale_sessions,
    repair_stale_session,
    repair_stale_sessions,
    session_is_live,
    settle_orphaned_children,
)
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


#: The reaped pid this module reuses, and ``None`` until the first test asks for one.
_REAPED_PID: int | None = None


def _spawn_and_reap() -> int:
    """A pid that is certainly gone: a real child, spawned, waited for, released.

    The handle has to go too. Windows keeps an exited process addressable while
    any handle to it is open, so a pid whose ``Popen`` is still alive in this
    frame would read as running.
    """

    def spawn() -> int:
        process = subprocess.Popen([sys.executable, "-c", "pass"])  # noqa: S603
        process.wait()
        return process.pid

    pid = spawn()
    gc.collect()
    return pid


def _dead_pid() -> int:
    """A pid nothing is running under, reusing the last one while it stays dead.

    Reaping a fresh interpreter per call is what this used to do, and at roughly
    twenty calls across this file -- five of them inside a single loop -- it was
    most of the file's 23s. A reaped pid does not come back to life on its own, so
    the spawn is worth doing once and re-checking afterwards: the only way the
    cached one stops being usable is the operating system handing that number to
    something else, which the same liveness probe the product uses will catch.
    """
    global _REAPED_PID

    if _REAPED_PID is not None and not _pid_is_currently_alive(_REAPED_PID):
        return _REAPED_PID

    _REAPED_PID = _spawn_and_reap()
    return _REAPED_PID


def _pid_is_currently_alive(pid: int) -> bool:
    """Whether *pid* names a live process — the production probe itself, not a copy.

    A pid this reports dead must be one the code under test also reports dead, or
    the cache above would hand back a number the assertions disagree about. Calling
    ``pid_is_alive`` is the only way to guarantee that; a hand-rolled
    ``os.kill(pid, 0)`` here is what made this suite press Ctrl+C on itself on
    Windows.
    """
    return pid_is_alive(pid)


def _session(tmp_path: Path, status: str = "running") -> tuple[SessionManager, SessionState]:
    """A persisted session whose stored status is *status* and which holds no lock."""
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    manager = SessionManager(workspace)
    state = manager.create_session(RotarisConfig(workspace_root=workspace))
    manager.persistence.release_lock(state.session_id)
    state.execution_status = status
    manager.flush_session(state)
    return manager, state


def _write_lock(manager: SessionManager, session_id: str, payload: object) -> None:
    lock = manager.session_dir(session_id) / "lock"
    lock.write_text(json.dumps(payload), encoding="utf-8")


def _tree_fingerprint(root: Path) -> set[tuple[str, int, int]]:
    """Every file under *root* with its size and mtime, to prove a read wrote nothing."""
    return {
        (str(path.relative_to(root)), path.stat().st_size, path.stat().st_mtime_ns)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


# ── liveness ────────────────────────────────────────────────────────────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_session_locked_by_a_running_process_is_live(tmp_path: Path) -> None:
    """Productive use: a user works while an agent runs in another window.
    Expected outcome: the running session is reported live, so nothing corrects it."""
    manager, state = _session(tmp_path)
    assert manager.persistence.acquire_lock(state.session_id) is True

    assert session_is_live(manager, state.session_id) is True
    assert manager.is_session_live(state.session_id) is True
    assert detect_stale_sessions(manager) == ()
    assert repair_stale_session(manager, state.session_id) is None


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_lock_naming_a_finished_process_is_stale(tmp_path: Path) -> None:
    """Productive use: a user's machine loses power mid-run and they reopen the workspace.
    Expected outcome: the session is reported stale and the reason names the dead process."""
    manager, state = _session(tmp_path)
    pid = _dead_pid()
    _write_lock(manager, state.session_id, {"pid": pid, "acquired_at": "2026-01-01T00:00:00+00:00"})

    assert session_is_live(manager, state.session_id) is False
    detected = detect_stale_sessions(manager)

    assert [entry.session_id for entry in detected] == [state.session_id]
    assert detected[0].execution_status == "running"
    assert str(pid) in detected[0].reason


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_an_active_status_with_no_lock_at_all_is_stale(tmp_path: Path) -> None:
    """Productive use: a user reopens a workspace whose app was killed before it wrote a status.
    Expected outcome: the session with no lock and a running status is reported stale."""
    manager, state = _session(tmp_path, status="background")

    assert (manager.session_dir(state.session_id) / "lock").exists() is False
    detected = detect_stale_sessions(manager)

    assert [entry.session_id for entry in detected] == [state.session_id]
    assert detected[0].execution_status == "background"
    assert "no lock file" in detected[0].reason


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_every_active_status_is_recognised_as_a_claim_on_a_run(tmp_path: Path) -> None:
    """Productive use: a user's session is killed at any point of its lifecycle.
    Expected outcome: each status that claims a run is recoverable, not only "running"."""
    for status in sorted(ACTIVE_EXECUTION_STATUSES):
        manager, state = _session(tmp_path / status, status=status)

        assert [entry.execution_status for entry in detect_stale_sessions(manager)] == [status]


# ── the ambiguous cases, which all resolve toward "still running" ───────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_an_unreadable_lock_reports_the_session_live(tmp_path: Path) -> None:
    """Productive use: a user's lock file is corrupted by a bad shutdown.
    Expected outcome: the session counts as running, so no restore can race a real run."""
    manager, state = _session(tmp_path)
    (manager.session_dir(state.session_id) / "lock").write_text("{not json", encoding="utf-8")

    assert session_is_live(manager, state.session_id) is True
    assert detect_stale_sessions(manager) == ()
    assert repair_stale_session(manager, state.session_id) is None
    assert manager.read_session_snapshot(state.session_id).execution_status == "running"


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_lock_without_a_pid_reports_the_session_live(tmp_path: Path) -> None:
    """Productive use: a user's workspace holds a lock written by an older Rotaris.
    Expected outcome: with no pid to check, the session is left alone rather than rewritten."""
    manager, state = _session(tmp_path)
    _write_lock(manager, state.session_id, {"acquired_at": "2026-01-01T00:00:00+00:00"})

    assert session_is_live(manager, state.session_id) is True
    assert detect_stale_sessions(manager) == ()
    assert repair_stale_session(manager, state.session_id) is None


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_nonsensical_pid_reports_the_session_live(tmp_path: Path) -> None:
    """Productive use: a user's lock holds a pid no operating system hands out.
    Expected outcome: the value is treated as unreadable, not as proof of death."""
    manager, state = _session(tmp_path)
    _write_lock(manager, state.session_id, {"pid": 0})

    assert session_is_live(manager, state.session_id) is True

    _write_lock(manager, state.session_id, {"pid": "not-a-number"})

    assert session_is_live(manager, state.session_id) is True
    assert detect_stale_sessions(manager) == ()


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_corrupt_snapshot_is_never_repaired(tmp_path: Path) -> None:
    """Productive use: a user's session file is truncated by a crash mid-write.
    Expected outcome: the repair reports nothing to do instead of raising into the UI."""
    manager, state = _session(tmp_path)
    session_dir = manager.session_dir(state.session_id)
    (session_dir / "snapshot.json").write_text("{ truncated", encoding="utf-8")
    for leftover in session_dir.glob("state/*.json"):
        leftover.write_text("{ truncated", encoding="utf-8")

    assert repair_stale_session(manager, state.session_id) is None
    assert repair_stale_sessions(manager) == ()


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_probe_that_cannot_answer_reports_the_session_live(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user's OS refuses to answer whether a pid exists.
    Expected outcome: the failure counts as running, so nothing is silently rewritten."""
    manager, state = _session(tmp_path)
    _write_lock(manager, state.session_id, {"pid": _dead_pid()})

    def _explode(_self: object, _pid: int) -> bool:
        raise OSError("the process table is unavailable")

    monkeypatch.setattr(
        "rotaris_core.session.persistence.SessionPersistence._pid_is_alive",
        _explode,
    )

    assert session_is_live(manager, state.session_id) is True
    assert detect_stale_sessions(manager) == ()


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_missing_session_is_neither_stale_nor_an_error(tmp_path: Path) -> None:
    """Productive use: a user deletes a session while a window still holds its id.
    Expected outcome: the repair returns "nothing to do" rather than raising."""
    manager, _state = _session(tmp_path)

    assert repair_stale_session(manager, "20260101-000000-deadbeefcafe") is None
    assert session_is_live(manager, "") is False


# ── terminal statuses are never touched ─────────────────────────────────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_terminal_session_is_never_stale_whatever_its_lock_says(tmp_path: Path) -> None:
    """Productive use: a user browses sessions that finished long ago.
    Expected outcome: a completed session is never reported stale and never rewritten."""
    for status in ("completed", "failed", "paused", "idle", "paused_message_limit"):
        manager, state = _session(tmp_path / status, status=status)
        _write_lock(manager, state.session_id, {"pid": _dead_pid()})

        assert detect_stale_sessions(manager) == ()
        assert repair_stale_session(manager, state.session_id) is None
        assert manager.read_session_snapshot(state.session_id).execution_status == status


# ── detection is a read ─────────────────────────────────────────────────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_detecting_stale_sessions_writes_nothing_to_disk(tmp_path: Path) -> None:
    """Productive use: a user inspects a stuck workspace before deciding what to do.
    Expected outcome: looking at it leaves every file exactly as it was."""
    manager, state = _session(tmp_path)
    _write_lock(manager, state.session_id, {"pid": _dead_pid()})
    sessions_root = manager.sessions_dir
    before = _tree_fingerprint(sessions_root)

    assert len(detect_stale_sessions(manager)) == 1
    assert len(detect_stale_sessions(manager)) == 1

    assert _tree_fingerprint(sessions_root) == before
    assert (manager.session_dir(state.session_id) / "lock").exists() is True


# ── repair ──────────────────────────────────────────────────────────────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_repair_marks_the_session_interrupted_and_drops_the_orphaned_lock(
    tmp_path: Path,
) -> None:
    """Productive use: a user recovers a workspace after their laptop died mid-run.
    Expected outcome: the session reads as interrupted, is unlocked, and says why in its timeline."""
    manager, state = _session(tmp_path)
    pid = _dead_pid()
    _write_lock(manager, state.session_id, {"pid": pid})

    repaired = repair_stale_session(manager, state.session_id)

    assert repaired is not None
    assert repaired.execution_status == "running"
    assert str(pid) in repaired.reason
    assert (
        manager.read_session_snapshot(state.session_id).execution_status
        == INTERRUPTED_EXECUTION_STATUS
    )
    assert (manager.session_dir(state.session_id) / "lock").exists() is False
    assert manager.acquire_lock(state.session_id) is True

    timeline = (manager.session_dir(state.session_id) / "timeline.jsonl").read_text(
        encoding="utf-8"
    )
    recorded = [json.loads(line) for line in timeline.splitlines() if line.strip()]
    recovery_events = [event for event in recorded if "recovered" in str(event.get("type", ""))]

    assert recovery_events, recorded
    assert recovery_events[-1]["metadata"]["previous_execution_status"] == "running"
    assert str(pid) in recovery_events[-1]["metadata"]["reason"]


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_repair_survives_a_second_crash_because_it_never_waits_for_the_debounce(
    tmp_path: Path,
) -> None:
    """Productive use: a user repairs a session and the app dies again immediately.
    Expected outcome: the correction is already on disk, readable by a brand-new manager."""
    manager, state = _session(tmp_path)
    _write_lock(manager, state.session_id, {"pid": _dead_pid()})
    # A save that went through the debounce would sit in memory here and die
    # with the process; nothing is flushed on the way out of this test.
    repair_stale_session(manager, state.session_id)

    fresh = SessionManager(manager.workspace_root)

    assert (
        fresh.read_session_snapshot(state.session_id).execution_status
        == INTERRUPTED_EXECUTION_STATUS
    )
    assert fresh.list_sessions()[0]["execution_status"] == INTERRUPTED_EXECUTION_STATUS


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_repairing_twice_changes_nothing_the_second_time(tmp_path: Path) -> None:
    """Productive use: a user runs the recovery again, unsure whether the first one worked.
    Expected outcome: the second run reports nothing to repair and rewrites nothing."""
    manager, state = _session(tmp_path)
    _write_lock(manager, state.session_id, {"pid": _dead_pid()})

    first = repair_stale_sessions(manager)

    assert [entry.session_id for entry in first] == [state.session_id]
    after_first = _tree_fingerprint(manager.sessions_dir)

    assert repair_stale_sessions(manager) == ()
    assert repair_stale_session(manager, state.session_id) is None
    assert _tree_fingerprint(manager.sessions_dir) == after_first


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_repair_leaves_a_live_session_alone_while_correcting_a_dead_one(tmp_path: Path) -> None:
    """Productive use: a user recovers one crashed session while another is still running.
    Expected outcome: only the crashed session is rewritten; the running one keeps its lock."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    manager = SessionManager(workspace)
    config = RotarisConfig(workspace_root=workspace)
    live = manager.create_session(config)
    live.execution_status = "running"
    manager.flush_session(live)
    dead = manager.create_session(config)
    dead.execution_status = "running"
    manager.flush_session(dead)
    manager.persistence.release_lock(dead.session_id)
    _write_lock(manager, dead.session_id, {"pid": _dead_pid()})

    repaired = repair_stale_sessions(manager)

    assert [entry.session_id for entry in repaired] == [dead.session_id]
    assert manager.read_session_snapshot(live.session_id).execution_status == "running"
    assert (manager.session_dir(live.session_id) / "lock").exists() is True


def _snapshot() -> SessionState:
    """A snapshot with nothing but the fields every session carries."""
    now = dt.datetime.now(dt.UTC)
    return SessionState(session_id="s1", workspace_root=".", created_at=now, updated_at=now)


@verifies(SWR.SWR_3714)
def test_orphaned_children_are_settled_and_finished_ones_are_left_alone() -> None:
    """Productive use: a user continues a session whose previous run was killed.
    Expected outcome: the agents that never finished are closed, and the one that
    did keeps everything it recorded."""
    state = _snapshot()
    state.child_states = [
        {"canonical_name": "died-mid-flight", "state": "running", "active_tools": ["terminal"]},
        {"canonical_name": "never-dispatched", "state": "queued", "active_tools": []},
        {"canonical_name": "waiting-on-a-slot", "state": "waiting_on_model_slot"},
        {
            "canonical_name": "finished",
            "state": "succeeded",
            "completed_at": "2026-08-21T21:02:36.304493Z",
            "produced_artifact_ids": ["art_1"],
        },
    ]

    assert settle_orphaned_children(state) == 3

    settled = {child["canonical_name"]: child for child in state.child_states}
    for name in ("died-mid-flight", "never-dispatched", "waiting-on-a-slot"):
        assert settled[name]["state"] == ORPHANED_CHILD_STATE
        assert settled[name]["completed_at"], f"{name} would still read as running since forever"
        assert settled[name]["active_tools"] == []
    assert settled["finished"] == {
        "canonical_name": "finished",
        "state": "succeeded",
        "completed_at": "2026-08-21T21:02:36.304493Z",
        "produced_artifact_ids": ["art_1"],
    }


@verifies(SWR.SWR_3714)
def test_settling_orphaned_children_is_idempotent() -> None:
    """A second continuation of the same session must not rewrite what the first
    one already closed — the completion time it recorded is the honest one."""
    state = _snapshot()
    state.child_states = [{"canonical_name": "died-mid-flight", "state": "running"}]

    assert settle_orphaned_children(state) == 1
    first = [dict(child) for child in state.child_states]

    assert settle_orphaned_children(state) == 0
    assert state.child_states == first


@verifies(SWR.SWR_3714)
def test_terminal_child_states_match_the_state_machine() -> None:
    """The plain strings this module matches on are the state machine's own.

    They are spelled out rather than imported so that reading a session snapshot
    never drags in the orchestrator barrel; this is what keeps the copy honest.
    """
    from rotaris_core.orchestrator.child_state import ChildTaskState

    assert {str(state) for state in ChildTaskState if state.is_terminal()} == TERMINAL_CHILD_STATES
    assert str(ChildTaskState.CANCELLED) == ORPHANED_CHILD_STATE
    assert ChildTaskState(ORPHANED_CHILD_STATE).is_terminal() is True
