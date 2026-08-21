"""Productive use: an agent run dies — the provider goes down, a conflict cannot be
resolved, the check suite cannot start. The user comes back to a requirement that says what
failed, still has the work on disk, and has not been retried into the ground.
Expected outcome: a failed unit moves to a stated failure state with its reason and keeps
its worktree and branch; retries are counted and bounded, and the bound is configurable and
stated; exhausting them blocks the requirement naming the last failure; and abandoning a
unit is an explicit act that keeps its history."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import RunOutcome, UnitState
from rotaris_core.requirements.delivery.state import (
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
from rotaris_core.requirements.execution.flow import (
    FlowError,
    FlowStage,
    RequirementFlow,
    RetryPolicy,
    UnitFailure,
    abandon_unit,
    blocked_request,
    fail_unit,
    retry_unit,
)
from rotaris_core.requirements.execution.history import ExecutionHistory
from rotaris_core.requirements.execution.run_seam import (
    IsolationRequest,
    RequirementRunSeam,
    RunReport,
    RunWorkspace,
    UnitLaunch,
)
from rotaris_core.requirements.execution.units import UnitSpec, plan_units
from rotaris_core.requirements.model import CanonicalRequirement

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris_core.requirements.delivery.audit import AuditEvent
    from rotaris_core.requirements.execution.units import RequirementUnits

pytestmark = pytest.mark.unit

REQ = "SWR-3415"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")
RUNNER = DeliveryActor.system("requirement-flow")


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Failed units are recoverable, never silent",
        description="A failed unit keeps its worktree and its reason.",
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
    )


def units_of(req_id: str = REQ) -> RequirementUnits:
    return plan_units(req_id, [UnitSpec(key="impl", title="The change")])


def failure(**changes: object) -> UnitFailure:
    data: dict[str, object] = {
        "req_id": REQ,
        "unit_id": "unit-1",
        "run_id": "run-1",
        "attempt": 1,
        "reason": "the provider returned 503",
        "worktree_path": "/tmp/wt/run-1",
        "branch": "rotaris/req/swr-3415/unit-1",
        "retries_used": 0,
        "retry_limit": 1,
    }
    data.update(changes)
    return UnitFailure.model_validate(data)


class Transitions:
    """The real state machine over one in-memory record.

    Stands in for
    :class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions`,
    guard marker and trail included — the flow accepts no other writer.
    """

    enforces_specification_guard = True

    def __init__(self, state: DeliveryState = DeliveryState.READY) -> None:
        self.events: list[AuditEvent] = []
        self.record = DeliveryRecord(
            req_id=REQ,
            delivery=DeliveryStatus(
                state=state,
                changed_at=AT,
                changed_by=USER,
                cause=TransitionCause.USER_ACTION,
            ),
        )
        self.requests: list[TransitionRequest] = []

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        self.requests.append(request)
        outcome = apply_transition(self.record, request)
        if outcome.accepted:
            self.record = outcome.record
        return outcome

    def record_event(self, event: AuditEvent) -> AuditEvent:
        self.events.append(event)
        return event


class Isolation:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.branches: list[str] = []

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        branch = request.branch or "rotaris/req/unknown"
        self.branches.append(branch)
        path = self.root / (request.session_id or "run")
        path.mkdir(parents=True, exist_ok=True)
        (path / "work.txt").write_text(branch, encoding="utf-8")
        return RunWorkspace(path=str(path), branch=branch)


class AlwaysFails:
    def __init__(self, reason: str = "the provider went down") -> None:
        self.reason = reason
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        return RunReport(outcome=RunOutcome.FAILED, failure_reason=self.reason)


def ticking() -> Callable[[], dt.datetime]:
    counter = iter(range(10_000))
    return lambda: AT + dt.timedelta(seconds=next(counter))


# -- what a failure records -------------------------------------------------


@verifies(SWR.SWR_3415)
def test_a_failed_unit_states_what_failed_and_where_the_work_is() -> None:
    recorded = failure()

    assert recorded.reason == "the provider returned 503"
    assert recorded.worktree_path == "/tmp/wt/run-1"
    assert recorded.branch == "rotaris/req/swr-3415/unit-1"
    assert recorded.worktree_kept
    assert "work kept at /tmp/wt/run-1" in recorded.message
    assert "0/1 retries used" in recorded.message


@verifies(SWR.SWR_3415)
def test_a_failure_without_a_reason_cannot_be_recorded() -> None:
    with pytest.raises(FlowError, match="states what failed"):
        failure(reason="   ")


@verifies(SWR.SWR_3415)
def test_failing_a_unit_moves_the_unit_and_not_the_requirement() -> None:
    units = units_of()
    unit_id = units.ids[0]

    failed = fail_unit(units, failure(unit_id=unit_id))

    assert failed.require(unit_id).state is UnitState.FAILED
    assert failed.require(unit_id).failure_reason == "the provider returned 503"
    assert units.require(unit_id).state is UnitState.PENDING, "the input value is untouched"


# -- retries are counted and bounded ----------------------------------------


@verifies(SWR.SWR_3415)
def test_the_retry_bound_is_configurable_and_stated() -> None:
    assert RetryPolicy().limit == 1
    assert RetryPolicy(limit=2).attempts == 3
    assert RetryPolicy(limit=0).attempts == 1
    assert RetryPolicy(limit=2).message == "up to 3 attempt(s) per unit, 2 retry/retries"
    with pytest.raises(FlowError, match="never negative"):
        RetryPolicy(limit=-1)


@verifies(SWR.SWR_3415)
def test_retries_are_counted_and_refused_past_the_bound() -> None:
    units = units_of()
    unit_id = units.ids[0]

    once = retry_unit(fail_unit(units, failure(unit_id=unit_id)), unit_id, limit=2)
    twice = retry_unit(fail_unit(once, failure(unit_id=unit_id)), unit_id, limit=2)

    assert once.require(unit_id).retries == 1
    assert once.require(unit_id).state is UnitState.PENDING
    assert twice.require(unit_id).retries == 2
    assert twice.require(unit_id).retries_exhausted
    with pytest.raises(FlowError, match="already used of 2"):
        retry_unit(twice, unit_id, limit=2)


@verifies(SWR.SWR_3415)
def test_a_retried_unit_keeps_the_failure_that_is_being_retried() -> None:
    units = units_of()
    unit_id = units.ids[0]

    retried = retry_unit(fail_unit(units, failure(unit_id=unit_id)), unit_id, limit=1)

    assert retried.require(unit_id).failure_reason == "the provider returned 503"


@verifies(SWR.SWR_3415)
def test_a_failure_knows_whether_another_attempt_is_permitted() -> None:
    assert failure(retries_used=0, retry_limit=1).retryable
    assert not failure(retries_used=1, retry_limit=1).retryable
    assert failure(retries_used=0, retry_limit=0).exhausted


# -- the whole retry path, driven through the flow --------------------------


def drive_failing_flow(
    tmp_path: Path,
    *,
    limit: int,
    transitions: Transitions,
    history: ExecutionHistory | None = None,
) -> tuple[AlwaysFails, Isolation, object]:
    host = AlwaysFails()
    isolation = Isolation(tmp_path / "trees")
    flow = RequirementFlow(
        transitions=transitions,
        seam=RequirementRunSeam(isolation=isolation, host=host, clock=ticking()),
        current_for=lambda _: requirement(),
        history=history,
        retry=RetryPolicy(limit=limit),
        clock=ticking(),
    )
    return host, isolation, flow.start(requirement(), base_commit="base0001")


@verifies(SWR.SWR_3415)
def test_a_unit_is_retried_up_to_the_bound_and_then_blocks(tmp_path: Path) -> None:
    transitions = Transitions()

    host, isolation, result = drive_failing_flow(tmp_path, limit=2, transitions=transitions)

    assert len(host.launches) == 3, "the first attempt plus two retries"
    assert [launch.attempt for launch in host.launches] == [1, 2, 3]
    assert result.failed_stage is FlowStage.RUN  # type: ignore[attr-defined]
    assert result.final_state is DeliveryState.BLOCKED  # type: ignore[attr-defined]
    assert transitions.record.state is DeliveryState.BLOCKED
    reason = transitions.record.delivery.blocked_reason
    assert "the provider went down" in reason
    assert "retries are exhausted" in reason
    assert "up to 3 attempt(s) per unit" in reason


@verifies(SWR.SWR_3415)
def test_every_attempt_gets_its_own_branch_and_the_work_survives(tmp_path: Path) -> None:
    host, isolation, _ = drive_failing_flow(tmp_path, limit=2, transitions=Transitions())

    assert len(set(isolation.branches)) == 3, "a retry never reuses the branch being inspected"
    assert isolation.branches[1].endswith("-a2")
    assert isolation.branches[2].endswith("-a3")
    trees = sorted(path for path in (tmp_path / "trees").iterdir())
    assert len(trees) == 3
    for tree in trees:
        assert (tree / "work.txt").exists(), "a failed unit's work is kept for inspection"
    del host


@verifies(SWR.SWR_3415)
def test_a_failed_unit_never_leaves_the_requirement_running(tmp_path: Path) -> None:
    transitions = Transitions()

    _, _, result = drive_failing_flow(tmp_path, limit=0, transitions=transitions)

    assert transitions.record.state is not DeliveryState.RUNNING
    assert transitions.record.state is DeliveryState.BLOCKED
    assert result.units is not None  # type: ignore[attr-defined]
    unit_id = result.units.ids[0]  # type: ignore[attr-defined]
    assert result.units.require(unit_id).state is UnitState.FAILED  # type: ignore[attr-defined]


@verifies(SWR.SWR_3415)
def test_every_failed_attempt_is_retained_in_the_history(tmp_path: Path) -> None:
    history = ExecutionHistory(tmp_path / "workspace")

    _, _, result = drive_failing_flow(
        tmp_path,
        limit=2,
        transitions=Transitions(),
        history=history,
    )

    stored = history.load(REQ)
    assert len(stored.runs) == 3
    assert len(stored.failed) == 3
    assert all("the provider went down" in run.failure_reason for run in stored.failed)
    assert stored.implementation_commits == ()
    assert len(result.failures) == 3  # type: ignore[attr-defined]
    assert [one.attempt for one in result.failures] == [1, 2, 3]  # type: ignore[attr-defined]


@verifies(SWR.SWR_3415)
def test_with_no_retries_the_first_failure_blocks(tmp_path: Path) -> None:
    host, _, result = drive_failing_flow(tmp_path, limit=0, transitions=Transitions())

    assert len(host.launches) == 1
    assert result.final_state is DeliveryState.BLOCKED  # type: ignore[attr-defined]
    assert "0 retry/retries" in result.reason  # type: ignore[attr-defined]


# -- abandoning is explicit, and keeps the history --------------------------


@verifies(SWR.SWR_3415)
def test_abandoning_a_unit_keeps_its_runs(tmp_path: Path) -> None:
    del tmp_path
    units = units_of().with_run(units_of().ids[0], "run-1")
    unit_id = units.ids[0]

    abandoned = abandon_unit(units, unit_id, reason="the approach was wrong")

    assert abandoned.ids == ()
    assert abandoned.discarded[0].state is UnitState.ABANDONED
    assert abandoned.discarded[0].failure_reason == "the approach was wrong"
    assert abandoned.run_ids == ("run-1",), "the history survives the unit (SWR-3414)"


@verifies(SWR.SWR_3415)
def test_abandoning_without_a_reason_is_refused() -> None:
    units = units_of()

    with pytest.raises(FlowError, match="states why"):
        abandon_unit(units, units.ids[0], reason="  ")


# -- the blocking request the flow builds -----------------------------------


@verifies(SWR.SWR_3415)
def test_a_blocking_request_carries_its_reason_and_is_accepted_by_the_matrix() -> None:
    record = DeliveryRecord(
        req_id=REQ,
        delivery=DeliveryStatus(
            state=DeliveryState.RUNNING,
            changed_at=AT,
            changed_by=RUNNER,
            cause=TransitionCause.RUN_STARTED,
        ),
    )
    request = blocked_request(
        REQ,
        reason="unit swr-3415-impl failed after 3 attempts: the provider went down",
        actor=RUNNER,
        at=AT,
        run_id="run-3",
    )

    outcome = apply_transition(record, request)

    assert outcome.accepted
    assert outcome.record.state is DeliveryState.BLOCKED
    assert "the provider went down" in outcome.record.delivery.blocked_reason
    assert outcome.record.delivery.blocked_from is DeliveryState.RUNNING
    assert request.cause is TransitionCause.RUN_FAILED
