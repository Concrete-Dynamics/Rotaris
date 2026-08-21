"""Productive use: a run moves a requirement Ready → Running → Review while a user drags
another card straight from Backlog onto Done. The run's moves land; the drag comes back
with the reason it could not.
Expected outcome: one transition function decides both, the legal matrix is complete and
enforced edge by edge, each refusal names the precondition it failed, an accepted move
produces exactly one audit record, and a refused one leaves the stored record — the file
included — exactly as it was."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    LEGAL_TRANSITIONS,
    ActorKind,
    DeliveryActor,
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
    allowed_targets,
    apply_transition,
    is_legal,
    permitted_actors,
)

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-3203"
AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 11, 0, tzinfo=dt.UTC)
SYSTEM = DeliveryActor.system("requirement-runner")
USER = DeliveryActor.user("dvf")

BACKLOG = DeliveryState.BACKLOG
READY = DeliveryState.READY
RUNNING = DeliveryState.RUNNING
REVIEW = DeliveryState.REVIEW
NEEDS_UPDATE = DeliveryState.NEEDS_UPDATE
BLOCKED = DeliveryState.BLOCKED
DONE = DeliveryState.DONE

USER_AND_SYSTEM = frozenset({ActorKind.USER, ActorKind.SYSTEM})
SYSTEM_ONLY = frozenset({ActorKind.SYSTEM})

#: The matrix of SWR-3203, written out by hand so the test asserts the
#: *requirement* rather than re-deriving whatever the implementation happens to
#: build. Every edge that is not here is forbidden for everyone.
ALLOWED: dict[tuple[DeliveryState, DeliveryState], frozenset[ActorKind]] = {
    (BACKLOG, READY): USER_AND_SYSTEM,
    (READY, BACKLOG): USER_AND_SYSTEM,
    (READY, RUNNING): SYSTEM_ONLY,
    (RUNNING, REVIEW): SYSTEM_ONLY,
    (REVIEW, DONE): USER_AND_SYSTEM,
    (REVIEW, READY): USER_AND_SYSTEM,
    (DONE, NEEDS_UPDATE): SYSTEM_ONLY,
    (NEEDS_UPDATE, READY): USER_AND_SYSTEM,
    (BACKLOG, BLOCKED): USER_AND_SYSTEM,
    (READY, BLOCKED): USER_AND_SYSTEM,
    (RUNNING, BLOCKED): USER_AND_SYSTEM,
    (REVIEW, BLOCKED): USER_AND_SYSTEM,
    (NEEDS_UPDATE, BLOCKED): USER_AND_SYSTEM,
    (DONE, BLOCKED): USER_AND_SYSTEM,
    (BLOCKED, BACKLOG): USER_AND_SYSTEM,
    (BLOCKED, READY): USER_AND_SYSTEM,
    (BLOCKED, RUNNING): SYSTEM_ONLY,
    (BLOCKED, REVIEW): USER_AND_SYSTEM,
    (BLOCKED, NEEDS_UPDATE): USER_AND_SYSTEM,
    (BLOCKED, DONE): USER_AND_SYSTEM,
}

EVERY_PAIR = [(source, target) for source in DeliveryState for target in DeliveryState]


def record_in(
    state: DeliveryState,
    *,
    blocked_from: DeliveryState | None = None,
    req_id: str = REQ,
) -> DeliveryRecord:
    """A stored record sitting in *state*, with the provenance a moved state carries."""
    if state is BACKLOG:
        return DeliveryRecord.blank(req_id)
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=state,
            blocked_reason="the upstream API is down" if state is BLOCKED else "",
            blocked_from=blocked_from if state is BLOCKED else None,
            changed_at=AT,
            changed_by=SYSTEM,
            cause=TransitionCause.USER_ACTION,
        ),
    )


def delivered(
    *, satisfied_hash: str = "hash-at-run-start", run_id: str = "run-1"
) -> SatisfiedDelivery:
    """What a completing run hands the transition: the snapshot's version (SWR-3402)."""
    return SatisfiedDelivery(
        req_id=REQ,
        satisfied_hash=satisfied_hash,
        run_id=run_id,
        satisfied_at=LATER,
        verified_commit="c0ffee",
    )


def passing(record: DeliveryRecord, request: TransitionRequest) -> Sequence[UnmetCondition]:
    """A completion gate whose conditions all hold (SWR-3215).

    Supplied wherever the *matrix* is under test, because a transition into Done
    with no gate at all is refused on its own — which is asserted separately, in
    ``test_done_is_refused_when_nothing_checked_its_completion_conditions``.
    SWR-3215's own rules are exercised in ``test_done_conditions.py``.
    """
    return ()


