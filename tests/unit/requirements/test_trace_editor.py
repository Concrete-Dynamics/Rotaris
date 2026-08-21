"""Rewriting one annotation in a real file (SWR-3507).

Every case here is a shape that exists in this repository. The measurement that
produced them: 8522 annotation call sites, 2121 carrying more than one id, 53
wrapped over several lines, 1 written as the call form. The test fake this
replaces deletes the line a site names, which is right for the first shape and
destructive for the rest — so each of the rest gets a case, and so does each
refusal.

Marker tokens are assembled rather than written, so this file's own source stays
unscannable by the repository's coverage sweep.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.superseding import (
    MigrationAction,
    MigrationSite,
    SiteKind,
    TraceOperation,
)
from rotaris_core.requirements.change.trace_editor import CALL_FORM_REFUSAL, SourceTraceEditor

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

T = "traces"
V = "verifies"
SYM = "SWR.SWR_"

OLD = "SWR-501"
NEW = "SWR-601"


def source(root: Path, name: str, body: str) -> Path:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return path


def site(
    path: str, line: int, *, req_id: str = OLD, kind: SiteKind = SiteKind.TRACE
) -> MigrationSite:
    return MigrationSite(req_id=req_id, path=path, line=line, kind=kind)


def removal(path: str, line: int, **kwargs: object) -> TraceOperation:
    return TraceOperation(site=site(path, line, **kwargs), action=MigrationAction.REMOVE)  # type: ignore[arg-type]


def repoint(path: str, line: int, *, target: str = NEW, **kwargs: object) -> TraceOperation:
    return TraceOperation(
        site=site(path, line, **kwargs),  # type: ignore[arg-type]
        action=MigrationAction.RE_POINT,
        target=target,
    )


# -- the three rewrites ----------------------------------------------------


@verifies(SWR.SWR_3507)
def test_a_lone_id_takes_its_whole_annotation(tmp_path: Path) -> None:
    """Productive use: the only requirement a function claimed is superseded.
    Expected outcome: the annotation goes and the function stays — the site is the claim, not the code."""
    path = source(tmp_path, "pkg/pay.py", f"@{T}({SYM}501)\ndef pay() -> None: ...\n")

    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/pay.py", 1))

    assert edit.applied is True
    assert path.read_text(encoding="utf-8") == "def pay() -> None: ...\n"


@verifies(SWR.SWR_3507)
def test_one_id_of_several_leaves_its_siblings_alone(tmp_path: Path) -> None:
    """Productive use: a function claims three requirements and one of them is superseded.
    Expected outcome: two claims survive. The fake this replaces would have deleted all three."""
    path = source(
        tmp_path,
        "pkg/pay.py",
        f"@{T}({SYM}500, {SYM}501, {SYM}502)\ndef pay() -> None: ...\n",
    )

    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/pay.py", 1))

    assert edit.applied is True
    assert "of 3 ids" in edit.detail
    assert path.read_text(encoding="utf-8") == (
        f"@{T}({SYM}500, {SYM}502)\ndef pay() -> None: ...\n"
    )


@verifies(SWR.SWR_3507)
def test_the_first_of_several_leaves_no_stray_space(tmp_path: Path) -> None:
    """Productive use: the superseded id happens to be written first.
    Expected outcome: the annotation reads as though it had always held the rest."""
    path = source(tmp_path, "pkg/pay.py", f"@{T}({SYM}501, {SYM}502)\ndef pay() -> None: ...\n")

    SourceTraceEditor(tmp_path).apply(removal("pkg/pay.py", 1))

    assert path.read_text(encoding="utf-8").splitlines()[0] == f"@{T}({SYM}502)"


@verifies(SWR.SWR_3507)
def test_a_wrapped_annotation_keeps_its_shape(tmp_path: Path) -> None:
    """Productive use: an annotation written over several lines loses one of its ids.
    Expected outcome: one line goes, the rest stay indented as they were, and the bracket
    still closes — the case a line-delete keyed on the symbol's line cannot survive."""
    body = f"@{T}(\n    {SYM}500,\n    {SYM}501,\n    {SYM}502,\n)\ndef pay() -> None: ...\n"
    path = source(tmp_path, "pkg/pay.py", body)

    # The site names the line the *symbol* is on, which is not where the call opens.
    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/pay.py", 3))

    assert edit.applied is True
    assert path.read_text(encoding="utf-8") == (
        f"@{T}(\n    {SYM}500,\n    {SYM}502,\n)\ndef pay() -> None: ...\n"
    )


@verifies(SWR.SWR_3507)
def test_a_wrapped_annotation_holding_one_id_goes_entirely(tmp_path: Path) -> None:
    """Productive use: a wrapped annotation's last id is superseded.
    Expected outcome: all four lines go, not the one the symbol sat on."""
    path = source(
        tmp_path,
        "pkg/pay.py",
        f"@{T}(\n    {SYM}501,\n)\ndef pay() -> None: ...\n",
    )

    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/pay.py", 2))

    assert edit.applied is True
    assert path.read_text(encoding="utf-8") == "def pay() -> None: ...\n"


