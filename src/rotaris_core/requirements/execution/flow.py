"""Ready starts the flow, and a failed unit never disappears (SWR-3413, SWR-3415).

The user-facing promise of the board is that releasing a requirement is enough.
Everything between that release and a reviewable result is Rotaris' job — and
each stage of it has to be observable, or a user cannot tell a slow stage from a
stuck one.

This module is the **conductor**, not a second implementation of anything it
conducts:

```text
Ready ─▶ RequirementFlow.start()
           │  snapshot        capture_snapshot()           snapshot.py     SWR-3402
           │  analysis        the injected assessor                        SWR-3404
           │  decomposition   Decomposer.decompose()       decomposition.py
           │  units           DecompositionPlan.to_units() units.py        SWR-3401
           │  worktree ─┐     RequirementRunSeam.start()   run_seam.py     SWR-3405/3416
           │  run       ┘     …one pair per unit, retried within its bound SWR-3415
           │  verification    the injected checker         verification.py SWR-3410
           │  integration     the injected integrator      integration.py  SWR-3409
           │  review          completion_transition()      snapshot.py     SWR-3403
           ▼
        Review  (or Blocked, naming the stage that failed)
```

Five properties are load-bearing:

- **The transition function is the only writer.** Every delivery state change the
  flow causes is a
  :class:`~rotaris_core.requirements.delivery.transitions.TransitionRequest`
  handed to :class:`TransitionWriter`; this module never builds a delivery
  status, never moves a record and never persists one. A shortcut here would make
  the board stop describing reality, which is what SWR-3203 exists to prevent.
  The writer is
  :class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions` and
  the flow refuses any other: it is the one that keeps ``Done`` unreachable after
  a mid-run edit and appends the trail (SWR-3403, SWR-3213). Together with the
  **required** *current_for*, that makes SWR-3403 impossible to leave out of a
  composition rather than merely available to it.
- **Every stage publishes its start, its outcome and its duration.**
  :class:`StageEvent` reaches the observer as it happens and stays on
  :attr:`FlowResult.events`; :class:`StageOutcome` carries the timings. A caller
  that wants live updates passes an observer, one that wants the record reads the
  tuples, and neither needs a signal or an event loop.
- **A failure stops at its stage and says which.** The requirement lands in
  ``Blocked`` (before there was anything to look at) or ``Review`` (once there
  is) — never mid-flight, never silently. The stage is reported as a *field*
  (:attr:`FlowResult.failed_stage`, and the transition's audit detail), never as
  another prefix glued onto the reason: the reason is the one sentence a person
  reads on the board under the requirement's own id, and it belongs to whichever
  stage produced it, whole.
- **A failed unit is retried within a stated bound, then blocks.**
  :class:`RetryPolicy` is configurable and counted, every failed attempt's
  worktree is kept, and exhausting the bound produces ``Blocked`` naming the last
  failure (SWR-3415 — the shape SWR-2817 already uses for interrupted sessions).
- **It resumes.** :class:`FlowStateStore` persists the stages that finished and
  the units that are done, so a restart re-derives the deterministic stages and
  runs only what is left rather than starting the requirement again.

Nothing in the flow needs the user to be present, and nothing in it needs a
display: every collaborator arrives through the constructor, the clock included.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
import json
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import (
    ReviewView,  # noqa: TC001 - Pydantic resolves this at runtime.
    RunOutcome,
    UnitState,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.decomposition import (
    DecompositionPlan,  # noqa: TC001 - Pydantic resolves this at runtime.
    single_unit_plan,
)
from rotaris_core.requirements.execution.run_seam import unit_isolation
from rotaris_core.requirements.execution.snapshot import (
    capture_snapshot,
    completion_transition,
    detect_drift,
    review_for,
    specification_change_event,
)
from rotaris_core.requirements.execution.units import (
    RequirementUnits,  # noqa: TC001 - Pydantic resolves this at runtime.
    UnitError,
)
from rotaris_core.requirements.execution.verification import (
    UnitVerification,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.tombstones import requirements_state_dir
from rotaris_core.requirements.writeback import atomic_write_text

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from pydantic import JsonValue

    from rotaris_core.requirements.delivery.audit import AuditEvent
    from rotaris_core.requirements.delivery.transitions import TransitionOutcome
    from rotaris_core.requirements.execution.context import AgentContext
    from rotaris_core.requirements.execution.decomposition import (
        Decomposer,
        RequirementAssessment,
    )
    from rotaris_core.requirements.execution.history import ExecutionHistory
    from rotaris_core.requirements.execution.integration import IntegrationOutcome
    from rotaris_core.requirements.execution.run_seam import RequirementRunSeam, RunResult
    from rotaris_core.requirements.execution.snapshot import RunSnapshot
    from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore
    from rotaris_core.requirements.execution.units import ExecutionUnit
    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "FLOW_STAGES",
    "FLOW_STATE_SCHEMA_VERSION",
    "FLOW_STATE_SUBDIRNAME",
    "FlowError",
    "FlowProgress",
    "FlowResult",
    "FlowStage",
    "FlowStateStore",
    "RequirementFlow",
    "RetryPolicy",
    "StageEvent",
    "StageOutcome",
    "StagePhase",
    "TransitionWriter",
    "UnitFailure",
    "abandon_unit",
    "blocked_request",
    "fail_unit",
    "retry_unit",
]

#: Sub-directory of ``<workspace>/.rotaris/requirements/`` holding flow state.
FLOW_STATE_SUBDIRNAME = "flows"

#: Version stamped on persisted flow state. Bumped only when a payload stops
#: being readable by the previous build.
FLOW_STATE_SCHEMA_VERSION = 1


class FlowError(RuntimeError):
    """The requirement flow could not be described or driven coherently."""


@traces(SWR.SWR_3413)
class FlowStage(StrEnum):
    """The stages between ``Ready`` and a reviewable result (SWR-3413).

    The list the requirement states, in the order it states them. A closed set,
    because "which stage failed" is the answer a blocked requirement owes its
    user, and free text would let two surfaces name one stage differently.
    """

    SNAPSHOT = "snapshot"
    #: Impact and scope analysis — what this requirement touches (SWR-3404's input).
    ANALYSIS = "analysis"
    DECOMPOSITION = "decomposition"
    UNITS = "units"
    WORKTREE = "worktree"
    #: The agent run itself: implementation and tests, inside the unit's own tree.
    RUN = "run"
    #: Verification of the unit's work, in the unit's worktree (SWR-3410).
    VERIFICATION = "verification"
    INTEGRATION = "integration"
    REVIEW = "review"

    @property
    def label(self) -> str:
        """``Decomposition`` — what a progress line prints."""
        return self.value.capitalize()

    @property
    def blocks_on_failure(self) -> bool:
        """Whether failing here leaves nothing to review, and therefore blocks.

        The stages before an agent has produced anything block; the ones after it
        has go to ``Review``, because a failed verification and a conflicting
        integration both leave work a human can look at (SWR-3413).
        """
        return self not in {FlowStage.VERIFICATION, FlowStage.INTEGRATION}


#: Every stage, in flow order.
FLOW_STAGES: tuple[FlowStage, ...] = tuple(FlowStage)

#: Stages that happen once per flow rather than once per unit. Only these are
#: recorded as "completed" in the persisted progress: a per-unit stage is
#: recovered from the finished units instead, which is the finer answer.
_ONCE_PER_FLOW: frozenset[FlowStage] = frozenset(
    {
        FlowStage.SNAPSHOT,
        FlowStage.ANALYSIS,
        FlowStage.DECOMPOSITION,
        FlowStage.UNITS,
        FlowStage.INTEGRATION,
        FlowStage.REVIEW,
    },
)


class StagePhase(StrEnum):
    """What happened to a stage."""

    STARTED = "started"
    FINISHED = "finished"
    FAILED = "failed"
    #: Nothing to do — and the reason is stated, never silence.
    SKIPPED = "skipped"
    #: A failed attempt is being repeated inside the retry bound (SWR-3415).
    RETRYING = "retrying"


@traces(SWR.SWR_3413)
class StageEvent(BaseModel):
    """One thing that happened to one stage, as it happened."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    stage: FlowStage
    phase: StagePhase
    at: dt.datetime
    unit_id: str | None = None
    run_id: str | None = None
    detail: str = ""
    #: Set on a terminal phase, ``None`` on ``started``.
    duration_s: float | None = None

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise FlowError("a stage event carries an aware timestamp, never a naive one")
        return value

    @property
    def message(self) -> str:
        """``SWR-3413 decomposition: finished — 3 unit(s)``."""
        where = f"/{self.unit_id}" if self.unit_id else ""
        because = f" — {self.detail}" if self.detail else ""
        return f"{self.req_id}{where} {self.stage}: {self.phase}{because}"


