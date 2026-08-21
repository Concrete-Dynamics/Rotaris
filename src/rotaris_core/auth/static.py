from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.auth.provider import AuthFlowType, AuthProvider, AuthResult, AuthStatus, TokenSet
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import threading


@traces(SWR.SWR_769)
class StaticAPIKeyAuthProvider(AuthProvider):
    """Auth-provider shim for instance-backed API key credentials."""

    def __init__(self, provider_id: str) -> None:
        self._provider_id = provider_id

    @property
    def provider_id(self) -> str:
        return self._provider_id

    @property
    def flow_type(self) -> AuthFlowType:
        return AuthFlowType.API_KEY

    async def authenticate(
        self,
        on_prompt: object | None = None,
        cancel_event: threading.Event | None = None,
    ) -> AuthResult:
        del on_prompt, cancel_event
        return AuthResult(
            success=False,
            error=(
                "This provider uses a stored API key. Run 'rotaris-cli login openai-compatible' "
                "to create or update it."
            ),
        )

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        return AuthResult(success=bool(token_set.access_token), tokens=token_set)

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        return AuthStatus.AUTHENTICATED if token_set.access_token else AuthStatus.UNAUTHENTICATED
