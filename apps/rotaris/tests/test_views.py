from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from PySide6.QtCore import QPoint, Qt
from PySide6.QtGui import QDesktopServices, QGuiApplication
from PySide6.QtWidgets import (
    QAbstractSlider,
    QComboBox,
    QLabel,
    QMessageBox,
    QPushButton,
    QStyleOptionViewItem,
    QWidget,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.testing.lorem import LoremMarkdownGenerator
from ui_query import transcript_anchor_point

from rotaris import theme
from rotaris.markdown import (
    clear_markdown_cache,
    markdown_cache_info,
    markdown_to_html,
)
from rotaris.models import (
    AgentNode,
    PersonaSpec,
    ProviderInfo,
    SkillInfo,
    TranscriptDiff,
    TranscriptDiffLine,
    TranscriptEvent,
    WorktreeInfo,
    sample_store,
)
from rotaris.models.state import ModelOption, QuestionOption, QuestionStep
from rotaris.models.store import WorkspaceStore
from rotaris.views.dashboard import DashboardView
from rotaris.views.git import GitView
from rotaris.views.library import LibraryView, _EditProposalDialog
from rotaris.views.mission import MissionView
from rotaris.views.settings import SettingsView
from rotaris.views.transcript import (
    _attribution_label_height,
    _event_html,
    _event_identity,
    _role_color,
    delegation_context_event,
    filter_transcript_for_agent,
    transcript_attribution,
)
from rotaris.views.workspace import (
    WorkspaceView,
    _QueuedPromptRow,
    _session_row_text_width,
)
from rotaris.widgets.question_stepper import QuestionStepper, _OptionCard
from rotaris.widgets.tree import AgentTreeList

pytestmark = pytest.mark.integration


@verifies(SWR.SWR_106, SWR.SWR_2006)
def test_mission_controls_update_delegation_store(qtbot) -> None:
    store = sample_store()
    view = MissionView(store)
    qtbot.addWidget(view)

    view.strategy.setCurrentIndex(view.strategy.findData("swarm"))
    view.depth_spin.setValue(5)
    view.fanout.setValue(12)

    assert store.delegation.strategy == "swarm"
    assert store.delegation.depth_cap == 5
    assert store.delegation.fanout_limit == 12
    assert view.table.topLevelItemCount() == len(store.agents)


@verifies(SWR.SWR_2003)
def test_mission_agent_tree_selects_before_explicit_open(qtbot) -> None:
    store = sample_store()
    view = MissionView(store)
    qtbot.addWidget(view)
    requested: list[str] = []
    view.open_agent_requested.connect(requested.append)

    row = view.agent_tree._layout.itemAt(0).widget()
    assert row is not None
    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)

    assert store.selected_agent_id == "intent-classifier"
    assert requested == []
    qtbot.mouseClick(view.open_button, Qt.MouseButton.LeftButton)

    assert requested == ["intent-classifier"]


@verifies(SWR.SWR_2122)
def test_mission_pause_button_is_unavailable_for_task_agents(qtbot) -> None:
    store = sample_store()
    view = MissionView(store)
    qtbot.addWidget(view)
    row = view.agent_tree._layout.itemAt(0).widget()
    assert row is not None
    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)

    assert view.pause_button.isEnabled() is False
    assert "Run header" in view.pause_button.toolTip()
    assert view.pause_help.isHidden() is False
    assert view.pause_help.isEnabled() is True
    assert "Run header" in view.pause_help.accessibleDescription()


@verifies(SWR.SWR_2122)
def test_agent_tree_row_leads_with_agent_type_then_task(qtbot) -> None:
    store = sample_store()
    tree = AgentTreeList(store)
    qtbot.addWidget(tree)

    rows = [tree._layout.itemAt(i).widget() for i in range(tree._layout.count())]
    row = next(r for r in rows if r._agent_id == "coding-agent-1")
    named = [
        (label.accessibleName(), label.text())
        for label in row.findChildren(QLabel)
        if label.accessibleName() in {"Agent type", "Agent task"}
    ]

    # Type first, task beneath it — findChildren keeps creation order.
    assert named == [("Agent type", "Coding Agent"), ("Agent task", "coding-agent-1")]
    assert row.toolTip() == store.agents["coding-agent-1"].activity


@verifies(SWR.SWR_2003)
def test_mission_selected_agent_can_be_opened_and_cancelled(qtbot) -> None:
    store = sample_store()
    view = MissionView(store)
    qtbot.addWidget(view)
    opened: list[str] = []
    cancelled: list[str] = []
    view.open_agent_requested.connect(opened.append)
    view.cancel_requested.connect(cancelled.append)
    store.select_agent("coding-agent-1")

    qtbot.mouseClick(view.open_button, Qt.MouseButton.LeftButton)
    qtbot.mouseClick(view.cancel_button, Qt.MouseButton.LeftButton)

    assert opened == ["coding-agent-1"]
    assert cancelled == ["coding-agent-1"]


@verifies(SWR.SWR_2006)
def test_settings_mcp_toggle_sets_session_override(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store)
    qtbot.addWidget(view)
    server = store.mcp_servers[0]

    store.set_mcp_enabled(server.name, False)

    assert server.enabled is False
    assert server.session_override is True


@verifies(SWR.SWR_2098)
def test_settings_skill_controls_update_the_injection_policy(qtbot) -> None:
    store = sample_store()
    store.skills = [SkillInfo("Review", "project", "Review changes.", path="/tmp/review/SKILL.md")]
    view = SettingsView(store)
    qtbot.addWidget(view)

    row = view.skill_table.topLevelItem(0)
    trigger = view.skill_table.itemWidget(row, 2)
    load = view.skill_table.itemWidget(row, 3)
    assert isinstance(trigger, QComboBox)
    assert isinstance(load, QComboBox)

    trigger.setCurrentIndex(trigger.findData("manual-only"))
    load.setCurrentIndex(load.findData("on"))
    view.skills_enabled.setChecked(False)

    assert store.skills[0].invocation_mode == "manual-only"
    assert store.skills[0].load_mode == "on"
    assert store.skills_enabled is False
    assert store.ui.settings_dirty is True


@verifies(SWR.SWR_2097)
def test_store_set_mcp_health_updates_fields_and_emits_library_changed(qtbot) -> None:
    store = sample_store()
    server = store.mcp_servers[0]
    seen: list[None] = []
    store.library_changed.connect(lambda: seen.append(None))

    store.set_mcp_health(server.name, "healthy", detail="", tool_count=5)

    assert server.health == "healthy"
    assert server.tool_count == 5
    assert seen


@verifies(SWR.SWR_2097)
def test_settings_check_status_button_disabled_without_config_service(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store)
    qtbot.addWidget(view)

    assert view.check_health_button.isEnabled() is False


@verifies(SWR.SWR_2097)
def test_settings_check_status_probes_servers_and_updates_health(qtbot, monkeypatch) -> None:
    from rotaris_core.config.schema import MCPServerConfig

    store = sample_store()
    healthy_server = store.mcp_servers[0]
    unavailable_server = next(s for s in store.mcp_servers if not s.available)
    config_service = SimpleNamespace(
        workspace="/tmp/workspace",
        config=SimpleNamespace(
            mcp_servers={
                healthy_server.name: MCPServerConfig(command="npx"),
                unavailable_server.name: MCPServerConfig(command="missing-cmd"),
            }
        ),
    )
    view = SettingsView(store, config_service)
    qtbot.addWidget(view)

    from rotaris_core.config.mcp_tool_discovery import MCPHealthResult

    monkeypatch.setattr(
        "rotaris_core.config.mcp_tool_discovery.probe_mcp_server_health",
        lambda name, cfg, workspace, **_: MCPHealthResult(healthy=True, tool_count=3, error=None),
    )

    assert view.check_health_button.isEnabled() is True
    qtbot.mouseClick(view.check_health_button, Qt.MouseButton.LeftButton)
    task = view._health_check_task
    assert task is not None
    # Wait on the finished *state*: with a stubbed probe the thread can finish
    # before a waitSignal connection exists, and a queued signal already emitted
    # never arrives.
    qtbot.waitUntil(task.isFinished, timeout=5000)

    qtbot.waitUntil(lambda: healthy_server.health == "healthy", timeout=5000)
    assert healthy_server.tool_count == 3
    assert unavailable_server.health == "unreachable"
    assert unavailable_server.health_detail == "Command not found on PATH"


@verifies(SWR.SWR_2123)
def test_dashboard_proposal_row_actions_emit_status_request(qtbot) -> None:
    store = sample_store()
    view = DashboardView(store)
    qtbot.addWidget(view)
    captured: list[tuple[str, str, str]] = []
    view.proposal_action_requested.connect(lambda *args: captured.append(args))
    proposal = next(p for p in store.improvement_proposals if p.status == "pending_review")

    row = view.proposals_rows.itemAt(0).widget()
    assert row is not None
    approve = next(b for b in row.findChildren(QPushButton) if b.text() == "Approve")
    qtbot.mouseClick(approve, Qt.MouseButton.LeftButton)

    assert captured == [(proposal.artifact_id, proposal.id, "approved")]


@verifies(SWR.SWR_2123)
def test_dashboard_proposal_row_hides_button_for_current_status(qtbot) -> None:
    store = sample_store()
    view = DashboardView(store)
    qtbot.addWidget(view)
    approved = next(p for p in store.improvement_proposals if p.status == "approved")
    row_index = store.improvement_proposals.index(approved)

    row = view.proposals_rows.itemAt(row_index).widget()
    assert row is not None
    labels = {b.text() for b in row.findChildren(QPushButton)}
    assert "Approve" not in labels


@verifies(SWR.SWR_2123)
def test_dashboard_proposal_row_summary_link_emits_open_request(qtbot) -> None:
    store = sample_store()
    view = DashboardView(store)
    qtbot.addWidget(view)
    captured: list[tuple[str, str]] = []
    view.proposal_open_requested.connect(lambda *args: captured.append(args))
    proposal = store.improvement_proposals[0]

    row = view.proposals_rows.itemAt(0).widget()
    assert row is not None
    link = next(child for child in row.findChildren(QLabel) if proposal.summary in child.text())
    link.linkActivated.emit(proposal.id)

    assert captured == [(proposal.artifact_id, proposal.id)]


@verifies(SWR.SWR_2123)
def test_dashboard_proposals_header_link_emits_open_request(qtbot) -> None:
    store = sample_store()
    view = DashboardView(store)
    qtbot.addWidget(view)
    captured: list[tuple[str, str]] = []
    view.proposal_open_requested.connect(lambda *args: captured.append(args))

    link = next(b for b in view.findChildren(QPushButton) if b.text() == "Open in Library →")
    qtbot.mouseClick(link, Qt.MouseButton.LeftButton)

    assert captured == [("", "")]


@verifies(SWR.SWR_2123)
def test_library_set_active_tab_switches_to_named_tab(qtbot) -> None:
    store = sample_store()
    view = LibraryView(store)
    qtbot.addWidget(view)

    view.set_active_tab("proposals")

    assert view.tabs.currentWidget().isAncestorOf(view.proposal_table)


@verifies(SWR.SWR_2123)
def test_library_proposals_tab_lists_store_proposals(qtbot) -> None:
    store = sample_store()
    view = LibraryView(store)
    qtbot.addWidget(view)

    assert view.proposal_table.topLevelItemCount() == len(store.improvement_proposals)
    assert view.proposals_empty.isVisible() is False


@verifies(SWR.SWR_2123)
def test_library_focus_proposal_selects_and_scrolls_to_row(qtbot) -> None:
    store = sample_store()
    view = LibraryView(store)
    qtbot.addWidget(view)
    target = store.improvement_proposals[-1]

    view.focus_proposal(target.id)

    current = view.proposal_table.currentItem()
    assert current is not None
    assert str(current.data(0, Qt.ItemDataRole.UserRole)) == target.id


@verifies(SWR.SWR_2123)
def test_library_proposal_action_button_emits_status_request(qtbot) -> None:
    store = sample_store()
    view = LibraryView(store)
    qtbot.addWidget(view)
    captured: list[tuple[str, str, str]] = []
    view.proposal_action_requested.connect(lambda *args: captured.append(args))
    proposal = next(p for p in store.improvement_proposals if p.status == "pending_review")
    view.focus_proposal(proposal.id)

    qtbot.mouseClick(view.proposal_action_buttons["approved"], Qt.MouseButton.LeftButton)

    assert captured == [(proposal.artifact_id, proposal.id, "approved")]


@verifies(SWR.SWR_2123)
def test_library_edit_selected_proposal_emits_edit_request_via_dialog(qtbot, monkeypatch) -> None:
    store = sample_store()
    view = LibraryView(store)
    qtbot.addWidget(view)
    captured: list[tuple[str, str, str, str]] = []
    view.proposal_edit_requested.connect(lambda *args: captured.append(args))
    proposal = store.improvement_proposals[0]
    view.focus_proposal(proposal.id)

    def fake_exec(self: _EditProposalDialog) -> int:
        self.summary_input.setText("revised summary")
        self.action_input.setPlainText("revised action")
        self._accept_validated()
        return 1

    monkeypatch.setattr(_EditProposalDialog, "exec", fake_exec)
    view._edit_selected_proposal()

    assert captured == [(proposal.artifact_id, proposal.id, "revised summary", "revised action")]


@verifies(SWR.SWR_2123)
def test_library_edit_proposal_dialog_disables_save_for_blank_fields(qtbot) -> None:
    dialog = _EditProposalDialog("summary", "action")
    qtbot.addWidget(dialog)

    dialog.summary_input.setText("")

    assert dialog.save_button.isEnabled() is False
    assert "Summary" in dialog.validation.text()


@verifies(SWR.SWR_2123)
def test_library_delete_proposal_button_emits_delete_request(qtbot) -> None:
    store = sample_store()
    view = LibraryView(store)
    qtbot.addWidget(view)
    captured: list[tuple[str, str]] = []
    view.proposal_delete_requested.connect(lambda *args: captured.append(args))
    proposal = store.improvement_proposals[0]
    view.focus_proposal(proposal.id)

    qtbot.mouseClick(view.proposal_delete_button, Qt.MouseButton.LeftButton)

    assert captured == [(proposal.artifact_id, proposal.id)]


