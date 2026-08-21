"""Rollback of an applied improvement run (SWR-1641).

Every test here drives a real temporary Git repository: the whole point of the
requirement is what happens to files on disk, and a mocked engine would prove
nothing about that.
"""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.improvement.persistence import (
    load_improvement_artifact,
    save_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    CHECKPOINT_KIND_APPLIED,
    CHECKPOINT_KIND_PRE_IMPROVEMENT,
    CHECKPOINT_KIND_PRE_ROLLBACK,
    ApprovalStatus,
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    new_artifact_id,
    new_proposal_id,
)
from rotaris_core.improvement.rollback import (
    IMPROVEMENT_CHECKPOINT_REF_PREFIX,
    ImprovementRollbackService,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoints import CHECKPOINT_REF_PREFIX, CheckpointEngine

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

_IDENTITY = (
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@local",
    "-c",
    "commit.gpgsign=false",
)


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *_IDENTITY, *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _repo(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    # Git for Windows enables core.autocrlf system-wide, and a checkout then
    # rewrites line endings — which would make "the file came back unchanged" a
    # statement about Git's end-of-line conversion rather than about the rollback.
    _git(root, "config", "core.autocrlf", "false")
    (root / "AGENTS.md").write_text("original agents guidance\n", encoding="utf-8")
    (root / "obsolete.md").write_text("delete me\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "initial")
    return root


def _artifact(workspace: Path, *, approved: bool = True) -> ImprovementProposalArtifact:
    artifact = ImprovementProposalArtifact(
        artifact_id=new_artifact_id("rollback"),
        source_session_id="sess",
        proposals=[
            ImprovementProposal(
                id=new_proposal_id("agents"),
                category=ImprovementProposalCategory.AGENTS_MD_UPDATE,
                summary="record the test invocation",
                recommended_action="add a testing section to AGENTS.md",
                status=ApprovalStatus.APPROVED if approved else ApprovalStatus.PENDING_REVIEW,
                evidence=[ImprovementEvidence(kind="transcript_observation", text="asked twice")],
            ),
        ],
    )
    save_improvement_artifact(workspace, artifact)
    return artifact


def _apply_improvement(root: Path) -> None:
    """What an Improver run's file tools would do: modify, create, delete."""
    (root / "AGENTS.md").write_text("original agents guidance\n\n## Testing\nrun it\n", "utf-8")
    (root / "NOTES.md").write_text("brand new file\n", encoding="utf-8")
    (root / "obsolete.md").unlink()


@pytest.fixture
def workspace(tmp_path: Path) -> Iterator[Path]:
    yield _repo(tmp_path / "workspace")


@verifies(SWR.SWR_1641)
def test_capture_records_a_rollback_point_on_the_artifact(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)

    outcome = service.capture_run_checkpoint(
        artifact.artifact_id,
        proposal_ids=[artifact.proposals[0].id],
    )

    assert outcome.recorded
    assert outcome.reason == ""
    assert outcome.point is not None
    assert outcome.point.kind == CHECKPOINT_KIND_PRE_IMPROVEMENT
    assert outcome.point.proposal_ids == [artifact.proposals[0].id]
    # It survives a reload, because it lives on the artifact.
    reloaded = load_improvement_artifact(workspace, artifact.artifact_id)
    assert reloaded.rollback_point is not None
    assert reloaded.rollback_point.commit == outcome.point.commit


@verifies(SWR.SWR_1641)
def test_rollback_point_uses_the_improvement_ref_namespace(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)

    outcome = service.capture_run_checkpoint(artifact.artifact_id)

    assert outcome.point is not None
    assert outcome.point.ref.startswith(f"{IMPROVEMENT_CHECKPOINT_REF_PREFIX}/")
    assert not outcome.point.ref.startswith(f"{CHECKPOINT_REF_PREFIX}/")


@verifies(SWR.SWR_1641)
def test_session_pruning_and_improvement_rollback_leave_each_other_alone(
    workspace: Path,
) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    improvement_point = service.capture_run_checkpoint(artifact.artifact_id).point
    assert improvement_point is not None

    # A session records its own checkpoints in the session namespace.
    session_engine = CheckpointEngine(workspace)
    (workspace / "session-work.txt").write_text("session state\n", encoding="utf-8")
    session_ref = session_engine.create(
        session_id="sess-1",
        sequence=1,
        message="session checkpoint",
    )
    assert session_ref is not None

    # Session pruning cannot see the improvement ref...
    session_engine.prune("sess-1", keep=0)
    assert service.engine.resolve(artifact.artifact_id, improvement_point.sequence) is not None

    # ... and the improvement engine cannot see a session's refs.
    assert session_engine.list_refs(artifact.artifact_id) == ()
    assert service.engine.list_refs("sess-1") == ()


@verifies(SWR.SWR_1641)
def test_preview_classifies_added_modified_and_deleted_paths(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(artifact.artifact_id)
    _apply_improvement(workspace)
    service.record_applied_state(artifact.artifact_id)

    preview = service.preview(artifact.artifact_id)

    by_path = {entry.path: entry.status for entry in preview.entries}
    # Statuses are checkpoint-relative: "A" is a path a rollback deletes.
    assert by_path["NOTES.md"] == "A"
    assert by_path["AGENTS.md"] == "M"
    assert by_path["obsolete.md"] == "D"
    assert preview.dirty_paths == ()
    assert preview.blocked_reason == ""


@verifies(SWR.SWR_1641)
def test_rollback_restores_every_touched_path(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(
        artifact.artifact_id,
        proposal_ids=[artifact.proposals[0].id],
    )
    _apply_improvement(workspace)
    service.record_applied_state(artifact.artifact_id)

    result = service.rollback(artifact.artifact_id)

    assert result.restored, result.blocked_reason
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "original agents guidance\n"
    assert (workspace / "obsolete.md").read_text(encoding="utf-8") == "delete me\n"
    assert not (workspace / "NOTES.md").exists()


@verifies(SWR.SWR_1641)
def test_rollback_takes_a_safety_checkpoint_first(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(artifact.artifact_id)
    _apply_improvement(workspace)
    service.record_applied_state(artifact.artifact_id)

    result = service.rollback(artifact.artifact_id)

    assert result.safety_point is not None
    assert result.safety_point.kind == CHECKPOINT_KIND_PRE_ROLLBACK
    stored = load_improvement_artifact(workspace, artifact.artifact_id)
    assert stored.newest_checkpoint(CHECKPOINT_KIND_PRE_ROLLBACK) is not None
    assert stored.newest_checkpoint(CHECKPOINT_KIND_APPLIED) is not None
    # The undo is itself undoable: the applied state is still reachable.
    safety_ref = service.engine.resolve(artifact.artifact_id, result.safety_point.sequence)
    assert safety_ref is not None
    service.engine.restore(safety_ref)
    assert (workspace / "NOTES.md").exists()


@verifies(SWR.SWR_1641)
def test_rollback_returns_applied_proposals_to_pending_review(workspace: Path) -> None:
    artifact = _artifact(workspace)
    proposal_id = artifact.proposals[0].id
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(artifact.artifact_id, proposal_ids=[proposal_id])
    _apply_improvement(workspace)
    service.record_applied_state(artifact.artifact_id)

    result = service.rollback(artifact.artifact_id)

    assert result.reverted_proposal_ids == (proposal_id,)
    stored = load_improvement_artifact(workspace, artifact.artifact_id)
    assert stored.proposals[0].status is ApprovalStatus.PENDING_REVIEW
    assert stored.rolled_back_at is not None


@verifies(SWR.SWR_1641)
def test_work_done_since_the_run_blocks_the_rollback_by_name(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(artifact.artifact_id)
    _apply_improvement(workspace)
    service.record_applied_state(artifact.artifact_id)

    # The user keeps working on a file the rollback would overwrite.
    (workspace / "AGENTS.md").write_text("my own careful edit\n", encoding="utf-8")

    preview = service.preview(artifact.artifact_id)
    assert preview.dirty_paths == ("AGENTS.md",)
    assert "AGENTS.md" in preview.blocked_reason

    refused = service.rollback(artifact.artifact_id)
    assert not refused.restored
    assert "AGENTS.md" in refused.blocked_reason
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "my own careful edit\n"


@verifies(SWR.SWR_1641)
def test_the_runs_own_edits_are_not_mistaken_for_the_users(workspace: Path) -> None:
    """Without a post-run checkpoint the rollback still proceeds unforced.

    The pre-run point is the rollback *target*; measuring drift against it would
    report everything the Improver did as work the user is about to lose.
    """
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(artifact.artifact_id)
    _apply_improvement(workspace)

    preview = service.preview(artifact.artifact_id)
    assert preview.dirty_paths == ()
    assert preview.blocked_reason == ""
    assert {entry.path for entry in preview.entries} == {
        "AGENTS.md",
        "NOTES.md",
        "obsolete.md",
    }

    result = service.rollback(artifact.artifact_id)
    assert result.restored, result.blocked_reason
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "original agents guidance\n"


@verifies(SWR.SWR_1641)
def test_a_retried_run_keeps_the_original_rollback_point(workspace: Path) -> None:
    """A run that failed half-way must still undo to the state before attempt one."""
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    first = service.capture_run_checkpoint(artifact.artifact_id)
    assert first.point is not None

    # The first attempt got half-way, then the user retries the same artifact.
    (workspace / "AGENTS.md").write_text("half applied\n", encoding="utf-8")
    second = service.capture_run_checkpoint(artifact.artifact_id)

    assert second.point is not None
    assert second.point.commit == first.point.commit
    assert second.point.sequence == first.point.sequence

    _apply_improvement(workspace)
    result = service.rollback(artifact.artifact_id, force=True)
    assert result.restored, result.blocked_reason
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "original agents guidance\n"


@verifies(SWR.SWR_1641)
def test_a_new_run_after_a_rollback_takes_a_fresh_point(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    first = service.capture_run_checkpoint(artifact.artifact_id)
    assert first.point is not None
    _apply_improvement(workspace)
    service.record_applied_state(artifact.artifact_id)
    assert service.rollback(artifact.artifact_id).restored

    second = service.capture_run_checkpoint(artifact.artifact_id)

    assert second.point is not None
    assert second.point.sequence > first.point.sequence


@verifies(SWR.SWR_1641)
def test_a_checkpoint_from_another_worktree_is_refused(workspace: Path, tmp_path: Path) -> None:
    """Worktrees share refs and objects; restoring across them would clobber a tree."""
    artifact = _artifact(workspace)
    other = tmp_path / "other-worktree"
    _git(workspace, "worktree", "add", "-b", "side", str(other))

    ImprovementRollbackService(workspace, tree_root=other).capture_run_checkpoint(
        artifact.artifact_id,
    )

    here = ImprovementRollbackService(workspace)
    assert "never described" in here.preview(artifact.artifact_id).blocked_reason
    result = here.rollback(artifact.artifact_id)
    assert not result.restored
    assert "never described" in result.blocked_reason


@verifies(SWR.SWR_1641)
def test_an_artifacts_checkpoints_are_bounded(workspace: Path) -> None:
    """Every checkpoint pins an unreachable commit, so they cannot accumulate forever."""
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(artifact.artifact_id)
    _apply_improvement(workspace)
    for index in range(12):
        (workspace / "NOTES.md").write_text(f"iteration {index}\n", encoding="utf-8")
        service.record_applied_state(artifact.artifact_id)

    stored = load_improvement_artifact(workspace, artifact.artifact_id)
    assert len(stored.checkpoints) == 10
    # The rollback target survives the pruning whatever the retention says.
    assert stored.rollback_point is not None
    assert service.rollback(artifact.artifact_id, force=True).restored


@verifies(SWR.SWR_1641)
def test_force_overrides_the_dirty_workspace_refusal(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(artifact.artifact_id)
    _apply_improvement(workspace)
    service.record_applied_state(artifact.artifact_id)
    (workspace / "AGENTS.md").write_text("my own careful edit\n", encoding="utf-8")

    result = service.rollback(artifact.artifact_id, force=True)

    assert result.restored, result.blocked_reason
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "original agents guidance\n"
    # Forcing still recorded the overwritten work, so it is not actually lost.
    assert result.safety_point is not None


@verifies(SWR.SWR_1641)
def test_non_git_workspace_reports_no_rollback_point_instead_of_refusing(tmp_path: Path) -> None:
    workspace = tmp_path / "plain"
    workspace.mkdir()
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)

    assert not service.available
    outcome = service.capture_run_checkpoint(artifact.artifact_id)
    assert not outcome.recorded
    assert "not inside a Git working tree" in outcome.reason
    # The artifact is untouched and the run is free to proceed.
    assert load_improvement_artifact(workspace, artifact.artifact_id).rollback_point is None

    result = service.rollback(artifact.artifact_id)
    assert not result.restored
    assert "no rollback point" in result.blocked_reason


@verifies(SWR.SWR_1641)
def test_rollback_without_a_recorded_point_is_refused(workspace: Path) -> None:
    artifact = _artifact(workspace)
    service = ImprovementRollbackService(workspace)

    preview = service.preview(artifact.artifact_id)
    result = service.rollback(artifact.artifact_id)

    assert "No rollback point" in preview.blocked_reason
    assert not result.restored
    assert "No rollback point" in result.blocked_reason


@verifies(SWR.SWR_1641)
def test_unknown_artifact_is_refused_without_raising(workspace: Path) -> None:
    service = ImprovementRollbackService(workspace)

    assert "No improvement artifact" in service.preview("impart_missing0").blocked_reason
    assert "No improvement artifact" in service.rollback("impart_missing0").blocked_reason
    assert "No improvement artifact" in service.capture_run_checkpoint("impart_missing0").reason


@verifies(SWR.SWR_1641)
def test_clean_committed_workspace_still_gets_a_rollback_point(workspace: Path) -> None:
    """The tree matching HEAD is the ordinary case, not a reason to skip the point."""
    artifact = _artifact(workspace)
    head = _git(workspace, "rev-parse", "HEAD").strip()
    service = ImprovementRollbackService(workspace)

    outcome = service.capture_run_checkpoint(artifact.artifact_id)

    assert outcome.point is not None
    assert outcome.point.commit == head
    assert outcome.point.ref.startswith(IMPROVEMENT_CHECKPOINT_REF_PREFIX)
