"""Downloading an update and installing it (SWR-3003).

Writing half of the updater, and the half that can damage something. Three rules
shape all of it:

1. **Nothing is moved until the replacement exists and its hash matches.** The
   download lands in a temporary directory the installation knows nothing about;
   a failed or tampered download is deleted and the user is left with exactly
   what they had (AC-010, AC-012).
2. **The strategy follows the installation flavour, not the operating system.**
   Windows ships two flavours whose only shared property is the word Windows: one
   is a file that can be renamed aside, the other a directory tree of loaded DLLs
   that only its own installer should touch (AC-011).
3. **What cannot be done is said, not simulated.** The macOS bundle is unsigned,
   so a self-applied update is a bundle Gatekeeper refuses to open; that leg
   mounts the verified image and hands the user the same drag they did on first
   install, and the result says so instead of promising a restart.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from rotaris_core.packaging.release import sha256
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.updates.check import Asset, Install, InstallKind, Release, parse_checksums

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from rotaris_core.updates.check import Fetcher

#: Read size for the download. Matches the chunk :func:`sha256` verifies with, so
#: progress ticks and hashing walk the file at the same granularity.
CHUNK_SIZE = 1024 * 1024

#: Suffix for the outgoing executable on the one platform that cannot overwrite
#: a running image. Deleted on the next launch by :func:`clear_stale_backup`.
BACKUP_SUFFIX = ".old"


class IntegrityError(Exception):
    """The download does not match the hash the release published (AC-010)."""


class UpdateApplyError(Exception):
    """The verified download could not be installed (AC-012)."""


class Outcome(StrEnum):
    """What happened, and therefore what the user is asked next."""

    #: The binary was replaced in place; offer "Restart now / Later" (AC-013).
    REPLACED = "replaced"
    #: Installation continues outside Rotaris — the installer, or Finder.
    HANDED_OFF = "handed_off"


@dataclass(frozen=True)
class Applied:
    """The result of installing an update."""

    outcome: Outcome
    #: Sentence for the user. Written here rather than in the UI because only this
    #: layer knows which of the four strategies actually ran.
    message: str
    #: True when Rotaris must close for the installation to proceed.
    quit_required: bool = False
    #: What "Restart now" should launch, when a restart is on offer.
    relaunch: Path | None = None


def _spawn(command: Sequence[str]) -> None:
    """Start a detached process that outlives this one.

    ``Popen`` without ``wait``: the installer has to keep running after Rotaris
    exits, which is the entire point of handing off to it.
    """
    subprocess.Popen(list(command), close_fds=True)  # noqa: S603


@traces(SWR.SWR_3003)
def stage(
    asset: Asset,
    *,
    dest: Path,
    fetcher: Fetcher,
    on_progress: Callable[[int, int], None] | None = None,
) -> Path:
    """Download one asset into ``dest`` and return the file.

    ``on_progress`` receives ``(bytes_so_far, total)`` — ``total`` is whatever the
    release metadata claimed, which is 0 when GitHub did not say, so a caller
    rendering a percentage has to cope with an unknown denominator rather than
    divide by zero (AC-009).
    """
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / asset.name
    received = 0
    try:
        with target.open("wb") as handle:
            for chunk in fetcher.stream(asset.url, chunk_size=CHUNK_SIZE):
                handle.write(chunk)
                received += len(chunk)
                if on_progress is not None:
                    on_progress(received, asset.size)
    except OSError as exc:
        target.unlink(missing_ok=True)
        raise UpdateApplyError(f"could not write the download to {target}: {exc}") from exc
    return target


@traces(SWR.SWR_3003)
def checksums_for(release: Release, *, fetcher: Fetcher) -> dict[str, str]:
    """The release's published hashes.

    Raises :class:`IntegrityError` when the release carries no manifest at all —
    an unverifiable download is not installed, because the alternative is running
    whatever the network handed over.
    """
    manifest = release.checksums
    if manifest is None:
        raise IntegrityError(
            f"release {release.version} publishes no checksum file; refusing to install "
            "an unverifiable download"
        )
    status, payload = fetcher.get(manifest.url)
    if status != 200:
        raise IntegrityError(f"could not read the checksum file: HTTP {status}")
    return parse_checksums(payload.decode("utf-8", errors="replace"))


@traces(SWR.SWR_3003)
def verify(path: Path, expected: str | None) -> None:
    """Check a staged download against its published hash, deleting it on failure.

    Integrity, not authenticity: nothing Rotaris ships is signed, so this proves
    the bytes are the ones the manifest names — and the manifest came down the
    same connection. It catches corruption and truncation, not an attacker who
    controls both.
    """
    if not expected:
        path.unlink(missing_ok=True)
        raise IntegrityError(f"no published hash for {path.name}; the download was discarded")
    actual = sha256(path)
    if actual != expected.lower():
        path.unlink(missing_ok=True)
        raise IntegrityError(
            f"{path.name} does not match the published hash (expected {expected.lower()}, "
            f"got {actual}); the download was discarded and nothing was installed"
        )


@traces(SWR.SWR_3003)
def apply_update(
    install: Install,
    staged: Path,
    *,
    launcher: Callable[[Sequence[str]], None] | None = None,
) -> Applied:
    """Install a verified download by the strategy this installation supports.

    ``launcher`` exists so the two hand-off strategies are testable: spawning a
    real installer is not something a test suite gets to do.
    """
    spawn = launcher if launcher is not None else _spawn
    target = install.target
    if target is None:
        raise UpdateApplyError("this Rotaris was not installed from a released artifact")

    if install.kind is InstallKind.APPIMAGE:
        return _apply_appimage(staged, target)
    if install.kind is InstallKind.WINDOWS_PORTABLE:
        return _apply_portable(staged, target)
    if install.kind is InstallKind.WINDOWS_INSTALLER:
        return _apply_installer(staged, spawn)
    if install.kind is InstallKind.MACOS_APP:
        return _apply_macos(staged, spawn)
    raise UpdateApplyError(f"{install.kind} cannot install updates")


def _apply_appimage(staged: Path, target: Path) -> Applied:
    """Replace the AppImage file named by ``$APPIMAGE``.

    Safe while running: the kernel keeps the old inode alive for the FUSE mount
    this process is executing out of, and the rename only changes what the name
    points at.
    """
    beside = _copy_beside(staged, target)
    try:
        os.replace(beside, target)
        target.chmod(0o755)
    except OSError as exc:
        beside.unlink(missing_ok=True)
        raise UpdateApplyError(f"could not replace {target}: {exc}") from exc
    return Applied(
        outcome=Outcome.REPLACED,
        message="The update is installed. Restart Rotaris to run it.",
        relaunch=target,
    )


def _apply_portable(staged: Path, target: Path) -> Applied:
    """Rename the running executable aside and move the new one into its place.

    Windows refuses to overwrite a running image but allows renaming it, which is
    the whole trick. The rename happens *after* the replacement is sitting in the
    same directory, so the window in which neither file is at the expected path is
    one filesystem operation wide.
    """
    beside = _copy_beside(staged, target)
    backup = target.with_name(target.name + BACKUP_SUFFIX)
    try:
        backup.unlink(missing_ok=True)
        target.rename(backup)
    except OSError as exc:
        beside.unlink(missing_ok=True)
        raise UpdateApplyError(f"could not move {target} aside: {exc}") from exc
    try:
        os.replace(beside, target)
    except OSError as exc:
        # Put the running executable back before reporting: a portable Rotaris
        # that lost its own file is worse than one that failed to update.
        backup.rename(target)
        beside.unlink(missing_ok=True)
        raise UpdateApplyError(f"could not install the update at {target}: {exc}") from exc
    return Applied(
        outcome=Outcome.REPLACED,
        message="The update is installed. Restart Rotaris to run it.",
        relaunch=target,
    )


def _apply_installer(staged: Path, spawn: Callable[[Sequence[str]], None]) -> Applied:
    """Hand the verified installer the job and get out of its way.

    The installed tree holds DLLs this process has mapped; the installer cannot
    write over them while Rotaris runs, so Rotaris closes first. NSIS then does
    what it already does on a fresh install, including removing files this version
    had and the next one does not.
    """
    try:
        spawn([str(staged)])
    except OSError as exc:
        raise UpdateApplyError(f"could not start the installer at {staged}: {exc}") from exc
    return Applied(
        outcome=Outcome.HANDED_OFF,
        message="Rotaris will close so the installer can replace it.",
        quit_required=True,
    )


def _apply_macos(staged: Path, spawn: Callable[[Sequence[str]], None]) -> Applied:
    """Mount the verified disk image and show it.

    Not an automatic swap: the bundle is unsigned, a self-downloaded image is
    quarantined, and a bundle installed under quarantine is one macOS reports as
    damaged. The user performs the same drag they performed the first time, on an
    image Rotaris has already checked.
    """
    try:
        spawn(["open", str(staged)])
    except OSError as exc:
        raise UpdateApplyError(f"could not open {staged}: {exc}") from exc
    return Applied(
        outcome=Outcome.HANDED_OFF,
        message="The verified disk image is open. Drag Rotaris to Applications, then reopen it.",
    )


def _copy_beside(staged: Path, target: Path) -> Path:
    """Copy the download next to what it replaces, and return the copy.

    The staging directory is a temporary one, which may be on a different
    filesystem — and ``os.replace`` is only atomic within one. Copying first means
    the replacement is a rename, not a multi-second write over the file the user
    is currently running.
    """
    beside = target.with_name(f".{target.name}.update")
    try:
        beside.unlink(missing_ok=True)
        shutil.copy2(staged, beside)
    except OSError as exc:
        raise UpdateApplyError(f"could not write the update next to {target}: {exc}") from exc
    return beside


@traces(SWR.SWR_3003)
def clear_stale_backup(install: Install) -> None:
    """Delete the executable an earlier update renamed aside.

    Runs at launch and never complains: the file is only still there because
    Windows was holding it open during the previous session, and a copy that
    cannot be removed yet will be removable next time.
    """
    if install.kind is not InstallKind.WINDOWS_PORTABLE or install.target is None:
        return
    backup = install.target.with_name(install.target.name + BACKUP_SUFFIX)
    try:
        backup.unlink(missing_ok=True)
    except OSError:
        return


@traces(SWR.SWR_3003)
def restart(applied: Applied, *, launcher: Callable[[Sequence[str]], None] | None = None) -> bool:
    """Launch the freshly installed binary. Returns False if there is nothing to launch.

    The caller quits afterwards; doing it here would end the process before the
    UI could tell the user anything if the launch failed (AC-013).
    """
    if applied.relaunch is None:
        return False
    spawn = launcher if launcher is not None else _spawn
    try:
        spawn([str(applied.relaunch)])
    except OSError as exc:
        raise UpdateApplyError(f"could not start {applied.relaunch}: {exc}") from exc
    return True
