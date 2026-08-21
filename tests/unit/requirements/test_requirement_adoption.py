"""Productive use: a team points Rotaris at a codebase that already has a thousand
implemented, annotated and tested requirements. They ask it to take that work over rather
than starting every card in Backlog.
Expected outcome: adoption travels a door of its own that no drag can reach, refuses to
move anything it cannot back with a verification run, leaves every requirement a user
already touched alone, reports per requirement what it did not adopt and why, and records
a delivery that says it was adopted rather than run."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    ADOPTION_TRANSITIONS,
    LEGAL_TRANSITIONS,
    ActorKind,
    AdoptionCandidate,
    AdoptionOutcome,
    AdoptionResult,
    DeliveryActor,
    DeliveryOrigin,
    DeliveryRecord,
    DeliveryState,
    DeliveryStatus,
    DeliveryStore,
    DeliveryTransitions,
    RefusalKind,
    SatisfiedDelivery,
    TransitionCause,
    TransitionRequest,
    UnmetCondition,
    adopt,
    adoption_candidates,
    allowed_targets,
    apply_transition,
    unjudged_adoption,
)
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-3217"
AT = dt.datetime(2026, 8, 15, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 15, 10, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")
SYSTEM = DeliveryActor.system("adoption")
RUN = "adoption-run-1"
COMMIT = "c0ffee1234"


def requirement(
    req_id: str = REQ,
    *,
    lifecycle: RequirementLifecycle = RequirementLifecycle.APPROVED,
    current_hash: str = "hash-now",
) -> CanonicalRequirement:
    """One requirement as the source reports it."""
    return CanonicalRequirement(req_id=req_id, lifecycle=lifecycle, current_hash=current_hash)


def adopted_delivery(req_id: str = REQ, *, satisfied_hash: str = "hash-now") -> SatisfiedDelivery:
    """What adoption records: a verification run, not an implementing one."""
    return SatisfiedDelivery.adopted_by(
        req_id,
        satisfied_hash=satisfied_hash,
        run_id=RUN,
        at=AT,
        verified_commit=COMMIT,
    )


def ran_delivery(req_id: str = REQ) -> SatisfiedDelivery:
    """What a real Rotaris run records."""
    return SatisfiedDelivery(
        req_id=req_id,
        satisfied_hash="hash-now",
        run_id="run-7",
        satisfied_at=AT,
        verified_commit=COMMIT,
    )


def passing(record: DeliveryRecord, request: TransitionRequest) -> Sequence[UnmetCondition]:
    """A completion gate whose conditions all hold (SWR-3215)."""
    return ()


def failing(record: DeliveryRecord, request: TransitionRequest) -> Sequence[UnmetCondition]:
    """The gate a hand-built requirement with no executed test actually meets."""
    return (
        UnmetCondition(
            name="covering-tests-passed",
            detail="tests/unit/test_x.py:31 did not run",
        ),
    )


def adopt_request(
    *,
    target: DeliveryState = DeliveryState.DONE,
    cause: TransitionCause = TransitionCause.ADOPTED,
    delivery: SatisfiedDelivery | None = None,
    actor: DeliveryActor = USER,
    req_id: str = REQ,
) -> TransitionRequest:
    """One attempt through the adoption door."""
    return TransitionRequest(
        req_id=req_id,
        target=target,
        actor=actor,
        cause=cause,
        at=LATER,
        requirement_hash="hash-now",
        delivery=delivery,
        run_id=RUN,
    )


def done_record(req_id: str = REQ, *, adopted: bool) -> DeliveryRecord:
    """A record already in Done, delivered either by adoption or by a run."""
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.DONE,
            changed_at=AT,
            changed_by=USER if adopted else SYSTEM,
            cause=TransitionCause.ADOPTED if adopted else TransitionCause.COMPLETION_ACCEPTED,
        ),
        satisfied=DeliveryRecord.blank(req_id).satisfied.appended(
            adopted_delivery(req_id) if adopted else ran_delivery(req_id),
        ),
    )


# ── SWR-3218: the door, and the matrix it deliberately stays out of ────────


@verifies(SWR.SWR_3218)
@pytest.mark.parametrize("actor", list(ActorKind))
def test_backlog_never_reaches_done_through_the_matrix_a_board_reads(actor: ActorKind) -> None:
    """The guarantee SWR-3609 rests on, asserted directly.

    A board asks :func:`allowed_targets` what a card may be dropped on. If
    ``Done`` ever appeared there for a ``Backlog`` card, adoption would have
    handed every drag the shortcut the completion conditions exist to prevent.
    """
    assert DeliveryState.DONE not in allowed_targets(DeliveryState.BACKLOG, actor)
    assert (DeliveryState.BACKLOG, DeliveryState.DONE) not in LEGAL_TRANSITIONS


@verifies(SWR.SWR_3218)
def test_the_adoption_map_holds_exactly_the_two_edges_adoption_needs() -> None:
    """Two edges, and no third: adoption takes work over and gives it back."""
    assert set(ADOPTION_TRANSITIONS) == {
        (DeliveryState.BACKLOG, DeliveryState.DONE),
        (DeliveryState.DONE, DeliveryState.BACKLOG),
    }


@verifies(SWR.SWR_3218)
def test_naming_the_adoption_cause_grants_nothing_without_the_verification() -> None:
    """The cause is a label. Without an adopted delivery the door stays shut."""
    outcome = apply_transition(
        DeliveryRecord.blank(REQ),
        adopt_request(delivery=None),
        completion=passing,
    )
    assert not outcome.accepted
    assert outcome.refusal is not None
    assert outcome.refusal.kind is RefusalKind.ADOPTION_EVIDENCE_MISSING


@verifies(SWR.SWR_3218)
def test_a_delivery_from_a_real_run_does_not_open_the_adoption_door() -> None:
    """A run's own satisfied record is not an adoption, and cannot stand in for one."""
    outcome = apply_transition(
        DeliveryRecord.blank(REQ),
        adopt_request(delivery=ran_delivery()),
        completion=passing,
    )
    assert not outcome.accepted
    assert outcome.refusal is not None
    assert outcome.refusal.kind is RefusalKind.ADOPTION_EVIDENCE_MISSING


