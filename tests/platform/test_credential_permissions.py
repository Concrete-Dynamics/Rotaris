"""Platform CI: credential permission guarantees on native runners.

SWR-3719 AC-002/AC-003. POSIX modes are asserted on POSIX runners; the Windows
boundary is asserted on Windows runners — the profile path plus the guarantee
that Rotaris makes no POSIX-mode claim there. One test per platform, each
skipped on the other, so a native matrix exercises exactly the assertion that
matches the operating system."""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest

from rotaris_core.auth.provider import TokenSet
from rotaris_core.auth.storage import TokenStorage, _get_default_token_dir
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_3719)
@pytest.mark.skipif(os.name == "nt", reason="POSIX owner bits are asserted on POSIX runners")
def test_posix_directory_and_files_are_owner_only(tmp_path: Path) -> None:
    """AC-002: newly created credential directories and files are restricted to
    the current user — 0700 for the directory, 0600 for every file."""
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("copilot", TokenSet(access_token="a", refresh_token="b"))

    assert stat.S_IMODE(os.stat(tmp_path).st_mode) == stat.S_IRWXU  # 0700
    assert stat.S_IMODE(os.stat(tmp_path / "copilot.json").st_mode) == (
        stat.S_IRUSR | stat.S_IWUSR
    )  # 0600


@verifies(SWR.SWR_3719)
@pytest.mark.skipif(os.name != "nt", reason="the profile boundary exists only on Windows")
def test_windows_storage_stays_in_the_profile_and_never_claims_posix_modes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """AC-003: on Windows the credential directory is inside the current user's
    profile, and Rotaris does not rely on a POSIX 0600 assertion — ``chmod`` is
    never invoked as the security mechanism."""

    def fail_if_called(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("Windows credential storage must not call chmod")

    monkeypatch.setattr(os, "chmod", fail_if_called)

    token_dir = _get_default_token_dir()
    profile = Path(os.environ.get("LOCALAPPDATA") or Path.home())
    assert profile in token_dir.parents

    storage = TokenStorage(token_dir=tmp_path)
    storage.save("copilot", TokenSet(access_token="a", refresh_token="b"))

    assert storage.load("copilot") is not None
    assert storage.has_tokens("copilot")
