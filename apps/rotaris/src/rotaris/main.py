"""Rotaris desktop entry point."""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from PySide6.QtCore import QSettings, QTimer
from PySide6.QtWidgets import QApplication, QFileDialog, QWidget
from rotaris_core.reqtocode import SWR, traces

from rotaris import __version__
from rotaris.models import WorkspaceStore, sample_store
from rotaris.services.theme_preference import install_theme_persistence
from rotaris.theme.brand import mark_icon
from rotaris.theme.fonts import register_bundled_fonts
from rotaris.views import MainWindow

LAST_WORKSPACE_KEY = "workspace/lastOpened"
FIRST_LAUNCH_PROMPT_DELAY_MS = 650


@dataclass(frozen=True)
class StartupWorkspace:
    """Workspace available for first paint and whether onboarding remains."""

    path: Path
    prompt_after_show: bool


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rotaris")
    parser.add_argument("workspace", nargs="?", default=None, help="workspace directory")
    parser.add_argument("--demo", action="store_true", help="open with representative data")
    parser.add_argument("--version", action="store_true", help="show the Rotaris version and exit")
    parser.add_argument(
        "--diagnostics",
        nargs="?",
        const="light",
        choices=("light", "deep"),
        default=None,
        help="record opt-in UI diagnostics (default mode: light)",
    )
    parser.add_argument(
        "--diagnostics-output",
        type=Path,
        help="base directory for the timestamped diagnostics run",
    )
    return parser


@traces(SWR.SWR_2455)
def choose_workspace_folder(
    *,
    parent: QWidget | None = None,
    initial_directory: Path | None = None,
) -> Path | None:
    """Offer the native project-folder chooser from a useful starting path."""
    selected = QFileDialog.getExistingDirectory(
        parent,
        "Open a project folder",
        str(initial_directory or Path.home()),
        QFileDialog.Option.ShowDirsOnly,
    )
    return Path(selected).resolve() if selected else None


@traces(SWR.SWR_2455)
def select_startup_workspace(
    workspace_argument: str | None,
    *,
    settings: QSettings | None = None,
    fallback_workspace: Path | None = None,
) -> StartupWorkspace:
    """Resolve the workspace for first paint and any post-show onboarding."""
    preferences = settings or QSettings()
    if workspace_argument:
        workspace = Path(workspace_argument).expanduser().resolve()
        preferences.setValue(LAST_WORKSPACE_KEY, str(workspace))
        return StartupWorkspace(workspace, prompt_after_show=False)

    remembered = str(preferences.value(LAST_WORKSPACE_KEY, "") or "")
    remembered_path = Path(remembered).expanduser() if remembered else None
    if remembered_path is not None and remembered_path.is_dir():
        return StartupWorkspace(remembered_path.resolve(), prompt_after_show=False)

    workspace = (fallback_workspace or Path.cwd()).expanduser().resolve()
    return StartupWorkspace(workspace, prompt_after_show=True)


@traces(SWR.SWR_2455)
def schedule_first_launch_workspace_prompt(window: MainWindow) -> None:
    """Defer onboarding long enough for the complete window to paint."""
    QTimer.singleShot(
        FIRST_LAUNCH_PROMPT_DELAY_MS,
        window,
        window.prompt_for_initial_workspace,
    )


@traces(SWR.SWR_3715, SWR.SWR_3727)
def schedule_post_show_machine_setup(
    window: MainWindow,
    workspace: Path,
    *,
    prompt_for_workspace: bool = False,
) -> None:
    """Run required machine setup after first paint, then continue onboarding."""

    def run() -> None:
        from rotaris.setup_coordinator import run_desktop_setup

        run_desktop_setup(workspace=workspace, parent=window)
        window.settings.refresh_machine_setup()
        window.start_git_refresh()
        if prompt_for_workspace:
            window.prompt_for_initial_workspace()

    QTimer.singleShot(FIRST_LAUNCH_PROMPT_DELAY_MS, window, run)


def create_window(
    workspace: Path, *, demo: bool = False, diagnostics: Any | None = None
) -> MainWindow:
    from rotaris.diagnostics import NoopDiagnostics

    recorder = diagnostics or NoopDiagnostics()
    if demo:
        return MainWindow(sample_store(), diagnostics=recorder)

    from rotaris.services.config_service import ConfigService
    from rotaris.services.git_service import GitService
    from rotaris.services.run_coordinator import RunCoordinator

    store = WorkspaceStore()
    config = ConfigService(workspace.resolve(), store)
    config.diagnostics = recorder
    with recorder.span("config.load"):
        config.load()
    git = GitService(workspace.resolve(), store)
    bridge = RunCoordinator(workspace.resolve(), store, config, diagnostics=recorder)
    return MainWindow(
        store,
        git_service=git,
        config_service=config,
        run_bridge=bridge,
        diagnostics=recorder,
    )


