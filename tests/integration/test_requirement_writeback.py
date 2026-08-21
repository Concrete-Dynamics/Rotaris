"""Productive use: a user edits a requirement in Rotaris and creates a new one from
Rotaris, and the project's own requirement store — the files, the epic index, the
ReqToCode check that gates every commit — is exactly what it would have been had they
edited it by hand.
Expected outcome: an edit changes one file and no other, the hash Rotaris then reports is
the one the store holds, a created requirement passes the real ReqToCode verifier
unedited, and the epic index lists it."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.generator import parse_requirements, regenerate_if_stale
from rotaris_core.reqtocode.verifier import verify
from rotaris_core.requirements.model import (
    Relation,
    RelationKind,
    RequirementType,
)
from rotaris_core.requirements.registry import RequirementRegistry
from rotaris_core.requirements.relations import (
    RelationIssueKind,
    ReverseRelationKind,
    is_reverse_field,
)
from rotaris_core.requirements.sources.base import (
    RequirementDraft,
    RequirementEdit,
)
from rotaris_core.requirements.sources.reqtocode import ReqToCodeSource
from rotaris_core.requirements.writeback import (
    MarkdownRequirementDocument,
    MarkdownStoreLayout,
    MarkdownStoreWriter,
    RequirementWriteBack,
    WriteBackError,
)

if TYPE_CHECKING:
    from pathlib import Path

EPIC_INDEX = """---
req-id: SWR-4200
status: draft
trace: optional
test: optional
title: "Spreadsheet Import"
---

# SWR-4200 — Spreadsheet Import

Reading and writing tabular data.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-4201](4200-spreadsheet-import/SWR-4201-import-a-csv.md) | Import a CSV | draft |
| [SWR-4202](4200-spreadsheet-import/SWR-4202-export-a-csv.md) | Export a CSV | draft |

## History

- 2026-01-02 — Epic cut.
"""

IMPORT_REQUIREMENT = """---
req-id: SWR-4201
status: draft
trace: required
test: required
title: "Import a CSV"
epic: SWR-4200
owner: alice
date: 2026-01-02
---

# SWR-4201 — Import a CSV

The user imports a CSV file.

## Acceptance criteria

- A malformed row is reported with its line number.

Epic: [Spreadsheet Import](../4200-spreadsheet-import.md)
"""

EXPORT_REQUIREMENT = """---
req-id: SWR-4202
status: draft
trace: required
test: required
title: "Export a CSV"
epic: SWR-4200
date: 2026-01-02
---

# SWR-4202 — Export a CSV

The user exports the current table.

Epic: [Spreadsheet Import](../4200-spreadsheet-import.md)
"""


def _store_source(repo: Path) -> ReqToCodeSource:
    """The shipped built-in adapter (SWR-3103), with a fixed date for determinism.

    The whole point of this file is that the write path is exercised against the
    adapter the product actually ships — an adapter defined here would prove that
    the machinery works and leave the question of whether *this repository's* one
    does open until the first user edit.
    """
    return ReqToCodeSource(repo, today=lambda: "2026-08-14")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A synthetic repository with a ReqToCode store in its usual layout."""
    store = tmp_path / "docs" / "requirements"
    folder = store / "4200-spreadsheet-import"
    folder.mkdir(parents=True)
    (store / "4200-spreadsheet-import.md").write_text(EPIC_INDEX, encoding="utf-8")
    (folder / "SWR-4201-import-a-csv.md").write_text(IMPORT_REQUIREMENT, encoding="utf-8")
    (folder / "SWR-4202-export-a-csv.md").write_text(EXPORT_REQUIREMENT, encoding="utf-8")
    (tmp_path / "src" / "rotaris_core").mkdir(parents=True)
    (tmp_path / "tests").mkdir()
    return tmp_path


def _snapshot(repo: Path) -> dict[str, bytes]:
    return {
        path.relative_to(repo).as_posix(): path.read_bytes()
        for path in sorted(repo.rglob("*"))
        if path.is_file()
    }


