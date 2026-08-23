"""Productive use: release operators prove the artifacts users download start correctly.
Expected outcome: already-built native artifacts expose versions and preserve installer contracts."""

from __future__ import annotations

import os
import platform
import subprocess
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies

pytestmark = [pytest.mark.integration, pytest.mark.serial]


def _artifact_dir() -> Path:
    configured = os.environ.get("ROTARIS_NATIVE_ARTIFACT_DIR")
    return Path(configured) if configured else Path("dist")


def _required(path: Path) -> Path:
    if os.environ.get("ROTARIS_RUN_NATIVE_SMOKE") != "1":
        pytest.skip("set ROTARIS_RUN_NATIVE_SMOKE=1 after building release artifacts")
    if not path.exists():
        pytest.fail(f"required native artifact is missing: {path}")
    return path


def _version() -> str:
    from rotaris_core import __version__

    return __version__


@verifies(SWR.SWR_3001, SWR.SWR_3715)
def test_native_desktop_artifact_version_smoke(tmp_path: Path) -> None:
    """Productive use: a user launches the desktop artifact for their platform.
    Expected outcome: its native executable reports the release version before GUI setup."""
    root = _artifact_dir()
    system = platform.system()
    if system == "Windows":
        executable = _required(root / f"Rotaris-{_version()}-windows-x64-portable.exe")
        command = [str(executable), "--version"]
    elif system == "Darwin":
        dmg = _required(root / f"Rotaris-{_version()}-macos-arm64.dmg")
        mount = tmp_path / "mount"
        mount.mkdir()
        subprocess.run(["hdiutil", "attach", str(dmg), "-mountpoint", str(mount)], check=True)
        try:
            executable = mount / "rotaris.app" / "Contents" / "MacOS" / "rotaris"
            arch = subprocess.run(
                ["file", str(executable)], capture_output=True, text=True, check=True
            )
            assert "arm64" in arch.stdout
            command = [str(executable), "--version"]
            result = subprocess.run(command, capture_output=True, text=True, timeout=30, check=True)
        finally:
            subprocess.run(["hdiutil", "detach", str(mount)], check=True)
        assert _version() in result.stdout
        return
    else:
        executable = _required(root / f"Rotaris-{_version()}-linux-x86_64.AppImage")
        executable.chmod(executable.stat().st_mode | 0o100)
        command = [str(executable), "--version"]
    result = subprocess.run(command, capture_output=True, text=True, timeout=30, check=True)
    assert _version() in result.stdout


@verifies(SWR.SWR_3001, SWR.SWR_3715)
def test_bundled_cli_and_headless_version_smoke() -> None:
    """Productive use: an operator invokes both console hosts from the shipped archive.
    Expected outcome: CLI and headless executables start and report the same release version."""
    root = _artifact_dir()
    suffix = ".exe" if platform.system() == "Windows" else ""
    platform_key = {
        "Windows": "windows-x64",
        "Darwin": "macos-arm64",
        "Linux": "linux-x86_64",
    }[platform.system()]
    archive_root = _required(root / f"rotaris-cli-{_version()}-{platform_key}")
    for name in ("rotaris-cli", "rotaris-headless"):
        executable = archive_root / f"{name}{suffix}"
        result = subprocess.run(
            [str(executable), "version"], capture_output=True, text=True, timeout=30, check=True
        )
        assert _version() in result.stdout


@verifies(SWR.SWR_3724)
def test_bundled_desktop_serena_entry_smoke() -> None:
    """Productive use: a standalone user starts a default Serena-backed agent.
    Expected outcome: the desktop artifact's internal Serena CLI starts from bundled bytes."""
    root = _artifact_dir()
    suffix = ".exe" if platform.system() == "Windows" else ""
    executable = _required(root / "rotaris" / f"rotaris{suffix}")

    subprocess.run(
        [
            str(executable),
            "--rotaris-run-bundled-serena",
            "start-mcp-server",
            "--help",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    license_files = list(
        (root / "rotaris" / "_internal").glob("serena_agent-*.dist-info/licenses/LICENSE")
    )
    assert len(license_files) == 1


@verifies(SWR.SWR_3001, SWR.SWR_3715)
@pytest.mark.skipif(platform.system() != "Windows", reason="NSIS acceptance is Windows-specific")
def test_windows_silent_install_and_uninstall(tmp_path: Path) -> None:
    """Productive use: a Windows user installs per-user and can remove the product cleanly.
    Expected outcome: executable, shortcut, registration, launch, and silent uninstall all work."""
    import winreg

    root = _artifact_dir()
    installer = _required(root / f"Rotaris-{_version()}-windows-x64-setup.exe")
    install_dir = tmp_path / "Rotaris"
    subprocess.run([str(installer), "/S", f"/D={install_dir}"], check=True, timeout=120)
    executable = install_dir / "rotaris.exe"
    assert executable.is_file()
    result = subprocess.run(
        [str(executable), "--version"], capture_output=True, text=True, check=True
    )
    assert _version() in result.stdout
    shortcut = (
        Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Rotaris/Rotaris.lnk"
    )
    assert shortcut.is_file()
    with winreg.OpenKey(
        winreg.HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Rotaris",
    ) as key:
        assert winreg.QueryValueEx(key, "DisplayVersion")[0] == _version()
    subprocess.run([str(install_dir / "Uninstall.exe"), "/S"], check=True, timeout=120)
    assert not executable.exists()
    assert not shortcut.exists()
