from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import sys
from typing import TYPE_CHECKING, Literal, NamedTuple

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path


EditorKind = Literal["env", "xdg-open", "open", "start", "none"]


class EditorLaunchResult(NamedTuple):
    launched: bool
    command: str | None
    error: str | None
    editor_kind: EditorKind | None


@traces(SWR.SWR_735, SWR.SWR_736)
def launch_editor(path: Path, *, blocking: bool = False) -> EditorLaunchResult:
    resolved = _resolve_editor(path)
    if resolved is None:
        return EditorLaunchResult(False, None, "No editor found for this platform.", "none")

    command_args, editor_kind = resolved
    command = shlex.join(command_args)

    try:
        if blocking:
            completed = subprocess.run(command_args, capture_output=True, text=True, check=False)
            if completed.returncode != 0:
                error = _format_failure(
                    f"Editor exited with status {completed.returncode}.",
                    completed.stderr,
                )
                return EditorLaunchResult(False, command, error, editor_kind)
            return EditorLaunchResult(True, command, None, editor_kind)

        subprocess.Popen(command_args)
        return EditorLaunchResult(True, command, None, editor_kind)
    except (FileNotFoundError, OSError) as exc:
        return EditorLaunchResult(False, command, str(exc), editor_kind)


def _resolve_editor(path: Path) -> tuple[list[str], EditorKind] | None:
    editor = _resolve_env_editor()
    if editor is not None:
        return editor + [str(path)], "env"

    if sys.platform.startswith("linux"):
        return _resolve_command(["xdg-open", str(path)], "xdg-open")
    if sys.platform == "darwin":
        return _resolve_command(["open", str(path)], "open")
    if sys.platform == "win32":
        if shutil.which("cmd") is None:
            return None
        return ["cmd", "/c", "start", "", str(path)], "start"
    return None


def _resolve_env_editor() -> list[str] | None:
    for name in ("EDITOR", "VISUAL"):
        raw = os.environ.get(name, "").strip()
        if not raw:
            continue
        parts = shlex.split(raw)
        if not parts:
            continue
        executable = shutil.which(parts[0])
        if executable is None:
            continue
        return [executable, *parts[1:]]
    return None


def _resolve_command(
    command_args: list[str],
    editor_kind: Literal["xdg-open", "open"],
) -> tuple[list[str], EditorKind] | None:
    executable = shutil.which(command_args[0])
    if executable is None:
        return None
    return [executable, *command_args[1:]], editor_kind


def _format_failure(message: str, stderr: str | None) -> str:
    details = stderr.strip() if stderr else ""
    if details:
        return f"{message} {details}"
    return message
