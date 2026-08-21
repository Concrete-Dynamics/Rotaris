"""The requirement card and the epic card as widgets (SWR-3304, SWR-3308).

Unit level: one card in isolation, over crafted projection values. What the card
does with a *real* projection is asserted in `test_requirements_board.py`; what
is asserted here is the widget's own contract — every element rendered, every
absent fact omitted rather than blanked, every exceptional fact stated in words,
and an epic card that has no delivery affordance at all.

The second half of the file is about what the card does *not* say, and about
saying the rest so a first-time reader can follow it: an alert that every card on
a fresh board carries is not raised, the two state axes do not share one badge,
severity survives a reader who cannot separate two ambers, and every word Rotaris
invented can be learned from the card that prints it.
"""

from __future__ import annotations

import re

import pytest
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.health import RequirementHealth
from ui_query import accessible_names, click_by_name, find_by_accessible_name

from rotaris import theme
from rotaris.models.requirements_state import (
    EvidenceSegment,
    RequirementCard,
    RequirementFact,
)
from rotaris.theme import raise_to_readable, tokens
from rotaris.widgets.requirement_card import (
    DELIVERY_ACTION_AREA,
    EVIDENCE_MEANING,
    EXECUTION_UNITS_MEANING,
    SELECTED_MARK,
    SELECTED_MEANING,
    EpicCard,
    RequirementCardWidget,
    alert_severity,
    blocker_reason,
    blocker_sentence,
    card_alerts,
    evidence_button_hint,
    fact_meaning,
    health_meaning,
    is_blocked,
    moment_hint,
)

pytestmark = pytest.mark.unit


def _segments(test_state: str = "satisfied") -> tuple[EvidenceSegment, ...]:
    return (
        EvidenceSegment(
            kind="implementation",
            label="Implementation",
            state="satisfied",
            state_label="Satisfied",
        ),
        EvidenceSegment(
            kind="test",
            label="Test",
            state=test_state,
            state_label=test_state.capitalize(),
            detail="covering-test-failed" if test_state == "failed" else "",
        ),
    )


def _card(
    req_id: str = "SWR-4001",
    *,
    alerts: tuple[str, ...] = (),
    facts: tuple[RequirementFact, ...] = (),
    unit_count: int = 0,
    units_label: str = "No execution units yet",
    last_run_label: str = "Never run",
    last_run_moment: str = "",
    evidence: tuple[EvidenceSegment, ...] | None = None,
    delivery: str = "ready",
    delivery_label: str = "Ready",
    health: str = "healthy",
    health_label: str = "Healthy",
    evidence_state: str = "satisfied",
    is_epic: bool = False,
    epic_label: str = "",
) -> RequirementCard:
    return RequirementCard(
        req_id=req_id,
        title=f"{req_id} keeps the promise",
        lifecycle="approved",
        lifecycle_label="Approved",
        delivery=delivery,
        delivery_label=delivery_label,
        health=health,
        health_label=health_label,
        evidence_state=evidence_state,
        evidence=_segments() if evidence is None else evidence,
        alerts=alerts,
        facts=facts,
        unit_count=unit_count,
        units_label=units_label,
        last_run_label=last_run_label,
        last_run_moment=last_run_moment,
        is_epic=is_epic,
        epic_label=epic_label,
    )


def _texts(widget: RequirementCardWidget | EpicCard) -> list[str]:
    return [label.text() for label in widget.findChildren(QLabel) if label.text().strip()]


@verifies(SWR.SWR_3304)
def test_a_card_renders_every_element_the_requirement_carries(qtbot) -> None:
    """Productive use: a user scans the board to decide what needs attention.
    Expected outcome: id, title, both badges, health, ring, units and last run are all on the card."""
    card = _card(
        facts=(
            RequirementFact(label="Priority", value="Critical"),
            RequirementFact(label="Epic", value="SWR-4000"),
        ),
        unit_count=2,
        units_label="2 execution units",
        last_run_label="Last run 2 hours ago (Failed)",
    )
    widget = RequirementCardWidget(card)
    qtbot.addWidget(widget)

    texts = _texts(widget)
    assert "SWR-4001" in texts
    assert card.title in texts
    assert "Approved" in texts
    assert "Ready" in texts
    assert "Health: Healthy" in texts
    assert "Priority: Critical" in texts
    assert "Epic: SWR-4000" in texts
    assert "2 execution units · Last run 2 hours ago (Failed)" in texts
    assert widget.ring.segments == card.evidence
    # Announced as a whole, so a screen reader gets the same card a reader sees.
    assert widget.accessibleName() == "SWR-4001 SWR-4001 keeps the promise"
    assert "Approved, Ready" in widget.accessibleDescription()
    assert "health Healthy" in widget.accessibleDescription()


