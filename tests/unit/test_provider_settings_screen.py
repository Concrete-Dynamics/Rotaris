"""TUI tests for ProviderSettingsScreen — three mandatory categories.

Category 1 — Full workflow: open, select provider, enter key, save.
Category 2 — Alternative paths: validate, dismiss without save, no providers.
Category 3 — Random interaction: unmapped keys, resize.

Uses monkeypatch to bypass real auth/network calls.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from unittest.mock import MagicMock

import pytest
from textual.app import App, ComposeResult
from textual.widgets import Input, Select, Static

from rotaris_core.auth.provider import AuthFlowType
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.screens.provider_settings import (
    ProviderSettingsResult,
    ProviderSettingsScreen,
)

# ---------------------------------------------------------------------------
# Fixtures: fake provider settings that don't touch storage/network
# ---------------------------------------------------------------------------


@dataclass
class _FakeProviderSettings:
    provider_id: str = "test-provider"
    display_name: str = "Test Provider"
    auth_flow: AuthFlowType = AuthFlowType.API_KEY
    authenticated: bool = True
    masked_key: str | None = "sk-...***"
    base_url: str | None = None
    extra: dict[str, Any] | None = None


def _fake_get_provider_settings(provider_id: str) -> _FakeProviderSettings:
    return _FakeProviderSettings(provider_id=provider_id)


def _fake_list_provider_settings() -> list[_FakeProviderSettings]:
    return [
        _FakeProviderSettings(provider_id="p1", display_name="Provider One"),
        _FakeProviderSettings(provider_id="p2", display_name="Provider Two"),
    ]


def _fake_update_api_key(provider_id: str, key: str, **kw: Any) -> MagicMock:
    del provider_id, key, kw
    result = MagicMock()
    result.success = True
    result.message = "Key saved."
    return result


def _fake_update_base_url(provider_id: str, url: str, **kw: Any) -> MagicMock:
    del provider_id, url, kw
    result = MagicMock()
    result.success = True
    result.message = "Base URL updated."
    return result


def _fake_validate_provider(provider_id: str) -> MagicMock:
    del provider_id
    result = MagicMock()
    result.success = True
    result.message = "Provider is valid."
    return result


def _apply_provider_patches(monkeypatch: pytest.MonkeyPatch) -> None:
    """Apply all provider-setting patches to keep tests offline."""
    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.get_provider_settings",
        _fake_get_provider_settings,
    )
    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.list_provider_settings",
        _fake_list_provider_settings,
    )
    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.update_api_key",
        _fake_update_api_key,
    )
    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.update_base_url",
        _fake_update_base_url,
    )
    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.validate_provider",
        _fake_validate_provider,
    )


# ---------------------------------------------------------------------------
# Minimal App for isolated ProviderSettingsScreen testing
# ---------------------------------------------------------------------------


class _ProviderApp(App[None]):
    def __init__(self, screen: ProviderSettingsScreen) -> None:
        super().__init__()
        self._test_screen = screen
        self.result: ProviderSettingsResult | None = None

    def compose(self) -> ComposeResult:
        yield from ()

    def on_mount(self) -> None:
        self.push_screen(self._test_screen, lambda r: setattr(self, "result", r))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_761, SWR.SWR_762)
@pytest.mark.asyncio
async def test_provider_settings_full_workflow_select_enter_save(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Full workflow: open, select a provider, enter API key, save."""
    _apply_provider_patches(monkeypatch)

    app = _ProviderApp(ProviderSettingsScreen())
    async with app.run_test() as pilot:
        await pilot.pause()

        assert isinstance(app.screen, ProviderSettingsScreen)

        # Provider select should have options.
        select = app.screen.query_one("#provider-settings-provider", Select)
        assert select._options is not None

        # API key input should be present and focused.
        key_input = app.screen.query_one("#provider-settings-api-key", Input)
        await pilot.pause()

        # Type a key.
        await pilot.press(*list("sk-test-key"))
        await pilot.pause()
        assert key_input.value == "sk-test-key"

        app.screen.action_save_settings()
        # Saving runs in a worker; let it finish before the app tears down.
        await app.workers.wait_for_complete()
        await pilot.pause()

    result = app.result
    assert result is not None
    assert result.saved is True
    assert result.provider_id == "p1"


