"""What runs next, why, and what is held back — with the reason (SWR-3412, SWR-3406).

Once several requirements are ``Ready``, someone has to decide what runs next.
Doing that by hand defeats the purpose; doing it without constraints produces
conflicting worktrees and dependent work running out of order. So the decision is
a pure function of stated facts, and its whole output is readable:

```text
requirements (state, priority, deps, units)  ─┐
running units                                 ├─▶ schedule() ─▶ ScheduleDecision
limits (concurrency, per-requirement, stop)  ─┘                  ├─ selected, in order
                                                                 ├─ held, each with a reason
                                                                 └─ to_queue_view() (SWR-3216)
```

Five properties are load-bearing:

- **A dependency is not a preference.** Requirement dependencies (SWR-3510) and
  unit dependencies (SWR-3406) are evaluated *before* priority is consulted and
  before any limit is applied, so no priority, and no free capacity, can start a
  unit whose dependency has not finished. Priority only orders what is already
  eligible.
- **Every hold names its reason.** A candidate that is not started produces a
  :class:`Hold` carrying a machine-readable :class:`HoldReason`, a sentence and
  the ids it is waiting for. There is no path that drops a candidate silently:
  the queue holds every candidate it was given.
- **The limit queues, it does not reject.** Reaching the concurrency limit
  produces a held entry that stays in the queue, so the next pass starts it —
  which is what makes SWR-3406's third criterion different from "refused".
- **Two units that would collide do not run together.** Candidates carrying
  overlapping ``expected_files`` are held against each other rather than started
  into two worktrees that will conflict at integration time (SWR-3409).
- **A failing unit does not cancel its siblings.** Failure is a unit state, not a
  requirement state: independent siblings stay eligible, and only the units that
  actually declared a dependency on the failed one are held — by name.

Pure. No clock (the timestamp is an argument), no filesystem, no git, no
subprocess. :func:`run_selected` is the one function that touches threads, and it
only executes a decision this module already made.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import (
    QueueEntryView,
    QueueView,
    RequirementPriority,
    UnitState,
)
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.model import requirement_sort_key

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from rotaris_core.requirements.delivery.projection import RunView
    from rotaris_core.requirements.execution.units import RequirementUnits

__all__ = [
    "SCHEDULABLE_STATES",
    "DeliveryScheduler",
    "Hold",
    "HoldReason",
    "RunningUnit",
    "ScheduleDecision",
    "SchedulerLimits",
    "ScheduledRequirement",
    "Selection",
    "UnitCandidate",
    "WaveResult",
    "run_selected",
    "schedule",
]

#: Delivery states whose units the scheduler may start. ``Ready`` is where
#: SWR-3413 releases a requirement into the flow; ``Running`` is what it becomes
#: the moment the first unit starts, and its *remaining* units must stay
#: schedulable or a multi-unit requirement could never finish.
SCHEDULABLE_STATES: frozenset[DeliveryState] = frozenset(
    {DeliveryState.READY, DeliveryState.RUNNING},
)

#: Unit states a candidate may be started from. Anything else is either already
#: in flight, already finished, or deliberately given up on (SWR-3401).
_STARTABLE_UNIT_STATES: frozenset[UnitState] = frozenset(
    {UnitState.PENDING, UnitState.QUEUED, UnitState.HELD},
)


@traces(SWR.SWR_3412)
class HoldReason(StrEnum):
    """Why a candidate was not started, machine-readable (SWR-3412).

    A closed set rather than free text: the board filters on it, the audit trail
    records it, and a user asking "why is nothing running" needs the same answer
    from every surface. The *detail* on :class:`Hold` carries the specifics.
    """

    #: A requirement this one depends on is not ``Done`` (SWR-3510).
    REQUIREMENT_DEPENDENCY = "requirement-dependency"
    #: A sibling unit this one waits for has not finished (SWR-3406).
    UNIT_DEPENDENCY = "unit-dependency"
    #: This requirement contradicts another, and choosing between them is a
    #: product decision nobody has taken yet (SWR-3511). Distinct from
    #: ``file-conflict``, which is two units expecting to touch the same file and
    #: resolves itself by waiting; this one resolves only when a person decides.
    CONTRADICTION = "contradiction"
    #: Another candidate or running unit is expected to touch the same files.
    FILE_CONFLICT = "file-conflict"
    #: The global concurrency limit is reached; this candidate stays queued.
    CONCURRENCY_LIMIT = "concurrency-limit"
    #: This requirement's own parallelism limit is reached.
    REQUIREMENT_LIMIT = "requirement-limit"
    #: The user stopped the queue. Work in flight keeps running (SWR-3608).
    QUEUE_STOPPED = "queue-stopped"
    #: The requirement is not in a state that may execute.
    REQUIREMENT_NOT_READY = "requirement-not-ready"

    @property
    def label(self) -> str:
        """``Unit Dependency`` — what a card prints."""
        return " ".join(part.capitalize() for part in self.value.split("-"))

    @property
    def is_dependency(self) -> bool:
        """Whether this hold is a dependency, which priority may never override."""
        return self in {HoldReason.REQUIREMENT_DEPENDENCY, HoldReason.UNIT_DEPENDENCY}


@traces(SWR.SWR_3412, SWR.SWR_3406)
class SchedulerLimits(BaseModel):
    """How much may run at once, and whether the scheduler picks work up itself."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: How many units may be in flight across all requirements (SWR-3117).
    concurrency: int = 1
    #: How many units of one requirement may be in flight. ``None`` is unbounded.
    per_requirement: int | None = None
    #: Whether the scheduler starts work without being asked (SWR-3412).
    automatic: bool = False
    #: Whether the user stopped the queue. Work already running keeps running,
    #: which is why this is a separate fact from an empty queue (SWR-3608).
    stopped: bool = False

    @field_validator("concurrency")
    @classmethod
    def _at_least_one(cls, value: int) -> int:
        if value < 1:
            raise ValueError("a concurrency limit of zero would never start anything")
        return value

    @field_validator("per_requirement")
    @classmethod
    def _positive(cls, value: int | None) -> int | None:
        if value is not None and value < 1:
            raise ValueError("a per-requirement limit of zero would never start anything")
        return value


