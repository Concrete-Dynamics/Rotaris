from __future__ import annotations

import asyncio
import time

import httpx
import pytest
import respx

import rotaris_core.auth.copilot as copilot_mod
from rotaris_core.auth.copilot import CLIENT_ID, CopilotAuthProvider
from rotaris_core.auth.copilot_token import CopilotExchangeError, CopilotSession
from rotaris_core.auth.provider import AuthFlowType, AuthStatus, DeviceCodePrompt, TokenSet
from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture(autouse=True)
def _no_device_flow_polling_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    """Take the real-time wait out of the device-code poll loop.

    ``_poll_for_token`` sleeps ``interval + _POLLING_SAFETY_MARGIN_S`` before every
    attempt. The scripted flows below already set the server-supplied ``interval``
    to 0, but the 3s margin is added on top of it, so each polled attempt cost a
    real three seconds and this file alone spent 18s of a 722s serial run asleep.

    What the margin protects is GitHub's rate limiter, which no ``respx`` route has.
    Zeroing it here leaves the loop, the ordering, and every response the tests
    script exactly as they are. The margin itself keeps its own coverage in
    :func:`test_each_poll_waits_the_rate_limit_margin_on_top_of_the_servers_interval`,
    which reads the delay the loop asks for instead of living through it.
    """
    monkeypatch.setattr(copilot_mod, "_POLLING_SAFETY_MARGIN_S", 0.0)


def _stub_session(
    monkeypatch: pytest.MonkeyPatch,
    *,
    bearer: str = "tid=fresh",
    expires_at: float = 1_900_000_000.0,
    api_base: str = "https://api.githubcopilot.com",
    sku: str | None = "copilot_individual",
    raises: Exception | None = None,
) -> list[str]:
    """Replace ``exchange_github_for_session`` with a recording stub."""
    calls: list[str] = []

    def fake(token: str) -> CopilotSession:
        calls.append(token)
        if raises is not None:
            raise raises
        return CopilotSession(bearer=bearer, expires_at=expires_at, api_base=api_base, sku=sku)

    monkeypatch.setattr(copilot_mod, "exchange_github_for_session", fake)
    return calls


@verifies(SWR.SWR_701, SWR.SWR_720)
def test_provider_id_and_flow_type() -> None:
    provider = CopilotAuthProvider()
    assert provider.provider_id == "copilot"
    assert provider.flow_type == AuthFlowType.DEVICE_CODE


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_unauthenticated_when_no_access_token() -> None:
    provider = CopilotAuthProvider()
    status = await provider.check_status(TokenSet(access_token="", refresh_token=""))
    assert status == AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_unauthenticated_for_legacy_gho_refresh_token() -> None:
    # Previously-stored OAuth App tokens must force re-auth instead of
    # silently breaking mid-request.
    provider = CopilotAuthProvider()
    tokens = TokenSet(
        access_token="stale-bearer",
        refresh_token="gho_legacy",
        expires_at=time.time() + 3600,
    )
    status = await provider.check_status(tokens)
    assert status == AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_expired_when_expiry_in_margin() -> None:
    provider = CopilotAuthProvider()
    tokens = TokenSet(
        access_token="tid=ok",
        refresh_token="ghu_valid",
        expires_at=time.time() + 5,  # within 60s margin
    )
    assert await provider.check_status(tokens) == AuthStatus.EXPIRED


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_expired_when_expiry_unset() -> None:
    provider = CopilotAuthProvider()
    tokens = TokenSet(access_token="tid=ok", refresh_token="ghu_valid", expires_at=0.0)
    assert await provider.check_status(tokens) == AuthStatus.EXPIRED


@verifies(SWR.SWR_703)
@pytest.mark.asyncio
async def test_check_status_authenticated_for_fresh_session() -> None:
    provider = CopilotAuthProvider()
    tokens = TokenSet(
        access_token="tid=ok",
        refresh_token="ghu_valid",
        expires_at=time.time() + 3600,
    )
    assert await provider.check_status(tokens) == AuthStatus.AUTHENTICATED


