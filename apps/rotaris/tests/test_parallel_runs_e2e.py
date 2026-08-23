"""Hermetic end-to-end coverage for parallel Rotaris workspace sessions.

Real coordinator, real RunBridge threads, real SessionManager persistence and
real Git worktrees; only the agent execution itself (`_run_task`, i.e. the
LLM/provider boundary) is replaced by a controllable stand-in.

Flows are driven through the window the user sees: controls are looked up by
accessible name and clicked, so an unwired button fails these tests instead of
passing them.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import subprocess
import threading
from pathlib import Path
from typing import Any

import pytest
from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QMessageBox, QPlainTextEdit, QPushButton
from rotaris_core.init import registry
from rotaris_core.init.serena_setup import SERENA_SETUP_TASK_ID
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager
from ui_query import (
    click,
    click_by_name,
    find_all_by_accessible_name,
    find_by_accessible_name,
    settle,
    type_text,
)

from rotaris.models.state import NoticeSeverity, ProviderInfo, SessionInfo, UiNotice
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_coordinator import RunCoordinator
from rotaris.views.main_window import MainWindow, _SessionLaunchDialog, _SessionsDialog

pytestmark = pytest.mark.e2e


def _git(cwd: Path, *args: str) -> None:
    result = subprocess.run(
        ["git", *args], cwd=cwd, text=True, encoding="utf-8", capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr


@pytest.fixture
def repository(tmp_path: Path) -> Path:
    _git(tmp_path, "init", "-b", "main")
    _git(tmp_path, "config", "user.name", "Test User")
    _git(tmp_path, "config", "user.email", "test@example.invalid")
    (tmp_path / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (tmp_path / "base.txt").write_text("base\n", encoding="utf-8")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-m", "initial")
    return tmp_path


class FakeAgent:
    """Stands in for the agent loop: streams one line, then waits to be released.

    Each session has its own gate, so a test can finish one run while the others
    keep working — exactly the situation parallel sessions have to survive.

    A release is remembered rather than only broadcast. Isolating a run means
    creating a Git worktree first, so a session reports itself running well
    before its task reaches the gate; a release that arrives during that window
    would otherwise find no gate to set and leave the run blocked forever.
    """

    def __init__(self) -> None:
        self._gates: dict[str, threading.Event] = {}
        self._released: set[str] = set()
        self._released_everything = False
        self._lock = threading.Lock()
        self.prompts: dict[str, str] = {}

    def _gate(self, session_id: str) -> threading.Event:
        with self._lock:
            gate = self._gates.get(session_id)
            if gate is None:
                gate = threading.Event()
                if self._released_everything or session_id in self._released:
                    gate.set()
                self._gates[session_id] = gate
            return gate

    def release(self, session_id: str) -> None:
        with self._lock:
            self._released.add(session_id)
        self._gate(session_id).set()

    def hold(self, session_id: str) -> None:
        """Make the *next* run for this session block again.

        A release belongs to the run it let finish. Continuing the same session
        starts a second run under the same id, and a test that has to assert
        while that one is live needs its gate closed again.
        """
        with self._lock:
            self._released.discard(session_id)
            self._gates.pop(session_id, None)

    def release_all(self) -> None:
        with self._lock:
            self._released_everything = True
            gates = list(self._gates.values())
        for gate in gates:
            gate.set()

    async def run_task(
        self,
        prompt: str,
        config: Any,
        manager: Any,
        state: Any,
        _max_iterations: int,
        interrupt_handler: Any | None = None,
        **_kwargs: Any,
    ) -> Any:
        from rotaris_core.ralph.state import RalphProgressFile

        gate = self._gate(state.session_id)
        if interrupt_handler is not None:

            def release() -> None:
                self.release(state.session_id)

            interrupt_handler.set_callbacks(
                on_first_interrupt=release,
                on_second_interrupt=release,
            )
        self.prompts[state.session_id] = prompt
        state.transcript_events.append({"role": "assistant", "content": f"working on {prompt}"})
        await manager.persister.flush(state)
        while not gate.is_set():
            await asyncio.sleep(0.02)
        return RalphProgressFile(
            session_id=state.session_id,
            started_at=dt.datetime.now(dt.UTC),
            total_tasks=1,
            completed_tasks=1,
        )


@pytest.fixture
def agent(monkeypatch: pytest.MonkeyPatch) -> FakeAgent:
    from rotaris_core.cli import background

    fake = FakeAgent()
    monkeypatch.setattr(background, "_run_task", fake.run_task)
    return fake


def _window(repository: Path, qtbot) -> tuple[MainWindow, RunCoordinator, WorkspaceStore]:
    store = WorkspaceStore()
    # SWR-2802: a workspace that has never been set up prompts on open and gates
    # agent dispatch until the user answers. These tests are about parallel runs,
    # so the workspace starts where a returning user's does — already answered.
    registry.mark_initialized(repository)
    registry.record_skipped(repository, [SERENA_SETUP_TASK_ID])
    config = ConfigService(repository, store)
    config.load()
    # Provider authentication is an external system. Pin one connected provider so
    # the pre-flight guard in _submit_prompt cannot depend on whatever credentials
    # the host machine happens to carry.
    store.providers = [
        ProviderInfo(id="test", label="Test provider", connected=True, status="healthy")
    ]
    coordinator = RunCoordinator(repository, store, config)
    window = MainWindow(store, config_service=config, run_bridge=coordinator)
    qtbot.addWidget(window)
    # Shown: a control the user cannot see is a control these tests must not click.
    window.resize(1440, 900)
    window.show()
    qtbot.waitExposed(window)
    return window, coordinator, store


def _start_new_session(
    window: MainWindow, qtbot, monkeypatch: pytest.MonkeyPatch, prompt: str
) -> Any:
    """Click 'New session', type the prompt, send it — the launch dialog auto-accepts."""
    dialogs: list[_SessionLaunchDialog] = []

    def accept(dialog: _SessionLaunchDialog) -> int:
        dialogs.append(dialog)
        return 1

    monkeypatch.setattr(_SessionLaunchDialog, "exec", accept)

    # A run that has just started pulls the window back to the workspace, and
    # that signal crosses from the run thread after the click that started it
    # has returned.  Keep asking for the dashboard until it is the view on
    # screen, so opening a second session does not race the first one's start.
    def dashboard_on_screen() -> bool:
        window.show_view("dashboard")
        settle(qtbot)
        return window.dashboard.isVisible()

    qtbot.waitUntil(dashboard_on_screen, timeout=5000)
    click_by_name(qtbot, window.dashboard, "New session", QPushButton)

    # A new session lands on the workspace with an empty composer, so the send
    # control must offer to *start* a run rather than continue or queue one.
    composer = find_by_accessible_name(
        window.workspace, "Run prompt", QPlainTextEdit, visible_only=True
    )
    type_text(qtbot, composer, prompt)
    assert composer.toPlainText() == prompt
    click_by_name(qtbot, window.workspace, "Start run", QPushButton)
    assert _blocking_notice(window) is None, _blocking_notice(window)
    return dialogs[-1]


def _blocking_notice(window: MainWindow) -> str | None:
    """The blocking notice a failed prompt submission leaves behind, if any."""
    notice = window.store.ui.notice
    return None if notice is None else f"{notice.title}: {notice.message}"


def _switch_to_session(window: MainWindow, qtbot, label: str) -> None:
    """Switch runs without leaving the transcript: the Workspace sidebar switcher.

    Rows are labeled by task wording (SWR-2907), so *label* is the run's title —
    for these hermetic runs, the prompt that started it — not the session id.
    """
    window.show_view("workspace")
    settle(qtbot)
    click_by_name(qtbot, window.workspace, f"Switch to session {label}", QPushButton)


# Two live sessions racing each other, with `waitUntil` deadlines on both. Given a
# whole core it settles in ~3s; sharing one with 15 other pytest workers it misses
# the deadlines and fails about three runs in four. Measured, not guessed: green
# 3/3 serially, red 3/4 under `-n auto`.
@pytest.mark.serial
@verifies(SWR.SWR_2415, SWR.SWR_2434)
def test_two_parallel_sessions_run_isolated_and_switch_without_interference(
    repository: Path, agent: FakeAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user runs two tasks side by side in one workspace.
    Expected outcome: the second run is isolated automatically, both transcripts stay
    separate, and cancelling one leaves the other running."""
    window, coordinator, store = _window(repository, qtbot)

    first_dialog = _start_new_session(window, qtbot, monkeypatch, "task A")
    assert first_dialog.isolation_required is False
    qtbot.waitUntil(lambda: len(coordinator.active_session_ids) == 1, timeout=5000)
    session_a = coordinator.focused_session_id

    second_dialog = _start_new_session(window, qtbot, monkeypatch, "task B")
    assert second_dialog.isolation_required is True
    assert second_dialog.isolate_checkbox.isChecked() is True
    assert second_dialog.isolate_checkbox.isEnabled() is False
    qtbot.waitUntil(lambda: len(coordinator.active_session_ids) == 2, timeout=5000)
    session_b = coordinator.focused_session_id

    assert session_a != session_b
    manager = SessionManager(repository)
    qtbot.waitUntil(lambda: agent.prompts.get(session_b) == "task B", timeout=5000)
    worktree = manager.load_session(session_b).worktree
    assert worktree is not None
    assert Path(worktree.path).is_dir()
    assert worktree.branch == f"rotaris/session/{session_b}"
    manager.release_lock(session_b)

    # Focus each run in turn: distinct transcripts, no lifecycle change. The
    # sidebar rows are addressed by task wording, not session id (SWR-2907).
    _switch_to_session(window, qtbot, "task A")
    qtbot.waitUntil(lambda: any("task A" in event.text for event in store.transcript), timeout=5000)
    assert not any("task B" in event.text for event in store.transcript)
    _switch_to_session(window, qtbot, "task B")
    qtbot.waitUntil(lambda: any("task B" in event.text for event in store.transcript), timeout=5000)
    assert not any("task A" in event.text for event in store.transcript)
    assert sorted(coordinator.active_session_ids) == sorted([session_a, session_b])

    # Cancelling the focused run must not touch the background run. Driven at the
    # coordinator: the workspace "Cancel run" control routes through a confirmation
    # dialog and cancel_agent("orchestrator"), which is its own untested flow.
    coordinator.cancel()
    qtbot.waitUntil(lambda: coordinator.active_session_ids == [session_a], timeout=5000)

    agent.release_all()
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=5000)
    coordinator.shutdown_all()


