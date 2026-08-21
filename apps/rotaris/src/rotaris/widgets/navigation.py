"""Moving between Rotaris' screens: the tab strip and the navigation rail.

Both belong to the design system's Navigation group, and both are built the same
way — a container that lays out keyed buttons, and a button that paints itself —
for one reason. The mark that says *this one is current* has to sit on top of its
container's own boundary: a tab's underline covers the strip's hairline, and a
rail item's rule runs down the inside of its wash. QSS draws a border on the edge
of a box and nowhere else, so neither mark survives being written as a stylesheet
rule on a child widget.

Painting also answers the rail's second problem. Its glyph is rasterized through
:func:`~rotaris.widgets.icons.glyph_icon` so it lands on the pixel grid at
whatever ratio the screen reports (SWR-2092), and a rasterized glyph carries its
colour with it — a stylesheet cannot recolour a pixmap on hover, so the component
has to.

Keyboard behaviour differs between the two on purpose. Arrows in the strip move
focus *and* select, because a tab swaps a pane that already exists. Arrows in the
rail move focus only and leave activation to Space or Enter, because a rail item
opens a whole view, and opening six of them on the way past is not what the user
asked for.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from PySide6.QtCore import QRect, QRectF, QSize, Qt, Signal
from PySide6.QtGui import QFont, QFontMetrics, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (
    QAbstractButton,
    QHBoxLayout,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.icons import glyph_icon

if TYPE_CHECKING:
    from PySide6.QtGui import QIcon, QKeyEvent, QPaintEvent

    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

__all__ = ["NavButton", "NavItem", "NavRail", "Tabs"]


def _stepped(index: int, count: int, key: int, *, back: Qt.Key, forward: Qt.Key) -> int | None:
    """Where a navigation key lands, or `None` if the key is not one of ours.

    Clamped rather than wrapped. Both of these strips are short enough to see
    whole, so running off the end and reappearing at the other one reads as a
    glitch rather than as a convenience.
    """
    if key == back:
        return max(index - 1, 0)
    if key == forward:
        return min(index + 1, count - 1)
    if key == Qt.Key.Key_Home:
        return 0
    if key == Qt.Key.Key_End:
        return count - 1
    return None


@traces(SWR.SWR_3702)
class NavButton(Themed, QAbstractButton):
    """A self-painting button that carries the key it selects.

    The base of both navigation controls. It owns the parts they share: the key,
    hover tracking, a focus ring the application stylesheet cannot draw for a
    widget that paints itself, and the accessible description that states the
    selected state in words.
    """

    #: How this control shows it is selected other than by colour. Rotaris'
    #: contract is that state is never colour alone, and a screen reader has to
    #: be told the same thing the eye is being shown.
    selected_mark: ClassVar[str] = "marked"

    def __init__(self, key: str, label: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.key = key
        self.setText(label)
        self.setCheckable(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setAccessibleName(label)
        # Hover changes the colour of both controls, and a widget gets no hover
        # events at all without this.
        self.setAttribute(Qt.WidgetAttribute.WA_Hover, True)
        self._font = QFont()

    def set_selected(self, selected: bool) -> None:
        """Mark this control selected, and say so where the mark cannot."""
        self.setChecked(selected)
        self.setAccessibleDescription(
            f"Selected, {self.selected_mark}." if selected else "Not selected."
        )
        self.update()

    def _paint_focus_ring(self, painter: QPainter, theme: Theme, radius: int) -> None:
        """The focus indicator, drawn inside the control's own edge.

        Inside rather than around it: a ring painted on the boundary would be
        clipped to half its width by the widget's rect, and a focus ring a user
        can only half see is the one case where "visible indicator" fails
        quietly.
        """
        if not self.hasFocus():
            return
        width = theme.size.focus_ring
        painter.setPen(QPen(theme.color.focus.qcolor, width))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        inset = width / 2
        painter.drawRoundedRect(
            QRectF(self.rect()).adjusted(inset, inset, -inset, -inset), radius, radius
        )


class _Tab(NavButton):
    """One entry in a :class:`Tabs` strip."""

    selected_mark = "underlined"

    def __init__(self, key: str, label: str, parent: QWidget | None = None) -> None:
        super().__init__(key, label, parent)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Preferred)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self._font = theme.type.body_font(theme.type.scale.sm, weight=theme.type.weight_strong)
        # The strip's height follows the type, so a theme with a larger body
        # face has to be allowed to re-ask for room.
        self.updateGeometry()
        self.update()

    def sizeHint(self) -> QSize:  # noqa: N802
        space = tokens().space
        metrics = QFontMetrics(self._font)
        return QSize(
            metrics.horizontalAdvance(self.text()) + 2 * space.xs,
            metrics.height() + 2 * space.sm,
        )

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setFont(self._font)
        active = self.isChecked()
        if active:
            colour = t.color.accent[200]
        elif self.underMouse():
            colour = t.color.text_secondary
        else:
            colour = t.color.text_tertiary
        painter.setPen(colour.qcolor)
        painter.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, self.text())
        if active:
            # Twice a hairline, so the underline reads as a deliberate mark
            # rather than as the strip's own boundary — and so it covers that
            # boundary exactly, whatever weight a theme gives it.
            rule = t.size.hairline * 2
            painter.fillRect(
                QRect(0, self.height() - rule, self.width(), rule), t.color.accent[500].qcolor
            )
        self._paint_focus_ring(painter, t, t.radius.sm)


@traces(SWR.SWR_3702)
class Tabs(Themed, QWidget):
    """The design system's `.tabs`: a light strip of keyed tabs.

    Not a `QTabBar`. A `QTabBar` owns its pages by index and hands back an int,
    while every caller in Rotaris thinks in stable string keys it can persist and
    restore — and the strip carries no pages of its own, only the choice.
    """

    #: The key of the tab the user chose. Programmatic changes stay silent, so a
    #: view can restore a selection without re-entering its own handler.
    tab_selected = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._tabs: dict[str, _Tab] = {}
        self._active = ""
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Fixed)
        self._row = QHBoxLayout(self)
        self._row.setContentsMargins(0, 0, 0, 0)
        self._row.addStretch(1)
        self.install_theme_hook()

    def add_tab(self, key: str, label: str) -> None:
        """Append a tab. The first one added becomes the active tab."""
        tab = _Tab(key, label, self)
        tab.set_selected(False)
        tab.clicked.connect(lambda _checked=False, chosen=key: self._choose(chosen))
        self._row.insertWidget(len(self._tabs), tab)
        self._tabs[key] = tab
        if not self._active:
            # A strip with nothing active is a state the design system has no
            # drawing for, and a view that adds tabs means the first one.
            self.set_active(key)

    def set_active(self, key: str) -> None:
        """Mark *key* active without emitting.

        An unknown key leaves the strip alone. The key can arrive from a
        settings file written by an older Rotaris, and dropping the user's
        current tab over a stale string is the worse of the two failures.
        """
        if key not in self._tabs:
            return
        self._active = key
        for tab_key, tab in self._tabs.items():
            tab.set_selected(tab_key == key)

    def active(self) -> str:
        """The active key, or `""` while the strip is still empty."""
        return self._active

    def apply_theme(self, theme: Theme) -> None:
        self._row.setSpacing(theme.space.sm)
        self.update()

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802
        """Left/Right/Home/End walk the strip, selecting as they go."""
        keys = list(self._tabs)
        target = (
            _stepped(
                self._focused_index(),
                len(keys),
                event.key(),
                back=Qt.Key.Key_Left,
                forward=Qt.Key.Key_Right,
            )
            if keys
            else None
        )
        if target is None:
            super().keyPressEvent(event)
            return
        self._tabs[keys[target]].setFocus(Qt.FocusReason.TabFocusReason)
        self._choose(keys[target])
        event.accept()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802
        """The strip's boundary. The active tab paints its underline over it."""
        t = tokens()
        painter = QPainter(self)
        hairline = t.size.hairline
        painter.fillRect(
            QRect(0, self.height() - hairline, self.width(), hairline), t.color.border.qcolor
        )

    def _choose(self, key: str) -> None:
        self.set_active(key)
        self.tab_selected.emit(key)

    def _focused_index(self) -> int:
        keys = list(self._tabs)
        for index, key in enumerate(keys):
            if self._tabs[key].hasFocus():
                return index
        return keys.index(self._active) if self._active in self._tabs else 0


