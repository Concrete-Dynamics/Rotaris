"""The Python SDK's implementation: a client, a run handle, and the bridges.

Everything a caller touches is re-exported from :mod:`rotaris_core.sdk`; this
module is where it is built.  Three seams are worth reading before changing
anything here.

**The run itself is not reimplemented.**  :meth:`RotarisClient.start` builds a
:class:`~rotaris_core.run_host.RunRequest` and awaits
:func:`~rotaris_core.run_host.execute_run` — the same call the ``rotaris run``
CLI makes.  That is the whole point of SWR-1830: an SDK session is an ordinary
session, resumable and inspectable with a plain ``SessionManager``, because
nothing about its lifecycle is special.

**The event bus is synchronous and thread-agnostic.**  An
:data:`~rotaris_core.events.bus.EventSink` is called on whichever thread emitted
the event — child-spawn hooks fire from ``asyncio.to_thread`` workers — and it
must return quickly and never raise.  :meth:`RunHandle.events` therefore does
not consume the sink directly: the sink hands the event to the client's loop
with ``call_soon_threadsafe`` and returns, and the async iterator reads from a
bounded queue on the loop side.  A consumer that stops reading fills that queue,
and further events are **dropped and counted** (:attr:`RunHandle.dropped_events`)
rather than blocking an agent thread mid-tool-call.

**Cancellation goes through the cancel event, not through task cancellation.**
``handle._task.cancel()`` would unwind ``execute_run`` from the outside and lose
its terminal :class:`~rotaris_core.run_result.RunResult`; setting the event lets
the lifecycle stop the loop, release the session lock and *return* the
interrupted result, which is why ``await handle.result()`` after a cancel gives
you a result instead of raising ``CancelledError``.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Final

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.run_host import RunRequest, execute_run

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable, Mapping
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.events.schema import RotarisEvent
    from rotaris_core.run_result import RunResult
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState

_log = logging.getLogger(__name__)

#: Version of the *public SDK surface*, bumped only when a name in
#: :mod:`rotaris_core.sdk` changes meaning, changes signature or disappears.
#: Deliberately separate from the package version and from
#: ``EVENT_SCHEMA_VERSION``: a release can ship new behaviour, and the event
#: stream can gain a field, without either breaking a caller's code.
SDK_API_VERSION: Final = "1"

#: How many events may wait for a consumer before the oldest run-side producer
#: starts dropping them.  Sized for a consumer that pauses briefly (a slow
#: ``print``, a network write) rather than one that walked away: a run emits a
#: handful of events per iteration, so this is many iterations of slack.
EVENT_QUEUE_MAXSIZE: Final = 1024


@traces(SWR.SWR_1830)
@dataclass(frozen=True, slots=True)
class RunOptions:
    """Everything optional about one SDK run.

    Attributes:
        max_iterations: Stop after this many Ralph iterations.  ``None`` uses
            the workspace configuration.
        isolate: Run in a fresh git worktree created for the session.
        worktree_path: Run in an existing worktree at this path.  Mutually
            exclusive with ``isolate``.
        worktree_branch: Branch for the worktree ``isolate`` creates.
        session_id: Resume this session instead of creating one.  The worktree
            options are refused together with it — a resumed session already
            carries the binding it was created with.
        approval_resolver: Answers ``ask`` permission prompts (SWR-2504).  It is
            called on the *agent's* thread with a redacted, JSON-safe payload
            and must return one of ``"approve_once"``, ``"approve_session"`` or
            ``"deny"``; anything else — including a raised exception — is a
            deny, because there is no path from a broken resolver to an allow.
            Without one the run takes the headless policy, which denies.
    """

    max_iterations: int | None = None
    isolate: bool = False
    worktree_path: Path | None = None
    worktree_branch: str | None = None
    session_id: str | None = None
    approval_resolver: Callable[[Mapping[str, Any]], str] | None = None


@traces(SWR.SWR_1830, SWR.SWR_1829, SWR.SWR_2504)
class RunHandle:
    """A run in flight: its events, its result, and the way to stop it.

    Never constructed by callers — :meth:`RotarisClient.start` returns one.  The
    handle is bound to the event loop it was created on, because that is the
    loop foreign agent threads hand their events to.
    """

    def __init__(
        self,
        request: RunRequest,
        session_manager: SessionManager,
        *,
        approval_resolver: Callable[[Mapping[str, Any]], str] | None = None,
    ) -> None:
        self._request = request
        self._session_manager = session_manager
        self._approval_resolver = approval_resolver
        self._loop = asyncio.get_running_loop()
        self._queue: asyncio.Queue[RotarisEvent] = asyncio.Queue(maxsize=EVENT_QUEUE_MAXSIZE)
        self._stream_closed = asyncio.Event()
        self._session_known = asyncio.Event()
        self._cancel_event = asyncio.Event()
        self._session_id: str = request.session_id or ""
        self._dropped = 0
        self._task: asyncio.Task[RunResult] | None = None

    # -- lifecycle --------------------------------------------------------

    async def _start(self) -> None:
        """Launch the run and return as soon as its session id is knowable.

        A caller holding a handle expects ``handle.session_id`` to name
        something, so ``start()`` does not return on the bare task creation: it
        waits for the ``session.start`` event, or for the run to fail before
        there was ever a session to name.
        """
        self._task = asyncio.ensure_future(self._run())
        known = asyncio.ensure_future(self._session_known.wait())
        try:
            await asyncio.wait({self._task, known}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            known.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await known

    async def _run(self) -> RunResult:
        try:
            return await execute_run(
                self._request,
                self._session_manager,
                event_sink=self._sink,
                cancel_event=self._cancel_event,
            )
        finally:
            # In a ``finally`` so an exception out of the lifecycle still ends
            # the iterator; a consumer blocked forever on ``events()`` is a
            # worse failure than the one that caused it.
            self._stream_closed.set()
            self._session_known.set()

    @property
    def session_id(self) -> str:
        """The run's session id, or ``""`` if it failed before getting one."""
        return self._session_id

    @property
    def done(self) -> bool:
        """Whether the run has finished, however it ended."""
        return self._task is not None and self._task.done()

    @property
    def dropped_events(self) -> int:
        """Events discarded because :meth:`events` was not being consumed.

        Always ``0`` for a consumer that keeps up.  A non-zero value means the
        *stream* is incomplete — :meth:`result` is unaffected, since the
        terminal result is returned rather than read off the stream.
        """
        return self._dropped

    async def result(self) -> RunResult:
        """Await the run's terminal result.

        Returns the same value every time, including after :meth:`cancel` — a
        cancelled run reports :attr:`~rotaris_core.run_result.RunStatus.INTERRUPTED`
        and exit code 130 rather than raising ``CancelledError``.

        Raises:
            RuntimeError: if the handle was never started (not reachable
                through the public API).
            Exception: whatever the session store raised, if the run could not
                be set up at all.  A failed *run* is a result, not an exception.
        """
        if self._task is None:  # pragma: no cover - defended, not reachable
            raise RuntimeError("This run handle was never started.")
        # Shielded: a caller who cancels their own `await` must not cancel the
        # run and orphan the session lock.
        return await asyncio.shield(self._task)

    async def cancel(self) -> None:
        """Stop the run and wait for it to unwind.

        Idempotent, and safe before the run has really started: a cancel that
        arrives first is honoured by skipping the loop entirely.  On return the
        run is over, its session lock released and its result available from
        :meth:`result`.
        """
        self._cancel_event.set()
        if self._task is None:  # pragma: no cover - defended, not reachable
            return
        with contextlib.suppress(Exception, asyncio.CancelledError):
            await asyncio.shield(self._task)

    def events(self) -> AsyncIterator[RotarisEvent]:
        """Iterate the run's SWR-1829 events, ending after the ``result`` event.

        The iterator terminates when the run does, whether it completed, failed
        or was cancelled.  Iterating twice, or from two consumers, splits the
        stream rather than duplicating it: this is one queue, not a broadcast.
        """
        return self._events()

    async def _events(self) -> AsyncIterator[RotarisEvent]:
        while True:
            event = await self._next_event()
            if event is None:
                return
            yield event

    async def _next_event(self) -> RotarisEvent | None:
        """The next queued event, or ``None`` once the run ended and drained."""
        while True:
            if not self._queue.empty():
                return self._queue.get_nowait()
            if self._stream_closed.is_set():
                return None
            getter = asyncio.ensure_future(self._queue.get())
            closed = asyncio.ensure_future(self._stream_closed.wait())
            try:
                done, _pending = await asyncio.wait(
                    {getter, closed},
                    return_when=asyncio.FIRST_COMPLETED,
                )
            finally:
                closed.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await closed
            if getter in done:
                return getter.result()
            # The run ended while we waited.  The getter may still have won a
            # race with the cancel, so its value is returned rather than
            # dropped; a cancelled ``Queue.get`` leaves any item in the queue,
            # so the next pass drains whatever arrived before the end.
            getter.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                return await getter

    # -- the bus side (foreign threads) -----------------------------------

    def _sink(self, event: RotarisEvent) -> None:
        """Receive one event from the bus.  Called from arbitrary threads.

        Two things happen here, in this order, and both matter.  The session id
        and the approval host are taken from ``session.start`` **inline**,
        because ``publish`` is synchronous and this call happens before the run
        builds its first agent — deferring it to the loop would race the first
        permission prompt.  Everything else is handed to the loop and this
        returns; an agent thread must never wait on a consumer.
        """
        try:
            if event.event == "session.start" and event.session_id:
                self._bind_session(event.session_id)
            self._offer(event)
        except Exception:  # noqa: BLE001 - a sink must never raise into the bus.
            _log.warning("Rotaris SDK event sink failed on %s.", event.event, exc_info=True)

    def _bind_session(self, session_id: str) -> None:
        self._session_id = session_id
        if self._approval_resolver is not None:
            self._register_approval_host(session_id)
        self._call_on_loop(self._session_known.set)

    @traces(SWR.SWR_2504)
    def _register_approval_host(self, session_id: str) -> None:
        """Make this run's ``ask`` decisions resolvable by the caller's resolver.

        The same registry the desktop app uses, for the same reason: agents are
        built in several spawn paths and look their host up by session id at
        dispatch time.  ``_run_task`` later calls ``ensure_approval_host``,
        which keeps this registration and only adds its abort hook.
        """
        from rotaris_core.permissions import ApprovalHost, register_approval_host

        register_approval_host(session_id, ApprovalHost(present=self._present_approval))

    def _present_approval(self, payload: dict[str, Any]) -> None:
        """Answer one approval prompt on the waiting agent's thread.

        Resolved inline rather than posted to the loop: the agent is blocked on
        the barrier for this request id, and the SDK's resolver is an ordinary
        synchronous callable, so there is nothing to wait for.  An exception
        propagates to ``BrokeredApprovalResolver``, which denies fail-safe.
        """
        from rotaris_core.permissions import ApprovalOption, resolve_approval_host

        resolver = self._approval_resolver
        host = resolve_approval_host(payload.get("session_id") or self._session_id)
        if resolver is None or host is None:  # pragma: no cover - defended
            return
        answer = resolver(payload)
        try:
            option = ApprovalOption(answer)
        except ValueError:
            _log.warning(
                "Approval resolver returned %r, which is not an approval option; denying.",
                answer,
            )
            option = ApprovalOption.DENY
        host.barrier.resolve(str(payload.get("request_id", "")), option)

    def _offer(self, event: RotarisEvent) -> None:
        """Hand *event* to the loop, dropping it if the loop is gone."""
        try:
            self._call_on_loop(self._enqueue, event)
        except RuntimeError:
            # The loop closed between the run ending and a straggling thread
            # publishing.  Nobody can consume this any more.
            self._dropped += 1

    def _call_on_loop(self, callback: Callable[..., None], *args: Any) -> None:
        if self._loop.is_closed():
            raise RuntimeError("The SDK client's event loop is closed.")
        self._loop.call_soon_threadsafe(callback, *args)

    def _enqueue(self, event: RotarisEvent) -> None:
        """Queue one event.  Runs on the loop, so ``put_nowait`` is race-free."""
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            self._dropped += 1
            if self._dropped == 1:
                _log.warning(
                    "The SDK event queue is full for session %s; events are being dropped. "
                    "Consume RunHandle.events() faster, or ignore it and use RunHandle.result().",
                    self._session_id,
                )


