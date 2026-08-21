"""Rotaris application window and cross-view workflow wiring."""

from __future__ import annotations

from datetime import datetime
from functools import partial
from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QSettings, Qt, QTimer, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QMainWindow,
    QMessageBox,
    QProgressDialog,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.actions import CommandPaletteDialog, CommandRegistry
from rotaris.models.state import (
    CheckpointList,
    NoticeSeverity,
    RunUiState,
    TranscriptEvent,
    UiNotice,
)
from rotaris.services.terminal_stream_bridge import TerminalStreamBridge
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.views.agent_window import AgentWindow
from rotaris.views.chrome import NavRail, StatusBar, TitleBar
from rotaris.views.dashboard import DashboardView
from rotaris.views.git import GitView
from rotaris.views.library import LibraryView
from rotaris.views.mission import MissionView
from rotaris.views.settings import SettingsView
from rotaris.views.slash_catalogue import build_slash_catalogue
from rotaris.views.terminal_window import TerminalWindow
from rotaris.views.workspace import WorkspaceView
from rotaris.widgets import (
    CheckpointRestoreDialog,
    ConfirmImpactDialog,
    HookTrustDialog,
    InlineBanner,
    MergeOrderDialog,
)
from rotaris.widgets.project_init_dialog import INITIALIZE as INIT_INTENT_INITIALIZE
from rotaris.widgets.project_init_dialog import STATE_PROMPT as INIT_STATE_PROMPT
from rotaris.widgets.project_init_dialog import ProjectInitDialog

if TYPE_CHECKING:
    from PySide6.QtGui import QCloseEvent, QResizeEvent
    from PySide6.QtWidgets import QListWidgetItem

    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme


