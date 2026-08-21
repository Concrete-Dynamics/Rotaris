"""Unit tests for the LiteLLM ↔ Rotaris Copilot token bridge.

Covers:

* Directory derivation (workspace-scoped, under ``.rotaris/litellm_cache``).
* :func:`stage_copilot_tokens` D4 field mapping (refresh → access-token file;
  access + expires_at + endpoints.api → api-key.json).
* Atomic write semantics (no torn reads, no leftover ``*.tmp`` siblings).
* :func:`ensure_litellm_env` env-var setup, including the sentinel that
  short-circuits LiteLLM's own device-flow refresher.
* Error path: empty ``access_token`` raises ``ValueError`` before any file
  is touched.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.auth.copilot_bridge import (
    ensure_litellm_env,
    litellm_copilot_token_dir,
    stage_copilot_tokens,
)
from rotaris_core.auth.provider import TokenSet
from rotaris_core.reqtocode import SWR, verifies


def _make_tokens(
    *,
    access_token: str = "tid=session-bearer",
    refresh_token: str = "ghu_long_lived_refresh",
    expires_at: float = 1_700_000_000.0,
    extra: dict[str, str] | None = None,
) -> TokenSet:
    return TokenSet(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
        extra=extra or {},
    )


@verifies(SWR.SWR_701)
def test_litellm_copilot_token_dir_is_workspace_scoped(tmp_path: Path) -> None:
    workspace = tmp_path / "ws"
    token_dir = litellm_copilot_token_dir(workspace)

    assert token_dir == workspace / ".rotaris" / "litellm_cache"
    # Pure function — must not create the directory as a side effect.
    assert not token_dir.exists()


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_writes_d4_field_mapping(tmp_path: Path) -> None:
    token_dir = tmp_path / "cache"
    tokens = _make_tokens(
        access_token="tid=session-abc",
        refresh_token="ghu_refresh_xyz",
        expires_at=1_800_000_000.0,
        extra={"api_base": "https://api.business.githubcopilot.com"},
    )

    stage_copilot_tokens(tokens, token_dir=token_dir)

    # access-token file holds the long-lived ghu_ refresh token.
    access_token_file = token_dir / "access-token"
    assert access_token_file.read_text(encoding="utf-8") == "ghu_refresh_xyz"

    # api-key.json holds the short-lived session bearer + endpoints + expiry.
    payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert payload["token"] == "tid=session-abc"
    assert payload["expires_at"] == 1_800_000_000
    assert payload["endpoints"] == {"api": "https://api.business.githubcopilot.com"}


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_uses_default_api_base_when_none_provided(
    tmp_path: Path,
) -> None:
    token_dir = tmp_path / "cache"
    tokens = _make_tokens(extra={})  # no api_base in extras

    stage_copilot_tokens(tokens, token_dir=token_dir)

    payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert payload["endpoints"]["api"] == "https://api.githubcopilot.com"


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_explicit_api_base_arg_wins(tmp_path: Path) -> None:
    token_dir = tmp_path / "cache"
    tokens = _make_tokens(extra={"api_base": "https://from-extras.example"})

    stage_copilot_tokens(
        tokens,
        token_dir=token_dir,
        api_base="https://from-arg.example",
    )

    payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert payload["endpoints"]["api"] == "https://from-arg.example"


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_falls_back_to_access_token_when_no_refresh(
    tmp_path: Path,
) -> None:
    """If the auth provider did not yield a refresh token (legacy / Codex-style flows),
    the access-token file still gets a non-empty value so LiteLLM does not
    interpret it as 'unauthenticated' and trigger device flow.
    """
    token_dir = tmp_path / "cache"
    tokens = _make_tokens(access_token="tid=only-bearer", refresh_token="")

    stage_copilot_tokens(tokens, token_dir=token_dir)

    assert (token_dir / "access-token").read_text(encoding="utf-8") == "tid=only-bearer"


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_rejects_empty_access_token(tmp_path: Path) -> None:
    token_dir = tmp_path / "cache"
    tokens = _make_tokens(access_token="", refresh_token="ghu_only")

    with pytest.raises(ValueError, match="access_token is empty"):
        stage_copilot_tokens(tokens, token_dir=token_dir)

    # Nothing should have been written on the error path.
    assert not (token_dir / "access-token").exists()
    assert not (token_dir / "api-key.json").exists()


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_writes_are_atomic_no_leftover_tmp_files(
    tmp_path: Path,
) -> None:
    token_dir = tmp_path / "cache"
    tokens = _make_tokens()

    stage_copilot_tokens(tokens, token_dir=token_dir)

    # Atomic-write helper uses mkstemp(..., suffix=".tmp"); on success the temp
    # file must have been renamed away.
    leftovers = list(token_dir.glob("*.tmp"))
    assert leftovers == [], f"unexpected temp files left behind: {leftovers}"


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_overwrites_previous_payload_atomically(
    tmp_path: Path,
) -> None:
    token_dir = tmp_path / "cache"
    stage_copilot_tokens(
        _make_tokens(access_token="tid=v1", refresh_token="ghu_v1"),
        token_dir=token_dir,
    )
    stage_copilot_tokens(
        _make_tokens(access_token="tid=v2", refresh_token="ghu_v2"),
        token_dir=token_dir,
    )

    assert (token_dir / "access-token").read_text(encoding="utf-8") == "ghu_v2"
    payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert payload["token"] == "tid=v2"


@verifies(SWR.SWR_701)
def test_stage_copilot_tokens_records_sku_when_present(tmp_path: Path) -> None:
    token_dir = tmp_path / "cache"
    tokens = _make_tokens(extra={"sku": "copilot_business_seat"})

    stage_copilot_tokens(tokens, token_dir=token_dir)

    payload = json.loads((token_dir / "api-key.json").read_text(encoding="utf-8"))
    assert payload["sku"] == "copilot_business_seat"


@verifies(SWR.SWR_701)
def test_ensure_litellm_env_sets_token_dir_and_sentinel_access_token(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    # Start from a clean slate for both env vars.
    monkeypatch.delenv("GITHUB_COPILOT_TOKEN_DIR", raising=False)
    monkeypatch.delenv("GITHUB_COPILOT_ACCESS_TOKEN", raising=False)

    token_dir = tmp_path / "cache"
    ensure_litellm_env(token_dir)

    import os

    assert os.environ["GITHUB_COPILOT_TOKEN_DIR"] == str(token_dir)
    # Sentinel value disables LiteLLM's internal device-flow refresher.
    assert os.environ["GITHUB_COPILOT_ACCESS_TOKEN"] == "managed-by-rotaris"
    # Directory must exist after the call so LiteLLM's authenticator can stat it.
    assert token_dir.exists()


@verifies(SWR.SWR_701)
def test_ensure_litellm_env_does_not_clobber_user_provided_access_token(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    """If the user (or a previous Rotaris run) already exported
    ``GITHUB_COPILOT_ACCESS_TOKEN``, we leave it alone — ``setdefault`` is the
    correct semantic, since clobbering an explicit user value would be a
    surprising side effect of constructing an LLM.
    """
    monkeypatch.setenv("GITHUB_COPILOT_ACCESS_TOKEN", "user-set-value")

    ensure_litellm_env(tmp_path / "cache")

    import os

    assert os.environ["GITHUB_COPILOT_ACCESS_TOKEN"] == "user-set-value"
