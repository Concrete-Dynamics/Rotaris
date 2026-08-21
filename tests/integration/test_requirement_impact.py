"""Productive use: a person edits a requirement store Rotaris has already delivered from —
they reword one requirement, tighten the acceptance criterion of a second, write a third
that contradicts itself, and start a fourth whose delivery would break every integration.
Expected outcome, over a real ReqToCode store and a real delivery store on disk: the
rewording costs a verification and no code run at all, and its new hash is adopted only
after that verification passed; the tightened criterion produces a test unit and an
implementation unit with the implementation waiting on the test; the contradiction blocks
with a concrete question and creates nothing until it is answered; the breaking change
reaches Review with the options and their consequences in the audit trail; and a covering
test that disappears takes its requirement out of Done without any requirement text being
judged at all.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.decisions import (
    DecisionOption,
    DecisionTrigger,
    HumanDecisions,
    PendingDecision,
    interrupting,
)
from rotaris_core.requirements.change.detection import (
    NeedsUpdatePass,
    RequirementBaseline,
    SourceChangeDetector,
)
from rotaris_core.requirements.change.impact import (
    RULE_DECIDER,
    RULE_PERSONA,
    ImpactAnalyzer,
    ImpactOutcome,
    ImpactRequest,
    RequirementVersion,
    read_only_report,
)
from rotaris_core.requirements.change.outcomes import (
    UNIT_KEY_IMPLEMENTATION,
    UNIT_KEY_TESTS,
    ClarificationDesk,
    NoImpactResolver,
    OutcomePlan,
    Reverification,
    plan_outcome,
)
from rotaris_core.requirements.change.propagation import (
    EvidenceAction,
    EvidencePropagator,
    propagate_evidence,
)
from rotaris_core.requirements.change.records import AnalysisKind, AnalysisRecordStore
from rotaris_core.requirements.delivery.audit import AuditEventKind, AuditStore
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.staleness import (
    FreshnessInputs,
    StalenessReason,
    VerifiedEvidence,
    evaluate_freshness,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import (
    DeliveryTransitions,
    TransitionRequest,
)
from rotaris_core.requirements.execution.store import UnitStore
from rotaris_core.requirements.execution.units import plan_units
from rotaris_core.requirements.sources.reqtocode import ReqToCodeSource, reqtocode_source_for
from rotaris_core.verifier.requirement_evidence import RequirementSite

if TYPE_CHECKING:
    from collections.abc import Mapping
    from pathlib import Path

    from rotaris_core.requirements.change.outcomes import ReverificationRequest
    from rotaris_core.requirements.model import CanonicalRequirement

pytestmark = pytest.mark.integration

AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(days=2)
RUNNER = DeliveryActor.system("requirement-runner")
USER = DeliveryActor.user("dvf")
REVIEWER = DeliveryActor.user("product-owner")
PERSONA = "impact-analyst"
MODEL = "scripted-analyst-1"

BASKET = "SWR-501"
ADDRESS = "SWR-505"

BASKET_PROSE = "The user pays for the basket and receives a receipt."
BASKET_MISSPELT = "The user pays for the basket and recieves a receipt."
BASKET_REWORDED = "The user pays for their basket and is given a receipt."
ADDRESS_PROSE = "The user names where the order goes."
ADDRESS_TIGHTENED = (
    "The user names where the order goes. A PO box is not a delivery address and is refused."
)

BASKET_TRACE = "src/pkg/basket.py:12"
BASKET_TEST = "tests/unit/test_basket.py:8"
ADDRESS_TRACE = "src/pkg/address.py:41"
ADDRESS_POBOX_TRACE = "src/pkg/pobox.py:7"
ADDRESS_TEST = "tests/unit/test_address.py:19"
ADDRESS_POBOX_TEST = "tests/unit/test_pobox.py:22"


def document(
    req_id: str,
    title: str,
    prose: str,
    *,
    criteria: str = "The receipt names every line item.",
) -> str:
    """One requirement document in the store's documented layout."""
    return (
        f"---\nreq-id: {req_id}\nstatus: approved\ntitle: {title!r}\nepic: SWR-500\n---\n\n"
        f"# {req_id} — {title}\n\n{prose}\n\n## Acceptance criteria\n\n- {criteria}\n"
    )


def write_store(root: Path) -> Path:
    """A workspace that has adopted ReqToCode, with one epic and two requirements."""
    store = root / "docs" / "requirements"
    (store / "500-checkout").mkdir(parents=True)
    (store / "500-checkout.md").write_text(
        "---\nreq-id: SWR-500\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Checkout"\n---\n\n# 500 — Checkout\n',
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_PROSE),
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-505-address.md").write_text(
        document(ADDRESS, "A delivery address is required", ADDRESS_PROSE),
        encoding="utf-8",
    )
    return store


def source_for(root: Path) -> ReqToCodeSource:
    """The built-in source over *root*, asserted to exist."""
    source = reqtocode_source_for(root)
    assert source is not None, "the synthetic workspace has a ReqToCode store"
    return source


def requirement(source: ReqToCodeSource, req_id: str) -> CanonicalRequirement:
    """One requirement as the source reads it right now."""
    return source.read().by_id()[req_id]


