"""Productive use: a requirement was built, verified and marked Done — and then somebody
edits it. The board must not quietly keep the green badge, and must not throw away what
was already built either.
Expected outcome: hash divergence moves a Done requirement to Needs Update and never to
Backlog; the satisfied hash, the delivering run and the verified commit stay retrievable
afterwards; a requirement that was never Done is untouched by a hash change; restoring the
text to the delivered version asks for Done again without a new run, but only while the
evidence is still current; and every accepted move — and only an accepted move — leaves an
audit entry.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.detection import (
    SPECIFICATION_ACTOR,
    NeedsUpdatePass,
    PropagationLoopError,
    SpecificationAssessment,
    SpecificationVerdict,
    assess_specification,
)
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

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.requirements.delivery.audit import AuditEvent
    from rotaris_core.requirements.delivery.transitions import TransitionRequest

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
DELIVERED_HASH = "aaaa111122223333"
EDITED_HASH = "bbbb444455556666"
RUN = "run-17"
COMMIT = "c0ffee1234"
AT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(hours=3)
RUNNER = DeliveryActor.system("requirement-runner")


def delivery(hash_: str = DELIVERED_HASH) -> SatisfiedDelivery:
    """The record one delivering run left behind (SWR-3204)."""
    return SatisfiedDelivery(
        req_id=REQ,
        satisfied_hash=hash_,
        run_id=RUN,
        satisfied_at=AT,
        verified_commit=COMMIT,
    )


def record_in(
    state: DeliveryState,
    *,
    delivered: bool = True,
    req_id: str = REQ,
    hash_: str = DELIVERED_HASH,
) -> DeliveryRecord:
    """A delivery record in *state*, with or without a delivery behind it."""
    status = (
        DeliveryStatus()
        if state is DeliveryState.BACKLOG
        else DeliveryStatus(
            state=state,
            changed_at=AT,
            changed_by=RUNNER,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            requirement_hash=hash_,
        )
    )
    entries = (
        (
            SatisfiedDelivery(
                req_id=req_id,
                satisfied_hash=hash_,
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
    """The real state machine (SWR-3203) over records held in memory.

    Not a mock: :func:`apply_transition` decides, so a move this test reports as
    accepted is one the product would accept too. The completion gate answers
    "every condition holds", because what SWR-3502 is about is the *edge*, not
    SWR-3215's conditions.
    """

    def __init__(self, records: Sequence[DeliveryRecord]) -> None:
        self.records = {record.req_id: record for record in records}
        self.requests: list[TransitionRequest] = []

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        self.requests.append(request)
        record = self.records[request.req_id]
        outcome = apply_transition(
            record,
            request,
            completion=lambda _record, _request: (),
        )
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
# The rule (SWR-3502)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3502)
def test_a_done_requirement_whose_hash_moved_asks_for_needs_update() -> None:
    """The central rule: divergence between current and satisfied hash."""
    assessment = assess_specification(record_in(DeliveryState.DONE), current_hash=EDITED_HASH)

    assert assessment.verdict is SpecificationVerdict.DIVERGED
    assert assessment.target is DeliveryState.NEEDS_UPDATE
    assert assessment.satisfied_hash == DELIVERED_HASH
    assert assessment.current_hash == EDITED_HASH
    assert assessment.moves


@verifies(SWR.SWR_3502)
def test_a_specification_change_can_never_ask_for_backlog() -> None:
    """ "Already built, against an older version" is not the same as "not started".

    Refused in the value itself rather than checked at every call site: an
    assessment that asked for Backlog would throw away the run, the commit and
    the hash that are the most valuable thing about the card.
    """
    with pytest.raises(ValidationError, match="never sends a delivered requirement back"):
        SpecificationAssessment(
            req_id=REQ,
            verdict=SpecificationVerdict.DIVERGED,
            state=DeliveryState.DONE,
            target=DeliveryState.BACKLOG,
        )


@verifies(SWR.SWR_3502)
def test_a_done_requirement_that_still_matches_is_steady() -> None:
    """No divergence, no move, no audit line."""
    assessment = assess_specification(record_in(DeliveryState.DONE), current_hash=DELIVERED_HASH)

    assert assessment.verdict is SpecificationVerdict.STEADY
    assert assessment.target is None
    assert not assessment.moves


@pytest.mark.parametrize(
    "state",
    [DeliveryState.BACKLOG, DeliveryState.READY, DeliveryState.REVIEW],
)
@verifies(SWR.SWR_3502)
def test_a_requirement_that_was_never_done_is_unaffected_by_a_hash_change(
    state: DeliveryState,
) -> None:
    """A hash change cannot invalidate a claim nobody ever made."""
    assessment = assess_specification(
        record_in(state, delivered=False),
        current_hash=EDITED_HASH,
    )

    assert assessment.verdict is SpecificationVerdict.UNAFFECTED
    assert assessment.target is None
    assert assessment.satisfied_hash is None
    assert assessment.retained is None


@verifies(SWR.SWR_3502)
def test_a_delivered_requirement_that_is_running_again_is_left_alone() -> None:
    """A re-run in flight is not the specification's business."""
    assessment = assess_specification(
        record_in(DeliveryState.RUNNING),
        current_hash=EDITED_HASH,
    )

    assert assessment.verdict is SpecificationVerdict.UNAFFECTED
    assert assessment.target is None


