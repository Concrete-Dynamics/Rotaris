"""Getting a workspace back after the process that owned a run was killed.

The crash is simulated honestly. A real session is created in a real Git
repository, real checkpoints are taken through the real ``CheckpointService``,
and then the state a hard kill leaves behind is reproduced exactly: the status
still says ``"running"`` and the lock still names a pid — the pid of a real
child process this test spawned and waited for, so it is genuinely gone by the
time anything is asserted. No pid is invented.

What is asserted is the chain a user actually walks: the session is reported
stale, the CLI listing says so, a worktree integration stops being blocked by
it, ``--repair`` clears it once and does nothing the second time, and only then
does a checkpoint restore change the files on disk. The last two tests assert
the opposite direction, which is the one that matters more: a session whose lock
names a live process, and a session whose lock cannot be read, are both left
alone.
"""

from __future__ import annotations

import gc
import json
import os
import subprocess
import sys
from typing import TYPE_CHECKING

import pytest
from typer.testing import CliRunner

from rotaris_core.cli.app import app
from rotaris_core.cli.argparse_app import main as headless_main
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoint_restore import CheckpointRestorer
from rotaris_core.session.checkpoint_service import CheckpointService
from rotaris_core.session.liveness import pid_is_alive
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.recovery import (
    INTERRUPTED_EXECUTION_STATUS,
    detect_stale_sessions,
    session_is_live,
)
from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.session.state import SessionState

pytestmark = pytest.mark.integration

