"""Productive use: a user edits a requirement in Rotaris and the project's own
requirement file carries the change — in the project's format, with everything the
canonical model does not represent untouched.
Expected outcome: an update rewrites exactly the edited field of exactly one artefact,
a failed write leaves that artefact byte-identical, a read-only source refuses with a
stated reason, and the hash Rotaris reports afterwards is the one the source holds."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import (
    FULL_CAPABILITIES,
    READ_ONLY,
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
    SourceCapabilities,
    SourceCapability,
)
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    RequirementEdit,
    SourceRead,
)
from rotaris_core.requirements.writeback import (
    MarkdownArtifactWriter,
    MarkdownRequirementDocument,
    RequirementWriteBack,
    WriteBackError,
    apply_edit,
    atomic_write_text,
    remove_from_epic_index,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

DOCUMENT = """---
req-id: SWR-4201
status: approved
trace: required
test: required
title: "Import a CSV"
epic: SWR-4200
owner: alice
jira: PROJ-42
date: 2026-01-02
---

# SWR-4201 — Import a CSV

The user imports a CSV file and sees the rows before anything is committed.

## Acceptance criteria

- A malformed row is reported with its line number.
- Nothing is written until the preview is confirmed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | ... | ... | ... |

Epic: [Import](../4200-import.md)
"""

NEIGHBOUR = """---
req-id: SWR-4202
status: draft
title: "Export a CSV"
---

# SWR-4202 — Export a CSV

