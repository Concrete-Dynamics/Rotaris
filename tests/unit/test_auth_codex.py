from __future__ import annotations

import time
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from rotaris_core.auth.codex import (
    CLIENT_ID,
    ISSUER,
    CodexAuthProvider,
    _build_authorize_url,
    _format_api_key_exchange_error,
    _generate_pkce,
    _parse_jwt_claims,
)
from rotaris_core.auth.provider import AuthFlowType, AuthStatus, TokenSet
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_701, SWR.SWR_720)
def test_provider_id() -> None:
    provider = CodexAuthProvider()
    assert provider.provider_id == "codex"


@verifies(SWR.SWR_701, SWR.SWR_705)
def test_flow_type() -> None:
    provider = CodexAuthProvider()
    assert provider.flow_type == AuthFlowType.PKCE


@verifies(SWR.SWR_705)
def test_generate_pkce_returns_43_char_verifier() -> None:
    verifier, challenge = _generate_pkce()
    assert len(verifier) == 43
    assert challenge
    assert verifier != challenge


@verifies(SWR.SWR_705)
def test_generate_pkce_unique_each_call() -> None:
    v1, _ = _generate_pkce()
    v2, _ = _generate_pkce()
    assert v1 != v2


@verifies(SWR.SWR_701, SWR.SWR_705)
def test_build_authorize_url_contains_required_params() -> None:
    url = _build_authorize_url(
        "state123",
        "challenge456",
        redirect_uri="http://localhost:1455/auth/callback",
    )
    params = parse_qs(urlparse(url).query)
    assert "response_type=code" in url
    assert f"client_id={CLIENT_ID}" in url
    assert "state=state123" in url
    assert "code_challenge=challenge456" in url
    assert "code_challenge_method=S256" in url
    assert params["scope"][0].split() == [
        "openid",
        "profile",
        "email",
        "offline_access",
        "api.connectors.read",
        "api.connectors.invoke",
    ]
    assert params["originator"][0] == "codex_cli_rs"
    assert params["redirect_uri"][0] == "http://localhost:1455/auth/callback"
    assert ISSUER in url


@verifies(SWR.SWR_705)
def test_parse_jwt_claims_valid_token() -> None:
    import base64
    import json

    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).rstrip(b"=")
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": "user1", "chatgpt_account_id": "acct-xyz"}).encode(),
    ).rstrip(b"=")
    sig = base64.urlsafe_b64encode(b"signature").rstrip(b"=")
    token = f"{header.decode()}.{payload.decode()}.{sig.decode()}"

    claims = _parse_jwt_claims(token)
    assert claims is not None
    assert claims["sub"] == "user1"
    assert claims["chatgpt_account_id"] == "acct-xyz"


@verifies(SWR.SWR_705)
def test_parse_jwt_claims_invalid_token() -> None:
    assert _parse_jwt_claims("not.a.valid-base64!!!") is None
    assert _parse_jwt_claims("onlytwoparts.here") is None
    assert _parse_jwt_claims("") is None


@verifies(SWR.SWR_705)
@pytest.mark.asyncio
async def test_authenticate_starts_callback_server_before_prompt(monkeypatch) -> None:
    """Productive use: a user can start browser sign-in after the callback listener is ready.
    Expected outcome: the callback listener starts before the authorization prompt is shown.
    """
    events: list[str] = []

    class FakeHTTPServer:
        timeout = 0.0

        def __init__(self, *_args: object, **_kwargs: object) -> None:
            self.socket = MagicMock()
            events.append("server")

        def shutdown(self) -> None:
            events.append("shutdown")

        def server_close(self) -> None:
            events.append("server_close")

    def fake_serve(self: CodexAuthProvider, server: FakeHTTPServer) -> None:
        del self, server
        events.append("serve")

    async def fake_wait(self: CodexAuthProvider, expected_state: str, cancel_event=None) -> None:
        del self, expected_state
        events.append("wait")

    async def on_prompt(url: str) -> None:
        assert url.startswith(f"{ISSUER}/oauth/authorize?")
        events.append("prompt")

    monkeypatch.setattr("rotaris_core.auth.codex.HTTPServer", FakeHTTPServer)
    monkeypatch.setattr(CodexAuthProvider, "_serve_until_callback", fake_serve)
    monkeypatch.setattr(CodexAuthProvider, "_wait_for_callback", fake_wait)

    result = await CodexAuthProvider().authenticate(on_prompt=on_prompt)

    assert not result.success
    assert events.index("server") < events.index("prompt")
    assert "shutdown" in events


