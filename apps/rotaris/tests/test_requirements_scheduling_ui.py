"""Seeing the delivery queue, and being able to hold it (SWR-3608).

The queue is the one surface where "what Rotaris will do next" is visible, so
none of it is asserted against a hand-built order: every queue in this module
comes from a real
:func:`~rotaris_core.requirements.execution.scheduler.schedule` decision, and the
tests check that what the panel shows is what the scheduler decided — including
the machine-readable reason behind every hold.

The control half is real in the same way. A concurrency change is written to a
real workspace configuration under ``tmp_path`` and read back into the
:class:`~rotaris_core.requirements.execution.scheduler.SchedulerLimits` that the
next scheduling pass runs with, and the pass is then run to prove the limit
*queues* rather than merely appearing in a label. Holding a requirement goes
through the real guarded write path, so the block it produces is the engine's.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
import yaml
from a11y import text_contrast_violations, unnamed_controls
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QPushButton, QSpinBox, QWidget
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import (
    BoardInputs,
    RequirementPriority,
    RunOutcome,
    project_board,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.history import ExecutionHistory, RunRecord
from rotaris_core.requirements.execution.scheduler import (
    HoldReason,
    RunningUnit,
    ScheduledRequirement,
    SchedulerLimits,
    schedule,
)
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, capture_snapshot
from rotaris_core.requirements.execution.units import ExecutionUnit, RequirementUnits, UnitState
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import accessible_names, click, find_by_accessible_name, settle, type_text

from rotaris.models.requirements_state import build_queue_state
from rotaris.models.store import WorkspaceStore
from rotaris.services import requirements_controller
from rotaris.services.requirements_actions import RequirementActions
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirement_queue import (
    CONTROL_AUTOMATIC,
    CONTROL_CONCURRENCY,
    CONTROL_START,
    CONTROL_STOP,
    HOLD_REASON_REQUIRED,
    QUEUE_CONTROLS,
    QUEUE_PANE,
    STOP_NOTE,
    RequirementQueueView,
    SchedulingControls,
    attach_queue,
    load_scheduling_limits,
    open_queue,
)
from rotaris.views.requirements import RequirementsView
from rotaris.widgets.meters import ToggleSwitch

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

    from rotaris_core.requirements.delivery.projection import BoardProjection

    from rotaris.models.requirements_state import QueueState

pytestmark = pytest.mark.integration

NOW = dt.datetime(2026, 8, 15, 12, 0, tzinfo=dt.UTC)


# ── real scheduling decisions ──────────────────────────────────────────────


def _units(req_id: str, *unit_ids: str, depends_on: tuple[str, ...] = ()) -> RequirementUnits:
    return RequirementUnits(
        req_id=req_id,
        units=tuple(
            ExecutionUnit(
                req_id=req_id,
                unit_id=unit_id,
                state=UnitState.PENDING,
                depends_on=depends_on if index else (),
            )
            for index, unit_id in enumerate(unit_ids)
        ),
    )


def _decision(
    *requirements: ScheduledRequirement,
    limits: SchedulerLimits | None = None,
    running: tuple[RunningUnit, ...] = (),
    states: dict[str, DeliveryState] | None = None,
) -> object:
    return schedule(
        list(requirements),
        limits=limits if limits is not None else SchedulerLimits(concurrency=4),
        running=running,
        states=states,
        at=NOW,
    )


def _queue(decision: object, runs: tuple[object, ...] = ()) -> QueueState:
    return build_queue_state(decision.to_queue_view(runs))  # type: ignore[attr-defined]


def _pane(qtbot, queue: QueueState | None = None) -> RequirementQueueView:
    pane = RequirementQueueView()
    qtbot.addWidget(pane)
    pane.resize(1000, 680)
    pane.show()
    qtbot.waitExposed(pane)
    if queue is not None:
        pane.set_queue(queue)
        settle(qtbot)
    return pane


def _texts(root: QWidget) -> list[str]:
    return [label.text() for label in root.findChildren(QLabel) if label.text()]


# ── a real workspace, for the deciding half ────────────────────────────────


def _requirement(req_id: str) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
    )


class _Workspace:
    """One workspace with a real delivery store and the guarded write path."""

    def __init__(self, root: Path, requirements: Iterable[CanonicalRequirement]) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.root = root
        self.requirements = {item.req_id: item for item in requirements}
        self.store = DeliveryStore(root)
        self.history = ExecutionHistory(root)
        self.writer = ExecutionTransitions.for_workspace(
            root,
            current_for=self.requirements.get,
        )

    def hash_for(self, req_id: str) -> str:
        requirement = self.requirements.get(req_id)
        return requirement.current_hash if requirement is not None else ""

    def advance(self, req_id: str, *states: DeliveryState) -> None:
        causes = {
            DeliveryState.READY: TransitionCause.USER_ACTION,
            DeliveryState.RUNNING: TransitionCause.RUN_STARTED,
        }
        for offset, state in enumerate(states):
            outcome = self.writer.apply(
                TransitionRequest(
                    req_id=req_id,
                    target=state,
                    actor=DeliveryActor.system("requirement-flow"),
                    cause=causes.get(state, TransitionCause.USER_ACTION),
                    at=NOW + dt.timedelta(seconds=offset),
                    requirement_hash=self.hash_for(req_id),
                ),
            )
            assert outcome.accepted, outcome.message

    def start_run(self, req_id: str, *, run_id: str) -> RunRecord:
        """A run that is still in flight, the way the execution slice opens one."""
        snapshot = capture_snapshot(
            self.requirements[req_id],
            run_id=run_id,
            base_commit="a1b2c3d",
            at=NOW,
            unit_id="unit-1",
            session_id=f"session-{run_id}",
        )
        record = RunRecord.opening(snapshot, at=NOW).model_copy(
            update={
                "outcome": RunOutcome.RUNNING,
                "branch": f"rotaris/req/{req_id.lower()}/unit-1",
            },
        )
        return self.history.append(record)

    def project(self) -> BoardProjection:
        return project_board(
            BoardInputs(
                index=RequirementIndex(
                    requirements=tuple(self.requirements.values()),
                    generation=1,
                ),
                delivery=self.store.load_all(),
                evaluated_at=NOW,
            ),
        )


class _BoardSource:
    def __init__(self, workspace: _Workspace) -> None:
        self._workspace = workspace

    def project(self) -> BoardProjection:
        return self._workspace.project()


def _actions(workspace: _Workspace) -> RequirementActions:
    return RequirementActions(
        workspace.writer,
        hash_for=workspace.hash_for,
        actor_name="dvf",
        clock=lambda: NOW,
    )


def _board(
    qtbot,
    workspace: _Workspace,
    scheduling: SchedulingControls,
) -> tuple[RequirementsController, RequirementsView, RequirementQueueView, WorkspaceStore]:
    store = WorkspaceStore()
    controller = RequirementsController(store, source=_BoardSource(workspace), clock=lambda: NOW)
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    controller.attach_actions(_actions(workspace))
    pane = attach_queue(controller, store, scheduling=scheduling)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)
    return controller, view, pane, store


# ── SWR-3608: what the queue shows ─────────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3608)
def test_the_queue_lists_candidates_in_the_order_the_scheduler_chose(qtbot) -> None:
    """Productive use: a user asks what Rotaris will start next.
    Expected outcome: the panel lists the scheduler's own order, not one it
    re-derived from the ids."""
    decision = _decision(
        ScheduledRequirement.from_units(_units("SWR-4201", "unit-1")),
        ScheduledRequirement.from_units(
            _units("SWR-4202", "unit-1"),
            priority=RequirementPriority.CRITICAL,
        ),
    )
    queue = _queue(decision)
    pane = _pane(qtbot, queue)

    # The scheduler put the critical requirement first; the ids would not have.
    assert [candidate.what for candidate in queue.ready] == [
        "SWR-4202/unit-1",
        "SWR-4201/unit-1",
    ]
    rendered = _texts(pane)
    assert rendered.index("#1 SWR-4202/unit-1") < rendered.index("#2 SWR-4201/unit-1")
    assert queue.next_up is not None
    assert queue.next_up.what == "SWR-4202/unit-1"
    assert "next SWR-4202/unit-1" in pane.summary.text()


@pytest.mark.unit
@verifies(SWR.SWR_3608)
def test_every_held_candidate_shows_the_reason_the_engine_stated(qtbot) -> None:
    """Productive use: nothing is starting and the user wants to know why.
    Expected outcome: each held candidate carries the scheduler's own reason."""
    decision = _decision(
        ScheduledRequirement.from_units(
            _units("SWR-4203", "unit-1", "unit-2", depends_on=("unit-1",))
        ),
        ScheduledRequirement.from_units(_units("SWR-4204", "unit-1"), depends_on=("SWR-4203",)),
        limits=SchedulerLimits(concurrency=1),
    )
    queue = _queue(decision)
    pane = _pane(qtbot, queue)

    reasons = {hold.unit_id: hold.reason for hold in decision.held}  # type: ignore[attr-defined]
    assert reasons["unit-2"] is HoldReason.UNIT_DEPENDENCY
    assert reasons["unit-1"] is HoldReason.REQUIREMENT_DEPENDENCY
    rendered = " · ".join(_texts(pane))
    for candidate in queue.held:
        assert candidate.hold_reason, f"{candidate.what} is held with no stated reason"
        assert candidate.sentence in rendered
    assert "unit-dependency" in rendered
    assert "requirement-dependency" in rendered
    assert "SWR-4203" in rendered


