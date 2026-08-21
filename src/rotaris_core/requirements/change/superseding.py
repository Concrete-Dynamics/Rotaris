"""Superseding: the migration worklist (SWR-3507) and the deprecation it ends in (SWR-3508).

Marking a requirement as superseded is one line of bookkeeping. The work is in
what its implementation and its tests must now become, and leaving that implicit
is how a replaced requirement's code becomes dead code the verifier still counts
as traced.

This module is the only place in the board that proposes **changing or deleting
somebody else's code**, so its shape is decided by damage limitation rather than
by convenience.

**Analysis cannot reach execution.** The three stages are three types, and each
is the *only* input the next one accepts:

```text
MigrationRequest ─▶ plan_migration() ─▶ MigrationPlan
                                            │  every site, exactly once
                                            ▼
                                     approve_migration(approver=…)
                                            │  refuses while anything is undecided
                                            ▼
                                     ApprovedMigration ─▶ MigrationExecutor.execute()
```

:meth:`MigrationExecutor.execute` takes an :class:`ApprovedMigration` and nothing
else. There is no overload, no ``force`` flag and no default approval, so no
caller can get from an analysis to a code change without a named human having
seen the list — SWR-3507's third acceptance criterion, and Gate 4's first
question. :class:`ApprovedMigration` additionally re-checks the plan it carries:
an approval whose digest no longer matches its plan is refused, so a worklist
cannot be edited *after* it was signed off.

**"Human" is a type, not a word.** :attr:`MigrationApproval.approver` is a
:class:`~rotaris_core.requirements.delivery.state.DeliveryActor` and
:func:`~rotaris_core.requirements.change.decisions.require_human` refuses an
``ActorKind.SYSTEM`` one. Without that the gate would be a non-empty string:
``approver="impact-analyst"`` reads like a person and is not one, and the code
this module deletes belongs to somebody else.

**Edits are applied bottom-up.** :attr:`ApprovedMigration.operations` emits its
operations grouped by file and descending by line, because every ``site.line``
was planned against the pre-migration file: applied top-down, the first removal
in a file shifts every later line and the next operation edits the wrong one.
The ordering is a contract stated on :class:`TraceEditor`, so a rewriter written
later inherits the guarantee rather than the trap.

**Undecidable is its own action.** :attr:`MigrationAction.DECISION_REQUIRED` is a
member of the same closed vocabulary as the five SWR-3507 names, and every path
that cannot produce one of those five lands on it: an answer naming no action, an
action outside the vocabulary, an action without reasoning, a ``re-point``
without a target, a target on an action that takes none, and a site the analyst
never mentioned at all. None of them falls through to ``keep`` (which would leave
dead code traced) or to ``remove`` (which would delete code on a misread
payload).

**The worklist is complete and each site appears once.** :class:`MigrationPlan`
validates that its worklist covers its inventory exactly — no site missing, no
site twice, no entry for a site that is not in the inventory. That is SWR-3507's
first acceptance criterion enforced by construction rather than by the analyst
being thorough.

The second half is SWR-3508: completing a migration *deprecates* the superseded
requirements through the source write path (SWR-3111) — once, and only after the
execution completed — and a read-only source yields a stated manual step instead
of a silent skip. Ids, history and delivery records survive; a superseded
requirement leaves scheduling and epic progress but stays visible and says why.

Pure with respect to the world: the clock is a callable, the analyst is a
protocol, the trace editor is a protocol and the write path is a protocol.
Nothing here opens a file, spawns a process or a socket.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.decisions import require_human
from rotaris_core.requirements.change.records import (
    AnalysisInputs,
    AnalysisKind,
    AnalysisRecord,
    analysis_record_id,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.hashing import content_hash
from rotaris_core.requirements.model import (
    RelationKind,
    RequirementLifecycle,
    requirement_sort_key,
)
from rotaris_core.requirements.relations import ReverseRelationKind
from rotaris_core.requirements.sources.base import RequirementEdit

if TYPE_CHECKING:
    from collections.abc import Callable, Collection, Iterable, Mapping, Sequence

    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.relations import RelationGraph
    from rotaris_core.requirements.writeback import WriteBackOutcome

__all__ = [
    "DECIDED_ACTIONS",
    "INVENTORY_DECIDER",
    "MIGRATION_AGENT",
    "INVENTORY_PERSONA",
    "ApprovedMigration",
    "CompletionResult",
    "CoverageReference",
    "DeprecationOutcome",
    "LifecycleWriter",
    "ManualStep",
    "MigrationAction",
    "MigrationAnalyst",
    "MigrationApproval",
    "MigrationApprovalError",
    "MigrationEntry",
    "MigrationExecution",
    "MigrationExecutor",
    "MigrationInventory",
    "MigrationPlan",
    "MigrationRequest",
    "MigrationSite",
    "MigrationWorklist",
    "SiteKind",
    "SiteReference",
    "SupersededStanding",
    "SupersedingCompletion",
    "TraceEdit",
    "TraceEditor",
    "TraceOperation",
    "approve_migration",
    "dangling_traces",
    "plan_migration",
    "read_action",
    "superseded_standing",
]

#: Who a worklist built *without* an analyst is attributed to. SWR-3514 requires
#: every record to name a persona and a model; the honest answer for a plan in
#: which every site is undecided is "the trace inventory produced this, nobody
#: judged anything" rather than a persona that was never asked.
#: The ``agent`` an execution unit carrying a migration names (SWR-3507). Not a
#: persona and not a model: it is how a composition tells the run host that this
#: unit's work is the approved worklist rather than a prompt, and it lives beside
#: the rest of the migration's vocabulary so the host and the planner cannot
#: spell it differently.
MIGRATION_AGENT = "requirement-migration"

INVENTORY_PERSONA = "superseding-migration"
INVENTORY_DECIDER = "trace-inventory"


@traces(SWR.SWR_3507)
class SiteKind(StrEnum):
    """Whether a claiming site is implementation or test."""

    TRACE = "trace"
    TEST = "test"

    @property
    def label(self) -> str:
        """``Trace`` — what a worklist row prints."""
        return self.value.capitalize()

    @property
    def annotation(self) -> str:
        """``@traces`` / ``@verifies`` — the annotation this kind is written as."""
        return "@traces" if self is SiteKind.TRACE else "@verifies"

    @classmethod
    def of_annotation(cls, kind: str) -> SiteKind:
        """The site kind an occurrence's annotation kind means.

        ReqToCode's sweep names three kinds: ``traces`` on implementation,
        ``verifies`` on tests and the transitional ``@req`` comment, which is a
        test-side convention only. Both test-side spellings are one kind here,
        because what the worklist has to decide about them is the same question.
        """
        return cls.TEST if kind.strip().casefold() in {"verifies", "@req"} else cls.TRACE


@runtime_checkable
class SiteReference(Protocol):
    """One annotated location, as a coverage query reports it.

    Structural, so this module never imports
    :mod:`rotaris_core.reqtocode.coverage` — which would drag the whole verifier
    sweep into every import of the board — while
    :class:`~rotaris_core.reqtocode.coverage.CoverageSite` still satisfies it.
    """

    @property
    def path(self) -> str:
        """Repository-relative posix path of the file carrying the annotation."""
        ...

    @property
    def line(self) -> int:
        """1-based line the annotation sits on."""
        ...

    @property
    def kind(self) -> str:
        """``traces`` / ``verifies`` / ``@req``."""
        ...


class CoverageReference(Protocol):
    """Everything that claims one requirement, as a coverage query reports it."""

    @property
    def implementations(self) -> Sequence[SiteReference]:
        """``@traces`` sites."""
        ...

    @property
    def tests(self) -> Sequence[SiteReference]:
        """``@verifies`` sites."""
        ...


@traces(SWR.SWR_3507)
class MigrationAction(StrEnum):
    """What happens to one site of a superseded requirement (SWR-3507).

    The five SWR-3507 names plus the outcome for a site the analysis could not
    classify. ``decision-required`` is deliberately *inside* this enum rather
    than modelled as a missing action: an absent value is something a caller can
    forget to handle, a member is something ``match`` and ``if`` have to answer
    for. Nothing may fall through to :attr:`KEEP` — which would leave dead code
    counted as traced — or to :attr:`REMOVE`, which would delete code on a guess.
    """

    #: The site is obsolete with the requirement it claims. It goes.
    REMOVE = "remove"
    #: The code stays where it is and changes to satisfy the new requirement.
    ADAPT = "adapt"
    #: The site is right as it stands and keeps claiming the old id.
    KEEP = "keep"
    #: The behaviour belongs to the new requirement and moves there.
    MIGRATE = "migrate"
    #: Only the annotation changes: the same code now claims the new id.
    RE_POINT = "re-point"
    #: Not classifiable from the inventory. A question, never a default.
    DECISION_REQUIRED = "decision-required"

    @property
    def label(self) -> str:
        """``Re Point`` — what a worklist row prints."""
        return " ".join(part.capitalize() for part in self.value.split("-"))

    @property
    def decided(self) -> bool:
        """Whether this action is one of the five SWR-3507 names."""
        return self is not MigrationAction.DECISION_REQUIRED

    @property
    def needs_target(self) -> bool:
        """Whether the action names the requirement the site moves to."""
        return self in {MigrationAction.MIGRATE, MigrationAction.RE_POINT}

    @property
    def edits_annotation(self) -> bool:
        """Whether executing this action rewrites the site's own annotation.

        The two that a :class:`TraceEditor` performs mechanically. ``adapt`` and
        ``migrate`` also end in changed code, but they need an agent to write it
        and become execution units (SWR-3405) instead of edits.
        """
        return self in {MigrationAction.REMOVE, MigrationAction.RE_POINT}


#: The five actions SWR-3507 names, without the undecided outcome. Exported so a
#: consumer can say "these are the answers" without repeating the vocabulary.
DECIDED_ACTIONS: frozenset[MigrationAction] = frozenset(
    action for action in MigrationAction if action.decided
)


@traces(SWR.SWR_3507)
class MigrationSite(BaseModel):
    """One annotated location claiming a superseded requirement.

    A value, not a handle: a path, a line and the id the annotation names. There
    is nothing here that could open, edit or delete the file it points at, which
    is what makes an inventory safe to hand to an analyst.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: SiteKind
    #: The superseded requirement this site claims.
    req_id: str
    #: Repository-relative posix path.
    path: str
    line: int
    #: The decorated function or class, when the caller knows it. Display only.
    symbol: str = ""

    @field_validator("req_id", "path")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a migration site names its requirement and its file")
        return cleaned

    @field_validator("line")
    @classmethod
    def _positive(cls, value: int) -> int:
        if value < 1:
            raise ValueError("a migration site sits on a 1-based line")
        return value

    @classmethod
    def of(cls, req_id: str, reference: SiteReference, *, symbol: str = "") -> Self:
        """The migration site for one coverage occurrence of *req_id*."""
        return cls(
            kind=SiteKind.of_annotation(reference.kind),
            req_id=req_id,
            path=reference.path,
            line=reference.line,
            symbol=symbol,
        )

    @property
    def location(self) -> str:
        """``src/pkg/login.py:41`` — the site as SWR-3206 records it."""
        return f"{self.path}:{self.line}"

    @property
    def key(self) -> str:
        """The identity a worklist entry is filed under.

        Includes the requirement id: one ``@traces(SWR.A, SWR.B)`` decorator is
        two occurrences on one line, and they can be migrated differently.
        """
        return f"{self.kind}|{self.req_id}|{self.location}"

    @property
    def order_key(self) -> tuple[str, int, str, tuple[tuple[int, int, str], ...]]:
        """Path, then line — the order a human reads a worklist in."""
        return (self.path, self.line, str(self.kind), requirement_sort_key(self.req_id))

    @property
    def message(self) -> str:
        """One line naming the annotation, the file and the requirement."""
        symbol = f" ({self.symbol})" if self.symbol else ""
        return f"{self.kind.annotation}({self.req_id}) at {self.location}{symbol}"


