"""Productive use: a user launches the copy of Rotaris they installed, and it works
out whether a newer one exists and which file that copy could actually use.
Expected outcome: a pip install is never told to download anything; each frozen
flavour recognises itself; only a strictly newer released version is offered; and
the file offered is the one this installation can install."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.packaging.release import artifact_name, checksum_lines
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.updates.check import (
    Asset,
    Install,
    InstallKind,
    Release,
    asset_for,
    detect_install,
    is_newer,
    parse_checksums,
    summarize,
)

if TYPE_CHECKING:
    from collections.abc import Mapping


def _frozen(monkeypatch: pytest.MonkeyPatch, *, meipass: str | None = None) -> None:
    monkeypatch.setattr("sys.frozen", True, raising=False)
    if meipass is None:
        monkeypatch.delattr("sys._MEIPASS", raising=False)
    else:
        monkeypatch.setattr("sys._MEIPASS", meipass, raising=False)


def _release(version: str, names: tuple[str, ...] = (), body: str = "") -> Release:
    return Release(
        version=version,
        body=body,
        assets=tuple(
            Asset(name=name, url=f"https://example.invalid/{name}", size=10) for name in names
        ),
    )


@verifies(SWR.SWR_3003)
def test_a_pip_install_is_never_offered_a_download(monkeypatch: pytest.MonkeyPatch) -> None:
    """AC-001. The check does not merely produce nothing here — it does not run,
    which is why every desktop test can build a window without opening a socket."""
    monkeypatch.delattr("sys.frozen", raising=False)

    install = detect_install(environ={})

    assert install.kind is InstallKind.NOT_FROZEN
    assert install.updatable is False
    assert install.target is None


@verifies(SWR.SWR_3003)
def test_an_appimage_identifies_itself_by_the_variable_its_runtime_sets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Inside an AppImage, ``sys.executable`` is a path under a temporary FUSE
    mount. ``$APPIMAGE`` is the only name that survives the process."""
    _frozen(monkeypatch, meipass="/tmp/.mount_Rotarisabc")
    environ: Mapping[str, str] = {"APPIMAGE": "/home/dev/Apps/Rotaris.AppImage"}

    install = detect_install(argv0="/tmp/.mount_Rotarisabc/usr/bin/rotaris", environ=environ)

    assert install.kind is InstallKind.APPIMAGE
    assert install.target == Path("/home/dev/Apps/Rotaris.AppImage")


@verifies(SWR.SWR_3003)
def test_a_macos_bundle_is_found_from_the_executable_inside_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """What an update would replace is the ``.app`` directory, not the binary
    three levels down inside it."""
    _frozen(monkeypatch, meipass="/Applications/Rotaris.app/Contents/MacOS")

    install = detect_install(argv0="/Applications/Rotaris.app/Contents/MacOS/rotaris", environ={})

    assert install.kind is InstallKind.MACOS_APP
    assert install.target == Path("/Applications/Rotaris.app")


