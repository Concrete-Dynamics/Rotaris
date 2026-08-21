"""Qt thread bridge for listing, previewing and restoring checkpoints (SWR-2437).

Every call this bridge makes runs Git: ``list_checkpoints`` re-reads the session
snapshot, ``preview`` stages the whole working tree to diff it, and ``restore``
writes files. On a repository of any size each of those is tens to hundreds of
milliseconds, and none of them may happen on the Qt event loop — a frozen window
during a rollback is exactly when a user most needs to see that something is
happening.

So the bridge owns one worker thread and speaks to the window only in the
framework-free payloads from :mod:`rotaris.models.state`. Nothing here raises
into a slot: :class:`~rotaris_core.session.checkpoint_restore.CheckpointRestorer`
turns every refusal into a ``blocked_reason``, and the one thing it cannot know
about — that the session is still running, and recording a safety checkpoint
would race the run's own snapshot writes — is refused here, before the worker is
asked to do anything.

"Still running" is a claim about a *process*, not about a stored string. A
session whose process died hard keeps saying ``"running"`` for ever, and used to
be refused a restore for ever with it; :func:`rotaris.views.main_window
.MainWindow._session_is_running` now checks liveness, and the refusals here name
which of the two cases applies — a live run, or a probe that could not answer.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from PySide6.QtCore import QObject, QThread, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import (
    CheckpointList,
    CheckpointPreview,
    CheckpointRestoreOutcome,
    CheckpointRow,
)

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

#: Shown wherever a restore is offered for a session that is still running.
RUNNING_SESSION_REASON = (
    "This session is still running. Restoring would race the run's own writes, "
    "so wait for it to finish or pause it first."
)

#: Shown when the probe itself failed, so nobody can say whether a run is live.
#: Deliberately distinct from :data:`RUNNING_SESSION_REASON`: "it is running" and
#: "we could not find out" send the user to two different places.
UNCONFIRMED_SESSION_REASON = (
    "Rotaris could not confirm whether this session is still running, and will "
    "not risk a restore racing a live run. Try again in a moment."
)


@traces(SWR.SWR_2437, SWR.SWR_2817)
class CheckpointBridge(QObject):
    """Serialises one checkpoint operation at a time onto a worker thread.

    Args:
        workspace: The base workspace whose sessions may be rolled back.
        session_is_running: Asked before every restore and before every listing.
            Injected rather than read off a run bridge so the refusal has one
            home and one test, and so a host with several run handles can answer
            for all of them.
        parent: Qt parent; the thread is joined in :meth:`shutdown`.
    """

    #: The listing for a session (SWR-2437 columns), after a load.
    listed = Signal(object)
    #: What a restore would do, before the user is asked to confirm it.
    previewed = Signal(object)
    #: The outcome of an attempted rollback, refused or applied.
    restored = Signal(object)
    #: An unexpected failure that is not a refusal — a broken session store.
    failed = Signal(str)
    #: A ``rotaris_core.session.recovery.StaleSession`` that was corrected, or
    #: ``None`` when there was nothing to correct.
    repaired = Signal(object)

    _load_requested = Signal(str)
    _preview_requested = Signal(str, int)
    _restore_requested = Signal(str, int, bool)
    _repair_requested = Signal(str)

    def __init__(
        self,
        workspace: Path,
        *,
        session_is_running: Callable[[str], bool] | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self.workspace = workspace
        self._session_is_running = session_is_running or (lambda _session_id: False)
        self._thread: QThread | None = None
        self._worker: _CheckpointWorker | None = None
        self._busy = False
        self._shutting_down = False

    @property
    def busy(self) -> bool:
        """True while a Git operation is in flight on the worker thread."""
        return self._busy

    def restore_blocked_reason(self, session_id: str) -> str:
        """Why a restore of *session_id* is refused, or ``""`` when it is allowed.

        One decision site for both refusals, so the reason a user reads always
        matches the reason the restore was withheld.
        """
        try:
            running = bool(self._session_is_running(session_id))
        except Exception:  # noqa: BLE001 - a broken probe must not enable a restore.
            return UNCONFIRMED_SESSION_REASON
        return RUNNING_SESSION_REASON if running else ""

    def session_is_running(self, session_id: str) -> bool:
        """Whether a restore of *session_id* must be refused."""
        return bool(self.restore_blocked_reason(session_id))

    def repair_stale_session(self, session_id: str) -> bool:
        """Ask the worker to clear a status left behind by a dead process.

        Runs off the Qt event loop like every other call here: the repair reads
        and rewrites the session snapshot, which is Git-repository-sized work on
        a long session. ``False`` when the bridge is busy or shutting down; the
        caller's existing retry picks it up.
        """
        if not session_id or self._busy or self._shutting_down:
            return False
        self._start()
        self._busy = True
        self._repair_requested.emit(session_id)
        return True

    def load(self, session_id: str) -> bool:
        """Ask for *session_id*'s checkpoint listing. ``False`` when not started."""
        if not session_id or self._busy or self._shutting_down:
            return False
        self._start()
        self._busy = True
        self._load_requested.emit(session_id)
        return True

    def preview(self, session_id: str, sequence: int) -> bool:
        """Ask what restoring *sequence* would change. ``False`` when not started."""
        if not session_id or self._busy or self._shutting_down:
            return False
        blocked = self.restore_blocked_reason(session_id)
        if blocked:
            self.previewed.emit(
                CheckpointPreview(
                    session_id=session_id,
                    sequence=sequence,
                    blocked_reason=blocked,
                ),
            )
            return True
        self._start()
        self._busy = True
        self._preview_requested.emit(session_id, sequence)
        return True

    def restore(self, session_id: str, sequence: int, *, force: bool = False) -> bool:
        """Roll *session_id*'s tree back to *sequence*. ``False`` when not started.

        A running session is refused here rather than on the worker: taking the
        safety checkpoint re-reads and flushes the session snapshot that the run
        is also writing, so the refusal has to happen before any Git work.
        """
        if not session_id or self._busy or self._shutting_down:
            return False
        blocked = self.restore_blocked_reason(session_id)
        if blocked:
            self.restored.emit(
                CheckpointRestoreOutcome(
                    session_id=session_id,
                    sequence=sequence,
                    blocked_reason=blocked,
                ),
            )
            return True
        self._start()
        self._busy = True
        self._restore_requested.emit(session_id, sequence, force)
        return True

    def shutdown(self) -> None:
        """Join the worker thread. Safe to call more than once."""
        self._shutting_down = True
        thread = self._thread
        self._thread = None
        self._worker = None
        self._busy = False
        if thread is None:
            return
        thread.quit()
        # No cap: destroying a QThread whose worker is still inside a Git call
        # aborts the process, and the longest call here is bounded by Git.
        thread.wait()
        thread.deleteLater()

    # -- internals ---------------------------------------------------------

    def _start(self) -> None:
        if self._thread is not None:
            return
        thread = QThread(self)
        worker = _CheckpointWorker(self.workspace)
        worker.moveToThread(thread)
        self._load_requested.connect(worker.load)
        self._preview_requested.connect(worker.preview)
        self._restore_requested.connect(worker.restore)
        self._repair_requested.connect(worker.repair)
        worker.listed.connect(self._on_listed)
        worker.previewed.connect(self._on_previewed)
        worker.restored.connect(self._on_restored)
        worker.repaired.connect(self._on_repaired)
        worker.failed.connect(self._on_failed)
        thread.finished.connect(worker.deleteLater)
        self._thread = thread
        self._worker = worker
        thread.start()

    @Slot(object)
    def _on_listed(self, payload: object) -> None:
        self._busy = False
        if self._shutting_down:
            return
        listing = payload if isinstance(payload, CheckpointList) else CheckpointList()
        blocked = self.restore_blocked_reason(listing.session_id) if listing.available else ""
        if blocked:
            listing = CheckpointList(
                session_id=listing.session_id,
                rows=listing.rows,
                available=False,
                unavailable_reason=blocked,
                tree_root=listing.tree_root,
            )
        self.listed.emit(listing)

    @Slot(object)
    def _on_previewed(self, payload: object) -> None:
        self._busy = False
        if not self._shutting_down:
            self.previewed.emit(payload)

    @Slot(object)
    def _on_restored(self, payload: object) -> None:
        self._busy = False
        if not self._shutting_down:
            self.restored.emit(payload)

    @Slot(object)
    def _on_repaired(self, payload: object) -> None:
        self._busy = False
        if not self._shutting_down:
            self.repaired.emit(payload)

    @Slot(str)
    def _on_failed(self, message: str) -> None:
        self._busy = False
        if not self._shutting_down:
            self.failed.emit(message)


