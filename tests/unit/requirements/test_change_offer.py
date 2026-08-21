"""Productive use: a person tightens an acceptance criterion on a requirement Rotaris
already delivered, opens the board, and is told what the change costs.
Expected outcome: nothing has run. The board states the verdict and what accepting would
create; only accepting creates it. A requirement edited again between the reading and the
click is refused rather than given units scoped to a version nobody has.

The rule this file is about is one sentence — taking a claim away is automatic, granting
one is offered — and the tests are the ways it could quietly stop holding.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.impact import (
    ImpactAnalyzer,
    ImpactOutcome,
    ImpactRequest,
)
from rotaris_core.requirements.change_host import (
    NOTHING_TO_OFFER,
    OFFER_IS_STALE,
    Analysts,
    ChangePolicy,
    PropagationReport,
    SweptEvidence,
    accept_change_work,
    evaluate_specification_changes,
    evaluate_workspace,
    pending_change_work,
)
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord, DeliveryStore
from rotaris_core.requirements.execution.store import UnitStore
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 16, 11, 0, tzinfo=dt.UTC)
DVF = DeliveryActor.user("dvf")
PERSONA = "requirements-engineer"
MODEL = "scripted-analyst-1"

DELIVERED = "The user signs in with an email and a password."
EDITED = DELIVERED + "\n\nA sixth failed attempt locks the account for fifteen minutes."
EDITED_AGAIN = DELIVERED + "\n\nA third failed attempt locks the account for an hour."

TRACES = (("src/pkg/login.py", 41),)
TESTS = (("tests/unit/test_login.py", 12),)
COVERAGE = {REQ: (TRACES, TESTS)}


class ScriptedAnalyst:
    """An impact analyst answering a fixed payload."""

    def __init__(self, payload: Mapping[str, object]) -> None:
        self._payload = payload

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        del request
        return self._payload


def requirement(text: str, *, revision: str) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=REQ,
        title="Log in",
        description=text,
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_revision=revision,
    )


def deliver(workspace: Path, delivered: CanonicalRequirement) -> None:
    DeliveryStore(workspace).seed(
        DeliveryRecord(
            req_id=REQ,
            delivery=DeliveryStatus(
                state=DeliveryState.DONE,
                changed_at=AT,
                changed_by=DeliveryActor.system("requirement-flow"),
                cause=TransitionCause.COMPLETION_ACCEPTED,
                requirement_hash=delivered.current_hash,
            ),
            satisfied=SatisfiedLog(
                entries=(
                    SatisfiedDelivery(
                        req_id=REQ,
                        satisfied_hash=delivered.current_hash,
                        run_id="run-17",
                        satisfied_at=AT,
                        verified_commit="c0ffee",
                        source_revision=delivered.source_revision,
                    ),
                ),
            ),
        ),
    )


def analysed(
    workspace: Path,
    outcome: str,
    *,
    current: str = EDITED,
    reasoning: str = "a new acceptance criterion adds behaviour nothing proves yet",
) -> tuple[CanonicalRequirement, CanonicalRequirement]:
    """A delivered requirement, edited, with the analysis of that edit on disk."""
    delivered = requirement(DELIVERED, revision="r1")
    now = requirement(current, revision="r2")
    deliver(workspace, delivered)
    evaluate_specification_changes(
        workspace,
        current_for=lambda req_id: now if req_id == REQ else None,
        evidence_current={REQ: True},
        at=AT,
        version_at=lambda req_id, revision: (
            delivered if req_id == REQ and revision == "r1" else None
        ),
        coverage=COVERAGE,
        analyzer=ImpactAnalyzer(
            model=ScriptedAnalyst({"outcome": outcome, "reasoning": reasoning}),
            persona=PERSONA,
            model_name=MODEL,
            clock=lambda: AT,
        ),
    )
    return delivered, now


def evaluated(
    workspace: Path,
    outcome: str,
    *,
    reasoning: str,
    policy: object = None,
) -> PropagationReport:
    """One whole evaluation over a delivered requirement somebody has edited.

    The real path — `evaluate_workspace`, the same call the board and the CLI
    make — rather than the steps assembled by hand.
    """
    delivered = requirement(DELIVERED, revision="r1")
    current = requirement(EDITED, revision="r2")
    deliver(workspace, delivered)
    return evaluate_workspace(
        workspace,
        requirements=(current,),
        current_for=lambda req_id: current if req_id == REQ else None,
        swept=SweptEvidence(health={REQ: True}, coverage=COVERAGE, staleness={}),
        version_at=lambda req_id, revision: (
            delivered if req_id == REQ and revision == "r1" else None
        ),
        at=AT,
        analysts=Analysts(
            impact=ImpactAnalyzer(
                model=ScriptedAnalyst({"outcome": outcome, "reasoning": reasoning}),
                persona=PERSONA,
                model_name=MODEL,
                clock=lambda: AT,
            ),
        ),
        policy=policy,  # type: ignore[arg-type]
    )


def accept(
    workspace: Path,
    delivered: CanonicalRequirement,
    current: CanonicalRequirement,
) -> object:
    return accept_change_work(
        workspace,
        REQ,
        current_for=lambda req_id: current if req_id == REQ else None,
        version_at=lambda req_id, revision: (
            delivered if req_id == REQ and revision == "r1" else None
        ),
        coverage=COVERAGE,
        actor=DVF,
        at=LATER,
    )


# --------------------------------------------------------------------------
# The rule: a read offers, and writes nothing
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3616, SWR.SWR_3505)
def test_the_read_that_analyses_a_change_creates_no_unit_and_releases_nothing(
    tmp_path: Path,
) -> None:
    """The one way this epic could make the product worse: a board that spends a user's
    money because they opened a tab. The analysis runs, the offer exists, and no unit and
    no release does."""
    analysed(tmp_path, "implementation-and-tests-affected")

    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.NEEDS_UPDATE
    assert UnitStore(tmp_path).load(REQ).units == ()
    offer = pending_change_work(tmp_path, REQ)
    assert offer is not None
    assert offer.outcome == str(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED)


@verifies(SWR.SWR_3616)
def test_the_offer_names_the_verdict_and_what_accepting_would_create(tmp_path: Path) -> None:
    """Never a bare invitation. A user deciding whether to spend an agent run needs to
    know what it would produce."""
    analysed(tmp_path, "implementation-and-tests-affected")

    offer = pending_change_work(tmp_path, REQ)

    assert offer is not None
    assert offer.units == ("tests", "implementation")
    assert "adds behaviour" in offer.reasoning
    assert "2 unit(s)" in offer.message
    assert not offer.verifies_instead
    assert not offer.decomposes


@verifies(SWR.SWR_3616, SWR.SWR_3504)
def test_a_no_behavioural_impact_offer_says_it_would_verify_rather_than_implement(
    tmp_path: Path,
) -> None:
    """The outcome that costs a suite run rather than an agent run says so, because those
    are different decisions for the person taking them."""
    analysed(tmp_path, "no-behavioural-impact", reasoning="wording only; the rule is the same")

    offer = pending_change_work(tmp_path, REQ)

    assert offer is not None
    assert offer.verifies_instead
    assert offer.units == ()
    assert "verify the existing implementation" in offer.message


@verifies(SWR.SWR_3616)
def test_a_requirement_nobody_analysed_carries_no_offer(tmp_path: Path) -> None:
    deliver(tmp_path, requirement(DELIVERED, revision="r1"))

    assert pending_change_work(tmp_path, REQ) is None


@verifies(SWR.SWR_3616, SWR.SWR_3506)
def test_a_clarification_is_not_an_offer(tmp_path: Path) -> None:
    """It is Rotaris giving up, not asking permission. The requirement is blocked and the
    user's act is the answer, not an acceptance (SWR-3506)."""
    analysed(
        tmp_path,
        "human-clarification-required",
        reasoning="the two sentences cannot both hold and neither is clearly the newer one",
    )

    assert pending_change_work(tmp_path, REQ) is None


