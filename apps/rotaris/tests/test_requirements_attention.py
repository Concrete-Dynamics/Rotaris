"""Productive use: a user releases two requirements and goes back to reading the board.
One of the runs stops to ask them something. They need to find out from the board — the
place they are already looking — and get into that run in one gesture.
Expected outcome: the card of the requirement whose run is waiting says so and carries the
session to open; the other card says nothing at all; and the statement appears and
disappears on the session list's schedule rather than waiting for the next board
evaluation, because a card that says "waiting" after the user has answered is worse than
one that never said it.

Nothing here starts a run. The join under test is between the board's cards and the
session list, both of which are ordinary values in the store."""

from __future__ import annotations

import datetime as dt

from dataclasses import replace

import pytest
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.requirements_state import (
    QueueRun,
    QueueState,
    RequirementCard,
    RequirementsBoardState,
)
from rotaris.models.state import SessionInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_controller import RequirementsController
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


@verifies(SWR.SWR_3623)
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


@verifies(SWR.SWR_3623)
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


@verifies(SWR.SWR_3623)
def test_a_run_a_person_started_never_marks_a_card(tmp_path, qtbot) -> None:
    """A composer session waiting on an approval belongs to no requirement, and a card
    that claimed it would send the user to somebody else's run."""
    store = WorkspaceStore()
    controller = RequirementsController(store, workspace=tmp_path)
    _publish(controller)

    store.set_sessions([_session(requirement_id="", awaiting=True)])

    assert all(card.attention is None for card in store.requirements.cards)


@verifies(SWR.SWR_3623)
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


@verifies(SWR.SWR_3623)
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


@verifies(SWR.SWR_3623, SWR.SWR_3612)
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


@verifies(SWR.SWR_3623)
def test_a_card_with_nothing_waiting_shows_no_control_at_all(qtbot) -> None:
    """Hidden, not blank: an empty control on every card is one the eye learns to skip,
    and this is the state that must not be skipped."""
    widget = RequirementCardWidget(_card(QUIET))

    assert widget.attention_button.isHidden()


# ── the queue names runs, not requirements (SWR-3623) ───────────────────────


@verifies(SWR.SWR_3623)
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


@verifies(SWR.SWR_3623)
def test_a_waiting_queue_row_says_what_it_is_doing() -> None:
    """ "Running" is true and useless for a run that is waiting on the user."""
    waiting = _run(SESSION)
    waiting = replace(waiting, awaiting_input=True)

    assert "waiting for your answer" in waiting.sentence
    assert "Running" not in waiting.sentence


@verifies(SWR.SWR_3623)
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
