"""Hermetic end-to-end coverage for the per-session OS-level sandbox (SWR-2507).

Real window, real coordinator, real RunBridge threads and real SessionManager
persistence; only the agent execution itself (``_run_task``) and the host's
sandbox backend are replaced by controllable stand-ins.

The backend has to be injected: this suite runs on hosts that cannot sandbox
(native Windows probes unavailable by design), so a test that trusted the real
host would only ever exercise one column of the matrix.  Both
``rotaris_core.sandbox.backends.resolve_backend`` and
``rotaris_core.sandbox.session.resolve_backend`` are replaced, because the
availability probe and the enforcement path each hold their own reference.
"""

from __future__ import annotations

import subprocess
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import pytest
from conftest import dispose_window
from PySide6.QtWidgets import QCheckBox, QLabel, QPlainTextEdit, QPushButton
from rotaris_core.init import registry
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sandbox.spec import SandboxAvailability
from rotaris_core.session.manager import SessionManager
from ui_query import click, click_by_name, find_by_accessible_name, settle, type_text

from rotaris.models.state import ProviderInfo
from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_coordinator import RunCoordinator
from rotaris.views.main_window import MainWindow, _SessionLaunchDialog

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.e2e

UNAVAILABLE = SandboxAvailability(
    available=False,
    backend="unavailable",
    reason="OS-level sandboxing is not supported on this host.",
    remediation="Run Rotaris inside a WSL2 distribution and install bubblewrap there.",
)
AVAILABLE = SandboxAvailability(available=True, backend="bubblewrap")


class _FakeBackend:
    """A sandbox backend whose verdict the test decides."""

    def __init__(self, availability: SandboxAvailability) -> None:
        self.name = availability.backend
        self._availability = availability

    def probe(self) -> SandboxAvailability:
        return self._availability

    def wrap(self, command: str, spec: Any) -> str:
        return command


def _force_sandbox(monkeypatch: pytest.MonkeyPatch, availability: SandboxAvailability) -> None:
    backend = _FakeBackend(availability)
    for module in ("rotaris_core.sandbox.backends", "rotaris_core.sandbox.session"):
        monkeypatch.setattr(f"{module}.resolve_backend", lambda *_a, **_kw: backend)


class _RecordingAgent:
    """Stands in for the agent loop: records the config it was handed, returns."""

    def __init__(self) -> None:
        self.configs: list[Any] = []

    async def run_task(
        self,
        prompt: str,
        config: Any,
        manager: Any,
        state: Any,
        _max_iterations: int,
        **_kwargs: Any,
    ) -> Any:
        self.configs.append(config)
        state.transcript_events.append({"role": "assistant", "content": f"done: {prompt}"})
        await manager.persister.flush(state)
        return SimpleNamespace(iterations=[])


@pytest.fixture
def agent(monkeypatch: pytest.MonkeyPatch) -> _RecordingAgent:
    fake = _RecordingAgent()
    monkeypatch.setattr("rotaris_core.cli.background._run_task", fake.run_task)
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda progress: ("completed", "Run completed.", "info"),
    )
    return fake


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


#: Windows this file has opened, drained by `_dispose_live_windows` below.
_LIVE_WINDOWS: list[MainWindow] = []


@pytest.fixture(autouse=True)
def _dispose_live_windows():
    """Destroy every window this file opened, even when a test fails.

    These are real windows over a real repository with real `RunBridge` threads,
    and `qtbot.addWidget` does not destroy what it closes. A window left alive
    is left for Python's cyclic GC to collect whenever it next runs — and when
    that lands inside another test's nested Qt event loop, it segfaults the
    worker. `Garbage-collecting` was the top frame of the crash that led here,
    with a live run-bridge thread still in `asyncio.run` two frames below.

    Ownership is one or the other, so `_window` deliberately does not call
    `qtbot.addWidget`: pytest-qt would then close a window this has already
    destroyed. A fixture rather than a line at the end of each test, because the
    test that fails is exactly the one that would skip it.
    """
    yield
    while _LIVE_WINDOWS:
        dispose_window(_LIVE_WINDOWS.pop())


def _window(repository: Path, qtbot: Any) -> tuple[MainWindow, RunCoordinator, ConfigService]:
    """The real window on `repository`, faking only the provider network probes."""
    store = WorkspaceStore()
    registry.mark_initialized(repository)
    service = ConfigService(repository, store)
    # Probing configured provider endpoints costs 5-18s and is an external system.
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    store.providers = [
        ProviderInfo(id="test", label="Test provider", connected=True, status="healthy")
    ]
    coordinator = RunCoordinator(repository, store, service)
    window = MainWindow(store, config_service=service, run_bridge=coordinator)
    _LIVE_WINDOWS.append(window)
    window.resize(1440, 900)
    window.show()
    qtbot.waitExposed(window)
    return window, coordinator, service


