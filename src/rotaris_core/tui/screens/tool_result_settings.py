from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widgets import Label, Select, Static, Switch

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.config.schema import TuiDisplayConfig


@dataclass(frozen=True)
class ToolResultSettingsResult:
    display: TuiDisplayConfig
    saved: bool = False


_LINE_PRESETS = [
    ("1 line", 1),
    ("2 lines", 2),
    ("5 lines", 5),
    ("10 lines", 10),
    ("20 lines", 20),
    ("50 lines", 50),
    ("No limit", 0),
]


@traces(SWR.SWR_1086, SWR.SWR_1088)
class ToolResultSettingsScreen(ModalScreen[ToolResultSettingsResult | None]):
    BINDINGS = [
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, display: TuiDisplayConfig) -> None:
        super().__init__()
        self._display = display
        self._show_tool_results = display.show_tool_results
        self._result_max_lines = display.tool_result_max_lines
        self._show_tool_inputs = display.show_tool_inputs
        self._input_max_lines = display.tool_input_max_lines

    def compose(self) -> ComposeResult:
        presets = [(label, str(value)) for label, value in _LINE_PRESETS]

        with Vertical(id="tool-result-settings-container"):
            yield Static("Tool Display Settings", id="tool-result-settings-title")

            yield Static("Results", classes="tool-settings-section")
            with Horizontal(classes="tool-settings-row"):
                yield Label("Show tool results:")
                yield Switch(value=self._show_tool_results, id="tool-result-show-switch")
            with Horizontal(classes="tool-settings-row"):
                yield Label("Max result lines:")
                yield Select(
                    presets,
                    id="tool-result-lines-select",
                    prompt=str(self._result_max_lines),
                )

            yield Static("Inputs", classes="tool-settings-section")
            with Horizontal(classes="tool-settings-row"):
                yield Label("Show tool inputs:")
                yield Switch(value=self._show_tool_inputs, id="tool-input-show-switch")
            with Horizontal(classes="tool-settings-row"):
                yield Label("Max input lines:")
                yield Select(
                    presets,
                    id="tool-input-lines-select",
                    prompt=str(self._input_max_lines),
                )

            with Horizontal(id="tool-result-actions"):
                yield Static("", id="tool-result-hint")

    def on_mount(self) -> None:
        format_chord = getattr(self.app, "format_leader_chord", lambda key: f"Ctrl+X {key.upper()}")
        self.query_one("#tool-result-hint", Static).update(
            f"{format_chord('s')} to save  ·  esc to close",
        )

    def on_switch_changed(self, event: Switch.Changed) -> None:
        if event.switch.id == "tool-result-show-switch":
            self._show_tool_results = event.value
        elif event.switch.id == "tool-input-show-switch":
            self._show_tool_inputs = event.value

    def on_select_changed(self, event: Select.Changed) -> None:
        raw = str(event.value)
        if not raw.isdigit():
            return
        value = int(raw)
        if event.select.id == "tool-result-lines-select":
            self._result_max_lines = value
        elif event.select.id == "tool-input-lines-select":
            self._input_max_lines = value

    def action_save_settings(self) -> None:
        self._display.show_tool_results = self._show_tool_results
        self._display.tool_result_max_lines = self._result_max_lines
        self._display.show_tool_inputs = self._show_tool_inputs
        self._display.tool_input_max_lines = self._input_max_lines
        self.dismiss(ToolResultSettingsResult(display=self._display, saved=True))

    def action_dismiss_screen(self) -> None:
        self.dismiss(ToolResultSettingsResult(display=self._display, saved=False))
