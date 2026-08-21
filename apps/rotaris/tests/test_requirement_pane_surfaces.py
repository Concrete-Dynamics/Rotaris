"""The pages behind the board are pages, not blank areas (SWR-3702).

Two failures put this file here, and neither showed up in a behavioural test.

The first is silent by construction. A :class:`~rotaris.widgets.cards.Card`
takes its ground, its hairline and its radius from the application stylesheet,
and several panes named their card after what it holds — ``queueRunning``,
``reviewDecisions``, the blocker mount seam — which used to stop the stylesheet
matching it at all. Every control still worked, every assertion still passed,
and the delivery queue rendered as bare sentences on the page ground. So the
sweep here is: build the pane the product builds, and check that every card on
it still resolves the card's ground.

The second is the board's own chrome following the user into a pane it does not
belong to: a requirement search and a ``Move`` control over a page that shows
neither columns nor the selected card.
"""

from __future__ import annotations

import pytest
from a11y import effective_background, qss_background_by_object_name
from PySide6.QtWidgets import QLabel, QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.requirements_state import QueueState
from rotaris.views.requirement_detail import RequirementDetailView
from rotaris.views.requirement_graph import RequirementGraphView
from rotaris.views.requirement_queue import RequirementQueueView
from rotaris.views.requirement_review import RequirementReviewView
from rotaris.views.requirements import RequirementsView
from rotaris.widgets.cards import Card
from rotaris.widgets.evidence_ring import EvidenceView

pytestmark = pytest.mark.unit


def _panes(qtbot) -> dict[str, QWidget]:
    """One of every surface the board opens on top of itself."""
    built = {
        "queue": RequirementQueueView(),
        "detail": RequirementDetailView(),
        "review": RequirementReviewView(),
        "graph": RequirementGraphView(),
        "evidence": EvidenceView(),
    }
    for pane in built.values():
        qtbot.addWidget(pane)
    return built


@verifies(SWR.SWR_3702)
def test_every_card_on_a_requirement_pane_still_paints_as_a_card(qtbot) -> None:
    """Productive use: a user opens the queue, a requirement and its review.
    Expected outcome: each section is a surface with its own ground, whatever the
    pane called the card it built."""
    ground = qss_background_by_object_name()["card"]

    # The graph and the evidence view fill themselves from a requirement, so
    # they carry no cards until one is opened; the other three build theirs in
    # the constructor and a pane with none of them is a pane that lost them.
    always_carded = {"queue", "detail", "review"}
    for name, pane in _panes(qtbot).items():
        cards = pane.findChildren(Card)
        assert cards or name not in always_carded, f"the {name} pane builds no cards at all"
        for card in cards:
            assert card.property("surface") == "card", (
                f"a card on the {name} pane (objectName={card.objectName()!r}) lost the "
                "property the stylesheet paints it through"
            )
            assert effective_background(card) == ground


@verifies(SWR.SWR_3702)
def test_a_renamed_card_keeps_the_cards_ground(qtbot) -> None:
    """Productive use: a pane names its card after what the card holds.
    Expected outcome: the rename is a label, not a restyle — the ground a reader
    resolves for the text on it is still the card's."""
    card = Card("Running now")
    qtbot.addWidget(card)
    card.setObjectName("queueRunning")

    label = QLabel("SWR-4201/unit-1", card)
    assert card.property("surface") == "card"
    assert effective_background(label) == qss_background_by_object_name()["card"]


@verifies(SWR.SWR_3702)
def test_the_queue_states_its_counts_and_its_emptiness(qtbot) -> None:
    """Productive use: a user opens the queue before releasing anything.
    Expected outcome: the three counts read zero and each section says what
    belongs in it rather than showing a blank."""
    pane = RequirementQueueView()
    qtbot.addWidget(pane)

    pane.set_queue(QueueState(concurrency_limit=2))

    assert pane.running_stat.value_label.text() == "0"
    assert pane.queued_stat.value_label.text() == "0"
    assert pane.held_stat.value_label.text() == "0"
    assert pane.running_stat.unit_label.text() == "of 2"
    rendered = [label.text() for label in pane.findChildren(QLabel) if label.text().strip()]
    assert "Nothing is running right now." in rendered
    assert any("Nothing is queued" in text for text in rendered)
    assert "Nothing is held back." in rendered


@verifies(SWR.SWR_3315)
def test_the_boards_own_chrome_stays_on_the_board(qtbot) -> None:
    """Productive use: a user opens the delivery queue from the board.
    Expected outcome: the requirement search and the move strip — both about the
    board's columns and its selection — are not left over the pane."""
    view = RequirementsView()
    qtbot.addWidget(view)
    view.show()
    qtbot.waitExposed(view)

    assert view.filter_bar.isVisible()
    assert view.move_bar.isVisible()

    pane = RequirementQueueView()
    assert view.attach_pane("queue", pane) is True
    assert view.show_pane("queue") is True

    assert not view.filter_bar.isVisible(), "the board's filters followed the user into the pane"
    assert not view.move_bar.isVisible(), "the move strip followed the user into the pane"

    view.show_board()

    assert view.filter_bar.isVisible()
    assert view.move_bar.isVisible()