@traces(SWR.SWR_3413)
class StageOutcome(BaseModel):
    """One stage, from its start to its end, with what it cost.

    Duration is a field rather than something a reader subtracts: SWR-3413's
    first acceptance criterion is that a stage is observable *with its duration*,
    and a user watching a flow needs to know that decomposition took forty
    seconds while the run has taken twenty minutes.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    stage: FlowStage
    started_at: dt.datetime
    finished_at: dt.datetime
    ok: bool = True
    skipped: bool = False
    unit_id: str | None = None
    run_id: str | None = None
    detail: str = ""
    failure_reason: str = ""

    @model_validator(mode="after")
    def _a_failure_states_why(self) -> Self:
        if not self.ok and not self.failure_reason.strip():
            raise FlowError(f"{self.stage}: a failed stage names the reason (SWR-3413)")
        if self.skipped and not self.detail.strip():
            raise FlowError(f"{self.stage}: a skipped stage says why it had nothing to do")
        return self

    @property
    def duration_s(self) -> float:
        """Wall-clock cost of this stage."""
        return (self.finished_at - self.started_at).total_seconds()

    @property
    def message(self) -> str:
        """One line for a progress list."""
        state = "skipped" if self.skipped else ("ok" if self.ok else "failed")
        said = self.failure_reason or self.detail
        because = f" — {said}" if said else ""
        return f"{self.stage}: {state} ({self.duration_s:.3f}s){because}"


# --------------------------------------------------------------------------
# Failure and retry (SWR-3415)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3415, SWR.SWR_3117)
class RetryPolicy(BaseModel):
    """How often a failed unit is retried, and what happens to its tree.

    Bounded and explicit: an unbounded retry lets one broken requirement burn
    capacity indefinitely, and a silent one hides the failure that is repeating.
    The bound is configuration's (``requirements.execution.retry_limit``,
    SWR-3117) and is *stated* on every failure it governs.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Automatic retries after the first attempt. ``0`` disables retrying.
    limit: int = 1
    #: Whether a failed attempt's worktree and branch survive for inspection.
    #: ``True`` by default and never flipped by the flow: the user removes a
    #: tree, never the scheduler (SWR-3415).
    keep_worktrees: bool = True

    @field_validator("limit")
    @classmethod
    def _not_negative(cls, value: int) -> int:
        if value < 0:
            raise FlowError("a retry limit is a count, never negative")
        return value

    @property
    def attempts(self) -> int:
        """How many times a unit may run in total — the first plus the retries."""
        return self.limit + 1

    @property
    def message(self) -> str:
        """The bound, stated, for the reason a blocked requirement carries."""
        return f"up to {self.attempts} attempt(s) per unit, {self.limit} retry/retries"


