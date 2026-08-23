from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from fakes import FakeRunBridge
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QDialog, QMessageBox, QPushButton
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

from rotaris.models import RunUiState, TodoItem, TranscriptEvent, sample_store
from rotaris.models.state import NoticeSeverity, UiNotice
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.prompt_persistence import PromptPersistence
from rotaris.services.run_bridge import RunBridge, _RunWorker, _SessionObserver
from rotaris.views.dashboard import DashboardView
from rotaris.views.main_window import MainWindow, _SessionsDialog, _WorktreeDialog
from rotaris.views.settings import SettingsView
from rotaris.views.workspace import WorkspaceView, _TodoAddRow, _TodoRow

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_2024)
def test_run_ui_state_normalizes_backend_aliases() -> None:
    assert RunUiState.from_backend("attached") is RunUiState.RUNNING
    assert RunUiState.from_backend("succeeded") is RunUiState.COMPLETED
    assert RunUiState.from_backend("unknown") is RunUiState.IDLE
    assert RunUiState.PAUSING.busy is True
    assert RunUiState.PAUSED.busy is False


@verifies(SWR.SWR_2025)
def test_workspace_minimum_size_uses_mutually_exclusive_drawers(qtbot) -> None:
    store = sample_store()
    store.add_queued_prompt("queued-1", "Review the compact layout after this iteration")
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.resize(1000, 680)
    window.show_view("workspace")
    window.show()
    qtbot.waitExposed(window)
    view = window.workspace

    assert view.sidebar_panel.isVisible() is False
    assert view.inspector_panel.isVisible() is False
    qtbot.waitUntil(lambda: view.center_panel.width() >= 850)
    assert view.center_panel.width() >= 850
    assert view.queue_panel.isVisible() is True
    assert view.queue_scroll.maximumHeight() == 150
    assert view.send_button.isVisible() is True

    qtbot.mouseClick(view.sidebar_toggle, Qt.MouseButton.LeftButton)
    assert view.sidebar_panel.isVisible() is True
    assert view.inspector_panel.isVisible() is False

    qtbot.mouseClick(view.inspector_toggle, Qt.MouseButton.LeftButton)
    assert view.sidebar_panel.isVisible() is False
    assert view.inspector_panel.isVisible() is True


@verifies(SWR.SWR_2025, SWR.SWR_2428)
def test_the_context_toolbar_fits_at_the_minimum_window_size(qtbot) -> None:
    """Productive use: a user works at the smallest supported window with new output waiting.
    Expected outcome: every toolbar control is still on screen, including the newest one."""
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.resize(1000, 680)
    window.show_view("workspace")
    window.show()
    qtbot.waitExposed(window)
    view = window.workspace
    view.set_terminal_count(2, 3)
    # The busiest the strip ever gets: the new-output control only appears when
    # the reader has scrolled away from the tail.
    view.new_output_button.show()
    qtbot.waitUntil(lambda: view.context_toolbar.width() > 0)

    toolbar = view.context_toolbar
    clipped = [
        control.accessibleName() or control.text()
        for control in toolbar.findChildren(QPushButton)
        if control.isVisible()
        and (
            control.mapTo(toolbar, control.rect().topLeft()).x() < 0
            or control.mapTo(toolbar, control.rect().topRight()).x() > toolbar.width()
        )
    ]

    assert not clipped, f"controls clipped out of the context toolbar at 1000x680: {clipped}"


