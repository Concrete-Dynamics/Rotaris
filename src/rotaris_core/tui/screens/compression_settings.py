from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.message import Message
from textual.screen import ModalScreen
from textual.widgets import Label, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.config.schema import CompressorConfig


@dataclass(frozen=True)
class CompressionSettingsResult:
    compressor: CompressorConfig
    saved: bool = False


class CompressionThresholdSlider(Static):
    @dataclass
    class Changed(Message):
        value: int

    def __init__(
        self,
        *,
        value: int,
        minimum: int = 1,
        maximum: int = 100,
        step: int = 5,
        **kwargs: Any,
    ) -> None:
        super().__init__("", **kwargs)
        self._value = value
        self._minimum = minimum
        self._maximum = maximum
        self._step = step

    @property
    def value(self) -> int:
        return self._value

    def on_mount(self) -> None:
        self._update_render()

    def set_value(self, value: int) -> None:
        bounded = max(self._minimum, min(self._maximum, value))
        if bounded == self._value:
            return
        self._value = bounded
        self._update_render()
        self.post_message(self.Changed(self._value))

    def action_decrease(self) -> None:
        self.set_value(self._value - self._step)

    def action_increase(self) -> None:
        self.set_value(self._value + self._step)

    def _update_render(self) -> None:
        slots = 20
        filled = round(
            ((self._value - self._minimum) / (self._maximum - self._minimum)) * slots,
        )
        bar = "#" * filled + "-" * (slots - filled)
        self.update(f"[{bar}] {self._value}%")


@traces(SWR.SWR_1434, SWR.SWR_1435, SWR.SWR_1439, SWR.SWR_1441)
class CompressionSettingsScreen(ModalScreen[CompressionSettingsResult | None]):
    BINDINGS = [
        Binding("escape", "dismiss_screen", "Close"),
        Binding("left", "decrease_threshold", "Decrease"),
        Binding("right", "increase_threshold", "Increase"),
    ]

    def __init__(self, compressor: CompressorConfig) -> None:
        super().__init__()
        self._compressor = compressor
        self._percentage = compressor.threshold_percentage

    def compose(self) -> ComposeResult:
        with Vertical(id="compression-settings-container"):
            yield Static("Context Compression Settings", id="compression-settings-title")

            with Horizontal(classes="compression-settings-row"):
                yield Label("Trigger threshold:")
                yield CompressionThresholdSlider(
                    value=self._percentage,
                    id="compression-threshold-slider",
                )

            yield Static("", id="compression-settings-hint")

    def on_mount(self) -> None:
        format_chord = getattr(self.app, "format_leader_chord", lambda key: f"Ctrl+X {key.upper()}")
        self.query_one("#compression-settings-hint", Static).update(
            f"{format_chord('s')} to save  ·  esc to close",
        )

    def on_compression_threshold_slider_changed(
        self,
        event: CompressionThresholdSlider.Changed,
    ) -> None:
        self._percentage = event.value

    def action_decrease_threshold(self) -> None:
        slider = self.query_one("#compression-threshold-slider", CompressionThresholdSlider)
        slider.action_decrease()

    def action_increase_threshold(self) -> None:
        slider = self.query_one("#compression-threshold-slider", CompressionThresholdSlider)
        slider.action_increase()

    def action_save_settings(self) -> None:
        self._compressor.threshold_percentage = self._percentage
        self.dismiss(CompressionSettingsResult(compressor=self._compressor, saved=True))

    def action_dismiss_screen(self) -> None:
        self.dismiss(CompressionSettingsResult(compressor=self._compressor, saved=False))