@verifies(SWR.SWR_2008, SWR.SWR_2415)
def test_overview_primary_action_starts_a_new_session_even_during_a_run(qtbot) -> None:
    store = WorkspaceStore()
    view = DashboardView(store)
    qtbot.addWidget(view)
    started: list[bool] = []
    destinations: list[str] = []
    view.new_session_requested.connect(lambda: started.append(True))
    view.request_view.connect(destinations.append)

    qtbot.mouseClick(view.new_session_button, Qt.MouseButton.LeftButton)
    assert started == [True]
    assert destinations == []

    store.set_session_status("running")
    qtbot.mouseClick(view.new_session_button, Qt.MouseButton.LeftButton)
    assert started == [True, True]
    assert destinations == []


@verifies(SWR.SWR_2005)
def test_git_actions_follow_repository_availability_and_refresh_lifecycle(qtbot) -> None:
    store = WorkspaceStore()
    view = GitView(store)
    qtbot.addWidget(view)
    refreshed: list[bool] = []
    created: list[bool] = []
    view.refresh_requested.connect(lambda: refreshed.append(True))
    view.create_worktree_requested.connect(lambda: created.append(True))

    assert view.create_button.isEnabled() is False
    assert "Git repository" in view.create_button.toolTip()

    store.branch = "main"
    store.git_changed.emit()
    assert view.create_button.isEnabled() is True
    qtbot.mouseClick(view.create_button, Qt.MouseButton.LeftButton)
    assert created == [True]

    qtbot.mouseClick(view.refresh_button, Qt.MouseButton.LeftButton)
    assert refreshed == [True]
    assert view.refresh_button.isEnabled() is False
    assert view.refresh_button.text() == "Refreshing…"

    store.git_changed.emit()
    assert view.refresh_button.isEnabled() is True
    assert view.refresh_button.text() == "Refresh"


@verifies(SWR.SWR_2405)
def test_git_worktree_delete_buttons_survive_refresh_and_emit_path(qtbot) -> None:
    store = WorkspaceStore()
    store.branch = "main"
    store.worktrees = [
        WorktreeInfo("main", "/repo", is_base=True, active=True),
        WorktreeInfo("feature/one", "/repo/.rotaris/worktrees/one"),
        WorktreeInfo("feature/two", "/repo/.rotaris/worktrees/two"),
    ]
    view = GitView(store)
    qtbot.addWidget(view)
    emitted: list[str] = []
    view.delete_worktree_requested.connect(emitted.append)

    old_button = view.worktree_table.itemWidget(view.worktree_table.topLevelItem(1), 5)
    assert isinstance(old_button, QPushButton)

    view.refresh()
    new_button = view.worktree_table.itemWidget(view.worktree_table.topLevelItem(1), 5)
    assert isinstance(new_button, QPushButton)
    assert new_button is not old_button
    assert old_button.parent() is None
    assert new_button.minimumWidth() >= 28
    assert new_button.minimumHeight() >= 24
    assert not new_button.isHidden()

    qtbot.mouseClick(new_button, Qt.MouseButton.LeftButton)

    assert emitted == ["/repo/.rotaris/worktrees/one"]


@verifies(SWR.SWR_2006)
def test_settings_runtime_toggle_and_persona_table(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store)
    qtbot.addWidget(view)

    labels = [label.text() for label in view.findChildren(QLabel)]

    assert "Secret redaction: always active" in labels
    assert view.persona_table.topLevelItemCount() == len(store.personas)


@verifies(SWR.SWR_2074, SWR.SWR_2076)
def test_persona_settings_scope_edit_and_discard_round_trip(qtbot) -> None:
    store = sample_store()
    store.mark_settings_saved()
    persona_name = store.personas[0].name
    original_model = store.personas[0].model
    original_reasoning = store.personas[0].reasoning
    original_scope = store.personas[0].model_scope
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    view.persona_scope.set_value("Global", emit=True)
    model = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == f"Model for persona {persona_name}"
    )
    replacement = next(value for value in store.model_catalog if value != original_model)
    model.setCurrentText(replacement)

    reasoning = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == f"Reasoning for persona {persona_name}"
    )
    reasoning.setCurrentIndex(reasoning.findData("max"))

    edited = store.personas[0]
    assert store.persona_edit_scope == "global"
    assert edited.model == replacement
    assert edited.model_scope == "global"
    assert edited.reasoning == "max"
    assert edited.reasoning_scope == "global"
    assert store.ui.settings_dirty is True

    store.discard_settings_changes()

    assert store.persona_edit_scope == "global"
    assert store.personas[0].model == original_model
    assert store.personas[0].model_scope == original_scope
    assert store.personas[0].reasoning == original_reasoning
    assert store.ui.settings_dirty is False


@verifies(SWR.SWR_2074, SWR.SWR_2075, SWR.SWR_2076)
def test_persona_scope_toggle_displays_that_scope_without_copying_values(qtbot) -> None:
    store = WorkspaceStore()
    store.model_options = [ModelOption("workspace-model"), ModelOption("global-model")]
    store.personas = [
        PersonaSpec(
            "coder",
            "Coding",
            "workspace-model",
            "high",
            model_scope="workspace",
            reasoning_scope="workspace",
        )
    ]
    store.persona_scope_values = {
        ("coder", "model", "workspace"): "workspace-model",
        ("coder", "model", "global"): "global-model",
        ("coder", "reasoning", "workspace"): "high",
        ("coder", "reasoning", "global"): "low",
    }
    store.mark_settings_saved()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    model = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == "Model for persona coder"
    )
    reasoning = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == "Reasoning for persona coder"
    )
    assert model.currentText() == "workspace-model"
    assert reasoning.currentData() == "high"

    view.persona_scope.set_value("Global", emit=True)
    qtbot.wait(1)

    model = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == "Model for persona coder"
    )
    reasoning = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == "Reasoning for persona coder"
    )
    assert model.currentText() == "global-model"
    assert reasoning.currentData() == "low"
    assert store.personas[0].model == "workspace-model"
    assert store.ui.settings_dirty is False


@verifies(SWR.SWR_2074)
def test_persona_workspace_override_can_be_unset_from_settings(qtbot) -> None:
    store = sample_store()
    persona = store.personas[0]
    persona.model_scope = "workspace"
    persona.reasoning_scope = "global"
    store.mark_settings_saved()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    unset_model = next(
        button
        for button in view.findChildren(QPushButton)
        if button.accessibleName() == f"Unset model override for {persona.name}"
    )
    assert unset_model.isEnabled() is True
    assert not any(
        button.accessibleName() == f"Unset reasoning override for {persona.name}"
        for button in view.findChildren(QPushButton)
    )

    qtbot.mouseClick(unset_model, Qt.MouseButton.LeftButton)

    assert store.personas[0].model_scope == "default"
    assert (persona.name, "model", "workspace") in store._persona_unsets
    assert store.ui.settings_dirty is True


@verifies(SWR.SWR_2075, SWR.SWR_2076)
def test_persona_global_override_can_be_unset_to_default(qtbot) -> None:
    store = WorkspaceStore()
    store.model_options = [ModelOption("default-model"), ModelOption("global-model")]
    store.personas = [PersonaSpec("coder", "Coding", "global-model", "medium")]
    store.persona_scope_values = {
        ("coder", "model", "default"): "default-model",
        ("coder", "model", "global"): "global-model",
        ("coder", "reasoning", "default"): "medium",
    }
    store.persona_edit_scope = "global"
    store.mark_settings_saved()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    unset = next(
        button
        for button in view.findChildren(QPushButton)
        if button.accessibleName() == "Unset model override for coder"
    )
    qtbot.mouseClick(unset, Qt.MouseButton.LeftButton)
    qtbot.wait(1)

    model = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == "Model for persona coder"
    )
    assert model.currentText() == "default-model"
    assert ("coder", "model", "global") in store._persona_unsets
    assert store.ui.settings_dirty is True


@verifies(SWR.SWR_2022)
def test_settings_model_slots_expose_per_slot_thinking_strength(qtbot) -> None:
    store = sample_store()
    store.mark_settings_saved()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    control = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == "Thinking strength for large_model"
    )

    assert [control.itemText(index) for index in range(control.count())] == [
        "Provider default",
        "low",
        "medium",
        "high",
        "max",
    ]
    control.setCurrentIndex(control.findData("max"))

    assert store.model_slot_thinking["large_model"] == "max"
    assert store.ui.settings_dirty is True


@verifies(SWR.SWR_2096)
def test_persona_reasoning_exposes_default_and_provider_default(qtbot) -> None:
    store = sample_store()
    persona_name = store.personas[0].name
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    control = next(
        combo
        for combo in view.findChildren(QComboBox)
        if combo.accessibleName() == f"Reasoning for persona {persona_name}"
    )

    assert [control.itemText(index) for index in range(2)] == [
        "Default",
        "Provider default",
    ]
    assert [control.itemData(index) for index in range(2)] == [
        "default",
        "provider_default",
    ]

    store.discard_settings_changes()

    assert store.model_slot_thinking["large_model"] == "high"
    assert store.ui.settings_dirty is False


@verifies(SWR.SWR_2094)
def test_settings_organizes_controls_into_scrollable_tabs(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)
    view.resize(1000, 680)
    view.show()
    qtbot.waitExposed(view)

    assert [view.tabs.tabText(index) for index in range(view.tabs.count())] == [
        "Models",
        "Personas",
        "Runtime",
        "Interface",
        "Display",
        "Skills",
        "Instructions",
        "Hooks",
        "MCP Servers",
        "Plugins",
        "Tools",
        "Project",
    ]
    assert view.tabs.widget(0).isAncestorOf(view.model_grid.parentWidget())
    assert view.tabs.widget(1).isAncestorOf(view.persona_table)
    assert view.tabs.widget(2).isAncestorOf(view.depth_spin)
    assert view.tabs.widget(3).isAncestorOf(view.agent_popout_toggle)
    assert view.tabs.widget(4).isAncestorOf(view.auto_collapse_tools_toggle)
    assert view.tabs.widget(5).isAncestorOf(view.skill_table)
    assert view.tabs.widget(8).isAncestorOf(view.check_health_button)
    assert not view.tabs.isAncestorOf(view.save_button)
    assert view.save_button.geometry().bottom() < view.tabs.geometry().top()


@verifies(SWR.SWR_2424)
def test_settings_inventory_tabs_are_read_only_tables(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store, provider_service=object())
    qtbot.addWidget(view)

    # Hooks is no longer a generic Name/Source/Description inventory: SWR-2701
    # gave it its own columns and a trust verdict, covered by
    # test_hook_trust_ui.py.
    for tab_id, label in (
        ("instructions", "Instructions"),
        ("plugins", "Plugins"),
        ("tools", "Tools"),
    ):
        table = getattr(view, f"{tab_id}_table")
        empty = getattr(view, f"{tab_id}_empty")
        index = [view.tabs.tabText(i) for i in range(view.tabs.count())].index(label)
        assert view.tabs.widget(index).isAncestorOf(table)
        assert [table.headerItem().text(column) for column in range(table.columnCount())] == [
            "Name",
            "Source",
            "Description",
        ]
        assert empty.isVisibleTo(view.tabs.widget(index)) is (table.topLevelItemCount() == 0)

    # No workspace is configured, so workspace-derived inventories stay empty.
    assert view.instructions_table.topLevelItemCount() == 0
    assert view.plugins_table.topLevelItemCount() == 0
    assert view.tools_table.topLevelItemCount() > 0

    for index in range(view.tabs.count()):
        page = view.tabs.widget(index)
        assert page is not None
        assert page.horizontalScrollBarPolicy() == Qt.ScrollBarPolicy.ScrollBarAlwaysOff

    view.tabs.setCurrentIndex(2)
    view.depth_spin.setValue(7)

    assert store.ui.settings_dirty is True
    assert view.dirty_label.text() == "Unsaved changes"


@verifies(SWR.SWR_2006)
def test_settings_delegation_changes_refresh_other_views(qtbot) -> None:
    store = sample_store()
    settings = SettingsView(store)
    mission = MissionView(store)
    qtbot.addWidget(settings)
    qtbot.addWidget(mission)

    settings.depth_spin.setValue(7)
    settings.fanout.setValue(13)

    # Shown, because a hidden view holds its rebuild rather than paying for one
    # nobody can see (SWR-2454) — and a user reads this panel by looking at it.
    mission.show()
    qtbot.waitExposed(mission)

    assert mission.depth_spin.value() == 7
    assert mission.fanout.value() == 13


