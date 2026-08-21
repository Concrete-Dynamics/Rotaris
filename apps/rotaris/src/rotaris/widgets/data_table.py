"""The design system's data table.

Most of `.table` is already in the application stylesheet: `QHeaderView::section`
gives the header its colour, size and weight, and `QTableView::item` gives the
cells their padding, hover and selection (`theme/qss.py::_collections`). None of
that is repeated here. What is here is the part a stylesheet cannot carry, and
each piece of it is a property QSS parses, accepts and then silently drops:

* **`letter-spacing`.** The design system's header is tracked out at
  `--rt-tracking-label`, and every version of it that shipped as a stylesheet
  line has rendered untracked — the declaration is valid CSS and a no-op in Qt.
  Tracking reaches Qt only through `QFont`, so the header's font is built here
  and set on the header view.
* **`text-transform`.** Same story: the header is uppercase in the design system
  and uppercase has to be applied to the string, not asked for in a rule.
* **`font-variant-numeric`.** A column of numbers set in a proportional face
  re-flows every time a digit changes, because `1` is narrower than `8`. The
  mono face with `tnum` is what stops a table of counts from twitching as it
  updates, and again the only spelling Qt acts on is the OpenType feature.

The hover is the fourth. Qt has cell hover and the design system has row hover
(`.table tbody tr:hover`), which is not a difference of degree: a pointer
resting in a wide table with a single lit cell tells the reader nothing about
which row they are on. :class:`_RowHoverDelegate` closes that gap by forcing the
state the stylesheet already knows how to paint.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QAbstractItemView,
    QStyle,
    QStyledItemDelegate,
    QTableWidget,
    QTableWidgetItem,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

    from PySide6.QtCore import QEvent, QModelIndex, QPersistentModelIndex
    from PySide6.QtWidgets import QStyleOptionViewItem, QWidget

    from rotaris.theme.spec import Theme

__all__ = ["Table"]


class _RowHoverDelegate(QStyledItemDelegate):
    """Extends Qt's cell hover across the whole row.

    Qt tracks one hovered *index*, so `QTableView::item:hover` lights a single
    cell. Forcing the same state onto every cell of that index's row is enough
    to get the design system's row hover out of the stylesheet rule that is
    already there — no colour is decided here, and none should be.
    """

    def initStyleOption(  # noqa: N802  (Qt override)
        self, option: QStyleOptionViewItem, index: QModelIndex | QPersistentModelIndex
    ) -> None:
        super().initStyleOption(option, index)
        table = self.parent()
        if isinstance(table, Table) and index.row() == table.hovered_row:
            # Qt has carried `state` on every style option since 4.0; the
            # PySide6 stubs list an option's methods and none of its fields.
            option.state |= QStyle.StateFlag.State_MouseOver  # type: ignore[attr-defined]


@traces(SWR.SWR_3702)
class Table(Themed, QTableWidget):
    """A flush, hover-lit data table that takes its faces from the active theme.

    Constructed with the name a screen reader should announce, because a table
    is one of the two controls the app's accessibility rules name explicitly and
    an unnamed one announces itself as "table".

    Columns holding numbers are declared, not detected: a version string and a
    commit count are both digits, and only the caller knows which of them is a
    quantity that should line up down the column.
    """

    def __init__(self, name: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._numeric: frozenset[int] = frozenset()
        self._hovered_row = -1
        self.setAccessibleName(name)
        self.setShowGrid(False)
        # The design system separates rows by hover, not by zebra fill. Both at
        # once reads as a spreadsheet rather than as a list of facts.
        self.setAlternatingRowColors(False)
        self.setWordWrap(False)
        self.setCornerButtonEnabled(False)
        self.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.setVerticalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.setHorizontalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.verticalHeader().setVisible(False)
        header = self.horizontalHeader()
        header.setStretchLastSection(True)
        # Qt bolds the section over the current column, which turns one header
        # cell into a title. The header is a kicker; all of it or none of it.
        header.setHighlightSections(False)
        # Nothing here sorts, and a section that depresses under the pointer and
        # then does nothing reads as a broken control. `setSortingEnabled(True)`
        # puts the clicks back for a table that does sort.
        header.setSectionsClickable(False)
        self.setItemDelegate(_RowHoverDelegate(self))
        # `entered` is how Qt reports the row under the pointer, and it only
        # fires while the view tracks the mouse.
        self.setMouseTracking(True)
        self.viewport().setMouseTracking(True)
        self.entered.connect(self._enter_row)
        self.viewportEntered.connect(self._leave_rows)
        self.install_theme_hook()

    @property
    def hovered_row(self) -> int:
        """The row under the pointer, or -1. Read by the hover delegate."""
        return self._hovered_row

    def set_columns(self, labels: Sequence[str]) -> None:
        """Replace the header with *labels*, as the design system sets them."""
        self.setColumnCount(len(labels))
        for column, label in enumerate(labels):
            item = QTableWidgetItem(label.upper())
            # Uppercase is a typographic decision, and a screen reader that
            # meets one spells it out letter by letter. The reader gets the
            # label as it was written.
            item.setData(Qt.ItemDataRole.AccessibleTextRole, label)
            self.setHorizontalHeaderItem(column, item)
        self._restyle_cells(tokens())

    def set_rows(self, rows: Sequence[Sequence[str]]) -> None:
        """Replace every row. Values past the last declared column are dropped.

        Called with rows but no columns, the widest row decides how many there
        are — a table of data with no header is still a table.
        """
        if not self.columnCount() and rows:
            self.setColumnCount(max(len(row) for row in rows))
        self.setRowCount(len(rows))
        for index, row in enumerate(rows):
            for column, text in enumerate(row[: self.columnCount()]):
                self.setItem(index, column, QTableWidgetItem(text))
        self._restyle_cells(tokens())

    def set_numeric_columns(self, columns: Iterable[int]) -> None:
        """Set *columns* in the mono face with tabular figures, right-aligned.

        Right-aligned because tabular figures only pay for themselves when the
        column has an edge to line up on: equal advances put the units under the
        units, and a shared right edge is what makes that visible.
        """
        self._numeric = frozenset(columns)
        self._restyle_cells(tokens())

    def apply_theme(self, theme: Theme) -> None:
        header_font = theme.type.body_font(theme.type.scale.x2s, weight=theme.type.weight_strong)
        header_font.setLetterSpacing(
            QFont.SpacingType.PercentageSpacing, 100 + theme.type.tracking_label
        )
        self.horizontalHeader().setFont(header_font)
        self._restyle_cells(theme)

    def leaveEvent(self, event: QEvent) -> None:  # noqa: N802  (Qt override)
        self._leave_rows()
        super().leaveEvent(event)

    # Ignored rather than reconciled: the two supertypes already disagree about
    # what `update` takes, and no signature satisfies both.
    def update(  # type: ignore[override]
        self, index: QModelIndex | QPersistentModelIndex | None = None
    ) -> None:
        """Repaint the view, or just one index.

        Qt's item views hide `QWidget::update()` behind `update(index)`, so any
        code that repaints an arbitrary widget — a theme repolish pass, a
        generic "this changed, redraw it" — raises `TypeError` the moment it
        reaches a table. Handing the no-argument form back costs nothing.
        """
        if index is None:
            self.viewport().update()
        else:
            super().update(index)

    def _restyle_cells(self, theme: Theme) -> None:
        numeric_font = theme.type.mono_font(theme.type.scale.sm)
        numeric_font.setFeature(QFont.Tag("tnum"), 1)
        for column in range(self.columnCount()):
            numeric = column in self._numeric
            alignment = Qt.AlignmentFlag.AlignVCenter | (
                Qt.AlignmentFlag.AlignRight if numeric else Qt.AlignmentFlag.AlignLeft
            )
            header_item = self.horizontalHeaderItem(column)
            if header_item is not None:
                header_item.setTextAlignment(alignment)
            for row in range(self.rowCount()):
                item = self.item(row, column)
                if item is None:
                    continue
                item.setTextAlignment(alignment)
                if numeric:
                    item.setFont(numeric_font)
                else:
                    # Clearing the role rather than assigning the body font
                    # hands the cell back to the view's font, which the
                    # application stylesheet owns.
                    item.setData(Qt.ItemDataRole.FontRole, None)

    def _enter_row(self, index: QModelIndex) -> None:
        self._set_hovered_row(index.row() if index.isValid() else -1)

    def _leave_rows(self) -> None:
        self._set_hovered_row(-1)

    def _set_hovered_row(self, row: int) -> None:
        if row == self._hovered_row:
            return
        self._hovered_row = row
        self.viewport().update()
