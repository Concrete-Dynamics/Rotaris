"""Checkpoint rollback behaviour against real Git repositories (SWR-2437)."""

from __future__ import annotations

import datetime as dt
import json
import shutil
import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoint_restore import (
    CheckpointRestorer,
    format_checkpoint_rows,
    format_preview_lines,
    restore_action,
)
from rotaris_core.session.checkpoint_service import CheckpointService
from rotaris_core.session.checkpoints import CheckpointError
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.state import SessionState, SessionWorktree

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

_SESSION_ID = "20260808-restore01"


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _repository(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "alpha.txt").write_text("alpha v1\n", encoding="utf-8")
    (root / "beta.txt").write_text("beta v1\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


def _write(root: Path, relative: str, content: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _session(
    workspace: Path,
    *,
    tree_root: Path | None = None,
    worktree: SessionWorktree | None = None,
) -> tuple[SessionManager, CheckpointService]:
    """A persisted session plus the service that records its checkpoints."""
    manager = SessionManager(workspace)
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id=_SESSION_ID,
        workspace_root=str(workspace),
        created_at=now,
        updated_at=now,
        worktree=worktree,
    )
    manager.flush_session(state)
    service = CheckpointService(
        session_manager=manager,
        state=state,
        tree_root=tree_root or workspace,
        config=RotarisConfig(workspace_root=workspace),
        isolated=True,
    )
    return manager, service


def _three_iterations(root: Path, service: CheckpointService) -> None:
    """Three checkpoints over a modification, a creation and a deletion."""
    _write(root, "alpha.txt", "alpha v2\n")
    assert service.capture(iteration=1) is not None
    _write(root, "gamma.txt", "gamma v1\n")
    assert service.capture(iteration=2) is not None
    (root / "beta.txt").unlink()
    assert service.capture(iteration=3) is not None


@pytest.fixture(scope="session")
def checkpointed_template(tmp_path_factory) -> Path:
    """One real repository with one real session and three real checkpoints.

    Built once and copied per test: every Git invocation costs a process, and a
    checkpoint is a handful of them, so rebuilding this for fourteen tests is
    most of their runtime.
    """
    root = tmp_path_factory.mktemp("checkpoint-template") / "workspace"
    _repository(root)
    _, service = _session(root)
    _three_iterations(root, service)
    return root


@pytest.fixture
def workspace(checkpointed_template: Path, tmp_path: Path) -> Path:
    """A private copy of the template repository, session and checkpoints."""
    root = tmp_path / "workspace"
    shutil.copytree(checkpointed_template, root)
    return root


def _statuses(entries) -> dict[str, str]:
    return {entry.path: entry.status for entry in entries}


@verifies(SWR.SWR_2437)
def test_preview_reports_what_a_restore_would_change(workspace: Path) -> None:
    """Productive use: a user inspects an earlier checkpoint before rolling back to it.
    Expected outcome: the preview names every file the restore would touch without
    changing anything on disk."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    preview = restorer.preview(1)

    assert preview is not None
    assert preview.checkpoint.sequence == 1
    # Engine direction: "A" exists now but not in the checkpoint (a restore
    # deletes it); "D" is in the checkpoint but gone now (a restore recreates it).
    assert _statuses(preview.entries) == {"gamma.txt": "A", "beta.txt": "D"}
    assert preview.dirty_paths == ()
    assert preview.blocked_reason == ""
    # Nothing on disk moved.
    assert (root / "gamma.txt").read_text(encoding="utf-8") == "gamma v1\n"
    assert not (root / "beta.txt").exists()


@verifies(SWR.SWR_2437)
def test_preview_returns_nothing_for_a_checkpoint_the_session_never_recorded(
    workspace: Path,
) -> None:
    """Productive use: a user asks about a checkpoint number that does not exist.
    Expected outcome: the caller is told there is nothing to preview instead of
    being handed a misleading empty diff."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    assert restorer.preview(99) is None


@verifies(SWR.SWR_2437)
def test_restore_returns_the_working_tree_to_the_chosen_checkpoint(workspace: Path) -> None:
    """Productive use: a user rolls the working tree back to an earlier iteration.
    Expected outcome: every file matches that iteration's content and the user's
    branch history is untouched."""
    root = workspace
    manager = SessionManager(root)
    head_before = _git(root, "rev-parse", "HEAD").strip()
    branch_before = _git(root, "symbolic-ref", "HEAD").strip()
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    result = restorer.restore(1)

    assert result.restored is True
    assert result.blocked_reason == ""
    assert set(result.changed_paths) == {"beta.txt", "gamma.txt"}
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / "beta.txt").read_text(encoding="utf-8") == "beta v1\n"
    assert not (root / "gamma.txt").exists()
    assert _git(root, "rev-parse", "HEAD").strip() == head_before
    assert _git(root, "symbolic-ref", "HEAD").strip() == branch_before