class ScriptedAnalyst:
    """An impact analyst that answers per requirement and counts every call.

    Not a mock of the analyser: the real :class:`ImpactAnalyzer` runs, validates
    the payload and produces the record. Only the *judgement* is scripted, which
    is the one thing an integration test cannot run for real.
    """

    def __init__(self, answers: Mapping[str, Mapping[str, object]]) -> None:
        self._answers = answers
        self.requests: list[ImpactRequest] = []

    def analyse(self, request: ImpactRequest) -> Mapping[str, object]:
        self.requests.append(request)
        return self._answers[request.req_id]


class ScriptedVerifier:
    """A verifier that answers a fixed verdict and records what it was asked."""

    def __init__(self, verdict: Reverification) -> None:
        self._verdict = verdict
        self.requests: list[ReverificationRequest] = []

    def verify(self, request: ReverificationRequest) -> Reverification:
        self.requests.append(request)
        return self._verdict


def analyzer_for(analyst: ScriptedAnalyst) -> ImpactAnalyzer:
    """The real analyser wired to *analyst*, with a fixed clock."""
    return ImpactAnalyzer(
        model=analyst,
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: LATER,
    )


def no_impact_plan(request: ImpactRequest) -> OutcomePlan:
    """The ``no behavioural impact`` plan a resolver is only reachable through.

    :meth:`NoImpactResolver.resolve_plan` is the single entry point on purpose:
    re-granting ``Done`` is only ever earned by an analysis that said the change
    has no behavioural impact *and* a verification that passed, and a caller
    holding only the second half must not be able to skip the first.
    """
    analyst = ScriptedAnalyst(
        {
            request.req_id: {
                "outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
                "reasoning": "reading it again, both versions ask for the same behaviour",
                "considered": [BASKET_TRACE, BASKET_TEST],
            },
        },
    )
    plan = plan_outcome(analyzer_for(analyst).analyse(request), request, at=LATER)
    assert plan is not None
    return plan


def deliver(
    transitions: DeliveryTransitions,
    req_id: str,
    requirement_hash: str,
    *,
    run_id: str = "run-1",
    commit: str = "c0ffee00",
) -> SatisfiedDelivery:
    """Walk a requirement to ``Done`` the way a real run does (SWR-3203)."""
    for target, actor, cause in (
        (DeliveryState.READY, USER, TransitionCause.USER_ACTION),
        (DeliveryState.RUNNING, RUNNER, TransitionCause.RUN_STARTED),
        (DeliveryState.REVIEW, RUNNER, TransitionCause.RUN_COMPLETED),
    ):
        outcome = transitions.apply(
            TransitionRequest(
                req_id=req_id,
                target=target,
                actor=actor,
                cause=cause,
                at=AT,
                requirement_hash=requirement_hash,
                run_id=run_id,
            ),
        )
        assert outcome.accepted, outcome.message
    delivery = SatisfiedDelivery(
        req_id=req_id,
        satisfied_hash=requirement_hash,
        run_id=run_id,
        satisfied_at=AT,
        verified_commit=commit,
    )
    done = transitions.apply(
        TransitionRequest(
            req_id=req_id,
            target=DeliveryState.DONE,
            actor=RUNNER,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            at=AT,
            requirement_hash=requirement_hash,
            delivery=delivery,
            run_id=run_id,
        ),
    )
    assert done.accepted, done.message
    return delivery


def walk(
    transitions: DeliveryTransitions,
    req_id: str,
    targets: tuple[tuple[DeliveryState, DeliveryActor, TransitionCause], ...],
    *,
    requirement_hash: str,
    run_id: str,
) -> None:
    """Move a requirement through the real state machine, asserting each step."""
    for target, actor, cause in targets:
        outcome = transitions.apply(
            TransitionRequest(
                req_id=req_id,
                target=target,
                actor=actor,
                cause=cause,
                at=LATER,
                requirement_hash=requirement_hash,
                run_id=run_id,
            ),
        )
        assert outcome.accepted, outcome.message


class Workspace:
    """The real stores of one workspace, on disk under ``tmp_path``."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.store = write_store(root)
        self.workspace = root / "workspace"
        self.workspace.mkdir()
        self.delivery = DeliveryStore(self.workspace)
        self.audit = AuditStore(self.workspace)
        self.units = UnitStore(self.workspace)
        self.transitions = DeliveryTransitions(
            self.delivery,
            completion=lambda _record, _request: (),
        )
        self.source = source_for(root)

    def document_at(self, name: str) -> Path:
        """One requirement document of the store."""
        return self.store / "500-checkout" / name

    def needs_update(self, req_id: str, baseline: RequirementBaseline) -> None:
        """Run detection and SWR-3502's pass over the edited store."""
        detected = SourceChangeDetector().detect(self.source, baseline)
        assert not detected.changes.empty
        hashes = {item.req_id: item.current_hash for item in self.source.read().requirements}
        outcomes = NeedsUpdatePass(self.transitions, audit=self.audit).run(
            [self.delivery.read(req_id)],
            hashes,
            at=LATER,
        )
        assert [outcome.moved for outcome in outcomes] == [True]