def _open_launch_dialog(
    window: MainWindow, qtbot: Any, monkeypatch: pytest.MonkeyPatch, *, sandboxed: bool | None
) -> _SessionLaunchDialog:
    """Click 'New session' and answer the launch dialog the way a user would.

    ``sandboxed`` of ``None`` leaves the offered default untouched.
    """
    dialogs: list[_SessionLaunchDialog] = []

    def answer(dialog: _SessionLaunchDialog) -> int:
        dialogs.append(dialog)
        dialog.show()
        qtbot.waitExposed(dialog)
        if sandboxed is not None and dialog.sandbox_checkbox.isChecked() != sandboxed:
            click(qtbot, dialog.sandbox_checkbox)
        click_by_name(qtbot, dialog, "Continue", QPushButton)
        return 1

    monkeypatch.setattr(_SessionLaunchDialog, "exec", answer)
    window.show_view("dashboard")
    settle(qtbot)
    click_by_name(qtbot, window.dashboard, "New session", QPushButton)
    return dialogs[-1]


def _send(window: MainWindow, qtbot: Any, prompt: str) -> None:
    composer = find_by_accessible_name(
        window.workspace, "Run prompt", QPlainTextEdit, visible_only=True
    )
    type_text(qtbot, composer, prompt)
    click_by_name(qtbot, window.workspace, "Start run", QPushButton)


def _notice(window: MainWindow) -> Any:
    return window.store.ui.notice


@verifies(SWR.SWR_2507)
def test_user_sandboxes_one_session_and_sees_which_backend_ran_it(
    repository: Path, agent: _RecordingAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user confines one risky task to an OS-level sandbox.
    Expected outcome: the run executes under the sandbox, the session snapshot records
    the backend that provided it, and the workspace names that backend."""
    _force_sandbox(monkeypatch, AVAILABLE)
    window, coordinator, _service = _window(repository, qtbot)

    dialog = _open_launch_dialog(window, qtbot, monkeypatch, sandboxed=True)
    assert dialog.sandbox_checkbox.isEnabled()
    assert dialog.sandbox_mode == "workspace-write"
    _send(window, qtbot, "audit the dependencies")
    qtbot.waitUntil(lambda: bool(coordinator.focused_session_id), timeout=10_000)
    session_id = coordinator.focused_session_id
    qtbot.waitUntil(lambda: bool(agent.configs), timeout=10_000)

    # The engine reads the mode off the config the run actually launched with.
    assert agent.configs[0].runtime.sandbox_mode == "workspace-write"

    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=15_000)
    coordinator.shutdown_all()
    snapshot = SessionManager(repository).read_session_snapshot(session_id)

    assert snapshot.sandboxed is True
    assert snapshot.sandbox_backend == "bubblewrap"
    assert window.workspace.sandbox_badge.isVisible()
    assert "bubblewrap" in window.workspace.sandbox_badge.text()


@verifies(SWR.SWR_2507)
def test_declining_the_sandbox_runs_and_records_an_unsandboxed_session(
    repository: Path, agent: _RecordingAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user starts an ordinary task without the sandbox on a host that offers it.
    Expected outcome: the run stays unsandboxed, records no backend, and claims no protection."""
    _force_sandbox(monkeypatch, AVAILABLE)
    window, coordinator, _service = _window(repository, qtbot)

    dialog = _open_launch_dialog(window, qtbot, monkeypatch, sandboxed=False)
    assert dialog.sandbox_mode == "off"
    _send(window, qtbot, "rename a variable")
    qtbot.waitUntil(lambda: bool(coordinator.focused_session_id), timeout=10_000)
    session_id = coordinator.focused_session_id
    qtbot.waitUntil(lambda: bool(agent.configs), timeout=10_000)
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=15_000)
    coordinator.shutdown_all()
    snapshot = SessionManager(repository).read_session_snapshot(session_id)

    assert agent.configs[0].runtime.sandbox_mode == "off"
    assert snapshot.sandboxed is False
    assert snapshot.sandbox_backend == ""
    assert not window.workspace.sandbox_badge.isVisible()


