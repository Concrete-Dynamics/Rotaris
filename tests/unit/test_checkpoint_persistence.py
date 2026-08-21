"""Checkpoints on the persisted session snapshot (SWR-2436, SWR-2701)."""

from __future__ import annotations

import datetime as dt
import json
import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.checkpoints import CheckpointEngine
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.state import SessionCheckpoint

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _checkpoint(sequence: int, **overrides: object) -> SessionCheckpoint:
    payload: dict[str, object] = {
        "sequence": sequence,
        "ref": f"refs/rotaris/checkpoints/session/{sequence}",
        "commit": f"{sequence:040d}",
        "created_at": dt.datetime(2026, 8, 8, 12, sequence, tzinfo=dt.UTC),
        "iteration": sequence,
        "child_name": "worker",
        "files": [f"file-{sequence}.txt"],
    }
    payload.update(overrides)
    return SessionCheckpoint.model_validate(payload)


@verifies(SWR.SWR_2436)
def test_recorded_checkpoints_reload_with_the_session(tmp_path: Path) -> None:
    """Productive use: a user reopens a session and still sees every undo point it
    recorded.
    Expected outcome: sequence, ref, commit, iteration, child and file list all
    survive the round trip to disk."""
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))
    state.checkpoints.append(_checkpoint(1))
    state.checkpoints.append(_checkpoint(2, kind="pre_restore", child_name=""))
    manager.flush_session(state)

    reloaded = SessionManager(tmp_path).load_session(state.session_id)

    assert [entry.sequence for entry in reloaded.checkpoints] == [1, 2]
    assert reloaded.checkpoints[0].ref == "refs/rotaris/checkpoints/session/1"
    assert reloaded.checkpoints[0].commit == f"{1:040d}"
    assert reloaded.checkpoints[0].iteration == 1
    assert reloaded.checkpoints[0].child_name == "worker"
    assert reloaded.checkpoints[0].files == ["file-1.txt"]
    assert reloaded.checkpoints[0].kind == "iteration"
    assert reloaded.checkpoints[1].kind == "pre_restore"
    assert reloaded.checkpoints[1].child_name == ""


