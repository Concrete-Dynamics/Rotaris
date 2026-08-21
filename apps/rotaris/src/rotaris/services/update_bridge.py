"""Launch-time update check and install, off the UI thread (SWR-3003).

Same shape as :mod:`rotaris.services.worktree_integration`: a ``QObject`` that
owns a ``QThread``, does every blocking thing on it, and reports back with
signals. Nothing here touches a widget — an update check that stutters the window
it is announcing itself in would be worse than no update check.

The decisions live in :mod:`rotaris_core.updates`; this file is the thread and
the wiring, so the logic stays testable without a Qt event loop.
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path

from PySide6.QtCore import QObject, QThread, Signal, Slot
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.updates import (
    Applied,
    Asset,
    Fetcher,
    HttpFetcher,
    Install,
    Release,
    apply_update,
    asset_for,
    checksums_for,
    clear_stale_backup,
    detect_install,
    is_newer,
    latest_release,
    stage,
    summarize,
    verify,
)


@dataclass(frozen=True)
class UpdateOffer:
    """A newer release this installation can actually install."""

    version: str
    summary: str
    asset: Asset
    release: Release


class _Worker(QObject):
    """A unit of blocking work that reports when it is done.

    One base class rather than two look-alikes so :meth:`UpdateBridge._start` can
    take a worker without knowing which of them it got.
    """

    finished = Signal()

    @Slot()
    def run(self) -> None:  # pragma: no cover - overridden
        raise NotImplementedError


@traces(SWR.SWR_3003)
class UpdateBridge(QObject):
    """Checks for a newer Rotaris, and installs one when asked to.

    Constructed with an ``Install`` and a ``Fetcher`` so a test can drive the real
    flow against a recorded release without a network or a frozen binary.
    """

    #: A newer version exists and has a file for this installation (AC-005).
    available = Signal(object)
    #: ``(bytes_received, bytes_expected)``; expected is 0 when unknown (AC-009).
    progress = Signal(int, int)
    #: An :class:`~rotaris_core.updates.Applied` describing what happened (AC-011).
    applied = Signal(object)
    #: A user-visible reason the update did not happen (AC-010, AC-012).
    failed = Signal(str)

    def __init__(
        self,
        *,
        install: Install | None = None,
        fetcher: Fetcher | None = None,
        staging: Path | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self.install = install if install is not None else detect_install()
        self._fetcher = fetcher
        self._staging = staging
        self._thread: QThread | None = None
        self._worker: _Worker | None = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.isRunning()

    @traces(SWR.SWR_3003)
    def check(self, running_version: str) -> bool:
        """Ask GitHub whether something newer exists. Returns False if it did not ask.

        A pip install never asks (AC-001), and neither does a window that is
        already busy with an earlier answer.
        """
        if not self.install.updatable or self.running:
            return False
        # The previous update left the outgoing executable next to the new one;
        # this is the first moment Windows will let go of it.
        clear_stale_backup(self.install)
        worker = _CheckWorker(self.install, running_version, self._fetcher)
        worker.found.connect(self.available)
        return self._start(worker)

    @traces(SWR.SWR_3003)
    def install_update(self, offer: UpdateOffer, *, staging: Path | None = None) -> bool:
        """Download, verify and install ``offer``. Returns False if already busy."""
        if self.running:
            return False
        destination = staging if staging is not None else self._staging
        worker = _InstallWorker(self.install, offer, self._fetcher, destination)
        worker.progress.connect(self.progress)
        worker.applied.connect(self.applied)
        worker.failed.connect(self.failed)
        return self._start(worker)

    def _start(self, worker: _Worker) -> bool:
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.finished.connect(thread.quit)
        thread.finished.connect(worker.deleteLater)
        thread.finished.connect(self._finished)
        self._thread = thread
        self._worker = worker
        thread.start()
        return True

    def _finished(self) -> None:
        thread = self._thread
        self._thread = None
        self._worker = None
        if thread is not None:
            thread.deleteLater()

    def stop(self) -> None:
        """Wait for an in-flight check at shutdown, so the thread cannot outlive us."""
        thread = self._thread
        if thread is not None and thread.isRunning():
            thread.quit()
            thread.wait(5000)


class _CheckWorker(_Worker):
    """One network round trip, and the three questions its answer has to pass."""

    found = Signal(object)

    def __init__(self, install: Install, running_version: str, fetcher: Fetcher | None) -> None:
        super().__init__()
        self._install = install
        self._running = running_version
        self._fetcher = fetcher

    @Slot()
    def run(self) -> None:
        try:
            release = latest_release(fetcher=self._fetcher)
            if release is not None and is_newer(release.version, self._running):
                asset = asset_for(self._install, release)
                if asset is not None:
                    self.found.emit(
                        UpdateOffer(
                            version=release.version,
                            summary=summarize(release.body),
                            asset=asset,
                            release=release,
                        )
                    )
        finally:
            # No ``failed`` path: ``latest_release`` answers None for everything
            # that can go wrong, and a launch-time check must stay silent (AC-003).
            self.finished.emit()


class _InstallWorker(_Worker):
    """Download, verify, install — in that order, and never further on failure."""

    progress = Signal(int, int)
    applied = Signal(object)
    failed = Signal(str)

    def __init__(
        self,
        install: Install,
        offer: UpdateOffer,
        fetcher: Fetcher | None,
        staging: Path | None,
    ) -> None:
        super().__init__()
        self._install = install
        self._offer = offer
        self._fetcher = fetcher
        self._staging = staging

    @Slot()
    def run(self) -> None:
        fetcher = self._fetcher if self._fetcher is not None else HttpFetcher()
        try:
            destination = (
                self._staging
                if self._staging is not None
                else Path(tempfile.mkdtemp(prefix="rotaris-update-"))
            )
            digests = checksums_for(self._offer.release, fetcher=fetcher)
            staged = stage(
                self._offer.asset,
                dest=destination,
                fetcher=fetcher,
                on_progress=lambda received, total: self.progress.emit(received, total),
            )
            verify(staged, digests.get(self._offer.asset.name))
            result: Applied = apply_update(self._install, staged)
        except Exception as exc:  # noqa: BLE001 — every failure is one sentence to the user
            self.failed.emit(str(exc))
        else:
            self.applied.emit(result)
        finally:
            self.finished.emit()
