"""The delivery state machine — the one way a delivery state changes (SWR-3203).

Board actions (SWR-3601) and agent runs (SWR-3413) both move requirements
between states. If either could write any state, a requirement could reach
``Done`` without a run, or leave ``Running`` while a run is still in flight, and
the board would stop describing reality. So there is exactly one function that
moves a state — :func:`apply_transition` — and both actors reach it through the
same door:

- the **system** actor (slice 4) calls it on run start, run completion and
  specification change;
- the **user** actor (slice 6) calls it for every drag, menu action and accept.

The actor is part of the transition, not a label on it:
:data:`LEGAL_TRANSITIONS` maps each edge to the actor kinds permitted to make it,
so "a user may not start a run by dragging a card into Running" is a fact of the
matrix rather than a check someone remembered to write in the UI.

**A refusal names its unmet precondition.** :class:`TransitionRefusal` carries
the kind, the sentence, and — for a completion refusal — every unmet condition
individually (SWR-3215). A card that springs back with "not allowed" is not a
product; a card that springs back with "the covering test for SWR-3201 has not
run" is.

**Preconditions this module owns, and preconditions it delegates.** Two things
are checked *here* and cannot be configured away:

- ``Blocked`` requires a stated reason (SWR-3201), and leaving ``Blocked`` goes
  back to the state it came from — except that a *user* leaving a requirement
  blocked out of ``Running`` releases it to ``Ready``, since only the system may
  put a requirement back into a run (:func:`resume_target`);
- ``Done`` requires a recorded satisfied hash (SWR-3204). The request has to
  carry a :class:`~rotaris_core.requirements.delivery.satisfied.SatisfiedDelivery`
  built from the delivering run's **snapshot**, which is what makes "reaching
  Done without a recorded hash is impossible" structural rather than a rule
  someone has to remember.

Everything else about completion — traces exist, tests ran and passed, the gate
passed, integration finished, ``current_hash == satisfied_hash`` — is SWR-3215's,
and arrives as an injected :data:`CompletionGate` evaluated **at the moment of
the transition**, against current evidence rather than evidence captured earlier.
The injection point is a seam, not an opt-out: a transition into ``Done`` with no
gate is *refused*
(:attr:`RefusalKind.COMPLETION_GATE_MISSING`), because "nobody checked" and
"every condition holds" are not the same answer and only one of them earns
``Done`` (SWR-3215, SWR-3609).

**Adoption has its own door, and it is not in the matrix.** Taking over work a
project already had (SWR-3217) needs ``Backlog → Done``, which
:data:`LEGAL_TRANSITIONS` deliberately does not have — its absence is what makes
that jump unreachable for a drag, a menu action or a bulk accept, and SWR-3609
rests on it. So the two adoption edges live in :data:`ADOPTION_TRANSITIONS`,
which is consulted **only** for the adoption causes and which
:func:`allowed_targets` never reads. The cause is a label and grants nothing on
its own: adopting is refused unless the request carries the satisfied delivery of
the verification run that confirmed the work (SWR-3219), reverting is refused
unless the delivery being taken back is itself adopted, and the ``Done`` branch
below applies unchanged — the *same* completion gate a real delivery passes
(SWR-3215).

**Every accepted transition yields exactly one audit record.**
:attr:`TransitionOutcome.transition` is that record (SWR-3213); a refusal yields
none and leaves the stored record byte-identical, because
:meth:`DeliveryStore.update <rotaris_core.requirements.delivery.store.DeliveryStore.update>`
writes nothing when the mutation returns what it was given.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from types import MappingProxyType
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.satisfied import (
    SatisfiedDelivery,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.delivery.state import (
    ActorKind,
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from rotaris_core.requirements.delivery.store import DeliveryStore

__all__ = [
    "ADOPTION_TRANSITIONS",
    "LEGAL_TRANSITIONS",
    "REVERIFICATION_TRANSITIONS",
    "CompletionGate",
    "DeliveryTransitions",
    "RefusalKind",
    "TransitionOutcome",
    "TransitionRecord",
    "TransitionRefusal",
    "TransitionRequest",
    "UnmetCondition",
    "allowed_targets",
    "apply_transition",
    "is_legal",
    "permitted_actors",
    "resume_target",
]

_BOTH: frozenset[ActorKind] = frozenset(ActorKind)
_SYSTEM_ONLY: frozenset[ActorKind] = frozenset({ActorKind.SYSTEM})


def _build_matrix() -> dict[tuple[DeliveryState, DeliveryState], frozenset[ActorKind]]:
    """The legal moves of SWR-3203, with the actors permitted to make each.

    System-only edges are the ones that assert something only Rotaris can know:
    that a run started, that it finished, that the specification moved under a
    delivered requirement. Everything else is available to a user as well —
    including ``Review → Done``, which is gated by conditions rather than by
    actor (SWR-3215).
    """
    edges: dict[tuple[DeliveryState, DeliveryState], frozenset[ActorKind]] = {
        (DeliveryState.BACKLOG, DeliveryState.READY): _BOTH,
        (DeliveryState.READY, DeliveryState.BACKLOG): _BOTH,
        (DeliveryState.READY, DeliveryState.RUNNING): _SYSTEM_ONLY,
        (DeliveryState.RUNNING, DeliveryState.REVIEW): _SYSTEM_ONLY,
        (DeliveryState.REVIEW, DeliveryState.DONE): _BOTH,
        (DeliveryState.REVIEW, DeliveryState.READY): _BOTH,
        (DeliveryState.DONE, DeliveryState.NEEDS_UPDATE): _SYSTEM_ONLY,
        (DeliveryState.NEEDS_UPDATE, DeliveryState.READY): _BOTH,
    }
    for state in DeliveryState:
        if state is DeliveryState.BLOCKED:
            continue
        # "any state → Blocked", and back to the state it came from once the
        # blocker clears. Returning to Running is the exception: entering
        # Running means a run is in flight, which only the system can assert.
        edges[(state, DeliveryState.BLOCKED)] = _BOTH
        edges[(DeliveryState.BLOCKED, state)] = (
            _SYSTEM_ONLY if state is DeliveryState.RUNNING else _BOTH
        )
    return edges


#: Every legal edge → the actor kinds permitted to make it. An edge that is
#: absent is illegal for everyone, which is what makes ``Backlog → Done``
#: unreachable without passing through the states that earn it.
LEGAL_TRANSITIONS: Mapping[tuple[DeliveryState, DeliveryState], frozenset[ActorKind]] = (
    MappingProxyType(_build_matrix())
)

#: The two edges adoption travels (SWR-3218), kept **out** of
#: :data:`LEGAL_TRANSITIONS` on purpose.
#:
#: SWR-3609's guarantee — the user interface cannot force ``Done`` — rests on
#: ``Backlog → Done`` being absent from the matrix a board reads for its drop
#: targets. Adding it there would hand the shortcut to every drag, menu action
#: and bulk accept. So adoption gets its own map, consulted **only** when the
#: request's cause is an adoption cause, and :func:`allowed_targets` deliberately
#: never reads it.
#:
#: The edges are not the protection; the guards in :func:`apply_transition` are.
#: Reaching ``Done`` here still requires a satisfied delivery *and* the same
#: unmodified completion gate a real delivery passes (SWR-3215), and the cause
#: alone opens nothing.
ADOPTION_TRANSITIONS: Mapping[tuple[DeliveryState, DeliveryState], frozenset[ActorKind]] = (
    MappingProxyType(
        {
            (DeliveryState.BACKLOG, DeliveryState.DONE): _BOTH,
            (DeliveryState.DONE, DeliveryState.BACKLOG): _BOTH,
        },
    )
)

#: The one edge a re-verification travels (SWR-3222), on the same terms.
#:
#: Two approved requirements ask for it and neither could have it: SWR-3504 says
#: a reworded requirement whose behaviour did not change *returns to Done*, and
#: SWR-3513 says a delivery whose evidence came back does too, after a
#: verification. ``Needs Update → Done`` is absent from :data:`LEGAL_TRANSITIONS`
#: — deliberately, because a board that offered it as a drop target would let a
#: user dismiss a specification change by dragging the card back.
#:
#: So it gets its own map, in the shape adoption established: consulted **only**
#: for :attr:`~rotaris_core.requirements.delivery.state.TransitionCause.REVERIFIED`,
#: never read by :func:`allowed_targets`, and system-only — a person cannot
#: assert that a suite passed. And the cause opens nothing by itself: the request
#: has to carry the delivery being re-stated, and the same unmodified completion
#: gate still runs (SWR-3215).
#:
#: One difference from adoption's, and it is deliberate: this map is **additive**.
#: Adoption's replaces the matrix, because adopting out of ``Running`` would be
#: wrong however the matrix reads. A re-verification out of ``Review`` is an
#: ordinary ``Review → Done`` that happens to name why it is being made, so the
#: matrix still applies wherever this map is silent.
REVERIFICATION_TRANSITIONS: Mapping[tuple[DeliveryState, DeliveryState], frozenset[ActorKind]] = (
    MappingProxyType({(DeliveryState.NEEDS_UPDATE, DeliveryState.DONE): _SYSTEM_ONLY})
)


@traces(SWR.SWR_3203)
def permitted_actors(
    source: DeliveryState,
    target: DeliveryState,
) -> frozenset[ActorKind]:
    """Who may move *source* → *target*; empty when nobody may."""
    return LEGAL_TRANSITIONS.get((source, target), frozenset())


@traces(SWR.SWR_3203)
def is_legal(
    source: DeliveryState,
    target: DeliveryState,
    actor: ActorKind | None = None,
) -> bool:
    """Whether the edge exists at all, or exists for *actor* when one is given.

    Structure only: the preconditions of a *particular* attempt (a blocker's
    reason, a satisfied hash, the completion conditions) are
    :func:`apply_transition`'s answer, not this one's.
    """
    allowed = permitted_actors(source, target)
    return bool(allowed) if actor is None else actor in allowed


@traces(SWR.SWR_3203)
def allowed_targets(
    source: DeliveryState,
    actor: ActorKind | None = None,
) -> tuple[DeliveryState, ...]:
    """The states reachable from *source*, in declaration order.

    What a board offers as drop targets (SWR-3601) — the UI asks the matrix
    rather than keeping a second copy of it.
    """
    return tuple(state for state in DeliveryState if is_legal(source, state, actor))


@traces(SWR.SWR_3203, SWR.SWR_3201)
def resume_target(
    blocked_from: DeliveryState | None,
    actor: ActorKind | None = None,
) -> DeliveryState:
    """Where *actor* may release a ``Blocked`` requirement to, given where it was blocked.

    The predecessor, for the system: a flow that blocked its own requirement and
    then cleared the blocker picks the run back up where it left it, which is
    what ``Blocked → Running`` is in the matrix for.

    For a **user** there is one exception, and it is the difference between a
    board and a trap. ``Blocked → Running`` is system-only, because entering
    ``Running`` asserts that a run is in flight and no person can assert that. So
    a requirement blocked *out of* ``Running`` — by someone holding a run, or by
    the flow blocking one it could not finish — would have a predecessor no
    person may return it to, and every other column closed by this very guard: a
    card nobody can move, ever. ``Ready`` is the state a run starts from, so it
    is the state a person may hand it back to.

    ``None`` for *actor* asks the structural question — "where does this go
    back to" — and gets the predecessor, unrestricted.

    :attr:`~rotaris_core.requirements.delivery.state.DeliveryStatus.blocked_from`
    is left recording where the requirement *was* blocked either way. It is a
    record, and a record that answered "where may this go next" instead would
    stop being one.
    """
    if blocked_from is None:
        return DeliveryState.BACKLOG
    if blocked_from is DeliveryState.RUNNING and actor is ActorKind.USER:
        return DeliveryState.READY
    return blocked_from


@traces(SWR.SWR_3215)
class UnmetCondition(BaseModel):
    """One completion condition that does not hold (SWR-3215).

    Named individually and never summed into a count: "3 conditions unmet" tells
    a user nothing they can act on.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    detail: str = ""

    @property
    def message(self) -> str:
        """``covering-test-passed: tests/unit/... did not run``."""
        return f"{self.name}: {self.detail}" if self.detail else self.name


