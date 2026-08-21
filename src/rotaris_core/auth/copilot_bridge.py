"""Bridge Rotaris-managed Copilot tokens into LiteLLM's on-disk token cache.

LiteLLM ships its own GitHub Copilot ``Authenticator`` (under
``litellm.llms.github_copilot.authenticator``)
that reads two files from a configurable token directory on every request:

* ``access-token`` — long-lived ``ghu_…`` GitHub App user token.
* ``api-key.json`` — short-lived session bearer plus tenant ``endpoints.api``.

Rotaris still owns the device flow + session-token exchange (see
:mod:`rotaris_core.auth.copilot`). This module is the bridge that materialises the
Rotaris ``TokenSet`` into the two files LiteLLM expects, with atomic writes so a
concurrent LiteLLM read never observes a torn file (R11 in the LiteLLM
integration plan).

The contract is intentionally narrow:

* :func:`litellm_copilot_token_dir` derives the workspace-scoped directory.
* :func:`stage_copilot_tokens` writes both files atomically.
* :func:`ensure_litellm_env` sets the env-vars LiteLLM consults
  (``GITHUB_COPILOT_TOKEN_DIR`` and an opt-out for LiteLLM's own access-token
  refresh, since Rotaris's :class:`AuthManager` already does that).
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.auth.provider import TokenSet

_log = logging.getLogger(__name__)

# Default LiteLLM Copilot api_base — used when the Rotaris ``TokenSet`` has no
# ``extra["api_base"]`` recorded (Free/Pro accounts).
_DEFAULT_API_BASE = "https://api.githubcopilot.com"

# Subdirectory within ``<workspace>/.rotaris/`` that hosts the bridged files.
# Mirrored in .gitignore (R10).
_LITELLM_CACHE_DIRNAME = "litellm_cache"


def litellm_copilot_token_dir(workspace_root: Path) -> Path:
    """Return the workspace-scoped directory used as LiteLLM's token cache."""
    return Path(workspace_root) / ".rotaris" / _LITELLM_CACHE_DIRNAME


def _atomic_write_text(path: Path, content: str) -> None:
    """Write ``content`` to ``path`` atomically via ``mkstemp + os.replace``.

    LiteLLM's authenticator reads these files without holding any lock; a
    non-atomic write would leave a window in which a reader sees a truncated
    or partially-written file. ``os.replace`` is atomic on both POSIX and
    Windows for same-filesystem replacements, so as long as the temp file lives
    in the destination directory the swap is observable as a single transition.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        # Best-effort cleanup; suppress secondary errors so we surface the
        # original write failure.
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise


@traces(SWR.SWR_701)
def stage_copilot_tokens(
    tokens: TokenSet,
    *,
    token_dir: Path,
    api_base: str | None = None,
) -> None:
    """Materialise ``tokens`` into LiteLLM's two-file format under ``token_dir``.

    Mapping (plan v4.1.1 D4):

    * ``tokens.refresh_token`` (``ghu_…``) → ``<dir>/access-token``
    * ``tokens.access_token`` (session bearer) → ``<dir>/api-key.json["token"]``
    * ``tokens.expires_at`` → ``<dir>/api-key.json["expires_at"]``
    * ``tokens.extra["api_base"]`` (or ``api_base`` arg, or default) →
      ``<dir>/api-key.json["endpoints"]["api"]``

    The session bearer is the value LiteLLM uses as ``Authorization: Bearer``;
    the GitHub App token only matters if LiteLLM's own refresher fires, which
    Rotaris disables via :func:`ensure_litellm_env` so the two stores cannot
    diverge.

    Both files are written atomically. Callers must invoke this whenever
    :class:`~rotaris_core.auth.manager.AuthManager` persists a fresh Copilot
    ``TokenSet`` so on-disk state matches in-memory state.
    """
    if not tokens.access_token:
        raise ValueError("Cannot stage Copilot tokens: access_token is empty")

    token_dir.mkdir(parents=True, exist_ok=True)

    resolved_api_base = api_base or tokens.extra.get("api_base") or _DEFAULT_API_BASE

    # access-token file holds the GitHub App user token. LiteLLM treats an
    # empty/missing file as "not authenticated"; if we have no refresh_token we
    # still write the bearer there as a fallback so LiteLLM does not attempt
    # its own device flow.
    refresh = tokens.refresh_token or tokens.access_token
    _atomic_write_text(token_dir / "access-token", refresh)

    api_key_payload = {
        "token": tokens.access_token,
        "expires_at": int(tokens.expires_at),
        "endpoints": {"api": resolved_api_base},
    }
    sku = tokens.extra.get("sku")
    if sku:
        api_key_payload["sku"] = sku
    _atomic_write_text(
        token_dir / "api-key.json",
        json.dumps(api_key_payload, separators=(",", ":")),
    )

    _log.debug(
        "Staged Copilot tokens for LiteLLM at %s (api_base=%s, expires_at=%s)",
        token_dir,
        resolved_api_base,
        api_key_payload["expires_at"],
    )


def ensure_litellm_env(token_dir: Path) -> None:
    """Point LiteLLM at our token directory and disable its internal refresher.

    Sets two environment variables, both read by LiteLLM's
    ``GithubCopilotAuthenticator`` at construction time:

    * ``GITHUB_COPILOT_TOKEN_DIR`` — directory containing ``access-token`` and
      ``api-key.json``. We pin this per workspace so concurrent Rotaris
      instances in different workspaces never share staged credentials.
    * ``GITHUB_COPILOT_ACCESS_TOKEN`` — pre-set to a sentinel so LiteLLM's
      internal device-flow path is never triggered. Rotaris owns the device
      flow; LiteLLM should only read the staged files.

    Called from the loader before constructing any Copilot-routed
    :class:`~openhands.sdk.LLM`.
    """
    token_dir.mkdir(parents=True, exist_ok=True)
    os.environ["GITHUB_COPILOT_TOKEN_DIR"] = str(token_dir)
    # The presence of this env-var causes LiteLLM's authenticator to skip its
    # own device-flow; the actual session bearer is still resolved from
    # api-key.json on each request.
    os.environ.setdefault("GITHUB_COPILOT_ACCESS_TOKEN", "managed-by-rotaris")
