"""One suite run, attributed to the requirements it actually covered (SWR-3221).

A board-started requirement runs in its own worktree (SWR-3405), and several run
in parallel in several worktrees (SWR-3406). A suite that passes in one of those
trees says nothing about the others and nothing about the branch they all land
on: **two requirements can each be green alone and red together.** A verification
measured in a unit's worktree is therefore evidence about that unit — which is
exactly what SWR-3410 makes it — and must not become the requirement's record.

So this module holds two things, and the second is the important one:

```text
plan_verifications()   one run → one record per requirement it covered
the target guard       a commit off the target branch is refused, not recorded
```

The guard is what makes the rule structural rather than conventional. A unit
worktree's commit is unreachable from the target branch until its work lands, so
there is no code path — not a helper, not a well-meaning caller, not a future one
— that can promote a worktree measurement into requirement evidence. It is the
same shape as SWR-3609's "the UI cannot force ``Done``": a rule you cannot get
around by knowing the right function to call.

Pure. Requirements, evidence and check results in; a per-requirement report out.
No store, no clock, no subprocess — the composition that supplies those lives
above it, the way :mod:`~rotaris_core.requirements.delivery.adoption` is composed.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, field_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.evidence import VerificationRecord
from rotaris_core.requirements.delivery.verification import (
    RequirementVerification,
    VerificationOrigin,
)
from rotaris_core.verifier.requirement_evidence import (
    CoveringTest,
    executed_test_runners,
    execution_for,
    verdict_for,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from rotaris_core.requirements.delivery.evidence import EvidenceInputs
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.verifier.evidence import VerifierVerdict
    from rotaris_core.verifier.runner import CheckResult

__all__ = [
    "NOTHING_EXECUTED",
    "NO_CHECK_SUITE",
    "OFF_TARGET_BRANCH",
    "VerificationOutcome",
    "VerificationPassReport",
    "VerificationResult",
    "VerificationTarget",
    "plan_verifications",
]

#: Stated rather than implied when a workspace declares no checks. "Nobody
#: checked" and "everything holds" are different answers and only one of them is
#: evidence (SWR-3410's third criterion).
NO_CHECK_SUITE = "this workspace declares no check suite, so nothing was verified"

#: Why a requirement the suite never reached gets no record.
NOTHING_EXECUTED = "the suite executed none of this requirement's covering tests"

#: Why a measurement taken somewhere else is refused outright.
OFF_TARGET_BRANCH = (
    "the verified commit is not reachable from the requirement's target branch;"
    " a verification measured in a unit worktree is evidence about that unit,"
    " not about the requirement (SWR-3221)"
)

#: Why a pass that ran a suite still recorded nothing for a requirement.
NOTHING_ATTRIBUTABLE = (
    "the suite reached this requirement's covering tests but observed none of them"
    " — it was killed, or it failed as a whole; nothing was recorded rather than"
    " recording a failure nobody measured (SWR-2606)"
)


@traces(SWR.SWR_3221, SWR.SWR_3419)
class VerificationTarget(BaseModel):
    """The branch a verification counts on, and where it stood.

    Asked of the workspace rather than named, so a project that works on
    something other than its default branch is not silently measured in the wrong
    place. Nothing in this package writes ``master`` or ``main`` anywhere; making
    the branch settable is SWR-3419's job, and it changes this one value.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    branch: str
    #: The commit at the branch's head when the suite ran.
    commit: str

    @field_validator("branch", "commit")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "a verification target names the branch it counts on and the commit"
                " it stood at (SWR-3221)",
            )
        return cleaned


class VerificationOutcome(StrEnum):
    """What the pass did about one requirement."""

    #: A verification was produced for it.
    RECORDED = "recorded"
    #: The measurement could not count for it, and the reason is stated.
    REFUSED = "refused"
    #: The run never reached it — no record, and nothing wrong.
    SKIPPED = "skipped"
    #: The run reached its covering tests and observed none of them, so there is
    #: nothing to record. Distinct from ``SKIPPED``, which means the suite never
    #: got there, and from ``RECORDED`` with a failed verdict, which would assert
    #: a failure nobody measured (SWR-2606).
    INCONCLUSIVE = "inconclusive"


