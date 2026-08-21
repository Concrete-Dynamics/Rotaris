"""Epic progress, aggregated from the children rather than maintained (SWR-3212).

An epic is not implemented by one run; it is finished when its children are. So
its card summarises them — and the summary has to be a *computation*, because a
progress field somebody keeps up to date by hand is wrong within a week and
nobody can tell when it went wrong.

**The epic's own state is derived and cannot be set.** ``Done`` only when every
non-deprecated descendant is ``Done``, ``Blocked`` when any is blocked,
``Running`` when any is running. Two things follow, and both are here rather
than in the callers:

- the derived state is published as a whole :class:`~rotaris_core.requirements.
  delivery.state.DeliveryStatus` (:attr:`EpicProgress.status`), not only as a
  bare state, so every surface that reads a requirement's delivery status —
  the board's columns, the badges, the card (SWR-3216, SWR-3302, SWR-3308) —
  reads the epic's *derived* answer instead of the untouched record the store
  holds for it. The status carries the provenance of the child change that
  produced it, because "who moved this and when" has to stay answerable for an
  epic too;
- :func:`apply_epic_transition` refuses a direct move by asking the hierarchy
  whether the id is an epic, and :func:`epic_transitions` binds that same
  question to the *persisting* seam, so the refusal lives in one place instead
  of in every board action that might drag a card (SWR-3203).

**It aggregates over leaves, and that is what makes nesting transitive.** An epic
holding groups holding requirements reports the requirements, because those are
what carry traces, tests and runs — an intermediate node has none of its own, and
counting it would inflate the denominator of every percentage with rows that can
never be traced. A nested epic therefore needs no special case: its own progress
is the same computation over the same leaves.

**Deprecated children are excluded and stated.** They are not counted in the
per-state numbers and not held against the traceability percentage, and
:attr:`EpicProgress.deprecated` names them, because "3 of 12, and 2 more are
deprecated" is the honest sentence and "3 of 14" is not.

Everything here is pure: the hierarchy (SWR-3108) and the children's delivery
views (SWR-3202) come in as values, and no store, clock or repository is
touched.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.state import (
    DEFAULT_DELIVERY_STATE,
    DeliveryState,
    DeliveryStatus,  # noqa: TC001 - Pydantic resolves this at runtime.
    DeliveryView,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.delivery.transitions import DeliveryTransitions, apply_transition
from rotaris_core.requirements.model import RequirementLifecycle, requirement_sort_key

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from rotaris_core.requirements.delivery.store import DeliveryRecord, DeliveryStore
    from rotaris_core.requirements.delivery.transitions import (
        CompletionGate,
        TransitionOutcome,
        TransitionRequest,
    )
    from rotaris_core.requirements.model import RequirementHierarchy

__all__ = [
    "ActiveRun",
    "ChildProgress",
    "EpicBlocker",
    "EpicProgress",
    "aggregate_epic",
    "aggregate_epics",
    "apply_epic_transition",
    "counted_leaves",
    "derived_state",
    "derived_status",
    "epic_transitions",
    "is_epic",
]

#: Sorts before every real timestamp, so a child whose delivery never moved can
#: take part in a ``max`` without a branch. Never stored.
_UNDATED = dt.datetime.min.replace(tzinfo=dt.UTC)


@traces(SWR.SWR_3212)
class ChildProgress(BaseModel):
    """What an epic needs to know about one of its descendants.

    The delivery view (SWR-3202) carries both axes — the project's lifecycle and
    Rotaris' delivery state — and the two evidence flags come from the health
    projection (SWR-3211). Kept as flags rather than as the full evidence: an
    epic aggregates *counts*, and holding every child's evidence to compute two
    percentages would make the epic card the most expensive thing on the board.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    view: DeliveryView
    #: Whether an implementation site traces this requirement (SWR-2336).
    traced: bool = False
    #: Whether a covering test ran and passed for it (SWR-2606).
    verified: bool = False
    #: The run currently in flight for this requirement, when one is.
    active_run_id: str | None = None

    @classmethod
    def of_record(
        cls,
        record: DeliveryRecord,
        *,
        lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT,
        traced: bool = False,
        verified: bool = False,
        active_run_id: str | None = None,
    ) -> Self:
        """A child's progress from its stored delivery record and its lifecycle.

        The two arrive from different places on purpose: the record is Rotaris'
        (SWR-3205) and the lifecycle is the project's, read from the source on
        every read (SWR-3202). Joining them here rather than storing the join is
        what keeps the two axes independent.
        """
        return cls(
            view=DeliveryView(req_id=record.req_id, lifecycle=lifecycle, delivery=record.delivery),
            traced=traced,
            verified=verified,
            active_run_id=active_run_id,
        )

    @property
    def req_id(self) -> str:
        """The requirement this progress is about."""
        return self.view.req_id

    @property
    def state(self) -> DeliveryState:
        """Its delivery state."""
        return self.view.delivery.state

    @property
    def deprecated(self) -> bool:
        """Whether the project retired it — excluded from progress (SWR-3212)."""
        return self.view.lifecycle is RequirementLifecycle.DEPRECATED

    @property
    def blocked_reason(self) -> str:
        """Why it is blocked, or empty when it is not."""
        return self.view.delivery.blocked_reason


