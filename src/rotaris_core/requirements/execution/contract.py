"""The agent completion contract (SWR-3408).

An agent that writes code has not delivered a requirement. Without an explicit
contract, "done" degrades to "the model stopped", which is precisely what the
completion verifier exists to prevent (SWR-2604) — and requirement work carries
obligations the generic gate does not know about: a trace, a covering test that
*ran*, a ReqToCode store that still checks out, an attributable commit, and a
specification that did not move underneath the run (SWR-3403).

The contract is therefore a **structure**, not a checklist someone remembers:

```text
model output ──▶ parse_agent_claim() ──▶ AgentClaim      (claims only)
                       │                                  ╲
                       └── stripped: runner-owned keys      ╲
                                                             ▶ seal_completion() ──▶ CompletionResult
runner measurement ─────────────────────▶ RunnerMeasurements ╱
```

Three properties make it hold rather than merely describe:

- **The runner-owned fields are unreachable from model output.**
  :class:`AgentClaim` has no field in :data:`RUNNER_OWNED_FIELDS` — asserted in
  the test suite as a set intersection, not as a reading of the code — and
  :func:`seal_completion` takes the measured half as a separate argument. A
  hostile payload claiming ``tests_executed: true`` therefore has nowhere to land:
  the key is stripped, the stripping is reported on
  :attr:`CompletionResult.stripped_fields`, and the measured value stays the
  runner's. This mirrors what ``SummaryAgent._normalize_payload`` already does
  for ``verifier_results`` (SWR-2606).
- **Every condition is named, individually.** :attr:`CompletionResult.unmet`
  returns one :class:`~rotaris_core.requirements.delivery.transitions.UnmetCondition`
  per condition that does not hold. "3 conditions unmet" is not something a user
  can act on; "tests-executed: the suite did not run" is.
- **The contract is the only door to ``Done``.** :func:`contract_gate` adapts a
  sealed result into the delivery layer's
  :data:`~rotaris_core.requirements.delivery.transitions.CompletionGate`, and a
  requirement with **no** sealed result at all is refused rather than waved
  through — "nobody checked" is not "every condition holds" (SWR-3215).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol, Self, runtime_checkable

from pydantic import BaseModel, ConfigDict, model_validator

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.projection import CheckOutcome
from rotaris_core.requirements.delivery.transitions import UnmetCondition

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping, Sequence

    from rotaris_core.requirements.delivery.store import DeliveryRecord
    from rotaris_core.requirements.delivery.transitions import CompletionGate, TransitionRequest

__all__ = [
    "COMPLETION_CONDITIONS",
    "RUNNER_OWNED_FIELDS",
    "AgentClaim",
    "CheckLike",
    "ClaimIntake",
    "CompletionCondition",
    "CompletionResult",
    "RunnerMeasurements",
    "check_outcomes",
    "contract_gate",
    "parse_agent_claim",
    "seal_completion",
]


@traces(SWR.SWR_3408)
class RunnerMeasurements(BaseModel):
    """What Rotaris itself measured about a unit run — never what a model said.

    Every field here answers a question with an observation behind it: a process
    that exited, a worktree that was inspected, a commit that exists. Defaults are
    ``False`` on purpose: an unmeasured obligation is unmet, so a runner that
    forgot to fill a field blocks completion instead of granting it.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The covering tests were *executed* in this run's suite. Distinct from
    #: passing, exactly as SWR-2606 keeps ``not_run`` and ``failing`` apart.
    tests_executed: bool = False
    #: Those executed checks reported success.
    tests_passed: bool = False
    #: The run changed at least one test file.
    tests_updated: bool = False
    #: A ``@traces`` site for the requirement exists after the change (SWR-3410).
    traceability_established: bool = False
    #: ``reqtocode check`` is clean over the resulting tree.
    reqtocode_current: bool = False
    #: ``git status`` in the unit's worktree is empty.
    worktree_clean: bool = False
    #: The change is attributable: it exists as a commit with an author.
    change_attributable: bool = False
    #: The requirement's hash still equals the run's snapshot hash (SWR-3403).
    specification_stable: bool = False
    #: Files the run changed, repository-relative.
    changed_files: tuple[str, ...] = ()
    #: Commits the run produced.
    produced_commits: tuple[str, ...] = ()
    #: The checks that were run and what they reported (SWR-3603).
    checks: tuple[CheckOutcome, ...] = ()
    #: Free-text detail for the checks, shown beside them and never instead.
    detail: str = ""

    @property
    def touched_anything(self) -> bool:
        """Whether the run produced any change at all."""
        return bool(self.changed_files or self.produced_commits)

    @property
    def failed_checks(self) -> tuple[CheckOutcome, ...]:
        """The checks that did not pass — what an incomplete result points at."""
        return tuple(check for check in self.checks if not check.passed)


