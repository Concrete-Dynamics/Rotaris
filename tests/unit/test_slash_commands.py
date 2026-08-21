"""Tests for slash command registry and execution."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.widgets.slash_commands import (
    SlashCommand,
    SlashCommandOverlay,
    SlashCommandRegistry,
    SlashCommandSuggester,
    create_builtin_registry,
)

# ── TestSlashCommandRegistry ──────────────────────────────────────────────────


@verifies(SWR.SWR_1442)
def test_register_and_get_command() -> None:
    """Test registering and retrieving a command."""
    registry = SlashCommandRegistry()
    handler = MagicMock()

    registry.register("test", "Test command", handler)

    cmd = registry.get("test")
    assert cmd is not None
    assert cmd.name == "test"
    assert cmd.description == "Test command"
    assert cmd.handler is handler


@verifies(SWR.SWR_1442)
def test_get_command_case_insensitive() -> None:
    """Test that command lookup is case-insensitive."""
    registry = SlashCommandRegistry()
    handler = MagicMock()

    registry.register("test", "Test command", handler)

    assert registry.get("TEST") is not None
    assert registry.get("Test") is not None
    assert registry.get("test") is not None


@verifies(SWR.SWR_1442)
def test_get_nonexistent_command() -> None:
    """Test getting a command that doesn't exist."""
    registry = SlashCommandRegistry()
    assert registry.get("nonexistent") is None


@verifies(SWR.SWR_1442)
def test_list_commands() -> None:
    """Test listing all registered commands."""
    registry = SlashCommandRegistry()
    handler1 = MagicMock()
    handler2 = MagicMock()

    registry.register("cmd1", "First command", handler1)
    registry.register("cmd2", "Second command", handler2)

    commands = registry.list_commands()
    assert len(commands) == 2
    assert any(c.name == "cmd1" for c in commands)
    assert any(c.name == "cmd2" for c in commands)


@verifies(SWR.SWR_1442)
def test_execute_known_command() -> None:
    """Test executing a known command."""
    registry = SlashCommandRegistry()
    handler = MagicMock()
    registry.register("test", "Test command", handler)

    app = MagicMock()
    result = registry.execute("/test arg1 arg2", app)

    assert result is True
    handler.assert_called_once_with("arg1 arg2", app)


@verifies(SWR.SWR_1442)
def test_execute_known_command_no_args() -> None:
    """Test executing a command with no arguments."""
    registry = SlashCommandRegistry()
    handler = MagicMock()
    registry.register("test", "Test command", handler)

    app = MagicMock()
    result = registry.execute("/test", app)

    assert result is True
    handler.assert_called_once_with("", app)


@verifies(SWR.SWR_1442)
def test_execute_unknown_command() -> None:
    """Test executing an unknown command."""
    registry = SlashCommandRegistry()
    app = MagicMock()

    result = registry.execute("/unknown", app)

    assert result is False


@verifies(SWR.SWR_1442)
def test_execute_case_insensitive() -> None:
    """Test that command execution is case-insensitive."""
    registry = SlashCommandRegistry()
    handler = MagicMock()
    registry.register("test", "Test command", handler)

    app = MagicMock()
    result = registry.execute("/TEST arg", app)

    assert result is True
    handler.assert_called_once_with("arg", app)


@verifies(SWR.SWR_1442)
def test_execute_with_multiple_spaces() -> None:
    """Test executing a command with multiple spaces in arguments."""
    registry = SlashCommandRegistry()
    handler = MagicMock()
    registry.register("test", "Test command", handler)

    app = MagicMock()
    result = registry.execute("/test   arg1   arg2", app)

    assert result is True
    handler.assert_called_once_with("arg1   arg2", app)


# ── TestBuiltinRegistry ──────────────────────────────────────────────────────


@verifies(SWR.SWR_1442, SWR.SWR_1185)
def test_builtin_registry_has_all_commands() -> None:
    """Test that built-in registry has all expected commands."""
    registry = create_builtin_registry()
    commands = {cmd.name for cmd in registry.list_commands()}

    expected = {
        "stop",
        "pause",
        "resume",
        "new",
        "tools",
        "background",
        "stash",
        "pop",
        "theme",
        "mcp",
        "help",
        "model",
        "quit",
        "clear",
        "cancel",
        "search",
    }
    assert expected.issubset(commands)