@verifies(SWR.SWR_3304)
def test_a_card_without_run_units_or_priority_shows_no_empty_rows(qtbot) -> None:
    """Productive use: a fresh requirement nobody has scheduled appears on the board.
    Expected outcome: the card omits the rows it has nothing for instead of printing dashes."""
    widget = RequirementCardWidget(_card())
    qtbot.addWidget(widget)

    texts = _texts(widget)
    assert not [text for text in texts if text.strip() in {"—", "-", "n/a", "N/A"}]
    assert not [text for text in texts if text.startswith(("Priority:", "Epic:", "Agent:"))]
    assert "No execution units yet · Never run" in texts


@verifies(SWR.SWR_3304)
def test_a_card_states_its_exceptional_facts_in_words_not_only_in_colour(qtbot) -> None:
    """Productive use: a user cannot separate amber from red on a busy board.
    Expected outcome: "Specification changed" and the failing test are written on the card."""
    card = _card(
        alerts=("Specification changed since it was delivered", "Test evidence is failing"),
        evidence=_segments("failed"),
        health="verification-failed",
        health_label="Verification Failed",
    )
    widget = RequirementCardWidget(card)
    qtbot.addWidget(widget)

    joined = " ".join(_texts(widget))
    assert "Specification changed since it was delivered" in joined
    assert "Test evidence is failing" in joined
    assert "Health: Verification Failed" in joined
    assert "1 satisfied, 1 failed" in joined
    for alert in card.alerts:
        assert alert in widget.accessibleDescription()


@verifies(SWR.SWR_3304, SWR.SWR_3314)
def test_a_card_opens_from_the_keyboard_and_the_mouse(qtbot) -> None:
    """Productive use: a keyboard user opens a requirement they just tabbed to.
    Expected outcome: focus, Enter, Space and Ctrl+E all work without a mouse."""
    widget = RequirementCardWidget(_card())
    qtbot.addWidget(widget)
    widget.show()
    qtbot.waitExposed(widget)

    assert widget.focusPolicy() == Qt.FocusPolicy.StrongFocus
    with qtbot.waitSignal(widget.selected, timeout=1000) as caught:
        widget.setFocus()
    assert caught.args == ["SWR-4001"]

    for key in (Qt.Key.Key_Return, Qt.Key.Key_Space):
        with qtbot.waitSignal(widget.activated, timeout=1000) as opened:
            qtbot.keyClick(widget, key)
        assert opened.args == ["SWR-4001"]

    with qtbot.waitSignal(widget.evidence_activated, timeout=1000) as evidence:
        qtbot.keyClick(widget, Qt.Key.Key_E, Qt.KeyboardModifier.ControlModifier)
    assert evidence.args == ["SWR-4001"]

    # And the same two actions are reachable with the mouse, by name.
    with qtbot.waitSignal(widget.activated, timeout=1000):
        click_by_name(qtbot, widget, "Open SWR-4001", QPushButton)
    with qtbot.waitSignal(widget.evidence_activated, timeout=1000):
        click_by_name(qtbot, widget, "Open evidence for SWR-4001", QPushButton)


@verifies(SWR.SWR_3304, SWR.SWR_3312)
def test_a_card_repaints_in_place_when_its_requirement_changes(qtbot) -> None:
    """Productive use: a re-evaluation changes one requirement while the board is open.
    Expected outcome: the same card widget shows the new values — nothing is rebuilt."""
    widget = RequirementCardWidget(_card())
    qtbot.addWidget(widget)
    ring = widget.ring

    widget.set_card(
        _card(
            delivery="done",
            delivery_label="Done",
            health="needs-update",
            health_label="Needs Update",
            alerts=("Specification changed since it was delivered",),
            evidence=_segments("failed"),
        ),
    )

    assert widget.ring is ring, "the ring was replaced rather than repainted"
    texts = _texts(widget)
    assert "Done" in texts
    assert "Health: Needs Update" in texts
    assert "▲ Specification changed since it was delivered" in texts
    assert widget.card.delivery == "done"


