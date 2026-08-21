"""Releasing a requirement whose dependencies have not landed (SWR-3622, SWR-3623).

The defect these tests exist for is a drop that told the user nothing. SWR-3510's
dependency gate was pure, tested and **constructed nowhere**: a card in ``Backlog``
whose ``depends-on`` target had not been delivered carried no blocker at all, the
drop on ``Ready`` was accepted, a run was dispatched, and the wait first became
visible as a scheduler hold on a unit nobody was looking at.

Two claims, tested separately:

* the gate is now *on the board* — a projection carries it, a card carries what it
  waits for, and a drop that would start a run against it asks first (SWR-3622);
* the chain above a held requirement is resolved so the user can act on it: they
  can go to a blocker, or start at the root, and neither of those is the release
  they asked for (SWR-3623).

Everything below writes through the **real** delivery store and the real guarded
write path. Two things are faked, and both are external systems by the definition
in ``apps/rotaris/AGENTS.md``: the agent a run would drive, and the prompt the user
answers — the latter through the controller's own ``release_prompt`` seam, because
an unanswered modal blocks the thread that opened it.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import QMimeData, QPoint, Qt
from PySide6.QtGui import QDropEvent
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.dependencies import plan_release
from rotaris_core.requirements.delivery.completion import (
    CompletionEvidence,
    CoveringTestEvidence,
    UnitEvidence,
    UnitExecution,
    completion_gate,
)
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, capture_snapshot
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import settle

from rotaris.models.requirements_state import build_release_hold
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_actions import RequirementActions, waiting_for_dependencies
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import REQUIREMENT_MIME, RequirementsView
from rotaris.widgets.release_blockers_dialog import (
    EXPLANATION,
    ReleaseBlockerChoice,
    ReleaseBlockerDecision,
    ReleaseBlockersDialog,
)

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

    from rotaris_core.requirements.delivery.projection import BoardProjection

    from rotaris.models.requirements_state import ReleaseHold

pytestmark = pytest.mark.integration

NOW = dt.datetime(2026, 8, 22, 12, 0, tzinfo=dt.UTC)

#: A line of three. TOP is what the user drags; ROOT is what they should work on.
ROOT = "SWR-501"
MIDDLE = "SWR-502"
TOP = "SWR-503"


# ── the smallest real board with a dependency in it ────────────────────────


def _requirement(req_id: str, *, depends_on: tuple[str, ...] = ()) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
        relations=tuple(
            Relation(kind=RelationKind.DEPENDS_ON, target=target) for target in depends_on
        ),
    )


class _Workspace:
    """A real delivery store and the real guarded write path over it."""

    def __init__(self, root: Path, requirements: Iterable[CanonicalRequirement]) -> None:
        self.root = root
        self.requirements = {item.req_id: item for item in requirements}
        self.store = DeliveryStore(root)
        self.writer = ExecutionTransitions.for_workspace(
            root,
            current_for=self.requirements.get,
            completion=completion_gate(
                lambda record, request: self._evidence(request.req_id),
            ),
        )

    def _evidence(self, req_id: str) -> CompletionEvidence:
        """Evidence that satisfies every condition of SWR-3215.

        A dependency only counts as met once it is genuinely ``Done``, so a test
        about the gate has to be able to *get* one there — through the real
        completion conditions, not around them.
        """
        current = self.hash_for(req_id)
        return CompletionEvidence(
            req_id=req_id,
            current_hash=current,
            satisfied_hash=current,
            units=(UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),),
            implementation_traces=(f"src/rotaris_core/{req_id.lower()}.py:12",),
            covering_tests=(
                CoveringTestEvidence(
                    path=f"tests/unit/test_{req_id.lower()}.py",
                    line=40,
                    executed=True,
                    passed=True,
                ),
            ),
            gate_passed=True,
            integration_complete=True,
        )

    def hash_for(self, req_id: str) -> str:
        requirement = self.requirements.get(req_id)
        return requirement.current_hash if requirement is not None else ""

    def state_of(self, req_id: str) -> DeliveryState:
        return self.store.read(req_id).state

    def delivery_for(self, req_id: str) -> SatisfiedDelivery | None:
        if req_id not in self.requirements:
            return None
        return SatisfiedDelivery.from_snapshot(
            capture_snapshot(
                self.requirements[req_id],
                run_id="run-0",
                base_commit="a1b2c3d",
                at=NOW,
                unit_id="unit-1",
                session_id=f"session-{req_id.lower()}",
            ),
            run_id="run-0",
            at=NOW,
        )

    def advance(self, req_id: str, *states: DeliveryState) -> None:
        """Walk the engine's own transitions, so the record really reaches *states*."""
        causes = {
            DeliveryState.READY: TransitionCause.USER_ACTION,
            DeliveryState.RUNNING: TransitionCause.RUN_STARTED,
            DeliveryState.REVIEW: TransitionCause.RUN_COMPLETED,
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
                    delivery=self.delivery_for(req_id) if state is DeliveryState.DONE else None,
                ),
            )
            assert outcome.accepted, outcome.message

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


