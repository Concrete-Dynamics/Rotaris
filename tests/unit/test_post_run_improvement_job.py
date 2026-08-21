"""Focused lifecycle coverage for captured post-run improvement analysis."""

from __future__ import annotations

import asyncio
import datetime as dt
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

from rotaris_core.improvement.persistence import save_improvement_artifact
from rotaris_core.improvement.proposals import ImprovementProposalArtifact, new_artifact_id
from rotaris_core.improvement.types import RunType
from rotaris_core.ralph.loop import PostRunImprovementJob, PostRunImprovementResult, RalphLoop
from rotaris_core.ralph.state import RalphProgressFile
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList


class _Collector:
    def __init__(self, *, wait: asyncio.Event | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.started = asyncio.Event()
        self._wait = wait

    async def generate_artifact(self, **kwargs: Any) -> ImprovementProposalArtifact:
        self.calls.append(kwargs)
        self.started.set()
        if self._wait is not None:
            await self._wait.wait()
        return ImprovementProposalArtifact(
            artifact_id=new_artifact_id(kwargs["session_id"]),
            source_session_id=kwargs["session_id"],
            source_run_type=RunType.TASK_RUN,
            collector_model="test/collector",
            proposals=[],
        )


def _job(tmp_path, collector: _Collector) -> PostRunImprovementJob:
    return PostRunImprovementJob(
        collector_factory=lambda: collector,
        workspace_root=tmp_path,
        session_id="terminal-session",
        run_type=RunType.TASK_RUN,
        progress=RalphProgressFile(
            session_id="terminal-session",
            started_at=dt.datetime.now(dt.UTC),
            total_tasks=1,
            stop_reason="all tasks completed",
        ),
        todo=TodoList(),
        transcript_events=[{"role": "agent", "content": "terminal evidence"}],
        child_reports=[{"summary": "completed"}],
        workspace_history=[],
    )


@verifies(SWR.SWR_1639, SWR.SWR_1621)
def test_ralph_run_returns_before_optional_analysis_starts() -> None:
    """Productive use: a completed task becomes available immediately.
    Expected outcome: RalphLoop returns terminal progress without awaiting the
    separately captured improvement-analysis lifecycle."""
    progress = RalphProgressFile(
        session_id="terminal-session",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
        stop_reason="all tasks completed",
    )
    loop = RalphLoop.__new__(RalphLoop)
    loop._run_main_loop = AsyncMock(return_value=progress)

    result = asyncio.run(
        loop.run(
            todo=TodoList(),
            agent_factory=lambda _persona: object(),
            session_id="terminal-session",
        )
    )

    assert result is progress
    loop._run_main_loop.assert_awaited_once()


@verifies(SWR.SWR_1639, SWR.SWR_1620)
def test_post_run_job_persists_one_terminal_artifact(tmp_path) -> None:
    """Productive use: a completed task run can be reviewed for improvements.
    Expected outcome: the captured job persists its source-session artifact and reports it."""
    collector = _Collector()

    result = asyncio.run(_job(tmp_path, collector).run())

    assert result.cancelled is False
    assert result.artifact_id is not None
    assert result.proposal_count == 0
    assert collector.calls[0]["transcript_events"] == [
        {"role": "agent", "content": "terminal evidence"},
    ]
    assert (tmp_path / ".rotaris" / "improvement_artifacts" / f"{result.artifact_id}.json").exists()


@verifies(SWR.SWR_1639)
def test_post_run_job_cancellation_suppresses_artifact_persistence(tmp_path) -> None:
    """Productive use: a user can close an optional analysis safely.
    Expected outcome: cancellation returns a cancellation outcome and writes no artifact."""

    async def cancel_job() -> PostRunImprovementResult:
        collector = _Collector(wait=asyncio.Event())
        job = _job(tmp_path, collector)
        task = asyncio.create_task(job.run())
        await collector.started.wait()
        job.request_cancel()
        task.cancel()
        return await task

    result = asyncio.run(cancel_job())

    assert result.cancelled is True
    artifact_dir = tmp_path / ".rotaris" / "improvement_artifacts"
    assert not artifact_dir.exists() or list(artifact_dir.iterdir()) == []


def _loop_for_capture(tmp_path, run_type: RunType) -> RalphLoop:
    """A RalphLoop carrying only what ``capture_post_run_improvement_job`` reads."""
    loop = RalphLoop.__new__(RalphLoop)
    loop.run_type = run_type
    loop._improvement_collector_factory = _Collector
    loop._improvement_context_provider = None
    loop._session_dir = tmp_path / "session"
    loop._metadata_workspace_root_path = tmp_path
    loop.artifact_store = SimpleNamespace(list=lambda: [])
    loop.config = SimpleNamespace(runtime=SimpleNamespace(improvement_collector_enabled=True))
    return loop


@verifies(SWR.SWR_1611, SWR.SWR_1625)
def test_an_improvement_run_captures_no_further_improvement_job(tmp_path) -> None:
    """Productive use: reviewing approved improvements must not breed more reviews.
    Expected outcome: an `improvement_run` captures no collector job, while an
    otherwise identical `task_run` does — so the run type is what gates it."""
    progress = RalphProgressFile(
        session_id="improvement-session",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
        stop_reason="all tasks completed",
    )

    improvement_job = _loop_for_capture(
        tmp_path, RunType.IMPROVEMENT_RUN
    ).capture_post_run_improvement_job(
        session_id="improvement-session",
        progress=progress,
        todo=TodoList(),
    )
    task_job = _loop_for_capture(tmp_path, RunType.TASK_RUN).capture_post_run_improvement_job(
        session_id="task-session",
        progress=progress,
        todo=TodoList(),
    )

    assert improvement_job is None
    assert task_job is not None


@verifies(SWR.SWR_1611)
def test_improvement_run_artifacts_are_excluded_from_collector_history(tmp_path) -> None:
    """Productive use: a later task run learns from prior task runs, not from the
    collector's own output.
    Expected outcome: only `task_run` artifacts reach the collector as history."""
    for session_id, run_type in (
        ("earlier-task", RunType.TASK_RUN),
        ("earlier-improvement", RunType.IMPROVEMENT_RUN),
    ):
        save_improvement_artifact(
            tmp_path,
            ImprovementProposalArtifact(
                artifact_id=new_artifact_id(session_id),
                source_session_id=session_id,
                source_run_type=run_type,
                collector_model="test/collector",
                proposals=[],
            ),
        )

    history = _loop_for_capture(
        tmp_path, RunType.TASK_RUN
    )._collect_workspace_history_for_collector(
        source_session_id="current-task",
    )

    assert [artifact.source_session_id for artifact in history] == ["earlier-task"]
