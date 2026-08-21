"""Productive use: a user scans a board of ninety cards and reads one word per card —
`Healthy`, `Needs Update`, `Verification Failed` — instead of decoding a lifecycle, a
delivery state and five obligations per requirement.
Expected outcome: the word is derived from those three axes by a total, documented
precedence order; every combination of inputs yields exactly one health; the inputs that
produced it come back with it; a requirement can be `approved` and `Verification Failed`
at the same time; and the health is never stored and never gates a transition."""

from __future__ import annotations

import datetime as dt
import itertools

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceProjection,
    EvidenceState,
    VerificationRecord,
    project_evidence,
)
from rotaris_core.requirements.delivery.health import (
    HEALTH_PRECEDENCE,
    HEALTH_RULES,
    DerivedHealth,
    HealthInputs,
    RequirementHealth,
    derive_health,
)
from rotaris_core.requirements.delivery.obligations import (
    EvidenceKind,
    ObligationLevel,
    resolve_obligations,
)
from rotaris_core.requirements.delivery.satisfied import SatisfactionState
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    DeliveryView,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

pytestmark = pytest.mark.unit

REQ = CanonicalRequirement(req_id="SWR-3211", title="Derived requirement health")
REQ_AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)


def covering(status: str = "passed", *, executed: bool = True) -> CoveringTest:
    """A covering test with a known outcome.

    *status* here means the **test's** own outcome, so the verdict follows it
    directly — these cases are about a requirement whose test really did fail,
    which is what a per-test report establishes (SWR-2606).
    """
    return CoveringTest(
        path="tests/unit/requirements/test_requirement_health.py",
        line=30,
        executed=executed,
        check_name="pytest" if executed else None,
        check_status=status if executed else None,
        verdict=("passed" if status == "passed" else "failed") if executed else "not_run",
    )


def projection(*, test_status: str = "passed", executed: bool = True) -> EvidenceProjection:
    """A fully-evidenced requirement whose covering test had *test_status*."""
    return project_evidence(
        resolve_obligations(REQ),
        EvidenceInputs(
            req_id=REQ.req_id,
            requirement_hash="hash-1",
            implementations=(RequirementSite(path="src/rotaris_core/module.py", line=12),),
            covering_tests=(covering(test_status, executed=executed),),
            verification=VerificationRecord(
                verdict="passed",
                commit="c0ffee123456",
                requirement_hash="hash-1",
                run_id="run-1",
            ),
        ),
    )


def view(
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
    state: DeliveryState = DeliveryState.REVIEW,
    *,
    reason: str = "",
) -> DeliveryView:
    """The two axes of one requirement, joined for display only."""
    status = DeliveryStatus()
    if state is not DeliveryState.BACKLOG:
        status = status.moved_to(
            state,
            actor=DeliveryActor.system("requirement-runner"),
            at=REQ_AT,
            cause=TransitionCause.RUN_STARTED,
            reason=reason,
        )
    return DeliveryView.of(REQ.evolve(lifecycle=lifecycle), status)


# -- the precedence order is total (SWR-3211) ------------------------------


@verifies(SWR.SWR_3211)
def test_every_combination_of_inputs_yields_exactly_one_health() -> None:
    """Table-driven over the whole input space: no gap, no ambiguity, no crash."""
    combinations = itertools.product(
        RequirementLifecycle,
        DeliveryState,
        SatisfactionState,
        EvidenceState,
        (None, "SWR-3999"),
    )
    seen: set[RequirementHealth] = set()
    count = 0
    for lifecycle, state, satisfaction, evidence, superseded in combinations:
        inputs = HealthInputs(
            req_id=REQ.req_id,
            lifecycle=lifecycle,
            delivery_state=state,
            satisfaction=satisfaction,
            evidence_state=evidence,
            superseded_by=superseded,
        )
        derived = derive_health(inputs)
        count += 1

        assert isinstance(derived.health, RequirementHealth)
        # Exactly one: the first rule that matches, and it is the one reported.
        matching = [health for health, rule in HEALTH_RULES if rule(inputs)]
        assert matching[0] is derived.health
        assert HEALTH_PRECEDENCE[derived.rank] is derived.health
        assert derive_health(inputs) == derived
        seen.add(derived.health)

    assert count == 3 * 7 * 3 * 5 * 2
    assert seen == set(RequirementHealth)