@verifies(SWR.SWR_3218, SWR.SWR_3215)
def test_adoption_is_refused_by_the_ordinary_completion_gate() -> None:
    """The whole design: adoption passes the *same* gate, unmodified.

    A hand-built requirement whose covering test never ran is exactly the case
    ``CoveringTest.executed`` exists to expose, and it must come back refused with
    the condition named rather than adopted on the strength of the annotation.
    """
    outcome = apply_transition(
        DeliveryRecord.blank(REQ),
        adopt_request(delivery=adopted_delivery()),
        completion=failing,
    )
    assert not outcome.accepted
    assert outcome.refusal is not None
    assert outcome.refusal.kind is RefusalKind.COMPLETION_CONDITIONS_UNMET
    assert [condition.name for condition in outcome.refusal.unmet] == ["covering-tests-passed"]


@verifies(SWR.SWR_3218)
def test_adoption_without_a_gate_is_refused_like_every_other_done() -> None:
    """No gate, no Done — adoption buys no exemption from SWR-3215's own rule."""
    outcome = apply_transition(
        DeliveryRecord.blank(REQ),
        adopt_request(delivery=adopted_delivery()),
        completion=None,
    )
    assert not outcome.accepted
    assert outcome.refusal is not None
    assert outcome.refusal.kind is RefusalKind.COMPLETION_GATE_MISSING


@verifies(SWR.SWR_3218, SWR.SWR_3213)
def test_an_accepted_adoption_moves_the_state_and_leaves_one_audit_record() -> None:
    """One accepted transition, one audit record — adoption is not a special case."""
    outcome = apply_transition(
        DeliveryRecord.blank(REQ),
        adopt_request(delivery=adopted_delivery()),
        completion=passing,
    )
    assert outcome.accepted
    assert outcome.record.delivery.state is DeliveryState.DONE
    assert outcome.record.delivery.cause is TransitionCause.ADOPTED
    assert outcome.transition is not None
    assert outcome.transition.satisfied_hash == "hash-now"
    assert outcome.record.satisfied.current is not None
    assert outcome.record.satisfied.current.adopted