@traces(SWR.SWR_3507)
class MigrationInventory(BaseModel):
    """Every trace and every test of the superseded requirements, each once.

    De-duplication is a validation error rather than a silent merge: a site
    listed twice would be *migrated* twice, and the second application of a
    ``remove`` to a line that is already gone is how a migration takes a
    neighbouring line with it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    sites: tuple[MigrationSite, ...] = ()

    @model_validator(mode="after")
    def _unique_and_ordered(self) -> Self:
        seen: set[str] = set()
        for site in self.sites:
            if site.key in seen:
                raise ValueError(
                    f"{site.key} is listed twice; a site is migrated once (SWR-3507)",
                )
            seen.add(site.key)
        object.__setattr__(
            self,
            "sites",
            tuple(sorted(self.sites, key=lambda site: site.order_key)),
        )
        return self

    @classmethod
    def from_coverage(cls, coverage: Mapping[str, CoverageReference]) -> Self:
        """The inventory of every site claiming any of *coverage*'s requirements."""
        sites: list[MigrationSite] = []
        for req_id in sorted(coverage, key=requirement_sort_key):
            entry = coverage[req_id]
            sites.extend(MigrationSite.of(req_id, ref) for ref in entry.implementations)
            sites.extend(MigrationSite.of(req_id, ref) for ref in entry.tests)
        return cls(sites=tuple(sites))

    @property
    def keys(self) -> tuple[str, ...]:
        """Every site key, in worklist order."""
        return tuple(site.key for site in self.sites)

    @property
    def req_ids(self) -> tuple[str, ...]:
        """The requirements this inventory covers, in natural id order."""
        return tuple(sorted({site.req_id for site in self.sites}, key=requirement_sort_key))

    @property
    def empty(self) -> bool:
        """Whether nothing at all claims the superseded requirements."""
        return not self.sites

    def of_kind(self, kind: SiteKind) -> tuple[MigrationSite, ...]:
        """Sites of one kind, in worklist order."""
        return tuple(site for site in self.sites if site.kind is kind)

    def for_requirement(self, req_id: str) -> tuple[MigrationSite, ...]:
        """Sites claiming one requirement."""
        return tuple(site for site in self.sites if site.req_id == req_id.strip())

    @property
    def digest(self) -> str:
        """One token naming exactly this set of sites."""
        return content_hash("\n".join(self.keys))


