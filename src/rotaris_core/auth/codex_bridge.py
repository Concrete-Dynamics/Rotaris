"""Bridge Rotaris Codex tokens into OpenHands subscription credentials."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from openhands.sdk.llm.auth.credentials import OAuthCredentials

    from rotaris_core.auth.provider import TokenSet

_OPENHANDS_VENDOR = "openai"


def _expires_at_ms(token_set: TokenSet) -> int:
    if token_set.expires_at <= 0:
        return 0
    return max(0, int(token_set.expires_at * 1000))


@traces(SWR.SWR_702)
def build_openhands_oauth_credentials(token_set: TokenSet) -> OAuthCredentials:
    from openhands.sdk.llm.auth.credentials import OAuthCredentials

    return OAuthCredentials(
        vendor=_OPENHANDS_VENDOR,
        access_token=token_set.access_token,
        refresh_token=token_set.refresh_token,
        expires_at=_expires_at_ms(token_set),
    )


def stage_openhands_oauth_credentials(
    token_set: TokenSet,
    *,
    credentials_dir: Path | None = None,
) -> None:
    from openhands.sdk.llm.auth.credentials import CredentialStore

    store = CredentialStore(credentials_dir=credentials_dir)
    store.save(build_openhands_oauth_credentials(token_set))


def delete_openhands_oauth_credentials(*, credentials_dir: Path | None = None) -> bool:
    from openhands.sdk.llm.auth.credentials import CredentialStore

    store = CredentialStore(credentials_dir=credentials_dir)
    return store.delete(_OPENHANDS_VENDOR)