# --------------------------------------------------------------------------
# Accepting: the only path that acts
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3616, SWR.SWR_3505)
def test_accepting_creates_exactly_the_units_the_analysis_named(tmp_path: Path) -> None:
    """Productive use: the person reads what the change costs and says yes.
    Expected outcome: the two units the analysis named, with the test unit first and the
    implementation waiting on it — and the requirement released, once."""
    delivered, current = analysed(tmp_path, "implementation-and-tests-affected")

    outcome = accept(tmp_path, delivered, current)

    assert outcome.accepted, outcome.message
    units = UnitStore(tmp_path).load(REQ)
    assert len(units.units) == 2, units.ids
    keys = [unit.unit_id for unit in units.units]
    assert any("test" in key for key in keys), keys
    assert any("implementation" in key for key in keys), keys
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.READY


@verifies(SWR.SWR_3616, SWR.SWR_3610)
def test_accepting_is_attributed_to_the_person_who_accepted(tmp_path: Path) -> None:
    """An audit trail whose entries all say ``system`` cannot answer "who released this"."""
    delivered, current = analysed(tmp_path, "tests-affected")

    accept(tmp_path, delivered, current)

    record = DeliveryStore(tmp_path).load_all().get(REQ)
    assert record.delivery.changed_by == DVF