def request_for(
    target: DeliveryState,
    *,
    actor: DeliveryActor = SYSTEM,
    with_delivery: bool = True,
) -> TransitionRequest:
    """A request whose own preconditions (reason, satisfied hash) are satisfied."""
    return TransitionRequest(
        req_id=REQ,
        target=target,
        actor=actor,
        cause=TransitionCause.USER_ACTION,
        at=LATER,
        requirement_hash="hash-now",
        reason="the upstream API is down" if target is BLOCKED else "",
        delivery=delivered() if target is DONE and with_delivery else None,
    )


# -- the matrix (SWR-3203) -------------------------------------------------


@verifies(SWR.SWR_3203)
def test_the_published_matrix_is_exactly_the_matrix_the_requirement_states() -> None:
    """Every legal edge of SWR-3203 exists, with its actors, and nothing else does."""
    assert dict(LEGAL_TRANSITIONS) == ALLOWED
    assert permitted_actors(BACKLOG, DONE) == frozenset()
    assert allowed_targets(REVIEW) == (READY, BLOCKED, DONE)
    assert allowed_targets(READY, ActorKind.USER) == (BACKLOG, BLOCKED)
    assert is_legal(READY, RUNNING, ActorKind.SYSTEM)
    assert not is_legal(READY, RUNNING, ActorKind.USER)


@pytest.mark.parametrize(
    ("source", "target"),
    EVERY_PAIR,
    ids=[f"{source}->{target}" for source, target in EVERY_PAIR],
)
@verifies(SWR.SWR_3203)
def test_every_edge_is_accepted_or_refused_exactly_as_the_matrix_says(
    source: DeliveryState,
    target: DeliveryState,
) -> None:
    """Each of the 49 ordered pairs, once: allowed ones move, forbidden ones do not."""
    record = record_in(source, blocked_from=target if source is BLOCKED else None)
    outcome = apply_transition(record, request_for(target), completion=passing)

    if (source, target) in ALLOWED:
        assert outcome.accepted, outcome.message
        assert outcome.record.state is target
        assert outcome.refusal is None
        transition = outcome.transition
        assert transition is not None
        assert (transition.source, transition.target) == (source, target)
        assert transition.actor == SYSTEM
        assert transition.at == LATER
        assert transition.requirement_hash == "hash-now"
    else:
        assert not outcome.accepted
        assert outcome.transition is None
        refusal = outcome.refusal
        assert refusal is not None
        assert refusal.precondition.strip()
        assert refusal.kind in {RefusalKind.SAME_STATE, RefusalKind.ILLEGAL_EDGE}
        # A rejected transition leaves the record exactly as it was.
        assert outcome.record == record
        assert outcome.record.state is source


@pytest.mark.parametrize(
    ("source", "target"),
    [(source, target) for (source, target), actors in ALLOWED.items() if actors == SYSTEM_ONLY],
)
@verifies(SWR.SWR_3203)
def test_a_user_cannot_make_a_move_only_the_system_can_assert(
    source: DeliveryState,
    target: DeliveryState,
) -> None:
    """Dragging a card into Running would claim a run that nobody started."""
    record = record_in(source, blocked_from=target if source is BLOCKED else None)
    outcome = apply_transition(record, request_for(target, actor=USER), completion=passing)

    assert not outcome.accepted
    refusal = outcome.refusal
    assert refusal is not None
    assert refusal.kind is RefusalKind.ACTOR_NOT_PERMITTED
    assert "this actor may make this move" in refusal.precondition
    assert "system" in refusal.detail
    assert outcome.record.state is source


@verifies(SWR.SWR_3203)
def test_backlog_to_done_is_refused_with_a_stated_reason() -> None:
    """The headline case: Done is not a place a card can be dropped into."""
    outcome = apply_transition(record_in(BACKLOG), request_for(DONE))

    assert not outcome.accepted
    refusal = outcome.refusal
    assert refusal is not None
    assert refusal.kind is RefusalKind.ILLEGAL_EDGE
    assert refusal.precondition == "the state machine has an edge between these states"
    assert "Ready" in refusal.detail  # what *is* reachable, so the user can act
    assert "Backlog → Done refused" in refusal.message