@pytest.mark.unit
@verifies(SWR.SWR_3608)
def test_the_panel_offers_exactly_the_controls_the_requirement_names(qtbot) -> None:
    """Productive use: a user turns scheduling on, sets a limit and stops it.
    Expected outcome: each control raises its own intent, and a queue pushed in
    from the scheduler is not echoed back as an instruction."""
    decision = _decision(ScheduledRequirement.from_units(_units("SWR-4205", "unit-1")))
    pane = _pane(qtbot, _queue(decision))
    raised: list[tuple[str, str]] = []
    pane.control_requested.connect(lambda control, value: raised.append((control, value)))

    click(qtbot, find_by_accessible_name(pane, "Schedule requirements automatically", ToggleSwitch))
    spin = find_by_accessible_name(pane, "Units running at once", QSpinBox)
    spin.setValue(3)
    click(qtbot, find_by_accessible_name(pane, "Apply the concurrency limit", QPushButton))
    click(qtbot, find_by_accessible_name(pane, "Stop the queue", QPushButton))
    settle(qtbot)

    assert raised == [
        (CONTROL_AUTOMATIC, "on"),
        (CONTROL_CONCURRENCY, "3"),
        (CONTROL_STOP, ""),
    ]
    assert {control for control, _ in raised} <= set(QUEUE_CONTROLS)

    # A queue the scheduler pushes in moves the controls without raising one.
    raised.clear()
    pane.set_queue(_queue(_decision(limits=SchedulerLimits(concurrency=7, automatic=True))))
    settle(qtbot)
    assert raised == []
    assert find_by_accessible_name(
        pane, "Schedule requirements automatically", ToggleSwitch
    ).isChecked()
    assert find_by_accessible_name(pane, "Units running at once", QSpinBox).value() == 7