@verifies(SWR.SWR_2507)
def test_host_without_a_sandbox_explains_itself_instead_of_offering_a_dead_control(
    repository: Path, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user on Windows finds out why the sandbox is not on offer.
    Expected outcome: the toggle is disabled and carries the backend's own remediation."""
    _force_sandbox(monkeypatch, UNAVAILABLE)
    window, _coordinator, _service = _window(repository, qtbot)

    dialog = _open_launch_dialog(window, qtbot, monkeypatch, sandboxed=None)
    checkbox = find_by_accessible_name(
        dialog, "Enable OS-level sandbox", QCheckBox, visible_only=False
    )

    assert not checkbox.isEnabled()
    assert not checkbox.isChecked()
    assert UNAVAILABLE.reason in checkbox.toolTip()
    assert UNAVAILABLE.remediation in checkbox.toolTip()
    # Hover is not a disclosure: the same explanation is on screen as text.
    labels = [label.text() for label in dialog.findChildren(QLabel)]
    assert any(UNAVAILABLE.remediation in text for text in labels)
    # A workspace that never asked for a sandbox still launches normally.
    assert dialog.sandbox_mode == "off"


@verifies(SWR.SWR_2507)
def test_configured_sandbox_that_cannot_run_fails_the_session_instead_of_dropping_it(
    repository: Path, agent: _RecordingAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a workspace that always sandboxes is opened on a host that cannot.
    Expected outcome: the run fails with the backend's reason and remediation, the agent
    loop is never entered, and nothing claims the session was sandboxed."""
    _force_sandbox(monkeypatch, UNAVAILABLE)
    window, coordinator, service = _window(repository, qtbot)
    assert service.config is not None
    # The store, not the loaded file: ``build_run_config`` pushes the store onto
    # the run's RuntimePolicy (SWR-2505/2507), so this is what a user changing
    # the workspace default in Settings actually sets.
    service.store.runtime.sandbox_mode = "workspace-write"

    dialog = _open_launch_dialog(window, qtbot, monkeypatch, sandboxed=None)
    # A host that cannot honour the workspace setting must not quietly turn it
    # off; the box stays checked (and disabled) so the launch reports the truth.
    assert dialog.sandbox_checkbox.isChecked()
    assert not dialog.sandbox_checkbox.isEnabled()
    assert dialog.sandbox_mode == "workspace-write"

    _send(window, qtbot, "refactor the parser")
    qtbot.waitUntil(
        lambda: getattr(_notice(window), "title", "") == "Run stopped before it started",
        timeout=15_000,
    )
    notice = _notice(window)
    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=15_000)
    coordinator.shutdown_all()

    assert agent.configs == []
    assert UNAVAILABLE.reason in notice.message
    assert UNAVAILABLE.remediation in notice.message
    assert not window.workspace.sandbox_badge.isVisible()
    # The run never started, so no half-created session is left behind holding
    # a lock the user would have to clear by hand.
    assert SessionManager(repository).list_sessions() == []


@verifies(SWR.SWR_2507)
def test_badge_follows_the_recorded_verdict_when_a_second_session_is_not_sandboxed(
    repository: Path, agent: _RecordingAgent, monkeypatch: pytest.MonkeyPatch, qtbot
) -> None:
    """Productive use: a user runs a sandboxed task and then an ordinary one beside it.
    Expected outcome: each session's badge reports that session's own verdict."""
    _force_sandbox(monkeypatch, AVAILABLE)
    window, coordinator, _service = _window(repository, qtbot)

    _open_launch_dialog(window, qtbot, monkeypatch, sandboxed=True)
    _send(window, qtbot, "task one")
    qtbot.waitUntil(lambda: bool(coordinator.focused_session_id), timeout=10_000)
    sandboxed_session = coordinator.focused_session_id
    qtbot.waitUntil(lambda: window.workspace.sandbox_badge.isVisible(), timeout=10_000)

    _open_launch_dialog(window, qtbot, monkeypatch, sandboxed=False)
    _send(window, qtbot, "task two")
    qtbot.waitUntil(
        lambda: coordinator.focused_session_id not in ("", sandboxed_session), timeout=10_000
    )

    assert not window.workspace.sandbox_badge.isVisible()

    coordinator.focus(sandboxed_session)

    assert window.workspace.sandbox_badge.isVisible()
    assert "bubblewrap" in window.workspace.sandbox_badge.text()

    qtbot.waitUntil(lambda: not coordinator.active_session_ids, timeout=15_000)
    coordinator.shutdown_all()
