"""Rolling a session's working tree back from the desktop (SWR-2437).

Everything a user touches here is real: a real Git repository, real checkpoints
taken through the real ``CheckpointService``, the real ``MainWindow`` with the
real store and the real ``CheckpointBridge`` on its own thread. Only the
provider probes are faked, because ``ConfigService._providers`` reaches out to
every configured endpoint and costs 5-18 s that this flow never reads.

The assertions are about **files on disk**, not about signals. A restore that
emitted every signal correctly and left the tree unchanged is the failure this
requirement exists to prevent — as is a preview that tells the user a file will
be created when the restore deletes it.
"""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING, Any

import pytest
from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import QCheckBox, QPushButton
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoint_restore import CheckpointRestorer, format_preview_lines
from rotaris_core.session.checkpoint_service import CheckpointService
from rotaris_core.session.manager import SessionManager
from ui_query import click, click_by_name, find_by_accessible_name, settle

from rotaris.models.state import (
    CheckpointList,
    CheckpointPreview,
    CheckpointRow,
    SessionInfo,
)
from rotaris.models.store import WorkspaceStore
from rotaris.services.checkpoint_bridge import RUNNING_SESSION_REASON, CheckpointBridge
from rotaris.services.config_service import ConfigService
from rotaris.views.git import GitView
from rotaris.views.main_window import MainWindow
from rotaris.widgets import CheckpointRestoreDialog

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.session.state import SessionState

pytestmark = pytest.mark.e2e


# ── the repository and the checkpoints a real run would have left ───────────


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


def _checkpointed_session(root: Path) -> tuple[SessionManager, SessionState]:
    """Three real checkpoints, as three iterations of a real run would leave them.

    1. ``alpha.txt`` edited.
    2. ``beta.txt`` added on top.
    3. ``alpha.txt`` edited again.

    So restoring 1 has to *delete* ``beta.txt`` — the case a preview that trusts
    Git's checkpoint-relative status letter gets exactly backwards.
    """
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
    (root / "alpha.txt").write_text("four\n", encoding="utf-8")
    assert service.capture(iteration=3) is not None
    state.execution_status = "completed"
    manager.flush_session(state)
    manager.release_lock(state.session_id)
    return manager, state


def _window(qtbot: Any, root: Path) -> MainWindow:
    store = WorkspaceStore()
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


def _drive_restore_dialog(
    qtbot: Any,
    window: MainWindow,
    *,
    force: bool,
    confirm: bool,
    seen: dict[str, Any],
) -> QTimer:
    """Answer the modal restore dialog the way a user would, once it appears.

    A poller rather than a one-shot: ``exec()`` runs a nested event loop, and the
    dialog only opens once the preview comes back off the worker thread, so there
    is no synchronous moment to hook.
    """
    timer = QTimer(window)
    timer.setInterval(20)

    def tick() -> None:
        dialogs = [d for d in window.findChildren(CheckpointRestoreDialog) if d.isVisible()]
        if not dialogs:
            return
        dialog = dialogs[0]
        seen["preview_text"] = dialog.preview_text.toPlainText()
        seen["confirm_enabled_before_force"] = dialog.confirm_button.isEnabled()
        seen["confirm_reason"] = str(dialog.confirm_button.property("availabilityReason") or "")
        seen["has_force"] = dialog.force_check is not None
        timer.stop()
        if force and dialog.force_check is not None:
            click(
                qtbot, find_by_accessible_name(dialog, "Overwrite uncommitted changes", QCheckBox)
            )
        if confirm:
            click_by_name(qtbot, dialog, dialog.confirm_button.accessibleName(), QPushButton)
        else:
            click_by_name(qtbot, dialog, "Cancel restore", QPushButton)

    timer.timeout.connect(tick)
    timer.start()
    return timer


def _select_checkpoint(qtbot: Any, window: MainWindow, session_id: str, sequence: int) -> None:
    combo = window.git.checkpoint_session_combo
    combo.setCurrentIndex(combo.findData(session_id))
    # Choosing a session asks the engine for that session's checkpoints, so the
    # rows arrive on a later turn of the event loop rather than inside
    # setCurrentIndex. Wait for the render instead of reading a table that the
    # view has not drawn yet.
    table = window.git.checkpoint_table
    qtbot.waitUntil(lambda: table.topLevelItemCount() > 0, timeout=15_000)
    settle(qtbot)
    for row in range(table.topLevelItemCount()):
        item = table.topLevelItem(row)
        if item.text(0) == str(sequence):
            # Row selection stays programmatic: clicking a tree row needs
            # viewport geometry, and the wiring under test is the restore
            # control, not the table's hit testing.
            item.setSelected(True)
            return
    raise AssertionError(f"checkpoint {sequence} is not listed: {window.store.checkpoints}")


