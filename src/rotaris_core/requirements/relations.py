"""The relation graph (SWR-3109) and its computed reverse edges (SWR-3110).

Relations are what make change propagation possible: a superseding requirement
has to know what it replaces, a dependent one has to know what must land first.
This module turns the authored edges carried on
:class:`~rotaris_core.requirements.model.CanonicalRequirement` into a graph that
answers both directions of the question — "what does X point at" and "what
points at X" — and reports every edge that did not resolve instead of dropping
it.

**Exactly one direction is authored.** If ``supersedes`` were written on one
requirement and ``superseded-by`` on the other, the two could disagree, and a
requirement store holding two contradictory truths about the same fact is worse
than one holding none. ReqToCode already made that choice for ``derived-from``;
:data:`REVERSE_OF` generalises it to every kind. Reverse edges exist only here,
in memory, computed on load — they are never written back to a source, and a
source that nevertheless authors one has it ignored with a warning naming the
file (:func:`strip_reverse_fields`).

Nothing is silently dropped:

- a target the requirement set does not contain is reported as a **dangling**
  relation carrying its source, kind and target (SWR-3109) while the forward
  edge is kept, because a dangling edge is evidence of an incomplete read, not
  of a relation that never existed;
- a target that is **deprecated** is loaded, kept and flagged, so a board can
  show "this depends on something on its way out" rather than pretending the
  edge is gone;
- a **self-relation** is reported; only its reverse edge is suppressed, since a
  requirement pointing at itself would otherwise appear in its own incoming
  list.

Pure: no filesystem, no source access, no clock.
"""

from __future__ import annotations

import logging
from enum import StrEnum
from functools import cached_property
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import RelationKind, requirement_sort_key

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from rotaris_core.requirements.model import CanonicalRequirement, SortKey

_log = logging.getLogger(__name__)


class ReverseRelationKind(StrEnum):
    """The computed opposite of each authored kind (SWR-3110)."""

    CHILDREN = "children"
    DERIVED_REQUIREMENTS = "derived-requirements"
    SUPERSEDED_BY = "superseded-by"
    BLOCKS = "blocks"
    REFINED_BY = "refined-by"
    CONFLICTS_WITH = "conflicts-with"
    RELATED_TO = "related-to"


#: The single mapping that decides which direction is authored. Every
#: :class:`~rotaris_core.requirements.model.RelationKind` has an entry, so a new
#: kind cannot be added without deciding what its reverse is called.
REVERSE_OF: dict[RelationKind, ReverseRelationKind] = {
    RelationKind.PARENT: ReverseRelationKind.CHILDREN,
    RelationKind.DERIVED_FROM: ReverseRelationKind.DERIVED_REQUIREMENTS,
    RelationKind.SUPERSEDES: ReverseRelationKind.SUPERSEDED_BY,
    RelationKind.DEPENDS_ON: ReverseRelationKind.BLOCKS,
    RelationKind.REFINES: ReverseRelationKind.REFINED_BY,
    # Symmetric kinds are their own opposite: the edge still only exists once in
    # the source, and the computed direction makes it visible from both ends.
    RelationKind.CONFLICTS_WITH: ReverseRelationKind.CONFLICTS_WITH,
    RelationKind.RELATED_TO: ReverseRelationKind.RELATED_TO,
}

#: Alternative spellings a source might use for a reverse field. Compared after
#: :func:`_normalise_field_name`, so ``derived_requirements``, ``Derived
#: Requirements`` and ``derived-requirements`` are all the same field.
_REVERSE_FIELD_ALIASES: frozenset[str] = frozenset(
    {
        "child",
        "children",
        "child-requirements",
        "derived",
        "derived-requirements",
        "derived-by",
        "superseded-by",
        "supersededby",
        "blocks",
        "blocked-requirements",
        "refined-by",
    },
)

#: Field names a source must never author, because Rotaris computes them.
REVERSE_FIELD_NAMES: frozenset[str] = (
    frozenset(str(kind) for kind in ReverseRelationKind) | _REVERSE_FIELD_ALIASES
)


def _normalise_field_name(name: str) -> str:
    return name.strip().casefold().replace("_", "-").replace(" ", "-")


@traces(SWR.SWR_3110)
def is_reverse_field(name: str) -> bool:
    """Whether *name* is a field Rotaris computes rather than reads.

    ``conflicts-with`` and ``related-to`` are deliberately absent: they are
    authored kinds whose reverse happens to share the name, so treating them as
    reverse fields would make a legal source field unreadable.
    """
    normalised = _normalise_field_name(name)
    if normalised in {str(RelationKind.CONFLICTS_WITH), str(RelationKind.RELATED_TO)}:
        return False
    return normalised in REVERSE_FIELD_NAMES


class RelationIssueKind(StrEnum):
    """Why a relation needs reporting."""

    DANGLING_TARGET = "dangling-target"
    DEPRECATED_TARGET = "deprecated-target"
    SELF_RELATION = "self-relation"
    AUTHORED_REVERSE_FIELD = "authored-reverse-field"


