from __future__ import annotations

from typing import TYPE_CHECKING, cast

from textual.actions import SkipAction
from textual.containers import Grid, Vertical
from textual.screen import Screen
from textual.widgets import ContentSwitcher, Footer

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.widgets.agent_status import AgentStatusPane
from rotaris_core.tui.widgets.chat_panel import ChatPanel
from rotaris_core.tui.widgets.info_pane import InfoPane
from rotaris_core.tui.widgets.input_composer import InputComposer
from rotaris_core.tui.widgets.spinner import SpinnerWidget
from rotaris_core.tui.widgets.status_bar import StatusBar
from rotaris_core.tui.widgets.todo_pane import TodoPane
from rotaris_core.tui.widgets.top_bar import TopBar

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.tui.app import RotarisTuiApp
    from rotaris_core.tui.messages import RunCompleted
    from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor


@traces(SWR.SWR_1032, SWR.SWR_1036, SWR.SWR_1037, SWR.SWR_1038)
class MainScreen(Screen[None]):
    def on_mount(self) -> None:
        # Trigger the initial widget refresh so the info pane is populated from
        # config immediately (MCP server availability, all available tools) even
        # before any session has been started.
        app = cast("RotarisTuiApp", self.app)
        app.request_widget_refresh()

    def compose(self) -> ComposeResult:
        yield TopBar(id="top-bar")
        with Grid(id="main-grid"):
            with Vertical(id="left-pane"):
                with ContentSwitcher(initial="chat-panel", id="transcript-switcher"):
                    yield ChatPanel(id="chat-panel")
                yield InputComposer(id="input-composer")
                yield SpinnerWidget(id="spinner")
            with Vertical(id="right-pane"):
                yield AgentStatusPane(id="agent-status")
                yield InfoPane(id="info-pane")
                yield TodoPane(id="todo-pane")
                yield StatusBar(id="status-bar")
        yield Footer()

    def on_input_composer_input_submitted(
        self,
        message: InputComposer.InputSubmitted,
    ) -> None:
        app = cast("RotarisTuiApp", self.app)
        if not app.session_manager or not app.config:
            chat = self.query_one(ChatPanel)
            chat.add_user_message(message.text)
            self.notify(
                (
                    "No active session. Create one via "
                    f"[b]{app.format_leader_chord('p')} → New session[/b] or [b]/new[/b]."
                ),
                severity="warning",
            )
            chat.add_system_message(
                "No active session — message recorded in transcript only.",
            )
            return

        if app.run_is_active():
            app.handle_queued_prompt(message.text)
            return

        chat = self.query_one(ChatPanel)
        chat.add_user_message(message.text)
        app.start_run(message.text)

    def on_input_composer_steering_submitted(
        self,
        message: InputComposer.SteeringSubmitted,
    ) -> None:
        chat = self.query_one(ChatPanel)
        chat.add_user_message(message.text)

        app = cast("RotarisTuiApp", self.app)
        if not app.session_manager or not app.config:
            self.notify(
                (
                    "No active session. Create one via "
                    f"[b]{app.format_leader_chord('p')} → New session[/b] or [b]/new[/b]."
                ),
                severity="warning",
            )
            chat.add_system_message(
                "No active session — message recorded in transcript only.",
            )
            return

        if app.run_is_active():
            app.handle_steering_prompt(message.text)
            return

        app.start_run(message.text)

    def action_copy_text(self) -> None:
        """Copy selected text to clipboard with user feedback."""
        selected = self.get_selected_text()
        if selected is None:
            raise SkipAction()
        app = cast("RotarisTuiApp", self.app)
        ok = app.try_copy_to_clipboard(selected)
        self.clear_selection()
        if ok:
            self.notify("Copied to clipboard", timeout=1.5)
        else:
            self.notify(
                app.clipboard_failure_message(),
                severity="warning",
                timeout=3,
            )

    def on_run_completed(self, message: RunCompleted) -> None:
        self.notify(message.text, severity=message.severity)

    def on_artifact_editor_save_requested(
        self,
        message: ArtifactEditor.SaveRequested,
    ) -> None:
        app = cast("RotarisTuiApp", self.app)
        app.save_artifact(message.artifact_id, message.text)

    def on_artifact_editor_exit_requested(
        self,
        message: ArtifactEditor.ExitRequested,
    ) -> None:
        app = cast("RotarisTuiApp", self.app)
        app.exit_artifact_inspector(require_confirm=message.dirty)
