"""Productive use: nobody touched the requirement — somebody deleted the test that proved
it, or refactored the module the trace lived in. The card is still green and the delivery
behind it is gone.
Expected outcome: a lost covering test takes its requirement out of Done and produces a
unit scoped to exactly the test that disappeared; the reason a user reads names the
evidence, never a specification change; no impact analysis of the requirement text runs at
all — the propagator cannot even hold an analyst; a specification-moved finding is left to
SWR-3502 rather than handled twice; and restoring the evidence costs a passing verification
before Done is granted again.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.impact import ImpactAnalyzer, ImpactRequest
from rotaris_core.requirements.change.outcomes import (
    UNIT_KEY_IMPLEMENTATION,
    UNIT_KEY_TESTS,
    PropagationLoopError,
    Reverification,
    ReverificationRequest,
)
from rotaris_core.requirements.change.propagation import (
    TEXT_REASONS,
    EvidenceAction,
    EvidencePropagation,
    EvidencePropagator,
    PropagationError,
    analyser_free_report,
    propagate_evidence,
)
from rotaris_core.requirements.delivery.audit import AuditEventKind
from rotaris_core.requirements.delivery.obligations import EvidenceKind
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.staleness import StalenessFinding, StalenessReason
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
    apply_transition,
)

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from rotaris_core.requirements.delivery.audit import AuditEvent
    from rotaris_core.requirements.delivery.transitions import TransitionRequest

pytestmark = pytest.mark.unit

REQ = "SWR-9101"
OTHER = "SWR-9102"
HASH = "1111aaaa2222bbbb"
RUN = "run-5"
COMMIT = "deadbeef01"
VERIFY_RUN = "run-9"
VERIFY_COMMIT = "0badc0de77"
AT = dt.datetime(2026, 8, 14, 8, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(days=1)
RUNNER = DeliveryActor.system("requirement-runner")

LOST_TEST = "tests/unit/test_basket.py"
LOST_TRACE = "src/pkg/basket.py"


def finding(reason: StalenessReason, subject: str, kind: EvidenceKind) -> StalenessFinding:
    """One staleness finding, as SWR-3209's rules produce them."""
    return StalenessFinding(kind=kind, reason=reason, subject=subject)


def lost_test() -> StalenessFinding:
    """The covering test that was recorded at verification time is not there now."""
    return finding(StalenessReason.COVERING_TEST_DISAPPEARED, LOST_TEST, EvidenceKind.TEST)


def trace_gone() -> StalenessFinding:
    """The implementation site that was recorded is not there now."""
    return finding(
        StalenessReason.TRACE_DISAPPEARED,
        LOST_TRACE,
        EvidenceKind.IMPLEMENTATION,
    )


def touched() -> StalenessFinding:
    """The implementation file was edited since the verification."""
    return finding(
        StalenessReason.IMPLEMENTATION_CHANGED,
        LOST_TRACE,
        EvidenceKind.IMPLEMENTATION,
    )


def specification_moved() -> StalenessFinding:
    """The requirement's own text moved — SWR-3502's cause, not this one's."""
    return finding(
        StalenessReason.SPECIFICATION_MOVED,
        "cccc3333",
        EvidenceKind.VERIFICATION,
    )


