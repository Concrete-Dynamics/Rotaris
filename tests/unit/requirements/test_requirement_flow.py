"""Productive use: a user drops a requirement on Ready and walks away. Rotaris snapshots it,
analyses it, splits it if it needs splitting, creates the units, gives each a worktree, runs
an agent in it, verifies the work, integrates it and presents a reviewable result — telling
the user, at every step, what it is doing and how long it took.
Expected outcome: every stage publishes its start, its outcome and its duration; a stage
failure stops the flow there and leaves the requirement in Blocked or Review naming that
stage; delivery state moves only through the transition function; and a restart mid-flow
resumes instead of re-running work that is already on a branch."""

from __future__ import annotations

import datetime as dt
import inspect
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind
from rotaris_core.requirements.delivery.projection import RunOutcome
from rotaris_core.requirements.delivery.state import (
    ActorKind,
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord
from rotaris_core.requirements.delivery.transitions import (
    TransitionOutcome,
    TransitionRequest,
    apply_transition,
)
from rotaris_core.requirements.execution import flow as flow_module
from rotaris_core.requirements.execution.decomposition import (
    Decomposer,
    DecompositionRequest,
    RequirementAssessment,
)
from rotaris_core.requirements.execution.flow import (
    FLOW_STAGES,
    FlowStage,
    FlowStateStore,
    RequirementFlow,
    RetryPolicy,
    StageEvent,
    StagePhase,
)
from rotaris_core.requirements.execution.history import ExecutionHistory
from rotaris_core.requirements.execution.run_seam import (
    IsolationError,
    IsolationRequest,
    RequirementRunSeam,
    RunReport,
    RunWorkspace,
    UnitLaunch,
)
from rotaris_core.requirements.model import CanonicalRequirement

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-3413"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")


def requirement(
    req_id: str = REQ, *, description: str = "Ready starts the flow."
) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Ready starts the agentic requirement flow",
        description=description,
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
        source_revision="rev-3",
    )


def ready_record(req_id: str = REQ) -> DeliveryRecord:
    return DeliveryRecord(
        req_id=req_id,
        delivery=DeliveryStatus(
            state=DeliveryState.READY,
            changed_at=AT,
            changed_by=USER,
            cause=TransitionCause.USER_ACTION,
        ),
    )


class Transitions:
    """The real state machine over one in-memory record — the flow's only door.

    Stands in for
    :class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions`,
    and therefore carries both of its promises: the guard marker the flow checks
    at construction, and a trail that keeps what was recorded so a test can read
    it back without a filesystem.
    """

    enforces_specification_guard = True

    def __init__(self, record: DeliveryRecord | None = None) -> None:
        self.record = record if record is not None else ready_record()
        self.requests: list[TransitionRequest] = []
        self.events: list[AuditEvent] = []

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        self.requests.append(request)
        outcome = apply_transition(self.record, request)
        if outcome.accepted:
            self.record = outcome.record
        return outcome

    def record_event(self, event: AuditEvent) -> AuditEvent:
        self.events.append(event)
        return event

    @property
    def targets(self) -> tuple[DeliveryState, ...]:
        return tuple(request.target for request in self.requests)


class Isolation:
    """A worktree provider over tmp_path. Fails for the branches it was told to."""

    def __init__(
        self,
        root: Path,
        *,
        refuse: Iterable[str] = (),
        refuse_all: bool = False,
    ) -> None:
        self.root = root
        self.refuse = set(refuse)
        self.refuse_all = refuse_all
        self.requests: list[IsolationRequest] = []

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        self.requests.append(request)
        branch = request.branch or "rotaris/req/unknown"
        if self.refuse_all or branch in self.refuse:
            raise IsolationError(f"{branch} could not be created")
        path = self.root / (request.session_id or "run")
        path.mkdir(parents=True, exist_ok=True)
        return RunWorkspace(path=str(path), branch=branch)


