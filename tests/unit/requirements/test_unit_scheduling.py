"""Productive use: a user releases a requirement whose units do not all depend on each
other, and Rotaris works on the independent ones at the same time instead of one after
another.
Expected outcome: units with no unmet dependency are started together up to the configured
limit, a unit whose dependency has not finished never starts, reaching the limit leaves a
candidate queued rather than rejected, and a unit that blows up takes none of its
independent siblings with it."""

from __future__ import annotations

import threading

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import UnitState
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.execution.scheduler import (
    HoldReason,
    RunningUnit,
    ScheduledRequirement,
    SchedulerLimits,
    Selection,
    UnitCandidate,
    run_selected,
    schedule,
)
from rotaris_core.requirements.execution.units import UnitSpec, plan_units

REQ = "SWR-3406"


def requirement(
    *units: UnitCandidate,
    req_id: str = REQ,
    state: DeliveryState = DeliveryState.READY,
) -> ScheduledRequirement:
    return ScheduledRequirement(req_id=req_id, state=state, units=units)


def unit(
    unit_id: str,
    *,
    depends_on: tuple[str, ...] = (),
    state: UnitState = UnitState.PENDING,
    files: tuple[str, ...] = (),
    req_id: str = REQ,
) -> UnitCandidate:
    return UnitCandidate(
        req_id=req_id,
        unit_id=unit_id,
        depends_on=depends_on,
        state=state,
        expected_files=files,
    )


# -- readiness over the dependency graph -----------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_two_independent_units_of_one_requirement_are_started_together() -> None:
    """The whole point of splitting a requirement: the independent halves need not wait."""
    decision = schedule(
        [requirement(unit("impl"), unit("docs"))],
        limits=SchedulerLimits(concurrency=2),
    )

    assert decision.selected_units == ("impl", "docs")
    assert [choice.position for choice in decision.selected] == [1, 2]
    assert decision.held == ()


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_a_dependent_unit_does_not_start_before_its_dependency_completes() -> None:
    """And it says which unit it is waiting for, by name."""
    pending = schedule(
        [requirement(unit("impl"), unit("tests", depends_on=("impl",)))],
        limits=SchedulerLimits(concurrency=4),
    )

    assert pending.selected_units == ("impl",)
    hold = pending.hold_for("tests")
    assert hold is not None
    assert hold.reason is HoldReason.UNIT_DEPENDENCY
    assert hold.waiting_for == ("impl",)
    assert "impl" in hold.detail

    finished = schedule(
        [
            requirement(
                unit("impl", state=UnitState.FINISHED),
                unit("tests", depends_on=("impl",)),
            ),
        ],
        limits=SchedulerLimits(concurrency=4),
    )

    assert finished.selected_units == ("tests",)
    assert finished.held == ()


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_a_dependency_that_only_started_is_not_a_dependency_that_finished() -> None:
    """`Running` is not `Finished`; the dependent unit keeps waiting."""
    decision = schedule(
        [
            requirement(
                unit("impl", state=UnitState.RUNNING),
                unit("tests", depends_on=("impl",)),
            ),
        ],
        limits=SchedulerLimits(concurrency=4),
        running=[RunningUnit(req_id=REQ, unit_id="impl", run_id="run-1")],
    )

    assert decision.selected == ()
    assert decision.reasons == {"tests": HoldReason.UNIT_DEPENDENCY}


# -- the limit queues, it does not reject ----------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_reaching_the_concurrency_limit_queues_rather_than_rejects() -> None:
    """The held candidate is still in the queue, and the next pass starts it."""
    units = (unit("a"), unit("b"), unit("c"))

    first = schedule([requirement(*units)], limits=SchedulerLimits(concurrency=2))

    assert first.selected_units == ("a", "b")
    assert first.reasons == {"c": HoldReason.CONCURRENCY_LIMIT}
    queue = first.to_queue_view()
    assert {entry.unit_id for entry in queue.entries} == {"a", "b", "c"}
    assert queue.held[0].unit_id == "c"
    assert "concurrency-limit" in queue.held[0].hold_reason
    assert first.capacity_left == 0

    # The two that started are now in flight; the queued one is picked up next.
    later = schedule(
        [
            requirement(
                unit("a", state=UnitState.FINISHED),
                unit("b", state=UnitState.FINISHED),
                unit("c"),
            ),
        ],
        limits=SchedulerLimits(concurrency=2),
    )
    assert later.selected_units == ("c",)


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_units_already_in_flight_consume_the_limit() -> None:
    """Capacity is global: a running unit is a slot nobody else may take."""
    decision = schedule(
        [requirement(unit("a"), unit("b"))],
        limits=SchedulerLimits(concurrency=2),
        running=[RunningUnit(req_id="SWR-9", unit_id="elsewhere", run_id="run-9")],
    )

    assert decision.selected_units == ("a",)
    assert decision.reasons == {"b": HoldReason.CONCURRENCY_LIMIT}


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_a_requirement_may_bound_its_own_parallelism() -> None:
    """Two requirements share the global limit; one of them may still cap itself."""
    decision = schedule(
        [
            ScheduledRequirement(
                req_id="SWR-1", units=(unit("a", req_id="SWR-1"), unit("b", req_id="SWR-1"))
            ),
            ScheduledRequirement(req_id="SWR-2", units=(unit("c", req_id="SWR-2"),)),
        ],
        limits=SchedulerLimits(concurrency=4, per_requirement=1),
    )

    assert decision.selected_units == ("a", "c")
    hold = decision.hold_for("b")
    assert hold is not None
    assert hold.reason is HoldReason.REQUIREMENT_LIMIT
    assert "its limit is 1" in hold.detail


