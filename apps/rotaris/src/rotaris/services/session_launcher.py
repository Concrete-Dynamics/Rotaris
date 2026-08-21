"""Starting a requirement unit's run as a session the user can take part in (SWR-3624).

The flow runs on a worker thread and the run coordinator is a ``QObject`` that
must be touched on Qt's. This module is the hop between them, and it is
deliberately the only one: a launcher that reached into ``RunCoordinator`` from
the flow's thread would create ``QObject``s, write the store and emit signals
from the wrong thread, which is the class of bug that shows up once a week in
somebody else's session.

The hop uses the idiom this application already uses in the other direction —
``RequirementsController._flow_ended`` is a private ``Signal(object)`` emitted
from the flow's worker and delivered on the controller's thread — so there is
one marshalling pattern here rather than two.

**Why it blocks.** :class:`~rotaris_core.requirements.execution.run_seam.RunHost`
is synchronous by design; its own docstring says a host that blocks is trivially
wrapped in a thread while one that hides an event loop is not. The flow is
already on a worker of its own, so blocking it costs nothing and keeps the seam's
contract exactly as the engine wrote it.

**What it buys.** The run holds a live ``RunBridge`` handle from the moment it
starts, which is the whole difference: the workspace's stop, pause and steer
controls act on it, ``shutdown_all`` reaches it when the application closes, and
an approval or a question it raises has an interactive host to reach — which is
what makes ``permissions.modes.resolve_effective_mode`` treat it as interactive
rather than downgrading it to deny-everything.
"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, Signal
from rotaris_core.reqtocode import SWR, traces

from rotaris.services.requirements_actions import SessionRunResult

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris.services.requirements_actions import SessionLaunch
    from rotaris.services.run_coordinator import RunCoordinator

_log = logging.getLogger(__name__)

__all__ = ["CoordinatorSessionLauncher"]


class _PendingLaunch:
    """One launch crossing from the flow's thread to Qt's, and the answer back."""

    __slots__ = ("launch", "session_id", "started")

    def __init__(self, launch: SessionLaunch) -> None:
        self.launch = launch
        self.session_id = ""
        self.started = threading.Event()


class _Waiter:
    """One flow worker parked on the end of the session it started."""

    __slots__ = ("ended", "finished")

    def __init__(self) -> None:
        self.finished = threading.Event()
        self.ended: SessionRunResult | None = None


@traces(SWR.SWR_3624, SWR.SWR_3612)
class CoordinatorSessionLauncher(QObject):
    """Fills the ``SessionLauncher`` port with the desktop's own run coordinator."""

    #: Internal: hops a launch from the flow's worker onto this object's thread.
    #: Never connected to from outside — the port is the public surface.
    _launch_requested = Signal(object)

    def __init__(
        self,
        coordinator: RunCoordinator,
        workspace: Path,
        *,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._coordinator = coordinator
        self._workspace = workspace
        self._waiters: dict[str, _Waiter] = {}
        self._lock = threading.Lock()
        self._launch_requested.connect(self._start_on_ui_thread)
        coordinator.session_run_finished.connect(self._on_session_finished)
        coordinator.session_run_failed.connect(self._on_session_failed)

    # ── the port ──────────────────────────────────────────────────────────

    @traces(SWR.SWR_3624)
    def launch(self, launch: SessionLaunch) -> str:
        """Start *launch* as a coordinator session and return its id.

        Called on the flow's worker thread. Returns as soon as the session has an
        id — before it has done any work — so the caller can record it while the
        run is still going (SWR-3612).

        ``""`` when the coordinator refused to start one; the caller reports that
        rather than waiting for a session that does not exist.
        """
        pending = _PendingLaunch(launch)
        self._launch_requested.emit(pending)
        pending.started.wait()
        return pending.session_id

    @traces(SWR.SWR_3624)
    def wait(self, session_id: str) -> SessionRunResult:
        """Block the calling thread until *session_id*'s run ends.

        The waiter is registered when the session is created, on Qt's thread and
        before that thread returns to its event loop, so a run that finishes
        immediately cannot end before anyone is listening for it.
        """
        with self._lock:
            waiter = self._waiters.get(session_id)
        if waiter is None:
            # Nothing registered it: either the launch failed or this is a
            # session somebody else started. Neither is worth blocking forever.
            _log.warning("Nothing is waiting for session %s; reporting it ended.", session_id)
            return SessionRunResult(
                session_id=session_id, error="the session was not launched here"
            )
        waiter.finished.wait()
        with self._lock:
            self._waiters.pop(session_id, None)
        return waiter.ended or SessionRunResult(
            session_id=session_id,
            error="the session ended without saying how",
        )

    # ── Qt's thread ───────────────────────────────────────────────────────

    @traces(SWR.SWR_3624, SWR.SWR_3405)
    def _start_on_ui_thread(self, pending: object) -> None:
        """Create the session, over the tree the seam already provisioned.

        ``create=False`` with an explicit path is what makes this an *adoption*:
        the flow's isolation provider cut the worktree and the run reports on it,
        so a session that provisioned a second tree would leave the unit's work
        in one and the measurement in the other (SWR-3405).

        That flag is not decoration — ``RunBridge`` branches on it directly and
        calls
        :meth:`~rotaris_core.session.worktrees.GitWorktreeService.attach_existing`,
        which validates the path belongs to this repository and binds to it with
        ``created_by_session=False``, so the session never removes a tree the
        flow owns. The path is required on that branch; the *branch* is not read
        from this request at all, because ``attach_existing`` takes the tree's
        own current branch, which is the more trustworthy of the two. It is still
        passed, so the request says what the caller believed and a mismatch is
        visible rather than silent.

        The session is not focused. A release is started from the board, often
        several at once, and a run that stole the workspace's focus would move
        the user's screen out from under them — the card says where the work is,
        and the user decides when to go there (SWR-3625).
        """
        from pathlib import Path

        from rotaris_core.session.worktrees import WorktreeLaunchRequest

        from rotaris.services.requirements_actions import board_run_config

        assert isinstance(pending, _PendingLaunch)  # noqa: S101 — our own signal, our own payload
        launch = pending.launch
        try:
            session_id = self._coordinator.launch_new(
                launch.prompt,
                isolation=WorktreeLaunchRequest(
                    branch=launch.branch or None,
                    path=Path(launch.tree),
                    create=False,
                ),
                run_config=board_run_config(self._workspace, Path(launch.tree)),
                requirement_id=launch.req_id,
                unit_id=launch.unit_id,
                focus=False,
            )
        except Exception:  # noqa: BLE001 — a refused launch is one sentence, not a crash.
            _log.warning("Could not start a session for %s.", launch.req_id, exc_info=True)
            session_id = ""
        if session_id:
            with self._lock:
                self._waiters[session_id] = _Waiter()
        pending.session_id = session_id
        pending.started.set()

    def _on_session_finished(self, session_id: str, status: str) -> None:
        self._settle(SessionRunResult(session_id=session_id, status=status))

    def _on_session_failed(self, session_id: str, message: str) -> None:
        self._settle(
            SessionRunResult(
                session_id=session_id,
                status="failed",
                error=message or "the run failed without a stated reason",
            ),
        )

    def _settle(self, ended: SessionRunResult) -> None:
        with self._lock:
            waiter = self._waiters.get(ended.session_id)
        if waiter is None or waiter.finished.is_set():
            return
        waiter.ended = ended
        waiter.finished.set()