class Host:
    """An agent host that reports whatever the test told it to."""

    def __init__(
        self,
        *,
        fails: Callable[[UnitLaunch], str] | None = None,
        verified: bool | None = True,
        commits: tuple[str, ...] = ("commit-a",),
    ) -> None:
        self.fails = fails
        self.verified = verified
        self.commits = commits
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        reason = self.fails(launch) if self.fails is not None else ""
        if reason:
            return RunReport(outcome=RunOutcome.FAILED, failure_reason=reason)
        return RunReport(
            outcome=RunOutcome.SUCCEEDED,
            produced_commits=self.commits,
            changed_files=("src/rotaris_core/requirements/execution/flow.py",),
            verified=self.verified,
            verification_detail="1 check(s) passed" if self.verified else "the suite failed",
            agent_summary="implemented the flow",
            agent_claimed_complete=True,
        )


def ticking(start: dt.datetime = AT) -> Callable[[], dt.datetime]:
    """A clock that advances a second per read, so durations are observable."""
    counter = iter(range(10_000))

    def clock() -> dt.datetime:
        return start + dt.timedelta(seconds=next(counter))

    return clock


class ScriptedPlanner:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.calls = 0

    def propose(self, request: DecompositionRequest) -> dict[str, object]:
        self.calls += 1
        del request
        return self.payload


def two_units() -> dict[str, object]:
    return {
        "rationale": "two components that must land in order",
        "units": [
            {"key": "engine", "scope": "src/", "rationale": "the engine half"},
            {
                "key": "board",
                "scope": "apps/",
                "rationale": "reads the engine's shape",
                "depends_on": ["engine"],
            },
        ],
    }


def flow_for(
    tmp_path: Path,
    *,
    transitions: Transitions | None = None,
    host: Host | None = None,
    isolation: Isolation | None = None,
    decomposer: Decomposer | None = None,
    assess: Callable[[CanonicalRequirement], RequirementAssessment] | None = None,
    context_for: Callable[..., object] | None = None,
    current_for: Callable[[str], CanonicalRequirement] | None = None,
    retry: RetryPolicy | None = None,
    observer: Callable[[StageEvent], None] | None = None,
    progress: FlowStateStore | None = None,
    history: ExecutionHistory | None = None,
    clock: Callable[[], dt.datetime] | None = None,
) -> RequirementFlow:
    return RequirementFlow(
        transitions=transitions if transitions is not None else Transitions(),
        seam=RequirementRunSeam(
            isolation=isolation if isolation is not None else Isolation(tmp_path / "trees"),
            host=host if host is not None else Host(),
            clock=clock if clock is not None else ticking(),
        ),
        history=history,
        decomposer=decomposer,
        assess=assess,
        context_for=context_for,  # type: ignore[arg-type]
        # The source as it stands at the review. Unedited unless a test says
        # otherwise — but always read, because the flow has no other way to know
        # whether the specification moved (SWR-3403).
        current_for=current_for if current_for is not None else (lambda _: requirement()),
        retry=retry,
        clock=clock if clock is not None else ticking(),
        observer=observer,
        progress=progress,
    )


# -- the whole path ---------------------------------------------------------


@verifies(SWR.SWR_3413)
def test_ready_reaches_review_through_every_stage(tmp_path: Path) -> None:
    transitions = Transitions()
    seen: list[StageEvent] = []
    flow = flow_for(tmp_path, transitions=transitions, observer=seen.append)

    result = flow.start(requirement(), base_commit="base0001")

    assert result.succeeded
    assert result.final_state is DeliveryState.REVIEW
    assert result.failed_stage is None
    assert set(result.stage_names) == set(FLOW_STAGES), "no stage is silently skipped"
    assert transitions.targets == (DeliveryState.RUNNING, DeliveryState.REVIEW)
    assert transitions.record.state is DeliveryState.REVIEW
    assert seen, "the observer sees the flow live"


