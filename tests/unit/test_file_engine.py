"""Tests for FileToolEngine."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.file_engine import (
    UNDO_STACK_LIMIT,
    FileToolEngine,
    MatchResult,
    ReadRecord,
)

if TYPE_CHECKING:
    from collections.abc import Iterator


def _write_file(path: Path, lines: list[str]) -> None:
    _ = path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="")


@verifies(SWR.SWR_657)
def test_resolve_path_accepts_relative_path_within_workspace(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    target = tmp_path / "nested" / "file.txt"

    assert engine.resolve_path("nested/file.txt") == target.resolve()


@verifies(SWR.SWR_657)
def test_resolve_path_accepts_absolute_path_within_workspace(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    target = tmp_path / "nested" / "file.txt"

    assert engine.resolve_path(str(target)) == target.resolve()


@verifies(SWR.SWR_657, SWR.SWR_2112, SWR.SWR_2117)
def test_resolve_path_rejects_outside_workspace_path(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    outside = tmp_path.parent / "outside.txt"

    with pytest.raises(ValueError, match="outside workspace root"):
        _ = engine.resolve_path(str(outside))


@verifies(SWR.SWR_657)
def test_resolve_path_allows_internal_symlink_and_rejects_external_symlink(
    tmp_path: Path,
) -> None:
    engine = FileToolEngine(tmp_path)
    internal_target = tmp_path / "internal.txt"
    _ = internal_target.write_text("ok", encoding="utf-8")
    internal_link = tmp_path / "internal-link.txt"
    try:
        internal_link.symlink_to(internal_target)
    except OSError as exc:
        pytest.skip(f"symlink creation is not available: {exc}")

    assert engine.resolve_path("internal-link.txt") == internal_target.resolve()

    outside_target = tmp_path.parent / "outside-target.txt"
    _ = outside_target.write_text("nope", encoding="utf-8")
    external_link = tmp_path / "external-link.txt"
    external_link.symlink_to(outside_target)

    with pytest.raises(ValueError, match="outside workspace root"):
        _ = engine.resolve_path("external-link.txt")


@verifies(SWR.SWR_632)
def test_detect_binary_distinguishes_text_and_binary_files(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    text_path = tmp_path / "plain.txt"
    _ = text_path.write_text("alpha\nbeta\n", encoding="utf-8")
    binary_path = tmp_path / "data.bin"
    _ = binary_path.write_bytes(b"abc\x00def")

    assert engine.detect_binary(text_path) is False
    assert engine.detect_binary(binary_path) is True


@verifies(SWR.SWR_632)
def test_detect_encoding_distinguishes_utf8_and_latin1(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    utf8_path = tmp_path / "utf8.txt"
    _ = utf8_path.write_text("héllo\n", encoding="utf-8")
    latin1_path = tmp_path / "latin1.txt"
    _ = latin1_path.write_bytes("café\n".encode("latin-1"))

    assert engine.detect_encoding(utf8_path) == "utf-8"
    assert engine.detect_encoding(latin1_path) == "latin-1"


@verifies(SWR.SWR_657)
def test_content_hash_returns_deterministic_sha256() -> None:
    content = "alpha\nbeta\n"
    expected = hashlib.sha256(content.encode("utf-8")).hexdigest()

    assert FileToolEngine.content_hash(content) == expected
    assert FileToolEngine.content_hash(content) == expected


@verifies(SWR.SWR_657, SWR.SWR_660)
def test_record_read_enables_check_read_before_write(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    path = tmp_path / "notes.txt"
    _write_file(path, ["alpha", "beta"])

    with pytest.raises(ValueError, match=r"read notes\.txt before editing"):
        engine.check_read_before_write(path)

    digest = engine.content_hash(path.read_text(encoding="utf-8"))
    engine.record_read(path, digest)

    record = engine.read_ledger[str(path)]
    assert isinstance(record, ReadRecord)
    assert record.content_hash == digest
    assert record.timestamp > 0
    engine.check_read_before_write(path)


@verifies(SWR.SWR_657)
def test_push_and_pop_undo_tracks_lifo_history(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    path = tmp_path / "undo.txt"

    engine.push_undo(path, "first")
    engine.push_undo(path, "second")

    assert engine.pop_undo(path) == "second"
    assert engine.pop_undo(path) == "first"
    assert engine.pop_undo(path) is None


@verifies(SWR.SWR_657)
def test_push_undo_enforces_stack_limit(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    path = tmp_path / "undo.txt"

    for index in range(UNDO_STACK_LIMIT + 2):
        engine.push_undo(path, f"version-{index}")

    assert engine.undo_stacks[str(path)] == [
        f"version-{index}" for index in range(2, UNDO_STACK_LIMIT + 2)
    ]


@verifies(SWR.SWR_657)
def test_atomic_write_creates_parent_dirs_and_cleans_temp_file(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    path = tmp_path / "nested" / "deeper" / "file.txt"

    engine.atomic_write(path, "alpha\nbeta\n")

    assert path.read_text(encoding="utf-8") == "alpha\nbeta\n"
    leftovers = [
        entry.name for entry in path.parent.iterdir() if entry.name.startswith(".file.txt.")
    ]
    assert leftovers == []


@verifies(SWR.SWR_631)
def test_list_directory_returns_sorted_entries_and_filters_ignored_dirs(
    tmp_path: Path,
) -> None:
    engine = FileToolEngine(tmp_path)
    (tmp_path / "pkg").mkdir()
    _ = (tmp_path / "zeta.txt").write_text("z", encoding="utf-8")
    (tmp_path / ".git").mkdir()
    (tmp_path / "build").mkdir()
    (tmp_path / "node_modules").mkdir()
    _ = (tmp_path / "alpha.txt").write_text("a", encoding="utf-8")

    assert engine.list_directory(tmp_path) == "alpha.txt\npkg/\nzeta.txt"


@verifies(SWR.SWR_657)
def test_list_directory_returns_empty_directory_marker(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()

    assert engine.list_directory(empty_dir) == "(empty directory)"


@verifies(SWR.SWR_657)
@pytest.mark.skipif(os.name == "nt", reason="Windows chmod does not deny directory listing")
@pytest.mark.skipif(
    hasattr(os, "geteuid") and os.geteuid() == 0,
    reason="root bypasses directory permissions, so chmod(0) still lists the entries",
)
def test_list_directory_returns_permission_denied_message(tmp_path: Path) -> None:
    engine = FileToolEngine(tmp_path)
    blocked = tmp_path / "blocked"
    blocked.mkdir()
    blocked.chmod(0)

    try:
        assert engine.list_directory(blocked) == "Permission denied: blocked."
    finally:
        blocked.chmod(0o700)


@verifies(SWR.SWR_657)
def test_list_directory_reports_permission_denied_when_the_read_is_refused(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The same outcome as the test above, without depending on who is running.

    That one needs the OS to actually refuse the listing, which root never is
    and Windows never does -- so on a container or a Windows checkout the
    message itself goes untested. Refusing the read directly keeps it covered
    on every machine.
    """
    engine = FileToolEngine(tmp_path)
    blocked = tmp_path / "blocked"
    blocked.mkdir()

    def _refuse(self: Path) -> Iterator[Path]:
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr(Path, "iterdir", _refuse)

    assert engine.list_directory(blocked) == "Permission denied: blocked."