@pytest.mark.unit
@verifies(SWR.SWR_3608)
def test_stopping_the_queue_says_that_work_in_flight_keeps_running(qtbot) -> None:
    """Productive use: a user stops the queue while two units are running.
    Expected outcome: the surface says the running work is untouched, before and
    after, and offers to start the queue again."""
    running = (RunningUnit(req_id="SWR-4206", unit_id="unit-1", run_id="run-1"),)
    decision = _decision(
        ScheduledRequirement.from_units(_units("SWR-4207", "unit-1")),
        running=running,
    )
    queue = _queue(decision)
    pane = _pane(qtbot, queue)

    assert STOP_NOTE in _texts(pane)
    stop = find_by_accessible_name(pane, "Stop the queue", QPushButton)
    assert stop.toolTip() == STOP_NOTE

    stopped = _queue(
        _decision(
            ScheduledRequirement.from_units(_units("SWR-4207", "unit-1")),
            limits=SchedulerLimits(concurrency=4, stopped=True),
            running=running,
        ),
    )
    pane.set_queue(stopped)
    settle(qtbot)

    assert stopped.stopped is True
    assert "The queue is stopped" in pane.summary.text()
    assert STOP_NOTE in _texts(pane)
    # The candidate is held *because* of the stop, and says so.
    assert any("queue-stopped" in candidate.hold_reason for candidate in stopped.held)
    restart = find_by_accessible_name(pane, "Start the queue", QPushButton)
    raised: list[tuple[str, str]] = []
    pane.control_requested.connect(lambda control, value: raised.append((control, value)))
    click(qtbot, restart)
    settle(qtbot)
    assert raised == [(CONTROL_START, "")]


