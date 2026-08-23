"""The Rotaris mark — the design system's own logo, shipped and painted (SWR-3726).

The mark is ``assets/logo.svg``: the amber/teal coordinate circles under the
violet ring. The design skill's rule is to use it as-is and never invent a
different one, so no surface spells an ad-hoc glyph — the title bar paints
this file, the window icon is built from it, and the packaging assets are
rasterisations of the same SVG.

The asset is resolved from this module's own location rather than the working
directory, the same anchor :data:`~rotaris.theme.fonts.FONT_DIR` uses
(SWR-3703): PyInstaller lays the package out under its extraction root the way
it sits in the source tree, and the data collector walks the package, so a
``__file__``-anchored path holds for a checkout and for a frozen build.

Rendering is deliberately not load-bearing for launch, like the font loader:
a missing or damaged SVG degrades to the letter placeholder the title bar
already has, never to a crash and never to an unpainted mark.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Final

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QApplication
from rotaris_core.reqtocode import SWR, traces

__all__ = ["MARK_PATH", "mark_icon", "mark_pixmap"]

_log = logging.getLogger(__name__)

#: The one brand mark, byte-identical to the design system's ``logo.svg``.
MARK_PATH: Final[Path] = Path(__file__).resolve().parent.parent / "assets" / "logo.svg"

#: Sizes the window icon carries, in logical pixels; Qt picks the nearest and
#: scales. 16–48 serve taskbars and alt-tab strips, 256 serves high-DPI window
#: chrome on Windows and Linux.
_ICON_SIZES: Final = (16, 22, 32, 48, 64, 128, 256)

_renderer_cache: QSvgRenderer | None = None
_renderer_cache_for: Path | None = None


def _renderer() -> QSvgRenderer | None:
    """The cached SVG renderer, or None when the asset is missing or invalid.

    The cache is keyed on the path rather than a bare flag so repointing
    ``MARK_PATH`` (a test, a diagnostics run) does the work again instead of
    returning a stale renderer.
    """
    global _renderer_cache, _renderer_cache_for
    if _renderer_cache_for == MARK_PATH:
        return _renderer_cache
    _renderer_cache = None
    _renderer_cache_for = MARK_PATH
    if MARK_PATH.is_file():
        candidate = QSvgRenderer(str(MARK_PATH))
        if candidate.isValid():
            _renderer_cache = candidate
    if _renderer_cache is None:
        _log.warning("no Rotaris mark at %s; the surface falls back to its placeholder", MARK_PATH)
    return _renderer_cache


@traces(SWR.SWR_3726)
def mark_pixmap(size: int = 22) -> QPixmap:
    """Rasterise the mark at *size* logical pixels, DPR-aware like the nav rail.

    Returns a null pixmap when the asset is missing or Qt cannot render it,
    so a surface can degrade to its placeholder instead of painting blank.
    """
    renderer = _renderer()
    if renderer is None:
        return QPixmap()
    screen = QApplication.primaryScreen()
    dpr = screen.devicePixelRatio() if screen else 1.0
    phys = max(1, round(size * dpr))
    pixmap = QPixmap(phys, phys)
    pixmap.setDevicePixelRatio(dpr)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
    # The viewBox is 106×121 — taller than wide — so fitting it into the
    # square letterboxes the mark with the ring fully inside the pixmap.
    renderer.render(painter, QRectF(0, 0, phys, phys))
    painter.end()
    return pixmap


@traces(SWR.SWR_3726)
def mark_icon() -> QIcon:
    """The window icon: the mark at every size a platform asks for."""
    icon = QIcon()
    for size in _ICON_SIZES:
        icon.addPixmap(mark_pixmap(size))
    return icon
