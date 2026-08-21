"""Productive use: the five judgements this epic promises — where a repository keeps its
requirements, how a large requirement splits, whether a run left a lasting obligation, what a
requirement change costs, and what happens to a replaced requirement's code — are made by a
configured persona rather than by a test double.
Expected outcome: each analyst asks its model exactly what its requirement says the analysis
receives, constrains the answer to the engine's own vocabulary, and hands the payload back
unjudged so the engine's tolerant reader keeps owning the downgrade; a model that refuses,
fails or answers nonsense produces the engine's stated failure and never an invented verdict;
and an analyst attached to the impact analyser leaves it read-only.

Every model here is a local, duck-typed provider. Nothing in this file reaches a network, and
no analyst is ever subclassed or mocked — the classes under test are the shipped ones.
"""

from __future__ import annotations

import datetime as dt
import json
import time
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.analysis.analysts import (
    DecompositionAnalyst,
    DerivationAnalyst,
    ImpactAnalyst,
    RequirementAssessor,
    SourceDiscoveryAnalyst,
    SupersedingAnalyst,
    assessment_schema,
    decomposition_schema,
    derivation_schema,
    impact_schema,
    migration_schema,
    source_analysts_for,
    source_prompt,
    source_schema,
)
from rotaris_core.requirements.analysis.judge import JudgeError
from rotaris_core.requirements.analysis.persona import ResolvedAnalyst
from rotaris_core.requirements.change.impact import (
    WRITE_OPERATIONS,
    ImpactAnalyzer,
    ImpactFailureKind,
    ImpactModel,
    ImpactOutcome,
    ImpactRequest,
    RequirementVersion,
    read_only_report,
)
from rotaris_core.requirements.change.superseding import (
    MigrationAction,
    MigrationAnalyst,
    MigrationInventory,
    MigrationRequest,
    MigrationSite,
    SiteKind,
    plan_migration,
)
from rotaris_core.requirements.execution.decomposition import (
    Decomposer,
    DecompositionModel,
    DecompositionRequest,
    PlannedUnit,
    RejectionKind,
    RequirementAssessment,
    signals_over,
)
from rotaris_core.requirements.execution.derivation import (
    DerivationModel,
    DerivationRequest,
    read_technical_proposal,
)
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.sources.discovery import (
    HeuristicAnalyst,
    ProposalKind,
    SourceAnalyst,
    discover_source,
    survey_repository,
    validate_proposal,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-9001"
OLD = "SWR-501"
NEW = "SWR-601"
AT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
PERSONA = "requirements-engineer"
MODEL = "scripted-analyst-1"
PURPOSE = "turns goals into traceable requirements"


# --------------------------------------------------------------------------
# The world, as three lines of duck typing
# --------------------------------------------------------------------------


class _Part:
    def __init__(self, text: str) -> None:
        self.text = text


class _Message:
    def __init__(self, text: str) -> None:
        self.content = [_Part(text)]


class _Answer:
    def __init__(self, text: str) -> None:
        self.message = _Message(text)


class ScriptedProvider:
    """Answers a fixed sequence, one entry per call, recording what it was asked."""

    def __init__(self, *answers: str) -> None:
        self._answers = list(answers)
        self.calls: list[tuple[list[object], dict[str, object]]] = []

    def __call__(self, messages: list[object], **kwargs: object) -> object:
        self.calls.append((messages, kwargs))
        return _Answer(self._answers[min(len(self.calls) - 1, len(self._answers) - 1)])

    @property
    def asked(self) -> bool:
        """Whether the model was consulted at all."""
        return bool(self.calls)

    def user_text(self, index: int = 0) -> str:
        return _text_of(self.calls[index][0][1])

    def system_text(self, index: int = 0) -> str:
        return _text_of(self.calls[index][0][0])

    def response_format(self, index: int = 0) -> Any:
        return self.calls[index][1].get("response_format")


class OutageProvider:
    """The provider is simply not there."""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, messages: list[object], **kwargs: object) -> object:
        del messages, kwargs
        self.calls += 1
        raise ConnectionError("connection reset by peer")


def _text_of(message: object) -> str:
    return "\n".join(part.text for part in getattr(message, "content", []))


def answering(*payloads: object) -> ScriptedProvider:
    """A provider that answers each *payload* as the JSON a model would send."""
    return ScriptedProvider(*(json.dumps(payload) for payload in payloads))


def who(job: str) -> ResolvedAnalyst:
    """The persona and model one job resolved to."""
    return ResolvedAnalyst(
        job=job,  # type: ignore[arg-type]
        requested_persona=PERSONA,
        persona=PERSONA,
        model=MODEL,
        purpose=PURPOSE,
    )


def impact_analyst(provider: object) -> ImpactAnalyst:
    return ImpactAnalyst(who("impact_analysis"), completion=provider)  # type: ignore[arg-type]


def decomposition_analyst(provider: object) -> DecompositionAnalyst:
    return DecompositionAnalyst(who("decomposition"), completion=provider)  # type: ignore[arg-type]


def derivation_analyst(provider: object) -> DerivationAnalyst:
    return DerivationAnalyst(who("execution"), completion=provider)  # type: ignore[arg-type]


def superseding_analyst(provider: object) -> SupersedingAnalyst:
    return SupersedingAnalyst(who("migration_analysis"), completion=provider)  # type: ignore[arg-type]


def source_analyst(provider: object) -> SourceDiscoveryAnalyst:
    return SourceDiscoveryAnalyst(who("source_discovery"), completion=provider)  # type: ignore[arg-type]


