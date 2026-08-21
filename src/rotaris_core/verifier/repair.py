"""Bounded repair attempts after a gated iteration (SWR-2605).

SWR-2604 turns failing blocking checks into a ``gated`` decision that re-queues
the task. On its own that is an unbounded retry: the same prompt runs again, the
same check fails again, and the task only stops when the generic same-task guard
hits ``runtime.max_iterations``. This module supplies the two missing halves.

- :func:`decide_repair` bounds the retries. Each gated iteration consumes one
  attempt from a per-task budget; when the budget is spent the caller escalates
  instead of re-queueing, so a permanently red check ends the task as
  failed-verification rather than burning the whole iteration cap.
- :func:`build_repair_context` gives the retry something new to work with. The
  failing checks' own output is injected into the next attempt's prompt, so the
  agent repairs from the actual failure instead of re-running blind.

Both are pure functions over the evidence and a counter — the attempt tally
lives on the loop, which owns per-task state. Only blocking checks that did not
pass appear in the repair context: advisory failures never gate, so asking the
agent to repair them would spend a budget the gate never charged.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.verifier.evidence import VerifierEvidence
    from rotaris_core.verifier.runner import CheckResult

#: What the loop should do with a gated iteration: give the agent another
#: attempt, or stop and report the failure to the user.
RepairAction = Literal["retry", "escalate"]

#: Total budget for the injected repair context, across *all* failing checks.
#: ``runner.MAX_EXCERPT_CHARS`` bounds each check's excerpt on its own; without a
#: second bound here a suite with five red checks would still push 20k characters
#: into the next attempt's prompt. The full output stays on disk and is
#: referenced by path, so nothing is lost — only the inline copy is trimmed.
MAX_REPAIR_CONTEXT_CHARS = 6000


@traces(SWR.SWR_2605)
class RepairDecision(BaseModel):
    """How a gated iteration's repair budget was spent."""

    #: ``retry`` re-queues the task with the failure injected; ``escalate`` ends it.
    action: RepairAction
    #: 1-based number of the attempt this gated iteration consumed.
    attempt: int
    #: The configured budget (``verifier.max_repair_attempts``).
    max_attempts: int
    #: Blocking checks that did not pass, in suite order.
    unsatisfied_checks: list[str] = Field(default_factory=list)
    #: Human-readable justification; becomes the report summary on escalation.
    reason: str


@traces(SWR.SWR_2605)
def decide_repair(
    *,
    attempts_used: int,
    max_attempts: int,
    unsatisfied: list[str],
) -> RepairDecision:
    """Decide whether a gated iteration gets another attempt.

    *attempts_used* counts this iteration — the first gated iteration passes 1.
    A ``max_attempts`` of 0 therefore escalates immediately, which is the
    documented way to make the gate report a failure without ever retrying.
    """
    detail = ", ".join(unsatisfied) or "the blocking checks"
    if attempts_used < max_attempts:
        return RepairDecision(
            action="retry",
            attempt=attempts_used,
            max_attempts=max_attempts,
            unsatisfied_checks=list(unsatisfied),
            reason=(
                f"Verification failed ({detail}); starting repair attempt "
                f"{attempts_used + 1} of {max_attempts}."
            ),
        )
    return RepairDecision(
        action="escalate",
        attempt=attempts_used,
        max_attempts=max_attempts,
        unsatisfied_checks=list(unsatisfied),
        reason=(
            f"Verification still failing after {max_attempts} repair "
            f"attempt(s): {detail}. Escalating instead of retrying."
        ),
    )


@traces(SWR.SWR_2605)
def build_repair_context(
    evidence: VerifierEvidence,
    *,
    attempt: int,
    max_attempts: int,
) -> str:
    """Render the failing checks as instructions for the next attempt.

    *attempt* is the attempt about to start, so the agent knows how much budget
    is left before the task is abandoned.
    """
    failing = _unsatisfied_blocking(evidence)
    lines = [
        "The deterministic check suite failed after your last change. Repair "
        f"attempt {attempt} of {max_attempts}: fix the failures below before "
        "reporting the work complete. Do not end your turn while any of these "
        "checks still fails.",
    ]
    for check in failing:
        lines.append("")
        lines.append(f"Check '{check.name}' ({check.status}): {check.command}")
        if check.exit_code is not None:
            lines.append(f"Exit code: {check.exit_code}")
        if check.skip_reason:
            lines.append(f"Not run: {check.skip_reason}")
        if check.output_log_path:
            lines.append(f"Full output: {check.output_log_path}")
        if check.output_excerpt:
            lines.append("Output:")
            lines.append(check.output_excerpt)
    return _bounded("\n".join(lines))


def _unsatisfied_blocking(evidence: VerifierEvidence) -> list[CheckResult]:
    """Blocking checks that did not pass — the same set the gate charges for.

    ``invalid`` is excluded for the same reason it does not gate (SWR-2616):
    handing an agent a check that could not run would spend a repair attempt on
    a configuration the agent cannot see, and the repair context would describe a
    failure the code never had.
    """
    return [
        check
        for check in evidence.checks
        if check.severity == "blocking" and check.status not in {"passed", "invalid"}
    ]


def _bounded(text: str) -> str:
    """Trim *text* to :data:`MAX_REPAIR_CONTEXT_CHARS`, keeping the head.

    The head carries the instruction and the first failing check, which is the
    one worth fixing first; the tail is the least useful part of a long log.
    """
    if len(text) <= MAX_REPAIR_CONTEXT_CHARS:
        return text
    omitted = len(text) - MAX_REPAIR_CONTEXT_CHARS
    return f"{text[:MAX_REPAIR_CONTEXT_CHARS]}\n... [{omitted} characters omitted] ..."
