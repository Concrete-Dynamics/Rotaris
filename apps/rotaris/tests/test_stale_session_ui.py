"""Rolling back a session whose process was killed, from the desktop (SWR-2437).

Everything a user touches is real: a real Git repository, real checkpoints taken
through the real ``CheckpointService``, the real ``MainWindow`` with the real
store and the real ``CheckpointBridge`` on its own thread. Only the provider
probes are faked, because ``ConfigService._providers`` reaches out to every
configured endpoint and costs 5-18 s this flow never reads.

The crash is real too. The lock is written with the pid of a child process that
is spawned and waited for, so it is genuinely gone; nothing here invents a pid.

Two directions are asserted, and the second is the one that matters more:

* A session whose process died offers its checkpoints again, and says out loud
  that it rewrote the stored status rather than doing it behind the user's back.
* A session that really is running is still refused, with a reason that says
  *why* — a live run and a probe that could not answer are different problems.
"""

from __future__ import annotations

import gc
import json
import os
import subprocess
import sys
from typing import TYPE_CHECKING, Any

import pytest
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QCheckBox, QComboBox, QPushButton, QTreeWidget
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoint_service import CheckpointService
from rotaris_core.session.liveness import pid_is_alive
from rotaris_core.session.manager import SessionManager
from ui_query import click, click_by_name, find_by_accessible_name, settle

from rotaris.models.store import WorkspaceStore
from rotaris.services.checkpoint_bridge import (
    RUNNING_SESSION_REASON,
    UNCONFIRMED_SESSION_REASON,
    CheckpointBridge,
)
from rotaris.services.config_service import ConfigService
from rotaris.views.main_window import MainWindow
from rotaris.widgets import CheckpointRestoreDialog

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.session.state import SessionState

pytestmark = pytest.mark.e2e


# ── a real repository, a real session, a real dead process ──────────────────


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
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
    """A pid that is certainly gone: a real child, spawned, waited for, released."""

    def spawn() -> int:
        process = subprocess.Popen([sys.executable, "-c", "pass"])
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


def _running_session(root: Path) -> tuple[SessionManager, SessionState]:
    """Two real checkpoints and a status that still claims a run."""
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


def _write_lock(manager: SessionManager, session_id: str, pid: int) -> None:
    lock = manager.session_dir(session_id) / "lock"
    lock.write_text(
        json.dumps({"pid": pid, "acquired_at": "2026-01-01T00:00:00+00:00"}),
        encoding="utf-8",
    )