@verifies(SWR.SWR_3303)
def test_a_blocked_card_names_its_blocker(qtbot) -> None:
    """Productive use: a requirement blocks on a missing dependency.
    Expected outcome: the blocked condition and its reason are readable on the card."""
    card = _card(
        delivery="blocked",
        delivery_label="Blocked",
        alerts=("Blocked: SWR-4000 has to be delivered first",),
    )
    widget = RequirementCardWidget(card)
    qtbot.addWidget(widget)

    assert is_blocked(card) is True
    assert blocker_sentence(card) == "Blocked: SWR-4000 has to be delivered first"
    assert "■ Blocked: SWR-4000 has to be delivered first" in _texts(widget)
    assert "Blocked" in _texts(widget)
    assert is_blocked(_card()) is False
    # The board's label and the engine's sentence are separable, so a surface
    # that has already said "blocked" can state the reason without saying it
    # twice — without rewording what the engine refused with (SWR-3602).
    assert blocker_reason(card) == "SWR-4000 has to be delivered first"
    assert blocker_reason(_card()) == ""


@verifies(SWR.SWR_3303)
def test_a_card_states_one_blocked_sentence_once_however_many_facts_carry_it(qtbot) -> None:
    """Productive use: a run fails, so the projection records both a blocked delivery state and
    a blocker against the requirement — two fields holding the engine's one sentence.
    Expected outcome: the card paints that sentence once instead of stacking the same words
    under two labels, and every other alert is left exactly as the engine stated it."""
    reason = "this workspace has no commit for a run to start from"
    card = _card(
        delivery="blocked",
        delivery_label="Blocked",
        # A run happened, so the missing test evidence is a fact about *this*
        # requirement rather than the day-one default every card carries.
        last_run_label="Last run 3 minutes ago (Failed)",
        alerts=(
            f"Blocked: {reason}",
            f"Blocked (run-failed): {reason}",
            "Test evidence is missing",
        ),
    )
    widget = RequirementCardWidget(card)
    qtbot.addWidget(widget)

    assert card_alerts(card) == (f"Blocked: {reason}", "Test evidence is missing")
    painted = [text for text in _texts(widget) if reason in text]
    assert painted == [f"■ Blocked: {reason}"], "the same sentence must not be painted twice"
    assert "▲ Test evidence is missing" in _texts(widget)


# ── what the card leaves out, and how it explains what it keeps ────────────


def _owed() -> tuple[EvidenceSegment, ...]:
    """The evidence of a requirement on a project's first day: three holes, two n/a."""
    return tuple(
        EvidenceSegment(kind=kind, label=label, state="missing", state_label="Missing")
        for kind, label in (
            ("implementation", "Implementation"),
            ("test", "Test"),
            ("verification", "Verification"),
        )
    ) + tuple(
        EvidenceSegment(
            kind=kind,
            label=label,
            state="not-applicable",
            state_label="Not Applicable",
            required=False,
        )
        for kind, label in (("integration", "Integration"), ("review", "Review"))
    )


@verifies(SWR.SWR_3304)
def test_a_card_nobody_has_run_does_not_raise_the_alert_every_card_would(qtbot) -> None:
    """Productive use: someone opens Rotaris on a project for the first time, where all sixty
    requirements owe implementation, test and verification evidence because nothing has run.
    Expected outcome: the board does not answer with a hundred and eighty identical amber
    lines — each card still states its evidence once, and the alert returns the moment a run
    makes it a fact about that requirement rather than about the project's age."""
    universal = (
        "Implementation evidence is missing",
        "Test evidence is missing",
        "Verification evidence is missing",
    )
    changed = "Specification changed since it was delivered"
    fresh = _card(alerts=(changed, *universal), evidence=_owed())
    widget = RequirementCardWidget(fresh)
    qtbot.addWidget(widget)

    assert card_alerts(fresh) == (changed,)
    assert not [text for text in _texts(widget) if "evidence is missing" in text]
    # Not hidden: the counts are on the card, once, and a screen reader still
    # hears every sentence the projection raised.
    assert "Evidence: 3 missing, 2 not applicable" in _texts(widget)
    for alert in fresh.alerts:
        assert alert in widget.accessibleDescription()

    ran = _card(
        alerts=universal,
        evidence=_owed(),
        last_run_label="Last run 2 minutes ago (Failed)",
    )
    widget.set_card(ran)

    assert card_alerts(ran) == universal
    assert "▲ Test evidence is missing" in _texts(widget)


