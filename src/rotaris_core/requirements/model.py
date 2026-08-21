"""The canonical requirement (SWR-3101) and its hierarchy (SWR-3108).

Rotaris reads requirements from whatever a project already has — this
repository's ReqToCode store, a YAML specification tree, an issue tracker — and
every one of those shapes normalises into :class:`CanonicalRequirement` before
anything downstream sees it. Board, delivery state, execution and change
propagation read *this* type and never the originating file format; that is the
whole point of the seam, and the reason adding a source later costs no edit in
any consumer.

Three properties are load-bearing and are asserted by the tests, not assumed:

- **Read projection, no hidden state.** A canonical requirement is rebuilt from
  its source on every read. It carries no field Rotaris owns alone — no delivery
  state, no ``satisfied_hash``, no run history. Those are layered beside it by
  SWR-3205, keyed on ``req_id``. :data:`DELIVERY_FIELD_NAMES` names the fields
  that must never appear here, and ``extra="forbid"`` stops one arriving through
  the back door.
- **Immutable and hashable.** Mutating a requirement means re-reading the
  source. :meth:`CanonicalRequirement.evolve` returns a re-validated copy —
  including a recomputed ``current_hash`` — rather than editing in place;
  ``model_copy`` is deliberately *not* the supported edit path, because it skips
  validation and would leave a stale hash behind.
- **Source-independent identity.** Two sources describing the same logical
  requirement produce equal values apart from their provenance
  (:meth:`CanonicalRequirement.without_provenance` strips exactly that), because
  every normalising step — relation ordering, whitespace, the default lifecycle
  — happens here rather than in each adapter.

**One truth per fact.** ``parent`` is a field *and* ``parent`` is a relation
kind; a source may author either, and both land in the same place: the
constructor lifts a ``parent`` relation into the field, and
:meth:`CanonicalRequirement.all_relations` puts it back as an edge for the
relation graph. A requirement naming two different parents is rejected rather
than silently resolved — "at most one parent" (SWR-3108) is checked where the
value is built, not where it is read. Children are never stored: they are
computed by :func:`build_hierarchy`, exactly as reverse relations are computed
by :mod:`rotaris_core.requirements.relations` (SWR-3110).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.hashing import (
    normalize_block,
    normalize_inline,
    requirement_hash,
)

if TYPE_CHECKING:
    from collections.abc import Mapping


class RequirementLifecycle(StrEnum):
    """Where a requirement stands in its own project's process (SWR-3101)."""

    DRAFT = "draft"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


class RequirementType(StrEnum):
    """Whether a requirement states product behaviour or a technical necessity."""

    PRODUCT = "product"
    TECHNICAL = "technical"


class RelationKind(StrEnum):
    """Authored relation kinds (SWR-3109).

    The first four are *enforced*: change propagation, hierarchy and dependency
    ordering read them and act on them. The last three are accepted so a source
    that already carries them is not lied about, but nothing in Rotaris draws a
    conclusion from them.
    """

    PARENT = "parent"
    DERIVED_FROM = "derived-from"
    SUPERSEDES = "supersedes"
    DEPENDS_ON = "depends-on"
    REFINES = "refines"
    CONFLICTS_WITH = "conflicts-with"
    RELATED_TO = "related-to"


#: Kinds Rotaris acts on — hierarchy, derivation, superseding and ordering.
ENFORCED_RELATION_KINDS: frozenset[RelationKind] = frozenset(
    {
        RelationKind.PARENT,
        RelationKind.DERIVED_FROM,
        RelationKind.SUPERSEDES,
        RelationKind.DEPENDS_ON,
    },
)

#: Kinds carried through unchanged but never acted on.
DECLARED_RELATION_KINDS: frozenset[RelationKind] = frozenset(RelationKind) - ENFORCED_RELATION_KINDS


class SourceCapability(StrEnum):
    """One operation a requirement source may support (SWR-3105)."""

    READ = "read"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


