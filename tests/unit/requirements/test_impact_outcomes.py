"""Productive use: a delivered requirement was edited, the impact analysis has answered,
and Rotaris now has to turn that answer into exactly the right amount of work — no code run
for a reworded sentence, a test unit and an implementation unit for a changed acceptance
condition, and a stated question for a change nobody can read.
Expected outcome: each outcome produces its own unit shape and no other; a requirement
reaches Ready only when there are units to run; the new hash is adopted only after a
verification passed, never on the analysis alone, and the adoption names the verifying run
and its commit; a failing verification leaves the requirement where it is and hands the
failure on as the input to a new analysis; and an unreadable change blocks with a concrete
question, two named readings and their consequences, without creating a unit or a run.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.decisions import (
    DecisionOption,
    DecisionTrigger,
    is_concrete_question,
)
from rotaris_core.requirements.change.impact import (
    ImpactAnalysis,
    ImpactAnalyzer,
    ImpactOutcome,
    ImpactRequest,
    RequirementVersion,
)
from rotaris_core.requirements.change.outcomes import (
    STRUCTURAL_READINGS,
    UNIT_KEY_IMPLEMENTATION,
    UNIT_KEY_TESTS,
    AffectedSurface,
    ClarificationDesk,
    HashAdoption,
    NoImpactResolver,
    OutcomeError,
    OutcomePlan,
    PropagationLoopError,
    Reverification,
    ReverificationRequest,
    clarification_for,
    plan_outcome,
)
from rotaris_core.requirements.change.propagation import analyser_free_report
from rotaris_core.requirements.delivery.audit import AuditEventKind
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord
from rotaris_core.requirements.delivery.transitions import (
    RefusalKind,
    TransitionOutcome,
    TransitionRefusal,
    UnmetCondition,
    apply_transition,
)
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from rotaris_core.requirements.delivery.audit import AuditEvent
    from rotaris_core.requirements.delivery.transitions import TransitionRequest

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
DELIVERED_HASH = "aaaa111122223333"
RUN = "run-17"
COMMIT = "c0ffee1234"
VERIFY_RUN = "run-41"
VERIFY_COMMIT = "beadfeed99"
AT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(hours=3)
PERSONA = "impact-analyst"
MODEL = "scripted-analyst-1"
RUNNER = DeliveryActor.system("requirement-runner")
REVIEWER = DeliveryActor.user("dvf")

BEFORE_TEXT = "The user signs in with an email and a password."
AFTER_TEXT = (
    "The user signs in with an email and a password.\n\n"
    "A sixth failed attempt locks the account for fifteen minutes."
)

LOGIN_TRACE = "src/pkg/login.py:41"
LOCKOUT_TRACE = "src/pkg/lockout.py:12"
LOGIN_TEST = "tests/unit/test_login.py:12"
LOCKOUT_TEST = "tests/unit/test_lockout.py:30"


def version(text: str, *, revision: str = "r1", req_hash: str = "") -> RequirementVersion:
    """One requirement version, as a source read produces it."""
    built = RequirementVersion.of(
        CanonicalRequirement(
            req_id=REQ,
            title="Log in",
            description=text,
            lifecycle=RequirementLifecycle.APPROVED,
            source_id="reqtocode",
            source_revision=revision,
        ),
    )
    return built if not req_hash else built.model_copy(update={"content_hash": req_hash})


def request_for(before: str = BEFORE_TEXT, after: str = AFTER_TEXT) -> ImpactRequest:
    """The analysis request for the change from *before* to *after*."""
    return ImpactRequest.between(
        version(before, revision="r1"),
        version(after, revision="r2"),
        traces=(LOGIN_TRACE, LOCKOUT_TRACE),
        tests=(LOGIN_TEST, LOCKOUT_TEST),
        evidence="satisfied",
        delivering_run=RUN,
        verified_commit=COMMIT,
    )


class ScriptedAnalyst:
    """An impact analyst that answers a fixed payload and counts its calls."""

    def __init__(self, payload: Mapping[str, object]) -> None:
        self._payload = payload
        self.requests: list[ImpactRequest] = []

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        self.requests.append(request)
        return self._payload


def analysis_of(
    outcome: ImpactOutcome,
    *,
    reasoning: str = "the acceptance criterion moved",
    considered: Sequence[str] = (),
    question: str = "",
    request: ImpactRequest | None = None,
) -> ImpactAnalysis:
    """The analysis a scripted analyst produces for *outcome*."""
    analyst = ScriptedAnalyst(
        {
            "outcome": str(outcome),
            "reasoning": reasoning,
            "considered": list(considered),
            "question": question,
        },
    )
    analyzer = ImpactAnalyzer(
        model=analyst,
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    )
    return analyzer.analyse(request if request is not None else request_for())


def no_impact_plan() -> OutcomePlan:
    """The ``no behavioural impact`` plan a resolver is only reachable through.

    :meth:`NoImpactResolver.resolve_plan` is the single public entry point, so a
    caller holding a passing verifier cannot adopt a new hash for a requirement
    no analysis ever looked at. Every resolver test therefore comes through here.
    """
    plan = plan_outcome(analysis_of(ImpactOutcome.NO_BEHAVIOURAL_IMPACT), request_for(), at=AT)
    assert plan is not None
    return plan


def verification(
    *,
    passed: bool = True,
    failed_checks: Sequence[str] = (),
    detail: str = "",
) -> Reverification:
    """One verification of the existing implementation."""
    return Reverification(
        req_id=REQ,
        passed=passed,
        run_id=VERIFY_RUN,
        at=LATER,
        commit=VERIFY_COMMIT,
        tests=(LOGIN_TEST,),
        failed_checks=tuple(failed_checks),
        detail=detail,
    )


class ScriptedVerifier:
    """A re-verifier that answers a fixed verdict and records what it was asked."""

    def __init__(self, verdict: Reverification) -> None:
        self._verdict = verdict
        self.requests: list[ReverificationRequest] = []

    def verify(self, request: ReverificationRequest) -> Reverification:
        self.requests.append(request)
        return self._verdict


def record_in(state: DeliveryState, *, delivered: bool = True) -> DeliveryRecord:
    """A delivery record in *state*, with the delivery that stands behind it."""
    status = (
        DeliveryStatus()
        if state is DeliveryState.BACKLOG
        else DeliveryStatus(
            state=state,
            changed_at=AT,
            changed_by=RUNNER,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            requirement_hash=DELIVERED_HASH,
        )
    )
    entries = (
        (
            SatisfiedDelivery(
                req_id=REQ,
                satisfied_hash=DELIVERED_HASH,
                run_id=RUN,
                satisfied_at=AT,
                verified_commit=COMMIT,
            ),
        )
        if delivered
        else ()
    )
    return DeliveryRecord(req_id=REQ, delivery=status, satisfied=SatisfiedLog(entries=entries))


class StateMachineDoor:
    """The real state machine (SWR-3203) over records held in memory.

    Not a mock: :func:`apply_transition` decides, so a move this test reports as
    accepted is one the product would accept. The completion gate answers "every
    condition holds", because these tests are about the outcome, not SWR-3215.
    """

    def __init__(self, records: Sequence[DeliveryRecord]) -> None:
        self.records = {record.req_id: record for record in records}
        self.requests: list[TransitionRequest] = []

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        self.requests.append(request)
        record = self.records[request.req_id]
        outcome = apply_transition(record, request, completion=lambda _r, _q: ())
        if outcome.accepted:
            self.records[request.req_id] = outcome.record
        return outcome


class RefusingDoor:
    """A state machine that refuses everything, with a stated precondition."""

    def __init__(self, record: DeliveryRecord) -> None:
        self._record = record
        self.requests: list[TransitionRequest] = []

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        self.requests.append(request)
        return TransitionOutcome(
            record=self._record,
            refusal=TransitionRefusal(
                kind=RefusalKind.COMPLETION_CONDITIONS_UNMET,
                req_id=request.req_id,
                source=self._record.state,
                target=request.target,
                actor=request.actor,
                precondition="every completion condition holds",
                unmet=(UnmetCondition(name="covering-test-passed", detail="it did not run"),),
            ),
        )


class Trail:
    """An audit sink that keeps what it was given (SWR-3213)."""

    def __init__(self) -> None:
        self.events: list[AuditEvent] = []

    def append(self, event: AuditEvent) -> AuditEvent:
        self.events.append(event)
        return event


# --------------------------------------------------------------------------
# The outcome-to-unit mapping (SWR-3505)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3505)
def test_tests_affected_creates_one_unit_over_the_test_surface() -> None:
    """A test-only change must not put the implementation at risk."""
    request = request_for()
    plan = plan_outcome(analysis_of(ImpactOutcome.TESTS_AFFECTED), request, at=AT)

    assert plan is not None
    assert [spec.handle for spec in plan.units] == [UNIT_KEY_TESTS]
    assert plan.units[0].depends_on == ()
    assert plan.target is DeliveryState.READY
    assert not plan.verification_required
    assert not plan.decomposition_required


@verifies(SWR.SWR_3505)
def test_implementation_affected_creates_one_unit_over_the_implementation() -> None:
    """The behaviour moved and the existing tests still describe it."""
    plan = plan_outcome(
        analysis_of(ImpactOutcome.IMPLEMENTATION_AFFECTED),
        request_for(),
        at=AT,
    )

    assert plan is not None
    assert [spec.handle for spec in plan.units] == [UNIT_KEY_IMPLEMENTATION]
    assert plan.units[0].depends_on == ()


@verifies(SWR.SWR_3505)
def test_a_changed_acceptance_condition_creates_both_units_with_the_dependency() -> None:
    """The ordinary shape: the test that judges the work lands before the work."""
    plan = plan_outcome(
        analysis_of(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED),
        request_for(),
        at=AT,
    )

    assert plan is not None
    assert [spec.handle for spec in plan.units] == [UNIT_KEY_TESTS, UNIT_KEY_IMPLEMENTATION]
    tests_unit = plan.unit(UNIT_KEY_TESTS)
    implementation = plan.unit(UNIT_KEY_IMPLEMENTATION)
    assert tests_unit is not None
    assert implementation is not None
    assert tests_unit.depends_on == ()
    assert implementation.depends_on == (UNIT_KEY_TESTS,)
    assert plan.target is DeliveryState.READY


@verifies(SWR.SWR_3505, SWR.SWR_3404)
def test_decomposition_required_plans_no_unit_and_hands_off() -> None:
    """Too large for one run: SWR-3404 splits it before anything is planned here."""
    plan = plan_outcome(
        analysis_of(ImpactOutcome.DECOMPOSITION_REQUIRED),
        request_for(),
        at=AT,
    )

    assert plan is not None
    assert plan.units == ()
    assert plan.decomposition_required
    assert plan.target is None
    assert "SWR-3404" in plan.message


@pytest.mark.parametrize(
    "outcome",
    [ImpactOutcome.NO_BEHAVIOURAL_IMPACT, ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED],
)
@verifies(SWR.SWR_3505)
def test_the_two_no_work_outcomes_create_no_unit_and_never_reach_ready(
    outcome: ImpactOutcome,
) -> None:
    """SWR-3505's fourth acceptance criterion, for both outcomes it names."""
    plan = plan_outcome(
        analysis_of(outcome, question="Does the sixth attempt count the current one?"),
        request_for(),
        at=AT,
    )

    assert plan is not None
    assert plan.units == ()
    assert plan.target is not DeliveryState.READY
    assert not plan.creates_work


