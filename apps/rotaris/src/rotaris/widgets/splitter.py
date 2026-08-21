"""Draggable dividers between Rotaris' content panes.

A `QSplitter` on its own gives the mouse a divider and gives the keyboard
nothing, which is exactly the "hover-only action" `apps/rotaris/AGENTS.md`
rules out. `PanelSplitter` adds the two things that make a divider a real
control: a handle that takes focus, announces itself, and moves under the arrow
keys; and a stable key under which the sizes a user chooses are remembered
globally (SWR-3011).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QKeyEvent, QPainter, QPaintEvent, QResizeEvent, QShowEvent
from PySide6.QtWidgets import QSplitter, QSplitterHandle, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris.services.panel_layout import PanelLayoutService, panel_layout_service
from rotaris.theme import tokens

if TYPE_CHECKING:
    from collections.abc import Sequence

__all__ = ["KEYBOARD_STEP_PX", "PanelSplitter", "PanelSplitterHandle"]

#: How far one arrow key press moves a divider. Large enough to be worth a press,
#: small enough to land on a chosen width in a few of them.
KEYBOARD_STEP_PX = 16

#: Grab area. The handle paints a hairline inside it; the rest is slack for the
#: pointer, because a 1 px target is a divider only in theory.
HANDLE_PX = 6

#: A resize is one gesture, not the hundred `splitterMoved` signals a drag emits.
_SAVE_DEBOUNCE_MS = 250


@traces(SWR.SWR_3011)
class PanelSplitterHandle(QSplitterHandle):
    """A divider a keyboard user can reach, name, see, and move."""

    def __init__(self, orientation: Qt.Orientation, parent: PanelSplitter) -> None:
        super().__init__(orientation, parent)
        self.setFocusPolicy(Qt.FocusPolicy.TabFocus)
        # Hover has to repaint, and a handle gets no hover events without this.
        self.setAttribute(Qt.WidgetAttribute.WA_Hover, True)

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802
        splitter = self.splitter()
        if not isinstance(splitter, PanelSplitter):
            super().keyPressEvent(event)
            return
        index = splitter.indexOf(self)
        horizontal = self.orientation() == Qt.Orientation.Horizontal
        back = Qt.Key.Key_Left if horizontal else Qt.Key.Key_Up
        forward = Qt.Key.Key_Right if horizontal else Qt.Key.Key_Down
        key = event.key()
        if key == back:
            splitter.nudge(index, -KEYBOARD_STEP_PX)
        elif key == forward:
            splitter.nudge(index, KEYBOARD_STEP_PX)
        elif key == Qt.Key.Key_Home:
            splitter.apply_defaults()
            splitter.remember()
        else:
            super().keyPressEvent(event)
            return
        event.accept()

    def paintEvent(self, event: QPaintEvent) -> None:  # noqa: N802
        """Draw a hairline the user can see inside a band they can hit.

        Painted rather than styled because the two jobs want different widths.
        The line has to clear 3:1 against the panels it divides — it is an
        interactive boundary, not decoration — while the band around it only
        has to be wide enough for a pointer, and at ``border_strong`` across all
        6px it would read as a rule drawn through the window. Hover and focus
        fill the whole band, so the target announces itself before it is
        dragged and after it is tabbed to.
        """
        t = tokens()
        painter = QPainter(self)
        if self.hasFocus():
            painter.fillRect(self.rect(), t.color.focus.qcolor)
            return
        if self.underMouse():
            painter.fillRect(self.rect(), t.color.border_strong.qcolor)
            return
        painter.fillRect(self.rect(), t.color.border.qcolor)
        middle = self.rect()
        if self.orientation() == Qt.Orientation.Horizontal:
            middle.setX(self.width() // 2)
            middle.setWidth(t.size.hairline)
        else:
            middle.setY(self.height() // 2)
            middle.setHeight(t.size.hairline)
        painter.fillRect(middle, t.color.border_strong.qcolor)


@traces(SWR.SWR_3011, SWR.SWR_3012)
class PanelSplitter(QSplitter):
    """A splitter that remembers the sizes the user gives it.

    ``key`` names the divider in storage and must stay stable across releases —
    it is what ties a stored size to a pane. ``defaults`` is the size of each
    pane when nothing is stored; a ``0`` entry means "take whatever is left",
    which is how the stretching pane (a transcript, an activity table) is
    declared.
    """

    def __init__(
        self,
        key: str,
        orientation: Qt.Orientation,
        *,
        defaults: Sequence[int],
        service: PanelLayoutService | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(orientation, parent)
        self.key = key
        self._defaults = tuple(defaults)
        self._service = service if service is not None else panel_layout_service()
        self.setObjectName("panelSplitter")
        self.setHandleWidth(HANDLE_PX)
        self.setOpaqueResize(True)
        # A pane dragged to zero is a pane the user cannot get back without
        # knowing the divider is still there, so collapsing is refused outright.
        self.setChildrenCollapsible(False)
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.setInterval(_SAVE_DEBOUNCE_MS)
        self._save_timer.timeout.connect(self.remember)
        self.splitterMoved.connect(lambda _pos, _index: self._save_timer.start())
        self._restored = False
        self._pending_layout = False
        #: True once sizes have been applied against a real span. Until then the
        #: panes are at whatever minimums Qt handed an unlaid-out widget, which
        #: is nobody's preference and must never be written down as one.
        self._sized = False
        self._service.register(self)

    def showEvent(self, event: QShowEvent) -> None:  # noqa: N802
        super().showEvent(event)
        # First show is the earliest moment the panes have real geometry to
        # divide, and the last one before the user sees them: restoring on a
        # deferred timer instead would let the layout visibly jump afterwards.
        if not self._restored:
            self._restored = True
            self.restore()

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802
        super().resizeEvent(event)
        # Sizing a splitter that has no width yet is sizing nothing: Qt scales
        # the request down to every pane's minimum, and growing afterwards hands
        # the difference to whichever pane stretches. Retry once there is a real
        # span to divide.
        if self._pending_layout and self._span() > 0:
            self.restore()

    # ── sizing ────────────────────────────────────────────────────────────

    @property
    def defaults(self) -> tuple[int, ...]:
        """The size of each pane before the user has an opinion."""
        return self._defaults

    def _span(self) -> int:
        """The dimension the panes divide between them."""
        return self.width() if self.orientation() == Qt.Orientation.Horizontal else self.height()

    def apply_defaults(self) -> None:
        """Put every pane back to its declared default size."""
        if self.count() != len(self._defaults):
            return
        span = self._span()
        if span <= 0:
            self._pending_layout = True
            return
        self._pending_layout = False
        self._sized = True
        fixed = sum(size for size in self._defaults if size > 0)
        stretchers = [index for index, size in enumerate(self._defaults) if size <= 0]
        sizes = list(self._defaults)
        if stretchers:
            # The declared sizes are for the fixed panes; whatever the window has
            # left over goes to the ones that grow, shared in proportion to their
            # stretch factors so a 1:2 layout starts out 1:2.
            remainder = max(span - fixed - self.handleWidth() * (self.count() - 1), 0)
            weights = [max(self._stretch_of(index), 1) for index in stretchers]
            total = sum(weights)
            for index, weight in zip(stretchers, weights, strict=True):
                sizes[index] = remainder * weight // total
        self.setSizes(sizes)

    def _stretch_of(self, index: int) -> int:
        # `setStretchFactor` writes through to the child's size policy, which is
        # the only place Qt lets the factor be read back from.
        widget = self.widget(index)
        if widget is None:
            return 1
        policy = widget.sizePolicy()
        return (
            policy.horizontalStretch()
            if self.orientation() == Qt.Orientation.Horizontal
            else policy.verticalStretch()
        )

    def nudge(self, handle_index: int, delta: int) -> None:
        """Move the divider at ``handle_index`` by ``delta`` pixels."""
        if handle_index < 1 or handle_index >= self.count():
            return
        sizes = self.sizes()
        before, after = handle_index - 1, handle_index
        step = max(
            min(delta, sizes[after] - self._minimum_of(after)),
            self._minimum_of(before) - sizes[before],
        )
        if step == 0:
            return
        sizes[before] += step
        sizes[after] -= step
        self.setSizes(sizes)
        self.remember()

    def _minimum_of(self, index: int) -> int:
        widget = self.widget(index)
        if widget is None:
            return 0
        horizontal = self.orientation() == Qt.Orientation.Horizontal
        explicit = widget.minimumWidth() if horizontal else widget.minimumHeight()
        if explicit > 0:
            # Qt's own rule: an explicit minimum replaces the hint rather than
            # competing with it, which is how a pane is allowed to clip its
            # contents instead of dictating the window's width.
            return explicit
        hint = widget.minimumSizeHint()
        return max(hint.width() if horizontal else hint.height(), 0)

    # ── persistence ───────────────────────────────────────────────────────

    def restore(self) -> bool:
        """Adopt the stored sizes, falling back to the defaults."""
        if self._span() <= 0:
            self._pending_layout = True
            return False
        if self._service.restore(self.key, self):
            self._pending_layout = False
            self._sized = True
            return True
        self.apply_defaults()
        return False

    def remember(self) -> None:
        """Store the current sizes now, without waiting for the debounce.

        Silently does nothing before the panes have been laid out once: what a
        splitter reports at that point is Qt's minimums, and writing those down
        would hand the user a layout they never chose on the next launch.
        """
        if not self._sized:
            return
        self._service.save(self.key, self)

    def createHandle(self) -> QSplitterHandle:  # noqa: N802
        return PanelSplitterHandle(self.orientation(), self)

    def name_handles(self, names: Sequence[str]) -> None:
        """Announce each divider by what moving it does.

        ``names`` is one entry per divider — one fewer than the pane count.
        """
        # Handle 0 is Qt's own leading handle: zero width, dividing nothing.
        # Left focusable it would be a tab stop that goes nowhere and announces
        # nothing, which is the "hidden control in the tab sequence" the
        # accessibility rules single out.
        leading = self.handle(0)
        if leading is not None:
            leading.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        for offset, name in enumerate(names):
            handle = self.handle(offset + 1)
            if handle is None:
                continue
            handle.setAccessibleName(name)
            handle.setToolTip(f"{name} — drag, or focus and use the arrow keys")
            handle.setAccessibleDescription(
                "Drag to resize, or focus this divider and press the arrow keys. "
                "Home restores the default size. The size is remembered across restarts."
            )