# --------------------------------------------------------------------------
# A rewording costs a verification and no code run (SWR-3504)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3504, SWR.SWR_3204)
def test_a_reworded_requirement_is_re_verified_and_returns_to_done(tmp_path: Path) -> None:
    """Acceptance criterion 3 of slice 5, end to end over the real stores.

    A person rewords a delivered requirement. The board must not keep claiming
    the old version was delivered, must not schedule an implementation run, and
    must not adopt the new hash until something actually checked the code.
    """
    space = Workspace(tmp_path)
    delivered = requirement(space.source, BASKET)
    before = RequirementVersion.of(delivered)
    deliver(space.transitions, BASKET, delivered.current_hash)
    baseline = RequirementBaseline.of_read(space.source.read())

    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_REWORDED),
        encoding="utf-8",
    )
    space.needs_update(BASKET, baseline)
    assert space.delivery.read(BASKET).state is DeliveryState.NEEDS_UPDATE

    after = RequirementVersion.of(requirement(space.source, BASKET))
    request = ImpactRequest.between(
        before,
        after,
        traces=(BASKET_TRACE,),
        tests=(BASKET_TEST,),
        evidence="satisfied",
        delivering_run="run-1",
        verified_commit="c0ffee00",
    )
    analyst = ScriptedAnalyst(
        {
            BASKET: {
                "outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
                "reasoning": "the sentence was rephrased; the receipt obligation is unchanged",
                "considered": [BASKET_TRACE, BASKET_TEST],
            },
        },
    )
    analysis = analyzer_for(analyst).analyse(request)
    plan = plan_outcome(analysis, request, at=LATER)

    assert plan is not None
    assert plan.outcome is ImpactOutcome.NO_BEHAVIOURAL_IMPACT
    assert plan.units == (), "a rewording schedules no work"
    assert plan.verification_required

    # The verification run is scheduled and finishes. It changes no code — it
    # runs the requirement's existing checks against the new text.
    walk(
        space.transitions,
        BASKET,
        (
            (DeliveryState.READY, RUNNER, TransitionCause.USER_ACTION),
            (DeliveryState.RUNNING, RUNNER, TransitionCause.RUN_STARTED),
            (DeliveryState.REVIEW, RUNNER, TransitionCause.RUN_COMPLETED),
        ),
        requirement_hash=after.content_hash,
        run_id="run-2",
    )
    verifier = ScriptedVerifier(
        Reverification(
            req_id=BASKET,
            passed=True,
            run_id="run-2",
            at=LATER,
            commit="beadfeed",
            tests=(BASKET_TEST,),
        ),
    )
    resolution = NoImpactResolver(
        space.transitions,
        verifier=verifier,
        audit=space.audit,
    ).resolve_plan(no_impact_plan(request), request, at=LATER)

    assert resolution.adopted
    record = space.delivery.read(BASKET)
    assert record.state is DeliveryState.DONE
    assert record.satisfied_hash == after.content_hash
    assert record.satisfied.hashes == (before.content_hash, after.content_hash)
    assert record.satisfied.current is not None
    assert record.satisfied.current.run_id == "run-2"
    assert record.satisfied.current.verified_commit == "beadfeed"

    # No code run, and nothing that could have started one.
    assert space.units.req_ids() == ()
    assert len(analyst.requests) == 1, "one analysis, not one per state change"
    assert verifier.requests[0].requirement_hash == after.content_hash

    verified = [
        event
        for event in space.audit.read(BASKET).events
        if event.kind is AuditEventKind.VERIFICATION
    ]
    assert len(verified) == 1
    assert verified[0].run_id == "run-2"
    assert verified[0].satisfied_hash == after.content_hash
    assert verified[0].verified


@verifies(SWR.SWR_3504)
def test_a_failing_verification_keeps_needs_update_and_adopts_nothing(tmp_path: Path) -> None:
    """The claim "nothing changed" is worth exactly the verification behind it."""
    space = Workspace(tmp_path)
    delivered = requirement(space.source, BASKET)
    before = RequirementVersion.of(delivered)
    deliver(space.transitions, BASKET, delivered.current_hash)
    baseline = RequirementBaseline.of_read(space.source.read())

    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_REWORDED),
        encoding="utf-8",
    )
    space.needs_update(BASKET, baseline)

    after = RequirementVersion.of(requirement(space.source, BASKET))
    request = ImpactRequest.between(before, after, traces=(BASKET_TRACE,), tests=(BASKET_TEST,))
    resolution = NoImpactResolver(
        space.transitions,
        verifier=ScriptedVerifier(
            Reverification(
                req_id=BASKET,
                passed=False,
                run_id="run-2",
                at=LATER,
                failed_checks=("pytest",),
                detail="test_basket.py::test_receipt failed",
            ),
        ),
        audit=space.audit,
    ).resolve_plan(no_impact_plan(request), request, at=LATER)

    assert not resolution.adopted
    record = space.delivery.read(BASKET)
    assert record.state is DeliveryState.NEEDS_UPDATE
    assert record.satisfied_hash == before.content_hash, "the old delivery still stands"
    follow_up = resolution.next_analysis
    assert follow_up is not None
    assert "test_basket.py::test_receipt failed" in follow_up.evidence
    assert not [
        event
        for event in space.audit.read(BASKET).events
        if event.kind is AuditEventKind.VERIFICATION
    ]


