"""Cross-platform child-process preparation for user-facing hosts."""

from __future__ import annotations

import os
import subprocess
import sys
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

_WINDOWS_BATCH_SUFFIXES = {".bat", ".cmd"}
_CREATE_NO_WINDOW = 0x08000000


@traces(SWR.SWR_3727)
def hidden_process_kwargs(*, platform: str | None = None) -> dict[str, Any]:
    """Return subprocess options that keep desktop child tools invisible."""
    active_platform = sys.platform if platform is None else platform
    if active_platform != "win32":
        return {}
    return {
        "creationflags": getattr(subprocess, "CREATE_NO_WINDOW", _CREATE_NO_WINDOW),
    }


@traces(SWR.SWR_3727)
def prepare_child_command(
    command: Sequence[str | os.PathLike[str]],
    *,
    platform: str | None = None,
    environ: Mapping[str, str] | None = None,
) -> tuple[list[str] | str, dict[str, Any]]:
    """Prepare an argv and launch options for a quiet cross-platform child.

    Windows delegates batch launchers such as ``npx.cmd`` to ``cmd.exe``. A
    direct ``CreateProcess`` call cannot execute those scripts reliably from a
    windowed PyInstaller host. The package warm-up arguments are retained in one
    quoted command line while the same hidden-process flag suppresses the command
    processor's console window.
    """
    argv = [os.fspath(part) for part in command]
    if not argv:
        raise ValueError("command must contain an executable")
    active_platform = sys.platform if platform is None else platform
    options = hidden_process_kwargs(platform=active_platform)
    suffix = os.path.splitext(argv[0])[1].lower()
    if active_platform == "win32" and suffix in _WINDOWS_BATCH_SUFFIXES:
        environment = os.environ if environ is None else environ
        command_processor = environment.get("COMSPEC") or "cmd.exe"
        processor = subprocess.list2cmdline([command_processor])
        batch_line = subprocess.list2cmdline(argv)
        return f'{processor} /d /s /c "{batch_line}"', options
    return argv, options