@verifies(SWR.SWR_3203)
def test_a_refusal_message_states_the_breach_and_not_the_rule() -> None:
    """Productive use: a user reads why a card sprang back.

    ``refused — every completion condition holds`` is what a real board printed
    for 1413 requirements: the precondition is stored as the rule that has to
    hold, and printing it unnegated says the opposite of what happened. The
    sentence has to survive being read literally.
    """
    outcome = apply_transition(record_in(BACKLOG), request_for(DONE))

    refusal = outcome.refusal
    assert refusal is not None
    assert "did not hold" in refusal.message
    # Every precondition is phrased as the rule, so the single negation above
    # reads correctly for all of them rather than for most of them.
    assert not any(
        phrase in refusal.precondition for phrase in (" no ", " not ", "cannot", "never")
    )


# -- preconditions this module owns ----------------------------------------


@verifies(SWR.SWR_3203, SWR.SWR_3201)
def test_entering_blocked_without_a_reason_is_refused() -> None:
    """A blocked card with no reason is a dead end nobody can pick up."""
    outcome = apply_transition(
        record_in(RUNNING),
        TransitionRequest(
            req_id=REQ,
            target=BLOCKED,
            actor=SYSTEM,
            cause=TransitionCause.BLOCKER_RAISED,
            at=LATER,
        ),
    )
    assert not outcome.accepted
    refusal = outcome.refusal
    assert refusal is not None
    assert refusal.kind is RefusalKind.BLOCKER_REASON_MISSING
    assert refusal.precondition == "a Blocked requirement carries a stated reason"


@verifies(SWR.SWR_3203)
def test_a_blocked_requirement_returns_to_the_state_it_was_blocked_in() -> None:
    """ "Back where it was" is recorded when the blocker is raised, not guessed later."""
    blocked = record_in(BLOCKED, blocked_from=RUNNING)

    wrong = apply_transition(blocked, request_for(REVIEW))
    assert not wrong.accepted
    assert wrong.refusal is not None
    assert wrong.refusal.kind is RefusalKind.NOT_THE_BLOCKED_PREDECESSOR
    assert "blocked in Running" in wrong.refusal.detail

    right = apply_transition(blocked, request_for(RUNNING))
    assert right.accepted
    assert right.record.state is RUNNING
    assert right.record.delivery.blocked_reason == ""


@verifies(SWR.SWR_3203, SWR.SWR_3201)
def test_a_user_releases_a_run_that_was_blocked_to_ready_and_nowhere_else() -> None:
    """Productive use: a run is held, or fails, and afterwards somebody picks the work up.
    Expected outcome: the one column a person is offered is Ready — because
    Blocked → Running is the system's move, and a predecessor no user may reach
    would leave the card in a state nobody could ever move it out of."""
    blocked = record_in(BLOCKED, blocked_from=RUNNING)

    back_into_the_run = apply_transition(blocked, request_for(RUNNING, actor=USER))
    assert not back_into_the_run.accepted, "a person cannot assert that a run is in flight"
    refusal = back_into_the_run.refusal
    assert refusal is not None
    assert refusal.kind is RefusalKind.ACTOR_NOT_PERMITTED

    for elsewhere in (BACKLOG, REVIEW, NEEDS_UPDATE, DONE):
        wrong = apply_transition(blocked, request_for(elsewhere, actor=USER))
        assert not wrong.accepted, f"{elsewhere} is not where a held run is released to"
        assert wrong.refusal is not None
        assert wrong.refusal.kind is RefusalKind.NOT_THE_BLOCKED_PREDECESSOR
        # The refusal names both halves: where it was blocked, and where it goes.
        assert "blocked in Running, and released to Ready" in wrong.refusal.detail

    released = apply_transition(blocked, request_for(READY, actor=USER))
    assert released.accepted, released.message
    assert released.record.state is READY
    assert released.record.delivery.blocked_reason == ""
    # The system is unchanged by this: a flow that blocked its own run picks it
    # back up where it left it.
    assert apply_transition(blocked, request_for(RUNNING, actor=SYSTEM)).accepted


@verifies(SWR.SWR_3203, SWR.SWR_3212)
def test_an_epic_state_cannot_be_set_directly_by_either_actor() -> None:
    """An epic's state follows from its children; setting it would be a second truth."""
    for actor in (USER, SYSTEM):
        outcome = apply_transition(
            record_in(BACKLOG),
            request_for(READY, actor=actor),
            derived=True,
        )
        assert not outcome.accepted
        refusal = outcome.refusal
        assert refusal is not None
        assert refusal.kind is RefusalKind.DERIVED_STATE
        assert "derived from its children" in refusal.precondition