@verifies(SWR.SWR_3505)
def test_units_name_the_affected_sites_rather_than_the_whole_surface() -> None:
    """A unit told "this requirement has four sites" re-discovers the three that are fine."""
    request = request_for()
    plan = plan_outcome(
        analysis_of(
            ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED,
            reasoning=f"only the lockout path moves: {LOCKOUT_TRACE}",
            considered=(f"the covering test {LOCKOUT_TEST} asserts the old limit",),
        ),
        request,
        at=AT,
    )

    assert plan is not None
    assert plan.affected.narrowed
    assert plan.affected.traces == (LOCKOUT_TRACE,)
    assert plan.affected.tests == (LOCKOUT_TEST,)
    implementation = plan.unit(UNIT_KEY_IMPLEMENTATION)
    assert implementation is not None
    assert LOCKOUT_TRACE in implementation.scope
    assert LOGIN_TRACE not in implementation.scope


@verifies(SWR.SWR_3505)
def test_an_analysis_that_named_no_site_falls_back_visibly_to_the_whole_surface() -> None:
    """ "Not narrowed" is a weaker claim and the plan says so rather than pretending."""
    plan = plan_outcome(
        analysis_of(
            ImpactOutcome.IMPLEMENTATION_AFFECTED,
            reasoning="the behaviour changed",
        ),
        request_for(),
        at=AT,
    )

    assert plan is not None
    assert not plan.affected.narrowed
    assert plan.affected.traces == (LOGIN_TRACE, LOCKOUT_TRACE)
    assert "whole recorded surface" in plan.affected.summary or not plan.affected.narrowed


