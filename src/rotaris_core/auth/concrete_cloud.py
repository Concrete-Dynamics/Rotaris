"""Rotaris Keycloak OIDC Authorization Code with PKCE authentication provider."""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import logging
import os
import secrets
import threading
import time
import webbrowser
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

CLIENT_ID = "rotaris-ai"
ISSUER = os.environ.get("ROTARIS_OIDC_ISSUER", "").rstrip("/")
_ROTARIS_API_BASE = os.environ.get("ROTARIS_API_BASE_URL", "https://rotaris.ai/v1").rstrip("/")
_CALLBACK_PATH = "/callback"
_CALLBACK_TIMEOUT_S = 300
_DEFAULT_EXPIRY_S = 900
_PKCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
_REQUIRED_DISCOVERY_ENDPOINTS = (
    "authorization_endpoint",
    "token_endpoint",
    "revocation_endpoint",
)


def _generate_pkce() -> tuple[str, str]:
    verifier = "".join(secrets.choice(_PKCE_CHARS) for _ in range(43))
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _build_authorize_url(
    state: str,
    pkce_challenge: str,
    *,
    redirect_uri: str,
    authorization_endpoint: str,
) -> str:
    params = urlencode(
        {
            "client_id": CLIENT_ID,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "code_challenge": pkce_challenge,
            "code_challenge_method": "S256",
            "state": state,
        },
    )
    return f"{authorization_endpoint}?{params}"


def _first_query_value(params: dict[str, list[str]], key: str) -> str | None:
    values = params.get(key)
    return values[0] if values else None