def assessor(provider: object) -> RequirementAssessor:
    return RequirementAssessor(who("decomposition"), completion=provider)  # type: ignore[arg-type]


# --------------------------------------------------------------------------
# SWR-3503 — what a requirement change costs
# --------------------------------------------------------------------------


BEFORE_TEXT = "The user signs in with an email and a password."
AFTER_TEXT = (
    "The user signs in with an email and a password.\n\n"
    "A sixth failed attempt locks the account for fifteen minutes."
)

DECIDED = {
    "outcome": "implementation-and-tests-affected",
    "reasoning": "a new acceptance criterion adds behaviour nothing proves yet",
    "considered": ["the lock-out sentence is new", "one covering test exists"],
}


def version(text: str, *, revision: str) -> RequirementVersion:
    return RequirementVersion.of(
        CanonicalRequirement(
            req_id=REQ,
            title="Log in",
            description=text,
            lifecycle=RequirementLifecycle.APPROVED,
            source_id="reqtocode",
            source_revision=revision,
        ),
    )


def impact_request() -> ImpactRequest:
    return ImpactRequest.between(
        version(BEFORE_TEXT, revision="r1"),
        version(AFTER_TEXT, revision="r2"),
        traces=("src/pkg/login.py:41",),
        tests=("tests/unit/test_login.py:12",),
        evidence="satisfied",
        delivering_run="run-17",
        verified_commit="c0ffee",
    )


@verifies(SWR.SWR_3503)
def test_the_impact_prompt_carries_the_diff_the_traces_the_tests_and_the_evidence() -> None:
    """SWR-3503 names four inputs. An analyst that sends half of them is a stub."""
    provider = answering(DECIDED)

    impact_analyst(provider).analyse(impact_request())

    asked = provider.user_text()
    assert "A sixth failed attempt locks the account" in asked, "the diff never reached the model"
    assert "src/pkg/login.py:41" in asked
    assert "tests/unit/test_login.py:12" in asked
    assert "satisfied" in asked
    assert REQ in asked
    # The record's own facts, so the analysis can be reproduced against them later.
    assert "run-17" in asked
    assert "c0ffee" in asked


@verifies(SWR.SWR_3503)
def test_the_impact_schema_constrains_the_answer_to_the_engine_own_six_outcomes() -> None:
    body = impact_schema()["json_schema"]["schema"]

    assert body["properties"]["outcome"]["enum"] == [outcome.value for outcome in ImpactOutcome]
    # Strict Structured Outputs requires every property, optional ones included —
    # optionality is spelled as a nullable type, not as an absent requirement.
    assert body["required"] == list(body["properties"])
    assert {"outcome", "reasoning", "question", "considered"} == set(body["properties"])


@verifies(SWR.SWR_3503)
def test_the_prompt_names_every_outcome_the_schema_allows() -> None:
    """A prompt and a schema that disagree teach the model to answer around the schema."""
    provider = answering(DECIDED)

    impact_analyst(provider).analyse(impact_request())

    instruction = provider.system_text()
    missing = [outcome.value for outcome in ImpactOutcome if outcome.value not in instruction]
    assert not missing, f"the prompt never names {missing}"


@verifies(SWR.SWR_3503)
def test_a_decided_answer_reaches_the_analyzer_as_one_of_the_six() -> None:
    analyst = impact_analyst(answering(DECIDED))
    analyzer = ImpactAnalyzer(
        model=analyst,
        persona=analyst.persona,
        model_name=analyst.model_name,
        clock=lambda: AT,
    )

    analysis = analyzer.analyse(impact_request())

    assert analysis.decided
    assert analysis.outcome is ImpactOutcome.IMPLEMENTATION_AND_TESTS_AFFECTED
    assert analysis.persona == PERSONA
    assert analysis.model == MODEL


@verifies(SWR.SWR_3503)
def test_an_answer_outside_the_six_is_downgraded_by_the_engine_not_by_the_analyst() -> None:
    """The analyst hands the payload back unjudged; ``read_verdict`` owns the downgrade."""
    analyst = impact_analyst(answering({"outcome": "rewrite-everything", "reasoning": "unsure"}))

    payload = analyst.analyse(impact_request())
    analysis = ImpactAnalyzer(
        model=analyst,
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    ).analyse(impact_request())

    assert payload["outcome"] == "rewrite-everything", "the analyst invented its own verdict"
    assert analysis.outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED
    assert "rewrite-everything" in analysis.reasoning


@verifies(SWR.SWR_3503)
def test_an_unreachable_model_leaves_the_requirement_with_a_stated_failure() -> None:
    """An outage is not a verdict: no outcome, and the reason is on the record."""
    analyzer = ImpactAnalyzer(
        model=impact_analyst(OutageProvider()),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    )

    analysis = analyzer.analyse(impact_request())

    assert not analysis.decided
    assert analysis.failure is not None
    assert analysis.failure.kind is ImpactFailureKind.MODEL_ERROR
    assert "Needs Update" in analysis.message


@verifies(SWR.SWR_3503)
def test_the_analyzer_is_still_read_only_with_a_real_analyst_attached() -> None:
    """SWR-3503's third criterion, checked structurally rather than promised."""
    analyzer = ImpactAnalyzer(
        model=impact_analyst(answering(DECIDED)),
        persona=PERSONA,
        model_name=MODEL,
        clock=lambda: AT,
    )

    assert read_only_report(analyzer) == ()