# -- a failing unit does not cancel its siblings ---------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_a_failed_unit_holds_its_dependents_and_nothing_else() -> None:
    """Failure is a unit's business; an independent sibling keeps its turn."""
    decision = schedule(
        [
            requirement(
                unit("impl", state=UnitState.FAILED),
                unit("tests", depends_on=("impl",)),
                unit("docs"),
            ),
        ],
        limits=SchedulerLimits(concurrency=4),
    )

    assert decision.selected_units == ("docs",)
    hold = decision.hold_for("tests")
    assert hold is not None
    assert hold.reason is HoldReason.UNIT_DEPENDENCY
    assert hold.waiting_for == ("impl",)
    # The failed unit itself is not a candidate — retrying it is SWR-3415's call.
    assert decision.hold_for("impl") is None


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_an_abandoned_or_finished_unit_is_not_scheduled_again() -> None:
    """A unit that is done with — either way — is not work waiting to be picked up."""
    decision = schedule(
        [
            requirement(
                unit("done", state=UnitState.FINISHED),
                unit("given-up", state=UnitState.ABANDONED),
                unit("left"),
            ),
        ],
        limits=SchedulerLimits(concurrency=4),
    )

    assert decision.selected_units == ("left",)
    assert decision.held == ()


# -- the units the scheduler reads come from the decomposition -------------


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_candidates_are_built_from_the_requirements_own_units() -> None:
    """No second model of the graph: the edges come from RequirementUnits itself."""
    units = plan_units(
        REQ,
        (
            UnitSpec(key="impl"),
            UnitSpec(key="tests", depends_on=("impl",)),
            UnitSpec(key="docs"),
        ),
    )
    impl_id, tests_id, docs_id = units.ids

    candidates = ScheduledRequirement.from_units(
        units,
        expected_files={impl_id: ["src/a.py"]},
    )

    assert candidates.req_id == REQ
    assert [candidate.unit_id for candidate in candidates.units] == [impl_id, tests_id, docs_id]
    assert candidates.units[1].depends_on == (impl_id,)
    assert candidates.units[0].expected_files == ("src/a.py",)

    decision = schedule([candidates], limits=SchedulerLimits(concurrency=3))
    assert decision.selected_units == (impl_id, docs_id)
    assert decision.reasons == {tests_id: HoldReason.UNIT_DEPENDENCY}

    # And once the implementation unit finishes, the graph moves with it.
    moved = ScheduledRequirement.from_units(units.with_state(impl_id, UnitState.FINISHED))
    assert schedule([moved], limits=SchedulerLimits(concurrency=3)).selected_units == (
        tests_id,
        docs_id,
    )


# -- running the wave ------------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_selected_units_really_run_at_the_same_time() -> None:
    """A barrier both units must reach: serial execution would never release it."""
    decision = schedule(
        [requirement(unit("impl"), unit("docs"))],
        limits=SchedulerLimits(concurrency=2),
    )
    barrier = threading.Barrier(2, timeout=20)
    overlapped: list[str] = []

    def start(choice: Selection) -> str:
        barrier.wait()
        overlapped.append(choice.unit_id)
        return f"ran {choice.unit_id}"

    results = run_selected(decision, start)

    assert sorted(overlapped) == ["docs", "impl"]
    assert [result.unit_id for result in results] == ["impl", "docs"]
    assert [result.value for result in results] == ["ran impl", "ran docs"]
    assert not any(result.failed for result in results)


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_a_unit_that_blows_up_does_not_take_its_siblings_results_with_it() -> None:
    """One failure, two intact results — SWR-3406's fourth acceptance criterion."""
    decision = schedule(
        [requirement(unit("a"), unit("b"), unit("c"))],
        limits=SchedulerLimits(concurrency=3),
    )

    def start(choice: Selection) -> str:
        if choice.unit_id == "b":
            raise RuntimeError("the agent went away")
        return f"ran {choice.unit_id}"

    results = run_selected(decision, start)

    by_unit = {result.unit_id: result for result in results}
    assert by_unit["a"].value == "ran a"
    assert by_unit["c"].value == "ran c"
    assert by_unit["b"].failed
    assert by_unit["b"].error == "RuntimeError: the agent went away"
    assert by_unit["b"].value is None


@pytest.mark.unit
@verifies(SWR.SWR_3406)
def test_running_an_empty_selection_starts_nothing() -> None:
    """A queue with nothing eligible must not spin up a pool to prove it."""
    decision = schedule(
        [requirement(unit("impl", depends_on=("nobody",)))],
        limits=SchedulerLimits(concurrency=2),
    )
    started: list[str] = []

    assert decision.selected == ()
    assert run_selected(decision, lambda choice: started.append(choice.unit_id)) == ()
    assert started == []
