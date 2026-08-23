"""Sweep the seven primary views for the two accessibility defects that hide.

A control wired to the wrong slot fails a behavioural test immediately. A
control a screen reader announces as nothing, or a caption at 2.3:1 against its
card, fails nothing at all — the app works perfectly for whoever wrote it. These
sweeps walk every view Rotaris ships and fail on both, so the next unnamed combo
box or too-dim token is caught in the change that introduces it rather than by a
user who cannot read the screen.

The colour thresholds are WCAG 2.2 AA as ``apps/rotaris/AGENTS.md`` states them:
4.5:1 for body text, 3:1 for large text and for interactive boundaries.
"""

from __future__ import annotations

import pytest
from a11y import (
    AA_NON_TEXT,
    AA_NORMAL_TEXT,
    boundary_grounds,
    contrast_ratio,
    qss_background_by_object_name,
    qss_foreground_by_object_name,
    text_contrast_violations,
    text_grounds,
    unnamed_controls,
)
from PySide6.QtWidgets import QTabWidget
from rotaris_core.reqtocode import SWR, verifies
from ui_query import settle

from rotaris import theme
from rotaris.models import sample_store
from rotaris.theme import tokens
from rotaris.views.main_window import MainWindow

pytestmark = pytest.mark.integration

# The seven primary views Rotaris ships: the six of SWR-2000 plus the
# requirements board SWR-3301 adds between Mission and Git. Listed in nav order,
# and deliberately without an exemption for the new one (SWR-3314).
PRIMARY_VIEWS = (
    "dashboard",
    "workspace",
    "mission",
    "requirements",
    "git",
    "library",
    "settings",
)


@pytest.fixture
def window(qtbot):
    """A fully populated window, shown, so every view has something to sweep.

    Destroyed rather than merely closed. This file is the suite's heaviest
    producer of shown top-level windows, and leaving them alive makes every
    later test in the same worker walk them — see `dispose_window` in
    `conftest.py` for the measurement.
    """
    from conftest import dispose_window

    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.resize(1440, 900)
    window.show()
    qtbot.waitExposed(window)
    yield window
    dispose_window(window)


def _shown(window: MainWindow, qtbot, name: str):
    """Bring view ``name`` forward; a hidden view renders nothing to measure."""
    window.show_view(name)
    settle(qtbot)
    return getattr(window, name)


def _tab_pages(view) -> list[int]:
    """Indices of every tab in ``view``, or a single pass for a flat view."""
    tabs = view.findChildren(QTabWidget)
    return list(range(tabs[0].count())) if tabs else [0]


@pytest.mark.parametrize("view_name", PRIMARY_VIEWS)
@verifies(SWR.SWR_2032)
def test_every_control_in_a_primary_view_announces_a_name(window, qtbot, view_name) -> None:
    """Productive use: a screen-reader user tabs through a Rotaris view.
    Expected outcome: every control they land on is announced by a name rather than silence."""
    view = _shown(window, qtbot, view_name)

    unnamed = unnamed_controls(view)

    assert not unnamed, (
        f"{view_name} has {len(unnamed)} control(s) a screen reader announces as "
        f"nothing; give each a setAccessibleName or visible text: {unnamed}"
    )


@pytest.mark.parametrize("view_name", PRIMARY_VIEWS)
@verifies(SWR.SWR_2032)
def test_no_text_in_a_primary_view_falls_below_its_readable_threshold(
    window, qtbot, view_name
) -> None:
    """Productive use: a user with low vision reads a Rotaris view on a normal display.
    Expected outcome: every rendered label clears the WCAG AA ratio for its size."""
    view = _shown(window, qtbot, view_name)
    tabs = view.findChildren(QTabWidget)

    violations = []
    for index in _tab_pages(view):
        if tabs:
            # Only the front tab is rendered, so each one needs its own pass.
            tabs[0].setCurrentIndex(index)
            settle(qtbot)
        violations.extend(text_contrast_violations(view))

    assert not violations, f"{view_name} renders unreadable text:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(v) for v in violations})
    )