@traces(SWR.SWR_3109, SWR.SWR_3110)
class RelationIssue(BaseModel):
    """One relation that did not resolve cleanly, named with its origin."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: RelationIssueKind
    #: The referring requirement — SWR-3109's "source" of the relation.
    req_id: str
    #: The authored kind, when the issue is about a relation.
    relation_kind: RelationKind | None = None
    #: The authored field name, when the issue is about a rejected field.
    field_name: str | None = None
    target: str = ""
    #: The artefact the offending requirement came from, so a warning names the
    #: file rather than only the id.
    location: str | None = None

    @property
    def message(self) -> str:
        """One actionable line."""
        where = f" ({self.location})" if self.location else ""
        if self.kind is RelationIssueKind.AUTHORED_REVERSE_FIELD:
            return (
                f"{self.req_id}: ignoring authored reverse relation field"
                f" {self.field_name!r} — Rotaris computes it{where}"
            )
        kind = str(self.relation_kind) if self.relation_kind is not None else "relation"
        if self.kind is RelationIssueKind.DANGLING_TARGET:
            return f"{self.req_id}: {kind} target {self.target!r} does not resolve{where}"
        if self.kind is RelationIssueKind.DEPRECATED_TARGET:
            return f"{self.req_id}: {kind} target {self.target!r} is deprecated{where}"
        return f"{self.req_id}: {kind} points at itself{where}"


@traces(SWR.SWR_3109)
class RelationEdge(BaseModel):
    """An authored edge: *source* declares *kind* pointing at *target*."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source: str
    kind: RelationKind
    target: str


@traces(SWR.SWR_3110)
class ReverseEdge(BaseModel):
    """A computed edge hanging on the requirement a forward edge pointed at.

    For ``A supersedes B`` the reverse is ``B superseded-by A``: *source* is the
    requirement the edge is visible from, *target* the one that authored it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    source: str
    kind: ReverseRelationKind
    target: str


@traces(SWR.SWR_3109, SWR.SWR_3110)
class RelationGraph(BaseModel):
    """Both directions of every relation in one requirement set."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Every authored edge, including the ones whose target did not resolve.
    edges: tuple[RelationEdge, ...] = ()
    #: One computed edge per *resolved* forward edge (SWR-3110), minus
    #: self-relations, which would otherwise point a requirement at itself.
    reverse_edges: tuple[ReverseEdge, ...] = ()
    issues: tuple[RelationIssue, ...] = ()

    @cached_property
    @traces(SWR.SWR_3223)
    def _outgoing_index(self) -> dict[str, tuple[RelationEdge, ...]]:
        """Authored edges grouped by the requirement that declares them.

        Built once, on the first question asked of a graph that cannot change —
        the model is frozen, so a grouping computed from its fields is as
        immutable as they are. This is not a memo needing invalidation; it is the
        same data in the shape the readers ask for.

        Why it exists: the board asks this graph what each requirement points at
        and what points back, several times per requirement, and answering by
        scanning every edge made a projection quadratic in the store. Measured on
        this repository — 1527 requirements, 3054 authored edges — the scans were
        0.56s of a 2.2s board pass, the single largest term after the projection
        itself (SWR-3317).
        """
        grouped: dict[str, list[RelationEdge]] = {}
        for edge in self.edges:
            grouped.setdefault(edge.source, []).append(edge)
        return {source: tuple(edges) for source, edges in grouped.items()}

    @cached_property
    @traces(SWR.SWR_3223)
    def _incoming_index(self) -> dict[str, tuple[ReverseEdge, ...]]:
        """Computed edges grouped by their source, the mirror of :attr:`_outgoing_index`.

        Note the field these are keyed on is ``source`` and not ``target``: a
        :class:`ReverseEdge` is already expressed in the computed direction, so
        *its* source is the requirement being asked about (SWR-3110).
        """
        grouped: dict[str, list[ReverseEdge]] = {}
        for edge in self.reverse_edges:
            grouped.setdefault(edge.source, []).append(edge)
        return {source: tuple(edges) for source, edges in grouped.items()}

    def outgoing(self, req_id: str, kind: RelationKind | None = None) -> tuple[RelationEdge, ...]:
        """What *req_id* points at."""
        found = self._outgoing_index.get(req_id, ())
        if kind is None:
            return found
        return tuple(edge for edge in found if edge.kind is kind)

    def incoming(
        self,
        req_id: str,
        kind: ReverseRelationKind | None = None,
    ) -> tuple[ReverseEdge, ...]:
        """What points at *req_id*, expressed in the computed direction."""
        found = self._incoming_index.get(req_id, ())
        if kind is None:
            return found
        return tuple(edge for edge in found if edge.kind is kind)

    def targets(self, req_id: str, kind: RelationKind) -> tuple[str, ...]:
        """Ids *req_id* points at with *kind*."""
        return tuple(edge.target for edge in self.outgoing(req_id, kind))

    def sources(self, req_id: str, kind: ReverseRelationKind) -> tuple[str, ...]:
        """Ids that point at *req_id*, read through the computed *kind*."""
        return tuple(edge.target for edge in self.incoming(req_id, kind))

    def issues_of(self, kind: RelationIssueKind) -> tuple[RelationIssue, ...]:
        """Reported problems of one kind."""
        return tuple(issue for issue in self.issues if issue.kind is kind)

    @property
    def dangling(self) -> tuple[RelationIssue, ...]:
        """Relations whose target the requirement set does not contain."""
        return self.issues_of(RelationIssueKind.DANGLING_TARGET)

    @property
    def deprecated_targets(self) -> tuple[RelationIssue, ...]:
        """Relations pointing at a deprecated requirement — kept, flagged."""
        return self.issues_of(RelationIssueKind.DEPRECATED_TARGET)


