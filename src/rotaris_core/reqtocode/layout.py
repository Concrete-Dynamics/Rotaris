"""ReqToCode repository layout — the "where things live" description as data.

Every root and file location ReqToCode needs used to be a module constant, so
the tool knew exactly one repository. `RepoLayout` carries them instead: the
requirement store, the generated traceables path, the implementation and test
roots, the excused test roots, the three baseline files and the exempt marker.

`DEFAULT_LAYOUT` reproduces the historical constants byte-for-byte, and every
entry point defaults to it, so this repository's behaviour and output are
unchanged. A target repository may override them from a small JSON config file
(`.reqtocode.json`) at its root — that is where stack detection writes its
proposal. Stdlib-only (json): the pre-commit hook runs without the project venv.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Mapping

#: Config file consulted at the target repository root (optional).
CONFIG_FILENAME = ".reqtocode.json"

_BASELINE_NAME = "traceability-baseline.txt"
_ORPHAN_BASELINE_NAME = "orphan-baseline.txt"
_TEST_ORPHAN_BASELINE_NAME = "orphan-test-baseline.txt"
_TOMBSTONE_NAME = "retired-ids.txt"

_DEFAULT_REQ_DIR = Path("docs") / "requirements"
_DEFAULT_EXEMPT_MARKER = "# reqtocode: exempt"
_DEFAULT_SKIP_PARTS = frozenset({"__pycache__", ".venv", "fixtures"})


class LayoutError(ValueError):
    """A layout configuration file is malformed or names an impossible path."""


@dataclass(frozen=True)
class RepoLayout:
    """Where a repository keeps its requirements, code, tests and baselines.

    All paths are repository-relative; they are resolved against a `repo_root`
    by the caller. Field defaults are this repository's historical constants.
    """

    #: Directory scanned recursively for requirement markdown files.
    requirements_dir: Path = _DEFAULT_REQ_DIR
    #: Generated traceables module (never scanned for annotations).
    generated_path: Path = Path("src") / "rotaris_core" / "reqtocode" / "swr.py"
    #: Roots whose files may carry implementation traces.
    impl_roots: tuple[Path, ...] = (Path("src") / "rotaris_core", Path("apps") / "rotaris" / "src")
    #: Roots whose files may carry test-coverage references.
    test_roots: tuple[Path, ...] = (Path("tests"), Path("apps") / "rotaris" / "tests")
    #: Test roots excused from the reverse (test -> requirement) check.
    #: Both hold live-provider tests, which exercise general framework
    #: capability rather than one requirement — and, being skipped unless
    #: asked for by name, would be evidence no ordinary pass ever produces.
    excused_test_roots: tuple[Path, ...] = (
        Path("tests") / "capability",
        Path("tests") / "live",
    )
    #: Shrink-only trace/test debt baseline.
    baseline_path: Path = _DEFAULT_REQ_DIR / _BASELINE_NAME
    #: Shrink-only orphan-module baseline.
    orphan_baseline_path: Path = _DEFAULT_REQ_DIR / _ORPHAN_BASELINE_NAME
    #: Shrink-only orphan-test baseline.
    test_orphan_baseline_path: Path = _DEFAULT_REQ_DIR / _TEST_ORPHAN_BASELINE_NAME
    #: Append-only log of retired ids (SWR-2318). Unlike the three baselines
    #: above it never shrinks: a retired id stays retired forever.
    tombstone_path: Path = _DEFAULT_REQ_DIR / _TOMBSTONE_NAME
    #: Marker excusing a module (or a test function near it) from the reverse check.
    exempt_marker: str = _DEFAULT_EXEMPT_MARKER
    #: Directory/file name components never scanned inside a root.
    skip_parts: frozenset[str] = _DEFAULT_SKIP_PARTS

    def is_excused_test_file(self, relative_path: str | Path) -> bool:
        """True when a repo-relative test file lives under an excused test root."""
        rel = Path(relative_path)
        return any(rel.is_relative_to(root) for root in self.excused_test_roots)

    def with_requirements_dir(self, directory: str | Path) -> RepoLayout:
        """Move the requirement store, carrying the baseline files with it."""
        req_dir = _as_relative_path(directory, "requirements_dir")
        return replace(
            self,
            requirements_dir=req_dir,
            baseline_path=req_dir / _BASELINE_NAME,
            orphan_baseline_path=req_dir / _ORPHAN_BASELINE_NAME,
            test_orphan_baseline_path=req_dir / _TEST_ORPHAN_BASELINE_NAME,
            tombstone_path=req_dir / _TOMBSTONE_NAME,
        )


#: The historical Rotaris constants; the default for every entry point.
DEFAULT_LAYOUT = RepoLayout()

_PATH_FIELDS = ("requirements_dir", "generated_path")
_PATH_LIST_FIELDS = ("impl_roots", "test_roots", "excused_test_roots")
_BASELINE_FIELDS = (
    "baseline_path",
    "orphan_baseline_path",
    "test_orphan_baseline_path",
    "tombstone_path",
)
_KNOWN_KEYS = frozenset(
    (*_PATH_FIELDS, *_PATH_LIST_FIELDS, *_BASELINE_FIELDS, "exempt_marker", "skip_parts")
)


def _as_relative_path(value: object, key: str) -> Path:
    if isinstance(value, Path):
        value = value.as_posix()
    if not isinstance(value, str) or not value.strip():
        raise LayoutError(f"{key}: expected a non-empty repository-relative path, got {value!r}")
    pure = PurePosixPath(value.replace("\\", "/"))
    if pure.is_absolute() or ".." in pure.parts:
        raise LayoutError(f"{key}: {value!r} must be relative and stay inside the repository")
    return Path(*pure.parts)


def _as_path_tuple(value: object, key: str) -> tuple[Path, ...]:
    if isinstance(value, str) or not isinstance(value, (list, tuple)):
        raise LayoutError(f"{key}: expected a list of repository-relative paths, got {value!r}")
    return tuple(_as_relative_path(item, key) for item in value)


def layout_from_mapping(data: Mapping[str, Any], base: RepoLayout | None = None) -> RepoLayout:
    """Build a layout from decoded config data, filling gaps from `base`.

    Naming only `requirements_dir` also moves the three baseline files into it,
    which is what a relocated requirement store almost always wants; naming a
    baseline path explicitly still wins.
    """
    layout = base if base is not None else DEFAULT_LAYOUT
    unknown = sorted(set(data) - _KNOWN_KEYS)
    if unknown:
        raise LayoutError(f"unknown layout key(s) {unknown}; expected any of {sorted(_KNOWN_KEYS)}")
    if "requirements_dir" in data:
        layout = layout.with_requirements_dir(
            _as_relative_path(data["requirements_dir"], "requirements_dir")
        )
    changes: dict[str, Any] = {}
    if "generated_path" in data:
        changes["generated_path"] = _as_relative_path(data["generated_path"], "generated_path")
    for key in _PATH_LIST_FIELDS:
        if key in data:
            changes[key] = _as_path_tuple(data[key], key)
    for key in _BASELINE_FIELDS:
        if key in data:
            changes[key] = _as_relative_path(data[key], key)
    if "exempt_marker" in data:
        marker = data["exempt_marker"]
        if not isinstance(marker, str) or not marker.strip():
            raise LayoutError(f"exempt_marker: expected a non-empty string, got {marker!r}")
        changes["exempt_marker"] = marker
    if "skip_parts" in data:
        parts = data["skip_parts"]
        if isinstance(parts, str) or not isinstance(parts, (list, tuple)):
            raise LayoutError(f"skip_parts: expected a list of names, got {parts!r}")
        if not all(isinstance(part, str) for part in parts):
            raise LayoutError(f"skip_parts: expected a list of names, got {parts!r}")
        changes["skip_parts"] = frozenset(parts)
    return replace(layout, **changes)


def config_path_for(repo_root: Path) -> Path:
    """Where `load_layout` looks for the optional layout config."""
    return repo_root / CONFIG_FILENAME


def load_layout(repo_root: Path, config_path: Path | None = None) -> RepoLayout:
    """Read the layout for `repo_root`, or `DEFAULT_LAYOUT` when unconfigured.

    Raises `LayoutError` when a config file exists but cannot be understood —
    silently falling back to Rotaris' own constants would check the wrong tree.
    """
    path = config_path if config_path is not None else config_path_for(repo_root)
    if not path.is_file():
        return DEFAULT_LAYOUT
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LayoutError(f"{path}: cannot read layout config ({exc})") from exc
    if not isinstance(data, dict):
        raise LayoutError(f"{path}: layout config must be a JSON object")
    section = data.get("layout", data)
    if not isinstance(section, dict):
        raise LayoutError(f"{path}: 'layout' must be a JSON object")
    try:
        return layout_from_mapping(section)
    except LayoutError as exc:
        raise LayoutError(f"{path}: {exc}") from exc


def _self_annotate() -> None:
    # Bootstrap-safe (blueprint §11): tolerate a missing/stale generated module.
    try:
        from rotaris_core.reqtocode.declarations import traces
        from rotaris_core.reqtocode.swr import SWR

        traces(SWR.SWR_2335)(RepoLayout)
        traces(SWR.SWR_2335)(layout_from_mapping)
        traces(SWR.SWR_2335)(load_layout)
    except (ImportError, AttributeError):  # pragma: no cover - bootstrap/stale swr.py
        return


_self_annotate()
