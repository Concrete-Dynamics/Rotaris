from __future__ import annotations

from unittest.mock import MagicMock

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.orchestrator.child_state import ChildTaskRecord
from rotaris_core.orchestrator.report import (
    ChildReportArtifact,
    ErrorInfo,
)
from rotaris_core.orchestrator.report import (
    TestResult as ReportTestResult,
)
from rotaris_core.orchestrator.scheduler import Scheduler
from rotaris_core.reqtocode import SWR, verifies


def _scheduler() -> Scheduler:
    return Scheduler(config=RotarisConfig(), workspace_root="/tmp/test", summary_agent=MagicMock())


def _record() -> ChildTaskRecord:
    return ChildTaskRecord(
        name="check",
        canonical_name="check",
        persona="tester",
        task_payload="verify",
    )


@verifies(SWR.SWR_126)
def test_report_validation_passthrough_ignores_errors() -> None:
    """A report with ErrorInfo entries is not downgraded — the LLM classifier
    handles semantic completion checking."""
    report = ChildReportArtifact(
        agent_name="check",
        persona="tester",
        status="succeeded",
        summary="Done",
        errors=[ErrorInfo(type="RuntimeError", message="boom")],
    )

    validated = _scheduler()._validate_child_report(_record(), report)

    assert validated is report


@verifies(SWR.SWR_126)
def test_report_validation_passthrough_ignores_failed_tests() -> None:
    """A report with failed TestResult entries is not downgraded — the LLM
    classifier is the completion gate now."""
    report = ChildReportArtifact(
        agent_name="check",
        persona="tester",
        status="succeeded",
        summary="Done",
        tests=[ReportTestResult(name="pytest", status="failed", summary="1 failed")],
    )

    validated = _scheduler()._validate_child_report(_record(), report)

    assert validated is report


@verifies(SWR.SWR_126)
def test_report_validation_passthrough_ignores_next_actions() -> None:
    """next_recommended_actions content never causes a downgrade."""
    report = ChildReportArtifact(
        agent_name="check",
        persona="tester",
        status="succeeded",
        summary="Fixed",
        next_recommended_actions=["still needs verification", "work remains incomplete"],
    )

    validated = _scheduler()._validate_child_report(_record(), report)

    assert validated is report


@verifies(SWR.SWR_126)
def test_report_validation_keeps_clean_success() -> None:
    report = ChildReportArtifact(
        agent_name="check",
        persona="tester",
        status="succeeded",
        summary="All checks passed",
    )

    validated = _scheduler()._validate_child_report(_record(), report)

    assert validated is report


@verifies(SWR.SWR_126)
def test_report_validation_passthrough_for_non_succeeded_status() -> None:
    """Non-succeeded reports are returned unchanged."""
    for status in ("failed", "partial", "cancelled", "blocked"):
        report = ChildReportArtifact(
            agent_name="check",
            persona="tester",
            status=status,
            summary="something went wrong",
        )
        validated = _scheduler()._validate_child_report(_record(), report)
        assert validated is report, f"expected passthrough for status={status}"
