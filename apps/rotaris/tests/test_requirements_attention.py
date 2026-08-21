"""Productive use: a user releases two requirements and goes back to reading the board.
One of the runs stops to ask them something. They need to find out from the board — the
place they are already looking — and get into that run in one gesture.
Expected outcome: the card of the requirement whose run is waiting says so and carries the
session to open; the other card says nothing at all; and the statement appears and
disappears on the session list's schedule rather than waiting for the next board
evaluation, because a card that says "waiting" after the user has answered is worse than
one that never said it.

Most of what follows starts no run at all: the join under test is between the board's
cards and the session list, both of which are ordinary values in the store. The last
test is the exception — it drives a released unit's run over the host the release
reaches, so that the chain from "the run stopped to ask" to "the board says so" is
proved once with nothing between its links assumed."""

from __future__ import annotations

import datetime as dt
import threading
from dataclasses import replace

import pytest
from PySide6.QtWidgets import QLabel, QPushButton, QWidget
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import RunOutcome
from rotaris_core.requirements.execution.run_seam import (
    RunWorkspace,
    UnitLaunch,
    unit_isolation,
)
from rotaris_core.requirements.execution.snapshot import capture_snapshot
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.state import SessionState

from rotaris.models.requirements_state import (
    DETAIL_SECTIONS,
    EXECUTION_SECTION,
    DetailSection,
    QueueRun,
    QueueState,
    RequirementCard,
    RequirementDetail,
    RequirementsBoardState,
    Revision,
)
from rotaris.models.state import SessionInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.requirements_actions import AgentRunHost, SessionRunResult
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirement_detail import RequirementDetailView
from rotaris.views.requirement_queue import RequirementQueueView
from rotaris.widgets.requirement_card import RequirementCardWidget

pytestmark = pytest.mark.integration

WAITING = "SWR-1"
QUIET = "SWR-2"
UNIT = "swr-1-impl-a1b2c3d4"
SESSION = "20260821-131700-7bf1aecac209"


def _card(req_id: str) -> RequirementCard:
    return RequirementCard(
        req_id=req_id,
        title=f"Requirement {req_id}",
        lifecycle="approved",
        lifecycle_label="Approved",
        delivery="running",
        delivery_label="Running",
        health="healthy",
        health_label="Healthy",
        evidence_state="satisfied",
    )


def _run(session_id: str, *, req_id: str = WAITING, unit: str = UNIT) -> QueueRun:
    return QueueRun(
        req_id=req_id,
        run_id=f"run-of-{unit}",
        unit_id=unit,
        session_id=session_id,
        outcome="running",
    )


def _board(*running: QueueRun) -> RequirementsBoardState:
    return RequirementsBoardState(
        cards=(_card(WAITING), _card(QUIET)),
        queue=QueueState(running=running),
    )


def _publish(controller: RequirementsController, *running: QueueRun) -> None:
    """The bridge's own hand-off, made without a bridge."""
    controller._evaluated(_board(*running), None)  # noqa: SLF001


def _session(*, requirement_id: str, awaiting: bool, session_id: str = SESSION) -> SessionInfo:
    return SessionInfo(
        id=session_id,
        name="Implement it",
        status="background",
        requirement_id=requirement_id,
        unit_id=UNIT,
        awaiting_input=awaiting,
    )


def _cards(store: WorkspaceStore) -> dict[str, object]:
    return {card.req_id: card for card in store.requirements.cards}


@verifies(SWR.SWR_3625)
def test_only_the_requirement_whose_run_is_waiting_says_so(tmp_path, qtbot) -> None:
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller)
    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])

    cards = _cards(store)
    assert cards[WAITING].attention is not None
    assert cards[WAITING].attention.session_id == SESSION
    assert cards[WAITING].attention.unit_id == UNIT
    # Nothing at all for the other one: an empty field on every card is a field
    # the eye learns to skip, and this is the state that must not be skipped.
    assert cards[QUIET].attention is None