@verifies(SWR.SWR_2084, SWR.SWR_2910)
def test_workspace_inspector_model_stays_read_only_without_selection(qtbot) -> None:
    """Dropping the selection hands the inspector to the live agent, and the
    model and reasoning controls stay read-only either way."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    store.select_agent("coding-agent-1")
    assert view.tools_layout.count() > 0

    store.select_agent("")

    # sample_store's newest transcript row is written by the running tester.
    assert view.inspector_name.text() == "tester"
    assert view.inspector_model.isEnabled() is False
    assert view.inspector_reasoning.isEnabled() is False


@verifies(SWR.SWR_2122)
def test_workspace_run_pause_control_is_separate_from_task_selection(qtbot) -> None:
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    assert view.run_pause_button.isEnabled() is False
    assert view.run_availability_help.isHidden() is False
    assert (
        view.run_availability_help.accessibleDescription()
        == view.run_pause_button.accessibleDescription()
    )
    store.select_agent("coding-agent-1")
    assert view.run_pause_button.isEnabled() is False


@verifies(SWR.SWR_2024)
def test_workspace_run_pause_button_emits_run_pause_requested(qtbot) -> None:
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    class FakeBridge:
        running = True

    view.window().run_bridge = FakeBridge()
    view._refresh_run_state()

    with qtbot.waitSignal(view.run_pause_requested, timeout=1000):
        qtbot.mouseClick(view.run_pause_button, Qt.MouseButton.LeftButton)


@verifies(SWR.SWR_2038, SWR.SWR_2039)
def test_workspace_top_stash_action_can_apply_or_pop(qtbot) -> None:
    store = WorkspaceStore()
    store.stash_prompt("saved prompt")
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    assert view.stash_manage_button.text() == "Apply stash (1)"
    view._use_stashed_prompt(0, remove=False)
    assert view.composer.toPlainText() == "saved prompt"
    assert store.prompt_stash == ["saved prompt"]

    view.composer.clear()
    view._use_stashed_prompt(0, remove=True)
    assert view.composer.toPlainText() == "saved prompt"
    assert store.prompt_stash == []
    assert view.stash_manage_button.text() == "Apply stash (0)"


@verifies(SWR.SWR_2037, SWR.SWR_2036)
def test_workspace_queued_row_exposes_inline_edit_and_delete(qtbot) -> None:
    store = WorkspaceStore()
    store.add_queued_prompt("queued-1", "Original message")
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    row = view.queue_rows.itemAt(0).widget()
    assert isinstance(row, _QueuedPromptRow)

    qtbot.mouseClick(row.edit_button, Qt.MouseButton.LeftButton)
    assert row.editor.isReadOnly() is False
    row.editor.setText("Edited message")
    with qtbot.waitSignal(view.queued_prompt_edit_requested, timeout=1000) as edited:
        qtbot.mouseClick(row.edit_button, Qt.MouseButton.LeftButton)

    assert edited.args == ["queued-1", "Edited message"]
    with qtbot.waitSignal(view.queued_prompt_delete_requested, timeout=1000) as deleted:
        qtbot.mouseClick(row.delete_button, Qt.MouseButton.LeftButton)

    assert deleted.args == ["queued-1"]


@verifies(SWR.SWR_2008, SWR.SWR_2415)
def test_dashboard_session_label_tracks_status_while_switching_stays_available(qtbot) -> None:
    store = sample_store()
    view = DashboardView(store)
    qtbot.addWidget(view)
    # Shown, because a hidden panel holds its rebuild rather than paying for
    # one nobody can see (SWR-2454); this screen is read by looking at it.
    view.show()
    qtbot.waitExposed(view)

    assert "running" in view.session_label.text()
    assert view.new_session_button.isEnabled() is True
    assert view.new_session_button.text() == "New session"
    assert view.sessions_button.isEnabled() is True

    store.set_session_status("completed")

    assert "completed" in view.session_label.text()
    assert view.new_session_button.isEnabled() is True
    assert view.sessions_button.isEnabled() is True


@verifies(SWR.SWR_2040, SWR.SWR_2041)
def test_settings_checks_provider_health_without_blocking_qt(qtbot) -> None:
    class ProviderService:
        def check_provider_health(self, provider_id: str) -> ProviderInfo:
            return ProviderInfo(
                provider_id,
                "Test Provider",
                True,
                "Validated Test Provider; discovered 3 models.",
                "healthy",
                "api_key",
            )

    store = WorkspaceStore()
    store.providers = [
        ProviderInfo("test", "Test Provider", False, "Checking…", "checking", "api_key")
    ]
    view = SettingsView(store, ProviderService())
    qtbot.addWidget(view)

    qtbot.waitUntil(lambda: store.providers[0].status == "healthy")

    assert store.providers[0].connected is True
    assert "discovered 3 models" in store.providers[0].detail


@verifies(SWR.SWR_2070)
def test_provider_status_updates_reuse_settings_widget_tree(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store)
    qtbot.addWidget(view)
    provider = store.providers[0]
    controls = view._provider_controls[provider.id]
    baseline_widgets = len(view.findChildren(QWidget))

    for index in range(100):
        provider.status = "checking" if index % 2 else "healthy"
        provider.detail = f"Health sample {index}"
        store.settings_changed.emit()

    assert view._provider_controls[provider.id] is controls
    assert controls.detail.text() == "Health sample 99"
    assert len(view.findChildren(QWidget)) == baseline_widgets


def wait_for_idle_provider_rows(qtbot, view: SettingsView) -> None:
    """Wait out the health check the settings view starts for every provider.

    Opening the view kicks off a background check per provider, and a row with a
    check in flight is not the row the user acts on: its buttons are disabled and
    re-labelled "Provider operation in progress", and the row is rebuilt once the
    check lands, discarding any widget a test grabbed early.

    Waiting for the provider's status in the store is not the same thing. The
    status is written when the check *succeeds*, one signal before the row stops
    being busy, so a test that waits on it can still reach the row during the
    gap — which is how these tests failed, only on a loaded machine.
    """
    qtbot.waitUntil(lambda: not view._active_provider_operations)


@verifies(SWR.SWR_2042, SWR.SWR_774)
def test_provider_plus_opens_auth_modal_and_persists_success(qtbot) -> None:
    class ProviderService:
        def check_provider_health(self, provider_id: str) -> ProviderInfo:
            return ProviderInfo(
                provider_id,
                "Test Provider",
                False,
                "Not authenticated.",
                "unauthenticated",
                "api_key",
            )

        def authenticate_provider(self, provider_id: str, **kwargs) -> ProviderInfo:
            assert kwargs["api_key"] == "secret-key"
            return ProviderInfo(
                provider_id,
                "Test Provider",
                True,
                "Validated; discovered 2 models.",
                "healthy",
                "api_key",
            )

    store = WorkspaceStore()
    store.providers = [
        ProviderInfo(
            "test", "Test Provider", False, "Not authenticated.", "unauthenticated", "api_key"
        )
    ]
    view = SettingsView(store, ProviderService())
    qtbot.addWidget(view)
    wait_for_idle_provider_rows(qtbot, view)
    plus = next(
        button
        for button in view.findChildren(QPushButton)
        if button.toolTip() == "Authenticate provider"
    )

    qtbot.mouseClick(plus, Qt.MouseButton.LeftButton)
    dialog = view._auth_dialog
    assert dialog is not None
    assert dialog.api_key_input is not None
    dialog.api_key_input.setText("secret-key")
    dialog._submit()
    qtbot.waitUntil(lambda: store.providers[0].status == "healthy")

    assert dialog.result() == dialog.DialogCode.Accepted


@verifies(SWR.SWR_2095)
def test_reauth_refreshes_overview_subscription_limits(qtbot) -> None:
    from rotaris.models import SubscriptionLimit

    refreshed_limits = [SubscriptionLimit("Codex usage", "10% used", 10, "90% remaining")]

    class ProviderService:
        def check_provider_health(self, provider_id: str) -> ProviderInfo:
            return ProviderInfo(
                provider_id, "Codex", False, "Not authenticated.", "unauthenticated", "oauth"
            )

        def authenticate_provider(self, provider_id: str, **kwargs) -> ProviderInfo:
            return ProviderInfo(provider_id, "Codex", True, "Validated Codex.", "healthy", "oauth")

        def refresh_subscription_limits(self) -> list[SubscriptionLimit]:
            return refreshed_limits

    store = WorkspaceStore()
    store.providers = [
        ProviderInfo("codex", "Codex", False, "Not authenticated.", "unauthenticated", "oauth")
    ]
    store.subscription_limits = [
        SubscriptionLimit("Codex usage", "Usage unavailable", 0, "Sign in to Codex or retry…")
    ]
    view = SettingsView(store, ProviderService())
    qtbot.addWidget(view)
    wait_for_idle_provider_rows(qtbot, view)
    plus = next(
        button
        for button in view.findChildren(QPushButton)
        if button.toolTip() == "Authenticate provider"
    )

    qtbot.mouseClick(plus, Qt.MouseButton.LeftButton)
    dialog = view._auth_dialog
    assert dialog is not None
    dialog._submit()
    qtbot.waitUntil(lambda: store.providers[0].status == "healthy")
    qtbot.waitUntil(lambda: store.subscription_limits == refreshed_limits)


@verifies(SWR.SWR_2042)
def test_add_endpoint_validates_fields_and_renders_registered_provider(qtbot) -> None:
    class ProviderService:
        def check_provider_health(self, provider_id: str) -> ProviderInfo:
            return next(provider for provider in store.providers if provider.id == provider_id)

        def addable_builtin_providers(self) -> list[tuple[str, str, str]]:
            return []

        def register_openai_compatible_provider(self, label, base_url, api_key):
            assert (label, base_url, api_key) == (
                "Second Lab",
                "https://second.example/v1",
                "secret-key",
            )
            return SimpleNamespace(
                success=True,
                message="Added Second Lab.",
                provider_id="openai-compatible--second-lab",
            )

        def refresh_provider_catalog(self) -> None:
            store.providers.append(
                ProviderInfo(
                    "openai-compatible--second-lab",
                    "Second Lab",
                    True,
                    "Validated.",
                    "healthy",
                    "api_key",
                    user_defined=True,
                    has_credentials=True,
                )
            )
            store.settings_changed.emit()

    store = WorkspaceStore()
    view = SettingsView(store, ProviderService())
    qtbot.addWidget(view)
    qtbot.mouseClick(view.add_provider_button, Qt.MouseButton.LeftButton)
    dialog = view._add_provider_dialog
    assert dialog is not None

    dialog._submit()
    assert dialog.status.text() == "Label is required."
    dialog.label_input.setText("Second Lab")
    dialog.url_input.setText("https://second.example/v1")
    dialog.api_key_input.setText("secret-key")
    dialog._submit()

    qtbot.waitUntil(
        lambda: any(provider.id == "openai-compatible--second-lab" for provider in store.providers)
    )
    assert dialog.result() == dialog.DialogCode.Accepted


@verifies(SWR.SWR_2042, SWR.SWR_774)
def test_provider_logout_requires_confirmation_and_updates_status(qtbot, monkeypatch) -> None:
    class ProviderService:
        def check_provider_health(self, provider_id: str) -> ProviderInfo:
            return ProviderInfo(
                provider_id, "Test Provider", True, "Validated.", "healthy", "api_key"
            )

        def logout_provider(self, provider_id: str) -> ProviderInfo:
            return ProviderInfo(
                provider_id,
                "Test Provider",
                False,
                "Signed out of test.",
                "unauthenticated",
                "api_key",
            )

    monkeypatch.setattr(
        QMessageBox,
        "question",
        lambda *_args, **_kwargs: QMessageBox.StandardButton.Yes,
    )
    store = WorkspaceStore()
    store.providers = [
        ProviderInfo("test", "Test Provider", True, "Validated.", "healthy", "api_key")
    ]
    view = SettingsView(store, ProviderService())
    qtbot.addWidget(view)
    wait_for_idle_provider_rows(qtbot, view)
    logout = next(button for button in view.findChildren(QPushButton) if button.text() == "Log out")

    qtbot.mouseClick(logout, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: store.providers[0].status == "unauthenticated")

    assert store.providers[0].connected is False
    assert store.providers[0].detail == "Signed out of test."


@verifies(SWR.SWR_775, SWR.SWR_2042)
def test_custom_provider_delete_confirmation_lists_workspace_references(qtbot, monkeypatch) -> None:
    messages: list[str] = []

    class ProviderService:
        def check_provider_health(self, provider_id: str) -> ProviderInfo:
            return store.providers[0]

        def delete_openai_compatible_provider(self, provider_id: str):
            raise AssertionError("cancelled deletion must not run")

    def cancel(_parent, _title, message, *_args):
        messages.append(message)
        return QMessageBox.StandardButton.Cancel

    monkeypatch.setattr(QMessageBox, "warning", cancel)
    store = WorkspaceStore()
    store.model_slots = [("large_model", "openai-compatible--lab/model-a")]
    store.personas = [
        PersonaSpec("coder", "Coding", "openai-compatible--lab/model-a", "medium", [])
    ]
    store.providers = [
        ProviderInfo(
            "openai-compatible--lab",
            "Lab",
            True,
            "Healthy",
            "healthy",
            "api_key",
            user_defined=True,
            has_credentials=True,
        )
    ]
    view = SettingsView(store, ProviderService())
    qtbot.addWidget(view)
    wait_for_idle_provider_rows(qtbot, view)
    delete = next(button for button in view.findChildren(QPushButton) if button.text() == "Delete")

    qtbot.mouseClick(delete, Qt.MouseButton.LeftButton)

    assert "slot large_model" in messages[0]
    assert "persona coder" in messages[0]
    assert "Other workspaces were not inspected" in messages[0]


@verifies(SWR.SWR_2125)
def test_custom_provider_delete_removes_row_from_list(qtbot, monkeypatch) -> None:
    class ProviderService:
        def check_provider_health(self, provider_id: str) -> ProviderInfo:
            return store.providers[0]

        def delete_openai_compatible_provider(self, provider_id: str):
            return SimpleNamespace(success=True, provider_id=provider_id, message="Deleted.")

        def refresh_provider_catalog(self) -> None:
            store.providers = []

    monkeypatch.setattr(
        QMessageBox, "warning", lambda *_args, **_kwargs: QMessageBox.StandardButton.Yes
    )
    store = WorkspaceStore()
    store.providers = [
        ProviderInfo(
            "openai-compatible--lab",
            "Lab",
            True,
            "Healthy",
            "healthy",
            "api_key",
            user_defined=True,
            has_credentials=True,
        )
    ]
    view = SettingsView(store, ProviderService())
    qtbot.addWidget(view)
    wait_for_idle_provider_rows(qtbot, view)
    delete = next(button for button in view.findChildren(QPushButton) if button.text() == "Delete")

    qtbot.mouseClick(delete, Qt.MouseButton.LeftButton)

    qtbot.waitUntil(lambda: not store.providers)
    assert not any(button.text() == "Delete" for button in view.findChildren(QPushButton))


@verifies(SWR.SWR_2125)
def test_rotaris_cloud_provider_shows_quick_start_and_authenticate_buttons(
    qtbot, monkeypatch
) -> None:
    opened: list[str] = []
    monkeypatch.setattr(
        QDesktopServices, "openUrl", lambda url: opened.append(url.toString()) or True
    )
    store = WorkspaceStore()
    store.providers = [
        ProviderInfo(
            "concrete-cloud",
            "Rotaris Cloud (recommended)",
            False,
            "",
            "warning",
            "pkce",
            quick_start_url="https://concrete-dynamics.com/rotaris",
        )
    ]
    view = SettingsView(store, None)
    qtbot.addWidget(view)

    quick_start = next(
        button for button in view.findChildren(QPushButton) if button.text() == "Quick Start"
    )
    authenticate = next(
        button for button in view.findChildren(QPushButton) if button.text() == "Authenticate"
    )
    assert authenticate.isEnabled()

    qtbot.mouseClick(quick_start, Qt.MouseButton.LeftButton)

    assert opened == ["https://concrete-dynamics.com/rotaris"]


@verifies(SWR.SWR_2003, SWR.SWR_2099)
def test_workspace_agent_tree_selects_agent_and_transcript_is_copyable(qtbot) -> None:
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.show()

    row = view.agent_tree._layout.itemAt(0).widget()
    assert row is not None
    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)

    assert store.selected_agent_id == "intent-classifier"
    assert (
        view.transcript_scroll.horizontalScrollBarPolicy() is Qt.ScrollBarPolicy.ScrollBarAlwaysOff
    )
    index = view.transcript_scroll.model().index(0, 0)
    view.transcript_scroll.setCurrentIndex(index)
    assert view.transcript_scroll.copy_selected_message() is True
    assert QGuiApplication.clipboard().text() == store.transcript[0].text
    assert view.transcript_scroll.accessibleName() == "Session transcript"


@verifies(SWR.SWR_2099)
def test_agent_transcript_filter_keeps_shared_context_and_target_events() -> None:
    events = [
        TranscriptEvent("12:00", "you", "shared prompt", kind="user"),
        TranscriptEvent("12:01", "orchestrator", "orchestrator response"),
        TranscriptEvent("12:02", "coding-agent-1", "child response"),
        TranscriptEvent("12:03", "coding-agent-1", "tests", kind="tool", tool="shell"),
        TranscriptEvent("12:04", "tester", "tester response"),
        TranscriptEvent("12:05", "system", "shared status", kind="system"),
    ]

    filtered = filter_transcript_for_agent(events, "coding-agent-1")

    assert [event.text for event in filtered] == [
        "shared prompt",
        "child response",
        "tests",
        "shared status",
    ]


@verifies(SWR.SWR_2421)
def test_persona_color_returns_stable_assignment_for_known_personas() -> None:
    """Each known persona gets a fixed, distinct color — never the green default."""
    known = [
        "coding-agent",
        "tester",
        "architect",
        "refactorer",
        "librarian",
        "docs-writer",
        "oracle",
        "planner",
        "intent-classifier",
        "codebase-analyst",
        "verifier",
        "backend-dev",
    ]
    colors = [theme.persona_color(p) for p in known]
    # Every known persona must have a color assigned (no empty returns).
    assert all(c for c in colors)
    # No known persona should fall back to the green "running" default.
    assert theme.tokens().color.run not in colors
    # All known personas must have distinct colors — no collisions.
    assert len(set(colors)) == len(known)


@verifies(SWR.SWR_2421)
def test_persona_color_unknown_deterministic() -> None:
    """Unknown persona names get a deterministic hash-based color."""
    c1 = theme.persona_color("custom-ml-agent")
    c2 = theme.persona_color("custom-ml-agent")
    c3 = theme.persona_color("another-custom")
    # Same name → same color.
    assert c1 == c2
    # Should be a real hex color from the ramp.
    seats = {theme.persona_color(name) for name in theme.known_personas()}
    assert c1 in seats
    assert c3 in seats


@verifies(SWR.SWR_2421)
def test_persona_color_empty_falls_back_to_run() -> None:
    """Empty persona returns the "running" default (backward compat)."""
    assert theme.persona_color("") == theme.tokens().color.run


@verifies(SWR.SWR_2421)
def test_role_color_uses_persona_for_unknown_roles() -> None:
    """When role is not one of the 4 hard-coded keys, persona drives the color."""
    assert _role_color("coding-agent-1", persona="coding-agent") == theme.persona_instance_color(
        "coding-agent", "coding-agent-1"
    )
    assert _role_color("tester", persona="tester") == theme.persona_color("tester")


@verifies(SWR.SWR_2421)
def test_role_color_backward_compat_no_persona() -> None:
    """Without a persona, unknown roles fall back to the "running" default.

    The attribution colour carries a *word* — the role label — so the fallback
    owes the body floor and takes the axis' text step, not the saturated step a
    status dot uses.
    """
    color = theme.tokens().color
    fallback = _role_color("unknown-agent")
    assert fallback == color.run_text
    assert _role_color("random-bot", persona="") == color.run_text
    floor = theme.tokens().min_text_contrast
    assert theme.contrast_ratio(fallback, color.readable_ground) >= floor


@verifies(SWR.SWR_2421)
def test_role_color_hardcoded_keys_ignore_persona() -> None:
    """The four hard-coded role keys ignore the persona argument."""
    color = theme.tokens().color
    assert _role_color("you", persona="coding-agent") == color.accent[300]
    assert _role_color("intent", persona="tester") == color.info_text
    assert _role_color("system", persona="architect") == color.info_text
    assert _role_color("orchestrator", persona="librarian") == color.accent[400]


@verifies(SWR.SWR_2435)
def test_persona_instance_color_stable() -> None:
    """Same persona/instance pair always resolves to the same color."""
    c1 = theme.persona_instance_color("coding-agent", "coding-agent-1")
    c2 = theme.persona_instance_color("coding-agent", "coding-agent-1")
    assert c1 == c2


@verifies(SWR.SWR_2435)
def test_persona_instance_color_differentiates_instances() -> None:
    """Sequential instances of the same persona never collide with a neighbour."""
    colors = [
        theme.persona_instance_color("coding-agent", f"coding-agent-{i}") for i in range(1, 6)
    ]
    assert len(set(colors)) == len(colors)
    assert all(a != b for a, b in zip(colors, colors[1:], strict=False))


@verifies(SWR.SWR_2435)
def test_persona_instance_color_stays_in_hue_family() -> None:
    """Instance shading adjusts lightness/chroma only, never hue.

    Measured in OKLCH, the space the shading is computed in, and swept over every
    persona rather than one: identity is the hue, so a shade that rotates it hands
    a reader a different agent's colour.
    """
    # Degrees, not "close enough": hue survives the arithmetic exactly and only
    # loses this much to rounding the result into 8-bit sRGB.
    tolerance = 2.0
    for persona in theme.known_personas():
        _, _, base_hue = theme.to_oklch(theme.persona_color(persona))
        for index in range(1, theme.shade_count() + 1):
            variant = theme.persona_instance_color(persona, f"{persona}-{index}")
            _, _, hue = theme.to_oklch(variant)
            # Shortest arc — a hue near 0° must not read as a 357° rotation.
            drift = abs((hue - base_hue + 180) % 360 - 180)
            assert drift < tolerance, (persona, index, variant, drift)


@verifies(SWR.SWR_2435)
def test_persona_instance_color_backward_compat() -> None:
    """Empty or persona-matching instance returns the exact base color."""
    assert theme.persona_instance_color("tester", "") == theme.persona_color("tester")
    assert theme.persona_instance_color("tester", "tester") == theme.persona_color("tester")


@verifies(SWR.SWR_2421)
def test_filter_transcript_preserves_persona_field() -> None:
    """filter_transcript_for_agent keeps the persona field on filtered events."""
    events = [
        TranscriptEvent("12:00", "you", "prompt", kind="user"),
        TranscriptEvent("12:01", "coding-agent-1", "msg", persona="coding-agent"),
        TranscriptEvent("12:02", "tester", "msg", persona="tester"),
    ]
    filtered = filter_transcript_for_agent(events, "coding-agent-1")
    assert len(filtered) == 2  # user + coding-agent-1
    assert filtered[1].persona == "coding-agent"


@verifies(SWR.SWR_2099, SWR.SWR_2122)
def test_workspace_transcript_follows_selected_agent(qtbot) -> None:
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    all_events = [
        view.transcript_scroll.transcript_model.event_at(index)
        for index in range(view.transcript_scroll.transcript_model.rowCount())
    ]
    assert "orchestrator" not in store.agents
    assert {event.role for event in all_events if event is not None} >= {
        "you",
        "orchestrator",
        "coding-agent-1",
        "tester",
        "system",
    }
    assert view.transcript_scope_button.text() == "All activity"

    store.select_agent("coding-agent-1")
    coding_events = [
        view.transcript_scroll.transcript_model.event_at(index)
        for index in range(view.transcript_scroll.transcript_model.rowCount())
    ]
    assert {event.role for event in coding_events if event is not None} == {
        "you",
        "coding-agent-1",
        "system",
    }

    store.select_agent("tester")
    tester_events = [
        view.transcript_scroll.transcript_model.event_at(index)
        for index in range(view.transcript_scroll.transcript_model.rowCount())
    ]
    assert {event.role for event in tester_events if event is not None} == {
        "you",
        "tester",
        "system",
    }
    qtbot.mouseClick(view.transcript_scope_button, Qt.MouseButton.LeftButton)
    assert store.selected_agent_id == ""
    assert view.transcript_scope_button.text() == "All activity"


@verifies(SWR.SWR_2016)
def test_workspace_renders_only_agent_messages_as_markdown(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent(
            "12:00",
            "orchestrator",
            '**bold** *italic* `inline` [docs](https://example.com)\n\n```python\nprint("hi")\n```',
        ),
        TranscriptEvent("12:01", "you", "**plain user text**", kind="user"),
        TranscriptEvent("12:02", "system", "**plain system text**", kind="system"),
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    model_body = _event_html(0, store.transcript[0], False)
    user_body = _event_html(1, store.transcript[1], False)
    system_body = _event_html(2, store.transcript[2], False)

    assert "<strong>bold</strong>" in model_body
    assert "<em>italic</em>" in model_body
    assert "font-family:" in model_body
    assert "background-color:" in model_body
    assert 'href="https://example.com"' in model_body
    assert user_body == "**plain user text**"
    assert system_body == "**plain system text**"


@verifies(SWR.SWR_2419)
def test_workspace_renders_created_and_truncated_file_diff(qtbot) -> None:
    """Productive use: a desktop user can read and copy a bounded created-file diff.
    Expected outcome: path, line semantics, colours, and truncation remain explicit.
    """
    diff = TranscriptDiff(
        path="src/new_widget.py",
        operation="create",
        created=True,
        added_lines=52,
        entries=[
            TranscriptDiffLine("add", 1, "def render():"),
            TranscriptDiffLine("add", 2, '    return "<safe>"'),
        ],
        truncated=True,
        remaining_changed_lines=50,
    )
    text = (
        "src/new_widget.py [Created] +52 -0\n"
        "[1]+ def render():\n"
        '[2]+     return "<safe>"\n'
        "… +50 more lines, diff truncated"
    )
    event = TranscriptEvent(
        "",
        "coder-1",
        text,
        kind="edit_diff",
        tool="write_file",
        diff=diff,
    )
    store = WorkspaceStore()
    store.transcript = [event]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.show()
    view._update_search_matches("safe")

    body = _event_html(0, event, False)
    color = theme.tokens().color
    assert "<strong>src/new_widget.py</strong>" in body
    assert "[Created]" in body
    # The counts and the source lines are words, so they take each axis' text
    # step; the saturated step is for the dots and rings that carry no glyphs.
    assert color.run_text in body
    assert color.fail_text in body
    assert "[1]" in body
    assert "+ def render():" in body
    assert "&lt;safe&gt;" in body
    assert "… +50 more lines, diff truncated" in body
    assert view._search_matches == [0]

    index = view.transcript_scroll.model().index(0, 0)
    view.transcript_scroll.setCurrentIndex(index)
    assert view.transcript_scroll.copy_selected_message() is True
    assert QGuiApplication.clipboard().text() == text
    for width, height in ((1000, 680), (1440, 900)):
        view.resize(width, height)
        qtbot.wait(0)
        option = QStyleOptionViewItem()
        option.initFrom(view.transcript_scroll)
        row_size = view.transcript_scroll.itemDelegate().sizeHint(
            option,
            index,
        )
        assert row_size.width() <= view.transcript_scroll.viewport().width()
        assert (
            view.transcript_scroll.horizontalScrollBarPolicy()
            is Qt.ScrollBarPolicy.ScrollBarAlwaysOff
        )


@verifies(SWR.SWR_2020, SWR.SWR_2081)
def test_transcript_delegate_opens_links_and_toggles_reasoning(qtbot, monkeypatch) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", "[docs](https://example.com)"),
        TranscriptEvent("12:01", "orchestrator", "private thought", kind="thinking"),
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    opened: list[str] = []
    monkeypatch.setattr(
        QDesktopServices, "openUrl", lambda url: opened.append(url.toString()) or True
    )

    link_index = view.transcript_scroll.model().index(0, 0)
    link_rect = view.transcript_scroll.visualRect(link_index)
    qtbot.mouseClick(
        view.transcript_scroll.viewport(),
        Qt.MouseButton.LeftButton,
        pos=link_rect.topLeft() + QPoint(199, 7),
    )

    assert opened == ["https://example.com"]

    reasoning_index = view.transcript_scroll.model().index(1, 0)
    reasoning_rect = view.transcript_scroll.visualRect(reasoning_index)
    qtbot.mouseClick(
        view.transcript_scroll.viewport(),
        Qt.MouseButton.LeftButton,
        pos=reasoning_rect.topLeft() + QPoint(230, 7),
    )

    reasoning_identity = _event_identity(store.transcript[1])
    assert reasoning_identity in view.transcript_scroll.transcript_delegate._expanded_reasoning
    assert "private thought" in _event_html(1, store.transcript[1], True)


@verifies(SWR.SWR_2417)
def test_transcript_delegate_toggles_tool_row_with_full_detail(qtbot) -> None:
    store = WorkspaceStore()
    tool_event = TranscriptEvent(
        "12:00",
        "orchestrator",
        "pytest -x -q",
        kind="tool",
        tool="shell",
        detail="3 passed…",
        full_text="pytest -x -q --the-full-untruncated-command",
        full_detail="3 passed in 0.21s, no failures, full untruncated output",
    )
    store.transcript = [tool_event]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    tool_index = view.transcript_scroll.model().index(0, 0)
    tool_rect = view.transcript_scroll.visualRect(tool_index)
    qtbot.mouseClick(
        view.transcript_scroll.viewport(),
        Qt.MouseButton.LeftButton,
        pos=tool_rect.topLeft() + QPoint(230, 7),
    )

    tool_identity = _event_identity(tool_event)
    assert tool_identity in view.transcript_scroll.transcript_delegate._expanded_tool
    expanded_html = _event_html(0, tool_event, False, True)
    assert "full-untruncated-command" in expanded_html
    assert "full untruncated output" in expanded_html

    qtbot.mouseClick(
        view.transcript_scroll.viewport(),
        Qt.MouseButton.LeftButton,
        pos=tool_rect.topLeft() + QPoint(230, 7),
    )
    assert tool_identity not in view.transcript_scroll.transcript_delegate._expanded_tool


@verifies(SWR.SWR_2417)
def test_transcript_delegate_tool_row_without_full_detail_is_not_expandable(qtbot) -> None:
    store = WorkspaceStore()
    tool_event = TranscriptEvent(
        "12:00",
        "orchestrator",
        "pytest -x -q",
        kind="tool",
        tool="shell",
        detail="3 passed",
    )
    store.transcript = [tool_event]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    tool_index = view.transcript_scroll.model().index(0, 0)
    tool_rect = view.transcript_scroll.visualRect(tool_index)
    qtbot.mouseClick(
        view.transcript_scroll.viewport(),
        Qt.MouseButton.LeftButton,
        pos=tool_rect.topLeft() + QPoint(199, 7),
    )

    assert view.transcript_scroll.transcript_delegate._expanded_tool == set()
    assert "<a href" not in _event_html(0, tool_event, False, False)


@verifies(SWR.SWR_2061)
def test_workspace_unchanged_transcript_refresh_emits_no_model_changes(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(100)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    changes: list[str] = []
    model = view.transcript_scroll.transcript_model
    model.dataChanged.connect(lambda *_args: changes.append("data"))
    model.rowsInserted.connect(lambda *_args: changes.append("insert"))
    model.rowsRemoved.connect(lambda *_args: changes.append("remove"))
    model.modelReset.connect(lambda: changes.append("reset"))

    store.transcript_changed.emit()

    assert changes == []


@verifies(SWR.SWR_2062)
def test_workspace_stream_update_only_changes_tail_model_row(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(100)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    changed_ranges: list[tuple[int, int]] = []
    model = view.transcript_scroll.transcript_model
    model.dataChanged.connect(
        lambda first, last, _roles: changed_ranges.append((first.row(), last.row()))
    )

    store.transcript[-1] = TranscriptEvent("12:01", "orchestrator", "Streaming update")
    store.transcript_changed.emit()

    assert changed_ranges == [(99, 99)]
    assert model.event_at(99) == store.transcript[-1]


@verifies(SWR.SWR_2021)
def test_markdown_renderer_handles_generated_lorem_markdown() -> None:
    doc = LoremMarkdownGenerator(seed=99).markdown(words=1500)
    html = markdown_to_html(doc)

    assert "<strong>" in html
    assert "<pre" in html or "font-family:" in html
    assert "<li" in html


@verifies(SWR.SWR_2017, SWR.SWR_2021)
def test_markdown_renderer_handles_partial_streams_autolinks_and_escapes_html() -> None:
    partial = markdown_to_html("```python\npartial")
    completed = markdown_to_html("```python\npartial\n```")
    linked = markdown_to_html("Visit https://example.com/docs now")
    escaped = markdown_to_html('<script>alert("no")</script>')

    assert "partial" in partial
    assert "partial" in completed
    assert 'href="https://example.com/docs"' in linked
    assert "<script>" not in escaped
    assert "&lt;script&gt;" in escaped


@verifies(SWR.SWR_2021)
def test_markdown_renderer_renders_gfm_tables_strikethrough_and_task_lists() -> None:
    table = markdown_to_html(
        "| Concept | What it does |\n|:---|---:|\n| Ralph Loop | Bounded loop |\n"
    )
    assert "<table" in table
    assert "<th" in table and "Concept" in table
    assert "<td" in table and "Ralph Loop" in table
    # raw pipes must not leak through as literal paragraph text
    assert "| Concept |" not in table
    # Qt needs inline borders/alignment; un-styled tables render invisibly
    assert "border:1px solid" in table
    assert "text-align:left" in table and "text-align:right" in table

    assert "<del>" in markdown_to_html("~~gone~~")
    checked = markdown_to_html("- [x] done\n- [ ] todo\n")
    assert "checkbox" in checked or "<li" in checked


@verifies(SWR.SWR_2021)
def test_transcript_document_sizes_markdown_headings_from_the_type_scale() -> None:
    """A `#` heading inside a row is a section label, not a page title: Qt's own 2em
    default reads as a second message rather than a heading in this one."""
    from rotaris.theme import tokens
    from rotaris.views.transcript import _document_css

    css = _document_css("message")
    scale = tokens().type.scale

    assert f"h1{{font-size:{scale.md}px" in css
    assert f"h2{{font-size:{scale.base}px" in css
    assert f"h3,h4,h5,h6{{font-size:{scale.sm}px" in css
    # every heading level stays inside the row's own ladder
    assert scale.md < scale.h3


@verifies(SWR.SWR_2082)
def test_markdown_cache_is_bounded_by_entries_and_content_size() -> None:
    clear_markdown_cache()
    base = "streaming markdown content\n" * 220

    for revision in range(300):
        markdown_to_html(f"{base}{revision}")

    info = markdown_cache_info()
    assert info.entries <= info.max_entries
    assert info.chars <= info.max_chars
    clear_markdown_cache()


@verifies(SWR.SWR_2079)
def test_transcript_operation_counts_are_deterministic() -> None:
    from rotaris.views.transcript import TranscriptListModel

    model = TranscriptListModel()
    first = TranscriptEvent("00:00", "agent", "one")
    changed = TranscriptEvent("00:00", "agent", "two")
    assert model.sync([first])
    assert model.sync([changed])
    assert not model.sync([changed])
    assert model.operation_counts == {
        "noop": 1,
        "insert": 1,
        "remove": 0,
        "update": 1,
        "reset": 0,
        # The delta path's own counter (SWR-2454); ``sync`` never refuses.
        "refused": 0,
    }


@verifies(SWR.SWR_2078)
def test_workspace_large_transcript_does_not_allocate_widgets_per_event(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(1000)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    assert view.transcript_scroll.transcript_model.rowCount() == 1000
    assert len(view.transcript_scroll.findChildren(QWidget)) < 20


@verifies(SWR.SWR_2080)
def test_workspace_transcript_has_no_scrollable_phantom_space(qtbot) -> None:
    store = sample_store()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(100)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    view.transcript_scroll.scrollToBottom()
    qtbot.waitUntil(
        lambda: (
            view.transcript_scroll.verticalScrollBar().value()
            == view.transcript_scroll.verticalScrollBar().maximum()
        )
    )


@verifies(SWR.SWR_2080)
def test_workspace_wrapped_transcript_bottom_stays_at_scroll_tail(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent(
            "12:00", "orchestrator", LoremMarkdownGenerator(seed=88).markdown(words=1000)
        )
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    assert scrollbar.maximum() > 0

    scrollbar.setValue(scrollbar.maximum())
    assert scrollbar.value() == scrollbar.maximum()


@verifies(SWR.SWR_2080, SWR.SWR_2063)
def test_workspace_wrapped_transcript_resize_preserves_tail(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent(
            "12:00", "orchestrator", LoremMarkdownGenerator(seed=88).markdown(words=1000)
        )
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1500, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    qtbot.waitUntil(lambda: scrollbar.maximum() > 0)
    scrollbar.setValue(scrollbar.maximum())
    old_maximum = scrollbar.maximum()
    view.resize(1100, 700)

    qtbot.waitUntil(
        lambda: scrollbar.maximum() != old_maximum and scrollbar.value() == scrollbar.maximum()
    )


@verifies(SWR.SWR_2080)
def test_workspace_transcript_shrink_has_no_phantom_scroll_frame(qtbot) -> None:
    store = sample_store()
    store.select_agent("orchestrator")
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(100)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    assert scrollbar.maximum() > 0

    # Session polling replaces the complete transcript. A shorter snapshot
    # must collapse the old scroll range before Qt can paint an empty frame.
    store.transcript = [TranscriptEvent("12:01", "orchestrator", "Only current output")]
    store.transcript_changed.emit()

    qtbot.waitUntil(lambda: scrollbar.maximum() == 0 and scrollbar.value() == 0)


@verifies(SWR.SWR_2081)
def test_workspace_transcript_only_follows_tail_when_already_at_tail(qtbot) -> None:
    store = sample_store()
    store.select_agent("orchestrator")
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(100)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    assert scrollbar.maximum() > 0

    scrollbar.triggerAction(QAbstractSlider.SliderAction.SliderPageStepSub)
    qtbot.waitUntil(lambda: scrollbar.value() < scrollbar.maximum())
    saved_scroll = scrollbar.value()
    old_maximum = scrollbar.maximum()
    store.append_event(TranscriptEvent("12:01", "orchestrator", "New output"))
    qtbot.waitUntil(lambda: scrollbar.maximum() > old_maximum)
    assert scrollbar.value() == saved_scroll

    scrollbar.triggerAction(QAbstractSlider.SliderAction.SliderToMaximum)
    qtbot.waitUntil(lambda: scrollbar.value() == scrollbar.maximum())
    store.append_event(TranscriptEvent("12:02", "orchestrator", "Tail output"))
    qtbot.waitUntil(lambda: scrollbar.value() == scrollbar.maximum())


@verifies(SWR.SWR_2081)
def test_workspace_transcript_detaches_after_any_upward_scroll(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(100)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    qtbot.waitUntil(lambda: scrollbar.maximum() > 1)

    scrollbar.triggerAction(QAbstractSlider.SliderAction.SliderSingleStepSub)
    qtbot.waitUntil(lambda: scrollbar.value() < scrollbar.maximum())
    saved_scroll = scrollbar.value()
    old_maximum = scrollbar.maximum()
    store.append_event(TranscriptEvent("12:01", "orchestrator", "New output"))

    qtbot.waitUntil(lambda: scrollbar.maximum() > old_maximum)
    assert scrollbar.value() == saved_scroll
    assert view.new_output_button.isVisible() is True


@verifies(SWR.SWR_2081)
def test_workspace_transcript_detached_scroll_stays_detached_after_resize(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent(
            "12:00", "orchestrator", LoremMarkdownGenerator(seed=88).markdown(words=1000)
        )
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1500, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    qtbot.waitUntil(lambda: scrollbar.maximum() > 1)

    scrollbar.triggerAction(QAbstractSlider.SliderAction.SliderSingleStepSub)
    qtbot.waitUntil(lambda: scrollbar.value() < scrollbar.maximum())
    view.resize(1200, 700)

    qtbot.waitUntil(lambda: scrollbar.value() < scrollbar.maximum())


@verifies(SWR.SWR_2080, SWR.SWR_2063)
def test_workspace_following_tail_never_jumps_during_new_message_layout(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(200)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    qtbot.waitUntil(lambda: scrollbar.maximum() > 0)
    view.transcript_scroll.scrollToBottom()
    qtbot.waitUntil(lambda: scrollbar.value() == scrollbar.maximum())
    old_tail = scrollbar.value()
    observed_values: list[int] = []
    scrollbar.valueChanged.connect(observed_values.append)

    store.append_event(
        TranscriptEvent(
            "12:01",
            "orchestrator",
            LoremMarkdownGenerator(seed=91).markdown(words=1500),
        )
    )
    qtbot.waitUntil(lambda: view.transcript_scroll.transcript_model.rowCount() == 201)
    qtbot.wait(100)

    assert scrollbar.value() == scrollbar.maximum(), (
        old_tail,
        observed_values,
        scrollbar.value(),
        scrollbar.maximum(),
    )
    assert all(value >= old_tail for value in observed_values)


@verifies(SWR.SWR_2081)
def test_workspace_tail_indicator_tracks_user_scroll_intent(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(100)
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    scrollbar = view.transcript_scroll.verticalScrollBar()
    qtbot.waitUntil(lambda: scrollbar.maximum() > 0)
    view.transcript_scroll.scrollToBottom()
    qtbot.waitUntil(lambda: scrollbar.value() == scrollbar.maximum())

    assert view.transcript_scroll.property("followingTail") is True
    # The follow indicator is a border, not a label — the graphical step.
    assert theme.tokens().color.run in view.transcript_scroll.styleSheet()

    scrollbar.triggerAction(QAbstractSlider.SliderAction.SliderSingleStepSub)
    qtbot.waitUntil(lambda: view.transcript_scroll.property("followingTail") is False)

    scrollbar.triggerAction(QAbstractSlider.SliderAction.SliderToMaximum)
    qtbot.waitUntil(lambda: view.transcript_scroll.property("followingTail") is True)


@verifies(SWR.SWR_2083)
def test_workspace_transcript_viewport_stays_opaque_when_message_arrives(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = [TranscriptEvent("12:00", "orchestrator", "Existing output")]
    view = WorkspaceView(store)
    view.setStyleSheet(theme.build_qss(theme.tokens()))
    qtbot.addWidget(view)
    view.show()
    qtbot.waitExposed(view)

    for index, size in enumerate(((1000, 680), (1440, 900)), start=2):
        view.resize(*size)
        store.append_event(TranscriptEvent("12:01", "orchestrator", "New output"))
        qtbot.waitUntil(
            lambda expected=index: view.transcript_scroll.transcript_model.rowCount() == expected
        )

        viewport_image = view.transcript_scroll.viewport().grab().toImage()
        background = viewport_image.pixelColor(
            viewport_image.width() // 2,
            viewport_image.height() - 4,
        )
        assert background.alpha() == 255, size
        assert background.name() == theme.tokens().color.bg, size


# ── truthful model/reasoning controls workstream ──────────────────────────


@verifies(SWR.SWR_2086)
def test_workspace_inspector_child_agent_controls_disabled(qtbot) -> None:
    """When a non-orchestrator agent is selected, the model/reasoning controls
    must be disabled with an explanatory scope note."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    store.select_agent("coding-agent-1")

    assert view.inspector_model.isEnabled() is False
    assert view.inspector_reasoning.isEnabled() is False
    assert "per persona" in view.scope_note.text()
    assert "Settings" in view.scope_note.text()