#: Every key a model must not be able to author. The measured field names plus
#: the aliases a summarising model is most likely to reach for: the point is not
#: to guess every spelling but to make the *shape* of the answer runner-owned,
#: and any spelling that slips through still lands nowhere, because
#: :class:`AgentClaim` forbids unknown fields.
RUNNER_OWNED_FIELDS: frozenset[str] = frozenset(RunnerMeasurements.model_fields) | frozenset(
    {
        "verified",
        "verifier_results",
        "verification",
        "complete",
        "completed",
        "unmet",
        "measured",
        "checks_passed",
        "gate",
        "gate_passed",
        "tests_ran",
        "test_results",
    },
)


@traces(SWR.SWR_3408)
class AgentClaim(BaseModel):
    """What the agent says it did — claims, and nothing that asserts execution.

    Deliberately small. Everything here is unverified by construction, which is
    what lets the review surface show "what was claimed" beside "what was
    measured" without the two ever having been merged (SWR-3603).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The agent's own account of the change.
    summary: str = ""
    #: The agent's assertion that the intended change is implemented. A claim —
    #: corroborated by :attr:`RunnerMeasurements.changed_files`, never trusted
    #: on its own.
    implemented: bool = False
    #: The agent's assertion that it is finished. Necessary, never sufficient.
    claimed_complete: bool = False
    #: What the agent flagged as risky or unfinished (SWR-3603).
    risks: tuple[str, ...] = ()
    #: Anything the agent wants a reviewer to read.
    notes: str = ""

    @model_validator(mode="after")
    def _claims_only(self) -> Self:
        # A guard against this class growing a runner-owned field later. The test
        # suite asserts the same intersection; keeping it here too means the
        # mistake cannot even be constructed at runtime.
        trespass = sorted(set(type(self).model_fields) & RUNNER_OWNED_FIELDS)
        if trespass:
            raise ValueError(
                f"an agent claim may not carry runner-owned fields {trespass};"
                " execution and verification are measured by Rotaris (SWR-3408)",
            )
        return self


@traces(SWR.SWR_3408)
class ClaimIntake(BaseModel):
    """One model payload, read into a claim — and what was taken out of it.

    The stripping is a *result*, not a side effect: SWR-3408 requires it to be
    asserted, so it has to be visible to the caller and to the audit trail.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    claim: AgentClaim
    #: Runner-owned keys the payload tried to set, sorted. Non-empty means a
    #: model attempted to author a measurement.
    stripped: tuple[str, ...] = ()
    #: Keys that mean nothing to the contract at all, sorted. Dropped, and named
    #: so a prompt/schema drift shows up instead of being silently absorbed.
    ignored: tuple[str, ...] = ()

    @property
    def tampered(self) -> bool:
        """Whether the payload tried to set a field only Rotaris may set."""
        return bool(self.stripped)

    @property
    def message(self) -> str:
        """One line for the audit trail (SWR-3213)."""
        parts: list[str] = []
        if self.stripped:
            parts.append(f"stripped runner-owned {list(self.stripped)}")
        if self.ignored:
            parts.append(f"ignored unknown {list(self.ignored)}")
        return "; ".join(parts) or "payload accepted as claims"


