"""Productive use: someone opens the Rotaris they installed weeks ago, is told a
newer one exists, and either takes it now or is left alone until there is a
different one to be told about.
Expected outcome: the banner appears over a window that stays usable, "Remind
next launch" silences that version and only that version, "Update now" ends with
the new binary on disk and a restart on offer, and a download that fails its
checksum leaves the installation and the user's session untouched."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import QSettings
from PySide6.QtWidgets import QApplication
from rotaris_core.packaging.release import CHECKSUM_FILE, artifact_name, checksum_lines
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.updates.check import LATEST_RELEASE_URL, Install, InstallKind
from ui_query import click, settle

from rotaris.models.state import NoticeSeverity
from rotaris.models.store import WorkspaceStore
from rotaris.services.update_bridge import UpdateBridge
from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

pytestmark = pytest.mark.e2e

RUNNING = "0.101.0"
ASSET_URL = "https://github.invalid/download/appimage"
MANIFEST_URL = "https://github.invalid/download/SHA256SUMS.txt"


@pytest.fixture(autouse=True)
def named_ui_settings() -> Iterator[None]:
    """Let ``QSettings`` actually store something for the length of this test.

    A default-constructed ``QSettings`` with no organisation or application name
    reports ``AccessError`` and silently drops every write — which is what a bare
    test harness gets, because it is ``rotaris.main`` that names the application.
    Ini format so ``conftest``'s per-test path applies; the native format on
    Windows is the registry, which no test should be writing to.
    """
    previous = (
        QApplication.organizationName(),
        QApplication.applicationName(),
        QSettings.defaultFormat(),
    )
    QSettings.setDefaultFormat(QSettings.Format.IniFormat)
    QApplication.setOrganizationName("RotarisTest")
    QApplication.setApplicationName("RotarisTest")
    yield
    QApplication.setOrganizationName(previous[0])
    QApplication.setApplicationName(previous[1])
    QSettings.setDefaultFormat(previous[2])


class FakeGitHub:
    """The three URLs a full update touches, served from memory."""

    def __init__(self, bodies: dict[str, bytes]) -> None:
        self.bodies = bodies

    def get(self, url: str) -> tuple[int, bytes]:
        return (200, self.bodies[url]) if url in self.bodies else (404, b"")

    def stream(self, url: str, *, chunk_size: int) -> Iterator[bytes]:
        payload = self.bodies[url]
        for start in range(0, len(payload), chunk_size):
            yield payload[start : start + chunk_size]


def _github(tmp_path: Path, version: str, payload: bytes) -> FakeGitHub:
    name = artifact_name("appimage", "linux-x86_64", version)
    published = tmp_path / "published" / name
    published.parent.mkdir(parents=True, exist_ok=True)
    published.write_bytes(payload)
    release = {
        "tag_name": f"v{version}",
        "draft": False,
        "prerelease": False,
        "body": f"## Rotaris {version}\n\n## Changes\n\n- feat: an in-app update check\n",
        "assets": [
            {"name": name, "browser_download_url": ASSET_URL, "size": len(payload)},
            {"name": CHECKSUM_FILE, "browser_download_url": MANIFEST_URL, "size": 100},
        ],
    }
    return FakeGitHub(
        {
            LATEST_RELEASE_URL: json.dumps(release).encode("utf-8"),
            ASSET_URL: payload,
            MANIFEST_URL: checksum_lines([published]).encode("utf-8"),
        }
    )


def _installed(tmp_path: Path) -> Path:
    binary = tmp_path / "Apps" / "Rotaris.AppImage"
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_bytes(b"the version the user is running")
    return binary


def _window(qtbot) -> MainWindow:
    store = WorkspaceStore()
    store.app_version = RUNNING
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    return window


def _offer(qtbot, window: MainWindow, bridge: UpdateBridge) -> None:
    with qtbot.waitSignal(bridge.available, timeout=10_000):
        assert window.start_update_check(bridge) is True
    settle(qtbot)


@verifies(SWR.SWR_3003)
def test_a_newer_release_is_offered_without_taking_over_the_window(qtbot, tmp_path: Path) -> None:
    """AC-005, AC-006, AC-008: the version, what changed, and two ways out — on a
    banner the user can ignore while carrying on typing."""
    bridge = UpdateBridge(
        install=Install(InstallKind.APPIMAGE, _installed(tmp_path)),
        fetcher=_github(tmp_path, "0.102.0", b"new release"),
        staging=tmp_path / "staging",
    )
    window = _window(qtbot)

    _offer(qtbot, window, bridge)

    banner = window.notice_banner
    assert banner.isVisible()
    assert banner.title.text() == "Rotaris 0.102.0 is available"
    assert banner.message.text() == "feat: an in-app update check"
    assert banner.action_button.text() == "Update now"
    assert banner.dismiss_button.isVisible()
    # Nothing modal, and the window behind it still takes input.
    assert QApplication.activeModalWidget() is None
    assert window.stack.isEnabled()


@verifies(SWR.SWR_3003)
def test_remind_next_launch_silences_that_version_and_only_that_version(
    qtbot, tmp_path: Path
) -> None:
    """AC-007. Dismissal is an answer about one release, not a preference about
    being told things."""
    install = Install(InstallKind.APPIMAGE, _installed(tmp_path))
    window = _window(qtbot)
    first = UpdateBridge(install=install, fetcher=_github(tmp_path, "0.102.0", b"new release"))

    _offer(qtbot, window, first)
    click(qtbot, window.notice_banner.dismiss_button)
    settle(qtbot)

    assert not window.notice_banner.isVisible()
    assert window.store.ui.notice is None

    same = UpdateBridge(install=install, fetcher=_github(tmp_path, "0.102.0", b"new release"))
    _offer(qtbot, window, same)
    assert not window.notice_banner.isVisible(), "the dismissed version came back"

    newer = UpdateBridge(install=install, fetcher=_github(tmp_path, "0.103.0", b"newer release"))
    _offer(qtbot, window, newer)
    assert window.notice_banner.isVisible()
    assert window.notice_banner.title.text() == "Rotaris 0.103.0 is available"


@verifies(SWR.SWR_3003)
def test_dismissing_an_unrelated_notice_does_not_silence_the_update(qtbot, tmp_path: Path) -> None:
    """The banner is shared with every other notice in the application. Without
    the id check, closing an error would answer a question about updates."""
    install = Install(InstallKind.APPIMAGE, _installed(tmp_path))
    window = _window(qtbot)
    _offer(qtbot, window, UpdateBridge(install=install, fetcher=_github(tmp_path, "0.102.0", b"x")))

    window._report_error("Something else went wrong", "Unrelated to updates.")
    settle(qtbot)
    click(qtbot, window.notice_banner.dismiss_button)
    settle(qtbot)

    again = UpdateBridge(install=install, fetcher=_github(tmp_path, "0.102.0", b"x"))
    _offer(qtbot, window, again)
    assert window.notice_banner.isVisible()
    assert window.notice_banner.title.text() == "Rotaris 0.102.0 is available"


@verifies(SWR.SWR_3003)
def test_update_now_installs_the_verified_binary_and_offers_a_restart(
    qtbot, tmp_path: Path
) -> None:
    """AC-009 through AC-013, end to end: download, checksum, replace, and the
    one prompt the user is left with."""
    installed = _installed(tmp_path)
    payload = b"AI\x02the new release"
    bridge = UpdateBridge(
        install=Install(InstallKind.APPIMAGE, installed),
        fetcher=_github(tmp_path, "0.102.0", payload),
        staging=tmp_path / "staging",
    )
    window = _window(qtbot)
    _offer(qtbot, window, bridge)

    with qtbot.waitSignal(bridge.applied, timeout=20_000):
        click(qtbot, window.notice_banner.action_button)
    settle(qtbot)

    assert installed.read_bytes() == payload
    assert window.notice_banner.title.text() == "Update installed"
    assert window.notice_banner.action_button.text() == "Restart now"
    assert window.store.ui.notice is not None
    assert window.store.ui.notice.severity is NoticeSeverity.SUCCESS


@verifies(SWR.SWR_3003)
def test_a_download_that_fails_its_checksum_changes_nothing(qtbot, tmp_path: Path) -> None:
    """AC-010, AC-012. The user is told, in a notice that carries the technical
    detail, and the copy they were running is still the copy they are running."""
    installed = _installed(tmp_path)
    github = _github(tmp_path, "0.102.0", b"the published bytes")
    github.bodies[ASSET_URL] = b"something else entirely"
    bridge = UpdateBridge(
        install=Install(InstallKind.APPIMAGE, installed),
        fetcher=github,
        staging=tmp_path / "staging",
    )
    window = _window(qtbot)
    _offer(qtbot, window, bridge)

    with qtbot.waitSignal(bridge.failed, timeout=20_000):
        click(qtbot, window.notice_banner.action_button)
    settle(qtbot)

    assert installed.read_bytes() == b"the version the user is running"
    notice = window.store.ui.notice
    assert notice is not None
    assert notice.severity is NoticeSeverity.ERROR
    assert "does not match the published hash" in notice.details
    assert window.notice_banner.action_button.text() == "Try again"


@verifies(SWR.SWR_3003)
def test_a_pip_installed_rotaris_never_asks(qtbot, tmp_path: Path) -> None:
    """AC-001. Not "asks and ignores the answer" — the request is never made, which
    is what keeps every other desktop test off the network."""
    github = _github(tmp_path, "0.102.0", b"new release")
    bridge = UpdateBridge(install=Install(InstallKind.NOT_FROZEN), fetcher=github)
    window = _window(qtbot)

    assert window.start_update_check(bridge) is False
    settle(qtbot)

    assert not window.notice_banner.isVisible()
    assert window.store.ui.notice is None