@verifies(SWR.SWR_3304)
def test_how_bad_an_alert_is_survives_a_reader_who_cannot_separate_two_ambers(qtbot) -> None:
    """Productive use: a user scans a card carrying a failure, a stoppage and a notice at once.
    Expected outcome: the three read as three different severities — by glyph as well as by
    colour, because the palette's "stopped" amber and its "attention" amber are one hue."""
    card = _card(
        delivery="blocked",
        delivery_label="Blocked",
        alerts=(
            "Blocked: a decision is missing",
            "Test evidence is failing",
            "Specification changed since it was delivered",
        ),
        evidence=_segments("failed"),
    )
    widget = RequirementCardWidget(card)
    qtbot.addWidget(widget)

    assert alert_severity("Blocked: a decision is missing") == "blocked"
    assert alert_severity("Test evidence is failing") == "failed"
    assert alert_severity("Specification changed since it was delivered") == "attention"
    # A failure is never suppressed for a requirement that never ran: only the
    # universally missing evidence is, and this card has never run.
    assert len(card_alerts(card)) == 3

    painted = {
        label.text()[0]: label.styleSheet()
        for label in widget.findChildren(QLabel)
        if label.text()[:1] in {"✖", "■", "▲"}
    }
    assert set(painted) == {"✖", "■", "▲"}, "three severities, three marks"
    assert len(set(painted.values())) == 3, "three severities, three colours"
    # The text forms, not the saturated steps: these are sentences on a card, so
    # each owes 4.5:1 rather than the 3:1 an indicator shape owes.
    t = tokens()
    assert t.color.fail_text in painted["✖"]
    assert raise_to_readable(theme.delivery_color("blocked"), t) in painted["■"]
    assert t.color.wait_text in painted["▲"]


@verifies(SWR.SWR_3304)
def test_the_approval_axis_and_the_delivery_axis_do_not_share_one_badge(qtbot) -> None:
    """Productive use: a user reads `Approved` and `Blocked` side by side and has to tell
    which one they can change by dragging the card.
    Expected outcome: the delivery badge wears the pill, the lifecycle is quiet text, and both
    name their axis for a reader who sees no outline at all."""
    widget = RequirementCardWidget(_card(delivery="blocked", delivery_label="Blocked"))
    qtbot.addWidget(widget)

    assert "border:1px solid" in widget.delivery_chip.styleSheet()
    assert (
        raise_to_readable(theme.delivery_color("blocked"), tokens())
        in widget.delivery_chip.styleSheet()
    )
    assert "border:none" in widget.lifecycle_chip.styleSheet()
    assert "border:1px solid" not in widget.lifecycle_chip.styleSheet()
    assert widget.lifecycle_chip.accessibleName() == "Lifecycle: Approved"
    assert widget.delivery_chip.accessibleName() == "Delivery: Blocked"
    # Both are still words on the card, not an outline carrying a meaning alone.
    texts = _texts(widget)
    assert "Approved" in texts
    assert "Blocked" in texts


@verifies(SWR.SWR_3304, SWR.SWR_3314)
def test_every_word_the_card_invented_can_be_learned_from_the_card(qtbot) -> None:
    """Productive use: somebody meets Rotaris for the first time and reads `Health: Incomplete
    Traceability`, `Source: discovered`, `2 not applicable` and `No execution units yet`.
    Expected outcome: each of those carries its own plain-language explanation, and the card
    keeps the engine's word rather than inventing a friendlier one."""
    card = _card(
        facts=(RequirementFact(label="Source", value="discovered"),),
        health="incomplete-traceability",
        health_label="Incomplete Traceability",
        evidence=_owed(),
    )
    widget = RequirementCardWidget(card)
    qtbot.addWidget(widget)

    assert "Health: Incomplete Traceability" in _texts(widget)
    explanation = widget.health_label.toolTip()
    assert explanation == health_meaning("incomplete-traceability")
    assert "nothing recorded at all" in explanation
    assert widget.health_label.accessibleDescription() == explanation
    # Every health the engine can hand a card is explained, not just this one.
    origin = health_meaning("a-health-nobody-derives")
    for member in RequirementHealth:
        stated = health_meaning(str(member))
        assert stated != origin, f"{member} reaches the card with no explanation"
        assert stated.endswith(origin), "an explanation always says where health comes from"

    evidence_tip = widget.evidence_label.toolTip()
    assert "Implementation: Missing" in evidence_tip
    assert EVIDENCE_MEANING in evidence_tip
    assert "Not applicable" in EVIDENCE_MEANING
    assert widget.execution_label.toolTip() == EXECUTION_UNITS_MEANING

    source = [
        label for label in widget.findChildren(QLabel) if label.text() == "Source: discovered"
    ]
    assert source, "the source fact is on the card"
    assert source[0].toolTip() == fact_meaning("Source")
    assert "requirement source" in fact_meaning("Source")
    assert fact_meaning("Priority") == "", "a fact that explains itself gets no tooltip"