@verifies(SWR.SWR_3503, SWR.SWR_3507)
@pytest.mark.parametrize(
    "analyst",
    [
        impact_analyst(answering({})),
        decomposition_analyst(answering({})),
        derivation_analyst(answering({})),
        superseding_analyst(answering({})),
        source_analyst(answering({})),
        assessor(answering({})),
    ],
    ids=lambda value: type(value).__name__,
)
def test_no_analyst_exposes_a_write_operation(analyst: object) -> None:
    """The rule that keeps an analyst safe to hand to an analyser that must not write."""
    exposed = sorted(
        operation for operation in WRITE_OPERATIONS if callable(getattr(analyst, operation, None))
    )

    assert exposed == [], f"{type(analyst).__name__} exposes {exposed}"


# --------------------------------------------------------------------------
# SWR-3404 — how large the work is, and how it splits
# --------------------------------------------------------------------------


TWO_UNITS = {
    "rationale": "the store owns persistence and the board renders it; each is reviewable alone",
    "units": [
        {
            "key": "store",
            "title": "Persist the record",
            "scope": "the delivery store and its schema",
            "rationale": "nothing else can be written until the record exists",
            "expected_files": ["src/pkg/store.py"],
        },
        {
            "key": "board",
            "title": "Render the record",
            "scope": "the board column",
            "rationale": "a separate surface with its own tests",
            "depends_on": ["store"],
        },
    ],
}


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Automatic requirement decomposition",
        description="Assess the requirement and split it only when it does not fit one run.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="specs",
    )


def large_assessment() -> RequirementAssessment:
    return RequirementAssessment(
        req_id=REQ,
        affected_components=5,
        independent_changes=4,
        technical_dependencies=2,
        test_surface=3,
        architecture_boundaries=3,
        context_tokens=200_000,
        parallelisable=True,
        merge_conflict_risk=0.9,
        notes=("the store, the projection and the board all move",),
    )


@verifies(SWR.SWR_3404)
def test_the_unit_schema_asks_for_exactly_the_fields_a_planned_unit_has() -> None:
    """Built from ``PlannedUnit`` itself, so the ask and the reader cannot drift apart."""
    units = decomposition_schema()["json_schema"]["schema"]["properties"]["units"]

    assert set(units["items"]["properties"]) == set(PlannedUnit.model_fields)
    assert units["items"]["properties"]["depends_on"] == {
        "type": "array",
        "items": {"type": "string"},
    }
    assert units["items"]["required"] == ["key", "scope", "rationale"]


@verifies(SWR.SWR_3404)
def test_the_decomposition_prompt_carries_the_measurement_and_what_it_triggered() -> None:
    provider = answering(TWO_UNITS)
    request = DecompositionRequest(
        req_id=REQ,
        title="Automatic requirement decomposition",
        description="Split it only when it does not fit one run.",
        assessment=large_assessment(),
        triggered=signals_over(large_assessment()),
        max_units=4,
    )

    decomposition_analyst(provider).propose(request)

    asked = provider.user_text()
    assert "affected-components" in asked, "the model never learns why a split is on the table"
    assert "affected components: 5" in asked
    assert "200000 tokens" in asked
    assert "the store, the projection and the board all move" in asked
    assert "at most 4 unit" in asked


@verifies(SWR.SWR_3404)
def test_a_proposed_split_becomes_a_plan_through_the_decomposer() -> None:
    """The whole path: a measured requirement, a model answer, a plan with a graph."""
    analyst = decomposition_analyst(answering(TWO_UNITS))

    result = Decomposer(model=analyst, persona=analyst.persona, clock=lambda: AT).decompose(
        requirement(),
        large_assessment(),
    )

    assert result.plan is not None, result.message
    assert [unit.key for unit in result.plan.units] == ["store", "board"]
    assert result.plan.units[1].depends_on == ("store",)


@verifies(SWR.SWR_3404)
def test_a_small_requirement_never_reaches_the_planner() -> None:
    """Decomposition is available, not on the path of every run."""
    provider = answering(TWO_UNITS)

    result = Decomposer(model=decomposition_analyst(provider), clock=lambda: AT).decompose(
        requirement(),
        RequirementAssessment(req_id=REQ),
    )

    assert result.plan is not None
    assert result.plan.single
    assert not provider.asked


@verifies(SWR.SWR_3404)
def test_an_unreachable_planner_is_a_stated_rejection_not_a_crash() -> None:
    result = Decomposer(
        model=decomposition_analyst(OutageProvider()),
        clock=lambda: AT,
    ).decompose(requirement(), large_assessment())

    assert result.plan is None
    assert result.rejection is not None
    assert result.rejection.kind is RejectionKind.MODEL_ERROR
    assert "unreachable" in result.rejection.reason


@verifies(SWR.SWR_3404, SWR.SWR_3117, SWR.SWR_3503)
def test_the_planner_waits_as_long_as_its_resolution_says_not_as_long_as_a_constant() -> None:
    """Productive use: a release decomposes a requirement on a slow reasoning model, in a
    workspace that configured how long that model may take.

    Expected outcome: the deadline the analyst enforces is the one its resolution carries.
    It used to be a module constant of 90 s — shorter than a single configured HTTP
    attempt — so a planner that was merely thinking was recorded as a ``model-error`` and
    the requirement it was planning went to Blocked.
    """
    slow = ResolvedAnalyst(
        job="decomposition",
        requested_persona=PERSONA,
        persona=PERSONA,
        model=MODEL,
        purpose=PURPOSE,
        timeout=1.0,
    )

    def never_answers(messages: list[object], **kwargs: object) -> object:
        del messages, kwargs
        time.sleep(30)  # abandoned on a daemon thread; the test costs the deadline
        return None

    result = Decomposer(
        model=DecompositionAnalyst(slow, completion=never_answers),
        clock=lambda: AT,
    ).decompose(requirement(), large_assessment())

    assert result.rejection is not None
    assert result.rejection.kind is RejectionKind.MODEL_ERROR
    # The number is the proof: 1 s came from the resolution, 90 s is the constant.
    assert "did not answer within 1s" in result.rejection.reason
    # And the model is named, because this sentence is what a blocked requirement
    # carries and "the analyst was slow" points at nothing a user can change.
    assert MODEL in result.rejection.reason


