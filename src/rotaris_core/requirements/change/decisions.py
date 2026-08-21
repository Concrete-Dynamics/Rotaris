"""The decisions Rotaris refuses to take alone (SWR-3512).

Autonomy is only trustworthy if its edges are written down. A product that
sometimes asks and sometimes guesses is worse than one that always asks, because
nobody can predict which run will quietly decide something a person cared about.
So the set of decisions that reach a human is a **closed enum** here — seven
triggers, no catch-all — and everything outside it runs without interruption.

```text
DecisionTrigger  ─▶  PendingDecision  ─▶  HumanDecisions.raise_for()
   (the closed set)     question             │
                        options              ├─ TransitionDoor  → Blocked / Review
                        consequences         └─ AuditSink       → who was asked, when
                                                     │
                        DecisionRecord  ◀── .answer()  (the answer, its actor, its time)
```

Three properties are structural rather than promised:

**A decision is a question with named alternatives.** :class:`PendingDecision`
refuses to exist without a *concrete* question (``unclear requirement`` is
rejected by :func:`is_concrete_question`) and without at least two
:class:`DecisionOption` values, each of which refuses to exist without the
consequence of choosing it. "Blocked: needs clarification" is therefore not
representable — the type system says so, not a code review.

**Blocked and Review are different answers to different questions.** A trigger
whose work cannot proceed at all parks the requirement in ``Blocked``; one that
has a *proposal* a person has to look at parks it in ``Review``
(:data:`DECISION_TARGETS`). The split is data, so a new trigger has to choose
rather than default.

**Nothing outside the list interrupts.** :func:`interrupting` maps observed
conditions onto triggers and answers with an empty tuple for everything else, so
"a flaky test" and "a slow suite" cost an autonomous run nothing.

**The "human" is a type.** :func:`require_human` refuses an
:attr:`~rotaris_core.requirements.delivery.state.ActorKind.SYSTEM` actor wherever
an answer is turned into a :class:`DecisionRecord`. Without it the whole
requirement would be a naming convention: a ``DeliveryActor`` records whichever
kind it was handed, the transition matrix permits both out of ``Blocked``, and an
agent answering its own question would leave a trail that reads perfectly. The
same function is what makes a migration approval (SWR-3507) a human act rather
than a non-empty string.

This module holds no analyst, no model and no runner: raising a decision moves a
delivery state and appends a record, and answering one produces a *value* the
caller may act on. That is what keeps a decision from being able to start the
work it exists to postpone.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from types import MappingProxyType
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.detection import ReentrancyGuard
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind
from rotaris_core.requirements.delivery.state import (
    ActorKind,
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import (
    TransitionOutcome,  # noqa: TC001 - Pydantic resolves this at runtime.
    TransitionRequest,
)
from rotaris_core.requirements.hashing import content_hash

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence

    from rotaris_core.requirements.change.detection import AuditSink, TransitionDoor

__all__ = [
    "DECISION_ACTOR",
    "DECISION_TARGETS",
    "DECISION_TRIGGERS",
    "GENERIC_QUESTIONS",
    "MIN_QUESTION_CHARS",
    "DecisionError",
    "DecisionLog",
    "DecisionOption",
    "DecisionOutcome",
    "DecisionRecord",
    "DecisionTrigger",
    "HumanDecisions",
    "PendingDecision",
    "decision_trigger",
    "interrupting",
    "is_concrete_question",
    "require_human",
]


class DecisionError(RuntimeError):
    """A decision was raised or answered in a way that is not a decision.

    Deliberately not a :class:`ValueError`: half of these come out of Pydantic
    validators, where a ``ValueError`` is swallowed into a ``ValidationError``
    whose message buries the sentence the caller has to read.
    """


@traces(SWR.SWR_3512)
class DecisionTrigger(StrEnum):
    """The closed set of decisions Rotaris does not take alone (SWR-3512).

    Exactly the seven SWR-3512 enumerates. There is no ``other``: an eighth
    interruption is a change to this enum, to the requirement and to
    :data:`DECISION_TARGETS`, which is what stops "this one felt risky" from
    becoming an unpredictable eighth reason to stop.
    """

    #: Two requirements demand opposite things, or one contradicts itself.
    CONTRADICTORY_REQUIREMENTS = "contradictory-requirements"
    #: The change could mean a little or a lot and the text does not say.
    UNCLEAR_SCOPE = "unclear-scope"
    #: Two requirements both apply and only one of them can win.
    COMPETING_REQUIREMENTS = "competing-requirements"
    #: Delivering this breaks something that already works.
    BREAKING_CHANGE = "breaking-change"
    #: It is not clear whether this requirement replaces another (SWR-3507).
    UNCLEAR_SUPERSEDING = "unclear-superseding"
    #: A migration that can lose work if it is wrong (SWR-3507).
    RISKY_MIGRATION = "risky-migration"
    #: An architectural choice the available context cannot settle.
    ARCHITECTURAL_DECISION = "architectural-decision"

    @property
    def label(self) -> str:
        """``Breaking Change`` — what a card prints."""
        return " ".join(part.capitalize() for part in self.value.split("-"))


#: Every trigger, in declaration order. The list SWR-3512 promises the user.
DECISION_TRIGGERS: tuple[DecisionTrigger, ...] = tuple(DecisionTrigger)


def _targets() -> dict[DecisionTrigger, DeliveryState]:
    """Where each trigger parks the requirement while the human decides.

    ``Blocked`` when there is nothing to look at until the question is answered;
    ``Review`` when there *is* something — a breaking change and a risky
    migration both come with a concrete proposal, and a person deciding about
    them is reviewing work rather than unblocking it.
    """
    return {
        DecisionTrigger.CONTRADICTORY_REQUIREMENTS: DeliveryState.BLOCKED,
        DecisionTrigger.UNCLEAR_SCOPE: DeliveryState.BLOCKED,
        DecisionTrigger.COMPETING_REQUIREMENTS: DeliveryState.BLOCKED,
        DecisionTrigger.BREAKING_CHANGE: DeliveryState.REVIEW,
        DecisionTrigger.UNCLEAR_SUPERSEDING: DeliveryState.BLOCKED,
        DecisionTrigger.RISKY_MIGRATION: DeliveryState.REVIEW,
        DecisionTrigger.ARCHITECTURAL_DECISION: DeliveryState.BLOCKED,
    }


#: Trigger → the state the requirement waits in. Total over the enum, so a new
#: trigger cannot be added without deciding where it parks.
DECISION_TARGETS: Mapping[DecisionTrigger, DeliveryState] = MappingProxyType(_targets())

#: Who raises a decision when no other actor is named.
DECISION_ACTOR = DeliveryActor.system("decision-point")

#: Questions that look like questions and say nothing. Rejected outright: the
#: whole value of SWR-3512 is that the user is asked something they can answer.
GENERIC_QUESTIONS: frozenset[str] = frozenset(
    {
        "unclear",
        "unclear requirement",
        "unclear scope",
        "ambiguous",
        "ambiguous requirement",
        "needs clarification",
        "please clarify",
        "what should i do",
        "what now",
        "how should this be implemented",
    },
)

#: A question shorter than this cannot have named what it is about. Not a style
#: rule: ``Which one?`` is unanswerable without the requirement in front of you,
#: and the audit trail is read months later.
MIN_QUESTION_CHARS = 24

#: Spellings a caller may observe a condition under, mapped onto the trigger they
#: mean. Aliases exist so an analyst's vocabulary does not have to match this
#: enum exactly — but an alias nobody declared is *not* a trigger, which is what
#: keeps the list closed.
_ALIASES: Mapping[str, DecisionTrigger] = MappingProxyType(
    {
        "contradiction": DecisionTrigger.CONTRADICTORY_REQUIREMENTS,
        "contradictory": DecisionTrigger.CONTRADICTORY_REQUIREMENTS,
        "self-contradictory": DecisionTrigger.CONTRADICTORY_REQUIREMENTS,
        "scope": DecisionTrigger.UNCLEAR_SCOPE,
        "unclear-requirement-scope": DecisionTrigger.UNCLEAR_SCOPE,
        "competing": DecisionTrigger.COMPETING_REQUIREMENTS,
        "conflicting-requirements": DecisionTrigger.COMPETING_REQUIREMENTS,
        "breaking": DecisionTrigger.BREAKING_CHANGE,
        "backwards-incompatible": DecisionTrigger.BREAKING_CHANGE,
        "superseding": DecisionTrigger.UNCLEAR_SUPERSEDING,
        "unclear-supersedes": DecisionTrigger.UNCLEAR_SUPERSEDING,
        "migration": DecisionTrigger.RISKY_MIGRATION,
        "dangerous-migration": DecisionTrigger.RISKY_MIGRATION,
        "architecture": DecisionTrigger.ARCHITECTURAL_DECISION,
        "architectural": DecisionTrigger.ARCHITECTURAL_DECISION,
    },
)


@traces(SWR.SWR_3512)
def decision_trigger(condition: object) -> DecisionTrigger | None:
    """The trigger *condition* names, or ``None`` when it names none. Pure.

    ``None`` is the important half: it is the answer for a flaky test, a slow
    suite, a lint violation and every other thing an autonomous run deals with
    by itself (SWR-3512's fourth acceptance criterion).
    """
    if isinstance(condition, DecisionTrigger):
        return condition
    if not isinstance(condition, str):
        return None
    token = condition.strip().casefold().replace("_", "-").replace(" ", "-")
    if not token:
        return None
    try:
        return DecisionTrigger(token)
    except ValueError:
        return _ALIASES.get(token)


@traces(SWR.SWR_3512)
def interrupting(conditions: Iterable[object]) -> tuple[DecisionTrigger, ...]:
    """Which of *conditions* stop the run, in enum order, deduplicated. Pure.

    Empty for a run that observed nothing on the list — the ordinary case, and
    the one that has to stay cheap.
    """
    found = {trigger for trigger in map(decision_trigger, conditions) if trigger is not None}
    return tuple(trigger for trigger in DECISION_TRIGGERS if trigger in found)


@traces(SWR.SWR_3512, SWR.SWR_3506)
def require_human(actor: DeliveryActor, *, what: str) -> DeliveryActor:
    """*actor*, if it is a person; a refusal otherwise. Pure.

    SWR-3512's whole subject is the set of decisions that must "reach the user
    rather than being decided by an agent". Without this function that sentence
    is a convention: :class:`DeliveryActor` carries :attr:`ActorKind.SYSTEM` as
    happily as :attr:`ActorKind.USER`, the transition matrix permits both out of
    ``Blocked``, and an agent answering its own question would unblock the
    requirement with an audit trail that reads perfectly.

    So the check lives at the one place an answer is turned into a record, and
    it is a *type* question rather than a string one: ``system`` is refused
    whatever it is called, and a user is required to be named, because "a human
    approved this" is not a recoverable fact months later without one.
    """
    if actor.kind is not ActorKind.USER:
        raise DecisionError(
            f"{what} is a decision a person takes; {actor.label} is not a person."
            " SWR-3512 exists so an agent cannot answer its own question",
        )
    if not actor.name.strip():
        raise DecisionError(
            f"{what} names the person who took it; an unnamed user is not an"
            " audit trail (SWR-3512, SWR-3213)",
        )
    return actor


@traces(SWR.SWR_3512, SWR.SWR_3506)
def is_concrete_question(question: str) -> bool:
    """Whether *question* is something a human can actually answer. Pure.

    Three rules, and each of them rejects a real failure mode seen in agent
    output: it has to *be* a question (end in a question mark), it must not be
    one of the :data:`GENERIC_QUESTIONS`, and it must be long enough to have
    named what it is about (:data:`MIN_QUESTION_CHARS`).
    """
    cleaned = question.strip()
    if not cleaned.endswith("?"):
        return False
    if cleaned.rstrip("?").strip().casefold() in GENERIC_QUESTIONS:
        return False
    return len(cleaned) >= MIN_QUESTION_CHARS


@traces(SWR.SWR_3512)
class DecisionOption(BaseModel):
    """One thing that could be decided, and what follows from deciding it.

    The consequence is mandatory. An option list without consequences is a menu,
    not a decision: the user is exactly the person who cannot look up what
    ``keep the old behaviour`` would cost, which is why they are being asked.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    consequence: str
    #: What this option would mean in the requirement's own terms, when the
    #: option name is not self-explaining.
    detail: str = ""

    @field_validator("name", "consequence")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DecisionError(
                "an option names both what would be done and what follows from it (SWR-3512)",
            )
        return cleaned

    @property
    def message(self) -> str:
        """``keep the old behaviour — existing clients keep working``."""
        detail = f" ({self.detail})" if self.detail else ""
        return f"{self.name} — {self.consequence}{detail}"


@traces(SWR.SWR_3512, SWR.SWR_3506)
class PendingDecision(BaseModel):
    """One decision waiting for a human: the question, the options, the state.

    Immutable, and refused unless it is answerable — a concrete question and at
    least two options that each name their consequence. That is the whole
    difference between SWR-3512 and a generic "blocked" flag, and it is enforced
    here so no caller can produce the generic version.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    trigger: DecisionTrigger
    question: str
    options: tuple[DecisionOption, ...]
    #: Where the requirement waits. Defaults from :data:`DECISION_TARGETS`; a
    #: caller may only choose the other permitted state, never a third one.
    target: DeliveryState | None = None
    raised_at: dt.datetime
    raised_by: DeliveryActor = DECISION_ACTOR
    #: The requirement's ``current_hash`` when the decision was raised.
    requirement_hash: str = ""
    detail: str = ""

    @field_validator("raised_at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise DecisionError("a decision carries an aware timestamp, never a naive one")
        return value

    @field_validator("req_id")
    @classmethod
    def _named(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DecisionError("a decision names the requirement it is about")
        return cleaned

    @model_validator(mode="after")
    def _answerable(self) -> Self:
        if not is_concrete_question(self.question):
            raise DecisionError(
                f"{self.req_id}: {self.question!r} is not a question a person can answer;"
                " SWR-3512 asks for the decision, the options and their consequences",
            )
        if len(self.options) < 2:
            raise DecisionError(
                f"{self.req_id}: a decision names at least two options; got"
                f" {len(self.options)} — with one option there is nothing to decide",
            )
        names = [option.name.casefold() for option in self.options]
        if len(set(names)) != len(names):
            raise DecisionError(f"{self.req_id}: two options of one decision are named alike")
        if self.target not in {DeliveryState.BLOCKED, DeliveryState.REVIEW, None}:
            raise DecisionError(
                f"{self.req_id}: a decision waits in Blocked or Review, not in"
                f" {self.target.label if self.target else '?'} (SWR-3512)",
            )
        return self

    @classmethod
    @traces(SWR.SWR_3512)
    def raised(
        cls,
        req_id: str,
        trigger: DecisionTrigger,
        *,
        question: str,
        options: Sequence[DecisionOption],
        at: dt.datetime,
        by: DeliveryActor = DECISION_ACTOR,
        requirement_hash: str = "",
        detail: str = "",
    ) -> Self:
        """A pending decision parked in the state its trigger belongs in."""
        return cls(
            req_id=req_id,
            trigger=trigger,
            question=question,
            options=tuple(options),
            target=DECISION_TARGETS[trigger],
            raised_at=at,
            raised_by=by,
            requirement_hash=requirement_hash,
            detail=detail,
        )

    @property
    def waits_in(self) -> DeliveryState:
        """The state this decision parks the requirement in."""
        return self.target or DECISION_TARGETS[self.trigger]

    @property
    def option_names(self) -> tuple[str, ...]:
        """The alternatives, in the order they were offered."""
        return tuple(option.name for option in self.options)

    @property
    def decision_id(self) -> str:
        """The id this decision and its answer are filed under.

        Derived from the decision's own fields, so the id shown beside a blocked
        card and the id in the recorded answer are the same value by
        construction rather than by a caller copying one into the other.
        """
        return content_hash(
            "\x1e".join(
                (
                    f"req\x1f{self.req_id}",
                    f"trigger\x1f{self.trigger}",
                    f"at\x1f{self.raised_at.isoformat()}",
                    f"question\x1f{content_hash(self.question.strip())}",
                    *(f"option\x1f{option.name}" for option in self.options),
                ),
            ),
        )

    @property
    def consequences(self) -> tuple[str, ...]:
        """One line per option, for the audit trail and the card."""
        return tuple(option.message for option in self.options)

    @property
    def message(self) -> str:
        """The whole decision as one line: what is asked, and what the options cost."""
        return f"{self.req_id}: {self.trigger.label} — {self.question} [{'; '.join(self.consequences)}]"

    def option(self, name: str) -> DecisionOption | None:
        """The offered option of that name, case-insensitively, or ``None``."""
        wanted = name.strip().casefold()
        return next(
            (option for option in self.options if option.name.casefold() == wanted),
            None,
        )

    @traces(SWR.SWR_3512)
    def transition_request(
        self, *, cause: TransitionCause = TransitionCause.BLOCKER_RAISED
    ) -> TransitionRequest:
        """The move into ``Blocked`` or ``Review`` this decision asks for.

        Exposed rather than hidden inside :meth:`HumanDecisions.raise_for`,
        because it is the half a reviewer checks: the question travels as the
        blocker's *reason*, so a blocked card can never show less than the
        question that blocked it (SWR-3201, SWR-3506).
        """
        return TransitionRequest(
            req_id=self.req_id,
            target=self.waits_in,
            actor=self.raised_by,
            cause=cause,
            at=self.raised_at,
            requirement_hash=self.requirement_hash,
            reason=self.question,
            detail=self.detail or str(self.trigger),
        )

    @traces(SWR.SWR_3512)
    def answered(
        self,
        option: str,
        *,
        by: DeliveryActor,
        at: dt.datetime,
        rationale: str = "",
    ) -> DecisionRecord:
        """The record of this decision being answered with *option*.

        An answer naming an option that was never offered is refused rather than
        recorded: a trail that says the user chose something nobody proposed is
        worse than no trail (SWR-3512's third acceptance criterion).

        *by* has to be a **named person** (:func:`require_human`). The whole
        requirement is that these decisions reach the user, and a system actor
        answering here would be the agent deciding — with the block cleared and
        the trail claiming somebody was asked.
        """
        require_human(by, what=f"{self.req_id}: {self.trigger.label}")
        chosen = self.option(option)
        if chosen is None:
            raise DecisionError(
                f"{self.req_id}: {option!r} was not one of the options offered"
                f" ({', '.join(self.option_names)})",
            )
        return DecisionRecord(
            decision_id=self.decision_id,
            req_id=self.req_id,
            trigger=self.trigger,
            question=self.question,
            options=self.options,
            chosen=chosen.name,
            consequence=chosen.consequence,
            answered_by=by,
            answered_at=at,
            rationale=rationale.strip(),
        )


@traces(SWR.SWR_3512)
class DecisionRecord(BaseModel):
    """One answered decision: what was asked, what was chosen, by whom, when.

    Self-contained on purpose. The options are kept *with* the answer, because
    "the user chose to keep the old behaviour" means nothing months later
    without the alternative they turned down and what it would have cost.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    decision_id: str
    req_id: str
    trigger: DecisionTrigger
    question: str
    options: tuple[DecisionOption, ...]
    chosen: str
    consequence: str
    answered_by: DeliveryActor
    answered_at: dt.datetime
    rationale: str = ""

    @field_validator("answered_at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise DecisionError("a decision is answered at an aware time, never a naive one")
        return value

    @field_validator("answered_by")
    @classmethod
    def _human(cls, value: DeliveryActor) -> DeliveryActor:
        """Checked on the model, not only in :meth:`PendingDecision.answered`.

        The record is the artefact everything downstream trusts, and it is
        constructible directly — so a system actor has to be refused *here* too,
        or the gate is only as good as the one code path that happens to use it.
        """
        return require_human(value, what="an answered decision")

    @model_validator(mode="after")
    def _chosen_was_offered(self) -> Self:
        if self.chosen.casefold() not in {option.name.casefold() for option in self.options}:
            raise DecisionError(
                f"{self.req_id}: the recorded answer {self.chosen!r} is not one of the"
                " options that were offered (SWR-3512)",
            )
        return self

    @property
    def message(self) -> str:
        """One line for a history view: the answer, its actor and its time."""
        why = f" ({self.rationale})" if self.rationale else ""
        return (
            f"{self.req_id}: {self.trigger.label} — {self.chosen} chosen by"
            f" {self.answered_by.label} on {self.answered_at.isoformat()}{why}"
        )

    @traces(SWR.SWR_3512, SWR.SWR_3213)
    def to_event(
        self, *, from_state: DeliveryState | None = None, to_state: DeliveryState | None = None
    ) -> AuditEvent:
        """The audit entry for this answer (SWR-3213).

        The question and every option's consequence travel as ``evidence``, so
        the trail carries the decision *as it was put*, not a summary of it.
        """
        return AuditEvent(
            req_id=self.req_id,
            kind=AuditEventKind.DELIVERY_TRANSITION,
            at=self.answered_at,
            actor=self.answered_by,
            from_state=from_state,
            to_state=to_state,
            cause=TransitionCause.BLOCKER_CLEARED,
            reason=f"{self.chosen}: {self.consequence}",
            evidence=(self.question, *(option.message for option in self.options)),
            detail=f"{self.trigger} answered ({self.decision_id})",
        )


@traces(SWR.SWR_3512)
class DecisionLog(BaseModel):
    """Every decision ever put to a human about one requirement, oldest first.

    Append-only by construction: :meth:`appended` returns a new log and nothing
    here removes, replaces or reorders an entry. A decision reversed later is
    two records, which is the only way "we changed our mind in March" stays
    readable.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    records: tuple[DecisionRecord, ...] = ()

    @property
    def empty(self) -> bool:
        """Whether nothing was ever decided about this requirement."""
        return not self.records

    @property
    def latest(self) -> DecisionRecord | None:
        """The most recent answer, or ``None``."""
        return self.records[-1] if self.records else None

    def appended(self, record: DecisionRecord) -> DecisionLog:
        """This log with *record* as its newest entry."""
        if record.req_id != self.req_id:
            raise DecisionError(
                f"{record.req_id}'s decision cannot be appended to {self.req_id}'s log",
            )
        return DecisionLog(req_id=self.req_id, records=(*self.records, record))

    def of_trigger(self, *triggers: DecisionTrigger) -> tuple[DecisionRecord, ...]:
        """Every answer to a decision of the given triggers, oldest first."""
        wanted = frozenset(triggers)
        return tuple(record for record in self.records if record.trigger in wanted)

    def get(self, decision_id: str) -> DecisionRecord | None:
        """The answer filed under *decision_id*, or ``None``."""
        wanted = decision_id.strip()
        return next((record for record in self.records if record.decision_id == wanted), None)


@traces(SWR.SWR_3512)
class DecisionOutcome(BaseModel):
    """What raising or answering one decision actually produced."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    pending: PendingDecision
    #: The state machine's answer, or ``None`` when no transition was attempted.
    outcome: TransitionOutcome | None = None
    #: The audit entry written, or ``None`` when nothing moved.
    event: AuditEvent | None = None
    #: The answer, once there is one.
    record: DecisionRecord | None = None

    @property
    def moved(self) -> bool:
        """Whether the requirement actually moved into the waiting state."""
        return self.outcome is not None and self.outcome.accepted

    @property
    def refused(self) -> bool:
        """Whether the state machine refused the move."""
        return self.outcome is not None and not self.outcome.accepted

    @property
    def message(self) -> str:
        """The transition's line when one happened, else the decision's."""
        if self.outcome is not None:
            return self.outcome.message
        return self.pending.message


@traces(SWR.SWR_3512, SWR.SWR_3213)
class HumanDecisions:
    """Put a decision to a human, and record what came back.

    Two collaborators and both are narrow: a
    :class:`~rotaris_core.requirements.change.detection.TransitionDoor`, because
    a delivery state may only move through the state machine (SWR-3203), and an
    optional :class:`~rotaris_core.requirements.change.detection.AuditSink`,
    because SWR-3512 requires the decision and its actor to be recorded and
    SWR-3213 owns where.

    **Nothing here can do the work it postpones.** There is no analyst, no
    runner and no unit store in the constructor, so a decision point cannot
    "helpfully" proceed — and an evaluation that raised a decision cannot
    trigger another evaluation through it.

    The audit entry is written **only** for a move the state machine accepted. A
    refused move that still left "we asked the user" in the trail would make the
    trail claim something that did not happen.

    **And it cannot recurse.** Both collaborators are injected, so "holds nothing
    that could ask for another pass" is a claim about values this class never
    sees the type of. A :class:`~rotaris_core.requirements.change.detection.ReentrancyGuard`
    on :meth:`raise_for` and :meth:`answer` makes a door that decides on write
    raise :class:`~rotaris_core.requirements.change.detection.PropagationLoopError`
    rather than nest a second decision inside the first — which would otherwise
    record the same question twice and move the requirement from a state it had
    already left.
    """

    def __init__(
        self,
        transitions: TransitionDoor,
        *,
        audit: AuditSink | None = None,
        actor: DeliveryActor = DECISION_ACTOR,
    ) -> None:
        self._transitions = transitions
        self._audit = audit
        self._actor = actor
        self._guard = ReentrancyGuard(f"{type(self).__name__}")

    @property
    def actor(self) -> DeliveryActor:
        """Who raises decisions through this instance."""
        return self._actor

    @traces(SWR.SWR_3512)
    def raise_for(
        self,
        pending: PendingDecision,
        *,
        cause: TransitionCause = TransitionCause.BLOCKER_RAISED,
    ) -> DecisionOutcome:
        """Park *pending*'s requirement and record that a person was asked."""
        with self._guard:
            outcome = self._transitions.apply(pending.transition_request(cause=cause))
            if not outcome.accepted:
                return DecisionOutcome(pending=pending, outcome=outcome)
            event = self._raised_event(pending, outcome)
            return DecisionOutcome(pending=pending, outcome=outcome, event=event)

    def _raised_event(
        self,
        pending: PendingDecision,
        outcome: TransitionOutcome,
    ) -> AuditEvent | None:
        if self._audit is None:
            return None
        transition = outcome.transition
        event = AuditEvent(
            req_id=pending.req_id,
            kind=AuditEventKind.DELIVERY_TRANSITION,
            at=pending.raised_at,
            actor=pending.raised_by,
            from_state=transition.source if transition is not None else None,
            to_state=pending.waits_in,
            cause=transition.cause if transition is not None else TransitionCause.BLOCKER_RAISED,
            reason=pending.question,
            requirement_hash=pending.requirement_hash,
            evidence=pending.consequences,
            detail=f"{pending.trigger} raised ({pending.decision_id})",
        )
        return self._audit.append(event)

    @traces(SWR.SWR_3512)
    def answer(
        self,
        pending: PendingDecision,
        option: str,
        *,
        by: DeliveryActor,
        at: dt.datetime,
        rationale: str = "",
        resume_to: DeliveryState | None = None,
    ) -> DecisionOutcome:
        """Record the answer, and let the requirement out of its waiting state.

        The record is written whether or not the requirement moves: the fact
        that a person decided is worth keeping even when the state machine
        refuses the move that was meant to follow it. *resume_to* is optional
        because "the decision is made, the work is scheduled separately" is a
        normal shape — nothing here starts the work.

        A system *by* is refused before anything moves (:func:`require_human`),
        so an agent cannot answer the question it was blocked on and walk the
        requirement out of ``Blocked`` on its own signature.
        """
        record = pending.answered(option, by=by, at=at, rationale=rationale)
        with self._guard:
            if resume_to is None:
                event = self._audit.append(record.to_event()) if self._audit is not None else None
                return DecisionOutcome(pending=pending, record=record, event=event)
            outcome = self._transitions.apply(
                TransitionRequest(
                    req_id=pending.req_id,
                    target=resume_to,
                    actor=by,
                    cause=TransitionCause.BLOCKER_CLEARED,
                    at=at,
                    requirement_hash=pending.requirement_hash,
                    detail=f"{pending.trigger} answered: {record.chosen}",
                ),
            )
            if not outcome.accepted:
                return DecisionOutcome(pending=pending, outcome=outcome, record=record)
            event = None
            if self._audit is not None:
                transition = outcome.transition
                event = self._audit.append(
                    record.to_event(
                        from_state=transition.source if transition is not None else None,
                        to_state=resume_to,
                    ),
                )
            return DecisionOutcome(pending=pending, outcome=outcome, record=record, event=event)