@verifies(SWR.SWR_3507)
def test_a_re_point_replaces_the_symbol_and_nothing_around_it(tmp_path: Path) -> None:
    """Productive use: the same code now satisfies the requirement that replaced the old one.
    Expected outcome: exactly one symbol changes; the siblings and the call are untouched."""
    path = source(
        tmp_path,
        "tests/test_pay.py",
        f"@{V}({SYM}500, {SYM}501)\ndef test_pay() -> None: ...\n",
    )

    edit = SourceTraceEditor(tmp_path).apply(
        repoint("tests/test_pay.py", 1, kind=SiteKind.TEST),
    )

    assert edit.applied is True
    assert path.read_text(encoding="utf-8").splitlines()[0] == f"@{V}({SYM}500, {SYM}601)"


# -- the refusals ----------------------------------------------------------


@verifies(SWR.SWR_3507)
def test_the_call_form_is_refused_rather_than_deleted(tmp_path: Path) -> None:
    """Productive use: a module annotates itself by applying the decorator to a name.
    Expected outcome: refused with the reason. That line is behaviour — deleting it removes
    what the module does, and no worklist row asks for that."""
    body = f"def pay() -> None: ...\n\n\n{T}({SYM}501)(pay)\n"
    path = source(tmp_path, "pkg/pay.py", body)

    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/pay.py", 4))

    assert edit.applied is False
    assert edit.detail == CALL_FORM_REFUSAL
    assert path.read_text(encoding="utf-8") == body, "a refusal changes nothing"


@verifies(SWR.SWR_3507)
def test_a_site_that_moved_is_refused_naming_the_drift(tmp_path: Path) -> None:
    """Productive use: someone edits the file between planning and executing the migration.
    Expected outcome: refused, and nothing is written — a plan aimed at a line that no longer
    claims that id must not be applied to whatever is there now."""
    body = f"@{T}({SYM}500)\ndef pay() -> None: ...\n"
    path = source(tmp_path, "pkg/pay.py", body)

    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/pay.py", 1))

    assert edit.applied is False
    assert "no annotation at pkg/pay.py:1" in edit.detail
    assert path.read_text(encoding="utf-8") == body


@verifies(SWR.SWR_3507)
def test_a_file_that_is_not_there_is_refused(tmp_path: Path) -> None:
    """Productive use: the file was deleted after the worklist was planned.
    Expected outcome: a stated refusal, not an exception that abandons the rest of the file."""
    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/gone.py", 1))

    assert edit.applied is False
    assert "could not be read" in edit.detail


@verifies(SWR.SWR_3507)
def test_a_language_no_convention_claims_is_refused(tmp_path: Path) -> None:
    """Productive use: a project keeps a trace in a file type Rotaris cannot parse.
    Expected outcome: refused by name. Guessing at an unknown grammar is how a rewriter
    corrupts a file it was never taught to read."""
    source(tmp_path, "pkg/pay.rs", "// traces SWR-501\n")

    edit = SourceTraceEditor(tmp_path).apply(removal("pkg/pay.rs", 1))

    assert edit.applied is False
    assert ".rs" in edit.detail


@verifies(SWR.SWR_3507)
def test_a_path_outside_the_tree_is_refused(tmp_path: Path) -> None:
    """Productive use: a malformed worklist names a path above the worktree.
    Expected outcome: refused. What this editor may write is bounded by one directory."""
    root = tmp_path / "tree"
    root.mkdir()
    source(tmp_path, "outside.py", f"@{T}({SYM}501)\ndef pay() -> None: ...\n")

    edit = SourceTraceEditor(root).apply(removal("../outside.py", 1))

    assert edit.applied is False
    assert "outside" in edit.detail


# -- the ordering contract holds against a real file -----------------------


@verifies(SWR.SWR_3507)
def test_several_removals_in_one_file_survive_bottom_up(tmp_path: Path) -> None:
    """Productive use: three annotations in one file all claim the superseded requirement.
    Expected outcome: applied bottom-up, every planned line number is still true when its
    operation runs, and the untouched neighbours are exactly where they were."""
    body = (
        f"@{V}({SYM}501)\n"
        "def test_one() -> None: ...\n"
        "\n"
        f"@{V}({SYM}501)\n"
        "def test_two() -> None: ...\n"
        "\n"
        f"@{V}({SYM}501)\n"
        "def test_three() -> None: ...\n"
    )
    path = source(tmp_path, "tests/test_refund.py", body)
    editor = SourceTraceEditor(tmp_path)

    # The order ApprovedMigration.operations produces: descending by line.
    for line in (7, 4, 1):
        edit = editor.apply(removal("tests/test_refund.py", line, kind=SiteKind.TEST))
        assert edit.applied is True, edit.detail

    assert path.read_text(encoding="utf-8") == (
        "def test_one() -> None: ...\n"
        "\n"
        "def test_two() -> None: ...\n"
        "\n"
        "def test_three() -> None: ...\n"
    )
