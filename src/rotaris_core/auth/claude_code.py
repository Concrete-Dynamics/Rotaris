from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.auth.provider import AuthFlowType, AuthProvider, AuthResult, AuthStatus, TokenSet
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import threading


@traces(SWR.SWR_777)
class ClaudeCodeAuthProvider(AuthProvider):
    """Auth provider for Claude Code subscription setup tokens.

    ``claude setup-token`` is an interactive, one-time browser mint that
    Rotaris cannot drive itself, so this provider never authenticates on
    its own — registration instructs the user to run the command and paste
    the resulting subscription token.
    """

    @property
    def provider_id(self) -> str:
        return "claude-code"

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
                "This provider uses a stored subscription token. Run "
                "'claude setup-token' to mint one, then "
                "'rotaris-cli login claude-code' to paste it."
            ),
        )

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        return AuthResult(success=bool(token_set.access_token), tokens=token_set)

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        from rotaris_core.providers.claude_code import subscription_token_validation_error

        if not token_set.access_token:
            return AuthStatus.UNAUTHENTICATED
        if subscription_token_validation_error(token_set.access_token) is not None:
            return AuthStatus.UNAUTHENTICATED
        return AuthStatus.AUTHENTICATED