def _window(qtbot: Any, root: Path, announced: list[str] | None = None) -> MainWindow:
    store = WorkspaceStore()
    if announced is not None:
        # Connected before the window exists: ``ConfigService.load`` already
        # publishes the session list, so the Git view asks for a listing from
        # inside ``MainWindow.__init__`` and any notice would be missed by a
        # listener attached afterwards.
        store.notice_changed.connect(
            lambda: announced.append("" if store.ui.notice is None else store.ui.notice.message)
        )
    service = ConfigService(root, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    window.resize(1440, 900)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("git")
    settle(qtbot)
    return window


def _settled_listing(qtbot: Any, window: MainWindow, session_id: str) -> None:
    window.config_service.refresh_sessions()
    settle(qtbot)
    qtbot.waitUntil(
        lambda: (
            window.store.checkpoints.session_id == session_id
            and not window.store.checkpoints.loading
        ),
        timeout=30_000,
    )


def _select_checkpoint(window: MainWindow, session_id: str, sequence: int) -> None:
    combo = find_by_accessible_name(window.git, "Checkpoint session", QComboBox)
    combo.setCurrentIndex(combo.findData(session_id))
    table = find_by_accessible_name(window.git, "Session checkpoints", QTreeWidget)
    for row in range(table.topLevelItemCount()):
        item = table.topLevelItem(row)
        if item.text(0) == str(sequence):
            # Row selection stays programmatic: clicking a tree row needs
            # viewport geometry, and the control under test is the restore
            # button, not the table's hit testing.
            item.setSelected(True)
            return
    raise AssertionError(f"checkpoint {sequence} is not listed: {window.store.checkpoints}")


def _answer_restore_dialog(qtbot: Any, window: MainWindow, seen: dict[str, Any]) -> QTimer:
    """Confirm the modal restore dialog the way a user would, once it appears.

    A poller rather than a one-shot: ``exec()`` runs a nested event loop and the
    dialog only opens once the preview comes back off the worker thread.
    """
    timer = QTimer(window)
    timer.setInterval(20)

    def tick() -> None:
        dialogs = [d for d in window.findChildren(CheckpointRestoreDialog) if d.isVisible()]
        if not dialogs:
            return
        dialog = dialogs[0]
        seen["preview_text"] = dialog.preview_text.toPlainText()
        timer.stop()
        if dialog.force_check is not None:
            click(
                qtbot, find_by_accessible_name(dialog, "Overwrite uncommitted changes", QCheckBox)
            )
        click_by_name(qtbot, dialog, dialog.confirm_button.accessibleName(), QPushButton)

    timer.timeout.connect(tick)
    timer.start()
    return timer


# ── the session whose process died ──────────────────────────────────────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_crashed_sessions_rollback_is_offered_again_and_the_repair_is_announced(
    tmp_path, qtbot
) -> None:
    """Productive use: a user rolls back work from a run their machine killed mid-flight.
    Expected outcome: the restore is offered, the files return to the checkpoint, and the
    rewritten status is announced rather than applied silently."""
    root = _repository(tmp_path)
    manager, state = _running_session(root)
    _write_lock(manager, state.session_id, _dead_pid())
    announced: list[str] = []
    window = _window(qtbot, root, announced)

    _settled_listing(qtbot, window, state.session_id)

    assert window.store.checkpoints.available is True
    assert window.store.checkpoints.unavailable_reason == ""
    assert manager.read_session_snapshot(state.session_id).execution_status == "interrupted"
    assert (manager.session_dir(state.session_id) / "lock").exists() is False
    assert any("marked it interrupted" in message for message in announced), announced

    _select_checkpoint(window, state.session_id, 1)
    restore_button = find_by_accessible_name(
        window.git, "Restore selected checkpoint", QPushButton, visible_only=True
    )

    assert restore_button.isEnabled() is True
    assert RUNNING_SESSION_REASON not in restore_button.toolTip()

    seen: dict[str, Any] = {}
    timer = _answer_restore_dialog(qtbot, window, seen)
    click_by_name(qtbot, window.git, "Restore selected checkpoint", QPushButton)
    qtbot.waitUntil(lambda: not window._checkpoint_bridge.busy and bool(seen), timeout=30_000)
    timer.stop()
    qtbot.waitUntil(
        lambda: (root / "alpha.txt").read_text(encoding="utf-8") == "two\n",
        timeout=30_000,
    )

    assert (root / "beta.txt").exists() is False


# ── the session that really is running ──────────────────────────────────────


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_session_with_a_live_process_is_still_refused_and_told_why(tmp_path, qtbot) -> None:
    """Productive use: a user tries to roll back a session that is genuinely still working.
    Expected outcome: the restore is refused, the reason names the live run, and nothing
    on disk is rewritten."""
    root = _repository(tmp_path)
    manager, state = _running_session(root)
    _write_lock(manager, state.session_id, os.getpid())
    window = _window(qtbot, root)

    _settled_listing(qtbot, window, state.session_id)
    settle(qtbot)

    assert window.store.checkpoints.available is False
    assert window.store.checkpoints.unavailable_reason == RUNNING_SESSION_REASON
    assert manager.read_session_snapshot(state.session_id).execution_status == "running"
    assert (manager.session_dir(state.session_id) / "lock").exists() is True

    button = find_by_accessible_name(
        window.git, "Restore selected checkpoint", QPushButton, visible_only=True
    )

    assert button.isEnabled() is False
    assert RUNNING_SESSION_REASON in button.toolTip()
    assert RUNNING_SESSION_REASON in button.accessibleDescription()
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "two\n"


@verifies(SWR.SWR_2437, SWR.SWR_2817)
def test_a_refusal_says_when_the_run_could_not_be_confirmed_rather_than_claiming_it_runs(
    tmp_path, qtbot
) -> None:
    """Productive use: a user's session state cannot be read at all.
    Expected outcome: the refusal says the status could not be confirmed, not that a run is live."""
    del qtbot
    root = _repository(tmp_path)
    _manager, state = _running_session(root)

    def _unanswerable(_session_id: str) -> bool:
        raise OSError("the session store is unreadable")

    bridge = CheckpointBridge(root, session_is_running=_unanswerable)
    outcomes: list[Any] = []
    bridge.restored.connect(outcomes.append)
    try:
        assert bridge.restore(state.session_id, 1) is True
    finally:
        bridge.shutdown()

    assert outcomes[0].restored is False
    assert outcomes[0].blocked_reason == UNCONFIRMED_SESSION_REASON
    assert outcomes[0].blocked_reason != RUNNING_SESSION_REASON
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "two\n"