The user exports the current table.
"""


def _requirement_from(path: Path, capabilities: SourceCapabilities) -> CanonicalRequirement:
    """Map one Markdown artefact onto the canonical model.

    Test-side glue standing in for the built-in ReqToCode adapter (SWR-3103): the
    parsing and the write are production code, only this mapping is local.
    """
    document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
    parent = document.get("epic")
    derived = document.get("derived-from")
    relations = (Relation(kind=RelationKind.DERIVED_FROM, target=derived),) if derived else ()
    return CanonicalRequirement(
        req_id=document.get("req-id") or "",
        title=document.get("title") or "",
        description=document.description,
        lifecycle=RequirementLifecycle(document.get("status") or "draft"),
        parent=parent,
        relations=relations,
        source_path=str(path),
        capabilities=capabilities,
    )


class MarkdownStore(BaseRequirementSource):
    """A tiny writable Markdown store over one directory."""

    capabilities = FULL_CAPABILITIES

    def __init__(
        self,
        root: Path,
        *,
        source_id: str = "house",
        replace: object = os.replace,
        claim_hash: str | None = None,
    ) -> None:
        self._root = root
        self._source_id = source_id
        self._writer = MarkdownArtifactWriter(replace=replace)  # type: ignore[arg-type]
        #: A hash the adapter *claims* it wrote. SWR-3111 says the write-back path
        #: must ignore it and re-read; a claim that is provably wrong is the only
        #: way to test that it does.
        self._claim_hash = claim_hash

    @property
    def source_id(self) -> str:
        return self._source_id

    def _paths(self) -> list[Path]:
        return sorted(self._root.glob("*.md"))

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return tuple(
            RequirementArtifact(artifact_id=path.name, location=str(path)) for path in self._paths()
        )

    def read(self) -> SourceRead:
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=tuple(
                _requirement_from(path, self.capabilities) for path in self._paths()
            ),
        )

    def revision(self) -> str:
        return str(sum(path.stat().st_size for path in self._paths()))

    def locate(self, req_id: str) -> str | None:
        for path in self._paths():
            if (
                MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8")).get(
                    "req-id",
                )
                == req_id
            ):
                return str(path)
        return None

    def update(self, req_id: str, edit: RequirementEdit) -> CanonicalRequirement:
        location = self.locate(req_id)
        if location is None:
            raise self.fail(f"{req_id} is not in this store")
        path = self._root / os.path.basename(location)
        self._writer.apply(path, edit)
        requirement = _requirement_from(path, self.capabilities)
        if self._claim_hash is not None:
            return requirement.model_copy(update={"current_hash": self._claim_hash})
        return requirement


class ReadOnlyStore(MarkdownStore):
    """The same store, declared read-only (SWR-3105)."""

    capabilities = READ_ONLY


@pytest.fixture
def store_root(tmp_path: Path) -> Path:
    root = tmp_path / "docs" / "requirements" / "4200-import"
    root.mkdir(parents=True)
    (root / "SWR-4201-import-a-csv.md").write_text(DOCUMENT, encoding="utf-8")
    (root / "SWR-4202-export-a-csv.md").write_text(NEIGHBOUR, encoding="utf-8")
    return root


def _snapshot(root: Path) -> dict[str, bytes]:
    return {path.name: path.read_bytes() for path in sorted(root.iterdir())}


@verifies(SWR.SWR_3111)
def test_a_document_round_trips_byte_identically() -> None:
    """The precondition for every "only this changed" claim in this file."""
    for text in (DOCUMENT, NEIGHBOUR, DOCUMENT.replace("\n", "\r\n"), "no frontmatter\n"):
        assert MarkdownRequirementDocument.parse(text).render() == text


@verifies(SWR.SWR_3111)
def test_an_edit_rewrites_only_its_own_field(store_root: Path) -> None:
    """Editing the description leaves every other line of the file where it was."""
    path = store_root / "SWR-4201-import-a-csv.md"
    before = _snapshot(store_root)

    MarkdownArtifactWriter().apply(
        path,
        RequirementEdit(description="The user imports a CSV file and reviews every row."),
    )

    after = path.read_text(encoding="utf-8")
    document = MarkdownRequirementDocument.parse(after)
    assert document.description == "The user imports a CSV file and reviews every row."
    # Unmodelled frontmatter — the fields the canonical model knows nothing about.
    assert document.get("owner") == "alice"
    assert document.get("jira") == "PROJ-42"
    assert document.get("date") == "2026-01-02"
    assert document.keys() == MarkdownRequirementDocument.parse(DOCUMENT).keys()
    # Unmodelled body sections, byte for byte.
    assert "## Acceptance criteria\n\n- A malformed row is reported with its line number." in after
    assert after.count("| Unit | ... | ... | ... |") == 1
    assert after.endswith("Epic: [Import](../4200-import.md)\n")
    # Exactly one file moved.
    assert _snapshot(store_root)["SWR-4202-export-a-csv.md"] == before["SWR-4202-export-a-csv.md"]


@verifies(SWR.SWR_3111)
def test_a_title_edit_updates_frontmatter_and_the_heading(store_root: Path) -> None:
    """One fact written twice must not end up saying two things."""
    path = store_root / "SWR-4201-import-a-csv.md"

    MarkdownArtifactWriter().apply(path, RequirementEdit(title="Import a spreadsheet"))

    document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
    assert document.get("title") == "Import a spreadsheet"
    assert document.heading_title == "Import a spreadsheet"
    assert '"Import a spreadsheet"' in path.read_text(encoding="utf-8")


@verifies(SWR.SWR_3111)
def test_a_failed_write_leaves_the_artefact_byte_identical(store_root: Path) -> None:
    """The half of atomicity that matters: nothing half-written, nothing left behind."""
    path = store_root / "SWR-4201-import-a-csv.md"
    before = _snapshot(store_root)
    names_before = {entry.name for entry in store_root.iterdir()}

    def refuse(source: str, target: str) -> None:
        raise OSError(28, "No space left on device")

    with pytest.raises(OSError, match="No space left on device"):
        MarkdownArtifactWriter(replace=refuse).apply(
            path,
            RequirementEdit(description="Never written"),
        )

    assert path.read_bytes() == before["SWR-4201-import-a-csv.md"]
    assert _snapshot(store_root) == before
    assert {entry.name for entry in store_root.iterdir()} == names_before


@verifies(SWR.SWR_3111)
def test_a_failed_atomic_write_leaves_no_temporary_file(tmp_path: Path) -> None:
    """A retry must not find the directory littered with half-written artefacts."""
    target = tmp_path / "requirement.md"
    target.write_bytes(b"original\n")

    def refuse(source: str, destination: str) -> None:
        raise PermissionError("the file is locked")

    with pytest.raises(PermissionError):
        atomic_write_text(target, "replacement\n", replace=refuse)

    assert target.read_bytes() == b"original\n"
    assert [entry.name for entry in tmp_path.iterdir()] == ["requirement.md"]


@verifies(SWR.SWR_3111)
def test_an_edit_that_changes_nothing_writes_nothing(store_root: Path) -> None:
    """A no-op edit must not move the artefact's modification identity (SWR-3116)."""
    path = store_root / "SWR-4201-import-a-csv.md"
    document = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
    stamp = path.stat().st_mtime_ns

    def refuse(source: str, destination: str) -> None:
        raise AssertionError("a no-op edit must not reach the filesystem")

    MarkdownArtifactWriter(replace=refuse).apply(
        path,
        RequirementEdit(description=document.description, title=document.get("title")),
    )

    assert path.stat().st_mtime_ns == stamp


