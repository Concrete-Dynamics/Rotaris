"""Productive use: a maintainer cuts a release, and a user downloads one of its
artifacts and checks it is intact.
Expected outcome: a version that does not agree across the tag and both packages
stops the pipeline with all three numbers named; every artifact has a recognisable
name and a published SHA256; and a release whose platform build failed says which
download is missing instead of quietly listing fewer files."""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

import pytest

from rotaris_core.packaging.release import (
    CHECKSUM_FILE,
    PACKAGE_MANIFESTS,
    PLATFORMS,
    VersionMismatchError,
    artifact_name,
    changelog,
    checksum_lines,
    declared_versions,
    expected_artifacts,
    release_channel,
    release_notes,
    verify_versions,
    version_from_tag,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path


def _checkout(root: Path, *, core: str, desktop: str) -> Path:
    """A checkout carrying the two manifests the version guard reads."""
    (root / "pyproject.toml").write_text(
        f'[project]\nname = "rotaris-core"\nversion = "{core}"\n', encoding="utf-8"
    )
    app = root / "apps" / "rotaris"
    app.mkdir(parents=True)
    (app / "pyproject.toml").write_text(
        f'[project]\nname = "rotaris"\nversion = "{desktop}"\n', encoding="utf-8"
    )
    return root


class FakeGit:
    """Answers the two history questions the changelog asks."""

    def __init__(self, *, previous: str = "", log: str = "") -> None:
        self.previous = previous
        self.log = log
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, args: Sequence[str], *, cwd: Path) -> str:
        self.calls.append(tuple(args))
        return self.previous if args[0] == "describe" else self.log


@verifies(SWR.SWR_3002)
def test_release_tag_yields_its_version() -> None:
    assert version_from_tag("refs/tags/v1.2.3") == "1.2.3"
    assert version_from_tag("v0.101.0") == "0.101.0"
    assert version_from_tag("refs/tags/v0.120.15a1") == "0.120.15a1"
    assert version_from_tag("v2.0.0rc3") == "2.0.0rc3"


@pytest.mark.parametrize(
    "ref",
    ["v1.2", "1.2.3", "refs/heads/master", "v1.2.3-rc1", "v1.2.3dev1", "vlatest"],
)
@verifies(SWR.SWR_3002)
def test_non_release_tags_are_rejected_with_the_reason(ref: str) -> None:
    """Productive use: a maintainer receives an actionable tag-format failure.
    Expected outcome: unsupported version spellings stop before native builds begin.
    """
    with pytest.raises(ValueError, match="release tag"):
        version_from_tag(ref)


@verifies(SWR.SWR_3002)
def test_release_channel_separates_stable_and_prerelease_publication() -> None:
    """Productive use: a maintainer can publish alpha artifacts safely.
    Expected outcome: stable versions select PyPI and alpha versions select prerelease.
    """
    assert release_channel("1.2.3") == "stable"
    assert release_channel("1.2.3a1") == "prerelease"
    assert release_channel("1.2.3b2") == "prerelease"
    assert release_channel("1.2.3rc3") == "prerelease"


@verifies(SWR.SWR_3002)
def test_matching_versions_return_the_release_version(tmp_path: Path) -> None:
    root = _checkout(tmp_path, core="1.2.3", desktop="1.2.3")

    assert verify_versions("refs/tags/v1.2.3", root) == "1.2.3"


@pytest.mark.parametrize(
    ("core", "desktop"),
    [("1.2.2", "1.2.3"), ("1.2.3", "0.17.3"), ("0.9.0", "0.9.0")],
)
@verifies(SWR.SWR_3002)
def test_a_mismatch_names_every_version(tmp_path: Path, core: str, desktop: str) -> None:
    """The next action is editing whichever file is behind, so the message names all
    three numbers — reporting only the first disagreement sends the maintainer looking."""
    root = _checkout(tmp_path, core=core, desktop=desktop)

    with pytest.raises(VersionMismatchError) as failure:
        verify_versions("v1.2.3", root)

    message = str(failure.value)
    assert core in message
    assert desktop in message
    assert "1.2.3" in message
    for manifest in PACKAGE_MANIFESTS.values():
        assert manifest in message


@verifies(SWR.SWR_3002)
def test_a_missing_manifest_names_the_path(tmp_path: Path) -> None:
    """Discovering that the desktop package cannot be built during the publish step
    is too late."""
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "rotaris-core"\nversion = "1.2.3"\n', encoding="utf-8"
    )

    with pytest.raises(FileNotFoundError, match="apps"):
        declared_versions(tmp_path)


@verifies(SWR.SWR_3002)
def test_the_repository_itself_declares_one_product_version() -> None:
    """AC-006 is a property of the checkout, not only of the guard: both packages
    must already agree, or the next tag cannot be released."""
    from rotaris_core.packaging.pyinstaller import repo_root

    versions = set(declared_versions(repo_root()).values())

    assert len(versions) == 1, f"packages declare different versions: {versions}"


