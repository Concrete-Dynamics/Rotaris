"""Delivery state — where a requirement's *implementation* stands (SWR-3201, SWR-3202).

A requirement carries two independent answers and they must never be collapsed
into one field:

- its **lifecycle** (``draft`` / ``approved`` / ``deprecated``, SWR-3101) says
  whether the text is the current specification. It is the project's, it is read
  from the source on every read, and Rotaris never stores it;
- its **delivery state** (:class:`DeliveryState`) says where the work stands. It
  is Rotaris' own operational data (SWR-3114), lives in the delivery store
  (SWR-3205) and is never written back into the project's requirement file.

Collapsing them would either hide work in progress behind an ``approved`` badge
or misreport the specification because someone started implementing it — which
is why :class:`DeliveryStatus` carries no lifecycle field, why
:class:`DeliveryView` joins the two only at *read* time, and why the one
permitted coupling (a ``deprecated`` requirement is not schedulable, SWR-3412) is
a derived property rather than a stored one (SWR-3202).

Three properties are load-bearing and asserted by the tests:

- **The set is closed, the reader is not.** :func:`read_delivery_state` accepts a
  persisted value written by any Rotaris version, and answers an unknown one with
  ``Backlog`` *and* a stated notice. A board that crashes on a value it does not
  recognise is worse than a board that says so (SWR-3201).
- **Backlog is free.** A requirement Rotaris has never seen is ``Backlog``
  without a write; :attr:`DeliveryStatus.pristine` is what the store keys that
  on, so opening a workspace persists nothing.
- **A state that moved names who moved it.** Every non-``Backlog`` status carries
  actor, timestamp and cause. :meth:`DeliveryStatus.moved_to` validates the
  *shape* of a change; whether the change is *legal* is decided in one place only
  — :func:`~rotaris_core.requirements.delivery.transitions.apply_transition`
  (SWR-3203) — and nothing else in Rotaris may call ``moved_to`` directly.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.model import RequirementLifecycle

if TYPE_CHECKING:
    from rotaris_core.requirements.model import CanonicalRequirement

__all__ = [
    "DEFAULT_DELIVERY_STATE",
    "ActorKind",
    "DeliveryActor",
    "DeliveryState",
    "DeliveryStatus",
    "DeliveryView",
    "TransitionCause",
    "UnknownDeliveryState",
    "parse_delivery_state",
    "read_delivery_state",
]


@traces(SWR.SWR_3201)
class DeliveryState(StrEnum):
    """The closed set of delivery states (SWR-3201).

    The *value* is the persisted token — lower-case and hyphenated, so it is
    stable against a display rename — and :attr:`label` is what a user reads.
    """

    BACKLOG = "backlog"
    READY = "ready"
    RUNNING = "running"
    REVIEW = "review"
    NEEDS_UPDATE = "needs-update"
    BLOCKED = "blocked"
    DONE = "done"

    @property
    def label(self) -> str:
        """The state as SWR-3201 names it — ``Needs Update``, not ``needs-update``."""
        return " ".join(part.capitalize() for part in self.value.split("-"))


#: What a requirement Rotaris has never seen is in, and what an unreadable or
#: unrecognised persisted value degrades to (SWR-3201).
DEFAULT_DELIVERY_STATE = DeliveryState.BACKLOG

#: Spellings accepted from disk beyond the canonical token, so a record written
#: by a hand, an older build or a different casing still resolves rather than
#: degrading a requirement that was never actually broken.
_ALIASES: dict[str, DeliveryState] = {
    "todo": DeliveryState.BACKLOG,
    "open": DeliveryState.BACKLOG,
    "in-progress": DeliveryState.RUNNING,
    "in-review": DeliveryState.REVIEW,
    "needsupdate": DeliveryState.NEEDS_UPDATE,
    "outdated": DeliveryState.NEEDS_UPDATE,
    "completed": DeliveryState.DONE,
}


@traces(SWR.SWR_3201)
def parse_delivery_state(raw: object) -> DeliveryState | None:
    """The state *raw* names, or ``None`` when it names none.

    Tolerant about spelling — ``Needs Update``, ``needs_update`` and
    ``NEEDS-UPDATE`` are the same state — and strict about membership: a value
    outside the closed set is ``None`` here and a reported degradation at the
    caller, never a silently invented member.
    """
    if isinstance(raw, DeliveryState):
        return raw
    if not isinstance(raw, str):
        return None
    token = raw.strip().casefold().replace("_", "-").replace(" ", "-")
    if not token:
        return None
    try:
        return DeliveryState(token)
    except ValueError:
        return _ALIASES.get(token)


@traces(SWR.SWR_3201)
class UnknownDeliveryState(BaseModel):
    """A persisted delivery state this build does not recognise.

    Reported rather than raised: one unreadable value must degrade one
    requirement, never the board (SWR-3201).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The value as it was found, verbatim, so the notice is actionable.
    raw: str
    req_id: str = ""
    degraded_to: DeliveryState = DEFAULT_DELIVERY_STATE

    @property
    def message(self) -> str:
        """One line naming the requirement, the value and what was used instead."""
        who = f"{self.req_id}: " if self.req_id else ""
        return (
            f"{who}unknown delivery state {self.raw!r};"
            f" showing {self.degraded_to.label} until it is set again"
        )


