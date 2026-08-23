"""About & Legal user flow: a fresh install reaches every legal entry.

SWR-3717 AC-001: the surface is reachable in every normal desktop state — no
authentication, no provider, no open workspace. The flow drives the real main
window the way a new user would: open the app, open Settings, switch to the
About tab, and walk every entry."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fakes import FakeRunBridge
from PySide6.QtCore import QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, settle

from rotaris import legal
from rotaris.models import sample_store
from rotaris.third_party_licences import notice_bundle_path
from rotaris.views.about_legal import AboutLegalPage
from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration


class _UrlRecorder:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, url: QUrl) -> bool:
        self.calls.append(url.toString())
        return True


def _open_about_tab(qtbot: QtBot, window: MainWindow) -> AboutLegalPage:
    window.show_view("settings")
    window.settings.set_active_tab("about")
    qtbot.waitUntil(
        lambda: window.settings.tabs.tabText(window.settings.tabs.currentIndex()) == "About"
    )
    settle(qtbot)
    page = window.settings.findChild(AboutLegalPage)
    assert page is not None
    return page


@verifies(SWR.SWR_3717)
def test_a_fresh_install_reaches_every_legal_entry(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A new user with no provider and no workspace opens About & Legal and can
    reach every legal document and the licence bundle."""
    recorder = _UrlRecorder()
    monkeypatch.setattr(QDesktopServices, "openUrl", recorder)
    window = MainWindow(sample_store(), run_bridge=FakeRunBridge())
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)

    page = _open_about_tab(qtbot, window)

    for document in legal.LEGAL_DOCUMENTS:
        click_by_name(qtbot, page, f"Open {document.name}", QPushButton)
        settle(qtbot)
    click_by_name(qtbot, page, "Open third-party licenses", QPushButton)
    settle(qtbot)

    assert recorder.calls == [document.url for document in legal.LEGAL_DOCUMENTS] + [
        QUrl.fromLocalFile(str(notice_bundle_path())).toString()
    ]


@verifies(SWR.SWR_3717)
def test_the_command_palette_offers_about_and_legal(qtbot: QtBot) -> None:
    """The permanent entry point is discoverable through the app's own command
    palette, and selecting it lands on the About tab."""
    window = MainWindow(sample_store(), run_bridge=FakeRunBridge())
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)

    commands = {command.id: command for command in window.commands.commands()}
    assert "about" in commands
    assert commands["about"].label == "About & Legal"

    window._show_about_legal()
    qtbot.waitUntil(
        lambda: window.settings.tabs.tabText(window.settings.tabs.currentIndex()) == "About"
    )
