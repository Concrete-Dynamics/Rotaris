from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.file_engine import FileToolEngine
from rotaris_core.tools.file_read import ReadFileAction, ReadFileExecutor
from rotaris_core.tools.file_write import WriteFileAction, WriteFileExecutor

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_426, SWR.SWR_427, SWR.SWR_440, SWR.SWR_441)
def test_read_file_can_read_configured_skill_root_outside_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    skill_dir = tmp_path / "skill"
    skill_dir.mkdir()
    skill_file = skill_dir / "SKILL.md"
    skill_file.write_text("skill body\n", encoding="utf-8")
    engine = FileToolEngine(workspace, extra_read_roots=(skill_dir,))

    observation = ReadFileExecutor(engine)(ReadFileAction(path=str(skill_file)))

    assert observation.is_error is False
    assert "skill body" in observation.text


@verifies(SWR.SWR_441)
def test_write_file_rejects_configured_skill_root_outside_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    skill_dir = tmp_path / "skill"
    skill_dir.mkdir()
    skill_file = skill_dir / "SKILL.md"
    skill_file.write_text("skill body\n", encoding="utf-8")
    engine = FileToolEngine(workspace, extra_read_roots=(skill_dir,))

    observation = WriteFileExecutor(engine)(
        WriteFileAction(path=str(skill_file), command="overwrite", content="changed\n"),
    )

    assert observation.is_error is True
    assert "outside workspace root" in observation.text
    assert skill_file.read_text(encoding="utf-8") == "skill body\n"