@traces(SWR.SWR_1830)
class RotarisClient:
    """Run Rotaris from Python: start a task, watch it, read its result.

    The client owns nothing expensive until it is used — the configuration and
    the session store are loaded on the first run — so constructing one is
    cheap enough to do per request in a service.

    Args:
        workspace: The workspace root.  Sessions live under
            ``<workspace>/.rotaris/sessions``, exactly where the CLI puts them.
        config: A ready :class:`~rotaris_core.config.schema.RotarisConfig`.
            Omit it to load the workspace's own configuration the way the CLI
            does.
    """

    def __init__(self, workspace: Path, *, config: RotarisConfig | None = None) -> None:
        self._workspace = workspace
        self._config = config
        self._session_manager: SessionManager | None = None
        self._handles: list[RunHandle] = []

    async def __aenter__(self) -> RotarisClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    @property
    def workspace(self) -> Path:
        """The workspace root this client runs in."""
        return self._workspace

    def _resolve_config(self) -> RotarisConfig:
        """Load the workspace configuration once, on first use.

        Imported here rather than at module scope: ``rotaris_core.config`` pulls
        in the agent SDK, which costs seconds, and importing
        ``rotaris_core.sdk`` must not.
        """
        if self._config is None:
            from rotaris_core.config.loader import load_config

            self._config = load_config(self._workspace)
        return self._config

    def _manager(self) -> SessionManager:
        if self._session_manager is None:
            from rotaris_core.session import SessionManager

            self._session_manager = SessionManager(self._workspace)
        return self._session_manager

    @traces(SWR.SWR_1830)
    async def start(self, task: str, *, options: RunOptions | None = None) -> RunHandle:
        """Start *task* and return a handle to it without waiting for the run.

        Returns:
            A :class:`RunHandle` whose :attr:`~RunHandle.session_id` is already
            known, unless the run was refused before a session existed (an
            impossible worktree flag combination), in which case it is ``""``
            and :meth:`RunHandle.result` reports the error.
        """
        resolved = options or RunOptions()
        request = RunRequest(
            task=task,
            config=self._resolve_config(),
            session_id=resolved.session_id,
            max_iterations=resolved.max_iterations,
            isolate=resolved.isolate,
            worktree_path=resolved.worktree_path,
            worktree_branch=resolved.worktree_branch,
        )
        handle = RunHandle(
            request,
            self._manager(),
            approval_resolver=resolved.approval_resolver,
        )
        self._handles.append(handle)
        await handle._start()  # noqa: SLF001 - the client owns the handle's start.
        return handle

    @traces(SWR.SWR_1830)
    async def run(self, task: str, *, options: RunOptions | None = None) -> RunResult:
        """Run *task* to completion and return its result.

        The one-liner form of :meth:`start` plus :meth:`RunHandle.result`.  A
        failed run is a returned result, not an exception: check
        :attr:`~rotaris_core.run_result.RunResult.status`.
        """
        handle = await self.start(task, options=options)
        return await handle.result()

    @traces(SWR.SWR_1830)
    def sessions(self) -> tuple[SessionState, ...]:
        """Every session in this workspace, newest first.

        Sessions the SDK created are ordinary sessions: they also show up in
        ``rotaris sessions`` and can be resumed through
        :attr:`RunOptions.session_id`.
        """
        manager = self._manager()
        return tuple(
            manager.load_session(summary["session_id"]) for summary in manager.list_sessions()
        )

    async def aclose(self) -> None:
        """Cancel anything still running and release the client's resources.

        Idempotent.  Leaving a run going after its client is gone would keep a
        session lock that nothing can release, so ``aclose`` waits for each
        outstanding run to unwind.
        """
        handles, self._handles = self._handles, []
        for handle in handles:
            if not handle.done:
                await handle.cancel()
        if self._session_manager is not None:
            self._session_manager.shutdown_mcp()