@traces(SWR.SWR_3408)
def parse_agent_claim(payload: Mapping[str, object]) -> ClaimIntake:
    """Read *payload* as claims, dropping everything a model may not author.

    Never raises on a hostile payload: a run that produced a bad summary should
    report *incomplete*, not crash the flow. A value of the wrong type for a
    claim field is dropped like an unknown key, so a model cannot fail the run by
    sending a string where a boolean belongs either.
    """
    stripped: list[str] = []
    ignored: list[str] = []
    accepted: dict[str, object] = {}
    fields = AgentClaim.model_fields
    for key, value in payload.items():
        name = str(key)
        if name in RUNNER_OWNED_FIELDS:
            stripped.append(name)
            continue
        if name not in fields:
            ignored.append(name)
            continue
        accepted[name] = value
    try:
        claim = AgentClaim.model_validate(accepted)
    except ValueError:
        # A wrongly typed claim is still not an execution fact; keep the fields
        # that validate and report the rest as ignored.
        salvaged: dict[str, object] = {}
        for name, value in accepted.items():
            try:
                AgentClaim.model_validate({**salvaged, name: value})
            except ValueError:
                ignored.append(name)
                continue
            salvaged[name] = value
        claim = AgentClaim.model_validate(salvaged)
    return ClaimIntake(
        claim=claim,
        stripped=tuple(sorted(set(stripped))),
        ignored=tuple(sorted(set(ignored))),
    )


@dataclass(frozen=True, slots=True)
class CompletionCondition:
    """One obligation a unit run has to discharge before it may report complete.

    A table entry rather than a branch in a function: SWR-3408 requires each
    unmet condition to be *named*, and a table is the only form where adding an
    obligation cannot silently forget to name it.
    """

    name: str
    #: What to tell the user when it does not hold.
    detail: str
    holds: Callable[[CompletionResult], bool]

    def against(self, result: CompletionResult) -> UnmetCondition | None:
        """This condition as an unmet one, or ``None`` when it holds."""
        if self.holds(result):
            return None
        return UnmetCondition(name=self.name, detail=self.detail)


#: The contract, in the order SWR-3408 states it. Every entry is checked on every
#: sealed result; none may be skipped, and adding one here is the only way to add
#: an obligation.
COMPLETION_CONDITIONS: tuple[CompletionCondition, ...] = (
    CompletionCondition(
        name="change-implemented",
        detail="the agent did not state the intended change is implemented",
        holds=lambda result: result.claim.implemented,
    ),
    CompletionCondition(
        name="change-present",
        detail="no file was changed and no commit was produced",
        holds=lambda result: result.measured.touched_anything,
    ),
    CompletionCondition(
        name="tests-updated",
        detail="the relevant tests were not updated",
        holds=lambda result: result.measured.tests_updated,
    ),
    CompletionCondition(
        name="tests-executed",
        detail="the covering tests were not executed in this run",
        holds=lambda result: result.measured.tests_executed,
    ),
    CompletionCondition(
        name="tests-passed",
        detail="an executed check did not pass",
        holds=lambda result: result.measured.tests_passed,
    ),
    CompletionCondition(
        name="traceability-established",
        detail="the requirement has no implementation trace after the change",
        holds=lambda result: result.measured.traceability_established,
    ),
    CompletionCondition(
        name="reqtocode-current",
        detail="the requirement store and the generated ids are out of step",
        holds=lambda result: result.measured.reqtocode_current,
    ),
    CompletionCondition(
        name="worktree-clean",
        detail="the unit's worktree still holds uncommitted work",
        holds=lambda result: result.measured.worktree_clean,
    ),
    CompletionCondition(
        name="change-attributable",
        detail="the change is not attributable to a commit",
        holds=lambda result: result.measured.change_attributable,
    ),
    CompletionCondition(
        name="no-requirement-drift",
        detail="the requirement changed while the run was in flight (SWR-3403)",
        holds=lambda result: result.measured.specification_stable,
    ),
    CompletionCondition(
        name="agent-reported-complete",
        detail="the agent did not report the unit finished",
        holds=lambda result: result.claim.claimed_complete,
    ),
)