#: What SWR-3215 plugs in: given the record as stored and the transition being
#: attempted, the conditions that do not hold *right now*. An empty result means
#: every condition holds. Evaluated inside :func:`apply_transition`, so the
#: answer is always current evidence rather than evidence captured earlier.
type CompletionGate = Callable[[DeliveryRecord, TransitionRequest], Sequence[UnmetCondition]]


@traces(SWR.SWR_3203)
class TransitionRequest(BaseModel):
    """One attempt to move a requirement's delivery state.

    Carries everything the decision needs and nothing it does not: the clock is
    injected as :attr:`at` so the state machine stays pure, and the delivering
    run's satisfied record is passed in rather than looked up, so the module
    that owns snapshots (SWR-3402) decides what "the version delivered" means.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    target: DeliveryState
    actor: DeliveryActor
    cause: TransitionCause
    at: dt.datetime
    #: The requirement's ``current_hash`` at the moment of the attempt. Recorded
    #: on the audit record; deliberately *not* what a ``Done`` transition stores
    #: as its satisfied hash — see :attr:`delivery`.
    requirement_hash: str = ""
    #: Mandatory when entering ``Blocked`` (SWR-3201).
    reason: str = ""
    #: The delivery being recorded, built from the run's **snapshot**
    #: (SWR-3402, SWR-3204). Required for ``Done`` and meaningless anywhere else.
    delivery: SatisfiedDelivery | None = None
    #: The run this transition belongs to, for the audit trail (SWR-3213).
    run_id: str | None = None
    detail: str = ""

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("a transition carries an aware timestamp, never a naive one")
        return value

    @model_validator(mode="after")
    def _delivery_belongs_to_done(self) -> Self:
        if self.delivery is not None and self.target is not DeliveryState.DONE:
            raise ValueError(
                f"a satisfied delivery is recorded by reaching Done, not by reaching"
                f" {self.target.label}; drop it or change the target (SWR-3204)",
            )
        return self


class RefusalKind(StrEnum):
    """Which precondition an attempted transition failed."""

    SAME_STATE = "same-state"
    ILLEGAL_EDGE = "illegal-edge"
    ACTOR_NOT_PERMITTED = "actor-not-permitted"
    BLOCKER_REASON_MISSING = "blocker-reason-missing"
    NOT_THE_BLOCKED_PREDECESSOR = "not-the-blocked-predecessor"
    DERIVED_STATE = "derived-state"
    SATISFIED_HASH_MISSING = "satisfied-hash-missing"
    COMPLETION_GATE_MISSING = "completion-gate-missing"
    COMPLETION_CONDITIONS_UNMET = "completion-conditions-unmet"
    ADOPTION_EVIDENCE_MISSING = "adoption-evidence-missing"
    NOT_AN_ADOPTED_DELIVERY = "not-an-adopted-delivery"


#: The precondition each refusal kind reports as unmet. One sentence, phrased as
#: the rule that has to hold, because that is what a user has to act on.
#:
#: Every entry is phrased **positively** — as the rule, never as the breach — so
#: that :attr:`TransitionRefusal.message` can negate it once, in one place. Get
#: this wrong and the refusal asserts the opposite of what happened: ``refused —
#: every completion condition holds`` is the sentence 1413 requirements printed
#: while being refused for conditions that did not.
_PRECONDITIONS: Mapping[RefusalKind, str] = MappingProxyType(
    {
        RefusalKind.SAME_STATE: "a transition changes the state",
        RefusalKind.ILLEGAL_EDGE: "the state machine has an edge between these states",
        RefusalKind.ACTOR_NOT_PERMITTED: "this actor may make this move",
        RefusalKind.BLOCKER_REASON_MISSING: "a Blocked requirement carries a stated reason",
        RefusalKind.NOT_THE_BLOCKED_PREDECESSOR: (
            "a blocked requirement returns to the state it was blocked in,"
            " or to Ready when it was blocked with a run in flight"
        ),
        RefusalKind.DERIVED_STATE: "an epic's state is derived from its children, never set",
        RefusalKind.SATISFIED_HASH_MISSING: (
            "Done records the specification version that was delivered"
        ),
        RefusalKind.COMPLETION_GATE_MISSING: (
            "the completion conditions are checked before Done is granted"
        ),
        RefusalKind.COMPLETION_CONDITIONS_UNMET: "every completion condition holds",
        RefusalKind.ADOPTION_EVIDENCE_MISSING: (
            "adopting records the verification run that confirmed the existing work"
        ),
        RefusalKind.NOT_AN_ADOPTED_DELIVERY: (
            "the delivery being taken back is an adoption; a delivery Rotaris ran cannot be"
        ),
    },
)


@traces(SWR.SWR_3203)
class TransitionRefusal(BaseModel):
    """A refused transition, naming what was not satisfied."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: RefusalKind
    req_id: str
    source: DeliveryState
    target: DeliveryState
    actor: DeliveryActor
    #: The rule that did not hold, as a sentence.
    precondition: str = ""
    #: Extra context — the permitted actors, the recorded predecessor.
    detail: str = ""
    #: Every unmet completion condition, named individually (SWR-3215).
    unmet: tuple[UnmetCondition, ...] = ()

    @model_validator(mode="after")
    def _state_the_precondition(self) -> Self:
        if not self.precondition.strip():
            raise ValueError("a refusal states the precondition it failed (SWR-3203)")
        return self

    @property
    def message(self) -> str:
        """One line: what was attempted, and which precondition stopped it.

        The precondition is stated as the rule and then *negated here*, so the
        sentence says what happened. Printing the rule on its own — ``refused —
        every completion condition holds`` — reads as the reason the move should
        have succeeded, which is the opposite of the fact being reported.
        """
        detail = f" ({self.detail})" if self.detail else ""
        unmet = (
            "; unmet: " + ", ".join(condition.message for condition in self.unmet)
            if self.unmet
            else ""
        )
        return (
            f"{self.req_id}: {self.source.label} → {self.target.label} refused"
            f" — {self.precondition} did not hold{detail}{unmet}"
        )