# --------------------------------------------------------------------------
# A changed acceptance condition produces both units (SWR-3505)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3505, SWR.SWR_3401)
def test_a_tightened_criterion_produces_a_test_unit_and_an_implementation_unit(
    tmp_path: Path,
) -> None:
    """Acceptance criterion 4 of slice 5: both units, and the right dependency.

    The units are minted and persisted through the real unit store, so what the
    test asserts is what a scheduler would read back after a restart.
    """
    space = Workspace(tmp_path)
    delivered = requirement(space.source, ADDRESS)
    before = RequirementVersion.of(delivered)
    deliver(space.transitions, ADDRESS, delivered.current_hash, run_id="run-3")
    baseline = RequirementBaseline.of_read(space.source.read())

    space.document_at("SWR-505-address.md").write_text(
        document(
            ADDRESS,
            "A delivery address is required",
            ADDRESS_TIGHTENED,
            criteria="A PO box is refused with a stated reason.",
        ),
        encoding="utf-8",
    )
    space.needs_update(ADDRESS, baseline)

    after = RequirementVersion.of(requirement(space.source, ADDRESS))
    request = ImpactRequest.between(
        before,
        after,
        traces=(ADDRESS_TRACE, ADDRESS_POBOX_TRACE),
        tests=(ADDRESS_TEST, ADDRESS_POBOX_TEST),
        evidence="satisfied",
    )
    analyst = ScriptedAnalyst(
        {
            ADDRESS: {
                "outcome": str(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED),
                "reasoning": (
                    f"the new criterion is enforced in {ADDRESS_POBOX_TRACE} and asserted"
                    f" in {ADDRESS_POBOX_TEST}"
                ),
                "considered": [ADDRESS_POBOX_TRACE, ADDRESS_POBOX_TEST],
            },
        },
    )
    plan = plan_outcome(analyzer_for(analyst).analyse(request), request, at=LATER)

    assert plan is not None
    assert plan.target is DeliveryState.READY
    space.units.save(plan_units(ADDRESS, plan.units))
    walk(
        space.transitions,
        ADDRESS,
        ((DeliveryState.READY, USER, TransitionCause.USER_ACTION),),
        requirement_hash=after.content_hash,
        run_id="run-4",
    )

    stored = space.units.load(ADDRESS)
    assert stored.count == 2
    tests_unit, implementation = stored.units
    assert tests_unit.title.endswith(ADDRESS)
    assert implementation.depends_on == (tests_unit.unit_id,)
    assert stored.dependents_of(tests_unit.unit_id) == (implementation.unit_id,)
    assert [unit.unit_id for unit in stored.ready()] == [tests_unit.unit_id]

    # Scoped to the sites the analysis named, not to the whole surface.
    assert ADDRESS_POBOX_TEST in tests_unit.scope
    assert ADDRESS_TEST not in tests_unit.scope
    assert ADDRESS_POBOX_TRACE in implementation.scope
    assert ADDRESS_TRACE not in implementation.scope

    assert space.delivery.read(ADDRESS).state is DeliveryState.READY
    assert plan.specification.affected_tests == (ADDRESS_POBOX_TEST,)
    assert "PO box" in plan.specification.diff
    assert plan.unit(UNIT_KEY_TESTS) is not None
    assert plan.unit(UNIT_KEY_IMPLEMENTATION) is not None


