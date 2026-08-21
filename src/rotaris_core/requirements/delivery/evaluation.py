"""Continuous requirement evaluation (SWR-3210).

A board that only refreshes when the user asks is a screenshot. The repository
moves under it constantly — commits, merges, branch switches, finished runs,
integrated worktrees — and each of those can change what is true about a
requirement. :class:`RequirementEvaluator` is the seam that turns those events
into evaluation passes and publishes *what changed*, not merely that something
did.

Four properties are load-bearing, and each is structural rather than promised:

- **Evaluation terminates.** An evaluation must not be able to trigger an
  evaluation, or the board would drive itself in a loop that no debounce can
  stop. The callable a pass runs receives an :class:`EvaluationRequest` and
  nothing else — it holds no reference to the evaluator, so there is nothing to
  call back into. A closure that captured one anyway is caught:
  :meth:`RequirementEvaluator.submit` raises
  :class:`EvaluationReentryError` when it is called from the thread that is
  running the pass. Events from *other* threads are legitimate — a commit does
  not stop happening because an evaluation is in flight — so those queue.
- **A burst is one pass.** Triggers accumulate and the pass runs once the
  debounce window has passed without a new one, so a rebase's event storm costs
  one evaluation and the request names every event that asked for it.
- **A failure changes nothing.** When the pass raises, the previous projections
  stay in place and the outcome carries the failure. A board that blanks itself
  because one evaluation crashed is worse than a board showing a slightly old
  answer, and it loses the very state the user needed to diagnose the crash.
- **Never on the UI thread.** Constructed with
  :meth:`RequirementEvaluator.off_thread` on the UI thread, the evaluator
  refuses to run a pass there — evaluation reads a repository and would freeze
  the board for as long as that takes.

Time is an argument, never a call: every method takes the moment it happens at.
That is what makes debouncing testable without sleeping and keeps this module
free of a clock it would otherwise have to inject everywhere.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
import threading
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.evidence import (  # noqa: TC001 - a Pydantic field type.
    EvidenceState,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from rotaris_core.requirements.delivery.evidence import EvidenceProjection

__all__ = [
    "ALL_EVALUATION_TRIGGERS",
    "DEFAULT_DEBOUNCE_MS",
    "EvaluationChange",
    "EvaluationEvent",
    "EvaluationFailure",
    "EvaluationOnUiThreadError",
    "EvaluationOutcome",
    "EvaluationReentryError",
    "EvaluationRequest",
    "EvaluationTrigger",
    "RequirementEvaluator",
]

#: The configuration default (SWR-3117): long enough to absorb a rebase's event
#: storm, short enough that a single commit still feels immediate.
DEFAULT_DEBOUNCE_MS = 400


@traces(SWR.SWR_3210)
class EvaluationTrigger(StrEnum):
    """A repository event that can change what is true about a requirement.

    The closed set SWR-3210 names, spelled exactly like the configuration's
    ``requirements.refresh.triggers`` vocabulary (SWR-3117) so a workspace can
    switch one off without a translation table in between.
    """

    COMMIT = "commit"
    MERGE = "merge"
    SOURCE_EDIT = "source-edit"
    BRANCH_SWITCH = "branch-switch"
    TEST_RUN = "test-run"
    RUN_COMPLETION = "run-completion"
    WORKTREE_INTEGRATION = "worktree-integration"
    #: An explicit refresh. Never debounced away entirely — a user who pressed a
    #: button gets a pass — but coalesced with a burst like any other trigger.
    MANUAL = "manual"


#: Every trigger, and the default set an evaluator listens to.
ALL_EVALUATION_TRIGGERS: tuple[EvaluationTrigger, ...] = tuple(EvaluationTrigger)


class EvaluationReentryError(RuntimeError):
    """An evaluation tried to trigger an evaluation (SWR-3210).

    Raised rather than queued: a pass that schedules its own successor does not
    terminate, and the loop would be invisible — every pass would look like it
    was answering a legitimate event.
    """


class EvaluationOnUiThreadError(RuntimeError):
    """A pass was about to run on the thread that draws the board (SWR-3210)."""


@traces(SWR.SWR_3210)
class EvaluationEvent(BaseModel):
    """One repository event asking for a re-evaluation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    trigger: EvaluationTrigger
    at: dt.datetime
    #: What happened, for the log and the outcome message.
    detail: str = ""
    #: The requirements this event can possibly have changed. Empty means "not
    #: known", which widens the pass to the whole store rather than quietly
    #: skipping requirements the event did affect (SWR-3116).
    req_ids: tuple[str, ...] = ()

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("an evaluation event carries an aware timestamp, never a naive one")
        return value


