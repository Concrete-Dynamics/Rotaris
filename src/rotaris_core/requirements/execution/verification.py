"""Verification of a unit's work, inside the unit's own workspace (SWR-3410).

Verifying a unit anywhere but in its own worktree measures the wrong tree. The
completion verifier already knows how to run a workspace's check suite
(SWR-2601/SWR-2602) and how to derive requirement-coverage evidence from an
iteration (SWR-2606) and scope drift from it (SWR-2607); none of that is
re-implemented here. What requirement execution needs on top is the *attachment*:

```text
unit worktree ─▶ run_checks() ─▶ SuiteRun ─┐
requirement-coverage evidence  ────────────┤
scope drift                    ────────────┼─▶ UnitVerification
snapshot (hash) + commit       ────────────┘        │
                                                    ├─▶ VerificationRecord (SWR-3208)
                                                    └─▶ RunnerMeasurements (SWR-3408)
```

Four properties are load-bearing:

- **The unit's tree, never the base.** :func:`verify_unit` refuses a workspace
  that resolves to the base checkout, so "we verified the wrong tree" is a
  refusal with both paths in it rather than a green result nobody can reproduce.
- **Not verified is not verified.** A workspace with no check suite yields
  :attr:`UnitVerification.verified` of ``None`` — the same three-valued answer
  :class:`~rotaris_core.verifier.evidence.VerifierEvidence` draws between
  ``skipped`` and ``passed``. Only an *executed* suite can produce ``True``.
- **The evidence names what it was produced against.** The commit and the
  requirement hash are mandatory, exactly as
  :class:`~rotaris_core.requirements.delivery.evidence.VerificationRecord`
  requires them — a verdict that cannot name either is a claim, not evidence.
- **A failure keeps the work and names the check.** Nothing here removes a tree,
  and :attr:`UnitVerification.failed_checks` names the checks that did not pass,
  so a user reads *which* check failed instead of a colour.

Pure with respect to the world: the suite run arrives as a callable, the clock as
an argument. No subprocess, no filesystem write, no ``now()``.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel, ConfigDict, field_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.evidence import VerificationRecord
from rotaris_core.requirements.delivery.projection import (
    CheckOutcome,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.execution.contract import RunnerMeasurements, check_outcomes
from rotaris_core.verifier.requirement_evidence import (
    CoverageState,  # noqa: TC001 - Pydantic resolves this at runtime.
)

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from rotaris_core.requirements.execution.contract import CheckLike
    from rotaris_core.requirements.execution.run_seam import RunWorkspace
    from rotaris_core.requirements.execution.snapshot import RunSnapshot
    from rotaris_core.verifier.evidence import VerifierVerdict

__all__ = [
    "NO_SUITE_REASON",
    "CoverageFinding",
    "SuiteRun",
    "SuiteRunLike",
    "TouchedRequirementLike",
    "UnitVerification",
    "VerificationError",
    "WorkspaceChecks",
    "coverage_findings",
    "verify_unit",
]

#: What a workspace with nothing to run reports. Stated once so the run record,
#: the board and the audit trail cannot describe the same fact differently.
NO_SUITE_REASON = "this workspace declares no check suite; nothing was verified"

#: Check statuses that mean the check executed and did not pass. The same set
#: the completion verifier uses (SWR-2603) — a second opinion on what "failed"
#: means is how two surfaces disagree about one run.
_FAILED_STATUSES = frozenset({"failed", "timeout"})


class VerificationError(RuntimeError):
    """A unit's verification could not be attributed to a tree, a commit or a hash."""


class SuiteRunLike(Protocol):
    """The shape :class:`~rotaris_core.verifier.runner.VerifierRunResult` has.

    Structural, so this module consumes the real verifier's output without
    importing it — which keeps the SDK and the terminal executor out of the
    import path of everything that only wants to *read* a verification.
    """

    @property
    def executed(self) -> bool:
        """Whether the suite ran at all."""
        ...

    @property
    def skip_reason(self) -> str | None:
        """Why it did not run. Only meaningful when it did not."""
        ...

    @property
    def results(self) -> Sequence[CheckLike]:
        """The per-check results, in execution order."""
        ...

    @property
    def duration_s(self) -> float:
        """Wall-clock cost of the whole pass."""
        ...