# --------------------------------------------------------------------------
# A contradictory change blocks with a question (SWR-3506)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3506)
def test_a_contradictory_change_blocks_with_a_question_and_creates_nothing(
    tmp_path: Path,
) -> None:
    """Acceptance criterion 5 of slice 5: no unit, no run, until it is answered."""
    space = Workspace(tmp_path)
    delivered = requirement(space.source, ADDRESS)
    before = RequirementVersion.of(delivered)
    deliver(space.transitions, ADDRESS, delivered.current_hash, run_id="run-3")
    baseline = RequirementBaseline.of_read(space.source.read())

    space.document_at("SWR-505-address.md").write_text(
        document(
            ADDRESS,
            "A delivery address is required",
            "The user names where the order goes, and may leave the address empty.",
        ),
        encoding="utf-8",
    )
    space.needs_update(ADDRESS, baseline)

    after = RequirementVersion.of(requirement(space.source, ADDRESS))
    request = ImpactRequest.between(
        before,
        after,
        traces=(ADDRESS_TRACE,),
        tests=(ADDRESS_TEST,),
    )
    asked = "Is an empty address accepted for collection orders only, or for every order?"
    analyst = ScriptedAnalyst(
        {
            ADDRESS: {
                "outcome": str(ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED),
                "reasoning": "the requirement now demands an address and permits none",
                "question": asked,
            },
        },
    )
    plan = plan_outcome(analyzer_for(analyst).analyse(request), request, at=LATER)

    assert plan is not None
    assert plan.units == ()
    pending = plan.clarification
    assert pending is not None
    assert pending.question == asked

    desk = ClarificationDesk(space.transitions, audit=space.audit)
    raised = desk.ask(plan)

    assert raised.moved
    record = space.delivery.read(ADDRESS)
    assert record.state is DeliveryState.BLOCKED
    assert record.delivery.blocked_reason == asked
    assert record.satisfied_hash == before.content_hash, "the delivery record is untouched"
    assert record.satisfied.entries == space.delivery.read(ADDRESS).satisfied.entries
    assert space.units.req_ids() == (), "no execution unit exists while the question is open"
    assert len(analyst.requests) == 1

    answered = desk.answer(
        pending,
        "behavioural",
        request,
        by=REVIEWER,
        at=LATER + dt.timedelta(hours=1),
        rationale="collection orders only",
        resume_to=DeliveryState.NEEDS_UPDATE,
    )

    assert space.delivery.read(ADDRESS).state is DeliveryState.NEEDS_UPDATE
    assert answered.record.answered_by == REVIEWER
    assert answered.reanalysis.request == request

    # Answering re-runs the analysis — and only then is work created.
    second = ScriptedAnalyst(
        {
            ADDRESS: {
                "outcome": str(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED),
                "reasoning": f"collection orders only: {ADDRESS_TRACE} gains the exception",
                "considered": [ADDRESS_TRACE, ADDRESS_TEST],
            },
        },
    )
    replanned = plan_outcome(
        analyzer_for(second).analyse(answered.reanalysis.request),
        answered.reanalysis.request,
        at=LATER,
    )

    assert replanned is not None
    assert [spec.handle for spec in replanned.units] == [
        UNIT_KEY_TESTS,
        UNIT_KEY_IMPLEMENTATION,
    ]
    trail = space.audit.read(ADDRESS)
    reasons = [event.reason for event in trail.events]
    assert asked in reasons, "the question is in the trail"
    assert any("behavioural" in reason for reason in reasons), "and so is the answer"


# --------------------------------------------------------------------------
# A breaking change reaches a person (SWR-3512)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3512)
def test_a_breaking_change_reaches_review_with_its_options_and_consequences(
    tmp_path: Path,
) -> None:
    """The run stops once, asks one concrete question, and continues on the answer."""
    space = Workspace(tmp_path)
    current = requirement(space.source, BASKET)
    walk(
        space.transitions,
        BASKET,
        (
            (DeliveryState.READY, USER, TransitionCause.USER_ACTION),
            (DeliveryState.RUNNING, RUNNER, TransitionCause.RUN_STARTED),
        ),
        requirement_hash=current.current_hash,
        run_id="run-7",
    )

    observed = ("flaky test", "breaking change", "slow suite")
    triggers = interrupting(observed)

    assert triggers == (DecisionTrigger.BREAKING_CHANGE,), "only the listed condition stops it"

    pending = PendingDecision.raised(
        BASKET,
        DecisionTrigger.BREAKING_CHANGE,
        question=(
            "Delivering SWR-501 renames the receipt field every integration reads —"
            " should the old name be kept alongside the new one?"
        ),
        options=(
            DecisionOption(
                name="keep both names",
                consequence="every integration keeps working and the payload carries a duplicate",
            ),
            DecisionOption(
                name="rename only",
                consequence="the payload stays clean and every integration has to be updated",
            ),
        ),
        at=LATER,
        requirement_hash=current.current_hash,
    )
    decisions = HumanDecisions(space.transitions, audit=space.audit)

    raised = decisions.raise_for(pending, cause=TransitionCause.RUN_COMPLETED)

    assert raised.moved
    assert space.delivery.read(BASKET).state is DeliveryState.REVIEW
    event = space.audit.read(BASKET).events[-1]
    assert event.to_state is DeliveryState.REVIEW
    assert event.reason == pending.question
    assert event.evidence == pending.consequences
    assert any("every integration keeps working" in line for line in event.evidence)
    assert any("has to be updated" in line for line in event.evidence)

    answered = decisions.answer(
        pending,
        "keep both names",
        by=REVIEWER,
        at=LATER + dt.timedelta(hours=2),
        rationale="two integrations are external",
        resume_to=DeliveryState.READY,
    )

    assert answered.moved
    assert answered.record is not None
    assert answered.record.chosen == "keep both names"
    assert answered.record.answered_by == REVIEWER
    assert space.delivery.read(BASKET).state is DeliveryState.READY


