from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING

from textual import work
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.screen import ModalScreen
from textual.widgets import Input, Label, Select, Static

from rotaris_core.auth.provider import AuthFlowType, DeviceCodePrompt
from rotaris_core.auth.provider_settings import (
    ProviderSettings,
    get_provider_settings,
    list_provider_settings,
    update_api_key,
    update_base_url,
    validate_provider,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult


@dataclass(frozen=True)
class ProviderSettingsResult:
    provider_id: str
    saved: bool = False
    message: str = ""


@traces(SWR.SWR_761, SWR.SWR_768, SWR.SWR_774)
class ProviderSettingsScreen(ModalScreen[ProviderSettingsResult | None]):
    BINDINGS = [
        Binding("ctrl+s", "save_settings", "Save"),
        Binding("v", "validate_provider", "Validate"),
        Binding("r", "reauthenticate", "Reauth"),
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, provider_id: str | None = None) -> None:
        super().__init__()
        self._providers = list(list_provider_settings())
        self._provider_id = provider_id or (
            self._providers[0].provider_id if self._providers else ""
        )
        self._current: ProviderSettings | None = None

    def compose(self) -> ComposeResult:
        options = [
            (f"{provider.display_name} [{provider.provider_id}]", provider.provider_id)
            for provider in self._providers
        ]
        with Vertical(id="provider-settings-container"):
            yield Static("Provider Settings", id="provider-settings-title")
            if not options:
                yield Static("No providers found.", id="provider-settings-status")
                return
            yield Select(
                options,
                value=self._provider_id,
                id="provider-settings-provider",
                prompt="Provider",
            )
            yield Static("", id="provider-settings-status")
            with Horizontal(classes="provider-settings-row"):
                yield Label("API key:")
                yield Input(
                    placeholder="leave blank to keep current key",
                    password=True,
                    id="provider-settings-api-key",
                )
            with Horizontal(classes="provider-settings-row"):
                yield Label("Base URL:")
                yield Input(id="provider-settings-base-url")
            yield Static("", id="provider-settings-hint")

    def on_mount(self) -> None:
        with suppress(NoMatches):
            self.query_one("#provider-settings-hint", Static).update(
                "Ctrl+S save  |  v validate  |  r reauth  |  esc close",
            )
        if self._provider_id:
            self._load_provider(self._provider_id)

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.select.id != "provider-settings-provider":
            return
        provider_id = str(event.value)
        if provider_id:
            self._load_provider(provider_id)

    def _load_provider(self, provider_id: str) -> None:
        self._provider_id = provider_id
        self._current = get_provider_settings(provider_id)
        status = self.query_one("#provider-settings-status", Static)
        key_state = self._current.masked_key or "not set"
        status.update(
            f"{self._current.display_name}: {self._current.auth_flow.value}, key {key_state}",
        )

        key_input = self.query_one("#provider-settings-api-key", Input)
        base_input = self.query_one("#provider-settings-base-url", Input)
        key_input.value = ""
        key_input.disabled = self._current.auth_flow != AuthFlowType.API_KEY
        base_input.value = self._current.base_url or ""
        base_input.disabled = False
        if self._current.auth_flow == AuthFlowType.API_KEY:
            key_input.focus()
        else:
            base_input.focus()

    def action_save_settings(self) -> None:
        if self._provider_id:
            self._save_settings()

    def action_validate_provider(self) -> None:
        if self._provider_id:
            self._validate_provider()

    @work(exclusive=True, thread=False)
    async def _validate_provider(self) -> None:
        provider_id = self._provider_id
        status = self.query_one("#provider-settings-status", Static)
        result = await asyncio.to_thread(validate_provider, provider_id)
        status.update(result.message)
        self.notify(result.message, severity="information" if result.success else "error")

    @work(exclusive=True, thread=False)
    async def _save_settings(self) -> None:
        provider_id = self._provider_id
        current = get_provider_settings(provider_id)
        key = self.query_one("#provider-settings-api-key", Input).value.strip()
        base_url = self.query_one("#provider-settings-base-url", Input).value.strip()
        status = self.query_one("#provider-settings-status", Static)

        try:
            if key:
                result = await asyncio.to_thread(
                    update_api_key,
                    provider_id,
                    key,
                    validate=True,
                )
                if not result.success:
                    status.update(result.message)
                    self.notify(result.message, severity="error")
                    return
                status.update(result.message)
                self.notify(result.message)
            elif current.auth_flow == AuthFlowType.API_KEY and not current.authenticated:
                message = f"API key is required for {current.display_name}."
                status.update(message)
                self.notify(message, severity="error")
                return

            if base_url and base_url != (current.base_url or ""):
                result = await asyncio.to_thread(
                    update_base_url,
                    provider_id,
                    base_url,
                    validate=True,
                )
                if not result.success:
                    status.update(result.message)
                    self.notify(result.message, severity="error")
                    return
                status.update(result.message)
                self.notify(result.message)
        finally:
            # The screen can be closed while validation is in flight, so a worker
            # finishing afterwards must not touch widgets that are already gone.
            if self.is_mounted:
                self._load_provider(provider_id)

        if self.is_mounted:
            self.dismiss(
                ProviderSettingsResult(
                    provider_id,
                    saved=True,
                    message="Provider settings saved.",
                ),
            )

    def action_reauthenticate(self) -> None:
        if self._provider_id:
            self._reauthenticate()

    @work(exclusive=True, thread=False)
    async def _reauthenticate(self) -> None:
        from rotaris_core.auth.manager import AuthManager

        provider_id = self._provider_id
        current = get_provider_settings(provider_id)
        if current.auth_flow == AuthFlowType.API_KEY:
            self.notify(
                "Enter a replacement API key and press Ctrl+S.",
                severity="information",
            )
            self.query_one("#provider-settings-api-key", Input).focus()
            return

        auth = AuthManager()
        auth.logout(provider_id)
        status = self.query_one("#provider-settings-status", Static)

        async def on_prompt(prompt: DeviceCodePrompt | str) -> None:
            if isinstance(prompt, DeviceCodePrompt):
                status.update(
                    f"Open {prompt.verification_uri} and enter code {prompt.user_code}.",
                )
            else:
                status.update(f"Open browser to authenticate: {prompt}")

        result = await auth.authenticate(provider_id, on_prompt=on_prompt)
        if result.success:
            self.notify(f"Reauthenticated {current.display_name}.")
            self._load_provider(provider_id)
            return
        self.notify(result.error or "Reauthentication failed.", severity="error")

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)
