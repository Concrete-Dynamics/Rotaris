"""Answering blockers and decisions from the board (SWR-3607).

The blockers here are the engine's own values — a
:class:`~rotaris_core.requirements.delivery.projection.BlockerView` carried
through :func:`~rotaris.models.requirements_state.build_blockers`, and a real
:class:`~rotaris_core.requirements.change.decisions.PendingDecision` raised
through :class:`~rotaris_core.requirements.change.decisions.HumanDecisions`
against a real delivery store under ``tmp_path``. Nothing invents a question, an
option or a consequence, because a blocker the board worded itself would offer
an answer the engine never promised to honour.

The resume half is equally real: the answer travels back through the board's
single write path
(:class:`~rotaris.services.requirements_actions.RequirementActions` over the
guarded :class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions`),
so "answering resumes the flow without a restart" is asserted on the delivery
record the engine actually wrote.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from a11y import text_contrast_violations, unnamed_controls
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.decisions import (
    DecisionOption,
    DecisionTrigger,
    HumanDecisions,
    PendingDecision,
)
from rotaris_core.requirements.delivery.audit import AuditStore
from rotaris_core.requirements.delivery.projection import (
    BlockerKind,
    BlockerOption,
    BlockerView,
    BoardInputs,
    project_board,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from ui_query import click_by_name, find_by_accessible_name, settle

from rotaris.models.requirements_state import (
    Blocker,
    BlockerChoice,
    build_blockers,
    build_board_state,
    build_detail,
)
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_actions import RequirementActions
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import RequirementsView
from rotaris.widgets.requirement_blockers import (
    BLOCKER_KINDS,
    NO_BLOCKERS,
    AnswerPath,
    RequirementBlockerPanel,
    answer_for,
    blocker_from_decision,
    presentation_for,
)

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot
    from rotaris_core.requirements.delivery.projection import BoardProjection

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 15, 10, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")
QUESTION = "Should the importer reject a malformed row or skip it and report the line?"


def _requirement(req_id: str, title: str = "") -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=title or f"{req_id} title",
        description=f"{req_id} says what the product does.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
    )


def _decision_blocker(req_id: str = "SWR-4201") -> Blocker:
    """The blocker the engine's decision projection produces (SWR-3512)."""
    return build_blockers(
        _entry(
            req_id,
            BlockerView(
                req_id=req_id,
                kind=BlockerKind.DECISION,
                reason="unclear-scope raised while planning the importer",
                question=QUESTION,
                decision_id="d-1",
                options=(
                    BlockerOption(
                        key="reject",
                        label="Reject the file",
                        consequence="No partial import; the user fixes the CSV and retries.",
                    ),
                    BlockerOption(
                        key="skip",
                        label="Skip the row",
                        consequence="The import completes and every skipped line is reported.",
                    ),
                ),
            ),
        ),
    )[0]


def _entry(req_id: str, *blockers: BlockerView):  # noqa: ANN202 - the engine's own entry type
    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(_requirement(req_id),), generation=1),
            blockers={req_id: blockers},
            evaluated_at=NOW,
        ),
    )
    entry = projection.entry(req_id)
    assert entry is not None
    return entry


def _panel(qtbot: QtBot) -> RequirementBlockerPanel:
    panel = RequirementBlockerPanel()
    qtbot.addWidget(panel)
    panel.resize(1000, 680)
    panel.show()
    qtbot.waitExposed(panel)
    return panel


# ── every kind has a presentation and an answer path ───────────────────────


