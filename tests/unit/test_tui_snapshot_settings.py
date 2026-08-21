"""Snapshot tests — settings screens.

Generate baselines with::

    pytest tests/unit/test_tui_snapshot_settings.py --snapshot-update
"""

from __future__ import annotations

from typing import Any

from rotaris_core.config.schema import CompressorConfig, TuiDisplayConfig
from rotaris_core.reqtocode import SWR, verifies

from .snapshot_helpers import _SingleScreenApp

# -------- Provider Settings --------


@verifies(SWR.SWR_761)
def test_snapshot_provider_settings(snap_compare: Any, monkeypatch: Any) -> None:
    """Baseline: provider settings with an API-key provider."""

    from rotaris_core.auth.provider import AuthFlowType
    from rotaris_core.tui.screens.provider_settings import ProviderSettingsScreen

    class FakeSettings:
        provider_id = "p1"
        display_name = "OpenAI Compatible"
        auth_flow = AuthFlowType.API_KEY
        authenticated = True
        masked_key = "sk-...abc"
        base_url = None

    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.list_provider_settings",
        lambda: [FakeSettings],
    )
    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.get_provider_settings",
        lambda pid: FakeSettings,
    )

    class _App(_SingleScreenApp):
        screen_type = ProviderSettingsScreen

    assert snap_compare(_App())


# -------- Tool Result Settings --------


@verifies(SWR.SWR_1086)
def test_snapshot_tool_result_settings(snap_compare: Any) -> None:
    """Baseline: tool result settings with default values."""

    from rotaris_core.tui.screens.tool_result_settings import ToolResultSettingsScreen

    class _App(_SingleScreenApp):
        screen_type = ToolResultSettingsScreen
        screen_args = (TuiDisplayConfig(),)

    assert snap_compare(_App())


# -------- Compression Settings --------


@verifies(SWR.SWR_1434, SWR.SWR_1435, SWR.SWR_1439, SWR.SWR_1441)
def test_snapshot_compression_slider_50(snap_compare: Any) -> None:
    """Baseline: compression settings with slider at 50%."""

    from rotaris_core.tui.screens.compression_settings import CompressionSettingsScreen

    class _App(_SingleScreenApp):
        screen_type = CompressionSettingsScreen
        screen_args = (CompressorConfig(threshold_percentage=50),)

    assert snap_compare(_App())


@verifies(SWR.SWR_1434, SWR.SWR_1435, SWR.SWR_1439, SWR.SWR_1441)
def test_snapshot_compression_slider_90(snap_compare: Any) -> None:
    """Baseline: compression settings with slider near max (90%)."""

    from rotaris_core.tui.screens.compression_settings import CompressionSettingsScreen

    class _App(_SingleScreenApp):
        screen_type = CompressionSettingsScreen
        screen_args = (CompressorConfig(threshold_percentage=90),)

    assert snap_compare(_App())
