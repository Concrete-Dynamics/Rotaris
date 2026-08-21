"""Session-level checkpoint policy against real Git repositories (SWR-2436)."""

from __future__ import annotations

import json
import subprocess
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoint_service import CheckpointService, load_checkpoints
from rotaris_core.session.checkpoints import CHECKPOINT_REF_PREFIX, CheckpointError
from rotaris_core.session.diagnostics import SessionDiagnostics
from rotaris_core.session.manager import SessionManager

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.session.state import SessionState

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


def _repository(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "alpha.txt").write_text("alpha v1\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


def _write(root: Path, relative: str, content: str) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def _ref_sequences(root: Path, session_id: str) -> list[int]:
    """Sequence numbers Git actually still holds refs for."""
    raw = _git(root, "for-each-ref", "--format=%(refname)", f"{CHECKPOINT_REF_PREFIX}/{session_id}")
    prefix = f"{CHECKPOINT_REF_PREFIX}/{session_id}/"
    return sorted(int(line[len(prefix) :]) for line in raw.split() if line.startswith(prefix))


def _issues(session_dir: Path, kind: str) -> list[dict[str, Any]]:
    path = session_dir / "issues.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [item for item in data.get("issues", []) if item.get("kind") == kind]


def _service(
    manager: SessionManager,
    state: SessionState,
    config: RotarisConfig,
    tree_root: Path,
    *,
    isolated: bool = False,
) -> CheckpointService:
    return CheckpointService(
        session_manager=manager,
        state=state,
        tree_root=tree_root,
        config=config,
        diagnostics=SessionDiagnostics(manager.session_dir(state.session_id), state.session_id),
        isolated=isolated,
    )


def _session(root: Path, config: RotarisConfig) -> tuple[SessionManager, SessionState]:
    manager = SessionManager(root)
    state = manager.create_session(config)
    return manager, state


@verifies(SWR.SWR_2436)
def test_an_isolated_session_checkpoints_without_being_configured(tmp_path: Path) -> None:
    """Productive use: a user starting a worktree-isolated run gets undo for free.
    Expected outcome: checkpointing is on without any configuration, because
    Rotaris owns the tree there."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(workspace_root=root)
    manager, state = _session(root, config)

    assert config.checkpoints.enabled is None
    assert _service(manager, state, config, root, isolated=True).enabled is True
    assert _service(manager, state, config, root, isolated=False).enabled is False


@verifies(SWR.SWR_2436)
def test_explicit_configuration_beats_the_isolation_default(tmp_path: Path) -> None:
    """Productive use: a user can turn checkpointing on in their own checkout, or
    off inside an isolated run.
    Expected outcome: an explicit setting decides, in both directions."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(workspace_root=root)
    manager, state = _session(root, config)

    config.checkpoints.enabled = True
    assert _service(manager, state, config, root, isolated=False).enabled is True

    config.checkpoints.enabled = False
    assert _service(manager, state, config, root, isolated=True).enabled is False


@verifies(SWR.SWR_2436)
def test_a_workspace_without_git_simply_has_no_checkpoints(tmp_path: Path) -> None:
    """Productive use: a user runs Rotaris in a plain directory that is not a repo.
    Expected outcome: checkpointing reports itself off instead of failing the run."""
    root = tmp_path / "plain"
    root.mkdir()
    config = RotarisConfig(workspace_root=root)
    config.checkpoints.enabled = True
    manager, state = _session(root, config)

    service = _service(manager, state, config, root, isolated=True)

    assert service.enabled is False
    assert service.capture(iteration=1) is None


@verifies(SWR.SWR_2436)
def test_capture_numbers_checkpoints_consecutively_from_one(tmp_path: Path) -> None:
    """Productive use: three iterations that each edit files leave three undo points.
    Expected outcome: sequences 1, 2 and 3 are recorded, each naming its own ref
    and the files it changed."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(workspace_root=root)
    manager, state = _session(root, config)
    service = _service(manager, state, config, root, isolated=True)

    for index in range(1, 4):
        _write(root, f"file-{index}.txt", f"iteration {index}\n")
        recorded = service.capture(iteration=index, child_name="worker")
        assert recorded is not None
        assert recorded.sequence == index
        assert recorded.iteration == index
        assert recorded.child_name == "worker"
        assert recorded.kind == "iteration"
        assert f"file-{index}.txt" in recorded.files

    assert [entry.sequence for entry in service.list_checkpoints()] == [1, 2, 3]
    assert _ref_sequences(root, state.session_id) == [1, 2, 3]


@verifies(SWR.SWR_2436)
def test_capture_on_an_unchanged_tree_records_nothing_and_reports_no_failure(
    tmp_path: Path,
) -> None:
    """Productive use: an iteration that only read files does not clutter the undo list.
    Expected outcome: no checkpoint is recorded and no warning is raised — nothing
    to undo is not a failure."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(workspace_root=root)
    manager, state = _session(root, config)
    service = _service(manager, state, config, root, isolated=True)

    assert service.capture(iteration=1) is None
    assert service.list_checkpoints() == ()
    assert _issues(manager.session_dir(state.session_id), "checkpoint") == []


@verifies(SWR.SWR_2436)
def test_a_git_failure_warns_instead_of_aborting_the_iteration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user whose repository Git refuses to snapshot still gets
    their iteration finished.
    Expected outcome: capture returns None and records a warning on the session
    rather than raising into the loop."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(workspace_root=root)
    manager, state = _session(root, config)
    service = _service(manager, state, config, root, isolated=True)
    _write(root, "alpha.txt", "alpha v2\n")

    def _boom(*_args: object, **_kwargs: object) -> None:
        raise CheckpointError("git refused to write the tree")

    monkeypatch.setattr(
        "rotaris_core.session.checkpoints.CheckpointEngine.create",
        _boom,
    )

    assert service.capture(iteration=4, child_name="worker") is None
    assert service.list_checkpoints() == ()

    warnings = _issues(manager.session_dir(state.session_id), "checkpoint")
    assert len(warnings) == 1
    assert warnings[0]["severity"] == "warning"
    assert "git refused to write the tree" in warnings[0]["message"]
    assert warnings[0]["metadata"]["iteration"] == 4


@verifies(SWR.SWR_2436)
def test_prune_drops_refs_and_recorded_checkpoints_together(tmp_path: Path) -> None:
    """Productive use: a long run does not accumulate checkpoint refs forever.
    Expected outcome: only the newest ``max_per_session`` checkpoints survive, and
    the recorded list never names a ref that Git has already dropped."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(workspace_root=root)
    config.checkpoints.max_per_session = 2
    manager, state = _session(root, config)
    service = _service(manager, state, config, root, isolated=True)

    for index in range(1, 5):
        _write(root, f"file-{index}.txt", f"iteration {index}\n")
        assert service.capture(iteration=index) is not None

    assert [entry.sequence for entry in service.list_checkpoints()] == [3, 4]
    assert _ref_sequences(root, state.session_id) == [3, 4]
    assert {entry.ref for entry in service.list_checkpoints()} == {
        f"{CHECKPOINT_REF_PREFIX}/{state.session_id}/3",
        f"{CHECKPOINT_REF_PREFIX}/{state.session_id}/4",
    }

    # A fifth capture must not reuse sequence 3: the number comes from the
    # highest ever recorded, not from how many survived the prune.
    _write(root, "file-5.txt", "iteration 5\n")
    fifth = service.capture(iteration=5)
    assert fifth is not None
    assert fifth.sequence == 5


@verifies(SWR.SWR_2436)
def test_discard_session_removes_every_checkpoint_ref(tmp_path: Path) -> None:
    """Productive use: deleting a session takes its checkpoint refs with it.
    Expected outcome: the ``refs/rotaris/`` namespace for that session is empty
    and the session no longer offers a rollback."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(workspace_root=root)
    manager, state = _session(root, config)
    service = _service(manager, state, config, root, isolated=True)

    for index in range(1, 4):
        _write(root, f"file-{index}.txt", f"iteration {index}\n")
        assert service.capture(iteration=index) is not None

    removed = service.discard_session()

    assert removed == 3
    assert service.list_checkpoints() == ()
    assert _ref_sequences(root, state.session_id) == []
    assert load_checkpoints(manager, state.session_id) == ()


@verifies(SWR.SWR_2436, SWR.SWR_2701)
def test_checkpoints_survive_a_resume_and_stay_within_the_retention_limit(
    tmp_path: Path,
) -> None:
    """Productive use: a user resumes yesterday's session and can still roll back
    the work it did.
    Expected outcome: the reloaded session lists the surviving checkpoints with
    their files and triggering child, the pruned ref is gone from Git, the session
    list reports how many are restorable, and the run config records the hook set
    that ran, with its command redacted."""
    root = _repository(tmp_path / "workspace")
    config = RotarisConfig(
        workspace_root=root,
        hooks={
            "entries": [
                {
                    "name": "notify",
                    "event": "iteration_end",
                    "command": "notify --token sk-live-abcdef1234567890",
                },
            ],
        },
    )
    config.checkpoints.max_per_session = 2
    manager, state = _session(root, config)
    session_id = state.session_id
    service = _service(manager, state, config, root, isolated=True)

    for index in range(1, 4):
        _write(root, f"file-{index}.txt", f"iteration {index}\n")
        assert service.capture(iteration=index, child_name="worker") is not None

    # Throw the live objects away: only what reached disk may answer from here.
    del service, state

    reloaded = SessionManager(root).load_session(session_id)
    restored = list(reloaded.checkpoints)

    assert [entry.sequence for entry in restored] == [2, 3]
    assert [entry.iteration for entry in restored] == [2, 3]
    assert {entry.child_name for entry in restored} == {"worker"}
    assert "file-3.txt" in restored[-1].files
    assert load_checkpoints(SessionManager(root), session_id) == tuple(restored)

    assert _ref_sequences(root, session_id) == [2, 3]

    listed = SessionManager(root).list_sessions()
    entry = next(item for item in listed if item["session_id"] == session_id)
    assert entry["checkpoint_count"] == 2

    run_config = json.loads(
        (manager.session_dir(session_id) / "state" / "run_config.json").read_text(encoding="utf-8"),
    )
    hooks = run_config["hooks"]
    assert [hook["event"] for hook in hooks] == ["iteration_end"]
    assert hooks[0]["name"] == "notify"
    assert hooks[0]["hook_id"] == "default:0:iteration_end"
    assert "sk-live-abcdef1234567890" not in hooks[0]["command"]
    assert "***" in hooks[0]["command"]
