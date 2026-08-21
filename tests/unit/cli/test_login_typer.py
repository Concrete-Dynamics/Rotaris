from __future__ import annotations

from typing import TYPE_CHECKING, Any

from typer.testing import CliRunner

from rotaris_core.cli.app import app
from rotaris_core.cli.auth_flow import LoginResult
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_707, SWR.SWR_729)
def test_typer_login_registered_and_success(monkeypatch: Any, tmp_path: Path) -> None:
    calls: list[tuple[str | None, Path, bool]] = []

    def fake_run_login(
        provider_id: str | None,
        *,
        workspace_root: Path,
        reauth: bool,
        ui: Any,
    ) -> LoginResult:
        calls.append((provider_id, workspace_root, reauth))
        return LoginResult("copilot", True, 1, True, False, "ok")

    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_run_login)

    result = CliRunner().invoke(app, ["login", "copilot", "--workspace", str(tmp_path)])

    assert result.exit_code == 0
    assert calls == [("copilot", tmp_path.resolve(), False)]
    assert "ok" in result.output


@verifies(SWR.SWR_707)
def test_typer_login_propagates_reauth(monkeypatch: Any, tmp_path: Path) -> None:
    calls: list[bool] = []

    def fake_run_login(
        provider_id: str | None,
        *,
        workspace_root: Path,
        reauth: bool,
        ui: Any,
    ) -> LoginResult:
        calls.append(reauth)
        return LoginResult("copilot", True, 1, True, False, "ok")

    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_run_login)

    result = CliRunner().invoke(app, ["login", "--reauth", "copilot", "-w", str(tmp_path)])

    assert result.exit_code == 0
    assert calls == [True]


@verifies(SWR.SWR_707)
def test_typer_login_failure_exits_one(monkeypatch: Any, tmp_path: Path) -> None:
    def fake_run_login(
        provider_id: str | None,
        *,
        workspace_root: Path,
        reauth: bool,
        ui: Any,
    ) -> LoginResult:
        return LoginResult("copilot", False, 0, False, False, "failed")

    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_run_login)

    result = CliRunner().invoke(app, ["login", "copilot", "-w", str(tmp_path)])

    assert result.exit_code == 1
    assert "failed" in result.output


@verifies(SWR.SWR_707)
def test_typer_login_menu_path_passes_none(monkeypatch: Any, tmp_path: Path) -> None:
    calls: list[str | None] = []

    def fake_run_login(
        provider_id: str | None,
        *,
        workspace_root: Path,
        reauth: bool,
        ui: Any,
    ) -> LoginResult:
        calls.append(provider_id)
        return LoginResult("copilot", True, 1, True, False, "ok")

    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_run_login)

    result = CliRunner().invoke(app, ["login", "-w", str(tmp_path)])

    assert result.exit_code == 0
    assert calls == [None]
