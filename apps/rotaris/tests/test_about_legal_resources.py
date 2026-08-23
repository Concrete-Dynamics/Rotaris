"""About & Legal resources: the seam where the page meets the outside world.

Every outbound effect — the system browser and the local licence bundle — goes
through two module seams, so a test can watch the exact request without a real
browser or a real file association. These tests drive the page the way a user
does: click a link, read the error, click again."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, find_by_accessible_name, settle

from rotaris import legal
from rotaris.third_party_licences import notice_bundle_path, read_notice_bundle
from rotaris.views.about_legal import AboutLegalPage

if TYPE_CHECKING:
    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration


class _UrlRecorder:
    def __init__(self, succeed: bool = True) -> None:
        self.succeed = succeed
        self.calls: list[str] = []

    def __call__(self, url: QUrl) -> bool:
        self.calls.append(url.toString())
        return self.succeed


@verifies(SWR.SWR_3717)
def test_a_legal_link_opens_the_canonical_url(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """AC-003: clicking a named document hands its canonical URL to the OS."""
    recorder = _UrlRecorder()
    monkeypatch.setattr(QDesktopServices, "openUrl", recorder)
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()
    qtbot.waitExposed(page)

    click_by_name(qtbot, page, "Open Privacy Policy", QPushButton)
    settle(qtbot)

    assert recorder.calls == [legal.LEGAL_DOCUMENTS[0].url]


@verifies(SWR.SWR_3717)
def test_a_failed_link_launch_reports_and_leaves_the_page_usable(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """AC-006: the failure is visible and non-blocking; the next click works."""
    recorder = _UrlRecorder(succeed=False)
    monkeypatch.setattr(QDesktopServices, "openUrl", recorder)
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()
    qtbot.waitExposed(page)

    click_by_name(qtbot, page, "Open EULA", QPushButton)
    settle(qtbot)

    assert not page.link_error.isHidden()
    assert "Could not open a browser" in page.link_error.text()
    assert "EULA" in page.link_error.text()

    # The surface stays usable: a successful launch clears the error.
    recorder.succeed = True
    click_by_name(qtbot, page, "Open EULA", QPushButton)
    settle(qtbot)
    assert page.link_error.isHidden()


@verifies(SWR.SWR_3717)
def test_the_licence_bundle_opens_as_a_local_file(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """AC-004: the third-party notices come from this build, offline."""
    recorder = _UrlRecorder()
    monkeypatch.setattr(QDesktopServices, "openUrl", recorder)
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()
    qtbot.waitExposed(page)

    bundle_button = find_by_accessible_name(page, "Open third-party licenses", QPushButton)
    assert read_notice_bundle() is not None, "regenerate the notice bundle"
    bundle_button.click()
    settle(qtbot)

    assert len(recorder.calls) == 1
    assert Path(QUrl(recorder.calls[0]).toLocalFile()) == notice_bundle_path()
    assert page.bundle_error.isHidden()


@verifies(SWR.SWR_3717)
def test_all_legal_urls_live_under_one_canonical_base() -> None:
    """The published documents are addressed through one base URL, so a site
    relocation is a one-line change in ``legal.py`` and nowhere else."""
    assert legal.LEGAL_DOCUMENTS
    for document in legal.LEGAL_DOCUMENTS:
        assert document.url.startswith(legal.LEGAL_BASE_URL + "/"), document.name
