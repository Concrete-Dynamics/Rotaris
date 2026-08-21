"""Detached, interactive terminal window (SWR-2428).

One tab per live terminal — the agent's foreground command and every background
session it spawned.  Shaped after :mod:`rotaris.views.agent_window`, which is
this app's established pop-out: a create-or-raise window held by
:class:`~rotaris.views.main_window.MainWindow`, refreshed from signals rather
than polled by itself.

The terminal belongs to the agent.  Typing into a command the agent is waiting
on can desynchronise how it reads its own result, so keystrokes are forwarded
only after the user explicitly takes control.  Interrupt and kill do *not* need
arming: those express unambiguous intent, and needing two clicks to stop a
runaway command would be its own bug — but killing is confirmed first, because
it is the one action here that cannot be taken back.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QApplication,
    QDialog,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.models.state import NoticeSeverity, UiNotice
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets import (
    ConfirmImpactDialog,
    EmptyState,
    InlineBanner,
    StatusDot,
    TerminalView,
    make_availability_help,
    make_button,
    set_action_availability,
)

if TYPE_CHECKING:
    from rotaris.services.terminal_stream_bridge import TerminalStreamBridge
    from rotaris.theme.spec import Theme

#: How often an open terminal repaints.  Fast enough that output does not read
#: as stuttering, slow enough that ten open tabs cost nothing noticeable.
_REFRESH_MS = 120

#: Longest tab label before it is elided.
_TAB_LABEL_CHARS = 28

_TAKE_CONTROL_WARNING = (
    "You are typing into the agent's terminal. Keys you send become part of the "
    "command output the agent reads back."
)

_ENDED_REASON = "The process has ended, so it cannot accept input."


def _elide(text: str, limit: int = _TAB_LABEL_CHARS) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


@traces(SWR.SWR_2428)
def stream_display_name(stream_id: str) -> str:
    """A name for a stream a person can read; never the raw internal key.

    Falls back through the agent that owns the terminal, because a screen
    reader announcing ``fg:orchestrator`` has told the user nothing.
    """
    kind, _, rest = stream_id.partition(":")
    if not rest:
        return "Terminal"
    if kind == "bg":
        return f"Background session {_elide(rest, 12)}"
    return theme.persona_display(rest) or "Terminal"


@traces(SWR.SWR_2428)
class TerminalWindow(QMainWindow):
    """Every live terminal of one session, as tabs, with input."""

    closed = Signal()
    #: An empty-state recovery action the host should carry out.
    action_requested = Signal(str)

    def __init__(
        self,
        bridge: TerminalStreamBridge,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._bridge = bridge
        self._session_label = ""
        self.setObjectName("terminalWindow")
        self.setWindowTitle("Rotaris · Terminal")
        self.resize(900, 620)
        root = QWidget()
        root.setObjectName("appRoot")
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(10)

        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        self.tabs.setAccessibleName("Terminal sessions")
        layout.addWidget(self.tabs, 1)

        self.empty = EmptyState(
            "No terminal yet",
            "A terminal appears here as soon as an agent runs a shell command. "
            "Start a run in Workspace and this window fills itself.",
            action_label="Go to Workspace",
            action_id="view.workspace",
        )
        self.empty.setMaximumWidth(460)
        self.empty.action_requested.connect(self.action_requested)
        # Centred rather than stretched: an empty state spread over a 900px
        # window reads as a broken layout, not as an explanation.
        self._empty_holder = QWidget()
        holder = QVBoxLayout(self._empty_holder)
        holder.setContentsMargins(0, 0, 0, 0)
        holder.addStretch(1)
        centred = QHBoxLayout()
        centred.addStretch(1)
        centred.addWidget(self.empty)
        centred.addStretch(1)
        holder.addLayout(centred)
        holder.addStretch(1)
        layout.addWidget(self._empty_holder, 1)

        self._timer = QTimer(self)
        self._timer.setInterval(_REFRESH_MS)
        self._timer.timeout.connect(self._tick)
        self._timer.start()

        bridge.stream_changed.connect(lambda _s: self.refresh())
        self.refresh()

    # ── chrome ───────────────────────────────────────────────────────────

    def set_session_label(self, label: str) -> None:
        """Name the run these terminals belong to, in the window title."""
        self._session_label = label
        self.setWindowTitle(f"Rotaris · Terminal — {label}" if label else "Rotaris · Terminal")

    # ── tabs ─────────────────────────────────────────────────────────────

    def refresh(self, select_stream_id: str = "") -> None:
        """Add tabs for new streams and re-label the ones already open."""
        for stream_id in self._bridge.known_streams():
            if self._tab_for(stream_id) is None:
                page = _TerminalTab(self._bridge, stream_id, self)
                self.tabs.addTab(page, page.tab_label())
        for index in range(self.tabs.count()):
            open_page = self.tabs.widget(index)
            if isinstance(open_page, _TerminalTab):
                self.tabs.setTabText(index, open_page.tab_label())
                self.tabs.setTabToolTip(index, open_page.tab_tooltip())
                open_page.refresh_header()
        has_tabs = self.tabs.count() > 0
        self.tabs.setVisible(has_tabs)
        self._empty_holder.setVisible(not has_tabs)
        if select_stream_id:
            self.show_stream(select_stream_id)

    def show_stream(self, stream_id: str) -> None:
        """Bring *stream_id*'s tab forward, creating it if the stream is live."""
        page = self._tab_for(stream_id)
        if page is None:
            if self._bridge.screen(stream_id) is None:
                # The stream is gone — a row from a reloaded session, say. The
                # empty state explains that better than an invented terminal.
                return
            self.refresh()
            page = self._tab_for(stream_id)
        if page is not None:
            self.tabs.setCurrentWidget(page)
            page.focus_entry()

    def current_stream_id(self) -> str:
        page = self.tabs.currentWidget()
        return page.stream_id if isinstance(page, _TerminalTab) else ""

    def _tab_for(self, stream_id: str) -> _TerminalTab | None:
        for index in range(self.tabs.count()):
            page = self.tabs.widget(index)
            if isinstance(page, _TerminalTab) and page.stream_id == stream_id:
                return page
        return None

    def _tick(self) -> None:
        # Every tab's header, because a background tab that still says
        # "running" for a finished command is a lie the user cannot see through.
        # Only the visible grid repaints.
        for index in range(self.tabs.count()):
            page = self.tabs.widget(index)
            if isinstance(page, _TerminalTab):
                page.refresh_header()
        page = self.tabs.currentWidget()
        if isinstance(page, _TerminalTab):
            page.tick()

    def closeEvent(self, event: object) -> None:  # noqa: N802 - Qt override
        # Closing is the pop-back-in: the transcript preview never stopped
        # streaming, so there is nothing to hand back.
        self._timer.stop()
        self.closed.emit()
        super().closeEvent(event)  # type: ignore[arg-type]