@verifies(SWR.SWR_3404, SWR.SWR_3117)
def test_a_caller_that_states_its_own_deadline_still_gets_it() -> None:
    """The resolution is the default, not a ceiling — a caller may still name a deadline."""
    generous = ResolvedAnalyst(
        job="decomposition",
        requested_persona=PERSONA,
        persona=PERSONA,
        model=MODEL,
        purpose=PURPOSE,
        timeout=600.0,
    )

    def never_answers(messages: list[object], **kwargs: object) -> object:
        del messages, kwargs
        time.sleep(30)
        return None

    result = Decomposer(
        model=DecompositionAnalyst(generous, completion=never_answers, timeout=1.0),
        clock=lambda: AT,
    ).decompose(requirement(), large_assessment())

    assert result.rejection is not None
    assert "did not answer within 1s" in result.rejection.reason


@verifies(SWR.SWR_3404)
def test_a_payload_that_authors_a_requirement_is_refused_by_the_engine() -> None:
    """The analyst carries the tampering through; ``read_proposal`` refuses it and says so."""
    payload = dict(TWO_UNITS, create_requirement={"title": "a new requirement"})

    result = Decomposer(
        model=decomposition_analyst(answering(payload)),
        clock=lambda: AT,
    ).decompose(requirement(), large_assessment())

    assert result.plan is not None
    assert result.plan.refused_fields == ("create_requirement",)


@verifies(SWR.SWR_3404)
def test_the_assessment_schema_asks_for_the_eight_factors_and_their_types() -> None:
    properties = assessment_schema()["json_schema"]["schema"]["properties"]

    assert set(properties) == (set(RequirementAssessment.model_fields) - {"req_id", "notes"}) | {
        "reasoning",
    }
    assert properties["affected_components"]["type"] == "integer"
    assert properties["parallelisable"]["type"] == "boolean"
    assert properties["merge_conflict_risk"]["type"] == "number"


@verifies(SWR.SWR_3404)
def test_a_measured_requirement_becomes_the_assessment_the_decomposer_judges() -> None:
    provider = answering(
        {
            "affected_components": 5,
            "independent_changes": 4,
            "technical_dependencies": 2,
            "test_surface": 3,
            "architecture_boundaries": 3,
            "context_tokens": 200000,
            "parallelisable": True,
            "merge_conflict_risk": 0.9,
            "reasoning": "the store, the projection and the board all move",
        },
    )

    assessment = assessor(provider)(requirement())

    assert assessment.req_id == REQ
    assert assessment.affected_components == 5
    assert assessment.notes == ("the store, the projection and the board all move",)
    assert signals_over(assessment), "a measurement this large has to argue for a split"
    assert requirement().description in provider.user_text()


@verifies(SWR.SWR_3404)
def test_an_assessment_cannot_retarget_itself_onto_another_requirement() -> None:
    """The requirement being assessed is the caller's fact, never the model's."""
    assessment = assessor(answering({"req_id": "SWR-1", "affected_components": 9}))(requirement())

    assert assessment.req_id == REQ


@verifies(SWR.SWR_3404)
def test_an_unreachable_assessor_answers_one_ordinary_change_rather_than_stopping_the_flow() -> (
    None
):
    """The flow stops on an assessment that raises, and an outage must not block delivery."""
    assessment = assessor(OutageProvider())(requirement())

    assert assessment.req_id == REQ
    assert signals_over(assessment) == ()
    assert any("did not run" in note for note in assessment.notes), assessment.notes


@verifies(SWR.SWR_3404)
def test_an_unreadable_measurement_answers_one_ordinary_change_and_says_why() -> None:
    """A risk outside 0..1 is not a measurement, and inventing one would split blindly."""
    assessment = assessor(answering({"merge_conflict_risk": 42}))(requirement())

    assert signals_over(assessment) == ()
    assert any("could not be read" in note for note in assessment.notes), assessment.notes


# --------------------------------------------------------------------------
# SWR-3411 — did this run leave a lasting obligation?
# --------------------------------------------------------------------------


def derivation_request() -> DerivationRequest:
    return DerivationRequest(
        req_id=REQ,
        run_id="run-17",
        unit_id="u1",
        changed_files=("src/pkg/journal.py", "tests/unit/test_journal.py"),
        agent_summary="added a deterministic merge journal so replays agree",
    )


@verifies(SWR.SWR_3411)
def test_the_derivation_prompt_carries_what_the_run_changed_and_claimed() -> None:
    provider = answering({"proposals": []})

    derivation_analyst(provider).propose(derivation_request())

    asked = provider.user_text()
    assert "src/pkg/journal.py" in asked
    assert "deterministic merge journal" in asked
    assert "run-17" in asked
    assert "u1" in asked


@verifies(SWR.SWR_3411)
def test_no_proposal_is_the_normal_answer() -> None:
    proposals = derivation_analyst(answering({"proposals": [], "reasoning": "nothing lasting"}))

    assert proposals.propose(derivation_request()) == ()


