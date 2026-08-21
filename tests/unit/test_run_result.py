"""Terminal run result model (SWR-1828).

Inputs here are real ``RalphProgressFile`` / ``SessionState`` objects rather
than mocks: the whole point of this model is that its field names line up with
what a run actually produces, and a ``Mock()`` would happily answer to a
misspelled attribute.
"""

from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

import pytest

from rotaris_core.cost import CostSnapshot, CostSource
from rotaris_core.ralph.state import (
    RalphIterationOutcome,
    RalphIterationState,
    RalphProgressFile,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.run_result import (
    EXIT_CODES,
    REPORT_REF_KEYS,
    ReportRef,
    RunResult,
    RunStatus,
    build_run_result,
)
from rotaris_core.session.state import SessionState
from rotaris_core.tokens import TokenSnapshot

pytestmark = pytest.mark.unit

_NOW = dt.datetime(2026, 8, 7, 12, 0, 0, tzinfo=dt.UTC)


def _progress(
    *,
    stop_reason: str | None,
    completed: int = 0,
    abandoned: int = 0,
    iterations: int = 0,
) -> RalphProgressFile:
    return RalphProgressFile(
        session_id="session-1",
        started_at=_NOW,
        iterations=[
            RalphIterationState(
                iteration_number=index + 1,
                task_id=f"task-{index}",
                task_name=f"Task {index}",
                started_at=_NOW,
                ended_at=_NOW,
                outcome=(
                    RalphIterationOutcome.COMPLETED
                    if index < completed
                    else RalphIterationOutcome.ABANDONED
                ),
                report_summary="ran out of budget" if index >= completed else "done",
            )
            for index in range(iterations)
        ],
        total_tasks=completed + abandoned,
        completed_tasks=completed,
        abandoned_tasks=abandoned,
        stop_reason=stop_reason,
    )


def _state(
    *,
    tokens: TokenSnapshot | None = None,
    cost: CostSnapshot | None = None,
    execution_status: str = "completed",
) -> SessionState:
    state = SessionState(
        session_id="session-1",
        workspace_root="/tmp/workspace",
        created_at=_NOW,
        updated_at=_NOW,
        execution_status=execution_status,
    )
    if tokens is not None:
        state.global_token_usage = tokens
    if cost is not None:
        state.global_cost = cost
    return state


@verifies(SWR.SWR_1828)
def test_completed_run_composes_status_report_and_aggregate_figures() -> None:
    """Productive use: a CI consumer reads one terminal record for a finished run.
    Expected outcome: status, report reference and token/cost aggregates all come
    from the run's real progress file and session state, and the exit code is 0."""
    progress = _progress(stop_reason="all tasks completed", completed=2, iterations=2)
    state = _state(
        tokens=TokenSnapshot(prompt_tokens=1200, completion_tokens=300, cache_read_tokens=100),
        cost=CostSnapshot(
            accumulated_cost=0.42,
            priced_calls=7,
            unpriced_calls=0,
            source=CostSource.PROVIDER,
        ),
    )

    result = build_run_result(
        session_id="session-1",
        state=state,
        progress=progress,
        report={
            "id": "rep-1",
            "agent_name": "coder",
            "status": "succeeded",
            "path": "reports/1.md",
        },
    )

    assert result.status is RunStatus.COMPLETED
    assert result.exit_code == 0
    assert result.stop_reason == "all tasks completed"
    assert result.iterations_completed == 2
    assert result.summary == "Run completed."
    assert result.report == ReportRef(
        id="rep-1",
        agent_name="coder",
        status="succeeded",
        path="reports/1.md",
    )
    assert result.tokens is not None
    assert result.tokens.prompt_tokens == 1200
    assert result.tokens.completion_tokens == 300
    assert result.cost is not None
    assert result.cost.accumulated_cost == pytest.approx(0.42)
    assert result.cost.priced_calls == 7
    assert result.error is None


@verifies(SWR.SWR_1828)
def test_every_run_status_has_an_exit_code() -> None:
    """Productive use: a script author relies on the exit code of any run outcome.
    Expected outcome: the status/exit-code mapping is total, so a newly added status
    cannot silently fall back to a success code."""
    assert set(EXIT_CODES) == set(RunStatus)
    assert EXIT_CODES == {
        RunStatus.COMPLETED: 0,
        RunStatus.FAILED: 1,
        RunStatus.ERROR: 1,
        RunStatus.MAX_ITERATIONS: 2,
        RunStatus.INTERRUPTED: 130,
    }
    for status, expected in EXIT_CODES.items():
        result = RunResult(session_id="s", status=status)
        assert result.exit_code == expected


@verifies(SWR.SWR_1828)
def test_unmapped_status_raises_instead_of_reporting_success() -> None:
    """Productive use: a maintainer adds a run status and must not ship a wrong exit code.
    Expected outcome: an outcome with no exit-code entry fails loudly instead of
    defaulting to 0."""
    result = RunResult(session_id="s", status=RunStatus.COMPLETED)
    removed = EXIT_CODES.pop(RunStatus.COMPLETED)
    try:
        with pytest.raises(KeyError):
            _ = result.exit_code
    finally:
        EXIT_CODES[RunStatus.COMPLETED] = removed


@verifies(SWR.SWR_1828, SWR.SWR_1829)
def test_unpriced_run_is_distinguishable_from_a_genuinely_free_run() -> None:
    """Productive use: a budget dashboard must not read an unpriced run as costing nothing.
    Expected outcome: the serialized result keeps the cost source and the unpriced call
    count, so 'unknown cost' and 'zero cost' are different records."""
    unpriced = build_run_result(
        session_id="session-1",
        state=_state(
            cost=CostSnapshot(
                accumulated_cost=0.0,
                priced_calls=0,
                unpriced_calls=5,
                source=CostSource.UNAVAILABLE,
            ),
        ),
        progress=_progress(stop_reason="all tasks completed", completed=1, iterations=1),
    )
    free = build_run_result(
        session_id="session-1",
        state=_state(
            cost=CostSnapshot(
                accumulated_cost=0.0,
                priced_calls=4,
                unpriced_calls=0,
                source=CostSource.PROVIDER,
            ),
        ),
        progress=_progress(stop_reason="all tasks completed", completed=1, iterations=1),
    )

    unpriced_payload = unpriced.model_dump(mode="json")["cost"]
    free_payload = free.model_dump(mode="json")["cost"]

    assert unpriced_payload["accumulated_cost"] == free_payload["accumulated_cost"] == 0.0
    assert unpriced_payload != free_payload
    assert unpriced_payload["source"] == "unavailable"
    assert unpriced_payload["unpriced_calls"] == 5
    assert unpriced_payload["priced_calls"] == 0
    assert free_payload["source"] == "provider"
    assert free_payload["unpriced_calls"] == 0


@verifies(SWR.SWR_1828, SWR.SWR_1829)
def test_absent_cost_serializes_as_null_not_zero() -> None:
    """Productive use: a consumer of a run that never reached an LLM sees 'no data'.
    Expected outcome: a missing cost stays null in the serialized result instead of
    being reported as a zero-cost run."""
    result = build_run_result(session_id="session-1", state=None, progress=None)

    payload = result.model_dump(mode="json")

    assert payload["cost"] is None
    assert payload["tokens"] is None


@verifies(SWR.SWR_1828)
def test_missing_state_and_progress_yields_an_error_result_without_raising() -> None:
    """Productive use: a run that crashed during bootstrap still reports an outcome.
    Expected outcome: the result is an error status with a stated reason and a
    non-zero exit code rather than an exception on the error path."""
    result = build_run_result(session_id="session-1", state=None, progress=None)

    assert result.status is RunStatus.ERROR
    assert result.exit_code == 1
    assert result.error
    assert "unknown" in result.error.lower()
    assert result.session_id == "session-1"


@verifies(SWR.SWR_1828)
def test_partially_populated_state_does_not_raise() -> None:
    """Productive use: a run aborted mid-bootstrap has a half-built state object.
    Expected outcome: unreadable token/cost attributes degrade to null instead of
    taking down the very code path that reports the failure."""
    broken_state = SimpleNamespace(
        execution_status="failed",
        global_token_usage="not-a-snapshot",
        global_cost={"accumulated_cost": "nonsense"},
    )

    result = build_run_result(session_id="session-1", state=broken_state, progress=None)

    assert result.status is RunStatus.FAILED
    assert result.tokens is None
    assert result.cost is None


@verifies(SWR.SWR_1828)
def test_interrupt_flag_beats_a_completed_looking_progress_file() -> None:
    """Productive use: a user Ctrl-Cs a run whose tasks all happened to finish.
    Expected outcome: the run reports as interrupted with the conventional SIGINT
    exit code, never as a clean success."""
    progress = _progress(stop_reason="all tasks completed", completed=3, iterations=3)

    result = build_run_result(
        session_id="session-1",
        state=_state(),
        progress=progress,
        interrupted=True,
    )

    assert result.status is RunStatus.INTERRUPTED
    assert result.exit_code == 130
    assert "interrupt" in result.summary.lower()


@verifies(SWR.SWR_1828)
def test_explicit_error_beats_the_interrupt_flag() -> None:
    """Productive use: a crash during shutdown must not be reported as a user interrupt.
    Expected outcome: an explicit error produces the error status and carries the
    error text into the result."""
    result = build_run_result(
        session_id="session-1",
        state=_state(),
        progress=_progress(stop_reason="all tasks completed", completed=1, iterations=1),
        error="provider returned 500",
        interrupted=True,
    )

    assert result.status is RunStatus.ERROR
    assert result.exit_code == 1
    assert result.error == "provider returned 500"
    assert "provider returned 500" in result.summary


@verifies(SWR.SWR_1828)
def test_run_with_only_abandoned_tasks_reports_failure() -> None:
    """Productive use: a CI job must go red when every task of a run was abandoned.
    Expected outcome: the result carries the failed status, the failure summary and
    exit code 1."""
    progress = _progress(stop_reason="no pending tasks", completed=0, abandoned=2, iterations=2)

    result = build_run_result(session_id="session-1", state=_state(), progress=progress)

    assert result.status is RunStatus.FAILED
    assert result.exit_code == 1
    assert result.summary.startswith("Run failed")


@verifies(SWR.SWR_1828)
def test_iteration_limit_reports_its_own_status_and_exit_code() -> None:
    """Productive use: a scheduler distinguishes 'ran out of iterations' from 'finished'.
    Expected outcome: hitting the iteration cap reports max_iterations with exit code 2."""
    progress = _progress(stop_reason="iteration limit reached", completed=1, iterations=4)

    result = build_run_result(session_id="session-1", state=_state(), progress=progress)

    assert result.status is RunStatus.MAX_ITERATIONS
    assert result.exit_code == 2
    assert result.stop_reason == "iteration limit reached"


@pytest.mark.parametrize(
    "stop_reason",
    ["stopped by user", "interrupted by user", "user cancelled at message limit"],
)
@verifies(SWR.SWR_1828)
def test_user_stop_reasons_report_interrupted(stop_reason: str) -> None:
    """Productive use: an operator who stops a run does not get a green result.
    Expected outcome: every stop reason that means 'a human stopped this' maps to
    the interrupted status and the SIGINT exit code."""
    progress = _progress(stop_reason=stop_reason, completed=1, iterations=1)

    result = build_run_result(session_id="session-1", state=_state(), progress=progress)

    assert result.status is RunStatus.INTERRUPTED
    assert result.exit_code == 130


@verifies(SWR.SWR_1828)
def test_agent_session_abort_reports_failure_not_completion() -> None:
    """Productive use: a run aborted by a child escalation must not show up as green.
    Expected outcome: the abort stop reason reports failed with exit code 1 even
    though some tasks completed."""
    progress = _progress(
        stop_reason="agent session aborted",
        completed=1,
        abandoned=1,
        iterations=2,
    )

    result = build_run_result(session_id="session-1", state=_state(), progress=progress)

    assert result.status is RunStatus.FAILED
    assert result.exit_code == 1


@verifies(SWR.SWR_1828)
def test_report_reference_keeps_only_the_artifact_reference_keys() -> None:
    """Productive use: a consumer follows the final report of a run.
    Expected outcome: the reference carries exactly the four artifact-reference
    fields used elsewhere in the codebase, and extra artifact metadata is dropped."""
    result = build_run_result(
        session_id="session-1",
        state=_state(),
        progress=_progress(stop_reason="all tasks completed", completed=1, iterations=1),
        report={
            "id": "rep-9",
            "agent_name": "reviewer",
            "status": "succeeded",
            "path": "reports/9.md",
            "body": "a very long report body",
            "tokens": 4321,
        },
    )

    assert result.report is not None
    payload = result.model_dump(mode="json")["report"]
    assert set(payload) == set(REPORT_REF_KEYS)
    assert payload == {
        "id": "rep-9",
        "agent_name": "reviewer",
        "status": "succeeded",
        "path": "reports/9.md",
    }


@verifies(SWR.SWR_1828)
def test_partial_report_mapping_does_not_raise() -> None:
    """Productive use: an artifact recorded before its path was known still gets referenced.
    Expected outcome: missing reference keys become empty strings instead of an
    exception on the result path."""
    result = build_run_result(
        session_id="session-1",
        state=None,
        progress=None,
        report={"id": "rep-3"},
    )

    assert result.report == ReportRef(id="rep-3", agent_name="", status="", path="")


@verifies(SWR.SWR_1828, SWR.SWR_1829)
def test_result_survives_a_json_round_trip() -> None:
    """Productive use: a downstream tool parses the emitted JSON back into the model.
    Expected outcome: the serialized result validates back into an identical object,
    so the stream is a stable contract."""
    result = build_run_result(
        session_id="session-1",
        state=_state(
            tokens=TokenSnapshot(prompt_tokens=10, completion_tokens=5),
            cost=CostSnapshot(
                accumulated_cost=0.01,
                priced_calls=1,
                unpriced_calls=2,
                source=CostSource.MIXED,
            ),
        ),
        progress=_progress(stop_reason="iteration limit reached", completed=1, iterations=3),
        report={"id": "rep-1", "agent_name": "coder", "status": "succeeded", "path": "r.md"},
    )

    payload = result.model_dump(mode="json")

    assert payload["status"] == "max_iterations"
    assert RunResult.model_validate(payload) == result
