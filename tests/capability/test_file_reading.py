from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.capability.harness import run_capability_task

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig

_SAMPLE_DATA = """\
Alice,30,Engineer
Bob,25,Designer
Charlie,35,Manager
Diana,28,Developer
Eve,32,Analyst
"""


@pytest.mark.asyncio
async def test_reads_file_and_creates_summary(
    capability_config: RotarisConfig,
    capability_workspace: Path,
) -> None:
    data_file = capability_workspace / "data.csv"
    data_file.write_text(_SAMPLE_DATA)

    task = (
        "Read the file 'data.csv' in the workspace root. "
        "Count the number of non-empty lines. "
        "Create a new file called 'summary.txt' containing only that number."
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

    summary_file = capability_workspace / "summary.txt"
    assert summary_file.exists(), "summary.txt was not created"

    content = summary_file.read_text().strip()
    assert "5" in content, f"Expected '5' in summary.txt, got: {content!r}"
