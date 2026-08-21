"""Approve → apply → inspect → roll back, in a real Git workspace.

The user-flow E2E for SWR-1640/1641/1642: everything here goes through the
public improvement API and the ``rotaris-cli improvements`` command group, over
a real temporary repository. Only the Improver's own file edits are simulated —
the agent's tools are an LLM away, but what they *do* to the tree (modify a
file, create one, delete one) is reproduced exactly, because that is what the
rollback has to undo.
"""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

import pytest
from typer.testing import CliRunner

from rotaris_core.cli.commands import improvements as improvements_cli
from rotaris_core.improvement.approval import set_proposal_status
from rotaris_core.improvement.history import (
    ImprovementHistoryCause,
    list_artifact_versions,
)
from rotaris_core.improvement.improver import (
    complete_improvement_run,
    prepare_improvement_run,
)
from rotaris_core.improvement.persistence import (
    load_improvement_artifact,
    save_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    CHECKPOINT_KIND_PRE_ROLLBACK,
    ApprovalStatus,
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    new_artifact_id,
    new_proposal_id,
)
from rotaris_core.improvement.rollback import ImprovementRollbackService
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration

runner = CliRunner()

_IDENTITY = ("-c", "user.name=test", "-c", "user.email=test@local", "-c", "commit.gpgsign=false")

_ORIGINAL_AGENTS = "# AGENTS\n\noriginal guidance\n"
_ORIGINAL_STALE = "this note is out of date\n"
_APPLIED_AGENTS = "# AGENTS\n\noriginal guidance\n\n## Testing\nRun pytest with PYTHONPATH=src.\n"
_CREATED_NOTE = "Recorded by the improvement run.\n"


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


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """A real Git repository with two committed files."""
    root = tmp_path / "workspace"
    root.mkdir()
    _git(root, "init", "-b", "main")
    # Git for Windows turns core.autocrlf on system-wide, and a checkout then
    # rewrites line endings. Byte-identity has to be a claim about the rollback,
    # not about Git's end-of-line conversion, so the conversion is turned off.
    _git(root, "config", "core.autocrlf", "false")
    (root / "AGENTS.md").write_text(_ORIGINAL_AGENTS, encoding="utf-8")
    (root / "STALE.md").write_text(_ORIGINAL_STALE, encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "initial")
    return root


def _collected_artifact(workspace: Path) -> ImprovementProposalArtifact:
    """What the collector would have written after a completed task run."""
    artifact = ImprovementProposalArtifact(
        artifact_id=new_artifact_id("flow"),
        source_session_id="session-flow",
        collector_model="stub/cheap",
        proposals=[
            ImprovementProposal(
                id=new_proposal_id("agents"),
                category=ImprovementProposalCategory.AGENTS_MD_UPDATE,
                summary="document the test invocation",
                recommended_action="add a Testing section to AGENTS.md and drop STALE.md",
                evidence=[
                    ImprovementEvidence(
                        kind="transcript_observation",
                        text="the agent guessed the pytest invocation twice",
                        source_session_id="session-flow",
                    ),
                ],
            ),
        ],
    )
    save_improvement_artifact(workspace, artifact)
    return artifact


def _improver_edits(workspace: Path) -> None:
    """Stand-in for the Improver agent's file tools: modify, create, delete."""
    (workspace / "AGENTS.md").write_text(_APPLIED_AGENTS, encoding="utf-8")
    (workspace / "NOTES.md").write_text(_CREATED_NOTE, encoding="utf-8")
    (workspace / "STALE.md").unlink()


def _apply_approved_improvement(workspace: Path, artifact_id: str) -> None:
    """Run the public prepare → apply → record-applied sequence."""
    prepared, approved, todo = prepare_improvement_run(workspace, artifact_id)
    assert [proposal.status for proposal in approved] == [ApprovalStatus.APPROVED]
    assert len(todo.phases[0].tasks) == 1
    # Preparing the run is what takes the rollback point.
    assert prepared.rollback_point is not None
    _improver_edits(workspace)
    complete_improvement_run(workspace, artifact_id)


@verifies(SWR.SWR_1640, SWR.SWR_1641, SWR.SWR_1642)
def test_a_user_approves_applies_and_rolls_back_an_improvement(workspace: Path) -> None:
    artifact = _collected_artifact(workspace)
    proposal_id = artifact.proposals[0].id

    # Read as bytes: "byte-identical" is the acceptance criterion, and text mode
    # would quietly normalise away exactly the difference it is asserting about.
    before_agents = (workspace / "AGENTS.md").read_bytes()
    before_stale = (workspace / "STALE.md").read_bytes()

    set_proposal_status(workspace, artifact.artifact_id, proposal_id, ApprovalStatus.APPROVED)
    _apply_approved_improvement(workspace, artifact.artifact_id)

    # The user can see what the run did.
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == _APPLIED_AGENTS
    assert (workspace / "NOTES.md").read_text(encoding="utf-8") == _CREATED_NOTE
    assert not (workspace / "STALE.md").exists()

    # ... and what the proposal said at the moment it was approved (SWR-1640).
    versions = list_artifact_versions(workspace, artifact.artifact_id)
    approval_version = next(
        entry for entry in versions if entry.cause is ImprovementHistoryCause.STATUS_CHANGE
    )
    approved_proposal = approval_version.artifact.proposals[0]
    assert approved_proposal.status is ApprovalStatus.APPROVED
    assert approved_proposal.recommended_action == (
        "add a Testing section to AGENTS.md and drop STALE.md"
    )

    result = runner.invoke(
        improvements_cli_app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(workspace), "--yes"],
    )

    assert result.exit_code == 0, result.output
    # Every touched path is byte-identical to its pre-run state: the modified
    # file, and the deleted one that came back. The created one is gone.
    assert (workspace / "AGENTS.md").read_bytes() == before_agents
    assert (workspace / "STALE.md").read_bytes() == before_stale
    assert not (workspace / "NOTES.md").exists()
    # Nothing was left over in the tree. Rotaris control data is excluded, the
    # same way the checkpoint engine excludes it from what it captures.
    leftover = _git(
        workspace,
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        ".",
        ":(exclude).rotaris",
    )
    assert leftover.strip() == ""

    # The reversal is on the artifact and in its history.
    stored = load_improvement_artifact(workspace, artifact.artifact_id)
    assert stored.proposals[0].status is ApprovalStatus.PENDING_REVIEW
    assert stored.rolled_back_at is not None
    assert list_artifact_versions(workspace, artifact.artifact_id)[0].cause is (
        ImprovementHistoryCause.ROLLBACK
    )


