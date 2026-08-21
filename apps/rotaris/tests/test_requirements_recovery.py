"""Requirement work survives a restart (SWR-3611).

A restart here is a real one. :class:`_Process` builds **every** store from the
workspace path and holds nothing else, so a second ``_Process`` over the same
directory is a second Rotaris: whatever it knows, it read off disk. No projection,
no index and no reader is carried across, which is the only way a test can tell
"reconstructed" from "still in memory".

The interrupted half is the failure mode SWR-2817 already had to solve for
sessions, at requirement granularity: a run whose record still says *running*
because the process that wrote it died. The restart pass that corrects it is
:func:`~rotaris_core.requirements.execution.recovery.reconcile_abandoned_runs` —
the product's own, composed into every board evaluation — and this file drives
that function rather than a copy of it. It used to hold a copy, and a test that
simulates the pass it is testing can only ever prove that the *test* works.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import (
    BoardInputs,
    QueueView,
    RunOutcome,
    UnitState,
    project_board,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.flow import FlowProgress, FlowStateStore
from rotaris_core.requirements.execution.history import (
    ExecutionHistory,
    HistoryError,
    RunRecord,
)
from rotaris_core.requirements.execution.reader import WorkspaceExecution
from rotaris_core.requirements.execution.recovery import reconcile_abandoned_runs
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
from rotaris_core.requirements.execution.store import UnitStore
from rotaris_core.requirements.execution.units import ExecutionUnit, RequirementUnits
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.recovery import session_is_live
from ui_query import settle

from rotaris.models.requirements_state import (
    RequirementsBoardState,
    build_board_state,
    build_detail,
    build_queue_state,
)
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import RequirementsView

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot
    from rotaris_core.requirements.delivery.projection import BoardProjection, ExecutionSummary

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 15, 11, 0, tzinfo=dt.UTC)
RUNNING_REQ = "SWR-4201"
DELIVERED_REQ = "SWR-4202"
BLOCKED_REQ = "SWR-4203"
INTERRUPTED_REASON = "Rotaris was closed while this run was in flight"

#: The three units of the running requirement, as the previous process left
#: them: two finished, one still claiming to run.
UNITS = (
    ExecutionUnit(
        unit_id="unit-1",
        req_id=RUNNING_REQ,
        title="Parse the file",
        state=UnitState.FINISHED,
        run_ids=("run-1",),
    ),
    ExecutionUnit(
        unit_id="unit-2",
        req_id=RUNNING_REQ,
        title="Validate the rows",
        state=UnitState.FINISHED,
        run_ids=("run-2",),
    ),
    ExecutionUnit(
        unit_id="unit-3",
        req_id=RUNNING_REQ,
        title="Report the failures",
        depends_on=("unit-1", "unit-2"),
        state=UnitState.RUNNING,
        run_ids=("run-3",),
    ),
)


def _requirement(req_id: str) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
    )


REQUIREMENTS = tuple(_requirement(req_id) for req_id in (RUNNING_REQ, DELIVERED_REQ, BLOCKED_REQ))
INDEX = RequirementIndex(requirements=REQUIREMENTS, generation=1)


def _run(
    run_id: str,
    unit_id: str,
    *,
    outcome: RunOutcome,
    minutes: int,
    reason: str = "",
) -> RunRecord:
    """One persisted run, with the work it left behind (SWR-3414, SWR-3405)."""
    return RunRecord(
        run_id=run_id,
        req_id=RUNNING_REQ,
        unit_id=unit_id,
        session_id=f"session-{unit_id}",
        worktree_path=f".rotaris/worktrees/{RUNNING_REQ}-{unit_id}",
        branch=f"feat/{RUNNING_REQ.lower()}-{unit_id}",
        base_commit="a1b2c3d",
        produced_commits=("c0ffee1",) if outcome is RunOutcome.SUCCEEDED else (),
        changed_files=("src/importer.py",),
        outcome=outcome,
        failure_reason=reason,
        started_at=NOW - dt.timedelta(minutes=minutes),
        finished_at=(
            NOW - dt.timedelta(minutes=minutes - 5) if outcome is not RunOutcome.RUNNING else None
        ),
        agent="implementer",
    )


class _Process:
    """One Rotaris process over a workspace: every store built from the path.

    Deliberately stateless beyond the path. Two instances over the same
    directory are a restart, and anything the second one knows it read from
    disk — which is exactly the claim SWR-3611 makes.
    """

    def __init__(self, root: Path) -> None:
        self.root = root
        self.units = UnitStore(root)
        self.history = ExecutionHistory(root)
        self.delivery = DeliveryStore(root)
        self.flow = FlowStateStore(root)
        self.sessions = SessionManager(root)

    def execution(self) -> WorkspaceExecution:
        """A reader for one pass, as the board builds one per evaluation."""
        return WorkspaceExecution(
            self.root,
            delivery=self.delivery,
            requirement_for=INDEX.requirement,
        )

    def summary(self, req_id: str = RUNNING_REQ) -> ExecutionSummary:
        return self.execution().execution_for(req_id)

    def project(self) -> BoardProjection:
        execution = self.execution()
        return project_board(
            BoardInputs(
                index=INDEX,
                delivery=self.delivery.load_all(),
                execution={
                    requirement.req_id: execution.execution_for(requirement.req_id)
                    for requirement in REQUIREMENTS
                },
                evaluated_at=NOW,
            ),
        )

    def board(self) -> RequirementsBoardState:
        return build_board_state(self.project())


def _first_process(root: Path) -> _Process:
    """A workspace as a process that was killed mid-run left it.

    Written through the engine's own stores — the delivery record walks the real
    transition matrix — so the restart reads what a real session would have
    written, not a fixture shaped to make the test pass.
    """
    process = _Process(root)
    writer = ExecutionTransitions.for_workspace(
        root,
        current_for=INDEX.requirement,
    )
    walks = {
        RUNNING_REQ: (DeliveryState.READY, DeliveryState.RUNNING),
        DELIVERED_REQ: (DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW),
        BLOCKED_REQ: (DeliveryState.READY, DeliveryState.BLOCKED),
    }
    causes = {
        DeliveryState.READY: TransitionCause.USER_ACTION,
        DeliveryState.RUNNING: TransitionCause.RUN_STARTED,
        DeliveryState.REVIEW: TransitionCause.RUN_COMPLETED,
        DeliveryState.BLOCKED: TransitionCause.BLOCKER_RAISED,
    }
    for req_id, states in walks.items():
        for offset, state in enumerate(states):
            requirement = INDEX.requirement(req_id)
            assert requirement is not None
            outcome = writer.apply(
                TransitionRequest(
                    req_id=req_id,
                    target=state,
                    actor=DeliveryActor.system("requirement-flow"),
                    cause=causes[state],
                    at=NOW - dt.timedelta(minutes=60 - offset),
                    requirement_hash=requirement.current_hash,
                    reason="waiting on the data owner" if state is DeliveryState.BLOCKED else "",
                ),
            )
            assert outcome.accepted, outcome.message

    process.units.save(RequirementUnits(req_id=RUNNING_REQ, units=UNITS))
    process.history.append(_run("run-1", "unit-1", outcome=RunOutcome.SUCCEEDED, minutes=50))
    process.history.append(_run("run-2", "unit-2", outcome=RunOutcome.SUCCEEDED, minutes=40))
    process.history.append(_run("run-3", "unit-3", outcome=RunOutcome.RUNNING, minutes=20))
    process.flow.save(
        FlowProgress(
            req_id=RUNNING_REQ,
            flow_id="flow-1",
            finished_units=("unit-1", "unit-2"),
            unit_runs={"unit-1": "run-1", "unit-2": "run-2"},
            updated_at=NOW - dt.timedelta(minutes=20),
        ),
    )
    return process


def _recover(process: _Process) -> tuple[str, ...]:
    """The restart pass, as production runs it (SWR-3611).

    The product's own function over the workspace's real stores: liveness is
    :func:`~rotaris_core.session.recovery.session_is_live` against the session
    store this workspace has, and the terminal record goes through the history's
    own ``close`` seam, so the run keeps its worktree, its branch and everything
    it produced. A restart may not lose work, only stop lying about it.
    """
    return reconcile_abandoned_runs(
        process.root,
        current_for=INDEX.requirement,
        at=NOW,
    )


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """A workspace left behind by a process that died with a run in flight."""
    _first_process(tmp_path)
    return tmp_path


# ── reconstruction from what is on disk ────────────────────────────────────


@verifies(SWR.SWR_3611)
def test_a_restart_rebuilds_units_runs_and_worktrees_from_persisted_state(
    workspace: Path,
) -> None:
    """Productive use: Rotaris is reopened and the work is still there.
    Expected outcome: a process that shares nothing with the first one finds all
    three units, both finished runs and the branch and worktree of each."""
    restarted = _Process(workspace)

    summary = restarted.summary()

    assert [unit.unit_id for unit in summary.units] == ["unit-1", "unit-2", "unit-3"]
    assert [unit.state for unit in summary.units] == [
        UnitState.FINISHED,
        UnitState.FINISHED,
        UnitState.RUNNING,
    ]
    assert [run.run_id for run in summary.runs] == ["run-1", "run-2", "run-3"]
    assert summary.branches == (
        "feat/swr-4201-unit-1",
        "feat/swr-4201-unit-2",
        "feat/swr-4201-unit-3",
    )
    assert summary.commits == ("c0ffee1", "c0ffee1")
    # The unit-to-run join is reconstructed, not remembered: a unit names run ids
    # and the history holds the records (SWR-3401, SWR-3414).
    third = next(unit for unit in summary.units if unit.unit_id == "unit-3")
    assert [run.run_id for run in third.runs] == ["run-3"]
    assert third.runs[0].worktree_path == ".rotaris/worktrees/SWR-4201-unit-3"
    assert restarted.flow.load(RUNNING_REQ).finished_units == ("unit-1", "unit-2")


@verifies(SWR.SWR_3611)
def test_a_run_whose_process_is_gone_is_detected_and_carried_as_interrupted(
    workspace: Path,
) -> None:
    """Productive use: the board must not claim a dead run is still going.
    Expected outcome: the restart finds no process owning the run, records it as
    interrupted with a stated reason, and the next read reports it as such —
    neither running nor failed."""
    restarted = _Process(workspace)
    before = restarted.summary()
    assert before.active_run is not None, "before recovery the record still claims a live run"
    assert before.active_run.outcome is RunOutcome.RUNNING
    assert session_is_live(restarted.sessions, "session-unit-3") is False

    freed = _recover(restarted)

    assert [sentence.split(":")[0] for sentence in freed] == [RUNNING_REQ]
    after = _Process(workspace).summary()
    assert after.active_run is None, "an interrupted run must not be shown as running"
    assert [run.run_id for run in after.interrupted_runs] == ["run-3"]
    interrupted = after.interrupted_runs[0]
    assert interrupted.interrupted is True
    assert interrupted.outcome.terminal is True
    assert interrupted.failure_reason.strip(), "an interrupted run says what stopped it"
    # Nothing about the work was dropped (SWR-3611's second criterion).
    assert interrupted.worktree_path == ".rotaris/worktrees/SWR-4201-unit-3"
    assert interrupted.branch == "feat/swr-4201-unit-3"
    assert interrupted.changed_files == ("src/importer.py",)
    assert [run.run_id for run in after.runs] == ["run-1", "run-2", "run-3"]


@verifies(SWR.SWR_3611)
def test_an_interrupted_run_cannot_be_recorded_without_saying_why() -> None:
    """Productive use: a reader months later has to know what stopped the run.
    Expected outcome: the store refuses an interrupted record with no reason, so
    a recovery pass cannot silently blank the one fact that explains the state."""
    with pytest.raises(HistoryError):
        _run("run-9", "unit-3", outcome=RunOutcome.INTERRUPTED, minutes=10)

    stated = _run(
        "run-9",
        "unit-3",
        outcome=RunOutcome.INTERRUPTED,
        minutes=10,
        reason=INTERRUPTED_REASON,
    )
    assert stated.in_flight is False
    assert stated.to_view().interrupted is True


@verifies(SWR.SWR_3611)
def test_a_restart_resets_no_requirement_to_backlog(workspace: Path) -> None:
    """Productive use: reopening Rotaris must not throw away where the work stood.
    Expected outcome: every persisted delivery state survives the restart —
    including the blocked one and its reason — and none falls back to Backlog.
    The requirement whose process died leaves Running, because it is not running;
    it lands in Blocked with a stated reason, which is a state a person can act
    on and is emphatically not Backlog."""
    restarted = _Process(workspace)
    _recover(restarted)

    board = _Process(workspace).board()

    states = {card.req_id: card.delivery for card in board.cards}
    assert states == {
        RUNNING_REQ: "blocked",
        DELIVERED_REQ: "review",
        BLOCKED_REQ: "blocked",
    }
    stranded = _Process(workspace).delivery.read(RUNNING_REQ).delivery
    assert "process is gone" in stranded.blocked_reason
    assert stranded.blocked_from is DeliveryState.RUNNING
    backlog = board.column("backlog")
    assert backlog is not None
    assert backlog.req_ids == (), "a restart may not reset a requirement to Backlog"
    blocked = _Process(workspace).delivery.read(BLOCKED_REQ)
    assert blocked.delivery.blocked_reason == "waiting on the data owner"
    assert blocked.delivery.blocked_from is DeliveryState.READY


@verifies(SWR.SWR_3611)
def test_the_queue_shows_an_interrupted_run_as_interrupted_rather_than_running() -> None:
    """Productive use: the queue is the surface that says what is in flight.
    Expected outcome: an interrupted run keeps its worktree and branch in the
    queue's own value and is marked interrupted, not running."""
    record = _run(
        "run-3",
        "unit-3",
        outcome=RunOutcome.INTERRUPTED,
        minutes=20,
        reason=INTERRUPTED_REASON,
    )

    queue = build_queue_state(QueueView(running=(record.to_view(),), concurrency_limit=2))

    assert len(queue.running) == 1
    run = queue.running[0]
    assert run.interrupted is True
    assert run.outcome == str(RunOutcome.INTERRUPTED)
    assert run.branch == "feat/swr-4201-unit-3"
    assert run.worktree_path == ".rotaris/worktrees/SWR-4201-unit-3"
    assert "Interrupted" in run.sentence


