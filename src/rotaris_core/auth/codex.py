"""OpenAI Codex authentication via Authorization Code + PKCE flow."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import json
import logging
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from rotaris_core.auth.provider import (
    AuthFlowType,
    AuthResult,
    AuthStatus,
    DeviceCodeCallback,
    TokenSet,
)
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
ISSUER = "https://auth.openai.com"
_CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
_CALLBACK_PATH = "/auth/callback"
_REQUIRED_SCOPES: tuple[str, ...] = ()
_SCOPES = " ".join(
    (
        "openid",
        "profile",
        "email",
        "offline_access",
        "api.connectors.read",
        "api.connectors.invoke",
    ),
)
_CALLBACK_TIMEOUT_S = 300
_USER_AGENT = "rotaris"
_DEFAULT_EXPIRY_S = 3600
# Upstream codex-rs uses fixed ports 1455 (primary) / 1457 (fallback) whitelisted
# in Hydra's redirect_uri allow-list. Binding to ephemeral port 0 causes the
# authorize endpoint to reject the request with unknown_error before callback.
_CALLBACK_PORT_PRIMARY = 1455
_CALLBACK_PORT_FALLBACK = 1457
# Upstream originator identifier — must match codex-rs DEFAULT_ORIGINATOR or
# Hydra rejects the authorize request.
_ORIGINATOR = "codex_cli_rs"

_PKCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"


def _generate_pkce() -> tuple[str, str]:
    verifier = "".join(secrets.choice(_PKCE_CHARS) for _ in range(43))
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _build_authorize_url(state: str, pkce_challenge: str, *, redirect_uri: str) -> str:
    params = urlencode(
        {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": redirect_uri,
            "scope": _SCOPES,
            "code_challenge": pkce_challenge,
            "code_challenge_method": "S256",
            "id_token_add_organizations": "true",
            "codex_cli_simplified_flow": "true",
            "state": state,
            "originator": _ORIGINATOR,
        },
    )
    return f"{ISSUER}/oauth/authorize?{params}"


def _parse_jwt_claims(token: str) -> dict[str, Any] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1]
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        decoded = base64.urlsafe_b64decode(payload)
        import json

        claims = json.loads(decoded)
        return claims if isinstance(claims, dict) else None
    except Exception:
        return None


def _extract_account_id(tokens_data: dict[str, Any]) -> str | None:
    for token_key in ("id_token", "access_token"):
        raw_token = tokens_data.get(token_key)
        if not isinstance(raw_token, str) or not raw_token:
            continue
        claims = _parse_jwt_claims(raw_token)
        if not claims:
            continue
        account_id = claims.get("chatgpt_account_id") or (
            claims.get("https://api.openai.com/auth") or {}
        ).get("chatgpt_account_id")
        if isinstance(account_id, str) and account_id:
            return account_id
        orgs = claims.get("organizations")
        if isinstance(orgs, list) and orgs:
            first_org = orgs[0]
            if isinstance(first_org, dict):
                org_id = first_org.get("id")
                if isinstance(org_id, str) and org_id:
                    return org_id
    return None


def _token_extra(tokens_data: dict[str, Any]) -> dict[str, str]:
    extra = {"auth_mode": "chatgpt", "requested_scopes": _SCOPES}
    scope = tokens_data.get("scope")
    if isinstance(scope, str) and scope:
        extra["scope"] = scope
    return extra


def _format_api_key_exchange_error(status_code: int, body: str) -> str:
    body_snippet = body[:500] if body else "<empty>"
    message = body_snippet
    code: str | None = None
    try:
        payload = json.loads(body) if body else {}
    except ValueError:
        payload = {}
    error_payload = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error_payload, dict):
        raw_message = error_payload.get("message")
        if isinstance(raw_message, str) and raw_message:
            message = raw_message
        raw_code = error_payload.get("code")
        if isinstance(raw_code, str) and raw_code:
            code = raw_code

    if code == "invalid_subject_token" and "missing organization_id" in message:
        return (
            f"API key exchange HTTP {status_code}: OpenAI rejected the Codex login token "
            "because it does not include an organization_id. Select or create an OpenAI "
            "organization for this account, then run 'rotaris-cli login codex --reauth'."
        )
    return f"API key exchange HTTP {status_code}: {message}"


def _split_scope_value(value: str) -> set[str]:
    return {part for part in value.replace(",", " ").split() if part}


def _token_scopes(token_set: TokenSet) -> set[str]:
    scopes: set[str] = set()
    for key in ("scope", "scopes", "requested_scopes"):
        value = token_set.extra.get(key)
        if value:
            scopes.update(_split_scope_value(value))

    claims = _parse_jwt_claims(token_set.access_token)
    if claims:
        jwt_scope = claims.get("scope")
        if isinstance(jwt_scope, str):
            scopes.update(_split_scope_value(jwt_scope))
        jwt_scopes = claims.get("scp")
        if isinstance(jwt_scopes, list):
            scopes.update(scope for scope in jwt_scopes if isinstance(scope, str))

    return scopes


def _has_required_scopes(token_set: TokenSet) -> bool:
    return set(_REQUIRED_SCOPES).issubset(_token_scopes(token_set))


def _first_query_value(params: dict[str, list[str]], key: str) -> str | None:
    values = params.get(key)
    if not values:
        return None
    return values[0]


class _CallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler for the OAuth callback server."""

    code: str | None = None
    received_state: str | None = None
    error: str | None = None
    _event: asyncio.Event | None = None

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != _CALLBACK_PATH:
            self.send_response(404)
            self.end_headers()
            return

        params = parse_qs(parsed.query)
        _CallbackHandler.received_state = _first_query_value(params, "state")

        error = _first_query_value(params, "error")
        if error:
            _CallbackHandler.error = _first_query_value(params, "error_description") or error
            self._respond_html(400, "<h1>Authentication Failed</h1><p>You can close this tab.</p>")
            return

        code = _first_query_value(params, "code")
        if not code:
            _CallbackHandler.error = "No authorization code received"
            self._respond_html(400, "<h1>Error</h1><p>No code received.</p>")
            return

        _CallbackHandler.code = code
        self._respond_html(200, "<h1>Success!</h1><p>You can close this tab.</p>")

    def _respond_html(self, status: int, body: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        _log.debug("OAuth callback: %s", format % args)


@traces(SWR.SWR_702, SWR.SWR_705, SWR.SWR_708)
class CodexAuthProvider:
    def __init__(self) -> None:
        self._server: HTTPServer | None = None
        self._server_thread: Thread | None = None

    @property
    def provider_id(self) -> str:
        return "codex"

    @property
    def flow_type(self) -> AuthFlowType:
        return AuthFlowType.PKCE

    async def authenticate(
        self,
        on_prompt: DeviceCodeCallback | None = None,
        cancel_event: threading.Event | None = None,
    ) -> AuthResult:
        _log.info("Starting Codex OAuth device callback flow")
        verifier, challenge = _generate_pkce()
        state = secrets.token_urlsafe(32)

        _CallbackHandler.code = None
        _CallbackHandler.received_state = None
        _CallbackHandler.error = None

        server, actual_port = self._bind_callback_server()
        redirect_uri = f"http://localhost:{actual_port}{_CALLBACK_PATH}"
        authorize_url = _build_authorize_url(state, challenge, redirect_uri=redirect_uri)
        server_thread = Thread(target=self._serve_until_callback, args=(server,), daemon=True)
        server_thread.start()

        try:
            if on_prompt:
                await on_prompt(authorize_url)
            code = await self._wait_for_callback(state, cancel_event=cancel_event)
        finally:
            await self._shutdown_server(server, server_thread)

        if code is None:
            if cancel_event is not None and cancel_event.is_set():
                return AuthResult(success=False, error="Cancelled by user")
            error = _CallbackHandler.error or "Authentication timed out"
            return AuthResult(success=False, error=error)

        _log.info("Codex OAuth callback received; exchanging authorization code")
        return await self._exchange_code(code, verifier, redirect_uri=redirect_uri)

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(
                    f"{ISSUER}/oauth/token",
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": token_set.refresh_token,
                        "client_id": CLIENT_ID,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            except httpx.HTTPError as exc:
                return AuthResult(success=False, error=f"Refresh request failed: {exc}")

            if resp.status_code != 200:
                return AuthResult(
                    success=False,
                    error=f"Token refresh failed: HTTP {resp.status_code}",
                )

            data = resp.json()
            account_id = _extract_account_id(data) or token_set.account_id
            expires_in = data.get("expires_in", _DEFAULT_EXPIRY_S)

            extra = _token_extra(data)

            return AuthResult(
                success=True,
                tokens=TokenSet(
                    access_token=data["access_token"],
                    refresh_token=data.get("refresh_token", token_set.refresh_token),
                    expires_at=time.time() + expires_in,
                    account_id=account_id,
                    extra=extra,
                ),
            )

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        if not token_set.access_token:
            return AuthStatus.UNAUTHENTICATED
        if token_set.is_expired:
            return AuthStatus.EXPIRED
        if not _has_required_scopes(token_set):
            return AuthStatus.UNAUTHENTICATED
        return AuthStatus.AUTHENTICATED

    def _serve_until_callback(self, server: HTTPServer) -> None:
        server.serve_forever(poll_interval=0.1)

    def _bind_callback_server(self) -> tuple[HTTPServer, int]:
        # Try primary fixed port first; fall back to secondary. Both ports are
        # whitelisted as redirect_uri in Hydra. Random/ephemeral ports are not.
        last_error: OSError | None = None
        for port in (_CALLBACK_PORT_PRIMARY, _CALLBACK_PORT_FALLBACK):
            try:
                server = HTTPServer(("127.0.0.1", port), _CallbackHandler)
                server.timeout = 1.0
                return server, port
            except OSError as exc:
                last_error = exc
                _log.warning("Codex OAuth: port %d unavailable (%s)", port, exc)
        raise RuntimeError(
            "Codex OAuth: both whitelisted callback ports "
            f"({_CALLBACK_PORT_PRIMARY}, {_CALLBACK_PORT_FALLBACK}) are in use. "
            "Close any process bound to these ports and retry.",
        ) from last_error

    async def _shutdown_server(self, server: HTTPServer, server_thread: Thread) -> None:
        _log.debug("Stopping Codex OAuth callback server")
        # shutdown() signals serve_forever() to exit.  Do not close server.socket
        # first: on Windows the serving thread can still be polling it, which
        # raises WinError 10038 from select().
        with contextlib.suppress(asyncio.CancelledError, RuntimeError):
            await asyncio.to_thread(server.shutdown)
        await asyncio.to_thread(server_thread.join, 2.0)
        if server_thread.is_alive():
            _log.warning("Codex OAuth callback server thread did not stop within 2s")
            return
        server.server_close()

    async def _wait_for_callback(
        self,
        expected_state: str,
        *,
        cancel_event: threading.Event | None = None,
    ) -> str | None:
        deadline = time.monotonic() + _CALLBACK_TIMEOUT_S
        while time.monotonic() < deadline:
            if cancel_event is not None and cancel_event.is_set():
                return None
            if _CallbackHandler.error:
                return None
            if _CallbackHandler.code:
                if _CallbackHandler.received_state != expected_state:
                    _log.error("CSRF: state mismatch in OAuth callback")
                    return None
                return _CallbackHandler.code
            await asyncio.sleep(0.5)
        return None

    async def _exchange_code(self, code: str, verifier: str, *, redirect_uri: str) -> AuthResult:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(
                    f"{ISSUER}/oauth/token",
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "client_id": CLIENT_ID,
                        "code_verifier": verifier,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            except httpx.HTTPError as exc:
                return AuthResult(success=False, error=f"Token exchange failed: {exc}")

            if resp.status_code != 200:
                return AuthResult(
                    success=False,
                    error=f"Token exchange HTTP {resp.status_code}",
                )

            data = resp.json()
            account_id = _extract_account_id(data)
            expires_in = data.get("expires_in", _DEFAULT_EXPIRY_S)
            _log.info("Codex OAuth token exchange succeeded")

            extra = _token_extra(data)

            return AuthResult(
                success=True,
                tokens=TokenSet(
                    access_token=data["access_token"],
                    refresh_token=data.get("refresh_token", ""),
                    expires_at=time.time() + expires_in,
                    account_id=account_id,
                    extra=extra,
                ),
            )

    async def _exchange_id_token_for_api_key(
        self,
        client: httpx.AsyncClient,
        id_token: str,
    ) -> tuple[str | None, str | None]:
        """Exchange an ID token for an OpenAI API key via RFC 8693 token exchange.

        Mirrors upstream codex-rs ``obtain_api_key`` in
        ``codex-rs/login/src/server.rs``. The returned ``access_token`` is an
        ``sk-…``-style API key suitable for ``api.openai.com`` endpoints.

        Returns ``(api_key, error)`` — exactly one of the two is non-None.
        """
        try:
            resp = await client.post(
                f"{ISSUER}/oauth/token",
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                    "client_id": CLIENT_ID,
                    "requested_token": "openai-api-key",
                    "subject_token": id_token,
                    "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.HTTPError as exc:
            return None, f"API key exchange request failed: {exc}"

        if resp.status_code != 200:
            body_snippet = resp.text[:500] if resp.text else "<empty>"
            error = _format_api_key_exchange_error(resp.status_code, resp.text)
            _log.warning(
                "Codex API key exchange failed: HTTP %s body=%s",
                resp.status_code,
                body_snippet,
            )
            return None, error

        try:
            payload = resp.json()
        except ValueError as exc:
            return None, f"API key exchange returned invalid JSON: {exc}"

        api_key = payload.get("access_token")
        if not isinstance(api_key, str) or not api_key:
            return None, "API key exchange response missing access_token"
        return api_key, None
