"""Productive use: a user creates a requirement from Rotaris and the project's own
tooling accepts it — same id convention, same folder, same template, mirrored into the
epic index, exactly as if a team member had written the file by hand.
Expected outcome: id allocation skips used *and* retired ids, a technical requirement
without an origin is refused before anything is written, and the created artefact and
epic index row match the store's own conventions."""

from __future__ import annotations

from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import (
    Relation,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
)
from rotaris_core.requirements.sources.base import RequirementDraft
from rotaris_core.requirements.writeback import (
    CreationError,
    MarkdownRequirementDocument,
    MarkdownStoreLayout,
    MarkdownStoreWriter,
    allocate_requirement_id,
    epic_index_row,
    mirror_into_epic_index,
    render_requirement_document,
    requirement_filename,
    requirement_slug,
    validate_draft,
)

pytestmark = pytest.mark.unit

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
| [SWR-4203](4200-spreadsheet-import/SWR-4203-export-a-csv.md) | Export a CSV | draft |

## History

- 2026-01-02 — Epic cut.
"""

REQUIREMENT = """---
req-id: SWR-4201
status: draft
trace: required
test: required
title: "Import a CSV"
epic: SWR-4200
date: 2026-01-02
---

# SWR-4201 — Import a CSV

The user imports a CSV file.

Epic: [Spreadsheet Import](../4200-spreadsheet-import.md)
"""


@pytest.fixture
def store(tmp_path: Path) -> MarkdownStoreLayout:
    root = tmp_path / "docs" / "requirements"
    folder = root / "4200-spreadsheet-import"
    folder.mkdir(parents=True)
    (root / "4200-spreadsheet-import.md").write_text(EPIC_INDEX, encoding="utf-8")
    (folder / "SWR-4201-import-a-csv.md").write_text(REQUIREMENT, encoding="utf-8")
    (folder / "SWR-4203-export-a-csv.md").write_text(
        REQUIREMENT.replace("SWR-4201", "SWR-4203").replace("Import", "Export"),
        encoding="utf-8",
    )
    return MarkdownStoreLayout(root=root)


@verifies(SWR.SWR_3112, SWR.SWR_3113)
def test_id_allocation_skips_used_and_tombstoned_ids() -> None:
    """An id that only exists as a tombstone must never be issued again."""
    allocated = allocate_requirement_id(
        used_ids=("SWR-4201", "SWR-4203"),
        retired_ids=("SWR-4202",),
        epic="SWR-4200",
    )

    assert allocated == "SWR-4204"

    # Without the tombstone, the gap would have been filled — which is exactly the
    # id reuse SWR-3113 exists to prevent.
    assert allocate_requirement_id(used_ids=("SWR-4201", "SWR-4203"), epic="SWR-4200") == "SWR-4202"


@verifies(SWR.SWR_3112)
def test_ids_are_allocated_inside_their_epic_block() -> None:
    """The store's convention: SWR-4200 owns SWR-4201…SWR-4299, and nothing else."""
    assert allocate_requirement_id(used_ids=("SWR-3117", "SWR-4201"), epic="SWR-4200") == (
        "SWR-4202"
    )
    assert allocate_requirement_id(used_ids=("SWR-4299",), epic="SWR-4200") == "SWR-4201"

    exhausted = tuple(f"SWR-{number}" for number in range(4201, 4300))
    with pytest.raises(CreationError, match="no free id"):
        allocate_requirement_id(used_ids=exhausted, epic="SWR-4200")


@verifies(SWR.SWR_3112)
def test_two_creations_in_one_session_get_different_ids(store: MarkdownStoreLayout) -> None:
    """The second creation sees the first one's file, so the ids cannot collide."""
    writer = MarkdownStoreWriter(store, today=lambda: "2026-08-14")

    first = writer.create(RequirementDraft(title="Import an XLSX", parent="SWR-4200"))
    second = writer.create(RequirementDraft(title="Import a TSV", parent="SWR-4200"))

    assert first.req_id == "SWR-4202"
    assert second.req_id == "SWR-4204"
    assert first.req_id != second.req_id
    assert "SWR-4202" in store.used_ids()
    assert "SWR-4204" in store.used_ids()


@verifies(SWR.SWR_3112)
def test_a_technical_requirement_without_an_origin_is_refused() -> None:
    """Mirrors the store's own check (SWR-2331) before a file exists to repair."""
    with pytest.raises(CreationError, match="derived-from"):
        validate_draft(
            RequirementDraft(title="A seam", req_type=RequirementType.TECHNICAL),
        )

    with pytest.raises(CreationError, match="only valid on a technical requirement"):
        validate_draft(
            RequirementDraft(
                title="A product behaviour",
                relations=(Relation(kind=RelationKind.DERIVED_FROM, target="SWR-4201"),),
            ),
        )

    validate_draft(
        RequirementDraft(
            title="A seam",
            req_type=RequirementType.TECHNICAL,
            relations=(Relation(kind=RelationKind.DERIVED_FROM, target="SWR-4201"),),
        ),
    )


