"""Freezing one entry point into a standalone binary (SWR-3001, AC-007).

``python -m rotaris_core.packaging build <target>`` is the public boundary: it
picks the version-controlled ``.spec`` file, hands PyInstaller the output
directories, and reports the artifact path. The external tool is reached through
an injectable *runner* so the flow can be exercised without a multi-minute build.
The argument parsing lives in :mod:`~rotaris_core.packaging.cli`, which serves
both this and the release commands.
"""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Protocol

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

from rotaris_core.packaging.pyinstaller import ENTRY_POINTS, repo_root
from rotaris_core.reqtocode import SWR, traces

BundleMode = Literal["onedir", "onefile"]

#: Read by the ``.spec`` files — PyInstaller invokes them without arguments, so
#: the mode has to travel in the environment.
BUNDLE_MODE_ENV = "ROTARIS_BUNDLE_MODE"

DEFAULT_MODE: BundleMode = "onedir"


@traces(SWR.SWR_3001)
def bundle_mode(environ: dict[str, str] | None = None) -> BundleMode:
    """Bundle mode for the current build, defaulting to ``onedir``.

    ``onefile`` re-extracts several hundred megabytes of Qt on every launch, so
    it is reserved for the portable Windows executable (AC-004); everything an
    installer, DMG or AppImage wraps stays ``onedir``.
    """
    raw = (environ if environ is not None else dict(os.environ)).get(BUNDLE_MODE_ENV, DEFAULT_MODE)
    if raw == "onedir":
        return "onedir"
    if raw == "onefile":
        return "onefile"
    raise ValueError(f"{BUNDLE_MODE_ENV} must be 'onedir' or 'onefile', got {raw!r}")


@dataclass(frozen=True)
class BuildResult:
    """What a build produced, and how it got there."""

    target: str
    mode: BundleMode
    artifact: Path
    command: tuple[str, ...]


class BuildRunner(Protocol):
    """Runs the external build tool. Substituted in tests."""

    def __call__(self, command: Sequence[str], *, env: dict[str, str], cwd: Path) -> int: ...


def _subprocess_runner(command: Sequence[str], *, env: dict[str, str], cwd: Path) -> int:
    return subprocess.run(list(command), env=env, cwd=cwd, check=False).returncode


@traces(SWR.SWR_3001)
def artifact_path(target: str, mode: BundleMode, dist_dir: Path) -> Path:
    """Where PyInstaller leaves the artifact for this target and mode."""
    suffix = ".exe" if sys.platform.startswith("win") else ""
    if mode == "onefile":
        return dist_dir / f"{target}{suffix}"
    return dist_dir / target / f"{target}{suffix}"


@traces(SWR.SWR_3001)
def build(
    target: str,
    *,
    mode: BundleMode = DEFAULT_MODE,
    output_dir: Path | None = None,
    root: Path | None = None,
    runner: BuildRunner | None = None,
) -> BuildResult:
    """Freeze one entry point and return the artifact it produced.

    Raises ``ValueError`` for an unknown target, ``FileNotFoundError`` when the
    checkout has no spec file for it, and ``RuntimeError`` when the build tool
    reports failure — each with the reason a developer needs to act on.
    """
    if target not in ENTRY_POINTS:
        known = ", ".join(sorted(ENTRY_POINTS))
        raise ValueError(f"unknown build target {target!r}; expected one of: {known}")

    checkout = root if root is not None else repo_root()
    spec_file = checkout / "packaging" / f"{target}.spec"
    if not spec_file.is_file():
        raise FileNotFoundError(f"no PyInstaller spec for {target!r} at {spec_file}")

    dist_dir = (output_dir if output_dir is not None else checkout / "dist").resolve()
    work_dir = dist_dir.parent / "build"
    command = (
        sys.executable,
        "-m",
        "PyInstaller",
        str(spec_file),
        "--noconfirm",
        "--distpath",
        str(dist_dir),
        "--workpath",
        str(work_dir),
    )

    env = dict(os.environ)
    env[BUNDLE_MODE_ENV] = mode
    exit_code = (runner or _subprocess_runner)(command, env=env, cwd=checkout)
    if exit_code != 0:
        raise RuntimeError(f"PyInstaller failed for {target!r} with exit code {exit_code}")

    return BuildResult(
        target=target, mode=mode, artifact=artifact_path(target, mode, dist_dir), command=command
    )