@traces(SWR.SWR_3415)
class UnitFailure(BaseModel):
    """One failed unit run: what failed, where the work is, and what happens next.

    It carries the tree and the branch on purpose. SWR-3415's third acceptance
    criterion is that a failed unit's worktree survives for inspection, and a
    failure record that does not name it makes that survival useless.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    unit_id: str
    run_id: str = ""
    attempt: int = 1
    reason: str
    worktree_path: str | None = None
    branch: str | None = None
    retries_used: int = 0
    retry_limit: int = 0
    #: Whether the failed attempt's tree was kept (SWR-3415).
    worktree_kept: bool = True

    @field_validator("reason")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise FlowError("a failed unit states what failed (SWR-3415)")
        return cleaned

    @property
    def exhausted(self) -> bool:
        """Whether the retry bound has been reached."""
        return self.retries_used >= self.retry_limit

    @property
    def retryable(self) -> bool:
        """Whether another automatic attempt is permitted."""
        return not self.exhausted

    @property
    def message(self) -> str:
        """One line naming the unit, the attempt, the bound and the tree."""
        where = f"; work kept at {self.worktree_path}" if self.worktree_path else ""
        return (
            f"{self.req_id}/{self.unit_id}: attempt {self.attempt} failed"
            f" ({self.retries_used}/{self.retry_limit} retries used) — {self.reason}{where}"
        )


@traces(SWR.SWR_3415)
def fail_unit(units: RequirementUnits, failure: UnitFailure) -> RequirementUnits:
    """*units* with the failed unit in ``failed``, carrying its stated reason.

    Pure, and deliberately *not* a delivery-state change: a unit state is the
    runner's business, and what happens to the requirement is decided by the
    transition function (SWR-3203) with the reason this failure states.
    """
    return units.with_state(failure.unit_id, UnitState.FAILED, failure_reason=failure.reason)


@traces(SWR.SWR_3415)
def retry_unit(units: RequirementUnits, unit_id: str, *, limit: int) -> RequirementUnits:
    """*units* with *unit_id* queued for another attempt, its retry counted.

    Refuses when the bound is spent: an unbounded retry is the failure mode
    SWR-3415 exists to close, and silently declining would leave the unit looking
    retryable for ever.
    """
    unit = units.require(unit_id)
    if unit.retries >= limit:
        raise FlowError(
            f"{units.req_id}/{unit_id}: {unit.retries} retry/retries already used of {limit};"
            " an exhausted unit blocks its requirement rather than running again (SWR-3415)",
        )
    return units.replaced(
        unit.evolve(
            state=UnitState.PENDING,
            retries=unit.retries + 1,
            retry_limit=limit,
            # The reason stays readable: the next attempt starts from a unit whose
            # last failure is still on it, which is what a user inspecting the kept
            # worktree is looking at.
            failure_reason=unit.failure_reason,
        ),
    )


@traces(SWR.SWR_3415, SWR.SWR_3401)
def abandon_unit(units: RequirementUnits, unit_id: str, *, reason: str) -> RequirementUnits:
    """Give up on *unit_id* explicitly, keeping its runs in the history.

    An explicit action with a stated reason, never a side effect of a failure:
    :meth:`~rotaris_core.requirements.execution.units.RequirementUnits.discard`
    retires the unit and keeps its run ids, so SWR-3414's history still answers
    for it.
    """
    cleaned = reason.strip()
    if not cleaned:
        raise FlowError(f"{units.req_id}/{unit_id}: abandoning a unit states why (SWR-3415)")
    return units.discard(unit_id, reason=cleaned)


@traces(SWR.SWR_3415, SWR.SWR_3203)
def blocked_request(
    req_id: str,
    *,
    reason: str,
    actor: DeliveryActor,
    at: dt.datetime,
    requirement_hash: str = "",
    run_id: str | None = None,
    cause: TransitionCause = TransitionCause.RUN_FAILED,
) -> TransitionRequest:
    """The delivery move a stopped flow asks for: ``… → Blocked``, with its reason.

    Built here so every blocking path produces the same shape, and applied — like
    every other move — by
    :func:`~rotaris_core.requirements.delivery.transitions.apply_transition`.
    """
    return TransitionRequest(
        req_id=req_id,
        target=DeliveryState.BLOCKED,
        actor=actor,
        cause=cause,
        at=at,
        requirement_hash=requirement_hash,
        reason=reason,
        run_id=run_id,
    )


# --------------------------------------------------------------------------
# Resumability (SWR-3413's third acceptance criterion)
# --------------------------------------------------------------------------


@traces(SWR.SWR_3413, SWR.SWR_2817)
class FlowProgress(BaseModel):
    """How far a requirement's flow got, as persisted between processes.

    The idea SWR-2817 applies to interrupted sessions, at requirement
    granularity: what finished is recorded as it finishes, so a restart resumes
    instead of re-running work that is already on a branch.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    flow_id: str = ""
    #: Which delivery cycle the recorded units belong to (SWR-3417). Unit ids
    #: repeat across deliveries by design, so progress without a cycle would let
    #: the second delivery inherit the first one's "already finished" and do
    #: nothing at all.
    cycle: int = 0
    #: Once-per-flow stages that finished.
    completed: tuple[FlowStage, ...] = ()
    #: Units whose run finished — the per-unit recovery granularity.
    finished_units: tuple[str, ...] = ()
    #: ``unit_id → run_id`` of the run that finished it.
    unit_runs: dict[str, str] = {}
    failed_stage: FlowStage | None = None
    reason: str = ""
    updated_at: dt.datetime | None = None

    def with_stage(self, stage: FlowStage) -> FlowProgress:
        """This progress with *stage* recorded as finished."""
        if stage in self.completed or stage not in _ONCE_PER_FLOW:
            return self
        return self.model_copy(update={"completed": (*self.completed, stage)})

    def with_unit(self, unit_id: str, run_id: str) -> FlowProgress:
        """This progress with *unit_id* recorded as finished by *run_id*."""
        if unit_id in self.finished_units:
            return self
        return self.model_copy(
            update={
                "finished_units": (*self.finished_units, unit_id),
                "unit_runs": {**self.unit_runs, unit_id: run_id},
            },
        )

    def opened(self, cycle: int) -> FlowProgress:
        """This progress carried into delivery *cycle*, unit completions dropped.

        The stages this process already finished stay: they belong to the flow in
        hand. What cannot cross the boundary is which *units* are done — the new
        cycle re-plans the same ids (SWR-3417), so keeping them would mark every
        unit of the new delivery finished before it ran.
        """
        if cycle == self.cycle:
            return self
        return self.model_copy(
            update={"cycle": cycle, "finished_units": (), "unit_runs": {}},
        )

    def done(self, stage: FlowStage) -> bool:
        """Whether *stage* already finished in an earlier process."""
        return stage in self.completed

    @property
    def empty(self) -> bool:
        """Whether nothing at all has been recorded for this requirement."""
        return not self.completed and not self.finished_units

    def to_payload(self) -> dict[str, JsonValue]:
        """The persisted form — operational only, no requirement text (SWR-3114)."""
        payload: dict[str, JsonValue] = {
            "schema_version": FLOW_STATE_SCHEMA_VERSION,
            "req_id": self.req_id,
            "completed": [str(stage) for stage in self.completed],
            "finished_units": list(self.finished_units),
            "unit_runs": dict(self.unit_runs),
        }
        if self.cycle:
            payload["cycle"] = self.cycle
        if self.flow_id:
            payload["flow_id"] = self.flow_id
        if self.failed_stage is not None:
            payload["failed_stage"] = str(self.failed_stage)
        if self.reason:
            payload["reason"] = self.reason
        if self.updated_at is not None:
            payload["updated_at"] = self.updated_at.isoformat()
        return payload

    @classmethod
    def from_payload(cls, payload: dict[str, JsonValue]) -> Self:
        """Persisted flow state, read back. An unknown stage is dropped, not fatal."""
        return cls(
            req_id=str(payload.get("req_id") or ""),
            flow_id=str(payload.get("flow_id") or ""),
            # No cycle in the file means it was written before SWR-3417, and
            # cycle 0 is exactly what it recorded: a first delivery.
            cycle=_cycle(payload.get("cycle")),
            completed=_stages(payload.get("completed")),
            finished_units=_names(payload.get("finished_units")),
            unit_runs=_pairs(payload.get("unit_runs")),
            failed_stage=_stage(payload.get("failed_stage")),
            reason=str(payload.get("reason") or ""),
            updated_at=_moment(payload.get("updated_at")),
        )


def _cycle(value: JsonValue) -> int:
    """A persisted delivery cycle — anything unreadable is the first one."""
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _stage(value: JsonValue) -> FlowStage | None:
    if not isinstance(value, str):
        return None
    try:
        return FlowStage(value)
    except ValueError:
        return None


def _stages(value: JsonValue) -> tuple[FlowStage, ...]:
    if not isinstance(value, list):
        return ()
    found = [_stage(item) for item in value]
    return tuple(stage for stage in found if stage is not None)


def _names(value: JsonValue) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(item for item in value if isinstance(item, str))


def _pairs(value: JsonValue) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(key): item for key, item in value.items() if isinstance(item, str)}


def _moment(value: JsonValue) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return dt.datetime.fromisoformat(value)
    except ValueError:
        return None


@traces(SWR.SWR_3413)
class FlowStateStore:
    """Flow progress on disk, one file per requirement.

    Outside every worktree, beside the delivery store, written atomically — the
    rules the rest of Rotaris' operational data follows, for the same reason: a
    crash leaves either the previous state or the whole new one.
    """

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    @property
    def directory(self) -> Path:
        """``<workspace>/.rotaris/requirements/flows/``."""
        return requirements_state_dir(self._workspace) / FLOW_STATE_SUBDIRNAME

    def path_for(self, req_id: str) -> Path:
        """The file *req_id*'s flow state lives in."""
        from rotaris_core.requirements.delivery.store import record_filename

        return self.directory / record_filename(req_id)

    def save(self, progress: FlowProgress) -> Path:
        """Persist *progress*, atomically. Returns where it landed."""
        path = self.path_for(progress.req_id)
        atomic_write_text(
            path,
            json.dumps(progress.to_payload(), indent=2, sort_keys=True) + "\n",
        )
        return path

    def load(self, req_id: str) -> FlowProgress:
        """The recorded progress of *req_id*, or a blank one."""
        path = self.path_for(req_id)
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            return FlowProgress(req_id=req_id)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return FlowProgress(req_id=req_id)
        if not isinstance(payload, dict):
            return FlowProgress(req_id=req_id)
        recovered = FlowProgress.from_payload(payload)
        return recovered if recovered.req_id == req_id else FlowProgress(req_id=req_id)

    def clear(self, req_id: str) -> None:
        """Forget a finished flow's progress. Never touches history (SWR-3414)."""
        try:
            self.path_for(req_id).unlink()
        except OSError:
            return


