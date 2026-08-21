"""The branch requirement work is based on and lands on (SWR-3419).

Every case here asks the same question the requirement asks: does *one*
declaration decide where units fork from, where an integration promotes, and
what a verification says it counted on — including when the checkout is standing
somewhere else entirely, which is the situation that produced no error at all
before this existed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.execution.target import (
    TargetBranch,
    TargetBranchError,
    no_commit_refusal,
    resolve_target_branch,
    target_branch_for,
)
from rotaris_core.requirements.execution.worktrees import GitCommand

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

HEAD = "a" * 40
DEV = "b" * 40


class FakeGit:
    """A git port that knows which branches exist and where each one stands.

    *unborn* is the first day of a project: ``git init`` has run, so the checkout
    answers with a branch name, and nothing has been committed to it, so ``HEAD``
    resolves to nothing. Real git behaves exactly this way, which is why the two
    answers have to be scripted separately.
    """

    def __init__(
        self,
        *,
        checkout: str = "main",
        heads: dict[str, str] | None = None,
        unborn: bool = False,
    ) -> None:
        self.checkout = checkout
        self.heads = dict(heads or {"main": HEAD})
        self.unborn = unborn
        self.calls: list[tuple[str, ...]] = []

    def run(self, cwd: Path, *args: str) -> GitCommand:  # noqa: ARG002 - the port's shape
        self.calls.append(args)
        if args == ("branch", "--show-current"):
            return _ok(args, self.checkout)
        if args == ("rev-parse", "HEAD"):
            if self.unborn:
                return GitCommand(
                    args=args,
                    returncode=128,
                    stderr="ambiguous argument 'HEAD': unknown revision",
                )
            return _ok(args, self.heads.get(self.checkout, ""))
        if len(args) == 3 and args[:2] == ("rev-parse", "--verify"):
            branch = args[2].removeprefix("refs/heads/")
            if branch in self.heads:
                return _ok(args, self.heads[branch])
            return GitCommand(args=args, returncode=128, stderr=f"unknown revision {branch}")
        return _ok(args, "")


class NotACheckout:
    """A git port for a directory git refuses to answer about."""

    def run(self, cwd: Path, *args: str) -> GitCommand:  # noqa: ARG002 - the port's shape
        return GitCommand(args=args, returncode=128, stderr="not a git repository")


def _ok(args: tuple[str, ...], stdout: str) -> GitCommand:
    return GitCommand(args=args, returncode=0, stdout=stdout)


@verifies(SWR.SWR_3419)
def test_a_workspace_that_declares_nothing_targets_the_branch_it_is_on(tmp_path: Path) -> None:
    """Productive use: a team on its default branch runs a requirement and nothing changes.
    Expected outcome: the target is the checkout's own branch, exactly as before the setting existed."""
    target = resolve_target_branch(tmp_path, declared="", git=FakeGit())

    assert target.branch == "main"
    assert target.revision == HEAD
    assert target.declared is False
    assert target.elsewhere is False
    assert target.notice == ""


@verifies(SWR.SWR_3419)
def test_a_declared_target_is_used_while_the_checkout_stands_elsewhere(tmp_path: Path) -> None:
    """Productive use: a team stabilising on `dev` runs a requirement from a feature checkout.
    Expected outcome: the work is based on `dev`, and the run says so instead of working silently against the wrong branch."""
    git = FakeGit(checkout="feature/x", heads={"main": HEAD, "dev": DEV, "feature/x": "c" * 40})

    target = resolve_target_branch(tmp_path, declared="dev", git=git)

    assert target.branch == "dev"
    assert target.revision == DEV
    assert target.declared is True
    assert target.checkout_branch == "feature/x"
    assert target.elsewhere is True
    assert "dev" in target.notice
    assert "feature/x" in target.notice


@verifies(SWR.SWR_3419)
def test_a_declared_branch_the_workspace_does_not_have_is_refused_by_name(tmp_path: Path) -> None:
    """Productive use: someone mistypes the target branch in agents.yaml.
    Expected outcome: the branch is named and refused at resolution, so no worktree is ever created for a run that could not land."""
    git = FakeGit(checkout="main", heads={"main": HEAD})

    with pytest.raises(TargetBranchError) as refusal:
        resolve_target_branch(tmp_path, declared="realease/2.1", git=git)

    assert "realease/2.1" in str(refusal.value)
    assert "target_branch" in str(refusal.value)
    # Named configuration, so a release refuses on it rather than starting.
    assert refusal.value.declared is True
    assert refusal.value.no_commit is False
    # Resolution asked git and stopped; it never went on to create anything.
    assert all(call[0] in {"branch", "rev-parse"} for call in git.calls)


@verifies(SWR.SWR_3419)
def test_a_directory_that_is_not_a_checkout_is_refused(tmp_path: Path) -> None:
    """Productive use: a workspace is opened somewhere that is not a git repository.
    Expected outcome: a stated refusal that does *not* claim to be about the setting —
    a non-checkout is the isolation provider's failure to report, in its own words."""
    with pytest.raises(TargetBranchError) as refusal:
        resolve_target_branch(tmp_path, declared="", git=NotACheckout())

    assert "not a git checkout" in str(refusal.value)
    assert refusal.value.declared is False
    assert refusal.value.no_commit is False


