"""Productive use: a release artifact carries one notice bundle that covers the
Python packages, the bundled fonts and the tools Rotaris downloads later.
Expected outcome: the generator writes that bundle into the desktop assets from a
fresh checkout; the PyInstaller data walk carries it into the build; the release
workflow runs the generator before anything is frozen; and development-only
packages stay out of the inventory."""

from __future__ import annotations

import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path

import yaml

from rotaris_core.packaging.pyinstaller import collect_datas, repo_root
from rotaris_core.reqtocode import SWR, verifies

_GENERATOR = Path("packaging") / "third_party_licences.py"
_BUNDLE = Path("apps") / "rotaris" / "src" / "rotaris" / "assets" / "THIRD-PARTY-LICENSES.txt"
_BUNDLED_ASSET_NAMES = ("JetBrains Mono", "Manrope", "Space Grotesk", "Phosphor Icons")


def _run_generator(root: Path, output: Path) -> None:
    """Run the real generator in this environment, the way the release job does."""
    result = subprocess.run(  # noqa: S603
        [sys.executable, str(root / _GENERATOR), "-o", str(output)],  # noqa: S607
        cwd=root,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    assert result.returncode == 0, f"generator failed:\n{result.stdout}\n{result.stderr}"


@verifies(SWR.SWR_3720)
def test_the_generator_inventories_the_runtime_closure(tmp_path: Path) -> None:
    """One run produces the normalized inventory: Python packages from the real
    ``uv export`` closure plus the bundled assets and the provisioned tools."""
    root = repo_root()
    output = tmp_path / "THIRD-PARTY-LICENSES.txt"

    _run_generator(root, output)

    text = output.read_text(encoding="utf-8")
    for name in _BUNDLED_ASSET_NAMES:
        assert name in text
    assert "Bundled desktop assets" in text
    assert "Tools provisioned after installation" in text
    assert "not bundled in the installer" in text


@verifies(SWR.SWR_3720)
def test_development_only_packages_stay_out_of_the_inventory(tmp_path: Path) -> None:
    """AC-004: packages used only during development or CI (test runners, linters,
    type checkers) are not shipped and must not appear in the notice bundle."""
    output = tmp_path / "THIRD-PARTY-LICENSES.txt"

    _run_generator(repo_root(), output)

    text = output.read_text(encoding="utf-8")
    for dev_only in ("pytest-qt", "pytest-xdist", "mypy", "ruff"):
        assert dev_only not in text


@verifies(SWR.SWR_3720)
def test_the_bundled_notice_bundle_exists_in_the_checkout() -> None:
    """AC-006/AC-007: the generated bundle is committed next to the shipped fonts,
    so the desktop app always has one to open from About & Legal, offline."""
    bundle = repo_root() / _BUNDLE

    assert bundle.is_file(), "run `uv run python packaging/third_party_licences.py`"
    text = bundle.read_text(encoding="utf-8")
    for name in _BUNDLED_ASSET_NAMES:
        assert name in text


@verifies(SWR.SWR_3720)
def test_the_data_walk_carries_the_bundle_into_the_artifact() -> None:
    """AC-006: the mechanism that puts files into the PyInstaller artifact — the
    package data walk — already includes the notice bundle, because it lives in
    the desktop assets directory."""
    datas = collect_datas()

    bundled = [
        (source, dest) for source, dest in datas if source.endswith("THIRD-PARTY-LICENSES.txt")
    ]
    assert bundled, "the notice bundle is not walked into the artifact"
    source, dest = bundled[0]
    assert Path(source).is_file()
    assert "rotaris" in dest


@verifies(SWR.SWR_3720)
def test_the_release_workflow_runs_the_generator_before_freezing() -> None:
    """AC-003: the release pipeline is where the generator's exit code blocks a
    platform — the step must sit before the PyInstaller builds."""
    workflow_path = repo_root() / ".github" / "workflows" / "release.yml"
    document = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    build_job = document["jobs"]["build"]
    steps = build_job["steps"]

    by_name = {step.get("name"): step for step in steps if isinstance(step, Mapping)}
    generator_step = by_name["Third-party licence inventory"]
    assert "uv run python packaging/third_party_licences.py" in generator_step["run"]

    run_lines = [step.get("run", "") for step in steps if isinstance(step, Mapping)]
    generator_index = next(
        index for index, line in enumerate(run_lines) if "packaging/third_party_licences.py" in line
    )
    build_index = next(
        index for index, line in enumerate(run_lines) if "packaging build rotaris" in line
    )
    assert generator_index < build_index