@traces(SWR.SWR_3105)
class SourceCapabilities(BaseModel):
    """What the source a requirement came from can do.

    Travels *with* the requirement (SWR-3105) rather than being looked up later:
    a consumer holding a requirement can already tell whether offering "edit"
    would be honest, without knowing which registry produced it. ``read`` is
    mandatory — something that cannot be read is not a requirement source.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    supported: frozenset[SourceCapability] = frozenset({SourceCapability.READ})

    @field_validator("supported")
    @classmethod
    def _must_read(cls, value: frozenset[SourceCapability]) -> frozenset[SourceCapability]:
        if SourceCapability.READ not in value:
            raise ValueError("a requirement source must declare the 'read' capability")
        return value

    @classmethod
    def of(cls, *capabilities: SourceCapability) -> Self:
        """Declare a capability set; ``read`` is implied."""
        return cls(supported=frozenset({SourceCapability.READ, *capabilities}))

    def can(self, capability: SourceCapability) -> bool:
        """Whether the source declares *capability*."""
        return capability in self.supported

    @property
    def read_only(self) -> bool:
        """True when nothing but reading is offered."""
        return self.supported == frozenset({SourceCapability.READ})

    @property
    def writable(self) -> bool:
        """True when any write operation is declared."""
        return not self.read_only

    def as_tuple(self) -> tuple[SourceCapability, ...]:
        """Declared capabilities in enum order — stable for display and tests."""
        return tuple(capability for capability in SourceCapability if capability in self.supported)


#: A source that can only be read. The default for a requirement, so a source
#: that forgets to declare capabilities never causes an unhonourable offer.
READ_ONLY: SourceCapabilities = SourceCapabilities.of()

#: A source supporting every operation (this repository's ReqToCode store).
FULL_CAPABILITIES: SourceCapabilities = SourceCapabilities.of(
    SourceCapability.CREATE,
    SourceCapability.UPDATE,
    SourceCapability.DELETE,
)

#: Fields that belong to the delivery record (SWR-3205) and must never appear on
#: the canonical requirement. Named here so the boundary is testable rather than
#: a convention a later slice can drift across.
DELIVERY_FIELD_NAMES: frozenset[str] = frozenset(
    {
        "delivery_state",
        "state",
        "satisfied_hash",
        "satisfied_at",
        "runs",
        "run_history",
        "last_run",
        "evidence",
        "execution_units",
        "assignee",
        "priority",
        "health",
        "progress",
    },
)

_NUMBER_RUN = re.compile(r"(\d+)")

#: Ordering key produced by :func:`requirement_sort_key`. Comparable, so it can
#: be handed to ``sorted`` anywhere an id ordering is needed.
type SortKey = tuple[tuple[int, int, str], ...]


def requirement_sort_key(req_id: str) -> SortKey:
    """Natural sort key for a requirement id.

    ``SWR-99`` sorts before ``SWR-100``, which lexicographic ordering gets wrong
    and which matters wherever an ordering is asserted — children "in id order"
    (SWR-3108), board columns, deterministic reports.
    """
    parts: list[tuple[int, int, str]] = []
    for chunk in _NUMBER_RUN.split(req_id.strip()):
        if not chunk:
            continue
        if chunk.isdigit():
            parts.append((0, int(chunk), ""))
        else:
            parts.append((1, 0, chunk.casefold()))
    return tuple(parts)


@traces(SWR.SWR_3101, SWR.SWR_3109)
class Relation(BaseModel):
    """One authored edge from a requirement to another requirement's id."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: RelationKind
    target: str

    @field_validator("target")
    @classmethod
    def _target_is_named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a relation must name a target requirement id")
        return cleaned

    @property
    def enforced(self) -> bool:
        """Whether Rotaris draws conclusions from this kind (SWR-3109)."""
        return self.kind in ENFORCED_RELATION_KINDS

    def as_pair(self) -> tuple[str, str]:
        """``(kind, target)`` — the shape the hash input wants."""
        return (str(self.kind), self.target)


def _relation_parts(value: object) -> tuple[str, str]:
    """Read ``(kind, target)`` out of whatever an adapter passed."""
    if isinstance(value, Relation):
        return (str(value.kind), value.target)
    if isinstance(value, dict):
        return (str(value.get("kind", "")), str(value.get("target", "")))
    if isinstance(value, tuple | list) and len(value) == 2:
        return (str(value[0]), str(value[1]))
    raise ValueError(f"cannot read a relation from {value!r}")


