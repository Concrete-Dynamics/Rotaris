from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.cli.startup_recovery import maybe_refresh_models_for_config_error
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


class FakeUI:
    def __init__(self) -> None:
        self.infos: list[str] = []
        self.warnings: list[str] = []
        self.errors: list[str] = []

    def info(self, message: str) -> None:
        self.infos.append(message)

    def warning(self, message: str) -> None:
        self.warnings.append(message)

    def error(self, message: str) -> None:
        self.errors.append(message)


@verifies(SWR.SWR_819)
def test_maybe_refresh_models_for_config_error_runs_refresh_for_incomplete_provider_models(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    ui = FakeUI()
    calls: list[tuple[str | None, Path]] = []

    def fake_run_refresh_models(
        provider_id: str | None,
        *,
        workspace_root: Path,
        ui: FakeUI,
    ) -> object:
        calls.append((provider_id, workspace_root))
        ui.info("Refresh complete: 1 provider succeeded.")
        return type("Result", (), {"message": "Refresh complete: 1 provider succeeded."})()

    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.run_refresh_models",
        fake_run_refresh_models,
    )

    attempted = maybe_refresh_models_for_config_error(
        [
            "Model 'deepseek/deepseek-v4-pro' is incomplete: missing required fields 'model_id', 'provider'.",
        ],
        workspace_root=tmp_path,
        ui=ui,
    )

    assert attempted is True
    assert calls == [(None, tmp_path)]
    assert ui.warnings == [
        "Detected incomplete provider model overrides. Refreshing authenticated provider models...",
    ]
    assert ui.infos == [
        "Refresh complete: 1 provider succeeded.",
        "Refresh complete: 1 provider succeeded.",
    ]


@verifies(SWR.SWR_819)
def test_maybe_refresh_models_for_config_error_skips_unrelated_messages(tmp_path: Path) -> None:
    ui = FakeUI()

    attempted = maybe_refresh_models_for_config_error(
        ["personas.orchestrator: missing required field"],
        workspace_root=tmp_path,
        ui=ui,
    )

    assert attempted is False
    assert ui.infos == []
    assert ui.warnings == []
    assert ui.errors == []
