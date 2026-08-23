"""About & Legal: product identity and every legal entry, from local data only.

SWR-3717 requires a surface that renders version, publisher and security contact,
names each legal document, and needs no network, provider or workspace to paint.
These tests build the page the way Settings builds it and read it through its
accessible names — the strings a screen reader announces."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QLabel, QPushButton
from rotaris_core.reqtocode import SWR, verifies

from rotaris import legal
from rotaris.models.store import WorkspaceStore
from rotaris.views.about_legal import AboutLegalPage
from rotaris.views.settings import SettingsView

if TYPE_CHECKING:
    import pytest
    from pytestqt.qtbot import QtBot


class _UrlRecorder:
    """Records every URL the OS was asked to open."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(self, url: object) -> bool:
        self.calls.append(str(url))
        return True


@verifies(SWR.SWR_3717)
def test_the_page_renders_identity_from_local_metadata(qtbot: QtBot) -> None:
    """AC-002: version, publisher and security contact are explicit and local."""
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()

    announced = {label.accessibleName() for label in page.findChildren(QLabel)}
    assert any(name.startswith("Version:") and "0.120.10" in name for name in announced)
    assert any(name.startswith("Publisher:") and legal.PUBLISHER in name for name in announced)
    assert any(
        name.startswith("Security contact:") and legal.SECURITY_CONTACT in name
        for name in announced
    )
    assert any(name.startswith("Build:") for name in announced)
    assert any(name.startswith("Installation:") for name in announced)


@verifies(SWR.SWR_3717)
def test_every_legal_document_is_named_and_openable(qtbot: QtBot) -> None:
    """AC-003: privacy, EULA, terms, AUP and withdrawal are individually named."""
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()

    buttons = {button.accessibleName(): button for button in page.findChildren(QPushButton)}
    for document in legal.LEGAL_DOCUMENTS:
        button = buttons.get(f"Open {document.name}")
        assert button is not None, f"no control for {document.name}"
        assert button.text() == document.name


@verifies(SWR.SWR_3717)
def test_rendering_performs_no_external_open(qtbot: QtBot, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-005: nothing reaches the OS browser until the user asks it to."""
    recorder = _UrlRecorder()
    monkeypatch.setattr(QDesktopServices, "openUrl", recorder)

    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()

    assert recorder.calls == []


@verifies(SWR.SWR_3717)
def test_every_control_is_keyboard_reachable_and_named(qtbot: QtBot) -> None:
    """AC-007: each control announces itself and takes keyboard focus."""
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()

    buttons = page.findChildren(QPushButton)
    assert buttons
    for button in buttons:
        assert button.accessibleName(), button.text()
        assert button.focusPolicy() != Qt.FocusPolicy.NoFocus, button.text()


@verifies(SWR.SWR_3717)
def test_the_about_tab_is_reachable_without_a_workspace_or_provider(qtbot: QtBot) -> None:
    """AC-001: Settings exposes About & Legal in every normal desktop state."""
    view = SettingsView(WorkspaceStore())
    qtbot.addWidget(view)
    view.show()

    assert view.set_active_tab("about") == "about"
    assert view.tabs.tabText(view.tabs.currentIndex()) == "About"


@verifies(SWR.SWR_3717)
def test_a_missing_licence_bundle_reports_an_error_state(
    qtbot: QtBot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A build without the bundle says so instead of opening nothing (AC-004)."""
    monkeypatch.setattr("rotaris.views.about_legal.read_notice_bundle", lambda: None)
    page = AboutLegalPage("0.120.10")
    qtbot.addWidget(page)
    page.show()

    page._open_bundle()

    assert not page.bundle_error.isHidden()
    assert "does not carry" in page.bundle_error.text()
