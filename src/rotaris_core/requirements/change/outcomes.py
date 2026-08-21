"""What an impact outcome actually causes (SWR-3504, SWR-3505, SWR-3506).

:mod:`~rotaris_core.requirements.change.impact` answers *what a change means*.
This module is what that answer costs — and the whole value of having six
outcomes instead of one is that they cost six different things:

```text
no behavioural impact        ─▶ verify the existing implementation
                                  └─ passed ─▶ adopt the new hash ─▶ Done
                                  └─ failed ─▶ stays Needs Update, feeds a new analysis
tests affected               ─▶ one unit, scoped to the covering tests
implementation affected      ─▶ one unit, scoped to the implementation
implementation and tests     ─▶ two units: the tests first, the implementation waiting on them
decomposition required       ─▶ hand off to SWR-3404; no unit is planned here
human clarification required ─▶ a concrete question, Blocked, and nothing else
```

Four properties are structural, because each of them is a way this could be
quietly wrong:

**The hash is adopted only after a passing verification (SWR-3504).**
:meth:`HashAdoption.after` is the *only* constructor of an adoption and it
refuses a :class:`Reverification` that did not pass. "The analysis said nothing
changed" is a claim about the requirement text; ``satisfied_hash`` is a claim
about the code, and only a verification can make the second one. A resolver with
no verifier therefore adopts nothing at all rather than trusting the judgement.

**No units for the two outcomes that must not produce work (SWR-3505).**
:class:`OutcomePlan` validates the mapping in both directions: units exist
exactly when the outcome costs a run, ``Ready`` is asked for exactly when units
exist, and ``no behavioural impact`` / ``human clarification required`` carry
neither.

**"Not classifiable" is its own state (SWR-3506).** A clarification does not fall
through to "keep it as it is" or "rebuild it": it becomes a
:class:`~rotaris_core.requirements.change.decisions.PendingDecision` whose
question has to be concrete and whose readings have to name what each would
imply, and the requirement waits in ``Blocked`` until somebody answers.

**Propagation terminates.** Every class here holds a transition door, an audit
sink and — at most — a verifier. None of them holds an analyst, so an outcome
cannot start the analysis that produced it; answering a clarification yields a
:class:`ReanalysisRequest` *value* that the caller may run, rather than a call
this module makes. :class:`ReentrancyGuard` closes the remaining door: a
collaborator that calls back into a pass in flight gets a
:class:`PropagationLoopError` instead of a second pass.

Pure with respect to the world apart from the injected collaborators: the clock
is an argument, the verifier is a protocol, and nothing here opens a file, spawns
a process or reaches a network.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.decisions import (
    DECISION_ACTOR,
    DecisionOption,
    DecisionOutcome,
    DecisionRecord,
    DecisionTrigger,
    HumanDecisions,
    PendingDecision,
    is_concrete_question,
)
from rotaris_core.requirements.change.detection import (
    PropagationLoopError,
    ReentrancyGuard,
)
from rotaris_core.requirements.change.impact import (
    ImpactOutcome,
    ImpactRequest,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import (
    TransitionOutcome,  # noqa: TC001 - Pydantic resolves this at runtime.
    TransitionRequest,
)
from rotaris_core.requirements.execution.context import ChangedSpecification
from rotaris_core.requirements.execution.units import UnitSpec

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.requirements.change.detection import AuditSink, TransitionDoor
    from rotaris_core.requirements.change.impact import ImpactAnalysis

__all__ = [
    "ADOPTION_ACTOR",
    "STRUCTURAL_READINGS",
    "UNIT_KEY_IMPLEMENTATION",
    "UNIT_KEY_TESTS",
    "AffectedSurface",
    "ClarificationAnswer",
    "ClarificationDesk",
    "HashAdoption",
    "NoImpactResolution",
    "NoImpactResolver",
    "OutcomeError",
    "OutcomePlan",
    "PropagationLoopError",
    "ReanalysisRequest",
    "ReentrancyGuard",
    "Reverification",
    "ReverificationRequest",
    "Reverifier",
    "clarification_for",
    "plan_outcome",
]

#: The sibling handle of the unit that owns a requirement's covering tests.
UNIT_KEY_TESTS = "tests"

#: The sibling handle of the unit that owns its implementation.
UNIT_KEY_IMPLEMENTATION = "implementation"

#: Who adopts a hash after a verification. Named rather than anonymous: the
#: audit trail must distinguish "a verification re-granted Done" from "a run
#: delivered it" and from "a user accepted it" (SWR-3203, SWR-3213).
ADOPTION_ACTOR = DeliveryActor.system("change-propagation")


class OutcomeError(RuntimeError):
    """An outcome was turned into work that the outcome does not permit.

    Not a :class:`ValueError`: several of these are raised inside Pydantic
    validators, where a ``ValueError`` is folded into a ``ValidationError``
    whose message buries the sentence a caller has to read.
    """


# --------------------------------------------------------------------------
# Which sites a change actually puts in question (SWR-3505)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3505)
class AffectedSurface(BaseModel):
    """The traces and tests one change puts in question — not the whole surface.

    SWR-3505's second acceptance criterion is about *scope*: a unit told "this
    requirement has 14 traces, good luck" is the generic run the six outcomes
    exist to replace. So the analyst's own words are read for site references,
    and only sites that already exist in the request are accepted —
    :attr:`narrowed` says whether that produced anything, and an un-narrowed
    kind falls back to the whole surface *visibly* rather than silently.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    traces: tuple[str, ...] = ()
    tests: tuple[str, ...] = ()
    #: Whether the analyst named any site at all. ``False`` means both lists are
    #: the requirement's whole surface, which is a weaker claim and says so.
    narrowed: bool = False

    @property
    def empty(self) -> bool:
        """Whether the change puts no known site in question."""
        return not (self.traces or self.tests)

    @property
    def summary(self) -> str:
        """``2 trace(s), 1 test(s) — named by the analysis``."""
        how = "named by the analysis" if self.narrowed else "the requirement's whole surface"
        return f"{len(self.traces)} trace(s), {len(self.tests)} test(s) — {how}"

    # No ``@traces`` decorator on this method: inside the class body the name
    # ``traces`` is the *field* above, not the annotation helper. The class
    # itself carries the annotation.
    @classmethod
    def named_in(cls, analysis: ImpactAnalysis, request: ImpactRequest) -> Self:
        """The sites *analysis* referred to, resolved against *request*'s surface.

        A site counts as affected when the analyst mentioned it — by its full
        ``path:line`` address or by its path — in the reasoning, in what it
        says it considered, or in the question it asked. Nothing is invented: a
        site the request does not already know about is ignored, so an analyst
        cannot point a unit at a file that does not exist.
        """
        mentions = "\n".join((analysis.reasoning, analysis.question, *analysis.considered))
        picked_traces = tuple(site for site in request.traces if _mentions(mentions, site))
        picked_tests = tuple(site for site in request.tests if _mentions(mentions, site))
        return cls(
            traces=picked_traces or request.traces,
            tests=picked_tests or request.tests,
            narrowed=bool(picked_traces or picked_tests),
        )


