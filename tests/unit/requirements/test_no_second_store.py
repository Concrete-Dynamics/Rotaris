"""Productive use: a team's requirements stay in the project's own store; Rotaris shows
them, tracks delivery against them, and never becomes a second place where they live and
quietly diverge.
Expected outcome: nothing under ``<workspace>/.rotaris/requirements/`` contains
requirement prose, a cached read is discarded the moment the source's revision moves, and
a requirement whose source is gone is reported unavailable instead of served from
memory."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.requirements.registry import Availability, RequirementRegistry
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    SourceRead,
)
from rotaris_core.requirements.tombstones import (
    OPERATIONAL_RECORD_FIELDS,
    RequirementContentError,
    TombstoneStore,
    assert_operational_only,
    requirements_state_dir,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

TITLE = "Import a CSV with a preview"
DESCRIPTION = (
    "The user imports a CSV file, sees the parsed rows in a preview, and confirms "
    "before anything is written to the database."
)


class SpecStore(BaseRequirementSource):
    """A store whose content and health the test drives."""

    def __init__(self, source_id: str = "house") -> None:
        self._source_id = source_id
        self.titles = {"SWR-1": TITLE}
        self.revision_token = "r1"
        self.broken = False
        self.reads = 0

    @property
    def source_id(self) -> str:
        return self._source_id

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return tuple(
            RequirementArtifact(artifact_id=req_id, location=f"specs/{req_id}.md")
            for req_id in sorted(self.titles)
        )

    def revision(self) -> str:
        if self.broken:
            raise self.fail("the store is gone", location="specs/")
        return self.revision_token

    def read(self) -> SourceRead:
        if self.broken:
            raise self.fail("the store is gone", location="specs/")
        self.reads += 1
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision_token,
            requirements=tuple(
                CanonicalRequirement(
                    req_id=req_id,
                    title=title,
                    description=DESCRIPTION,
                    source_path=f"specs/{req_id}.md",
                )
                for req_id, title in sorted(self.titles.items())
            ),
        )


@verifies(SWR.SWR_3114)
def test_nothing_persisted_under_the_workspace_carries_requirement_prose(
    tmp_path: Path,
) -> None:
    """Acceptance, as a sweep of the directory rather than as a promise."""
    store = SpecStore()
    registry = RequirementRegistry([store])
    registry.refresh()

    del store.titles["SWR-1"]
    store.revision_token = "r2"
    registry.refresh()
    TombstoneStore(tmp_path).save(registry.tombstones)

    state_dir = requirements_state_dir(tmp_path)
    written = [path for path in state_dir.rglob("*") if path.is_file()]
    assert written, "the tombstone log should have been written for this test to mean anything"
    for path in written:
        text = path.read_text(encoding="utf-8")
        assert TITLE not in text
        assert DESCRIPTION not in text
        assert "title" not in text
        assert "description" not in text
        # What it *does* carry: identity, provenance, hash, time.
        assert "SWR-1" in text
        assert "specs/SWR-1.md" in text


@verifies(SWR.SWR_3114)
def test_the_persistence_boundary_refuses_requirement_content() -> None:
    """The guard every persisted record passes through, not a convention."""
    with pytest.raises(RequirementContentError, match="requirement content"):
        assert_operational_only(
            {"req_id": "SWR-1", "title": TITLE},
            where="delivery record SWR-1",
        )
    with pytest.raises(RequirementContentError, match="requirement content"):
        assert_operational_only(
            {"req_id": "SWR-1", "description": DESCRIPTION},
            where="delivery record SWR-1",
        )
    # An unknown key is refused too: the failure mode is a field arriving later.
    with pytest.raises(RequirementContentError, match="not an operational field"):
        assert_operational_only({"req_id": "SWR-1", "tooltip": TITLE}, where="record")

    assert_operational_only(
        {"req_id": "SWR-1", "current_hash": "abc", "state": "done"},
        where="record",
    )
    assert "title" not in OPERATIONAL_RECORD_FIELDS
    assert "description" not in OPERATIONAL_RECORD_FIELDS


@verifies(SWR.SWR_3114)
def test_a_tombstone_record_keeps_identity_and_drops_the_label(tmp_path: Path) -> None:
    """The in-memory tombstone knows the last title; the persisted one does not."""
    store = SpecStore()
    registry = RequirementRegistry([store])
    registry.refresh()
    del store.titles["SWR-1"]
    store.revision_token = "r2"
    registry.refresh()

    live = registry.tombstones.get("SWR-1")
    assert live is not None
    assert live.last_title == TITLE

    TombstoneStore(tmp_path).save(registry.tombstones)
    reloaded = TombstoneStore(tmp_path).load().get("SWR-1")
    assert reloaded is not None
    assert reloaded.last_title == ""
    assert reloaded.last_hash == live.last_hash
    assert reloaded.req_id == "SWR-1"


@verifies(SWR.SWR_3114)
def test_a_cached_read_is_discarded_when_the_revision_moves() -> None:
    """The only cache allowed is a revision-keyed read-through."""
    store = SpecStore()
    registry = RequirementRegistry([store])
    registry.refresh()
    registry.refresh()
    assert store.reads == 1

    store.titles["SWR-1"] = "Import a CSV without a preview"
    store.revision_token = "r2"
    index = registry.refresh()

    assert store.reads == 2
    requirement = index.requirement("SWR-1")
    assert requirement is not None
    assert requirement.title == "Import a CSV without a preview"


@verifies(SWR.SWR_3114)
def test_a_requirement_whose_source_is_gone_is_unavailable_not_remembered() -> None:
    """With the source removed, the product reports unavailable rather than stale text."""
    store = SpecStore()
    registry = RequirementRegistry([store])
    registry.refresh()

    store.broken = True
    index = registry.refresh()

    assert index.requirement("SWR-1") is None
    assert index.availability("SWR-1") is Availability.SOURCE_UNAVAILABLE
    assert index.ids == ()
    # What is remembered is that the id existed and where it lived — never its text.
    remembered = index.unavailable[0]
    assert remembered.req_id == "SWR-1"
    assert remembered.source_id == "house"
    dumped = index.model_dump_json()
    assert TITLE not in dumped
    assert DESCRIPTION not in dumped
