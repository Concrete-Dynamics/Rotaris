"""Productive use: a team delivers a requirement, reviews it, decides it is not finished and
releases it again. Rotaris plans the same slices of work a second time without pretending
the first delivery never happened.
Expected outcome: the second delivery's units carry the same ids and a new cycle number, the
first delivery's runs are still reported after the second delivery saves, the run history
says which delivery each run belongs to, a unit file written before any of this still loads
as the first delivery, and a unit card that belongs to a later delivery says so."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import ExecutionUnitView, UnitState
from rotaris_core.requirements.execution.flow import FlowProgress, FlowStage
from rotaris_core.requirements.execution.history import RequirementHistory, RunRecord
from rotaris_core.requirements.execution.run_seam import unit_branch
from rotaris_core.requirements.execution.store import UNIT_STORE_SCHEMA_VERSION, UnitStore
from rotaris_core.requirements.execution.units import (
    RequirementUnits,
    UnitError,
    UnitSpec,
    mint_unit_id,
    plan_units,
)
from rotaris_core.requirements.execution.worktrees import BranchStrategy

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-3417"

TWO = (
    UnitSpec(key="impl", title="Implementation", scope="the change"),
    UnitSpec(key="tests", title="Tests", scope="the proof", depends_on=("impl",)),
)


def delivered(specs: tuple[UnitSpec, ...] = TWO) -> RequirementUnits:
    """One requirement whose first delivery ran every unit to a finish."""
    units = plan_units(REQ, specs)
    for index, unit_id in enumerate(units.ids, start=1):
        units = units.with_run(unit_id, f"run-c1-{index}")
        units = units.with_state(unit_id, UnitState.FINISHED)
    return units


@verifies(SWR.SWR_3417)
def test_a_second_delivery_reuses_the_ids_and_keeps_the_first_deliverys_runs() -> None:
    """The whole point: delivering again adds a cycle, it does not overwrite one."""
    first = delivered()
    assert first.cycle == 0
    assert first.complete

    second = first.opened(TWO)

    # Same slices of work, same ids — the desktop mints them independently and
    # must keep agreeing (SWR-3417).
    assert second.ids == first.ids
    assert second.ids[0] == mint_unit_id(REQ, "impl")
    assert second.cycle == 1
    assert all(unit.cycle == 1 for unit in second.units)

    # Nothing from the first delivery was replaced.
    assert second.cycles == (0, 1)
    assert set(first.run_ids) <= set(second.run_ids)
    assert second.run_ids_of(0) == first.run_ids
    assert second.run_ids_of(1) == ()
    assert [unit.state for unit in second.units] == [UnitState.PENDING, UnitState.PENDING]
    # The first delivery's units keep the state they actually reached.
    assert {unit.state for unit in second.for_cycle(0)} == {UnitState.FINISHED}


@verifies(SWR.SWR_3417)
def test_two_units_may_share_an_id_only_across_cycles() -> None:
    """``(cycle, unit_id)`` is the key; within one cycle an id is still handed out once."""
    second = delivered().opened(TWO)
    repeated = second.units[0]

    # The same id in a *different* cycle is exactly what this requirement allows.
    assert repeated.unit_id in {unit.unit_id for unit in second.discarded}

    # The same id in the *same* cycle is still incoherent.
    with pytest.raises(UnitError, match="used twice in delivery cycle 2"):
        RequirementUnits(
            req_id=REQ,
            cycle=1,
            units=(repeated, repeated.evolve(title="a second one")),
        )

    # And a unit left live from an earlier cycle is refused rather than tolerated.
    with pytest.raises(UnitError, match="an earlier cycle's units are retired"):
        RequirementUnits(req_id=REQ, cycle=1, units=(repeated.evolve(cycle=0),))


@verifies(SWR.SWR_3417)
def test_discarding_inside_a_cycle_still_reserves_the_id_it_gave_up() -> None:
    """Scoping the reservation to the cycle does not weaken it inside the cycle."""
    units = plan_units(REQ, TWO)
    given_up = units.ids[0]

    replanned = units.discard(given_up, reason="the approach was wrong").added(
        (UnitSpec(key="impl", title="Implementation, again"),),
    )

    fresh = replanned.ids[-1]
    assert fresh != given_up, "a retired id is never handed out again inside its cycle"
    assert fresh.startswith(given_up)
    assert replanned.cycle == 0


@verifies(SWR.SWR_3417)
def test_continuing_a_cycle_carries_the_runs_already_recorded_against_it() -> None:
    """A restart re-plans the same cycle and keeps what that cycle already did."""
    partway = plan_units(REQ, TWO).with_run(mint_unit_id(REQ, "impl"), "run-c1-1")

    resumed = partway.continued(TWO)

    assert resumed.cycle == 0
    assert resumed.ids == partway.ids
    assert resumed.run_ids == ("run-c1-1",)
    # State is the flow's to re-establish, not this value's.
    assert {unit.state for unit in resumed.units} == {UnitState.PENDING}


@verifies(SWR.SWR_3417)
def test_the_unit_store_round_trips_two_cycles_and_still_reads_the_old_format(
    tmp_path: Path,
) -> None:
    """A file written before the cycle existed loads as the first delivery."""
    store = UnitStore(tmp_path)
    second = delivered().opened(TWO)
    second = second.with_run(second.ids[0], "run-c2-1")

    path = store.save(second)
    reloaded = store.load(REQ)

    assert reloaded.cycle == 1
    assert reloaded.ids == second.ids
    assert reloaded.run_ids == second.run_ids
    assert reloaded.cycles == (0, 1)
    assert json.loads(path.read_text(encoding="utf-8"))["schema_version"] == (
        UNIT_STORE_SCHEMA_VERSION
    )

    # A version-1 file: no cycle anywhere, and that is exactly cycle 0.
    legacy = {
        "schema_version": 1,
        "req_id": REQ,
        "units": [
            {
                "unit_id": "swr-3417-impl-11112222",
                "req_id": REQ,
                "unit_title": "Implementation",
                "state": "finished",
                "run_ids": ["run-old-1"],
            },
        ],
        "discarded": [],
    }
    store.path_for(REQ).write_text(json.dumps(legacy), encoding="utf-8")
    old = store.load(REQ)

    assert old.cycle == 0
    assert old.units[0].cycle == 0
    assert old.run_ids == ("run-old-1",)


@verifies(SWR.SWR_3417)
def test_the_history_tells_the_deliveries_apart() -> None:
    """``ExecutionHistory.load`` answers per delivery, not one merged pile."""
    unit_id = mint_unit_id(REQ, "impl")
    history = RequirementHistory.of(
        REQ,
        [
            RunRecord(run_id="run-c1-1", req_id=REQ, unit_id=unit_id, cycle=0),
            RunRecord(run_id="run-c2-1", req_id=REQ, unit_id=unit_id, cycle=1),
        ],
    )

    assert history.cycles == (0, 1)
    assert [record.run_id for record in history.for_cycle(0)] == ["run-c1-1"]
    assert [record.run_id for record in history.for_cycle(1)] == ["run-c2-1"]
    assert len(history.for_unit(unit_id)) == 2, "unscoped is every delivery, and says so"
    assert [record.run_id for record in history.for_unit(unit_id, cycle=1)] == ["run-c2-1"]
    assert history.attempts_of(unit_id, cycle=1) == 1
    assert set(history.views_by_unit(cycle=0)[unit_id]) == {
        view for view in history.to_views() if view.run_id == "run-c1-1"
    }


@verifies(SWR.SWR_3417)
def test_a_run_record_round_trips_its_cycle_and_an_older_line_reads_as_the_first() -> None:
    """The cycle survives the file, and its absence means the first delivery."""
    record = RunRecord(run_id="run-c2-1", req_id=REQ, unit_id="impl", cycle=1)

    payload = record.to_payload()
    assert payload["cycle"] == 1
    assert RunRecord.from_payload(payload).cycle == 1

    first = RunRecord(run_id="run-c1-1", req_id=REQ, unit_id="impl")
    assert "cycle" not in first.to_payload(), "a first delivery writes the lines it always did"
    assert RunRecord.from_payload(first.to_payload()).cycle == 0
    assert record.to_view().cycle == 1


@verifies(SWR.SWR_3417, SWR.SWR_3216)
def test_a_unit_card_names_its_delivery_cycle_only_once_there_is_more_than_one() -> None:
    """The wiring: the cycle reaches a rendered sentence, and stays quiet until it matters."""
    second = delivered().opened(TWO)
    views = second.to_views()

    assert all(view.cycle == 1 for view in views)
    assert views[0].redelivered
    assert "delivery cycle 2" in views[0].summary
    assert views[0].summary.startswith(f"{views[0].unit_id}: {UnitState.PENDING.label}")

    first_time = ExecutionUnitView(unit_id="swr-3417-impl-11112222")
    assert not first_time.redelivered
    assert "delivery cycle" not in first_time.summary


@verifies(SWR.SWR_3417, SWR.SWR_3405)
def test_a_second_delivery_gets_its_own_branch_by_one_rule_not_two() -> None:
    """The seam and the branch strategy name the re-delivered unit identically."""
    strategy = BranchStrategy()

    assert unit_branch(REQ, "impl") == strategy.branch_for(REQ, "impl")
    assert unit_branch(REQ, "impl", cycle=1) == strategy.branch_for(REQ, "impl", cycle=1)
    assert unit_branch(REQ, "impl", cycle=1) != unit_branch(REQ, "impl")
    assert unit_branch(REQ, "impl", cycle=1).endswith("-c2")
    assert unit_branch(REQ, "impl", cycle=1, attempt=2).endswith("-c2-a2")


@verifies(SWR.SWR_3417, SWR.SWR_3413)
def test_recorded_progress_does_not_cross_into_the_next_delivery() -> None:
    """Unit ids repeat, so progress without a cycle would finish the new delivery at once."""
    progress = FlowProgress(
        req_id=REQ,
        completed=(FlowStage.SNAPSHOT,),
    ).with_unit("swr-3417-impl-11112222", "run-c1-1")

    carried = progress.opened(1)

    assert carried.cycle == 1
    assert carried.finished_units == ()
    assert carried.unit_runs == {}
    assert carried.completed == (FlowStage.SNAPSHOT,), "this flow's own stages still stand"
    assert progress.opened(0) is progress, "the same cycle is not a boundary"

    assert FlowProgress.from_payload(carried.to_payload()).cycle == 1
    assert "cycle" not in progress.to_payload(), "a first delivery writes what it always did"
    assert FlowProgress.from_payload(progress.to_payload()).cycle == 0