@pytest.mark.unit
@verifies(SWR.SWR_3608)
def test_holding_a_requirement_needs_a_stated_reason(qtbot) -> None:
    """Productive use: a user holds a requirement they do not want run yet.
    Expected outcome: the hold is unavailable until the reason is written, with
    the reason for *that* stated, and then it carries the user's words."""
    decision = _decision(ScheduledRequirement.from_units(_units("SWR-4208", "unit-1")))
    pane = _pane(qtbot, _queue(decision))
    held: list[tuple[str, str]] = []
    pane.hold_requested.connect(lambda req_id, reason: held.append((req_id, reason)))

    click(qtbot, find_by_accessible_name(pane, "Hold SWR-4208", QPushButton))
    settle(qtbot)

    confirm = find_by_accessible_name(pane, "Confirm holding SWR-4208", QPushButton)
    assert confirm.isEnabled() is False
    assert confirm.toolTip() == HOLD_REASON_REQUIRED
    type_text(qtbot, find_by_accessible_name(pane, "Why SWR-4208 is held"), "waiting for the API")
    settle(qtbot)
    assert confirm.isEnabled() is True
    click(qtbot, confirm)
    settle(qtbot)

    assert held == [("SWR-4208", "waiting for the API")]
    assert pane.holding == ""


@pytest.mark.unit
@verifies(SWR.SWR_3608, SWR.SWR_3612)
def test_a_running_unit_opens_where_it_already_lives(qtbot) -> None:
    """Productive use: a user follows a running unit into its transcript.
    Expected outcome: the queue raises the session and the branch, and draws no
    transcript and no worktree list of its own."""
    record = RunRecord(
        run_id="run-1",
        req_id="SWR-4209",
        unit_id="unit-1",
        session_id="session-run-1",
        branch="rotaris/req/swr-4209/unit-1",
        outcome=RunOutcome.RUNNING,
        started_at=NOW,
    )
    decision = _decision(
        running=(RunningUnit(req_id="SWR-4209", unit_id="unit-1", run_id="run-1"),),
    )
    pane = _pane(qtbot, _queue(decision, (record.to_view(),)))
    sessions: list[str] = []
    branches: list[str] = []
    pane.open_run_requested.connect(sessions.append)
    pane.open_commit_requested.connect(branches.append)

    click(
        qtbot,
        find_by_accessible_name(
            pane, "Open the session of run-1 in the Workspace view", QPushButton
        ),
    )
    click(
        qtbot,
        find_by_accessible_name(
            pane,
            "Open rotaris/req/swr-4209/unit-1 in the Git view",
            QPushButton,
        ),
    )
    settle(qtbot)

    assert sessions == ["session-run-1"]
    assert branches == ["rotaris/req/swr-4209/unit-1"]


@pytest.mark.unit
@verifies(SWR.SWR_3608)
def test_an_empty_queue_explains_itself(qtbot) -> None:
    """Productive use: a user opens the queue before releasing anything.
    Expected outcome: the panel says it is empty and what to do, not a blank."""
    pane = _pane(qtbot, _queue(_decision()))

    rendered = _texts(pane)
    assert "Nothing is running right now." in rendered
    assert "Nothing is held back." in rendered
    assert any("Nothing is queued" in text for text in rendered)


@pytest.mark.unit
@verifies(SWR.SWR_3608)
def test_the_queue_is_announced_readable_and_keyboard_reachable(qtbot) -> None:
    """Productive use: a screen-reader and keyboard user holds the queue.
    Expected outcome: every control announces a name, every label clears its
    WCAG AA ratio, and the controls are reachable without a mouse (SWR-3314)."""
    decision = _decision(
        ScheduledRequirement.from_units(
            _units("SWR-4210", "unit-1", "unit-2", depends_on=("unit-1",))
        ),
    )
    pane = _pane(qtbot, _queue(decision))

    unnamed = unnamed_controls(pane)
    assert not unnamed, f"the queue has silent control(s): {unnamed}"
    violations = text_contrast_violations(pane)
    assert not violations, "unreadable text on the queue surface:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(item) for item in violations})
    )

    assert (
        find_by_accessible_name(
            pane, "Schedule requirements automatically", ToggleSwitch, visible_only=True
        ).focusPolicy()
        != Qt.FocusPolicy.NoFocus
    ), "the automatic-scheduling switch cannot be tabbed to"
    for name in (
        "Units running at once",
        "Apply the concurrency limit",
        "Stop the queue",
        "Hold SWR-4210",
    ):
        control = find_by_accessible_name(pane, name, visible_only=True)
        assert control.focusPolicy() != Qt.FocusPolicy.NoFocus, f"{name} cannot be tabbed to"

    # Escape takes an unconfirmed hold back rather than leaving it armed.
    pane.begin_hold("SWR-4210")
    settle(qtbot)
    assert find_by_accessible_name(pane, "Why SWR-4210 is held").hasFocus()
    qtbot.keyClick(pane, Qt.Key.Key_Escape)
    settle(qtbot)
    assert pane.holding == ""