@verifies(SWR.SWR_3304)
def test_an_age_on_the_card_can_be_resolved_to_a_moment_without_leaving_it(qtbot) -> None:
    """Productive use: a user opens a board adopted this morning, where every card reads
    "Last change: just now", and has to say which of two requirements moved first — or quote
    one of them into a ticket where "3 hours ago" means nothing an hour later.
    Expected outcome: the card still reads at a glance, and the exact moment behind every age
    is one hover away and part of what a screen reader announces."""
    changed = "2026-08-20 14:05 UTC+02:00"
    ran = "2026-08-20 11:07 UTC+02:00"
    card = _card(
        facts=(RequirementFact(label="Last change", value="just now", detail=changed),),
        unit_count=1,
        units_label="1 execution unit",
        last_run_label="Last run 3 hours ago (Succeeded)",
        last_run_moment=ran,
    )
    widget = RequirementCardWidget(card)
    qtbot.addWidget(widget)

    # The face of the card is the relative form — that is what a board is scanned with.
    texts = _texts(widget)
    assert "Last change: just now" in texts
    assert "1 execution unit · Last run 3 hours ago (Succeeded)" in texts
    assert changed not in " ".join(texts)
    assert ran not in " ".join(texts)

    line = next(label for label in widget.findChildren(QLabel) if label.text().startswith("Last "))
    assert line.toolTip() == moment_hint(changed)
    assert changed in line.toolTip()
    assert line.accessibleDescription() == line.toolTip()
    # The run's moment joins the explanation the execution line already carried,
    # rather than replacing it.
    run_tip = widget.execution_label.toolTip()
    assert run_tip == f"{EXECUTION_UNITS_MEANING} {moment_hint(ran)}"
    assert widget.execution_label.accessibleDescription() == run_tip
    # …and both are announced, so a reader who cannot hover is not the one reader
    # who never learns when anything happened.
    assert changed in widget.accessibleDescription()
    assert ran in widget.accessibleDescription()

    # A card with no moment to state says nothing extra rather than "At .".
    widget.set_card(_card())

    assert widget.execution_label.toolTip() == EXECUTION_UNITS_MEANING
    assert moment_hint("") == ""


@verifies(SWR.SWR_3312, SWR.SWR_3314)
def test_the_selected_card_says_so_in_a_word_and_still_does_after_it_repaints(qtbot) -> None:
    """Productive use: the board's move strip says "Move SWR-4001 to: Ready" and the user has
    to find which of sixty cards that is — then a re-evaluation repaints that card in place.
    Expected outcome: the selected card wears the word `Selected`, not only a tint a reader
    may not see, and the mark survives the in-place update that changed its values."""
    widget = RequirementCardWidget(_card())
    qtbot.addWidget(widget)
    widget.show()
    qtbot.waitExposed(widget)

    assert widget.selected_tag.isVisible() is False
    assert widget.property("selected") == "false"
    assert "Not selected" in widget.accessibleDescription()
    # …but a hover on each of sixty cards does not spend a line saying so.
    assert "selected" not in widget.toolTip().lower()

    widget.set_selected(True)

    assert widget.selected_tag.isVisible() is True
    assert widget.selected_tag.text() == SELECTED_MARK
    assert widget.selected_tag.accessibleDescription() == SELECTED_MEANING
    assert widget.property("selected") == "true"
    assert widget.accessibleDescription().endswith(f". {SELECTED_MARK}")
    assert widget.toolTip().endswith(f". {SELECTED_MARK}")
    # Not a colour carrying a meaning on its own — and the word it is painted in
    # is readable where the card paints it. Read back out of what the tag
    # actually painted rather than compared to a named token, so retuning the
    # tag's variants cannot quietly drop it under the floor.
    t = tokens()
    painted_mark = re.search(
        r"(?<![\w-])color\s*:\s*(#[0-9a-fA-F]{6})", widget.selected_tag.styleSheet()
    )
    assert painted_mark, f"the mark has no colour: {widget.selected_tag.styleSheet()}"
    ratio = theme.contrast_ratio(painted_mark.group(1), t.color.readable_ground)
    assert ratio >= t.min_text_contrast, f"the selection mark reads at {ratio:.2f}:1"

    # The board repaints a changed card in place rather than rebuilding it
    # (SWR-3312); a mark that survived only the first paint would be right until
    # the moment something happened.
    widget.set_card(_card(delivery="running", delivery_label="Running"))

    assert widget.selected_tag.isVisible() is True, "a repaint erased the selection mark"
    assert widget.property("selected") == "true"
    assert SELECTED_MARK in widget.accessibleDescription()
    assert "Running" in _texts(widget)

    widget.set_selected(False)

    assert widget.selected_tag.isVisible() is False
    assert widget.property("selected") == "false"
    assert "Not selected" in widget.accessibleDescription()


