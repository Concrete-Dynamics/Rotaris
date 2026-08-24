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
        worker.completed.connect(self.completed)
        worker.failed.connect(self.failed)
        worker.finished.connect(thread.quit)
        thread.finished.connect(worker.deleteLater)
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
        thread.deleteLater()

    @Slot()
    def _finished(self) -> None:
        thread = self._thread
        self._thread = None
        self._worker = None
        if thread is not None:
            thread.deleteLater()


@traces(SWR.SWR_3727)
class _GitRefreshWorker(QObject):
    completed = Signal()
    failed = Signal(str)
    finished = Signal()

    def __init__(self, service: GitService) -> None:
        super().__init__()
        self._service = service

    @Slot()
    def run(self) -> None:
        try:
            self._service.refresh()
        except Exception as exc:  # noqa: BLE001 - a launch refresh stays recoverable
            self.failed.emit(str(exc))
        else:
            self.completed.emit()
        finally:
            self.finished.emit()
