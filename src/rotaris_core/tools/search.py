"""Read-only search tools (grep, glob) for the Researcher agent.

These tools are restricted to workspace-relative operations and perform no
writes, shell commands, or external network calls.
"""

from __future__ import annotations

import atexit
import fnmatch
import os
import re
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import TYPE_CHECKING, Any, Self

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools._gitignore import (
    IGNORED_PATH_PARTS,
    create_gitignore_matcher,
)

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence

_MAX_SCAN_FILE_BYTES = 2 * 1024 * 1024

# ---------------------------------------------------------------------------
# Separate thread pool for filesystem scans (glob / grep Python fallbacks).
# These can take minutes on large workspaces (e.g. pnpm monorepos with
# enormous node_modules).  Running them in the SDK's own thread pool would
# starve fast tools like artifact_list, so we offload heavy filesystem I/O
# to a dedicated pool and limit concurrency with a semaphore.
#
# ``max_workers`` is deliberately capped — more threads don't help with
# disk-bound work on a single spindle, and on Windows NTFS contention eats
# any parallelism gains.
# ---------------------------------------------------------------------------
_FS_POOL_MAX_WORKERS = 4
_fs_pool: ThreadPoolExecutor | None = None
_fs_pool_lock = threading.Lock()


def _get_fs_pool() -> ThreadPoolExecutor:
    """Return the module-level filesystem‑scan thread pool, creating it on first call."""
    global _fs_pool
    if _fs_pool is not None:
        return _fs_pool
    with _fs_pool_lock:
        if _fs_pool is None:
            _fs_pool = ThreadPoolExecutor(
                max_workers=_FS_POOL_MAX_WORKERS,
                thread_name_prefix="Rotaris-fs-scan",
            )
    return _fs_pool


def _shutdown_fs_pool() -> None:
    """Attempt graceful shutdown of the filesystem pool (called via atexit)."""
    global _fs_pool
    pool = _fs_pool
    _fs_pool = None
    if pool is not None:
        pool.shutdown(wait=False)


atexit.register(_shutdown_fs_pool)

_GREP_PATHS_DESCRIPTION = (
    "Restrict the search to these paths or glob patterns. Must be a JSON array "
    "of strings, for example [`src/`] or [`**/*.py`]. Use the plural "
    "parameter name `paths` (not `path`). Omit this field to search the entire "
    "workspace."
)


def _is_within_workspace(
    path: Path,
    workspace_root: Path,
    allow_outside_workspace: bool = False,
) -> bool:
    if allow_outside_workspace:
        return True
    try:
        path.relative_to(workspace_root)
    except ValueError:
        return False
    return True


def _is_ignored_path(
    path: Path,
    workspace_root: Path,
    *,
    allow_outside_workspace: bool = False,
) -> bool:
    if not _is_within_workspace(
        path,
        workspace_root,
        allow_outside_workspace=allow_outside_workspace,
    ):
        return True
    if allow_outside_workspace:
        relative_parts = path.parts
    else:
        relative_parts = path.relative_to(workspace_root).parts
    return any(part in IGNORED_PATH_PARTS for part in relative_parts)


