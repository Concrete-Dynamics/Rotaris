from __future__ import annotations

import datetime as dt
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field

from rotaris_core.llm_errors import summarize_failure_detail
from rotaris_core.reqtocode import SWR, traces

DateTime = dt.datetime


class RalphIterationOutcome(StrEnum):
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    PENDING = "pending"


@traces(SWR.SWR_118, SWR.SWR_119, SWR.SWR_167)
class RalphIterationState(BaseModel):
    iteration_number: int
    task_id: str
    task_name: str
    started_at: DateTime
    ended_at: DateTime | None = None
    outcome: RalphIterationOutcome | None = None
    commit_sha: str | None = None
    report_summary: str | None = None
    agent_response: str | None = None
    token_usage: dict[str, Any] | None = None
    # Root persona that produced this persisted iteration.  ``None`` preserves
    # pre-attribution snapshots and deliberately makes them ineligible for
    # historical classifier context (SWR-167).
    persona: str | None = None


@traces(SWR.SWR_118, SWR.SWR_119, SWR.SWR_167)
class RalphProgressFile(BaseModel):
    session_id: str
    started_at: DateTime
    iterations: list[RalphIterationState] = Field(default_factory=list)
    total_tasks: int = 0
    completed_tasks: int = 0
    abandoned_tasks: int = 0
    stop_reason: str | None = None


def summarize_run_progress(
    progress: RalphProgressFile,
) -> tuple[str, str, Literal["information", "warning", "error"]]:
    if progress.stop_reason == "stopped by user":
        return ("paused", "Run paused: interrupted by user.", "warning")

    if progress.abandoned_tasks == 0:
        return ("completed", "Run completed.", "information")

    if progress.completed_tasks == 0:
        latest_failure = next(
            (
                summarize_failure_detail(iteration.report_summary)
                for iteration in reversed(progress.iterations)
                if iteration.outcome == RalphIterationOutcome.ABANDONED
            ),
            None,
        )
        if latest_failure is not None:
            return ("failed", f"Run failed: {latest_failure}", "error")
        return (
            "failed",
            f"Run failed: {progress.abandoned_tasks} task(s) abandoned.",
            "error",
        )

    return (
        "completed",
        (
            "Run completed with failures: "
            f"{progress.completed_tasks} completed, {progress.abandoned_tasks} abandoned."
        ),
        "warning",
    )
