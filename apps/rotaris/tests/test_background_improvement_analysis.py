"""Desktop workflow coverage for optional post-run improvement analysis."""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass
from types import SimpleNamespace

import pytest
from PySide6.QtCore import Qt
from rotaris_core.config.schema import ModelConfig, PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.session.manager import SessionManager

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.services.run_bridge import RunBridge
from rotaris.views.main_window import MainWindow

pytestmark = pytest.mark.integration


@dataclass(frozen=True)
class _Result:
    artifact_id: str | None = "impart_terminal"
    proposal_count: int = 2
    cancelled: bool = False


class _DelayedJob:
    def __init__(self, result: _Result | None = None) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.cancelled = False
        self._result = result or _Result()

    async def run(self) -> _Result:
        self.started.set()
        await asyncio.to_thread(self.release.wait)
        return _Result(cancelled=True) if self.cancelled else self._result

    def request_cancel(self) -> None:
        self.cancelled = True
        self.release.set()


class _ConfigService:
    def __init__(self) -> None:
        self.refreshes = 0

    def refresh_improvement_proposals(self) -> None:
        self.refreshes += 1


class _PersistedStateJob:
    def __init__(self, workspace, session_id: str) -> None:
        self.workspace = workspace
        self.session_id = session_id
        self.checked = threading.Event()

    async def run(self) -> _Result:
        assert (
            SessionManager(self.workspace).load_session(self.session_id).execution_status
            == "completed"
        )
        self.checked.set()
        return _Result(proposal_count=0)

    def request_cancel(self) -> None:
        return None


def _run_config() -> RotarisConfig:
    return RotarisConfig(
        default_persona="orchestrator",
        large_model="test/model",
        models={"test/model": ModelConfig(provider="test", model_id="m", max_input_tokens=100_000)},
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="test/model",
                thinking="high",
                tools=["delegate"],
            ),
        },
    )


@verifies(SWR.SWR_2414)
def test_completed_run_stays_usable_while_background_analysis_finishes(tmp_path, qtbot) -> None:
    """Productive use: a desktop user starts follow-up work after a completed run.
    Expected outcome: improvement analysis is visible in the background and its
    persistent proposal notice opens Library → Improvement proposals."""
    store = WorkspaceStore()
    store.session_name = "terminal-session"
    store.set_session_status("completed")
    service = _ConfigService()
    bridge = RunBridge(tmp_path, store, service)  # type: ignore[arg-type]
    window = MainWindow(store, run_bridge=bridge)
    qtbot.addWidget(window)
    window.show()
    window.show_view("workspace")

    job = _DelayedJob()
    bridge._queue_improvement_job(job)
    qtbot.waitUntil(job.started.is_set)

    assert store.improvement_collection_active is True
    assert window.title_bar.improvement_label.isVisible()
    assert window.workspace.improvement_activity.isVisible()
    assert "Reviewing run for improvements" in window.workspace.improvement_label.text()
    assert window.workspace.improvement_label.accessibleDescription()
    assert window.workspace.send_button.isEnabled()

    job.release.set()
    qtbot.waitUntil(lambda: not store.improvement_collection_active)

    assert service.refreshes == 1
    assert store.ui.notice is not None
    assert store.ui.notice.title == "2 improvement proposals ready"
    qtbot.mouseClick(window.notice_banner.action_button, Qt.MouseButton.LeftButton)
    assert window.stack.currentWidget() is window.library
    assert window.library.tabs.currentIndex() == window.library._TAB_IDS.index("proposals")

    bridge.shutdown()


@verifies(SWR.SWR_2414)
def test_shutdown_cancels_background_analysis_without_notice(tmp_path, qtbot) -> None:
    """Productive use: a desktop user can close the app during optional analysis.
    Expected outcome: the activity clears without a completion notice or artifact result."""
    store = WorkspaceStore()
    store.session_name = "terminal-session"
    store.set_session_status("completed")
    bridge = RunBridge(tmp_path, store, _ConfigService())  # type: ignore[arg-type]
    job = _DelayedJob()

    bridge._queue_improvement_job(job)
    qtbot.waitUntil(job.started.is_set)
    bridge.shutdown()

    assert job.cancelled is True
    assert store.improvement_collection_active is False
    assert store.ui.notice is None


@verifies(SWR.SWR_2414)
def test_task_state_is_persisted_before_rotaris_starts_analysis(
    tmp_path, qtbot, monkeypatch
) -> None:
    """Productive use: a desktop user sees a completed task before review begins.
    Expected outcome: the collector reads a terminal persisted session, then
    reports its empty result without keeping the run active."""
    store = WorkspaceStore()
    service = ConfigService(tmp_path, store)
    service.config = _run_config()
    service.session_manager = SessionManager(tmp_path)
    holder: dict[str, _PersistedStateJob] = {}

    async def fake_run_task(
        _prompt,
        _config,
        _manager,
        state,
        _max_iterations,
        interrupt_handler=None,
        iteration_observer=None,
        delegation_strategy=None,
        post_run_improvement_job_sink=None,
        **_lifecycle_kwargs,
    ):
        del interrupt_handler, iteration_observer, delegation_strategy
        job = _PersistedStateJob(tmp_path, state.session_id)
        holder["job"] = job
        assert post_run_improvement_job_sink is not None
        post_run_improvement_job_sink(job)
        return SimpleNamespace(iterations=[])

    monkeypatch.setattr("rotaris_core.cli.background._run_task", fake_run_task)
    monkeypatch.setattr(
        "rotaris_core.ralph.state.summarize_run_progress",
        lambda _progress: ("completed", "Run completed.", "info"),
    )
    bridge = RunBridge(tmp_path, store, service)  # type: ignore[arg-type]
    try:
        with qtbot.waitSignal(bridge.run_finished, timeout=10_000):
            assert bridge.start("finish task")
        qtbot.waitUntil(lambda: holder["job"].checked.is_set())
        qtbot.waitUntil(lambda: not store.improvement_collection_active)
    finally:
        bridge.shutdown()

    assert store.session_status == "completed"
    assert store.ui.notice is not None
    assert store.ui.notice.title == "Improvement analysis complete — no proposals"
