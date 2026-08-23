"""Rate-limiting and visibility-gating for panels that rebuild on a signal.

The store's change signals carry no payload: ``agents_changed`` means "something
about some agent moved", so every consumer has to assume everything moved. During
a run the volatile fields on an agent — its elapsed time, its context use, its
tool count — change continuously, so that signal fires continuously, and each
firing reaches six consumers that each tear down and rebuild a widget subtree.

Two of the three cheap answers live here. Hold a stream of changes back to one
run per interval, and do no work at all for a panel nobody is looking at. The
third — rebuilding less — belongs to the panels themselves.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

from PySide6.QtCore import QEvent, QObject, QTimer, Slot
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from PySide6.QtWidgets import QWidget

#: Long enough that a burst of store updates costs one rebuild rather than
#: twenty, short enough that a single change still reads as immediate.
PANEL_REFLOW_MS = 120


@traces(SWR.SWR_2454)
class Coalescer(QObject):
    """Run *target* at most once per interval, and always once more at the end.

    Leading edge on purpose. A single change — an agent going idle, a todo
    ticked, the user dragging the splitter one pixel — should be on screen at
    once; it is only a *stream* of them that has to be held back. A plain
    trailing timer would make every interaction feel an interval late to buy
    something only a streaming run needs.
    """

    def __init__(self, parent: QObject, interval_ms: int, target: Callable[[], None]) -> None:
        super().__init__(parent)
        self._target = target
        self._interval_ms = interval_ms
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self._on_timeout)
        self._last_run = 0.0
        self._pending = False

    @Slot()
    def request(self) -> None:
        """Ask for a run. Immediate if the rate allows, else on the trailing tick."""
        if self._timer.isActive():
            self._pending = True
            return
        waited_ms = (time.monotonic() - self._last_run) * 1000.0
        if waited_ms >= self._interval_ms:
            self._run()
            return
        self._pending = True
        self._timer.start(int(self._interval_ms - waited_ms))

    def flush(self) -> None:
        """Run now if anything is waiting — for a caller that needs it current."""
        self._timer.stop()
        if self._pending:
            self._run()

    @Slot()
    def _on_timeout(self) -> None:
        if self._pending:
            self._run()

    def _run(self) -> None:
        self._pending = False
        self._last_run = time.monotonic()
        self._target()


@traces(SWR.SWR_2454)
class HiddenPanelReflow(Coalescer):
    """A :class:`Coalescer` that does nothing while its panel is off screen.

    The dashboard, the mission view and the workspace each hold their own agent
    tree, and all three are built at startup and never destroyed — so a run's
    agent updates rebuild three trees when the user can see one. A hidden panel
    records that it is stale instead, and catches up the moment it is shown.

    The catch-up is an event filter rather than a ``showEvent`` override so that
    no panel has to remember to call it. Qt delivers ``Show`` to a widget when
    its parent becomes visible too, so a page inside a stack is covered without
    the stack knowing anything about this.
    """

    def __init__(self, widget: QWidget, interval_ms: int, target: Callable[[], None]) -> None:
        super().__init__(widget, interval_ms, target)
        self._widget = widget
        widget.installEventFilter(self)

    @Slot()
    def request(self) -> None:
        widget = self._watched()
        if widget is None or not widget.isVisible():
            # Not dropped — held. ``flush`` on the next Show is what pays it back.
            self._pending = True
            return
        super().request()

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:  # noqa: N802
        if event.type() == QEvent.Type.Show and watched is self._watched():
            self.flush()
        return False

    def _watched(self) -> QWidget | None:
        """The panel, or ``None`` once this object is no longer usable.

        A filter is installed on a widget that outlives this object's Python
        wrapper: Qt keeps calling ``eventFilter`` in the window between the
        wrapper being collected and the C++ object being destroyed, and by then
        the attributes it would read are gone. Reading through here is what makes
        that a no-op rather than an AttributeError raised inside the event loop,
        where it surfaces as an unrelated test failing.
        """
        try:
            return self._widget
        except AttributeError:
            return None
