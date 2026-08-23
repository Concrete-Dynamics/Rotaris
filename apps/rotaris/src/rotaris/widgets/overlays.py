"""The floating half of the feedback group: toasts, the spinner, tooltips.

Three components the design system specifies and Rotaris never built, so each
view that wanted one assembled it again by hand. They share one property that
decides most of the code below: they appear over work that is still going on,
and the user is usually typing while they do. So none of them is a window, none
of them takes focus, and none of them outlives its reason to exist —
:class:`Spinner` stops itself when it is hidden, and a :class:`Toast` expires on
a timer the caller sets.

`Tooltip` is deliberately absent. Qt already has one, the application stylesheet
already dresses it, and a second floating window would differ from the first in
exactly the ways a user notices. What is here instead is
:func:`attach_tooltip`, which sets the tooltip *and* the accessible description,
because a hover-only affordance is not an affordance
(`apps/rotaris/AGENTS.md`).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Final, Literal

from PySide6.QtCore import (
    QAbstractAnimation,
    QByteArray,
    QEvent,
    QPoint,
    QPropertyAnimation,
    QRectF,
    QSize,
    Qt,
    QTimer,
    Signal,
)
from PySide6.QtGui import QKeySequence, QPainter, QPen
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.theme.motif import apply_elevation

if TYPE_CHECKING:
    from PySide6.QtCore import QObject
    from PySide6.QtGui import QHideEvent, QPaintEvent, QShowEvent

    from rotaris.theme.spec import Theme

__all__ = ["Spinner", "SpinnerSize", "Toast", "ToastKind", "ToastStack", "attach_tooltip"]

#: What a toast can be about. `ok` rather than `success` because it is also the
#: word the glyph says.
ToastKind = Literal["info", "ok", "warn", "fail"]

SpinnerSize = Literal["sm", "md", "lg"]

#: The glyph per kind, matching :class:`~rotaris.widgets.feedback.InlineBanner`
#: so the same event reads the same whether it was transient or persistent.
_GLYPHS: Final[dict[str, str]] = {"info": "i", "ok": "✓", "warn": "!", "fail": "×"}

#: The kind as a word, for the accessible name. State is never carried by the
#: colour of the glyph alone (`apps/rotaris/AGENTS.md`).
_KIND_WORDS: Final[dict[str, str]] = {
    "info": "Notice",
    "ok": "Done",
    "warn": "Warning",
    "fail": "Failed",
}

#: The design system pins the stack's width rather than deriving it: a toast is
#: a sentence, and a sentence that runs the width of a 1440px window is not read.
_STACK_WIDTH: Final = 360

#: How many toasts may be on screen at once. Past this the corner stops being a
#: notification and becomes a log — which belongs in a panel, not over the work.
_MAX_VISIBLE: Final = 3

#: The spinner's outer square per size, from `.spinner` / `-sm` / `-lg`. These
#: are component dimensions rather than theme tokens: the arc has to stay
#: legible at the size the caller has room for, and that does not move with the
#: palette.
_SPINNER_SIDES: Final[dict[str, int]] = {"sm": 12, "md": 16, "lg": 24}

#: One full turn, and the frame budget it is spent in. Not a motion token: the
#: motion scale describes transitions between two states, and this is the one
#: shape in the system that has no end state.
_SWEEP_MS: Final = 800
_FRAME_MS: Final = 16
_DEGREES_PER_FRAME: Final = 360.0 * _FRAME_MS / _SWEEP_MS

#: How much of the ring the moving head covers. A quarter reads as motion at
#: 12px; much less disappears, much more stops looking like it is turning.
_ARC_SPAN_DEGREES: Final = 90

#: The track behind the head, as a share of the accent. Present enough to show
#: the shape of the ring, faint enough that the head is unambiguous.
_TRACK_ALPHA: Final = 0.26

#: The stroke per size, from `.spinner` / `-sm` / `-lg` in `components.css` —
#: the ring thins as it shrinks, or the smaller arcs turn to blobs.
_SPINNER_STROKES: Final[dict[str, float]] = {"sm": 1.25, "md": 1.5, "lg": 2.0}


@traces(SWR.SWR_3702)
class Toast(Themed, QFrame):
    """One transient acknowledgement: a glyph, a title, a body, a way to close it.

    Constructible on its own — it is a plain child widget, not a window — but
    normally made by :class:`ToastStack`, which is what knows where the corner
    is and when this one has been on screen long enough.
    """

    #: Emitted when the toast is done, whether the user closed it or it expired.
    closed = Signal()

    def __init__(
        self,
        title: str,
        *,
        body: str = "",
        kind: ToastKind = "info",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setObjectName("toast")
        self._kind = kind
        # Nothing here is a tab stop except the close control: a toast that
        # arrived while the user was typing must not move the caret out of the
        # composer.
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self._row = QHBoxLayout(self)
        self.glyph = QLabel(_GLYPHS[kind])
        self.glyph.setAlignment(Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignTop)
        self._row.addWidget(self.glyph)
        self._copy = QVBoxLayout()
        self.title = QLabel(title)
        self.title.setWordWrap(True)
        self._copy.addWidget(self.title)
        self.body = QLabel(body)
        self.body.setObjectName("muted")
        self.body.setWordWrap(True)
        self.body.setVisible(bool(body))
        self._copy.addWidget(self.body)
        self._row.addLayout(self._copy, 1)
        self.close_button = QToolButton()
        self.close_button.setText("×")
        self.close_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.close_button.setAccessibleName(f"Dismiss {title}")
        self.close_button.clicked.connect(self.dismiss)
        self._row.addWidget(self.close_button, 0, Qt.AlignmentFlag.AlignTop)
        self.setAccessibleName(f"{_KIND_WORDS[kind]}: {title}")
        self.setAccessibleDescription(body)
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self.dismiss)
        self.install_theme_hook()

    @property
    def kind(self) -> ToastKind:
        return self._kind

    def apply_theme(self, theme: Theme) -> None:
        color, space, type_ = theme.color, theme.space, theme.type
        # `.toast`: 10px 12px around a surface ground with a hairline border.
        self._row.setContentsMargins(space[1.5], space[1.25], space[1.5], space[1.25])
        self._row.setSpacing(space.sm)
        self._copy.setSpacing(space[0.25])
        self.setStyleSheet(
            f"QFrame#toast{{background:{color.surface};"
            f"border:{theme.size.hairline}px solid {color.border};"
            f"border-radius:{theme.radius.md}px;}}"
        )
        # The word form of the state, not the dot form: this glyph is read, so
        # it owes 4.5:1 rather than the 3:1 a status dot owes.
        glyph_colors = {
            "info": color.info_text,
            "ok": color.run_text,
            "warn": color.wait_text,
            "fail": color.fail_text,
        }
        self.glyph.setStyleSheet(f"color:{glyph_colors[self._kind]};font-size:{type_.scale.md}px;")
        self.title.setStyleSheet(f"font-size:{type_.scale.sm}px;font-weight:{type_.weight_strong};")
        self.body.setStyleSheet(f"font-size:{type_.scale.xs}px;")
        # A toast is the one surface in this system that genuinely floats, so it
        # is also one of the few that earns the ambient half of an elevation
        # step rather than only its border.
        if theme.elevation_md.has_shadow:
            apply_elevation(self, theme.elevation_md)
        else:
            self.setGraphicsEffect(None)  # type: ignore[arg-type]

    def start_timeout(self, milliseconds: int) -> None:
        """Expire on its own after *milliseconds*; zero or less never expires."""
        self._timer.stop()
        if milliseconds > 0:
            self._timer.start(milliseconds)

    @property
    def expires(self) -> bool:
        """Whether this toast is currently counting down."""
        return self._timer.isActive()

    def dismiss(self) -> None:
        self._timer.stop()
        self.hide()
        self.closed.emit()


@traces(SWR.SWR_3702)
class ToastStack(Themed, QWidget):
    """The bottom-right corner where transient acknowledgements land.

    **A toast is only for low-risk acknowledgement** — "Copied", "Worktree
    created", "Settings saved". A failure, and any state that still matters
    once the toast has expired, belongs in a
    :class:`~rotaris.widgets.feedback.InlineBanner` instead
    (`apps/rotaris/AGENTS.md`): a message nobody happened to be looking at when
    it disappeared was never delivered, and the user is usually looking at the
    thing that just failed rather than at the corner.

    The stack is a child of the widget it floats over rather than a window of
    its own. That is what keeps it from activating anything or moving the caret
    out of the composer, and it is why the stack sizes itself to exactly the
    toasts it holds — a transparent overlay the size of the whole view would
    swallow every click that landed on the empty part of it.
    """

    #: Long enough to read a short sentence, short enough not to sit over the
    #: work. Callers that need longer pass their own.
    DEFAULT_TIMEOUT_MS: Final = 4200

    def __init__(self, host: QWidget) -> None:
        super().__init__(host)
        self._toasts: list[Toast] = []
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        # The corner is defined by the host, so the stack has to hear the host
        # resize rather than its own.
        host.installEventFilter(self)
        self.hide()
        self.install_theme_hook()

    @property
    def toasts(self) -> tuple[Toast, ...]:
        """The toasts currently on screen, oldest first."""
        return tuple(self._toasts)

    def show_toast(
        self,
        title: str,
        *,
        body: str = "",
        kind: ToastKind = "info",
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
    ) -> Toast:
        """Raise one acknowledgement in the corner and return it."""
        toast = Toast(title, body=body, kind=kind, parent=self)
        toast.closed.connect(lambda: self._remove(toast))
        self._toasts.append(toast)
        while len(self._toasts) > _MAX_VISIBLE:
            self._toasts[0].dismiss()
        self._relayout()
        toast.show()
        self.show()
        self.raise_()
        self._rise(toast)
        toast.start_timeout(timeout_ms)
        return toast

    def clear(self) -> None:
        """Take every toast down at once — a view change, a shutdown."""
        for toast in tuple(self._toasts):
            toast.dismiss()

    def apply_theme(self, theme: Theme) -> None:
        # The toasts are restyled here rather than left to their own hooks
        # because their heights move with the type scale, and the stack has to
        # measure them *after* they have taken the new one. Applying twice is
        # cheap; laying out against stale heights is a visible gap.
        for toast in self._toasts:
            toast.apply_theme(theme)
        self._relayout()

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:  # noqa: N802 — Qt's spelling
        if event.type() == QEvent.Type.Resize and watched is self.parentWidget():
            self._relayout()
        return super().eventFilter(watched, event)

    def _remove(self, toast: Toast) -> None:
        # A toast can announce itself closed more than once — the user reaching
        # the control just as the timer expires is the ordinary case — and the
        # second one must not schedule a second deletion.
        if toast not in self._toasts:
            return
        self._toasts.remove(toast)
        toast.deleteLater()
        if self._toasts:
            self._relayout()
        else:
            self.hide()

    def _relayout(self) -> None:
        host = self.parentWidget()
        if host is None or not self._toasts:
            return
        theme = tokens()
        margin, gap = theme.space.lg, theme.space.sm
        width = max(0, min(_STACK_WIDTH, host.width() - 2 * margin))
        heights = []
        for toast in self._toasts:
            toast.setFixedWidth(width)
            heights.append(self._height_of(toast, width))
        total = sum(heights) + gap * (len(heights) - 1)
        total = min(total, max(0, host.height() - 2 * margin))
        self.setGeometry(
            host.width() - margin - width, host.height() - margin - total, width, total
        )
        # Newest last, so a toast that arrives while an older one is still up
        # pushes the older one away from the corner instead of displacing it.
        top = 0
        for toast, height in zip(self._toasts, heights, strict=True):
            toast.setGeometry(0, top, width, height)
            top += height + gap

    @staticmethod
    def _height_of(toast: Toast, width: int) -> int:
        """How tall *toast* has to be at *width*, with its body wrapped.

        `sizeHint` is the wrong question for a wrapping label — it answers with
        the width the text would like, not the height it needs once it has been
        given less.
        """
        if toast.hasHeightForWidth():
            return max(toast.heightForWidth(width), toast.minimumSizeHint().height())
        return toast.sizeHint().height()

    def _rise(self, toast: Toast) -> None:
        """Bring *toast* up the motion scale's shift, once, on arrival.

        Under reduced motion the toast is already at its landing position at
        full opacity — what the gate removes is the travel, never the outcome.
        """
        from rotaris.theme.reduced_motion import reduced_motion

        if reduced_motion():
            return
        theme = tokens()
        landing = toast.pos()
        animation = QPropertyAnimation(toast, QByteArray(b"pos"), toast)
        animation.setDuration(theme.motion.slow)
        animation.setEasingCurve(theme.motion.ease_out.curve())
        animation.setStartValue(QPoint(landing.x(), landing.y() + theme.motion.shift))
        animation.setEndValue(landing)
        animation.start(QAbstractAnimation.DeletionPolicy.DeleteWhenStopped)


@traces(SWR.SWR_3702)
class Spinner(QWidget):
    """An arc turning on a faint ring while something is in flight.

    The timer follows visibility rather than the caller's discipline. A spinner
    left running is a repaint every frame for the life of the window, and the
    place that forgets to stop one is always the path where the work failed —
    which is precisely the path where the user is already looking at something
    going wrong.
    """

    def __init__(
        self,
        size: SpinnerSize = "md",
        *,
        label: str = "Working",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._side = _SPINNER_SIDES[size]
        self._stroke = _SPINNER_STROKES[size]
        self._angle = 0.0
        self.setFixedSize(QSize(self._side, self._side))
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        # A turning shape with no name is a decoration to a screen reader.
        self.setAccessibleName(label)
        self._timer = QTimer(self)
        self._timer.setInterval(_FRAME_MS)
        self._timer.timeout.connect(self._advance)

    @property
    def spinning(self) -> bool:
        return self._timer.isActive()

    def sizeHint(self) -> QSize:  # noqa: N802 — Qt's spelling
        return QSize(self._side, self._side)

    def showEvent(self, event: QShowEvent) -> None:  # noqa: N802 — Qt's spelling
        super().showEvent(event)
        from rotaris.theme.reduced_motion import reduced_motion

        if reduced_motion():
            # The spinner renders statically: an arc on a ring, still
            # unmistakably "working" — the gate removes the turn, not the cue.
            self.update()
            return
        self._timer.start()

    def hideEvent(self, event: QHideEvent) -> None:  # noqa: N802 — Qt's spelling
        super().hideEvent(event)
        self._timer.stop()

    def _advance(self) -> None:
        self._angle = (self._angle + _DEGREES_PER_FRAME) % 360.0
        self.update()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        del event
        theme = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        stroke = self._stroke
        # The arc is drawn on the stroke's centre line, so the ring is inset by
        # half of it or the outer edge is clipped by the widget's own bounds.
        ring = QRectF(stroke / 2, stroke / 2, self._side - stroke, self._side - stroke)

        track = QPen(theme.color.accent.base.with_opacity(_TRACK_ALPHA).qcolor)
        track.setWidthF(stroke)
        painter.setPen(track)
        painter.drawArc(ring, 0, 360 * 16)

        head = QPen(theme.color.accent[300].qcolor)
        head.setWidthF(stroke)
        head.setCapStyle(Qt.PenCapStyle.RoundCap)
        painter.setPen(head)
        # Qt measures in sixteenths of a degree and counts anticlockwise, so a
        # clockwise sweep is a start angle that decreases.
        painter.drawArc(ring, int(-self._angle * 16), _ARC_SPAN_DEGREES * 16)


@traces(SWR.SWR_3702)
def attach_tooltip(widget: QWidget, text: str, shortcut: str | None = None) -> None:
    """Give *widget* a tooltip, and give a screen reader the same sentence.

    Qt's own `QToolTip` is the tooltip — the application stylesheet already
    dresses it, and a second implementation would be a floating window that
    differs from the platform's in exactly the ways a user notices. What this
    adds is the half Qt does not: the text also becomes the accessible
    description, so an affordance explained only on hover is not explained only
    to people using a mouse (`apps/rotaris/AGENTS.md`).
    """
    hint = _with_shortcut(text, shortcut)
    widget.setToolTip(hint)
    widget.setAccessibleDescription(hint)


def _with_shortcut(text: str, shortcut: str | None) -> str:
    """*text* with its key spelled the way the platform spells it."""
    if not shortcut:
        return text
    keys = QKeySequence(shortcut).toString(QKeySequence.SequenceFormat.NativeText) or shortcut
    return f"{text} ({keys})" if text else keys
