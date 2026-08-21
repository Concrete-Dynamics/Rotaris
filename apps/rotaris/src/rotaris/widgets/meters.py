"""The design system's Data group, and the painted controls that sit beside it.

Sparkline, meter bar, context ring — plus the status dot, the toggle and the
segmented control, which the design system files under Core but which belong
here for the reason this module exists at all: every widget in it paints itself.

That is what makes them a group. A stylesheet selector cannot reach a
`paintEvent`, so none of these is repainted by the application stylesheet when
the theme changes. Each therefore reads :func:`~rotaris.theme.tokens` *inside*
the paint, and the few that hold something a paint cannot re-derive — a fixed
size taken from a size token, an animation carrying a duration and an easing —
mix in :class:`~rotaris.theme.manager.Themed` and rebuild it in `apply_theme`
(SWR-3706).

The numbers named at the top of the module are the only ones that are not
tokens, and they are deliberate: a meter's bar height, the knob's 2px inset, how
far the donut is scaled up from the ring token. Those are proportions of the
figure being drawn rather than values a theme gets an opinion about — the same
distinction :mod:`rotaris.theme.motif` draws for the brand mark.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from PySide6.QtCore import (
    QAbstractAnimation,
    QPointF,
    QRectF,
    QSize,
    Qt,
    QVariantAnimation,
    Signal,
)
from PySide6.QtGui import QBrush, QColor, QLinearGradient, QPainter, QPen, QPolygonF
from PySide6.QtWidgets import QAbstractButton, QHBoxLayout, QPushButton, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import Color, tokens
from rotaris.theme.manager import Themed
from rotaris.theme.motif import PulseAnimation

if TYPE_CHECKING:
    from PySide6.QtGui import QPaintEvent

    from rotaris.theme.spec import Theme

__all__ = [
    "ContextBar",
    "ContextRing",
    "MeterBar",
    "ProgressBarThin",
    "SegmentedControl",
    "Sparkline",
    "StatusDot",
    "ToggleSwitch",
]

#: The trend line's own figure: tall enough to show a shape, thin enough not to
#: read as a chart.
_SPARK_HEIGHT: Final = 22
_SPARK_STROKE: Final = 1.5

#: The meter: the bar, the room the threshold mark needs above and below it so
#: it reads as a mark rather than another segment of the fill, and the width
#: below which a percentage is no longer legible as a length.
_BAR_HEIGHT: Final = 5
_TICK_OVERHANG: Final = 2
_BAR_MIN_WIDTH: Final = 60

#: How far the context donut is scaled up from the design system's ring. The
#: diameter and the stroke scale at different rates on purpose: a stroke that
#: grew with the diameter would leave no middle for the percentage to sit in.
_DONUT_DIAMETER: Final = 5
_DONUT_STROKE: Final = 2

#: The knob's inset, straight from the design system's `.toggle::after`.
_KNOB_INSET: Final = 2

#: Where a meter turns amber, as a fraction of its own threshold rather than as
#: a second fixed percentage — so a workspace that compresses at 60 is warned
#: earlier too, instead of at a number nobody chose.
_WARN_FRACTION: Final = 0.75

#: The compression threshold a caller that does not name one gets.
_DEFAULT_THRESHOLD: Final = 80

#: Qt measures arcs in sixteenths of a degree.
_SIXTEENTHS: Final = 16


def _qcolor(value: str) -> QColor:
    """Paintable form of either a token or a caller's own colour string.

    A token knows its own alpha and hands over a `QColor` directly; Qt's string
    parser does not understand the `rgba(...)` spelling QSS needs, so a
    translucent token round-tripped through text would arrive black.
    """
    return value.qcolor if isinstance(value, Color) else QColor(value)


def _viz_color(theme: Theme, series: int) -> Color:
    """The *series*-th data-viz colour, wrapping rather than running off the end.

    The ramp is a closed set — nothing in this product invents a chart colour
    outside it — so a caller with more series than the design system has colours
    repeats one. Raising instead would raise inside a `paintEvent`, which takes
    the window with it.
    """
    viz = theme.color.viz
    return viz[series % len(viz)] if viz else theme.color.accent[500]


def _meter_fill(theme: Theme, pct: int, threshold: int, override: str | None) -> QColor:
    """What a meter at *pct* is filled with.

    A meter is read at a glance, so the fill carries the same warning its
    threshold mark does instead of leaving it to the mark alone: accent while
    there is room, amber as the threshold comes into view, the failure colour
    once it is crossed. All three are the graphical forms — a fill owes 3:1, not
    the 4.5:1 a word owes — and the mark stays drawn either way, so nobody has
    to separate the three hues to know where the meter stands.
    """
    if override is not None:
        return _qcolor(override)
    if pct >= threshold:
        return theme.color.fail.qcolor
    if pct >= threshold * _WARN_FRACTION:
        return theme.color.wait.qcolor
    return theme.color.accent[500].qcolor


def _threshold_mark(theme: Theme, pct: int, threshold: int) -> Color:
    """The colour a threshold mark is drawn in, given what it lands on.

    No single value clears 3:1 against both grounds the mark can sit on: a
    boundary token is legible on the empty track and disappears on a saturated
    fill, and the page ground does exactly the reverse. So once the fill has
    covered the mark's place, the mark is cut out of the fill rather than drawn
    on top of it.
    """
    return theme.color.bg if pct > threshold else theme.color.border_strong


@traces(SWR.SWR_2093, SWR.SWR_3702)
class Sparkline(QWidget):
    """A KPI card's trend line, stroked in one of the data-viz ramp's colours."""

    def __init__(self, parent: QWidget | None = None, *, series: int = 0) -> None:
        super().__init__(parent)
        self._values: list[int] = []
        self._series = series
        self.setFixedHeight(_SPARK_HEIGHT)

    @property
    def series(self) -> int:
        """Which step of the data-viz ramp this line is stroked in."""
        return self._series

    def set_series(self, series: int) -> None:
        """Stroke this line in the ramp's *series*-th colour."""
        self._series = series
        self.update()

    def set_values(self, values: list[int]) -> None:
        self._values = list(values)
        self.update()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        if len(self._values) < 2:
            return
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        low, high = min(self._values), max(self._values)
        span = max(high - low, 1)
        # The stroke is centred on each point, so a peak sitting on the very
        # edge would lose half its width to the widget's boundary.
        inset = float(t.size.hairline)
        width = float(self.width())
        height = self.height() - 2 * inset
        points = QPolygonF(
            [
                QPointF(
                    index * width / (len(self._values) - 1),
                    inset + height - (value - low) * height / span,
                )
                for index, value in enumerate(self._values)
            ]
        )

        pen = QPen(_viz_color(t, self._series).qcolor)
        pen.setWidthF(t.size.hairline * _SPARK_STROKE)
        painter.setPen(pen)
        painter.drawPolyline(points)