@traces(SWR.SWR_3221)
class VerificationResult(BaseModel):
    """One requirement's answer from the pass."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    outcome: VerificationOutcome
    verification: RequirementVerification | None = None
    detail: str = ""

    @property
    def recorded(self) -> bool:
        """Whether this requirement got a verification."""
        return self.outcome is VerificationOutcome.RECORDED

    @property
    def message(self) -> str:
        """The line a per-requirement report prints (SWR-3609)."""
        if self.verification is not None:
            return f"{self.req_id}: {self.verification.summary}"
        return f"{self.req_id}: {self.outcome} — {self.detail}"


@traces(SWR.SWR_3221, SWR.SWR_3609)
class VerificationPassReport(BaseModel):
    """What one pass did, per requirement.

    Per requirement rather than in aggregate, because a run that verified nine
    hundred of a thousand requirements has to say *which* hundred it did not and
    why — the same obligation SWR-3609 places on every bulk action.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    results: tuple[VerificationResult, ...] = ()
    target: VerificationTarget | None = None

    @property
    def recorded(self) -> tuple[VerificationResult, ...]:
        """The requirements this run produced a verification for."""
        return self._of(VerificationOutcome.RECORDED)

    @property
    def refused(self) -> tuple[VerificationResult, ...]:
        """The requirements whose measurement could not count."""
        return self._of(VerificationOutcome.REFUSED)

    @property
    def skipped(self) -> tuple[VerificationResult, ...]:
        """The requirements the run never reached."""
        return self._of(VerificationOutcome.SKIPPED)

    @property
    def inconclusive(self) -> tuple[VerificationResult, ...]:
        """The requirements the run reached without observing."""
        return self._of(VerificationOutcome.INCONCLUSIVE)

    @property
    def verifications(self) -> tuple[RequirementVerification, ...]:
        """Every artefact this pass produced, ready to be written."""
        return tuple(
            result.verification for result in self.recorded if result.verification is not None
        )

    @property
    def summary(self) -> str:
        """One line: what was recorded, what was refused, what was never reached."""
        where = f" on {self.target.branch}" if self.target is not None else ""
        unobserved = f", {len(self.inconclusive)} not observed" if self.inconclusive else ""
        return (
            f"{len(self.recorded)} verified{where},"
            f" {len(self.refused)} refused, {len(self.skipped)} not reached{unobserved}"
        )

    def _of(self, outcome: VerificationOutcome) -> tuple[VerificationResult, ...]:
        return tuple(result for result in self.results if result.outcome is outcome)


@traces(SWR.SWR_3221, SWR.SWR_3220, SWR.SWR_2606)
def plan_verifications(
    requirements: Sequence[CanonicalRequirement],
    evidence_for: Callable[[CanonicalRequirement], EvidenceInputs],
    *,
    checks: Sequence[CheckResult] = (),
    target: VerificationTarget,
    run_id: str,
    at: dt.datetime,
    measured_commit: str = "",
    origin: VerificationOrigin = VerificationOrigin.ROTARIS,
    reachable: Callable[[str], bool | None] | None = None,
    session_id: str | None = None,
) -> VerificationPassReport:
    """The verifications one suite run earns, and the ones it does not.

    *measured_commit* defaults to the target's own head — the ordinary case,
    where the pass ran the suite on the target branch's checkout. A caller that
    measured elsewhere (a landing, a unit worktree) passes the commit it actually
    measured, and *reachable* decides whether that counts.

    *reachable* answers "is this commit on the target branch": ``True`` records,
    ``False`` refuses everything, and ``None`` records. ``None`` is *unknown*, not
    *no* — a workspace without git cannot answer, and a workspace without git has
    no worktrees for the guard to be protecting against. Reading unknown as a
    refusal would make the pass useless exactly where it is harmless.
    """
    commit = (measured_commit or target.commit).strip()
    if reachable is not None and reachable(commit) is False:
        return VerificationPassReport(
            target=target,
            results=tuple(
                VerificationResult(
                    req_id=requirement.req_id,
                    outcome=VerificationOutcome.REFUSED,
                    detail=OFF_TARGET_BRANCH,
                )
                for requirement in requirements
            ),
        )
    if not checks:
        return VerificationPassReport(
            target=target,
            results=tuple(
                VerificationResult(
                    req_id=requirement.req_id,
                    outcome=VerificationOutcome.SKIPPED,
                    detail=NO_CHECK_SUITE,
                )
                for requirement in requirements
            ),
        )

    runners = executed_test_runners(list(checks))
    blocking_held = _blocking_held(checks)
    names = tuple(check.name for check in checks)
    return VerificationPassReport(
        target=target,
        results=tuple(
            _result_for(
                requirement,
                evidence_for(requirement),
                runners=runners,
                blocking_held=blocking_held,
                check_names=names,
                commit=commit,
                target=target,
                run_id=run_id,
                at=at,
                origin=origin,
                session_id=session_id,
            )
            for requirement in requirements
        ),
    )


