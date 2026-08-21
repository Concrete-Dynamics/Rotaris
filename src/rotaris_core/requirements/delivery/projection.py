"""The board projection — one read API, one shape, every consumer (SWR-3216).

Everything the requirements surface shows is assembled here and nowhere else. A
user interface that parsed CLI output, re-implemented the health rules or reached
into the delivery store's file layout would be a second engine, and two engines
disagree the first time one of them is changed. So the desktop board (SWR-3300),
the workflow surface (SWR-3600) and any future TUI consume
:class:`BoardProjection` and nothing beneath it.

**This shape is a contract, not a convenience.** The board slice renders it and
the execution slice fills it, and the two are built at the same time. Every field
the execution slice will eventually populate — units, runs, worktrees, branches,
commits, the queue, the review payload — is therefore declared *now* and defaults
to empty, so a board written against this module compiles, renders and degrades
cleanly long before a single agent has run. Adding a field here later costs both
slices a rewrite; carrying an empty one costs nothing.

**Two halves, and the seam between them matters.**

```text
BoardInputs ──project_board()──▶ BoardProjection     pure, no I/O, deterministic
     ▲
     └── BoardProjector.inputs()                     the reads, in one place
```

:func:`project_board` is pure over data: no filesystem, no git, no subprocess, no
clock. :class:`BoardProjector` is the only part that reads anything, it reads
through named seams (:class:`EvidenceReader`, :class:`ExecutionReader`,
:class:`DetailReader`) and it
**never writes** — the delivery store is opened for reading, the requirement
source is read through the registry's published index, and nothing in this module
can reach either one's write path. That is what makes SWR-3216's "side-effect
free" checkable rather than promised.

**Serialisable, and free of requirement text nobody may persist.** Every value
here is a Pydantic model that survives ``model_dump(mode="json")`` and
``model_validate`` unchanged, so a projection can cross a thread, a process or a
signal boundary. It carries the requirement's text because a board has to *show*
it — and it is a read projection, rebuilt from the source on every pass, which is
exactly why SWR-3114 permits it and why nothing here is ever written to disk.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
import logging
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.dependencies import (  # noqa: TC001 - Pydantic field types.
    DependencyReport,
    DependencyVerdict,
    RequirementReadiness,
    evaluate_dependencies,
)
from rotaris_core.requirements.delivery.audit import AuditTrail  # noqa: TC001 - a field type.
from rotaris_core.requirements.delivery.completion import (  # noqa: TC001 - Pydantic field types.
    CompletionReport,
)
from rotaris_core.requirements.delivery.epics import (
    ChildProgress,
    EpicProgress,
    aggregate_epics,
    is_epic,
)
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceProjection,
    EvidenceState,
    project_evidence,
)
from rotaris_core.requirements.delivery.freshness import NoFreshness
from rotaris_core.requirements.delivery.health import (
    HEALTH_PRECEDENCE,
    DerivedHealth,
    HealthInputs,
    RequirementHealth,
    derive_health,
)
from rotaris_core.requirements.delivery.history import (
    ArtifactRevision,
    ArtifactRevisions,
    RevisionHistory,  # noqa: TC001 - a Pydantic field type.
    build_revision_history,
    recorded_hashes,
)
from rotaris_core.requirements.delivery.obligations import (
    DEFAULT_OBLIGATION_POLICY,
    EvidenceKind,
    ObligationPolicy,
    RequirementObligations,
    resolve_obligations,
)
from rotaris_core.requirements.delivery.satisfied import (
    SatisfactionState,
    SatisfiedDelivery,  # noqa: TC001 - a Pydantic field type.
)
from rotaris_core.requirements.delivery.staleness import (
    DEFAULT_FRESHNESS_POLICY,
    FreshnessInputs,
    FreshnessPolicy,
    evaluate_freshness,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryState,
    DeliveryStatus,
    DeliveryView,
)
from rotaris_core.requirements.delivery.store import DeliveryIndex, DeliveryRecord
from rotaris_core.requirements.delivery.transitions import (  # noqa: TC001 - a field type.
    UnmetCondition,
)
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    RelationKind,
    RequirementLifecycle,
    RequirementType,
    SourceCapabilities,
    SourceCapability,
    requirement_sort_key,
)
from rotaris_core.requirements.registry import Availability, RequirementIndex
from rotaris_core.requirements.relations import (
    RelationGraph,
    RelationIssueKind,
    ReverseRelationKind,
)
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping, Sequence
    from pathlib import Path

    from rotaris_core.requirements.delivery.audit import AuditStore
    from rotaris_core.requirements.delivery.freshness import FreshnessSource
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.delivery.verification import RequirementVerification
    from rotaris_core.requirements.model import RequirementHierarchy

__all__ = [
    "PRIORITY_ORDER",
    "PRIORITY_RECORD_KEY",
    "UNSET_COLUMN_LABELS",
    "BlockerKind",
    "BoardAxis",
    "BlockerOption",
    "BlockerView",
    "BoardEntry",
    "BoardInputs",
    "BoardProjection",
    "BoardProjector",
    "CheckOutcome",
    "CoverageEvidence",
    "DetailReader",
    "EvidenceReader",
    "ExecutionReader",
    "ExecutionSummary",
    "ExecutionUnitView",
    "IntegrationView",
    "NoDetails",
    "NoEvidence",
    "NoExecution",
    "QueueEntryView",
    "QueueView",
    "RelationsView",
    "RequirementPriority",
    "ReviewView",
    "RunOutcome",
    "RunSnapshotView",
    "RunView",
    "StoredDetails",
    "WorkspaceEvidence",
    "UnitState",
    "UnresolvedRelation",
    "axis_column_keys",
    "parse_priority",
    "project_board",
    "read_priority",
    "requirement_number",
]


# --------------------------------------------------------------------------
# Priority (SWR-3309)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3216)
class RequirementPriority(StrEnum):
    """What the board sorts by before it sorts by id (SWR-3309).

    The values are the configuration's own vocabulary
    (``requirements.board.filters.priorities``), so a filter written in YAML and
    a filter written in Python cannot drift apart on spelling. ``none`` is a
    member rather than ``None``: "nobody prioritised this" is a bucket a user can
    filter to, and making it representable is what lets it sort *after* ``low``
    rather than randomly.
    """

    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"
    NONE = "none"

    @property
    def label(self) -> str:
        """``Critical``, ``None`` — what a card prints."""
        return self.value.capitalize()

    @property
    def rank(self) -> int:
        """Sort position: ``0`` for ``critical``, ``4`` for ``none``."""
        return PRIORITY_ORDER.index(self)


#: Descending urgency, with the unprioritised bucket last — the order SWR-3309
#: asks for, as data rather than as a comparison function.
PRIORITY_ORDER: tuple[RequirementPriority, ...] = (
    RequirementPriority.CRITICAL,
    RequirementPriority.HIGH,
    RequirementPriority.NORMAL,
    RequirementPriority.LOW,
    RequirementPriority.NONE,
)


@traces(SWR.SWR_3318)
class BoardAxis(StrEnum):
    """What the board's columns are grouped by (SWR-3318).

    Delivery state is the default and stays SWR-3302's answer to "what is where".
    The others exist because delivery state is the one axis that is *empty* on the
    day a project adopts Rotaris: everything it has not delivered is ``Backlog``,
    correctly, and one column holding every card answers nothing. Health,
    lifecycle, epic, priority and source are all already computed for every
    entry — this only lets a user look down one of them.

    Grouping is display only. It writes nothing, changes no state and reorders no
    queue, exactly like the filters and the sort order of SWR-3309.
    """

    DELIVERY = "delivery"
    HEALTH = "health"
    LIFECYCLE = "lifecycle"
    EPIC = "epic"
    PRIORITY = "priority"
    SOURCE = "source"

    @property
    def label(self) -> str:
        """``Delivery state`` / ``Health`` — what the grouping control offers."""
        return "Delivery state" if self is BoardAxis.DELIVERY else self.value.capitalize()

    @property
    def draggable(self) -> bool:
        """Whether a drop between columns is a workflow action (SWR-3601).

        Only on the delivery axis. Dragging a card into ``Healthy`` is not a
        thing a user can decide — health is derived (SWR-3211) — and offering the
        gesture would promise a write that cannot happen.
        """
        return self is BoardAxis.DELIVERY


#: The axes whose values the project invents — one column per epic or source it
#: actually has, rather than per epic it might have.
_OPEN_AXES: frozenset[BoardAxis] = frozenset({BoardAxis.EPIC, BoardAxis.SOURCE})


@traces(SWR.SWR_3318)
def axis_column_keys(axis: BoardAxis) -> tuple[str, ...]:
    """Every column an axis has before a single entry is looked at.

    Empty for the open-ended axes, and the full enumeration for the rest — which
    is what makes "an empty column shows what belongs there" (SWR-3302) possible
    on every axis rather than only on the one whose values are known in advance.
    """
    if axis is BoardAxis.DELIVERY:
        return tuple(str(state) for state in DeliveryState)
    if axis is BoardAxis.HEALTH:
        # Worst first, ``Healthy`` last — SWR-3211's own precedence order, which
        # also makes the axis read left-to-right as progress, the way the
        # delivery axis reads from ``Backlog`` to ``Done``.
        return tuple(str(health) for health in HEALTH_PRECEDENCE)
    if axis is BoardAxis.LIFECYCLE:
        return tuple(str(lifecycle) for lifecycle in RequirementLifecycle)
    if axis is BoardAxis.PRIORITY:
        return tuple(str(priority) for priority in PRIORITY_ORDER)
    return ()


#: What a column key of ``""`` is called, per axis. A requirement with no epic,
#: no source or no priority still belongs somewhere a user can see and count; a
#: card that simply vanished from the board would be the worst outcome of
#: switching an axis (SWR-3318).
UNSET_COLUMN_LABELS: Mapping[BoardAxis, str] = MappingProxyType(
    {
        BoardAxis.EPIC: "No epic",
        BoardAxis.SOURCE: "No source",
        BoardAxis.PRIORITY: "No priority",
        BoardAxis.LIFECYCLE: "No lifecycle",
        BoardAxis.HEALTH: "No health",
        BoardAxis.DELIVERY: "No delivery state",
    },
)

#: Where a delivery record keeps a requirement's board priority. Priority is
#: Rotaris' own operational data — it is not part of the specification and must
#: never be written back into the project's requirement file (SWR-3114) — so it
#: lives in the record's ``extras``, which the store round-trips untouched.
PRIORITY_RECORD_KEY = "priority"

_PRIORITY_ALIASES: dict[str, RequirementPriority] = {
    "urgent": RequirementPriority.CRITICAL,
    "blocker": RequirementPriority.CRITICAL,
    "p0": RequirementPriority.CRITICAL,
    "p1": RequirementPriority.HIGH,
    "p2": RequirementPriority.NORMAL,
    "p3": RequirementPriority.LOW,
    "medium": RequirementPriority.NORMAL,
    "unset": RequirementPriority.NONE,
    "": RequirementPriority.NONE,
}


@traces(SWR.SWR_3216)
def parse_priority(raw: object) -> RequirementPriority | None:
    """The priority *raw* names, or ``None`` when it names none.

    Tolerant about spelling and strict about membership, exactly like
    :func:`~rotaris_core.requirements.delivery.state.parse_delivery_state`: an
    unrecognised value degrades one card to unprioritised, never the board.
    """
    if isinstance(raw, RequirementPriority):
        return raw
    if not isinstance(raw, str):
        return None
    token = raw.strip().casefold().replace("_", "-").replace(" ", "-")
    try:
        return RequirementPriority(token)
    except ValueError:
        return _PRIORITY_ALIASES.get(token)


@traces(SWR.SWR_3216)
def read_priority(record: DeliveryRecord) -> RequirementPriority:
    """The board priority stored for a requirement, or ``none``."""
    parsed = parse_priority(record.extras.get(PRIORITY_RECORD_KEY))
    return parsed if parsed is not None else RequirementPriority.NONE


_DIGITS = "0123456789"


@traces(SWR.SWR_3216)
def requirement_number(req_id: str) -> int | None:
    """The trailing number of a ``SWR-3216``-shaped id, or ``None``.

    The one place the projection knows that ReqToCode keys its coverage index by
    number while every other layer keys by id. A source whose ids are not
    numbered simply has no coverage to look up, which is a smaller failure than
    guessing.
    """
    tail = req_id.strip().rsplit("-", 1)[-1]
    if tail and all(character in _DIGITS for character in tail):
        return int(tail)
    return None


# --------------------------------------------------------------------------
# Execution (SWR-3401, SWR-3402, SWR-3405, SWR-3409, SWR-3412, SWR-3414, SWR-3415)
#
# Every model below is filled by the execution slice and empty until it lands.
# They are declared here because the board renders them and the two slices are
# built in parallel: the shape has to exist before either one can rely on it.
# --------------------------------------------------------------------------


@traces(SWR.SWR_3216)
class RunOutcome(StrEnum):
    """Where one unit run stands (SWR-3414, SWR-3415, SWR-3611).

    ``interrupted`` is the state SWR-3611 exists for: a run whose process is gone
    after a restart is neither running nor failed, and reporting it as either
    would make the board lie about work that is still on disk.
    """

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INTERRUPTED = "interrupted"
    ABANDONED = "abandoned"

    @property
    def label(self) -> str:
        """What a card prints."""
        return self.value.capitalize()

    @property
    def in_flight(self) -> bool:
        """Whether work is still expected from this run."""
        return self in {RunOutcome.PENDING, RunOutcome.RUNNING}

    @property
    def terminal(self) -> bool:
        """Whether this run will produce nothing more."""
        return not self.in_flight


@traces(SWR.SWR_3216)
class UnitState(StrEnum):
    """Where one execution unit stands (SWR-3401, SWR-3412, SWR-3415)."""

    PENDING = "pending"
    #: Accepted by the scheduler and waiting for capacity (SWR-3412).
    QUEUED = "queued"
    #: Held back by a dependency, a conflict or a limit; the reason travels on
    #: :class:`QueueEntryView`, never as a colour (SWR-3412).
    HELD = "held"
    RUNNING = "running"
    FINISHED = "finished"
    FAILED = "failed"
    #: Given up on deliberately. Its runs stay in the history (SWR-3401).
    ABANDONED = "abandoned"

    @property
    def label(self) -> str:
        """What a card prints."""
        return self.value.capitalize()

    @property
    def counts(self) -> bool:
        """Whether this unit still has to finish for the requirement to be done."""
        return self is not UnitState.ABANDONED

    @property
    def outstanding(self) -> bool:
        """Whether this unit still owes work."""
        return self.counts and self is not UnitState.FINISHED


@traces(SWR.SWR_3216)
class RunSnapshotView(BaseModel):
    """The version of the specification one run works against (SWR-3402).

    Shown rather than merely recorded: the review surface has to state *which*
    text was implemented, and SWR-3403's whole point is that this can differ from
    what the requirement says now.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str = ""
    #: The requirement's ``current_hash`` at run start (SWR-3107, SWR-3402).
    requirement_hash: str = ""
    source_revision: str | None = None
    base_commit: str | None = None
    unit_id: str | None = None
    session_id: str | None = None
    captured_at: dt.datetime | None = None


