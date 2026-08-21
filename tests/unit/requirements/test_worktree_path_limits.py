"""Productive use: a Windows user keeps their checkout under a deep path and starts a
requirement run. Git refuses to write the new worktree because a file in it would exceed
260 characters, and the user needs to know that this is about where their workspace lives.
Expected outcome: Rotaris states the limit in its own words, names both fixes and the
workspace it is on, keeps Git's exact text as the detail underneath, changes nothing in the
user's Git configuration, and re-words nothing else Git refuses."""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

pytestmark = pytest.mark.unit

#: What Git prints on Windows when a path in the new worktree exceeds MAX_PATH.
TOO_LONG = (
    "error: unable to create file docs/requirements/3400-requirement-execution/"
    "SWR-3417-one-identity-per-delivery-cycle.md: Filename too long\n"
    "fatal: could not create work tree dir"
)


def scripted(
    workspace: Path,
    *,
    fails: str,
    reason: str,
    seen: list[tuple[str, ...]],
) -> Callable[..., subprocess.CompletedProcess[str]]:
    """A git that answers the preconditions and refuses the *fails* subcommand."""
    answers = {
        "rev-parse --show-toplevel": str(workspace),
        "symbolic-ref --quiet --short HEAD": "main",
        "rev-parse HEAD": "0123456789abcdef",
    }

    def run(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
        seen.append(args)
        if args[0] == fails:
            return subprocess.CompletedProcess(args=list(args), returncode=128, stderr=reason)
        if args[0] == "show-ref":
            # No such branch. A fake that answered "it exists" would make the
            # collision loop skip every candidate and never reach the failure.
            return subprocess.CompletedProcess(args=list(args), returncode=1)
        return subprocess.CompletedProcess(
            args=list(args),
            returncode=0,
            stdout=answers.get(" ".join(args), ""),
        )

    return run


def service(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    reason: str,
    fails: str = "worktree",
) -> tuple[GitWorktreeService, list[tuple[str, ...]]]:
    built = GitWorktreeService(tmp_path)
    seen: list[tuple[str, ...]] = []
    monkeypatch.setattr(
        GitWorktreeService,
        "_git_result",
        staticmethod(scripted(built.base_workspace, fails=fails, reason=reason, seen=seen)),
    )
    return built, seen


@verifies(SWR.SWR_3418)
def test_a_path_that_windows_refuses_is_explained_by_rotaris_not_by_git(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The headline is Rotaris'; Git's own text follows as the detail."""
    built, _ = service(tmp_path, monkeypatch, reason=TOO_LONG)

    with pytest.raises(GitWorktreeError) as refused:
        built.create_for_session("session-1")

    stated = str(refused.value)
    assert stated.startswith("This worktree could not be created")
    assert "longer than Windows allows (260 characters)" in stated
    # Both remedies, named — a message with one of them is a message that blames
    # the user's workspace for a setting they could have flipped instead.
    assert "git config --global core.longpaths true" in stated
    assert str(built.base_workspace) in stated
    assert "Rotaris does not change your Git configuration for you." in stated
    # Git's exact words survive, underneath.
    assert "Filename too long" in stated
    assert TOO_LONG in stated


@verifies(SWR.SWR_3418)
def test_rotaris_never_writes_the_setting_it_recommends(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Recommending a configuration change is not permission to make one."""
    built, seen = service(tmp_path, monkeypatch, reason=TOO_LONG)

    with pytest.raises(GitWorktreeError):
        built.create_for_session("session-1")

    assert not any("config" in args for args in seen), (
        "a tool that quietly rewrote a global Git setting would be changing an "
        "environment it was only asked to work in"
    )
    assert not any("longpaths" in " ".join(args) for args in seen)


@verifies(SWR.SWR_3418)
def test_every_other_git_refusal_is_still_reported_word_for_word(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only the path-limit case is translated; a loose match would bury real errors."""
    other = "fatal: 'rotaris/session/session-1' is already checked out at '/somewhere'"
    built, _ = service(tmp_path, monkeypatch, reason=other)

    with pytest.raises(GitWorktreeError) as refused:
        built.create_for_session("session-1")

    assert str(refused.value) == other
    assert "Rotaris does not change" not in str(refused.value)


@verifies(SWR.SWR_3418, SWR.SWR_2415)
def test_a_path_limit_failure_stops_at_once_instead_of_burning_the_retry_budget(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The collision retry is for collisions. A refused path is not one, and never was."""
    built, seen = service(tmp_path, monkeypatch, reason=TOO_LONG)

    with pytest.raises(GitWorktreeError) as refused:
        built.create_for_session_unique("session-1")

    assert "longer than Windows allows" in str(refused.value)
    assert sum(1 for args in seen if args[0] == "worktree") == 1, (
        "one attempt: the branch was free, so nothing about this failure looks "
        "like a collision to retry under another name"
    )
    assert "after 50 attempts" not in str(refused.value)
