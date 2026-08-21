"""Integration tests for the post-run improvement approval flow.

Covers:
* REQ-20260515-POSTRUN-IMPROVE-T007 — end-to-end approval flow: a completed
  ``task_run`` produces a collector artifact, the user approves a proposal,
  and an ``improvement_run`` is started with only the approved proposals.
* REQ-20260515-POSTRUN-IMPROVE-T013 — persona-memory approval flow: an
  approved ``persona_memory_update`` proposal results in a workspace-local
  persona memory file being written, which a subsequent persona-load reads
  back into agent context.

These tests stitch together the real ``RalphLoop`` post-run pass, the on-disk
artifact persistence, the approval API, and the Improver todo builder. The
collector LLM is stubbed (no network), and the Improver execution is
simulated by directly writing the approved persona-memory file the way the
Improver agent's edit tools would — this exercises every glue point between
the collector pipeline, approval state, and persona memory injection
without requiring a live model.
"""

from __future__ import annotations

import asyncio
import datetime as dt
from typing import TYPE_CHECKING, Any

from rotaris_core.agents.persona_memory import (
    load_persona_memory,
    persona_memory_path,
    write_persona_memory,
)
from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
from rotaris_core.improvement.approval import (
    approved_proposals,
    set_proposal_status,
)
from rotaris_core.improvement.improver import (
    build_improver_todo,
    prepare_improvement_run,
)
from rotaris_core.improvement.persistence import (
    list_improvement_artifacts,
    load_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    ApprovalStatus,
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

if TYPE_CHECKING:
    from pathlib import Path


class _ScriptedCollector:
    """Stub collector that emits a predetermined proposal set."""

    def __init__(self, proposals: list[ImprovementProposal]) -> None:
        self._proposals = proposals
        self.calls = 0

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
        del gate_evidence
        self.calls += 1
        return ImprovementProposalArtifact(
            artifact_id=new_artifact_id(session_id),
            source_session_id=session_id,
            source_run_type=run_type,
            collector_model="stub/cheap",
            considered_session_ids=[
                artifact.source_session_id for artifact in (workspace_history or [])
            ],
            proposals=list(self._proposals),
        )


def _build_loop(
    workspace: Path,
    session_id: str,
    *,
    collector: _ScriptedCollector,
    run_type: RunType = RunType.TASK_RUN,
) -> RalphLoop:
    session_dir = workspace / session_id
    conversations = session_dir / "conversations"
    conversations.mkdir(parents=True)
    return RalphLoop(
        config=RotarisConfig(
            runtime=RuntimePolicy(
                child_timeout=5,
                improvement_collector_enabled=True,
            ),
        ),
        workspace_root=str(workspace),
        summary_agent=None,  # type: ignore[arg-type]
        conversation_persistence_dir=conversations,
        run_type=run_type,
        improvement_collector_factory=lambda: collector,
    )


def _terminal_progress(session_id: str) -> RalphProgressFile:
    return RalphProgressFile(
        session_id=session_id,
        started_at=dt.datetime.now(dt.UTC),
        total_tasks=1,
        stop_reason="all tasks completed",
    )


def _completed_todo() -> TodoList:
    return TodoList(
        phases=[
            TodoPhase(
                name="user task",
                tasks=[
                    TodoTask(
                        name="t",
                        description="d",
                        status=TaskStatus.COMPLETED,
                    ),
                ],
            ),
        ],
    )


@verifies(SWR.SWR_1602, SWR.SWR_1626)
def test_end_to_end_approval_flow_starts_improvement_run(tmp_path: Path) -> None:
    """REQ-T007: task_run → artifact → approve → improvement_run with only approved."""
    session_id = "session-e2e"
    p_doc = ImprovementProposal(
        id=new_proposal_id("doc"),
        category=ImprovementProposalCategory.DOCUMENTATION_UPDATE,
        summary="add missing usage section",
        recommended_action="extend README usage",
        evidence=[
            ImprovementEvidence(
                kind="transcript_observation",
                text="user asked twice about CLI usage",
            ),
        ],
    )
    p_dep = ImprovementProposal(
        id=new_proposal_id("dep"),
        category=ImprovementProposalCategory.DEPENDENCY_INSTALL,
        summary="install httpx",
        recommended_action="add httpx to dependencies",
        evidence=[
            ImprovementEvidence(
                kind="tool_failure",
                text="fetch tool unavailable",
            ),
        ],
    )
    collector = _ScriptedCollector([p_doc, p_dep])
    loop = _build_loop(tmp_path, session_id, collector=collector)

    # 1. Completed task_run triggers exactly one collector pass.
    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id=session_id,
            progress=_terminal_progress(session_id),
            todo=_completed_todo(),
        ),
    )
    assert collector.calls == 1
    artifact_id = loop.last_improvement_artifact_id
    assert artifact_id is not None

    artifact = load_improvement_artifact(tmp_path, artifact_id)
    assert {p.status for p in artifact.proposals} == {
        ApprovalStatus.PENDING_REVIEW,
    }

    # 2. User approves only the documentation proposal; rejects the dep install.
    set_proposal_status(
        tmp_path,
        artifact_id,
        p_doc.id,
        ApprovalStatus.APPROVED,
    )
    set_proposal_status(
        tmp_path,
        artifact_id,
        p_dep.id,
        ApprovalStatus.REJECTED,
    )

    # State survives reload.
    reloaded = load_improvement_artifact(tmp_path, artifact_id)
    by_id = {p.id: p for p in reloaded.proposals}
    assert by_id[p_doc.id].status == ApprovalStatus.APPROVED
    assert by_id[p_dep.id].status == ApprovalStatus.REJECTED

    # 3. Prepare improvement_run — only the approved proposal flows through.
    _, approved, improver_todo = prepare_improvement_run(
        tmp_path,
        artifact_id,
    )
    assert [p.id for p in approved] == [p_doc.id]
    assert len(improver_todo.phases) == 1
    assert len(improver_todo.phases[0].tasks) == 1
    payload = improver_todo.phases[0].tasks[0].execution_payload
    assert p_doc.id in payload
    assert "dependency_install" not in payload  # rejected proposal not leaked.

    # 4. An improvement_run-classified RalphLoop does NOT recurse into another
    #    collector pass (REQ-011).
    improvement_loop = _build_loop(
        tmp_path,
        "session-improvement",
        collector=_ScriptedCollector([p_doc]),
        run_type=RunType.IMPROVEMENT_RUN,
    )
    asyncio.run(
        improvement_loop._run_post_run_improvement_pass(
            session_id="session-improvement",
            progress=_terminal_progress("session-improvement"),
            todo=_completed_todo(),
        ),
    )
    assert improvement_loop.last_improvement_artifact_id is None