@verifies(SWR.SWR_3218)
def test_the_adoption_door_opens_only_for_its_own_two_edges() -> None:
    """An adoption cause aimed anywhere else is an illegal edge, not a wildcard."""
    outcome = apply_transition(
        DeliveryRecord.blank(REQ),
        adopt_request(target=DeliveryState.RUNNING, delivery=None),
        completion=passing,
    )
    assert not outcome.accepted
    assert outcome.refusal is not None
    assert outcome.refusal.kind is RefusalKind.ILLEGAL_EDGE


@verifies(SWR.SWR_3217)
def test_an_adoption_can_be_taken_back() -> None:
    """Adopting a thousand requirements has to be undoable, per requirement."""
    outcome = apply_transition(
        done_record(adopted=True),
        adopt_request(
            target=DeliveryState.BACKLOG,
            cause=TransitionCause.ADOPTION_REVERTED,
        ),
        completion=passing,
    )
    assert outcome.accepted
    assert outcome.record.delivery.state is DeliveryState.BACKLOG


@verifies(SWR.SWR_3217, SWR.SWR_3218)
def test_a_real_delivery_cannot_be_taken_back_by_reverting_an_adoption() -> None:
    """The inverse of an adoption undoes an adoption, never a run's work."""
    outcome = apply_transition(
        done_record(adopted=False),
        adopt_request(
            target=DeliveryState.BACKLOG,
            cause=TransitionCause.ADOPTION_REVERTED,
        ),
        completion=passing,
    )
    assert not outcome.accepted
    assert outcome.refusal is not None
    assert outcome.refusal.kind is RefusalKind.NOT_AN_ADOPTED_DELIVERY


# ── SWR-3217: which requirements are candidates at all ─────────────────────


@verifies(SWR.SWR_3217)
def test_a_requirement_a_user_already_moved_is_never_a_candidate() -> None:
    """The one way this feature could destroy real work, refused first.

    ``pristine`` is precisely "Rotaris has never recorded anything about this"
    (SWR-3201), which is why it is what candidacy keys on rather than "is in
    Backlog": a user who deliberately moved a card *back* to Backlog has still
    expressed an opinion.
    """
    moved = DeliveryRecord(
        req_id=REQ,
        delivery=DeliveryStatus(
            state=DeliveryState.READY,
            changed_at=AT,
            changed_by=USER,
            cause=TransitionCause.USER_ACTION,
        ),
    )
    candidates, skipped = adoption_candidates([requirement()], {REQ: moved})
    assert candidates == ()
    assert [result.req_id for result in skipped] == [REQ]
    assert "already moved to Ready" in skipped[0].detail


@verifies(SWR.SWR_3217)
def test_a_deprecated_requirement_is_retired_rather_than_finished() -> None:
    """The project took it out of the specification; that is not the same as Done."""
    _, skipped = adoption_candidates(
        [requirement(lifecycle=RequirementLifecycle.DEPRECATED)],
        {},
    )
    assert [result.outcome for result in skipped] == [AdoptionOutcome.SKIPPED]
    assert "retired" in skipped[0].detail


@verifies(SWR.SWR_3217, SWR.SWR_3212)
def test_an_epic_is_never_adopted_because_its_state_is_its_children_s() -> None:
    """Adopting an epic would be inventing a fact its children have not earned."""
    _, skipped = adoption_candidates(
        [requirement("SWR-3200")],
        {},
        is_epic=lambda req_id: req_id == "SWR-3200",
    )
    assert [result.req_id for result in skipped] == ["SWR-3200"]
    assert "children" in skipped[0].detail


