"""What a requirement released on the board is allowed to do (SWR-3707).

The defect these tests exist for is a release that could not finish. A board run
is dispatched onto a worker thread with no approval host behind it, so on a
workspace at the default ``ask`` the policy engine denied its first tool and the
run reported "Execution blocked before repository work began" without touching
the repository. Raising the mode alone did not help either — SWR-2508 downgraded
it straight back, for exactly the reason that made the release unattended.

So there are two claims here and they are tested separately:

* the configuration a board run is started with carries **both** halves, and a
  run holding both is not downgraded — that is the bug, and it is checked
  against the engine's own resolver rather than against a stub of it;
* the elevation is never silent, never irreversible and never a surprise on the
  second release: it is disclosed once per launch, refusable, and switchable.

The disclosure is normally quiet in this suite (``conftest.quiet_run_permission_notice``),
because an unanswered modal blocks the thread that opened it. Every test here
turns it back on itself, which is what stops that fixture from hiding the
feature it silences.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, NamedTuple

import pytest
from PySide6.QtCore import QMimeData, QPoint, QSettings, Qt
from PySide6.QtGui import QDropEvent
from PySide6.QtWidgets import QDialog, QPushButton
from rotaris_core.config import loader as config_loader
from rotaris_core.core.waiting import WAIT_INDEFINITELY
from rotaris_core.permissions.modes import resolve_effective_mode
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.completion import CompletionEvidence, completion_gate
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import settle

from rotaris.models.store import WorkspaceStore
from rotaris.services.requirement_run_permissions import (
    FULL_PERMISSION_KEY,
    FULL_PERMISSION_MODE,
    NOTICE_SUPPRESSED_KEY,
    WAIT_BUDGET_KEY,
    WAIT_BUDGET_STOPS,
    answer_wait_seconds,
    elevated,
    full_permission_runs,
    notice_suppressed,
    set_answer_wait_seconds,
    set_full_permission_runs,
    suppress_notice,
    wait_budget_index,
)
from rotaris.services.requirements_actions import RequirementActions, board_run_config
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import REQUIREMENT_MIME, RequirementsView
from rotaris.widgets.run_permission_dialog import (
    IMPACTS,
    RunPermissionChoice,
    RunPermissionDialog,
)

if TYPE_CHECKING:
    from collections.abc import Iterable
    from pathlib import Path

    from rotaris_core.requirements.delivery.projection import BoardProjection

pytestmark = pytest.mark.integration

NOW = dt.datetime(2026, 8, 21, 12, 0, tzinfo=dt.UTC)


# ── the smallest real board that can release something ─────────────────────


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
    """A real delivery store and the real guarded write path over it."""

    def __init__(self, root: Path, requirements: Iterable[CanonicalRequirement]) -> None:
        self.root = root
        self.requirements = {item.req_id: item for item in requirements}
        self.store = DeliveryStore(root)
        self.writer = ExecutionTransitions.for_workspace(
            root,
            current_for=self.requirements.get,
            completion=completion_gate(
                lambda record, request: CompletionEvidence(
                    req_id=request.req_id,
                    current_hash=self.hash_for(request.req_id),
                ),
            ),
        )

    def hash_for(self, req_id: str) -> str:
        requirement = self.requirements.get(req_id)
        return requirement.current_hash if requirement is not None else ""

    def state_of(self, req_id: str) -> DeliveryState:
        return self.store.read(req_id).state

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


def _board(
    qtbot,
    workspace: _Workspace,
) -> tuple[RequirementsController, RequirementsView, _RecordingRuns]:
    """A controller over a real board and view, with a starter that only records.

    Shown, because the gesture under test is a drop: a card that never appeared
    cannot be dragged, and a dialog with no visible parent is a different dialog.
    """
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

    runs = _RecordingRuns()
    controller.attach_actions(
        RequirementActions(
            workspace.writer,
            runs=runs,  # type: ignore[arg-type]
            hash_for=workspace.hash_for,
            actor_name="dvf",
            clock=lambda: NOW,
        ),
    )
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=20000):
        controller.refresh()
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=20000)
    return controller, view, runs


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


def _disclosure_on() -> None:
    """Undo the suite-wide silence, so the release actually says something.

    Written straight to ``QSettings`` rather than through a setter the product
    does not need: nothing in Rotaris ever *un*-suppresses the notice, and adding
    a function for it would be a production API that exists for tests.
    """
    settings = QSettings()
    settings.setValue(NOTICE_SUPPRESSED_KEY, False)
    settings.setValue(FULL_PERMISSION_KEY, True)
    settings.sync()


class _Told(NamedTuple):
    """What one dialog said, and what was answered — read off it while it lives.

    The words rather than the widget: the controller drops the dialog as soon as
    it has the answer, so a test holding the object asserts on a deleted one the
    moment Qt drains its deferred deletions.
    """

    title: str
    explanation: str
    impacts: str
    choice: RunPermissionChoice


class _Answer:
    """Answers the dialog by pressing one of its real buttons, and counts.

    Replaces only ``exec`` — the blocking part — so the dialog under the answer
    is the shipped one, with its own wiring, its own buttons and its own
    resolution rules.
    """

    def __init__(self, button: str) -> None:
        self.button = button
        self.shown: list[_Told] = []

    def __call__(self, dialog: RunPermissionDialog) -> int:
        if self.button == "dismiss":
            dialog.reject()
        else:
            getattr(dialog, self.button).click()
        self.shown.append(
            _Told(
                title=dialog.windowTitle(),
                explanation=dialog.explanation.text(),
                impacts=dialog.impact_label.text(),
                choice=dialog.choice,
            ),
        )
        return int(
            QDialog.DialogCode.Accepted if dialog.proceeds else QDialog.DialogCode.Rejected,
        )


@pytest.fixture
def answering(monkeypatch: pytest.MonkeyPatch):
    """Install an answer for whatever release dialog the next gesture raises."""

    def install(button: str) -> _Answer:
        answer = _Answer(button)

        # A plain function, so Qt's own attribute lookup binds `dialog` as its
        # first argument the way `exec` is called. A callable *instance* set on
        # the class is not a descriptor and would arrive with nothing.
        def _exec(dialog: RunPermissionDialog) -> int:
            return answer(dialog)

        monkeypatch.setattr(RunPermissionDialog, "exec", _exec)
        return answer

    return install


# ── the run is actually given both halves (AC-1, AC-2) ─────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3707)
def test_the_elevation_carries_both_halves_and_changes_nothing_else() -> None:
    """Productive use: a released run must not stop at the first tool that would
    have asked. Expected outcome: the configuration it is given names the permissive
    preset *and* the unsandboxed opt-in, as a copy — the one the composer's next run
    reads is untouched, because that run has a human who can answer."""
    from rotaris_core.config.schema import RotarisConfig

    original = RotarisConfig()
    assert original.runtime.permission_mode != FULL_PERMISSION_MODE
    assert original.runtime.allow_unsandboxed_autonomous is False

    raised = elevated(original)

    assert raised.runtime.permission_mode == FULL_PERMISSION_MODE
    assert raised.runtime.allow_unsandboxed_autonomous is True
    # Nothing else moved: an elevation that also changed the model or the
    # iteration cap would be a second, unannounced decision.
    assert raised.runtime.model_dump(
        exclude={"permission_mode", "allow_unsandboxed_autonomous"},
    ) == original.runtime.model_dump(exclude={"permission_mode", "allow_unsandboxed_autonomous"})
    assert raised.default_persona == original.default_persona
    # And the caller still holds what it had.
    assert original.runtime.permission_mode != FULL_PERMISSION_MODE
    assert original.runtime.allow_unsandboxed_autonomous is False


@pytest.mark.unit
@verifies(SWR.SWR_3707, SWR.SWR_2508)
def test_a_run_holding_both_halves_is_not_downgraded_to_ask() -> None:
    """Productive use: this is the failure the user saw. A release is unattended and
    unsandboxed, which is precisely the shape SWR-2508 downgrades.
    Expected outcome: with the opt-in the engine's own resolver leaves the permissive
    preset alone; without it, the same call is downgraded — so the opt-in is load
    bearing and not decoration."""
    with_opt_in = resolve_effective_mode(
        FULL_PERMISSION_MODE,
        interactive=False,
        sandboxed=False,
        opt_in=True,
    )
    assert with_opt_in.downgraded is False
    assert with_opt_in.mode == FULL_PERMISSION_MODE

    without = resolve_effective_mode(
        FULL_PERMISSION_MODE,
        interactive=False,
        sandboxed=False,
        opt_in=False,
    )
    assert without.downgraded is True
    assert without.mode == "ask"


@pytest.mark.unit
@verifies(SWR.SWR_3707)
def test_the_run_configuration_is_the_projects_own_pointed_at_the_runs_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a release is started against a project that configures `ask`.
    Expected outcome: the run is given that project's configuration, pointed at its own
    tree, with both halves of the elevation applied — and with the switch off, the same
    call hands back the project's `ask` untouched."""
    empty_global = tmp_path / "empty-global"
    empty_global.mkdir()
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", empty_global)
    workspace = tmp_path / "punchclock"
    (workspace / ".rotaris").mkdir(parents=True)
    (workspace / ".rotaris" / "agents.yaml").write_text(
        "runtime:\n  permission_mode: ask\n  auto_retries_transient: 3\n",
        encoding="utf-8",
    )
    tree = tmp_path / "trees" / "swr-4100"
    tree.mkdir(parents=True)

    raised = board_run_config(workspace, tree)

    assert raised.workspace_root == tree
    assert raised.runtime.permission_mode == FULL_PERMISSION_MODE
    assert raised.runtime.allow_unsandboxed_autonomous is True
    # The project's own settings still arrive; only the two named fields moved.
    assert raised.runtime.auto_retries_transient == 3

    set_full_permission_runs(False)
    plain = board_run_config(workspace, tree)
    assert plain.workspace_root == tree
    assert plain.runtime.permission_mode == "ask"
    assert plain.runtime.allow_unsandboxed_autonomous is False
    assert plain.runtime.auto_retries_transient == 3


