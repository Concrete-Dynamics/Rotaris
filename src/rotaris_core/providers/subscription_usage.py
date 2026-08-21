"""Read subscription usage exposed by authenticated coding providers.

Codex follows OpenAI's official CLI implementation and reads
``https://chatgpt.com/backend-api/wham/usage``. GitHub documents the Copilot
allowances but its per-user snapshot endpoint is internal and undocumented;
the supported editor clients read ``https://api.github.com/copilot_internal/user``.
Claude Code reads ``https://api.anthropic.com/api/oauth/usage`` with the
subscription OAuth token, which is what backs its own ``/usage`` display.
Failures are therefore expected to be handled as best-effort by callers.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import httpx

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.auth.provider import TokenSet

_CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
_COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user"
_CLAUDE_CODE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"

#: Beta flag Anthropic requires on OAuth-bearer (as opposed to API-key) calls.
_CLAUDE_CODE_OAUTH_BETA = "oauth-2025-04-20"

#: Rolling windows the usage payload exposes, in the order they are displayed.
#: Each is ``{"utilization": <percent 0-100>, "resets_at": <ISO 8601>}``.
_CLAUDE_CODE_WINDOWS: tuple[tuple[str, str], ...] = (
    ("five_hour", "Claude Code 5-hour window"),
    ("seven_day", "Claude Code 7-day window"),
)


class SubscriptionUsageError(RuntimeError):
    """A provider did not return usable subscription usage data."""


@dataclass(frozen=True)
class ProviderSubscriptionLimit:
    """Provider-neutral subscription limit ready for a progress display."""

    label: str
    used_label: str
    percent_used: int
    detail: str


@traces(SWR.SWR_776)
def fetch_provider_subscription_limits(
    provider_id: str,
    tokens: TokenSet,
    *,
    client: httpx.Client | None = None,
    now: dt.datetime | None = None,
) -> list[ProviderSubscriptionLimit]:
    """Fetch current subscription limits for a supported authenticated provider."""
    instant = now or dt.datetime.now(dt.UTC)
    owned_client = client is None
    http = client or httpx.Client(timeout=5.0, follow_redirects=True)
    try:
        if provider_id == "codex":
            return _fetch_codex_limits(http, tokens, instant)
        if provider_id == "copilot":
            return _fetch_copilot_limits(http, tokens, instant)
        if provider_id == "claude-code":
            return _fetch_claude_code_limits(http, tokens, instant)
        return []
    finally:
        if owned_client:
            http.close()


def _fetch_codex_limits(
    client: httpx.Client,
    tokens: TokenSet,
    now: dt.datetime,
) -> list[ProviderSubscriptionLimit]:
    headers = {
        "Authorization": f"Bearer {tokens.access_token}",
        "Accept": "application/json",
        "User-Agent": "codex-cli",
    }
    if tokens.account_id:
        headers["ChatGPT-Account-Id"] = tokens.account_id
    payload = _get_json(client, _CODEX_USAGE_URL, headers=headers, provider="Codex")
    rate_limit = payload.get("rate_limit")
    if not isinstance(rate_limit, dict):
        raise SubscriptionUsageError("Codex usage response contains no rate-limit windows")

    limits: list[ProviderSubscriptionLimit] = []
    for key, fallback_label in (
        ("primary_window", "Codex 5-hour window"),
        ("secondary_window", "Codex weekly window"),
    ):
        window = rate_limit.get(key)
        if not isinstance(window, dict):
            continue
        used = _percentage(window.get("used_percent"))
        if used is None:
            continue
        label = _codex_window_label(window.get("limit_window_seconds"), fallback_label)
        reset_detail = _reset_detail(window, now)
        remaining = max(0, 100 - used)
        detail = f"{remaining}% remaining"
        if reset_detail:
            detail = f"{detail} · resets {reset_detail}"
        limits.append(
            ProviderSubscriptionLimit(
                label=label,
                used_label=f"{used}% used",
                percent_used=used,
                detail=detail,
            )
        )
    if not limits:
        raise SubscriptionUsageError("Codex usage response contains no usable windows")
    return limits


def _fetch_copilot_limits(
    client: httpx.Client,
    tokens: TokenSet,
    now: dt.datetime,
) -> list[ProviderSubscriptionLimit]:
    # The model API bearer (tid=...) is not a GitHub API credential. The
    # refresh token is the long-lived GitHub App user token minted at login.
    github_token = tokens.refresh_token
    if not github_token:
        raise SubscriptionUsageError("Copilot GitHub token is unavailable")
    payload = _get_json(
        client,
        _COPILOT_USAGE_URL,
        headers={
            "Authorization": f"Bearer {github_token}",
            "Accept": "application/json",
            "User-Agent": "GithubCopilot/0.28.0",
            "Copilot-Integration-Id": "vscode-chat",
        },
        provider="Copilot",
    )
    snapshots = payload.get("quota_snapshots")
    if not isinstance(snapshots, dict):
        raise SubscriptionUsageError("Copilot usage response contains no quota snapshots")
    quota = next(
        (
            value
            for value in snapshots.values()
            if isinstance(value, dict) and value.get("quota_id") == "premium_interactions"
        ),
        None,
    )
    if quota is None:
        raise SubscriptionUsageError("Copilot usage response contains no plan allowance")

    token_billing = bool(payload.get("token_based_billing") or quota.get("token_based_billing"))
    label = "Copilot AI credits" if token_billing else "Copilot premium requests"
    if quota.get("unlimited") is True:
        return [ProviderSubscriptionLimit(label, "Unlimited", 0, "No plan allowance cap")]

    entitlement = _number(quota.get("entitlement"))
    remaining = _number(quota.get("quota_remaining"))
    if entitlement is None or entitlement <= 0 or remaining is None:
        raise SubscriptionUsageError("Copilot plan allowance is incomplete")
    used_amount = max(0.0, entitlement - remaining)
    percent_remaining = _number(quota.get("percent_remaining"))
    if percent_remaining is None:
        percent_remaining = remaining / entitlement * 100
    percent_remaining = min(100.0, max(0.0, percent_remaining))
    percent_used = int(100 - percent_remaining)

    used_label = f"{_format_number(used_amount)} / {_format_number(entitlement)}"
    if token_billing:
        used_label += " credits"
    reset_at = payload.get("quota_reset_date_utc") or payload.get("quota_reset_date")
    reset_label = _calendar_reset_label(reset_at, now)
    detail = f"{round(percent_remaining):d}% remaining"
    if reset_label:
        detail = f"{detail} · resets {reset_label}"
    overage = _number(quota.get("overage_count"))
    if overage and overage > 0:
        detail += f" · {_format_number(overage)} overage"
    return [ProviderSubscriptionLimit(label, used_label, percent_used, detail)]


def _fetch_claude_code_limits(
    client: httpx.Client,
    tokens: TokenSet,
    now: dt.datetime,
) -> list[ProviderSubscriptionLimit]:
    # The subscription OAuth token minted by 'claude setup-token' is the same
    # credential Claude Code itself presents to this endpoint, so no separate
    # API key is involved and nothing here is billed against the API.
    payload = _get_json(
        client,
        _CLAUDE_CODE_USAGE_URL,
        headers={
            "Authorization": f"Bearer {tokens.access_token}",
            "Accept": "application/json",
            "anthropic-beta": _CLAUDE_CODE_OAUTH_BETA,
            "anthropic-version": "2023-06-01",
        },
        provider="Claude Code",
    )

    limits: list[ProviderSubscriptionLimit] = []
    for key, label in _CLAUDE_CODE_WINDOWS:
        window = payload.get(key)
        if not isinstance(window, dict):
            continue
        used = _percentage(window.get("utilization"))
        if used is None:
            continue
        detail = f"{max(0, 100 - used)}% remaining"
        reset_detail = _iso_reset_detail(window.get("resets_at"), now)
        if reset_detail:
            detail = f"{detail} · resets {reset_detail}"
        limits.append(
            ProviderSubscriptionLimit(
                label=label,
                used_label=f"{used}% used",
                percent_used=used,
                detail=detail,
            )
        )
    if not limits:
        raise SubscriptionUsageError("Claude Code usage response contains no usable windows")
    return limits


def _get_json(
    client: httpx.Client,
    url: str,
    *,
    headers: dict[str, str],
    provider: str,
) -> dict[str, Any]:
    try:
        response = client.get(url, headers=headers)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise SubscriptionUsageError(f"{provider} usage request failed") from exc
    if not isinstance(payload, dict):
        raise SubscriptionUsageError(f"{provider} usage response is not an object")
    return payload


def _codex_window_label(seconds: Any, fallback: str) -> str:
    value = _number(seconds)
    if value == 18_000:
        return "Codex 5-hour window"
    if value == 604_800:
        return "Codex weekly window"
    return fallback


def _reset_detail(window: dict[str, Any], now: dt.datetime) -> str:
    reset_at = _number(window.get("reset_at"))
    if reset_at is not None:
        seconds = max(0, int(reset_at - now.timestamp()))
    else:
        reset_after = _number(window.get("reset_after_seconds"))
        if reset_after is None:
            return ""
        seconds = max(0, int(reset_after))
    return _relative_reset_label(seconds)


def _iso_reset_detail(value: Any, now: dt.datetime) -> str:
    """Render an ISO 8601 reset timestamp as a countdown from ``now``."""
    if not isinstance(value, str) or not value.strip():
        return ""
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.UTC)
    return _relative_reset_label(max(0, int((parsed - now).total_seconds())))


def _relative_reset_label(seconds: int) -> str:
    if seconds < 60:
        return "in <1m"
    days, remainder = divmod(seconds, 86_400)
    hours, remainder = divmod(remainder, 3_600)
    minutes = remainder // 60
    if days:
        return f"in {days}d {hours}h" if hours else f"in {days}d"
    if hours:
        return f"in {hours}h {minutes}m" if minutes else f"in {hours}h"
    return f"in {minutes}m"


def _calendar_reset_label(value: Any, _now: dt.datetime) -> str:
    if not isinstance(value, str) or not value.strip():
        return ""
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return f"{parsed.strftime('%b')} {parsed.day}"


def _percentage(value: Any) -> int | None:
    number = _number(value)
    if number is None:
        return None
    return min(100, max(0, int(round(number))))


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").strip())
        except ValueError:
            return None
    return None


def _format_number(value: float) -> str:
    if value.is_integer():
        return f"{int(value):,}"
    return f"{value:,.2f}".rstrip("0").rstrip(".")
