"""Productive use: a panel that rebuilds its contents while a run is streaming.
Expected outcome: what it drew last is gone before what it draws next arrives.

`takeAt` removes a widget from the layout; `deleteLater` only *posts* the
destruction. Between the two the widget is still parented, still visible and
still holding its old geometry, so it keeps painting until the event loop gets
round to it. That is one pass and invisible — until the loop is behind, at which
point the orphans pile up at the same coordinates and all paint, which is how
the sidebar came to draw its run label through the todo text and the inspector
stacked its context-ring labels (SWR-2454).

Asserted without spinning the event loop, deliberately: the whole defect is
about what is true *before* the deferred deletion runs.
"""

from __future__ import annotations

import pytest
from PySide6.QtWidgets import QLabel, QVBoxLayout, QWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.views.dashboard import _clear as _dashboard_clear
from rotaris.views.workspace import _clear as _workspace_clear

pytestmark = pytest.mark.unit


def _populated(qtbot) -> tuple[QWidget, QVBoxLayout, list[QLabel]]:
    """A shown panel holding four rows. The container is returned so the caller
    keeps it alive — Python dropping it takes the layout's C++ object with it."""
    container = QWidget()
    qtbot.addWidget(container)
    layout = QVBoxLayout(container)
    labels = [QLabel(f"row {index}") for index in range(4)]
    for label in labels:
        layout.addWidget(label)
    container.show()
    return container, layout, labels


@pytest.mark.parametrize("clear", [_workspace_clear, _dashboard_clear])
@verifies(SWR.SWR_2454)
def test_clearing_a_panel_takes_its_rows_off_screen_at_once(qtbot, clear) -> None:
    """Productive use: the sidebar redraws because the agent list changed.
    Expected outcome: the rows it held are not on screen any more, without
    waiting for the event loop to catch up with the deletions."""
    container, layout, labels = _populated(qtbot)

    clear(layout)

    assert container.isVisible()
    assert layout.count() == 0
    assert not any(label.isVisible() for label in labels), "a cleared row is still painting"
    assert not any(label.parentWidget() for label in labels), "a cleared row is still parented"


@verifies(SWR.SWR_2454)
def test_clearing_reaches_into_nested_layouts(qtbot) -> None:
    """Productive use: a panel row that is itself a little layout of chips.
    Expected outcome: the chips go too."""
    container = QWidget()
    qtbot.addWidget(container)
    outer = QVBoxLayout(container)
    inner = QVBoxLayout()
    chips = [QLabel("chip a"), QLabel("chip b")]
    for chip in chips:
        inner.addWidget(chip)
    outer.addLayout(inner)
    container.show()

    _workspace_clear(outer)

    assert outer.count() == 0
    assert not any(chip.isVisible() for chip in chips)