@verifies(SWR.SWR_2025)
def test_workspace_large_size_keeps_primary_panes_visible(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.resize(1440, 900)
    window.show_view("workspace")
    window.show()
    qtbot.waitExposed(window)

    assert window.workspace.sidebar_panel.isVisible() is True
    assert window.workspace.inspector_panel.isVisible() is True
    assert window.workspace.center_panel.width() >= 700


@verifies(SWR.SWR_2026)
def test_workspace_run_state_makes_composer_mode_explicit(qtbot) -> None:
    store = sample_store()
    bridge = FakeRunBridge()
    bridge.running = True
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    view = window.workspace

    assert view.composer.isReadOnly() is False
    assert view.send_button.text() == "Queue"
    assert view.composer_mode_label.text() == "Run in progress"
    assert view.send_button.isEnabled() is True

    store.set_session_status("completed")

    assert view.composer.isReadOnly() is False
    assert view.send_button.isEnabled() is True
    assert view.send_button.text() == "Continue run"


@verifies(SWR.SWR_2026, SWR.SWR_2027)
def test_workspace_transcript_search_and_history_recall(qtbot) -> None:
    store = sample_store()
    store.set_session_status("completed")
    store.prompt_history = ["newest prompt", "older prompt"]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.show()

    view.open_search()
    view.search_input.setText("Background task")
    assert view._search_matches
    assert "1 of" in view.search_count.text()

    view.composer.setFocus()
    qtbot.keyClick(view.composer, Qt.Key.Key_Up)
    assert view.composer.toPlainText() == "newest prompt"
    qtbot.keyClick(view.composer, Qt.Key.Key_Up)
    assert view.composer.toPlainText() == "older prompt"
    qtbot.keyClick(view.composer, Qt.Key.Key_Down)
    assert view.composer.toPlainText() == "newest prompt"


@verifies(SWR.SWR_2029)
def test_empty_dashboard_exposes_setup_recovery_action(qtbot) -> None:
    store = WorkspaceStore()
    view = DashboardView(store)
    qtbot.addWidget(view)

    assert view.onboarding.isVisible() is False  # not shown until the view itself is shown
    view.show()
    assert view.onboarding.isVisible() is True
    assert "Finish workspace setup" in view.onboarding.title_label.text()
    assert view.onboarding.action_button is not None
    assert view.onboarding.action_button.property("actionId") == "workspace"


@verifies(SWR.SWR_2031)
def test_settings_dirty_state_can_be_discarded(qtbot) -> None:
    store = sample_store()
    store.mark_settings_saved()
    original = store.delegation.depth_cap
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    store.delegation.depth_cap = original + 2
    store.mark_settings_dirty()
    assert store.ui.settings_dirty is True
    assert view.save_button.isEnabled() is True
    assert view.dirty_label.text() == "Unsaved changes"

    store.discard_settings_changes()
    assert store.delegation.depth_cap == original
    assert store.ui.settings_dirty is False


@verifies(SWR.SWR_2044)
def test_settings_personas_tab_preserves_table_height_without_horizontal_scrolling(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)
    view.resize(1000, 620)
    view.show()
    qtbot.waitExposed(view)

    view.set_active_tab("personas")
    personas_page = view.tabs.currentWidget()

    assert personas_page.verticalScrollBarPolicy() is Qt.ScrollBarPolicy.ScrollBarAsNeeded
    assert personas_page.horizontalScrollBarPolicy() is Qt.ScrollBarPolicy.ScrollBarAlwaysOff
    assert view.persona_table.minimumHeight() == 220
    assert view.personas_card.height() == personas_page.viewport().height()
    assert view.persona_table.height() > view.persona_table.minimumHeight()
    assert view.persona_table.horizontalScrollBar().maximum() == 0


@verifies(SWR.SWR_2032)
def test_settings_provider_buttons_use_compact_style(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    provider_buttons = [
        button
        for button in view.findChildren(QPushButton)
        if button.text()
        in {"Add endpoint", "Check", "Authenticate", "Re-authenticate", "Log out", "Delete"}
    ]

    assert provider_buttons
    assert all(button.property("compact") is True for button in provider_buttons)


@verifies(SWR.SWR_2031)
def test_settings_outside_workspace_requires_explicit_confirmation(qtbot, monkeypatch) -> None:
    store = sample_store()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)
    answers = iter(
        [
            QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Yes,
        ]
    )
    monkeypatch.setattr(
        "rotaris.views.settings.QMessageBox.warning",
        lambda *_args, **_kwargs: next(answers),
    )

    view._set_runtime_toggle("allow_outside_workspace", True)
    assert store.runtime.allow_outside_workspace is False

    view._set_runtime_toggle("allow_outside_workspace", True)
    assert store.runtime.allow_outside_workspace is True
    assert store.ui.settings_dirty is True


@verifies(SWR.SWR_2030, SWR.SWR_2032)
def test_main_window_registers_accessible_navigation_and_shortcuts(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show()

    assert window.nav._buttons["workspace"].accessibleName() == "Open Workspace"
    workspace_command = next(
        command for command in window.commands.commands() if command.id == "view.workspace"
    )
    assert workspace_command.shortcut == "Ctrl+2"
    window.commands.trigger("view.workspace")
    assert window.stack.currentWidget() is window.workspace
    window.commands.trigger("transcript.search")
    assert window.workspace.search_panel.isVisible() is True


@verifies(SWR.SWR_2033)
def test_persistent_notice_is_visible_and_dismissible(qtbot) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    notice = UiNotice(
        "notice-test",
        NoticeSeverity.ERROR,
        "Run failed",
        "The session is preserved.",
        details="provider timeout",
        persistent=True,
    )

    store.publish_notice(notice)

    assert window.notice_banner.isVisible() is True
    assert window.notice_banner.copy_button.isVisible() is True
    qtbot.mouseClick(window.notice_banner.dismiss_button, Qt.MouseButton.LeftButton)
    assert store.ui.notice is None


@verifies(SWR.SWR_2024)
def test_cancel_confirmation_names_cascading_descendants(qtbot, monkeypatch) -> None:
    store = sample_store()
    bridge = FakeRunBridge()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    monkeypatch.setattr(
        "rotaris.views.main_window.ConfirmImpactDialog.exec",
        lambda _self: QDialog.DialogCode.Accepted,
    )

    window._cancel_agent("coding-agent-1")

    assert bridge.cancelled == ["coding-agent-1"]
    assert store.agents["coding-agent-1"].state.value == "cancelled"
    assert store.agents["tester"].state.value == "cancelled"
    assert store.agents["librarian"].state.value == "done"


@verifies(SWR.SWR_2008)
def test_session_browser_filters_and_resumes_selected(qtbot) -> None:
    store = sample_store()
    dialog = _SessionsDialog(store)
    qtbot.addWidget(dialog)

    dialog.search.setText("docs")
    assert dialog.sessions.count() == 1
    dialog.sessions.setCurrentRow(0)
    dialog._resume_selected()
    assert dialog.selected_session_id == "s-2"


@verifies(SWR.SWR_2005)
def test_worktree_dialog_validates_branch_and_path(tmp_path, qtbot) -> None:
    workspace = tmp_path / "repo"
    workspace.mkdir()
    dialog = _WorktreeDialog(workspace, {"main"})
    qtbot.addWidget(dialog)

    dialog.branch_input.setText("main")
    assert dialog.create_button.isEnabled() is False
    assert "already" in dialog.validation.text()

    dialog.branch_input.setText("feature/production-ux")
    assert dialog.create_button.isEnabled() is True
    assert dialog.path_input.text().endswith("feature-production-ux")


@verifies(SWR.SWR_2026, SWR.SWR_2038)
def test_prompt_history_and_stash_persist_atomically(tmp_path: Path) -> None:
    store = WorkspaceStore()
    store.prompt_history = ["ship it"]
    store.prompt_stash = ["later task"]
    persistence = PromptPersistence(tmp_path, store)
    persistence.save()

    loaded = WorkspaceStore()
    PromptPersistence(tmp_path, loaded).load()

    assert loaded.prompt_history == ["ship it"]
    assert loaded.prompt_stash == ["later task"]
    assert not list((tmp_path / ".rotaris").glob(".rotaris-prompts-*"))


@verifies(SWR.SWR_2029)
def test_workspace_empty_transcript_has_instructional_state(qtbot) -> None:
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    assert view.transcript_empty.isHidden() is False

    store.append_event(TranscriptEvent("12:00", "you", "Run tests", kind="user"))
    assert view.transcript_empty.isHidden() is True


@verifies(SWR.SWR_2028)
def test_todo_store_mutations_preserve_identity_and_emit(qtbot) -> None:
    store = WorkspaceStore()
    changes: list[list[str]] = []
    store.todos_changed.connect(lambda: changes.append([todo.text for todo in store.todos]))
    store.set_todos([TodoItem("task-1", "phase-1", "open", "Draft", "Build")])
    changes.clear()

    store.rename_todo("task-1", "Implement")
    store.add_todo("phase-1", "Test")
    added_id = store.todos[-1].id
    store.remove_todo("task-1")

    assert store.todos == [TodoItem(added_id, "phase-1", "open", "Test", "Build")]
    assert changes == [["Implement"], ["Implement", "Test"], ["Test"]]


@verifies(SWR.SWR_2028)
def test_workspace_todo_rows_rename_remove_and_add_inline(qtbot) -> None:
    store = WorkspaceStore()
    store.set_todos([TodoItem("task-1", "phase-1", "open", "Draft", "Build")])
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.show()
    renamed: list[tuple[str, str]] = []
    removed: list[str] = []
    added: list[tuple[str, str]] = []
    view.todo_renamed.connect(lambda task_id, text: renamed.append((task_id, text)))
    view.todo_removed.connect(removed.append)
    view.todo_added.connect(lambda phase_id, text: added.append((phase_id, text)))

    row = next(row for row in view.findChildren(_TodoRow) if row._todo.id == "task-1")
    row.editor.selectAll()
    qtbot.keyClicks(row.editor, "Implement")
    qtbot.keyPress(row.editor, Qt.Key.Key_Return)
    assert renamed == [("task-1", "Implement")]
    assert store.todos[0].text == "Implement"

    add_row = view.findChild(_TodoAddRow)
    assert add_row is not None
    qtbot.mouseClick(add_row.add_button, Qt.MouseButton.LeftButton)
    qtbot.keyClicks(add_row.editor, "Test")
    qtbot.keyPress(add_row.editor, Qt.Key.Key_Return)
    assert added == [("phase-1", "Test")]
    assert [todo.text for todo in store.todos] == ["Implement", "Test"]

    row = next(row for row in view.findChildren(_TodoRow) if row._todo.id == "task-1")
    qtbot.mouseClick(row.remove_button, Qt.MouseButton.LeftButton)
    assert removed == ["task-1"]
    assert [todo.text for todo in store.todos] == ["Test"]


@verifies(SWR.SWR_2028)
def test_session_observer_edits_same_live_todo_instance() -> None:
    saves: list[object] = []
    state = SimpleNamespace(agent_todo_state=None, transcript_events=[])
    manager = SimpleNamespace(
        persister=SimpleNamespace(request_save=lambda saved: saves.append(saved))
    )
    loop = SimpleNamespace(
        is_closed=lambda: False,
        call_soon_threadsafe=lambda callback, *args: callback(*args),
    )
    observer = _SessionObserver(loop, manager, state)
    todo = TodoList(
        phases=[TodoPhase(id="phase-1", name="Build", tasks=[TodoTask(id="task-1", name="Draft")])]
    )
    observer.on_todo_state(todo)

    assert observer._live_todo is todo
    assert observer.edit_todo("rename", "task-1", "Implement") is True
    assert observer.edit_todo("add", "phase-1", "Test") is True
    assert observer.edit_todo("remove", "task-1") is True

    assert [task.name for task in todo.phases[0].tasks] == ["Test"]
    assert state.agent_todo_state["phases"][0]["tasks"][0]["name"] == "Test"
    assert len(saves) == 4


@verifies(SWR.SWR_2028)
def test_config_service_edits_persisted_todo(tmp_path) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    state = SimpleNamespace(
        agent_todo_state={
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Build",
                    "tasks": [{"id": "task-1", "name": "Draft", "status": "PENDING"}],
                }
            ]
        },
        todo_state=None,
    )
    flushed: list[object] = []
    service.session_manager = SimpleNamespace(
        load_session=lambda _session_id: state,
        persister=SimpleNamespace(flush_sync=lambda saved: flushed.append(saved)),
    )
    applied: list[object] = []
    service.apply_session = applied.append  # type: ignore[method-assign]

    assert service.edit_session_todo("session-1", "rename", "task-1", "Implement") is True

    assert state.agent_todo_state["phases"][0]["tasks"][0]["name"] == "Implement"
    assert flushed == [state]
    assert applied == [state]


