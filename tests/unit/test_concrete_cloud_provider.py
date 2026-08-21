from __future__ import annotations

from unittest.mock import MagicMock

import pytest
import respx

from rotaris_core.auth.concrete_cloud import ConcreteCloudAuthProvider
from rotaris_core.auth.manager import _get_provider_class
from rotaris_core.auth.provider import AuthFlowType, AuthStatus, TokenSet
from rotaris_core.providers.catalog import BUILTIN_PROVIDERS, get_provider, list_providers
from rotaris_core.providers.instances import OPENAI_COMPATIBLE_PROVIDER_ID
from rotaris_core.reqtocode import SWR, verifies

_TEST_ISSUER = "https://auth.rotaris.test/realms/rotaris"

# ---------------------------------------------------------------------------
# Catalog tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_745)
def test_concrete_cloud_in_builtin_providers() -> None:
    """Verify "concrete-cloud" key exists in BUILTIN_PROVIDERS."""
    assert "concrete-cloud" in BUILTIN_PROVIDERS


@verifies(SWR.SWR_746, SWR.SWR_748)
def test_concrete_cloud_display_name() -> None:
    """Verify display_name is exactly "Rotaris Cloud (recommended)"."""
    descriptor = BUILTIN_PROVIDERS["concrete-cloud"]
    assert descriptor.display_name == "Rotaris Cloud (recommended)"


@verifies(SWR.SWR_747)
def test_concrete_cloud_appears_first() -> None:
    """Verify list_providers()[0].id == "concrete-cloud"."""
    providers = list_providers()
    assert len(providers) >= 1
    assert providers[0].id == "concrete-cloud"


@verifies(SWR.SWR_745)
def test_concrete_cloud_provider_descriptor() -> None:
    """Verify all fields of the ProviderDescriptor for concrete-cloud."""
    descriptor = get_provider("concrete-cloud")

    assert descriptor.id == "concrete-cloud"
    assert descriptor.display_name == "Rotaris Cloud (recommended)"
    assert descriptor.auth_provider_id == "concrete-cloud"
    assert descriptor.discovery_endpoint == "https://rotaris.ai/v1/models"
    assert descriptor.discovery_auth_header == "Bearer"
    assert descriptor.default_base_url == "https://rotaris.ai/v1"


@verifies(SWR.SWR_747)
def test_list_providers_ordering() -> None:
    """Verify ordering: concrete-cloud, copilot, codex, openai-compatible."""
    providers = list_providers()
    ids = [p.id for p in providers]

    assert ids[0] == "concrete-cloud"
    assert ids[1] == "copilot"
    assert ids[2] == "codex"
    assert ids[3] == OPENAI_COMPATIBLE_PROVIDER_ID


# ---------------------------------------------------------------------------
# Auth provider tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_745)
def test_concrete_cloud_auth_provider_creation() -> None:
    """Verify provider can be instantiated without arguments."""
    provider = ConcreteCloudAuthProvider()
    assert provider.provider_id == "concrete-cloud"


@verifies(SWR.SWR_745)
def test_concrete_cloud_flow_type() -> None:
    """Verify flow_type is AuthFlowType.PKCE."""
    provider = ConcreteCloudAuthProvider()
    assert provider.flow_type == AuthFlowType.PKCE


@verifies(SWR.SWR_745)
@pytest.mark.asyncio
async def test_concrete_cloud_auth_no_callback(monkeypatch) -> None:
    """Verify authenticate without on_prompt returns failure (PKCE needs browser)."""
    provider = ConcreteCloudAuthProvider()

    # Mock server binding and external effects to keep the unit test isolated.
    monkeypatch.setattr(provider, "_bind_callback_server", lambda: (MagicMock(), "http://x"))
    monkeypatch.setattr(provider, "_serve_until_callback", lambda s: None)
    monkeypatch.setattr(provider, "_discover", _oidc_discovery)
    monkeypatch.setattr("rotaris_core.auth.concrete_cloud.webbrowser.open", lambda _url: True)

    async def _fake_to_thread(f, *a, **kw):
        return f(*a)

    monkeypatch.setattr("rotaris_core.auth.concrete_cloud.asyncio.to_thread", _fake_to_thread)

    async def _fake_wait(self, expected_state, *, cancel_event=None):
        del self, expected_state, cancel_event

    monkeypatch.setattr(ConcreteCloudAuthProvider, "_wait_for_callback", _fake_wait)

    result = await provider.authenticate(on_prompt=None)

    assert result.success is False
    assert result.tokens is None