@verifies(SWR.SWR_3625)
def test_the_statement_clears_when_the_run_stops_waiting(tmp_path, qtbot) -> None:
    """Productive use: the user answers the question and goes back to the board.

    Expected outcome: the card stops saying it. A statement that outlives the wait is
    worse than none — it sends the user into a session with nothing to answer.
    """
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller)
    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])
    assert _cards(store)[WAITING].attention is not None

    store.set_sessions([_session(requirement_id=WAITING, awaiting=False)])

    assert _cards(store)[WAITING].attention is None


@verifies(SWR.SWR_3625)
def test_a_run_a_person_started_never_marks_a_card(tmp_path, qtbot) -> None:
    """A composer session waiting on an approval belongs to no requirement, and a card
    that claimed it would send the user to somebody else's run."""
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller)

    store.set_sessions([_session(requirement_id="", awaiting=True)])

    assert all(card.attention is None for card in store.requirements.cards)


@verifies(SWR.SWR_3625)
def test_one_card_states_one_waiting_run_when_several_units_wait(tmp_path, qtbot) -> None:
    """A card has room for one door, and any of them frees the requirement."""
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller)

    store.set_sessions(
        [
            _session(requirement_id=WAITING, awaiting=True, session_id="session-a"),
            _session(requirement_id=WAITING, awaiting=True, session_id="session-b"),
        ],
    )

    attention = _cards(store)[WAITING].attention
    assert attention is not None
    assert attention.session_id in {"session-a", "session-b"}


@verifies(SWR.SWR_3625)
def test_a_board_evaluation_keeps_what_is_waiting(tmp_path, qtbot) -> None:
    """Productive use: the board re-evaluates while a run is waiting — a commit landed,
    a file changed, the sweep came round.

    Expected outcome: the statement survives it. The engine's projection knows nothing
    about live sessions, so a re-evaluation that simply replaced the cards would drop
    the one thing on the board that is waiting for the user.
    """
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller)
    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])

    _publish(controller)

    assert _cards(store)[WAITING].attention is not None


@verifies(SWR.SWR_3625, SWR.SWR_3612)
def test_acting_on_the_statement_opens_that_run_in_the_workspace(tmp_path, qtbot) -> None:
    """Productive use: the user sees the card is waiting and goes to answer it.

    Expected outcome: one gesture lands them in that session, in the view that already
    owns transcripts. The card carries the session id, so nothing looks it up, and
    nothing about a transcript is drawn beside the board (SWR-3612).
    """
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller)
    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])
    widget = RequirementCardWidget(_cards(store)[WAITING])
    # The connection the board makes for every leaf card it builds.
    widget.attention_activated.connect(controller.open_run)

    assert widget.attention_button.text() == "Waiting for your answer"
    widget.attention_button.click()

    assert store.focused_session_id == SESSION
    assert store.ui.active_view == "workspace"


@verifies(SWR.SWR_3625)
def test_a_card_with_nothing_waiting_shows_no_control_at_all(qtbot) -> None:
    """Hidden, not blank: an empty control on every card is one the eye learns to skip,
    and this is the state that must not be skipped."""
    widget = RequirementCardWidget(_card(QUIET))

    assert widget.attention_button.isHidden()


# ── the queue names runs, not requirements (SWR-3625) ───────────────────────


@verifies(SWR.SWR_3625)
def test_only_the_waiting_unit_is_marked_in_the_queue(tmp_path, qtbot) -> None:
    """Productive use: a requirement is running two units and one of them asks something.

    Expected outcome: that row says so and the other does not. The queue lists runs, so
    marking every row of the requirement would point the user at a run with nothing to
    answer.
    """
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller, _run("session-a", unit="unit-a"), _run("session-b", unit="unit-b"))

    store.set_sessions([_session(requirement_id=WAITING, awaiting=True, session_id="session-b")])

    running = {run.session_id: run for run in store.requirements.queue.running}
    assert running["session-b"].awaiting_input is True
    assert running["session-a"].awaiting_input is False