@verifies(SWR.SWR_3211)
def test_the_precedence_order_is_documented_data_and_ends_in_a_total_fallback() -> None:
    """The order is inspectable, and its last rule always matches."""
    assert HEALTH_PRECEDENCE == (
        RequirementHealth.DEPRECATED,
        RequirementHealth.SUPERSEDED,
        RequirementHealth.BLOCKED,
        RequirementHealth.VERIFICATION_FAILED,
        RequirementHealth.INCOMPLETE_TRACEABILITY,
        RequirementHealth.NEEDS_UPDATE,
        RequirementHealth.HEALTHY,
    )
    assert len(HEALTH_PRECEDENCE) == len(set(HEALTH_PRECEDENCE)) == len(RequirementHealth)
    last_health, last_rule = HEALTH_RULES[-1]
    assert last_health is RequirementHealth.HEALTHY
    assert last_rule(HealthInputs())


@verifies(SWR.SWR_3211)
def test_the_louder_fact_wins_when_two_are_true_at_once() -> None:
    """Deprecated beats everything; a failure beats a gap; a gap comes last."""
    everything = HealthInputs(
        lifecycle=RequirementLifecycle.DEPRECATED,
        delivery_state=DeliveryState.BLOCKED,
        superseded_by="SWR-3999",
        evidence_state=EvidenceState.FAILED,
        failed_kinds=(EvidenceKind.TEST,),
        missing_kinds=(EvidenceKind.IMPLEMENTATION,),
    )
    assert derive_health(everything).health is RequirementHealth.DEPRECATED
    assert derive_health(everything).outranked == ()

    without_lifecycle = everything.model_copy(update={"lifecycle": RequirementLifecycle.APPROVED})
    assert derive_health(without_lifecycle).health is RequirementHealth.SUPERSEDED

    blocked = without_lifecycle.model_copy(update={"superseded_by": None})
    assert derive_health(blocked).health is RequirementHealth.BLOCKED

    failing = blocked.model_copy(update={"delivery_state": DeliveryState.REVIEW})
    derived = derive_health(failing)
    assert derived.health is RequirementHealth.VERIFICATION_FAILED
    assert RequirementHealth.BLOCKED in derived.outranked

    gap = failing.model_copy(
        update={"evidence_state": EvidenceState.MISSING, "failed_kinds": ()},
    )
    assert derive_health(gap).health is RequirementHealth.INCOMPLETE_TRACEABILITY

    # A hole outranks staleness: there is nothing there to re-confirm, and the
    # repair is a different one.
    also_stale = gap.model_copy(
        update={
            "stale_kinds": (EvidenceKind.TEST,),
            "satisfaction": SatisfactionState.STALE,
        },
    )
    assert derive_health(also_stale).health is RequirementHealth.INCOMPLETE_TRACEABILITY

    stale_only = also_stale.model_copy(
        update={"missing_kinds": (), "evidence_state": EvidenceState.STALE},
    )
    assert derive_health(stale_only).health is RequirementHealth.NEEDS_UPDATE


@verifies(SWR.SWR_3211, SWR.SWR_3204)
def test_a_specification_that_moved_since_delivery_reads_as_needs_update() -> None:
    """A delivered version that is no longer the current one is work, not a gap."""
    moved = HealthInputs(satisfaction=SatisfactionState.STALE)
    assert derive_health(moved).health is RequirementHealth.NEEDS_UPDATE

    never = HealthInputs(satisfaction=SatisfactionState.NEVER_DELIVERED)
    assert derive_health(never).health is RequirementHealth.HEALTHY


# -- the two axes stay apart (SWR-3211, SWR-3202) --------------------------


