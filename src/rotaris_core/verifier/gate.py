"""Deterministic completion gate over the verifier evidence (SWR-2604).

SWR-2603 carries a :class:`~rotaris_core.verifier.evidence.VerifierEvidence` into
the child report. This module decides what that evidence means for completion:
an iteration that modified files can only be classified complete when every
``blocking`` check actually passed.

The gate is a pure function so it can be exhaustively tested and so the loop's
override is auditable rather than implicit. It deliberately takes the evidence
rather than the report, which keeps ``orchestrator/report.py`` free to import
this module without an import cycle.

Two boundaries matter and are easy to get wrong:

- Inside an *executed* suite, a blocking check that did not run — a
  permission-denied check is ``skipped`` (SWR-2501/SWR-2602) — counts as
  unsatisfied. "Not verified" must never read as "verified clean".
- A suite that did not run *at all* is ``exempt``, not gated. A read-only
  research task, a workspace that declares ``verifier.checks: []``, one where
  nothing could be detected, and the degraded path where the verifier itself
  failed all land here. Gating them would turn every unconfigured workspace
  into a re-queue loop, which is the opposite of the epic's intent.

Advisory failures never gate. They travel in the decision so a host can surface
them, and in the evidence itself with their full output.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.verifier.evidence import VerifierEvidence
    from rotaris_core.verifier.runner import CheckResult

#: Outcome of the completion gate. ``exempt`` means the gate did not apply —
#: distinct from ``passed``, which means checks ran and were clean.
GateDecision = Literal["passed", "gated", "exempt"]

_NO_EVIDENCE_REASON = "No verifier evidence was attached to this report; completion was not gated."


@traces(SWR.SWR_2604)
class CompletionGateDecision(BaseModel):
    """Why an iteration was — or was not — allowed to count as complete."""

    #: ``gated`` forces a non-complete outcome; ``exempt`` means no verification applied.
    decision: GateDecision
    #: Human-readable justification, recorded verbatim in session diagnostics.
    reason: str
    #: Names of blocking checks that did not pass. Empty unless ``gated``.
    unsatisfied_checks: list[str] = Field(default_factory=list)
    #: Names of advisory checks that failed. Reported, never blocking.
    advisory_failures: list[str] = Field(default_factory=list)
    #: What the LLM completion classifier concluded, when it ran. Kept so an
    #: override of a ``COMPLETE`` verdict is visible rather than silent.
    llm_verdict: str | None = None


@traces(SWR.SWR_2604)
def evaluate_completion_gate(
    evidence: VerifierEvidence | None,
    *,
    llm_verdict: str | None = None,
) -> CompletionGateDecision:
    """Decide whether *evidence* permits classifying the iteration complete."""
    if evidence is None:
        return CompletionGateDecision(
            decision="exempt",
            reason=_NO_EVIDENCE_REASON,
            llm_verdict=llm_verdict,
        )

    advisory = _advisory_failures(evidence)

    if not evidence.executed:
        return CompletionGateDecision(
            decision="exempt",
            reason=evidence.skip_reason or "The check suite did not run.",
            advisory_failures=advisory,
            llm_verdict=llm_verdict,
        )

    unsatisfied = _unsatisfied_blocking(evidence)
    if unsatisfied:
        return CompletionGateDecision(
            decision="gated",
            reason=_gated_reason(unsatisfied),
            unsatisfied_checks=[check.name for check in unsatisfied],
            advisory_failures=advisory,
            llm_verdict=llm_verdict,
        )

    return CompletionGateDecision(
        decision="passed",
        reason=_passed_reason(evidence),
        advisory_failures=advisory,
        llm_verdict=llm_verdict,
    )


def _unsatisfied_blocking(evidence: VerifierEvidence) -> list[CheckResult]:
    """Blocking checks that did not pass — failed, timed out, or never ran.

    Broader than :attr:`VerifierEvidence.blocking_failures`, which reports only
    checks that ran and failed. A check the permission policy denied is
    ``skipped``; from the gate's perspective that is a missing blocking check,
    not a passing one.

    ``invalid`` is the one exclusion (SWR-2616), and it is not a loosening. A
    check that could not be executed *as a test of the code* — a renamed script,
    a removed tool, a moved directory — says nothing about the code, and gating
    on it re-queues the task so an agent can repair a configuration it is not
    looking at and cannot change. The drift is reported, and reaches the user as
    an approval-gated proposal (SWR-2617) instead.
    """
    return [
        check
        for check in evidence.checks
        if check.severity == "blocking" and check.status not in {"passed", "invalid"}
    ]


def _advisory_failures(evidence: VerifierEvidence) -> list[str]:
    """Advisory checks that did not pass. ``invalid`` is drift, not a finding."""
    return [
        check.name
        for check in evidence.checks
        if check.severity == "advisory" and check.status not in {"passed", "invalid"}
    ]


def _gated_reason(unsatisfied: list[CheckResult]) -> str:
    detail = ", ".join(f"{check.name} ({check.status})" for check in unsatisfied)
    noun = "check" if len(unsatisfied) == 1 else "checks"
    return f"Blocking {noun} did not pass: {detail}."


def _passed_reason(evidence: VerifierEvidence) -> str:
    blocking = [check for check in evidence.checks if check.severity == "blocking"]
    count = sum(1 for check in blocking if check.status == "passed")
    noun = "check" if count == 1 else "checks"
    drifted = [check.name for check in blocking if check.status == "invalid"]
    if not drifted:
        return f"All {count} blocking {noun} passed."
    # Never silently: a role that went unverified because its command stopped
    # resolving must be visible in the very sentence that says the gate passed.
    named = ", ".join(drifted)
    return (
        f"All {count} blocking {noun} passed. {named} could not be executed here "
        "and verified nothing (SWR-2616)."
    )
