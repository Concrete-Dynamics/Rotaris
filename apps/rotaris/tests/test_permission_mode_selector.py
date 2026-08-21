"""Productive use: a user picks how much agents may do without asking, from the
chip under the composer where they type their instructions.
Expected outcome: the choice is visible, written to the workspace config so the
next run starts in it, confirmed before it widens what agents may do, and — for
a run already going — handed to that run so its next tool call obeys it."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
import yaml
from fakes import FakeRunBridge
from PySide6.QtWidgets import QComboBox, QMessageBox
from rotaris_core.config.schema import RotarisConfig
from rotaris_core.permissions import EffectiveMode
from rotaris_core.reqtocode import SWR, verifies
from run_wiring import ObserverHarness
from ui_query import find_by_accessible_name, settle

from rotaris.models.state import permission_mode_names
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.chrome import StatusBar
from rotaris.views.main_window import MainWindow
from rotaris.views.settings import SettingsView
from rotaris.views.workspace import WorkspaceView

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration


def _accept_autonomous(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        QMessageBox, "warning", lambda *args, **kwargs: QMessageBox.StandardButton.Yes
    )


def _decline_autonomous(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        QMessageBox, "warning", lambda *args, **kwargs: QMessageBox.StandardButton.Cancel
    )


def _chip(view: WorkspaceView) -> QComboBox:
    return find_by_accessible_name(view, "Permission mode", QComboBox)


@verifies(SWR.SWR_2509)
def test_the_composer_offers_the_modes_strictest_first(qtbot: QtBot) -> None:
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    chip = _chip(view)

    assert [chip.itemText(i) for i in range(chip.count())] == [
        "mode: restricted",
        "mode: ask",
        "mode: autonomous",
    ]
    assert chip.currentText() == f"mode: {store.runtime.permission_mode}"
    assert permission_mode_names() == ["restricted", "ask", "autonomous"]


@verifies(SWR.SWR_2509)
def test_choosing_a_stricter_mode_updates_the_setting(qtbot: QtBot) -> None:
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)

    with qtbot.waitSignal(view.permission_mode_selected) as selected:
        _chip(view).setCurrentText("mode: restricted")

    assert selected.args == ["restricted"]
    assert store.runtime.permission_mode == "restricted"


@verifies(SWR.SWR_2509)
def test_autonomous_is_applied_only_after_the_user_confirms(
    qtbot: QtBot,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    _accept_autonomous(monkeypatch)

    _chip(view).setCurrentText("mode: autonomous")

    assert store.runtime.permission_mode == "autonomous"


@verifies(SWR.SWR_2509)
def test_declining_the_warning_leaves_the_mode_untouched(
    qtbot: QtBot,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = WorkspaceStore()
    view = WorkspaceView(store)
    qtbot.addWidget(view)
    _decline_autonomous(monkeypatch)

    _chip(view).setCurrentText("mode: autonomous")
    settle(qtbot)

    assert store.runtime.permission_mode == "ask"
    # The chip snaps back, so it never claims a mode the run is not in.
    assert _chip(view).currentText() == "mode: ask"


@verifies(SWR.SWR_2509)
def test_the_chip_stays_usable_while_a_run_is_going(qtbot: QtBot) -> None:
    store = WorkspaceStore()
    bridge = FakeRunBridge()
    bridge.running = True
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    view = window.workspace

    store.set_session_status("running")
    settle(qtbot)

    # The other composer chips lock for the duration of the run; this one must
    # not, or the mid-run mode change has no way in.
    assert not view.persona_combo.isEnabled()
    assert _chip(view).isEnabled()


@verifies(SWR.SWR_2503, SWR.SWR_2509)
def test_a_mid_run_change_reaches_the_running_session(qtbot: QtBot) -> None:
    store = WorkspaceStore()
    bridge = FakeRunBridge()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    bridge.running = True

    _chip(window.workspace).setCurrentText("mode: restricted")

    assert bridge.permission_modes == ["restricted"]


@verifies(SWR.SWR_2509)
def test_no_run_means_nothing_to_change_mid_flight(qtbot: QtBot) -> None:
    store = WorkspaceStore()
    bridge = FakeRunBridge()
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)

    _chip(window.workspace).setCurrentText("mode: restricted")

    assert bridge.permission_modes == []
    assert store.runtime.permission_mode == "restricted"


@verifies(SWR.SWR_2509)
def test_the_status_bar_names_the_mode_in_effect(qtbot: QtBot) -> None:
    store = WorkspaceStore()
    store.runtime.permission_mode = "restricted"
    bar = StatusBar(store)
    qtbot.addWidget(bar)

    bar.refresh()

    assert "mode: restricted" in bar.flags_label.text()


@verifies(SWR.SWR_2509)
def test_settings_offers_the_same_control_over_the_same_setting(
    qtbot: QtBot,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = WorkspaceStore()
    view = SettingsView(store)
    qtbot.addWidget(view)
    view.refresh()
    settle(qtbot)
    _accept_autonomous(monkeypatch)

    find_by_accessible_name(view, "Permission mode", QComboBox).setCurrentText("autonomous")

    assert store.runtime.permission_mode == "autonomous"
    assert store.ui.settings_dirty


@verifies(SWR.SWR_2503, SWR.SWR_2509)
def test_the_worker_announces_a_mid_run_mode_change_in_the_transcript(tmp_path: Path) -> None:
    """The run's own view of the change: the session records the new mode and
    the transcript says so, so the user can see the switch took."""
    harness = ObserverHarness(tmp_path)
    try:
        effective = EffectiveMode(mode="restricted", requested="restricted")

        harness.observer.apply_permission_mode(effective)
        harness.drain()

        assert harness.state.permission_mode == "restricted"
        row = harness.state.transcript_events[-1]
        assert row["role"] == "system"
        assert "restricted" in row["content"]
        assert "next tool call" in row["content"]
    finally:
        harness.close()


@verifies(SWR.SWR_2509)
def test_the_transcript_names_the_pinned_personas_a_mode_change_did_not_reach(
    tmp_path: Path,
) -> None:
    """Productive use: a user tightens a running session that has a persona pinned
    stricter than the mode they chose.
    Expected outcome: the confirmation they read says the change took *and* names
    the persona it left alone — never a blanket 'changed to X' that overstates it."""
    harness = ObserverHarness(tmp_path)
    try:
        effective = EffectiveMode(
            mode="autonomous",
            requested="autonomous",
            skipped_personas=("auditor",),
        )

        harness.observer.apply_permission_mode(effective)
        harness.drain()

        assert harness.state.permission_mode == "autonomous"
        content = harness.state.transcript_events[-1]["content"]
        assert "autonomous" in content
        assert "next tool call" in content
        assert "auditor" in content
        assert "stricter than the mode you chose" in content
    finally:
        harness.close()


@verifies(SWR.SWR_2508, SWR.SWR_2509)
def test_a_downgraded_mid_run_change_says_why_in_the_transcript(tmp_path: Path) -> None:
    harness = ObserverHarness(tmp_path)
    try:
        effective = EffectiveMode(
            mode="ask",
            requested="autonomous",
            downgraded=True,
            reason="Permission mode 'autonomous' was downgraded to 'ask' for this run.",
        )

        harness.observer.apply_permission_mode(effective)
        harness.drain()

        assert harness.state.permission_mode == "ask"
        assert harness.state.transcript_events[-1]["content"] == effective.reason
    finally:
        harness.close()


@verifies(SWR.SWR_2509, SWR.SWR_2503)
def test_choosing_a_mode_persists_it_and_starts_the_next_run_in_it(
    qtbot: QtBot,
    tmp_path: Path,
) -> None:
    """The user-flow: pick a mode under the composer, and the run started
    afterwards — in this or a later session of Rotaris — is judged under it."""
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = RotarisConfig(workspace_root=tmp_path)
    window = MainWindow(store, config_service=service)
    qtbot.addWidget(window)

    _chip(window.workspace).setCurrentText("mode: restricted")

    persisted = yaml.safe_load((tmp_path / ".rotaris" / "agents.yaml").read_text())
    assert persisted["runtime"]["permission_mode"] == "restricted"
    assert service.build_run_config().runtime.permission_mode == "restricted"

    # A later launch of Rotaris reads the file back into the same chip.
    reopened_store = WorkspaceStore()
    ConfigService(tmp_path, reopened_store).load()
    reopened = WorkspaceView(reopened_store)
    qtbot.addWidget(reopened)
    assert _chip(reopened).currentText() == "mode: restricted"
