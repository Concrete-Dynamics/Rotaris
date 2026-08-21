"""Workspace-boundary path authorization helpers."""

from __future__ import annotations

from pathlib import Path

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_502, SWR.SWR_2111)
class PathAuth:
    """Centralized workspace-boundary path authorization.

    Safe default: rejects paths outside the workspace root.
    Set allow_outside=True to permit reads/writes anywhere on the filesystem.
    """

    def __init__(self, workspace_root: Path, *, allow_outside: bool = False) -> None:
        self.workspace_root = workspace_root.resolve()
        self.allow_outside = allow_outside

    def validate(self, path: str | Path, *, for_write: bool = False) -> Path:
        """Resolve and validate a path.

        If path is relative, resolves against workspace_root.
        Raises ValueError if path is outside workspace_root and allow_outside is False.
        Returns the resolved Path on success.
        """

        del for_write

        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = self.workspace_root / candidate

        resolved = candidate.resolve()
        if self.is_allowed(resolved):
            return resolved

        raise ValueError(f"Path '{resolved}' is outside workspace root '{self.workspace_root}'")

    def is_allowed(self, path: Path) -> bool:
        """Check whether a resolved path is within the workspace or allow_outside is True."""

        resolved = path.resolve()
        return self.allow_outside or resolved.is_relative_to(self.workspace_root)