@verifies(SWR.SWR_3411)
def test_a_proposal_reaches_the_reader_and_becomes_a_technical_requirement() -> None:
    answer = {
        "proposals": [
            {
                "title": "Deterministic merge journal",
                "description": "The journal replays to the same tree on every machine.",
                "rationale": "the guarantee outlives this run and somebody must keep it",
            },
        ],
    }

    (payload,) = derivation_analyst(answering(answer)).propose(derivation_request())
    intake = read_technical_proposal(payload, origin=REQ, run_id="run-17", unit_id="u1")

    assert intake.accepted
    assert intake.proposal is not None
    assert intake.proposal.title == "Deterministic merge journal"
    assert intake.proposal.origin == REQ


@verifies(SWR.SWR_3411)
def test_a_payload_describing_a_unit_is_refused_where_the_refusal_is_owned() -> None:
    """SWR-3411's fourth criterion: a work split never becomes a permanent requirement."""
    answer = {"proposals": [{"title": "Split the store work", "depends_on": ["store"]}]}

    (payload,) = derivation_analyst(answering(answer)).propose(derivation_request())
    intake = read_technical_proposal(payload, origin=REQ)

    assert not intake.accepted
    assert intake.unit_fields == ("depends_on",)
    assert "unit is never converted" in intake.reason


@verifies(SWR.SWR_3411)
def test_the_derivation_schema_never_offers_the_fields_the_caller_owns() -> None:
    """A model that could name its own origin could re-parent the requirement it proposes."""
    properties = derivation_schema()["json_schema"]["schema"]["properties"]["proposals"]["items"][
        "properties"
    ]

    assert set(properties) == {"title", "description", "rationale", "epic"}


@verifies(SWR.SWR_3411)
def test_an_answer_without_proposals_is_no_proposal_rather_than_a_guess() -> None:
    assert (
        derivation_analyst(answering({"reasoning": "I am not sure"})).propose(
            derivation_request(),
        )
        == ()
    )


@verifies(SWR.SWR_3411)
def test_an_unreachable_model_states_the_failure_rather_than_inventing_an_obligation() -> None:
    """``RequirementDerivation`` reads this as "no proposal"; a fabricated one would persist."""
    with pytest.raises(JudgeError, match="unreachable"):
        derivation_analyst(OutageProvider()).propose(derivation_request())


# --------------------------------------------------------------------------
# SWR-3507 — what happens to a replaced requirement's code
# --------------------------------------------------------------------------


def migration_request() -> MigrationRequest:
    return MigrationRequest(
        superseding_id=NEW,
        superseded_ids=(OLD,),
        inventory=MigrationInventory(
            sites=(
                MigrationSite(kind=SiteKind.TRACE, req_id=OLD, path="src/pkg/basket.py", line=41),
                MigrationSite(kind=SiteKind.TRACE, req_id=OLD, path="src/pkg/receipt.py", line=12),
                MigrationSite(
                    kind=SiteKind.TEST,
                    req_id=OLD,
                    path="tests/unit/test_basket.py",
                    line=20,
                ),
            ),
        ),
    )


@verifies(SWR.SWR_3507)
def test_the_migration_schema_constrains_the_sites_and_the_action_vocabulary() -> None:
    request = migration_request()

    item = migration_schema(request)["json_schema"]["schema"]["properties"]["decisions"]["items"]

    assert item["properties"]["site"]["enum"] == list(request.inventory.keys)
    assert item["properties"]["action"]["enum"] == [action.value for action in MigrationAction]
    assert item["required"] == ["site", "action", "reasoning"]


@verifies(SWR.SWR_3507)
def test_the_prompt_names_every_action_and_every_site() -> None:
    request = migration_request()
    provider = answering({"decisions": []})

    superseding_analyst(provider).classify(request)

    instruction = provider.system_text()
    missing = [action.value for action in MigrationAction if action.value not in instruction]
    assert not missing, f"the prompt never names {missing}"
    asked = provider.user_text()
    for key in request.inventory.keys:
        assert key in asked
    assert NEW in asked


@verifies(SWR.SWR_3507)
def test_every_answered_site_is_carried_and_the_unanswered_one_needs_a_human() -> None:
    """Completeness is the loop's property; the analyst only has to answer what it can."""
    request = migration_request()
    first, second, third = request.inventory.keys
    provider = answering(
        {
            "decisions": [
                {
                    "site": first,
                    "action": "re-point",
                    "reasoning": "same code, new id",
                    "target": NEW,
                },
                {"site": second, "action": "remove", "reasoning": "the receipt rule is gone"},
            ],
        },
    )

    plan = plan_migration(
        request,
        analyst=superseding_analyst(provider),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )

    assert plan.worklist.covers(request.inventory)
    assert plan.worklist.get(first) is not None
    assert plan.worklist.get(first).action is MigrationAction.RE_POINT  # type: ignore[union-attr]
    assert plan.worklist.get(second).action is MigrationAction.REMOVE  # type: ignore[union-attr]
    undecided = plan.worklist.undecided
    assert [entry.key for entry in undecided] == [third]
    assert "did not mention this site" in undecided[0].question


@verifies(SWR.SWR_3507)
def test_an_unclassifiable_site_stays_a_question_rather_than_becoming_keep() -> None:
    request = migration_request()
    first = request.inventory.keys[0]
    provider = answering(
        {"decisions": [{"site": first, "action": "have another look", "reasoning": "unsure"}]},
    )

    plan = plan_migration(
        request,
        analyst=superseding_analyst(provider),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )

    entry = plan.worklist.get(first)
    assert entry is not None
    assert entry.action is MigrationAction.DECISION_REQUIRED
    assert "have another look" in entry.question