@verifies(SWR.SWR_3505)
def test_an_analyst_cannot_point_a_unit_at_a_site_that_does_not_exist() -> None:
    """Only sites the request already knows about are accepted — nothing is invented."""
    surface = AffectedSurface.named_in(
        analysis_of(
            ImpactOutcome.IMPLEMENTATION_AFFECTED,
            reasoning="rewrite src/pkg/imaginary.py:1 instead",
        ),
        request_for(),
    )

    assert "src/pkg/imaginary.py:1" not in surface.traces
    assert surface.traces == (LOGIN_TRACE, LOCKOUT_TRACE)
    assert not surface.narrowed


@verifies(SWR.SWR_3505, SWR.SWR_3407)
def test_every_created_unit_is_handed_the_diff_and_the_affected_sites() -> None:
    """SWR-3407's changed-specification element, built from the analysed request."""
    request = request_for()
    plan = plan_outcome(
        analysis_of(
            ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED,
            reasoning=f"{LOCKOUT_TRACE} and {LOCKOUT_TEST} carry the limit",
        ),
        request,
        at=AT,
    )

    assert plan is not None
    assert plan.specification.diff == "\n".join(request.diff)
    assert "fifteen minutes" in plan.specification.diff
    assert plan.specification.old_hash == request.before.content_hash
    assert plan.specification.new_hash == request.after.content_hash
    assert plan.specification.affected_traces == (LOCKOUT_TRACE,)
    assert plan.specification.affected_tests == (LOCKOUT_TEST,)