@verifies(SWR.SWR_1442)
def test_stop_command() -> None:
    """Test /stop command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/stop", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1442)
def test_pause_command() -> None:
    """Test /pause command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/pause", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1442)
def test_resume_command() -> None:
    """Test /resume command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/resume", app)

    assert result is True
    app.action_show_session_picker.assert_called_once()


@verifies(SWR.SWR_1442)
def test_mcp_command() -> None:
    """Test /mcp command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/mcp", app)

    assert result is True
    app.action_show_mcp_servers.assert_called_once()


@verifies(SWR.SWR_1442, SWR.SWR_1175)
def test_help_command() -> None:
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/help", app)

    assert result is True
    app.action_show_shortcut_help.assert_called_once()


@verifies(SWR.SWR_1442, SWR.SWR_1176)
def test_model_command() -> None:
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/model", app)

    assert result is True
    app.action_show_runtime_models.assert_called_once()


@verifies(SWR.SWR_1442, SWR.SWR_1177)
def test_quit_command() -> None:
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/quit", app)

    assert result is True
    app.request_quit.assert_called_once_with(source="/quit")


@verifies(SWR.SWR_1442, SWR.SWR_1178)
def test_clear_command() -> None:
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/clear", app)

    assert result is True
    app.clear_transcript_with_confirmation.assert_called_once()


@verifies(SWR.SWR_1442, SWR.SWR_1179)
def test_cancel_command() -> None:
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/cancel", app)

    assert result is True
    app.cancel_current_context.assert_called_once()


@verifies(SWR.SWR_1442)
def test_new_command() -> None:
    """Test /new command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/new", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1442)
def test_tools_command() -> None:
    """Test /tools command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/tools", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1442)
def test_background_command() -> None:
    """Test /background command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/background", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1442, SWR.SWR_1130)
def test_stash_command() -> None:
    """Test /stash command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/stash", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1442, SWR.SWR_1131)
def test_pop_command() -> None:
    """Test /pop command."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/pop", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1442, SWR.SWR_1062, SWR.SWR_1056)
def test_theme_command_valid() -> None:
    """Test /theme command with valid theme."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/theme dark", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1445, SWR.SWR_1062)
def test_theme_command_invalid() -> None:
    """Test /theme command with invalid theme."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/theme invalid-theme", app)

    assert result is True
    app.notify.assert_called_once()
    assert "Unknown theme" in app.notify.call_args[0][0]


@verifies(SWR.SWR_1442, SWR.SWR_1062)
def test_theme_command_no_args() -> None:
    """Test /theme command with no arguments."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/theme", app)

    assert result is True
    app.notify.assert_called_once()
    assert "Usage" in app.notify.call_args[0][0]


@verifies(SWR.SWR_1442, SWR.SWR_1062, SWR.SWR_1056)
def test_theme_command_case_insensitive() -> None:
    """Test /theme command is case-insensitive."""
    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/theme DARK", app)

    assert result is True
    app.post_message.assert_called_once()


# ── TestSlashCommandDataclass ────────────────────────────────────────────────


@verifies(SWR.SWR_1442)
def test_slash_command_creation() -> None:
    """Test creating a SlashCommand."""
    handler = MagicMock()
    cmd = SlashCommand(name="test", description="Test", handler=handler)

    assert cmd.name == "test"
    assert cmd.description == "Test"
    assert cmd.handler is handler


# ---------------------------------------------------------------------------
# Tests for /compress (REQ-20260513-190000)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_1442, SWR.SWR_1449)
def test_compress_command_registered_in_builtin_registry() -> None:
    """REQ-T001: create_builtin_registry() returns a registry containing 'compress'."""
    registry = create_builtin_registry()
    commands = {cmd.name for cmd in registry.list_commands()}
    assert "compress" in commands


@verifies(SWR.SWR_1442, SWR.SWR_1448)
def test_compress_command_has_correct_description() -> None:
    """'compress' command has a description that mentions compression."""
    registry = create_builtin_registry()
    cmd = registry.get("compress")
    assert cmd is not None
    assert "compress" in cmd.description.lower()