@verifies(SWR.SWR_3507)
def test_an_unreachable_analyst_leaves_every_site_undecided_and_names_the_failure() -> None:
    request = migration_request()

    plan = plan_migration(
        request,
        analyst=superseding_analyst(OutageProvider()),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )

    assert plan.worklist.covers(request.inventory)
    assert len(plan.worklist.undecided) == len(request.inventory.sites)
    assert not plan.ready_for_approval
    # The failure is on the record rather than being read as "nobody had an opinion".
    assert "unreachable" in plan.entries[0].decided_by


@verifies(SWR.SWR_3507)
def test_an_empty_inventory_costs_no_model_call() -> None:
    """A supersession of an untraced requirement must not pay for a question about nothing."""
    provider = answering({"decisions": []})

    answers = superseding_analyst(provider).classify(
        MigrationRequest(superseding_id=NEW, superseded_ids=(OLD,)),
    )

    assert answers == {}
    assert not provider.asked


# --------------------------------------------------------------------------
# SWR-3106 — where this repository keeps its requirements
# --------------------------------------------------------------------------


def _write_specs(root: Path) -> None:
    specs = root / "specs"
    (specs / "auth").mkdir(parents=True)
    (specs / "epic.md").write_text(
        "---\nid: REQ-1\nstate: draft\n---\n\n# Authentication\n\nGetting in.\n",
        encoding="utf-8",
    )
    (specs / "auth" / "login.md").write_text(
        "---\nid: REQ-2\nstate: draft\nepic: REQ-1\n---\n\n# Log in\n\nThe user logs in.\n",
        encoding="utf-8",
    )


PROPOSED_MAPPING = {
    "kind": "declarative",
    "rationale": "every document under specs/ carries an 'id' in its frontmatter",
    "evidence": ["specs/epic.md", "specs/auth/login.md"],
    "config": {
        "source-id": "discovered",
        "type": "markdown",
        "glob": "specs/**/*.md",
        "id": "frontmatter.id",
        "title": "heading",
        "status": "frontmatter.state",
        "parent": "frontmatter.epic",
    },
}


@verifies(SWR.SWR_3106)
def test_the_survey_evidence_reaches_the_model(tmp_path: Path) -> None:
    _write_specs(tmp_path)
    provider = answering(PROPOSED_MAPPING)

    source_analyst(provider).propose(survey_repository(tmp_path))

    asked = provider.user_text()
    assert "specs/**/*.md" in asked
    assert "id" in asked
    assert "state" in asked, "the status vocabulary is what decides whether a mapping works"
    assert "specs/epic.md" in asked


@verifies(SWR.SWR_3106)
def test_a_proposed_mapping_is_proved_by_loading_it_against_the_real_tree(tmp_path: Path) -> None:
    """The proposal is a configuration document, and it reads the files it claims."""
    _write_specs(tmp_path)

    proposal = source_analyst(answering(PROPOSED_MAPPING)).propose(survey_repository(tmp_path))

    assert proposal is not None
    assert proposal.kind is ProposalKind.DECLARATIVE
    validation = validate_proposal(tmp_path, proposal)
    assert validation.ok, validation.describe()
    assert validation.requirement_ids == ("REQ-1", "REQ-2")


@verifies(SWR.SWR_3106)
def test_a_programmatic_proposal_states_what_a_mapping_cannot_express(tmp_path: Path) -> None:
    _write_specs(tmp_path)
    answer = {
        "kind": "programmatic",
        "rationale": "the ids live in a sqlite index beside the documents",
        "declarative_blocker": "no frontmatter key identifies a requirement",
    }

    proposal = source_analyst(answering(answer)).propose(survey_repository(tmp_path))

    assert proposal is not None
    assert proposal.kind is ProposalKind.PROGRAMMATIC
    assert not validate_proposal(tmp_path, proposal).ok


@verifies(SWR.SWR_3106)
def test_a_programmatic_proposal_without_a_reason_is_no_proposal_at_all(tmp_path: Path) -> None:
    """The escape hatch stays closed: the refusal lives in the proposal's own validator."""
    _write_specs(tmp_path)
    answer = {"kind": "programmatic", "rationale": "this looks hard"}

    assert source_analyst(answering(answer)).propose(survey_repository(tmp_path)) is None


@verifies(SWR.SWR_3106)
def test_an_unusable_answer_is_no_proposal_rather_than_a_bad_configuration(
    tmp_path: Path,
) -> None:
    _write_specs(tmp_path)
    answer = {"kind": "declarative", "rationale": "trust me", "config": {"glob": "specs/**/*.md"}}

    assert source_analyst(answering(answer)).propose(survey_repository(tmp_path)) is None


@verifies(SWR.SWR_3106)
def test_an_unreachable_analyst_says_nothing_instead_of_raising_out_of_a_survey(
    tmp_path: Path,
) -> None:
    _write_specs(tmp_path)

    assert source_analyst(OutageProvider()).propose(survey_repository(tmp_path)) is None


@verifies(SWR.SWR_3106)
def test_a_note_the_model_added_does_not_cost_the_whole_proposal(tmp_path: Path) -> None:
    _write_specs(tmp_path)
    answer = dict(PROPOSED_MAPPING, confidence="high")

    proposal = source_analyst(answering(answer)).propose(survey_repository(tmp_path))

    assert proposal is not None
    assert proposal.config is not None


