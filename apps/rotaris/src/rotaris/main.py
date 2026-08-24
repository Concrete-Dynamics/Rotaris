"""Rotaris desktop entry point."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, cast

from PySide6.QtCore import QSettings
from PySide6.QtWidgets import QApplication, QFileDialog
from rotaris_core.reqtocode import SWR, traces

from rotaris import __version__
from rotaris.models import WorkspaceStore, sample_store
from rotaris.services.theme_preference import install_theme_persistence
from rotaris.theme.brand import mark_icon
from rotaris.theme.fonts import register_bundled_fonts
from rotaris.views import MainWindow

LAST_WORKSPACE_KEY = "workspace/lastOpened"


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
def select_startup_workspace(
    workspace_argument: str | None,
    *,
    settings: QSettings | None = None,
) -> Path | None:
    """Resolve an explicit, remembered, or newly chosen desktop workspace."""
    preferences = settings or QSettings()
    if workspace_argument:
        workspace = Path(workspace_argument).expanduser().resolve()
    else:
        remembered = str(preferences.value(LAST_WORKSPACE_KEY, "") or "")
        remembered_path = Path(remembered).expanduser() if remembered else None
        if remembered_path is not None and remembered_path.is_dir():
            return remembered_path.resolve()
        selected = QFileDialog.getExistingDirectory(
            None,
            "Open a project folder",
            str(Path.home()),
            QFileDialog.Option.ShowDirsOnly,
        )
        if not selected:
            return None
        workspace = Path(selected).resolve()
    preferences.setValue(LAST_WORKSPACE_KEY, str(workspace))
    return workspace


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
    with recorder.span("git.refresh"):
        git.refresh()
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
    from rotaris_core.setup import is_bundled_runtime

    if is_bundled_runtime():
        from rotaris.setup_coordinator import run_desktop_setup

        setup_workspace = Path(args.workspace) if args.workspace else None
        run_desktop_setup(workspace=setup_workspace)
    if args.demo:
        workspace = Path(args.workspace or ".").resolve()
    else:
        selected_workspace = select_startup_workspace(args.workspace)
        if selected_workspace is None:
            return 0
        workspace = selected_workspace
    diagnostics = (
        LiveDiagnostics(diagnostics_config, workspace)
        if diagnostics_config.enabled
        else NoopDiagnostics()
    )
    window = create_window(workspace, demo=args.demo, diagnostics=diagnostics)
    diagnostics.attach_window(window)
    window.show()
    # After ``show`` and only here (SWR-3003, AC-005): the notification belongs on
    # a window the user can already see, and a check started from ``MainWindow``
    # itself would run in every test that builds one.
    window.start_update_check()
    # Same rule for the Rotaris Cloud balance (SWR-3013): started here, so a
    # test that builds a window never reads an account over the network.
    if not args.demo:
        window.start_cloud_credit()
    return app.exec()