@verifies(SWR.SWR_3203, SWR.SWR_3204)
def test_done_is_refused_without_the_delivering_runs_satisfied_hash() -> None:
    """Done without a version is a claim that decays silently — so it is impossible."""
    outcome = apply_transition(record_in(REVIEW), request_for(DONE, with_delivery=False))

    assert not outcome.accepted
    refusal = outcome.refusal
    assert refusal is not None
    assert refusal.kind is RefusalKind.SATISFIED_HASH_MISSING
    assert refusal.precondition == "Done records the specification version that was delivered"
    assert outcome.record.satisfied_hash is None


@verifies(SWR.SWR_3204)
def test_a_satisfied_delivery_belongs_to_done_and_nowhere_else() -> None:
    """Recording a delivered version while moving to Review would date the wrong state."""
    with pytest.raises(ValidationError, match="recorded by reaching Done"):
        TransitionRequest(
            req_id=REQ,
            target=REVIEW,
            actor=SYSTEM,
            cause=TransitionCause.RUN_COMPLETED,
            at=LATER,
            delivery=delivered(),
        )


# -- the completion gate (SWR-3215's seam) ---------------------------------


@verifies(SWR.SWR_3203, SWR.SWR_3215)
def test_done_is_refused_when_nothing_checked_its_completion_conditions(tmp_path: Path) -> None:
    """No gate is not "no conditions": it is "nobody checked", and that is not a Done.

    The whole of SWR-3215 rests on the gate being asked. If an absent gate meant
    "granted", then every caller that forgot the argument — a board action, a run,
    a future slice — would silently hand out Done on nothing but a satisfied hash,
    and SWR-3609's "no path sets Done bypassing the completion conditions" would be
    a promise rather than a property. So the *default* refuses, on both halves of
    the state machine.
    """
    for actor in (USER, SYSTEM):
        pure = apply_transition(record_in(REVIEW), request_for(DONE, actor=actor))
        assert not pure.accepted, "a Done nobody checked the conditions for"
        assert pure.refusal is not None
        assert pure.refusal.kind is RefusalKind.COMPLETION_GATE_MISSING
        assert pure.refusal.precondition == (
            "the completion conditions are checked before Done is granted"
        )
        assert "no completion gate" in pure.refusal.detail
        assert pure.record.state is REVIEW
        assert pure.record.satisfied_hash is None, "and no version was recorded either"

    store = DeliveryStore(tmp_path)
    ungated = DeliveryTransitions(store)
    ungated.apply(request_for(READY, actor=USER))
    ungated.apply(request_for(RUNNING))
    assert ungated.apply(request_for(REVIEW)).accepted

    refused = ungated.apply(request_for(DONE, actor=USER))
    assert not refused.accepted
    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.COMPLETION_GATE_MISSING
    assert store.read(REQ).state is REVIEW

    # The same writer with a gate that answers "every condition holds" accepts it,
    # so the refusal is the missing check and nothing else.
    gated = DeliveryTransitions(store, completion=passing)
    assert gated.apply(request_for(DONE, actor=USER)).accepted
    assert store.read(REQ).state is DONE


@verifies(SWR.SWR_3203, SWR.SWR_3215)
def test_review_to_done_is_refused_while_a_completion_condition_is_unmet() -> None:
    """Each unmet condition is named individually — a count is not actionable."""
    unmet = (
        UnmetCondition(name="covering-test-passed", detail="tests/unit/... did not run"),
        UnmetCondition(name="verification-gate", detail="the check suite failed"),
    )

    def gate(
        record: DeliveryRecord,
        request: TransitionRequest,
    ) -> Sequence[UnmetCondition]:
        assert record.state is REVIEW  # judged against the record as it stands now
        assert request.target is DONE
        return unmet

    outcome = apply_transition(record_in(REVIEW), request_for(DONE), completion=gate)

    assert not outcome.accepted
    refusal = outcome.refusal
    assert refusal is not None
    assert refusal.kind is RefusalKind.COMPLETION_CONDITIONS_UNMET
    assert refusal.unmet == unmet
    assert "covering-test-passed" in refusal.message
    assert "verification-gate" in refusal.message
    assert outcome.record.state is REVIEW