@traces(SWR.SWR_3210)
class EvaluationRequest(BaseModel):
    """One pass: every event that asked for it, and what it must recompute."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    events: tuple[EvaluationEvent, ...]
    started_at: dt.datetime

    @model_validator(mode="after")
    def _asked_for(self) -> Self:
        if not self.events:
            raise ValueError("an evaluation pass is asked for by at least one event")
        return self

    @property
    def triggers(self) -> tuple[EvaluationTrigger, ...]:
        """The distinct triggers behind this pass, in the order they arrived."""
        seen: list[EvaluationTrigger] = []
        for event in self.events:
            if event.trigger not in seen:
                seen.append(event.trigger)
        return tuple(seen)

    @property
    def scope(self) -> tuple[str, ...]:
        """The requirements to recompute; empty means the whole store.

        One unscoped event widens the whole pass: a burst of "SWR-3201 changed"
        plus one "a branch switch happened" cannot be answered incrementally,
        and answering it partially would leave stale cards nobody asked about.
        """
        if any(not event.req_ids for event in self.events):
            return ()
        return tuple(sorted({req_id for event in self.events for req_id in event.req_ids}))

    @property
    def incremental(self) -> bool:
        """Whether this pass is scoped to named requirements (SWR-3116)."""
        return bool(self.scope)

    @property
    def coalesced(self) -> bool:
        """Whether a burst of events was absorbed into this one pass."""
        return len(self.events) > 1


@traces(SWR.SWR_3210)
class EvaluationChange(BaseModel):
    """One requirement whose projection moved, and how."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: ``None`` when this pass projected the requirement for the first time.
    previous: EvidenceState | None = None
    current: EvidenceState

    @property
    def message(self) -> str:
        """``SWR-3207: satisfied → failed``, or ``SWR-3207: → satisfied``."""
        before = f"{self.previous} " if self.previous is not None else ""
        return f"{self.req_id}: {before}→ {self.current}"


@traces(SWR.SWR_3210)
class EvaluationFailure(BaseModel):
    """Why a pass produced nothing, kept rather than swallowed."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    message: str
    error_type: str = ""


@traces(SWR.SWR_3210)
class EvaluationOutcome(BaseModel):
    """What one pass did — published to whoever is listening."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    request: EvaluationRequest
    #: The requirements whose projection changed. Naming them rather than
    #: signalling "something changed" is what lets a board repaint two cards
    #: instead of ninety (SWR-3210).
    changes: tuple[EvaluationChange, ...] = ()
    failure: EvaluationFailure | None = None
    finished_at: dt.datetime | None = None

    @model_validator(mode="after")
    def _a_failed_pass_publishes_nothing(self) -> Self:
        if self.failure is not None and self.changes:
            raise ValueError(
                "a failed evaluation leaves the previous projection in place and"
                " publishes no changes (SWR-3210)",
            )
        return self

    @property
    def succeeded(self) -> bool:
        """Whether the pass produced a result."""
        return self.failure is None

    @property
    def changed_ids(self) -> tuple[str, ...]:
        """The requirements to repaint, in id order."""
        return tuple(change.req_id for change in self.changes)

    @property
    def message(self) -> str:
        """One line for the log: what asked, what happened, what moved."""
        asked = ", ".join(self.request.triggers)
        if self.failure is not None:
            return f"evaluation after {asked} failed: {self.failure.message}"
        if not self.changes:
            return f"evaluation after {asked}: nothing changed"
        return f"evaluation after {asked}: {', '.join(change.message for change in self.changes)}"


if TYPE_CHECKING:
    #: What a pass does. It receives the request and returns the projections it
    #: computed — and receives *nothing else*, which is what makes an evaluation
    #: structurally unable to schedule another one (SWR-3210).
    Evaluate = Callable[[EvaluationRequest], Mapping[str, EvidenceProjection]]


