"""Character-grid terminal widget (SWR-2429).

A rich-text editor can show a log; it cannot show a *terminal*.  Cursor
addressing, the alternate screen, and a progress bar redrawing in place all
need a grid of cells that can be repainted anywhere, so this widget paints one
directly and scrolls over the emulator's scrollback.

It renders a :class:`~rotaris.models.terminal.TerminalScreen` it is handed and
emits what the user typed.  It owns no process, no stream, and no emulator
state — deliberately, so the same widget serves any stream the bridge exposes.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import QPoint, QRect, QSize, Qt, Signal
from PySide6.QtGui import (
    QFontMetricsF,
    QKeyEvent,
    QPainter,
    QResizeEvent,
    QWheelEvent,
)
from PySide6.QtWidgets import QAbstractScrollArea, QApplication, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.theme import tokens
from rotaris.theme.manager import Themed

if TYPE_CHECKING:
    from PySide6.QtGui import QMouseEvent

    from rotaris.models.terminal import TerminalCell, TerminalScreen
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

#: Qt keys that map onto the backend's named-key vocabulary.  The backend
#: already speaks these names for the agent's own ``is_input`` calls, so the
#: whole path from keyboard to pseudo-terminal uses one language.
_NAMED_KEYS: dict[Qt.Key, str] = {
    Qt.Key.Key_Up: "UP",
    Qt.Key.Key_Down: "DOWN",
    Qt.Key.Key_Left: "LEFT",
    Qt.Key.Key_Right: "RIGHT",
    Qt.Key.Key_Home: "HOME",
    Qt.Key.Key_End: "END",
    Qt.Key.Key_PageUp: "PGUP",
    Qt.Key.Key_PageDown: "PGDN",
    Qt.Key.Key_Tab: "TAB",
    Qt.Key.Key_Backspace: "BS",
    Qt.Key.Key_Escape: "ESC",
    Qt.Key.Key_Return: "ENTER",
    Qt.Key.Key_Enter: "ENTER",
}

#: Keys that scroll this widget's own history instead of reaching the process.
#: The unshifted paging keys belong to whatever is running, so a user who has
#: taken control still needs a way back through the scrollback.
_SCROLLBACK_KEYS: frozenset[Qt.Key] = frozenset(
    {Qt.Key.Key_PageUp, Qt.Key.Key_PageDown, Qt.Key.Key_Home, Qt.Key.Key_End}
)

#: Gutter between the viewport edge and the character grid. Geometry rather
#: than a spacing token: every cell coordinate in this widget is measured from
#: it, and a grid that breathes with the theme would resize the emulator behind
#: the running command.
_PADDING = 6


@traces(SWR.SWR_2429)
class TerminalView(Themed, QAbstractScrollArea):
    """Paints an emulated terminal screen and reports what the user typed."""

    #: Literal text the user typed, to be written to the terminal verbatim.
    keys_entered = Signal(str)
    #: A named key or ``C-<letter>`` sequence the backend understands.
    control_key = Signal(str)
    #: The grid this widget can show, in columns and rows.
    grid_resized = Signal(int, int)
    #: A key press was discarded because input is not armed.  The host answers
    #: it; a keyboard that does nothing and says nothing is a dead end.
    input_rejected = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("terminalView")
        self.setAccessibleName("Terminal output")
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setFrameShape(QAbstractScrollArea.Shape.NoFrame)
        self.viewport().setAutoFillBackground(True)
        self._screen: TerminalScreen | None = None
        self._input_enabled = False
        self._revision = -1
        self._selection: tuple[int, int, int, int] | None = None
        self._selecting = False
        self._reported_grid: tuple[int, int] = (0, 0)
        # The cell is measured against the theme's mono face, so the real values
        # arrive from `apply_theme`; these only guarantee a whole cell exists
        # before it runs.
        self._cell_w = 1.0
        self._cell_h = 1.0
        self._descent = 0.0
        self.verticalScrollBar().valueChanged.connect(lambda _v: self.viewport().update())
        self._describe_input_state()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Re-measure the cell against *theme*'s mono face.

        The cell is the widget's unit of everything — the grid it reports to the
        emulator, where a glyph lands, which cell the mouse hit. A theme change
        can change the face and its size, so the measurement has to be redone
        and the new grid reported, or the running command keeps writing into a
        screen of the old shape.
        """
        font = theme.type.mono_font(theme.type.scale.sm)
        self.setFont(font)
        metrics = QFontMetricsF(font)
        self._cell_w = max(1.0, metrics.horizontalAdvance("M"))
        self._cell_h = max(1.0, metrics.height())
        self._descent = metrics.descent()
        self._apply_palette()
        self.updateGeometry()
        self._sync_grid_size()
        self.viewport().update()

    # ── content ──────────────────────────────────────────────────────────

    def set_screen(self, screen: TerminalScreen | None) -> None:
        """Show *screen*; resizes it to whatever this widget can display."""
        self._screen = screen
        self._selection = None
        self._revision = -1
        self._sync_grid_size()
        self.refresh()

    @property
    def terminal_screen(self) -> TerminalScreen | None:
        """Named around ``QWidget.screen()``, which means the display device."""
        return self._screen

    def refresh(self) -> None:
        """Repaint when the screen advanced; cheap to call on every tick."""
        screen = self._screen
        revision = -1 if screen is None else screen.revision
        rows = 0 if screen is None else screen.history_lines
        self.verticalScrollBar().setRange(0, max(0, rows))
        if revision == self._revision:
            return
        self._revision = revision
        if self._at_tail():
            self.verticalScrollBar().setValue(self.verticalScrollBar().maximum())
        self.viewport().update()

    def set_input_enabled(self, enabled: bool) -> None:
        """Arm or disarm keystroke forwarding; the host decides, not the widget."""
        self._input_enabled = enabled
        self._describe_input_state()
        self.viewport().update()

    def _describe_input_state(self) -> None:
        """Say in words what the caret says in shape (SWR-2429)."""
        self.setAccessibleDescription(
            "Live output of the running command. You have control: what you type is sent "
            "to the command. Shift+Tab leaves the terminal, Shift+Page Up scrolls back."
            if self._input_enabled
            else "Live output of the running command. Read-only until you take control."
        )

    @property
    def input_enabled(self) -> bool:
        return self._input_enabled

    def grid_size(self) -> tuple[int, int]:
        """Columns and rows this widget currently has room for."""
        usable_w = max(1, self.viewport().width() - 2 * _PADDING)
        usable_h = max(1, self.viewport().height() - 2 * _PADDING)
        return max(20, int(usable_w // self._cell_w)), max(4, int(usable_h // self._cell_h))

    def selected_text(self) -> str:
        """The current selection as text, empty when nothing is selected."""
        if self._selection is None or self._screen is None:
            return ""
        rows = self._visible_rows()
        y0, x0, y1, x1 = self._ordered_selection()
        out: list[str] = []
        for y in range(y0, min(y1 + 1, len(rows))):
            row = rows[y]
            start = x0 if y == y0 else 0
            end = x1 + 1 if y == y1 else len(row)
            out.append("".join(cell.char for cell in row[start:end]).rstrip())
        return "\n".join(out)

    def copy_selection(self) -> bool:
        """Copy the selection to the clipboard; False when there is none."""
        text = self.selected_text()
        if not text:
            return False
        clipboard = QApplication.clipboard()
        if clipboard is not None:
            clipboard.setText(text)
        return True

    # ── painting ─────────────────────────────────────────────────────────

    def paintEvent(self, event: object) -> None:  # noqa: N802 - Qt override
        del event
        colors = tokens().color
        painter = QPainter(self.viewport())
        painter.fillRect(self.viewport().rect(), colors.terminal_bg.qcolor)
        screen = self._screen
        if screen is None:
            painter.end()
            return
        painter.setFont(self.font())
        rows = self._visible_rows()
        sel = self._ordered_selection() if self._selection is not None else None
        for y, row in enumerate(rows):
            self._paint_row(painter, y, row, sel, colors.terminal_bg, colors.terminal_selection)
        self._paint_cursor(painter, screen, len(rows), colors.terminal_cursor)
        painter.end()

    def _paint_row(
        self,
        painter: QPainter,
        y: int,
        row: list[TerminalCell],
        sel: tuple[int, int, int, int] | None,
        ground: Color,
        selection: Color,
    ) -> None:
        top = _PADDING + y * self._cell_h
        baseline = top + self._cell_h - self._descent
        for x, cell in enumerate(row):
            selected = sel is not None and _in_selection(sel, y, x)
            fg = theme.terminal_color(cell.fg, background=False)
            bg = theme.terminal_color(cell.bg, background=True)
            if cell.reverse:
                fg, bg = bg, fg
            rect = QRect(
                int(_PADDING + x * self._cell_w),
                int(top),
                int(self._cell_w) + 1,
                int(self._cell_h) + 1,
            )
            if selected:
                painter.fillRect(rect, selection.qcolor)
            elif bg != ground:
                painter.fillRect(rect, bg.qcolor)
            if cell.blank and not cell.underscore:
                continue
            font = painter.font()
            if font.bold() != cell.bold or font.italic() != cell.italics:
                font.setBold(cell.bold)
                font.setItalic(cell.italics)
                painter.setFont(font)
            if font.underline() != cell.underscore:
                font.setUnderline(cell.underscore)
                painter.setFont(font)
            painter.setPen(fg.qcolor)
            painter.drawText(QPoint(int(_PADDING + x * self._cell_w), int(baseline)), cell.char)

    def _paint_cursor(
        self, painter: QPainter, screen: TerminalScreen, row_count: int, caret: Color
    ) -> None:
        if not screen.running or not self.hasFocus() or not self._at_tail():
            return
        cursor_row, cursor_col = screen.cursor
        offset = row_count - screen.rows
        y = cursor_row + offset
        if y < 0 or y >= row_count:
            return
        rect = QRect(
            int(_PADDING + cursor_col * self._cell_w),
            int(_PADDING + y * self._cell_h),
            max(2, int(self._cell_w)),
            int(self._cell_h),
        )
        colour = caret.qcolor
        if not self._input_enabled:
            # A hollow caret is the honest shape for "this terminal is not
            # listening to you yet" — a solid block would promise input.
            painter.setPen(colour)
            painter.drawRect(rect.adjusted(0, 0, -1, -1))
            return
        painter.fillRect(rect, colour)

    # ── input ────────────────────────────────────────────────────────────

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 - Qt override
        modifiers = event.modifiers()
        key = Qt.Key(event.key())
        ctrl = bool(modifiers & Qt.KeyboardModifier.ControlModifier)
        shift = bool(modifiers & Qt.KeyboardModifier.ShiftModifier)

        # Copy wins over interrupt when there is something to copy: a user who
        # selected text and pressed the copy shortcut did not mean to kill the
        # command they were reading.
        wants_copy = ctrl and key == Qt.Key.Key_C and (shift or self.selected_text())
        if wants_copy and self.copy_selection():
            event.accept()
            return
        # Shift+Tab always leaves.  An armed terminal forwards Tab to the
        # process, so without a reserved key it would be a focus trap with no
        # keyboard way out of it.
        if key == Qt.Key.Key_Backtab or (key == Qt.Key.Key_Tab and not self._input_enabled):
            super().keyPressEvent(event)
            return
        # Scrollback first.  A read-only terminal has nothing to send, so the
        # paging keys simply scroll; once input is armed they belong to the
        # process and the modified ones are the only way back through history.
        if key in _SCROLLBACK_KEYS and (shift or ctrl or not self._input_enabled):
            self._scroll_history(key)
            event.accept()
            return
        if not self._input_enabled:
            if event.text() or key in _NAMED_KEYS:
                self.input_rejected.emit()
                event.accept()
                return
            super().keyPressEvent(event)
            return
        if ctrl and Qt.Key.Key_A <= key <= Qt.Key.Key_Z:
            self.control_key.emit(f"C-{chr(key).lower()}")
            event.accept()
            return
        named = _NAMED_KEYS.get(key)
        if named is not None:
            self.control_key.emit(named)
            event.accept()
            return
        text = event.text()
        if text:
            self.keys_entered.emit(text)
            event.accept()
            return
        super().keyPressEvent(event)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt override
        if event.button() != Qt.MouseButton.LeftButton:
            super().mousePressEvent(event)
            return
        position = self._cell_at(event.position().toPoint())
        self._selection = (position[0], position[1], position[0], position[1])
        self._selecting = True
        self.viewport().update()
        event.accept()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt override
        if not self._selecting or self._selection is None:
            super().mouseMoveEvent(event)
            return
        y, x = self._cell_at(event.position().toPoint())
        self._selection = (self._selection[0], self._selection[1], y, x)
        self.viewport().update()
        event.accept()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt override
        self._selecting = False
        super().mouseReleaseEvent(event)

    def _scroll_history(self, key: Qt.Key) -> None:
        """Move through the scrollback without sending anything to the process."""
        bar = self.verticalScrollBar()
        page = max(1, bar.pageStep())
        if key == Qt.Key.Key_PageUp:
            bar.setValue(bar.value() - page)
        elif key == Qt.Key.Key_PageDown:
            bar.setValue(bar.value() + page)
        elif key == Qt.Key.Key_Home:
            bar.setValue(bar.minimum())
        else:
            bar.setValue(bar.maximum())

    def wheelEvent(self, event: QWheelEvent) -> None:  # noqa: N802 - Qt override
        bar = self.verticalScrollBar()
        steps = event.angleDelta().y() // 40
        bar.setValue(bar.value() - steps)
        event.accept()

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802 - Qt override
        super().resizeEvent(event)
        self._sync_grid_size()

    def showEvent(self, event: object) -> None:  # noqa: N802 - Qt override
        super().showEvent(event)  # type: ignore[arg-type]
        self._sync_grid_size()

    def sizeHint(self) -> QSize:  # noqa: N802 - Qt override
        return QSize(
            int(80 * self._cell_w) + 2 * _PADDING,
            int(24 * self._cell_h) + 2 * _PADDING,
        )

    # ── internals ────────────────────────────────────────────────────────

    def _apply_palette(self) -> None:
        # The viewport fills itself before `paintEvent` runs, so the ground has
        # to be in the palette as well as in the painter — otherwise a resize
        # flashes the platform default behind the grid.
        palette = self.viewport().palette()
        palette.setColor(self.viewport().backgroundRole(), tokens().color.terminal_bg.qcolor)
        self.viewport().setPalette(palette)

    def _sync_grid_size(self) -> None:
        """Report the grid, but only once this widget really has one.

        A widget that has not been laid out yet has a placeholder viewport, and
        reporting *that* as the terminal size shrinks the emulator to a few rows
        — which throws away the output the user opened the terminal to read.
        """
        if not self.isVisible():
            return
        viewport = self.viewport()
        if viewport.width() <= 4 * _PADDING or viewport.height() <= 4 * _PADDING:
            return
        cols, rows = self.grid_size()
        if (cols, rows) == self._reported_grid:
            return
        self._reported_grid = (cols, rows)
        self.grid_resized.emit(cols, rows)

    def _at_tail(self) -> bool:
        bar = self.verticalScrollBar()
        return bar.value() >= bar.maximum()

    def _visible_rows(self) -> list[list[TerminalCell]]:
        """Scrollback above the live screen, exactly as far back as scrolled."""
        screen = self._screen
        if screen is None:
            return []
        _cols, rows = self.grid_size()
        history_wanted = max(
            0, self.verticalScrollBar().maximum() - self.verticalScrollBar().value()
        )
        history_wanted = min(history_wanted, max(0, rows - 1))
        grid: list[list[TerminalCell]] = []
        if history_wanted:
            start = max(0, screen.history_lines - history_wanted)
            grid.extend(screen.history_grid(start, history_wanted))
        grid.extend(screen.grid())
        return grid[-rows:] if rows > 0 else grid

    def _ordered_selection(self) -> tuple[int, int, int, int]:
        assert self._selection is not None
        y0, x0, y1, x1 = self._selection
        if (y1, x1) < (y0, x0):
            return y1, x1, y0, x0
        return y0, x0, y1, x1

    def _cell_at(self, point: QPoint) -> tuple[int, int]:
        y = int(max(0, point.y() - _PADDING) // self._cell_h)
        x = int(max(0, point.x() - _PADDING) // self._cell_w)
        return y, x


def _in_selection(sel: tuple[int, int, int, int], y: int, x: int) -> bool:
    y0, x0, y1, x1 = sel
    if y < y0 or y > y1:
        return False
    if y0 == y1:
        return x0 <= x <= x1
    if y == y0:
        return x >= x0
    if y == y1:
        return x <= x1
    return True
