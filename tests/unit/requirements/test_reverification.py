"""Productive use: a person deletes a covering test, or reverts an edit they made last
week, and Rotaris has to decide whether the requirement still claims to be delivered.
Expected outcome: the claim is taken away by the board read that noticed — automatically,
because it costs a comparison and it is Rotaris admitting it no longer knows something —
and given back only by a verification the user asked for, whose result the traceability
ring also recorded.

This file is the two halves of that: the propagation rules that let go of `Done`, and the
one reverifier that is allowed to grant it. Nothing here runs a real check suite; the pass
is a scripted seam, and what is proved is which answers reach which decision.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.outcomes import ReverificationRequest
from rotaris_core.requirements.change_host import (
    NOT_COVERED,
    NOTHING_VERIFIED,
    WorkspaceReverifier,
    propagate_lost_evidence,
    restore_verified_evidence,
)
from rotaris_core.requirements.delivery.audit import AuditStore
from rotaris_core.requirements.delivery.evidence import VerificationRecord
from rotaris_core.requirements.delivery.obligations import EvidenceKind
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.staleness import StalenessFinding, StalenessReason
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord, DeliveryStore
from rotaris_core.requirements.delivery.verification import (
    RequirementVerification,
    VerificationStore,
)
from rotaris_core.requirements.delivery.verification_pass import (
    VerificationOutcome,
    VerificationPassReport,
    VerificationResult,
    VerificationTarget,
)
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 16, 10, 0, tzinfo=dt.UTC)
COMMIT = "c0ffee1234567890"
TEST_PATH = "tests/unit/test_login.py"
IMPL_PATH = "src/pkg/login.py"


# --------------------------------------------------------------------------
# the workspace these rules read
# --------------------------------------------------------------------------


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Log in",
        description="The user signs in with an email and a password.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
    )


def deliver(
    workspace: Path,
    *,
    state: DeliveryState = DeliveryState.DONE,
    req_id: str = REQ,
) -> None:
    """Seed a delivery — a fixture, never a transition."""
    delivered = requirement(req_id)
    DeliveryStore(workspace).seed(
        DeliveryRecord(
            req_id=req_id,
            delivery=DeliveryStatus(
                state=state,
                changed_at=AT,
                changed_by=DeliveryActor.system("requirement-flow"),
                cause=TransitionCause.COMPLETION_ACCEPTED,
                requirement_hash=delivered.current_hash,
            ),
            satisfied=SatisfiedLog(
                entries=(
                    SatisfiedDelivery(
                        req_id=req_id,
                        satisfied_hash=delivered.current_hash,
                        run_id="run-17",
                        satisfied_at=AT,
                        verified_commit=COMMIT,
                    ),
                ),
            ),
        ),
    )


def lost_test(req_id: str = REQ) -> tuple[StalenessFinding, ...]:
    """The finding a deleted covering test produces (SWR-3209)."""
    del req_id
    return (
        StalenessFinding(
            kind=EvidenceKind.TEST,
            reason=StalenessReason.COVERING_TEST_DISAPPEARED,
            subject=TEST_PATH,
        ),
    )


def edited_file() -> tuple[StalenessFinding, ...]:
    """The finding an ordinary commit under a trace produces — and nothing else."""
    return (
        StalenessFinding(
            kind=EvidenceKind.IMPLEMENTATION,
            reason=StalenessReason.IMPLEMENTATION_CHANGED,
            subject=IMPL_PATH,
        ),
    )


def state_of(workspace: Path, req_id: str = REQ) -> DeliveryState:
    return DeliveryStore(workspace).read(req_id).state


def current_for(req_id: str) -> CanonicalRequirement | None:
    return requirement(req_id) if req_id == REQ else None


# --------------------------------------------------------------------------
# a scripted verification pass — the seam, never a real suite
# --------------------------------------------------------------------------


def verification(
    *,
    passed: bool = True,
    req_id: str = REQ,
    run_id: str = "verify-1",
    executed: bool = True,
) -> RequirementVerification:
    return RequirementVerification(
        req_id=req_id,
        record=VerificationRecord(
            verdict="passed" if passed else "failed",
            commit=COMMIT,
            requirement_hash=requirement(req_id).current_hash,
            run_id=run_id,
            verified_at=LATER,
            checks=("pytest",),
        ),
        implementations=(RequirementSite(path=IMPL_PATH, line=41),),
        covering_tests=(
            CoveringTest(
                path=TEST_PATH,
                line=12,
                executed=executed,
                check_name="pytest",
                check_status="passed" if passed else "failed",
            ),
        ),
        target_branch="main",
    )


def scripted_pass(*results: VerificationResult) -> VerificationPassReport:
    return VerificationPassReport(
        results=results,
        target=VerificationTarget(branch="main", commit=COMMIT),
    )


def recorded(**kwargs: object) -> VerificationResult:
    found = verification(**kwargs)  # type: ignore[arg-type]
    return VerificationResult(
        req_id=found.req_id,
        outcome=VerificationOutcome.RECORDED,
        verification=found,
    )


# --------------------------------------------------------------------------
# SWR-3513 — the claim is taken away automatically
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3513)
def test_a_deleted_covering_test_takes_done_away(tmp_path: Path) -> None:
    """Productive use: a colleague deletes the test that proved a delivered requirement.
    Expected outcome: the card stops claiming delivery on the next evaluation, without
    anybody asking — the drift this product exists to prevent, arriving through the
    evidence door instead of the text one."""
    deliver(tmp_path)

    moved = propagate_lost_evidence(
        tmp_path,
        staleness={REQ: lost_test()},
        at=LATER,
        current_for=current_for,
    )

    assert state_of(tmp_path) is DeliveryState.NEEDS_UPDATE
    assert len(moved) == 1, moved


@verifies(SWR.SWR_3513)
def test_the_reason_names_the_evidence_and_not_a_specification_change(tmp_path: Path) -> None:
    """SWR-3513's second criterion. A user told "the specification changed" goes looking
    for an edit nobody made; a user told "covering-test-disappeared tests/…" goes to the
    file."""
    deliver(tmp_path)

    propagate_lost_evidence(
        tmp_path,
        staleness={REQ: lost_test()},
        at=LATER,
        current_for=current_for,
    )

    events = AuditStore(tmp_path).load(REQ).trail.events
    assert events, "an evidence-driven move is recorded like every other (SWR-3213)"
    last = events[-1]
    # The machine-readable cause, so a surface can group by it rather than grep prose.
    assert any(
        str(StalenessReason.COVERING_TEST_DISAPPEARED) in cause for cause in last.evidence
    ), last.evidence
    # And the prose names the file, which is the thing to go and fix.
    assert TEST_PATH in last.reason, last.reason
    assert "the requirement text did not change" in last.reason, last.reason
    # A distinct actor, so a history view can tell the two causes apart.
    assert last.actor.name == "evidence-propagation", last.actor


@verifies(SWR.SWR_3513)
def test_an_ordinary_edit_under_a_trace_moves_nothing(tmp_path: Path) -> None:
    """The regression this lane is most likely to have: every commit emptying Done.

    A file that was edited is a reason to *re-verify*, not a reason to withdraw a
    delivery. Only a site that is gone, or a verification that ran and failed, says the
    requirement stopped holding."""
    deliver(tmp_path)

    moved = propagate_lost_evidence(
        tmp_path,
        staleness={REQ: edited_file()},
        at=LATER,
        current_for=current_for,
    )

    assert state_of(tmp_path) is DeliveryState.DONE
    assert moved == ()


@verifies(SWR.SWR_3513)
def test_a_requirement_nobody_verified_has_no_findings_and_so_moves_nothing(
    tmp_path: Path,
) -> None:
    """Unknown is not "no". A workspace without git, or a requirement never verified,
    produces no findings at all — and a pass over no findings writes nothing."""
    deliver(tmp_path)

    moved = propagate_lost_evidence(
        tmp_path,
        staleness={REQ: ()},
        at=LATER,
        current_for=current_for,
    )

    assert state_of(tmp_path) is DeliveryState.DONE
    assert moved == ()


@verifies(SWR.SWR_3513, SWR.SWR_3222)
def test_the_propagator_a_board_read_builds_cannot_restore(tmp_path: Path) -> None:
    """The rule made structural rather than remembered.

    A board read may take a claim away; granting one costs a suite run and is the user's
    to ask for. So the propagator this path builds has *no verifier* — the restore is not
    merely unused here, it is absent from the object."""
    from rotaris_core.requirements.change.propagation import EvidencePropagator

    deliver(tmp_path, state=DeliveryState.NEEDS_UPDATE)

    propagate_lost_evidence(
        tmp_path,
        staleness={REQ: lost_test()},
        at=LATER,
        current_for=current_for,
    )

    # What the pass built, rebuilt the same way: a propagator with no verifier
    # answers `can_verify` False and its restore is a no-op that grants nothing.
    propagator = EvidencePropagator(object())  # type: ignore[arg-type]
    assert not propagator.can_verify
    assert state_of(tmp_path) is DeliveryState.NEEDS_UPDATE


# --------------------------------------------------------------------------
# SWR-3222 — one measurement, two readings
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3222, SWR.SWR_3513)
def test_a_restored_done_carries_the_verification_that_earned_it(tmp_path: Path) -> None:
    """Productive use: the deleted test is restored and the person presses Verify.
    Expected outcome: the requirement returns to Done *and* the traceability ring records
    the same run and commit. A card in Done whose ring reports an older verdict is two
    answers to one question."""
    deliver(tmp_path, state=DeliveryState.NEEDS_UPDATE)
    found = verification()
    VerificationStore(tmp_path).save(found)
    reverifier = WorkspaceReverifier(
        tmp_path,
        at=LATER,
        pass_for=lambda: scripted_pass(recorded()),
    )

    restored = restore_verified_evidence(
        tmp_path,
        current_for=current_for,
        reverifier=reverifier,
        at=LATER,
    )

    assert state_of(tmp_path) is DeliveryState.DONE
    assert len(restored) == 1, restored
    stored = VerificationStore(tmp_path).load(REQ).verification
    assert stored is not None, "the ring has no record of the run that granted Done"
    assert stored.record.run_id == found.record.run_id
    assert stored.record.commit == found.record.commit
    # And the delivery re-states what already stood rather than minting a run
    # that never happened (SWR-3204). "Which run delivered this version" and
    # "which run last measured it" are two questions: the delivery answers the
    # first and keeps naming `run-17`, the audit entry answers the second.
    delivered = DeliveryStore(tmp_path).load_all().get(REQ).satisfied.current
    assert delivered is not None
    assert delivered.run_id == "run-17"
    granted = AuditStore(tmp_path).read(REQ).events[-1]
    assert granted.run_id == found.record.run_id
    assert granted.commit == found.record.commit


@verifies(SWR.SWR_3222)
def test_a_failing_verification_does_not_restore(tmp_path: Path) -> None:
    """The file is back and the suite is red: the evidence exists and does not hold.
    Restoring on the file's existence alone is the whole failure SWR-3513's fourth
    criterion names."""
    deliver(tmp_path, state=DeliveryState.NEEDS_UPDATE)

    restored = restore_verified_evidence(
        tmp_path,
        current_for=current_for,
        reverifier=WorkspaceReverifier(
            tmp_path,
            at=LATER,
            pass_for=lambda: scripted_pass(recorded(passed=False)),
        ),
        at=LATER,
    )

    assert state_of(tmp_path) is DeliveryState.NEEDS_UPDATE
    assert restored == ()


@verifies(SWR.SWR_3222, SWR.SWR_3410)
def test_a_workspace_with_no_check_suite_verifies_nothing(tmp_path: Path) -> None:
    """ "Nobody checked" and "everything holds" stay two answers."""
    answer = WorkspaceReverifier(
        tmp_path,
        at=LATER,
        pass_for=VerificationPassReport,
    ).verify(ReverificationRequest(req_id=REQ))

    assert not answer.passed
    assert answer.detail == NOTHING_VERIFIED


@verifies(SWR.SWR_3222)
def test_a_suite_that_never_reached_this_requirement_is_not_a_pass(tmp_path: Path) -> None:
    """A run that executed no covering test of this requirement says so, rather than
    inheriting the verdict of tests that are about something else."""
    answer = WorkspaceReverifier(
        tmp_path,
        at=LATER,
        pass_for=lambda: scripted_pass(recorded(req_id="SWR-9002")),
    ).verify(ReverificationRequest(req_id=REQ))

    assert not answer.passed
    assert answer.detail == NOT_COVERED


@verifies(SWR.SWR_3222, SWR.SWR_3221)
def test_a_refusal_from_the_pass_is_inherited_with_its_own_reason(tmp_path: Path) -> None:
    """SWR-3221 refuses a verification whose commit is not reachable from the target
    branch — the guard that stops a unit worktree's green from becoming requirement
    evidence. A second verification path that answered around it would grant exactly the
    Done that guard exists to withhold."""
    refusal = "the commit is not reachable from main"
    answer = WorkspaceReverifier(
        tmp_path,
        at=LATER,
        pass_for=lambda: scripted_pass(
            VerificationResult(
                req_id=REQ,
                outcome=VerificationOutcome.REFUSED,
                detail=refusal,
            ),
        ),
    ).verify(ReverificationRequest(req_id=REQ))

    assert not answer.passed
    assert answer.detail == refusal


@verifies(SWR.SWR_3222, SWR.SWR_3609)
def test_the_board_cannot_reach_the_reverification_edge(tmp_path: Path) -> None:
    """SWR-3609's guarantee, extended to the edge this lane adds.

    ``Needs Update → Done`` exists so a passing verification can re-state a delivery.
    It must not exist for a drag: a board that offered it as a drop target would let a
    user dismiss a specification change by pulling the card back."""
    from rotaris_core.requirements.delivery.transitions import (
        LEGAL_TRANSITIONS,
        allowed_targets,
    )

    del tmp_path

    assert (DeliveryState.NEEDS_UPDATE, DeliveryState.DONE) not in LEGAL_TRANSITIONS
    # `allowed_targets` is what a board reads for its drop targets, and it never
    # consults the separate doors.
    assert DeliveryState.DONE not in allowed_targets(DeliveryState.NEEDS_UPDATE)


@verifies(SWR.SWR_3222, SWR.SWR_3204)
def test_naming_the_cause_grants_nothing_without_a_delivery(tmp_path: Path) -> None:
    """The cause is a label. A request that names it and carries no delivery is asking
    for a Done with nothing recorded behind it, which is what SWR-3204 forbids."""
    from rotaris_core.requirements.delivery.transitions import (
        TransitionRequest as Request,
    )
    from rotaris_core.requirements.delivery.transitions import apply_transition

    del tmp_path
    delivered = requirement()
    record = DeliveryRecord(
        req_id=REQ,
        delivery=DeliveryStatus(
            state=DeliveryState.NEEDS_UPDATE,
            changed_at=AT,
            changed_by=DeliveryActor.system("change-detection"),
            cause=TransitionCause.SPECIFICATION_CHANGED,
            requirement_hash=delivered.current_hash,
        ),
    )

    outcome = apply_transition(
        record,
        Request(
            req_id=REQ,
            target=DeliveryState.DONE,
            actor=DeliveryActor.system("evidence-propagation"),
            cause=TransitionCause.REVERIFIED,
            at=LATER,
            requirement_hash=delivered.current_hash,
        ),
        completion=lambda _record, _request: (),
    )

    assert not outcome.accepted
    assert outcome.refusal is not None
    assert "re-states the delivery that already stands" in outcome.refusal.message


@verifies(SWR.SWR_3222)
def test_however_many_requirements_ask_the_suite_runs_once(tmp_path: Path) -> None:
    """A rule restoring fifty requirements must not run the workspace's tests fifty times
    over the same tree. The pass is remembered for the life of one reverifier, which is
    one evaluation or one board action."""
    runs = 0

    def once() -> VerificationPassReport:
        nonlocal runs
        runs += 1
        return scripted_pass(recorded())

    reverifier = WorkspaceReverifier(tmp_path, at=LATER, pass_for=once)
    assert not reverifier.ran

    for _ in range(5):
        reverifier.verify(ReverificationRequest(req_id=REQ))

    assert runs == 1
    assert reverifier.ran
