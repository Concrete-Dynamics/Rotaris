"""The completion conditions ``Done`` rests on (SWR-3215).

``Done`` is the one state the whole board's credibility rests on. If it can be
reached by dragging a card, every green requirement on the board means nothing —
so reaching it is a *conclusion drawn from evidence*, and this module is where
that conclusion is drawn.

**Every unmet condition is named, individually.** The refusal a user sees is not
"not allowed" and not "3 conditions unmet": it is one line per condition that
does not hold, each carrying the detail needed to act on it — which unit is still
running, which covering test never ran, which version was delivered against which
current specification. :class:`CompletionReport` therefore keeps a
:class:`ConditionResult` for *every* condition, met ones included, so the answer
reads the same way whether it is a refusal or a receipt.

**The check happens at the moment of the transition.** :func:`completion_gate`
takes a *reader*, not a value: the evidence is read inside
:func:`~rotaris_core.requirements.delivery.transitions.apply_transition`, while
the store's lock is held. Evidence captured when the board rendered the card is
exactly the evidence SWR-3215 refuses to decide on — between render and click a
test can start failing, and a card that was accepted on the older reading would
put a lie on the board.

**Which conditions apply comes from the requirement's obligations (SWR-3206),
not from this module.** :class:`CompletionObligations` is a structural port with
the two questions that decide applicability, so an obligations model owned by
another module — and
:class:`~rotaris_core.requirements.model.CanonicalRequirement` itself, which
already carries both flags — satisfies it without either side importing the
other. A condition the obligations waive is reported as
:attr:`ConditionOutcome.EXEMPT` rather than silently omitted: the exemption is
part of the answer (SWR-3215), because "this requirement reached Done without a
test" is something a reviewer must be able to see.

**An override is a recorded decision, never a bypass.** A
:class:`CompletionOverride` cannot exist without an actor and a stated reason,
the conditions it forgives keep their unmet detail under
:attr:`ConditionOutcome.OVERRIDDEN`, and :func:`completion_gate` hands the whole
report to its ``on_report`` sink — which is how the override reaches the audit
trail (SWR-3213) instead of vanishing into a green card.

```python
gate = completion_gate(read_evidence, obligations_for=index.get, on_report=audit.record)
outcome = DeliveryTransitions(store, completion=gate).apply(request)
if not outcome.accepted and outcome.refusal is not None:
    for condition in outcome.refusal.unmet:
        print(condition.message)  # one line per missing condition
```
"""

from __future__ import annotations

import datetime as dt  # noqa: TC003 - Pydantic resolves this at runtime.
from enum import StrEnum
from types import MappingProxyType
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.requirements.delivery.transitions import UnmetCondition

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from rotaris_core.requirements.delivery.store import DeliveryRecord
    from rotaris_core.requirements.delivery.transitions import CompletionGate, TransitionRequest

__all__ = [
    "DEFAULT_REQUIRED_EVIDENCE",
    "CompletionCondition",
    "CompletionEvidence",
    "CompletionEvidenceReader",
    "CompletionObligations",
    "CompletionOverride",
    "CompletionReport",
    "ConditionOutcome",
    "ConditionResult",
    "CoveringTestEvidence",
    "RequiredEvidence",
    "UnitEvidence",
    "UnitExecution",
    "completion_gate",
    "evaluate_completion",
]


@traces(SWR.SWR_3215)
class CompletionCondition(StrEnum):
    """The conditions SWR-3215 makes ``Done`` conditional on.

    The *value* is what a refusal prints and what a UI keys a row on, so it is
    stable and hyphenated. The set is closed: a condition nobody can name is a
    condition nobody can fix.
    """

    UNITS_FINISHED = "units-finished"
    IMPLEMENTATION_TRACES = "implementation-traces"
    COVERING_TESTS = "covering-tests"
    COVERING_TESTS_PASSED = "covering-tests-passed"
    COMPLETION_GATE = "completion-gate"
    INTEGRATION_COMPLETE = "integration-complete"
    SATISFIED_HASH_CURRENT = "satisfied-hash-current"
    NO_UNRESOLVED_BLOCKER = "no-unresolved-blocker"

    @property
    def rule(self) -> str:
        """The condition as a sentence, phrased as what has to hold."""
        return _RULES[self]


