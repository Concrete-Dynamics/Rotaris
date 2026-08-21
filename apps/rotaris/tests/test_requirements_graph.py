"""The requirement-to-code-to-test graph (SWR-3310).

The graph answers the question a column cannot: what hangs off this requirement.
So the tests are about the three properties that make such a view usable rather
than decorative — it is assembled from the projection alone, it is *bounded* and
says where it stopped, and it is operable without a mouse, with a textual edge
listing carrying exactly the same edges as the picture.
"""

from __future__ import annotations

import datetime as dt

import pytest
from PySide6.QtWidgets import QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite
from ui_query import accessible_names, click_by_name, settle

from rotaris.models.requirements_state import (
    EvidenceSegment,
    RequirementCard,
    RequirementFact,
    RequirementsBoardState,
    build_board_state,
    build_detail,
)
from rotaris.models.store import WorkspaceStore
from rotaris.services.requirements_controller import RequirementsController
from rotaris.views.requirement_graph import (
    MAX_DEPTH,
    RequirementGraphView,
    build_neighbourhood,
)
from rotaris.views.requirements import RequirementsView

pytestmark = pytest.mark.unit

NOW = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)


def _card(
    req_id: str,
    *,
    epic: str = "",
    is_epic: bool = False,
    evidence: tuple[EvidenceSegment, ...] = (),
) -> RequirementCard:
    return RequirementCard(
        req_id=req_id,
        title=f"{req_id} title",
        lifecycle="approved",
        lifecycle_label="Approved",
        delivery="ready",
        delivery_label="Ready",
        health="healthy",
        health_label="Healthy",
        evidence_state="satisfied",
        evidence=evidence,
        facts=(RequirementFact(label="Epic", value=epic),) if epic else (),
        is_epic=is_epic,
    )


def _satisfied() -> tuple[EvidenceSegment, ...]:
    return tuple(
        EvidenceSegment(
            kind=kind,
            label=kind.capitalize(),
            state="satisfied",
            state_label="Satisfied",
        )
        for kind in ("implementation", "test")
    )


def _board() -> RequirementsBoardState:
    return RequirementsBoardState(
        cards=(
            _card("SWR-7000", is_epic=True),
            _card("SWR-7001", epic="SWR-7000", evidence=_satisfied()),
            _card("SWR-7002", epic="SWR-7000"),
        ),
        available=True,
    )


def _click_node(qtbot, root, prefix: str) -> None:
    """Click the graph node whose announced name starts with *prefix*.

    By prefix because a node announces the health the engine computed for it,
    and pinning that string here would make the test assert the engine's verdict
    rather than the graph's navigation.
    """
    names = [name for name in accessible_names(root, QPushButton) if name.startswith(prefix)]
    assert len(names) == 1, f"expected one node starting with {prefix!r}, found {names}"
    click_by_name(qtbot, root, names[0], QPushButton)


def _detail_for(req_id: str = "SWR-7001") -> object:
    """A real projection detail for one requirement with a relation and sites."""
    requirement = CanonicalRequirement(
        req_id=req_id,
        title=f"{req_id} title",
        description="The product does the thing.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path=f"docs/requirements/{req_id}.md",
        parent="SWR-7000",
    )
    epic = CanonicalRequirement(
        req_id="SWR-7000",
        title="SWR-7000 title",
        description="An epic.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path="docs/requirements/SWR-7000.md",
    )
    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(epic, requirement), generation=1),
            evidence={
                req_id: EvidenceInputs(
                    req_id=req_id,
                    requirement_hash=requirement.current_hash,
                    implementations=(RequirementSite(path="src/rotaris/thing.py", line=12),),
                    covering_tests=(
                        CoveringTest(
                            path="tests/unit/test_thing.py",
                            line=40,
                            executed=True,
                            check_name="pytest",
                            check_status="passed",
                        ),
                    ),
                ),
            },
            evaluated_at=NOW,
        ),
    )
    entry = projection.entry(req_id)
    assert entry is not None
    return build_detail(entry, now=NOW)


@verifies(SWR.SWR_3310)
def test_a_graph_carries_the_relations_implementations_and_tests_of_its_centre() -> None:
    """Productive use: an auditor asks what hangs off one requirement.
    Expected outcome: the epic above it, the module that implements it and the test that covers it."""
    graph = build_neighbourhood("SWR-7001", _board(), _detail_for(), depth=2)

    assert graph.center == "SWR-7001"
    assert graph.node("SWR-7001") is not None
    assert graph.node("SWR-7000") is not None
    ids = {node.node_id for node in graph.nodes}
    assert "implementation:src/rotaris/thing.py:12" in ids
    assert "test:tests/unit/test_thing.py:40" in ids
    # Health comes from the board's cards; obligation state from the projection.
    centre = graph.node("SWR-7001")
    assert centre is not None
    assert centre.health_label == "Healthy"
    # The sibling is two steps away, through the epic.
    sibling = graph.node("SWR-7002")
    assert sibling is not None
    assert sibling.depth == 2
    assert ("SWR-7000", "Child", "SWR-7002") in [
        (edge.source, edge.relation, edge.target) for edge in graph.edges
    ]


