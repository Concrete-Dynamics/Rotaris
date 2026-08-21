from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService


def _git(cwd: Path, *args: str) -> None:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, encoding="utf-8", capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr


@verifies(SWR.SWR_2413)
def test_parallel_completed_sessions_are_locked_until_atomic_base_promotion(tmp_path: Path) -> None:
    """Productive use: user accepts several completed parallel sessions safely.
    Expected outcome: one integration reserves selected sessions and promotes all changes together."""
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Test User")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    (tmp_path / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (tmp_path / "base.txt").write_text("base\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    manager = SessionManager(tmp_path)
    service = GitWorktreeService(tmp_path)
    sessions = []
    for branch, filename in (("a", "a.txt"), ("b", "b.txt")):
        state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
        state.worktree = service.create_for_session(state.session_id, f"rotaris/session/{branch}")
        state.execution_status = "completed"
        (Path(state.worktree.path) / filename).write_text(branch, encoding="utf-8")
        manager.flush_session(state)
        manager.release_lock(state.session_id)
        sessions.append(state)

    internal = manager.create_session(RotarisConfig(workspace_root=tmp_path), internal=True)
    plan = service.prepare_integration(manager, sessions, internal.session_id)

    with pytest.raises(GitWorktreeError, match="already running"):
        service.prepare_integration(manager, [sessions[0]], "second-integration")

    for branch in plan.source_branches:
        _git(plan.integration_path, "merge", "--no-ff", branch, "-m", f"merge {branch}")
    service.finalize_integration(manager, plan)

    assert (tmp_path / "a.txt").exists()
    assert (tmp_path / "b.txt").exists()
    assert manager.list_sessions() and all(
        not item.get("internal") for item in manager.list_sessions()
    )