@traces(SWR.SWR_3203, SWR.SWR_3213)
class TransitionRecord(BaseModel):
    """The audit fact of one accepted transition (SWR-3213).

    Exactly one is produced per accepted transition and none per refusal. Never
    rewritten: the audit store (SWR-3213) appends these and the delivery record
    keeps only the latest state, so history lives in one place.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    source: DeliveryState
    target: DeliveryState
    actor: DeliveryActor
    at: dt.datetime
    cause: TransitionCause
    #: The requirement's hash when the transition happened (SWR-3203).
    requirement_hash: str = ""
    #: The version this transition recorded as delivered, for a ``Done`` move
    #: (SWR-3204). ``None`` everywhere else — and never equal to
    #: :attr:`requirement_hash` by construction, only by coincidence.
    satisfied_hash: str | None = None
    reason: str = ""
    run_id: str | None = None
    detail: str = ""

    @property
    def message(self) -> str:
        """``SWR-3201: Ready → Running by system (scheduler) — run-started``."""
        reason = f" ({self.reason})" if self.reason else ""
        return (
            f"{self.req_id}: {self.source.label} → {self.target.label}"
            f" by {self.actor.label} — {self.cause}{reason}"
        )


@traces(SWR.SWR_3203)
class TransitionOutcome(BaseModel):
    """What one attempt produced: a new record and an audit entry, or a refusal.

    Never both, never neither — a caller that forgets to check
    :attr:`accepted` still cannot mistake a refusal for a change, because on a
    refusal :attr:`record` is the record it passed in, unchanged.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    record: DeliveryRecord
    transition: TransitionRecord | None = None
    refusal: TransitionRefusal | None = None

    @model_validator(mode="after")
    def _one_answer(self) -> Self:
        if (self.transition is None) == (self.refusal is None):
            raise ValueError("a transition outcome is either accepted or refused, never both")
        return self

    @property
    def accepted(self) -> bool:
        """Whether the state moved."""
        return self.transition is not None

    @property
    def message(self) -> str:
        """The accepted record's line, or the refusal's."""
        if self.transition is not None:
            return self.transition.message
        return self.refusal.message if self.refusal is not None else ""


