"""The design system's icon vocabulary, carried by the application (SWR-3708).

Every symbol the Rotaris Design System draws — in its guidelines, its
components, its UI kit — is a Phosphor glyph. The desktop app used to spell
its symbols in Unicode characters instead, which made every icon a property of
the host's font directory: the same defect SWR-3703 removed for text, still
alive for iconography.

Two rules keep this module honest:

- **Curated, not complete.** :data:`ICONS` names only what the product uses.
  Phosphor ships ~1,500 icons; carrying them all would make every unused name
  dead weight and every typo a silently wrong glyph. An unknown name raises.
- **Ink is resolved at paint time.** A rasterised icon holds its colour, so
  anything that places one has to be re-rasterised on a theme change
  (SWR-3701, SWR-3706). :func:`set_button_icon` owns that for buttons; the
  chrome and item views re-rasterise in their own ``apply_theme``.

The fonts themselves sit beside the text faces in ``assets/fonts/`` and are
registered by the same SWR-3703 loader, so under the ``offscreen`` platform —
where Qt reports *no* host families — the icons still render.
"""

from __future__ import annotations

import weakref
from typing import TYPE_CHECKING, Final

from PySide6.QtCore import QRectF, QSize, Qt
from PySide6.QtGui import QFont, QIcon, QPainter, QPixmap
from PySide6.QtWidgets import QApplication
from rotaris_core.reqtocode import SWR, traces
from shiboken6 import isValid

from rotaris.theme import tokens
from rotaris.theme.fonts import register_bundled_fonts
from rotaris.theme.manager import theme_manager

if TYPE_CHECKING:
    from PySide6.QtWidgets import QAbstractButton

    from rotaris.theme.color import Color

__all__ = [
    "FAMILY",
    "FILL_FAMILY",
    "ICONS",
    "char",
    "icon",
    "icon_font",
    "markup",
    "pixmap",
    "set_button_icon",
]

#: Family names as Qt reports them after registration.
FAMILY: Final = "Phosphor"
FILL_FAMILY: Final = "Phosphor-Fill"

#: Phosphor's own icon names → private-use codepoints, from the font's release
#: stylesheet (regular and fill share codepoints). Curated: only names the
#: product uses. Adding an icon is one line; an unused line is a removal.
ICONS: Final[dict[str, str]] = {
    "app-window": "",
    "archive-tray": "",
    "arrow-down": "",
    "arrow-right": "",
    "arrow-up": "",
    "arrows-out-simple": "",
    "books": "",
    "chat-teardrop-text": "",
    "check": "",
    "circle": "",
    "circle-notch": "",
    "clock-counter-clockwise": "",
    "cpu": "",
    "diamonds-four": "",
    "dot-outline": "",
    "flask": "",
    "folder-simple": "",
    "gauge": "",
    "gear": "",
    "git-branch": "",
    "git-fork": "",
    "github-logo": "",
    "info": "",
    "lightning": "",
    "list-checks": "",
    "magnifying-glass": "",
    "note-pencil": "",
    "paper-plane-right": "",
    "pause": "",
    "play": "",
    "plus": "",
    "record": "",
    "shield-check": "",
    "stop": "",
    "terminal-window": "",
    "tree-structure": "",
    "user-gear": "",
    "warning": "",
    "x-circle": "",
}


@traces(SWR.SWR_3708)
def char(name: str) -> str:
    """The glyph for *name*, raising on a name the vocabulary does not carry.

    Raising is the feature: a typo that rendered an empty box would survive
    review on any screen the reviewer did not open.
    """
    return ICONS[name]


@traces(SWR.SWR_3708)
def icon_font(size: float, *, fill: bool = False) -> QFont:
    """A `QFont` for drawing Phosphor glyphs at *size* logical pixels.

    Registration is re-asserted here because this module can be reached before
    the window that normally triggers it — a unit test, a dialog constructed
    early — and :func:`register_bundled_fonts` is idempotent and cached.
    """
    register_bundled_fonts()
    font = QFont(FILL_FAMILY if fill else FAMILY)
    font.setPixelSize(max(1, round(size)))
    return font


