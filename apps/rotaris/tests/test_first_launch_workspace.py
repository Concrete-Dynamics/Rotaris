"""Productive use: a first-launch user sees Rotaris before choosing a project folder.
Expected outcome: cancellation keeps the default desktop usable with a reminder and later choice."""

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
def test_first_launch_shows_default_desktop_before_project_onboarding(
    monkeypatch: pytest.MonkeyPatch, qtbot, tmp_path: Path
) -> None:
    """Productive use: a first-launch user postpones project selection and chooses later.
    Expected outcome: the visible default desktop survives cancellation and can open a project."""
    default_workspace = tmp_path / "default"
    default_workspace.mkdir()
    project = tmp_path / "project"
    project.mkdir()
    choices = iter(("", str(project)))
    windows = []
    scheduled_prompts = []
    chooser_visible_states: list[bool] = []
    create_window = desktop.create_window
    monkeypatch.chdir(default_workspace)

    def choose(parent, *_args):  # type: ignore[no-untyped-def]
        chooser_visible_states.append(parent.isVisible())
        return next(choices)

    monkeypatch.setattr("rotaris.main.QFileDialog.getExistingDirectory", choose)
    monkeypatch.setattr(QApplication, "exec", lambda _self: 0)
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_update_check", lambda _self: None
    )
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_cloud_credit", lambda _self: None
    )
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_git_refresh", lambda _self: None
    )

    def capture(workspace: Path, **kwargs):  # type: ignore[no-untyped-def]
        window = create_window(workspace, **kwargs)
        windows.append(window)
        qtbot.addWidget(window)
        return window

    monkeypatch.setattr(desktop, "create_window", capture)
    monkeypatch.setattr(
        desktop,
        "schedule_first_launch_workspace_prompt",
        lambda window: scheduled_prompts.append(window.prompt_for_initial_workspace),
    )

    assert desktop.main([]) == 0
    assert len(windows) == 1
    assert windows[0].store.workspace_path == str(default_workspace.resolve())
    assert windows[0].config_service.workspace == default_workspace.resolve()
    assert windows[0].isVisible()
    assert len(scheduled_prompts) == 1
    assert chooser_visible_states == []

    scheduled_prompts[0]()

    assert chooser_visible_states == [True]
    assert windows[0].isVisible()
    assert windows[0].toast.isVisible()
    assert "workspace path in the title bar" in windows[0].toast.text()

    click_by_name(qtbot, windows[0], "Open project folder", WorkspaceChip)

    assert len(windows) == 2
    assert chooser_visible_states == [True, True]
    assert windows[1].store.workspace_path == str(project.resolve())
    assert windows[1].config_service.workspace == project.resolve()
    assert QSettings().value(desktop.LAST_WORKSPACE_KEY) == str(project.resolve())
    assert windows[1].isVisible()
    assert not windows[0].isVisible()


@verifies(SWR.SWR_3715, SWR.SWR_3727)
def test_bundled_setup_is_scheduled_only_after_the_desktop_is_visible(
    monkeypatch: pytest.MonkeyPatch, qtbot, tmp_path: Path
) -> None:
    """Productive use: a first-launch user sees Rotaris before machine preparation begins.
    Expected outcome: setup owns the post-paint sequence and Git waits for its completion."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    windows = []
    scheduled: list[tuple[object, Path, bool]] = []
    git_starts: list[object] = []
    create_window = desktop.create_window
    monkeypatch.chdir(workspace)
    monkeypatch.setattr(QApplication, "exec", lambda _self: 0)
    monkeypatch.setattr("rotaris_core.setup.is_bundled_runtime", lambda: True)
    monkeypatch.setattr("rotaris_core.setup.setup_required", lambda: True)
    monkeypatch.setattr("rotaris_core.setup.activate_managed_tool_environment", lambda: {})
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_update_check", lambda _self: None
    )
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_cloud_credit", lambda _self: None
    )
    monkeypatch.setattr(
        "rotaris.views.main_window.MainWindow.start_git_refresh",
        lambda self: git_starts.append(self),
    )

    def capture(workspace_path: Path, **kwargs):  # type: ignore[no-untyped-def]
        window = create_window(workspace_path, **kwargs)
        windows.append(window)
        qtbot.addWidget(window)
        return window

    def capture_setup(window, workspace_path: Path, *, prompt_for_workspace: bool) -> None:
        assert window.isVisible()
        scheduled.append((window, workspace_path, prompt_for_workspace))

    monkeypatch.setattr(desktop, "create_window", capture)
    monkeypatch.setattr(desktop, "schedule_post_show_machine_setup", capture_setup)

    assert desktop.main([]) == 0
    assert len(windows) == 1
    assert scheduled == [(windows[0], workspace.resolve(), True)]
    assert git_starts == []
