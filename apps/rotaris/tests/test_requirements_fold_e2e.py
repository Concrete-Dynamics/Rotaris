"""Productive use: a user folds the columns they do not need, and Rotaris keeps them folded.

Expected outcome: a board on a project nothing has been released in opens with its
pipeline showing, the user folds a column by clicking its heading, and after
quitting and reopening Rotaris against the same workspace the board is exactly
the one they left. A second workspace opens with its own folds and not theirs.

Driven through the window a user sees: the nav rail, the real controller, the
real bridge and the real engine over a requirement store on disk. The only thing
faked here is nothing at all — no run is needed, so no provider is either.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import QPushButton, QToolButton
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name, settle

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.main_window import MainWindow
from rotaris.views.requirements import RequirementsView

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.e2e

_REQUIREMENTS = (
    ("SWR-0201", "The board shows requirements"),
    ("SWR-0202", "The board can be filtered"),
    ("SWR-0203", "The board scrolls"),
)


def _workspace(root: Path) -> Path:
    """A workspace whose requirement store Rotaris can read, and has not delivered."""
    store_dir = root / "docs" / "requirements"
    store_dir.mkdir(parents=True)
    for req_id, title in _REQUIREMENTS:
        (store_dir / f"{req_id}-example.md").write_text(
            "---\n"
            f"req-id: {req_id}\n"
            "status: approved\n"
            "trace: required\n"
            "test: required\n"
            f'title: "{title}"\n'
            "date: 2026-08-19\n"
            "---\n\n"
            f"# {req_id} — {title}\n\n"
            "The product does the thing.\n",
            encoding="utf-8",
        )
    return root


def _open(qtbot: QtBot, workspace: Path) -> tuple[MainWindow, RequirementsView]:
    """Launch Rotaris on *workspace* and open Requirements the way a user does."""
    store = WorkspaceStore()
    service = ConfigService(workspace, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    window.resize(1000, 680)
    window.show()
    qtbot.waitExposed(window)
    controller = window.requirements_controller
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=30000):
        click_by_name(qtbot, window.nav, "Open Requirements", QToolButton)
    settle(qtbot)
    view = controller.view
    assert isinstance(view, RequirementsView), "opening Requirements did not install a board"
    qtbot.waitUntil(lambda: not view.populating, timeout=30000)
    settle(qtbot)
    return window, view


@verifies(SWR.SWR_3321)
def test_the_folds_a_user_leaves_are_the_board_they_come_back_to(
    qtbot: QtBot,
    tmp_path: Path,
) -> None:
    """Productive use: a user folds the columns their project does not use, quits, reopens.
    Expected outcome: the board opens the way they left it — and a different project on the
    same machine opens on its own folds, because which columns matter is the project's."""
    workspace = _workspace(tmp_path / "project-one")
    window, view = _open(qtbot, workspace)

    # Nothing has been released, so nothing has been past Backlog — and a pipeline
    # nobody has used stays on screen rather than folding itself into rails a
    # first-time user cannot read or drop on (SWR-3321).
    assert set(view.card_widgets) == {req_id for req_id, _ in _REQUIREMENTS}
    assert [column.key for column in view.columns if view.column_folded(column.key)] == []

    # The user folds the one column that is not empty, by clicking its heading.
    backlog = view.column_widget("backlog")
    assert backlog is not None
    click_by_name(qtbot, backlog, backlog.header.accessibleName(), QPushButton)
    settle(qtbot)
    assert view.column_folded("backlog")

    window.close()

    # The relaunch: a second window, the same workspace, the same settings on disk.
    _relaunched, reopened = _open(qtbot, workspace)
    assert reopened.column_folded("backlog"), "the fold did not survive the relaunch"

    # A different project on the same machine, opened by the same person.
    other = _workspace(tmp_path / "project-two")
    _second, elsewhere = _open(qtbot, other)
    assert not elsewhere.column_folded("backlog"), "one project's folds reached another"
