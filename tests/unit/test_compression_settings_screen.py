"""TUI tests for CompressionSettingsScreen — three mandatory categories.

Category 1 — Full workflow: open, adjust slider, save.
Category 2 — Alternative paths: dismiss without save, keyboard arrow adjustment.
Category 3 — Random interaction: unmapped keys, resize.
"""

from __future__ import annotations

from textual.app import App, ComposeResult
from textual.events import Resize
from textual.geometry import Size

from rotaris_core.config.schema import CompressorConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.screens.compression_settings import (
    CompressionSettingsResult,
    CompressionSettingsScreen,
    CompressionThresholdSlider,
)


class _CompressionSettingsApp(App[None]):
    def __init__(self, compressor: CompressorConfig) -> None:
        super().__init__()
        self.compressor = compressor
        self.result: CompressionSettingsResult | None = None

    def compose(self) -> ComposeResult:
        yield from ()

    def on_mount(self) -> None:
        self.push_screen(
            CompressionSettingsScreen(self.compressor),
            lambda result: setattr(self, "result", result),
        )


# ---------------------------------------------------------------------------
# Category 1: Full Workflow
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1434, SWR.SWR_1441)
async def test_compression_settings_slider_adjusts_and_saves() -> None:
    """Full workflow: open, increase threshold with right arrow, save."""
    app = _CompressionSettingsApp(CompressorConfig(threshold_percentage=50))

    async with app.run_test() as pilot:
        await pilot.pause()
        slider = app.screen.query_one("#compression-threshold-slider", CompressionThresholdSlider)
        assert slider.value == 50

        await pilot.press("right")
        await pilot.press("right")
        app.screen.action_save_settings()
        await pilot.pause()

    assert app.result is not None
    assert app.result.saved is True
    assert app.result.compressor.threshold_percentage == 60


# ---------------------------------------------------------------------------
# Category 2: Alternative Paths
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1434, SWR.SWR_1441)
async def test_compression_settings_alt_dismiss_without_save() -> None:
    """Alternative path: adjust slider then dismiss via escape — original unchanged."""
    compressor = CompressorConfig(threshold_percentage=50)
    app = _CompressionSettingsApp(compressor)

    async with app.run_test() as pilot:
        await pilot.pause()
        slider = app.screen.query_one("#compression-threshold-slider", CompressionThresholdSlider)
        assert slider.value == 50

        await pilot.press("right", "right", "right")
        await pilot.pause()
        assert slider.value == 65

        await pilot.press("escape")
        await pilot.pause()

    assert app.result is not None
    assert app.result.saved is False
    # Original compressor unchanged.
    assert compressor.threshold_percentage == 50


@verifies(SWR.SWR_1434, SWR.SWR_1441)
async def test_compression_settings_alt_decrease_with_left_arrow_save() -> None:
    """Alternative path: decrease threshold with left arrow, save."""
    app = _CompressionSettingsApp(CompressorConfig(threshold_percentage=80))

    async with app.run_test() as pilot:
        await pilot.pause()
        slider = app.screen.query_one("#compression-threshold-slider", CompressionThresholdSlider)
        assert slider.value == 80

        await pilot.press("left", "left")
        await pilot.pause()
        assert slider.value == 70

        app.screen.action_save_settings()
        await pilot.pause()

    assert app.result is not None
    assert app.result.saved is True
    assert app.result.compressor.threshold_percentage == 70


@verifies(SWR.SWR_1434, SWR.SWR_1441)
async def test_compression_settings_alt_save_no_changes() -> None:
    """Alternative path: save with no adjustments — still returns saved=True."""
    app = _CompressionSettingsApp(CompressorConfig(threshold_percentage=42))

    async with app.run_test() as pilot:
        await pilot.pause()
        slider = app.screen.query_one("#compression-threshold-slider", CompressionThresholdSlider)
        assert slider.value == 42

        app.screen.action_save_settings()
        await pilot.pause()

    assert app.result is not None
    assert app.result.saved is True
    assert app.result.compressor.threshold_percentage == 42


# ---------------------------------------------------------------------------
# Category 3: Random Interaction
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1434, SWR.SWR_1441)
async def test_compression_settings_random_interaction_no_crash() -> None:
    """Random interaction: unmapped keys and resize must not crash."""
    compressor = CompressorConfig(threshold_percentage=50)
    app = _CompressionSettingsApp(compressor)

    async with app.run_test() as pilot:
        await pilot.pause()

        slider = app.screen.query_one("#compression-threshold-slider", CompressionThresholdSlider)
        assert slider.value == 50

        # Unmapped keys.
        await pilot.press("q", "x", "f5", "tab", "pageup", "pagedown")
        await pilot.pause()

        # Still queryable.
        assert slider.value == 50

        # Resize.
        app.post_message(Resize(Size(100, 30), Size(80, 24)))
        await pilot.pause()

        # Still fine, can save.
        app.screen.action_save_settings()
        await pilot.pause()

    assert app.result is not None
    assert app.result.saved is True