@traces(SWR.SWR_3507)
class MigrationEntry(BaseModel):
    """One site of the worklist and what is to happen to it.

    Four rules are validated rather than trusted, and each closes a way for an
    undecided site to look decided:

    - a decided action **states its reasoning** — an action nobody can check is
      not a decision a human can approve;
    - ``migrate`` and ``re-point`` **name their target**, and the target is not
      the id being replaced;
    - an action that takes no target **carries none**: ``remove`` with a target
      is a contradictory answer, not a removal;
    - ``decision-required`` **asks a question** and names no target.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    site: MigrationSite
    action: MigrationAction
    reasoning: str = ""
    #: The requirement the site moves to, for ``migrate`` and ``re-point``.
    target: str = ""
    #: What a human has to answer, for ``decision-required``.
    question: str = ""
    #: Who decided: the analyst persona and model, or the human who ruled.
    decided_by: str = ""

    @model_validator(mode="after")
    def _coherent(self) -> Self:
        if self.action.decided and not self.reasoning.strip():
            raise ValueError(
                f"{self.site.key}: {self.action} without reasoning cannot be reviewed"
                " before it is executed (SWR-3507)",
            )
        if self.action.needs_target:
            if not self.target.strip():
                raise ValueError(
                    f"{self.site.key}: {self.action} names the requirement the site"
                    " moves to (SWR-3507)",
                )
            if self.target.strip() == self.site.req_id:
                raise ValueError(
                    f"{self.site.key}: {self.action} onto {self.target!r} is the id"
                    " being replaced, which changes nothing",
                )
        elif self.target.strip():
            raise ValueError(
                f"{self.site.key}: {self.action} takes no target, but {self.target!r}"
                " was named; a contradictory answer is not a decision",
            )
        if self.action is MigrationAction.DECISION_REQUIRED and not self.question.strip():
            raise ValueError(
                f"{self.site.key}: an unclassifiable site states the question a human"
                " has to answer (SWR-3507)",
            )
        return self

    @property
    def key(self) -> str:
        """The site key this entry is filed under."""
        return self.site.key

    @property
    def decided(self) -> bool:
        """Whether an action was actually assigned."""
        return self.action.decided

    @property
    def message(self) -> str:
        """One worklist row."""
        target = f" → {self.target}" if self.target else ""
        tail = f" — {self.question}" if not self.decided else f" — {self.reasoning}"
        return f"{self.action.label}{target}: {self.site.message}{tail}"

    def with_decision(
        self,
        action: MigrationAction,
        *,
        reasoning: str,
        target: str = "",
        decided_by: str,
    ) -> MigrationEntry:
        """This entry with a human's ruling on it.

        The one way an undecided entry becomes decided. It returns a new value,
        so the plan a reviewer looked at is still readable next to the one they
        signed off.
        """
        return MigrationEntry(
            site=self.site,
            action=action,
            reasoning=reasoning,
            target=target,
            question="" if action.decided else self.question,
            decided_by=decided_by,
        )


@traces(SWR.SWR_3507)
class MigrationWorklist(BaseModel):
    """Every entry of one migration, one per site.

    Ordered by site so two plans over the same inventory compare line by line,
    and unique by site key so an entry can never be applied twice.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    entries: tuple[MigrationEntry, ...] = ()

    @model_validator(mode="after")
    def _unique_and_ordered(self) -> Self:
        seen: set[str] = set()
        for entry in self.entries:
            if entry.key in seen:
                raise ValueError(
                    f"{entry.key} is decided twice; a site carries one action (SWR-3507)",
                )
            seen.add(entry.key)
        object.__setattr__(
            self,
            "entries",
            tuple(sorted(self.entries, key=lambda entry: entry.site.order_key)),
        )
        return self

    @property
    def keys(self) -> tuple[str, ...]:
        """Every site key this worklist decides, in worklist order."""
        return tuple(entry.key for entry in self.entries)

    def get(self, key: str) -> MigrationEntry | None:
        """The entry for one site key, or ``None``."""
        return next((entry for entry in self.entries if entry.key == key), None)

    def of_action(self, *actions: MigrationAction) -> tuple[MigrationEntry, ...]:
        """Entries carrying any of *actions*, in worklist order."""
        wanted = frozenset(actions)
        return tuple(entry for entry in self.entries if entry.action in wanted)

    @property
    def undecided(self) -> tuple[MigrationEntry, ...]:
        """Sites nobody has ruled on yet."""
        return self.of_action(MigrationAction.DECISION_REQUIRED)

    def missing(self, inventory: MigrationInventory) -> tuple[str, ...]:
        """Sites of *inventory* this worklist says nothing about."""
        decided = set(self.keys)
        return tuple(key for key in inventory.keys if key not in decided)

    def extra(self, inventory: MigrationInventory) -> tuple[str, ...]:
        """Entries of this worklist that are not sites of *inventory*."""
        known = set(inventory.keys)
        return tuple(key for key in self.keys if key not in known)

    def covers(self, inventory: MigrationInventory) -> bool:
        """Whether every site appears exactly once and nothing else does."""
        return not self.missing(inventory) and not self.extra(inventory)

    def with_decision(
        self,
        key: str,
        action: MigrationAction,
        *,
        reasoning: str,
        target: str = "",
        decided_by: str,
    ) -> MigrationWorklist:
        """This worklist with one site ruled on by a human."""
        entry = self.get(key)
        if entry is None:
            raise ValueError(f"{key!r} is not a site of this worklist")
        replaced = entry.with_decision(
            action,
            reasoning=reasoning,
            target=target,
            decided_by=decided_by,
        )
        return MigrationWorklist(
            entries=tuple(replaced if other.key == key else other for other in self.entries),
        )

    @property
    def digest(self) -> str:
        """One token naming exactly these decisions.

        What an approval is bound to: change any action, target or site and the
        digest moves, so an :class:`ApprovedMigration` built from the old
        approval is refused instead of executing a list nobody saw.
        """
        payload = "\n".join(
            f"{entry.key}\x1f{entry.action}\x1f{entry.target}" for entry in self.entries
        )
        return content_hash(payload)