@verifies(SWR.SWR_3625)
def test_a_waiting_queue_row_says_what_it_is_doing() -> None:
    """ "Running" is true and useless for a run that is waiting on the user."""
    waiting = _run(SESSION)
    waiting = replace(waiting, awaiting_input=True)

    assert "waiting for your answer" in waiting.sentence
    assert "Running" not in waiting.sentence


@verifies(SWR.SWR_3625)
def test_the_queue_row_offers_the_answer_and_stops_claiming_progress(qtbot) -> None:
    """Productive use: the user scans the queue to see what their runs are doing.

    Expected outcome: its control says what they would actually do. "Open run" is right
    for a run that is working and wrong for one that is waiting — the queue is where
    they find out, and the verb is the point of the row.
    """
    view = RequirementQueueView()
    row = view._running_row(replace(_run(SESSION), awaiting_input=True))  # noqa: SLF001

    labels = [child.text() for child in row.findChildren(QLabel)]
    assert any("waiting for your answer" in text for text in labels)
    buttons = [child.text() for child in row.findChildren(QPushButton)]
    assert "Answer" in buttons
    assert "Open run" not in buttons


# ── the detail page states it beside the run (SWR-3625, SWR-3307) ──────────


def _detail(req_id: str = WAITING) -> RequirementDetail:
    """One requirement's detail as the projection hands it over — attention-free.

    Whether a run is waiting is not the projection's to know, so a detail always
    arrives without it and the controller overlays it on the way to the view.
    """
    return RequirementDetail(
        req_id=req_id,
        title=f"Requirement {req_id}",
        sections=tuple(
            DetailSection(
                key=key,
                title=title,
                empty_message=empty,
                lines=(f"{UNIT}: running",) if key == EXECUTION_SECTION else (),
            )
            for key, title, empty in DETAIL_SECTIONS
        ),
    )


class _DetailBoard(QWidget):
    """The two things the controller reaches for when it hands over a detail.

    A miniature of :class:`~rotaris.views.requirements.RequirementsView`'s own
    ``show_detail``: remember it, and give it to the panel. The panel is the
    real one — what is under test is what it draws.
    """

    def __init__(self) -> None:
        super().__init__()
        self.detail_view = RequirementDetailView(self)
        self.details: list[RequirementDetail] = []

    def show_detail(self, detail: RequirementDetail) -> None:
        self.details.append(detail)
        self.detail_view.show_detail(detail)


def _open(controller: RequirementsController, board: _DetailBoard, req_id: str = WAITING) -> None:
    """The bridge's deep read landing on an open page, made without a bridge."""
    del board
    controller._detail_ready(_detail(req_id))  # noqa: SLF001


@verifies(SWR.SWR_3625, SWR.SWR_3307)
def test_the_detail_page_states_the_waiting_run_in_its_execution_section(tmp_path, qtbot) -> None:
    """Productive use: the user opens the requirement to see what its run is doing.

    Expected outcome: the section that lists what has run and what is in flight leads
    with the one line in it that is waiting on *them*, and names the unit — which is
    the question a page listing three units actually raises.
    """
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    board = _DetailBoard()
    qtbot.addWidget(controller.surface)
    controller.attach_view(board)
    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])

    _open(controller, board)

    button = board.detail_view.attention_button
    assert button is not None
    assert button.text() == f"Waiting for your answer: {UNIT}"
    # In the execution section, not loose on the page: a statement about a run
    # belongs where the runs are.
    execution = board.detail_view.section_widget(EXECUTION_SECTION)
    assert execution is not None
    assert button in execution.findChildren(QPushButton)


@verifies(SWR.SWR_3625, SWR.SWR_3307)
def test_the_detail_page_offers_nothing_when_no_run_is_waiting(tmp_path, qtbot) -> None:
    """The ordinary page, which is most of them."""
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    board = _DetailBoard()
    qtbot.addWidget(controller.surface)
    controller.attach_view(board)

    _open(controller, board)

    assert board.detail_view.attention_button is None


