"""Checkpoint engine behaviour against real Git repositories."""

from __future__ import annotations

import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoints import (
    CHECKPOINT_REF_PREFIX,
    CheckpointEngine,
    CheckpointError,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


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


def _repository(tmp_path: Path) -> Path:
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Test User")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    (tmp_path / ".gitignore").write_text(".rotaris/\nbuild/\n", encoding="utf-8")
    (tmp_path / "alpha.txt").write_text("alpha v1\n", encoding="utf-8")
    (tmp_path / "beta.txt").write_text("beta v1\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    return tmp_path


def _write(root: Path, relative: str, content: str) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def _repo_fingerprint(root: Path) -> dict[str, object]:
    return {
        "head": _git(root, "rev-parse", "HEAD").strip(),
        "symbolic_head": _git(root, "symbolic-ref", "HEAD").strip(),
        "status": _git(root, "status", "--porcelain=v1", "--untracked-files=all"),
        "reflog": _git(root, "reflog", "--all"),
        "branches": _git(root, "branch", "--list"),
    }


def _index_bytes(root: Path) -> bytes:
    """The user's real index, read straight off disk without invoking Git."""
    index = root / ".git" / "index"
    return index.read_bytes() if index.is_file() else b""


@verifies(SWR.SWR_2436)
def test_checkpoint_records_a_ref_in_the_rotaris_namespace(tmp_path: Path) -> None:
    """Productive use: a session can snapshot an iteration's edits.
    Expected outcome: a checkpoint commit is reachable from
    refs/rotaris/checkpoints/<session>/<sequence>."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")

    checkpoint = engine.create(session_id="20260808-abcdef", sequence=1, message="iteration 1")

    assert checkpoint is not None
    assert checkpoint.ref == f"{CHECKPOINT_REF_PREFIX}/20260808-abcdef/1"
    assert checkpoint.session_id == "20260808-abcdef"
    assert checkpoint.sequence == 1
    assert len(checkpoint.commit) >= 40
    assert _git(root, "rev-parse", checkpoint.ref).strip() == checkpoint.commit
    assert _git(root, "show", f"{checkpoint.commit}:alpha.txt") == "alpha v2\n"


@verifies(SWR.SWR_2436)
def test_creating_a_checkpoint_leaves_branch_index_and_reflog_untouched(tmp_path: Path) -> None:
    """Productive use: a user keeps working while Rotaris checkpoints in the background.
    Expected outcome: HEAD, the branch, the staged index and the reflog are exactly as before."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    _write(root, "gamma.txt", "gamma v1\n")
    before = _repo_fingerprint(root)
    # Read after the fingerprint's own Git calls, so only the engine runs in between.
    index_before = _index_bytes(root)

    checkpoint = engine.create(session_id="20260808-abcdef", sequence=1, message="iteration 1")

    index_after = _index_bytes(root)
    assert checkpoint is not None
    assert index_after == index_before
    after = _repo_fingerprint(root)
    assert after == before
    assert "refs/rotaris" not in str(after["reflog"])


@verifies(SWR.SWR_2436)
def test_checkpoint_captures_untracked_files_but_not_ignored_or_control_data(
    tmp_path: Path,
) -> None:
    """Productive use: an agent's brand-new source files are snapshotted with the iteration.
    Expected outcome: untracked sources are in the checkpoint while build output and
    .rotaris session data are not."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "gamma.txt", "gamma v1\n")
    _write(root, "build/artifact.bin", "binary\n")
    _write(root, ".rotaris/sessions/x/state.json", "{}\n")

    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")

    assert checkpoint is not None
    tracked = _git(root, "ls-tree", "-r", "--name-only", checkpoint.commit).split()
    assert "gamma.txt" in tracked
    assert "build/artifact.bin" not in tracked
    assert not any(path.startswith(".rotaris") for path in tracked)


@verifies(SWR.SWR_2436, SWR.SWR_2437)
def test_control_data_is_excluded_even_when_it_is_not_gitignored(tmp_path: Path) -> None:
    """Productive use: a workspace that never ignored .rotaris still keeps session data private.
    Expected outcome: control data is neither checkpointed nor removed by a restore."""
    root = _repository(tmp_path)
    (root / ".gitignore").write_text("build/\n", encoding="utf-8")
    _git(root, "add", ".gitignore")
    _git(root, "commit", "-m", "stop ignoring control data")
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    _write(root, ".rotaris/sessions/x/state.json", "{}\n")

    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")
    assert checkpoint is not None
    tracked = _git(root, "ls-tree", "-r", "--name-only", checkpoint.commit).split()
    assert not any(path.startswith(".rotaris") for path in tracked)
    assert not any(entry.startswith(".rotaris") for entry in engine.changed_paths())

    _write(root, ".rotaris/sessions/x/state.json", '{"iteration": 2}\n')
    assert not any(entry.path.startswith(".rotaris") for entry in engine.diff_summary(checkpoint))

    engine.restore(checkpoint)

    assert (root / ".rotaris" / "sessions" / "x" / "state.json").read_text(
        encoding="utf-8"
    ) == '{"iteration": 2}\n'


@verifies(SWR.SWR_2436)
def test_checkpoint_is_skipped_when_the_tree_matches_head(tmp_path: Path) -> None:
    """Productive use: an iteration that changed nothing costs the user no ref growth.
    Expected outcome: create() reports no checkpoint and no ref appears."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, ".rotaris/sessions/x/state.json", "{}\n")
    _write(root, "build/artifact.bin", "binary\n")

    assert engine.create(session_id="sid", sequence=1, message="iteration 1") is None
    assert engine.list_refs("sid") == ()


@verifies(SWR.SWR_2436)
def test_checkpoint_without_untracked_capture_records_only_tracked_edits(tmp_path: Path) -> None:
    """Productive use: a user opts out of snapshotting scratch files.
    Expected outcome: tracked edits are captured and untracked files stay out of the tree."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    _write(root, "gamma.txt", "gamma v1\n")

    checkpoint = engine.create(
        session_id="sid", sequence=1, message="iteration 1", include_untracked=False
    )

    assert checkpoint is not None
    tracked = _git(root, "ls-tree", "-r", "--name-only", checkpoint.commit).split()
    assert "gamma.txt" not in tracked
    assert _git(root, "show", f"{checkpoint.commit}:alpha.txt") == "alpha v2\n"


@verifies(SWR.SWR_2436)
def test_changed_paths_reports_dirty_files_and_hides_control_data(tmp_path: Path) -> None:
    """Productive use: the session decides whether an iteration is worth checkpointing.
    Expected outcome: edited and new files are listed, ignored and .rotaris paths are not."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    _write(root, "gamma.txt", "gamma v1\n")
    _write(root, "build/artifact.bin", "binary\n")
    _write(root, ".rotaris/sessions/x/state.json", "{}\n")

    assert set(engine.changed_paths()) == {"alpha.txt", "gamma.txt"}


@verifies(SWR.SWR_2436)
def test_files_in_lists_the_paths_the_checkpoint_changed(tmp_path: Path) -> None:
    """Productive use: a user reviewing history sees which files an iteration touched.
    Expected outcome: files_in reports the modified and newly added paths."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    _write(root, "gamma.txt", "gamma v1\n")

    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")

    assert checkpoint is not None
    assert set(engine.files_in(checkpoint)) == {"alpha.txt", "gamma.txt"}


@verifies(SWR.SWR_2436, SWR.SWR_2437)
def test_restore_recovers_edits_and_removes_files_created_afterwards(tmp_path: Path) -> None:
    """Productive use: a user undoes an agent step that went wrong.
    Expected outcome: checkpointed contents come back and post-checkpoint files disappear."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")
    assert checkpoint is not None

    _write(root, "alpha.txt", "alpha v3\n")
    (root / "beta.txt").unlink()
    _write(root, "later.txt", "created after the checkpoint\n")

    touched = engine.restore(checkpoint)

    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / "beta.txt").read_text(encoding="utf-8") == "beta v1\n"
    assert not (root / "later.txt").exists()
    assert set(touched) == {"alpha.txt", "beta.txt", "later.txt"}


