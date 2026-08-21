"""Exchange a GitHub App user token for a short-lived Copilot session bearer.

GitHub Copilot's API (``api.githubcopilot.com`` and Business/Enterprise variants)
does not accept raw GitHub OAuth tokens as the ``Authorization: Bearer`` value.
The real flow is:

  1. Device flow against the Copilot Chat **GitHub App** (client ID
     ``Iv1.b507a08c87ecfe98``) issues a ``ghu_`` user-to-server token.
  2. ``GET /copilot_internal/v2/token`` with ``Authorization: token <ghu_>``
     returns a short-lived session bearer (``tid=...``) plus routing metadata:
     ``endpoints.api`` (e.g. ``https://api.githubcopilot.com`` for Individual,
     ``https://api.business.githubcopilot.com`` for Business), an ``expires_at``
     unix timestamp, and a ``sku`` identifier.
  3. The session bearer is used as ``Authorization: Bearer`` on API calls, with
     matching identity headers (``Copilot-Integration-Id``, ``Editor-Version``,
     ``Editor-Plugin-Version``, ``User-Agent``). Business/Enterprise APIs refuse
     the bearer without these headers.
  4. On expiry (~25 min) the ``ghu_`` token is re-exchanged for a fresh bearer.

OAuth App tokens (``gho_``) are rejected by the exchange endpoint with HTTP 404
— users with legacy tokens must re-run the device flow.

References:
  - https://github.com/anomalyco/opencode/issues/19338
  - https://github.com/anomalyco/opencode/issues/20759

"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

_EXCHANGE_URL = "https://api.github.com/copilot_internal/v2/token"

# Identity headers. ``Editor-Plugin-Version`` is the crucial one: the Business
# API cross-checks it against the ``Copilot-Integration-Id`` allow-list and
# returns 403 if stale. Bumped to current Copilot Chat extension values.
COPILOT_INTEGRATION_ID = "vscode-chat"
COPILOT_EDITOR_VERSION = "vscode/1.99.1"
COPILOT_EDITOR_PLUGIN_VERSION = "copilot-chat/0.28.0"
COPILOT_USER_AGENT = "GithubCopilot/0.28.0"

COPILOT_INTEGRATION_HEADERS: dict[str, str] = {
    "Copilot-Integration-Id": COPILOT_INTEGRATION_ID,
    "Editor-Version": COPILOT_EDITOR_VERSION,
    "Editor-Plugin-Version": COPILOT_EDITOR_PLUGIN_VERSION,
    "OpenAI-Intent": "conversation-panel",
    "User-Agent": COPILOT_USER_AGENT,
}

# Fallback only. Prefer the ``endpoints.api`` value from the exchange response
# so Business/Enterprise users get routed to their tenant-specific host.
DEFAULT_COPILOT_API_BASE = "https://api.githubcopilot.com"


class CopilotExchangeError(RuntimeError):
    """Raised when ``/copilot_internal/v2/token`` rejects the GitHub token.

    ``unauthorized=True`` means the GitHub token itself is invalid or revoked
    (HTTP 401 / 404) and the user must re-authenticate. Other errors (e.g. 5xx,
    network) are transient and a retry may succeed.
    """

    def __init__(self, message: str, *, unauthorized: bool = False) -> None:
        super().__init__(message)
        self.unauthorized = unauthorized


@dataclass(frozen=True)
class CopilotSession:
    """Result of a successful session-token exchange."""

    bearer: str
    expires_at: float
    api_base: str
    sku: str | None


@traces(SWR.SWR_701)
def exchange_github_for_session(github_token: str) -> CopilotSession:
    """Exchange a ``ghu_`` GitHub App user token for a Copilot session bearer.

    Callers are responsible for persisting the returned session (typically via
    :mod:`rotaris_core.auth.storage`). This helper does no caching — the on-disk
    ``TokenStorage`` is the single source of truth across processes.
    """
    if not github_token:
        raise CopilotExchangeError("empty GitHub token", unauthorized=True)

    _log.debug("Exchanging GitHub token for Copilot session bearer")

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(
                _EXCHANGE_URL,
                headers={
                    "Authorization": f"token {github_token}",
                    "User-Agent": COPILOT_USER_AGENT,
                    "Accept": "application/json",
                    "Editor-Version": COPILOT_EDITOR_VERSION,
                    "Editor-Plugin-Version": COPILOT_EDITOR_PLUGIN_VERSION,
                },
            )
    except httpx.HTTPError as exc:
        raise CopilotExchangeError(f"Copilot token exchange network error: {exc}") from exc

    if resp.status_code in (401, 404):
        # 404 is what GitHub returns for ``gho_`` tokens and for ``ghu_`` tokens
        # without an active Copilot subscription. 401 is explicit revocation.
        raise CopilotExchangeError(
            f"Copilot token exchange rejected (HTTP {resp.status_code}): "
            f"{resp.text.strip() or 'no body'}",
            unauthorized=True,
        )
    if resp.status_code != 200:
        raise CopilotExchangeError(
            f"Copilot token exchange failed (HTTP {resp.status_code}): "
            f"{resp.text.strip() or 'no body'}",
        )

    try:
        data = resp.json()
    except ValueError as exc:
        raise CopilotExchangeError(f"Copilot token exchange returned non-JSON body: {exc}") from exc

    bearer = data.get("token")
    if not isinstance(bearer, str) or not bearer:
        raise CopilotExchangeError(f"Copilot token exchange returned no token: {data!r}")

    expires_at_raw = data.get("expires_at", 0)
    try:
        expires_at = float(expires_at_raw)
    except (TypeError, ValueError):
        expires_at = 0.0

    endpoints = data.get("endpoints") or {}
    api_base_raw = endpoints.get("api") if isinstance(endpoints, dict) else None
    api_base = (
        api_base_raw.rstrip("/")
        if isinstance(api_base_raw, str) and api_base_raw
        else DEFAULT_COPILOT_API_BASE
    )

    sku = data.get("sku") if isinstance(data.get("sku"), str) else None

    _log.debug(
        "Copilot session acquired: api_base=%s sku=%s expires_at=%d",
        api_base,
        sku,
        int(expires_at),
    )

    return CopilotSession(bearer=bearer, expires_at=expires_at, api_base=api_base, sku=sku)
