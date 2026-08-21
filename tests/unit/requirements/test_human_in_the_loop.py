"""Productive use: Rotaris works on a requirement on its own, and hits one of the seven
things it must not decide alone — a contradiction, a breaking change, a risky migration.
Expected outcome: each of those seven produces a stated decision with named options and the
consequence of each, parks the requirement in Blocked or in Review, and records who was
asked and when; the answer is recorded with its actor and its time; an answer naming an
option nobody offered is refused; and everything *not* on the list — a flaky test, a slow
suite, a lint violation — costs the autonomous run nothing at all.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.decisions import (
    DECISION_TARGETS,
    DECISION_TRIGGERS,
    DecisionError,
    DecisionLog,
    DecisionOption,
    DecisionRecord,
    DecisionTrigger,
    HumanDecisions,
    PendingDecision,
    decision_trigger,
    interrupting,
    is_concrete_question,
)
from rotaris_core.requirements.change.detection import PropagationLoopError
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
    apply_transition,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.requirements.delivery.audit import AuditEvent
    from rotaris_core.requirements.delivery.transitions import TransitionRequest

pytestmark = pytest.mark.unit

REQ = "SWR-9002"
HASH = "abcd0000eeee1111"
RUN = "run-88"
AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(hours=2)
RUNNER = DeliveryActor.system("requirement-runner")
REVIEWER = DeliveryActor.user("dvf")

#: One concrete question per trigger. Each of them names the requirement and the
#: thing that is undecidable — which is what SWR-3512 asks for and what a
#: generic "needs clarification" cannot do.
QUESTIONS: dict[DecisionTrigger, str] = {
    DecisionTrigger.CONTRADICTORY_REQUIREMENTS: (
        "SWR-9002 says the basket locks after three failures and SWR-9003 says it never"
        " locks — which of the two stands?"
    ),
    DecisionTrigger.UNCLEAR_SCOPE: (
        "Does 'the receipt shows the tax' mean the line items too, or only the total?"
    ),
    DecisionTrigger.COMPETING_REQUIREMENTS: (
        "SWR-9002 wants the fastest checkout and SWR-9004 wants a confirmation step —"
        " which one wins at the payment screen?"
    ),
    DecisionTrigger.BREAKING_CHANGE: (
        "Delivering SWR-9002 changes the receipt payload every integration reads —"
        " should the old field be kept alongside the new one?"
    ),
    DecisionTrigger.UNCLEAR_SUPERSEDING: (
        "Does SWR-9002 replace SWR-9003 entirely, or only its second acceptance criterion?"
    ),
    DecisionTrigger.RISKY_MIGRATION: (
        "The migration rewrites 41 traces and deletes 6 covering tests — should it run"
        " in one commit or one per module?"
    ),
    DecisionTrigger.ARCHITECTURAL_DECISION: (
        "Should the receipt renderer live in the delivery package or behind the export boundary?"
    ),
}


def options() -> tuple[DecisionOption, ...]:
    """Two alternatives, each naming what choosing it would cost."""
    return (
        DecisionOption(
            name="keep the current behaviour",
            consequence="every existing integration keeps working and SWR-9002 stays unbuilt",
        ),
        DecisionOption(
            name="deliver the change",
            consequence="SWR-9002 is delivered and every integration has to be updated",
        ),
    )


def pending_for(trigger: DecisionTrigger, *, at: dt.datetime = AT) -> PendingDecision:
    """The decision *trigger* puts to a person."""
    return PendingDecision.raised(
        REQ,
        trigger,
        question=QUESTIONS[trigger],
        options=options(),
        at=at,
        requirement_hash=HASH,
    )


def record_in(state: DeliveryState, *, reason: str = "") -> DeliveryRecord:
    """A delivery record in *state*, with a delivery behind it."""
    if state is DeliveryState.BACKLOG:
        status = DeliveryStatus()
    else:
        status = DeliveryStatus(
            state=state,
            blocked_reason=reason if state is DeliveryState.BLOCKED else "",
            blocked_from=DeliveryState.READY if state is DeliveryState.BLOCKED else None,
            changed_at=AT,
            changed_by=RUNNER,
            cause=TransitionCause.RUN_STARTED,
            requirement_hash=HASH,
        )
    return DeliveryRecord(
        req_id=REQ,
        delivery=status,
        satisfied=SatisfiedLog(
            entries=(
                SatisfiedDelivery(
                    req_id=REQ,
                    satisfied_hash=HASH,
                    run_id=RUN,
                    satisfied_at=AT,
                ),
            ),
        ),
    )


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
# The seven decision points (SWR-3512)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3512)
def test_the_list_of_decisions_is_the_seven_swr_3512_enumerates() -> None:
    """Closed and complete: the user knows exactly what will come back to them."""
    assert len(DECISION_TRIGGERS) == 7
    assert set(DECISION_TRIGGERS) == set(DecisionTrigger)
    assert set(DECISION_TARGETS) == set(DecisionTrigger), "every trigger names where it waits"


@pytest.mark.parametrize("trigger", list(DecisionTrigger))
@verifies(SWR.SWR_3512)
def test_each_trigger_produces_a_stated_decision_not_a_generic_block(
    trigger: DecisionTrigger,
) -> None:
    """SWR-3512's first two acceptance criteria, for all seven triggers."""
    pending = pending_for(trigger)

    assert is_concrete_question(pending.question)
    assert len(pending.options) >= 2
    for option in pending.options:
        assert option.consequence.strip(), "every option names what follows from choosing it"
        assert option.message.startswith(option.name)
    assert pending.waits_in in {DeliveryState.BLOCKED, DeliveryState.REVIEW}
    assert pending.waits_in is DECISION_TARGETS[trigger]


