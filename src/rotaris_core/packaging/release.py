"""What a tagged release is made of (SWR-3002).

The release pipeline is a GitHub Actions workflow, but the parts of it that can
be *wrong* do not live in YAML:

- the tag and both ``pyproject.toml`` versions must agree, or the run stops
  before it builds anything (AC-006);
- every artifact needs a name a user can recognise and a SHA256 they can check
  (AC-004);
- a release with a failed platform must still ship, and must say what is missing
  rather than quietly listing three artifacts where four belong (AC-003).

Each of those is a function here with a unit test, because the alternative — a
``run:`` block — is untestable until a tag is pushed, and a tag cannot be
unpushed. The workflow calls this module; it does not reimplement it.

Stdlib-only, like :mod:`~rotaris_core.packaging.pyinstaller`: it runs on a bare
runner before dependencies are installed.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import tomllib
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence
    from pathlib import Path

#: Stable and PEP 440 prerelease tags that publish native artifacts (AC-001).
TAG_PATTERN = re.compile(r"^v(?P<version>\d+\.\d+\.\d+(?P<prerelease>(?:a|b|rc)\d+)?)$")

#: The two distributions that release together under one tag (AC-006).
PACKAGE_MANIFESTS: dict[str, str] = {
    "rotaris-core": "pyproject.toml",
    "rotaris": "apps/rotaris/pyproject.toml",
}


@dataclass(frozen=True)
class Platform:
    """One leg of the build matrix and the artifacts it owns."""

    #: Stable key: appears in the artifact names and as the upload-artifact name.
    key: str
    #: GitHub Actions runner label.
    runner: str
    #: Human name for the release body.
    label: str
    #: Artifact kinds this platform produces, in listing order.
    kinds: tuple[str, ...]


#: The matrix, as data rather than as YAML — :mod:`tests.integration.test_release_pipeline`
#: holds ``release.yml`` to it, so a runner can never drift away from the names
#: the release body promises.
#:
#: Windows ARM64 and Intel macOS are absent on purpose: PySide6 publishes no
#: ``win_arm64`` wheel, and universal2 needs universal2 wheels for every native
#: dependency (SWR-3001 AC-005). Both are deferred, not forgotten.
PLATFORMS: tuple[Platform, ...] = (
    Platform(
        key="windows-x64",
        runner="windows-latest",
        label="Windows (x64)",
        kinds=("setup", "portable", "cli"),
    ),
    Platform(
        key="macos-arm64",
        runner="macos-latest",
        label="macOS (Apple Silicon)",
        kinds=("dmg", "cli"),
    ),
    Platform(
        # Pinned, not ``-latest``: the AppImage is only as portable as the glibc
        # it was linked against, so a runner upgrade must not silently raise the
        # floor for users (AC-002).
        key="linux-x86_64",
        runner="ubuntu-24.04",
        label="Linux (x64)",
        kinds=("appimage", "cli"),
    ),
)

#: Artifact kind -> (filename stem template, suffix). ``{version}`` and
#: ``{platform}`` are filled in by :func:`artifact_name`.
_ARTIFACT_KINDS: dict[str, tuple[str, str]] = {
    "setup": ("Rotaris-{version}-{platform}-setup", ".exe"),
    "portable": ("Rotaris-{version}-{platform}-portable", ".exe"),
    "dmg": ("Rotaris-{version}-{platform}", ".dmg"),
    "appimage": ("Rotaris-{version}-{platform}", ".AppImage"),
    # The console entry points travel as one archive per platform rather than as
    # loose executables: a onedir build is a tree, not a file.
    "cli": ("rotaris-cli-{version}-{platform}", ""),
}

#: Checksum manifest attached to every release.
CHECKSUM_FILE = "SHA256SUMS.txt"

_NO_PREVIOUS_TAG = "First release — no previous tag to compare against."


class VersionMismatchError(Exception):
    """The tag and the declared package versions disagree (AC-006)."""


class GitRunner(Protocol):
    """Reads history for the changelog. Substituted in tests."""

    def __call__(self, args: Sequence[str], *, cwd: Path) -> str: ...


def _git(args: Sequence[str], *, cwd: Path) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return ""
    return result.stdout


@traces(SWR.SWR_3002)
def version_from_tag(ref: str) -> str:
    """Version carried by a release tag, accepting a bare tag or a full ref.

    Raises ``ValueError`` naming what was rejected. The workflow's tag glob
    already filters most inputs, while this parser enforces the exact stable and
    prerelease grammar with an actionable log message.
    """
    tag = ref.removeprefix("refs/tags/").strip()
    match = TAG_PATTERN.match(tag)
    if match is None:
        raise ValueError(
            f"{tag!r} is not a release tag; expected v<major>.<minor>.<patch> "
            "with an optional a<number>, b<number>, or rc<number> suffix"
        )
    return match.group("version")


@traces(SWR.SWR_3002)
def release_channel(version: str) -> str:
    """Return the GitHub release channel for an accepted product version."""
    match = TAG_PATTERN.fullmatch(f"v{version}")
    if match is None:
        raise ValueError(f"{version!r} is not a supported product version")
    return "prerelease" if match.group("prerelease") else "stable"


@traces(SWR.SWR_3002)
def declared_versions(root: Path) -> dict[str, str]:
    """The version each package declares, keyed by distribution name.

    Raises ``FileNotFoundError`` when a manifest is missing — a checkout without
    ``apps/rotaris/pyproject.toml`` cannot release the desktop package, and
    finding that out during the publish step is too late.
    """
    versions: dict[str, str] = {}
    for distribution, relative in PACKAGE_MANIFESTS.items():
        manifest = root / relative
        if not manifest.is_file():
            raise FileNotFoundError(f"no manifest for {distribution} at {manifest}")
        data = tomllib.loads(manifest.read_text(encoding="utf-8"))
        version = data.get("project", {}).get("version")
        if not isinstance(version, str):
            raise ValueError(f"{manifest} declares no [project] version")
        versions[distribution] = version
    return versions


@traces(SWR.SWR_3002)
def verify_versions(ref: str, root: Path) -> str:
    """Check the tag against both manifests and return the agreed version.

    Raises :class:`VersionMismatchError` listing *every* value, not just the first
    disagreement: the maintainer's next action is editing whichever file is
    behind, and a message naming one of three numbers makes them go looking.
    """
    version = version_from_tag(ref)
    versions = declared_versions(root)
    disagreeing = {name: found for name, found in versions.items() if found != version}
    if disagreeing:
        declared = ", ".join(
            f"{name} {found} ({PACKAGE_MANIFESTS[name]})"
            for name, found in sorted(versions.items())
        )
        raise VersionMismatchError(
            f"tag {version} does not match the declared versions: {declared}. "
            "Rotaris releases one product version: bump both manifests to the tag."
        )
    return version


@traces(SWR.SWR_3002)
def artifact_name(kind: str, platform: str, version: str) -> str:
    """Release-asset filename for one artifact.

    The single naming authority: the NSIS script, the DMG and AppImage wrappers,
    the upload steps and the release body all have to agree, and they only do
    because they all come from here.
    """
    try:
        stem, suffix = _ARTIFACT_KINDS[kind]
    except KeyError:
        known = ", ".join(sorted(_ARTIFACT_KINDS))
        raise ValueError(f"unknown artifact kind {kind!r}; expected one of: {known}") from None
    if kind == "cli":
        # Windows ships a zip because that is what Explorer opens without help.
        suffix = ".zip" if platform.startswith("windows") else ".tar.gz"
    return stem.format(version=version, platform=platform) + suffix


@traces(SWR.SWR_3002)
def expected_artifacts(version: str) -> dict[str, tuple[str, ...]]:
    """Every artifact a complete release carries, keyed by platform."""
    return {
        platform.key: tuple(artifact_name(kind, platform.key, version) for kind in platform.kinds)
        for platform in PLATFORMS
    }


@traces(SWR.SWR_3002)
def sha256(path: Path) -> str:
    """SHA256 of a file, read in chunks — release artifacts are hundreds of MB."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@traces(SWR.SWR_3002)
