"""Productive use: a user releases a requirement that touches several components. Before any
agent starts, Rotaris shows what it intends to do — how many units, what each of them owns,
why it is separate, and which of them waits for which.
Expected outcome: a scripted decomposition over a multi-component requirement produces the
expected unit graph in the unit store; the scheduler holds the dependent unit and says why;
the board shows the units before a single worktree exists; and a cyclic plan never reaches
a run at all."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import (
    BoardInputs,
    ExecutionSummary,
    RunOutcome,
    UnitState,
    project_board,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.decomposition import (
    Decomposer,
    DecompositionRequest,
    DecompositionSignal,
    RejectionKind,
    RequirementAssessment,
    signals_over,
)
from rotaris_core.requirements.execution.flow import (
    FlowStage,
    RequirementFlow,
    StageEvent,
    StagePhase,
)
from rotaris_core.requirements.execution.run_seam import (
    IsolationRequest,
    RequirementRunSeam,
    RunReport,
    RunWorkspace,
    UnitLaunch,
)
from rotaris_core.requirements.execution.scheduler import (
    HoldReason,
    ScheduledRequirement,
    SchedulerLimits,
    schedule,
)
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.requirements.registry import RequirementIndex

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

pytestmark = pytest.mark.integration

REQ = "SWR-3404"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Automatic requirement decomposition",
        description=(
            "Assess the requirement against the affected components, the independent"
            " changes, the technical dependencies, the test surface, the architecture"
            " boundaries, the context size, parallelisability and merge-conflict risk."
        ),
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
    )


def multi_component() -> RequirementAssessment:
    """What an impact analysis reports for a requirement spanning three components."""
    return RequirementAssessment(
        req_id=REQ,
        affected_components=3,
        independent_changes=3,
        technical_dependencies=2,
        test_surface=3,
        architecture_boundaries=2,
        context_tokens=120_000,
        parallelisable=False,
        merge_conflict_risk=0.7,
        notes=("the store, the projection and the desktop board all move",),
    )


THREE_UNITS: dict[str, object] = {
    "rationale": (
        "the store owns persistence, the projection reads it, and the board renders the"
        " projection; each is reviewable on its own and they would collide on merge"
    ),
    "units": [
        {
            "key": "store",
            "title": "Delivery store fields",
            "scope": "src/rotaris_core/requirements/delivery/store.py",
            "rationale": "owns the persistence boundary; nothing else may write it",
            "expected_files": ["src/rotaris_core/requirements/delivery/store.py"],
        },
        {
            "key": "projection",
            "title": "Board projection",
            "scope": "src/rotaris_core/requirements/delivery/projection.py",
            "rationale": "reads the store's shape and must land after it",
            "depends_on": ["store"],
            "expected_files": ["src/rotaris_core/requirements/delivery/projection.py"],
        },
        {
            "key": "board",
            "title": "Desktop board",
            "scope": "apps/rotaris/src/rotaris/views/",
            "rationale": "renders the projection; a separate review surface and reviewer",
            "depends_on": ["projection"],
            "expected_files": ["apps/rotaris/src/rotaris/views/board.py"],
        },
    ],
}


class ScriptedPlanner:
    """The decomposition persona, scripted. No network anywhere near this test."""

    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.requests: list[DecompositionRequest] = []

    def propose(self, request: DecompositionRequest) -> dict[str, object]:
        self.requests.append(request)
        return self.payload


class Isolation:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.requests: list[IsolationRequest] = []

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        self.requests.append(request)
        path = self.root / (request.session_id or "run")
        path.mkdir(parents=True, exist_ok=True)
        return RunWorkspace(path=str(path), branch=request.branch or "rotaris/req/unknown")


class Host:
    def __init__(self) -> None:
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        return RunReport(
            outcome=RunOutcome.SUCCEEDED,
            produced_commits=(f"commit-{launch.unit_id}",),
            changed_files=("src/changed.py",),
            verified=True,
            verification_detail="1 check(s) passed",
            agent_claimed_complete=True,
        )


def ticking() -> Callable[[], dt.datetime]:
    counter = iter(range(100_000))
    return lambda: AT + dt.timedelta(seconds=next(counter))


def released(workspace: Path) -> ExecutionTransitions:
    """A requirement on Ready, behind the write path a run actually uses."""
    transitions = ExecutionTransitions.for_workspace(
        workspace,
        current_for=lambda _: requirement(),
    )
    outcome = transitions.apply(
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
    )
    assert outcome.accepted, outcome.message
    return transitions


# -- planner + unit store ---------------------------------------------------


@verifies(SWR.SWR_3404)
def test_a_multi_component_requirement_yields_the_expected_unit_graph() -> None:
    planner = ScriptedPlanner(THREE_UNITS)
    decomposer = Decomposer(model=planner, persona="requirements-engineer", clock=ticking())

    result = decomposer.decompose(requirement(), multi_component())

    assert result.accepted, result.message
    plan = result.plan
    assert plan is not None
    assert plan.keys == ("store", "projection", "board")
    assert DecompositionSignal.AFFECTED_COMPONENTS in plan.triggered
    assert plan.triggered == signals_over(multi_component())
    assert planner.requests[0].max_units == 6
    assert planner.requests[0].assessment == multi_component()

    # The unit store realises the graph: derived ids, resolved edges, one chain.
    units = plan.to_units()
    store_id, projection_id, board_id = units.ids
    assert units.require(store_id).depends_on == ()
    assert units.require(projection_id).depends_on == (store_id,)
    assert units.require(board_id).depends_on == (projection_id,)
    assert [unit.unit_id for unit in units.ready()] == [store_id]
    assert units.dependents_of(store_id) == (projection_id,)
    # Deterministic: the same plan produces the same ids after a restart.
    assert plan.to_units().ids == units.ids


@verifies(SWR.SWR_3404)
def test_the_unit_graph_reaches_the_scheduler_and_holds_the_dependants() -> None:
    plan = (
        Decomposer(model=ScriptedPlanner(THREE_UNITS), clock=ticking())
        .decompose(requirement(), multi_component())
        .plan
    )
    assert plan is not None
    units = plan.to_units()

    decision = schedule(
        [
            ScheduledRequirement.from_units(
                units,
                state=DeliveryState.READY,
                expected_files={
                    unit.unit_id: plan.expected_files.get(key, ())
                    for unit, key in zip(units.units, plan.keys, strict=True)
                },
            ),
        ],
        limits=SchedulerLimits(concurrency=3),
    )

    store_id, projection_id, board_id = units.ids
    assert decision.selected_units == (store_id,)
    assert decision.reasons[projection_id] is HoldReason.UNIT_DEPENDENCY
    assert decision.reasons[board_id] is HoldReason.UNIT_DEPENDENCY
    hold = decision.hold_for(projection_id)
    assert hold is not None
    assert store_id in hold.detail, "a held candidate names what it waits for"


@verifies(SWR.SWR_3404)
def test_a_cyclic_plan_never_reaches_the_unit_store() -> None:
    cyclic = {
        "rationale": "two halves that wait for each other",
        "units": [
            {"key": "a", "scope": "src/a", "rationale": "one", "depends_on": ["b"]},
            {"key": "b", "scope": "src/b", "rationale": "two", "depends_on": ["a"]},
        ],
    }

    result = Decomposer(model=ScriptedPlanner(cyclic), clock=ticking()).decompose(
        requirement(),
        multi_component(),
    )

    assert result.plan is None
    assert result.rejection is not None
    assert result.rejection.kind is RejectionKind.CYCLE
    assert set(result.rejection.units) == {"a", "b"}


# -- the user flow: release it, see the units before they run --------------


@verifies(SWR.SWR_3404)
def test_a_released_requirement_shows_its_units_before_any_of_them_runs(
    tmp_path: Path,
) -> None:
    """The user-observable result: the split is on the board before a worktree exists."""
    host = Host()
    isolation = Isolation(tmp_path / "trees")
    seen: list[StageEvent] = []
    flow = RequirementFlow(
        transitions=released(tmp_path),
        seam=RequirementRunSeam(isolation=isolation, host=host, clock=ticking()),
        current_for=lambda _: requirement(),
        decomposer=Decomposer(model=ScriptedPlanner(THREE_UNITS), clock=ticking()),
        assess=lambda _: multi_component(),
        clock=ticking(),
        observer=seen.append,
    )

    result = flow.start(requirement(), base_commit="base0001")

    assert result.succeeded, result.message
    assert result.plan is not None
    assert result.plan.count == 3
    assert result.units is not None

    # The units were created — and observable — before the first worktree.
    stages = [(event.stage, event.phase) for event in seen]
    units_done = stages.index((FlowStage.UNITS, StagePhase.FINISHED))
    first_worktree = stages.index((FlowStage.WORKTREE, StagePhase.STARTED))
    assert units_done < first_worktree
    units_event = next(
        event
        for event in seen
        if event.stage is FlowStage.UNITS and event.phase is StagePhase.FINISHED
    )
    assert "3 unit(s)" in units_event.detail
    decomposition_event = next(
        event
        for event in seen
        if event.stage is FlowStage.DECOMPOSITION and event.phase is StagePhase.FINISHED
    )
    assert "3 unit(s)" in decomposition_event.detail

    # And the dependency order was honoured by the runs that followed.
    assert [launch.unit_id for launch in host.launches] == list(result.units.ids)
    assert len({request.branch for request in isolation.requests}) == 3


@verifies(SWR.SWR_3404)
def test_the_board_renders_the_planned_units_without_a_single_run() -> None:
    """What the user actually sees: three cards' worth of units, all still pending."""
    plan = (
        Decomposer(model=ScriptedPlanner(THREE_UNITS), clock=ticking())
        .decompose(requirement(), multi_component())
        .plan
    )
    assert plan is not None
    units = plan.to_units()

    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(requirement(),), generation=1),
            execution={REQ: ExecutionSummary(req_id=REQ, units=units.to_views())},
        ),
    )

    entry = projection.entry(REQ)
    assert entry is not None
    assert entry.execution.unit_count == 3
    assert [unit.title for unit in entry.execution.units] == [
        "Delivery store fields",
        "Board projection",
        "Desktop board",
    ]
    assert all(unit.state is UnitState.PENDING for unit in entry.execution.units)
    assert all(unit.scope for unit in entry.execution.units)
    assert entry.execution.runs == (), "nothing has run yet"
    assert entry.execution.outstanding_units == units.ids


@verifies(SWR.SWR_3404)
def test_a_small_requirement_runs_as_one_unit_with_no_ceremony(tmp_path: Path) -> None:
    host = Host()
    planner = ScriptedPlanner(THREE_UNITS)
    flow = RequirementFlow(
        transitions=released(tmp_path),
        seam=RequirementRunSeam(
            isolation=Isolation(tmp_path / "trees"),
            host=host,
            clock=ticking(),
        ),
        current_for=lambda _: requirement(),
        decomposer=Decomposer(model=planner, clock=ticking()),
        assess=lambda _: RequirementAssessment(req_id=REQ),
        clock=ticking(),
    )

    result = flow.start(requirement(), base_commit="base0001")

    assert result.succeeded, result.message
    assert result.plan is not None
    assert result.plan.single
    assert planner.requests == [], "a small requirement never reaches the planner"
    assert len(host.launches) == 1
    integration = result.outcome_for(FlowStage.INTEGRATION)
    assert integration is not None
    assert integration.skipped
