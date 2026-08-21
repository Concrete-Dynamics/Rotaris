"""Productive use: a project keeps product requirements in a Markdown store and customer
requests in a tracker, and the user sees one board that tells them which requirement came
from where.
Expected outcome: several sources merge into one index with per-requirement attribution,
an id two sources claim is reported naming both of them and both artefacts, a source
that cannot be read is named while the others still load, and relations resolve across
source boundaries."""

from __future__ import annotations

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import CanonicalRequirement, Relation, RelationKind
from rotaris_core.requirements.registry import Availability, RequirementRegistry
from rotaris_core.requirements.relations import RelationIssueKind
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    SourceIssue,
    SourceRead,
)

pytestmark = pytest.mark.unit


class FakeSource(BaseRequirementSource):
    """A source whose content, revision and health the test drives."""

    def __init__(
        self,
        source_id: str,
        requirements: tuple[CanonicalRequirement, ...],
        *,
        issues: tuple[SourceIssue, ...] = (),
    ) -> None:
        self._source_id = source_id
        self.requirements = requirements
        self.issues = issues
        self.revision_token = "r1"
        self.broken = False
        self.reads = 0

    @property
    def source_id(self) -> str:
        return self._source_id

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return tuple(
            RequirementArtifact(
                artifact_id=requirement.req_id,
                location=requirement.source_path or "",
                requirement_ids=(requirement.req_id,),
            )
            for requirement in self.requirements
        )

    def read(self) -> SourceRead:
        if self.broken:
            raise self.fail("the tracker is unreachable", location="https://tracker/api")
        self.reads += 1
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision_token,
            requirements=self.requirements,
            issues=self.issues,
        )

    def revision(self) -> str:
        if self.broken:
            raise self.fail("the tracker is unreachable", location="https://tracker/api")
        return self.revision_token


def _requirement(req_id: str, title: str, path: str, **extra: object) -> CanonicalRequirement:
    return CanonicalRequirement(req_id=req_id, title=title, source_path=path, **extra)


@verifies(SWR.SWR_3115)
def test_two_sources_merge_into_one_attributed_index() -> None:
    """One board, and every requirement still says where it came from."""
    house = FakeSource(
        "house",
        (
            _requirement("SWR-1", "Import a CSV", "docs/requirements/SWR-1.md"),
            _requirement("SWR-2", "Export a CSV", "docs/requirements/SWR-2.md"),
        ),
    )
    tracker = FakeSource(
        "tracker",
        (_requirement("REQ-90", "Customer wants dark mode", "https://tracker/REQ-90"),),
    )

    index = RequirementRegistry([house, tracker]).refresh()

    assert index.ids == ("REQ-90", "SWR-1", "SWR-2")
    assert index.source_of("SWR-1") == "house"
    assert index.source_of("REQ-90") == "tracker"
    assert [one.req_id for one in index.of_source("house")] == ["SWR-1", "SWR-2"]
    assert index.revisions == {"house": "r1", "tracker": "r1"}
    assert index.collisions == ()
    assert index.failures == ()


@verifies(SWR.SWR_3115)
def test_a_colliding_id_names_both_sources_and_both_artefacts() -> None:
    """Neither source shadows the other silently; the duplicate is reported."""
    house = FakeSource("house", (_requirement("SWR-1", "Import a CSV", "docs/SWR-1.md"),))
    tracker = FakeSource(
        "tracker",
        (_requirement("SWR-1", "Something else entirely", "https://tracker/SWR-1"),),
    )

    index = RequirementRegistry([house, tracker]).refresh()

    assert len(index.collisions) == 1
    collision = index.collisions[0]
    assert collision.req_id == "SWR-1"
    assert [claim.source_id for claim in collision.claims] == ["house", "tracker"]
    assert [claim.location for claim in collision.claims] == [
        "docs/SWR-1.md",
        "https://tracker/SWR-1",
    ]
    assert "house (docs/SWR-1.md)" in collision.message
    assert "tracker (https://tracker/SWR-1)" in collision.message
    # Deterministic: the first configured source wins, so the board is usable.
    assert collision.winner == "house"
    assert index.source_of("SWR-1") == "house"
    requirement = index.requirement("SWR-1")
    assert requirement is not None
    assert requirement.title == "Import a CSV"


