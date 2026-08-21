"""The board without a mouse, and without colour (SWR-3314).

A board is the most mouse-shaped surface in the product and the one where
keyboard operation is most often skipped, so these tests sweep the populated
board the way `test_accessibility_sweep.py` sweeps the seven primary views: every
control announces a name, every rendered label clears its WCAG AA ratio, and the
state a colour encodes is also written in words.

The last test is the keyboard-only flow — reach a card, read its evidence, come
back — driven through the real controller and the real widgets. Moving a card
between delivery states is deliberately not here: this slice is read-only, and
the move and its keyboard equivalent belong to SWR-3601.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import replace

import pytest
from a11y import text_contrast_violations, unnamed_controls
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite
from ui_query import accessible_names, click_by_name, settle

from rotaris.models.requirements_state import build_board_state
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirements import RequirementsView
from rotaris.widgets.evidence_ring import EvidenceRing
from rotaris.widgets.requirement_card import RequirementCardWidget

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)

#: The requirements area's own header controls, by accessible name — the row the
#: status sentence shares (SWR-3319). Named rather than discovered, because the
#: point of the sweep is that *these* fit and announce themselves; a card's
#: buttons are the board's and scroll out of view on purpose.
_HEADER_CONTROLS = frozenset(
    {
        "Analyse changed requirements",
        "Stop analysing changes",
        "Refresh requirements",
    },
)


def _requirement(req_id: str, *, parent: str | None = None) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} keeps a promise",
        description="The product does the thing.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
        parent=parent,
    )


def _projection() -> object:
    """A real projection: an epic, a healthy child and one with a failing test."""
    epic = _requirement("SWR-8000")
    healthy = _requirement("SWR-8001", parent="SWR-8000")
    failing = _requirement("SWR-8002", parent="SWR-8000")
    return project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(epic, healthy, failing), generation=1),
            evidence={
                "SWR-8001": EvidenceInputs(
                    req_id="SWR-8001",
                    requirement_hash=healthy.current_hash,
                    implementations=(RequirementSite(path="src/rotaris/a.py", line=3),),
                    covering_tests=(
                        CoveringTest(
                            path="tests/unit/test_a.py",
                            line=7,
                            executed=True,
                            check_name="pytest",
                            check_status="passed",
                        ),
                    ),
                ),
                "SWR-8002": EvidenceInputs(
                    req_id="SWR-8002",
                    requirement_hash=failing.current_hash,
                    implementations=(RequirementSite(path="src/rotaris/b.py", line=9),),
                    covering_tests=(
                        CoveringTest(
                            path="tests/unit/test_b.py",
                            line=11,
                            executed=True,
                            check_name="pytest",
                            check_status="failed",
                            # The test itself failed, not merely its suite.
                            verdict="failed",
                        ),
                    ),
                ),
            },
            evaluated_at=NOW,
        ),
    )


@pytest.fixture
def board(qtbot):
    """A populated, shown board — what a user actually tabs through."""
    view = RequirementsView()
    qtbot.addWidget(view)
    view.resize(1000, 600)
    view.set_board(build_board_state(_projection(), now=NOW))
    view.show()
    qtbot.waitExposed(view)
    qtbot.waitUntil(lambda: not view.populating, timeout=10000)
    settle(qtbot)
    return view


@verifies(SWR.SWR_3314)
def test_every_control_on_a_populated_board_announces_a_name(board) -> None:
    """Productive use: a screen-reader user tabs through the requirement board.
    Expected outcome: every control they land on is announced rather than silent."""
    unnamed = unnamed_controls(board)

    assert not unnamed, (
        f"the board has {len(unnamed)} control(s) a screen reader announces as nothing: {unnamed}"
    )


@verifies(SWR.SWR_3314)
def test_no_text_on_the_board_falls_below_its_readable_threshold(board, qtbot) -> None:
    """Productive use: a user with low vision reads the board and the panes it opens.
    Expected outcome: every rendered label clears the WCAG AA ratio for its size."""
    violations = list(text_contrast_violations(board))

    board.open_evidence("SWR-8002")
    settle(qtbot)
    violations.extend(text_contrast_violations(board))
    board.open_graph("SWR-8002")
    settle(qtbot)
    violations.extend(text_contrast_violations(board))

    assert not violations, "the requirements view renders unreadable text:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(v) for v in violations})
    )


@verifies(SWR.SWR_3314, SWR.SWR_3303)
def test_column_and_card_names_state_delivery_and_health_in_words(board) -> None:
    """Productive use: a user who cannot rely on colour reads the board.
    Expected outcome: columns and cards announce their delivery state and health as text."""
    column = board.column_widget("backlog")
    assert column is not None
    assert column.accessibleName() == "Backlog column"
    assert "Backlog" in column.accessibleDescription()

    card = board.card_widgets["SWR-8002"]
    assert isinstance(card, RequirementCardWidget)
    described = card.accessibleDescription()
    assert "Backlog" in described
    assert "health" in described.lower()
    assert card.card.health_label in described
    # The ring says the same thing without colour.
    assert "Test: Failed" in card.ring.accessibleDescription()


@verifies(SWR.SWR_3314)
def test_every_card_action_reachable_by_mouse_is_reachable_by_keyboard(board, qtbot) -> None:
    """Productive use: a keyboard-only user opens a requirement and its evidence.
    Expected outcome: focus reaches the card, Enter opens it and Ctrl+E opens its evidence."""
    card = board.card_widgets["SWR-8001"]
    card.setFocus(Qt.FocusReason.TabFocusReason)
    settle(qtbot)

    assert card.hasFocus()
    with qtbot.waitSignal(card.activated, timeout=1000):
        qtbot.keyClick(card, Qt.Key.Key_Return)
    with qtbot.waitSignal(card.evidence_activated, timeout=1000):
        qtbot.keyClick(card, Qt.Key.Key_E, Qt.KeyboardModifier.ControlModifier)

    # Every mouse action on the card is a named control, and the ring is its own
    # tab stop rather than a hover-only affordance.
    names = accessible_names(card, QPushButton)
    assert "Open SWR-8001" in names
    assert "Open evidence for SWR-8001" in names
    ring = card.findChild(EvidenceRing)
    assert ring is not None
    assert ring.focusPolicy() == Qt.FocusPolicy.StrongFocus


@verifies(SWR.SWR_3314)
def test_focus_is_not_stranded_in_a_collapsed_filter_row(board, qtbot) -> None:
    """Productive use: a keyboard user opens the filters, then closes them again.
    Expected outcome: the hidden controls leave the tab sequence and focus returns to the toggle."""
    click_by_name(qtbot, board, "Show filters", QPushButton)
    settle(qtbot)
    assert board.filter_row.isVisible()
    board.health_combo.setFocus(Qt.FocusReason.TabFocusReason)
    assert board.health_combo.hasFocus()

    click_by_name(qtbot, board, "Hide filters", QPushButton)
    settle(qtbot)

    assert not board.filter_row.isVisible()
    assert not board.health_combo.hasFocus()
    assert board.filters_button.hasFocus()
    # A hidden control is out of the tab sequence by construction, so a user
    # cannot land on a filter they cannot see.
    assert not board.health_combo.isVisible()


@verifies(SWR.SWR_3314, SWR.SWR_3307)
def test_no_pane_strands_the_focus_when_it_closes(board, qtbot) -> None:
    """Productive use: a keyboard user opens the evidence pane and presses Escape.
    Expected outcome: the board comes back and the focus lands on the card they came from."""
    board.open_evidence("SWR-8002")
    settle(qtbot)
    assert board.page == "evidence"

    qtbot.keyClick(board, Qt.Key.Key_Escape)
    settle(qtbot)

    assert board.page == "board"
    assert board.card_widgets["SWR-8002"].hasFocus()


@pytest.mark.e2e
@verifies(SWR.SWR_3314, SWR.SWR_3306)
def test_a_keyboard_only_user_reaches_a_requirements_evidence_and_comes_back(qtbot) -> None:
    """Productive use: a keyboard-only user checks why a delivered requirement went red.

    Driven through the requirements surface with the real controller, the real
    bridge and the real engine projection — keys only, no mouse click anywhere.
    """

    class _Source:
        def project(self) -> object:
            return _projection()

    store = WorkspaceStore()
    controller = RequirementsController(store, source=_Source(), clock=lambda: NOW)
    view = RequirementsView()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=10000):
        controller.refresh()
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=10000)

    card = view.card_widgets["SWR-8002"]
    card.setFocus(Qt.FocusReason.TabFocusReason)
    assert store.requirements.selected_req_id == "SWR-8002"

    qtbot.keyClick(card, Qt.Key.Key_E, Qt.KeyboardModifier.ControlModifier)
    settle(qtbot)

    assert view.page == "evidence"
    assert view.evidence_view.req_id == "SWR-8002"
    # The failing test is on screen, as a control a keyboard can reach.
    assert any(
        name.startswith("Covering test tests/unit/test_b.py:11")
        for name in accessible_names(view.evidence_view, QPushButton)
    )

    qtbot.keyClick(view.evidence_view, Qt.Key.Key_Escape)
    settle(qtbot)
    assert view.page == "board"
    controller.shutdown()


@verifies(SWR.SWR_3314, SWR.SWR_3319)
def test_the_analysis_control_announces_itself_and_fits_in_every_state_it_has(qtbot) -> None:
    """Productive use: a screen-reader user, and a user at the smallest supported
    window, meet the control that asks for a change analysis and the one that stops it.
    Expected outcome: it is announced rather than silent in each of its three states,
    and the header it sits in never outgrows 1000×680.

    Swept over the *area surface* rather than the board, which is the gap this closes:
    the board's own sweep (`board` fixture) covers the view, and this control moved to
    the header beside the status sentence it acts on precisely because the board's
    header had no room left at the supported minimum.
    """

    class _Source:
        def project(self) -> object:
            return _projection()

    store = WorkspaceStore()
    controller = RequirementsController(store, source=_Source(), clock=lambda: NOW)
    view = RequirementsView()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    controller.surface.resize(1000, 680)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=10000):
        controller.refresh()
    settle(qtbot)

    states = {
        "nothing owed": {},
        "work owed": {"unanalysed": tuple(f"SWR-80{n:02d}" for n in range(12))},
        "analysis switched off": {"unanalysed": ("SWR-8001",), "analysis_enabled": False},
        "analysing": {"analysing": True},
    }
    for label, changes in states.items():
        store.set_requirements(replace(store.requirements, **changes))
        settle(qtbot)

        unnamed = unnamed_controls(controller.surface)
        assert not unnamed, f"{label}: a control announces as nothing: {unnamed}"

        # The *header row*, not the area. The area's minimum is dominated by the
        # board below it — 826px here against a header of 367–515 — so measuring
        # the area asks a question about the board's width, which is neither what
        # this control affects nor what this test is for. Windows CI made the
        # difference visible: the area needs 1052px there, in a state where this
        # control is hidden and contributes nothing.
        needed = controller._header.minimumSize().width()
        assert needed <= 1000, f"{label}: the requirements header needs {needed}px"
        # The header's own controls only. A card's buttons scroll out of the
        # viewport by design, so sweeping every descendant would assert that a
        # board of any size fits on one screen — which is not a thing.
        header = [
            button
            for button in controller.surface.findChildren(QPushButton)
            if button.accessibleName() in _HEADER_CONTROLS and button.isVisible()
        ]
        assert header, f"{label}: the header rendered no control at all"
        for button in header:
            geometry = button.geometry().translated(
                button.mapTo(controller.surface, button.rect().topLeft())
                - button.geometry().topLeft(),
            )
            assert controller.surface.rect().contains(geometry), (
                f"{label}: {button.accessibleName()!r} is cut off at 1000×680"
            )

    controller.shutdown()


# ── SWR-3321: folding a column without a mouse ─────────────────────────────


@verifies(SWR.SWR_3321, SWR.SWR_3314)
def test_the_fold_controls_announce_what_they_do_and_what_the_rail_holds(board) -> None:
    """Productive use: a screen-reader user meets a folded column and the heading that folds one.
    Expected outcome: both say what they are for, and the rail still states what belongs in
    the column it stands for — folding hides cards, never meaning."""
    backlog = board.column_widget("backlog")
    ready = board.column_widget("ready")
    assert backlog is not None and ready is not None
    # Folded by hand: this board has never had a card past Backlog, and a pipeline
    # nobody has used stays open so a first-time user can read it (SWR-3321).
    assert board.set_column_folded("ready", folded=True)
    assert ready.folded

    assert backlog.header.accessibleName().endswith("fold this column")
    assert "Backlog · 3" in backlog.header.accessibleName()
    assert ready.rail.accessibleName() == "Unfold the Ready column"
    # The sentence SWR-3302 promises an empty column, on the rail that replaced it.
    assert ready.rail.accessibleDescription() == ready.empty_label.text()
    assert ready.empty_label.text() in ready.rail.toolTip()


@verifies(SWR.SWR_3321, SWR.SWR_3314)
def test_a_folded_column_can_be_opened_from_the_keyboard(board, qtbot) -> None:
    """Productive use: a keyboard-only user opens a column that is folded.
    Expected outcome: the rail takes focus and Space opens it, so folding costs a
    mouse-free user nothing."""
    ready = board.column_widget("ready")
    assert ready is not None
    assert board.set_column_folded("ready", folded=True)
    assert ready.folded

    ready.rail.setFocus(Qt.FocusReason.TabFocusReason)
    assert ready.rail.hasFocus(), "the rail cannot be reached with the keyboard"
    qtbot.keyClick(ready.rail, Qt.Key.Key_Space)
    settle(qtbot)

    assert not ready.folded
    assert board.column_widget("ready").card_scroll.isVisible()


@verifies(SWR.SWR_3321, SWR.SWR_3314)
def test_folding_a_column_strands_no_focus_inside_it(board, qtbot) -> None:
    """Productive use: a user is reading a card, then folds the column holding it.
    Expected outcome: the focus follows to the rail rather than being left in a subtree
    nobody can see or tab out of."""
    card = board.card_widgets["SWR-8002"]
    card.setFocus(Qt.FocusReason.TabFocusReason)
    settle(qtbot)
    backlog = board.column_widget("backlog")
    assert backlog is not None
    assert backlog.isAncestorOf(board.window().focusWidget())

    board.set_column_folded("backlog", folded=True)
    settle(qtbot)

    assert backlog.folded
    assert backlog.rail.hasFocus(), "the focus was left inside a folded column"
