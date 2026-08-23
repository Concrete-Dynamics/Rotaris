"""Secure token storage with platform-appropriate access control (SWR-3719).

The security model is stated as a property, not as a Unix mode string:
credentials live below the platform-specific per-user Rotaris data directory
(``platformdirs``, never the workspace), and on POSIX the token directory and
files are restricted to the current user (``0700``/``0600``). On Windows the
directory sits inside the current user's profile and inherits its ACLs — POSIX
mode bits are not a Windows security mechanism, so Rotaris applies no
``chmod`` there and makes no ``0600`` claim for Windows.
"""

from __future__ import annotations

import json
import logging
import os
import stat
import tempfile
from contextlib import suppress
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.auth.provider import TokenSet

_log = logging.getLogger(__name__)
_TOKEN_DIR_NAME = "tokens"


@traces(SWR.SWR_3719)
def _restrict_token_dir(path: Path) -> None:
    """Restrict a credential directory to the current user.

    POSIX: mode ``0700``. Windows: a no-op by design — the directory lives in
    the current user's profile and inherits its ACLs; claiming POSIX mode bits
    as a Windows guarantee would be a false promise.
    """
    if os.name == "nt":
        return
    path.chmod(stat.S_IRWXU)


@traces(SWR.SWR_3719)
def _restrict_token_file(path: Path) -> None:
    """Restrict one credential file to the current user.

    POSIX: mode ``0600``. Windows: a no-op by design (see
    :func:`_restrict_token_dir`).
    """
    if os.name == "nt":
        return
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def _get_default_token_dir() -> Path:
    # GLOBAL_DATA_DIR adopts a pre-rename `geraet-ai` data dir, so tokens
    # minted before the Rotaris rename stay usable.
    from rotaris_core.config.paths import GLOBAL_DATA_DIR

    token_dir = GLOBAL_DATA_DIR / _TOKEN_DIR_NAME
    token_dir.mkdir(parents=True, exist_ok=True)
    _restrict_token_dir(token_dir)
    return token_dir


@traces(SWR.SWR_719, SWR.SWR_723, SWR.SWR_765, SWR.SWR_770, SWR.SWR_3719)
class TokenStorage:
    """File-based token storage below the platform-specific user data directory.

    On POSIX the directory and files are restricted to the current user (0700/
    0600); on Windows protection comes from the user profile's inherited ACLs.
    """

    def __init__(self, *, token_dir: Path | None = None) -> None:
        self._token_dir = token_dir or _get_default_token_dir()
        self._token_dir.mkdir(parents=True, exist_ok=True)
        _restrict_token_dir(self._token_dir)

    def _path_for(self, provider_id: str) -> Path:
        return self._token_dir / f"{provider_id}.json"

    def load(self, provider_id: str) -> TokenSet | None:
        from rotaris_core.auth.provider import TokenSet

        path = self._path_for(provider_id)
        if not path.exists():
            return None

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return TokenSet(
                access_token=data["access_token"],
                refresh_token=data["refresh_token"],
                expires_at=data.get("expires_at", 0.0),
                account_id=data.get("account_id"),
                extra=data.get("extra", {}),
            )
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            _log.warning("Failed to load tokens for %s: %s", provider_id, exc)
            return None

    def save(self, provider_id: str, tokens: TokenSet) -> None:
        """Atomic write via mkstemp + os.replace."""
        data = {
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
            "expires_at": tokens.expires_at,
            "account_id": tokens.account_id,
            "extra": tokens.extra,
        }
        content = json.dumps(data, indent=2)

        fd, tmp_path = tempfile.mkstemp(
            dir=str(self._token_dir),
            suffix=".tmp",
            prefix=f"{provider_id}_",
        )
        try:
            os.write(fd, content.encode("utf-8"))
            os.close(fd)
            _restrict_token_file(Path(tmp_path))
            os.replace(tmp_path, str(self._path_for(provider_id)))
        except BaseException:
            with suppress(OSError):
                os.close(fd)
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

    def delete(self, provider_id: str) -> None:
        path = self._path_for(provider_id)
        if path.exists():
            path.unlink()
            _log.info("Deleted stored tokens for %s", provider_id)

    def has_tokens(self, provider_id: str) -> bool:
        return self._path_for(provider_id).exists()

    def list_provider_ids(self) -> tuple[str, ...]:
        return tuple(sorted(path.stem for path in self._token_dir.glob("*.json") if path.is_file()))