@verifies(SWR.SWR_3419)
def test_a_checkout_with_no_commit_is_told_apart_from_a_directory_that_is_not_one(
    tmp_path: Path,
) -> None:
    """Productive use: a project is opened on the day it was created, before its first commit.
    Expected outcome: the refusal says the workspace has no commit, and it is distinguishable
    from the directory that is no checkout at all — the two need different answers, because
    a release stops on the first and a composition may still supply its own isolation for
    the second."""
    with pytest.raises(TargetBranchError) as unborn:
        resolve_target_branch(tmp_path, declared="", git=FakeGit(unborn=True))
    with pytest.raises(TargetBranchError) as no_checkout:
        resolve_target_branch(tmp_path, declared="", git=NotACheckout())

    assert unborn.value.no_commit is True
    assert unborn.value.declared is False
    assert "has no commit to base requirement work on" in str(unborn.value)
    # Neither flag, and its own sentence: the two failures are never confusable.
    assert no_checkout.value.no_commit is False
    assert str(unborn.value) != str(no_checkout.value)


@verifies(SWR.SWR_3419, SWR.SWR_3602)
def test_the_missing_initial_commit_is_one_sentence_every_surface_says(tmp_path: Path) -> None:
    """Productive use: the same person meets the same missing first commit twice — once by
    dropping a card on the board, once by running the headless command — and, later, on a
    board that noticed it before they touched anything.
    Expected outcome: one sentence, written once, that names the project by the folder its
    owner calls it, states the fact and asks for the initial commit. It carries no Rotaris
    requirement id into somebody else's project, and it drops the "release it again" clause
    when there is no requirement to name, because a pre-flight notice has not been asked
    about one yet."""
    project = tmp_path / "punchclock"

    said = no_commit_refusal(project, "SWR-FR-ADM-001")

    assert said == (
        "punchclock has no commits yet, so a run has nothing to branch from."
        " Make an initial commit, then release SWR-FR-ADM-001 again."
    )
    assert said.count("SWR-FR-ADM-001") == 1
    assert "SWR-3419" not in said
    assert "snapshot" not in said.lower()

    # Nothing to name yet: still the fact and still the fix.
    ahead_of_any_card = no_commit_refusal(project)
    assert ahead_of_any_card.startswith("punchclock has no commits yet")
    assert "Make an initial commit" in ahead_of_any_card
    assert "SWR" not in ahead_of_any_card

    # A workspace already named as a string is said the same way.
    assert no_commit_refusal("punchclock") == ahead_of_any_card


@verifies(SWR.SWR_3419, SWR.SWR_3602)
def test_the_headless_refusals_no_longer_fold_the_two_git_failures_together() -> None:
    """Productive use: the headless command is pointed at a directory that is not a
    repository, and at a project that has never committed.
    Expected outcome: two answers. The not-a-checkout sentence stopped claiming to be
    about a missing commit — it never had a remedy for one — and the commit-less project
    gets the same words the desktop refuses a drop with."""
    from rotaris_core.requirements.execution.cli_host import NOT_A_CHECKOUT

    assert NOT_A_CHECKOUT == "is not a Git checkout, so a run has no base to start from"
    assert "commit" not in NOT_A_CHECKOUT, "this sentence answers for the missing repository only"
    assert NOT_A_CHECKOUT not in no_commit_refusal("punchclock", "SWR-4006")


@verifies(SWR.SWR_3419, SWR.SWR_3117)
def test_an_unreadable_configuration_falls_back_to_the_checkout(tmp_path: Path) -> None:
    """Productive use: a project's agents.yaml is broken while a run is started.
    Expected outcome: the checkout's branch, never a guessed one — a broken config must not redirect where work lands."""

    class Exploding:
        @property
        def requirements(self) -> object:
            raise RuntimeError("unreadable")

    target = target_branch_for(tmp_path, config=Exploding(), git=FakeGit())  # type: ignore[arg-type]

    assert target.branch == "main"
    assert target.declared is False


@verifies(SWR.SWR_3419)
def test_a_detached_checkout_that_declares_nothing_states_no_branch(tmp_path: Path) -> None:
    """Productive use: a run is started from a detached HEAD.
    Expected outcome: the run still has a commit to work from, and nothing records a branch name it made up."""
    git = FakeGit(checkout="", heads={"": HEAD})

    target = resolve_target_branch(tmp_path, declared="", git=git)

    assert target.stated is False
    assert target.branch == ""
    assert target.revision == HEAD
    assert target.address.startswith("HEAD@")


@verifies(SWR.SWR_3419)
def test_the_fingerprint_is_the_value_integration_compares_against() -> None:
    """Productive use: an integration checks the target did not move while units ran.
    Expected outcome: the target hands over exactly the fingerprint that comparison uses."""
    target = TargetBranch(branch="dev", revision=DEV, declared=True, checkout_branch="main")

    assert target.fingerprint().branch == "dev"
    assert target.fingerprint().revision == DEV
    assert target.address == f"dev@{DEV[:12]}"
