"""Productive use: a user starts several isolated sessions in one repository.
Expected outcome: every session gets its own worktree even when the requested
branch name is already taken, and unrelated Git failures still surface."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService


def _git(cwd: Path, *args: str) -> None:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, encoding="utf-8", capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr


@pytest.fixture
def repository(tmp_path: Path) -> Path:
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Test User")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    (tmp_path / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (tmp_path / "base.txt").write_text("base\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    return tmp_path


@verifies(SWR.SWR_2415, SWR.SWR_2434)
def test_colliding_branch_names_resolve_to_deterministic_alternatives(repository: Path) -> None:
    service = GitWorktreeService(repository)

    first = service.create_for_session_unique("session-one", "feature/parallel")
    second = service.create_for_session_unique("session-two", "feature/parallel")
    third = service.create_for_session_unique("session-three", "feature/parallel")

    assert first.branch == "feature/parallel"
    assert second.branch == "feature/parallel-2"
    assert third.branch == "feature/parallel-3"
    assert len({first.path, second.path, third.path}) == 3
    for worktree in (first, second, third):
        assert Path(worktree.path).is_dir()


@verifies(SWR.SWR_2415)
def test_default_session_branches_never_collide_between_parallel_runs(repository: Path) -> None:
    service = GitWorktreeService(repository)
    _git(repository, "branch", "rotaris/session/session-one")

    worktree = service.create_for_session_unique("session-one")

    assert worktree.branch == "rotaris/session/session-one-2"
    assert Path(worktree.path).is_dir()


@verifies(SWR.SWR_2434)
def test_unrelated_git_failures_are_not_retried_under_another_branch(repository: Path) -> None:
    service = GitWorktreeService(repository)

    with pytest.raises(GitWorktreeError):
        service.create_for_session_unique("session-one", "invalid branch name")

    service.create_for_session_unique("session-one", "feature/one")
    # The path belongs to the session, not to the branch: a second worktree for
    # the same session must fail instead of silently allocating a new branch.
    with pytest.raises(GitWorktreeError, match="path already exists"):
        service.create_for_session_unique("session-one", "feature/two")