@traces(SWR.SWR_3406, SWR.SWR_3412)
class UnitCandidate(BaseModel):
    """One execution unit the scheduler may start, and what would stop it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str
    #: Sibling unit ids this one waits for (SWR-3406).
    depends_on: tuple[str, ...] = ()
    #: Files this unit is expected to touch. The conflict signal of SWR-3412 —
    #: a prediction, deliberately: waiting for certainty would mean waiting for
    #: the run that the prediction exists to avoid starting.
    expected_files: tuple[str, ...] = ()
    state: UnitState = UnitState.PENDING
    agent: str = ""

    @field_validator("req_id", "unit_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a scheduling candidate names its requirement and its unit")
        return cleaned

    @property
    def startable(self) -> bool:
        """Whether this unit's own state allows it to be started at all."""
        return self.state in _STARTABLE_UNIT_STATES

    @property
    def key(self) -> tuple[str, str]:
        """``(req_id, unit_id)`` — how a candidate is identified across passes."""
        return (self.req_id, self.unit_id)


@traces(SWR.SWR_3412)
class ScheduledRequirement(BaseModel):
    """One requirement in the queue: its state, its priority, its dependencies.

    Built from the delivery record and the requirement's own units, so the
    scheduler never re-derives either — the units come from
    :class:`~rotaris_core.requirements.execution.units.RequirementUnits`, which
    already validated the dependency graph.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    state: DeliveryState = DeliveryState.READY
    priority: RequirementPriority = RequirementPriority.NONE
    #: Requirement ids that must be ``Done`` first (SWR-3510).
    depends_on: tuple[str, ...] = ()
    #: Requirement ids this one contradicts, while the contradiction stands
    #: (SWR-3511). Not a dependency: no amount of waiting clears it, and nothing
    #: this scheduler can do resolves it — a person has to decide.
    contradicts: tuple[str, ...] = ()
    units: tuple[UnitCandidate, ...] = ()

    @model_validator(mode="after")
    def _units_belong_here(self) -> Self:
        if self.req_id in self.depends_on:
            raise ValueError(f"{self.req_id}: a requirement cannot depend on itself")
        if self.req_id in self.contradicts:
            raise ValueError(f"{self.req_id}: a requirement cannot contradict itself")
        seen: set[str] = set()
        for unit in self.units:
            if unit.req_id != self.req_id:
                raise ValueError(
                    f"{unit.unit_id} belongs to {unit.req_id}, not to {self.req_id}",
                )
            if unit.unit_id in seen:
                raise ValueError(f"{self.req_id}: unit {unit.unit_id} is listed twice")
            seen.add(unit.unit_id)
        return self

    @classmethod
    @traces(SWR.SWR_3412, SWR.SWR_3406)
    def from_units(
        cls,
        units: RequirementUnits,
        *,
        state: DeliveryState = DeliveryState.READY,
        priority: RequirementPriority = RequirementPriority.NONE,
        depends_on: Sequence[str] = (),
        contradicts: Sequence[str] = (),
        expected_files: Mapping[str, Sequence[str]] | None = None,
    ) -> ScheduledRequirement:
        """This requirement's live units as scheduling candidates.

        Composition, not a copy: the unit ids, the dependency edges and the unit
        states all come from :class:`RequirementUnits`, so a decomposition change
        reaches the scheduler without a second model having to be updated.
        """
        files = expected_files or {}
        return cls(
            req_id=units.req_id,
            state=state,
            priority=priority,
            depends_on=tuple(depends_on),
            contradicts=tuple(contradicts),
            units=tuple(
                UnitCandidate(
                    req_id=unit.req_id,
                    unit_id=unit.unit_id,
                    depends_on=unit.depends_on,
                    expected_files=tuple(files.get(unit.unit_id, ())),
                    state=unit.state,
                    agent=unit.agent,
                )
                for unit in units.units
            ),
        )

    @property
    def finished_units(self) -> frozenset[str]:
        """Units of this requirement that have finished — what a sibling waits for."""
        return frozenset(unit.unit_id for unit in self.units if unit.state is UnitState.FINISHED)

    @property
    def order_key(self) -> tuple[int, tuple[tuple[int, int, str], ...]]:
        """Priority first, then the natural id order (SWR-3309)."""
        return (self.priority.rank, requirement_sort_key(self.req_id))


@traces(SWR.SWR_3406)
class RunningUnit(BaseModel):
    """A unit already in flight — capacity that is spoken for, and files that are."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str
    run_id: str = ""
    expected_files: tuple[str, ...] = ()

    @property
    def key(self) -> tuple[str, str]:
        """``(req_id, unit_id)``."""
        return (self.req_id, self.unit_id)


