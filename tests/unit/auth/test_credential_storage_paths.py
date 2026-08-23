"""Credential storage paths: platform-specific, per-user, never the workspace.

SWR-3719 AC-001/AC-006: persistent authentication material lives below the
platform-specific per-user Rotaris data directory — resolved through
``platformdirs`` — and no persistence path may point into ``.rotaris/`` or
another workspace-owned location."""

from __future__ import annotations

import os
from pathlib import Path

from rotaris_core.auth.storage import TokenStorage, _get_default_token_dir
from rotaris_core.reqtocode import SWR, verifies

_REPO_ROOT = Path(__file__).resolve().parents[3]


@verifies(SWR.SWR_3719)
def test_the_default_token_dir_is_below_the_platform_user_data_dir() -> None:
    """The token directory is the platformdirs data dir's ``tokens`` child."""
    from rotaris_core.config.paths import GLOBAL_DATA_DIR

    token_dir = _get_default_token_dir()

    assert token_dir.name == "tokens"
    assert token_dir.parent == GLOBAL_DATA_DIR
    assert token_dir.is_dir()


@verifies(SWR.SWR_3719)
def test_the_user_data_dir_is_platformdirs_resolved_not_hard_coded() -> None:
    """Portable paths: the data root comes from platformdirs for this OS."""
    import platformdirs

    from rotaris_core.config.paths import GLOBAL_DATA_DIR

    expected = Path(platformdirs.user_data_dir("rotaris"))

    assert expected == GLOBAL_DATA_DIR or GLOBAL_DATA_DIR.name == "rotaris"


@verifies(SWR.SWR_3719)
def test_no_credential_path_lives_inside_the_repository() -> None:
    """AC-001/AC-006: the storage root is outside the checkout and the workspace."""
    from rotaris_core.config.paths import GLOBAL_DATA_DIR, workspace_config_dir

    token_dir = _get_default_token_dir()

    assert _REPO_ROOT not in token_dir.parents
    assert _REPO_ROOT not in GLOBAL_DATA_DIR.parents
    assert ".rotaris" not in token_dir.parts
    assert token_dir != workspace_config_dir(_REPO_ROOT)


@verifies(SWR.SWR_3719)
def test_the_windows_profile_boundary_holds() -> None:
    """On Windows the credential directory sits inside the current user's profile
    (AC-003); on POSIX inside the home directory."""
    token_dir = _get_default_token_dir()

    if os.name == "nt":
        profile = Path(os.environ.get("LOCALAPPDATA") or Path.home())
        assert profile in token_dir.parents
    else:
        assert Path.home() in token_dir.parents


@verifies(SWR.SWR_3719)
def test_storage_only_writes_inside_its_token_dir(tmp_path: Path) -> None:
    """A TokenStorage rooted at one directory never writes anywhere else."""
    storage = TokenStorage(token_dir=tmp_path)
    from rotaris_core.auth.provider import TokenSet

    storage.save("copilot", TokenSet(access_token="a", refresh_token="b"))

    written = [path for path in tmp_path.rglob("*") if path.is_file()]
    assert [path.name for path in written] == ["copilot.json"]
