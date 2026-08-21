"""Productive use: a reviewer drags a card onto Done. The run finished, but one covering
test never ran and the specification moved under it while the review was open.
Expected outcome: the card comes back with *every* unmet condition named — the test by
path, the two hashes side by side — the conditions are read at the moment of the drop
rather than when the board was drawn, an obligation-based exemption stays visible, and a
forced acceptance carries the actor who forced it."""

from __future__ import annotations

import datetime as dt

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    DeliveryActor,
    DeliveryRecord,
    DeliveryState,
    DeliveryStatus,
    RefusalKind,
    SatisfiedDelivery,
    TransitionCause,
    TransitionRequest,
    apply_transition,
)
from rotaris_core.requirements.delivery.completion import (
    CompletionCondition,
    CompletionEvidence,
    CompletionObligations,
    CompletionOverride,
    CompletionReport,
    ConditionOutcome,
    CoveringTestEvidence,
    RequiredEvidence,
    UnitEvidence,
    UnitExecution,
    completion_gate,
    evaluate_completion,
)

pytestmark = pytest.mark.unit

REQ = "SWR-3215"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
HASH = "hash-of-the-current-text"
USER = DeliveryActor.user("dvf")
SYSTEM = DeliveryActor.system("requirement-runner")


def complete_evidence(**changes: object) -> CompletionEvidence:
    """Evidence in which every completion condition holds, minus *changes*.

    Written once so each test can break exactly one thing and nothing else — the
    only way to show that a condition blocks *on its own*.
    """
    base = CompletionEvidence(
        req_id=REQ,
        current_hash=HASH,
        satisfied_hash=HASH,
        units=(UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),),
        implementation_traces=("src/rotaris_core/requirements/delivery/completion.py:120",),
        covering_tests=(
            CoveringTestEvidence(
                path="tests/unit/requirements/test_done_conditions.py",
                line=42,
                executed=True,
                passed=True,
            ),
        ),
        gate_passed=True,
        gate_detail="8 checks passed",
        integration_complete=False,
        blockers=(),
    )
    return base.model_copy(update=dict(changes)) if changes else base


def review_record(req_id: str = REQ) -> DeliveryRecord:
    """A requirement sitting in Review, waiting to be accepted."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.REVIEW,
            changed_at=AT,
            changed_by=SYSTEM,
            cause=TransitionCause.RUN_COMPLETED,
            requirement_hash=HASH,
        ),
    )


def done_request(*, satisfied_hash: str = HASH, actor: DeliveryActor = USER) -> TransitionRequest:
    """The attempt a reviewer's click makes."""
    return TransitionRequest(
        req_id=REQ,
        target=DeliveryState.DONE,
        actor=actor,
        cause=TransitionCause.COMPLETION_ACCEPTED,
        at=LATER,
        requirement_hash=HASH,
        delivery=SatisfiedDelivery(
            req_id=REQ,
            satisfied_hash=satisfied_hash,
            run_id="run-7",
            satisfied_at=LATER,
            verified_commit="c0ffee",
        ),
    )


def unmet_names(report: CompletionReport) -> set[str]:
    return {condition.name for condition in report.unmet}


@verifies(SWR.SWR_3215)
def test_every_condition_that_holds_is_answered_and_done_is_permitted() -> None:
    """The receipt case: nothing is unmet, and the report still lists every condition."""
    report = evaluate_completion(complete_evidence())

    assert report.complete
    assert report.unmet == ()
    assert {result.condition for result in report.results} == set(CompletionCondition)
    # Integration is not applicable to a single-unit requirement, and that is an
    # answer rather than a silent omission.
    integration = report.result_for(CompletionCondition.INTEGRATION_COMPLETE)
    assert integration is not None
    assert integration.outcome is ConditionOutcome.NOT_APPLICABLE
    assert "1 execution unit" in integration.detail