@traces(SWR.SWR_3410)
class SuiteRun(BaseModel):
    """One check-suite pass over one workspace, in the board's own vocabulary.

    ``executed`` is kept apart from "everything passed" throughout: a suite that
    never ran passes vacuously in neither this model nor anything reading it,
    which is the distinction SWR-3410's third acceptance criterion is about.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    executed: bool = False
    checks: tuple[CheckOutcome, ...] = ()
    #: Why nothing ran. Only set when :attr:`executed` is ``False``.
    skip_reason: str = ""
    duration_s: float = 0.0

    @classmethod
    @traces(SWR.SWR_3410)
    def from_verifier_run(cls, run: SuiteRunLike) -> SuiteRun:
        """The completion verifier's own result, as a suite run (SWR-2602).

        Composition rather than a second runner: whatever the verifier resolved,
        executed and classified is what lands here, converted through
        :func:`~rotaris_core.requirements.execution.contract.check_outcomes` so
        the run record and the review surface read one shape.
        """
        return cls(
            executed=bool(run.executed),
            checks=check_outcomes(run.results),
            skip_reason=(run.skip_reason or "") if not run.executed else "",
            duration_s=float(run.duration_s),
        )

    @classmethod
    @traces(SWR.SWR_3410)
    def not_run(cls, reason: str = NO_SUITE_REASON) -> SuiteRun:
        """The honest value for a workspace with nothing to verify with."""
        return cls(executed=False, skip_reason=reason or NO_SUITE_REASON)

    @property
    def failed_checks(self) -> tuple[CheckOutcome, ...]:
        """The checks that executed and did not pass — named, never counted."""
        return tuple(check for check in self.checks if check.status in _FAILED_STATUSES)

    @property
    def passed(self) -> bool:
        """Whether this pass is positive evidence. ``False`` when nothing ran."""
        return self.executed and not self.failed_checks

    @property
    def verdict(self) -> VerifierVerdict:
        """``passed`` / ``failed`` / ``skipped`` — the verifier's own vocabulary."""
        if not self.executed:
            return "skipped"
        return "failed" if self.failed_checks else "passed"


class TouchedRequirementLike(Protocol):
    """One entry of the verifier's requirement-coverage evidence (SWR-2606)."""

    @property
    def req_id(self) -> str:
        """The requirement the change served."""
        ...

    @property
    def coverage_state(self) -> CoverageState:
        """``uncovered`` / ``not_run`` / ``failing`` / ``verified``."""
        ...


@traces(SWR.SWR_3410)
class CoverageFinding(BaseModel):
    """What a unit's change did to one requirement's covering tests (SWR-2606).

    Carried on the unit's verification because SWR-3410 asks for it *attached to
    the unit and to the requirement*, not only to the session that happened to
    run it. The vocabulary is the completion verifier's
    :data:`~rotaris_core.verifier.requirement_evidence.CoverageState`, so the two
    cannot disagree about what "not run" means.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    state: CoverageState = "uncovered"
    #: Where the covering tests live, ``path:line``, when they are known.
    covering_tests: tuple[str, ...] = ()

    @property
    def verified(self) -> bool:
        """Whether a covering test ran in this unit's suite and its check passed."""
        return self.state == "verified"

    @property
    def message(self) -> str:
        """One line a user can act on."""
        return f"{self.req_id}: {self.state.replace('_', ' ')}"


@traces(SWR.SWR_3410)
def coverage_findings(touched: Sequence[TouchedRequirementLike]) -> tuple[CoverageFinding, ...]:
    """The verifier's coverage evidence (SWR-2606) as findings on a unit run."""
    return tuple(
        CoverageFinding(req_id=entry.req_id, state=entry.coverage_state) for entry in touched
    )