@verifies(SWR.SWR_3505, SWR.SWR_3503)
def test_an_analysis_that_reached_no_outcome_plans_nothing() -> None:
    """An outage is not a statement about the requirement, so it becomes no work."""
    analyzer = ImpactAnalyzer(clock=lambda: AT)
    failed = analyzer.analyse(request_for())

    assert not failed.decided
    assert plan_outcome(failed, request_for(), at=AT) is None


@verifies(SWR.SWR_3505)
def test_a_plan_that_claims_ready_without_units_is_not_representable() -> None:
    """The acceptance criteria are validators, not a convention callers follow."""
    with pytest.raises(OutcomeError, match="Ready exactly when there are"):
        OutcomePlan(
            req_id=REQ,
            outcome=ImpactOutcome.NO_BEHAVIOURAL_IMPACT,
            target=DeliveryState.READY,
            verification_required=True,
        )


@verifies(SWR.SWR_3505)
def test_a_reworded_requirement_cannot_be_given_units() -> None:
    """No behavioural impact costs no run; a plan saying otherwise is refused."""
    from rotaris_core.requirements.execution.units import UnitSpec

    with pytest.raises(OutcomeError, match="must not create units"):
        OutcomePlan(
            req_id=REQ,
            outcome=ImpactOutcome.NO_BEHAVIOURAL_IMPACT,
            units=(UnitSpec(key=UNIT_KEY_TESTS, title="rewrite everything"),),
            target=DeliveryState.READY,
            verification_required=True,
        )


# --------------------------------------------------------------------------
# No behavioural impact: verify first, adopt second (SWR-3504)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3504)
def test_a_hash_is_never_adopted_on_the_analysis_alone() -> None:
    """The only constructor of an adoption refuses a verification that failed."""
    with pytest.raises(OutcomeError, match="only after a passing verification"):
        HashAdoption.after(
            verification(passed=False, failed_checks=("pytest",), detail="2 failed"),
            request=request_for(),
        )