@verifies(SWR.SWR_3512)
def test_a_decision_with_something_to_look_at_waits_in_review() -> None:
    """A breaking change and a risky migration come with a proposal; the rest do not."""
    reviewed = {
        trigger for trigger, state in DECISION_TARGETS.items() if state is DeliveryState.REVIEW
    }

    assert reviewed == {DecisionTrigger.BREAKING_CHANGE, DecisionTrigger.RISKY_MIGRATION}


@verifies(SWR.SWR_3512, SWR.SWR_3506)
def test_a_generic_block_is_not_representable() -> None:
    """ "Blocked: unclear requirement" is exactly what SWR-3512 exists to prevent."""
    with pytest.raises(DecisionError, match="not a question a person can answer"):
        PendingDecision.raised(
            REQ,
            DecisionTrigger.UNCLEAR_SCOPE,
            question="unclear requirement",
            options=options(),
            at=AT,
        )


@verifies(SWR.SWR_3512)
def test_a_decision_with_one_option_is_not_a_decision() -> None:
    """With one option there is nothing to decide, so there is nobody to ask."""
    with pytest.raises(DecisionError, match="at least two options"):
        PendingDecision.raised(
            REQ,
            DecisionTrigger.BREAKING_CHANGE,
            question=QUESTIONS[DecisionTrigger.BREAKING_CHANGE],
            options=options()[:1],
            at=AT,
        )


@verifies(SWR.SWR_3512)
def test_an_option_without_a_consequence_is_refused() -> None:
    """An option list without consequences is a menu, not a decision."""
    with pytest.raises(DecisionError, match="what follows from it"):
        DecisionOption(name="deliver the change", consequence="   ")


# --------------------------------------------------------------------------
# Nothing outside the list interrupts (SWR-3512)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3512)
def test_an_ordinary_run_is_not_interrupted() -> None:
    """A flaky test and a slow suite are the run's own business."""
    observed = (
        "flaky test",
        "slow suite",
        "lint violation",
        "merge conflict",
        "coverage dropped",
        "",
        None,
    )

    assert interrupting(observed) == ()
    assert all(decision_trigger(condition) is None for condition in observed)


