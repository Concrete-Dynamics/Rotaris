"""Productive use: the board is open while the user works. They commit, switch branch,
finish a run, integrate a worktree — and the cards that changed update themselves, once
per burst, without the window freezing and without the board ever driving itself in a
loop.
Expected outcome: each repository event triggers exactly one evaluation and a burst
within the debounce window triggers one; the pass publishes *which* requirements moved; a
failing pass leaves the previous projection standing; an evaluation cannot trigger an
evaluation, so a pass always terminates; and an evaluation refuses to run on the UI
thread."""

from __future__ import annotations

import datetime as dt
import threading

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evaluation import (
    ALL_EVALUATION_TRIGGERS,
    EvaluationChange,
    EvaluationEvent,
    EvaluationFailure,
    EvaluationOnUiThreadError,
    EvaluationOutcome,
    EvaluationReentryError,
    EvaluationRequest,
    EvaluationTrigger,
    RequirementEvaluator,
)
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceProjection,
    EvidenceState,
    VerificationRecord,
    project_evidence,
)
from rotaris_core.requirements.delivery.obligations import resolve_obligations
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
DEBOUNCE_MS = 400
AFTER_WINDOW = AT + dt.timedelta(milliseconds=DEBOUNCE_MS)
REQ_ID = "SWR-3210"


def projection(req_id: str = REQ_ID, *, healthy: bool) -> EvidenceProjection:
    """A projection of *req_id* whose covering test passed, or did not."""
    requirement = CanonicalRequirement(req_id=req_id, title="Continuous evaluation")
    return project_evidence(
        resolve_obligations(requirement),
        EvidenceInputs(
            req_id=req_id,
            implementations=(RequirementSite(path="src/rotaris_core/module.py", line=4),),
            covering_tests=(
                CoveringTest(
                    path="tests/unit/test_module.py",
                    line=9,
                    executed=True,
                    check_name="pytest",
                    check_status="passed" if healthy else "failed",
                ),
            ),
            verification=VerificationRecord(
                verdict="passed" if healthy else "failed",
                commit="c0ffee123456",
                requirement_hash="hash-1",
                run_id="run-1",
            ),
        ),
    )


def event(
    trigger: EvaluationTrigger = EvaluationTrigger.COMMIT,
    *,
    at: dt.datetime = AT,
    req_ids: tuple[str, ...] = (),
) -> EvaluationEvent:
    """One repository event."""
    return EvaluationEvent(trigger=trigger, at=at, req_ids=req_ids)


class Passes:
    """Records the requests it was asked to answer and returns a fixed answer."""

    def __init__(self, *answers: dict[str, EvidenceProjection]) -> None:
        self.requests: list[EvaluationRequest] = []
        self._answers = list(answers) or [{}]

    def __call__(self, request: EvaluationRequest) -> dict[str, EvidenceProjection]:
        self.requests.append(request)
        index = min(len(self.requests) - 1, len(self._answers) - 1)
        return self._answers[index]


# -- one evaluation per event, one per burst (SWR-3210) --------------------


@verifies(SWR.SWR_3210)
def test_every_listed_repository_event_triggers_exactly_one_evaluation() -> None:
    """Commit, merge, source edit, branch switch, run, integration, refresh — all of them."""
    assert set(ALL_EVALUATION_TRIGGERS) == set(EvaluationTrigger)

    for trigger in ALL_EVALUATION_TRIGGERS:
        passes = Passes({REQ_ID: projection(healthy=True)})
        evaluator = RequirementEvaluator(passes, debounce_ms=DEBOUNCE_MS)

        assert evaluator.submit(event(trigger))
        assert evaluator.run_due(AT) is None, f"{trigger} ran before its window closed"

        outcome = evaluator.run_due(AFTER_WINDOW)
        assert outcome is not None, f"{trigger} produced no evaluation"
        assert outcome.request.triggers == (trigger,)
        assert len(passes.requests) == 1

        # And nothing schedules a second pass behind it.
        assert evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=10)) is None
        assert len(passes.requests) == 1