@verifies(SWR.SWR_3310)
def test_the_graph_is_bounded_and_states_where_it_stopped() -> None:
    """Productive use: a store of hundreds of requirements is explored, not rendered.
    Expected outcome: depth is clamped, and every unexpanded neighbour is named rather than dropped."""
    shallow = build_neighbourhood("SWR-7001", _board(), _detail_for(), depth=1)

    assert shallow.depth == 1
    assert shallow.node("SWR-7002") is None, "depth 1 reached two steps out"
    assert "SWR-7000" in shallow.beyond
    assert "SWR-7000" in shallow.bound_message
    assert "not expanded" in shallow.bound_message
    assert "re-centre" in shallow.bound_message

    clamped = build_neighbourhood("SWR-7001", _board(), _detail_for(), depth=99)
    assert clamped.depth == MAX_DEPTH
    assert f"of {MAX_DEPTH}" in clamped.bound_message


@verifies(SWR.SWR_3310)
def test_the_textual_alternative_lists_exactly_the_edges_the_picture_draws(qtbot) -> None:
    """Productive use: a screen-reader user explores the same neighbourhood.
    Expected outcome: the edge listing carries every edge, in the same order."""
    view = RequirementGraphView()
    qtbot.addWidget(view)

    view.show_graph("SWR-7001", _board(), _detail_for())

    lines = [view.edge_list.item(row).text() for row in range(view.edge_list.count())]
    assert lines == list(view.graph.edge_lines)
    assert "SWR-7001 → Parent epic → SWR-7000" in lines
    assert "SWR-7001 → Covering test → tests/unit/test_thing.py:40" in lines
    assert view.edge_list.accessibleName() == "Requirement graph edges"


@verifies(SWR.SWR_3310)
def test_selecting_a_node_recentres_the_graph_and_states_what_is_now_in_view(qtbot) -> None:
    """Productive use: a user follows the epic above a requirement to explore it.
    Expected outcome: the graph re-centres, says what is in view, and tells the host."""
    view = RequirementGraphView()
    qtbot.addWidget(view)
    view.show_graph("SWR-7001", _board(), _detail_for())
    view.show()
    qtbot.waitExposed(view)
    assert view.status.text().startswith("Centred on SWR-7001")
    # One of a thing is one of that thing: the summary is a sentence, not a
    # template a screen reader has to read the brackets out of.
    assert "1 implementation" in view.status.text()
    assert "1 test," in view.status.text()
    assert "(s)" not in view.status.text()

    with qtbot.waitSignal(view.node_activated, timeout=1000) as caught:
        _click_node(qtbot, view, "SWR-7000")

    assert caught.args == ["SWR-7000"]
    assert view.center == "SWR-7000"
    assert view.status.text().startswith("Centred on SWR-7000")
    assert "SWR-7001" in " ".join(accessible_names(view, QPushButton))


@verifies(SWR.SWR_3310)
def test_an_implementation_node_reaches_its_file_at_its_line(qtbot) -> None:
    """Productive use: a user in the graph wants the module that implements the requirement.
    Expected outcome: the node reports the open-file intent with the projection's path and line."""
    view = RequirementGraphView()
    qtbot.addWidget(view)
    view.show_graph("SWR-7001", _board(), _detail_for())
    view.show()
    qtbot.waitExposed(view)

    with qtbot.waitSignal(view.site_activated, timeout=1000) as caught:
        click_by_name(qtbot, view, "tests/unit/test_thing.py:40 — Satisfied", QPushButton)

    assert caught.args == ["tests/unit/test_thing.py", 40]