@verifies(SWR.SWR_3607)
def test_every_blocker_kind_the_engine_can_raise_has_a_presentation_and_a_path() -> None:
    """Productive use: whatever stopped the work, the user can act on it.
    Expected outcome: the closed set of engine blocker kinds is covered, each
    with its own heading, its own lead sentence and a path that is not "none"."""
    assert set(BLOCKER_KINDS) == {str(kind) for kind in BlockerKind}, (
        "a kind the engine can raise and this surface cannot present is a dead end"
    )

    headings: set[str] = set()
    for kind in BLOCKER_KINDS:
        blocker = Blocker(req_id="SWR-4201", kind=kind, reason=f"{kind} happened")
        presentation = presentation_for(blocker)
        assert presentation.kind == kind
        assert presentation.heading.strip(), f"{kind} has no heading"
        assert presentation.lead.strip(), f"{kind} explains nothing"
        assert presentation.action_label.strip(), f"{kind} offers no control"
        assert isinstance(presentation.path, AnswerPath)
        headings.add(presentation.heading)
    assert len(headings) == len(BLOCKER_KINDS), "two kinds must not read as the same thing"

    # Options win over the kind: an engine that named alternatives has already
    # said what the answer is.
    assert presentation_for(_decision_blocker()).path is AnswerPath.CHOOSE
    assert (
        presentation_for(
            Blocker(req_id="SWR-4201", kind="dependency", reason="waits", blocking_ids=("SWR-1",)),
        ).path
        is AnswerPath.NAVIGATE
    )
    assert (
        presentation_for(Blocker(req_id="SWR-4201", kind="run-failure", reason="spent")).path
        is AnswerPath.INSPECT
    )
    assert (
        presentation_for(Blocker(req_id="SWR-4201", kind="stated", reason="waiting on legal")).path
        is AnswerPath.RESUME
    )


@verifies(SWR.SWR_3607)
def test_a_decision_presents_its_question_and_every_option_with_its_consequence(
    qtbot: QtBot,
) -> None:
    """Productive use: the engine asked, and the user has to answer knowingly.
    Expected outcome: the question is on screen and each control names what
    choosing it will cause — the engine's own consequence, not a paraphrase."""
    panel = _panel(qtbot)
    blocker = _decision_blocker()

    panel.set_blockers([blocker], resume_to="ready")
    settle(qtbot)

    assert panel.blockers == (blocker,)
    assert QUESTION in panel.accessibleDescription()
    # Usable at the supported minimum window (apps/rotaris/AGENTS.md).
    hint = panel.minimumSizeHint()
    assert hint.width() <= 1000 and hint.height() <= 680, hint
    for choice in blocker.choices:
        button = _button(panel, f"{choice.label} for SWR-4201")
        assert button.isEnabled()
        assert choice.consequence in button.accessibleDescription()
        assert button.toolTip() == choice.consequence

    answered: list[tuple[str, str]] = []
    panel.answered.connect(lambda *args: answered.append(args))
    click_by_name(qtbot, panel, "Skip the row for SWR-4201", QPushButton)
    assert answered == [("SWR-4201", "skip")]


@verifies(SWR.SWR_3607, SWR.SWR_3511)
def test_a_conflict_shows_both_requirements_side_by_side_and_opens_the_other_one(
    qtbot: QtBot,
) -> None:
    """Productive use: two requirements cannot both be satisfied as written.
    Expected outcome: both are presented beside each other with the decision the
    user has to take, and the other one is one keystroke away."""
    panel = _panel(qtbot)
    blocker = Blocker(
        req_id="SWR-4201",
        kind="conflict",
        reason="SWR-4201 and SWR-4301 demand opposite handling of a malformed row",
        question="Which of the two requirements stands?",
        blocking_ids=("SWR-4301",),
        choices=(
            BlockerChoice(
                key="keep-4201",
                label="Keep SWR-4201",
                consequence="SWR-4301 is superseded and re-planned.",
            ),
            BlockerChoice(
                key="keep-4301",
                label="Keep SWR-4301",
                consequence="SWR-4201 is superseded and re-planned.",
            ),
        ),
    )

    panel.set_blockers([blocker], resume_to="ready")
    settle(qtbot)

    presentation = presentation_for(blocker)
    assert presentation.side_by_side is True
    description = panel.accessibleDescription()
    assert "SWR-4301" in description
    assert "Which of the two requirements stands?" in description

    opened: list[str] = []
    panel.navigate_requested.connect(opened.append)
    click_by_name(
        qtbot,
        panel,
        "Open SWR-4301, which conflicts with this requirement",
        QPushButton,
    )
    assert opened == ["SWR-4301"]
    # And the decision itself is still answerable from the same surface.
    answered: list[tuple[str, str]] = []
    panel.answered.connect(lambda *args: answered.append(args))
    click_by_name(qtbot, panel, "Keep SWR-4201 for SWR-4201", QPushButton)
    assert answered == [("SWR-4201", "keep-4201")]


