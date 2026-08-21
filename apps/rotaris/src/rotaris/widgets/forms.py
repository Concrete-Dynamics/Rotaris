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

from PySide6.QtWidgets import (
    QComboBox,
    QLabel,
    QLineEdit,
    QListView,
    QPlainTextEdit,
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
        # Eleven steps of the 8px module: the design system's 88px textarea. An
        # empty box has to read as somewhere to write a paragraph, not as a line
        # edit that happens to wrap.
        self.setMinimumHeight(self._min_height or theme.space[11])


@traces(SWR.SWR_3702)
class Select(Themed, _StyleFlags, QComboBox):
    """A dropdown.

    The closed control is styled by the application stylesheet. The open one is
    not, quite: a stylesheet `font-family` dresses the combo box and never
    reaches the list Qt builds for it, so a mono field would fall back to the
    proportional face the moment it opened. That single property is carried here
    as a `QFont`, which does reach the popup.
    """

    def __init__(self, *, mono: bool = False, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        # Some Qt styles hand a combo box a native popup, and a native popup
        # ignores the `QComboBox QAbstractItemView` rule the rest of the app is
        # dressed by. An explicit view is an ordinary Qt widget, so it inherits.
        self.setView(QListView())
        self.set_invalid(False)
        self.set_mono(mono)
        self.install_theme_hook()

    def set_mono(self, mono: bool) -> None:
        super().set_mono(mono)
        self.apply_theme(tokens())

    def apply_theme(self, theme: Theme) -> None:
        size = theme.type.scale.sm
        mono = self.property("mono") == "true"
        self.view().setFont(theme.type.mono_font(size) if mono else theme.type.body_font(size))
