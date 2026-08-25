"""The one place this tool shells out to git.

A single substitutable entry point keeps every git-dependent check testable
without a fixture repository.
"""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    #: A substitutable git call: ``(args, cwd) -> (exit code, combined output)``.
    GitRunner = Callable[[Sequence[str], Path], tuple[int, str]]

#: How long a git call may take before we report a failure instead of hanging.
GIT_TIMEOUT_SECONDS = 30.0


def run_git(args: Sequence[str], cwd: Path) -> tuple[int, str]:
    """Run one git command, returning its exit code and combined output."""
    try:
        completed = subprocess.run(  # noqa: S603
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, str(exc)
    return completed.returncode, (completed.stdout + completed.stderr).strip()