runner = CliRunner()


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(  # noqa: S603
        ["git", *args], cwd=cwd, text=True, encoding="utf-8", capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def _repository(tmp_path: Path) -> Path:
    root = tmp_path / "workspace"
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "alpha.txt").write_text("one\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


#: The reaped pid this module reuses; ``None`` until the first test asks for one.
_REAPED_PID: int | None = None


def _spawn_and_reap() -> int:
    """A pid that is certainly gone: a real child, spawned, waited for, released.

    The parent's handle has to be released too -- Windows keeps an exited process
    addressable while any handle to it is open.
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

    Reaping a fresh interpreter for every call cost about 1.8s each here, which was
    most of this file's runtime. A reaped pid does not come back to life on its own,
    so the spawn is worth doing once and re-checking afterwards: the only way the
    cached one stops being usable is the operating system handing that number to
    something else, which the probe below catches.
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


def _write_lock(manager: SessionManager, session_id: str, payload: object) -> None:
    lock = manager.session_dir(session_id) / "lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.write_text(json.dumps(payload), encoding="utf-8")


def _running_session(root: Path) -> tuple[SessionManager, SessionState]:
    """A session with two real checkpoints, mid-run, as a crash would leave it."""
    config = RotarisConfig(workspace_root=root)
    manager = SessionManager(root)
    state = manager.create_session(config)
    service = CheckpointService(
        session_manager=manager,
        state=state,
        tree_root=root,
        config=config,
        isolated=True,
    )
    (root / "alpha.txt").write_text("two\n", encoding="utf-8")
    assert service.capture(iteration=1) is not None
    (root / "beta.txt").write_text("added later\n", encoding="utf-8")
    assert service.capture(iteration=2) is not None
    state.execution_status = "running"
    manager.flush_session(state)
    return manager, state


def _crashed_session(root: Path) -> tuple[SessionManager, SessionState, int]:
    """The same session, with the lock a killed process would have left behind."""
    manager, state = _running_session(root)
    pid = _dead_pid()
    _write_lock(
        manager,
        state.session_id,
        {"pid": pid, "acquired_at": "2026-01-01T00:00:00+00:00"},
    )
    return manager, state, pid


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_crashed_session_is_reported_stale_and_named_in_the_cli_listing(
    tmp_path: Path,
) -> None:
    """Productive use: a user asks why a session has been "running" since their laptop died.
    Expected outcome: the listing marks it stale and the reason names the process that is gone."""
    root = _repository(tmp_path)
    manager, state, pid = _crashed_session(root)

    detected = detect_stale_sessions(manager)

    assert [entry.session_id for entry in detected] == [state.session_id]
    assert detected[0].execution_status == "running"
    assert str(pid) in detected[0].reason

    listed = runner.invoke(app, ["sessions", "--workspace", str(root)])

    assert listed.exit_code == 0
    assert "running (stale)" in listed.stdout
    assert state.session_id in listed.stdout


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_headless_sessions_listing_marks_a_crashed_session_stale(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user on a server checks a workspace over SSH.
    Expected outcome: the headless listing marks the stuck session the same way."""
    root = _repository(tmp_path)
    _manager, state, _pid = _crashed_session(root)

    assert headless_main(["sessions", "--workspace", str(root)]) == 0

    printed = capsys.readouterr().out

    assert state.session_id in printed
    assert "running (stale)" in printed


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_crashed_session_stops_blocking_worktree_integration(tmp_path: Path) -> None:
    """Productive use: a user integrates an isolated worktree after an earlier session crashed.
    Expected outcome: the dead session is skipped, while a genuinely live one still blocks."""
    root = _repository(tmp_path)
    manager, state, _pid = _crashed_session(root)
    service = GitWorktreeService(root)

    # No exception: a session nothing is running cannot claim the base workspace.
    service._require_base_not_in_use(manager, "integration-session")

    # The same session with a lock naming this very process still blocks, so the
    # skip is a liveness decision and not a hole in the check.
    _write_lock(manager, state.session_id, {"pid": os.getpid()})
    with pytest.raises(GitWorktreeError, match="still running in the base worktree"):
        service._require_base_not_in_use(manager, "integration-session")


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_repair_clears_the_session_once_and_does_nothing_the_second_time(
    tmp_path: Path,
) -> None:
    """Productive use: a user runs the repair, then runs it again to be sure.
    Expected outcome: the first run reports what it changed; the second changes nothing."""
    root = _repository(tmp_path)
    manager, state, pid = _crashed_session(root)

    first = runner.invoke(app, ["sessions", "--workspace", str(root), "--repair"])

    assert first.exit_code == 0
    assert f"repaired {state.session_id}" in first.stdout
    assert f"running -> {INTERRUPTED_EXECUTION_STATUS}" in first.stdout
    assert str(pid) in first.stdout
    assert (
        manager.read_session_snapshot(state.session_id).execution_status
        == INTERRUPTED_EXECUTION_STATUS
    )
    assert (manager.session_dir(state.session_id) / "lock").exists() is False

    second = runner.invoke(app, ["sessions", "--workspace", str(root), "--repair"])

    assert second.exit_code == 0
    assert "repaired" not in second.stdout
    assert "No session was left marked as running" in second.stdout
    assert "(stale)" not in second.stdout
    assert (
        manager.read_session_snapshot(state.session_id).execution_status
        == INTERRUPTED_EXECUTION_STATUS
    )


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_headless_repair_clears_a_crashed_session(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Productive use: a user recovers a crashed workspace from a headless shell.
    Expected outcome: the same repair is available from rotaris-headless."""
    root = _repository(tmp_path)
    manager, state, _pid = _crashed_session(root)

    assert headless_main(["sessions", "--workspace", str(root), "--repair"]) == 0

    printed = capsys.readouterr().out

    assert f"repaired {state.session_id}" in printed
    assert (
        manager.read_session_snapshot(state.session_id).execution_status
        == INTERRUPTED_EXECUTION_STATUS
    )


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_repaired_session_can_actually_restore_its_checkpoints(tmp_path: Path) -> None:
    """Productive use: a user rolls back the work of a run their machine killed.
    Expected outcome: the files on disk return to the chosen checkpoint's contents."""
    root = _repository(tmp_path)
    manager, state, _pid = _crashed_session(root)

    assert runner.invoke(app, ["sessions", "--workspace", str(root), "--repair"]).exit_code == 0

    restorer = CheckpointRestorer(session_manager=manager, session_id=state.session_id)
    result = restorer.restore(1)

    assert result.restored is True, result.blocked_reason
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "two\n"
    assert (root / "beta.txt").exists() is False
    # The rollback is itself undoable, which is only possible because the
    # session was writable again.
    recorded = manager.read_session_snapshot(state.session_id)
    assert [entry.kind for entry in recorded.checkpoints][-1] == "pre_restore"
    assert recorded.execution_status == INTERRUPTED_EXECUTION_STATUS


# ── the safe direction: anything unproven is left running ───────────────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_session_owned_by_a_live_process_is_never_repaired(tmp_path: Path) -> None:
    """Productive use: a user runs the repair while another window is mid-run.
    Expected outcome: the running session keeps its status, its lock and its refusal."""
    root = _repository(tmp_path)
    manager, state = _running_session(root)
    _write_lock(manager, state.session_id, {"pid": os.getpid()})

    assert session_is_live(manager, state.session_id) is True

    result = runner.invoke(app, ["sessions", "--workspace", str(root), "--repair"])

    assert result.exit_code == 0
    assert "repaired" not in result.stdout
    assert "(stale)" not in result.stdout
    assert manager.read_session_snapshot(state.session_id).execution_status == "running"
    assert (manager.session_dir(state.session_id) / "lock").exists() is True


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_session_with_an_unreadable_lock_is_never_repaired(tmp_path: Path) -> None:
    """Productive use: a user's lock file is left corrupt by the same crash.
    Expected outcome: the session stays "running" rather than being silently rewritten."""
    root = _repository(tmp_path)
    manager, state = _running_session(root)
    (manager.session_dir(state.session_id) / "lock").write_text("{ truncated", encoding="utf-8")

    assert session_is_live(manager, state.session_id) is True
    assert detect_stale_sessions(manager) == ()

    result = runner.invoke(app, ["sessions", "--workspace", str(root), "--repair"])

    assert result.exit_code == 0
    assert "repaired" not in result.stdout
    assert manager.read_session_snapshot(state.session_id).execution_status == "running"
