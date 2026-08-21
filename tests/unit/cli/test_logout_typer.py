from __future__ import annotations

import importlib
from typing import Any

from typer.testing import CliRunner

from rotaris_core.cli.app import app
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_707, SWR.SWR_716)
def test_typer_logout_without_provider_uses_picker(monkeypatch: Any) -> None:
    calls: list[str] = []
    app_module = importlib.import_module("rotaris_core.cli.app")

    monkeypatch.setattr(app_module, "_resolve_logout_provider_id", lambda provider_id: "copilot")
    monkeypatch.setattr(app_module, "_run_logout", lambda provider_id: calls.append(provider_id))

    result = CliRunner().invoke(app, ["logout"])

    assert result.exit_code == 0
    assert calls == ["copilot"]