@traces(SWR.SWR_3408)
class CompletionResult(BaseModel):
    """One unit run's result: what was claimed, what was measured, what is missing.

    Built by :func:`seal_completion` and by nothing else, which is what keeps the
    two halves apart: the claim comes from model output that has been stripped,
    the measurement comes from the runner, and no code path lets the first supply
    the second.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    run_id: str
    req_id: str
    unit_id: str | None = None
    claim: AgentClaim = AgentClaim()
    measured: RunnerMeasurements = RunnerMeasurements()
    #: Runner-owned keys the model payload tried to set (SWR-3408).
    stripped_fields: tuple[str, ...] = ()

    @property
    def unmet(self) -> tuple[UnmetCondition, ...]:
        """Every condition that does not hold, named individually (SWR-3215)."""
        return tuple(
            unmet
            for unmet in (condition.against(self) for condition in COMPLETION_CONDITIONS)
            if unmet is not None
        )

    @property
    def complete(self) -> bool:
        """Whether this unit may be reported complete. Never a model's answer."""
        return not self.unmet

    @property
    def tampered(self) -> bool:
        """Whether the model tried to author a measurement."""
        return bool(self.stripped_fields)

    @property
    def message(self) -> str:
        """One line: complete, or every unmet condition by name."""
        if self.complete:
            return f"{self.run_id}: complete"
        return f"{self.run_id}: incomplete — " + ", ".join(
            condition.message for condition in self.unmet
        )


@traces(SWR.SWR_3408)
def seal_completion(
    *,
    run_id: str,
    req_id: str,
    payload: Mapping[str, object],
    measured: RunnerMeasurements,
    unit_id: str | None = None,
) -> CompletionResult:
    """The only way a model payload becomes a completion result.

    *payload* is whatever the agent produced and is read through
    :func:`parse_agent_claim`; *measured* is the runner's own observation and is
    a separate argument, so there is no expression in which the first can become
    the second.
    """
    intake = parse_agent_claim(payload)
    return CompletionResult(
        run_id=run_id,
        req_id=req_id,
        unit_id=unit_id,
        claim=intake.claim,
        measured=measured,
        stripped_fields=intake.stripped,
    )


@runtime_checkable
class CheckLike(Protocol):
    """The shape of a check result, as
    :class:`~rotaris_core.verifier.runner.CheckResult` already has it.

    Structural, so this module composes the verifier's output (SWR-3410) without
    importing the verifier — which keeps the contract testable with three lines
    of fixture and keeps the SDK out of its import path.
    """

    @property
    def name(self) -> str:
        """The check's name."""
        ...

    @property
    def status(self) -> str:
        """``passed`` / ``failed`` / ``timeout`` / ``skipped``."""
        ...


@traces(SWR.SWR_3408)
def check_outcomes(checks: Iterable[CheckLike]) -> tuple[CheckOutcome, ...]:
    """Verifier check results as the board's :class:`CheckOutcome` (SWR-3216)."""
    return tuple(CheckOutcome(name=str(check.name), status=str(check.status)) for check in checks)


@traces(SWR.SWR_3408, SWR.SWR_3215)
def contract_gate(result_for: Callable[[str], CompletionResult | None]) -> CompletionGate:
    """The completion contract as the delivery layer's gate (SWR-3215).

    A requirement with no sealed result is refused with ``completion-result``
    unmet: a ``Done`` nobody measured is the exact bypass SWR-3408 exists to
    close, and an absent result is not an empty list of problems.
    """

    def gate(
        record: DeliveryRecord,
        request: TransitionRequest,
    ) -> Sequence[UnmetCondition]:
        result = result_for(request.req_id)
        if result is None:
            return (
                UnmetCondition(
                    name="completion-result",
                    detail=(
                        "no unit run reported a completion result for this requirement,"
                        " so no condition could be measured (SWR-3408)"
                    ),
                ),
            )
        return result.unmet

    return gate