@pytest.mark.integration
@verifies(SWR.SWR_3111)
def test_an_edit_updates_the_file_re_reads_it_and_yields_the_new_hash(repo: Path) -> None:
    """Adapter and registry together: the store moves, and the index follows it."""
    source = _store_source(repo)
    registry = RequirementRegistry([source])
    before_index = registry.refresh()
    before = _snapshot(repo)
    original = before_index.requirement("SWR-4201")
    assert original is not None

    outcome = RequirementWriteBack(registry).update(
        "SWR-4201",
        RequirementEdit(
            description="The user imports a CSV file and reviews the parsed rows first.",
            expected_hash=original.current_hash,
        ),
    )

    assert outcome.ok
    assert outcome.requirement is not None
    assert outcome.requirement.current_hash != original.current_hash
    # Both hashes are the store's, read back after the write — neither is computed
    # from the edit that was applied in memory (SWR-3111).
    stored = parse_requirements(repo).requirements
    assert outcome.requirement.source_hash == next(
        meta.content_hash for meta in stored if meta.req_id == "SWR-4201"
    )
    assert (
        outcome.requirement.current_hash
        == _store_source(repo).read().by_id()["SWR-4201"].current_hash
    )

    after = _snapshot(repo)
    changed = [path for path in after if after[path] != before.get(path)]
    assert changed == ["docs/requirements/4200-spreadsheet-import/SWR-4201-import-a-csv.md"]
    assert set(after) == set(before)

    # And the board's own view follows on the next refresh — incrementally.
    index = registry.refresh()
    requirement = index.requirement("SWR-4201")
    assert requirement is not None
    assert requirement.description == (
        "The user imports a CSV file and reviews the parsed rows first."
    )
    assert requirement.current_hash == outcome.requirement.current_hash
    report = registry.last_refresh.of_source("reqtocode")
    assert report is not None
    assert report.artifacts_read == (
        "docs/requirements/4200-spreadsheet-import/SWR-4201-import-a-csv.md",
    )


@pytest.mark.e2e
@verifies(SWR.SWR_3111)
def test_a_user_edits_a_description_and_the_project_s_own_file_carries_it(
    repo: Path,
) -> None:
    """The product promise: the edit lands in the team's file, in the team's format."""
    registry = RequirementRegistry([_store_source(repo)])
    registry.refresh()
    path = repo / "docs" / "requirements" / "4200-spreadsheet-import" / ("SWR-4201-import-a-csv.md")

    outcome = RequirementWriteBack(registry).update(
        "SWR-4201",
        RequirementEdit(description="The user imports a CSV file and reviews every row."),
    )

    assert outcome.ok
    text = path.read_text(encoding="utf-8")
    assert "The user imports a CSV file and reviews every row." in text
    assert "The user imports a CSV file.\n" not in text
    # Unmodelled frontmatter and the unmodelled section are exactly as they were.
    document = MarkdownRequirementDocument.parse(text)
    assert document.get("owner") == "alice"
    assert document.get("date") == "2026-01-02"
    assert "## Acceptance criteria" in text
    assert "- A malformed row is reported with its line number." in text
    # The store's own tooling still parses it, and no other requirement moved.
    parsed = parse_requirements(repo)
    assert parsed.errors == []
    assert [meta.req_id for meta in parsed.requirements] == [
        "SWR-4200",
        "SWR-4201",
        "SWR-4202",
    ]


@pytest.mark.integration
@verifies(SWR.SWR_3112)
def test_a_created_requirement_passes_the_real_reqtocode_verifier(repo: Path) -> None:
    """Not "looks right": the project's own check, run over the synthetic store."""
    source = _store_source(repo)
    registry = RequirementRegistry([source])
    registry.refresh()

    outcome = RequirementWriteBack(registry).create(
        RequirementDraft(
            title="Import an XLSX workbook",
            description="The user imports an XLSX workbook and picks a sheet.",
            parent="SWR-4200",
        ),
    )

    assert outcome.ok
    assert outcome.requirement is not None
    assert outcome.requirement.req_id == "SWR-4203"

    parsed = parse_requirements(repo)
    assert parsed.errors == []
    regenerate_if_stale(repo)
    result = verify(repo)
    assert result.errors == []
    assert result.stats["requirements"] == 4


