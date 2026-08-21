"""The seam between the two halves of the requirement board: SWR-3400 fills, SWR-3300 renders.

Slice 3 (the desktop board) and slice 4 (execution) were built in parallel against one
contract — the execution half of the board projection (SWR-3216). Each half has its own
tests, and each passes with the other half absent: the board renders empty execution
fields correctly, and the engine writes records nobody reads. That is exactly the shape of
a contract that has quietly drifted, so this file is the one place both halves run
together.

Nothing here crafts an ``ExecutionSummary``. Every value the board shows is written by
slice 4's own stores into a real workspace, read back through
:class:`~rotaris_core.requirements.execution.reader.WorkspaceExecution`, projected by the
engine's own :class:`~rotaris_core.requirements.delivery.projection.BoardProjector`, and
then asserted on the widgets the user actually looks at.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import (
    BoardProjector,
    CheckOutcome,
    ExecutionSummary,
    NoExecution,
    RunOutcome,
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
from rotaris_core.requirements.execution.snapshot import capture_snapshot
from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore
from rotaris_core.requirements.execution.units import UnitSpec, plan_units
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import click_by_name, settle

from rotaris.models.requirements_state import build_board_state, build_card, build_detail
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import RequirementsView
from rotaris.widgets.requirement_card import RequirementCardWidget

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.requirements.delivery.projection import BoardProjection
    from rotaris_core.requirements.execution.snapshot import RunSnapshot

pytestmark = pytest.mark.integration

REQ = "SWR-3401"
QUIET = "SWR-3402"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
NOW = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)

#: Derived from the requirement id and the unit key, so the ids a store wrote are
#: the ids a test can name (SWR-3401).
IMPL = "swr-3401-impl-4c450ce2"
TESTS = "swr-3401-tests-ab53935d"


def requirement(
    req_id: str = REQ, *, description: str = "what the product does"
) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description=description,
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
        source_revision="rev-1",
    )


def snapshot_of(req: CanonicalRequirement, *, run_id: str, unit_id: str) -> RunSnapshot:
    return capture_snapshot(req, run_id=run_id, base_commit="base0001", at=AT, unit_id=unit_id)


def result_of(
    req: CanonicalRequirement,
    *,
    run_id: str,
    unit_id: str,
    outcome: RunOutcome = RunOutcome.SUCCEEDED,
    commit: str = "c0ffee1",
) -> RunResult:
    workspace = RunWorkspace(path=f"/tmp/wt/{run_id}", branch=f"rotaris/req/swr-3401/{unit_id}")
    return RunResult(
        run_id=run_id,
        req_id=req.req_id,
        unit_id=unit_id,
        snapshot=snapshot_of(req, run_id=run_id, unit_id=unit_id),
        isolation=IsolationRequest(branch=workspace.branch, session_id=run_id),
        workspace=workspace,
        report=RunReport(
            outcome=outcome,
            produced_commits=(commit,),
            changed_files=("src/rotaris_core/requirements/execution/units.py",),
            verified=True,
            verification_detail="1 check(s) passed",
            checks=(CheckOutcome(name="pytest", status="passed"),),
            agent_summary="split the requirement into two units",
            agent_risks=("the split is a guess",),
            agent_claimed_complete=True,
        ),
        started_at=AT,
        finished_at=LATER,
    )


def moved_to_review(workspace: Path, req: CanonicalRequirement) -> DeliveryStore:
    """Walk the requirement to ``Review`` through the one writer there is (SWR-3203)."""
    store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(store)
    for target, cause in (
        (DeliveryState.READY, TransitionCause.USER_ACTION),
        (DeliveryState.RUNNING, TransitionCause.RUN_STARTED),
        (DeliveryState.REVIEW, TransitionCause.RUN_COMPLETED),
    ):
        outcome = transitions.apply(
            TransitionRequest(
                req_id=req.req_id,
                target=target,
                actor=DeliveryActor.system("requirement-flow"),
                cause=cause,
                at=AT,
                requirement_hash=req.current_hash,
            ),
        )
        assert outcome.accepted, outcome.message
    return store


def executed(
    workspace: Path,
    ran_against: CanonicalRequirement,
    *,
    still_running: bool = False,
) -> None:
    """Everything slice 4 leaves behind for one requirement, through its own stores.

    *still_running* opens a third run and leaves it open, which is the only state
    in which the projection carries an ``active_snapshot`` (SWR-3402).
    """
    units = plan_units(
        ran_against.req_id,
        [
            UnitSpec(key="impl", title="Implementation", agent="coding-agent"),
            UnitSpec(key="tests", title="Portfolio", depends_on=("impl",), agent="test-agent"),
        ],
    )
    UnitStore(workspace).save(units)
    history = ExecutionHistory(workspace)
    history.open(snapshot_of(ran_against, run_id="run-1", unit_id=IMPL), agent="coding-agent")
    history.complete(result_of(ran_against, run_id="run-1", unit_id=IMPL), agent="coding-agent")
    history.open(snapshot_of(ran_against, run_id="run-2", unit_id=TESTS), agent="test-agent")
    history.complete(
        result_of(ran_against, run_id="run-2", unit_id=TESTS, commit="dec0de2"),
        agent="test-agent",
    )
    IntegrationLog(workspace).append(
        IntegrationOutcome(
            integration_id="int-1",
            req_id=ran_against.req_id,
            unit_ids=(IMPL, TESTS),
            branch="rotaris/req/swr-3401/integration",
            merged=True,
            verified=True,
            promoted=True,
            merged_commit="merged77",
            base_before="base0001",
            base_after="merged77",
            finished_at=LATER,
        ),
    )
    if still_running:
        history.open(snapshot_of(ran_against, run_id="run-3", unit_id=TESTS), agent="test-agent")


def projection_over(
    workspace: Path,
    *,
    index: RequirementIndex,
    store: DeliveryStore,
) -> BoardProjection:
    """The engine's own projection, with the execution half read off *workspace*."""
    decision = schedule(
        [
            ScheduledRequirement.from_units(UnitStore(workspace).load(REQ)),
            ScheduledRequirement.from_units(UnitStore(workspace).load(QUIET)),
        ],
        limits=SchedulerLimits(concurrency=2, automatic=True),
        at=AT,
    )
    return BoardProjector(
        index,
        store,
        execution=WorkspaceExecution(
            workspace,
            delivery=store,
            decision=decision,
            requirement_for=index.requirement,
        ),
        clock=lambda: NOW,
    ).project()