@verifies(SWR.SWR_3413)
def test_every_stage_publishes_a_start_an_outcome_and_a_duration(tmp_path: Path) -> None:
    result = flow_for(tmp_path).start(requirement(), base_commit="base0001")

    for stage in FLOW_STAGES:
        events = result.events_for(stage)
        assert events, f"{stage} published nothing"
        assert events[0].phase is StagePhase.STARTED
        assert events[-1].phase in {StagePhase.FINISHED, StagePhase.SKIPPED, StagePhase.FAILED}
        assert events[-1].duration_s is not None
        outcome = result.outcome_for(stage)
        assert outcome is not None
        assert outcome.duration_s > 0.0
    assert set(result.durations) == set(FLOW_STAGES)


@verifies(SWR.SWR_3413)
def test_a_skipped_stage_says_why_rather_than_going_quiet(tmp_path: Path) -> None:
    result = flow_for(tmp_path).start(requirement(), base_commit="base0001")

    analysis = result.outcome_for(FlowStage.ANALYSIS)
    integration = result.outcome_for(FlowStage.INTEGRATION)
    assert analysis is not None and analysis.skipped
    assert "no impact and scope analysis is configured" in analysis.detail
    assert integration is not None and integration.skipped
    # This flow has no integrator at all, and that is now what the stage says.
    # It used to report the *unit count* here, which read as "one unit, nothing
    # to do" on a composition that would have skipped a hundred units just the
    # same — two different skips wearing one sentence (SWR-3420).
    assert "no integrator is configured" in integration.detail


@verifies(SWR.SWR_3413)
def test_the_flow_runs_dependent_units_in_order(tmp_path: Path) -> None:
    host = Host()
    flow = flow_for(
        tmp_path,
        host=host,
        decomposer=Decomposer(model=ScriptedPlanner(two_units()), clock=lambda: AT),
        assess=lambda _: RequirementAssessment(req_id=REQ, affected_components=9),
    )

    result = flow.start(requirement(), base_commit="base0001")

    assert result.succeeded
    assert result.units is not None
    engine, board = result.units.ids
    assert [launch.unit_id for launch in host.launches] == [engine, board]
    assert len(result.outcomes_for(FlowStage.RUN)) == 2
    # Two units, two branches, two trees (SWR-3405).
    branches = {launch.workspace.branch for launch in host.launches}
    assert len(branches) == 2


@verifies(SWR.SWR_3413)
def test_the_agent_context_is_rendered_into_the_prompt(tmp_path: Path) -> None:
    host = Host()
    rendered: list[str] = []

    class Context:
        def __init__(self, text: str) -> None:
            self.text = text

        def render(self) -> str:
            rendered.append(self.text)
            return self.text

    flow = flow_for(
        tmp_path,
        host=host,
        context_for=lambda unit, snapshot: Context(
            f"context for {unit.unit_id} @ {snapshot.run_id}"
        ),
    )

    flow.start(requirement(), base_commit="base0001")

    assert rendered
    assert host.launches[0].prompt == rendered[0]
    assert host.launches[0].prompt.startswith("context for ")


@verifies(SWR.SWR_3413)
def test_the_history_records_the_run_before_and_after(tmp_path: Path) -> None:
    history = ExecutionHistory(tmp_path / "workspace")
    flow = flow_for(tmp_path, history=history)

    result = flow.start(requirement(), base_commit="base0001")

    stored = history.load(REQ)
    assert stored.run_ids == result.run_ids
    assert stored.succeeded
    assert stored.implementation_commits == ("commit-a",)


# -- a failure stops at its stage and names it ------------------------------