@verifies(SWR.SWR_3111)
def test_the_reported_hash_comes_from_the_source_not_from_the_edit(store_root: Path) -> None:
    """SWR-3111's re-read: what an adapter claims it wrote is never taken on trust."""
    store = MarkdownStore(store_root, claim_hash="0000000000000000")
    write_back = RequirementWriteBack([store])

    outcome = write_back.update(
        "SWR-4201",
        RequirementEdit(description="The user imports a CSV file and reviews every row."),
    )

    assert outcome.ok
    assert outcome.written
    assert outcome.requirement is not None
    assert outcome.requirement.current_hash != "0000000000000000"
    assert outcome.requirement.current_hash == store.read().by_id()["SWR-4201"].current_hash
    assert outcome.requirement.description == ("The user imports a CSV file and reviews every row.")
    assert outcome.changed_paths == (str(store_root / "SWR-4201-import-a-csv.md"),)


@verifies(SWR.SWR_3111)
def test_a_read_only_source_refuses_with_a_stated_reason(store_root: Path) -> None:
    """The refusal names the source and the artefact, and the file is untouched."""
    before = _snapshot(store_root)
    write_back = RequirementWriteBack([ReadOnlyStore(store_root, source_id="legacy-export")])

    outcome = write_back.update("SWR-4201", RequirementEdit(description="anything"))

    assert not outcome.ok
    assert outcome.refusal is not None
    assert outcome.refusal.source_id == "legacy-export"
    assert outcome.refusal.operation is SourceCapability.UPDATE
    assert "legacy-export" in outcome.reason
    assert "SWR-4201-import-a-csv.md" in outcome.reason
    assert not outcome.written
    assert _snapshot(store_root) == before


@verifies(SWR.SWR_3111)
def test_a_stale_expected_hash_is_a_reported_conflict_not_a_lost_edit(
    store_root: Path,
) -> None:
    """An edit prepared against an older version must not overwrite a newer one."""
    store = MarkdownStore(store_root)
    write_back = RequirementWriteBack([store])
    before = _snapshot(store_root)

    outcome = write_back.update(
        "SWR-4201",
        RequirementEdit(description="A different description", expected_hash="deadbeefdeadbeef"),
    )

    assert not outcome.ok
    assert outcome.conflict is not None
    assert outcome.conflict.expected_hash == "deadbeefdeadbeef"
    assert outcome.conflict.actual_hash == store.read().by_id()["SWR-4201"].current_hash
    assert "moved since the edit was prepared" in outcome.reason
    assert _snapshot(store_root) == before


