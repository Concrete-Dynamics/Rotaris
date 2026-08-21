from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.git_commit import GitCommitAction, GitCommitExecutor

if TYPE_CHECKING:
    from pathlib import Path


def run(command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=True)


def init_repo(repo: Path) -> None:
    run(["git", "init"], repo)
    run(["git", "config", "user.name", "Test User"], repo)
    run(["git", "config", "user.email", "test@example.com"], repo)


@verifies(SWR.SWR_401, SWR.SWR_2115)
def test_commit_with_explicit_files_creates_commit(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    init_repo(repo)
    file_path = repo / "file.txt"
    file_path.write_text("hello\n")

    obs = GitCommitExecutor(repo)(GitCommitAction(message="initial commit", files=["file.txt"]))

    assert not obs.is_error
    assert obs.commit_sha is not None
    assert len(obs.commit_sha) == 40
    assert obs.files_staged == ["file.txt"]


@verifies(SWR.SWR_401)
def test_commit_without_files_stages_tracked_modified_files(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    init_repo(repo)
    file_path = repo / "tracked.txt"
    file_path.write_text("one\n")
    run(["git", "add", "tracked.txt"], repo)
    run(["git", "commit", "-m", "seed"], repo)
    file_path.write_text("two\n")

    obs = GitCommitExecutor(repo)(GitCommitAction(message="update tracked"))

    assert not obs.is_error
    assert obs.files_staged == ["tracked.txt"]


@verifies(SWR.SWR_401)
def test_no_git_repo_returns_error(tmp_path: Path) -> None:
    obs = GitCommitExecutor(tmp_path)(GitCommitAction(message="no repo"))

    assert obs.is_error
    assert obs.commit_sha is None


@verifies(SWR.SWR_401)
def test_no_changes_returns_error(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    init_repo(repo)
    file_path = repo / "tracked.txt"
    file_path.write_text("one\n")
    run(["git", "add", "tracked.txt"], repo)
    run(["git", "commit", "-m", "seed"], repo)

    obs = GitCommitExecutor(repo)(GitCommitAction(message="no changes"))

    assert obs.is_error
    assert obs.text.startswith("No changes to commit")


@verifies(SWR.SWR_401)
def test_path_escape_is_rejected(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    init_repo(repo)
    external = tmp_path / "outside.txt"
    external.write_text("bad\n")

    obs = GitCommitExecutor(repo)(GitCommitAction(message="bad", files=[str(external)]))

    assert obs.is_error
    assert "Path escapes workspace" in obs.text
