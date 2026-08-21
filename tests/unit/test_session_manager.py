from __future__ import annotations

import json
import re
from unittest.mock import patch

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager


def _make_config(tmp_path) -> RotarisConfig:
    return RotarisConfig(workspace_root=tmp_path)


@verifies(SWR.SWR_1021, SWR.SWR_1024)
def test_create_session_generates_unique_session_id(tmp_path) -> None:
    manager = SessionManager(tmp_path)

    session_one = manager.create_session(_make_config(tmp_path))
    manager.release_lock(session_one.session_id)
    session_two = manager.create_session(_make_config(tmp_path))

    assert session_one.session_id != session_two.session_id
    pattern = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{12}$")
    assert pattern.match(session_one.session_id)
    assert pattern.match(session_two.session_id)


@verifies(SWR.SWR_1021, SWR.SWR_1024)
def test_create_session_saves_snapshot_and_acquires_lock(tmp_path) -> None:
    manager = SessionManager(tmp_path)

    state = manager.create_session(_make_config(tmp_path))

    session_dir = manager.sessions_dir / state.session_id
    assert (session_dir / "snapshot.json").exists()
    assert (session_dir / "metadata.json").exists()
    assert (session_dir / "lock").exists()


@verifies(SWR.SWR_1024)
def test_create_session_persists_config_snapshot(tmp_path) -> None:
    manager = SessionManager(tmp_path)

    state = manager.create_session(_make_config(tmp_path))

    saved = manager.load_session(state.session_id)

    assert saved.config_snapshot["workspace_root"] == str(tmp_path)
    assert saved.workspace_root == str(tmp_path)


@verifies(SWR.SWR_2503)
def test_create_session_records_the_effective_permission_mode(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    config = _make_config(tmp_path)
    config.runtime.permission_mode = "restricted"

    state = manager.create_session(config)

    assert state.permission_mode == "restricted"


@verifies(SWR.SWR_2503)
def test_create_session_uses_default_personas_override(tmp_path) -> None:
    from rotaris_core.config.schema import PersonaConfig

    manager = SessionManager(tmp_path)
    config = _make_config(tmp_path)
    config.runtime.permission_mode = "ask"
    config.personas[config.default_persona] = PersonaConfig(
        name=config.default_persona,
        model="small_model",
        permission_mode="autonomous",
    )

    state = manager.create_session(config)

    assert state.permission_mode == "autonomous"


@verifies(SWR.SWR_2601)
def test_create_session_records_the_configured_check_suite(tmp_path) -> None:
    from rotaris_core.config.schema import CheckConfig

    manager = SessionManager(tmp_path)
    config = _make_config(tmp_path)
    config.verifier.checks = [CheckConfig(name="pytest", command="uv run pytest -q")]

    state = manager.create_session(config)

    assert state.check_suite is not None
    assert state.check_suite.source == "config"
    assert [check.name for check in state.check_suite.checks] == ["pytest"]


@verifies(SWR.SWR_2601)
def test_create_session_records_a_detected_check_suite(tmp_path) -> None:
    (tmp_path / "pyproject.toml").write_text("[tool.mypy]\n", encoding="utf-8")
    manager = SessionManager(tmp_path)

    state = manager.create_session(_make_config(tmp_path))

    assert state.check_suite is not None
    assert state.check_suite.source == "detected"
    assert state.check_suite.detections == ["pyproject.toml:mypy"]


@verifies(SWR.SWR_2601)
def test_the_check_suite_survives_a_snapshot_round_trip(tmp_path) -> None:
    from rotaris_core.config.schema import CheckConfig

    manager = SessionManager(tmp_path)
    config = _make_config(tmp_path)
    config.verifier.checks = [
        CheckConfig(name="ruff", command="uv run ruff check .", severity="advisory"),
    ]

    state = manager.create_session(config)
    saved = manager.load_session(state.session_id)

    assert saved.check_suite is not None
    assert saved.check_suite.checks[0].severity == "advisory"


@verifies(SWR.SWR_2601)
def test_a_snapshot_without_a_check_suite_stays_loadable(tmp_path) -> None:
    """Pre-SWR-2601 snapshots carry no ``check_suite`` and must still load."""
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))
    snapshot_path = manager.session_dir(state.session_id) / "state" / "resume.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    snapshot.pop("check_suite", None)
    snapshot_path.write_text(json.dumps(snapshot), encoding="utf-8")

    saved = manager.load_session(state.session_id)

    assert saved.check_suite is None


@verifies(SWR.SWR_1024)
def test_save_session_updates_updated_at(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))
    original_updated_at = state.updated_at

    state.execution_status = "running"
    manager.save_session(state)

    assert state.updated_at >= original_updated_at
    assert manager.load_session(state.session_id).execution_status == "running"


