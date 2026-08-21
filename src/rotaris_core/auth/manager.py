"""Central auth manager that coordinates providers, storage, and token lifecycle."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, cast

from rotaris_core.auth.provider import (
    AuthFlowType,
    AuthResult,
    AuthStatus,
    DeviceCodeCallback,
    TokenSet,
)
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import threading
    from collections.abc import Coroutine
    from pathlib import Path

    from rotaris_core.auth.provider import AuthProvider

_log = logging.getLogger(__name__)

_PROVIDERS: dict[str, type] = {}


class AuthenticationError(Exception):
    """Raised when an explicit authentication flow fails before returning a result."""


def _get_provider_class(provider_id: str) -> type | None:
    if not _PROVIDERS:
        from rotaris_core.auth.claude_code import ClaudeCodeAuthProvider
        from rotaris_core.auth.codex import CodexAuthProvider
        from rotaris_core.auth.concrete_cloud import ConcreteCloudAuthProvider
        from rotaris_core.auth.copilot import CopilotAuthProvider
        from rotaris_core.auth.deepseek import DeepSeekAuthProvider

        _PROVIDERS["copilot"] = CopilotAuthProvider
        _PROVIDERS["codex"] = CodexAuthProvider
        _PROVIDERS["concrete-cloud"] = ConcreteCloudAuthProvider
        _PROVIDERS["geraet-cloud"] = ConcreteCloudAuthProvider
        _PROVIDERS["deepseek"] = DeepSeekAuthProvider
        _PROVIDERS["claude-code"] = ClaudeCodeAuthProvider
    return _PROVIDERS.get(provider_id)


def get_provider_flow_type(provider_id: str) -> AuthFlowType | None:
    """Return how a provider authenticates (api_key / device_code / pkce).

    Custom openai-compatible providers are not in the static registry but
    always use stored API keys; anything else unknown returns None.
    """
    cls = _get_provider_class(provider_id)
    if cls is not None:
        return cast("AuthProvider", cls()).flow_type
    token_set = TokenStorage().load(provider_id)
    if token_set is not None and token_set.extra.get("provider_family") == "openai-compatible":
        return AuthFlowType.API_KEY
    return None


@traces(SWR.SWR_3711)
def run_auth_coro[T](coro: Coroutine[Any, Any, T]) -> T:
    """Await an auth coroutine from synchronous code, loop or no loop.

    Callers reach the auth manager from every corner of the app — config
    loading, Qt worker threads, CLI entry points — so the surrounding event
    loop may or may not exist. When one is already running the coroutine goes
    to a private loop on a worker thread; otherwise ``asyncio.run`` handles it
    here.

    Either handoff can fail *before* anything awaits ``coro`` — most visibly at
    interpreter shutdown, where the thread pool refuses new work. Closing the
    coroutine on that path keeps the real error visible instead of burying it
    under a "coroutine ... was never awaited" RuntimeWarning raised much later,
    at whatever unrelated line the garbage collector happened to reach.
    """
    import asyncio
    import contextlib

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    try:
        if loop is not None and loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(asyncio.run, coro).result(timeout=30)

        return asyncio.run(coro)
    except BaseException:
        with contextlib.suppress(RuntimeError):
            coro.close()
        raise


@traces(SWR.SWR_703, SWR.SWR_704, SWR.SWR_718, SWR.SWR_720, SWR.SWR_742)
@traces(SWR.SWR_3711, SWR.SWR_3712)
class AuthManager:
    """Coordinates authentication providers with persistent token storage.

    Handles: status checks, automatic refresh, and interactive auth initiation.
    """

    def __init__(
        self,
        *,
        storage: TokenStorage | None = None,
        workspace_root: Path | None = None,
    ) -> None:
        self._storage = storage or TokenStorage()
        self._providers: dict[str, AuthProvider] = {}
        self._last_errors: dict[str, str] = {}
        self._workspace_root = workspace_root

    def _stage_provider_tokens(self, provider_id: str, tokens: TokenSet) -> None:
        """Bridge provider-specific token files for LiteLLM consumption.

        GitHub Copilot needs a workspace-local LiteLLM token cache, and Codex
        now needs an OpenHands OAuth credential file for subscription-mode
        requests. We rewrite those bridge artifacts right after
        ``self._storage.save`` so on-disk state matches in-memory state.

        Failures here are logged but never raised — staging is best-effort and
        the LLM call itself will surface a real auth error if the bridge is
        broken.
        """
        if provider_id == "codex":
            try:
                from rotaris_core.auth.codex_bridge import stage_openhands_oauth_credentials

                stage_openhands_oauth_credentials(tokens)
            except Exception as exc:  # noqa: BLE001 — best-effort bridge
                _log.warning(
                    "Failed to stage Codex tokens for OpenHands subscription auth: %s",
                    exc,
                )
            return

        if provider_id != "copilot" or self._workspace_root is None:
            return
        try:
            from rotaris_core.auth.copilot_bridge import (
                ensure_litellm_env,
                litellm_copilot_token_dir,
                stage_copilot_tokens,
            )

            token_dir = litellm_copilot_token_dir(self._workspace_root)
            stage_copilot_tokens(tokens, token_dir=token_dir)
            ensure_litellm_env(token_dir)
        except Exception as exc:  # noqa: BLE001 — best-effort bridge
            _log.warning("Failed to stage Copilot tokens for LiteLLM: %s", exc)

    def _set_last_error(self, provider_id: str, error: str | None) -> None:
        if error:
            self._last_errors[provider_id] = error
        else:
            self._last_errors.pop(provider_id, None)

    def _get_or_create_provider(self, provider_id: str) -> AuthProvider | None:
        if provider_id in self._providers:
            return self._providers[provider_id]

        cls = _get_provider_class(provider_id)
        if cls is not None:
            provider = cls()
            self._providers[provider_id] = provider
            return cast("AuthProvider", provider)

        token_set = self._storage.load(provider_id)
        if token_set is not None and token_set.extra.get("provider_family") == "openai-compatible":
            from rotaris_core.auth.static import StaticAPIKeyAuthProvider

            provider = StaticAPIKeyAuthProvider(provider_id)
            self._providers[provider_id] = provider
            return provider

        _log.warning("Unknown auth provider: %s", provider_id)
        return None

    async def get_token(
        self,
        provider_id: str,
        *,
        on_prompt: DeviceCodeCallback | None = None,
    ) -> str | None:
        """Get a valid access token, refreshing or authenticating as needed.

        Returns None if authentication fails or is not possible (no on_prompt
        callback and user is unauthenticated).
        """
        provider = self._get_or_create_provider(provider_id)
        if provider is None:
            self._set_last_error(provider_id, f"Unknown provider: {provider_id}")
            return None

        token_set = self._storage.load(provider_id)

        if token_set is not None:
            status = provider.status(token_set)

            if status == AuthStatus.AUTHENTICATED:
                self._set_last_error(provider_id, None)
                return token_set.access_token

            if status == AuthStatus.EXPIRED:
                result = await provider.refresh(token_set)
                if result.success and result.tokens:
                    self._storage.save(provider_id, result.tokens)
                    self._stage_provider_tokens(provider_id, result.tokens)
                    self._set_last_error(provider_id, None)
                    return result.tokens.access_token
                _log.warning("Token refresh failed for %s, re-authenticating", provider_id)

        if on_prompt is None:
            self._set_last_error(provider_id, "Authentication required")
            return None

        result = await provider.authenticate(on_prompt=on_prompt)
        if result.success and result.tokens:
            self._storage.save(provider_id, result.tokens)
            self._stage_provider_tokens(provider_id, result.tokens)
            self._set_last_error(provider_id, None)
            return result.tokens.access_token

        error = result.error or "Authentication failed"
        self._set_last_error(provider_id, error)
        _log.error("Authentication failed for %s: %s", provider_id, error)
        return None

    async def renew(self, provider_id: str) -> str | None:
        """Refresh the stored credential now, whatever its status says.

        :meth:`get_token` renews only what is already unusable, which is the
        right answer for a caller that needs a token this instant. A caller
        looking further ahead — a run that will still be going when this token
        expires — needs to renew one that is *currently* fine, so it asks here.

        Returns the new access token, or ``None`` when the provider cannot
        refresh without the user; the reason is left in :meth:`get_last_error`.
        """
        provider = self._get_or_create_provider(provider_id)
        if provider is None:
            self._set_last_error(provider_id, f"Unknown provider: {provider_id}")
            return None

        token_set = self._storage.load(provider_id)
        if token_set is None:
            self._set_last_error(provider_id, "Authentication required")
            return None

        result = await provider.refresh(token_set)
        if not (result.success and result.tokens):
            error = result.error or "Token refresh failed"
            self._set_last_error(provider_id, error)
            return None

        self._storage.save(provider_id, result.tokens)
        self._stage_provider_tokens(provider_id, result.tokens)
        self._set_last_error(provider_id, None)
        return result.tokens.access_token

    def peek_status(self, provider_id: str) -> AuthStatus:
        """Classify the stored credentials for ``provider_id`` without a loop.

        The synchronous mirror of :meth:`check_status`. Every provider decides
        status from the token set alone, so this is a file read and a handful of
        comparisons — cheap enough to call at LLM-construction time, and safe to
        call from a Qt worker or any other thread that holds no event loop.
        """
        provider = self._get_or_create_provider(provider_id)
        if provider is None:
            return AuthStatus.UNAUTHENTICATED

        token_set = self._storage.load(provider_id)
        if token_set is None:
            return AuthStatus.UNAUTHENTICATED

        return provider.status(token_set)

    async def check_status(self, provider_id: str) -> AuthStatus:
        return self.peek_status(provider_id)

    async def authenticate(
        self,
        provider_id: str,
        *,
        on_prompt: DeviceCodeCallback | None = None,
        cancel_event: threading.Event | None = None,
    ) -> AuthResult:
        """Explicitly initiate authentication for a provider."""
        provider = self._get_or_create_provider(provider_id)
        if provider is None:
            return AuthResult(success=False, error=f"Unknown provider: {provider_id}")

        result = await provider.authenticate(on_prompt=on_prompt, cancel_event=cancel_event)
        if result.success and result.tokens:
            self._storage.save(provider_id, result.tokens)
            self._stage_provider_tokens(provider_id, result.tokens)
            self._set_last_error(provider_id, None)
        else:
            self._set_last_error(provider_id, result.error or "Authentication failed")

        return result

    def logout(self, provider_id: str) -> None:
        self._storage.delete(provider_id)
        if provider_id == "codex":
            try:
                from rotaris_core.auth.codex_bridge import delete_openhands_oauth_credentials

                delete_openhands_oauth_credentials()
            except Exception as exc:  # noqa: BLE001 — best-effort bridge
                _log.warning(
                    "Failed to clear staged Codex OpenHands credentials: %s",
                    exc,
                )
        self._providers.pop(provider_id, None)
        self._last_errors.pop(provider_id, None)

    def is_authenticated(self, provider_id: str) -> bool:
        return self._storage.has_tokens(provider_id)

    def get_stored_tokens(self, provider_id: str) -> TokenSet | None:
        return self._storage.load(provider_id)

    def get_last_error(self, provider_id: str) -> str | None:
        return self._last_errors.get(provider_id)
