"""Is this requirement's evidence present, current and passing? (SWR-3207, SWR-3208)

The board has to answer that for one requirement without the user reading a log,
and it has to answer it *per obligation* — "green" is not a claim anybody can
act on. :func:`project_evidence` turns the obligations (SWR-3206) and the facts
about one requirement into one :class:`EvidenceProjection`: a state per kind of
evidence, the machine-readable reason behind it, and the concrete records it was
derived from.

**The core case (target picture §22).** Complete traceability is not delivery. A
requirement whose implementation sites and covering tests all exist, but whose
covering test *failed*, projects ``failed`` — never ``satisfied``. The whole ring
exists to make that visible, and it is the first rule in :func:`_project_test`.

**The second case.** Evidence that exists but never ran is ``stale``, and stale
is a third answer, not "not satisfied": a covering test nobody executed is a
different problem from one that failed and a different problem again from one
that was never written. The three are distinguishable here without a log.

**Pure.** No filesystem, no git, no clock, no subprocess. Every repository fact
arrives as data — coverage sites come from ReqToCode's coverage query
(SWR-2336), covering-test execution from the completion verifier's own
:class:`~rotaris_core.verifier.requirement_evidence.CoveringTest` (SWR-2606),
freshness from :mod:`~rotaris_core.requirements.delivery.staleness` — so the
rules are testable without a repository (SWR-3207) and a board refresh never
becomes a process spawn.

**Concrete, therefore navigable (SWR-3208).** A health colour that cannot be
opened is a rumour. Every record carries an address: a site is ``path:line`` an
editor can open, a verification is a run id and a commit the session view can
show. A *missing* obligation carries no records at all and says why — an empty
set with a stated reason, never a fabricated one.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.obligations import (
    EVIDENCE_KINDS,
    EvidenceKind,
    ObligationLevel,
    RequirementObligations,
)
from rotaris_core.requirements.delivery.staleness import StalenessFinding, StalenessReason
from rotaris_core.verifier.evidence import (  # noqa: TC001 - a Pydantic field type.
    VerifierVerdict,
)
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

__all__ = [
    "EVIDENCE_STATE_SEVERITY",
    "EvidenceInputs",
    "EvidenceProjection",
    "EvidenceReason",
    "EvidenceState",
    "ExecutionRecord",
    "IntegrationRecord",
    "ObligationEvidence",
    "VerificationRecord",
    "project_evidence",
    "site_address",
]


@traces(SWR.SWR_3207)
class EvidenceState(StrEnum):
    """What one obligation's evidence is worth right now (SWR-3207).

    The four states SWR-3207 names, plus the one it implies: an obligation that
    does not apply is reported as such rather than being folded into
    ``satisfied``. Green for evidence nobody expects is exactly the over-claim
    the whole projection exists to prevent.
    """

    #: Evidence exists *and* was verified.
    SATISFIED = "satisfied"
    #: Evidence exists but was not re-verified since the last relevant change,
    #: or never ran at all (SWR-3209).
    STALE = "stale"
    #: Evidence exists, ran, and did not pass — even when traceability is
    #: complete (target picture §22).
    FAILED = "failed"
    #: The obligation applies and no evidence exists at all.
    MISSING = "missing"
    #: The obligation does not apply, or is optional and absent.
    NOT_APPLICABLE = "not-applicable"

    @property
    def label(self) -> str:
        """What a user reads — ``Not Applicable``, not ``not-applicable``."""
        return " ".join(part.capitalize() for part in self.value.split("-"))

    @property
    def severity(self) -> int:
        """How loudly this state should be reported; higher wins an aggregate."""
        return EVIDENCE_STATE_SEVERITY[self]


#: Which state a requirement shows when its obligations disagree. A failure
#: outranks a gap because a failing test is a statement that something is
#: *wrong*, while a gap is a statement that something is *unknown*.
EVIDENCE_STATE_SEVERITY: dict[EvidenceState, int] = {
    EvidenceState.NOT_APPLICABLE: 0,
    EvidenceState.SATISFIED: 1,
    EvidenceState.STALE: 2,
    EvidenceState.MISSING: 3,
    EvidenceState.FAILED: 4,
}


@traces(SWR.SWR_3207)
class EvidenceReason(StrEnum):
    """Why an obligation is not satisfied — machine-readable, never a colour.

    Coarse on purpose: the *fine* reason for staleness is a
    :class:`~rotaris_core.requirements.delivery.staleness.StalenessFinding`, and
    there can be several of them for one obligation.
    """

    NO_IMPLEMENTATION_SITE = "no-implementation-site"
    NO_COVERING_TEST = "no-covering-test"
    NO_VERIFICATION = "no-verification"
    NO_EXECUTION = "no-execution"
    NO_INTEGRATION = "no-integration"
    COVERING_TEST_FAILED = "covering-test-failed"
    VERIFICATION_FAILED = "verification-failed"
    EXECUTION_FAILED = "execution-failed"
    INTEGRATION_FAILED = "integration-failed"
    #: Evidence exists but is no longer current; see ``staleness``.
    NOT_CURRENT = "not-current"
    #: A check reached the covering test and observed nothing about it — the run
    #: was killed, the suite failed as a whole, or it selected part of the file.
    #: Distinct from :attr:`COVERING_TEST_FAILED` because "this test broke" and
    #: "nobody can say" are different findings that send a reader to different
    #: places (SWR-2606).
    RESULT_UNKNOWN = "result-unknown"
    #: The requirement type does not carry this kind of evidence (SWR-3206).
    OBLIGATION_NOT_APPLICABLE = "obligation-not-applicable"
    #: The obligation is optional and nothing was recorded, which is not a gap.
    OPTIONAL_AND_ABSENT = "optional-and-absent"


@traces(SWR.SWR_3208)
def site_address(site: RequirementSite | CoveringTest) -> str:
    """``path:line`` — what an editor opens and a card links to (SWR-3208)."""
    return f"{site.path}:{site.line}"


def _addressable(sites: tuple[RequirementSite, ...]) -> tuple[RequirementSite, ...]:
    """Every site is repository-relative and carries a line, or none of them is.

    Enforced at the projection's boundary rather than on the verifier's own
    models, which this slice reuses and does not own. A site a consumer cannot
    open is not evidence of anything (SWR-3208).
    """
    for site in sites:
        path = site.path.strip()
        if not path or path.startswith("/") or path.startswith("\\") or ":" in path[:3]:
            raise ValueError(
                f"an evidence site carries a repository-relative path, got {site.path!r}",
            )
        if site.line < 1:
            raise ValueError(f"{path}: an evidence site carries a line number, got {site.line}")
    return sites


@traces(SWR.SWR_3208)
class VerificationRecord(BaseModel):
    """The last verification of one requirement — verdict, commit, hash, run.

    Every one of those four is mandatory. A verification that cannot name the
    commit it ran against or the specification version it was produced for is
    not evidence: it is a claim, and admitting it would let the board show a
    green ring for a state nobody can reproduce (SWR-3208).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    verdict: VerifierVerdict
    #: The commit the completion gate (SWR-2604) ran against.
    commit: str
    #: The requirement's ``current_hash`` the verdict was produced against.
    requirement_hash: str
    #: The run that produced it — the key into the execution history (SWR-3414).
    run_id: str
    verified_at: dt.datetime | None = None
    session_id: str | None = None
    #: The checks that carried the verdict, so a failure can be opened.
    checks: tuple[str, ...] = ()

    @field_validator("commit", "requirement_hash", "run_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "a verification record names the commit, the requirement hash and"
                " the run it was produced against (SWR-3208)",
            )
        return cleaned

    @property
    def passed(self) -> bool:
        """Whether the gate accepted this requirement's delivery."""
        return self.verdict == "passed"

    @property
    def address(self) -> str:
        """``run:<run_id>@<commit>`` — how the session view opens it."""
        return f"run:{self.run_id}@{self.commit[:12]}"