@verifies(SWR.SWR_2436, SWR.SWR_2437)
def test_restore_leaves_ignored_and_control_paths_alone(tmp_path: Path) -> None:
    """Productive use: a rollback does not throw away build output or session bookkeeping.
    Expected outcome: ignored files and .rotaris data survive a restore unchanged."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")
    assert checkpoint is not None

    _write(root, "alpha.txt", "alpha v3\n")
    _write(root, "build/artifact.bin", "binary\n")
    _write(root, ".rotaris/sessions/x/state.json", '{"iteration": 2}\n')

    engine.restore(checkpoint)

    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / "build" / "artifact.bin").read_text(encoding="utf-8") == "binary\n"
    assert (root / ".rotaris" / "sessions" / "x" / "state.json").read_text(
        encoding="utf-8"
    ) == '{"iteration": 2}\n'


@verifies(SWR.SWR_2436, SWR.SWR_2437)
def test_diff_summary_reports_added_modified_and_deleted_paths(tmp_path: Path) -> None:
    """Productive use: a user previews what a rollback would change before confirming.
    Expected outcome: every differing path is listed with its A/M/D status."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")
    assert checkpoint is None
    _write(root, "alpha.txt", "alpha v2\n")
    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")
    assert checkpoint is not None

    _write(root, "alpha.txt", "alpha v3\n")
    (root / "beta.txt").unlink()
    _write(root, "later.txt", "created after the checkpoint\n")

    summary = {entry.path: entry.status for entry in engine.diff_summary(checkpoint)}

    assert summary == {"alpha.txt": "M", "beta.txt": "D", "later.txt": "A"}