@verifies(SWR.SWR_3306)
def test_the_evidence_action_says_which_of_the_two_things_it_will_open(qtbot) -> None:
    """Productive use: a user presses `Evidence` on a card that holds no evidence whatsoever.
    Expected outcome: the action still leads somewhere useful — the list of what is owed — and
    says so beforehand instead of promising records that do not exist."""
    owes_everything = _card(evidence=_owed())
    widget = RequirementCardWidget(owes_everything)
    qtbot.addWidget(widget)

    hint = widget.evidence_button.toolTip()
    assert hint == evidence_button_hint(owes_everything)
    assert "Nothing is recorded" in hint
    assert "still owes" in hint
    assert widget.evidence_button.isEnabled(), "the list of what is missing is the point"
    assert widget.evidence_button.accessibleDescription() == hint

    widget.set_card(_card())

    assert "implementation sites" in widget.evidence_button.toolTip()
    assert widget.evidence_button.accessibleName() == "Open evidence for SWR-4001"


@verifies(SWR.SWR_3305)
def test_the_ring_sits_beside_the_evidence_it_counts_not_in_the_busy_corner(qtbot) -> None:
    """Productive use: a user scans a board of cards that all say `Never run`.
    Expected outcome: the ring is a meter next to the sentence it measures, not a glyph alone
    in the top-right corner where this desktop puts its progress indicators."""
    widget = RequirementCardWidget(_card(evidence=_owed()))
    qtbot.addWidget(widget)
    widget.resize(320, widget.sizeHint().height())
    widget.show()
    qtbot.waitExposed(widget)

    ring, evidence, identifier = widget.ring, widget.evidence_label, widget.id_label
    assert widget.header_row.indexOf(ring) == -1, "the ring left the card's header"
    assert ring.geometry().top() > identifier.geometry().bottom()
    assert ring.geometry().right() <= evidence.geometry().left()
    assert abs(ring.geometry().center().y() - evidence.geometry().center().y()) <= 4
    assert "Never run" in widget.execution_label.text()


@verifies(SWR.SWR_3304)
def test_a_requirement_id_is_not_painted_on_a_monospace_grid(qtbot) -> None:
    """Productive use: a user reads `SWR-FR-ADM-001` off a card and types it into a search box.
    Expected outcome: the id is painted in the interface face, where a hyphen is a hyphen —
    a mono grid gives it the advance width of a letter and it reads as an en dash."""
    leaf = RequirementCardWidget(_card("SWR-FR-ADM-001"))
    epic = EpicCard(_card("SWR-FR-ADM", is_epic=True), ())
    qtbot.addWidget(leaf)
    qtbot.addWidget(epic)

    for label in (leaf.id_label, epic.id_label):
        style = label.styleSheet()
        assert tokens().type.body in style
        assert tokens().type.mono not in style
        # Not tracked out like a section kicker. Checked on the font rather than
        # in the stylesheet: QSS parses `letter-spacing` and then discards it, so
        # a stylesheet assertion would pass whatever the label really renders.
        assert label.font().letterSpacing() == QFont().letterSpacing()
    assert leaf.id_label.text() == "SWR-FR-ADM-001"
    assert "–" not in leaf.id_label.text(), "the id carries hyphens; only the face made them long"


# ── the epic card (SWR-3308) ───────────────────────────────────────────────