@verifies(SWR.SWR_745)
@pytest.mark.asyncio
async def test_concrete_cloud_auth_with_key(monkeypatch) -> None:
    """Verify authenticate invokes on_prompt with the authorize URL."""
    provider = ConcreteCloudAuthProvider()
    prompt_urls: list[str] = []

    async def _on_prompt(url: str) -> None:
        prompt_urls.append(url)

    monkeypatch.setattr(provider, "_discover", _oidc_discovery)
    monkeypatch.setattr(provider, "_bind_callback_server", lambda: (MagicMock(), "http://x"))
    monkeypatch.setattr(provider, "_serve_until_callback", lambda s: None)
    monkeypatch.setattr("rotaris_core.auth.concrete_cloud.webbrowser.open", lambda _url: True)

    async def _fake_wait(self, expected_state, *, cancel_event=None):
        del self, expected_state, cancel_event

    monkeypatch.setattr(ConcreteCloudAuthProvider, "_wait_for_callback", _fake_wait)

    result = await provider.authenticate(on_prompt=_on_prompt)

    assert result.success is False  # No code returned from callback
    assert len(prompt_urls) == 1
    assert f"{_TEST_ISSUER}/protocol/openid-connect/auth?" in prompt_urls[0]


@verifies(SWR.SWR_745)
@pytest.mark.asyncio
async def test_concrete_cloud_auth_empty_key_fails(monkeypatch) -> None:
    """Verify authenticate works when on_prompt is a no-op."""
    provider = ConcreteCloudAuthProvider()

    async def _on_prompt(url: str) -> None:
        del url

    monkeypatch.setattr(provider, "_bind_callback_server", lambda: (MagicMock(), "http://x"))
    monkeypatch.setattr(provider, "_serve_until_callback", lambda s: None)
    monkeypatch.setattr(provider, "_discover", _oidc_discovery)
    monkeypatch.setattr("rotaris_core.auth.concrete_cloud.webbrowser.open", lambda _url: True)

    async def _fake_wait(self, expected_state, *, cancel_event=None):
        del self, expected_state, cancel_event

    monkeypatch.setattr(ConcreteCloudAuthProvider, "_wait_for_callback", _fake_wait)

    result = await provider.authenticate(on_prompt=_on_prompt)

    assert result.success is False


@verifies(SWR.SWR_745)
@pytest.mark.asyncio
async def test_concrete_cloud_check_status_authenticated() -> None:
    """Verify check_status with token returns AUTHENTICATED."""
    provider = ConcreteCloudAuthProvider()
    tokens = TokenSet(access_token="sk-valid-key", refresh_token="")

    status = await provider.check_status(tokens)
    assert status == AuthStatus.AUTHENTICATED


@verifies(SWR.SWR_745)
@pytest.mark.asyncio
async def test_concrete_cloud_check_status_unauthenticated() -> None:
    """Verify check_status without token returns UNAUTHENTICATED."""
    provider = ConcreteCloudAuthProvider()
    tokens = TokenSet(access_token="", refresh_token="")

    status = await provider.check_status(tokens)
    assert status == AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_781)
@pytest.mark.asyncio
@respx.mock
async def test_concrete_cloud_refresh_uses_stored_keycloak_token_endpoint() -> None:
    """Verify refresh uses the discovered standard OIDC token endpoint."""
    provider = ConcreteCloudAuthProvider()
    token_endpoint = f"{_TEST_ISSUER}/protocol/openid-connect/token"
    tokens = TokenSet(
        access_token="redacted-access",
        refresh_token="rt-abc",
        extra={
            "issuer": _TEST_ISSUER,
            "token_endpoint": token_endpoint,
            "revocation_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/revoke",
        },
    )

    respx.post(token_endpoint).respond(json={"access_token": "sk-new", "refresh_token": "rt-new"})

    result = await provider.refresh(tokens)

    assert result.success is True
    assert result.tokens is not None
    assert result.tokens.access_token == "sk-new"


@verifies(SWR.SWR_745)
@pytest.mark.asyncio
async def test_concrete_cloud_refresh_empty_token_fails(respx_mock) -> None:
    """Verify refresh with empty refresh_token returns failure."""
    provider = ConcreteCloudAuthProvider()
    token_endpoint = f"{_TEST_ISSUER}/protocol/openid-connect/token"
    # Full OIDC metadata deliberately: without it the refresh is refused before it is
    # ever sent, and the empty refresh token this test is named for goes untested.
    tokens = TokenSet(
        access_token="",
        refresh_token="",
        extra={
            "issuer": _TEST_ISSUER,
            "token_endpoint": token_endpoint,
            "revocation_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/revoke",
        },
    )

    route = respx_mock.post(token_endpoint).respond(
        status_code=400,
        json={"error": "invalid_grant"},
    )

    result = await provider.refresh(tokens)

    assert route.called
    assert result.success is False


@verifies(SWR.SWR_745)
def test_manager_has_concrete_cloud() -> None:
    """Verify _get_provider_class('concrete-cloud') returns ConcreteCloudAuthProvider."""
    cls = _get_provider_class("concrete-cloud")
    assert cls is ConcreteCloudAuthProvider


async def _oidc_discovery() -> dict[str, str]:
    return {
        "issuer": _TEST_ISSUER,
        "authorization_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/auth",
        "token_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/token",
        "revocation_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/revoke",
    }