@verifies(SWR.SWR_1602, SWR.SWR_1618, SWR.SWR_1632)
def test_persona_memory_approval_flow_writes_only_target_persona(tmp_path: Path) -> None:
    """REQ-T013: approved persona_memory_update updates only the target persona."""
    session_id = "session-pm"
    persona_target = "tester"
    p_pm = ImprovementProposal(
        id=new_proposal_id("pm"),
        category=ImprovementProposalCategory.PERSONA_MEMORY_UPDATE,
        summary="record PYTHONPATH=src test invocation quirk",
        recommended_action="add a persona memory note for the tester persona",
        target_persona=persona_target,
        evidence=[
            ImprovementEvidence(
                kind="tool_failure",
                text="pytest imported preinstalled rotaris_core instead of working tree",
            ),
        ],
    )
    collector = _ScriptedCollector([p_pm])
    loop = _build_loop(tmp_path, session_id, collector=collector)

    asyncio.run(
        loop._run_post_run_improvement_pass(
            session_id=session_id,
            progress=_terminal_progress(session_id),
            todo=_completed_todo(),
        ),
    )
    artifact_id = loop.last_improvement_artifact_id
    assert artifact_id is not None
    # No persona memory exists yet — task_run must NOT have written anything
    # (REQ-018: persona memory mutation is approval-gated only).
    assert load_persona_memory(tmp_path, persona_target) is None
    assert load_persona_memory(tmp_path, "worker") is None

    # User approves the persona memory proposal.
    set_proposal_status(
        tmp_path,
        artifact_id,
        p_pm.id,
        ApprovalStatus.APPROVED,
    )

    artifact = load_improvement_artifact(tmp_path, artifact_id)
    approved = approved_proposals(artifact)
    assert len(approved) == 1
    todo = build_improver_todo(approved)
    task_payload = todo.phases[0].tasks[0].execution_payload
    # Improver knows where to write.
    assert f".rotaris/persona_memory/{persona_target}.md" in task_payload

    # Simulate the Improver agent's file edit: write the persona memory file
    # using the same workspace-local API the agent's tools would target.
    memory_text = (
        "Run pytest with PYTHONPATH=src to avoid importing the installed "
        "rotaris_core package instead of the working tree.\n"
    )
    written_path = write_persona_memory(tmp_path, persona_target, memory_text)
    assert written_path == persona_memory_path(tmp_path, persona_target)

    # Subsequent persona-load picks up the new memory — only for the target.
    assert load_persona_memory(tmp_path, persona_target) == memory_text
    assert load_persona_memory(tmp_path, "worker") is None
    assert load_persona_memory(tmp_path, "coder") is None


@verifies(SWR.SWR_1602, SWR.SWR_1613)
def test_second_task_run_sees_prior_workspace_artifact_history(tmp_path: Path) -> None:
    first = ImprovementProposal(
        id=new_proposal_id("first"),
        category=ImprovementProposalCategory.WORKSPACE_NOTE,
        summary="record first issue",
        recommended_action="add first note",
        evidence=[ImprovementEvidence(kind="transcript_observation", text="first evidence")],
    )
    second = ImprovementProposal(
        id=new_proposal_id("second"),
        category=ImprovementProposalCategory.WORKSPACE_NOTE,
        summary="record second issue",
        recommended_action="add second note",
        evidence=[ImprovementEvidence(kind="transcript_observation", text="second evidence")],
    )

    first_collector = _ScriptedCollector([first])
    first_loop = _build_loop(tmp_path, "session-1", collector=first_collector)
    asyncio.run(
        first_loop._run_post_run_improvement_pass(
            session_id="session-1",
            progress=_terminal_progress("session-1"),
            todo=_completed_todo(),
        ),
    )

    second_collector = _ScriptedCollector([second])
    second_loop = _build_loop(tmp_path, "session-2", collector=second_collector)
    asyncio.run(
        second_loop._run_post_run_improvement_pass(
            session_id="session-2",
            progress=_terminal_progress("session-2"),
            todo=_completed_todo(),
        ),
    )

    artifacts = list_improvement_artifacts(tmp_path)
    by_session = {artifact.source_session_id: artifact for artifact in artifacts}
    assert set(by_session) >= {"session-1", "session-2"}
    assert by_session["session-2"].considered_session_ids == ["session-1"]