@traces(SWR.SWR_3702)
class ContextBar(QWidget):
    """The design system's MeterBar: a filled track with a threshold mark.

    The mark is the point of this variant. A context meter answers "how much
    room is left" only if the reader also knows where compression starts, and a
    fill that changes colour on its own would be saying that in colour alone.
    """

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._pct = 0
        self._threshold = _DEFAULT_THRESHOLD
        self._override: str | None = None
        self.setFixedHeight(_BAR_HEIGHT + 2 * _TICK_OVERHANG)
        self.setMinimumWidth(_BAR_MIN_WIDTH)

    def set_fill(self, pct: int, color: str | None = None, threshold: int = 80) -> None:
        """Fill to *pct*, warning against *threshold*.

        *color* overrides the fill entirely, for the callers that already know
        what a value means — a subscription limit is not a context window and
        does not warn on the same curve. It is kept as an override rather than
        resolved here, so that the default still follows a theme change.
        """
        self._pct = max(0, min(100, pct))
        self._threshold = threshold
        self._override = color or None
        self.update()

    @property
    def pct(self) -> int:
        return self._pct

    def _paint_meter(self, painter: QPainter, theme: Theme) -> None:
        track = QRectF(0, _TICK_OVERHANG, self.width(), _BAR_HEIGHT)
        # The small radius on a bar this thin is already more than half its
        # height, which is the design system's pill by another route; clamping
        # keeps Qt drawing a rounded rectangle rather than an undefined shape.
        radius = min(float(theme.radius.sm), _BAR_HEIGHT / 2)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(theme.color.track.qcolor)
        painter.drawRoundedRect(track, radius, radius)
        if self._pct > 0:
            fill = QRectF(track)
            fill.setWidth(track.width() * self._pct / 100)
            painter.setBrush(_meter_fill(theme, self._pct, self._threshold, self._override))
            painter.drawRoundedRect(fill, radius, radius)

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        self._paint_meter(painter, t)
        mark = _threshold_mark(t, self._pct, self._threshold)
        painter.setPen(QPen(mark.qcolor, float(t.size.hairline)))
        # Antialiasing off for the same reason the motif turns it off for grid
        # lines: a one-pixel line landing between two pixels is drawn as two
        # half-lit ones, which halves the contrast this mark was chosen for.
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)
        x = float(round(self.width() * self._threshold / 100))
        painter.drawLine(QPointF(x, 0), QPointF(x, float(self.height())))


