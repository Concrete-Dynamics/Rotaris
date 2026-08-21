"""Versioned improvement artifact history (SWR-1640).

Every mutation of an artifact has to append a version rather than replace the
only copy, while the current state stays readable exactly as before.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.improvement.approval import (
    delete_proposal,
    set_proposal_status,
    update_proposal,
)
from rotaris_core.improvement.history import (
    ImprovementHistoryCause,
    artifact_history_dir,
    has_recorded_history,
    latest_artifact_version,
    list_artifact_versions,
    load_artifact_version,
    prune_artifact_history,
    record_artifact_version,
)
from rotaris_core.improvement.persistence import (
    improvement_artifact_dir,
    list_improvement_artifact_ids,
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


def _artifact(proposal_id: str | None = None) -> ImprovementProposalArtifact:
    return ImprovementProposalArtifact(
        artifact_id=new_artifact_id("history"),
        source_session_id="sess",
        proposals=[
            ImprovementProposal(
                id=proposal_id or new_proposal_id("p"),
                category=ImprovementProposalCategory.WORKSPACE_NOTE,
                summary="original summary",
                recommended_action="original action",
                evidence=[ImprovementEvidence(kind="transcript_observation", text="because")],
            ),
        ],
    )


@verifies(SWR.SWR_1640)
def test_first_save_records_a_collected_version(tmp_path: Path) -> None:
    artifact = _artifact()
    save_improvement_artifact(tmp_path, artifact)

    versions = list_artifact_versions(tmp_path, artifact.artifact_id)

    assert [entry.version for entry in versions] == [1]
    assert versions[0].cause is ImprovementHistoryCause.COLLECTED
    assert versions[0].artifact.artifact_id == artifact.artifact_id


@verifies(SWR.SWR_1640)
def test_approve_edit_reject_yields_four_versions_with_distinct_causes(tmp_path: Path) -> None:
    """The acceptance criterion: collected + one version per mutation."""
    proposal_id = new_proposal_id("lifecycle")
    artifact = _artifact(proposal_id)
    save_improvement_artifact(tmp_path, artifact)

    set_proposal_status(tmp_path, artifact.artifact_id, proposal_id, ApprovalStatus.APPROVED)
    update_proposal(
        tmp_path,
        artifact.artifact_id,
        proposal_id,
        summary="edited summary",
        recommended_action="edited action",
    )
    set_proposal_status(tmp_path, artifact.artifact_id, proposal_id, ApprovalStatus.REJECTED)

    versions = list_artifact_versions(tmp_path, artifact.artifact_id)

    assert [entry.version for entry in versions] == [4, 3, 2, 1]
    assert [entry.cause for entry in versions] == [
        ImprovementHistoryCause.STATUS_CHANGE,
        ImprovementHistoryCause.EDIT,
        ImprovementHistoryCause.STATUS_CHANGE,
        ImprovementHistoryCause.COLLECTED,
    ]
    # What the proposal said when it was approved is still retrievable.
    approved_state = load_artifact_version(tmp_path, artifact.artifact_id, 2)
    assert approved_state.artifact.proposals[0].status is ApprovalStatus.APPROVED
    assert approved_state.artifact.proposals[0].summary == "original summary"
    # ... and so is the edited text that was rejected.
    assert versions[0].artifact.proposals[0].summary == "edited summary"
    assert versions[0].artifact.proposals[0].status is ApprovalStatus.REJECTED
    # Every version carries its own timestamp.
    assert versions[0].recorded_at >= versions[-1].recorded_at


@verifies(SWR.SWR_1640)
def test_deleting_a_proposal_is_recorded_with_a_delete_cause(tmp_path: Path) -> None:
    proposal_id = new_proposal_id("doomed")
    artifact = _artifact(proposal_id)
    save_improvement_artifact(tmp_path, artifact)

    delete_proposal(tmp_path, artifact.artifact_id, proposal_id)

    newest = latest_artifact_version(tmp_path, artifact.artifact_id)
    assert newest is not None
    assert newest.cause is ImprovementHistoryCause.DELETE
    assert newest.artifact.proposals == []
    # The deleted proposal is still readable in the previous version.
    assert load_artifact_version(tmp_path, artifact.artifact_id, 1).artifact.proposals[0].id == (
        proposal_id
    )


@verifies(SWR.SWR_1640)
def test_current_state_read_is_unchanged_by_history(tmp_path: Path) -> None:
    """``load_improvement_artifact`` still returns the latest state, unchanged."""
    proposal_id = new_proposal_id("current")
    artifact = _artifact(proposal_id)
    save_improvement_artifact(tmp_path, artifact)
    set_proposal_status(tmp_path, artifact.artifact_id, proposal_id, ApprovalStatus.DEFERRED)

    loaded = load_improvement_artifact(tmp_path, artifact.artifact_id)

    assert loaded.proposals[0].status is ApprovalStatus.DEFERRED
    # History lives in a sub-directory and never shows up as an artifact id.
    assert list_improvement_artifact_ids(tmp_path) == [artifact.artifact_id]
    assert artifact_history_dir(tmp_path, artifact.artifact_id).is_dir()


@verifies(SWR.SWR_1640)
def test_legacy_artifact_loads_and_becomes_version_one(tmp_path: Path) -> None:
    """A file the previous implementation wrote reads back identically."""
    artifact = _artifact()
    target_dir = improvement_artifact_dir(tmp_path)
    target_dir.mkdir(parents=True)
    (target_dir / f"{artifact.artifact_id}.json").write_text(
        artifact.model_dump_json(indent=2),
        encoding="utf-8",
    )

    loaded = load_improvement_artifact(tmp_path, artifact.artifact_id)
    assert loaded.artifact_id == artifact.artifact_id
    assert loaded.proposals[0].summary == "original summary"

    # Migration is lazy: reading recorded nothing on disk...
    assert not has_recorded_history(tmp_path, artifact.artifact_id)
    assert not artifact_history_dir(tmp_path, artifact.artifact_id).exists()

    # ... but the history still reads as version 1 with an unknown cause.
    versions = list_artifact_versions(tmp_path, artifact.artifact_id)
    assert [entry.version for entry in versions] == [1]
    assert versions[0].cause is ImprovementHistoryCause.UNKNOWN


@verifies(SWR.SWR_1640)
def test_first_mutation_of_a_legacy_artifact_preserves_its_prior_state(tmp_path: Path) -> None:
    proposal_id = new_proposal_id("legacy")
    artifact = _artifact(proposal_id)
    target_dir = improvement_artifact_dir(tmp_path)
    target_dir.mkdir(parents=True)
    (target_dir / f"{artifact.artifact_id}.json").write_text(
        artifact.model_dump_json(indent=2),
        encoding="utf-8",
    )

    set_proposal_status(tmp_path, artifact.artifact_id, proposal_id, ApprovalStatus.APPROVED)

    versions = list_artifact_versions(tmp_path, artifact.artifact_id)
    assert [entry.version for entry in versions] == [2, 1]
    assert versions[1].cause is ImprovementHistoryCause.UNKNOWN
    assert versions[1].artifact.proposals[0].status is ApprovalStatus.PENDING_REVIEW
    assert versions[0].cause is ImprovementHistoryCause.STATUS_CHANGE
    assert versions[0].artifact.proposals[0].status is ApprovalStatus.APPROVED


@verifies(SWR.SWR_1640)
def test_retention_drops_the_oldest_but_keeps_the_collected_original(tmp_path: Path) -> None:
    proposal_id = new_proposal_id("retained")
    artifact = _artifact(proposal_id)
    save_improvement_artifact(tmp_path, artifact, history_retention=3)
    for index in range(4):
        save_improvement_artifact(
            tmp_path,
            artifact.model_copy(update={"notes": f"note {index}"}),
            cause=ImprovementHistoryCause.EDIT,
            history_retention=3,
        )

    versions = list_artifact_versions(tmp_path, artifact.artifact_id)

    assert [entry.version for entry in versions] == [5, 4, 1]
    # The initial collected state and the current state are the last to go.
    assert versions[-1].cause is ImprovementHistoryCause.COLLECTED
    assert versions[0].artifact.notes == "note 3"
    with pytest.raises(FileNotFoundError):
        load_artifact_version(tmp_path, artifact.artifact_id, 2)


@verifies(SWR.SWR_1640)
def test_retention_of_one_keeps_the_current_state_not_the_original(tmp_path: Path) -> None:
    """A single-entry history that contradicted the file on disk would be a lie."""
    artifact = _artifact()
    save_improvement_artifact(tmp_path, artifact, history_retention=1)
    save_improvement_artifact(
        tmp_path,
        artifact.model_copy(update={"notes": "current"}),
        cause=ImprovementHistoryCause.EDIT,
        history_retention=1,
    )

    versions = list_artifact_versions(tmp_path, artifact.artifact_id)

    assert [entry.version for entry in versions] == [2]
    assert versions[0].artifact.notes == "current"
    assert (
        versions[0].artifact.notes
        == load_improvement_artifact(
            tmp_path,
            artifact.artifact_id,
        ).notes
    )


@verifies(SWR.SWR_1640)
def test_prune_with_zero_keep_drops_everything(tmp_path: Path) -> None:
    artifact = _artifact()
    save_improvement_artifact(tmp_path, artifact)
    record_artifact_version(tmp_path, artifact, cause=ImprovementHistoryCause.EDIT)

    dropped = prune_artifact_history(tmp_path, artifact.artifact_id, keep=0)

    assert dropped == 2
    assert not has_recorded_history(tmp_path, artifact.artifact_id)


@verifies(SWR.SWR_1640)
def test_history_survives_an_unreadable_version_file(tmp_path: Path) -> None:
    """One corrupt version never makes the rest of the history unreadable."""
    artifact = _artifact()
    save_improvement_artifact(tmp_path, artifact)
    record_artifact_version(tmp_path, artifact, cause=ImprovementHistoryCause.EDIT)
    corrupt = artifact_history_dir(tmp_path, artifact.artifact_id) / "000001.json"
    corrupt.write_text(json.dumps({"nope": True}), encoding="utf-8")

    versions = list_artifact_versions(tmp_path, artifact.artifact_id)

    assert [entry.version for entry in versions] == [2]


@verifies(SWR.SWR_1640)
def test_unknown_artifact_has_no_history(tmp_path: Path) -> None:
    assert list_artifact_versions(tmp_path, "impart_nothing0") == []
    assert latest_artifact_version(tmp_path, "impart_nothing0") is None
    with pytest.raises(FileNotFoundError):
        load_artifact_version(tmp_path, "impart_nothing0", 1)