class _CallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler for the OIDC loopback callback."""

    code: str | None = None
    received_state: str | None = None
    error: str | None = None

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
        self._respond_html(
            200,
            "<h1>Success!</h1><p>You can close this tab and return to the terminal.</p>",
        )

    def _respond_html(self, status: int, body: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        _log.debug("OIDC loopback callback: %s", format % args)


def _build_token_set_from_response(
    data: dict[str, Any], *, discovery: dict[str, str]
) -> AuthResult:
    access_token = data.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        return AuthResult(success=False, error="Token response missing access_token")

    refresh_token = data.get("refresh_token", "")
    expires_in = data.get("expires_in", _DEFAULT_EXPIRY_S)
    expires_at = (
        time.time() + expires_in if isinstance(expires_in, int | float) and expires_in > 0 else 0.0
    )
    return AuthResult(
        success=True,
        tokens=TokenSet(
            access_token=access_token,
            refresh_token=refresh_token if isinstance(refresh_token, str) else "",
            expires_at=expires_at,
            extra={
                "issuer": discovery["issuer"],
                "token_endpoint": discovery["token_endpoint"],
                "revocation_endpoint": discovery["revocation_endpoint"],
                "api_base": _ROTARIS_API_BASE,
            },
        ),
    )


@traces(SWR.SWR_745, SWR.SWR_781)
class ConcreteCloudAuthProvider:
    """The public ``rotaris-ai`` Keycloak OIDC client."""

    @property
    def provider_id(self) -> str:
        return "concrete-cloud"

    @property
    def flow_type(self) -> AuthFlowType:
        return AuthFlowType.PKCE

    async def authenticate(
        self,
        on_prompt: DeviceCodeCallback | None = None,
        cancel_event: threading.Event | None = None,
    ) -> AuthResult:
        _log.info("Starting Rotaris Keycloak OIDC browser PKCE login")
        discovery_result = await self._discover()
        if isinstance(discovery_result, AuthResult):
            return discovery_result
        discovery = discovery_result
        verifier, challenge = _generate_pkce()
        state = secrets.token_urlsafe(32)
        _CallbackHandler.code = None
        _CallbackHandler.received_state = None
        _CallbackHandler.error = None

        server, redirect_uri = self._bind_callback_server()
        authorize_url = _build_authorize_url(
            state,
            challenge,
            redirect_uri=redirect_uri,
            authorization_endpoint=discovery["authorization_endpoint"],
        )
        server_thread = Thread(target=self._serve_until_callback, args=(server,), daemon=True)
        server_thread.start()
        try:
            if on_prompt:
                await on_prompt(authorize_url)
            await asyncio.to_thread(webbrowser.open, authorize_url)
            code = await self._wait_for_callback(state, cancel_event=cancel_event)
        finally:
            await self._shutdown_server(server, server_thread)

        if code is None:
            if cancel_event is not None and cancel_event.is_set():
                return AuthResult(success=False, error="Cancelled by user")
            return AuthResult(
                success=False, error=_CallbackHandler.error or "Authentication timed out"
            )
        return await self._exchange_code(
            code, verifier, redirect_uri=redirect_uri, discovery=discovery
        )

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        token_endpoint = token_set.extra.get("token_endpoint")
        if not token_endpoint:
            return AuthResult(success=False, error="Stored OIDC token endpoint is missing")
        discovery = _discovery_from_token_set(token_set)
        if discovery is None:
            return AuthResult(success=False, error="Stored OIDC metadata is incomplete")
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    token_endpoint,
                    data={
                        "grant_type": "refresh_token",
                        "client_id": CLIENT_ID,
                        "refresh_token": token_set.refresh_token,
                    },
                )
            except httpx.HTTPError as exc:
                return AuthResult(success=False, error=f"Refresh request failed: {exc}")
        if response.status_code != 200:
            return AuthResult(
                success=False, error=f"Token refresh failed: HTTP {response.status_code}"
            )
        return _build_token_set_from_response(response.json(), discovery=discovery)

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        if not token_set.access_token:
            return AuthStatus.UNAUTHENTICATED
        if token_set.is_expired:
            return AuthStatus.EXPIRED
        return AuthStatus.AUTHENTICATED

    async def _discover(self) -> dict[str, str] | AuthResult:
        if not ISSUER:
            return AuthResult(
                success=False,
                error="ROTARIS_OIDC_ISSUER must be configured for Rotaris Cloud login",
            )
        url = f"{ISSUER}/.well-known/openid-configuration"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url)
            except httpx.HTTPError as exc:
                return AuthResult(success=False, error=f"OIDC discovery request failed: {exc}")
        if response.status_code != 200:
            return AuthResult(
                success=False, error=f"OIDC discovery failed: HTTP {response.status_code}"
            )
        try:
            raw = response.json()
        except ValueError:
            return AuthResult(success=False, error="OIDC discovery returned invalid JSON")
        if not isinstance(raw, dict) or raw.get("issuer") != ISSUER:
            return AuthResult(
                success=False, error="OIDC discovery issuer did not match configured issuer"
            )
        discovery = {key: raw.get(key) for key in ("issuer", *_REQUIRED_DISCOVERY_ENDPOINTS)}
        if not all(isinstance(value, str) and value for value in discovery.values()):
            return AuthResult(success=False, error="OIDC discovery omitted a required endpoint")
        return {key: value for key, value in discovery.items() if isinstance(value, str)}

    def _serve_until_callback(self, server: HTTPServer) -> None:
        server.serve_forever(poll_interval=0.1)

    def _bind_callback_server(self) -> tuple[HTTPServer, str]:
        try:
            server = HTTPServer(("127.0.0.1", 0), _CallbackHandler)
            server.timeout = 1.0
            return server, f"http://127.0.0.1:{server.server_address[1]}{_CALLBACK_PATH}"
        except OSError as exc:
            raise RuntimeError(f"OIDC: could not bind loopback callback server: {exc}") from exc

    async def _shutdown_server(self, server: HTTPServer, server_thread: Thread) -> None:
        with contextlib.suppress(asyncio.CancelledError, RuntimeError):
            await asyncio.to_thread(server.shutdown)
        await asyncio.to_thread(server_thread.join, 2.0)
        if server_thread.is_alive():
            _log.warning("OIDC callback server thread did not stop within 2s")
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
                    _log.error("CSRF: state mismatch in OIDC callback")
                    return None
                return _CallbackHandler.code
            await asyncio.sleep(0.5)
        return None

    async def _exchange_code(
        self,
        code: str,
        verifier: str,
        *,
        redirect_uri: str,
        discovery: dict[str, str],
    ) -> AuthResult:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    discovery["token_endpoint"],
                    data={
                        "grant_type": "authorization_code",
                        "client_id": CLIENT_ID,
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "code_verifier": verifier,
                    },
                )
            except httpx.HTTPError as exc:
                return AuthResult(success=False, error=f"Token exchange failed: {exc}")
        if response.status_code != 200:
            return AuthResult(success=False, error=f"Token exchange HTTP {response.status_code}")
        return _build_token_set_from_response(response.json(), discovery=discovery)


def _discovery_from_token_set(token_set: TokenSet) -> dict[str, str] | None:
    discovery = {
        "issuer": token_set.extra.get("issuer"),
        "token_endpoint": token_set.extra.get("token_endpoint"),
        "revocation_endpoint": token_set.extra.get("revocation_endpoint"),
    }
    if not all(isinstance(value, str) and value for value in discovery.values()):
        return None
    return {key: value for key, value in discovery.items() if isinstance(value, str)}