def _relation_sequence(value: object) -> tuple[tuple[str, str], ...]:
    """Normalise however an adapter passed its relations into ``(kind, target)``.

    Accepts what a mapping layer naturally produces — any iterable of
    :class:`Relation` values, of dicts, or of ``(kind, target)`` pairs — and
    refuses anything else by name rather than iterating it into nonsense. A
    string is the trap this guards: iterating one yields characters, and the
    resulting requirement would carry relations nobody wrote.
    """
    if value is None:
        return ()
    if isinstance(value, Relation | dict):
        return (_relation_parts(value),)
    if isinstance(value, str | bytes) or not isinstance(value, Iterable):
        raise ValueError(f"cannot read relations from {value!r}")
    return tuple(_relation_parts(item) for item in value)


@traces(SWR.SWR_3101, SWR.SWR_3108)
class CanonicalRequirement(BaseModel):
    """One requirement, as every consumer sees it, whatever its source.

    Equality is structural: two values with the same content and the same
    provenance are the same requirement. ``current_hash`` is derived from the
    normalised content (see :mod:`rotaris_core.requirements.hashing`), which is
    what makes it stable against formatting and sensitive to meaning (SWR-3107);
    a source may override it, and :attr:`hash_is_canonical` then says so.

    A source's *own* content token — ReqToCode's ``content_hash``, an ETag, a
    tracker's ``updated`` marker — is carried beside it in :attr:`source_hash`
    rather than in its place. Both facts are needed and they are different
    facts: ``current_hash`` answers "did this requirement's meaning change",
    ``source_hash`` answers "is this the same artefact state the store's own
    tooling recorded", which is what keeps an existing baseline entry or a
    ``reqtocode diff`` result meaningful across the move to the board.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Stable id as the source declares it (``SWR-3101``, ``REQ-7``, ``#412``).
    req_id: str
    title: str = ""
    description: str = ""
    #: Never ``None``: a source that declares nothing lands on ``draft``, and the
    #: default is visible in the value rather than implied by a missing field.
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    req_type: RequirementType = RequirementType.PRODUCT
    #: Which configured source produced this read (SWR-3115 attribution).
    source_id: str = ""
    #: Where in that source it lives — a repository-relative path, a URL, an
    #: issue key. Shown to the user when a write is refused (SWR-3105).
    source_path: str | None = None
    #: The source's opaque revision token *at the moment of this read*
    #: (SWR-3102), recorded so a snapshot can name the state it saw.
    source_revision: str | None = None
    #: Content identity (SWR-3107). Computed from the canonical content unless
    #: the source supplied its own.
    current_hash: str = ""
    #: The originating source's own content token for the artefact this
    #: requirement was read from, carried verbatim and never used as hash input:
    #: ReqToCode's ``content_hash``, an ETag, a tracker revision. Provenance, so
    #: :meth:`without_provenance` clears it.
    source_hash: str | None = None
    #: At most one parent (SWR-3108); children are computed, never stored.
    parent: str | None = None
    #: Authored, non-parent relations, sorted and de-duplicated (SWR-3109).
    relations: tuple[Relation, ...] = ()
    #: Whether the project expects an implementation trace / a covering test.
    trace_required: bool = True
    test_required: bool = True
    #: What the originating source can do (SWR-3105).
    capabilities: SourceCapabilities = READ_ONLY

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, data: object) -> object:
        """Fold the parent into one place, order relations, derive the hash.

        Runs before field validation so that the hash is computed over the
        *normalised* content: a source listing relations in a different order,
        or expressing the parent as an edge instead of a field, must produce the
        same value and therefore the same hash.
        """
        if not isinstance(data, dict):
            return data
        values: dict[str, object] = dict(data)

        parents: set[str] = set()
        pairs: set[tuple[str, str]] = set()
        for raw_kind, raw_target in _relation_sequence(values.get("relations")):
            kind, target = raw_kind.strip(), raw_target.strip()
            if kind == RelationKind.PARENT:
                if target:
                    parents.add(target)
                continue
            pairs.add((kind, target))
        declared_parent = values.get("parent")
        if isinstance(declared_parent, str) and declared_parent.strip():
            parents.add(declared_parent.strip())
        if len(parents) > 1:
            raise ValueError(
                f"{values.get('req_id', '<unknown>')}: a requirement names at most one parent,"
                f" got {sorted(parents)}",
            )
        parent = next(iter(parents), None)
        relations = tuple(
            Relation(kind=RelationKind(kind), target=target) for kind, target in sorted(pairs)
        )
        values["parent"] = parent
        values["relations"] = relations

        req_id = str(values.get("req_id") or "").strip()
        if req_id and not values.get("current_hash"):
            values["current_hash"] = requirement_hash(
                req_id=req_id,
                title=str(values.get("title") or ""),
                description=str(values.get("description") or ""),
                lifecycle=str(values.get("lifecycle") or RequirementLifecycle.DRAFT),
                req_type=str(values.get("req_type") or RequirementType.PRODUCT),
                relations=[relation.as_pair() for relation in relations],
                parent=parent,
            )
        return values

    @field_validator("req_id")
    @classmethod
    def _req_id_is_named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a requirement must carry a non-empty id")
        return cleaned

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str) -> str:
        return normalize_inline(value)

    @field_validator("description")
    @classmethod
    def _clean_description(cls, value: str) -> str:
        """Normalise the text here, not in every adapter.

        SWR-3101's claim that two sources produce *equal* requirements has to
        hold structurally, not by adapter discipline: a CRLF checkout and an LF
        one must not produce two values that merely hash alike. The same
        normalisation feeds the hash, so the stored text and ``current_hash``
        can never disagree about what was read.
        """
        return normalize_block(value)

    # -- identity -----------------------------------------------------------

    @property
    def canonical_hash(self) -> str:
        """The hash this content *would* get, recomputed now (SWR-3107)."""
        return requirement_hash(
            req_id=self.req_id,
            title=self.title,
            description=self.description,
            lifecycle=str(self.lifecycle),
            req_type=str(self.req_type),
            relations=[relation.as_pair() for relation in self.relations],
            parent=self.parent,
        )

    @property
    def hash_is_canonical(self) -> bool:
        """False when the source supplied a hash of its own (SWR-3103)."""
        return self.current_hash == self.canonical_hash

    @property
    def sort_key(self) -> SortKey:
        """Natural ordering key — see :func:`requirement_sort_key`."""
        return requirement_sort_key(self.req_id)

    @property
    def is_deprecated(self) -> bool:
        """Deprecated requirements stay loaded and are flagged, never dropped."""
        return self.lifecycle is RequirementLifecycle.DEPRECATED

    # -- relations ----------------------------------------------------------

    def all_relations(self) -> tuple[Relation, ...]:
        """Every authored edge, with the parent expressed as one (SWR-3109)."""
        if self.parent is None:
            return self.relations
        return (Relation(kind=RelationKind.PARENT, target=self.parent), *self.relations)

    def relations_of(self, kind: RelationKind) -> tuple[Relation, ...]:
        """The authored edges of one kind."""
        return tuple(relation for relation in self.all_relations() if relation.kind is kind)

    def related_ids(self, kind: RelationKind) -> tuple[str, ...]:
        """The targets of one relation kind, in authored (sorted) order."""
        return tuple(relation.target for relation in self.relations_of(kind))

    # -- deriving new values ------------------------------------------------

    def evolve(self, **changes: object) -> CanonicalRequirement:
        """A re-validated copy with *changes* applied.

        The supported way to derive a requirement: ``model_copy`` skips
        validation, so it would keep a hash that no longer describes the
        content. Passing ``current_hash`` explicitly keeps a source-supplied
        hash; otherwise it is recomputed. ``source_hash`` is dropped for the same
        reason in reverse: a derived value was never read from the source, so
        claiming the source's token for it would be a lie about provenance.
        """
        data: dict[str, object] = self.model_dump()
        data.update(changes)
        if "current_hash" not in changes:
            data.pop("current_hash", None)
        if "source_hash" not in changes:
            data["source_hash"] = None
        return type(self).model_validate(data)

    def stamped(
        self,
        *,
        source_id: str | None = None,
        source_path: str | None = None,
        source_revision: str | None = None,
    ) -> CanonicalRequirement:
        """A copy carrying provenance, with the content hash left alone.

        Provenance is not hash input (SWR-3107), so stamping a requirement with
        the read that produced it must not move ``current_hash`` — which is
        exactly why this exists instead of :meth:`evolve`.
        """
        updates: dict[str, object] = {}
        if source_id is not None:
            updates["source_id"] = source_id
        if source_path is not None:
            updates["source_path"] = source_path
        if source_revision is not None:
            updates["source_revision"] = source_revision
        if not updates:
            return self
        return self.model_copy(update=updates)

    def without_provenance(self) -> CanonicalRequirement:
        """The same requirement with every source-specific field cleared.

        What makes SWR-3101's central claim checkable: two sources describing
        the same logical requirement are equal once provenance — source id,
        path, revision, capabilities and any source-supplied hash — is removed.
        """
        return self.model_copy(
            update={
                "source_id": "",
                "source_path": None,
                "source_revision": None,
                "source_hash": None,
                "capabilities": READ_ONLY,
                "current_hash": self.canonical_hash,
            },
        )


# --------------------------------------------------------------------------
# Hierarchy (SWR-3108)
# --------------------------------------------------------------------------


class HierarchyIssueKind(StrEnum):
    """Why a parent link did not resolve."""

    DANGLING_PARENT = "dangling-parent"
    PARENT_CYCLE = "parent-cycle"


@traces(SWR.SWR_3108)
class HierarchyIssue(BaseModel):
    """A parent link that could not be honoured, named rather than swallowed."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: HierarchyIssueKind
    #: The requirement whose parent link is at fault (for a cycle: its first
    #: member in id order, so one cycle is reported once).
    req_id: str
    parent: str | None = None
    #: The requirements forming the cycle, in id order. Empty for a dangling
    #: parent.
    cycle: tuple[str, ...] = ()
    #: Where the offending requirement lives, so the report is actionable.
    source_path: str | None = None

    @property
    def message(self) -> str:
        """One line naming the requirement, the parent and the problem."""
        where = f" ({self.source_path})" if self.source_path else ""
        if self.kind is HierarchyIssueKind.PARENT_CYCLE:
            return f"parent cycle: {' -> '.join(self.cycle)} -> {self.cycle[0]}{where}"
        return f"{self.req_id}: parent {self.parent!r} does not resolve{where}"


