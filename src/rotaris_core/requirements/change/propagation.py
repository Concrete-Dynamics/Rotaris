"""Stale evidence propagates too, and never through the text (SWR-3513).

A requirement's text is only one of the things that can invalidate a delivery.
Delete the covering test, refactor the implementation out from under the trace,
rebase away the verified commit — the requirement still reads exactly as it did,
its ``current_hash`` still equals its ``satisfied_hash``, and SWR-3502's
comparison sees nothing at all. The card stays green while the evidence behind it
is gone, which is the same drift this product exists to prevent, arriving through
the other door.

So the staleness reasons of SWR-3209 feed the *same* propagation machinery as a
requirement change — and feed it **without an impact analysis**:

```text
StalenessFinding*  ─▶ propagate_evidence()  ─▶ EvidencePropagation
(SWR-3209, facts)        (pure, no model)          action / reasons / units / target
                                                          │
                                    EvidencePropagator.apply() ─▶ TransitionDoor
                                                                  AuditSink
```

Three properties are structural, and each of them is one of SWR-3513's
acceptance criteria:

**Evidence loss is arithmetic, not judgement.** A deleted covering test is a
fact: the site was recorded at verification time and it is not there now. There
is nothing for a model to interpret, so :func:`propagate_evidence` is a pure
function of findings and this module holds no analyst at all —
:func:`analyser_free_report` turns that from a claim into a check a test runs,
the same way :func:`~rotaris_core.requirements.change.impact.read_only_report`
does for the read-only guarantee. Asking a model whether a deleted test matters
would be slower, more expensive and less correct.

**The reason names the evidence, never the specification.** ``specification
moved`` is a staleness reason of SWR-3209 too, and it is deliberately *not*
handled here: it belongs to SWR-3502's hash comparison, and handling it in both
places would move one requirement twice for one cause.
:attr:`EvidencePropagation.ignored` reports it as consciously left alone rather
than silently dropped.

**Coming back costs a verification.** :meth:`EvidencePropagator.restore` re-runs
the checks and only then asks for ``Done`` — restoring a deleted file proves the
file exists, not that it passes (SWR-3513's fourth acceptance criterion, and the
same ordering SWR-3504 applies to a hash adoption).

Propagation terminates here for the same reason it does in
:mod:`~rotaris_core.requirements.change.outcomes`: a pass walks a finite set once,
holds nothing that could ask for another pass, and
:class:`~rotaris_core.requirements.change.outcomes.ReentrancyGuard` refuses a
nested call from a collaborator.
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from typing import TYPE_CHECKING, Self

from pydantic import BaseModel, ConfigDict, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.outcomes import (
    UNIT_KEY_IMPLEMENTATION,
    UNIT_KEY_TESTS,
    OutcomeError,
    ReentrancyGuard,
    Reverification,  # noqa: TC001 - Pydantic resolves this at runtime.
    ReverificationRequest,
)
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind
from rotaris_core.requirements.delivery.staleness import StalenessReason
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import (
    TransitionOutcome,  # noqa: TC001 - Pydantic resolves this at runtime.
    TransitionRequest,
)
from rotaris_core.requirements.execution.units import UnitSpec
from rotaris_core.requirements.model import requirement_sort_key

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence

    from rotaris_core.requirements.change.detection import AuditSink, TransitionDoor
    from rotaris_core.requirements.change.outcomes import Reverifier
    from rotaris_core.requirements.delivery.staleness import StalenessFinding
    from rotaris_core.requirements.delivery.store import DeliveryRecord

__all__ = [
    "ANALYSIS_OPERATIONS",
    "EVIDENCE_ACTOR",
    "EVIDENCE_CAUSE",
    "RESTORING_REASONS",
    "TEXT_REASONS",
    "EvidenceAction",
    "EvidenceOutcome",
    "EvidencePropagation",
    "EvidencePropagator",
    "PropagationError",
    "analyser_free_report",
    "propagate_evidence",
]


class PropagationError(OutcomeError):
    """An evidence propagation was asked for something evidence cannot answer."""


#: Who an evidence-driven propagation acts as. Distinct from
#: ``change-detection`` (SWR-3502) on purpose: the audit trail has to
#: distinguish "the specification moved" from "the evidence disappeared", and a
#: shared actor would make the two indistinguishable in a history view.
EVIDENCE_ACTOR = DeliveryActor.system("evidence-propagation")

#: The transition cause an evidence-driven move is recorded under.
#:
#: This was ``run-failed`` for as long as SWR-3203's vocabulary had nothing
#: better — the nearest member, chosen because none of them meant "the evidence
#: behind this delivery is gone". The comment here said adding a dedicated cause
#: would be one edit, and when SWR-3513 got its production path it became one:
#: a user reading "run-failed" over a deleted covering test goes looking for a
#: run that never happened, and this is the first build in which anybody could
#: read it at all.
EVIDENCE_CAUSE = TransitionCause.EVIDENCE_LOST

#: Staleness reasons that belong to the *text* path, not to this one. Handled by
#: :func:`~rotaris_core.requirements.change.detection.assess_specification`
#: (SWR-3502); reported here as consciously ignored so nothing moves twice.
TEXT_REASONS: frozenset[StalenessReason] = frozenset({StalenessReason.SPECIFICATION_MOVED})

#: Reasons that mean a recorded site is *gone* rather than merely touched. These
#: are the ones that produce units: a file that changed can be re-verified, a
#: file that no longer exists has to be written again.
RESTORING_REASONS: frozenset[StalenessReason] = frozenset(
    {
        StalenessReason.COVERING_TEST_DISAPPEARED,
        StalenessReason.TRACE_DISAPPEARED,
    },
)

#: Method names that mean "this object can judge a requirement's text". Used by
#: :func:`analyser_free_report` to check a propagation pass structurally rather
#: than by reading its constructor and trusting what it says.
ANALYSIS_OPERATIONS: frozenset[str] = frozenset({"analyse", "analyze", "classify", "judge"})


@traces(SWR.SWR_3513)
def analyser_free_report(propagator: object) -> tuple[str, ...]:
    """Name every text-analysis operation reachable from *propagator*'s attributes.

    SWR-3513's third acceptance criterion as a check rather than a promise: an
    evidence propagation holds a transition door, an audit sink, a verifier, an
    actor and a cause, and none of those may be able to judge requirement prose.
    An empty result is the guarantee; a non-empty one names
    ``attribute.operation`` so the offending collaborator is obvious.

    Deliberately shallow — one level of attributes, exactly like
    :func:`~rotaris_core.requirements.change.impact.read_only_report`. A deep
    walk would report every method of every value transitively reachable, and a
    check that always fires is a check nobody reads.
    """
    found: list[str] = []
    for name, value in sorted(vars(propagator).items()):
        if value is None or isinstance(value, str | int | float | bool | bytes):
            continue
        found.extend(
            f"{name.lstrip('_')}.{operation}"
            for operation in sorted(ANALYSIS_OPERATIONS)
            if callable(getattr(value, operation, None))
        )
    return tuple(found)


@traces(SWR.SWR_3513)
class EvidenceAction(StrEnum):
    """What the evidence — and only the evidence — says has to happen.

    Four answers, ordered by how much they cost, and a pass picks exactly one:
    the most expensive applicable answer wins, because a requirement whose
    verification failed *and* whose test disappeared does not need two passes.
    """

    #: Every recorded site is where it was and nothing has been touched.
    NOTHING = "nothing"
    #: A file under the evidence moved; run the checks again before judging.
    REVERIFY = "reverify"
    #: A recorded trace or covering test is gone; units write it back.
    RESTORE = "restore"
    #: A verification ran and did not pass; state it and leave ``Done``.
    REPORT_FAILURE = "report-failure"


@traces(SWR.SWR_3513)
class EvidencePropagation(BaseModel):
    """What one requirement's evidence, on its own, asks for.

    A pure value: no store was read to produce it and none is written by holding
    it. The invariants are the acceptance criteria — a target that is never
    anything but ``Needs Update``, units for exactly the sites that are actually
    missing, a failure stated only where one happened — so an incoherent plan
    cannot be built and noticed later.

    Units are tied to :attr:`lost_traces` / :attr:`lost_tests` rather than to
    :attr:`action`. A failed verification outranks a lost site when it comes to
    *naming* what happened, but it does not make the lost site come back, so a
    ``report-failure`` plan over a disappeared test carries the same restoring
    unit a ``restore`` would.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    action: EvidenceAction
    #: The evidence causes this plan rests on, in the order SWR-3209 sorted them.
    reasons: tuple[StalenessReason, ...] = ()
    #: Causes deliberately left to the text path (SWR-3502).
    ignored: tuple[StalenessReason, ...] = ()
    #: The sites that are gone, as repository-relative paths.
    lost_traces: tuple[str, ...] = ()
    lost_tests: tuple[str, ...] = ()
    #: The state this plan asks for, or ``None``. Never anything but
    #: ``Needs Update``: evidence loss does not make delivered work unbuilt.
    target: DeliveryState | None = None
    units: tuple[UnitSpec, ...] = ()
    #: What the verification reported, when one had run and failed.
    failure: str = ""

    @model_validator(mode="after")
    def _coherent(self) -> Self:
        if self.target not in {None, DeliveryState.NEEDS_UPDATE}:
            raise PropagationError(
                f"{self.req_id}: stale evidence sends a requirement to Needs Update or"
                f" nowhere, never to {self.target.label if self.target else '?'} (SWR-3513)",
            )
        lost = bool(self.lost_traces or self.lost_tests)
        if self.action is EvidenceAction.RESTORE and not self.units:
            raise PropagationError(
                f"{self.req_id}: a restore plans the units that write the missing"
                " site back; without them it is a report (SWR-3513)",
            )
        if self.action is EvidenceAction.REPORT_FAILURE and bool(self.units) != lost:
            raise PropagationError(
                f"{self.req_id}: a stated failure plans restoring units for exactly the"
                " sites that are gone — no more, and no fewer (SWR-3513)",
            )
        if self.units and self.action in {EvidenceAction.NOTHING, EvidenceAction.REVERIFY}:
            raise PropagationError(
                f"{self.req_id}: units restore a site that is gone; {self.action} has"
                " none to restore (SWR-3513)",
            )
        if bool(self.failure.strip()) != (self.action is EvidenceAction.REPORT_FAILURE):
            raise PropagationError(
                f"{self.req_id}: a stated failure belongs to a verification that ran"
                f" and failed, not to {self.action}",
            )
        if (self.action is EvidenceAction.NOTHING) and self.reasons:
            raise PropagationError(
                f"{self.req_id}: {list(self.reasons)} is a reason to do something",
            )
        if set(self.reasons) & TEXT_REASONS:
            raise PropagationError(
                f"{self.req_id}: {sorted(TEXT_REASONS)} is the specification's cause and"
                " is answered by SWR-3502, not by evidence propagation",
            )
        return self

    @property
    def leaves_done(self) -> bool:
        """Whether this takes the requirement out of ``Done``."""
        return self.target is DeliveryState.NEEDS_UPDATE

    @property
    def moves(self) -> bool:
        """Whether this asks for a delivery transition at all."""
        return self.target is not None

    @property
    def causes(self) -> tuple[str, ...]:
        """The evidence causes as lines, for the audit trail and the card."""
        lines = [f"evidence cause: {reason}" for reason in self.reasons]
        lines += [f"lost trace: {path}" for path in self.lost_traces]
        lines += [f"lost covering test: {path}" for path in self.lost_tests]
        if self.failure:
            lines.append(f"verification failed: {self.failure}")
        return tuple(lines)

    @property
    def message(self) -> str:
        """One line, and it names the *evidence*, never the specification.

        SWR-3513's second acceptance criterion: a user whose test was deleted has
        to read "the covering test is gone", not "the requirement changed" —
        because the requirement did not change and looking for the edit would
        waste their afternoon.
        """
        if self.action is EvidenceAction.NOTHING:
            return f"{self.req_id}: the recorded evidence is still where it was"
        if self.action is EvidenceAction.REPORT_FAILURE:
            gone = ", ".join((*self.lost_tests, *self.lost_traces))
            also = f", and {gone} is gone" if gone else ""
            return (
                f"{self.req_id}: the delivery is no longer evidenced — the verification"
                f" failed ({self.failure}){also}; the requirement text did not change"
            )
        if self.action is EvidenceAction.RESTORE:
            gone = ", ".join((*self.lost_tests, *self.lost_traces))
            return (
                f"{self.req_id}: the delivery is no longer evidenced — {gone} is gone;"
                " the requirement text did not change"
            )
        return (
            f"{self.req_id}: the evidence was touched ({', '.join(str(r) for r in self.reasons)});"
            " it is re-verified before anything is judged"
        )