@traces(SWR.SWR_3412)
class Hold(BaseModel):
    """One candidate that was not started, and exactly why (SWR-3412).

    The detail is mandatory. SWR-3412's fourth acceptance criterion is that every
    held candidate carries a *stated* reason, and an empty string is not one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str
    reason: HoldReason
    detail: str
    #: The requirements or units this candidate is waiting for, named (SWR-3510).
    waiting_for: tuple[str, ...] = ()

    @field_validator("detail")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("a held candidate states the reason it is held (SWR-3412)")
        return cleaned

    @property
    def message(self) -> str:
        """``unit-dependency: waits for swr-1-impl`` — one line for the queue."""
        return f"{self.reason.value}: {self.detail}"

    @property
    def key(self) -> tuple[str, str]:
        """``(req_id, unit_id)``."""
        return (self.req_id, self.unit_id)


@traces(SWR.SWR_3412)
class Selection(BaseModel):
    """One candidate the scheduler chose, and where it sits in the order."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str
    #: Counted from 1, in the order the scheduler will actually start them.
    position: int
    priority: RequirementPriority = RequirementPriority.NONE
    agent: str = ""

    @property
    def key(self) -> tuple[str, str]:
        """``(req_id, unit_id)``."""
        return (self.req_id, self.unit_id)