@verifies(SWR.SWR_705)
@pytest.mark.asyncio
async def test_authenticate_stops_callback_server_via_asyncio_to_thread(monkeypatch) -> None:
    """Productive use: a user can finish browser sign-in without a callback-server error.
    Expected outcome: shutdown completes before the listener socket is closed.
    """
    events: list[str] = []

    class FakeHTTPServer:
        timeout = 0.0

        def __init__(self, *_args: object, **_kwargs: object) -> None:
            events.append("server")

        def shutdown(self) -> None:
            events.append("shutdown")

        def server_close(self) -> None:
            events.append("server_close")

    class FakeThread:
        def __init__(self, *args: object, **kwargs: object) -> None:
            del args, kwargs
            self._alive = False
            events.append("thread")

        def start(self) -> None:
            events.append("start")

        def join(self, timeout: float | None = None) -> None:
            events.append(f"join:{timeout}")

        def is_alive(self) -> bool:
            return self._alive

    async def fake_to_thread(func, *args, **kwargs):
        del kwargs
        events.append(f"to_thread:{func.__name__}")
        return func(*args)

    async def fake_wait(self: CodexAuthProvider, expected_state: str, cancel_event=None) -> None:
        del self, expected_state
        events.append("wait")

    monkeypatch.setattr("rotaris_core.auth.codex.HTTPServer", FakeHTTPServer)
    monkeypatch.setattr("rotaris_core.auth.codex.Thread", FakeThread)
    monkeypatch.setattr("rotaris_core.auth.codex.asyncio.to_thread", fake_to_thread)
    monkeypatch.setattr(CodexAuthProvider, "_wait_for_callback", fake_wait)

    result = await CodexAuthProvider().authenticate()

    assert not result.success
    assert "to_thread:shutdown" in events
    assert "to_thread:join" in events
    assert "join:2.0" in events
    assert events.index("shutdown") < events.index("join:2.0") < events.index("server_close")


@verifies(SWR.SWR_705)
def test_callback_server_uses_serve_forever_for_shutdown_compatibility() -> None:
    class FakeHTTPServer:
        def __init__(self) -> None:
            self.poll_interval: float | None = None

        def serve_forever(self, poll_interval: float = 0.5) -> None:
            self.poll_interval = poll_interval

    server = FakeHTTPServer()
    CodexAuthProvider()._serve_until_callback(server)  # type: ignore[arg-type]

    assert server.poll_interval == 0.1


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_authenticated() -> None:
    provider = CodexAuthProvider()
    tokens = TokenSet(
        access_token="eyJ...",
        refresh_token="ref",
        expires_at=time.time() + 3600,
        extra={"requested_scopes": "openid profile email offline_access"},
    )
    status = await provider.check_status(tokens)
    assert status == AuthStatus.AUTHENTICATED


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_authenticated_without_codex_specific_scope() -> None:
    provider = CodexAuthProvider()
    tokens = TokenSet(
        access_token="eyJ...",
        refresh_token="ref",
        expires_at=time.time() + 3600,
        extra={"requested_scopes": "openid profile email offline_access"},
    )
    status = await provider.check_status(tokens)
    assert status == AuthStatus.AUTHENTICATED


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_expired() -> None:
    provider = CodexAuthProvider()
    tokens = TokenSet(access_token="eyJ...", refresh_token="ref", expires_at=time.time() - 100)
    status = await provider.check_status(tokens)
    assert status == AuthStatus.EXPIRED


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_unauthenticated() -> None:
    provider = CodexAuthProvider()
    tokens = TokenSet(access_token="", refresh_token="")
    status = await provider.check_status(tokens)
    assert status == AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_706)
@pytest.mark.asyncio
@respx.mock
async def test_refresh_success() -> None:
    provider = CodexAuthProvider()
    original = TokenSet(
        access_token="old_access",
        refresh_token="old_refresh",
        expires_at=time.time() - 100,
        account_id="acct-1",
    )

    respx.post(f"{ISSUER}/oauth/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": "new_access",
                "refresh_token": "new_refresh",
                "expires_in": 3600,
            },
        ),
    )

    result = await provider.refresh(original)
    assert result.success
    assert result.tokens is not None
    assert result.tokens.access_token == "new_access"
    assert result.tokens.refresh_token == "new_refresh"
    assert result.tokens.expires_at > time.time()
    assert result.tokens.extra["auth_mode"] == "chatgpt"
    assert result.tokens.extra["requested_scopes"] == (
        "openid profile email offline_access api.connectors.read api.connectors.invoke"
    )


