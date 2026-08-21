"""Verifies :class:`RalphLoop` invokes the post-run improvement collector.

REQ-20260515-POSTRUN-IMPROVE-002,003,012.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.improvement.proposals import (
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    new_artifact_id,
    new_proposal_id,
)
from rotaris_core.improvement.types import RunType
from rotaris_core.ralph.loop import RalphLoop
from rotaris_core.ralph.state import RalphProgressFile
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask


class _StubCollector:
    """Records invocations and returns a canned artifact."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def generate_artifact(
        self,
        *,
        session_id: str,
        run_type: RunType,
        progress: Any,
        todo: Any,
        transcript_events: list[dict[str, Any]] | None = None,
        child_reports: list[dict[str, Any]] | None = None,
        workspace_history: list[ImprovementProposalArtifact] | None = None,
        gate_evidence: dict[str, Any] | None = None,
    ) -> ImprovementProposalArtifact:
        self.calls.append(
            {
                "session_id": session_id,
                "run_type": run_type,
                "transcript_events": transcript_events or [],
                "child_reports": child_reports or [],
                "workspace_history": workspace_history or [],
                "gate_evidence": gate_evidence or {},
            },
        )
        return ImprovementProposalArtifact(
            artifact_id=new_artifact_id(session_id),
            source_session_id=session_id,
            source_run_type=run_type,
            collector_model="stub/cheap",
            proposals=[
                ImprovementProposal(
                    id=new_proposal_id(session_id),
                    category=ImprovementProposalCategory.WORKSPACE_NOTE,
                    summary="stub proposal",
                    recommended_action="noop",
                    evidence=[
                        ImprovementEvidence(
                            kind="transcript_observation",
                            text="from stub",
                        ),
                    ],
                ),
            ],
        )


def _make_loop(
    tmp_path: Path,
    *,
    collector: _StubCollector | None,
    run_type: RunType = RunType.TASK_RUN,
    enabled: bool = True,
    context_provider: Any = None,
) -> RalphLoop:
    session_dir = tmp_path / "session-x"
    conversations_dir = session_dir / "conversations"
    conversations_dir.mkdir(parents=True)
    return RalphLoop(
        config=RotarisConfig(
            runtime=RuntimePolicy(
                child_timeout=5,
                improvement_collector_enabled=enabled,
            ),
        ),
        workspace_root=str(tmp_path),
        summary_agent=None,  # type: ignore[arg-type]
        conversation_persistence_dir=conversations_dir,
        run_type=run_type,
        improvement_collector_factory=(lambda: collector) if collector is not None else None,
        improvement_context_provider=context_provider,
    )


def _terminal_progress(stop_reason: str = "all tasks completed") -> RalphProgressFile:
    return RalphProgressFile(
        session_id="session-x",
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=0,
        stop_reason=stop_reason,
    )


def _todo() -> TodoList:
    return TodoList(
        phases=[
            TodoPhase(
                name="phase 1",
                tasks=[
                    TodoTask(
                        name="t1",
                        description="d",
                        status=TaskStatus.COMPLETED,
                    ),
                ],
            ),
        ],
    )


@verifies(SWR.SWR_1602)
def test_post_run_pass_invokes_collector_and_persists_artifact(tmp_path: Path) -> None:
    collector = _StubCollector()
    loop = _make_loop(tmp_path, collector=collector)
    progress = _terminal_progress()
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=progress,
            todo=_todo(),
        ),
    )
    assert len(collector.calls) == 1
    assert loop.last_improvement_artifact_id is not None
    artifact_file = (
        tmp_path
        / ".rotaris"
        / "improvement_artifacts"
        / f"{loop.last_improvement_artifact_id}.json"
    )
    assert artifact_file.exists()
    payload = json.loads(artifact_file.read_text(encoding="utf-8"))
    assert payload["source_session_id"] == "session-x"
    assert payload["proposals"][0]["summary"] == "stub proposal"


@verifies(SWR.SWR_1602)
def test_post_run_pass_skipped_when_disabled(tmp_path: Path) -> None:
    collector = _StubCollector()
    loop = _make_loop(tmp_path, collector=collector, enabled=False)
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(),
            todo=_todo(),
        ),
    )
    assert collector.calls == []
    assert loop.last_improvement_artifact_id is None