# --------------------------------------------------------------------------
# The flow
# --------------------------------------------------------------------------


@runtime_checkable
class TransitionWriter(Protocol):
    """The one door delivery state changes go through (SWR-3203), and the trail.

    A protocol, so the flow can be driven with a recording fake in a unit test —
    and so this module structurally cannot reach a delivery record any other way.
    :class:`~rotaris_core.requirements.execution.snapshot.ExecutionTransitions`
    satisfies it; a bare
    :class:`~rotaris_core.requirements.delivery.transitions.DeliveryTransitions`
    deliberately does **not**, because it can neither refuse a ``Done`` whose
    specification moved (SWR-3403) nor record what it did (SWR-3213), and a flow
    that accepted one would lose both without anything failing.
    """

    #: Whether ``Review → Done`` is wrapped in
    #: :func:`~rotaris_core.requirements.execution.snapshot.specification_guard`.
    #: :class:`RequirementFlow` refuses a writer that answers ``False``.
    enforces_specification_guard: bool

    def apply(self, request: TransitionRequest) -> TransitionOutcome:
        """Apply *request*, or refuse it and say which precondition failed."""
        ...

    def record_event(self, event: AuditEvent) -> AuditEvent:
        """Append one event to the requirement's audit trail (SWR-3213)."""
        ...


@traces(SWR.SWR_3413)
class FlowResult(BaseModel):
    """One whole run of the flow: every stage, every event, and where it ended."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    flow_id: str = ""
    stages: tuple[StageOutcome, ...] = ()
    events: tuple[StageEvent, ...] = ()
    units: RequirementUnits | None = None
    plan: DecompositionPlan | None = None
    run_ids: tuple[str, ...] = ()
    verifications: tuple[UnitVerification, ...] = ()
    failures: tuple[UnitFailure, ...] = ()
    review: ReviewView | None = None
    final_state: DeliveryState = DeliveryState.READY
    failed_stage: FlowStage | None = None
    reason: str = ""
    #: Stages recovered from persisted state rather than re-run (SWR-3413).
    resumed: tuple[FlowStage, ...] = ()

    @model_validator(mode="after")
    def _a_stop_names_its_stage(self) -> Self:
        if self.failed_stage is not None and not self.reason.strip():
            raise FlowError(
                f"{self.req_id}: a flow that stopped names the stage and the reason (SWR-3413)",
            )
        if self.failed_stage is None and self.final_state is DeliveryState.BLOCKED:
            raise FlowError(
                f"{self.req_id}: a Blocked requirement names the stage that blocked it",
            )
        return self

    @property
    def succeeded(self) -> bool:
        """Whether the flow reached a reviewable result."""
        return self.failed_stage is None and self.final_state is DeliveryState.REVIEW

    @property
    def stage_names(self) -> tuple[FlowStage, ...]:
        """The stages that ran, in the order they ran — what a test asserts on."""
        return tuple(outcome.stage for outcome in self.stages)

    def outcome_for(self, stage: FlowStage) -> StageOutcome | None:
        """The last outcome recorded for *stage*, or ``None``."""
        return next((one for one in reversed(self.stages) if one.stage is stage), None)

    def outcomes_for(self, stage: FlowStage) -> tuple[StageOutcome, ...]:
        """Every outcome recorded for *stage* — one per unit for a per-unit stage."""
        return tuple(one for one in self.stages if one.stage is stage)

    def events_for(self, stage: FlowStage) -> tuple[StageEvent, ...]:
        """Every event of one stage, in order."""
        return tuple(event for event in self.events if event.stage is stage)

    @property
    def durations(self) -> dict[FlowStage, float]:
        """``stage → seconds``, summed over the units that stage ran for."""
        totals: dict[FlowStage, float] = {}
        for outcome in self.stages:
            totals[outcome.stage] = totals.get(outcome.stage, 0.0) + outcome.duration_s
        return totals

    @property
    def message(self) -> str:
        """One line: where the requirement ended, and why."""
        if self.failed_stage is None:
            return f"{self.req_id}: {self.final_state.label}"
        return f"{self.req_id}: {self.final_state.label} at {self.failed_stage} — {self.reason}"


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


@dataclass(frozen=True, slots=True)
class _Wiring:
    """Every collaborator the flow was configured with.

    One value rather than a dozen attributes, so :class:`_FlowRun` composes the
    flow's configuration without reaching into it — and so a reader can see the
    whole dependency surface of SWR-3413 in one place.
    """

    transitions: TransitionWriter
    seam: RequirementRunSeam
    history: ExecutionHistory | None
    decomposer: Decomposer | None
    assess: Callable[[CanonicalRequirement], RequirementAssessment] | None
    context_for: Callable[[ExecutionUnit, RunSnapshot], AgentContext] | None
    verify: Callable[[ExecutionUnit, RunResult], UnitVerification] | None
    integrate: Callable[[RequirementUnits, Sequence[RunResult]], IntegrationOutcome] | None
    #: How the requirement is re-read at the review (SWR-3403). Not optional: a
    #: flow that cannot re-read compares the snapshot with itself and can never
    #: detect the drift the requirement exists to catch.
    current_for: Callable[[str], CanonicalRequirement]
    retry: RetryPolicy
    actor: DeliveryActor
    clock: Callable[[], dt.datetime]
    observer: Callable[[StageEvent], None] | None
    progress: FlowStateStore | None
    #: Where the unit set is recorded as it moves (SWR-3401). Optional like every
    #: other collaborator, so a pure in-memory flow stays testable — but the one
    #: thing that makes the work visible to a reader outside this process.
    units: UnitStore | None
    #: Where each integration attempt is recorded, the failed ones included
    #: (SWR-3409).
    integrations: IntegrationLog | None


@traces(SWR.SWR_3413, SWR.SWR_3415)
class RequirementFlow:
    """Take one requirement from ``Ready`` to a reviewable result, observably.

    Every collaborator is injected and every one of them already exists: the
    snapshot is :mod:`~rotaris_core.requirements.execution.snapshot`'s, the split
    is :mod:`~rotaris_core.requirements.execution.decomposition`'s, the units are
    :mod:`~rotaris_core.requirements.execution.units`', the worktree and the run
    are the seam's (SWR-3416), the history is SWR-3414's, and the delivery state
    is the transition function's. What this class owns is the *order*, the
    observation and the failure policy — which is the whole of SWR-3413.
    """

    def __init__(
        self,
        *,
        transitions: TransitionWriter,
        seam: RequirementRunSeam,
        current_for: Callable[[str], CanonicalRequirement],
        history: ExecutionHistory | None = None,
        decomposer: Decomposer | None = None,
        assess: Callable[[CanonicalRequirement], RequirementAssessment] | None = None,
        context_for: Callable[[ExecutionUnit, RunSnapshot], AgentContext] | None = None,
        verify: Callable[[ExecutionUnit, RunResult], UnitVerification] | None = None,
        integrate: (
            Callable[[RequirementUnits, Sequence[RunResult]], IntegrationOutcome] | None
        ) = None,
        retry: RetryPolicy | None = None,
        actor: DeliveryActor | None = None,
        clock: Callable[[], dt.datetime] = _utc_now,
        observer: Callable[[StageEvent], None] | None = None,
        progress: FlowStateStore | None = None,
        units: UnitStore | None = None,
        integrations: IntegrationLog | None = None,
    ) -> None:
        # The two halves of SWR-3403 are installed here or nowhere. *current_for*
        # is a required argument because a flow that cannot re-read compares the
        # snapshot with itself; the writer is checked because the ``Done``
        # refusal lives in its completion gate, and a composition that handed the
        # flow a bare DeliveryTransitions would keep every test green while the
        # requirement stopped holding.
        if not bool(getattr(transitions, "enforces_specification_guard", False)):
            raise FlowError(
                f"{type(transitions).__name__} does not enforce the specification guard:"
                " a requirement edited during its run could then be accepted as Done"
                " (SWR-3403). Build the writer with"
                " rotaris_core.requirements.execution.snapshot.ExecutionTransitions.",
            )
        self._wiring = _Wiring(
            transitions=transitions,
            seam=seam,
            history=history,
            decomposer=decomposer,
            assess=assess,
            context_for=context_for,
            verify=verify,
            integrate=integrate,
            current_for=current_for,
            retry=retry if retry is not None else RetryPolicy(),
            actor=actor if actor is not None else DeliveryActor.system("requirement-flow"),
            clock=clock,
            observer=observer,
            progress=progress,
            units=units,
            integrations=integrations,
        )

    @property
    def retry_policy(self) -> RetryPolicy:
        """The bound failed units are retried against (SWR-3415)."""
        return self._wiring.retry

    @property
    def actor(self) -> DeliveryActor:
        """Who the flow's transitions are recorded as (SWR-3213)."""
        return self._wiring.actor

    @traces(SWR.SWR_3413, SWR.SWR_3415)
    def start(
        self,
        requirement: CanonicalRequirement,
        *,
        base_commit: str,
        flow_id: str = "",
        resume: bool = True,
    ) -> FlowResult:
        """Run the whole flow for *requirement*, and report every stage of it.

        Never raises for a requirement whose flow failed: a stopped flow is a
        *result* the board has to show and the user has to act on, so every
        failure path returns a :class:`FlowResult` whose ``failed_stage`` names
        where it stopped and whose ``final_state`` is the state the requirement
        was actually moved into.
        """
        return _FlowRun(
            self._wiring,
            requirement,
            base_commit=base_commit,
            flow_id=flow_id,
            resume=resume,
        ).execute()