@verifies(SWR.SWR_3106)
def test_the_source_schema_offers_both_kinds_and_nothing_else() -> None:
    properties = source_schema()["json_schema"]["schema"]["properties"]

    assert properties["kind"]["enum"] == [kind.value for kind in ProposalKind]
    assert properties["config"]["type"] == "object"


# --------------------------------------------------------------------------
# SWR-3106 / SWR-3121 — the deterministic analyst first, the agent for the rest
#
# The chaining itself lives in ``discover_source`` (SWR-3121): only there is the
# tree a proposal has to load against, and "the heuristic produced nothing a
# user can adopt" is a fact about the validation, not about the proposal. These
# exercise the analysts through it rather than around it.
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3106, SWR.SWR_3121)
def test_a_layout_the_heuristic_already_maps_never_reaches_a_model(tmp_path: Path) -> None:
    """Discovery on a recognisable repository costs nothing at all."""
    _write_specs(tmp_path)
    provider = answering(PROPOSED_MAPPING)

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), source_analyst(provider)))

    assert outcome.is_acceptable
    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.DECLARATIVE
    assert not provider.asked, "the heuristic answered; nothing was worth asking"
    assert [attempt.accepted for attempt in outcome.attempts] == [True]


@verifies(SWR.SWR_3121)
def test_a_layout_the_heuristic_cannot_map_is_what_the_model_is_for(tmp_path: Path) -> None:
    """No frontmatter key identifies a requirement, so the heuristic can only refuse."""
    specs = tmp_path / "specs"
    specs.mkdir()
    (specs / "login.md").write_text(
        "---\nowner: ada\nstate: draft\n---\n\n# SWR-1 Log in\n\nThe user logs in.\n",
        encoding="utf-8",
    )
    answer = {
        "kind": "declarative",
        "rationale": "the id is in the heading, which a frontmatter key cannot reach",
        "config": {
            "source-id": "discovered",
            "type": "markdown",
            "glob": "specs/**/*.md",
            "id": {"source": "heading", "pattern": "(?P<value>SWR-[0-9]+)"},
            "title": "heading",
        },
    }
    provider = answering(answer)

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), source_analyst(provider)))

    assert provider.asked, "the heuristic had nothing adoptable and the chain escalated"
    assert outcome.is_acceptable
    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.DECLARATIVE
    assert [attempt.accepted for attempt in outcome.attempts] == [False, True]


@verifies(SWR.SWR_3121)
def test_a_frontmatter_free_store_reaches_the_agent(tmp_path: Path) -> None:
    """The shape the agent exists for, and the one it was never asked about.

    A tree of plain Markdown scores zero on the heuristic's own notion of a
    candidate, so before SWR-3121 the analyst answered ``None`` *before the seam
    was reached* — the model was never consulted for the layouts it is for.
    """
    specs = tmp_path / "requirements"
    specs.mkdir()
    for number in (1, 2):
        (specs / f"FR-{number}-thing.md").write_text(
            f"# FR-{number} — Thing {number}\n\nThe product does thing {number}.\n",
            encoding="utf-8",
        )
    provider = answering(
        {
            "kind": "declarative",
            "rationale": "the id is the leading token of each file name",
            "config": {
                "source-id": "discovered",
                "type": "markdown",
                "glob": "requirements/**/*.md",
                "id": {"source": "stem", "pattern": "^(?P<value>FR-[0-9]+)"},
                "title": "heading",
                "description": "body",
            },
        },
    )

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), source_analyst(provider)))

    assert provider.asked
    assert outcome.is_acceptable, outcome.summary()
    assert outcome.validation is not None
    assert outcome.validation.requirement_ids == ("FR-1", "FR-2")


@verifies(SWR.SWR_3121)
def test_the_agent_is_given_the_prose_and_not_only_a_key_inventory(tmp_path: Path) -> None:
    """A frontmatter-free store has no vocabulary; excerpts are all there is."""
    specs = tmp_path / "requirements"
    specs.mkdir()
    (specs / "FR-1-login.md").write_text(
        "# FR-1 — Log in\n\nThe user signs in with a password.\n",
        encoding="utf-8",
    )

    prompt = source_prompt(survey_repository(tmp_path))

    assert "opening text of the first documents" in prompt
    assert "requirements/FR-1-login.md" in prompt
    assert "The user signs in with a password." in prompt


@verifies(SWR.SWR_3121)
def test_without_a_model_the_heuristics_own_answer_stands(tmp_path: Path) -> None:
    """The fallback is the default: no persona, no model, still a proposal."""
    specs = tmp_path / "specs"
    specs.mkdir()
    (specs / "login.md").write_text("---\nowner: ada\n---\n\n# Log in\n", encoding="utf-8")
    config = RotarisConfig()
    config.personas = {}

    outcome = discover_source(tmp_path, source_analysts_for(config))

    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.PROGRAMMATIC
    assert outcome.proposal.declarative_blocker, "and it says what a mapping cannot express"
    absence = outcome.attempts[-1]
    assert not absence.proposed
    assert "persona" in absence.note, "and the board can say the agent was not there"


@verifies(SWR.SWR_3121)
def test_a_model_that_says_nothing_leaves_the_heuristics_answer_in_place(tmp_path: Path) -> None:
    specs = tmp_path / "specs"
    specs.mkdir()
    (specs / "login.md").write_text("---\nowner: ada\n---\n\n# Log in\n", encoding="utf-8")
    agent = source_analyst(answering({"reasoning": "I cannot tell"}))

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert outcome.proposal is not None
    assert outcome.proposal.kind is ProposalKind.PROGRAMMATIC
    assert outcome.attempts[-1].note == "the model answered with no usable proposal"