class _Source:
    """A board source answering with one already-built projection."""

    def __init__(self, projection: BoardProjection) -> None:
        self._projection = projection

    def project(self) -> BoardProjection:
        return self._projection


def attached(qtbot, projection: BoardProjection) -> tuple[RequirementsController, RequirementsView]:
    controller = RequirementsController(
        WorkspaceStore(),
        source=_Source(projection),
        clock=lambda: NOW,
    )
    view = RequirementsView()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=20000)
    return controller, view


# ── the contract itself ─────────────────────────────────────────────────────


@verifies(SWR.SWR_3216, SWR.SWR_3401, SWR.SWR_3414)
def test_every_execution_field_the_board_reads_is_one_the_engine_fills(tmp_path: Path) -> None:
    """Productive use: the board asks the engine what has run, over a workspace that ran things.
    Expected outcome: no field of the shared execution shape is still at its empty default —
    a field only one of the two slices knows about is the drift this file exists to catch."""
    ran_against = requirement()
    store = moved_to_review(tmp_path, ran_against)
    executed(tmp_path, ran_against, still_running=True)
    index = RequirementIndex(requirements=(ran_against, requirement(QUIET)), generation=1)

    projection = projection_over(tmp_path, index=index, store=store)

    entry = projection.entry(REQ)
    assert entry is not None
    summary = entry.execution
    blank = ExecutionSummary()
    unfilled = [
        name
        for name in ExecutionSummary.model_fields
        if getattr(summary, name) == getattr(blank, name)
    ]
    assert unfilled == [], (
        "the execution slice never fills these fields of the shape the board renders; "
        "either it should, or the board should stop reading them"
    )
    # Every one of them came off disk, not out of a fixture.
    assert summary.unit_count == 2
    assert [run.run_id for run in summary.runs] == ["run-1", "run-2", "run-3"]
    assert summary.commits == ("c0ffee1", "dec0de2")
    assert summary.branches == (
        f"rotaris/req/swr-3401/{IMPL}",
        f"rotaris/req/swr-3401/{TESTS}",
    )
    assert summary.integrations[0].merged_commit == "merged77"
    assert summary.agent == "test-agent", "the agent carrying the run in flight"
    assert summary.active_snapshot is not None
    assert summary.active_snapshot.requirement_hash == ran_against.current_hash
    assert summary.queue_entry is not None and summary.queue_entry.req_id == REQ


@verifies(SWR.SWR_3304, SWR.SWR_3216)
def test_a_card_states_what_the_execution_slice_actually_wrote(tmp_path: Path) -> None:
    """Productive use: a user glances at a card of a requirement two agents just worked on.
    Expected outcome: the unit count and the last run come off the engine's records, and the
    requirement nothing has run for says so instead of showing a blank."""
    ran_against = requirement()
    store = moved_to_review(tmp_path, ran_against)
    executed(tmp_path, ran_against)
    index = RequirementIndex(requirements=(ran_against, requirement(QUIET)), generation=1)
    projection = projection_over(tmp_path, index=index, store=store)

    ran_entry = projection.entry(REQ)
    quiet_entry = projection.entry(QUIET)
    assert ran_entry is not None
    assert quiet_entry is not None
    ran_card = build_card(ran_entry, now=NOW)
    quiet_card = build_card(quiet_entry, now=NOW)

    assert ran_card.units_label == "2 execution units"
    assert ran_card.unit_count == 2
    assert ran_card.last_run_label == "Last run 2 hours ago (Succeeded)"
    assert "coding-agent" in ran_card.accessible_description
    assert quiet_card.units_label == "No execution units yet"
    assert quiet_card.last_run_label == "Never run"


