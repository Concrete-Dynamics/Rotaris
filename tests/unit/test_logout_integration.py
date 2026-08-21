from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from rotaris_core.auth.logout import LogoutResult, UnknownLogoutProviderError
from rotaris_core.cli.app import _run_logout
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tui.app import LogoutMessage
from rotaris_core.tui.widgets.slash_commands import create_builtin_registry


@verifies(SWR.SWR_707)
class TestCLILogout:
    def test_logout_command_success(self, monkeypatch):
        output = []

        def mock_echo(msg, err=False):
            output.append(msg)

        monkeypatch.setattr("typer.echo", mock_echo)
        monkeypatch.setattr(
            "rotaris_core.auth.logout.logout_provider",
            lambda provider_id, *, storage: LogoutResult(
                provider_id=provider_id,
                kind="signed_out",
                message=f"Signed out of {provider_id}.",
            ),
        )

        _run_logout("copilot")

        assert any("Signed out of copilot." in s for s in output)

    @verifies(SWR.SWR_707)
    def test_logout_command_no_tokens(self, monkeypatch):
        output = []

        def mock_echo(msg, err=False):
            output.append(msg)

        monkeypatch.setattr("typer.echo", mock_echo)
        monkeypatch.setattr(
            "rotaris_core.auth.logout.logout_provider",
            lambda provider_id, *, storage: LogoutResult(
                provider_id=provider_id,
                kind="noop",
                message=f"No stored tokens for {provider_id}; nothing to do.",
            ),
        )

        _run_logout("codex")

        assert any("No stored tokens for codex; nothing to do." in s for s in output)

    @verifies(SWR.SWR_707)
    def test_logout_command_unknown_provider(self, monkeypatch):
        output = []

        def mock_echo(msg, err=False):
            output.append(msg)

        monkeypatch.setattr("typer.echo", mock_echo)
        monkeypatch.setattr(
            "rotaris_core.auth.logout.logout_provider",
            MagicMock(
                side_effect=UnknownLogoutProviderError(
                    "invalid_provider",
                    known_targets=("copilot",),
                ),
            ),
        )

        with pytest.raises(Exception) as excinfo:
            _run_logout("invalid_provider")

        assert "Exit" in str(type(excinfo.value))
        assert any("Unknown provider: 'invalid_provider'" in s for s in output)


@verifies(SWR.SWR_707)
class TestTUISlashCommandLogout:
    def test_slash_command_logout_posts_message(self):
        mock_app = MagicMock()
        registry = create_builtin_registry()

        registry.execute("/logout copilot", mock_app)

        message = mock_app.post_message.call_args.args[0]
        assert isinstance(message, LogoutMessage)
        assert message.provider_id == "copilot"

    @verifies(SWR.SWR_707)
    def test_slash_command_logout_missing_provider(self):
        mock_app = MagicMock()
        registry = create_builtin_registry()

        registry.execute("/logout", mock_app)

        args, kwargs = mock_app.notify.call_args
        assert "Usage: /logout <provider>" in args[0]
        assert kwargs["severity"] == "error"
