from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QCheckBox, QLineEdit, QPushButton
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.events.bus import reset_event_registry
from rotaris_core.eventstore import event_store_path, reset_event_store_registry
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.worktrees import GitWorktreeService
from ui_query import click, click_by_name, find_by_accessible_name, type_text

from rotaris.models.state import SessionInfo, WorktreeInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.worktree_integration import WorktreeIntegrationBridge
from rotaris.views.chrome import StatusBar
from rotaris.views.git import GitView
from rotaris.views.main_window import _SessionLaunchDialog, _SessionsDialog
from rotaris.widgets import MergeOrderDialog

if TYPE_CHECKING:
    from rotaris_core.session.state import SessionState

pytestmark = pytest.mark.e2e


@pytest.fixture(autouse=True)
def _clean_run_registries() -> object:
    """No sink or store may survive into — or out of — one of these tests."""
    reset_event_registry()
    reset_event_store_registry()
    yield
    reset_event_registry()
    reset_event_store_registry()


@verifies(SWR.SWR_2404)
def test_user_can_enable_worktree_isolation_before_starting_session(qtbot) -> None:
    """Productive use: Rotaris user starts a parallel-safe task session.
    Expected outcome: isolation toggle enables optional branch input and preserves selection."""
    dialog = _SessionLaunchDialog("20260723-preview")
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.waitExposed(dialog)

    isolate = find_by_accessible_name(dialog, "Enable worktree isolation", QCheckBox)
    branch = find_by_accessible_name(dialog, "Isolated worktree branch", QLineEdit)
    assert not branch.isEnabled()
    assert branch.text() == "rotaris/session/20260723-preview"

    click(qtbot, isolate)
    branch.clear()
    type_text(qtbot, branch, "feature/parallel-task")
    click_by_name(qtbot, dialog, "Continue", QPushButton)

    assert dialog.isolate is True
    assert dialog.branch == "feature/parallel-task"


@verifies(SWR.SWR_2403)
def test_session_browser_shows_persisted_worktree_branch(qtbot) -> None:
    """Productive use: user can find a completed isolated session to review or resume.
    Expected outcome: session browser renders its persisted worktree branch."""
    store = WorkspaceStore()
    store.sessions = [
        SessionInfo(
            id="isolated-session",
            name="isolated-session",
            status="completed",
            branch="rotaris/session/isolated",
        )
    ]
    dialog = _SessionsDialog(store)
    qtbot.addWidget(dialog)

    assert "rotaris/session/isolated" in dialog.sessions.item(0).text()


@verifies(SWR.SWR_2405, SWR.SWR_2413)
def test_user_selects_completed_session_worktrees_for_integration(qtbot) -> None:
    """Productive use: Rotaris user accepts completed parallel session results.
    Expected outcome: Git view emits only completed isolated session IDs for integration."""
    store = WorkspaceStore()
    store.branch = "main"
    store.worktrees = [
        WorktreeInfo("main", "/repo", is_base=True, active=True),
        WorktreeInfo(
            "rotaris/session/done",
            "/repo/.rotaris/worktrees/done",
            session="done-session",
            session_status="completed",
        ),
        WorktreeInfo(
            "rotaris/session/live",
            "/repo/.rotaris/worktrees/live",
            session="live-session",
            session_status="running",
        ),
    ]
    view = GitView(store)
    qtbot.addWidget(view)
    view.show()
    qtbot.waitExposed(view)
    selected: list[list[str]] = []
    view.merge_worktrees_requested.connect(selected.append)

    # Row selection stays programmatic — clicking a tree row needs viewport
    # geometry, and the wiring under test is the merge control, not the table.
    view.worktree_table.topLevelItem(1).setSelected(True)
    view.worktree_table.topLevelItem(2).setSelected(True)
    click_by_name(qtbot, view, "Merge selected completed worktrees", QPushButton)

    assert selected == [["done-session"]]


@verifies(SWR.SWR_2413)
def test_user_reorders_selected_worktrees_before_integration(qtbot) -> None:
    """Productive use: user decides which completed session merges first.
    Expected outcome: dialog reports the user's order and stops moves at the list ends."""
    dialog = MergeOrderDialog(
        [("first-session", "rotaris/session/first"), ("second-session", "rotaris/session/second")]
    )
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.waitExposed(dialog)
    move_up = find_by_accessible_name(dialog, "Move selected branch earlier", QPushButton)

    assert dialog.ordered_session_ids == ["first-session", "second-session"]
    assert not move_up.isEnabled()
    assert dialog.move_down_button.isEnabled()

    dialog.order_list.setCurrentRow(1)
    click(qtbot, move_up)

    assert dialog.ordered_session_ids == ["second-session", "first-session"]
    assert dialog.order_list.item(0).text() == "rotaris/session/second — second-session"
    assert not dialog.move_up_button.isEnabled()
    assert dialog.move_down_button.isEnabled()


