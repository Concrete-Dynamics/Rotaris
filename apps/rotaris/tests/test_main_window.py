from __future__ import annotations

from types import SimpleNamespace

import pytest
from fakes import FakeRunBridge
from PySide6.QtCore import QPoint, QPointF, Qt
from PySide6.QtWidgets import QPushButton, QStackedWidget
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models import sample_store
from rotaris.models.state import AgentNode, ArtifactInfo, KpiSnapshot, TodoItem, TranscriptEvent
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge
from rotaris.views.main_window import MainWindow
from rotaris.widgets.question_stepper import QuestionStepper, _OptionCard

pytestmark = pytest.mark.integration


def _question_link_point(transcript_scroll, row: int) -> QPoint:
    """Return the viewport point of the row's "Click to answer" link.

    A hard-coded offset drifts with platform font metrics, so ask the same
    document the delegate hit-tests against where the anchor actually sits.
    """
    from rotaris.views.transcript import _BODY_X, _ROW_MARGIN_X, _ROW_MARGIN_Y, EVENT_ROLE

    index = transcript_scroll.model().index(row, 0)
    body_rect = transcript_scroll.visualRect(index).adjusted(
        _BODY_X, _ROW_MARGIN_Y, -_ROW_MARGIN_X, -_ROW_MARGIN_Y
    )
    document = transcript_scroll.transcript_delegate._document(
        row, index.data(EVENT_ROLE), max(80, body_rect.width())
    )
    layout = document.documentLayout()
    for y in range(0, body_rect.height(), 2):
        for x in range(0, body_rect.width(), 2):
            if layout.anchorAt(QPointF(x, y)).startswith("rotaris-questions:"):
                return body_rect.topLeft() + QPoint(x, y)
    raise AssertionError("row rendered no question link")


@verifies(SWR.SWR_2422, SWR.SWR_2423)
def test_user_answers_exact_waiting_agent_through_rotaris(
    qtbot,
    tmp_path,
) -> None:
    """Productive use: a Rotaris user can answer the agent prompt visible in the transcript.
    Expected outcome: the exact waiting conversation receives answers and can continue.
    """
    from rotaris_core.orchestrator.user_prompt_barrier import (
        PromptWaitStatus,
        UserPromptBarrier,
    )

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    bridge = RunBridge(tmp_path, store, service)
    barrier = UserPromptBarrier()
    asking = SimpleNamespace(id="conversation-asking")
    other = SimpleNamespace(id="conversation-other")
    prompt_id = barrier.create_prompt(asking)
    scheduler = SimpleNamespace(
        user_prompt_barrier=barrier,
        _active_conversations={"other-agent": other, "asking-agent": asking},
    )
    # Built on the worker's real shape — an observer holding the loop — rather
    # than on a ``_ralph`` attribute the worker has never had. The invented one
    # is what kept a dead answer path looking covered.
    #
    # Closing the window shuts the bridge down, which cancels the worker, so the
    # fake has to answer those calls too (Windows delivers closeEvent on teardown).
    from rotaris.services.run_bridge import _RunWorker

    worker = _RunWorker.__new__(_RunWorker)
    worker._observer = SimpleNamespace(ralph=SimpleNamespace(scheduler=scheduler))
    worker.cancel_pending_approvals = lambda: None
    worker.cancel = lambda: None
    bridge._worker = worker
    bridge._run_active = True

    window = MainWindow(store, config_service=service, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")
    window.show()
    qtbot.waitExposed(window)

    store.set_transcript(
        [
            TranscriptEvent(
                "",
                "asking-agent",
                "1 step — Scope",
                kind="question_stepper",
            )
        ]
    )
    store.set_pending_questions(
        {
            "agent_id": "asking-agent",
            "prompt_id": prompt_id,
            "steps": [
                {
                    "id": "scope",
                    "title": "Choose scope",
                    "options": [{"label": "Small", "description": "Focused fix"}],
                    "allow_freeform": True,
                }
            ],
        }
    )
    qtbot.mouseClick(
        window.workspace.transcript_scroll.viewport(),
        Qt.MouseButton.LeftButton,
        pos=_question_link_point(window.workspace.transcript_scroll, 0),
    )

    stepper = window.workspace.transcript_scroll._stepper_modal
    assert isinstance(stepper, QuestionStepper)
    option = stepper.findChild(_OptionCard)
    assert option is not None
    qtbot.mouseClick(option, Qt.MouseButton.LeftButton)
    qtbot.mouseClick(stepper._submit_button, Qt.MouseButton.LeftButton)

    response = barrier.wait_for_response(asking, prompt_id, timeout=0.1)
    assert response.status is PromptWaitStatus.RESOLVED
    assert response.answers == {"scope": {"selected_option": "Small", "freeform_text": None}}
    bridge._worker = None


@verifies(SWR.SWR_2002, SWR.SWR_3301)
def test_main_window_navigates_all_seven_primary_views(qtbot) -> None:
    """Seven since SWR-3301: Requirements sits between Mission and Git."""
    window = MainWindow(sample_store())
    qtbot.addWidget(window)
    window.show()

    for view_id in window.VIEW_ORDER:
        qtbot.mouseClick(window.nav._buttons[view_id], Qt.MouseButton.LeftButton)
        assert window.nav.current() == view_id
        assert window.stack.currentWidget() is window.views[view_id]

    assert isinstance(window.stack, QStackedWidget)
    assert window.stack.count() == 7
    assert window.VIEW_ORDER == (
        "dashboard",
        "workspace",
        "mission",
        "requirements",
        "git",
        "library",
        "settings",
    )
    assert window.views["requirements"] is window.requirements_controller.surface


@verifies(SWR.SWR_2007, SWR.SWR_2026)
def test_workspace_prompt_starts_run_and_appends_transcript(qtbot) -> None:
    bridge = FakeRunBridge()
    store = sample_store()
    store.set_session_status("completed")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")
    window.workspace.composer.setPlainText("Implement desktop workflow")

    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)

    assert bridge.prompts == ["Implement desktop workflow"]
    assert store.transcript[-1].text == "Implement desktop workflow"
    assert store.transcript[-1].kind == "user"


