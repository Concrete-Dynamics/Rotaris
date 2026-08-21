"""The ``improvements`` command group (SWR-1642).

Argument parsing, confirmation handling and the exit codes CI branches on:
0 for success or a declined confirmation, 1 for a refused rollback, 2 for a
missing artifact or an unattended rollback without ``--yes``.
"""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

import typer
from typer.testing import CliRunner

from rotaris_core.cli.commands import improvements as improvements_cli
from rotaris_core.improvement.approval import set_proposal_status
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
from rotaris_core.improvement.rollback import ImprovementRollbackService
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

    import pytest

runner = CliRunner()

_IDENTITY = ("-c", "user.name=test", "-c", "user.email=test@local", "-c", "commit.gpgsign=false")


def _app() -> typer.Typer:
    app = typer.Typer()
    improvements_cli.register(app)
    return app


def _git(cwd: Path, *args: str) -> None:
    result = subprocess.run(
        ["git", *_IDENTITY, *args],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "workspace"
    root.mkdir()
    _git(root, "init", "-b", "main")
    _git(root, "config", "core.autocrlf", "false")
    (root / "AGENTS.md").write_text("original\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "initial")
    return root


def _artifact(workspace: Path) -> ImprovementProposalArtifact:
    artifact = ImprovementProposalArtifact(
        artifact_id=new_artifact_id("cli"),
        source_session_id="sess-cli",
        proposals=[
            ImprovementProposal(
                id=new_proposal_id("cli"),
                category=ImprovementProposalCategory.AGENTS_MD_UPDATE,
                summary="add a testing section",
                recommended_action="extend AGENTS.md",
                evidence=[ImprovementEvidence(kind="transcript_observation", text="seen twice")],
            ),
        ],
    )
    save_improvement_artifact(workspace, artifact)
    return artifact


def _applied(workspace: Path) -> ImprovementProposalArtifact:
    """An artifact whose approved proposal was applied, with both checkpoints."""
    artifact = _artifact(workspace)
    set_proposal_status(
        workspace,
        artifact.artifact_id,
        artifact.proposals[0].id,
        ApprovalStatus.APPROVED,
    )
    service = ImprovementRollbackService(workspace)
    service.capture_run_checkpoint(
        artifact.artifact_id,
        proposal_ids=[artifact.proposals[0].id],
    )
    (workspace / "AGENTS.md").write_text("original\n\n## Testing\n", encoding="utf-8")
    (workspace / "NOTES.md").write_text("new\n", encoding="utf-8")
    service.record_applied_state(artifact.artifact_id)
    return artifact


@verifies(SWR.SWR_1642)
def test_list_reports_an_empty_workspace_without_failing(tmp_path: Path) -> None:
    result = runner.invoke(_app(), ["improvements", "list", "--workspace", str(tmp_path)])

    assert result.exit_code == 0, result.output
    assert "No improvement artifacts" in result.output


@verifies(SWR.SWR_1642)
def test_list_shows_id_time_status_counts_and_rollback_availability(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    artifact = _artifact(workspace)

    before = runner.invoke(_app(), ["improvements", "list", "--workspace", str(workspace)])
    assert before.exit_code == 0, before.output
    assert artifact.artifact_id in before.output
    assert "pending_review=1" in before.output
    assert "ROLLBACK" in before.output

    ImprovementRollbackService(workspace).capture_run_checkpoint(artifact.artifact_id)
    after = runner.invoke(_app(), ["improvements", "list", "--workspace", str(workspace)])
    row = next(line for line in after.output.splitlines() if artifact.artifact_id in line)
    assert " yes " in row


@verifies(SWR.SWR_1642)
def test_show_prints_proposals_and_version_history(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    artifact = _artifact(workspace)
    set_proposal_status(
        workspace,
        artifact.artifact_id,
        artifact.proposals[0].id,
        ApprovalStatus.APPROVED,
    )

    result = runner.invoke(
        _app(), ["improvements", "show", artifact.artifact_id, "--workspace", str(workspace)]
    )

    assert result.exit_code == 0, result.output
    assert artifact.proposals[0].id in result.output
    assert "add a testing section" in result.output
    assert "History:" in result.output
    assert "collected" in result.output
    assert "status_change" in result.output


@verifies(SWR.SWR_1642)
def test_show_of_a_missing_artifact_exits_two(tmp_path: Path) -> None:
    result = runner.invoke(
        _app(), ["improvements", "show", "impart_missing0", "--workspace", str(tmp_path)]
    )

    assert result.exit_code == 2
    assert "No improvement artifact" in result.output


@verifies(SWR.SWR_1642)
def test_rollback_of_a_missing_artifact_exits_two(tmp_path: Path) -> None:
    result = runner.invoke(
        _app(),
        ["improvements", "rollback", "impart_missing0", "--workspace", str(tmp_path), "--yes"],
    )

    assert result.exit_code == 2
    assert "No improvement artifact" in result.output


@verifies(SWR.SWR_1642)
def test_rollback_with_yes_restores_and_reports_the_versions(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    artifact = _applied(workspace)

    result = runner.invoke(
        _app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(workspace), "--yes"],
    )

    assert result.exit_code == 0, result.output
    assert "would change" in result.output
    assert "Rolled back improvement" in result.output
    assert "Safety checkpoint" in result.output
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "original\n"
    assert not (workspace / "NOTES.md").exists()
    stored = load_improvement_artifact(workspace, artifact.artifact_id)
    assert stored.proposals[0].status is ApprovalStatus.PENDING_REVIEW


@verifies(SWR.SWR_1642)
def test_a_refused_rollback_names_the_paths_and_exits_one(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    artifact = _applied(workspace)
    (workspace / "AGENTS.md").write_text("my own edit\n", encoding="utf-8")

    result = runner.invoke(
        _app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(workspace), "--yes"],
    )

    assert result.exit_code == 1
    assert "AGENTS.md" in result.output
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "my own edit\n"

    forced = runner.invoke(
        _app(),
        [
            "improvements",
            "rollback",
            artifact.artifact_id,
            "--workspace",
            str(workspace),
            "--yes",
            "--force",
        ],
    )
    assert forced.exit_code == 0, forced.output
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "original\n"


@verifies(SWR.SWR_1642)
def test_rollback_without_yes_refuses_rather_than_waiting_on_a_pipe(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    artifact = _applied(workspace)

    result = runner.invoke(
        _app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(workspace)],
    )

    assert result.exit_code == 2
    assert "requires --yes" in result.output
    assert (workspace / "NOTES.md").exists()


@verifies(SWR.SWR_1642)
def test_declining_the_confirmation_leaves_the_workspace_alone(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = _workspace(tmp_path)
    artifact = _applied(workspace)
    monkeypatch.setattr(improvements_cli, "_stdin_is_interactive", lambda: True)

    result = runner.invoke(
        _app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(workspace)],
        input="n\n",
    )

    assert result.exit_code == 0, result.output
    assert "Rollback cancelled." in result.output
    assert (workspace / "AGENTS.md").read_text(encoding="utf-8") == "original\n\n## Testing\n"
    assert (workspace / "NOTES.md").exists()


@verifies(SWR.SWR_1642)
def test_confirming_the_prompt_performs_the_rollback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = _workspace(tmp_path)
    artifact = _applied(workspace)
    monkeypatch.setattr(improvements_cli, "_stdin_is_interactive", lambda: True)

    result = runner.invoke(
        _app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(workspace)],
        input="y\n",
    )

    assert result.exit_code == 0, result.output
    assert not (workspace / "NOTES.md").exists()


@verifies(SWR.SWR_1642)
def test_rollback_without_a_recorded_point_exits_one(tmp_path: Path) -> None:
    workspace = _workspace(tmp_path)
    artifact = _artifact(workspace)

    result = runner.invoke(
        _app(),
        ["improvements", "rollback", artifact.artifact_id, "--workspace", str(workspace), "--yes"],
    )

    assert result.exit_code == 1
    assert "No rollback point" in result.output


@verifies(SWR.SWR_1642)
def test_the_group_is_registered_on_the_real_cli() -> None:
    from rotaris_core.cli.app import app as real_app

    result = runner.invoke(real_app, ["--help"])

    assert result.exit_code == 0, result.output
    assert "improvements" in result.output
