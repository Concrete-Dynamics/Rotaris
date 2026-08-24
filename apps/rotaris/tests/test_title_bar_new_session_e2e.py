"""Productive use: users can create a session from the global desktop title bar.
Expected outcome: the visible action opens the real session-launch dialog from any primary view."""

from __future__ import annotations

import pytest
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QApplication, QDialog, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name

from rotaris.models import sample_store
from rotaris.views.main_window import MainWindow

pytestmark = pytest.mark.e2e


@verifies(SWR.SWR_3728)
def test_workspace_user_opens_new_session_dialog_from_global_title_bar(qtbot) -> None:
    """Productive use: a user working outside Overview starts a fresh session.
    Expected outcome: the global title-bar action opens the normal launch-options dialog."""
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.resize(1000, 680)
    window.show_view("workspace")
    window.show()
    qtbot.waitExposed(window)
    observed: list[str] = []

    def observe_and_cancel_dialog() -> None:
        dialog = QApplication.activeModalWidget()
        assert isinstance(dialog, QDialog)
        observed.append(dialog.windowTitle())
        dialog.reject()

    QTimer.singleShot(0, observe_and_cancel_dialog)
    click_by_name(qtbot, window, "New session", QPushButton)

    assert observed == ["Start session"]
    assert window.stack.currentWidget() is window.workspace
