"""Productive use: a user reaches a responsive desktop while Git state loads.
Expected outcome: Git work completes off-thread, updates the store, and joins at shutdown."""

from __future__ import annotations

import threading
from types import SimpleNamespace

import pytest
from PySide6.QtCore import QObject, QTimer, Slot
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.store import WorkspaceStore
from rotaris.services.git_refresh_bridge import GitRefreshBridge

pytestmark = pytest.mark.integration


class _BlockingGitService:
    def __init__(self, store: WorkspaceStore) -> None:
        self.store = store
        self.started = threading.Event()
        self.release = threading.Event()
        self.worker_thread = 0

    def refresh(self) -> None:
        self.worker_thread = threading.get_ident()
        self.started.set()
        self.release.wait(timeout=2)
        self.store.branch = "loaded-after-paint"
        self.store.git_changed.emit()


class _StoreObserver(QObject):
    """A receiver that belongs to the GUI thread, as the real ones do.

    The bridge runs ``refresh()`` on a worker QThread and the service emits
    ``git_changed`` from there. Every receiver in the app is a QObject slot
    living in the GUI thread (``chrome.refresh``, ``git._status_reflow.request``
    and friends), so Qt's auto connection queues the call across the thread
    boundary. A bare lambda has no thread affinity, so Qt runs it *directly on
    the worker thread* instead — concurrently with the main thread's event loop,
    which segfaults PySide perhaps two runs in three.
    """

    def __init__(self, store: WorkspaceStore) -> None:
        super().__init__()
        self._store = store
        self.seen: list[str] = []

    @Slot()
    def note(self) -> None:
        self.seen.append(self._store.branch)


@verifies(SWR.SWR_3727)
def test_startup_git_refresh_keeps_qt_responsive_and_updates_the_store(qtbot) -> None:
    """Productive use: a user can interact with Rotaris while a slow Git checkout is read.
    Expected outcome: Qt processes events and the normal store receives the completed state."""
    store = WorkspaceStore()
    service = _BlockingGitService(store)
    bridge = GitRefreshBridge(service)  # type: ignore[arg-type]
    observer = _StoreObserver(store)
    store.git_changed.connect(observer.note)

    assert bridge.start() is True
    assert service.started.wait(timeout=1)
    assert service.worker_thread != threading.get_ident()

    responsive: list[bool] = []
    QTimer.singleShot(0, lambda: responsive.append(True))
    qtbot.waitUntil(lambda: bool(responsive), timeout=500)

    service.release.set()
    qtbot.waitUntil(lambda: observer.seen == ["loaded-after-paint"], timeout=1000)
    qtbot.waitUntil(lambda: not bridge.running, timeout=1000)
    bridge.shutdown()


@verifies(SWR.SWR_3727)
def test_startup_git_refresh_is_joined_during_shutdown(qtbot) -> None:
    """Productive use: a user closes Rotaris while startup Git discovery is still running.
    Expected outcome: shutdown waits for the bounded worker and leaves no live QThread."""
    service = _BlockingGitService(WorkspaceStore())
    bridge = GitRefreshBridge(service)  # type: ignore[arg-type]
    assert bridge.start() is True
    assert service.started.wait(timeout=1)

    release = threading.Timer(0.05, service.release.set)
    release.start()
    bridge.shutdown()
    release.join(timeout=1)

    assert bridge.running is False


@verifies(SWR.SWR_3715, SWR.SWR_3727)
def test_post_show_setup_refreshes_git_before_workspace_onboarding(monkeypatch, tmp_path) -> None:
    """Productive use: a first-launch user completes setup before choosing a workspace.
    Expected outcome: setup, status refresh, Git refresh, and the chooser run in that order."""
    from rotaris.main import schedule_post_show_machine_setup

    callbacks = []
    events: list[str] = []
    window = SimpleNamespace(
        settings=SimpleNamespace(refresh_machine_setup=lambda: events.append("status")),
        start_git_refresh=lambda: events.append("git"),
        prompt_for_initial_workspace=lambda: events.append("workspace"),
    )

    def setup(**kwargs):  # type: ignore[no-untyped-def]
        assert kwargs == {"workspace": tmp_path, "parent": window}
        events.append("setup")

    monkeypatch.setattr(
        "rotaris.main.QTimer.singleShot", lambda _delay, callback: callbacks.append(callback)
    )
    monkeypatch.setattr("rotaris.setup_coordinator.run_desktop_setup", setup)

    schedule_post_show_machine_setup(window, tmp_path, prompt_for_workspace=True)  # type: ignore[arg-type]
    assert events == []
    callbacks[0]()
    assert events == ["setup", "status", "git", "workspace"]