#: The design system's name for the component above. Views were written against
#: `ContextBar` and the inventory calls it `MeterBar`; one class answers to both
#: rather than two classes drifting apart.
MeterBar = ContextBar


@traces(SWR.SWR_3702)
class ProgressBarThin(ContextBar):
    """The same meter without the threshold mark, for a plain quantity.

    A subscription's usage has no compression point to warn about, so marking
    one would be inventing a fact about the number.
    """

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        self._paint_meter(painter, tokens())


@traces(SWR.SWR_3702)
class ContextRing(Themed, QWidget):
    """The context window as a donut: fill arc, threshold mark, and the numbers.

    The same reading as :class:`ContextBar`, at the size the inspector has room
    for — which is why the figure is the design system's ring scaled up rather
    than a second ring with geometry of its own.
    """

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._pct = 0
        self._label = "—"
        self._sub = ""
        self._threshold = _DEFAULT_THRESHOLD
        self.install_theme_hook()

    def set_context(self, used: int, limit: int, threshold: int = 80) -> None:
        self._pct = 0 if limit <= 0 else round(100 * used / limit)
        self._label = f"{self._pct}%"
        self._sub = f"{used / 1000:.1f}k / {limit // 1000}k" if limit else "—"
        self._threshold = threshold
        # An arc is a shape, and a shape announces nothing. The same two facts
        # the ring paints are said in words for anyone who is not reading it.
        self.setAccessibleName(f"Context {self._pct}% used")
        self.setAccessibleDescription(f"{self._sub}, compresses at {threshold}%")
        self.update()

    @property
    def pct(self) -> int:
        return self._pct

    def apply_theme(self, theme: Theme) -> None:
        """Re-take the donut's size from *theme*.

        Held rather than read at paint time because it is the widget's size
        hint: a high-contrast theme draws a larger ring, and the layout has to
        be told before it can make room for one.
        """
        side = theme.size.ring_size * _DONUT_DIAMETER + 2 * theme.space.sm
        self.setFixedSize(QSize(side, side))

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        margin = float(t.space.sm)
        diameter = float(t.size.ring_size * _DONUT_DIAMETER)
        box = QRectF(margin, margin, diameter, diameter)
        thickness = float(t.size.ring_thickness * _DONUT_STROKE)

        painter.setPen(QPen(t.color.track.qcolor, thickness))
        painter.drawArc(box, 0, 360 * _SIXTEENTHS)

        if self._pct > 0:
            # Clockwise from twelve o'clock, which is where a reader starts.
            pen = QPen(_meter_fill(t, self._pct, self._threshold, None), thickness)
            pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            painter.setPen(pen)
            painter.drawArc(box, 90 * _SIXTEENTHS, -round(360 * _SIXTEENTHS * self._pct / 100))

        mark = _threshold_mark(t, self._pct, self._threshold)
        painter.setPen(QPen(mark.qcolor, float(t.size.hairline) * 2))
        painter.drawArc(
            box,
            round((90 - 360 * self._threshold / 100) * _SIXTEENTHS),
            -2 * _SIXTEENTHS,
        )
        self._paint_readings(painter, t, box)

    def _paint_readings(self, painter: QPainter, theme: Theme, box: QRectF) -> None:
        """Draw the percentage and the counts as one block on the ring's centre.

        Each is offset by half of the other's line, so the pair stays centred
        however the type scale is retuned rather than at two fixed distances
        that only agree at one size.
        """
        big, small, gap = theme.type.scale.h4, theme.type.scale.x2s, theme.space.xs
        lift = (small + gap) / 2
        drop = (big + gap) / 2

        painter.setPen(theme.color.text.qcolor)
        painter.setFont(theme.type.mono_font(big))
        painter.drawText(
            box.adjusted(0, -lift, 0, -lift), Qt.AlignmentFlag.AlignCenter, self._label
        )
        painter.setPen(theme.color.text_tertiary.qcolor)
        painter.setFont(theme.type.body_font(small))
        painter.drawText(box.adjusted(0, drop, 0, drop), Qt.AlignmentFlag.AlignCenter, self._sub)


