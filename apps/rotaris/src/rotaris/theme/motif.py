"""The brand motif and elevation, as things Qt can actually draw (SWR-3704).

Two parts of the design system have no Qt spelling at all, and QSS does not say
so. It parses `box-shadow` and a CSS background pattern, accepts them, and
discards them — a stylesheet that declares both is indistinguishable from one
that declares neither, which is how a design gets silently dropped between the
mockup and the window.

So both arrive here as code instead:

* **Elevation** splits in two. The hairline stays a real border in the
  stylesheet; the ambient half becomes a `QGraphicsDropShadowEffect` that a
  floating widget attaches through :func:`apply_elevation`. Resting surfaces get
  the border and nothing else, because in this system a shadow means the thing
  genuinely floats — a card that casts one reads as a dialog.
* **The motif** — grid, dot grid, fade rule, axis mark — becomes painters. They
  are the 8px module made visible rather than a texture, which is why they draw
  on `space.grid_unit` and not on a number of their own, and why they belong
  behind hero sections and empty states and never under a table or a transcript.

Every painter takes its theme as an argument and reads it at paint time. Nothing
here holds a colour, and nothing here reaches for a global: a token captured once
is a token that stops changing when the user switches theme, and a painter is
precisely the place where that freeze would be invisible until somebody noticed
the grid was still the old blue.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from PySide6.QtCore import (
    QAbstractAnimation,
    QPointF,
    QRect,
    Qt,
    QVariantAnimation,
)
from PySide6.QtGui import QBrush, QColor, QLinearGradient, QPainter, QPen
from PySide6.QtWidgets import QGraphicsDropShadowEffect, QWidget
from rotaris_core.reqtocode import SWR, traces
from shiboken6 import isValid

if TYPE_CHECKING:
    from PySide6.QtGui import QPaintEvent

    from rotaris.theme.spec import Elevation, Theme

__all__ = [
    "GridBackground",
    "PulseAnimation",
    "apply_elevation",
    "paint_axis_mark",
    "paint_fade_rule",
    "paint_grid",
]

#: Dot radius for the dot grid. The design system draws it at one pixel: the
#: motif has to survive behind content, and a dot big enough to notice is a dot
#: big enough to compete with the text sitting on it.
_DOT_RADIUS: Final = 1.0

#: How far the pulse dims. Deep enough to be a breath rather than a shimmer,
#: shallow enough that the dot never disappears — an indicator that blinks out
#: is unreadable to anyone who glances at the wrong moment.
_PULSE_FLOOR: Final = 0.35

# The axis mark's proportions, as fractions of the square it is drawn in, so it
# is the same figure at 16px in a status bar and at 160px on an empty state.
_MARK_RADIUS: Final = 0.30
_MARK_SATELLITE: Final = 0.12
_MARK_STROKE: Final = 0.055


@traces(SWR.SWR_3704)
def apply_elevation(widget: QWidget, elevation: Elevation) -> QGraphicsDropShadowEffect | None:
    """Attach *elevation*'s ambient half to *widget*; return the effect, if any.

    A step with no shadow attaches nothing at all, rather than an effect with a
    zero blur radius. The two are not equivalent: any graphics effect makes Qt
    render the widget through an offscreen pixmap, which costs a buffer per
    widget and softens the text it draws. The resting step is every card in the
    system, so "no shadow" has to mean no effect.
    """
    if not elevation.has_shadow:
        return None
    effect = QGraphicsDropShadowEffect(widget)
    effect.setBlurRadius(elevation.blur)
    effect.setColor(elevation.shadow.qcolor)
    effect.setXOffset(0)
    effect.setYOffset(elevation.offset_y)
    widget.setGraphicsEffect(effect)
    return effect


@traces(SWR.SWR_3704)
def paint_grid(painter: QPainter, rect: QRect, theme: Theme, *, dots: bool = False) -> None:
    """Draw the layout module across *rect*, as lines or as dots."""
    unit = theme.space.grid_unit
    if unit <= 0 or rect.isEmpty():
        return
    painter.save()
    try:
        color = theme.color.viz_grid.qcolor
        # Lines are why antialiasing goes off. A one-pixel line whose centre
        # falls between two pixels is drawn as two half-lit rows, and a whole
        # grid of those reads as grey haze instead of a grid. Dots are circles
        # and want exactly the opposite.
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, dots)
        # Anchored on multiples of the unit rather than on the rect's own edge,
        # so a surface that scrolls or resizes keeps one grid instead of sliding
        # a new one under the content each time.
        first_x = rect.left() - rect.left() % unit
        first_y = rect.top() - rect.top() % unit
        if dots:
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(color))
            for x in range(first_x, rect.right() + 1, unit):
                for y in range(first_y, rect.bottom() + 1, unit):
                    painter.drawEllipse(QPointF(x, y), _DOT_RADIUS, _DOT_RADIUS)
        else:
            pen = QPen(color)
            pen.setWidth(max(1, theme.size.hairline))
            painter.setPen(pen)
            for x in range(first_x, rect.right() + 1, unit):
                painter.drawLine(x, rect.top(), x, rect.bottom())
            for y in range(first_y, rect.bottom() + 1, unit):
                painter.drawLine(rect.left(), y, rect.right(), y)
    finally:
        painter.restore()


@traces(SWR.SWR_3704)
def paint_fade_rule(
    painter: QPainter, rect: QRect, theme: Theme, *, horizontal: bool = True
) -> None:
    """Draw a divider through *rect* that dissolves at both ends.

    A rule that stops cleanly claims the content stops there too. This one is at
    full strength only across the middle, so it separates without asserting an
    edge — the same reason the design system fades it, on the same unit.
    """
    length = rect.width() if horizontal else rect.height()
    if length <= 0 or rect.isEmpty():
        return

    solid = theme.color.divider.qcolor
    # The same colour at zero alpha, never a generic transparent: Qt interpolates
    # gradient stops premultiplied, so fading towards transparent *black* drags a
    # dark halo through the middle of a rule on a light ground.
    clear = QColor(solid)
    clear.setAlpha(0)

    # Past half the length the two fades would overlap and the rule would never
    # reach full strength anywhere, which is a smudge rather than a divider. At
    # that point the fade gives way instead of the rule.
    fade = min(float(theme.space.grid_unit), length / 2)
    stop = min(0.5, max(0.0, fade / length))

    thickness = max(1, theme.size.hairline)
    # The gradient spans the first and last pixel *centres*, not the rect's
    # edges. Qt samples a gradient at the centre of each pixel, so a gradient
    # laid on the edges never actually reaches its end stops on screen — the
    # last pixel of a rule that is supposed to have vanished still carries a
    # trace of the divider, and it carries a different one at each end because
    # `QRect.right()` is one short of the geometric edge.
    near, far = 0.5, length - 0.5
    if horizontal:
        band = QRect(rect.left(), rect.top() + (rect.height() - thickness) // 2, length, thickness)
        gradient = QLinearGradient(rect.left() + near, 0.0, rect.left() + far, 0.0)
    else:
        band = QRect(rect.left() + (rect.width() - thickness) // 2, rect.top(), thickness, length)
        gradient = QLinearGradient(0.0, rect.top() + near, 0.0, rect.top() + far)
    gradient.setColorAt(0.0, clear)
    gradient.setColorAt(stop, solid)
    gradient.setColorAt(1.0 - stop, solid)
    gradient.setColorAt(1.0, clear)

    painter.save()
    try:
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)
        painter.fillRect(band, QBrush(gradient))
    finally:
        painter.restore()


@traces(SWR.SWR_3704)
def paint_axis_mark(painter: QPainter, rect: QRect, theme: Theme) -> None:
    """Draw the brand mark centred in *rect*.

    Three circles, three axes, in the axes' own colours — which is why the large
    one is the accent: `axis_z` and `accent` are the same colour by construction,
    not by copy. The two small ones sit *on* the primary's circumference in the
    directions their axes point, X to the right and Y up, so the figure is the
    coordinate system the rest of the product already colours itself by rather
    than a logo that happens to use three brand hues.
    """
    side = min(rect.width(), rect.height())
    if side <= 0:
        return
    painter.save()
    try:
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        centre = QPointF(rect.center())
        radius = side * _MARK_RADIUS
        stroke = max(1.0, side * _MARK_STROKE)

        primary = QPen(theme.color.accent[500].qcolor)
        primary.setWidthF(stroke)
        painter.setPen(primary)
        painter.drawEllipse(centre, radius, radius)

        satellite = side * _MARK_SATELLITE
        # Qt's y grows downward, so "up" is a subtraction.
        for color, point in (
            (theme.color.axis_x[500], QPointF(centre.x() + radius, centre.y())),
            (theme.color.axis_y[500], QPointF(centre.x(), centre.y() - radius)),
        ):
            pen = QPen(color.qcolor)
            pen.setWidthF(max(1.0, stroke * 0.75))
            painter.setPen(pen)
            painter.drawEllipse(point, satellite, satellite)
    finally:
        painter.restore()


@traces(SWR.SWR_3704)
class GridBackground(QWidget):
    """A surface that paints the motif behind whatever is laid out on it.

    Children paint after their parent, so drawing the grid in `paintEvent` puts
    it behind the content with no stacking order to maintain.

    The theme is fetched here, per paint, rather than captured in `__init__`. A
    widget built at startup and alive for the session would otherwise keep
    drawing the grid of whichever theme was loaded when it was constructed, and
    a stale background is the one kind of stale token nobody reports as a bug —
    they just think the theme switch is half broken.
    """

    def __init__(self, parent: QWidget | None = None, *, dots: bool = False) -> None:
        super().__init__(parent)
        self._dots = dots

    @property
    def dots(self) -> bool:
        """Whether the motif is drawn as dots rather than lines."""
        return self._dots

    def set_dots(self, dots: bool) -> None:
        self._dots = dots
        self.update()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        # Imported here rather than at module scope because `rotaris.theme`
        # imports this module to publish the painters, and a package cannot
        # finish initialising while one of its own children is importing it back.
        from rotaris.theme import tokens

        painter = QPainter(self)
        paint_grid(painter, self.rect(), tokens(), dots=self._dots)


@traces(SWR.SWR_3704, SWR.SWR_2454)
class PulseAnimation:
    """The one recurring motion in the product, on a leash.

    The design system allows exactly one looping animation — an indicator
    breathing while its state is actually running — so this is built to be
    stopped rather than to be started. A pulse still going after the run ends is
    worse than no pulse at all: it says "working" about something that finished,
    and it costs a repaint every frame for the life of the window.

    It does not apply itself. :attr:`opacity` is the value it animates and the
    widget reads at paint time, which is what keeps a graphics effect out of the
    picture entirely — an opacity effect makes Qt render its widget into an
    offscreen pixmap on every paint, an unreasonable price for a six-pixel dot,
    paid for the life of the run and multiplied by every dot on screen
    (SWR-2454). A number the widget mixes into its own brush costs nothing.

    The widget outranks this object: the value and the animation are parented to
    it, so Qt destroys both when the widget goes. A caller that keeps a pulse in
    order to stop it later is therefore holding a handle that Qt may already have
    emptied — a row rebuilt while its run finishes is exactly that order — so
    every method here checks before it touches the C++ side, and a pulse whose
    widget is gone quietly does nothing rather than raising into a signal
    handler.
    """

    def __init__(self, widget: QWidget, theme: Theme) -> None:
        self._widget = widget
        self._opacity = 1.0
        # A `QVariantAnimation` rather than a `QPropertyAnimation`, because there
        # is no longer an object with an `opacity` property to drive: the value
        # arrives on a signal and the widget is asked to repaint with it.
        self._animation = QVariantAnimation(widget)
        self._animation.valueChanged.connect(self._breathe)
        self._animation.setDuration(theme.motion.pulse)
        self._animation.setEasingCurve(theme.motion.ease.curve())
        # One duration is a whole breath, down and back. Animating only the dim
        # half and letting the loop snap back to full would read as a blink.
        self._animation.setStartValue(1.0)
        self._animation.setKeyValueAt(0.5, _PULSE_FLOOR)
        self._animation.setEndValue(1.0)
        self._animation.setLoopCount(-1)

    def _breathe(self, value: object) -> None:
        """Take one frame of the breath and ask the widget to draw itself with it."""
        self._opacity = float(value)  # type: ignore[arg-type]
        if isValid(self._widget):
            self._widget.update()

    @property
    def alive(self) -> bool:
        """Whether Qt still has the widget this pulse decorates."""
        return isValid(self._widget) and isValid(self._animation)

    @property
    def running(self) -> bool:
        """Whether the animation is currently breathing."""
        return self.alive and self._animation.state() == QAbstractAnimation.State.Running

    @property
    def opacity(self) -> float:
        """Where the breath is now — what the widget multiplies its colour by."""
        return self._opacity

    def start(self) -> None:
        """Begin breathing, or keep breathing if it already is.

        Under reduced motion the running state renders statically: the dot
        stays full-opacity and the state colour still says "running".
        """
        from rotaris.theme.reduced_motion import reduced_motion

        if not self.alive:
            return
        if reduced_motion():
            self._rest()
            return
        if not self.running:
            self._animation.start()

    def stop(self) -> None:
        """Stop, and leave the widget fully opaque.

        Wherever the breath happened to be when it stopped is not a state
        anybody chose, and an indicator abandoned at 35% reads as disabled.
        """
        if not self.alive:
            return
        self._animation.stop()
        self._rest()

    def _rest(self) -> None:
        """Back to full strength, and repainted so the dot shows it."""
        self._opacity = 1.0
        if isValid(self._widget):
            self._widget.update()

    def set_running(self, running: bool) -> None:
        """Follow a state: breathe while it runs, rest the moment it does not."""
        if running:
            self.start()
        else:
            self.stop()