@verifies(SWR.SWR_706)
@pytest.mark.asyncio
async def test_refresh_rejects_legacy_gho_token(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _stub_session(monkeypatch)
    provider = CopilotAuthProvider()
    result = await provider.refresh(TokenSet(access_token="tid=x", refresh_token="gho_legacy"))
    assert not result.success
    assert calls == []  # no network call for un-exchangeable tokens


@verifies(SWR.SWR_706)
@pytest.mark.asyncio
async def test_refresh_updates_bearer_and_api_base(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _stub_session(
        monkeypatch,
        bearer="tid=new",
        api_base="https://api.business.githubcopilot.com",
        sku="copilot_for_business_seat",
    )
    provider = CopilotAuthProvider()
    existing = TokenSet(
        access_token="tid=old",
        refresh_token="ghu_valid",
        expires_at=0.0,
        extra={"api_base": "https://api.githubcopilot.com", "other": "keep"},
    )

    result = await provider.refresh(existing)

    assert result.success
    assert result.tokens is not None
    assert result.tokens.access_token == "tid=new"
    assert result.tokens.refresh_token == "ghu_valid"
    assert result.tokens.extra["api_base"] == "https://api.business.githubcopilot.com"
    assert result.tokens.extra["sku"] == "copilot_for_business_seat"
    # Unrelated extras preserved.
    assert result.tokens.extra["other"] == "keep"
    assert calls == ["ghu_valid"]


@verifies(SWR.SWR_706)
@pytest.mark.asyncio
async def test_refresh_propagates_exchange_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_session(
        monkeypatch,
        raises=CopilotExchangeError("revoked", unauthorized=True),
    )
    provider = CopilotAuthProvider()
    result = await provider.refresh(TokenSet(access_token="tid=x", refresh_token="ghu_valid"))
    assert not result.success


@verifies(SWR.SWR_707)
@pytest.mark.asyncio
@respx.mock
async def test_authenticate_runs_device_flow_and_exchanges_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _stub_session(
        monkeypatch,
        bearer="tid=bearer",
        expires_at=1_800_000_000.0,
        api_base="https://api.githubcopilot.com",
        sku="copilot_individual",
    )
    provider = CopilotAuthProvider()

    device_route = respx.post("https://github.com/login/device/code").mock(
        return_value=httpx.Response(
            200,
            json={
                "device_code": "dc",
                "user_code": "ABCD-1234",
                "verification_uri": "https://github.com/login/device",
                "interval": 0,
                "expires_in": 900,
            },
        ),
    )
    respx.post("https://github.com/login/oauth/access_token").mock(
        return_value=httpx.Response(200, json={"access_token": "ghu_final"}),
    )

    prompts: list[DeviceCodePrompt] = []

    async def on_prompt(p: DeviceCodePrompt | str) -> None:
        assert isinstance(p, DeviceCodePrompt)
        prompts.append(p)

    result = await provider.authenticate(on_prompt=on_prompt)

    assert result.success
    assert result.tokens is not None
    # Session bearer is access_token; ghu_ is stashed as refresh for re-exchange.
    assert result.tokens.access_token == "tid=bearer"
    assert result.tokens.refresh_token == "ghu_final"
    assert result.tokens.expires_at == 1_800_000_000.0
    assert result.tokens.extra["api_base"] == "https://api.githubcopilot.com"
    assert result.tokens.extra["sku"] == "copilot_individual"
    assert calls == ["ghu_final"]
    assert len(prompts) == 1

    # GitHub Apps ignore ``scope``; verify we don't send it.
    body = device_route.calls[0].request.content.decode()
    assert CLIENT_ID in body
    assert '"scope"' not in body


@verifies(SWR.SWR_707)
@pytest.mark.asyncio
@respx.mock
async def test_authenticate_fails_when_device_flow_returns_non_ghu_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _stub_session(monkeypatch)
    provider = CopilotAuthProvider()

    respx.post("https://github.com/login/device/code").mock(
        return_value=httpx.Response(
            200,
            json={
                "device_code": "dc",
                "user_code": "X",
                "verification_uri": "https://github.com/login/device",
                "interval": 0,
                "expires_in": 300,
            },
        ),
    )
    respx.post("https://github.com/login/oauth/access_token").mock(
        return_value=httpx.Response(200, json={"access_token": "gho_wrong_app"}),
    )

    result = await provider.authenticate(on_prompt=None)
    assert not result.success
    # No session exchange attempted for a token we already know is wrong.
    assert calls == []


@verifies(SWR.SWR_707)
@pytest.mark.asyncio
@respx.mock
async def test_authenticate_surfaces_exchange_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_session(
        monkeypatch,
        raises=CopilotExchangeError("no Copilot subscription", unauthorized=True),
    )
    provider = CopilotAuthProvider()

    respx.post("https://github.com/login/device/code").mock(
        return_value=httpx.Response(
            200,
            json={
                "device_code": "dc",
                "user_code": "X",
                "verification_uri": "https://github.com/login/device",
                "interval": 0,
                "expires_in": 300,
            },
        ),
    )
    respx.post("https://github.com/login/oauth/access_token").mock(
        return_value=httpx.Response(200, json={"access_token": "ghu_ok"}),
    )

    result = await provider.authenticate(on_prompt=None)
    assert not result.success
    assert result.error is not None
    assert "session exchange" in result.error


@verifies(SWR.SWR_707)
@pytest.mark.asyncio
@respx.mock
async def test_authenticate_polls_authorization_pending_then_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_session(monkeypatch)
    provider = CopilotAuthProvider()

    respx.post("https://github.com/login/device/code").mock(
        return_value=httpx.Response(
            200,
            json={
                "device_code": "dc",
                "user_code": "X",
                "verification_uri": "https://github.com/login/device",
                "interval": 0,
                "expires_in": 300,
            },
        ),
    )
    call_count = 0

    def token_side_effect(_req: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            return httpx.Response(200, json={"error": "authorization_pending"})
        return httpx.Response(200, json={"access_token": "ghu_after_wait"})

    respx.post("https://github.com/login/oauth/access_token").mock(side_effect=token_side_effect)

    result = await provider.authenticate(on_prompt=None)
    assert result.success
    assert call_count == 2


@verifies(SWR.SWR_707)
@pytest.mark.asyncio
@respx.mock
async def test_each_poll_waits_the_rate_limit_margin_on_top_of_the_servers_interval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a user leaves the device-code page open while Rotaris waits for
    them to approve it, and GitHub does not shut the polling out for asking too often.
    Expected outcome: every attempt is spaced by the interval GitHub asked for plus the
    provider's own safety margin -- read here from the delay the loop requests, so the
    guarantee is asserted rather than paid for in wall-clock."""
    _stub_session(monkeypatch)
    monkeypatch.setattr(copilot_mod, "_POLLING_SAFETY_MARGIN_S", 3.0)

    delays: list[float] = []
    real_sleep = asyncio.sleep

    async def _record(delay: float) -> None:
        delays.append(delay)
        await real_sleep(0)

    monkeypatch.setattr(copilot_mod.asyncio, "sleep", _record)

    provider = CopilotAuthProvider()
    respx.post("https://github.com/login/device/code").mock(
        return_value=httpx.Response(
            200,
            json={
                "device_code": "dc",
                "user_code": "X",
                "verification_uri": "https://github.com/login/device",
                "interval": 5,
                "expires_in": 300,
            },
        ),
    )
    attempts = 0

    def token_side_effect(_req: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            return httpx.Response(200, json={"error": "authorization_pending"})
        return httpx.Response(200, json={"access_token": "ghu_after_wait"})

    respx.post("https://github.com/login/oauth/access_token").mock(side_effect=token_side_effect)

    result = await provider.authenticate(on_prompt=None)

    assert result.success
    assert attempts == 2
    # One wait before each attempt, never shorter than what the server asked for.
    assert delays == [8.0, 8.0]


@verifies(SWR.SWR_707)
@pytest.mark.asyncio
@respx.mock
async def test_authenticate_device_code_request_fails() -> None:
    provider = CopilotAuthProvider()

    respx.post("https://github.com/login/device/code").mock(return_value=httpx.Response(500))

    result = await provider.authenticate(on_prompt=None)
    assert not result.success


@verifies(SWR.SWR_707)
@pytest.mark.asyncio
@respx.mock
async def test_authenticate_poll_access_denied_returns_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_session(monkeypatch)
    provider = CopilotAuthProvider()

    respx.post("https://github.com/login/device/code").mock(
        return_value=httpx.Response(
            200,
            json={
                "device_code": "dc",
                "user_code": "X",
                "verification_uri": "https://github.com/login/device",
                "interval": 0,
                "expires_in": 300,
            },
        ),
    )
    respx.post("https://github.com/login/oauth/access_token").mock(
        return_value=httpx.Response(200, json={"error": "access_denied"}),
    )

    result = await provider.authenticate(on_prompt=None)
    assert not result.success
    assert result.error == "access_denied"