@verifies(SWR.SWR_2907)
def test_run_rows_read_as_task_wording_with_the_id_kept_reachable(
    repository: Path, agent: FakeAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user scans the sidebar for the run they mean.
    Expected outcome: the active-run row reads as a short wording of the task —
    not the session id — while the id stays reachable through the row's tooltip."""
    window, coordinator, _store = _window(repository, qtbot)

    _start_new_session(window, qtbot, monkeypatch, "Fix requirement foobar")
    qtbot.waitUntil(lambda: len(coordinator.active_session_ids) == 1, timeout=5000)
    session_id = coordinator.focused_session_id

    window.show_view("workspace")
    if window.workspace.sidebar_toggle.isVisible():
        click_by_name(qtbot, window.workspace, "Toggle agents and todos drawer", QPushButton)
    settle(qtbot)
    switch = find_by_accessible_name(
        window.workspace,
        "Switch to session Fix requirement foobar",
        QPushButton,
        visible_only=True,
    )
    assert session_id not in switch.text()
    assert session_id in switch.toolTip()

    agent.release_all()
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=5000)
    coordinator.shutdown_all()


@verifies(SWR.SWR_2434, SWR.SWR_2415)
def test_continuing_a_session_after_reopening_shows_the_run_it_starts(
    repository: Path, agent: FakeAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user reopens Rotaris, picks a finished run out of Overview
    and asks it to carry on.
    Expected outcome: the workspace shows the continued run's work — not the state
    it was continued from.

    The window that continues the run is a *second* one over the same workspace,
    because that is what makes the run's session focused while no handle exists
    for it yet: "Continue run" focuses it, and only the prompt that follows
    creates the handle. A handle born after its session was focused used to keep
    the projection off, so the run streamed into its snapshot while transcript,
    task agents and token counts sat exactly where the reopened window had put
    them — a live run that reads as a hung one."""
    first_window, first_coordinator, _first_store = _window(repository, qtbot)
    _start_new_session(first_window, qtbot, monkeypatch, "first task")
    qtbot.waitUntil(lambda: len(first_coordinator.active_session_ids) == 1, timeout=5000)
    session_id = first_coordinator.focused_session_id
    agent.release(session_id)
    qtbot.waitUntil(lambda: not first_coordinator.active_session_ids, timeout=5000)
    first_coordinator.shutdown_all()
    first_window.close()

    window, coordinator, store = _window(repository, qtbot)
    window.show_view("dashboard")
    settle(qtbot)
    # A reopened window has no task wording for the run yet — the label is not
    # persisted — so the row reads as the session id (SWR-2907's tooltip case).
    resume_control = f"Continue session {session_id}"
    qtbot.waitUntil(
        lambda: bool(find_all_by_accessible_name(window.dashboard, resume_control, QPushButton)),
        timeout=5000,
    )
    click_by_name(qtbot, window.dashboard, resume_control, QPushButton)

    composer = find_by_accessible_name(
        window.workspace, "Run prompt", QPlainTextEdit, visible_only=True
    )
    type_text(qtbot, composer, "second task")
    click_by_name(qtbot, window.workspace, "Continue run", QPushButton)
    assert _blocking_notice(window) is None, _blocking_notice(window)

    # The agent's own line, not the user's echoed prompt: only the projection of
    # the running session can put it in the transcript.
    qtbot.waitUntil(
        lambda: any("working on second task" in event.text for event in store.transcript),
        timeout=10000,
    )
    assert coordinator.focused_session_id == session_id

    agent.release_all()
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=5000)
    coordinator.shutdown_all()


@verifies(SWR.SWR_3714)
def test_continuing_a_session_does_not_inherit_the_previous_runs_live_agents(
    repository: Path, agent: FakeAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user continues a session whose previous run was killed
    before it could close its agents.
    Expected outcome: the workspace shows those agents as ended. Only the
    continuation's own agents are live — a pulsing dot for a conversation that
    stopped yesterday cannot be cancelled, steered or waited for, and it makes
    the live counter say nothing true."""
    window, coordinator, store = _window(repository, qtbot)
    _start_new_session(window, qtbot, monkeypatch, "first task")
    qtbot.waitUntil(lambda: len(coordinator.active_session_ids) == 1, timeout=5000)
    session_id = coordinator.focused_session_id
    agent.release(session_id)
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=5000)
    # The continuation has to still be running while the assertions run: a
    # session that reports no run settles its agents through SWR-2913, which
    # would make this test pass without reading a single child record.
    agent.hold(session_id)

    # What a killed run leaves on disk: a record that never reached a terminal
    # state. Written into the snapshot rather than mocked, because the whole
    # question is what the next run reads back.
    manager = SessionManager(repository)
    state = manager.load_session(session_id)
    state.child_states = [
        *state.child_states,
        {
            "canonical_name": "ghost-agent",
            "name": "ghost-agent",
            "persona": "coding-agent",
            "state": "running",
            "active_tools": ["terminal"],
        },
    ]
    manager.flush_session(state)
    manager.release_lock(session_id)

    window.show_view("workspace")
    settle(qtbot)
    composer = find_by_accessible_name(
        window.workspace, "Run prompt", QPlainTextEdit, visible_only=True
    )
    type_text(qtbot, composer, "second task")
    click_by_name(qtbot, window.workspace, "Continue run", QPushButton)
    # The first run's own "Run completed" notice is still standing here, so the
    # evidence that the submission was accepted is the run itself.
    qtbot.waitUntil(lambda: coordinator.active_session_ids == [session_id], timeout=5000)

    qtbot.waitUntil(
        lambda: any("working on second task" in event.text for event in store.transcript),
        timeout=10000,
    )
    ghost = store.agents.get("ghost-agent")
    assert ghost is not None, "the previous run's agent vanished instead of being closed"
    assert ghost.is_live is False
    assert ghost.active_tools == []
    # The session itself is live, which is what makes this the interesting case:
    # SWR-2913 settles agents only when the session reports no run, so nothing
    # but the sweep can have closed this one.
    assert store.session_status == "running"
    assert [node.id for node in store.agent_list() if node.is_live] == []

    agent.release_all()
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=5000)
    coordinator.shutdown_all()