@verifies(SWR.SWR_3121)
def test_an_unreachable_model_says_so_rather_than_saying_nothing(tmp_path: Path) -> None:
    """ "Configure a model" and "the model failed" ask different things of a user."""
    specs = tmp_path / "specs"
    specs.mkdir()
    (specs / "login.md").write_text("---\nowner: ada\n---\n\n# Log in\n", encoding="utf-8")
    agent = source_analyst(OutageProvider())

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), agent))

    assert outcome.proposal is not None, "the deterministic result still stands"
    assert "could not be reached" in outcome.attempts[-1].note
    assert "could not be reached" in outcome.summary()


@verifies(SWR.SWR_3106, SWR.SWR_3117, SWR.SWR_3121)
def test_the_workspace_chain_is_the_heuristic_with_its_persona_behind_it() -> None:
    config = RotarisConfig()
    config.personas = {
        "requirements-engineer": PersonaConfig(
            name="requirements-engineer",
            model="a-model",
            purpose=PURPOSE,
        ),
    }

    chain = source_analysts_for(config)

    assert all(isinstance(analyst, SourceAnalyst) for analyst in chain)
    assert isinstance(chain[0], HeuristicAnalyst), "deterministic first, always"
    assert isinstance(chain[1], SourceDiscoveryAnalyst)
    assert chain[1].label == "requirements-engineer (a-model)"


@verifies(SWR.SWR_3121)
def test_a_repository_with_no_specifications_in_it_costs_no_model_call(tmp_path: Path) -> None:
    """Every workspace without a requirement store takes this path; none may pay for it."""
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("print('hello')\n", encoding="utf-8")
    provider = answering(PROPOSED_MAPPING)

    outcome = discover_source(tmp_path, (HeuristicAnalyst(), source_analyst(provider)))

    assert outcome.proposal is None
    assert not provider.asked
    assert not outcome.attempts[-1].consulted
    assert "heading or frontmatter" in outcome.attempts[-1].note


@verifies(SWR.SWR_3106, SWR.SWR_3117, SWR.SWR_3121)
def test_a_workspace_with_no_persona_at_all_still_discovers(tmp_path: Path) -> None:
    """A roster pointing at nothing is a worse proposal, never no proposal."""
    _write_specs(tmp_path)
    config = RotarisConfig()
    config.personas = {}

    outcome = discover_source(tmp_path, source_analysts_for(config))

    assert outcome.is_acceptable
    assert outcome.attempts[0].accepted, "the heuristic mapped it; the absence never mattered"


# --------------------------------------------------------------------------
# The protocols, and the persona behind every answer
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3106, SWR.SWR_3404, SWR.SWR_3411, SWR.SWR_3503, SWR.SWR_3507)
def test_every_model_protocol_of_the_epic_now_has_a_shipped_implementation() -> None:
    """The five that had none. ``isinstance`` because each protocol is runtime-checkable."""
    provider = answering({})

    assert isinstance(source_analyst(provider), SourceAnalyst)
    assert isinstance(decomposition_analyst(provider), DecompositionModel)
    assert isinstance(derivation_analyst(provider), DerivationModel)
    assert isinstance(impact_analyst(provider), ImpactModel)
    assert isinstance(superseding_analyst(provider), MigrationAnalyst)


@verifies(SWR.SWR_3117)
def test_the_answer_is_given_by_the_configured_persona_and_says_what_it_is_for() -> None:
    provider = answering(DECIDED)

    impact_analyst(provider).analyse(impact_request())

    system = provider.system_text()
    assert PERSONA in system
    assert PURPOSE in system
    assert "impact analysis" in system


@verifies(SWR.SWR_3117)
def test_each_analyst_takes_its_job_from_the_workspace_roster() -> None:
    """One persona field per agentic job, and each analyst reads its own."""
    config = RotarisConfig()
    config.personas = {
        name: PersonaConfig(name=name, model=f"{name}-model", purpose=f"{name} does things")
        for name in ("requirements-engineer", "coding-agent")
    }

    built = {
        analyst.JOB: analyst
        for analyst in (
            SourceDiscoveryAnalyst.for_config(config),
            DecompositionAnalyst.for_config(config),
            DerivationAnalyst.for_config(config),
            ImpactAnalyst.for_config(config),
            SupersedingAnalyst.for_config(config),
            RequirementAssessor.for_config(config),
        )
    }

    assert set(built) == {
        "source_discovery",
        "decomposition",
        "execution",
        "impact_analysis",
        "migration_analysis",
    }
    assert built["impact_analysis"].persona == "requirements-engineer"
    assert built["impact_analysis"].model_name == "requirements-engineer-model"
    # The execution persona is a different one, and the roster is what says so.
    assert built["execution"].persona == "coding-agent"
    assert built["execution"].model_name == "coding-agent-model"


@verifies(SWR.SWR_3117)
def test_composing_an_analyst_reaches_no_provider() -> None:
    """The desktop composes a flow on the Qt thread; building the model there would block it."""
    config = RotarisConfig()
    config.personas = {
        "requirements-engineer": PersonaConfig(
            name="requirements-engineer",
            model="a-model-no-workspace-configures",
            purpose=PURPOSE,
        ),
    }

    analyst = ImpactAnalyst.for_config(config)

    # A model nobody configured cannot be built; that this construction succeeds is the point.
    assert analyst.model_name == "a-model-no-workspace-configures"