@traces(SWR.SWR_3208)
class ExecutionRecord(BaseModel):
    """One recorded execution-unit run behind a requirement (SWR-3401, SWR-3414)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    unit_id: str | None = None
    session_id: str | None = None
    succeeded: bool = False
    finished_at: dt.datetime | None = None

    @field_validator("run_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("an execution record names the run it describes")
        return cleaned

    @property
    def address(self) -> str:
        """``session:<id>/run:<id>`` — how the session view opens it."""
        where = f"session:{self.session_id}/" if self.session_id else ""
        return f"{where}run:{self.run_id}"


@traces(SWR.SWR_3208)
class IntegrationRecord(BaseModel):
    """One integration of several units into one result (SWR-3409)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    integration_id: str
    unit_ids: tuple[str, ...] = ()
    merged_commit: str | None = None
    session_id: str | None = None
    succeeded: bool = False
    finished_at: dt.datetime | None = None

    @field_validator("integration_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("an integration record names the integration it describes")
        return cleaned

    @property
    def address(self) -> str:
        """``integration:<id>@<commit>`` — how the session view opens it."""
        at = f"@{self.merged_commit[:12]}" if self.merged_commit else ""
        return f"integration:{self.integration_id}{at}"


@traces(SWR.SWR_3207, SWR.SWR_3208)
class EvidenceInputs(BaseModel):
    """Every fact the projection reads — and the only way facts get in.

    Held on the projection afterwards, because SWR-3207 asks for the states
    *together with the inputs they were derived from*: a user who disagrees with
    a colour has to be able to see what produced it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The requirement's ``current_hash`` now (SWR-3107). Empty when the caller
    #: does not know it, which disables the "verified against an older text"
    #: comparison rather than guessing at it.
    requirement_hash: str = ""
    #: Implementation sites from ReqToCode's coverage query (SWR-2336).
    implementations: tuple[RequirementSite, ...] = ()
    #: Covering tests and what the last suite did with them (SWR-2606).
    covering_tests: tuple[CoveringTest, ...] = ()
    verification: VerificationRecord | None = None
    executions: tuple[ExecutionRecord, ...] = ()
    integrations: tuple[IntegrationRecord, ...] = ()
    #: Freshness findings from :mod:`.staleness`, computed by a caller that is
    #: allowed to touch git.
    staleness: tuple[StalenessFinding, ...] = ()

    @field_validator("implementations")
    @classmethod
    def _sites_are_addressable(
        cls,
        value: tuple[RequirementSite, ...],
    ) -> tuple[RequirementSite, ...]:
        return _addressable(value)

    @field_validator("covering_tests")
    @classmethod
    def _tests_are_addressable(cls, value: tuple[CoveringTest, ...]) -> tuple[CoveringTest, ...]:
        _addressable(tuple(RequirementSite(path=t.path, line=t.line) for t in value))
        return value

    def findings_for(self, kind: EvidenceKind) -> tuple[StalenessFinding, ...]:
        """The freshness findings that concern one kind of evidence."""
        return tuple(finding for finding in self.staleness if finding.kind is kind)


@traces(SWR.SWR_3207, SWR.SWR_3208)
class ObligationEvidence(BaseModel):
    """One obligation's state, its reason, and the records behind it.

    The invariants are the acceptance criteria, enforced rather than described:
    a satisfied obligation states no reason, everything else does; a *missing*
    obligation carries an empty record set; and a *stale* one carries at least
    one machine-readable staleness finding, because "stale, no idea why" is a
    colour and SWR-3209 forbids exactly that.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: EvidenceKind
    level: ObligationLevel
    state: EvidenceState
    #: ``None`` only for a satisfied obligation.
    reason: EvidenceReason | None = None
    implementations: tuple[RequirementSite, ...] = ()
    covering_tests: tuple[CoveringTest, ...] = ()
    verification: VerificationRecord | None = None
    executions: tuple[ExecutionRecord, ...] = ()
    integrations: tuple[IntegrationRecord, ...] = ()
    staleness: tuple[StalenessFinding, ...] = ()

    @model_validator(mode="after")
    def _state_and_records_agree(self) -> Self:
        satisfied = self.state is EvidenceState.SATISFIED
        if satisfied and self.reason is not None:
            raise ValueError(f"{self.kind}: a satisfied obligation states no reason")
        if not satisfied and self.reason is None:
            raise ValueError(
                f"{self.kind}: {self.state} names the reason it is not satisfied (SWR-3207)",
            )
        if self.state is EvidenceState.MISSING and self.records:
            raise ValueError(
                f"{self.kind}: a missing obligation carries an empty record set,"
                " never a fabricated one (SWR-3208)",
            )
        if self.state is EvidenceState.STALE and not self.staleness:
            raise ValueError(
                f"{self.kind}: stale evidence names the change that made it stale,"
                " not just a colour (SWR-3209)",
            )
        return self

    @property
    def records(self) -> tuple[BaseModel, ...]:
        """Every concrete record behind this obligation, whatever its kind."""
        verification = (self.verification,) if self.verification is not None else ()
        return (
            *self.implementations,
            *self.covering_tests,
            *verification,
            *self.executions,
            *self.integrations,
        )

    @property
    def addresses(self) -> tuple[str, ...]:
        """Every record as something a consumer can open (SWR-3208)."""
        verification = (self.verification.address,) if self.verification is not None else ()
        return (
            *(site_address(site) for site in self.implementations),
            *(site_address(test) for test in self.covering_tests),
            *verification,
            *(run.address for run in self.executions),
            *(integration.address for integration in self.integrations),
        )

    @property
    def blocking(self) -> bool:
        """Whether this obligation stops the requirement from being delivered."""
        return self.level is ObligationLevel.REQUIRED and self.state in {
            EvidenceState.MISSING,
            EvidenceState.FAILED,
        }

    @property
    def detail(self) -> str:
        """One line: the kind, its state and why — what a tooltip shows."""
        reasons = ", ".join(finding.reason for finding in self.staleness)
        because = f" ({reasons})" if reasons else ""
        if self.reason is None:
            return f"{self.kind.label}: {self.state}"
        return f"{self.kind.label}: {self.state} — {self.reason}{because}"


@traces(SWR.SWR_3207)
class EvidenceProjection(BaseModel):
    """One requirement's whole evidence picture — the traceability ring's data.

    Complete by construction: one entry per kind, in board order, so a consumer
    never has to tell "not projected" from "not applicable". Serialisable, so it
    survives the delivery store's round-trip (SWR-3205), and free of requirement
    text, so persisting it never breaks SWR-3114.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    obligations: tuple[ObligationEvidence, ...]
    #: What it was derived from (SWR-3207).
    inputs: EvidenceInputs

    @model_validator(mode="after")
    def _complete_and_consistent(self) -> Self:
        kinds = tuple(obligation.kind for obligation in self.obligations)
        if kinds != EVIDENCE_KINDS:
            raise ValueError(
                f"{self.req_id}: an evidence projection carries one obligation per kind"
                f" in {EVIDENCE_KINDS} order, got {kinds}",
            )
        if self.inputs.req_id != self.req_id:
            raise ValueError(
                f"{self.req_id}: the projection was derived from {self.inputs.req_id}'s inputs",
            )
        return self

    def for_kind(self, kind: EvidenceKind) -> ObligationEvidence:
        """One kind's evidence — never ``None``, every kind is present."""
        return self.obligations[EVIDENCE_KINDS.index(kind)]

    def state_of(self, kind: EvidenceKind) -> EvidenceState:
        """One kind's state."""
        return self.for_kind(kind).state

    @property
    def state(self) -> EvidenceState:
        """The loudest state any obligation is in — the ring's overall colour.

        A failing covering test therefore shows through even when every other
        obligation is satisfied, which is the case §22 of the target picture
        exists to make impossible to miss.
        """
        return max(
            (obligation.state for obligation in self.obligations),
            key=lambda state: state.severity,
            default=EvidenceState.NOT_APPLICABLE,
        )

    def kinds_in(self, state: EvidenceState) -> tuple[EvidenceKind, ...]:
        """The kinds currently in *state*, in board order."""
        return tuple(o.kind for o in self.obligations if o.state is state)

    @property
    def blocking(self) -> tuple[ObligationEvidence, ...]:
        """The required obligations that are missing or failing."""
        return tuple(obligation for obligation in self.obligations if obligation.blocking)

    @property
    def satisfied(self) -> bool:
        """Whether every applicable obligation is satisfied."""
        return all(
            obligation.state in {EvidenceState.SATISFIED, EvidenceState.NOT_APPLICABLE}
            for obligation in self.obligations
        )

    @property
    def detail(self) -> str:
        """One line for a card: the requirement, its state and what is blocking."""
        blocking = ", ".join(obligation.kind for obligation in self.blocking)
        because = f" ({blocking})" if blocking else ""
        return f"{self.req_id}: {self.state}{because}"


def _absent(
    kind: EvidenceKind,
    level: ObligationLevel,
    *,
    missing_reason: EvidenceReason,
    findings: tuple[StalenessFinding, ...],
) -> ObligationEvidence:
    """No record of this kind exists: a gap, or an absence nobody expected.

    The staleness findings travel even here, because "there is no covering test"
    and "the covering test was deleted last week" are the same colour and very
    different repairs.
    """
    if level is ObligationLevel.REQUIRED:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.MISSING,
            reason=missing_reason,
            staleness=findings,
        )
    return ObligationEvidence(
        kind=kind,
        level=level,
        state=EvidenceState.NOT_APPLICABLE,
        reason=(
            EvidenceReason.OBLIGATION_NOT_APPLICABLE
            if level is ObligationLevel.NOT_APPLICABLE
            else EvidenceReason.OPTIONAL_AND_ABSENT
        ),
        staleness=findings,
    )