@pytest.mark.integration
@verifies(SWR.SWR_3310)
def test_a_graph_over_a_real_projection_expands_an_epic_to_its_children(qtbot) -> None:
    """Productive use: an owner opens the graph of a real epic in a real store.
    Expected outcome: the epic's children and their tests come from the projection alone."""
    epic = CanonicalRequirement(
        req_id="SWR-7100",
        title="Requirement graph",
        description="An epic with two children.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path="docs/requirements/SWR-7100.md",
    )
    children = tuple(
        CanonicalRequirement(
            req_id=req_id,
            title=f"{req_id} title",
            description="A child requirement.",
            lifecycle=RequirementLifecycle.APPROVED,
            source_id="reqtocode",
            source_path=f"docs/requirements/{req_id}.md",
            parent="SWR-7100",
        )
        for req_id in ("SWR-7101", "SWR-7102")
    )
    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(epic, *children), generation=2),
            evidence={
                "SWR-7101": EvidenceInputs(
                    req_id="SWR-7101",
                    requirement_hash=children[0].current_hash,
                    implementations=(RequirementSite(path="src/rotaris/a.py", line=3),),
                    covering_tests=(
                        CoveringTest(
                            path="tests/unit/test_a.py",
                            line=7,
                            executed=True,
                            check_name="pytest",
                            check_status="passed",
                        ),
                    ),
                ),
            },
            evaluated_at=NOW,
        ),
    )
    state = build_board_state(projection, now=NOW)
    entry = projection.entry("SWR-7101")
    assert entry is not None

    view = RequirementGraphView()
    qtbot.addWidget(view)
    view.show_graph("SWR-7101", state, build_detail(entry, now=NOW))

    graph = view.graph
    assert graph.node("SWR-7100") is not None, "the real parent relation was not followed"
    assert graph.node("SWR-7102") is not None, "the sibling below the epic is not in view"
    assert "SWR-7101 → Covering test → tests/unit/test_a.py:7" in graph.edge_lines
    assert "SWR-7101 → Implementation → src/rotaris/a.py:3" in graph.edge_lines


@pytest.mark.e2e
@verifies(SWR.SWR_3310, SWR.SWR_3307)
def test_a_user_follows_a_requirement_to_its_tests_and_back_to_its_epic(qtbot) -> None:
    """Productive use: a user opens a requirement, its graph, its test, then its epic.

    Driven through the requirements surface a user operates — the real
    `RequirementsController`, the real bridge and the real widgets — clicking
    controls by the names a screen reader announces. Only the projection source
    is supplied.
    """

    class _Source:
        def __init__(self, projection: object) -> None:
            self.projection = projection

        def project(self) -> object:
            return self.projection

    epic = CanonicalRequirement(
        req_id="SWR-7200",
        title="Requirement graph epic",
        description="An epic.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path="docs/requirements/SWR-7200.md",
    )
    child = CanonicalRequirement(
        req_id="SWR-7201",
        title="A child that is verified",
        description="The product does the thing.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
        source_path="docs/requirements/SWR-7201.md",
        parent="SWR-7200",
    )
    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(epic, child), generation=1),
            evidence={
                "SWR-7201": EvidenceInputs(
                    req_id="SWR-7201",
                    requirement_hash=child.current_hash,
                    implementations=(RequirementSite(path="src/rotaris/child.py", line=5),),
                    covering_tests=(
                        CoveringTest(
                            path="tests/unit/test_child.py",
                            line=9,
                            executed=True,
                            check_name="pytest",
                            check_status="passed",
                        ),
                    ),
                ),
            },
            evaluated_at=NOW,
        ),
    )
    store = WorkspaceStore()
    controller = RequirementsController(store, source=_Source(projection), clock=lambda: NOW)
    view = RequirementsView()
    qtbot.addWidget(controller.surface)
    controller.attach_view(view)
    controller.surface.show()
    qtbot.waitExposed(controller.surface)
    with qtbot.waitSignal(controller.bridge.evaluated, timeout=10000):
        controller.refresh()
    settle(qtbot)
    qtbot.waitUntil(lambda: not view.populating, timeout=10000)

    click_by_name(qtbot, view, "Open SWR-7201", QPushButton)
    settle(qtbot)
    assert view.page == "detail"

    click_by_name(qtbot, view, "Open the graph around SWR-7201", QPushButton)
    settle(qtbot)
    assert view.page == "graph"
    assert "tests/unit/test_child.py:9" in " ".join(accessible_names(view.graph_view, QPushButton))

    with qtbot.waitSignal(view.open_file_requested, timeout=1000) as caught:
        click_by_name(qtbot, view, "tests/unit/test_child.py:9 — Satisfied", QPushButton)
    assert caught.args == ["tests/unit/test_child.py", 9]

    # …and back up to the epic the requirement belongs to.
    _click_node(qtbot, view.graph_view, "SWR-7200")
    settle(qtbot)
    assert view.graph_view.center == "SWR-7200"
    assert view.graph_view.status.text().startswith("Centred on SWR-7200")
    assert "SWR-7201" in " ".join(accessible_names(view.graph_view, QPushButton))

    click_by_name(qtbot, view, "Back to the requirement board", QPushButton)
    settle(qtbot)
    assert view.page == "board"
    controller.shutdown()
