"""Productive use: a user has several requirements on `Ready` and wants Rotaris to work
through them by itself without producing conflicting worktrees or running dependent work out
of order — and wants to be able to see why anything that is not running is not running.
Expected outcome: the queue is ordered by priority, a requirement whose dependency is not
`Done` is never scheduled however urgent it is, two candidates likely to touch the same files
are never started together, and every held candidate carries a stated, machine-readable
reason the board can render."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, NamedTuple

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import (
    RequirementPriority,
    UnitState,
)
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.execution.scheduler import (
    SCHEDULABLE_STATES,
    DeliveryScheduler,
    Hold,
    HoldReason,
    RunningUnit,
    ScheduledRequirement,
    SchedulerLimits,
    UnitCandidate,
    schedule,
)

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

AT = dt.datetime(2026, 8, 14, 14, 0, tzinfo=dt.UTC)


def unit(
    req_id: str,
    unit_id: str,
    *,
    depends_on: tuple[str, ...] = (),
    files: tuple[str, ...] = (),
    state: UnitState = UnitState.PENDING,
) -> UnitCandidate:
    return UnitCandidate(
        req_id=req_id,
        unit_id=unit_id,
        depends_on=depends_on,
        expected_files=files,
        state=state,
    )


def req(
    req_id: str,
    *units: UnitCandidate,
    priority: RequirementPriority = RequirementPriority.NORMAL,
    depends_on: tuple[str, ...] = (),
    state: DeliveryState = DeliveryState.READY,
) -> ScheduledRequirement:
    return ScheduledRequirement(
        req_id=req_id,
        state=state,
        priority=priority,
        depends_on=depends_on,
        units=units or (unit(req_id, f"{req_id.lower()}-impl"),),
    )


class Case(NamedTuple):
    """One scheduling scenario and the decision it must produce."""

    name: str
    requirements: tuple[ScheduledRequirement, ...]
    limits: SchedulerLimits
    running: tuple[RunningUnit, ...]
    states: Mapping[str, DeliveryState]
    selected: tuple[str, ...]
    holds: Mapping[str, HoldReason]


CASES: tuple[Case, ...] = (
    Case(
        name="priority orders the queue",
        requirements=(
            req("SWR-1", priority=RequirementPriority.LOW),
            req("SWR-2", priority=RequirementPriority.CRITICAL),
            req("SWR-3", priority=RequirementPriority.NORMAL),
        ),
        limits=SchedulerLimits(concurrency=3),
        running=(),
        states={},
        selected=("swr-2-impl", "swr-3-impl", "swr-1-impl"),
        holds={},
    ),
    Case(
        name="equal priority falls back to natural id order",
        requirements=(
            req("SWR-100", priority=RequirementPriority.HIGH),
            req("SWR-99", priority=RequirementPriority.HIGH),
        ),
        limits=SchedulerLimits(concurrency=2),
        running=(),
        states={},
        selected=("swr-99-impl", "swr-100-impl"),
        holds={},
    ),
    Case(
        name="priority never overrides a requirement dependency",
        requirements=(
            req("SWR-2", priority=RequirementPriority.CRITICAL, depends_on=("SWR-1",)),
            req("SWR-3", priority=RequirementPriority.LOW),
        ),
        limits=SchedulerLimits(concurrency=4),
        running=(),
        states={"SWR-1": DeliveryState.REVIEW},
        selected=("swr-3-impl",),
        holds={"swr-2-impl": HoldReason.REQUIREMENT_DEPENDENCY},
    ),
    Case(
        name="a dependency that is Done releases the requirement",
        requirements=(req("SWR-2", depends_on=("SWR-1",)),),
        limits=SchedulerLimits(concurrency=4),
        running=(),
        states={"SWR-1": DeliveryState.DONE},
        selected=("swr-2-impl",),
        holds={},
    ),
    Case(
        name="a dependency nobody knows about is not Done",
        requirements=(req("SWR-2", depends_on=("SWR-404",)),),
        limits=SchedulerLimits(concurrency=4),
        running=(),
        states={},
        selected=(),
        holds={"swr-2-impl": HoldReason.REQUIREMENT_DEPENDENCY},
    ),
    Case(
        name="a unit dependency outranks free capacity",
        requirements=(
            req(
                "SWR-1",
                unit("SWR-1", "impl"),
                unit("SWR-1", "tests", depends_on=("impl",)),
            ),
        ),
        limits=SchedulerLimits(concurrency=8),
        running=(),
        states={},
        selected=("impl",),
        holds={"tests": HoldReason.UNIT_DEPENDENCY},
    ),
    Case(
        name="two candidates for the same file are not started together",
        requirements=(
            req("SWR-1", unit("SWR-1", "a", files=("src/core.py",))),
            req("SWR-2", unit("SWR-2", "b", files=("src/core.py", "src/other.py"))),
        ),
        limits=SchedulerLimits(concurrency=4),
        running=(),
        states={},
        selected=("a",),
        holds={"b": HoldReason.FILE_CONFLICT},
    ),
    Case(
        name="a running unit's files are claimed too",
        requirements=(req("SWR-2", unit("SWR-2", "b", files=("src/core.py",))),),
        limits=SchedulerLimits(concurrency=4),
        running=(RunningUnit(req_id="SWR-1", unit_id="a", expected_files=("src/core.py",)),),
        states={},
        selected=(),
        holds={"b": HoldReason.FILE_CONFLICT},
    ),
    Case(
        name="disjoint file sets run together",
        requirements=(
            req("SWR-1", unit("SWR-1", "a", files=("src/one.py",))),
            req("SWR-2", unit("SWR-2", "b", files=("src/two.py",))),
        ),
        limits=SchedulerLimits(concurrency=4),
        running=(),
        states={},
        selected=("a", "b"),
        holds={},
    ),
    Case(
        name="the limit holds the rest of the queue",
        requirements=(
            req("SWR-1", priority=RequirementPriority.HIGH),
            req("SWR-2"),
            req("SWR-3"),
        ),
        limits=SchedulerLimits(concurrency=1),
        running=(),
        states={},
        selected=("swr-1-impl",),
        holds={
            "swr-2-impl": HoldReason.CONCURRENCY_LIMIT,
            "swr-3-impl": HoldReason.CONCURRENCY_LIMIT,
        },
    ),
    Case(
        name="a stopped queue holds everything and starts nothing",
        requirements=(req("SWR-1"), req("SWR-2")),
        limits=SchedulerLimits(concurrency=4, stopped=True),
        running=(),
        states={},
        selected=(),
        holds={
            "swr-1-impl": HoldReason.QUEUE_STOPPED,
            "swr-2-impl": HoldReason.QUEUE_STOPPED,
        },
    ),
    Case(
        name="a requirement that is not Ready is held, not silently dropped",
        requirements=(
            req("SWR-1", state=DeliveryState.BLOCKED),
            req("SWR-2", state=DeliveryState.RUNNING),
        ),
        limits=SchedulerLimits(concurrency=4),
        running=(),
        states={},
        selected=("swr-2-impl",),
        holds={"swr-1-impl": HoldReason.REQUIREMENT_NOT_READY},
    ),
    Case(
        name="a dependency hold beats a stop, a conflict and a limit at once",
        requirements=(
            req(
                "SWR-2",
                unit("SWR-2", "b", files=("src/core.py",)),
                depends_on=("SWR-1",),
                priority=RequirementPriority.CRITICAL,
            ),
        ),
        limits=SchedulerLimits(concurrency=1, stopped=True),
        running=(RunningUnit(req_id="SWR-9", unit_id="z", expected_files=("src/core.py",)),),
        states={"SWR-1": DeliveryState.READY},
        selected=(),
        holds={"b": HoldReason.REQUIREMENT_DEPENDENCY},
    ),
)


def ids() -> Sequence[str]:
    return [case.name for case in CASES]


@pytest.mark.unit
@pytest.mark.parametrize("case", CASES, ids=ids())
@verifies(SWR.SWR_3412)
def test_the_scheduler_decides_what_runs_and_states_why_the_rest_does_not(case: Case) -> None:
    """One table, every rule SWR-3412 states, with the reason checked every time."""
    decision = schedule(
        case.requirements,
        limits=case.limits,
        running=case.running,
        states=case.states,
        at=AT,
    )

    assert decision.selected_units == case.selected, case.name
    assert decision.reasons == dict(case.holds), case.name
    # SWR-3412's fourth criterion, asserted for every row rather than once.
    assert all(hold.detail.strip() for hold in decision.held), case.name
    assert all(hold.message.startswith(hold.reason.value) for hold in decision.held), case.name


@pytest.mark.unit
@pytest.mark.parametrize("case", CASES, ids=ids())
@verifies(SWR.SWR_3412, SWR.SWR_3216)
def test_every_candidate_reaches_the_board_with_its_place_or_its_reason(case: Case) -> None:
    """The queue is observable: nothing is dropped, and nothing is held silently."""
    decision = schedule(
        case.requirements,
        limits=case.limits,
        running=case.running,
        states=case.states,
        at=AT,
    )

    queue = decision.to_queue_view()
    entries = {entry.unit_id: entry for entry in queue.entries}

    assert set(entries) == set(case.selected) | set(case.holds), case.name
    assert queue.concurrency_limit == case.limits.concurrency
    assert queue.stopped is case.limits.stopped
    assert queue.updated_at == AT
    assert tuple(entry.unit_id for entry in queue.ready) == case.selected
    for unit_id in case.holds:
        entry = entries[unit_id]
        assert entry.held is True
        assert entry.hold_reason.strip()
        assert entry.message.startswith(f"{entry.req_id}/{unit_id}: held — ")
    for position, unit_id in enumerate(case.selected, start=1):
        assert entries[unit_id].position == position


# -- the rules the table cannot show on its own ----------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3412)
def test_a_requirement_whose_dependency_is_not_done_is_never_scheduled() -> None:
    """Every non-Done state, not just the convenient one."""
    for state in DeliveryState:
        decision = schedule(
            [req("SWR-2", depends_on=("SWR-1",), priority=RequirementPriority.CRITICAL)],
            limits=SchedulerLimits(concurrency=8),
            states={"SWR-1": state},
        )
        if state is DeliveryState.DONE:
            assert decision.selected_units == ("swr-2-impl",)
            continue
        hold = decision.hold_for("swr-2-impl")
        assert hold is not None, state
        assert hold.reason is HoldReason.REQUIREMENT_DEPENDENCY
        assert hold.waiting_for == ("SWR-1",)
        assert "SWR-1" in hold.detail


@pytest.mark.unit
@verifies(SWR.SWR_3412)
def test_a_hold_names_the_files_and_the_unit_it_collides_with() -> None:
    """A bare `conflict` is not actionable; `would touch src/util.py, claimed by a` is."""
    decision = schedule(
        [
            req("SWR-1", unit("SWR-1", "a", files=("src/core.py", "src/util.py"))),
            req("SWR-2", unit("SWR-2", "b", files=("src/util.py",))),
        ],
        limits=SchedulerLimits(concurrency=4),
    )

    hold = decision.hold_for("b")
    assert hold is not None
    assert hold.reason is HoldReason.FILE_CONFLICT
    assert "src/util.py" in hold.detail
    assert "src/core.py" not in hold.detail
    assert hold.waiting_for == ("a",)


@pytest.mark.unit
@verifies(SWR.SWR_3412)
def test_a_held_candidate_without_a_reason_cannot_be_constructed() -> None:
    """The invariant is structural, so a future hold cannot forget to state itself."""
    with pytest.raises(ValueError, match="states the reason"):
        Hold(req_id="SWR-1", unit_id="a", reason=HoldReason.CONCURRENCY_LIMIT, detail="   ")


@pytest.mark.unit
@verifies(SWR.SWR_3412)
def test_limits_that_would_never_start_anything_are_refused() -> None:
    """A zero limit is a configuration mistake, not a very quiet scheduler."""
    with pytest.raises(ValueError, match="never start anything"):
        SchedulerLimits(concurrency=0)
    with pytest.raises(ValueError, match="never start anything"):
        SchedulerLimits(per_requirement=0)


@pytest.mark.unit
@verifies(SWR.SWR_3412)
def test_only_ready_and_running_requirements_execute() -> None:
    """The closed set is stated once and used by the scheduler, not re-derived."""
    assert {DeliveryState.READY, DeliveryState.RUNNING} == SCHEDULABLE_STATES
    for state in DeliveryState:
        decision = schedule([req("SWR-1", state=state)], limits=SchedulerLimits(concurrency=2))
        started = bool(decision.selected_units)
        assert started is (state in SCHEDULABLE_STATES), state
        if not started:
            hold = decision.hold_for("swr-1-impl")
            assert hold is not None
            assert hold.reason is HoldReason.REQUIREMENT_NOT_READY
            assert state.label in hold.detail


@pytest.mark.unit
@verifies(SWR.SWR_3412)
def test_the_scheduler_object_carries_the_configured_limits_and_the_clock() -> None:
    """Manual or automatic is configuration, and it travels to the board unchanged."""
    scheduler = DeliveryScheduler(
        limits=SchedulerLimits(concurrency=2, automatic=True),
        clock=lambda: AT,
    )

    decision = scheduler.decide([req("SWR-1"), req("SWR-2"), req("SWR-3")])

    assert scheduler.automatic is True
    assert decision.at == AT
    assert decision.selected_units == ("swr-1-impl", "swr-2-impl")
    assert decision.reasons == {"swr-3-impl": HoldReason.CONCURRENCY_LIMIT}
    assert decision.to_queue_view().automatic is True
    assert decision.capacity_left == 0


@pytest.mark.unit
@verifies(SWR.SWR_3412)
def test_the_queue_survives_a_pass_that_can_start_nothing() -> None:
    """Everything held, nothing lost — the next pass has the same candidates."""
    requirements = [req("SWR-1"), req("SWR-2")]
    stopped = schedule(requirements, limits=SchedulerLimits(concurrency=2, stopped=True))

    assert stopped.selected == ()
    assert len(stopped.held) == 2
    assert stopped.to_queue_view().empty is False

    resumed = schedule(requirements, limits=SchedulerLimits(concurrency=2))
    assert resumed.selected_units == ("swr-1-impl", "swr-2-impl")
