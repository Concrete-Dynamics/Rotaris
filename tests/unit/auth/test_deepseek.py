from __future__ import annotations

import pytest

from rotaris_core.auth.deepseek import DeepSeekAuthProvider
from rotaris_core.auth.provider import AuthFlowType, AuthStatus, TokenSet
from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture
def provider() -> DeepSeekAuthProvider:
    return DeepSeekAuthProvider()


@verifies(SWR.SWR_750)
def test_deepseek_auth_provider_id(provider: DeepSeekAuthProvider) -> None:
    assert provider.provider_id == "deepseek"


@verifies(SWR.SWR_750)
def test_deepseek_auth_provider_flow_type(provider: DeepSeekAuthProvider) -> None:
    assert provider.flow_type == AuthFlowType.API_KEY


@verifies(SWR.SWR_750, SWR.SWR_755)
async def test_check_status_authenticated_when_token_present(
    provider: DeepSeekAuthProvider,
) -> None:
    token_set = TokenSet(access_token="sk-test-key", refresh_token="")

    status = await provider.check_status(token_set)

    assert status == AuthStatus.AUTHENTICATED


@verifies(SWR.SWR_750)
async def test_check_status_unauthenticated_when_token_empty(
    provider: DeepSeekAuthProvider,
) -> None:
    token_set = TokenSet(access_token="", refresh_token="")

    status = await provider.check_status(token_set)

    assert status == AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_750)
async def test_refresh_passes_through_valid_token(provider: DeepSeekAuthProvider) -> None:
    token_set = TokenSet(access_token="sk-test-key", refresh_token="")

    result = await provider.refresh(token_set)

    assert result.success is True
    assert result.tokens is token_set


@verifies(SWR.SWR_750, SWR.SWR_755)
async def test_authenticate_returns_error_with_help_message(
    provider: DeepSeekAuthProvider,
) -> None:
    result = await provider.authenticate()

    assert result.success is False
    assert result.error is not None
    assert "rotaris-cli login deepseek" in result.error