class _FlowRun:
    """One execution of the flow, with the bookkeeping it needs.

    Split from :class:`RequirementFlow` so one configured flow can drive two
    requirements at once without them sharing a stage list.
    """

    def __init__(
        self,
        wiring: _Wiring,
        requirement: CanonicalRequirement,
        *,
        base_commit: str,
        flow_id: str,
        resume: bool,
    ) -> None:
        self._w = wiring
        self._requirement = requirement
        self._base_commit = base_commit
        self._req_id = requirement.req_id
        self._flow_id = flow_id or f"flow-{requirement.req_id}"
        self._events: list[StageEvent] = []
        self._stages: list[StageOutcome] = []
        self._failures: list[UnitFailure] = []
        self._verifications: list[UnitVerification] = []
        self._run_ids: list[str] = []
        self._results: list[RunResult] = []
        self._resumed: list[FlowStage] = []
        store = wiring.progress
        loaded = (
            store.load(requirement.req_id)
            if store is not None and resume
            else FlowProgress(req_id=requirement.req_id)
        )
        # This attempt's own failure, or none. What stopped the *previous* one is
        # in the audit trail, where it belongs; carried here it would outlive the
        # condition that caused it — a snapshot that failed for want of a commit
        # would still be the reason on file after the commit was made, and every
        # surface reading this progress would report a problem nobody has.
        self._state = loaded.model_copy(
            update={"flow_id": self._flow_id, "failed_stage": None, "reason": ""},
        )
        # Whether a *previous* process left progress behind, captured before this
        # one records any of its own. `_plan_cycle` needs the question answered
        # as it stood at load: by the time it runs, this flow has already
        # recorded its own decomposition stage (SWR-3417, SWR-3611).
        self._interrupted = bool(loaded.completed or loaded.finished_units)

    # -- observation --------------------------------------------------------

    def _emit(
        self,
        stage: FlowStage,
        phase: StagePhase,
        *,
        detail: str = "",
        unit_id: str | None = None,
        run_id: str | None = None,
        duration_s: float | None = None,
    ) -> None:
        event = StageEvent(
            req_id=self._req_id,
            stage=stage,
            phase=phase,
            at=self._w.clock(),
            unit_id=unit_id,
            run_id=run_id,
            detail=detail,
            duration_s=duration_s,
        )
        self._events.append(event)
        if self._w.observer is not None:
            self._w.observer(event)

    def _begin(self, stage: FlowStage, *, unit_id: str | None = None) -> dt.datetime:
        at = self._w.clock()
        self._emit(stage, StagePhase.STARTED, unit_id=unit_id)
        return at

    def _finish(
        self,
        stage: FlowStage,
        started: dt.datetime,
        *,
        detail: str = "",
        unit_id: str | None = None,
        run_id: str | None = None,
        skipped: bool = False,
    ) -> None:
        outcome = StageOutcome(
            stage=stage,
            started_at=started,
            finished_at=self._w.clock(),
            ok=True,
            skipped=skipped,
            unit_id=unit_id,
            run_id=run_id,
            detail=detail,
        )
        self._stages.append(outcome)
        self._emit(
            stage,
            StagePhase.SKIPPED if skipped else StagePhase.FINISHED,
            detail=detail,
            unit_id=unit_id,
            run_id=run_id,
            duration_s=outcome.duration_s,
        )
        self._save_stage(stage)

    def _record_failure(
        self,
        stage: FlowStage,
        started: dt.datetime,
        reason: str,
        *,
        unit_id: str | None = None,
        run_id: str | None = None,
    ) -> None:
        outcome = StageOutcome(
            stage=stage,
            started_at=started,
            finished_at=self._w.clock(),
            ok=False,
            unit_id=unit_id,
            run_id=run_id,
            failure_reason=reason,
        )
        self._stages.append(outcome)
        self._emit(
            stage,
            StagePhase.FAILED,
            detail=reason,
            unit_id=unit_id,
            run_id=run_id,
            duration_s=outcome.duration_s,
        )

    def _save_stage(self, stage: FlowStage) -> None:
        self._state = self._state.with_stage(stage).model_copy(
            update={"updated_at": self._w.clock()},
        )
        if self._w.progress is not None and stage in _ONCE_PER_FLOW:
            self._w.progress.save(self._state)

    def _save_unit(self, unit_id: str, run_id: str) -> None:
        self._state = self._state.with_unit(unit_id, run_id).model_copy(
            update={"updated_at": self._w.clock()},
        )
        if self._w.progress is not None:
            self._w.progress.save(self._state)

    @traces(SWR.SWR_3401)
    def _save_units(self, units: RequirementUnits) -> RequirementUnits:
        """Record the unit set as it now stands, and hand it straight back.

        Written after every state change rather than once at the end: the board
        reads this file (SWR-3216) while the flow is still running, and a set
        persisted only on completion would leave a requirement that is executing
        looking like one that never started.
        """
        if self._w.units is not None:
            self._w.units.save(units)
        return units

    # -- delivery state: through the transition function, and nowhere else ---

    def _move(
        self,
        target: DeliveryState,
        *,
        cause: TransitionCause,
        reason: str = "",
        detail: str = "",
        run_id: str | None = None,
    ) -> TransitionOutcome:
        return self._w.transitions.apply(
            TransitionRequest(
                req_id=self._req_id,
                target=target,
                actor=self._w.actor,
                cause=cause,
                at=self._w.clock(),
                requirement_hash=self._requirement.current_hash,
                reason=reason,
                run_id=run_id,
                detail=detail,
            ),
        )

    def _terminate(
        self,
        stage: FlowStage,
        reason: str,
        *,
        run_id: str | None = None,
        units: RequirementUnits | None = None,
        plan: DecompositionPlan | None = None,
        review: ReviewView | None = None,
    ) -> FlowResult:
        """Move the requirement somewhere actionable and report the stop.

        *reason* is passed on **whole and unprefixed**. A blocked requirement's
        reason is read by a person, on a board, under that requirement's id, and
        every prefix added on the way there costs a clause of the sentence that
        actually says what to do: ``snapshot failed: the requirement snapshot
        could not be captured: …`` named the mechanism three times and the remedy
        never. The stage is not lost by that — it is carried as a *field* rather
        than as more prose: :attr:`FlowResult.failed_stage` holds it for a
        caller, :attr:`FlowResult.message` joins the two back together for a log
        line, and the transition's ``detail`` records it on the audit trail.
        """
        where = f"failed at the {stage.label} stage"
        moved = (
            self._move(
                DeliveryState.BLOCKED,
                cause=TransitionCause.RUN_FAILED,
                reason=reason,
                detail=where,
                run_id=run_id,
            )
            if stage.blocks_on_failure
            else self._move(
                DeliveryState.REVIEW,
                cause=TransitionCause.RUN_COMPLETED,
                reason=reason,
                detail=where,
                run_id=run_id,
            )
        )
        self._state = self._state.model_copy(
            update={
                "failed_stage": stage,
                "reason": reason,
                "updated_at": self._w.clock(),
            },
        )
        if self._w.progress is not None:
            self._w.progress.save(self._state)
        return FlowResult(
            req_id=self._req_id,
            flow_id=self._flow_id,
            stages=tuple(self._stages),
            events=tuple(self._events),
            units=units,
            plan=plan,
            run_ids=tuple(self._run_ids),
            verifications=tuple(self._verifications),
            failures=tuple(self._failures),
            review=review,
            # The record the writer answered with — never the target. A refused
            # move did not happen, and reporting it as if it had is the drift
            # SWR-3203 exists to prevent.
            final_state=moved.record.state,
            failed_stage=stage,
            reason=reason if moved.accepted else f"{reason} (and the move was refused)",
            resumed=tuple(self._resumed),
        )

    def _stop(
        self,
        stage: FlowStage,
        started: dt.datetime,
        reason: str,
        *,
        unit_id: str | None = None,
        run_id: str | None = None,
        units: RequirementUnits | None = None,
        plan: DecompositionPlan | None = None,
        review: ReviewView | None = None,
    ) -> FlowResult:
        """Record the failure of *stage* and end the flow there."""
        self._record_failure(stage, started, reason, unit_id=unit_id, run_id=run_id)
        return self._terminate(stage, reason, run_id=run_id, units=units, plan=plan, review=review)

    # -- the stages ---------------------------------------------------------

    def execute(self) -> FlowResult:
        """Drive every stage in order, stopping at the first one that fails."""
        snapshot_started = self._begin(FlowStage.SNAPSHOT)
        try:
            snapshot = self._capture(f"{self._flow_id}-snapshot")
        except Exception as exc:  # noqa: BLE001 - a failed capture stops the flow, not the process.
            # The capture's own sentence, not a wrapper around it. ``capture_snapshot``
            # refuses in words a user can act on ("make an initial commit, then release
            # it again"); prefixing that with "the requirement snapshot could not be
            # captured" buried the remedy behind the mechanism. The stage is still
            # named — as ``failed_stage``, which is a field rather than a prefix.
            return self._stop(
                FlowStage.SNAPSHOT,
                snapshot_started,
                str(exc).strip() or "the requirement snapshot could not be captured",
            )
        started = self._move(
            DeliveryState.RUNNING,
            cause=TransitionCause.RUN_STARTED,
            detail=f"{self._flow_id} started",
        )
        if not started.accepted:
            refusal = started.refusal.message if started.refusal is not None else "refused"
            return self._stop(
                FlowStage.SNAPSHOT,
                snapshot_started,
                f"the requirement could not be moved into Running: {refusal}",
            )
        self._finish(
            FlowStage.SNAPSHOT,
            snapshot_started,
            detail=f"captured {snapshot.requirement_hash} at {snapshot.base_commit}",
        )

        assessment, stopped = self._analyse()
        if stopped is not None:
            return stopped

        plan, stopped = self._decompose(assessment)
        if stopped is not None or plan is None:
            return stopped if stopped is not None else self._blank_stop()

        units_started = self._begin(FlowStage.UNITS)
        try:
            units = self._plan_cycle(plan)
        except UnitError as exc:
            return self._stop(FlowStage.UNITS, units_started, str(exc), plan=plan)
        units = self._save_units(self._recover(units))
        self._finish(
            FlowStage.UNITS,
            units_started,
            detail=(
                f"{units.count} unit(s): {', '.join(units.ids)}"
                + (f" (delivery cycle {units.cycle + 1})" if units.cycle else "")
            ),
        )

        units, stopped = self._run_units(units, plan)
        if stopped is not None:
            return stopped

        stopped = self._integrate(units, plan)
        if stopped is not None:
            return stopped

        return self._review(units, snapshot, plan)

    def _blank_stop(self) -> FlowResult:  # pragma: no cover - unreachable guard
        return self._terminate(FlowStage.DECOMPOSITION, "no plan was produced")

    def _capture(self, run_id: str, *, unit_id: str | None = None) -> RunSnapshot:
        """One snapshot of the held requirement — never a re-read (SWR-3402)."""
        return capture_snapshot(
            self._requirement,
            run_id=run_id,
            base_commit=self._base_commit,
            at=self._w.clock(),
            unit_id=unit_id,
        )

    def _analyse(self) -> tuple[RequirementAssessment | None, FlowResult | None]:
        """Impact and scope analysis, or a stated reason there was none."""
        started = self._begin(FlowStage.ANALYSIS)
        if self._w.assess is None:
            self._finish(
                FlowStage.ANALYSIS,
                started,
                detail=(
                    "no impact and scope analysis is configured; the requirement is"
                    " assessed as one change"
                ),
                skipped=True,
            )
            return None, None
        try:
            assessment = self._w.assess(self._requirement)
        except Exception as exc:  # noqa: BLE001 - an analysis failure stops the flow.
            return None, self._stop(
                FlowStage.ANALYSIS,
                started,
                f"impact and scope analysis failed: {type(exc).__name__}: {exc}",
            )
        self._finish(
            FlowStage.ANALYSIS,
            started,
            detail=(
                f"{assessment.affected_components} component(s),"
                f" {assessment.independent_changes} independent change(s)"
            ),
        )
        return assessment, None

    def _decompose(
        self,
        assessment: RequirementAssessment | None,
    ) -> tuple[DecompositionPlan | None, FlowResult | None]:
        """The split, if any — and the rejection when the planner answered badly."""
        started = self._begin(FlowStage.DECOMPOSITION)
        if self._w.decomposer is None:
            plan = single_unit_plan(
                self._req_id,
                requirement_hash=self._requirement.current_hash,
                title=self._requirement.title,
                rationale=f"{self._req_id} runs as one unit: no decomposer is configured",
                at=self._w.clock(),
            )
            self._finish(
                FlowStage.DECOMPOSITION,
                started,
                detail="no decomposer is configured; the requirement runs as one unit",
                skipped=True,
            )
            return plan, None
        result = self._w.decomposer.decompose(self._requirement, assessment)
        if result.plan is None:
            return None, self._stop(FlowStage.DECOMPOSITION, started, result.message)
        self._finish(FlowStage.DECOMPOSITION, started, detail=result.plan.summary)
        return result.plan, None

    @traces(SWR.SWR_3417, SWR.SWR_3401)
    def _plan_cycle(self, plan: DecompositionPlan) -> RequirementUnits:
        """This plan placed in the requirement's delivery history, never over it.

        The stored set decides which delivery this is, and nothing else has to:

        - **nothing stored, or the stored cycle still owes work** — this flow is
          that cycle, resumed or restarted; the plan re-derives its ids and the
          runs already recorded against them are carried forward
          (:meth:`~…units.RequirementUnits.continued`);
        - **the stored cycle finished every unit, and no previous process left
          progress behind** — it delivered cleanly, and this is the requirement
          being delivered *again*; the previous units are retired and the new
          ones open the next cycle
          (:meth:`~…units.RequirementUnits.opened`).

        Without this the second delivery planned from nothing and the first
        ``save`` of the run replaced the file, taking the first delivery's
        ``run_ids`` with it (SWR-3417, SWR-3401's fourth acceptance criterion).

        **"Finished every unit" is not on its own enough to mean "delivered".**
        A process that ran every unit and died before it could finalise leaves
        exactly that picture — and treating it as a new delivery would re-run
        every unit of work that is already sitting on a branch, which is the one
        thing SWR-3611 exists to prevent. The progress store settles it: it is
        cleared on success, so progress left behind means the previous attempt
        did *not* get to the end, and this flow is that attempt resuming.
        """
        specs = plan.to_specs()
        if self._w.units is None:
            return plan.to_units()
        stored = self._w.units.load(self._req_id)
        redelivering = stored.complete and not self._interrupted
        units = stored.opened(specs) if redelivering else stored.continued(specs)
        self._state = self._state.opened(units.cycle)
        return units

    def _recover(self, units: RequirementUnits) -> RequirementUnits:
        """Mark the units a previous process already finished (SWR-3413).

        Unit ids are derived, not drawn (SWR-3401), so the same plan produces the
        same ids after a restart and the recorded finished ones still match. That
        is also why the *cycle* has to agree: the ids repeat across deliveries
        (SWR-3417), so progress belonging to an earlier one would match by id and
        finish the new delivery before it started.
        """
        if self._state.cycle != units.cycle:
            return units
        recovered = units
        for unit_id in self._state.finished_units:
            if recovered.get(unit_id) is None:
                continue
            run_id = self._state.unit_runs.get(unit_id, "")
            if run_id:
                recovered = recovered.with_run(unit_id, run_id)
                if run_id not in self._run_ids:
                    self._run_ids.append(run_id)
            recovered = recovered.with_state(unit_id, UnitState.FINISHED)
            for stage in (FlowStage.WORKTREE, FlowStage.RUN, FlowStage.VERIFICATION):
                if stage not in self._resumed:
                    self._resumed.append(stage)
        return recovered

    def _run_units(
        self,
        units: RequirementUnits,
        plan: DecompositionPlan,
    ) -> tuple[RequirementUnits, FlowResult | None]:
        """Worktree, run and verify every unit in dependency order.

        One at a time and in the order
        :meth:`~rotaris_core.requirements.execution.units.RequirementUnits.ready`
        yields: *how many* run at once is the scheduler's decision (SWR-3412,
        SWR-3406), not the conductor's.
        """
        budget = (len(units.ids) + 1) * (self._w.retry.attempts + 1)
        while units.ready():
            budget -= 1
            if budget < 0:  # pragma: no cover - defensive; the graph is validated
                return units, self._stop(
                    FlowStage.RUN,
                    self._w.clock(),
                    "the flow stopped making progress on the remaining units",
                    units=units,
                    plan=plan,
                )
            units, stopped = self._drive_unit(units.ready()[0].unit_id, units, plan)
            self._save_units(units)
            if stopped is not None:
                return units, stopped
        return units, None

    def _drive_unit(
        self,
        unit_id: str,
        units: RequirementUnits,
        plan: DecompositionPlan,
    ) -> tuple[RequirementUnits, FlowResult | None]:
        """One unit: its worktree, its run, its verification — and its retries."""
        unit = units.require(unit_id)
        attempt = unit.retries + 1
        # The cycle is part of the run id from the second delivery on. Without it
        # a re-delivery of an unchanged plan mints the *previous* delivery's run
        # ids, and the history would read one run where two happened (SWR-3417).
        again = f"-c{unit.cycle + 1}" if unit.cycle else ""
        run_id = f"{self._flow_id}{again}-{unit_id}-a{attempt}"
        snapshot = self._capture(run_id, unit_id=unit_id)
        if self._w.history is not None:
            self._w.history.open(
                snapshot,
                attempt=attempt,
                agent=unit.agent,
                cycle=unit.cycle,
            )

        prompt = ""
        if self._w.context_for is not None:
            prompt = self._w.context_for(unit, snapshot).render()

        worktree_started = self._begin(FlowStage.WORKTREE, unit_id=unit_id)
        result = self._w.seam.start(
            snapshot=snapshot,
            isolation_request=unit_isolation(
                self._req_id,
                unit_id,
                run_id=run_id,
                attempt=attempt,
                cycle=unit.cycle,
            ),
            prompt=prompt,
            agent=unit.agent,
            attempt=attempt,
        )
        self._results.append(result)
        self._run_ids.append(run_id)
        units = units.with_run(unit_id, run_id)
        if self._w.history is not None:
            self._w.history.complete(result, agent=unit.agent, cycle=unit.cycle)

        if result.workspace is None:
            return self._after_failure(
                units,
                unit_id,
                plan,
                stage=FlowStage.WORKTREE,
                started=worktree_started,
                run_id=run_id,
                attempt=attempt,
                reason=result.failure_reason or "no worktree was provided for this run",
                workspace_path=None,
                branch=None,
            )
        self._finish(
            FlowStage.WORKTREE,
            worktree_started,
            detail=f"{result.workspace.branch} @ {result.workspace.path}",
            unit_id=unit_id,
            run_id=run_id,
        )

        run_started = self._begin(FlowStage.RUN, unit_id=unit_id)
        if result.outcome is not RunOutcome.SUCCEEDED:
            return self._after_failure(
                units,
                unit_id,
                plan,
                stage=FlowStage.RUN,
                started=run_started,
                run_id=run_id,
                attempt=attempt,
                reason=result.failure_reason or f"the run ended {result.outcome}",
                workspace_path=result.workspace.path,
                branch=result.workspace.branch,
            )
        changed = len(result.report.changed_files) if result.report is not None else 0
        self._finish(
            FlowStage.RUN,
            run_started,
            detail=f"{changed} file(s) changed",
            unit_id=unit_id,
            run_id=run_id,
        )

        stopped = self._verify(units, unit_id, result, plan, run_id=run_id)
        if stopped is not None:
            return units, stopped

        units = units.with_state(unit_id, UnitState.FINISHED)
        self._save_unit(unit_id, run_id)
        return units, None

    def _verify(
        self,
        units: RequirementUnits,
        unit_id: str,
        result: RunResult,
        plan: DecompositionPlan,
        *,
        run_id: str,
    ) -> FlowResult | None:
        """Verification of one unit's work — ``None`` when it may proceed."""
        started = self._begin(FlowStage.VERIFICATION, unit_id=unit_id)
        if self._w.verify is None:
            report = result.report
            measured = report.verified if report is not None else None
            if measured is False:
                return self._stop(
                    FlowStage.VERIFICATION,
                    started,
                    (report.verification_detail if report is not None else "")
                    or "the run reported a failed verification",
                    unit_id=unit_id,
                    run_id=run_id,
                    units=units,
                    plan=plan,
                )
            self._finish(
                FlowStage.VERIFICATION,
                started,
                detail=(
                    "the run reported its own verification"
                    if measured
                    else "nothing verified this run"
                ),
                unit_id=unit_id,
                run_id=run_id,
                skipped=measured is None,
            )
            return None
        verification = self._w.verify(units.require(unit_id), result)
        self._verifications.append(verification)
        if verification.verified is False:
            return self._stop(
                FlowStage.VERIFICATION,
                started,
                verification.detail,
                unit_id=unit_id,
                run_id=run_id,
                units=units,
                plan=plan,
            )
        self._finish(
            FlowStage.VERIFICATION,
            started,
            detail=verification.detail,
            unit_id=unit_id,
            run_id=run_id,
            skipped=verification.verified is None,
        )
        return None

    def _after_failure(
        self,
        units: RequirementUnits,
        unit_id: str,
        plan: DecompositionPlan,
        *,
        stage: FlowStage,
        started: dt.datetime,
        run_id: str,
        attempt: int,
        reason: str,
        workspace_path: str | None,
        branch: str | None,
    ) -> tuple[RequirementUnits, FlowResult | None]:
        """Retry within the bound, or block the requirement naming the failure.

        The failed unit's tree is never removed — nothing in this module deletes
        one — and the failure is recorded *on the unit*, so a requirement can
        never sit in ``Running`` with a unit that quietly vanished (SWR-3415).
        """
        policy = self._w.retry
        unit = units.require(unit_id)
        failure = UnitFailure(
            req_id=self._req_id,
            unit_id=unit_id,
            run_id=run_id,
            attempt=attempt,
            reason=reason,
            worktree_path=workspace_path,
            branch=branch,
            retries_used=unit.retries,
            retry_limit=policy.limit,
            worktree_kept=policy.keep_worktrees,
        )
        self._failures.append(failure)
        self._record_failure(stage, started, failure.message, unit_id=unit_id, run_id=run_id)
        units = fail_unit(units, failure)
        if failure.retryable:
            self._emit(
                stage,
                StagePhase.RETRYING,
                detail=f"{reason}; {policy.message}",
                unit_id=unit_id,
                run_id=run_id,
            )
            return retry_unit(units, unit_id, limit=policy.limit), None
        return units, self._terminate(
            stage,
            (
                f"{failure.message}; retries are exhausted ({policy.message}) and the"
                " work was kept for inspection"
            ),
            run_id=run_id,
            units=units,
            plan=plan,
        )

    def _integrate(
        self,
        units: RequirementUnits,
        plan: DecompositionPlan,
    ) -> FlowResult | None:
        """Where a requirement's work leaves its worktrees — ``None`` when the flow may go on.

        The unit count is no longer decided here. It was, and the effect was that
        a one-unit requirement never reached the integrator at all — which read as
        "nothing to integrate" and meant "nothing lands" (SWR-3420). The
        integrator owns that distinction now: it builds no integration worktree
        for a lone unit, and still promotes one that verified.
        """
        started = self._begin(FlowStage.INTEGRATION)
        if self._w.integrate is None:
            self._finish(
                FlowStage.INTEGRATION,
                started,
                detail="no integrator is configured for this workspace",
                skipped=True,
            )
            return None
        try:
            integration = self._w.integrate(units, tuple(self._results))
        except Exception as exc:  # noqa: BLE001 - an integration failure is a result.
            return self._stop(
                FlowStage.INTEGRATION,
                started,
                f"integration failed: {type(exc).__name__}: {exc}",
                units=units,
                plan=plan,
            )
        # Recorded before it is judged, and whether or not it landed: a failed
        # integration names the units that collided, and that is precisely the
        # attempt somebody has to look at afterwards (SWR-3409).
        if self._w.integrations is not None:
            self._w.integrations.append(integration)
        if not integration.succeeded:
            return self._stop(
                FlowStage.INTEGRATION,
                started,
                integration.summary,
                units=units,
                plan=plan,
            )
        self._finish(FlowStage.INTEGRATION, started, detail=integration.summary)
        return None

    def _review(
        self,
        units: RequirementUnits,
        snapshot: RunSnapshot,
        plan: DecompositionPlan,
    ) -> FlowResult:
        """The last stage: compare, then ask for the one move a finished run may make.

        ``Running → Review``, never ``Done``: accepting the result is a separate
        decision with its own conditions (SWR-3215), and a specification that
        moved during the run is reported here rather than discovered later
        (SWR-3403).
        """
        started = self._begin(FlowStage.REVIEW)
        # Re-read, always. Comparing the snapshot with the requirement the flow
        # was started with would compare a value with itself, and SWR-3403 would
        # be a rule that can never fire.
        try:
            current = self._w.current_for(self._req_id)
        except Exception as exc:  # noqa: BLE001 - an unreadable source stops the flow.
            return self._stop(
                FlowStage.REVIEW,
                started,
                f"the requirement could not be re-read for the review: {exc}",
                units=units,
                plan=plan,
            )
        drift = detect_drift(snapshot, current)
        last = self._results[-1] if self._results else None
        workspace = last.workspace if last is not None else None
        review = review_for(
            drift,
            reason="" if drift.changed else "the run finished and is awaiting review",
            branch=workspace.branch if workspace is not None else None,
            worktree_path=workspace.path if workspace is not None else None,
        )
        moved = self._w.transitions.apply(
            completion_transition(
                drift,
                actor=self._w.actor,
                at=self._w.clock(),
                detail=f"{units.count} unit(s) finished",
            ),
        )
        if moved.accepted and drift.changed:
            # SWR-3403's fourth condition: the mismatch is *recorded*, with both
            # hashes in their own fields, and not left to be reconstructed from
            # the transition's detail sentence. Written after the move so the
            # trail cannot claim a drift for a transition that was refused.
            self._w.transitions.record_event(
                specification_change_event(
                    drift,
                    actor=self._w.actor,
                    at=self._w.clock(),
                    detail=f"detected at review of {self._flow_id}",
                ),
            )
        if not moved.accepted:
            refusal = moved.refusal.message if moved.refusal is not None else "refused"
            return self._stop(
                FlowStage.REVIEW,
                started,
                f"the finished run could not be moved into Review: {refusal}",
                units=units,
                plan=plan,
                review=review,
            )
        self._finish(FlowStage.REVIEW, started, detail=drift.message)
        if self._w.progress is not None:
            self._w.progress.clear(self._req_id)
        return FlowResult(
            req_id=self._req_id,
            flow_id=self._flow_id,
            stages=tuple(self._stages),
            events=tuple(self._events),
            units=units,
            plan=plan,
            run_ids=tuple(self._run_ids),
            verifications=tuple(self._verifications),
            failures=tuple(self._failures),
            review=review,
            final_state=moved.record.state,
            resumed=tuple(self._resumed),
        )
