"""Unit tests for the standard Keycloak OIDC PKCE provider."""

from __future__ import annotations

import time
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from rotaris_core.auth.concrete_cloud import (
    _ROTARIS_API_BASE,
    CLIENT_ID,
    ConcreteCloudAuthProvider,
    _build_authorize_url,
    _build_token_set_from_response,
    _CallbackHandler,
    _generate_pkce,
)
from rotaris_core.auth.provider import AuthFlowType, AuthResult, AuthStatus, TokenSet
from rotaris_core.reqtocode import SWR, verifies

_TEST_ISSUER = "https://auth.rotaris.test/realms/rotaris"
_DISCOVERY_URL = f"{_TEST_ISSUER}/.well-known/openid-configuration"
_DISCOVERY = {
    "issuer": _TEST_ISSUER,
    "authorization_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/auth",
    "token_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/token",
    "revocation_endpoint": f"{_TEST_ISSUER}/protocol/openid-connect/revoke",
}


@verifies(SWR.SWR_781)
def test_provider_identity_and_pkce_generation() -> None:
    verifier, challenge = _generate_pkce()
    assert ConcreteCloudAuthProvider().provider_id == "concrete-cloud"
    assert ConcreteCloudAuthProvider().flow_type == AuthFlowType.PKCE
    assert CLIENT_ID == "rotaris-ai"
    assert len(verifier) == 43
    assert verifier != challenge
    assert all(char not in challenge for char in ("+", "/", "="))


@verifies(SWR.SWR_781)
@pytest.mark.asyncio
async def test_discovery_requires_an_explicit_issuer_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("rotaris_core.auth.concrete_cloud.ISSUER", "")

    result = await ConcreteCloudAuthProvider()._discover()

    assert isinstance(result, AuthResult)
    assert not result.success
    assert result.error == "ROTARIS_OIDC_ISSUER must be configured for Rotaris Cloud login"


@verifies(SWR.SWR_781)
def test_authorize_url_uses_discovered_endpoint_and_standard_code_pkce_params() -> None:
    url = _build_authorize_url(
        "state123",
        "challenge456",
        redirect_uri="http://127.0.0.1:9745/callback",
        authorization_endpoint=_DISCOVERY["authorization_endpoint"],
    )

    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    assert parsed.path.endswith("/protocol/openid-connect/auth")
    assert params == {
        "client_id": ["rotaris-ai"],
        "response_type": ["code"],
        "redirect_uri": ["http://127.0.0.1:9745/callback"],
        "code_challenge": ["challenge456"],
        "code_challenge_method": ["S256"],
        "state": ["state123"],
    }


