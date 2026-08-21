"""Productive use: an agent finishes a unit, writes a confident summary and declares the
work done. Rotaris reports the unit complete only when it has itself measured that the
tests ran, the traces exist, the store checks out and the worktree is clean — and names
every condition that does not hold.
Expected outcome: a run whose tests did not run cannot report complete; a dirty worktree
cannot report complete; a hostile payload that sets the runner-owned fields has them
stripped, and the stripping is visible; and Done is unreachable without a measured
result."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import CheckOutcome
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord
from rotaris_core.requirements.delivery.transitions import (
    RefusalKind,
    TransitionRequest,
    apply_transition,
)
from rotaris_core.requirements.execution.contract import (
    COMPLETION_CONDITIONS,
    RUNNER_OWNED_FIELDS,
    AgentClaim,
    CompletionResult,
    RunnerMeasurements,
    check_outcomes,
    contract_gate,
    parse_agent_claim,
    seal_completion,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping

pytestmark = pytest.mark.unit

REQ = "SWR-3408"
RUN = "run-1"
AT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")

#: What a run that discharged every obligation measured.
MEASURED_GOOD = RunnerMeasurements(
    tests_executed=True,
    tests_passed=True,
    tests_updated=True,
    traceability_established=True,
    reqtocode_current=True,
    worktree_clean=True,
    change_attributable=True,
    specification_stable=True,
    changed_files=("src/rotaris_core/thing.py", "tests/unit/test_thing.py"),
    produced_commits=("c0ffee1",),
    checks=(CheckOutcome(name="pytest", status="passed"),),
)

#: What the agent said. Both claims are necessary and neither is sufficient.
CLAIM_GOOD: dict[str, object] = {
    "summary": "Implemented the preview and covered it with a test.",
    "implemented": True,
    "claimed_complete": True,
    "risks": ("the CSV sniffer is heuristic",),
}


def result(
    *,
    payload: Mapping[str, object] | None = None,
    measured: RunnerMeasurements = MEASURED_GOOD,
) -> CompletionResult:
    return seal_completion(
        run_id=RUN,
        req_id=REQ,
        unit_id="swr-3408-impl",
        payload=dict(CLAIM_GOOD if payload is None else payload),
        measured=measured,
    )


#: One way to break each condition, by name. Asserted below to cover every entry
#: of ``COMPLETION_CONDITIONS``, so adding an obligation without a test fails.
BREAKERS: dict[str, Callable[[], CompletionResult]] = {
    "change-implemented": lambda: result(payload={**CLAIM_GOOD, "implemented": False}),
    "change-present": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"changed_files": (), "produced_commits": ()}),
    ),
    "tests-updated": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"tests_updated": False}),
    ),
    "tests-executed": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"tests_executed": False}),
    ),
    "tests-passed": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"tests_passed": False}),
    ),
    "traceability-established": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"traceability_established": False}),
    ),
    "reqtocode-current": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"reqtocode_current": False}),
    ),
    "worktree-clean": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"worktree_clean": False}),
    ),
    "change-attributable": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"change_attributable": False}),
    ),
    "no-requirement-drift": lambda: result(
        measured=MEASURED_GOOD.model_copy(update={"specification_stable": False}),
    ),
    "agent-reported-complete": lambda: result(
        payload={**CLAIM_GOOD, "claimed_complete": False},
    ),
}


# -- the conditions --------------------------------------------------------


@verifies(SWR.SWR_3408)
def test_a_result_that_discharges_every_obligation_is_complete() -> None:
    """The positive case, so the negatives below mean something."""
    sealed = result()
    assert sealed.unmet == ()
    assert sealed.complete
    assert sealed.message == f"{RUN}: complete"
    assert sealed.claim.summary.startswith("Implemented")
    assert sealed.claim.risks == ("the CSV sniffer is heuristic",)


@verifies(SWR.SWR_3408)
def test_every_condition_of_the_contract_is_exercised_by_one_of_these_tests() -> None:
    """A new obligation cannot be added without a case that breaks it."""
    assert set(BREAKERS) == {condition.name for condition in COMPLETION_CONDITIONS}


@pytest.mark.parametrize("condition_name", sorted(BREAKERS))
@verifies(SWR.SWR_3408)
def test_each_unmet_condition_blocks_completion_and_is_named(condition_name: str) -> None:
    """One broken obligation, one named refusal — never a bare 'not done'."""
    sealed = BREAKERS[condition_name]()

    assert not sealed.complete
    assert [condition.name for condition in sealed.unmet] == [condition_name]
    assert sealed.unmet[0].detail
    assert condition_name in sealed.message


@verifies(SWR.SWR_3408)
def test_a_unit_whose_tests_did_not_run_cannot_report_complete() -> None:
    """Executed and passing are two facts; neither may be inferred from the other."""
    sealed = result(measured=MEASURED_GOOD.model_copy(update={"tests_executed": False}))

    assert not sealed.complete
    assert "tests-executed" in {condition.name for condition in sealed.unmet}
    assert "not executed" in sealed.unmet[0].detail


@verifies(SWR.SWR_3408)
def test_a_dirty_worktree_cannot_report_complete() -> None:
    """Uncommitted work is work nobody can review, merge or attribute."""
    sealed = result(measured=MEASURED_GOOD.model_copy(update={"worktree_clean": False}))

    assert not sealed.complete
    assert [condition.name for condition in sealed.unmet] == ["worktree-clean"]


@verifies(SWR.SWR_3408)
def test_an_incomplete_result_names_each_unmet_condition_individually() -> None:
    """'4 conditions unmet' is not something a user can act on."""
    sealed = seal_completion(
        run_id=RUN,
        req_id=REQ,
        payload={"summary": "I finished it."},
        measured=RunnerMeasurements(),
    )

    names = [condition.name for condition in sealed.unmet]
    assert names == [condition.name for condition in COMPLETION_CONDITIONS]
    assert len(names) == len(set(names))
    for name in names:
        assert name in sealed.message


# -- the runner-owned half is unreachable from model output ----------------


@verifies(SWR.SWR_3408)
def test_the_claim_model_structurally_excludes_every_runner_owned_field() -> None:
    """Not a convention: a set intersection over the two models."""
    assert set(RunnerMeasurements.model_fields) <= RUNNER_OWNED_FIELDS
    assert set(AgentClaim.model_fields) & RUNNER_OWNED_FIELDS == set()
    assert set(AgentClaim.model_fields) == {
        "summary",
        "implemented",
        "claimed_complete",
        "risks",
        "notes",
    }


@verifies(SWR.SWR_3408)
def test_a_hostile_payload_cannot_set_the_runner_owned_fields() -> None:
    """The model asserts everything; Rotaris measured nothing; nothing is granted."""
    hostile: dict[str, object] = {
        "summary": "All green.",
        "implemented": True,
        "claimed_complete": True,
        "tests_executed": True,
        "tests_passed": True,
        "tests_updated": True,
        "traceability_established": True,
        "reqtocode_current": True,
        "worktree_clean": True,
        "change_attributable": True,
        "specification_stable": True,
        "verified": True,
        "verifier_results": [{"name": "pytest", "status": "passed"}],
        "checks": [{"name": "pytest", "status": "passed"}],
        "produced_commits": ["fabricated"],
        "changed_files": ["src/anything.py"],
        "complete": True,
    }

    sealed = seal_completion(
        run_id=RUN,
        req_id=REQ,
        payload=hostile,
        measured=RunnerMeasurements(),
    )

    # The stripping happened, and is asserted rather than assumed.
    assert sealed.tampered
    assert set(sealed.stripped_fields) == set(hostile) & RUNNER_OWNED_FIELDS
    assert "tests_executed" in sealed.stripped_fields
    assert "verifier_results" in sealed.stripped_fields
    assert "produced_commits" in sealed.stripped_fields

    # The measurements are the runner's, untouched.
    assert sealed.measured == RunnerMeasurements()
    assert sealed.measured.changed_files == ()
    assert sealed.measured.checks == ()
    assert not sealed.measured.tests_executed

    # And the run is not complete, however loudly the payload said so.
    assert not sealed.complete
    assert "tests-executed" in {condition.name for condition in sealed.unmet}
    # The claims it *was* allowed to make survive.
    assert sealed.claim.implemented
    assert sealed.claim.claimed_complete
    assert sealed.claim.summary == "All green."


@verifies(SWR.SWR_3408)
def test_a_payload_the_contract_does_not_know_is_dropped_and_named() -> None:
    """Prompt drift shows up instead of being silently absorbed."""
    intake = parse_agent_claim({"summary": "ok", "confidence": 0.9, "tests_passed": True})

    assert intake.claim.summary == "ok"
    assert intake.stripped == ("tests_passed",)
    assert intake.ignored == ("confidence",)
    assert intake.tampered
    assert "tests_passed" in intake.message
    assert "confidence" in intake.message


@verifies(SWR.SWR_3408)
def test_a_wrongly_typed_claim_degrades_instead_of_crashing_the_run() -> None:
    """A bad summary must not cost the run its record."""
    intake = parse_agent_claim({"summary": "ok", "implemented": "yes please"})

    assert intake.claim.summary == "ok"
    assert not intake.claim.implemented
    assert "implemented" in intake.ignored


@verifies(SWR.SWR_3408)
def test_an_honest_payload_reports_no_tampering() -> None:
    """The stripping report is a signal, so it has to be quiet when nothing happened."""
    intake = parse_agent_claim(dict(CLAIM_GOOD))

    assert intake.stripped == ()
    assert intake.ignored == ()
    assert not intake.tampered
    assert intake.message == "payload accepted as claims"


# -- what Rotaris measured, beside what was claimed ------------------------


@verifies(SWR.SWR_3408)
def test_verifier_checks_become_the_boards_check_outcomes() -> None:
    """The measured half of the review surface (SWR-3603) comes from the runner."""

    class Check:
        def __init__(self, name: str, status: str) -> None:
            self.name = name
            self.status = status

    outcomes = check_outcomes([Check("pytest", "passed"), Check("mypy", "failed")])

    assert [outcome.name for outcome in outcomes] == ["pytest", "mypy"]
    assert [outcome.passed for outcome in outcomes] == [True, False]
    assert RunnerMeasurements(checks=outcomes).failed_checks == (outcomes[1],)


# -- the gate into Done ----------------------------------------------------


def _reviewed_record() -> DeliveryRecord:
    return DeliveryRecord(
        req_id=REQ,
        delivery=DeliveryStatus(
            state=DeliveryState.REVIEW,
            changed_at=AT,
            changed_by=DeliveryActor.system("requirement-runner"),
            cause=TransitionCause.RUN_COMPLETED,
        ),
    )


def _done_request() -> TransitionRequest:
    return TransitionRequest(
        req_id=REQ,
        target=DeliveryState.DONE,
        actor=USER,
        cause=TransitionCause.COMPLETION_ACCEPTED,
        at=AT,
        requirement_hash="hash-now",
        delivery=SatisfiedDelivery(
            req_id=REQ,
            satisfied_hash="hash-at-run-start",
            run_id=RUN,
            satisfied_at=AT,
        ),
    )


@verifies(SWR.SWR_3408, SWR.SWR_3215)
def test_done_is_refused_when_no_run_ever_reported_a_result() -> None:
    """'Nobody measured' is not 'every condition holds'."""
    outcome = apply_transition(
        _reviewed_record(),
        _done_request(),
        completion=contract_gate(lambda _req_id: None),
    )

    assert not outcome.accepted
    assert outcome.refusal is not None
    assert outcome.refusal.kind is RefusalKind.COMPLETION_CONDITIONS_UNMET
    assert [condition.name for condition in outcome.refusal.unmet] == ["completion-result"]


@verifies(SWR.SWR_3408, SWR.SWR_3215)
def test_done_is_refused_while_the_contract_names_an_unmet_condition() -> None:
    """The unit run's own findings arrive at the delivery gate unchanged."""
    incomplete = result(measured=MEASURED_GOOD.model_copy(update={"tests_executed": False}))

    outcome = apply_transition(
        _reviewed_record(),
        _done_request(),
        completion=contract_gate(lambda _req_id: incomplete),
    )

    assert not outcome.accepted
    assert outcome.refusal is not None
    assert [condition.name for condition in outcome.refusal.unmet] == ["tests-executed"]


@verifies(SWR.SWR_3408, SWR.SWR_3215)
def test_a_complete_contract_result_lets_done_through() -> None:
    """The gate is a check, not a wall: a discharged contract accepts."""
    outcome = apply_transition(
        _reviewed_record(),
        _done_request(),
        completion=contract_gate(lambda _req_id: result()),
    )

    assert outcome.accepted
    assert outcome.record.state is DeliveryState.DONE
    assert outcome.record.satisfied_hash == "hash-at-run-start"
