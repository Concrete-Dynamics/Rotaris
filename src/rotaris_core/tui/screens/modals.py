"""Modal confirmation/wait screens used by ``RotarisTuiApp``.

Each screen is a self-contained dialog with its own bindings and dismissal
contract, kept out of the main app module so the dialogs can be read and
tested in isolation.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult


@traces(SWR.SWR_1542)
class DiscardArtifactEditsScreen(ModalScreen[bool]):
    BINDINGS = [
        Binding("y", "discard", "Discard"),
        Binding("n", "cancel", "Cancel"),
        Binding("escape", "cancel", "Cancel"),
    ]

    def compose(self) -> ComposeResult:
        with Vertical(id="discard-artifact-edits-dialog"):
            yield Static("Discard unsaved artifact edits?", id="discard-artifact-edits-title")
            yield Static("Y discards changes · N/Esc returns to editor")

    def action_discard(self) -> None:
        self.dismiss(True)

    def action_cancel(self) -> None:
        self.dismiss(False)


@traces(SWR.SWR_903)
class QuotaWaitScreen(ModalScreen[str]):
    BINDINGS = [
        Binding("escape", "wait", "Keep Waiting"),
        Binding("w", "wait", "Keep Waiting"),
        Binding("m", "change_model", "Change Model"),
        Binding("c", "cancel", "Cancel Run"),
    ]

    def __init__(self, *, title: str, body: str, allow_auto_resume: bool) -> None:
        super().__init__()
        self._title = title
        self._body = body
        self._allow_auto_resume = allow_auto_resume

    def compose(self) -> ComposeResult:
        with Vertical(id="quota-wait-dialog"):
            yield Static(self._title, id="quota-wait-title")
            yield Static(self._body, id="quota-wait-body")
            yield Static(
                ("Press Esc/W to keep waiting, M to change model, or C to cancel the run."),
                id="quota-wait-help",
            )
            with Horizontal(id="quota-wait-actions"):
                yield Button("Keep Waiting", id="quota-wait-continue")
                yield Button("Change Model", id="quota-wait-change-model")
                yield Button("Cancel Run", id="quota-wait-cancel")

    def on_mount(self) -> None:
        focus_id = "#quota-wait-continue" if self._allow_auto_resume else "#quota-wait-change-model"
        self.query_one(focus_id, Button).focus()

    def action_wait(self) -> None:
        self.dismiss("wait")

    def action_change_model(self) -> None:
        self.dismiss("change_model")

    def action_cancel(self) -> None:
        self.dismiss("cancel")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "quota-wait-change-model":
            self.dismiss("change_model")
            return
        if event.button.id == "quota-wait-cancel":
            self.dismiss("cancel")
            return
        self.dismiss("wait")


@traces(SWR.SWR_912, SWR.SWR_913)
class MessageLimitConfirmScreen(ModalScreen[str]):
    BINDINGS = [
        Binding("c", "continue_run", "Continue"),
        Binding("enter", "continue_run", "Continue"),
        Binding("d", "double_limit", "Double Limit"),
        Binding("x", "cancel_run", "Cancel Run"),
        Binding("escape", "cancel_run", "Cancel Run"),
    ]

    def __init__(self, *, message_count: int, message_limit: int, token_usage: str) -> None:
        super().__init__()
        self._message_count = message_count
        self._message_limit = message_limit
        self._token_usage = token_usage

    def compose(self) -> ComposeResult:
        with Vertical(id="message-limit-dialog"):
            yield Static(
                f"Message limit reached ({self._message_count}/{self._message_limit})",
                id="message-limit-title",
            )
            body = (
                f"Estimated token usage: {self._token_usage}\n\n"
                "C / Enter: Continue\n"
                f"D: Double the limit to {self._message_limit * 2}\n"
                "X / Esc: Cancel the run"
            )
            yield Static(body, id="message-limit-body")
            with Horizontal(id="message-limit-actions"):
                yield Button("Continue", id="message-limit-continue")
                yield Button("Double Limit", id="message-limit-double")
                yield Button("Cancel Run", id="message-limit-cancel")

    def on_mount(self) -> None:
        self.query_one("#message-limit-continue", Button).focus()

    def action_continue_run(self) -> None:
        self.dismiss("continue")

    def action_double_limit(self) -> None:
        self.dismiss("double")

    def action_cancel_run(self) -> None:
        self.dismiss("cancel")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "message-limit-double":
            self.dismiss("double")
        elif event.button.id == "message-limit-cancel":
            self.dismiss("cancel")
        else:
            self.dismiss("continue")


class ShortcutHelpScreen(ModalScreen[None]):
    BINDINGS = [
        Binding("escape", "dismiss_screen", "Close"),
        Binding("q", "dismiss_screen", "Close"),
    ]

    def __init__(self, *, body: str) -> None:
        super().__init__()
        self._body = body

    def compose(self) -> ComposeResult:
        with Vertical(id="shortcut-help-dialog"):
            yield Static("Keyboard Shortcuts and Slash Commands", id="shortcut-help-title")
            yield Static(self._body, id="shortcut-help-body")
            yield Static("Esc or Q closes", id="shortcut-help-hint")

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)
