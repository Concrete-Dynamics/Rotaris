"""Find and drive Rotaris controls the way a user reaches them.

A test that reaches into ``view.send_button`` keeps passing after the button is
hidden behind a closed drawer, disabled, or unhooked from its slot: the
attribute still exists. These helpers look a control up by its *accessible
name* — the string a screen reader announces — and refuse to drive one the user
could not have used, so an unwired ``clicked.connect`` or a control stranded in
a collapsed pane fails the test instead of passing it.

Name resolution follows the platform accessibility rule: an explicit
``setAccessibleName`` wins, otherwise a control is known by its visible text.
That makes the accessible names Rotaris already sets for screen readers double
as the test selectors, so the two cannot drift apart unnoticed.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

from PySide6.QtCore import QCoreApplication, QEvent, QPoint, QPointF, Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QRadioButton,
    QStyle,
    QStyleOptionButton,
    QWidget,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from pytestqt.qtbot import QtBot

    from rotaris.views.transcript import TranscriptListView

__all__ = [
    "accessible_name",
    "accessible_names",
    "click",
    "click_by_name",
    "find_all_by_accessible_name",
    "find_by_accessible_name",
    "pump_until",
    "settle",
    "wait_until",
    "transcript_anchor_point",
    "type_text",
]


def transcript_anchor_point(view: TranscriptListView, row: int, prefix: str) -> QPoint:
    """Viewport point of the first link in *row* whose href starts with *prefix*.

    Transcript rows are painted rich text, not widgets, so a link has no
    accessible name to reach it by. Hit-testing the very document the delegate
    paints is the nearest equivalent: the click lands where the link actually
    is, whatever the platform's font metrics did to the layout.
    """
    from rotaris.views.transcript import _BODY_X, _ROW_MARGIN_X, _ROW_MARGIN_Y, EVENT_ROLE

    index = view.model().index(row, 0)
    body_rect = view.visualRect(index).adjusted(
        _BODY_X, _ROW_MARGIN_Y, -_ROW_MARGIN_X, -_ROW_MARGIN_Y
    )
    document = view.transcript_delegate._document(
        row, index.data(EVENT_ROLE), max(80, body_rect.width())
    )
    layout = document.documentLayout()
    for y in range(0, body_rect.height(), 2):
        for x in range(0, body_rect.width(), 2):
            if layout.anchorAt(QPointF(x, y)).startswith(prefix):
                return body_rect.topLeft() + QPoint(x, y)
    raise AssertionError(f"transcript row {row} rendered no {prefix} link")


def pump_until(predicate: Callable[[], bool], *, timeout: float = 10.0) -> bool:
    """Drive Qt until *predicate* holds, without nesting an event loop.

    `qtbot.waitUntil` runs a nested ``QEventLoop.exec()``. Re-entering the loop
    while this suite's worker threads are alive is the precondition for a class
    of crash it has produced repeatedly: Python's cyclic collector runs at
    whatever moment an allocation threshold trips, and when that lands inside
    the nested loop it destroys Qt objects while a thread is still using them.
    The faulthandler stack reads `Garbage-collecting` directly above
    `qtbot.waitUntil`, and names whichever test the scheduler happened to be
    running -- never the one at fault.

    The application never re-enters its loop that way: it runs its *main* loop
    for the life of the process. Pumping the queue keeps Qt delivering, which is
    the behaviour these tests are about, without the re-entry. Polling on
    `time.monotonic` rather than on a Qt timer also means a saturated queue
    cannot starve the check -- which is separately how a five-second sampling
    window went unobserved for ten seconds in `test_diagnostics`.

    Returns whether the predicate held before *timeout*, so a caller can raise
    an error that says what it was waiting for.
    """
    deadline = time.monotonic() + timeout
    while True:
        if predicate():
            return True
        if time.monotonic() > deadline:
            return False
        QCoreApplication.processEvents()
        QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
        time.sleep(0.005)


def wait_until(predicate: Callable[[], bool], *, timeout: float = 10.0, what: str = "") -> None:
    """`qtbot.waitUntil` without the nested event loop; raises the same way.

    A drop-in for call sites that want the raising contract rather than
    `pump_until`'s boolean. *timeout* is seconds, not milliseconds, because that
    is what everything else in this file speaks and a silently-1000x-wrong
    deadline is not a mistake worth leaving available.

    Why this exists at all is in `pump_until`: `qtbot.waitUntil` re-enters the Qt
    event loop, and doing that while this suite's worker threads are alive lets
    Python's cyclic collector free Qt objects those threads are still using.
    Measured on the full suite under a loaded collector: three crashed workers in
    ten runs before removing one file's nested waits, none in ten after.
    """
    if not pump_until(predicate, timeout=timeout):
        raise AssertionError(f"timed out after {timeout}s waiting for {what or 'the condition'}")


def settle(qtbot: QtBot) -> None:
    """Let deferred work finish so a query sees what the user would see.

    Rebuilt panes drop their old rows with ``deleteLater``, which keeps those
    widgets alive and visible until the event loop drains. A test that queries
    without draining first finds several generations of the same control.

    Drained by draining, not by waiting a millisecond and hoping: how much of a
    queue a millisecond clears depends on how busy the machine is, which is how
    a UI test starts failing only under load. Deferred deletes are delivered
    explicitly, then the queue is pumped again for whatever those deletes
    posted in turn.
    """
    del qtbot  # kept in the signature: every call site reads as "settle the UI"
    from PySide6.QtCore import QCoreApplication, QEvent

    QCoreApplication.processEvents()
    QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
    QCoreApplication.processEvents()


def _strip_mnemonics(text: str) -> str:
    """``&Save`` is announced as ``Save``; a literal ampersand is written ``&&``."""
    return text.replace("&&", "\x00").replace("&", "").replace("\x00", "&")


def accessible_name(widget: QWidget) -> str:
    """The name this control is announced by: explicit name, else visible text."""
    explicit = widget.accessibleName()
    if explicit:
        return explicit
    text = getattr(widget, "text", None)
    if callable(text):
        value = text()
        if isinstance(value, str):
            return _strip_mnemonics(value).strip()
    return ""


def accessible_names(
    root: QWidget,
    kind: type[QWidget] = QWidget,
    *,
    visible_only: bool = False,
) -> list[str]:
    """Every name reachable under ``root`` — the vocabulary a lookup can match."""
    found = {
        name
        for widget in _candidates(root, kind, visible_only=visible_only)
        if (name := accessible_name(widget))
    }
    return sorted(found)


def _candidates[W: QWidget](root: QWidget, kind: type[W], *, visible_only: bool) -> list[W]:
    widgets: list[W] = []
    if isinstance(root, kind):
        widgets.append(root)
    widgets.extend(root.findChildren(kind))
    if visible_only:
        widgets = [widget for widget in widgets if widget.isVisible()]
    return widgets


def find_all_by_accessible_name[W: QWidget](
    root: QWidget,
    name: str,
    kind: type[W] = QWidget,
    *,
    visible_only: bool = False,
) -> list[W]:
    """Every ``kind`` under ``root`` announced as ``name``."""
    return [
        widget
        for widget in _candidates(root, kind, visible_only=visible_only)
        if accessible_name(widget) == name
    ]


def find_by_accessible_name[W: QWidget](
    root: QWidget,
    name: str,
    kind: type[W] = QWidget,
    *,
    visible_only: bool = False,
) -> W:
    """The one ``kind`` under ``root`` announced as ``name``.

    Fails with the available vocabulary when nothing matches, so a renamed or
    unnamed control reports what the user *can* reach instead of ``None``.
    """
    matches = find_all_by_accessible_name(root, name, kind, visible_only=visible_only)
    if len(matches) == 1:
        return matches[0]
    scope = "visible " if visible_only else ""
    if not matches:
        available = accessible_names(root, kind, visible_only=visible_only)
        raise AssertionError(
            f"no {scope}{kind.__name__} named {name!r} under "
            f"{type(root).__name__}; available names: {available}"
        )
    raise AssertionError(
        f"{len(matches)} {scope}{kind.__name__} widgets named {name!r} under "
        f"{type(root).__name__}; disambiguate with a narrower root or kind"
    )


def _clickable_point(widget: QWidget) -> QPoint:
    """Where on ``widget`` a click actually registers.

    A check box or radio button only reacts inside its indicator-plus-label
    rect, not across the whole widget: stretched by a layout, its centre lands
    in the empty space to the right of the label, where a real user's click does
    nothing either.  Every other control takes its centre.
    """
    if isinstance(widget, QCheckBox | QRadioButton):
        option = QStyleOptionButton()
        option.initFrom(widget)
        option.text = widget.text()
        option.icon = widget.icon()
        element = (
            QStyle.SubElement.SE_CheckBoxClickRect
            if isinstance(widget, QCheckBox)
            else QStyle.SubElement.SE_RadioButtonClickRect
        )
        area = widget.style().subElementRect(element, option, widget)
        if not area.isEmpty():
            return area.center()
    return widget.rect().center()


def click(qtbot: QtBot, widget: QWidget) -> None:
    """Left-click ``widget`` after checking the user could actually click it."""
    name = accessible_name(widget) or type(widget).__name__
    assert widget.isVisible(), f"{name!r} is not visible, so a user cannot click it"
    assert widget.isEnabled(), f"{name!r} is disabled, so a user cannot click it"
    qtbot.mouseClick(widget, Qt.MouseButton.LeftButton, pos=_clickable_point(widget))


def click_by_name(
    qtbot: QtBot,
    root: QWidget,
    name: str,
    kind: type[QWidget] = QWidget,
) -> None:
    """Find a visible control by accessible name and click it."""
    click(qtbot, find_by_accessible_name(root, name, kind, visible_only=True))


def type_text(qtbot: QtBot, widget: QWidget, text: str) -> None:
    """Type into ``widget`` through the focus and key path a keyboard uses."""
    assert widget.isVisible(), "cannot type into a widget the user cannot see"
    assert widget.isEnabled(), "cannot type into a disabled widget"
    widget.setFocus()
    qtbot.keyClicks(widget, text)
