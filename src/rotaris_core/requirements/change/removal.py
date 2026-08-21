"""What a removed requirement leaves behind (SWR-3509).

A requirement that disappears from its source takes nothing with it. Its code
still runs, its tests still pass, its derived technical requirements still point
at it, and the requirements that depended on it are suddenly depending on
nothing. The dangerous reading of that situation is "the requirement is gone, so
its code is dead" — and acting on it deletes work nobody asked to lose.

So this module **enumerates and reports; it never removes**. Three properties
make that structural rather than promised:

- :class:`RemovalAnalyzer` is constructed with an optional analyst and a clock.
  It holds no source, no store, no workspace, no path and no trace editor, so
  there is nothing in it that could delete a file.
  :func:`~rotaris_core.requirements.change.impact.read_only_report` checks that
  as a test rather than as a claim (Gate 4's third question);
- the worklist it produces speaks SWR-3507's vocabulary, and without an analyst
  **every site is ``decision-required``**. A removal therefore cannot even
  express "delete this" until a human or an analyst says so;
- executing anything still goes through
  :func:`~rotaris_core.requirements.change.superseding.approve_migration`, which
  refuses while a single site is undecided. There is no removal-specific
  shortcut into execution.

**A dependant is dangling, not satisfied.** :class:`DanglingDependent` has no
representable "met" state: it exists because a requirement points at an id that
no longer resolves, and its :attr:`~DanglingDependent.satisfied` is ``False`` by
construction. Treating a vanished dependency as met is the failure mode SWR-3509
names, and it would let a blocked requirement start on a foundation that was
deleted.

**Everything inbound is named, not only ``depends-on``.** Every authored edge
pointing at the removed id becomes a dangling report carrying its kind, so a
``derived-from`` child, a ``supersedes`` claim and a ``parent`` link are all
visible instead of only the relation someone thought to enumerate.

The result is retained under the tombstone (SWR-3113): :class:`RemovalLedger`
files one impact per removed id, and :meth:`RemovalImpact.to_record` writes the
same decision into the analysis log (SWR-3514).

Pure with respect to the world: the clock is injected and the analyst is a
protocol. Nothing here opens a file, spawns a process or a socket.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.records import (
    AnalysisKind,
    AnalysisRecord,
    analysis_record_id,
)
from rotaris_core.requirements.change.superseding import (
    INVENTORY_DECIDER,
    INVENTORY_PERSONA,
    MigrationInventory,
    MigrationPlan,
    MigrationRequest,
    SiteKind,
    plan_migration,
)
from rotaris_core.requirements.model import RelationKind, requirement_sort_key
from rotaris_core.requirements.tombstones import (
    Tombstone,  # noqa: TC001 - Pydantic resolves this at runtime.
)

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping

    from rotaris_core.requirements.change.superseding import (
        CoverageReference,
        MigrationAnalyst,
        MigrationEntry,
        MigrationSite,
    )
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.relations import RelationGraph

__all__ = [
    "DanglingDependent",
    "RemovalAnalyzer",
    "RemovalImpact",
    "RemovalLedger",
    "analyse_removal",
    "dangling_dependents",
]


@traces(SWR.SWR_3509)
class DanglingDependent(BaseModel):
    """A requirement pointing at an id that no longer resolves.

    There is deliberately no "satisfied" variant of this value. SWR-3509's second
    acceptance criterion is that a vanished dependency is reported as dangling
    rather than treated as met, and the cheapest way to guarantee that is to make
    "met" unrepresentable here: :attr:`satisfied` is ``False``, always, and a
    scheduler reading this cannot mistake the edge for a cleared one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The requirement left pointing at nothing.
    req_id: str
    #: The id that disappeared.
    removed_id: str
    kind: RelationKind
    #: Where the dependant lives, so the report names a file and not only an id.
    location: str | None = None

    @field_validator("req_id", "removed_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a dangling relation names both of its ends")
        return cleaned

    @property
    def satisfied(self) -> bool:
        """Always false: a dependency on a removed requirement is never met."""
        return False

    @property
    def blocks(self) -> bool:
        """Whether this dependant is held up by the removal.

        True for the enforced kinds a scheduler acts on: ``depends-on`` orders
        work (SWR-3510) and ``derived-from`` and ``parent`` place a requirement
        in a hierarchy that no longer exists. A ``related-to`` edge is carried
        and reported but nothing draws a conclusion from it (SWR-3109).
        """
        return self.kind in {
            RelationKind.DEPENDS_ON,
            RelationKind.DERIVED_FROM,
            RelationKind.PARENT,
        }

    @property
    def message(self) -> str:
        """One line a user can act on."""
        where = f" ({self.location})" if self.location else ""
        return (
            f"{self.req_id}{where}: {self.kind} {self.removed_id}, which no longer"
            " exists — the relation is dangling, not satisfied"
        )