def checksum_lines(paths: Iterable[Path]) -> str:
    """``SHA256SUMS.txt`` body: ``<hash>  <name>``, sorted, one per line.

    The two-space separator is the ``sha256sum -c`` format, so a user can verify
    a download with the tool they already have instead of eyeballing a hash.
    """
    entries = sorted((path.name, sha256(path)) for path in paths)
    return "".join(f"{digest}  {name}\n" for name, digest in entries)


@traces(SWR.SWR_3002)
def changelog(version: str, root: Path, *, runner: GitRunner | None = None) -> str:
    """Commit subjects since the previous release tag (AC-004).

    Falls back to a plain statement when there is no earlier tag rather than
    dumping the entire history — the first release would otherwise ship a
    thousand-line body.
    """
    git = runner or _git
    previous = git(["describe", "--tags", "--abbrev=0", f"v{version}^"], cwd=root).strip()
    if not previous:
        return _NO_PREVIOUS_TAG
    log = git(["log", "--no-merges", "--pretty=format:- %s", f"{previous}..v{version}"], cwd=root)
    entries = [line for line in log.splitlines() if line.strip()]
    if not entries:
        return f"No commits since {previous}."
    return f"Changes since {previous}:\n\n" + "\n".join(entries)


@traces(SWR.SWR_3002)
def release_notes(
    version: str,
    *,
    present: Iterable[Path],
    changes: str,
) -> str:
    """The GitHub Release body.

    Built from the artifacts that actually arrived, so a platform whose build
    failed produces an honest release rather than a silently short one (AC-003).
    The missing platforms are named — a user on that platform needs to know the
    download is absent, not infer it from a list they cannot check.
    """
    files = sorted(present, key=lambda path: path.name)
    by_name = {path.name: path for path in files}
    expected = expected_artifacts(version)
    missing = [
        platform
        for platform in PLATFORMS
        if not any(name in by_name for name in expected[platform.key])
    ]

    lines = [f"## Rotaris {version}", "", f"Built from tag `v{version}`.", ""]

    if files:
        lines += ["| Artifact | SHA256 |", "| --- | --- |"]
        lines += [
            f"| `{path.name}` | `{sha256(path)}` |" for path in files if path.name != CHECKSUM_FILE
        ]
        lines.append("")

    if missing:
        names = ", ".join(platform.label for platform in missing)
        lines += [
            f"> **Not built in this release: {names}.** Those builds failed; the "
            "artifacts above are unaffected. Use the previous release for the "
            "missing platforms.",
            "",
        ]

    lines += [
        "Verify a download with `sha256sum -c SHA256SUMS.txt` (or `Get-FileHash` on Windows).",
        "",
        "The binaries are unsigned: Windows SmartScreen and macOS Gatekeeper warn on first launch.",
        "",
        "## Changes",
        "",
        changes,
        "",
    ]
    return "\n".join(lines)
