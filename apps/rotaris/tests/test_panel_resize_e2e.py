"""Productive use: a user makes Rotaris fit their screen, and it stays that way.

Expected outcome: the workspace context sidebar the user drags wider is still
wider after Rotaris is closed and reopened — the panes are theirs, not the
layout's. And when the layout no longer suits them, one control in Settings →
Interface puts every pane in the application back to its default, on screen and
for the next launch both.

The window, the store wiring, the settings store, and the controls are all real;
only the LLM behind a run would be faked, and no run is needed here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, settle

from rotaris.models import sample_store
from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.e2e

#: Wide enough that the workspace is past its 1180px compact breakpoint, so the
#: panes are docked columns rather than overlay drawers.
_WINDOW = (1440, 900)


def _open(qtbot: QtBot, view: str = "workspace") -> MainWindow:
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.resize(*_WINDOW)
    window.show()
    qtbot.waitExposed(window)
    window.show_view(view)
    settle(qtbot)
    return window


def _widen_sidebar(window: MainWindow, width: int) -> None:
    """Drag the workspace's first divider to give the sidebar `width`."""
    panes = window.workspace.panes
    sizes = panes.sizes()
    sizes[1] -= width - sizes[0]
    sizes[0] = width
    panes.setSizes(sizes)
    panes.remember()


@verifies(SWR.SWR_3011)
def test_a_sidebar_widened_today_is_still_wide_after_a_relaunch(qtbot: QtBot) -> None:
    window = _open(qtbot)
    assert window.workspace.sidebar_panel.width() == 236

    _widen_sidebar(window, 380)
    assert window.workspace.sidebar_panel.width() == 380

    window.close()

    # The relaunch: a second window, the same settings store on disk.
    relaunched = _open(qtbot)
    assert relaunched.workspace.sidebar_panel.width() == 380


@verifies(SWR.SWR_3012)
def test_resetting_from_settings_returns_every_pane_to_its_default(qtbot: QtBot) -> None:
    window = _open(qtbot)
    _widen_sidebar(window, 400)
    # A second view, so the reset is shown to reach further than the screen the
    # user happens to be looking at.
    window.show_view("mission")
    settle(qtbot)
    mission = window.mission.body
    mission.setSizes([420, mission.sizes()[1] - 135])
    mission.remember()
    assert window.workspace.sidebar_panel.width() == 400
    assert mission.sizes()[0] == 420

    window.show_view("settings")
    window.settings.set_active_tab("interface")
    settle(qtbot)
    click_by_name(qtbot, window.settings, "Reset panel sizes", QPushButton)
    settle(qtbot)

    assert window.workspace.panes.sizes()[0] == 236
    assert mission.sizes()[0] == 285
    assert window.toast.isVisible()
    assert "Panel sizes reset" in window.toast.text()

    # And the reset outlives the window, rather than only clearing the screen.
    window.close()
    relaunched = _open(qtbot)
    assert relaunched.workspace.sidebar_panel.width() == 236