@traces(SWR.SWR_3509)
def dangling_dependents(
    removed_id: str,
    graph: RelationGraph,
    *,
    requirements: Mapping[str, CanonicalRequirement] | None = None,
) -> tuple[DanglingDependent, ...]:
    """Every authored edge still pointing at *removed_id*. Pure.

    Read from the forward edges rather than from the computed reverse ones: a
    reverse edge only exists for a target the requirement set still contains
    (SWR-3110), so after the removal the reverse direction is silent — which is
    precisely the silence this function exists to break.
    """
    wanted = removed_id.strip()
    known = requirements or {}
    return tuple(
        sorted(
            (
                DanglingDependent(
                    req_id=edge.source,
                    removed_id=wanted,
                    kind=edge.kind,
                    location=(known[edge.source].source_path if edge.source in known else None),
                )
                for edge in graph.edges
                if edge.target == wanted and edge.source != wanted
            ),
            key=lambda entry: (requirement_sort_key(entry.req_id), str(entry.kind)),
        ),
    )


@traces(SWR.SWR_3509, SWR.SWR_3113)
class RemovalImpact(BaseModel):
    """Everything a removed requirement left behind, named and retained.

    Filed under the tombstone (SWR-3113) that recorded the removal, so the
    question "what happened to SWR-501's code" has an answer for as long as the
    id stays spoken for.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    tombstone: Tombstone
    #: The worklist over the removed requirement's own traces and tests, in
    #: SWR-3507's vocabulary. Undecided throughout unless an analyst ran.
    plan: MigrationPlan
    #: Every authored edge that still points at the removed id, whatever its kind.
    dependents: tuple[DanglingDependent, ...] = ()
    #: Requirements the removed one *used to* supersede, and which therefore have
    #: no successor any more. Read from the last known version of the removed
    #: requirement, since its own outgoing edges vanished with it.
    released: tuple[str, ...] = ()
    at: dt.datetime

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("a removal impact carries an aware timestamp, never a naive one")
        return value

    @model_validator(mode="after")
    def _about_one_removal(self) -> Self:
        replaced = self.plan.request.superseded_ids
        if replaced != (self.tombstone.req_id,):
            raise ValueError(
                f"{self.tombstone.req_id}'s removal impact carries a worklist for"
                f" {list(replaced)}; one removal, one worklist (SWR-3509)",
            )
        for dependent in self.dependents:
            if dependent.removed_id != self.tombstone.req_id:
                raise ValueError(
                    f"{dependent.req_id} is dangling on {dependent.removed_id}, not on"
                    f" {self.tombstone.req_id}",
                )
        return self

    @property
    def req_id(self) -> str:
        """The id that disappeared."""
        return self.tombstone.req_id

    @property
    def inventory(self) -> MigrationInventory:
        """Every site that still claims the removed requirement."""
        return self.plan.request.inventory

    @property
    def traces(self) -> tuple[MigrationSite, ...]:
        """``@traces`` sites left pointing at the removed id."""
        return self.inventory.of_kind(SiteKind.TRACE)

    @property
    def tests(self) -> tuple[MigrationSite, ...]:
        """``@verifies`` sites left pointing at the removed id."""
        return self.inventory.of_kind(SiteKind.TEST)

    def of_kind(self, *kinds: RelationKind) -> tuple[DanglingDependent, ...]:
        """Dangling relations of the given authored kinds."""
        wanted = frozenset(kinds)
        return tuple(entry for entry in self.dependents if entry.kind in wanted)

    @property
    def derived(self) -> tuple[str, ...]:
        """Derived technical requirements now pointing at nothing (SWR-3108)."""
        return tuple(entry.req_id for entry in self.of_kind(RelationKind.DERIVED_FROM))

    @property
    def depending(self) -> tuple[str, ...]:
        """Requirements whose ``depends-on`` can no longer be met (SWR-3510)."""
        return tuple(entry.req_id for entry in self.of_kind(RelationKind.DEPENDS_ON))

    @property
    def superseding(self) -> tuple[str, ...]:
        """Requirements that claim to supersede the removed one."""
        return tuple(entry.req_id for entry in self.of_kind(RelationKind.SUPERSEDES))

    @property
    def awaiting_decision(self) -> tuple[MigrationEntry, ...]:
        """Sites nobody has ruled on. Nothing may be executed while any remain."""
        return self.plan.undecided

    @property
    def named(self) -> tuple[str, ...]:
        """Every artefact this analysis accounted for, as one flat list.

        SWR-3509's first acceptance criterion — "every trace, test, derived
        requirement and dependent of the removed id is named" — is checkable
        against this, which is why it exists as a value rather than as four
        separate reports a caller has to remember to join.
        """
        return (
            *(site.location for site in self.traces),
            *(site.location for site in self.tests),
            *(entry.req_id for entry in self.dependents),
        )

    @property
    def message(self) -> str:
        """One line summarising what the removal left behind."""
        return (
            f"{self.req_id} was removed: {len(self.traces)} trace(s),"
            f" {len(self.tests)} test(s), {len(self.dependents)} dangling relation(s);"
            f" {len(self.awaiting_decision)} site(s) await a decision — nothing was deleted"
        )

    @property
    def report(self) -> tuple[str, ...]:
        """The lines a user is shown: the tombstone, the sites, the danglers."""
        return (
            self.tombstone.message,
            *(site.message for site in self.inventory.sites),
            *(entry.message for entry in self.dependents),
            *(
                f"{req_id}: {self.req_id} superseded it and is gone; it has no successor any more"
                for req_id in self.released
            ),
        )

    # No ``@traces`` decorator here on purpose: inside this class body the name
    # ``traces`` is the *property* above, not the annotation helper. The class
    # itself carries the annotation.
    def to_record(self) -> AnalysisRecord:
        """The auditable record of this analysis (SWR-3514).

        ``considered`` carries the whole report — every site and every dangling
        relation — because the question a reviewer asks months later is "what was
        left behind when SWR-501 went", and a count does not answer it.
        """
        return AnalysisRecord(
            record_id=analysis_record_id(
                kind=AnalysisKind.MIGRATION,
                req_id=self.req_id,
                at=self.at,
                inputs_digest=self.plan.inputs.digest,
                outcome="removal-impact",
                persona=self.plan.persona,
                model=self.plan.model,
                reasoning=self.message,
            ),
            kind=AnalysisKind.MIGRATION,
            req_id=self.req_id,
            at=self.at,
            inputs=self.plan.inputs,
            outcome="removal-impact",
            reasoning=self.message,
            considered=self.report,
            question="; ".join(entry.question for entry in self.awaiting_decision),
            persona=self.plan.persona,
            model=self.plan.model,
        )


@traces(SWR.SWR_3509, SWR.SWR_3113)
class RemovalLedger(BaseModel):
    """One removal impact per removed id, kept beside the tombstone log.

    "The analysis result is retained under the tombstone" (SWR-3509's fourth
    acceptance criterion) as a value: :meth:`for_tombstone` answers only when the
    tombstone it is handed is the *same removal* — same id, same moment — so a
    restored-and-removed-again id cannot be shown an analysis of the previous
    disappearance.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    impacts: tuple[RemovalImpact, ...] = ()

    @model_validator(mode="after")
    def _one_per_id(self) -> Self:
        seen: set[str] = set()
        for impact in self.impacts:
            if impact.req_id in seen:
                raise ValueError(f"{impact.req_id} has two removal analyses in one ledger")
            seen.add(impact.req_id)
        object.__setattr__(
            self,
            "impacts",
            tuple(sorted(self.impacts, key=lambda impact: requirement_sort_key(impact.req_id))),
        )
        return self

    def by_id(self) -> dict[str, RemovalImpact]:
        """The ledger indexed by removed requirement id."""
        return {impact.req_id: impact for impact in self.impacts}

    def get(self, req_id: str) -> RemovalImpact | None:
        """The analysis filed for *req_id*, or ``None``."""
        return self.by_id().get(req_id.strip())

    def for_tombstone(self, tombstone: Tombstone) -> RemovalImpact | None:
        """The analysis of *this* removal, or ``None`` when it is a different one."""
        impact = self.get(tombstone.req_id)
        if impact is None or impact.tombstone.removed_at != tombstone.removed_at:
            return None
        return impact

    def with_impact(self, impact: RemovalImpact) -> RemovalLedger:
        """The ledger with *impact* added, replacing an earlier one for that id."""
        kept = [entry for entry in self.impacts if entry.req_id != impact.req_id]
        kept.append(impact)
        return RemovalLedger(impacts=tuple(kept))