@traces(SWR.SWR_3412, SWR.SWR_3406)
class ScheduleDecision(BaseModel):
    """What the scheduler decided, in full — chosen, held and already running.

    The whole of SWR-3412's observability requirement is this value: the queue,
    the chosen order and the reason behind every hold are all readable from it,
    and :meth:`to_queue_view` hands the same facts to the board without a second
    derivation (SWR-3216).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    limits: SchedulerLimits = SchedulerLimits()
    selected: tuple[Selection, ...] = ()
    held: tuple[Hold, ...] = ()
    running: tuple[RunningUnit, ...] = ()
    at: dt.datetime | None = None

    @property
    def selected_units(self) -> tuple[str, ...]:
        """The chosen unit ids, in start order."""
        return tuple(choice.unit_id for choice in self.selected)

    @property
    def held_units(self) -> tuple[str, ...]:
        """The held unit ids, in queue order."""
        return tuple(hold.unit_id for hold in self.held)

    @property
    def reasons(self) -> dict[str, HoldReason]:
        """``unit_id → reason`` for every held candidate — what a test asserts on."""
        return {hold.unit_id: hold.reason for hold in self.held}

    def hold_for(self, unit_id: str) -> Hold | None:
        """Why *unit_id* was not started, or ``None`` when it was."""
        return next((hold for hold in self.held if hold.unit_id == unit_id), None)

    def chose(self, unit_id: str) -> bool:
        """Whether *unit_id* is in the selection."""
        return unit_id in self.selected_units

    @property
    def capacity_left(self) -> int:
        """Slots still free after this decision. Never negative."""
        return max(0, self.limits.concurrency - len(self.running) - len(self.selected))

    @traces(SWR.SWR_3412, SWR.SWR_3216)
    def to_queue_view(self, runs: Sequence[RunView] = ()) -> QueueView:
        """This decision as the board shows and controls it (SWR-3216).

        Held entries keep position ``0`` and carry their reason as text, because
        :class:`~rotaris_core.requirements.delivery.projection.QueueEntryView`
        refuses a held entry without one — the same invariant, enforced twice.
        """
        entries = [
            QueueEntryView(
                req_id=choice.req_id,
                unit_id=choice.unit_id,
                position=choice.position,
                priority=choice.priority,
                held=False,
            )
            for choice in self.selected
        ]
        entries.extend(
            QueueEntryView(
                req_id=hold.req_id,
                unit_id=hold.unit_id,
                position=0,
                held=True,
                hold_reason=hold.message,
                waiting_for=hold.waiting_for,
            )
            for hold in self.held
        )
        return QueueView(
            entries=tuple(entries),
            running=tuple(runs),
            automatic=self.limits.automatic,
            concurrency_limit=self.limits.concurrency,
            stopped=self.limits.stopped,
            updated_at=self.at,
        )


@traces(SWR.SWR_3412, SWR.SWR_3406)
def schedule(
    requirements: Sequence[ScheduledRequirement],
    *,
    limits: SchedulerLimits | None = None,
    running: Sequence[RunningUnit] = (),
    states: Mapping[str, DeliveryState] | None = None,
    at: dt.datetime | None = None,
) -> ScheduleDecision:
    """Decide what runs next, and state why everything else does not.

    *states* supplies the delivery state of requirements that are **not** in
    *requirements* — the ones a candidate depends on but that are not themselves
    candidates. A dependency whose state is unknown is treated as not ``Done``:
    guessing the other way would start dependent work on an assumption.

    The evaluation order is the requirement: dependencies are checked before the
    queue is stopped, before a conflict and before any limit, so a held
    candidate's stated reason is always the *fundamental* one and priority can
    never advance a unit past a dependency.
    """
    effective = limits if limits is not None else SchedulerLimits()
    known: dict[str, DeliveryState] = {**dict(states or {})}
    known.update({requirement.req_id: requirement.state for requirement in requirements})

    running_units = tuple(running)
    taken_files: dict[str, tuple[str, str]] = {}
    for unit in running_units:
        for path in unit.expected_files:
            taken_files.setdefault(path, unit.key)
    per_requirement: dict[str, int] = {}
    for unit in running_units:
        per_requirement[unit.req_id] = per_requirement.get(unit.req_id, 0) + 1

    selected: list[Selection] = []
    held: list[Hold] = []
    in_flight = len(running_units)

    for requirement in sorted(requirements, key=lambda entry: entry.order_key):
        finished = requirement.finished_units
        unmet_requirements = tuple(
            dependency
            for dependency in requirement.depends_on
            if known.get(dependency) is not DeliveryState.DONE
        )
        for candidate in requirement.units:
            if not candidate.startable or candidate.key in {unit.key for unit in running_units}:
                continue
            hold = _hold_for(
                candidate,
                requirement=requirement,
                unmet_requirements=unmet_requirements,
                finished=finished,
                limits=effective,
                taken_files=taken_files,
                in_flight=in_flight + len(selected),
                requirement_in_flight=per_requirement.get(requirement.req_id, 0),
            )
            if hold is not None:
                held.append(hold)
                continue
            selected.append(
                Selection(
                    req_id=candidate.req_id,
                    unit_id=candidate.unit_id,
                    position=len(selected) + 1,
                    priority=requirement.priority,
                    agent=candidate.agent,
                ),
            )
            per_requirement[requirement.req_id] = per_requirement.get(requirement.req_id, 0) + 1
            for path in candidate.expected_files:
                taken_files.setdefault(path, candidate.key)

    return ScheduleDecision(
        limits=effective,
        selected=tuple(selected),
        held=tuple(held),
        running=running_units,
        at=at,
    )


def _hold_for(
    candidate: UnitCandidate,
    *,
    requirement: ScheduledRequirement,
    unmet_requirements: tuple[str, ...],
    finished: frozenset[str],
    limits: SchedulerLimits,
    taken_files: Mapping[str, tuple[str, str]],
    in_flight: int,
    requirement_in_flight: int,
) -> Hold | None:
    """Why *candidate* cannot start now, or ``None`` when it can.

    The order of the checks is the policy: a dependency outranks a stop, a stop
    outranks a conflict, and a conflict outranks a limit. That is what makes the
    stated reason the one a user has to act on rather than whichever condition
    happened to be evaluated first.
    """
    if requirement.state not in SCHEDULABLE_STATES:
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.REQUIREMENT_NOT_READY,
            detail=(
                f"{requirement.req_id} is {requirement.state.label}; only"
                " Ready and Running requirements execute (SWR-3413)"
            ),
        )
    if requirement.contradicts:
        # Above the dependency check on purpose: a requirement that contradicts
        # another is not waiting for anything, it is waiting for *somebody*, and
        # reporting "waits for SWR-x" would send its owner to a card that will
        # never unblock it (SWR-3511).
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.CONTRADICTION,
            detail=(
                f"{requirement.req_id} contradicts {', '.join(requirement.contradicts)};"
                " choosing between them is a product decision (SWR-3511)"
            ),
            waiting_for=requirement.contradicts,
        )
    if unmet_requirements:
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.REQUIREMENT_DEPENDENCY,
            detail=(
                f"{requirement.req_id} waits for {', '.join(unmet_requirements)},"
                " which is not Done (SWR-3510)"
            ),
            waiting_for=unmet_requirements,
        )
    unmet_units = tuple(
        dependency for dependency in candidate.depends_on if dependency not in finished
    )
    if unmet_units:
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.UNIT_DEPENDENCY,
            detail=f"waits for unit(s) {', '.join(unmet_units)}, which have not finished",
            waiting_for=unmet_units,
        )
    if limits.stopped:
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.QUEUE_STOPPED,
            detail="the delivery queue is stopped; work already in flight keeps running",
        )
    collisions = tuple(sorted(path for path in candidate.expected_files if path in taken_files))
    if collisions:
        owners = tuple(
            sorted({taken_files[path][1] for path in collisions}),
        )
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.FILE_CONFLICT,
            detail=(f"would touch {', '.join(collisions)}, already claimed by {', '.join(owners)}"),
            waiting_for=owners,
        )
    if limits.per_requirement is not None and requirement_in_flight >= limits.per_requirement:
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.REQUIREMENT_LIMIT,
            detail=(
                f"{requirement.req_id} already has {requirement_in_flight} unit(s) in"
                f" flight, its limit is {limits.per_requirement}"
            ),
        )
    if in_flight >= limits.concurrency:
        return Hold(
            req_id=candidate.req_id,
            unit_id=candidate.unit_id,
            reason=HoldReason.CONCURRENCY_LIMIT,
            detail=(
                f"{in_flight} unit(s) in flight, the limit is {limits.concurrency};"
                " this candidate stays queued"
            ),
        )
    return None


@traces(SWR.SWR_3412, SWR.SWR_3406)
class DeliveryScheduler:
    """The scheduler as an object: the limits, and the decision they produce.

    Thin on purpose. All the policy is in :func:`schedule`, which is pure; this
    holds the configured limits and the clock so a caller — the board, the CLI,
    the flow — does not carry them through every call.
    """

    def __init__(
        self,
        *,
        limits: SchedulerLimits | None = None,
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        self._limits = limits if limits is not None else SchedulerLimits()
        self._clock = clock

    @property
    def limits(self) -> SchedulerLimits:
        """The configured limits (SWR-3117)."""
        return self._limits

    @property
    def automatic(self) -> bool:
        """Whether this scheduler picks work up by itself (SWR-3412)."""
        return self._limits.automatic

    def decide(
        self,
        requirements: Sequence[ScheduledRequirement],
        *,
        running: Sequence[RunningUnit] = (),
        states: Mapping[str, DeliveryState] | None = None,
    ) -> ScheduleDecision:
        """The next decision, against this scheduler's limits."""
        return schedule(
            requirements,
            limits=self._limits,
            running=running,
            states=states,
            at=self._clock() if self._clock is not None else None,
        )


