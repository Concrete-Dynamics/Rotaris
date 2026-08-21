"""Productive use: a user opens a project that already keeps its requirements in a
ReqToCode store and Rotaris reads them — ids, title, prose, lifecycle, type, hashes and
epic structure — without being configured and without a second parser to keep in step,
edits one of them, creates one, retires one, and asks what a requirement said before.
Expected outcome: every declared id becomes exactly one canonical requirement carrying
its own text and a hash that moves with meaning and not with formatting, the store's own
content hash travels beside it so existing baselines keep their meaning, every declared
write capability is really performed on the store's files, and a workspace with no store
contributes no source instead of an error."""

from __future__ import annotations

import pathlib
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.generator import ParseResult, parse_requirements
from rotaris_core.requirements.model import (
    RelationKind,
    RequirementLifecycle,
    RequirementType,
    SourceCapability,
)
from rotaris_core.requirements.sources.base import (
    RequirementDraft,
    RequirementEdit,
    RequirementSourceError,
    SourceHistoryUnavailable,
    history_of,
    preview_of,
    supports,
)
from rotaris_core.requirements.sources.reqtocode import (
    ReqToCodeSource,
    _read_document_text,
    epic_index_for,
    reqtocode_source_for,
)

if TYPE_CHECKING:
    from pathlib import Path

EPIC = """---
req-id: SWR-4200
status: approved
trace: optional
test: optional
title: "Widget platform"
---

# 4200 — Widget platform

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-4201](4200-widgets/SWR-4201-render.md) | A widget can be rendered | approved |
| [SWR-4202](4200-widgets/SWR-4202-cache.md) | Widget render cache | draft |
"""

PRODUCT = """---
req-id: SWR-4201
status: approved
trace: required
test: required
title: "A widget can be rendered"
epic: SWR-4200
---

# SWR-4201 — A widget can be rendered

The user sees a widget.
"""

TECHNICAL = """---
req-id: SWR-4202
status: draft
trace: required
test: optional
type: technical
derived-from: SWR-4201
title: "Widget render cache"
epic: SWR-4200
---

# SWR-4202 — Widget render cache
"""

SPEC_FILE = """---
req-id: [SWR-4300, SWR-4301, SWR-4302]
status: draft
trace: required
test: required
title: "Legacy area"
---

# 4300-legacy spec

The area inherited from the previous product.

## SWR-4300 — Legacy area
status: approved
trace: optional
test: optional

The legacy area stays reachable.

## SWR-4301 — The legacy import runs
status: approved

The user imports a legacy file and its rows arrive.

## SWR-4302 — The legacy export runs
status: deprecated

The user exports the legacy format.
"""