@verifies(SWR.SWR_761, SWR.SWR_766)
@pytest.mark.asyncio
async def test_provider_settings_alt_validate_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Alternative path: press 'v' to validate a provider."""
    _apply_provider_patches(monkeypatch)

    app = _ProviderApp(ProviderSettingsScreen())
    async with app.run_test() as pilot:
        await pilot.pause()

        assert isinstance(app.screen, ProviderSettingsScreen)

        # Press 'v' to validate.
        await pilot.press("v")
        # Validation runs in a worker; let it finish before asserting.
        await app.workers.wait_for_complete()
        await pilot.pause()

        # Should still be on the screen (validate doesn't dismiss).
        assert isinstance(app.screen, ProviderSettingsScreen)

        await pilot.press("escape")
        await pilot.pause()


@verifies(SWR.SWR_761, SWR.SWR_768)
@pytest.mark.asyncio
async def test_provider_settings_alt_dismiss_without_save(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Alternative path: dismiss with escape without saving."""
    _apply_provider_patches(monkeypatch)

    app = _ProviderApp(ProviderSettingsScreen())
    async with app.run_test() as pilot:
        await pilot.pause()

        assert isinstance(app.screen, ProviderSettingsScreen)

        await pilot.press("escape")
        await pilot.pause()

    result = app.result
    assert result is None  # dismissed without saving


@verifies(SWR.SWR_761)
@pytest.mark.asyncio
async def test_provider_settings_alt_no_providers_empty_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Alternative path: no providers configured — shows empty state."""
    monkeypatch.setattr(
        "rotaris_core.tui.screens.provider_settings.list_provider_settings",
        lambda: [],
    )

    app = _ProviderApp(ProviderSettingsScreen())
    async with app.run_test() as pilot:
        await pilot.pause()

        assert isinstance(app.screen, ProviderSettingsScreen)

        # Should show "No providers found."
        statics = app.screen.query(Static)
        assert any("No providers found" in str(s.render()) for s in statics)

        await pilot.press("escape")
        await pilot.pause()


@verifies(SWR.SWR_761, SWR.SWR_763)
@pytest.mark.asyncio
async def test_provider_settings_alt_select_different_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Alternative path: switch to a different provider via Select."""
    _apply_provider_patches(monkeypatch)

    app = _ProviderApp(ProviderSettingsScreen())
    async with app.run_test() as pilot:
        await pilot.pause()

        assert isinstance(app.screen, ProviderSettingsScreen)

        select = app.screen.query_one("#provider-settings-provider", Select)
        # Switch to second provider.
        select.value = "p2"
        await pilot.pause()

        # Status should reflect the new provider.
        base_input = app.screen.query_one("#provider-settings-base-url", Input)
        assert base_input is not None

        await pilot.press("escape")
        await pilot.pause()


@verifies(SWR.SWR_761, SWR.SWR_764)
@pytest.mark.asyncio
async def test_provider_settings_random_interaction_no_crash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Random interaction: unmapped keys and resize must not crash."""
    _apply_provider_patches(monkeypatch)

    app = _ProviderApp(ProviderSettingsScreen())
    async with app.run_test() as pilot:
        await pilot.pause()

        assert isinstance(app.screen, ProviderSettingsScreen)

        # Unmapped keys.
        await pilot.press("q", "x", "f5", "pageup", "pagedown", "tab")
        await pilot.pause()

        # Resize.
        from textual.events import Resize
        from textual.geometry import Size

        app.post_message(Resize(Size(120, 40), Size(80, 24)))
        await pilot.pause()

        # Still fine.
        assert isinstance(app.screen, ProviderSettingsScreen)

        await pilot.press("escape")
        await pilot.pause()
