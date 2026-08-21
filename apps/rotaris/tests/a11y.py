"""Measure what a Rotaris view offers a screen reader and a low-vision user.

Two accessibility rules in ``apps/rotaris/AGENTS.md`` are cheap to state and
easy to break silently: every control must be announceable by name, and text
must clear 4.5:1 against whatever it is painted on. Neither shows up in a
behavioural assertion — a view with an unnamed combo box and 2.3:1 secondary
text passes every functional test it has.

These helpers answer both questions for a live widget tree, so a sweep over the
six primary views can fail the moment a new control arrives unnamed or a label
picks a token that is too dim for its ground.

Colour resolution walks the widget's ancestors the way Qt's own cascade does:
an inline ``setStyleSheet`` on the widget wins, otherwise the nearest ancestor
that sets one, otherwise the application stylesheet's default for that
``objectName`` — or, for a card, for its ``surface`` property, which is the
door a card renamed after what it holds still comes in by. The defaults are
mirrored from ``build_qss`` and guarded by ``test_qss_defaults_match_the_resolver``
so the mirror cannot rot.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QAbstractItemView,
    QAbstractSpinBox,
    QCheckBox,
    QComboBox,
    QLineEdit,
    QPlainTextEdit,
    QPushButton,
    QRadioButton,
    QSlider,
    QTextEdit,
    QToolButton,
    QWidget,
)
from ui_query import accessible_name

from rotaris import theme
from rotaris.theme import tokens
from rotaris.theme.qss import ObjectStyle, object_styles
from rotaris.widgets.splitter import PanelSplitterHandle

if TYPE_CHECKING:
    from collections.abc import Iterator

__all__ = [
    "INTERACTIVE_KINDS",
    "boundary_grounds",
    "default_font_px",
    "default_text_color",
    "qss_background_by_object_name",
    "qss_defaults",
    "qss_font_size_by_object_name",
    "qss_foreground_by_object_name",
    "text_grounds",
    "ContrastViolation",
    "contrast_ratio",
    "effective_background",
    "effective_font",
    "effective_text_color",
    "interactive_controls",
    "text_contrast_violations",
    "unnamed_controls",
]

# WCAG 2.2 AA: normal text 4.5:1, large text 3:1. "Large" is 18px, or 14px bold.
AA_NORMAL_TEXT = 4.5
AA_LARGE_TEXT = 3.0
AA_NON_TEXT = 3.0
LARGE_TEXT_PX = 18
LARGE_BOLD_PX = 14


# The solid grounds Rotaris paints text on. The hover fill and the meter track
# are deliberately absent: no text is drawn on them, only rows and meter fills.
def text_grounds() -> tuple[str, ...]:
    color = tokens().color
    return (color.bg, color.surface, color.panel, color.chrome)


def boundary_grounds() -> tuple[str, ...]:
    """Grounds a border or a focus ring can be drawn against.

    Wider than the text grounds, because a boundary *is* drawn on the hover fill
    and on a meter's track — and the hover fill is the lightest of them, so it is
    the one a border most easily disappears against.
    """
    color = tokens().color
    return (*text_grounds(), color.hover, color.track)


def qss_defaults() -> dict[str, ObjectStyle]:
    """What the application stylesheet gives a widget by ``objectName``.

    Derived from :func:`rotaris.theme.qss.object_styles` — the same table
    ``build_qss`` generates its rules from — rather than transcribed from the
    stylesheet by hand (SWR-3706). A hand-kept copy of a table is a table that
    disagrees eventually, and when this one disagreed the failure was silent in
    the worst direction: the sweep would go on measuring against a colour the
    app had stopped using, and report everything as fine.
    """
    return object_styles(tokens())


def qss_foreground_by_object_name() -> dict[str, str]:
    return {
        name: str(style.foreground)
        for name, style in qss_defaults().items()
        if style.foreground is not None
    }


def qss_background_by_object_name() -> dict[str, str]:
    return {
        name: str(style.background)
        for name, style in qss_defaults().items()
        if style.background is not None
    }


def qss_font_size_by_object_name() -> dict[str, int]:
    return {
        name: style.font_size
        for name, style in qss_defaults().items()
        if style.font_size is not None
    }


def default_text_color() -> str:
    """The app-wide text colour the ``QWidget`` rule sets."""
    return str(tokens().color.text)


def default_font_px() -> int:
    """The app-wide font size the ``QWidget`` rule sets."""
    return tokens().type.scale.sm


# Controls a user operates. QLabel is excluded: it carries text, not action.
INTERACTIVE_KINDS: tuple[type[QWidget], ...] = (
    QPushButton,
    QToolButton,
    QComboBox,
    QLineEdit,
    QPlainTextEdit,
    QTextEdit,
    QCheckBox,
    QRadioButton,
    QSlider,
    QAbstractSpinBox,
    QAbstractItemView,
    # A resizable divider is a control a keyboard user focuses and moves
    # (SWR-3011), so it has to announce itself like any other.
    PanelSplitterHandle,
)

_COLOR = re.compile(r"(?<![\w-])color\s*:\s*([^;]+)")
_BACKGROUND = re.compile(r"(?<![\w-])background(?:-color)?\s*:\s*([^;]+)")
_FONT_SIZE = re.compile(r"(?<![\w-])font-size\s*:\s*(\d+)px")
_FONT_WEIGHT = re.compile(r"(?<![\w-])font-weight\s*:\s*(\d+|bold|normal)")
_HEX = re.compile(r"#[0-9a-fA-F]{6}")


# Re-exported from the design-system layer rather than reimplemented: theme.py
# uses the same function to hold persona shades above the readability floor, so
# a sweep computing its own ratios could disagree with the code it audits.
contrast_ratio = theme.contrast_ratio


def _solid_hex(declaration: str) -> str | None:
    """The opaque colour a declaration names, or None for ``transparent``/rgba.

    A translucent tint sits over whatever is behind it, so its real contrast
    depends on the stacking order. Returning None lets the caller keep walking
    up to the opaque ground underneath instead of guessing.
    """
    match = _HEX.search(declaration)
    return match.group(0) if match else None


def _ancestors(widget: QWidget) -> Iterator[QWidget]:
    node: QWidget | None = widget
    while node is not None:
        yield node
        node = node.parentWidget()


def effective_text_color(widget: QWidget) -> str:
    """The colour ``widget``'s text is drawn in, following Qt's cascade."""
    for node in _ancestors(widget):
        declaration = _COLOR.search(node.styleSheet() or "")
        if declaration and (color := _solid_hex(declaration.group(1))):
            return color
        if (name := node.objectName()) in (foreground := qss_foreground_by_object_name()):
            return foreground[name]
    return default_text_color()


def effective_background(widget: QWidget) -> str:
    """The opaque ground ``widget`` is painted on, following Qt's cascade."""
    for node in _ancestors(widget):
        declaration = _BACKGROUND.search(node.styleSheet() or "")
        if declaration and (color := _solid_hex(declaration.group(1))):
            return color
        background = qss_background_by_object_name()
        # The `surface` property is the second door the stylesheet paints a card
        # through, and it is the one a renamed card comes in by. Resolving only
        # by name would measure a `queueRunning` card's labels against the page
        # ground and report a contrast the user never sees.
        if (surface := node.property("surface")) in background:
            return background[str(surface)]
        if (name := node.objectName()) in background:
            return background[name]
    return str(tokens().color.bg)