@verifies(SWR.SWR_2084, SWR.SWR_2124)
def test_workspace_inspector_orchestrator_controls_disabled_without_run_bridge(qtbot) -> None:
    """The orchestrator's controls are only enabled when a live run_bridge is
    available on the owning window. Without one they stay disabled."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    store.select_agent("orchestrator")

    # No window → no run_bridge → controls disabled
    assert view.inspector_model.isEnabled() is False
    assert view.inspector_reasoning.isEnabled() is False


@verifies(SWR.SWR_2084, SWR.SWR_2910)
def test_workspace_inspector_is_empty_only_when_no_agent_has_spoken(qtbot) -> None:
    """With nothing selected and nothing in the transcript there is no agent to
    describe, so the inspector keeps its empty state and disabled controls."""
    store = sample_store()
    store.set_transcript([])
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    store.select_agent("")

    assert view.inspector_model.isEnabled() is False
    assert view.inspector_reasoning.isEnabled() is False
    assert view.inspector_name.text() == "—"
    assert view.inspector_follow_tag.isHidden() is True


@verifies(SWR.SWR_2910)
def test_inspector_follows_the_generating_agent_without_scoping_the_transcript(qtbot) -> None:
    """Nothing selected: the panel describes whoever wrote the newest row, and
    the transcript still shows the whole run."""
    store = sample_store()
    # This is about scope, not grouping: with grouping on, a row count no longer
    # answers "is anything filtered out" (SWR-2432 folds adjacent same-family calls).
    store.ui.group_tool_calls = False
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    assert store.selected_agent_id == ""
    assert view.inspector_name.text() == "tester"
    assert view.inspector_follow_tag.isHidden() is False
    assert "tester" in view.inspector_name.accessibleDescription()
    assert view.inspector_meta.text().startswith("running")
    assert view.tools_layout.count() == len(store.agents["tester"].tools)
    assert view.transcript_scope_button.text() == "All activity"
    assert view.transcript_scroll.transcript_model.rowCount() == len(store.transcript)


@verifies(SWR.SWR_3010)
def test_inspector_lists_native_and_mcp_tools(qtbot) -> None:
    """Productive use: a user asks what the selected agent can actually do.

    Expected outcome: the panel lists the agent's native tools, then a heading per
    MCP server followed by that server's tools, and each chip carries the right
    used/active state.
    """
    store = sample_store()
    agent = store.agents["tester"]
    agent.tools = ["read_file", "terminal"]
    agent.mcp_tools = {"serena": ["find_symbol", "get_symbols_overview"]}
    agent.called_tools = ["find_symbol"]
    agent.active_tools = ["terminal"]
    store.set_agents(list(store.agents.values()))
    store.select_agent("tester")

    view = WorkspaceView(store)
    qtbot.addWidget(view)

    chips = [
        view.tools_layout.itemAt(index).widget().text()
        for index in range(view.tools_layout.count())
    ]

    assert chips == [
        "read_file · not used",
        "terminal · active",
        "serena",
        "find_symbol · used",
        "get_symbols_overview · not used",
    ]


@verifies(SWR.SWR_3010)
def test_inspector_shows_no_mcp_heading_for_an_agent_without_mcp_tools(qtbot) -> None:
    """A server that granted nothing must not leave an empty heading behind."""
    store = sample_store()
    agent = store.agents["tester"]
    agent.tools = ["read_file"]
    agent.mcp_tools = {"serena": []}
    store.set_agents(list(store.agents.values()))
    store.select_agent("tester")

    view = WorkspaceView(store)
    qtbot.addWidget(view)

    assert view.tools_layout.count() == 1


@verifies(SWR.SWR_2910)
def test_a_new_row_moves_the_inspector_to_the_agent_that_wrote_it(qtbot) -> None:
    """Following means following: the next agent to speak takes the panel."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    assert view.inspector_name.text() == "tester"

    store.append_event(
        TranscriptEvent("14:31:00", "coding-agent-1", "back to the edit", persona="coding-agent")
    )

    assert view.inspector_name.text() == "coding-agent-1"
    assert view.context_ring.pct == store.agents["coding-agent-1"].ctx_pct
    assert store.selected_agent_id == ""


