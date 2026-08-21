"""Productive use: a user reading a child report can see what the workspace's own
checks actually did, instead of taking the agent's word that the work is done.

Expected outcome: the report carries a deterministic verdict, the suite it came
from, and the per-check results — and a report written before this field existed
still loads.
"""

from __future__ import annotations

from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.evidence import VerifierEvidence
from rotaris_core.verifier.runner import CheckResult, VerifierRunResult


def _check(
    name: str,
    status: str,
    *,
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


@verifies(SWR.SWR_2603)
def test_a_skipped_run_yields_a_skipped_verdict_with_its_reason() -> None:
    # A suite that never ran must never read as "checks passed" — the gate
    # (SWR-2604) needs positive evidence, not the absence of a failure.
    run = VerifierRunResult(
        executed=False,
        suite_source="detected",
        skip_reason="No tracked file modifications in this iteration.",
    )

    evidence = VerifierEvidence.from_run(run)

    assert evidence.verdict == "skipped"
    assert evidence.executed is False
    assert evidence.skip_reason == "No tracked file modifications in this iteration."
    assert evidence.checks == []


@verifies(SWR.SWR_2603)
def test_a_run_whose_blocking_check_failed_yields_a_failed_verdict() -> None:
    run = VerifierRunResult(
        executed=True,
        suite_source="config",
        results=[
            _check("lint", "passed", severity="advisory"),
            _check("tests", "failed", exit_code=1, output_excerpt="1 failed"),
        ],
        duration_s=12.5,
    )

    evidence = VerifierEvidence.from_run(run)

    assert evidence.verdict == "failed"
    assert [check.name for check in evidence.blocking_failures] == ["tests"]
    assert evidence.duration_s == 12.5
    assert evidence.suite_source == "config"


@verifies(SWR.SWR_2603)
def test_an_advisory_failure_alone_still_yields_a_passed_verdict() -> None:
    # Advisory checks inform, they do not gate — but they still travel in the
    # evidence so the user sees them.
    run = VerifierRunResult(
        executed=True,
        suite_source="detected",
        results=[
            _check("tests", "passed"),
            _check("lint", "failed", severity="advisory", exit_code=1),
        ],
    )

    evidence = VerifierEvidence.from_run(run)

    assert evidence.verdict == "passed"
    assert evidence.blocking_failures == []
    assert [check.status for check in evidence.checks] == ["passed", "failed"]


@verifies(SWR.SWR_2603)
def test_a_timeout_on_a_blocking_check_yields_a_failed_verdict() -> None:
    run = VerifierRunResult(
        executed=True,
        suite_source="config",
        results=[_check("tests", "timeout", outcome_kind="timeout")],
    )

    assert VerifierEvidence.from_run(run).verdict == "failed"


@verifies(SWR.SWR_2603)
def test_a_permission_denied_check_is_evidence_of_a_skip_not_a_pass() -> None:
    # SWR-2602 records a denied check as `skipped` with the violated rule. It is
    # not a blocking failure, but it must never read as a passing check either.
    run = VerifierRunResult(
        executed=True,
        suite_source="config",
        results=[
            _check("tests", "skipped", skip_reason="Permission denied by rule 'deny-pytest'.")
        ],
    )

    evidence = VerifierEvidence.from_run(run)

    assert evidence.checks[0].status == "skipped"
    assert "deny-pytest" in str(evidence.checks[0].skip_reason)
    assert evidence.blocking_failures == []


@verifies(SWR.SWR_2603)
def test_the_verdict_and_suite_source_survive_a_json_round_trip() -> None:
    # The verdict is a stored field, not a property: hosts and the artifact
    # store read the report back from JSON.
    run = VerifierRunResult(
        executed=True,
        suite_source="detected",
        results=[
            _check(
                "tests",
                "failed",
                exit_code=2,
                duration_s=3.25,
                output_excerpt="1 failed, 4 passed",
                output_log_path="/sessions/s1/evidence/verifier/tests.log",
            ),
        ],
    )
    report = ChildReportArtifact(
        agent_name="child",
        persona="coder",
        status="succeeded",
        summary="Edited a file",
        verifier_results=VerifierEvidence.from_run(run),
    )

    payload = report.model_dump(mode="json")
    assert payload["verifier_results"]["verdict"] == "failed"
    assert payload["verifier_results"]["suite_source"] == "detected"

    restored = ChildReportArtifact.model_validate(payload)
    assert restored.verifier_results is not None
    check = restored.verifier_results.checks[0]
    assert (check.name, check.status, check.exit_code, check.duration_s) == (
        "tests",
        "failed",
        2,
        3.25,
    )
    assert check.output_excerpt == "1 failed, 4 passed"
    assert check.output_log_path == "/sessions/s1/evidence/verifier/tests.log"


@verifies(SWR.SWR_2603)
def test_a_report_payload_without_the_verifier_field_still_validates() -> None:
    # Backward compatibility: sessions and persisted reports written before this
    # field existed must remain loadable.
    legacy_payload = {
        "agent_name": "child",
        "persona": "coder",
        "status": "succeeded",
        "summary": "Did the work",
        "tests": [{"name": "pytest", "status": "passed", "summary": "all green"}],
    }

    report = ChildReportArtifact.model_validate(legacy_payload)

    assert report.verifier_results is None
    assert report.tests[0].name == "pytest"
