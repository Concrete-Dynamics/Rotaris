"""Productive use: desktop users reopen or choose the project Rotaris should work in.
Expected outcome: startup resolves a real folder without inferring the process directory."""

from __future__ import annotations

from pathlib import Path

import pytest
from PySide6.QtCore import QSettings
from PySide6.QtWidgets import QFileDialog
from rotaris_core.reqtocode import SWR, verifies

from rotaris.main import LAST_WORKSPACE_KEY, select_startup_workspace

pytestmark = pytest.mark.unit


@verifies(SWR.SWR_2455)
def test_explicit_project_bypasses_the_folder_chooser_and_is_remembered(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Productive use: a user launches Rotaris with a project path.
    Expected outcome: that project opens directly and becomes the remembered workspace."""
    project = tmp_path / "project"
    project.mkdir()
    monkeypatch.setattr(
        "rotaris.main.QFileDialog.getExistingDirectory",
        lambda *_args: (_ for _ in ()).throw(AssertionError("folder chooser opened")),
    )
    settings = QSettings()

    selected = select_startup_workspace(str(project), settings=settings)

    assert selected == project.resolve()
    assert settings.value(LAST_WORKSPACE_KEY) == str(project.resolve())


@verifies(SWR.SWR_2455)
def test_existing_remembered_project_reopens_without_prompting(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Productive use: a returning desktop user reopens Rotaris.
    Expected outcome: the existing remembered project opens without another chooser."""
    project = tmp_path / "remembered"
    project.mkdir()
    settings = QSettings()
    settings.setValue(LAST_WORKSPACE_KEY, str(project))
    monkeypatch.setattr(
        "rotaris.main.QFileDialog.getExistingDirectory",
        lambda *_args: (_ for _ in ()).throw(AssertionError("folder chooser opened")),
    )

    assert select_startup_workspace(None, settings=settings) == project.resolve()


@verifies(SWR.SWR_2455)
def test_missing_remembered_project_opens_native_folder_chooser(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Productive use: a first-launch user chooses the project Rotaris should initialize.
    Expected outcome: a native directory chooser starts at home and returns the chosen folder."""
    project = tmp_path / "chosen"
    project.mkdir()
    settings = QSettings()
    settings.setValue(LAST_WORKSPACE_KEY, str(tmp_path / "removed"))
    call: tuple[object, ...] = ()

    def choose(*args: object) -> str:
        nonlocal call
        call = args
        return str(project)

    monkeypatch.setattr("rotaris.main.QFileDialog.getExistingDirectory", choose)

    assert select_startup_workspace(None, settings=settings) == project.resolve()
    assert call[0] is None
    assert call[1:3] == ("Open a project folder", str(Path.home()))
    assert call[3] == QFileDialog.Option.ShowDirsOnly
    assert settings.value(LAST_WORKSPACE_KEY) == str(project.resolve())


@verifies(SWR.SWR_2455)
def test_cancelling_folder_chooser_preserves_remembered_value(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Productive use: a user cancels project selection during launch.
    Expected outcome: startup stops cleanly and preserves the prior remembered value."""
    missing = tmp_path / "removed"
    settings = QSettings()
    settings.setValue(LAST_WORKSPACE_KEY, str(missing))
    monkeypatch.setattr("rotaris.main.QFileDialog.getExistingDirectory", lambda *_args: "")

    assert select_startup_workspace(None, settings=settings) is None
    assert settings.value(LAST_WORKSPACE_KEY) == str(missing)