@verifies(SWR.SWR_3512)
def test_the_listed_conditions_interrupt_once_each_and_in_order() -> None:
    """Aliases resolve, duplicates collapse, and the order is the enum's."""
    observed = (
        "risky migration",
        "breaking",
        "contradiction",
        "breaking-change",
        "flaky test",
    )

    assert interrupting(observed) == (
        DecisionTrigger.CONTRADICTORY_REQUIREMENTS,
        DecisionTrigger.BREAKING_CHANGE,
        DecisionTrigger.RISKY_MIGRATION,
    )


@verifies(SWR.SWR_3512)
def test_an_alias_nobody_declared_is_not_a_trigger() -> None:
    """The list stays closed: near-misses do not become an eighth reason to stop."""
    assert decision_trigger("slightly-risky") is None
    assert decision_trigger("architectural_decision") is DecisionTrigger.ARCHITECTURAL_DECISION
    assert decision_trigger(DecisionTrigger.UNCLEAR_SCOPE) is DecisionTrigger.UNCLEAR_SCOPE


# --------------------------------------------------------------------------
# Asking, and recording that we asked (SWR-3512, SWR-3213)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3512, SWR.SWR_3213)
def test_raising_a_decision_parks_the_requirement_and_records_who_was_asked() -> None:
    """The question travels as the blocker's reason and into the audit trail."""
    running = record_in(DeliveryState.RUNNING)
    door = StateMachineDoor([running])
    trail = Trail()
    pending = pending_for(DecisionTrigger.CONTRADICTORY_REQUIREMENTS)

    outcome = HumanDecisions(door, audit=trail).raise_for(pending)

    assert outcome.moved
    stored = door.records[REQ]
    assert stored.state is DeliveryState.BLOCKED
    assert stored.delivery.blocked_reason == pending.question
    assert len(trail.events) == 1
    event = trail.events[0]
    assert event.kind is AuditEventKind.DELIVERY_TRANSITION
    assert event.actor == pending.raised_by
    assert event.at == AT
    assert event.to_state is DeliveryState.BLOCKED
    assert event.reason == pending.question
    assert event.evidence == pending.consequences
    assert pending.decision_id in event.detail


@verifies(SWR.SWR_3512)
def test_a_breaking_change_reaches_review_while_the_run_is_in_flight() -> None:
    """The proposal exists, so a person reviews it rather than unblocking it."""
    door = StateMachineDoor([record_in(DeliveryState.RUNNING)])
    pending = pending_for(DecisionTrigger.BREAKING_CHANGE)

    outcome = HumanDecisions(door).raise_for(pending, cause=TransitionCause.RUN_COMPLETED)

    assert outcome.moved
    assert door.records[REQ].state is DeliveryState.REVIEW


@verifies(SWR.SWR_3512, SWR.SWR_3213)
def test_a_refused_move_leaves_no_claim_that_the_user_was_asked() -> None:
    """The trail must never claim something the state machine did not do."""
    door = RefusingDoor(record_in(DeliveryState.RUNNING))
    trail = Trail()

    outcome = HumanDecisions(door, audit=trail).raise_for(
        pending_for(DecisionTrigger.RISKY_MIGRATION),
    )

    assert door.requests, "the transition was attempted"
    assert outcome.refused
    assert trail.events == []


@verifies(SWR.SWR_3512)
def test_answering_records_the_decision_its_actor_and_its_time() -> None:
    """SWR-3512's third acceptance criterion."""
    blocked = record_in(DeliveryState.BLOCKED, reason=QUESTIONS[DecisionTrigger.UNCLEAR_SCOPE])
    door = StateMachineDoor([blocked])
    trail = Trail()
    pending = pending_for(DecisionTrigger.UNCLEAR_SCOPE)

    outcome = HumanDecisions(door, audit=trail).answer(
        pending,
        "deliver the change",
        by=REVIEWER,
        at=LATER,
        rationale="the integrations are ours",
        resume_to=DeliveryState.READY,
    )

    assert outcome.moved
    record = outcome.record
    assert record is not None
    assert record.chosen == "deliver the change"
    assert record.consequence == options()[1].consequence
    assert record.answered_by == REVIEWER
    assert record.answered_at == LATER
    assert record.decision_id == pending.decision_id
    assert door.records[REQ].state is DeliveryState.READY
    event = trail.events[-1]
    assert event.actor == REVIEWER
    assert event.at == LATER
    assert event.cause is TransitionCause.BLOCKER_CLEARED
    assert pending.question in event.evidence