@traces(SWR.SWR_3507)
class MigrationRequest(BaseModel):
    """What a migration analysis is given — and nothing it could write with.

    Values only: the replaced ids and an inventory of ``path:line`` references.
    An analyst holding this can reason about what exists without being handed
    anything that could change it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The requirement doing the replacing. Empty for a removal (SWR-3509),
    #: where the sites are left behind by an id that has no successor at all.
    superseding_id: str = ""
    superseded_ids: tuple[str, ...]
    inventory: MigrationInventory = MigrationInventory()

    @model_validator(mode="after")
    def _coherent(self) -> Self:
        replaced = tuple(req_id.strip() for req_id in self.superseded_ids)
        if not replaced or not all(replaced):
            raise ValueError("a migration names at least one requirement being replaced")
        if len(set(replaced)) != len(replaced):
            raise ValueError(f"a requirement is replaced once; got {list(replaced)}")
        superseding = self.superseding_id.strip()
        if superseding and superseding in replaced:
            raise ValueError(f"{superseding} cannot supersede itself")
        unknown = sorted({site.req_id for site in self.inventory.sites} - set(replaced))
        if unknown:
            raise ValueError(
                f"the inventory carries sites of {unknown}, which this migration does not replace",
            )
        object.__setattr__(
            self, "superseded_ids", tuple(sorted(replaced, key=requirement_sort_key))
        )
        object.__setattr__(self, "superseding_id", superseding)
        return self

    @classmethod
    def for_supersession(
        cls,
        superseding_id: str,
        superseded_ids: Iterable[str],
        *,
        coverage: Mapping[str, CoverageReference],
    ) -> Self:
        """The request for ``superseding_id supersedes superseded_ids``.

        The coverage query is read for exactly the replaced ids, so a mapping
        that happens to hold the whole store does not smuggle a third
        requirement's sites into the worklist.
        """
        replaced = tuple(dict.fromkeys(req_id.strip() for req_id in superseded_ids))
        wanted = {req_id: coverage[req_id] for req_id in replaced if req_id in coverage}
        return cls(
            superseding_id=superseding_id,
            superseded_ids=replaced,
            inventory=MigrationInventory.from_coverage(wanted),
        )

    @classmethod
    def from_relations(
        cls,
        superseding_id: str,
        graph: RelationGraph,
        *,
        coverage: Mapping[str, CoverageReference],
    ) -> Self:
        """The request for whatever *superseding_id* declares it supersedes.

        Read from the relation graph (SWR-3109) rather than from a caller's list,
        so the worklist covers what the *source* says is being replaced.
        """
        return cls.for_supersession(
            superseding_id,
            graph.targets(superseding_id, RelationKind.SUPERSEDES),
            coverage=coverage,
        )

    @property
    def site_count(self) -> int:
        """How many sites the worklist has to account for."""
        return len(self.inventory.sites)

    @property
    def message(self) -> str:
        """One line: who replaces what, and how much code is involved."""
        who = self.superseding_id or "nothing"
        return (
            f"{who} replaces {', '.join(self.superseded_ids)}: {self.site_count} site(s) to decide"
        )


@runtime_checkable
class MigrationAnalyst(Protocol):
    """Whatever reads a migration request and proposes an action per site.

    One method, taking a value and answering a mapping from site key to payload,
    so the whole decision path is exercised against a few lines of fake and never
    reaches a network. The protocol has no write operation, which is not an
    oversight: an analyst that could edit is exactly what the plan-then-approve
    split exists to prevent.
    """

    def classify(self, request: MigrationRequest) -> Mapping[str, Mapping[str, object]]:
        """Propose an action for each site key of *request*."""
        ...


def _text_of(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


@traces(SWR.SWR_3507)
def read_action(
    site: MigrationSite,
    payload: Mapping[str, object] | None,
    *,
    decided_by: str = "",
) -> MigrationEntry:
    """Read one proposed action, downgrading anything unreadable. Pure.

    Six ways an answer fails, and every one of them lands on
    ``decision-required`` with the reason stated in the question:

    - there is no answer for this site at all;
    - the answer names no action;
    - the action is outside the vocabulary;
    - the action carries no reasoning;
    - ``migrate`` / ``re-point`` names no target, or names the id it replaces;
    - an action that takes no target carries one.

    Not one of them falls through to ``keep`` or to ``remove``. That is the whole
    point of this function: the failure modes of a model answer must not be able
    to become a code deletion.
    """

    def undecided(why: str) -> MigrationEntry:
        return MigrationEntry(
            site=site,
            action=MigrationAction.DECISION_REQUIRED,
            question=f"{site.message}: {why}",
            decided_by=decided_by,
        )

    if payload is None:
        return undecided("the analysis did not mention this site")
    raw = _text_of(payload.get("action"))
    reasoning = _text_of(payload.get("reasoning")) or _text_of(payload.get("rationale"))
    target = _text_of(payload.get("target"))
    if not raw:
        return undecided("the analysis named no action")
    try:
        action = MigrationAction(raw)
    except ValueError:
        return undecided(f"the analysis answered {raw!r}, which is not a migration action")
    if action is MigrationAction.DECISION_REQUIRED:
        return MigrationEntry(
            site=site,
            action=action,
            question=_text_of(payload.get("question"))
            or f"{site.message}: the analysis could not classify this site",
            decided_by=decided_by,
        )
    if not reasoning:
        return undecided(f"the analysis answered {action} without stating why")
    if action.needs_target and not target:
        return undecided(f"the analysis answered {action} without naming a target")
    if action.needs_target and target == site.req_id:
        return undecided(f"the analysis answered {action} onto the id being replaced")
    if not action.needs_target and target:
        return undecided(f"the analysis answered {action} but also named a target {target!r}")
    return MigrationEntry(
        site=site,
        action=action,
        reasoning=reasoning,
        target=target,
        decided_by=decided_by,
    )


@traces(SWR.SWR_3507, SWR.SWR_3514)
class MigrationPlan(BaseModel):
    """The worklist, inspectable, before anything has been changed.

    The completeness rule of SWR-3507 lives in the validator: the worklist covers
    the request's inventory **exactly** — every site once, nothing missing,
    nothing invented. A plan that does not is not a plan a human could approve,
    so it cannot be constructed at all.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    request: MigrationRequest
    worklist: MigrationWorklist
    at: dt.datetime
    persona: str = INVENTORY_PERSONA
    model: str = INVENTORY_DECIDER
    #: Site keys the analyst answered that no site of the inventory carries.
    #: Reported rather than dropped: an answer about a file nobody asked about is
    #: a sign the analyst read a different tree.
    unknown_sites: tuple[str, ...] = ()

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("a migration plan carries an aware timestamp, never a naive one")
        return value

    @model_validator(mode="after")
    def _complete(self) -> Self:
        missing = self.worklist.missing(self.request.inventory)
        if missing:
            raise ValueError(
                f"the worklist says nothing about {list(missing)}; every trace and"
                " every test of a superseded requirement gets an action (SWR-3507)",
            )
        extra = self.worklist.extra(self.request.inventory)
        if extra:
            raise ValueError(
                f"the worklist decides {list(extra)}, which the inventory does not"
                " contain; a migration touches only what it enumerated (SWR-3507)",
            )
        if not (self.persona.strip() and self.model.strip()):
            raise ValueError(
                "a migration plan names the persona and the model its actions are"
                " recorded against (SWR-3514)",
            )
        return self

    @property
    def entries(self) -> tuple[MigrationEntry, ...]:
        """Every worklist row, in worklist order."""
        return self.worklist.entries

    @property
    def undecided(self) -> tuple[MigrationEntry, ...]:
        """Sites that still need a human ruling."""
        return self.worklist.undecided

    @property
    def ready_for_approval(self) -> bool:
        """Whether every site now carries one of the five actions."""
        return not self.undecided

    @property
    def digest(self) -> str:
        """One token naming this exact plan — inventory *and* decisions."""
        return content_hash(
            "\x1e".join(
                (
                    self.request.superseding_id,
                    ",".join(self.request.superseded_ids),
                    self.request.inventory.digest,
                    self.worklist.digest,
                ),
            ),
        )

    @property
    def counts(self) -> dict[MigrationAction, int]:
        """How many sites carry each action — the summary a card shows."""
        tally: dict[MigrationAction, int] = {}
        for entry in self.entries:
            tally[entry.action] = tally.get(entry.action, 0) + 1
        return tally

    @property
    def summary(self) -> str:
        """``5 site(s): 2 re-point, 2 keep, 1 decision required``."""
        counts = self.counts
        parts = ", ".join(
            f"{counts[action]} {action.value}" for action in MigrationAction if action in counts
        )
        return f"{len(self.entries)} site(s): {parts}" if parts else "0 site(s)"

    @property
    def message(self) -> str:
        """One line a user reads before deciding whether to approve."""
        if self.ready_for_approval:
            state = "ready for approval"
        else:
            state = f"{len(self.undecided)} site(s) need a decision"
        return f"{self.request.message} — {self.summary}; {state}"

    def with_decision(
        self,
        key: str,
        action: MigrationAction,
        *,
        reasoning: str,
        target: str = "",
        decided_by: str,
    ) -> MigrationPlan:
        """This plan with one undecided site ruled on.

        Rebuilt rather than copied, so the completeness validator runs again: a
        decision must not be able to smuggle a site out of the worklist.
        """
        return MigrationPlan(
            request=self.request,
            worklist=self.worklist.with_decision(
                key,
                action,
                reasoning=reasoning,
                target=target,
                decided_by=decided_by,
            ),
            at=self.at,
            persona=self.persona,
            model=self.model,
            unknown_sites=self.unknown_sites,
        )

    @property
    def record_id(self) -> str:
        """The id of the record explaining this plan (SWR-3514)."""
        return analysis_record_id(
            kind=AnalysisKind.MIGRATION,
            req_id=self.request.superseding_id or self.request.superseded_ids[0],
            at=self.at,
            inputs_digest=self.inputs.digest,
            outcome=self.outcome,
            persona=self.persona,
            model=self.model,
            reasoning=self.summary,
        )

    @property
    def inputs(self) -> AnalysisInputs:
        """The recordable, content-free identity of what was analysed."""
        return AnalysisInputs(
            traces=tuple(site.location for site in self.request.inventory.of_kind(SiteKind.TRACE)),
            tests=tuple(site.location for site in self.request.inventory.of_kind(SiteKind.TEST)),
        )

    @property
    def outcome(self) -> str:
        """``migration-planned`` or ``decision-required`` — the record's verdict."""
        return "migration-planned" if self.ready_for_approval else "decision-required"

    @traces(SWR.SWR_3514)
    def to_record(self) -> AnalysisRecord:
        """The auditable record of this plan (SWR-3514).

        ``considered`` carries **every row**, not a count. Months later the
        question is not "how many sites were there" but "why was that file
        deleted", and only the rows answer it.
        """
        return AnalysisRecord(
            record_id=self.record_id,
            kind=AnalysisKind.MIGRATION,
            req_id=self.request.superseding_id or self.request.superseded_ids[0],
            at=self.at,
            inputs=self.inputs,
            outcome=self.outcome,
            reasoning=self.message,
            considered=tuple(entry.message for entry in self.entries),
            question="; ".join(entry.question for entry in self.undecided),
            persona=self.persona,
            model=self.model,
        )


