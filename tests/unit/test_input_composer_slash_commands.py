"""Tests for slash command handler logic in InputComposer."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.widgets.input_composer import InputComposer


class TestInputComposerSlashCommandHandler:
    """Tests for slash command handler logic."""


@verifies(SWR.SWR_1123, SWR.SWR_1142)
def test_slash_registry_initialized_on_creation() -> None:
    """Test that slash registry is initialized when InputComposer is created."""
    composer = InputComposer()

    assert composer._slash_registry is not None
    assert len(composer._slash_registry.list_commands()) > 0


@verifies(SWR.SWR_1126, SWR.SWR_1128, SWR.SWR_1129)
def test_slash_registry_has_expected_commands() -> None:
    """Test that slash registry has all expected commands."""
    composer = InputComposer()

    commands = {cmd.name for cmd in composer._slash_registry.list_commands()}

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
        "help",
        "model",
        "quit",
        "clear",
        "cancel",
        "search",
    }
    assert expected.issubset(commands)


@verifies(SWR.SWR_1133, SWR.SWR_1142)
def test_slash_registry_command_descriptions() -> None:
    """Test that all commands have descriptions."""
    composer = InputComposer()

    for cmd in composer._slash_registry.list_commands():
        assert cmd.description
        assert len(cmd.description) > 0


@verifies(SWR.SWR_1142)
def test_slash_registry_command_handlers() -> None:
    """Test that all commands have handlers."""
    composer = InputComposer()

    for cmd in composer._slash_registry.list_commands():
        assert cmd.handler is not None
        assert callable(cmd.handler)


@verifies(SWR.SWR_1123, SWR.SWR_1124)
def test_slash_registry_execute_stop_command() -> None:
    """Test executing /stop command through registry."""
    composer = InputComposer()

    app = MagicMock()
    result = composer._slash_registry.execute("/stop", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1123, SWR.SWR_1125)
def test_slash_registry_execute_pause_command() -> None:
    """Test executing /pause command through registry."""
    composer = InputComposer()

    app = MagicMock()
    result = composer._slash_registry.execute("/pause", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1123, SWR.SWR_1127)
def test_slash_registry_execute_new_command() -> None:
    """Test executing /new command through registry."""
    composer = InputComposer()

    app = MagicMock()
    result = composer._slash_registry.execute("/new", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1123, SWR.SWR_1132)
def test_slash_registry_execute_theme_command_valid() -> None:
    """Test executing /theme command with valid theme."""
    composer = InputComposer()

    app = MagicMock()
    result = composer._slash_registry.execute("/theme dark", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1132)
def test_slash_registry_execute_theme_command_invalid() -> None:
    """Test executing /theme command with invalid theme."""
    composer = InputComposer()

    app = MagicMock()
    result = composer._slash_registry.execute("/theme invalid", app)

    assert result is True
    app.notify.assert_called_once()


@verifies(SWR.SWR_1123)
def test_slash_registry_execute_unknown_command() -> None:
    """Test executing unknown command returns False."""
    composer = InputComposer()

    app = MagicMock()
    result = composer._slash_registry.execute("/unknown", app)

    assert result is False


@verifies(SWR.SWR_1133)
def test_slash_registry_case_insensitive() -> None:
    """Test that command execution is case-insensitive."""
    composer = InputComposer()

    app = MagicMock()
    result = composer._slash_registry.execute("/STOP", app)

    assert result is True
    app.post_message.assert_called_once()


@verifies(SWR.SWR_1134, SWR.SWR_1136)
def test_ctrl_enter_binding_registered_for_steering() -> None:
    composer = InputComposer()

    assert any(binding.key == "ctrl+enter" for binding in composer.BINDINGS)


@verifies(SWR.SWR_1134, SWR.SWR_1136)
def test_action_submit_steering_posts_steering_message_and_clears_input(monkeypatch) -> None:
    composer = InputComposer()
    composer.post_message = MagicMock()
    monkeypatch.setattr(composer, "_refresh_meta", lambda: None)
    composer.input_widget = SimpleNamespace(
        value="Use SDK event log",
        display=True,
        focus=lambda: None,
    )

    composer.action_submit_steering()

    composer.post_message.assert_called_once()
    message = composer.post_message.call_args.args[0]
    assert isinstance(message, InputComposer.SteeringSubmitted)
    assert message.text == "Use SDK event log"
    assert composer.get_text() == ""


@verifies(SWR.SWR_1134, SWR.SWR_1136, SWR.SWR_1138)
def test_multiline_ctrl_enter_posts_steering_message_and_returns_inline(monkeypatch) -> None:
    composer = InputComposer()
    composer.post_message = MagicMock()
    monkeypatch.setattr(composer, "_refresh_meta", lambda: None)
    composer.input_widget = SimpleNamespace(value="", display=True, focus=lambda: None)
    composer.textarea_widget = SimpleNamespace(text="", display=False, focus=lambda: None)

    composer.action_toggle_multiline()
    composer.textarea_widget.text = "Refine the current approach"

    event = SimpleNamespace(key="ctrl+enter", stop=MagicMock())

    composer.on_key(event)

    composer.post_message.assert_called_once()
    message = composer.post_message.call_args.args[0]
    assert isinstance(message, InputComposer.SteeringSubmitted)
    assert message.text == "Refine the current approach"
    assert composer.multiline is False
    event.stop.assert_called_once()


@verifies(SWR.SWR_1147, SWR.SWR_1148)
def test_input_changes_keep_slash_overlay_filter_in_sync() -> None:
    composer = InputComposer()
    overlay = MagicMock()
    overlay.has_class.return_value = True
    composer._overlay = overlay

    composer.on_input_changed(SimpleNamespace(input=composer.input_widget, value="/the"))

    overlay.show.assert_called_once_with("/the")


@verifies(SWR.SWR_1138, SWR.SWR_1147)
def test_input_changes_hide_slash_overlay_when_prefix_removed() -> None:
    composer = InputComposer()
    overlay = MagicMock()
    overlay.has_class.return_value = True
    composer._overlay = overlay

    composer.on_input_changed(SimpleNamespace(input=composer.input_widget, value="theme"))

    overlay.hide.assert_called_once_with()


@verifies(SWR.SWR_1149)
def test_enter_selects_visible_slash_command_instead_of_submitting_prompt() -> None:
    composer = InputComposer()
    composer.post_message = MagicMock()
    overlay = MagicMock()
    overlay.has_class.return_value = True
    composer._overlay = overlay
    event = SimpleNamespace(stop=MagicMock())

    composer.on_input_submitted(event)

    overlay.select_current.assert_called_once_with()
    event.stop.assert_called_once_with()
    composer.post_message.assert_not_called()


@verifies(SWR.SWR_1149)
def test_slash_command_selection_moves_cursor_to_end() -> None:
    composer = InputComposer()
    input_widget = SimpleNamespace(value="/st", cursor_position=3)
    input_widget.action_end = lambda: setattr(
        input_widget,
        "cursor_position",
        len(input_widget.value),
    )
    composer.input_widget = input_widget
    composer._overlay.hide = MagicMock()  # type: ignore[method-assign]

    composer._on_slash_command_selected("stop")

    assert input_widget.value == "/stop"
    assert input_widget.cursor_position == len("/stop")
