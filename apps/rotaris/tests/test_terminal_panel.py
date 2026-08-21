"""Productive use: a person watches a live command and then types into it.
Expected outcome: frames published by the engine reach the transcript preview and the
pop-out through one shared screen, a display attaching late replays what it missed, and
keystrokes only reach the process once the user has taken control."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import Qt
from PySide6.QtGui import QKeyEvent
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.terminal_stream.hub import TerminalStreamControl, TerminalStreamHub
from ui_query import settle

from rotaris.models.state import TranscriptEvent
from rotaris.services.terminal_stream_bridge import TerminalStreamBridge
from rotaris.views.terminal_window import TerminalWindow
from rotaris.views.transcript import TranscriptListView
from rotaris.widgets.terminal_view import TerminalView

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration

SESSION = "sess-ui"
STREAM = "fg:coder"


def _attached(
    qtbot: QtBot,
) -> tuple[TerminalStreamHub, TerminalStreamBridge, list[tuple[str, bool]]]:
    hub = TerminalStreamHub(buffer_bytes=32 * 1024)
    bridge = TerminalStreamBridge()
    typed: list[tuple[str, bool]] = []
    hub.open_stream(SESSION, STREAM, command="pytest -q")
    hub.register_control(
        SESSION,
        STREAM,
        TerminalStreamControl(
            send_keys=lambda text, enter: typed.append((text, enter)),
            resize=lambda _c, _r: True,
        ),
    )
    bridge.attach(hub, SESSION)
    return hub, bridge, typed


@verifies(SWR.SWR_3619)
def test_streamed_output_reaches_the_screen_the_views_read(qtbot: QtBot) -> None:
    hub, bridge, _typed = _attached(qtbot)

    hub.publish(SESSION, STREAM, "delta", "collected 3 items\r\n")
    settle(qtbot)

    screen = bridge.screen(STREAM)
    assert screen is not None
    assert screen.tail_text(5) == ["collected 3 items"]


@verifies(SWR.SWR_3619)
def test_a_display_attaching_late_sees_what_it_missed(qtbot: QtBot) -> None:
    hub, bridge, _typed = _attached(qtbot)
    hub.publish(SESSION, STREAM, "delta", "already printed\r\n")
    settle(qtbot)

    fresh = TerminalStreamBridge()
    fresh.attach(hub, SESSION)
    screen = fresh.screen(STREAM)

    assert screen is not None
    assert screen.tail_text(5) == ["already printed"]


@verifies(SWR.SWR_3619)
def test_output_is_never_applied_twice(qtbot: QtBot) -> None:
    hub, bridge, _typed = _attached(qtbot)

    hub.publish(SESSION, STREAM, "delta", "once\r\n")
    settle(qtbot)
    settle(qtbot)

    screen = bridge.screen(STREAM)
    assert screen is not None
    assert screen.tail_text(5) == ["once"]


@verifies(SWR.SWR_3619)
def test_a_finished_stream_stops_accepting_input(qtbot: QtBot) -> None:
    hub, bridge, _typed = _attached(qtbot)

    hub.close_stream(SESSION, STREAM, exit_code=1)
    settle(qtbot)

    screen = bridge.screen(STREAM)
    assert screen is not None and screen.running is False
    assert screen.exit_code == 1
    assert bridge.can_take_input(STREAM) is False
    assert bridge.send_keys(STREAM, "hello") is False


@verifies(SWR.SWR_2429)
def test_the_widget_encodes_keys_in_the_backends_own_vocabulary(qtbot: QtBot) -> None:
    view = TerminalView()
    qtbot.addWidget(view)
    view.set_input_enabled(True)
    seen: list[str] = []
    view.control_key.connect(seen.append)
    text: list[str] = []
    view.keys_entered.connect(text.append)

    for key, modifier, char in (
        (Qt.Key.Key_Up, Qt.KeyboardModifier.NoModifier, ""),
        (Qt.Key.Key_Return, Qt.KeyboardModifier.NoModifier, ""),
        (Qt.Key.Key_D, Qt.KeyboardModifier.ControlModifier, ""),
        (Qt.Key.Key_A, Qt.KeyboardModifier.NoModifier, "a"),
    ):
        view.keyPressEvent(QKeyEvent(QKeyEvent.Type.KeyPress, key, modifier, char))

    assert seen == ["UP", "ENTER", "C-d"]
    assert text == ["a"]


@verifies(SWR.SWR_2429)
def test_the_widget_stays_silent_until_the_user_has_control(qtbot: QtBot) -> None:
    view = TerminalView()
    qtbot.addWidget(view)
    seen: list[str] = []
    view.control_key.connect(seen.append)
    view.keys_entered.connect(seen.append)

    view.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_A, Qt.KeyboardModifier.NoModifier, "a")
    )

    assert seen == [], "a terminal nobody took control of must not forward keystrokes"


@verifies(SWR.SWR_2429)
def test_the_widget_reports_the_grid_it_can_show(qtbot: QtBot) -> None:
    view = TerminalView()
    qtbot.addWidget(view)
    view.show()
    reported: list[tuple[int, int]] = []
    view.grid_resized.connect(lambda cols, rows: reported.append((cols, rows)))

    view.resize(700, 400)
    settle(qtbot)

    assert reported, "a resized terminal must tell its host the new grid"
    cols, rows = reported[-1]
    assert cols >= 20 and rows >= 4


@verifies(SWR.SWR_2428)
def test_taking_control_is_what_lets_keystrokes_through(qtbot: QtBot) -> None:
    hub, bridge, typed = _attached(qtbot)
    window = TerminalWindow(bridge)
    qtbot.addWidget(window)
    window.show_stream(STREAM)
    tab = window.tabs.currentWidget()
    assert tab is not None

    tab.terminal.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Y, Qt.KeyboardModifier.NoModifier, "y")
    )
    assert typed == [], "input must not reach the agent's terminal unasked"

    tab.take_control.setChecked(True)
    tab.terminal.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Y, Qt.KeyboardModifier.NoModifier, "y")
    )
    tab.terminal.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Return, Qt.KeyboardModifier.NoModifier, "")
    )

    assert typed == [("y", False), ("ENTER", False)]


@verifies(SWR.SWR_2428)
def test_interrupt_needs_no_arming_because_the_intent_is_unambiguous(qtbot: QtBot) -> None:
    hub, bridge, typed = _attached(qtbot)
    window = TerminalWindow(bridge)
    qtbot.addWidget(window)
    window.show_stream(STREAM)
    tab = window.tabs.currentWidget()
    assert tab is not None

    tab.interrupt_button.click()

    assert typed == [("C-c", False)]
    assert tab.take_control.isChecked() is False


@verifies(SWR.SWR_2428)
def test_a_terminal_row_renders_its_live_screen_in_the_transcript(qtbot: QtBot) -> None:
    hub, bridge, _typed = _attached(qtbot)
    hub.publish(SESSION, STREAM, "delta", "\x1b[31mFAILED\x1b[0m one test\r\n")
    settle(qtbot)

    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_terminal_screens(bridge.screen)
    view.set_events(
        [
            TranscriptEvent(
                "12:00:00",
                "coder",
                "$ pytest -q",
                kind="tool",
                tool="terminal",
                status="running",
                stream_id=STREAM,
            )
        ]
    )
    settle(qtbot)

    document = view.transcript_delegate._document(0, view.transcript_model.events[0], 600)
    rendered = document.toPlainText()
    assert "FAILED one test" in rendered
    assert "open terminal" in rendered, "the row must offer the way into the window"


@verifies(SWR.SWR_2428)
def test_a_finished_row_shows_its_own_result_not_the_live_screen(qtbot: QtBot) -> None:
    """Productive use: an agent runs two commands in a row and the reader scrolls back.
    Expected outcome: the first command's row still shows the first command's output."""
    hub, bridge, _typed = _attached(qtbot)
    hub.publish(SESSION, STREAM, "delta", "second command output\r\n")
    settle(qtbot)

    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_terminal_screens(bridge.peek)
    view.set_events(
        [
            TranscriptEvent(
                "12:00:00",
                "coder",
                "$ echo first",
                kind="tool",
                tool="terminal",
                status="ok",
                stream_id=STREAM,
                detail="first command output",
                full_detail="first command output",
            )
        ]
    )
    settle(qtbot)

    rendered = view.transcript_delegate._document(
        0, view.transcript_model.events[0], 600
    ).toPlainText()

    assert "first command output" in rendered
    assert "second command output" not in rendered, (
        "one agent reuses one terminal, so a finished row must not read the live screen"
    )


def _terminal_rows(status: str, tool: str = "terminal") -> list[TranscriptEvent]:
    return [
        TranscriptEvent(
            f"12:00:0{index}",
            "coder",
            f"$ echo {index}",
            kind="tool",
            tool=tool,
            status=status,
            stream_id=STREAM,
            event_key=f"call-{index}",
        )
        for index in range(4)
    ]


@verifies(SWR.SWR_2428)
def test_a_streaming_row_is_never_folded_into_a_tool_group(qtbot: QtBot) -> None:
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_group_tools_getter(lambda: True)
    view.set_events(_terminal_rows("running"))
    settle(qtbot)

    kinds = [event.kind for event in view.transcript_model.events]
    assert "tool_group" not in kinds


@verifies(SWR.SWR_2428)
def test_finished_terminal_rows_group_like_any_other_tool_row(qtbot: QtBot) -> None:
    """Productive use: a run that shelled out twenty times is read afterwards.
    Expected outcome: the finished commands fold up instead of filling the transcript."""
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_group_tools_getter(lambda: True)
    view.set_events(_terminal_rows("ok"))
    settle(qtbot)

    kinds = [event.kind for event in view.transcript_model.events]
    assert "tool_group" in kinds


@verifies(SWR.SWR_2428)
def test_grouping_reads_the_tool_name_the_same_way_the_preview_does(qtbot: QtBot) -> None:
    """Productive use: a backend reports the tool as ``Bash`` rather than ``bash``.
    Expected outcome: the running row is protected from grouping either way."""
    view = TranscriptListView()
    qtbot.addWidget(view)
    view.set_group_tools_getter(lambda: True)
    view.set_events(_terminal_rows("running", tool="Bash"))
    settle(qtbot)

    kinds = [event.kind for event in view.transcript_model.events]
    assert "tool_group" not in kinds


@verifies(SWR.SWR_2428, SWR.SWR_2506)
def test_what_the_user_does_in_the_terminal_lands_in_the_audit_log(
    qtbot: QtBot, tmp_path: Path
) -> None:
    """Productive use: a person takes control, types a command and interrupts the run.
    Expected outcome: the actions are on the audit trail, one entry per submitted line."""
    import json

    from rotaris_core.permissions.audit import register_audit_session, reset_audit_registry
    from rotaris_core.session.diagnostics import evidence_dir

    reset_audit_registry()
    register_audit_session(SESSION, tmp_path)
    try:
        _hub, bridge, _typed = _attached(qtbot)
        bridge.record_user_action(STREAM, "took control of the terminal")
        for char in "ls -la":
            bridge.send_keys(STREAM, char)
        bridge.send_keys(STREAM, "ENTER")
        bridge.interrupt(STREAM)

        entries = [
            json.loads(line)
            for line in (evidence_dir(tmp_path) / "permissions.jsonl").read_text().splitlines()
            if line.strip()
        ]
    finally:
        reset_audit_registry()

    summaries = [entry["summary"] for entry in entries]
    assert all(entry["source"] == "user" for entry in entries)
    assert all(entry["decision"] == "user-input" for entry in entries)
    assert any("took control" in summary for summary in summaries)
    assert any("typed ls -la" in summary for summary in summaries), summaries
    assert any("sent C-c" in summary for summary in summaries)
    assert sum("typed" in summary for summary in summaries) == 1, (
        "a line is the grain, so six keystrokes must not be six entries"
    )
