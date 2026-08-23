"""The design-system layer: one source of truth, and the primitives on it (SWR-2093).

SWR-2093's rule — every colour, spacing and radius resolves through one layer —
is unchanged by SWR-3700. What changed is that the layer now describes a theme
rather than naming a palette, so these tests read the active theme instead of a
module constant.
"""

from __future__ import annotations

import pytest
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies

from rotaris import theme
from rotaris.theme import tokens

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_2093, SWR.SWR_3700)
def test_the_stylesheet_is_generated_from_the_active_theme(qtbot) -> None:
    """Productive use: a token is retuned and every styled surface picks it up.

    The stylesheet contains the theme's own resolved values and none of the CSS
    the design system was authored in — an unresolved `oklch()` or `var()` would
    be silently dropped by Qt's parser, leaving the rule with no effect at all.
    """
    active = tokens()
    qss = theme.build_qss(active)

    assert isinstance(qss, str) and qss
    assert str(active.color.bg) in qss
    assert str(active.color.accent.base) in qss or str(active.color.accent[600]) in qss
    assert str(active.color.text_disabled) in qss

    for unresolved in ("oklch(", "color-mix(", "var(--"):
        assert unresolved not in qss, f"{unresolved} reached the stylesheet unresolved"


@verifies(SWR.SWR_2093, SWR.SWR_3700)
def test_the_stylesheet_declares_no_property_qt_silently_discards(qtbot) -> None:
    """Productive use: a designer reads the stylesheet and believes what it says.

    QSS accepts these and does nothing with them. A rule using one looks correct
    in review and changes nothing on screen, so they are handled as fonts and
    effects instead — see rotaris.theme.qss's module docstring.
    """
    qss = theme.build_qss(tokens())

    for ignored in ("letter-spacing", "text-transform", "box-shadow", "font-variant-numeric"):
        assert ignored not in qss, (
            f"{ignored!r} is in the stylesheet, where Qt will accept and discard it"
        )


@verifies(SWR.SWR_2093, SWR.SWR_2124)
def test_a_checked_toggle_button_reads_as_pressed(qtbot) -> None:
    """Productive use: a user glances at a toggle button to see whether it is on.
    Expected outcome: the checked state is painted, not left to the label alone."""
    active = tokens()
    qss = theme.build_qss(active)

    assert 'QPushButton[variant="ghost"]:checked' in qss
    assert 'QPushButton[variant="secondary"]:checked' in qss
    assert str(active.color.accent_tint_strong) in qss
    assert (
        theme.contrast_ratio(active.color.accent[200], active.color.surface)
        >= active.min_text_contrast
    )


@verifies(SWR.SWR_2093)
def test_every_button_variant_is_styled_in_every_state(qtbot) -> None:
    """A variant with no disabled rule reads as available when it is not."""
    qss = theme.build_qss(tokens())

    for variant in ("primary", "secondary", "ghost", "danger", "warning", "link"):
        assert f'QPushButton[variant="{variant}"]' in qss, f"{variant} has no rule"
    assert "QPushButton:disabled" in qss
    assert "QPushButton:focus" in qss
    assert "QComboBox:disabled" in qss
    assert "QAbstractSpinBox:disabled" in qss


@verifies(SWR.SWR_3702)
def test_dropdowns_resolve_the_compact_height_and_inputs_the_full_one(qtbot) -> None:
    """Productive use: a settings card stacks pickers beside text fields.

    Expected outcome: the QSS pins each control's height to its token — the
    compact one for dropdowns, the full typing target for inputs — so a denser
    picker never shrinks the text field beside it and vice versa.
    """
    active = tokens()
    qss = theme.build_qss(active)

    def _rule(selector: str) -> str:
        start = qss.index(f"{selector} {{")
        return qss[start : qss.index("}", start) + 1]

    assert f"min-height: {active.size.control_height_compact}px" in _rule("QComboBox")
    assert f"min-height: {active.size.control_height}px" in _rule("QLineEdit")


@verifies(SWR.SWR_2124)
def test_action_availability_exposes_disabled_reason_with_enabled_help(qtbot) -> None:
    from rotaris.widgets import make_availability_help, set_action_availability

    control = QPushButton("Pause")
    help_button = make_availability_help("Pause")
    qtbot.addWidget(control)
    qtbot.addWidget(help_button)

    set_action_availability(
        control,
        enabled=False,
        reason="Start or continue a run to enable run controls.",
        help_button=help_button,
    )

    assert control.isEnabled() is False
    assert "Start or continue" in control.accessibleDescription()
    assert help_button.isVisible() is True
    assert help_button.isEnabled() is True
    assert "Start or continue" in help_button.accessibleDescription()

    set_action_availability(control, enabled=True, help_button=help_button)

    assert control.isEnabled() is True
    assert control.accessibleDescription() == ""
    assert help_button.isHidden() is True


@verifies(SWR.SWR_2093)
def test_surface_primitives_construct(qtbot) -> None:
    """Card / SectionLabel / Tag surface primitives build without error."""
    from rotaris.widgets import Card, SectionLabel, Tag

    card = Card()
    qtbot.addWidget(card)
    label = SectionLabel("OVERVIEW")
    qtbot.addWidget(label)
    tag = Tag("beta")
    qtbot.addWidget(tag)

    assert card is not None
    assert label.text() == "OVERVIEW"
    assert tag.text() == "beta"


@verifies(SWR.SWR_2093)
def test_indicator_primitives_render_state(qtbot) -> None:
    """Painted indicator primitives accept and reflect their state."""
    from rotaris.widgets import ContextBar, Sparkline, StatusDot

    spark = Sparkline()
    qtbot.addWidget(spark)
    spark.set_values([1, 4, 2, 6, 3])

    bar = ContextBar()
    qtbot.addWidget(bar)

    dot = StatusDot()
    qtbot.addWidget(dot)

    assert spark is not None and bar is not None and dot is not None