@verifies(SWR.SWR_781)
@pytest.mark.asyncio
@respx.mock
async def test_authenticate_discovers_oidc_before_opening_browser_and_exchanges_code_as_form(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    browser_calls: list[str] = []

    class FakeHTTPServer:
        timeout = 0.0
        server_address = ("127.0.0.1", 9745)

        def __init__(self, *_args: object, **_kwargs: object) -> None:
            self.socket = MagicMock()
            events.append("server")

        def shutdown(self) -> None:
            events.append("shutdown")

        def server_close(self) -> None:
            events.append("server_close")

    async def fake_wait(
        self: ConcreteCloudAuthProvider,
        expected_state: str,
        *,
        cancel_event: object | None = None,
    ) -> str | None:
        del self, expected_state, cancel_event
        events.append("wait")
        return "authorization-code"

    def fake_serve(self: ConcreteCloudAuthProvider, server: FakeHTTPServer) -> None:
        del self, server

    async def on_prompt(url: str) -> None:
        assert url.startswith(_DISCOVERY["authorization_endpoint"])
        events.append("prompt")

    monkeypatch.setattr("rotaris_core.auth.concrete_cloud.ISSUER", _TEST_ISSUER)
    discovery = respx.get(_DISCOVERY_URL).mock(return_value=httpx.Response(200, json=_DISCOVERY))
    exchange = respx.post(_DISCOVERY["token_endpoint"]).mock(
        return_value=httpx.Response(
            200,
            json={"access_token": "access", "refresh_token": "refresh", "expires_in": 900},
        ),
    )
    monkeypatch.setattr("rotaris_core.auth.concrete_cloud.HTTPServer", FakeHTTPServer)
    monkeypatch.setattr(ConcreteCloudAuthProvider, "_serve_until_callback", fake_serve)
    monkeypatch.setattr(ConcreteCloudAuthProvider, "_wait_for_callback", fake_wait)
    monkeypatch.setattr(
        "rotaris_core.auth.concrete_cloud.webbrowser.open",
        lambda url: browser_calls.append(url) or True,
    )

    result = await ConcreteCloudAuthProvider().authenticate(on_prompt=on_prompt)

    assert result.success
    assert discovery.called
    assert exchange.called
    assert events.index("server") < events.index("prompt") < events.index("wait")
    assert len(browser_calls) == 1
    request = exchange.calls[0].request
    assert request.headers["content-type"].startswith("application/x-www-form-urlencoded")
    assert parse_qs(request.content.decode()) == {
        "grant_type": ["authorization_code"],
        "client_id": [CLIENT_ID],
        "code": ["authorization-code"],
        "redirect_uri": ["http://127.0.0.1:9745/callback"],
        "code_verifier": [parse_qs(request.content.decode())["code_verifier"][0]],
    }
    assert result.tokens is not None
    assert result.tokens.extra["issuer"] == _TEST_ISSUER
    assert result.tokens.extra["token_endpoint"] == _DISCOVERY["token_endpoint"]
    assert result.tokens.extra["revocation_endpoint"] == _DISCOVERY["revocation_endpoint"]
    assert result.tokens.extra["api_base"] == _ROTARIS_API_BASE


@verifies(SWR.SWR_781)
@pytest.mark.asyncio
@respx.mock
async def test_refresh_uses_stored_discovered_token_endpoint_as_form() -> None:
    token_endpoint = _DISCOVERY["token_endpoint"]
    route = respx.post(token_endpoint).mock(
        return_value=httpx.Response(
            200,
            json={"access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 900},
        ),
    )
    original = TokenSet(
        access_token="old-access",
        refresh_token="old-refresh",
        expires_at=time.time() - 1,
        extra={
            "issuer": _TEST_ISSUER,
            "token_endpoint": token_endpoint,
            "revocation_endpoint": _DISCOVERY["revocation_endpoint"],
            "api_base": _ROTARIS_API_BASE,
        },
    )

    result = await ConcreteCloudAuthProvider().refresh(original)

    assert result.success
    assert route.called
    assert parse_qs(route.calls[0].request.content.decode()) == {
        "grant_type": ["refresh_token"],
        "client_id": [CLIENT_ID],
        "refresh_token": ["old-refresh"],
    }
    assert result.tokens is not None
    assert result.tokens.extra["issuer"] == _TEST_ISSUER
    assert result.tokens.extra["token_endpoint"] == token_endpoint


@verifies(SWR.SWR_781)
def test_token_response_stores_only_standard_oidc_metadata_and_rotaris_api_base() -> None:
    result = _build_token_set_from_response(
        {"access_token": "access", "refresh_token": "refresh", "expires_in": 900},
        discovery=_DISCOVERY,
    )

    assert result.success
    assert result.tokens is not None
    assert result.tokens.expires_at > time.time()
    assert result.tokens.extra == {
        "issuer": _TEST_ISSUER,
        "token_endpoint": _DISCOVERY["token_endpoint"],
        "revocation_endpoint": _DISCOVERY["revocation_endpoint"],
        "api_base": _ROTARIS_API_BASE,
    }


@verifies(SWR.SWR_781)
def test_callback_handler_keeps_code_and_state_validation_inputs() -> None:
    from io import BytesIO

    handler = _CallbackHandler.__new__(_CallbackHandler)
    handler.path = "/callback?code=abc123&state=mystate"
    handler.wfile = BytesIO()
    handler.send_response = MagicMock()
    handler.send_header = MagicMock()
    handler.end_headers = MagicMock()
    _CallbackHandler.code = None
    _CallbackHandler.received_state = None
    _CallbackHandler.error = None

    handler.do_GET()

    assert _CallbackHandler.code == "abc123"
    assert _CallbackHandler.received_state == "mystate"
    assert _CallbackHandler.error is None


@verifies(SWR.SWR_781)
@pytest.mark.asyncio
async def test_check_status_preserves_existing_expiry_semantics() -> None:
    provider = ConcreteCloudAuthProvider()
    assert (
        await provider.check_status(TokenSet(access_token="", refresh_token=""))
        == AuthStatus.UNAUTHENTICATED
    )
    assert (
        await provider.check_status(
            TokenSet(access_token="access", refresh_token="", expires_at=time.time() - 1)
        )
        == AuthStatus.EXPIRED
    )
