"""A layout that wraps its controls onto the next line instead of demanding width.

A `QHBoxLayout` asks for the sum of what it holds. That is the right answer for a
row that must stay on one line, and the wrong one for a toolbar: the window's
minimum width becomes the sum of every control in it, so the bar stops fitting
the moment somebody adds a seventh button — or runs the app on a platform whose
font is wider (SWR-3302).

`FlowLayout` asks for the widest *single* control instead, and flows the rest
onto further lines when the width it is given cannot hold them. That makes the
minimum a property of one control rather than of the whole collection, which is
what keeps a bar inside the supported minimum window as it grows.

It is the layout from Qt's own examples, with two departures worth naming:

- **Height is honest.** `heightForWidth` reports what the wrap actually costs, so
  a bar that has wrapped onto two lines is given two lines' worth of room rather
  than being clipped.
- **Hidden controls take no space and force no wrap.** A bar whose controls
  appear and disappear with the workspace would otherwise wrap around gaps.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import QPoint, QRect, QSize, Qt
from PySide6.QtWidgets import QLayout
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens

if TYPE_CHECKING:
    from PySide6.QtWidgets import QLayoutItem, QWidget


@traces(SWR.SWR_3302)
class FlowLayout(QLayout):
    """Left-to-right, wrapping onto a new line when the next control will not fit."""

    def __init__(self, parent: QWidget | None = None, *, spacing: int | None = None) -> None:
        super().__init__(parent)
        self._items: list[QLayoutItem] = []
        # The gap between controls is the spacing module, resolved here rather
        # than written as a default argument: a default is evaluated once, at
        # import, which is before the user's theme is known (SWR-3706).
        self.setSpacing(tokens().space.sm if spacing is None else spacing)
        self.setContentsMargins(0, 0, 0, 0)

    # ── the QLayout container contract ────────────────────────────────────
    # Qt calls these to own, walk and dispose of the items; there is no
    # behaviour here beyond holding a list.

    def addItem(self, item: QLayoutItem) -> None:  # noqa: N802 — Qt's spelling
        self._items.append(item)

    def count(self) -> int:
        return len(self._items)

    def itemAt(self, index: int) -> QLayoutItem | None:  # noqa: N802 — Qt's spelling
        if 0 <= index < len(self._items):
            return self._items[index]
        return None

    # PySide6 types this as returning an item; Qt returns null past the end, and
    # that null is what ends `while layout.takeAt(0)` — the loop every caller
    # uses to empty a layout. Returning an item there would not terminate.
    def takeAt(self, index: int) -> QLayoutItem | None:  # type: ignore[override]  # noqa: N802 — Qt's spelling
        if 0 <= index < len(self._items):
            return self._items.pop(index)
        return None

    def expandingDirections(self) -> Qt.Orientation:  # noqa: N802 — Qt's spelling
        return Qt.Orientation(0)

    # ── sizing ────────────────────────────────────────────────────────────

    def hasHeightForWidth(self) -> bool:  # noqa: N802 — Qt's spelling
        return True

    def heightForWidth(self, width: int) -> int:  # noqa: N802 — Qt's spelling
        return self._arrange(QRect(0, 0, width, 0), apply_geometry=False)

    def setGeometry(self, rect: QRect) -> None:  # noqa: N802 — Qt's spelling
        super().setGeometry(rect)
        self._arrange(rect, apply_geometry=True)

    def sizeHint(self) -> QSize:  # noqa: N802 — Qt's spelling
        """What the bar wants: one line holding everything, as a row would."""
        size = QSize(0, 0)
        widths = 0
        for item in self._visible():
            hint = item.sizeHint()
            widths += hint.width()
            size = size.expandedTo(QSize(0, hint.height()))
        gaps = self.spacing() * max(0, len(self._visible()) - 1)
        return self._with_margins(QSize(widths + gaps, size.height()))

    def minimumSize(self) -> QSize:  # noqa: N802 — Qt's spelling
        """What the bar needs: the widest single control, not the sum of them.

        This is the whole point of the class. A row of eight controls that
        together want 826 points needs only its widest — and a window whose
        minimum follows the widest control stays inside its documented size as
        controls are added, translated, or rendered in a wider font.
        """
        size = QSize(0, 0)
        for item in self._visible():
            size = size.expandedTo(item.minimumSize())
        return self._with_margins(size)

    # ── the wrap itself ───────────────────────────────────────────────────

    def _arrange(self, rect: QRect, *, apply_geometry: bool) -> int:
        """Place each control, wrapping when the line is full; return the height.

        Runs in two modes on purpose: Qt asks for the height at a width it is
        considering (`apply_geometry=False`) before committing to it, and a
        measurement that moved the controls would make asking change the answer.
        """
        margins = self.contentsMargins()
        area = rect.adjusted(margins.left(), margins.top(), -margins.right(), -margins.bottom())
        y = area.y()

        for line in self._lines(area.width()):
            widths = self._share(line, area.width())
            x, line_height = area.x(), 0
            for item, width in zip(line, widths, strict=True):
                height = item.sizeHint().height()
                if apply_geometry:
                    item.setGeometry(QRect(QPoint(x, y), QSize(width, height)))
                x += width + self.spacing()
                line_height = max(line_height, height)
            y += line_height + self.spacing()

        return y - self.spacing() - rect.y() + margins.bottom()

    def _lines(self, width: int) -> list[list[QLayoutItem]]:
        """Group the controls into the lines they land on at *width*."""
        lines: list[list[QLayoutItem]] = []
        current: list[QLayoutItem] = []
        used = 0
        for item in self._visible():
            wanted = item.sizeHint().width()
            if current and used + self.spacing() + wanted > width:
                lines.append(current)
                current, used = [], 0
            used += wanted + (self.spacing() if current else 0)
            current.append(item)
        if current:
            lines.append(current)
        return lines

    def _share(self, line: list[QLayoutItem], width: int) -> list[int]:
        """Widths for one line's controls, with leftover room given to the greedy.

        A row hands spare width to whatever asked to expand — that is how the
        search field ends up wider than its hint on a wide window. Flowing must
        keep doing that, or moving a bar to this layout would visibly shrink the
        one control users type into.
        """
        widths = [item.sizeHint().width() for item in line]
        spare = width - sum(widths) - self.spacing() * max(0, len(line) - 1)
        greedy = [
            index
            for index, item in enumerate(line)
            if item.expandingDirections() & Qt.Orientation.Horizontal
        ]
        while spare > 0 and greedy:
            share = max(1, spare // len(greedy))
            for index in list(greedy):
                if spare <= 0:
                    break
                room = line[index].maximumSize().width() - widths[index]
                given = min(share, spare, max(0, room))
                widths[index] += given
                spare -= given
                if given < share or room <= given:
                    greedy.remove(index)
        return widths

    def _visible(self) -> list[QLayoutItem]:
        """The items that occupy space.

        A hidden control is not a gap to flow around: Qt excludes it from a
        row's sizing, and a bar whose controls come and go with the workspace
        would otherwise wrap early around room nothing is using.
        """
        return [item for item in self._items if not item.isEmpty()]

    def _with_margins(self, size: QSize) -> QSize:
        margins = self.contentsMargins()
        return size + QSize(
            margins.left() + margins.right(),
            margins.top() + margins.bottom(),
        )


__all__ = ["FlowLayout"]
