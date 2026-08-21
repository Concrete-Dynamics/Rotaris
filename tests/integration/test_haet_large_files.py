from pathlib import Path

from rotaris_core.haet.engine import HAETEngine
from rotaris_core.haet.hasher import line_hash
from rotaris_core.haet.patch import HAETHunk, HAETOperation, HAETPatchRequest
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_1815)
def test_large_file_read_and_edit() -> None:
    project_root = Path(__file__).resolve().parents[2]
    fixture_source = project_root / "tests/fixtures/files/large.py"
    workspace_root = project_root / "tests/integration"
    fixture_copy = workspace_root / "haet_large_copy.py"
    fixture_copy.write_text(
        fixture_source.read_text(encoding="utf-8"),
        encoding="utf-8",
        newline="",
    )

    engine = HAETEngine(workspace_root)
    fixture_path = "haet_large_copy.py"

    tagged_file = engine.read_file(fixture_path)
    assert len(tagged_file.lines) == 10000
    assert all(len(line.anchor) == 4 for line in tagged_file.lines)
    assert tagged_file.snapshot_id and tagged_file.snapshot_id != "empty"

    target_line = tagged_file.get_line_by_number(5000)
    assert target_line is not None
    before = tagged_file.get_line_by_number(4999)
    after = tagged_file.get_line_by_number(5001)
    assert before is not None
    assert after is not None

    result = engine.apply_patch(
        HAETPatchRequest(
            file_path=fixture_path,
            snapshot_id=tagged_file.snapshot_id,
            hunks=[
                HAETHunk(
                    operation=HAETOperation.REPLACE,
                    anchor=target_line.anchor,
                    anchor_line_number=5000,
                    content="value_4999 = 123456",
                ),
            ],
        ),
    )

    assert result.success is True
    assert result.new_snapshot_id is not None

    updated = engine.read_file(fixture_path)
    assert updated.get_line_by_number(4999) == before
    target = updated.get_line_by_number(5000)
    assert target is not None
    assert target.content == "value_4999 = 123456"
    assert updated.get_line_by_number(5001) == after

    engine.apply_patch(
        HAETPatchRequest(
            file_path=fixture_path,
            snapshot_id=updated.snapshot_id,
            hunks=[
                HAETHunk(
                    operation=HAETOperation.REPLACE,
                    anchor=line_hash("value_4999 = 123456"),
                    anchor_line_number=5000,
                    content=target_line.content,
                ),
            ],
        ),
    )

    fixture_copy.unlink()


@verifies(SWR.SWR_1815)
def test_duplicate_lines_resolved_by_anchor_line_number(tmp_path: Path) -> None:
    file_path = tmp_path / "duplicates.py"
    file_path.write_text("same\nunique\nsame\n", encoding="utf-8", newline="")
    engine = HAETEngine(tmp_path)

    tagged = engine.read_file("duplicates.py")
    success = engine.apply_patch(
        HAETPatchRequest(
            file_path="duplicates.py",
            snapshot_id=tagged.snapshot_id,
            hunks=[
                HAETHunk(
                    operation=HAETOperation.DELETE,
                    anchor=line_hash("same"),
                    anchor_line_number=3,
                ),
            ],
        ),
    )

    assert success.success is True
    assert file_path.read_text(encoding="utf-8").splitlines() == ["same", "unique"]


@verifies(SWR.SWR_1815)
def test_anchor_line_mismatch_rejects_with_recovery(tmp_path: Path) -> None:
    file_path = tmp_path / "duplicates.py"
    file_path.write_text("same\nunique\nsame\n", encoding="utf-8", newline="")
    engine = HAETEngine(tmp_path)
    tagged = engine.read_file("duplicates.py")

    failure = engine.apply_patch(
        HAETPatchRequest(
            file_path="duplicates.py",
            snapshot_id=tagged.snapshot_id,
            hunks=[
                HAETHunk(
                    operation=HAETOperation.DELETE,
                    anchor=line_hash("same"),
                    anchor_line_number=2,  # line 2 is "unique"
                ),
            ],
        ),
    )

    assert failure.success is False
    assert failure.errors[0].error == "anchor_line_mismatch"
    assert failure.errors[0].recovery is not None