@verifies(SWR.SWR_2035, SWR.SWR_2036, SWR.SWR_2088)
def test_workspace_active_run_queues_and_keeps_composer_enabled(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.set_session_status("running")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    assert window.workspace.composer.isReadOnly() is False
    assert window.workspace.send_button.text() == "Queue"
    window.workspace.composer.setPlainText("Check the migration too")
    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)

    assert bridge.queued == {"queued-1": "Check the migration too"}
    assert [(item.id, item.text) for item in store.queued_prompts] == [
        ("queued-1", "Check the migration too")
    ]
    assert window.workspace.queue_panel.isVisibleTo(window.workspace)
    assert window.workspace.composer.toPlainText() == ""


@verifies(SWR.SWR_2007, SWR.SWR_2008)
def test_workspace_orphaned_running_session_resumes_instead_of_queueing(qtbot) -> None:
    bridge = FakeRunBridge()
    store = WorkspaceStore()
    store.session_name = "orphaned-session"
    store.set_session_status("running")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    assert window.workspace.send_button.text() == "Continue run"
    window.workspace.composer.setPlainText("Continue verification")
    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)

    assert bridge.prompts == ["Continue verification"]
    assert bridge.session_ids == ["orphaned-session"]
    assert bridge.queued == {}


@verifies(SWR.SWR_2037)
def test_queued_message_edit_and_delete_reach_run_bridge(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.set_session_status("running")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window._queue_prompt("First draft")

    window.workspace.queued_prompt_edit_requested.emit("queued-1", "Revised draft")

    assert bridge.queued == {"queued-1": "Revised draft"}
    assert store.queued_prompts[0].text == "Revised draft"

    window.workspace.queued_prompt_delete_requested.emit("queued-1")

    assert bridge.queued == {}
    assert store.queued_prompts == []


@verifies(SWR.SWR_2024, SWR.SWR_2122)
def test_workspace_run_pause_requested_calls_run_bridge_pause_agent(qtbot) -> None:
    bridge = FakeRunBridge()
    store = sample_store()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("workspace")

    window.workspace.run_pause_requested.emit()

    assert bridge.paused == ["orchestrator"]


@verifies(SWR.SWR_2122)
def test_mission_pause_button_is_disabled_without_a_run_root(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.pause_result = False
    store = sample_store()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("mission")
    row = window.mission.agent_tree._layout.itemAt(0).widget()
    assert row is not None
    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)

    assert window.mission.pause_button.isEnabled() is False
    assert bridge.paused == []


@verifies(SWR.SWR_2404)
def test_new_session_clears_loaded_run_and_starts_fresh(qtbot, monkeypatch) -> None:
    """Productive use: user accepts launch options before beginning a fresh session.
    Expected outcome: accepted default launch clears the prior loaded session."""
    monkeypatch.setattr("rotaris.views.main_window._SessionLaunchDialog.exec", lambda _self: 1)
    bridge = FakeRunBridge()
    store = WorkspaceStore()
    store.session_name = "s-1"
    store.session_status = "completed"
    store.session_runtime_label = "2m"
    store.set_agents([AgentNode("orchestrator", "orchestrator", "orchestrator")])
    store.transcript = [TranscriptEvent("12:00", "agent", "old run")]
    store.artifacts = [ArtifactInfo("artifact-1", "old", "Old artifact")]
    store.todos = [TodoItem("task-1", "phase-1", "done", "old task", "Build")]
    store.kpis = KpiSnapshot(cumulative_tokens=42, tool_calls=3)
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window._resume_session_id = "s-1"
    window.workspace.composer.setPlainText("stale draft")

    window._new_session()

    assert store.session_name == ""
    assert store.session_status == "idle"
    assert store.session_runtime_label == ""
    assert store.agents == {}
    assert store.selected_agent_id == ""
    assert store.transcript == []
    assert store.artifacts == []
    assert store.todos == []
    assert store.kpis.cumulative_tokens == 0
    assert store.kpis.tool_calls == 0
    assert window.workspace.composer.toPlainText() == ""
    assert window.stack.currentWidget() is window.workspace

    window.workspace.composer.setPlainText("Start clean")
    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)

    assert bridge.session_ids == [None]


