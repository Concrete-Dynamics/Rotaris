"""Shared ignore rules for Rotaris tools.

Centralizes the hardcoded ``IGNORED_PATH_PARTS`` frozenset and provides an
optional `.gitignore`-backed matcher so multi-file scanning tools (glob, grep)
can skip files and directories the project has explicitly marked as ignored.

Single-file tools (read_file, haet_read) are NOT filtered by gitignore — the
agent explicitly asked for that path, so it should be served regardless.
"""

from __future__ import annotations

import logging
from pathlib import Path  # noqa: TC003 — used at runtime (root / ".gitignore")

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardcoded ignore parts — directories/files that are NEVER interesting to scan.
# These are fast (no I/O) and catch universal project cruft that may not be in
# every .gitignore.
# ---------------------------------------------------------------------------
IGNORED_PATH_PARTS = frozenset(
    {
        # Version control
        ".git",
        ".hg",
        ".svn",
        # IDE / editor
        ".idea",
        ".vscode",
        # Python
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        ".tox",
        ".venv",
        "__pycache__",
        "dist",
        "venv",
        # JavaScript / Node
        "node_modules",
        ".pnpm",  # pnpm virtual store
        ".next",  # Next.js build
        ".nuxt",  # Nuxt.js build
        "coverage",
        ".turbo",  # Turborepo cache
        "cache",
        # Other build output
        "build",
        "out",
        "target",  # Rust
        ".nx",  # Nx cache
        # Rotaris (".geraet-ai" is the pre-rename state dir)
        ".rotaris",
        ".geraet-ai",
    },
)


def _parse_gitignore(root: Path) -> list[str] | None:
    """Return the non-comment, non-empty lines of ``<root>/.gitignore``.

    Returns ``None`` when no ``.gitignore`` exists or it cannot be read.
    """
    gitignore_path = root / ".gitignore"
    try:
        raw = gitignore_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None

    patterns: list[str] = []
    for line in raw.splitlines():
        stripped = line.rstrip("\r\n")
        # Skip comment-only lines and blank lines.
        if not stripped or stripped.startswith("#"):
            continue
        patterns.append(stripped)
    return patterns or None


@traces(SWR.SWR_631)
def create_gitignore_matcher(workspace_root: Path) -> object | None:
    """Build a ``pathspec.PathSpec`` from ``<workspace_root>/.gitignore``.

    Returns ``None`` when there is no ``.gitignore``, it is empty, or
    ``pathspec`` is unavailable.
    """
    patterns = _parse_gitignore(workspace_root)
    if not patterns:
        return None
    try:
        import pathspec  # noqa: PLC0415 — lazy; pathspec is an optional dep

        return pathspec.PathSpec.from_lines("gitwildmatch", patterns)
    except ImportError:
        _log.debug("pathspec not available; .gitignore will not be honoured.")
        return None
    except Exception:
        _log.warning("Failed to compile .gitignore patterns from %s", workspace_root, exc_info=True)
        return None