@verifies(SWR.SWR_3003)
def test_the_portable_exe_and_the_installed_tree_are_told_apart(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Both are ``rotaris.exe`` on Windows and their update strategies share
    nothing. onefile unpacks itself somewhere else and says so in ``_MEIPASS``;
    onedir does not (AC-011)."""
    installed = tmp_path / "Rotaris"
    installed.mkdir()
    executable = installed / "rotaris.exe"

    _frozen(monkeypatch, meipass=str(tmp_path / "_MEI12345"))
    portable = detect_install(argv0=str(executable), environ={})

    _frozen(monkeypatch, meipass=str(installed))
    onedir = detect_install(argv0=str(executable), environ={})

    assert portable.kind is InstallKind.WINDOWS_PORTABLE
    assert portable.target == executable
    assert onedir.kind is InstallKind.WINDOWS_INSTALLER
    assert onedir.target == installed


@pytest.mark.parametrize(
    ("candidate", "running", "expected"),
    [
        ("v0.102.0", "0.101.0", True),
        ("v0.101.1", "0.101.0", True),
        ("v1.0.0", "0.101.0", True),
        ("v0.101.0", "0.101.0", False),
        ("v0.100.0", "0.101.0", False),
        # Rejected by the tag grammar rather than by a rule restated here (AC-004).
        ("v0.102.0-rc1", "0.101.0", False),
        ("v0.102", "0.101.0", False),
        # No installed metadata: the question cannot be answered, so it is not.
        ("v0.102.0", "dev", False),
    ],
)
@verifies(SWR.SWR_3003)
def test_only_a_strictly_newer_release_is_offered(
    candidate: str, running: str, expected: bool
) -> None:
    assert is_newer(candidate, running) is expected


@pytest.mark.parametrize(
    ("kind", "expected_kind", "platform"),
    [
        (InstallKind.WINDOWS_INSTALLER, "setup", "windows-x64"),
        (InstallKind.WINDOWS_PORTABLE, "portable", "windows-x64"),
        (InstallKind.MACOS_APP, "dmg", "macos-arm64"),
        (InstallKind.APPIMAGE, "appimage", "linux-x86_64"),
    ],
)
@verifies(SWR.SWR_3003)
def test_each_flavour_is_offered_the_file_it_can_install(
    kind: InstallKind, expected_kind: str, platform: str
) -> None:
    """The names come from the release module the workflow uploaded with, so this
    also fails if a rename lands on one side only."""
    complete = _release(
        "1.2.3",
        tuple(
            artifact_name(art, plat, "1.2.3")
            for art, plat in (
                ("setup", "windows-x64"),
                ("portable", "windows-x64"),
                ("dmg", "macos-arm64"),
                ("appimage", "linux-x86_64"),
            )
        ),
    )

    asset = asset_for(Install(kind, Path("/somewhere")), complete)

    assert asset is not None
    assert asset.name == artifact_name(expected_kind, platform, "1.2.3")


@verifies(SWR.SWR_3003)
def test_a_release_missing_this_platform_offers_nothing() -> None:
    """A release whose Windows leg failed genuinely has no file for a Windows
    user (SWR-3002 AC-003). Saying so beats a button that downloads a 404."""
    partial = _release("1.2.3", (artifact_name("appimage", "linux-x86_64", "1.2.3"),))

    assert asset_for(Install(InstallKind.WINDOWS_INSTALLER, Path("C:/Rotaris")), partial) is None
    assert asset_for(Install(InstallKind.NOT_FROZEN), partial) is None


@verifies(SWR.SWR_3003)
def test_the_published_checksums_parse_back_into_what_the_release_wrote(
    tmp_path: Path,
) -> None:
    """``checksum_lines`` writes the manifest and ``parse_checksums`` reads it.
    A format change on either side has to break this rather than a download."""
    first = tmp_path / "Rotaris-1.2.3-linux-x86_64.AppImage"
    first.write_bytes(b"appimage bytes")
    second = tmp_path / "rotaris-cli-1.2.3-linux-x86_64.tar.gz"
    second.write_bytes(b"archive bytes")

    digests = parse_checksums(checksum_lines([first, second]))

    assert set(digests) == {first.name, second.name}
    assert all(len(digest) == 64 for digest in digests.values())


@verifies(SWR.SWR_3003)
def test_a_malformed_checksum_line_is_skipped_not_guessed_at() -> None:
    digests = parse_checksums("abc123  good.bin\n\nnonsense\nsomehash \nzzz  \n")

    assert digests == {"good.bin": "abc123"}


@verifies(SWR.SWR_3003)
def test_the_summary_skips_the_scaffolding_and_finds_the_first_real_change() -> None:
    """AC-008. The release body SWR-3002 generates opens with a heading, a table
    and a blockquote; none of them tell the user what changed."""
    body = (
        "## Rotaris 1.2.3\n\nBuilt from tag `v1.2.3`.\n\n"
        "| Artifact | SHA256 |\n| --- | --- |\n| `x` | `y` |\n\n"
        "> **Not built in this release: Windows (x64).**\n\n"
        "## Changes\n\n- feat: group tool calls by default\n- fix: something else\n"
    )

    assert summarize(body) == "feat: group tool calls by default"


@verifies(SWR.SWR_3003)
def test_a_long_first_change_is_shortened_and_an_empty_body_yields_nothing() -> None:
    assert summarize("") == ""
    assert summarize("## Only a heading\n") == ""
    long_line = "- " + "a" * 400
    shortened = summarize(long_line, limit=40)
    assert len(shortened) == 40
    assert shortened.endswith("…")
