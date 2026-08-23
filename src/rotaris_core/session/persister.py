"""Async-interface session persistence.

``SessionPersister`` is the single debounce layer in front of
``SessionPersistence.save_snapshot`` (which fans out to several atomic file
writes). Debounced writes run via ``asyncio.to_thread`` on a deep copy of
the state, so the event loop never blocks on file I/O and the writer never
sees a half-mutated live state. Saves for non-running execution statuses
(paused, background, completed, ...) flush synchronously and immediately —
status transitions must be durable before the caller continues.

Threading contract: ``request_save`` and ``flush`` are event-loop-thread
APIs (``request_save`` degrades to a synchronous write when no loop is
running); ``flush_sync`` may be called from any thread.

Write ordering: every save is stamped with a monotonically increasing
*generation* at the moment it is requested, and the commit that actually
touches disk refuses to run when a newer generation for that same session
already landed. Without that, a debounced ``"running"`` save — which is
written under ``asyncio.shield`` and therefore survives the timer
cancellation the terminal save performs — could complete *after* the
terminal ``"completed"`` save and leave a finished run durably recorded as
running. The generation makes the last *requested* state win rather than the
last write to finish, and a dropped write is logged rather than silently
discarded. See
``docs/bug/2026-08-09-session-persister-race-leaves-a-finished-run-recorded-as-running.md``.

Two consequences worth knowing before calling this class:

- ``flush_sync`` can return without writing. That happens only when a save
  requested *later* for the same session already reached disk, so the file
  holds a newer state than the one dropped — never a staler one — but a
  caller that reads the call as "my state is now on disk verbatim" is making
  an assumption this class does not owe it.
- A save for a non-running status blocks its calling thread — the event loop
  thread, on the usual ``request_save`` path — for as long as an in-flight
  off-loop write is still fanning out. Status transitions are rare next to
  debounced saves, and a terminal save that returns before the write it must
  outlive is precisely the bug above, so the stall is deliberate.

Callers that reach ``SessionManager.flush_session`` directly, rather than
through this class, bypass both the ordering guarantee and the commit lock —
``session/checkpoint_service.py`` is the known one. A host that uses the
persister for a session should route every save for that session through it.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import threading
import time
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState

_log = logging.getLogger(__name__)

#: Execution statuses that participate in debouncing. Anything else is a
#: status transition (paused/background/completed/...) and writes at once.
_DEBOUNCED_STATUSES = frozenset({"running", "idle"})


@traces(SWR.SWR_2130)
class SessionPersister:
    def __init__(self, manager: SessionManager, *, debounce_seconds: float = 10.0) -> None:
        self._manager = manager
        self._debounce_seconds = debounce_seconds
        self._write_lock = asyncio.Lock()
        # Guards the disk commit itself. A plain threading lock, not an
        # asyncio one, because ``flush_sync`` is a synchronous any-thread API
        # and cannot await: this is the only mutual exclusion the sync and the
        # off-loop write paths can share. Holding it never requires the event
        # loop to make progress (a commit is pure file I/O), so a ``flush_sync``
        # that blocks the loop thread waiting for it always gets it back.
        self._commit_lock = threading.Lock()
        self._generation_lock = threading.Lock()
        self._generation = 0
        # Per session, not per persister: one persister serves every session
        # of its manager, so a save for the session the user just switched to
        # must not make the previous session's parked save look stale.
        self._committed_generations: dict[str, int] = {}
        self._timer_task: asyncio.Task[None] | None = None
        self._pending_state: SessionState | None = None
        self._pending_generation = 0
        self._last_write_at: float = float("-inf")

    def request_save(self, state: SessionState) -> None:
        """Persist *state*, debounced during active runs.

        The first save after a quiet period writes immediately (off-loop);
        saves inside the debounce window are parked and written by a timer
        task when the window elapses — a parked save is never lost.
        """
        generation = self._next_generation()
        if state.execution_status not in _DEBOUNCED_STATUSES:
            self._cancel_timer()
            self._pending_state = None
            self._flush_sync(state, generation)
            return

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            self._flush_sync(state, generation)
            return

        self._pending_state = state
        self._pending_generation = generation
        if self._timer_task is None or self._timer_task.done():
            delay = max(
                0.0,
                self._debounce_seconds - (time.monotonic() - self._last_write_at),
            )
            self._timer_task = loop.create_task(self._delayed_write(delay))

    async def flush(self, state: SessionState) -> None:
        """Write *state* now, bypassing the debounce. Awaits completion."""
        self._cancel_timer()
        self._pending_state = None
        await self._write(state, self._next_generation())

    def flush_sync(self, state: SessionState) -> None:
        """Immediate synchronous write on the calling thread (shutdown-safe).

        Waits out any in-flight write from this persister, and does nothing at
        all if a save requested later for this session already landed.
        """
        self._flush_sync(state, self._next_generation())

    def _flush_sync(self, state: SessionState, generation: int) -> None:
        with self._commit_lock:
            if not self._claim(generation, state):
                return
            self._manager.flush_session(state)
        self._last_write_at = time.monotonic()

    async def _delayed_write(self, delay: float) -> None:
        # Loop: a request_save that lands while the shielded write below is
        # in flight parks a new pending state but sees this task as not done
        # and arms no new timer — so re-check pending after every write.
        while True:
            if delay > 0:
                await asyncio.sleep(delay)
            state = self._pending_state
            generation = self._pending_generation
            self._pending_state = None
            if state is None:
                return
            # Shield the write: a cancelled timer must not interrupt the
            # snapshot fan-out and leave a half-written split state behind.
            # The write carries the generation it was requested with, so a
            # terminal save issued while it is in flight still wins.
            await asyncio.shield(self._write(state, generation))
            if self._pending_state is None:
                return
            delay = max(
                0.0,
                self._debounce_seconds - (time.monotonic() - self._last_write_at),
            )

    async def _write(self, state: SessionState, generation: int) -> None:
        async with self._write_lock:
            state.updated_at = dt.datetime.now(dt.UTC)
            snapshot = state.model_copy(deep=True)
            try:
                await asyncio.to_thread(self._commit, snapshot, generation)
            except Exception:
                _log.exception("Failed to persist session %s", state.session_id)
            self._last_write_at = time.monotonic()

    def _commit(self, snapshot: SessionState, generation: int) -> None:
        """Write *snapshot* to disk unless a newer generation already landed."""
        with self._commit_lock:
            if not self._claim(generation, snapshot):
                return
            self._manager.persistence.save_snapshot(snapshot)

    def _claim(self, generation: int, state: SessionState) -> bool:
        """Reserve the right to write *generation*. Caller holds ``_commit_lock``."""
        committed = self._committed_generations.get(state.session_id, 0)
        if generation < committed:
            _log.warning(
                "Dropped a stale session write for %s: generation %d lost to %d "
                "(state %r would have overwritten a newer save).",
                state.session_id,
                generation,
                committed,
                state.execution_status,
            )
            return False
        self._committed_generations[state.session_id] = generation
        return True

    def _next_generation(self) -> int:
        with self._generation_lock:
            self._generation += 1
            return self._generation

    def _cancel_timer(self) -> None:
        if self._timer_task is not None and not self._timer_task.done():
            self._timer_task.cancel()
        self._timer_task = None
