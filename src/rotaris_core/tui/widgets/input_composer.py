from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rich.text import Text
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.message import Message
from textual.widgets import Input, Static, TextArea

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.prompt_history import PromptHistory
from rotaris_core.tui.themes import get_theme
from rotaris_core.tui.widgets.slash_commands import (
    SlashCommandOverlay,
    SlashCommandSuggester,
    create_builtin_registry,
)

if TYPE_CHECKING:
    from pathlib import Path

    from textual.app import ComposeResult


class _MetaToggleShortcut(Static):
    """Clickable 'toggle ctrl+e' hint in the meta bar."""

    def on_click(self) -> None:
        self.post_message(InputComposer.ToggleMultiline())


class _MetaModelShortcut(Static):
    """Clickable model name + 'swap ctrl+m' hint in the meta bar."""

    def on_click(self) -> None:
        self.post_message(InputComposer.CycleModel())


class _MetaSettingsShortcut(Static):
    """Clickable 'settings ctrl+p' hint in the meta bar."""

    def on_click(self) -> None:
        self.post_message(InputComposer.OpenSettings())


class _MetaStashShortcut(Static):
    """Clickable 'stash ctrl+s' hint in the meta bar."""

    def on_click(self) -> None:
        from rotaris_core.tui.messages import StashInput

        self.post_message(StashInput())


