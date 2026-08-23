"""The form group: a caption, a control, and what the field says when it is wrong.

The application stylesheet already dresses `QLineEdit`, `QPlainTextEdit` and
`QComboBox` completely (:mod:`rotaris.theme.qss`), so nothing here paints an
input. What this module adds is the part a stylesheet cannot hold — the
relationship between a control and the words around it.

That relationship is an accessibility contract rather than a layout
convenience. A caption drawn above a box is a caption to a sighted user and
nothing at all to a screen reader, so :class:`Field` makes it the control's
buddy and its accessible name. An error drawn under the box is worse, because
colour is the only thing carrying it: the same string becomes the control's
accessible description and raises an `invalid` property for the stylesheet to
select on. That is what `apps/rotaris/AGENTS.md` means when it says an
unavailable or invalid control has to explain itself.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from PySide6.QtCore import QSize, Qt
from PySide6.QtGui import QFontMetrics, QPaintEvent, QPalette, QResizeEvent
from PySide6.QtWidgets import (
    QComboBox,
    QLabel,
    QLineEdit,
    QListView,
    QPlainTextEdit,
    QStyle,
    QStyleOptionComboBox,
    QStylePainter,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import Themed, tokens

if TYPE_CHECKING:
    from rotaris.theme.spec import Theme

__all__ = ["Field", "FieldLabel", "Input", "Select", "TextArea"]


def _set_style_flag(widget: QWidget, name: str, on: bool) -> None:
    """Set a Qt property the application stylesheet selects on, and repaint.

    Qt resolves a widget's style once and caches the result, so a property
    changed after that is invisible until the widget is unpolished. Every flag
    here travels with its own re-resolution rather than trusting each caller to
    remember one.

    Only *widget* is re-resolved: a flag on a control says nothing about its
    children, and `theme.repolish` — which does descend — cannot be used on a
    control that owns an item view, because `QAbstractItemView` redeclares
    `update()` to take a model index and rejects the no-argument call. Reaching
    `QWidget`'s own `update` past that override is what keeps this safe whatever
    control a `Field` is given.
    """
    widget.setProperty(name, "true" if on else "false")
    style = widget.style()
    style.unpolish(widget)
    style.polish(widget)
    QWidget.update(widget)


def _without_mnemonic(text: str) -> str:
    """The caption as a screen reader should hear it.

    `&` in a `QLabel` marks the Alt accelerator and is not part of the name;
    `&&` is a literal ampersand.
    """
    return text.replace("&&", "\x00").replace("&", "").replace("\x00", "&")


class _StyleFlags:
    """The two Qt properties every form control in this module carries.

    `mono` is already resolved in :mod:`rotaris.theme.qss`, and `invalid` is the
    rule that belongs beside it. Either way a control's job is to raise the flag,
    never to paint it. The mixin carries no Qt base of its own — Shiboken allows
    a widget exactly one — and its host is always a `QWidget`, which is all the
    cast records.
    """

    def set_mono(self, mono: bool) -> None:
        """Set the value in the mono face, for a path, an id or a command."""
        _set_style_flag(cast("QWidget", self), "mono", mono)

    def set_invalid(self, invalid: bool) -> None:
        """Mark the value rejected. :meth:`Field.set_error` does this for you."""
        _set_style_flag(cast("QWidget", self), "invalid", invalid)


@traces(SWR.SWR_3702)
class FieldLabel(Themed, QLabel):
    """The caption above a control.

    Smaller than body text and heavier than it: the caption names the control
    rather than being read as content, and the extra weight is what keeps it
    legible after the size drop.
    """

    def __init__(self, text: str, parent: QWidget | None = None) -> None:
        super().__init__(text, parent)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self.setStyleSheet(
            f"color:{theme.color.text_secondary};"
            f"font-size:{theme.type.scale.xs}px;"
            f"font-weight:{theme.type.weight_strong};"
        )


@traces(SWR.SWR_3702)
class Field(Themed, QWidget):
    """A control with its caption above it and its verdict below.

    The verdict is one line, not two. A hint and an error answer the same
    question — "what belongs in here?" — and a field that grew a row when it
    failed would shift every control beneath it at the moment the user most
    needs the layout to hold still.
    """

    def __init__(
        self,
        label: str,
        control: QWidget,
        *,
        hint: str = "",
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.control = control
        self._hint = hint
        self._error: str | None = None

        self.label = FieldLabel(label)
        self.label.setBuddy(control)
        self.message = QLabel()
        self.message.setWordWrap(True)

        self._column = QVBoxLayout(self)
        self._column.setContentsMargins(0, 0, 0, 0)
        self._column.addWidget(self.label)
        self._column.addWidget(control)
        self._column.addWidget(self.message)

        name = _without_mnemonic(label)
        if name and not control.accessibleName():
            # The caption is the only name a user ever sees for this control, so
            # it is the one to announce — unless the caller set a more specific
            # name, which is a deliberate act and must not be overwritten.
            control.setAccessibleName(name)
        self.set_error(None)
        self.install_theme_hook()

    @property
    def error(self) -> str | None:
        """The rejection currently shown, or None while the field is valid."""
        return self._error

    def set_error(self, message: str | None) -> None:
        """Show *message* under the control and mark the control invalid.

        The string is mirrored into the control's accessible description
        because the line under the box is not information a screen reader has.
        Clearing the error restores the hint, so a field that has been corrected
        goes back to explaining itself rather than falling silent.
        """
        self._error = message or None
        text = self._error or self._hint
        self.message.setText(text)
        self.message.setVisible(bool(text))
        _set_style_flag(self.control, "invalid", self._error is not None)
        self.control.setAccessibleDescription(text)
        self.apply_theme(tokens())

    def apply_theme(self, theme: Theme) -> None:
        self._column.setSpacing(theme.space.xs)
        color = theme.color.fail_text if self._error else theme.color.text_tertiary
        self.message.setStyleSheet(f"color:{color};font-size:{theme.type.scale.xs}px;")


@traces(SWR.SWR_3702)
class Input(_StyleFlags, QLineEdit):
    """A single-line text control.

    Everything visible about it lives in the application stylesheet, so this
    holds no presentation and needs no theme hook: there is nothing here for a
    theme change to invalidate.
    """

    def __init__(
        self,
        placeholder: str = "",
        *,
        mono: bool = False,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.setPlaceholderText(placeholder)
        self.set_mono(mono)
        self.set_invalid(False)


@traces(SWR.SWR_3702)
class TextArea(Themed, _StyleFlags, QPlainTextEdit):
    """A multi-line text control.

    Dressed by the application stylesheet exactly like :class:`Input`. The one
    thing it holds is its resting height, which a stylesheet shared by every
    text edit in the app cannot decide for one widget.
    """

    def __init__(
        self,
        placeholder: str = "",
        *,
        mono: bool = False,
        min_height: int = 0,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._min_height = min_height
        self.setPlaceholderText(placeholder)
        self.set_mono(mono)
        self.set_invalid(False)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # Ten steps of the 8px module: the design system's 80px textarea. An
        # empty box has to read as somewhere to write a paragraph, not as a line
        # edit that happens to wrap.
        self.setMinimumHeight(self._min_height or theme.space[10])


#: How wide a drop-down may get before it stops growing and starts eliding.
#: The app's dropdowns are closed vocabularies — theme names, modes, models,
#: strategies — so the cap fits every real value whole while a runaway entry can
#: never widen the layout it lives in. A surface with a tighter budget calls
#: :meth:`Select.fit_within`.
SELECT_MAX_WIDTH = 240

#: The Qt property :func:`rotaris.widgets.model_combo.populate_model_combo` (and
#: :func:`rotaris.widgets.cards.set_action_availability`) writes a refusal reason
#: into. `Select.restate` must not overwrite it with its own elision copy.
_AVAILABILITY_REASON = "availabilityReason"


@traces(SWR.SWR_3702)
class Select(Themed, _StyleFlags, QComboBox):
    """A dropdown that fits the entry it is *showing*, and states the rest.

    Two things a plain :class:`QComboBox` will not do at once. It must not size
    itself to its longest entry — a picker as wide as the longest model or
    provider label stops fitting a dense card the day somebody writes a longer
    one, and a squeezed window then cuts the selected entry mid-word
    (``Priority, then ic``). And it must not cut the entry it is showing: the
    width follows the *selected* entry rather than the longest one, bounded by
    the ceiling given (or :data:`SELECT_MAX_WIDTH`). Past that ceiling the text
    is elided with an ellipsis — a visible sign that there is more — and the
    whole value moves onto the tooltip and the accessible description, which is
    where both a sighted user and a screen reader then find it.

    The closed control is styled by the application stylesheet. The open one is
    not, quite: a stylesheet `font-family` dresses the combo box and never
    reaches the list Qt builds for it, so a mono field would fall back to the
    proportional face the moment it opened. That single property is carried here
    as a `QFont`, which does reach the popup.
    """

    def __init__(
        self,
        *,
        mono: bool = False,
        ceiling: int = SELECT_MAX_WIDTH,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._ceiling = ceiling
        self._purpose = ""
        #: What a caller last attached via `setAccessibleDescription` — the
        #: sentence :meth:`restate` must keep whatever it elides.
        self._described = ""
        #: What :meth:`_chrome` last measured; ``None`` until the style or the
        #: layout has given an answer.
        self._room: int | None = None
        self.setMaximumWidth(ceiling)
        # A combo's own minimum size hint follows its longest entry and would
        # push the layout it lives in wider than the window it has to fit in;
        # the fitted hint below is what actually governs the width.
        self.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)
        self.setMinimumContentsLength(8)
        # Some Qt styles hand a combo box a native popup, and a native popup
        # ignores the `QComboBox QAbstractItemView` rule the rest of the app is
        # dressed by. An explicit view is an ordinary Qt widget, so it inherits.
        self.setView(QListView())
        self.set_invalid(False)
        self.set_mono(mono)
        self.currentIndexChanged.connect(self.restate)
        self.install_theme_hook()

    def fit_within(self, ceiling: int) -> None:
        """Never ask for more than *ceiling* points, whatever the entries say."""
        self._ceiling = ceiling
        self.setMaximumWidth(ceiling)
        self.updateGeometry()
        self.restate()

    def set_purpose(self, text: str) -> None:
        """What this box is *for* — the sentence its tooltip keeps when it fits."""
        self._purpose = text
        self.restate()

    @property
    def purpose(self) -> str:
        """The sentence :meth:`set_purpose` was given."""
        return self._purpose

    def displayed_text(self) -> str:
        """What the box can actually show of its current entry, ellipsis and all."""
        return QFontMetrics(self.font()).elidedText(
            self.currentText(),
            Qt.TextElideMode.ElideRight,
            self._label_width(),
        )

    def sizeHint(self) -> QSize:  # noqa: N802 — Qt's spelling
        """As wide as the selected entry needs, and never wider than the ceiling."""
        hint = super().sizeHint()
        return QSize(min(self._ceiling, max(hint.width(), self._wanted())), hint.height())

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802 — Qt's spelling
        """A narrower box elides more of the same value, and has to say so.

        And the first real geometry is also the first honest measurement of the
        chrome, which the width this box asks for is computed from — so a hint
        made against the style's estimate is withdrawn and made again.
        """
        super().resizeEvent(event)
        estimated = self._room
        if self._chrome() != estimated:
            self.updateGeometry()
        self.restate()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802 — Qt's spelling
        """The frame and arrow the style draws, with the label elided into it."""
        del event  # there is one entry on this control and it is repainted whole
        painter = QStylePainter(self)
        painter.setPen(self.palette().color(QPalette.ColorRole.Text))
        option = QStyleOptionComboBox()
        self.initStyleOption(option)
        painter.drawComplexControl(QStyle.ComplexControl.CC_ComboBox, option)
        # `currentText` is a real attribute of the option at run time; the
        # bundled PySide6 stubs simply do not declare it.
        option.currentText = self.displayed_text()  # type: ignore[attr-defined]
        painter.drawControl(QStyle.ControlElement.CE_ComboBoxLabel, option)

    def restate(self) -> None:
        """Put whatever the box had to cut off where a user can still read it.

        Public because an entry's *text* can change under a box that never
        changed index — the move picker relabels its columns whenever the
        selection does — and the tooltip then has to follow. A refusal reason
        another helper attached (an unavailable model) rides along rather than
        being overwritten: the box keeps explaining itself whatever it elides.
        """
        whole = self.currentText()
        cut = bool(whole) and self.displayed_text() != whole
        reason = str(self.property(_AVAILABILITY_REASON) or "")
        tip = [part for part in (whole if cut else "", reason, self._purpose) if part]
        self.setToolTip("\n".join(tip))
        described = [part for part in (self._described, whole if cut else "") if part]
        super().setAccessibleDescription("\n".join(described))

    def setAccessibleDescription(self, text: str) -> None:  # noqa: N802 — Qt's spelling
        """Remember what the caller said, so restating the elision keeps it.

        :meth:`restate` owns the tooltip and the description's elided copy; the
        sentence a caller attached — what the field is for, or why a model is
        refused — is theirs and must survive any index change.
        """
        self._described = text
        super().setAccessibleDescription(text)

    def _label_width(self) -> int:
        """The room the style leaves for text, once the arrow has taken its own."""
        option = QStyleOptionComboBox()
        self.initStyleOption(option)
        return (
            self.style()
            .subControlRect(
                QStyle.ComplexControl.CC_ComboBox,
                option,
                QStyle.SubControl.SC_ComboBoxEditField,
                self,
            )
            .width()
        )

    def _wanted(self) -> int:
        """How wide this box would have to be to show its current entry whole."""
        return QFontMetrics(self.font()).horizontalAdvance(self.currentText()) + self._chrome() + 2

    def _chrome(self) -> int:
        """How much of the box is frame, padding and arrow rather than text.

        Measured against the box's own laid-out geometry wherever there is one,
        because that is the number :meth:`_label_width` will answer with when the
        text is elided — and a width asked for against a different arithmetic
        than the width the text is cut to is how a control ends up exactly wide
        enough to clip. The style's own answer for an empty entry seeds it, for
        the first layout, before there is a geometry to measure.
        """
        room = self._label_width()
        if room > 0 and self.width() > room:
            self._room = self.width() - room
        elif self._room is None:
            option = QStyleOptionComboBox()
            self.initStyleOption(option)
            self._room = (
                self.style()
                .sizeFromContents(
                    QStyle.ContentsType.CT_ComboBox,
                    option,
                    QSize(0, QFontMetrics(self.font()).height()),
                    self,
                )
                .width()
            )
        return self._room

    def set_mono(self, mono: bool) -> None:
        super().set_mono(mono)
        self.apply_theme(tokens())

    def apply_theme(self, theme: Theme) -> None:
        size = theme.type.scale.sm
        mono = self.property("mono") == "true"
        self.view().setFont(theme.type.mono_font(size) if mono else theme.type.body_font(size))
