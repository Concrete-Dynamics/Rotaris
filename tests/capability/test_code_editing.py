from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.capability.harness import run_capability_task

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig

_BUGGY_CALCULATOR = """\
def add(a, b):
    return a - b


def subtract(a, b):
    return a - b
"""


@pytest.mark.asyncio
async def test_fixes_bug_in_existing_file(
    capability_config: RotarisConfig,
    capability_workspace: Path,
) -> None:
    calculator = capability_workspace / "calculator.py"
    calculator.write_text(_BUGGY_CALCULATOR)

    task = (
        "The file 'calculator.py' has a bug: the 'add' function returns 'a - b' "
        "instead of 'a + b'. Fix only the add function. Do not change subtract."
    )
    result = await run_capability_task(
        task,
        capability_config,
        capability_workspace,
        max_iterations=3,
        timeout_seconds=300.0,
    )

    assert result.progress.completed_tasks >= 1, (
        f"Task not completed. stop_reason={result.progress.stop_reason}"
    )

    content = calculator.read_text()
    assert "def add" in content, "add function missing after edit"
    assert "def subtract" in content, "subtract function was removed"

    lines = content.splitlines()
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("def add"):
            body_lines = lines[i + 1 : i + 5]
            body = "\n".join(body_lines)
            assert "a + b" in body or "a+b" in body, (
                f"add function still has the bug. Body:\n{body}"
            )
            break
    else:
        pytest.fail("Could not locate add function definition")
