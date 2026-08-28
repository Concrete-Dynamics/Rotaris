"""Productive use: a user reaches a responsive desktop while Git state loads.
Expected outcome: Git work completes off-thread, updates the store, and joins at shutdown."""

from __future__ import annotations

import threading
import time
from types import SimpleNamespace

import pytest
from PySide6.QtCore import QCoreApplication, QEvent, QObject, QTimer, Slot
from rotaris_core.reqtocode import SWR, verifies
from ui_query import settle

from rotaris.models.store import WorkspaceStore
from rotaris.services.git_refresh_bridge import GitRefreshBridge

pytestmark = pytest.mark.integration


class _BlockingGitService:
    def __init__(self, store: WorkspaceStore) -> None:
        self.store = store
        self.started = threading.Event()
        self.release = threading.Event()
        self.worker_thread = 0

    def collect(self) -> str:
        """Read off the GUI thread: block, then hand back what to apply."""
        self.worker_thread = threading.get_ident()
        self.started.set()
        self.release.wait(timeout=2)
        return "loaded-after-paint"

    def apply(self, snapshot: str) -> None:
        """Write on the GUI thread, as the real service does since SWR-3727."""
        self.store.branch = snapshot
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


def _pump_until(predicate, *, timeout: float = 5.0) -> bool:
    """Drive Qt until *predicate* holds, without nesting an event loop.

    `qtbot.waitUntil` runs a nested ``QEventLoop.exec()``, and re-entering the
    loop while this file's QThread is alive is what made it segfault about one
    run in five. The application never does that: it runs its *main* loop for
    the life of the process. Pumping the queue keeps Qt delivering -- which is
    the behaviour these tests are about -- without the re-entry.
    """
    deadline = time.monotonic() + timeout
    while True:
        if predicate():
            return True
        if time.monotonic() > deadline:
            return False
        QCoreApplication.processEvents()
        QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
        time.sleep(0.005)


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
    assert _pump_until(lambda: bool(responsive), timeout=5.0)

    service.release.set()
    assert _pump_until(lambda: observer.seen == ["loaded-after-paint"], timeout=10.0)
    # Drain the queued delivery before the worker thread is allowed to end. The
    # service emits `git_changed` from that thread, so Qt posts the call across
    # the boundary; letting the QThread finish and be destroyed while one of its
    # cross-thread events is still in flight crashes in native code, with no
    # Python frame to show for it.
    settle(qtbot)
    assert _pump_until(lambda: not bridge.running, timeout=10.0)
    bridge.shutdown()
    # Drain before leaving. `shutdown()` schedules the QThread's deletion with
    # deleteLater, and the thread is a *child* of the bridge -- so a test that
    # returns without spinning the loop leaves a deferred delete pending on an
    # object Python will collect at some arbitrary later moment, inside another
    # test's event loop. That double destruction is a segfault, and it is why
    # this file brought a worker down under `-n auto` while passing on its own.
    settle(qtbot)


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
    # Same reason as above: let the deferred deletion run while the bridge that
    # owns the thread is still alive.
    settle(qtbot)


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
