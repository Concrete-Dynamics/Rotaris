"""Running a verification, and writing what it found (SWR-3221, SWR-3615).

The composition root for the verification pass. Everything below it is pure —
:func:`~rotaris_core.requirements.delivery.verification_pass.plan_verifications`
takes values and returns values — and everything a real verification needs that
values cannot supply is assembled here: the workspace's own check suite, the
branch it counts on, a clock, and the store the artefacts land in.

**In the engine, not the desktop.** Adoption's equivalent composition sits in the
desktop package, which is why adoption cannot be run headless. This one is
reachable from both, and ``rotaris-headless requirements verify`` is the second
consumer that proves it — the same shape SWR-3416 licensed for runs.

```text
load_config          → the workspace's own checks           SWR-2601
resolve_check_suite  → what will actually be run
run_check_suite      → one run, over the target checkout    SWR-2602
verification_target  → which branch this counts on          SWR-3419
plan_verifications   → one record per requirement covered   SWR-3221
VerificationStore    → written, last-one-wins               SWR-3220
```
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.verification import (
    VerificationOrigin,
    VerificationStore,
)
from rotaris_core.requirements.delivery.verification_pass import (
    NO_CHECK_SUITE,
    VerificationPassReport,
    VerificationTarget,
    plan_verifications,
)
from rotaris_core.requirements.pass_progress import (
    PassPhase,
    check_suite_progress,
    notify,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from rotaris_core.requirements.delivery.evidence import EvidenceInputs
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.pass_progress import PassProgress
    from rotaris_core.verifier.runner import CheckResult

_log = logging.getLogger(__name__)

__all__ = [
    "run_workspace_checks",
    "verification_target",
    "verify_requirements",
    "verify_workspace",
]


@traces(SWR.SWR_3221, SWR.SWR_3419)
def verification_target(workspace: Path) -> VerificationTarget | None:
    """The branch this workspace's verifications count on, and where it stands.

    The workspace's declared target branch (SWR-3419), falling back to whatever
    the checkout has out — which is what every project that configures nothing
    gets, and what this function always returned. The point of routing it through
    :func:`~rotaris_core.requirements.execution.target.target_branch_for` is that
    a team stabilising on ``dev`` gets its evidence measured on ``dev`` rather
    than on the branch somebody happened to be standing on, and that units,
    integration and verification all read *one* answer.

    ``None`` for a workspace that is not a checkout, one whose HEAD is detached
    and which declared nothing, or one whose declared branch does not exist: a
    verification that cannot say where it counts is not evidence, and saying so
    beats inventing a branch.
    """
    from rotaris_core.requirements.execution.target import target_branch_for

    with contextlib.suppress(Exception):
        target = target_branch_for(workspace)
        if target.stated and target.revision:
            return VerificationTarget(branch=target.branch, commit=target.revision)
    return None


@traces(SWR.SWR_3221, SWR.SWR_2601, SWR.SWR_2602)
@traces(SWR.SWR_3620)
def run_workspace_checks(
    workspace: Path,
    *,
    progress: PassProgress | None = None,
) -> tuple[Sequence[CheckResult], str]:
    """Run this workspace's own configured check suite, once.

    Returns the results and the sentence to show when there are none. A workspace
    that declares no checks gets an empty suite and a stated reason, never an
    invented pass: "nobody checked" and "everything holds" are different answers
    and only one of them is evidence (SWR-3410).

    The suite is the workspace's, resolved exactly as a delivering run resolves
    it. That is the only reason its verdict is worth anything — a check Rotaris
    invented would measure a tree against a standard nobody agreed to.

    *progress* is told the suite's length before the first check runs and then
    named each check as it starts (SWR-3620). This is the phase that makes a
    pass take minutes, so it is also the one whose silence looked like a hang.
    """
    from rotaris_core.config.loader import load_config
    from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
    from rotaris_core.verifier.runner import run_check_suite
    from rotaris_core.verifier.suite import resolve_check_suite

    suite = resolve_check_suite(load_config(workspace), workspace)
    if not suite.checks:
        return (), NO_CHECK_SUITE
    notify(progress, "on_phase", PassPhase.CHECKS, len(suite.checks))
    run = asyncio.run(
        run_check_suite(
            suite,
            workspace_root=workspace,
            change=WorkspaceChangeSignal(
                changed=True,
                reason="verifying this workspace's requirements",
                sources=("verification",),
            ),
            progress=check_suite_progress(progress),
        ),
    )
    if not run.executed:
        return (), run.skip_reason or NO_CHECK_SUITE
    return tuple(run.results), ""


@traces(SWR.SWR_3221, SWR.SWR_3220)
@traces(SWR.SWR_3620)
def verify_requirements(
    workspace: Path,
    *,
    requirements: Sequence[CanonicalRequirement],
    evidence_for: Callable[[CanonicalRequirement], EvidenceInputs],
    checks: Sequence[CheckResult] = (),
    target: VerificationTarget | None = None,
    run_id: str = "",
    at: dt.datetime | None = None,
    origin: VerificationOrigin = VerificationOrigin.ROTARIS,
    session_id: str | None = None,
    progress: PassProgress | None = None,
) -> VerificationPassReport:
    """Attribute one suite run to *requirements* and write what it earned.

    The write is the only side effect, and it happens once per recorded
    requirement. A refused or skipped requirement leaves the store exactly as it
    was — including the verification it already had, which is still the last one
    anybody measured.

    The write loop is what *progress* counts (SWR-3620). Planning is arithmetic
    over values already in memory; this is one file per requirement, and on a
    repository-sized store it is the only per-requirement step long enough for a
    count to mean anything.
    """
    moment = at if at is not None else dt.datetime.now(dt.UTC)
    where = target if target is not None else verification_target(workspace)
    if where is None:
        _log.info("No verification target for %s; nothing recorded", workspace)
        return VerificationPassReport()

    freshness = _reachability(workspace)
    report = plan_verifications(
        requirements,
        evidence_for,
        checks=checks,
        target=where,
        run_id=run_id or f"verify-{moment:%Y%m%d-%H%M%S}",
        at=moment,
        origin=origin,
        reachable=freshness,
        session_id=session_id,
    )
    store = VerificationStore(workspace)
    written = report.verifications
    notify(progress, "on_phase", PassPhase.RECORDING, len(written))
    for position, verification in enumerate(written, start=1):
        store.save(verification)
        notify(
            progress,
            "on_item",
            PassPhase.RECORDING,
            verification.req_id,
            position,
            len(written),
        )
    return report


@traces(SWR.SWR_3615, SWR.SWR_3221)
@traces(SWR.SWR_3620)
def verify_workspace(
    workspace: Path,
    *,
    run_id: str = "",
    at: dt.datetime | None = None,
    verify: Callable[[Path], tuple[Sequence[CheckResult], str]] | None = None,
    progress: PassProgress | None = None,
) -> VerificationPassReport:
    """Verify every requirement this workspace declares, and record what held.

    What the board's Verify action runs (SWR-3615), and what
    ``rotaris-headless requirements verify`` runs. Composed here so both reach the
    same pass over the same stores rather than two that can drift.

    *verify* is the seam a test replaces; production runs
    :func:`run_workspace_checks`, which is a real suite over the real workspace —
    the only thing that can make a covering test read as executed. Progress is
    bound onto the production runner rather than widening that seam's type, so
    every one-argument double a test already passes keeps working (SWR-3620).

    The phases a host is told about are this function's own shape: reading the
    source, running the suite, sweeping coverage, then recording.
    """
    from functools import partial

    from rotaris_core.requirements.delivery.projection import CoverageEvidence
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    source = reqtocode_source_for(workspace)
    if source is None:
        return VerificationPassReport()
    notify(progress, "on_phase", PassPhase.READING)
    requirements = tuple(source.read().requirements)
    runner = verify if verify is not None else partial(run_workspace_checks, progress=progress)
    checks, _reason = runner(workspace)
    notify(progress, "on_phase", PassPhase.COVERAGE)
    evidence = CoverageEvidence.for_repository(workspace)
    return verify_requirements(
        workspace,
        requirements=requirements,
        evidence_for=evidence.evidence_for,
        checks=checks,
        run_id=run_id,
        at=at,
        progress=progress,
    )


def _reachability(workspace: Path) -> Callable[[str], bool | None]:
    """ "Is this commit on the target branch" — asked of git, once per commit.

    The guard SWR-3221 rests on, supplied here because the pass is pure and
    cannot ask. A workspace without git answers ``None`` for everything, which
    records rather than refuses: unknown is not "no", and a workspace without git
    has no worktrees for the guard to be protecting against.
    """
    from rotaris_core.requirements.delivery.freshness import GitFreshness, NoFreshness

    source = GitFreshness.for_repo(workspace) or NoFreshness()
    return source.is_ancestor