# ── SWR-3608: the limit is enforced, and persisted (SWR-3117) ──────────────


@verifies(SWR.SWR_3608)
def test_changing_the_concurrency_limit_reaches_the_scheduler_and_is_persisted(
    tmp_path: Path,
) -> None:
    """Productive use: a user lowers how much Rotaris runs at once.
    Expected outcome: the next scheduling pass queues the third unit for exactly
    that reason, and the next launch reads the same limit from the config."""
    controls = SchedulingControls(tmp_path)
    assert controls.limits.concurrency == 2  # the schema's documented default

    limits = controls.apply(CONTROL_CONCURRENCY, "2")
    decision = schedule(
        [
            ScheduledRequirement.from_units(_units(f"SWR-42{index}", "unit-1"))
            for index in (10, 11, 12)
        ],
        limits=limits,
        at=NOW,
    )

    # Enforced by the engine: two selected, the third held for the limit.
    assert len(decision.selected) == 2
    assert decision.reasons == {"unit-1": HoldReason.CONCURRENCY_LIMIT}
    held = decision.held[0]
    assert "the limit is 2" in held.detail

    # …and persisted where the next launch reads it (SWR-3117).
    path = controls.path
    assert path is not None and path.exists()
    written = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert written["requirements"]["scheduling"]["max_concurrent_units"] == 2
    assert load_scheduling_limits(tmp_path).concurrency == 2
    assert SchedulingControls(tmp_path).limits.concurrency == 2


@verifies(SWR.SWR_3608)
def test_enabling_automatic_scheduling_survives_a_restart_and_keeps_the_rest(
    tmp_path: Path,
) -> None:
    """Productive use: a user turns automatic scheduling on once.
    Expected outcome: the choice is in the workspace config next launch, and the
    settings the queue panel knows nothing about are still there."""
    config = tmp_path / ".rotaris" / "agents.yaml"
    config.parent.mkdir(parents=True)
    config.write_text(
        yaml.safe_dump(
            {
                "default_persona": "engineer",
                "requirements": {
                    "enabled": True,
                    "scheduling": {"mode": "manual", "avoid_file_conflicts": False},
                },
            },
        ),
        encoding="utf-8",
    )
    controls = SchedulingControls(tmp_path)
    assert controls.limits.automatic is False

    controls.apply(CONTROL_AUTOMATIC, "on")

    written = yaml.safe_load(config.read_text(encoding="utf-8"))
    assert written["requirements"]["scheduling"]["mode"] == "automatic"
    # Field-wise, not a rewrite: everything else the file held is still there.
    assert written["default_persona"] == "engineer"
    assert written["requirements"]["enabled"] is True
    assert written["requirements"]["scheduling"]["avoid_file_conflicts"] is False
    assert load_scheduling_limits(tmp_path).automatic is True
    # Stopping is a decision about now, so it never reaches the file.
    controls.apply(CONTROL_STOP, "")
    assert controls.limits.stopped is True
    assert load_scheduling_limits(tmp_path).stopped is False


@verifies(SWR.SWR_3608)
def test_an_unreadable_configuration_degrades_to_the_documented_default(
    tmp_path: Path,
) -> None:
    """Productive use: the workspace config is half-edited when the board opens.
    Expected outcome: the queue uses the documented default rather than raising
    on the Qt thread."""
    config = tmp_path / ".rotaris" / "agents.yaml"
    config.parent.mkdir(parents=True)
    config.write_text("requirements: [not, a, mapping\n", encoding="utf-8")

    limits = load_scheduling_limits(tmp_path)

    assert limits.concurrency == 2
    assert limits.automatic is False
    # …and a workspace with no configuration at all behaves the same way.
    assert load_scheduling_limits(None).automatic is False