@traces(SWR.SWR_3216)
class CheckOutcome(BaseModel):
    """One check Rotaris itself ran, and what it measured (SWR-3603).

    Deliberately separate from the agent's own summary: the review surface has to
    show what was *claimed* beside what was *measured*, and merging the two into
    one "result" is exactly how an autonomous system stops being reviewable.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    status: str = ""
    detail: str = ""

    @property
    def passed(self) -> bool:
        """Whether this check reported success."""
        return self.status == "passed"


@traces(SWR.SWR_3216)
class RunView(BaseModel):
    """One recorded unit run, as the board and the review surface read it.

    Everything SWR-3414 asks a run record to name: the unit, the snapshot, the
    session, the worktree, the branch, the base commit, the commits it produced,
    the files it changed, the verification outcome and its terminal state — plus
    the agent's own claims (SWR-3603) and the retry counter (SWR-3415), which are
    read from the same record and would otherwise need a second query.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    unit_id: str | None = None
    #: Which delivery of the requirement this run belongs to (SWR-3417). A unit
    #: id repeats across deliveries on purpose, so a list of runs grouped by unit
    #: alone would fold two deliveries into one.
    cycle: int = 0
    session_id: str | None = None
    outcome: RunOutcome = RunOutcome.PENDING
    snapshot: RunSnapshotView | None = None
    #: Where the work lives — kept after a failure so it can be inspected
    #: (SWR-3405, SWR-3415).
    worktree_path: str | None = None
    branch: str | None = None
    base_commit: str | None = None
    produced_commits: tuple[str, ...] = ()
    changed_files: tuple[str, ...] = ()
    #: What Rotaris measured. ``None`` while nothing has verified this run yet,
    #: which is a different fact from a failed verification.
    verified: bool | None = None
    verification_detail: str = ""
    checks: tuple[CheckOutcome, ...] = ()
    started_at: dt.datetime | None = None
    finished_at: dt.datetime | None = None
    #: Why it failed, stated (SWR-3415). Empty for a run that did not fail.
    failure_reason: str = ""
    #: Which attempt this was, counted from 1 (SWR-3415).
    attempt: int = 1
    #: What the agent said it did, and what it flagged (SWR-3408, SWR-3603).
    agent_summary: str = ""
    agent_risks: tuple[str, ...] = ()
    agent_claimed_complete: bool = False

    @property
    def address(self) -> str:
        """``session:<id>/run:<id>`` — how the session view opens it."""
        where = f"session:{self.session_id}/" if self.session_id else ""
        return f"{where}run:{self.run_id}"

    @property
    def interrupted(self) -> bool:
        """Whether a restart found this run's process gone (SWR-3611)."""
        return self.outcome is RunOutcome.INTERRUPTED

    @property
    def summary(self) -> str:
        """One line for a card: the run, its outcome and its reason."""
        because = f" — {self.failure_reason}" if self.failure_reason else ""
        return f"{self.run_id}: {self.outcome.label}{because}"


@traces(SWR.SWR_3216)
class ExecutionUnitView(BaseModel):
    """One execution unit of a requirement (SWR-3401).

    A work artefact, never a requirement: it carries an id, a title, a scope, its
    dependencies on sibling units, its state and its runs, and creating or
    discarding one changes nothing about the requirement's identity or hash.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    unit_id: str
    #: Which delivery of the requirement this unit belongs to, counted from zero
    #: (SWR-3417). Carried here rather than left for a surface to look up: a
    #: requirement delivered twice has two units with the same id, and a card
    #: that could not say which one it is showing would be describing the wrong
    #: work while looking correct.
    cycle: int = 0
    title: str = ""
    scope: str = ""
    #: Sibling units this one waits for (SWR-3406).
    depends_on: tuple[str, ...] = ()
    state: UnitState = UnitState.PENDING
    runs: tuple[RunView, ...] = ()
    #: Retries used and the bound they are counted against (SWR-3415).
    retries: int = 0
    retry_limit: int | None = None
    failure_reason: str = ""
    #: The persona or agent that carries this unit.
    agent: str = ""

    @property
    def last_run(self) -> RunView | None:
        """The newest run of this unit, or ``None`` when it never ran."""
        return self.runs[-1] if self.runs else None

    @property
    def active_run(self) -> RunView | None:
        """The run currently in flight, when one is."""
        return next((run for run in reversed(self.runs) if run.outcome.in_flight), None)

    @property
    def worktree_path(self) -> str | None:
        """The worktree the newest run used (SWR-3405)."""
        run = self.last_run
        return run.worktree_path if run is not None else None

    @property
    def branch(self) -> str | None:
        """The branch the newest run used (SWR-3405)."""
        run = self.last_run
        return run.branch if run is not None else None

    @property
    def retries_exhausted(self) -> bool:
        """Whether the retry bound has been reached (SWR-3415)."""
        return self.retry_limit is not None and self.retries >= self.retry_limit

    @property
    def redelivered(self) -> bool:
        """Whether this unit belongs to a *later* delivery of the requirement."""
        return self.cycle > 0

    @property
    def summary(self) -> str:
        """One line: the unit, its state, what it waits for, and which delivery.

        The delivery cycle is named only once there is more than one (SWR-3417).
        A requirement delivered once reads exactly as it always did; a
        re-delivered one says so, because "this unit is pending" means something
        different the second time round and a card that hid that would be telling
        the user the first delivery never happened.
        """
        waiting = f" (after {', '.join(self.depends_on)})" if self.depends_on else ""
        again = f" [delivery cycle {self.cycle + 1}]" if self.redelivered else ""
        return f"{self.unit_id}: {self.state.label}{waiting}{again}"


@traces(SWR.SWR_3216)
class IntegrationView(BaseModel):
    """Several units' branches merged into one result (SWR-3409)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    integration_id: str
    unit_ids: tuple[str, ...] = ()
    merged_commit: str | None = None
    branch: str | None = None
    worktree_path: str | None = None
    succeeded: bool = False
    #: The units whose work collided, when it did. Named rather than counted:
    #: "two units conflicted" is not something a user can act on (SWR-3409).
    conflicting_units: tuple[str, ...] = ()
    conflicting_files: tuple[str, ...] = ()
    finished_at: dt.datetime | None = None

    @property
    def summary(self) -> str:
        """One line: what was integrated, and what collided."""
        if self.succeeded:
            return f"{self.integration_id}: {len(self.unit_ids)} unit(s) integrated"
        collided = ", ".join(self.conflicting_units) or "unknown units"
        return f"{self.integration_id}: integration failed ({collided})"


