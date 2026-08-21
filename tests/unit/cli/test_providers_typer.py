from __future__ import annotations

from typing import Any

from typer.testing import CliRunner

from rotaris_core.auth.provider_settings import ProviderUpdateResult
from rotaris_core.cli.app import app
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_760, SWR.SWR_762, SWR.SWR_766)
def test_typer_providers_set_key_registered(monkeypatch: Any) -> None:
    calls: list[tuple[str, str, bool]] = []

    def fake_update_api_key(
        provider_id: str,
        api_key: str,
        *,
        validate: bool = True,
        storage: object | None = None,
    ) -> ProviderUpdateResult:
        del storage
        calls.append((provider_id, api_key, validate))
        return ProviderUpdateResult(True, "updated", provider_id, models_discovered=1)

    monkeypatch.setattr("rotaris_core.auth.provider_settings.update_api_key", fake_update_api_key)

    result = CliRunner().invoke(
        app,
        ["providers", "set-key", "deepseek", "--api-key", "sk-test", "--no-validate"],
    )

    assert result.exit_code == 0
    assert calls == [("deepseek", "sk-test", False)]
    assert "updated" in result.output


@verifies(SWR.SWR_773)
def test_typer_providers_delete_requires_confirmation(monkeypatch: Any) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.delete_openai_compatible_provider",
        lambda provider_id: calls.append(provider_id),
    )

    result = CliRunner().invoke(app, ["providers", "delete", "openai-compatible--lab"], input="n\n")

    assert result.exit_code == 0
    assert calls == []
    assert "cancelled" in result.output.lower()


@verifies(SWR.SWR_773)
def test_typer_providers_delete_yes(monkeypatch: Any) -> None:
    from rotaris_core.auth.provider_settings import ProviderDeleteResult

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings.delete_openai_compatible_provider",
        lambda provider_id: ProviderDeleteResult(True, "deleted", provider_id),
    )

    result = CliRunner().invoke(app, ["providers", "delete", "openai-compatible--lab", "--yes"])

    assert result.exit_code == 0
    assert "deleted" in result.output
