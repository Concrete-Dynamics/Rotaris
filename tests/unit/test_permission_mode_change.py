"""Productive use: a user watching a run decides the agents need a tighter (or
looser) leash and changes the permission mode without restarting.
Expected outcome: the running agents are judged under the new mode from their
next tool call, agents spawned later start in it too, personas pinned to a mode
keep theirs, and the change is written into the run's audit trail."""

from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.core.path_auth import PathAuth
from rotaris_core.permissions import (
    ApprovalHost,
    Decision,
    PermissionEngine,
    PermissionRequest,
    change_session_permission_mode,
    discard_session_mode_override,
    engines_for_session,
    register_approval_host,
    register_audit_session,
    register_permission_engine,
    reset_approval_registry,
    reset_audit_registry,
    reset_permission_registry,
    reset_session_mode_overrides,
    resolve_preset,
    session_mode_override,
    set_session_mode_override,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import build_metrics, evidence_dir
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture(autouse=True)
def _clean_registries() -> Iterator[None]:
    for reset in (
        reset_approval_registry,
        reset_audit_registry,
        reset_permission_registry,
        reset_session_mode_overrides,
    ):
        reset()
    yield
    for reset in (
        reset_approval_registry,
        reset_audit_registry,
        reset_permission_registry,
        reset_session_mode_overrides,
    ):
        reset()


def _config(workspace: Path, mode: str = "restricted") -> RotarisConfig:
    config = RotarisConfig(workspace_root=workspace)
    config.runtime.permission_mode = mode
    return config


def _watched(session_id: str) -> None:
    """Register a host that can present a prompt — a human is watching."""
    register_approval_host(session_id, ApprovalHost(present=lambda payload: None))


def _engine(workspace: Path, persona: str, mode: str = "restricted") -> PermissionEngine:
    return PermissionEngine(
        policy=resolve_preset(mode),
        path_auth=PathAuth(workspace, allow_outside=False),
        persona=persona,
    )


def _write_request(workspace: Path, persona: str = "coder") -> PermissionRequest:
    return PermissionRequest(
        tool_name="FileEditorTool",
        persona=persona,
        arguments={"path": str(workspace / "notes.md")},
    )


@verifies(SWR.SWR_2503)
def test_a_live_engine_judges_the_next_call_under_the_new_mode(tmp_path: Path) -> None:
    config = _config(tmp_path)
    _watched("s-1")
    engine = _engine(tmp_path, "coder")
    register_permission_engine("s-1/coder", engine)
    request = _write_request(tmp_path)
    assert engine.resolve(request).decision is Decision.DENY

    change_session_permission_mode("s-1", "autonomous", config=config)

    assert engine.resolve(request).decision is Decision.ALLOW


@verifies(SWR.SWR_2503)
def test_another_sessions_engines_are_left_alone(tmp_path: Path) -> None:
    config = _config(tmp_path)
    _watched("s-1")
    mine, theirs = _engine(tmp_path, "coder"), _engine(tmp_path, "coder")
    register_permission_engine("s-1/coder", mine)
    register_permission_engine("s-2/coder", theirs)

    change_session_permission_mode("s-1", "autonomous", config=config)

    assert mine.policy.preset_name == "autonomous"
    assert theirs.policy.preset_name == "restricted"


@verifies(SWR.SWR_2503)
def test_engines_for_session_matches_only_that_sessions_binding_keys(tmp_path: Path) -> None:
    register_permission_engine("s-1/coder", _engine(tmp_path, "coder"))
    register_permission_engine("s-1/reviewer", _engine(tmp_path, "reviewer"))
    register_permission_engine("s-10/coder", _engine(tmp_path, "coder"))
    register_permission_engine("entry", _engine(tmp_path, "coder"))

    assert set(engines_for_session("s-1")) == {"s-1/coder", "s-1/reviewer"}
    assert engines_for_session("") == {}


@verifies(SWR.SWR_2503)
def test_a_persona_pinned_to_a_mode_keeps_it(tmp_path: Path) -> None:
    config = _config(tmp_path)
    config.personas["reviewer"] = PersonaConfig(
        name="reviewer",
        model="small_model",
        permission_mode="restricted",
    )
    _watched("s-1")
    free, pinned = _engine(tmp_path, "coder"), _engine(tmp_path, "reviewer")
    register_permission_engine("s-1/coder", free)
    register_permission_engine("s-1/reviewer", pinned)

    change_session_permission_mode("s-1", "autonomous", config=config)

    assert free.policy.preset_name == "autonomous"
    assert pinned.policy.preset_name == "restricted"


@verifies(SWR.SWR_2508)
def test_switching_to_autonomous_unattended_is_still_downgraded(tmp_path: Path) -> None:
    config = _config(tmp_path)
    engine = _engine(tmp_path, "coder")
    register_permission_engine("s-1/coder", engine)

    effective = change_session_permission_mode("s-1", "autonomous", config=config)

    assert effective.downgraded
    assert effective.mode == "ask"
    assert engine.policy.preset_name == "ask"


@verifies(SWR.SWR_2508)
def test_switching_to_autonomous_is_kept_when_someone_can_approve(tmp_path: Path) -> None:
    config = _config(tmp_path)
    _watched("s-1")

    effective = change_session_permission_mode("s-1", "autonomous", config=config)

    assert not effective.downgraded
    assert effective.mode == "autonomous"


@verifies(SWR.SWR_2503)
def test_the_override_carries_the_request_so_later_agents_re_resolve_it(tmp_path: Path) -> None:
    """The stored name is what was asked for, not the downgraded outcome — a
    later agent may be built in a context where the downgrade no longer applies."""
    config = _config(tmp_path)

    change_session_permission_mode("s-1", "autonomous", config=config)

    assert session_mode_override("s-1") == "autonomous"


@verifies(SWR.SWR_2503)
def test_an_override_is_scoped_to_its_session_and_discardable() -> None:
    set_session_mode_override("s-1", "autonomous")

    assert session_mode_override("s-1") == "autonomous"
    assert session_mode_override("s-2") is None
    assert session_mode_override(None) is None

    discard_session_mode_override("s-1")
    assert session_mode_override("s-1") is None


@verifies(SWR.SWR_2503)
def test_a_change_with_nothing_registered_still_reports_the_new_mode(tmp_path: Path) -> None:
    """No engines, no audit session, no approval host — a mode change during
    bootstrap must not raise into the caller's UI thread."""
    effective = change_session_permission_mode("s-1", "restricted", config=_config(tmp_path))

    assert effective.mode == "restricted"


@verifies(SWR.SWR_2506)
def test_the_change_is_written_to_the_sessions_audit_log(tmp_path: Path) -> None:
    config = _config(tmp_path, mode="ask")
    session_dir = tmp_path / "sessions" / "s-1"
    evidence_dir(session_dir).mkdir(parents=True)
    register_audit_session("s-1", session_dir)
    _watched("s-1")

    change_session_permission_mode("s-1", "autonomous", config=config)

    lines = (evidence_dir(session_dir) / "permissions.jsonl").read_text(encoding="utf-8")
    entry = json.loads(lines.strip().splitlines()[-1])
    assert entry["event"] == "permission_mode_change"
    assert entry["previous_mode"] == "ask"
    assert entry["requested_mode"] == "autonomous"
    assert entry["effective_mode"] == "autonomous"


@verifies(SWR.SWR_2506)
def test_mode_changes_are_counted_apart_from_decisions(tmp_path: Path) -> None:
    """The change shares permissions.jsonl with the decisions; it must not be
    counted as one, or the denial metrics stop meaning anything."""
    config = _config(tmp_path, mode="ask")
    session_dir = tmp_path / "sessions" / "s-1"
    evidence_dir(session_dir).mkdir(parents=True)
    register_audit_session("s-1", session_dir)
    _watched("s-1")

    change_session_permission_mode("s-1", "restricted", config=config)
    now = dt.datetime.now(dt.UTC)
    state = SessionState(
        session_id="s-1",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
    )
    metrics = build_metrics(state, session_dir)

    assert metrics["permission_mode_changes"] == 1
    assert metrics["permission_decision_records"] == 0
    assert metrics["permissions_by_decision"] == {}