@verifies(SWR.SWR_3111)
def test_an_unknown_requirement_is_named_rather_than_silently_dropped(
    store_root: Path,
) -> None:
    """A write that reaches no source is an error, never a quiet success."""
    write_back = RequirementWriteBack([MarkdownStore(store_root)])

    with pytest.raises(WriteBackError, match="SWR-9999"):
        write_back.update("SWR-9999", RequirementEdit(title="Nowhere"))


@verifies(SWR.SWR_3111)
def test_a_relation_the_format_cannot_express_is_refused(store_root: Path) -> None:
    """Losing an authored relation on the way into the file would be invisible."""
    document = MarkdownRequirementDocument.parse(
        (store_root / "SWR-4201-import-a-csv.md").read_text(encoding="utf-8"),
    )

    with pytest.raises(WriteBackError, match="depends-on"):
        apply_edit(
            document,
            RequirementEdit(
                relations=(Relation(kind=RelationKind.DEPENDS_ON, target="SWR-4202"),),
            ),
        )

    updated = apply_edit(
        document,
        RequirementEdit(
            relations=(Relation(kind=RelationKind.DERIVED_FROM, target="SWR-4202"),),
        ),
    )
    assert updated.get("derived-from") == "SWR-4202"


SPEC_DOCUMENT = """---
req-id: [SWR-4301, SWR-4302]
status: draft
title: "Legacy"
---

# 4300 — Legacy

Everything inherited from the previous product.

## SWR-4301 — The legacy import runs
status: approved
trace: optional

The user imports a legacy file.

Rows that cannot be read are listed.

## SWR-4302 — The legacy export runs

The user exports the legacy format.
"""


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_a_multi_id_document_gives_each_id_its_own_prose() -> None:
    """One document, several requirements — and one description each.

    The file's preamble belongs to none of them: attributing it to all would give
    dozens of unrelated requirements the same text and, through it, the same
    content hash, so an edit to one would read as a change to every one.
    """
    document = MarkdownRequirementDocument.parse(SPEC_DOCUMENT)

    assert document.section_description("SWR-4301") == (
        "The user imports a legacy file.\n\nRows that cannot be read are listed."
    )
    assert document.section_description("SWR-4302") == "The user exports the legacy format."
    # The per-id metadata lines are metadata, not prose — the same rule ReqToCode's
    # own parser applies to them.
    assert "status: approved" not in (document.section_description("SWR-4301") or "")
    # A document with no section for that id says so instead of guessing.
    assert document.section_description("SWR-4399") is None
    assert document.description == "Everything inherited from the previous product."
    # Reading never rewrites: the document still renders byte-identically.
    assert document.render() == SPEC_DOCUMENT


@pytest.mark.unit
@verifies(SWR.SWR_3113)
def test_an_epic_index_row_can_be_taken_back_out_and_only_that_row() -> None:
    """A deletion that left the row behind would leave the store with a dead link."""
    index_text = (
        '---\nreq-id: SWR-4200\nstatus: draft\ntitle: "Import"\n---\n\n'
        "# SWR-4200 — Import\n\n## Requirements\n\n"
        "| ID | Title | Status |\n| --- | --- | --- |\n"
        "| [SWR-4201](4200-import/SWR-4201-import-a-csv.md) | Import a CSV | draft |\n"
        "| [SWR-4202](4200-import/SWR-4202-export-a-csv.md) | Export a CSV | draft |\n\n"
        "## History\n\n- 2026-01-02 — Epic cut.\n"
    )

    without = remove_from_epic_index(index_text, "SWR-4202")

    assert "SWR-4202" not in without
    assert "[SWR-4201](4200-import/SWR-4201-import-a-csv.md)" in without
    assert "| ID | Title | Status |" in without
    # Idempotent: an index that never listed the id is returned unchanged.
    assert remove_from_epic_index(without, "SWR-4202") == without
    assert remove_from_epic_index(index_text, "SWR-9999") == index_text