@verifies(SWR.SWR_3217)
def test_every_requirement_appears_in_the_report_even_when_it_was_never_considered() -> None:
    """A pass that silently dropped what it skipped would report a lie by omission."""
    requirements = [
        requirement("SWR-1"),
        requirement("SWR-2", lifecycle=RequirementLifecycle.DEPRECATED),
        requirement("SWR-3"),
    ]
    moved = DeliveryRecord(
        req_id="SWR-3",
        delivery=DeliveryStatus(
            state=DeliveryState.BLOCKED,
            blocked_reason="waiting on a product decision",
            changed_at=AT,
            changed_by=USER,
            cause=TransitionCause.BLOCKER_RAISED,
        ),
    )
    candidates, skipped = adoption_candidates(requirements, {"SWR-3": moved})
    assert [candidate.req_id for candidate in candidates] == ["SWR-1"]
    assert {result.req_id for result in skipped} == {"SWR-2", "SWR-3"}
    assert len(candidates) + len(skipped) == len(requirements)


# ── SWR-3217: the pass, through the persisting write path ──────────────────


@verifies(SWR.SWR_3217, SWR.SWR_3609)
def test_the_pass_reports_per_requirement_and_names_what_was_unmet(tmp_path: Path) -> None:
    """SWR-3609's obligation on a bulk action: one answer each, with its reason."""
    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store, completion=failing)
    candidates = (
        AdoptionCandidate(req_id="SWR-1", current_hash="h1"),
        AdoptionCandidate(req_id="SWR-2", current_hash="h2"),
    )
    report = adopt(candidates, transitions, actor=USER, run_id=RUN, at=LATER, commit=COMMIT)

    assert len(report.refused) == 2
    assert not report.adopted
    assert not report.changed
    for result in report.refused:
        assert [condition.name for condition in result.unmet] == ["covering-tests-passed"]


@verifies(SWR.SWR_3217, SWR.SWR_3204)
def test_an_adopted_requirement_records_the_version_that_was_verified(tmp_path: Path) -> None:
    """Adoption's payoff: a satisfied hash, so a later edit becomes visible work.

    Without this the board would be green and a subsequent rewording would pass
    unnoticed — which is the whole reason SWR-3204 exists (SWR-3502).
    """
    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store, completion=passing)
    report = adopt(
        (AdoptionCandidate(req_id=REQ, current_hash="hash-now"),),
        transitions,
        actor=USER,
        run_id=RUN,
        at=LATER,
        commit=COMMIT,
    )

    assert [result.req_id for result in report.adopted] == [REQ]
    stored = store.load(REQ).record
    assert stored.delivery.state is DeliveryState.DONE
    assert stored.satisfied.satisfied_hash == "hash-now"
    current = stored.satisfied.current
    assert current is not None
    assert current.origin is DeliveryOrigin.ADOPTED
    assert current.run_id == RUN
    assert current.verified_commit == COMMIT


@verifies(SWR.SWR_3217)
def test_a_refused_adoption_writes_nothing_at_all(tmp_path: Path) -> None:
    """A refusal leaves the store exactly as it was — no file, still Backlog."""
    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store, completion=failing)
    adopt(
        (AdoptionCandidate(req_id=REQ, current_hash="hash-now"),),
        transitions,
        actor=USER,
        run_id=RUN,
        at=LATER,
    )

    assert not store.path_for(REQ).exists()
    assert store.load(REQ).record.delivery.pristine


@verifies(SWR.SWR_3217)
def test_the_report_carries_the_skipped_requirements_it_was_given(tmp_path: Path) -> None:
    """The two halves of the answer travel together, so a caller cannot lose one."""
    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store, completion=passing)
    candidates, skipped = adoption_candidates(
        [requirement("SWR-1"), requirement("SWR-2", lifecycle=RequirementLifecycle.DEPRECATED)],
        {},
    )
    report = adopt(
        candidates,
        transitions,
        actor=USER,
        run_id=RUN,
        at=LATER,
        skipped=skipped,
    )

    assert len(report.results) == 2
    assert [result.req_id for result in report.adopted] == ["SWR-1"]
    assert [result.req_id for result in report.skipped] == ["SWR-2"]
    assert "1 adopted" in report.summary


