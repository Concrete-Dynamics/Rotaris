"""Productive use: someone works the terminal pop-out with a screen reader and a keyboard.
Expected outcome: every control announces itself, every label clears its WCAG AA ratio, and
the reason a control is unavailable reaches a user who never hovers anything.

The main sweep in ``test_accessibility_sweep.py`` walks the seven primary views. The
terminal is a separate window, so it needs its own pass for the same reasons — the same
shape ``test_requirements_a11y.py`` uses for the board."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from a11y import text_contrast_violations, unnamed_controls
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import QDialog, QLabel, QToolButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.terminal_stream.hub import TerminalStreamControl, TerminalStreamHub
from ui_query import accessible_names, settle

from rotaris.services.terminal_stream_bridge import TerminalStreamBridge
from rotaris.views.terminal_window import TerminalWindow, stream_display_name

if TYPE_CHECKING:
    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration

SESSION = "sess-a11y"
STREAM = "fg:coder-1"
COMMAND = "pytest -q"


def _window(qtbot: QtBot, *, with_stream: bool = True) -> tuple[TerminalWindow, TerminalStreamHub]:
    hub = TerminalStreamHub(buffer_bytes=32 * 1024)
    bridge = TerminalStreamBridge()
    if with_stream:
        hub.open_stream(SESSION, STREAM, command=COMMAND)
        hub.register_control(
            SESSION,
            STREAM,
            TerminalStreamControl(send_keys=lambda _text, _enter: None, kill=lambda: None),
        )
    bridge.attach(hub, SESSION)
    window = TerminalWindow(bridge)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    if with_stream:
        hub.publish(SESSION, STREAM, "delta", "collected 3 items\r\n")
    settle(qtbot)
    return window, hub


@verifies(SWR.SWR_2032, SWR.SWR_2428)
def test_every_control_in_the_terminal_window_announces_a_name(qtbot: QtBot) -> None:
    window, _hub = _window(qtbot)

    unnamed = unnamed_controls(window)

    assert not unnamed, (
        f"the terminal window has {len(unnamed)} control(s) a screen reader announces as "
        f"nothing: {unnamed}"
    )


@verifies(SWR.SWR_2032, SWR.SWR_2428)
def test_the_empty_terminal_window_announces_and_explains_itself(qtbot: QtBot) -> None:
    window, _hub = _window(qtbot, with_stream=False)

    assert window.empty.isVisible()
    assert not unnamed_controls(window)
    assert not text_contrast_violations(window)


@verifies(SWR.SWR_2032, SWR.SWR_2428)
def test_no_text_in_the_terminal_window_falls_below_its_readable_threshold(
    qtbot: QtBot,
) -> None:
    window, hub = _window(qtbot)

    violations = list(text_contrast_violations(window))
    hub.close_stream(SESSION, STREAM, exit_code=1)
    settle(qtbot)
    violations.extend(text_contrast_violations(window))

    assert not violations, "the terminal window renders unreadable text:\n" + "\n".join(
        f"  {violation}" for violation in sorted({str(v) for v in violations})
    )


@verifies(SWR.SWR_2124, SWR.SWR_2428)
def test_an_ended_terminal_explains_its_disabled_controls_without_a_hover(
    qtbot: QtBot,
) -> None:
    """Productive use: the command ends while the window is open and the buttons go grey.
    Expected outcome: the reason is on a control that is still enabled, so it can be read."""
    window, hub = _window(qtbot)
    tab = window.tabs.currentWidget()
    assert tab is not None

    hub.close_stream(SESSION, STREAM, exit_code=1)
    settle(qtbot)

    assert tab.take_control.isEnabled() is False
    assert tab.kill_button.isEnabled() is False
    help_button = tab.controls_help
    assert isinstance(help_button, QToolButton)
    assert help_button.isVisible() and help_button.isEnabled(), (
        "a disabled Qt control may never receive a hover, so the reason needs a live control"
    )
    assert "process has ended" in help_button.accessibleDescription()


@verifies(SWR.SWR_2428)
def test_the_window_never_announces_an_internal_stream_id(qtbot: QtBot) -> None:
    """Productive use: a screen-reader user moves through the tabs.
    Expected outcome: they hear the command or the agent, never ``fg:coder-1``."""
    window, _hub = _window(qtbot)

    announced = accessible_names(window)
    tabs = [window.tabs.tabText(index) for index in range(window.tabs.count())]

    assert stream_display_name(STREAM) == "Coder 1"
    assert all(STREAM not in name for name in announced), announced
    assert all(STREAM not in label for label in tabs), tabs


@verifies(SWR.SWR_2429, SWR.SWR_2428)
def test_a_key_pressed_without_control_is_answered_rather_than_swallowed(
    qtbot: QtBot,
) -> None:
    """Productive use: someone opens the terminal and just starts typing.
    Expected outcome: they are told it is read-only and offered the way to change that."""
    window, _hub = _window(qtbot)
    tab = window.tabs.currentWidget()
    assert tab is not None

    tab.terminal.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Y, Qt.KeyboardModifier.NoModifier, "y")
    )
    settle(qtbot)

    assert tab.warning.isVisible()
    assert tab.warning.action_button.isVisible()
    tab.warning.action_button.click()
    settle(qtbot)

    assert tab.take_control.isChecked(), "the offered action must actually arm the terminal"
    assert tab.terminal.input_enabled


@verifies(SWR.SWR_2429)
def test_the_scrollback_stays_reachable_from_the_keyboard_while_armed(qtbot: QtBot) -> None:
    """Productive use: a user who has taken control wants to look back at earlier output.
    Expected outcome: the shifted paging keys scroll instead of reaching the process."""
    window, hub = _window(qtbot)
    tab = window.tabs.currentWidget()
    assert tab is not None
    for index in range(80):
        hub.publish(SESSION, STREAM, "delta", f"line {index}\r\n")
    settle(qtbot)
    tab.take_control.setChecked(True)
    settle(qtbot)

    tab.terminal.refresh()
    bar = tab.terminal.verticalScrollBar()
    assert bar.maximum() > 0, "the fixture has to produce scrollback for this to mean anything"
    bar.setValue(bar.maximum())
    tab.terminal.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_PageUp, Qt.KeyboardModifier.ShiftModifier, "")
    )

    assert bar.value() < bar.maximum(), "a user with control still needs a way back through history"


@verifies(SWR.SWR_2428)
def test_killing_a_command_asks_first_and_names_what_it_affects(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: the pointer lands on Kill during a long build.
    Expected outcome: nothing dies until the user confirms, and the dialog says what will."""
    from rotaris.widgets.feedback import ConfirmImpactDialog

    window, _hub = _window(qtbot)
    tab = window.tabs.currentWidget()
    assert tab is not None
    killed: list[str] = []
    monkeypatch.setattr(
        tab._bridge, "kill", lambda stream_id: bool(killed.append(stream_id)) or True
    )

    shown: list[ConfirmImpactDialog] = []

    def _refuse(dialog: ConfirmImpactDialog) -> int:
        shown.append(dialog)
        return int(QDialog.DialogCode.Rejected)

    monkeypatch.setattr(ConfirmImpactDialog, "exec", _refuse)
    tab.kill_button.click()

    assert killed == [], "a refused confirmation must leave the process alone"
    assert shown, "killing a running process has to ask first"
    spoken = " ".join(label.text() for label in shown[0].findChildren(QLabel))
    assert COMMAND in spoken, f"the dialog must name what it kills, got: {spoken}"

    monkeypatch.setattr(ConfirmImpactDialog, "exec", lambda _d: int(QDialog.DialogCode.Accepted))
    tab.kill_button.click()

    assert killed == [STREAM]


