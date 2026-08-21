"""Whether a newer Rotaris exists, and which file this copy would need (SWR-3003).

Reading half of the updater. Everything here is a question with an answer that
can be wrong in a way the user notices:

- *is this even an installed binary?* — a pip install must never be told to
  download an AppImage (AC-001);
- *which artifact does **this** copy need?* — "the Windows one" is not an answer;
  the portable executable and the installer are both Windows and swapping them
  produces an update that cannot be applied (AC-009);
- *is that release actually newer?* — including the release that is the same
  version, and the pre-release that must never be offered (AC-004);
- *did the network say no?* — in any of the four ways it says no, all of which
  must leave the application starting normally and silently (AC-002, AC-003).

The artifact names are not restated here. They come from
:mod:`~rotaris_core.packaging.release`, which is what the release workflow used
to upload them — one naming authority, or the updater downloads a 404.

This package sits *outside* ``rotaris_core.packaging`` on purpose: that one is
stdlib-only because SWR-3002's ``guard`` job imports it on a bare runner with no
dependencies installed, and this module needs an HTTP client.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

from rotaris_core.packaging.release import CHECKSUM_FILE, artifact_name, version_from_tag
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping

_log = logging.getLogger(__name__)

#: Where the desktop asks about itself. Public so the runbook and the tests name
#: the same URL the shipped binary uses.
LATEST_RELEASE_URL = "https://api.github.com/repos/theUpsider/Rotaris/releases/latest"

#: AC-002. Ten seconds is the ceiling the requirement names; a launch-time check
#: that takes longer than that has already failed at being unobtrusive.
REQUEST_TIMEOUT_SECONDS = 10.0


class InstallKind(StrEnum):
    """How this copy of Rotaris was installed — the axis that decides everything.

    Not the operating system: Windows ships two flavours whose update strategies
    have nothing in common, and telling them apart is the whole point (AC-011).
    """

    #: Unpacked by the NSIS installer into %LOCALAPPDATA%\\Rotaris (onedir).
    WINDOWS_INSTALLER = "windows_installer"
    #: The single-file portable executable the user put wherever they liked.
    WINDOWS_PORTABLE = "windows_portable"
    #: Rotaris.app, however the user placed it.
    MACOS_APP = "macos_app"
    #: Running from an AppImage; the outer file is named by $APPIMAGE.
    APPIMAGE = "appimage"
    #: pip, uv, or a source checkout. Never checks for updates (AC-001).
    NOT_FROZEN = "not_frozen"


#: Install flavour -> the artifact kind :func:`artifact_name` should be asked for,
#: and the platform key that names it. ``NOT_FROZEN`` is absent by construction.
_ASSET_FOR_KIND: dict[InstallKind, tuple[str, str]] = {
    InstallKind.WINDOWS_INSTALLER: ("setup", "windows-x64"),
    InstallKind.WINDOWS_PORTABLE: ("portable", "windows-x64"),
    InstallKind.MACOS_APP: ("dmg", "macos-arm64"),
    InstallKind.APPIMAGE: ("appimage", "linux-x86_64"),
}


@dataclass(frozen=True)
class Install:
    """The running installation, as far as the updater needs to know it."""

    kind: InstallKind
    #: The thing an update would replace: the AppImage file, the portable exe, the
    #: install directory, or the .app bundle. ``None`` when not frozen.
    target: Path | None = None

    @property
    def updatable(self) -> bool:
        return self.kind is not InstallKind.NOT_FROZEN


@dataclass(frozen=True)
class Asset:
    """One downloadable file attached to a release."""

    name: str
    url: str
    size: int = 0


@dataclass(frozen=True)
class Release:
    """The published release this copy is being compared against."""

    version: str
    body: str = ""
    assets: tuple[Asset, ...] = field(default_factory=tuple)

    def asset(self, name: str) -> Asset | None:
        return next((asset for asset in self.assets if asset.name == name), None)

    @property
    def checksums(self) -> Asset | None:
        """The release's own ``SHA256SUMS.txt`` — what AC-010 verifies against."""
        return self.asset(CHECKSUM_FILE)