# Same shape as the serial test above: two live sessions, and the notification it
# waits on is raised by the one being released while the other still runs. Given a
# core to itself it settles well inside the 5s deadline; sharing four with the other
# xdist workers it misses it. Measured on a 4-core box, not guessed: red 3/6 under
# `-n auto`, green 3/3 in the serial pass.
@pytest.mark.serial
@verifies(SWR.SWR_2415)
def test_background_completion_notifies_without_disturbing_the_focused_run(
    repository: Path, agent: FakeAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user keeps working while another session finishes.
    Expected outcome: the finished run announces itself and updates its session row,
    and the focused run keeps its transcript and focus."""
    window, coordinator, store = _window(repository, qtbot)

    _start_new_session(window, qtbot, monkeypatch, "task A")
    qtbot.waitUntil(lambda: len(coordinator.active_session_ids) == 1, timeout=5000)
    session_a = coordinator.focused_session_id

    _start_new_session(window, qtbot, monkeypatch, "task B")
    qtbot.waitUntil(lambda: len(coordinator.active_session_ids) == 2, timeout=5000)
    session_b = coordinator.focused_session_id
    qtbot.waitUntil(lambda: any("task B" in event.text for event in store.transcript), timeout=5000)

    agent.release(session_a)
    qtbot.waitUntil(
        lambda: store.ui.notice is not None and session_a in store.ui.notice.title, timeout=5000
    )

    notice = store.ui.notice
    assert notice is not None
    assert coordinator.active_session_ids == [session_b]
    assert notice.action_id == f"session.focus:{session_a}"
    assert coordinator.focused_session_id == session_b
    assert any("task B" in event.text for event in store.transcript)

    qtbot.waitUntil(
        lambda: any(item.id == session_a and item.status == "completed" for item in store.sessions),
        timeout=5000,
    )
    focused_rows = [item.id for item in store.sessions if item.focused]
    assert focused_rows == [session_b]

    agent.release_all()
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=5000)
    coordinator.shutdown_all()


@verifies(SWR.SWR_2415)
def test_quitting_with_two_active_runs_warns_in_plural_and_stops_both(
    monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user closes Rotaris while two sessions are still running.
    Expected outcome: the confirmation names both runs and every run is shut down."""
    from PySide6.QtGui import QCloseEvent

    store = WorkspaceStore()
    store.set_sessions(
        [
            SessionInfo(id="a", name="a", status="running"),
            SessionInfo(id="b", name="b", status="running"),
        ]
    )
    stopped: list[str] = []

    class TwoRunCoordinator(QObject):
        run_started = Signal(str)
        run_finished = Signal(str)
        run_failed = Signal(str)

        active_session_ids = ["a", "b"]
        running = True
        focused_session_id = "a"

        def shutdown_all(self) -> None:
            stopped.append("all")

        def shutdown(self) -> None:
            stopped.append("one")

    window = MainWindow(store, run_bridge=TwoRunCoordinator())
    qtbot.addWidget(window)
    questions: list[str] = []

    def question(_parent, title, text, *_args, **_kwargs):
        questions.append(f"{title} {text}")
        return QMessageBox.StandardButton.Yes

    monkeypatch.setattr(QMessageBox, "question", question)

    class InteractiveClose(QCloseEvent):
        """A user-initiated close; Qt only marks real window-manager events."""

        def spontaneous(self) -> bool:
            return True

    event = InteractiveClose()
    window.closeEvent(event)

    assert questions and "2 runs are active" in questions[0]
    assert "all 2 runs" in questions[0]
    assert stopped == ["all"]
    assert event.isAccepted()


@verifies(SWR.SWR_2415)
@pytest.mark.parametrize("size", [(1000, 680), (1440, 900)])
def test_session_switcher_is_usable_and_keyboard_reachable_at_both_layouts(
    size: tuple[int, int], qtbot
) -> None:
    """Productive use: a user switches runs on a small laptop and a large display.
    Expected outcome: the session browser and Overview rows stay within the window and
    every switcher control is keyboard reachable."""
    from PySide6.QtCore import Qt

    store = WorkspaceStore()
    store.set_sessions(
        [
            SessionInfo(id="alpha", name="alpha", status="running", branch="rotaris/session/alpha"),
            SessionInfo(id="beta", name="beta", status="completed", branch="rotaris/session/beta"),
        ]
    )
    store.set_focused_session("alpha")
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.resize(*size)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("dashboard")

    switched: list[str] = []
    continued: list[str] = []
    window.dashboard.session_focus_requested.connect(switched.append)
    window.dashboard.session_continue_requested.connect(continued.append)
    rows = [
        window.dashboard.sessions_rows.itemAt(index).widget()
        for index in range(window.dashboard.sessions_rows.count())
    ]
    assert len(rows) == 2
    for row in rows:
        assert row.sizeHint().width() <= size[0]

    # Each switcher control is reachable by the name a screen reader announces,
    # visible at this size, and keyboard focusable.
    settle(qtbot)
    switch_alpha = find_by_accessible_name(
        window.dashboard, "Switch to session alpha", QPushButton, visible_only=True
    )
    continue_beta = find_by_accessible_name(
        window.dashboard, "Continue session beta", QPushButton, visible_only=True
    )
    for button in (switch_alpha, continue_beta):
        assert button.focusPolicy() != Qt.FocusPolicy.NoFocus

    click(qtbot, switch_alpha)
    assert switched == ["alpha"]

    # Focusing a run leaves Overview for the workspace and rebuilds the session
    # rows, so returning users meet freshly built controls, not the earlier ones.
    window.show_view("dashboard")
    settle(qtbot)
    click_by_name(qtbot, window.dashboard, "Continue session beta", QPushButton)
    assert continued == ["beta"]

    dialog = _SessionsDialog(store, window)
    qtbot.addWidget(dialog)
    dialog.resize(min(760, size[0]), min(460, size[1]))
    assert dialog.sessions.count() == 2
    assert "alpha" in dialog.sessions.item(0).text()
    assert dialog.width() <= size[0]


@verifies(SWR.SWR_2415)
@pytest.mark.parametrize("size", [(1000, 680), (1440, 900)])
def test_workspace_sidebar_switches_runs_without_leaving_the_transcript(
    size: tuple[int, int], qtbot
) -> None:
    """Productive use: a user swaps between live runs from the screen they work on.
    Expected outcome: the Workspace sidebar lists the live runs plus the focused one,
    marks the focused run with more than colour, and switching needs no detour through
    Overview."""
    from PySide6.QtCore import Qt

    # Real session ids — a timestamp plus a hash — are wider than the sidebar, so
    # short names would let a clipping regression through the width assertion.
    alpha = "20260807-141530-a1b2c3d4e5f6"
    beta = "20260807-152201-9f8e7d6c5b4a"
    store = WorkspaceStore()
    store.set_sessions(
        [
            SessionInfo(id=alpha, name=alpha, status="running", branch=f"rotaris/session/{alpha}"),
            SessionInfo(id=beta, name=beta, status="paused", branch=f"rotaris/session/{beta}"),
            SessionInfo(
                id="gamma", name="gamma", status="completed", branch="rotaris/session/gamma"
            ),
        ]
    )
    store.set_focused_session(alpha)
    window = MainWindow(store)
    qtbot.addWidget(window)
    window.resize(*size)
    window.show()
    qtbot.waitExposed(window)
    window.show_view("workspace")
    if window.workspace.sidebar_toggle.isVisible():
        # Below 1180px the sidebar is an overlay drawer; a user opens it first.
        click_by_name(qtbot, window.workspace, "Toggle agents and todos drawer", QPushButton)
    settle(qtbot)

    switched: list[str] = []
    window.workspace.session_focus_requested.connect(switched.append)

    rows = [
        window.workspace.session_rows.itemAt(index).widget()
        for index in range(window.workspace.session_rows.count())
    ]
    # The live and paused runs and no one else: a finished run nobody is reading
    # would only push the reachable ones out of a 236px sidebar.
    assert len(rows) == 2
    for row in rows:
        assert row.sizeHint().width() <= window.workspace.sidebar_panel.width()

    switch_beta = find_by_accessible_name(
        window.workspace, f"Switch to session {beta}", QPushButton, visible_only=True
    )
    assert switch_beta.focusPolicy() != Qt.FocusPolicy.NoFocus
    focused_switch = find_by_accessible_name(
        window.workspace, f"Switch to session {alpha}", QPushButton, visible_only=True
    )
    assert focused_switch.accessibleDescription() == "Currently focused run"

    click(qtbot, switch_beta)
    assert switched == [beta]

    # The sidebar is a run switcher now — worktree plumbing lives in the Git view.
    assert not find_all_by_accessible_name(window.workspace, "Worktrees")


@pytest.mark.unit
@verifies(SWR.SWR_2415)
def test_a_second_run_starting_does_not_wipe_another_sessions_completion_notice(
    repository: Path, qtbot
) -> None:
    """Productive use: a background session finishes, and a moment later the user's
    other run reports that it has started.
    Expected outcome: the completion notice is still there to be read. A background
    run's announcement is the whole of SWR-2415's AC-010, and a notification nobody
    saw has not been delivered.

    Deterministic on purpose. This defect shipped as a *race* — the finished
    session's notice and the other session's `run_started` cross the main thread in
    whichever order the machine allows — and it surfaced as a parallel-runs e2e
    failing roughly one run in three. The race is why it was rare; it is not why it
    was wrong, so the order is driven by hand here rather than waited for.

    The last two assertions are the other half of the rule: a run starting *does*
    clear the banner it replaces, both its own and the unscoped ones, or a stale
    "Run completed — review the transcript" would follow the user into the next run.
    """
    window, _coordinator, store = _window(repository, qtbot)

    window._session_run_finished("session-background", "completed")
    published = store.ui.notice
    assert published is not None
    assert "session-background" in published.title
    assert published.session_id == "session-background", "the notice must name its session"

    window._run_started("session-foreground")

    assert store.ui.notice is published, "another session's news was wiped by a run starting"

    # Its own banner, and one belonging to no session, are exactly what a start clears.
    window._run_started("session-background")
    assert store.ui.notice is None

    store.publish_notice(
        UiNotice(
            id="notice-unscoped",
            severity=NoticeSeverity.SUCCESS,
            title="Run completed",
            message="Review the transcript before starting the next task.",
            persistent=True,
        )
    )
    window._run_started("session-foreground")
    assert store.ui.notice is None