@traces(
    SWR.SWR_2001,
    SWR.SWR_2455,
    SWR.SWR_3701,
    SWR.SWR_3703,
    SWR.SWR_3715,
    SWR.SWR_3726,
)
def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.version:
        print(f"Rotaris {__version__}")
        return 0
    from rotaris.diagnostics import LiveDiagnostics, NoopDiagnostics, resolve_diagnostics_config

    try:
        diagnostics_config = resolve_diagnostics_config(
            args.diagnostics, args.diagnostics_output, os.environ
        )
    except ValueError as exc:
        parser.error(str(exc))
    instance = QApplication.instance()
    app = QApplication(sys.argv[:1]) if instance is None else cast("QApplication", instance)
    app.setApplicationName("Rotaris")
    app.setOrganizationName("Rotaris")
    # The taskbar, alt-tab strip and window chrome carry the same mark the
    # title bar paints (SWR-3726), never a platform default.
    app.setWindowIcon(mark_icon())
    # Before the first window, because Qt substitutes an unregistered family
    # silently at paint time rather than reporting it (SWR-3703). What it managed
    # to load is not checked: the stacks fall through to the host's faces, and an
    # interface in the wrong font is a defect where one that refuses to open is
    # an outage.
    register_bundled_fonts()
    # Through the manager rather than ``setStyleSheet``: the stylesheet is only
    # one of the four places Qt keeps theme state, and a later switch has to
    # reach widgets that style themselves. This restores the user's stored
    # choice and registers where subsequent ones are written (SWR-3701); the
    # application name and organisation are set first because that is what
    # decides which ``QSettings`` file the preference is read from.
    install_theme_persistence()
    from rotaris_core.setup import (
        activate_managed_tool_environment,
        is_bundled_runtime,
        setup_required,
    )

    activate_managed_tool_environment()
    machine_setup_after_show = is_bundled_runtime() and setup_required()
    if args.demo:
        startup = StartupWorkspace(Path(args.workspace or ".").resolve(), prompt_after_show=False)
    else:
        startup = select_startup_workspace(args.workspace)
    workspace = startup.path
    active_windows: list[MainWindow] = []

    def build_window(selected: Path) -> MainWindow:
        diagnostics = (
            LiveDiagnostics(diagnostics_config, selected)
            if diagnostics_config.enabled
            else NoopDiagnostics()
        )
        created = create_window(selected, demo=args.demo, diagnostics=diagnostics)
        diagnostics.attach_window(created)
        created.workspace_open_requested.connect(
            lambda path, source=created: replace_workspace(source, Path(path))
        )
        return created

    def activate_window(created: MainWindow, *, start_git: bool = True) -> None:
        created.show()
        if start_git:
            created.start_git_refresh()
        # After ``show`` and only here (SWR-3003, AC-005): the notification belongs on
        # a window the user can already see, and a check started from ``MainWindow``
        # itself would run in every test that builds one.
        created.start_update_check()
        # Same rule for the Rotaris Cloud balance (SWR-3013): started here, so a
        # test that builds a window never reads an account over the network.
        if not args.demo:
            created.start_cloud_credit()

    def replace_workspace(source: MainWindow, selected: Path) -> None:
        if not active_windows or source is not active_windows[0]:
            return
        try:
            replacement = build_window(selected)
        except Exception as exc:  # noqa: BLE001 - keep the active project usable
            source.notify(f"Could not open the selected project: {exc}", error=True)
            return
        replacement.show()
        if not source.close():
            replacement.close()
            return
        active_windows[0] = replacement
        QSettings().setValue(LAST_WORKSPACE_KEY, str(selected))
        activate_window(replacement)

    window = build_window(workspace)
    active_windows.append(window)
    activate_window(window, start_git=not machine_setup_after_show)
    if machine_setup_after_show:
        schedule_post_show_machine_setup(
            window,
            workspace,
            prompt_for_workspace=startup.prompt_after_show,
        )
    elif startup.prompt_after_show:
        schedule_first_launch_workspace_prompt(window)
    return app.exec()
