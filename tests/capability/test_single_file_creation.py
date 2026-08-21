from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.capability.harness import run_capability_task

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig


@pytest.mark.asyncio
async def test_creates_python_file_with_function(
    capability_config: RotarisConfig,
    capability_workspace: Path,
) -> None:
    task = (
        "Create a Python file called 'greet.py' in the workspace root. "
        "It must contain a function called 'greet' that takes one parameter 'name' "
        "and returns the string 'Hello, ' followed by the name followed by '!'."
    )
    result = await run_capability_task(
        task,
        capability_config,
        capability_workspace,
        max_iterations=3,
        timeout_seconds=300.0,
    )

    assert result.progress.completed_tasks >= 1, (
        f"Task not completed. stop_reason={result.progress.stop_reason} "
        f"iterations={len(result.progress.iterations)}"
    )

    greet_file = capability_workspace / "greet.py"
    assert greet_file.exists(), "greet.py was not created"

    content = greet_file.read_text()
    assert "def greet" in content, f"greet function not found in:\n{content}"
    assert "Hello" in content, f"'Hello' not found in:\n{content}"