@traces(
    SWR.SWR_2002,
    SWR.SWR_2025,
    SWR.SWR_2029,
    SWR.SWR_2030,
    SWR.SWR_2044,
    SWR.SWR_2094,
    SWR.SWR_2123,
    SWR.SWR_2404,
    SWR.SWR_2413,
    SWR.SWR_2414,
    SWR.SWR_2437,
    SWR.SWR_2701,
    SWR.SWR_2704,
    SWR.SWR_2802,
    SWR.SWR_2805,
)
class MainWindow(Themed, QMainWindow):
    """Owns six primary views and auxiliary persona windows."""

    VIEW_ORDER = (
        "dashboard",
        "workspace",
        "mission",
        "requirements",
        "git",
        "library",
        "settings",
    )

    def __init__(
        self,
        store: WorkspaceStore,
        *,
        git_service: Any | None = None,
        config_service: Any | None = None,
        run_bridge: Any | None = None,
        diagnostics: Any | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self.store = store
        self.git_service = git_service
        self.config_service = config_service
        self.run_bridge = run_bridge
        self._integration_bridge: Any | None = None
        self._integration_progress_dialog: QProgressDialog | None = None
        self._merged_session_ids: list[str] = []
        self._checkpoint_bridge: Any | None = None
        self._checkpoint_progress_dialog: QProgressDialog | None = None
        #: The session whose checkpoints are wanted, and the restore awaiting a
        #: preview — both single-slot, because the bridge runs one at a time.
        self._checkpoint_session_wanted = ""
        self._checkpoint_load_scheduled = False
        self._pending_restore: tuple[str, int] | None = None
        if diagnostics is None:
            from rotaris.diagnostics import NoopDiagnostics

            diagnostics = NoopDiagnostics()
        self.diagnostics = diagnostics
        self._resume_session_id: str | None = None
        self._pending_worktree_isolation: Any | None = None
        # SWR-2507 per-session sandbox: the launch dialog's answer waiting for
        # the next submission, the verdict the host gave that launch, the mode
        # a launch in flight asked for, and the verdict each started run got.
        self._pending_sandbox_mode: str | None = None
        self._pending_sandbox_verdict: tuple[bool, str] = (False, "")
        self._launch_sandbox_mode = ""
        self._sandbox_by_session: dict[str, tuple[bool, str]] = {}
        self._last_prompt = ""
        self._auth_fallback_attempted = False
        self._auth_dialog: Any | None = None
        self._reauth_prompt: Any | None = None
        self._primary_reauth_model = ""
        self._prompt_persistence: Any | None = None
        self._project_init_dialog: ProjectInitDialog | None = None
        self._project_init_worker: Any | None = None
        self._project_init_tasks: tuple[Any, ...] = ()
        self._project_init_auto_opened = False
        # SWR-3003. Created by ``start_update_check`` and by nothing else: a
        # window built in a test must not open a socket, and every desktop test
        # builds one.
        self._update_bridge: Any | None = None
        self._update_offer: Any | None = None
        # SWR-3013. Same rule as the update bridge: created by
        # ``start_cloud_credit`` and by nothing else, so a window built in a test
        # never reaches the network on its own.
        self._cloud_bridge: Any | None = None
        # Named apart from ``_update_applied``, the slot: an attribute of the same
        # name shadows the bound method and the signal connects to ``None``.
        self._applied_update: Any | None = None
        self._update_notice_id = ""
        self._update_progress_percent = -1
        if config_service is not None and hasattr(config_service, "workspace"):
            from rotaris.services.prompt_persistence import PromptPersistence

            self._prompt_persistence = PromptPersistence(config_service.workspace, store)
            self._prompt_persistence.load()
        self._ui_settings = QSettings()
        self._restore_ui_state()
        self.agent_windows: dict[str, AgentWindow] = {}
        self.artifact_dialogs: dict[str, Any] = {}
        # One bridge for the whole window: the transcript preview and the
        # pop-out read the same screens, which is what keeps them consistent.
        self.terminal_streams = TerminalStreamBridge(self)
        self.terminal_window: TerminalWindow | None = None
        self.setObjectName("mainWindow")
        self.setWindowTitle("Rotaris")
        self.resize(1440, 900)
        self.setMinimumSize(1000, 680)

        root = QWidget()
        root.setObjectName("appRoot")
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        self.title_bar = TitleBar(store)
        layout.addWidget(self.title_bar)
        self.notice_banner = InlineBanner()
        self.notice_banner.action_requested.connect(self._handle_notice_action)
        # Ordered: remember the version before the notice that names it is cleared.
        self.notice_banner.dismissed.connect(self._remember_dismissed_update)
        self.notice_banner.dismissed.connect(self.store.clear_notice)
        layout.addWidget(self.notice_banner)

        center = QHBoxLayout()
        center.setContentsMargins(0, 0, 0, 0)
        center.setSpacing(0)
        self.nav = NavRail()
        self.nav.view_selected.connect(self.show_view)
        center.addWidget(self.nav)
        self.stack = QStackedWidget()
        center.addWidget(self.stack, 1)
        layout.addLayout(center, 1)
        self.status_bar = StatusBar(store)
        layout.addWidget(self.status_bar)

        self.dashboard = DashboardView(store)
        self.workspace = WorkspaceView(
            store,
            diagnostics=self.diagnostics,
            run_bridge=self.run_bridge,
        )
        self.mission = MissionView(store)
        # SWR-3315: the requirement feature is wired into this window exactly
        # once — the controller is constructed and its surface is registered as
        # a view. Every signal connection the requirements area needs hangs off
        # `RequirementsController`, so the slices that follow (actions, review,
        # queue) grow there and never here.
        from rotaris.services.requirements_controller import RequirementsController

        self.requirements_controller = RequirementsController(
            store,
            workspace=getattr(config_service, "workspace", None),
            parent=self,
        )
        self._attach_session_launcher(config_service)
        self.requirements = self.requirements_controller.surface
        self.git = GitView(store)
        self.library = LibraryView(store)
        self.settings = SettingsView(store, config_service)
        self.settings.set_active_tab(self._settings_tab)
        self.store.mark_settings_saved()
        self.views = {
            "dashboard": self.dashboard,
            "workspace": self.workspace,
            "mission": self.mission,
            "requirements": self.requirements,
            "git": self.git,
            "library": self.library,
            "settings": self.settings,
        }
        for view_id in self.VIEW_ORDER:
            self.stack.addWidget(self.views[view_id])
        self.workspace._refresh_run_state()

        self.toast = QLabel(root)
        self.toast.setObjectName("toast")
        # Which border the toast wears is a property of the last message, not of
        # the theme, so it is remembered here and re-read whenever either changes.
        self._toast_error = False
        self.toast.hide()
        self._toast_timer = QTimer(self)
        self._toast_timer.setSingleShot(True)
        self._toast_timer.timeout.connect(self.toast.hide)

        self.dashboard.request_view.connect(self.show_view)
        self.dashboard.sessions_button.clicked.connect(self._show_sessions)
        self.dashboard.new_session_requested.connect(self._new_session)
        self.dashboard.proposal_action_requested.connect(self._set_proposal_status)
        self.dashboard.proposal_open_requested.connect(self._open_proposal_in_library)
        self.dashboard.session_focus_requested.connect(self._focus_session)
        self.dashboard.session_continue_requested.connect(self._continue_session)
        self.dashboard.agent_tree.agent_selected.connect(self._agent_tree_selected)
        self.dashboard.cloud_sign_in_requested.connect(self._cloud_sign_in)
        self.dashboard.cloud_account_open_requested.connect(self._open_rotaris_cloud)
        self.dashboard.cloud_refresh_requested.connect(self.refresh_cloud_credit)
        self.workspace.prompt_submitted.connect(self._submit_prompt)
        self.workspace.prompt_queued.connect(self._queue_prompt)
        self.workspace.slash_error.connect(self._report_slash_error)
        self.workspace.session_focus_requested.connect(self._focus_session)
        self.workspace.queued_prompt_edit_requested.connect(self._edit_queued_prompt)
        self.workspace.queued_prompt_delete_requested.connect(self._delete_queued_prompt)
        self.workspace.agent_tree.agent_selected.connect(self._agent_tree_selected)
        self.workspace.cancel_requested.connect(self._cancel_agent)
        self.workspace.run_cancel_requested.connect(self._cancel_run)
        self.workspace.run_pause_requested.connect(self._pause_run)
        self.workspace.compression_requested.connect(self._compress_context)
        self.workspace.clear_transcript_requested.connect(self._clear_transcript)
        self.workspace.todo_renamed.connect(
            lambda task_id, text: self._edit_todo("rename", task_id, text)
        )
        self.workspace.todo_removed.connect(lambda task_id: self._edit_todo("remove", task_id))
        self.workspace.todo_added.connect(
            lambda phase_id, text: self._edit_todo("add", phase_id, text)
        )
        self.workspace.steer_requested.connect(self.open_agent_window)
        self.workspace.agent_popout_requested.connect(self.open_agent_window)
        self.workspace.terminal_popout_requested.connect(self.open_terminal_window)
        self.workspace.transcript_scroll.set_terminal_screens(self.terminal_streams.peek)
        self.terminal_streams.stream_changed.connect(self._on_terminal_stream_changed)
        self.terminal_streams.screen_updated.connect(self._on_terminal_screen_updated)
        self.workspace.artifact_open_requested.connect(self.open_artifact)
        self.mission.open_agent_requested.connect(self.open_agent_window)
        self.mission.cancel_requested.connect(self._cancel_agent)
        self.mission.pause_requested.connect(self._pause_agent)
        self.library.prompt_selected.connect(self._load_prompt)
        self.library.artifact_open_requested.connect(self.open_artifact)
        self.library.proposal_action_requested.connect(self._set_proposal_status)
        self.library.proposal_edit_requested.connect(self._edit_proposal)
        self.library.proposal_delete_requested.connect(self._delete_proposal)
        self.git.refresh_requested.connect(self.refresh_git)
        self.git.create_worktree_requested.connect(self._create_worktree)
        self.git.merge_worktrees_requested.connect(self._merge_worktrees)
        self.git.delete_worktree_requested.connect(self._delete_worktree)
        self.git.checkpoints_requested.connect(self._load_checkpoints)
        self.git.checkpoint_restore_requested.connect(self._restore_checkpoint)
        self.settings.hook_trust_review_requested.connect(self._review_workspace_hooks)
        self.settings.cloud_credit_refresh_requested.connect(self.refresh_cloud_credit)
        self.store.run_state_changed.connect(self._run_state_changed_for_credit)
        self.settings.save_requested.connect(self._save_settings)
        self.settings.discard_requested.connect(self._discard_settings)
        self.settings.agent_popout_changed.connect(self.set_agent_popout)
        self.settings.terminal_popout_changed.connect(self.set_terminal_popout)
        self.settings.auto_collapse_tools_changed.connect(self._persist_auto_collapse_tools)
        self.settings.group_tool_calls_changed.connect(self._persist_group_tool_calls)
        self.settings.worktree_cleanup_changed.connect(self._persist_worktree_cleanup_prompt)
        self.settings.active_tab_changed.connect(self._persist_settings_tab)
        self.settings.panel_sizes_reset_requested.connect(self._reset_panel_sizes)
        # One modal path, two entry points: SWR-2805's manual triggers state the
        # intent and the window opens the same SWR-2802 prompt for both.
        self.settings.initialize_project_requested.connect(self._request_project_initialization)
        self.workspace.initialize_project_requested.connect(self._request_project_initialization)
        self.workspace.permission_mode_selected.connect(self._on_permission_mode_selected)
        self.store.initialization_changed.connect(self._on_initialization_changed)
        self.store.notice_changed.connect(self._refresh_notice)
        # The debounced draft, not every keystroke: this writes QSettings.
        self.workspace.composer.draft_changed.connect(self._persist_composer_draft)
        self.store.library_changed.connect(self._persist_prompts)

        if run_bridge is not None:
            run_bridge.run_started.connect(self._run_started)
            run_bridge.run_finished.connect(self._run_finished)
            run_bridge.run_failed.connect(self._run_failed)
            if hasattr(run_bridge, "store_updated"):
                run_bridge.store_updated.connect(self._store_updated)
            if hasattr(run_bridge, "refresh_failed"):
                run_bridge.refresh_failed.connect(lambda message: self.notify(message, error=True))
            if hasattr(run_bridge, "compression_finished"):
                run_bridge.compression_finished.connect(self._compression_finished)
            # Present only on a coordinator: lifecycle for every run, not just
            # the focused one.
            if hasattr(run_bridge, "session_run_started"):
                # Every run, focused or not, so a background session keeps the
                # sandbox verdict it launched with when focus comes back to it.
                run_bridge.session_run_started.connect(self._record_sandbox_verdict)
            if hasattr(run_bridge, "session_run_finished"):
                run_bridge.session_run_finished.connect(self._session_run_finished)
            if hasattr(run_bridge, "session_run_failed"):
                run_bridge.session_run_failed.connect(self._session_run_failed)
            if hasattr(run_bridge, "focus_changed"):
                run_bridge.focus_changed.connect(self._focus_changed)
        if config_service is not None and git_service is not None:
            from rotaris.services.worktree_integration import WorktreeIntegrationBridge

            bridge = WorktreeIntegrationBridge(git_service.workspace, config_service, self)
            bridge.progress.connect(self._integration_progress)
            bridge.succeeded.connect(self._integration_succeeded)
            bridge.failed.connect(self._integration_failed)
            bridge.notice.connect(self._hook_notice)
            self._integration_bridge = bridge
        if config_service is not None and hasattr(config_service, "workspace"):
            from rotaris.services.checkpoint_bridge import CheckpointBridge

            checkpoints = CheckpointBridge(
                config_service.workspace,
                session_is_running=self._session_is_running,
                parent=self,
            )
            checkpoints.listed.connect(self._checkpoints_listed)
            checkpoints.previewed.connect(self._checkpoint_previewed)
            checkpoints.restored.connect(self._checkpoint_restored)
            checkpoints.repaired.connect(self._checkpoint_repaired)
            checkpoints.failed.connect(self._checkpoint_failed)
            self._checkpoint_bridge = checkpoints
        self.commands = CommandRegistry(self)
        self._register_commands()
        self._rebuild_slash_catalogue()
        # Skills and models arrive with config and can be rescanned later, so
        # the catalogue follows both signals rather than a one-shot build.
        self.store.library_changed.connect(self._rebuild_slash_catalogue)
        self.store.settings_changed.connect(self._rebuild_slash_catalogue)
        self._refresh_notice()
        self.show_view("dashboard")
        # The Git view built and emitted its first session choice before this
        # window had connected to it, so the opening listing is requested here.
        if self.git.selected_checkpoint_session:
            self._load_checkpoints(self.git.selected_checkpoint_session)
        # Deferred by one event-loop turn: the workspace's setup check touches
        # the filesystem and may raise a modal, and neither belongs inside the
        # constructor of the window that would have to parent them.
        QTimer.singleShot(0, self._resolve_project_initialization)
        QTimer.singleShot(0, self._offer_hook_review)
        self.install_theme_hook()

    @traces(SWR.SWR_3622)
    def _attach_session_launcher(self, config_service: Any) -> None:
        """Let a released requirement start its work as a session (SWR-3622).

        The one place the two halves meet: the run coordinator is this window's,
        and the board's write path is the requirements controller's. Neither can
        build the other, so the window — which holds both — hands one over.

        Asked structurally, like every other optional collaborator here. A window
        driven by a double that is not a coordinator, and a workspace the board
        cannot write to, both leave the board releasing exactly as it did before:
        the run takes the self-contained path and nothing about this window fails
        because a test did not bring a coordinator.
        """
        workspace = getattr(config_service, "workspace", None)
        coordinator = self.run_bridge
        if workspace is None or coordinator is None:
            return
        if not hasattr(coordinator, "launch_new") or not hasattr(
            coordinator,
            "session_run_finished",
        ):
            return
        from rotaris.services.session_launcher import CoordinatorSessionLauncher

        self.session_launcher = CoordinatorSessionLauncher(coordinator, workspace, parent=self)
        self.requirements_controller.attach_launcher(self.session_launcher)

    def apply_theme(self, theme: Theme) -> None:
        """Restyle the toast — the only surface this window paints itself.

        Every other pixel here belongs to a child view with its own hook or to a
        stylesheet selector the manager repolishes.
        """
        edge = theme.color.fail if self._toast_error else theme.color.border_strong
        self.toast.setStyleSheet(
            f"background:{theme.color.surface};"
            f"border:{theme.size.hairline}px solid {edge};"
            f"border-radius:{theme.radius.sm}px;"
            f"padding:{theme.space.sm}px {theme.space.md}px;"
            f"color:{theme.color.text};"
        )

    def show_view(self, view_id: str) -> None:
        view = self.views.get(view_id)
        if view is None:
            return
        if (
            self.store.ui.active_view == "settings"
            and view_id != "settings"
            and self.store.ui.settings_dirty
            and not self._confirm_settings_transition()
        ):
            return
        self.stack.setCurrentWidget(view)
        self.nav.select(view_id)
        self.store.set_active_view(view_id)

    def open_agent_window(self, agent_id: str) -> None:
        agent = self.store.agents.get(agent_id)
        if agent is None:
            return
        window = self.agent_windows.get(agent.persona)
        if window is None:
            window = AgentWindow(
                self.store,
                agent.persona,
                self,
                terminal_screens=self.terminal_streams.peek,
            )
            window.steer_requested.connect(self._steer_agent)
            window.cancel_requested.connect(self._cancel_agent)
            window.artifact_open_requested.connect(self.open_artifact)
            self.agent_windows[agent.persona] = window
        window.refresh(agent_id)
        window.show()
        window.raise_()
        window.activateWindow()

    @traces(SWR.SWR_2428)
    def open_terminal_window(self, stream_id: str = "", *, take_focus: bool = True) -> None:
        """Create-or-raise the terminal window, same as the agent pop-out.

        *take_focus* is false when the window opened by itself: a window that
        appears because a command started must not take the keyboard away from
        someone mid-sentence in the composer.
        """
        window = self.terminal_window
        if window is None:
            window = TerminalWindow(self.terminal_streams, self)
            window.closed.connect(self._on_terminal_window_closed)
            window.action_requested.connect(self._handle_notice_action)
            self.terminal_window = window
        window.set_session_label(self._session_label())
        window.refresh(stream_id)
        window.show()
        window.raise_()
        if take_focus:
            window.activateWindow()

    def _session_label(self) -> str:
        """What to call the focused session in a window title."""
        session_id = self._focused_session_id()
        for session in self.store.sessions:
            if session.id == session_id:
                return session.name or session_id
        return session_id

    def _on_terminal_window_closed(self) -> None:
        # Closing is the pop-back-in: the preview never stopped streaming, so
        # the window is simply dropped and rebuilt if it is asked for again.
        self.terminal_window = None

    @traces(SWR.SWR_2428)
    def _on_terminal_stream_changed(self, stream_id: str) -> None:
        streams = self.terminal_streams.known_streams()
        self.workspace.set_terminal_count(self.terminal_streams.live_stream_count(), len(streams))
        if self.terminal_window is not None:
            self.terminal_window.refresh()
            return
        if not (self.store.ui.terminal_popout and stream_id):
            return
        # The preference says "when a command starts". This signal also fires
        # when one ends, and popping a window open to show an exited terminal
        # is not what it promised.
        screen = self.terminal_streams.peek(stream_id)
        if screen is not None and screen.running:
            self.open_terminal_window(stream_id, take_focus=False)

    def _on_terminal_screen_updated(self, stream_id: str) -> None:
        # The transcript repaints its own live rows on a timer; only rows that
        # are *not* considered live still need a nudge when output arrives.
        del stream_id
        self.workspace.transcript_scroll.viewport().update()

    @traces(SWR.SWR_2428)
    def set_terminal_popout(self, enabled: bool) -> None:
        self.store.set_terminal_popout(enabled)
        self._ui_settings.setValue("interface/terminalPopout", enabled)

    @traces(SWR.SWR_2090)
    def _agent_tree_selected(self, agent_id: str) -> None:
        self.show_view("workspace")
        self.workspace.inspect_agent(agent_id)
        if self.store.ui.agent_popout:
            self.open_agent_window(agent_id)

    def open_artifact(self, artifact_id: str) -> None:
        """Open (or raise) the inspector/editor dialog for one artifact."""
        if self.config_service is None:
            self.notify("Artifacts are read-only in demo mode.", error=True)
            return
        existing = self.artifact_dialogs.get(artifact_id)
        if existing is not None and existing.isVisible():
            existing.raise_()
            existing.activateWindow()
            return
        info = self.store.artifact(artifact_id)
        if info is None:
            self.notify("Artifact not found in the loaded session.", error=True)
            return
        from rotaris.views.artifact_dialog import ArtifactDialog

        dialog = ArtifactDialog(self.config_service, info, self)
        self.artifact_dialogs[artifact_id] = dialog
        dialog.show()
        dialog.raise_()

    def refresh_git(self) -> None:
        if self.git_service is None:
            return
        try:
            self.git_service.refresh()
        except Exception as exc:
            self.git.refresh()
            self._report_error("Git refresh failed", str(exc))

    def _merge_worktrees(self, session_ids: list[str]) -> None:
        bridge = self._integration_bridge
        if bridge is None:
            self.notify("Worktree integration is unavailable in demo mode.", error=True)
            return
        if bridge.running:
            self.notify("A worktree integration is already running.", error=True)
            return
        if self.run_bridge is not None and getattr(self.run_bridge, "running", False):
            self.notify("Finish or cancel the active run before integrating worktrees.", error=True)
            return
        branches = {tree.session: tree.branch for tree in self.store.worktrees if tree.session}
        dialog = MergeOrderDialog(
            [(session_id, branches.get(session_id, "")) for session_id in session_ids],
            parent=self,
        )
        if not dialog.exec():
            return
        session_ids = dialog.ordered_session_ids
        progress = QProgressDialog(self)
        progress.setLabelText("Preparing integration workspace…")
        progress.setRange(0, 0)
        progress.setWindowTitle("Merging worktrees")
        progress.setWindowModality(Qt.WindowModality.WindowModal)
        progress.setAutoClose(False)
        progress.setAutoReset(False)
        progress.setCancelButtonText("")
        progress.setMinimumDuration(0)
        progress.setAccessibleName("Worktree integration progress")
        self._integration_progress_dialog = progress
        progress.show()
        self._merged_session_ids = list(session_ids)
        if not bridge.start(session_ids):
            self._merged_session_ids = []
            self._close_integration_progress()
            self.notify("Could not start worktree integration.", error=True)

    def _integration_progress(self, message: str) -> None:
        dialog = self._integration_progress_dialog
        if dialog is not None:
            dialog.setLabelText(message)

    def _integration_succeeded(self, message: str) -> None:
        self._close_integration_progress()
        if self.config_service is not None:
            self.config_service.refresh_sessions()
        self.refresh_git()
        self.notify(message)
        self._prompt_worktree_cleanup()

    def _integration_failed(self, message: str) -> None:
        self._close_integration_progress()
        if self.config_service is not None:
            self.config_service.refresh_sessions()
        self.refresh_git()
        self._report_error(
            "Worktree integration needs recovery",
            "Base branch was left unchanged. Review the retained integration worktree and retry when ready.",
            details=message,
        )

    def _close_integration_progress(self) -> None:
        dialog = self._integration_progress_dialog
        self._integration_progress_dialog = None
        if dialog is not None:
            dialog.close()
            dialog.deleteLater()

    # ── checkpoints (SWR-2437) ────────────────────────────────────────────

    def _session_is_running(self, session_id: str) -> bool:
        """Whether *session_id* has a live run, so a restore must be refused.

        Recording the pre-restore safety checkpoint re-reads and flushes the
        session snapshot the run is also writing, so a restore during a run is
        not "risky", it is a race on the file that holds the undo history.

        A persisted ``"running"`` is only evidence, though: the process that
        wrote it may have been killed, in which case the status is wrong for
        ever and the restore the user wants would be refused for ever. So a
        persisted busy status is confirmed against the session's lock file — one
        small read, for the one session actually asked about, and only when a
        run handle in this process has not already answered.
        """
        if not session_id:
            return False
        bridge = self.run_bridge
        if bridge is not None:
            active = getattr(bridge, "active_session_ids", None)
            if active is not None and session_id in set(active):
                return True
            if (
                getattr(bridge, "running", False)
                and getattr(bridge, "session_id", "") == session_id
            ):
                return True
        persisted_busy = any(
            session.id == session_id and RunUiState.from_backend(session.status).busy
            for session in self.store.sessions
        )
        return persisted_busy and self._session_process_is_live(session_id)

    def _session_process_is_live(self, session_id: str) -> bool:
        """Whether a process still owns *session_id*, per its lock file.

        Never reached per row of the session list: only the single session a
        restore or listing is about gets probed, and only after its stored
        status already claimed a run. Anything unreadable answers "live", which
        keeps a restore refused rather than racing one.
        """
        service = self.config_service
        workspace = getattr(service, "workspace", None) if service is not None else None
        if workspace is None:
            return True
        try:
            from rotaris_core.session.manager import SessionManager
            from rotaris_core.session.recovery import session_is_live

            return session_is_live(SessionManager(workspace), session_id)
        except Exception:  # noqa: BLE001 - a broken probe must not enable a restore.
            return True

    @traces(SWR.SWR_2437)
    def _load_checkpoints(self, session_id: str) -> None:
        """Publish a loading listing for *session_id* and ask the bridge for it."""
        if not session_id:
            self.store.set_checkpoints(CheckpointList())
            return
        if self._checkpoint_bridge is None:
            self.store.set_checkpoints(
                CheckpointList(
                    session_id=session_id,
                    unavailable_reason="Checkpoints are unavailable without a workspace.",
                )
            )
            return
        self._checkpoint_session_wanted = session_id
        # Always distinct from any settled listing, so the store's equality guard
        # cannot swallow the transition back to a session already looked at.
        self.store.set_checkpoints(CheckpointList(session_id=session_id, loading=True))
        self._repair_stale_session(session_id)
        # A retry already in flight will pick up the session just recorded, so a
        # user clicking through sessions cannot stack up timers.
        if not self._checkpoint_load_scheduled:
            self._dispatch_checkpoint_load()

    @traces(SWR.SWR_2437, SWR.SWR_2817)
    def _repair_stale_session(self, session_id: str) -> None:
        """Correct a status a dead process left behind, before offering a restore.

        Only from here, never from a plain read: the rewrite is explicit, it is
        announced by :meth:`_checkpoint_repaired`, and if the bridge is busy it
        is simply skipped — the restore is already available either way, because
        :meth:`_session_is_running` asks the same question of the same lock.
        """
        bridge = self._checkpoint_bridge
        if bridge is None:
            return
        stuck = any(
            session.id == session_id and RunUiState.from_backend(session.status).busy
            for session in self.store.sessions
        )
        if not stuck or self._session_process_is_live(session_id):
            return
        bridge.repair_stale_session(session_id)

    @traces(SWR.SWR_2437)
    def _checkpoint_repaired(self, payload: object) -> None:
        """Say out loud that a crashed session's stored status was rewritten."""
        session_id = str(getattr(payload, "session_id", ""))
        if not session_id:
            return
        previous = str(getattr(payload, "execution_status", ""))
        reason = str(getattr(payload, "reason", ""))
        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.WARNING,
                title="Session marked interrupted",
                message=(
                    f"This session was still marked '{previous}', but {reason}. "
                    "Rotaris marked it interrupted, so its checkpoints can be "
                    "restored again."
                ),
            )
        )
        service = self.config_service
        if service is not None and hasattr(service, "refresh_sessions"):
            service.refresh_sessions()

    def _dispatch_checkpoint_load(self) -> None:
        """Send the pending listing request, retrying once the bridge is free."""
        self._checkpoint_load_scheduled = False
        bridge = self._checkpoint_bridge
        session_id = self._checkpoint_session_wanted
        if bridge is None or not session_id:
            return
        if bridge.load(session_id):
            return
        self._checkpoint_load_scheduled = True
        QTimer.singleShot(150, self._dispatch_checkpoint_load)

    @traces(SWR.SWR_2437)
    def _checkpoints_listed(self, listing: object) -> None:
        if isinstance(listing, CheckpointList):
            self.store.set_checkpoints(listing)

    @traces(SWR.SWR_2437)
    def _restore_checkpoint(self, session_id: str, sequence: int) -> None:
        """Preview the rollback first; the confirmation dialog needs its diff."""
        bridge = self._checkpoint_bridge
        if bridge is None:
            self.notify("Checkpoint restore is unavailable without a workspace.", error=True)
            return
        if bridge.busy:
            self.notify("Rotaris is still reading checkpoints. Try again in a moment.")
            return
        self._pending_restore = (session_id, sequence)
        self._open_checkpoint_progress(f"Inspecting checkpoint {sequence}…")
        if not bridge.preview(session_id, sequence):
            self._pending_restore = None
            self._close_checkpoint_progress()
            self.notify("Could not inspect that checkpoint.", error=True)

    @traces(SWR.SWR_2437)
    def _checkpoint_previewed(self, payload: object) -> None:
        """Confirm the rollback, with the engine's own per-path verbs on screen."""
        from rotaris.models.state import CheckpointPreview

        self._close_checkpoint_progress()
        pending, self._pending_restore = self._pending_restore, None
        if not isinstance(payload, CheckpointPreview) or pending is None:
            return
        if (payload.session_id, payload.sequence) != pending:
            return
        if not payload.restorable:
            self._report_error(
                f"Checkpoint {payload.sequence} cannot be restored",
                payload.blocked_reason,
            )
            return
        dialog = CheckpointRestoreDialog(
            payload,
            tree_root=self.store.checkpoints.tree_root,
            parent=self,
        )
        dialog.exec()
        confirmed, force = dialog.confirmed, dialog.force
        # Dropped rather than left parented to the window: it holds the whole
        # preview, and a second restore must not find a stale copy of the first.
        dialog.deleteLater()
        if not confirmed:
            self.notify("Restore cancelled. The working tree was not changed.")
            return
        bridge = self._checkpoint_bridge
        if bridge is None:
            return
        self._open_checkpoint_progress(f"Restoring checkpoint {payload.sequence}…")
        if not bridge.restore(payload.session_id, payload.sequence, force=force):
            self._close_checkpoint_progress()
            self.notify("Could not start the restore.", error=True)

    @traces(SWR.SWR_2437)
    def _checkpoint_restored(self, payload: object) -> None:
        from rotaris.models.state import CheckpointRestoreOutcome

        self._close_checkpoint_progress()
        if not isinstance(payload, CheckpointRestoreOutcome):
            return
        if not payload.restored:
            self._report_error(
                f"Checkpoint {payload.sequence} was not restored",
                payload.blocked_reason or "The working tree was left unchanged.",
            )
        else:
            safety = (
                f"Safety checkpoint {payload.safety_sequence} holds the pre-restore state."
                if payload.safety_sequence
                else "No safety checkpoint was needed: the tree already matched the last commit."
            )
            self.store.publish_notice(
                UiNotice(
                    id=self.store.new_notice_id(),
                    severity=NoticeSeverity.SUCCESS,
                    title=f"Restored checkpoint {payload.sequence}",
                    message=f"{payload.changed_count} file(s) changed. {safety}",
                    persistent=True,
                )
            )
        self.refresh_git()
        self._load_checkpoints(payload.session_id)

    def _checkpoint_failed(self, message: str) -> None:
        self._close_checkpoint_progress()
        self._pending_restore = None
        self._report_error(
            "Could not read this session's checkpoints",
            "Rotaris could not reach the session store for this workspace.",
            details=message,
        )

    def _open_checkpoint_progress(self, label: str) -> None:
        self._close_checkpoint_progress()
        progress = QProgressDialog(self)
        progress.setLabelText(label)
        progress.setRange(0, 0)
        progress.setWindowTitle("Checkpoints")
        progress.setWindowModality(Qt.WindowModality.WindowModal)
        progress.setAutoClose(False)
        progress.setAutoReset(False)
        progress.setCancelButtonText("")
        progress.setMinimumDuration(0)
        progress.setAccessibleName("Checkpoint progress")
        self._checkpoint_progress_dialog = progress
        progress.show()

    def _close_checkpoint_progress(self) -> None:
        dialog = self._checkpoint_progress_dialog
        self._checkpoint_progress_dialog = None
        if dialog is not None:
            dialog.close()
            dialog.deleteLater()

    # ── lifecycle hooks (SWR-2701, SWR-2704) ──────────────────────────────

    @traces(SWR.SWR_2701, SWR.SWR_2704)
    def _hook_notice(self, message: str) -> None:
        """Surface a hook advisory that outlives a toast, with a way to act on it."""
        if not message:
            return
        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.WARNING,
                title="Lifecycle hooks need your attention",
                message=message,
                persistent=True,
                action_label="Open hook settings",
                action_id="settings.hooks",
            )
        )

    @traces(SWR.SWR_2701)
    def _offer_hook_review(self) -> None:
        """Point at the pending hook review once, without opening the modal.

        The review is opened by the user, never by the window: a security
        dialog that appears unbidden on startup is one people learn to dismiss.
        """
        summary = self.settings.hook_summary
        if not summary.review_due:
            return
        count = len(summary.pending)
        noun = "hook" if count == 1 else "hooks"
        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.WARNING,
                title=f"This workspace declares {count} unreviewed {noun}",
                message=(
                    "Workspace hooks run shell commands written by whoever wrote this "
                    "repository. They stay skipped until you review and allow them."
                ),
                persistent=True,
                action_label="Review hooks",
                action_id="settings.hooks",
            )
        )

    @traces(SWR.SWR_2701)
    def _review_workspace_hooks(self) -> None:
        """Show this workspace's hook commands and persist the user's verdict.

        The dialog is the only place those commands are rendered, and both
        answers are recorded: a refusal has to stick, or the next session would
        ask again and train the user to click it away.
        """
        summary = self.settings.hook_summary
        if not summary.pending or not summary.digest:
            self.notify("This workspace declares no hooks of its own.")
            return
        dialog = HookTrustDialog(summary, self)
        dialog.exec()
        trusted = dialog.trusted
        # Dropped as soon as the answer is in: the widget holds the workspace's
        # command text, and that must not linger in the window's widget tree.
        dialog.deleteLater()
        from rotaris_core.hooks.trust import store_trust

        try:
            store_trust(summary.workspace, digest=summary.digest, trusted=trusted)
        except (OSError, ValueError) as exc:
            # Deliberately loud. A refusal that failed to persist would let the
            # hooks the user just rejected run on the next session.
            self._report_error(
                "Could not record your hook decision",
                "Rotaris could not write the verdict, so the hooks stay blocked "
                "and you will be asked again.",
                details=str(exc),
            )
            return
        self.settings.refresh_hooks()
        self.notify(
            "This workspace's hooks are allowed to run."
            if trusted
            else "This workspace's hooks will not run."
        )

    @traces(SWR.SWR_2405)
    def _delete_worktree(self, path: str) -> None:
        if self.git_service is None:
            return
        from pathlib import Path

        answer = QMessageBox.question(
            self,
            "Delete worktree?",
            f"Remove worktree at {path}?\n\nThis deletes the working directory and its Git metadata.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Cancel,
        )
        if answer is not QMessageBox.StandardButton.Yes:
            return
        try:
            self.git_service.delete_worktree(Path(path))
            self.notify("Worktree deleted.")
        except Exception as exc:
            self._report_error("Could not delete worktree", str(exc))

    @traces(SWR.SWR_2405)
    def _prompt_worktree_cleanup(self) -> None:
        if not self._merged_session_ids:
            return
        if not self.store.ui.worktree_cleanup_prompt_enabled:
            self._merged_session_ids = []
            return
        merged_paths: list[tuple[str, str]] = []
        for tree in self.store.worktrees:
            if tree.session in self._merged_session_ids and not tree.is_base and not tree.active:
                merged_paths.append((tree.branch, tree.path))
        self._merged_session_ids = []
        if not merged_paths:
            return
        dialog = QDialog(self)
        dialog.setWindowTitle("Delete merged worktrees?")
        dialog.setModal(True)
        layout = QVBoxLayout(dialog)
        label = QLabel(
            "The following worktrees were just merged into the base branch.\n"
            "Delete them to keep your workspace clean?"
        )
        label.setWordWrap(True)
        layout.addWidget(label)
        list_widget = QListWidget()
        for branch, path in merged_paths:
            list_widget.addItem(f"{branch}  →  {path}")
        layout.addWidget(list_widget)
        dont_ask = QCheckBox("Don't ask again")
        layout.addWidget(dont_ask)
        buttons = QDialogButtonBox()
        delete_btn = buttons.addButton("Delete", QDialogButtonBox.ButtonRole.AcceptRole)
        keep_btn = buttons.addButton("Keep", QDialogButtonBox.ButtonRole.RejectRole)
        layout.addWidget(buttons)
        delete_btn.clicked.connect(dialog.accept)
        keep_btn.clicked.connect(dialog.reject)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            if dont_ask.isChecked():
                self._persist_worktree_cleanup_prompt(False)
            return
        if dont_ask.isChecked():
            self._persist_worktree_cleanup_prompt(False)
        if self.git_service is None:
            self._report_error("Cannot delete worktrees", "No git service available.")
            return
        errors: list[str] = []
        from pathlib import Path

        for _branch, path in merged_paths:
            try:
                self.git_service.delete_worktree(Path(path))
            except Exception as exc:
                errors.append(f"{path}: {exc}")
        self.refresh_git()
        if errors:
            self._report_error(
                "Some worktrees could not be deleted",
                f"Deleted {len(merged_paths) - len(errors)} of {len(merged_paths)} worktrees.",
                details="\n".join(errors),
            )
        else:
            self.notify(f"Deleted {len(merged_paths)} merged worktree(s).")

    def notify(self, text: str, *, error: bool = False) -> None:
        self.toast.setText(text)
        self.toast.setWordWrap(True)
        self.toast.setMaximumWidth(520)
        self._toast_error = error
        self.apply_theme(tokens())
        self.toast.adjustSize()
        margin = 18
        self.toast.move(self.width() - self.toast.width() - margin, margin + 42)
        self.toast.show()
        self.toast.raise_()
        self._toast_timer.start(4200)

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802
        super().resizeEvent(event)
        if self.toast.isVisible():
            self.toast.move(self.width() - self.toast.width() - 18, 60)

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802
        interactive_close = event.spontaneous()
        if (
            interactive_close
            and self.store.ui.settings_dirty
            and not self._confirm_settings_transition()
        ):
            event.ignore()
            return
        if self._integration_bridge is not None and self._integration_bridge.running:
            QMessageBox.information(
                self,
                "Integration in progress",
                "Keep Rotaris open until the isolated worktree integration finishes.",
            )
            event.ignore()
            return

        active = self._active_run_count()
        if interactive_close and (active or self.store.run_state.busy):
            if active > 1:
                question = f"Quit while {active} runs are active?"
                impact = (
                    f"Rotaris will request shutdown of all {active} runs. "
                    "In-flight work may not finish."
                )
            else:
                question = "Quit while a run is active?"
                impact = (
                    "Rotaris will request shutdown of the active run. "
                    "In-flight work may not finish."
                )
            answer = QMessageBox.question(
                self,
                question,
                impact,
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if answer is not QMessageBox.StandardButton.Yes:
                event.ignore()
                return
        if self.run_bridge is not None:
            shutdown_all = getattr(self.run_bridge, "shutdown_all", None)
            if callable(shutdown_all):
                shutdown_all()
            else:
                self.run_bridge.shutdown()
        self._shutdown_project_init()
        self._close_checkpoint_progress()
        if self._checkpoint_bridge is not None:
            # Joined, not abandoned: destroying a QThread still inside a Git
            # call aborts the process.
            self._checkpoint_bridge.shutdown()
        if self._update_bridge is not None:
            # An in-flight download holds an open file; joined for the same reason
            # the checkpoint thread is.
            self._update_bridge.stop()
        if self._cloud_bridge is not None:
            self._cloud_bridge.stop()
        self.diagnostics.close()
        for window in self.agent_windows.values():
            window.close()
        for dialog in self.artifact_dialogs.values():
            dialog.close()
        super().closeEvent(event)

    @traces(SWR.SWR_2415)
    def _active_run_count(self) -> int:
        """How many runs a quit would interrupt (0 or 1 without a coordinator)."""
        bridge = self.run_bridge
        if bridge is None:
            return 0
        active = getattr(bridge, "active_session_ids", None)
        if active is not None:
            return len(active)
        return 1 if getattr(bridge, "running", False) else 0

    def _submit_prompt(self, text: str) -> None:
        if self.config_service is not None and not self.store.workspace_path:
            self._report_error(
                "Workspace unavailable",
                "Open Rotaris with a workspace before starting a run.",
                action_label="Open Overview",
                action_id="view.dashboard",
            )
            self.workspace.set_composer_text(text)
            return
        if self.store.initialization.should_prompt:
            # SWR-2802: agent execution is gated until the prompt is answered.
            # The composer already says so; this catches the keyboard path.
            self._report_error(
                "Project setup is unanswered",
                "Initialize this workspace or skip its setup before starting a run.",
                action_label="Open project setup",
                action_id="project.initialize",
            )
            self.workspace.set_composer_text(text)
            return
        if (
            self.config_service is not None
            and not self.store.active_model
            and not self.store.model_catalog
        ):
            self._report_error(
                "No model configured",
                "Choose a model in Settings before starting a run.",
                action_label="Open Settings",
                action_id="view.settings",
            )
            self.workspace.set_composer_text(text)
            return
        if (
            self.config_service is not None
            and self.store.providers
            and not any(provider.connected for provider in self.store.providers)
        ):
            self._report_error(
                "Provider authentication required",
                "Authenticate at least one configured provider before starting a run.",
                action_label="Open Settings",
                action_id="view.settings",
            )
            self.workspace.set_composer_text(text)
            return
        if not self._confirm_cloud_credit():
            self.workspace.set_composer_text(text)
            return
        if self.run_bridge is None:
            self.store.add_history(text)
            self.store.append_event(
                TranscriptEvent(datetime.now().strftime("%H:%M:%S"), "you", text, kind="user")
            )
            self.store.append_event(
                TranscriptEvent("", "system", "Demo mode: run bridge is disabled.", kind="system")
            )
            return
        self._last_prompt = text
        self._auth_fallback_attempted = False
        previous_state = self.store.session_status
        self.store.set_session_status("starting")
        try:
            session_id = self._resume_session_id or self.store.session_name or None
            isolation = self._pending_worktree_isolation if session_id is None else None
            # A per-session sandbox choice belongs to the session it was made
            # for; a resumed run keeps the mode its own config carries.
            run_config = self._sandbox_run_config() if session_id is None else None
            # Without a per-session choice the run still inherits the workspace
            # config, so the verdict and the requested mode are read from
            # whichever config this launch will actually use.
            launch_config = (
                run_config
                if run_config is not None
                else getattr(self.config_service, "config", None)
            )
            self._pending_sandbox_verdict = self._sandbox_verdict(launch_config)
            self._launch_sandbox_mode = str(
                getattr(getattr(launch_config, "runtime", None), "sandbox_mode", "") or ""
            )
            if run_config is not None:
                started = self.run_bridge.start(text, session_id, isolation, run_config=run_config)
            elif isolation is not None:
                started = self.run_bridge.start(text, session_id, isolation)
            else:
                started = self.run_bridge.start(text, session_id)
        except (OSError, RuntimeError, ValueError) as exc:
            self._launch_sandbox_mode = ""
            self.store.set_session_status(previous_state)
            self.workspace.set_composer_text(text)
            self._report_error(
                "Could not start run", str(exc), action_label="Retry", action_id="run.retry"
            )
            return
        if not started:
            self._launch_sandbox_mode = ""
            self.store.set_session_status(previous_state)
            self.workspace.set_composer_text(text)
            if session_id is not None and getattr(self.run_bridge, "isolation_required", False):
                self.notify(
                    "This session uses the base workspace, so it cannot continue "
                    "while another run is active.",
                    error=True,
                )
            else:
                self.notify("A run is already active.", error=True)
            return
        self._pending_worktree_isolation = None
        self._pending_sandbox_mode = None
        self.store.add_history(text)
        self.store.append_event(
            TranscriptEvent(datetime.now().strftime("%H:%M:%S"), "you", text, kind="user")
        )

    def _queue_prompt(self, text: str) -> None:
        run_bridge = self.run_bridge
        prompt_id = (
            run_bridge.queue_prompt(text)
            if run_bridge is not None and hasattr(run_bridge, "queue_prompt")
            else ""
        )
        if not prompt_id:
            self.workspace.set_composer_text(text)
            self.notify(
                "Message could not be queued because the run is no longer active.", error=True
            )
            return
        self.store.add_queued_prompt(prompt_id, text)
        self.store.add_history(text)
        self.notify("Message queued for the next iteration.")

    def _edit_queued_prompt(self, prompt_id: str, text: str) -> None:
        run_bridge = self.run_bridge
        if (
            run_bridge is not None
            and hasattr(run_bridge, "edit_queued_prompt")
            and run_bridge.edit_queued_prompt(prompt_id, text)
        ):
            self.store.update_queued_prompt(prompt_id, text)
            return
        if run_bridge is not None and hasattr(run_bridge, "sync_queued_prompts"):
            run_bridge.sync_queued_prompts()
        self.notify("Queued message was already picked up and cannot be edited.", error=True)

    def _delete_queued_prompt(self, prompt_id: str) -> None:
        run_bridge = self.run_bridge
        if (
            run_bridge is not None
            and hasattr(run_bridge, "delete_queued_prompt")
            and run_bridge.delete_queued_prompt(prompt_id)
        ):
            self.store.remove_queued_prompt(prompt_id)
            return
        if run_bridge is not None and hasattr(run_bridge, "sync_queued_prompts"):
            run_bridge.sync_queued_prompts()
        self.notify("Queued message was already picked up and cannot be deleted.", error=True)

    @traces(SWR.SWR_2415)
    def _new_session(self) -> None:
        """Start another session; running ones keep going in the background."""
        bridge = self.run_bridge
        supports_parallel = hasattr(bridge, "launch_new")
        if bridge is not None and not supports_parallel and getattr(bridge, "running", False):
            self.notify(
                "Finish or cancel the active run before starting a new session.", error=True
            )
            return
        from rotaris_core.session.manager import SessionManager

        sandbox_mode, sandbox_unavailable = self._sandbox_offer()
        dialog = _SessionLaunchDialog(
            SessionManager.new_session_id(),
            self,
            isolation_required=bool(getattr(bridge, "isolation_required", False)),
            sandbox_mode=sandbox_mode,
            sandbox_unavailable=sandbox_unavailable,
        )
        if not dialog.exec():
            return
        self._pending_sandbox_mode = dialog.sandbox_mode
        if dialog.isolate:
            from rotaris_core.session.worktrees import WorktreeLaunchRequest

            self._pending_worktree_isolation = WorktreeLaunchRequest(
                branch=dialog.branch or None,
                session_id=dialog.session_id,
            )
        else:
            self._pending_worktree_isolation = None
        if supports_parallel and bridge is not None:
            # Unfocus first: the previously focused run keeps going, but must
            # not project its transcript into the composing session.
            bridge.focus("")
        self._resume_session_id = None
        self._last_prompt = ""
        self._auth_fallback_attempted = False
        self._close_reauth_prompt()
        if self._auth_dialog is not None:
            self._auth_dialog.close()
            self._auth_dialog = None
        self.store.clear_session()
        self.store.clear_notice()
        # The badge belongs to the run that earned it, not to the window.
        self.workspace.set_sandbox_status(False, "")
        self.workspace.composer.clear()
        for window in self.agent_windows.values():
            window.close()
        self.agent_windows.clear()
        if self.terminal_window is not None:
            self.terminal_window.close()
            self.terminal_window = None
        self.terminal_streams.clear()
        self.workspace.set_terminal_count(0, 0)
        for dialog in self.artifact_dialogs.values():
            dialog.close()
        self.artifact_dialogs.clear()
        self.show_view("workspace")
        self.workspace.composer.setFocus()

    @traces(SWR.SWR_2507)
    def _sandbox_offer(self) -> tuple[str, str]:
        """``(workspace default mode, why this host cannot sandbox)``.

        The default comes from the store rather than the loaded config, matching
        ``ConfigService.build_run_config``: the dialog has to offer the value the
        user is looking at in Settings, not the last saved one, or the checkbox
        and the run it launches would disagree.  The store is read defensively
        only so a stubbed service without one still opens the dialog.

        The second value is empty when the sandbox is available. It is the
        backend's own reason and remediation, rendered by the error SWR-2507
        raises, so the disabled checkbox says exactly what a failed run would.
        """
        from rotaris_core.sandbox.backends import probe_sandbox
        from rotaris_core.sandbox.spec import SandboxUnavailableError

        runtime = getattr(getattr(self.config_service, "store", None), "runtime", None)
        if runtime is None:
            runtime = getattr(getattr(self.config_service, "config", None), "runtime", None)
        mode = str(getattr(runtime, "sandbox_mode", "off") or "off")
        availability = probe_sandbox()
        if availability.available:
            return (mode, "")
        return (mode, str(SandboxUnavailableError(availability)))

    @traces(SWR.SWR_2507)
    def _sandbox_run_config(self) -> Any | None:
        """Pin the launch config to the sandbox mode chosen for this session.

        ``run_config`` is the channel that reaches the worker through both the
        single-bridge and the coordinator host, so a per-session choice travels
        on the immutable snapshot the run launches with. ``None`` means no
        choice is pending and the bridge snapshots the workspace config itself.
        """
        mode = self._pending_sandbox_mode
        service = self.config_service
        if mode is None or service is None:
            return None
        if getattr(service, "config", None) is None:
            service.load()
        config = service.build_run_config()
        try:
            # RuntimePolicy validates on assignment, so an unusable mode is
            # refused here rather than deep inside the run.
            config.runtime.sandbox_mode = mode
        except ValueError as exc:
            raise ValueError(f"Sandbox mode {mode!r} is not a valid setting.") from exc
        return config

    @traces(SWR.SWR_2507)
    def _sandbox_verdict(self, launch_config: Any | None) -> tuple[bool, str]:
        """What the host will actually give this launch: ``(active, backend)``.

        Probes once per launch, never per repaint, and reports "active" only for
        a sandbox that is both configured and available — so the badge this
        feeds can never claim a mechanism that did not run.
        """
        from rotaris_core.sandbox.session import sandbox_status

        if launch_config is None:
            return (False, "")
        return sandbox_status(launch_config)

    def _load_prompt(self, text: str) -> None:
        self.workspace.composer.setPlainText(text)
        self.show_view("workspace")
        self.workspace.composer.setFocus()

    @traces(SWR.SWR_2415)
    def _show_sessions(self) -> None:
        """Browse sessions and switch the workspace to any of them."""
        bridge = self.run_bridge
        supports_parallel = hasattr(bridge, "focus")
        if bridge is not None and not supports_parallel and getattr(bridge, "running", False):
            self.notify("Finish or cancel the active run before switching sessions.", error=True)
            return
        dialog = _SessionsDialog(self.store, self)
        if dialog.exec() and dialog.selected_session_id:
            self._focus_session(dialog.selected_session_id)

    def _create_worktree(self) -> None:
        if self.git_service is None:
            return
        dialog = _WorktreeDialog(
            self.git_service.workspace,
            {tree.branch for tree in self.store.worktrees},
            self,
        )
        if not dialog.exec():
            return
        try:
            from pathlib import Path

            self.git_service.create_worktree(Path(dialog.path), dialog.branch)
        except (OSError, RuntimeError, ValueError) as exc:
            self._report_error("Could not create worktree", str(exc))

    def _save_settings(self) -> bool:
        if self.config_service is None:
            self.notify("Settings are read-only in demo mode.", error=True)
            return False
        try:
            self.config_service.save()
        except (OSError, ValueError) as exc:
            self._report_error(
                "Could not save settings", str(exc), action_label="Retry", action_id="settings.save"
            )
            return False
        self.store.mark_settings_saved()
        self.notify("Settings saved.")
        return True

    @traces(SWR.SWR_2509)
    def _on_permission_mode_selected(self, mode: str) -> None:
        """Persist the composer's permission-mode choice to the workspace config.

        Reuses the settings save path, so this also flushes any other pending
        settings edits — the same thing the Settings tab's Save button does.
        """
        del mode
        self._save_settings()

    def _discard_settings(self) -> None:
        self.store.discard_settings_changes()
        self.notify("Unsaved settings discarded.")

    def _confirm_settings_transition(self) -> bool:
        if not self.store.ui.settings_dirty:
            return True
        dialog = QMessageBox(self)
        dialog.setIcon(QMessageBox.Icon.Warning)
        dialog.setWindowTitle("Unsaved settings")
        dialog.setText("Save workspace settings before leaving?")
        dialog.setInformativeText("Discard restores the last saved values.")
        save = dialog.addButton("Save", QMessageBox.ButtonRole.AcceptRole)
        discard = dialog.addButton("Discard", QMessageBox.ButtonRole.DestructiveRole)
        cancel = dialog.addButton(QMessageBox.StandardButton.Cancel)
        dialog.setDefaultButton(save)
        dialog.exec()
        clicked = dialog.clickedButton()
        if clicked is save:
            return self._save_settings()
        if clicked is discard:
            self._discard_settings()
            return True
        return clicked is not cancel

    def _set_proposal_status(
        self,
        artifact_id: str,
        proposal_id: str,
        status: str,
        *,
        confirm: bool = True,
    ) -> None:
        if self.config_service is None:
            self.notify("Proposal actions are unavailable in demo mode.", error=True)
            return
        proposal = next(
            (item for item in self.store.improvement_proposals if item.id == proposal_id),
            None,
        )
        previous_status = proposal.status if proposal is not None else "pending_review"
        if confirm and proposal is not None:
            answer = QMessageBox.question(
                self,
                f"{status.replace('_', ' ').title()} proposal?",
                f"{proposal.summary}\n\nCategory: {proposal.category.replace('_', ' ')}\n"
                "This records a review decision; it does not execute workspace changes.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if answer is not QMessageBox.StandardButton.Yes:
                return
        try:
            self.config_service.set_proposal_status(artifact_id, proposal_id, status)
        except (KeyError, OSError, ValueError) as exc:
            self.notify(f"Could not update proposal: {exc}", error=True)
            return
        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.SUCCESS,
                title=f"Proposal marked {status.replace('_', ' ')}",
                message=proposal.summary if proposal is not None else proposal_id,
                persistent=True,
                action_label="Undo",
                action_id=f"proposal.undo:{artifact_id}:{proposal_id}:{previous_status}",
            )
        )

    def _open_proposal_in_library(self, artifact_id: str, proposal_id: str) -> None:
        self.show_view("library")
        self.library.set_active_tab("proposals")
        if proposal_id:
            self.library.focus_proposal(proposal_id)

    def _edit_proposal(
        self, artifact_id: str, proposal_id: str, summary: str, recommended_action: str
    ) -> None:
        if self.config_service is None:
            self.notify("Proposal actions are unavailable in demo mode.", error=True)
            return
        try:
            self.config_service.update_proposal(
                artifact_id, proposal_id, summary=summary, recommended_action=recommended_action
            )
        except (KeyError, OSError, ValueError) as exc:
            self.notify(f"Could not update proposal: {exc}", error=True)
            return
        self.notify("Proposal updated.")

    def _delete_proposal(self, artifact_id: str, proposal_id: str) -> None:
        if self.config_service is None:
            self.notify("Proposal actions are unavailable in demo mode.", error=True)
            return
        proposal = next(
            (item for item in self.store.improvement_proposals if item.id == proposal_id),
            None,
        )
        answer = QMessageBox.question(
            self,
            "Delete proposal?",
            f"{proposal.summary if proposal is not None else proposal_id}\n\n"
            "This permanently removes the proposal. This cannot be undone.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Cancel,
        )
        if answer is not QMessageBox.StandardButton.Yes:
            return
        try:
            self.config_service.delete_proposal(artifact_id, proposal_id)
        except (KeyError, OSError) as exc:
            self.notify(f"Could not delete proposal: {exc}", error=True)
            return
        self.notify("Proposal deleted.")

    def _cancel_agent(self, agent_id: str) -> None:
        agent = self.store.agents.get(agent_id)
        if agent is None:
            return
        descendants = [
            item
            for item in self.store.descendants(agent_id)
            if item.state.value in {"running", "waiting", "queued"}
        ]
        impacts = [f"Cancel {agent.name}"]
        impacts.extend(f"Also cancel descendant {item.name}" for item in descendants)
        dialog = ConfirmImpactDialog(
            "Cancel agent?",
            "Cancellation cannot be undone in this session.",
            impacts,
            confirm_label="Cancel agent",
            parent=self,
        )
        if not dialog.exec():
            return
        self.store.set_session_status("cancelling")
        if self.run_bridge is not None and not self.run_bridge.cancel_agent(agent_id):
            self.store.set_session_status("running")
            self.notify("Agent is no longer cancellable.", error=True)
            return
        self.store.cancel_agent(agent_id)

    def _cancel_run(self) -> None:
        dialog = ConfirmImpactDialog(
            "Cancel run?",
            "Cancellation cannot be undone in this session.",
            ["Cancel the active run and every active task agent"],
            confirm_label="Cancel run",
            parent=self,
        )
        if not dialog.exec():
            return
        self.store.set_session_status("cancelling")
        if self.run_bridge is None or not self.run_bridge.cancel_agent("orchestrator"):
            self.store.set_session_status("running")
            self.notify("Run is no longer cancellable.", error=True)

    def _pause_run(self) -> None:
        self._pause_agent("orchestrator")

    def _pause_agent(self, agent_id: str) -> None:
        if self.run_bridge is None or not self.run_bridge.pause_agent(agent_id):
            self.notify("Pause unavailable — no active orchestrator run.", error=True)
            return
        self.store.set_session_status("pausing")
        self.notify("Pausing run… current step will finish first.")

    def _compress_context(self) -> None:
        if (
            self.run_bridge is None
            or not hasattr(self.run_bridge, "force_compress")
            or not self.run_bridge.force_compress()
        ):
            self.notify("No active agent contexts are available to compress.", error=True)
            return
        self.workspace.compress_button.setEnabled(False)
        self.workspace.compress_button.setText("Compressing…")
        self.notify("Compressing active agent contexts…")

    def _compression_finished(self, success_count: int, errors: str) -> None:
        self.workspace.compress_button.setText("Compress context")
        self.workspace._refresh_run_state()
        if errors:
            self._report_error(
                "Context compression incomplete",
                f"Compressed {success_count} active agent context(s).",
                details=errors,
            )
            return
        self.notify(f"Compressed context for {success_count} active agent(s).")

    def _clear_transcript(self) -> None:
        if not self.store.transcript:
            self.notify("Transcript is already empty.")
            return
        dialog = ConfirmImpactDialog(
            "Clear transcript?",
            "This removes the visible conversation from the loaded session. "
            "Agent state, artifacts, and Git changes remain.",
            ["Transcript messages cannot be restored after the session snapshot is saved."],
            confirm_label="Clear transcript",
            parent=self,
        )
        if not dialog.exec():
            return
        persisted = False
        if self.run_bridge is not None and getattr(self.run_bridge, "running", False):
            persisted = bool(
                hasattr(self.run_bridge, "clear_transcript") and self.run_bridge.clear_transcript()
            )
        elif self.config_service is not None and self.store.session_name:
            try:
                self.config_service.clear_session_transcript(self.store.session_name)
            except (FileNotFoundError, OSError, RuntimeError, ValueError) as exc:
                self._report_error("Could not clear transcript", str(exc))
                return
            persisted = True
        elif self.config_service is None:
            persisted = True
        if not persisted:
            self.notify("Transcript is busy and could not be cleared.", error=True)
            return
        self.store.transcript.clear()
        self.store.transcript_changed.emit()
        self.notify("Transcript cleared. Session artifacts and agent state were kept.")

    def _steer_agent(self, agent_id: str, text: str) -> None:
        if self.run_bridge is None or not self.run_bridge.steer(agent_id, text):
            self.notify("Agent steering unavailable for this run.", error=True)

    def _edit_todo(self, operation: str, target_id: str, text: str = "") -> None:
        """Persist an optimistic sidebar edit through the active or saved session."""
        run_bridge = self.run_bridge
        if run_bridge is not None and getattr(run_bridge, "running", False):
            if hasattr(run_bridge, "edit_todo") and run_bridge.edit_todo(
                operation, target_id, text
            ):
                return
            if self.config_service is not None and self.store.session_name:
                self.config_service.load_session(self.store.session_name)
            self.notify("Todo editing is not ready for this active run yet.", error=True)
            return
        if (
            self.config_service is not None
            and self.store.session_name
            and hasattr(self.config_service, "edit_session_todo")
            and self.config_service.edit_session_todo(
                self.store.session_name,
                operation,
                target_id,
                text,
            )
        ):
            return
        # Demo stores intentionally have no persistence service. Real sessions
        # recover from the persisted source when write-through is unavailable.
        if self.config_service is not None and self.store.session_name:
            self.config_service.load_session(self.store.session_name)
            self.notify("Todo changed elsewhere. Reloaded latest session state.", error=True)

    @traces(SWR.SWR_2507)
    def _run_started(self, session_id: str) -> None:
        self._resume_session_id = session_id
        self.store.session_name = session_id
        self.store.set_session_status("running")
        self._clear_stale_notice(session_id)
        self._launch_sandbox_mode = ""
        self._record_sandbox_verdict(session_id)
        self.workspace.set_sandbox_status(*self._sandbox_by_session.get(session_id, (False, "")))
        self._attach_terminal_streams(session_id)
        self.show_view("workspace")

    @traces(SWR.SWR_2415, SWR.SWR_2507)
    def _clear_stale_notice(self, session_id: str) -> None:
        """Drop the banner this run replaces — never another session's news.

        A starting run makes the previous run's own banner stale ("Run completed
        — review the transcript"), and clearing it is right. It does not make
        *another* session's completion notice stale: SWR-2415's AC-010 says a
        background run that finishes raises a non-blocking notification, and a
        notification the user never saw has not been delivered.

        This was a real defect, not a hypothetical. Two sessions running, the
        background one finishes and publishes its notice, and the other session's
        ``run_started`` — which crosses from the run thread and can land after —
        wiped it. Nothing republished it, so the user was simply never told. It
        surfaced as a test failing one run in three; the interleaving is a race,
        the lost notification is not.
        """
        standing = self.store.ui.notice
        if standing is not None and standing.session_id not in ("", session_id):
            return
        self.store.clear_notice()

    @traces(SWR.SWR_2507)
    def _record_sandbox_verdict(self, session_id: str) -> None:
        """Bind the launch-time verdict to the session that just started.

        Reaching "started" is itself the evidence: SWR-2507 fails a run whose
        sandbox is unavailable before it ever reports started, so a session that
        got this far ran under whatever the launch probe found. Recorded per
        session because a background run keeps its own verdict when the
        workspace switches away from it.
        """
        if session_id:
            self._sandbox_by_session[session_id] = self._pending_sandbox_verdict

    def _run_finished(self, status: str) -> None:
        self._auth_fallback_attempted = False
        self.store.set_session_status(status)
        if self.store.run_state.value == "completed":
            self.store.publish_notice(
                UiNotice(
                    id=self.store.new_notice_id(),
                    severity=NoticeSeverity.SUCCESS,
                    title="Run completed",
                    message="Review the transcript and session artifacts before starting the next task.",
                    persistent=True,
                    action_label="View artifacts",
                    action_id="library.artifacts",
                )
            )
        else:
            self.notify(f"Session {self.store.session_status}.")

    @traces(SWR.SWR_2415)
    def _session_run_finished(self, session_id: str, status: str) -> None:
        """Announce a *background* run without disturbing the focused one."""
        if session_id == self._focused_session_id():
            return
        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.SUCCESS
                if RunUiState.from_backend(status) is RunUiState.COMPLETED
                else NoticeSeverity.INFO,
                title=f"Session {session_id} {status}",
                message="The focused run continues. Switch to review this session.",
                persistent=True,
                action_label="Switch to session",
                action_id=f"session.focus:{session_id}",
                session_id=session_id,
            )
        )

    @traces(SWR.SWR_2415)
    def _session_run_failed(self, session_id: str, message: str) -> None:
        if session_id == self._focused_session_id():
            return
        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.WARNING,
                title=f"Session {session_id} failed",
                message="The focused run continues. Switch to review the failure.",
                details=message,
                persistent=True,
                action_label="Switch to session",
                action_id=f"session.focus:{session_id}",
                session_id=session_id,
            )
        )

    @traces(SWR.SWR_2415, SWR.SWR_2507)
    def _focus_changed(self, session_id: str) -> None:
        """Keep composer submission and recovery state on the focused run."""
        self._resume_session_id = session_id or None
        self._last_prompt = ""
        self._auth_fallback_attempted = False
        # Each run carries its own verdict; switching must not lend one
        # session's sandbox badge to another.
        self.workspace.set_sandbox_status(*self._sandbox_by_session.get(session_id, (False, "")))
        # Terminals belong to their run for the same reason — the workspace
        # must never show one session's live command under another's transcript.
        self._attach_terminal_streams(session_id)

    @traces(SWR.SWR_2428)
    def _attach_terminal_streams(self, session_id: str) -> None:
        """Follow one run's live terminals, dropping the previous run's."""
        from rotaris_core.terminal_stream.hub import default_hub

        was_open = self.terminal_window is not None
        self.terminal_streams.clear()
        if self.terminal_window is not None:
            self.terminal_window.close()
            self.terminal_window = None
        self.workspace.set_terminal_count(0, 0)
        if not session_id:
            return
        self.terminal_streams.attach(default_hub(), session_id)
        streams = self.terminal_streams.known_streams()
        self.workspace.set_terminal_count(self.terminal_streams.live_stream_count(), len(streams))
        if was_open:
            # The user asked to watch a terminal, not to watch *that* session's
            # terminal. Closing the window without saying so reads as a bug.
            self.open_terminal_window(take_focus=False)

    def _focused_session_id(self) -> str:
        return str(getattr(self.run_bridge, "focused_session_id", "") or "")

    @traces(SWR.SWR_2415)
    def _focus_session(self, session_id: str) -> bool:
        """Switch the workspace to another run; lifecycles are untouched."""
        bridge = self.run_bridge
        focus = getattr(bridge, "focus", None)
        if not callable(focus):
            # Single-run host: fall back to loading the persisted session.
            if self.config_service is not None:
                self.config_service.load_session(session_id)
            self._resume_session_id = session_id
            self.show_view("workspace")
            return True
        if not focus(session_id):
            return False
        self.show_view("workspace")
        return True

    @traces(SWR.SWR_2415)
    def _continue_session(self, session_id: str) -> None:
        """Focus a finished run and put the composer on its follow-up prompt."""
        if not self._focus_session(session_id):
            return
        self._resume_session_id = session_id
        self.workspace.composer.setFocus()

    @traces(SWR.SWR_2507)
    def _run_failed(self, message: str) -> None:
        self.store.set_session_status("failed")
        if self._maybe_recover_auth_failure(message):
            return
        requested_sandbox = self._launch_sandbox_mode
        self._launch_sandbox_mode = ""
        if requested_sandbox and requested_sandbox != "off":
            # The run asked for a sandbox and never reported started, so it
            # never reached the loop. SWR-2507 requires the refusal itself to
            # be what the user reads — the backend's reason and remediation,
            # verbatim — rather than a generic failure that invites a retry
            # the host cannot satisfy either.
            self.workspace.set_sandbox_status(False, "")
            self._report_error(
                "Run stopped before it started",
                message,
                details=message,
                action_label="Review run",
                action_id="view.workspace",
            )
            return
        lower = message.casefold()
        if "rate limit" in lower or "quota" in lower:
            # SWR-3013: on Rotaris Cloud the limit is money, and Rotaris knows
            # the number. Say it, and re-read it — the balance that produced this
            # failure is by definition out of date.
            credit = self.store.cloud_credit
            if self._runs_on_rotaris_cloud() and credit.phase == "ready":
                self.refresh_cloud_credit()
                self._report_error(
                    "Rotaris Cloud credit reached",
                    f"Rotaris Cloud reports {credit.balance_label} left "
                    f"({credit.state_label.lower()}). The session is preserved — "
                    "top up the account or choose a model on another provider.",
                    details=message,
                    action_label="Open Rotaris Cloud",
                    action_id="cloud.account",
                )
                return
            self._report_error(
                "Provider limit reached",
                "The session is preserved. Choose another model or retry when the provider resets.",
                details=message,
                action_label="Change model",
                action_id="view.settings",
            )
            return
        self._report_error(
            "Run failed",
            "Rotaris kept the session and draft available for recovery.",
            details=message,
            action_label="Review run",
            action_id="view.workspace",
        )

    # ── auth-failure recovery ─────────────────────────────────────────────

    def _maybe_recover_auth_failure(self, message: str) -> bool:
        """Fallback-model retry on the first auth failure; recovery modal after that."""
        if self.run_bridge is None or self.config_service is None or not self._last_prompt:
            return False
        from rotaris_core.llm_errors import is_auth_error

        if not is_auth_error(message):
            return False
        failed_model = self.config_service.entry_model()
        fallback = self.config_service.fallback_model()
        if not self._auth_fallback_attempted and fallback and fallback != failed_model:
            self._auth_fallback_attempted = True
            self._set_run_model(fallback)
            self.notify(
                f"Authentication failed for {failed_model or 'the active model'}; "
                f"retrying with fallback {fallback}.",
                error=True,
            )
            if self._restart_run():
                # The run now continues on the fallback; concurrently ask the
                # user to re-authenticate the primary provider so the run can
                # switch back once credentials are fixed.
                self._prompt_primary_reauth(failed_model, fallback, message)
                return True
            self._auth_fallback_attempted = False
            return False
        self._open_auth_recovery(message, failed_model)
        return True

    def _prompt_primary_reauth(self, primary_model: str, fallback_model: str, message: str) -> None:
        """Non-modal reauth prompt for the primary provider while the fallback runs."""
        from rotaris.views.auth_recovery import PrimaryReauthDialog

        config_service = self.config_service
        if config_service is None:
            return
        self._close_reauth_prompt()
        provider_id = config_service.model_provider(primary_model)
        if not provider_id:
            return
        self._primary_reauth_model = primary_model
        dialog = PrimaryReauthDialog(
            primary_model=primary_model,
            fallback_model=fallback_model,
            provider_id=provider_id,
            provider_flow=config_service.provider_flow_type(provider_id),
            error_message=message,
            parent=self,
        )
        dialog.reauth_submitted.connect(self._primary_reauthenticated)
        self._reauth_prompt = dialog
        dialog.show()

    def _primary_reauthenticated(self, provider_id: str, api_key: str) -> None:
        config_service = self.config_service
        if api_key:
            if config_service is None:
                self.notify("Provider configuration is unavailable.", error=True)
                return
            try:
                config_service.save_provider_api_key(provider_id, api_key)
            except (OSError, RuntimeError, ValueError) as exc:
                self.notify(f"Could not store API key: {exc}", error=True)
                return
        primary = self._primary_reauth_model
        self._primary_reauth_model = ""
        self._close_reauth_prompt()
        if not primary:
            return
        # Credentials changed: a future auth failure should get a fresh
        # fallback retry instead of jumping straight to the modal.
        self._auth_fallback_attempted = False
        self._set_run_model(primary)
        if (
            self.run_bridge is not None
            and getattr(self.run_bridge, "running", False)
            and self.run_bridge.switch_entry_model(primary)
        ):
            self.notify(f"Re-authenticated; switching back to {primary} from the next iteration.")
            return
        self.notify(f"Re-authenticated; {primary} will be used for the next run.")

    def _close_reauth_prompt(self) -> None:
        dialog = self._reauth_prompt
        self._reauth_prompt = None
        if dialog is not None:
            dialog.close()

    def _open_auth_recovery(self, message: str, failed_model: str) -> None:
        from rotaris.views.auth_recovery import AuthRecoveryDialog

        config_service = self.config_service
        if config_service is None:
            self.notify(message, error=True)
            return
        # The modal recovery dialog supersedes the background reauth prompt —
        # never show two competing auth dialogs.
        self._close_reauth_prompt()
        provider_id = config_service.model_provider(failed_model)
        dialog = AuthRecoveryDialog(
            failed_model=failed_model,
            provider_id=provider_id,
            provider_flow=config_service.provider_flow_type(provider_id),
            model_providers=config_service.model_providers(),
            error_message=message,
            parent=self,
        )
        dialog.model_selected.connect(self._retry_with_model)
        dialog.reauth_submitted.connect(self._reauth_and_retry)
        self._auth_dialog = dialog
        dialog.open()

    def _retry_with_model(self, model: str) -> None:
        # Deliberately keep _auth_fallback_attempted set: if the hand-picked
        # model also fails to authenticate, reopen the modal instead of
        # bouncing back onto the already-failed fallback model.
        self._set_run_model(model)
        if not self._restart_run():
            self.notify("Could not restart the run.", error=True)

    def _reauth_and_retry(self, provider_id: str, api_key: str) -> None:
        config_service = self.config_service
        if api_key:
            if config_service is None:
                self.notify("Provider configuration is unavailable.", error=True)
                return
            try:
                config_service.save_provider_api_key(provider_id, api_key)
            except (OSError, RuntimeError, ValueError) as exc:
                self.notify(f"Could not store API key: {exc}", error=True)
                return
        if not self._restart_run():
            self.notify("Could not restart the run.", error=True)

    def _set_run_model(self, model: str) -> None:
        self.store.set_active_model(model)
        if self.store.session_model_override != model:
            # set_active_model no-ops when the model already matches
            # active_model; the override must still be pinned for the run.
            self.store.session_model_override = model

    def _restart_run(self) -> bool:
        run_bridge = self.run_bridge
        if run_bridge is None:
            return False
        return bool(run_bridge.start(self._last_prompt, self.store.session_name or None))

    def _store_updated(self) -> None:
        with self.diagnostics.span("main_window.store_refresh"):
            for window in self.agent_windows.values():
                window.refresh()

    # ── application actions and feedback ─────────────────────────────────

    def _restore_ui_state(self) -> None:
        key = self.store.workspace_path or "default"
        draft = self._ui_settings.value(f"workspaces/{key}/composerDraft", "")
        self.store.ui.composer_draft = str(draft or "")
        popout = self._ui_settings.value("interface/agentPopout", False, type=bool)
        self.store.ui.agent_popout = bool(popout)
        terminal_popout = self._ui_settings.value("interface/terminalPopout", False, type=bool)
        self.store.ui.terminal_popout = bool(terminal_popout)
        collapse = self._ui_settings.value("display/autoCollapseTools", False, type=bool)
        self.store.ui.auto_collapse_tools = bool(collapse)
        grouping = self._ui_settings.value("display/groupToolCalls", True, type=bool)
        self.store.ui.group_tool_calls = bool(grouping)
        cleanup = self._ui_settings.value("interface/worktreeCleanupPrompt", True, type=bool)
        self.store.ui.worktree_cleanup_prompt_enabled = bool(cleanup)
        self._settings_tab = str(
            self._ui_settings.value("interface/settingsTab", "models") or "models"
        )

    @traces(SWR.SWR_2090)
    def set_agent_popout(self, enabled: bool) -> None:
        self.store.set_agent_popout(enabled)
        self._ui_settings.setValue("interface/agentPopout", enabled)

    @traces(SWR.SWR_2420)
    def _persist_auto_collapse_tools(self, enabled: bool) -> None:
        self._ui_settings.setValue("display/autoCollapseTools", enabled)

    @traces(SWR.SWR_2432)
    def _persist_group_tool_calls(self, enabled: bool) -> None:
        self._ui_settings.setValue("display/groupToolCalls", enabled)

    @traces(SWR.SWR_2405)
    def _persist_worktree_cleanup_prompt(self, enabled: bool) -> None:
        self.store.set_worktree_cleanup_prompt(enabled)
        self._ui_settings.setValue("interface/worktreeCleanupPrompt", enabled)

    def _persist_settings_tab(self, tab_id: str) -> None:
        self._ui_settings.setValue("interface/settingsTab", tab_id)

    @traces(SWR.SWR_3012)
    def _reset_panel_sizes(self) -> None:
        """Put every resizable pane back to its default, here and next launch.

        No confirmation: the only thing discarded is layout preference, and any
        width can be dragged back in one gesture — a modal would cost the user
        more than the mistake would.
        """
        from rotaris.services.panel_layout import panel_layout_service

        panel_layout_service().reset_all()
        self.notify("Panel sizes reset to defaults.")

    def _persist_composer_draft(self, text: str) -> None:
        key = self.store.workspace_path or "default"
        self._ui_settings.setValue(f"workspaces/{key}/composerDraft", text)

    def _persist_prompts(self) -> None:
        if self._prompt_persistence is None:
            return
        try:
            self._prompt_persistence.save()
        except OSError as exc:
            self._report_error(
                "Could not save prompt history",
                "Rotaris will keep prompts in memory for this window.",
                details=str(exc),
            )

    def _register_commands(self) -> None:
        for index, view_id in enumerate(self.VIEW_ORDER, start=1):
            label = view_id.replace("dashboard", "Overview").title()
            self.commands.register(
                f"view.{view_id}",
                f"Open {label}",
                f"Ctrl+{index}",
                partial(self.show_view, view_id),
            )
        self.commands.register("palette", "Open command palette", "Ctrl+K", self._show_palette)
        self.commands.register(
            "settings", "Open Settings", "Ctrl+,", lambda: self.show_view("settings")
        )
        self.commands.register(
            "transcript.search", "Search transcript", "Ctrl+F", self._search_transcript
        )
        self.commands.register("composer.focus", "Focus run prompt", "Ctrl+L", self._focus_composer)
        self.commands.register(
            "run.submit", "Start or continue run", "Ctrl+Return", self._submit_from_composer
        )
        self.commands.register(
            "terminal.open",
            "Open terminal",
            "Ctrl+Shift+T",
            self.open_terminal_window,
            keywords="shell console bash command output",
        )
        self.commands.register("help", "Show keyboard help", "F1", self._show_keyboard_help)
        self.commands.register("escape", "Close current overlay", "Escape", self._escape_overlay)

    @traces(SWR.SWR_2442)
    def _rebuild_slash_catalogue(self) -> None:
        build_slash_catalogue(self)

    @traces(SWR.SWR_2438)
    def _report_slash_error(self, message: str) -> None:
        """Surface a rejected command persistently — a toast outlives its use here."""
        self._report_error("Command not run", message)

    def _show_palette(self) -> None:
        CommandPaletteDialog(self.commands, self).exec()

    def _show_keyboard_help(self) -> None:
        rows = "<br>".join(
            f"<b>{command.shortcut}</b> — {command.label}"
            for command in self.commands.commands()
            if command.shortcut and command.id != "escape"
        )
        QMessageBox.information(self, "Rotaris keyboard help", rows)

    def _search_transcript(self) -> None:
        self.show_view("workspace")
        self.workspace.open_search()

    def _focus_composer(self) -> None:
        self.show_view("workspace")
        self.workspace.composer.setFocus()

    def _submit_from_composer(self) -> None:
        self.show_view("workspace")
        if self.workspace.send_button.isEnabled():
            self.workspace._submit()

    def _escape_overlay(self) -> None:
        if self.store.ui.active_view != "workspace":
            return
        if self.workspace.search_panel.isVisible():
            self.workspace.close_search()
            return
        self.store.set_drawer_state(sidebar=False, inspector=False)
        self.workspace._apply_responsive_layout()

    # ── project initialization (SWR-2802, SWR-2805) ──────────────────────
    #
    # The window is the only place that knows a modal, a worker thread and a
    # store exist at the same time, so all three are joined here. Nothing below
    # names an initialization task: the registry answers "what does this
    # workspace still owe?", the modal renders whatever descriptors it is
    # handed, and the worker dispatches them. A task added later reaches the
    # user through this same code, unchanged.

    @traces(SWR.SWR_2802, SWR.SWR_2805, SWR.SWR_2821)
    def _resolve_project_initialization(self) -> None:
        """Ask the registry what this workspace still owes, and act on the answer.

        Runs once, on workspace open. The registry owns the decision *and* its
        side effects — a workspace where no task applies is marked initialized
        in there, not here — so this forwards the answer into the store, starts
        whatever needs no decision from the user (SWR-2821), and lets the store
        signal decide whether a modal belongs on screen for the rest.
        """
        service = self.config_service
        if service is None or getattr(service, "config", None) is None:
            return
        from rotaris_core.init import registry

        try:
            decision = registry.resolve_or_prompt(service.config, service.workspace)
            self._project_init_tasks = tuple(decision.tasks)
            service.refresh_initialization()
        except Exception as exc:  # noqa: BLE001 — a failed probe must not block the window
            # Raised into a queued timer callback this would abort the event
            # loop, and a workspace whose setup cannot even be *checked* must
            # still open. The gate stays off, so nothing is silently blocked.
            self._report_error(
                "Project setup could not be checked",
                "Rotaris could not work out whether this workspace still needs "
                "setting up. Runs are not blocked; you can check again.",
                details=str(exc),
                action_label="Check again",
                action_id="project.resolve",
            )
            return
        # ConfigService.load() may already have projected exactly this state, in
        # which case the guarded setter emitted nothing — evaluate it once here
        # so a first-run workspace still gets its prompt.
        self._sync_project_init_prompt()
        self._start_background_initialization(decision.background, service)

    @traces(SWR.SWR_2821)
    def _start_background_initialization(self, tasks: tuple[Any, ...], service: Any) -> None:
        """Run the tasks that need no decision, without a dialog (SWR-2821).

        The same worker the modal drives, with nothing rendering its progress:
        there is no question to answer, so there is nothing for a user to watch.
        Where it *is* visible is Settings ▸ Project, which renders the recorded
        state the run writes, and the error banner if the run breaks down.

        Started after the prompt sync so that a workspace owing both kinds shows
        its modal immediately rather than behind a worker launch.
        """
        if not tasks:
            return
        worker = self._project_init_worker
        if worker is not None and worker.isRunning():
            return

        from rotaris.services.project_init_service import ProjectInitService

        self.store.set_initialization_running(True)
        worker = ProjectInitService(
            service.config,
            service.workspace,
            tasks=list(tasks),
            parent=self,
        )
        # Deliberately not connected to the per-step signals: with no modal on
        # screen there is nothing to deliver them to, and the finish handlers
        # below already refresh the store from what was recorded.
        worker.run_finished.connect(self._background_init_run_finished)
        worker.run_failed.connect(self._background_init_run_failed)
        worker.run_cancelled.connect(self._project_init_run_cancelled)
        worker.finished.connect(self._project_init_worker_finished)
        self._project_init_worker = worker
        worker.start()

    @traces(SWR.SWR_2821)
    def _model_is_reachable(self) -> bool:
        """Whether a run could reach a model at all, by the composer's own rule.

        The same two conditions `_submit_prompt` checks before dispatching a run:
        something to call, and a provider that answers. Read here so an agentic
        setup task fails fast with a sentence rather than after an MCP server
        start and a provider's own authentication error.
        """
        store = self.store
        if not store.active_model and not store.model_catalog:
            return False
        return not store.providers or any(provider.connected for provider in store.providers)

    @traces(SWR.SWR_2821)
    def _background_init_run_finished(self, results: Any) -> None:
        """Publish what a background run recorded; report a task that failed.

        Success is deliberately silent — nothing was asked, so nothing needs
        acknowledging, and Settings ▸ Project shows the recorded state for anyone
        who looks. A failure recorded nothing and stays runnable, so the workspace
        is no worse off than before; but staying quiet about it would leave a user
        wondering why symbol search is slow, so it reaches the error banner with
        the SWR-2805 action that re-runs exactly what is left.
        """
        entries = list(results) if isinstance(results, list) else []
        failures = [entry for entry in entries if getattr(entry, "status", "") == "failure"]
        message = ""
        if failures:
            message = getattr(failures[0], "error", "") or "Project setup did not finish."
        # Shared with the prompted path: it is what clears the run flag, and it
        # clears it even when re-reading the workspace fails.
        self._publish_project_init_outcome(message)
        if not failures:
            return
        self._report_error(
            "Project setup did not finish",
            getattr(failures[0], "summary", "")
            or "Rotaris could not finish setting this workspace up for code search.",
            details=_project_init_details(entries),
            action_label="Try again",
            action_id="project.initialize",
        )

    @traces(SWR.SWR_2821)
    def _background_init_run_failed(self, message: str) -> None:
        """The background run itself broke down; nothing was recorded."""
        self._publish_project_init_outcome(message)
        self._report_error(
            "Project setup did not finish",
            "Rotaris could not finish setting this workspace up for code search. "
            "Runs are not blocked; you can try again.",
            details=message,
            action_label="Try again",
            action_id="project.initialize",
        )

    def _on_initialization_changed(self, _state: object) -> None:
        self._sync_project_init_prompt()

    @traces(SWR.SWR_2802)
    def _sync_project_init_prompt(self) -> None:
        """Open, keep, or silently close the first-run modal from store state.

        The same shape as the approval modal in :mod:`rotaris.views.transcript`:
        state decides whether a modal belongs on screen, opening is idempotent
        so a re-entrant signal cannot stack two, and a request that disappears
        while the prompt is up closes it without inventing an answer. A modal
        the user opened themselves (SWR-2805) is never closed this way — they
        asked for it, and no store change revokes that.
        """
        if self.store.initialization.should_prompt:
            self._open_project_init_dialog(auto=True)
            return
        dialog = self._project_init_dialog
        if (
            self._project_init_auto_opened
            and dialog is not None
            and dialog.state == INIT_STATE_PROMPT
            # Closed only when the request is really gone, not merely while a run
            # is in flight: background setup sets the same run flag (SWR-2821),
            # and reading `should_prompt` alone here would have it shut a question
            # the user has not answered.
            and not self.store.initialization.pending_consent
        ):
            self._close_project_init_dialog()

    @traces(SWR.SWR_2802, SWR.SWR_2805)
    def _open_project_init_dialog(self, *, auto: bool) -> None:
        """Show the prompt for the tasks currently listed; no-op if one is open."""
        if self._project_init_dialog is not None:
            return
        dialog = ProjectInitDialog(self)
        # SWR-2802: the prompt must not block the rest of Rotaris. The user can
        # keep navigating; what stops a run is the composer gate in the
        # workspace view, which states why it is locked.
        dialog.setWindowModality(Qt.WindowModality.NonModal)
        dialog.set_tasks(self._project_init_tasks)
        dialog.resolved.connect(self._on_project_init_resolved)
        dialog.finished.connect(self._on_project_init_dialog_finished)
        self._project_init_dialog = dialog
        self._project_init_auto_opened = auto
        dialog.show()

    def _on_project_init_dialog_finished(self, _result: int) -> None:
        """Drop the reference once the modal has closed itself."""
        dialog = self._project_init_dialog
        self._project_init_dialog = None
        self._project_init_auto_opened = False
        if dialog is not None:
            dialog.deleteLater()

    def _close_project_init_dialog(self) -> None:
        """Close the modal without deciding — its request is already resolved."""
        dialog = self._project_init_dialog
        self._project_init_dialog = None
        self._project_init_auto_opened = False
        if dialog is not None:
            # Muted on the way out: an unmuted close reads as "skip", which
            # would record an answer the user never gave.
            dialog.blockSignals(True)
            dialog.close()
            dialog.deleteLater()

    def _request_project_initialization(self) -> None:
        """Open the prompt on demand, listing whatever is still unresolved.

        SWR-2805's manual trigger. Both the Workspace action and the Settings ▸
        Project action land here, and both reach the SWR-2802 modal — a skipped
        task is still runnable, so this lists more than the first-run prompt
        would.
        """
        service = self.config_service
        if service is None or getattr(service, "config", None) is None:
            self._report_error(
                "Workspace unavailable",
                "Open Rotaris with a workspace before initializing it.",
                action_label="Open Overview",
                action_id="view.dashboard",
            )
            return
        if self._project_init_dialog is not None:
            self._project_init_dialog.raise_()
            self._project_init_dialog.activateWindow()
            return
        from rotaris_core.init import registry

        try:
            self._project_init_tasks = tuple(
                registry.runnable_tasks(service.config, service.workspace)
            )
        except Exception as exc:  # noqa: BLE001 — reported, never raised at the user
            self._report_error(
                "Project setup could not be checked",
                "Rotaris could not list this workspace's setup tasks.",
                details=str(exc),
                action_label="Try again",
                action_id="project.initialize",
            )
            return
        self._open_project_init_dialog(auto=False)

    @traces(SWR.SWR_2802, SWR.SWR_2805)
    def _on_project_init_resolved(self, intent: str) -> None:
        """Deliver the modal's decision: record a deferral, or start the run."""
        dialog = self._project_init_dialog
        if dialog is None:
            return
        service = self.config_service
        if service is None or getattr(service, "config", None) is None:
            dialog.show_error("This workspace is no longer available, so setup cannot run.")
            return
        if intent == INIT_INTENT_INITIALIZE:
            self._start_project_initialization(dialog, service)
        else:
            self._skip_project_initialization(dialog, service)

    @traces(SWR.SWR_2802)
    def _skip_project_initialization(self, dialog: ProjectInitDialog, service: Any) -> None:
        """Record the listed tasks as deferred, then let the modal close."""
        from rotaris_core.init import registry

        try:
            registry.record_skipped(service.workspace, dialog.task_ids)
        except Exception as exc:  # noqa: BLE001 — an unsaved answer must be visible
            message = f"Your choice could not be saved: {exc}"
            dialog.show_error(message)
            service.refresh_initialization(last_error=message)
            return
        dialog.complete_decision()
        service.refresh_initialization()

    @traces(SWR.SWR_2802, SWR.SWR_2805)
    def _start_project_initialization(self, dialog: ProjectInitDialog, service: Any) -> None:
        """Run the still-pending tasks on a worker thread and stream them back."""
        from rotaris_core.init import registry

        from rotaris.services.project_init_service import ProjectInitService

        worker = self._project_init_worker
        if worker is not None and worker.isRunning():
            # A second Initialize while one run is live starts nothing — but the
            # modal already locked itself on the click, so show it the run that
            # is actually in flight rather than leaving it frozen mid-decision.
            dialog.set_in_progress()
            return
        try:
            tasks = tuple(registry.runnable_tasks(service.config, service.workspace))
        except Exception as exc:  # noqa: BLE001 — reported into the modal, not raised
            message = f"Setup could not be started: {exc}"
            dialog.show_error(message)
            service.refresh_initialization(last_error=message)
            return
        if not tasks:
            dialog.show_done("Everything in this workspace is already set up.")
            service.refresh_initialization()
            return
        if any(task.requires_consent for task in tasks) and not self._model_is_reachable():
            # A task that runs an agent needs a provider, and finding that out
            # the slow way costs the user an MCP server start and then hands them
            # a raw authentication error. Say it up front instead (SWR-2821).
            message = (
                "This setup step runs an agent, so it needs a model provider. "
                "Authenticate one in Settings, then start it again."
            )
            dialog.show_error(message)
            service.refresh_initialization(last_error=message)
            self._report_error(
                "Project setup needs a provider",
                message,
                action_label="Open Settings",
                action_id="view.settings",
            )
            return

        self._project_init_tasks = tasks
        if tuple(task.id for task in tasks) != dialog.task_ids:
            # A retry after a partly successful run lists only what is left; a
            # completed task is never offered again (SWR-2805).
            dialog.set_tasks(tasks)
        # In-progress first: publishing the run flag re-evaluates the prompt, and
        # a modal still in its prompt state would be taken for a stale request.
        dialog.set_in_progress()
        self.store.set_initialization_running(True)

        worker = ProjectInitService(
            service.config,
            service.workspace,
            tasks=list(tasks),
            parent=self,
        )
        # Routed through the window rather than straight into the modal: the
        # modal can be gone by the time a step arrives, and every one of these
        # slots checks before it renders.
        worker.task_started.connect(self._project_init_task_started)
        worker.step_reported.connect(self._project_init_step_reported)
        worker.task_finished.connect(self._project_init_task_finished)
        worker.run_finished.connect(self._project_init_run_finished)
        worker.run_failed.connect(self._project_init_run_failed)
        worker.run_cancelled.connect(self._project_init_run_cancelled)
        worker.finished.connect(self._project_init_worker_finished)
        self._project_init_worker = worker
        worker.start()

    def _project_init_task_started(self, task_id: str, label: str) -> None:
        if self._project_init_dialog is not None:
            self._project_init_dialog.report_task_started(task_id, label)

    def _project_init_step_reported(
        self,
        task_id: str,
        name: str,
        status: str,
        detail: str,
    ) -> None:
        if self._project_init_dialog is not None:
            self._project_init_dialog.report_step(task_id, name, status, detail)

    def _project_init_task_finished(self, task_id: str, result: Any) -> None:
        if self._project_init_dialog is not None:
            self._project_init_dialog.report_task_finished(
                task_id,
                getattr(result, "status", "failure"),
                getattr(result, "error", "") or "",
            )

    @traces(SWR.SWR_2802)
    def _project_init_run_finished(self, results: Any) -> None:
        """Report the finished run: success closes the loop, failure keeps retry.

        A failed task records nothing, so the workspace is still pending and the
        modal stays open on its retry action — the notice offers the same retry
        for a user who closed the modal instead.
        """
        entries = list(results) if isinstance(results, list) else []
        failures = [entry for entry in entries if getattr(entry, "status", "") == "failure"]
        message = ""
        if failures:
            message = getattr(failures[0], "error", "") or "Setup did not finish."
        self._publish_project_init_outcome(message)

        dialog = self._project_init_dialog
        if failures:
            if dialog is not None:
                dialog.show_error(message)
            self._report_error(
                "Project setup failed",
                message,
                details=_project_init_details(entries),
                action_label="Retry initialization",
                action_id="project.initialize",
            )
            return
        if dialog is not None:
            dialog.show_done(_project_init_summary(entries))
        self.notify("Project setup finished.")

    @traces(SWR.SWR_2802)
    def _project_init_run_failed(self, message: str) -> None:
        """The run itself broke down; nothing was recorded, so retry is honest."""
        self._publish_project_init_outcome(message)
        if self._project_init_dialog is not None:
            self._project_init_dialog.show_error(message)
        self._report_error(
            "Project setup failed",
            message,
            action_label="Retry initialization",
            action_id="project.initialize",
        )

    def _project_init_run_cancelled(self) -> None:
        self._publish_project_init_outcome("")

    def _publish_project_init_outcome(self, message: str) -> None:
        """Clear the run flag and re-read what is on disk, in one guarded write.

        The fallback matters more than it looks: if re-reading the workspace
        fails, the run flag must still be cleared, or the Settings tab and the
        composer stay stuck on "initializing" for the rest of the session.
        """
        service = self.config_service
        if service is not None and getattr(service, "config", None) is not None:
            try:
                service.refresh_initialization(last_error=message)
                return
            except Exception as exc:  # noqa: BLE001 — never leave the run flag stuck
                message = message or f"Setup finished, but its result could not be read: {exc}"
        self.store.set_initialization_running(False)
        if message:
            self.store.set_initialization_error(message)

    def _project_init_worker_finished(self) -> None:
        worker = self._project_init_worker
        self._project_init_worker = None
        if worker is not None:
            worker.deleteLater()

    @traces(SWR.SWR_2802)
    def _shutdown_project_init(self) -> None:
        """Stop the setup worker before the window is destroyed.

        A live ``QThread`` at teardown takes the process down with it, so this
        runs on every close — programmatic or interactive — and never asks the
        user anything: :meth:`ProjectInitService.shutdown` mutes its own signals
        and terminates as a last resort.
        """
        worker = self._project_init_worker
        self._project_init_worker = None
        if worker is not None:
            worker.shutdown()
        self._close_project_init_dialog()

    # ── update notification (SWR-3003) ────────────────────────────────────

    #: QSettings key holding the version the user asked not to be told about
    #: again. One version, not a list: "remind next launch" is about the release
    #: on offer, and a newer one is a different question (AC-007).
    DISMISSED_UPDATE_KEY = "updates/dismissedVersion"

    # ── Rotaris Cloud credit (SWR-3013) ───────────────────────────────────

    @traces(SWR.SWR_3013)
    def start_cloud_credit(self, bridge: Any | None = None) -> None:
        """Begin reading the Rotaris Cloud balance, and keep reading it.

        ``bridge`` is injectable for the same reason the update one is: a window
        built in a test must not reach the network.
        """
        if bridge is None:
            from rotaris.services.cloud_account_bridge import CloudAccountBridge

            bridge = CloudAccountBridge(parent=self)
        self._cloud_bridge = bridge
        bridge.credit.connect(self.store.set_cloud_credit)
        bridge.start()

    @traces(SWR.SWR_3013)
    def _run_state_changed_for_credit(self, state: str) -> None:
        """Re-read the balance when a run stops, since that is when it moved."""
        if state in {"idle", "failed", "paused"}:
            self.refresh_cloud_credit()

    @traces(SWR.SWR_3013)
    def refresh_cloud_credit(self) -> None:
        """Re-read the balance now — after a sign-in, a run, or on request."""
        if self._cloud_bridge is not None:
            self._cloud_bridge.refresh()

    @traces(SWR.SWR_3013)
    def _open_rotaris_cloud(self) -> None:
        """Open the account page, which is where credit is actually bought."""
        from rotaris.services.config_service import ROTARIS_CLOUD_QUICK_START_URL

        QDesktopServices.openUrl(QUrl(ROTARIS_CLOUD_QUICK_START_URL))

    @traces(SWR.SWR_3013)
    def _cloud_sign_in(self) -> None:
        self.show_view("settings")
        self.settings.authenticate_rotaris_cloud()

    @traces(SWR.SWR_3013)
    def _runs_on_rotaris_cloud(self) -> bool:
        service = self.config_service
        if service is None:
            return False
        checker = getattr(service, "uses_rotaris_cloud", None)
        return bool(checker()) if callable(checker) else False

    @traces(SWR.SWR_3013)
    def _confirm_cloud_credit(self) -> bool:
        """Catch a run the Rotaris Cloud account cannot pay for, before it starts.

        Reads what the last poll already told us rather than asking the backend
        again: starting a run must not wait on a network round trip, and the
        backend refuses an unaffordable call anyway. Returns False only when the
        user chose not to start.
        """
        credit = self.store.cloud_credit
        if not credit.blocked or not self._runs_on_rotaris_cloud():
            return True
        dialog = ConfirmImpactDialog(
            "Rotaris Cloud has no credit",
            f"Rotaris Cloud reports {credit.balance_label} left ({credit.state_label.lower()}) "
            "and will refuse this account's next call.",
            [
                "The run will start and fail on its first model call.",
                "Top up the account, or switch the model slots to another provider.",
            ],
            confirm_label="Start anyway",
            parent=self,
        )
        started = dialog.exec() == QDialog.DialogCode.Accepted
        if not started:
            self._open_rotaris_cloud()
        return started

    @traces(SWR.SWR_3003)
    def start_update_check(self, bridge: Any | None = None) -> bool:
        """Ask whether a newer Rotaris exists. Called once, after the window shows.

        Returns False when nothing was asked — which is the normal case for a pip
        install (AC-001) and for the demo window. ``bridge`` is injectable so the
        desktop test drives the real flow against a recorded release.
        """
        if bridge is None:
            from rotaris.services.update_bridge import UpdateBridge

            bridge = UpdateBridge(parent=self)
        self._update_bridge = bridge
        bridge.available.connect(self._update_available)
        bridge.progress.connect(self._update_progress)
        bridge.applied.connect(self._update_applied)
        bridge.failed.connect(self._update_failed)
        return bool(bridge.check(self.store.app_version))

    @traces(SWR.SWR_3003)
    def _update_available(self, offer: Any) -> None:
        """Offer the update, unless this is the version the user waved off (AC-007)."""
        dismissed = str(self._ui_settings.value(self.DISMISSED_UPDATE_KEY, "") or "")
        if offer.version == dismissed:
            return
        self._update_offer = offer
        self._update_progress_percent = -1
        summary = offer.summary or "Open the release notes for the full changelog."
        self._publish_update_notice(
            NoticeSeverity.INFO,
            f"Rotaris {offer.version} is available",
            summary,
            action_label="Update now",
            action_id="update.install",
            persistent=True,
        )

    def _publish_update_notice(
        self,
        severity: NoticeSeverity,
        title: str,
        message: str,
        *,
        action_label: str = "",
        action_id: str = "",
        details: str = "",
        persistent: bool = False,
    ) -> None:
        """Publish an update notice, remembering its id so Dismiss can be told apart.

        The banner is shared with every other notice in the application; without
        the id, dismissing an unrelated error would persist a dismissed version.
        """
        self._update_notice_id = self.store.new_notice_id()
        self.store.publish_notice(
            UiNotice(
                id=self._update_notice_id,
                severity=severity,
                title=title,
                message=message,
                details=details,
                persistent=persistent,
                action_label=action_label,
                action_id=action_id,
            )
        )

    @traces(SWR.SWR_3003)
    def _remember_dismissed_update(self, notice_id: str) -> None:
        """ "Remind next launch": record the version, not the fact of dismissal.

        Also reached by closing the banner without choosing, which AC-006 defines
        as the same answer.
        """
        if not notice_id or notice_id != self._update_notice_id:
            return
        offer = self._update_offer
        if offer is not None:
            self._ui_settings.setValue(self.DISMISSED_UPDATE_KEY, offer.version)

    @traces(SWR.SWR_3003)
    def _update_progress(self, received: int, total: int) -> None:
        """Report the download in the notice that offered it (AC-009).

        Whole percents only: the signal arrives once per megabyte, and repainting
        a banner that often to move a number by nothing is work the user pays for.
        """
        offer = self._update_offer
        if offer is None:
            return
        percent = int(received * 100 / total) if total > 0 else -1
        if percent == self._update_progress_percent:
            return
        self._update_progress_percent = percent
        measured = f"{percent}%" if percent >= 0 else f"{received // (1024 * 1024)} MB"
        self._publish_update_notice(
            NoticeSeverity.INFO,
            f"Downloading Rotaris {offer.version}",
            f"{measured} — verifying against the published checksum when it finishes.",
        )

    @traces(SWR.SWR_3003)
    def _update_applied(self, applied: Any) -> None:
        """The update is installed, or handed over to whatever installs it (AC-011)."""
        from rotaris_core.updates import Outcome

        self._applied_update = applied
        restartable = applied.outcome is Outcome.REPLACED
        self._publish_update_notice(
            NoticeSeverity.SUCCESS,
            "Update installed" if restartable else "Finish the update",
            applied.message,
            action_label="Restart now" if restartable else "",
            action_id="update.restart" if restartable else "",
            persistent=True,
        )
        if applied.quit_required:
            # The installer is already running and cannot write over a live
            # process. Long enough to read the sentence, short enough that the
            # installer is not left waiting on a window nobody is looking at.
            QTimer.singleShot(1200, self.close)

    @traces(SWR.SWR_3003)
    def _update_failed(self, message: str) -> None:
        """A refused checksum or a failed install, said plainly (AC-010, AC-012)."""
        self._publish_update_notice(
            NoticeSeverity.ERROR,
            "Update not installed",
            "Rotaris is unchanged. You can try again or download the release manually.",
            details=message,
            action_label="Try again",
            action_id="update.install",
            persistent=True,
        )

    def _install_update(self) -> None:
        offer = self._update_offer
        bridge = self._update_bridge
        if offer is None or bridge is None:
            return
        self._update_progress_percent = -1
        bridge.install_update(offer)

    @traces(SWR.SWR_3003)
    def _restart_into_update(self) -> None:
        """Launch the newly installed binary and leave (AC-013)."""
        from rotaris_core.updates import UpdateApplyError, restart

        applied = self._applied_update
        if applied is None:
            return
        try:
            launched = restart(applied)
        except UpdateApplyError as exc:
            self._update_failed(str(exc))
            return
        if launched:
            self.close()

    def _refresh_notice(self) -> None:
        self.notice_banner.show_notice(self.store.ui.notice)

    def _report_error(
        self,
        title: str,
        message: str,
        *,
        details: str = "",
        action_label: str = "",
        action_id: str = "",
    ) -> None:
        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.ERROR,
                title=title,
                message=message,
                details=details,
                persistent=True,
                action_label=action_label,
                action_id=action_id,
            )
        )

    def _handle_notice_action(self, action_id: str) -> None:
        if action_id.startswith("view."):
            self.show_view(action_id.removeprefix("view."))
        elif action_id == "run.retry":
            prompt = self.store.ui.composer_draft or self._last_prompt
            if prompt:
                self._submit_prompt(prompt)
        elif action_id == "settings.hooks":
            self.show_view("settings")
            self.settings.set_active_tab("hooks")
        elif action_id == "settings.save":
            self._save_settings()
        elif action_id == "library.artifacts":
            self.show_view("library")
            self.library.set_active_tab("artifacts")
        elif action_id == "library.proposals":
            self.show_view("library")
            self.library.set_active_tab("proposals")
        elif action_id == "update.install":
            self._install_update()
        elif action_id == "update.restart":
            self._restart_into_update()
        elif action_id == "cloud.account":
            self._open_rotaris_cloud()
        # "git.setup" is deliberately absent. The offer to set Git up is raised
        # on the notice of the area that owns the precondition, dispatched there
        # and reported there (SWR-3315); a copy of it here would be a second
        # implementation of one write to the user's project.
        elif action_id == "project.initialize":
            self._request_project_initialization()
        elif action_id == "project.resolve":
            self._resolve_project_initialization()
        elif action_id.startswith("session.focus:"):
            self._focus_session(action_id.removeprefix("session.focus:"))
        elif action_id.startswith("proposal.undo:"):
            _prefix, artifact_id, proposal_id, status = action_id.split(":", 3)
            self._set_proposal_status(
                artifact_id,
                proposal_id,
                status,
                confirm=False,
            )