@verifies(SWR.SWR_3115)
def test_one_unreadable_source_does_not_empty_the_board() -> None:
    """The failure is named; the other source's requirements are still there."""
    house = FakeSource("house", (_requirement("SWR-1", "Import a CSV", "docs/SWR-1.md"),))
    tracker = FakeSource("tracker", (_requirement("REQ-90", "Dark mode", "t/REQ-90"),))
    registry = RequirementRegistry([house, tracker])
    registry.refresh()

    tracker.broken = True
    index = registry.refresh()

    assert index.ids == ("SWR-1",)
    assert len(index.failures) == 1
    failure = index.failures[0]
    assert failure.source_id == "tracker"
    assert "unreachable" in failure.message
    assert failure.location == "https://tracker/api"
    assert failure.error_type == "RequirementSourceError"
    # The board says "unavailable" rather than serving the last read (SWR-3114).
    assert index.availability("REQ-90") is Availability.SOURCE_UNAVAILABLE
    assert index.requirement("REQ-90") is None
    assert "could not be read" in index.unavailable_reason("REQ-90")


@verifies(SWR.SWR_3115)
def test_a_failing_source_recovers_on_the_next_refresh() -> None:
    """An outage is not a one-way door: the next successful read restores the board."""
    tracker = FakeSource("tracker", (_requirement("REQ-90", "Dark mode", "t/REQ-90"),))
    registry = RequirementRegistry([tracker])
    tracker.broken = True
    registry.refresh()

    tracker.broken = False
    index = registry.refresh()

    assert index.ids == ("REQ-90",)
    assert index.failures == ()
    assert index.unavailable == ()
    assert index.availability("REQ-90") is Availability.AVAILABLE


@verifies(SWR.SWR_3115, SWR.SWR_3109)
def test_relations_cross_sources_and_unresolved_targets_are_dangling() -> None:
    """A cross-source relation is a relation; an unresolved one is named as dangling."""
    house = FakeSource(
        "house",
        (
            _requirement("SWR-1", "Import a CSV", "docs/SWR-1.md"),
            _requirement(
                "SWR-2",
                "Export a CSV",
                "docs/SWR-2.md",
                relations=(Relation(kind=RelationKind.DEPENDS_ON, target="REQ-90"),),
            ),
        ),
    )
    tracker = FakeSource(
        "tracker",
        (
            _requirement(
                "REQ-90",
                "Dark mode",
                "t/REQ-90",
                relations=(Relation(kind=RelationKind.DEPENDS_ON, target="REQ-404"),),
            ),
        ),
    )

    graph = RequirementRegistry([house, tracker]).refresh().relation_graph()

    assert graph.targets("SWR-2", RelationKind.DEPENDS_ON) == ("REQ-90",)
    assert [issue.target for issue in graph.dangling] == ["REQ-404"]
    assert graph.dangling[0].kind is RelationIssueKind.DANGLING_TARGET
    assert graph.dangling[0].req_id == "REQ-90"


@verifies(SWR.SWR_3115)
def test_source_issues_are_carried_without_losing_the_read() -> None:
    """A skipped file is reported and the rest of the source still loads."""
    house = FakeSource(
        "house",
        (_requirement("SWR-1", "Import a CSV", "docs/SWR-1.md"),),
        issues=(
            SourceIssue(
                source_id="house",
                message="docs/broken.md has no id",
                location="docs/broken.md",
            ),
        ),
    )

    index = RequirementRegistry([house]).refresh()

    assert index.ids == ("SWR-1",)
    assert [issue.location for issue in index.issues] == ["docs/broken.md"]


@verifies(SWR.SWR_3115)
def test_an_empty_registry_answers_rather_than_raising() -> None:
    """A workspace with no configured source has no requirements, not an error."""
    registry = RequirementRegistry()

    index = registry.refresh()

    assert index.requirements == ()
    assert index.availability("SWR-1") is Availability.UNKNOWN
    assert "not declared by any configured requirement source" in index.unavailable_reason("SWR-1")
    assert registry.sources() == ()


@verifies(SWR.SWR_3115)
def test_the_index_exposes_hierarchy_and_relations_over_every_source() -> None:
    """Epic in one source, child in another: the hierarchy still resolves (SWR-3108)."""
    house = FakeSource("house", (_requirement("SWR-4200", "Import epic", "docs/epic.md"),))
    tracker = FakeSource(
        "tracker",
        (_requirement("SWR-4201", "Import a CSV", "t/1", parent="SWR-4200"),),
    )

    hierarchy = RequirementRegistry([house, tracker]).refresh().hierarchy()

    assert hierarchy.children_of("SWR-4200") == ("SWR-4201",)
    assert hierarchy.parent_of("SWR-4201") == "SWR-4200"
    assert hierarchy.issues == ()