@verifies(SWR.SWR_1602)
def test_post_run_pass_skipped_when_factory_missing(tmp_path: Path) -> None:
    loop = _make_loop(tmp_path, collector=None)
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(),
            todo=_todo(),
        ),
    )
    assert loop.last_improvement_artifact_id is None


@verifies(SWR.SWR_1601)
def test_post_run_pass_skipped_for_improvement_run(tmp_path: Path) -> None:
    collector = _StubCollector()
    loop = _make_loop(tmp_path, collector=collector, run_type=RunType.IMPROVEMENT_RUN)
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(),
            todo=_todo(),
        ),
    )
    assert collector.calls == []


@verifies(SWR.SWR_1602)
@pytest.mark.parametrize(
    "stop_reason",
    ["stopped by user", "interrupted by user", "agent session aborted"],
)
def test_post_run_pass_skipped_when_user_aborted(tmp_path: Path, stop_reason: str) -> None:
    collector = _StubCollector()
    loop = _make_loop(tmp_path, collector=collector)
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(stop_reason=stop_reason),
            todo=_todo(),
        ),
    )
    assert collector.calls == []


@verifies(SWR.SWR_1602)
def test_post_run_pass_swallows_collector_exceptions(tmp_path: Path) -> None:
    class _BoomCollector:
        async def generate_artifact(self, **kwargs: Any) -> ImprovementProposalArtifact:
            raise RuntimeError("boom")

    loop = _make_loop(tmp_path, collector=_BoomCollector())  # type: ignore[arg-type]
    # Must not raise.
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(),
            todo=_todo(),
        ),
    )
    assert loop.last_improvement_artifact_id is None


@verifies(SWR.SWR_1602)
def test_context_provider_supplies_transcript_events(tmp_path: Path) -> None:
    collector = _StubCollector()
    events = [{"role": "assistant", "content": "x"}]
    loop = _make_loop(
        tmp_path,
        collector=collector,
        context_provider=lambda: {"transcript_events": events},
    )
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(),
            todo=_todo(),
        ),
    )
    assert collector.calls[0]["transcript_events"] == events


@verifies(SWR.SWR_1602)
def test_workspace_history_excludes_improvement_runs_and_current_session(tmp_path: Path) -> None:
    from rotaris_core.improvement.persistence import save_improvement_artifact

    collector = _StubCollector()
    save_improvement_artifact(
        tmp_path,
        ImprovementProposalArtifact(
            artifact_id=new_artifact_id("older-task"),
            source_session_id="older-task",
            source_run_type=RunType.TASK_RUN,
            proposals=[],
        ),
    )
    save_improvement_artifact(
        tmp_path,
        ImprovementProposalArtifact(
            artifact_id=new_artifact_id("older-impr"),
            source_session_id="older-impr",
            source_run_type=RunType.IMPROVEMENT_RUN,
            proposals=[],
        ),
    )
    save_improvement_artifact(
        tmp_path,
        ImprovementProposalArtifact(
            artifact_id=new_artifact_id("session-x"),
            source_session_id="session-x",
            source_run_type=RunType.TASK_RUN,
            proposals=[],
        ),
    )
    loop = _make_loop(tmp_path, collector=collector)

    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(),
            todo=_todo(),
        ),
    )

    history = collector.calls[0]["workspace_history"]
    assert [artifact.source_session_id for artifact in history] == ["older-task"]


@verifies(SWR.SWR_1602)
def test_workspace_history_is_bounded_to_five_prior_runs(tmp_path: Path) -> None:
    from rotaris_core.improvement.persistence import save_improvement_artifact

    collector = _StubCollector()
    for index in range(7):
        save_improvement_artifact(
            tmp_path,
            ImprovementProposalArtifact(
                artifact_id=new_artifact_id(f"older-{index}"),
                source_session_id=f"older-{index}",
                proposals=[],
            ),
        )
    loop = _make_loop(tmp_path, collector=collector)

    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id="session-x",
            progress=_terminal_progress(),
            todo=_todo(),
        ),
    )

    history = collector.calls[0]["workspace_history"]
    assert len(history) == 5
