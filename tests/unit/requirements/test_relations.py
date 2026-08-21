"""Productive use: a user asks what a requirement replaces, derives from or waits on,
and what is waiting on it.
Expected outcome: both directions are answerable from one authored edge, a target that
does not exist is reported by name rather than dropped, and a store that authored the
computed direction is told its field was ignored."""

from __future__ import annotations

import logging

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import (
    REVERSE_OF,
    CanonicalRequirement,
    Relation,
    RelationIssueKind,
    RelationKind,
    RequirementLifecycle,
    ReverseRelationKind,
    build_relation_graph,
    is_reverse_field,
    reverse_kind,
    strip_reverse_fields,
)


def _requirement(
    req_id: str,
    *relations: tuple[RelationKind, str],
    **fields: object,
) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        relations=tuple(Relation(kind=kind, target=target) for kind, target in relations),
        **fields,  # type: ignore[arg-type]
    )


@pytest.mark.unit
@verifies(SWR.SWR_3109)
@pytest.mark.parametrize("kind", list(RelationKind))
def test_every_kind_resolves_and_answers_in_both_directions(kind: RelationKind) -> None:
    """ "What does X point at" and "what points at X" are the same authored edge."""
    graph = build_relation_graph([_requirement("SWR-1", (kind, "SWR-2")), _requirement("SWR-2")])

    assert graph.targets("SWR-1", kind) == ("SWR-2",)
    assert graph.sources("SWR-2", reverse_kind(kind)) == ("SWR-1",)
    assert graph.outgoing("SWR-2") == ()
    assert graph.incoming("SWR-1") == ()
    assert graph.issues == ()


@pytest.mark.unit
@verifies(SWR.SWR_3109)
def test_the_enforced_kinds_of_the_built_in_store_round_trip() -> None:
    """ReqToCode's ``epic`` and ``derived-from`` arrive as queryable edges."""
    graph = build_relation_graph(
        [
            _requirement("SWR-3100"),
            _requirement("SWR-3101", parent="SWR-3100"),
            _requirement(
                "SWR-3116",
                (RelationKind.DERIVED_FROM, "SWR-3101"),
                parent="SWR-3100",
            ),
            _requirement("SWR-3117", (RelationKind.DEPENDS_ON, "SWR-3102")),
            _requirement("SWR-3102", (RelationKind.SUPERSEDES, "SWR-2330")),
            _requirement("SWR-2330"),
        ],
    )

    assert graph.sources("SWR-3100", ReverseRelationKind.CHILDREN) == ("SWR-3101", "SWR-3116")
    assert graph.sources("SWR-3101", ReverseRelationKind.DERIVED_REQUIREMENTS) == ("SWR-3116",)
    assert graph.sources("SWR-2330", ReverseRelationKind.SUPERSEDED_BY) == ("SWR-3102",)
    assert graph.sources("SWR-3102", ReverseRelationKind.BLOCKS) == ("SWR-3117",)
    assert graph.targets("SWR-3116", RelationKind.PARENT) == ("SWR-3100",)


@pytest.mark.unit
@verifies(SWR.SWR_3109)
def test_a_relation_to_an_unknown_id_is_reported_once_with_kind_and_target() -> None:
    """A dangling edge is evidence of an incomplete read, so it is named, not dropped."""
    graph = build_relation_graph(
        [
            _requirement(
                "SWR-1",
                (RelationKind.DEPENDS_ON, "SWR-404"),
                source_path="specs/one.md",
            ),
        ],
    )

    assert len(graph.dangling) == 1
    issue = graph.dangling[0]
    assert (issue.req_id, issue.relation_kind, issue.target) == (
        "SWR-1",
        RelationKind.DEPENDS_ON,
        "SWR-404",
    )
    assert "specs/one.md" in issue.message
    # The forward edge survives; only its reverse cannot exist.
    assert graph.targets("SWR-1", RelationKind.DEPENDS_ON) == ("SWR-404",)
    assert graph.incoming("SWR-404") == ()


@pytest.mark.unit
@verifies(SWR.SWR_3109)
def test_a_relation_to_a_deprecated_requirement_is_loaded_and_flagged() -> None:
    """Pointing at something on its way out is worth showing, not worth hiding."""
    graph = build_relation_graph(
        [
            _requirement("SWR-1", (RelationKind.DEPENDS_ON, "SWR-2")),
            _requirement("SWR-2", lifecycle=RequirementLifecycle.DEPRECATED),
        ],
    )

    assert graph.targets("SWR-1", RelationKind.DEPENDS_ON) == ("SWR-2",)
    assert graph.sources("SWR-2", ReverseRelationKind.BLOCKS) == ("SWR-1",)
    assert [issue.kind for issue in graph.issues] == [RelationIssueKind.DEPRECATED_TARGET]
    assert "deprecated" in graph.deprecated_targets[0].message