@verifies(SWR.SWR_3112)
def test_a_refused_draft_writes_nothing(store: MarkdownStoreLayout) -> None:
    """The refusal happens before the store is touched, not after."""
    writer = MarkdownStoreWriter(store, today=lambda: "2026-08-14")
    before = sorted(path.name for path in store.root.rglob("*.md"))

    with pytest.raises(CreationError):
        writer.create(
            RequirementDraft(
                title="A seam",
                parent="SWR-4200",
                req_type=RequirementType.TECHNICAL,
            ),
        )

    assert sorted(path.name for path in store.root.rglob("*.md")) == before


@verifies(SWR.SWR_3112)
def test_the_created_artefact_follows_the_store_s_own_conventions(
    store: MarkdownStoreLayout,
) -> None:
    """Location, file name, template and frontmatter order, as a human would write them."""
    writer = MarkdownStoreWriter(store, today=lambda: "2026-08-14")

    creation = writer.create(
        RequirementDraft(
            title="Import an XLSX workbook",
            description="The user imports an XLSX workbook and picks a sheet.",
            parent="SWR-4200",
        ),
    )

    path = store.root / "4200-spreadsheet-import" / "SWR-4202-import-an-xlsx-workbook.md"
    assert creation.path == str(path)
    assert path.is_file()
    document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
    assert document.keys() == ("req-id", "status", "trace", "test", "title", "epic", "date")
    assert document.get("req-id") == "SWR-4202"
    assert document.get("status") == "draft"
    assert document.get("epic") == "SWR-4200"
    assert document.get("date") == "2026-08-14"
    assert document.heading_title == "Import an XLSX workbook"
    assert document.description == "The user imports an XLSX workbook and picks a sheet."
    body = path.read_text(encoding="utf-8")
    assert "## Test portfolio" in body
    assert "Epic: [SWR-4200](../4200-spreadsheet-import.md)" in body


@verifies(SWR.SWR_3112)
def test_creation_mirrors_the_requirement_into_the_epic_index(
    store: MarkdownStoreLayout,
) -> None:
    """A requirement the epic index does not list is invisible to every human reader."""
    writer = MarkdownStoreWriter(store, today=lambda: "2026-08-14")

    creation = writer.create(RequirementDraft(title="Import an XLSX", parent="SWR-4200"))

    index = (store.root / "4200-spreadsheet-import.md").read_text(encoding="utf-8")
    rows = [line for line in index.splitlines() if line.startswith("| [")]
    assert rows == [
        "| [SWR-4201](4200-spreadsheet-import/SWR-4201-import-a-csv.md) | Import a CSV | draft |",
        "| [SWR-4202](4200-spreadsheet-import/SWR-4202-import-an-xlsx.md)"
        " | Import an XLSX | draft |",
        "| [SWR-4203](4200-spreadsheet-import/SWR-4203-export-a-csv.md) | Export a CSV | draft |",
    ]
    assert creation.index_path == str(store.root / "4200-spreadsheet-import.md")
    assert creation.changed_paths == (creation.path, creation.index_path)
    # The rest of the index is untouched.
    assert "## History" in index
    assert "- 2026-01-02 — Epic cut." in index


@verifies(SWR.SWR_3112)
def test_mirroring_the_same_id_twice_replaces_its_row(store: MarkdownStoreLayout) -> None:
    """Idempotent by id, so a retried creation cannot duplicate a row."""
    row = epic_index_row(
        "SWR-4201",
        "Import a CSV file",
        lifecycle="approved",
        relative_path="4200-spreadsheet-import/SWR-4201-import-a-csv.md",
    )

    once = mirror_into_epic_index(EPIC_INDEX, row=row, req_id="SWR-4201")
    twice = mirror_into_epic_index(once, row=row, req_id="SWR-4201")

    assert once == twice
    assert once.count("[SWR-4201]") == 1
    assert "| Import a CSV file | approved |" in once


@verifies(SWR.SWR_3112)
def test_an_index_without_a_requirement_table_is_refused() -> None:
    """Better a named refusal than a requirement nobody can find."""
    with pytest.raises(CreationError, match="no requirement table"):
        mirror_into_epic_index(
            "# SWR-4200 — Spreadsheet Import\n\nNo table here.\n",
            row="| [SWR-4202](x.md) | X | draft |",
            req_id="SWR-4202",
        )