@verifies(SWR.SWR_2413)
def test_user_merges_completed_worktrees_into_base_branch(tmp_path, qtbot, monkeypatch) -> None:
    """Productive use: user accepts two completed parallel sessions from the Git view.
    Expected outcome: base branch fast-forwards to both results while worktrees stay available."""
    base = _repository(tmp_path)
    config = RotarisConfig(workspace_root=base)
    manager = SessionManager(base)
    sessions = _completed_sessions(base, manager, config)
    store = _store_for(base, sessions)
    view = GitView(store)
    qtbot.addWidget(view)
    view.show()
    qtbot.waitExposed(view)
    emitted: list[list[str]] = []
    view.merge_worktrees_requested.connect(emitted.append)

    view.worktree_table.topLevelItem(2).setSelected(True)
    view.worktree_table.topLevelItem(1).setSelected(True)
    click_by_name(qtbot, view, "Merge selected completed worktrees", QPushButton)

    # Row order, not Qt selection order, seeds the dialog.
    assert emitted == [[sessions[0].session_id, sessions[1].session_id]]

    dialog = MergeOrderDialog(
        [(state.session_id, str(state.worktree.branch)) for state in sessions]
    )
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.waitExposed(dialog)
    dialog.order_list.setCurrentRow(1)
    click_by_name(qtbot, dialog, "Move selected branch earlier", QPushButton)
    ordered = dialog.ordered_session_ids

    prompts: list[str] = []
    _patch_integration_agent(monkeypatch, prompts, status="completed")
    bridge = WorktreeIntegrationBridge(base, SimpleNamespace(build_run_config=lambda: config))
    with qtbot.waitSignal(bridge.succeeded, timeout=30_000):
        assert bridge.start(ordered) is True
    qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)

    assert _merge_order(prompts[0]) == [
        str(sessions[1].worktree.branch),
        str(sessions[0].worktree.branch),
    ]
    assert (base / "one.txt").read_text(encoding="utf-8") == "first"
    assert (base / "two.txt").read_text(encoding="utf-8") == "second"
    for state in sessions:
        assert state.worktree is not None
        assert _git_ok(base, "merge-base", "--is-ancestor", state.worktree.branch, "HEAD")
        snapshot = manager.read_session_snapshot(state.session_id)
        assert snapshot.worktree is not None
        assert snapshot.worktree.merge_status == "merged"
        assert Path(state.worktree.path).is_dir()


