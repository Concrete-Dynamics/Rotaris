"""Integration of several units' branches, before anything reaches the base (SWR-3409).

Several units of one requirement produce several branches. Merging them into the
base one at a time makes the base the place where their conflicts are discovered,
which is the one place a user cannot afford breakage. So the merge happens
somewhere else:

```text
unit branches ─┐
               ├─▶ integration worktree ─▶ merge ─▶ verify ─▶ ff-only ─▶ base
               ┘         (its own tree)      │        │
                                             │        └── not passed ─▶ base untouched
                                             └── conflict ─▶ abort, name the units,
                                                             keep every unit branch
```

Four properties are load-bearing:

- **The base is the last step, never the first.** :meth:`RequirementIntegrator.
  integrate` fingerprints the base before it starts and refuses to promote if it
  moved; every failure path returns *before* the ``--ff-only`` merge, so a
  conflict or a red suite leaves the user's checkout exactly where it was.
- **A conflict names names.** :attr:`IntegrationOutcome.conflicting_units` and
  :attr:`IntegrationOutcome.conflicting_files` carry the units and the paths that
  collided — the unit whose merge failed *and* the already-merged units that
  touched the same files. "Two units conflicted" is not something a user can act
  on (SWR-3409).
- **One unit is not an integration.** A requirement with a single completed unit
  gets :attr:`IntegrationOutcome.skipped`, no worktree and no merge — running an
  empty integration would produce an integration record that means nothing and a
  branch nobody asked for.
- **The tree comes from the existing service.** The integration worktree is
  created through
  :class:`~rotaris_core.requirements.execution.run_seam.GitIsolation`, which
  wraps :class:`~rotaris_core.session.worktrees.GitWorktreeService`. Its
  namespace is ``rotaris/req/<req>/integration/<id>`` under
  ``.rotaris/requirements/integrations/`` — a requirement integration can never
  take a session integration's branch or directory.

Verification is the same one units get (SWR-3410): a
:data:`~rotaris_core.requirements.execution.verification.WorkspaceChecks`
callable over the integration tree. A suite that did not run is not a pass, so an
unverified integration does not reach the base either.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from pathlib import Path
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.evidence import IntegrationRecord
from rotaris_core.requirements.delivery.projection import IntegrationView
from rotaris_core.requirements.execution.run_seam import (
    REQUIREMENT_BRANCH_PREFIX,
    GitIsolation,
    IsolationError,
    IsolationRequest,
)
from rotaris_core.requirements.execution.units import slug_token
from rotaris_core.requirements.execution.verification import SuiteRun
from rotaris_core.requirements.execution.worktrees import (
    BaseFingerprint,
    Git,
    WorktreeError,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from rotaris_core.requirements.execution.run_seam import IsolationProvider
    from rotaris_core.requirements.execution.verification import WorkspaceChecks
    from rotaris_core.requirements.execution.worktrees import GitCommand, GitPort

__all__ = [
    "DEFAULT_INTEGRATION_BRANCH_TEMPLATE",
    "INTEGRATION_WORKTREE_SUBPATH",
    "IntegrationError",
    "IntegrationOutcome",
    "RequirementIntegrationPlan",
    "RequirementIntegrator",
    "SINGLE_UNIT_LANDED_REASON",
    "SINGLE_UNIT_SKIP_REASON",
    "UNVERIFIED_SKIP_REASON",
    "UnitBranch",
    "integration_branch_for",
    "plan_integration",
]

#: Where integration branches live. A child of the requirement namespace, so a
#: ``git branch --list 'rotaris/req/*'`` still lists the whole slice's work while
#: nothing here can collide with ``rotaris/integration/`` (sessions', SWR-2413).
DEFAULT_INTEGRATION_BRANCH_TEMPLATE = f"{REQUIREMENT_BRANCH_PREFIX}/{{req}}/integration/{{id}}"

#: Where requirement integration worktrees live, relative to ``.rotaris/``.
INTEGRATION_WORKTREE_SUBPATH = "requirements/integrations"

#: Why a single-unit requirement produces no integration. Stated once, so the
#: record, the board and the log cannot phrase it three ways.
SINGLE_UNIT_SKIP_REASON = "a single completed unit needs no integration"

#: Said when a lone unit is not promoted because nothing verified it. "Nobody
#: checked" and "everything holds" are different answers and only one of them
#: earns a landing (SWR-3420, SWR-3410).
UNVERIFIED_SKIP_REASON = (
    "a single completed unit needs no integration, and was not promoted because nothing verified it"
)

#: Said when a lone verified unit did land, so a skipped integration and a
#: skipped *landing* are never read as the same event.
SINGLE_UNIT_LANDED_REASON = (
    "a single completed unit needs no integration; its verified branch was promoted"
)

#: Identity the merge commits are authored with. The same one the session layer
#: uses for its own machine-made commits, so a repository without a configured
#: user can still be integrated.
_ROTARIS_IDENTITY: tuple[str, ...] = (
    "-c",
    "user.name=rotaris",
    "-c",
    "user.email=rotaris@local",
)


class IntegrationError(RuntimeError):
    """An integration could not be planned or carried out coherently."""


@traces(SWR.SWR_3409)
class UnitBranch(BaseModel):
    """One completed unit's branch, as the integration reads it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    unit_id: str
    branch: str
    run_id: str = ""
    #: What this unit changed, when the caller already knows. Empty means "ask
    #: git" — the integrator derives it from the branch against the base, which
    #: is what makes a conflict report name the *other* unit too.
    changed_files: tuple[str, ...] = ()
    #: Whether this unit's own run verified in its own worktree (SWR-3410).
    #: Only read on the single-unit path, where there is no integration tree to
    #: verify and the unit's own verdict is the only one there will ever be
    #: (SWR-3420). A multi-unit integration verifies the merged tree instead,
    #: because that tree is the thing nobody has run a suite over yet.
    verified: bool = False

    @field_validator("unit_id", "branch")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise IntegrationError("an integrated unit names itself and its branch (SWR-3409)")
        return cleaned