@traces(SWR.SWR_3410)
class UnitVerification(BaseModel):
    """What verification measured for one unit run, and what it was measured on.

    Everything needed to reproduce the answer travels with it: the tree, the
    commit, the requirement hash, and the checks themselves. That is what makes
    it *evidence* the requirement can carry (SWR-3206) rather than a note about a
    session.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    req_id: str
    unit_id: str | None = None
    #: The tree the checks ran in — the unit's own, never the base (SWR-3405).
    worktree_path: str
    branch: str = ""
    #: The commit the checks ran against (SWR-3208).
    commit: str
    #: The requirement's hash at run start, from the run's snapshot (SWR-3402).
    requirement_hash: str
    suite: SuiteRun = SuiteRun()
    #: Requirement coverage from this unit's own suite (SWR-2606).
    coverage: tuple[CoverageFinding, ...] = ()
    #: Files the change touched that no requirement asked for (SWR-2607).
    scope_drift: tuple[str, ...] = ()
    session_id: str | None = None
    verified_at: dt.datetime | None = None

    @field_validator("run_id", "req_id", "worktree_path", "commit", "requirement_hash")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise VerificationError(
                "a unit verification names the run, the requirement, the tree it ran"
                " in, the commit and the requirement hash it was produced against"
                " (SWR-3410)",
            )
        return cleaned

    @property
    def verified(self) -> bool | None:
        """``True`` / ``False`` / ``None`` — and ``None`` is not ``False``.

        ``None`` means *nothing verified this run*: no check suite, or a suite
        that was skipped. Reporting that as ``False`` would say the work failed
        verification, and reporting it as ``True`` would claim evidence that does
        not exist. The three answers stay three (SWR-3410).
        """
        if not self.suite.executed:
            return None
        return self.suite.passed and not self.failing_coverage

    @property
    def verdict(self) -> VerifierVerdict:
        """``passed`` / ``failed`` / ``skipped``, folding coverage into the verdict."""
        if not self.suite.executed:
            return "skipped"
        return "passed" if self.verified else "failed"

    @property
    def failed_checks(self) -> tuple[CheckOutcome, ...]:
        """The checks that failed — what SWR-3410's fourth criterion asks for."""
        return self.suite.failed_checks

    @property
    def failing_coverage(self) -> tuple[CoverageFinding, ...]:
        """Requirements whose covering test ran in this unit's suite and failed."""
        return tuple(finding for finding in self.coverage if finding.state == "failing")

    @property
    def unrun_coverage(self) -> tuple[CoverageFinding, ...]:
        """Requirements with a covering test this unit's suite never executed."""
        return tuple(finding for finding in self.coverage if finding.state == "not_run")

    @property
    def detail(self) -> str:
        """One line for the run record and the audit trail."""
        if not self.suite.executed:
            return self.suite.skip_reason or NO_SUITE_REASON
        if self.verified:
            return f"{len(self.suite.checks)} check(s) passed at {self.commit[:12]}"
        parts: list[str] = []
        if self.failed_checks:
            parts.append("failed checks: " + ", ".join(check.name for check in self.failed_checks))
        if self.failing_coverage:
            parts.append(
                "failing coverage: "
                + ", ".join(finding.req_id for finding in self.failing_coverage),
            )
        return "; ".join(parts) or "verification did not pass"

    @traces(SWR.SWR_3410, SWR.SWR_3208)
    def to_record(self) -> VerificationRecord:
        """This verification as the requirement's evidence (SWR-3206, SWR-3208)."""
        return VerificationRecord(
            verdict=self.verdict,
            commit=self.commit,
            requirement_hash=self.requirement_hash,
            run_id=self.run_id,
            verified_at=self.verified_at,
            session_id=self.session_id,
            checks=tuple(check.name for check in self.suite.checks),
        )

    @traces(SWR.SWR_3410, SWR.SWR_3408)
    def measured(self, base: RunnerMeasurements | None = None) -> RunnerMeasurements:
        """*base*, with the fields this verification actually measured filled in.

        The completion contract's fields stay runner-owned (SWR-3408): what this
        returns is the runner's own measurement, and nothing an agent said can
        reach it. Only ``tests_executed``, ``tests_passed``, ``checks`` and
        ``traceability_established`` are set — the other obligations are measured
        elsewhere and must not be granted by a verification that never looked.
        """
        start = base if base is not None else RunnerMeasurements()
        return start.model_copy(
            update={
                "tests_executed": self.suite.executed,
                "tests_passed": bool(self.verified),
                "traceability_established": bool(self.coverage)
                and not any(finding.state == "uncovered" for finding in self.coverage),
                "checks": self.suite.checks,
                "detail": self.detail,
            },
        )


#: What actually runs a workspace's checks. Injected, so the decision logic here
#: is testable without a subprocess and the real one is
#: :func:`~rotaris_core.verifier.runner` behind one lambda.
type WorkspaceChecks = Callable[[Path], SuiteRun]


@traces(SWR.SWR_3410)
def verify_unit(
    *,
    snapshot: RunSnapshot,
    workspace: RunWorkspace,
    base_workspace: Path,
    run_checks: WorkspaceChecks,
    commit: str,
    at: dt.datetime | None = None,
    coverage: Sequence[CoverageFinding] = (),
    scope_drift: Sequence[str] = (),
) -> UnitVerification:
    """Run *workspace*'s checks in *workspace* and attach the result to the unit.

    Refuses, rather than degrading, on the two mistakes that would make the
    result meaningless: a workspace that is the base checkout (SWR-3405 says the
    unit's work is not there, so neither is the thing to verify), and a run with
    no commit to attribute the verdict to (SWR-3208).

    The requirement hash comes from the run's *snapshot* — the version the work
    was aimed at (SWR-3402) — and never from re-reading the requirement, so a
    specification edited mid-run cannot silently re-target the evidence.
    """
    tree = Path(workspace.path)
    base = _resolved(base_workspace)
    if _resolved(tree) == base:
        raise VerificationError(
            f"{snapshot.req_id}: verification would have run in the base checkout"
            f" ({base}); it runs in the unit's own worktree (SWR-3410, SWR-3405)",
        )
    if not commit.strip():
        raise VerificationError(
            f"{snapshot.req_id}: a verification names the commit it ran against;"
            " an unattributable verdict is not evidence (SWR-3208)",
        )
    suite = run_checks(tree)
    return UnitVerification(
        run_id=snapshot.run_id,
        req_id=snapshot.req_id,
        unit_id=snapshot.unit_id,
        worktree_path=str(tree),
        branch=workspace.branch,
        commit=commit,
        requirement_hash=snapshot.requirement_hash,
        suite=suite,
        coverage=tuple(coverage),
        scope_drift=tuple(scope_drift),
        session_id=snapshot.session_id,
        verified_at=at,
    )


def _resolved(path: Path) -> Path:
    try:
        return path.resolve()
    except OSError:  # pragma: no cover - only an unreadable path reaches this
        return path