# ── SWR-3219: a delivery says where its claim came from ────────────────────


@verifies(SWR.SWR_3219)
def test_a_delivery_written_without_an_origin_reads_back_as_a_rotaris_run(
    tmp_path: Path,
) -> None:
    """Every record written before the field existed *was* a Rotaris delivery."""
    store = DeliveryStore(tmp_path)
    record = DeliveryRecord.blank(REQ)
    assert ran_delivery().origin is DeliveryOrigin.ROTARIS
    store.seed(record.evolve(satisfied=record.satisfied.appended(ran_delivery())))

    reloaded = store.load(REQ).record.satisfied.current
    assert reloaded is not None
    assert reloaded.origin is DeliveryOrigin.ROTARIS
    assert not reloaded.adopted


@verifies(SWR.SWR_3219)
def test_an_adopted_origin_survives_a_round_trip(tmp_path: Path) -> None:
    """The distinction has to outlive a reload, or a card starts implying a run."""
    store = DeliveryStore(tmp_path)
    record = DeliveryRecord.blank(REQ)
    store.seed(record.evolve(satisfied=record.satisfied.appended(adopted_delivery())))

    reloaded = store.load(REQ).record.satisfied.current
    assert reloaded is not None
    assert reloaded.origin is DeliveryOrigin.ADOPTED
    assert reloaded.adopted


@verifies(SWR.SWR_3219)
def test_the_summary_never_lets_an_adoption_read_as_an_implementing_run() -> None:
    """The words a revision panel prints (SWR-3313) keep the two apart."""
    assert "adopted from verification run" in adopted_delivery().summary
    assert "delivered by run" in ran_delivery().summary


@verifies(SWR.SWR_3219)
def test_the_origin_vocabulary_is_complete_before_any_adapter_needs_it() -> None:
    """`external` exists now so an issue-tracker adapter extends nothing (SWR-3118)."""
    assert {str(origin) for origin in DeliveryOrigin} == {"rotaris", "adopted", "external"}


# -- a pass whose verification observed nothing (SWR-2606, SWR-3217) --------


@verifies(SWR.SWR_3217, SWR.SWR_2606)
def test_a_pass_that_could_not_judge_says_so_once_instead_of_refusing_everything() -> None:
    """Productive use: the user hits Verify and adopt, and the suite times out.

    The regression this exists for. Attempting the candidates anyway produced a
    refusal each, every one naming covering tests as unsatisfied — 1413 findings
    manufactured from one fact about a process that died. The pass now states
    that fact once.
    """
    candidates = (
        AdoptionCandidate(req_id="SWR-1", current_hash="h1"),
        AdoptionCandidate(req_id="SWR-2", current_hash="h2"),
    )

    report = unjudged_adoption(
        candidates,
        reason="the check suite that would have verified this workspace timed out",
        run_id="adoption-1",
    )

    assert report.adopted == ()
    assert report.refused == ()
    assert [result.req_id for result in report.inconclusive] == ["SWR-1", "SWR-2"]
    assert not report.changed
    assert "timed out" in report.summary
    # Every candidate is still accounted for by name (SWR-3609) — "could not
    # tell" is an answer the pass owes per requirement, not a silent skip.
    assert all(result.detail for result in report.inconclusive)


@verifies(SWR.SWR_3217, SWR.SWR_2606)
def test_an_unjudgeable_pass_still_reports_what_was_never_a_candidate() -> None:
    """The skips are the caller's finding and survive the short circuit."""
    skipped = (
        AdoptionResult(
            req_id="SWR-9",
            outcome=AdoptionOutcome.SKIPPED,
            detail="the project retired this requirement",
        ),
    )

    report = unjudged_adoption(
        (AdoptionCandidate(req_id="SWR-1", current_hash="h1"),),
        reason="the suite did not pass",
        skipped=skipped,
    )

    assert [result.req_id for result in report.skipped] == ["SWR-9"]
    assert [result.req_id for result in report.inconclusive] == ["SWR-1"]
