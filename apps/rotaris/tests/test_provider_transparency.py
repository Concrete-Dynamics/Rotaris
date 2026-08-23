"""Provider transparency: Settings states where model traffic goes (SWR-3721).

The catalog is the one product source for provider identity, connection mode and
destination; ``ConfigService._providers()`` projects it into the store, and the
settings rows and the add-provider dialog render that projection. There is no
second, hand-written provider list in the UI, and these tests fail the moment
one appears."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QLabel
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name, settle

from rotaris.models.state import ProviderInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.provider_auth import AddProviderDialog
from rotaris.views.settings import SettingsView, _provider_destination_text

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration


def _service(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    settings: tuple[SimpleNamespace, ...] = (),
    cloud_authenticated: bool = False,
) -> ConfigService:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = SimpleNamespace(models={})
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings",
        lambda requested_id: SimpleNamespace(
            provider_id=requested_id,
            display_name="Rotaris Cloud (recommended)",
            authenticated=cloud_authenticated,
        ),
    )
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.list_provider_settings",
        lambda: settings,
    )
    return service


@verifies(SWR.SWR_3721)
def test_the_cloud_row_carries_catalog_metadata(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Rotaris Cloud is classified as Rotaris-managed traffic with its operator
    and privacy link, straight from the catalog."""
    service = _service(tmp_path, monkeypatch, cloud_authenticated=True)

    cloud = service._providers()[0]

    assert cloud.id == "concrete-cloud"
    assert cloud.connection_mode == "rotaris-cloud"
    assert cloud.destination == "rotaris.ai"
    assert cloud.operator_name == "Concrete Dynamics UG (haftungsbeschränkt)"
    assert cloud.privacy_url == "https://rotaris.ai/privacy"


@verifies(SWR.SWR_3721)
def test_direct_and_local_sdk_providers_are_classified(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """AC-002/AC-003: a fixed endpoint states operator and host; Claude Code is
    stated as a local SDK, never as a Rotaris HTTP endpoint."""
    service = _service(
        tmp_path,
        monkeypatch,
        settings=(
            SimpleNamespace(
                provider_id="copilot", display_name="GitHub Copilot", authenticated=True
            ),
            SimpleNamespace(
                provider_id="claude-code",
                display_name="Claude Code (subscription)",
                authenticated=True,
            ),
        ),
    )

    providers = {provider.id: provider for provider in service._providers()}

    assert providers["copilot"].connection_mode == "direct"
    assert providers["copilot"].operator_name == "GitHub"
    assert providers["copilot"].destination == "api.githubcopilot.com"
    assert providers["claude-code"].connection_mode == "local-sdk"
    assert providers["claude-code"].destination is None


@verifies(SWR.SWR_3721)
def test_a_custom_endpoint_states_the_configured_base_url(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """For a user-defined endpoint the destination is the URL the user entered."""
    service = _service(
        tmp_path,
        monkeypatch,
        settings=(
            SimpleNamespace(
                provider_id="openai-compatible--lab",
                display_name="Lab",
                authenticated=True,
                base_url="https://lab.example.com/v1",
            ),
        ),
    )

    lab = {provider.id: provider for provider in service._providers()}["openai-compatible--lab"]

    assert lab.connection_mode == "custom"
    assert lab.destination == "https://lab.example.com/v1"
    assert lab.operator_name is None


@verifies(SWR.SWR_3721)
def test_the_destination_statement_covers_every_mode() -> None:
    """The one-line statement renders each mode without an independent table."""
    assert "Claude Agent SDK" in _provider_destination_text(
        ProviderInfo("claude-code", "Claude Code (subscription)", True, connection_mode="local-sdk")
    )
    assert "Rotaris-managed cloud service" in _provider_destination_text(
        ProviderInfo("concrete-cloud", "Rotaris Cloud", True, connection_mode="rotaris-cloud")
    )
    direct = _provider_destination_text(
        ProviderInfo(
            "copilot",
            "GitHub Copilot",
            True,
            connection_mode="direct",
            destination="api.githubcopilot.com",
            operator_name="GitHub",
        )
    )
    assert "Direct provider API" in direct
    assert "GitHub" in direct
    assert "api.githubcopilot.com" in direct
    custom = _provider_destination_text(
        ProviderInfo(
            "openai-compatible--lab",
            "Lab",
            True,
            connection_mode="custom",
            destination="https://lab.example.com/v1",
        )
    )
    assert "Custom endpoint" in custom
    assert "https://lab.example.com/v1" in custom


@verifies(SWR.SWR_3721)
def test_settings_rows_render_the_catalog_destination(qtbot: QtBot) -> None:
    """The settings row paints the statement next to the provider it describes."""
    store = WorkspaceStore()
    store.providers = [
        ProviderInfo(
            "concrete-cloud",
            "Rotaris Cloud (recommended)",
            True,
            connection_mode="rotaris-cloud",
            destination="rotaris.ai",
            operator_name="Concrete Dynamics UG (haftungsbeschränkt)",
        ),
        ProviderInfo(
            "copilot",
            "GitHub Copilot",
            True,
            connection_mode="direct",
            destination="api.githubcopilot.com",
            operator_name="GitHub",
        ),
        ProviderInfo(
            "claude-code",
            "Claude Code (subscription)",
            True,
            connection_mode="local-sdk",
            operator_name="Anthropic",
        ),
    ]
    view = SettingsView(store)
    qtbot.addWidget(view)
    view.show()
    qtbot.waitExposed(view)
    settle(qtbot)

    copilot = find_by_accessible_name(view, "GitHub Copilot destination", QLabel, visible_only=True)
    assert "api.githubcopilot.com" in copilot.text()
    claude = find_by_accessible_name(
        view, "Claude Code (subscription) destination", QLabel, visible_only=True
    )
    assert "Claude Agent SDK" in claude.text()
    cloud = find_by_accessible_name(
        view, "Rotaris Cloud (recommended) destination", QLabel, visible_only=True
    )
    assert "Rotaris-managed cloud service" in cloud.text()


@verifies(SWR.SWR_3721)
def test_the_add_dialog_reads_destinations_from_the_catalog(qtbot: QtBot) -> None:
    """Before configuration completes, the dialog states where the selected
    provider sends traffic — taken from the runtime catalog, not from dialog copy."""
    dialog = AddProviderDialog(
        builtin_providers=[
            ("copilot", "GitHub Copilot", "device_code"),
            ("claude-code", "Claude Code (subscription)", "claude_subscription"),
        ]
    )
    qtbot.addWidget(dialog)
    dialog.show()

    assert "base URL you enter below" in dialog.destination_hint.text()

    dialog.provider_combo.setCurrentIndex(1)  # GitHub Copilot
    assert "Direct provider API — GitHub, destination: api.githubcopilot.com" in (
        dialog.destination_hint.text()
    )

    dialog.provider_combo.setCurrentIndex(2)  # Claude Code
    assert "Claude Agent SDK" in dialog.destination_hint.text()
