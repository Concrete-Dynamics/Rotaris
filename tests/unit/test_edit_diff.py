from __future__ import annotations

from rotaris_core.edit_diff import build_edit_diff
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_1233, SWR.SWR_1240)
def test_build_edit_diff_marks_created_file_with_additions_only() -> None:
    diff = build_edit_diff(
        path="new.txt",
        operation="create",
        before_content=None,
        after_content="alpha\nbeta\n",
        created=True,
    )

    assert diff is not None
    assert diff.created is True
    assert diff.added_lines == 2
    assert diff.removed_lines == 0
    assert [entry.kind for entry in diff.entries] == ["add", "add"]
    assert [entry.line_number for entry in diff.entries] == [1, 2]


@verifies(SWR.SWR_1233, SWR.SWR_1234)
def test_build_edit_diff_keeps_context_and_line_numbers_for_replacement() -> None:
    diff = build_edit_diff(
        path="sample.txt",
        operation="edit",
        before_content="alpha\nbeta\ngamma\n",
        after_content="alpha\nBETA\ngamma\n",
    )

    assert diff is not None
    assert diff.created is False
    assert diff.added_lines == 1
    assert diff.removed_lines == 1
    assert [(entry.kind, entry.line_number, entry.text) for entry in diff.entries] == [
        ("context", 1, "alpha"),
        ("delete", 2, "beta"),
        ("add", 2, "BETA"),
        ("context", 3, "gamma"),
    ]


@verifies(SWR.SWR_1238)
def test_build_edit_diff_truncates_after_fifty_changed_lines() -> None:
    before_content = "\n".join(f"old {index}" for index in range(60)) + "\n"
    after_content = "\n".join(f"new {index}" for index in range(60)) + "\n"

    diff = build_edit_diff(
        path="bulk.txt",
        operation="overwrite",
        before_content=before_content,
        after_content=after_content,
    )

    assert diff is not None
    assert diff.truncated is True
    assert diff.remaining_changed_lines == 70
    assert len(diff.entries) == 50
    rendered_changed_lines = [entry for entry in diff.entries if entry.kind in {"add", "delete"}]
    assert len(rendered_changed_lines) == 50
    assert all(entry.kind in {"add", "delete"} for entry in diff.entries)


@verifies(SWR.SWR_1241)
def test_build_edit_diff_returns_none_for_no_change() -> None:
    assert (
        build_edit_diff(
            path="same.txt",
            operation="overwrite",
            before_content="alpha\nbeta\n",
            after_content="alpha\nbeta\n",
        )
        is None
    )