def _refuse(
    kind: RefusalKind,
    *,
    record: DeliveryRecord,
    request: TransitionRequest,
    detail: str = "",
    unmet: Sequence[UnmetCondition] = (),
) -> TransitionOutcome:
    return TransitionOutcome(
        record=record,
        refusal=TransitionRefusal(
            kind=kind,
            req_id=record.req_id,
            source=record.state,
            target=request.target,
            actor=request.actor,
            precondition=_PRECONDITIONS[kind],
            detail=detail,
            unmet=tuple(unmet),
        ),
    )


@traces(SWR.SWR_3218)
def _adoption_refusal(
    record: DeliveryRecord,
    request: TransitionRequest,
) -> TransitionOutcome | None:
    """Why this adoption move is refused, or ``None`` when it is not (SWR-3218).

    Kept apart from :func:`apply_transition`'s own ladder so the ordinary path
    reads exactly as it did: the adoption causes are the only ones that reach
    here, and everything they add is in one place.
    """
    if request.cause is TransitionCause.ADOPTED and not (
        request.delivery is not None and request.delivery.adopted
    ):
        return _refuse(
            RefusalKind.ADOPTION_EVIDENCE_MISSING,
            record=record,
            request=request,
            detail=(
                "no adopted satisfied delivery in the request; naming the cause"
                " grants nothing (SWR-3217, SWR-3219)"
            ),
        )
    if request.cause is TransitionCause.ADOPTION_REVERTED:
        current = record.satisfied.current
        if current is None or not current.adopted:
            return _refuse(
                RefusalKind.NOT_AN_ADOPTED_DELIVERY,
                record=record,
                request=request,
                detail=(
                    "the recorded delivery came from a Rotaris run"
                    if current is not None
                    else "nothing was ever delivered for this requirement"
                ),
            )
    return None