#: One sentence per condition, so a refusal explains the rule rather than only
#: naming a token. Kept beside the enum because the two are one fact.
_RULES: Mapping[CompletionCondition, str] = MappingProxyType(
    {
        CompletionCondition.UNITS_FINISHED: (
            "every execution unit that was not abandoned has finished"
        ),
        CompletionCondition.IMPLEMENTATION_TRACES: (
            "the implementation traces the requirement asks for exist"
        ),
        CompletionCondition.COVERING_TESTS: "a test declares that it covers this requirement",
        CompletionCondition.COVERING_TESTS_PASSED: "every covering test ran and passed",
        CompletionCondition.COMPLETION_GATE: (
            "the completion gate passed for the delivering run (SWR-2604)"
        ),
        CompletionCondition.INTEGRATION_COMPLETE: (
            "the work of the requirement's several units was integrated"
        ),
        CompletionCondition.SATISFIED_HASH_CURRENT: (
            "the delivered version is the current specification (SWR-3204)"
        ),
        CompletionCondition.NO_UNRESOLVED_BLOCKER: "no blocker is unresolved",
    },
)


class ConditionOutcome(StrEnum):
    """What one completion condition answered.

    Five answers, not two, because collapsing them is what makes a board lie:
    "exempt" is a decision the project made (SWR-3206) and has to stay visible,
    "not applicable" is a fact about this requirement's shape, and "overridden"
    is a person's signature on a condition that did *not* hold.
    """

    MET = "met"
    UNMET = "unmet"
    #: The requirement's obligations waive this condition (SWR-3206).
    EXEMPT = "exempt"
    #: There is nothing to check — one unit needs no integration, and a
    #: requirement with no covering test has no test run to judge.
    NOT_APPLICABLE = "not-applicable"
    #: Unmet, and forgiven by a named actor with a stated reason.
    OVERRIDDEN = "overridden"


@traces(SWR.SWR_3215)
class ConditionResult(BaseModel):
    """One condition, its answer and the detail a user needs to act on it."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    condition: CompletionCondition
    outcome: ConditionOutcome
    #: What was found — the units still running, the tests that did not run, the
    #: two hashes that differ. Never a count on its own.
    detail: str = ""

    @property
    def blocks(self) -> bool:
        """Whether this result stops the requirement from reaching ``Done``."""
        return self.outcome is ConditionOutcome.UNMET

    @property
    def message(self) -> str:
        """``covering-tests-passed: tests/unit/test_x.py did not run``."""
        return f"{self.condition}: {self.detail}" if self.detail else str(self.condition)

    @property
    def as_unmet(self) -> UnmetCondition:
        """This result as the transition layer reports it (SWR-3203)."""
        return UnmetCondition(name=str(self.condition), detail=self.detail)


@runtime_checkable
class CompletionObligations(Protocol):
    """What the requirement's evidence obligations say applies to it (SWR-3206).

    A structural port with exactly the two questions that change *which*
    conditions are checked. Deliberately the shape
    :class:`~rotaris_core.requirements.model.CanonicalRequirement` already has,
    so a caller holding a requirement needs no adapter, and the module that owns
    obligations can grow fields without this one importing it.
    """

    @property
    def trace_required(self) -> bool:
        """Whether the project expects an implementation trace for this id."""
        ...

    @property
    def test_required(self) -> bool:
        """Whether the project expects a covering test for this id."""
        ...


@traces(SWR.SWR_3215)
class RequiredEvidence(BaseModel):
    """Obligations as a value, for callers that have no requirement in hand.

    The defaults are the strict ones: a requirement nobody has said anything
    about needs both a trace and a test, because the alternative — defaulting to
    exempt — would let an unconfigured workspace reach ``Done`` on nothing.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    trace_required: bool = True
    test_required: bool = True


#: What applies when no obligations are known: everything.
DEFAULT_REQUIRED_EVIDENCE = RequiredEvidence()


class UnitExecution(StrEnum):
    """Where one execution unit's run stands (SWR-3401, SWR-3413)."""

    PENDING = "pending"
    RUNNING = "running"
    FINISHED = "finished"
    #: Given up on deliberately. Excluded from the completion check rather than
    #: blocking it forever — that is what "non-abandoned" means in SWR-3215.
    ABANDONED = "abandoned"