def _project_implementation(
    level: ObligationLevel,
    inputs: EvidenceInputs,
) -> ObligationEvidence:
    kind = EvidenceKind.IMPLEMENTATION
    findings = inputs.findings_for(kind)
    if level is ObligationLevel.NOT_APPLICABLE:
        # Records that exist anyway are still shown: an obligation nobody owes is
        # a statement about expectation, not a reason to hide a real trace.
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.NOT_APPLICABLE,
            reason=EvidenceReason.OBLIGATION_NOT_APPLICABLE,
            implementations=inputs.implementations,
            staleness=findings,
        )
    if not inputs.implementations:
        return _absent(
            kind,
            level,
            missing_reason=EvidenceReason.NO_IMPLEMENTATION_SITE,
            findings=findings,
        )
    if findings:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.STALE,
            reason=EvidenceReason.NOT_CURRENT,
            implementations=inputs.implementations,
            staleness=findings,
        )
    return ObligationEvidence(
        kind=kind,
        level=level,
        state=EvidenceState.SATISFIED,
        implementations=inputs.implementations,
    )


def _project_test(level: ObligationLevel, inputs: EvidenceInputs) -> ObligationEvidence:
    """The rule §22 of the target picture is about.

    Order matters and is the point: a failing covering test wins over everything,
    *including* complete traceability, so a requirement with every trace in place
    and a red test never projects satisfied. Then comes the test a check reached
    without observing — stale, because this pass did not renew the evidence, and
    emphatically not failed, because nothing measured it. Only then "nothing ran
    it", and only then the freshness findings.

    "Failing" here means *this test* did not pass, which is a stronger claim than
    "the suite carrying it did not pass" and is not derivable from a check status
    alone (:func:`~rotaris_core.verifier.requirement_evidence.verdict_for`).
    """
    kind = EvidenceKind.TEST
    tests = inputs.covering_tests
    findings = inputs.findings_for(kind)
    if level is ObligationLevel.NOT_APPLICABLE:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.NOT_APPLICABLE,
            reason=EvidenceReason.OBLIGATION_NOT_APPLICABLE,
            covering_tests=tests,
            staleness=findings,
        )
    if not tests:
        return _absent(
            kind, level, missing_reason=EvidenceReason.NO_COVERING_TEST, findings=findings
        )

    failing = tuple(test for test in tests if test.verdict == "failed")
    if failing:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.FAILED,
            reason=EvidenceReason.COVERING_TEST_FAILED,
            covering_tests=tests,
            staleness=findings,
        )

    unknown = tuple(test for test in tests if test.verdict == "unknown")
    if unknown:
        # A check reached these and observed nothing about them. Stale, not failed:
        # the evidence was not renewed, and nothing measured it. ``Done`` is still
        # refused — by the completion gate, which answers the suite's own failure
        # (SWR-2604) — but no test is named as the cause of a refusal it did not
        # cause.
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.STALE,
            reason=EvidenceReason.RESULT_UNKNOWN,
            covering_tests=tests,
            staleness=(
                *(
                    StalenessFinding(
                        kind=kind,
                        reason=StalenessReason.RESULT_UNKNOWN,
                        subject=site_address(test),
                    )
                    for test in unknown
                ),
                *findings,
            ),
        )

    passing = tuple(test for test in tests if test.verdict == "passed")
    if not passing:
        never_run = StalenessFinding(
            kind=kind,
            reason=StalenessReason.NEVER_RUN,
            subject=site_address(tests[0]),
        )
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.STALE,
            reason=EvidenceReason.NOT_CURRENT,
            covering_tests=tests,
            staleness=(never_run, *findings),
        )
    if findings:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.STALE,
            reason=EvidenceReason.NOT_CURRENT,
            covering_tests=tests,
            staleness=findings,
        )
    return ObligationEvidence(
        kind=kind,
        level=level,
        state=EvidenceState.SATISFIED,
        covering_tests=tests,
    )


