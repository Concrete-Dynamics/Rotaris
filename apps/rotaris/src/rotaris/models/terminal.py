"""Emulated terminal state the desktop renders (SWR-3619).

Deliberately framework-free, like :mod:`rotaris.models.state`: the transcript
preview and the pop-out window read the *same* screen, so they can never show
different things about the same command, and the emulation can be tested
without a running application.

``pyte`` does the VT work.  It resolves what plain text cannot express — a
carriage return overwriting a progress bar in place, ``clear`` wiping the
screen, an alternate screen for a full-screen program, cursor addressing — which
is exactly the difference between "watching a command" and "reading a log".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import pyte
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence

#: A terminal that is too narrow makes every wrapped line wrong, and one that is
#: too wide wastes emulation on columns nobody will see.  80×24 is what a
#: program assumes when nothing tells it otherwise.
DEFAULT_COLS = 80
DEFAULT_ROWS = 24

#: Scrollback kept per stream.  Deep enough to scroll back through a test run,
#: shallow enough that a dozen open terminals stay cheap.
DEFAULT_HISTORY = 2000


class _NewlineScreen(pyte.HistoryScreen):
    """A history screen whose newline mode survives every reset.

    Two of the three sources feeding this emulator carry Unix newlines rather
    than a real ``\\r\\n``: the tmux tap joins captured rows with ``\\n``, and a
    session reloaded from disk holds text written the same way.  Without
    ``LNM`` a bare line feed is an index with no carriage return, so the second
    line starts under the end of the first and the output walks diagonally off
    the right-hand edge.

    ``pyte`` restores the default mode set on every reset, and resets are
    routine here — a ``screen`` frame replaces the whole screen, and a program
    may send ``ESC c`` itself — so the mode is re-armed there rather than set
    once.  Construction is the exception: ``pyte`` overwrites the mode set
    *after* its own constructor calls ``reset``, so that one is armed below.
    """

    def __init__(self, columns: int, lines: int, history: int, ratio: float) -> None:
        super().__init__(columns, lines, history=history, ratio=ratio)
        self.set_mode(pyte.modes.LNM)

    def reset(self) -> None:
        super().reset()
        self.set_mode(pyte.modes.LNM)


@traces(SWR.SWR_3619)
@dataclass(frozen=True, slots=True)
class TerminalCell:
    """One character position, with everything needed to paint it."""

    char: str = " "
    fg: str = "default"
    bg: str = "default"
    bold: bool = False
    italics: bool = False
    underscore: bool = False
    reverse: bool = False

    @property
    def blank(self) -> bool:
        """True when this cell needs no paint beyond the background."""
        return (
            self.char == " " and self.bg == "default" and not self.reverse and not self.underscore
        )


@traces(SWR.SWR_3619)
class TerminalScreen:
    """Emulator state for one terminal stream.

    Consumes both frame kinds the engine publishes: ``delta`` is appended
    output, ``screen`` replaces everything — which is all a tmux pane can offer.
    """

    def __init__(
        self,
        cols: int = DEFAULT_COLS,
        rows: int = DEFAULT_ROWS,
        *,
        history: int = DEFAULT_HISTORY,
        command: str = "",
    ) -> None:
        self.command = command
        self.exit_code: int | None = None
        self.running = True
        self.truncated = False
        self._history = history
        self._revision = 0
        self._screen = _NewlineScreen(max(1, cols), max(1, rows), history=history, ratio=0.5)
        self._stream = pyte.Stream(self._screen)

    # ── identity and change tracking ─────────────────────────────────────

    @property
    def revision(self) -> int:
        """Bumped whenever the screen changed.

        This is what invalidates cached transcript rendering: a row whose screen
        did not change must not be re-laid-out, and one whose screen did must
        never keep a stale document.
        """
        return self._revision

    @property
    def cols(self) -> int:
        return self._screen.columns

    @property
    def rows(self) -> int:
        return self._screen.lines

    @property
    def cursor(self) -> tuple[int, int]:
        """Cursor position as ``(row, column)`` within the visible screen."""
        return self._screen.cursor.y, self._screen.cursor.x

    # ── input ────────────────────────────────────────────────────────────

    def feed(self, data: str, *, replace: bool = False) -> None:
        """Consume terminal output; *replace* resets the screen first."""
        if not data and not replace:
            return
        if replace:
            self._screen.reset()
        self._stream.feed(data)
        self._revision += 1

    def feed_frame(self, kind: str, data: str) -> None:
        """Consume one published frame by its kind."""
        if kind == "screen":
            self.feed(data, replace=True)
        elif kind == "delta":
            self.feed(data)

    def resize(self, cols: int, rows: int) -> bool:
        """Resize the emulated screen; False when nothing changed.

        ``pyte`` clips a shrinking screen at the top and leaves the cursor
        wherever it was, which produces a screen that disagrees with itself: a
        terminal holding two lines of output loses them the moment the window
        gives back a single row.  A real terminal drops the blank rows below the
        cursor first and retires anything above into scrollback, so the rows are
        moved here before ``pyte`` is asked to handle the columns.
        """
        cols, rows = max(1, cols), max(1, rows)
        if cols == self.cols and rows == self.rows:
            return False
        if rows < self._screen.lines:
            self._shrink_rows(rows)
        self._screen.resize(rows, cols)
        self._revision += 1
        return True

    def _shrink_rows(self, rows: int) -> None:
        screen = self._screen
        dropped = self._rows_to_retire(rows)
        for y in range(dropped):
            row = screen.buffer.pop(y, None)
            if row and any(char.data.strip() for char in row.values()):
                screen.history.top.append(row)
        if dropped:
            for index, y in enumerate(range(dropped, screen.lines)):
                row = screen.buffer.pop(y, None)
                if row is not None:
                    screen.buffer[index] = row
        for y in range(rows, screen.lines):
            screen.buffer.pop(y, None)
        screen.lines = rows
        screen.cursor.y = max(0, min(screen.cursor.y - dropped, rows - 1))
        screen.dirty.update(range(rows))
        screen.set_margins()

    def _rows_to_retire(self, rows: int) -> int:
        """How many rows come off the top so the newest content stays visible."""
        last_written = -1
        for y in range(self._screen.lines):
            row = self._screen.buffer.get(y)
            if row and any(char.data.strip() for char in row.values()):
                last_written = y
        needed = max(last_written + 1, self._screen.cursor.y + 1)
        return max(0, needed - rows)

    def mark_closed(self, exit_code: int | None) -> None:
        """Record that the command behind this screen has ended."""
        self.running = False
        self.exit_code = exit_code
        self._revision += 1

    # ── output ───────────────────────────────────────────────────────────

    def display(self) -> list[str]:
        """The visible screen as plain text, one string per row."""
        return list(self._screen.display)

    def tail_text(self, rows: int) -> list[str]:
        """The last *rows* written lines, for the transcript preview.

        Trailing blank rows are dropped: a command that printed three lines onto
        a 24-row screen should occupy three lines in the transcript, not
        twenty-four.
        """
        lines = [line.rstrip() for line in self.display()]
        while lines and not lines[-1]:
            lines.pop()
        while lines and not lines[0]:
            lines.pop(0)
        return lines[-rows:] if rows > 0 else lines

    def grid(self, rows: int | None = None) -> list[list[TerminalCell]]:
        """The whole visible screen as cells, or its last *rows* rows."""
        wanted = range(self._screen.lines)
        if rows is not None and rows > 0:
            start = max(0, self._screen.lines - rows)
            wanted = range(start, self._screen.lines)
        return [self._row_cells(self._screen.buffer[y]) for y in wanted]

    def tail_grid(self, rows: int) -> list[list[TerminalCell]]:
        """The last *rows* written lines as cells — the preview, with colour.

        Same trailing-blank rule as :meth:`tail_text`, so the coloured preview
        and the plain-text one always describe the same lines.
        """
        written = self._written_rows()
        if not written:
            return []
        start = max(0, len(written) - rows) if rows > 0 else 0
        return [self._row_cells(self._screen.buffer[y]) for y in written[start:]]

    def _written_rows(self) -> list[int]:
        """Visible row indices spanning the first written row to the last.

        Blank rows above and below the content carry nothing a reader wants in a
        preview — a cleared screen with one line on it is one line, not a screen
        of padding.  Blank rows *between* written lines are kept: those are the
        program's own spacing.
        """
        display = self.display()
        first, last = -1, -1
        for index, line in enumerate(display):
            if line.strip():
                last = index
                if first < 0:
                    first = index
        if first < 0:
            return []
        return list(range(first, last + 1))

    def history_grid(self, start: int, count: int) -> list[list[TerminalCell]]:
        """*count* rows from the scrollback, oldest first from *start*."""
        top = list(self._screen.history.top)
        total = len(top)
        if start >= total or count <= 0:
            return []
        return [self._row_cells(row) for row in top[start : start + count]]

    @property
    def history_lines(self) -> int:
        """How many rows have scrolled off the top and are still reachable."""
        return len(self._screen.history.top)

    def text(self, *, include_history: bool = True) -> str:
        """Everything readable, for copy-all and for plain-text assertions."""
        lines: list[str] = []
        if include_history:
            lines.extend(
                "".join(row[x].data for x in sorted(row)).rstrip()
                for row in self._screen.history.top
            )
        lines.extend(line.rstrip() for line in self.display())
        while lines and not lines[-1]:
            lines.pop()
        return "\n".join(lines)

    # ── internals ────────────────────────────────────────────────────────

    def _row_cells(self, row: Mapping[int, Any]) -> list[TerminalCell]:
        cells: list[TerminalCell] = []
        for x in range(self._screen.columns):
            char = row.get(x)
            if char is None:
                cells.append(TerminalCell())
                continue
            cells.append(
                TerminalCell(
                    char=char.data or " ",
                    fg=char.fg,
                    bg=char.bg,
                    bold=bool(char.bold),
                    italics=bool(char.italics),
                    underscore=bool(char.underscore),
                    reverse=bool(char.reverse),
                )
            )
        return cells


@traces(SWR.SWR_3619)
def screen_from_text(
    text: str,
    cols: int = DEFAULT_COLS,
    rows: int = DEFAULT_ROWS,
) -> TerminalScreen:
    """Build a screen from already-captured output.

    A session loaded from disk has no live stream; its terminal rows still have
    the persisted result, and that must render the same way live output does
    rather than as an empty preview.
    """
    screen = TerminalScreen(cols, max(rows, text.count("\n") + 1))
    screen.feed(text)
    screen.running = False
    return screen


def rows_of(lines: Iterable[Sequence[TerminalCell]]) -> list[str]:
    """Flatten painted cells back to text (tests, copy, accessibility)."""
    return ["".join(cell.char for cell in row).rstrip() for row in lines]