@verifies(SWR.SWR_2910)
def test_selecting_an_agent_pins_the_inspector_against_later_rows(qtbot) -> None:
    """A user who picks an agent keeps it, however loud the rest of the run is."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    store.select_agent("planner")
    store.append_event(TranscriptEvent("14:31:00", "tester", "still running", persona="tester"))

    assert view.inspector_name.text() == "planner"
    assert view.inspector_follow_tag.isHidden() is True
    assert view.inspector_name.accessibleDescription() == ""

    store.select_agent("")

    assert view.inspector_name.text() == "tester"


@verifies(SWR.SWR_2910)
def test_inspector_actions_target_the_followed_agent(qtbot) -> None:
    """Steer, Cancel, and Pop out act on the agent the panel is showing."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    steered: list[str] = []
    cancelled: list[str] = []
    popped: list[str] = []
    view.steer_requested.connect(steered.append)
    view.cancel_requested.connect(cancelled.append)
    view.agent_popout_requested.connect(popped.append)

    qtbot.mouseClick(view.steer_button, Qt.MouseButton.LeftButton)
    qtbot.mouseClick(view.cancel_button, Qt.MouseButton.LeftButton)
    qtbot.mouseClick(view.popout_button, Qt.MouseButton.LeftButton)

    assert steered == ["tester"]
    assert cancelled == ["tester"]
    assert popped == ["tester"]