# ── the user flow ──────────────────────────────────────────────────────────


@pytest.mark.e2e
@verifies(SWR.SWR_3608)
def test_a_user_turns_on_automatic_scheduling_and_holds_the_third_requirement(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: a user lets Rotaris schedule, watches two units run and
    holds the third back.
    Expected outcome: the choice is persisted, both runs are shown and untouched,
    and the third requirement is blocked with the reason the user gave."""
    workspace = _Workspace(tmp_path / "ws", [_requirement(f"SWR-431{n}") for n in (1, 2, 3)])
    for req_id in ("SWR-4311", "SWR-4312"):
        workspace.advance(req_id, DeliveryState.READY, DeliveryState.RUNNING)
        workspace.start_run(req_id, run_id=f"run-{req_id[-1]}")
    workspace.advance("SWR-4313", DeliveryState.READY)
    scheduling = SchedulingControls(tmp_path / "ws")
    controller, view, pane, store = _board(qtbot, workspace, scheduling)

    assert open_queue(controller) is True
    assert view.page == QUEUE_PANE
    # Whatever owns a live scheduler hears the instruction too (SWR-3608).
    raised: list[tuple[str, str]] = []
    controller.queue_control_requested.connect(
        lambda control, value: raised.append((control, value)),
    )

    click(qtbot, find_by_accessible_name(pane, "Schedule requirements automatically", ToggleSwitch))
    settle(qtbot)

    assert raised == [(CONTROL_AUTOMATIC, "on")]
    assert scheduling.limits.automatic is True
    assert load_scheduling_limits(tmp_path / "ws").automatic is True
    assert pane.queue.automatic is True
    assert "Automatic scheduling is on" in pane.summary.text()

    # …and gives it room for a third unit, through the visible control.
    find_by_accessible_name(pane, "Units running at once", QSpinBox).setValue(3)
    click(qtbot, find_by_accessible_name(pane, "Apply the concurrency limit", QPushButton))
    settle(qtbot)
    assert scheduling.limits.concurrency == 3

    # The scheduler decides with exactly those limits, and the panel shows that
    # decision: two in flight, one candidate left.
    running = tuple(
        RunningUnit(req_id=req_id, unit_id="unit-1", run_id=f"run-{req_id[-1]}")
        for req_id in ("SWR-4311", "SWR-4312")
    )
    decision = schedule(
        [ScheduledRequirement.from_units(_units("SWR-4313", "unit-1"))],
        limits=scheduling.limits,
        running=running,
        at=NOW,
    )
    assert decision.selected_units == ("unit-1",)
    runs = tuple(
        workspace.history.load(req_id).to_views()[0] for req_id in ("SWR-4311", "SWR-4312")
    )
    store.set_requirements_queue(_queue(decision, runs))
    settle(qtbot)

    assert len(pane.queue.running) == 2
    rendered = " · ".join(_texts(pane))
    assert "run-1" in rendered
    assert "run-2" in rendered

    # The third is held, by the user, with a stated reason.
    click(qtbot, find_by_accessible_name(pane, "Hold SWR-4313", QPushButton))
    settle(qtbot)
    type_text(
        qtbot,
        find_by_accessible_name(pane, "Why SWR-4313 is held"),
        "waiting for the API decision",
    )
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click(qtbot, find_by_accessible_name(pane, "Confirm holding SWR-4313", QPushButton))
    settle(qtbot)

    record = workspace.store.read("SWR-4313")
    assert record.state is DeliveryState.BLOCKED
    assert record.delivery.blocked_reason == "waiting for the API decision"
    assert record.delivery.changed_by is not None
    assert record.delivery.changed_by.name == "dvf"
    # Holding one requirement cancels nothing that is already running.
    for req_id in ("SWR-4311", "SWR-4312"):
        assert workspace.store.read(req_id).state is DeliveryState.RUNNING
        assert workspace.history.load(req_id).in_flight != ()
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3608)
def test_a_user_releases_a_held_requirement_back_to_where_it_was(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: the reason a requirement was held is gone.
    Expected outcome: releasing it returns it to the state it was held in, and
    the queue offers the release with its consequence stated."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4314")])
    workspace.advance("SWR-4314", DeliveryState.READY)
    scheduling = SchedulingControls(tmp_path / "ws")
    controller, _view, pane, store = _board(qtbot, workspace, scheduling)
    open_queue(controller)
    store.set_requirements_queue(
        _queue(_decision(ScheduledRequirement.from_units(_units("SWR-4314", "unit-1")))),
    )
    settle(qtbot)

    # Hold it first, through the same surface.
    click(qtbot, find_by_accessible_name(pane, "Hold SWR-4314", QPushButton))
    settle(qtbot)
    type_text(qtbot, find_by_accessible_name(pane, "Why SWR-4314 is held"), "blocked on design")
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click(qtbot, find_by_accessible_name(pane, "Confirm holding SWR-4314", QPushButton))
    settle(qtbot)
    assert workspace.store.read("SWR-4314").state is DeliveryState.BLOCKED

    held = build_queue_state(
        _decision(  # type: ignore[attr-defined]
            ScheduledRequirement.from_units(
                _units("SWR-4314", "unit-1"),
                state=DeliveryState.BLOCKED,
            ),
        ).to_queue_view(),
    )
    store.set_requirements_queue(held)
    settle(qtbot)
    release = find_by_accessible_name(pane, "Release SWR-4314", QPushButton)
    assert "returns the requirement to the state it was blocked in" in release.toolTip()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click(qtbot, release)
    settle(qtbot)

    assert workspace.store.read("SWR-4314").state is DeliveryState.READY
    assert "Release SWR-4314" not in accessible_names(pane, QPushButton, visible_only=True)
    controller.shutdown()


# ── SWR-3315: the board is the way into the queue ──────────────────────────


@pytest.mark.integration
@verifies(SWR.SWR_3608, SWR.SWR_3315)
def test_the_board_opens_the_queue_without_anybody_wiring_one(qtbot, tmp_path: Path) -> None:
    """Productive use: a user asks what Rotaris is about to run.
    Expected outcome: the board's own control opens the queue — a scheduler that
    cannot be reached is as opaque as one that cannot be stopped — and the
    surface is built once, not once per click."""
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4230")])
    store = WorkspaceStore()
    controller = RequirementsController(
        store,
        source=_BoardSource(workspace),
        workspace=tmp_path / "ws",
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

    assert QUEUE_PANE not in view.panes, "nothing has attached a queue yet"
    assert "queue_requested" in controller.connected_action_signals

    click(qtbot, find_by_accessible_name(view, "Show the delivery queue", QPushButton))
    settle(qtbot)

    assert QUEUE_PANE in view.panes, "the area installs the surface it owns (SWR-3315)"
    assert view.page == QUEUE_PANE, "the control brings the queue to the front"
    assert controller.install_queue() is False, "a second click reuses the pane"
    # …and the control the queue offers still reaches the scheduler from here.
    controls: list[tuple[str, str]] = []
    controller.queue_control_requested.connect(lambda *args: controls.append(args))
    controller.control_queue(CONTROL_STOP, "1")
    assert controls == [(CONTROL_STOP, "1")]
    controller.shutdown()


@pytest.mark.unit
@verifies(SWR.SWR_3608, SWR.SWR_3315)
def test_the_controller_and_the_queue_agree_on_the_pane_key() -> None:
    """Productive use: somebody renames the queue pane's key.
    Expected outcome: the mismatch is named here rather than as a queue the
    board opens twice."""
    assert requirements_controller._QUEUE_PANE == QUEUE_PANE  # noqa: SLF001 — the mirror


# -- SWR-3608: the controls bound what actually starts ----------------------


class _GuardedWriter:
    """A transition port with the guard the flow requires, and no store."""

    enforces_specification_guard = True

    def apply(self, request: TransitionRequest) -> object:  # pragma: no cover - never reached
        raise AssertionError("a refused release never reaches the write path")

    def record_event(self, event: object) -> object:  # pragma: no cover - never reached
        raise AssertionError("a refused release never records anything")


def _starter(workspace: Path, controls: SchedulingControls, *, dispatch: object) -> object:
    """The shipped run starter, bound to *controls* the way `attach_queue` binds it."""
    from rotaris.services.requirements_actions import FlowRunStarter

    starter = FlowRunStarter(
        workspace,
        transitions=_GuardedWriter(),
        current_for=lambda req_id: _requirement(req_id),
        dispatch=dispatch,
    )
    starter.follow(lambda: controls.limits)
    return starter


@verifies(SWR.SWR_3608)
def test_a_stopped_queue_stops_the_next_release_from_starting_a_run(tmp_path: Path) -> None:
    """Productive use: a user stops the queue and then drops a card on Ready.
    Expected outcome: nothing starts, and the refusal says the queue is stopped."""
    from rotaris.services.requirements_actions import RunRefusedError

    controls = SchedulingControls(tmp_path)
    started: list[str] = []
    starter = _starter(tmp_path, controls, dispatch=lambda work: started.append("ran"))

    controls.apply(CONTROL_STOP)
    with pytest.raises(RunRefusedError) as refused:
        starter.start("SWR-4230")
    assert "stopped" in str(refused.value)
    assert started == [], "a stopped queue starts nothing at all"

    # Starting the queue again releases the same drop, without a restart.
    controls.apply(CONTROL_START)
    flow_id = starter.start("SWR-4230")
    assert flow_id
    assert started == ["ran"]


@verifies(SWR.SWR_3608, SWR.SWR_3412)
def test_the_concurrency_limit_queues_the_release_that_would_exceed_it(
    tmp_path: Path,
) -> None:
    """Productive use: two requirements are released while the limit is one.
    Expected outcome: the second does not start, is told so naming the limit the user
    set, and stays in the queue — SWR-3412's limit queues, it never rejects."""
    from rotaris.services.requirements_actions import RunRefusedError

    controls = SchedulingControls(tmp_path)
    controls.apply(CONTROL_CONCURRENCY, "1")
    assert load_scheduling_limits(tmp_path).concurrency == 1, "the limit is persisted"
    # A dispatcher that never runs the work is a flow that is still in flight.
    starter = _starter(tmp_path, controls, dispatch=lambda work: None)

    first = starter.start("SWR-4231")
    # The two vocabularies, asserted side by side: `start` answers with a flow
    # id, `flows_in_flight` speaks flow ids and `in_flight` speaks requirement
    # ids — which is what the recovery pass compares against (SWR-3611). One
    # property serving both readers is what let flow ids reach that comparison,
    # where they matched nothing and every dispatched flow was closed as
    # abandoned within the second.
    assert first in starter.flows_in_flight  # type: ignore[attr-defined]
    assert starter.in_flight == ("SWR-4231",)  # type: ignore[attr-defined]
    with pytest.raises(RunRefusedError) as refused:
        starter.start("SWR-4232")
    assert "in flight" in str(refused.value)
    assert "1" in str(refused.value), "the refusal names the limit the user set"
    assert "SWR-4232" in starter.queued  # type: ignore[attr-defined]

    controls.apply(CONTROL_CONCURRENCY, "2")
    assert starter.start("SWR-4232"), "raising the limit releases the next one"
    assert "SWR-4232" not in starter.queued  # type: ignore[attr-defined]


@verifies(SWR.SWR_3419)
def test_a_target_branch_this_project_does_not_have_refuses_the_release(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: the target branch is mistyped in agents.yaml and a user drops a card on Ready.
    Expected outcome: the board says which branch, and nothing was started — no worktree, no agent
    run, and no failure at promotion time that names git instead of the setting."""
    import rotaris_core.requirements.execution.target as target_module
    from rotaris_core.requirements.execution.target import TargetBranchError

    from rotaris.services.requirements_actions import RunRefusedError

    def missing(_workspace: Path, **_kwargs: object) -> object:
        raise TargetBranchError(
            "the configured target branch 'develop' does not exist in this workspace;"
            " requirement work is based on and lands on it, so nothing was created"
            " (requirements.execution.target_branch, SWR-3419)",
            declared=True,
        )

    monkeypatch.setattr(target_module, "target_branch_for", missing)

    controls = SchedulingControls(tmp_path)
    started: list[str] = []
    starter = _starter(tmp_path, controls, dispatch=lambda work: started.append("ran"))

    with pytest.raises(RunRefusedError) as refused:
        starter.start("SWR-4233")

    assert "develop" in str(refused.value)
    assert "target_branch" in str(refused.value)
    assert started == [], "a release refused on its target branch dispatches nothing"