@verifies(SWR.SWR_3210)
def test_a_burst_inside_the_debounce_window_causes_one_pass_not_many() -> None:
    """A rebase's event storm costs one evaluation, and the pass names every event."""
    passes = Passes({REQ_ID: projection(healthy=True)})
    evaluator = RequirementEvaluator(passes, debounce_ms=DEBOUNCE_MS)

    for offset_ms in (0, 50, 120, 300):
        assert evaluator.submit(event(at=AT + dt.timedelta(milliseconds=offset_ms)))
    assert evaluator.run_due(AT + dt.timedelta(milliseconds=350)) is None

    outcome = evaluator.run_due(AT + dt.timedelta(milliseconds=701))
    assert outcome is not None
    assert len(passes.requests) == 1
    assert len(outcome.request.events) == 4
    assert outcome.request.coalesced
    assert evaluator.pending == ()


@verifies(SWR.SWR_3210)
def test_a_burst_of_different_triggers_is_still_one_pass_that_names_them_all() -> None:
    """A commit plus a branch switch is one answer, not two half-answers."""
    passes = Passes({REQ_ID: projection(healthy=True)})
    evaluator = RequirementEvaluator(passes, debounce_ms=DEBOUNCE_MS)

    evaluator.submit(event(EvaluationTrigger.COMMIT))
    evaluator.submit(event(EvaluationTrigger.BRANCH_SWITCH, at=AT))
    evaluator.submit(event(EvaluationTrigger.COMMIT, at=AT))

    outcome = evaluator.run_due(AFTER_WINDOW)
    assert outcome is not None
    assert outcome.request.triggers == (EvaluationTrigger.COMMIT, EvaluationTrigger.BRANCH_SWITCH)


@verifies(SWR.SWR_3210)
def test_a_trigger_the_workspace_switched_off_is_ignored_without_a_pass() -> None:
    """Configuration replaces the trigger list rather than being advisory."""
    passes = Passes()
    evaluator = RequirementEvaluator(
        passes,
        debounce_ms=DEBOUNCE_MS,
        triggers=(EvaluationTrigger.MANUAL,),
    )

    assert evaluator.submit(event(EvaluationTrigger.COMMIT)) is False
    assert evaluator.pending == ()
    assert evaluator.run_due(AFTER_WINDOW) is None

    assert evaluator.submit(event(EvaluationTrigger.MANUAL)) is True
    assert evaluator.run_due(AFTER_WINDOW) is not None
    assert len(passes.requests) == 1


@verifies(SWR.SWR_3210, SWR.SWR_3116)
def test_a_scoped_burst_stays_incremental_and_one_unscoped_event_widens_it() -> None:
    """A branch switch cannot be answered for two cards, so it is answered for all."""
    passes = Passes()
    evaluator = RequirementEvaluator(passes, debounce_ms=DEBOUNCE_MS)

    evaluator.submit(event(req_ids=("SWR-3207",)))
    evaluator.submit(event(req_ids=("SWR-3206",), at=AT))
    scoped = evaluator.run_due(AFTER_WINDOW)
    assert scoped is not None
    assert scoped.request.scope == ("SWR-3206", "SWR-3207")
    assert scoped.request.incremental

    evaluator.submit(event(req_ids=("SWR-3207",), at=AFTER_WINDOW))
    evaluator.submit(event(EvaluationTrigger.BRANCH_SWITCH, at=AFTER_WINDOW))
    widened = evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=1))
    assert widened is not None
    assert widened.request.scope == ()
    assert not widened.request.incremental


# -- publishing what changed (SWR-3210) ------------------------------------


@verifies(SWR.SWR_3210)
def test_an_evaluation_publishes_the_requirements_whose_projection_changed() -> None:
    """Naming them is what lets a board repaint two cards instead of ninety."""
    published: list[EvaluationOutcome] = []
    passes = Passes(
        {REQ_ID: projection(healthy=True), "SWR-3211": projection("SWR-3211", healthy=True)},
        {REQ_ID: projection(healthy=False), "SWR-3211": projection("SWR-3211", healthy=True)},
    )
    evaluator = RequirementEvaluator(
        passes,
        debounce_ms=DEBOUNCE_MS,
        publish=published.append,
    )

    evaluator.submit(event())
    first = evaluator.run_due(AFTER_WINDOW)
    assert first is not None
    assert first.changed_ids == (REQ_ID, "SWR-3211")
    assert [change.previous for change in first.changes] == [None, None]

    evaluator.submit(event(at=AFTER_WINDOW))
    second = evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=1))
    assert second is not None
    # Only the requirement that actually moved is republished.
    assert second.changed_ids == (REQ_ID,)
    assert second.changes[0].previous is EvidenceState.SATISFIED
    assert second.changes[0].current is EvidenceState.FAILED
    assert REQ_ID in second.changes[0].message

    assert published == [first, second]
    assert evaluator.projections[REQ_ID].state is EvidenceState.FAILED


