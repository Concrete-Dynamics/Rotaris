"""Productive use: a developer builds a standalone Rotaris binary for their platform
with the one documented command, and a user runs the result without installing Python.
Expected outcome: the command reports the artifact it produced and fails loudly when it
cannot; the built binary reports its real version and starts like the pip-installed
entry point."""

from __future__ import annotations

import os
import subprocess
import sys
from typing import TYPE_CHECKING

import pytest

from rotaris_core import __version__
from rotaris_core.packaging import build, bundle_mode
from rotaris_core.packaging.build import BUNDLE_MODE_ENV, artifact_path
from rotaris_core.packaging.cli import main
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path


class RecordingRunner:
    """Stands in for PyInstaller: records the invocation, reports success."""

    def __init__(self, exit_code: int = 0) -> None:
        self.exit_code = exit_code
        self.command: tuple[str, ...] = ()
        self.env: dict[str, str] = {}
        self.cwd: Path | None = None

    def __call__(self, command: Sequence[str], *, env: dict[str, str], cwd: Path) -> int:
        self.command = tuple(command)
        self.env = env
        self.cwd = cwd
        return self.exit_code


@pytest.fixture
def checkout(tmp_path: Path) -> Path:
    """A minimal checkout carrying the three spec files the build command looks for."""
    packaging_dir = tmp_path / "packaging"
    packaging_dir.mkdir()
    for target in ("rotaris", "rotaris-cli", "rotaris-headless"):
        (packaging_dir / f"{target}.spec").write_text("# spec\n", encoding="utf-8")
    return tmp_path


@verifies(SWR.SWR_3001)
def test_build_command_reports_artifact(checkout: Path, tmp_path: Path) -> None:
    """The developer-facing flow: name a target, get the artifact path back."""
    runner = RecordingRunner()
    output = tmp_path / "dist"

    result = build("rotaris-cli", output_dir=output, root=checkout, runner=runner)

    assert result.target == "rotaris-cli"
    assert result.mode == "onedir"
    assert result.artifact.parent == output.resolve() / "rotaris-cli"
    assert str(checkout / "packaging" / "rotaris-cli.spec") in runner.command
    assert "PyInstaller" in runner.command
    assert str(output.resolve()) in runner.command


@verifies(SWR.SWR_3001)
def test_build_passes_the_bundle_mode_to_the_spec(checkout: Path, tmp_path: Path) -> None:
    """PyInstaller invokes the spec without arguments, so the onedir/onefile choice
    has to reach it through the environment."""
    runner = RecordingRunner()

    build("rotaris", mode="onefile", output_dir=tmp_path / "dist", root=checkout, runner=runner)

    assert runner.env[BUNDLE_MODE_ENV] == "onefile"
    assert bundle_mode(runner.env) == "onefile"


@verifies(SWR.SWR_3001)
def test_onefile_and_onedir_artifacts_land_in_different_places(tmp_path: Path) -> None:
    """The portable Windows executable is one file; everything an installer wraps is
    a directory (AC-004)."""
    onefile = artifact_path("rotaris", "onefile", tmp_path)
    onedir = artifact_path("rotaris", "onedir", tmp_path)

    assert onefile.parent == tmp_path
    assert onedir.parent == tmp_path / "rotaris"
    if sys.platform.startswith("win"):
        assert onefile.name == "rotaris.exe"


@verifies(SWR.SWR_3001)
def test_build_failure_is_reported_not_swallowed(checkout: Path, tmp_path: Path) -> None:
    """A failed freeze must not leave the caller believing an artifact exists."""
    with pytest.raises(RuntimeError, match="exit code 2"):
        build(
            "rotaris-cli",
            output_dir=tmp_path / "dist",
            root=checkout,
            runner=RecordingRunner(exit_code=2),
        )


@verifies(SWR.SWR_3001)
def test_missing_spec_file_names_the_path(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="rotaris-cli"):
        build("rotaris-cli", root=tmp_path, runner=RecordingRunner())


@verifies(SWR.SWR_3001)
def test_unknown_target_is_rejected_before_any_build(tmp_path: Path) -> None:
    runner = RecordingRunner()
    with pytest.raises(ValueError, match="rotaris-headless"):
        build("rotaris-tui", root=tmp_path, runner=runner)
    assert runner.command == ()


@verifies(SWR.SWR_3001)
def test_cli_rejects_an_unknown_target(capsys: pytest.CaptureFixture[str]) -> None:
    """``python -m rotaris_core.packaging`` is the documented boundary (AC-007)."""
    with pytest.raises(SystemExit) as exit_info:
        main(["build", "rotaris-tui"])
    assert exit_info.value.code == 2
    assert "rotaris-cli" in capsys.readouterr().err


@verifies(SWR.SWR_3001)
def test_bundle_mode_rejects_a_typo() -> None:
    with pytest.raises(ValueError, match="onedir"):
        bundle_mode({BUNDLE_MODE_ENV: "one-dir"})


@pytest.mark.skipif(
    os.environ.get("ROTARIS_BUILD_STANDALONE") != "1",
    reason="opt-in: a real PyInstaller build takes minutes (set ROTARIS_BUILD_STANDALONE=1)",
)
@verifies(SWR.SWR_3001)
def test_real_build_smoke(tmp_path: Path) -> None:
    """The user-facing flow, end to end: freeze ``rotaris-cli``, run the artifact, and
    check it reports the same version as the pip-installed entry point — the failure
    mode when distribution metadata does not travel with the bundle."""
    result = build("rotaris-cli", mode="onedir", output_dir=tmp_path / "dist")

    assert result.artifact.is_file(), f"no artifact at {result.artifact}"
    completed = subprocess.run(
        [str(result.artifact), "version"], capture_output=True, text=True, timeout=180
    )
    assert completed.returncode == 0, completed.stderr
    assert __version__ in completed.stdout
    assert "0+unknown" not in completed.stdout
