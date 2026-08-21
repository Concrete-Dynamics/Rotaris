"""Productive use: a project's requirement store grows to the size a real one reaches,
and a user moves a card, filters the board, or simply opens it.
Expected outcome: the pass that answers costs no more than linear in the store, and
every answer it gives is the answer the scan it replaced gave — a board that got
faster by getting different would be a worse product, not a better one (SWR-3223).

The two structures under test are frozen and published in one rebind, so grouping
their contents by the key their readers ask for is a *shape*, not a cache with a
lifetime. That is the whole safety argument, and these tests are what hold it up:
the equality oracle asserts the shape answers what the scan answered, and the
invisibility tests assert the shape cannot be observed from outside.

Timing is deliberately almost absent. One test asserts a *ratio* — a lookup over a
hundred times more edges must not cost a hundred times more — because that is the
only form of the claim that survives being run on a shared CI runner, and because
the regression it guards against (a reintroduced scan) is two orders of magnitude,
not ten percent. Everything else here is exact.
"""

from __future__ import annotations

import datetime as dt
import time
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
)
from rotaris_core.requirements.registry import Availability, RequirementIndex
from rotaris_core.requirements.relations import (
    ReverseRelationKind,
    build_relation_graph,
    reverse_kind,
)
from rotaris_core.requirements.tombstones import Tombstone

if TYPE_CHECKING:
    from rotaris_core.requirements.relations import RelationGraph

pytestmark = pytest.mark.unit


def _requirements(n: int, *, linked: bool = True) -> tuple[CanonicalRequirement, ...]:
    """*n* requirements where every fourth one derives from the one before it.

    The density is this repository's own: 1527 requirements carrying 3054 authored
    edges. A store of isolated requirements would make every lookup trivially
    cheap and would prove nothing.
    """
    built: list[CanonicalRequirement] = []
    for number in range(1, n + 1):
        derives = linked and number % 4 == 0
        built.append(
            CanonicalRequirement(
                req_id=f"SWR-{number}",
                title=f"Requirement {number}",
                description="A requirement.",
                source_id="synthetic",
                current_hash=f"hash-{number}",
                relations=(
                    (Relation(kind=RelationKind.DERIVED_FROM, target=f"SWR-{number - 1}"),)
                    if derives
                    else ()
                ),
            ),
        )
    return tuple(built)


def _scan_outgoing(graph: RelationGraph, req_id: str, kind: RelationKind | None = None) -> tuple:
    """What `outgoing` meant before it was indexed: a filter over every edge."""
    return tuple(
        edge
        for edge in graph.edges
        if edge.source == req_id and (kind is None or edge.kind is kind)
    )


def _scan_incoming(
    graph: RelationGraph,
    req_id: str,
    kind: ReverseRelationKind | None = None,
) -> tuple:
    """What `incoming` meant before it was indexed."""
    return tuple(
        edge
        for edge in graph.reverse_edges
        if edge.source == req_id and (kind is None or edge.kind is kind)
    )


@verifies(SWR.SWR_3223, SWR.SWR_3109, SWR.SWR_3110)
def test_every_relation_lookup_answers_what_the_scan_it_replaced_answered() -> None:
    """Productive use: the board asks what a requirement derives from and what derives from it.
    Expected outcome: the indexed answer and the scanned answer are the same tuple,
    in the same order, for every requirement and every kind — including the ids that
    have no relations at all, which is the case an index is most likely to lose.

    Asserted against the scan itself rather than against recorded values: a recorded
    expectation can only catch a change someone thought to record, and the property
    is "these two agree", not "this equals what it was on a Tuesday".
    """
    graph = build_relation_graph(_requirements(200))
    ids = [f"SWR-{number}" for number in range(1, 201)] + ["SWR-9999", ""]

    for req_id in ids:
        assert graph.outgoing(req_id) == _scan_outgoing(graph, req_id), req_id
        assert graph.incoming(req_id) == _scan_incoming(graph, req_id), req_id
        for kind in RelationKind:
            assert graph.outgoing(req_id, kind) == _scan_outgoing(graph, req_id, kind)
            assert graph.targets(req_id, kind) == tuple(
                edge.target for edge in _scan_outgoing(graph, req_id, kind)
            )
        for reverse in ReverseRelationKind:
            assert graph.incoming(req_id, reverse) == _scan_incoming(graph, req_id, reverse)
            assert graph.sources(req_id, reverse) == tuple(
                edge.target for edge in _scan_incoming(graph, req_id, reverse)
            )

    # The fixture is only meaningful if it actually produced edges in both directions.
    assert graph.outgoing("SWR-4", RelationKind.DERIVED_FROM), "the fixture authored no edges"
    assert graph.incoming("SWR-3", reverse_kind(RelationKind.DERIVED_FROM))


