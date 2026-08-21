"""Read the Rotaris Cloud account's credit status.

Rotaris Cloud is prepaid: the backend holds the balance and decides per request
whether an account may spend. ``GET /v1/account/usage-status`` is where it says
so, and this module is the only place that knows the payload's shape. Reads are
best-effort in the same sense as :mod:`rotaris_core.providers.subscription_usage`
- a failure raises :class:`CloudAccountError` for the caller to degrade, never
blocks the surface that asked.

Money crosses this boundary as :class:`~decimal.Decimal`. The backend reports the
balance in atomic units plus the scale those units are counted in; a float would
round the account's money on the way to the screen.
"""

from __future__ import annotations

import asyncio
import datetime as dt
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import TYPE_CHECKING, Any

import httpx

from rotaris_core.reqtocode import SWR, traces

from .catalog import BUILTIN_PROVIDERS
from .discovery import normalize_api_base

if TYPE_CHECKING:
    from rotaris_core.auth.provider import TokenSet
    from rotaris_core.auth.storage import TokenStorage

#: Provider id the Rotaris Cloud account belongs to.
CLOUD_PROVIDER_ID = "concrete-cloud"

#: Path of the account status endpoint, relative to the account's API base.
_USAGE_STATUS_PATH = "/account/usage-status"

_REQUEST_TIMEOUT_S = 5.0
_USER_AGENT = "rotaris/account"


class CloudAccountError(RuntimeError):
    """Rotaris Cloud did not return a usable account status."""


class CloudSignInRequiredError(CloudAccountError):
    """No usable Rotaris Cloud credential is stored.

    Distinct from a failed read: the answer is "sign in", not "try again".
    """


class CreditState(StrEnum):
    """How the backend describes the account's credit right now."""

    AVAILABLE = "available"
    EXHAUSTED = "exhausted"
    OVERDRAFTED = "overdrafted"
    #: A state this client does not know. A backend that adds one must not
    #: break an installed client, so unknown values degrade instead of raising.
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class SettledUsage:
    """The most recent call the account was actually billed for."""

    occurred_at: dt.datetime
    status: str
    cost: Decimal


@dataclass(frozen=True)
class CloudAccountStatus:
    """Provider-neutral view of a prepaid cloud account's standing."""

    currency: str
    balance: Decimal
    state: CreditState
    admission_allowed: bool
    latest_settled_usage: SettledUsage | None


@traces(SWR.SWR_780)
def cloud_account_status_url(tokens: TokenSet) -> str:
    """Resolve the account status endpoint for ``tokens``.

    The API base persisted from the CLI token exchange wins, because a token
    issued by one deployment must not be spent against another; the provider
    default covers a token set stored before that field existed.
    """
    stored_base = tokens.extra.get("api_base", "").strip()
    base = stored_base or BUILTIN_PROVIDERS[CLOUD_PROVIDER_ID].default_base_url
    try:
        normalized = normalize_api_base(base)
    except ValueError as exc:
        raise CloudAccountError(f"Rotaris Cloud API base is unusable: {base!r}") from exc
    return f"{normalized}{_USAGE_STATUS_PATH}"


@traces(SWR.SWR_780)
def fetch_cloud_account_status(
    tokens: TokenSet,
    *,
    client: httpx.Client | None = None,
) -> CloudAccountStatus:
    """Fetch the Rotaris Cloud credit status for an authenticated account.

    ``tokens`` should come from ``AuthManager.get_token`` so the access token is
    refreshed before it is presented.
    """
    url = cloud_account_status_url(tokens)
    headers = {
        "Authorization": f"Bearer {tokens.access_token}",
        "Accept": "application/json",
        "User-Agent": _USER_AGENT,
    }
    owned_client = client is None
    http = client or httpx.Client(timeout=_REQUEST_TIMEOUT_S, follow_redirects=True)
    try:
        payload = _get_json(http, url, headers=headers)
    finally:
        if owned_client:
            http.close()
    return _parse_status(payload)