# --------------------------------------------------------------------------
# A deleted covering test, with no text analysis at all (SWR-3513)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3513, SWR.SWR_3209)
def test_a_deleted_covering_test_takes_the_requirement_out_of_done(tmp_path: Path) -> None:
    """Acceptance criterion 8 of slice 5: evidence loss, and no analysis of the text.

    The freshness rules of SWR-3209 produce the findings from repository facts,
    and the propagation pass turns them into a transition — with the analyser
    wired up and provably never asked.
    """
    space = Workspace(tmp_path)
    delivered = requirement(space.source, BASKET)
    deliver(space.transitions, BASKET, delivered.current_hash)
    assert space.delivery.read(BASKET).state is DeliveryState.DONE

    analyst = ScriptedAnalyst({})
    analyzer_for(analyst)  # configured, available — and never consulted below.

    findings = evaluate_freshness(
        FreshnessInputs(
            req_id=BASKET,
            requirement_hash=delivered.current_hash,
            implementations=(RequirementSite(path="src/pkg/basket.py", line=12),),
            covering_tests=(),
            verified=VerifiedEvidence(
                commit="c0ffee00",
                requirement_hash=delivered.current_hash,
                implementations=(RequirementSite(path="src/pkg/basket.py", line=12),),
                covering_tests=(RequirementSite(path="tests/unit/test_basket.py", line=8),),
            ),
        ),
    )

    assert [finding.reason for finding in findings] == [
        StalenessReason.COVERING_TEST_DISAPPEARED,
    ]

    propagator = EvidencePropagator(space.transitions, audit=space.audit)
    outcome = propagator.run([space.delivery.read(BASKET)], {BASKET: findings}, at=LATER)[0]

    assert outcome.moved
    assert outcome.plan.action is EvidenceAction.RESTORE
    record = space.delivery.read(BASKET)
    assert record.state is DeliveryState.NEEDS_UPDATE
    assert record.satisfied_hash == delivered.current_hash, "the delivery record is kept"
    assert analyst.requests == [], "no requirement text was judged"

    event = space.audit.read(BASKET).events[-1]
    assert "tests/unit/test_basket.py" in event.reason
    assert "the requirement text did not change" in event.reason
    assert event.kind is not AuditEventKind.SPECIFICATION_CHANGED

    # And the units it asks for are scoped to the test that disappeared.
    space.units.save(plan_units(BASKET, outcome.plan.units))
    stored = space.units.load(BASKET)
    assert stored.count == 1
    assert "tests/unit/test_basket.py" in stored.units[0].scope


@verifies(SWR.SWR_3513, SWR.SWR_3502)
def test_a_specification_move_is_not_handled_twice(tmp_path: Path) -> None:
    """One cause, one transition: the hash path owns the text, this one owns evidence."""
    space = Workspace(tmp_path)
    delivered = requirement(space.source, BASKET)
    deliver(space.transitions, BASKET, delivered.current_hash)
    baseline = RequirementBaseline.of_read(space.source.read())

    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_REWORDED),
        encoding="utf-8",
    )
    space.needs_update(BASKET, baseline)
    moved = requirement(space.source, BASKET)

    findings = evaluate_freshness(
        FreshnessInputs(
            req_id=BASKET,
            requirement_hash=moved.current_hash,
            implementations=(RequirementSite(path="src/pkg/basket.py", line=12),),
            covering_tests=(RequirementSite(path="tests/unit/test_basket.py", line=8),),
            verified=VerifiedEvidence(
                commit="c0ffee00",
                requirement_hash=delivered.current_hash,
                implementations=(RequirementSite(path="src/pkg/basket.py", line=12),),
                covering_tests=(RequirementSite(path="tests/unit/test_basket.py", line=8),),
            ),
        ),
    )
    plan = propagate_evidence(
        BASKET,
        findings,
        state=space.delivery.read(BASKET).state,
    )

    assert [finding.reason for finding in findings] == [StalenessReason.SPECIFICATION_MOVED]
    assert plan.action is EvidenceAction.NOTHING
    assert plan.ignored == (StalenessReason.SPECIFICATION_MOVED,)
    assert not plan.moves


# --------------------------------------------------------------------------
# The judgement itself, over two real edits (SWR-3503)
# --------------------------------------------------------------------------


def tree_fingerprint(root: Path) -> dict[str, str]:
    """Every file under *root* and the digest of its bytes."""
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