def _utc_now() -> dt.datetime:
    """The default clock, replaced in every test."""
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3507)
def plan_migration(
    request: MigrationRequest,
    *,
    analyst: MigrationAnalyst | None = None,
    at: dt.datetime | None = None,
    persona: str = "",
    model: str = "",
    clock: Callable[[], dt.datetime] = _utc_now,
) -> MigrationPlan:
    """Build the worklist for *request*: one entry per site, no exceptions.

    Completeness and exactly-once are properties of the loop, not of the
    analyst's diligence: the iteration is over the **inventory**, and a site the
    analyst never mentioned becomes ``decision-required`` rather than being left
    out. An analyst that raises is not an outage that half-migrates a
    requirement — every site becomes undecided with the failure stated, which
    keeps the plan inspectable and unapprovable.

    Without an analyst the plan is a complete list of open questions. That is a
    useful artefact — it is the inventory a human rules on — and it is also the
    safe default: nothing is classified, so nothing can be executed.
    """
    moment = at if at is not None else clock()
    if analyst is None:
        answers: Mapping[str, Mapping[str, object]] = {}
        decided_by = f"{INVENTORY_PERSONA} ({INVENTORY_DECIDER})"
        who, what = INVENTORY_PERSONA, INVENTORY_DECIDER
    else:
        if not (persona.strip() and model.strip()):
            raise ValueError(
                "a migration analyst is configured with both the persona and the"
                " model its actions are recorded against (SWR-3514)",
            )
        who, what = persona.strip(), model.strip()
        decided_by = f"{who} ({what})"
        try:
            answers = dict(analyst.classify(request))
        except Exception as error:  # noqa: BLE001 - any analyst failure stays a stated result
            answers = {}
            decided_by = f"{who} ({what}) failed: {type(error).__name__}: {error}"

    entries = tuple(
        read_action(site, answers.get(site.key), decided_by=decided_by)
        for site in request.inventory.sites
    )
    known = set(request.inventory.keys)
    return MigrationPlan(
        request=request,
        worklist=MigrationWorklist(entries=entries),
        at=moment,
        persona=who,
        model=what,
        unknown_sites=tuple(sorted(key for key in answers if key not in known)),
    )


class MigrationApprovalError(RuntimeError):
    """A migration was asked to execute without a human having approved it."""