@traces(SWR.SWR_2802)
def _project_init_summary(results: list[Any]) -> str:
    """One sentence naming what each finished task actually did.

    Prefers a task's own `summary` — "Serena activated, no code memories
    created" is the kind of outcome SWR-2804 wants surfaced, and this layer
    could not have worded it.
    """
    lines = [
        text
        for text in (str(getattr(result, "summary", "") or "").strip() for result in results)
        if text
    ]
    if lines:
        return " ".join(lines)
    return f"{len(results)} setup task{'s' if len(results) != 1 else ''} finished."


@traces(SWR.SWR_2802)
def _project_init_details(results: list[Any]) -> str:
    """Per-step technical detail for the notice's copyable details block."""
    lines: list[str] = []
    for result in results:
        task_id = getattr(result, "task_id", "?")
        lines.append(f"{task_id}: {getattr(result, 'status', '?')}")
        for step in getattr(result, "steps", ()) or ():
            detail = getattr(step, "detail", "")
            suffix = f" — {detail}" if detail else ""
            lines.append(f"  {getattr(step, 'name', '?')}: {getattr(step, 'status', '?')}{suffix}")
        error = getattr(result, "error", "")
        if error:
            lines.append(f"  error: {error}")
    return "\n".join(lines)


@traces(SWR.SWR_2404, SWR.SWR_2507)
class _SessionLaunchDialog(QDialog):
    """Collect optional Git isolation and sandboxing before a session starts."""

    def __init__(
        self,
        session_id: str,
        parent: QWidget | None = None,
        *,
        isolation_required: bool = False,
        sandbox_mode: str = "off",
        sandbox_unavailable: str = "",
    ) -> None:
        super().__init__(parent)
        self.session_id = session_id
        self.isolate = isolation_required
        self.branch = ""
        self.isolation_required = isolation_required
        # The mode ticking the box selects: the workspace default when it
        # already names one, otherwise the ordinary "workspace stays writable"
        # sandbox. Ticking never widens what the workspace settings allow.
        self._sandbox_enabled_mode = sandbox_mode if sandbox_mode != "off" else "workspace-write"
        self.sandbox_mode = sandbox_mode
        self.setWindowTitle("Start session")
        self.setModal(True)
        self.setMinimumWidth(460)
        layout = QVBoxLayout(self)
        title = QLabel("New session")
        title.setObjectName("heading")
        layout.addWidget(title)
        hint = QLabel(
            "Another run is already active, so this session gets its own Git "
            "worktree. Two runs sharing one working tree would overwrite each "
            "other's edits."
            if isolation_required
            else "Choose an isolated Git worktree when this task may run beside other sessions."
        )
        hint.setWordWrap(True)
        hint.setObjectName("muted")
        layout.addWidget(hint)
        self.isolate_checkbox = QCheckBox("Run in an isolated Git worktree")
        self.isolate_checkbox.setAccessibleName("Enable worktree isolation")
        self.isolate_checkbox.setChecked(isolation_required)
        self.isolate_checkbox.setEnabled(not isolation_required)
        if isolation_required:
            self.isolate_checkbox.setToolTip("Required while another run is active.")
        self.isolate_checkbox.toggled.connect(self._set_isolation)
        layout.addWidget(self.isolate_checkbox)
        form = QFormLayout()
        self.branch_input = QLineEdit()
        self.branch_input.setAccessibleName("Isolated worktree branch")
        self.branch_input.setText(f"rotaris/session/{session_id}")
        self.branch_input.setEnabled(isolation_required)
        form.addRow("Branch", self.branch_input)
        layout.addLayout(form)
        self.sandbox_checkbox = QCheckBox("Run terminal commands in an OS-level sandbox")
        self.sandbox_checkbox.setAccessibleName("Enable OS-level sandbox")
        # Checked from the workspace default, so a workspace that already
        # sandboxes every run does not silently start one that does not.
        self.sandbox_checkbox.setChecked(sandbox_mode != "off")
        self.sandbox_checkbox.setEnabled(not sandbox_unavailable)
        if sandbox_unavailable:
            # The backend's own reason and remediation, verbatim: an offer the
            # host cannot honour has to say why, not just sit there greyed out.
            self.sandbox_checkbox.setToolTip(sandbox_unavailable)
            self.sandbox_checkbox.setAccessibleDescription(sandbox_unavailable)
        layout.addWidget(self.sandbox_checkbox)
        sandbox_hint = QLabel(
            sandbox_unavailable
            or "Commands run confined to this session's files, and cannot reach the "
            "network unless the workspace settings allow it."
        )
        sandbox_hint.setWordWrap(True)
        sandbox_hint.setObjectName("muted")
        layout.addWidget(sandbox_hint)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        start_button = QPushButton("Continue")
        start_button.setProperty("variant", "primary")
        start_button.clicked.connect(self._accept)
        buttons.addButton(start_button, QDialogButtonBox.ButtonRole.AcceptRole)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _set_isolation(self, enabled: bool) -> None:
        self.branch_input.setEnabled(enabled)

    def _accept(self) -> None:
        self.isolate = self.isolation_required or self.isolate_checkbox.isChecked()
        self.branch = self.branch_input.text().strip()
        # A disabled box keeps the workspace default it was checked from, so an
        # unavailable sandbox cannot quietly turn a configured one off; the
        # launch then fails with the backend's reason instead.
        self.sandbox_mode = (
            self._sandbox_enabled_mode if self.sandbox_checkbox.isChecked() else "off"
        )
        self.accept()