@verifies(SWR.SWR_3210)
def test_a_pass_that_changed_nothing_publishes_an_empty_change_set() -> None:
    """A bare "something happened" is not an answer a board can act on."""
    answer = {REQ_ID: projection(healthy=True)}
    passes = Passes(answer, answer)
    evaluator = RequirementEvaluator(passes, debounce_ms=DEBOUNCE_MS)

    evaluator.submit(event())
    assert evaluator.run_due(AFTER_WINDOW) is not None

    evaluator.submit(event(at=AFTER_WINDOW))
    second = evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=1))
    assert second is not None
    assert second.changes == ()
    assert "nothing changed" in second.message


@verifies(SWR.SWR_3210, SWR.SWR_3116)
def test_an_incremental_pass_does_not_erase_the_requirements_it_never_looked_at() -> None:
    """A scoped refresh recomputes two cards; the other eighty-eight stay put."""
    passes = Passes(
        {REQ_ID: projection(healthy=True), "SWR-3211": projection("SWR-3211", healthy=True)},
        {REQ_ID: projection(healthy=False)},
    )
    evaluator = RequirementEvaluator(passes, debounce_ms=DEBOUNCE_MS)

    evaluator.submit(event())
    evaluator.run_due(AFTER_WINDOW)
    evaluator.submit(event(req_ids=(REQ_ID,), at=AFTER_WINDOW))
    evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=1))

    assert set(evaluator.projections) == {REQ_ID, "SWR-3211"}
    assert evaluator.projections["SWR-3211"].state is EvidenceState.SATISFIED


# -- a failing pass changes nothing (SWR-3210) -----------------------------


@verifies(SWR.SWR_3210)
def test_a_failing_evaluation_is_reported_and_leaves_the_previous_projection_in_place() -> None:
    """A board showing a slightly old answer beats a board showing none."""
    published: list[EvaluationOutcome] = []
    healthy = {REQ_ID: projection(healthy=True)}

    def evaluate(request: EvaluationRequest) -> dict[str, EvidenceProjection]:
        if len(request.events) == 1 and request.triggers == (EvaluationTrigger.COMMIT,):
            return healthy
        raise RuntimeError("the requirement index could not be read")

    evaluator = RequirementEvaluator(evaluate, debounce_ms=DEBOUNCE_MS, publish=published.append)
    evaluator.submit(event())
    evaluator.run_due(AFTER_WINDOW)
    before = evaluator.projections

    evaluator.submit(event(EvaluationTrigger.MERGE, at=AFTER_WINDOW))
    failed = evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=1))

    assert failed is not None
    assert not failed.succeeded
    assert failed.failure is not None
    assert failed.failure.error_type == "RuntimeError"
    assert "could not be read" in failed.failure.message
    assert failed.changes == ()
    assert evaluator.projections == before
    assert published[-1] is failed


@verifies(SWR.SWR_3210)
def test_a_failed_outcome_cannot_claim_changes() -> None:
    """The invariant is on the model, so no future caller can publish both."""
    with pytest.raises(ValueError, match="leaves the previous projection in place"):
        EvaluationOutcome(
            request=EvaluationRequest(events=(event(),), started_at=AT),
            changes=(EvaluationChange(req_id=REQ_ID, current=EvidenceState.FAILED),),
            failure=EvaluationFailure(message="boom"),
        )


# -- evaluation terminates (SWR-3210) --------------------------------------