@traces(SWR.SWR_3216)
class QueueEntryView(BaseModel):
    """One candidate in the delivery queue, and why it is where it is (SWR-3412).

    ``hold_reason`` is mandatory for a held candidate and enforced below: a queue
    that shows *what* is held without *why* is the thing SWR-3608 calls a risk.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str | None = None
    #: Position in the order the scheduler will actually use, counted from 1.
    position: int = 0
    priority: RequirementPriority = RequirementPriority.NONE
    held: bool = False
    hold_reason: str = ""
    #: The requirements or units this candidate waits for (SWR-3510, SWR-3406).
    waiting_for: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _a_hold_states_its_reason(self) -> Self:
        if self.held and not self.hold_reason.strip():
            raise ValueError(
                f"{self.req_id}: a held candidate names the reason it is held (SWR-3412)",
            )
        return self

    @property
    def message(self) -> str:
        """One line for the queue view."""
        what = f"{self.req_id}/{self.unit_id}" if self.unit_id else self.req_id
        if self.held:
            return f"{what}: held — {self.hold_reason}"
        return f"{what}: #{self.position}"


@traces(SWR.SWR_3216)
class QueueView(BaseModel):
    """The delivery queue as the board shows and controls it (SWR-3412, SWR-3608)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    entries: tuple[QueueEntryView, ...] = ()
    #: Runs currently in flight, in start order.
    running: tuple[RunView, ...] = ()
    #: Whether the scheduler picks work up by itself.
    automatic: bool = False
    #: How many units may run at once (SWR-3117's scheduling block).
    concurrency_limit: int = 0
    #: Whether the queue was stopped by the user. Work already in flight keeps
    #: running, which is why this is a separate fact from an empty queue.
    stopped: bool = False
    updated_at: dt.datetime | None = None

    @property
    def held(self) -> tuple[QueueEntryView, ...]:
        """Every candidate that is not being started, with its stated reason."""
        return tuple(entry for entry in self.entries if entry.held)

    @property
    def ready(self) -> tuple[QueueEntryView, ...]:
        """The candidates the scheduler will start, in queue order."""
        return tuple(
            sorted(
                (entry for entry in self.entries if not entry.held),
                key=lambda entry: (entry.position, requirement_sort_key(entry.req_id)),
            ),
        )

    @property
    def next_up(self) -> QueueEntryView | None:
        """What runs next, or ``None`` when nothing will."""
        ready = self.ready
        return ready[0] if ready else None

    def entry_for(self, req_id: str) -> QueueEntryView | None:
        """This requirement's place in the queue, when it has one."""
        return next((entry for entry in self.entries if entry.req_id == req_id), None)

    @property
    def empty(self) -> bool:
        """Whether the queue holds nothing at all."""
        return not self.entries and not self.running


@traces(SWR.SWR_3216)
class ExecutionSummary(BaseModel):
    """Everything the execution slice knows about one requirement.

    The empty value is the honest one until SWR-3400 lands: no units, no runs, no
    queue entry. Every consumer therefore has to render "nothing has run yet",
    which is a state the board owes the user anyway — a requirement in ``Backlog``
    looks exactly like this forever.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str = ""
    units: tuple[ExecutionUnitView, ...] = ()
    #: Every run of this requirement, oldest first — including the runs of units
    #: that were later discarded, which SWR-3401 requires to survive.
    runs: tuple[RunView, ...] = ()
    integrations: tuple[IntegrationView, ...] = ()
    #: This requirement's place in the delivery queue, when it has one.
    queue_entry: QueueEntryView | None = None
    #: The snapshot the run in flight is working against (SWR-3402).
    active_snapshot: RunSnapshotView | None = None

    @property
    def unit_count(self) -> int:
        """How many units this requirement has — the number a card prints."""
        return len(self.units)

    @property
    def counted_units(self) -> tuple[ExecutionUnitView, ...]:
        """The units that were not abandoned."""
        return tuple(unit for unit in self.units if unit.state.counts)

    @property
    def outstanding_units(self) -> tuple[str, ...]:
        """Ids of units that still owe work, in declaration order."""
        return tuple(unit.unit_id for unit in self.units if unit.state.outstanding)

    @property
    def active_run(self) -> RunView | None:
        """The run currently in flight, when one is."""
        return next((run for run in reversed(self.runs) if run.outcome.in_flight), None)

    @property
    def last_run(self) -> RunView | None:
        """The newest run, whatever became of it — what a card ages (SWR-3304)."""
        return self.runs[-1] if self.runs else None

    @property
    def last_run_at(self) -> dt.datetime | None:
        """When the newest run last moved, or ``None`` when nothing ever ran."""
        run = self.last_run
        if run is None:
            return None
        return run.finished_at or run.started_at

    @property
    def interrupted_runs(self) -> tuple[RunView, ...]:
        """Runs a restart found without a process (SWR-3611)."""
        return tuple(run for run in self.runs if run.interrupted)

    @property
    def commits(self) -> tuple[str, ...]:
        """Every commit this requirement's runs produced, in run order (SWR-3414)."""
        return tuple(commit for run in self.runs for commit in run.produced_commits)

    @property
    def changed_files(self) -> tuple[str, ...]:
        """Every file this requirement's runs touched, de-duplicated, in order."""
        seen: list[str] = []
        for run in self.runs:
            for path in run.changed_files:
                if path not in seen:
                    seen.append(path)
        return tuple(seen)

    @property
    def branches(self) -> tuple[str, ...]:
        """Every branch this requirement's work lives on (SWR-3405)."""
        seen: list[str] = []
        for run in self.runs:
            if run.branch and run.branch not in seen:
                seen.append(run.branch)
        return tuple(seen)

    @property
    def empty(self) -> bool:
        """Whether the execution slice has nothing to say about this requirement."""
        return not (self.units or self.runs or self.integrations or self.queue_entry)

    @property
    def agent(self) -> str:
        """The agent carrying the work right now, or empty (SWR-3304)."""
        active = self.active_run
        if active is not None:
            for unit in self.units:
                if unit.unit_id == active.unit_id and unit.agent:
                    return unit.agent
        return next((unit.agent for unit in self.units if unit.agent), "")

    @property
    def summary(self) -> str:
        """One line: units, runs and what is in flight."""
        active = self.active_run
        where = f", run {active.run_id} in flight" if active is not None else ""
        return f"{self.unit_count} unit(s), {len(self.runs)} run(s){where}"


#: What a requirement with no execution data looks like. Named so a consumer can
#: compare against it rather than reconstructing an empty summary.
NO_EXECUTION = ExecutionSummary()


@traces(SWR.SWR_3216)
class ReviewView(BaseModel):
    """What a requirement in ``Review`` presents (SWR-3603, SWR-3403).

    Two hashes, and the difference between them is the point: a run that finished
    against a specification somebody edited mid-flight must never reach ``Done``,
    and the review is where that is stated rather than inferred.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str = ""
    run_id: str | None = None
    #: The version the run worked against (SWR-3402).
    snapshot_hash: str = ""
    #: The version the specification holds now (SWR-3107).
    current_hash: str = ""
    #: Why the result is in review — ``specification changed during execution``
    #: is the case SWR-3403 names.
    reason: str = ""
    #: What the agent claimed …
    agent_summary: str = ""
    agent_risks: tuple[str, ...] = ()
    agent_claimed_complete: bool = False
    #: … and what Rotaris measured. Kept apart on purpose (SWR-3603).
    checks: tuple[CheckOutcome, ...] = ()
    verified: bool | None = None
    changed_files: tuple[str, ...] = ()
    #: Traceability the work produced, as ``path:line`` addresses.
    added_traces: tuple[str, ...] = ()
    added_tests: tuple[str, ...] = ()
    branch: str | None = None
    worktree_path: str | None = None
    #: The completion conditions that still do not hold (SWR-3215).
    unmet: tuple[UnmetCondition, ...] = ()

    @property
    def specification_changed(self) -> bool:
        """Whether the requirement moved while the run was in flight (SWR-3403)."""
        return bool(self.snapshot_hash and self.current_hash) and (
            self.snapshot_hash != self.current_hash
        )

    @property
    def summary(self) -> str:
        """One line for the review list."""
        if self.specification_changed:
            return (
                f"{self.req_id}: specification changed during execution"
                f" ({self.snapshot_hash} → {self.current_hash})"
            )
        return f"{self.req_id}: {self.reason or 'awaiting review'}"


# --------------------------------------------------------------------------
# Blockers (SWR-3510, SWR-3511, SWR-3512, SWR-3607)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3216)
class BlockerKind(StrEnum):
    """Why a requirement is not moving (SWR-3607).

    Every kind needs its own presentation and its own answer path, so the kind is
    a closed set rather than a free-text label a surface would have to guess at.
    """

    #: A requirement this one depends on is not delivered (SWR-3510).
    DEPENDENCY = "dependency"
    #: Two requirements contradict each other (SWR-3511).
    CONFLICT = "conflict"
    #: A decision with product meaning was escalated (SWR-3512).
    DECISION = "decision"
    #: A run failed and its retries are exhausted (SWR-3415).
    RUN_FAILURE = "run-failure"
    #: A person blocked it and said why (SWR-3201).
    STATED = "stated"


@traces(SWR.SWR_3216)
class BlockerOption(BaseModel):
    """One answer a user may give, with what it will do (SWR-3512, SWR-3607)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    key: str
    label: str = ""
    #: What choosing this will cause. An option without a consequence is a button
    #: nobody can take responsibility for.
    consequence: str = ""


@traces(SWR.SWR_3216)
class BlockerView(BaseModel):
    """One blocker, its question and its answer path (SWR-3607)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    kind: BlockerKind
    reason: str
    #: The decision this blocker is waiting on, when the engine raised one.
    decision_id: str | None = None
    question: str = ""
    options: tuple[BlockerOption, ...] = ()
    #: Requirements that block this one (SWR-3510) or contradict it (SWR-3511).
    blocking_ids: tuple[str, ...] = ()
    raised_at: dt.datetime | None = None

    @property
    def answerable(self) -> bool:
        """Whether the user can resolve this from the board."""
        return bool(self.options)

    @property
    def message(self) -> str:
        """One line naming the requirement, the kind and the reason."""
        return f"{self.req_id}: {self.kind} — {self.reason}"


# --------------------------------------------------------------------------
# Relations (SWR-3109, SWR-3110, SWR-3307, SWR-3310)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3216)
class UnresolvedRelation(BaseModel):
    """An authored relation whose target the store does not contain.

    Shown rather than dropped (SWR-3307): a dangling ``depends-on`` is a fact
    about the project, and hiding it makes the board quietly wrong.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: RelationKind
    target: str

    @property
    def message(self) -> str:
        """``depends-on SWR-9999 (unresolved)``."""
        return f"{self.kind} {self.target} (unresolved)"