@pytest.mark.parametrize(
    ("broken", "expected"),
    [
        (
            {"units": (UnitEvidence(unit_id="unit-2", execution=UnitExecution.RUNNING),)},
            CompletionCondition.UNITS_FINISHED,
        ),
        ({"implementation_traces": ()}, CompletionCondition.IMPLEMENTATION_TRACES),
        ({"covering_tests": ()}, CompletionCondition.COVERING_TESTS),
        (
            {
                "covering_tests": (
                    CoveringTestEvidence(path="tests/unit/test_x.py", executed=False),
                ),
            },
            CompletionCondition.COVERING_TESTS_PASSED,
        ),
        ({"gate_passed": False, "gate_detail": ""}, CompletionCondition.COMPLETION_GATE),
        ({"satisfied_hash": "an-older-version"}, CompletionCondition.SATISFIED_HASH_CURRENT),
        ({"blockers": ("the upstream API is down",)}, CompletionCondition.NO_UNRESOLVED_BLOCKER),
    ],
)
@verifies(SWR.SWR_3215)
def test_each_condition_blocks_on_its_own_and_is_named(
    broken: dict[str, object],
    expected: CompletionCondition,
) -> None:
    """One broken fact, one named condition — never a bare "not allowed"."""
    report = evaluate_completion(complete_evidence(**broken))

    assert not report.complete
    assert unmet_names(report) == {str(expected)}
    named = report.unmet[0]
    assert named.detail, "an unmet condition carries what a user has to act on"
    assert str(expected) in named.message


@verifies(SWR.SWR_3215)
def test_the_integration_condition_applies_only_to_a_requirement_with_several_units() -> None:
    """One unit needs no integration; two do, and the unfinished integration is named."""
    two_units = complete_evidence(
        units=(
            UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),
            UnitEvidence(unit_id="unit-2", execution=UnitExecution.FINISHED),
        ),
    )

    refused = evaluate_completion(two_units)
    assert unmet_names(refused) == {str(CompletionCondition.INTEGRATION_COMPLETE)}

    integrated = evaluate_completion(two_units.model_copy(update={"integration_complete": True}))
    assert integrated.complete


@verifies(SWR.SWR_3215)
def test_an_abandoned_unit_does_not_hold_a_requirement_open_forever() -> None:
    """ "Non-abandoned" is the wording of SWR-3215 and it is load-bearing."""
    report = evaluate_completion(
        complete_evidence(
            units=(
                UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),
                UnitEvidence(unit_id="unit-2", execution=UnitExecution.ABANDONED),
            ),
        ),
    )

    assert report.complete
    assert report.outcome_of(CompletionCondition.UNITS_FINISHED) is ConditionOutcome.MET


@verifies(SWR.SWR_3215)
def test_every_unmet_condition_is_named_individually_never_summed() -> None:
    """Three things are wrong at once. The refusal names all three, each actionable."""
    report = evaluate_completion(
        complete_evidence(
            implementation_traces=(),
            covering_tests=(
                CoveringTestEvidence(path="tests/unit/test_a.py", executed=True, passed=False),
                CoveringTestEvidence(path="tests/unit/test_b.py", executed=False),
            ),
            satisfied_hash="the-version-the-run-started-from",
        ),
    )

    assert unmet_names(report) == {
        str(CompletionCondition.IMPLEMENTATION_TRACES),
        str(CompletionCondition.COVERING_TESTS_PASSED),
        str(CompletionCondition.SATISFIED_HASH_CURRENT),
    }
    tests = report.result_for(CompletionCondition.COVERING_TESTS_PASSED)
    assert tests is not None
    assert "tests/unit/test_a.py failed" in tests.detail
    assert "tests/unit/test_b.py did not run" in tests.detail
    versions = report.result_for(CompletionCondition.SATISFIED_HASH_CURRENT)
    assert versions is not None
    assert "the-version-the-run-started-from" in versions.detail
    assert HASH in versions.detail
    assert report.summary.count(";") == 2, "one sentence per unmet condition"


@verifies(SWR.SWR_3215)
def test_a_requirement_exempted_from_tests_reaches_done_and_the_exemption_is_visible() -> None:
    """Obligations decide what applies (SWR-3206); an exemption is part of the answer."""
    report = evaluate_completion(
        complete_evidence(covering_tests=()),
        obligations=RequiredEvidence(trace_required=True, test_required=False),
    )

    assert report.complete
    exempt = {str(result.condition) for result in report.exemptions}
    assert exempt == {
        str(CompletionCondition.COVERING_TESTS),
        str(CompletionCondition.COVERING_TESTS_PASSED),
    }
    assert all(result.detail for result in report.exemptions), "an exemption states its ground"
    assert "exempt" in report.summary