@verifies(SWR.SWR_2436)
def test_list_refs_orders_sequences_numerically(tmp_path: Path) -> None:
    """Productive use: a user browsing checkpoints sees iteration 10 after iteration 9.
    Expected outcome: list_refs returns ascending numeric sequences, not lexical ones."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    for sequence in (1, 2, 9, 10, 11):
        _write(root, "alpha.txt", f"alpha rev {sequence}\n")
        assert engine.create(session_id="sid", sequence=sequence, message=f"it {sequence}")

    assert [entry.sequence for entry in engine.list_refs("sid")] == [1, 2, 9, 10, 11]


@verifies(SWR.SWR_2436)
def test_list_refs_is_scoped_to_one_session(tmp_path: Path) -> None:
    """Productive use: parallel sessions never see each other's checkpoints.
    Expected outcome: a session id that prefixes another does not pick up its refs."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    assert engine.create(session_id="sid", sequence=1, message="one")
    _write(root, "alpha.txt", "alpha v3\n")
    assert engine.create(session_id="sid-other", sequence=1, message="two")

    assert [entry.session_id for entry in engine.list_refs("sid")] == ["sid"]
    assert [entry.session_id for entry in engine.list_refs("sid-other")] == ["sid-other"]


@verifies(SWR.SWR_2436, SWR.SWR_2437)
def test_resolve_finds_a_recorded_checkpoint_and_reports_missing_ones(tmp_path: Path) -> None:
    """Productive use: a rollback command addresses a checkpoint by iteration number.
    Expected outcome: a recorded sequence resolves to its commit, an unknown one to None."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")
    created = engine.create(session_id="sid", sequence=3, message="iteration 3")

    assert created is not None
    assert engine.resolve("sid", 3) == created
    assert engine.resolve("sid", 4) is None
    assert engine.resolve("unknown", 3) is None


@verifies(SWR.SWR_2436)
def test_prune_keeps_only_the_newest_checkpoints(tmp_path: Path) -> None:
    """Productive use: a long session does not grow refs without bound.
    Expected outcome: prune(keep=2) deletes the older refs and keeps the two newest."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    for sequence in (1, 2, 3, 4):
        _write(root, "alpha.txt", f"alpha rev {sequence}\n")
        assert engine.create(session_id="sid", sequence=sequence, message=f"it {sequence}")

    deleted = engine.prune("sid", keep=2)

    assert deleted == 2
    assert [entry.sequence for entry in engine.list_refs("sid")] == [3, 4]
    assert engine.prune("sid", keep=2) == 0


@verifies(SWR.SWR_2436)
def test_delete_all_clears_a_session_at_the_end_of_its_lifecycle(tmp_path: Path) -> None:
    """Productive use: finishing a session leaves no stray refs behind.
    Expected outcome: delete_all removes every checkpoint ref for that session."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    for sequence in (1, 2):
        _write(root, "alpha.txt", f"alpha rev {sequence}\n")
        assert engine.create(session_id="sid", sequence=sequence, message=f"it {sequence}")

    assert engine.delete_all("sid") == 2
    assert engine.list_refs("sid") == ()
    assert "refs/rotaris" not in _git(root, "for-each-ref", "--format=%(refname)")


@verifies(SWR.SWR_2436)
def test_engine_reports_unavailable_outside_a_repository(tmp_path: Path) -> None:
    """Productive use: a workspace without Git degrades to no checkpoints, not a crash.
    Expected outcome: available is False and does not raise."""
    plain = tmp_path / "plain"
    plain.mkdir()

    engine = CheckpointEngine(plain)

    assert engine.available is False
    assert CheckpointEngine(tmp_path / "missing").available is False


@verifies(SWR.SWR_2436)
def test_checkpoint_operations_outside_a_repository_raise_checkpoint_error(
    tmp_path: Path,
) -> None:
    """Productive use: a caller in a hot loop gets one predictable failure type to warn on.
    Expected outcome: create raises CheckpointError instead of leaking subprocess errors."""
    plain = tmp_path / "plain"
    plain.mkdir()
    engine = CheckpointEngine(plain)

    with pytest.raises(CheckpointError):
        engine.create(session_id="sid", sequence=1, message="iteration 1")


@verifies(SWR.SWR_2436)
def test_unsafe_session_ids_are_rejected_before_touching_git(tmp_path: Path) -> None:
    """Productive use: a malformed session id cannot forge a ref outside the namespace.
    Expected outcome: create raises CheckpointError for ids that are not ref-safe."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)

    with pytest.raises(CheckpointError):
        engine.create(session_id="../../evil", sequence=1, message="iteration 1")
    with pytest.raises(CheckpointError):
        engine.create(session_id="sid", sequence=-1, message="iteration 1")