class _RecordingRuns:
    """A run starter that records what the board asked it to start."""

    def __init__(self) -> None:
        self.started: list[str] = []

    def start(self, req_id: str, *, instructions: str = "") -> str:
        del instructions
        self.started.append(req_id)
        return f"run-{len(self.started)}"


class _Answer:
    """Answers the release prompt without a modal, and keeps what it was shown.

    The words rather than the widget: what the user is *told* is the acceptance
    criterion, and the hold is a plain value, so a test reads it directly instead
    of scraping labels off a dialog it also has to keep alive.
    """

    def __init__(self, choice: ReleaseBlockerChoice, target: str = "") -> None:
        self._decision = ReleaseBlockerDecision(choice, target)
        self.shown: list[ReleaseHold] = []

    def __call__(self, hold: ReleaseHold) -> ReleaseBlockerDecision:
        self.shown.append(hold)
        return self._decision


def _chain(tmp_path: Path) -> _Workspace:
    """TOP waits for MIDDLE waits for ROOT, and none of them is delivered."""
    return _Workspace(
        tmp_path,
        (
            _requirement(ROOT),
            _requirement(MIDDLE, depends_on=(ROOT,)),
            _requirement(TOP, depends_on=(MIDDLE,)),
        ),
    )


def _board(
    qtbot,
    workspace: _Workspace,
    answer: _Answer | None = None,
) -> tuple[RequirementsController, RequirementsView, _RecordingRuns]:
    """A controller over a real board and view, wired the way the window wires them."""
    controller = RequirementsController(
        WorkspaceStore(),
        source=_BoardSource(workspace),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    if answer is not None:
        controller.release_prompt = answer

    runs = _RecordingRuns()
    controller.attach_actions(
        RequirementActions(
            workspace.writer,
            runs=runs,  # type: ignore[arg-type]
            hash_for=workspace.hash_for,
            delivery_for=workspace.delivery_for,
            actor_name="dvf",
            clock=lambda: NOW,
        ),
    )
    _evaluate(qtbot, controller)
    qtbot.waitUntil(lambda: not view.populating, timeout=20000)
    return controller, view, runs


def _feedback(controller: RequirementsController, req_id: str):
    """The standing feedback for one requirement, as the board published it."""
    return controller._store.requirements.feedback_for(req_id)  # noqa: SLF001


def _evaluate(qtbot, controller: RequirementsController) -> None:
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)


def _drop_on_ready(view: RequirementsView, req_id: str) -> None:
    """The gesture itself: drag *req_id* out of its column and drop it on Ready."""
    view.begin_drag(req_id)
    ready = view.column_widget("ready")
    assert ready is not None
    mime = QMimeData()
    mime.setData(REQUIREMENT_MIME, req_id.encode())
    mime.setText(req_id)
    ready.dropEvent(
        QDropEvent(
            QPoint(10, 10),
            Qt.DropAction.MoveAction,
            mime,
            Qt.MouseButton.LeftButton,
            Qt.KeyboardModifier.NoModifier,
        ),
    )