@verifies(SWR.SWR_2027)
def test_config_service_clears_persisted_transcript(tmp_path) -> None:
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    state = SimpleNamespace(transcript_events=[{"role": "agent", "content": "work"}])
    flushed: list[object] = []
    service.session_manager = SimpleNamespace(
        load_session=lambda _session_id: state,
        persister=SimpleNamespace(flush_sync=lambda saved: flushed.append(saved)),
    )
    applied: list[object] = []
    service.apply_session = applied.append  # type: ignore[method-assign]

    service.clear_session_transcript("session-1")

    assert state.transcript_events == []
    assert flushed == [state]
    assert applied == [state]


@pytest.mark.asyncio
@verifies(SWR.SWR_2027)
async def test_compression_worker_reports_partial_success(monkeypatch) -> None:
    calls: list[str] = []

    async def compress(_scheduler, name: str, _conversation) -> None:
        calls.append(name)
        if name == "agent-b":
            raise RuntimeError("context unavailable")

    monkeypatch.setattr(
        "rotaris_core.orchestrator.scheduler_compression.force_compress_child",
        compress,
    )
    worker = _RunWorker.__new__(_RunWorker)

    count, errors = await worker._compress_conversations(
        object(),
        {"agent-a": object(), "agent-b": object()},
    )

    assert calls == ["agent-a", "agent-b"]
    assert count == 1
    assert errors == "agent-b: context unavailable"