@traces(SWR.SWR_3201)
def read_delivery_state(
    raw: object,
    *,
    req_id: str = "",
) -> tuple[DeliveryState, UnknownDeliveryState | None]:
    """Read a persisted delivery state, degrading an unknown one to ``Backlog``.

    Returns the state *and* the notice, because the two facts are needed in
    different places: the board renders the state, the diagnostics render the
    notice, and neither may be inferred from the other.
    """
    parsed = parse_delivery_state(raw)
    if parsed is not None:
        return parsed, None
    return DEFAULT_DELIVERY_STATE, UnknownDeliveryState(
        raw="" if raw is None else str(raw),
        req_id=req_id,
    )


class ActorKind(StrEnum):
    """Who made a delivery change: a person, or Rotaris itself (SWR-3203)."""

    USER = "user"
    SYSTEM = "system"


@traces(SWR.SWR_3203, SWR.SWR_3213)
class DeliveryActor(BaseModel):
    """The actor of a delivery change — the kind, and its name when it has one.

    The kind is what the transition matrix permits on (SWR-3203); the name is
    what the audit trail reports (SWR-3213). Both are needed: "the system" is not
    an answer to "which agent moved this", and "the requirements-engineer agent"
    is not an answer to "may a user do this".
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: ActorKind
    #: The named agent, session or person. Empty means "unnamed", never "unknown
    #: kind" — a change whose kind is unknown is not recordable at all.
    name: str = ""

    @classmethod
    def user(cls, name: str = "") -> Self:
        """A person acting through the board (SWR-3601)."""
        return cls(kind=ActorKind.USER, name=name.strip())

    @classmethod
    def system(cls, name: str = "") -> Self:
        """Rotaris itself — a scheduler, a run, a change-propagation pass."""
        return cls(kind=ActorKind.SYSTEM, name=name.strip())

    @property
    def label(self) -> str:
        """``user (dvf)`` / ``system (requirement-runner)`` / ``system``."""
        return f"{self.kind} ({self.name})" if self.name else str(self.kind)


class TransitionCause(StrEnum):
    """Why a delivery state moved — recorded on every change (SWR-3203, SWR-3213)."""

    USER_ACTION = "user-action"
    RUN_STARTED = "run-started"
    RUN_COMPLETED = "run-completed"
    RUN_FAILED = "run-failed"
    COMPLETION_ACCEPTED = "completion-accepted"
    SPECIFICATION_CHANGED = "specification-changed"
    BLOCKER_RAISED = "blocker-raised"
    BLOCKER_CLEARED = "blocker-cleared"
    #: A verification run confirmed work Rotaris did not write (SWR-3217). The
    #: only cause that opens the adoption edge in SWR-3218's separate map.
    ADOPTED = "adopted"
    #: An adoption taken back. Legal only where the recorded delivery is itself
    #: an adopted one, so it can never undo a real Rotaris delivery.
    ADOPTION_REVERTED = "adoption-reverted"
    #: A verification of the *existing* implementation passed, so the delivery
    #: already recorded stands again (SWR-3504, SWR-3513). The only cause that
    #: opens SWR-3222's ``Needs Update → Done`` edge, and distinct from
    #: ``specification-changed`` on purpose: that cause carries a requirement out
    #: of ``Done``, and one cause opening a door in both directions would let a
    #: caller undo a specification change by naming it.
    REVERIFIED = "reverified"
    #: The evidence behind a delivery is gone — a covering test deleted, a trace
    #: refactored away (SWR-3513). Distinct from ``run-failed``, which is what
    #: this used to be recorded as: no run failed, and a history view that said
    #: one did sent its reader looking for a run that never happened.
    EVIDENCE_LOST = "evidence-lost"

    @property
    def adoption(self) -> bool:
        """Whether this cause travels through the adoption door (SWR-3218)."""
        return self in {TransitionCause.ADOPTED, TransitionCause.ADOPTION_REVERTED}

    @property
    def reverification(self) -> bool:
        """Whether this cause travels the re-verification edge (SWR-3222)."""
        return self is TransitionCause.REVERIFIED


@traces(SWR.SWR_3201, SWR.SWR_3202)
class DeliveryStatus(BaseModel):
    """One requirement's delivery state and how it got there.

    Immutable, and deliberately *without* a lifecycle field: the two axes are
    stored apart (SWR-3202), and the only place they meet is
    :class:`DeliveryView`, which joins them for display without persisting the
    join.

    The default value — ``Backlog``, no actor, no timestamp — is what a
    requirement Rotaris has never seen looks like, and :attr:`pristine` is how
    the store knows it has nothing worth writing.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    state: DeliveryState = DEFAULT_DELIVERY_STATE
    #: Why this requirement is blocked. Mandatory while blocked and empty
    #: otherwise: SWR-3201 makes the reason part of the state, not a comment
    #: beside it.
    blocked_reason: str = ""
    #: The state to return to once the blocker clears. Recorded when ``Blocked``
    #: is entered so "back to where it was" is a fact rather than a guess.
    blocked_from: DeliveryState | None = None
    changed_at: dt.datetime | None = None
    changed_by: DeliveryActor | None = None
    cause: TransitionCause | None = None
    #: The requirement's ``current_hash`` (SWR-3107) at the moment of the change.
    #: Provenance of the change, never a satisfaction claim — that is
    #: ``satisfied_hash`` (SWR-3204) and it lives in the satisfied log.
    requirement_hash: str = ""

    @field_validator("changed_at")
    @classmethod
    def _aware(cls, value: dt.datetime | None) -> dt.datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("a delivery change carries an aware timestamp, never a naive one")
        return value

    @model_validator(mode="after")
    def _coherent(self) -> Self:
        blocked = self.state is DeliveryState.BLOCKED
        if blocked and not self.blocked_reason.strip():
            raise ValueError("a Blocked requirement carries a stated reason (SWR-3201)")
        if not blocked and (self.blocked_reason or self.blocked_from is not None):
            raise ValueError(
                f"only a Blocked requirement carries a blocker; {self.state.label} does not",
            )
        provenance = (self.changed_at, self.changed_by, self.cause)
        if any(part is not None for part in provenance) and not all(
            part is not None for part in provenance
        ):
            raise ValueError("a recorded delivery change names actor, time and cause together")
        if self.state is not DEFAULT_DELIVERY_STATE and self.changed_at is None:
            raise ValueError(
                f"{self.state.label} did not arrive by itself: a state other than"
                f" {DEFAULT_DELIVERY_STATE.label} names who moved it, when and why (SWR-3203)",
            )
        return self

    @property
    def pristine(self) -> bool:
        """True for a requirement Rotaris has never recorded anything about.

        The store writes nothing for a pristine status: ``Backlog`` is the
        default, and a file saying so would be a write that SWR-3201 forbids.
        """
        return self.state is DEFAULT_DELIVERY_STATE and self.changed_at is None

    @property
    def blocked(self) -> bool:
        """True while the requirement is blocked."""
        return self.state is DeliveryState.BLOCKED

    @property
    def summary(self) -> str:
        """One line: the state, its reason when blocked, and who set it."""
        parts = [self.state.label]
        if self.blocked and self.blocked_reason:
            parts.append(f"({self.blocked_reason})")
        if self.changed_by is not None:
            parts.append(f"by {self.changed_by.label}")
        return " ".join(parts)

    @traces(SWR.SWR_3201, SWR.SWR_3203)
    def moved_to(
        self,
        state: DeliveryState,
        *,
        actor: DeliveryActor,
        at: dt.datetime,
        cause: TransitionCause,
        reason: str = "",
        requirement_hash: str = "",
    ) -> DeliveryStatus:
        """The same requirement in *state*, carrying who moved it, when and why.

        Shape only. Whether the move is *permitted* — the matrix, the actor, the
        completion conditions — is decided by :func:`apply_transition` (SWR-3203),
        which is the only supported caller. Entering ``Blocked`` records the state
        to come back to; leaving it clears the blocker instead of letting a stale
        reason travel with a running requirement.
        """
        blocked = state is DeliveryState.BLOCKED
        return DeliveryStatus(
            state=state,
            blocked_reason=reason.strip() if blocked else "",
            blocked_from=(self.blocked_from if self.blocked else self.state) if blocked else None,
            changed_at=at,
            changed_by=actor,
            cause=cause,
            requirement_hash=requirement_hash,
        )