@verifies(SWR.SWR_3211, SWR.SWR_3202)
def test_a_requirement_can_be_approved_and_verification_failed_at_once() -> None:
    """The text stands, the implementation does not, and both are visible."""
    approved_and_red = HealthInputs.of(
        view(RequirementLifecycle.APPROVED, DeliveryState.REVIEW),
        projection(test_status="failed"),
    )
    derived = derive_health(approved_and_red)

    assert approved_and_red.lifecycle is RequirementLifecycle.APPROVED
    assert derived.health is RequirementHealth.VERIFICATION_FAILED
    assert derived.label == "Verification Failed"
    assert "approved" in derived.message
    assert EvidenceKind.TEST in derived.inputs.failed_kinds


@verifies(SWR.SWR_3211)
def test_the_inputs_that_produced_a_health_are_retrievable_from_it() -> None:
    """A user who disagrees with a badge can see what made it."""
    gathered = HealthInputs.of(
        view(RequirementLifecycle.DRAFT, DeliveryState.RUNNING),
        projection(executed=False),
        satisfaction=SatisfactionState.SATISFIED,
    )
    derived = derive_health(gathered)

    assert derived.inputs == gathered
    assert derived.inputs.req_id == REQ.req_id
    assert derived.inputs.delivery_state is DeliveryState.RUNNING
    assert derived.inputs.evidence_state is EvidenceState.STALE
    assert derived.inputs.stale_kinds == (EvidenceKind.TEST,)
    assert derived.health is RequirementHealth.NEEDS_UPDATE
    assert DerivedHealth.model_validate(derived.model_dump(mode="json")) == derived


@verifies(SWR.SWR_3211, SWR.SWR_3206)
def test_only_a_required_obligation_counts_as_incomplete_traceability() -> None:
    """A hand-delivered requirement owes no execution record and is not thereby red."""
    gathered = HealthInputs.of(view(), projection())

    execution = projection().for_kind(EvidenceKind.EXECUTION)
    assert execution.level is ObligationLevel.OPTIONAL
    assert execution.state is EvidenceState.NOT_APPLICABLE
    assert gathered.missing_kinds == ()
    assert derive_health(gathered).health is RequirementHealth.HEALTHY


@verifies(SWR.SWR_3211)
def test_a_blocked_requirement_reads_blocked_whatever_its_evidence_says() -> None:
    """Acting on the evidence is exactly what is blocked, so the blocker comes first."""
    blocked = HealthInputs.of(
        view(RequirementLifecycle.APPROVED, DeliveryState.BLOCKED, reason="waiting on an API key"),
        projection(test_status="failed"),
    )
    assert blocked.delivery_state is DeliveryState.BLOCKED
    assert derive_health(blocked).health is RequirementHealth.BLOCKED


# -- health is derived, never stored, never an input (SWR-3211) ------------


@verifies(SWR.SWR_3211)
def test_health_is_not_a_field_of_anything_rotaris_persists() -> None:
    """A stored health is a second truth that can disagree with its own inputs."""
    persisted = set(DeliveryRecord.model_fields) | set(DeliveryStatus.model_fields)
    assert not {field for field in persisted if "health" in field}

    record = DeliveryRecord.blank(REQ.req_id)
    assert "health" not in record.to_payload()


@verifies(SWR.SWR_3211, SWR.SWR_3203)
def test_health_never_gates_a_delivery_transition() -> None:
    """The matrix decides transitions; a derived display value has no vote."""
    assert not {field for field in TransitionRequest.model_fields if "health" in field}
    annotations = {str(field.annotation) for field in TransitionRequest.model_fields.values()}
    assert not any("Health" in annotation for annotation in annotations)


@verifies(SWR.SWR_3211)
def test_recomputing_a_health_from_the_same_axes_gives_the_same_word() -> None:
    """Derived and deterministic, so nothing has to be invalidated."""
    inputs = HealthInputs.of(view(), projection(test_status="failed"))
    assert derive_health(inputs) == derive_health(inputs)
    assert derive_health(inputs).health.label == "Verification Failed"
    assert str(derive_health(inputs).health) == "verification-failed"