@traces(SWR.SWR_3212)
class ActiveRun(BaseModel):
    """A run in flight below an epic, named by the requirement it serves."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    run_id: str


@traces(SWR.SWR_3212)
class EpicBlocker(BaseModel):
    """One blocked descendant and its stated reason (SWR-3201)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    reason: str

    @property
    def message(self) -> str:
        """``SWR-3204: the upstream API is down``."""
        return f"{self.req_id}: {self.reason}" if self.reason else self.req_id


@traces(SWR.SWR_3212)
def is_epic(req_id: str, hierarchy: RequirementHierarchy) -> bool:
    """Whether *req_id* has children, and therefore a derived state.

    The one definition of "this is an epic" in the delivery layer. Everything
    that must not be set by hand — the state, the progress — follows from this
    answer, so a caller never has to decide it for itself.
    """
    return bool(hierarchy.children_of(req_id))


@traces(SWR.SWR_3212, SWR.SWR_3108)
def counted_leaves(epic_id: str, hierarchy: RequirementHierarchy) -> tuple[str, ...]:
    """Every descendant of *epic_id* that is a requirement rather than a group.

    Depth does not matter: :meth:`RequirementHierarchy.descendants` walks the
    whole subtree, and dropping the nodes that have children of their own leaves
    exactly the requirements someone implements. That is what makes nested epics
    aggregate transitively without a second code path.
    """
    return tuple(
        req_id for req_id in hierarchy.descendants(epic_id) if not hierarchy.children_of(req_id)
    )


@traces(SWR.SWR_3212)
def derived_state(counts: Mapping[DeliveryState, int]) -> DeliveryState:
    """The state an epic's children imply (SWR-3212).

    Precedence, in the order SWR-3212 states it and then in the order a reader
    would ask it:

    1. **Blocked** — a blocked child stops the epic, whatever else is running.
    2. **Running** — work is in flight.
    3. **Needs Update** — a delivered child drifted from its specification
       (SWR-3502); an epic containing one is not finished, whatever the rest say.
    4. **Done** — every counted child is done, and only then.
    5. **Review** — everything is done or waiting to be accepted.
    6. **Ready** — some child has been picked up or finished.
    7. **Backlog** — nothing has started.

    An epic with no counted children is ``Backlog``, not ``Done``: "every child
    is done" is vacuously true of no children, and reporting an empty epic as
    finished is the single most misleading thing this function could do.
    """
    total = sum(counts.get(state, 0) for state in DeliveryState)
    if not total:
        return DeliveryState.BACKLOG
    if counts.get(DeliveryState.BLOCKED, 0):
        return DeliveryState.BLOCKED
    if counts.get(DeliveryState.RUNNING, 0):
        return DeliveryState.RUNNING
    if counts.get(DeliveryState.NEEDS_UPDATE, 0):
        return DeliveryState.NEEDS_UPDATE
    done = counts.get(DeliveryState.DONE, 0)
    if done == total:
        return DeliveryState.DONE
    if done + counts.get(DeliveryState.REVIEW, 0) == total:
        return DeliveryState.REVIEW
    if done or counts.get(DeliveryState.REVIEW, 0) or counts.get(DeliveryState.READY, 0):
        return DeliveryState.READY
    return DeliveryState.BACKLOG