@traces(SWR.SWR_1005, SWR.SWR_1071, SWR.SWR_1072, SWR.SWR_1073)
@traces(SWR.SWR_1103, SWR.SWR_1104, SWR.SWR_1106, SWR.SWR_1107, SWR.SWR_1109)
@traces(
    SWR.SWR_1153,
    SWR.SWR_1154,
    SWR.SWR_1155,
    SWR.SWR_1156,
    SWR.SWR_1157,
    SWR.SWR_1158,
    SWR.SWR_1159,
    SWR.SWR_1160,
)
@traces(SWR.SWR_1123, SWR.SWR_1134, SWR.SWR_1136, SWR.SWR_1137, SWR.SWR_1138, SWR.SWR_1140)
class InputComposer(Vertical):
    BINDINGS = [
        Binding("ctrl+enter", "submit_steering", "Steer", priority=True),
        Binding("up", "history_prev", "Previous Prompt", priority=True),
        Binding("down", "history_next", "Next Prompt", priority=True),
    ]

    @dataclass
    class InputSubmitted(Message):
        text: str

    @dataclass
    class SteeringSubmitted(Message):
        text: str

    class ToggleMultiline(Message):
        """Posted when the toggle shortcut is clicked."""

    class CycleModel(Message):
        """Posted when the model shortcut is clicked or ctrl+m is pressed."""

    class OpenSettings(Message):
        """Posted when the settings shortcut is clicked."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        from rotaris_core import __version__

        self.multiline = False
        self.model_name = ""
        self.thinking = False
        self._meta_status = Static(id="composer-meta-status")
        self._meta_toggle = _MetaToggleShortcut(id="composer-meta-toggle")
        self._meta_model = _MetaModelShortcut(id="composer-meta-model")
        self._meta_settings = _MetaSettingsShortcut(id="composer-meta-settings")
        self._meta_stash = _MetaStashShortcut(id="composer-meta-stash")
        self._meta_timer = Static(id="composer-meta-timer")
        self._stash_count = 0
        self.input_widget = Input(
            placeholder="Describe the next task... (Enter sends)",
        )
        self.textarea_widget = TextArea()
        self.textarea_widget.display = False
        self.border_title = " prompt "
        self.border_subtitle = f" v{__version__} "
        self._slash_registry = create_builtin_registry()
        self.input_widget.suggester = SlashCommandSuggester(self._slash_registry)
        self._overlay = SlashCommandOverlay(
            self._slash_registry,
            callback=self._on_slash_command_selected,
            on_hide=self._focus_input,
        )
        self._overlay.display = False
        self._prompt_history: PromptHistory = PromptHistory()

    def compose(self) -> ComposeResult:
        with Horizontal(id="composer-meta"):
            yield self._meta_status
            yield self._meta_toggle
            yield self._meta_model
            yield self._meta_stash
            yield self._meta_timer
            yield self._meta_settings
        yield self.input_widget
        yield self.textarea_widget
        yield self._overlay

    def on_mount(self) -> None:
        self._init_skill_commands_from_app()
        self._init_prompt_history_from_app()
        self._init_model_from_app()
        self._init_stash_count()
        self._refresh_meta()
        self.input_widget.focus()

    def _init_skill_commands_from_app(self) -> None:
        from rotaris_core.tui.app import RotarisTuiApp

        app = self.app
        if not isinstance(app, RotarisTuiApp):
            return
        from rotaris_core.tui.skill_commands import register_skill_commands

        register_skill_commands(self._slash_registry, app)
        self._init_prompt_commands_from_app()

    def _init_prompt_commands_from_app(self) -> None:
        from rotaris_core.tui.app import RotarisTuiApp

        app = self.app
        if not isinstance(app, RotarisTuiApp):
            return
        from rotaris_core.tui.prompt_commands import register_prompt_commands

        register_prompt_commands(self._slash_registry, app)

    def _init_prompt_history_from_app(self) -> None:
        from rotaris_core.tui.app import RotarisTuiApp

        app = self.app
        if not isinstance(app, RotarisTuiApp):
            return
        history_path = app.prompt_history_path()
        if history_path is None:
            return
        self._prompt_history = PromptHistory(path=history_path)

    def _init_model_from_app(self) -> None:
        from rotaris_core.tui.app import RotarisTuiApp

        app = self.app
        if isinstance(app, RotarisTuiApp) and app.config and app.active_model_key:
            model_cfg = app._active_model_config()
            self.model_name = app.active_model_key
            self.thinking = bool(model_cfg and model_cfg.thinking)

    def update_model(self, name: str, thinking: bool) -> None:
        self.model_name = name
        self.thinking = thinking
        self._refresh_meta()

    def get_text(self) -> str:
        if self.multiline:
            return self.textarea_widget.text.strip()
        return self.input_widget.value.strip()

    def set_text(self, text: str) -> None:
        if self.multiline:
            self.textarea_widget.text = text
        else:
            self.input_widget.value = text
        self._refresh_meta()

    @property
    def prompt_history_path(self) -> Path | None:
        return self._prompt_history.path

    def update_stash_count(self, count: int) -> None:
        self._stash_count = count
        self._refresh_meta()

    def update_timer(self, text: str | None) -> None:
        t = get_theme()
        timer = Text()
        if text:
            timer.append("⏱ ", style=t.fg_dim)
            timer.append(text, style=t.fg_muted)
            timer.append("  ")
        self._meta_timer.update(timer)

    def _init_stash_count(self) -> None:
        try:
            from rotaris_core.tui.stash import PromptStash

            self._stash_count = PromptStash().size
        except Exception:  # noqa: BLE001
            self._stash_count = 0

    # --- Message handlers -------------------------------------------------------

    def on_input_composer_toggle_multiline(self, message: ToggleMultiline) -> None:
        del message
        self.action_toggle_multiline()

    # --- Actions ----------------------------------------------------------------

    def action_toggle_multiline(self) -> None:
        if self.multiline:
            self.multiline = False
            self.input_widget.display = True
            self.textarea_widget.display = False
            self.input_widget.focus()
            self.input_widget.value = self.textarea_widget.text.replace("\n", " ")
        else:
            self.multiline = True
            self.input_widget.display = False
            self.textarea_widget.display = True
            self.textarea_widget.focus()
            self.textarea_widget.text = self.input_widget.value
        self._refresh_meta()

    def action_cycle_model(self) -> None:
        self.post_message(self.CycleModel())

    def action_submit_steering(self) -> None:
        self._submit_text(steering=True)

    # --- Event handlers ---------------------------------------------------------

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if self._overlay.has_class("showing"):
            self._overlay.select_current()
            event.stop()
            return
        self._submit_text(steering=False)

    def on_input_changed(self, event: Input.Changed) -> None:
        """Keep slash command suggestions in sync with the input command token."""
        if event.input is not self.input_widget:
            return
        command_filter = self._slash_command_filter(event.value)
        if command_filter is not None:
            self._overlay.show(event.value)
            return
        if self._overlay.has_class("showing"):
            self._overlay.hide()

    def _on_slash_command_selected(self, command_name: str) -> None:
        """Callback when a slash command is selected from the overlay."""
        self.input_widget.value = f"/{command_name}"
        self.input_widget.action_end()
        self._overlay.hide()

    def _focus_input(self) -> None:
        self.input_widget.focus()

    def on_key(self, event: Any) -> None:
        if self._overlay.has_class("showing") and event.key in {
            "up",
            "down",
            "tab",
            "escape",
            "right",
        }:
            self._overlay.on_key(event)
            return
        if self.multiline and event.key == "ctrl+j":
            self._submit_text(steering=False)
            event.stop()
            return
        if self.multiline and event.key == "ctrl+enter":
            self._submit_text(steering=True)
            event.stop()

    def _slash_command_filter(self, value: str) -> str | None:
        """Return the current slash-command filter, or None when not completing."""
        if not value.startswith("/"):
            return None
        filter_text = value[1:]
        if filter_text and filter_text[0].isspace():
            return None
        if any(char.isspace() for char in filter_text):
            return None
        return filter_text

    def _submit_text(self, *, steering: bool) -> None:
        text = self.get_text()
        if not text:
            return

        if text.startswith("/") and self._try_execute_slash_command(text):
            self._clear_submitted_text()
            return

        # Record in history ring buffer
        self._prompt_history.append(text)

        message_type = self.SteeringSubmitted if steering else self.InputSubmitted
        self.post_message(message_type(text))
        self._clear_submitted_text()

    def action_history_prev(self) -> None:
        result = self._prompt_history.prev()
        if result is None:
            return
        self.set_text(result)
        if not self.multiline:
            self.input_widget.action_end()

    def action_history_next(self) -> None:
        result = self._prompt_history.next()
        if result is None:
            return
        self.set_text(result)
        if not self.multiline:
            self.input_widget.action_end()

    def _clear_submitted_text(self) -> None:
        if self.multiline:
            self.textarea_widget.text = ""
            self.action_toggle_multiline()
            return
        self.input_widget.value = ""
        self._refresh_meta()

    def _try_execute_slash_command(self, text: str) -> bool:
        """Try to execute a slash command.

        Returns True if command was found and executed, False otherwise.
        """
        from rotaris_core.tui.app import RotarisTuiApp

        app = self.app
        if not isinstance(app, RotarisTuiApp):
            return False

        try:
            return self._slash_registry.execute(text, app)
        except Exception as e:  # noqa: BLE001
            app.notify(f"Error executing command: {e}", severity="error")
            return False

    # --- Rendering --------------------------------------------------------------

    def refresh_meta(self) -> None:
        self._refresh_meta()

    def _refresh_meta(self) -> None:
        from rotaris_core.tui.app import RotarisTuiApp

        t = get_theme()
        mode = "multiline" if self.multiline else "inline"
        submit_key = "ctrl+j" if self.multiline else "enter"
        app = self.app
        show_steering_hint = isinstance(app, RotarisTuiApp) and app._run_is_active()
        leader_toggle = (
            app.format_leader_chord("e") if isinstance(app, RotarisTuiApp) else "Ctrl+X E"
        )
        leader_model = (
            app.format_leader_chord("m") if isinstance(app, RotarisTuiApp) else "Ctrl+X M"
        )
        leader_stash = (
            app.format_leader_chord("s") if isinstance(app, RotarisTuiApp) else "Ctrl+X S"
        )
        leader_palette = (
            app.format_leader_chord("p") if isinstance(app, RotarisTuiApp) else "Ctrl+X P"
        )
        if isinstance(app, RotarisTuiApp):
            self.input_widget.placeholder = (
                f"Describe the next task... (Enter sends, {leader_toggle} toggles multiline)"
            )

        # Static portion: ready / mode / send
        status = Text()
        status.append("$ ", style=t.fg_dim)
        status.append("ready", style=t.fg_muted)
        if isinstance(app, RotarisTuiApp) and app.leader_pending():
            status.append(f"  {app.leader_key()}", style=t.yellow)
            status.append("  P:commands", style=t.yellow)
            status.append("  M:models", style=t.yellow)
            status.append("  Q:quit", style=t.yellow)
            status.append("  S:stash", style=t.yellow)
            status.append("  R:reasoning", style=t.yellow)
            status.append("  E:multiline", style=t.yellow)
            status.append("  ?:help", style=t.yellow)
            status.append("  esc:dismiss", style=t.fg_dim)
        status.append("  mode ", style=t.fg_dim)
        status.append(mode, style=t.fg_muted)
        status.append("  send ", style=t.fg_dim)
        status.append(submit_key, style=t.fg_muted)
        if show_steering_hint:
            status.append("  steer ", style=t.fg_dim)
            status.append("ctrl+enter", style=t.fg_muted)
        status.append("  ")
        self._meta_status.update(status)

        # Clickable: toggle shortcut
        toggle = Text()
        toggle.append("toggle ", style=t.fg_dim)
        toggle.append(leader_toggle, style=t.fg_muted)
        toggle.append("  ")
        self._meta_toggle.update(toggle)

        # Clickable: model name + swap shortcut
        model = Text()
        if self.model_name:
            model.append(self.model_name, style=t.blue)
            if self.thinking:
                model.append(" thinking", style=t.purple)
        else:
            model.append("no model", style=t.fg_subtle)
        model.append("  swap ", style=t.fg_dim)
        model.append(leader_model, style=t.fg_muted)
        model.append("  ")
        self._meta_model.update(model)

        stash_text = Text()
        if self._stash_count > 0:
            stash_text.append(f"stash({self._stash_count}) ", style=t.blue)
        else:
            stash_text.append("stash ", style=t.fg_dim)
        stash_text.append(leader_stash, style=t.fg_muted)
        stash_text.append("  ")
        self._meta_stash.update(stash_text)

        settings = Text()
        settings.append("settings ", style=t.fg_dim)
        settings.append(leader_palette, style=t.fg_muted)
        self._meta_settings.update(settings)