def _subjects(findings: Sequence[StalenessFinding], reason: StalenessReason) -> tuple[str, ...]:
    """The subjects of every finding of *reason*, deduplicated, in order."""
    seen: list[str] = []
    for finding in findings:
        if finding.reason is reason and finding.subject and finding.subject not in seen:
            seen.append(finding.subject)
    return tuple(seen)


@traces(SWR.SWR_3513)
def propagate_evidence(
    req_id: str,
    findings: Sequence[StalenessFinding],
    *,
    state: DeliveryState,
    verification: Reverification | None = None,
) -> EvidencePropagation:
    """What *findings* alone ask for. Pure — and no requirement text is read.

    The precedence is by cost, most expensive first: a failed verification is the
    strongest statement available about a delivery and outranks everything; a
    site that is *gone* outranks a site that merely moved; anything else is a
    reason to re-verify before judging.

    *state* decides only whether there is a ``Done`` to leave. A requirement that
    is already in ``Needs Update`` gets the same units and the same reasons and
    no transition, because moving it to where it already is would be a second
    audit entry saying nothing.
    """
    owned = tuple(finding for finding in findings if finding.reason not in TEXT_REASONS)
    ignored = tuple(
        dict.fromkeys(finding.reason for finding in findings if finding.reason in TEXT_REASONS)
    )
    reasons = tuple(dict.fromkeys(finding.reason for finding in owned))
    lost_tests = _subjects(owned, StalenessReason.COVERING_TEST_DISAPPEARED)
    lost_traces = _subjects(owned, StalenessReason.TRACE_DISAPPEARED)
    out_of_done = DeliveryState.NEEDS_UPDATE if state is DeliveryState.DONE else None

    if verification is not None and not verification.passed:
        # The most informative case must not produce the least work: a
        # requirement whose covering test disappeared *and* whose verification
        # failed still needs that test written back. Naming the lost site while
        # planning nothing to restore it would leave the one plan that knows
        # exactly what to do as the only one that does nothing.
        return EvidencePropagation(
            req_id=req_id,
            action=EvidenceAction.REPORT_FAILURE,
            reasons=reasons,
            ignored=ignored,
            lost_traces=lost_traces,
            lost_tests=lost_tests,
            target=out_of_done,
            units=(
                _restoring_units(req_id, lost_tests=lost_tests, lost_traces=lost_traces)
                if (lost_tests or lost_traces)
                else ()
            ),
            failure=verification.failure,
        )
    if lost_tests or lost_traces:
        return EvidencePropagation(
            req_id=req_id,
            action=EvidenceAction.RESTORE,
            reasons=reasons,
            ignored=ignored,
            lost_traces=lost_traces,
            lost_tests=lost_tests,
            target=out_of_done,
            units=_restoring_units(req_id, lost_tests=lost_tests, lost_traces=lost_traces),
        )
    if reasons:
        return EvidencePropagation(
            req_id=req_id,
            action=EvidenceAction.REVERIFY,
            reasons=reasons,
            ignored=ignored,
        )
    return EvidencePropagation(
        req_id=req_id,
        action=EvidenceAction.NOTHING,
        ignored=ignored,
    )


