"""Unit tests for provider-scoped logout behavior."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import parse_qs

import httpx
import pytest
import respx

from rotaris_core.auth.logout import (
    UnknownLogoutProviderError,
    _revoke_rotaris_oidc_refresh_token,
    logout_provider,
)
from rotaris_core.auth.provider import TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.config.project_snapshot import (
    ProjectSnapshot,
    SnapshotModel,
    SnapshotProvider,
    read_snapshot,
    write_snapshot,
)
from rotaris_core.reqtocode import SWR, verifies


def _snapshot_provider(provider_id: str, *, family: str | None = None) -> SnapshotProvider:
    timestamp = datetime.now(UTC).isoformat()
    return SnapshotProvider(
        id=provider_id,
        display_name=provider_id,
        family=family,
        authenticated=True,
        discovered_at=timestamp,
        models=[
            SnapshotModel(
                id=f"{provider_id}/model",
                display_name="Model",
                discovered_at=timestamp,
            ),
        ],
    )


@verifies(SWR.SWR_707, SWR.SWR_714)
def test_logout_builtin_provider_deletes_tokens_without_touching_snapshot(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save("copilot", TokenSet(access_token="abc", refresh_token="def"))
    write_snapshot(
        ProjectSnapshot(providers={"copilot": _snapshot_provider("copilot")}),
        base=tmp_path / "snapshot",
    )

    result = logout_provider("copilot", storage=storage, snapshot_base=tmp_path / "snapshot")

    assert result.kind == "signed_out"
    assert result.message == "Signed out of copilot."
    assert result.removed_snapshot is False
    assert not storage.has_tokens("copilot")
    snapshot = read_snapshot(tmp_path / "snapshot")
    assert snapshot is not None
    assert "copilot" in snapshot.providers


@verifies(SWR.SWR_781)
@respx.mock
def test_rotaris_logout_revokes_refresh_token_with_discovered_oidc_endpoint() -> None:
    endpoint = "http://auth.localhost/realms/rotaris-dev/protocol/openid-connect/revoke"
    route = respx.post(endpoint).mock(return_value=httpx.Response(200))

    _revoke_rotaris_oidc_refresh_token(
        TokenSet(
            access_token="access",
            refresh_token="refresh",
            extra={"revocation_endpoint": endpoint},
        ),
    )

    assert route.called
    assert (
        route.calls[0]
        .request.headers["content-type"]
        .startswith(
            "application/x-www-form-urlencoded",
        )
    )
    assert parse_qs(route.calls[0].request.content.decode()) == {
        "client_id": ["rotaris-ai"],
        "token": ["refresh"],
        "token_type_hint": ["refresh_token"],
    }


@verifies(SWR.SWR_707, SWR.SWR_770, SWR.SWR_772)
def test_logout_openai_instance_deletes_tokens_but_retains_snapshot(tmp_path) -> None:
    provider_id = "openai-compatible--acme"
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(provider_id, TokenSet(access_token="abc", refresh_token=""))
    write_snapshot(
        ProjectSnapshot(
            providers={
                provider_id: _snapshot_provider(
                    provider_id,
                    family="openai-compatible",
                ),
            },
        ),
        base=tmp_path / "snapshot",
    )

    result = logout_provider(provider_id, storage=storage, snapshot_base=tmp_path / "snapshot")

    assert result.kind == "signed_out"
    assert result.removed_snapshot is False
    assert result.message == f"Signed out of {provider_id}."
    assert not storage.has_tokens(provider_id)
    snapshot = read_snapshot(tmp_path / "snapshot")
    assert snapshot is not None
    assert provider_id in snapshot.providers


@verifies(SWR.SWR_707)
def test_logout_openai_instance_without_tokens_is_noop_and_retains_snapshot(tmp_path) -> None:
    provider_id = "openai-compatible--acme"
    write_snapshot(
        ProjectSnapshot(
            providers={
                provider_id: _snapshot_provider(
                    provider_id,
                    family="openai-compatible",
                ),
            },
        ),
        base=tmp_path / "snapshot",
    )

    result = logout_provider(provider_id, snapshot_base=tmp_path / "snapshot")

    assert result.kind == "noop"
    assert result.removed_snapshot is False
    snapshot = read_snapshot(tmp_path / "snapshot")
    assert snapshot is not None
    assert provider_id in snapshot.providers


@verifies(SWR.SWR_707)
def test_logout_unknown_provider_raises_helpful_error(tmp_path) -> None:
    with pytest.raises(UnknownLogoutProviderError, match="openai-compatible--my-label"):
        logout_provider("unknown", storage=TokenStorage(token_dir=tmp_path / "tokens"))