@verifies(SWR.SWR_2413)
def test_failed_integration_names_retained_worktree_and_keeps_base(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: integration agent fails and the user needs a recovery path.
    Expected outcome: base stays on its old commit and the error names the retained worktree."""
    base = _repository(tmp_path)
    config = RotarisConfig(workspace_root=base)
    manager = SessionManager(base)
    sessions = _completed_sessions(base, manager, config)
    head_before = _git(base, "rev-parse", "HEAD")

    _patch_integration_agent(monkeypatch, [], status="failed")
    bridge = WorktreeIntegrationBridge(base, SimpleNamespace(build_run_config=lambda: config))
    with qtbot.waitSignal(bridge.failed, timeout=30_000) as blocker:
        assert bridge.start([state.session_id for state in sessions]) is True
    qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)

    message = str(blocker.args[0])
    retained = sorted((base / ".rotaris" / "worktrees" / "integrations").iterdir())
    assert len(retained) == 1
    assert str(retained[0]) in message
    assert "Base was left untouched." in message
    assert _git(base, "rev-parse", "HEAD") == head_before
    assert not (base / "one.txt").exists()
    for state in sessions:
        snapshot = manager.read_session_snapshot(state.session_id)
        assert snapshot.worktree is not None
        assert snapshot.worktree.merge_status == "merge_failed"


@verifies(SWR.SWR_2413, SWR.SWR_2453, SWR.SWR_2901)
def test_an_integration_run_leaves_the_session_any_other_run_leaves(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: a user merges two worktrees and later wants to see what the
    hidden agent did — replay it, export it, resume it — exactly as for a session
    they started themselves.
    Expected outcome: the integration session has the event store, the lifecycle
    events and the released lock every other run leaves behind."""
    base = _repository(tmp_path)
    config = RotarisConfig(workspace_root=base)
    manager = SessionManager(base)
    sessions = _completed_sessions(base, manager, config)

    _patch_integration_agent(monkeypatch, [], status="completed")
    bridge = WorktreeIntegrationBridge(base, SimpleNamespace(build_run_config=lambda: config))
    started: list[str] = []
    bridge.started.connect(started.append)
    with qtbot.waitSignal(bridge.succeeded, timeout=30_000):
        assert bridge.start([state.session_id for state in sessions]) is True
    qtbot.waitUntil(lambda: not bridge.running, timeout=10_000)

    assert len(started) == 1
    session_id = started[0]

    # The store, which this path had none of while it drove the runtime directly.
    events = _stored_events(manager, session_id)
    kinds = [event["event"] for event in events]
    assert kinds[0] == "session.start", kinds
    assert kinds[-1] == "result", kinds
    assert "session.end" in kinds, kinds

    # …and the session itself, indistinguishable from any other completed run.
    snapshot = manager.read_session_snapshot(session_id)
    assert snapshot.execution_status == "completed"
    assert snapshot.internal is True
    assert str(snapshot.run_type).endswith("integration_run")
    assert snapshot.worktree is not None
    assert snapshot.worktree.merge_status == "merged"
    assert snapshot.worktree.integration_session_id == session_id
    # Released by the lifecycle's own ``finally``; a lock still held here would
    # mean the session could never be resumed or re-integrated.
    assert manager.acquire_lock(session_id) is True
    manager.release_lock(session_id)


def _stored_events(manager: SessionManager, session_id: str) -> list[dict]:
    """Every line of the session's store, parsed one line at a time.

    Line by line on purpose: the store's promise is that each line is one
    complete wire event, and reading the file whole would hide a line that is
    not.
    """
    path = event_store_path(manager.session_dir(session_id))
    assert path.exists(), f"no event store at {path}"
    return [
        json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()
    ]


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, encoding="utf-8", capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def _git_ok(cwd: Path, *args: str) -> bool:
    return (
        subprocess.run(
            ["git", *args], cwd=cwd, text=True, capture_output=True, check=False
        ).returncode
        == 0
    )


def _repository(tmp_path: Path) -> Path:
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Test User")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    (tmp_path / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (tmp_path / "base.txt").write_text("base\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    return tmp_path


def _completed_sessions(
    base: Path, manager: SessionManager, config: RotarisConfig
) -> list[SessionState]:
    service = GitWorktreeService(base)
    sessions: list[SessionState] = []
    for name, filename in (("first", "one.txt"), ("second", "two.txt")):
        state = manager.create_session(config)
        state.worktree = service.create_for_session(state.session_id, f"rotaris/session/{name}")
        state.execution_status = "completed"
        manager.flush_session(state)
        manager.release_lock(state.session_id)
        (Path(state.worktree.path) / filename).write_text(name, encoding="utf-8")
        sessions.append(state)
    return sessions


def _store_for(base: Path, sessions: list[SessionState]) -> WorkspaceStore:
    store = WorkspaceStore()
    store.branch = "main"
    store.worktrees = [WorktreeInfo("main", str(base), is_base=True, active=True)] + [
        WorktreeInfo(
            str(state.worktree.branch),
            str(state.worktree.path),
            session=state.session_id,
            session_status="completed",
        )
        for state in sessions
        if state.worktree is not None
    ]
    return store


def _merge_order(prompt: str) -> list[str]:
    return re.findall(r"^\d+\. `(.+)`$", prompt, flags=re.MULTILINE)


def _patch_integration_agent(monkeypatch, prompts: list[str], *, status: str) -> None:
    """Stand in for the hidden integration agent: real Git merges, no LLM."""

    async def fake_run_task(prompt, config, manager, state, max_iterations, **kwargs):
        prompts.append(prompt)
        if status == "completed":
            for branch in _merge_order(prompt):
                _git(
                    Path(config.workspace_root), "merge", "--no-ff", branch, "-m", f"merge {branch}"
                )
        return SimpleNamespace(iterations=[])

    monkeypatch.setattr("rotaris_core.cli.background._run_task", fake_run_task)
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: (status, f"Integration agent {status}.", "info"),
    )


@verifies(SWR.SWR_2406)
def test_active_isolated_session_branch_is_visible_in_status_bar(qtbot) -> None:
    """Productive use: Rotaris user can identify the active isolated workspace.
    Expected outcome: status bar shows session worktree branch instead of base branch."""
    store = WorkspaceStore()
    store.workspace_path = "/repo"
    store.branch = "main"
    store.set_session_runtime_label("rotaris/session/parallel")
    status = StatusBar(store)
    qtbot.addWidget(status)

    assert "rotaris/session/parallel" in status.branch_label.text()
