from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.cli import argparse_app
from rotaris_core.cli.auth_flow import LoginResult
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_707)
def test_argparse_login_accepts_positional_provider() -> None:
    args = argparse_app._build_parser().parse_args(["login", "copilot"])

    assert args.command == "login"
    assert args.provider == "copilot"


@verifies(SWR.SWR_707)
def test_argparse_login_accepts_reauth_and_workspace(tmp_path: Path) -> None:
    args = argparse_app._build_parser().parse_args(
        ["login", "--reauth", "--workspace", str(tmp_path), "copilot"],
    )

    assert args.reauth is True
    assert args.workspace == tmp_path


@verifies(SWR.SWR_707)
def test_argparse_logout_accepts_positional_provider() -> None:
    args = argparse_app._build_parser().parse_args(["logout", "copilot"])

    assert args.command == "logout"
    assert args.provider == "copilot"


@verifies(SWR.SWR_707)
def test_argparse_logout_allows_picker_path() -> None:
    args = argparse_app._build_parser().parse_args(["logout"])

    assert args.command == "logout"
    assert args.provider is None


@verifies(SWR.SWR_707)
def test_argparse_run_accepts_logout_flag() -> None:
    args = argparse_app._build_parser().parse_args(["run", "--logout", "copilot"])

    assert args.command == "run"
    assert args.logout == "copilot"


@verifies(SWR.SWR_707, SWR.SWR_729)
def test_cmd_login_invokes_run_login_with_args(monkeypatch: Any, tmp_path: Path) -> None:
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
    args = argparse_app._build_parser().parse_args(
        ["login", "--reauth", "-w", str(tmp_path), "copilot"],
    )

    assert argparse_app._cmd_login(args) == 0
    assert calls == [("copilot", tmp_path.resolve(), True)]


@verifies(SWR.SWR_707)
def test_cmd_login_failure_returns_nonzero(monkeypatch: Any, tmp_path: Path) -> None:
    def fake_run_login(
        provider_id: str | None,
        *,
        workspace_root: Path,
        reauth: bool,
        ui: Any,
    ) -> LoginResult:
        return LoginResult("copilot", False, 0, False, False, "failed")

    monkeypatch.setattr("rotaris_core.cli.auth_flow.run_login", fake_run_login)
    args = argparse_app._build_parser().parse_args(["login", "-w", str(tmp_path), "copilot"])

    assert argparse_app._cmd_login(args) == 1


@verifies(SWR.SWR_707)
def test_cmd_run_logout_short_circuits_without_task(monkeypatch: Any) -> None:
    calls: list[str] = []

    def fake_cmd_logout(provider_id: str) -> int:
        calls.append(provider_id)
        return 0

    monkeypatch.setattr("rotaris_core.cli.argparse_app._cmd_logout", fake_cmd_logout)
    args = argparse_app._build_parser().parse_args(["run", "--logout", "copilot"])

    assert argparse_app._cmd_run(args) == 0
    assert calls == ["copilot"]


@verifies(SWR.SWR_707, SWR.SWR_716)
def test_cmd_logout_success(monkeypatch: Any, capsys: Any) -> None:
    from rotaris_core.auth.logout import LogoutResult

    monkeypatch.setattr(
        "rotaris_core.auth.logout.logout_provider",
        lambda provider_id, *, storage: LogoutResult(
            provider_id=provider_id,
            kind="signed_out",
            message=f"Signed out of {provider_id}.",
        ),
    )

    assert argparse_app._cmd_logout("copilot") == 0
    assert "Signed out of copilot." in capsys.readouterr().out


@verifies(SWR.SWR_707)
def test_cmd_logout_without_provider_uses_picker(monkeypatch: Any, capsys: Any) -> None:
    from rotaris_core.auth.logout import LogoutResult

    monkeypatch.setattr(
        "rotaris_core.cli.argparse_app._resolve_logout_provider_id",
        lambda provider_id: "codex",
    )
    monkeypatch.setattr(
        "rotaris_core.auth.logout.logout_provider",
        lambda provider_id, *, storage: LogoutResult(
            provider_id=provider_id,
            kind="signed_out",
            message=f"Signed out of {provider_id}.",
        ),
    )

    assert argparse_app._cmd_logout(None) == 0
    assert "Signed out of codex." in capsys.readouterr().out
