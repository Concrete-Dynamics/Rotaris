"""Productive use: when the check suite stays red, a user wants the harness to
give the agent a couple of informed repair attempts — attempts that actually
show it the failing output — and then stop and say which check is broken,
instead of silently burning the whole iteration budget on blind retries.

Expected outcome: the repair budget is bounded and its decisions are explicit —
each gated iteration charges one attempt, the attempt that reaches the limit
escalates with the failing checks named, and the injected repair context carries
exactly the blocking failures the gate charged for, bounded in size.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.evidence import VerifierEvidence
from rotaris_core.verifier.repair import (
    MAX_REPAIR_CONTEXT_CHARS,
    RepairDecision,
    build_repair_context,
    decide_repair,
)
from rotaris_core.verifier.runner import CheckResult


def _check(
    name: str = "tests",
    *,
    status: str = "failed",
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


def _executed(*checks: CheckResult) -> VerifierEvidence:
    return VerifierEvidence(
        verdict="failed",
        executed=True,
        suite_source="config",
        checks=list(checks),
    )


@verifies(SWR.SWR_2605)
def test_the_first_gated_iteration_gets_another_attempt() -> None:
    decision = decide_repair(attempts_used=1, max_attempts=2, unsatisfied=["tests"])

    assert decision.action == "retry"
    assert decision.attempt == 1
    assert decision.max_attempts == 2
    assert decision.unsatisfied_checks == ["tests"]
    assert "attempt 2 of 2" in decision.reason


@verifies(SWR.SWR_2605)
def test_the_attempt_that_reaches_the_limit_escalates_with_the_checks_named() -> None:
    decision = decide_repair(attempts_used=2, max_attempts=2, unsatisfied=["tests", "typecheck"])

    assert decision.action == "escalate"
    assert decision.attempt == 2
    # The reason becomes the report summary a user reads, so it has to say which
    # checks are still broken rather than just "verification failed".
    assert "tests, typecheck" in decision.reason


@verifies(SWR.SWR_2605)
def test_a_zero_budget_escalates_on_the_first_gated_iteration() -> None:
    # The documented way to have the gate report a failure without ever retrying.
    decision = decide_repair(attempts_used=1, max_attempts=0, unsatisfied=["tests"])

    assert decision.action == "escalate"
    assert decision.attempt == 1


@verifies(SWR.SWR_2605)
def test_the_repair_context_carries_the_failing_check_output() -> None:
    evidence = _executed(
        _check(
            "tests",
            exit_code=1,
            output_excerpt="E   assert 1 == 2",
            output_log_path="/session/evidence/verifier/tests.log",
        ),
    )

    context = build_repair_context(evidence, attempt=2, max_attempts=2)

    assert "tests" in context
    assert "run tests" in context
    assert "Exit code: 1" in context
    assert "E   assert 1 == 2" in context
    # The full log is referenced by path so the agent can read past the excerpt.
    assert "/session/evidence/verifier/tests.log" in context
    assert "attempt 2 of 2" in context


@verifies(SWR.SWR_2605, SWR.SWR_3004)
def test_the_repair_context_names_ending_the_turn_not_a_completion_tool() -> None:
    """Productive use: the agent is told to keep working, in terms it can act on.

    Expected outcome: the prompt steers on the observable behaviour (ending the
    turn) rather than on a terminal completion tool that is no longer registered.
    """
    context = build_repair_context(
        _executed(_check("tests", exit_code=1)), attempt=2, max_attempts=2
    )

    assert "do not end your turn" in context.lower()
    assert "finish" not in context.lower()


@verifies(SWR.SWR_2605)
def test_a_policy_denied_check_explains_why_it_never_ran() -> None:
    evidence = _executed(
        _check("tests", status="skipped", skip_reason="Permission policy denied 'uv run pytest'"),
    )

    context = build_repair_context(evidence, attempt=2, max_attempts=2)

    assert "Permission policy denied 'uv run pytest'" in context


@verifies(SWR.SWR_2605)
def test_advisory_failures_are_left_out_of_the_repair_context() -> None:
    # Advisory checks never gate, so the budget was never charged for them.
    # Asking the agent to repair one would spend an attempt on work the gate
    # does not require.
    evidence = _executed(
        _check("tests", status="passed"),
        _check("lint", severity="advisory", output_excerpt="line too long"),
    )

    context = build_repair_context(evidence, attempt=2, max_attempts=2)

    assert "lint" not in context
    assert "line too long" not in context


@verifies(SWR.SWR_2605)
def test_an_oversized_context_is_bounded_before_it_reaches_the_prompt() -> None:
    # Each check's excerpt is already bounded on its own; this is the total bound
    # that keeps a suite of several red checks out of the next attempt's prompt.
    evidence = _executed(
        _check("tests", output_excerpt="x" * 5000),
        _check("typecheck", output_excerpt="y" * 5000),
    )

    context = build_repair_context(evidence, attempt=2, max_attempts=2)

    assert len(context) <= MAX_REPAIR_CONTEXT_CHARS + 64
    assert "characters omitted" in context


@verifies(SWR.SWR_2605)
def test_the_decision_survives_a_json_round_trip() -> None:
    # The decision travels on a persisted child report, so it has to survive the
    # serialization every session snapshot performs.
    decision = decide_repair(attempts_used=2, max_attempts=2, unsatisfied=["tests"])

    restored = RepairDecision.model_validate(decision.model_dump(mode="json"))

    assert restored == decision
