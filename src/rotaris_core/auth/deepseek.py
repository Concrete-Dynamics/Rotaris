from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.auth.provider import AuthFlowType, AuthProvider, AuthResult, AuthStatus, TokenSet
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import threading


@traces(SWR.SWR_750, SWR.SWR_755)
class DeepSeekAuthProvider(AuthProvider):
    """Auth provider for DeepSeek API key credentials."""

    @property
    def provider_id(self) -> str:
        return "deepseek"

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
                "This provider uses a stored API key. "
                "Run 'rotaris-cli login deepseek' to create or update it."
            ),
        )

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        return AuthResult(success=bool(token_set.access_token), tokens=token_set)

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        return AuthStatus.AUTHENTICATED if token_set.access_token else AuthStatus.UNAUTHENTICATED