def _mentions(text: str, site: str) -> bool:
    """Whether *text* refers to *site*, by full address or by path. Pure."""
    if not site:
        return False
    if site in text:
        return True
    path = site.rsplit(":", 1)[0]
    return bool(path) and path in text


# --------------------------------------------------------------------------
# Outcome → units (SWR-3505) and outcome → question (SWR-3506)
# --------------------------------------------------------------------------


#: The two readings a clarification always has when the analyst named none of its
#: own. Not invented content: it is exactly the fork the analysis failed to
#: resolve, and offering it is what keeps SWR-3506's "which two readings" true
#: even for an analyst that only managed to say "I do not know".
STRUCTURAL_READINGS: tuple[DecisionOption, ...] = (
    DecisionOption(
        name="behavioural",
        consequence=(
            "the implementation and its covering tests are updated, which costs an"
            " agent run and can change existing behaviour"
        ),
        detail="the edit changed what the system must do",
    ),
    DecisionOption(
        name="editorial",
        consequence=(
            "no code is changed; the existing implementation is verified against the"
            " new text and the new hash is adopted if it passes"
        ),
        detail="the edit changed only how the requirement is worded",
    ),
)


@traces(SWR.SWR_3505, SWR.SWR_3506)
class OutcomePlan(BaseModel):
    """What one decided analysis causes: the units, the state, or the question.

    Every acceptance criterion of SWR-3505 is a validator here rather than a
    line of prose, because the failure mode is a *plausible* plan — two units
    for a reworded sentence, a ``Ready`` card with nothing to run, a
    clarification that quietly created work anyway. Each of those is
    unrepresentable.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    outcome: ImpactOutcome
    units: tuple[UnitSpec, ...] = ()
    #: The delivery state this plan asks for, or ``None`` when it asks for none.
    target: DeliveryState | None = None
    #: SWR-3404 has to split the requirement before anything can be planned.
    decomposition_required: bool = False
    #: The existing implementation has to be verified against the new text.
    verification_required: bool = False
    #: The question, when the outcome is that nobody can tell (SWR-3506).
    clarification: PendingDecision | None = None
    affected: AffectedSurface = AffectedSurface()
    #: What every created unit is handed as agent context (SWR-3407).
    specification: ChangedSpecification = ChangedSpecification()

    @model_validator(mode="after")
    def _the_outcome_decides(self) -> Self:
        if bool(self.units) != self.outcome.costs_a_run:
            raise OutcomeError(
                f"{self.req_id}: {self.outcome} "
                + ("must not create units" if self.units else "creates units")
                + " (SWR-3505)",
            )
        if (self.target is DeliveryState.READY) != bool(self.units):
            raise OutcomeError(
                f"{self.req_id}: a requirement moves to Ready exactly when there are"
                " units to run (SWR-3505)",
            )
        if (self.clarification is not None) != (
            self.outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED
        ):
            raise OutcomeError(
                f"{self.req_id}: a question belongs to human-clarification-required and"
                " to nothing else (SWR-3506)",
            )
        if self.verification_required != (self.outcome is ImpactOutcome.NO_BEHAVIOURAL_IMPACT):
            raise OutcomeError(
                f"{self.req_id}: only no-behavioural-impact is resolved by verifying the"
                " existing implementation (SWR-3504)",
            )
        if self.decomposition_required != (self.outcome is ImpactOutcome.DECOMPOSITION_REQUIRED):
            raise OutcomeError(
                f"{self.req_id}: decomposition is SWR-3404's answer to"
                " decomposition-required, and to nothing else",
            )
        if self.clarification is not None and self.clarification.req_id != self.req_id:
            raise OutcomeError(
                f"{self.req_id}: the question asks about {self.clarification.req_id}",
            )
        self._check_pairing()
        return self

    def _check_pairing(self) -> None:
        """The two-unit shape of a changed acceptance condition (SWR-3505)."""
        if self.outcome is not ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED:
            return
        handles = [spec.handle for spec in self.units]
        if handles != [UNIT_KEY_TESTS, UNIT_KEY_IMPLEMENTATION]:
            raise OutcomeError(
                f"{self.req_id}: implementation-and-tests-affected produces exactly a"
                f" {UNIT_KEY_TESTS} unit and an {UNIT_KEY_IMPLEMENTATION} unit; got {handles}",
            )
        implementation = self.units[1]
        if implementation.depends_on != (UNIT_KEY_TESTS,):
            raise OutcomeError(
                f"{self.req_id}: the implementation unit waits for the test unit — the"
                " changed acceptance condition is written down before it is satisfied",
            )

    @property
    def creates_work(self) -> bool:
        """Whether an agent run follows from this plan."""
        return bool(self.units)

    @property
    def blocks(self) -> bool:
        """Whether the requirement waits for a person before anything happens."""
        return self.clarification is not None

    def unit(self, handle: str) -> UnitSpec | None:
        """The planned unit with that handle, or ``None``."""
        return next((spec for spec in self.units if spec.handle == handle), None)

    @property
    def message(self) -> str:
        """One line: what was decided, and what it costs."""
        if self.clarification is not None:
            return f"{self.req_id}: {self.outcome} — {self.clarification.question}"
        if self.decomposition_required:
            return f"{self.req_id}: {self.outcome} — SWR-3404 splits it before anything runs"
        if not self.units:
            return f"{self.req_id}: {self.outcome} — no unit; the existing work is verified"
        return (
            f"{self.req_id}: {self.outcome} — {len(self.units)} unit(s)"
            f" over {self.affected.summary}"
        )


def _scope_line(what: str, sites: Sequence[str], surface: AffectedSurface) -> str:
    """The scope sentence a unit carries: what it owns, and where."""
    named = ", ".join(sites) if sites else "no site is recorded yet"
    how = "named by the impact analysis" if surface.narrowed else "the whole recorded surface"
    return f"{what}: {named} ({how})"


@traces(SWR.SWR_3505, SWR.SWR_3407)
def _specification_for(request: ImpactRequest, surface: AffectedSurface) -> ChangedSpecification:
    """The changed-specification element every created unit is handed (SWR-3407).

    Built from the request rather than re-read: the diff the agent sees and the
    diff the analysis judged are then the same bytes by construction, which is
    what stops an agent from working on a version nobody analysed.
    """
    return ChangedSpecification(
        diff="\n".join(request.diff),
        old_hash=request.before.content_hash,
        new_hash=request.after.content_hash,
        affected_traces=surface.traces,
        affected_tests=surface.tests,
    )


@traces(SWR.SWR_3506)
def clarification_for(
    analysis: ImpactAnalysis,
    request: ImpactRequest,
    *,
    at: dt.datetime,
    by: DeliveryActor = DECISION_ACTOR,
    readings: Sequence[DecisionOption] = (),
    trigger: DecisionTrigger = DecisionTrigger.CONTRADICTORY_REQUIREMENTS,
) -> PendingDecision:
    """The question a ``human clarification required`` outcome puts to a person.

    The question is the analyst's own when it asked one that can be answered;
    otherwise it is composed from facts the analysis *does* have — the
    requirement, both hashes and the size of the diff — so the block never
    degrades to "unclear requirement" (SWR-3506's first acceptance criterion).
    The readings default to :data:`STRUCTURAL_READINGS`, the fork the analysis
    failed to resolve, so there are always two named alternatives with their
    consequences.
    """
    question = analysis.question.strip()
    if not is_concrete_question(question):
        question = (
            f"{request.req_id}: the impact analysis could not decide what the change from"
            f" {request.before.content_hash or 'the delivered version'} to"
            f" {request.after.content_hash or 'the current version'}"
            f" ({len(request.diff)} diff line(s)) means."
            " Which reading is meant?"
        )
    return PendingDecision.raised(
        request.req_id,
        trigger,
        question=question,
        options=tuple(readings) or STRUCTURAL_READINGS,
        at=at,
        by=by,
        requirement_hash=request.after.content_hash,
        detail=analysis.reasoning,
    )


@traces(SWR.SWR_3505, SWR.SWR_3504, SWR.SWR_3506)
def plan_outcome(
    analysis: ImpactAnalysis,
    request: ImpactRequest,
    *,
    at: dt.datetime,
    by: DeliveryActor = DECISION_ACTOR,
    readings: Sequence[DecisionOption] = (),
) -> OutcomePlan | None:
    """The work *analysis* causes, or ``None`` when it caused none. Pure.

    ``None`` is the answer for an analysis that reached no outcome at all: a
    failed analysis leaves the requirement in ``Needs Update`` with the failure
    visible (SWR-3503) and must not be turned into work, because "the model was
    unreachable" is not a statement about the requirement.

    Everything else maps to exactly one shape, and the shapes are checked by
    :class:`OutcomePlan` rather than by this function being careful.
    """
    outcome = analysis.outcome
    if outcome is None:
        return None
    surface = AffectedSurface.named_in(analysis, request)
    specification = _specification_for(request, surface)
    tests_unit = UnitSpec(
        key=UNIT_KEY_TESTS,
        title=f"Update the covering tests of {request.req_id}",
        scope=_scope_line("Covering tests put in question", surface.tests, surface),
    )
    implementation_unit = UnitSpec(
        key=UNIT_KEY_IMPLEMENTATION,
        title=f"Update the implementation of {request.req_id}",
        scope=_scope_line("Implementation sites put in question", surface.traces, surface),
    )

    units: tuple[UnitSpec, ...]
    if outcome is ImpactOutcome.TESTS_AFFECTED:
        units = (tests_unit,)
    elif outcome is ImpactOutcome.IMPLEMENTATION_AFFECTED:
        units = (implementation_unit,)
    elif outcome is ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED:
        # The test unit lands first and the implementation waits for it: the
        # changed acceptance condition is what will judge the implementation, so
        # writing it down afterwards would mean judging the work against itself.
        units = (
            tests_unit,
            UnitSpec(
                key=UNIT_KEY_IMPLEMENTATION,
                title=implementation_unit.title,
                scope=implementation_unit.scope,
                depends_on=(UNIT_KEY_TESTS,),
            ),
        )
    else:
        units = ()

    return OutcomePlan(
        req_id=request.req_id,
        outcome=outcome,
        units=units,
        target=DeliveryState.READY if units else None,
        decomposition_required=outcome is ImpactOutcome.DECOMPOSITION_REQUIRED,
        verification_required=outcome is ImpactOutcome.NO_BEHAVIOURAL_IMPACT,
        clarification=(
            clarification_for(analysis, request, at=at, by=by, readings=readings)
            if outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED
            else None
        ),
        affected=surface,
        specification=specification,
    )


# --------------------------------------------------------------------------
# No behavioural impact: verify, then adopt (SWR-3504)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3504)
class ReverificationRequest(BaseModel):
    """What a verification of an *existing* implementation is asked to check.

    Values only, and deliberately no workspace and no branch: this verification
    runs the requirement's existing covering tests against the requirement's new
    text. There is no code change to make, so there is nothing for a worktree to
    isolate (SWR-3504's fourth acceptance criterion).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The version the implementation is being verified *against* (SWR-3107).
    requirement_hash: str = ""
    #: The version the delivery currently claims (SWR-3204).
    satisfied_hash: str | None = None
    traces: tuple[str, ...] = ()
    tests: tuple[str, ...] = ()

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise OutcomeError("a verification names the requirement it is about")
        return cleaned

    @classmethod
    def of(cls, request: ImpactRequest) -> Self:
        """The verification the change described by *request* asks for."""
        return cls(
            req_id=request.req_id,
            requirement_hash=request.after.content_hash,
            satisfied_hash=request.before.content_hash or None,
            traces=request.traces,
            tests=request.tests,
        )


@traces(SWR.SWR_3504)
class Reverification(BaseModel):
    """What a verification of the existing implementation answered.

    ``run_id`` is mandatory even for a failure: SWR-3504 records *which run*
    verified an adoption, and a verdict that cannot name the run that produced
    it is a claim rather than evidence. A failure that names no failing check
    and no detail is refused for the same reason — "it failed" is not a result
    a later analysis can be fed.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    passed: bool
    run_id: str
    at: dt.datetime
    #: The commit the suite ran against (SWR-3410). ``None`` stays visible.
    commit: str | None = None
    #: The covering tests the suite actually executed, as ``path`` or
    #: ``path:line`` — the evidence an adoption is recorded with (SWR-3213).
    tests: tuple[str, ...] = ()
    failed_checks: tuple[str, ...] = ()
    detail: str = ""

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise OutcomeError("a verification carries an aware timestamp, never a naive one")
        return value

    @field_validator("req_id", "run_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise OutcomeError(
                "a verification names the requirement it checked and the run that"
                " checked it (SWR-3504)",
            )
        return cleaned

    @model_validator(mode="after")
    def _stated(self) -> Self:
        if self.passed and self.failed_checks:
            raise OutcomeError(
                f"{self.req_id}: a passing verification has no failing checks;"
                f" got {list(self.failed_checks)}",
            )
        if not self.passed and not (self.failed_checks or self.detail.strip()):
            raise OutcomeError(
                f"{self.req_id}: a failed verification names what failed — it is the"
                " input to the next analysis (SWR-3504)",
            )
        return self

    @property
    def failure(self) -> str:
        """One line naming what did not pass. Empty for a passing verification."""
        if self.passed:
            return ""
        checks = ", ".join(self.failed_checks)
        detail = self.detail.strip()
        if checks and detail:
            return f"{checks} ({detail})"
        return checks or detail


@runtime_checkable
class Reverifier(Protocol):
    """Whatever runs a requirement's existing checks against its new text.

    One method taking a value and answering a value, so the whole decision path
    is exercised against three lines of fake and never reaches a process. The
    real implementation is SWR-3410's unit verification; this module never
    learns which, and — crucially — the protocol has no way to *change* code,
    because the outcome it serves is the one where nothing may be changed.
    """

    def verify(self, request: ReverificationRequest) -> Reverification:
        """Run the checks and answer whether they passed."""
        ...


@traces(SWR.SWR_3504)
class HashAdoption(BaseModel):
    """The new version being recorded as the delivered one, after a verification.

    :meth:`after` is the only constructor, and it refuses a verification that
    did not pass. That is SWR-3504's first acceptance criterion expressed as a
    type: there is no code path in this package that produces an adoption from
    an analysis alone, so a wrong "no behavioural impact" verdict cannot by
    itself move a requirement back to ``Done``.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The version now recorded as satisfied (SWR-3204).
    adopted_hash: str
    #: The version it replaces, kept so the audit line reads as a move.
    previous_hash: str | None = None
    #: The run whose verification earned the adoption (SWR-3504).
    verified_by_run: str
    verified_commit: str | None = None
    at: dt.datetime
    source_revision: str | None = None

    @field_validator("adopted_hash", "verified_by_run")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise OutcomeError(
                "an adoption names the version it adopted and the run that verified it (SWR-3504)",
            )
        return cleaned

    @classmethod
    @traces(SWR.SWR_3504)
    def after(cls, verification: Reverification, *, request: ImpactRequest) -> Self:
        """The adoption *verification* earned — refused unless it passed.

        The guard, in one place. Calling this with a failed verification is a
        programming error rather than a recoverable condition: every caller in
        this module asks :attr:`Reverification.passed` first, and one that did
        not would be exactly the bug SWR-3504 exists to prevent.
        """
        if not verification.passed:
            raise OutcomeError(
                f"{verification.req_id}: the new hash is adopted only after a passing"
                f" verification, never on the analysis alone — {verification.failure}"
                " (SWR-3504)",
            )
        return cls(
            req_id=request.req_id,
            adopted_hash=request.after.content_hash,
            previous_hash=request.before.content_hash or None,
            verified_by_run=verification.run_id,
            verified_commit=verification.commit,
            at=verification.at,
            source_revision=request.after.source_revision,
        )

    @traces(SWR.SWR_3504, SWR.SWR_3204)
    def as_delivery(self) -> SatisfiedDelivery:
        """This adoption as the delivery record ``Done`` stores (SWR-3204)."""
        return SatisfiedDelivery(
            req_id=self.req_id,
            satisfied_hash=self.adopted_hash,
            run_id=self.verified_by_run,
            satisfied_at=self.at,
            verified_commit=self.verified_commit,
            source_revision=self.source_revision,
        )

    @property
    def message(self) -> str:
        """One line: which version was adopted, on whose evidence."""
        commit = f" at {self.verified_commit}" if self.verified_commit else ""
        return (
            f"{self.req_id}: {self.previous_hash or 'the delivered version'} →"
            f" {self.adopted_hash} adopted after run {self.verified_by_run} verified it{commit}"
        )


@traces(SWR.SWR_3504)
class NoImpactResolution(BaseModel):
    """What a ``no behavioural impact`` outcome actually did.

    Both halves are representable and neither is inferred from the other: an
    adoption that happened, or a failure that did not adopt and that is handed
    on as :attr:`next_analysis` — the input to the analysis SWR-3504 asks for
    when a "nothing changed" verdict turns out to be wrong.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: ``None`` when no verifier was configured, so nothing was verified.
    verification: Reverification | None = None
    adoption: HashAdoption | None = None
    outcome: TransitionOutcome | None = None
    event: AuditEvent | None = None
    #: The re-analysis a failed verification asks for. A value, never a call:
    #: this package does not run analyses, which is why propagation terminates.
    next_analysis: ImpactRequest | None = None

    @model_validator(mode="after")
    def _adoption_needs_a_pass(self) -> Self:
        if self.adoption is not None and not (
            self.verification is not None and self.verification.passed
        ):
            raise OutcomeError(
                f"{self.req_id}: an adoption without a passing verification is exactly"
                " what SWR-3504 forbids",
            )
        return self

    @property
    def adopted(self) -> bool:
        """Whether the new hash is now the delivered one."""
        return self.outcome is not None and self.outcome.accepted and self.adoption is not None

    @property
    def message(self) -> str:
        """One line for the board and the log."""
        if self.verification is None:
            return (
                f"{self.req_id}: no verifier is configured, so the existing"
                " implementation was never checked and no hash was adopted"
            )
        if not self.verification.passed:
            return (
                f"{self.req_id}: the existing implementation does not satisfy the new"
                f" text ({self.verification.failure}); it stays in Needs Update"
            )
        if self.outcome is not None and not self.outcome.accepted:
            return self.outcome.message
        return self.adoption.message if self.adoption is not None else f"{self.req_id}: verified"


@traces(SWR.SWR_3504, SWR.SWR_3213)
class NoImpactResolver:
    """Verify the existing implementation, and only then adopt the new hash.

    The order is the requirement. :meth:`resolve_plan` verifies first, asks
    :meth:`HashAdoption.after` second and the state machine third, and there is
    no branch that reverses those. A resolver with no verifier adopts nothing —
    "nobody checked" and "it passed" are different facts and only one of them
    earns ``Done`` (the same rule SWR-3215 applies to the completion gate).

    **It cannot change code.** The constructor takes a transition door, an audit
    sink and a verifier; none of them can edit an implementation, which is
    SWR-3504's fourth acceptance criterion made structural rather than promised.

    **It cannot loop.** It holds no analyst, so the failure path produces a
    :class:`ImpactRequest` value instead of running one, and
    :class:`ReentrancyGuard` refuses a nested :meth:`resolve_plan`.
    """

    def __init__(
        self,
        transitions: TransitionDoor,
        *,
        verifier: Reverifier | None = None,
        audit: AuditSink | None = None,
        actor: DeliveryActor = ADOPTION_ACTOR,
    ) -> None:
        self._transitions = transitions
        self._verifier = verifier
        self._audit = audit
        self._actor = actor
        self._guard = ReentrancyGuard(f"{type(self).__name__}.resolve_plan")

    @property
    def actor(self) -> DeliveryActor:
        """Who this resolver acts as."""
        return self._actor

    @property
    def can_verify(self) -> bool:
        """Whether a verifier is configured at all."""
        return self._verifier is not None

    @traces(SWR.SWR_3504)
    def adoption_request(self, adoption: HashAdoption, *, at: dt.datetime) -> TransitionRequest:
        """The ``Done`` transition an adoption asks for.

        Exposed because it is the half a reviewer checks: the delivery it
        carries names the verifying run and the verified commit, so the record
        of a re-granted ``Done`` says *what* re-granted it rather than leaving
        the previous run to look like it delivered a version it never saw
        (SWR-3204, SWR-3214).
        """
        return TransitionRequest(
            req_id=adoption.req_id,
            target=DeliveryState.DONE,
            actor=self._actor,
            # ``Needs Update → Done`` travels the re-verification door (SWR-3222)
            # and no other. ``specification-changed`` is what took the requirement
            # out of Done in the first place; reusing it here would make one cause
            # open the edge in both directions.
            cause=TransitionCause.REVERIFIED,
            at=at,
            requirement_hash=adoption.adopted_hash,
            delivery=adoption.as_delivery(),
            run_id=adoption.verified_by_run,
            detail=adoption.message,
        )

    @traces(SWR.SWR_3504, SWR.SWR_3505)
    def resolve_plan(
        self,
        plan: OutcomePlan,
        request: ImpactRequest,
        *,
        at: dt.datetime,
    ) -> NoImpactResolution:
        """Verify the existing implementation for a ``no behavioural impact`` plan.

        The **only** entry point, and the reason it exists: a resolver that
        re-granted ``Done`` for an ``implementation affected`` plan would adopt a
        hash for code nobody has written yet. Which outcome this belongs to is
        checked here rather than remembered at every call site — and the
        verifying half is private (:meth:`_resolve`), so there is no second door
        that skips the check. A caller holding a passing verifier can therefore
        not re-grant ``Done`` for a requirement no analysis ever looked at.
        """
        if not plan.verification_required:
            raise OutcomeError(
                f"{plan.req_id}: {plan.outcome} is not resolved by verifying the existing"
                " implementation; only no-behavioural-impact is (SWR-3504)",
            )
        if plan.req_id != request.req_id:
            raise OutcomeError(
                f"{plan.req_id}: the plan and the request are about different requirements"
                f" ({request.req_id})",
            )
        return self._resolve(request, at=at)

    @traces(SWR.SWR_3504)
    def _resolve(self, request: ImpactRequest, *, at: dt.datetime) -> NoImpactResolution:
        """Verify, then adopt — or state why nothing was adopted.

        Private: reaching this without an analysis that said *no behavioural
        impact* is the one call :meth:`resolve_plan` exists to prevent, and a
        public twin that skipped the check would be the call site somebody
        eventually writes.

        Three paths and the order between them is the point:

        1. **no verifier** — nothing is verified and nothing is adopted;
        2. **verification failed** — the requirement stays where it is and the
           failure becomes :attr:`NoImpactResolution.next_analysis`;
        3. **verification passed** — the adoption is built, the state machine is
           asked for ``Done``, and only an accepted move is recorded.
        """
        with self._guard:
            if self._verifier is None:
                return NoImpactResolution(req_id=request.req_id)
            verification = self._verifier.verify(ReverificationRequest.of(request))
            if verification.req_id != request.req_id:
                raise OutcomeError(
                    f"{request.req_id}: the verification answered for {verification.req_id!r}",
                )
            if not verification.passed:
                return NoImpactResolution(
                    req_id=request.req_id,
                    verification=verification,
                    next_analysis=_reanalysis_of(request, verification),
                )
            adoption = HashAdoption.after(verification, request=request)
            outcome = self._transitions.apply(self.adoption_request(adoption, at=at))
            if not outcome.accepted:
                return NoImpactResolution(
                    req_id=request.req_id,
                    verification=verification,
                    adoption=adoption,
                    outcome=outcome,
                )
            return NoImpactResolution(
                req_id=request.req_id,
                verification=verification,
                adoption=adoption,
                outcome=outcome,
                event=self._record(adoption, verification, outcome, at=at),
            )

    def _record(
        self,
        adoption: HashAdoption,
        verification: Reverification,
        outcome: TransitionOutcome,
        *,
        at: dt.datetime,
    ) -> AuditEvent | None:
        """The ``verification`` entry that proves the adoption was earned."""
        if self._audit is None:
            return None
        transition = outcome.transition
        return self._audit.append(
            AuditEvent(
                req_id=adoption.req_id,
                kind=AuditEventKind.VERIFICATION,
                at=at,
                actor=self._actor,
                from_state=transition.source if transition is not None else None,
                to_state=DeliveryState.DONE,
                cause=TransitionCause.SPECIFICATION_CHANGED,
                reason=adoption.message,
                requirement_hash=adoption.adopted_hash,
                satisfied_hash=adoption.adopted_hash,
                run_id=adoption.verified_by_run,
                commit=adoption.verified_commit,
                tests=verification.tests,
                verified=True,
                evidence=(
                    f"no behavioural impact; verified by run {verification.run_id}",
                    f"previous satisfied hash: {adoption.previous_hash or 'none'}",
                ),
                detail=str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
            ),
        )


def _reanalysis_of(request: ImpactRequest, verification: Reverification) -> ImpactRequest:
    """The analysis a failed verification asks for. Pure.

    The same two versions and the same sites, with the failure recorded as the
    evidence token — so the next analysis reads "the code does not satisfy this
    text and here is what broke" rather than starting from the same blank page
    that produced the wrong verdict.
    """
    return ImpactRequest.between(
        request.before,
        request.after,
        traces=request.traces,
        tests=request.tests,
        evidence=f"verification-failed: {verification.failure}",
        delivering_run=verification.run_id,
        verified_commit=verification.commit,
    )


# --------------------------------------------------------------------------
# An unclear change asks rather than guesses (SWR-3506)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3506)
class ReanalysisRequest(BaseModel):
    """The analysis an answered question asks for — a value, never a call.

    This is where propagation is *made* to terminate. Answering a clarification
    could easily be implemented as "and then analyse again", and one analysis
    that answered ``human clarification required`` a second time would produce
    an endless alternation of question and analysis. Handing the caller a value
    means each cycle needs a human act to continue.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    request: ImpactRequest
    #: The question that was asked and the answer that came back, in one line —
    #: the analyst's new input (SWR-3506's third acceptance criterion).
    because: str
    answered_at: dt.datetime

    @property
    def message(self) -> str:
        """One line: what will be re-analysed and why."""
        return f"{self.req_id}: re-analysed because {self.because}"


@traces(SWR.SWR_3506)
class ClarificationAnswer(BaseModel):
    """What answering a clarification produced.

    The delivery record is deliberately absent from this value: SWR-3506's
    fourth acceptance criterion is that a block leaves the previous delivery
    untouched, and the way to guarantee that is for the clarification path to
    have nothing that could write one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    pending: PendingDecision
    record: DecisionRecord
    reanalysis: ReanalysisRequest
    outcome: TransitionOutcome | None = None
    event: AuditEvent | None = None

    @property
    def message(self) -> str:
        """One line: the answer, and what it triggers."""
        return f"{self.record.message}; {self.reanalysis.message}"


@traces(SWR.SWR_3506)
class ClarificationDesk:
    """Ask the question, keep the work stopped, and re-open it on an answer.

    Composed from :class:`~rotaris_core.requirements.change.decisions.HumanDecisions`
    rather than reimplementing it: a clarification *is* one of SWR-3512's
    decision points, and having two ways to block a requirement on a question is
    how two surfaces end up disagreeing about what was asked.

    **Nothing here creates a unit or a run.** :meth:`ask` moves a delivery state
    and appends a record; :meth:`answer` records the answer and returns a
    :class:`ReanalysisRequest`. Neither holds a unit store, a scheduler or an
    analyst, so "no execution unit and no run while the question is open" is a
    property of what this class *has* rather than of what it remembers not to do.
    """

    def __init__(
        self,
        transitions: TransitionDoor,
        *,
        audit: AuditSink | None = None,
        actor: DeliveryActor = DECISION_ACTOR,
    ) -> None:
        self._decisions = HumanDecisions(transitions, audit=audit, actor=actor)
        self._guard = ReentrancyGuard(f"{type(self).__name__}.ask")

    @property
    def actor(self) -> DeliveryActor:
        """Who raises the question."""
        return self._decisions.actor

    @traces(SWR.SWR_3506)
    def ask(self, plan: OutcomePlan) -> DecisionOutcome:
        """Block *plan*'s requirement on its question.

        Refuses a plan that has no question: a clarification desk that could be
        handed a ``tests affected`` plan and would block it anyway is a way to
        stop work for no stated reason.
        """
        pending = plan.clarification
        if pending is None:
            raise OutcomeError(
                f"{plan.req_id}: {plan.outcome} is not a question; only"
                " human-clarification-required is asked (SWR-3506)",
            )
        with self._guard:
            return self._decisions.raise_for(pending)

    @traces(SWR.SWR_3506)
    def answer(
        self,
        pending: PendingDecision,
        option: str,
        request: ImpactRequest,
        *,
        by: DeliveryActor,
        at: dt.datetime,
        rationale: str = "",
        resume_to: DeliveryState | None = None,
    ) -> ClarificationAnswer:
        """Record the answer and hand back the analysis it asks for.

        Both the question and the answer are recorded — the question travelled
        into the audit trail when the block was raised, and the answer goes in
        here with its actor and its time (SWR-3506, SWR-3512).
        """
        outcome = self._decisions.answer(
            pending,
            option,
            by=by,
            at=at,
            rationale=rationale,
            resume_to=resume_to,
        )
        record = outcome.record
        if record is None:  # pragma: no cover - HumanDecisions.answer always records one
            raise OutcomeError(f"{pending.req_id}: the answer was not recorded")
        return ClarificationAnswer(
            pending=pending,
            record=record,
            reanalysis=ReanalysisRequest(
                req_id=pending.req_id,
                request=request,
                because=f"{pending.question} — answered {record.chosen}: {record.consequence}",
                answered_at=at,
            ),
            outcome=outcome.outcome,
            event=outcome.event,
        )
