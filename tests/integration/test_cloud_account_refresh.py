"""Productive use: a user who left Rotaris open overnight still sees a current balance.
Expected outcome: reading Rotaris Cloud credit refreshes an expired access token first,
stores the renewed credential, and reads the balance with it — the user is never asked to
sign in again for a token the backend was willing to renew."""

from __future__ import annotations

import time
from decimal import Decimal
from typing import TYPE_CHECKING

import httpx
import pytest
import respx

from rotaris_core.auth.concrete_cloud import _ROTARIS_API_BASE
from rotaris_core.auth.provider import TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.providers.cloud_account import (
    CloudSignInRequiredError,
    CreditState,
    load_cloud_account_status,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

_ISSUER = "https://auth.rotaris.test/realms/rotaris"
_TOKEN_URL = f"{_ISSUER}/protocol/openid-connect/token"
#: Derived from the provider's own API base so a deployment override moves both the
#: credential the test stores and the endpoint it expects the balance to be read from.
_STATUS_URL = f"{_ROTARIS_API_BASE}/account/usage-status"

#: The OIDC metadata the provider persists at sign-in and reads back to refresh. A
#: credential missing any of it cannot be renewed at all, so storing the real shape is
#: what makes the renewal below exercise the refresh round trip rather than skip it.
_OIDC_EXTRA = {
    "issuer": _ISSUER,
    "token_endpoint": _TOKEN_URL,
    "revocation_endpoint": f"{_ISSUER}/protocol/openid-connect/revoke",
    "api_base": _ROTARIS_API_BASE,
}

_STATUS_BODY = {
    "object": "account.usage_status",
    "schema_version": 1,
    "currency": "USD",
    "credit": {
        "balance_atomic": "4500000",
        "atomic_scale": "1000000",
        "state": "available",
        "admission_allowed": True,
    },
    "latest_settled_usage": {
        "occurred_at": "2026-08-19T09:00:00Z",
        "status": "SUCCEEDED",
        "cost_usd": "0.0125",
        "charge_atomic": "12500",
    },
}


def _store_expired_token(token_dir: Path) -> TokenStorage:
    storage = TokenStorage(token_dir=token_dir)
    storage.save(
        "concrete-cloud",
        TokenSet(
            access_token="stale-access",
            refresh_token="valid-refresh",
            expires_at=time.time() - 60,
            extra=dict(_OIDC_EXTRA),
        ),
    )
    return storage


@verifies(SWR.SWR_780)
@respx.mock
def test_expired_credential_is_renewed_before_the_balance_is_read(tmp_path: Path) -> None:
    storage = _store_expired_token(tmp_path)
    refresh = respx.post(_TOKEN_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "token_type": "Bearer",
                "access_token": "fresh-access",
                "refresh_token": "next-refresh",
                "expires_in": 900,
            },
        ),
    )
    status_route = respx.get(_STATUS_URL).mock(
        return_value=httpx.Response(200, json=_STATUS_BODY),
    )

    status = load_cloud_account_status(storage=storage)

    assert status.balance == Decimal("4.50")
    assert status.state is CreditState.AVAILABLE
    assert status.admission_allowed is True
    assert refresh.called
    assert status_route.calls[0].request.headers["Authorization"] == "Bearer fresh-access"

    renewed = storage.load("concrete-cloud")
    assert renewed is not None
    assert renewed.access_token == "fresh-access"
    assert renewed.refresh_token == "next-refresh"
    # The renewed credential has to carry the metadata forward, or the *next* refresh
    # is the one that fails.
    assert renewed.extra["token_endpoint"] == _TOKEN_URL


@verifies(SWR.SWR_780)
@respx.mock
def test_a_refusal_to_renew_reads_as_signed_out_rather_than_as_a_failed_read(
    tmp_path: Path,
) -> None:
    storage = _store_expired_token(tmp_path)
    refresh = respx.post(_TOKEN_URL).mock(
        return_value=httpx.Response(400, json={"error": "invalid_grant"})
    )
    status_route = respx.get(_STATUS_URL).mock(
        return_value=httpx.Response(200, json=_STATUS_BODY),
    )

    with pytest.raises(CloudSignInRequiredError):
        load_cloud_account_status(storage=storage)

    # The refusal has to be the identity provider's, not a credential we never sent:
    # without this the test passes just as well when the refresh never happens.
    assert refresh.called
    assert not status_route.called


@verifies(SWR.SWR_780)
def test_no_stored_credential_reads_as_signed_out(tmp_path: Path) -> None:
    storage = TokenStorage(token_dir=tmp_path)

    with pytest.raises(CloudSignInRequiredError):
        load_cloud_account_status(storage=storage)


@verifies(SWR.SWR_780)
@respx.mock
def test_a_credential_still_valid_is_used_without_a_refresh_round_trip(tmp_path: Path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save(
        "concrete-cloud",
        TokenSet(
            access_token="live-access",
            refresh_token="valid-refresh",
            expires_at=time.time() + 600,
            extra=dict(_OIDC_EXTRA),
        ),
    )
    refresh = respx.post(_TOKEN_URL).mock(return_value=httpx.Response(500))
    status_route = respx.get(_STATUS_URL).mock(
        return_value=httpx.Response(200, json=_STATUS_BODY),
    )

    status = load_cloud_account_status(storage=storage)

    assert status.balance == Decimal("4.50")
    assert not refresh.called
    assert status_route.calls[0].request.headers["Authorization"] == "Bearer live-access"
