"""Productive use: the user chose "Update now", and what happens next must either
leave them running a newer Rotaris or leave them running exactly the one they had.
Expected outcome: a download that does not match the published hash is destroyed
and installs nothing; a download that does match is installed by the one strategy
its installation flavour permits, and the result says which of "restart" or "the
installer takes it from here" the user is being asked for."""

from __future__ import annotations

import stat
import sys
from typing import TYPE_CHECKING

import pytest

from rotaris_core.packaging.release import CHECKSUM_FILE, checksum_lines, sha256
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.updates.apply import (
    BACKUP_SUFFIX,
    Applied,
    IntegrityError,
    Outcome,
    UpdateApplyError,
    apply_update,
    checksums_for,
    clear_stale_backup,
    restart,
    stage,
    verify,
)
from rotaris_core.updates.check import Asset, Install, InstallKind, Release

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence
    from pathlib import Path


class FakeFetcher:
    """Serves recorded bytes per URL, in chunks, and records what was asked for."""

    def __init__(self, bodies: dict[str, bytes], *, status: int = 200) -> None:
        self.bodies = bodies
        self.status = status
        self.requested: list[str] = []

    def get(self, url: str) -> tuple[int, bytes]:
        self.requested.append(url)
        return self.status, self.bodies.get(url, b"")

    def stream(self, url: str, *, chunk_size: int) -> Iterator[bytes]:
        self.requested.append(url)
        payload = self.bodies.get(url, b"")
        for start in range(0, len(payload), chunk_size):
            yield payload[start : start + chunk_size]


class RecordingLauncher:
    """Stands in for spawning a real installer, which a test suite does not get to do."""

    def __init__(self) -> None:
        self.commands: list[tuple[str, ...]] = []

    def __call__(self, command: Sequence[str]) -> None:
        self.commands.append(tuple(command))


def _asset(name: str, *, size: int = 0) -> Asset:
    return Asset(name=name, url=f"https://example.invalid/{name}", size=size)


@verifies(SWR.SWR_3003)
def test_a_download_is_written_with_progress_the_user_can_watch(tmp_path: Path) -> None:
    """AC-009. Progress arrives as bytes against the size the release claimed."""
    payload = b"x" * (3 * 1024 * 1024)
    asset = _asset("Rotaris-1.2.3-linux-x86_64.AppImage", size=len(payload))
    fetcher = FakeFetcher({asset.url: payload})
    seen: list[tuple[int, int]] = []

    staged = stage(
        asset,
        dest=tmp_path / "staging",
        fetcher=fetcher,
        on_progress=lambda a, b: seen.append((a, b)),
    )

    assert staged.read_bytes() == payload
    assert seen[-1] == (len(payload), len(payload))
    assert [received for received, _ in seen] == sorted(received for received, _ in seen)


@verifies(SWR.SWR_3003)
def test_a_release_with_no_checksum_file_installs_nothing(tmp_path: Path) -> None:
    """AC-010. An unverifiable download is refused rather than trusted, even
    though it came from the same place the metadata did."""
    release = Release(version="1.2.3", assets=(_asset("Rotaris-1.2.3-macos-arm64.dmg"),))

    with pytest.raises(IntegrityError, match="no checksum file"):
        checksums_for(release, fetcher=FakeFetcher({}))


@verifies(SWR.SWR_3003)
def test_an_unreadable_checksum_file_installs_nothing(tmp_path: Path) -> None:
    manifest = _asset(CHECKSUM_FILE)
    release = Release(version="1.2.3", assets=(manifest,))

    with pytest.raises(IntegrityError, match="HTTP 503"):
        checksums_for(release, fetcher=FakeFetcher({manifest.url: b""}, status=503))


@verifies(SWR.SWR_3003)
def test_the_published_hashes_are_read_from_the_release_itself(tmp_path: Path) -> None:
    artifact = tmp_path / "Rotaris-1.2.3-linux-x86_64.AppImage"
    artifact.write_bytes(b"the real bytes")
    manifest = _asset(CHECKSUM_FILE)
    release = Release(version="1.2.3", assets=(manifest,))
    fetcher = FakeFetcher({manifest.url: checksum_lines([artifact]).encode("utf-8")})

    digests = checksums_for(release, fetcher=fetcher)

    assert digests[artifact.name] == sha256(artifact)


@verifies(SWR.SWR_3003)
def test_a_tampered_download_is_deleted_and_named(tmp_path: Path) -> None:
    """AC-010, AC-012: the message has to say the installation is untouched,
    because that is the fact the user needs before deciding whether to retry."""
    staged = tmp_path / "Rotaris-1.2.3-windows-x64-setup.exe"
    staged.write_bytes(b"not what was published")

    with pytest.raises(IntegrityError, match="nothing was installed"):
        verify(staged, "0" * 64)

    assert not staged.exists()


@verifies(SWR.SWR_3003)
def test_a_download_with_no_published_hash_is_deleted(tmp_path: Path) -> None:
    staged = tmp_path / "Rotaris-1.2.3-windows-x64-setup.exe"
    staged.write_bytes(b"unlisted")

    with pytest.raises(IntegrityError, match="no published hash"):
        verify(staged, None)

    assert not staged.exists()


@verifies(SWR.SWR_3003)
def test_a_matching_download_passes_verification(tmp_path: Path) -> None:
    staged = tmp_path / "Rotaris-1.2.3-linux-x86_64.AppImage"
    staged.write_bytes(b"the real bytes")

    verify(staged, sha256(staged).upper())

    assert staged.exists(), "verification must not consume the file it approved"


