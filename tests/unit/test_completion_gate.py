"""Productive use: a user relies on the harness to refuse to call work "done"
while the workspace's own build/test/lint suite is red — and to say so in a way
that names the check, instead of quietly re-running a task that was never
verified in the first place.

Expected outcome: the completion gate turns verifier evidence into one of three
decisions — gated, passed, or exempt — where a blocking check that did not pass
(for any reason, including "the permission policy refused to run it") always
gates, advisory failures never do, and an unverified iteration is exempt rather
than mistaken for either.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.evidence import VerifierEvidence
from rotaris_core.verifier.gate import CompletionGateDecision, evaluate_completion_gate
from rotaris_core.verifier.runner import CheckResult


def _check(
    name: str = "tests",
    *,
    status: str = "passed",
    severity: str = "blocking",
    **kwargs: object,
) -> CheckResult:
    return CheckResult(
        name=name,
        command=f"run {name}",
        severity=severity,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        **kwargs,  # type: ignore[arg-type]
    )


def _executed(*checks: CheckResult, verdict: str = "failed") -> VerifierEvidence:
    return VerifierEvidence(
        verdict=verdict,  # type: ignore[arg-type]
        executed=True,
        suite_source="config",
        checks=list(checks),
    )


@verifies(SWR.SWR_2604)
def test_a_failed_blocking_check_gates_completion() -> None:
    evidence = _executed(_check("tests", status="failed", exit_code=1))

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "gated"
    assert decision.unsatisfied_checks == ["tests"]
    assert "tests (failed)" in decision.reason


@verifies(SWR.SWR_2604)
def test_a_blocking_check_denied_by_policy_gates_completion() -> None:
    # SWR-2602 records a permission-denied check as `skipped`, never as passed.
    # From the gate's side that is a *missing* blocking check: the workspace was
    # never verified, so the work cannot be called complete.
    evidence = _executed(
        _check(
            "tests",
            status="skipped",
            skip_reason="Permission policy denied 'uv run pytest'",
        ),
    )

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "gated"
    assert decision.unsatisfied_checks == ["tests"]
    assert "tests (skipped)" in decision.reason


@verifies(SWR.SWR_2604)
def test_a_timed_out_blocking_check_gates_completion() -> None:
    evidence = _executed(_check("build", status="timeout"))

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "gated"
    assert decision.unsatisfied_checks == ["build"]


@verifies(SWR.SWR_2604)
def test_an_advisory_failure_alone_does_not_gate_but_is_reported() -> None:
    evidence = _executed(
        _check("tests", status="passed"),
        _check("lint", status="failed", severity="advisory"),
        verdict="passed",
    )

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "passed"
    assert decision.unsatisfied_checks == []
    # Not blocking, but the user still has to be able to see it.
    assert decision.advisory_failures == ["lint"]


@verifies(SWR.SWR_2604)
def test_every_unsatisfied_blocking_check_is_named() -> None:
    evidence = _executed(
        _check("tests", status="failed"),
        _check("typecheck", status="timeout"),
        _check("lint", status="failed", severity="advisory"),
        _check("build", status="passed"),
    )

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "gated"
    assert decision.unsatisfied_checks == ["tests", "typecheck"]
    assert decision.advisory_failures == ["lint"]


@verifies(SWR.SWR_2604)
def test_a_read_only_iteration_is_exempt_with_its_reason() -> None:
    evidence = VerifierEvidence(
        verdict="skipped",
        executed=False,
        suite_source="config",
        skip_reason="No tracked file modifications in this iteration",
    )

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "exempt"
    assert decision.reason == "No tracked file modifications in this iteration"
    assert decision.unsatisfied_checks == []


@verifies(SWR.SWR_2604)
def test_a_workspace_that_declares_no_checks_is_exempt() -> None:
    # `verifier.checks: []` is a recorded decision, not a failure to verify —
    # gating it would make every such workspace re-queue forever.
    evidence = VerifierEvidence(
        verdict="skipped",
        executed=False,
        suite_source="explicit_empty",
        skip_reason="This workspace explicitly declares no verification",
    )

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "exempt"


@verifies(SWR.SWR_2604)
def test_a_workspace_with_no_detectable_suite_is_exempt() -> None:
    evidence = VerifierEvidence(
        verdict="skipped",
        executed=False,
        suite_source="detection_empty",
        skip_reason="No check suite is configured and no workspace marker was recognized",
    )

    decision = evaluate_completion_gate(evidence)

    assert decision.decision == "exempt"


@verifies(SWR.SWR_2604)
def test_a_report_without_verifier_evidence_is_exempt() -> None:
    # The degraded path: the verifier itself failed, or the report predates it.
    # A broken verifier must not be able to stall a run.
    decision = evaluate_completion_gate(None)

    assert decision.decision == "exempt"
    assert "No verifier evidence" in decision.reason


@verifies(SWR.SWR_2604)
def test_an_llm_complete_verdict_cannot_survive_a_blocking_failure() -> None:
    evidence = _executed(_check("tests", status="failed"))

    decision = evaluate_completion_gate(evidence, llm_verdict="COMPLETE")

    assert decision.decision == "gated"
    # The overruled verdict is kept so the override is auditable, not silent.
    assert decision.llm_verdict == "COMPLETE"


@verifies(SWR.SWR_2604)
def test_a_clean_suite_passes_the_gate() -> None:
    evidence = _executed(
        _check("tests", status="passed"),
        _check("typecheck", status="passed"),
        verdict="passed",
    )

    decision = evaluate_completion_gate(evidence, llm_verdict="COMPLETE")

    assert decision.decision == "passed"
    assert decision.reason == "All 2 blocking checks passed."
    assert decision.llm_verdict == "COMPLETE"


@verifies(SWR.SWR_2604)
def test_the_decision_survives_a_json_round_trip() -> None:
    # The decision travels inside a persisted report snapshot, so every field a
    # host or the SWR-2605 repair loop reads has to be stored, not derived.
    decision = evaluate_completion_gate(
        _executed(
            _check("tests", status="failed"),
            _check("lint", status="failed", severity="advisory"),
        ),
        llm_verdict="COMPLETE",
    )

    restored = CompletionGateDecision.model_validate(decision.model_dump(mode="json"))

    assert restored == decision
    assert restored.decision == "gated"
    assert restored.unsatisfied_checks == ["tests"]
    assert restored.advisory_failures == ["lint"]
    assert restored.llm_verdict == "COMPLETE"