@verifies(SWR.SWR_3223, SWR.SWR_3114, SWR.SWR_3113)
def test_every_index_lookup_answers_what_the_scan_it_replaced_answered() -> None:
    """Productive use: the projection asks whether each requirement can be answered for.
    Expected outcome: present, missing, source-unavailable and removed each resolve
    exactly as they did — the four branches of SWR-3114, over one index.
    """
    requirements = _requirements(50)
    index = RequirementIndex(
        requirements=requirements,
        tombstones=(
            Tombstone(
                req_id="SWR-900",
                source_id="synthetic",
                removed_at=dt.datetime(2026, 8, 18, tzinfo=dt.UTC),
            ),
        ),
    )

    for requirement in requirements:
        assert index.requirement(requirement.req_id) is requirement
        assert index.availability(requirement.req_id) is Availability.AVAILABLE
        assert index.unavailable_reason(requirement.req_id) == ""

    assert index.by_id() == {one.req_id: one for one in requirements}
    assert index.requirement("SWR-9999") is None
    assert index.availability("SWR-9999") is Availability.UNKNOWN
    assert index.tombstone("SWR-900") is not None
    assert index.availability("SWR-900") is Availability.REMOVED
    assert index.tombstone("SWR-1") is None


@verifies(SWR.SWR_3223, SWR.SWR_3216)
def test_the_shapes_the_lookups_are_stored_in_cannot_be_observed_from_outside() -> None:
    """Productive use: a board is projected, serialised into the desktop's state, compared
    against the previous one to find what moved (SWR-3312), and hashed nowhere.
    Expected outcome: none of that notices the grouping — the models stay frozen, stay
    equal to their equals, stay hashable, and dump exactly the fields they declare.

    This is the test that would fail if the grouping were stored as a field, or if a
    future Pydantic compared instance dictionaries rather than declared fields. Both
    are real ways for a purely internal shape to become a visible difference, and
    both would show up here as an inequality rather than as a mystery in a diff.
    """
    requirements = _requirements(20)
    warmed, cold = build_relation_graph(requirements), build_relation_graph(requirements)
    warmed.outgoing("SWR-4")

    assert warmed == cold, "asking one graph a question made it unequal to its twin"
    assert warmed.model_dump_json() == cold.model_dump_json()
    assert sorted(warmed.model_dump()) == ["edges", "issues", "reverse_edges"]
    assert isinstance(hash(warmed), int), "the graph stopped being hashable"

    first, second = (
        RequirementIndex(requirements=requirements),
        RequirementIndex(requirements=requirements),
    )
    first.by_id()

    assert first == second
    assert first.model_dump_json() == second.model_dump_json()
    assert "_by_id" not in first.model_dump()
    with pytest.raises(Exception, match="frozen|Instance is frozen"):
        first.requirements = ()  # type: ignore[misc]


@verifies(SWR.SWR_3223)
def test_the_id_map_is_built_once_however_often_the_index_is_asked() -> None:
    """Productive use: the projection asks `availability` once per requirement, and each
    of those asks used to rebuild a map of every requirement in the store.
    Expected outcome: the same mapping object comes back, so the cost is paid once.

    Identity rather than a call count: the property is that there is one map, and
    identity is what says so without instrumenting anything.
    """
    index = RequirementIndex(requirements=_requirements(100))

    assert index.by_id() is index.by_id()

    graph = build_relation_graph(_requirements(100))
    assert graph.outgoing("SWR-4") is graph.outgoing("SWR-4")


@verifies(SWR.SWR_3223)
def test_a_lookup_over_a_far_larger_graph_does_not_cost_far_more() -> None:
    """Productive use: a store grows from a few hundred requirements to a few thousand.
    Expected outcome: asking one requirement what it points at costs what it cost
    before — the graph holding more relations about *other* requirements is not this
    requirement's problem.

    The only timed assertion here, and it is a ratio with two orders of magnitude of
    headroom: a scan over fifty times the edges costs about fifty times more, and
    this allows five. A ratio cancels out how fast the machine is, which is what
    makes an absolute budget the flakiest kind of test a repository can own.
    """
    small = build_relation_graph(_requirements(100))
    large = build_relation_graph(_requirements(5_000))
    assert len(large.edges) > 40 * len(small.edges), "the fixtures are not far enough apart"

    def cost(graph: RelationGraph) -> float:
        graph.outgoing("SWR-4")  # never time the first call: it builds the shape
        start = time.perf_counter()
        for _ in range(2_000):
            graph.outgoing("SWR-4", RelationKind.DERIVED_FROM)
        return time.perf_counter() - start

    ratio = cost(large) / max(cost(small), 1e-9)

    assert ratio < 5, (
        f"a lookup over {len(large.edges)} edges cost {ratio:.1f}x one over "
        f"{len(small.edges)}; the graph is scanning again"
    )