@traces(SWR.SWR_3202)
class DeliveryView(BaseModel):
    """Both axes of one requirement, side by side and neither derived from the other.

    Built at read time from two places that never write to each other: the
    lifecycle comes from the project's source (SWR-3101), the delivery status
    from Rotaris' store (SWR-3205). Every combination is representable —
    ``approved`` + ``Needs Update`` and ``draft`` + ``Running`` are both normal
    (SWR-3202) — and both render, which is what :attr:`badges` exists for.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: Read from the source on every read; this value is never persisted by
    #: Rotaris and changing the delivery state never writes it back (SWR-3202).
    lifecycle: RequirementLifecycle = RequirementLifecycle.DRAFT
    delivery: DeliveryStatus = DeliveryStatus()

    @classmethod
    def of(cls, requirement: CanonicalRequirement, status: DeliveryStatus) -> Self:
        """Join a requirement read from its source with Rotaris' own status."""
        return cls(
            req_id=requirement.req_id,
            lifecycle=requirement.lifecycle,
            delivery=status,
        )

    @property
    def state(self) -> DeliveryState:
        """The delivery state — a shorthand, not a second storage place."""
        return self.delivery.state

    @property
    def badges(self) -> tuple[str, str]:
        """``(lifecycle, delivery)`` as a card shows them (SWR-3304).

        Two badges, never one: the pair is the point of SWR-3202, and a single
        merged badge is exactly the collapse this requirement forbids.
        """
        return (str(self.lifecycle), self.delivery.state.label)

    @property
    def schedulable(self) -> bool:
        """Whether a run may be started for this requirement.

        The **one** coupling SWR-3202 permits between the axes, stated here
        rather than implied anywhere else: a ``deprecated`` requirement is not
        schedulable (SWR-3412), whatever its delivery state says. Everything
        else about the two axes is independent.
        """
        return self.lifecycle is not RequirementLifecycle.DEPRECATED