# ── the direction that is easy to get exactly backwards ─────────────────────


@verifies(SWR.SWR_2437)
def test_restore_preview_says_a_file_added_since_the_checkpoint_is_deleted(tmp_path, qtbot) -> None:
    """Productive use: a user reads what a rollback will do before allowing it.
    Expected outcome: a file added after the checkpoint is announced as deleted, not created."""
    root = _repository(tmp_path)
    manager, state = _checkpointed_session(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=state.session_id)
    preview = restorer.preview(1)
    assert preview is not None

    dialog = CheckpointRestoreDialog(
        CheckpointPreview(
            session_id=state.session_id,
            sequence=1,
            lines=tuple(format_preview_lines(preview)),
            changed_count=len(preview.entries),
            dirty_paths=tuple(preview.dirty_paths),
            blocked_reason=preview.blocked_reason,
        ),
        tree_root=str(root),
    )
    qtbot.addWidget(dialog)
    text = dialog.preview_text.toPlainText()

    assert "delete    beta.txt" in text
    assert "recreate  beta.txt" not in text
    assert "overwrite alpha.txt" in text


@verifies(SWR.SWR_2437)
def test_closing_the_restore_dialog_without_choosing_does_not_restore(tmp_path, qtbot) -> None:
    """Productive use: a user dismisses a destructive confirmation by accident.
    Expected outcome: the dialog reports a refusal, so nothing is rolled back."""
    del tmp_path
    preview = CheckpointPreview(
        sequence=2, lines=("Restoring checkpoint 2 would change 1 file(s):",)
    )
    escaped = CheckpointRestoreDialog(preview)
    qtbot.addWidget(escaped)
    escaped.show()
    qtbot.waitExposed(escaped)
    escape_decisions: list[bool] = []
    escaped.decided.connect(escape_decisions.append)

    qtbot.keyClick(escaped, Qt.Key.Key_Escape)

    assert escaped.confirmed is False
    assert escape_decisions == [False]

    closed = CheckpointRestoreDialog(preview)
    qtbot.addWidget(closed)
    close_decisions: list[bool] = []
    closed.decided.connect(close_decisions.append)

    closed.close()

    assert closed.confirmed is False
    assert close_decisions == [False]


@verifies(SWR.SWR_2437)
def test_restore_dialog_withholds_confirmation_until_overwriting_is_accepted(qtbot) -> None:
    """Productive use: a user with unsaved work is warned before it is overwritten.
    Expected outcome: the restore button is disabled with a reason until they opt in."""
    dialog = CheckpointRestoreDialog(
        CheckpointPreview(
            sequence=1,
            lines=("Restoring checkpoint 1 would change 1 file(s):", "  overwrite alpha.txt"),
            changed_count=1,
            dirty_paths=("alpha.txt",),
            blocked_reason="1 uncommitted change(s) would be overwritten: alpha.txt.",
        )
    )
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.waitExposed(dialog)

    assert dialog.confirm_button.isEnabled() is False
    assert "overwritten" in str(dialog.confirm_button.property("availabilityReason"))

    click(qtbot, find_by_accessible_name(dialog, "Overwrite uncommitted changes", QCheckBox))

    assert dialog.confirm_button.isEnabled() is True
    assert dialog.force is True


# ── the whole flow, through the window ──────────────────────────────────────