@traces(SWR.SWR_2428)
class _TerminalTab(Themed, QWidget):
    """One stream: header, the grid, and the controls that drive it."""

    def __init__(
        self,
        bridge: TerminalStreamBridge,
        stream_id: str,
        window: TerminalWindow,
    ) -> None:
        super().__init__(window)
        self._bridge = bridge
        self.stream_id = stream_id
        self._revision = -1
        self._reported_exit = False
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 10, 0, 0)
        layout.setSpacing(8)

        header = QHBoxLayout()
        self.dot = StatusDot(size=8)
        self.dot.setAccessibleName("Command status")
        header.addWidget(self.dot)
        self.command_label = QLabel()
        self.command_label.setObjectName("mono")
        self.command_label.setAccessibleName("Command")
        self.command_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        header.addWidget(self.command_label, 1)
        self.truncated_label = QLabel("Earlier output dropped")
        self.truncated_label.setObjectName("dim")
        self.truncated_label.setAccessibleName("Scrollback limit reached")
        self.truncated_label.setToolTip(
            "This terminal produced more output than Rotaris keeps; the oldest lines are gone."
        )
        self.truncated_label.hide()
        header.addWidget(self.truncated_label)
        self.status_label = QLabel()
        self.status_label.setObjectName("muted")
        self.status_label.setAccessibleName("Command outcome")
        header.addWidget(self.status_label)
        layout.addLayout(header)

        self.warning = InlineBanner()
        self.warning.action_requested.connect(self._banner_action)
        layout.addWidget(self.warning)

        self.terminal = TerminalView(self)
        self.terminal.setAccessibleName(f"Terminal output for {stream_display_name(stream_id)}")
        layout.addWidget(self.terminal, 1)

        controls = QHBoxLayout()
        controls.setSpacing(8)
        self.take_control = make_button("Take control", "ghost")
        self.take_control.setCheckable(True)
        self.take_control.setAccessibleName("Take control of this terminal")
        self.take_control.setAccessibleDescription(
            "Forward your keystrokes to the running command. Off by default because "
            "typing can disturb how the agent reads the command result."
        )
        self.take_control.toggled.connect(self._on_take_control)
        controls.addWidget(self.take_control)

        self.interrupt_button = make_button("Interrupt (Ctrl-C)", "ghost")
        self.interrupt_button.setAccessibleName("Interrupt the running command")
        self.interrupt_button.clicked.connect(self._interrupt)
        controls.addWidget(self.interrupt_button)

        self.eof_button = make_button("End input (Ctrl-D)", "ghost")
        self.eof_button.setAccessibleName("Send end of input to the running command")
        self.eof_button.clicked.connect(self._end_input)
        controls.addWidget(self.eof_button)

        # Disabled Qt controls may never receive a hover, so the reason lives on
        # an enabled control beside them (SWR-2124).
        self.controls_help = make_availability_help("terminal input")
        controls.addWidget(self.controls_help)

        controls.addStretch(1)
        self.copy_button = make_button("Copy all", "ghost")
        self.copy_button.setAccessibleName("Copy all terminal output")
        self.copy_button.clicked.connect(self._copy_all)
        controls.addWidget(self.copy_button)
        # Far side of the stretch: killing a build because the pointer landed
        # one button to the right is not a mistake worth allowing.
        self.kill_button = make_button("Kill", "danger")
        self.kill_button.setAccessibleName("Kill the process behind this terminal")
        self.kill_button.setAccessibleDescription(
            "Terminates the running process. Asks for confirmation first."
        )
        self.kill_button.clicked.connect(self._kill)
        controls.addWidget(self.kill_button)
        layout.addLayout(controls)

        self.terminal.keys_entered.connect(self._on_text)
        self.terminal.control_key.connect(self._on_control)
        self.terminal.grid_resized.connect(self._on_grid_resized)
        self.terminal.input_rejected.connect(self._on_input_rejected)
        self.terminal.set_screen(bridge.screen(stream_id))
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # The dot keeps its colour for its own paintEvent, and the header is
        # where the decision of *which* colour lives, so re-running it is the
        # whole of the update.
        self.refresh_header()

    # ── labels ───────────────────────────────────────────────────────────

    def _command(self) -> str:
        screen = self._bridge.peek(self.stream_id)
        return (screen.command if screen else "").strip()

    def tab_label(self) -> str:
        return _elide(self._command() or stream_display_name(self.stream_id))

    def tab_tooltip(self) -> str:
        screen = self._bridge.peek(self.stream_id)
        name = self._command() or stream_display_name(self.stream_id)
        if screen is None:
            return name
        state = "running" if screen.running else self._exit_label(screen.exit_code)
        return f"{name} · {state}"

    def refresh_header(self) -> None:
        screen = self._bridge.peek(self.stream_id)
        if screen is None:
            return
        command = self._command()
        self.command_label.setText(f"$ {_elide(command, 90)}" if command else "$")
        self.command_label.setToolTip(command)
        self.truncated_label.setVisible(screen.truncated)
        running = screen.running
        # The graphical state tokens, not their text forms: this is a 7px dot,
        # and the word beside it is what carries the meaning for a reader.
        color = tokens().color
        self.dot.set_state(color.run if running else color.idle, pulse=running)
        outcome = "running" if running else self._exit_label(screen.exit_code)
        self.status_label.setText(outcome)
        can_input = running and self._bridge.can_take_input(self.stream_id)
        reason = "" if can_input else _ENDED_REASON
        for button in (self.take_control, self.interrupt_button, self.eof_button, self.kill_button):
            set_action_availability(
                button, enabled=can_input, reason=reason, help_button=self.controls_help
            )
        if not running:
            if self.take_control.isChecked():
                self.take_control.setChecked(False)
            self.terminal.set_input_enabled(False)
            if not self._reported_exit:
                self._reported_exit = True
                self._notify(
                    NoticeSeverity.INFO,
                    "Process exited",
                    f"{outcome}. The output stays readable and copyable.",
                )

    def focus_entry(self) -> None:
        """Put focus where a keystroke will actually do something."""
        if self.take_control.isEnabled() and not self.take_control.isChecked():
            self.take_control.setFocus()
        else:
            self.terminal.setFocus()

    def _notify(
        self,
        severity: NoticeSeverity,
        title: str,
        message: str,
        *,
        action_label: str = "",
        action_id: str = "",
    ) -> None:
        """One persistent banner slot per tab, so the last state is the one shown."""
        self.warning.show_notice(
            UiNotice(
                id=f"terminal:{self.stream_id}",
                severity=severity,
                title=title,
                message=message,
                action_label=action_label,
                action_id=action_id,
            )
        )

    @staticmethod
    def _exit_label(exit_code: int | None) -> str:
        if exit_code is None:
            return "exited"
        return f"exit {exit_code}"

    # ── behaviour ────────────────────────────────────────────────────────

    def tick(self) -> None:
        self.terminal.refresh()
        screen = self._bridge.peek(self.stream_id)
        if screen is not None and screen.revision != self._revision:
            self._revision = screen.revision

    def _on_take_control(self, armed: bool) -> None:
        self.terminal.set_input_enabled(armed)
        # The label says the state, so it does not rest on the toggle's fill.
        self.take_control.setText("Release control" if armed else "Take control")
        if armed:
            self._bridge.record_user_action(self.stream_id, "took control of the terminal")
            self._notify(NoticeSeverity.WARNING, "You have control", _TAKE_CONTROL_WARNING)
            self.terminal.setFocus()
            return
        self._bridge.record_user_action(self.stream_id, "released control of the terminal")
        if not self._reported_exit:
            self.warning.show_notice(None)

    def _banner_action(self, action_id: str) -> None:
        if action_id == "terminal.arm" and self.take_control.isEnabled():
            self.take_control.setChecked(True)

    def _on_input_rejected(self) -> None:
        """A key went nowhere; say so, and offer the way to make it go somewhere."""
        if self.take_control.isChecked() or self._reported_exit:
            return
        self._notify(
            NoticeSeverity.INFO,
            "This terminal is read-only",
            "It belongs to the agent. Take control to send what you type to the command.",
            action_label="Take control",
            action_id="terminal.arm",
        )

    def _on_text(self, text: str) -> None:
        self._report(self._bridge.send_keys(self.stream_id, text), "send that key")

    def _on_control(self, key: str) -> None:
        self._report(self._bridge.send_keys(self.stream_id, key), f"send {key}")

    def _interrupt(self) -> None:
        self._report(self._bridge.interrupt(self.stream_id), "interrupt the command")

    def _end_input(self) -> None:
        self._report(self._bridge.send_keys(self.stream_id, "C-d"), "end the command's input")

    def _kill(self) -> None:
        command = self._command()
        dialog = ConfirmImpactDialog(
            "Kill this command?",
            "The process behind this terminal is terminated immediately.",
            [
                f"$ {command}" if command else "The command running in this terminal",
                "The agent reads the killed command's output as its result.",
                "Anything the command had not written yet is lost.",
            ],
            confirm_label="Kill command",
            parent=self,
        )
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        self._report(self._bridge.kill(self.stream_id), "kill the process")

    def _report(self, succeeded: bool, attempt: str) -> None:
        """A refused action must not look identical to one that worked."""
        if succeeded:
            return
        self._notify(
            NoticeSeverity.WARNING,
            "The terminal did not take that",
            f"Rotaris could not {attempt}. The process may have ended already.",
        )

    def _on_grid_resized(self, cols: int, rows: int) -> None:
        self._bridge.resize(self.stream_id, cols, rows)

    def _copy_all(self) -> None:
        screen = self._bridge.peek(self.stream_id)
        if screen is None:
            return
        clipboard = QApplication.clipboard()
        if clipboard is not None:
            clipboard.setText(screen.text())