@verifies(SWR.SWR_3512)
def test_a_decision_is_recorded_even_when_the_work_is_scheduled_separately() -> None:
    """ "Decided, not resumed" is a normal shape; nothing here starts the work."""
    door = StateMachineDoor([record_in(DeliveryState.BLOCKED, reason="x?" * 20)])
    trail = Trail()

    outcome = HumanDecisions(door, audit=trail).answer(
        pending_for(DecisionTrigger.ARCHITECTURAL_DECISION),
        "keep the current behaviour",
        by=REVIEWER,
        at=LATER,
    )

    assert outcome.record is not None
    assert outcome.outcome is None, "no transition was attempted"
    assert door.requests == []
    assert len(trail.events) == 1


@verifies(SWR.SWR_3512)
def test_an_answer_that_names_no_offered_option_is_refused() -> None:
    """A trail claiming an option nobody proposed is worse than no trail."""
    pending = pending_for(DecisionTrigger.COMPETING_REQUIREMENTS)

    with pytest.raises(DecisionError, match="not one of the options offered"):
        pending.answered("do both", by=REVIEWER, at=LATER)


@verifies(SWR.SWR_3512)
def test_the_answer_keeps_the_alternative_it_turned_down() -> None:
    """Months later, "we kept the old behaviour" means nothing without the other option."""
    pending = pending_for(DecisionTrigger.BREAKING_CHANGE)

    record = pending.answered("keep the current behaviour", by=REVIEWER, at=LATER)

    assert record.options == pending.options
    assert record.question == pending.question
    assert "deliver the change" in {option.name for option in record.options}
    assert REVIEWER.label in record.message


@verifies(SWR.SWR_3512)
def test_the_decision_log_only_ever_grows() -> None:
    """A reversed decision is two records, which is how "we changed our mind" survives."""
    log = DecisionLog(req_id=REQ)
    first = pending_for(DecisionTrigger.BREAKING_CHANGE).answered(
        "keep the current behaviour",
        by=REVIEWER,
        at=AT,
    )
    second = pending_for(DecisionTrigger.BREAKING_CHANGE, at=LATER).answered(
        "deliver the change",
        by=REVIEWER,
        at=LATER,
    )

    grown = log.appended(first).appended(second)

    assert grown.records == (first, second)
    assert grown.latest is second
    assert log.empty, "the original value is untouched"
    assert grown.get(first.decision_id) is first
    assert grown.of_trigger(DecisionTrigger.BREAKING_CHANGE) == (first, second)
    assert not [name for name in dir(DecisionLog) if name in {"remove", "pop", "clear", "replace"}]


@verifies(SWR.SWR_3512)
def test_a_decision_cannot_be_filed_under_another_requirement() -> None:
    """One requirement's reasoning attributed to another is worse than a gap."""
    record = pending_for(DecisionTrigger.UNCLEAR_SUPERSEDING).answered(
        "deliver the change",
        by=REVIEWER,
        at=LATER,
    )

    with pytest.raises(DecisionError, match="cannot be appended"):
        DecisionLog(req_id="SWR-9999").appended(record)


