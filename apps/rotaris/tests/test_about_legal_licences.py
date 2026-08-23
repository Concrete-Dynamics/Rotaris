"""About & Legal ▸ third-party notices: the bundle ships and opens offline.

SWR-3720 AC-007: the installed desktop app opens the same notice bundle the
release pipeline generated — from the local asset directory, without network."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, find_by_accessible_name, settle

from rotaris.third_party_licences import notice_bundle_path, read_notice_bundle
from rotaris.views.about_legal import AboutLegalPage

if TYPE_CHECKING:
    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_3720)
def test_the_bundle_ships_inside_the_desktop_assets() -> None:
    """The committed bundle covers the bundled fonts — the inventory the
    generator is required to produce."""
    assert notice_bundle_path().is_file(), "regenerate with packaging/third_party_licences.py"

    text = read_notice_bundle()
    assert text is not None
    for name in ("JetBrains Mono", "Manrope", "Space Grotesk", "Phosphor Icons"):
        assert name in text


@verifies(SWR.SWR_3720)
def test_about_and_legal_opens_the_bundle_as_a_local_file(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """AC-007: the button opens the shipped file, not a network URL."""
    calls: list[str] = []

    def record(url: QUrl) -> bool:
        calls.append(url.toString())
        return True

    monkeypatch.setattr(QDesktopServices, "openUrl", record)
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()
    qtbot.waitExposed(page)

    button = find_by_accessible_name(page, "Open third-party licenses", QPushButton)
    button.click()
    settle(qtbot)

    assert calls == [QUrl.fromLocalFile(str(notice_bundle_path())).toString()]
    assert page.bundle_error.isHidden()


@verifies(SWR.SWR_3720)
def test_about_and_legal_never_uses_the_network_for_the_bundle(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reading the bundle is a file read; only the user's click has an effect,
    and that effect is a local-file URL."""
    opened: list[QUrl] = []

    def record(url: QUrl) -> bool:
        opened.append(url)
        return True

    monkeypatch.setattr(QDesktopServices, "openUrl", record)
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()
    qtbot.waitExposed(page)

    assert opened == []
    assert read_notice_bundle() is not None
    click_by_name(qtbot, page, "Open third-party licenses", QPushButton)
    settle(qtbot)

    assert opened and opened[0].isLocalFile()
