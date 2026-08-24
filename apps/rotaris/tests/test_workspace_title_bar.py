"""Productive use: users can change projects directly from the desktop title bar.

Expected outcome: the displayed workspace is an accessible mouse and keyboard
action that requests the native project-folder chooser.
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt
from PySide6.QtTest import QSignalSpy
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name

from rotaris.models import sample_store
from rotaris.views.chrome import TitleBar, WorkspaceChip

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_2455)
def test_workspace_chip_requests_project_chooser_by_mouse_and_keyboard(qtbot) -> None:
    store = sample_store()
    bar = TitleBar(store)
    qtbot.addWidget(bar)
    bar.show()
    qtbot.waitExposed(bar)
    spy = QSignalSpy(bar.workspace_open_requested)

    assert bar.workspace_chip.accessibleName() == "Open project folder"
    assert store.workspace_path in bar.workspace_chip.accessibleDescription()
    assert bar.workspace_chip.focusPolicy() == Qt.FocusPolicy.StrongFocus

    click_by_name(qtbot, bar, "Open project folder", WorkspaceChip)
    assert spy.count() == 1

    bar.workspace_chip.setFocus()
    qtbot.keyClick(bar.workspace_chip, Qt.Key.Key_Return)
    assert spy.count() == 2


@verifies(SWR.SWR_3728)
def test_new_session_action_stays_accessible_in_the_minimum_width_title_bar(qtbot) -> None:
    """Productive use: a user can start a fresh session from any primary view.
    Expected outcome: the global title bar keeps an accessible, fully visible action at 1000px."""
    bar = TitleBar(sample_store())
    qtbot.addWidget(bar)
    bar.resize(1000, bar.height())
    bar.show()
    qtbot.waitExposed(bar)
    spy = QSignalSpy(bar.new_session_requested)

    button = bar.new_session_button
    assert button.text() == "New session"
    assert button.accessibleName() == "New session"
    assert button.accessibleDescription()
    assert button.toolTip() == "Start a new session"
    assert button.property("variant") == "secondary"
    assert button.property("compact") == "true"
    assert not button.icon().isNull()
    assert button.isVisible()
    assert bar.workspace_chip.geometry().right() < bar.session_chip.geometry().left()
    assert bar.session_chip.geometry().right() < button.geometry().left()
    assert button.geometry().right() <= bar.rect().right()

    click_by_name(qtbot, bar, "New session", QPushButton)
    assert spy.count() == 1

    button.setFocus()
    qtbot.keyClick(button, Qt.Key.Key_Space)
    assert spy.count() == 2