@verifies(SWR.SWR_3607, SWR.SWR_3510)
def test_a_dependency_block_names_and_opens_the_requirement_that_blocks_it(
    qtbot: QtBot,
) -> None:
    """Productive use: the work waits for another requirement to be delivered.
    Expected outcome: the blocker names it and the panel navigates there, which
    is the only answer path a dependency has."""
    panel = _panel(qtbot)
    blocker = Blocker(
        req_id="SWR-4201",
        kind="dependency",
        reason="unit-1 waits for SWR-4100, which is not delivered",
        blocking_ids=("SWR-4100",),
    )

    panel.set_blockers([blocker])
    settle(qtbot)

    assert presentation_for(blocker).path is AnswerPath.NAVIGATE
    opened: list[str] = []
    panel.navigate_requested.connect(opened.append)
    click_by_name(qtbot, panel, "Open SWR-4100, which blocks SWR-4201", QPushButton)
    assert opened == ["SWR-4100"]
    assert "SWR-4100" in panel.accessibleDescription()


@verifies(SWR.SWR_3607, SWR.SWR_3201)
def test_a_stated_block_is_cleared_back_to_the_state_it_was_blocked_in(qtbot: QtBot) -> None:
    """Productive use: a person blocked it, and a person clears it.
    Expected outcome: the control says where the requirement returns to, and that
    state is the record's own — never one this panel chose."""
    panel = _panel(qtbot)
    blocker = Blocker(req_id="SWR-4201", kind="stated", reason="waiting on the legal review")

    panel.set_blockers([blocker], resume_to="ready")
    settle(qtbot)

    assert panel.resume_to == "ready"
    resume = _button(panel, "Clear the blocker on SWR-4201")
    assert "ready" in resume.accessibleDescription()
    resumed: list[str] = []
    panel.resume_requested.connect(resumed.append)
    click_by_name(qtbot, panel, "Clear the blocker on SWR-4201", QPushButton)
    assert resumed == ["SWR-4201"]


@verifies(SWR.SWR_3607, SWR.SWR_3415)
def test_a_spent_run_offers_the_run_rather_than_a_retry_the_engine_would_refuse(
    qtbot: QtBot,
) -> None:
    """Productive use: the retries are gone and the requirement waits on a person.
    Expected outcome: the path is to look at the run, and the panel offers no
    retry — the board must not promise something the engine has refused."""
    panel = _panel(qtbot)
    blocker = Blocker(
        req_id="SWR-4201",
        kind="run-failure",
        reason="unit-1: the verification failed three times",
    )

    panel.set_blockers([blocker])
    settle(qtbot)

    assert presentation_for(blocker).path is AnswerPath.INSPECT
    inspected: list[str] = []
    panel.inspect_requested.connect(inspected.append)
    click_by_name(qtbot, panel, "Open the run that failed for SWR-4201", QPushButton)
    assert inspected == ["SWR-4201"]
    labels = {button.text() for button in panel.findChildren(QPushButton)}
    assert not any("retry" in label.casefold() or "rerun" in label.casefold() for label in labels)


