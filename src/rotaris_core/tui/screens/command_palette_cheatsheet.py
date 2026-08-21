"""Command palette overlay with inline shortcut cheatsheet panel.

REQ-20260526-001 through REQ-20260526-005 — replaces Textual's built-in
``CommandPalette`` with a custom ``ModalScreen`` that shows matching
commands in the upper two-thirds and a static keyboard-shortcut cheatsheet
in the bottom third.

REQ-20260616-013 — all shortcut references use leader-chord notation
based on the configured ``leader_key``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import Input, ListItem, ListView, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from textual.app import ComposeResult

    from rotaris_core.tui.app import RotarisTuiApp

    CommandCallback = Callable[[], object]


def _build_command_entries(
    app: RotarisTuiApp,
) -> list[tuple[str, CommandCallback, str]]:
    """Build the flat command list for the palette.

    Mirrors the definitions in ``RotarisCommandPalette`` so the custom
    screen stays in sync.
    """
    from rotaris_core.tui.messages import (
        LogoutMessage,
        NewSession,
        PauseRun,
        PopInput,
        SendToBackground,
        SetTheme,
        StashInput,
        StopRun,
        ToggleReasoning,
        ToggleToolEvents,
    )
    from rotaris_core.tui.themes import THEMES

    entries: list[tuple[str, CommandCallback, str]] = [
        ("Stop current run", lambda: app.post_message(StopRun()), "Stop current run"),
        ("Pause current run", lambda: app.post_message(PauseRun()), "Pause current run"),
        ("New session", lambda: app.post_message(NewSession()), "New session"),
        (
            "Toggle tool results",
            lambda: app.post_message(ToggleToolEvents()),
            "Toggle tool results",
        ),
        ("Toggle reasoning", lambda: app.post_message(ToggleReasoning()), "Toggle reasoning"),
        (
            "Send to background",
            lambda: app.post_message(SendToBackground()),
            "Send to background",
        ),
        ("Stash input", lambda: app.post_message(StashInput()), "Stash input"),
        ("Pop input", lambda: app.post_message(PopInput()), "Pop input"),
        (
            "Logout Copilot",
            lambda: app.post_message(LogoutMessage("copilot")),
            "Logout Copilot",
        ),
        (
            "Logout Codex",
            lambda: app.post_message(LogoutMessage("codex")),
            "Logout Codex",
        ),
        ("Continue session", app.action_show_session_picker, "Continue session"),
        ("MCP Servers", app.action_show_mcp_servers, "Manage MCP server toggles"),
        ("MCP Secrets", app.action_show_mcp_secrets, "Manage MCP server environment secrets"),
        (
            "Improvement Proposals",
            app.action_show_improvement_proposals,
            "Review post-run improvement proposals",
        ),
        (
            "Startup Models",
            app.action_show_startup_models,
            "Edit persistent startup model defaults",
        ),
        (
            "Runtime Models",
            app.action_show_runtime_models,
            "Select a runtime provider model for this session",
        ),
        (
            "Provider Settings",
            app.action_show_provider_settings,
            "Edit provider credentials and connection settings",
        ),
        (
            "Tool result settings",
            app.action_show_tool_result_settings,
            "Configure tool result display",
        ),
        (
            "Compression settings",
            app.action_show_compression_settings,
            "Configure context compression trigger percentage",
        ),
        ("Dev Options", app.action_show_dev_options, "Open developer options"),
    ]

    def theme_callback(theme_name: str) -> CommandCallback:
        def _callback() -> object:
            return app.post_message(SetTheme(theme_name))

        return _callback

    for theme_name in THEMES:
        entries.append(
            (
                f"Theme: {theme_name}",
                theme_callback(theme_name),
                f"Switch UI theme to {theme_name}",
            ),
        )

    return entries


def _build_cheatsheet_text(app: RotarisTuiApp) -> str:
    """Build the static cheatsheet text showing leader chords and navigation bindings."""
    from rotaris_core.tui.shortcuts import leader_help_lines

    leader = app.leader_key()
    lines: list[str] = [
        f"Leader: [bold]{leader}[/bold]",
        "",
    ]

    for chord_line in leader_help_lines(leader):
        lines.append(chord_line)

    lines.append("")
    lines.append("Navigation:")
    lines.append("Ctrl+Down/Up     Focus child / parent")
    lines.append("Ctrl+Right/Left  Next / previous sibling")
    lines.append("Alt+Down/Up      Next / previous artifact")
    lines.append("Alt+Right/Left   Enter / exit artifact")
    lines.append("")
    lines.append("Other:")
    lines.append("Esc              Dismiss / cancel")
    lines.append("Ctrl+C           Interrupt (x2 force quit)")
    lines.append("Q                Force quit")
    lines.append(f"/ (slash)        Slash commands ({leader} / for search)")

    return "\n".join(lines)


@traces(SWR.SWR_1161, SWR.SWR_1162, SWR.SWR_1163, SWR.SWR_1164, SWR.SWR_1165, SWR.SWR_1169)
class CommandPaletteCheatsheetScreen(ModalScreen[None]):
    """Command palette with inline shortcut cheatsheet."""

    BINDINGS = [
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, app: RotarisTuiApp) -> None:
        super().__init__()
        self._app = app
        self._entries: list[tuple[str, CommandCallback, str]] = []

    def compose(self) -> ComposeResult:
        with Vertical(id="command-palette-container"):
            yield Input(placeholder="Search commands…", id="command-palette-search")
            yield ListView(id="command-palette-results")
            with Vertical(id="command-palette-cheatsheet"):
                yield Static("", id="cheatsheet-body")

    def on_mount(self) -> None:
        self._entries = _build_command_entries(self._app)
        self._populate_cheatsheet()
        self._populate_command_list()
        self.query_one("#command-palette-search", Input).focus()

    def _populate_command_list(self) -> None:
        list_view = self.query_one("#command-palette-results", ListView)
        list_view.clear()
        for label, _callback, _help_text in self._entries:
            list_view.append(ListItem(Static(label)))

    def _populate_cheatsheet(self) -> None:
        body = self.query_one("#cheatsheet-body", Static)
        body.update(_build_cheatsheet_text(self._app))

    def on_input_changed(self, event: Input.Changed) -> None:
        query = event.value.strip().lower()
        list_view = self.query_one("#command-palette-results", ListView)
        list_view.clear()

        if not query:
            self._populate_command_list()
            return

        for label, _callback, _help_text in self._entries:
            if query in label.lower():
                list_view.append(ListItem(Static(label)))

    def on_input_submitted(self, event: Input.Submitted) -> None:
        del event
        self._activate_visible_index(0)

    def on_list_view_selected(self, event: ListView.Selected) -> None:
        list_view = self.query_one("#command-palette-results", ListView)
        visible_items = list(list_view.children)
        if event.item not in visible_items:
            self.dismiss(None)
            return

        self._activate_visible_index(visible_items.index(event.item))

    def _activate_visible_index(self, idx: int) -> None:
        query = self.query_one("#command-palette-search", Input).value.strip().lower()
        if query:
            matches = [entry for entry in self._entries if query in entry[0].lower()]
        else:
            matches = list(self._entries)

        if idx >= len(matches):
            self.dismiss(None)
            return

        _label, callback, _help_text = matches[idx]
        self.dismiss(None)
        callback()

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)
