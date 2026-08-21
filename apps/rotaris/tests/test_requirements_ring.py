"""The traceability ring: segments, states, and the words beside the colour.

The ring is the one place on the board where a wrong answer is invisible — a
green circle over a failing test looks exactly like a green circle over a passing
one. So these tests assert the geometry, the state carried into each segment, the
sentence the ring announces, and the contrast every colour holds against the card
it is painted on (SWR-3305).
"""

from __future__ import annotations

import pytest
from a11y import AA_NON_TEXT, contrast_ratio
from PySide6.QtCore import Qt
from rotaris_core.reqtocode import SWR, verifies

from rotaris import theme
from rotaris.models.requirements_state import EvidenceSegment
from rotaris.theme import tokens
from rotaris.widgets.evidence_ring import (
    EMPTY_RING_REASON,
    EvidenceRing,
    ring_arcs,
    ring_description,
    ring_summary,
)

pytestmark = pytest.mark.unit

#: Every state the engine can report for one obligation, with the label a user
#: reads. Kept beside the tests rather than imported from the engine so a
#: renamed token fails here instead of silently painting the board grey.
STATES: tuple[tuple[str, str], ...] = (
    ("satisfied", "Satisfied"),
    ("stale", "Stale"),
    ("failed", "Failed"),
    ("missing", "Missing"),
    ("not-applicable", "Not applicable"),
)


def _segment(kind: str, state: str, detail: str = "") -> EvidenceSegment:
    label = kind.capitalize()
    state_label = dict(STATES)[state]
    return EvidenceSegment(
        kind=kind,
        label=label,
        state=state,
        state_label=state_label,
        detail=detail,
    )


def _obligations() -> tuple[EvidenceSegment, ...]:
    """The five obligations of a requirement whose covering test fails."""
    return (
        _segment("implementation", "satisfied"),
        _segment("test", "failed", "covering-test-failed"),
        _segment("verification", "stale"),
        _segment("execution", "missing"),
        _segment("integration", "not-applicable"),
    )


@verifies(SWR.SWR_3305)
def test_one_segment_per_obligation_divides_the_ring_evenly() -> None:
    """Productive use: a user glances at a card and counts the obligations.
    Expected outcome: one arc per obligation, evenly spaced and never overlapping."""
    arcs = ring_arcs(_obligations())

    assert len(arcs) == 5
    assert [arc.segment.kind for arc in arcs] == [
        "implementation",
        "test",
        "verification",
        "execution",
        "integration",
    ]
    step = 360.0 / 5
    for index, arc in enumerate(arcs):
        # Clockwise from twelve o'clock, one slot per obligation.
        assert arc.start_angle == pytest.approx(arcs[0].start_angle - index * step)
        # A gap between neighbours: the span is shorter than its slot, so two
        # segments never touch and five colours never read as one.
        assert 0 < abs(arc.span_angle) < step
    assert len({round(abs(arc.span_angle), 6) for arc in arcs}) == 1


@verifies(SWR.SWR_3305)
def test_complete_traceability_with_a_failing_test_is_not_a_green_ring() -> None:
    """Productive use: a delivered requirement's covering test starts failing.
    Expected outcome: the ring paints a failing segment rather than a full green circle."""
    arcs = ring_arcs(_obligations())

    colours = {arc.segment.kind: arc.color for arc in arcs}
    assert colours["test"] == theme.evidence_color("failed")
    assert colours["implementation"] == theme.evidence_color("satisfied")
    assert colours["verification"] == theme.evidence_color("stale")
    assert colours["execution"] == theme.evidence_color("missing")
    assert colours["integration"] == theme.evidence_color("not-applicable")
    assert len(set(colours.values())) == 5, "two states share a colour"


@verifies(SWR.SWR_3305)
def test_a_requirement_with_no_obligations_states_why_the_ring_is_empty() -> None:
    """Productive use: a user opens a requirement that owes no evidence yet.
    Expected outcome: an empty ring with a stated reason, never a green one."""
    assert ring_arcs(()) == ()
    assert ring_description(()) == EMPTY_RING_REASON
    assert ring_summary(()) == "No obligations"
    assert "no evidence" in EMPTY_RING_REASON.lower()


@verifies(SWR.SWR_3305)
def test_the_accessible_description_names_every_segment_and_its_state() -> None:
    """Productive use: a screen-reader user reaches the ring on a card.
    Expected outcome: every segment and its state is announced, with the engine's reason."""
    segments = _obligations()

    description = ring_description(segments)

    for segment in segments:
        assert f"{segment.label}: {segment.state_label}" in description
    assert "covering-test-failed" in description
    # The summary the card prints beside the ring carries the same counts.
    summary = ring_summary(segments)
    for _, label in STATES:
        assert label.lower() in summary


@verifies(SWR.SWR_3305)
def test_every_ring_colour_stays_visible_against_the_card_it_is_painted_on() -> None:
    """Productive use: a user with low vision looks at a ring on a card surface.
    Expected outcome: every segment clears the 3:1 non-text floor against the card ground.

    3:1 rather than 4.5:1 because a segment is a shape, not a word: the state is
    written out beside the ring and inside its accessible description
    (SWR-3304), so the arc carries no meaning the reader has to decode from the
    colour alone. The floor is not optional even so — a segment nobody can pick
    out of the track is a segment that cannot be counted.
    """
    ground = tokens().color.surface
    too_faint = {
        state: round(contrast_ratio(theme.evidence_color(state), ground), 2)
        for state, _ in STATES
        if contrast_ratio(theme.evidence_color(state), ground) < AA_NON_TEXT
    }

    assert not too_faint, f"ring segments below {AA_NON_TEXT}:1 on a card: {too_faint}"


@verifies(SWR.SWR_3305, SWR.SWR_3306)
def test_the_ring_opens_by_keyboard_and_by_mouse(qtbot) -> None:
    """Productive use: a keyboard user opens the evidence behind a red ring.
    Expected outcome: Enter, Space and a click all open it, and the widget takes focus."""
    ring = EvidenceRing()
    qtbot.addWidget(ring)
    ring.set_segments(_obligations())
    ring.show()
    qtbot.waitExposed(ring)

    assert ring.focusPolicy() == Qt.FocusPolicy.StrongFocus
    assert ring.accessibleName() == "Traceability ring"
    assert "Failed" in ring.accessibleDescription()

    ring.setFocus()
    for key in (Qt.Key.Key_Return, Qt.Key.Key_Space):
        with qtbot.waitSignal(ring.activated, timeout=1000):
            qtbot.keyClick(ring, key)
    with qtbot.waitSignal(ring.activated, timeout=1000):
        qtbot.mouseClick(ring, Qt.MouseButton.LeftButton, pos=ring.rect().center())


@verifies(SWR.SWR_3305)
def test_repainting_the_ring_replaces_its_segments_and_its_description(qtbot) -> None:
    """Productive use: a re-evaluation turns a failing obligation green.
    Expected outcome: the same widget repaints and re-announces the new state."""
    ring = EvidenceRing()
    qtbot.addWidget(ring)
    ring.set_segments(_obligations())
    assert theme.evidence_color("failed") in {arc.color for arc in ring.arcs}

    ring.set_segments((_segment("test", "satisfied"),))

    assert [arc.color for arc in ring.arcs] == [theme.evidence_color("satisfied")]
    assert ring.accessibleDescription() == "Traceability: Test: Satisfied."
    assert ring.toolTip() == ring.accessibleDescription()