@verifies(SWR.SWR_2084)
def test_workspace_inspector_reflects_agent_model_and_reasoning(qtbot) -> None:
    """Selecting an agent populates its model and reasoning values in the
    inspector controls."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    store.select_agent("coding-agent-1")

    assert view.inspector_model.currentText() == "copilot/gpt-5"
    # The inspector_reasoning is a SegmentedControl; its value should reflect
    # the agent's reasoning. sample_store children don't set reasoning explicitly
    # so they fall back to the default "medium".


@verifies(SWR.SWR_2089)
def test_workspace_inspector_selects_persona_tab_for_agent(qtbot) -> None:
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    view.inspect_agent("coding-agent-1")

    assert view.inspector_tabs.tabText(view.inspector_tabs.currentIndex()) == "coding-agent"
    assert store.selected_agent_id == "coding-agent-1"


@verifies(SWR.SWR_2091)
def test_workspace_inspector_popout_emits_selected_agent(qtbot) -> None:
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.inspect_agent("coding-agent-1")

    with qtbot.waitSignal(view.agent_popout_requested) as blocker:
        qtbot.mouseClick(view.popout_button, Qt.MouseButton.LeftButton)

    assert blocker.args == ["coding-agent-1"]


@verifies(SWR.SWR_2090)
def test_settings_exposes_agent_popout_toggle(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store)
    qtbot.addWidget(view)

    with qtbot.waitSignal(view.agent_popout_changed) as blocker:
        qtbot.mouseClick(view.agent_popout_toggle, Qt.MouseButton.LeftButton)

    assert blocker.args == [True]


@verifies(SWR.SWR_2420)
def test_set_auto_collapse_tools_store_mutation(qtbot) -> None:
    """Toggling auto_collapse_tools mutates UiState and emits ui_changed."""
    store = sample_store()
    assert store.ui.auto_collapse_tools is False

    with qtbot.waitSignal(store.ui_changed):
        store.set_auto_collapse_tools(True)

    assert store.ui.auto_collapse_tools is True
    assert store.ui.settings_dirty is True

    # Idempotent — no signal on same value
    store.ui.settings_dirty = False
    store.set_auto_collapse_tools(True)
    assert store.ui.settings_dirty is False


@verifies(SWR.SWR_2420)
def test_settings_display_tab_exposes_auto_collapse_toggle(qtbot) -> None:
    store = sample_store()
    view = SettingsView(store)
    qtbot.addWidget(view)

    # Switch to Display tab
    view.set_active_tab("display")
    qtbot.waitUntil(lambda: view.tabs.currentIndex() == 4)

    assert view.auto_collapse_tools_toggle.isChecked() is False

    qtbot.mouseClick(view.auto_collapse_tools_toggle, Qt.MouseButton.LeftButton)
    assert store.ui.auto_collapse_tools is True
    assert store.ui.settings_dirty is True


@verifies(SWR.SWR_2420)
def test_event_html_auto_collapsed_renders_collapsed(qtbot) -> None:
    """_event_html with auto_collapsed=True forces collapsed view regardless of tool_expanded."""
    tool_event = TranscriptEvent(
        "12:00",
        "orchestrator",
        "summary text",
        kind="tool",
        tool="shell",
        detail="3 passed",
        full_text="full command text goes here",
        full_detail="full detail text goes here",
    )

    # auto_collapsed=True forces collapsed even when tool_expanded=True: name + chevron only
    auto_html = _event_html(0, tool_event, False, tool_expanded=True, auto_collapsed=True)
    assert "shell" in auto_html
    assert "summary text" not in auto_html
    assert "3 passed" not in auto_html
    assert "full command" not in auto_html
    assert "full detail" not in auto_html
    assert "▸" in auto_html  # Chevron pointing right = collapsed

    # Same event without auto-collapse but with tool_expanded shows full text
    expanded_html = _event_html(0, tool_event, False, tool_expanded=True, auto_collapsed=False)
    assert "full command" in expanded_html
    assert "full detail" in expanded_html
    assert "▾" in expanded_html  # Chevron pointing down = expanded

    # auto_collapsed=True makes chevron clickable even without has_more
    no_more_event = TranscriptEvent("12:00", "orchestrator", "simple", kind="tool", tool="shell")
    auto_no_more = _event_html(0, no_more_event, False, tool_expanded=False, auto_collapsed=True)
    # Clickable even without has_more
    assert '<a href="rotaris-tool:0"' in auto_no_more


@verifies(SWR.SWR_2420)
def test_transcript_delegate_recent_tool_indices(qtbot) -> None:
    """_recent_tool_indices returns the last two tool-event rows."""
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "user", "hello", kind="message"),
        TranscriptEvent("12:01", "agent", "tool a", kind="tool", tool="shell"),
        TranscriptEvent("12:02", "agent", "tool b", kind="tool", tool="edit"),
        TranscriptEvent("12:03", "agent", "tool c", kind="tool", tool="shell"),
        TranscriptEvent("12:04", "agent", "done", kind="message"),
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    delegate = view.transcript_scroll.transcript_delegate
    recent = delegate._recent_tool_indices()
    assert recent == {2, 3}  # The last two tool events (indices 2 and 3)

    # With fewer than 2 tool events, all are recent
    store.transcript = [
        TranscriptEvent("12:00", "agent", "only tool", kind="tool", tool="shell"),
        TranscriptEvent("12:01", "agent", "message", kind="message"),
    ]
    store.transcript_changed.emit()
    delegate._recent_tool_cache = None
    recent = delegate._recent_tool_indices()
    assert recent == {0}


@verifies(SWR.SWR_2420)
def test_auto_collapse_toggle_refreshes_transcript(qtbot) -> None:
    """Toggling auto-collapse through the store triggers a transcript re-layout."""
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent(
            "12:00",
            "agent",
            "old tool",
            kind="tool",
            tool="shell",
            full_text="old full text",
            detail="old detail",
            full_detail="old full detail",
        ),
        TranscriptEvent(
            "12:01", "agent", "old tool 2", kind="tool", tool="shell", full_text="old2 full text"
        ),
        TranscriptEvent(
            "12:02",
            "agent",
            "latest tool",
            kind="tool",
            tool="edit",
            full_text="latest full text",
            detail="latest detail",
            full_detail="latest full detail",
        ),
        TranscriptEvent("12:03", "agent", "message", kind="message"),
    ]
    # Auto-collapse is a per-row policy: keep the rows one-per-call so the row
    # indices below mean what they say (SWR-2432 would fold the two shell calls).
    store.ui.group_tool_calls = False
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    delegate = view.transcript_scroll.transcript_delegate
    # Enable auto-collapse
    store.set_auto_collapse_tools(True)

    recent = delegate._recent_tool_indices()
    # Latest tool is row 1 (index 1) — it should be in recent, row 0 should not
    assert 1 in recent
    assert 0 not in recent

    # Verify auto_collapse_active works correctly
    assert delegate._auto_collapse_active(0, store.transcript[0]) is True  # old, collapsed
    assert delegate._auto_collapse_active(1, store.transcript[1]) is False  # recent, expanded
    assert delegate._auto_collapse_active(2, store.transcript[2]) is False  # not a tool


@verifies(SWR.SWR_2420)
def test_auto_collapse_manual_expand_overrides(qtbot) -> None:
    """Manually expanded tool rows override auto-collapse and render expanded."""
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent(
            "12:00", "agent", "old tool", kind="tool", tool="shell", full_text="old full text"
        ),
        TranscriptEvent(
            "12:01", "agent", "old tool 2", kind="tool", tool="shell", full_text="old2 full text"
        ),
        TranscriptEvent(
            "12:02", "agent", "latest tool", kind="tool", tool="edit", full_text="latest full text"
        ),
        TranscriptEvent("12:03", "agent", "message", kind="message"),
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    delegate = view.transcript_scroll.transcript_delegate
    store.set_auto_collapse_tools(True)

    # Without manual expansion, row 0 is auto-collapsed (not recent)
    assert delegate._auto_collapse_active(0, store.transcript[0]) is True

    # Mark row 0 as manually expanded (simulates user clicking the chevron)
    delegate._expanded_tool.add(_event_identity(store.transcript[0]))

    # Manual expand overrides auto-collapse
    assert delegate._auto_collapse_active(0, store.transcript[0]) is False

    # Row 1 is recent, never auto-collapsed
    assert delegate._auto_collapse_active(1, store.transcript[1]) is False

    # Row 3 is a message, never auto-collapsed
    assert delegate._auto_collapse_active(3, store.transcript[3]) is False


@verifies(SWR.SWR_2433)
def test_delegation_context_event_contains_delegate_fields() -> None:
    agent = AgentNode(
        id="child-1",
        name="child-1",
        persona="coding-agent",
        parent_id="orchestrator",
        depends_on=["planner"],
        category="deep",
        run_in_background=True,
        delegation_task="TASK: implement feature",
        delegation_session_id="session-1",
        inherited_context=["researcher"],
    )

    event = delegation_context_event(agent)
    fields = json.loads(event.text)

    assert event.kind == "delegation_context"
    assert event.role == "child-1"
    assert event.persona == "coding-agent"
    assert fields == {
        "task_name": "child-1",
        "persona": "coding-agent",
        "category": "deep",
        "run_in_background": True,
        "task": "TASK: implement feature",
        "depends_on": ["planner"],
        "inherited_context": ["researcher"],
    }


@verifies(SWR.SWR_2433)
def test_delegation_context_html_omits_empty_optional_fields() -> None:
    agent = AgentNode(
        id="child-1",
        name="child-1",
        persona="tester",
        parent_id="orchestrator",
        delegation_task="Run checks",
    )
    event = delegation_context_event(agent)

    expanded = _event_html(0, event, False, delegation_collapsed=False)
    collapsed = _event_html(0, event, False, delegation_collapsed=True)

    assert "child-1" in expanded
    assert "tester" in expanded
    assert "Mode: blocking" in expanded
    assert "Run checks" in expanded
    assert "Category:" not in expanded
    assert "Depends on:" not in expanded
    assert "Inherited context:" not in expanded
    assert "Run checks" not in collapsed
    assert "Mode:" not in collapsed


@verifies(SWR.SWR_2433)
def test_workspace_visible_transcript_inserts_delegation_header_for_child(qtbot) -> None:
    store = WorkspaceStore()
    store.set_agents(
        [
            AgentNode(id="root", name="root", persona="orchestrator"),
            AgentNode(
                id="child",
                name="child",
                persona="coding-agent",
                parent_id="root",
                category="quick",
                run_in_background=True,
                delegation_task="Fix focused bug",
                inherited_context=["analyst"],
            ),
        ]
    )
    store.set_transcript(
        [
            TranscriptEvent("12:00", "you", "start", kind="user"),
            TranscriptEvent("12:01", "child", "done", persona="coding-agent"),
        ]
    )
    store.select_agent("child")
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    events = view._visible_transcript()

    assert events[0].kind == "delegation_context"
    assert json.loads(events[0].text)["task"] == "Fix focused bug"
    assert [event.role for event in events[1:]] == ["you", "child"]


@verifies(SWR.SWR_2433)
def test_workspace_visible_transcript_omits_delegation_header_for_root_and_full_run(qtbot) -> None:
    store = WorkspaceStore()
    store.set_agents([AgentNode(id="root", name="root", persona="orchestrator")])
    store.set_transcript([TranscriptEvent("12:00", "root", "root output")])
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    store.select_agent("root")
    root_events = view._visible_transcript()
    store.select_agent("")
    full_events = view._visible_transcript()

    assert [event.kind for event in root_events] == ["message"]
    assert [event.kind for event in full_events] == ["message"]


@verifies(SWR.SWR_2433)
def test_delegation_context_collapse_state_is_transient(qtbot) -> None:
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    delegate = view.transcript_scroll.transcript_delegate

    delegate._delegation_collapsed.add(
        _event_identity(TranscriptEvent("", "child", "{}", kind="delegation_context"))
    )
    collapsed_key = delegate._size_key(
        0,
        800,
        TranscriptEvent("", "child", "{}", kind="delegation_context"),
    )
    delegate.clear_caches()
    expanded_key = delegate._size_key(
        0,
        800,
        TranscriptEvent("", "child", "{}", kind="delegation_context"),
    )

    assert collapsed_key != expanded_key
    assert delegate._delegation_collapsed == set()


@verifies(SWR.SWR_2099)
def test_agent_tab_mirrors_only_its_agent_transcript_and_live_updates(qtbot) -> None:
    from rotaris.views.agent_window import AgentWindow

    store = sample_store()
    window = AgentWindow(store, "coding-agent")
    qtbot.addWidget(window)
    tab = window.tabs.widget(0)
    assert tab is not None
    assert tab.agent_id == "coding-agent-1"

    model = tab.transcript_scroll.transcript_model
    initial_roles = {
        event.role
        for index in range(model.rowCount())
        if (event := model.event_at(index)) is not None
    }
    assert initial_roles == {"you", "coding-agent-1", "system"}

    initial_count = model.rowCount()
    store.append_event(TranscriptEvent("15:00", "coding-agent-2", "other agent"))
    assert model.rowCount() == initial_count

    store.append_event(TranscriptEvent("15:01", "coding-agent-1", "new target output"))
    assert model.rowCount() == initial_count + 1
    event = model.event_at(model.rowCount() - 1)
    assert event is not None
    assert event.text == "new target output"


@verifies(SWR.SWR_3010)
def test_popped_out_agent_lists_the_same_mcp_tools_as_the_panel(qtbot) -> None:
    """One agent must not describe itself two ways depending on the window."""
    from PySide6.QtWidgets import QLabel

    from rotaris.views.agent_window import AgentWindow

    store = sample_store()
    agent = store.agents["coding-agent-1"]
    agent.tools = ["read_file"]
    agent.mcp_tools = {"serena": ["find_symbol", "replace_symbol_body"]}
    store.set_agents(list(store.agents.values()))

    window = AgentWindow(store, "coding-agent")
    qtbot.addWidget(window)
    tab = window.tabs.widget(0)
    assert tab is not None

    texts = [label.text() for label in tab.findChildren(QLabel)]

    assert "Available: read_file" in texts
    assert "serena: find_symbol, replace_symbol_body" in texts


@verifies(SWR.SWR_2086, SWR.SWR_2087)
def test_agent_tab_instance_controls_are_read_only(qtbot) -> None:
    """_AgentTab must display model and reasoning as read-only QLabels
    (no QComboBox or SegmentedControl)."""
    from PySide6.QtWidgets import QComboBox

    from rotaris.views.agent_window import AgentWindow

    store = sample_store()
    window = AgentWindow(store, "coding-agent")
    qtbot.addWidget(window)

    # The first (and only) tab should be _AgentTab for coding-agent-1
    tab = window.tabs.widget(0)
    assert tab is not None

    # Verify no editable model/reasoning controls exist
    combos = tab.findChildren(QComboBox)
    assert len(combos) == 0, f"Expected 0 QComboBox, found {len(combos)}"

    # Verify the model and reasoning values appear as QLabels
    from PySide6.QtWidgets import QLabel

    labels = tab.findChildren(QLabel)
    label_texts = {lbl.text() for lbl in labels}
    assert "copilot/gpt-5" in label_texts, f"Model value not found in labels: {label_texts}"


@verifies(SWR.SWR_2084, SWR.SWR_2085)
def test_workspace_run_header_calls_bridge_on_model_change(qtbot) -> None:
    """A live run can switch its entry model from the Run header."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    switches: list[str] = []

    class FakeBridge:
        running = True

        def switch_entry_model(self, model_key: str) -> bool:
            switches.append(model_key)
            return True

        def switch_entry_reasoning(self, reasoning: str) -> bool:
            return True

    view.window().run_bridge = FakeBridge()
    replacement = next(
        m
        for m in [view.run_model_combo.itemText(i) for i in range(view.run_model_combo.count())]
        if m != "copilot/gpt-5"
    )
    view._on_run_model_changed(replacement)

    assert switches == [replacement]