@verifies(SWR.SWR_3413)
def test_a_rejected_decomposition_blocks_the_requirement_naming_the_stage(
    tmp_path: Path,
) -> None:
    cyclic = {
        "rationale": "two halves waiting for each other",
        "units": [
            {"key": "a", "scope": "src/a", "rationale": "one", "depends_on": ["b"]},
            {"key": "b", "scope": "src/b", "rationale": "two", "depends_on": ["a"]},
        ],
    }
    transitions = Transitions()
    host = Host()
    flow = flow_for(
        tmp_path,
        transitions=transitions,
        host=host,
        decomposer=Decomposer(model=ScriptedPlanner(cyclic), clock=lambda: AT),
        assess=lambda _: RequirementAssessment(req_id=REQ, affected_components=9),
    )

    result = flow.start(requirement(), base_commit="base0001")

    assert not result.succeeded
    # The stage is named as a field and on the audit trail — never as another
    # prefix on the sentence a user reads under the requirement's id.
    assert result.failed_stage is FlowStage.DECOMPOSITION
    assert "Decomposition" in transitions.requests[-1].detail
    assert "at decomposition" in result.message
    assert "cycle" in result.reason
    assert not result.reason.startswith("decomposition failed")
    assert result.final_state is DeliveryState.BLOCKED
    assert transitions.record.delivery.blocked_reason == result.reason
    # Nothing beyond the failing stage ran.
    assert host.launches == []
    assert FlowStage.RUN not in result.stage_names
    assert FlowStage.REVIEW not in result.stage_names


@verifies(SWR.SWR_3413)
def test_a_failing_analysis_stops_the_flow_before_anything_is_planned(tmp_path: Path) -> None:
    def explode(_: CanonicalRequirement) -> RequirementAssessment:
        raise RuntimeError("the analyser is unreachable")

    result = flow_for(tmp_path, assess=explode).start(requirement(), base_commit="base0001")

    assert result.failed_stage is FlowStage.ANALYSIS
    assert "the analyser is unreachable" in result.reason
    assert result.final_state is DeliveryState.BLOCKED


@verifies(SWR.SWR_3413)
def test_an_unresolvable_base_commit_stops_the_flow_at_the_snapshot(tmp_path: Path) -> None:
    transitions = Transitions()

    result = flow_for(tmp_path, transitions=transitions).start(requirement(), base_commit="  ")

    assert result.failed_stage is FlowStage.SNAPSHOT
    assert result.final_state is DeliveryState.BLOCKED
    # One sentence, the capture's own — not "snapshot failed: the requirement
    # snapshot could not be captured: …" over it. The stage rides along as a
    # field and as the transition's detail instead.
    assert result.reason == transitions.record.delivery.blocked_reason
    assert "no commit for a run to start from" in result.reason
    assert "make an initial commit" in result.reason
    assert "failed:" not in result.reason
    assert REQ not in result.reason, "the surface labels the row with the id; the reason does not"
    assert "Snapshot" in transitions.requests[-1].detail


@verifies(SWR.SWR_3413)
def test_a_requirement_that_is_not_ready_is_refused_rather_than_run(tmp_path: Path) -> None:
    transitions = Transitions(DeliveryRecord(req_id=REQ))  # Backlog
    host = Host()

    result = flow_for(tmp_path, transitions=transitions, host=host).start(
        requirement(),
        base_commit="base0001",
    )

    assert result.failed_stage is FlowStage.SNAPSHOT
    assert "could not be moved into Running" in result.reason
    assert host.launches == []


@verifies(SWR.SWR_3413)
def test_a_failed_verification_leaves_a_reviewable_result_not_a_block(tmp_path: Path) -> None:
    transitions = Transitions()

    result = flow_for(
        tmp_path,
        transitions=transitions,
        host=Host(verified=False),
    ).start(requirement(), base_commit="base0001")

    assert result.failed_stage is FlowStage.VERIFICATION
    assert result.final_state is DeliveryState.REVIEW
    assert result.reason == "the suite failed", "the checker's own words, unprefixed"
    assert "Verification" in transitions.requests[-1].detail
    assert transitions.targets[-1] is DeliveryState.REVIEW


@verifies(SWR.SWR_3413)
def test_an_unverified_run_is_not_a_failed_one(tmp_path: Path) -> None:
    result = flow_for(tmp_path, host=Host(verified=None)).start(
        requirement(),
        base_commit="base0001",
    )

    assert result.succeeded
    verification = result.outcome_for(FlowStage.VERIFICATION)
    assert verification is not None
    assert verification.skipped
    assert verification.detail == "nothing verified this run"