def _write_store(root: Path) -> Path:
    """A miniature ReqToCode store: an epic, its two requirements, a spec file."""
    store = root / "docs" / "requirements"
    (store / "4200-widgets").mkdir(parents=True)
    (store / "4200-widgets.md").write_text(EPIC, encoding="utf-8")
    (store / "4200-widgets" / "SWR-4201-render.md").write_text(PRODUCT, encoding="utf-8")
    (store / "4200-widgets" / "SWR-4202-cache.md").write_text(TECHNICAL, encoding="utf-8")
    (store / "4300-legacy.md").write_text(SPEC_FILE, encoding="utf-8")
    return root


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_the_store_maps_onto_the_canonical_model(tmp_path: Path) -> None:
    """Id, title, lifecycle, type and hash survive the crossing unchanged."""
    source = ReqToCodeSource(_write_store(tmp_path))
    read = source.read()
    by_id = read.by_id()
    parsed = {meta.req_id: meta for meta in parse_requirements(tmp_path).requirements}

    assert read.requirement_ids == (
        "SWR-4200",
        "SWR-4201",
        "SWR-4202",
        "SWR-4300",
        "SWR-4301",
        "SWR-4302",
    )

    product = by_id["SWR-4201"]
    assert product.title == "A widget can be rendered"
    # The requirement's own words, so a detail view (SWR-3307), an agent context
    # (SWR-3407) and impact analysis (SWR-3503) can be built on the canonical
    # model instead of re-parsing the Markdown.
    assert product.description == "The user sees a widget."
    assert product.lifecycle is RequirementLifecycle.APPROVED
    assert product.req_type is RequirementType.PRODUCT
    assert product.source_path == "docs/requirements/4200-widgets/SWR-4201-render.md"
    # The canonical hash is the one that changes with meaning (SWR-3107); the
    # store's own content hash travels beside it so an existing baseline entry
    # and a `reqtocode diff` result keep their meaning.
    assert product.hash_is_canonical
    assert product.source_hash == parsed["SWR-4201"].content_hash
    assert product.current_hash != product.source_hash
    assert product.trace_required and product.test_required

    technical = by_id["SWR-4202"]
    assert technical.req_type is RequirementType.TECHNICAL
    assert technical.test_required is False
    assert technical.related_ids(RelationKind.DERIVED_FROM) == ("SWR-4201",)

    # The epic is resolved from the store's layout, and the epic itself is a root.
    assert product.parent == "SWR-4200"
    assert technical.parent == "SWR-4200"
    assert by_id["SWR-4200"].parent is None

    # The store is writable, and says so rather than leaving it to be discovered.
    assert supports(source, SourceCapability.UPDATE)
    assert product.capabilities.can(SourceCapability.CREATE)


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_a_multi_id_spec_file_yields_one_requirement_per_declared_id(tmp_path: Path) -> None:
    """Three ids in one document are three requirements sharing that file's hash."""
    source = ReqToCodeSource(_write_store(tmp_path))
    by_id = source.read().by_id()

    spec_ids = ("SWR-4300", "SWR-4301", "SWR-4302")
    # One document, one store hash — and three *different* content hashes, because
    # three requirements that say different things are three versions to track
    # (SWR-3107). Sharing one would make an edit to any of them look like a change
    # to all of them.
    assert len({by_id[req_id].source_hash for req_id in spec_ids}) == 1
    assert len({by_id[req_id].current_hash for req_id in spec_ids}) == 3
    assert {by_id[req_id].source_path for req_id in spec_ids} == {
        "docs/requirements/4300-legacy.md",
    }

    # Each id's description is its own section's prose, not the file preamble.
    assert by_id["SWR-4300"].description == "The legacy area stays reachable."
    assert by_id["SWR-4301"].description == "The user imports a legacy file and its rows arrive."
    assert by_id["SWR-4302"].description == "The user exports the legacy format."

    # Each carries the lifecycle its own section overrode, not the file's.
    assert by_id["SWR-4300"].lifecycle is RequirementLifecycle.APPROVED
    assert by_id["SWR-4301"].lifecycle is RequirementLifecycle.APPROVED
    assert by_id["SWR-4302"].lifecycle is RequirementLifecycle.DEPRECATED
    assert by_id["SWR-4302"].is_deprecated

    # A spec file is its own epic index: the lowest id is the epic, the rest hang
    # off it, and the epic does not parent itself.
    assert by_id["SWR-4300"].parent is None
    assert by_id["SWR-4301"].parent == "SWR-4300"
    assert by_id["SWR-4302"].parent == "SWR-4300"

    artifacts = {artifact.location: artifact for artifact in source.discover()}
    assert artifacts["docs/requirements/4300-legacy.md"].requirement_ids == spec_ids


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_a_workspace_with_no_store_yields_no_source_and_a_missing_one_is_named(
    tmp_path: Path,
) -> None:
    """ "This project keeps its requirements elsewhere" is not an error."""
    assert reqtocode_source_for(tmp_path) is None

    _write_store(tmp_path)
    source = reqtocode_source_for(tmp_path)
    assert source is not None
    assert source.read().requirement_ids[0] == "SWR-4200"

    # A store that was there and is gone is a different fact, and says so rather
    # than reporting a project with no requirements.
    vanished = ReqToCodeSource(tmp_path / "elsewhere")
    with pytest.raises(RequirementSourceError, match="requirement store not found"):
        vanished.read()


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_a_broken_layout_config_is_named_instead_of_silently_ignored(tmp_path: Path) -> None:
    """Falling back to the default layout would read a different tree."""
    _write_store(tmp_path)
    (tmp_path / ".reqtocode.json").write_text("{not json", encoding="utf-8")

    with pytest.raises(RequirementSourceError, match="layout could not be read"):
        reqtocode_source_for(tmp_path)


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_the_revision_moves_exactly_when_the_store_changes(tmp_path: Path) -> None:
    """Change detection keys on this token, so it must not move on its own."""
    _write_store(tmp_path)
    source = ReqToCodeSource(tmp_path)
    store = tmp_path / "docs" / "requirements"

    first = source.revision()
    assert source.revision() == first
    assert source.read().revision == first

    # Rewriting a file with identical content leaves the token alone.
    (store / "4200-widgets" / "SWR-4201-render.md").write_text(PRODUCT, encoding="utf-8")
    assert source.revision() == first

    (store / "4200-widgets" / "SWR-4201-render.md").write_text(
        PRODUCT.replace("The user sees a widget.", "The user sees two widgets."),
        encoding="utf-8",
    )
    assert source.revision() != first

    artifacts = {artifact.location: artifact for artifact in source.discover()}
    assert (
        artifacts["docs/requirements/4200-widgets/SWR-4201-render.md"].revision
        != artifacts["docs/requirements/4200-widgets/SWR-4202-cache.md"].revision
    )


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_the_adapter_adds_no_second_parse_of_the_store(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Everything it reports comes from ReqToCode's parser, called once per read."""
    _write_store(tmp_path)
    calls: list[Path] = []
    real = parse_requirements

    def counting(repo_root: Path, layout: object = None) -> ParseResult:
        calls.append(repo_root)
        return real(repo_root, layout)  # type: ignore[arg-type]

    monkeypatch.setattr(
        "rotaris_core.requirements.sources.reqtocode.parse_requirements",
        counting,
    )
    source = ReqToCodeSource(tmp_path)

    read = source.read()

    assert len(calls) == 1, "one read is one parse"
    assert len(read.requirements) == 6
    assert read.revision  # the revision came out of the same parse


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_a_parse_error_is_a_located_issue_and_the_rest_still_loads(tmp_path: Path) -> None:
    """One malformed document must not turn the whole store into "no requirements"."""
    _write_store(tmp_path)
    (tmp_path / "docs" / "requirements" / "4200-widgets" / "SWR-4203-broken.md").write_text(
        '---\nreq-id: SWR-4203\nstatus: nonsense\ntitle: "Broken"\n---\n\n# Broken\n',
        encoding="utf-8",
    )

    read = ReqToCodeSource(tmp_path).read()

    assert "SWR-4203" not in read.by_id()
    assert len(read.requirements) == 6
    (issue,) = read.issues
    assert issue.location == "docs/requirements/4200-widgets/SWR-4203-broken.md"
    assert issue.req_id == "SWR-4203"
    assert "unknown status" in issue.message
    assert issue.source_id == "reqtocode"


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_the_epic_index_follows_the_stores_layout() -> None:
    """The rule that resolves an epic without re-reading the document."""
    store = "docs/requirements"

    assert epic_index_for(f"{store}/3100-sources/SWR-3103-x.md", store) == (
        f"{store}/3100-sources.md"
    )
    # A document directly in the store is its own index (a multi-id spec file).
    assert epic_index_for(f"{store}/2300-traceability.md", store) == f"{store}/2300-traceability.md"
    # Deeper nesting still belongs to its top-level block.
    assert epic_index_for(f"{store}/3100-sources/sub/SWR-3104.md", store) == (
        f"{store}/3100-sources.md"
    )
    # A path outside the store is left alone rather than reinterpreted.
    assert epic_index_for("elsewhere/SWR-1.md", store) == "elsewhere/SWR-1.md"


@pytest.mark.unit
@verifies(SWR.SWR_3103)
def test_the_source_locates_a_requirement_for_refusals_and_detail_views(tmp_path: Path) -> None:
    """A write refusal must be able to name the file it would have touched."""
    source = ReqToCodeSource(_write_store(tmp_path))

    assert source.locate("SWR-4202") == "docs/requirements/4200-widgets/SWR-4202-cache.md"
    assert source.locate("SWR-4301") == "docs/requirements/4300-legacy.md"
    assert source.locate("SWR-9999") is None
    # An unreadable store answers "unknown" rather than inventing a location.
    assert ReqToCodeSource(tmp_path / "gone").locate("SWR-4201") is None


@pytest.mark.unit
@verifies(SWR.SWR_3107)
def test_reformatting_the_store_does_not_move_a_hash_but_rewording_does(tmp_path: Path) -> None:
    """The property `satisfied_hash`, snapshots and change detection all rest on.

    A hash that moves when a frontmatter key is reordered or a line gains trailing
    whitespace would drop delivered requirements into "Needs Update" for a
    formatting pass; a hash that stays put when a sentence changes would hide a
    real change. Both halves are asserted through the built-in adapter, because
    that is the adapter every requirement in this repository comes from.
    """
    _write_store(tmp_path)
    render = tmp_path / "docs" / "requirements" / "4200-widgets" / "SWR-4201-render.md"
    before = ReqToCodeSource(tmp_path).read().by_id()["SWR-4201"]

    reordered = PRODUCT.replace(
        'title: "A widget can be rendered"\nepic: SWR-4200\n',
        'epic: SWR-4200\ntitle: "A widget can be rendered"\n',
    )
    render.write_text(reordered + "   \n", encoding="utf-8")
    after = ReqToCodeSource(tmp_path).read().by_id()["SWR-4201"]

    assert after.current_hash == before.current_hash
    # The store's own token *did* move — the file changed — which is exactly why
    # the two are different fields rather than one.
    assert after.source_hash != before.source_hash

    render.write_text(
        PRODUCT.replace("The user sees a widget.", "The user sees a widget and its label."),
        encoding="utf-8",
    )
    reworded = ReqToCodeSource(tmp_path).read().by_id()["SWR-4201"]
    assert reworded.current_hash != before.current_hash


@pytest.mark.unit
@verifies(SWR.SWR_3111)
def test_an_edit_is_written_into_the_store_and_read_back_from_it(tmp_path: Path) -> None:
    """The declared `update` capability is performed, not promised."""
    _write_store(tmp_path)
    source = ReqToCodeSource(tmp_path)
    widgets = tmp_path / "docs" / "requirements" / "4200-widgets"
    untouched = (widgets / "SWR-4202-cache.md").read_bytes()

    updated = source.update("SWR-4201", RequirementEdit(description="The user sees two widgets."))

    assert updated.description == "The user sees two widgets."
    text = (widgets / "SWR-4201-render.md").read_text(encoding="utf-8")
    assert "The user sees two widgets." in text
    # Unmodelled frontmatter and the store's own field order survive the edit.
    assert 'title: "A widget can be rendered"' in text
    assert "epic: SWR-4200" in text
    assert (widgets / "SWR-4202-cache.md").read_bytes() == untouched
    # The hash reported afterwards is the one the store now holds, read back
    # through the source rather than computed from the edit (SWR-3111).
    fresh = ReqToCodeSource(tmp_path).read().by_id()["SWR-4201"]
    assert (updated.current_hash, updated.source_hash) == (fresh.current_hash, fresh.source_hash)


@pytest.mark.unit
@verifies(SWR.SWR_3112)
def test_a_created_requirement_lands_in_the_store_the_way_the_store_writes_them(
    tmp_path: Path,
) -> None:
    """A declared `create` must produce a document the store's own parser accepts."""
    _write_store(tmp_path)
    source = ReqToCodeSource(tmp_path, today=lambda: "2026-08-14")

    created = source.create(
        RequirementDraft(
            title="A widget can be resized",
            description="The user drags the widget's corner.",
            parent="SWR-4200",
        ),
    )

    assert created.req_id == "SWR-4203"
    assert created.parent == "SWR-4200"
    assert created.description == "The user drags the widget's corner."
    assert created.source_path == (
        "docs/requirements/4200-widgets/SWR-4203-a-widget-can-be-resized.md"
    )
    assert (tmp_path / created.source_path).is_file()
    assert "SWR-4203" in {meta.req_id for meta in parse_requirements(tmp_path).requirements}


@pytest.mark.unit
@verifies(SWR.SWR_3113)
def test_a_deletion_removes_the_document_and_its_epic_index_row(tmp_path: Path) -> None:
    """A declared `delete` that only removed the file would leave a dead index link."""
    _write_store(tmp_path)
    store = tmp_path / "docs" / "requirements"
    source = ReqToCodeSource(tmp_path)

    source.delete("SWR-4202")

    assert not (store / "4200-widgets" / "SWR-4202-cache.md").exists()
    index = (store / "4200-widgets.md").read_text(encoding="utf-8")
    assert "SWR-4202" not in index
    assert "SWR-4201" in index, "the sibling's row is untouched"
    assert "SWR-4202" not in source.read().by_id()


@pytest.mark.unit
@verifies(SWR.SWR_3116)
def test_an_unchanged_document_is_not_read_again_and_a_narrow_refresh_reads_only_one(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Re-reading every document for a one-file edit is the board freeze SWR-3116 forbids."""
    _write_store(tmp_path)
    reads: list[str] = []
    real = _read_document_text

    def counting(path: Path) -> str:
        reads.append(path.name)
        return real(path)

    monkeypatch.setattr(
        "rotaris_core.requirements.sources.reqtocode._read_document_text",
        counting,
    )
    source = ReqToCodeSource(tmp_path)

    source.read()
    assert sorted(reads) == [
        "4200-widgets.md",
        "4300-legacy.md",
        "SWR-4201-render.md",
        "SWR-4202-cache.md",
    ]

    reads.clear()
    source.read()
    assert reads == [], "nothing moved, so nothing is opened again"

    render = tmp_path / "docs" / "requirements" / "4200-widgets" / "SWR-4201-render.md"
    render.write_text(PRODUCT.replace("a widget", "a big widget"), encoding="utf-8")
    reads.clear()
    narrow = source.read_artifacts(["docs/requirements/4200-widgets/SWR-4201-render.md"])

    assert reads == ["SWR-4201-render.md"], "only the requested artefact is opened"
    assert narrow.requirement_ids == ("SWR-4201",)
    assert narrow.revision == source.revision()


class _RecordedHistory:
    """An ``ArtifactHistory`` over texts held in memory, for a hermetic test."""

    def __init__(self, texts: dict[tuple[str, str], str]) -> None:
        self._texts = texts

    def read_text_at(self, location: str, revision: str) -> str | None:
        return self._texts.get((location, revision))

    def locations_at(self, revision: str, prefix: str) -> tuple[str, ...]:
        return tuple(
            sorted(
                location
                for (location, at) in self._texts
                if at == revision and location.startswith(prefix)
            ),
        )


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_a_requirement_can_be_read_as_it_was_at_a_past_revision(tmp_path: Path) -> None:
    """Impact analysis (SWR-3503) needs both texts, and Rotaris may keep neither.

    So the *source* is asked. The old version arrives as a full canonical
    requirement — prose included — stamped with the revision it came from, which
    is what makes "typo or behaviour change" a decidable question instead of a
    hash comparison that can only say "something moved".
    """
    _write_store(tmp_path)
    location = "docs/requirements/4200-widgets/SWR-4201-render.md"
    gone = "docs/requirements/4200-widgets/SWR-4204-removed.md"
    history = _RecordedHistory(
        {
            (location, "v1"): PRODUCT.replace(
                "The user sees a widget.",
                "The user sees a widget somewhere.",
            ),
            (gone, "v1"): PRODUCT.replace("SWR-4201", "SWR-4204").replace(
                "A widget can be rendered",
                "A widget can be removed",
            ),
        },
    )
    source = ReqToCodeSource(tmp_path, history=history)

    assert source.provides_history
    before = source.read_requirement_at("SWR-4201", "v1")
    now = source.read().by_id()["SWR-4201"]

    assert before is not None
    assert before.description == "The user sees a widget somewhere."
    assert before.title == now.title
    assert before.current_hash != now.current_hash
    assert before.source_revision == "v1"
    # The epic still resolves: a historical read reporting every requirement as a
    # root would show a lost parent in every diff.
    assert before.parent == "SWR-4200"

    # A requirement the store no longer declares is found through the store's own
    # file naming, which is what makes a *removed* requirement diffable at all.
    removed = source.read_requirement_at("SWR-4204", "v1")
    assert removed is not None
    assert removed.title == "A widget can be removed"

    # A revision that never held the requirement is a real answer, not a guess.
    assert source.read_requirement_at("SWR-4201", "v0") is None


@pytest.mark.unit
@verifies(SWR.SWR_3102)
def test_a_store_without_version_control_states_that_it_has_no_history(tmp_path: Path) -> None:
    """A stated gap a caller can fall back from beats an invented old version."""
    _write_store(tmp_path)
    source = ReqToCodeSource(tmp_path)

    assert not source.provides_history
    assert history_of(source) is None
    with pytest.raises(SourceHistoryUnavailable, match="cannot reconstruct"):
        source.read_requirement_at("SWR-4201", "v1")

    # Wired up automatically for a workspace that *is* a checkout.
    (tmp_path / ".git").mkdir()
    wired = reqtocode_source_for(tmp_path)
    assert wired is not None
    assert wired.provides_history
    assert history_of(wired) is wired


@pytest.mark.unit
@verifies(SWR.SWR_3606, SWR.SWR_3112)
def test_the_store_answers_where_a_creation_would_land_and_a_read_only_source_does_not(
    tmp_path: Path,
) -> None:
    """Productive use: a creation form asks where the draft would be written.
    Expected outcome: the built-in store answers with the location its own write
    would use, and an adapter that never declared previews is not asked at all.

    The ask-first shape is the point, and it mirrors `history_of` exactly: every
    `BaseRequirementSource` carries `preview_creation` precisely so that it can
    refuse, so the method's presence says nothing and the *declaration* decides.
    A surface that probed for the method would be told "yes" by every adapter in
    the repository.
    """
    _write_store(tmp_path)
    source = ReqToCodeSource(tmp_path)
    draft = RequirementDraft(title="Export a CSV", parent="SWR-4200")

    assert source.previews_creation is True
    previewing = preview_of(source)
    assert previewing is source

    planned = previewing.preview_creation(draft)

    assert planned.req_id.startswith("SWR-42")
    assert planned.path.endswith(".md")
    assert not pathlib.Path(planned.path).exists(), "a preview must not write anything"
    # The one answer, not a second rule that happens to agree with it today.
    assert source.create(draft).req_id == planned.req_id