@pytest.mark.e2e
@verifies(SWR.SWR_3112)
def test_a_user_creates_a_requirement_and_the_store_stays_consistent(repo: Path) -> None:
    """The user-visible half: the file is where the team keeps them, and the index lists it."""
    registry = RequirementRegistry([_store_source(repo)])
    registry.refresh()

    outcome = RequirementWriteBack(registry).create(
        RequirementDraft(
            title="Import an XLSX workbook",
            description="The user imports an XLSX workbook and picks a sheet.",
            parent="SWR-4200",
        ),
    )

    assert outcome.requirement is not None
    created = (
        repo
        / "docs"
        / "requirements"
        / "4200-spreadsheet-import"
        / "SWR-4203-import-an-xlsx-workbook.md"
    )
    assert created.is_file()
    index_text = (repo / "docs" / "requirements" / "4200-spreadsheet-import.md").read_text(
        encoding="utf-8",
    )
    assert (
        "| [SWR-4203](4200-spreadsheet-import/SWR-4203-import-an-xlsx-workbook.md)"
        " | Import an XLSX workbook | draft |"
    ) in index_text

    # The board shows it, attributed to the store it was created in, and hanging
    # under the epic it was created in (SWR-3108).
    board = registry.refresh()
    assert board.ids == ("SWR-4200", "SWR-4201", "SWR-4202", "SWR-4203")
    assert board.source_of("SWR-4203") == "reqtocode"
    assert board.hierarchy().children_of("SWR-4200") == (
        "SWR-4201",
        "SWR-4202",
        "SWR-4203",
    )
    regenerate_if_stale(repo)
    assert verify(repo).errors == []


@pytest.mark.integration
@verifies(SWR.SWR_3112)
def test_a_technical_requirement_created_without_its_origin_never_reaches_the_store(
    repo: Path,
) -> None:
    """The store's own rule (SWR-2331), enforced before a broken file exists."""
    registry = RequirementRegistry([_store_source(repo)])
    registry.refresh()
    before = _snapshot(repo)

    with pytest.raises(Exception, match="derived-from"):
        RequirementWriteBack(registry).create(
            RequirementDraft(
                title="A seam",
                parent="SWR-4200",
                req_type=RequirementType.TECHNICAL,
            ),
        )

    assert _snapshot(repo) == before


@pytest.mark.integration
@verifies(SWR.SWR_3112)
def test_a_created_technical_requirement_carries_its_origin_into_the_store(
    repo: Path,
) -> None:
    """The technical template, written by Rotaris, accepted by the project's check."""
    registry = RequirementRegistry([_store_source(repo)])
    registry.refresh()

    outcome = RequirementWriteBack(registry).create(
        RequirementDraft(
            title="Shared CSV reader",
            description="Both import paths need one reader; this is that seam.",
            parent="SWR-4200",
            req_type=RequirementType.TECHNICAL,
            relations=(Relation(kind=RelationKind.DERIVED_FROM, target="SWR-4201"),),
        ),
    )

    assert outcome.requirement is not None
    assert outcome.requirement.req_type is RequirementType.TECHNICAL
    assert outcome.requirement.related_ids(RelationKind.DERIVED_FROM) == ("SWR-4201",)
    regenerate_if_stale(repo)
    assert verify(repo).errors == []


@pytest.mark.integration
@verifies(SWR.SWR_3110)
def test_write_back_never_emits_a_reverse_relation_field(repo: Path) -> None:
    """One direction is authored, the other is computed — and stays uncomputed on disk.

    A store carrying both ``derived-from`` on one file and ``derived-requirements``
    on the other can disagree with itself, and a requirement store with two
    contradictory truths about one fact is worse than one with none. So the write
    path may emit the authored direction and must never emit the reverse — even
    when the requirement being written is the *target* of one.
    """
    registry = RequirementRegistry([_store_source(repo)])
    registry.refresh()
    write_back = RequirementWriteBack(registry)

    # SWR-4203 derives from SWR-4201, so SWR-4201 now has a computed reverse edge.
    created = write_back.create(
        RequirementDraft(
            title="Shared CSV reader",
            description="Both import paths need one reader; this is that seam.",
            parent="SWR-4200",
            req_type=RequirementType.TECHNICAL,
            relations=(Relation(kind=RelationKind.DERIVED_FROM, target="SWR-4201"),),
        ),
    )
    assert created.requirement is not None

    # Editing the origin is the moment a naive writer would persist the reverse.
    outcome = write_back.update(
        "SWR-4201",
        RequirementEdit(description="The user imports a CSV file and reviews the rows."),
    )
    assert outcome.ok

    index = registry.refresh()
    graph = index.relation_graph()
    # The computed direction exists in memory …
    assert graph.sources("SWR-4201", ReverseRelationKind.DERIVED_REQUIREMENTS) == ("SWR-4203",)
    assert graph.targets("SWR-4203", RelationKind.DERIVED_FROM) == ("SWR-4201",)
    assert not graph.issues_of(RelationIssueKind.AUTHORED_REVERSE_FIELD)

    # … and in no file of the store. Every frontmatter key of every document is
    # checked, so a reverse field arriving through a later writer is caught here.
    store = repo / "docs" / "requirements"
    documents = sorted(store.rglob("*.md"))
    assert len(documents) == 4
    for path in documents:
        document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
        frontmatter_keys = document.keys()
        authored = [key for key in frontmatter_keys if is_reverse_field(key)]
        assert not authored, f"{path.name} authored a computed field: {authored}"

    # The authored direction *is* written, on the requirement that declares it.
    derived = MarkdownRequirementDocument.parse(
        (store / "4200-spreadsheet-import" / "SWR-4203-shared-csv-reader.md").read_text(
            encoding="utf-8",
        ),
    )
    assert derived.get("derived-from") == "SWR-4201"
    regenerate_if_stale(repo)
    assert verify(repo).errors == []


