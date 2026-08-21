"""E2E wiring tests for live active-tool tracking and session artifacts.

Same philosophy as test_run_wiring_e2e: drive the real observer with real SDK
events, persist through the real SessionManager/SessionArtifactStore, reload
through ConfigService, and assert what the widgets would render.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from PySide6.QtWidgets import QLabel
from rotaris_core.orchestrator.artifacts import SessionArtifactStore
from rotaris_core.reqtocode import SWR, verifies
from run_wiring import (
    ObserverHarness,
    action_event,
    demo_config,
    observation_event,
    sdk_events,
)

from rotaris.models.state import AgentNode, AgentState, ArtifactInfo, PersonaSpec
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.agent_window import AgentWindow
from rotaris.views.artifact_dialog import ArtifactDialog
from rotaris.views.library import LibraryView
from rotaris.views.workspace import WorkspaceView

pytestmark = pytest.mark.integration


class _ChildRecord(SimpleNamespace):
    def model_dump(self, *, mode: str) -> dict:
        assert mode == "json"
        return dict(self.payload)


def _running_child(name: str = "coder-1", **extra) -> _ChildRecord:
    return _ChildRecord(
        canonical_name=name,
        payload={"canonical_name": name, "persona": "coder", "state": "running", **extra},
    )


# ── active tools ──────────────────────────────────────────────────────────


@verifies(SWR.SWR_2013)
def test_active_tools_track_open_tool_calls_per_agent(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        h.records.append(_running_child())
        action = action_event(sdk)
        h.event(action)
        h.drain()
        store = h.reload_into_store(tmp_path)
        assert store.agents["coder-1"].active_tools == ["shell"]

        h.event(observation_event(sdk, action))
        h.drain()
        store = h.reload_into_store(tmp_path)
        assert store.agents["coder-1"].active_tools == []
    finally:
        h.close()


@verifies(SWR.SWR_2013)
def test_active_tools_cleared_when_child_reaches_terminal_state(tmp_path) -> None:
    sdk = sdk_events()
    h = ObserverHarness(tmp_path)
    try:
        record = _running_child()
        h.records.append(record)
        h.event(action_event(sdk))  # never observed — child dies mid-call
        h.drain()
        record.payload["state"] = "failed"
        h.observer.on_child_created(record, h.child_manager, _FakeTodo())
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    assert store.agents["coder-1"].active_tools == []


@verifies(SWR.SWR_561)
def test_completed_child_state_survives_rotaris_session_reload(tmp_path) -> None:
    """Productive use: a desktop user can inspect completed delegated work after reloading a session.
    Expected outcome: the restored agent projection retains the terminal state."""
    h = ObserverHarness(tmp_path)
    try:
        record = _running_child()
        h.records.append(record)
        h.observer.on_child_created(record, h.child_manager, _FakeTodo())
        h.drain()

        record.payload["state"] = "succeeded"
        record.payload["completed_at"] = "2026-07-26T14:01:38+00:00"
        h.observer.on_child_terminal(record, h.child_manager)
        h.drain()
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    assert store.agents["coder-1"].state is AgentState.DONE


class _FakeTodo:
    def model_dump(self, *, mode: str) -> dict:
        assert mode == "json"
        return {"phases": []}


# ── artifacts: hydration + scoping ────────────────────────────────────────


def _publish_artifact(session_dir, **overrides) -> str:
    art_store = SessionArtifactStore(session_dir)
    kwargs = {
        "slug": "api-notes",
        "title": "API Notes",
        "body": "# API Notes\n\naiohttp migration details.",
        "persona": "librarian",
        "canonical_name": "librarian-1",
    }
    kwargs.update(overrides)
    return art_store.publish(**kwargs).id


@verifies(SWR.SWR_2003)
def test_session_artifacts_hydrate_into_store_with_agent_scoping(tmp_path, qtbot) -> None:
    h = ObserverHarness(tmp_path)
    try:
        art_id = _publish_artifact(h.manager.session_dir(h.state.session_id))
        h.state.child_states = [
            {
                "canonical_name": "librarian-1",
                "persona": "librarian",
                "state": "succeeded",
                "produced_artifact_ids": [art_id],
            },
            {
                "canonical_name": "coder-1",
                "persona": "coder",
                "state": "running",
                "received_artifact_ids": [art_id],
            },
        ]
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    assert [a.title for a in store.artifacts] == ["API Notes"]
    info = store.artifacts[0]
    assert info.id == art_id
    assert info.persona == "librarian"
    assert info.status == "published"

    # per-instance scope
    assert [a.id for a in store.artifacts_for_agent("librarian-1")] == [art_id]
    assert [a.id for a in store.artifacts_for_agent("coder-1")] == [art_id]
    assert store.artifacts_for_agent("orchestrator") == []
    # per-persona scope
    assert [a.id for a in store.artifacts_for_persona("librarian")] == [art_id]
    assert store.artifacts_for_persona("tester") == []
    # agent nodes carry display tuples
    assert store.agents["librarian-1"].artifacts == [("API Notes", "librarian-1", True)]
    assert store.agents["coder-1"].artifacts == [("API Notes", "librarian-1", True)]


@verifies(SWR.SWR_1538)
def test_artifact_edit_roundtrip_through_config_service(tmp_path) -> None:
    h = ObserverHarness(tmp_path)
    try:
        session_dir = h.manager.session_dir(h.state.session_id)
        art_id = _publish_artifact(session_dir)
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    from rotaris_core.session.manager import SessionManager

    service.session_manager = SessionManager(tmp_path)
    store.session_name = h.state.session_id

    assert "aiohttp migration" in service.artifact_body(art_id)
    service.save_artifact(art_id, "# API Notes\n\nedited body.")
    assert service.artifact_body(art_id) == "# API Notes\n\nedited body."

    # durable: fresh store hydrates the edited body
    fresh = SessionArtifactStore(session_dir)
    fresh.hydrate()
    record = fresh.get(art_id)
    assert record is not None
    assert record.body_markdown == "# API Notes\n\nedited body."
    assert record.edited_at is not None


# ── artifact editor dialog ────────────────────────────────────────────────


@verifies(SWR.SWR_2018)
def test_artifact_dialog_edits_and_saves(tmp_path, qtbot) -> None:
    h = ObserverHarness(tmp_path)
    try:
        session_dir = h.manager.session_dir(h.state.session_id)
        art_id = _publish_artifact(session_dir)
        store = h.reload_into_store(tmp_path)
    finally:
        h.close()

    service = ConfigService(tmp_path, store)
    service.config = demo_config()
    from rotaris_core.session.manager import SessionManager

    service.session_manager = SessionManager(tmp_path)
    store.session_name = h.state.session_id

    dialog = ArtifactDialog(service, store.artifacts[0])
    qtbot.addWidget(dialog)
    assert "aiohttp migration" in dialog.editor.toPlainText()
    assert dialog.preview.toPlainText().startswith("API Notes")
    assert not dialog.dirty

    dialog.editor.setPlainText("# API Notes\n\n**from the dialog.**")
    assert dialog.dirty
    assert "from the dialog" in dialog.preview.toPlainText()
    assert dialog.preview.openExternalLinks()
    dialog.save()
    assert not dialog.dirty
    assert service.artifact_body(art_id) == "# API Notes\n\n**from the dialog.**"


# ── view scoping: inspector (instance), agent window (persona), library ──


def _ui_store() -> WorkspaceStore:
    store = WorkspaceStore()
    store.personas = [PersonaSpec("librarian", "", "m", "low")]
    store.set_agents(
        [
            AgentNode(id="orchestrator", name="orchestrator", persona="orchestrator"),
            AgentNode(
                id="librarian-1",
                name="librarian-1",
                persona="librarian",
                state=AgentState.DONE,
                parent_id="orchestrator",
                produced_artifact_ids=["art_1"],
            ),
        ]
    )
    store.set_artifacts(
        [
            ArtifactInfo(
                id="art_1",
                slug="api-notes",
                title="API Notes",
                kind="agent_published",
                status="published",
                persona="librarian",
                producer="librarian-1",
            )
        ]
    )
    return store


@verifies(SWR.SWR_2003)
def test_workspace_inspector_lists_clickable_artifacts(qtbot) -> None:
    store = _ui_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    opened: list[str] = []
    view.artifact_open_requested.connect(opened.append)

    store.select_agent("librarian-1")

    labels = [label.text() for label in view.findChildren(QLabel)]
    joined = "\n".join(labels)
    assert "API Notes" in joined
    assert 'href="art_1"' in joined

    for label in view.findChildren(QLabel):
        if 'href="art_1"' in label.text():
            label.linkActivated.emit("art_1")
            break
    assert opened == ["art_1"]


@verifies(SWR.SWR_2004)
def test_agent_window_lists_persona_artifacts(qtbot) -> None:
    store = _ui_store()
    window = AgentWindow(store, "librarian")
    qtbot.addWidget(window)
    opened: list[str] = []
    window.artifact_open_requested.connect(opened.append)

    labels = "\n".join(label.text() for label in window.findChildren(QLabel))
    assert "API Notes" in labels
    assert 'href="art_1"' in labels

    for label in window.findChildren(QLabel):
        if 'href="art_1"' in label.text():
            label.linkActivated.emit("art_1")
            break
    assert opened == ["art_1"]


@verifies(SWR.SWR_2002)
def test_library_artifacts_tab_lists_session_artifacts(qtbot) -> None:
    store = _ui_store()
    view = LibraryView(store)
    qtbot.addWidget(view)
    opened: list[str] = []
    view.artifact_open_requested.connect(opened.append)

    assert view.artifact_table.topLevelItemCount() == 1
    item = view.artifact_table.topLevelItem(0)
    assert item.text(0) == "API Notes"

    view.artifact_table.setCurrentItem(item)
    view._open_selected_artifact()
    assert opened == ["art_1"]