@verifies(SWR.SWR_3215)
def test_an_obligation_shaped_value_is_all_the_check_needs() -> None:
    """The obligations port is structural, so any value carrying the two flags fits."""
    assert isinstance(RequiredEvidence(), CompletionObligations)

    report = evaluate_completion(
        complete_evidence(implementation_traces=(), covering_tests=()),
        obligations=RequiredEvidence(trace_required=False, test_required=False),
    )

    assert report.complete


@verifies(SWR.SWR_3215)
def test_the_conditions_are_read_at_the_moment_of_the_transition() -> None:
    """Evidence gathered when the card was drawn is exactly what must not decide.

    The reader answers whatever is true *now*: the first attempt is refused for a
    test that had not run, and the second — same gate, same request — is accepted
    once it has, without anyone rebuilding the gate.
    """
    reads: list[str] = []
    live: list[CompletionEvidence] = [complete_evidence(covering_tests=())]

    def read(_record: DeliveryRecord, request: TransitionRequest) -> CompletionEvidence:
        reads.append(request.req_id)
        return live[-1]

    gate = completion_gate(read)
    record, request = review_record(), done_request()

    assert reads == [], "nothing is read before the transition is attempted"
    refused = apply_transition(record, request, completion=gate)
    assert reads == [REQ], "the evidence is read inside the transition"
    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.COMPLETION_CONDITIONS_UNMET
    assert {condition.name for condition in refused.refusal.unmet} == {
        str(CompletionCondition.COVERING_TESTS),
    }

    live.append(complete_evidence())
    accepted = apply_transition(record, request, completion=gate)

    assert accepted.accepted
    assert accepted.record.state is DeliveryState.DONE
    assert reads == [REQ, REQ]


@verifies(SWR.SWR_3215, SWR.SWR_3204)
def test_the_version_being_recorded_is_the_one_compared_against_the_specification() -> None:
    """The gate judges the hash this transition is about to store, not the last one.

    The delivering run's snapshot hash is folded in from the *request*, whatever
    the evidence reader answered. Keying on the reader instead would leave the
    re-delivery case open: a reader that fills ``satisfied_hash`` from the stored
    record — the obvious thing for an execution slice to do — would make the gate
    approve the previous delivery while this transition records an older version.
    """
    gate = completion_gate(lambda _record, _request: complete_evidence(satisfied_hash=None))

    accepted = apply_transition(review_record(), done_request(satisfied_hash=HASH), completion=gate)
    assert accepted.accepted

    stale = apply_transition(
        review_record(),
        done_request(satisfied_hash="what-the-run-started-from"),
        completion=gate,
    )
    assert stale.refusal is not None
    assert {condition.name for condition in stale.refusal.unmet} == {
        str(CompletionCondition.SATISFIED_HASH_CURRENT),
    }
    assert "what-the-run-started-from" in stale.refusal.message

    # The re-delivery: the record already carries a delivery of the current text,
    # and a reader that reports *that* one must not decide this transition.
    already_delivered = completion_gate(
        lambda record, _request: complete_evidence(satisfied_hash=record.satisfied_hash),
    )
    redelivered = review_record().evolve(
        satisfied=review_record().satisfied.appended(
            SatisfiedDelivery(req_id=REQ, satisfied_hash=HASH, run_id="run-1", satisfied_at=AT),
        ),
    )
    assert redelivered.satisfied_hash == HASH, "the stored delivery is the current version"

    outcome = apply_transition(
        redelivered,
        done_request(satisfied_hash="the-version-this-run-actually-saw"),
        completion=already_delivered,
    )

    assert not outcome.accepted, "the previous delivery may not approve this one"
    assert outcome.refusal is not None
    assert {condition.name for condition in outcome.refusal.unmet} == {
        str(CompletionCondition.SATISFIED_HASH_CURRENT),
    }
    assert "the-version-this-run-actually-saw" in outcome.refusal.message


