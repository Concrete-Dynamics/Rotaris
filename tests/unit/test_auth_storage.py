from __future__ import annotations

import json
import os
import stat

import pytest

from rotaris_core.auth.provider import TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_719)
def test_save_and_load_round_trip(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    tokens = TokenSet(
        access_token="acc_123",
        refresh_token="ref_456",
        expires_at=1700000000.0,
        account_id="acct-001",
        extra={"org": "test-org"},
    )

    storage.save("copilot", tokens)
    loaded = storage.load("copilot")

    assert loaded is not None
    assert loaded.access_token == "acc_123"
    assert loaded.refresh_token == "ref_456"
    assert loaded.expires_at == 1700000000.0
    assert loaded.account_id == "acct-001"
    assert loaded.extra == {"org": "test-org"}


@verifies(SWR.SWR_719)
def test_load_nonexistent_returns_none(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    assert storage.load("nonexistent") is None


@verifies(SWR.SWR_719)
def test_delete_removes_file(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    tokens = TokenSet(access_token="x", refresh_token="y")

    storage.save("copilot", tokens)
    assert storage.has_tokens("copilot")

    storage.delete("copilot")
    assert not storage.has_tokens("copilot")
    assert storage.load("copilot") is None


@verifies(SWR.SWR_719)
def test_delete_nonexistent_is_noop(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.delete("ghost")


@verifies(SWR.SWR_719)
def test_has_tokens(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    assert not storage.has_tokens("copilot")

    storage.save("copilot", TokenSet(access_token="a", refresh_token="b"))
    assert storage.has_tokens("copilot")


@verifies(SWR.SWR_719)
@pytest.mark.skipif(os.name == "nt", reason="Windows does not preserve POSIX owner bits")
def test_file_permissions_are_owner_only(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("copilot", TokenSet(access_token="a", refresh_token="b"))

    path = tmp_path / "copilot.json"
    mode = stat.S_IMODE(os.stat(path).st_mode)
    assert mode == (stat.S_IRUSR | stat.S_IWUSR)


@verifies(SWR.SWR_719)
def test_save_overwrites_existing(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("copilot", TokenSet(access_token="old", refresh_token="old_r"))
    storage.save("copilot", TokenSet(access_token="new", refresh_token="new_r"))

    loaded = storage.load("copilot")
    assert loaded is not None
    assert loaded.access_token == "new"
    assert loaded.refresh_token == "new_r"


@verifies(SWR.SWR_719)
def test_load_corrupt_json_returns_none(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    path = tmp_path / "corrupt.json"
    path.write_text("not valid json", encoding="utf-8")

    assert storage.load("corrupt") is None


@verifies(SWR.SWR_719)
def test_load_missing_required_fields_returns_none(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    path = tmp_path / "incomplete.json"
    path.write_text(json.dumps({"access_token": "x"}), encoding="utf-8")

    assert storage.load("incomplete") is None


@verifies(SWR.SWR_719)
def test_multiple_providers_isolated(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("copilot", TokenSet(access_token="cop", refresh_token="cop_r"))
    storage.save("codex", TokenSet(access_token="cdx", refresh_token="cdx_r"))

    cop = storage.load("copilot")
    cdx = storage.load("codex")
    assert cop is not None and cop.access_token == "cop"
    assert cdx is not None and cdx.access_token == "cdx"

    storage.delete("copilot")
    assert not storage.has_tokens("copilot")
    assert storage.has_tokens("codex")


@verifies(SWR.SWR_719)
def test_list_provider_ids_returns_saved_provider_ids(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)

    storage.save("codex", TokenSet(access_token="cdx", refresh_token="cdx_r"))
    storage.save("copilot", TokenSet(access_token="cop", refresh_token="cop_r"))

    assert storage.list_provider_ids() == ("codex", "copilot")
