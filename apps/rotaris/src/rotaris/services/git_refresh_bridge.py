"""Post-paint Git refresh bridge for the Rotaris desktop."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, QThread, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris.services.git_service import GitService


@traces(SWR.SWR_3727)
class GitRefreshBridge(QObject):
    """Run one startup Git refresh outside the Qt event loop."""

    completed = Signal()
    failed = Signal(str)

    def __init__(self, service: GitService, *, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._service = service
        self._thread: QThread | None = None
        self._worker: _GitRefreshWorker | None = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.isRunning()

    @traces(SWR.SWR_3727)
    def start(self) -> bool:
        """Start the refresh once. Return whether a worker was launched."""
        if self.running:
            return False
        thread = QThread(self)
        worker = _GitRefreshWorker(self._service)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        # Queued across the thread boundary, because this object lives in the
        # GUI thread: the snapshot is read on the worker and written to the
        # store here, which is the whole point of the split (SWR-3727).
        worker.collected.connect(self._apply)
        worker.failed.connect(self.failed)
        worker.finished.connect(thread.quit)
        # Qt's own idiom: each object's deletion is scheduled exactly once, by
        # the signal that says it is safe. The bridge does not schedule either
        # of them itself -- doing that from `_finished` *and* from `shutdown()`
        # is how the same QThread got two deferred deletions and a double free.
        thread.finished.connect(worker.deleteLater)
        thread.finished.connect(thread.deleteLater)
        thread.finished.connect(self._finished)
        self._thread = thread
        self._worker = worker
        thread.start()
        return True

    @traces(SWR.SWR_3727)
    def shutdown(self) -> None:
        """Join an in-flight refresh before its window and store are destroyed."""
        thread = self._thread
        self._thread = None
        self._worker = None
        if thread is None:
            return
        thread.quit()
        thread.wait()
        # Deliberately no deleteLater: `thread.finished` already scheduled it.

    @Slot()
    def _apply(self) -> None:
        """Write the worker's snapshot into the store, on the GUI thread."""
        worker = self._worker
        if worker is None:
            return
        try:
            self._service.apply(worker.snapshot)  # type: ignore[arg-type]
        except Exception as exc:  # noqa: BLE001 - a launch refresh stays recoverable
            self.failed.emit(str(exc))
            return
        self.completed.emit()

    @Slot()
    def _finished(self) -> None:
        """Forget the finished run. Deleting its objects is Qt's job, above."""
        self._thread = None
        self._worker = None


@traces(SWR.SWR_3727)
class _GitRefreshWorker(QObject):
    #: Raised once the snapshot is ready. It carries nothing: the snapshot is
    #: left on the worker and read by the GUI thread from there, so no Python
    #: object is marshalled across the thread boundary by Qt.
    collected = Signal()
    failed = Signal(str)
    finished = Signal()

    def __init__(self, service: GitService) -> None:
        super().__init__()
        self._service = service
        #: What `collect()` read, for the GUI thread to pick up. Written once
        #: here and read once there, ordered by the `collected` signal between.
        self.snapshot: object = None

    @Slot()
    def run(self) -> None:
        """Read git off the GUI thread. Touches nothing the GUI thread owns."""
        try:
            self.snapshot = self._service.collect()
        except Exception as exc:  # noqa: BLE001 - a launch refresh stays recoverable
            self.failed.emit(str(exc))
        else:
            self.collected.emit()
        finally:
            self.finished.emit()