@traces(SWR.SWR_3108)
class RequirementHierarchy(BaseModel):
    """Resolved parent/child structure over one requirement set.

    Depth is not limited: ``children`` is a single-step map and
    :meth:`descendants` walks it, so an epic containing a group containing a
    requirement is expressed exactly like a two-level store. A requirement whose
    parent does not resolve — missing target, or a cycle — keeps its place as a
    root and is reported in :attr:`issues`, so an incomplete source still loads
    completely.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    requirements: dict[str, CanonicalRequirement] = {}
    #: Only links that resolved; a dangling or cyclic parent is absent here.
    parents: dict[str, str] = {}
    #: Id-ordered children per requirement, computed from :attr:`parents`.
    children: dict[str, tuple[str, ...]] = {}
    roots: tuple[str, ...] = ()
    issues: tuple[HierarchyIssue, ...] = ()

    def requirement(self, req_id: str) -> CanonicalRequirement | None:
        """The requirement with that id, or ``None``."""
        return self.requirements.get(req_id)

    def parent_of(self, req_id: str) -> str | None:
        """The resolved parent id, or ``None`` for a root."""
        return self.parents.get(req_id)

    def children_of(self, req_id: str) -> tuple[str, ...]:
        """Direct children in id order."""
        return self.children.get(req_id, ())

    def ancestors(self, req_id: str) -> tuple[str, ...]:
        """Parent, grandparent, … — terminating even on a broken store."""
        chain: list[str] = []
        seen = {req_id}
        current = self.parents.get(req_id)
        while current is not None and current not in seen:
            chain.append(current)
            seen.add(current)
            current = self.parents.get(current)
        return tuple(chain)

    def descendants(self, req_id: str) -> tuple[str, ...]:
        """Every requirement below this one, depth-first in id order."""
        collected: list[str] = []
        seen: set[str] = set()

        def walk(node: str) -> None:
            for child in self.children_of(node):
                if child in seen:
                    continue
                seen.add(child)
                collected.append(child)
                walk(child)

        walk(req_id)
        return tuple(collected)

    def depth(self, req_id: str) -> int:
        """0 for a root, 1 for its child, and so on."""
        return len(self.ancestors(req_id))

    @property
    def dangling_parents(self) -> tuple[HierarchyIssue, ...]:
        """Requirements naming a parent the set does not contain."""
        return tuple(
            issue for issue in self.issues if issue.kind is HierarchyIssueKind.DANGLING_PARENT
        )

    @property
    def cycles(self) -> tuple[tuple[str, ...], ...]:
        """Each detected parent cycle, in id order."""
        return tuple(
            issue.cycle for issue in self.issues if issue.kind is HierarchyIssueKind.PARENT_CYCLE
        )


def _find_cycles(parents: Mapping[str, str]) -> tuple[set[str], list[tuple[str, ...]]]:
    """Members of parent cycles, and each cycle once, in id order."""
    visited: set[str] = set()
    in_cycle: set[str] = set()
    cycles: list[tuple[str, ...]] = []
    for start in sorted(parents):
        path: list[str] = []
        on_path: set[str] = set()
        current: str | None = start
        while current is not None and current not in visited:
            visited.add(current)
            path.append(current)
            on_path.add(current)
            current = parents.get(current)
        if current is not None and current in on_path:
            members = path[path.index(current) :]
            in_cycle.update(members)
            cycles.append(tuple(sorted(members, key=requirement_sort_key)))
    return in_cycle, cycles


@traces(SWR.SWR_3108)
def build_hierarchy(requirements: Iterable[CanonicalRequirement]) -> RequirementHierarchy:
    """Resolve parent links into a navigable hierarchy (SWR-3108).

    Pure: no source access, no clock. Duplicate ids resolve first-wins here —
    reporting a collision needs both sources and is the registry's job
    (SWR-3115), not the hierarchy's.
    """
    by_id: dict[str, CanonicalRequirement] = {}
    for requirement in requirements:
        by_id.setdefault(requirement.req_id, requirement)

    issues: list[HierarchyIssue] = []
    claimed: dict[str, str] = {}
    for req_id in sorted(by_id, key=requirement_sort_key):
        parent = by_id[req_id].parent
        if parent is None:
            continue
        if parent not in by_id:
            issues.append(
                HierarchyIssue(
                    kind=HierarchyIssueKind.DANGLING_PARENT,
                    req_id=req_id,
                    parent=parent,
                    source_path=by_id[req_id].source_path,
                ),
            )
            continue
        claimed[req_id] = parent

    in_cycle, cycles = _find_cycles(claimed)
    for cycle in cycles:
        issues.append(
            HierarchyIssue(
                kind=HierarchyIssueKind.PARENT_CYCLE,
                req_id=cycle[0],
                parent=claimed.get(cycle[0]),
                cycle=cycle,
                source_path=by_id[cycle[0]].source_path,
            ),
        )

    # A cycle member keeps its place as a root: dropping the link is what stops
    # `descendants` from looping, and losing the requirement would be worse than
    # losing its parent.
    resolved = {child: parent for child, parent in claimed.items() if child not in in_cycle}

    children: dict[str, list[str]] = {}
    for child, parent in resolved.items():
        children.setdefault(parent, []).append(child)
    ordered_children = {
        parent: tuple(sorted(kids, key=requirement_sort_key)) for parent, kids in children.items()
    }
    roots = tuple(
        req_id for req_id in sorted(by_id, key=requirement_sort_key) if req_id not in resolved
    )
    return RequirementHierarchy(
        requirements=by_id,
        parents=resolved,
        children=ordered_children,
        roots=roots,
        issues=tuple(issues),
    )