@verifies(SWR.SWR_3503)
def test_a_whitespace_edit_and_a_criterion_change_reach_the_two_expected_outcomes(
    tmp_path: Path,
) -> None:
    """One analyser, two real edits, two different answers — and nothing written.

    The point of SWR-3503 is that the *same* machinery separates a change that
    costs nothing from one that costs a run. Both requests are built from the
    store as it really reads before and after the edit, so the diff the analyst
    is handed is the diff a person produced, not one the test invented.
    """
    space = Workspace(tmp_path)
    basket_before = RequirementVersion.of(requirement(space.source, BASKET))
    address_before = RequirementVersion.of(requirement(space.source, ADDRESS))
    before_tree = tree_fingerprint(space.store)

    # A person reflows the basket document. Nothing it says changes.
    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", f"  {BASKET_PROSE}  \n\n").replace(
            "## Acceptance criteria",
            "\n## Acceptance criteria",
        ),
        encoding="utf-8",
    )
    # And tightens what the address requirement demands.
    space.document_at("SWR-505-address.md").write_text(
        document(ADDRESS, "A delivery address is required", ADDRESS_TIGHTENED),
        encoding="utf-8",
    )

    whitespace = ImpactRequest.between(
        basket_before,
        RequirementVersion.of(requirement(space.source, BASKET)),
        traces=(BASKET_TRACE,),
        tests=(BASKET_TEST,),
        evidence="satisfied",
    )
    criterion = ImpactRequest.between(
        address_before,
        RequirementVersion.of(requirement(space.source, ADDRESS)),
        traces=(ADDRESS_TRACE,),
        tests=(ADDRESS_TEST,),
        evidence="satisfied",
    )

    assert whitespace.identical, "reflowing a document does not change what it says"
    assert not criterion.identical
    assert any("PO box" in line for line in criterion.diff)

    analyst = ScriptedAnalyst(
        {
            BASKET: {
                "outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
                "reasoning": "the document was reflowed; the receipt obligation is unchanged",
                "considered": [BASKET_TRACE, BASKET_TEST],
            },
            ADDRESS: {
                "outcome": str(ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED),
                "reasoning": "refusing a PO box is behaviour nothing implements or checks yet",
                "considered": [ADDRESS_TRACE, ADDRESS_TEST],
            },
        },
    )
    analyzer = analyzer_for(analyst)
    reflow = analyzer.analyse(whitespace)
    tightened = analyzer.analyse(criterion)

    assert reflow.outcome is ImpactOutcome.NO_BEHAVIOURAL_IMPACT
    assert not reflow.costs_a_run
    assert tightened.outcome is ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED
    assert tightened.costs_a_run
    assert tightened.outcome is not None
    assert tightened.outcome.touches_implementation
    assert tightened.outcome.touches_tests
    for analysis in (reflow, tightened):
        assert analysis.reasoning, "an outcome without an argument cannot be reviewed"
        assert analysis.decided

    # The reflow never reached a model: two texts that normalise to the same
    # thing cannot differ in behaviour, and the record attributes the answer to
    # the rule that made it rather than to an analyst that was never asked.
    assert reflow.persona == RULE_PERSONA
    assert reflow.model == RULE_DECIDER
    assert [request.req_id for request in analyst.requests] == [ADDRESS]
    assert tightened.persona == PERSONA
    assert tightened.model == MODEL

    # SWR-3503's third acceptance criterion: the analysis edits nothing. The two
    # documents the *person* rewrote are the only files that differ, and both
    # analyses ran after the last of those writes.
    assert read_only_report(analyzer) == ()
    edited = ("SWR-501-basket.md", "SWR-505-address.md")
    after_tree = tree_fingerprint(space.store)
    assert set(after_tree) == set(before_tree), "the analysis created and deleted nothing"
    assert {name: digest for name, digest in after_tree.items() if not name.endswith(edited)} == {
        name: digest for name, digest in before_tree.items() if not name.endswith(edited)
    }
    assert space.delivery.read(BASKET).pristine, "no delivery state was invented"
    assert space.units.req_ids() == ()


@verifies(SWR.SWR_3503)
def test_a_user_who_fixes_a_typo_in_a_delivered_requirement_gets_no_code_change(
    tmp_path: Path,
) -> None:
    """The product promise of SWR-3503, from the person's side.

    They correct one misspelt word in a requirement that is ``Done``. What must
    *not* happen: an execution unit, a worktree, an agent run, a diff on their
    code. What must happen: the board says the delivered version is behind, and
    the analysis says why that costs nothing.
    """
    space = Workspace(tmp_path)
    # The version that was delivered carries the misspelling.
    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_MISSPELT),
        encoding="utf-8",
    )
    delivered = requirement(space.source, BASKET)
    before = RequirementVersion.of(delivered)
    deliver(space.transitions, BASKET, delivered.current_hash)
    baseline = RequirementBaseline.of_read(space.source.read())

    # The person corrects the one word.
    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_PROSE),
        encoding="utf-8",
    )
    space.needs_update(BASKET, baseline)
    assert space.delivery.read(BASKET).state is DeliveryState.NEEDS_UPDATE

    request = ImpactRequest.between(
        before,
        RequirementVersion.of(requirement(space.source, BASKET)),
        traces=(BASKET_TRACE,),
        tests=(BASKET_TEST,),
        evidence="satisfied",
        delivering_run="run-1",
        verified_commit="c0ffee00",
    )
    analyst = ScriptedAnalyst(
        {
            BASKET: {
                "outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
                "reasoning": "a spelling correction; the receipt obligation is word for word",
                "considered": [BASKET_TRACE],
            },
        },
    )
    analysis = analyzer_for(analyst).analyse(request)
    plan = plan_outcome(analysis, request, at=LATER)

    assert plan is not None
    assert not analysis.costs_a_run
    assert plan.units == (), "a typo starts no unit"
    assert plan.target is not DeliveryState.READY
    assert space.units.req_ids() == (), "and nothing a scheduler could pick up"
    assert space.delivery.read(BASKET).satisfied_hash == before.content_hash