@traces(SWR.SWR_3507)
class MigrationApproval(BaseModel):
    """A named human's sign-off on one exact plan.

    :attr:`plan_digest` is what makes the approval about *this* list rather than
    about migrations in general: edit a single action afterwards and the digest
    no longer matches, so :class:`ApprovedMigration` refuses to be built.

    :attr:`approver` is what makes the "human" in human-in-the-loop a type
    rather than a habit. SWR-3512 says these decisions reach the user; an
    ``ActorKind.SYSTEM`` actor is refused here, so the one path in the board that
    removes somebody else's code cannot be walked by the analysis that proposed
    the removal.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The person. A :class:`~rotaris_core.requirements.delivery.state.DeliveryActor`
    #: rather than a string, and refused unless its kind is ``user``: this is the
    #: only gate between an agent's judgement and code being deleted in somebody
    #: else's repository, and a free-form name is not a gate — ``approver="impact
    #: analyst"`` reads exactly like a person.
    approver: DeliveryActor
    at: dt.datetime
    plan_digest: str
    note: str = ""

    @field_validator("approver")
    @classmethod
    def _human(cls, value: DeliveryActor) -> DeliveryActor:
        return require_human(value, what="approving a migration worklist")

    @field_validator("plan_digest")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(
                "an approval names the person who gave it and the plan they saw (SWR-3507)",
            )
        return cleaned

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("an approval carries an aware timestamp, never a naive one")
        return value


@traces(SWR.SWR_3507)
class ApprovedMigration(BaseModel):
    """A plan a human has seen and signed. The only input an executor takes.

    Both invariants are checked here rather than at the call site, so there is no
    way to reach :meth:`MigrationExecutor.execute` with a list nobody approved:

    - **nothing undecided.** A ``decision-required`` site is an open question,
      and executing around it would silently choose an answer;
    - **the plan did not move.** The approval carries the digest of what was
      shown; a plan edited afterwards is a different list and needs a new
      approval.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    plan: MigrationPlan
    approval: MigrationApproval

    @model_validator(mode="after")
    def _signed_for_this_plan(self) -> Self:
        undecided = self.plan.undecided
        if undecided:
            raise MigrationApprovalError(
                f"{len(undecided)} site(s) still need a decision"
                f" ({', '.join(entry.key for entry in undecided)});"
                " an undecided worklist is never executed (SWR-3507)",
            )
        if self.approval.plan_digest != self.plan.digest:
            raise MigrationApprovalError(
                "the migration plan changed after it was approved"
                f" (approved {self.approval.plan_digest}, plan is {self.plan.digest});"
                " it has to be reviewed again (SWR-3507)",
            )
        return self

    @property
    def entries(self) -> tuple[MigrationEntry, ...]:
        """Every approved row."""
        return self.plan.entries

    @property
    def operations(self) -> tuple[TraceOperation, ...]:
        """The annotation edits this migration performs, in **application** order.

        Not worklist order. The worklist is sorted ascending by ``(path, line)``
        because that is the order a human reads it in; applying it in that order
        is the order that corrupts files. Every ``site.line`` was planned against
        the *pre-migration* file, so the first ``remove`` in a file shifts every
        later line of that file up by one and the next operation would edit the
        wrong line — silently, in somebody else's repository, on the one code
        path in the board whose job is deletion.

        So operations are emitted **bottom-up within each file**: paths ascend,
        lines descend. An edit at line 120 cannot move line 40, which makes the
        planned line numbers still true when each operation is applied. That is
        the contract :class:`TraceEditor` is written against, and it is enforced
        here rather than left to each rewriter to rediscover.
        """
        return tuple(
            TraceOperation(site=entry.site, action=entry.action, target=entry.target)
            for entry in sorted(
                (entry for entry in self.entries if entry.action.edits_annotation),
                key=lambda entry: (
                    entry.site.path,
                    -entry.site.line,
                    str(entry.site.kind),
                    entry.site.req_id,
                ),
            )
        )

    @property
    def message(self) -> str:
        """One line: what was approved, by whom, and when."""
        return (
            f"{self.plan.request.message} — approved by {self.approval.approver.label}"
            f" on {self.approval.at.isoformat()}"
        )


@traces(SWR.SWR_3507)
def approve_migration(
    plan: MigrationPlan,
    *,
    approver: DeliveryActor,
    at: dt.datetime,
    note: str = "",
) -> ApprovedMigration:
    """A named human approves *plan* exactly as it stands.

    Raises :class:`MigrationApprovalError` while any site is undecided — the
    approval step is where "not classifiable" stops being a label and becomes a
    hard stop — and :class:`~rotaris_core.requirements.change.decisions.DecisionError`
    when *approver* is not a named person, which is the same stop for "an agent
    approved its own proposal".
    """
    return ApprovedMigration(
        plan=plan,
        approval=MigrationApproval(
            approver=approver,
            at=at,
            plan_digest=plan.digest,
            note=note,
        ),
    )


@traces(SWR.SWR_3507)
class TraceOperation(BaseModel):
    """One annotation edit an approved migration asks for.

    Only ``remove`` and ``re-point`` become operations: they are mechanical and
    a tool can apply them. ``adapt`` and ``migrate`` end in changed *behaviour*
    and are handed to execution units instead of being applied by a rewriter.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    site: MigrationSite
    action: MigrationAction
    target: str = ""

    @model_validator(mode="after")
    def _mechanical(self) -> Self:
        if not self.action.edits_annotation:
            raise ValueError(
                f"{self.action} is not an annotation edit; it belongs to an"
                " execution unit, not to a rewriter (SWR-3507)",
            )
        if self.action is MigrationAction.RE_POINT and not self.target.strip():
            raise ValueError("a re-point operation names the requirement to point at")
        return self

    @property
    def message(self) -> str:
        """One line describing the edit."""
        if self.action is MigrationAction.RE_POINT:
            return f"re-point {self.site.message} at {self.target}"
        return f"remove {self.site.message}"


@traces(SWR.SWR_3507)
class TraceEdit(BaseModel):
    """What a rewriter reports back about one operation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    site: MigrationSite
    action: MigrationAction
    applied: bool = False
    detail: str = ""

    @property
    def message(self) -> str:
        """One line for the execution report."""
        verdict = "applied" if self.applied else "not applied"
        detail = f": {self.detail}" if self.detail else ""
        return f"{self.action.label} {self.site.location} {verdict}{detail}"


@runtime_checkable
class TraceEditor(Protocol):
    """Whatever actually rewrites an annotation in a file.

    A protocol, and injected: the executor never constructs one, so a caller that
    supplies none gets a stated refusal rather than a migration that half-ran.

    **Ordering contract.** An implementation is handed the operations of one
    migration through :attr:`ApprovedMigration.operations`, which guarantees they
    arrive grouped by file and **descending by line** within each file. A
    rewriter may therefore delete a line outright: no operation still to come
    refers to a line below the one just edited. It must not reorder them, batch
    them per file and re-sort ascending, or apply them concurrently — each of
    those puts back exactly the off-by-one this ordering exists to remove.
    """

    def apply(self, operation: TraceOperation) -> TraceEdit:
        """Perform one annotation edit and report what happened.

        Called once per operation, in the order the executor iterates them; see
        the ordering contract on the protocol.
        """
        ...