def _result_for(
    requirement: CanonicalRequirement,
    inputs: EvidenceInputs,
    *,
    runners: Sequence[CheckResult],
    blocking_held: bool,
    check_names: tuple[str, ...],
    commit: str,
    target: VerificationTarget,
    run_id: str,
    at: dt.datetime,
    origin: VerificationOrigin,
    session_id: str | None,
) -> VerificationResult:
    """One requirement's answer — a record only where the run really reached it."""
    measured = _measured(inputs.covering_tests, runners)
    if not any(test.executed for test in measured):
        return VerificationResult(
            req_id=requirement.req_id,
            outcome=VerificationOutcome.SKIPPED,
            detail=NOTHING_EXECUTED,
        )
    if all(test.verdict in {"unknown", "not_run"} for test in measured):
        # The suite reached this requirement and said nothing about it. Recording a
        # ``failed`` verdict here is what put 1225 unearned failures in this store:
        # it is a claim about tests, made from a fact about a process. No record
        # also means an earlier, real verification keeps standing.
        return VerificationResult(
            req_id=requirement.req_id,
            outcome=VerificationOutcome.INCONCLUSIVE,
            detail=NOTHING_ATTRIBUTABLE,
        )
    failing = [test for test in measured if test.verdict == "failed"]
    verdict: VerifierVerdict = "passed" if blocking_held and not failing else "failed"
    return VerificationResult(
        req_id=requirement.req_id,
        outcome=VerificationOutcome.RECORDED,
        verification=RequirementVerification(
            req_id=requirement.req_id,
            record=VerificationRecord(
                verdict=verdict,
                commit=commit,
                requirement_hash=requirement.current_hash,
                run_id=run_id,
                verified_at=at,
                session_id=session_id,
                checks=check_names,
            ),
            implementations=inputs.implementations,
            covering_tests=measured,
            origin=origin,
            target_branch=target.branch,
        ),
    )


def _measured(
    covering: Sequence[CoveringTest],
    runners: Sequence[CheckResult],
) -> tuple[CoveringTest, ...]:
    """Today's covering tests, each carrying what *this* run did with it.

    The one fact a coverage sweep cannot supply: a sweep knows a test exists, not
    that anything ran it, so it reports ``executed=False`` by construction
    (SWR-2606). :func:`~rotaris_core.verifier.requirement_evidence.execution_for`
    is what turns that into an answer, and it is the same function the completion
    verifier uses — one definition of "ran", not two.

    **A per-test observation already on the input wins.** An evidence provider that
    read the run's own test report knows something no check status can express —
    that *this* test passed, or that *this* test is the one that failed — so a
    verdict it supplies is carried through rather than recomputed from the suite's
    exit code. Everything else is derived, which for a suite that failed or was
    killed means ``unknown``.
    """
    measured: list[CoveringTest] = []
    for test in covering:
        ran = execution_for(test.path, runners)
        if ran is None:
            measured.append(test.model_copy(update={"executed": False}))
            continue
        observed = test.verdict in {"passed", "failed"}
        measured.append(
            test.model_copy(
                update={
                    "executed": True,
                    "check_name": ran.name,
                    "check_status": str(ran.status),
                    "verdict": (
                        test.verdict
                        if observed
                        else verdict_for(ran, test_path=test.path, line=test.line)
                    ),
                },
            ),
        )
    return tuple(measured)


def _blocking_held(checks: Sequence[CheckResult]) -> bool:
    """Whether every blocking check passed.

    A failed blocking check means the workspace's *own declared* verification did
    not pass, so no requirement measured by that run is ``passed`` — including one
    whose own tests were green. That reads harshly for a requirement failed by a
    lint check it has nothing to do with, and it is still the right answer: the
    gate the workspace configured is the thing being trusted (SWR-2604), and a
    green ring over a red suite is the failure this whole lane exists to prevent.

    Advisory checks do not gate, the same way they do not gate a run.
    """
    blocking = [check for check in checks if check.severity == "blocking"]
    return bool(blocking) and all(str(check.status) == "passed" for check in blocking)