# --------------------------------------------------------------------------
# Why Rotaris decided what it decided (SWR-3514)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3514)
def test_two_analyses_of_one_requirement_leave_two_retrievable_records(tmp_path: Path) -> None:
    """SWR-3514's fourth acceptance criterion, against the store on disk.

    The requirement is analysed, the answer turns out to be wrong when the
    verification fails, and it is analysed again. Both records have to survive:
    the first is *why the wrong call was made*, which is the one an audit months
    later actually wants.
    """
    space = Workspace(tmp_path)
    records = AnalysisRecordStore(space.workspace)
    delivered = requirement(space.source, BASKET)
    before = RequirementVersion.of(delivered)
    deliver(space.transitions, BASKET, delivered.current_hash)
    baseline = RequirementBaseline.of_read(space.source.read())

    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_REWORDED),
        encoding="utf-8",
    )
    space.needs_update(BASKET, baseline)
    after = RequirementVersion.of(requirement(space.source, BASKET))
    request = ImpactRequest.between(
        before,
        after,
        traces=(BASKET_TRACE,),
        tests=(BASKET_TEST,),
        evidence="satisfied",
        delivering_run="run-1",
        verified_commit="c0ffee00",
    )

    first = analyzer_for(
        ScriptedAnalyst(
            {
                BASKET: {
                    "outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
                    "reasoning": "reading it again, the two sentences say the same thing",
                    "considered": [BASKET_TRACE, BASKET_TEST],
                },
            },
        ),
    ).analyse(request)
    records.append(first.to_record())

    # The verification disagrees, so the same inputs are analysed a second time.
    resolution = NoImpactResolver(
        space.transitions,
        verifier=ScriptedVerifier(
            Reverification(
                req_id=BASKET,
                passed=False,
                run_id="run-2",
                at=LATER,
                failed_checks=("pytest",),
                detail="test_basket.py::test_receipt failed",
            ),
        ),
        audit=space.audit,
    ).resolve_plan(no_impact_plan(request), request, at=LATER)
    assert not resolution.adopted
    follow_up = resolution.next_analysis
    assert follow_up is not None

    second = ImpactAnalyzer(
        model=ScriptedAnalyst(
            {
                BASKET: {
                    "outcome": str(ImpactOutcome.TESTS_AFFECTED),
                    "reasoning": "the wording is equivalent but the test asserts the old phrase",
                    "considered": [BASKET_TEST],
                },
            },
        ),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: LATER + dt.timedelta(hours=1),
    ).analyse(follow_up)
    records.append(second.to_record())

    log = records.read(BASKET)

    assert len(log.records) == 2, "the re-run appended; it did not replace"
    assert [record.outcome for record in log.records] == [
        str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
        str(ImpactOutcome.TESTS_AFFECTED),
    ]
    assert log.get(first.record_id) is not None
    assert log.get(second.record_id) is not None
    assert first.record_id != second.record_id
    for record in log.records:
        assert record.kind is AnalysisKind.IMPACT
        assert record.persona == PERSONA
        assert record.model == MODEL
        assert record.inputs.before_hash == before.content_hash
        assert record.inputs.after_hash == after.content_hash
        assert record.inputs.diff_lines > 0
        assert record.inputs.traces or record.inputs.tests
    assert log.over(request.inputs), "both were made over inputs a reviewer can rebuild"
    assert records.req_ids() == (BASKET,)

    # And no line was ever rewritten: the file only grew.
    lines = records.path_for(BASKET).read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    records.append(second.to_record())
    assert records.path_for(BASKET).read_text(encoding="utf-8").splitlines()[:2] == lines


@verifies(SWR.SWR_3514)
def test_a_user_reads_the_analysis_that_decided_their_change_needed_no_code(
    tmp_path: Path,
) -> None:
    """ "Why did nothing happen?" — answered from the record the outcome points at.

    The link is what makes it usable: the card shows an outcome and an id, and
    that id resolves to exactly one record naming the persona, the model, the
    reasoning and the inputs the judgement was made over.
    """
    space = Workspace(tmp_path)
    records = AnalysisRecordStore(space.workspace)
    delivered = requirement(space.source, BASKET)
    before = RequirementVersion.of(delivered)
    deliver(space.transitions, BASKET, delivered.current_hash)
    baseline = RequirementBaseline.of_read(space.source.read())

    space.document_at("SWR-501-basket.md").write_text(
        document(BASKET, "A basket can be paid for", BASKET_REWORDED),
        encoding="utf-8",
    )
    space.needs_update(BASKET, baseline)
    request = ImpactRequest.between(
        before,
        RequirementVersion.of(requirement(space.source, BASKET)),
        traces=(BASKET_TRACE,),
        tests=(BASKET_TEST,),
        evidence="satisfied",
    )
    analysis = analyzer_for(
        ScriptedAnalyst(
            {
                BASKET: {
                    "outcome": str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT),
                    "reasoning": "'is given a receipt' and 'receives a receipt' oblige the same",
                    "considered": [BASKET_TRACE, BASKET_TEST],
                },
            },
        ),
    ).analyse(request)
    records.append(analysis.to_record())
    plan = plan_outcome(analysis, request, at=LATER)

    assert plan is not None
    assert plan.units == ()

    # Months later, from a different process: only the id the outcome carried.
    reopened = AnalysisRecordStore(space.workspace).load(BASKET)

    assert reopened.notices == ()
    found = reopened.log.get(analysis.record_id)
    assert found is not None
    assert found.decided
    assert found.outcome == str(ImpactOutcome.NO_BEHAVIOURAL_IMPACT)
    assert "oblige the same" in found.reasoning
    assert found.decider == f"{PERSONA} ({MODEL})"
    assert found.at == LATER
    assert found.inputs.matches(request.inputs), "the same inputs, re-derived from the store"
    assert BASKET_TRACE in found.considered
    assert BASKET_REWORDED not in found.reasoning, "a record holds no requirement prose"