@verifies(SWR.SWR_2437)
def test_restore_records_a_pre_restore_safety_checkpoint_first(workspace: Path) -> None:
    """Productive use: a user rolls back and then changes their mind.
    Expected outcome: the pre-restore state was recorded as its own checkpoint, so
    the rollback can itself be rolled back."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    result = restorer.restore(1)

    safety = result.safety_checkpoint
    assert safety is not None
    assert safety.kind == "pre_restore"
    assert safety.sequence == 4
    # The safety checkpoint holds the tree as it was *before* the restore ran.
    assert _git(root, "show", f"{safety.commit}:gamma.txt") == "gamma v1\n"
    # And it survived to the persisted session, so a later process can offer it.
    persisted = manager.read_session_snapshot(_SESSION_ID)
    assert [entry.sequence for entry in persisted.checkpoints] == [1, 2, 3, 4]
    assert persisted.checkpoints[-1].kind == "pre_restore"


@verifies(SWR.SWR_2437)
def test_restore_refuses_when_uncommitted_changes_would_be_overwritten(workspace: Path) -> None:
    """Productive use: a user edits a file by hand, then asks for a rollback that
    would silently discard the edit.
    Expected outcome: the rollback is refused with a reason and the edit is still
    on disk."""
    root = workspace
    manager = SessionManager(root)
    _write(root, "alpha.txt", "hand written by the user\n")
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    preview = restorer.preview(2)
    result = restorer.restore(2)

    assert preview is not None
    assert preview.dirty_paths == ("alpha.txt",)
    assert "alpha.txt" in preview.blocked_reason
    assert result.restored is False
    assert "alpha.txt" in result.blocked_reason
    assert result.safety_checkpoint is None
    assert result.changed_paths == ()
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "hand written by the user\n"


@verifies(SWR.SWR_2437)
def test_forcing_a_refused_restore_overwrites_the_uncommitted_changes(workspace: Path) -> None:
    """Productive use: a user is warned about their uncommitted edit and decides the
    rollback matters more.
    Expected outcome: forcing applies the rollback and the discarded edit is still
    recoverable from the safety checkpoint."""
    root = workspace
    manager = SessionManager(root)
    _write(root, "alpha.txt", "hand written by the user\n")
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    result = restorer.restore(2, force=True)

    assert result.restored is True
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / "beta.txt").read_text(encoding="utf-8") == "beta v1\n"
    assert result.safety_checkpoint is not None
    assert (
        _git(root, "show", f"{result.safety_checkpoint.commit}:alpha.txt")
        == "hand written by the user\n"
    )


@verifies(SWR.SWR_2437)
def test_the_safety_checkpoint_rolls_the_rollback_back(workspace: Path) -> None:
    """Productive use: a user restores an earlier checkpoint and then undoes that
    restore.
    Expected outcome: the working tree returns to exactly the state it had before
    the restore, without forcing."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)
    forward = restorer.restore(1)
    assert forward.restored is True
    assert forward.safety_checkpoint is not None

    back = restorer.restore(forward.safety_checkpoint.sequence)

    assert back.restored is True, back.blocked_reason
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / "gamma.txt").read_text(encoding="utf-8") == "gamma v1\n"
    assert not (root / "beta.txt").exists()