@verifies(SWR.SWR_2437)
def test_user_restores_a_session_checkpoint_from_the_git_view(tmp_path, qtbot) -> None:
    """Productive use: a user undoes an agent's later iterations from Rotaris.
    Expected outcome: the files on disk match the chosen checkpoint's state."""
    root = _repository(tmp_path)
    manager, state = _checkpointed_session(root)
    window = _window(qtbot, root)
    window.config_service.refresh_sessions()
    settle(qtbot)
    qtbot.waitUntil(
        lambda: (
            window.store.checkpoints.session_id == state.session_id
            and not window.store.checkpoints.loading
        ),
        timeout=15_000,
    )

    assert [row.sequence for row in window.store.checkpoints.rows] == [1, 2, 3]
    assert [row.iteration for row in window.store.checkpoints.rows] == [1, 2, 3]
    # The listing reaching the store is not the same as the view having drawn
    # it: the git view re-renders on the store's change signal, a turn later.
    qtbot.waitUntil(lambda: window.git.checkpoint_table.topLevelItemCount() == 3, timeout=15_000)

    _select_checkpoint(qtbot, window, state.session_id, 1)
    seen: dict[str, Any] = {}
    timer = _drive_restore_dialog(qtbot, window, force=False, confirm=True, seen=seen)
    click_by_name(qtbot, window.git, "Restore selected checkpoint", QPushButton)
    qtbot.waitUntil(lambda: not window._checkpoint_bridge.busy and bool(seen), timeout=30_000)
    timer.stop()
    qtbot.waitUntil(
        lambda: (root / "alpha.txt").read_text(encoding="utf-8") == "two\n",
        timeout=30_000,
    )

    assert not (root / "beta.txt").exists()
    assert "delete    beta.txt" in seen["preview_text"]
    notice = window.store.ui.notice
    assert notice is not None
    assert "Restored checkpoint 1" in notice.title
    # The rollback is itself undoable: a pre-restore checkpoint holds the tree
    # as it stood a moment ago.
    recorded = manager.read_session_snapshot(state.session_id).checkpoints
    assert [entry.kind for entry in recorded][-1] == "pre_restore"
    assert "Safety checkpoint 4" in notice.message


@verifies(SWR.SWR_2437)
def test_uncommitted_work_blocks_a_restore_and_leaves_the_tree_untouched(tmp_path, qtbot) -> None:
    """Productive use: a user who edited files since the last checkpoint tries to roll back.
    Expected outcome: they are told what would be overwritten and the files are left alone."""
    root = _repository(tmp_path)
    _manager, state = _checkpointed_session(root)
    (root / "alpha.txt").write_text("hand-edited\n", encoding="utf-8")
    window = _window(qtbot, root)
    window.config_service.refresh_sessions()
    settle(qtbot)
    qtbot.waitUntil(
        lambda: (
            window.store.checkpoints.session_id == state.session_id
            and not window.store.checkpoints.loading
        ),
        timeout=15_000,
    )

    _select_checkpoint(qtbot, window, state.session_id, 1)
    seen: dict[str, Any] = {}
    timer = _drive_restore_dialog(qtbot, window, force=False, confirm=False, seen=seen)
    click_by_name(qtbot, window.git, "Restore selected checkpoint", QPushButton)
    qtbot.waitUntil(lambda: bool(seen), timeout=30_000)
    timer.stop()
    settle(qtbot)

    assert seen["has_force"] is True
    assert seen["confirm_enabled_before_force"] is False
    assert "overwritten" in seen["confirm_reason"]
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "hand-edited\n"
    assert (root / "beta.txt").exists()


@verifies(SWR.SWR_2437)
def test_a_running_session_is_refused_a_rollback_with_the_reason_shown(tmp_path, qtbot) -> None:
    """Productive use: a user tries to roll back a session that is still working.
    Expected outcome: the restore is refused and the window explains why, not just greys out."""
    root = _repository(tmp_path)
    _manager, state = _checkpointed_session(root)
    bridge = CheckpointBridge(root, session_is_running=lambda _session_id: True)
    outcomes: list[Any] = []
    bridge.restored.connect(outcomes.append)
    try:
        assert bridge.restore(state.session_id, 1) is True
    finally:
        bridge.shutdown()

    assert outcomes[0].restored is False
    assert outcomes[0].blocked_reason == RUNNING_SESSION_REASON
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "four\n"

    store = WorkspaceStore()
    view = GitView(store)
    qtbot.addWidget(view)
    view.show()
    qtbot.waitExposed(view)
    store.set_sessions([SessionInfo(id=state.session_id, name=state.session_id, status="running")])
    store.set_checkpoints(
        CheckpointList(
            session_id=state.session_id,
            rows=(CheckpointRow(sequence=1, created_label="now", iteration=1, file_count=1),),
            available=False,
            unavailable_reason=RUNNING_SESSION_REASON,
        )
    )
    settle(qtbot)
    button = find_by_accessible_name(view, "Restore selected checkpoint", QPushButton)

    assert button.isEnabled() is False
    assert RUNNING_SESSION_REASON in button.toolTip()
    assert RUNNING_SESSION_REASON in button.accessibleDescription()
