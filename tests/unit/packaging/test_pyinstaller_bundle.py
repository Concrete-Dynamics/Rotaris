"""Productive use: a maintainer adds a prompt file or a string-imported module and
the standalone binary still carries it.
Expected outcome: the derived bundle contents name every data file the frozen app
reads from its own package directories, every dynamically imported module, and the
distribution metadata both packages need to report their real version."""

from __future__ import annotations

import importlib
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from rotaris_core.packaging import (
    ENTRY_POINTS,
    bundle_spec,
    collect_datas,
    hidden_imports,
    metadata_packages,
)
from rotaris_core.packaging.pyinstaller import package_root
from rotaris_core.reqtocode import SWR, verifies

_CODE_SUFFIXES = {".py", ".pyc", ".pyo", ".pyd", ".so"}


def _shipped_data_files(import_name: str) -> set[Path]:
    root = package_root(import_name)
    assert root is not None, f"{import_name} must be importable to build a bundle"
    return {
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix not in _CODE_SUFFIXES and "__pycache__" not in path.parts
    }


@verifies(SWR.SWR_3001)
def test_every_core_data_file_is_bundled() -> None:
    """The prompts, playbooks, intents and stylesheet are read through
    ``Path(__file__).parent``; a missing one only surfaces as a crash in a shipped
    binary, so the bundle is derived by walking rather than by listing."""
    bundled = {Path(source) for source, _dest in collect_datas()}
    missing = _shipped_data_files("rotaris_core") - bundled
    assert not missing, f"data files missing from the bundle: {sorted(map(str, missing))}"


@verifies(SWR.SWR_3001)
def test_known_prompt_assets_are_bundled_at_their_import_relative_path() -> None:
    """The destination has to mirror the package layout, or ``PROMPTS_DIR`` resolves
    into an empty directory inside the frozen app."""
    by_name = {Path(source).name: dest for source, dest in collect_datas()}
    assert by_name["orchestrator.md"].replace("\\", "/") == "rotaris_core/agents/prompts"
    assert by_name["matrix.yaml"].replace("\\", "/") == "rotaris_core/agents/prompts/playbooks"
    assert by_name["intents.yaml"].replace("\\", "/") == "rotaris_core/agents/prompts/intents"
    assert by_name["app.tcss"].replace("\\", "/") == "rotaris_core/tui/styles"


@verifies(SWR.SWR_3001)
def test_dependency_data_files_travel_with_the_bundle() -> None:
    """litellm reads its price table and openhands its templates from their own
    package directories — neither survives freezing unless collected."""
    bundled = {Path(source).name for source, _dest in collect_datas()}
    assert "model_prices_and_context_window_backup.json" in bundled
    assert any(name.endswith(".j2") for name in bundled)
    assert "cacert.pem" in bundled


@verifies(SWR.SWR_3001)
@pytest.mark.parametrize(
    "module_name",
    [
        "openhands.tools.terminal.constants",
        "openhands.tools.terminal.definition",
        "openhands.tools.terminal.impl",
        "openhands.tools.terminal.metadata",
        "openhands.tools.terminal.terminal.terminal_session",
        "rotaris_core.providers.claude_sdk",
        "rotaris_core.init.serena_task",
        "rotaris_core.config.loader",
        "yaml",
        "tiktoken_ext",
    ],
)
def test_string_imported_modules_are_declared_hidden(module_name: str) -> None:
    """These are reached with ``importlib.import_module`` at their call sites, so
    PyInstaller's import graph never arrives at them."""
    assert module_name in hidden_imports()


@verifies(SWR.SWR_3001)
def test_distribution_metadata_is_carried() -> None:
    """``rotaris_core._read_version`` reads installed metadata and degrades to
    ``0+unknown`` without it — a binary that misreports its own version."""
    carried = set(metadata_packages())
    assert {"rotaris-core", "rotaris"} <= carried


@verifies(SWR.SWR_3001, SWR.SWR_3724)
def test_metadata_closure_covers_dependencies_that_read_their_own_version() -> None:
    """Found by running the frozen binary: ``fastmcp/__init__.py`` calls
    ``importlib.metadata.version("fastmcp")`` at import time, so a bundle carrying
    only its own metadata dies with ``PackageNotFoundError`` before reaching main."""
    carried = set(metadata_packages())
    assert {"fastmcp", "openhands-sdk", "litellm", "serena-agent"} <= carried