class Fetcher(Protocol):
    """Reads a URL. Substituted in tests, and the reason none of them need a network.

    ``stream`` yields the body in chunks so a 400 MB download does not have to be
    held in memory to be written to disk.
    """

    def get(self, url: str) -> tuple[int, bytes]: ...

    def stream(self, url: str, *, chunk_size: int) -> Iterator[bytes]: ...


@traces(SWR.SWR_3003)
def detect_install(
    *, argv0: str | None = None, environ: Mapping[str, str] | None = None
) -> Install:
    """Identify the running installation from the markers it actually carries.

    Order matters. ``$APPIMAGE`` is checked first because inside an AppImage
    ``sys.executable`` points into the FUSE mount under ``/tmp`` — a path that
    disappears when the process ends and that nothing can usefully replace.
    """
    env = environ if environ is not None else os.environ
    if not getattr(sys, "frozen", False):
        return Install(InstallKind.NOT_FROZEN)

    appimage = env.get("APPIMAGE", "").strip()
    if appimage:
        return Install(InstallKind.APPIMAGE, Path(appimage))

    executable = Path(argv0 if argv0 is not None else sys.executable)
    bundle = _macos_bundle(executable)
    if bundle is not None:
        return Install(InstallKind.MACOS_APP, bundle)

    # onefile extracts itself to a temporary directory and points ``_MEIPASS``
    # there; onedir leaves it equal to the executable's own directory. That
    # difference is the only reliable way to tell the portable download from the
    # installed tree, both of which are ``rotaris.exe`` on Windows.
    meipass = getattr(sys, "_MEIPASS", "")
    if meipass and Path(meipass).resolve() != executable.parent.resolve():
        return Install(InstallKind.WINDOWS_PORTABLE, executable)
    return Install(InstallKind.WINDOWS_INSTALLER, executable.parent)


def _macos_bundle(executable: Path) -> Path | None:
    """The enclosing ``.app`` directory, or None when there is not one."""
    for parent in executable.parents:
        if parent.suffix == ".app":
            return parent
    return None


@traces(SWR.SWR_3003)
def is_newer(candidate: str, running: str) -> bool:
    """Is ``candidate`` (a release tag) newer than the ``running`` version?

    Both sides go through :func:`version_from_tag`, so a pre-release tag is not
    "filtered" here — it never parses, and AC-004's rule stays the one grammar
    SWR-3002 already enforces. A running version of ``dev`` (no installed
    metadata) is likewise unanswerable, and unanswerable means no notification.
    """
    try:
        new = _numeric(candidate)
        current = _numeric(running)
    except ValueError:
        return False
    return new > current


def _numeric(version: str) -> tuple[int, ...]:
    tag = version if version.startswith("v") else f"v{version}"
    return tuple(int(part) for part in version_from_tag(tag).split("."))


@traces(SWR.SWR_3003)
def asset_for(install: Install, release: Release) -> Asset | None:
    """The release asset this installation can actually apply.

    ``None`` is a real answer, not a failure: a release whose Windows leg failed
    (SWR-3002 AC-003) genuinely has no file for a Windows user, and offering an
    "Update now" button that 404s would be worse than saying so.
    """
    mapping = _ASSET_FOR_KIND.get(install.kind)
    if mapping is None:
        return None
    kind, platform = mapping
    return release.asset(artifact_name(kind, platform, release.version))


@traces(SWR.SWR_3003)
def parse_checksums(text: str) -> dict[str, str]:
    """``SHA256SUMS.txt`` back into ``{filename: hash}``.

    The inverse of :func:`~rotaris_core.packaging.release.checksum_lines`, and
    tested as such: the release writes this file and the updater reads it, so a
    format change on either side has to break a test rather than a download.
    """
    digests: dict[str, str] = {}
    for line in text.splitlines():
        entry = line.strip()
        if not entry:
            continue
        digest, separator, name = entry.partition("  ")
        if not separator or not name.strip():
            continue
        digests[name.strip()] = digest.strip().lower()
    return digests