def verification(*, passed: bool = True, detail: str = "") -> Reverification:
    """One verification of the requirement's existing checks."""
    return Reverification(
        req_id=REQ,
        passed=passed,
        run_id=VERIFY_RUN,
        at=LATER,
        commit=VERIFY_COMMIT,
        failed_checks=() if passed else ("pytest",),
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


class CountingAnalyst:
    """An impact analyst that records every time somebody asks it anything."""

    def __init__(self) -> None:
        self.requests: list[ImpactRequest] = []

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        self.requests.append(request)
        return {"outcome": "implementation-affected", "reasoning": "asked"}


def record_in(state: DeliveryState, *, req_id: str = REQ, delivered: bool = True) -> DeliveryRecord:
    """A delivery record in *state*, with the delivery that stands behind it."""
    status = (
        DeliveryStatus()
        if state is DeliveryState.BACKLOG
        else DeliveryStatus(
            state=state,
            changed_at=AT,
            changed_by=RUNNER,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            requirement_hash=HASH,
        )
    )
    entries = (
        (
            SatisfiedDelivery(
                req_id=req_id,
                satisfied_hash=HASH,
                run_id=RUN,
                satisfied_at=AT,
                verified_commit=COMMIT,
            ),
        )
        if delivered
        else ()
    )
    return DeliveryRecord(req_id=req_id, delivery=status, satisfied=SatisfiedLog(entries=entries))


class StateMachineDoor:
    """The real state machine (SWR-3203) over records held in memory."""

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
                kind=RefusalKind.ILLEGAL_EDGE,
                req_id=request.req_id,
                source=self._record.state,
                target=request.target,
                actor=request.actor,
                precondition="the state machine has no edge between these states",
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
# Evidence causes drive the transitions (SWR-3513)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3513, SWR.SWR_3209)
def test_a_deleted_covering_test_takes_its_requirement_out_of_done() -> None:
    """SWR-3513's first acceptance criterion, and the whole reason it exists."""
    plan = propagate_evidence(REQ, (lost_test(),), state=DeliveryState.DONE)

    assert plan.action is EvidenceAction.RESTORE
    assert plan.leaves_done
    assert plan.target is DeliveryState.NEEDS_UPDATE
    assert plan.reasons == (StalenessReason.COVERING_TEST_DISAPPEARED,)
    assert plan.lost_tests == (LOST_TEST,)


@verifies(SWR.SWR_3513)
def test_the_reason_names_the_evidence_and_not_a_specification_change() -> None:
    """A user sent looking for an edit that never happened loses their afternoon."""
    plan = propagate_evidence(REQ, (lost_test(),), state=DeliveryState.DONE)

    assert LOST_TEST in plan.message
    assert "the requirement text did not change" in plan.message
    assert "specification" not in plan.message.casefold()
    assert f"lost covering test: {LOST_TEST}" in plan.causes


@verifies(SWR.SWR_3513, SWR.SWR_3505)
def test_a_lost_covering_test_produces_a_unit_scoped_to_that_test() -> None:
    """Not "SWR-9101 has fourteen tests" — the one that is gone."""
    plan = propagate_evidence(REQ, (lost_test(),), state=DeliveryState.DONE)

    assert [spec.handle for spec in plan.units] == [UNIT_KEY_TESTS]
    assert LOST_TEST in plan.units[0].scope
    assert plan.units[0].depends_on == ()


@verifies(SWR.SWR_3513)
def test_a_lost_trace_produces_an_implementation_unit() -> None:
    """A missing trace is missing implementation, not a missing test."""
    plan = propagate_evidence(REQ, (trace_gone(),), state=DeliveryState.DONE)

    assert [spec.handle for spec in plan.units] == [UNIT_KEY_IMPLEMENTATION]
    assert LOST_TRACE in plan.units[0].scope


@verifies(SWR.SWR_3513, SWR.SWR_3505)
def test_losing_both_restores_the_test_first_and_the_implementation_after_it() -> None:
    """The same dependency a changed acceptance condition gets, for the same reason."""
    plan = propagate_evidence(REQ, (lost_test(), trace_gone()), state=DeliveryState.DONE)

    assert [spec.handle for spec in plan.units] == [UNIT_KEY_TESTS, UNIT_KEY_IMPLEMENTATION]
    assert plan.units[1].depends_on == (UNIT_KEY_TESTS,)


@verifies(SWR.SWR_3513, SWR.SWR_3209)
def test_a_touched_file_is_re_verified_rather_than_declared_broken() -> None:
    """An edit under the evidence is a reason to check, not a reason to demote."""
    plan = propagate_evidence(REQ, (touched(),), state=DeliveryState.DONE)

    assert plan.action is EvidenceAction.REVERIFY
    assert plan.target is None
    assert not plan.leaves_done
    assert plan.units == ()


@verifies(SWR.SWR_3513)
def test_a_failing_verification_moves_it_out_of_done_with_the_failure_stated() -> None:
    """SWR-3513's second sentence: the failure is what a user reads."""
    plan = propagate_evidence(
        REQ,
        (touched(),),
        state=DeliveryState.DONE,
        verification=verification(passed=False, detail="2 failed"),
    )

    assert plan.action is EvidenceAction.REPORT_FAILURE
    assert plan.target is DeliveryState.NEEDS_UPDATE
    assert "pytest" in plan.failure
    assert "2 failed" in plan.failure
    assert "the verification failed" in plan.message
    assert plan.units == ()


@verifies(SWR.SWR_3513, SWR.SWR_3505)
def test_a_failed_verification_still_plans_the_units_for_what_is_gone() -> None:
    """The most informative case must not produce the least work.

    A requirement whose covering test disappeared *and* whose verification then
    failed knows exactly what has to happen: write that test back. Reporting the
    failure, naming the lost file and planning nothing would make the one case
    with the most information the one case that schedules nothing.

    The failure still wins the *label* — it is the strongest statement available
    about a delivery — but it does not make the missing file come back, so the
    units are tied to what is gone rather than to the action.
    """
    plan = propagate_evidence(
        REQ,
        (lost_test(), trace_gone()),
        state=DeliveryState.DONE,
        verification=verification(passed=False, detail="2 failed"),
    )

    assert plan.action is EvidenceAction.REPORT_FAILURE
    assert plan.target is DeliveryState.NEEDS_UPDATE
    assert plan.lost_tests == (LOST_TEST,)
    assert plan.lost_traces == (LOST_TRACE,)
    assert LOST_TEST in plan.message
    assert "the verification failed" in plan.message

    keys = [unit.key for unit in plan.units]
    assert keys == [UNIT_KEY_TESTS, UNIT_KEY_IMPLEMENTATION]
    # Exactly the same units a plain restore would have planned — scoped to the
    # sites that are gone, with the implementation waiting on the test.
    restore = propagate_evidence(REQ, (lost_test(), trace_gone()), state=DeliveryState.DONE)
    assert restore.action is EvidenceAction.RESTORE
    assert plan.units == restore.units

    # And a failure with nothing missing still plans nothing.
    only_failed = propagate_evidence(
        REQ,
        (touched(),),
        state=DeliveryState.DONE,
        verification=verification(passed=False, detail="2 failed"),
    )
    assert only_failed.action is EvidenceAction.REPORT_FAILURE
    assert only_failed.units == ()

    with pytest.raises(PropagationError, match="exactly the"):
        EvidencePropagation(
            req_id=REQ,
            action=EvidenceAction.REPORT_FAILURE,
            lost_tests=(LOST_TEST,),
            failure="pytest failed",
        )


@verifies(SWR.SWR_3513, SWR.SWR_3502)
def test_a_specification_move_is_left_to_the_hash_comparison() -> None:
    """Handling it here too would move one requirement twice for one cause."""
    plan = propagate_evidence(REQ, (specification_moved(),), state=DeliveryState.DONE)

    assert plan.action is EvidenceAction.NOTHING
    assert plan.reasons == ()
    assert plan.ignored == (StalenessReason.SPECIFICATION_MOVED,)
    assert plan.target is None
    assert StalenessReason.SPECIFICATION_MOVED in TEXT_REASONS
    assert len(TEXT_REASONS) == 1, "only the specification's own cause is left to SWR-3502"


@verifies(SWR.SWR_3513)
def test_an_evidence_plan_can_never_claim_a_specification_cause() -> None:
    """The two paths are kept apart by a validator, not by a convention."""
    with pytest.raises(PropagationError, match="answered by SWR-3502"):
        EvidencePropagation(
            req_id=REQ,
            action=EvidenceAction.REVERIFY,
            reasons=(StalenessReason.SPECIFICATION_MOVED,),
        )


@verifies(SWR.SWR_3513)
def test_stale_evidence_never_sends_a_requirement_back_to_backlog() -> None:
    """Delivered work whose evidence rotted has not become unbuilt work."""
    with pytest.raises(PropagationError, match="Needs Update or"):
        EvidencePropagation(
            req_id=REQ,
            action=EvidenceAction.REVERIFY,
            reasons=(StalenessReason.TEST_CHANGED,),
            target=DeliveryState.BACKLOG,
        )


@verifies(SWR.SWR_3513)
def test_a_requirement_that_was_not_done_gets_the_units_without_a_transition() -> None:
    """There is no Done to leave, and moving it to where it is says nothing."""
    plan = propagate_evidence(REQ, (lost_test(),), state=DeliveryState.NEEDS_UPDATE)

    assert plan.action is EvidenceAction.RESTORE
    assert plan.target is None
    assert plan.units


@verifies(SWR.SWR_3513)
def test_evidence_that_is_still_where_it_was_asks_for_nothing() -> None:
    """Safe to run on every evaluation: no findings, no plan, no write."""
    plan = propagate_evidence(REQ, (), state=DeliveryState.DONE)

    assert plan.action is EvidenceAction.NOTHING
    assert not plan.moves
    assert plan.units == ()


# --------------------------------------------------------------------------
# No text analysis runs for an evidence cause (SWR-3513)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3513, SWR.SWR_3503)
def test_no_impact_analysis_runs_for_an_evidence_only_cause() -> None:
    """SWR-3513's third acceptance criterion: the analyser is never invoked."""
    analyst = CountingAnalyst()
    ImpactAnalyzer(model=analyst, persona="impact-analyst", model_name="scripted")
    door = StateMachineDoor([record_in(DeliveryState.DONE)])
    propagator = EvidencePropagator(door, audit=Trail())

    outcomes = propagator.run([door.records[REQ]], {REQ: (lost_test(),)}, at=LATER)

    assert outcomes[0].moved
    assert analyst.requests == [], "no requirement text was judged"
    assert analyser_free_report(propagator) == (), "the pass cannot even hold an analyst"


@verifies(SWR.SWR_3513)
def test_the_structural_check_names_an_analyst_that_sneaked_in() -> None:
    """The guarantee is a check that can fail, not a comment that cannot."""

    class LeakyPropagator:
        def __init__(self) -> None:
            self._analyst = CountingAnalyst()

    assert analyser_free_report(LeakyPropagator()) == ("analyst.analyse",)


# --------------------------------------------------------------------------
# Applying it through the state machine and the trail (SWR-3513, SWR-3213)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3513, SWR.SWR_3213)
def test_the_audit_entry_carries_the_evidence_cause() -> None:
    """A history read months later has to say why the card stopped being green."""
    done = record_in(DeliveryState.DONE)
    door = StateMachineDoor([done])
    trail = Trail()

    outcome = EvidencePropagator(door, audit=trail).run(
        [done],
        {REQ: (lost_test(),)},
        at=LATER,
    )[0]

    assert outcome.moved
    assert door.records[REQ].state is DeliveryState.NEEDS_UPDATE
    assert door.records[REQ].satisfied_hash == HASH, "the delivery record is kept"
    event = trail.events[0]
    assert event.kind is AuditEventKind.DELIVERY_TRANSITION
    assert event.to_state is DeliveryState.NEEDS_UPDATE
    assert f"lost covering test: {LOST_TEST}" in event.evidence
    assert event.tests == (LOST_TEST,)
    assert event.detail == str(EvidenceAction.RESTORE)


@verifies(SWR.SWR_3513, SWR.SWR_3213)
def test_a_refused_move_leaves_no_audit_entry() -> None:
    """The trail must never claim something the state machine did not do."""
    done = record_in(DeliveryState.DONE)
    door = RefusingDoor(done)
    trail = Trail()

    outcome = EvidencePropagator(door, audit=trail).apply(
        propagate_evidence(REQ, (lost_test(),), state=DeliveryState.DONE),
        at=LATER,
    )

    assert door.requests, "the transition was attempted"
    assert outcome.refused
    assert trail.events == []


@verifies(SWR.SWR_3513)
def test_a_plan_that_asks_for_nothing_writes_nothing() -> None:
    """The property that makes this safe on every evaluation (SWR-3210)."""
    done = record_in(DeliveryState.DONE)
    door = StateMachineDoor([done])
    trail = Trail()

    outcomes = EvidencePropagator(door, audit=trail).run([done], {}, at=LATER)

    assert not outcomes[0].moved
    assert door.requests == []
    assert trail.events == []
    assert door.records[REQ].state is DeliveryState.DONE


@verifies(SWR.SWR_3513)
def test_a_pass_walks_every_record_once_in_id_order() -> None:
    """Finite by construction — nothing here can enqueue another record."""
    first = record_in(DeliveryState.DONE)
    second = record_in(DeliveryState.DONE, req_id=OTHER)
    door = StateMachineDoor([second, first])

    outcomes = EvidencePropagator(door).run(
        [second, first],
        {REQ: (lost_test(),), OTHER: (trace_gone(),)},
        at=LATER,
    )

    assert [outcome.plan.req_id for outcome in outcomes] == [REQ, OTHER]
    assert len(door.requests) == 2


# --------------------------------------------------------------------------
# The way back costs a verification (SWR-3513)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3513)
def test_restoring_the_evidence_returns_to_done_after_a_verification() -> None:
    """SWR-3513's fourth acceptance criterion: a file that exists is not a passing suite."""
    review = record_in(DeliveryState.REVIEW)
    door = StateMachineDoor([review])
    trail = Trail()
    verifier = ScriptedVerifier(verification())

    outcome = EvidencePropagator(door, audit=trail, verifier=verifier).restore(review, at=LATER)

    assert outcome.moved
    assert door.records[REQ].state is DeliveryState.DONE
    assert verifier.requests[0].requirement_hash == HASH
    # The requirement's text never moved, so the delivery that stands is
    # re-stated rather than replaced (SWR-3204).
    assert door.records[REQ].satisfied.hashes == (HASH, HASH)
    event = trail.events[-1]
    assert event.kind is AuditEventKind.VERIFICATION
    assert event.verified
    assert event.run_id == VERIFY_RUN
    assert event.commit == VERIFY_COMMIT
    assert "evidence is back" in event.reason


@verifies(SWR.SWR_3513)
def test_a_restore_whose_verification_fails_grants_nothing() -> None:
    """Restoring a deleted file proves the file exists, not that it passes."""
    review = record_in(DeliveryState.REVIEW)
    door = StateMachineDoor([review])
    trail = Trail()

    outcome = EvidencePropagator(
        door,
        audit=trail,
        verifier=ScriptedVerifier(verification(passed=False, detail="still red")),
    ).restore(review, at=LATER)

    assert not outcome.moved
    assert door.requests == []
    assert trail.events == []
    assert door.records[REQ].state is DeliveryState.REVIEW
    assert outcome.plan.action is EvidenceAction.REPORT_FAILURE
    assert "still red" in outcome.plan.failure


@verifies(SWR.SWR_3513)
def test_without_a_verifier_a_restore_grants_nothing() -> None:
    """ "Nobody checked" and "it passed" are different facts (SWR-3215)."""
    review = record_in(DeliveryState.REVIEW)
    door = StateMachineDoor([review])
    propagator = EvidencePropagator(door)

    outcome = propagator.restore(review, at=LATER)

    assert not propagator.can_verify
    assert not outcome.moved
    assert door.requests == []
    assert door.records[REQ].state is DeliveryState.REVIEW


@verifies(SWR.SWR_3513, SWR.SWR_3204)
def test_a_requirement_that_was_never_delivered_has_no_done_to_restore() -> None:
    """There is no version to re-state, and inventing one would claim a run."""
    never = record_in(DeliveryState.REVIEW, delivered=False)
    propagator = EvidencePropagator(
        StateMachineDoor([never]),
        verifier=ScriptedVerifier(verification()),
    )

    with pytest.raises(PropagationError, match="nothing was ever delivered"):
        propagator.restore(never, at=LATER)


# --------------------------------------------------------------------------
# Propagation terminates (Gate 4)
# --------------------------------------------------------------------------


class ReentrantDoor:
    """A door that reacts to a transition by starting another propagation pass."""

    def __init__(self, record: DeliveryRecord) -> None:
        self._record = record
        self.propagator: EvidencePropagator | None = None
        self.calls = 0

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        del request
        self.calls += 1
        assert self.propagator is not None
        self.propagator.apply(
            propagate_evidence(REQ, (lost_test(),), state=DeliveryState.DONE),
            at=LATER,
        )
        raise AssertionError("the nested pass should have been refused")


@verifies(SWR.SWR_3513)
def test_an_evidence_evaluation_cannot_trigger_an_evaluation() -> None:
    """Gate 4's last question, answered structurally rather than by convention."""
    door = ReentrantDoor(record_in(DeliveryState.DONE))
    propagator = EvidencePropagator(door)
    door.propagator = propagator

    with pytest.raises(PropagationLoopError, match="re-entered"):
        propagator.apply(
            propagate_evidence(REQ, (lost_test(),), state=DeliveryState.DONE),
            at=LATER,
        )

    assert door.calls == 1, "the second pass never reached the door"