@traces(SWR.SWR_3203, SWR.SWR_3204, SWR.SWR_3218)
def apply_transition(
    record: DeliveryRecord,
    request: TransitionRequest,
    *,
    derived: bool = False,
    completion: CompletionGate | None = None,
    history_limit: int | None = None,
) -> TransitionOutcome:
    """Move *record* to ``request.target``, or refuse and say why.

    Pure: no clock (``request.at``), no filesystem, no store. The persisting
    half is :class:`DeliveryTransitions`, which is the same decision plus one
    locked read-modify-write.

    *derived* marks a requirement whose state is computed from its children — an
    epic (SWR-3212). Such a state is never set directly, and saying so here means
    every actor is refused in one place instead of each caller remembering.

    *completion* is SWR-3215's check. ``None`` means "no gate", and a ``Done``
    transition without one is refused rather than granted: the conditions were
    not checked, which is not the same as their holding.

    Checks run in the order a user would ask them in, and the **first** unmet
    precondition is the one reported — except completion conditions, which are
    reported together because SWR-3215 requires each unmet one to be named.
    """
    if record.req_id != request.req_id:
        raise ValueError(
            f"transition for {request.req_id!r} applied to {record.req_id!r}'s record",
        )
    source = record.state
    target = request.target

    if derived:
        return _refuse(
            RefusalKind.DERIVED_STATE,
            record=record,
            request=request,
            detail="its state follows from its children (SWR-3212)",
        )
    if source is target:
        return _refuse(
            RefusalKind.SAME_STATE,
            record=record,
            request=request,
            detail=f"already {source.label}",
        )
    # Which map applies is decided by the *cause* (SWR-3218, SWR-3222): the
    # adoption causes travel their own two edges, a re-verification travels its
    # one, everything else the matrix a board reads.
    adopting = request.cause.adoption
    reverifying = request.cause.reverification
    permitted = (
        ADOPTION_TRANSITIONS.get((source, target), frozenset())
        if adopting
        # Additive, unlike adoption's: a re-verification *adds* one edge to the
        # matrix rather than replacing it. Adoption is exclusive because adopting
        # from Running would be wrong whatever the matrix says; a re-verification
        # from Review is an ordinary Review → Done that happens to name why, and
        # taking legality away from it would refuse a move nobody objects to.
        else REVERIFICATION_TRANSITIONS.get((source, target)) or permitted_actors(source, target)
        if reverifying
        else permitted_actors(source, target)
    )
    if not permitted:
        reachable = ", ".join(state.label for state in allowed_targets(source))
        return _refuse(
            RefusalKind.ILLEGAL_EDGE,
            record=record,
            request=request,
            detail=(
                f"adoption moves Backlog → Done and back, not {source.label} → {target.label}"
                if adopting
                else f"reachable from {source.label}: {reachable}"
            ),
        )
    if adopting:
        # The edge exists; now the two guards that keep the cause from *being* the
        # permission. A cause is a label: adopting has to carry the verification
        # run that confirmed the work, and reverting has to be undoing an adoption
        # rather than a delivery Rotaris actually ran.
        adoption_refusal = _adoption_refusal(record, request)
        if adoption_refusal is not None:
            return adoption_refusal
    if reverifying and request.delivery is None:
        # The same shape, for the same reason. A re-verification re-states the
        # delivery that already stands; a request that carries none is asking for
        # a ``Done`` with nothing recorded behind it, and the cause alone must not
        # buy that (SWR-3204, SWR-3222).
        return _refuse(
            RefusalKind.ADOPTION_EVIDENCE_MISSING,
            record=record,
            request=request,
            detail=(
                "no satisfied delivery in the request; a re-verification re-states"
                " the delivery that already stands and naming the cause grants"
                " nothing (SWR-3204, SWR-3222)"
            ),
        )
    if request.actor.kind not in permitted:
        return _refuse(
            RefusalKind.ACTOR_NOT_PERMITTED,
            record=record,
            request=request,
            detail="permitted: " + ", ".join(sorted(str(kind) for kind in permitted)),
        )
    if target is DeliveryState.BLOCKED and not request.reason.strip():
        return _refuse(
            RefusalKind.BLOCKER_REASON_MISSING,
            record=record,
            request=request,
        )
    if source is DeliveryState.BLOCKED:
        resume = resume_target(record.delivery.blocked_from, request.actor.kind)
        if target is not resume:
            blocked_in = record.delivery.blocked_from or DeliveryState.BACKLOG
            return _refuse(
                RefusalKind.NOT_THE_BLOCKED_PREDECESSOR,
                record=record,
                request=request,
                detail=(
                    f"blocked in {blocked_in.label}, and released to {resume.label}"
                    if resume is not blocked_in
                    else f"blocked in {blocked_in.label}"
                ),
            )
    if target is DeliveryState.DONE:
        if request.delivery is None:
            return _refuse(
                RefusalKind.SATISFIED_HASH_MISSING,
                record=record,
                request=request,
                detail=(
                    "the delivering run's snapshot hash is what Done records (SWR-3204, SWR-3402)"
                ),
            )
        if completion is None:
            # No gate, no Done. An absent gate is not "no conditions to check" —
            # it is "nobody checked", and granting Done on that is exactly the
            # bypass SWR-3215 exists to make impossible.
            return _refuse(
                RefusalKind.COMPLETION_GATE_MISSING,
                record=record,
                request=request,
                detail=(
                    "no completion gate was supplied, so no condition could be evaluated (SWR-3215)"
                ),
            )
        unmet = tuple(completion(record, request))
        if unmet:
            return _refuse(
                RefusalKind.COMPLETION_CONDITIONS_UNMET,
                record=record,
                request=request,
                unmet=unmet,
            )

    status = record.delivery.moved_to(
        target,
        actor=request.actor,
        at=request.at,
        cause=request.cause,
        reason=request.reason,
        requirement_hash=request.requirement_hash,
    )
    satisfied = (
        record.satisfied.appended(request.delivery, limit=history_limit)
        if request.delivery is not None
        else record.satisfied
    )
    return TransitionOutcome(
        record=record.evolve(delivery=status, satisfied=satisfied),
        transition=TransitionRecord(
            req_id=record.req_id,
            source=source,
            target=target,
            actor=request.actor,
            at=request.at,
            cause=request.cause,
            requirement_hash=request.requirement_hash,
            satisfied_hash=request.delivery.satisfied_hash if request.delivery else None,
            reason=request.reason.strip(),
            run_id=request.run_id or (request.delivery.run_id if request.delivery else None),
            detail=request.detail,
        ),
    )


