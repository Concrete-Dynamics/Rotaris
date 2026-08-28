"""Approval workflow tests (REQ-20260515-POSTRUN-IMPROVE-008, T004)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.improvement.approval import (
    approved_proposals,
    delete_proposal,
    set_proposal_status,
    update_proposal,
)
from rotaris_core.improvement.persistence import (
    load_improvement_artifact,
    save_improvement_artifact,
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
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


def _make_proposal(seed: str = "p") -> ImprovementProposal:
    return ImprovementProposal(
        id=new_proposal_id(seed),
        category=ImprovementProposalCategory.WORKSPACE_NOTE,
        summary="example summary",
        recommended_action="example action",
        evidence=[ImprovementEvidence(kind="transcript_observation", text="ev")],
    )


def _make_artifact(*proposals: ImprovementProposal) -> ImprovementProposalArtifact:
    return ImprovementProposalArtifact(
        artifact_id=new_artifact_id("a"),
        source_session_id="sess-1",
        proposals=list(proposals),
    )


@verifies(SWR.SWR_1602)
def test_set_proposal_status_updates_single_proposal(tmp_path: Path) -> None:
    p1 = _make_proposal("a")
    p2 = _make_proposal("b")
    artifact = _make_artifact(p1, p2)
    save_improvement_artifact(tmp_path, artifact)

    updated = set_proposal_status(
        tmp_path,
        artifact.artifact_id,
        p1.id,
        ApprovalStatus.APPROVED,
    )

    by_id = {p.id: p for p in updated.proposals}
    assert by_id[p1.id].status == ApprovalStatus.APPROVED
    assert by_id[p2.id].status == ApprovalStatus.PENDING_REVIEW


@verifies(SWR.SWR_1602, SWR.SWR_1608)
def test_set_proposal_status_persists_across_reload(tmp_path: Path) -> None:
    p = _make_proposal("x")
    artifact = _make_artifact(p)
    save_improvement_artifact(tmp_path, artifact)

    set_proposal_status(
        tmp_path,
        artifact.artifact_id,
        p.id,
        ApprovalStatus.APPROVED,
    )

    reloaded = load_improvement_artifact(tmp_path, artifact.artifact_id)
    assert reloaded.proposals[0].status == ApprovalStatus.APPROVED


@verifies(SWR.SWR_1602)
def test_set_proposal_status_handles_reject_and_defer(tmp_path: Path) -> None:
    p = _make_proposal("y")
    artifact = _make_artifact(p)
    save_improvement_artifact(tmp_path, artifact)

    set_proposal_status(tmp_path, artifact.artifact_id, p.id, ApprovalStatus.REJECTED)
    assert (
        load_improvement_artifact(
            tmp_path,
            artifact.artifact_id,
        )
        .proposals[0]
        .status
        == ApprovalStatus.REJECTED
    )

    set_proposal_status(tmp_path, artifact.artifact_id, p.id, ApprovalStatus.DEFERRED)
    assert (
        load_improvement_artifact(
            tmp_path,
            artifact.artifact_id,
        )
        .proposals[0]
        .status
        == ApprovalStatus.DEFERRED
    )


@verifies(SWR.SWR_1602)
def test_set_proposal_status_unknown_proposal_raises(tmp_path: Path) -> None:
    p = _make_proposal("z")
    artifact = _make_artifact(p)
    save_improvement_artifact(tmp_path, artifact)

    with pytest.raises(KeyError):
        set_proposal_status(
            tmp_path,
            artifact.artifact_id,
            "imp_nonexistent",
            ApprovalStatus.APPROVED,
        )


@verifies(SWR.SWR_1602, SWR.SWR_1608)
def test_approved_proposals_filters_by_status() -> None:
    p1 = _make_proposal("a")
    p2 = _make_proposal("b").model_copy(update={"status": ApprovalStatus.APPROVED})
    p3 = _make_proposal("c").model_copy(update={"status": ApprovalStatus.REJECTED})
    artifact = _make_artifact(p1, p2, p3)

    result = approved_proposals(artifact)

    assert [p.id for p in result] == [p2.id]


@verifies(SWR.SWR_2123)
def test_update_proposal_edits_summary_and_action_and_persists(tmp_path: Path) -> None:
    p1 = _make_proposal("a")
    p2 = _make_proposal("b")
    artifact = _make_artifact(p1, p2)
    save_improvement_artifact(tmp_path, artifact)

    updated = update_proposal(
        tmp_path,
        artifact.artifact_id,
        p1.id,
        summary="revised summary",
        recommended_action="revised action",
    )

    by_id = {p.id: p for p in updated.proposals}
    assert by_id[p1.id].summary == "revised summary"
    assert by_id[p1.id].recommended_action == "revised action"
    assert by_id[p2.id].summary == p2.summary

    reloaded = load_improvement_artifact(tmp_path, artifact.artifact_id)
    reloaded_by_id = {p.id: p for p in reloaded.proposals}
    assert reloaded_by_id[p1.id].summary == "revised summary"


@verifies(SWR.SWR_2123)
def test_update_proposal_unknown_proposal_raises(tmp_path: Path) -> None:
    p = _make_proposal("z")
    artifact = _make_artifact(p)
    save_improvement_artifact(tmp_path, artifact)

    with pytest.raises(KeyError):
        update_proposal(
            tmp_path,
            artifact.artifact_id,
            "imp_nonexistent",
            summary="x",
            recommended_action="y",
        )


@verifies(SWR.SWR_2123)
def test_update_proposal_blank_summary_raises(tmp_path: Path) -> None:
    p = _make_proposal("blank")
    artifact = _make_artifact(p)
    save_improvement_artifact(tmp_path, artifact)

    with pytest.raises(ValueError, match="summary"):
        update_proposal(
            tmp_path,
            artifact.artifact_id,
            p.id,
            summary="",
            recommended_action="revised action",
        )


@verifies(SWR.SWR_2123)
def test_delete_proposal_removes_only_target_and_persists(tmp_path: Path) -> None:
    p1 = _make_proposal("a")
    p2 = _make_proposal("b")
    artifact = _make_artifact(p1, p2)
    save_improvement_artifact(tmp_path, artifact)

    updated = delete_proposal(tmp_path, artifact.artifact_id, p1.id)

    assert [p.id for p in updated.proposals] == [p2.id]
    reloaded = load_improvement_artifact(tmp_path, artifact.artifact_id)
    assert [p.id for p in reloaded.proposals] == [p2.id]


@verifies(SWR.SWR_2123)
def test_delete_proposal_unknown_proposal_raises(tmp_path: Path) -> None:
    p = _make_proposal("z")
    artifact = _make_artifact(p)
    save_improvement_artifact(tmp_path, artifact)

    with pytest.raises(KeyError):
        delete_proposal(tmp_path, artifact.artifact_id, "imp_nonexistent")
