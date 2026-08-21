"""Slash command registry and handler for InputComposer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from rich.text import Text
from textual.suggester import Suggester
from textual.widget import Widget
from textual.widgets import ListItem, ListView, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from textual.app import ComposeResult
    from textual.events import Key

    from rotaris_core.tui.app import RotarisTuiApp


@dataclass
class LogoutMessage:
    """Message to trigger a provider logout."""

    provider_id: str


@dataclass
class SlashCommand:
    """A registered slash command."""

    name: str
    description: str
    handler: Callable[[str, RotarisTuiApp], None]


@traces(
    SWR.SWR_1101,
    SWR.SWR_1102,
    SWR.SWR_1105,
    SWR.SWR_1108,
    SWR.SWR_1110,
    SWR.SWR_1174,
    SWR.SWR_1175,
    SWR.SWR_1176,
    SWR.SWR_1177,
    SWR.SWR_1178,
    SWR.SWR_1179,
    SWR.SWR_1180,
    SWR.SWR_1185,
)
@traces(SWR.SWR_1133, SWR.SWR_1135)
class SlashCommandRegistry:
    """Registry for slash commands."""

    def __init__(self) -> None:
        """Initialize an empty command registry."""
        self._commands: dict[str, SlashCommand] = {}

    def register(
        self,
        name: str,
        description: str,
        handler: Callable[[str, RotarisTuiApp], None],
    ) -> None:
        """Register a slash command."""
        self._commands[name.lower()] = SlashCommand(
            name=name.lower(),
            description=description,
            handler=handler,
        )

    def get(self, name: str) -> SlashCommand | None:
        """Get a command by name (case-insensitive)."""
        return self._commands.get(name.lower())

    def list_commands(self) -> list[SlashCommand]:
        """List all registered commands."""
        return list(self._commands.values())

    def find_first_match(self, filter_text: str) -> SlashCommand | None:
        """Find the first command matching a slash-command filter."""
        if filter_text.startswith("/"):
            filter_text = filter_text[1:].lstrip()
        filter_lower = filter_text.lower()
        for cmd in self.list_commands():
            if (
                not filter_lower
                or filter_lower in cmd.name
                or filter_lower in cmd.description.lower()
            ):
                return cmd
        return None

    def execute(self, command_line: str, app: RotarisTuiApp) -> bool:
        """Execute a slash command.

        Returns True if command was found and executed, False otherwise.
        """
        parts = command_line.strip().split(None, 1)
        if not parts:
            return False

        command_name = parts[0].lstrip("/").lower()
        args = parts[1] if len(parts) > 1 else ""

        cmd = self.get(command_name)
        if not cmd:
            return False

        cmd.handler(args, app)
        return True


class SlashCommandSuggester(Suggester):
    """Inline hint for slash command completion."""

    def __init__(self, registry: SlashCommandRegistry) -> None:
        """Initialize with a command registry for suggestions."""
        super().__init__(use_cache=False)
        self._registry = registry

    async def get_suggestion(self, value: str) -> str | None:
        """Return the first matching slash command suggestion, or None."""
        if not value.startswith("/") or value.startswith("/ "):
            return None
        if any(char.isspace() for char in value[1:]):
            return None
        cmd = self._registry.find_first_match(value)
        if cmd is None:
            return None
        return f"/{cmd.name} - {cmd.description}"


@traces(
    SWR.SWR_1124,
    SWR.SWR_1125,
    SWR.SWR_1127,
    SWR.SWR_1128,
    SWR.SWR_1129,
    SWR.SWR_1130,
    SWR.SWR_1131,
    SWR.SWR_1132,
    SWR.SWR_1139,
)
def create_builtin_registry() -> SlashCommandRegistry:
    """Create a registry with built-in TUI commands."""
    registry = SlashCommandRegistry()

    # /stop
    def handle_stop(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import StopRun  # noqa: PLC0415

        app.post_message(StopRun())

    registry.register("stop", "Stop the current run", handle_stop)

    # /pause
    def handle_pause(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import PauseRun  # noqa: PLC0415

        app.post_message(PauseRun())

    registry.register("pause", "Pause the current run", handle_pause)

    # /resume
    def handle_resume(args: str, app: RotarisTuiApp) -> None:
        app.action_show_session_picker()

    registry.register("resume", "Resume a previous session", handle_resume)

    # /new
    def handle_new(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import NewSession  # noqa: PLC0415

        app.post_message(NewSession())

    registry.register("new", "Start a new session", handle_new)

    # /mcp
    def handle_mcp(args: str, app: RotarisTuiApp) -> None:
        app.action_show_mcp_servers()

    registry.register("mcp", "Open MCP server management", handle_mcp)

    # /improvements
    def handle_improvements(args: str, app: RotarisTuiApp) -> None:
        app.action_show_improvement_proposals()

    registry.register(
        "improvements",
        "Review post-run improvement proposals",
        handle_improvements,
    )

    # /tools
    def handle_tools(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import ToggleToolEvents  # noqa: PLC0415

        app.post_message(ToggleToolEvents())

    registry.register("tools", "Toggle tool events visibility", handle_tools)

    # /background
    def handle_background(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import SendToBackground  # noqa: PLC0415

        app.post_message(SendToBackground())

    registry.register("background", "Send session to background", handle_background)

    # /stash
    def handle_stash(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import StashInput  # noqa: PLC0415

        app.post_message(StashInput())

    registry.register("stash", "Stash current input", handle_stash)

    # /pop
    def handle_pop(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import PopInput  # noqa: PLC0415

        app.post_message(PopInput())

    registry.register("pop", "Pop stashed input", handle_pop)

    # /theme
    def handle_theme(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import SetTheme  # noqa: PLC0415
        from rotaris_core.tui.themes import THEMES  # noqa: PLC0415

        theme_name = args.strip().lower() if args else ""
        if not theme_name:
            app.notify(
                f"Usage: /theme <name>. Available: {', '.join(THEMES.keys())}",
                severity="error",
            )
            return

        if theme_name not in THEMES:
            app.notify(
                f"Unknown theme: {theme_name!r}. Available: {', '.join(THEMES.keys())}",
                severity="error",
            )
            return

        app.post_message(SetTheme(theme_name))

    registry.register("theme", "Switch theme (usage: /theme <name>)", handle_theme)

    # /logout
    def handle_logout(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import LogoutMessage  # noqa: PLC0415

        provider_id = args.strip()
        if not provider_id:
            app.notify(
                "Usage: /logout <provider>. Example: /logout openai-compatible--my-label",
                severity="error",
            )
            return

        app.post_message(LogoutMessage(provider_id))

    registry.register(
        "logout",
        "Sign out of an auth provider (usage: /logout <provider>)",
        handle_logout,
    )

    # /compress
    def handle_compress(args: str, app: RotarisTuiApp) -> None:
        from rotaris_core.tui.messages import ForceCompress  # noqa: PLC0415

        app.post_message(ForceCompress())

    registry.register(
        "compress",
        "Force context compression for all running agents",
        handle_compress,
    )

    # /help
    def handle_help(args: str, app: RotarisTuiApp) -> None:
        del args
        app.action_show_shortcut_help()

    registry.register("help", "Show slash commands and leader shortcuts", handle_help)

    # /model
    def handle_model(args: str, app: RotarisTuiApp) -> None:
        del args
        app.action_show_runtime_models()

    registry.register("model", "Open runtime model selection", handle_model)

    # /quit
    def handle_quit(args: str, app: RotarisTuiApp) -> None:
        del args
        app.request_quit(source="/quit")

    registry.register("quit", "Quit the application gracefully", handle_quit)

    # /clear
    def handle_clear(args: str, app: RotarisTuiApp) -> None:
        del args
        app.clear_transcript_with_confirmation()

    registry.register("clear", "Clear the transcript (confirmation required)", handle_clear)

    # /cancel
    def handle_cancel(args: str, app: RotarisTuiApp) -> None:
        del args
        app.cancel_current_context()

    registry.register("cancel", "Cancel the active modal or generation", handle_cancel)

    # /search
    def handle_search(args: str, app: RotarisTuiApp) -> None:
        del args
        from rotaris_core.tui.screens.transcript_search import (
            TranscriptSearchScreen,  # noqa: PLC0415
        )

        if app.current_session is None:
            app.notify("No active session to search.", severity="warning")
            return
        if not app.current_session.transcript_events:
            app.notify("Transcript is empty — nothing to search.", severity="warning")
            return
        app.push_screen(TranscriptSearchScreen(app))

    registry.register("search", "Search the transcript", handle_search)

    return registry


@traces(SWR.SWR_1141, SWR.SWR_1147, SWR.SWR_1148, SWR.SWR_1149)
class SlashCommandOverlay(Widget):
    """Autocomplete overlay for slash commands."""

    can_focus = False

    DEFAULT_CSS = """
    SlashCommandOverlay {
        layout: vertical;
        background: $boost;
        height: auto;
        max-height: 10fr;
        width: 40;
        dock: bottom;
        margin-top: 1;
        padding: 0 1;
        border: solid $primary;
        display: none;

        & > ListView {
            background: $surface;
            height: 100%;
        }

        &.showing {
            display: block;
        }
    }
    """

    def __init__(
        self,
        registry: SlashCommandRegistry,
        callback: Callable[[str], None] | None = None,
        on_hide: Callable[[], None] | None = None,
    ) -> None:
        """Initialize the overlay with registry and optional callbacks."""
        super().__init__()
        self._registry = registry
        self._callback = callback
        self._hide_callback = on_hide
        self._list_view = ListView(id="slash-command-list")
        self._filter_text = ""
        self._selected_index = 0
        self._visible_commands: list[SlashCommand] = []

    def compose(self) -> ComposeResult:
        """Yield the command list view."""
        yield self._list_view

    def show(self, filter_text: str = "") -> None:
        """Show the overlay with an optional initial filter."""
        if filter_text.startswith("/"):
            filter_text = filter_text[1:].lstrip()
        self._filter_text = filter_text
        self._update_commands()
        self.add_class("showing")

    def hide(self) -> None:
        """Hide the overlay."""
        self.remove_class("showing")
        self._filter_text = ""
        self._selected_index = 0
        if self._hide_callback:
            self._hide_callback()

    def watch_has_focus(self, _has_focus: bool = False) -> None:  # noqa: FBT001
        """When focus enters, select the first item."""
        if self.has_focus and self._list_view.children:
            self._selected_index = 0
            self._list_view.index = self._selected_index

    def on_key(self, event: Key) -> None:
        """Handle keyboard navigation."""
        if event.key == "escape":
            self.hide()
            event.stop()
            return

        if not self.has_class("showing"):
            return

        if event.key == "up":
            self._selected_index = max(0, self._selected_index - 1)
            self._list_view.index = self._selected_index
            event.stop()
            return

        if event.key == "down":
            items = list(self._list_view.children)
            if items:
                self._selected_index = min(len(items) - 1, self._selected_index + 1)
                self._list_view.index = self._selected_index
            event.stop()
            return

        if event.key in ("tab", "enter", "right"):
            self.select_current()
            event.stop()
            return

        if event.key in ("backspace", "delete"):
            if not self._filter_text:
                self.hide()
            else:
                self._filter_text = self._filter_text[:-1]
                self._update_commands()
            event.stop()
            return

        # Allow other keys to pass through for filtering
        if len(event.key) == 1:
            self._filter_text += event.key
            self._update_commands()
            event.stop()

    def _update_commands(self) -> None:
        """Update the command list based on current filter."""
        self._list_view.remove_children()
        self._selected_index = 0

        commands = self._registry.list_commands()
        filter_lower = self._filter_text.lower()
        self._visible_commands = [
            cmd
            for cmd in commands
            if not filter_lower
            or filter_lower in cmd.name
            or filter_lower in cmd.description.lower()
        ]

        for cmd in self._visible_commands:
            self._list_view.append(
                ListItem(Static(Text(f"/{cmd.name}  {cmd.description}", style="dim"))),
            )

    def select_current(self) -> None:
        """Select the currently highlighted command."""
        items = list(self._list_view.children)
        if (
            not items
            or self._selected_index >= len(items)
            or self._selected_index >= len(self._visible_commands)
        ):
            return

        command_name = self._visible_commands[self._selected_index].name
        if self._callback:
            self._callback(command_name)
        self.hide()
