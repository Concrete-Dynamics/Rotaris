"""Productive use: an agent runs a long command; the person watching it reads the output
as it appears, opens the terminal to answer a prompt the command is waiting on, and closes
it again without losing the live view.
Expected outcome: the flow works end to end through the window the user actually sees —
streaming preview, pop-out, take control, type, close — with only the LLM and the terminal
backend faked."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fakes import FakeRunBridge
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.terminal_stream.hub import (
    TerminalStreamControl,
    default_hub,
    reset_default_hub,
)
from run_wiring import ObserverHarness, action_event, observation_event, sdk_events
from ui_query import click_by_name, find_by_accessible_name, settle

from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.e2e

STREAM = "fg:coder-1"
COMMAND = "pytest -q"


@pytest.fixture
def clean_hub() -> Iterator[None]:
    reset_default_hub()
    yield
    reset_default_hub()


def _row_text(window: MainWindow, row: int = 0) -> str:
    view = window.workspace.transcript_scroll
    event = view.transcript_model.events[row]
    return view.transcript_delegate._document(row, event, 700).toPlainText()


def _terminal_row(window: MainWindow) -> int:
    events = window.workspace.transcript_scroll.transcript_model.events
    for index, event in enumerate(events):
        if event.kind == "tool" and event.stream_id:
            return index
    raise AssertionError(f"no terminal row in {[event.kind for event in events]}")


@verifies(SWR.SWR_2428)
def test_a_person_watches_a_command_stream_then_takes_it_over(
    qtbot: QtBot,
    tmp_path: Path,
    clean_hub: None,
) -> None:
    # ── an agent starts a shell command ──────────────────────────────────
    harness = ObserverHarness(tmp_path)
    sdk = sdk_events()
    harness.event(action_event(sdk, tool_name="terminal", command=COMMAND))
    harness.drain()
    store = harness.reload_into_store(tmp_path)
    session_id = harness.state.session_id

    bridge = FakeRunBridge()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show()
    window.show_view("workspace")
    bridge.run_started.emit(session_id)
    settle(qtbot)

    # ── the engine publishes the command's output as it runs ─────────────
    hub = default_hub()
    typed: list[tuple[str, bool]] = []
    hub.open_stream(session_id, STREAM, command=COMMAND)
    hub.register_control(
        session_id,
        STREAM,
        TerminalStreamControl(
            send_keys=lambda text, enter: typed.append((text, enter)),
            resize=lambda _c, _r: True,
        ),
    )
    hub.publish(session_id, STREAM, "delta", "collected 3 items\r\n")
    hub.publish(session_id, STREAM, "delta", "  0%\r 60%\r")
    settle(qtbot)

    # ── it is readable in the transcript, without opening anything ───────
    row = _terminal_row(window)
    preview = _row_text(window, row)
    assert "collected 3 items\n 60%" in preview, (
        "an overwritten progress line must read as one line, as it does in a terminal"
    )

    # ── the way into the terminal is a real, labelled control ────────────
    terminals = find_by_accessible_name(
        window.workspace, "Open terminal (1 running)", QPushButton, visible_only=True
    )
    assert terminals.isEnabled()
    assert "1" in terminals.text(), "the control must say how many terminals are running"
    click_by_name(qtbot, window.workspace, "Open terminal (1 running)", QPushButton)
    settle(qtbot)

    terminal_window = window.terminal_window
    assert terminal_window is not None
    tab = terminal_window.tabs.currentWidget()
    assert tab is not None
    assert COMMAND in tab.command_label.text()

    # ── typing does nothing until the user says so ───────────────────────
    tab.terminal.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Y, Qt.KeyboardModifier.NoModifier, "y")
    )
    settle(qtbot)
    assert typed == []
    assert tab.warning.isVisible(), "a key that goes nowhere must say so"
    assert "read-only" in tab.warning.title.text().casefold()

    click_by_name(qtbot, terminal_window, "Take control of this terminal", QPushButton)
    settle(qtbot)
    for key, char in ((Qt.Key.Key_Y, "y"), (Qt.Key.Key_Return, "")):
        tab.terminal.keyPressEvent(
            QKeyEvent(QKeyEvent.Type.KeyPress, key, Qt.KeyboardModifier.NoModifier, char)
        )

    assert typed == [("y", False), ("ENTER", False)]

    # ── closing the window is the way back; the preview never stopped ────
    terminal_window.close()
    settle(qtbot)
    assert window.terminal_window is None

    hub.publish(session_id, STREAM, "delta", "\r\n3 passed\r\n")
    settle(qtbot)
    assert "3 passed" in _row_text(window, row)

    harness.close()


@verifies(SWR.SWR_2428)
def test_a_command_that_ends_says_so_and_stops_taking_input(
    qtbot: QtBot,
    tmp_path: Path,
    clean_hub: None,
) -> None:
    harness = ObserverHarness(tmp_path)
    sdk = sdk_events()
    harness.event(action_event(sdk, tool_name="terminal", command=COMMAND))
    harness.drain()
    store = harness.reload_into_store(tmp_path)
    session_id = harness.state.session_id

    bridge = FakeRunBridge()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show()
    bridge.run_started.emit(session_id)
    settle(qtbot)

    hub = default_hub()
    hub.open_stream(session_id, STREAM, command=COMMAND)
    hub.register_control(session_id, STREAM, TerminalStreamControl(send_keys=lambda _t, _e: None))
    hub.publish(session_id, STREAM, "delta", "1 failed\r\n")
    settle(qtbot)
    window.open_terminal_window(STREAM)
    settle(qtbot)

    hub.close_stream(session_id, STREAM, exit_code=1)
    settle(qtbot)

    terminal_window = window.terminal_window
    assert terminal_window is not None
    tab = terminal_window.tabs.currentWidget()
    assert tab is not None
    assert "exit 1" in tab.status_label.text()
    assert tab.take_control.isEnabled() is False
    assert tab.controls_help.isVisible(), (
        "a disabled Qt control may never see a hover, so the reason needs an enabled control"
    )
    assert "process has ended" in tab.controls_help.accessibleDescription()
    assert "1 failed" in tab.terminal.terminal_screen.text()

    harness.close()


@verifies(SWR.SWR_2428)
def test_with_no_command_yet_the_window_explains_itself(
    qtbot: QtBot,
    tmp_path: Path,
    clean_hub: None,
) -> None:
    """Productive use: a new user goes looking for the terminal before running anything.
    Expected outcome: the control opens, and the window says what has to happen first."""
    del tmp_path
    from rotaris.models.store import WorkspaceStore

    window = MainWindow(WorkspaceStore(), run_bridge=FakeRunBridge())
    qtbot.addWidget(window)
    window.show()
    window.show_view("workspace")
    settle(qtbot)

    terminals = find_by_accessible_name(
        window.workspace, "Open terminal", QPushButton, visible_only=True
    )
    assert terminals.isEnabled(), "hiding the feature from someone looking for it helps nobody"

    click_by_name(qtbot, window.workspace, "Open terminal", QPushButton)
    settle(qtbot)

    terminal_window = window.terminal_window
    assert terminal_window is not None
    assert terminal_window.empty.isVisible()
    assert "runs a shell command" in terminal_window.empty.accessibleDescription()


@verifies(SWR.SWR_2428)
def test_a_finished_command_keeps_its_own_output_when_the_next_one_runs(
    qtbot: QtBot,
    tmp_path: Path,
    clean_hub: None,
) -> None:
    """Productive use: an agent runs two commands and the reader scrolls back to the first.
    Expected outcome: the first row still shows the first command's result, not the second's."""
    harness = ObserverHarness(tmp_path)
    sdk = sdk_events()
    first = action_event(sdk, call_id="call-1", tool_name="terminal", command="echo first")
    harness.event(first)
    harness.event(observation_event(sdk, first, output="first command output"))
    harness.event(action_event(sdk, call_id="call-2", tool_name="terminal", command=COMMAND))
    harness.drain()
    store = harness.reload_into_store(tmp_path)
    session_id = harness.state.session_id

    bridge = FakeRunBridge()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show()
    window.show_view("workspace")
    bridge.run_started.emit(session_id)
    settle(qtbot)

    hub = default_hub()
    hub.open_stream(session_id, STREAM, command=COMMAND)
    hub.publish(session_id, STREAM, "delta", "second command output\r\n")
    settle(qtbot)

    events = window.workspace.transcript_scroll.transcript_model.events
    rows = [index for index, event in enumerate(events) if event.kind == "tool" and event.stream_id]
    assert len(rows) >= 2, (
        "expected both terminal rows, got "
        f"{[(e.kind, e.tool, e.status, e.stream_id) for e in events]}"
    )

    finished = _row_text(window, rows[0])
    running = _row_text(window, rows[-1])
    assert "second command output" in running
    assert "second command output" not in finished, (
        "one agent reuses one terminal, so a finished row must show its own result"
    )

    harness.close()
