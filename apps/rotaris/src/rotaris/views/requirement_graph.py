"""What hangs off a requirement: relations, implementations, tests (SWR-3310).

A board answers "which column is this in". For an audit, an impact analysis or a
legacy codebase the question is the other one — the epic above it, the technical
requirements derived from it, the modules that implement it, the tests that
verify it — and that is a neighbourhood, not a column.

The model half of this module is pure and framework-free:
:func:`build_neighbourhood` turns the board's cards plus one requirement's
detail into nodes and edges, and it does two things carefully.

- **It is bounded, and says so.** Depth is clamped to :data:`MAX_DEPTH`, and
  every requirement whose own relations were *not* expanded is named in
  :attr:`RequirementNeighbourhood.beyond` and stated in
  :attr:`RequirementNeighbourhood.bound_message`. A graph that silently stopped
  at the edge of what it drew would be a lie about a store of hundreds of
  requirements.
- **It carries health, and never computes it.** Every requirement node carries
  the health the engine assigned to that card and every evidence node the
  obligation state the engine reported (SWR-3311).

The widget half keeps the graph operable without a mouse: nodes are buttons in
depth columns, selecting one re-centres the graph and states what is now in
view, and :attr:`RequirementNeighbourhood.edge_lines` is rendered as a real list
beside the picture — the textual alternative that carries exactly the same
edges.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QScrollArea,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import counted
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.widgets.cards import SectionLabel, make_button
from rotaris.widgets.evidence_ring import evidence_sites
from rotaris.widgets.patterns import DetailPageHeader
from rotaris.widgets.requirement_card import card_fact

if TYPE_CHECKING:
    from rotaris.models.requirements_state import (
        RequirementCard,
        RequirementDetail,
        RequirementsBoardState,
    )
    from rotaris.theme.spec import Theme

__all__ = [
    "DEFAULT_DEPTH",
    "MAX_DEPTH",
    "GraphEdge",
    "GraphNode",
    "RequirementGraphView",
    "RequirementNeighbourhood",
    "build_neighbourhood",
]

#: How far from the centre the graph goes before it stops and says so.
MAX_DEPTH = 3
DEFAULT_DEPTH = 2

NODE_REQUIREMENT = "requirement"
NODE_EPIC = "epic"
NODE_IMPLEMENTATION = "implementation"
NODE_TEST = "test"

_EPIC_FACT = "Epic"


@dataclass(frozen=True)
class GraphNode:
    """One thing in the neighbourhood: a requirement, a module or a test."""

    node_id: str
    kind: str
    label: str
    depth: int = 0
    health_label: str = ""
    state_label: str = ""
    resolved: bool = True
    path: str = ""
    line: int = 0

    @property
    def navigable(self) -> bool:
        """Whether selecting this node can re-centre the graph on it."""
        return self.kind in (NODE_REQUIREMENT, NODE_EPIC) and self.resolved

    @property
    def sentence(self) -> str:
        """``SWR-3301 Requirements is a primary view — Healthy`` — what is announced."""
        state = self.health_label or self.state_label
        suffix = f" — {state}" if state else ""
        missing = " (unresolved)" if not self.resolved else ""
        return f"{self.label}{missing}{suffix}"


@dataclass(frozen=True)
class GraphEdge:
    """One relation, in the direction a reader follows it."""

    source: str
    relation: str
    target: str

    @property
    def sentence(self) -> str:
        """``SWR-3301 → Parent epic → SWR-3300`` — one line of the alternative."""
        return f"{self.source} → {self.relation} → {self.target}"


@dataclass(frozen=True)
class RequirementNeighbourhood:
    """A bounded graph around one requirement, with its own bound stated."""

    center: str
    depth: int
    nodes: tuple[GraphNode, ...] = ()
    edges: tuple[GraphEdge, ...] = ()
    #: Requirements that are in view but whose own relations were not expanded.
    beyond: tuple[str, ...] = ()

    def nodes_at(self, depth: int) -> tuple[GraphNode, ...]:
        """Every node this many steps from the centre."""
        return tuple(node for node in self.nodes if node.depth == depth)

    def node(self, node_id: str) -> GraphNode | None:
        """One node by id, or ``None``."""
        return next((node for node in self.nodes if node.node_id == node_id), None)

    @property
    def edge_lines(self) -> tuple[str, ...]:
        """Every edge as a sentence — the textual alternative to the picture."""
        return tuple(edge.sentence for edge in self.edges)

    @property
    def counts(self) -> dict[str, int]:
        """How many of each kind of node is in view."""
        counts: dict[str, int] = {}
        for node in self.nodes:
            counts[node.kind] = counts.get(node.kind, 0) + 1
        return counts

    @property
    def summary(self) -> str:
        """What is now in view — restated after every re-centring (SWR-3310)."""
        counts = self.counts
        requirements = counts.get(NODE_REQUIREMENT, 0) + counts.get(NODE_EPIC, 0)
        return (
            f"Centred on {self.center}: {counted(requirements, 'requirement')}, "
            f"{counted(counts.get(NODE_IMPLEMENTATION, 0), 'implementation')}, "
            f"{counted(counts.get(NODE_TEST, 0), 'test')}, depth {self.depth}."
        )

    @property
    def bound_message(self) -> str:
        """The stated bound — never a silent truncation (SWR-3310)."""
        if not self.beyond:
            return f"Depth {self.depth} of {MAX_DEPTH}: everything in view is fully expanded."
        listed = ", ".join(self.beyond[:4])
        more = f" and {len(self.beyond) - 4} more" if len(self.beyond) > 4 else ""
        return (
            f"Depth {self.depth} of {MAX_DEPTH}. Relations of {listed}{more} "
            "are not expanded here; select one to re-centre on it."
        )


def _requirement_node(card: RequirementCard, depth: int) -> GraphNode:
    return GraphNode(
        node_id=card.req_id,
        kind=NODE_EPIC if card.is_epic else NODE_REQUIREMENT,
        label=f"{card.req_id} {card.title}".strip(),
        depth=depth,
        health_label=card.health_label,
    )


def _unresolved_node(req_id: str, depth: int) -> GraphNode:
    return GraphNode(
        node_id=req_id,
        kind=NODE_REQUIREMENT,
        label=req_id,
        depth=depth,
        health_label="Not in this requirement store",
        resolved=False,
    )


@traces(SWR.SWR_3310)
def build_neighbourhood(
    center: str,
    state: RequirementsBoardState,
    detail: RequirementDetail | None = None,
    *,
    depth: int = DEFAULT_DEPTH,
) -> RequirementNeighbourhood:
    """The graph around *center*, bounded at *depth* and honest about the bound.

    The centre's own relations come from its detail, which is the projection's
    complete answer for one requirement. Deeper levels use the epic relation the
    board itself carries, which is exact for every card on it; anything further
    is named in :attr:`RequirementNeighbourhood.beyond` rather than drawn
    half-way.
    """
    bound = max(1, min(MAX_DEPTH, depth))
    cards = {card.req_id: card for card in state.cards}
    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []
    centre_card = cards.get(center)
    nodes[center] = (
        _requirement_node(centre_card, 0)
        if centre_card is not None
        else _unresolved_node(center, 0)
    )

    frontier: list[str] = [center]
    for level in range(1, bound + 1):
        reached: list[str] = []
        for req_id in frontier:
            for relation, target in _relations_of(
                req_id, cards, detail if req_id == center else None
            ):
                if target not in nodes:
                    card = cards.get(target)
                    nodes[target] = (
                        _requirement_node(card, level)
                        if card is not None
                        else _unresolved_node(target, level)
                    )
                    reached.append(target)
                edge = GraphEdge(source=req_id, relation=relation, target=target)
                if edge not in edges:
                    edges.append(edge)
        frontier = reached
        if not frontier:
            break

    beyond = tuple(
        node.node_id
        for node in nodes.values()
        if node.depth == bound
        and node.resolved
        and _relations_of(node.node_id, cards, None)
        and any(target not in nodes for _, target in _relations_of(node.node_id, cards, None))
    )
    if centre_card is not None and detail is not None:
        for site in evidence_sites(centre_card, detail):
            node_id = f"{site.kind}:{site.address}"
            nodes[node_id] = GraphNode(
                node_id=node_id,
                kind=NODE_IMPLEMENTATION if site.kind == "implementation" else NODE_TEST,
                label=site.address,
                depth=1,
                state_label=site.state_label,
                path=site.path,
                line=site.line,
            )
            edges.append(GraphEdge(source=center, relation=site.label, target=site.address))
    return RequirementNeighbourhood(
        center=center,
        depth=bound,
        nodes=tuple(nodes.values()),
        edges=tuple(edges),
        beyond=beyond,
    )


def _relations_of(
    req_id: str,
    cards: dict[str, RequirementCard],
    detail: RequirementDetail | None,
) -> tuple[tuple[str, str], ...]:
    """``(relation label, target id)`` for one requirement.

    From the detail when there is one — the projection's complete relation set,
    dangling edges included — and otherwise from the epic membership the board's
    own cards carry, which is exact but narrow. Nothing is inferred from a
    truncated summary.
    """
    if detail is not None:
        return tuple((link.label, link.req_id) for link in detail.links)
    relations: list[tuple[str, str]] = []
    card = cards.get(req_id)
    if card is not None:
        parent = card_fact(card, _EPIC_FACT)
        if parent:
            relations.append(("Parent epic", parent))
    relations.extend(
        ("Child", child.req_id)
        for child in cards.values()
        if card_fact(child, _EPIC_FACT) == req_id
    )
    return tuple(relations)


@traces(SWR.SWR_3310, SWR.SWR_3314)
class RequirementGraphView(Themed, QWidget):
    """The neighbourhood as columns of focusable nodes, plus the edge listing."""

    #: A requirement node was selected — the graph re-centres on it.
    node_activated = Signal(str)
    #: ``(path, line)`` of an implementation or test node.
    site_activated = Signal(str, int)
    close_requested = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._state: RequirementsBoardState | None = None
        self._detail: RequirementDetail | None = None
        self._graph = RequirementNeighbourhood(center="", depth=DEFAULT_DEPTH)
        self.setObjectName("requirementGraph")
        self.setAccessibleName("Requirement graph")
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(10)

        self.header = DetailPageHeader("Requirement graph")
        self.header.back_button.setAccessibleName("Back to the requirement board")
        self.header.back_requested.connect(self.close_requested)
        self.back_button = self.header.back_button
        self.title = self.header.title_label
        self.header.add_action(SectionLabel("Depth"))
        self.depth_spin = QSpinBox()
        self.depth_spin.setRange(1, MAX_DEPTH)
        self.depth_spin.setValue(DEFAULT_DEPTH)
        self.depth_spin.setAccessibleName("Graph depth")
        self.depth_spin.setAccessibleDescription(
            f"How many relation steps around the centre are shown, at most {MAX_DEPTH}",
        )
        self.depth_spin.valueChanged.connect(lambda _value: self._rebuild())
        self.header.add_action(self.depth_spin)
        root.addWidget(self.header)

        self.status = QLabel()
        self.status.setObjectName("muted")
        self.status.setWordWrap(True)
        self.status.setAccessibleName("Graph contents")
        root.addWidget(self.status)
        self.bound = QLabel()
        self.bound.setObjectName("muted")
        self.bound.setWordWrap(True)
        self.bound.setAccessibleName("Graph depth bound")
        root.addWidget(self.bound)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setAccessibleName("Requirement graph nodes")
        canvas = QWidget()
        self._columns = QHBoxLayout(canvas)
        self._columns.setContentsMargins(0, 0, 0, 0)
        self._columns.setSpacing(14)
        self._columns.addStretch(1)
        scroll.setWidget(canvas)
        root.addWidget(scroll, 2)

        root.addWidget(SectionLabel("Edges"))
        self.edge_list = QListWidget()
        self.edge_list.setAccessibleName("Requirement graph edges")
        self.edge_list.setAccessibleDescription(
            "Every edge of the graph as text, in the same order the columns show them",
        )
        self.edge_list.setMinimumHeight(90)
        root.addWidget(self.edge_list, 1)
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Repaint the node buttons, which carry a colour of their own.

        Only when a graph has actually been drawn: rendering an empty
        neighbourhood would put ``Centred on :`` in the status line before the
        host has said what to centre on.
        """
        del theme  # every node re-reads the tokens it is painted with
        if self._state is not None:
            self._render()

    @property
    def graph(self) -> RequirementNeighbourhood:
        """The neighbourhood currently drawn."""
        return self._graph

    @property
    def center(self) -> str:
        """Which requirement the graph is centred on."""
        return self._graph.center

    @traces(SWR.SWR_3310)
    def show_graph(
        self,
        center: str,
        state: RequirementsBoardState,
        detail: RequirementDetail | None = None,
    ) -> None:
        """Centre the graph on *center* and draw its neighbourhood."""
        self._state = state
        self._detail = detail if detail is not None and detail.req_id == center else None
        self._graph = build_neighbourhood(
            center,
            state,
            self._detail,
            depth=self.depth_spin.value(),
        )
        self._render()

    def _rebuild(self) -> None:
        if self._state is None:
            return
        self.show_graph(self._graph.center, self._state, self._detail)

    def _render(self) -> None:
        graph = self._graph
        self.title.setText(f"Graph around {graph.center}" if graph.center else "Requirement graph")
        self.title.setAccessibleName(self.title.text())
        self.status.setText(graph.summary)
        self.status.setAccessibleDescription(graph.summary)
        self.bound.setText(graph.bound_message)
        self._clear_columns()
        for depth in range(0, graph.depth + 1):
            nodes = graph.nodes_at(depth)
            if not nodes:
                continue
            self._columns.insertWidget(self._columns.count() - 1, self._column(depth, nodes))
        self.edge_list.clear()
        self.edge_list.addItems(list(graph.edge_lines))
        self.setAccessibleDescription(f"{graph.summary} {graph.bound_message}")

    def _clear_columns(self) -> None:
        while self._columns.count() > 1:
            item = self._columns.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()

    def _column(self, depth: int, nodes: tuple[GraphNode, ...]) -> QWidget:
        column = QWidget()
        column.setAccessibleName(
            "Centre" if depth == 0 else f"{counted(depth, 'step')} from {self._graph.center}",
        )
        layout = QVBoxLayout(column)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        layout.addWidget(SectionLabel("Centre" if depth == 0 else f"Step {depth}"))
        for node in nodes:
            layout.addWidget(self._node_button(node))
        layout.addStretch(1)
        column.setMinimumWidth(210)
        return column

    def _node_button(self, node: GraphNode) -> QWidget:
        button = make_button(node.label, "secondary" if node.depth == 0 else "ghost")
        button.setAccessibleName(node.sentence)
        button.setAccessibleDescription(
            f"{node.kind.capitalize()} node, {counted(node.depth, 'step')} from the centre",
        )
        button.setToolTip(node.sentence)
        if node.kind in (NODE_IMPLEMENTATION, NODE_TEST):
            path, line = node.path, node.line
            button.clicked.connect(lambda _=False, p=path, ln=line: self.site_activated.emit(p, ln))
            # A site is a leaf, not a requirement: the secondary text colour
            # separates the two columns without adding a fifth meaning to the
            # accent the requirement nodes already carry.
            button.setStyleSheet(f"color:{tokens().color.text_secondary};")
        elif node.navigable:
            target = node.node_id
            button.clicked.connect(lambda _=False, req=target: self._recentre(req))
        else:
            button.setEnabled(False)
            button.setToolTip(f"{node.node_id} is not in this requirement store.")
        return button

    @traces(SWR.SWR_3310)
    def _recentre(self, req_id: str) -> None:
        """Re-centre on *req_id* and tell the host, which may know more about it."""
        if self._state is not None and req_id != self._graph.center:
            self.show_graph(req_id, self._state)
        self.node_activated.emit(req_id)
