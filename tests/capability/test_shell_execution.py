from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.capability.harness import run_capability_task

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig


@pytest.mark.asyncio
async def test_runs_shell_command_and_writes_output(
    capability_config: RotarisConfig,
    capability_workspace: Path,
) -> None:
    task = (
        'Run the shell command: python3 -c "print(2 + 2)"\n'
        "Then create a file called 'answer.txt' in the workspace root "
        "containing the output of that command."
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

    answer_file = capability_workspace / "answer.txt"
    assert answer_file.exists(), "answer.txt was not created"

    content = answer_file.read_text().strip()
    assert "4" in content, f"Expected '4' in answer.txt, got: {content!r}"
