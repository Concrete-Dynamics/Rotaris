from __future__ import annotations

from typing import TYPE_CHECKING, Any

from typer.testing import CliRunner

from rotaris_core.cli.app import app
from rotaris_core.cli.auth_flow import LoginResult
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


_LOGIN_HINT_ERR = "small_model is unconfigured. Run 'rotaris-cli login' to authenticate a provider."


@verifies(SWR.SWR_707, SWR.SWR_739)
def test_run_auto_launches_login_when_models_unconfigured(
    tmp_workspace: Path,
    monkeypatch: Any,
) -> None:
    calls = {"login": 0, "validate": 0}

    def fake_validate(config: Any) -> list[str]:
        calls["validate"] += 1
        if calls["validate"] == 1:
            return [_LOGIN_HINT_ERR]
        return []

    def fake_login(provider_id: Any, *, workspace_root: Path, reauth: bool, ui: Any) -> LoginResult:
        calls["login"] += 1
        return LoginResult(
            provider_id="copilot",
            success=True,
            models_discovered=2,
            bootstrap_written=True,
            advanced_editor_launched=False,
            message="OK",
        )

    def fake_tui_run(self: Any) -> None:
        return None

    monkeypatch.setattr("rotaris_core.config.validation.validate_config", fake_validate)
    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_login)
    monkeypatch.setattr("rotaris_core.tui.RotarisTuiApp.run", fake_tui_run)

    runner = CliRunner()
    result = runner.invoke(app, ["run", "--workspace", str(tmp_workspace)])

    assert result.exit_code == 0, result.output
    assert calls["login"] == 1
    assert calls["validate"] == 2


@verifies(SWR.SWR_707)
def test_run_exits_when_login_fails(tmp_workspace: Path, monkeypatch: Any) -> None:
    def fake_validate(config: Any) -> list[str]:
        return [_LOGIN_HINT_ERR]

    def fake_login(provider_id: Any, *, workspace_root: Path, reauth: bool, ui: Any) -> LoginResult:
        return LoginResult(
            provider_id="copilot",
            success=False,
            models_discovered=0,
            bootstrap_written=False,
            advanced_editor_launched=False,
            message="Auth aborted",
        )

    monkeypatch.setattr("rotaris_core.config.validation.validate_config", fake_validate)
    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_login)

    runner = CliRunner()
    result = runner.invoke(app, ["run", "--workspace", str(tmp_workspace)])

    assert result.exit_code == 1
    assert "Auth aborted" in result.output or "Auth aborted" in (result.stderr or "")


@verifies(SWR.SWR_1018)
def test_run_skips_auto_login_in_background_mode(tmp_workspace: Path, monkeypatch: Any) -> None:
    login_calls = {"n": 0}

    def fake_validate(config: Any) -> list[str]:
        return [_LOGIN_HINT_ERR]

    def fake_login(provider_id: Any, *, workspace_root: Path, reauth: bool, ui: Any) -> LoginResult:
        login_calls["n"] += 1
        raise AssertionError("login must not run in background mode")

    monkeypatch.setattr("rotaris_core.config.validation.validate_config", fake_validate)
    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_login)

    runner = CliRunner()
    result = runner.invoke(
        app,
        ["run", "--background", "--workspace", str(tmp_workspace), "do thing"],
    )

    assert result.exit_code == 1
    assert login_calls["n"] == 0