def effective_font(widget: QWidget) -> tuple[int, bool]:
    """The pixel size and boldness that decide the AA threshold for ``widget``."""
    size, bold = default_font_px(), widget.font().bold()
    for node in _ancestors(widget):
        sheet = node.styleSheet() or ""
        if declaration := _FONT_SIZE.search(sheet):
            size = int(declaration.group(1))
            if weight := _FONT_WEIGHT.search(sheet):
                value = weight.group(1)
                bold = bold or value == "bold" or (value.isdigit() and int(value) >= 700)
            break
        if (name := node.objectName()) in (sizes := qss_font_size_by_object_name()):
            size = sizes[name]
            break
    return size, bold


def required_ratio(size_px: int, bold: bool) -> float:
    """4.5:1 for body copy, 3:1 once the text is large enough to read at range."""
    large = size_px >= LARGE_TEXT_PX or (size_px >= LARGE_BOLD_PX and bold)
    return AA_LARGE_TEXT if large else AA_NORMAL_TEXT


@dataclass(frozen=True)
class ContrastViolation:
    """One label that does not clear its AA threshold, with enough to fix it."""

    text: str
    foreground: str
    background: str
    size_px: int
    ratio: float
    required: float

    def __str__(self) -> str:
        return (
            f"{self.text!r}: {self.foreground} on {self.background} at "
            f"{self.size_px}px is {self.ratio:.2f}:1, needs {self.required}:1"
        )


def _visible_labels(root: QWidget) -> Iterator[QWidget]:
    from PySide6.QtWidgets import QLabel

    for label in root.findChildren(QLabel):
        # An empty or hidden label shows nobody anything; only rendered text
        # can be unreadable.
        if label.text().strip() and label.isVisible():
            yield label


def text_contrast_violations(root: QWidget) -> list[ContrastViolation]:
    """Every visible label under ``root`` that fails its WCAG AA threshold."""
    violations = []
    for label in _visible_labels(root):
        foreground = effective_text_color(label)
        background = effective_background(label)
        size, bold = effective_font(label)
        required = required_ratio(size, bold)
        ratio = contrast_ratio(foreground, background)
        if ratio < required:
            violations.append(
                ContrastViolation(
                    text=label.text().strip()[:60],
                    foreground=foreground,
                    background=background,
                    size_px=size,
                    ratio=ratio,
                    required=required,
                )
            )
    return violations


def _is_qt_internal(widget: QWidget, root: QWidget) -> bool:
    """True for the popup lists and header views Qt builds inside a control.

    A combo box owns a QListView and a tree owns a QHeaderView. Naming those
    is Qt's job, not the view author's, so a sweep that demanded names for
    them would report noise no product change could clear.
    """
    node = widget.parentWidget()
    while node is not None and node is not root:
        if isinstance(node, QComboBox | QAbstractItemView):
            return True
        node = node.parentWidget()
    return False


def interactive_controls(root: QWidget) -> list[QWidget]:
    """Every author-owned control under ``root`` a user can operate."""
    found: dict[int, QWidget] = {}
    for kind in INTERACTIVE_KINDS:
        for widget in root.findChildren(kind):
            if id(widget) in found or _is_qt_internal(widget, root):
                continue
            # Every QSplitter owns a zero-width leading handle that divides
            # nothing; `PanelSplitter` takes it out of the tab order, and a
            # divider no one can reach is not a control to name.
            if isinstance(widget, PanelSplitterHandle) and (
                widget.focusPolicy() == Qt.FocusPolicy.NoFocus
            ):
                continue
            found[id(widget)] = widget
    return list(found.values())


def unnamed_controls(root: QWidget) -> list[str]:
    """Controls under ``root`` a screen reader would announce as nothing."""
    return sorted(
        f"{type(widget).__name__} (objectName={widget.objectName()!r}, "
        f"tooltip={widget.toolTip()!r})"
        for widget in interactive_controls(root)
        if not accessible_name(widget)
    )