# ── it is disclosed, once, and can be refused (AC-3, AC-4, AC-5) ───────────


@pytest.mark.e2e
@verifies(SWR.SWR_3707)
def test_a_first_release_says_what_the_run_gets_and_a_second_does_not(
    qtbot,
    tmp_path: Path,
    answering,
) -> None:
    """Productive use: a user drags their first card of the session onto Ready.
    Expected outcome: before anything moves they are told the run gets every tool and
    will not stop to ask; they accept, the release goes through, the run really is
    configured the way they were told, and the second release does not tell them again."""
    _disclosure_on()
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4101"), _requirement("SWR-4102")])
    controller, view, runs = _board(qtbot, workspace)
    answer = answering("proceed_button")

    _drop_on_ready(view, "SWR-4101")
    settle(qtbot)

    assert len(answer.shown) == 1, "the first release of a launch is disclosed"
    told = answer.shown[0]
    assert "will not stop to ask" in told.title
    assert "SWR-4101" in told.explanation
    # The two facts that bound the risk are on screen, not only the risk itself.
    assert "without a sandbox" in told.impacts
    assert "worktree" in told.impacts
    assert told.choice is RunPermissionChoice.PROCEED

    assert runs.started == ["SWR-4101"]
    assert workspace.state_of("SWR-4101") is DeliveryState.READY
    # And what they were told is what the run is actually started with: the loop
    # from the sentence on screen back to the configuration closes here.
    given = board_run_config(workspace.root, tmp_path / "trees" / "swr-4101")
    assert given.runtime.permission_mode == FULL_PERMISSION_MODE
    assert given.runtime.allow_unsandboxed_autonomous is True

    _drop_on_ready(view, "SWR-4102")
    settle(qtbot)
    assert len(answer.shown) == 1, "a launch is told once, not once per card"
    assert runs.started == ["SWR-4101", "SWR-4102"]
    # Accepting for the session is not accepting for ever.
    assert notice_suppressed() is False
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3707, SWR.SWR_3602)
def test_refusing_starts_nothing_and_leaves_the_requirement_where_it_was(
    qtbot,
    tmp_path: Path,
    answering,
) -> None:
    """Productive use: a user reads what the run would be given and decides not to.
    Expected outcome: nothing is dispatched, the requirement is still in Backlog, and
    the board says the release stopped — as their decision, not as an error. The next
    release asks again, because a refusal is not an answer for the session."""
    _disclosure_on()
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4103")])
    controller, view, runs = _board(qtbot, workspace)
    answer = answering("cancel_button")

    outcome = controller.move_requirement("SWR-4103", "backlog", "ready")
    settle(qtbot)

    assert answer.shown[0].choice is RunPermissionChoice.CANCEL
    assert runs.started == []
    assert workspace.state_of("SWR-4103") is DeliveryState.BACKLOG
    assert outcome is not None and outcome.accepted is False
    assert "You stopped this release" in outcome.reason
    standing = [
        item for item in controller._store.requirements.feedback if item.req_id == "SWR-4103"
    ]
    assert len(standing) == 1

    # A refusal leaves the question open: the next attempt is asked again.
    again = answering("proceed_button")
    controller.move_requirement("SWR-4103", "backlog", "ready")
    assert len(again.shown) == 1
    assert runs.started == ["SWR-4103"]
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3707)
def test_dont_show_this_again_survives_the_next_launch(
    qtbot,
    tmp_path: Path,
    answering,
) -> None:
    """Productive use: a user who knows what a release does asks not to be told again.
    Expected outcome: the run still starts, the answer is written down, and a controller
    built afterwards — the next launch — releases without a word."""
    _disclosure_on()
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4104"), _requirement("SWR-4105")])
    controller, view, runs = _board(qtbot, workspace)
    answer = answering("always_button")

    controller.move_requirement("SWR-4104", "backlog", "ready")

    assert answer.shown[0].choice is RunPermissionChoice.PROCEED_ALWAYS
    assert runs.started == ["SWR-4104"]
    assert notice_suppressed() is True
    controller.shutdown()

    # The next launch: a new controller, reading what the last one wrote down.
    next_launch, next_view, next_runs = _board(qtbot, workspace)
    quiet = answering("proceed_button")
    next_launch.move_requirement("SWR-4105", "backlog", "ready")
    assert quiet.shown == []
    assert next_runs.started == ["SWR-4105"]
    next_launch.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3707)