@traces(SWR.SWR_3203, SWR.SWR_3205)
class DeliveryTransitions:
    """The state machine bound to a store: decide, then persist, under one lock.

    The write path both later slices use. The decision is re-taken against the
    record as it is *inside* the lock, so a transition that was legal when the
    board rendered the card is re-checked against what the store holds now —
    which is how two actors racing on the same requirement produce one accepted
    move and one stated refusal rather than two writes.

    Two policies belong to the writer rather than to each call: the completion
    gate (SWR-3215) and *derived_for*, which answers "is this an epic" without
    the caller having to (SWR-3212). Both are configured once, so a board action
    that forgot to think about either still gets the refusal —
    :func:`~rotaris_core.requirements.delivery.epics.epic_transitions` is the
    hierarchy-bound constructor that supplies the second.
    """

    def __init__(
        self,
        store: DeliveryStore,
        *,
        completion: CompletionGate | None = None,
        derived_for: Callable[[str], bool] | None = None,
    ) -> None:
        self._store = store
        self._completion = completion
        self._derived_for = derived_for

    @property
    def store(self) -> DeliveryStore:
        """The store this writes through."""
        return self._store

    def apply(
        self,
        request: TransitionRequest,
        *,
        derived: bool = False,
        completion: CompletionGate | None = None,
    ) -> TransitionOutcome:
        """Apply *request* and persist the result when it is accepted.

        A refusal writes nothing at all: the mutation returns the record it was
        given, and the store skips a write for an unchanged record.

        *derived* is an addition to what the writer already knows, never a
        replacement: a caller may declare a state derived, but it cannot declare
        an epic's state settable by passing ``False``.
        """
        gate = completion if completion is not None else self._completion
        is_derived = derived or (
            self._derived_for(request.req_id) if self._derived_for is not None else False
        )
        captured: list[TransitionOutcome] = []

        def mutate(current: DeliveryRecord) -> DeliveryRecord:
            outcome = apply_transition(
                current,
                request,
                derived=is_derived,
                completion=gate,
                history_limit=self._store.history_limit,
            )
            captured.append(outcome)
            return outcome.record

        stored = self._store.update_record(request.req_id, mutate, at=request.at)
        outcome = captured[-1]
        if not outcome.accepted:
            return outcome
        return TransitionOutcome(record=stored, transition=outcome.transition)