def _project_verification(level: ObligationLevel, inputs: EvidenceInputs) -> ObligationEvidence:
    kind = EvidenceKind.VERIFICATION
    record = inputs.verification
    findings = inputs.findings_for(kind)
    if level is ObligationLevel.NOT_APPLICABLE:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.NOT_APPLICABLE,
            reason=EvidenceReason.OBLIGATION_NOT_APPLICABLE,
            verification=record,
            staleness=findings,
        )
    if record is None:
        return _absent(
            kind, level, missing_reason=EvidenceReason.NO_VERIFICATION, findings=findings
        )
    if record.verdict == "failed":
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.FAILED,
            reason=EvidenceReason.VERIFICATION_FAILED,
            verification=record,
            staleness=findings,
        )
    if record.verdict == "skipped":
        findings = (
            StalenessFinding(
                kind=kind,
                reason=StalenessReason.NEVER_RUN,
                subject=record.address,
            ),
            *findings,
        )
    if findings:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.STALE,
            reason=EvidenceReason.NOT_CURRENT,
            verification=record,
            staleness=findings,
        )
    return ObligationEvidence(
        kind=kind,
        level=level,
        state=EvidenceState.SATISFIED,
        verification=record,
    )


def _project_execution(level: ObligationLevel, inputs: EvidenceInputs) -> ObligationEvidence:
    kind = EvidenceKind.EXECUTION
    runs = inputs.executions
    findings = inputs.findings_for(kind)
    if level is ObligationLevel.NOT_APPLICABLE:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.NOT_APPLICABLE,
            reason=EvidenceReason.OBLIGATION_NOT_APPLICABLE,
            executions=runs,
            staleness=findings,
        )
    if not runs:
        return _absent(kind, level, missing_reason=EvidenceReason.NO_EXECUTION, findings=findings)
    if not any(run.succeeded for run in runs):
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.FAILED,
            reason=EvidenceReason.EXECUTION_FAILED,
            executions=runs,
            staleness=findings,
        )
    if findings:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.STALE,
            reason=EvidenceReason.NOT_CURRENT,
            executions=runs,
            staleness=findings,
        )
    return ObligationEvidence(
        kind=kind, level=level, state=EvidenceState.SATISFIED, executions=runs
    )


