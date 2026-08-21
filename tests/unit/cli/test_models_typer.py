from __future__ import annotations

from typing import TYPE_CHECKING, Any

from typer.testing import CliRunner

from rotaris_core.cli.app import app
from rotaris_core.cli.model_refresh import RefreshResult
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_727)
def test_typer_models_refresh_registered_and_success(monkeypatch: Any, tmp_path: Path) -> None:
    calls: list[tuple[str | None, Path]] = []

    def fake_run_refresh_models(
        provider_id: str | None,
        *,
        workspace_root: Path,
        ui: Any,
    ) -> RefreshResult:
        calls.append((provider_id, workspace_root))
        return RefreshResult(True, (), "ok")

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.run_refresh_models", fake_run_refresh_models
    )

    result = CliRunner().invoke(
        app,
        ["models", "refresh", "--provider", "codex", "--workspace", str(tmp_path)],
    )

    assert result.exit_code == 0
    assert calls == [("codex", tmp_path.resolve())]
    assert "ok" in result.output


@verifies(SWR.SWR_727)
def test_typer_models_refresh_failure_exits_one(monkeypatch: Any, tmp_path: Path) -> None:
    def fake_run_refresh_models(
        provider_id: str | None,
        *,
        workspace_root: Path,
        ui: Any,
    ) -> RefreshResult:
        return RefreshResult(False, (), "failed")

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.run_refresh_models", fake_run_refresh_models
    )

    result = CliRunner().invoke(app, ["models", "refresh", "-w", str(tmp_path)])

    assert result.exit_code == 1
    assert "failed" in result.output