@traces(SWR.SWR_3513, SWR.SWR_3505)
def _restoring_units(
    req_id: str,
    *,
    lost_tests: Sequence[str],
    lost_traces: Sequence[str],
) -> tuple[UnitSpec, ...]:
    """The units that write a lost trace or covering test back.

    Scoped to the sites that are actually gone rather than to the requirement's
    whole surface — the same rule SWR-3505 applies to a changed requirement, for
    the same reason: a unit told "SWR-9001 has fourteen traces" re-discovers the
    thirteen that are fine.

    When both are gone the covering test comes first and the implementation
    waits for it, because the test is what will judge the implementation.
    """
    units: list[UnitSpec] = []
    if lost_tests:
        units.append(
            UnitSpec(
                key=UNIT_KEY_TESTS,
                title=f"Restore the covering tests of {req_id}",
                scope=(
                    "Covering tests recorded at verification time and no longer present: "
                    + ", ".join(lost_tests)
                ),
            ),
        )
    if lost_traces:
        units.append(
            UnitSpec(
                key=UNIT_KEY_IMPLEMENTATION,
                title=f"Restore the implementation traces of {req_id}",
                scope=(
                    "Implementation sites recorded at verification time and no longer "
                    "present: " + ", ".join(lost_traces)
                ),
                depends_on=(UNIT_KEY_TESTS,) if lost_tests else (),
            ),
        )
    return tuple(units)