def _project_integration(level: ObligationLevel, inputs: EvidenceInputs) -> ObligationEvidence:
    kind = EvidenceKind.INTEGRATION
    integrations = inputs.integrations
    findings = inputs.findings_for(kind)
    if level is ObligationLevel.NOT_APPLICABLE:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.NOT_APPLICABLE,
            reason=EvidenceReason.OBLIGATION_NOT_APPLICABLE,
            integrations=integrations,
            staleness=findings,
        )
    if not integrations:
        return _absent(kind, level, missing_reason=EvidenceReason.NO_INTEGRATION, findings=findings)
    if not any(integration.succeeded for integration in integrations):
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.FAILED,
            reason=EvidenceReason.INTEGRATION_FAILED,
            integrations=integrations,
            staleness=findings,
        )
    if findings:
        return ObligationEvidence(
            kind=kind,
            level=level,
            state=EvidenceState.STALE,
            reason=EvidenceReason.NOT_CURRENT,
            integrations=integrations,
            staleness=findings,
        )
    return ObligationEvidence(
        kind=kind,
        level=level,
        state=EvidenceState.SATISFIED,
        integrations=integrations,
    )


@traces(SWR.SWR_3207, SWR.SWR_3208)
def project_evidence(
    obligations: RequirementObligations,
    inputs: EvidenceInputs,
) -> EvidenceProjection:
    """The evidence picture for one requirement — pure over its inputs.

    ``satisfied`` requires evidence that exists *and* was verified. Evidence that
    exists but was not re-verified since the last relevant change is ``stale``,
    not ``satisfied``. A failing covering test is ``failed`` even when
    traceability is complete. An obligation the requirement does not owe is
    reported as not applicable rather than quietly counted as met.

    Raises ``ValueError`` when *obligations* and *inputs* describe different
    requirements: silently projecting one requirement's evidence onto another's
    obligations is the one failure mode a board could never notice.
    """
    if obligations.req_id != inputs.req_id:
        raise ValueError(
            f"obligations for {obligations.req_id} cannot be projected onto"
            f" {inputs.req_id}'s evidence",
        )
    projected = (
        _project_implementation(obligations.level_of(EvidenceKind.IMPLEMENTATION), inputs),
        _project_test(obligations.level_of(EvidenceKind.TEST), inputs),
        _project_verification(obligations.level_of(EvidenceKind.VERIFICATION), inputs),
        _project_execution(obligations.level_of(EvidenceKind.EXECUTION), inputs),
        _project_integration(obligations.level_of(EvidenceKind.INTEGRATION), inputs),
    )
    return EvidenceProjection(req_id=inputs.req_id, obligations=projected, inputs=inputs)