@traces(SWR.SWR_3216)
class RelationsView(BaseModel):
    """One requirement's neighbourhood, both directions, resolved once.

    Authored edges and computed reverse edges side by side, so the detail view
    (SWR-3307) and the graph (SWR-3310) read the same value instead of walking
    the relation graph twice with two different notions of "related".
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    parent: str | None = None
    children: tuple[str, ...] = ()
    ancestors: tuple[str, ...] = ()
    derived_from: tuple[str, ...] = ()
    derives: tuple[str, ...] = ()
    supersedes: tuple[str, ...] = ()
    superseded_by: tuple[str, ...] = ()
    depends_on: tuple[str, ...] = ()
    blocks: tuple[str, ...] = ()
    refines: tuple[str, ...] = ()
    refined_by: tuple[str, ...] = ()
    conflicts_with: tuple[str, ...] = ()
    related_to: tuple[str, ...] = ()
    unresolved: tuple[UnresolvedRelation, ...] = ()

    @property
    def epic(self) -> str | None:
        """The parent epic a card prints (SWR-3304)."""
        return self.parent

    @property
    def neighbours(self) -> tuple[str, ...]:
        """Every related id, de-duplicated, in a stable order (SWR-3310)."""
        seen: list[str] = []
        for group in (
            (self.parent,) if self.parent else (),
            self.children,
            self.derived_from,
            self.derives,
            self.supersedes,
            self.superseded_by,
            self.depends_on,
            self.blocks,
            self.refines,
            self.refined_by,
            self.conflicts_with,
            self.related_to,
        ):
            for req_id in group:
                if req_id not in seen:
                    seen.append(req_id)
        return tuple(seen)

    @property
    def edges(self) -> tuple[tuple[str, str], ...]:
        """``(kind, target)`` for every edge, for the graph view (SWR-3310)."""
        groups: tuple[tuple[str, tuple[str, ...]], ...] = (
            ("parent", (self.parent,) if self.parent else ()),
            ("children", self.children),
            ("derived-from", self.derived_from),
            ("derived-requirements", self.derives),
            ("supersedes", self.supersedes),
            ("superseded-by", self.superseded_by),
            ("depends-on", self.depends_on),
            ("blocks", self.blocks),
            ("refines", self.refines),
            ("refined-by", self.refined_by),
            ("conflicts-with", self.conflicts_with),
            ("related-to", self.related_to),
        )
        return tuple((kind, target) for kind, targets in groups for target in targets)


def _relations_for(
    req_id: str,
    hierarchy: RequirementHierarchy,
    graph: RelationGraph,
) -> RelationsView:
    """Read one requirement's neighbourhood out of the two resolved structures."""
    unresolved = tuple(
        UnresolvedRelation(
            kind=issue.relation_kind
            if issue.relation_kind is not None
            else RelationKind.RELATED_TO,
            target=issue.target,
        )
        for issue in graph.dangling
        if issue.req_id == req_id and issue.target
    )
    return RelationsView(
        parent=hierarchy.parent_of(req_id),
        children=hierarchy.children_of(req_id),
        ancestors=hierarchy.ancestors(req_id),
        derived_from=graph.targets(req_id, RelationKind.DERIVED_FROM),
        derives=graph.sources(req_id, ReverseRelationKind.DERIVED_REQUIREMENTS),
        supersedes=graph.targets(req_id, RelationKind.SUPERSEDES),
        superseded_by=graph.sources(req_id, ReverseRelationKind.SUPERSEDED_BY),
        depends_on=graph.targets(req_id, RelationKind.DEPENDS_ON),
        blocks=graph.sources(req_id, ReverseRelationKind.BLOCKS),
        refines=graph.targets(req_id, RelationKind.REFINES),
        refined_by=graph.sources(req_id, ReverseRelationKind.REFINED_BY),
        conflicts_with=graph.targets(req_id, RelationKind.CONFLICTS_WITH),
        related_to=graph.targets(req_id, RelationKind.RELATED_TO),
        unresolved=unresolved,
    )


# --------------------------------------------------------------------------
# The entry and the projection
# --------------------------------------------------------------------------


@traces(SWR.SWR_3216)
class BoardEntry(BaseModel):
    """One requirement, complete, as every surface reads it.

    Canonical fields, both axes (SWR-3202), health (SWR-3211), evidence per
    obligation with its records (SWR-3207, SWR-3208), relations, execution and
    blockers — the whole answer for one card, one detail view and one graph node,
    assembled once so no consumer has to join two sources and risk joining them
    differently.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    # -- the specification (SWR-3101) ---------------------------------------
    req_id: str
    title: str = ""
    description: str = ""
    req_type: RequirementType = RequirementType.PRODUCT
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    source_id: str = ""
    source_path: str | None = None
    source_revision: str | None = None
    current_hash: str = ""
    #: What the originating source allows, so the board only offers honest
    #: actions (SWR-3105, SWR-3605, SWR-3606).
    capabilities: SourceCapabilities = SourceCapabilities()
    availability: Availability = Availability.AVAILABLE
    unavailable_reason: str = ""

    # -- Rotaris' own axis (SWR-3201, SWR-3204) ------------------------------
    #: For a requirement, the status the store holds. For an **epic**, the status
    #: its children imply (SWR-3212) — an epic's record is never written, so the
    #: stored one would read ``Backlog`` for ever.
    delivery: DeliveryStatus = DeliveryStatus()
    satisfied_hash: str | None = None
    satisfaction: SatisfactionState = SatisfactionState.NEVER_DELIVERED
    #: Every version ever delivered, oldest first — what the revision panel and
    #: the audit read (SWR-3204, SWR-3313).
    deliveries: tuple[SatisfiedDelivery, ...] = ()
    priority: RequirementPriority = RequirementPriority.NONE
    updated_at: dt.datetime | None = None

    # -- derived, never stored (SWR-3206, SWR-3207, SWR-3211, SWR-3212) ------
    obligations: RequirementObligations
    evidence: EvidenceProjection
    health: DerivedHealth
    is_epic: bool = False
    epic: EpicProgress | None = None
    relations: RelationsView = RelationsView()

    # -- the execution half, empty until SWR-3400 fills it -------------------
    execution: ExecutionSummary = NO_EXECUTION
    blockers: tuple[BlockerView, ...] = ()
    review: ReviewView | None = None

    #: What SWR-3510's dependency gate says about this requirement: whether its
    #: ``depends-on`` targets have been delivered *and are current*, and which
    #: ones have not. Deliberately **not** folded into :attr:`blockers`: a
    #: blocker is something raised against a requirement that is already moving,
    #: and an undelivered dependency is a fact about a requirement sitting
    #: quietly in ``Backlog``. The board reads this when a release is attempted
    #: (SWR-3622), not on every card.
    dependency: DependencyVerdict = DependencyVerdict(req_id="")

    # -- deep views, gathered only when asked --------------------------------
    completion: CompletionReport | None = None
    history: RevisionHistory | None = None
    audit: AuditTrail | None = None
    #: The work this requirement's change asks for, waiting to be accepted
    #: (SWR-3616). Filled by the detail pass only, like the three above.
    offer: OfferView | None = None
    #: Degradations that concern this requirement: an unreadable record, an
    #: unknown delivery state, a source that could not be read.
    notices: tuple[str, ...] = ()

    @model_validator(mode="after")
    def _describes_one_requirement(self) -> Self:
        for what, other in (
            ("obligations", self.obligations.req_id),
            ("evidence", self.evidence.req_id),
        ):
            if other != self.req_id:
                raise ValueError(f"{self.req_id}: {what} belong to {other}")
        if self.dependency.req_id and self.dependency.req_id != self.req_id:
            raise ValueError(
                f"{self.req_id}: dependency verdict belongs to {self.dependency.req_id}",
            )
        if self.epic is not None and self.epic.req_id != self.req_id:
            raise ValueError(f"{self.req_id}: epic progress belongs to {self.epic.req_id}")
        if self.is_epic and self.epic is None:
            raise ValueError(f"{self.req_id}: an epic entry carries its aggregation (SWR-3212)")
        if self.epic is not None and self.epic.state is not self.delivery.state:
            raise ValueError(
                f"{self.req_id}: an epic's column ({self.delivery.state.label}) is the state its"
                f" children imply ({self.epic.state.label}), never a stored one (SWR-3212)",
            )
        return self

    # -- the two axes, side by side -----------------------------------------

    @property
    def state(self) -> DeliveryState:
        """The delivery state — the column this card belongs in (SWR-3302)."""
        return self.delivery.state

    @property
    def view(self) -> DeliveryView:
        """Both axes joined for display, never persisted (SWR-3202)."""
        return DeliveryView(req_id=self.req_id, lifecycle=self.lifecycle, delivery=self.delivery)

    @property
    def badges(self) -> tuple[str, str]:
        """``(lifecycle, delivery)`` as a card shows them (SWR-3304)."""
        return self.view.badges

    @property
    def schedulable(self) -> bool:
        """Whether a run may be started for this requirement (SWR-3412)."""
        return self.view.schedulable and not self.is_epic

    @property
    def specification_changed(self) -> bool:
        """Whether the delivered version is no longer the current one.

        The words SWR-3304 asks a card to print rather than encode in a colour:
        this requirement was delivered, and its text has moved since.
        """
        return self.satisfaction is SatisfactionState.STALE

    @property
    def evidence_state(self) -> EvidenceState:
        """The ring's overall colour (SWR-3305)."""
        return self.evidence.state

    @property
    def implementations(self) -> tuple[RequirementSite, ...]:
        """Where this requirement is implemented (SWR-3208, SWR-3310)."""
        return self.evidence.inputs.implementations

    @property
    def covering_tests(self) -> tuple[CoveringTest, ...]:
        """The tests declared to cover it (SWR-3208, SWR-3310)."""
        return self.evidence.inputs.covering_tests

    @property
    def blocking_evidence(self) -> tuple[EvidenceKind, ...]:
        """The required obligations that are missing or failing (SWR-3305)."""
        return tuple(obligation.kind for obligation in self.evidence.blocking)

    @property
    def editable(self) -> bool:
        """Whether the source accepts an edit of this requirement (SWR-3605)."""
        return self.capabilities.can(SourceCapability.UPDATE)

    @property
    def last_changed_at(self) -> dt.datetime | None:
        """When this requirement's delivery last moved (SWR-3304)."""
        return self.delivery.changed_at

    @property
    def sort_key(self) -> tuple[int, tuple[tuple[int, int, str], ...]]:
        """Priority first, id second — the board's default order (SWR-3309)."""
        return (self.priority.rank, requirement_sort_key(self.req_id))

    @traces(SWR.SWR_3318)
    def axis_value(self, axis: BoardAxis) -> str:
        """Which column of *axis* this entry belongs in (SWR-3318).

        One definition of "where does this card go", used by every consumer, so a
        board, a TUI and a report cannot group the same projection differently
        (SWR-3311). Every answer is a value this entry already carries — nothing
        here computes a new fact.

        An empty string means the entry has no value on that axis, which is a
        column of its own (:data:`UNSET_COLUMN_LABELS`) rather than a reason to
        drop the card.
        """
        if axis is BoardAxis.DELIVERY:
            return str(self.state)
        if axis is BoardAxis.HEALTH:
            return str(self.health.health)
        if axis is BoardAxis.LIFECYCLE:
            return str(self.lifecycle)
        if axis is BoardAxis.PRIORITY:
            return str(self.priority)
        if axis is BoardAxis.SOURCE:
            return self.source_id
        return self.relations.epic or ""

    def matches_text(self, needle: str) -> bool:
        """Whether the free-text filter over id and title matches (SWR-3309)."""
        wanted = needle.strip().casefold()
        if not wanted:
            return True
        return wanted in self.req_id.casefold() or wanted in self.title.casefold()

    @property
    def summary(self) -> str:
        """One line: the id, the two badges, the health and what is blocking."""
        lifecycle, delivery = self.badges
        blocking = ", ".join(self.blocking_evidence)
        because = f" ({blocking})" if blocking else ""
        return (
            f"{self.req_id} {self.title}"
            f" [{lifecycle} / {delivery}] {self.health.health.label}{because}"
        )


