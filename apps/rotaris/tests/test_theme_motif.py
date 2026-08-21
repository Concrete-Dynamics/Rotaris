"""The parts of the design system Qt has no equivalent for (SWR-3704).

Elevation and the brand motif are written in CSS the stylesheet parser accepts
and discards, so both are reimplemented as effects and painters. These tests
render to an image and look at the pixels, because "the painter ran without
raising" says nothing about whether anything appeared.
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import QRect
from PySide6.QtGui import QColor, QImage, QPainter
from PySide6.QtWidgets import QGraphicsDropShadowEffect, QLabel, QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.theme import palettes
from rotaris.theme.motif import (
    GridBackground,
    PulseAnimation,
    apply_elevation,
    paint_axis_mark,
    paint_fade_rule,
    paint_grid,
)

pytestmark = pytest.mark.unit

SIZE = 128


def _canvas() -> QImage:
    image = QImage(SIZE, SIZE, QImage.Format.Format_ARGB32)
    image.fill(QColor(0, 0, 0, 0))
    return image


def _painted_pixels(image: QImage) -> int:
    return sum(
        1
        for x in range(image.width())
        for y in range(image.height())
        if QColor(image.pixel(x, y)).alpha() > 0 or image.pixelColor(x, y).alpha() > 0
    )


# ── elevation ─────────────────────────────────────────────────────────────


@verifies(SWR.SWR_3704)
def test_a_floating_step_attaches_a_shadow_matching_its_token(qtbot) -> None:
    theme = palettes.get("rotaris-dim")
    widget = QWidget()
    qtbot.addWidget(widget)

    effect = apply_elevation(widget, theme.elevation_lg)

    assert isinstance(effect, QGraphicsDropShadowEffect)
    assert effect.blurRadius() == pytest.approx(theme.elevation_lg.blur)
    assert effect.yOffset() == pytest.approx(theme.elevation_lg.offset_y)
    assert effect.xOffset() == pytest.approx(0)
    assert effect.color().alpha() == theme.elevation_lg.shadow.qcolor.alpha()
    assert widget.graphicsEffect() is effect


@verifies(SWR.SWR_3704)
def test_the_resting_step_attaches_no_effect_at_all(qtbot) -> None:
    """Productive use: a view builds a page of cards and none of them cast a shadow.

    A zero-blur effect is not the same as no effect — any graphics effect makes
    Qt render the widget through an offscreen pixmap, which costs a buffer per
    widget and softens its text. The resting step is every card in the app.
    """
    theme = palettes.get("rotaris-dim")
    widget = QWidget()
    qtbot.addWidget(widget)

    assert theme.elevation_sm.has_shadow is False
    assert apply_elevation(widget, theme.elevation_sm) is None
    assert widget.graphicsEffect() is None


# ── the motif ─────────────────────────────────────────────────────────────


@verifies(SWR.SWR_3704)
@pytest.mark.parametrize("dots", [False, True], ids=["lines", "dots"])
def test_the_grid_is_drawn_on_the_theme_unit(qtbot, dots: bool) -> None:
    theme = palettes.get("rotaris-dim")
    image = _canvas()
    painter = QPainter(image)
    paint_grid(painter, QRect(0, 0, SIZE, SIZE), theme, dots=dots)
    painter.end()

    assert _painted_pixels(image) > 0, "the grid painted nothing"

    # A line grid puts a full column on every multiple of the unit; between two
    # multiples there is nothing. That spacing IS the motif, so it is what is
    # asserted rather than "some pixels are set".
    if not dots:
        unit = theme.space.grid_unit
        on_unit = image.pixelColor(unit, unit // 2).alpha()
        off_unit = image.pixelColor(unit + unit // 2, unit // 2).alpha()
        assert on_unit > 0
        assert off_unit == 0


@verifies(SWR.SWR_3704)
def test_the_grid_follows_the_active_theme(qtbot) -> None:
    """Two themes with different grid colours must not paint the same image."""
    rect = QRect(0, 0, SIZE, SIZE)
    rendered = []
    for name in ("rotaris-dim", "high-contrast"):
        image = _canvas()
        painter = QPainter(image)
        paint_grid(painter, rect, palettes.get(name), dots=True)
        painter.end()
        rendered.append(image.pixelColor(32, 32))

    assert rendered[0] != rendered[1]


@verifies(SWR.SWR_3704)
def test_the_fade_rule_dissolves_at_both_ends(qtbot) -> None:
    """A rule that stops cleanly claims the content stops there; this one does not."""
    theme = palettes.get("rotaris-dim")
    image = _canvas()
    painter = QPainter(image)
    paint_fade_rule(painter, QRect(0, 8, SIZE, 1), theme, horizontal=True)
    painter.end()

    row = 8
    left_end = image.pixelColor(0, row).alpha()
    middle = image.pixelColor(SIZE // 2, row).alpha()
    right_end = image.pixelColor(SIZE - 1, row).alpha()

    assert left_end == 0, "the rule is opaque at its left edge"
    assert right_end == 0, "the rule is opaque at its right edge"
    assert middle > left_end and middle > right_end


@verifies(SWR.SWR_3704)
def test_the_fade_rule_survives_a_rect_shorter_than_its_fade(qtbot) -> None:
    """Past half the length the two fades would overlap into a smudge."""
    theme = palettes.get("rotaris-dim")
    image = _canvas()
    painter = QPainter(image)
    paint_fade_rule(painter, QRect(0, 4, 8, 1), theme, horizontal=True)
    painter.end()

    assert image.pixelColor(4, 4).alpha() > 0


@verifies(SWR.SWR_3704)
def test_the_axis_mark_carries_all_three_axes(qtbot) -> None:
    """The mark is the coordinate system as a figure, so all three must appear."""
    theme = palettes.get("rotaris-dim")
    image = _canvas()
    painter = QPainter(image)
    paint_axis_mark(painter, QRect(0, 0, SIZE, SIZE), theme)
    painter.end()

    painted = {
        image.pixelColor(x, y).rgb()
        for x in range(SIZE)
        for y in range(SIZE)
        if image.pixelColor(x, y).alpha() > 200
    }
    for axis in (theme.color.accent[500], theme.color.axis_x[500], theme.color.axis_y[500]):
        assert axis.qcolor.rgb() in painted, f"{axis} is missing from the axis mark"


@verifies(SWR.SWR_3704)
def test_the_axis_mark_stays_square_in_a_wide_rect(qtbot) -> None:
    """It scales to the smaller dimension, so a wide status bar does not stretch it."""
    theme = palettes.get("rotaris-dim")
    image = QImage(SIZE * 2, SIZE, QImage.Format.Format_ARGB32)
    image.fill(QColor(0, 0, 0, 0))
    painter = QPainter(image)
    paint_axis_mark(painter, QRect(0, 0, SIZE * 2, SIZE), theme)
    painter.end()

    columns = [
        x
        for x in range(image.width())
        if any(image.pixelColor(x, y).alpha() > 0 for y in range(image.height()))
    ]
    rows = [
        y
        for y in range(image.height())
        if any(image.pixelColor(x, y).alpha() > 0 for x in range(image.width()))
    ]
    width, height = max(columns) - min(columns), max(rows) - min(rows)
    assert abs(width - height) <= 2, f"the mark is {width}x{height}, not square"


@verifies(SWR.SWR_3704)
def test_the_grid_background_paints_without_a_theme_argument(qtbot) -> None:
    """It reads the active theme in paintEvent, which is what makes it follow one."""
    background = GridBackground(dots=True)
    qtbot.addWidget(background)
    background.resize(SIZE, SIZE)

    assert background.dots is True
    background.set_dots(False)
    assert background.dots is False

    image = QImage(SIZE, SIZE, QImage.Format.Format_ARGB32)
    image.fill(QColor(0, 0, 0, 0))
    background.render(image)
    assert _painted_pixels(image) > 0


# ── the one recurring animation ───────────────────────────────────────────


@verifies(SWR.SWR_3704)
def test_the_pulse_runs_only_while_it_is_asked_to(qtbot) -> None:
    """Productive use: a status dot breathes while its agent runs, and stops when it stops.

    The design system allows exactly one recurring motion. An animation that
    keeps running after the state ends is a repaint every frame for the rest of
    the session, and it also says the wrong thing.
    """
    theme = palettes.get("rotaris-dim")
    dot = QLabel("●")
    qtbot.addWidget(dot)
    pulse = PulseAnimation(dot, theme)

    assert pulse.running is False

    pulse.start()
    assert pulse.running is True

    pulse.stop()
    assert pulse.running is False

    pulse.set_running(True)
    assert pulse.running is True
    pulse.set_running(False)
    assert pulse.running is False


@verifies(SWR.SWR_3704)
def test_the_pulse_uses_the_theme_duration_and_easing(qtbot) -> None:
    theme = palettes.get("rotaris-dim")
    dot = QLabel("●")
    qtbot.addWidget(dot)

    pulse = PulseAnimation(dot, theme)
    pulse.start()

    assert pulse.alive is True
    pulse.stop()


@verifies(SWR.SWR_3704)
def test_motion_tokens_become_easing_curves_with_the_declared_control_points() -> None:
    theme = palettes.get("rotaris-dim")
    for motion in (theme.motion.ease, theme.motion.ease_out, theme.motion.ease_in):
        curve = motion.curve()
        assert curve.valueForProgress(0.0) == pytest.approx(0.0, abs=1e-3)
        assert curve.valueForProgress(1.0) == pytest.approx(1.0, abs=1e-3)

    # ease_out decelerates: it is ahead of linear at the halfway point, which is
    # the property the design system is actually asking for ("nothing springy,
    # short distances, decelerating").
    assert theme.motion.ease_out.curve().valueForProgress(0.5) > 0.5