@verifies(SWR.SWR_2027)
def test_run_bridge_exposes_compression_and_clear_operations() -> None:
    calls: list[str] = []
    worker = SimpleNamespace(
        force_compress=lambda: calls.append("compress") or True,
        clear_transcript=lambda: calls.append("clear") or True,
        edit_todo=lambda operation, target_id, text: (
            calls.append(f"{operation}:{target_id}:{text}") or True
        ),
    )
    bridge = RunBridge.__new__(RunBridge)
    bridge._run_active = True
    bridge._worker = worker

    assert bridge.force_compress() is True
    assert bridge.clear_transcript() is True
    assert bridge.edit_todo("rename", "task-1", "Ship") is True
    assert calls == ["compress", "clear", "rename:task-1:Ship"]


@verifies(SWR.SWR_2027)
def test_session_observer_clears_live_transcript_on_run_loop() -> None:
    saves: list[object] = []
    state = SimpleNamespace(transcript_events=[{"role": "agent", "content": "work"}])
    manager = SimpleNamespace(
        persister=SimpleNamespace(request_save=lambda saved: saves.append(saved))
    )
    loop = SimpleNamespace(call_soon_threadsafe=lambda callback, *args: callback(*args))
    observer = _SessionObserver(loop, manager, state)
    # A row the run is still streaming into. Clearing has to let go of it too,
    # or the next token would be appended to a row the transcript no longer has.
    observer._recorder._stream_segments["agent"] = state.transcript_events[0]

    observer.clear_transcript()

    assert state.transcript_events == []
    assert observer._recorder.held_rows() == []
    assert saves == [state]


