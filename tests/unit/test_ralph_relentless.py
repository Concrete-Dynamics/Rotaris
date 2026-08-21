"""Tests for relentless mode (autonomous-completion) in the Ralph loop."""

from __future__ import annotations

import datetime as dt

import pytest

from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.ralph.fulfillment_validator import (
    FulfillmentResult,
    _parse_result,
)
from rotaris_core.ralph.loop import RalphLoop
from rotaris_core.ralph.state import (
    RalphIterationOutcome,
    RalphIterationState,
    RalphProgressFile,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask


class _StubValidator:
    def __init__(self, result: FulfillmentResult) -> None:
        self.result = result
        self.calls: list[tuple[str, list[str]]] = []

    async def validate(
        self,
        original_intent: str,
        iteration_summaries: list[str],
    ) -> FulfillmentResult:
        self.calls.append((original_intent, list(iteration_summaries)))
        return self.result


def _loop_with_relentless(max_cycles: int = 3) -> RalphLoop:
    config = RotarisConfig(runtime=RuntimePolicy(relentless=True, relentless_max_cycles=max_cycles))
    return RalphLoop(
        config=config,
        workspace_root="/tmp/test",
        summary_agent=lambda persona: None,  # not used in these tests
    )


def _progress_with_one_completed_iteration() -> RalphProgressFile:
    return RalphProgressFile(
        session_id="s",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
        completed_tasks=1,
        iterations=[
            RalphIterationState(
                iteration_number=1,
                task_id="t1",
                task_name="initial work",
                started_at=dt.datetime.now(dt.UTC),
                ended_at=dt.datetime.now(dt.UTC),
                outcome=RalphIterationOutcome.COMPLETED,
                report_summary="Did initial work",
            ),
        ],
    )


@verifies(SWR.SWR_361)
def test_fulfillment_parser_fulfilled() -> None:
    result = _parse_result("FULFILLED\nAll deliverables present.")
    assert result.fulfilled is True
    assert result.gaps == []


@verifies(SWR.SWR_361)
def test_fulfillment_parser_unfulfilled_with_gaps() -> None:
    text = "UNFULFILLED\nMissing tests and docs.\n- Tests for new module\n- README update\n"
    result = _parse_result(text)
    assert result.fulfilled is False
    assert result.gaps == ["Tests for new module", "README update"]


@verifies(SWR.SWR_361)
def test_fulfillment_parser_caps_gaps_at_five() -> None:
    text = "UNFULFILLED\nMany gaps.\n" + "\n".join(f"- gap {i}" for i in range(10))
    result = _parse_result(text)
    assert result.fulfilled is False
    assert len(result.gaps) == 5


@verifies(SWR.SWR_361)
@pytest.mark.asyncio
async def test_relentless_check_appends_remediation_when_unfulfilled() -> None:
    loop = _loop_with_relentless()
    loop._fulfillment_validator = _StubValidator(
        FulfillmentResult(
            fulfilled=False,
            reason="Tests missing",
            gaps=["Add unit tests for foo", "Add docstring"],
        ),
    )
    progress = _progress_with_one_completed_iteration()
    todo = TodoList(phases=[TodoPhase(name="main", tasks=[TodoTask(name="initial")])])

    added = await loop._run_relentless_check(
        original_request="Build feature X with tests and docs",
        progress=progress,
        todo=todo,
    )

    assert added is True
    assert loop._relentless_cycles_used == 1
    # A remediation phase appended.
    assert len(todo.phases) == 2
    remediation_phase = todo.phases[-1]
    assert remediation_phase.name.startswith("Relentless Remediation")
    assert len(remediation_phase.tasks) == 1
    payload = remediation_phase.tasks[0].execution_payload
    assert "Add unit tests for foo" in payload
    assert "Add docstring" in payload
    assert progress.total_tasks == 2  # bumped


@verifies(SWR.SWR_361)
@pytest.mark.asyncio
async def test_relentless_check_returns_false_when_fulfilled() -> None:
    loop = _loop_with_relentless()
    loop._fulfillment_validator = _StubValidator(
        FulfillmentResult(fulfilled=True, reason="All done"),
    )
    progress = _progress_with_one_completed_iteration()
    todo = TodoList(phases=[TodoPhase(name="main", tasks=[TodoTask(name="initial")])])

    added = await loop._run_relentless_check(
        original_request="Build feature X",
        progress=progress,
        todo=todo,
    )

    assert added is False
    assert len(todo.phases) == 1  # no remediation appended
    assert loop._relentless_cycles_used == 1


@verifies(SWR.SWR_361)
@pytest.mark.asyncio
async def test_relentless_check_skipped_when_no_completed_iterations() -> None:
    loop = _loop_with_relentless()
    stub = _StubValidator(FulfillmentResult(fulfilled=False, reason="x", gaps=["y"]))
    loop._fulfillment_validator = stub
    progress = RalphProgressFile(
        session_id="s",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
        abandoned_tasks=1,
        iterations=[
            RalphIterationState(
                iteration_number=1,
                task_id="t1",
                task_name="failed work",
                started_at=dt.datetime.now(dt.UTC),
                ended_at=dt.datetime.now(dt.UTC),
                outcome=RalphIterationOutcome.ABANDONED,
                report_summary="error",
            ),
        ],
    )
    todo = TodoList(
        phases=[
            TodoPhase(
                name="main",
                tasks=[TodoTask(name="initial", status=TaskStatus.ABANDONED)],
            ),
        ],
    )

    added = await loop._run_relentless_check(
        original_request="Build feature X",
        progress=progress,
        todo=todo,
    )

    # No completed iterations to audit -> validator never called, no remediation.
    assert added is False
    assert stub.calls == []
    assert len(todo.phases) == 1


@verifies(SWR.SWR_361)
def test_relentless_disabled_returns_no_validator() -> None:
    config = RotarisConfig(runtime=RuntimePolicy(relentless=False))
    loop = RalphLoop(
        config=config,
        workspace_root="/tmp/test",
        summary_agent=lambda persona: None,
    )

    assert loop._get_fulfillment_validator() is None


@verifies(SWR.SWR_361, SWR.SWR_362)
def test_runtime_policy_exposes_relentless_fields() -> None:
    policy = RuntimePolicy(relentless=True, relentless_max_cycles=5)
    assert policy.relentless is True
    assert policy.relentless_max_cycles == 5

    # default values
    default = RuntimePolicy()
    assert default.relentless is False
    assert default.relentless_max_cycles == 3