@traces(SWR.SWR_3216)
class BoardProjection(BaseModel):
    """Every requirement and every epic at one moment — the whole board.

    Immutable and complete: a consumer either sees the previous projection or the
    whole new one, exactly as :class:`~rotaris_core.requirements.registry.
    RequirementIndex` publishes its refresh. Nothing here is persisted; it is
    rebuilt from the source and the delivery store on every evaluation pass
    (SWR-3210).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    entries: tuple[BoardEntry, ...] = ()
    #: Every epic's aggregation, keyed by id (SWR-3212). Also reachable through
    #: the epic's own entry; kept here so an epic overview needs no scan.
    epics: dict[str, EpicProgress] = Field(default_factory=dict)
    queue: QueueView = QueueView()
    #: The registry generation this was built from, so two projections can be
    #: told apart without comparing them (SWR-3116).
    generation: int = 0
    evaluated_at: dt.datetime | None = None
    #: Every degradation behind this projection: unreadable records, sources that
    #: failed, colliding ids, dangling relations. A board that hides these looks
    #: complete while being wrong.
    notices: tuple[str, ...] = ()
    #: Ids the source no longer declares but Rotaris has data for (SWR-3113).
    removed: tuple[str, ...] = ()
    #: SWR-3510's gate over the whole set, evaluated once per pass. Kept whole
    #: as well as per entry because the chain above one requirement is a fact
    #: about the *graph* — resolving it needs every verdict, not one (SWR-3623).
    dependencies: DependencyReport = DependencyReport()

    @model_validator(mode="after")
    def _one_entry_per_requirement(self) -> Self:
        ids = [entry.req_id for entry in self.entries]
        if len(ids) != len(set(ids)):
            duplicates = sorted({req_id for req_id in ids if ids.count(req_id) > 1})
            raise ValueError(f"the board projects each requirement once; got {duplicates} twice")
        return self

    # -- lookup --------------------------------------------------------------

    def entry(self, req_id: str) -> BoardEntry | None:
        """One requirement's entry, or ``None`` when the board has none."""
        return next((entry for entry in self.entries if entry.req_id == req_id), None)

    @property
    def ids(self) -> tuple[str, ...]:
        """Every projected id, in the order the entries carry."""
        return tuple(entry.req_id for entry in self.entries)

    def __len__(self) -> int:
        """How many requirements this projection carries."""
        return len(self.entries)

    # -- the board (SWR-3302) ------------------------------------------------

    def in_state(self, state: DeliveryState) -> tuple[BoardEntry, ...]:
        """The entries of one delivery column, in board order."""
        return tuple(entry for entry in self.entries if entry.state is state)

    def columns(self) -> dict[DeliveryState, tuple[str, ...]]:
        """Every column with its ids — zero-length columns included.

        Complete by construction, so an empty column is a column with nothing in
        it rather than a column a consumer has to know should exist (SWR-3302).
        """
        return {state: tuple(e.req_id for e in self.in_state(state)) for state in DeliveryState}

    def counts(self) -> dict[DeliveryState, int]:
        """The number a column header prints, for every column."""
        return {state: len(ids) for state, ids in self.columns().items()}

    @traces(SWR.SWR_3318)
    def axis_columns(self, axis: BoardAxis) -> dict[str, tuple[str, ...]]:
        """Every column of *axis* with its ids, in the axis' own order (SWR-3318).

        Complete in the same sense :meth:`columns` is: for an axis with a closed
        set of values — delivery, health, lifecycle, priority — every value gets a
        column even when it is empty, so a consumer never has to know which
        columns *should* exist. For the open-ended axes — epic and source — only
        the values actually present appear, in id order, because the alternative
        is a column per epic the project does not have.

        Every entry lands in exactly one column, including the ones with no value
        on this axis: those share the ``""`` column, which is what
        :data:`UNSET_COLUMN_LABELS` names.
        """
        grouped: dict[str, list[str]] = {key: [] for key in axis_column_keys(axis)}
        for entry in self.entries:
            grouped.setdefault(entry.axis_value(axis), []).append(entry.req_id)
        if axis in _OPEN_AXES:
            named = sorted((key for key in grouped if key), key=requirement_sort_key)
            ordered = [*named, *([""] if "" in grouped else [])]
            return {key: tuple(grouped[key]) for key in ordered}
        return {key: tuple(ids) for key, ids in grouped.items()}

    @traces(SWR.SWR_3318)
    def axis_counts(self, axis: BoardAxis) -> dict[str, int]:
        """What each column header of *axis* prints."""
        return {key: len(ids) for key, ids in self.axis_columns(axis).items()}

    def sorted_entries(self) -> tuple[BoardEntry, ...]:
        """Every entry by priority then id — the board's default order (SWR-3309)."""
        return tuple(sorted(self.entries, key=lambda entry: entry.sort_key))

    # -- slices a surface asks for ------------------------------------------

    def with_health(self, health: RequirementHealth) -> tuple[BoardEntry, ...]:
        """The entries a health filter selects (SWR-3309)."""
        return tuple(entry for entry in self.entries if entry.health.health is health)

    def of_epic(self, epic_id: str) -> tuple[BoardEntry, ...]:
        """The entries below one epic, in board order (SWR-3308)."""
        return tuple(entry for entry in self.entries if epic_id in entry.relations.ancestors)

    def of_source(self, source_id: str) -> tuple[BoardEntry, ...]:
        """The entries one configured source contributed (SWR-3115, SWR-3309)."""
        return tuple(entry for entry in self.entries if entry.source_id == source_id)

    @property
    def epic_entries(self) -> tuple[BoardEntry, ...]:
        """The entries that are epics (SWR-3308)."""
        return tuple(entry for entry in self.entries if entry.is_epic)

    @property
    def leaf_entries(self) -> tuple[BoardEntry, ...]:
        """The entries that are requirements someone implements."""
        return tuple(entry for entry in self.entries if not entry.is_epic)

    @property
    def blocked(self) -> tuple[BoardEntry, ...]:
        """Every entry carrying a blocker, in board order (SWR-3607)."""
        return tuple(entry for entry in self.entries if entry.blockers)

    @property
    def in_review(self) -> tuple[BoardEntry, ...]:
        """Every entry waiting for a review decision (SWR-3603)."""
        return self.in_state(DeliveryState.REVIEW)

    @property
    def summary(self) -> str:
        """One line: how many requirements, how many epics, what is degraded."""
        degraded = f", {len(self.notices)} notice(s)" if self.notices else ""
        return (
            f"{len(self.entries)} requirement(s), {len(self.epics)} epic(s),"
            f" {self.counts()[DeliveryState.DONE]} done{degraded}"
        )


# --------------------------------------------------------------------------
# The pure builder
# --------------------------------------------------------------------------


