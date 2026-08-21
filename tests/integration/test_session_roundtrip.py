from __future__ import annotations

import datetime as dt
import json

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from rotaris_core.session.persistence import SessionPersistence


def _make_config(tmp_path) -> RotarisConfig:
    return RotarisConfig(workspace_root=tmp_path)


@verifies(SWR.SWR_1025)
def test_session_manager_import_does_not_trigger_improvement_persistence_cycle() -> None:
    from rotaris_core.session.manager import SessionManager as ImportedSessionManager

    assert ImportedSessionManager is SessionManager


@verifies(SWR.SWR_1024, SWR.SWR_1025, SWR.SWR_1028)
def test_full_roundtrip_create_save_load_verify_all_fields(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))
    now = dt.datetime.now(dt.UTC)

    state.transcript_events = [{"role": "assistant", "content": "done"}]
    state.ui_edit_diffs = [{"diff_id": "diff-1", "path": "src/app.py"}]
    state.child_states = [{"name": "child-1", "state": "succeeded"}]
    state.report_artifacts = [{"agent_name": "child-1", "status": "succeeded"}]
    state.todo_state = {"phases": [{"name": "phase-1"}]}
    state.ralph_progress = {
        "session_id": state.session_id,
        "started_at": now.isoformat(),
        "iterations": [],
    }
    state.execution_status = "paused"
    manager.save_session(state)

    loaded = manager.load_session(state.session_id)

    assert loaded.session_id == state.session_id
    assert loaded.config_snapshot == state.config_snapshot
    assert loaded.transcript_events == state.transcript_events
    assert loaded.ui_edit_diffs == state.ui_edit_diffs
    assert loaded.child_states == state.child_states
    assert loaded.report_artifacts == state.report_artifacts
    assert loaded.todo_state == state.todo_state
    assert loaded.ralph_progress == state.ralph_progress
    assert loaded.execution_status == "paused"


@verifies(SWR.SWR_1021, SWR.SWR_1028)
def test_resume_session_after_releasing_and_reacquiring_lock(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    created = manager.create_session(_make_config(tmp_path))
    created.execution_status = "running"
    manager.save_session(created)
    manager.release_lock(created.session_id)

    resumed = manager.load_session(created.session_id)
    assert manager.acquire_lock(resumed.session_id) is True

    resumed.execution_status = "completed"
    resumed.transcript_events.append({"role": "system", "content": "resumed"})
    manager.save_session(resumed)

    loaded = manager.load_session(resumed.session_id)
    assert loaded.execution_status == "completed"
    assert loaded.transcript_events == [{"role": "system", "content": "resumed"}]


@verifies(SWR.SWR_1021)
def test_stale_lock_recovery_succeeds(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))
    manager.release_lock(state.session_id)

    lock_path = manager.sessions_dir / state.session_id / "lock"
    lock_path.write_text(
        json.dumps({"pid": 999_999_999, "acquired_at": "2026-01-01T00:00:00Z"}),
        encoding="utf-8",
    )

    assert manager.acquire_lock(state.session_id) is True


@verifies(SWR.SWR_1023)
def test_list_sessions_after_creating_multiple(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    first = manager.create_session(_make_config(tmp_path))
    manager.release_lock(first.session_id)
    second = manager.create_session(_make_config(tmp_path))
    manager.release_lock(second.session_id)
    third = manager.create_session(_make_config(tmp_path))

    sessions = manager.list_sessions()

    assert [session["session_id"] for session in sessions] == [
        third.session_id,
        second.session_id,
        first.session_id,
    ]


@verifies(SWR.SWR_1025)
def test_delete_session_removes_directory(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))

    manager.persistence.delete_session(state.session_id)

    assert not (manager.sessions_dir / state.session_id).exists()


@verifies(SWR.SWR_1025, SWR.SWR_1027)
def test_schema_version_validation_rejects_future_version(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))
    snapshot_path = manager.sessions_dir / state.session_id / "state" / "resume.json"

    payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    payload["schema_version"] = 999
    snapshot_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    with pytest.raises(ValueError, match="Unsupported session schema version"):
        manager.load_session(state.session_id)


@verifies(SWR.SWR_1025)
def test_persistence_delete_missing_session_is_noop(tmp_path) -> None:
    persistence = SessionPersistence(tmp_path / ".rotaris" / "sessions")

    persistence.delete_session("missing-session")

    assert not persistence.session_dir("missing-session").exists()