@dataclass(frozen=True, slots=True)
class WaveResult[T]:
    """What one selected unit's start produced — a value, or a stated failure.

    A failure is a value here rather than an exception, which is what implements
    SWR-3406's fourth criterion: one unit blowing up must not take its
    independent siblings' results with it.
    """

    req_id: str
    unit_id: str
    value: T | None = None
    error: str = ""

    @property
    def failed(self) -> bool:
        """Whether starting this unit raised."""
        return bool(self.error)


@traces(SWR.SWR_3406)
def run_selected[T](
    decision: ScheduleDecision,
    start: Callable[[Selection], T],
    *,
    max_workers: int | None = None,
) -> tuple[WaveResult[T], ...]:
    """Start every selected unit concurrently, bounded by the concurrency limit.

    The scheduler already decided *what* may run together; this only executes
    that decision, with at most :attr:`SchedulerLimits.concurrency` workers, and
    returns one result per selection in selection order.

    A *start* that raises for one unit yields a failed :class:`WaveResult` for
    that unit and leaves every sibling's result intact — the independent siblings
    of a failing unit are not cancelled (SWR-3406).
    """
    choices = decision.selected
    if not choices:
        return ()
    workers = max_workers if max_workers is not None else decision.limits.concurrency
    results: list[WaveResult[T]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [(choice, pool.submit(start, choice)) for choice in choices]
        for choice, future in futures:
            try:
                results.append(
                    WaveResult(req_id=choice.req_id, unit_id=choice.unit_id, value=future.result()),
                )
            except Exception as exc:  # noqa: BLE001 - a failing unit is a result, not a crash.
                results.append(
                    WaveResult(
                        req_id=choice.req_id,
                        unit_id=choice.unit_id,
                        error=f"{type(exc).__name__}: {exc}",
                    ),
                )
    return tuple(results)
