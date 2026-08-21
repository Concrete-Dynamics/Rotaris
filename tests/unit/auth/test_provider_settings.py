from __future__ import annotations

from typing import Any

from rotaris_core.auth.provider import AuthFlowType, TokenSet
from rotaris_core.auth.provider_settings import (
    check_configured_provider_health,
    get_provider_settings,
    update_api_key,
    validate_provider,
)
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.config.project_snapshot import SnapshotProvider, update_provider
from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
from rotaris_core.providers.discovery import DiscoveredModel, DiscoveryResult
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_762, SWR.SWR_763, SWR.SWR_765)
def test_openai_compatible_settings_are_api_key_editable(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    global_dir = tmp_path / "global"
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    update_provider(
        SnapshotProvider(
            id="openai-compatible--lab",
            display_name="Lab",
            family="openai-compatible",
            base_url="http://localhost:8000/v1",
            authenticated=True,
            models=[],
            discovered_at="2026-06-05T00:00:00+00:00",
        ),
        base=global_dir,
    )
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "openai-compatible--lab",
        TokenSet(
            access_token="sk-test-old",
            refresh_token="",
            extra={"provider_family": "openai-compatible", "api_base": "http://localhost:8000/v1"},
        ),
    )

    settings = get_provider_settings("openai-compatible--lab", storage=storage)

    assert settings.auth_flow == AuthFlowType.API_KEY
    assert settings.masked_key == "sk****ld"
    assert settings.base_url == "http://localhost:8000/v1"


@verifies(SWR.SWR_762, SWR.SWR_766, SWR.SWR_767)
def test_update_api_key_validates_before_replacing_existing_key(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    global_dir = tmp_path / "global"
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    update_provider(
        SnapshotProvider(
            id="openai-compatible--lab",
            display_name="Lab",
            family="openai-compatible",
            base_url="http://localhost:8000/v1",
            authenticated=True,
            models=[],
            discovered_at="2026-06-05T00:00:00+00:00",
        ),
        base=global_dir,
    )
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "openai-compatible--lab",
        TokenSet(
            access_token="sk-test-old",
            refresh_token="",
            extra={"provider_family": "openai-compatible", "api_base": "http://localhost:8000/v1"},
        ),
    )

    def fake_discover(_provider_id: str, *, token: str, **_kwargs: object) -> DiscoveryResult:
        if token == "bad":
            return DiscoveryResult([], "Authentication failed for Lab: 401", 401)
        return DiscoveryResult(
            [
                DiscoveredModel(
                    id="model-a",
                    qualified_id="openai-compatible--lab/model-a",
                ),
            ],
            None,
            200,
        )

    monkeypatch.setattr("rotaris_core.providers.discovery.discover_models", fake_discover)

    failed = update_api_key("openai-compatible--lab", "bad", storage=storage)
    failed_tokens = storage.load("openai-compatible--lab")
    assert failed.success is False
    assert failed_tokens is not None
    assert failed_tokens.access_token == "sk-test-old"

    updated = update_api_key("openai-compatible--lab", "sk-test-new", storage=storage)
    updated_tokens = storage.load("openai-compatible--lab")
    assert updated.success is True
    assert updated_tokens is not None
    assert updated_tokens.access_token == "sk-test-new"


@verifies(SWR.SWR_762, SWR.SWR_765)
def test_update_api_key_rejects_non_ascii_header_value_without_saving(
    tmp_path: Any,
) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")

    result = update_api_key("deepseek", "sk-test-ä", validate=False, storage=storage)

    assert result.success is False
    assert "ASCII" in result.message
    assert storage.load("deepseek") is None


@verifies(SWR.SWR_766, SWR.SWR_767)
def test_validate_codex_uses_subscription_account_for_model_catalog(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    """A completed Codex sign-in validates models for its owning ChatGPT account."""
    global_dir = tmp_path / "global"
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "codex",
        TokenSet(
            access_token="subscription-token",
            refresh_token="refresh-token",
            account_id="account-123",
        ),
    )
    received: dict[str, object] = {}

    def fake_discover(_provider_id: str, *, token: str, **kwargs: object) -> DiscoveryResult:
        received["token"] = token
        received.update(kwargs)
        return DiscoveryResult(
            [DiscoveredModel(id="gpt-5.6-terra", qualified_id="codex/gpt-5.6-terra")],
            None,
            200,
        )

    monkeypatch.setattr("rotaris_core.providers.discovery.discover_models", fake_discover)
    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.persist_discovered_models",
        lambda *_args, **_kwargs: None,
    )

    result = validate_provider("codex", storage=storage)

    assert result.success is True
    assert received["token"] == "subscription-token"
    assert received["account_id"] == "account-123"


@verifies(SWR.SWR_761, SWR.SWR_762)
async def test_configured_provider_health_reports_missing_api_key(tmp_path: Any) -> None:
    config = RotarisConfig(
        workspace_root=tmp_path,
        default_persona="orchestrator",
        default_summary_model="openai-compatible--lab/model-a",
        small_model="openai-compatible--lab/model-a",
        medium_model="openai-compatible--lab/model-a",
        large_model="openai-compatible--lab/model-a",
        fallback_model="openai-compatible--lab/model-a",
        models={
            "openai-compatible--lab/model-a": ModelConfig(
                provider="openai",
                model_id="model-a",
                auth_provider="openai-compatible--lab",
                base_url="http://localhost:8000/v1",
            ),
        },
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="openai-compatible--lab/model-a",
            ),
        },
    )

    issues = await check_configured_provider_health(
        config,
        storage=TokenStorage(token_dir=tmp_path / "tokens"),
    )

    assert len(issues) == 1
    assert issues[0].provider_id == "openai-compatible--lab"
    assert issues[0].can_edit_api_key is True