@traces(SWR.SWR_3216)
class BoardInputs(BaseModel):
    """Every fact the projection is built from — and the only way facts get in.

    Holding the inputs as one value is what makes :func:`project_board` pure and
    therefore testable without a repository: a test hands in an index, a delivery
    index and whatever evidence it wants to assert about, and gets a board back.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    index: RequirementIndex = RequirementIndex()
    delivery: DeliveryIndex = Field(default_factory=DeliveryIndex)
    #: Per requirement: the repository facts the evidence rules read (SWR-3207).
    evidence: dict[str, EvidenceInputs] = Field(default_factory=dict)
    #: Per requirement: what the execution slice knows (SWR-3400). Empty until it
    #: lands, which is the state the board must render cleanly anyway.
    execution: dict[str, ExecutionSummary] = Field(default_factory=dict)
    blockers: dict[str, tuple[BlockerView, ...]] = Field(default_factory=dict)
    reviews: dict[str, ReviewView] = Field(default_factory=dict)
    #: The deep views, gathered through :class:`DetailReader` for the
    #: requirements a caller asked for (SWR-3213, SWR-3214, SWR-3215).
    completions: dict[str, CompletionReport] = Field(default_factory=dict)
    histories: dict[str, RevisionHistory] = Field(default_factory=dict)
    audits: dict[str, AuditTrail] = Field(default_factory=dict)
    offers: dict[str, OfferView] = Field(default_factory=dict)
    #: Overrides the priority stored on the delivery record, for a caller that
    #: keeps priorities elsewhere.
    priorities: dict[str, RequirementPriority] = Field(default_factory=dict)
    queue: QueueView = QueueView()
    policy: ObligationPolicy = DEFAULT_OBLIGATION_POLICY
    evaluated_at: dt.datetime | None = None


def _obligations_by_id(
    hierarchy: RequirementHierarchy,
    policy: ObligationPolicy,
) -> dict[str, RequirementObligations]:
    """Resolve every requirement's obligations, deepest first.

    Order is the whole trick: an epic's obligations are its children's
    (SWR-3206), so a child has to be resolved before its parent. Sorting by depth
    descending gives that in one pass without recursion, and a store whose
    parents did not resolve still gets every requirement an answer.
    """
    resolved: dict[str, RequirementObligations] = {}
    by_depth = sorted(
        hierarchy.requirements,
        key=lambda req_id: (-hierarchy.depth(req_id), requirement_sort_key(req_id)),
    )
    for req_id in by_depth:
        requirement = hierarchy.requirements[req_id]
        children = tuple(
            resolved[child] for child in hierarchy.children_of(req_id) if child in resolved
        )
        resolved[req_id] = resolve_obligations(
            requirement,
            policy=policy,
            children=children,
            is_epic=is_epic(req_id, hierarchy),
        )
    return resolved


def _evidence_for(
    requirement: CanonicalRequirement,
    inputs: BoardInputs,
) -> EvidenceInputs:
    """The evidence facts for one requirement — an empty set when nobody read any.

    The empty value is not a lie: a workspace nobody has swept has no
    implementation sites and no covering tests, and the projection reports
    ``missing`` for both, which is what a board should show before the first
    evaluation pass.
    """
    given = inputs.evidence.get(requirement.req_id)
    if given is not None:
        return given
    return EvidenceInputs(
        req_id=requirement.req_id,
        requirement_hash=requirement.current_hash,
    )


@dataclass(frozen=True)
class _EntryParts:
    """One requirement's own answers, held between the two assembly passes.

    Health is deliberately *not* here. It reads the delivery state (SWR-3211),
    and an epic's delivery state is not known until its children have been
    aggregated — so both are computed in the second pass, from the same status,
    and an epic can never end up with a badge derived from one state and a column
    derived from another.
    """

    requirement: CanonicalRequirement
    record: DeliveryRecord
    relations: RelationsView
    evidence: EvidenceProjection
    satisfaction: SatisfactionState
    execution: ExecutionSummary
    epic: bool


def _notices_by_id(
    inputs: BoardInputs,
    hierarchy: RequirementHierarchy,
    graph: RelationGraph,
) -> dict[str, tuple[str, ...]]:
    """Every degradation, grouped by the requirement it concerns.

    Grouped once rather than filtered per requirement: a store of several hundred
    requirements would otherwise walk every notice list several hundred times,
    and a board refresh is on the path of every evaluation pass (SWR-3210).
    """
    lines: dict[str, list[str]] = {}
    for notice in inputs.delivery.notices:
        lines.setdefault(notice.req_id, []).append(notice.message)
    for issue in inputs.index.issues:
        if issue.req_id:
            lines.setdefault(issue.req_id, []).append(issue.message)
    for relation_issue in graph.issues:
        lines.setdefault(relation_issue.req_id, []).append(relation_issue.message)
    for hierarchy_issue in hierarchy.issues:
        lines.setdefault(hierarchy_issue.req_id, []).append(hierarchy_issue.message)
    return {req_id: tuple(found) for req_id, found in lines.items()}


def _board_notices(inputs: BoardInputs, graph: RelationGraph) -> tuple[str, ...]:
    """Every degradation behind the whole projection, in a stable order."""
    lines: list[str] = []
    lines.extend(failure.message for failure in inputs.index.failures)
    lines.extend(collision.message for collision in inputs.index.collisions)
    lines.extend(issue.message for issue in inputs.index.issues)
    lines.extend(notice.message for notice in inputs.delivery.notices)
    lines.extend(
        issue.message for issue in graph.issues if issue.kind is not RelationIssueKind.SELF_RELATION
    )
    return tuple(lines)


def _entry_for(
    part: _EntryParts,
    *,
    inputs: BoardInputs,
    obligations: RequirementObligations,
    aggregate: EpicProgress | None,
    notices: tuple[str, ...],
    dependency: DependencyVerdict,
) -> BoardEntry:
    """Assemble one entry, once every fact about it is known.

    The one decision that cannot be made in the first pass lives here: **an
    epic's delivery status is the one its children imply, not the one the store
    holds for it** (SWR-3212). Its record stays pristine by construction —
    :func:`~rotaris_core.requirements.delivery.epics.apply_epic_transition`
    refuses every direct move — so reading the stored status would put every epic
    in ``Backlog`` for ever, whatever its children are doing, and the column, the
    badge and the aggregate on the very same card would disagree.

    The health follows the same status, so an epic whose child is blocked reads
    ``Blocked`` in both places rather than in one of them.
    """
    requirement = part.requirement
    req_id = requirement.req_id
    delivery = aggregate.status if aggregate is not None else part.record.delivery
    view = DeliveryView(req_id=req_id, lifecycle=requirement.lifecycle, delivery=delivery)
    return BoardEntry(
        req_id=req_id,
        title=requirement.title,
        description=requirement.description,
        req_type=requirement.req_type,
        lifecycle=requirement.lifecycle,
        source_id=requirement.source_id,
        source_path=requirement.source_path,
        source_revision=requirement.source_revision,
        current_hash=requirement.current_hash,
        capabilities=requirement.capabilities,
        availability=inputs.index.availability(req_id),
        unavailable_reason=inputs.index.unavailable_reason(req_id),
        delivery=delivery,
        satisfied_hash=part.record.satisfied_hash,
        satisfaction=part.satisfaction,
        deliveries=part.record.satisfied.entries,
        priority=inputs.priorities.get(req_id, read_priority(part.record)),
        updated_at=part.record.updated_at,
        obligations=obligations,
        evidence=part.evidence,
        health=derive_health(
            HealthInputs.of(
                view,
                part.evidence,
                satisfaction=part.satisfaction,
                superseded_by=next(iter(part.relations.superseded_by), None),
            ),
        ),
        is_epic=part.epic,
        epic=aggregate,
        relations=part.relations,
        execution=part.execution,
        blockers=inputs.blockers.get(req_id, ()),
        dependency=dependency,
        review=inputs.reviews.get(req_id),
        completion=inputs.completions.get(req_id),
        history=inputs.histories.get(req_id),
        audit=inputs.audits.get(req_id),
        offer=inputs.offers.get(req_id),
        notices=notices,
    )


@traces(SWR.SWR_3216)
def project_board(inputs: BoardInputs) -> BoardProjection:
    """The whole board, derived from *inputs* — pure, deterministic, write-free.

    No filesystem, no git, no subprocess, no clock: every repository fact arrives
    as data and leaves as a value. Calling this twice over the same inputs
    produces two equal projections, which is what lets SWR-3210 compare passes
    and repaint two cards instead of ninety.
    """
    hierarchy = inputs.index.hierarchy()
    graph = inputs.index.relation_graph()
    obligations = _obligations_by_id(hierarchy, inputs.policy)
    notices = _notices_by_id(inputs, hierarchy, graph)

    # First pass: everything that is true of one requirement on its own. An
    # epic's aggregate is *not* — it needs every child's answer — so the entries
    # are assembled only after the aggregation, and an epic entry is therefore
    # never constructed without the progress SWR-3212 says it carries.
    parts: list[_EntryParts] = []
    progress: dict[str, ChildProgress] = {}
    for requirement in sorted(inputs.index.requirements, key=lambda one: one.sort_key):
        req_id = requirement.req_id
        record = inputs.delivery.get(req_id)
        relations = _relations_for(req_id, hierarchy, graph)
        evidence = project_evidence(obligations[req_id], _evidence_for(requirement, inputs))
        satisfaction = record.satisfied.state_for(requirement.current_hash)
        execution = inputs.execution.get(req_id, NO_EXECUTION)
        parts.append(
            _EntryParts(
                requirement=requirement,
                record=record,
                relations=relations,
                evidence=evidence,
                satisfaction=satisfaction,
                execution=execution,
                epic=is_epic(req_id, hierarchy),
            ),
        )
        progress[req_id] = ChildProgress(
            view=DeliveryView.of(requirement, record.delivery),
            traced=bool(evidence.inputs.implementations),
            verified=evidence.state_of(EvidenceKind.TEST) is EvidenceState.SATISFIED,
            active_run_id=execution.active_run.run_id if execution.active_run else None,
        )

    aggregates = aggregate_epics(hierarchy, progress)
    # Second pass, and the reason there is one: readiness is per requirement but
    # the *gate* is over the whole set (SWR-3510). An epic's state is the one its
    # children imply, so the aggregate has to exist before a dependency on an
    # epic can be judged — the same ordering `_entry_for` already relies on.
    gate = _dependency_gate(parts, aggregates)
    entries = tuple(
        _entry_for(
            part,
            inputs=inputs,
            obligations=obligations[part.requirement.req_id],
            aggregate=aggregates.get(part.requirement.req_id) if part.epic else None,
            notices=notices.get(part.requirement.req_id, ()),
            dependency=gate.verdict_for(part.requirement.req_id),
        )
        for part in parts
    )
    return BoardProjection(
        entries=entries,
        epics=aggregates,
        queue=inputs.queue,
        generation=inputs.index.generation,
        evaluated_at=inputs.evaluated_at,
        notices=_board_notices(inputs, graph),
        removed=tuple(entry.req_id for entry in inputs.index.tombstones if entry.active),
        dependencies=gate,
    )


@traces(SWR.SWR_3510, SWR.SWR_3622)
def _dependency_gate(
    parts: Sequence[_EntryParts],
    aggregates: Mapping[str, EpicProgress],
) -> DependencyReport:
    """SWR-3510's gate over this board, evaluated once. Pure.

    The gate was written, tested and constructed nowhere: until this, a
    requirement whose ``depends-on`` target was not delivered carried nothing at
    all on the board, and the wait first became visible as a scheduler hold on a
    unit — after the run had been dispatched (SWR-3622).

    Both halves of readiness come from where SWR-3202 keeps them: the current
    hash from the source, the delivered one from Rotaris' own record. The state
    is the entry's, aggregate included, so a dependency on an epic reads the
    status its children imply rather than the ``Backlog`` its record holds for
    ever (SWR-3212).
    """
    edges: dict[str, tuple[str, ...]] = {}
    readiness: dict[str, RequirementReadiness] = {}
    for part in parts:
        req_id = part.requirement.req_id
        aggregate = aggregates.get(req_id) if part.epic else None
        # The relations view rather than the requirement's own field, so the
        # gate reads the same edges the detail view and the graph draw.
        edges[req_id] = part.relations.depends_on
        readiness[req_id] = RequirementReadiness(
            req_id=req_id,
            state=aggregate.state if aggregate is not None else part.record.delivery.state,
            current_hash=part.requirement.current_hash,
            satisfied_hash=part.record.satisfied_hash,
        )
    return evaluate_dependencies(edges, readiness)


# --------------------------------------------------------------------------
# The reading half — the only part that touches anything
# --------------------------------------------------------------------------


@runtime_checkable
class EvidenceReader(Protocol):
    """Where the repository facts behind the evidence rules come from.

    A port rather than an import: the rules are pure (SWR-3207) and the *reading*
    of coverage sites, covering tests and freshness is somebody else's job — the
    ReqToCode sweep here, a cached index in the desktop bridge, a fixture in a
    test.
    """

    def evidence_for(self, requirement: CanonicalRequirement) -> EvidenceInputs:
        """The facts known about one requirement's evidence right now."""
        ...