@verifies(SWR.SWR_3307, SWR.SWR_3405, SWR.SWR_3409)
def test_the_detail_view_lists_the_units_runs_branches_and_integration_off_disk(
    tmp_path: Path,
) -> None:
    """Productive use: a user opens the Execution section of a requirement that has been run.
    Expected outcome: the units, their runs, the branches they used and the integration that
    landed them are the ones the engine recorded — each named, not counted."""
    ran_against = requirement()
    store = moved_to_review(tmp_path, ran_against)
    executed(tmp_path, ran_against)
    index = RequirementIndex(requirements=(ran_against, requirement(QUIET)), generation=1)
    projection = projection_over(tmp_path, index=index, store=store)

    entry = projection.entry(REQ)
    assert entry is not None
    section = build_detail(entry, now=NOW).section("execution")

    assert section is not None
    assert not section.empty
    facts = {fact.label: fact.value for fact in section.facts}
    assert facts["Execution units"] == "2"
    assert f"rotaris/req/swr-3401/{IMPL}" in facts["Branches"]
    assert "c0ffee1" in facts["Commits"]
    lines = "\n".join(section.lines)
    assert IMPL in lines
    assert "run-1: Succeeded" in lines
    assert "int-1: 2 unit(s) integrated" in lines


@verifies(SWR.SWR_3403, SWR.SWR_3304)
def test_a_specification_edited_mid_run_reaches_the_card_as_a_sentence(tmp_path: Path) -> None:
    """Productive use: somebody edits a requirement while its run is in flight (SWR-3403).
    Expected outcome: the card the user sees states that the specification moved, in words —
    the engine detected it, the board says it, and neither invented it."""
    ran_against = requirement()
    store = moved_to_review(tmp_path, ran_against)
    executed(tmp_path, ran_against)
    edited = requirement(description="what the product does — restated after the run started")
    index = RequirementIndex(requirements=(edited, requirement(QUIET)), generation=2)

    projection = projection_over(tmp_path, index=index, store=store)

    entry = projection.entry(REQ)
    assert entry is not None
    assert entry.review is not None
    assert entry.review.specification_changed
    assert entry.review.snapshot_hash == ran_against.current_hash
    assert entry.review.current_hash == edited.current_hash
    card = build_card(entry, now=NOW)
    assert "Awaiting review: the specification moved while the run was in flight" in card.alerts, (
        card.alerts
    )


@verifies(SWR.SWR_3301, SWR.SWR_3307, SWR.SWR_3216)
def test_a_user_opens_the_board_and_reads_what_the_agents_did(qtbot, tmp_path: Path) -> None:
    """Productive use: a user opens Requirements after an unattended run and asks what happened.
    Expected outcome: the card carries the run, opening it shows the units, runs, branches and
    the integration — all of it read from the workspace, none of it from the desktop."""
    ran_against = requirement()
    store = moved_to_review(tmp_path, ran_against)
    executed(tmp_path, ran_against)
    index = RequirementIndex(requirements=(ran_against, requirement(QUIET)), generation=1)
    projection = projection_over(tmp_path, index=index, store=store)

    controller, view = attached(qtbot, projection)

    widget = view.card_widgets[REQ]
    assert isinstance(widget, RequirementCardWidget)
    assert widget.execution_label.text() == "2 execution units · Last run 2 hours ago (Succeeded)"
    quiet = view.card_widgets[QUIET]
    assert isinstance(quiet, RequirementCardWidget)
    assert quiet.execution_label.text() == "No execution units yet · Never run"

    click_by_name(qtbot, view, f"Open {REQ}", QPushButton)
    settle(qtbot)
    section = view.detail_view.section_widget("execution")
    assert section is not None
    rendered = section.accessibleDescription()
    assert f"Branches: rotaris/req/swr-3401/{IMPL}" in rendered
    assert "c0ffee1" in rendered
    assert "run-2: Succeeded" in rendered
    assert "int-1" in rendered
    controller.shutdown()


@verifies(SWR.SWR_3216)
def test_the_same_board_with_no_execution_reader_degrades_instead_of_breaking(
    tmp_path: Path,
) -> None:
    """Productive use: a workspace that has never run anything opens the same board.
    Expected outcome: every execution surface states its own emptiness — the empty case is
    the one both slices have to keep working, not a stage on the way to the filled one."""
    req = requirement()
    index = RequirementIndex(requirements=(req,), generation=1)

    projection = BoardProjector(
        index,
        DeliveryStore(tmp_path),
        execution=NoExecution(),
        clock=lambda: NOW,
    ).project()

    entry = projection.entry(REQ)
    assert entry is not None
    assert entry.execution.empty
    state = build_board_state(projection, now=NOW)
    assert state.card(REQ) is not None
    card = state.card(REQ)
    assert card is not None
    assert card.units_label == "No execution units yet"
    section = build_detail(entry, now=NOW).section("execution")
    assert section is not None
    assert section.empty
    assert section.empty_message == "Nothing has run for this requirement yet."
