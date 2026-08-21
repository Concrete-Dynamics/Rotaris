"""Productive use: a Rotaris Cloud user can learn what credit they have left.
Expected outcome: the backend's balance, credit state, spending decision, and last
billed call arrive as exact, provider-neutral values, and an unusable answer is
reported as such instead of being shown as an empty account."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

import httpx
import pytest
import respx

from rotaris_core.auth.provider import TokenSet
from rotaris_core.providers.cloud_account import (
    CloudAccountError,
    CreditState,
    cloud_account_status_url,
    fetch_cloud_account_status,
)
from rotaris_core.reqtocode import SWR, verifies

_DEFAULT_URL = "https://rotaris.ai/v1/account/usage-status"


def _tokens(**extra: str) -> TokenSet:
    return TokenSet(access_token="cloud-access", refresh_token="cloud-refresh", extra=dict(extra))


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "object": "account.usage_status",
        "schema_version": 1,
        "currency": "usd",
        "credit": {
            "balance_atomic": "12480000",
            "atomic_scale": "1000000",
            "state": "available",
            "admission_allowed": True,
        },
        "latest_settled_usage": {
            "occurred_at": "2026-08-19T12:22:04Z",
            "status": "SUCCEEDED",
            "cost_usd": "0.0031",
            "charge_atomic": "3100",
        },
    }
    payload.update(overrides)
    return payload


@verifies(SWR.SWR_780)
@respx.mock
def test_fetch_reports_balance_state_and_last_billed_call() -> None:
    route = respx.get(_DEFAULT_URL).mock(return_value=httpx.Response(200, json=_payload()))

    status = fetch_cloud_account_status(_tokens())

    assert status.currency == "USD"
    assert status.balance == Decimal("12.48")
    assert status.state is CreditState.AVAILABLE
    assert status.admission_allowed is True
    usage = status.latest_settled_usage
    assert usage is not None
    assert usage.cost == Decimal("0.0031")
    assert usage.status == "SUCCEEDED"
    assert usage.occurred_at == dt.datetime(2026, 8, 19, 12, 22, 4, tzinfo=dt.UTC)
    request = route.calls[0].request
    assert request.headers["Authorization"] == "Bearer cloud-access"
    assert request.headers["Accept"] == "application/json"
    assert request.headers["User-Agent"] == "rotaris/account"


@verifies(SWR.SWR_780)
@respx.mock
def test_atomic_scale_is_the_number_of_atomic_units_per_currency_unit() -> None:
    """The same scale converts the balance and the last call's charge.

    ``charge_atomic`` and ``cost_usd`` describe one amount twice, so they pin
    what ``atomic_scale`` means: a divisor, not a decimal exponent.
    """
    respx.get(_DEFAULT_URL).mock(return_value=httpx.Response(200, json=_payload()))

    status = fetch_cloud_account_status(_tokens())
    usage = status.latest_settled_usage

    assert usage is not None
    assert Decimal("3100") / Decimal("1000000") == usage.cost
    assert status.balance == Decimal("12480000") / Decimal("1000000")


@verifies(SWR.SWR_780)
@respx.mock
def test_balance_keeps_sub_cent_precision() -> None:
    respx.get(_DEFAULT_URL).mock(
        return_value=httpx.Response(
            200,
            json=_payload(
                credit={
                    "balance_atomic": "1",
                    "atomic_scale": "1000000",
                    "state": "available",
                    "admission_allowed": True,
                },
            ),
        ),
    )

    status = fetch_cloud_account_status(_tokens())

    assert status.balance == Decimal("0.000001")


@verifies(SWR.SWR_780)
@respx.mock
def test_account_that_never_billed_a_call_reports_no_usage() -> None:
    respx.get(_DEFAULT_URL).mock(
        return_value=httpx.Response(200, json=_payload(latest_settled_usage=None)),
    )

    status = fetch_cloud_account_status(_tokens())

    assert status.latest_settled_usage is None
    assert status.balance == Decimal("12.48")


@verifies(SWR.SWR_780)
@pytest.mark.parametrize(
    ("reported", "expected"),
    [
        ("available", CreditState.AVAILABLE),
        ("exhausted", CreditState.EXHAUSTED),
        ("overdrafted", CreditState.OVERDRAFTED),
        ("frozen_by_support", CreditState.UNKNOWN),
    ],
)
@respx.mock
def test_credit_state_maps_known_values_and_degrades_unknown_ones(
    reported: str,
    expected: CreditState,
) -> None:
    respx.get(_DEFAULT_URL).mock(
        return_value=httpx.Response(
            200,
            json=_payload(
                credit={
                    "balance_atomic": "0",
                    "atomic_scale": "1000000",
                    "state": reported,
                    "admission_allowed": False,
                },
            ),
        ),
    )

    status = fetch_cloud_account_status(_tokens())

    assert status.state is expected
    assert status.admission_allowed is False
    assert status.balance == Decimal(0)


@verifies(SWR.SWR_780)
@respx.mock
def test_stored_api_base_overrides_the_provider_default() -> None:
    route = respx.get("https://staging.rotaris.ai/v1/account/usage-status").mock(
        return_value=httpx.Response(200, json=_payload()),
    )

    status = fetch_cloud_account_status(_tokens(api_base="https://staging.rotaris.ai/v1"))

    assert status.balance == Decimal("12.48")
    assert route.called


@verifies(SWR.SWR_780)
def test_status_url_falls_back_to_the_provider_default() -> None:
    assert cloud_account_status_url(_tokens()) == _DEFAULT_URL


@verifies(SWR.SWR_780)
@respx.mock
def test_rejected_credential_is_reported_as_a_sign_in_problem() -> None:
    respx.get(_DEFAULT_URL).mock(return_value=httpx.Response(401, json={"error": {}}))

    with pytest.raises(CloudAccountError, match="sign in again"):
        fetch_cloud_account_status(_tokens())


@verifies(SWR.SWR_780)
@respx.mock
def test_server_error_is_reported_with_its_status() -> None:
    respx.get(_DEFAULT_URL).mock(return_value=httpx.Response(503, text="unavailable"))

    with pytest.raises(CloudAccountError, match="503"):
        fetch_cloud_account_status(_tokens())


@verifies(SWR.SWR_780)
@respx.mock
def test_unreachable_backend_is_reported_rather_than_raised_as_transport_error() -> None:
    respx.get(_DEFAULT_URL).mock(side_effect=httpx.ConnectTimeout("timed out"))

    with pytest.raises(CloudAccountError):
        fetch_cloud_account_status(_tokens())


@verifies(SWR.SWR_780)
@respx.mock
def test_unusable_body_is_reported() -> None:
    respx.get(_DEFAULT_URL).mock(return_value=httpx.Response(200, text="<html>nope</html>"))

    with pytest.raises(CloudAccountError):
        fetch_cloud_account_status(_tokens())


@verifies(SWR.SWR_780)
@respx.mock
def test_missing_credit_block_is_reported() -> None:
    respx.get(_DEFAULT_URL).mock(
        return_value=httpx.Response(200, json={"object": "account.usage_status"}),
    )

    with pytest.raises(CloudAccountError, match="credit block"):
        fetch_cloud_account_status(_tokens())


@verifies(SWR.SWR_780)
@respx.mock
def test_unusable_scale_is_reported_rather_than_dividing_by_zero() -> None:
    respx.get(_DEFAULT_URL).mock(
        return_value=httpx.Response(
            200,
            json=_payload(
                credit={
                    "balance_atomic": "12480000",
                    "atomic_scale": "0",
                    "state": "available",
                    "admission_allowed": True,
                },
            ),
        ),
    )

    with pytest.raises(CloudAccountError, match="scale"):
        fetch_cloud_account_status(_tokens())


@verifies(SWR.SWR_780)
@respx.mock
def test_unusable_last_call_does_not_cost_the_caller_the_balance() -> None:
    respx.get(_DEFAULT_URL).mock(
        return_value=httpx.Response(
            200,
            json=_payload(
                latest_settled_usage={"occurred_at": "not-a-time", "status": "SUCCEEDED"}
            ),
        ),
    )

    status = fetch_cloud_account_status(_tokens())

    assert status.latest_settled_usage is None
    assert status.balance == Decimal("12.48")