@traces(SWR.SWR_3003)
def summarize(body: str, *, limit: int = 160) -> str:
    """First actual change from a release body, for the notification (AC-008).

    A release body written by SWR-3002 opens with a heading, the tag it was built
    from, an artifact table, and possibly a missing-platform warning — none of
    which answer "what is different?". When the body carries a ``## Changes``
    heading, the search starts after it; otherwise it falls back to the first
    line that is not scaffolding, which is the best a hand-written body allows.
    """
    lines = body.splitlines()
    for index, raw in enumerate(lines):
        if raw.strip().lower().lstrip("# ").startswith("changes"):
            lines = lines[index + 1 :]
            break
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(("#", "|", ">", "```")):
            continue
        line = line.removeprefix("- ").removeprefix("* ").strip()
        if not line:
            continue
        return line if len(line) <= limit else line[: limit - 1].rstrip() + "…"
    return ""


@traces(SWR.SWR_3003)
def latest_release(
    *, fetcher: Fetcher | None = None, url: str = LATEST_RELEASE_URL
) -> Release | None:
    """The latest published release, or ``None`` if the question cannot be answered.

    Every failure is ``None`` and a log line (AC-002, AC-003). There is no error
    path to the user here by design: an update check is something the application
    does on its own initiative, and a launch that opens with "could not reach
    GitHub" would be the check making the user's problem out of its own.

    ``None`` is also the honest answer today — this repository has no release, and
    the API returns 404 until the first tag is pushed.
    """
    client = fetcher if fetcher is not None else HttpFetcher()
    try:
        status, payload = client.get(url)
    except Exception as exc:  # noqa: BLE001 — every transport failure is the same answer
        _log.info("Update check could not reach %s: %s", url, exc)
        return None
    if status != 200:
        _log.info("Update check returned HTTP %s from %s", status, url)
        return None
    try:
        document = json.loads(payload)
    except (ValueError, UnicodeDecodeError) as exc:
        _log.info("Update check received an unreadable response from %s: %s", url, exc)
        return None
    return _release_from(document)


def _release_from(document: Any) -> Release | None:
    """A ``Release`` from the API payload, or ``None`` if it is not one.

    Drafts and pre-releases are dropped here as well as by the tag grammar: the
    API flags them explicitly and a draft is not something a user can download.
    """
    if not isinstance(document, dict):
        return None
    if document.get("draft") or document.get("prerelease"):
        return None
    tag = document.get("tag_name")
    if not isinstance(tag, str):
        return None
    try:
        version = version_from_tag(tag)
    except ValueError:
        return None
    body = document.get("body")
    assets: list[Asset] = []
    for entry in document.get("assets") or ():
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        url = entry.get("browser_download_url")
        if isinstance(name, str) and isinstance(url, str):
            size = entry.get("size")
            assets.append(Asset(name=name, url=url, size=size if isinstance(size, int) else 0))
    return Release(
        version=version,
        body=body if isinstance(body, str) else "",
        assets=tuple(assets),
    )


class HttpFetcher:
    """The real :class:`Fetcher`, over httpx.

    ``follow_redirects`` is not optional: a release asset URL answers 302 and
    points at ``objects.githubusercontent.com``, so without it every download is
    a few hundred bytes of redirect body that then fails its checksum.
    """

    def __init__(self, *, timeout: float = REQUEST_TIMEOUT_SECONDS) -> None:
        self._timeout = timeout

    def get(self, url: str) -> tuple[int, bytes]:
        import httpx

        with httpx.Client(timeout=self._timeout, follow_redirects=True) as client:
            response = client.get(url, headers={"Accept": "application/vnd.github+json"})
            return response.status_code, response.content

    def stream(self, url: str, *, chunk_size: int) -> Iterator[bytes]:
        import httpx

        with (
            httpx.Client(timeout=self._timeout, follow_redirects=True) as client,
            client.stream("GET", url) as response,
        ):
            response.raise_for_status()
            yield from response.iter_bytes(chunk_size)