@verifies(SWR.SWR_2085)
def test_workspace_run_header_calls_bridge_on_reasoning_change(qtbot) -> None:
    """A live run can switch its entry reasoning from the Run header."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    reasoning_calls: list[str] = []

    class FakeBridge:
        running = True

        def switch_entry_model(self, model_key: str) -> bool:
            return True

        def switch_entry_reasoning(self, reasoning: str) -> bool:
            reasoning_calls.append(reasoning)
            return True

    view.window().run_bridge = FakeBridge()
    view._on_run_reasoning_changed("reasoning: low")

    assert reasoning_calls == ["low"]


@verifies(SWR.SWR_2086, SWR.SWR_2122)
def test_workspace_task_inspector_model_controls_are_read_only(qtbot) -> None:
    """Task selection never grants root model or reasoning controls."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    store.select_agent("coding-agent-1")

    assert view.inspector_model.isEnabled() is False
    assert view.inspector_reasoning.isEnabled() is False
    assert "per-agent" in view.context_scope_note.text().lower()


@verifies(SWR.SWR_2084, SWR.SWR_2124)
def test_workspace_run_header_ignores_changes_when_run_not_active(qtbot) -> None:
    """Run-level handlers do nothing when no run is active."""
    store = sample_store()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    switches: list[str] = []

    class FakeBridge:
        running = False

        def switch_entry_model(self, model_key: str) -> bool:
            switches.append(model_key)
            return True

        def switch_entry_reasoning(self, reasoning: str) -> bool:
            switches.append(reasoning)
            return True

    view.window().run_bridge = FakeBridge()
    view._on_run_model_changed("copilot/gpt-5-mini")
    view._on_run_reasoning_changed("reasoning: low")

    assert switches == []


@verifies(SWR.SWR_2422)
def test_question_stepper_freeform_selection_and_escape_are_consistent(qtbot) -> None:
    """Productive use: a user can answer or cancel a step without stale or duplicate input.
    Expected outcome: typing enables submission, option choice clears freeform, Escape cancels once.
    """
    stepper = QuestionStepper()
    qtbot.addWidget(stepper)
    stepper.set_questions(
        [
            QuestionStep(
                id="scope",
                title="Choose scope",
                options=(QuestionOption("Small"),),
                allow_freeform=True,
            )
        ]
    )
    stepper.show()
    qtbot.keyClicks(stepper._freeform_input, "custom note")
    assert stepper._submit_button.isEnabled()

    option = stepper.findChild(_OptionCard)
    assert option is not None
    qtbot.mouseClick(option, Qt.MouseButton.LeftButton)
    assert not stepper._freeform_input.isVisible()
    assert stepper._answers["scope"] == {
        "selected_option": "Small",
        "freeform_text": None,
    }

    cancelled: list[bool] = []
    stepper.cancelled.connect(lambda: cancelled.append(True))
    qtbot.keyPress(stepper, Qt.Key.Key_Escape)
    assert cancelled == [True]


def _attribution_transcript() -> list[TranscriptEvent]:
    return [
        TranscriptEvent("12:00", "you", "please build it", kind="user"),
        TranscriptEvent(
            "12:01",
            "analyst-1",
            "src/app.py",
            kind="tool",
            tool="read_file",
            persona="codebase-analyst",
        ),
        TranscriptEvent(
            "12:02",
            "analyst-1",
            "pattern",
            kind="tool",
            tool="grep",
            persona="codebase-analyst",
        ),
        TranscriptEvent("12:03", "analyst-1", "found the seam", persona="codebase-analyst"),
    ]


@verifies(SWR.SWR_2906)
def test_transcript_block_start_rows_reserve_attribution_label_height(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = _attribution_transcript()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    delegate = view.transcript_scroll.itemDelegate()
    model = view.transcript_scroll.model()
    option = QStyleOptionViewItem()
    option.initFrom(view.transcript_scroll)

    block_start_height = delegate.sizeHint(option, model.index(1, 0)).height()
    continuation_height = delegate.sizeHint(option, model.index(2, 0)).height()

    assert block_start_height >= _attribution_label_height()
    # The continuation tool row has no second label line to accommodate.
    assert continuation_height < _attribution_label_height()

    # Paint path smoke test: the delegate renders labels and continuation bars.
    assert not view.transcript_scroll.grab().isNull()


@verifies(SWR.SWR_2906)
def test_transcript_attribution_stays_correct_across_incremental_sync(qtbot) -> None:
    store = WorkspaceStore()
    store.transcript = _attribution_transcript()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)

    model = view.transcript_scroll.transcript_model
    delegate = view.transcript_scroll.itemDelegate()
    option = QStyleOptionViewItem()
    option.initFrom(view.transcript_scroll)

    # Streamed tail: the appended row belongs to a new agent → new block.
    appended = [
        *_attribution_transcript(),
        TranscriptEvent(
            "12:04",
            "coder-1",
            "src/app.py",
            kind="tool",
            tool="write_file",
            persona="coding-agent",
        ),
    ]
    assert model.sync(appended)
    assert transcript_attribution(model.events, 4) == (
        True,
        "Coding Agent",
        "coder-1",
        theme.persona_instance_color("coding-agent", "coder-1"),
    )
    assert delegate.sizeHint(option, model.index(4, 0)).height() >= _attribution_label_height()

    # Streamed-tail update rewriting the last row's role flips its block start.
    updated = appended[:-1] + [
        TranscriptEvent(
            "12:04",
            "analyst-1",
            "src/app.py",
            kind="tool",
            tool="write_file",
            persona="codebase-analyst",
        )
    ]
    assert model.sync(updated)
    block_start, line1, _line2, _color = transcript_attribution(model.events, 4)
    assert block_start is False
    assert line1 == ""
    assert delegate.sizeHint(option, model.index(4, 0)).height() < _attribution_label_height()