@verifies(SWR.SWR_3002)
def test_every_platform_names_its_artifacts() -> None:
    """The naming is one authority: the installer script, the DMG and AppImage
    wrappers and the release body only agree because they all come from here."""
    artifacts = expected_artifacts("1.2.3")

    assert set(artifacts) == {platform.key for platform in PLATFORMS}
    assert "Rotaris-1.2.3-windows-x64-setup.exe" in artifacts["windows-x64"]
    assert "Rotaris-1.2.3-windows-x64-portable.exe" in artifacts["windows-x64"]
    assert "Rotaris-1.2.3-macos-arm64.dmg" in artifacts["macos-arm64"]
    assert "Rotaris-1.2.3-linux-x86_64.AppImage" in artifacts["linux-x86_64"]
    assert "rotaris-cli-1.2.3-windows-x64.zip" in artifacts["windows-x64"]
    assert "rotaris-cli-1.2.3-linux-x86_64.tar.gz" in artifacts["linux-x86_64"]


@verifies(SWR.SWR_3002)
def test_an_unknown_artifact_kind_is_rejected() -> None:
    with pytest.raises(ValueError, match="appimage"):
        artifact_name("msi", "windows-x64", "1.2.3")


@verifies(SWR.SWR_3002)
def test_checksums_are_the_format_sha256sum_can_verify(tmp_path: Path) -> None:
    """A user checks a download with the tool they already have, so the manifest is
    ``<hash>  <name>`` rather than something only Rotaris can read."""
    payload = b"rotaris release artifact"
    for name in ("b.AppImage", "a.dmg"):
        (tmp_path / name).write_bytes(payload)

    manifest = checksum_lines(sorted(tmp_path.iterdir()))

    digest = hashlib.sha256(payload).hexdigest()
    assert manifest == f"{digest}  a.dmg\n{digest}  b.AppImage\n"


@verifies(SWR.SWR_3002)
def test_the_first_release_has_no_history_to_diff(tmp_path: Path) -> None:
    """Without a previous tag the alternative is dumping the entire history into the
    release body."""
    notes = changelog("1.0.0", tmp_path, runner=FakeGit(previous=""))

    assert "First release" in notes


@verifies(SWR.SWR_3002)
def test_the_changelog_lists_commits_since_the_previous_tag(tmp_path: Path) -> None:
    git = FakeGit(previous="v1.1.0\n", log="- feat: add a thing\n- fix: repair another\n")

    notes = changelog("1.2.0", tmp_path, runner=git)

    assert "Changes since v1.1.0" in notes
    assert "- feat: add a thing" in notes
    assert "- fix: repair another" in notes
    assert git.calls[1][:2] == ("log", "--no-merges")
    assert "v1.1.0..v1.2.0" in git.calls[1]


@verifies(SWR.SWR_3002)
def test_release_notes_publish_a_hash_for_every_artifact(tmp_path: Path) -> None:
    artifacts = expected_artifacts("1.2.3")
    for names in artifacts.values():
        for name in names:
            (tmp_path / name).write_bytes(name.encode())
    (tmp_path / CHECKSUM_FILE).write_text("ignored\n", encoding="utf-8")

    body = release_notes(
        "1.2.3", present=sorted(tmp_path.iterdir()), changes="Changes since v1.2.2"
    )

    for names in artifacts.values():
        for name in names:
            assert f"`{name}`" in body
            assert hashlib.sha256(name.encode()).hexdigest() in body
    assert "Not built in this release" not in body
    # The manifest lists the artifacts; listing its own hash inside itself is noise.
    assert f"`{CHECKSUM_FILE}`" not in body


@verifies(SWR.SWR_3002)
def test_a_failed_platform_is_named_in_the_release(tmp_path: Path) -> None:
    """AC-003: the surviving artifacts still ship, and a user on the missing platform
    is told the download is absent rather than left to infer it."""
    artifacts = expected_artifacts("1.2.3")
    for name in artifacts["linux-x86_64"]:
        (tmp_path / name).write_bytes(b"linux")

    body = release_notes("1.2.3", present=sorted(tmp_path.iterdir()), changes="none")

    assert "Not built in this release" in body
    assert "Windows (x64)" in body
    assert "macOS (Apple Silicon)" in body
    assert "Linux (x64)" not in body
    assert "Rotaris-1.2.3-linux-x86_64.AppImage" in body


@verifies(SWR.SWR_3002)
def test_release_notes_carry_the_tag_and_the_signing_caveat(tmp_path: Path) -> None:
    """The binaries are unsigned (out of scope for SWR-3001), so the first-launch
    warning has to be explained where the user meets it."""
    body = release_notes("1.2.3", present=[], changes="Changes since v1.2.2")

    assert "`v1.2.3`" in body
    assert "unsigned" in body
    assert "SmartScreen" in body
    assert CHECKSUM_FILE in body