# ── the whole board, after the restart ─────────────────────────────────────


@pytest.mark.integration
@verifies(SWR.SWR_3611)
def test_restarting_with_three_persisted_units_restores_two_finished_and_one_interrupted(
    workspace: Path,
) -> None:
    """Productive use: the exact restart SWR-3611 is written for.
    Expected outcome: the board shows three units, two finished and one
    interrupted, with the interrupted one's work still on disk — and nothing
    back in Backlog."""
    restarted = _Process(workspace)
    _recover(restarted)

    board = _Process(workspace).board()

    card = board.card(RUNNING_REQ)
    assert card is not None
    assert card.unit_count == 3
    assert card.delivery == "blocked", "a requirement nothing is running is not Running"

    summary = _Process(workspace).summary()
    finished = [unit.unit_id for unit in summary.units if unit.state is UnitState.FINISHED]
    assert finished == ["unit-1", "unit-2"]
    assert [run.run_id for run in summary.interrupted_runs] == ["run-3"]
    assert summary.active_run is None
    assert all(run.worktree_path for run in summary.runs), "no restart may drop a worktree"

    # The detail view a user opens says the same thing in words.
    entry = _Process(workspace).project().entry(RUNNING_REQ)
    assert entry is not None
    execution = build_detail(entry, now=NOW).section("execution")
    assert execution is not None
    assert any("run-3: Interrupted" in line for line in execution.lines), execution.lines
    branches = next(fact.value for fact in execution.facts if fact.label == "Branches")
    assert "feat/swr-4201-unit-3" in branches
    outstanding = next(fact.value for fact in execution.facts if fact.label == "Outstanding")
    assert outstanding == "unit-3"