@verifies(SWR.SWR_1443, SWR.SWR_1450)
def test_compress_command_posts_force_compress_message() -> None:
    """REQ-T002: Executing /compress posts exactly one ForceCompress message."""
    from rotaris_core.tui.app import ForceCompress

    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/compress", app)

    assert result is True
    app.post_message.assert_called_once()
    posted = app.post_message.call_args[0][0]
    assert isinstance(posted, ForceCompress)


@verifies(SWR.SWR_1133, SWR.SWR_1442, SWR.SWR_1449)
def test_compress_command_case_insensitive() -> None:
    """AC-006: /compress is case-insensitive."""
    from rotaris_core.tui.app import ForceCompress

    registry = create_builtin_registry()
    app = MagicMock()

    result = registry.execute("/COMPRESS", app)

    assert result is True
    posted = app.post_message.call_args[0][0]
    assert isinstance(posted, ForceCompress)


class _FakeListView:
    def __init__(self) -> None:
        self.children: list[object] = []
        self.index = 0

    def remove_children(self) -> None:
        self.children.clear()

    def append(self, item: object) -> None:
        self.children.append(item)


class _FakeKeyEvent:
    def __init__(self, key: str) -> None:
        self.key = key
        self.stopped = False

    def stop(self) -> None:
        self.stopped = True


@verifies(SWR.SWR_1147, SWR.SWR_1148)
def test_slash_overlay_filters_commands_by_name_and_description() -> None:
    registry = SlashCommandRegistry()
    registry.register("stop", "Stop the current run", MagicMock())
    registry.register("theme", "Switch theme", MagicMock())
    registry.register("help", "Show slash commands", MagicMock())
    overlay = SlashCommandOverlay(registry)
    overlay._list_view = _FakeListView()  # type: ignore[assignment]
    overlay._filter_text = "sto"

    overlay._update_commands()

    assert [cmd.name for cmd in overlay._visible_commands] == ["stop"]
    assert len(overlay._list_view.children) == 1


@verifies(SWR.SWR_1147, SWR.SWR_1148)
def test_slash_overlay_show_does_not_steal_input_focus() -> None:
    registry = SlashCommandRegistry()
    registry.register("theme", "Switch theme", MagicMock())
    overlay = SlashCommandOverlay(registry)
    overlay._list_view = _FakeListView()  # type: ignore[assignment]
    overlay.focus = MagicMock()  # type: ignore[method-assign]

    overlay.show("/")

    overlay.focus.assert_not_called()
    assert overlay.has_class("showing")
    assert [cmd.name for cmd in overlay._visible_commands] == ["theme"]


@verifies(SWR.SWR_1147, SWR.SWR_1148)
def test_slash_suggester_shows_command_and_description_hint() -> None:
    registry = SlashCommandRegistry()
    registry.register("stop", "Stop the current run", MagicMock())
    registry.register("theme", "Switch theme", MagicMock())
    suggester = SlashCommandSuggester(registry)

    suggestion = asyncio.run(suggester.get_suggestion("/s"))

    assert suggestion == "/stop - Stop the current run"


@verifies(SWR.SWR_1149, SWR.SWR_1141)
def test_slash_overlay_keyboard_navigation_selects_highlighted_command() -> None:
    selected: list[str] = []
    registry = SlashCommandRegistry()
    registry.register("stop", "Stop the current run", MagicMock())
    registry.register("theme", "Switch theme", MagicMock())
    overlay = SlashCommandOverlay(registry, callback=selected.append)
    overlay._list_view = _FakeListView()  # type: ignore[assignment]
    overlay._update_commands()
    overlay.has_class = lambda _name: True  # type: ignore[method-assign]
    overlay.hide = lambda: None  # type: ignore[method-assign]

    down = _FakeKeyEvent("down")
    enter = _FakeKeyEvent("enter")
    overlay.on_key(down)  # type: ignore[arg-type]
    overlay.on_key(enter)  # type: ignore[arg-type]

    assert down.stopped is True
    assert enter.stopped is True
    assert selected == ["theme"]