@verifies(SWR.SWR_3203, SWR.SWR_3215)
def test_the_gate_is_asked_only_for_done_and_only_at_the_moment_of_transition() -> None:
    """Conditions are evaluated against current evidence, not evidence captured earlier."""
    asked: list[DeliveryState] = []

    def gate(record: DeliveryRecord, request: TransitionRequest) -> Sequence[UnmetCondition]:
        asked.append(request.target)
        return ()

    moved = apply_transition(record_in(RUNNING), request_for(REVIEW), completion=gate)
    assert moved.accepted
    assert asked == []  # not a Done transition: nothing to gate

    done = apply_transition(record_in(REVIEW), request_for(DONE), completion=gate)
    assert done.accepted
    assert asked == [DONE]


# -- the audit record (SWR-3213) -------------------------------------------


@verifies(SWR.SWR_3203, SWR.SWR_3213)
def test_an_accepted_transition_yields_exactly_one_audit_record_and_a_refusal_none() -> None:
    """Actor, time, requirement hash and cause, once per accepted move."""
    accepted = apply_transition(
        record_in(READY),
        TransitionRequest(
            req_id=REQ,
            target=RUNNING,
            actor=SYSTEM,
            cause=TransitionCause.RUN_STARTED,
            at=LATER,
            requirement_hash="hash-now",
            run_id="run-7",
        ),
    )
    record = accepted.transition
    assert record is not None
    assert (record.req_id, record.source, record.target) == (REQ, READY, RUNNING)
    assert record.actor == SYSTEM
    assert record.at == LATER
    assert record.cause is TransitionCause.RUN_STARTED
    assert record.requirement_hash == "hash-now"
    assert record.run_id == "run-7"
    assert record.satisfied_hash is None
    assert "Ready → Running" in record.message

    refused = apply_transition(record_in(BACKLOG), request_for(DONE))
    assert refused.transition is None


@verifies(SWR.SWR_3203, SWR.SWR_3204, SWR.SWR_3213)
def test_the_done_record_names_the_version_that_was_delivered() -> None:
    """The audit record carries the satisfied hash beside the hash at acceptance time."""
    outcome = apply_transition(record_in(REVIEW), request_for(DONE), completion=passing)

    assert outcome.accepted
    transition = outcome.transition
    assert transition is not None
    assert transition.satisfied_hash == "hash-at-run-start"
    assert transition.requirement_hash == "hash-now"
    assert transition.run_id == "run-1"
    assert outcome.record.satisfied_hash == "hash-at-run-start"


@verifies(SWR.SWR_3203)
def test_a_transition_cannot_be_applied_to_another_requirements_record() -> None:
    """Two boards moving at once must not write each other's state."""
    with pytest.raises(ValueError, match="applied to"):
        apply_transition(record_in(READY, req_id="SWR-3299"), request_for(RUNNING))


# -- the persisting half (SWR-3203 + SWR-3205) -----------------------------


@verifies(SWR.SWR_3203, SWR.SWR_3205)
def test_the_store_bound_transition_persists_an_acceptance(tmp_path: Path) -> None:
    """The system actor's write path: decide, then persist, under one lock."""
    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store)

    assert transitions.apply(request_for(READY, actor=USER)).accepted
    started = transitions.apply(request_for(RUNNING))
    assert started.accepted
    assert store.read(REQ).state is RUNNING
    assert store.read(REQ).delivery.changed_by == SYSTEM
    assert store.read(REQ).updated_at is not None


@verifies(SWR.SWR_3203)
def test_a_refused_transition_leaves_the_stored_record_byte_identical(tmp_path: Path) -> None:
    """ "Rejected leaves the stored state unchanged" — including the file on disk."""
    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store)
    transitions.apply(request_for(READY, actor=USER))

    path = store.path_for(REQ)
    before = path.read_bytes()

    refused = transitions.apply(request_for(DONE))
    assert not refused.accepted
    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.ILLEGAL_EDGE
    assert path.read_bytes() == before
    assert store.read(REQ).state is READY


@verifies(SWR.SWR_3203, SWR.SWR_3215)
def test_the_gate_configured_on_the_writer_applies_to_every_attempt(tmp_path: Path) -> None:
    """Slice 4 and slice 6 share one writer, so they share one completion policy."""

    def gate(record: DeliveryRecord, request: TransitionRequest) -> Sequence[UnmetCondition]:
        return (UnmetCondition(name="integration-complete"),)

    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store, completion=gate)
    transitions.apply(request_for(READY, actor=USER))
    transitions.apply(request_for(RUNNING))
    transitions.apply(request_for(REVIEW))

    refused = transitions.apply(request_for(DONE, actor=USER))
    assert not refused.accepted
    assert refused.refusal is not None
    assert [condition.name for condition in refused.refusal.unmet] == ["integration-complete"]
    assert store.read(REQ).state is REVIEW
