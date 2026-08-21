from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.capability.harness import run_capability_task

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig


@pytest.mark.asyncio
async def test_creates_python_package_with_multiple_files(
    capability_config: RotarisConfig,
    capability_workspace: Path,
) -> None:
    task = (
        "Create a Python package directory called 'mathlib' in the workspace root. "
        "Inside it, create two files:\n"
        "1. __init__.py that imports 'add' and 'multiply' from mathlib.operations\n"
        "2. operations.py with two functions: "
        "'add(a, b)' that returns a + b, and 'multiply(a, b)' that returns a * b"
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

    pkg_dir = capability_workspace / "mathlib"
    assert pkg_dir.is_dir(), "mathlib/ directory not created"

    init_file = pkg_dir / "__init__.py"
    assert init_file.exists(), "mathlib/__init__.py not created"
    init_content = init_file.read_text()
    assert "add" in init_content, f"'add' not imported in __init__.py:\n{init_content}"
    assert "multiply" in init_content, f"'multiply' not imported in __init__.py:\n{init_content}"

    ops_file = pkg_dir / "operations.py"
    assert ops_file.exists(), "mathlib/operations.py not created"
    ops_content = ops_file.read_text()
    assert "def add" in ops_content, f"add function missing in operations.py:\n{ops_content}"
    assert "def multiply" in ops_content, (
        f"multiply function missing in operations.py:\n{ops_content}"
    )