@traces(SWR.SWR_3409)
def integration_branch_for(
    req_id: str,
    integration_id: str,
    *,
    template: str = DEFAULT_INTEGRATION_BRANCH_TEMPLATE,
) -> str:
    """The branch an integration of *req_id* works on."""
    requirement = slug_token(req_id, limit=0)
    identifier = slug_token(integration_id, limit=0)
    if not requirement or not identifier:
        raise IntegrationError(
            f"cannot derive an integration branch for {req_id!r} / {integration_id!r}",
        )
    candidate = template.format(req=requirement, id=identifier)
    from rotaris_core.session.worktrees import GitWorktreeError, GitWorktreeService

    try:
        return GitWorktreeService.sanitize_branch(candidate)
    except GitWorktreeError as exc:
        raise IntegrationError(str(exc)) from exc


@traces(SWR.SWR_3409)
class RequirementIntegrationPlan(BaseModel):
    """Which unit branches are to be merged, where, and onto what.

    A value the caller can write down and compare before anything runs: the
    single-unit skip is decidable from it alone (:attr:`needed`), so a caller
    never has to start an integration to find out it should not have.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    integration_id: str
    req_id: str
    #: The branch the result is meant to land on, and the commit it stood at when
    #: the plan was made. Both are re-checked before promotion (SWR-3409).
    base_branch: str
    base_revision: str
    integration_branch: str
    units: tuple[UnitBranch, ...] = ()

    @model_validator(mode="after")
    def _coherent(self) -> Self:
        seen_units: set[str] = set()
        seen_branches: set[str] = set()
        for unit in self.units:
            if unit.unit_id in seen_units:
                raise IntegrationError(
                    f"{self.req_id}: unit {unit.unit_id} is listed twice for integration",
                )
            if unit.branch in seen_branches:
                raise IntegrationError(
                    f"{self.req_id}: branch {unit.branch!r} is listed twice for integration",
                )
            if unit.branch == self.integration_branch:
                raise IntegrationError(
                    f"{self.req_id}: unit {unit.unit_id} is on the integration branch itself",
                )
            seen_units.add(unit.unit_id)
            seen_branches.add(unit.branch)
        return self

    @property
    def unit_ids(self) -> tuple[str, ...]:
        """The units this plan covers, in merge order."""
        return tuple(unit.unit_id for unit in self.units)

    @property
    def branches(self) -> tuple[str, ...]:
        """The branches this plan merges, in merge order."""
        return tuple(unit.branch for unit in self.units)

    @property
    def needed(self) -> bool:
        """Whether there is anything to integrate at all (SWR-3409)."""
        return len(self.units) > 1

    @property
    def skip_reason(self) -> str:
        """Why this plan is a no-op, or empty when it is not."""
        if len(self.units) == 1:
            return SINGLE_UNIT_SKIP_REASON
        if not self.units:
            return "no completed unit to integrate"
        return ""

    @property
    def base(self) -> BaseFingerprint:
        """Where the base stood when this plan was made."""
        return BaseFingerprint(branch=self.base_branch, revision=self.base_revision)

    def unit_for(self, branch: str) -> UnitBranch | None:
        """The unit that owns *branch*, when this plan holds one."""
        return next((unit for unit in self.units if unit.branch == branch), None)


@traces(SWR.SWR_3409)
def plan_integration(
    req_id: str,
    units: Sequence[UnitBranch],
    *,
    integration_id: str,
    base_branch: str,
    base_revision: str,
    template: str = DEFAULT_INTEGRATION_BRANCH_TEMPLATE,
) -> RequirementIntegrationPlan:
    """The integration *units* ask for — including the one that does nothing.

    A single-unit requirement produces a plan whose :attr:`~
    RequirementIntegrationPlan.needed` is ``False`` rather than an exception:
    "there is nothing to integrate" is a normal outcome of a normal requirement,
    and forcing the caller to branch on the unit count *before* planning is how
    the two code paths drift apart (SWR-3409).
    """
    if not base_revision.strip():
        raise IntegrationError(
            f"{req_id}: an integration names the commit the base stood at;"
            " without it a promotion cannot know the base did not move",
        )
    return RequirementIntegrationPlan(
        integration_id=integration_id,
        req_id=req_id,
        base_branch=base_branch,
        base_revision=base_revision,
        integration_branch=integration_branch_for(req_id, integration_id, template=template),
        units=tuple(units),
    )


@traces(SWR.SWR_3409)
class IntegrationOutcome(BaseModel):
    """What an integration did — and, when it failed, what collided.

    ``merged``, ``verified`` and ``promoted`` are three separate facts on
    purpose. An integration that merged cleanly but failed its suite is not the
    same event as one that conflicted, and neither is the same as one that landed
    — folding them into a single boolean is what makes a board unable to tell a
    user what to do next.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    integration_id: str
    req_id: str
    unit_ids: tuple[str, ...] = ()
    branch: str | None = None
    worktree_path: str | None = None
    merged_commit: str | None = None
    #: Every unit branch merged without a conflict.
    merged: bool = False
    #: The integration tree's own verification (SWR-3410). ``None`` when nothing
    #: verified it — which is not a pass and therefore does not promote.
    verified: bool | None = None
    verification_detail: str = ""
    checks: tuple[str, ...] = ()
    #: The base actually advanced to the integrated result.
    promoted: bool = False
    #: True when there was nothing to integrate (SWR-3409's third criterion).
    skipped: bool = False
    skip_reason: str = ""
    conflicting_units: tuple[str, ...] = ()
    conflicting_files: tuple[str, ...] = ()
    failure_reason: str = ""
    #: Where the base stood before and after. Equal on every failure path.
    base_before: str = ""
    base_after: str = ""
    finished_at: dt.datetime | None = None

    @model_validator(mode="after")
    def _a_failure_states_why(self) -> Self:
        if not self.succeeded and not self.failure_reason.strip():
            raise IntegrationError(
                f"{self.integration_id}: an integration that did not land names why (SWR-3409)",
            )
        if self.conflicting_units and self.promoted:
            raise IntegrationError(
                f"{self.integration_id}: a conflicting integration never reaches the base",
            )
        return self

    @property
    def succeeded(self) -> bool:
        """Whether the requirement's work is where it was meant to end up."""
        if self.skipped:
            return True
        return self.merged and self.verified is True and self.promoted

    @property
    def worth_showing(self) -> bool:
        """Whether anything happened here that a board should put on a card.

        A skipped integration that promoted nothing is a genuine no-op and the
        card is better without it. A skipped integration that *did* promote is
        the requirement's landing (SWR-3420) — the board filtered on ``skipped``
        alone before single units could land, and that same filter would have
        hidden every one-unit requirement's only integration record.
        """
        return self.promoted or not self.skipped

    @property
    def base_untouched(self) -> bool:
        """Whether the base checkout stands exactly where it started."""
        return self.base_before == self.base_after

    @property
    def summary(self) -> str:
        """One line a user can act on."""
        if self.skipped and self.promoted:
            return f"{self.integration_id}: 1 unit landed — {self.skip_reason}"
        if self.skipped:
            return f"{self.integration_id}: skipped — {self.skip_reason or SINGLE_UNIT_SKIP_REASON}"
        if self.succeeded:
            return f"{self.integration_id}: {len(self.unit_ids)} unit(s) integrated and landed"
        collided = ", ".join(self.conflicting_units)
        where = f" ({collided})" if collided else ""
        return f"{self.integration_id}: not landed{where} — {self.failure_reason}"

    @traces(SWR.SWR_3409, SWR.SWR_3216)
    def to_view(self) -> IntegrationView:
        """This outcome as the board reads it (SWR-3216)."""
        return IntegrationView(
            integration_id=self.integration_id,
            unit_ids=self.unit_ids,
            merged_commit=self.merged_commit,
            branch=self.branch,
            worktree_path=self.worktree_path,
            succeeded=self.succeeded,
            conflicting_units=self.conflicting_units,
            conflicting_files=self.conflicting_files,
            finished_at=self.finished_at,
        )

    @traces(SWR.SWR_3409, SWR.SWR_3206)
    def to_record(self, *, session_id: str | None = None) -> IntegrationRecord:
        """This outcome as the requirement's integration evidence (SWR-3206)."""
        return IntegrationRecord(
            integration_id=self.integration_id,
            unit_ids=self.unit_ids,
            merged_commit=self.merged_commit,
            session_id=session_id,
            succeeded=self.succeeded,
            finished_at=self.finished_at,
        )


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3409)
class RequirementIntegrator:
    """Merge, verify and only then promote — with the base as the last step.

    Every collaborator is injected: the git port, the provider that produces the
    integration worktree, the check suite that verifies it and the clock. What is
    left is the order of operations, which is the whole of SWR-3409 and is
    testable against a scripted git port without a repository.
    """

    def __init__(
        self,
        base_workspace: Path,
        *,
        git: GitPort | None = None,
        isolation: IsolationProvider | None = None,
        verify: WorkspaceChecks | None = None,
        clock: Callable[[], dt.datetime] = _utc_now,
    ) -> None:
        self._base_workspace = base_workspace.expanduser()
        self._git = git if git is not None else Git()
        self._isolation = (
            isolation
            if isolation is not None
            else GitIsolation(self._base_workspace, storage_subpath=INTEGRATION_WORKTREE_SUBPATH)
        )
        self._verify = verify
        self._clock = clock

    @property
    def base_workspace(self) -> Path:
        """The checkout an integration promotes onto — and touches last."""
        return self._base_workspace

    @traces(SWR.SWR_3409)
    def fingerprint_base(self) -> BaseFingerprint:
        """Where the base checkout stands right now."""
        branch = self._git.run(self._base_workspace, "branch", "--show-current")
        head = self._git.run(self._base_workspace, "rev-parse", "HEAD")
        if not head.ok:
            raise WorktreeError(f"{self._base_workspace}: {head.message}")
        return BaseFingerprint(branch=branch.text, revision=head.text)

    @traces(SWR.SWR_3409, SWR.SWR_3419)
    def fingerprint_target(self, branch: str) -> BaseFingerprint:
        """Where *branch* stands right now — the checkout's own, or another one.

        A target branch the checkout does not have out is still a real branch
        with a real head, and an integration that promotes onto it has to compare
        against *that* (SWR-3419). Reading ``HEAD`` instead would compare the
        promotion against a tree it is not touching, which is how "the base did
        not move" becomes a sentence about the wrong base.
        """
        checkout = self._git.run(self._base_workspace, "branch", "--show-current")
        if not branch or branch == checkout.text:
            return self.fingerprint_base()
        head = self._git.run(self._base_workspace, "rev-parse", "--verify", f"refs/heads/{branch}")
        if not head.ok:
            raise WorktreeError(
                f"{self._base_workspace}: the target branch {branch!r} does not exist"
                f" — {head.message}",
            )
        return BaseFingerprint(branch=branch, revision=head.text)

    def _promote(self, plan: RequirementIntegrationPlan, branch: str | None = None) -> GitCommand:
        """Move the target branch onto the verified integration, fast-forward only.

        Two shapes, one guarantee. When the target *is* the branch the checkout
        has out, ``merge --ff-only`` is right and also updates the working tree,
        so the user sees the result where they are standing. When the target is a
        branch the checkout does not have out — the case SWR-3419 exists for —
        ``fetch . <src>:<dst>`` is git's own way to advance a branch that is not
        checked out, and it refuses a non-fast-forward exactly as ``--ff-only``
        does. Checking out the target to merge it would move the user's tree out
        from under them, which is the one thing this whole epic promises not to
        do.
        """
        source = branch or plan.integration_branch
        checkout = self._git.run(self._base_workspace, "branch", "--show-current")
        if not plan.base_branch or plan.base_branch == checkout.text:
            return self._git.run(self._base_workspace, "merge", "--ff-only", source)
        return self._git.run(
            self._base_workspace,
            "fetch",
            ".",
            f"{source}:{plan.base_branch}",
        )

    @traces(SWR.SWR_3409)
    def integrate(self, plan: RequirementIntegrationPlan) -> IntegrationOutcome:
        """Carry *plan* out, or report exactly what stopped it.

        Never raises for an integration that failed: a conflict and a red suite
        are both *results* the board has to show and the user has to act on
        (SWR-3409). Only a broken precondition — no git, no worktree — is an
        exception, because then there is nothing to report about.
        """
        before = self.fingerprint_target(plan.base_branch)
        if not plan.needed:
            return self._land_alone(plan, before)
        if before.differs_from(plan.base):
            return self._failed(
                plan,
                before=before,
                reason=(
                    f"the base moved from {plan.base.address} to {before.address}"
                    " while the units ran; the base was left untouched"
                ),
            )

        tree = self._integration_worktree(plan)
        merged = self._merge_all(plan, tree)
        if merged.conflict is not None:
            return self._failed(
                plan,
                before=before,
                tree=tree,
                reason=merged.conflict.reason,
                conflicting_units=merged.conflict.units,
                conflicting_files=merged.conflict.files,
            )

        suite = self._verify(tree) if self._verify is not None else SuiteRun.not_run()
        head = self._git.run(tree, "rev-parse", "HEAD")
        merged_commit = head.text if head.ok else None
        if not suite.passed:
            return self._failed(
                plan,
                before=before,
                tree=tree,
                merged=True,
                merged_commit=merged_commit,
                verified=False if suite.executed else None,
                suite=suite,
                reason=(
                    "integration verification did not pass: "
                    + (
                        ", ".join(check.name for check in suite.failed_checks)
                        or suite.skip_reason
                        or "nothing verified the integration"
                    )
                ),
            )

        promotion = self._promote(plan)
        after = self.fingerprint_target(plan.base_branch)
        if not promotion.ok:
            return self._failed(
                plan,
                before=before,
                after=after,
                tree=tree,
                merged=True,
                merged_commit=merged_commit,
                verified=True,
                suite=suite,
                reason=f"the verified integration could not be fast-forwarded onto the base: {promotion.message}",
            )
        return IntegrationOutcome(
            integration_id=plan.integration_id,
            req_id=plan.req_id,
            unit_ids=plan.unit_ids,
            branch=plan.integration_branch,
            worktree_path=str(tree),
            merged_commit=merged_commit,
            merged=True,
            verified=True,
            verification_detail=f"{len(suite.checks)} check(s) passed",
            checks=tuple(check.name for check in suite.checks),
            promoted=True,
            base_before=before.revision,
            base_after=after.revision,
            finished_at=self._clock(),
        )

    @traces(SWR.SWR_3420)
    def _land_alone(
        self,
        plan: RequirementIntegrationPlan,
        before: BaseFingerprint,
    ) -> IntegrationOutcome:
        """The requirement that needs no integration — and still has to land.

        SWR-3409's third criterion is about the *integration worktree*: one unit
        has nothing to merge, so building a tree to merge it into would be
        ceremony. It was read as being about the landing too, and most
        requirements produce exactly one unit — so "requirement work reaches the
        base" was true only for the ones that happened to be split (SWR-3420).

        No tree is created here, which is what keeps SWR-3409's criterion true.
        What changes is that a unit whose own run verified it (SWR-3410) is
        promoted with the same fast-forward an integration uses, onto the same
        target, recorded as the same evidence — one landing step, not a second
        one that could disagree with the first.
        """
        unit = plan.units[0] if len(plan.units) == 1 else None
        if unit is None or not unit.verified:
            return IntegrationOutcome(
                integration_id=plan.integration_id,
                req_id=plan.req_id,
                unit_ids=plan.unit_ids,
                skipped=True,
                skip_reason=(plan.skip_reason if unit is None else UNVERIFIED_SKIP_REASON),
                base_before=before.revision,
                base_after=before.revision,
                finished_at=self._clock(),
            )
        promotion = self._promote(plan, unit.branch)
        after = self.fingerprint_target(plan.base_branch)
        if not promotion.ok:
            return self._failed(
                plan,
                before=before,
                after=after,
                verified=True,
                reason=(
                    f"the verified unit {unit.unit_id} could not be fast-forwarded onto"
                    f" {plan.base_branch or 'the base'}: {promotion.message}"
                ),
            )
        return IntegrationOutcome(
            integration_id=plan.integration_id,
            req_id=plan.req_id,
            unit_ids=plan.unit_ids,
            branch=unit.branch,
            merged_commit=after.revision,
            verified=True,
            promoted=True,
            skipped=True,
            skip_reason=SINGLE_UNIT_LANDED_REASON,
            base_before=before.revision,
            base_after=after.revision,
            finished_at=self._clock(),
        )

    # -- the steps ----------------------------------------------------------

    def _integration_worktree(self, plan: RequirementIntegrationPlan) -> Path:
        request = IsolationRequest(
            branch=plan.integration_branch,
            session_id=plan.integration_id,
            create=True,
        )
        try:
            workspace = self._isolation.provide(request)
        except IsolationError as exc:
            raise IntegrationError(
                f"{plan.req_id}: no integration worktree — {exc}",
            ) from exc
        return Path(workspace.path)

    def _merge_all(self, plan: RequirementIntegrationPlan, tree: Path) -> _MergePass:
        done: list[UnitBranch] = []
        for unit in plan.units:
            result = self._git.run(
                tree,
                *_ROTARIS_IDENTITY,
                "merge",
                "--no-ff",
                "--no-edit",
                unit.branch,
            )
            if result.ok:
                done.append(unit)
                continue
            files = self._unmerged_paths(tree)
            self._git.run(tree, "merge", "--abort")
            culprits = self._culprits(plan, unit, already=done, files=files, tree=tree)
            detail = ", ".join(files) if files else result.message
            return _MergePass(
                merged=tuple(entry.unit_id for entry in done),
                conflict=_Conflict(
                    units=culprits,
                    files=files,
                    reason=(
                        f"unit {unit.unit_id} conflicts with {', '.join(culprits[1:]) or 'the base'}"
                        f" on {detail}; the base was left untouched and every unit"
                        " branch was kept"
                    ),
                ),
            )
        return _MergePass(merged=tuple(entry.unit_id for entry in done))

    def _unmerged_paths(self, tree: Path) -> tuple[str, ...]:
        result = self._git.run(tree, "diff", "--name-only", "--diff-filter=U")
        return result.lines if result.ok else ()

    def _culprits(
        self,
        plan: RequirementIntegrationPlan,
        failing: UnitBranch,
        *,
        already: Sequence[UnitBranch],
        files: Sequence[str],
        tree: Path,
    ) -> tuple[str, ...]:
        """The failing unit first, then every already-merged unit that touched *files*."""
        collided = [failing.unit_id]
        wanted = set(files)
        for unit in already:
            touched = set(unit.changed_files) or set(self._changed_by(unit, plan, tree))
            if not wanted or touched & wanted:
                collided.append(unit.unit_id)
        return tuple(collided)

    def _changed_by(
        self,
        unit: UnitBranch,
        plan: RequirementIntegrationPlan,
        tree: Path,
    ) -> tuple[str, ...]:
        result = self._git.run(
            tree,
            "diff",
            "--name-only",
            f"{plan.base_revision}..{unit.branch}",
        )
        return result.lines if result.ok else ()

    def _failed(
        self,
        plan: RequirementIntegrationPlan,
        *,
        before: BaseFingerprint,
        reason: str,
        after: BaseFingerprint | None = None,
        tree: Path | None = None,
        merged: bool = False,
        merged_commit: str | None = None,
        verified: bool | None = None,
        suite: SuiteRun | None = None,
        conflicting_units: tuple[str, ...] = (),
        conflicting_files: tuple[str, ...] = (),
    ) -> IntegrationOutcome:
        landed = after if after is not None else self.fingerprint_base()
        return IntegrationOutcome(
            integration_id=plan.integration_id,
            req_id=plan.req_id,
            unit_ids=plan.unit_ids,
            branch=plan.integration_branch if tree is not None else None,
            worktree_path=str(tree) if tree is not None else None,
            merged_commit=merged_commit,
            merged=merged,
            verified=verified,
            verification_detail=suite.skip_reason if suite is not None else "",
            checks=tuple(check.name for check in suite.checks) if suite is not None else (),
            promoted=False,
            conflicting_units=conflicting_units,
            conflicting_files=conflicting_files,
            failure_reason=reason,
            base_before=before.revision,
            base_after=landed.revision,
            finished_at=self._clock(),
        )


class _Conflict(BaseModel):
    """A merge that stopped, and everything a user needs to read about it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    units: tuple[str, ...]
    files: tuple[str, ...]
    reason: str


class _MergePass(BaseModel):
    """How far the merge sequence got before it stopped, if it stopped."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    merged: tuple[str, ...] = ()
    conflict: _Conflict | None = None
