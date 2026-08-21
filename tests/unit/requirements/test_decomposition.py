"""Productive use: before Rotaris starts an agent on a requirement, it decides whether the
work fits into one run — and when it does not, it produces a split a reviewer can read and
argue with *before* any worktree exists.
Expected outcome: a small requirement gets exactly one unit and never reaches a model; a
split names, per unit, its scope and why it is separate; a cyclic or oversized plan is
rejected with the units named; and a planner that tries to author a requirement instead of
a work split has those keys refused and reported."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.execution.decomposition import (
    FORBIDDEN_PROPOSAL_FIELDS,
    Decomposer,
    DecompositionError,
    DecompositionPlan,
    DecompositionRequest,
    DecompositionSignal,
    DecompositionThresholds,
    PlannedUnit,
    RejectionKind,
    RequirementAssessment,
    read_proposal,
    signals_over,
    single_unit_plan,
)
from rotaris_core.requirements.model import CanonicalRequirement

if TYPE_CHECKING:
    from collections.abc import Mapping

pytestmark = pytest.mark.unit

REQ = "SWR-3404"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Automatic requirement decomposition",
        description="Assess the requirement and split it only when it does not fit one run.",
        source_id="specs",
        source_path="docs/requirements/3400/SWR-3404.md",
    )


def large() -> RequirementAssessment:
    """An assessment that pushes several factors past their default thresholds."""
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
    )


class ScriptedPlanner:
    """A decomposition model that answers with a fixed payload and counts its calls."""

    def __init__(self, payload: Mapping[str, object]) -> None:
        self.payload = payload
        self.requests: list[DecompositionRequest] = []

    def propose(self, request: DecompositionRequest) -> Mapping[str, object]:
        self.requests.append(request)
        return self.payload


class ExplodingPlanner:
    """A model that fails. A run must survive it; the flow reports the rejection."""

    def __init__(self) -> None:
        self.calls = 0

    def propose(self, request: DecompositionRequest) -> Mapping[str, object]:
        self.calls += 1
        raise RuntimeError(f"the provider is down while planning {request.req_id}")


def two_unit_payload() -> dict[str, object]:
    return {
        "rationale": "the store and the board move independently and would collide on merge",
        "units": [
            {
                "key": "store",
                "title": "Delivery store fields",
                "scope": "src/rotaris_core/requirements/delivery/",
                "rationale": "owns the persistence boundary; nothing else may write it",
                "expected_files": ["src/rotaris_core/requirements/delivery/store.py"],
            },
            {
                "key": "board",
                "title": "Board rendering",
                "scope": "apps/rotaris/src/rotaris/views/",
                "rationale": "reads the store's shape and must land after it",
                "depends_on": ["store"],
            },
        ],
    }


# -- the assessment (SWR-3404's eight factors) ------------------------------


@verifies(SWR.SWR_3404)
def test_signals_over_names_every_factor_that_argued_for_a_split() -> None:
    triggered = signals_over(large())

    assert DecompositionSignal.AFFECTED_COMPONENTS in triggered
    assert DecompositionSignal.INDEPENDENT_CHANGES in triggered
    assert DecompositionSignal.MERGE_CONFLICT_RISK in triggered
    assert DecompositionSignal.CONTEXT_SIZE in triggered
    # Named individually, in declaration order — a count would tell a reviewer nothing.
    assert list(triggered) == [signal for signal in DecompositionSignal if signal in triggered]


@verifies(SWR.SWR_3404)
def test_parallelisability_alone_never_argues_for_a_split() -> None:
    """Work that *could* run in parallel is not work that has to be split."""
    assessment = RequirementAssessment(req_id=REQ, parallelisable=True)

    assert signals_over(assessment) == ()


@verifies(SWR.SWR_3404)
def test_a_threshold_moves_exactly_one_signal() -> None:
    assessment = RequirementAssessment(req_id=REQ, test_surface=3)

    assert signals_over(assessment) == (DecompositionSignal.TEST_SURFACE,)
    assert signals_over(assessment, DecompositionThresholds(test_surface=4)) == ()


# -- the small case: one unit, no ceremony ---------------------------------


@verifies(SWR.SWR_3404)
def test_a_small_requirement_produces_one_unit_and_never_reaches_the_model() -> None:
    planner = ExplodingPlanner()
    decomposer = Decomposer(model=planner, clock=lambda: AT)

    result = decomposer.decompose(requirement(), RequirementAssessment(req_id=REQ))

    assert result.accepted
    plan = result.plan
    assert plan is not None
    assert plan.count == 1
    assert plan.single
    assert plan.triggered == ()
    assert plan.planner == "assessment"
    assert plan.rationale
    # The whole point of "no ceremony": no prompt, no latency, no model.
    assert planner.calls == 0


@verifies(SWR.SWR_3404)
def test_decomposition_switched_off_runs_one_unit_and_says_so() -> None:
    planner = ExplodingPlanner()
    decomposer = Decomposer(model=planner, enabled=False, clock=lambda: AT)

    plan = decomposer.decompose(requirement(), large()).plan

    assert plan is not None
    assert plan.count == 1
    assert "switched off" in plan.rationale
    assert planner.calls == 0


@verifies(SWR.SWR_3404)
def test_a_splittable_requirement_without_a_planner_runs_as_one_unit_and_says_why() -> None:
    plan = Decomposer(clock=lambda: AT).decompose(requirement(), large()).plan

    assert plan is not None
    assert plan.count == 1
    assert "no decomposition planner is configured" in plan.rationale
    assert plan.triggered != ()


# -- the split case ---------------------------------------------------------


@verifies(SWR.SWR_3404)
def test_a_split_states_per_unit_its_scope_and_why_it_is_separate() -> None:
    planner = ScriptedPlanner(two_unit_payload())
    decomposer = Decomposer(model=planner, persona="requirements-engineer", clock=lambda: AT)

    plan = decomposer.decompose(requirement(), large()).plan

    assert plan is not None
    assert plan.keys == ("store", "board")
    for unit in plan.units:
        assert unit.scope.strip()
        assert unit.rationale.strip()
    assert plan.rationale.startswith("the store and the board")
    assert plan.planner == "requirements-engineer"
    assert plan.recorded_at == AT
    # The model was asked with the assessment that argued for the split.
    assert planner.requests[0].triggered == plan.triggered
    assert planner.requests[0].persona == "requirements-engineer"


@verifies(SWR.SWR_3404)
def test_a_plan_missing_a_units_rationale_is_rejected() -> None:
    payload = two_unit_payload()
    units = payload["units"]
    assert isinstance(units, list)
    units[1] = {"key": "board", "title": "Board rendering", "scope": "apps/"}

    result = Decomposer(model=ScriptedPlanner(payload), clock=lambda: AT).decompose(
        requirement(),
        large(),
    )

    assert not result.accepted
    rejection = result.rejection
    assert rejection is not None
    assert rejection.kind is RejectionKind.UNJUSTIFIED
    assert "board" in rejection.reason


@verifies(SWR.SWR_3404)
def test_a_cyclic_plan_is_rejected_and_names_the_units_in_the_cycle() -> None:
    payload = {
        "rationale": "two halves that each wait for the other",
        "units": [
            {"key": "a", "scope": "src/a", "rationale": "half one", "depends_on": ["b"]},
            {"key": "b", "scope": "src/b", "rationale": "half two", "depends_on": ["a"]},
        ],
    }

    result = Decomposer(model=ScriptedPlanner(payload), clock=lambda: AT).decompose(
        requirement(),
        large(),
    )

    assert not result.accepted
    rejection = result.rejection
    assert rejection is not None
    assert rejection.kind is RejectionKind.CYCLE
    assert "'a', 'b'" in rejection.reason
    assert set(rejection.units) == {"a", "b"}
    assert "rejected" in rejection.message


@verifies(SWR.SWR_3404)
def test_a_plan_with_a_cycle_cannot_even_be_constructed() -> None:
    with pytest.raises(DecompositionError, match="cycle"):
        DecompositionPlan(
            req_id=REQ,
            rationale="why",
            units=(
                PlannedUnit(key="a", scope="src/a", rationale="one", depends_on=("b",)),
                PlannedUnit(key="b", scope="src/b", rationale="two", depends_on=("a",)),
            ),
        )


@verifies(SWR.SWR_3404)
def test_a_unit_waiting_for_something_the_plan_does_not_contain_is_rejected() -> None:
    payload = {
        "rationale": "one unit waits for a sibling that was never proposed",
        "units": [
            {"key": "impl", "scope": "src/", "rationale": "the change", "depends_on": ["ghost"]},
            {"key": "tests", "scope": "tests/", "rationale": "the coverage"},
        ],
    }

    result = Decomposer(model=ScriptedPlanner(payload), clock=lambda: AT).decompose(
        requirement(),
        large(),
    )

    assert result.rejection is not None
    assert result.rejection.kind is RejectionKind.UNKNOWN_DEPENDENCY
    assert "ghost" in result.rejection.reason


@verifies(SWR.SWR_3404)
def test_a_plan_over_the_configured_bound_is_rejected_not_truncated() -> None:
    payload = {
        "rationale": "four ways to slice it",
        "units": [
            {"key": f"u{index}", "scope": f"src/{index}", "rationale": "part"} for index in range(4)
        ],
    }

    result = Decomposer(model=ScriptedPlanner(payload), max_units=2, clock=lambda: AT).decompose(
        requirement(),
        large(),
    )

    assert result.rejection is not None
    assert result.rejection.kind is RejectionKind.TOO_MANY_UNITS
    assert "the configured bound is 2" in result.rejection.reason
    assert len(result.rejection.units) == 4


@verifies(SWR.SWR_3404)
def test_an_empty_proposal_is_rejected() -> None:
    result = Decomposer(model=ScriptedPlanner({"units": []}), clock=lambda: AT).decompose(
        requirement(),
        large(),
    )

    assert result.rejection is not None
    assert result.rejection.kind is RejectionKind.EMPTY


@verifies(SWR.SWR_3404)
def test_a_failing_planner_is_a_rejection_not_a_crash() -> None:
    planner = ExplodingPlanner()

    result = Decomposer(model=planner, clock=lambda: AT).decompose(requirement(), large())

    assert planner.calls == 1
    assert result.rejection is not None
    assert result.rejection.kind is RejectionKind.MODEL_ERROR
    assert "the provider is down" in result.rejection.reason


# -- the reasoning is recorded before anything runs -------------------------


@verifies(SWR.SWR_3404)
def test_a_plan_without_recorded_reasoning_cannot_be_built() -> None:
    with pytest.raises(DecompositionError, match="records the reasoning"):
        DecompositionPlan(req_id=REQ, rationale="   ", units=(PlannedUnit(key="impl"),))


@verifies(SWR.SWR_3404)
def test_a_plan_with_no_unit_at_all_cannot_be_built() -> None:
    with pytest.raises(DecompositionError, match="at least one unit"):
        DecompositionPlan(req_id=REQ, rationale="why", units=())


@verifies(SWR.SWR_3404)
def test_single_unit_plan_records_why_it_was_not_split() -> None:
    plan = single_unit_plan(REQ, title="Automatic requirement decomposition", at=AT)

    assert plan.count == 1
    assert "fits into one run" in plan.rationale
    assert plan.summary.endswith("no signal triggered")


# -- decomposition creates units, never requirements (SWR-3411's boundary) --


@verifies(SWR.SWR_3404)
def test_a_planner_cannot_author_a_requirement() -> None:
    payload = {
        **two_unit_payload(),
        "req_id": "SWR-9999",
        "type": "technical",
        "derived-from": REQ,
        "lifecycle": "approved",
    }

    intake = read_proposal(payload)

    assert intake.tampered
    assert set(intake.refused) == {"req_id", "type", "derived-from", "lifecycle"}
    assert "decomposition creates units, never requirements" in intake.message
    # The units survive; only the requirement-authoring keys were dropped.
    assert [unit.key for unit in intake.proposal.units] == ["store", "board"]


@verifies(SWR.SWR_3404)
def test_the_refused_keys_travel_on_the_plan() -> None:
    payload = {**two_unit_payload(), "req_id": "SWR-9999"}

    plan = (
        Decomposer(model=ScriptedPlanner(payload), clock=lambda: AT)
        .decompose(
            requirement(),
            large(),
        )
        .plan
    )

    assert plan is not None
    assert plan.refused_fields == ("req_id",)


@verifies(SWR.SWR_3404)
def test_every_requirement_authoring_key_is_refused() -> None:
    payload: dict[str, object] = {key: "x" for key in FORBIDDEN_PROPOSAL_FIELDS}
    payload["units"] = [{"key": "impl"}]

    intake = read_proposal(payload)

    assert set(intake.refused) == set(FORBIDDEN_PROPOSAL_FIELDS)
    assert intake.proposal.units[0].key == "impl"


@verifies(SWR.SWR_3404)
def test_a_malformed_unit_entry_is_ignored_rather_than_fatal() -> None:
    intake = read_proposal({"units": ["not a unit", {"key": "impl"}], "extra": 1})

    assert [unit.key for unit in intake.proposal.units] == ["impl"]
    assert "units[0]" in intake.ignored
    assert "extra" in intake.ignored


# -- the plan becomes units (SWR-3401) --------------------------------------


@verifies(SWR.SWR_3404)
def test_a_plan_becomes_execution_units_with_resolved_edges_and_stable_ids() -> None:
    plan = (
        Decomposer(model=ScriptedPlanner(two_unit_payload()), clock=lambda: AT)
        .decompose(requirement(), large())
        .plan
    )
    assert plan is not None

    units = plan.to_units()
    again = plan.to_units()

    assert units.count == 2
    assert units.ids == again.ids, "unit ids are derived, so replanning reproduces them"
    store_id, board_id = units.ids
    assert units.require(board_id).depends_on == (store_id,)
    assert units.require(store_id).depends_on == ()
    # The scheduler's conflict input travels with the plan (SWR-3412).
    assert plan.expected_files == {
        "store": ("src/rotaris_core/requirements/delivery/store.py",),
    }