@verifies(SWR.SWR_1641)
def test_the_rollback_is_itself_reversible(workspace: Path) -> None:
    artifact = _collected_artifact(workspace)
    set_proposal_status(
        workspace,
        artifact.artifact_id,
        artifact.proposals[0].id,
        ApprovalStatus.APPROVED,
    )
    _apply_approved_improvement(workspace, artifact.artifact_id)

    service = ImprovementRollbackService(workspace)
    result = service.rollback(artifact.artifact_id)
    assert result.restored, result.blocked_reason

    safety = result.safety_point
    assert safety is not None
    assert safety.kind == CHECKPOINT_KIND_PRE_ROLLBACK
    stored = load_improvement_artifact(workspace, artifact.artifact_id)
    assert stored.newest_checkpoint(CHECKPOINT_KIND_PRE_ROLLBACK) is not None

    # Undoing the undo puts the improvement back.
    safety_ref = service.engine.resolve(artifact.artifact_id, safety.sequence)
    assert safety_ref is not None
    service.engine.restore(safety_ref)
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == _APPLIED_AGENTS
    assert (workspace / "NOTES.md").read_text(encoding="utf-8") == _CREATED_NOTE
    assert not (workspace / "STALE.md").exists()


@verifies(SWR.SWR_1641, SWR.SWR_1642)
def test_work_done_since_the_run_blocks_the_rollback_until_forced(workspace: Path) -> None:
    artifact = _collected_artifact(workspace)
    set_proposal_status(
        workspace,
        artifact.artifact_id,
        artifact.proposals[0].id,
        ApprovalStatus.APPROVED,
    )
    _apply_approved_improvement(workspace, artifact.artifact_id)

    # The user edits a file the rollback would overwrite.
    (workspace / "AGENTS.md").write_text("# AGENTS\n\nmy own careful edit\n", encoding="utf-8")

    argv = [
        "improvements",
        "rollback",
        artifact.artifact_id,
        "--workspace",
        str(workspace),
        "--yes",
    ]
    refused = runner.invoke(improvements_cli_app(), argv)

    assert refused.exit_code == 1
    assert "AGENTS.md" in refused.output
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == (
        "# AGENTS\n\nmy own careful edit\n"
    )

    forced = runner.invoke(improvements_cli_app(), [*argv, "--force"])

    assert forced.exit_code == 0, forced.output
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == _ORIGINAL_AGENTS


@verifies(SWR.SWR_1642)
def test_list_and_show_report_the_artifact_and_its_versions(workspace: Path) -> None:
    artifact = _collected_artifact(workspace)
    set_proposal_status(
        workspace,
        artifact.artifact_id,
        artifact.proposals[0].id,
        ApprovalStatus.APPROVED,
    )
    _apply_approved_improvement(workspace, artifact.artifact_id)

    listed = runner.invoke(
        improvements_cli_app(),
        ["improvements", "list", "--workspace", str(workspace)],
    )
    assert listed.exit_code == 0, listed.output
    row = next(line for line in listed.output.splitlines() if artifact.artifact_id in line)
    assert "approved=1" in row
    assert " yes " in row

    shown = runner.invoke(
        improvements_cli_app(),
        ["improvements", "show", artifact.artifact_id, "--workspace", str(workspace)],
    )
    assert shown.exit_code == 0, shown.output
    assert artifact.proposals[0].id in shown.output
    assert "collected" in shown.output
    assert "status_change" in shown.output
    assert "checkpoint" in shown.output


@verifies(SWR.SWR_1641)
def test_a_non_git_workspace_still_prepares_the_run(tmp_path: Path) -> None:
    """No repository means no rollback point — never a refusal to run."""
    plain = tmp_path / "plain"
    plain.mkdir()
    artifact = _collected_artifact(plain)
    set_proposal_status(
        plain,
        artifact.artifact_id,
        artifact.proposals[0].id,
        ApprovalStatus.APPROVED,
    )

    prepared, approved, todo = prepare_improvement_run(plain, artifact.artifact_id)

    assert len(approved) == 1
    assert len(todo.phases[0].tasks) == 1
    assert prepared.rollback_point is None
    assert not ImprovementRollbackService(plain).available

    refused = runner.invoke(
        improvements_cli_app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(plain), "--yes"],
    )
    assert refused.exit_code == 1
    assert "no rollback point" in refused.output


def improvements_cli_app():  # noqa: ANN201
    """A Typer app carrying only the group under test, registered the real way."""
    import typer

    app = typer.Typer()
    improvements_cli.register(app)
    return app