@pytest.mark.parametrize("view_name", PRIMARY_VIEWS)
@verifies(SWR.SWR_3702)
def test_every_dropdown_in_a_primary_view_is_the_fitted_select(window, qtbot, view_name) -> None:
    """Productive use: a user shrinks the window and reads a dropdown.

    Expected outcome: every dropdown in the view is the fitted `Select` — its
    width follows the selected entry and an over-long value is elided and stated
    whole. A raw `QComboBox` is the one that swallows its selected value when
    space gets tight.
    """
    from PySide6.QtWidgets import QComboBox

    from rotaris.widgets import Select

    view = _shown(window, qtbot, view_name)
    tabs = view.findChildren(QTabWidget)
    for index in _tab_pages(view):
        if tabs:
            tabs[0].setCurrentIndex(index)
            settle(qtbot)

    raw = [combo for combo in view.findChildren(QComboBox) if not isinstance(combo, Select)]
    assert not raw, f"{view_name} has dropdowns that can swallow their value: {raw}"


@verifies(SWR.SWR_2093)
def test_secondary_text_tokens_stay_readable_on_every_ground() -> None:
    """Productive use: a designer reuses a muted token for a caption on any surface.
    Expected outcome: the token clears 4.5:1 on every ground Rotaris paints text on."""
    color = tokens().color
    # The *_text forms, not the plain ones. The design system paints a status
    # dot in the saturated middle of a ramp and the word beside it several steps
    # lighter, because a shape owes 3:1 and a label owes 4.5:1. Checking the dot
    # colours here would fail honestly; checking only them would pass while the
    # labels were unreadable.
    text_tokens = {
        "text": color.text,
        "text_secondary": color.text_secondary,
        "text_tertiary": color.text_tertiary,
        "accent_300": color.accent[300],
        "run_text": color.run_text,
        "wait_text": color.wait_text,
        "done_text": color.done_text,
        "info_text": color.info_text,
        "fail_text": color.fail_text,
    }

    too_dim = {
        f"{name} on {ground}": round(contrast_ratio(value, ground), 2)
        for name, value in text_tokens.items()
        for ground in text_grounds()
        if contrast_ratio(value, ground) < AA_NORMAL_TEXT
    }

    assert not too_dim, f"text tokens below {AA_NORMAL_TEXT}:1: {too_dim}"


@verifies(SWR.SWR_2093)
def test_interactive_boundaries_and_focus_ring_stay_visible_on_every_ground() -> None:
    """Productive use: a keyboard user hunts for the focused field on a card or a hovered row.
    Expected outcome: the boundary and focus tokens clear 3:1 on every ground they sit on."""
    palette = tokens().color
    boundary_tokens = {"border_strong": palette.border_strong, "focus": palette.focus}

    too_faint = {
        f"{name} on {ground}": round(contrast_ratio(value, ground), 2)
        for name, value in boundary_tokens.items()
        for ground in boundary_grounds()
        if contrast_ratio(value, ground) < AA_NON_TEXT
    }

    assert not too_faint, f"boundary tokens below {AA_NON_TEXT}:1: {too_faint}"


@verifies(SWR.SWR_2093)
def test_primary_button_label_stays_readable_across_its_fill_states() -> None:
    """Productive use: a user hovers and presses the primary action on a screen.
    Expected outcome: the label stays readable on the rest, hover and pressed fills alike."""
    from rotaris.theme.qss import primary_button_fills

    accent = tokens().color.accent
    # The fills the stylesheet actually paints, not ramp steps that resemble
    # them: the hover fill is clamped to keep this very label readable, and a
    # test that recomputed it would be checking its own arithmetic.
    fills = primary_button_fills(tokens())

    unreadable = {
        state: round(contrast_ratio(accent[100], fill), 2)
        for state, fill in fills.items()
        if contrast_ratio(accent[100], fill) < AA_NORMAL_TEXT
    }

    assert not unreadable, f"primary button label below {AA_NORMAL_TEXT}:1: {unreadable}"


@verifies(SWR.SWR_2093)
def test_disabled_text_reads_as_unavailable_without_vanishing() -> None:
    """Productive use: a user scans a screen for which actions are currently available.
    Expected outcome: disabled text is clearly dimmer than live text yet still perceivable."""
    color = tokens().color
    disabled = contrast_ratio(color.text_disabled, color.disabled_surface)
    live = contrast_ratio(color.text, color.bg)

    assert disabled < live / 2, "disabled text is not visibly dimmer than live text"
    assert disabled >= AA_NON_TEXT, (
        f"disabled text is {disabled:.2f}:1, too faint to confirm a control exists"
    )


