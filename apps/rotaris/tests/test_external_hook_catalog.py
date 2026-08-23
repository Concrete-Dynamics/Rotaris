"""Desktop management of global external coding-agent hooks (SWR-3725)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QTreeWidget
from rotaris_core.config import loader as config_loader
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.settings import SettingsView

pytestmark = pytest.mark.e2e


def _window(qtbot: Any, tmp_path, monkeypatch: pytest.MonkeyPatch) -> SettingsView:
    global_config = tmp_path / "global"
    global_config.mkdir()
    monkeypatch.setattr(config_loader, "GLOBAL_CONFIG_DIR", global_config)
    monkeypatch.setenv("ROTARIS_CONFIG_DIR", str(tmp_path / "rotaris-config"))
    claude = tmp_path / "claude-settings.json"
    claude.write_text(
        json.dumps(
            {
                "hooks": {
                    "SessionStart": [{"hooks": [{"type": "command", "command": "echo start"}]}],
                    "Notification": [
                        {"hooks": [{"type": "http", "url": "https://example.invalid"}]}
                    ],
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("ROTARIS_CLAUDE_SETTINGS_PATH", str(claude))
    # Customizations need the OpenHands SDK and are outside this hermetic Hooks flow.
    monkeypatch.setattr(SettingsView, "_refresh_customizations", lambda self: None)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = WorkspaceStore()
    service = ConfigService(workspace, store)
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    settings = SettingsView(store, service)
    qtbot.addWidget(settings)
    settings.resize(1440, 900)
    settings.show()
    qtbot.waitExposed(settings)
    settings.set_active_tab("hooks")
    return settings


def _hook_table(settings: SettingsView) -> QTreeWidget:
    table = settings.findChild(QTreeWidget, "")
    assert table is not None
    for candidate in settings.findChildren(QTreeWidget):
        if candidate.accessibleName() == "Lifecycle hooks":
            return candidate
    raise AssertionError("Lifecycle hooks table is unavailable")


def _agent_row(table: QTreeWidget, label: str):
    for index in range(table.topLevelItemCount()):
        item = table.topLevelItem(index)
        if item.text(0) == label:
            return item
    raise AssertionError(f"{label} agent row is unavailable")


@verifies(SWR.SWR_3725)
def test_a_desktop_user_toggles_claude_code_and_one_hook_with_a_durable_global_policy(
    qtbot, tmp_path, monkeypatch
) -> None:
    """Productive use: a user centralizes the Claude Code hooks that should join future Rotaris runs.
    Expected outcome: agent and per-hook choices are visible in Settings and survive a tab refresh
    without changing the external Claude configuration file."""
    settings = _window(qtbot, tmp_path, monkeypatch)
    source_before = (tmp_path / "claude-settings.json").read_text(encoding="utf-8")
    table = _hook_table(settings)
    claude = _agent_row(table, "Claude Code")
    assert claude.childCount() == 2
    compatible = claude.child(0)
    inactive = claude.child(1)
    assert compatible.checkState(0) == Qt.CheckState.Checked
    assert "inactive" in inactive.text(4)

    compatible.setCheckState(0, Qt.CheckState.Unchecked)
    qtbot.waitUntil(
        lambda: (
            _agent_row(_hook_table(settings), "Claude Code").child(0).checkState(0)
            == Qt.CheckState.Unchecked
        )
    )
    claude = _agent_row(_hook_table(settings), "Claude Code")
    claude.setCheckState(0, Qt.CheckState.Unchecked)
    qtbot.waitUntil(
        lambda: (
            _agent_row(_hook_table(settings), "Claude Code").checkState(0)
            == Qt.CheckState.Unchecked
        )
    )
    settings.refresh_hooks()
    refreshed = _agent_row(_hook_table(settings), "Claude Code")
    assert refreshed.checkState(0) == Qt.CheckState.Unchecked
    assert refreshed.child(0).checkState(0) == Qt.CheckState.Unchecked
    stored = json.loads(
        (tmp_path / "rotaris-config" / "external-hooks.json").read_text(encoding="utf-8")
    )
    assert stored["agents"]["claude-code"] is False
    assert set(stored["hooks"].values()) == {False}
    assert (tmp_path / "claude-settings.json").read_text(encoding="utf-8") == source_before
