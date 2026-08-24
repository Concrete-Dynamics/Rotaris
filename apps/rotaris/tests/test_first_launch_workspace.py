"""Productive use: a first-launch user opens Rotaris on a chosen project folder.
Expected outcome: the desktop initializes against that folder and never against AppData or cwd."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import QSettings
from PySide6.QtWidgets import QApplication
from rotaris_core.reqtocode import SWR, verifies
from ui_query import click_by_name

import rotaris.main as desktop
from rotaris.views.chrome import WorkspaceChip

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.e2e


@verifies(SWR.SWR_2455)
def test_first_launch_chooses_project_before_creating_the_desktop(
    monkeypatch: pytest.MonkeyPatch, qtbot, tmp_path: Path
) -> None:
    """Productive use: a first-launch user selects a project in the native folder chooser.
    Expected outcome: the real desktop and services are wired to the selected project."""
    project = tmp_path / "project"
    project.mkdir()
    second_project = tmp_path / "second-project"
    second_project.mkdir()
    choices = iter((project, second_project))
    windows = []
    create_window = desktop.create_window

    monkeypatch.setattr(
        "rotaris.main.QFileDialog.getExistingDirectory",
        lambda *_args: str(next(choices)),
    )
    monkeypatch.setattr(QApplication, "exec", lambda _self: 0)
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_update_check", lambda _self: None
    )
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_cloud_credit", lambda _self: None
    )

    def capture(workspace: Path, **kwargs):  # type: ignore[no-untyped-def]
        window = create_window(workspace, **kwargs)
        windows.append(window)
        qtbot.addWidget(window)
        return window

    monkeypatch.setattr(desktop, "create_window", capture)

    assert desktop.main([]) == 0
    assert len(windows) == 1
    assert windows[0].store.workspace_path == str(project.resolve())
    assert windows[0].config_service.workspace == project.resolve()

    click_by_name(qtbot, windows[0], "Open project folder", WorkspaceChip)

    assert len(windows) == 2
    assert windows[1].store.workspace_path == str(second_project.resolve())
    assert windows[1].config_service.workspace == second_project.resolve()
    assert QSettings().value(desktop.LAST_WORKSPACE_KEY) == str(second_project.resolve())
    assert windows[1].isVisible()
    assert not windows[0].isVisible()


@verifies(SWR.SWR_2455)
def test_cancelled_first_launch_creates_no_project_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user postpones choosing a project.
    Expected outcome: launch exits cleanly before any project service or window is created."""
    monkeypatch.setattr("rotaris.main.QFileDialog.getExistingDirectory", lambda *_args: "")
    monkeypatch.setattr(
        desktop,
        "create_window",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("window created")),
    )

    assert desktop.main([]) == 0