@verifies(SWR.SWR_3215, SWR.SWR_3201)
def test_a_requirement_still_carrying_a_blocker_cannot_be_accepted() -> None:
    """The blocker lives on the record, so the gate reads it from there."""
    blocked = DeliveryRecord(
        req_id=REQ,
        delivery=DeliveryStatus(
            state=DeliveryState.BLOCKED,
            blocked_reason="the upstream API is down",
            blocked_from=DeliveryState.DONE,
            changed_at=AT,
            changed_by=USER,
            cause=TransitionCause.BLOCKER_RAISED,
        ),
    )
    gate = completion_gate(lambda _record, _request: complete_evidence())

    outcome = apply_transition(blocked, done_request(), completion=gate)

    assert outcome.refusal is not None
    assert {condition.name for condition in outcome.refusal.unmet} == {
        str(CompletionCondition.NO_UNRESOLVED_BLOCKER),
    }
    assert "the upstream API is down" in outcome.refusal.message


@verifies(SWR.SWR_3215)
def test_an_override_carries_its_actor_and_keeps_the_finding_it_forgave() -> None:
    """A forced Done is a decision with a name on it, not an erased condition."""
    override = CompletionOverride(
        actor=USER,
        reason="the covering test needs hardware that arrives on Monday",
        at=LATER,
        conditions=(CompletionCondition.COVERING_TESTS,),
    )
    reports: list[CompletionReport] = []
    gate = completion_gate(
        lambda _record, _request: complete_evidence(covering_tests=()),
        override_for=lambda _record, _request: override,
        on_report=reports.append,
    )

    outcome = apply_transition(review_record(), done_request(), completion=gate)

    assert outcome.accepted, "the override forgives the one condition it names"
    assert len(reports) == 1
    forgiven = reports[0].overridden
    assert [str(result.condition) for result in forgiven] == [
        str(CompletionCondition.COVERING_TESTS)
    ]
    assert "no test declares" in forgiven[0].detail, "the finding survives the override"
    assert reports[0].override is not None
    assert reports[0].override.actor == USER
    assert "dvf" in reports[0].override.message
    assert "hardware" in reports[0].override.message


@verifies(SWR.SWR_3215)
def test_an_override_only_forgives_the_conditions_it_names() -> None:
    """A narrow override is narrow: the conditions it does not name still refuse."""
    override = CompletionOverride(
        actor=USER,
        reason="accepted on the strength of the manual check",
        at=LATER,
        conditions=(CompletionCondition.COVERING_TESTS,),
    )

    report = evaluate_completion(
        complete_evidence(covering_tests=(), implementation_traces=()),
        override=override,
    )

    assert not report.complete
    assert unmet_names(report) == {str(CompletionCondition.IMPLEMENTATION_TRACES)}
    assert [str(result.condition) for result in report.overridden] == [
        str(CompletionCondition.COVERING_TESTS),
    ]


@verifies(SWR.SWR_3215)
def test_an_override_without_a_stated_reason_cannot_exist() -> None:
    """An unexplained override is indistinguishable from a bug."""
    with pytest.raises(ValidationError, match="states its reason"):
        CompletionOverride(actor=USER, reason="   ", at=LATER)

    with pytest.raises(ValidationError, match="aware timestamp"):
        CompletionOverride(actor=USER, reason="because", at=dt.datetime(2026, 8, 14, 12, 0))


@verifies(SWR.SWR_3215)
def test_a_completion_report_answers_each_condition_exactly_once() -> None:
    """Two answers for one condition would make "what is missing" unanswerable."""
    report = evaluate_completion(complete_evidence())
    doubled = (*report.results, report.results[0])

    with pytest.raises(ValidationError, match="exactly once"):
        CompletionReport(req_id=REQ, results=doubled)


@verifies(SWR.SWR_3215, SWR.SWR_3203)
def test_a_refusal_reaches_the_user_as_one_line_per_missing_condition() -> None:
    """What the card shows when it springs back."""
    gate = completion_gate(
        lambda _record, _request: complete_evidence(implementation_traces=(), gate_passed=False),
    )

    outcome = apply_transition(review_record(), done_request(), completion=gate)

    assert outcome.refusal is not None
    message = outcome.refusal.message
    assert "every completion condition holds" in message
    assert str(CompletionCondition.IMPLEMENTATION_TRACES) in message
    assert str(CompletionCondition.COMPLETION_GATE) in message
    assert outcome.record == review_record(), "a refusal changes nothing"