@traces(SWR.SWR_780)
def load_cloud_account_status(
    *,
    storage: TokenStorage | None = None,
    client: httpx.Client | None = None,
) -> CloudAccountStatus:
    """Read the account status for the signed-in Rotaris Cloud account.

    Refreshes the stored credential first — an access token that expired while
    the app was open would otherwise read as a rejected credential. Blocking:
    callers run it off their event loop.
    """
    from rotaris_core.auth.manager import AuthManager
    from rotaris_core.auth.storage import TokenStorage

    token_storage = storage or TokenStorage()
    if token_storage.load(CLOUD_PROVIDER_ID) is None:
        raise CloudSignInRequiredError("Not signed in to Rotaris Cloud")

    manager = AuthManager(storage=token_storage)
    if asyncio.run(manager.get_token(CLOUD_PROVIDER_ID)) is None:
        raise CloudSignInRequiredError(
            manager.get_last_error(CLOUD_PROVIDER_ID) or "Rotaris Cloud sign-in has expired"
        )

    tokens = token_storage.load(CLOUD_PROVIDER_ID)
    if tokens is None:
        raise CloudSignInRequiredError("Not signed in to Rotaris Cloud")
    return fetch_cloud_account_status(tokens, client=client)


def _get_json(
    client: httpx.Client,
    url: str,
    *,
    headers: dict[str, str],
) -> dict[str, Any]:
    try:
        response = client.get(url, headers=headers)
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (401, 403):
            raise CloudAccountError(
                "Rotaris Cloud rejected the stored credential; sign in again."
            ) from exc
        raise CloudAccountError(f"Rotaris Cloud account request failed ({status})") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise CloudAccountError("Rotaris Cloud account request failed") from exc
    if not isinstance(payload, dict):
        raise CloudAccountError("Rotaris Cloud account response is not an object")
    return payload


def _parse_status(payload: dict[str, Any]) -> CloudAccountStatus:
    credit = payload.get("credit")
    if not isinstance(credit, dict):
        raise CloudAccountError("Rotaris Cloud account response carries no credit block")
    balance = _atomic_to_decimal(
        credit.get("balance_atomic"),
        credit.get("atomic_scale"),
        field="credit balance",
    )
    return CloudAccountStatus(
        currency=_currency(payload.get("currency")),
        balance=balance,
        state=_credit_state(credit.get("state")),
        admission_allowed=bool(credit.get("admission_allowed", False)),
        latest_settled_usage=_settled_usage(payload.get("latest_settled_usage")),
    )


def _settled_usage(value: Any) -> SettledUsage | None:
    """Parse the last billed call, or ``None`` for an account that has none.

    A partially unusable entry is dropped rather than raised on: the balance is
    the load-bearing number, and losing the last call's cost must not cost the
    caller the whole reading.
    """
    if not isinstance(value, dict):
        return None
    occurred_at = _parse_timestamp(value.get("occurred_at"))
    cost = _decimal_or_none(value.get("cost_usd"))
    if occurred_at is None or cost is None:
        return None
    status = value.get("status")
    return SettledUsage(
        occurred_at=occurred_at,
        status=status if isinstance(status, str) else "",
        cost=cost,
    )


def _currency(value: Any) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip().upper()
    return "USD"


def _credit_state(value: Any) -> CreditState:
    if isinstance(value, str):
        try:
            return CreditState(value.strip().lower())
        except ValueError:
            return CreditState.UNKNOWN
    return CreditState.UNKNOWN


def _atomic_to_decimal(atomic: Any, scale: Any, *, field: str) -> Decimal:
    """Convert an atomic amount and its scale into an exact decimal amount.

    ``atomic_scale`` is the number of atomic units in one unit of currency, so
    the amount is ``atomic / scale``.
    """
    amount = _decimal_or_none(atomic)
    divisor = _decimal_or_none(scale)
    if amount is None or divisor is None:
        raise CloudAccountError(f"Rotaris Cloud {field} is not a number")
    if divisor <= 0:
        raise CloudAccountError(f"Rotaris Cloud {field} scale is not positive")
    return amount / divisor


def _decimal_or_none(value: Any) -> Decimal | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, str):
        try:
            return Decimal(value.strip())
        except (InvalidOperation, ValueError):
            return None
    return None


def _parse_timestamp(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.UTC)
    return parsed