def test_nothing_is_said_for_a_move_that_starts_no_run(
    qtbot,
    tmp_path: Path,
    answering,
) -> None:
    """Productive use: a user parks a requirement on Hold.
    Expected outcome: no dialog. The statement is about what a *run* is given, and a
    move that dispatches nothing has nothing to disclose."""
    _disclosure_on()
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4106")])
    controller, view, runs = _board(qtbot, workspace)
    answer = answering("proceed_button")

    controller.move_requirement("SWR-4106", "backlog", "hold")

    assert answer.shown == []
    assert runs.started == []
    controller.shutdown()


@pytest.mark.e2e
@verifies(SWR.SWR_3707)
def test_with_the_switch_off_a_release_is_neither_elevated_nor_announced(
    qtbot,
    tmp_path: Path,
    answering,
) -> None:
    """Productive use: a user turned the elevation off in Settings.
    Expected outcome: releasing says nothing — there is nothing to disclose — and the
    run takes the workspace's own permission mode like any other."""
    _disclosure_on()
    set_full_permission_runs(False)
    workspace = _Workspace(tmp_path / "ws", [_requirement("SWR-4107")])
    controller, view, runs = _board(qtbot, workspace)
    answer = answering("proceed_button")

    controller.move_requirement("SWR-4107", "backlog", "ready")

    assert answer.shown == []
    assert runs.started == ["SWR-4107"]
    assert full_permission_runs() is False
    controller.shutdown()


