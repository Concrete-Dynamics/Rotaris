"""Productive use: a task that modifies code, passes its checks, and reaches
delegated acceptance.

Expected outcome: the bound suite ran exactly once, in the runner. The acceptance
persona is handed those results and grades what the gate cannot see; a slice
whose gate is red is not offered for acceptance at all, because the repair loop
already owns it; and a slice with no evidence still gets graded, by a persona
that runs the commands itself and says so.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.acceptance import (
    ACCEPTANCE_PERSONA,
    acceptance_evidence_block,
    may_delegate_acceptance,
)
from rotaris_core.verifier.evidence import VerifierEvidence
from rotaris_core.verifier.runner import CheckResult, VerifierRunResult

pytestmark = pytest.mark.unit

_PROMPT = Path(__file__).resolve().parents[3] / "src/rotaris_core/agents/prompts/verifier.md"


def _evidence(*results: CheckResult, executed: bool = True) -> VerifierEvidence:
    return VerifierEvidence.from_run(
        VerifierRunResult(
            executed=executed,
            suite_source="detected",
            results=list(results),
            skip_reason=None if executed else "this iteration changed no files",
        ),
    )


def _check(
    name: str = "make:test",
    *,
    status: str = "passed",
    severity: str = "blocking",
    **extra: object,
) -> CheckResult:
    return CheckResult(
        name=name,
        command=f"make {name.split(':')[-1]}",
        status=status,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        **extra,  # type: ignore[arg-type]
    )


# -- the evidence the persona is handed --------------------------------------


@verifies(SWR.SWR_2619, SWR.SWR_2603)
def test_the_payload_carries_the_results_and_the_paths_to_the_full_logs() -> None:
    """Reading them has to be easier than re-running them, or it will not happen."""
    block = acceptance_evidence_block(
        _evidence(
            _check(exit_code=0, output_log_path="/s/evidence/verifier/20260820-test.log"),
            _check("make:lint", severity="advisory", exit_code=0),
        ),
    )

    assert "do not re-run these" in block
    assert "`make test`" in block
    assert "/s/evidence/verifier/20260820-test.log" in block


@verifies(SWR.SWR_2619, SWR.SWR_2616)
def test_a_check_that_answered_nothing_is_named_rather_than_listed_as_covered() -> None:
    """A skipped, denied or unexecutable check leaves its role ungraded, and a
    persona reading a table of statuses would have to work that out for itself."""
    block = acceptance_evidence_block(
        _evidence(
            _check(),
            _check("mypy", status="invalid", skip_reason="mypy does not resolve here"),
        ),
    )

    assert "did **not** answer" in block
    assert "mypy does not resolve here" in block


@verifies(SWR.SWR_2619, SWR.SWR_2617)
def test_the_payload_says_what_to_do_about_a_role_the_gate_does_not_cover() -> None:
    """A persona needing a check the gate lacks is a fact about the gate — not a
    licence to run suites, and not something to leave unsaid."""
    block = acceptance_evidence_block(_evidence(_check()))

    assert "name the role the gate is missing" in block
    assert "not a licence to re-run the suite" in block


@verifies(SWR.SWR_2619)
def test_no_evidence_produces_no_block_at_all() -> None:
    """The fallback signal. "The suite passed" and "no suite ran" are the exact
    pair this epic exists to keep apart, so they must not both look like silence
    plus a table."""
    assert acceptance_evidence_block(None) == ""
    assert acceptance_evidence_block(_evidence(executed=False)) == ""
    assert acceptance_evidence_block(_evidence()) == ""


# -- when acceptance is worth delegating -------------------------------------


@verifies(SWR.SWR_2619, SWR.SWR_2605)
def test_a_red_gate_is_not_offered_for_acceptance(tmp_path: Path) -> None:
    """The repair loop already has the failing output and has re-queued the task.

    A model call spent re-narrating that failure delays the fix it describes.
    """
    del tmp_path

    decision = may_delegate_acceptance(_evidence(_check(status="failed"), _check("mypy")))

    assert not decision.allowed
    assert "make:test" in decision.reason
    assert "repair loop" in decision.reason


@verifies(SWR.SWR_2619)
def test_a_green_gate_is_offered() -> None:
    assert may_delegate_acceptance(_evidence(_check(), _check("mypy"))).allowed


@verifies(SWR.SWR_2619)
def test_an_advisory_failure_never_withholds_acceptance() -> None:
    """Advisory checks never gate, so they must not gate this either."""
    assert may_delegate_acceptance(
        _evidence(_check(), _check("ruff", status="failed", severity="advisory")),
    ).allowed


@verifies(SWR.SWR_2619)
def test_a_slice_with_no_evidence_is_still_graded() -> None:
    """Refusing here would leave the work ungraded, which is worse than grading
    it twice — an exempt suite, a pending gate, a read-only iteration."""
    assert may_delegate_acceptance(None).allowed
    assert may_delegate_acceptance(_evidence(executed=False)).allowed


# -- what the persona is told ------------------------------------------------


@verifies(SWR.SWR_2619)
def test_the_persona_is_no_longer_told_to_run_the_bound_suite() -> None:
    """The duplication this requirement exists to kill, pinned in the prompt.

    A slice that reached acceptance used to pay for `make lint`, `make typecheck`
    and `make test` twice, in two terminals, with two chances to disagree about
    what the exit code was.
    """
    prompt = _PROMPT.read_text(encoding="utf-8")

    assert "```bash\nmake lint\nmake typecheck\nmake test\n```" not in prompt
    assert "Do not re-run those commands" in prompt


@verifies(SWR.SWR_2619, SWR.SWR_2604)
def test_the_persona_is_no_longer_described_as_the_final_gate() -> None:
    """The deterministic gate is. Describing the persona that way invites it to
    behave like one — which means running the suite."""
    prompt = _PROMPT.read_text(encoding="utf-8")

    assert "You are the **final gate**" not in prompt
    assert "deterministic check suite is the final gate" in prompt


@verifies(SWR.SWR_2619)
def test_the_persona_is_told_the_fallback_and_the_missing_role_rule() -> None:
    """Nothing goes ungraded, and a gap in the gate is reported as one."""
    prompt = _PROMPT.read_text(encoding="utf-8")

    assert "No evidence at all" in prompt
    assert "which role the gate is missing" in prompt


@verifies(SWR.SWR_2619)
def test_both_verdicts_stay_separable_in_the_report_format() -> None:
    """A PASS on a gated iteration and GAPS FOUND on a green one are both real
    answers to different questions, and neither may overwrite the other."""
    prompt = _PROMPT.read_text(encoding="utf-8")

    assert "not a green build" in prompt
    assert "different questions" in prompt


@verifies(SWR.SWR_2619)
def test_the_acceptance_persona_is_the_one_this_all_applies_to() -> None:
    from rotaris_core.config.defaults import DEFAULT_PERSONAS

    assert ACCEPTANCE_PERSONA in DEFAULT_PERSONAS
    assert DEFAULT_PERSONAS[ACCEPTANCE_PERSONA].system_prompt_file == "prompts/verifier.md"


# -- through the delegation path ---------------------------------------------


class _Scheduler:
    def __init__(self, evidence: VerifierEvidence | None) -> None:
        self.last_verifier_evidence = evidence
        self.config = None


def _executor(evidence: VerifierEvidence | None):
    from rotaris_core.orchestrator.delegate_tool import RotarisDelegateExecutor

    return RotarisDelegateExecutor(
        child_manager=object(),
        scheduler=_Scheduler(evidence),
        agent_factory=object(),
    )


@verifies(SWR.SWR_2619, SWR.SWR_2603)
def test_the_evidence_reaches_the_acceptance_payload_and_nobody_elses() -> None:
    """Every other persona is doing the work, not grading it — a table of check
    results in its payload is noise it has to read past."""
    executor = _executor(_evidence(_check(exit_code=0)))

    assert "do not re-run these" in executor._verifier_evidence_prefix(ACCEPTANCE_PERSONA)
    assert executor._verifier_evidence_prefix("coding-agent") == ""


@verifies(SWR.SWR_2619, SWR.SWR_2604)
def test_the_delegation_path_refuses_acceptance_on_a_red_gate() -> None:
    """Held to, not asked to observe: a rule the orchestrator can simply not
    follow is a rule that eventually is not followed."""
    refused = _executor(_evidence(_check(status="failed")))._acceptance_gate(ACCEPTANCE_PERSONA)

    assert refused is not None
    assert refused.is_error
    assert "not ready for acceptance" in refused.text

    allowed = _executor(_evidence(_check()))._acceptance_gate(ACCEPTANCE_PERSONA)
    assert allowed is None


@verifies(SWR.SWR_2619)
def test_a_red_gate_never_withholds_any_other_delegation() -> None:
    """The repair the gate is waiting for is somebody's job, and refusing to
    delegate it would deadlock the loop this rule is meant to speed up."""
    executor = _executor(_evidence(_check(status="failed")))

    assert executor._acceptance_gate("coding-agent") is None