@verifies(SWR.SWR_706)
@pytest.mark.asyncio
@respx.mock
async def test_refresh_failure() -> None:
    provider = CodexAuthProvider()
    original = TokenSet(access_token="old", refresh_token="old_r", expires_at=0)

    respx.post(f"{ISSUER}/oauth/token").mock(
        return_value=httpx.Response(401, json={"error": "invalid_grant"}),
    )

    result = await provider.refresh(original)
    assert not result.success


@verifies(SWR.SWR_706)
@pytest.mark.asyncio
@respx.mock
async def test_refresh_network_error() -> None:
    provider = CodexAuthProvider()
    original = TokenSet(access_token="a", refresh_token="r", expires_at=0)

    respx.post(f"{ISSUER}/oauth/token").mock(side_effect=httpx.ConnectError("timeout"))

    result = await provider.refresh(original)
    assert not result.success
    assert "failed" in (result.error or "").lower()


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
async def test_exchange_id_token_for_api_key_success() -> None:
    provider = CodexAuthProvider()
    calls: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = dict(parse_qs(request.content.decode(), keep_blank_values=True))
        calls.append({k: v[0] for k, v in body.items()})
        return httpx.Response(200, json={"access_token": "sk-test-key-123"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        api_key, error = await provider._exchange_id_token_for_api_key(client, "id.tok.val")

    assert api_key == "sk-test-key-123"
    assert error is None
    assert len(calls) == 1
    sent = calls[0]
    assert sent["grant_type"] == "urn:ietf:params:oauth:grant-type:token-exchange"
    assert sent["client_id"] == CLIENT_ID
    assert sent["requested_token"] == "openai-api-key"
    assert sent["subject_token"] == "id.tok.val"
    assert sent["subject_token_type"] == "urn:ietf:params:oauth:token-type:id_token"


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
async def test_exchange_id_token_for_api_key_http_error() -> None:
    provider = CodexAuthProvider()

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(403, json={"error": "forbidden"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        api_key, error = await provider._exchange_id_token_for_api_key(client, "id.tok.val")

    assert api_key is None
    assert error is not None
    assert "403" in error


@verifies(SWR.SWR_720)
def test_format_api_key_exchange_error_explains_missing_organization_id() -> None:
    body = (
        '{"error":{"message":"Invalid ID token: missing organization_id",'
        '"type":"invalid_request_error","code":"invalid_subject_token"}}'
    )

    error = _format_api_key_exchange_error(401, body)

    assert "organization_id" in error
    assert "Select or create an OpenAI organization" in error
    assert "rotaris-cli login codex --reauth" in error
    assert "invalid_subject_token" not in error


def _jwt_with_claims(claims: dict[str, object]) -> str:
    import base64
    import json

    header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).rstrip(b"=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=")
    return f"{header.decode()}.{payload.decode()}.sig"


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
async def test_exchange_id_token_for_api_key_missing_access_token() -> None:
    provider = CodexAuthProvider()

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json={"unexpected": "shape"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        api_key, error = await provider._exchange_id_token_for_api_key(client, "id.tok.val")

    assert api_key is None
    assert error is not None
    assert "access_token" in error


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
@respx.mock
async def test_exchange_code_persists_chatgpt_tokens_without_api_key_exchange(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = CodexAuthProvider()
    token_url = f"{ISSUER}/oauth/token"
    access_token = _jwt_with_claims({"chatgpt_account_id": "acct-chatgpt"})
    route = respx.post(token_url).mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": access_token,
                "refresh_token": "refresh-1",
                "id_token": "id.jwt.token",
                "expires_in": 3600,
            },
        ),
    )

    async def fail_exchange(*_args: object, **_kwargs: object) -> tuple[str | None, str | None]:
        raise AssertionError("subscription login must not exchange ID token for API key")

    monkeypatch.setattr(provider, "_exchange_id_token_for_api_key", fail_exchange)

    result = await provider._exchange_code(
        "auth-code",
        "verifier",
        redirect_uri="http://localhost:1455/auth/callback",
    )

    assert result.success
    assert result.tokens is not None
    assert result.tokens.access_token == access_token
    assert result.tokens.refresh_token == "refresh-1"
    assert result.tokens.account_id == "acct-chatgpt"
    assert result.tokens.extra["auth_mode"] == "chatgpt"
    assert result.tokens.extra["requested_scopes"] == (
        "openid profile email offline_access api.connectors.read api.connectors.invoke"
    )
    assert "api_key" not in result.tokens.extra
    assert "api_key_exchange_error" not in result.tokens.extra
    assert len(route.calls) == 1


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
@respx.mock
async def test_exchange_code_missing_organization_id_exchange_path_cannot_fail_login(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = CodexAuthProvider()
    respx.post(f"{ISSUER}/oauth/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": "chatgpt.jwt.token",
                "refresh_token": "refresh-1",
                "id_token": "id.jwt.token",
                "expires_in": 3600,
            },
        ),
    )

    async def fail_exchange(*_args: object, **_kwargs: object) -> tuple[str | None, str | None]:
        return None, _format_api_key_exchange_error(
            401,
            (
                '{"error":{"message":"Invalid ID token: missing organization_id",'
                '"code":"invalid_subject_token"}}'
            ),
        )

    monkeypatch.setattr(provider, "_exchange_id_token_for_api_key", fail_exchange)

    result = await provider._exchange_code(
        "auth-code",
        "verifier",
        redirect_uri="http://localhost:1455/auth/callback",
    )

    assert result.success
    assert result.tokens is not None
    assert result.tokens.access_token == "chatgpt.jwt.token"
    assert result.tokens.extra["auth_mode"] == "chatgpt"
    assert "api_key_exchange_error" not in result.tokens.extra


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
@respx.mock
async def test_exchange_code_without_id_token_succeeds() -> None:
    provider = CodexAuthProvider()
    respx.post(f"{ISSUER}/oauth/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": "chatgpt.jwt.token",
                "refresh_token": "refresh-1",
                "expires_in": 3600,
            },
        ),
    )

    result = await provider._exchange_code(
        "auth-code",
        "verifier",
        redirect_uri="http://localhost:1455/auth/callback",
    )

    assert result.success
    assert result.tokens is not None
    assert result.tokens.access_token == "chatgpt.jwt.token"
    assert result.tokens.extra["auth_mode"] == "chatgpt"


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
@respx.mock
async def test_refresh_preserves_chatgpt_auth_mode_without_api_key_exchange(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = CodexAuthProvider()
    original = TokenSet(
        access_token="old_access",
        refresh_token="old_refresh",
        expires_at=time.time() - 100,
        account_id="acct-1",
        extra={"auth_mode": "chatgpt"},
    )
    respx.post(f"{ISSUER}/oauth/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": "new_access",
                "refresh_token": "new_refresh",
                "id_token": "id.jwt.token",
                "expires_in": 3600,
            },
        ),
    )

    async def fail_exchange(*_args: object, **_kwargs: object) -> tuple[str | None, str | None]:
        raise AssertionError("refresh must not exchange ID token for API key")

    monkeypatch.setattr(provider, "_exchange_id_token_for_api_key", fail_exchange)

    result = await provider.refresh(original)

    assert result.success
    assert result.tokens is not None
    assert result.tokens.access_token == "new_access"
    assert result.tokens.refresh_token == "new_refresh"
    assert result.tokens.account_id == "acct-1"
    assert result.tokens.extra["auth_mode"] == "chatgpt"
    assert "api_key" not in result.tokens.extra
    assert "api_key_exchange_error" not in result.tokens.extra


@verifies(SWR.SWR_720)
@pytest.mark.asyncio
@respx.mock
async def test_refresh_extracts_new_account_id_from_chatgpt_token() -> None:
    provider = CodexAuthProvider()
    access_token = _jwt_with_claims({"chatgpt_account_id": "acct-new"})
    original = TokenSet(
        access_token="old_access",
        refresh_token="old_refresh",
        expires_at=time.time() - 100,
        account_id="acct-old",
        extra={"auth_mode": "chatgpt"},
    )
    respx.post(f"{ISSUER}/oauth/token").mock(
        return_value=httpx.Response(
            200,
            json={
                "access_token": access_token,
                "refresh_token": "new_refresh",
                "expires_in": 3600,
            },
        ),
    )

    result = await provider.refresh(original)

    assert result.success
    assert result.tokens is not None
    assert result.tokens.account_id == "acct-new"
    assert result.tokens.extra["auth_mode"] == "chatgpt"