@traces(SWR.SWR_3212, SWR.SWR_3201)
def derived_status(
    state: DeliveryState,
    blockers: Sequence[EpicBlocker] = (),
    provenance: ChildProgress | None = None,
) -> DeliveryStatus:
    """The derived state as a whole status, so every surface can read it (SWR-3212).

    An epic's stored record is untouched by construction —
    :func:`apply_epic_transition` refuses every direct move — so reading the
    stored status would answer ``Backlog`` for an epic whose children are half
    delivered. The board reads a *status*, not a bare state (badges, columns, the
    time of the last change), so the derivation has to produce one.

    *provenance* is the counted child whose delivery moved most recently: an
    epic's state changed when the child that determined it changed, and
    :class:`~rotaris_core.requirements.delivery.state.DeliveryStatus` refuses a
    state other than ``Backlog`` that cannot name who moved it, when and why
    (SWR-3201). A child in any state but ``Backlog`` always carries those three,
    which is why a derived non-``Backlog`` state always has them too.

    A ``Blocked`` epic states its reason as its blocked children state theirs,
    because "blocked" without a reason is the one status SWR-3201 forbids.
    """
    origin = provenance.view.delivery if provenance is not None else None
    if origin is None or origin.changed_at is None or origin.changed_by is None:
        # Nothing below this epic ever moved: it is Backlog, and pristine, which
        # is what a workspace Rotaris has never written to looks like.
        return DeliveryStatus()
    blocked = state is DeliveryState.BLOCKED
    reason = "; ".join(blocker.message for blocker in blockers)
    return DeliveryStatus(
        state=state,
        blocked_reason=(reason or "a child of this epic is blocked") if blocked else "",
        changed_at=origin.changed_at,
        changed_by=origin.changed_by,
        cause=origin.cause,
        requirement_hash=origin.requirement_hash,
    )


def _latest_change(children: Sequence[ChildProgress]) -> ChildProgress | None:
    """The counted child whose delivery moved most recently, or ``None``.

    Ties are broken by id so two equal timestamps still produce one deterministic
    answer — SWR-3210 compares two passes for equality, and a provenance that
    depended on dictionary order would make identical inputs differ.
    """
    moved = [child for child in children if child.view.delivery.changed_at is not None]
    if not moved:
        return None
    return max(
        moved,
        key=lambda child: (
            child.view.delivery.changed_at or _UNDATED,
            requirement_sort_key(child.req_id),
        ),
    )


@traces(SWR.SWR_3212)
class EpicProgress(BaseModel):
    """One epic's children, summed up.

    Every field is derived from the children handed in; nothing here is stored,
    and :attr:`state` in particular is a computation rather than a value anyone
    may write (SWR-3203).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The descendants that count, in id order.
    children: tuple[str, ...] = ()
    #: Descendants the project deprecated, named and excluded (SWR-3212).
    deprecated: tuple[str, ...] = ()
    #: Nested epics below this one, so the structure is visible on the card.
    child_epics: tuple[str, ...] = ()
    #: Every delivery state with its count — zeros included, so a bar does not
    #: have to guess which columns exist.
    counts: dict[DeliveryState, int] = {}
    traced: int = 0
    verified: int = 0
    active_runs: tuple[ActiveRun, ...] = ()
    blockers: tuple[EpicBlocker, ...] = ()
    #: The state the children imply. Never settable (SWR-3212).
    state: DeliveryState = DEFAULT_DELIVERY_STATE
    #: The same answer as a whole status, so a card, a column and a badge read an
    #: epic exactly as they read a requirement (SWR-3216). Derived, never stored.
    status: DeliveryStatus = DeliveryStatus()

    @model_validator(mode="after")
    def _one_state(self) -> Self:
        if self.status.state is not self.state:
            raise ValueError(
                f"{self.req_id}: the derived state ({self.state.label}) and the status it is"
                f" published as ({self.status.state.label}) must be one answer (SWR-3212)",
            )
        return self

    @property
    def total(self) -> int:
        """How many descendants count towards this epic's progress."""
        return len(self.children)

    @property
    def done(self) -> int:
        """How many of them are ``Done``."""
        return self.counts.get(DeliveryState.DONE, 0)

    @property
    def completion(self) -> float:
        """Fraction of counted children that are ``Done`` — 0.0 for an empty epic."""
        return self.done / self.total if self.total else 0.0

    @property
    def traceability(self) -> float:
        """Fraction of counted children with an implementation trace."""
        return self.traced / self.total if self.total else 0.0

    @property
    def verification(self) -> float:
        """Fraction of counted children whose covering test ran and passed."""
        return self.verified / self.total if self.total else 0.0

    @property
    def traceability_percent(self) -> float:
        """:attr:`traceability` as the percentage a card prints."""
        return round(self.traceability * 100, 1)

    @property
    def verification_percent(self) -> float:
        """:attr:`verification` as the percentage a card prints."""
        return round(self.verification * 100, 1)

    @property
    def summary(self) -> str:
        """One line: the derived state, the counts and what is excluded."""
        deprecated = f", {len(self.deprecated)} deprecated" if self.deprecated else ""
        blocked = f", {len(self.blockers)} blocked" if self.blockers else ""
        return (
            f"{self.req_id}: {self.state.label} — {self.done}/{self.total} done,"
            f" {self.traceability_percent}% traced{blocked}{deprecated}"
        )