@pytest.mark.integration
@verifies(SWR.SWR_3611)
def test_the_queue_resumes_where_it_stopped_without_re_running_a_finished_unit(
    workspace: Path,
) -> None:
    """Productive use: two of three units are done and must stay done.
    Expected outcome: only the interrupted unit is outstanding, the finished ones
    are not offered for work again, and their run ids are still recorded."""
    restarted = _Process(workspace)
    _recover(restarted)

    units = _Process(workspace).units.load(RUNNING_REQ)

    assert units.outstanding == ("unit-3",)
    assert units.complete is False
    assert {unit.unit_id for unit in units.ready()}.isdisjoint({"unit-1", "unit-2"})
    assert units.require("unit-1").last_run_id == "run-1"
    assert units.require("unit-2").last_run_id == "run-2"
    # And the flow's own progress agrees, which is what stops a resumed flow from
    # planning the finished units again (SWR-3413).
    progress = _Process(workspace).flow.load(RUNNING_REQ)
    assert progress.finished_units == ("unit-1", "unit-2")
    assert progress.unit_runs == {"unit-1": "run-1", "unit-2": "run-2"}
    assert progress.empty is False


# ── the user-flow ──────────────────────────────────────────────────────────


class _BoardSource:
    """The bridge's port, reading the workspace on every evaluation."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def project(self) -> BoardProjection:
        return _Process(self._root).project()


def _open_rotaris(qtbot: QtBot, root: Path) -> tuple[RequirementsController, RequirementsView]:
    """A requirements area over *root*, built the way a launch builds one."""
    controller = RequirementsController(
        WorkspaceStore(),
        source=_BoardSource(root),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    return controller, view


@pytest.mark.e2e
@verifies(SWR.SWR_3611)
def test_a_user_closes_rotaris_mid_run_reopens_it_and_finds_the_work_where_they_left_it(
    qtbot: QtBot,
    workspace: Path,
) -> None:
    """Productive use: the promise of SWR-3611, driven through the board.
    Expected outcome: the reopened board shows the same three requirements in the
    same states, the interrupted run named as interrupted with its branch, and
    nothing sitting in Backlog."""
    first, _ = _open_rotaris(qtbot, workspace)
    before = first.view
    assert before is not None
    running = first._store.requirements.card(RUNNING_REQ)  # noqa: SLF001 - published state
    assert running is not None and running.delivery == "running"
    first.shutdown()
    settle(qtbot)

    _recover(_Process(workspace))
    second, view = _open_rotaris(qtbot, workspace)

    board = second._store.requirements  # noqa: SLF001 - published state
    assert {card.req_id: card.delivery for card in board.cards} == {
        RUNNING_REQ: "blocked",
        DELIVERED_REQ: "review",
        BLOCKED_REQ: "blocked",
    }
    backlog = board.column("backlog")
    assert backlog is not None and backlog.req_ids == ()
    # And the card says why it is not running, in the words the pass recorded.
    stranded = board.card(RUNNING_REQ)
    assert stranded is not None
    assert any("process is gone" in alert for alert in stranded.alerts), stranded.alerts

    second.open_requirement(RUNNING_REQ)
    settle(qtbot)
    assert view.page == "detail"
    detail = second.detail_for(RUNNING_REQ)
    assert detail is not None
    execution = detail.section("execution")
    assert execution is not None
    assert any("Interrupted" in line for line in execution.lines), execution.lines
    assert any("feat/swr-4201-unit-3" in fact.value for fact in execution.facts)
    card = board.card(RUNNING_REQ)
    assert card is not None and card.unit_count == 3

    # And the work can be picked back up. This is the half a restart used to
    # leave undone: the card was still Running, Running → Backlog is not a move,
    # and the one column it could reach — Blocked — released only back into
    # Running, which no person may ask for. There was no way out at all.
    view.show_board()
    settle(qtbot)
    options = {option.target: option for option in second.move_options_for(RUNNING_REQ)}
    assert [target for target, option in options.items() if option.reachable] == ["ready"]