@verifies(SWR.SWR_1022, SWR.SWR_1028)
def test_load_session_returns_saved_state(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    created = manager.create_session(_make_config(tmp_path))

    loaded = manager.load_session(created.session_id)

    assert loaded.session_id == created.session_id
    assert loaded.workspace_root == str(tmp_path)
    assert loaded.created_at == created.created_at


@verifies(SWR.SWR_1028)
def test_read_session_snapshot_skips_run_open_repairs(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    created = manager.create_session(_make_config(tmp_path))

    with patch.object(manager, "_repair_reasoning_content_on_load") as repair:
        read = manager.read_session_snapshot(created.session_id)
        loaded = manager.load_session(created.session_id)

    assert read.session_id == created.session_id
    assert loaded.session_id == created.session_id
    repair.assert_called_once_with(created.session_id, loaded)


@verifies(SWR.SWR_1023)
def test_list_sessions_returns_all_sessions(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    first = manager.create_session(_make_config(tmp_path))
    manager.release_lock(first.session_id)
    second = manager.create_session(_make_config(tmp_path))

    sessions = manager.list_sessions()
    session_ids = [session["session_id"] for session in sessions]

    assert session_ids == [second.session_id, first.session_id]


@verifies(SWR.SWR_1023)
def test_list_sessions_returns_empty_list_when_no_sessions(tmp_path) -> None:
    manager = SessionManager(tmp_path)

    assert manager.list_sessions() == []


@verifies(SWR.SWR_1021)
def test_acquire_release_lock_cycle(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))

    assert manager.acquire_lock(state.session_id) is False
    manager.release_lock(state.session_id)
    assert manager.acquire_lock(state.session_id) is True


@verifies(SWR.SWR_1022)
def test_load_nonexistent_session_raises_file_not_found(tmp_path) -> None:
    manager = SessionManager(tmp_path)

    with pytest.raises(FileNotFoundError):
        manager.load_session("missing-session")


@verifies(SWR.SWR_1021)
def test_list_sessions_skips_corrupt_metadata(tmp_path) -> None:
    """Productive use: users can browse sessions when one metadata file is corrupt.
    Expected outcome: valid sessions retain their complete list metadata.
    """
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))

    bad_dir = manager.sessions_dir / "broken-session"
    bad_dir.mkdir(parents=True)
    (bad_dir / "metadata.json").write_text("not-json", encoding="utf-8")

    sessions = manager.list_sessions()

    assert sessions == [
        {
            "session_id": state.session_id,
            "created_at": state.created_at.isoformat(),
            "updated_at": state.updated_at.isoformat(),
            "execution_status": "idle",
            "schema_version": state.schema_version,
            "internal": False,
            "worktree": None,
            "checkpoint_count": 0,
            "task_title": "",
            "requirement_id": "",
            "unit_id": "",
            # A fresh session is blocked on nobody (SWR-3623). Asserted here with
            # the rest of the shape on purpose: this list is what every session
            # surface reads, so a key that stops being written is a surface that
            # silently stops saying something.
            "awaiting_input": False,
        },
    ]


@verifies(SWR.SWR_1021)
def test_lock_file_contains_process_metadata(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))

    lock_path = manager.sessions_dir / state.session_id / "lock"
    lock_payload = json.loads(lock_path.read_text(encoding="utf-8"))

    assert isinstance(lock_payload["pid"], int)
    assert isinstance(lock_payload["acquired_at"], str)


@verifies(SWR.SWR_454)
def test_create_session_clears_agents_md_cache(tmp_path) -> None:
    manager = SessionManager(tmp_path)

    with patch("rotaris_core.agents.agents_md_loader.clear_agents_md_cache") as clear_cache:
        manager.create_session(_make_config(tmp_path))

    clear_cache.assert_called_once_with()


@verifies(SWR.SWR_2907)
def test_saved_metadata_carries_the_latest_top_level_task_title(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))
    state.todo_state = {
        "phases": [
            {
                "name": "main",
                "tasks": [
                    {"name": "Earlier request"},
                    {"name": "Fixing requirement foobar"},
                ],
            }
        ]
    }
    manager.save_session(state)

    entry = next(item for item in manager.list_sessions() if item["session_id"] == state.session_id)
    assert entry["task_title"] == "Fixing requirement foobar"


@verifies(SWR.SWR_3612)
def test_a_requirement_started_session_says_which_requirement_and_unit_it_is_for(
    tmp_path,
) -> None:
    """The way back from a run to the requirement that asked for it (SWR-3612).

    ``list_sessions`` reads ``metadata.json`` and nothing else, so this is the
    only place the attribution can reach a session list from.
    """
    manager = SessionManager(tmp_path)
    state = manager.create_session(
        _make_config(tmp_path),
        requirement_id="SWR-3412",
        unit_id="unit-2",
    )

    assert state.requirement_id == "SWR-3412"
    assert state.unit_id == "unit-2"

    entry = next(item for item in manager.list_sessions() if item["session_id"] == state.session_id)
    assert entry["requirement_id"] == "SWR-3412"
    assert entry["unit_id"] == "unit-2"


@verifies(SWR.SWR_3612)
def test_a_session_a_human_started_claims_no_requirement(tmp_path) -> None:
    """Empty is the truth about a hand-started run, not a placeholder."""
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))

    entry = next(item for item in manager.list_sessions() if item["session_id"] == state.session_id)
    assert entry["requirement_id"] == ""
    assert entry["unit_id"] == ""


@verifies(SWR.SWR_2907)
def test_a_session_without_tasks_lists_an_empty_task_title(tmp_path) -> None:
    manager = SessionManager(tmp_path)
    state = manager.create_session(_make_config(tmp_path))

    entry = next(item for item in manager.list_sessions() if item["session_id"] == state.session_id)
    assert entry["task_title"] == ""


@verifies(SWR.SWR_2907)
def test_session_task_title_skips_blank_names_and_empty_phases() -> None:
    from rotaris_core.session.task_context import session_task_title

    assert session_task_title(None) == ""
    assert session_task_title({"phases": []}) == ""
    assert session_task_title({"phases": [{"tasks": [{"name": "  "}]}]}) == ""
    assert (
        session_task_title({"phases": [{"tasks": []}, {"tasks": [{"name": "agent work"}]}]})
        == "agent work"
    )