@verifies(SWR.SWR_3724)
def test_every_bundle_collects_serenas_dynamic_package_surface() -> None:
    """Productive use: a standalone user calls any Serena language backend.
    Expected outcome: every shipped entry point asks PyInstaller to collect Serena's full package."""
    for name in ENTRY_POINTS:
        assert bundle_spec(name).collect_all_packages == ("serena",)


@verifies(SWR.SWR_3001)
def test_metadata_closure_skips_optional_extras() -> None:
    """Extra-gated requirements are not installed unless asked for; copying metadata
    for one that is absent would fail the build."""
    assert "boto3" not in set(metadata_packages())


@verifies(SWR.SWR_3001)
@pytest.mark.parametrize("name", sorted(ENTRY_POINTS))
def test_entry_point_resolves_to_a_callable(name: str) -> None:
    """Each shipped executable must actually have something to call."""
    entry = ENTRY_POINTS[name]
    module = importlib.import_module(entry.module)
    assert callable(getattr(module, entry.function))


@verifies(SWR.SWR_3001)
@pytest.mark.parametrize("name", sorted(ENTRY_POINTS))
def test_launcher_script_exists_for_every_entry_point(name: str) -> None:
    """PyInstaller freezes a script, not a console-script entry point."""
    spec = bundle_spec(name)
    assert spec.entry_script.is_file(), f"missing launcher: {spec.entry_script}"
    assert spec.name == name


@verifies(SWR.SWR_3001)
def test_desktop_entry_point_is_windowed_and_clis_are_not() -> None:
    """A console window behind the desktop app is a visible defect on Windows."""
    assert ENTRY_POINTS["rotaris"].console is False
    assert ENTRY_POINTS["rotaris-cli"].console is True
    assert ENTRY_POINTS["rotaris-headless"].console is True


@verifies(SWR.SWR_3001)
@pytest.mark.parametrize("name", sorted(ENTRY_POINTS))
def test_spec_file_is_version_controlled_for_every_entry_point(name: str) -> None:
    """AC-007: the build configuration lives with the source, not in someone's shell
    history — the build command resolves the spec by target name."""
    from rotaris_core.packaging.pyinstaller import repo_root

    assert (repo_root() / "packaging" / f"{name}.spec").is_file()


@verifies(SWR.SWR_3001)
def test_platform_installer_recipes_are_version_controlled() -> None:
    """Productive use: a maintainer can build every native installer from checkout.
    Expected outcome: each recipe and its required AppImage icon are versioned.
    """
    from rotaris_core.packaging.pyinstaller import repo_root

    packaging_dir = repo_root() / "packaging"
    assert (packaging_dir / "installer" / "rotaris.nsi").is_file()
    assert (packaging_dir / "macos" / "make_dmg.sh").is_file()
    assert (packaging_dir / "linux" / "make_appimage.sh").is_file()
    assert (packaging_dir / "linux" / "rotaris.desktop").is_file()
    assert (packaging_dir / "assets" / "rotaris.svg").is_file()


@verifies(SWR.SWR_3001)
def test_appimage_recipe_carries_the_desktop_icon() -> None:
    """Productive use: a Linux user can launch the bundled desktop from an AppImage.
    Expected outcome: the recipe supplies a valid icon matching the desktop entry.
    """
    from rotaris_core.packaging.pyinstaller import repo_root

    packaging_dir = repo_root() / "packaging"
    icon = packaging_dir / "assets" / "rotaris.svg"
    recipe = (packaging_dir / "linux" / "make_appimage.sh").read_text(encoding="utf-8")
    desktop = (packaging_dir / "linux" / "rotaris.desktop").read_text(encoding="utf-8")

    assert ET.parse(icon).getroot().tag.endswith("svg")
    assert 'cp "${ICON}" "${APPDIR}/rotaris.svg"' in recipe
    assert "Icon=rotaris" in desktop


@verifies(SWR.SWR_3001)
def test_unknown_target_names_the_valid_ones() -> None:
    with pytest.raises(ValueError, match="rotaris-cli"):
        bundle_spec("rotaris-desktop")