@verifies(SWR.SWR_3413)
def test_a_worktree_that_cannot_be_created_blocks_with_the_isolation_reason(
    tmp_path: Path,
) -> None:
    isolation = Isolation(tmp_path / "trees", refuse_all=True)
    flow = flow_for(tmp_path, isolation=isolation, retry=RetryPolicy(limit=0))

    result = flow.start(requirement(), base_commit="base0001")

    assert result.failed_stage is FlowStage.WORKTREE
    assert "could not be created" in result.reason
    assert result.final_state is DeliveryState.BLOCKED
    assert isolation.requests[0].branch is not None
    assert isolation.requests[0].branch.startswith("rotaris/req/swr-3413/")


# -- the transition function is the only writer -----------------------------


@verifies(SWR.SWR_3413)
def test_the_flow_changes_delivery_state_only_through_the_transition_function(
    tmp_path: Path,
) -> None:
    transitions = Transitions()

    flow_for(tmp_path, transitions=transitions).start(requirement(), base_commit="base0001")

    assert len(transitions.requests) == 2
    for request in transitions.requests:
        assert isinstance(request, TransitionRequest)
        assert request.req_id == REQ
        assert request.actor.kind is ActorKind.SYSTEM

    # And structurally: the module has no other way in.
    source = inspect.getsource(flow_module)
    for shortcut in ("moved_to(", "DeliveryStatus(", "DeliveryStore", "record.delivery ="):
        assert shortcut not in source, f"flow.py must not reach delivery state via {shortcut!r}"


@verifies(SWR.SWR_3413)
def test_the_flow_never_asks_for_done(tmp_path: Path) -> None:
    transitions = Transitions()

    flow_for(tmp_path, transitions=transitions).start(requirement(), base_commit="base0001")

    assert DeliveryState.DONE not in transitions.targets


@verifies(SWR.SWR_3413)
def test_a_specification_edited_mid_flow_reaches_review_with_both_hashes(
    tmp_path: Path,
) -> None:
    original = requirement()
    edited = original.evolve(description="The specification moved while the agent worked.")

    result = flow_for(tmp_path, current_for=lambda _: edited).start(
        original,
        base_commit="base0001",
    )

    assert result.succeeded
    assert result.final_state is DeliveryState.REVIEW
    assert result.review is not None
    assert result.review.specification_changed
    assert result.review.snapshot_hash == original.current_hash
    assert result.review.current_hash == edited.current_hash


@verifies(SWR.SWR_3403, SWR.SWR_3413)
def test_the_edit_is_recorded_in_the_trail_with_both_hashes(tmp_path: Path) -> None:
    """SWR-3403's fourth condition: the mismatch is written down, not only shown."""
    original = requirement()
    edited = original.evolve(description="The specification moved while the agent worked.")
    transitions = Transitions()

    flow_for(tmp_path, transitions=transitions, current_for=lambda _: edited).start(
        original,
        base_commit="base0001",
    )

    changes = [
        event for event in transitions.events if event.kind is AuditEventKind.SPECIFICATION_CHANGED
    ]
    assert len(changes) == 1, "the drift is recorded exactly once"
    recorded = changes[0]
    assert recorded.req_id == REQ
    assert recorded.satisfied_hash == original.current_hash, "the version the run worked against"
    assert recorded.requirement_hash == edited.current_hash, "the version that stands now"
    assert recorded.reason == "specification changed during execution"
    assert recorded.actor.kind is ActorKind.SYSTEM


@verifies(SWR.SWR_3403)
def test_an_unchanged_requirement_records_no_specification_change(tmp_path: Path) -> None:
    transitions = Transitions()

    flow_for(tmp_path, transitions=transitions).start(requirement(), base_commit="base0001")

    assert [
        event for event in transitions.events if event.kind is AuditEventKind.SPECIFICATION_CHANGED
    ] == []


@verifies(SWR.SWR_3403)
def test_a_flow_cannot_be_built_without_a_way_to_re_read_the_requirement() -> None:
    """The drift-blind configuration of the flow is not constructible at all."""
    parameters = inspect.signature(RequirementFlow.__init__).parameters
    current_for = parameters["current_for"]

    assert current_for.default is inspect.Parameter.empty, (
        "current_for is required: a flow that cannot re-read compares the snapshot"
        " with itself and SWR-3403 can never fire"
    )


