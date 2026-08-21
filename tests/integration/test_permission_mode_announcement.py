"""Productive use: a run starts in a permissive permission mode on an unsandboxed host.
Expected outcome: the mode the run actually got is recorded in the session snapshot and
the downgrade is visible to the operator in the transcript and the session timeline."""

from __future__ import annotations

import datetime as dt
import json
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.permissions import (
    ApprovalHost,
    announce_effective_permission_mode,
    register_approval_host,
    reset_approval_registry,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.diagnostics import SessionDiagnostics
from rotaris_core.session.state import SessionState

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture(autouse=True)
def _clean_approval_registry() -> Iterator[None]:
    reset_approval_registry()
    yield
    reset_approval_registry()


def _config(workspace_root: Path, mode: str = "autonomous") -> RotarisConfig:
    persona = PersonaConfig(name="coder", model="small_model")
    config = RotarisConfig(
        personas={persona.name: persona},
        default_persona=persona.name,
        workspace_root=workspace_root,
    )
    config.runtime.permission_mode = mode
    return config


def _state(session_id: str, workspace_root: Path) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    return SessionState(
        session_id=session_id,
        workspace_root=str(workspace_root),
        created_at=now,
        updated_at=now,
        permission_mode="autonomous",
    )


def _timeline_events(session_dir: Path) -> list[dict[str, object]]:
    timeline = session_dir / "timeline.jsonl"
    if not timeline.exists():
        return []
    return [json.loads(line) for line in timeline.read_text(encoding="utf-8").splitlines() if line]


@verifies(SWR.SWR_2508)
def test_unattended_run_records_the_downgraded_mode_and_makes_it_visible(
    tmp_path: Path,
) -> None:
    session_dir = tmp_path / "session"
    session_dir.mkdir()
    diagnostics = SessionDiagnostics(session_dir)
    state = _state("session-unattended", tmp_path)
    # Only the headless lifecycle host is registered, exactly as the background
    # runner does before starting the loop.
    register_approval_host(state.session_id, ApprovalHost())

    effective = announce_effective_permission_mode(state, _config(tmp_path), diagnostics)

    assert effective.downgraded
    assert state.permission_mode == "ask"
    assert any(
        event.get("role") == "system" and "downgraded" in str(event.get("content"))
        for event in state.transcript_events
    )
    assert any(
        event.get("type") == "permission_mode_downgraded" for event in _timeline_events(session_dir)
    )


@verifies(SWR.SWR_2508)
def test_watched_run_keeps_autonomous_and_stays_silent(tmp_path: Path) -> None:
    session_dir = tmp_path / "session"
    session_dir.mkdir()
    diagnostics = SessionDiagnostics(session_dir)
    state = _state("session-watched", tmp_path)
    register_approval_host(state.session_id, ApprovalHost(present=lambda payload: None))

    effective = announce_effective_permission_mode(state, _config(tmp_path), diagnostics)

    assert not effective.downgraded
    assert state.permission_mode == "autonomous"
    assert state.transcript_events == []
    assert _timeline_events(session_dir) == []


@verifies(SWR.SWR_2508)
def test_workspace_opt_in_keeps_an_unattended_run_autonomous(tmp_path: Path) -> None:
    session_dir = tmp_path / "session"
    session_dir.mkdir()
    state = _state("session-opted-in", tmp_path)
    config = _config(tmp_path)
    config.runtime.allow_unsandboxed_autonomous = True

    effective = announce_effective_permission_mode(state, config, SessionDiagnostics(session_dir))

    assert not effective.downgraded
    assert state.permission_mode == "autonomous"