@traces(SWR.SWR_3212)
def aggregate_epic(
    epic_id: str,
    hierarchy: RequirementHierarchy,
    progress: Mapping[str, ChildProgress],
) -> EpicProgress:
    """Sum up one epic's descendants (SWR-3212).

    A descendant with no entry in *progress* is counted as ``Backlog`` and
    untraced rather than skipped: an epic whose child Rotaris has never written
    about still has that child, and dropping it would make the denominator lie.
    """
    leaves = counted_leaves(epic_id, hierarchy)
    counts: dict[DeliveryState, int] = dict.fromkeys(DeliveryState, 0)
    counted: list[str] = []
    deprecated: list[str] = []
    traced = 0
    verified = 0
    runs: list[ActiveRun] = []
    blockers: list[EpicBlocker] = []

    known: list[ChildProgress] = []

    for req_id in leaves:
        child = progress.get(req_id)
        if child is not None and child.deprecated:
            deprecated.append(req_id)
            continue
        counted.append(req_id)
        state = child.state if child is not None else DeliveryState.BACKLOG
        counts[state] += 1
        if child is None:
            continue
        known.append(child)
        traced += int(child.traced)
        verified += int(child.verified)
        if child.active_run_id:
            runs.append(ActiveRun(req_id=req_id, run_id=child.active_run_id))
        if state is DeliveryState.BLOCKED:
            blockers.append(EpicBlocker(req_id=req_id, reason=child.blocked_reason))

    status = derived_status(derived_state(counts), tuple(blockers), _latest_change(known))
    return EpicProgress(
        req_id=epic_id,
        children=tuple(counted),
        deprecated=tuple(deprecated),
        child_epics=tuple(
            req_id for req_id in hierarchy.descendants(epic_id) if hierarchy.children_of(req_id)
        ),
        counts=counts,
        traced=traced,
        verified=verified,
        active_runs=tuple(runs),
        blockers=tuple(blockers),
        # One answer, published twice: the bare state a filter reads and the whole
        # status a card reads. :func:`derived_status` degrades to Backlog only when
        # nothing below the epic ever moved, which is exactly when
        # :func:`derived_state` says Backlog too.
        state=status.state,
        status=status,
    )


@traces(SWR.SWR_3212)
def aggregate_epics(
    hierarchy: RequirementHierarchy,
    progress: Mapping[str, ChildProgress],
) -> dict[str, EpicProgress]:
    """Every epic in the hierarchy with its progress, in id order.

    "Every epic" means every requirement that has children — including the nested
    ones, each aggregated over its own subtree, which is what lets a board render
    a tree of progress bars from one pass.
    """
    epics = sorted(
        (req_id for req_id in hierarchy.requirements if hierarchy.children_of(req_id)),
        key=requirement_sort_key,
    )
    return {epic_id: aggregate_epic(epic_id, hierarchy, progress) for epic_id in epics}


@traces(SWR.SWR_3212, SWR.SWR_3203)
def apply_epic_transition(
    record: DeliveryRecord,
    request: TransitionRequest,
    hierarchy: RequirementHierarchy,
    *,
    completion: CompletionGate | None = None,
) -> TransitionOutcome:
    """Apply a transition, refusing it outright when the id is an epic.

    The hierarchy decides, not the caller: a board action, a run and a
    propagation pass all reach the state machine through here, so "an epic's
    state follows from its children and is never set" is a property of the system
    rather than a rule three call sites have to remember (SWR-3212, SWR-3203).
    """
    return apply_transition(
        record,
        request,
        derived=is_epic(request.req_id, hierarchy),
        completion=completion,
    )


@traces(SWR.SWR_3212, SWR.SWR_3203)
def epic_transitions(
    store: DeliveryStore,
    hierarchy: RequirementHierarchy,
    *,
    completion: CompletionGate | None = None,
) -> DeliveryTransitions:
    """The persisting write path, bound to a hierarchy that knows what an epic is.

    :func:`apply_epic_transition` refuses an epic in the *pure* half only, which
    leaves "an epic's state cannot be set directly" resting on every caller
    remembering ``derived=is_epic(...)``. This is the same refusal on the seam
    that actually writes: a :class:`~rotaris_core.requirements.delivery.
    transitions.DeliveryTransitions` built here answers the question itself, so
    the board action, the run and the propagation pass all get the refusal
    whether or not they thought about epics (SWR-3212, SWR-3203).
    """
    return DeliveryTransitions(
        store,
        completion=completion,
        derived_for=lambda req_id: is_epic(req_id, hierarchy),
    )