# ── the dialog itself ──────────────────────────────────────────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3707)
def test_dismissing_the_dialog_is_a_refusal(qtbot) -> None:
    """Productive use: a user hits Escape, or closes the window, without reading.
    Expected outcome: both are refusals. A statement about what a run may do that a
    stray keypress turns into consent is not a statement."""
    for close in ("reject", "close"):
        dialog = RunPermissionDialog("SWR-4108")
        qtbot.addWidget(dialog)
        getattr(dialog, close)()
        assert dialog.choice is RunPermissionChoice.CANCEL
        assert dialog.proceeds is False


@pytest.mark.unit
@verifies(SWR.SWR_3707)
def test_every_answer_is_named_for_someone_who_cannot_see_the_buttons(qtbot) -> None:
    """Productive use: a screen-reader user meets the same three answers.
    Expected outcome: each button says what it is and what it will do, and the list of
    what the run may do is announced as its own region rather than as loose text."""
    dialog = RunPermissionDialog("SWR-4109")
    qtbot.addWidget(dialog)

    for button in (dialog.cancel_button, dialog.proceed_button, dialog.always_button):
        assert isinstance(button, QPushButton)
        assert button.accessibleName()
        assert button.accessibleDescription()
    assert dialog.impact_label.accessibleName() == "What this run may do"
    assert dialog.explanation.accessibleName()
    # The primary answer is where Enter lands: the user asked for this by dropping
    # the card, and Escape is still the way out.
    assert dialog.proceed_button.isDefault() is True
    # Every impact the module states reaches the screen.
    for impact in IMPACTS:
        assert impact in dialog.impact_label.text()