@verifies(SWR.SWR_3504)
def test_a_passing_verification_adopts_the_new_hash_and_returns_to_done() -> None:
    """The whole point: a rewording costs a verification, not a code run."""
    request = request_for()
    review = record_in(DeliveryState.REVIEW)
    door = StateMachineDoor([review])
    trail = Trail()
    verifier = ScriptedVerifier(verification())
    resolver = NoImpactResolver(door, verifier=verifier, audit=trail)

    resolution = resolver.resolve_plan(no_impact_plan(), request, at=LATER)

    assert resolution.adopted
    assert resolution.adoption is not None
    assert resolution.adoption.adopted_hash == request.after.content_hash
    assert resolution.adoption.verified_by_run == VERIFY_RUN
    assert resolution.adoption.verified_commit == VERIFY_COMMIT
    stored = door.records[REQ]
    assert stored.state is DeliveryState.DONE
    assert stored.satisfied_hash == request.after.content_hash
    # The previous delivery is kept, not replaced: the history says which run
    # built it and which run re-verified it (SWR-3204, SWR-3214).
    assert stored.satisfied.hashes == (DELIVERED_HASH, request.after.content_hash)
    assert verifier.requests[0].requirement_hash == request.after.content_hash


@verifies(SWR.SWR_3504, SWR.SWR_3213)
def test_the_adoption_records_which_run_verified_it_and_at_which_commit() -> None:
    """SWR-3504's second acceptance criterion, in the audit trail."""
    door = StateMachineDoor([record_in(DeliveryState.REVIEW)])
    trail = Trail()
    request = request_for()

    NoImpactResolver(door, verifier=ScriptedVerifier(verification()), audit=trail).resolve_plan(
        no_impact_plan(),
        request,
        at=LATER,
    )

    assert len(trail.events) == 1
    event = trail.events[0]
    assert event.kind is AuditEventKind.VERIFICATION
    assert event.verified
    assert event.run_id == VERIFY_RUN
    assert event.commit == VERIFY_COMMIT
    assert event.satisfied_hash == request.after.content_hash
    assert event.to_state is DeliveryState.DONE
    assert event.tests == (LOGIN_TEST,)


@verifies(SWR.SWR_3504)
def test_a_failing_verification_adopts_nothing_and_feeds_a_new_analysis() -> None:
    """ "Nothing changed" turned out to be wrong: the failure is the next input."""
    door = StateMachineDoor([record_in(DeliveryState.NEEDS_UPDATE)])
    trail = Trail()
    resolver = NoImpactResolver(
        door,
        verifier=ScriptedVerifier(
            verification(passed=False, failed_checks=("pytest",), detail="2 failed"),
        ),
        audit=trail,
    )

    resolution = resolver.resolve_plan(no_impact_plan(), request_for(), at=LATER)

    assert resolution.adoption is None
    assert not resolution.adopted
    assert door.requests == [], "no transition is attempted for a failed verification"
    assert trail.events == []
    assert door.records[REQ].state is DeliveryState.NEEDS_UPDATE
    assert door.records[REQ].satisfied_hash == DELIVERED_HASH
    follow_up = resolution.next_analysis
    assert follow_up is not None
    assert "verification-failed" in follow_up.evidence
    assert "pytest" in follow_up.evidence
    assert follow_up.before == request_for().before
    assert follow_up.after == request_for().after


@verifies(SWR.SWR_3504)
def test_without_a_verifier_nothing_is_verified_and_nothing_is_adopted() -> None:
    """ "Nobody checked" and "it passed" are different facts, and only one earns Done."""
    door = StateMachineDoor([record_in(DeliveryState.REVIEW)])
    resolver = NoImpactResolver(door)

    resolution = resolver.resolve_plan(no_impact_plan(), request_for(), at=LATER)

    assert not resolver.can_verify
    assert resolution.verification is None
    assert resolution.adoption is None
    assert door.requests == []
    assert door.records[REQ].state is DeliveryState.REVIEW
    assert "never checked" in resolution.message