@traces(SWR.SWR_3215)
class UnitEvidence(BaseModel):
    """One execution unit of this requirement, as it stands right now."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    unit_id: str
    execution: UnitExecution = UnitExecution.PENDING

    @property
    def counts(self) -> bool:
        """Whether this unit has to have finished for the requirement to be done."""
        return self.execution is not UnitExecution.ABANDONED

    @property
    def outstanding(self) -> bool:
        """Whether this unit is still owed work."""
        return self.counts and self.execution is not UnitExecution.FINISHED


@traces(SWR.SWR_3215)
class CoveringTestEvidence(BaseModel):
    """A test declaring it covers this requirement, and what happened to it.

    ``executed`` and ``passed`` are two facts and stay two facts: a covering test
    that exists but never ran is not evidence of anything, and the whole point of
    SWR-2606 — which this condition consumes — is that the two are
    distinguishable without reading a log.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    path: str
    line: int = 0
    executed: bool = False
    passed: bool = False
    #: Whether the run that reached this test observed nothing about it — killed,
    #: red as a whole, or narrowed to part of the file. A third answer, because
    #: ``executed and not passed`` cannot distinguish "this test failed" from
    #: "the suite died before it could say", and printing the first when the
    #: second is true accuses a test of a failure it never had.
    inconclusive: bool = False

    @property
    def label(self) -> str:
        """``tests/unit/test_x.py:31``, or the path when the line is unknown."""
        return f"{self.path}:{self.line}" if self.line else self.path

    @property
    def verifying(self) -> bool:
        """Whether this test actually ran and actually passed."""
        return self.executed and self.passed and not self.inconclusive

    @property
    def state(self) -> str:
        """What the refusal prints for this test.

        ``did not run`` / ``result unknown`` / ``failed`` / ``passed``. The middle
        one is the one that matters: it is what a user reads instead of being told
        a green test broke.
        """
        if not self.executed:
            return "did not run"
        if self.inconclusive:
            return "result unknown"
        return "passed" if self.passed else "failed"