@verifies(SWR.SWR_3003)
def test_an_appimage_is_replaced_in_place_and_offers_a_restart(tmp_path: Path) -> None:
    """AC-011, AC-013. The file the AppImage runtime named keeps its path; the
    process running out of the old inode is undisturbed until it restarts."""
    target = tmp_path / "Rotaris.AppImage"
    target.write_bytes(b"old release")
    staged = tmp_path / "staging" / "Rotaris-1.2.3-linux-x86_64.AppImage"
    staged.parent.mkdir()
    staged.write_bytes(b"new release")

    applied = apply_update(Install(InstallKind.APPIMAGE, target), staged)

    assert target.read_bytes() == b"new release"
    assert applied.outcome is Outcome.REPLACED
    assert applied.relaunch == target
    assert applied.quit_required is False
    assert not list(tmp_path.glob(".*.update")), "the staging copy must not be left behind"
    if sys.platform != "win32":
        assert target.stat().st_mode & stat.S_IXUSR


@verifies(SWR.SWR_3003)
def test_the_portable_exe_is_moved_aside_rather_than_overwritten(tmp_path: Path) -> None:
    """Windows refuses to overwrite a running image but allows renaming it. The
    old executable survives under its backup name until the next launch."""
    target = tmp_path / "rotaris.exe"
    target.write_bytes(b"old release")
    staged = tmp_path / "staging" / "Rotaris-1.2.3-windows-x64-portable.exe"
    staged.parent.mkdir()
    staged.write_bytes(b"new release")

    applied = apply_update(Install(InstallKind.WINDOWS_PORTABLE, target), staged)

    assert target.read_bytes() == b"new release"
    backup = target.with_name(target.name + BACKUP_SUFFIX)
    assert backup.read_bytes() == b"old release"
    assert applied.outcome is Outcome.REPLACED
    assert applied.relaunch == target


@verifies(SWR.SWR_3003)
def test_the_leftover_executable_is_cleared_on_the_next_launch(tmp_path: Path) -> None:
    target = tmp_path / "rotaris.exe"
    target.write_bytes(b"current")
    backup = target.with_name(target.name + BACKUP_SUFFIX)
    backup.write_bytes(b"previous")

    clear_stale_backup(Install(InstallKind.WINDOWS_PORTABLE, target))

    assert not backup.exists()
    assert target.exists()


@verifies(SWR.SWR_3003)
def test_nothing_is_cleared_for_a_flavour_that_never_leaves_a_backup(tmp_path: Path) -> None:
    """An installed tree has no ``.old``; a stray file of that name in an install
    directory is not this function's to delete."""
    directory = tmp_path / "Rotaris"
    directory.mkdir()
    stray = directory / "Rotaris.old"
    stray.write_bytes(b"someone else's file")

    clear_stale_backup(Install(InstallKind.WINDOWS_INSTALLER, directory))
    clear_stale_backup(Install(InstallKind.NOT_FROZEN))

    assert stray.exists()


@verifies(SWR.SWR_3003)
def test_the_windows_installer_is_started_and_rotaris_steps_aside(tmp_path: Path) -> None:
    """AC-011, AC-013. The installed tree holds DLLs this process has mapped, so
    the application closes and the installer — which already owns shortcuts and
    stale-file removal — does the work."""
    staged = tmp_path / "Rotaris-1.2.3-windows-x64-setup.exe"
    staged.write_bytes(b"installer")
    launcher = RecordingLauncher()

    applied = apply_update(
        Install(InstallKind.WINDOWS_INSTALLER, tmp_path / "Rotaris"), staged, launcher=launcher
    )

    assert launcher.commands == [(str(staged),)]
    assert applied.outcome is Outcome.HANDED_OFF
    assert applied.quit_required is True
    assert applied.relaunch is None, "there is nothing to restart into yet"


@verifies(SWR.SWR_3003)
def test_macos_opens_the_verified_image_instead_of_swapping_the_bundle(tmp_path: Path) -> None:
    """AC-011. The bundle is unsigned, so a self-applied update is one Gatekeeper
    reports as damaged; the user performs the drag on an image already checked."""
    staged = tmp_path / "Rotaris-1.2.3-macos-arm64.dmg"
    staged.write_bytes(b"disk image")
    bundle = tmp_path / "Rotaris.app"
    bundle.mkdir()
    launcher = RecordingLauncher()

    applied = apply_update(Install(InstallKind.MACOS_APP, bundle), staged, launcher=launcher)

    assert launcher.commands == [("open", str(staged))]
    assert applied.outcome is Outcome.HANDED_OFF
    assert applied.quit_required is False
    assert "Applications" in applied.message
    assert list(bundle.iterdir()) == [], "the installed bundle must not be touched"


@verifies(SWR.SWR_3003)
def test_an_installation_with_nothing_to_replace_is_refused(tmp_path: Path) -> None:
    staged = tmp_path / "whatever.bin"
    staged.write_bytes(b"x")

    with pytest.raises(UpdateApplyError, match="not installed from a released artifact"):
        apply_update(Install(InstallKind.NOT_FROZEN), staged)


@verifies(SWR.SWR_3003)
def test_restart_launches_what_was_installed_and_nothing_otherwise(tmp_path: Path) -> None:
    """AC-013. Launching and quitting are separate so a failed launch can still
    be reported in a window that still exists."""
    binary = tmp_path / "Rotaris.AppImage"
    binary.write_bytes(b"new release")
    launcher = RecordingLauncher()

    assert restart(Applied(Outcome.REPLACED, "", relaunch=binary), launcher=launcher) is True
    assert launcher.commands == [(str(binary),)]

    assert restart(Applied(Outcome.HANDED_OFF, ""), launcher=launcher) is False
    assert len(launcher.commands) == 1