@verifies(SWR.SWR_2436)
def test_checkpoints_work_on_a_detached_head(tmp_path: Path) -> None:
    """Productive use: a session started from a detached commit still gets checkpoints.
    Expected outcome: create and restore succeed without asserting a branch name."""
    root = _repository(tmp_path)
    _git(root, "checkout", "--detach", "HEAD")
    engine = CheckpointEngine(root)
    _write(root, "alpha.txt", "alpha v2\n")

    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")
    assert checkpoint is not None
    _write(root, "alpha.txt", "alpha v3\n")
    engine.restore(checkpoint)

    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"


@verifies(SWR.SWR_2436)
def test_checkpoints_work_inside_a_linked_worktree(tmp_path: Path) -> None:
    """Productive use: an isolated session worktree checkpoints like the base workspace.
    Expected outcome: the ref is recorded in the shared repository and restore works there."""
    root = _repository(tmp_path)
    linked = tmp_path / "linked"
    _git(root, "worktree", "add", "-b", "session", str(linked))
    engine = CheckpointEngine(linked)
    _write(linked, "alpha.txt", "alpha v2\n")

    checkpoint = engine.create(session_id="sid", sequence=1, message="iteration 1")
    assert checkpoint is not None
    _write(linked, "alpha.txt", "alpha v3\n")
    engine.restore(checkpoint)

    assert (linked / "alpha.txt").read_text(encoding="utf-8") == "alpha v2\n"
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha v1\n"


@verifies(SWR.SWR_2436, SWR.SWR_2437)
def test_two_iteration_session_rolls_back_to_the_first_checkpoint(tmp_path: Path) -> None:
    """Productive use: a user rolls a two-iteration session back to iteration one.
    Expected outcome: the tree matches iteration one while branch, HEAD, index and
    ignored artefacts are untouched."""
    root = _repository(tmp_path)
    engine = CheckpointEngine(root)
    assert engine.available is True
    start = _repo_fingerprint(root)
    index_before = _index_bytes(root)

    # Iteration 1: edit a tracked file, add a source file, drop build and control data.
    _write(root, "alpha.txt", "alpha iteration 1\n")
    _write(root, "gamma.txt", "gamma iteration 1\n")
    _write(root, "build/artifact.bin", "artifact bytes\n")
    _write(root, ".rotaris/sessions/x/state.json", '{"iteration": 1}\n')
    first = engine.create(session_id="20260808-market", sequence=1, message="iteration 1")
    assert first is not None

    # Iteration 2: delete a tracked file and add another one.
    (root / "beta.txt").unlink()
    _write(root, "delta.txt", "delta iteration 2\n")
    second = engine.create(session_id="20260808-market", sequence=2, message="iteration 2")
    assert second is not None
    assert [entry.sequence for entry in engine.list_refs("20260808-market")] == [1, 2]

    preview = {entry.path: entry.status for entry in engine.diff_summary(first)}
    assert preview == {"beta.txt": "D", "delta.txt": "A"}

    touched = engine.restore(first)

    # Only engine calls happened since index_before was captured.
    assert _index_bytes(root) == index_before
    assert (root / "alpha.txt").read_text(encoding="utf-8") == "alpha iteration 1\n"
    assert (root / "gamma.txt").read_text(encoding="utf-8") == "gamma iteration 1\n"
    assert (root / "beta.txt").read_text(encoding="utf-8") == "beta v1\n"
    assert not (root / "delta.txt").exists()
    assert (root / "build" / "artifact.bin").read_text(encoding="utf-8") == "artifact bytes\n"
    assert (root / ".rotaris" / "sessions" / "x" / "state.json").read_text(
        encoding="utf-8"
    ) == '{"iteration": 1}\n'
    assert set(touched) == {"beta.txt", "delta.txt"}

    after = _repo_fingerprint(root)
    assert after["head"] == start["head"]
    assert after["symbolic_head"] == start["symbolic_head"]
    assert after["branches"] == start["branches"]
    assert after["reflog"] == start["reflog"]
    # A separate clean check: nothing the engine did was ever staged for the user.
    staged = _git(root, "diff", "--cached", "--name-only")
    assert staged == ""