def _utc_now() -> dt.datetime:
    """The default clock, replaced in every test."""
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3509)
def analyse_removal(
    tombstone: Tombstone,
    *,
    graph: RelationGraph,
    coverage: Mapping[str, CoverageReference] | None = None,
    requirements: Mapping[str, CanonicalRequirement] | None = None,
    last_known: CanonicalRequirement | None = None,
    at: dt.datetime,
    analyst: MigrationAnalyst | None = None,
    persona: str = "",
    model: str = "",
) -> RemovalImpact:
    """Enumerate what *tombstone*'s requirement left behind. Pure.

    Deliberately a function over values: a graph, a coverage answer and a
    tombstone go in, a report comes out. There is no argument here that could be
    written through, which is what makes "nothing is deleted as a consequence of
    the removal" a property of the signature rather than of the body.
    """
    removed = tombstone.req_id
    sites = coverage.get(removed) if coverage is not None else None
    inventory = (
        MigrationInventory.from_coverage({removed: sites})
        if sites is not None
        else MigrationInventory()
    )
    plan = plan_migration(
        MigrationRequest(superseded_ids=(removed,), inventory=inventory),
        analyst=analyst,
        at=at,
        persona=persona,
        model=model,
    )
    released = (
        tuple(
            sorted(last_known.related_ids(RelationKind.SUPERSEDES), key=requirement_sort_key),
        )
        if last_known is not None
        else ()
    )
    return RemovalImpact(
        tombstone=tombstone,
        plan=plan,
        dependents=dangling_dependents(removed, graph, requirements=requirements),
        released=released,
        at=at,
    )


