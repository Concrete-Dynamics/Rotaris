from __future__ import annotations

import httpx
import pytest
import respx

from rotaris_core.auth.copilot_token import (
    DEFAULT_COPILOT_API_BASE,
    CopilotExchangeError,
    exchange_github_for_session,
)
from rotaris_core.reqtocode import SWR, verifies

EXCHANGE_URL = "https://api.github.com/copilot_internal/v2/token"


@verifies(SWR.SWR_707)
@respx.mock
def test_exchange_returns_session_with_endpoints_and_sku() -> None:
    route = respx.get(EXCHANGE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "token": "tid=abc123",
                "expires_at": 1_700_000_000,
                "endpoints": {"api": "https://api.business.githubcopilot.com/"},
                "sku": "copilot_for_business_seat",
            },
        ),
    )

    session = exchange_github_for_session("ghu_sample")

    assert session.bearer == "tid=abc123"
    assert session.expires_at == 1_700_000_000.0
    # Trailing slash stripped so LiteLLM doesn't emit double-slash URLs.
    assert session.api_base == "https://api.business.githubcopilot.com"
    assert session.sku == "copilot_for_business_seat"

    assert route.call_count == 1
    request = route.calls[0].request
    assert request.headers["Authorization"] == "token ghu_sample"
    assert "Editor-Plugin-Version" in request.headers


@verifies(SWR.SWR_707)
@respx.mock
def test_exchange_falls_back_to_default_api_base_when_endpoints_missing() -> None:
    respx.get(EXCHANGE_URL).mock(
        return_value=httpx.Response(200, json={"token": "tid=x", "expires_at": 1}),
    )

    session = exchange_github_for_session("ghu_x")
    assert session.api_base == DEFAULT_COPILOT_API_BASE
    assert session.sku is None


@verifies(SWR.SWR_707)
@respx.mock
def test_exchange_marks_401_as_unauthorized() -> None:
    respx.get(EXCHANGE_URL).mock(return_value=httpx.Response(401, text="bad token"))

    with pytest.raises(CopilotExchangeError) as exc_info:
        exchange_github_for_session("ghu_bad")
    assert exc_info.value.unauthorized is True


@verifies(SWR.SWR_707)
@respx.mock
def test_exchange_marks_404_as_unauthorized_for_legacy_tokens() -> None:
    # 404 is what the endpoint returns for legacy ``gho_`` tokens and for
    # accounts without Copilot access — both require re-auth.
    respx.get(EXCHANGE_URL).mock(return_value=httpx.Response(404, text=""))

    with pytest.raises(CopilotExchangeError) as exc_info:
        exchange_github_for_session("gho_legacy")
    assert exc_info.value.unauthorized is True


@verifies(SWR.SWR_707)
@respx.mock
def test_exchange_treats_5xx_as_transient() -> None:
    respx.get(EXCHANGE_URL).mock(return_value=httpx.Response(503, text="overloaded"))

    with pytest.raises(CopilotExchangeError) as exc_info:
        exchange_github_for_session("ghu_x")
    assert exc_info.value.unauthorized is False


@verifies(SWR.SWR_707)
@respx.mock
def test_exchange_raises_when_response_has_no_token() -> None:
    respx.get(EXCHANGE_URL).mock(return_value=httpx.Response(200, json={"expires_at": 1}))

    with pytest.raises(CopilotExchangeError, match="no token"):
        exchange_github_for_session("ghu_x")


@verifies(SWR.SWR_708)
def test_exchange_rejects_empty_token() -> None:
    with pytest.raises(CopilotExchangeError) as exc_info:
        exchange_github_for_session("")
    assert exc_info.value.unauthorized is True
