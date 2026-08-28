"""Productive use: desktop users reopen or choose the project Rotaris should work in.
Expected outcome: startup resolves a usable first-paint folder and onboarding intent."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import QSettings
from rotaris_core.reqtocode import SWR, verifies

from rotaris.main import (
    FIRST_LAUNCH_PROMPT_DELAY_MS,
    LAST_WORKSPACE_KEY,
    schedule_first_launch_workspace_prompt,
    select_startup_workspace,
)

if TYPE_CHECKING:
    from pathlib import Path

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

    startup = select_startup_workspace(str(project), settings=settings)

    assert startup.path == project.resolve()
    assert not startup.prompt_after_show
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

    startup = select_startup_workspace(None, settings=settings)

    assert startup.path == project.resolve()
    assert not startup.prompt_after_show


@verifies(SWR.SWR_2455)
def test_missing_remembered_project_uses_fallback_and_defers_onboarding(
    tmp_path: Path,
) -> None:
    """Productive use: a first-launch user sees a usable desktop before project onboarding.
    Expected outcome: startup uses the fallback and requests a prompt after first paint."""
    fallback = tmp_path / "default"
    fallback.mkdir()
    missing = tmp_path / "removed"
    settings = QSettings()
    settings.setValue(LAST_WORKSPACE_KEY, str(missing))

    startup = select_startup_workspace(
        None,
        settings=settings,
        fallback_workspace=fallback,
    )

    assert startup.path == fallback.resolve()
    assert startup.prompt_after_show
    assert settings.value(LAST_WORKSPACE_KEY) == str(missing)


@verifies(SWR.SWR_2455)
def test_first_launch_fallback_defaults_to_process_working_directory(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Productive use: a first-launch user can use Rotaris's prior default workspace.
    Expected outcome: the process working directory backs the first visible desktop."""
    workspace = tmp_path / "working"
    workspace.mkdir()
    monkeypatch.chdir(workspace)

    startup = select_startup_workspace(None, settings=QSettings())

    assert startup.path == workspace.resolve()
    assert startup.prompt_after_show


@verifies(SWR.SWR_2455)
def test_first_launch_onboarding_is_deferred_after_window_activation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a first-launch user sees the complete desktop before onboarding.
    Expected outcome: project selection is scheduled after a visible-paint delay."""
    calls: list[tuple[int, object, object]] = []

    class Window:
        def prompt_for_initial_workspace(self) -> None:
            pass

    window = Window()
    monkeypatch.setattr(
        "rotaris.main.QTimer.singleShot",
        lambda delay, context, callback: calls.append((delay, context, callback)),
    )

    schedule_first_launch_workspace_prompt(window)  # type: ignore[arg-type]

    # The window is passed as Qt's *context* object, so a window closed before
    # the delay elapses cancels the prompt instead of firing it at a destroyed
    # widget. Asserted rather than assumed: the crash it prevents happens in
    # native code, where a test can only observe it as a dead worker.
    assert calls == [(FIRST_LAUNCH_PROMPT_DELAY_MS, window, window.prompt_for_initial_workspace)]
    assert FIRST_LAUNCH_PROMPT_DELAY_MS > 0
