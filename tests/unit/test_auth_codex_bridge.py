from __future__ import annotations

import time

from openhands.sdk.llm.auth.credentials import CredentialStore

from rotaris_core.auth.codex_bridge import (
    build_openhands_oauth_credentials,
    delete_openhands_oauth_credentials,
    stage_openhands_oauth_credentials,
)
from rotaris_core.auth.provider import TokenSet
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_702)
def test_build_openhands_oauth_credentials_converts_expiry_to_milliseconds() -> None:
    token_set = TokenSet(
        access_token="access-token",
        refresh_token="refresh-token",
        expires_at=1_700_000_000.25,
    )

    creds = build_openhands_oauth_credentials(token_set)

    assert creds.vendor == "openai"
    assert creds.access_token == "access-token"
    assert creds.refresh_token == "refresh-token"
    assert creds.expires_at == 1_700_000_000_250


@verifies(SWR.SWR_702)
def test_stage_and_delete_openhands_oauth_credentials_round_trip(tmp_path) -> None:
    token_set = TokenSet(
        access_token="access-token",
        refresh_token="refresh-token",
        expires_at=time.time() + 3600,
    )

    stage_openhands_oauth_credentials(token_set, credentials_dir=tmp_path)
    stored = CredentialStore(credentials_dir=tmp_path).get("openai")

    assert stored is not None
    assert stored.access_token == "access-token"
    assert stored.refresh_token == "refresh-token"
    assert delete_openhands_oauth_credentials(credentials_dir=tmp_path) is True
    assert CredentialStore(credentials_dir=tmp_path).get("openai") is None