@verifies(SWR.SWR_2421, SWR.SWR_2435)
def test_every_persona_label_stays_readable_and_distinct_from_its_siblings() -> None:
    """Productive use: a user follows several concurrent agents by their transcript labels.
    Expected outcome: each persona and each of its instances is readable and tells itself apart."""
    unreadable = {
        name: round(contrast_ratio(theme.persona_color(name), ground), 2)
        for name in theme.known_personas()
        for ground in text_grounds()
        if contrast_ratio(theme.persona_color(name), ground) < AA_NORMAL_TEXT
    }
    assert not unreadable, f"persona base colours below {AA_NORMAL_TEXT}:1: {unreadable}"

    for name in theme.known_personas():
        # One shade per bucket: the stride is coprime with the bucket count, so
        # this many sequential instances walks the whole ramp.
        shades = [
            theme.persona_instance_color(name, f"{name}-{index}")
            for index in range(1, theme.shade_count() + 1)
        ]
        faint = {
            shade: round(contrast_ratio(shade, ground), 2)
            for shade in shades
            for ground in text_grounds()
            if contrast_ratio(shade, ground) < AA_NORMAL_TEXT
        }
        assert not faint, f"{name} instance shades below {AA_NORMAL_TEXT}:1: {faint}"
        assert len(set(shades)) == len(shades), (
            f"{name} gives two concurrent instances the same colour: {shades}"
        )


@verifies(SWR.SWR_2032)
def test_the_sweep_reports_a_control_that_lost_its_name(qtbot) -> None:
    """Productive use: someone adds a control to a view and forgets to name it.
    Expected outcome: the sweep names the offending control instead of passing quietly."""
    from PySide6.QtWidgets import QComboBox, QVBoxLayout, QWidget

    root = QWidget()
    qtbot.addWidget(root)
    layout = QVBoxLayout(root)
    nameless = QComboBox()
    nameless.setObjectName("modelPicker")
    layout.addWidget(nameless)

    reported = unnamed_controls(root)

    assert len(reported) == 1
    assert "modelPicker" in reported[0]


@verifies(SWR.SWR_2032)
def test_the_sweep_reports_a_label_too_dim_for_its_card(qtbot) -> None:
    """Productive use: someone styles a new caption with a token that is too dark.
    Expected outcome: the sweep reports the colours, size and shortfall needed to fix it."""
    from PySide6.QtWidgets import QLabel, QVBoxLayout, QWidget

    card = QWidget()
    qtbot.addWidget(card)
    card.setObjectName("card")
    layout = QVBoxLayout(card)
    caption = QLabel("last synced 4 minutes ago")
    caption.setStyleSheet(f"font-size:10px;color:{tokens().color.neutral[700]};")
    layout.addWidget(caption)
    card.show()
    qtbot.waitExposed(card)

    violations = text_contrast_violations(card)

    assert len(violations) == 1
    assert violations[0].foreground == tokens().color.neutral[700]
    assert violations[0].background == tokens().color.surface
    assert violations[0].required == AA_NORMAL_TEXT
    assert violations[0].ratio < AA_NORMAL_TEXT


@verifies(SWR.SWR_2093)
def test_qss_defaults_match_the_resolver() -> None:
    """Productive use: someone retunes a token in the stylesheet and reruns the sweep.
    Expected outcome: the sweep's copy of the stylesheet defaults is caught out of date."""
    qss = theme.build_qss(tokens())

    stale = [
        f"{selector}#{object_name} -> {token}"
        for mapping, selector, declaration in (
            (qss_foreground_by_object_name(), "QLabel", "color"),
            (qss_background_by_object_name(), "QWidget-or-QFrame", "background"),
        )
        for object_name, token in mapping.items()
        if f"#{object_name}" not in qss or f"{declaration}: {token}" not in qss
    ]

    assert not stale, (
        "a11y.py mirrors stylesheet defaults that build_qss() no longer declares; "
        f"update the mapping: {stale}"
    )