@verifies(SWR.SWR_629, SWR.SWR_630)
def test_find_match_returns_exact_matches_for_single_and_multiple_occurrences() -> None:
    engine = FileToolEngine(Path())

    single_matches, single_count = engine.find_match("alpha\nbeta\ngamma\n", "beta\n")
    multiple_matches, multiple_count = engine.find_match("x\ny\nx\n", "x\n")

    assert single_count == 1
    assert single_matches == [MatchResult(level="exact", start=1, end=2, ratio=1.0)]
    assert multiple_count == 2
    assert multiple_matches == [
        MatchResult(level="exact", start=0, end=1, ratio=1.0),
        MatchResult(level="exact", start=2, end=3, ratio=1.0),
    ]


@verifies(SWR.SWR_630)
def test_find_match_falls_back_to_whitespace_normalized_matches() -> None:
    engine = FileToolEngine(Path())
    content = "alpha  \nbeta\t \n"
    old_str = "alpha\nbeta\n"

    matches, count = engine.find_match(content, old_str)

    assert count == 1
    assert matches == [MatchResult(level="whitespace", start=0, end=2, ratio=1.0)]


@verifies(SWR.SWR_630)
def test_find_match_falls_back_to_indent_normalized_matches() -> None:
    engine = FileToolEngine(Path())
    content = "if True:\n    alpha\n    beta\n"
    old_str = "alpha\nbeta"

    matches, count = engine.find_match(content, old_str)

    assert count == 1
    assert matches == [MatchResult(level="indent", start=1, end=3, ratio=1.0)]