@verifies(SWR.SWR_3616, SWR.SWR_3514)
def test_an_offer_accepted_after_the_requirement_moved_again_is_refused(tmp_path: Path) -> None:
    """Productive use: somebody edits the requirement again while the offer is on screen.
    Expected outcome: the acceptance is refused with the reason, because units scoped to a
    version nobody has are worse than no units. The digest the analysis recorded is what
    answers this (SWR-3514)."""
    delivered, _current = analysed(tmp_path, "implementation-and-tests-affected")
    moved_again = requirement(EDITED_AGAIN, revision="r3")

    outcome = accept(tmp_path, delivered, moved_again)

    assert not outcome.accepted
    assert OFFER_IS_STALE in outcome.message
    assert UnitStore(tmp_path).load(REQ).units == ()
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.NEEDS_UPDATE


@verifies(SWR.SWR_3616)
def test_accepting_where_there_is_no_offer_says_so(tmp_path: Path) -> None:
    delivered = requirement(DELIVERED, revision="r1")
    deliver(tmp_path, delivered)

    outcome = accept(tmp_path, delivered, requirement(EDITED, revision="r2"))

    assert not outcome.accepted
    assert outcome.message == NOTHING_TO_OFFER


@verifies(SWR.SWR_3616, SWR.SWR_3404)
def test_a_decomposition_outcome_releases_without_planning_units_here(tmp_path: Path) -> None:
    """SWR-3404 owns the split. Planning one here would be a second decomposer, and a
    worse one: this side has no analyst and no thresholds."""
    delivered, current = analysed(tmp_path, "decomposition-required")

    outcome = accept(tmp_path, delivered, current)

    assert outcome.accepted, outcome.message
    assert UnitStore(tmp_path).load(REQ).units == ()
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.READY
    assert "decomposing" in outcome.message


@verifies(SWR.SWR_3504, SWR.SWR_3616)
def test_a_reworded_requirement_returns_to_done_when_the_verification_passes(
    tmp_path: Path,
) -> None:
    """Productive use: somebody rephrases a delivered requirement without changing what it
    asks for, and accepts the offer.
    Expected outcome: the existing implementation is verified, the new version is recorded
    as the delivered one, and the card goes back to Done — with no agent run at all.

    `NoImpactResolver`'s first production path. Before this it was `approved` and
    constructed by nothing, so a reworded requirement reached Needs Update and stayed."""
    from rotaris_core.requirements.change_host import WorkspaceReverifier

    delivered, current = analysed(tmp_path, "no-behavioural-impact", reasoning="wording only")

    outcome = accept_change_work(
        tmp_path,
        REQ,
        current_for=lambda req_id: current if req_id == REQ else None,
        version_at=lambda req_id, revision: (
            delivered if req_id == REQ and revision == "r1" else None
        ),
        coverage=COVERAGE,
        actor=DVF,
        at=LATER,
        reverifier=WorkspaceReverifier(
            tmp_path,
            at=LATER,
            pass_for=lambda: passing_pass(current),
        ),
    )

    assert outcome.accepted, outcome.message
    record = DeliveryStore(tmp_path).load_all().get(REQ)
    assert record.state is DeliveryState.DONE
    # SWR-3504's second criterion: the adoption names the run that verified it.
    standing = record.satisfied.current
    assert standing is not None
    assert standing.satisfied_hash == current.current_hash
    assert standing.run_id == "verify-1"
    # And no agent work was created for an outcome that says none is needed.
    assert UnitStore(tmp_path).load(REQ).units == ()