@traces(SWR.SWR_2005)
class _WorktreeDialog(Themed, QDialog):
    def __init__(
        self,
        workspace: Any,
        existing_branches: set[str],
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        from pathlib import Path

        self._workspace = Path(workspace)
        self._existing_branches = existing_branches
        self._path_edited = False
        self.branch = ""
        self.path = ""
        self.setWindowTitle("Create Git worktree")
        self.setModal(True)
        self.setMinimumWidth(520)
        layout = QVBoxLayout(self)
        title = QLabel("New worktree")
        title.setObjectName("heading")
        layout.addWidget(title)
        description = QLabel("Create an isolated branch directory for a separate Rotaris session.")
        description.setObjectName("muted")
        description.setWordWrap(True)
        layout.addWidget(description)
        form = QFormLayout()
        self.branch_input = QLineEdit()
        self.branch_input.setPlaceholderText("feature/short-name")
        self.branch_input.setAccessibleName("New worktree branch")
        self.branch_input.textChanged.connect(self._branch_changed)
        form.addRow("Branch", self.branch_input)
        self.path_input = QLineEdit()
        self.path_input.setAccessibleName("New worktree directory")
        self.path_input.textEdited.connect(self._mark_path_edited)
        self.path_input.textChanged.connect(self._validate)
        form.addRow("Directory", self.path_input)
        layout.addLayout(form)
        self.validation = QLabel()
        self.validation.setWordWrap(True)
        layout.addWidget(self.validation)
        self.buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Cancel)
        self.create_button = QPushButton("Create worktree")
        self.create_button.setProperty("variant", "primary")
        self.create_button.clicked.connect(self._accept_validated)
        self.buttons.addButton(self.create_button, QDialogButtonBox.ButtonRole.AcceptRole)
        self.buttons.rejected.connect(self.reject)
        layout.addWidget(self.buttons)
        self._validate()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        # A sentence, not a marker: the failure text takes the step that owes
        # 4.5:1 rather than the saturated one a status dot may sit at.
        self.validation.setStyleSheet(f"color:{theme.color.fail_text};")

    def _mark_path_edited(self) -> None:
        self._path_edited = True

    def _branch_changed(self, branch: str) -> None:
        if not self._path_edited:
            directory = branch.strip().replace("/", "-")
            self.path_input.setText(str(self._workspace.parent / directory) if directory else "")
        self._validate()

    def _validate(self) -> None:
        from pathlib import Path

        branch = self.branch_input.text().strip()
        path_text = self.path_input.text().strip()
        invalid_chars = set(" ~^:?*[\\")
        error = ""
        if not branch:
            error = "Enter a branch name."
        elif any(char in branch for char in invalid_chars) or ".." in branch:
            error = "Branch name contains characters Git does not allow."
        elif branch.startswith(("-", "/")) or branch.endswith(("/", ".", ".lock")):
            error = "Branch name has an invalid start or ending."
        elif branch in self._existing_branches:
            error = "That branch already has a worktree."
        elif not path_text:
            error = "Choose a directory."
        elif Path(path_text).exists():
            error = "Directory already exists. Choose a new empty path."
        self.validation.setText(error)
        self.create_button.setEnabled(not error)

    def _accept_validated(self) -> None:
        self._validate()
        if not self.create_button.isEnabled():
            return
        self.branch = self.branch_input.text().strip()
        self.path = self.path_input.text().strip()
        self.accept()