@pytest.mark.unit
@verifies(SWR.SWR_3707)
def test_the_suite_wide_silence_is_the_same_answer_the_button_writes() -> None:
    """Productive use: none — this guards the fixture. Expected outcome: the conftest
    default and the "don't show again" button write the same preference, so a test that
    turns the notice back on is turning on the real thing."""
    QSettings().setValue(NOTICE_SUPPRESSED_KEY, False)
    assert notice_suppressed() is False
    suppress_notice()
    assert notice_suppressed() is True


# ── how long a released run waits for its answer (SWR-3625) ────────────────


@pytest.mark.unit
@verifies(SWR.SWR_3625)
def test_a_released_run_waits_for_the_person_unless_told_otherwise() -> None:
    """Productive use: a user who has never opened Settings releases a requirement that
    stops to ask them something, and answers it after lunch.

    Expected outcome: it is still waiting. Indefinitely is the default because the point
    of saying on the board that a run needs them is that the answer comes later — a
    default of five minutes would make the statement an obituary.
    """
    QSettings().remove(WAIT_BUDGET_KEY)

    assert answer_wait_seconds() == WAIT_INDEFINITELY
    assert WAIT_BUDGET_STOPS[-1] == ("Indefinitely", WAIT_INDEFINITELY)


@pytest.mark.unit
@verifies(SWR.SWR_3625)
def test_every_stop_the_control_offers_round_trips() -> None:
    """A stop the control can show but not store is a setting that silently reverts."""
    for index, (_label, seconds) in enumerate(WAIT_BUDGET_STOPS):
        set_answer_wait_seconds(seconds)
        assert answer_wait_seconds() == seconds
        assert wait_budget_index(answer_wait_seconds()) == index


@pytest.mark.unit
@verifies(SWR.SWR_3625)
def test_a_damaged_preference_reads_as_the_default_not_as_no_limit() -> None:
    """ "The file is damaged" and "wait forever" are different answers, and only one of
    them should follow from a value nobody wrote."""
    QSettings().setValue(WAIT_BUDGET_KEY, "not a number")

    assert answer_wait_seconds() == WAIT_INDEFINITELY
    # A value from a version offering a stop this one does not still shows the safe end
    # of the range rather than the shortest.
    assert wait_budget_index(47.0) == len(WAIT_BUDGET_STOPS) - 1


@pytest.mark.unit
@verifies(SWR.SWR_3625, SWR.SWR_3707)
def test_the_chosen_budget_reaches_the_run_the_board_starts(tmp_path: Path) -> None:
    """Productive use: the user picks 30 minutes and releases a requirement.

    Expected outcome: the run is started with that budget. A preference the run config
    did not carry would be a control that reads back its own value and changes nothing.
    """
    set_answer_wait_seconds(1800.0)

    assert board_run_config(tmp_path, tmp_path).runtime.approval_timeout_seconds == 1800.0


@verifies(SWR.SWR_3625)
def test_the_setting_offers_the_wait_and_records_what_was_chosen(qtbot) -> None:
    """Productive use: a user decides a run should give up after an hour rather than
    wait for them, and finds that where the rest of the release behaviour lives.

    Expected outcome: the control is beside the switch that governs the same question,
    it shows what is currently chosen, and moving it writes the preference a release
    will read. A control that read its own value back and changed nothing is the failure
    this test exists for.
    """
    from rotaris.views.settings import SettingsView

    QSettings().remove(WAIT_BUDGET_KEY)
    view = SettingsView(WorkspaceStore())
    qtbot.addWidget(view)

    assert view.answer_wait_value.text() == "Indefinitely"
    assert view.answer_wait_slider.maximum() == len(WAIT_BUDGET_STOPS) - 1
    assert view.answer_wait_slider.accessibleName()

    view.answer_wait_slider.setValue(wait_budget_index(3600.0))

    assert view.answer_wait_value.text() == "1 hour"
    assert answer_wait_seconds() == 3600.0
    assert view.answer_wait_slider.accessibleDescription()


@pytest.mark.unit
@verifies(SWR.SWR_3625, SWR.SWR_3707)
def test_an_elevated_run_still_carries_the_budget(tmp_path: Path) -> None:
    """An elevated run raises fewer approvals and can still ask a *question*, and one
    budget covers both barriers."""
    QSettings().setValue(FULL_PERMISSION_KEY, True)
    set_answer_wait_seconds(WAIT_INDEFINITELY)

    config = board_run_config(tmp_path, tmp_path)

    assert config.runtime.permission_mode == FULL_PERMISSION_MODE
    assert config.runtime.approval_timeout_seconds == WAIT_INDEFINITELY