@pytest.mark.unit
@verifies(SWR.SWR_3110)
def test_every_resolved_forward_edge_yields_exactly_one_reverse_edge() -> None:
    """Completeness of the computed direction, asserted rather than assumed."""
    requirements = [
        _requirement("SWR-1", (RelationKind.SUPERSEDES, "SWR-2"), parent="SWR-9"),
        _requirement("SWR-2", (RelationKind.DEPENDS_ON, "SWR-3")),
        _requirement("SWR-3", (RelationKind.REFINES, "SWR-1")),
        _requirement("SWR-9"),
    ]
    graph = build_relation_graph(requirements)

    resolved = [edge for edge in graph.edges if edge.target in {r.req_id for r in requirements}]
    assert len(graph.reverse_edges) == len(resolved)
    for edge in resolved:
        matching = [
            reverse
            for reverse in graph.reverse_edges
            if reverse.source == edge.target
            and reverse.target == edge.source
            and reverse.kind is reverse_kind(edge.kind)
        ]
        assert len(matching) == 1, edge


@pytest.mark.unit
@verifies(SWR.SWR_3110)
def test_every_relation_kind_has_a_declared_reverse() -> None:
    """A new kind cannot be added without deciding what its opposite is called."""
    assert set(REVERSE_OF) == set(RelationKind)
    assert set(REVERSE_OF.values()) <= set(ReverseRelationKind)


@pytest.mark.unit
@verifies(SWR.SWR_3110)
def test_an_authored_reverse_field_is_ignored_with_a_warning_naming_the_file(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Two truths about one fact is worse than none: the authored direction wins."""
    fields = {
        "supersedes": "SWR-2",
        "superseded-by": "SWR-7",
        "Derived Requirements": "SWR-8",
        "children": "SWR-9",
        "title": "Something",
    }

    with caplog.at_level(logging.WARNING):
        kept, issues = strip_reverse_fields(
            fields,
            req_id="SWR-1",
            location="docs/requirements/SWR-1.md",
        )

    assert kept == {"supersedes": "SWR-2", "title": "Something"}
    assert {issue.field_name for issue in issues} == {
        "superseded-by",
        "Derived Requirements",
        "children",
    }
    assert all(issue.kind is RelationIssueKind.AUTHORED_REVERSE_FIELD for issue in issues)
    assert "docs/requirements/SWR-1.md" in caplog.text
    assert "superseded-by" in caplog.text


@pytest.mark.unit
@verifies(SWR.SWR_3110)
def test_symmetric_kinds_stay_authorable() -> None:
    """``conflicts-with`` is its own opposite, so it must not be rejected as computed."""
    assert is_reverse_field("superseded-by")
    assert is_reverse_field("derived_requirements")
    assert is_reverse_field("Children")
    assert not is_reverse_field("conflicts-with")
    assert not is_reverse_field("related-to")
    assert not is_reverse_field("supersedes")


@pytest.mark.unit
@verifies(SWR.SWR_3109)
def test_a_requirement_pointing_at_itself_is_reported_and_not_reversed() -> None:
    """Self-reference would otherwise show up as its own incoming relation."""
    graph = build_relation_graph([_requirement("SWR-1", (RelationKind.DEPENDS_ON, "SWR-1"))])

    assert [issue.kind for issue in graph.issues] == [RelationIssueKind.SELF_RELATION]
    assert graph.targets("SWR-1", RelationKind.DEPENDS_ON) == ("SWR-1",)
    assert graph.incoming("SWR-1") == ()


@pytest.mark.unit
@verifies(SWR.SWR_3109)
def test_the_graph_is_deterministic_across_input_order() -> None:
    """Change detection in slice 5 compares graphs; two reads must agree byte for byte."""
    requirements = [
        _requirement("SWR-10", (RelationKind.SUPERSEDES, "SWR-2")),
        _requirement("SWR-2", parent="SWR-1"),
        _requirement("SWR-1"),
    ]

    forward = build_relation_graph(requirements)
    backward = build_relation_graph(list(reversed(requirements)))

    assert forward.edges == backward.edges
    assert forward.reverse_edges == backward.reverse_edges
    # Natural id ordering, not lexicographic: SWR-2 before SWR-10.
    assert [edge.source for edge in forward.edges] == ["SWR-2", "SWR-10"]
