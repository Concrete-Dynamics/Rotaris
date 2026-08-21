"""Which branch requirement work forks from, and lands on (SWR-3419).

Until this module existed the answer was implicit and different in three places.
A unit worktree was cut from ``HEAD`` of whatever the checkout happened to have
out (``session/worktrees.py::create_for_session``), an integration promoted onto
the fingerprint someone passed it, and a verification recorded
``GitWorktreeInspector.branch(workspace)`` as the branch it counted on
(``verification_host.py::verification_target``). Three readings of the same
question, all correct for a team that works on its default branch and all
quietly wrong for one that does not — a team on ``dev``, or on a release branch
during a stabilisation window, gets no error at all. Units fork from the wrong
base, an integration fast-forwards onto the wrong branch, and the verification
that decides a requirement's evidence is measured against a tree nobody ships.

So the branch becomes **one value, resolved once, at the point work starts**.

Two properties are the requirement rather than implementation detail:

- **A workspace that declares nothing behaves exactly as it did.** The checkout's
  current branch is the default, so the whole existing test corpus and every
  project that never opens the setting sees no change. That is what makes this
  safe to thread through four call sites at once.
- **A declared branch a workspace does not have is refused before any worktree is
  created.** The alternative is a failure at promotion time, after an agent run
  has been paid for — and the message then names git rather than the setting
  that was wrong. :class:`TargetBranchError` is raised from resolution, which
  every caller does before it provisions anything.

What this module deliberately does *not* do is decide what a caller says about
:attr:`TargetBranch.elsewhere`. Standing on a different branch than the target is
legitimate — it is the normal case for a supervisor watching a run — so it is
reported (:attr:`TargetBranch.notice`) and never refused. Only a branch that does
not exist is an error, because that one cannot be worked around by carrying on.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePath
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.execution.worktrees import BaseFingerprint, Git

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.execution.worktrees import GitPort

__all__ = [
    "TargetBranch",
    "TargetBranchError",
    "no_commit_refusal",
    "resolve_target_branch",
    "target_branch_for",
]


class TargetBranchError(RuntimeError):
    """The target branch cannot be resolved — said before any worktree exists.

    Three different failures arrive as this one exception, and the two flags say
    which one it is, because the answer decides who refuses and in whose words.

    :attr:`declared` is SWR-3419's fourth criterion: configuration named the
    branch, the workspace does not have it, and the release stops before it
    spends anything.

    :attr:`no_commit` is a checkout that exists and has never committed — the
    ordinary state of a project on its first day. It carried no flag of its own
    until this attribute existed, which made it indistinguishable from the third
    case below and let a release start against no base at all; the run then died
    several stages later, at the snapshot, in the snapshot's words. A caller that
    can refuse before anything moves now has the fact it needs to.

    Neither flag set is that third case: a directory that is not a checkout at
    all. It is a different failure with an older home — the isolation provider,
    whose message is about worktrees — and stopping a release on it here would
    refuse every composition that supplies its own isolation.
    """

    def __init__(
        self,
        message: str,
        *,
        declared: bool = False,
        no_commit: bool = False,
    ) -> None:
        super().__init__(message)
        #: Whether configuration named the branch that could not be resolved.
        self.declared = declared
        #: Whether this is a checkout with no commit to base requirement work on.
        self.no_commit = no_commit


@traces(SWR.SWR_3419)
def no_commit_refusal(workspace: str | Path, req_id: str = "") -> str:
    """The one sentence a person reads when their project has never committed.

    Written once, here, because three surfaces have to say it: the desktop
    refuses a card dropped on Ready with it, the headless command refuses a run
    with it, and a board that notices the condition before any card moves says it
    again as a notice. Three copies would agree on the day they were written and
    drift on the first edit, which is a shape this repository has already paid
    for. It lives beside :class:`TargetBranchError` because that exception's
    :attr:`~TargetBranchError.no_commit` flag is what detects the condition, and
    both hosts already import from this module.

    Names the fact and the fix, never the machinery that noticed. What a snapshot
    is, and why it wants a base commit, is Rotaris' business; the person reading
    this is working on their own project, where the whole of the problem is that
    ``git init`` has not yet been followed by a commit.

    *workspace* is named the way its owner names it — the folder, not the
    absolute path, which is the project's name in every other sentence they read.
    *req_id* is optional because the condition is knowable before any requirement
    has been chosen: a pre-flight notice has nothing to name, and then the
    sentence asks for the commit without pretending to know what comes next.
    """
    name = str(workspace)
    if isinstance(workspace, PurePath):
        name = workspace.name or str(workspace)
    ask = f"release {req_id} again" if req_id else "release a requirement"
    return (
        f"{name} has no commits yet, so a run has nothing to branch from."
        f" Make an initial commit, then {ask}."
    )


@traces(SWR.SWR_3419)
@dataclass(frozen=True, slots=True)
class TargetBranch:
    """The branch requirement work is based on and lands on, and where it stands.

    Carries the checkout's own branch beside it rather than only the answer,
    because the difference between the two is the thing a user has to be told
    (SWR-3419's third criterion) and reconstructing it later would mean asking
    git a second time about a moment that has passed.
    """

    #: The branch work forks from and promotes to. Empty only for a detached
    #: checkout that declared nothing — see :meth:`stated`.
    branch: str
    #: The commit that branch stands at, read at resolution time.
    revision: str
    #: Whether configuration named this branch, as opposed to it being inferred.
    declared: bool = False
    #: The branch the checkout actually has out. Empty on a detached HEAD.
    checkout_branch: str = ""

    @property
    def stated(self) -> bool:
        """Whether this target can name a branch at all.

        ``False`` for a detached checkout that declared nothing. That is not an
        error — a run there still works, cut from the commit it found — but
        nothing may record a branch name for it, which is the same answer
        ``verification_target`` has always given by returning ``None``.
        """
        return bool(self.branch)

    @property
    def address(self) -> str:
        """``dev@c0ffee12`` — one line for a message."""
        return f"{self.branch or 'HEAD'}@{self.revision[:12]}"

    @property
    def elsewhere(self) -> bool:
        """Whether the checkout stands on a different branch than the target."""
        return self.stated and bool(self.checkout_branch) and self.checkout_branch != self.branch

    @property
    def notice(self) -> str:
        """What a run says before it starts, or ``""`` when there is nothing to say."""
        if not self.elsewhere:
            return ""
        return (
            f"requirement work is based on and lands on {self.branch}, "
            f"while this checkout is on {self.checkout_branch}"
        )

    def fingerprint(self) -> BaseFingerprint:
        """This target as the value integration compares the base against."""
        return BaseFingerprint(branch=self.branch, revision=self.revision)


@traces(SWR.SWR_3419)
def resolve_target_branch(
    workspace: Path,
    *,
    declared: str = "",
    git: GitPort | None = None,
) -> TargetBranch:
    """Where *workspace*'s requirement work belongs, resolved once.

    *declared* is the configured branch, empty when the workspace configured
    none. An empty declaration is not the same as a missing one: it means "use
    the checkout", which is the documented default and the behaviour every
    project had before this existed.
    """
    port = git if git is not None else Git()
    current = port.run(workspace, "branch", "--show-current")
    if not current.ok:
        raise TargetBranchError(
            f"{workspace} is not a git checkout, so requirement work has no branch"
            f" to be based on — {current.message}",
            declared=bool(declared.strip()),
        )
    checkout_branch = current.text
    wanted = declared.strip()
    if not wanted:
        head = port.run(workspace, "rev-parse", "HEAD")
        if not head.ok:
            raise TargetBranchError(
                f"{workspace} has no commit to base requirement work on — {head.message}",
                no_commit=True,
            )

        return TargetBranch(
            branch=checkout_branch,
            revision=head.text,
            declared=False,
            checkout_branch=checkout_branch,
        )
    resolved = port.run(workspace, "rev-parse", "--verify", f"refs/heads/{wanted}")
    if not resolved.ok:
        raise TargetBranchError(
            f"the configured target branch {wanted!r} does not exist in {workspace};"
            " requirement work is based on and lands on it, so nothing was created"
            " (requirements.execution.target_branch, SWR-3419)",
            declared=True,
        )
    return TargetBranch(
        branch=wanted,
        revision=resolved.text,
        declared=True,
        checkout_branch=checkout_branch,
    )


@traces(SWR.SWR_3419, SWR.SWR_3117)
def target_branch_for(
    workspace: Path,
    *,
    config: RotarisConfig | None = None,
    git: GitPort | None = None,
) -> TargetBranch:
    """*workspace*'s target branch, read from its own configuration.

    The one place ``requirements.execution.target_branch`` is consulted. A
    configuration that cannot be read is not a reason to guess a branch: it
    degrades to the checkout, which is what an unconfigured workspace gets
    anyway, so a broken ``agents.yaml`` never silently redirects where work
    lands.
    """
    declared = ""
    try:
        loaded = config if config is not None else _config_for(workspace)
        declared = loaded.requirements.execution.target_branch or ""
    except Exception:  # noqa: BLE001 - an unreadable config means "use the checkout"
        declared = ""
    return resolve_target_branch(workspace, declared=declared, git=git)


def _config_for(workspace: Path) -> RotarisConfig:
    from rotaris_core.config.loader import load_config

    return load_config(workspace)
