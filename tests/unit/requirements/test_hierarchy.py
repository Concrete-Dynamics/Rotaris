"""Productive use: a user looks at an epic and sees exactly the requirements below it,
even when the project's own store is half-finished.
Expected outcome: nesting of any depth resolves, children come out in id order, and a
missing or circular parent is reported by name instead of hiding or hanging."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import (
    CanonicalRequirement,
    HierarchyIssueKind,
    Relation,
    RelationKind,
    build_hierarchy,
)


def _requirement(req_id: str, parent: str | None = None, **fields: object) -> CanonicalRequirement:
    return CanonicalRequirement(req_id=req_id, parent=parent, **fields)  # type: ignore[arg-type]


@pytest.mark.unit
@verifies(SWR.SWR_3108)
def test_an_epic_exposes_exactly_its_children_in_id_order() -> None:
    """The epic card (SWR-3308) reads its children from here, deterministically."""
    hierarchy = build_hierarchy(
        [
            _requirement("SWR-3100"),
            _requirement("SWR-3110", parent="SWR-3100"),
            _requirement("SWR-3102", parent="SWR-3100"),
            _requirement("SWR-3101", parent="SWR-3100"),
            _requirement("SWR-3200"),
        ],
    )

    assert hierarchy.children_of("SWR-3100") == ("SWR-3101", "SWR-3102", "SWR-3110")
    assert hierarchy.children_of("SWR-3200") == ()
    assert hierarchy.roots == ("SWR-3100", "SWR-3200")
    assert hierarchy.issues == ()


@pytest.mark.unit
@verifies(SWR.SWR_3108)
def test_nesting_is_not_limited_to_two_levels() -> None:
    """A store nesting epic → group → requirement → sub-requirement resolves whole."""
    hierarchy = build_hierarchy(
        [
            _requirement("SWR-1"),
            _requirement("SWR-2", parent="SWR-1"),
            _requirement("SWR-3", parent="SWR-2"),
            _requirement("SWR-4", parent="SWR-3"),
        ],
    )

    assert hierarchy.depth("SWR-1") == 0
    assert hierarchy.depth("SWR-4") == 3
    assert hierarchy.ancestors("SWR-4") == ("SWR-3", "SWR-2", "SWR-1")
    assert hierarchy.descendants("SWR-1") == ("SWR-2", "SWR-3", "SWR-4")
    assert hierarchy.parent_of("SWR-3") == "SWR-2"


@pytest.mark.unit
@verifies(SWR.SWR_3108)
def test_a_dangling_parent_is_reported_and_the_requirement_stays_reachable() -> None:
    """An incomplete source still loads: the child becomes a root and is named."""
    hierarchy = build_hierarchy(
        [
            _requirement("SWR-2", parent="SWR-999", source_path="specs/two.md"),
            _requirement("SWR-3", parent="SWR-2"),
        ],
    )

    assert [issue.kind for issue in hierarchy.issues] == [HierarchyIssueKind.DANGLING_PARENT]
    issue = hierarchy.dangling_parents[0]
    assert (issue.req_id, issue.parent) == ("SWR-2", "SWR-999")
    assert "specs/two.md" in issue.message
    assert "SWR-999" in issue.message

    # Kept as a root, with its own subtree intact.
    assert hierarchy.roots == ("SWR-2",)
    assert hierarchy.parent_of("SWR-2") is None
    assert hierarchy.requirement("SWR-2") is not None
    assert hierarchy.children_of("SWR-2") == ("SWR-3",)


@pytest.mark.unit
@verifies(SWR.SWR_3108)
def test_a_parent_cycle_is_reported_once_and_never_loops() -> None:
    """A circular store is a bug in the store, not a hang in Rotaris."""
    hierarchy = build_hierarchy(
        [
            _requirement("SWR-1", parent="SWR-3"),
            _requirement("SWR-2", parent="SWR-1"),
            _requirement("SWR-3", parent="SWR-2"),
            _requirement("SWR-4", parent="SWR-1"),
        ],
    )

    assert hierarchy.cycles == (("SWR-1", "SWR-2", "SWR-3"),)
    assert [issue.kind for issue in hierarchy.issues] == [HierarchyIssueKind.PARENT_CYCLE]
    assert "SWR-1 -> SWR-2 -> SWR-3 -> SWR-1" in hierarchy.issues[0].message

    # Every cycle member survives as a root; traversal terminates.
    assert set(hierarchy.roots) == {"SWR-1", "SWR-2", "SWR-3"}
    assert hierarchy.ancestors("SWR-1") == ()
    assert hierarchy.descendants("SWR-1") == ("SWR-4",)
    assert hierarchy.depth("SWR-2") == 0


@pytest.mark.unit
@verifies(SWR.SWR_3108)
def test_children_are_computed_and_never_authored() -> None:
    """The parent is the one authored direction; children exist only as a result."""
    child = _requirement("SWR-2", parent="SWR-1")

    assert "children" not in CanonicalRequirement.model_fields
    with pytest.raises(ValidationError):
        CanonicalRequirement(req_id="SWR-1", children=("SWR-2",))  # type: ignore[call-arg]

    hierarchy = build_hierarchy([_requirement("SWR-1"), child])
    assert hierarchy.children_of("SWR-1") == ("SWR-2",)


@pytest.mark.unit
@verifies(SWR.SWR_3108)
def test_a_parent_authored_as_a_relation_builds_the_same_hierarchy() -> None:
    """Whichever way a source expresses the parent, the hierarchy is one shape."""
    hierarchy = build_hierarchy(
        [
            _requirement("SWR-1"),
            CanonicalRequirement(
                req_id="SWR-2",
                relations=(Relation(kind=RelationKind.PARENT, target="SWR-1"),),
            ),
        ],
    )

    assert hierarchy.children_of("SWR-1") == ("SWR-2",)
    assert hierarchy.parent_of("SWR-2") == "SWR-1"