def _is_probably_binary(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            return b"\0" in handle.read(1024)
    except OSError:
        return True


def _is_scannable_file(
    path: Path,
    workspace_root: Path,
    *,
    gitignore_matcher: Any | None = None,
) -> bool:
    if not path.is_file() or path.is_symlink():
        return False
    if _is_ignored_path(path, workspace_root):
        return False
    if gitignore_matcher is not None:
        try:
            rel = path.relative_to(workspace_root).as_posix()
        except ValueError:
            return False
        if gitignore_matcher.match_file(rel):
            return False
    try:
        if path.stat().st_size > _MAX_SCAN_FILE_BYTES:
            return False
    except OSError:
        return False
    return not _is_probably_binary(path)


def _iter_files_under(
    root: Path,
    workspace_root: Path,
    *,
    gitignore_matcher: Any | None = None,
) -> Iterator[Path]:
    for current_root, dir_names, file_names in os.walk(root):
        # First, remove hardcoded-ignore directories.
        dir_names[:] = [
            dir_name
            for dir_name in dir_names
            if dir_name not in IGNORED_PATH_PARTS
            and not _is_ignored_path(Path(current_root) / dir_name, workspace_root)
        ]
        # Then, additionally remove directories matched by .gitignore.
        if gitignore_matcher is not None:
            kept: list[str] = []
            for dir_name in dir_names:
                try:
                    rel = (Path(current_root) / dir_name).relative_to(workspace_root).as_posix()
                except ValueError:
                    continue
                # Treat the directory as a file path for matching — pathspec's
                # gitwildmatch handles directory patterns (trailing /) correctly.
                if not gitignore_matcher.match_file(rel):
                    kept.append(dir_name)
            dir_names[:] = kept
        for file_name in file_names:
            candidate = Path(current_root) / file_name
            if _is_scannable_file(candidate, workspace_root, gitignore_matcher=gitignore_matcher):
                yield candidate


def _iter_candidate_files(
    workspace_root: Path,
    paths: list[str] | None,
    *,
    gitignore_matcher: Any | None = None,
) -> Iterator[Path]:
    seen: set[Path] = set()

    def _yield_candidate(candidate: Path) -> Iterator[Path]:
        resolved = candidate.resolve()
        if resolved in seen:
            return
        seen.add(resolved)
        if candidate.is_dir():
            yield from _iter_files_under(
                candidate,
                workspace_root,
                gitignore_matcher=gitignore_matcher,
            )
            return
        if _is_scannable_file(candidate, workspace_root, gitignore_matcher=gitignore_matcher):
            yield candidate

    if not paths:
        yield from _iter_files_under(
            workspace_root,
            workspace_root,
            gitignore_matcher=gitignore_matcher,
        )
        return

    for path_pattern in paths:
        matched_any = False
        normalized_pattern = _normalize_workspace_pattern(workspace_root, path_pattern)
        if normalized_pattern is None:
            continue
        try:
            for matched in workspace_root.glob(normalized_pattern):
                matched_any = True
                yield from _yield_candidate(matched)
        except NotImplementedError:
            continue
        if matched_any:
            continue
        literal_candidate = workspace_root / path_pattern
        if literal_candidate.exists():
            yield from _yield_candidate(literal_candidate)


def _normalize_workspace_pattern(workspace_root: Path, path_pattern: str) -> str | None:
    """Return a workspace-relative pattern, or None when outside workspace."""
    try:
        candidate = Path(path_pattern)
    except (TypeError, ValueError):
        candidate = Path(str(path_pattern))
    if not candidate.is_absolute():
        return path_pattern
    try:
        return candidate.relative_to(workspace_root).as_posix()
    except ValueError:
        return None


def _ripgrep_exclude_args() -> list[str]:
    args: list[str] = []
    for ignored in sorted(IGNORED_PATH_PARTS):
        args.extend(["--glob", f"!**/{ignored}/**"])
        args.extend(["--glob", f"!{ignored}/**"])
    return args


def _ripgrep_binary_args() -> list[str]:
    return ["--hidden", "--max-filesize", f"{_MAX_SCAN_FILE_BYTES}B"]


def _ripgrep_available() -> bool:
    return shutil.which("rg") is not None


# ---------------------------------------------------------------------------
# Grep
# ---------------------------------------------------------------------------


class GrepAction(Action):
    pattern: str = Field(description="Regular-expression pattern to search for")
    paths: list[str] | None = Field(
        default=None,
        description=_GREP_PATHS_DESCRIPTION,
    )
    max_matches: int = Field(default=100, description="Maximum number of matching lines to return")

    @model_validator(mode="before")
    @classmethod
    def _remap_path_aliases(cls, data: Any) -> Any:
        """Normalise common path parameter variants LLMs tend to emit.

        * ``path`` (string) → ``paths`` list, when ``paths`` is absent.
        * ``paths`` as a plain string → wrapped to a single-element list.
        """
        if not isinstance(data, dict):
            return data
        data = dict(data)
        if "path" in data and "paths" not in data:
            data["paths"] = [data.pop("path")]
        elif "paths" in data and isinstance(data["paths"], str):
            data["paths"] = [data["paths"]]
        return data


class GrepObservation(Observation):
    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        text = self.text or "No matches found"
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


@traces(SWR.SWR_629, SWR.SWR_630, SWR.SWR_631, SWR.SWR_632, SWR.SWR_2114)
class GrepExecutor(ToolExecutor[GrepAction, GrepObservation]):
    def __init__(self, workspace_root: Path) -> None:
        self.workspace_root = workspace_root
        self._gitignore_matcher = create_gitignore_matcher(workspace_root)

    def __call__(
        self,
        action: GrepAction,
        conversation: object = None,
    ) -> GrepObservation:
        try:
            compiled = re.compile(action.pattern)
        except re.error as exc:
            return GrepObservation.from_text(
                f"Invalid regex pattern: {exc}",
                is_error=True,
            )

        matches = self._grep_with_ripgrep(action)
        if matches is None:
            matches = self._grep_with_python(action, compiled)

        if not matches:
            return GrepObservation.from_text("No matches found")
        return GrepObservation.from_text("\n".join(matches))

    def _grep_with_ripgrep(self, action: GrepAction) -> list[str] | None:
        if action.paths or not _ripgrep_available():
            return None

        command = [
            "rg",
            "--color",
            "never",
            "--line-number",
            "--no-heading",
            "--with-filename",
            *_ripgrep_binary_args(),
            *_ripgrep_exclude_args(),
            action.pattern,
            ".",
        ]
        matches: list[str] = []
        try:
            with subprocess.Popen(
                command,
                cwd=self.workspace_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
            ) as process:
                assert process.stdout is not None
                for line in process.stdout:
                    normalized = line.rstrip("\n")
                    if normalized:
                        matches.append(normalized)
                    if len(matches) >= action.max_matches:
                        process.terminate()
                        break
                _, stderr = process.communicate()
        except OSError:
            return None

        if not matches and stderr:
            return None
        return matches

    def _grep_with_python(
        self,
        action: GrepAction,
        compiled: re.Pattern[str],
    ) -> list[str]:
        """Run grep via Python fallback in the dedicated filesystem scan pool."""
        return (
            _get_fs_pool()
            .submit(
                _do_grep_with_python,
                self.workspace_root,
                action,
                compiled,
                self._gitignore_matcher,
            )
            .result()
        )


def _do_grep_with_python(
    workspace_root: Path,
    action: GrepAction,
    compiled: re.Pattern[str],
    gitignore_matcher: Any | None,
) -> list[str]:
    """Stateless worker for :meth:`GrepExecutor._grep_with_python`."""
    matches: list[str] = []
    for file_path in _iter_candidate_files(
        workspace_root,
        action.paths,
        gitignore_matcher=gitignore_matcher,
    ):
        try:
            with file_path.open("r", encoding="utf-8", errors="replace") as handle:
                for lineno, line in enumerate(handle, 1):
                    normalized = line.rstrip("\n")
                    if compiled.search(normalized):
                        rel = file_path.relative_to(workspace_root).as_posix()
                        matches.append(f"{rel}:{lineno}:{normalized}")
                        if len(matches) >= action.max_matches:
                            return matches
        except OSError:
            continue
    return matches


class GrepTool(ToolDefinition[GrepAction, GrepObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        workspace_root: Path = kwargs.get("workspace_root", Path())
        return [
            cls(
                description=(
                    "Search file contents for a regular-expression pattern within the workspace. "
                    "Returns matching lines as 'file:line:content' entries. "
                    "Optionally restrict the search with `paths`, which must be a list of "
                    "path or glob strings. "
                    "Default max_matches: 100."
                ),
                action_type=GrepAction,
                observation_type=GrepObservation,
                executor=GrepExecutor(workspace_root),
            ),
        ]


# ---------------------------------------------------------------------------
# Glob
# ---------------------------------------------------------------------------


class GlobAction(Action):
    pattern: str = Field(description="Glob pattern to match file paths (e.g. '**/*.py')")
    base_path: str | None = Field(
        default=None,
        description=("Relative directory to search within. Defaults to the workspace root."),
    )


class GlobObservation(Observation):
    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        text = self.text or "No files found"
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


class GlobExecutor(ToolExecutor[GlobAction, GlobObservation]):
    def __init__(self, workspace_root: Path) -> None:
        self.workspace_root = workspace_root
        self._gitignore_matcher = create_gitignore_matcher(workspace_root)

    def __call__(
        self,
        action: GlobAction,
        conversation: object = None,
    ) -> GlobObservation:
        base = self.workspace_root
        if action.base_path:
            candidate = (self.workspace_root / action.base_path).resolve()
            if _is_within_workspace(candidate, self.workspace_root) and candidate.is_dir():
                base = candidate

        relative_paths = self._glob_with_ripgrep(base, action.pattern)
        if relative_paths is None:
            relative_paths = self._glob_with_python(base, action.pattern)

        if not relative_paths:
            return GlobObservation.from_text("No files found")
        return GlobObservation.from_text("\n".join(relative_paths))

    def _glob_with_ripgrep(self, base: Path, pattern: str) -> list[str] | None:
        if not _ripgrep_available():
            return None

        command = [
            "rg",
            "--files",
            *_ripgrep_binary_args(),
            *_ripgrep_exclude_args(),
            "-g",
            pattern,
        ]
        try:
            result = subprocess.run(
                command,
                cwd=base,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        except OSError:
            return None

        if result.returncode not in {0, 1}:
            return None

        prefix = base.relative_to(self.workspace_root)
        matches: list[str] = []
        for line in result.stdout.splitlines():
            candidate = (prefix / line).as_posix() if prefix != Path() else line
            if candidate:
                matches.append(candidate)
        return sorted(dict.fromkeys(matches))

    def _glob_with_python(self, base: Path, pattern: str) -> list[str]:
        """Run glob via Python fallback in the dedicated filesystem scan pool.

        Offloading to ``_get_fs_pool()`` keeps the SDK's own thread pool free
        for quick tools (e.g. ``artifact_list``, ``read_file``) even when
        several agents run slow ``glob`` scans concurrently.
        """
        return (
            _get_fs_pool()
            .submit(
                _do_glob_with_python,
                base,
                pattern,
                self.workspace_root,
                self._gitignore_matcher,
            )
            .result()
        )


def _do_glob_with_python(
    base: Path,
    pattern: str,
    workspace_root: Path,
    gitignore_matcher: Any | None,
) -> list[str]:
    """Stateless worker for :meth:`GlobExecutor._glob_with_python`."""
    matches: list[str] = []
    seen: set[str] = set()
    for file_path in _iter_files_under(
        base,
        workspace_root,
        gitignore_matcher=gitignore_matcher,
    ):
        relative_to_base = file_path.relative_to(base).as_posix()
        if fnmatch.fnmatch(relative_to_base, pattern) or Path(relative_to_base).match(pattern):
            relative_to_workspace = file_path.relative_to(workspace_root).as_posix()
            if relative_to_workspace not in seen:
                seen.add(relative_to_workspace)
                matches.append(relative_to_workspace)
    return sorted(matches)


class GlobTool(ToolDefinition[GlobAction, GlobObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        workspace_root: Path = kwargs.get("workspace_root", Path())
        return [
            cls(
                description=(
                    "List workspace files matching a glob pattern (e.g. '**/*.py', 'src/**/*.ts'). "
                    "Optionally restrict to a subdirectory with 'base_path'. "
                    "Returns one relative file path per line, sorted alphabetically."
                ),
                action_type=GlobAction,
                observation_type=GlobObservation,
                executor=GlobExecutor(workspace_root),
            ),
        ]