@verifies(SWR.SWR_3210)
def test_an_evaluation_cannot_trigger_an_evaluation() -> None:
    """The loop is refused where it starts, not discovered in a profiler."""
    evaluator: RequirementEvaluator

    def evaluate(request: EvaluationRequest) -> dict[str, EvidenceProjection]:
        evaluator.submit(event(EvaluationTrigger.MANUAL, at=request.started_at))
        return {}

    evaluator = RequirementEvaluator(evaluate, debounce_ms=DEBOUNCE_MS)
    evaluator.submit(event())
    outcome = evaluator.run_due(AFTER_WINDOW)

    assert outcome is not None
    assert not outcome.succeeded
    assert outcome.failure is not None
    assert outcome.failure.error_type == EvaluationReentryError.__name__

    # And the pass really did terminate: nothing is queued behind it.
    assert evaluator.pending == ()
    assert evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=10)) is None


@verifies(SWR.SWR_3210)
def test_a_subscriber_cannot_answer_a_published_outcome_with_another_evaluation() -> None:
    """The same loop through the publish callback is refused in the same place."""
    evaluator: RequirementEvaluator

    def republish(outcome: EvaluationOutcome) -> None:
        evaluator.submit(event(EvaluationTrigger.MANUAL, at=outcome.request.started_at))

    evaluator = RequirementEvaluator(
        Passes({REQ_ID: projection(healthy=True)}),
        debounce_ms=DEBOUNCE_MS,
        publish=republish,
    )
    evaluator.submit(event())
    with pytest.raises(EvaluationReentryError):
        evaluator.run_due(AFTER_WINDOW)
    assert evaluator.pending == ()


@verifies(SWR.SWR_3210)
def test_an_event_from_another_thread_during_a_pass_is_queued_not_refused() -> None:
    """A commit does not stop happening because an evaluation is in flight."""
    evaluator: RequirementEvaluator
    submitted = threading.Event()

    def evaluate(request: EvaluationRequest) -> dict[str, EvidenceProjection]:
        def commit_elsewhere() -> None:
            evaluator.submit(event(EvaluationTrigger.COMMIT, at=request.started_at))
            submitted.set()

        worker = threading.Thread(target=commit_elsewhere)
        worker.start()
        worker.join(timeout=5)
        return {}

    evaluator = RequirementEvaluator(evaluate, debounce_ms=DEBOUNCE_MS)
    evaluator.submit(event())
    outcome = evaluator.run_due(AFTER_WINDOW)

    assert submitted.is_set()
    assert outcome is not None
    assert outcome.succeeded
    assert len(evaluator.pending) == 1


# -- never on the UI thread (SWR-3210) -------------------------------------


@verifies(SWR.SWR_3210)
def test_an_evaluation_refuses_to_run_on_the_thread_that_draws_the_board() -> None:
    """Reading a repository on the UI thread is how a board freezes."""
    passes = Passes({REQ_ID: projection(healthy=True)})
    evaluator = RequirementEvaluator.off_thread(passes, debounce_ms=DEBOUNCE_MS)
    evaluator.submit(event())

    with pytest.raises(EvaluationOnUiThreadError):
        evaluator.run_due(AFTER_WINDOW)
    assert passes.requests == []

    outcomes: list[EvaluationOutcome | None] = []
    worker = threading.Thread(target=lambda: outcomes.append(evaluator.run_due(AFTER_WINDOW)))
    worker.start()
    worker.join(timeout=10)

    assert len(outcomes) == 1
    off_thread = outcomes[0]
    assert off_thread is not None
    assert off_thread.succeeded
    assert len(passes.requests) == 1


@verifies(SWR.SWR_3210)
def test_an_evaluation_pass_is_always_asked_for_by_at_least_one_event() -> None:
    """A pass nobody asked for has no scope and no reason to exist."""
    passes = Passes()
    evaluator = RequirementEvaluator(passes, debounce_ms=DEBOUNCE_MS)
    assert evaluator.run(AT) is None
    assert evaluator.next_due_at() is None

    with pytest.raises(ValueError, match="at least one event"):
        EvaluationRequest(events=(), started_at=AT)

    evaluator.submit(event())
    assert evaluator.next_due_at() == AFTER_WINDOW
