"""User flows through the real composer: discover, complete, run, and mistype.

Every flow here starts where the user starts — an empty composer in a shown
window — and drives it with keystrokes and clicks only. Nothing reaches into the
registry directly; that is what makes a passing assertion evidence that the
shipped surface works.
"""

from __future__ import annotations

import pytest
from fakes import FakeRunBridge
from PySide6.QtCore import Qt
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models import sample_store
from rotaris.models.slash_commands import PARTIAL, RESOLVED, UNKNOWN
from rotaris.models.state import SkillInfo
from rotaris.models.store import WorkspaceStore
from rotaris.theme import tokens
from rotaris.views.main_window import MainWindow
from rotaris.widgets.slash_popup import DESCRIPTION_ROLE, NAME_ROLE, SlashHighlighter

pytestmark = pytest.mark.e2e


def _type(qtbot, widget, text: str) -> None:
    """Enter `text` one keystroke at a time, as a user does."""
    for char in text:
        qtbot.keyClicks(widget, char)


def _open_workspace(qtbot, store, **kwargs) -> MainWindow:
    window = MainWindow(store, **kwargs)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("workspace")
    window.workspace.composer.setFocus()
    return window


@verifies(SWR.SWR_2439)
def test_user_discovers_commands_by_typing_a_slash(qtbot) -> None:
    """Productive use: a user who does not know the commands can find them."""
    window = _open_workspace(qtbot, sample_store())
    composer = window.workspace.composer
    popup = window.workspace.slash_popup

    _type(qtbot, composer, "/")
    assert popup.is_open()
    assert popup.list.count() > 1

    _type(qtbot, composer, "st")
    names = [popup.list.item(row).data(NAME_ROLE) for row in range(popup.list.count())]
    assert "stop" in names
    # Every row explains itself; a bare name would not be discoverable.
    descriptions = [
        popup.list.item(row).data(DESCRIPTION_ROLE) for row in range(popup.list.count())
    ]
    assert all(descriptions)
    assert popup.current() is not None


@verifies(SWR.SWR_2441)
def test_user_arrows_to_a_command_completes_it_and_runs_it(qtbot) -> None:
    """Productive use: the whole flow works from the keyboard alone."""
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.set_session_status("running")
    window = _open_workspace(qtbot, store, run_bridge=bridge)
    composer = window.workspace.composer
    popup = window.workspace.slash_popup

    _type(qtbot, composer, "/pa")
    offered = [command.name for command in popup.commands()]
    assert offered[0] != "pause"  # the user has to arrow past the first suggestion

    for _ in range(offered.index("pause")):
        qtbot.keyClick(composer, Qt.Key.Key_Down)
    chosen = popup.current()
    assert chosen is not None and chosen.name == "pause"
    assert composer.toPlainText() == "/pa"  # arrows never recall history here

    qtbot.keyClick(composer, Qt.Key.Key_Tab)
    assert composer.toPlainText() == "/pause "
    assert not popup.is_open()
    assert bridge.paused == []  # completing is not running

    qtbot.keyClick(composer, Qt.Key.Key_Return)
    assert bridge.paused == ["orchestrator"]
    assert bridge.prompts == []
    assert composer.toPlainText() == ""


@verifies(SWR.SWR_2438)
def test_user_stops_a_live_run_with_a_slash_command(qtbot) -> None:
    """Productive use: `/stop` cancels the run instead of prompting the agent."""
    bridge = FakeRunBridge()
    bridge.running = True
    store = WorkspaceStore()
    store.set_session_status("running")
    window = _open_workspace(qtbot, store, run_bridge=bridge)
    cancelled: list[bool] = []
    window._cancel_run = lambda: cancelled.append(True)  # the dialog is not the point here
    window._rebuild_slash_catalogue()

    _type(qtbot, window.workspace.composer, "/stop")
    qtbot.keyClick(window.workspace.composer, Qt.Key.Key_Return)

    assert cancelled == [True]
    assert bridge.prompts == []
    assert bridge.queued == {}


@verifies(SWR.SWR_2438)
def test_user_mistypes_a_command_and_keeps_their_text(qtbot) -> None:
    """Productive use: a typo is reported, not silently sent to an agent."""
    bridge = FakeRunBridge()
    store = sample_store()
    store.set_session_status("completed")
    window = _open_workspace(qtbot, store, run_bridge=bridge)
    composer = window.workspace.composer

    _type(qtbot, composer, "/nope")
    qtbot.keyClick(composer, Qt.Key.Key_Return)

    assert bridge.prompts == []
    assert composer.toPlainText() == "/nope"
    notice = store.ui.notice
    assert notice is not None
    assert notice.persistent is True
    assert "/nope" in notice.message


@verifies(SWR.SWR_2440)
def test_user_sees_a_typo_flagged_and_the_correction_confirmed(qtbot) -> None:
    """Productive use: the command token changes colour as it becomes valid."""
    window = _open_workspace(qtbot, sample_store())
    composer = window.workspace.composer

    def token_colour() -> str:
        formats = composer.document().firstBlock().layout().formats()
        return formats[0].format.foreground().color().name() if formats else ""

    states = SlashHighlighter.state_colors(tokens())

    _type(qtbot, composer, "/stpo")
    assert token_colour() == str(states[UNKNOWN]).lower()

    for _ in range(4):
        qtbot.keyClick(composer, Qt.Key.Key_Backspace)
    _type(qtbot, composer, "sto")
    assert token_colour() == str(states[PARTIAL]).lower()

    _type(qtbot, composer, "p")
    assert token_colour() == str(states[RESOLVED]).lower()


@verifies(SWR.SWR_2442)
def test_user_switches_model_and_loads_a_skill_from_the_composer(qtbot) -> None:
    """Productive use: the catalogue reaches models, personas, and skills."""
    store = sample_store()
    store.skills = [SkillInfo(name="API Docs", scope="project", description="Write API docs")]
    window = _open_workspace(qtbot, store)
    window._rebuild_slash_catalogue()
    composer = window.workspace.composer
    model = store.model_catalog[-1]

    _type(qtbot, composer, f"/model {model}")
    qtbot.keyClick(composer, Qt.Key.Key_Return)
    assert store.active_model == model
    assert window.workspace.model_combo.currentText() == model

    _type(qtbot, composer, "/api-docs")
    qtbot.keyClick(composer, Qt.Key.Key_Return)
    assert store.skills[0].load_mode == "on"
    assert composer.toPlainText() == ""


@verifies(SWR.SWR_2442)
def test_user_is_told_why_stop_is_unavailable_while_idle(qtbot) -> None:
    """Productive use: an idle `/stop` explains itself instead of failing mutely."""
    bridge = FakeRunBridge()
    store = WorkspaceStore()
    window = _open_workspace(qtbot, store, run_bridge=bridge)
    composer = window.workspace.composer
    popup = window.workspace.slash_popup

    _type(qtbot, composer, "/stop")
    rows = {
        popup.list.item(row).data(NAME_ROLE): popup.list.item(row)
        for row in range(popup.list.count())
    }
    assert rows["stop"].toolTip() == "No run is active."

    qtbot.keyClick(composer, Qt.Key.Key_Escape)
    qtbot.keyClick(composer, Qt.Key.Key_Return)

    notice = store.ui.notice
    assert notice is not None
    assert notice.message == "No run is active."
    assert composer.toPlainText() == "/stop"
    assert bridge.prompts == []
