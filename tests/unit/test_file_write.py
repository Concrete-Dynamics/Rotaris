"""Tests for the write_file tool executor."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.file_engine import FileToolEngine
from rotaris_core.tools.file_read import ReadFileAction, ReadFileExecutor
from rotaris_core.tools.file_write import WriteFileAction, WriteFileExecutor

if TYPE_CHECKING:
    from pathlib import Path


def _write_file(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="")


def _make_executor(tmp_path: Path) -> tuple[FileToolEngine, WriteFileExecutor]:
    engine = FileToolEngine(tmp_path)
    return engine, WriteFileExecutor(engine)


@verifies(SWR.SWR_659)
def test_create_success_creates_file_and_records_hash(tmp_path: Path) -> None:
    engine, executor = _make_executor(tmp_path)

    obs = executor(WriteFileAction(path="new.txt", command="create", content="alpha\nbeta\n"))

    assert not obs.is_error
    assert obs.success
    assert obs.path == "new.txt"
    assert obs.lines_changed == 2
    assert obs.content_hash == engine.content_hash("alpha\nbeta\n")
    assert obs.ui_diff is not None
    assert obs.ui_diff["created"] is True
    assert obs.ui_diff["added_lines"] == 2
    assert (tmp_path / "new.txt").read_text(encoding="utf-8") == "alpha\nbeta\n"
    assert str((tmp_path / "new.txt").resolve()) in engine.read_ledger


@verifies(SWR.SWR_659)
def test_write_file_schema_describes_path_and_command_parameters() -> None:
    schema = WriteFileAction.model_json_schema()

    path_description = schema["properties"]["path"]["description"]
    command_description = schema["properties"]["command"]["description"]

    assert "Use `path` as the parameter name" in path_description
    assert "not `file_path`" in path_description
    assert "`create`, `edit`, `overwrite`, `insert`, or `undo`" in command_description


@verifies(SWR.SWR_659)
def test_create_errors_for_existing_file_and_missing_content(tmp_path: Path) -> None:
    _write_file(tmp_path / "existing.txt", ["alpha"])
    _, executor = _make_executor(tmp_path)

    existing_obs = executor(
        WriteFileAction(path="existing.txt", command="create", content="beta\n"),
    )
    missing_content_obs = executor(WriteFileAction(path="other.txt", command="create"))

    assert existing_obs.is_error
    assert "File already exists: existing.txt." in existing_obs.text
    assert "overwrite" in existing_obs.text
    assert missing_content_obs.is_error
    assert missing_content_obs.text == "'content' is required for create."


@verifies(SWR.SWR_659)
def test_edit_success_with_exact_match(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["alpha", "beta", "gamma"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="beta",
            new_str="BETA",
        ),
    )

    assert not obs.is_error
    assert obs.success
    assert obs.lines_changed == 1
    assert obs.match_level == "exact"
    assert obs.occurrences_replaced == 1
    assert obs.ui_diff is not None
    assert obs.ui_diff["added_lines"] == 1
    assert obs.ui_diff["removed_lines"] == 1
    assert path.read_text(encoding="utf-8") == "alpha\nBETA\ngamma\n"


@verifies(SWR.SWR_659)
def test_edit_no_match_returns_helpful_error(tmp_path: Path) -> None:
    _write_file(tmp_path / "sample.txt", ["alpha", "beta"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="missing",
            new_str="replacement",
        ),
    )

    assert obs.is_error
    assert "old_str not found in sample.txt" in obs.text
    assert "checked: exact, whitespace-normalized, indent-adjusted, fuzzy" in obs.text
    assert "read_file" in obs.text
    assert "overwrite" in obs.text
    assert obs.ui_diff is None


@verifies(SWR.SWR_659)
def test_edit_multiple_matches_returns_error_with_guidance(tmp_path: Path) -> None:
    _write_file(tmp_path / "sample.txt", ["target", "keep", "target"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="target",
            new_str="updated",
        ),
    )

    assert obs.is_error
    assert "Found 2 occurrences of old_str at lines 1, 3." in obs.text
    assert "context" in obs.text and "old_str" in obs.text
    assert "replace_all=true" in obs.text


@verifies(SWR.SWR_630)
def test_edit_replace_all_success_replaces_every_occurrence(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["target", "keep", "target"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="target",
            new_str="updated",
            replace_all=True,
        ),
    )

    assert not obs.is_error
    assert obs.success
    assert obs.lines_changed == 2
    assert obs.match_level == "exact"
    assert obs.occurrences_replaced == 2
    assert path.read_text(encoding="utf-8") == "updated\nkeep\nupdated\n"


@verifies(SWR.SWR_659)
def test_edit_rejects_identical_old_and_new_strings(tmp_path: Path) -> None:
    _write_file(tmp_path / "sample.txt", ["alpha"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="alpha",
            new_str="alpha",
        ),
    )

    assert obs.is_error
    assert obs.text == "old_str and new_str are identical."


@verifies(SWR.SWR_659)
def test_edit_rejects_unread_file(tmp_path: Path) -> None:
    _write_file(tmp_path / "sample.txt", ["alpha"])
    _, executor = _make_executor(tmp_path)

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="alpha",
            new_str="beta",
        ),
    )

    assert obs.is_error
    assert "You must read sample.txt before editing it." in obs.text
    assert "read_file" in obs.text


@verifies(SWR.SWR_630)
def test_edit_falls_back_to_whitespace_normalized_match(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["alpha  ", "beta\t  ", "omega"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="alpha\nbeta",
            new_str="ALPHA\nBETA",
        ),
    )

    assert not obs.is_error
    assert obs.match_level == "whitespace"
    assert "Match level: whitespace. Verify the result." in obs.text
    assert path.read_text(encoding="utf-8") == "ALPHA\nBETA\nomega\n"


@verifies(SWR.SWR_630)
def test_edit_falls_back_to_indent_adjusted_match(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["    alpha", "    beta", "omega"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="alpha\nbeta",
            new_str="ALPHA\nBETA",
        ),
    )

    assert not obs.is_error
    assert obs.match_level == "indent"
    assert "Match level: indent. Verify the result." in obs.text
    assert path.read_text(encoding="utf-8") == "ALPHA\nBETA\nomega\n"


@verifies(SWR.SWR_630)
def test_edit_falls_back_to_fuzzy_match(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["print('hello world')", "omega"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="print('hello wurld')",
            new_str="print('goodbye world')",
        ),
    )

    assert not obs.is_error
    assert obs.match_level == "fuzzy"
    assert "Match level: fuzzy" in obs.text
    assert "similarity:" in obs.text
    assert path.read_text(encoding="utf-8") == "print('goodbye world')\nomega\n"


@verifies(SWR.SWR_659)
def test_overwrite_success_replaces_entire_file(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["alpha", "beta"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(path="sample.txt", command="overwrite", content="new\ncontent\n"),
    )

    assert not obs.is_error
    assert obs.success
    assert obs.lines_changed == 2
    assert obs.ui_diff is not None
    assert obs.ui_diff["added_lines"] == 2
    assert obs.ui_diff["removed_lines"] == 2
    assert path.read_text(encoding="utf-8") == "new\ncontent\n"


@verifies(SWR.SWR_659)
def test_overwrite_errors_for_missing_file_unread_file_and_missing_content(tmp_path: Path) -> None:
    unread_path = tmp_path / "unread.txt"
    missing_content_path = tmp_path / "missing_content.txt"
    _write_file(unread_path, ["alpha"])
    _write_file(missing_content_path, ["beta"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="missing_content.txt"))

    missing_file_obs = executor(
        WriteFileAction(path="missing.txt", command="overwrite", content="x\n"),
    )
    unread_obs = executor(WriteFileAction(path="unread.txt", command="overwrite", content="x\n"))
    missing_content_obs = executor(
        WriteFileAction(path="missing_content.txt", command="overwrite"),
    )

    assert missing_file_obs.is_error
    assert missing_file_obs.text == "File not found: missing.txt. Use 'create' for new files."
    assert unread_obs.is_error
    assert "You must read unread.txt before editing it." in unread_obs.text
    assert missing_content_obs.is_error
    assert missing_content_obs.text == "'content' is required for overwrite."


@verifies(SWR.SWR_659)
def test_insert_success_in_middle(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["alpha", "beta", "gamma"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="insert",
            insert_line=1,
            new_str="inserted",
        ),
    )

    assert not obs.is_error
    assert obs.success
    assert obs.lines_changed == 1
    assert obs.ui_diff is not None
    assert obs.ui_diff["added_lines"] == 1
    assert obs.ui_diff["removed_lines"] == 0
    assert path.read_text(encoding="utf-8") == "alpha\ninserted\nbeta\ngamma\n"


@verifies(SWR.SWR_659)
def test_insert_line_zero_inserts_at_beginning(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["alpha", "beta"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="sample.txt"))

    obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="insert",
            insert_line=0,
            new_str="start",
        ),
    )

    assert not obs.is_error
    assert path.read_text(encoding="utf-8") == "start\nalpha\nbeta\n"


@verifies(SWR.SWR_659)
def test_insert_errors_for_beyond_length_and_unread_file(tmp_path: Path) -> None:
    readable_path = tmp_path / "readable.txt"
    unread_path = tmp_path / "unread.txt"
    _write_file(readable_path, ["alpha", "beta"])
    _write_file(unread_path, ["alpha"])
    engine, executor = _make_executor(tmp_path)
    _ = ReadFileExecutor(engine)(ReadFileAction(path="readable.txt"))

    beyond_length_obs = executor(
        WriteFileAction(
            path="readable.txt",
            command="insert",
            insert_line=3,
            new_str="oops",
        ),
    )
    unread_obs = executor(
        WriteFileAction(
            path="unread.txt",
            command="insert",
            insert_line=1,
            new_str="oops",
        ),
    )

    assert beyond_length_obs.is_error
    assert beyond_length_obs.text == "insert_line 3 exceeds file length (2 lines)."
    assert unread_obs.is_error
    assert "You must read unread.txt before editing it." in unread_obs.text


@verifies(SWR.SWR_659)
def test_undo_success_reverts_previous_edit(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["alpha", "beta"])
    engine, executor = _make_executor(tmp_path)
    reader = ReadFileExecutor(engine)
    _ = reader(ReadFileAction(path="sample.txt"))
    edit_obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="beta",
            new_str="BETA",
        ),
    )

    undo_obs = executor(WriteFileAction(path="sample.txt", command="undo"))

    assert not edit_obs.is_error
    assert not undo_obs.is_error
    assert undo_obs.success
    assert undo_obs.ui_diff is not None
    assert undo_obs.ui_diff["added_lines"] == 1
    assert undo_obs.ui_diff["removed_lines"] == 1
    assert path.read_text(encoding="utf-8") == "alpha\nbeta\n"


@verifies(SWR.SWR_659)
def test_undo_without_history_returns_error(tmp_path: Path) -> None:
    _write_file(tmp_path / "sample.txt", ["alpha"])
    _, executor = _make_executor(tmp_path)

    obs = executor(WriteFileAction(path="sample.txt", command="undo"))

    assert obs.is_error
    assert obs.text == "No edit history for sample.txt."


@verifies(SWR.SWR_659)
def test_cross_tool_state_allows_edit_after_read_file_populates_ledger(tmp_path: Path) -> None:
    path = tmp_path / "sample.txt"
    _write_file(path, ["alpha", "beta"])
    engine, executor = _make_executor(tmp_path)
    read_executor = ReadFileExecutor(engine)

    read_obs = read_executor(ReadFileAction(path="sample.txt"))
    write_obs = executor(
        WriteFileAction(
            path="sample.txt",
            command="edit",
            old_str="beta",
            new_str="updated",
        ),
    )

    assert not read_obs.is_error
    assert str(path.resolve()) in engine.read_ledger
    assert not write_obs.is_error
    assert write_obs.success
    assert path.read_text(encoding="utf-8") == "alpha\nupdated\n"
