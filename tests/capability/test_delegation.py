from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.capability.harness import run_capability_task

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig


@pytest.mark.asyncio
async def test_orchestrator_completes_multi_part_task(
    capability_config: RotarisConfig,
    capability_workspace: Path,
) -> None:
    task = (
        "Create a Python file called 'hello.py' that prints 'Hello, World!' when run. "
        "Then run it using 'python3 hello.py' to verify it works correctly."
    )
    result = await run_capability_task(
        task,
        capability_config,
        capability_workspace,
        max_iterations=5,
        timeout_seconds=300.0,
    )

    assert result.progress.completed_tasks >= 1, (
        f"Task not completed. stop_reason={result.progress.stop_reason}"
    )

    hello_file = capability_workspace / "hello.py"
    assert hello_file.exists(), "hello.py was not created"

    content = hello_file.read_text()
    assert "Hello" in content, f"'Hello' not found in hello.py:\n{content}"
    assert "print" in content, f"print statement not found in hello.py:\n{content}"
