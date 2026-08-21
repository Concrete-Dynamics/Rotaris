from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService


@verifies(SWR.SWR_2413)
def test_control_metadata_and_hidden_integration_session_do_not_block_acceptance(
    tmp_path: Path,
) -> None:
    """Productive use: hidden merge setup ignores its own persisted control data."""
    base = _repository(tmp_path)
    config = RotarisConfig(workspace_root=base)
    manager = SessionManager(base)
    service = GitWorktreeService(base)
    source = manager.create_session(config)
    source.worktree = service.create_for_session(source.session_id)
    source.execution_status = "completed"
    manager.flush_session(source)
    manager.release_lock(source.session_id)

    integration = manager.create_session(config, internal=True)
    manager.flush_session(integration)
    plan = service.prepare_integration(manager, [source], integration.session_id)

    assert plan.integration_path.is_dir()
    service.release_failed_integration(manager, plan)
    manager.release_lock(integration.session_id)


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _repository(tmp_path: Path) -> Path:
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Test User")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    (tmp_path / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (tmp_path / "base.txt").write_text("base\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    return tmp_path


@verifies(SWR.SWR_2401, SWR.SWR_2407, SWR.SWR_2410, SWR.SWR_2411)
def test_session_worktree_isolated_and_retained(tmp_path: Path) -> None:
    """Productive use: parallel-session user can work without touching base files.
    Expected outcome: session worktree lives under .rotaris and remains after creation."""
    base = _repository(tmp_path)
    service = GitWorktreeService(base, storage_subpath="worktrees/sessions")

    binding = service.create_for_session("20260723-abcdef123456")
    worktree = Path(binding.path)
    (worktree / "isolated.txt").write_text("only here\n", encoding="utf-8")

    assert binding.branch == "rotaris/session/20260723-abcdef123456"
    assert worktree == base / ".rotaris" / "worktrees" / "sessions" / "20260723-abcdef123456"
    assert (worktree / "isolated.txt").exists()
    assert not (base / "isolated.txt").exists()
    assert worktree.exists()


@verifies(SWR.SWR_2402, SWR.SWR_2409, SWR.SWR_2412)
def test_existing_worktree_can_be_attached_and_legacy_state_stays_loadable(tmp_path: Path) -> None:
    """Productive use: user can attach a session to an existing compatible worktree.
    Expected outcome: binding persists while old snapshots still deserialize without one."""
    base = _repository(tmp_path)
    service = GitWorktreeService(base)
    created = service.create_for_session("session-created")
    attached = service.attach_existing(Path(created.path))
    manager = SessionManager(base)
    state = manager.create_session(RotarisConfig(workspace_root=base))
    manager.flush_session(state)

    assert attached.path == created.path
    assert attached.created_by_session is False
    assert manager.read_session_snapshot(state.session_id).worktree is None


@verifies(SWR.SWR_2408, SWR.SWR_2412)
def test_invalid_branch_is_rejected_before_session_worktree_creation(tmp_path: Path) -> None:
    """Productive use: CLI or desktop user gets a clear error for an invalid branch.
    Expected outcome: no unsafe worktree is created from an invalid Git ref."""
    service = GitWorktreeService(_repository(tmp_path))

    with pytest.raises(GitWorktreeError, match="Invalid Git branch"):
        service.create_for_session("session", "invalid branch")


@verifies(SWR.SWR_2413)
def test_completed_worktrees_integrate_in_order_and_fast_forward_base(tmp_path: Path) -> None:
    """Productive use: user accepts completed parallel worktrees into the base branch.
    Expected outcome: base receives every selected change only after clean integration."""
    base = _repository(tmp_path)
    manager = SessionManager(base)
    service = GitWorktreeService(base)
    sessions = []
    for name, filename in (("first", "one.txt"), ("second", "two.txt")):
        state = manager.create_session(RotarisConfig(workspace_root=base))
        state.worktree = service.create_for_session(state.session_id, f"rotaris/session/{name}")
        state.execution_status = "completed"
        manager.flush_session(state)
        manager.release_lock(state.session_id)
        (Path(state.worktree.path) / filename).write_text(name, encoding="utf-8")
        sessions.append(state)

    integration = manager.create_session(RotarisConfig(workspace_root=base), internal=True)
    plan = service.prepare_integration(manager, list(reversed(sessions)), integration.session_id)

    # The caller's order is the user's chosen order and must reach the agent unchanged.
    assert plan.source_branches == ("rotaris/session/second", "rotaris/session/first")
    prompt = service.integration_prompt(plan)
    assert "1. `rotaris/session/second`" in prompt
    assert "2. `rotaris/session/first`" in prompt

    for branch in plan.source_branches:
        _git(plan.integration_path, "merge", "--no-ff", branch, "-m", f"merge {branch}")

    service.finalize_integration(manager, plan)

    assert (base / "one.txt").read_text(encoding="utf-8") == "first"
    assert (base / "two.txt").read_text(encoding="utf-8") == "second"
    assert all(
        manager.read_session_snapshot(state.session_id).worktree is not None
        and manager.read_session_snapshot(state.session_id).worktree.merge_status == "merged"
        for state in sessions
    )
    assert all(Path(state.worktree.path).exists() for state in sessions if state.worktree)


@verifies(SWR.SWR_2413)
def test_dirty_base_blocks_integration_before_source_worktrees_change(tmp_path: Path) -> None:
    """Productive use: user keeps uncommitted base work safe before accepting worktrees.
    Expected outcome: integration rejects dirty base without staging session files."""
    base = _repository(tmp_path)
    manager = SessionManager(base)
    service = GitWorktreeService(base)
    state = manager.create_session(RotarisConfig(workspace_root=base))
    state.worktree = service.create_for_session(state.session_id)
    state.execution_status = "completed"
    manager.flush_session(state)
    manager.release_lock(state.session_id)
    (base / "base.txt").write_text("dirty\n", encoding="utf-8")

    with pytest.raises(GitWorktreeError, match="Base worktree has uncommitted changes"):
        service.prepare_integration(manager, [state], "integration")

    assert _git(Path(state.worktree.path), "status", "--porcelain=v1") == ""
