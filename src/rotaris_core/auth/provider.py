"""Authentication provider protocol and data types."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import threading


class AuthFlowType(Enum):
    DEVICE_CODE = "device_code"
    PKCE = "pkce"
    API_KEY = "api_key"


class AuthStatus(Enum):
    AUTHENTICATED = "authenticated"
    UNAUTHENTICATED = "unauthenticated"
    EXPIRED = "expired"
    REFRESHING = "refreshing"


@dataclass(frozen=True)
class DeviceCodePrompt:
    """User-facing device flow prompt data."""

    verification_uri: str
    user_code: str
    interval: int
    expires_in: int


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str
    expires_at: float = 0.0
    """Unix timestamp when access token expires. 0 = no expiry (e.g. Copilot)."""
    account_id: str | None = None
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        if self.expires_at == 0.0:
            return False
        return time.time() >= self.expires_at


@dataclass(frozen=True)
class AuthResult:
    success: bool
    tokens: TokenSet | None = None
    error: str | None = None


@traces(SWR.SWR_720)
@traces(SWR.SWR_3711)
@runtime_checkable
class AuthProvider(Protocol):
    """Protocol for OAuth authentication providers.

    Providers are stateless — token persistence is handled by AuthManager.
    """

    @property
    def provider_id(self) -> str: ...

    @property
    def flow_type(self) -> AuthFlowType: ...

    async def authenticate(
        self,
        on_prompt: DeviceCodeCallback | None = None,
        cancel_event: threading.Event | None = None,
    ) -> AuthResult:
        """Initiate the full authentication flow.

        Device flow: requests device code, prompts user, polls until authorized.
        PKCE flow: starts local callback server, opens browser, exchanges code for tokens.
        ``cancel_event``, when set mid-flow, aborts an in-progress wait/poll loop early
        with an unsuccessful ``AuthResult`` instead of running to its full timeout.
        """
        ...

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        """Refresh expired access token. Returns original tokens if refresh unsupported."""
        ...

    def status(self, token_set: TokenSet) -> AuthStatus:
        """Classify stored tokens without I/O.

        Deciding whether a stored token is usable is a local judgement — an
        expiry compared against the clock, a token shape checked against what
        the provider issues. No implementation reaches the network for it, so
        callers holding no event loop must not have to invent one; that is what
        this method is for. :meth:`check_status` is its awaitable face and
        delegates here.
        """
        ...

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        """Check whether stored tokens are still valid."""
        ...


class DeviceCodeCallback(Protocol):
    """Callback to display auth prompts (device code or URL) to the user."""

    async def __call__(self, prompt: DeviceCodePrompt | str) -> None: ...