@traces(SWR.SWR_3110)
def reverse_kind(kind: RelationKind) -> ReverseRelationKind:
    """The computed opposite of an authored kind."""
    return REVERSE_OF[kind]


@traces(SWR.SWR_3109, SWR.SWR_3110)
def build_relation_graph(requirements: Iterable[CanonicalRequirement]) -> RelationGraph:
    """Resolve authored relations and compute their reverse direction.

    Deterministic: edges come out sorted by (source, kind, target) so two reads
    of the same content produce byte-identical graphs — a precondition for the
    hash-based change detection built on top of this in slice 5.
    """
    by_id: dict[str, CanonicalRequirement] = {}
    for requirement in requirements:
        by_id.setdefault(requirement.req_id, requirement)

    edges: list[RelationEdge] = []
    reverse_edges: list[ReverseEdge] = []
    issues: list[RelationIssue] = []

    for req_id in sorted(by_id, key=requirement_sort_key):
        requirement = by_id[req_id]
        for relation in requirement.all_relations():
            edges.append(
                RelationEdge(source=req_id, kind=relation.kind, target=relation.target),
            )
            issue = _issue_for(requirement, relation.kind, relation.target, by_id)
            if issue is not None:
                issues.append(issue)
            if relation.target not in by_id or relation.target == req_id:
                continue
            reverse_edges.append(
                ReverseEdge(
                    source=relation.target,
                    kind=reverse_kind(relation.kind),
                    target=req_id,
                ),
            )

    return RelationGraph(
        edges=tuple(sorted(edges, key=_edge_key)),
        reverse_edges=tuple(sorted(reverse_edges, key=_edge_key)),
        issues=tuple(issues),
    )


def _edge_key(edge: RelationEdge | ReverseEdge) -> tuple[SortKey, str, SortKey]:
    return (requirement_sort_key(edge.source), str(edge.kind), requirement_sort_key(edge.target))


def _issue_for(
    requirement: CanonicalRequirement,
    kind: RelationKind,
    target: str,
    by_id: Mapping[str, CanonicalRequirement],
) -> RelationIssue | None:
    if target == requirement.req_id:
        return RelationIssue(
            kind=RelationIssueKind.SELF_RELATION,
            req_id=requirement.req_id,
            relation_kind=kind,
            target=target,
            location=requirement.source_path,
        )
    resolved = by_id.get(target)
    if resolved is None:
        return RelationIssue(
            kind=RelationIssueKind.DANGLING_TARGET,
            req_id=requirement.req_id,
            relation_kind=kind,
            target=target,
            location=requirement.source_path,
        )
    if resolved.is_deprecated:
        return RelationIssue(
            kind=RelationIssueKind.DEPRECATED_TARGET,
            req_id=requirement.req_id,
            relation_kind=kind,
            target=target,
            location=requirement.source_path,
        )
    return None


@traces(SWR.SWR_3110)
def strip_reverse_fields(
    fields: Mapping[str, str],
    *,
    req_id: str,
    location: str | None = None,
) -> tuple[dict[str, str], tuple[RelationIssue, ...]]:
    """Drop authored reverse-relation fields, reporting each one.

    An adapter calls this while mapping a source's own fields onto the canonical
    model. A store that writes ``superseded-by`` next to someone else's
    ``supersedes`` has two truths about one fact; Rotaris keeps the authored one
    and says out loud — in the log *and* in the returned issues, naming the file
    — that it ignored the other (SWR-3110).
    """
    kept: dict[str, str] = {}
    issues: list[RelationIssue] = []
    for name, value in fields.items():
        if not is_reverse_field(name):
            kept[name] = value
            continue
        issue = RelationIssue(
            kind=RelationIssueKind.AUTHORED_REVERSE_FIELD,
            req_id=req_id,
            field_name=name,
            target=value.strip(),
            location=location,
        )
        issues.append(issue)
        _log.warning("%s", issue.message)
    return kept, tuple(issues)