@traces(SWR.SWR_3507)
class MigrationExecution(BaseModel):
    """What executing an approved migration actually did.

    Three groups, because they are three different facts: the annotation edits
    that were applied, the entries handed to execution units for an agent to
    write, and the sites deliberately left alone.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    approved: ApprovedMigration
    at: dt.datetime
    edits: tuple[TraceEdit, ...] = ()
    #: ``adapt`` and ``migrate`` rows — the scope of the execution units that
    #: carry the migration (SWR-3405).
    handed_to_units: tuple[MigrationEntry, ...] = ()
    #: ``keep`` rows: nothing happens to them, and that is a decision too.
    untouched: tuple[MigrationEntry, ...] = ()
    #: Why the execution did not happen at all. Empty when it ran.
    failure: str = ""

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("an execution carries an aware timestamp, never a naive one")
        return value

    @property
    def completed(self) -> bool:
        """Whether every approved annotation edit was applied."""
        return not self.failure and all(edit.applied for edit in self.edits)

    @property
    def unapplied(self) -> tuple[TraceEdit, ...]:
        """Edits the rewriter reported it did not perform."""
        return tuple(edit for edit in self.edits if not edit.applied)

    @property
    def retired_ids(self) -> tuple[str, ...]:
        """Requirements no site of this migration points at any more.

        A superseded id whose every site was removed or re-pointed: after the
        execution nothing claims it, so a ``@traces`` still naming it is the
        residue SWR-3507's fourth acceptance criterion forbids.
        """
        remaining: set[str] = {
            entry.site.req_id
            for entry in self.approved.entries
            if not entry.action.edits_annotation
        }
        return tuple(
            req_id
            for req_id in self.approved.plan.request.superseded_ids
            if req_id not in remaining
        )

    @property
    def message(self) -> str:
        """One line for the run report."""
        if self.failure:
            return f"{self.approved.plan.request.message} — not executed: {self.failure}"
        return (
            f"{self.approved.plan.request.message} — {len(self.edits)} edit(s),"
            f" {len(self.handed_to_units)} unit(s), {len(self.untouched)} kept"
        )

    def residual_traces(self, after: MigrationInventory) -> tuple[MigrationSite, ...]:
        """Traces that still point at a requirement this migration retired.

        The check behind "executing the worklist leaves no ``@traces`` pointing
        at a removed requirement": re-run the coverage query afterwards, hand the
        result in here, and an empty answer is the guarantee.
        """
        return dangling_traces(after, self.retired_ids)


@traces(SWR.SWR_3507)
def dangling_traces(
    inventory: MigrationInventory,
    removed_ids: Collection[str],
) -> tuple[MigrationSite, ...]:
    """Every site of *inventory* claiming one of *removed_ids*. Pure.

    Both kinds, not only implementation traces: a test that verifies an id
    nothing declares any more is the same defect wearing a different decorator.
    """
    wanted = {req_id.strip() for req_id in removed_ids if req_id.strip()}
    return tuple(site for site in inventory.sites if site.req_id in wanted)


@traces(SWR.SWR_3507)
class MigrationExecutor:
    """Applies an approved migration — and takes nothing else.

    The signature is the safety property. :meth:`execute` accepts an
    :class:`ApprovedMigration`, which cannot exist for an undecided worklist and
    cannot exist for a plan that moved after it was signed. There is no path from
    :func:`plan_migration` to here that does not pass through
    :func:`approve_migration`.

    The rewriter is injected and has no default. An executor without one refuses
    with a stated failure rather than reporting a successful migration in which
    nothing happened.
    """

    def __init__(
        self,
        *,
        editor: TraceEditor | None = None,
        clock: Callable[[], dt.datetime] = _utc_now,
    ) -> None:
        self._editor = editor
        self._clock = clock

    @property
    def available(self) -> bool:
        """Whether a rewriter is configured at all."""
        return self._editor is not None

    @traces(SWR.SWR_3507)
    def execute(
        self,
        approved: ApprovedMigration,
        *,
        at: dt.datetime | None = None,
    ) -> MigrationExecution:
        """Apply *approved*'s annotation edits and sort the rest of the rows.

        A rewriter that raises stops the execution at that operation: the edits
        already applied are reported, the rest are not attempted, and the failure
        is stated. Continuing past a rewriter that just failed would be applying
        edits to a file whose state nobody knows.

        The iteration order is :attr:`ApprovedMigration.operations` — bottom-up
        within each file — so a rewriter that removes a line does not invalidate
        the line numbers the operations still to come were planned against.
        """
        moment = at if at is not None else self._clock()
        handed = tuple(
            entry
            for entry in approved.entries
            if entry.action in {MigrationAction.ADAPT, MigrationAction.MIGRATE}
        )
        untouched = tuple(
            entry for entry in approved.entries if entry.action is MigrationAction.KEEP
        )
        if self._editor is None:
            return MigrationExecution(
                approved=approved,
                at=moment,
                handed_to_units=handed,
                untouched=untouched,
                failure=(
                    "no trace editor is configured, so the approved worklist was"
                    " not applied to any file"
                ),
            )
        edits: list[TraceEdit] = []
        failure = ""
        for operation in approved.operations:
            try:
                edits.append(self._editor.apply(operation))
            except Exception as error:  # noqa: BLE001 - a failing rewriter is a stated result
                failure = (
                    f"{operation.message} failed ({type(error).__name__}: {error});"
                    " the remaining edits were not attempted"
                )
                break
        return MigrationExecution(
            approved=approved,
            at=moment,
            edits=tuple(edits),
            handed_to_units=handed,
            untouched=untouched,
            failure=failure,
        )


# --------------------------------------------------------------------------
# SWR-3508 — the superseded requirement is deprecated, never deleted
# --------------------------------------------------------------------------


@traces(SWR.SWR_3508)
class ManualStep(BaseModel):
    """A lifecycle change Rotaris could not make, stated for a human to make.

    A read-only source (SWR-3105) is not an error and not a silent skip: the
    migration is done, the requirement should now read ``deprecated``, and the
    only honest outcome is to say where to change it by hand.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    source_id: str = ""
    location: str | None = None
    detail: str = ""

    @property
    def message(self) -> str:
        """One line a user can act on."""
        where = f" at {self.location}" if self.location else ""
        detail = f" ({self.detail})" if self.detail else ""
        return (
            f"{self.req_id}: set the lifecycle to 'deprecated' by hand in"
            f" {self.source_id or 'its source'}{where}{detail}"
        )


@runtime_checkable
class LifecycleWriter(Protocol):
    """The one way a requirement's lifecycle reaches its source (SWR-3111).

    Structural, so :class:`~rotaris_core.requirements.writeback.RequirementWriteBack`
    satisfies it without this module importing it, and so the completion can be
    exercised without a store on disk.
    """

    def update(self, req_id: str, edit: RequirementEdit) -> WriteBackOutcome:
        """Write *edit* back to whichever source owns *req_id*."""
        ...