@verifies(SWR.SWR_2437)
def test_a_restore_is_refused_when_the_safety_checkpoint_cannot_be_taken(
    workspace: Path, monkeypatch
) -> None:
    """Productive use: Git refuses to snapshot the pre-restore state.
    Expected outcome: the rollback does not run, because an irreversible rollback is
    worse than none."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    def _refuse(_self: object, **_kwargs: object) -> None:
        raise CheckpointError("disk is full")

    monkeypatch.setattr("rotaris_core.session.checkpoints.CheckpointEngine.create", _refuse)

    result = restorer.restore(1)

    assert result.restored is False
    assert "safety checkpoint" in result.blocked_reason
    assert "disk is full" in result.blocked_reason
    # The tree is exactly as iteration 3 left it.
    assert (root / "gamma.txt").read_text(encoding="utf-8") == "gamma v1\n"
    assert not (root / "beta.txt").exists()


@verifies(SWR.SWR_2437)
def test_restore_records_its_audit_trail_on_the_session(workspace: Path) -> None:
    """Productive use: an operator reviews what a session did after the fact.
    Expected outcome: the timeline names the restored checkpoint, its safety
    checkpoint and how many files moved, and a refusal is recorded as a warning."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    result = restorer.restore(1)
    blocked = restorer.restore(99)

    assert result.restored is True
    assert blocked.restored is False
    timeline = [
        json.loads(line)
        for line in (manager.session_dir(_SESSION_ID) / "timeline.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip()
    ]
    restored_events = [event for event in timeline if event["type"] == "checkpoint_restored"]
    assert len(restored_events) == 1
    metadata = restored_events[0]["metadata"]
    assert metadata["sequence"] == 1
    assert metadata["safety_sequence"] == 4
    assert metadata["changed_file_count"] == 2

    issues = json.loads((manager.session_dir(_SESSION_ID) / "issues.json").read_text("utf-8"))
    warnings = [issue for issue in issues["issues"] if issue["kind"] == "checkpoint_restore"]
    assert len(warnings) == 1
    assert warnings[0]["severity"] == "warning"
    assert "99" in warnings[0]["message"]


@verifies(SWR.SWR_2437)
def test_an_isolated_session_is_restored_into_its_own_worktree(tmp_path: Path) -> None:
    """Productive use: a user rolls back a session that ran in its own Git worktree.
    Expected outcome: the worktree returns to the checkpoint and the base workspace
    that only held the session metadata is left alone."""
    workspace = _repository(tmp_path / "workspace")
    worktree = _repository(tmp_path / "worktree")
    manager, service = _session(
        workspace,
        tree_root=worktree,
        worktree=SessionWorktree(
            path=str(worktree),
            branch="rotaris/session",
            base_branch="main",
            base_revision="0" * 40,
        ),
    )
    _three_iterations(worktree, service)
    _write(workspace, "alpha.txt", "untouched by the restore\n")

    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    assert restorer.tree_root == worktree
    result = restorer.restore(1)

    assert result.restored is True
    assert (worktree / "beta.txt").read_text(encoding="utf-8") == "beta v1\n"
    assert (workspace / "alpha.txt").read_text(encoding="utf-8") == "untouched by the restore\n"


@verifies(SWR.SWR_2437)
def test_a_restorer_reports_unavailable_instead_of_raising(tmp_path: Path) -> None:
    """Productive use: a user opens the checkpoint view for a session that has no Git
    repository, or names a session that does not exist.
    Expected outcome: the caller is told there is nothing to restore rather than
    receiving an exception."""
    plain = tmp_path / "plain"
    plain.mkdir()
    manager, _service = _session(plain)

    assert CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID).available is False

    repo = _repository(tmp_path / "workspace")
    unknown = CheckpointRestorer(session_manager=SessionManager(repo), session_id="no-such-session")
    assert unknown.available is False
    assert unknown.list_checkpoints() == ()
    assert unknown.preview(1) is None
    outcome = unknown.restore(1)
    assert outcome.restored is False
    assert "no-such-session" in outcome.blocked_reason


@verifies(SWR.SWR_2437)
def test_a_restore_of_a_checkpoint_whose_git_snapshot_is_gone_is_refused(workspace: Path) -> None:
    """Productive use: a user picks a checkpoint whose Git ref was pruned away.
    Expected outcome: the restore refuses with a reason, and forcing does not make
    a missing snapshot restorable."""
    root = workspace
    manager = SessionManager(root)
    _git(root, "update-ref", "-d", "refs/rotaris/checkpoints/20260808-restore01/1")
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)

    preview = restorer.preview(1)
    forced = restorer.restore(1, force=True)

    assert preview is not None
    assert "no longer be restored" in preview.blocked_reason
    assert forced.restored is False
    assert "no longer be restored" in forced.blocked_reason


@verifies(SWR.SWR_2437)
def test_the_user_facing_summary_inverts_the_engines_added_and_deleted(workspace: Path) -> None:
    """Productive use: a user reads the confirmation prompt before rolling back.
    Expected outcome: a file the restore deletes is described as deleted and a file
    it brings back is described as recreated."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)
    preview = restorer.preview(1)
    assert preview is not None

    lines = format_preview_lines(preview)

    assert restore_action("A") == "delete"
    assert restore_action("D") == "recreate"
    # gamma.txt exists only because of iteration 2, so the restore removes it.
    assert any("delete" in line and "gamma.txt" in line for line in lines)
    # beta.txt was deleted in iteration 3, so the restore brings it back.
    assert any("recreate" in line and "beta.txt" in line for line in lines)


@verifies(SWR.SWR_2437)
def test_the_checkpoint_listing_shows_sequence_time_iteration_and_file_count(
    workspace: Path,
) -> None:
    """Productive use: a user scans a session's checkpoints to choose one to restore.
    Expected outcome: each row carries the sequence, when it was taken, the iteration
    and how many files it changed."""
    root = workspace
    manager = SessionManager(root)
    restorer = CheckpointRestorer(session_manager=manager, session_id=_SESSION_ID)
    recorded = restorer.list_checkpoints()

    rows = format_checkpoint_rows(recorded)

    assert rows[0].split() == ["SEQ", "CREATED", "ITER", "FILES", "KIND"]
    assert len(rows) == 4
    second = rows[2].split()
    assert second[0] == "2"
    assert second[1].startswith(str(recorded[1].created_at.year))
    assert second[2] == "2"
    assert second[3] == str(len(recorded[1].files))
    assert second[4] == "iteration"
