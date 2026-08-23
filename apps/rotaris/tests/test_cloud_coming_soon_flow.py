"""Rotaris Cloud readiness at the public desktop boundary."""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from fakes import FakeRunBridge
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import find_by_accessible_name, settle

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.e2e


@verifies(SWR.SWR_783)
def test_cloud_is_coming_soon_while_other_providers_stay_actionable(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: an alpha user can choose a provider that is ready today.
    Expected outcome: Settings explains and disables Rotaris Cloud while leaving
    another provider's health action available.
    """
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = SimpleNamespace(models={})
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.get_provider_settings",
        lambda requested_id: SimpleNamespace(
            provider_id=requested_id,
            display_name=(
                "Rotaris Cloud (recommended)"
                if requested_id == "concrete-cloud"
                else "GitHub Copilot"
            ),
            authenticated=False,
        ),
    )
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.list_provider_settings",
        lambda: (
            SimpleNamespace(
                provider_id="copilot",
                display_name="GitHub Copilot",
                authenticated=True,
            ),
        ),
    )
    store.providers = service._providers()

    window = MainWindow(store, config_service=service, run_bridge=FakeRunBridge())
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("settings")
    settle(qtbot)

    status = find_by_accessible_name(
        window.settings,
        "Rotaris Cloud (recommended) status",
        QLabel,
        visible_only=True,
    )
    cloud_check = find_by_accessible_name(
        window.settings,
        "Check Rotaris Cloud (recommended) health",
        QPushButton,
        visible_only=True,
    )
    cloud_auth = find_by_accessible_name(
        window.settings,
        "Authenticate Rotaris Cloud (recommended)",
        QPushButton,
        visible_only=True,
    )
    copilot_check = find_by_accessible_name(
        window.settings,
        "Check GitHub Copilot health",
        QPushButton,
        visible_only=True,
    )

    assert status.text() == "coming soon"
    assert cloud_check.toolTip() == "Rotaris Cloud is coming soon."
    assert cloud_auth.toolTip() == "Rotaris Cloud is coming soon."
    assert cloud_check.isEnabled() is False
    assert cloud_auth.isEnabled() is False
    assert copilot_check.isEnabled() is True
    assert all(
        button.text() != "Quick Start" for button in window.settings.findChildren(QPushButton)
    )