@verifies(SWR.SWR_3607)
def test_the_panel_states_the_absence_of_blockers_rather_than_showing_a_blank_pane(
    qtbot: QtBot,
) -> None:
    """Productive use: a requirement nothing is blocking.
    Expected outcome: a stated fact, not an empty card."""
    panel = _panel(qtbot)
    panel.set_blockers([_decision_blocker()])
    panel.set_blockers([])
    settle(qtbot)

    assert panel.blockers == ()
    assert panel.empty_label.isVisible()
    assert panel.empty_label.text() == NO_BLOCKERS
    assert panel.accessibleDescription() == NO_BLOCKERS
    assert not panel.findChildren(QPushButton), "a cleared panel must not keep stale controls"


@verifies(SWR.SWR_3607)
def test_an_answer_carries_the_choice_its_consequence_and_where_the_flow_resumes() -> None:
    """Productive use: the answer has to be usable by the engine and readable later.
    Expected outcome: the payload names the option, its consequence, the decision
    it answers and the state the flow resumes in — and refuses an option nobody
    offered."""
    blocker = _decision_blocker()

    answer = answer_for(blocker, "skip", resume_to="ready")

    assert answer is not None
    assert answer.choice == "skip"
    assert answer.decision_id == "d-1"
    assert answer.resume_to == "ready"
    assert "every skipped line is reported" in answer.consequence
    assert "resuming in ready" in answer.sentence
    assert answer_for(blocker, "delete-the-file", resume_to="ready") is None


@verifies(SWR.SWR_3607, SWR.SWR_3512)
def test_a_decision_the_engine_raised_becomes_a_blocker_with_its_own_options(
    qtbot: QtBot,
) -> None:
    """Productive use: the escalation of slice 5 arrives on the board answerable.
    Expected outcome: the real PendingDecision satisfies the surface's protocol,
    and every option it offered is a control carrying that option's consequence."""
    pending = PendingDecision.raised(
        "SWR-4201",
        DecisionTrigger.UNCLEAR_SCOPE,
        question=QUESTION,
        options=(
            DecisionOption(
                name="reject",
                consequence="No partial import; the user fixes the CSV and retries.",
            ),
            DecisionOption(
                name="skip",
                consequence="The import completes and every skipped line is reported.",
            ),
        ),
        at=NOW,
    )

    blocker = blocker_from_decision(pending, reason=pending.trigger.label)

    assert blocker.req_id == "SWR-4201"
    assert blocker.kind == "decision"
    assert blocker.question == QUESTION
    assert blocker.decision_id == pending.decision_id
    assert [choice.key for choice in blocker.choices] == list(pending.option_names)
    assert blocker.answerable is True

    panel = _panel(qtbot)
    panel.set_blockers([blocker], resume_to="ready")
    settle(qtbot)
    answered: list[tuple[str, str]] = []
    panel.answered.connect(lambda *args: answered.append(args))
    click_by_name(qtbot, panel, "skip for SWR-4201", QPushButton)

    assert answered == [("SWR-4201", "skip")]
    # The answer the panel produced is one the engine accepts by name.
    record = pending.answered(answered[0][1], by=USER, at=NOW)
    assert record.chosen == "skip"
    assert record.consequence.startswith("The import completes")


def _button(panel: RequirementBlockerPanel, name: str) -> QPushButton:
    found = [
        button
        for button in panel.findChildren(QPushButton)
        if button.accessibleName() == name and button.isVisible()
    ]
    assert len(found) == 1, f"{name!r} is not reachable; found {len(found)}"
    return found[0]


# ── the engine on the other side of the answer ─────────────────────────────