@verifies(SWR.SWR_2027)
def test_clear_transcript_requires_confirmation_and_keeps_session(qtbot, monkeypatch) -> None:
    store = sample_store()
    window = MainWindow(store)
    qtbot.addWidget(window)
    monkeypatch.setattr(
        "rotaris.views.main_window.ConfirmImpactDialog.exec",
        lambda _self: QDialog.DialogCode.Accepted,
    )

    window._clear_transcript()

    assert store.transcript == []
    assert store.session_name == "auth-flow-refactor"
    assert store.artifacts


@verifies(SWR.SWR_2906)
def test_transcript_attributes_interleaved_agent_activity_to_colored_blocks(
    qtbot, tmp_path
) -> None:
    """A user watching two agents interleave sees one colored label per agent block."""
    from rotaris import theme
    from rotaris.views.transcript import transcript_attribution

    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    persona = SimpleNamespace(model="model", thinking="high", tools=["shell"])
    service.config = SimpleNamespace(
        default_persona="orchestrator",
        personas={"orchestrator": persona, "coder": persona, "tester": persona},
        models={"model": SimpleNamespace(max_input_tokens=200_000)},
    )
    state = SimpleNamespace(
        session_id="session-1",
        execution_status="running",
        transcript_events=[
            {"role": "user", "content": "Build the feature"},
            {
                "role": "tool",
                "name": "coder-1",
                "persona": "coder",
                "tool": "read_file",
                "content": "src/app.py",
            },
            {
                "role": "tool",
                "name": "coder-1",
                "persona": "coder",
                "tool": "write_file",
                "content": "src/app.py",
            },
            {"role": "agent", "name": "coder-1", "persona": "coder", "content": "Done editing"},
            {
                "role": "tool",
                "name": "tester-1",
                "persona": "tester",
                "tool": "shell",
                "content": "pytest -q",
            },
            {"role": "agent", "name": "tester-1", "persona": "tester", "content": "All green"},
        ],
        child_states=[
            {"canonical_name": "coder-1", "persona": "coder", "state": "running"},
            {"canonical_name": "tester-1", "persona": "tester", "state": "running"},
        ],
        todo_state=None,
        agent_todo_state=None,
        token_usage=None,
        global_token_usage=SimpleNamespace(total_tokens=100),
        global_tool_call_count=3,
        agent_metrics={},
        root_context_tokens=0,
    )

    service.apply_session(state)
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    events = view.transcript_scroll.transcript_model.events
    attributions = [transcript_attribution(events, row) for row in range(len(events))]

    coder_color = theme.persona_instance_color("coder", "coder-1")
    tester_color = theme.persona_instance_color("tester", "tester-1")
    assert [entry[0] for entry in attributions] == [True, True, False, False, True, False]
    assert attributions[0][1] == "you"
    assert attributions[1][1:] == ("Coder", "coder-1", coder_color)
    # Mid-block rows carry the same agent color for the continuation bar.
    assert attributions[2][1:] == ("", "", coder_color)
    assert attributions[3][1:] == ("", "", coder_color)
    assert attributions[4][1:] == ("Tester", "tester-1", tester_color)
    assert attributions[5][1:] == ("", "", tester_color)

    # The delegate paints the whole thing without touching per-event widgets.
    assert not view.transcript_scroll.grab().isNull()