@traces(SWR.SWR_2437)
class _CheckpointWorker(QObject):
    """Runs the restorer's Git work off the Qt event loop."""

    listed = Signal(object)
    previewed = Signal(object)
    restored = Signal(object)
    repaired = Signal(object)
    failed = Signal(str)

    def __init__(self, workspace: Path) -> None:
        super().__init__()
        self._workspace = workspace

    @Slot(str)
    def repair(self, session_id: str) -> None:
        """Clear a status left behind by a process that never came back."""
        from rotaris_core.session.manager import SessionManager
        from rotaris_core.session.recovery import repair_stale_session

        try:
            outcome = repair_stale_session(SessionManager(self._workspace), session_id)
        except Exception as exc:  # noqa: BLE001 - reported, never raised into Qt.
            self.failed.emit(str(exc))
            self.repaired.emit(None)
            return
        self.repaired.emit(outcome)

    @Slot(str)
    def load(self, session_id: str) -> None:
        try:
            restorer = self._restorer(session_id)
            rows = tuple(_row(entry) for entry in restorer.list_checkpoints())
            available = restorer.available
            tree_root = str(restorer.tree_root)
        except Exception as exc:  # noqa: BLE001 - reported, never raised into Qt.
            self.failed.emit(str(exc))
            self.listed.emit(CheckpointList(session_id=session_id))
            return
        self.listed.emit(
            CheckpointList(
                session_id=session_id,
                rows=rows,
                available=available,
                tree_root=tree_root,
                unavailable_reason=(
                    ""
                    if available
                    else (
                        "This session has no Git working tree Rotaris can roll back, "
                        "so its checkpoints cannot be restored."
                    )
                ),
            ),
        )

    @Slot(str, int)
    def preview(self, session_id: str, sequence: int) -> None:
        from rotaris_core.session.checkpoint_restore import format_preview_lines

        try:
            preview = self._restorer(session_id).preview(sequence)
        except Exception as exc:  # noqa: BLE001 - reported, never raised into Qt.
            self.failed.emit(str(exc))
            return
        if preview is None:
            self.previewed.emit(
                CheckpointPreview(
                    session_id=session_id,
                    sequence=sequence,
                    blocked_reason=(
                        f"Checkpoint {sequence} is no longer recorded for this session."
                    ),
                ),
            )
            return
        self.previewed.emit(
            CheckpointPreview(
                session_id=session_id,
                sequence=sequence,
                # Straight from the engine: these lines already say "delete" for
                # a path the checkpoint does not have and "recreate" for one it
                # does. Re-deriving the verb from the status letter is how a
                # dialog ends up promising the opposite of what happens.
                lines=tuple(format_preview_lines(preview)),
                changed_count=len(preview.entries),
                dirty_paths=tuple(preview.dirty_paths),
                blocked_reason=preview.blocked_reason,
            ),
        )

    @Slot(str, int, bool)
    def restore(self, session_id: str, sequence: int, force: bool) -> None:
        try:
            result = self._restorer(session_id).restore(sequence, force=force)
        except Exception as exc:  # noqa: BLE001 - reported, never raised into Qt.
            self.failed.emit(str(exc))
            return
        safety = result.safety_checkpoint
        self.restored.emit(
            CheckpointRestoreOutcome(
                session_id=session_id,
                sequence=sequence,
                restored=result.restored,
                changed_count=len(result.changed_paths),
                safety_sequence=safety.sequence if safety is not None else 0,
                blocked_reason=result.blocked_reason,
            ),
        )

    def _restorer(self, session_id: str) -> Any:
        from rotaris_core.session.checkpoint_restore import CheckpointRestorer
        from rotaris_core.session.manager import SessionManager

        return CheckpointRestorer(
            session_manager=SessionManager(self._workspace),
            session_id=session_id,
        )


def _row(entry: Any) -> CheckpointRow:
    created = entry.created_at
    return CheckpointRow(
        sequence=int(entry.sequence),
        created_label=created.astimezone().strftime("%Y-%m-%d %H:%M:%S"),
        iteration=int(entry.iteration),
        file_count=len(entry.files),
        kind=str(entry.kind),
    )
