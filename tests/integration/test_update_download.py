"""Productive use: the user clicks "Update now" and either ends up with a newer
Rotaris on disk or with exactly the one they started with.
Expected outcome: the whole path — read the release's own checksum file, stream
the asset through the shipped HTTP client, hash it, install it — works end to end
against a real filesystem, and a single altered byte anywhere in it stops the
update without touching the installation."""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx
import pytest
import respx

from rotaris_core.packaging.release import CHECKSUM_FILE, artifact_name, checksum_lines
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.updates.apply import (
    BACKUP_SUFFIX,
    IntegrityError,
    Outcome,
    apply_update,
    checksums_for,
    stage,
    verify,
)
from rotaris_core.updates.check import Asset, HttpFetcher, Install, InstallKind, Release

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

VERSION = "0.102.0"
ASSET_URL = "https://github.invalid/download/asset"
MANIFEST_URL = "https://github.invalid/download/SHA256SUMS.txt"


def _publish(tmp_path: Path, kind: str, platform: str, payload: bytes) -> Release:
    """Serve a release the way GitHub does: an asset, and a manifest describing it."""
    name = artifact_name(kind, platform, VERSION)
    artifact = tmp_path / "published" / name
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_bytes(payload)
    manifest = checksum_lines([artifact]).encode("utf-8")

    respx.get(ASSET_URL).mock(return_value=httpx.Response(200, content=payload))
    respx.get(MANIFEST_URL).mock(return_value=httpx.Response(200, content=manifest))
    return Release(
        version=VERSION,
        body=f"## Rotaris {VERSION}\n\n## Changes\n\n- feat: something\n",
        assets=(
            Asset(name=name, url=ASSET_URL, size=len(payload)),
            Asset(name=CHECKSUM_FILE, url=MANIFEST_URL, size=len(manifest)),
        ),
    )


class RecordingLauncher:
    def __init__(self) -> None:
        self.commands: list[tuple[str, ...]] = []

    def __call__(self, command: Sequence[str]) -> None:
        self.commands.append(tuple(command))


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_verified_appimage_replaces_the_installed_one(tmp_path: Path) -> None:
    """The complete flow for the one flavour that can update itself outright."""
    payload = b"AI\x02" + b"new release" * 5000
    release = _publish(tmp_path, "appimage", "linux-x86_64", payload)
    asset = release.asset(artifact_name("appimage", "linux-x86_64", VERSION))
    assert asset is not None
    installed = tmp_path / "Apps" / "Rotaris.AppImage"
    installed.parent.mkdir()
    installed.write_bytes(b"the version the user is running")
    fetcher = HttpFetcher()
    seen: list[int] = []

    digests = checksums_for(release, fetcher=fetcher)
    staged = stage(
        asset,
        dest=tmp_path / "staging",
        fetcher=fetcher,
        on_progress=lambda received, _total: seen.append(received),
    )
    verify(staged, digests.get(asset.name))
    applied = apply_update(Install(InstallKind.APPIMAGE, installed), staged)

    assert installed.read_bytes() == payload
    assert applied.outcome is Outcome.REPLACED
    assert applied.relaunch == installed
    assert seen and seen[-1] == len(payload)


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_tampered_download_leaves_the_installation_exactly_as_it_was(
    tmp_path: Path,
) -> None:
    """AC-010, AC-012. The manifest describes the published bytes; the asset URL
    serves different ones. Nothing is renamed, moved, or launched."""
    release = _publish(tmp_path, "appimage", "linux-x86_64", b"the published bytes")
    respx.get(ASSET_URL).mock(return_value=httpx.Response(200, content=b"something else"))
    asset = release.asset(artifact_name("appimage", "linux-x86_64", VERSION))
    assert asset is not None
    installed = tmp_path / "Apps" / "Rotaris.AppImage"
    installed.parent.mkdir()
    installed.write_bytes(b"the version the user is running")
    fetcher = HttpFetcher()

    digests = checksums_for(release, fetcher=fetcher)
    staged = stage(asset, dest=tmp_path / "staging", fetcher=fetcher)

    with pytest.raises(IntegrityError, match="nothing was installed"):
        verify(staged, digests.get(asset.name))

    assert installed.read_bytes() == b"the version the user is running"
    assert not staged.exists()
    assert list((tmp_path / "Apps").iterdir()) == [installed]


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_verified_portable_exe_swaps_itself_and_keeps_the_old_one(tmp_path: Path) -> None:
    """The flavour whose file cannot be overwritten while it runs: the outgoing
    executable is still on disk under its backup name when this finishes."""
    payload = b"MZ" + b"portable" * 1000
    release = _publish(tmp_path, "portable", "windows-x64", payload)
    asset = release.asset(artifact_name("portable", "windows-x64", VERSION))
    assert asset is not None
    installed = tmp_path / "Portable" / "rotaris.exe"
    installed.parent.mkdir()
    installed.write_bytes(b"the running executable")
    fetcher = HttpFetcher()

    digests = checksums_for(release, fetcher=fetcher)
    staged = stage(asset, dest=tmp_path / "staging", fetcher=fetcher)
    verify(staged, digests.get(asset.name))
    apply_update(Install(InstallKind.WINDOWS_PORTABLE, installed), staged)

    assert installed.read_bytes() == payload
    assert installed.with_name(installed.name + BACKUP_SUFFIX).read_bytes() == (
        b"the running executable"
    )


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_verified_installer_is_handed_the_job_and_the_tree_is_untouched(
    tmp_path: Path,
) -> None:
    """AC-011. Rotaris does not edit its own install directory; it starts the
    installer that owns it and reports that it has to close."""
    payload = b"MZ" + b"installer" * 1000
    release = _publish(tmp_path, "setup", "windows-x64", payload)
    asset = release.asset(artifact_name("setup", "windows-x64", VERSION))
    assert asset is not None
    installed = tmp_path / "Local" / "Rotaris"
    (installed / "_internal").mkdir(parents=True)
    (installed / "rotaris.exe").write_bytes(b"running")
    launcher = RecordingLauncher()
    fetcher = HttpFetcher()

    digests = checksums_for(release, fetcher=fetcher)
    staged = stage(asset, dest=tmp_path / "staging", fetcher=fetcher)
    verify(staged, digests.get(asset.name))
    applied = apply_update(
        Install(InstallKind.WINDOWS_INSTALLER, installed), staged, launcher=launcher
    )

    assert launcher.commands == [(str(staged),)]
    assert applied.quit_required is True
    assert (installed / "rotaris.exe").read_bytes() == b"running"
    assert (installed / "_internal").is_dir()