@verifies(SWR.SWR_3502)
def test_restoring_the_text_asks_for_done_again_without_a_new_run() -> None:
    """The delivered version came back, so the delivery that already stands stands.

    The request carries the *existing* satisfied delivery — same run, same
    commit, same hash. Minting a new one would claim a run that never happened.
    """
    needs_update = record_in(DeliveryState.NEEDS_UPDATE)
    assessment = assess_specification(needs_update, current_hash=DELIVERED_HASH)

    assert assessment.verdict is SpecificationVerdict.RESTORED
    assert assessment.target is DeliveryState.DONE

    request = NeedsUpdatePass(StateMachineDoor([needs_update])).request_for(assessment, at=LATER)

    assert request is not None
    assert request.target is DeliveryState.DONE
    assert request.delivery == delivery()
    assert request.run_id == RUN
    assert request.cause is TransitionCause.SPECIFICATION_CHANGED
    assert request.actor == SPECIFICATION_ACTOR


@verifies(SWR.SWR_3502)
def test_a_restore_without_current_evidence_does_not_re_grant_done() -> None:
    """ "The text is what we built" and "what we built still passes" are two claims."""
    assessment = assess_specification(
        record_in(DeliveryState.NEEDS_UPDATE),
        current_hash=DELIVERED_HASH,
        evidence_current=False,
    )

    assert assessment.verdict is SpecificationVerdict.AWAITING_EVIDENCE
    assert assessment.target is None
    assert not assessment.moves
    assert "evidence is not current" in assessment.message


@verifies(SWR.SWR_3502)
def test_a_requirement_still_diverged_in_needs_update_stays_put() -> None:
    """Being already in Needs Update is not a reason to move it again."""
    assessment = assess_specification(
        record_in(DeliveryState.NEEDS_UPDATE),
        current_hash=EDITED_HASH,
    )

    assert assessment.verdict is SpecificationVerdict.STEADY
    assert assessment.target is None


# --------------------------------------------------------------------------
# The pass: the rule through the state machine and the trail
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3502, SWR.SWR_3204)
def test_the_move_keeps_the_satisfied_hash_the_run_and_the_commit() -> None:
    """What was built survives the move — that is the whole point of Needs Update."""
    done = record_in(DeliveryState.DONE)
    door = StateMachineDoor([done])
    outcome = NeedsUpdatePass(door).apply(
        assess_specification(done, current_hash=EDITED_HASH),
        at=LATER,
    )

    assert outcome.moved
    moved = door.records[REQ]
    assert moved.state is DeliveryState.NEEDS_UPDATE
    assert moved.satisfied_hash == DELIVERED_HASH
    assert moved.satisfied.current is not None
    assert moved.satisfied.current.run_id == RUN
    assert moved.satisfied.current.verified_commit == COMMIT
    assert moved.delivery.requirement_hash == EDITED_HASH


@verifies(SWR.SWR_3502, SWR.SWR_3213)
def test_an_accepted_move_is_recorded_in_the_audit_trail() -> None:
    """One event, naming both versions, the run and the commit (SWR-3213)."""
    done = record_in(DeliveryState.DONE)
    trail = Trail()
    outcome = NeedsUpdatePass(StateMachineDoor([done]), audit=trail).apply(
        assess_specification(done, current_hash=EDITED_HASH),
        at=LATER,
    )

    assert outcome.moved
    assert len(trail.events) == 1
    event = trail.events[0]
    assert event.kind is AuditEventKind.SPECIFICATION_CHANGED
    assert event.req_id == REQ
    assert event.from_state is DeliveryState.DONE
    assert event.to_state is DeliveryState.NEEDS_UPDATE
    assert event.requirement_hash == EDITED_HASH
    assert event.satisfied_hash == DELIVERED_HASH
    assert event.run_id == RUN
    assert event.commit == COMMIT
    assert event.at == LATER
    assert outcome.event == event


@verifies(SWR.SWR_3502, SWR.SWR_3213)
def test_a_refused_move_leaves_no_audit_entry() -> None:
    """The trail must never claim something the state machine did not do."""
    done = record_in(DeliveryState.DONE)
    trail = Trail()
    door = RefusingDoor(done)
    outcome = NeedsUpdatePass(door, audit=trail).apply(
        assess_specification(done, current_hash=EDITED_HASH),
        at=LATER,
    )

    assert door.requests, "the transition was attempted"
    assert not outcome.moved
    assert outcome.refused
    assert trail.events == []