@verifies(SWR.SWR_3112)
def test_the_technical_template_carries_its_origin() -> None:
    """A technical requirement is rendered from the store's *other* template."""
    text = render_requirement_document(
        req_id="SWR-4210",
        title="A seam nobody asked for",
        description="Why this supplementary code is necessary.",
        date_text="2026-08-14",
        epic_id="SWR-4200",
        req_type=RequirementType.TECHNICAL,
        derived_from=("SWR-4201",),
        lifecycle=RequirementLifecycle.DRAFT,
    )

    document = MarkdownRequirementDocument.parse(text)
    assert document.keys() == (
        "req-id",
        "status",
        "trace",
        "test",
        "type",
        "derived-from",
        "title",
        "epic",
        "date",
    )
    assert document.get("type") == "technical"
    assert document.get("derived-from") == "SWR-4201"
    assert "## Test coverage" in text
    assert "## Test portfolio" not in text


@verifies(SWR.SWR_3112)
def test_file_names_follow_the_store_s_slug_convention() -> None:
    """``SWR-<n>-<slug>.md``, lower-case, punctuation folded away."""
    assert requirement_slug("Import a CSV — with a preview!") == "import-a-csv-with-a-preview"
    assert requirement_filename("SWR-4202", "Import a CSV") == "SWR-4202-import-a-csv.md"
    assert requirement_slug("...") == "requirement"
    assert requirement_filename("SWR-4202", "A B C D E F G H I J") == (
        "SWR-4202-a-b-c-d-e-f-g-h.md"
    )


@verifies(SWR.SWR_3112)
def test_creation_never_overwrites_an_existing_artefact(store: MarkdownStoreLayout) -> None:
    """A colliding id is refused rather than silently replacing someone's file."""
    writer = MarkdownStoreWriter(store, today=lambda: "2026-08-14")
    before = (store.root / "4200-spreadsheet-import" / "SWR-4201-import-a-csv.md").read_bytes()

    with pytest.raises(CreationError, match="already in use"):
        writer.create(
            RequirementDraft(req_id="SWR-4201", title="Import a CSV", parent="SWR-4200"),
        )

    assert (
        store.root / "4200-spreadsheet-import" / "SWR-4201-import-a-csv.md"
    ).read_bytes() == before


@verifies(SWR.SWR_3606, SWR.SWR_3112)
def test_planning_a_creation_names_what_the_write_then_produces(
    store: MarkdownStoreLayout,
) -> None:
    """Productive use: a surface shows where a draft will land, then the user creates it.
    Expected outcome: the plan and the creation are the same value — id, artefact,
    epic and index — because the write asks the plan where to go.

    SWR-3606 asks the user to see the location *before* the write. Two rules that
    agree today would satisfy the sentence and not the property; this asserts the
    whole value rather than the path, so a field that starts diverging is named.
    """
    writer = MarkdownStoreWriter(store, today=lambda: "2026-08-14")
    draft = RequirementDraft(
        title="Import an XLSX workbook",
        description="The user imports an XLSX workbook and picks a sheet.",
        parent="SWR-4200",
    )

    planned = writer.plan(draft)

    assert planned.req_id == "SWR-4202"
    assert not Path(planned.path).exists(), "planning must write nothing"

    assert writer.create(draft) == planned


@verifies(SWR.SWR_3606, SWR.SWR_3112)
def test_planning_refuses_exactly_what_the_write_refuses(store: MarkdownStoreLayout) -> None:
    """Productive use: the form is open on a draft the store's own check rejects.
    Expected outcome: the preview states the refusal rather than naming a file the
    write would then decline — a location nothing will write is a worse answer
    than the reason.

    Three refusals, each raised at the same door as the write's: a missing title,
    a technical requirement with no origin, and an id already taken.
    """
    writer = MarkdownStoreWriter(store, today=lambda: "2026-08-14")

    with pytest.raises(CreationError, match="needs a title"):
        writer.plan(RequirementDraft(title="   ", parent="SWR-4200"))
    with pytest.raises(CreationError, match="derived-from"):
        writer.plan(
            RequirementDraft(
                title="Cache the parsed store",
                req_type=RequirementType.TECHNICAL,
                parent="SWR-4200",
            ),
        )
    with pytest.raises(CreationError, match="already in use"):
        writer.plan(RequirementDraft(title="Import a CSV", req_id="SWR-4201", parent="SWR-4200"))

    assert sorted(path.name for path in store.root.rglob("*.md")) == [
        "4200-spreadsheet-import.md",
        "SWR-4201-import-a-csv.md",
        "SWR-4203-export-a-csv.md",
    ], "a refused plan wrote something"
