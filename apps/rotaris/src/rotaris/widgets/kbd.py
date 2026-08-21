"""Keycaps — the design system's `.kbd` and `.kbd-seq`.

A shortcut written into a sentence ("press Ctrl+Shift+P") is prose; a shortcut
drawn as keys is an instruction, and the difference is what a reader's eye finds
when scanning a menu, a tooltip or a help pane. The shape does that work: a
raised ground, a hairline edge, and a doubled bottom edge that reads as the lip
of a physical key. None of it is colour, which is what lets a cap sit inside
running text without competing with the text around it.

The names printed on the caps come from Qt, not from the caller. Which modifier
a binding actually uses is a property of the platform the user is sitting at —
`Ctrl` on Windows and Linux, `⌘` on macOS — and a cap that disagreed with the
key under the user's finger would be worse than no cap at all.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt
from PySide6.QtGui import QKeySequence
from PySide6.QtWidgets import QHBoxLayout, QLabel, QSizePolicy, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import Themed

if TYPE_CHECKING:
    from rotaris.theme.spec import Theme

__all__ = ["Kbd", "KbdSequence", "format_shortcut"]


def _native_text(shortcut: QKeySequence | str) -> str:
    """*shortcut* spelled the way this platform spells it.

    Native rather than portable text: portable text is what Rotaris stores, and
    native text is what the user's keyboard says. Falling back to the raw string
    matters because a caption Qt cannot parse as a key sequence — a chord
    involving the mouse, say — is still a shortcut worth showing.
    """
    sequence = shortcut if isinstance(shortcut, QKeySequence) else QKeySequence(shortcut)
    native = sequence.toString(QKeySequence.SequenceFormat.NativeText)
    return native or (shortcut if isinstance(shortcut, str) else "")


def _chord_keys(chord: str) -> list[str]:
    keys = [key for key in chord.split("+") if key]
    # `Ctrl++` is Ctrl and the plus key. Splitting on the separator eats the key
    # itself and would leave a modifier with nothing to modify.
    if chord.endswith("++"):
        keys.append("+")
    return keys or ([chord] if chord else [])


@traces(SWR.SWR_3702)
def format_shortcut(shortcut: QKeySequence | str) -> list[str]:
    """The key names to print on the caps, one per cap.

    A sequence with more than one chord (`Ctrl+K, Ctrl+S`) is flattened into its
    keys in order. The boundary between the chords is not lost with it:
    :class:`KbdSequence` keeps the written sequence as its accessible name, which
    is the form a screen reader can read back as a single instruction.
    """
    keys: list[str] = []
    for chord in _native_text(shortcut).split(", "):
        keys.extend(_chord_keys(chord.strip()))
    return keys


@traces(SWR.SWR_3702)
class Kbd(Themed, QLabel):
    """One keycap."""

    def __init__(self, key: str, parent: QWidget | None = None) -> None:
        super().__init__(key, parent)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        # A cap is as wide as the key name and no wider; left to Qt's default
        # policy a QLabel would stretch across whatever row it was dropped into.
        self.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Fixed)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # Two and a half steps of the 8px module — the design system's 20px cap.
        # QSS sizes the *content* rectangle, so the edges come out of that 20:
        # what the design system pins is the whole key, lip included.
        box = theme.space[2.5]
        edges = theme.size.hairline
        self.setStyleSheet(
            f"color:{theme.color.text_secondary};"
            f"background:{theme.color.surface_raised};"
            f"border:{edges}px solid {theme.color.border_strong};"
            # The one edge that is not a hairline. Doubling the bottom is the
            # whole illusion: it reads as the lip of a key seen from above.
            f"border-bottom-width:{edges * 2}px;"
            f"border-radius:{max(theme.radius.sm - 1, 0)}px;"
            f"font-family:{theme.type.mono};"
            f"font-size:{theme.type.scale.x2s}px;"
            f"font-weight:{theme.type.weight_body};"
            f"padding:0 {theme.space.xs}px;"
            f"min-width:{box - edges * 2}px;"
            f"min-height:{box - edges * 3}px;max-height:{box - edges * 3}px;"
        )


@traces(SWR.SWR_3702)
class KbdSequence(Themed, QWidget):
    """A shortcut as a row of keycaps."""

    def __init__(self, shortcut: QKeySequence | str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._row = QHBoxLayout(self)
        self._row.setContentsMargins(0, 0, 0, 0)
        self.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Fixed)
        self.set_shortcut(shortcut)
        self.install_theme_hook()

    def set_shortcut(self, shortcut: QKeySequence | str) -> None:
        """Rebuild the row for *shortcut*, discarding the caps already there."""
        while (item := self._row.takeAt(0)) is not None:
            if (widget := item.widget()) is not None:
                # Unparent before scheduling the delete: `deleteLater` waits for
                # the event loop, and a cap taken out of the layout but still
                # owned by this widget keeps painting where it last sat.
                widget.setParent(None)
                widget.deleteLater()
        for key in format_shortcut(shortcut):
            self._row.addWidget(Kbd(key))
        # Three caps announce as three unrelated labels. The written sequence is
        # the only form that says "press these together".
        self.setAccessibleName(_native_text(shortcut))

    def apply_theme(self, theme: Theme) -> None:
        # Tighter than the smallest spacing step, which separates things that
        # are merely adjacent. These caps are one chord, so they touch.
        self._row.setSpacing(max(theme.space.xs - 1, 1))
