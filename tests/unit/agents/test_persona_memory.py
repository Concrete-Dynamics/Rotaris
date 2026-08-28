"""Unit tests for persona-specific workspace memory.

Covers REQ-20260515-POSTRUN-IMPROVE-T009/T010/T011: injection isolation,
boundedness/visibility, and manual-edit compatibility.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.agents.persona_memory import (
    MAX_PERSONA_MEMORY_LINES,
    load_persona_memory,
    persona_memory_dir,
    persona_memory_path,
    write_persona_memory,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_303, SWR.SWR_1614)
def test_persona_memory_path_under_workspace_rotaris_core(tmp_path: Path) -> None:
    path = persona_memory_path(tmp_path, "tester")
    assert path == tmp_path / ".rotaris" / "persona_memory" / "tester.md"


@verifies(SWR.SWR_303)
def test_persona_memory_rejects_path_traversal(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        persona_memory_path(tmp_path, "../escape")
    with pytest.raises(ValueError):
        persona_memory_path(tmp_path, "")
    with pytest.raises(ValueError):
        persona_memory_path(tmp_path, "with/slash")


@verifies(SWR.SWR_303)
def test_load_persona_memory_returns_none_when_missing(tmp_path: Path) -> None:
    assert load_persona_memory(tmp_path, "tester") is None


@verifies(SWR.SWR_303)
def test_load_persona_memory_returns_none_when_blank(tmp_path: Path) -> None:
    write_persona_memory(tmp_path, "tester", "   \n\n")
    assert load_persona_memory(tmp_path, "tester") is None


@verifies(SWR.SWR_303, SWR.SWR_1614)
def test_write_then_load_roundtrip(tmp_path: Path) -> None:
    content = "Run pytest with PYTHONPATH=src.\n"
    write_persona_memory(tmp_path, "tester", content)
    assert load_persona_memory(tmp_path, "tester") == content


@verifies(SWR.SWR_303, SWR.SWR_1616)
def test_write_creates_visible_workspace_local_file(tmp_path: Path) -> None:
    """REQ-T010: memory must be a visible workspace-local file."""
    path = write_persona_memory(tmp_path, "tester", "hello\n")
    assert path.is_file()
    assert path.read_text(encoding="utf-8") == "hello\n"
    # Lives under the visible workspace-config dir, not a hidden cache.
    assert path.parent == persona_memory_dir(tmp_path)


@verifies(SWR.SWR_303, SWR.SWR_1615)
def test_injection_isolation_between_personas(tmp_path: Path) -> None:
    """REQ-T009: each persona receives only its own memory by default."""
    write_persona_memory(tmp_path, "tester", "tester note\n")
    write_persona_memory(tmp_path, "worker", "worker note\n")

    assert load_persona_memory(tmp_path, "tester") == "tester note\n"
    assert load_persona_memory(tmp_path, "worker") == "worker note\n"
    assert load_persona_memory(tmp_path, "coder") is None


@verifies(SWR.SWR_303, SWR.SWR_1616)
def test_write_truncates_oversize_content(tmp_path: Path) -> None:
    """REQ-T010: enforce bound on write."""
    oversize = "\n".join(f"line {i}" for i in range(MAX_PERSONA_MEMORY_LINES + 50))
    write_persona_memory(tmp_path, "tester", oversize)
    loaded = load_persona_memory(tmp_path, "tester")
    assert loaded is not None
    assert len(loaded.splitlines()) == MAX_PERSONA_MEMORY_LINES


@verifies(SWR.SWR_303, SWR.SWR_1616)
def test_load_truncates_oversize_file_without_modifying_it(tmp_path: Path) -> None:
    """REQ-016: manual edits remain the source of truth on disk."""
    path = persona_memory_path(tmp_path, "tester")
    path.parent.mkdir(parents=True, exist_ok=True)
    oversize_lines = [f"line {i}" for i in range(MAX_PERSONA_MEMORY_LINES + 25)]
    raw = "\n".join(oversize_lines) + "\n"
    path.write_text(raw, encoding="utf-8")

    loaded = load_persona_memory(tmp_path, "tester")
    assert loaded is not None
    assert len(loaded.splitlines()) == MAX_PERSONA_MEMORY_LINES
    # File on disk unchanged — user's manual edit is preserved.
    assert path.read_text(encoding="utf-8") == raw


@verifies(SWR.SWR_303)
def test_manual_edit_is_source_of_truth(tmp_path: Path) -> None:
    """REQ-T011: direct manual edits are reflected on next load."""
    write_persona_memory(tmp_path, "tester", "original\n")
    path = persona_memory_path(tmp_path, "tester")
    path.write_text("user edited\n", encoding="utf-8")
    assert load_persona_memory(tmp_path, "tester") == "user edited\n"