@verifies(SWR.SWR_3403)
def test_a_writer_that_cannot_refuse_done_is_refused_at_construction(tmp_path: Path) -> None:
    """A composition that hands the flow a bare writer fails loudly, not silently."""

    class BareWriter(Transitions):
        """Everything the flow needs — except SWR-3403's guard on Review → Done."""

        enforces_specification_guard = False

    with pytest.raises(flow_module.FlowError) as raised:
        flow_for(tmp_path, transitions=BareWriter())

    assert "specification guard" in str(raised.value)
    assert "ExecutionTransitions" in str(raised.value)


@verifies(SWR.SWR_3413)
def test_nothing_in_the_flow_requires_a_person(tmp_path: Path) -> None:
    transitions = Transitions()
    flow = flow_for(tmp_path, transitions=transitions)

    assert flow.actor.kind is ActorKind.SYSTEM
    flow.start(requirement(), base_commit="base0001")
    assert all(request.actor.kind is ActorKind.SYSTEM for request in transitions.requests)


# -- resumability (SWR-2817's recovery, at requirement granularity) ---------


@verifies(SWR.SWR_3413)
def test_a_restart_mid_flow_resumes_from_persisted_state(tmp_path: Path) -> None:
    progress = FlowStateStore(tmp_path / "workspace")
    planner = ScriptedPlanner(two_units())
    transitions = Transitions()

    def fail_the_second(launch: UnitLaunch) -> str:
        return "the provider went down" if "board" in (launch.unit_id or "") else ""

    first_host = Host(fails=fail_the_second)
    first = flow_for(
        tmp_path,
        transitions=transitions,
        host=first_host,
        decomposer=Decomposer(model=planner, clock=lambda: AT),
        assess=lambda _: RequirementAssessment(req_id=REQ, affected_components=9),
        retry=RetryPolicy(limit=0),
        progress=progress,
    ).start(requirement(), base_commit="base0001")

    assert first.failed_stage is FlowStage.RUN
    assert first.final_state is DeliveryState.BLOCKED
    saved = progress.load(REQ)
    assert saved.finished_units, "the unit that succeeded was recorded"

    second_host = Host()
    second = flow_for(
        tmp_path,
        transitions=transitions,
        host=second_host,
        decomposer=Decomposer(model=planner, clock=lambda: AT),
        assess=lambda _: RequirementAssessment(req_id=REQ, affected_components=9),
        progress=progress,
    ).start(requirement(), base_commit="base0001")

    assert second.succeeded
    # Only the unit that had not finished ran again.
    assert [launch.unit_id for launch in second_host.launches] == list(
        saved.finished_units
        and [
            unit
            for unit in (second.units.ids if second.units else ())
            if unit not in saved.finished_units
        ]
    )
    assert FlowStage.RUN in second.resumed
    # A finished flow forgets its progress; the history keeps the runs.
    assert progress.load(REQ).empty


@verifies(SWR.SWR_3413)
def test_progress_survives_a_process_boundary(tmp_path: Path) -> None:
    store = FlowStateStore(tmp_path / "workspace")
    flow_for(tmp_path, progress=store, host=Host(verified=False)).start(
        requirement(),
        base_commit="base0001",
    )

    recovered = FlowStateStore(tmp_path / "workspace").load(REQ)

    assert recovered.req_id == REQ
    assert recovered.failed_stage is FlowStage.VERIFICATION
    assert FlowStage.SNAPSHOT in recovered.completed
    assert recovered.updated_at is not None


@verifies(SWR.SWR_3413)
def test_an_unreadable_progress_file_is_a_fresh_start(tmp_path: Path) -> None:
    store = FlowStateStore(tmp_path / "workspace")
    path = store.path_for(REQ)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not json", encoding="utf-8")

    assert store.load(REQ).empty