@verifies(SWR.SWR_3504)
def test_a_failing_verification_does_not_adopt_the_new_hash(tmp_path: Path) -> None:
    """ "The analysis said nothing changed" is a claim about the text; ``satisfied_hash`` is
    a claim about the code, and only a verification makes the second one."""
    from rotaris_core.requirements.change_host import WorkspaceReverifier

    delivered, current = analysed(tmp_path, "no-behavioural-impact", reasoning="wording only")

    outcome = accept_change_work(
        tmp_path,
        REQ,
        current_for=lambda req_id: current if req_id == REQ else None,
        version_at=lambda req_id, revision: (
            delivered if req_id == REQ and revision == "r1" else None
        ),
        coverage=COVERAGE,
        actor=DVF,
        at=LATER,
        reverifier=WorkspaceReverifier(
            tmp_path,
            at=LATER,
            pass_for=lambda: passing_pass(current, passed=False),
        ),
    )

    assert not outcome.accepted
    record = DeliveryStore(tmp_path).load_all().get(REQ)
    assert record.state is DeliveryState.NEEDS_UPDATE
    standing = record.satisfied.current
    assert standing is not None
    assert standing.satisfied_hash == delivered.current_hash, "the old version still stands"


# --------------------------------------------------------------------------
# The question, which is not an offer (SWR-3506) — and the one exception
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3506, SWR.SWR_3512, SWR.SWR_3516)
def test_an_unclear_change_blocks_with_a_question_that_survives_the_pass(
    tmp_path: Path,
) -> None:
    """Productive use: somebody writes a change that could mean two things.
    Expected outcome: the requirement blocks with the question stated, no unit exists, and
    the question is on disk where a board reopened tomorrow can still answer it."""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore

    report = evaluated(
        tmp_path,
        "human-clarification-required",
        reasoning="the new sentence and the old one cannot both hold",
    )

    assert len(report.asked) == 1, report.lines
    assert REQ in report.asked[0]
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.BLOCKED
    assert UnitStore(tmp_path).load(REQ).units == ()
    # SWR-3516: readable by a store built fresh, which is what a restart is.
    open_question = PendingDecisionStore(tmp_path).open_for(REQ)
    assert open_question is not None
    assert len(open_question.options) >= 2
    assert all(option.consequence for option in open_question.options)


@verifies(SWR.SWR_3616)
def test_a_manual_workspace_accepts_nothing_for_the_user(tmp_path: Path) -> None:
    """The default. The offer is there and the pass did not take it."""
    report = evaluated(
        tmp_path,
        "tests-affected",
        reasoning="the criterion the tests assert on moved",
        policy=ChangePolicy(),
    )

    assert report.accepted == ()
    assert UnitStore(tmp_path).load(REQ).units == ()
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.NEEDS_UPDATE
    assert pending_change_work(tmp_path, REQ) is not None


@verifies(SWR.SWR_3616, SWR.SWR_3412)
def test_a_workspace_that_declared_automatic_has_the_offer_accepted_for_it(
    tmp_path: Path,
) -> None:
    """Productive use: a team sets ``scheduling.mode: automatic`` and expects Rotaris to
    pick work up by itself.
    Expected outcome: the same offer, accepted without a user action — and the same switch
    that already lets the queue start runs, not a second one that could disagree."""
    report = evaluated(
        tmp_path,
        "tests-affected",
        reasoning="the criterion the tests assert on moved",
        policy=ChangePolicy(accept_automatically=True),
    )

    assert len(report.accepted) == 1, report.lines
    assert UnitStore(tmp_path).load(REQ).units != ()
    assert DeliveryStore(tmp_path).read(REQ).state is DeliveryState.READY


def passing_pass(current: CanonicalRequirement, *, passed: bool = True) -> object:
    """A verification pass that answers for this requirement, without a suite."""
    from rotaris_core.requirements.delivery.evidence import VerificationRecord
    from rotaris_core.requirements.delivery.verification import RequirementVerification
    from rotaris_core.requirements.delivery.verification_pass import (
        VerificationOutcome,
        VerificationPassReport,
        VerificationResult,
        VerificationTarget,
    )
    from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

    return VerificationPassReport(
        results=(
            VerificationResult(
                req_id=REQ,
                outcome=VerificationOutcome.RECORDED,
                verification=RequirementVerification(
                    req_id=REQ,
                    record=VerificationRecord(
                        verdict="passed" if passed else "failed",
                        commit="deadbeef",
                        requirement_hash=current.current_hash,
                        run_id="verify-1",
                        verified_at=LATER,
                        checks=("pytest",),
                    ),
                    implementations=(RequirementSite(path=TRACES[0][0], line=TRACES[0][1]),),
                    covering_tests=(
                        CoveringTest(
                            path=TESTS[0][0],
                            line=TESTS[0][1],
                            executed=True,
                            check_name="pytest",
                            check_status="passed" if passed else "failed",
                        ),
                    ),
                    target_branch="main",
                ),
            ),
        ),
        target=VerificationTarget(branch="main", commit="deadbeef"),
    )