@traces(SWR.SWR_3508)
class DeprecationOutcome(BaseModel):
    """What happened to one superseded requirement's lifecycle."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    written: bool = False
    #: The source already said ``deprecated``; nothing was written a second time.
    already_deprecated: bool = False
    manual_step: ManualStep | None = None
    #: A stated conflict or refusal from the write path, verbatim.
    detail: str = ""

    @property
    def settled(self) -> bool:
        """Whether the source now reads ``deprecated``, however it got there."""
        return self.written or self.already_deprecated

    @property
    def message(self) -> str:
        """One line for the completion report."""
        if self.manual_step is not None:
            return self.manual_step.message
        if self.already_deprecated:
            return f"{self.req_id} was already deprecated; nothing was written"
        if self.written:
            return f"{self.req_id} is now deprecated; its id and history are unchanged"
        return f"{self.req_id} was not deprecated: {self.detail or 'the write did not happen'}"


@traces(SWR.SWR_3508)
class CompletionResult(BaseModel):
    """The end of a superseding: what was deprecated and what a human still must do."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    superseding_id: str = ""
    outcomes: tuple[DeprecationOutcome, ...] = ()
    #: Why nothing was written at all — an execution that did not complete.
    refusal: str = ""

    @property
    def completed(self) -> bool:
        """Whether every superseded requirement now reads ``deprecated``."""
        return (
            not self.refusal
            and bool(self.outcomes)
            and all(outcome.settled for outcome in self.outcomes)
        )

    @property
    def deprecated_ids(self) -> tuple[str, ...]:
        """Ids this completion wrote ``deprecated`` onto."""
        return tuple(outcome.req_id for outcome in self.outcomes if outcome.written)

    @property
    def manual_steps(self) -> tuple[ManualStep, ...]:
        """Lifecycle changes a human has to make in a read-only source."""
        return tuple(
            outcome.manual_step for outcome in self.outcomes if outcome.manual_step is not None
        )

    @property
    def message(self) -> str:
        """One line for the run report."""
        if self.refusal:
            return f"{self.superseding_id}: nothing was deprecated — {self.refusal}"
        return f"{self.superseding_id}: " + "; ".join(outcome.message for outcome in self.outcomes)


@traces(SWR.SWR_3508)
class SupersedingCompletion:
    """Deprecates the superseded requirements — after the migration, and once.

    The order is the requirement (SWR-3508's second acceptance criterion): the
    lifecycle moves *after* the execution completed, never before. Deprecating
    first and migrating afterwards would leave a requirement marked as replaced
    while its code still claimed it, which is precisely the state the whole
    mechanism exists to avoid.

    Deleting is not an option this class has. It holds a
    :class:`LifecycleWriter`, whose only operation is ``update``; there is no
    ``delete`` to reach, so "superseding never removes a requirement" is a
    property of the type rather than of the control flow.
    """

    def __init__(self, writer: LifecycleWriter) -> None:
        self._writer = writer

    @traces(SWR.SWR_3508)
    def complete(
        self,
        execution: MigrationExecution,
        *,
        requirements: Mapping[str, CanonicalRequirement] | None = None,
    ) -> CompletionResult:
        """Write ``deprecated`` onto every requirement the migration replaced.

        *requirements* is the current read of the store, used for two things: to
        skip an id the source already marks deprecated (so the write happens
        once), and to supply the ``expected_hash`` that makes a source moving
        underneath the migration a reported conflict instead of a lost edit.
        """
        request = execution.approved.plan.request
        if not execution.completed:
            return CompletionResult(
                superseding_id=request.superseding_id,
                refusal=(
                    f"the migration did not complete ({execution.message});"
                    " the superseded requirements keep their lifecycle"
                ),
            )
        known = dict(requirements or {})
        outcomes = tuple(
            self._deprecate(req_id, known.get(req_id)) for req_id in request.superseded_ids
        )
        return CompletionResult(superseding_id=request.superseding_id, outcomes=outcomes)

    def _deprecate(
        self,
        req_id: str,
        current: CanonicalRequirement | None,
    ) -> DeprecationOutcome:
        if current is not None and current.is_deprecated:
            return DeprecationOutcome(req_id=req_id, already_deprecated=True)
        edit = RequirementEdit(
            lifecycle=RequirementLifecycle.DEPRECATED,
            expected_hash=current.current_hash if current is not None else None,
        )
        outcome = self._writer.update(req_id, edit)
        if outcome.refusal is not None:
            return DeprecationOutcome(
                req_id=req_id,
                manual_step=ManualStep(
                    req_id=req_id,
                    source_id=outcome.refusal.source_id,
                    location=outcome.refusal.location,
                    detail=outcome.refusal.detail,
                ),
                detail=outcome.refusal.message,
            )
        if not outcome.ok:
            return DeprecationOutcome(req_id=req_id, detail=outcome.reason)
        return DeprecationOutcome(req_id=req_id, written=outcome.written)


@traces(SWR.SWR_3508)
class SupersededStanding(BaseModel):
    """Where a superseded requirement stands: out of the flow, still on the board.

    Three separate facts, and the third is why this exists at all. A superseded
    requirement is **not schedulable** and does **not count towards epic
    progress** — counting it would make an epic permanently incomplete — but it
    stays **visible** and says what replaced it. Hiding it would break every
    ``@traces`` that still points at it and lose the history of why the code
    exists (SWR-3508).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    superseded_by: tuple[str, ...] = ()
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT

    @property
    def superseded(self) -> bool:
        """Whether some requirement declares it replaces this one (SWR-3110)."""
        return bool(self.superseded_by)

    @property
    def schedulable(self) -> bool:
        """Whether work may still be started for this requirement."""
        return not self.superseded and self.lifecycle is not RequirementLifecycle.DEPRECATED

    @property
    def counts_towards_progress(self) -> bool:
        """Whether an epic's progress bar counts this requirement."""
        return self.schedulable

    @property
    def visible(self) -> bool:
        """Always true: a superseded requirement is stated, never hidden."""
        return True

    @property
    def statement(self) -> str:
        """``SWR-501 is superseded by SWR-601`` — what the card says instead."""
        if not self.superseded:
            return f"{self.req_id} is not superseded"
        return f"{self.req_id} is superseded by {', '.join(self.superseded_by)}"


@traces(SWR.SWR_3508)
def superseded_standing(
    requirement: CanonicalRequirement,
    graph: RelationGraph,
) -> SupersededStanding:
    """Where *requirement* stands, read from the computed reverse edges.

    The ``superseded-by`` direction is computed (SWR-3110), never authored, so
    this answers from the same graph a board renders and cannot disagree with it.
    """
    return SupersededStanding(
        req_id=requirement.req_id,
        superseded_by=tuple(
            sorted(
                graph.sources(requirement.req_id, ReverseRelationKind.SUPERSEDED_BY),
                key=requirement_sort_key,
            ),
        ),
        lifecycle=requirement.lifecycle,
    )