@verifies(SWR.SWR_2436)
def test_a_session_saved_before_checkpoints_existed_still_opens(tmp_path: Path) -> None:
    """Productive use: a user resumes a session recorded by an older Rotaris.
    Expected outcome: the snapshot loads, reports no checkpoints, and still shows
    up in the session list."""
    manager = SessionManager(tmp_path)
    session_id = "20260101-000000-oldsession"
    session_dir = manager.session_dir(session_id)
    (session_dir / "state").mkdir(parents=True)
    # Hand-written on purpose: round-tripping the current model could never
    # produce a snapshot that predates the field being added.
    (session_dir / "state" / "resume.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "session_id": session_id,
                "workspace_root": str(tmp_path),
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (session_dir / "metadata.json").write_text(
        json.dumps(
            {
                "session_id": session_id,
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
                "execution_status": "idle",
                "schema_version": 1,
                "internal": False,
                "worktree": None,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    state = manager.load_session(session_id)

    assert state.checkpoints == []
    listed = manager.list_sessions()
    entry = next(item for item in listed if item["session_id"] == session_id)
    assert entry.get("checkpoint_count", 0) == 0


@verifies(SWR.SWR_2436)
def test_session_metadata_reports_how_many_checkpoints_are_restorable(tmp_path: Path) -> None:
    """Productive use: a session list can mark the sessions that can be rolled
    back without opening any of them.
    Expected outcome: ``metadata.json`` — the only file the listing reads —
    carries the checkpoint count."""
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))

    metadata_path = manager.session_dir(state.session_id) / "metadata.json"
    assert json.loads(metadata_path.read_text(encoding="utf-8"))["checkpoint_count"] == 0

    state.checkpoints.extend([_checkpoint(1), _checkpoint(2), _checkpoint(3)])
    manager.flush_session(state)

    assert json.loads(metadata_path.read_text(encoding="utf-8"))["checkpoint_count"] == 3
    listed = manager.list_sessions()
    entry = next(item for item in listed if item["session_id"] == state.session_id)
    assert entry["checkpoint_count"] == 3


@verifies(SWR.SWR_2701)
def test_the_run_config_records_the_effective_hook_set_with_redacted_commands(
    tmp_path: Path,
) -> None:
    """Productive use: someone auditing a finished session can see which hooks that
    run was allowed to execute.
    Expected outcome: ``state/run_config.json`` names every enabled hook with its
    stable id, event, matcher and source, and its command with secrets masked."""
    manager = SessionManager(tmp_path)
    config = RotarisConfig(
        workspace_root=tmp_path,
        hooks={
            "entries": [
                {
                    "name": "guard",
                    "event": "pre_tool",
                    "matcher": "git push *",
                    "command": "audit --token sk-live-abcdef1234567890",
                },
                {
                    "name": "silenced",
                    "event": "session_end",
                    "command": "echo done",
                    "enabled": False,
                },
            ],
        },
    )

    state = manager.create_session(config)

    payload = json.loads(
        (manager.session_dir(state.session_id) / "state" / "run_config.json").read_text(
            encoding="utf-8",
        ),
    )
    hooks = payload["hooks"]

    assert [hook["name"] for hook in hooks] == ["guard"]
    assert hooks[0]["hook_id"] == "default:0:pre_tool"
    assert hooks[0]["event"] == "pre_tool"
    assert hooks[0]["matcher"] == "git push *"
    assert hooks[0]["source"] == "default"
    assert "sk-live-abcdef1234567890" not in hooks[0]["command"]
    assert hooks[0]["command"].startswith("audit --token ")


@verifies(SWR.SWR_2701)
def test_a_session_without_hooks_records_an_empty_hook_set(tmp_path: Path) -> None:
    """Productive use: an auditor can tell "no hooks ran" apart from "not recorded".
    Expected outcome: the run config carries an explicit empty hook list."""
    manager = SessionManager(tmp_path)

    state = manager.create_session(RotarisConfig(workspace_root=tmp_path))

    payload = json.loads(
        (manager.session_dir(state.session_id) / "state" / "run_config.json").read_text(
            encoding="utf-8",
        ),
    )

    assert payload["hooks"] == []


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(  # noqa: S603
        ["git", *args],  # noqa: S607
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _repository(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "user.email", "test@example.com")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "base.txt").write_text("one\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "-m", "initial")
    return root


@verifies(SWR.SWR_2436)
def test_deleting_a_session_also_removes_its_checkpoint_refs(tmp_path: Path) -> None:
    """Productive use: a user deletes an old session and reclaims everything it held.
    Expected outcome: the session's checkpoint refs are gone too, so `refs/rotaris/`
    cannot grow without bound as sessions come and go."""
    root = _repository(tmp_path)
    manager = SessionManager(root)
    state = manager.create_session(RotarisConfig(workspace_root=root))
    engine = CheckpointEngine(root)

    (root / "base.txt").write_text("two\n", encoding="utf-8")
    checkpoint = engine.create(session_id=state.session_id, sequence=1, message="iteration 1")
    assert checkpoint is not None
    assert engine.list_refs(state.session_id)

    manager.persistence.delete_session(state.session_id)

    assert engine.list_refs(state.session_id) == ()
    assert checkpoint.ref not in _git(root, "show-ref")
    # The user's own history is untouched by the cleanup.
    assert _git(root, "symbolic-ref", "HEAD").strip() == "refs/heads/main"


@verifies(SWR.SWR_2436)
def test_a_session_in_a_vanished_workspace_still_deletes(tmp_path: Path) -> None:
    """Productive use: a user deletes a session whose workspace has since been moved
    or removed.
    Expected outcome: the session directory goes away regardless; ref cleanup is
    best-effort and never blocks the delete."""
    manager = SessionManager(tmp_path)
    state = manager.create_session(RotarisConfig(workspace_root=tmp_path / "gone"))

    manager.persistence.delete_session(state.session_id)

    assert not manager.session_dir(state.session_id).exists()
