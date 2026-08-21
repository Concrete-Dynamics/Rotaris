"""One suite, one runner, and one thing left for the persona to do (SWR-2619).

``agents/prompts/verifier.md`` told the acceptance persona to run ``make lint``,
``make typecheck`` and ``make test`` itself — the same three roles detection
binds. So a task that reached delegated acceptance paid for the whole suite
twice, in two terminals, with two chances to disagree about what the exit code
was. The duplication was pure cost: the deterministic run had already happened
before the orchestrator could delegate.

And a red gate never needed the persona at all. SWR-2604 downgrades the verdict
and SWR-2605 re-queues with the failing output attached; spending a model call to
re-narrate a check the runner already reported buys nothing and delays the
repair.

What is left is the duty the gate *cannot* discharge — whether the work answers
the request, whether the todo items are true of the code on disk, whether
anything crept in — so the persona reads the evidence for everything else.

Three rules, and they are all here rather than in a prompt, because a prompt
instruction is a request and this needs to be an arrangement:

- **The evidence travels to the persona.** :func:`acceptance_evidence_block`
  renders the iteration's per-check results and the paths to their full logs, so
  reading them is easier than re-running them.
- **A red gate is not offered for acceptance.** :func:`may_delegate_acceptance`
  says so, and says why, so the orchestrator hears a reason rather than a
  refusal.
- **Where there is no evidence, the persona runs the commands itself** — an
  exempt suite, a ``pending`` gate, an iteration that changed no files — and says
  in its report that it did and why. Nothing goes ungraded.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, NamedTuple

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.verifier.evidence import VerifierEvidence

__all__ = [
    "ACCEPTANCE_PERSONA",
    "AcceptanceDecision",
    "acceptance_evidence_block",
    "may_delegate_acceptance",
]

#: The persona whose job this is. Named here so the delegation path can ask
#: "is this an acceptance check?" without a string literal in three modules.
ACCEPTANCE_PERSONA = "verifier"

#: Statuses that mean this check answered the question it was asked.
_ANSWERED = frozenset({"passed", "failed", "timeout"})


@traces(SWR.SWR_2619)
class AcceptanceDecision(NamedTuple):
    """Whether an acceptance check is worth delegating right now."""

    allowed: bool
    reason: str = ""


@traces(SWR.SWR_2619, SWR.SWR_2603)
def acceptance_evidence_block(evidence: VerifierEvidence | None) -> str:
    """This iteration's check results, as the acceptance payload carries them.

    Empty when there is nothing to carry, which is the signal for the fallback:
    a persona handed no evidence runs the commands itself and says so. The two
    cases must stay distinguishable, because "the suite passed" and "no suite
    ran" are the exact pair this epic exists to keep apart.
    """
    if evidence is None or not evidence.executed or not evidence.checks:
        return ""

    lines = [
        "## Verification evidence (already run — do not re-run these)",
        "",
        f"The deterministic check suite ran for this iteration: **{evidence.verdict}**.",
        "These are the commands the runner executed. Read them; do not repeat them.",
        "",
        "| Check | Command | Status | Exit | Full output |",
        "| --- | --- | --- | --- | --- |",
    ]
    for check in evidence.checks:
        exit_code = "—" if check.exit_code is None else str(check.exit_code)
        log = check.output_log_path or "—"
        lines.append(
            f"| {check.name} | `{check.command}` | {check.status} | {exit_code} | {log} |",
        )

    unanswered = [check for check in evidence.checks if check.status not in _ANSWERED]
    if unanswered:
        lines.extend(
            [
                "",
                "These checks did **not** answer the question they were asked — they were "
                "skipped, denied, or could not be executed at all — so nothing in the suite "
                "covers what they would have:",
                "",
                *(f"- {check.name}: {check.skip_reason or check.status}" for check in unanswered),
            ],
        )

    lines.extend(
        [
            "",
            "If you need a check this suite does not cover, run that one command and "
            "**name the role the gate is missing** in your report. That is a fact about "
            "the gate, and it becomes a gate-update proposal (SWR-2617) — it is not a "
            "licence to re-run the suite.",
        ],
    )
    return "\n".join(lines) + "\n\n"


@traces(SWR.SWR_2619, SWR.SWR_2604, SWR.SWR_2605)
def may_delegate_acceptance(evidence: VerifierEvidence | None) -> AcceptanceDecision:
    """Whether an acceptance check should be delegated for this iteration.

    A red gate belongs to the bounded repair loop, not to a grader: the verdict
    is already downgraded (SWR-2604), the task is already re-queued with the
    failing output attached (SWR-2605), and a model call spent re-narrating that
    failure delays the fix it is describing.

    No evidence at all is *allowed* — that is the fallback path, and refusing it
    would leave the work ungraded, which is worse than grading it twice.
    """
    if evidence is None or not evidence.executed:
        return AcceptanceDecision(allowed=True)

    failing = [
        check.name
        for check in evidence.checks
        if check.severity == "blocking" and check.status in {"failed", "timeout"}
    ]
    if failing:
        named = ", ".join(failing)
        return AcceptanceDecision(
            allowed=False,
            reason=(
                f"the deterministic gate is red ({named}), so this slice is not ready for "
                "acceptance. The repair loop already has the failing output and has "
                "re-queued the task; delegate acceptance once the checks pass (SWR-2619)."
            ),
        )
    return AcceptanceDecision(allowed=True)
