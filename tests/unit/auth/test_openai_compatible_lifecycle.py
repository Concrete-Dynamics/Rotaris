from __future__ import annotations

from rotaris_core.auth.provider_settings import (
    delete_openai_compatible_provider,
    register_openai_compatible_provider,
)
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.config.project_snapshot import read_snapshot, snapshot_path
from rotaris_core.providers.discovery import DiscoveredModel, DiscoveryResult
from rotaris_core.reqtocode import SWR, verifies


def _discovery(provider_id: str) -> DiscoveryResult:
    return DiscoveryResult(
        [
            DiscoveredModel(
                id="model-a",
                qualified_id=f"{provider_id}/model-a",
                display_name="Model A",
            )
        ],
        None,
        200,
    )


@verifies(SWR.SWR_769, SWR.SWR_771)
def test_registers_multiple_endpoints_without_storing_secrets_in_snapshot(
    tmp_path, monkeypatch
) -> None:
    global_dir = tmp_path / "global"
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings._discover_for_provider",
        lambda provider_id, **_kwargs: _discovery(provider_id),
    )

    first = register_openai_compatible_provider(
        "Lab One", "https://one.example/v1", "secret-one", storage=storage
    )
    second = register_openai_compatible_provider(
        "Lab Two", "https://two.example/v1", "secret-two", storage=storage
    )

    assert first.success and second.success
    snapshot = read_snapshot()
    assert snapshot is not None
    assert set(snapshot.providers) == {
        "openai-compatible--lab-one",
        "openai-compatible--lab-two",
    }
    rendered = snapshot_path().read_text(encoding="utf-8")
    assert "secret-one" not in rendered
    assert "secret-two" not in rendered


@verifies(SWR.SWR_769, SWR.SWR_771)
def test_registration_rejects_normalized_collision_and_failed_discovery(
    tmp_path, monkeypatch
) -> None:
    global_dir = tmp_path / "global"
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings._discover_for_provider",
        lambda provider_id, **_kwargs: _discovery(provider_id),
    )
    assert register_openai_compatible_provider(
        "My Lab", "https://lab.example/v1", "secret", storage=storage
    ).success

    collision = register_openai_compatible_provider(
        "my---lab", "https://other.example/v1", "other", storage=storage
    )
    assert not collision.success
    assert "re-authenticate" in collision.message

    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings._discover_for_provider",
        lambda *_args, **_kwargs: DiscoveryResult([], "unauthorized", 401),
    )
    failed = register_openai_compatible_provider(
        "Broken", "https://broken.example/v1", "bad", storage=storage
    )
    assert not failed.success
    assert not storage.has_tokens("openai-compatible--broken")


@verifies(SWR.SWR_769, SWR.SWR_771, SWR.SWR_773)
def test_delete_removes_custom_snapshot_and_tolerates_missing_credentials(
    tmp_path, monkeypatch
) -> None:
    global_dir = tmp_path / "global"
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    monkeypatch.setattr("rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_dir)
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings._discover_for_provider",
        lambda provider_id, **_kwargs: _discovery(provider_id),
    )
    provider_id = "openai-compatible--lab"
    assert register_openai_compatible_provider(
        "Lab", "https://lab.example/v1", "secret", storage=storage
    ).success
    storage.delete(provider_id)

    result = delete_openai_compatible_provider(provider_id, storage=storage)

    assert result.success
    assert not result.removed_credentials
    assert result.removed_snapshot
    snapshot = read_snapshot()
    assert snapshot is not None
    assert provider_id not in snapshot.providers


@verifies(SWR.SWR_769, SWR.SWR_771)
def test_registration_rolls_back_credentials_when_snapshot_write_fails(
    tmp_path, monkeypatch
) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    monkeypatch.setattr(
        "rotaris_core.auth.provider_settings._discover_for_provider",
        lambda provider_id, **_kwargs: _discovery(provider_id),
    )
    monkeypatch.setattr(
        "rotaris_core.cli.model_refresh.persist_discovered_models",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("disk full")),
    )

    result = register_openai_compatible_provider(
        "Lab", "https://lab.example/v1", "secret", storage=storage
    )

    assert not result.success
    assert not storage.has_tokens("openai-compatible--lab")


@verifies(SWR.SWR_773)
def test_delete_rejects_builtin_provider(tmp_path) -> None:
    result = delete_openai_compatible_provider(
        "codex", storage=TokenStorage(token_dir=tmp_path / "tokens")
    )

    assert not result.success
    assert "built-in" in result.message