@verifies(SWR.SWR_2404)
def test_new_session_does_not_discard_workspace_while_local_run_is_active(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.session_name = "s-1"
    store.transcript = [TranscriptEvent("12:00", "agent", "still running")]
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)

    window._new_session()

    assert store.session_name == "s-1"
    assert [event.text for event in store.transcript] == ["still running"]
    assert "active run" in window.toast.text().lower()


@verifies(SWR.SWR_2026)
def test_rejected_prompt_restores_draft_without_fake_transcript(qtbot) -> None:
    bridge = FakeRunBridge()
    bridge.start_result = False
    store = WorkspaceStore()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.workspace.composer.setPlainText("Do not lose me")

    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)

    assert store.transcript == []
    assert store.prompt_history == []
    assert window.workspace.composer.toPlainText() == "Do not lose me"


@verifies(SWR.SWR_2007)
def test_started_run_becomes_resume_target_for_next_prompt(qtbot) -> None:
    bridge = FakeRunBridge()
    store = WorkspaceStore()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)

    window._run_started("new-session-id")
    window._run_finished("completed")
    window._submit_prompt("Continue same work")

    assert bridge.session_ids == ["new-session-id"]


@verifies(SWR.SWR_2039)
def test_library_stashed_prompt_returns_to_composer(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show_view("library")
    expected = store.prompt_stash[0]
    window.library.stash_list.setCurrentRow(0)

    window.library._use_stash()

    assert window.stack.currentWidget() is window.workspace
    assert window.workspace.composer.toPlainText() == expected
    assert expected not in store.prompt_stash


@verifies(SWR.SWR_2002, SWR.SWR_2019)
def test_library_stash_to_workspace_submission_user_journey(qtbot) -> None:
    prompt = "Review every migration before changing the schema"
    bridge = FakeRunBridge()
    store = WorkspaceStore()
    store.prompt_stash = [prompt]
    store.set_session_status("completed")
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show_view("library")
    window.library.tabs.setCurrentIndex(2)
    window.library.stash_list.setCurrentRow(0)
    use_selected = next(
        button
        for button in window.library.findChildren(QPushButton)
        if button.text() == "Use selected"
        and button.parentWidget() is window.library.stash_list.parentWidget()
    )

    qtbot.mouseClick(use_selected, Qt.MouseButton.LeftButton)

    assert window.stack.currentWidget() is window.workspace
    assert window.workspace.composer.toPlainText() == prompt
    assert store.prompt_stash == []

    qtbot.mouseClick(window.workspace.send_button, Qt.MouseButton.LeftButton)
    assert bridge.prompts == [prompt]


@verifies(SWR.SWR_2002, SWR.SWR_2076)
def test_settings_save_then_discard_round_trips_user_changes(qtbot) -> None:
    class FakeConfigService:
        def __init__(self) -> None:
            self.save_count = 0

        def save(self) -> None:
            self.save_count += 1

    service = FakeConfigService()
    store = WorkspaceStore()
    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)
    window.show_view("settings")
    original = store.delegation.depth_cap

    window.settings.depth_spin.setValue(original + 1)
    assert store.ui.settings_dirty is True
    qtbot.mouseClick(window.settings.save_button, Qt.MouseButton.LeftButton)
    assert service.save_count == 1
    assert store.ui.settings_dirty is False
    assert store.delegation.depth_cap == original + 1

    window.settings.depth_spin.setValue(original + 2)
    assert store.ui.settings_dirty is True
    qtbot.mouseClick(window.settings.discard_button, Qt.MouseButton.LeftButton)
    assert store.ui.settings_dirty is False
    assert store.delegation.depth_cap == original + 1


