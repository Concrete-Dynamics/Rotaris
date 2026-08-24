"""Productive use: a user can start a fresh session from the Workspace screen.

Expected outcome: the leftmost action in the Workspace transcript context
toolbar is an accessible mouse-and-keyboard "New session" button that requests
a new session through the view's signal.
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt
from PySide6.QtTest import QSignalSpy
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name

from rotaris.models import sample_store
from rotaris.views.workspace import WorkspaceView

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_3728)
def test_new_session_action_stays_accessible_in_the_workspace_context_toolbar(qtbot) -> None:
    """Productive use: a user can start a fresh session from the Workspace screen.

    Expected outcome: the Workspace transcript context toolbar keeps an
    accessible, fully visible "New session" action at the left of the row, and
    mouse or keyboard activation requests a new session.
    """
    view = WorkspaceView(sample_store())
    qtbot.addWidget(view)
    view.resize(1000, 680)
    view.show()
    qtbot.waitExposed(view)
    spy = QSignalSpy(view.new_session_requested)

    button = view.new_session_button
    assert button.text() == "New session"
    assert button.accessibleName() == "New session"
    assert button.accessibleDescription()
    assert button.toolTip() == "Start a new session"
    assert button.property("variant") == "secondary"
    assert button.property("compact") == "true"
    assert not button.icon().isNull()
    assert button.isVisible()
    assert button.geometry().right() < view.sidebar_toggle.geometry().left()

    click_by_name(qtbot, view, "New session", QPushButton)
    assert spy.count() == 1

    button.setFocus()
    qtbot.keyClick(button, Qt.Key.Key_Space)
    assert spy.count() == 2
