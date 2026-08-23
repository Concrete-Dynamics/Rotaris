"""Productive use: a user watches a run and wants to know what is producing it.

Expected outcome: with nothing selected — the state every run starts in, with the
transcript unscoped and reading "All activity" — the inspector describes the
agent that wrote the newest row: its model, its context window, its tools. When
a second agent takes over the run the panel follows it, and the moment the user
picks an agent from the sidebar the panel is theirs and stops moving.

Everything below the LLM is real: SDK events through `_SessionObserver`, a real
session on disk, the real projection into the store, and the real desktop window.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel, QWidget
from rotaris_core.reqtocode import SWR, verifies
from run_wiring import (
    ObserverHarness,
    action_event,
    message_event,
    observation_event,
    sdk_events,
)

from rotaris.views.main_window import MainWindow

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

    from rotaris.models.store import WorkspaceStore

pytestmark = pytest.mark.e2e


def _second_agent(harness: ObserverHarness, name: str, persona: str) -> SimpleNamespace:
    """Register another live child, the way the scheduler spawns one."""
    harness.records.append(
        SimpleNamespace(
            canonical_name=name,
            persona=persona,
            model_dump=lambda *, mode, name=name, persona=persona: {
                "canonical_name": name,
                "persona": persona,
                "state": "running",
                "parent_agent_id": "orchestrator",
            },
        )
    )
    return SimpleNamespace(canonical_name=name, persona=persona)


def _run_two_agents(tmp_path: Path) -> WorkspaceStore:
    """A run where a coder works, then a second agent takes over the transcript."""
    sdk = sdk_events()
    harness = ObserverHarness(tmp_path)
    try:
        harness.event(message_event(sdk, "Switching the handlers to async."))
        action = action_event(sdk, command="pytest -x -q")
        harness.event(action)
        harness.event(observation_event(sdk, action, output="12 passed"))
        harness.drain()
        return harness.reload_into_store(tmp_path)
    finally:
        harness.close()


def _open_workspace(qtbot: QtBot, store: WorkspaceStore) -> MainWindow:
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("workspace")
    return window


def _tree_row(window: MainWindow, agent_id: str) -> QWidget:
    """The sidebar row a user would click for `agent_id`."""
    for label in window.workspace.agent_tree.findChildren(QLabel):
        if label.accessibleName() != "Agent task" or label.text() != agent_id:
            continue
        row: QWidget | None = label
        while row is not None and row.objectName() != "agentTreeRow":
            row = row.parentWidget()
        assert row is not None, f"no clickable row around {agent_id}"
        return row
    raise AssertionError(f"{agent_id} is not listed in the agent tree")


@verifies(SWR.SWR_2910)
def test_user_reads_the_generating_agent_without_clicking_anything(
    qtbot: QtBot, tmp_path: Path
) -> None:
    """The default state of the screen answers "what is producing this?"."""
    store = _run_two_agents(tmp_path)
    window = _open_workspace(qtbot, store)
    inspector = window.workspace

    assert store.selected_agent_id == ""
    assert inspector.transcript_scope_button.text() == "All activity"
    assert inspector.inspector_name.text() == "coder-1"
    assert inspector.inspector_model.currentText() == "test/model"
    assert inspector.inspector_follow_tag.isHidden() is False
    # The scope never narrowed: the reader still has the whole run in front of
    # them while the inspector describes one agent inside it.
    assert inspector.transcript_scroll.transcript_model.rowCount() == len(store.transcript)


@verifies(SWR.SWR_2910)
def test_the_panel_follows_the_agent_that_takes_over_the_run(qtbot: QtBot, tmp_path: Path) -> None:
    """A second agent starts writing and the panel is describing it."""
    sdk = sdk_events()
    harness = ObserverHarness(tmp_path)
    try:
        harness.event(message_event(sdk, "Handing the checks over."))
        reviewer = _second_agent(harness, "reviewer-1", "coder")
        harness.event(message_event(sdk, "Reading the diff now."), reviewer)
        harness.drain()
        store = harness.reload_into_store(tmp_path)
    finally:
        harness.close()

    window = _open_workspace(qtbot, store)

    assert window.workspace.inspector_name.text() == "reviewer-1"
    assert store.selected_agent_id == ""


def _record_with_tool_set(name: str, persona: str, payload: dict) -> SimpleNamespace:
    """A live child whose record carries the tool set the run resolved for it."""
    return SimpleNamespace(
        canonical_name=name,
        persona=persona,
        model_dump=lambda *, mode: {
            "canonical_name": name,
            "persona": persona,
            "state": "running",
            "parent_agent_id": "orchestrator",
            **payload,
        },
    )


@verifies(SWR.SWR_3010)
def test_inspector_shows_the_running_agents_real_tool_set(qtbot: QtBot, tmp_path: Path) -> None:
    """Productive use: a user watches an agent work and asks what it can call.

    Expected outcome: the panel lists the native tools the run actually resolved —
    not the persona's declaration, which still names `shell` — followed by the
    agent's granted Serena tools under their server's heading.
    """
    sdk = sdk_events()
    harness = ObserverHarness(tmp_path)
    try:
        harness.records[:] = [
            _record_with_tool_set(
                "coder-1",
                "coder",
                {
                    "granted_tools": ["read_file"],
                    "granted_mcp_tools": {"serena": ["find_symbol"]},
                },
            ),
        ]
        harness.event(message_event(sdk, "Looking the symbol up."))
        harness.drain()
        store = harness.reload_into_store(tmp_path)
    finally:
        harness.close()

    window = _open_workspace(qtbot, store)
    layout = window.workspace.tools_layout
    chips = [layout.itemAt(index).widget().text() for index in range(layout.count())]

    assert window.workspace.inspector_name.text() == "coder-1"
    assert chips == ["read_file · not used", "serena", "find_symbol · not used"]
    # The persona declares `shell`; this agent never got it, and the panel says so.
    assert not any("shell" in chip for chip in chips)


@verifies(SWR.SWR_2910)
def test_user_clicks_an_agent_and_the_inspector_stops_following(
    qtbot: QtBot, tmp_path: Path
) -> None:
    """Picking an agent is a decision, and the panel holds it."""
    store = _run_two_agents(tmp_path)
    window = _open_workspace(qtbot, store)
    row = _tree_row(window, "coder-1")

    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)

    assert store.selected_agent_id == "coder-1"
    assert window.workspace.inspector_name.text() == "coder-1"
    assert window.workspace.inspector_follow_tag.isHidden() is True
    assert window.workspace.transcript_scope_button.text() == "This task"
