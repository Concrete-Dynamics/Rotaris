"""Improver executor tests (REQ-20260515-POSTRUN-IMPROVE-009, 010, 011, T005, T006)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.improvement.approval import set_proposal_status
from rotaris_core.improvement.improver import (
    IMPROVER_SYSTEM_PROMPT,
    build_improver_todo,
    prepare_improvement_run,
)
from rotaris_core.improvement.persistence import save_improvement_artifact
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
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TaskStatus

if TYPE_CHECKING:
    from pathlib import Path


def _proposal(
    seed: str,
    *,
    status: ApprovalStatus = ApprovalStatus.PENDING_REVIEW,
    category: ImprovementProposalCategory = ImprovementProposalCategory.WORKSPACE_NOTE,
    target_persona: str | None = None,
) -> ImprovementProposal:
    return ImprovementProposal(
        id=new_proposal_id(seed),
        category=category,
        summary=f"summary {seed}",
        recommended_action=f"action {seed}",
        status=status,
        target_persona=target_persona,
        evidence=[ImprovementEvidence(kind="transcript_observation", text="ev")],
    )


@verifies(SWR.SWR_1602, SWR.SWR_1609, SWR.SWR_1610)
def test_improver_system_prompt_forbids_reopening_user_task() -> None:
    assert "do NOT resume" in IMPROVER_SYSTEM_PROMPT.lower() or "not resume" in (
        IMPROVER_SYSTEM_PROMPT.lower()
    )
    assert "improvement_run" in IMPROVER_SYSTEM_PROMPT


@verifies(SWR.SWR_1602, SWR.SWR_1609)
def test_build_improver_todo_emits_one_task_per_proposal() -> None:
    proposals = [_proposal("a"), _proposal("b")]
    todo = build_improver_todo(proposals)

    assert len(todo.phases) == 1
    phase = todo.phases[0]
    assert phase.name == "improvement_run"
    assert len(phase.tasks) == 2
    assert all(task.status == TaskStatus.PENDING for task in phase.tasks)


@verifies(SWR.SWR_1602)
def test_build_improver_todo_embeds_proposal_metadata() -> None:
    proposal = _proposal(
        "x",
        category=ImprovementProposalCategory.PERSONA_MEMORY_UPDATE,
        target_persona="tester",
    )
    todo = build_improver_todo([proposal])
    task = todo.phases[0].tasks[0]

    payload = task.execution_payload
    assert proposal.id in payload
    assert "persona_memory_update" in payload
    assert "tester" in payload
    assert "Evidence" in payload


@verifies(SWR.SWR_1602)
def test_persona_memory_update_task_includes_target_file_path() -> None:
    # The Improver must know which workspace-local file to edit.
    proposal = _proposal(
        "pm",
        category=ImprovementProposalCategory.PERSONA_MEMORY_UPDATE,
        target_persona="tester",
    )
    todo = build_improver_todo([proposal])
    payload = todo.phases[0].tasks[0].execution_payload
    assert ".rotaris/persona_memory/tester.md" in payload


@verifies(SWR.SWR_1602)
def test_build_improver_todo_rejects_empty_list() -> None:
    with pytest.raises(ValueError, match="at least one approved proposal"):
        build_improver_todo([])


@verifies(SWR.SWR_1602, SWR.SWR_1624)
def test_prepare_improvement_run_returns_only_approved(tmp_path: Path) -> None:
    approved = _proposal("a", status=ApprovalStatus.APPROVED)
    pending = _proposal("b")
    rejected = _proposal("c", status=ApprovalStatus.REJECTED)
    artifact = ImprovementProposalArtifact(
        artifact_id=new_artifact_id("art"),
        source_session_id="sess",
        proposals=[approved, pending, rejected],
    )
    save_improvement_artifact(tmp_path, artifact)

    loaded, approved_list, todo = prepare_improvement_run(
        tmp_path,
        artifact.artifact_id,
    )

    assert loaded.artifact_id == artifact.artifact_id
    assert [p.id for p in approved_list] == [approved.id]
    assert len(todo.phases[0].tasks) == 1


@verifies(SWR.SWR_1602, SWR.SWR_1624)
def test_prepare_improvement_run_raises_when_nothing_approved(tmp_path: Path) -> None:
    p = _proposal("a")
    artifact = ImprovementProposalArtifact(
        artifact_id=new_artifact_id("art"),
        source_session_id="sess",
        proposals=[p],
    )
    save_improvement_artifact(tmp_path, artifact)

    with pytest.raises(ValueError, match="approved proposal"):
        prepare_improvement_run(tmp_path, artifact.artifact_id)


@verifies(SWR.SWR_1602)
def test_prepare_improvement_run_picks_up_post_approval_state(tmp_path: Path) -> None:
    p = _proposal("a")
    artifact = ImprovementProposalArtifact(
        artifact_id=new_artifact_id("art"),
        source_session_id="sess",
        proposals=[p],
    )
    save_improvement_artifact(tmp_path, artifact)
    set_proposal_status(tmp_path, artifact.artifact_id, p.id, ApprovalStatus.APPROVED)

    _, approved_list, todo = prepare_improvement_run(tmp_path, artifact.artifact_id)

    assert [a.id for a in approved_list] == [p.id]
    assert len(todo.phases[0].tasks) == 1


@verifies(SWR.SWR_1602, SWR.SWR_1609)
def test_run_type_improvement_run_distinct_from_task_run() -> None:
    assert RunType.IMPROVEMENT_RUN.value == "improvement_run"
    assert RunType.TASK_RUN.value == "task_run"
    assert RunType.IMPROVEMENT_RUN != RunType.TASK_RUN
