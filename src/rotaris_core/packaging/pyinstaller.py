"""Derived bundle contents for the standalone binaries (SWR-3001).

Three classes of things fall out of a frozen build unless they are named, and
each has a concrete call site in this repository:

1. **Package data read through ``Path(__file__).parent``** — the persona prompts
   (``agents/factory.py``), the playbook matrix (``agents/playbook.py``), the
   intent catalogue (``ralph/intent_classifier.py``), the TUI stylesheet. These
   are *walked*, not listed, so a new prompt file ships without touching this
   module.
2. **Dependency data files** — ``litellm`` reads its own price/cost JSON from its
   package directory, ``openhands`` its Jinja templates and preset subagent
   markdown.
3. **Modules imported by string**, which no static analysis can see: the
   OpenHands terminal internals (``tools/terminal.py``), the Claude SDK provider
   shims (``providers/claude_sdk/__init__.py``), the Serena task runner
   (``init/registry.py``), the config loader reached from the auth flow
   (``cli/auth_flow.py``), and ``tiktoken``'s plugin namespace.

Plus the distribution metadata: :func:`rotaris_core._read_version` asks
``importlib.metadata`` for the installed version and degrades to ``0+unknown``
without it, which would make a shipped binary misreport itself.

Stdlib-only by design — importing PyInstaller here would make a build tool a
runtime dependency. The ``.spec`` files under ``packaging/`` do that import.
"""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path

from rotaris_core.reqtocode import SWR, traces

#: Directory names never worth carrying into a bundle.
_SKIP_DIRS = frozenset({"__pycache__", ".mypy_cache", ".ruff_cache"})

#: Suffixes that are code, not data — PyInstaller analyses those itself.
_CODE_SUFFIXES = frozenset({".py", ".pyc", ".pyo", ".pyd", ".so"})

#: Dependency package -> the data suffixes it reads from its own directory.
_DEPENDENCY_DATA: dict[str, frozenset[str]] = {
    # litellm/model_prices_and_context_window_backup.json, cost.json, and the
    # endpoint/policy backups next to them.
    "litellm": frozenset({".json"}),
    # openhands/sdk/context/**/*.j2 and openhands/tools/preset/subagents/*.md.
    "openhands": frozenset({".j2", ".md"}),
    # binaryornot/data/*.csv — read at import time through importlib.resources by
    # binaryornot/helpers.py::_load_binary_signatures, which the OpenHands file
    # editor pulls in. Found by running a frozen build, not by reading the code.
    "binaryornot": frozenset({".csv"}),
    # textual/tree-sitter/highlights/*.scm — syntax highlighting in the TUI.
    "textual": frozenset({".scm"}),
    # certifi/cacert.pem keeps verified setup downloads available from frozen
    # Linux AppImages where OpenSSL lacks its compiled-in CA path.
    "certifi": frozenset({".pem"}),
}

#: Imported by string, so PyInstaller's import graph never reaches them.
_DYNAMIC_IMPORTS: tuple[str, ...] = (
    # rotaris_core/tools/terminal.py::_load_openhands_terminal
    "openhands.tools.terminal.constants",
    "openhands.tools.terminal.definition",
    "openhands.tools.terminal.impl",
    "openhands.tools.terminal.metadata",
    "openhands.tools.terminal.terminal.terminal_session",
    # rotaris_core/providers/claude_sdk/__init__.py — lazy submodule resolution
    "rotaris_core.providers.claude_sdk",
    # rotaris_core/init/registry.py::_SERENA_RUNNER_MODULE
    "rotaris_core.init.serena_task",
    # rotaris_core/cli/auth_flow.py — import_module("rotaris_core.config.loader")
    "rotaris_core.config.loader",
    # rotaris_core/cli/auth_flow.py and config/project_snapshot.py — import_module("yaml")
    "yaml",
    # binaryornot/helpers.py reaches this subpackage through importlib.resources,
    # so nothing imports it in a way the analysis can see.
    "binaryornot.data",
    # tiktoken loads its encodings through this plugin namespace package
    "tiktoken_ext",
    "tiktoken_ext.openai_public",
)

#: Dependency packages whose runtime surface is selected dynamically. The spec
#: files feed these through PyInstaller's ``collect_all`` so every Serena
#: language backend, resource, and metadata file travels with the artifact.
_COLLECT_ALL_PACKAGES: tuple[str, ...] = ("serena",)

#: Roots of the metadata closure. Their whole dependency tree comes along,
#: because reading one's own installed version at import time is a common habit:
#: ``rotaris_core._read_version`` does it, and so do ``fastmcp/__init__.py``,
#: ``openhands/sdk/__init__.py`` and ``openhands/tools/__init__.py``. A frozen app
#: missing that metadata either misreports its version or dies on import with
#: ``PackageNotFoundError``.
_METADATA_ROOTS: tuple[str, ...] = ("rotaris-core", "rotaris")

#: Characters that end a distribution name inside a ``Requires-Dist`` entry.
_REQUIREMENT_NAME_END = frozenset(" ;([<>=!~,")


@dataclass(frozen=True)
class EntryPoint:
    """One shipped executable and the callable behind it."""

    name: str
    module: str
    function: str
    #: False for the desktop app: a console window behind a GUI is a defect.
    console: bool

    @property
    def launcher(self) -> str:
        """File name of the version-controlled launcher script for this entry point."""
        return f"{self.name.replace('-', '_')}_launcher.py"