@traces(SWR.SWR_3216)
class NoEvidence:
    """The reader of a workspace nobody has swept yet.

    Every requirement reports its own hash and no sites, which projects as
    ``missing`` — the honest answer before the first evaluation pass, and never a
    green ring for evidence nobody looked for.
    """

    def evidence_for(self, requirement: CanonicalRequirement) -> EvidenceInputs:
        """An empty fact set for *requirement*."""
        return EvidenceInputs(
            req_id=requirement.req_id,
            requirement_hash=requirement.current_hash,
        )


@runtime_checkable
class ExecutionReader(Protocol):
    """Where the execution half of the projection comes from (SWR-3400).

    Declared here and implemented by the execution slice, so the board slice can
    be built, rendered and tested against :class:`NoExecution` while SWR-3400 is
    still being written.
    """

    def execution_for(self, req_id: str) -> ExecutionSummary:
        """Units, runs and queue position for one requirement."""
        ...

    def blockers_for(self, req_id: str) -> tuple[BlockerView, ...]:
        """What stops this requirement, with its answer path (SWR-3607)."""
        ...

    def review_for(self, req_id: str) -> ReviewView | None:
        """What a requirement in ``Review`` presents (SWR-3603)."""
        ...

    def queue(self) -> QueueView:
        """The delivery queue as it stands (SWR-3412, SWR-3608)."""
        ...


@traces(SWR.SWR_3216)
class NoExecution:
    """The execution reader of a workspace that has never run anything.

    Not a placeholder to be replaced: this *is* the answer for every workspace
    before the first run, and every consumer therefore has to render the empty
    case correctly whether or not SWR-3400 has landed.
    """

    def execution_for(self, req_id: str) -> ExecutionSummary:
        """Nothing has run for this requirement."""
        return ExecutionSummary(req_id=req_id)

    def blockers_for(self, req_id: str) -> tuple[BlockerView, ...]:
        """Nothing is blocking — a stated blocker lives in the delivery record."""
        return ()

    def review_for(self, req_id: str) -> ReviewView | None:
        """No run has produced a reviewable result."""
        return None

    def queue(self) -> QueueView:
        """An empty, manual queue."""
        return QueueView()


@runtime_checkable
class DetailReader(Protocol):
    """Where the three deep views come from (SWR-3213, SWR-3214, SWR-3215).

    :attr:`BoardEntry.history`, :attr:`BoardEntry.audit` and
    :attr:`BoardEntry.completion` are what the revision panel (SWR-3313), the
    audit view and the review surface read. They are not derivable from the
    delivery record alone — the trail is an append-only log beside it and the
    revision history joins the source's own commits — so they arrive through a
    port, exactly as evidence and execution do. Without one, the fields would be
    declared and forever ``None``, and every consumer would have to reach past
    this module for them, which is the one thing SWR-3216 forbids.

    Both the requirement and its record are handed over because the two together
    are what the deep views are built from: the record carries every delivered
    version (SWR-3204) and the requirement carries the text's identity.
    """

    def completion_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> CompletionReport | None:
        """The last completion report for this requirement, when there is one."""
        ...

    def history_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> RevisionHistory | None:
        """Every version of this requirement, delivered or not (SWR-3214)."""
        ...

    def audit_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> AuditTrail | None:
        """Everything that happened to this requirement, in order (SWR-3213)."""
        ...

    def offer_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> OfferView | None:
        """The work this requirement's change asks for, if any (SWR-3616)."""
        ...


@traces(SWR.SWR_3216, SWR.SWR_3616)
class OfferView(BaseModel):
    """Work a change asks for, waiting for somebody to accept it.

    A *view*, so this module keeps its own vocabulary: the plan behind it lives
    in the change package and is rebuilt at the moment it is accepted. What a
    board needs is what to show and what accepting would do, which is all this
    carries.

    Deliberately not on the card. Deriving it costs an analysis-log read per
    requirement, and a board of fifteen hundred would pay it for the one card
    somebody opens — so it arrives through :class:`DetailReader`, beside the
    other three deep views.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The analyst's verdict, as its own token (``tests-affected``).
    outcome: str
    #: One line: what this costs and what accepting would do.
    summary: str
    #: Why, in the analyst's words.
    reasoning: str = ""
    #: The units accepting would create, by key. Empty for an outcome that
    #: creates none.
    units: tuple[str, ...] = ()
    #: Whether accepting runs a verification rather than an agent (SWR-3504).
    verifies_instead: bool = False
    #: Whether accepting hands the requirement to the decomposer (SWR-3404).
    decomposes: bool = False


@traces(SWR.SWR_3216)
class NoDetails:
    """The deep views of a workspace that has recorded nothing yet.

    The honest answer for a board that has never run anything, and the default:
    a detail panel renders "no history recorded" rather than an invented one.
    """

    def completion_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> CompletionReport | None:
        """No completion has been evaluated for this requirement."""
        return None

    def history_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> RevisionHistory | None:
        """No revision history has been assembled."""
        return None

    def audit_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> AuditTrail | None:
        """Nothing has been recorded about this requirement."""
        return None

    def offer_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> OfferView | None:
        """Nothing has analysed a change to this requirement."""
        return None


@traces(SWR.SWR_3216, SWR.SWR_3213, SWR.SWR_3214)
class StoredDetails:
    """The deep views, assembled from what Rotaris itself recorded.

    The data path SWR-3313's revision panel needs: the audit store (SWR-3213)
    holds what happened, the delivery record holds every version that was
    delivered (SWR-3204), and :func:`~rotaris_core.requirements.delivery.history.
    build_revision_history` joins them with the source's own revisions into the
    list the panel shows — which version, delivered by which run, at which
    commit, and which one is current.

    Reads and never writes, like everything on this side of the seam.
    *revisions* is optional because a source without version control still has a
    history worth showing; when it is absent the assembled history says so
    instead of pretending the requirement has only ever had one version.
    """

    def __init__(
        self,
        audits: AuditStore,
        *,
        revisions: ArtifactRevisions | None = None,
        completions: Mapping[str, CompletionReport] | None = None,
        workspace: Path | None = None,
    ) -> None:
        self._audits = audits
        self._revisions = revisions
        self._completions = dict(completions or {})
        # Only for the offer (SWR-3616), which is read from the analysis log
        # rather than assembled from what is already in hand. Optional so a test
        # gets the other three deep views without a workspace at all.
        self._workspace = workspace

    def completion_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> CompletionReport | None:
        """The report the completion gate produced for this requirement.

        Handed in rather than read: a report is produced *by* a ``Done`` attempt
        (SWR-3215) and nothing persists one, so the caller that runs the gate is
        the only thing that can have one. What matters here is that the board has
        a way to receive it.
        """
        return self._completions.get(requirement.req_id)

    def history_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> RevisionHistory | None:
        """Every version of *requirement*, with the run and commit that delivered it."""
        deliveries = record.satisfied.entries
        trail = self._audits.read(requirement.req_id)
        available = self._revisions is not None
        revisions: tuple[ArtifactRevision, ...] = ()
        if self._revisions is not None and requirement.source_path:
            revisions = self._revisions.revisions_for(requirement.source_path)
        return build_revision_history(
            requirement.req_id,
            current_hash=requirement.current_hash,
            revisions=revisions,
            recorded=recorded_hashes(trail, deliveries),
            deliveries=deliveries,
            source_history_available=available,
            unavailable_reason=(
                "" if available else "this source keeps no revision history of its own"
            ),
        )

    def audit_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> AuditTrail | None:
        """The recorded trail, or ``None`` when nothing was ever recorded."""
        trail = self._audits.read(requirement.req_id)
        return None if trail.empty else trail

    @traces(SWR.SWR_3616)
    def offer_for(
        self,
        requirement: CanonicalRequirement,
        record: DeliveryRecord,
    ) -> OfferView | None:
        """The work this requirement's change asks for, when one is waiting.

        ``None`` for the overwhelmingly common card: a requirement nobody edited
        has no analysis to act on, and one already released has been acted on.
        The state is passed through rather than re-read — this reader has the
        record in hand, and reading the delivery store again for a card it was
        just given would be a second answer to a settled question.
        """
        from rotaris_core.requirements.change_host import pending_change_work

        if self._workspace is None:
            return None
        offer = pending_change_work(self._workspace, requirement.req_id, state=record.state)
        if offer is None:
            return None
        return OfferView(
            req_id=offer.req_id,
            outcome=offer.outcome,
            summary=offer.message,
            reasoning=offer.reasoning,
            units=offer.units,
            verifies_instead=offer.verifies_instead,
            decomposes=offer.decomposes,
        )


@runtime_checkable
class CoverageIndex(Protocol):
    """The shape of one requirement's entry in ReqToCode's coverage index.

    Structural on purpose: :mod:`rotaris_core.reqtocode.coverage` owns its own
    dataclasses and this module reads them without importing them, so the
    read-only relationship SWR-3216 declares stays read-only in the import graph
    too.
    """

    @property
    def implementations(self) -> Sequence[_Site]:
        """Sites annotated as implementing the requirement."""
        ...

    @property
    def tests(self) -> Sequence[_Site]:
        """Sites annotated as covering the requirement."""
        ...


@runtime_checkable
class _Site(Protocol):
    """One annotated location: a repository-relative path and a line."""

    @property
    def path(self) -> str:
        """Repository-relative posix path."""
        ...

    @property
    def line(self) -> int:
        """1-based line number."""
        ...


@traces(SWR.SWR_3216)
class CoverageEvidence:
    """Evidence facts read out of ReqToCode's coverage index (SWR-2336).

    The bridge between the requirement layer's ids and ReqToCode's numbers, and
    the reason the board never runs a ``reqtocode`` process: the sweep is a
    library call whose result is handed in as data. Covering tests arrive with
    ``executed=False`` because a coverage sweep knows a test *exists*, not that
    anything ran it — which projects as ``stale``, and is precisely the
    distinction SWR-2606 exists to keep visible.
    """

    def __init__(
        self,
        coverage: Mapping[int, CoverageIndex],
        *,
        verifications: Mapping[str, EvidenceInputs] | None = None,
    ) -> None:
        self._coverage = coverage
        self._verifications = dict(verifications or {})

    @classmethod
    def for_repository(cls, repo_root: Path) -> Self:
        """Sweep *repo_root* once and read every requirement's sites from it.

        Reads the repository and writes nothing: the sweep is a library call over
        an already-checked-out tree, which is the whole reason SWR-3311 can
        forbid the board from ever spawning a ``reqtocode`` process. The import is
        local because :mod:`rotaris_core.reqtocode.coverage` pulls the verifier in
        with it, and a board that never asks for coverage should not pay for that
        at import time.

        **The project's own layout, not Rotaris'.** ``DEFAULT_LAYOUT`` names
        ``src/rotaris_core`` — right for this repository and wrong for every
        other one, so without this every card in a foreign workspace showed no
        implementation and no covering test. It also decides whether a migration
        can be approved at all: the worklist's digest is re-derived from this
        sweep (SWR-3507), and a sweep of the wrong tree finds nothing and refuses
        every approval as "the sites have moved".

        An unreadable layout config is a warning and an empty sweep, never a
        failed board read — the same call ``analyse_removals`` makes, for the
        same reason.
        """
        from rotaris_core.reqtocode.coverage import coverage_map
        from rotaris_core.reqtocode.layout import load_layout

        try:
            swept = coverage_map(repo_root, load_layout(repo_root))
        except Exception:  # noqa: BLE001 - an unreadable layout is not a failed read
            logging.getLogger(__name__).warning(
                "Could not sweep %s for requirement coverage",
                repo_root,
                exc_info=True,
            )
            swept = {}
        return cls(swept)

    def evidence_for(self, requirement: CanonicalRequirement) -> EvidenceInputs:
        """The sites recorded for *requirement*, plus any verification given."""
        known = self._verifications.get(requirement.req_id)
        number = requirement_number(requirement.req_id)
        entry = self._coverage.get(number) if number is not None else None
        implementations = (
            tuple(RequirementSite(path=site.path, line=site.line) for site in entry.implementations)
            if entry is not None
            else ()
        )
        covering = (
            tuple(CoveringTest(path=site.path, line=site.line) for site in entry.tests)
            if entry is not None
            else ()
        )
        if known is None:
            return EvidenceInputs(
                req_id=requirement.req_id,
                requirement_hash=requirement.current_hash,
                implementations=implementations,
                covering_tests=covering,
            )
        return known.model_copy(
            update={
                "implementations": implementations or known.implementations,
                "covering_tests": covering or known.covering_tests,
            },
        )


@traces(SWR.SWR_3207, SWR.SWR_3209, SWR.SWR_3220)
class WorkspaceEvidence:
    """The sweep, the last verification and how far the repository has moved since.

    :class:`CoverageEvidence` answers *what the repository declares* — traces and
    covering tests, with ``executed=False`` because a sweep knows a test exists
    and not that anything ran it (SWR-2606). That answer alone can never reach
    ``satisfied``, which is why the ring was red for every requirement in every
    workspace until this class existed.

    Two facts are laid over it, and they only make sense together:

    - **the recorded verification** (SWR-3220): its verdict fills the
      ``verification`` obligation, and its per-test outcomes fill in what the
      sweep cannot know, so ``test`` can leave ``stale``;
    - **how far the repository has moved since** (SWR-3209): what changed under
      the requirement's traces, whether any of them disappeared, whether the
      verified commit is still reachable.

    Recording without decaying would be worse than not recording: a stored
    verdict that never expires paints the ring *green* over code that has since
    changed, where today's permanently-red ring at least errs toward caution.
    That is why one class owns both and neither is optional.

    Composition rather than a second sweep: *sweep* is any
    :class:`EvidenceReader`, so this adds a layer and duplicates no coverage
    logic — and a test can hand it a hand-built reader and no repository at all.
    """

    def __init__(
        self,
        sweep: EvidenceReader,
        verifications: Mapping[str, RequirementVerification] | None = None,
        *,
        freshness: FreshnessSource | None = None,
        policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
    ) -> None:
        self._sweep = sweep
        self._verifications = dict(verifications or {})
        self._freshness: FreshnessSource = freshness if freshness is not None else NoFreshness()
        self._policy = policy

    @classmethod
    def for_repository(
        cls,
        repo_root: Path,
        *,
        policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
    ) -> Self:
        """Sweep *repo_root*, read its verifications, and ask git about each one.

        The production composition. The freshness source is built here rather
        than handed in because its memo must not outlive the pass: one built per
        evaluation cannot answer from before the merge that just happened.
        """
        from rotaris_core.requirements.delivery.freshness import GitFreshness
        from rotaris_core.requirements.delivery.verification import VerificationStore

        return cls(
            CoverageEvidence.for_repository(repo_root),
            VerificationStore(repo_root).load_all().verifications,
            freshness=GitFreshness.for_repo(repo_root),
            policy=policy,
        )

    def evidence_for(self, requirement: CanonicalRequirement) -> EvidenceInputs:
        """Today's sites, the last verdict over them, and every reason it is stale."""
        base = self._sweep.evidence_for(requirement)
        verification = self._verifications.get(requirement.req_id)
        if verification is None:
            # Never verified. *Not* stale: there is no baseline to have drifted
            # from, and the projection reports the obligation as missing, which
            # is the true and different thing (SWR-3209).
            return base
        covering = _executed_as_recorded(base.covering_tests, verification)
        return base.model_copy(
            update={
                "verification": verification.record,
                "covering_tests": covering,
                "staleness": evaluate_freshness(
                    FreshnessInputs(
                        req_id=requirement.req_id,
                        requirement_hash=requirement.current_hash,
                        implementations=base.implementations,
                        covering_tests=tuple(
                            RequirementSite(path=test.path, line=test.line) for test in covering
                        ),
                        verified=verification.baseline,
                        changed_paths=self._freshness.changed_since(verification.commit),
                        verified_commit_is_ancestor=self._freshness.is_ancestor(
                            verification.commit,
                        ),
                    ),
                    policy=self._policy,
                ),
            },
        )