@verifies(SWR.SWR_2428, SWR.SWR_2030)
def test_the_palette_finds_the_terminal_by_the_words_people_use(qtbot: QtBot) -> None:
    """Productive use: a user opens the palette and types "shell" looking for the terminal.
    Expected outcome: the command is found, even though its label never says "shell"."""
    from fakes import FakeRunBridge

    from rotaris.models.store import WorkspaceStore
    from rotaris.views.main_window import MainWindow

    window = MainWindow(WorkspaceStore(), run_bridge=FakeRunBridge())
    qtbot.addWidget(window)
    command = next(spec for spec in window.commands.commands() if spec.id == "terminal.open")

    assert command.label == "Open terminal"
    assert command.shortcut == "Ctrl+Shift+T"
    for query in ("terminal", "shell", "console", "bash"):
        assert command.matches(query), f"the palette should find the terminal by {query!r}"
    assert not command.matches("worktree")


@verifies(SWR.SWR_2429, SWR.SWR_2032)
def test_an_armed_terminal_is_not_a_keyboard_trap(qtbot: QtBot) -> None:
    """Productive use: a keyboard-only user takes control, types, then wants to leave.
    Expected outcome: back-tab moves focus onward instead of disappearing into the shell."""
    sent: list[str] = []
    window, _hub = _window(qtbot)
    tab = window.tabs.currentWidget()
    assert tab is not None
    tab.terminal.control_key.connect(sent.append)
    tab.terminal.keys_entered.connect(sent.append)
    tab.take_control.setChecked(True)
    settle(qtbot)
    tab.terminal.setFocus()

    qtbot.keyClick(tab.terminal, Qt.Key.Key_Backtab, Qt.KeyboardModifier.ShiftModifier)
    settle(qtbot)

    assert sent == [], "back-tab is the way out, so it must not reach the process"
    assert not tab.terminal.hasFocus()


@verifies(SWR.SWR_2429)
def test_a_read_only_terminal_lets_tab_move_on(qtbot: QtBot) -> None:
    """Productive use: someone tabs through the window without taking control.
    Expected outcome: Tab traverses; it is not eaten by a terminal that ignores input."""
    window, _hub = _window(qtbot)
    tab = window.tabs.currentWidget()
    assert tab is not None
    tab.terminal.setFocus()
    settle(qtbot)

    qtbot.keyClick(tab.terminal, Qt.Key.Key_Tab)
    settle(qtbot)

    assert not tab.terminal.hasFocus()