@traces(SWR.SWR_3702)
class ToggleSwitch(Themed, QAbstractButton):
    """The design system's `.toggle`: a pill track and a knob that travels.

    The travel is the point of the animation, not decoration. A knob that jumps
    leaves the reader to work out which end it landed on; one that moves says
    which way it went, which is the difference between seeing a state and having
    to re-read it.
    """

    def __init__(self, checked: bool = False, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setCheckable(True)
        self.setChecked(checked)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        #: Where the knob is, 0 at the off end and 1 at the on end.
        self._knob = 1.0 if checked else 0.0
        self._travel = QVariantAnimation(self)
        self._travel.setStartValue(0.0)
        self._travel.setEndValue(1.0)
        self._travel.valueChanged.connect(self._knob_moved)
        self.toggled.connect(self._start_travel)
        # A custom-painted button has no text for Qt to announce, so the state
        # would otherwise reach a screen reader as position alone — which is the
        # same failure as encoding it in colour. The caller still supplies the
        # accessible *name*; this is the value.
        self.toggled.connect(self._announce_state)
        self._announce_state(checked)
        self.install_theme_hook()

    def _announce_state(self, checked: bool) -> None:
        self.setAccessibleDescription("On" if checked else "Off")

    def sizeHint(self) -> QSize:  # noqa: N802 — Qt's spelling
        size = tokens().size
        return QSize(size.toggle_width, size.toggle_height)

    def apply_theme(self, theme: Theme) -> None:
        """Re-take the switch's size and the knob's timing from *theme*."""
        self.setFixedSize(QSize(theme.size.toggle_width, theme.size.toggle_height))
        self._travel.setDuration(theme.motion.normal)
        self._travel.setEasingCurve(theme.motion.ease.curve())

    def _start_travel(self, checked: bool) -> None:
        # Resumed from wherever the knob currently is rather than from the far
        # end: a switch flicked twice must not jump back in order to make the
        # second trip.
        elapsed = self._travel.currentTime()
        self._travel.stop()
        self._travel.setDirection(
            QAbstractAnimation.Direction.Forward
            if checked
            else QAbstractAnimation.Direction.Backward
        )
        self._travel.start()
        self._travel.setCurrentTime(elapsed)

    def _knob_moved(self, value: float) -> None:
        self._knob = float(value)
        self.update()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(Qt.PenStyle.NoPen)

        track = QRectF(self.rect())
        # The pill radius is half the track's height. The token spells the same
        # thing as CSS does, with a number larger than any control it is used
        # on, and Qt would draw that literally.
        radius = track.height() / 2
        painter.setBrush(self._track_brush(t))
        painter.drawRoundedRect(track, radius, radius)

        inset = float(_KNOB_INSET)
        size = track.height() - 2 * inset
        travel = track.width() - size - 2 * inset
        painter.setBrush(self._knob_color(t).qcolor)
        painter.drawEllipse(QRectF(inset + travel * self._knob, inset, size, size))

        if not self.isEnabled():
            # Two greys apart is not a state anyone can be asked to read, so a
            # switch that cannot be operated also loses its solid edge — a
            # dashed outline still says "off limits" in greyscale.
            edge = float(t.size.hairline)
            pen = QPen(t.color.disabled_border.qcolor, edge)
            pen.setStyle(Qt.PenStyle.DashLine)
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            outline = track.adjusted(edge / 2, edge / 2, -edge / 2, -edge / 2)
            painter.drawRoundedRect(outline, radius, radius)

        if self.hasFocus():
            width = float(t.size.focus_ring)
            painter.setPen(QPen(t.color.focus.qcolor, width))
            painter.setBrush(Qt.BrushStyle.NoBrush)
            ring = track.adjusted(width / 2, width / 2, -width / 2, -width / 2)
            painter.drawRoundedRect(ring, radius, radius)

    def _track_brush(self, theme: Theme) -> QBrush:
        if not self.isEnabled():
            return QBrush(theme.color.disabled_surface.qcolor)
        if not self.isChecked():
            return QBrush(theme.color.surface_raised.qcolor)
        # The on state is the one place in the product that carries a gradient:
        # the design system lights the track from above so the knob reads as
        # sitting in it rather than on it.
        gradient = QLinearGradient(QPointF(0.0, 0.0), QPointF(0.0, float(self.height())))
        gradient.setColorAt(0.0, theme.color.accent[600].qcolor)
        gradient.setColorAt(1.0, theme.color.accent[700].qcolor)
        return QBrush(gradient)

    def _knob_color(self, theme: Theme) -> Color:
        if not self.isEnabled():
            return theme.color.text_disabled
        return theme.color.accent[100] if self.isChecked() else theme.color.text_tertiary


@traces(SWR.SWR_3702)
class SegmentedControl(Themed, QWidget):
    """The design system's `.seg`: exclusive options sharing one outline.

    The options are real buttons, so the group is reached by Tab and operated by
    Space like anything else on the surface — a segmented control that only a
    mouse can change is a setting a keyboard user cannot reach.
    """

    changed = Signal(str)

    def __init__(self, options: list[str], parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._buttons: dict[str, QPushButton] = {}
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        for index, option in enumerate(options):
            button = QPushButton(option)
            button.setCheckable(True)
            button.setCursor(Qt.CursorShape.PointingHandCursor)
            button.setProperty("seg", _segment_position(index, len(options)))
            button.clicked.connect(lambda _=False, chosen=option: self.set_value(chosen, emit=True))
            layout.addWidget(button, 1)
            self._buttons[option] = button
        self.install_theme_hook()

    def set_value(self, value: str, emit: bool = False) -> None:
        for option, button in self._buttons.items():
            button.setChecked(option == value)
        if emit:
            self.changed.emit(value)

    def value(self) -> str:
        for option, button in self._buttons.items():
            if button.isChecked():
                return option
        return ""

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild the group's stylesheet from *theme*.

        The application stylesheet already styles a `QPushButton`, and this
        overrides it on purpose: a segment is not a button. It has no gap to its
        neighbour, it shares one outline with them, and the radius belongs to
        the group rather than to the option. Only the declarations that differ
        are set here; everything else still comes from the application sheet.
        """
        color, size, type_ = theme.color, theme.size, theme.type
        # Focus is drawn as a thicker border, so the padding gives back exactly
        # what the extra width takes and the label does not shift.
        grow = size.focus_ring - size.hairline
        self.setStyleSheet(f"""
        QPushButton {{
            color: {color.text_secondary};
            background: {color.bg};
            border: {size.hairline}px solid {color.border_strong};
            border-radius: 0;
            padding: {theme.space.xs}px {theme.space.md}px;
            font-size: {type_.scale.xs}px;
            font-weight: {type_.weight_display};
        }}
        QPushButton[seg="middle"], QPushButton[seg="last"] {{ border-left: none; }}
        QPushButton[seg="first"], QPushButton[seg="only"] {{
            border-top-left-radius: {theme.radius.control}px;
            border-bottom-left-radius: {theme.radius.control}px;
        }}
        QPushButton[seg="last"], QPushButton[seg="only"] {{
            border-top-right-radius: {theme.radius.control}px;
            border-bottom-right-radius: {theme.radius.control}px;
        }}
        QPushButton:hover:!checked {{ background: {color.hover}; }}
        QPushButton:checked {{
            background: {color.surface_raised};
            color: {color.accent[200]};
        }}
        QPushButton:focus {{
            border: {size.focus_ring}px solid {color.focus};
            padding: {max(0, theme.space.xs - grow)}px {max(0, theme.space.md - grow)}px;
        }}
        QPushButton:disabled {{
            color: {color.text_disabled};
            background: {color.disabled_surface};
            border-color: {color.disabled_border};
        }}
        """)


def _segment_position(index: int, count: int) -> str:
    """Which end of the group an option is at, for the stylesheet to round."""
    if count == 1:
        return "only"
    if index == 0:
        return "first"
    return "last" if index == count - 1 else "middle"


@traces(SWR.SWR_3702)
class StatusDot(Themed, QWidget):
    """The design system's `.status-dot`, with the product's one animation.

    A dot is a shape, so it takes the graphical form of a state colour, which
    owes 3:1 rather than the 4.5:1 a word owes. And a shape says nothing on its
    own: whatever a dot means has to be readable somewhere else too, either from
    the label beside it or from the accessible name :meth:`set_state` takes.
    """

    def __init__(
        self, color: str | None = None, size: int | None = None, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        # Both default to the theme's rather than to a literal, and both stay
        # unresolved until they are painted — a dot built at startup would
        # otherwise keep the palette that happened to be loaded then.
        self._color = color or None
        self._size = size
        self._pulsing = False
        self._pulse: PulseAnimation | None = None
        # Says what this is, not what state it is in — `set_state` supplies that
        # when a caller has it. Without this a dot is announced as nothing at
        # all, which is the one thing a state indicator must not be: the colour
        # would then be carrying the meaning alone.
        self.setAccessibleDescription("Status indicator")
        self.install_theme_hook()

    def set_state(self, color: str, pulse: bool = False, *, label: str | None = None) -> None:
        """Paint *color*, breathe while *pulse*, and announce *label*.

        *label* is what a screen reader hears — "Running", "Failed". It is
        optional only because some callers name the dot once and then change its
        colour many times; a dot that never receives one is relying on the text
        beside it to carry the state.
        """
        self._color = color or None
        if label is not None:
            self.setAccessibleName(label)
        self.set_pulsing(pulse)
        self.update()

    def set_pulsing(self, pulsing: bool) -> None:
        """Breathe while a state is actively running, and rest the moment it is not.

        The design system allows exactly one looping animation and this is it,
        which is why it is built to be stopped: a dot still breathing after the
        run ended says "working" about something that finished.
        """
        self._pulsing = pulsing
        if pulsing and self._pulse is None:
            self._pulse = PulseAnimation(self, tokens())
        if self._pulse is not None:
            self._pulse.set_running(pulsing)

    @property
    def pulsing(self) -> bool:
        """Whether this dot is currently breathing."""
        return self._pulsing

    def apply_theme(self, theme: Theme) -> None:
        """Re-take the dot's size, and rebuild the pulse the new theme times."""
        diameter = self._diameter(theme)
        # A hairline of margin all round gives the antialiased edge somewhere to
        # land instead of being clipped by the widget's own rectangle.
        side = diameter + 2 * theme.size.hairline
        self.setFixedSize(QSize(side, side))
        if self._pulse is not None:
            # A pulse carries the theme's duration and easing from the moment it
            # is built, so a theme change replaces it rather than retunes it.
            self._pulse.stop()
            self._pulse = PulseAnimation(self, theme)
            self._pulse.set_running(self._pulsing)

    def _diameter(self, theme: Theme) -> int:
        return self._size if self._size is not None else theme.size.status_dot

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(_qcolor(self._color if self._color is not None else t.color.idle))
        inset = float(t.size.hairline)
        painter.drawEllipse(QRectF(inset, inset, self._diameter(t), self._diameter(t)))
