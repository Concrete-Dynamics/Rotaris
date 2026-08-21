"""Glyphs rasterized as icons for item views.

`QStandardItem` takes a `QIcon`, not a character, so a glyph that has to sit
beside a row of text needs a pixmap. This is the item-view counterpart to the
nav rail's two-state `_glyph_icon` in :mod:`rotaris.views.chrome`; that one
bakes in the rail's Off/On accent pair, which a list row has no use for.
"""

from __future__ import annotations

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QFontMetricsF, QIcon, QPainter, QPixmap
from PySide6.QtWidgets import QApplication
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import Color, tokens

#: Font size as a fraction of the icon box. The ink is rescaled to fill the box
#: afterwards, so this only decides how much detail the rasteriser has to work
#: with, not how large the glyph ends up.
_FONT_RATIO = 0.62

#: How much of the box the glyph's ink fills. Short of 1.0 so a tall glyph keeps
#: a little air above and below the row's text.
_INK_FILL = 0.82


@traces(SWR.SWR_2814)
def glyph_icon(glyph: str, color: str, size: int = 14) -> QIcon:
    """Rasterize `glyph` in `color` at the primary screen's device pixel ratio.

    The glyph is measured and scaled to fill a constant fraction of the pixmap
    so that Windows font-fallback picking a different face for one glyph does
    not make it render visibly smaller than its neighbours.
    """
    screen = QApplication.primaryScreen()
    dpr = screen.devicePixelRatio() if screen else 1.0
    phys_size = max(1, round(size * dpr))
    pixmap = QPixmap(phys_size, phys_size)
    pixmap.setDevicePixelRatio(dpr)
    pixmap.fill(Qt.GlobalColor.transparent)

    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    # A token may be translucent, and `QColor` does not parse the `rgba(...)`
    # spelling QSS needs — it yields an invalid colour, which paints black.
    painter.setPen(color.qcolor if isinstance(color, Color) else QColor(color))
    font = tokens().type.body_font(max(1, round(size * _FONT_RATIO)))
    painter.setFont(font)

    # Everything below is in the painter's *logical* units. A pixmap carrying a
    # device pixel ratio reports `rect()` in physical pixels but is painted in
    # logical ones, so measuring the box with `rect()` would scale the glyph by
    # the ratio a second time and centre it a ratio away from the middle — on a
    # 200% display that puts the icon in the corner of its own pixmap.
    side = phys_size / dpr
    bounds = QFontMetricsF(font).tightBoundingRect(glyph)
    if bounds.isValid() and bounds.width() > 0 and bounds.height() > 0:
        scale = min(
            (side * _INK_FILL) / bounds.width(),
            (side * _INK_FILL) / bounds.height(),
        )
        centre = side / 2
        painter.translate(centre, centre)
        painter.scale(scale, scale)
        painter.translate(-centre, -centre)

    painter.drawText(QRectF(0, 0, side, side), Qt.AlignmentFlag.AlignCenter, glyph)
    painter.end()

    icon = QIcon()
    icon.addPixmap(pixmap)
    return icon