@verifies(SWR.SWR_3504)
def test_a_refused_transition_adopts_no_hash_and_writes_no_audit_line() -> None:
    """The state machine still decides; a verification does not overrule it."""
    review = record_in(DeliveryState.REVIEW)
    door = RefusingDoor(review)
    trail = Trail()

    resolution = NoImpactResolver(
        door,
        verifier=ScriptedVerifier(verification()),
        audit=trail,
    ).resolve_plan(no_impact_plan(), request_for(), at=LATER)

    assert door.requests, "the transition was attempted"
    assert not resolution.adopted
    assert resolution.outcome is not None
    assert not resolution.outcome.accepted
    assert trail.events == []
    assert review.satisfied_hash == DELIVERED_HASH


@verifies(SWR.SWR_3504)
def test_a_failed_verification_that_names_nothing_is_refused() -> None:
    """ "It failed" is not a result the next analysis can be fed."""
    with pytest.raises(OutcomeError, match="names what failed"):
        Reverification(req_id=REQ, passed=False, run_id=VERIFY_RUN, at=LATER)


@verifies(SWR.SWR_3504)
def test_a_passing_verification_cannot_carry_failing_checks() -> None:
    """A green verdict with a red check in it is not a verdict."""
    with pytest.raises(OutcomeError, match="no failing checks"):
        Reverification(
            req_id=REQ,
            passed=True,
            run_id=VERIFY_RUN,
            at=LATER,
            failed_checks=("pytest",),
        )


@verifies(SWR.SWR_3504, SWR.SWR_3505)
def test_a_resolver_refuses_an_outcome_that_is_not_a_rewording() -> None:
    """Re-granting Done for an implementation-affected plan would adopt a lie."""
    plan = plan_outcome(
        analysis_of(ImpactOutcome.IMPLEMENTATION_AFFECTED),
        request_for(),
        at=AT,
    )
    assert plan is not None
    resolver = NoImpactResolver(
        StateMachineDoor([record_in(DeliveryState.REVIEW)]),
        verifier=ScriptedVerifier(verification()),
    )

    with pytest.raises(OutcomeError, match="not resolved by verifying"):
        resolver.resolve_plan(plan, request_for(), at=LATER)