def _executed_as_recorded(
    swept: tuple[CoveringTest, ...],
    verification: RequirementVerification,
) -> tuple[CoveringTest, ...]:
    """Today's covering tests, carrying what the last verification did with them.

    Matched on the **file**, not on path *and* line, because that is what
    "executed" means: :func:`~rotaris_core.verifier.requirement_evidence.
    execution_for` asks whether a check ran the file a test lives in, and a test
    that moved three lines down was still run by the suite that ran its file.

    A line that moved is not lost by matching this way — it is reported by
    freshness instead, as ``trace-moved``, which is the finding that actually
    describes it. Reporting it twice, once as "nothing ran this" and once as "it
    moved", would name one event with two different repairs.
    """
    recorded = {test.path: test for test in verification.covering_tests}
    overlaid: list[CoveringTest] = []
    for test in swept:
        ran = recorded.get(test.path)
        if ran is None or not ran.executed:
            overlaid.append(test)
            continue
        overlaid.append(
            test.model_copy(
                update={
                    "executed": True,
                    "check_name": ran.check_name,
                    "check_status": ran.check_status,
                    # The verdict travels with the status it belongs to. Carrying
                    # one without the other would leave the board re-deriving
                    # "did this test pass" from a check status, which is the
                    # inference SWR-2606 removed — and for a record written before
                    # the field existed the derivation already happened on read.
                    "verdict": ran.verdict,
                },
            ),
        )
    return tuple(overlaid)


@traces(SWR.SWR_3216)
class BoardProjector:
    """The one read API: requirements plus delivery data, projected (SWR-3216).

    Reads and never writes. The delivery store is used through :meth:`~rotaris_
    core.requirements.delivery.store.DeliveryStore.load_all`, which opens files
    for reading and answers a missing one with a blank record; the requirement
    side arrives as an already-published index, so a projection cannot trigger a
    source read as a side effect of being asked for. Everything else comes
    through the three reader ports, whose defaults answer "nothing yet".

    Construction is cheap and reads nothing: :meth:`project` is what looks.
    """

    def __init__(
        self,
        index: RequirementIndex | Callable[[], RequirementIndex],
        store: DeliveryStore,
        *,
        evidence: EvidenceReader | None = None,
        execution: ExecutionReader | None = None,
        details: DetailReader | None = None,
        policy: ObligationPolicy = DEFAULT_OBLIGATION_POLICY,
        priorities: Mapping[str, RequirementPriority] | None = None,
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        self._index = index
        self._store = store
        self._evidence: EvidenceReader = evidence if evidence is not None else NoEvidence()
        self._execution: ExecutionReader = execution if execution is not None else NoExecution()
        self._details: DetailReader = details if details is not None else NoDetails()
        self._policy = policy
        self._priorities = dict(priorities or {})
        self._clock = clock

    def _current_index(self) -> RequirementIndex:
        return self._index() if callable(self._index) else self._index

    @traces(SWR.SWR_3216)
    def inputs(self, *, req_ids: Iterable[str] | None = None) -> BoardInputs:
        """Gather everything the projection needs — reads only, writes nothing.

        *req_ids* narrows the *deep* views — the review payload, the completion
        report, the revision history and the audit trail — to the requirements a
        caller is about to show, because each of those reads a log of its own and
        a detail panel shows one card at a time. The board itself is always
        complete: a partially projected board would put a requirement in no
        column at all, which is worse than a slow one (SWR-3302).
        """
        index = self._current_index()
        delivery = self._store.load_all()
        wanted = frozenset(req_ids) if req_ids is not None else None
        evidence: dict[str, EvidenceInputs] = {}
        execution: dict[str, ExecutionSummary] = {}
        blockers: dict[str, tuple[BlockerView, ...]] = {}
        reviews: dict[str, ReviewView] = {}
        completions: dict[str, CompletionReport] = {}
        histories: dict[str, RevisionHistory] = {}
        audits: dict[str, AuditTrail] = {}
        offers: dict[str, OfferView] = {}
        for requirement in index.requirements:
            req_id = requirement.req_id
            evidence[req_id] = self._evidence.evidence_for(requirement)
            summary = self._execution.execution_for(req_id)
            if not summary.empty:
                execution[req_id] = summary
            found = self._execution.blockers_for(req_id)
            if found:
                blockers[req_id] = found
            if wanted is not None and req_id not in wanted:
                continue
            review = self._execution.review_for(req_id)
            if review is not None:
                reviews[req_id] = review
            record = delivery.get(req_id)
            report = self._details.completion_for(requirement, record)
            if report is not None:
                completions[req_id] = report
            history = self._details.history_for(requirement, record)
            if history is not None:
                histories[req_id] = history
            trail = self._details.audit_for(requirement, record)
            if trail is not None:
                audits[req_id] = trail
            offer = self._details.offer_for(requirement, record)
            if offer is not None:
                offers[req_id] = offer
        return BoardInputs(
            index=index,
            delivery=delivery,
            evidence=evidence,
            execution=execution,
            blockers=blockers,
            reviews=reviews,
            completions=completions,
            histories=histories,
            audits=audits,
            offers=offers,
            priorities=self._priorities,
            queue=self._execution.queue(),
            policy=self._policy,
            evaluated_at=self._clock() if self._clock is not None else None,
        )

    @traces(SWR.SWR_3216)
    def project(self, *, req_ids: Iterable[str] | None = None) -> BoardProjection:
        """The complete board projection. Side-effect free (SWR-3216)."""
        return project_board(self.inputs(req_ids=req_ids))