@verifies(SWR.SWR_3625, SWR.SWR_3307)
def test_the_open_detail_page_learns_it_without_being_reopened(tmp_path, qtbot) -> None:
    """Productive use: the user is reading a requirement when its run stops to ask.

    Expected outcome: the page says so while they are looking at it. A page that only
    learned on reopening would be silent for exactly as long as the user stayed on it,
    which is the whole time the run is waiting.
    """
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    board = _DetailBoard()
    qtbot.addWidget(controller.surface)
    controller.attach_view(board)
    _open(controller, board)
    assert board.detail_view.attention_button is None

    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])

    assert board.detail_view.attention_button is not None
    # And it goes again when the run stops waiting, without a reopen either.
    store.set_sessions([_session(requirement_id=WAITING, awaiting=False)])
    assert board.detail_view.attention_button is None


@verifies(SWR.SWR_3625, SWR.SWR_3313)
def test_restating_a_detail_page_keeps_the_history_it_is_showing(tmp_path, qtbot) -> None:
    """The revision history is a deep read (SWR-3313), and a re-statement that fetched
    the detail again would answer with the board's shallower one and drop it under the
    reader."""
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    board = _DetailBoard()
    qtbot.addWidget(controller.surface)
    controller.attach_view(board)
    deep = replace(
        _detail(),
        revisions=(Revision(requirement_hash="beef0000", outcome="Delivered", delivered=True),),
        history_available=True,
    )
    controller._detail_ready(deep)  # noqa: SLF001

    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])

    shown = board.detail_view.detail
    assert shown is not None
    assert shown.attention is not None
    assert [revision.requirement_hash for revision in shown.revisions] == ["beef0000"]
    assert shown.history_available is True


@verifies(SWR.SWR_3625, SWR.SWR_3612)
def test_answering_from_the_detail_page_lands_in_that_run(tmp_path, qtbot) -> None:
    """Productive use: the user is on the detail page and answers from there.

    Expected outcome: the same door as the card's, landing in the same session — the
    Workspace, where the question is actually answered (SWR-3612).
    """
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    board = _DetailBoard()
    qtbot.addWidget(controller.surface)
    controller.attach_view(board)
    # The connection RequirementsView makes for its detail panel.
    board.detail_view.attention_activated.connect(controller.open_run)
    store.set_sessions([_session(requirement_id=WAITING, awaiting=True)])
    _open(controller, board)

    button = board.detail_view.attention_button
    assert button is not None
    button.click()

    assert store.focused_session_id == SESSION
    assert store.ui.active_view == "workspace"


# ── the whole way through, once (SWR-3625, SWR-3624) ───────────────────────


class AskingLauncher:
    """A released unit's session that stops to ask, and continues when answered.

    Stands in for the run coordinator and for the agent behind it, and for
    nothing else: the session it writes is a real one, written through the real
    persistence into the directory the real session list reads, because "the
    metadata is where this fact lives" is the half of SWR-3625 a double would
    otherwise assume away.
    """

    def __init__(self, manager: SessionManager, *, session_id: str = SESSION) -> None:
        self._manager = manager
        self._session_id = session_id
        self._answered = threading.Event()

    def _persist(self, *, waiting: bool) -> None:
        now = dt.datetime.now(dt.UTC)
        self._manager.persistence.save_snapshot(
            SessionState(
                session_id=self._session_id,
                workspace_root=str(self._manager.workspace_root),
                created_at=now,
                updated_at=now,
                execution_status="running",
                requirement_id=WAITING,
                unit_id=UNIT,
                pending_questions=(
                    {"agent_id": "coder-1", "prompt_id": "p1", "steps": [{"question": "which?"}]}
                    if waiting
                    else None
                ),
            ),
        )

    def launch(self, launch: object) -> str:
        del launch
        self._persist(waiting=True)
        return self._session_id

    def wait(self, session_id: str) -> SessionRunResult:
        # However long the user takes. The budget that bounds this for real is
        # the barrier's (SWR-3625); five seconds is this test refusing to hang.
        assert self._answered.wait(timeout=5.0), "the run was never answered"
        return SessionRunResult(session_id=session_id, status="completed")

    def answer(self) -> None:
        """What the user does once they are in the session: the question is answered."""
        self._persist(waiting=False)
        self._answered.set()


