"""Classify a workspace as a code or a non-code project (SWR-2804).

The `project-initializer` agent (SWR-2803) uses this to decide whether Serena's
`onboarding` step is worth running: a documentation-only or empty workspace has
nothing for code-oriented memories to capture, so onboarding is skipped while
project activation still runs.

The scan is deliberately cheap — it stops at the first source file it finds and
never materializes a file list. `.gitignore` is honoured so a build directory
full of generated `.js` never turns a documentation repository into a "code"
project.

`rotaris_core.tools._gitignore.create_gitignore_matcher` does the same job, but
importing it executes `rotaris_core.tools.__init__`, which pulls in `openhands.sdk`
(~29s measured). Classification runs before any agent exists, so this module
keeps its own ~20-line matcher rather than paying that import.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path  # noqa: TC003 — used at runtime (Path(current_dir))
from typing import TYPE_CHECKING, Any, Literal

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable, Iterator, Sequence

_log = logging.getLogger(__name__)

# Source-code extensions from SWR-2804. Overridable per workspace via
# `project_init.source_extensions`; the caller passes the resolved list in.
DEFAULT_SOURCE_EXTENSIONS: tuple[str, ...] = (
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".rs",
    ".go",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".rb",
    ".php",
    ".swift",
    ".kt",
    ".scala",
    ".cs",
    ".fs",
    ".ex",
    ".exs",
    ".r",
    ".jl",
)

ProjectKind = Literal["code", "non-code"]

# Never worth walking, and never covered by `.gitignore` itself.
_ALWAYS_SKIPPED_DIRS = frozenset({".git"})


def _normalize_extensions(extensions: Iterable[str]) -> frozenset[str]:
    """Lower-case the extensions and give each one a leading dot.

    Tolerates the shapes a hand-edited config produces (`py`, `.PY`, `" .py "`).
    """
    normalized: set[str] = set()
    for raw in extensions:
        candidate = raw.strip().lower()
        if not candidate:
            continue
        if not candidate.startswith("."):
            candidate = f".{candidate}"
        if candidate == ".":
            continue
        normalized.add(candidate)
    return frozenset(normalized)


def _create_gitignore_matcher(root: Path) -> Any | None:
    """Compile `<root>/.gitignore` into a `pathspec` matcher.

    Returns `None` when there is no readable `.gitignore`, it holds no patterns,
    or `pathspec` is unavailable — mirroring the degradation the glob/grep tools
    already accept, so classification never hard-fails on a missing optional
    dependency.
    """
    try:
        raw = (root / ".gitignore").read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None

    patterns = [
        line for line in raw.splitlines() if line.strip() and not line.lstrip().startswith("#")
    ]
    if not patterns:
        return None

    try:
        import pathspec  # noqa: PLC0415 — lazy; pathspec is an optional dep

        return pathspec.PathSpec.from_lines("gitwildmatch", patterns)
    except ImportError:
        _log.debug("pathspec not available; .gitignore will not be honoured.")
        return None
    except Exception:
        _log.warning("Failed to compile .gitignore patterns from %s", root, exc_info=True)
        return None


def _relative_posix(path: Path, root: Path) -> str | None:
    """Return `path` relative to `root` in posix form, or `None` if outside."""
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return None


def _is_ignored_dir(matcher: Any, relative: str) -> bool:
    """Match a directory against a gitignore spec.

    `pathspec`'s gitwildmatch only honours a directory pattern (`build/`) when
    the candidate itself carries the trailing slash, so both forms are tried.
    """
    return bool(matcher.match_file(f"{relative}/") or matcher.match_file(relative))


@traces(SWR.SWR_2804)
def _matching_source_extensions(
    root: Path,
    source_extensions: Sequence[str] | None = None,
) -> Iterator[str]:
    """Yield source extensions found in ``root``, respecting its ``.gitignore``."""
    extensions = _normalize_extensions(
        DEFAULT_SOURCE_EXTENSIONS if source_extensions is None else source_extensions
    )
    if not extensions:
        return

    matcher = _create_gitignore_matcher(root)
    for current_dir, dir_names, file_names in os.walk(root):
        current = Path(current_dir)
        kept_dirs: list[str] = []
        for dir_name in dir_names:
            if dir_name in _ALWAYS_SKIPPED_DIRS:
                continue
            relative = _relative_posix(current / dir_name, root)
            if relative is None:
                continue
            if matcher is not None and _is_ignored_dir(matcher, relative):
                continue
            kept_dirs.append(dir_name)
        dir_names[:] = kept_dirs

        for file_name in file_names:
            extension = os.path.splitext(file_name)[1].lower()
            if extension not in extensions:
                continue
            if matcher is None:
                yield extension
                continue
            relative = _relative_posix(current / file_name, root)
            if relative is not None and not matcher.match_file(relative):
                yield extension


@traces(SWR.SWR_2804, SWR.SWR_2820)
def source_extensions_in_project(
    root: Path,
    source_extensions: Sequence[str] | None = None,
) -> tuple[str, ...]:
    """Return the distinct configured source extensions present in ``root``."""
    return tuple(sorted(set(_matching_source_extensions(root, source_extensions))))


@traces(SWR.SWR_2804)
def classify_project(
    root: Path,
    source_extensions: Sequence[str] | None = None,
) -> ProjectKind:
    """Return `"code"` when the workspace holds at least one source file.

    Walks `root` recursively, skipping `.git/` and anything matched by
    `<root>/.gitignore`, and returns `"code"` as soon as a file's extension is
    in `source_extensions` (defaulting to `DEFAULT_SOURCE_EXTENSIONS`).
    Otherwise — including for an empty, missing, or documentation-only tree —
    returns `"non-code"`.
    """
    return (
        "code" if next(_matching_source_extensions(root, source_extensions), None) else "non-code"
    )