#: The three shipped executables, mirroring ``[project.scripts]`` in both
#: ``pyproject.toml`` files.
ENTRY_POINTS: dict[str, EntryPoint] = {
    "rotaris": EntryPoint("rotaris", "rotaris.main", "main", console=False),
    "rotaris-cli": EntryPoint("rotaris-cli", "rotaris_core.cli.app", "main", console=True),
    "rotaris-headless": EntryPoint(
        "rotaris-headless", "rotaris_core.cli.argparse_app", "main", console=True
    ),
}


@dataclass(frozen=True)
class BundleSpec:
    """Everything a ``.spec`` file needs to freeze one entry point."""

    name: str
    entry_script: Path
    console: bool
    datas: tuple[tuple[str, str], ...]
    hidden_imports: tuple[str, ...]
    metadata_packages: tuple[str, ...]
    collect_all_packages: tuple[str, ...]
    icon: str | None


@traces(SWR.SWR_3001)
def package_root(import_name: str) -> Path | None:
    """Directory of an installed package, or None when it is not importable.

    Resolved through the import system rather than a relative path, so it works
    the same from an editable install, a wheel, and a source checkout.
    """
    try:
        spec = importlib.util.find_spec(import_name)
    except (ImportError, ValueError):
        return None
    if spec is None:
        return None
    locations = list(spec.submodule_search_locations or ())
    if not locations:
        origin = spec.origin
        return Path(origin).parent if origin else None
    return Path(locations[0])


def _walk_data(
    root: Path, dest_prefix: str, suffixes: frozenset[str] | None
) -> list[tuple[str, str]]:
    """Every data file under ``root``, as PyInstaller ``(source, dest_dir)`` pairs."""
    collected: list[tuple[str, str]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in _SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        if suffixes is None:
            if path.suffix in _CODE_SUFFIXES:
                continue
        elif path.suffix not in suffixes:
            continue
        relative_dir = path.relative_to(root).parent
        dest = str(Path(dest_prefix) / relative_dir) if relative_dir.parts else dest_prefix
        collected.append((str(path), dest))
    return collected


@traces(SWR.SWR_3001)
def collect_datas() -> tuple[tuple[str, str], ...]:
    """Data files the frozen application reads from its own package directories.

    Walking beats listing: the prompts, playbooks, intents and stylesheet are all
    loaded relative to ``__file__``, and a missing one surfaces as a crash in a
    shipped binary rather than a failing test.
    """
    collected: list[tuple[str, str]] = []
    for import_name in ("rotaris_core", "rotaris"):
        root = package_root(import_name)
        if root is not None:
            collected.extend(_walk_data(root, import_name, suffixes=None))
    for import_name, suffixes in _DEPENDENCY_DATA.items():
        root = package_root(import_name)
        if root is not None:
            collected.extend(_walk_data(root, import_name, suffixes=suffixes))
    return tuple(collected)


@traces(SWR.SWR_3001)
def hidden_imports() -> tuple[str, ...]:
    """Modules reached by string import, which PyInstaller cannot discover."""
    return _DYNAMIC_IMPORTS


def _requirement_name(entry: str) -> str | None:
    """Distribution name from a ``Requires-Dist`` line, or None if it is optional.

    Extra-gated requirements are skipped: they are not installed unless the extra
    was asked for, and a bundle must not fail over metadata that is not there.
    """
    requirement, _, marker = entry.partition(";")
    if "extra ==" in marker:
        return None
    name = requirement.strip()
    for index, character in enumerate(name):
        if character in _REQUIREMENT_NAME_END:
            name = name[:index]
            break
    return name.strip() or None


@traces(SWR.SWR_3001)
def metadata_packages() -> tuple[str, ...]:
    """Every distribution whose ``importlib.metadata`` entry the bundle must carry.

    The closure over the two roots' requirements, not just the roots themselves —
    a dependency that reads its own version at import time (``fastmcp`` does)
    otherwise kills the frozen application on the first import.
    """
    from importlib.metadata import PackageNotFoundError, distribution

    seen: set[str] = set()
    queue = list(_METADATA_ROOTS)
    while queue:
        name = queue.pop()
        key = name.lower().replace("_", "-")
        if key in seen:
            continue
        try:
            dist = distribution(name)
        except PackageNotFoundError:
            continue
        seen.add(key)
        for entry in dist.requires or ():
            required = _requirement_name(entry)
            if required is not None and required.lower().replace("_", "-") not in seen:
                queue.append(required)
    return tuple(sorted(seen))


@traces(SWR.SWR_3001)
def repo_root() -> Path:
    """The checkout being built from — where the launcher scripts and icons live."""
    from rotaris_core.reqtocode.cli import find_repo_root

    return find_repo_root()


@traces(SWR.SWR_3001, SWR.SWR_3724)
def bundle_spec(name: str, *, root: Path | None = None) -> BundleSpec:
    """Resolve one entry point into a complete, buildable bundle description."""
    try:
        entry = ENTRY_POINTS[name]
    except KeyError:
        known = ", ".join(sorted(ENTRY_POINTS))
        raise ValueError(f"unknown build target {name!r}; expected one of: {known}") from None

    checkout = root if root is not None else repo_root()
    entry_script = checkout / "packaging" / "entrypoints" / entry.launcher
    icon_name = "rotaris.ico" if sys.platform.startswith("win") else "rotaris.png"
    icon_path = checkout / "packaging" / "assets" / icon_name
    return BundleSpec(
        name=entry.name,
        entry_script=entry_script,
        console=entry.console,
        datas=collect_datas(),
        hidden_imports=hidden_imports(),
        metadata_packages=metadata_packages(),
        collect_all_packages=_COLLECT_ALL_PACKAGES,
        icon=str(icon_path) if icon_path.is_file() else None,
    )