@traces(SWR.SWR_3210)
class RequirementEvaluator:
    """Turns repository events into evaluation passes, one per burst.

    Not a thread and not a timer: the owner decides when to look
    (:meth:`due`) and on which thread to run (:meth:`run_due`). That keeps the
    policy — debounce, coalescing, change publication, re-entrancy, failure
    handling — in one testable place, and leaves the scheduling to whatever event
    loop the host already has.
    """

    def __init__(
        self,
        evaluate: Evaluate,
        *,
        debounce_ms: int = DEFAULT_DEBOUNCE_MS,
        triggers: Iterable[EvaluationTrigger] = ALL_EVALUATION_TRIGGERS,
        publish: Callable[[EvaluationOutcome], None] | None = None,
        ui_thread_id: int | None = None,
    ) -> None:
        if debounce_ms < 0:
            raise ValueError("the debounce window is a duration, never negative")
        self._evaluate = evaluate
        self._debounce = dt.timedelta(milliseconds=debounce_ms)
        self._triggers = frozenset(triggers)
        self._publish = publish
        self._ui_thread_id = ui_thread_id
        self._pending: list[EvaluationEvent] = []
        self._projections: dict[str, EvidenceProjection] = {}
        self._running_on: int | None = None

    @classmethod
    def off_thread(
        cls,
        evaluate: Evaluate,
        *,
        debounce_ms: int = DEFAULT_DEBOUNCE_MS,
        triggers: Iterable[EvaluationTrigger] = ALL_EVALUATION_TRIGGERS,
        publish: Callable[[EvaluationOutcome], None] | None = None,
    ) -> Self:
        """An evaluator that refuses to run on the thread constructing it.

        Called from the UI thread, which is the only place that knows it is the
        UI thread. Turning "never on the UI thread" into a captured id rather
        than a convention is what makes it checkable (SWR-3210).
        """
        return cls(
            evaluate,
            debounce_ms=debounce_ms,
            triggers=triggers,
            publish=publish,
            ui_thread_id=threading.get_ident(),
        )

    @property
    def projections(self) -> Mapping[str, EvidenceProjection]:
        """The last successful projection per requirement — read-only."""
        return dict(self._projections)

    @property
    def pending(self) -> tuple[EvaluationEvent, ...]:
        """The events waiting for the debounce window to close."""
        return tuple(self._pending)

    @property
    def triggers(self) -> frozenset[EvaluationTrigger]:
        """The triggers this evaluator listens to."""
        return self._triggers

    @traces(SWR.SWR_3210)
    def submit(self, event: EvaluationEvent) -> bool:
        """Record *event*; ``False`` when this evaluator ignores its trigger.

        Raises :class:`EvaluationReentryError` when called from inside a running
        pass on the same thread — the structural half of "an evaluation must not
        trigger an evaluation".
        """
        if self._running_on is not None and self._running_on == threading.get_ident():
            raise EvaluationReentryError(
                f"an evaluation cannot trigger an evaluation; {event.trigger} was"
                " submitted from inside a running pass (SWR-3210)",
            )
        if event.trigger not in self._triggers:
            return False
        self._pending.append(event)
        return True

    def due(self, now: dt.datetime) -> bool:
        """Whether the debounce window closed on the events waiting."""
        if not self._pending:
            return False
        latest = max(event.at for event in self._pending)
        return now - latest >= self._debounce

    def next_due_at(self) -> dt.datetime | None:
        """When the pending burst becomes due, or ``None`` when nothing waits."""
        if not self._pending:
            return None
        return max(event.at for event in self._pending) + self._debounce

    @traces(SWR.SWR_3210)
    def run_due(self, now: dt.datetime) -> EvaluationOutcome | None:
        """Run one pass if the burst is due; ``None`` when it is not yet."""
        if not self.due(now):
            return None
        return self.run(now)

    @traces(SWR.SWR_3210)
    def run(self, now: dt.datetime) -> EvaluationOutcome | None:
        """Run one pass over everything pending, debounce window or not.

        ``None`` when nothing is pending. Refuses to run on the UI thread when
        one was named, because a pass reads a repository and would freeze the
        board for as long as that takes (SWR-3210).
        """
        if self._ui_thread_id is not None and threading.get_ident() == self._ui_thread_id:
            raise EvaluationOnUiThreadError(
                "requirement evaluation reads the repository and never runs on the"
                " UI thread (SWR-3210)",
            )
        if not self._pending:
            return None

        request = EvaluationRequest(events=tuple(self._pending), started_at=now)
        self._pending.clear()
        self._running_on = threading.get_ident()
        try:
            try:
                projected = self._evaluate(request)
            except Exception as error:  # noqa: BLE001 - a failed pass is data, never a crash.
                outcome = EvaluationOutcome(
                    request=request,
                    failure=EvaluationFailure(message=str(error), error_type=type(error).__name__),
                    finished_at=now,
                )
            else:
                outcome = EvaluationOutcome(
                    request=request,
                    changes=self._absorb(projected),
                    finished_at=now,
                )
            # Publishing happens *inside* the guard on purpose: a subscriber that
            # answers "something changed" by asking for another evaluation is the
            # same non-terminating loop as an evaluation triggering itself, and it
            # must be refused in the same place rather than discovered in a
            # profiler (SWR-3210).
            if self._publish is not None:
                self._publish(outcome)
        finally:
            self._running_on = None
        return outcome

    def _absorb(self, projected: Mapping[str, EvidenceProjection]) -> tuple[EvaluationChange, ...]:
        """Merge new projections in and report which requirements moved.

        A merge rather than a replacement: an incremental pass (SWR-3116)
        recomputes the requirements in its scope and must not erase the ones it
        never looked at. Equality is over the whole projection, so a change in
        *which* test failed is a change even when the state stayed ``failed``.
        """
        changes: list[EvaluationChange] = []
        for req_id in sorted(projected):
            fresh = projected[req_id]
            previous = self._projections.get(req_id)
            if previous == fresh:
                continue
            changes.append(
                EvaluationChange(
                    req_id=req_id,
                    previous=previous.state if previous is not None else None,
                    current=fresh.state,
                ),
            )
            self._projections[req_id] = fresh
        return tuple(changes)
