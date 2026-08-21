from __future__ import annotations

import logging
from pathlib import Path

import platformdirs

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

#: Pre-rename identity. Kept only so existing installs and workspaces keep their
#: state after the geraet-ai -> Rotaris rename; never write new paths with it.
LEGACY_APP_NAME = "geraet-ai"
LEGACY_WORKSPACE_CONFIG_DIR_NAME = ".geraet-ai"

#: Directory name of the per-workspace state dir (`<workspace>/.rotaris/`).
WORKSPACE_CONFIG_DIR_NAME = ".rotaris"


def _adopt_legacy_dir(current: Path, legacy: Path) -> Path:
    """Rename *legacy* to *current* once, so pre-rename state survives.

    Only fires when the new path does not exist yet; any failure is non-fatal
    and simply leaves the legacy directory alone.
    """
    if current.exists() or not legacy.is_dir():
        return current
    try:
        current.parent.mkdir(parents=True, exist_ok=True)
        legacy.rename(current)
    except OSError:
        _log.warning("Could not migrate %s to %s; leaving it in place.", legacy, current)
        return legacy
    _log.info("Migrated %s to %s after the Rotaris rename.", legacy, current)
    return current


# SWR-725: the global settings dir lives at the OS-standard per-user config location.
GLOBAL_CONFIG_DIR: Path = traces(SWR.SWR_725)(
    _adopt_legacy_dir(
        Path(platformdirs.user_config_dir("rotaris")),
        Path(platformdirs.user_config_dir(LEGACY_APP_NAME)),
    )
)
GLOBAL_DATA_DIR: Path = _adopt_legacy_dir(
    Path(platformdirs.user_data_dir("rotaris")),
    Path(platformdirs.user_data_dir(LEGACY_APP_NAME)),
)


def workspace_config_dir(workspace_root: Path | str) -> Path:
    """Return `<workspace_root>/.rotaris`, adopting a legacy `.geraet-ai` dir."""
    root = Path(workspace_root)
    return _adopt_legacy_dir(
        root / WORKSPACE_CONFIG_DIR_NAME,
        root / LEGACY_WORKSPACE_CONFIG_DIR_NAME,
    )
