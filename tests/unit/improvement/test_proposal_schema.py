"""Tests for ``ImprovementProposal`` / ``ImprovementProposalArtifact`` schemas.

REQ-20260515-POSTRUN-IMPROVE-004,005,006,T003.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from rotaris_core.improvement.proposals import (
    ApprovalStatus,
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    RiskLevel,
    new_artifact_id,
    new_proposal_id,
    validate_artifact,
)
from rotaris_core.improvement.types import RunType
from rotaris_core.reqtocode import SWR, verifies


def _valid_evidence() -> ImprovementEvidence:
    return ImprovementEvidence(
        kind="transcript_observation",
        text="Agent failed to find pytest cache twice in a row.",
        source_session_id="sess",
        source_task_id=None,
        source_artifact_id=None,
        excerpt=None,
    )


@verifies(SWR.SWR_1602)
def test_new_proposal_id_returns_prefixed_base62() -> None:
    pid = new_proposal_id("seed")
    assert pid.startswith("imp_")
    assert len(pid) == len("imp_") + 8
    import time

    time.sleep(0.01)
    assert pid != new_proposal_id("seed")


@verifies(SWR.SWR_1602)
def test_new_artifact_id_returns_prefixed_base62() -> None:
    aid = new_artifact_id("seed")
    assert aid.startswith("impart_")
    assert len(aid) == len("impart_") + 8


@verifies(SWR.SWR_1602, SWR.SWR_1606)
def test_proposal_requires_at_least_one_evidence() -> None:
    with pytest.raises(ValidationError, match="evidence"):
        ImprovementProposal(
            id=new_proposal_id(),
            category=ImprovementProposalCategory.WORKSPACE_NOTE,
            summary="Should not be created",
            recommended_action="noop",
            evidence=[],
        )


@verifies(SWR.SWR_1602, SWR.SWR_1617)
def test_persona_memory_update_requires_target_persona() -> None:
    with pytest.raises(ValidationError, match="target_persona"):
        ImprovementProposal(
            id=new_proposal_id(),
            category=ImprovementProposalCategory.PERSONA_MEMORY_UPDATE,
            summary="Add note to persona memory",
            recommended_action="append guidance to persona memory",
            evidence=[_valid_evidence()],
        )


@verifies(SWR.SWR_1602, SWR.SWR_1617)
def test_persona_memory_update_accepts_target_persona() -> None:
    proposal = ImprovementProposal(
        id=new_proposal_id(),
        category=ImprovementProposalCategory.PERSONA_MEMORY_UPDATE,
        summary="Add note to persona memory",
        recommended_action="append guidance to persona memory",
        evidence=[_valid_evidence()],
        target_persona="orchestrator",
    )
    assert proposal.target_persona == "orchestrator"


@verifies(SWR.SWR_1602, SWR.SWR_1604)
def test_proposal_defaults_to_pending_review_and_low_risk() -> None:
    proposal = ImprovementProposal(
        id=new_proposal_id(),
        category=ImprovementProposalCategory.WORKSPACE_NOTE,
        summary="Note observation",
        recommended_action="add to AGENTS.md",
        evidence=[_valid_evidence()],
    )
    assert proposal.status == ApprovalStatus.PENDING_REVIEW
    assert proposal.risk == RiskLevel.LOW


@verifies(SWR.SWR_1602, SWR.SWR_1604)
def test_artifact_round_trips_through_json() -> None:
    proposal = ImprovementProposal(
        id=new_proposal_id(),
        category=ImprovementProposalCategory.DOCUMENTATION_UPDATE,
        summary="Document the foo workflow",
        recommended_action="add a section to docs/foo.md",
        evidence=[_valid_evidence()],
    )
    artifact = ImprovementProposalArtifact(
        artifact_id=new_artifact_id(),
        source_session_id="sess",
        source_run_type=RunType.TASK_RUN,
        proposals=[proposal],
        notes=None,
    )
    payload = json.loads(artifact.model_dump_json())
    reloaded = ImprovementProposalArtifact.model_validate(payload)
    assert reloaded.artifact_id == artifact.artifact_id
    assert reloaded.source_session_id == "sess"
    assert reloaded.proposals[0].summary == proposal.summary


@verifies(SWR.SWR_1602, SWR.SWR_1606)
def test_validate_artifact_rejects_proposal_without_evidence() -> None:
    bad_payload = {
        "artifact_id": new_artifact_id(),
        "source_session_id": "sess",
        "source_run_type": "task_run",
        "proposals": [
            {
                "id": new_proposal_id(),
                "category": "workspace_note",
                "summary": "no evidence here",
                "recommended_action": "noop",
                "evidence": [],
            },
        ],
    }
    with pytest.raises(ValueError, match="malformed improvement artifact"):
        validate_artifact(bad_payload)


@verifies(SWR.SWR_1602)
def test_validate_artifact_accepts_empty_proposals() -> None:
    payload = {
        "artifact_id": new_artifact_id(),
        "source_session_id": "sess",
        "source_run_type": "task_run",
        "proposals": [],
        "notes": "no actionable signals",
    }
    # Should not raise.
    validate_artifact(payload)


@verifies(SWR.SWR_1602)
def test_artifact_accepts_legacy_session_id_alias() -> None:
    payload = {
        "artifact_id": new_artifact_id(),
        "session_id": "legacy-sess",
        "source_run_type": "task_run",
        "considered_session_ids": ["older-1", "older-2"],
        "proposals": [],
    }
    artifact = ImprovementProposalArtifact.model_validate(payload)
    assert artifact.source_session_id == "legacy-sess"
    assert artifact.considered_session_ids == ["older-1", "older-2"]