@traces(SWR.SWR_3708)
def pixmap(name: str, color: Color | str, size: int = 16, *, fill: bool = False) -> QPixmap:
    """Rasterise *name* in *color* at the primary screen's device pixel ratio.

    Unlike the text-glyph rasteriser in :mod:`rotaris.widgets.icons`, the ink
    is *not* rescaled to fill the box: Phosphor draws all its icons on one em
    square, so per-glyph rescaling would inflate a sparse icon relative to its
    neighbours — the inconsistency that rescaling exists to fix for fallback
    characters is the consistency it would destroy for a real icon font.
    """
    glyph = char(name)
    screen = QApplication.primaryScreen()
    dpr = screen.devicePixelRatio() if screen else 1.0
    phys = max(1, round(size * dpr))
    result = QPixmap(phys, phys)
    result.setDevicePixelRatio(dpr)
    result.fill(Qt.GlobalColor.transparent)

    painter = QPainter(result)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setPen(color.qcolor if hasattr(color, "qcolor") else color)
    side = phys / dpr
    painter.setFont(icon_font(side, fill=fill))
    painter.drawText(QRectF(0, 0, side, side), Qt.AlignmentFlag.AlignCenter, glyph)
    painter.end()
    return result


@traces(SWR.SWR_3708)
def icon(name: str, color: Color | str, size: int = 16, *, fill: bool = False) -> QIcon:
    """:func:`pixmap`, wrapped as the `QIcon` most Qt APIs take."""
    result = QIcon()
    result.addPixmap(pixmap(name, color, size, fill=fill))
    return result


@traces(SWR.SWR_3708)
def markup(name: str, color: Color | str, *, fill: bool = False) -> str:
    """*name* as a rich-text span, for labels that mix an icon into a sentence.

    The colour is baked into the markup, so the label that embeds this has to
    rebuild its text in ``apply_theme`` — the same rule `_StatusLink` already
    lives by for the same reason.
    """
    family = FILL_FAMILY if fill else FAMILY
    register_bundled_fonts()
    return f"<span style=\"font-family:'{family}';color:{color};\">{char(name)}</span>"


# ── theme-following button icons ──────────────────────────────────────────
#
# A rasterised icon holds its ink. Buttons are styled by the application
# stylesheet and carry no apply_theme of their own, so the icons placed on
# them are re-rasterised here, from one subscription, when the theme changes.

_button_icons: weakref.WeakKeyDictionary[QAbstractButton, tuple[str, bool]] = (
    weakref.WeakKeyDictionary()
)
_retint_connected: bool = False


def _variant_ink(variant: str) -> Color:
    """The ink the stylesheet gives this button variant's text, from the active theme.

    Kept in lockstep with ``QPushButton[variant=…]`` in :mod:`rotaris.theme.qss`
    — the icon must read as part of the label, not as a decoration in its own
    colour.
    """
    color = tokens().color
    match variant:
        case "primary":
            return color.accent[100]
        case "ghost" | "link":
            return color.accent[300]
        case "danger":
            return color.danger[300]
        case "warning":
            return color.axis_x[300]
        case _:
            return color.text


def _retint_button(button: QAbstractButton, name: str, fill: bool) -> None:
    theme = theme_manager().current
    size = theme.type.scale.sm + 2
    variant = button.property("variant") or "secondary"
    button.setIcon(icon(name, _variant_ink(str(variant)), size, fill=fill))
    button.setIconSize(QSize(size, size))


def _retint_all(_name: str) -> None:
    for button, (name, fill) in list(_button_icons.items()):
        # A button can be gone on the C++ side while its Python wrapper — and
        # thus its registry entry — is still awaiting collection. Touching one
        # is a crash, not an exception, so the check comes first (the same
        # rule ThemeManager.apply lives by), and the dead entry is dropped so
        # the next switch does not walk it again.
        if not isValid(button):
            _button_icons.pop(button, None)
            continue
        _retint_button(button, name, fill)


@traces(SWR.SWR_3708)
def set_button_icon(button: QAbstractButton, name: str, *, fill: bool = False) -> None:
    """Put *name* on *button* and keep its ink true to the active theme.

    The ink follows the button's ``variant`` property, resolved when painted —
    including again on every theme change, for as long as the button lives.
    Registration is weak: a closed dialog's buttons drop out on their own.
    """
    global _retint_connected  # noqa: PLW0603
    _button_icons[button] = (name, fill)
    if not _retint_connected:
        theme_manager().theme_changed.connect(_retint_all)
        _retint_connected = True
    _retint_button(button, name, fill)
