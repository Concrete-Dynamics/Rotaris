"""What a resized pane remembers, and what it refuses to remember.

The productive question behind these tests is small and concrete: a user drags a
divider once, and every later launch of Rotaris has to open on the width they
chose — unless the layout has changed underneath it, in which case a stale
stored size must be ignored rather than half-applied.
"""

from __future__ import annotations

import pytest
from PySide6.QtCore import QSettings, Qt
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.services.panel_layout import (
    PANEL_GROUP,
    PanelLayoutService,
    panel_layout_service,
)
from rotaris.widgets.splitter import KEYBOARD_STEP_PX, PanelSplitter, PanelSplitterHandle

pytestmark = pytest.mark.unit


def _pane(minimum: int = 40) -> QWidget:
    pane = QWidget()
    pane.setMinimumWidth(minimum)
    return pane


def _splitter(
    qtbot,
    service: PanelLayoutService,
    *,
    key: str = "test.panes",
    defaults: tuple[int, ...] = (200, 0),
    panes: int = 2,
) -> PanelSplitter:
    splitter = PanelSplitter(key, Qt.Orientation.Horizontal, defaults=defaults, service=service)
    for _ in range(panes):
        splitter.addWidget(_pane())
    qtbot.addWidget(splitter)
    splitter.resize(800, 300)
    splitter.show()
    qtbot.waitExposed(splitter)
    return splitter


@verifies(SWR.SWR_3011)
def test_a_resized_pane_comes_back_the_same_width_next_launch(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service)
    assert splitter.sizes()[0] == 200

    splitter.setSizes([320, 474])
    splitter.remember()

    # "Next launch" is a second splitter reading the same settings store.
    reopened = _splitter(qtbot, service)
    assert reopened.sizes()[0] == 320


@verifies(SWR.SWR_3011)
def test_panel_sizes_are_global_rather_than_per_workspace(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service)
    splitter.setSizes([300, 494])
    splitter.remember()

    # Nothing about the key names a workspace: one value serves them all.
    assert QSettings().value(f"{PANEL_GROUP}/test.panes/state") is not None
    assert [key for key in QSettings().allKeys() if key.startswith("workspaces/")] == []


@verifies(SWR.SWR_3011)
def test_an_unknown_divider_keeps_its_defaults(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service, key="test.never-stored")

    assert splitter.restore() is False
    assert splitter.sizes()[0] == 200


@verifies(SWR.SWR_3011)
def test_a_size_stored_against_a_different_layout_is_ignored(qtbot) -> None:
    service = PanelLayoutService()
    two_panes = _splitter(qtbot, service, key="test.reshaped", defaults=(200, 0))
    two_panes.setSizes([340, 454])
    two_panes.remember()

    # The layout gained a pane since that size was written.
    three_panes = _splitter(
        qtbot,
        service,
        key="test.reshaped",
        defaults=(150, 0, 150),
        panes=3,
    )
    assert three_panes.restore() is False
    assert three_panes.sizes()[0] == 150


@verifies(SWR.SWR_3011)
def test_a_stretching_pane_shares_the_remainder_by_its_stretch_factor(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service, key="test.weighted", defaults=(0, 0))
    splitter.setStretchFactor(0, 1)
    splitter.setStretchFactor(1, 2)

    splitter.apply_defaults()

    left, right = splitter.sizes()
    assert right > left
    assert abs(right - 2 * left) <= 4


@verifies(SWR.SWR_3011)
def test_a_divider_cannot_be_dragged_far_enough_to_collapse_a_pane(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service, key="test.collapse")

    assert splitter.childrenCollapsible() is False
    splitter.setSizes([0, 794])
    assert splitter.sizes()[0] >= 40


@verifies(SWR.SWR_3011)
def test_a_divider_is_reachable_named_and_movable_from_the_keyboard(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service, key="test.keyboard")
    splitter.name_handles(["Resize the test panes"])
    handle = splitter.handle(1)

    assert isinstance(handle, PanelSplitterHandle)
    assert handle.focusPolicy() != Qt.FocusPolicy.NoFocus
    assert handle.accessibleName() == "Resize the test panes"

    before = splitter.sizes()[0]
    handle.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Right, Qt.KeyboardModifier.NoModifier)
    )
    assert splitter.sizes()[0] == before + KEYBOARD_STEP_PX

    handle.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Left, Qt.KeyboardModifier.NoModifier)
    )
    assert splitter.sizes()[0] == before

    splitter.setSizes([340, 454])
    handle.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Home, Qt.KeyboardModifier.NoModifier)
    )
    assert splitter.sizes()[0] == 200


@verifies(SWR.SWR_3011)
def test_a_keyboard_resize_stops_at_the_neighbouring_pane_minimum(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service, key="test.keyboard-bounds")
    handle = splitter.handle(1)
    splitter.setSizes([754, 40])

    handle.keyPressEvent(
        QKeyEvent(QKeyEvent.Type.KeyPress, Qt.Key.Key_Right, Qt.KeyboardModifier.NoModifier)
    )

    assert splitter.sizes()[1] >= 40


@verifies(SWR.SWR_3012)
def test_reset_clears_stored_sizes_and_restores_the_live_panes(qtbot) -> None:
    service = PanelLayoutService()
    splitter = _splitter(qtbot, service, key="test.reset")
    splitter.setSizes([360, 434])
    splitter.remember()

    service.reset_all()

    assert splitter.sizes()[0] == 200
    assert QSettings().value(f"{PANEL_GROUP}/test.reset/state") is None
    # And the next launch agrees, rather than the reset living only on screen.
    assert _splitter(qtbot, service, key="test.reset").sizes()[0] == 200


@verifies(SWR.SWR_3012)
def test_reset_reaches_every_divider_not_only_the_visible_one(qtbot) -> None:
    service = PanelLayoutService()
    first = _splitter(qtbot, service, key="test.reset-a")
    second = _splitter(qtbot, service, key="test.reset-b", defaults=(300, 0))
    first.setSizes([360, 434])
    first.remember()
    second.setSizes([120, 674])
    second.remember()

    service.reset_all()

    assert first.sizes()[0] == 200
    assert second.sizes()[0] == 300


@verifies(SWR.SWR_3011)
def test_the_application_service_is_one_object(qtbot) -> None:
    assert panel_layout_service() is panel_layout_service()