@traces(SWR.SWR_3215)
class CompletionEvidence(BaseModel):
    """Everything the completion check reads, as it stands at one moment.

    A value, not a source: the check is pure over it, and *when* it was gathered
    is the caller's problem — which is why :func:`completion_gate` gathers it
    inside the transition rather than accepting a pre-built one.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    #: The requirement's ``current_hash`` right now (SWR-3107).
    current_hash: str = ""
    #: The version the delivering run recorded (SWR-3204). ``None`` when nothing
    #: was ever delivered, which is a different fact from a mismatch.
    satisfied_hash: str | None = None
    units: tuple[UnitEvidence, ...] = ()
    #: Where the requirement is implemented — ``path:line`` sites from ReqToCode's
    #: index (SWR-2336). Named, never counted, so the report can quote them.
    implementation_traces: tuple[str, ...] = ()
    covering_tests: tuple[CoveringTestEvidence, ...] = ()
    #: Whether the completion gate (SWR-2604) passed for the delivering run.
    gate_passed: bool = False
    gate_detail: str = ""
    #: Whether the several units' work was integrated. Only consulted when the
    #: requirement had more than one unit that counts.
    integration_complete: bool = False
    #: Unresolved blockers, each as its own stated reason.
    blockers: tuple[str, ...] = ()

    @property
    def counted_units(self) -> tuple[UnitEvidence, ...]:
        """The units that were not abandoned."""
        return tuple(unit for unit in self.units if unit.counts)

    @property
    def outstanding_units(self) -> tuple[str, ...]:
        """Ids of units that still owe work, in the order they were given."""
        return tuple(unit.unit_id for unit in self.units if unit.outstanding)


@traces(SWR.SWR_3215)
class CompletionOverride(BaseModel):
    """A named decision to accept ``Done`` despite an unmet condition.

    Cannot exist without an actor and a reason — an override whose author or
    motive is unknown is indistinguishable from a bug, and SWR-3215 requires it
    to be recorded *as an override* in the audit trail (SWR-3213). It forgives
    conditions; it never makes them hold, which is why the forgiven results keep
    their original detail.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    actor: DeliveryActor
    reason: str
    at: dt.datetime
    #: The conditions this override forgives. Empty means every one of them,
    #: which is the blunt instrument and reads as such in the record.
    conditions: tuple[CompletionCondition, ...] = ()

    @field_validator("reason")
    @classmethod
    def _stated(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("an override of the completion conditions states its reason")
        return cleaned

    @field_validator("at")
    @classmethod
    def _aware(cls, value: dt.datetime) -> dt.datetime:
        if value.tzinfo is None:
            raise ValueError("an override carries an aware timestamp, never a naive one")
        return value

    def covers(self, condition: CompletionCondition) -> bool:
        """Whether this override forgives *condition*."""
        return not self.conditions or condition in self.conditions

    @property
    def message(self) -> str:
        """One line for the audit trail and the card."""
        what = ", ".join(str(condition) for condition in self.conditions) or "every condition"
        return f"{what} overridden by {self.actor.label}: {self.reason}"


@traces(SWR.SWR_3215)
class CompletionReport(BaseModel):
    """Every completion condition and its answer, for one attempt at ``Done``.

    Carries the met conditions too. A report that only listed failures could not
    answer "what did this requirement actually satisfy" months later, and that
    question is the one an audit asks (SWR-3213).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str
    results: tuple[ConditionResult, ...] = ()
    override: CompletionOverride | None = None

    @model_validator(mode="after")
    def _each_condition_once(self) -> Self:
        seen = [result.condition for result in self.results]
        if len(seen) != len(set(seen)):
            raise ValueError("a completion report answers each condition exactly once")
        return self

    def result_for(self, condition: CompletionCondition) -> ConditionResult | None:
        """This report's answer for one condition, or ``None`` when unanswered."""
        return next((result for result in self.results if result.condition is condition), None)

    def outcome_of(self, condition: CompletionCondition) -> ConditionOutcome | None:
        """Shorthand for :meth:`result_for` when only the answer is wanted."""
        result = self.result_for(condition)
        return result.outcome if result is not None else None

    @property
    def unmet(self) -> tuple[UnmetCondition, ...]:
        """Every condition that does not hold, named individually (SWR-3215).

        This is what the refusal carries. An overridden condition is deliberately
        absent — it was answered by a person, and leaving it here would refuse a
        transition someone signed for.
        """
        return tuple(result.as_unmet for result in self.results if result.blocks)

    @property
    def complete(self) -> bool:
        """Whether ``Done`` may be entered."""
        return not self.unmet

    @property
    def exemptions(self) -> tuple[ConditionResult, ...]:
        """Conditions the requirement's obligations waived (SWR-3206).

        Visible on purpose: a requirement that reached ``Done`` without a test is
        a legitimate outcome and an important one to be able to see.
        """
        return tuple(result for result in self.results if result.outcome is ConditionOutcome.EXEMPT)

    @property
    def overridden(self) -> tuple[ConditionResult, ...]:
        """Conditions that did not hold and were forgiven by a named actor."""
        return tuple(
            result for result in self.results if result.outcome is ConditionOutcome.OVERRIDDEN
        )

    @property
    def summary(self) -> str:
        """One line: complete, or the unmet conditions in order."""
        if self.complete:
            exempt = f" ({len(self.exemptions)} exempt)" if self.exemptions else ""
            return f"{self.req_id}: every completion condition holds{exempt}"
        return f"{self.req_id}: " + "; ".join(condition.message for condition in self.unmet)


def _met(condition: CompletionCondition, detail: str = "") -> ConditionResult:
    return ConditionResult(condition=condition, outcome=ConditionOutcome.MET, detail=detail)


def _unmet(condition: CompletionCondition, detail: str) -> ConditionResult:
    return ConditionResult(condition=condition, outcome=ConditionOutcome.UNMET, detail=detail)


def _exempt(condition: CompletionCondition, detail: str) -> ConditionResult:
    return ConditionResult(condition=condition, outcome=ConditionOutcome.EXEMPT, detail=detail)


def _not_applicable(condition: CompletionCondition, detail: str) -> ConditionResult:
    return ConditionResult(
        condition=condition,
        outcome=ConditionOutcome.NOT_APPLICABLE,
        detail=detail,
    )


def _units_result(evidence: CompletionEvidence) -> ConditionResult:
    outstanding = evidence.outstanding_units
    if not outstanding:
        return _met(
            CompletionCondition.UNITS_FINISHED,
            f"{len(evidence.counted_units)} unit(s) finished",
        )
    return _unmet(
        CompletionCondition.UNITS_FINISHED,
        "still owed: " + ", ".join(outstanding),
    )


def _trace_result(
    evidence: CompletionEvidence,
    obligations: CompletionObligations,
) -> ConditionResult:
    condition = CompletionCondition.IMPLEMENTATION_TRACES
    if not obligations.trace_required:
        return _exempt(condition, "the requirement's obligations ask for no implementation trace")
    if evidence.implementation_traces:
        return _met(condition, ", ".join(evidence.implementation_traces))
    return _unmet(condition, f"no implementation site traces {evidence.req_id}")


def _tests_exist_result(
    evidence: CompletionEvidence,
    obligations: CompletionObligations,
) -> ConditionResult:
    condition = CompletionCondition.COVERING_TESTS
    if not obligations.test_required:
        return _exempt(condition, "the requirement's obligations ask for no covering test")
    if evidence.covering_tests:
        return _met(condition, ", ".join(test.label for test in evidence.covering_tests))
    return _unmet(condition, f"no test declares that it verifies {evidence.req_id}")


def _tests_passed_result(
    evidence: CompletionEvidence,
    obligations: CompletionObligations,
) -> ConditionResult:
    condition = CompletionCondition.COVERING_TESTS_PASSED
    if not obligations.test_required:
        return _exempt(condition, "the requirement's obligations ask for no covering test")
    if not evidence.covering_tests:
        # The missing test is already named by COVERING_TESTS; repeating it here
        # would make one gap read as two and dilute the list a user has to work
        # through.
        return _not_applicable(condition, "there is no covering test to run yet")
    unsatisfied = tuple(test for test in evidence.covering_tests if not test.verifying)
    if not unsatisfied:
        return _met(condition, f"{len(evidence.covering_tests)} covering test(s) passed")
    # Each test says which of the four things happened to it, so a refusal caused
    # by a killed suite reads as "result unknown" and never as a named failure.
    return _unmet(
        condition,
        ", ".join(f"{test.label} {test.state}" for test in unsatisfied),
    )


def _gate_result(evidence: CompletionEvidence) -> ConditionResult:
    condition = CompletionCondition.COMPLETION_GATE
    if evidence.gate_passed:
        return _met(condition, evidence.gate_detail)
    return _unmet(
        condition,
        evidence.gate_detail or "the delivering run did not pass the completion gate",
    )


def _integration_result(evidence: CompletionEvidence) -> ConditionResult:
    condition = CompletionCondition.INTEGRATION_COMPLETE
    counted = evidence.counted_units
    if len(counted) < 2:
        return _not_applicable(
            condition,
            f"{len(counted)} execution unit(s): there is nothing to integrate",
        )
    if evidence.integration_complete:
        return _met(condition, f"{len(counted)} units integrated")
    return _unmet(
        condition,
        f"{len(counted)} units delivered work that was not integrated",
    )


def _hash_result(evidence: CompletionEvidence) -> ConditionResult:
    condition = CompletionCondition.SATISFIED_HASH_CURRENT
    current = evidence.current_hash.strip()
    satisfied = (evidence.satisfied_hash or "").strip()
    if not satisfied:
        return _unmet(condition, "no run recorded a delivered version (SWR-3204)")
    if not current:
        return _unmet(condition, "the requirement's current hash is unknown")
    if current != satisfied:
        return _unmet(
            condition,
            f"delivered {satisfied}, the specification is now {current}",
        )
    return _met(condition, current)


def _blocker_result(evidence: CompletionEvidence) -> ConditionResult:
    condition = CompletionCondition.NO_UNRESOLVED_BLOCKER
    if not evidence.blockers:
        return _met(condition)
    return _unmet(condition, "; ".join(evidence.blockers))


@traces(SWR.SWR_3215)
def evaluate_completion(
    evidence: CompletionEvidence,
    *,
    obligations: CompletionObligations = DEFAULT_REQUIRED_EVIDENCE,
    override: CompletionOverride | None = None,
) -> CompletionReport:
    """Answer every completion condition against *evidence*.

    Pure: no clock, no store, no repository. Every condition is answered — met,
    unmet, exempt or not applicable — and the order is the declaration order of
    :class:`CompletionCondition`, so two reports of the same requirement read the
    same way and a UI can render rows without sorting.

    *override* forgives the conditions it names; the forgiven results keep the
    detail they failed with, because an override that erased the finding would
    make the audit trail useless (SWR-3213).
    """
    results = [
        _units_result(evidence),
        _trace_result(evidence, obligations),
        _tests_exist_result(evidence, obligations),
        _tests_passed_result(evidence, obligations),
        _gate_result(evidence),
        _integration_result(evidence),
        _hash_result(evidence),
        _blocker_result(evidence),
    ]
    if override is not None:
        results = [
            result.model_copy(update={"outcome": ConditionOutcome.OVERRIDDEN})
            if result.blocks and override.covers(result.condition)
            else result
            for result in results
        ]
    return CompletionReport(
        req_id=evidence.req_id,
        results=tuple(results),
        override=override,
    )


#: How the gate obtains *current* evidence: called with the record as the store
#: holds it and the transition being attempted, inside the lock, at the moment of
#: the decision (SWR-3215).
type CompletionEvidenceReader = Callable[[DeliveryRecord, TransitionRequest], CompletionEvidence]


def _with_transition_facts(
    evidence: CompletionEvidence,
    record: DeliveryRecord,
    request: TransitionRequest,
) -> CompletionEvidence:
    """Fold in the two facts the transition itself carries.

    The hash being *recorded* by this transition is the one the condition has to
    compare against the specification — checking the record's previous satisfied
    hash would judge the wrong version — and a requirement sitting in ``Blocked``
    carries its blocker in the record rather than in the evidence reader's world.

    The substitution keys on the *request*, never on what the reader answered.
    A reader that fills ``satisfied_hash`` from the stored record — the obvious
    thing for an execution slice to do — would otherwise make a re-delivery judge
    the previous version: the second delivery of a requirement whose first
    delivery happens to match the current text would pass while recording a
    different, older hash.
    """
    changes: dict[str, object] = {}
    if request.delivery is not None:
        changes["satisfied_hash"] = request.delivery.satisfied_hash
    blocker = record.delivery.blocked_reason.strip()
    if record.delivery.blocked and blocker and blocker not in evidence.blockers:
        changes["blockers"] = (*evidence.blockers, blocker)
    return evidence.model_copy(update=changes) if changes else evidence


@traces(SWR.SWR_3215, SWR.SWR_3203)
def completion_gate(
    read_evidence: CompletionEvidenceReader,
    *,
    obligations_for: Callable[[str], CompletionObligations | None] | None = None,
    override_for: Callable[[DeliveryRecord, TransitionRequest], CompletionOverride | None]
    | None = None,
    on_report: Callable[[CompletionReport], None] | None = None,
) -> CompletionGate:
    """The SWR-3215 check, in the shape :func:`apply_transition` plugs in.

    The returned gate reads evidence **when it is called** — inside the
    transition, under the store's lock — which is what makes "against current
    evidence, not evidence captured earlier" structural instead of a rule a
    caller has to remember.

    *on_report* receives the full report for every ``Done`` attempt, accepted or
    refused. That is the seam the audit trail (SWR-3213) hangs on: an override
    reaches the trail because the gate hands it over, not because the caller
    remembered to log one.
    """

    def gate(record: DeliveryRecord, request: TransitionRequest) -> Sequence[UnmetCondition]:
        evidence = _with_transition_facts(read_evidence(record, request), record, request)
        obligations = obligations_for(request.req_id) if obligations_for is not None else None
        report = evaluate_completion(
            evidence,
            obligations=obligations if obligations is not None else DEFAULT_REQUIRED_EVIDENCE,
            override=override_for(record, request) if override_for is not None else None,
        )
        if on_report is not None:
            on_report(report)
        return report.unmet

    return gate