class _Workspace:
    """One workspace with the real delivery store, trail and guarded writer."""

    def __init__(self, root: Path, req_ids: tuple[str, ...] = ("SWR-4201",)) -> None:
        self.root = root
        self.requirements = {req_id: _requirement(req_id) for req_id in req_ids}
        self.store = DeliveryStore(root)
        self.audit = AuditStore(root)
        self.writer = ExecutionTransitions.for_workspace(
            root,
            current_for=self.requirements.get,
        )
        self.blockers: dict[str, tuple[BlockerView, ...]] = {}

    def hash_for(self, req_id: str) -> str:
        requirement = self.requirements.get(req_id)
        return requirement.current_hash if requirement is not None else ""

    def advance(self, req_id: str, *states: DeliveryState, reason: str = "") -> None:
        causes = {
            DeliveryState.READY: TransitionCause.USER_ACTION,
            DeliveryState.BLOCKED: TransitionCause.BLOCKER_RAISED,
        }
        for offset, state in enumerate(states):
            outcome = self.writer.apply(
                TransitionRequest(
                    req_id=req_id,
                    target=state,
                    actor=USER,
                    cause=causes.get(state, TransitionCause.USER_ACTION),
                    at=NOW + dt.timedelta(seconds=offset),
                    requirement_hash=self.hash_for(req_id),
                    reason=reason if state is DeliveryState.BLOCKED else "",
                ),
            )
            assert outcome.accepted, outcome.message

    def actions(self) -> RequirementActions:
        return RequirementActions(
            self.writer,
            hash_for=self.hash_for,
            actor_name="dvf",
            clock=lambda: NOW + dt.timedelta(minutes=1),
        )

    def project(self) -> BoardProjection:
        return project_board(
            BoardInputs(
                index=RequirementIndex(
                    requirements=tuple(self.requirements.values()),
                    generation=1,
                ),
                delivery=self.store.load_all(),
                blockers=self.blockers,
                evaluated_at=NOW,
            ),
        )


@pytest.mark.integration
@verifies(SWR.SWR_3607, SWR.SWR_3512)
def test_answering_a_clarification_question_resumes_the_flow_and_records_the_answer(
    tmp_path: Path,
) -> None:
    """Productive use: the engine stopped and asked; the user answers and work continues.
    Expected outcome: the requirement leaves Blocked for the state it was blocked
    in, the answer and its actor are in the trail, and nothing was restarted."""
    workspace = _Workspace(tmp_path)
    workspace.advance("SWR-4201", DeliveryState.READY)
    decisions = HumanDecisions(workspace.writer, audit=workspace.audit)
    pending = PendingDecision.raised(
        "SWR-4201",
        DecisionTrigger.UNCLEAR_SCOPE,
        question=QUESTION,
        options=(
            DecisionOption(name="reject", consequence="No partial import; the user retries."),
            DecisionOption(name="skip", consequence="The import completes; lines are reported."),
        ),
        at=NOW,
        requirement_hash=workspace.hash_for("SWR-4201"),
    )

    raised = decisions.raise_for(pending)
    assert raised.moved, raised.message
    record = workspace.store.read("SWR-4201")
    assert record.state is DeliveryState.BLOCKED
    assert record.delivery.blocked_from is DeliveryState.READY

    # What the board shows for it is the question and the two consequences.
    workspace.blockers = {
        "SWR-4201": (
            BlockerView(
                req_id="SWR-4201",
                kind=BlockerKind.DECISION,
                reason=pending.trigger.label,
                question=pending.question,
                decision_id=pending.decision_id,
                options=tuple(
                    BlockerOption(key=option.name, consequence=option.consequence)
                    for option in pending.options
                ),
            ),
        ),
    }
    blocker = build_detail(
        _board_entry(workspace, "SWR-4201"),
        now=NOW,
    ).blockers[0]
    answer = answer_for(blocker, "skip", resume_to=str(record.delivery.blocked_from))
    assert answer is not None

    answered = decisions.answer(
        pending,
        answer.choice,
        by=USER,
        at=NOW + dt.timedelta(minutes=3),
        rationale=answer.sentence,
        resume_to=DeliveryState.READY,
    )

    assert answered.moved, answered.message
    assert answered.record is not None
    assert answered.record.chosen == "skip"
    assert answered.record.answered_by == USER
    assert workspace.store.read("SWR-4201").state is DeliveryState.READY
    trail = workspace.audit.load("SWR-4201").trail
    assert any("skip" in (event.reason or "") + (event.detail or "") for event in trail.events)