def _children() -> tuple[RequirementCard, ...]:
    return (
        _card("SWR-4101", delivery="done", delivery_label="Done", evidence_state="satisfied"),
        _card("SWR-4102", delivery="running", delivery_label="Running", evidence_state="missing"),
        _card(
            "SWR-4103",
            delivery="blocked",
            delivery_label="Blocked",
            evidence_state="missing",
            alerts=("Blocked: waiting for a decision",),
        ),
        _card("SWR-4104", delivery="backlog", delivery_label="Backlog", evidence_state="satisfied"),
    )


@verifies(SWR.SWR_3308)
def test_an_epic_card_reports_the_counts_and_percentage_its_children_imply(qtbot) -> None:
    """Productive use: an owner checks how far an epic has come.
    Expected outcome: the engine's progress plus the per-state counts, traceability and blockers."""
    epic = _card("SWR-4100", is_epic=True, epic_label="1 of 4 requirements done")
    widget = EpicCard(epic, _children())
    qtbot.addWidget(widget)

    texts = " ".join(_texts(widget))
    assert "1 of 4 requirements done" in texts, "the epic's own progress is the engine's sentence"
    assert "Done 1" in texts
    assert "Running 1" in texts
    assert "Blocked 1" in texts
    assert "Backlog 1" in texts
    assert "Traceability 50%" in texts
    assert "2 of 4 children have full evidence" in texts
    assert "1 running · 1 blocked" in texts
    assert widget.children_cards == _children()


@verifies(SWR.SWR_3308)
def test_an_epic_without_children_says_so_instead_of_reporting_full_progress(qtbot) -> None:
    """Productive use: someone opens a brand-new epic that has no requirements yet.
    Expected outcome: the card states the epic is empty and never claims 100 %."""
    widget = EpicCard(_card("SWR-4200", is_epic=True), ())
    qtbot.addWidget(widget)

    texts = " ".join(_texts(widget))
    assert "No child requirements" in texts
    assert "100%" not in texts
    assert "%" not in texts
    assert widget.expand_button.isEnabled() is False
    assert "no children" in widget.expand_button.toolTip().lower()


@verifies(SWR.SWR_3308)
def test_an_epic_card_carries_no_delivery_action_area_at_all(qtbot) -> None:
    """Productive use: a user tries to drag an epic into Running.
    Expected outcome: an epic has no delivery affordance to reach — absent, not disabled."""
    epic = EpicCard(_card("SWR-4100", is_epic=True, epic_label="1 of 4 done"), _children())
    leaf = RequirementCardWidget(_card())
    qtbot.addWidget(epic)
    qtbot.addWidget(leaf)

    assert EpicCard.ACCEPTS_DELIVERY_ACTIONS is False
    assert epic.delivery_action_area is None
    assert epic.findChild(type(leaf.delivery_action_area), DELIVERY_ACTION_AREA) is None
    # …while a requirement card has exactly the area a later slice attaches to.
    assert RequirementCardWidget.ACCEPTS_DELIVERY_ACTIONS is True
    assert leaf.delivery_action_area is not None
    assert leaf.delivery_action_area.objectName() == DELIVERY_ACTION_AREA
    # Nothing on the epic offers to move it through delivery.
    for name in accessible_names(epic, QPushButton):
        assert not any(verb in name.lower() for verb in ("start", "ready", "move", "approve"))


@verifies(SWR.SWR_3308, SWR.SWR_3314)
def test_an_epic_expands_to_its_children_by_mouse_and_by_keyboard(qtbot) -> None:
    """Productive use: an owner drills from an epic into the child that is blocked.
    Expected outcome: the expand action is reachable both ways and names the epic."""
    widget = EpicCard(_card("SWR-4100", is_epic=True, epic_label="1 of 4 done"), _children())
    qtbot.addWidget(widget)
    widget.show()
    qtbot.waitExposed(widget)

    button = find_by_accessible_name(widget, "Show the children of SWR-4100", QPushButton)
    with qtbot.waitSignal(widget.expand_requested, timeout=1000) as caught:
        qtbot.mouseClick(button, Qt.MouseButton.LeftButton)
    assert caught.args == ["SWR-4100"]

    widget.setFocus()
    with qtbot.waitSignal(widget.expand_requested, timeout=1000) as by_key:
        qtbot.keyClick(widget, Qt.Key.Key_Space)
    assert by_key.args == ["SWR-4100"]