class _SessionsDialog(QDialog):
    def __init__(self, store: WorkspaceStore, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Rotaris sessions")
        self.resize(760, 460)
        self.setAccessibleName("Rotaris session browser")
        self._store = store
        self.selected_session_id = ""
        layout = QVBoxLayout(self)
        title = QLabel("Sessions")
        title.setObjectName("heading")
        layout.addWidget(title)
        hint = QLabel("Search and resume a persisted workspace session.")
        hint.setObjectName("muted")
        layout.addWidget(hint)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Filter by name, status, or branch…")
        self.search.setAccessibleName("Filter sessions")
        self.search.textChanged.connect(self._refresh)
        layout.addWidget(self.search)
        self.sessions = QListWidget()
        self.sessions.setAccessibleName("Persisted sessions")
        self.sessions.itemSelectionChanged.connect(self._selection_changed)
        self.sessions.itemDoubleClicked.connect(self._select_session)
        layout.addWidget(self.sessions, 1)
        self.empty_label = QLabel("No matching sessions. Start a new session from Overview.")
        self.empty_label.setObjectName("muted")
        self.empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.empty_label)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Close)
        self.resume_button = QPushButton("Resume selected")
        self.resume_button.setProperty("variant", "primary")
        self.resume_button.setEnabled(False)
        self.resume_button.clicked.connect(self._resume_selected)
        buttons.addButton(self.resume_button, QDialogButtonBox.ButtonRole.AcceptRole)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        self._refresh()

    @traces(SWR.SWR_3612)
    def _refresh(self) -> None:
        query = self.search.text().casefold().strip()
        self.sessions.clear()
        for session in self._store.sessions:
            # The id stays searchable (SWR-2907) even though rows are labeled
            # by task wording — support flows still paste session ids here. The
            # requirement and unit join it (SWR-3612), so "which run implemented
            # SWR-3416" is answerable from the list a user already has open.
            haystack = " ".join(
                (
                    session.name,
                    session.id,
                    session.status,
                    session.branch,
                    session.requirement_id,
                    session.unit_id,
                )
            ).casefold()
            if query and query not in haystack:
                continue
            # This dialog is the full-width listing, so it states requirement
            # *and* unit rather than the sidebar's badge. Nothing is added for a
            # run a person started — no placeholder, no empty column.
            attribution = f"   {session.attribution}" if session.attribution else ""
            self.sessions.addItem(
                f"{session.name}   {session.status}   {session.branch}   "
                f"{session.tokens_label}   {session.duration_label}{attribution}"
            )
            item = self.sessions.item(self.sessions.count() - 1)
            item.setData(Qt.ItemDataRole.UserRole, session.id)
            tooltip = session.detail or f"{session.status} session"
            if session.attribution:
                tooltip = f"{tooltip} · started for requirement {session.attribution}"
            item.setToolTip(tooltip)
        self.empty_label.setVisible(self.sessions.count() == 0)
        self._selection_changed()

    def _selection_changed(self) -> None:
        self.resume_button.setEnabled(bool(self.sessions.selectedItems()))

    def _resume_selected(self) -> None:
        items = self.sessions.selectedItems()
        if items:
            self._select_session(items[0])

    def _select_session(self, item: QListWidgetItem) -> None:
        self.selected_session_id = str(item.data(Qt.ItemDataRole.UserRole))
        self.accept()