def _board_entry(workspace: _Workspace, req_id: str):  # noqa: ANN202 - the engine's entry type
    entry = workspace.project().entry(req_id)
    assert entry is not None
    return entry


@pytest.mark.integration
@verifies(SWR.SWR_3607)
def test_the_panel_answer_travels_the_boards_own_write_path_and_moves_the_record(
    qtbot: QtBot,
    tmp_path: Path,
) -> None:
    """Productive use: the answer is given on the board, not in a script.
    Expected outcome: the panel's signal reaches the controller, the controller
    writes through the engine's guarded path, and the record leaves Blocked."""
    workspace = _Workspace(tmp_path)
    workspace.advance(
        "SWR-4201",
        DeliveryState.READY,
        DeliveryState.BLOCKED,
        reason="unclear scope: reject or skip a malformed row",
    )
    workspace.blockers = {"SWR-4201": (_view(),)}
    controller = RequirementsController(
        WorkspaceStore(),
        source=_Source(workspace),
        actions=workspace.actions(),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    panel = RequirementBlockerPanel()
    assert controller.attach_pane("blockers", panel) is True
    panel.answered.connect(controller.answer_blocker)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    card = controller._store.requirements.card("SWR-4201")  # noqa: SLF001 - published state
    assert card is not None and card.delivery == "blocked"
    detail = controller.detail_for("SWR-4201")
    assert detail is not None
    panel.set_blockers(detail.blockers, resume_to=card.blocked_from)
    view.show_pane("blockers")
    settle(qtbot)

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click_by_name(qtbot, panel, "Skip the row for SWR-4201", QPushButton)
    settle(qtbot)

    assert workspace.store.read("SWR-4201").state is DeliveryState.READY
    moved = controller._store.requirements.card("SWR-4201")  # noqa: SLF001 - published state
    assert moved is not None and moved.delivery == "ready"


def _view(req_id: str = "SWR-4201") -> BlockerView:
    return BlockerView(
        req_id=req_id,
        kind=BlockerKind.DECISION,
        reason="unclear-scope raised while planning the importer",
        question=QUESTION,
        decision_id="d-1",
        options=(
            BlockerOption(
                key="reject",
                label="Reject the file",
                consequence="No partial import; the user fixes the CSV and retries.",
            ),
            BlockerOption(
                key="skip",
                label="Skip the row",
                consequence="The import completes and every skipped line is reported.",
            ),
        ),
    )


class _Source:
    """The bridge's port, answering from the live delivery store."""

    def __init__(self, workspace: _Workspace) -> None:
        self._workspace = workspace

    def project(self) -> BoardProjection:
        return self._workspace.project()


@pytest.mark.e2e
@verifies(SWR.SWR_3607)
def test_a_user_answers_the_question_that_blocked_a_requirement_and_the_work_continues(
    qtbot: QtBot,
    tmp_path: Path,
) -> None:
    """Productive use: the whole of SWR-3607, driven through the board.
    Expected outcome: a blocked card is opened, its blocker answered from the
    detail view's own control, and the card leaves the Blocked column."""
    workspace = _Workspace(tmp_path)
    workspace.advance(
        "SWR-4201",
        DeliveryState.READY,
        DeliveryState.BLOCKED,
        reason="unclear scope: reject or skip a malformed row",
    )
    workspace.blockers = {"SWR-4201": (_view(),)}
    controller = RequirementsController(
        WorkspaceStore(),
        source=_Source(workspace),
        actions=workspace.actions(),
        clock=lambda: NOW,
    )
    qtbot.addWidget(controller.surface)
    view = RequirementsView()
    controller.attach_view(view)
    panel = RequirementBlockerPanel()
    assert controller.attach_pane("blockers", panel) is True
    panel.answered.connect(controller.answer_blocker)

    def open_blockers(req_id: str) -> None:
        detail = controller.detail_for(req_id)
        card = controller._store.requirements.card(req_id)  # noqa: SLF001 - published state
        if detail is not None and card is not None:
            panel.set_blockers(detail.blockers, resume_to=card.blocked_from)
            view.show_pane("blockers")

    controller.blocker_requested.connect(open_blockers)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        controller.refresh()
    settle(qtbot)

    board = build_board_state(workspace.project())
    blocked = board.column("blocked")
    assert blocked is not None and "SWR-4201" in blocked.req_ids

    controller.open_requirement("SWR-4201")
    settle(qtbot)
    click_by_name(qtbot, view.detail_view, "Resolve the 1 blocker(s) of SWR-4201", QPushButton)
    settle(qtbot)
    assert view.page == "blockers"
    assert QUESTION in panel.accessibleDescription()

    with qtbot.waitSignal(controller.bridge.evaluated, timeout=5000):
        click_by_name(qtbot, panel, "Skip the row for SWR-4201", QPushButton)
    settle(qtbot)

    after = build_board_state(workspace.project())
    blocked_now = after.column("blocked")
    ready_now = after.column("ready")
    assert blocked_now is not None and "SWR-4201" not in blocked_now.req_ids
    assert ready_now is not None and "SWR-4201" in ready_now.req_ids
    trail = workspace.audit.load("SWR-4201").trail
    assert any(event.actor.name == "dvf" for event in trail.events), (
        "the answer is attributed to the person who gave it (SWR-3610)"
    )


# ── SWR-3314: the answer path is usable without a mouse ────────────────────


@verifies(SWR.SWR_3607)
def test_the_blocker_panel_is_announced_readable_and_keyboard_reachable(qtbot: QtBot) -> None:
    """Productive use: a screen-reader and keyboard user answers what stopped the work.
    Expected outcome: every control announces a name, every label clears its WCAG AA
    ratio, and each option is reachable without a mouse — the sweep the board itself
    passes, applied to the surface that unblocks a requirement (SWR-3314)."""
    panel = _panel(qtbot)
    blocker = _decision_blocker()
    dependency = Blocker(
        req_id="SWR-4201",
        kind="dependency",
        reason="SWR-4101 is not delivered yet",
        blocking_ids=("SWR-4101",),
    )
    panel.set_blockers([blocker, dependency], resume_to="ready")
    settle(qtbot)

    unnamed = unnamed_controls(panel)
    assert not unnamed, f"the blocker panel has silent control(s): {unnamed}"
    violations = text_contrast_violations(panel)
    assert not violations, "unreadable text on the blocker panel:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(item) for item in violations})
    )

    reachable = [
        *(f"{choice.label} for SWR-4201" for choice in blocker.choices),
        "Open SWR-4101, which blocks SWR-4201",
    ]
    for name in reachable:
        control = find_by_accessible_name(panel, name, QPushButton, visible_only=True)
        assert control.focusPolicy() != Qt.FocusPolicy.NoFocus, f"{name} cannot be tabbed to"
    # A choice announces its consequence too — a name alone would let a
    # screen-reader user pick an option without hearing what it costs.
    for choice in blocker.choices:
        button = find_by_accessible_name(
            panel,
            f"{choice.label} for SWR-4201",
            QPushButton,
            visible_only=True,
        )
        assert choice.consequence in button.accessibleDescription()

    # An empty panel says so rather than presenting an unnamed blank.
    panel.set_blockers([], resume_to="")
    settle(qtbot)
    assert not unnamed_controls(panel), "the empty blocker panel has silent control(s)"
    assert not text_contrast_violations(panel), "the empty blocker panel is unreadable"