@verifies(SWR.SWR_3512)
def test_an_agent_cannot_answer_the_question_it_was_blocked_on() -> None:
    """The word "human" made into a type.

    SWR-3512 exists so a small set of decisions "reach the user rather than being
    decided by an agent". The delivery matrix permits both actor kinds out of
    ``Blocked``, so nothing but this check stands between an agent answering its
    own question and the requirement quietly continuing — with an audit trail
    that reads perfectly, because a ``DeliveryActor`` records whatever kind it
    was given.
    """
    pending = pending_for(DecisionTrigger.RISKY_MIGRATION)
    door = StateMachineDoor([record_in(DeliveryState.BLOCKED, reason=pending.question)])
    decisions = HumanDecisions(door)
    agent = DeliveryActor.system("impact-analyst")

    with pytest.raises(DecisionError, match="is not a person"):
        pending.answered("keep the current behaviour", by=agent, at=LATER)

    with pytest.raises(DecisionError, match="is not a person"):
        decisions.answer(
            pending,
            "keep the current behaviour",
            by=agent,
            at=LATER,
            resume_to=DeliveryState.BACKLOG,
        )

    # Nothing moved and nothing was recorded: the refusal happens before the
    # state machine is touched.
    assert door.requests == []
    assert door.records[REQ].state is DeliveryState.BLOCKED

    # An unnamed person is refused too — "user" alone is not an audit trail.
    with pytest.raises(DecisionError, match="names the person"):
        pending.answered("keep the current behaviour", by=DeliveryActor.user(""), at=LATER)

    # And the named person goes through.
    record = pending.answered("keep the current behaviour", by=REVIEWER, at=LATER)
    assert record.answered_by is REVIEWER


@verifies(SWR.SWR_3512, SWR.SWR_3213)
def test_a_record_of_an_agent_deciding_cannot_be_constructed_at_all() -> None:
    """The gate is on the record, not only on the one method that builds it.

    :class:`DecisionRecord` is a public model. If the check lived only in
    :meth:`PendingDecision.answered`, an audit trail could still be handed a
    record saying a system actor decided — and the trail is what everything
    downstream trusts.
    """
    pending = pending_for(DecisionTrigger.ARCHITECTURAL_DECISION)
    honest = pending.answered("deliver the change", by=REVIEWER, at=LATER)

    with pytest.raises(DecisionError, match="is not a person"):
        DecisionRecord(
            decision_id=honest.decision_id,
            req_id=honest.req_id,
            trigger=honest.trigger,
            question=honest.question,
            options=honest.options,
            chosen=honest.chosen,
            consequence=honest.consequence,
            answered_by=DeliveryActor.system("requirement-runner"),
            answered_at=LATER,
        )

    assert honest.to_event().actor is REVIEWER


@verifies(SWR.SWR_3512)
def test_a_decision_point_cannot_do_the_work_it_postpones() -> None:
    """No analyst, no runner: a decision point cannot 'helpfully' proceed."""
    decisions = HumanDecisions(StateMachineDoor([record_in(DeliveryState.RUNNING)]))

    assert analyser_free_report(decisions) == ()


@verifies(SWR.SWR_3512)
def test_a_door_that_decides_on_write_cannot_nest_a_second_decision() -> None:
    """The claim in the class docstring, checked rather than asserted.

    Both collaborators are injected, so "holds nothing that could ask for another
    pass" is a claim about values ``HumanDecisions`` never sees the type of. A
    door that raises the same decision again on write would otherwise recurse
    until the stack ran out.
    """
    pending = pending_for(DecisionTrigger.BREAKING_CHANGE)
    holder: dict[str, HumanDecisions] = {}

    class ReentrantDoor:
        """A transition door that evaluates — and so decides — on write."""

        def __init__(self) -> None:
            self.depth = 0

        def apply(self, request: TransitionRequest) -> TransitionOutcome:
            self.depth += 1
            holder["decisions"].raise_for(pending)
            return TransitionOutcome(request=request)

    door = ReentrantDoor()
    holder["decisions"] = HumanDecisions(door)

    with pytest.raises(PropagationLoopError, match="re-entered"):
        holder["decisions"].raise_for(pending)

    assert door.depth == 1, "the second pass never started"