@verifies(SWR.SWR_2913)
def test_a_finished_session_shows_no_live_agent_in_the_workspace(qtbot, tmp_path) -> None:
    """Productive use: a user opens a run that has ended and reads one consistent story.
    Expected outcome: the header says finished and the agent panel agrees — zero live."""
    import datetime as dt

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.session.state import SessionState

    from rotaris.services.config_service import ConfigService
    from rotaris.services.session_projection import (
        SessionProjectionContext,
        build_session_projection,
    )

    now = dt.datetime.now(dt.UTC)
    # The snapshot the bug produced: a terminal run whose agent records were
    # never closed, so the two halves of the same session disagreed on screen.
    state = SessionState(
        session_id="session-finished",
        workspace_root=str(tmp_path),
        created_at=now,
        updated_at=now,
        execution_status="completed",
        child_states=[
            {
                "canonical_name": "take-the-next-open-requirement",
                "name": "take-the-next-open-requirement",
                "persona": "orchestrator",
                "state": "running",
                "task_payload": "Coordinating the run",
            },
        ],
    )

    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    ConfigService(tmp_path, store).apply_session_projection(
        build_session_projection(state, RotarisConfig(), SessionProjectionContext(), []),
    )

    assert store.session_status == "completed"
    assert store.run_state.busy is False
    assert sum(1 for agent in store.agents.values() if agent.is_live) == 0
    assert view.live_label.text() == "0 live"


@verifies(SWR.SWR_2432)
def test_user_reads_a_burst_of_tool_calls_as_one_row_and_opens_it(qtbot) -> None:
    """Productive use: a burst of identical tool calls arrives as one readable row.
    Expected outcome: it opens back into its calls, and the toggle restores every row.
    """
    from rotaris.views.transcript import _event_identity

    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "you", "read the requirement store", kind="user"),
        *[
            TranscriptEvent(
                "12:01",
                "coder-1",
                f"docs/requirements/{index}.md",
                kind="tool",
                tool="read_file",
                event_key=f"call-{index}",
                status="ok",
                duration=0.4,
            )
            for index in range(6)
        ],
    ]
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    view.resize(1200, 700)
    view.show()
    qtbot.waitExposed(view)
    model = view.transcript_scroll.transcript_model

    # Grouped out of the box: the wall of one row per call never appears.
    assert store.ui.group_tool_calls is True
    assert [event.kind for event in model.events] == ["user", "tool_group"]
    header = model.event_at(1)
    assert json.loads(header.text)["count"] == 6
    document = view.transcript_scroll.transcript_delegate._document(1, header, 600)
    assert "reading" in document.toPlainText()
    assert "×6" in document.toPlainText()

    qtbot.mouseClick(
        view.transcript_scroll.viewport(),
        Qt.MouseButton.LeftButton,
        pos=transcript_anchor_point(view.transcript_scroll, 1, "rotaris-group:"),
    )

    assert [event.kind for event in model.events] == ["user", "tool_group"] + ["tool"] * 6
    assert _event_identity(header) in view.transcript_scroll.transcript_delegate.expanded_groups
    assert "docs/requirements/3.md" in model.event_at(5).text

    # Turning grouping off gives the user every call back as its own row.
    settings = SettingsView(store)
    qtbot.addWidget(settings)
    settings.group_tool_calls_toggle.setChecked(False)

    assert store.ui.group_tool_calls is False
    assert model.rowCount() == 7
    assert [event.kind for event in model.events] == ["user"] + ["tool"] * 6


def _count_relayouts(view) -> list[int]:
    """Record every re-projection of the transcript the view is asked for.

    A re-projection is the expensive thing: it decides which rows exist and
    then re-measures whatever moved. It used to be observable as a full
    `doItemsLayout`, but the view no longer has one to ask for — an insertion
    measures the inserted rows and an unchanged transcript measures nothing
    (SWR-2452). What remains worth counting is the call that re-derives the
    rows, which is exactly what an unrelated UI change must not trigger.
    """
    calls: list[int] = []
    original = view.refresh_grouping

    def counted(*, force_layout: bool = False) -> None:
        calls.append(1)
        original(force_layout=force_layout)

    view.refresh_grouping = counted
    return calls


def _busy_transcript(count: int = 100) -> WorkspaceStore:
    store = WorkspaceStore()
    store.transcript = [
        TranscriptEvent("12:00", "orchestrator", f"Message {index}") for index in range(count)
    ]
    return store


@verifies(SWR.SWR_2061)
def test_typing_a_prompt_does_no_transcript_work(qtbot) -> None:
    """Productive use: a user types a prompt while reading the transcript behind it.
    Expected outcome: the transcript neither re-projects nor re-lays out, so it stays still."""
    store = _busy_transcript()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    model = view.transcript_scroll.transcript_model
    changes: list[str] = []
    model.dataChanged.connect(lambda *_args: changes.append("data"))
    model.rowsInserted.connect(lambda *_args: changes.append("insert"))
    model.modelReset.connect(lambda: changes.append("reset"))
    relayouts = _count_relayouts(view.transcript_scroll)

    qtbot.keyClicks(view.composer, "ship the release notes")

    assert changes == []
    assert relayouts == []


@verifies(SWR.SWR_2061)
def test_unrelated_ui_state_does_not_relayout_the_transcript(qtbot) -> None:
    """Productive use: a user opens a drawer, or a run starts, while the transcript is long.
    Expected outcome: only a real display-setting change re-projects the transcript."""
    store = _busy_transcript()
    store.transcript.extend(
        TranscriptEvent("12:01", "agent", f"read {index}", kind="tool", tool="read", status="ok")
        for index in range(3)
    )
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    relayouts = _count_relayouts(view.transcript_scroll)

    store.set_drawer_state(sidebar=True)
    store.set_session_status("running")
    store.set_agent_popout(True)

    assert relayouts == []

    store.set_group_tool_calls(False)  # unfolds the group back into three rows

    assert len(relayouts) == 1

    store.set_auto_collapse_tools(True)  # same rows, shorter ones

    assert len(relayouts) == 2


@verifies(SWR.SWR_2439)
def test_composer_draft_is_published_once_typing_settles(qtbot) -> None:
    """Productive use: a user types a prompt and switches away before sending it.
    Expected outcome: the draft is kept, without a store write behind every keystroke."""
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    drafts: list[str] = []
    view.composer.draft_changed.connect(drafts.append)

    qtbot.keyClicks(view.composer, "resume the migration")

    assert drafts == []
    assert store.ui.composer_draft == ""

    view.composer.flush_draft()

    assert drafts == ["resume the migration"]
    assert store.ui.composer_draft == "resume the migration"


@verifies(SWR.SWR_2079)
def test_streamed_tail_and_new_rows_arrive_without_a_reset() -> None:
    """Productive use: a running tool settles in the same refresh that appends the next row.
    Expected outcome: Qt hears one update and one insert, so the view keeps its layout."""
    from rotaris.views.transcript import TranscriptListModel

    model = TranscriptListModel()
    first = TranscriptEvent("00:00", "agent", "read", kind="tool", tool="read", status="running")
    settled = TranscriptEvent("00:00", "agent", "read", kind="tool", tool="read", status="ok")
    follow_up = TranscriptEvent("00:01", "agent", "done")
    resets: list[str] = []
    model.modelReset.connect(lambda: resets.append("reset"))
    assert model.sync([first])

    assert model.sync([settled, follow_up])

    assert resets == []
    assert model.operation_counts["reset"] == 0
    assert model.operation_counts["update"] == 1
    assert model.operation_counts["insert"] == 2
    assert model.events == [settled, follow_up]


@verifies(SWR.SWR_2080)
def test_settled_rows_reuse_their_laid_out_document(qtbot) -> None:
    """Productive use: a user hovers and scrolls a long transcript while a run streams.
    Expected outcome: rows that did not change are not laid out again on every repaint."""
    store = _busy_transcript(20)
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    delegate = view.transcript_scroll.transcript_delegate

    settled = store.transcript[3]
    assert delegate._document(3, settled, 600) is delegate._document(3, settled, 600)

    running = TranscriptEvent("12:00", "agent", "bash", kind="tool", tool="bash", status="running")
    assert delegate._document(4, running, 600) is not delegate._document(4, running, 600)


@verifies(SWR.SWR_2080)
def test_row_layout_survives_rows_inserted_above_it(qtbot) -> None:
    """Productive use: a delegation banner or a new message appears above what a user is reading.
    Expected outcome: the rows below keep their measurements instead of being rebuilt."""
    store = _busy_transcript(20)
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    delegate = view.transcript_scroll.transcript_delegate
    settled = store.transcript[5]
    document = delegate._document(5, settled, 600)
    sizes = len(delegate._size_cache)

    store.set_transcript([TranscriptEvent("11:59", "you", "first")] + list(store.transcript))

    assert delegate._document(6, settled, 600) is document
    assert len(delegate._size_cache) >= sizes


@verifies(SWR.SWR_2447)
def test_live_tick_repaints_only_the_counting_rows(qtbot) -> None:
    """Productive use: a user watches a long-running tool count upward mid-transcript.
    Expected outcome: the clock ticks without repainting every other row around it."""
    store = _busy_transcript(20)
    store.transcript.append(
        TranscriptEvent("12:01", "agent", "bash", kind="tool", tool="bash", status="running")
    )
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    transcript = view.transcript_scroll
    painted: list[int] = []
    transcript.update = lambda index: painted.append(index.row())

    transcript._on_live_tick()

    assert painted == [transcript.transcript_model.rowCount() - 1]


# ── resizable panes (SWR-3011, SWR-3012) ───────────────────────────────────


def _shown(qtbot, view: QWidget, width: int = 1400, height: int = 900) -> QWidget:
    qtbot.addWidget(view)
    view.resize(width, height)
    view.show()
    qtbot.waitExposed(view)
    return view


@verifies(SWR.SWR_3011)
def test_workspace_panes_start_at_their_defaults_and_can_be_dragged(qtbot) -> None:
    """Productive use: a user with a wide display gives the sidebar more room."""
    view = _shown(qtbot, WorkspaceView(sample_store()))

    assert view.panes.count() == 3
    sidebar, _center, inspector = view.panes.sizes()
    assert sidebar == 236
    assert inspector == 288

    view.panes.setSizes([380, view.panes.sizes()[1] - 144, 288])
    assert view.sidebar_panel.width() == 380


@verifies(SWR.SWR_3011)
def test_a_widened_workspace_sidebar_survives_reopening(qtbot) -> None:
    """Productive use: the sidebar the user widened yesterday is wide today."""
    first = _shown(qtbot, WorkspaceView(sample_store()))
    first.panes.setSizes([360, first.panes.sizes()[1] - 124, 288])
    first.panes.remember()

    reopened = _shown(qtbot, WorkspaceView(sample_store()))

    assert reopened.panes.sizes()[0] == 360


@verifies(SWR.SWR_3011)
def test_crossing_the_compact_breakpoint_preserves_the_widths_the_user_set(qtbot) -> None:
    """Productive use: a user shrinks the window to compare, then restores it."""
    view = _shown(qtbot, WorkspaceView(sample_store()))
    view.panes.setSizes([340, view.panes.sizes()[1] - 104, 288])
    view.panes.remember()

    view.resize(1000, 800)
    qtbot.waitUntil(lambda: view._compact_layout)
    view.resize(1400, 800)
    qtbot.waitUntil(lambda: not view._compact_layout)

    assert view.panes.sizes()[0] == 340


@verifies(SWR.SWR_3011)
def test_the_workspace_transcript_and_prompt_area_share_a_divider(qtbot) -> None:
    """Productive use: a user writing a paragraph makes the composer taller."""
    view = _shown(qtbot, WorkspaceView(sample_store()))

    assert view.center_split.count() == 2
    transcript_height, prompt_height = view.center_split.sizes()
    assert prompt_height == 150
    assert transcript_height > prompt_height

    view.center_split.setSizes([transcript_height - 120, prompt_height + 120])
    assert view.composer.height() > 48


@verifies(SWR.SWR_3011)
def test_the_sidebar_rows_use_the_width_the_user_gave_the_panel(qtbot) -> None:
    """Productive use: widening the sidebar shows more of a long run name."""
    store = sample_store()
    view = _shown(qtbot, WorkspaceView(store))
    narrow = _session_row_text_width(view.sidebar_panel.width())

    view.panes.setSizes([420, view.panes.sizes()[1] - 184, 288])

    assert _session_row_text_width(view.sidebar_panel.width()) > narrow


@verifies(SWR.SWR_3011)
@pytest.mark.parametrize(
    ("factory", "attribute", "key"),
    [
        (DashboardView, "columns", "dashboard.columns"),
        (MissionView, "body", "mission.body"),
        (GitView, "columns", "git.columns"),
        (LibraryView, "prompt_columns", "library.prompts"),
    ],
)
def test_every_multi_pane_view_exposes_a_named_divider(qtbot, factory, attribute, key) -> None:
    """Productive use: a user resizes each screen's columns the same way."""
    view = _shown(qtbot, factory(sample_store()))
    splitter = getattr(view, attribute)

    assert splitter.key == key
    assert splitter.count() == 2
    assert splitter.childrenCollapsible() is False
    assert splitter.handle(1).accessibleName().startswith("Resize ")


@verifies(SWR.SWR_3011)
def test_panes_keep_their_minimums_at_the_supported_window_size(qtbot) -> None:
    """Productive use: nothing collapses on the smallest window Rotaris supports."""
    view = _shown(qtbot, WorkspaceView(sample_store()), width=1000, height=680)

    for size in view.panes.sizes():
        assert size >= 0
    assert view.minimumSizeHint().width() <= 1000


@verifies(SWR.SWR_3012)
def test_settings_offers_one_named_control_to_reset_every_pane(qtbot) -> None:
    """Productive use: a user on a smaller screen puts every pane back."""
    view = _shown(qtbot, SettingsView(sample_store()))
    seen: list[bool] = []
    view.panel_sizes_reset_requested.connect(lambda: seen.append(True))

    assert view.reset_panels_button.accessibleName() == "Reset panel sizes"
    view.reset_panels_button.click()

    assert seen == [True]