@traces(SWR.SWR_3513)
class EvidenceOutcome(BaseModel):
    """What one evidence propagation actually produced."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    plan: EvidencePropagation
    #: The state machine's answer, or ``None`` when no transition was attempted.
    outcome: TransitionOutcome | None = None
    #: The audit entry written, or ``None`` when nothing moved.
    event: AuditEvent | None = None
    #: The verification that was run, for the restore path.
    verification: Reverification | None = None

    @property
    def moved(self) -> bool:
        """Whether the delivery state actually changed."""
        return self.outcome is not None and self.outcome.accepted

    @property
    def refused(self) -> bool:
        """Whether a transition was attempted and the state machine refused it."""
        return self.outcome is not None and not self.outcome.accepted

    @property
    def message(self) -> str:
        """The transition's line when one happened, else the plan's."""
        if self.outcome is not None:
            return self.outcome.message
        return self.plan.message


@traces(SWR.SWR_3513, SWR.SWR_3213)
class EvidencePropagator:
    """Apply SWR-3513's rules through the state machine and the audit trail.

    Three collaborators, all injected and all narrow: a
    :class:`~rotaris_core.requirements.change.detection.TransitionDoor` because a
    delivery state moves in exactly one place (SWR-3203), an optional
    :class:`~rotaris_core.requirements.change.detection.AuditSink` because the
    move has to be recorded (SWR-3213), and an optional
    :class:`~rotaris_core.requirements.change.outcomes.Reverifier` for the way
    back — restoring a file proves the file exists, not that it passes.

    **There is no analyst here and there cannot be one.** That is SWR-3513's
    third acceptance criterion, and :func:`analyser_free_report` checks it.

    **The pass terminates.** :meth:`run` walks a finite set of records exactly
    once, holds nothing that could ask for another evaluation, and
    :class:`~rotaris_core.requirements.change.outcomes.ReentrancyGuard` refuses a
    nested call — so a door or a sink that calls back gets a stated error rather
    than starting a second pass over a half-applied state.
    """

    def __init__(
        self,
        transitions: TransitionDoor,
        *,
        audit: AuditSink | None = None,
        verifier: Reverifier | None = None,
        actor: DeliveryActor = EVIDENCE_ACTOR,
        cause: TransitionCause = EVIDENCE_CAUSE,
    ) -> None:
        self._transitions = transitions
        self._audit = audit
        self._verifier = verifier
        self._actor = actor
        self._cause = cause
        self._guard = ReentrancyGuard(f"{type(self).__name__}.apply")

    @property
    def actor(self) -> DeliveryActor:
        """Who this pass acts as."""
        return self._actor

    @property
    def can_verify(self) -> bool:
        """Whether a verifier is configured, so a restore can be earned."""
        return self._verifier is not None

    @traces(SWR.SWR_3513)
    def request_for(
        self,
        plan: EvidencePropagation,
        *,
        at: dt.datetime,
        requirement_hash: str = "",
    ) -> TransitionRequest | None:
        """The transition *plan* asks for, or ``None`` when it asks for none.

        Exposed because it is the half a reviewer checks: the *reason* carries
        the evidence cause, so a card taken out of ``Done`` by a deleted test
        says so instead of sending its owner looking for a specification edit.
        """
        if plan.target is None:
            return None
        return TransitionRequest(
            req_id=plan.req_id,
            target=plan.target,
            actor=self._actor,
            cause=self._cause,
            at=at,
            requirement_hash=requirement_hash,
            detail=plan.message,
        )

    @traces(SWR.SWR_3513, SWR.SWR_3213)
    def apply(
        self,
        plan: EvidencePropagation,
        *,
        at: dt.datetime,
        requirement_hash: str = "",
    ) -> EvidenceOutcome:
        """Carry out *plan*, recording what happened.

        A plan that asks for nothing costs nothing — no transition, no audit
        line, no write — which is what makes this safe to run on every
        evaluation (SWR-3210) rather than only when somebody remembers to.
        """
        with self._guard:
            request = self.request_for(plan, at=at, requirement_hash=requirement_hash)
            if request is None:
                return EvidenceOutcome(plan=plan)
            outcome = self._transitions.apply(request)
            if not outcome.accepted:
                return EvidenceOutcome(plan=plan, outcome=outcome)
            return EvidenceOutcome(
                plan=plan,
                outcome=outcome,
                event=self._record(plan, outcome, at=at, requirement_hash=requirement_hash),
            )

    def _record(
        self,
        plan: EvidencePropagation,
        outcome: TransitionOutcome,
        *,
        at: dt.datetime,
        requirement_hash: str,
        verified: bool = False,
        run_id: str | None = None,
        commit: str | None = None,
        reason: str = "",
    ) -> AuditEvent | None:
        """The trail entry for an accepted evidence-driven move."""
        if self._audit is None:
            return None
        transition = outcome.transition
        return self._audit.append(
            AuditEvent(
                req_id=plan.req_id,
                kind=(
                    AuditEventKind.VERIFICATION if verified else AuditEventKind.DELIVERY_TRANSITION
                ),
                at=at,
                actor=self._actor,
                from_state=transition.source if transition is not None else None,
                to_state=transition.target if transition is not None else plan.target,
                cause=transition.cause if transition is not None else self._cause,
                reason=reason or plan.message,
                requirement_hash=requirement_hash,
                run_id=run_id,
                commit=commit,
                tests=plan.lost_tests,
                verified=verified,
                evidence=plan.causes,
                detail=str(plan.action),
            ),
        )

    @traces(SWR.SWR_3513)
    def run(
        self,
        records: Iterable[DeliveryRecord],
        findings: Mapping[str, Sequence[StalenessFinding]],
        *,
        at: dt.datetime,
        verifications: Mapping[str, Reverification] | None = None,
    ) -> tuple[EvidenceOutcome, ...]:
        """Assess and apply a whole evidence pass, in id order.

        Finite by construction: one pass over the records it was handed, one
        plan each, one transition at most. Nothing here can enqueue another
        record, which is why an evaluation cannot trigger an evaluation.
        """
        verified = verifications or {}
        outcomes: list[EvidenceOutcome] = []
        for record in sorted(records, key=lambda item: requirement_sort_key(item.req_id)):
            plan = propagate_evidence(
                record.req_id,
                tuple(findings.get(record.req_id, ())),
                state=record.state,
                verification=verified.get(record.req_id),
            )
            outcomes.append(
                self.apply(
                    plan,
                    at=at,
                    requirement_hash=record.delivery.requirement_hash,
                ),
            )
        return tuple(outcomes)

    @traces(SWR.SWR_3513, SWR.SWR_3504)
    def restore(self, record: DeliveryRecord, *, at: dt.datetime) -> EvidenceOutcome:
        """Return a requirement to ``Done`` — but only after a verification passes.

        The way back, and it costs the same evidence the way out did. Restoring
        a deleted test file proves a file exists; ``Done`` claims the
        requirement is delivered, and only an executed, passing suite says that
        (SWR-3513's fourth acceptance criterion, SWR-3215).

        The delivery that already stands is re-stated rather than replaced: the
        requirement's text never moved, so the version that was delivered is
        still the version that is delivered, and minting a fresh record would
        claim a delivering run that never happened (SWR-3204).
        """
        with self._guard:
            delivery = record.satisfied.current
            if delivery is None:
                raise PropagationError(
                    f"{record.req_id}: nothing was ever delivered, so there is no Done to"
                    " restore (SWR-3204)",
                )
            plan = EvidencePropagation(req_id=record.req_id, action=EvidenceAction.NOTHING)
            if self._verifier is None:
                return EvidenceOutcome(plan=plan)
            verification = self._verifier.verify(
                ReverificationRequest(
                    req_id=record.req_id,
                    requirement_hash=delivery.satisfied_hash,
                    satisfied_hash=delivery.satisfied_hash,
                ),
            )
            if not verification.passed:
                failed = EvidencePropagation(
                    req_id=record.req_id,
                    action=EvidenceAction.REPORT_FAILURE,
                    target=(
                        DeliveryState.NEEDS_UPDATE if record.state is DeliveryState.DONE else None
                    ),
                    failure=verification.failure,
                )
                return EvidenceOutcome(plan=failed, verification=verification)
            outcome = self._transitions.apply(
                TransitionRequest(
                    req_id=record.req_id,
                    target=DeliveryState.DONE,
                    actor=self._actor,
                    # Not ``self._cause``: that one carries a requirement *out* of
                    # Done, and ``Needs Update → Done`` is a different edge with a
                    # different door (SWR-3222). One cause opening both directions
                    # would let a caller undo a specification change by naming it.
                    cause=TransitionCause.REVERIFIED,
                    at=at,
                    requirement_hash=delivery.satisfied_hash,
                    delivery=delivery,
                    run_id=verification.run_id,
                    detail=(
                        f"{record.req_id}: the evidence is back and run"
                        f" {verification.run_id} verified it"
                    ),
                ),
            )
            if not outcome.accepted:
                return EvidenceOutcome(plan=plan, outcome=outcome, verification=verification)
            return EvidenceOutcome(
                plan=plan,
                outcome=outcome,
                verification=verification,
                event=self._record(
                    plan,
                    outcome,
                    at=at,
                    requirement_hash=delivery.satisfied_hash,
                    verified=True,
                    run_id=verification.run_id,
                    commit=verification.commit,
                    reason=(
                        f"{record.req_id}: the recorded evidence is back and run"
                        f" {verification.run_id} verified it; the delivery of"
                        f" {delivery.satisfied_hash} stands again"
                    ),
                ),
            )
