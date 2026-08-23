"""Provider destination flow: a user reads how each provider connects before picking.

SWR-3721 E2E: from the main window, Settings → Providers shows the connection
path for Rotaris Cloud, a direct API and Claude Code — the same catalog data the
runtime uses — so the choice is informed before any authentication."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from fakes import FakeRunBridge
from PySide6.QtWidgets import QLabel
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name, settle

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_3721)
def test_a_user_compares_connection_paths_in_settings(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a new user opens Settings → Providers and sees how each
    provider connects before selecting one.
    Expected outcome: Rotaris Cloud, direct API and Claude Code rows each state
    their data path, sourced from the runtime catalog."""
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = SimpleNamespace(models={})
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings",
        lambda requested_id: SimpleNamespace(
            provider_id=requested_id,
            display_name="Rotaris Cloud (recommended)",
            authenticated=False,
        ),
    )
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.list_provider_settings",
        lambda: (
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
    store.providers = service._providers()

    window = MainWindow(store, run_bridge=FakeRunBridge())
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("settings")
    settle(qtbot)

    cloud = find_by_accessible_name(
        window.settings, "Rotaris Cloud (recommended) destination", QLabel, visible_only=True
    )
    assert "Rotaris-managed cloud service" in cloud.text()

    copilot = find_by_accessible_name(
        window.settings, "GitHub Copilot destination", QLabel, visible_only=True
    )
    assert "api.githubcopilot.com" in copilot.text()

    claude = find_by_accessible_name(
        window.settings, "Claude Code (subscription) destination", QLabel, visible_only=True
    )
    assert "Claude Agent SDK" in claude.text()
