"""Keeping an installed Rotaris current (SWR-3003).

:mod:`~rotaris_core.updates.check` answers whether a newer release exists and
which of its files this particular installation could use;
:mod:`~rotaris_core.updates.apply` downloads that file, proves it is intact, and
installs it by the one strategy the installation flavour permits.

Deliberately *not* part of :mod:`rotaris_core.packaging`, which stays stdlib-only
so SWR-3002's release workflow can import it on a runner with nothing installed.
The dependency runs one way: the updater asks ``packaging.release`` for the names
the workflow uploaded, so the two can never disagree about what a release
contains.
"""

from __future__ import annotations

from rotaris_core.updates.apply import (
    BACKUP_SUFFIX,
    CHUNK_SIZE,
    Applied,
    IntegrityError,
    Outcome,
    UpdateApplyError,
    apply_update,
    checksums_for,
    clear_stale_backup,
    restart,
    stage,
    verify,
)
from rotaris_core.updates.check import (
    LATEST_RELEASE_URL,
    REQUEST_TIMEOUT_SECONDS,
    Asset,
    Fetcher,
    HttpFetcher,
    Install,
    InstallKind,
    Release,
    asset_for,
    detect_install,
    is_newer,
    latest_release,
    parse_checksums,
    summarize,
)

__all__ = [
    "BACKUP_SUFFIX",
    "CHUNK_SIZE",
    "LATEST_RELEASE_URL",
    "REQUEST_TIMEOUT_SECONDS",
    "Applied",
    "Asset",
    "Fetcher",
    "HttpFetcher",
    "Install",
    "InstallKind",
    "IntegrityError",
    "Outcome",
    "Release",
    "UpdateApplyError",
    "apply_update",
    "asset_for",
    "checksums_for",
    "clear_stale_backup",
    "detect_install",
    "is_newer",
    "latest_release",
    "parse_checksums",
    "restart",
    "stage",
    "summarize",
    "verify",
]