def _unit_launch(tree) -> UnitLaunch:
    requirement = CanonicalRequirement(
        req_id=WAITING,
        title="Requirement SWR-1",
        description="Something worth releasing.",
        source_id="specs",
        source_revision="r1",
    )
    return UnitLaunch(
        run_id="run-of-" + UNIT,
        req_id=WAITING,
        unit_id=UNIT,
        snapshot=capture_snapshot(
            requirement,
            run_id="run-of-" + UNIT,
            base_commit="c0ffee1",
            at=dt.datetime(2026, 8, 21, 12, 0, tzinfo=dt.UTC),
            unit_id=UNIT,
        ),
        isolation=unit_isolation(WAITING, UNIT, run_id="run-of-" + UNIT),
        workspace=RunWorkspace(
            path=str(tree),
            branch=f"rotaris/req/{UNIT}",
            base_branch="main",
            base_revision="c0ffee1",
        ),
        prompt="implement it",
    )


@pytest.mark.e2e
@verifies(SWR.SWR_3625, SWR.SWR_3624, SWR.SWR_3612)
def test_a_released_run_that_stops_to_ask_is_found_answered_and_carries_on(
    tmp_path,
    qtbot,
) -> None:
    """Productive use, end to end: a user releases a requirement and goes back to the
    board. The run stops to ask them something. They find out from the board, click
    into the run, answer it, and the run carries on and finishes.

    Expected outcome: every link of that chain holds — the session the run started
    records that it is waiting, the session list carries it to the board, the card and
    the detail page and the queue row all say so, acting on any of them lands in that
    session, and answering it clears all three *and* releases the run, which then
    reports as it always did.
    """
    tree = tmp_path / "worktree"
    tree.mkdir()
    manager = SessionManager(tmp_path)
    launcher = AskingLauncher(manager)
    host = AgentRunHost(tmp_path, launcher=launcher, run_checks=lambda _tree: ())
    reports: list[object] = []
    # The flow's own worker: the seam is synchronous, so the release blocks here
    # for as long as the run does — which is the point of asking somewhere else.
    worker = threading.Thread(target=lambda: reports.append(host.start(_unit_launch(tree))))
    worker.start()
    try:
        store = WorkspaceStore()
        service = ConfigService(tmp_path, store)
        service.session_manager = manager
        controller = RequirementsController(store, workspace=tmp_path)
        board = _DetailBoard()
        qtbot.addWidget(controller.surface)
        controller.attach_view(board)
        board.detail_view.attention_activated.connect(controller.open_run)
        _publish(controller, _run(SESSION))
        qtbot.waitUntil(lambda: (tmp_path / ".rotaris/sessions" / SESSION).exists(), timeout=5000)

        # The user comes back to the board, and it is the board that tells them.
        service.refresh_sessions()

        card = _cards(store)[WAITING]
        assert card.attention is not None
        assert card.attention.session_id == SESSION
        assert store.requirements.queue.running[0].awaiting_input is True
        _open(controller, board)
        answer = board.detail_view.attention_button
        assert answer is not None

        answer.click()

        assert store.focused_session_id == SESSION
        assert store.ui.active_view == "workspace"

        # They answer it in the session, where answering lives.
        launcher.answer()
        worker.join(timeout=5.0)
        service.refresh_sessions()

        assert _cards(store)[WAITING].attention is None
        assert store.requirements.queue.running[0].awaiting_input is False
        assert board.detail_view.attention_button is None
        assert [report.outcome for report in reports] == [RunOutcome.SUCCEEDED]
    finally:
        launcher.answer()
        worker.join(timeout=5.0)