@traces(SWR.SWR_3509)
class RemovalAnalyzer:
    """The removal analysis as an object — and it holds nothing that can write.

    An optional analyst, its attribution, and a clock. No source, no store, no
    workspace, no path, no trace editor. That is the whole state, and
    :func:`~rotaris_core.requirements.change.impact.read_only_report` turns it
    into a check: an empty report is the guarantee that a requirement
    disappearing cannot delete anything.

    Without an analyst every site of the worklist is ``decision-required``, which
    is the safe default rather than an empty feature: the honest answer to "is
    this code obsolete now" is a question, and SWR-3509 forbids answering it by
    deleting.
    """

    def __init__(
        self,
        *,
        analyst: MigrationAnalyst | None = None,
        persona: str = "",
        model: str = "",
        clock: Callable[[], dt.datetime] = _utc_now,
    ) -> None:
        self._analyst = analyst
        self._persona = persona.strip()
        self._model = model.strip()
        self._clock = clock
        if analyst is not None and not (self._persona and self._model):
            raise ValueError(
                "a removal analyst is configured with both the persona and the model"
                " its actions are recorded against (SWR-3514)",
            )

    @property
    def persona(self) -> str:
        """The persona a decided action is attributed to."""
        return self._persona or INVENTORY_PERSONA

    @property
    def model_name(self) -> str:
        """The model a decided action is attributed to."""
        return self._model or INVENTORY_DECIDER

    @traces(SWR.SWR_3509)
    def analyse(
        self,
        tombstone: Tombstone,
        *,
        graph: RelationGraph,
        coverage: Mapping[str, CoverageReference] | None = None,
        requirements: Mapping[str, CanonicalRequirement] | None = None,
        last_known: CanonicalRequirement | None = None,
        at: dt.datetime | None = None,
    ) -> RemovalImpact:
        """Report what the removal left behind, and change nothing."""
        return analyse_removal(
            tombstone,
            graph=graph,
            coverage=coverage,
            requirements=requirements,
            last_known=last_known,
            at=at if at is not None else self._clock(),
            analyst=self._analyst,
            persona=self._persona,
            model=self._model,
        )