@verifies(SWR.SWR_2004)
def test_open_agent_window_groups_instances_by_persona(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)

    window.open_agent_window("coding-agent-1")
    agent_window = window.agent_windows["coding-agent"]
    qtbot.addWidget(agent_window)

    assert agent_window.tabs.count() == 2
    assert agent_window.current_agent_id() == "coding-agent-1"


@verifies(SWR.SWR_2089, SWR.SWR_2090)
def test_workspace_agent_tree_inspects_without_default_popout(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    store.ui.agent_popout = False
    window.show_view("workspace")

    row = window.workspace.agent_tree._layout.itemAt(0).widget()
    assert row is not None
    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)

    assert store.selected_agent_id == "intent-classifier"
    assert window.stack.currentWidget() is window.workspace
    assert window.agent_windows == {}


@verifies(SWR.SWR_2090, SWR.SWR_2099)
def test_workspace_agent_tree_opens_window_when_popout_enabled(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    store.ui.agent_popout = True

    row = window.workspace.agent_tree._layout.itemAt(0).widget()
    assert row is not None
    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)

    assert "intent-classifier" in window.agent_windows
    agent_window = window.agent_windows["intent-classifier"]
    tab = agent_window.tabs.currentWidget()
    visible_roles = {
        event.role
        for index in range(tab.transcript_scroll.transcript_model.rowCount())
        if (event := tab.transcript_scroll.transcript_model.event_at(index)) is not None
    }
    assert visible_roles == {"you", "system"}


@verifies(SWR.SWR_2090)
def test_agent_popout_preference_persists_across_windows(qtbot, monkeypatch) -> None:
    values: dict[str, object] = {}

    class MemorySettings:
        def value(self, key: str, default: object = None, **_kwargs) -> object:
            return values.get(key, default)

        def setValue(self, key: str, value: object) -> None:  # noqa: N802
            values[key] = value

    monkeypatch.setattr("rotaris.views.main_window.QSettings", MemorySettings)
    first = MainWindow(sample_store())
    qtbot.addWidget(first)
    first.set_agent_popout(True)

    second_store = sample_store()
    second = MainWindow(second_store)
    qtbot.addWidget(second)

    assert second_store.ui.agent_popout is True


@verifies(SWR.SWR_2420)
def test_auto_collapse_tools_preference_persists_across_windows(qtbot, monkeypatch) -> None:
    values: dict[str, object] = {}

    class MemorySettings:
        def value(self, key: str, default: object = None, **_kwargs) -> object:
            return values.get(key, default)

        def setValue(self, key: str, value: object) -> None:  # noqa: N802
            values[key] = value

    monkeypatch.setattr("rotaris.views.main_window.QSettings", MemorySettings)
    first = MainWindow(sample_store())
    qtbot.addWidget(first)
    first.settings.auto_collapse_tools_toggle.setChecked(True)

    assert values["display/autoCollapseTools"] is True

    second_store = sample_store()
    second = MainWindow(second_store)
    qtbot.addWidget(second)

    assert second_store.ui.auto_collapse_tools is True
    assert second.settings.auto_collapse_tools_toggle.isChecked() is True


@verifies(SWR.SWR_2094)
def test_settings_tab_preference_persists_and_stale_values_fall_back(qtbot, monkeypatch) -> None:
    values: dict[str, object] = {}

    class MemorySettings:
        def value(self, key: str, default: object = None, **_kwargs) -> object:
            return values.get(key, default)

        def setValue(self, key: str, value: object) -> None:  # noqa: N802
            values[key] = value

    monkeypatch.setattr("rotaris.views.main_window.QSettings", MemorySettings)
    first = MainWindow(sample_store())
    qtbot.addWidget(first)
    first.settings.set_active_tab("runtime")

    assert values["interface/settingsTab"] == "runtime"

    second = MainWindow(sample_store())
    qtbot.addWidget(second)
    assert second.settings.active_tab_id() == "runtime"

    values["interface/settingsTab"] = "retired-tab"
    third = MainWindow(sample_store())
    qtbot.addWidget(third)
    assert third.settings.active_tab_id() == "models"


def test_sample_store_transcript_is_deterministic() -> None:
    a = [e.text for e in sample_store().transcript]
    b = [e.text for e in sample_store().transcript]
    assert a == b
    assert any(len(t.split()) > 100 for t in a)
