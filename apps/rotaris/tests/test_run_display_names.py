"""Productive use: a user identifies runs by what they do, not by machine ids.
Expected outcome: run rows are named from the task — from the prompt the moment a
run starts, from persisted metadata afterwards — and only title-less sessions
fall back to their session id."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from fakes import FakeCoordinatorBridge, FakeRunConfigService
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import SessionInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_coordinator import RunCoordinator

pytestmark = pytest.mark.integration


class _StubSessionManager:
    def __init__(self, items: list[dict[str, Any]]) -> None:
        self._items = items

    def list_sessions(self) -> list[dict[str, Any]]:
        return self._items


def _metadata(session_id: str, **extra: Any) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "updated_at": dt.datetime.now(dt.UTC).isoformat(),
        "execution_status": "completed",
        **extra,
    }


def _refresh(store: WorkspaceStore, items: list[dict[str, Any]], tmp_path: Any) -> None:
    service = ConfigService(tmp_path, store)
    service.session_manager = _StubSessionManager(items)
    service.refresh_sessions()


@verifies(SWR.SWR_2907)
def test_a_starting_run_row_is_labeled_by_its_prompt(tmp_path, qtbot) -> None:
    store = WorkspaceStore()
    handles: list[FakeCoordinatorBridge] = []

    def factory() -> Any:
        handle = FakeCoordinatorBridge()
        handles.append(handle)
        return handle

    coordinator = RunCoordinator(tmp_path, store, FakeRunConfigService(), bridge_factory=factory)
    session_id = coordinator.launch_new("Fix the login token refresh bug")

    row = next(session for session in store.sessions if session.id == session_id)
    assert row.name == "Fix the login token refresh bug"
    assert row.name != session_id


@verifies(SWR.SWR_2907)
def test_a_long_prompt_is_compacted_into_a_single_line_title(tmp_path, qtbot) -> None:
    store = WorkspaceStore()
    coordinator = RunCoordinator(
        tmp_path, store, FakeRunConfigService(), bridge_factory=FakeCoordinatorBridge
    )
    prompt = "Refactor   the \n session listing so that " + "details " * 30
    session_id = coordinator.launch_new(prompt)

    row = next(session for session in store.sessions if session.id == session_id)
    assert "\n" not in row.name
    assert len(row.name) <= 80
    assert row.name.endswith("...")


@verifies(SWR.SWR_2907)
def test_refreshed_sessions_are_named_from_metadata_titles(tmp_path) -> None:
    store = WorkspaceStore()
    _refresh(
        store,
        [
            _metadata("20260810-121200-aaaaaaaaaaaa", task_title="Fixing requirement foobar"),
            _metadata("20260810-121300-bbbbbbbbbbbb"),
        ],
        tmp_path,
    )

    names = {session.id: session.name for session in store.sessions}
    assert names["20260810-121200-aaaaaaaaaaaa"] == "Fixing requirement foobar"
    # Pre-title metadata falls back to the session id — the row never renders blank.
    assert names["20260810-121300-bbbbbbbbbbbb"] == "20260810-121300-bbbbbbbbbbbb"


@verifies(SWR.SWR_2907)
def test_a_prompt_label_survives_a_refresh_against_titleless_metadata(tmp_path) -> None:
    store = WorkspaceStore()
    session_id = "20260810-121400-cccccccccccc"
    store.upsert_session(SessionInfo(id=session_id, name="Fix the login bug", status="starting"))

    _refresh(store, [_metadata(session_id, execution_status="running")], tmp_path)

    row = next(session for session in store.sessions if session.id == session_id)
    assert row.name == "Fix the login bug"
