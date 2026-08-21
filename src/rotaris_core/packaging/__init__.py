"""Distribution: what goes into a frozen Rotaris, and what ships it (SWR-3001, SWR-3002).

The bundle contents are *derived* from the source tree, never hand-listed — a
list in a ``.spec`` file goes stale the first time someone adds a prompt, and the
failure only shows up in a shipped binary. :mod:`~rotaris_core.packaging.pyinstaller`
computes them; :mod:`~rotaris_core.packaging.build` runs the build;
:mod:`~rotaris_core.packaging.release` describes the release that carries the
result, so the parts of the pipeline that can be wrong are testable without
pushing a tag.
"""

from __future__ import annotations

from rotaris_core.packaging.build import BuildResult, BundleMode, build, bundle_mode
from rotaris_core.packaging.pyinstaller import (
    ENTRY_POINTS,
    BundleSpec,
    EntryPoint,
    bundle_spec,
    collect_datas,
    hidden_imports,
    metadata_packages,
)
from rotaris_core.packaging.release import (
    CHECKSUM_FILE,
    PLATFORMS,
    TAG_PATTERN,
    Platform,
    VersionMismatchError,
    artifact_name,
    changelog,
    checksum_lines,
    declared_versions,
    expected_artifacts,
    release_notes,
    verify_versions,
    version_from_tag,
)

__all__ = [
    "CHECKSUM_FILE",
    "ENTRY_POINTS",
    "PLATFORMS",
    "TAG_PATTERN",
    "BuildResult",
    "BundleMode",
    "BundleSpec",
    "EntryPoint",
    "Platform",
    "VersionMismatchError",
    "artifact_name",
    "build",
    "bundle_mode",
    "bundle_spec",
    "changelog",
    "checksum_lines",
    "collect_datas",
    "declared_versions",
    "expected_artifacts",
    "hidden_imports",
    "metadata_packages",
    "release_notes",
    "verify_versions",
    "version_from_tag",
]
