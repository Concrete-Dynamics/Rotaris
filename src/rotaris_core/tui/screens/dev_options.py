from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult


@dataclass(frozen=True)
class DevOptionsState:
    effective_enabled: bool
    global_enabled: bool | None
    project_enabled: bool | None


@traces(SWR.SWR_1500)
class DevOptionsScreen(ModalScreen[None]):
    BINDINGS = [
        Binding("g", "toggle_global", "Toggle Global"),
        Binding("p", "toggle_project", "Toggle Project"),
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, state: DevOptionsState) -> None:
        super().__init__()
        self._state = state

    def compose(self) -> ComposeResult:
        with Vertical(id="dev-options-container"):
            yield Static("Dev Options", id="dev-options-title")
            yield Static("", id="dev-options-summary")
            yield Static("", id="dev-options-effective")
            yield Static("", id="dev-options-global")
            yield Static("", id="dev-options-project")
            yield Static(
                "G toggles the global default · P toggles the project override · Esc closes",
                id="dev-options-hint",
            )
            with Horizontal(id="dev-options-actions"):
                yield Button("Toggle Global", id="dev-options-toggle-global")
                yield Button("Toggle Project", id="dev-options-toggle-project")
                yield Button("Close", id="dev-options-close")

    def on_mount(self) -> None:
        self._render_state()
        self.query_one("#dev-options-toggle-global", Button).focus()

    def update_state(self, state: DevOptionsState) -> None:
        self._state = state
        self._render_state()

    def action_toggle_global(self) -> None:
        self._toggle_scope("global")

    def action_toggle_project(self) -> None:
        self._toggle_scope("project")

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "dev-options-toggle-global":
            self._toggle_scope("global")
            return
        if event.button.id == "dev-options-toggle-project":
            self._toggle_scope("project")
            return
        self.dismiss(None)

    def _toggle_scope(self, scope: str) -> None:
        app = self.app
        toggle = getattr(app, "toggle_memory_diagnostics_scope", None)
        if not callable(toggle):
            return
        state = toggle(scope)
        if isinstance(state, DevOptionsState):
            self.update_state(state)

    def _render_state(self) -> None:
        summary = self.query_one("#dev-options-summary", Static)
        effective = self.query_one("#dev-options-effective", Static)
        global_row = self.query_one("#dev-options-global", Static)
        project_row = self.query_one("#dev-options-project", Static)

        project_note = ""
        if self._state.project_enabled is not None:
            project_note = " Project override currently wins."
        elif self._state.global_enabled is not None:
            project_note = " Project inherits the global default."

        summary.update(
            "Memory diagnostics writes tracemalloc/RSS snapshots at child boundaries."
            + project_note,
        )
        effective.update(
            self._format_row("Effective", self._state.effective_enabled, inherited=False)
        )
        global_row.update(
            self._format_row("Global", self._state.global_enabled, inherited=True),
        )
        project_row.update(
            self._format_row("Project", self._state.project_enabled, inherited=True),
        )

    @staticmethod
    def _format_row(label: str, value: bool | None, *, inherited: bool) -> str:
        rendered = "inherit" if value is None and inherited else "on" if bool(value) else "off"
        return f"{label}: {rendered}"
