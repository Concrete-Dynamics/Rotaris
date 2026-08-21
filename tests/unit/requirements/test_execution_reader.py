"""Productive use: a user opens the requirement board while units are running, have failed and
have been integrated — in a process that ran none of them.
Expected outcome: the unit set survives the process that planned it, the runs are joined onto
their units, a spent retry budget is reported as a blocker rather than as silence, a finished
run awaiting review carries both hashes, and a queue position arrives with the reason it is
held."""

from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import (
    BlockerKind,
    CheckOutcome,
    RunOutcome,
    UnitState,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import DeliveryTransitions, TransitionRequest
from rotaris_core.requirements.execution.history import ExecutionHistory
from rotaris_core.requirements.execution.integration import IntegrationOutcome
from rotaris_core.requirements.execution.reader import WorkspaceExecution
from rotaris_core.requirements.execution.run_seam import (
    IsolationRequest,
    RunReport,
    RunResult,
    RunWorkspace,
)
from rotaris_core.requirements.execution.scheduler import (
    ScheduledRequirement,
    SchedulerLimits,
    schedule,
)
from rotaris_core.requirements.execution.snapshot import RunSnapshot, capture_snapshot
from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore
from rotaris_core.requirements.execution.units import RequirementUnits, UnitSpec, plan_units
from rotaris_core.requirements.model import CanonicalRequirement

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

REQ = "SWR-3401"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
#: Derived, not drawn (SWR-3401): the same requirement and key always mint these,
#: which is what lets a test written today name a unit a store wrote yesterday.
IMPL = "swr-3401-impl-4c450ce2"
TESTS = "swr-3401-tests-ab53935d"
SPEC = "an execution unit is a Rotaris-owned work artefact belonging to one requirement"


def requirement(*, description: str = SPEC, req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Execution units are work artefacts",
        description=description,
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
        source_revision="rev-3",
    )


def two_units(req_id: str = REQ) -> RequirementUnits:
    return plan_units(
        req_id,
        [
            UnitSpec(key="impl", title="Implementation", scope="the module", agent="coding-agent"),
            UnitSpec(key="tests", title="Portfolio", depends_on=("impl",), agent="test-agent"),
        ],
    )


def snapshot_of(*, run_id: str, unit_id: str, req: CanonicalRequirement) -> RunSnapshot:
    return capture_snapshot(req, run_id=run_id, base_commit="base0001", at=AT, unit_id=unit_id)


def result_of(
    *,
    run_id: str,
    unit_id: str,
    req: CanonicalRequirement,
    outcome: RunOutcome = RunOutcome.SUCCEEDED,
    reason: str = "",
    attempt: int = 1,
) -> RunResult:
    workspace = RunWorkspace(path=f"/tmp/wt/{run_id}", branch=f"rotaris/req/swr-3401/{unit_id}")
    return RunResult(
        run_id=run_id,
        req_id=req.req_id,
        unit_id=unit_id,
        snapshot=snapshot_of(run_id=run_id, unit_id=unit_id, req=req),
        isolation=IsolationRequest(branch=workspace.branch, session_id=run_id),
        workspace=workspace,
        report=RunReport(
            outcome=outcome,
            produced_commits=("c0ffee1",) if outcome is RunOutcome.SUCCEEDED else (),
            changed_files=("src/rotaris_core/requirements/execution/units.py",),
            verified=outcome is RunOutcome.SUCCEEDED,
            verification_detail="1 check(s) passed",
            checks=(CheckOutcome(name="pytest", status="passed"),),
            failure_reason=reason,
            agent_summary="planned the units",
            agent_risks=("the split is a guess",),
            agent_claimed_complete=outcome is RunOutcome.SUCCEEDED,
        ),
        started_at=AT,
        finished_at=LATER,
        attempt=attempt,
        failure_reason=reason,
    )


# -- the unit store (SWR-3401) ----------------------------------------------


@verifies(SWR.SWR_3401)
def test_a_unit_set_survives_the_process_that_planned_it(tmp_path: Path) -> None:
    units = two_units().with_state(TESTS, UnitState.RUNNING)

    UnitStore(tmp_path).save(units)
    reloaded = UnitStore(tmp_path).load(REQ)

    assert reloaded.ids == units.ids
    impl = reloaded.require(IMPL)
    tests = reloaded.require(TESTS)
    assert tests.depends_on == (IMPL,), "the dependency edge survived the round trip"
    assert tests.state is UnitState.RUNNING
    assert impl.title == "Implementation"
    assert impl.agent == "coding-agent"


@verifies(SWR.SWR_3401)
def test_a_discarded_unit_keeps_its_id_across_the_round_trip(tmp_path: Path) -> None:
    units = two_units().discard(TESTS, reason="folded into the implementation")

    UnitStore(tmp_path).save(units)
    reloaded = UnitStore(tmp_path).load(REQ)

    assert reloaded.ids == (IMPL,)
    assert [unit.unit_id for unit in reloaded.discarded] == [TESTS]
    # The whole point of persisting the discarded ones: the next plan must not
    # hand that id to different work.
    assert reloaded.added([UnitSpec(key="tests")]).ids != (IMPL, TESTS)


@verifies(SWR.SWR_3114, SWR.SWR_3401)
def test_the_persisted_unit_set_carries_no_requirement_prose(tmp_path: Path) -> None:
    UnitStore(tmp_path).save(two_units())

    text = UnitStore(tmp_path).path_for(REQ).read_text(encoding="utf-8")

    payload = json.loads(text)
    assert SPEC not in text
    assert "title" not in payload["units"][0], "a unit's own label is not requirement content"
    assert payload["units"][0]["unit_title"] == "Implementation"
    assert payload["req_id"] == REQ


@verifies(SWR.SWR_3401)
def test_an_unreadable_unit_file_costs_its_own_requirement_and_nothing_else(
    tmp_path: Path,
) -> None:
    store = UnitStore(tmp_path)
    store.save(two_units())
    store.save(two_units("SWR-3402"))
    store.path_for(REQ).write_text("{not json", encoding="utf-8")

    assert store.load(REQ).ids == (), "a corrupt file reads as 'no units yet', never as a crash"
    assert store.load("SWR-3402").ids != ()
    assert store.req_ids() == ("SWR-3402",)


@verifies(SWR.SWR_3401)
def test_a_file_from_a_newer_build_is_skipped_rather_than_reinterpreted(tmp_path: Path) -> None:
    store = UnitStore(tmp_path)
    path = store.save(two_units())
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["schema_version"] = 99
    path.write_text(json.dumps(payload), encoding="utf-8")

    assert store.load(REQ).ids == ()


# -- the join the board reads (SWR-3216) ------------------------------------


@verifies(SWR.SWR_3401, SWR.SWR_3414)
def test_the_summary_joins_every_run_onto_the_unit_that_produced_it(tmp_path: Path) -> None:
    req = requirement()
    UnitStore(tmp_path).save(two_units())
    history = ExecutionHistory(tmp_path)
    history.open(snapshot_of(run_id="run-1", unit_id=IMPL, req=req))
    history.complete(result_of(run_id="run-1", unit_id=IMPL, req=req))
    history.open(snapshot_of(run_id="run-2", unit_id=TESTS, req=req))

    summary = WorkspaceExecution(tmp_path).execution_for(REQ)

    assert summary.unit_count == 2
    impl = next(unit for unit in summary.units if unit.unit_id == IMPL)
    assert [run.run_id for run in impl.runs] == ["run-1"]
    assert impl.branch == f"rotaris/req/swr-3401/{IMPL}"
    assert summary.commits == ("c0ffee1",)
    assert summary.outstanding_units == (IMPL, TESTS)
    # The run still going is the one whose snapshot the board shows (SWR-3402).
    assert summary.active_run is not None
    assert summary.active_run.run_id == "run-2"
    assert summary.active_snapshot is not None
    assert summary.active_snapshot.requirement_hash == req.current_hash


@verifies(SWR.SWR_3216, SWR.SWR_3414)
def test_a_workspace_that_never_ran_anything_is_empty_rather_than_absent(tmp_path: Path) -> None:
    summary = WorkspaceExecution(tmp_path).execution_for(REQ)

    assert summary.empty
    assert summary.req_id == REQ
    assert summary.units == ()
    assert summary.last_run is None


@verifies(SWR.SWR_3409)
def test_a_failed_integration_is_read_back_naming_the_units_that_collided(
    tmp_path: Path,
) -> None:
    log = IntegrationLog(tmp_path)
    log.append(
        IntegrationOutcome(
            integration_id="int-1",
            req_id=REQ,
            unit_ids=(IMPL, TESTS),
            merged=False,
            conflicting_units=(TESTS,),
            conflicting_files=("src/rotaris_core/requirements/execution/units.py",),
            failure_reason="the two units changed the same lines",
            base_before="base0001",
            base_after="base0001",
            finished_at=LATER,
        ),
    )

    summary = WorkspaceExecution(tmp_path).execution_for(REQ)

    assert len(summary.integrations) == 1
    view = summary.integrations[0]
    assert not view.succeeded
    assert view.conflicting_units == (TESTS,)
    assert TESTS in view.summary


# -- blockers (SWR-3415, SWR-3412) ------------------------------------------


@verifies(SWR.SWR_3415)
def test_a_unit_whose_retries_are_spent_blocks_the_requirement_by_name(tmp_path: Path) -> None:
    req = requirement()
    units = two_units()
    spent = units.replaced(
        units.require(IMPL).evolve(
            state=UnitState.FAILED,
            retries=2,
            retry_limit=2,
            failure_reason="the suite failed three times in a row",
        ),
    )
    UnitStore(tmp_path).save(spent)
    ExecutionHistory(tmp_path).complete(
        result_of(
            run_id="run-1",
            unit_id=IMPL,
            req=req,
            outcome=RunOutcome.FAILED,
            reason="the suite failed three times in a row",
            attempt=3,
        ),
    )

    blockers = WorkspaceExecution(tmp_path).blockers_for(REQ)

    assert len(blockers) == 1
    assert blockers[0].kind is BlockerKind.RUN_FAILURE
    assert "the suite failed three times in a row" in blockers[0].reason
    assert IMPL in blockers[0].reason
    assert blockers[0].raised_at == LATER


@verifies(SWR.SWR_3412, SWR.SWR_3406)
def test_a_sibling_hold_is_reported_as_a_queue_position_and_not_as_a_blocker(
    tmp_path: Path,
) -> None:
    units = two_units()
    UnitStore(tmp_path).save(units)
    decision = schedule(
        [ScheduledRequirement.from_units(units)],
        limits=SchedulerLimits(concurrency=4),
        at=AT,
    )
    reader = WorkspaceExecution(tmp_path, decision=decision)

    summary = reader.execution_for(REQ)
    queue = reader.queue()

    entry = summary.queue_entry
    assert entry is not None
    assert entry.unit_id == IMPL, "the runnable unit is where this requirement stands"
    assert not entry.held
    held = queue.held
    assert [item.unit_id for item in held] == [TESTS]
    assert held[0].waiting_for == (IMPL,)
    assert held[0].hold_reason, "a held candidate always names why (SWR-3412)"
    # Waiting for a sibling is the dependency graph working, not a blocker.
    assert reader.blockers_for(REQ) == ()


@verifies(SWR.SWR_3412)
def test_a_requirement_waiting_on_another_requirement_blocks_by_name(tmp_path: Path) -> None:
    units = two_units()
    UnitStore(tmp_path).save(units)
    decision = schedule(
        [ScheduledRequirement.from_units(units, depends_on=("SWR-3216",))],
        limits=SchedulerLimits(concurrency=4),
        states={"SWR-3216": DeliveryState.RUNNING},
        at=AT,
    )

    blockers = WorkspaceExecution(tmp_path, decision=decision).blockers_for(REQ)

    assert blockers, "a requirement dependency that is not Done is a blocker (SWR-3510)"
    assert {blocker.kind for blocker in blockers} == {BlockerKind.DEPENDENCY}
    assert blockers[0].blocking_ids == ("SWR-3216",)
    assert "SWR-3216" in blockers[0].reason


@verifies(SWR.SWR_3412)
def test_the_queue_reports_the_runs_that_are_actually_in_flight(tmp_path: Path) -> None:
    req = requirement()
    ExecutionHistory(tmp_path).open(
        snapshot_of(run_id="run-1", unit_id=IMPL, req=req),
    )
    decision = schedule(
        [ScheduledRequirement.from_units(two_units())],
        limits=SchedulerLimits(concurrency=4, automatic=True),
        at=AT,
    )

    queue = WorkspaceExecution(tmp_path, decision=decision).queue()

    assert [run.run_id for run in queue.running] == ["run-1"]
    assert queue.automatic
    assert queue.concurrency_limit == 4
    assert WorkspaceExecution(tmp_path).queue().empty, "no decision, no queue"


# -- review (SWR-3403) -------------------------------------------------------


def released(store: DeliveryStore, req: CanonicalRequirement) -> None:
    """Walk one requirement to ``Review`` through the one writer there is."""
    transitions = DeliveryTransitions(store)
    actor = DeliveryActor.system("test")
    for target, cause in (
        (DeliveryState.READY, TransitionCause.USER_ACTION),
        (DeliveryState.RUNNING, TransitionCause.RUN_STARTED),
        (DeliveryState.REVIEW, TransitionCause.RUN_COMPLETED),
    ):
        outcome = transitions.apply(
            TransitionRequest(
                req_id=req.req_id,
                target=target,
                actor=actor,
                cause=cause,
                at=AT,
                requirement_hash=req.current_hash,
            ),
        )
        assert outcome.accepted, outcome.refusal


@verifies(SWR.SWR_3403)
def test_a_requirement_edited_during_its_run_reaches_review_with_both_hashes(
    tmp_path: Path,
) -> None:
    ran_against = requirement()
    store = DeliveryStore(tmp_path)
    released(store, ran_against)
    ExecutionHistory(tmp_path).complete(
        result_of(run_id="run-1", unit_id=IMPL, req=ran_against),
    )
    edited = requirement(description=SPEC + " — and it never writes to the source")

    review = WorkspaceExecution(
        tmp_path,
        delivery=store,
        requirement_for=lambda _req_id: edited,
    ).review_for(REQ)

    assert review is not None
    assert review.specification_changed
    assert review.snapshot_hash == ran_against.current_hash
    assert review.current_hash == edited.current_hash
    assert "specification changed during execution" in review.summary
    # What the agent claimed and what Rotaris measured, side by side (SWR-3603).
    assert review.agent_summary == "planned the units"
    assert review.agent_risks == ("the split is a guess",)
    assert review.verified is True


@verifies(SWR.SWR_3403)
def test_a_requirement_that_is_not_in_review_presents_no_review_at_all(tmp_path: Path) -> None:
    req = requirement()
    store = DeliveryStore(tmp_path)
    ExecutionHistory(tmp_path).complete(
        result_of(run_id="run-1", unit_id=IMPL, req=req),
    )

    reader = WorkspaceExecution(tmp_path, delivery=store, requirement_for=lambda _r: req)

    assert reader.review_for(REQ) is None, "Backlog is not awaiting review"


@verifies(SWR.SWR_3403)
def test_an_unchanged_specification_still_awaits_review_and_says_so(tmp_path: Path) -> None:
    req = requirement()
    store = DeliveryStore(tmp_path)
    released(store, req)
    ExecutionHistory(tmp_path).complete(
        result_of(run_id="run-1", unit_id=IMPL, req=req),
    )

    review = WorkspaceExecution(
        tmp_path,
        delivery=store,
        requirement_for=lambda _r: req,
    ).review_for(REQ)

    assert review is not None
    assert not review.specification_changed
    assert review.reason == "the run finished and is awaiting review"


# -- reads only (SWR-3216) ---------------------------------------------------


@verifies(SWR.SWR_3216)
def test_reading_the_execution_side_writes_nothing_at_all(tmp_path: Path) -> None:
    req = requirement()
    UnitStore(tmp_path).save(two_units())
    ExecutionHistory(tmp_path).complete(
        result_of(run_id="run-1", unit_id=IMPL, req=req),
    )
    before = {path: path.read_bytes() for path in sorted(tmp_path.rglob("*")) if path.is_file()}

    reader = WorkspaceExecution(tmp_path)
    reader.execution_for(REQ)
    reader.blockers_for(REQ)
    reader.review_for(REQ)
    reader.queue()

    after = {path: path.read_bytes() for path in sorted(tmp_path.rglob("*")) if path.is_file()}
    assert after == before, "a projection that changed what it projected is not a projection"