@traces(SWR.SWR_3702)
class NavItem(NavButton):
    """One rail destination: a glyph over a small uppercase label.

    A real focusable control rather than a hover-only affordance, because the
    rail is how a keyboard user reaches every screen in Rotaris.
    """

    selected_mark = "marked with a rule down its left edge"

    def __init__(self, key: str, glyph: str, label: str, parent: QWidget | None = None) -> None:
        super().__init__(key, label, parent)
        self._glyph = glyph
        # Keyed by the colour the glyph was rasterized in: an item has three
        # states and only ever paints in two colours, so this settles at two
        # pixmaps rather than one per paint.
        self._icons: dict[str, QIcon] = {}
        # The label is small and can be elided; the full name stays reachable.
        self.setToolTip(label)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self._icons.clear()
        self._font = theme.type.body_font(theme.type.scale.x2s, weight=theme.type.weight_strong)
        self._font.setLetterSpacing(
            QFont.SpacingType.PercentageSpacing, 100 + theme.type.tracking_wide
        )
        self.setFixedSize(self.sizeHint())
        self.update()

    def sizeHint(self) -> QSize:  # noqa: N802
        t = tokens()
        metrics = QFontMetrics(self._font)
        height = 2 * t.space.sm + _glyph_size(t) + t.space.xs + metrics.height()
        return QSize(t.size.nav_item_width, height)

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802
        t = tokens()
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        active = self.isChecked()
        if active:
            self._paint_active_ground(painter, t)
        colour = t.color.accent[300] if active or self.underMouse() else t.color.text_tertiary

        glyph_px = _glyph_size(t)
        glyph_rect = QRect((self.width() - glyph_px) // 2, t.space.sm, glyph_px, glyph_px)
        self._icon(colour, glyph_px).paint(painter, glyph_rect, Qt.AlignmentFlag.AlignCenter)

        metrics = QFontMetrics(self._font)
        label_rect = QRect(
            0, glyph_rect.bottom() + t.space.xs, self.width(), metrics.height() + t.space.sm
        )
        painter.setFont(self._font)
        painter.setPen(colour.qcolor)
        painter.drawText(
            label_rect,
            Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignTop,
            metrics.elidedText(
                self.text().upper(), Qt.TextElideMode.ElideRight, self.width() - 2 * t.space.xs
            ),
        )
        self._paint_focus_ring(painter, t, t.radius.sm)

    def _paint_active_ground(self, painter: QPainter, theme: Theme) -> None:
        """The wash, and the left rule clipped to its rounded corners.

        Clipped because the rule is the non-colour cue for "current view": drawn
        square against a rounded wash it would overhang the corners, which reads
        as a rendering fault exactly where the eye is being asked to look.
        """
        shape = QPainterPath()
        shape.addRoundedRect(QRectF(self.rect()), theme.radius.sm, theme.radius.sm)
        painter.fillPath(shape, theme.color.accent_tint.qcolor)
        painter.save()
        painter.setClipPath(shape)
        rule = theme.size.hairline * 2
        painter.fillRect(QRect(0, 0, rule, self.height()), theme.color.accent[500].qcolor)
        painter.restore()

    def _icon(self, colour: Color, size: int) -> QIcon:
        cached = self._icons.get(colour)
        if cached is None:
            cached = glyph_icon(self._glyph, colour, size)
            self._icons[colour] = cached
        return cached


@traces(SWR.SWR_3702)
class NavRail(Themed, QWidget):
    """The design system's `.nav-rail`: the column of primary destinations."""

    #: The key of the destination the user chose.
    item_selected = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._items: dict[str, NavItem] = {}
        self._active = ""
        # The rail paints its own ground below, but the name still matters: it is
        # what tells the accessibility resolver — and anything dropped into the
        # rail later — which ground its text is sitting on.
        self.setObjectName("chrome")
        self._column = QVBoxLayout(self)
        self._column.setContentsMargins(0, 0, 0, 0)
        self._column.addStretch(1)
        self.install_theme_hook()

    def add_item(self, key: str, glyph: str, label: str) -> None:
        """Append a destination. The first one added becomes the active one."""
        item = NavItem(key, glyph, label, self)
        item.set_selected(False)
        item.clicked.connect(lambda _checked=False, chosen=key: self._choose(chosen))
        self._column.insertWidget(len(self._items), item, 0, Qt.AlignmentFlag.AlignHCenter)
        self._items[key] = item
        if not self._active:
            self.set_active(key)

    def set_active(self, key: str) -> None:
        """Mark *key* active without emitting; an unknown key is left alone."""
        if key not in self._items:
            return
        self._active = key
        for item_key, item in self._items.items():
            item.set_selected(item_key == key)

    def active(self) -> str:
        """The active key, or `""` while the rail is still empty."""
        return self._active

    def apply_theme(self, theme: Theme) -> None:
        self.setFixedWidth(theme.size.nav_rail_width)
        self._column.setContentsMargins(0, theme.space.md, 0, theme.space.md)
        self._column.setSpacing(theme.space.xs)
        self.update()

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802
        """Up/Down/Home/End move focus; Space or Enter opens what it lands on.

        Focus only. Selecting on the way past would open — and start rendering —
        every view between here and the one the user is heading for.
        """
        keys = list(self._items)
        target = (
            _stepped(
                self._focused_index(),
                len(keys),
                event.key(),
                back=Qt.Key.Key_Up,
                forward=Qt.Key.Key_Down,
            )
            if keys
            else None
        )
        if target is None:
            super().keyPressEvent(event)
            return
        self._items[keys[target]].setFocus(Qt.FocusReason.TabFocusReason)
        event.accept()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802
        """The rail's ground and the boundary it draws against the content.

        Painted rather than left to the stylesheet because a widget that
        overrides `paintEvent` never receives the stylesheet's background, and
        because the boundary is on one edge only — which is a border QSS would
        happily declare and Qt would then draw on all four.
        """
        t = tokens()
        painter = QPainter(self)
        painter.fillRect(self.rect(), t.color.chrome.qcolor)
        hairline = t.size.hairline
        painter.fillRect(
            QRect(self.width() - hairline, 0, hairline, self.height()), t.color.border.qcolor
        )

    def _choose(self, key: str) -> None:
        self.set_active(key)
        self.item_selected.emit(key)

    def _focused_index(self) -> int:
        keys = list(self._items)
        for index, key in enumerate(keys):
            if self._items[key].hasFocus():
                return index
        return keys.index(self._active) if self._active in self._items else 0


def _glyph_size(theme: Theme) -> int:
    """How large a rail glyph is drawn.

    A type step rather than a size token because the glyph *is* text — a
    character rasterized into a pixmap — so it should grow with the theme's type
    and not with its controls.
    """
    return theme.type.scale.h4