@pytest.mark.integration
@verifies(SWR.SWR_3111)
def test_a_failed_write_leaves_the_store_byte_identical(repo: Path) -> None:
    """The failure path over the real store, not over a fake one."""
    source = _store_source(repo)
    registry = RequirementRegistry([source])
    registry.refresh()
    before = _snapshot(repo)

    def refuse(origin: str, destination: str) -> None:
        raise OSError(28, "No space left on device")

    source._writer = MarkdownStoreWriter(  # noqa: SLF001 - injecting the failure seam
        MarkdownStoreLayout(root=repo / "docs" / "requirements"),
        replace=refuse,
        today=lambda: "2026-08-14",
    )

    with pytest.raises(OSError, match="No space left on device"):
        RequirementWriteBack(registry).update(
            "SWR-4201",
            RequirementEdit(description="Never written"),
        )

    # Every artefact in the repository, byte for byte, and no temporary left over.
    assert _snapshot(repo) == before
    # The store's own parser still reads it, and the index still holds the old hash.
    assert parse_requirements(repo).errors == []
    unchanged = registry.refresh().requirement("SWR-4201")
    assert unchanged is not None
    assert unchanged.description == "The user imports a CSV file."


@pytest.mark.e2e
@verifies(SWR.SWR_3105)
def test_a_user_retires_a_requirement_and_the_store_is_left_consistent(repo: Path) -> None:
    """The third declared capability, performed on the project's own files.

    ``delete`` is declared by the built-in source, so it has to be real: the
    document goes, the epic index stops pointing at it, and the store still
    passes the check that gates every commit in the project it belongs to.
    """
    registry = RequirementRegistry([_store_source(repo)])
    registry.refresh()
    document = (
        repo / "docs" / "requirements" / "4200-spreadsheet-import" / ("SWR-4202-export-a-csv.md")
    )
    index_path = repo / "docs" / "requirements" / "4200-spreadsheet-import.md"

    outcome = RequirementWriteBack(registry).delete("SWR-4202")

    assert outcome.written
    assert outcome.changed_paths == (
        "docs/requirements/4200-spreadsheet-import/SWR-4202-export-a-csv.md",
    )
    assert not document.exists()
    index_text = index_path.read_text(encoding="utf-8")
    assert "SWR-4202" not in index_text
    assert "[SWR-4201](4200-spreadsheet-import/SWR-4201-import-a-csv.md)" in index_text
    # The board follows, and the project's own tooling still accepts the store.
    board = registry.refresh()
    assert board.ids == ("SWR-4200", "SWR-4201")
    assert parse_requirements(repo).errors == []
    regenerate_if_stale(repo)
    assert verify(repo).errors == []


@pytest.mark.integration
@verifies(SWR.SWR_3113)
def test_deleting_one_id_out_of_a_multi_id_document_is_refused(repo: Path) -> None:
    """Half-emptying a spec file would drop prose nobody asked to lose."""
    store = repo / "docs" / "requirements"
    (store / "4300-legacy.md").write_text(
        '---\nreq-id: [SWR-4301, SWR-4302]\nstatus: draft\ntitle: "Legacy"\n---\n\n'
        "# 4300 — Legacy\n\n## SWR-4301 — The legacy import runs\n\nIt runs.\n\n"
        "## SWR-4302 — The legacy export runs\n\nIt also runs.\n",
        encoding="utf-8",
    )
    registry = RequirementRegistry([_store_source(repo)])
    registry.refresh()
    before = _snapshot(repo)

    with pytest.raises(WriteBackError, match="multi-id document"):
        RequirementWriteBack(registry).delete("SWR-4302")

    assert _snapshot(repo) == before