@verifies(SWR.SWR_3504)
def test_a_rewording_plan_is_resolved_through_the_same_door() -> None:
    """The entry point a propagation pass uses, wired to the same verification."""
    plan = plan_outcome(
        analysis_of(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
        request_for(),
        at=AT,
    )
    assert plan is not None
    door = StateMachineDoor([record_in(DeliveryState.REVIEW)])
    resolver = NoImpactResolver(door, verifier=ScriptedVerifier(verification()))

    resolution = resolver.resolve_plan(plan, request_for(), at=LATER)

    assert resolution.adopted
    assert door.records[REQ].state is DeliveryState.DONE


@verifies(SWR.SWR_3504)
def test_the_adoption_request_carries_the_verifying_run_as_its_delivery() -> None:
    """The half a reviewer reads: what Done is being re-granted on."""
    request = request_for()
    resolver = NoImpactResolver(StateMachineDoor([record_in(DeliveryState.REVIEW)]))
    adoption = HashAdoption.after(verification(), request=request)

    transition = resolver.adoption_request(adoption, at=LATER)

    assert transition.target is DeliveryState.DONE
    assert transition.delivery is not None
    assert transition.delivery.satisfied_hash == request.after.content_hash
    assert transition.delivery.run_id == VERIFY_RUN
    assert transition.delivery.verified_commit == VERIFY_COMMIT
    assert transition.run_id == VERIFY_RUN


# --------------------------------------------------------------------------
# An unclear change asks rather than guesses (SWR-3506)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3506)
def test_the_block_states_a_concrete_question_even_when_the_analyst_did_not() -> None:
    """ "Unclear requirement" is not a question, so it is never what a user sees."""
    request = request_for()
    pending = clarification_for(
        analysis_of(
            ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED,
            reasoning="the two sentences contradict each other",
            question="unclear",
        ),
        request,
        at=AT,
    )

    assert is_concrete_question(pending.question)
    assert pending.question.casefold() != "unclear"
    assert REQ in pending.question
    assert request.after.content_hash in pending.question
    assert pending.waits_in is DeliveryState.BLOCKED


@verifies(SWR.SWR_3506)
def test_the_analysts_own_question_is_kept_when_it_can_be_answered() -> None:
    """A good question is not replaced by a generated one."""
    asked = "Does the sixth failed attempt include the one that triggered the lock?"
    pending = clarification_for(
        analysis_of(
            ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED,
            reasoning="the count is ambiguous",
            question=asked,
        ),
        request_for(),
        at=AT,
    )

    assert pending.question == asked


@verifies(SWR.SWR_3506)
def test_the_block_names_two_readings_and_what_each_would_imply() -> None:
    """SWR-3506's "which two readings are possible, and what each would imply"."""
    pending = clarification_for(
        analysis_of(ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED, question="unclear"),
        request_for(),
        at=AT,
    )

    assert len(pending.options) >= 2
    assert pending.option_names == tuple(option.name for option in STRUCTURAL_READINGS)
    for option in pending.options:
        assert option.consequence.strip()
    assert any("agent run" in option.consequence for option in pending.options)
    assert any("no code is changed" in option.consequence for option in pending.options)


@verifies(SWR.SWR_3506)
def test_readings_supplied_by_the_analysis_replace_the_structural_ones() -> None:
    """A model that *did* name the two readings is the better answer, and wins."""
    readings = (
        DecisionOption(name="count the trigger", consequence="the lock happens one attempt sooner"),
        DecisionOption(name="exclude the trigger", consequence="the lock happens as it does today"),
    )
    pending = clarification_for(
        analysis_of(ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED, question="unclear"),
        request_for(),
        at=AT,
        readings=readings,
        trigger=DecisionTrigger.UNCLEAR_SCOPE,
    )

    assert pending.option_names == ("count the trigger", "exclude the trigger")
    assert pending.trigger is DecisionTrigger.UNCLEAR_SCOPE


@verifies(SWR.SWR_3506)
def test_no_unit_and_no_run_exist_while_the_question_is_open() -> None:
    """The requirement waits in Blocked and nothing is scheduled behind it."""
    plan = plan_outcome(
        analysis_of(
            ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED,
            question="Does the sixth attempt include the one that locked it?",
        ),
        request_for(),
        at=AT,
    )

    assert plan is not None
    assert plan.units == ()
    assert plan.blocks
    assert not plan.creates_work
    assert plan.clarification is not None
    assert plan.clarification.waits_in is DeliveryState.BLOCKED


@verifies(SWR.SWR_3506, SWR.SWR_3204)
def test_the_block_leaves_the_previous_delivery_record_untouched() -> None:
    """SWR-3506's fourth acceptance criterion: a question is not a demotion."""
    needs_update = record_in(DeliveryState.NEEDS_UPDATE)
    door = StateMachineDoor([needs_update])
    trail = Trail()
    plan = plan_outcome(
        analysis_of(
            ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED,
            question="Does the sixth attempt include the one that locked it?",
        ),
        request_for(),
        at=AT,
    )
    assert plan is not None
    pending = plan.clarification
    assert pending is not None

    outcome = ClarificationDesk(door, audit=trail).ask(plan)

    assert outcome.moved
    stored = door.records[REQ]
    assert stored.state is DeliveryState.BLOCKED
    assert stored.satisfied.entries == needs_update.satisfied.entries
    assert stored.satisfied_hash == DELIVERED_HASH
    assert stored.delivery.blocked_reason == pending.question
    assert trail.events[0].evidence == pending.consequences


@verifies(SWR.SWR_3506)
def test_a_desk_refuses_to_block_a_plan_that_asked_no_question() -> None:
    """A desk that blocks anything handed to it stops work for no stated reason."""
    plan = plan_outcome(analysis_of(ImpactOutcome.TESTS_AFFECTED), request_for(), at=AT)
    assert plan is not None

    with pytest.raises(OutcomeError, match="is not a question"):
        ClarificationDesk(StateMachineDoor([record_in(DeliveryState.NEEDS_UPDATE)])).ask(plan)


@verifies(SWR.SWR_3506, SWR.SWR_3512)
def test_answering_records_the_question_and_the_answer_and_asks_for_a_re_analysis() -> None:
    """The answer is recorded with its actor and hands back the analysis to re-run."""
    blocked = record_in(DeliveryState.NEEDS_UPDATE)
    door = StateMachineDoor([blocked])
    trail = Trail()
    desk = ClarificationDesk(door, audit=trail)
    request = request_for()
    plan = plan_outcome(
        analysis_of(
            ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED,
            question="Does the sixth attempt include the one that locked it?",
        ),
        request,
        at=AT,
    )
    assert plan is not None
    pending = plan.clarification
    assert pending is not None
    desk.ask(plan)

    answered = desk.answer(
        pending,
        "behavioural",
        request,
        by=REVIEWER,
        at=LATER,
        rationale="the sixth attempt is the one that locks it",
        resume_to=DeliveryState.NEEDS_UPDATE,
    )

    assert answered.record.chosen == "behavioural"
    assert answered.record.answered_by == REVIEWER
    assert answered.record.answered_at == LATER
    assert answered.reanalysis.request == request
    assert pending.question in answered.reanalysis.because
    assert "behavioural" in answered.reanalysis.because
    assert door.records[REQ].state is DeliveryState.NEEDS_UPDATE
    assert pending.question in trail.events[-1].evidence


@verifies(SWR.SWR_3506)
def test_an_answer_naming_an_option_nobody_offered_is_refused() -> None:
    """A trail claiming the user chose something nobody proposed is worse than none."""
    from rotaris_core.requirements.change.decisions import DecisionError

    pending = clarification_for(
        analysis_of(ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED, question="unclear"),
        request_for(),
        at=AT,
    )

    with pytest.raises(DecisionError, match="not one of the options"):
        ClarificationDesk(StateMachineDoor([record_in(DeliveryState.NEEDS_UPDATE)])).answer(
            pending,
            "rewrite it in Rust",
            request_for(),
            by=REVIEWER,
            at=LATER,
        )


@verifies(SWR.SWR_3506)
def test_answering_a_question_does_not_run_an_analysis_by_itself() -> None:
    """Termination: a clarification hands back a value, it does not call an analyst."""
    door = StateMachineDoor([record_in(DeliveryState.NEEDS_UPDATE)])
    desk = ClarificationDesk(door)

    assert analyser_free_report(desk) == ()


# --------------------------------------------------------------------------
# Propagation terminates (Gate 4)
# --------------------------------------------------------------------------


class ReentrantDoor:
    """A door that calls back into the resolver that is using it.

    The loop Gate 4 asks about, built deliberately: a collaborator that reacts
    to a transition by starting another propagation pass.
    """

    def __init__(self) -> None:
        self.resolver: NoImpactResolver | None = None
        self.calls = 0

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        self.calls += 1
        assert self.resolver is not None
        self.resolver.resolve_plan(no_impact_plan(), request_for(), at=LATER)
        raise AssertionError("the nested pass should have been refused")


@verifies(SWR.SWR_3504)
def test_an_evaluation_cannot_trigger_an_evaluation() -> None:
    """One pass at a time, structurally — not by convention."""
    door = ReentrantDoor()
    resolver = NoImpactResolver(door, verifier=ScriptedVerifier(verification()))
    door.resolver = resolver

    with pytest.raises(PropagationLoopError, match="re-entered"):
        resolver.resolve_plan(no_impact_plan(), request_for(), at=LATER)

    assert door.calls == 1, "the second pass never reached the door"


@verifies(SWR.SWR_3504)
def test_the_guard_reopens_after_a_failed_pass() -> None:
    """A guard that stayed closed after one failure would be a deadlock."""

    class RaisingVerifier:
        def __init__(self) -> None:
            self.calls = 0

        def verify(self, request: ReverificationRequest) -> Reverification:
            del request
            self.calls += 1
            if self.calls == 1:
                raise TimeoutError("the suite did not finish")
            return verification()

    verifier = RaisingVerifier()
    door = StateMachineDoor([record_in(DeliveryState.REVIEW)])
    resolver = NoImpactResolver(door, verifier=verifier)

    with pytest.raises(TimeoutError):
        resolver.resolve_plan(no_impact_plan(), request_for(), at=LATER)

    assert resolver.resolve_plan(no_impact_plan(), request_for(), at=LATER).adopted
