"""Credential lifecycle: save, reload, logout — one protected store across launches.

SWR-3719 AC-005: provider-scoped logout removes the Rotaris-managed persistent
credential, and the next launch — a fresh TokenStorage over the same directory —
classifies the provider as unauthenticated."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.auth.logout import logout_provider
from rotaris_core.auth.provider import TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_3719)
def test_save_reload_and_logout_operate_on_the_same_store(tmp_path: Path) -> None:
    """A credential saved by one instance reloads from a fresh instance — the
    next-launch view — and logout removes it for good."""
    first_launch = TokenStorage(token_dir=tmp_path)
    first_launch.save(
        "copilot",
        TokenSet(
            access_token="acc_live",
            refresh_token="ref_live",
            expires_at=1900000000.0,
            account_id="acct-live",
        ),
    )

    next_launch = TokenStorage(token_dir=tmp_path)
    loaded = next_launch.load("copilot")
    assert loaded is not None
    assert loaded.access_token == "acc_live"
    assert loaded.refresh_token == "ref_live"
    assert next_launch.has_tokens("copilot")

    result = logout_provider("copilot", storage=next_launch, snapshot_base=tmp_path)
    assert result.kind == "signed_out"

    third_launch = TokenStorage(token_dir=tmp_path)
    assert not third_launch.has_tokens("copilot")
    assert third_launch.load("copilot") is None
    assert third_launch.list_provider_ids() == ()


@verifies(SWR.SWR_3719)
def test_logout_is_scoped_to_the_selected_provider(tmp_path: Path) -> None:
    """Logging one provider out leaves a second provider's credential alone."""
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("copilot", TokenSet(access_token="cop", refresh_token="cop_r"))
    storage.save("deepseek", TokenSet(access_token="ds", refresh_token="ds_r"))

    logout_provider("copilot", storage=storage, snapshot_base=tmp_path)

    assert not storage.has_tokens("copilot")
    assert storage.has_tokens("deepseek")
    assert storage.load("deepseek") is not None
