from __future__ import annotations

import datetime as dt

import httpx
import pytest

from rotaris_core.auth.provider import TokenSet
from rotaris_core.providers.subscription_usage import (
    SubscriptionUsageError,
    fetch_provider_subscription_limits,
)
from rotaris_core.reqtocode import SWR, verifies

NOW = dt.datetime(2026, 7, 13, 10, 0, tzinfo=dt.UTC)


@verifies(SWR.SWR_776)
def test_fetch_codex_subscription_limits_uses_chatgpt_usage_endpoint() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url == "https://chatgpt.com/backend-api/wham/usage"
        return httpx.Response(
            200,
            json={
                "plan_type": "pro",
                "rate_limit": {
                    "primary_window": {
                        "used_percent": 42,
                        "limit_window_seconds": 18_000,
                        "reset_after_seconds": 7_200,
                        "reset_at": int(NOW.timestamp()) + 7_200,
                    },
                    "secondary_window": {
                        "used_percent": 63,
                        "limit_window_seconds": 604_800,
                        "reset_after_seconds": 216_000,
                        "reset_at": int(NOW.timestamp()) + 216_000,
                    },
                },
            },
        )

    tokens = TokenSet(
        access_token="codex-access",
        refresh_token="codex-refresh",
        account_id="acct-123",
    )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        limits = fetch_provider_subscription_limits("codex", tokens, client=client, now=NOW)

    assert [(item.label, item.used_label, item.percent_used) for item in limits] == [
        ("Codex 5-hour window", "42% used", 42),
        ("Codex weekly window", "63% used", 63),
    ]
    assert limits[0].detail == "58% remaining · resets in 2h"
    request = requests[-1]
    assert request.headers["Authorization"] == "Bearer codex-access"
    assert request.headers["ChatGPT-Account-Id"] == "acct-123"


@verifies(SWR.SWR_776)
def test_fetch_copilot_subscription_limit_uses_github_oauth_token() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url == "https://api.github.com/copilot_internal/user"
        return httpx.Response(
            200,
            json={
                "copilot_plan": "pro_plus",
                "token_based_billing": False,
                "quota_reset_date_utc": "2026-08-01T00:00:00Z",
                "quota_snapshots": {
                    "premium_interactions": {
                        "quota_id": "premium_interactions",
                        "entitlement": 1_500,
                        "quota_remaining": 1_088,
                        "remaining": 1_088,
                        "percent_remaining": 72.53,
                        "unlimited": False,
                        "overage_permitted": False,
                        "overage_count": 0,
                    }
                },
            },
        )

    tokens = TokenSet(
        access_token="tid=session-bearer",
        refresh_token="ghu_github-oauth",
    )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        limits = fetch_provider_subscription_limits("copilot", tokens, client=client, now=NOW)

    assert [(item.label, item.used_label, item.percent_used) for item in limits] == [
        ("Copilot premium requests", "412 / 1,500", 27)
    ]
    assert limits[0].detail == "73% remaining · resets Aug 1"
    assert requests[-1].headers["Authorization"] == "Bearer ghu_github-oauth"


@verifies(SWR.SWR_776)
def test_fetch_copilot_ai_credit_limit_uses_current_billing_label() -> None:
    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "token_based_billing": True,
                "quota_reset_date_utc": "2026-08-01T00:00:00Z",
                "quota_snapshots": {
                    "credits": {
                        "quota_id": "premium_interactions",
                        "entitlement": 1_000,
                        "quota_remaining": 675,
                        "remaining": 675,
                        "percent_remaining": 67.5,
                        "unlimited": False,
                        "overage_permitted": True,
                        "overage_count": 0,
                    }
                },
            },
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        limits = fetch_provider_subscription_limits(
            "copilot",
            TokenSet(access_token="tid=session", refresh_token="ghu_oauth"),
            client=client,
            now=NOW,
        )

    assert limits[0].label == "Copilot AI credits"
    assert limits[0].used_label == "325 / 1,000 credits"
    assert limits[0].percent_used == 32


@verifies(SWR.SWR_776)
def test_fetch_claude_code_limits_reports_five_hour_and_seven_day_windows() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url == "https://api.anthropic.com/api/oauth/usage"
        return httpx.Response(
            200,
            json={
                "five_hour": {
                    "utilization": 37,
                    "resets_at": (NOW + dt.timedelta(hours=2, minutes=30)).isoformat(),
                },
                "seven_day": {
                    "utilization": 61,
                    "resets_at": (NOW + dt.timedelta(days=2, hours=14)).isoformat(),
                },
                # Model-scoped weekly sub-limits are not surfaced today.
                "seven_day_opus": {"utilization": 12, "resets_at": None},
            },
        )

    tokens = TokenSet(access_token="sk-ant-oat01-token", refresh_token="")

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        limits = fetch_provider_subscription_limits("claude-code", tokens, client=client, now=NOW)

    assert [(item.label, item.used_label, item.percent_used) for item in limits] == [
        ("Claude Code 5-hour window", "37% used", 37),
        ("Claude Code 7-day window", "61% used", 61),
    ]
    assert limits[0].detail == "63% remaining · resets in 2h 30m"
    assert limits[1].detail == "39% remaining · resets in 2d 14h"
    request = requests[-1]
    assert request.headers["Authorization"] == "Bearer sk-ant-oat01-token"
    assert request.headers["anthropic-beta"] == "oauth-2025-04-20"


@verifies(SWR.SWR_776)
def test_fetch_claude_code_limits_omits_reset_when_window_has_no_timestamp() -> None:
    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"five_hour": {"utilization": 5, "resets_at": None}, "seven_day": None},
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        limits = fetch_provider_subscription_limits(
            "claude-code",
            TokenSet(access_token="sk-ant-oat01-token", refresh_token=""),
            client=client,
            now=NOW,
        )

    assert [item.detail for item in limits] == ["95% remaining"]


@verifies(SWR.SWR_776)
def test_fetch_claude_code_limits_raises_when_no_window_is_usable() -> None:
    def respond(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"extra_usage": {"is_enabled": False}})

    with (
        httpx.Client(transport=httpx.MockTransport(respond)) as client,
        pytest.raises(SubscriptionUsageError),
    ):
        fetch_provider_subscription_limits(
            "claude-code",
            TokenSet(access_token="sk-ant-oat01-token", refresh_token=""),
            client=client,
            now=NOW,
        )