@verifies(SWR.SWR_3502)
def test_an_assessment_that_asks_for_nothing_costs_nothing() -> None:
    """Safe to run on every evaluation: no transition, no audit line, no write."""
    steady = record_in(DeliveryState.DONE)
    door = StateMachineDoor([steady])
    trail = Trail()

    outcome = NeedsUpdatePass(door, audit=trail).apply(
        assess_specification(steady, current_hash=DELIVERED_HASH),
        at=LATER,
    )

    assert door.requests == []
    assert trail.events == []
    assert outcome.outcome is None
    assert not outcome.moved


@verifies(SWR.SWR_3502)
def test_a_whole_pass_moves_only_the_requirements_whose_text_moved() -> None:
    """One evaluation over several records, in id order, touching only what diverged."""
    moved = record_in(DeliveryState.DONE, req_id="SWR-9001")
    steady = record_in(DeliveryState.DONE, req_id="SWR-9002")
    never = record_in(DeliveryState.READY, req_id="SWR-9003", delivered=False)
    door = StateMachineDoor([moved, steady, never])
    trail = Trail()

    outcomes = NeedsUpdatePass(door, audit=trail).run(
        [never, steady, moved],
        {
            "SWR-9001": EDITED_HASH,
            "SWR-9002": DELIVERED_HASH,
            "SWR-9003": EDITED_HASH,
        },
        at=LATER,
    )

    assert [outcome.assessment.req_id for outcome in outcomes] == [
        "SWR-9001",
        "SWR-9002",
        "SWR-9003",
    ]
    assert [outcome.moved for outcome in outcomes] == [True, False, False]
    assert door.records["SWR-9001"].state is DeliveryState.NEEDS_UPDATE
    assert door.records["SWR-9002"].state is DeliveryState.DONE
    assert door.records["SWR-9003"].state is DeliveryState.READY
    assert [event.req_id for event in trail.events] == ["SWR-9001"]


@verifies(SWR.SWR_3502)
def test_a_requirement_the_current_read_did_not_contain_is_skipped() -> None:
    """An unreadable or removed requirement is SWR-3509's question, not this one's.

    Treating a missing hash as "changed to nothing" would move every delivered
    requirement of a source that failed to load into Needs Update in one pass.
    """
    done = record_in(DeliveryState.DONE)
    door = StateMachineDoor([done])

    outcomes = NeedsUpdatePass(door).run([done], {}, at=LATER)

    assert outcomes == ()
    assert door.requests == []
    assert door.records[REQ].state is DeliveryState.DONE


@verifies(SWR.SWR_3502)
def test_the_pass_acts_as_a_named_system_actor() -> None:
    """ "The specification moved and Rotaris noticed" is not "somebody dragged a card"."""
    done = record_in(DeliveryState.DONE)
    door = StateMachineDoor([done])

    NeedsUpdatePass(door).apply(assess_specification(done, current_hash=EDITED_HASH), at=LATER)

    assert door.requests[0].actor == SPECIFICATION_ACTOR
    assert door.requests[0].actor.name == "change-detection"
    assert door.records[REQ].delivery.changed_by == SPECIFICATION_ACTOR


@verifies(SWR.SWR_3502)
def test_a_door_that_evaluates_on_write_cannot_nest_a_second_pass() -> None:
    """The docstring's "propagation terminates by construction", checked.

    The pass walks a finite set of records and holds nothing that could ask for
    another evaluation — but both collaborators are *injected*, so that is a
    claim about values the pass never sees the type of. A door that evaluates on
    write (an audit-driven re-evaluation, a store that recomputes health) would
    otherwise recurse here until the stack ran out, and the first pass would be
    reading a half-applied state the whole way down.
    """
    done = record_in(DeliveryState.DONE)
    holder: dict[str, NeedsUpdatePass] = {}

    class ReentrantDoor:
        """A transition door that re-evaluates everything on every write."""

        def __init__(self) -> None:
            self.depth = 0

        def apply(self, request: TransitionRequest) -> TransitionOutcome:
            self.depth += 1
            holder["pass"].run([done], {REQ: EDITED_HASH}, at=LATER)
            raise AssertionError("the nested pass should have been refused")

    door = ReentrantDoor()
    holder["pass"] = NeedsUpdatePass(door)

    with pytest.raises(PropagationLoopError, match="re-entered"):
        holder["pass"].run([done], {REQ: EDITED_HASH}, at=LATER)

    assert door.depth == 1, "the second pass never reached the door"

    # The guard reopens: one failure must not turn a loop into a deadlock.
    steady = StateMachineDoor([record_in(DeliveryState.DONE)])
    reusable = NeedsUpdatePass(steady)
    assert reusable.run([done], {REQ: EDITED_HASH}, at=LATER)
    assert reusable.run([done], {REQ: EDITED_HASH}, at=LATER)
