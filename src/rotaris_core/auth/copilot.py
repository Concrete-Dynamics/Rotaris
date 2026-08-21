"""GitHub Copilot authentication: device flow + session-token exchange.

This provider uses the **Copilot Chat GitHub App** (client ID
``Iv1.b507a08c87ecfe98``) — the same app used by the VS Code Copilot Chat
extension, copilot.vim, avante.nvim, and LiteLLM. Device flow against a
GitHub App issues a ``ghu_`` user-to-server token, which is the only kind of
token accepted by Copilot's session-bearer exchange endpoint.

After the device flow completes we immediately exchange the ``ghu_`` token for
a short-lived session bearer (see :mod:`rotaris_core.auth.copilot_token`) and
persist both, along with the Business/Enterprise-aware ``api_base``, so the
LLM wiring can refresh the bearer without asking the user to re-authenticate.

``TokenSet`` layout written by this provider:

* ``access_token`` — session bearer (``tid=...``); used as ``Authorization: Bearer``.
* ``refresh_token`` — the long-lived ``ghu_`` token; used to re-exchange.
* ``expires_at`` — unix timestamp when the session bearer expires.
* ``extra["api_base"]`` — tenant-scoped API host from ``endpoints.api``.
* ``extra["sku"]`` — Copilot SKU, purely informational.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

import httpx

from rotaris_core.auth.copilot_token import (
    COPILOT_EDITOR_PLUGIN_VERSION,
    COPILOT_EDITOR_VERSION,
    COPILOT_USER_AGENT,
    CopilotExchangeError,
    exchange_github_for_session,
)
from rotaris_core.auth.provider import (
    AuthFlowType,
    AuthResult,
    AuthStatus,
    DeviceCodeCallback,
    DeviceCodePrompt,
    TokenSet,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import threading

_log = logging.getLogger(__name__)

# Copilot Chat GitHub App. Produces ``ghu_`` tokens via device flow, which the
# session-token exchange endpoint accepts. An OAuth App (``gho_``) would not
# work here — see https://github.com/anomalyco/opencode/issues/19338.
CLIENT_ID = "Iv1.b507a08c87ecfe98"

_DEFAULT_DOMAIN = "github.com"
# RFC 8628 safety margin — prevents tight polling and accommodates clock skew.
_POLLING_SAFETY_MARGIN_S = 3.0
_SLOW_DOWN_BACKOFF_S = 5
# Refresh a little before the server's reported expiry to avoid using a bearer
# that expires mid-request.
_EXPIRY_MARGIN_S = 60.0


def _get_urls(domain: str) -> dict[str, str]:
    return {
        "device_code": f"https://{domain}/login/device/code",
        "access_token": f"https://{domain}/login/oauth/access_token",
    }


def _looks_like_github_app_token(token: str) -> bool:
    """True when ``token`` is a GitHub App user token (``ghu_...``).

    Legacy ``gho_`` OAuth App tokens — left behind by earlier builds of this
    app — fail the session exchange, so we treat them as unauthenticated and
    force the user through the device flow one more time.
    """
    return token.startswith("ghu_")


@traces(SWR.SWR_701, SWR.SWR_706, SWR.SWR_707)
class CopilotAuthProvider:
    """Copilot device flow + session-bearer exchange.

    Providers are stateless; ``AuthManager`` handles persistence.
    """

    def __init__(self, *, domain: str = _DEFAULT_DOMAIN) -> None:
        self._domain = domain

    @property
    def provider_id(self) -> str:
        return "copilot"

    @property
    def flow_type(self) -> AuthFlowType:
        return AuthFlowType.DEVICE_CODE

    async def authenticate(
        self,
        on_prompt: DeviceCodeCallback | None = None,
        cancel_event: threading.Event | None = None,
    ) -> AuthResult:
        urls = _get_urls(self._domain)

        async with httpx.AsyncClient(timeout=30.0) as client:
            device_data = await self._request_device_code(client, urls["device_code"])
            if device_data is None:
                return AuthResult(success=False, error="Failed to initiate device authorization")

            if on_prompt:
                await on_prompt(
                    DeviceCodePrompt(
                        verification_uri=device_data["verification_uri"],
                        user_code=device_data["user_code"],
                        interval=device_data["interval"],
                        expires_in=device_data.get("expires_in", 900),
                    ),
                )

            poll_result = await self._poll_for_token(
                client, urls["access_token"], device_data, cancel_event=cancel_event
            )

        if not poll_result.success or poll_result.tokens is None:
            return poll_result

        github_token = poll_result.tokens.access_token
        try:
            session = await asyncio.to_thread(exchange_github_for_session, github_token)
        except CopilotExchangeError as exc:
            # Device flow succeeded but the account can't mint a session bearer
            # (no Copilot subscription, wrong GitHub App, etc.). Fail loudly so
            # the UI surfaces a real reason.
            return AuthResult(success=False, error=f"Copilot session exchange failed: {exc}")

        return AuthResult(
            success=True,
            tokens=TokenSet(
                access_token=session.bearer,
                refresh_token=github_token,
                expires_at=session.expires_at,
                extra={
                    "api_base": session.api_base,
                    **({"sku": session.sku} if session.sku else {}),
                },
            ),
        )

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        """Re-exchange the stored ``ghu_`` token for a fresh session bearer."""
        github_token = token_set.refresh_token
        if not github_token or not _looks_like_github_app_token(github_token):
            # No valid GitHub App token to refresh from (e.g. legacy ``gho_``).
            return AuthResult(
                success=False,
                error="Stored token cannot be refreshed; re-authentication required",
            )

        try:
            session = await asyncio.to_thread(exchange_github_for_session, github_token)
        except CopilotExchangeError as exc:
            return AuthResult(success=False, error=f"Copilot session refresh failed: {exc}")

        new_extra = dict(token_set.extra)
        new_extra["api_base"] = session.api_base
        if session.sku:
            new_extra["sku"] = session.sku

        return AuthResult(
            success=True,
            tokens=TokenSet(
                access_token=session.bearer,
                refresh_token=github_token,
                expires_at=session.expires_at,
                account_id=token_set.account_id,
                extra=new_extra,
            ),
        )

    def status(self, token_set: TokenSet) -> AuthStatus:
        if not token_set.access_token:
            return AuthStatus.UNAUTHENTICATED
        # Legacy ``gho_`` tokens left behind by earlier releases cannot be
        # exchanged; trigger reauth instead of silently breaking at call time.
        if token_set.refresh_token and not _looks_like_github_app_token(token_set.refresh_token):
            return AuthStatus.UNAUTHENTICATED
        if token_set.expires_at <= 0:
            # Session bearers always carry an expiry; an unset value means we
            # have no confidence in the token — force a refresh.
            return AuthStatus.EXPIRED
        if time.time() >= (token_set.expires_at - _EXPIRY_MARGIN_S):
            return AuthStatus.EXPIRED
        return AuthStatus.AUTHENTICATED

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        return self.status(token_set)

    async def _request_device_code(
        self,
        client: httpx.AsyncClient,
        url: str,
    ) -> dict[str, Any] | None:
        try:
            resp = await client.post(
                url,
                # GitHub Apps ignore ``scope`` — permissions come from the App
                # installation, not the OAuth scope string.
                json={"client_id": CLIENT_ID},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "User-Agent": COPILOT_USER_AGENT,
                    "Editor-Version": COPILOT_EDITOR_VERSION,
                    "Editor-Plugin-Version": COPILOT_EDITOR_PLUGIN_VERSION,
                },
            )
            if resp.status_code != 200:
                _log.error("Device code request failed: %d", resp.status_code)
                return None
            data = resp.json()
            return data if isinstance(data, dict) else None
        except httpx.HTTPError as exc:
            _log.error("Device code request error: %s", exc)
            return None

    async def _poll_for_token(
        self,
        client: httpx.AsyncClient,
        token_url: str,
        device_data: dict[str, Any],
        *,
        cancel_event: threading.Event | None = None,
    ) -> AuthResult:
        interval = device_data["interval"]
        device_code = device_data["device_code"]

        while True:
            if cancel_event is not None and cancel_event.is_set():
                return AuthResult(success=False, error="Cancelled by user")
            await asyncio.sleep(interval + _POLLING_SAFETY_MARGIN_S)

            try:
                resp = await client.post(
                    token_url,
                    json={
                        "client_id": CLIENT_ID,
                        "device_code": device_code,
                        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    },
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "User-Agent": COPILOT_USER_AGENT,
                    },
                )
            except httpx.HTTPError as exc:
                _log.error("Token poll error: %s", exc)
                return AuthResult(success=False, error=str(exc))

            if resp.status_code != 200:
                return AuthResult(success=False, error=f"Token poll HTTP {resp.status_code}")

            data = resp.json()

            if data.get("access_token"):
                token = data["access_token"]
                # GitHub App device flow emits a ``ghu_`` token; reject anything
                # else up-front so we don't persist a token we can't exchange.
                if not _looks_like_github_app_token(token):
                    return AuthResult(
                        success=False,
                        error=(
                            "Device flow returned a non-GitHub-App token "
                            f"(prefix={token[:4]!r}); expected ghu_. "
                            "This usually means the configured CLIENT_ID is "
                            "not a GitHub App."
                        ),
                    )
                return AuthResult(
                    success=True,
                    tokens=TokenSet(
                        access_token=token,
                        refresh_token=token,
                        expires_at=0.0,
                    ),
                )

            error = data.get("error", "")

            if error == "authorization_pending":
                continue

            if error == "slow_down":
                server_interval = data.get("interval")
                if isinstance(server_interval, int) and server_interval > 0:
                    interval = server_interval
                else:
                    interval += _SLOW_DOWN_BACKOFF_S
                continue

            return AuthResult(success=False, error=error or "Unknown polling error")
