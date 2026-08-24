"""Productive use: users can change projects directly from the desktop title bar.

Expected outcome: the displayed workspace is an accessible mouse and keyboard
action that requests the native project-folder chooser.
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import Qt
from PySide6.QtTest import QSignalSpy
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