@verifies(SWR.SWR_630)
def test_find_match_falls_back_to_fuzzy_match_above_threshold() -> None:
    engine = FileToolEngine(Path())
    content = "alpha\nbetx"
    old_str = "alpha\nbeta"

    matches, count = engine.find_match(content, old_str)

    assert count == 1
    assert matches[0].level == "fuzzy"
    assert matches[0].start == 0
    assert matches[0].end == 2
    assert matches[0].ratio >= 0.85


@verifies(SWR.SWR_630)
def test_find_match_returns_empty_when_no_level_matches() -> None:
    engine = FileToolEngine(Path())

    matches, count = engine.find_match("alpha\nbeta\n", "gamma\ndelta")

    assert matches == []
    assert count == 0


@verifies(SWR.SWR_659)
def test_apply_replacement_preserves_trailing_newline() -> None:
    engine = FileToolEngine(Path())
    match = MatchResult(level="exact", start=1, end=2, ratio=1.0)

    result = engine.apply_replacement("alpha\nbeta\n", "beta\n", "gamma", match)

    assert result == "alpha\ngamma\n"


@verifies(SWR.SWR_630)
def test_apply_replacement_all_replaces_multiple_occurrences() -> None:
    engine = FileToolEngine(Path())

    result, count = engine.apply_replacement_all("x\ny\nx\n", "x", "z")

    assert result == "z\ny\nz\n"
    assert count == 2


@verifies(SWR.SWR_630)
def test_apply_replacement_all_returns_original_content_when_nothing_matches() -> None:
    engine = FileToolEngine(Path())
    content = "alpha\nbeta\n"

    result, count = engine.apply_replacement_all(content, "gamma", "delta")

    assert result == content
    assert count == 0


@verifies(SWR.SWR_659)
def test_count_changed_lines_counts_line_replacements_and_insertions() -> None:
    engine = FileToolEngine(Path())

    assert engine.count_changed_lines("a\nb\nc\n", "a\nx\nc\nd\n") == 2


@verifies(SWR.SWR_633)
def test_grep_file_returns_matches_with_context_and_separators() -> None:
    engine = FileToolEngine(Path())
    content = "alpha\nneedle one\nbeta\ngamma\nomega\nneedle two\ndelta"

    output, count = engine.grep_file(content, "needle", context_lines=1)

    assert count == 2
    assert (
        output
        == "  1: alpha\n> 2: needle one\n  3: beta\n---\n  5: omega\n> 6: needle two\n  7: delta"
    )


@verifies(SWR.SWR_633)
def test_grep_file_supports_regex_patterns_and_reports_no_matches() -> None:
    engine = FileToolEngine(Path())
    content = "value=12\nlabel=ok\nvalue=34"

    output, count = engine.grep_file(content, r"value=\d+", context_lines=0)
    missing_output, missing_count = engine.grep_file(content, r"missing", context_lines=0)

    assert count == 2
    assert output == "> 1: value=12\n---\n> 3: value=34"
    assert missing_output == ""
    assert missing_count == 0


@verifies(SWR.SWR_629)
def test_find_line_numbers_for_occurrences_returns_all_line_numbers() -> None:
    engine = FileToolEngine(Path())
    content = "alpha\nbeta\nalpha\ngamma\nalpha\n"

    assert engine.find_line_numbers_for_occurrences(content, "alpha") == [1, 3, 5]