# ── the gate reaches the board at all (SWR-3622 AC-1) ──────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3622)
def test_the_projection_says_which_requirements_are_waiting(tmp_path: Path) -> None:
    """Productive use: the user opens the board and Rotaris knows, per requirement,
    whether its dependencies have landed.
    Expected outcome: the projection carries SWR-3510's verdict for every entry, the
    held ones name what they wait for, and a delivered-and-current dependency
    releases its dependant."""
    workspace = _chain(tmp_path)
    projection = workspace.project()

    top = projection.entry(TOP)
    assert top is not None
    assert top.dependency.blocked is True
    assert top.dependency.blocked_by == (MIDDLE,)
    assert projection.entry(ROOT).dependency.blocked is False  # type: ignore[union-attr]
    assert projection.dependencies.blocked_ids == (MIDDLE, TOP)

    # Delivering the root releases the middle, and nothing else has to happen.
    workspace.advance(ROOT, DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.advance(ROOT, DeliveryState.DONE)
    assert workspace.project().dependencies.blocked_ids == (TOP,)


@pytest.mark.unit
@verifies(SWR.SWR_3622)
def test_a_held_card_carries_what_it_waits_for_without_alerting_about_it(
    tmp_path: Path,
) -> None:
    """A dependency that has not landed is the normal shape of a plan, not an alarm.

    It is on the card so the drag indicator and the release can read it, and out of
    the alerts so a backlog of a hundred planned requirements does not paint itself
    red.
    """
    from rotaris.models.requirements_state import build_board_state

    state = build_board_state(_chain(tmp_path).project(), now=NOW)

    top = state.card(TOP)
    assert top is not None
    assert top.waits_for == (MIDDLE,)
    assert not any("Blocked" in alert for alert in top.alerts)
    # It is still a *fact* about the requirement, which is what the detail
    # view and the card's fact list have always shown — but not an alert.
    assert any(fact.label == "Depends on" for fact in top.facts)
    assert state.card(ROOT).waits_for == ()  # type: ignore[union-attr]


@pytest.mark.unit
@verifies(SWR.SWR_3622)
def test_the_ready_column_states_the_unmet_dependencies_while_the_card_is_in_the_air(
    qtbot,
    tmp_path: Path,
) -> None:
    """AC-6: a card that only learns this after the drop teaches nothing.

    The rail still reads ``→`` — the transition matrix has nothing to say about
    dependencies — but what it says will happen is a question, not a run.
    """
    controller, _view, _runs = _board(qtbot, _chain(tmp_path))

    ready = next(option for option in controller.move_options_for(TOP) if option.target == "ready")

    assert ready.reachable is True
    assert ready.indicator == "→"
    assert ready.consequence == waiting_for_dependencies((MIDDLE,))
    assert MIDDLE in ready.sentence
    assert "You will be asked before anything starts." in ready.sentence
    # A requirement nothing holds keeps the plain release consequence.
    root_ready = next(
        option for option in controller.move_options_for(ROOT) if option.target == "ready"
    )
    assert "Releases this requirement for agentic implementation" in root_ready.consequence


# ── the drop asks (SWR-3622 AC-1, AC-2) ────────────────────────────────────


@verifies(SWR.SWR_3622)
def test_a_drop_on_ready_asks_before_it_starts_a_run_against_an_unmet_dependency(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: the user drags a requirement whose foundation is not built yet.
    Expected outcome: nothing is started and nothing is moved until they answer, and
    what they are shown is the dependency gate's own sentence rather than a board-side
    paraphrase of it."""
    workspace = _chain(tmp_path)
    answer = _Answer(ReleaseBlockerChoice.CANCEL)
    _controller, view, runs = _board(qtbot, workspace, answer)

    _drop_on_ready(view, TOP)
    settle(qtbot)

    assert len(answer.shown) == 1
    hold = answer.shown[0]
    assert hold.req_id == TOP
    assert [held.req_id for held in hold.held_by] == [MIDDLE]
    # Carried verbatim: the gate says *why*, and "Blocked" on its own would move
    # the work of finding out onto the user (SWR-3510).
    assert hold.held_by[0].sentence == f"{MIDDLE} is Backlog, not Done"
    assert runs.started == []
    assert workspace.state_of(TOP) is DeliveryState.BACKLOG


@verifies(SWR.SWR_3622)
def test_a_requirement_whose_dependency_landed_is_released_without_being_asked(
    qtbot,
    tmp_path: Path,
) -> None:
    """The gate only stops what it holds: a met dependency costs the user nothing."""
    workspace = _chain(tmp_path)
    workspace.advance(ROOT, DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.advance(ROOT, DeliveryState.DONE)
    answer = _Answer(ReleaseBlockerChoice.CANCEL)
    _controller, view, runs = _board(qtbot, workspace, answer)

    _drop_on_ready(view, MIDDLE)
    settle(qtbot)

    assert answer.shown == []
    assert runs.started == [MIDDLE]
    assert workspace.state_of(MIDDLE) is DeliveryState.READY


@verifies(SWR.SWR_3622)
def test_releasing_anyway_starts_the_run_the_user_asked_for(qtbot, tmp_path: Path) -> None:
    """AC-3: the gate informs; the user decides. Nothing about the release changes."""
    workspace = _chain(tmp_path)
    answer = _Answer(ReleaseBlockerChoice.RELEASE_ANYWAY)
    _controller, view, runs = _board(qtbot, workspace, answer)

    _drop_on_ready(view, TOP)
    settle(qtbot)

    assert len(answer.shown) == 1
    assert runs.started == [TOP]
    assert workspace.state_of(TOP) is DeliveryState.READY


@verifies(SWR.SWR_3622)
def test_cancelling_writes_nothing_and_says_so(qtbot, tmp_path: Path) -> None:
    """AC-5: a dismissal is a refusal, and a refusal leaves the card where it was."""
    workspace = _chain(tmp_path)
    controller, view, runs = _board(qtbot, workspace, _Answer(ReleaseBlockerChoice.CANCEL))

    _drop_on_ready(view, TOP)
    settle(qtbot)

    assert runs.started == []
    assert workspace.state_of(TOP) is DeliveryState.BACKLOG
    feedback = _feedback(controller, TOP)
    assert feedback is not None
    assert feedback.accepted is False
    assert "Nothing was started and nothing moved" in feedback.reason
    assert MIDDLE in feedback.reason


@verifies(SWR.SWR_3622, SWR.SWR_3317)
def test_take_me_to_the_blocker_shows_that_card_and_moves_nothing(
    qtbot,
    tmp_path: Path,
) -> None:
    """AC-4: the answer to "what is in the way" has to be reachable, not just named.

    The board already knows how to go to a card it holds — open its column, scroll
    to it, realise it and focus it (SWR-3317, SWR-3321) — so this checks that the
    gate asks for that rather than reimplementing four steps of it.
    """
    workspace = _chain(tmp_path)
    controller, view, runs = _board(
        qtbot,
        workspace,
        _Answer(ReleaseBlockerChoice.NAVIGATE, MIDDLE),
    )

    _drop_on_ready(view, TOP)
    settle(qtbot)

    assert view.selected_req_id == MIDDLE
    assert view.reveal(MIDDLE) is not None
    assert runs.started == []
    assert workspace.state_of(TOP) is DeliveryState.BACKLOG
    assert workspace.state_of(MIDDLE) is DeliveryState.BACKLOG
    feedback = _feedback(controller, TOP)
    assert feedback is not None
    assert f"Showing {MIDDLE}" in feedback.reason


# ── the chain, and its root (SWR-3623) ─────────────────────────────────────


@verifies(SWR.SWR_3623, SWR.SWR_3600)
def test_handling_the_blockers_first_releases_the_root_and_leaves_the_card(
    qtbot,
    tmp_path: Path,
) -> None:
    """Productive use: the user wants TOP, and would rather Rotaris told them where
    to start than make them follow ``depends-on`` links by hand.
    Expected outcome: the root of the chain — two links up — is released and its run
    starts; TOP has not moved, and nothing in between has either."""
    workspace = _chain(tmp_path)
    answer = _Answer(ReleaseBlockerChoice.HANDLE_FIRST, ROOT)
    _controller, view, runs = _board(qtbot, workspace, answer)

    _drop_on_ready(view, TOP)
    settle(qtbot)

    # Named before it was released: the button the user pressed said which one.
    assert answer.shown[0].root == ROOT
    assert answer.shown[0].chain == (ROOT, MIDDLE, TOP)
    assert answer.shown[0].chain_sentence == f"{ROOT} → {MIDDLE} → {TOP}"

    assert runs.started == [ROOT]
    assert workspace.state_of(ROOT) is DeliveryState.READY
    assert workspace.state_of(MIDDLE) is DeliveryState.BACKLOG
    assert workspace.state_of(TOP) is DeliveryState.BACKLOG
    # Asked once. The root is unblocked by construction, so releasing it must not
    # raise the prompt a second time.
    assert len(answer.shown) == 1


@verifies(SWR.SWR_3623)
def test_the_board_says_when_a_deferred_release_is_no_longer_held(
    qtbot,
    tmp_path: Path,
) -> None:
    """AC-5: told, never started.

    The user put their own release off to deal with the chain. When the chain
    clears they should not have to poll a board of several hundred cards to find
    out — and the gesture that starts an unattended run is still theirs to make.
    """
    workspace = _chain(tmp_path)
    controller, view, runs = _board(
        qtbot,
        workspace,
        _Answer(ReleaseBlockerChoice.NAVIGATE, ROOT),
    )
    _drop_on_ready(view, MIDDLE)
    settle(qtbot)
    deferred = _feedback(controller, MIDDLE)
    assert deferred is not None
    assert deferred.accepted is False

    workspace.advance(ROOT, DeliveryState.READY, DeliveryState.RUNNING, DeliveryState.REVIEW)
    workspace.advance(ROOT, DeliveryState.DONE)
    _evaluate(qtbot, controller)

    # The refusal that started the deferral is superseded, not joined: one card
    # must not say two contradictory things about itself (SWR-3602).
    freed = _feedback(controller, MIDDLE)
    assert freed is not None
    assert freed.accepted is True
    assert freed.title == f"{MIDDLE} is no longer waiting for anything"
    assert "Drop it on Ready to release it." in freed.reason
    # Told, not started.
    assert runs.started == []
    assert workspace.state_of(MIDDLE) is DeliveryState.BACKLOG


@pytest.mark.unit
@verifies(SWR.SWR_3623)
def test_a_root_that_cannot_be_released_is_stated_rather_than_offered(
    tmp_path: Path,
) -> None:
    """AC-4: no root is invented. A requirement already running is not released twice."""
    workspace = _chain(tmp_path)
    workspace.advance(ROOT, DeliveryState.READY, DeliveryState.RUNNING)

    hold = build_release_hold(plan_release(TOP, workspace.project().dependencies))

    assert hold.held is True
    assert hold.root == ROOT
    assert hold.resolvable is False
    assert hold.root_reason == f"{ROOT} is already Running; the work on it has started."


# ── the prompt itself (SWR-3622 AC-2, accessibility) ───────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3622)
def test_the_prompt_names_every_blocker_and_never_defaults_to_releasing(
    qtbot,
    tmp_path: Path,
) -> None:
    """What the user is actually shown, on the shipped dialog.

    Enter lands on the constructive answer. "Release anyway" starts an unattended
    run against a foundation that does not exist yet, and no keystroke should reach
    it by accident.
    """
    workspace = _chain(tmp_path)
    hold = build_release_hold(plan_release(TOP, workspace.project().dependencies))
    dialog = ReleaseBlockersDialog(hold)
    qtbot.addWidget(dialog)

    assert dialog.windowTitle() == f"{TOP} waits for {MIDDLE}"
    assert dialog.explanation.text() == EXPLANATION
    assert dialog.chain_label.isVisibleTo(dialog) is True
    assert f"{ROOT} → {MIDDLE} → {TOP}" in dialog.chain_label.text()
    assert dialog.root_button is not None
    assert dialog.root_button.text() == f"Start with {ROOT}"
    assert dialog.root_button.isDefault() is True
    assert dialog.anyway_button.isDefault() is False
    # Weighted, not just defaulted: a filled control and a bordered one are the
    # same rectangle, and "Release anyway" must not read as the recommendation.
    assert dialog.root_button.property("variant") == "primary"
    assert dialog.anyway_button.property("variant") == "secondary"
    # Where the keyboard actually lands. Enter on a *focused* button clicks that
    # one whatever is marked default, so the two have to agree.
    assert dialog.opening_focus is dialog.root_button

    # Every control says what it will cause, for a reader who cannot see which
    # one is emphasised.
    assert MIDDLE in dialog.accessibleDescription()
    assert "is Backlog, not Done" in dialog.accessibleDescription()
    assert ROOT in dialog.root_button.accessibleDescription()
    assert "is not moved" in dialog.root_button.accessibleDescription()


@pytest.mark.unit
@verifies(SWR.SWR_3622)
def test_dismissing_the_prompt_reads_as_a_refusal(qtbot, tmp_path: Path) -> None:
    """A statement a stray Escape turns into consent is not a statement at all."""
    workspace = _chain(tmp_path)
    hold = build_release_hold(plan_release(TOP, workspace.project().dependencies))
    dialog = ReleaseBlockersDialog(hold)
    qtbot.addWidget(dialog)

    dialog.reject()

    assert dialog.decision.choice is ReleaseBlockerChoice.CANCEL
    assert dialog.decision.proceeds is False


@pytest.mark.unit
@verifies(SWR.SWR_3623)
def test_a_prompt_with_no_root_says_why_instead_of_offering_a_button(
    qtbot,
    tmp_path: Path,
) -> None:
    """A cycle is a fact a user has to act on, and a missing button states nothing."""
    workspace = _Workspace(
        tmp_path,
        (
            _requirement(ROOT, depends_on=(MIDDLE,)),
            _requirement(MIDDLE, depends_on=(ROOT,)),
            _requirement(TOP, depends_on=(ROOT,)),
        ),
    )
    hold = build_release_hold(plan_release(TOP, workspace.project().dependencies))
    dialog = ReleaseBlockersDialog(hold)
    qtbot.addWidget(dialog)

    assert hold.resolvable is False
    assert dialog.root_button is None
    assert dialog.opening_focus is dialog.cancel_button
    assert dialog.no_root_label.isVisibleTo(dialog) is True
    assert f"{ROOT} → {MIDDLE} → {ROOT}" in dialog.no_root_label.text()
    assert "broken in the source" in dialog.no_root_label.text()
    # A loop has no order, so no order is printed: the arrow line here would be
    # a sequence that cannot be worked through.
    assert dialog.chain_label.isVisibleTo(dialog) is False
