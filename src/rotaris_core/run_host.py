"""Host-neutral run entry point — one lifecycle, every host (SWR-1830).

Before this module the run lifecycle — validate the worktree flags, create or
resume the session, take the lock, bind the worktree, register the event sink,
publish ``session.start``/``session.end``, build the terminal
:class:`~rotaris_core.run_result.RunResult`, release everything on every exit
path — lived inside the synchronous, ``typer``-coupled
``rotaris_core.cli.background.run_background``.  A second host could only reach
it by forking it, and a forked lifecycle is exactly the drift SWR-1830 forbids
("no forked behavior"): two copies of "which session am I, and who holds its
lock" disagree the moment one of them is fixed.

:func:`execute_run` is that lifecycle, with the two host-specific parts lifted
out:

* **It returns instead of exiting.**  ``run_background`` raised ``typer.Exit``;
  a library must hand its caller a value.  Even a validation failure comes back
  as a :class:`RunResult` with :attr:`RunStatus.ERROR` and a populated ``error``
  — the caller decides whether that is an exception, an exit code, or a JSON
  document.
* **It prints nothing.**  Human-readable output belongs to the host; the
  machine-readable channel is the ``event_sink``, which the bus feeds — terminal
  ``result`` event included (SWR-1832).

Every run also persists what it emits.  The sink registered on the bus is the
event store's tee (SWR-2901): it appends each event to the session's
``evidence/events.jsonl`` and forwards to the host's sink, so a run without a
stream still leaves a history and a run with one leaves the *same* history its
consumer saw.

Cancellation is a plain :class:`asyncio.Event` rather than a signal handler,
because ``signal.signal`` only works on the main thread of the main
interpreter, and an embedding application's SIGINT handler is not ours to take.
The CLI keeps its ``DoubleCtrlCHandler`` and sets the event from it, so Ctrl-C
still ends a run the way it always did: request a graceful stop, and if the
loop does not honour it within :data:`CANCEL_GRACE_SECONDS`, cancel it.

**``_run_task`` deliberately stays in ``rotaris_core.cli.background``.**  It is
the agent-runtime wiring, not the lifecycle, and three consumers already bind
to it at that path (the Rotaris desktop run bridge, its worktree integration,
and the headless stream tests, which install their fake run by patching that
module attribute).  It is therefore imported lazily, at call time, so those
seams keep working; moving it is a refactor with a blast radius outside this
module.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass
from time import monotonic
from typing import TYPE_CHECKING, Any

from rotaris_core.events.bus import discard_event_sink, publish, register_event_sink
from rotaris_core.events.schema import ResultEvent, SessionEndEvent, SessionStartEvent
from rotaris_core.eventstore.sink import attach_session_store, detach_session_store
from rotaris_core.hooks.registry import discard_hook_runner, register_hook_runner
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.run_result import RunResult, RunStatus, build_run_result
from rotaris_core.session.recovery import settle_orphaned_children

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine, Mapping
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.events.bus import EventSink
    from rotaris_core.hooks.runner import HookRunner
    from rotaris_core.ralph.iteration_observer import RalphIterationObserver
    from rotaris_core.ralph.state import RalphProgressFile
    from rotaris_core.session.diagnostics import SessionDiagnostics
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState

_log = logging.getLogger(__name__)

#: How long a cancelled run may keep going after the graceful stop request
#: before it is cancelled outright.  The Ralph loop checks its stop flag at
#: every iteration boundary and cancels its own in-flight task, so the grace
#: period is a backstop for a loop that cannot reach either, not the norm.
CANCEL_GRACE_SECONDS = 30.0

#: The diagnostics-timeline actor for a run.  Unchanged from when this code
#: lived in the background runner: it names the *timeline row*, and rewriting
#: it would make one session's history disagree with the next.
_TIMELINE_ACTOR = "background"


@traces(SWR.SWR_1830)
@dataclass(frozen=True, slots=True)
class RunRequest:
    """Everything a host must decide before a run can start.

    ``session_id`` set means "resume that session"; the three worktree fields
    are therefore refused together with it, because a resumed session already
    carries the worktree binding it was created with.
    """

    task: str
    config: RotarisConfig
    session_id: str | None = None
    max_iterations: int | None = None
    isolate: bool = False
    worktree_path: Path | None = None
    worktree_branch: str | None = None
    # Set by requirement execution so the session it creates can say what it is
    # for (SWR-3612).  Ignored when resuming, because a resumed session already
    # carries the attribution it was created with.
    requirement_id: str = ""
    unit_id: str = ""
    #: Name a *new* session before it exists, so a host can show the run in its
    #: own lists before the worker reports back. Ignored when resuming.
    new_session_id: str | None = None
    #: Which delegation strategy the run's orchestrator uses. ``None`` leaves
    #: the loop's own default in place.
    delegation_strategy: str | None = None


#: Prefix every "the run never started" diagnostic carries.  It is part of the
#: message rather than added by the host because that exact string is what the
#: headless CLI prints *and* what :attr:`RunResult.error` reports, and the two
#: were identical before the lifecycle moved here.  It doubles as the marker
#: :func:`failed_before_start` reads; a runtime failure's message comes from
#: ``format_llm_runtime_error``, which prefixes nothing.
PRE_RUN_ERROR_PREFIX = "Error: "


@traces(SWR.SWR_2408, SWR.SWR_2409)
def validate_run_request(request: RunRequest) -> str | None:
    """Return the diagnostic for an impossible flag combination, or ``None``."""
    if request.isolate and request.worktree_path is not None:
        return f"{PRE_RUN_ERROR_PREFIX}choose either --isolate or --worktree, not both."
    if request.worktree_branch is not None and not request.isolate:
        return f"{PRE_RUN_ERROR_PREFIX}--worktree-branch requires --isolate."
    if request.session_id and (
        request.isolate or request.worktree_path is not None or request.worktree_branch is not None
    ):
        return f"{PRE_RUN_ERROR_PREFIX}worktree options apply only when creating a new session."
    return None


@traces(SWR.SWR_1830)
def failed_before_start(result: RunResult) -> bool:
    """Whether *result* describes a run that never started.

    A rejected flag combination, a session whose lock is held elsewhere and a
    worktree that could not be bound all end here: there is no locked session,
    no log file and nothing to resume — which is why the headless CLI announces
    no session id for them.
    """
    return result.status is RunStatus.ERROR and (result.error or "").startswith(
        PRE_RUN_ERROR_PREFIX,
    )


@traces(SWR.SWR_1828, SWR.SWR_1829, SWR.SWR_2507)
def _session_start_event(
    state: SessionState,
    config: RotarisConfig,
    task: str,
    max_iterations: int | None,
) -> SessionStartEvent:
    """Describe the run a consumer is about to watch.

    ``permission_mode`` is the *configured* mode: an unattended run may still be
    downgraded once the approval host is known (SWR-2508), which the permission
    decision events and the diagnostics timeline report in their own right.

    ``sandboxed`` is *not* the configured mode.  It is the same
    configured-and-available verdict ``SessionState.sandboxed`` records and the
    Ralph loop publishes (SWR-2507), because a consumer that saw ``true`` for a
    sandbox that could never start would draw exactly the wrong conclusion about
    how much it can trust the run.
    """
    from rotaris_core.sandbox.session import sandbox_status

    sandboxed, _backend = sandbox_status(config)
    return SessionStartEvent(
        session_id=state.session_id,
        task=task,
        workspace=str(config.workspace_root),
        persona=config.default_persona,
        permission_mode=config.runtime.permission_mode,
        sandboxed=sandboxed,
        max_iterations=max_iterations,
    )


@traces(SWR.SWR_1828, SWR.SWR_1829)
def _session_end_event(result: RunResult, duration_seconds: float | None) -> SessionEndEvent:
    """Mirror the terminal :class:`RunResult` onto the session lifecycle event.

    Same source as the ``result`` event on purpose — two derivations of "how did
    this run end" is exactly the defect SWR-1828 exists to remove.
    """
    return SessionEndEvent(
        session_id=result.session_id,
        status=result.status.value,
        stop_reason=result.stop_reason,
        iterations_completed=result.iterations_completed,
        duration_seconds=duration_seconds,
        tokens=result.tokens.model_dump(mode="json") if result.tokens is not None else None,
        cost=result.cost.model_dump(mode="json") if result.cost is not None else None,
    )


def _final_report_ref(state: SessionState) -> Mapping[str, Any] | None:
    """The run's last report artifact, in ``_artifact_refs`` shape, or ``None``."""
    artifacts = getattr(state, "report_artifacts", None) or []
    for artifact in reversed(list(artifacts)):
        if isinstance(artifact, dict):
            return artifact
    return None


@traces(SWR.SWR_1828, SWR.SWR_1829)
def _result_event(result: RunResult) -> ResultEvent:
    """The one terminal event, built from the one terminal :class:`RunResult`."""
    return ResultEvent(session_id=result.session_id, result=result.model_dump(mode="json"))


@traces(SWR.SWR_1828, SWR.SWR_1832)
def _emit_result_event(sink: EventSink, result: RunResult) -> None:
    """Write the terminal ``result`` event straight to *sink*.

    **Only for a run that never started.**  Those failure paths have no session
    the bus can address — a rejected flag combination never got an id, and the
    worktree path deletes the session it just made — so there is nothing
    registered to publish through and a synthesised id would put a fake id in
    the payload.

    A run that *did* start publishes its terminal event through the bus instead
    (SWR-1832), so a consumer attached there sees how the run ended.  The two
    are mutually exclusive by construction, which is what keeps the delivery
    count at exactly one: the bus sink of a started run is the host's own sink,
    wrapped, so writing to it directly *as well* would deliver the event twice.

    Never raises: a sink is a foreign callable, and the last event of a run is
    the worst possible place to discover that it throws.
    """
    try:
        sink(_result_event(result))
    except Exception:  # noqa: BLE001 - a broken consumer must not break the result.
        _log.warning(
            "Event sink failed on the terminal result event for session %s.",
            result.session_id,
            exc_info=True,
        )


def _failed_before_run(
    message: str,
    session_id: str,
    event_sink: EventSink | None,
) -> RunResult:
    """Terminal result for a failure that happened before the run could stream.

    The consumer is still owed exactly one ``result`` event, so it is written
    here rather than left to the caller — an empty stream followed by a non-zero
    exit code is unparseable progress for a machine consumer.
    """
    result = build_run_result(
        session_id=session_id,
        state=None,
        progress=None,
        error=message,
    )
    if event_sink is not None:
        _emit_result_event(event_sink, result)
    return result


@traces(SWR.SWR_1830)
class _CancellationBridge:
    """Adapts a cancel event onto the interrupt-handler protocol the loop expects.

    ``_run_task`` hands its ``interrupt_handler`` the two callbacks that stop a
    Ralph loop.  A host-neutral entry point cannot install a signal handler, so
    this object stands in its place: :meth:`request_stop` fires the same
    callback Ctrl-C fires today.

    The stop request is *sticky*.  A run can be cancelled before the loop
    exists (``start()`` then ``cancel()`` with nothing in between), and dropping
    that request would leave the run going until the grace period expires; so a
    stop that arrives first is replayed the moment the callbacks are wired.
    """

    def __init__(self) -> None:
        self._on_first: Callable[[], None] | None = None
        self._on_second: Callable[[], None] | None = None
        self._stop_requested = False

    def set_callbacks(
        self,
        *,
        on_first_interrupt: Callable[[], None] | None = None,
        on_second_interrupt: Callable[[], None] | None = None,
    ) -> None:
        self._on_first = on_first_interrupt
        self._on_second = on_second_interrupt
        if self._stop_requested:
            self._invoke(self._on_first)

    def request_stop(self) -> None:
        """Ask the run to stop gracefully.  Idempotent and never raises."""
        already_requested = self._stop_requested
        self._stop_requested = True
        if not already_requested:
            self._invoke(self._on_first)

    @staticmethod
    def _invoke(callback: Callable[[], None] | None) -> None:
        if callback is None:
            return
        try:
            callback()
        except Exception:  # noqa: BLE001 - a failed stop request still cancels below.
            _log.warning("Graceful stop request failed; the run will be cancelled.", exc_info=True)


async def _as_cancellation(
    coro: Coroutine[Any, Any, RalphProgressFile],
) -> RalphProgressFile:
    """Run *coro*, reporting a ``KeyboardInterrupt`` inside it as a cancellation.

    Not cosmetic.  ``Task.__step`` re-raises ``KeyboardInterrupt`` into the event
    loop after storing it on the task, so an interrupt raised *inside* the run
    escapes ``asyncio.run`` entirely and never reaches this module's handler —
    the lock would stay held and no ``result`` event would be written.  Catching
    it one frame lower, while it is still an ordinary exception travelling up an
    ``await``, keeps the run's own unwind in charge.

    This is the path the CLI's Ctrl-C handler used to take when the interrupt
    landed while the loop was running, so the outcome must stay identical:
    :attr:`RunStatus.INTERRUPTED`, exit code 130.
    """
    try:
        return await coro
    except KeyboardInterrupt as exc:
        raise asyncio.CancelledError("the run was interrupted") from exc


async def _await_run(
    coro: Coroutine[Any, Any, RalphProgressFile],
    cancel_event: asyncio.Event | None,
    bridge: _CancellationBridge,
) -> RalphProgressFile:
    """Await the run, turning a set *cancel_event* into a stop and then a cancel.

    Graceful first, because that is what Ctrl-C does today: the loop notices its
    stop flag, finishes what it can, and returns a progress file that says
    ``stopped by user``.  The hard cancel after :data:`CANCEL_GRACE_SECONDS` is
    the guarantee that ``cancel()`` terminates a run whose loop cannot reach a
    stop check at all.
    """
    run_task = asyncio.ensure_future(_as_cancellation(coro))
    waiter = asyncio.ensure_future(cancel_event.wait()) if cancel_event is not None else None
    try:
        if waiter is None:
            return await run_task
        done, _pending = await asyncio.wait(
            {run_task, waiter},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if run_task not in done:
            bridge.request_stop()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(asyncio.shield(run_task), CANCEL_GRACE_SECONDS)
            if not run_task.done():
                run_task.cancel()
        return await run_task
    except (asyncio.CancelledError, KeyboardInterrupt):
        # Our own caller went away: the run must not outlive us as an orphan
        # task holding the session lock.
        if not run_task.done():
            run_task.cancel()
            with contextlib.suppress(Exception, asyncio.CancelledError):
                await run_task
        raise
    finally:
        if waiter is not None and not waiter.done():
            waiter.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await waiter


def _bind_worktree(
    request: RunRequest,
    config: RotarisConfig,
    session_manager: SessionManager,
    state: SessionState,
) -> RotarisConfig:
    """Create or attach the session's worktree; return the config to run in."""
    from rotaris_core.session.worktrees import GitWorktreeService

    if not request.isolate and request.worktree_path is None:
        return config
    service = GitWorktreeService(
        session_manager.workspace_root,
        storage_subpath=config.worktree_storage_subpath,
    )
    # ``…_unique`` rather than ``create_for_session``: parallel launches
    # routinely collide on the requested branch, and resolving a free variant
    # is what keeps the second run from failing over a name.
    state.worktree = (
        service.create_for_session_unique(state.session_id, request.worktree_branch)
        if request.isolate
        else service.attach_existing(request.worktree_path)  # type: ignore[arg-type]
    )
    runtime_config = config_for_session_worktree(config, session_manager, state)
    state.config_snapshot = runtime_config.model_dump(mode="json")
    session_manager.flush_session(state)
    return runtime_config


@traces(SWR.SWR_2401, SWR.SWR_2402, SWR.SWR_2412)
def config_for_session_worktree(
    config: RotarisConfig,
    session_manager: SessionManager,
    state: SessionState,
) -> RotarisConfig:
    """Return an execution config rooted in a session's isolated worktree."""
    binding = state.worktree
    if binding is None:
        return config
    from pathlib import Path

    runtime = config.model_copy(deep=True)
    runtime.workspace_root = Path(binding.path)
    runtime.metadata_workspace_root = session_manager.workspace_root
    return runtime


@traces(SWR.SWR_2701, SWR.SWR_2703, SWR.SWR_2815, SWR.SWR_2816)
def _build_hook_runner(
    config: RotarisConfig,
    session_id: str,
    diagnostics: SessionDiagnostics,
    notice: Callable[[str], None] | None,
) -> HookRunner:
    """The hook runner this run may use — trust gate applied, notice surfaced.

    The hook set comes from :func:`~rotaris_core.hooks.trust.trusted_hooks_for_config`
    and **never** from ``resolve_hooks`` directly.  A workspace's
    ``.rotaris/agents.yaml`` travels inside a clone, so running its hooks without
    a recorded verdict would mean cloning a repository is enough to execute its
    author's shell commands (SWR-2701).  ``TrustedHookSet.allowed`` is the only
    set that has passed that gate.

    The verdict is looked up in the *base* workspace, not in the run's
    ``workspace_root``: in an isolated session the latter is a throwaway
    worktree, while the file the user reviewed and the verdict recorded against
    it live in the repository they opened.  The hook *processes*, on the other
    hand, are started in ``workspace_root``, because that is the tree the run is
    actually changing.

    When the gate held something back, the sentence goes both to the session's
    diagnostics (so it survives the run and reaches a non-interactive host) and,
    when the host offered one, to its text channel: a user whose hooks were
    silently skipped cannot tell a broken hook from a blocked one.
    """
    from rotaris_core.hooks.runner import HookRunner
    from rotaris_core.hooks.trust import TrustedHookSet, trusted_hooks_for_config

    trust_root = config.metadata_workspace_root or config.workspace_root
    try:
        trusted = trusted_hooks_for_config(config, trust_root)
    except Exception:  # noqa: BLE001 - a hook feature must never stop a run starting.
        _log.warning("Could not resolve this run's hooks; continuing without them.", exc_info=True)
        trusted = TrustedHookSet(allowed=(), blocked=(), restored=(), notice="")
    if trusted.notice:
        with contextlib.suppress(Exception):
            diagnostics.issue(
                kind="hook_trust",
                severity="warning",
                actor="hooks",
                message=trusted.notice,
                metadata={
                    "blocked": len(trusted.blocked),
                    "restored": len(trusted.restored),
                    "workspace": str(trust_root),
                },
            )
        if notice is not None:
            try:
                notice(trusted.notice)
            except Exception:  # noqa: BLE001 - a host's printer must not fail the run.
                _log.warning("Could not surface the hook trust notice.", exc_info=True)
    return HookRunner(
        session_id=session_id,
        workspace=config.workspace_root,
        hooks=trusted.allowed,
        diagnostics=diagnostics,
        # Hooks the SWR-2815 trust gate refused still belong on the wire
        # (SWR-1832): a consumer comparing a run against the repository's
        # configuration would otherwise see a configured hook simply never
        # mentioned, which is indistinguishable from one that ran and did
        # nothing.  The runner announces them on first use, not here, because
        # this factory runs before the session's event sink is registered.
        skipped=trusted.blocked,
    )


def persist_session_state(session_manager: SessionManager, state: SessionState) -> None:
    """Sync the metrics tracker into *state* and request a save."""
    from rotaris_core.session.metrics import sync_tracker_to_session

    sync_tracker_to_session(state)
    # Debounced + off-loop inside the run; synchronous immediate write when
    # no loop is running or on status changes.
    session_manager.persister.request_save(state)


@traces(
    SWR.SWR_1830,
    SWR.SWR_1828,
    SWR.SWR_1832,
    SWR.SWR_2408,
    SWR.SWR_2409,
    SWR.SWR_2901,
    SWR.SWR_3714,
)
async def execute_run(
    request: RunRequest,
    session_manager: SessionManager,
    *,
    event_sink: EventSink | None = None,
    iteration_observer: RalphIterationObserver | None = None,
    on_session_ready: Callable[[SessionState], RalphIterationObserver | None] | None = None,
    improvement_job_sink: Callable[[Any], None] | None = None,
    cancel_event: asyncio.Event | None = None,
    notice: Callable[[str], None] | None = None,
) -> RunResult:
    """Run *request* to completion and return its terminal result.

    Args:
        request: What to run, and in which session.
        session_manager: Owner of the session store and its locks.
        event_sink: Where the SWR-1829 events go.  ``None`` means "no stream" —
            the run still publishes and still persists its events (SWR-2901),
            they simply reach no consumer.  A sink receives the terminal
            ``result`` event as the last event of the run, once, through the bus
            like every other event (SWR-1832).
        iteration_observer: A host's *own* loop observer.  Passing one replaces
            the headless message-limit observer and enables the mid-run
            entry-model override, which is why the SDK does not pass one.
        on_session_ready: The host's binding point, called once the session
            exists, its lock is held, its worktree is bound and its sandbox
            verdict is recorded — and before the loop starts.  It is both the
            "this run is now identifiable" notification a host needs to show the
            run in its own lists, and the host's chance to build an observer
            that needs the :class:`SessionState`: whatever it returns is used as
            ``iteration_observer``.  Returning ``None`` leaves that slot alone.
        improvement_job_sink: Where the post-run improvement job goes.  Without
            one the job is awaited here, which is right for a host that has
            nothing else to do; a host with a UI thread takes the job instead
            and runs it where it will not block anything.
        cancel_event: Set it to stop the run.  The result is then
            :attr:`RunStatus.INTERRUPTED` (exit code 130), the same outcome
            Ctrl-C produces.
        notice: Where a human-readable advisory goes — today, the sentence
            explaining that this workspace's hooks were not run for want of a
            trust verdict (SWR-2701).  This module still prints nothing itself;
            a host that has a text channel passes it in, and a host that has
            none (the SDK) still gets the same sentence on the session's
            diagnostics.

    Returns:
        The terminal :class:`RunResult` — including for a rejected flag
        combination, an unavailable lock and a failed worktree bind, which come
        back as :attr:`RunStatus.ERROR` with the diagnostic in ``error``.

    Raises:
        Nothing for a failed *run*.  An exception from the session store itself
        (an unreadable snapshot, a full disk during ``create_session``) still
        propagates: at that point there is no session to report about.
    """
    invalid = validate_run_request(request)
    if invalid is not None:
        return _failed_before_run(invalid, "", event_sink)

    config = request.config
    if request.session_id:
        state = session_manager.load_session(request.session_id)
        if not session_manager.acquire_lock(request.session_id):
            return _failed_before_run(
                f"{PRE_RUN_ERROR_PREFIX}unable to acquire lock for session {request.session_id}",
                request.session_id,
                event_sink,
            )
        # The lock is ours and nothing of this run has started, so a record still
        # claiming to run belongs to a run that is gone (SWR-3714).
        settle_orphaned_children(state)
        config = config_for_session_worktree(config, session_manager, state)
    else:
        state = session_manager.create_session(
            config,
            session_id=request.new_session_id,
            requirement_id=request.requirement_id,
            unit_id=request.unit_id,
        )
        try:
            config = _bind_worktree(request, config, session_manager, state)
        except Exception as exc:
            session_manager.release_lock(state.session_id)
            session_manager.persistence.delete_session(state.session_id)
            return _failed_before_run(
                f"{PRE_RUN_ERROR_PREFIX}could not create or attach the requested worktree: {exc}",
                state.session_id,
                event_sink,
            )

    # SWR-2507, before anything else this run does: a session that asked for a
    # sandbox it cannot have fails at launch with the backend's own reason,
    # rather than reaching its first shell command and failing there — or, worse,
    # running it on the host. The verdict is recorded on the state in the same
    # breath, so the snapshot can never claim a mechanism that did not start.
    from rotaris_core.sandbox.session import sandbox_verdict

    try:
        state.sandboxed, state.sandbox_backend = sandbox_verdict(config)
    except Exception as exc:
        session_manager.release_lock(state.session_id)
        if not request.session_id:
            # Only a session this call created; a resumed one is the user's
            # history and must survive a failed launch.
            session_manager.persistence.delete_session(state.session_id)
        return _failed_before_run(
            f"{PRE_RUN_ERROR_PREFIX}{exc}",
            state.session_id,
            event_sink,
        )

    from rotaris_core.session.metrics import hydrate_tracker_from_session

    hydrate_tracker_from_session(state)

    from rotaris_core.runtime_logging import configure_session_logging
    from rotaris_core.session.diagnostics import SessionDiagnostics, debug_log_path

    session_dir = session_manager.session_dir(state.session_id)
    diag = SessionDiagnostics(session_dir)
    cleanup_logging = configure_session_logging(
        debug_log_path(session_dir),
        level=config.runtime.session_log_level,
    )
    diag.timeline(
        "run_start",
        actor=_TIMELINE_ACTOR,
        message=f"Starting background run for session {state.session_id}",
        metadata={"workspace_root": str(config.workspace_root)},
    )
    _log.info(
        "Starting background run for session %s in %s",
        state.session_id,
        config.workspace_root,
    )
    state.execution_status = "running"
    persist_session_state(session_manager, state)

    # Everything a host needs to name this run now exists: the session id, its
    # worktree branch and its sandbox verdict. A host that builds an observer
    # around the state hands it back here rather than pre-building one it could
    # not have (see ``on_session_ready``).
    if on_session_ready is not None:
        host_observer = on_session_ready(state)
        if host_observer is not None:
            iteration_observer = host_observer

    post_run_improvement_job: Any | None = None
    progress: RalphProgressFile | None = None
    run_error: str | None = None
    interrupted = False
    run_result: RunResult | None = None
    started_at = monotonic()
    bridge = _CancellationBridge()

    def _capture_post_run_improvement_job(job: Any | None) -> None:
        nonlocal post_run_improvement_job
        post_run_improvement_job = job

    # ------------------------------------------------------------------
    # Observer composition seam.
    #
    # ``iteration_observer`` is the *host's* observer: the loop has one slot,
    # and filling it also decides which agent factory the run gets, so it must
    # stay whatever the caller passed.  Observers that only want to *watch* the
    # run — a checkpoint writer, a lifecycle-hook dispatcher — belong in
    # ``extra_observers``: they are composed on top of the host's observer (and
    # of the event-stream observer) inside ``_run_task`` and displace neither.
    # ------------------------------------------------------------------
    extra_observers: list[RalphIterationObserver] = []

    from rotaris_core.hooks.observer import HookLifecycleObserver
    from rotaris_core.session.checkpoint_observer import CheckpointObserver
    from rotaris_core.session.checkpoint_service import CheckpointService

    hook_runner = _build_hook_runner(config, state.session_id, diag, notice)
    # Per-iteration undo points (SWR-2436).  ``tree_root`` is the tree the agent
    # actually edits — in an isolated session that is the worktree, while the
    # session metadata stays in the base workspace — and ``isolated`` comes from
    # the session's worktree binding rather than from config, because that is
    # what the ``checkpoints.enabled = None`` default resolves through.
    checkpoints = CheckpointObserver(
        CheckpointService(
            session_manager=session_manager,
            state=state,
            tree_root=config.workspace_root,
            config=config,
            diagnostics=diag,
            isolated=state.worktree is not None,
        ),
    )
    # Order matters, and this one is deliberate: the composite fires delegates
    # left to right, so an ``iteration_end`` hook that touches the tree (a
    # formatter, a generated file) has already run when the checkpoint is taken.
    # The checkpoint is therefore "the tree as the iteration left it", which is
    # what a user restoring it expects to get back.
    extra_observers.append(HookLifecycleObserver(hook_runner))
    extra_observers.append(checkpoints)

    # Registered immediately before the guarded block, so ``session.start`` is
    # genuinely the first line a consumer sees *and* there is no window in which
    # a raise could leave the sink or the store registered for the next run in
    # this process.
    #
    # The registration is unconditional, which is the whole of SWR-2901: every
    # run that comes through this entry point is stored, not only a
    # ``--output-format stream-json`` one, so a plain ``rotaris run`` and a
    # headless CI run leave the same trace behind.  ``event_sink`` therefore no
    # longer decides *whether* a sink exists, only what the store's tee forwards
    # to — ``None`` means "persist, stream nowhere".
    #
    # Scope, stated so it is not over-read: this covers every host that calls
    # ``execute_run``, which since SWR-2453 is all of them — the CLI, the Python
    # SDK, and each of Rotaris' desktop run paths.  A host that reached the
    # runtime below this function would still get no store, which is why "no
    # host carries a private re-composition of the lifecycle" is a requirement
    # rather than a convention.
    # A store that cannot be opened — a read-only session directory, an
    # exhausted disk — costs this session its replay (SWR-2902) and its
    # trajectory export (SWR-2903). It must not also cost the user the run, so
    # the host's own sink is registered on its own and the run goes on.
    try:
        session_sink: EventSink | None = attach_session_store(
            session_dir,
            session_id=state.session_id,
            downstream=event_sink,
        )
    except Exception:  # noqa: BLE001 - a run without history beats a run that dies.
        _log.warning(
            "Could not attach the event store for %s; this session will have no "
            "stored history to replay or export.",
            state.session_id,
            exc_info=True,
        )
        session_sink = event_sink
    if session_sink is not None:
        register_event_sink(state.session_id, session_sink)
    publish(
        state.session_id,
        _session_start_event(state, config, request.task, request.max_iterations),
    )

    try:
        if cancel_event is not None and cancel_event.is_set():
            # Cancelled before the loop existed.  Skipping it is not an
            # optimisation: starting an agent run we already know is unwanted
            # would burn a model call and take the grace period to unwind.
            raise asyncio.CancelledError

        # Inside the guarded block on purpose: the tool-hook gate resolves this
        # by session id from inside an agent, and the first agent is built below,
        # so anywhere before ``_run_task`` is early enough — while being inside
        # the block is what guarantees the ``finally`` discards it again.  A
        # runner that outlived its run would fire one session's hooks on the
        # next run in the same process.
        register_hook_runner(state.session_id, hook_runner)

        # Imported here, not at module scope: see the module docstring.
        from rotaris_core.cli.background import _run_task

        progress = await _await_run(
            _run_task(
                request.task,
                config,
                session_manager,
                state,
                request.max_iterations,
                interrupt_handler=bridge,
                iteration_observer=iteration_observer,
                delegation_strategy=request.delegation_strategy,
                post_run_improvement_job_sink=_capture_post_run_improvement_job,
                # Unconditional since SWR-2901: the loop's events are what the
                # store persists, so switching them off for a run without a
                # stream would leave that run's history empty — which is
                # precisely the "only stream-json runs are traceable" gap the
                # requirement closes.  The flag still only switches the channel;
                # it changes nothing about how the run executes.
                stream_events=True,
                extra_observers=tuple(extra_observers),
                # This host publishes its own, richer ``session.start`` /
                # ``session.end`` above and below; the loop must not publish a
                # second pair, or every consumer counting them gets two
                # (SWR-1829).  Hosts that drive the loop directly keep theirs.
                publish_session_lifecycle=False,
            ),
            cancel_event,
            bridge,
        )
    except (asyncio.CancelledError, KeyboardInterrupt):
        interrupted = True
        state.execution_status = "paused"
        state.transcript_events.append(
            {
                "role": "system",
                "content": "Run paused: interrupted by user.",
            },
        )
        persist_session_state(session_manager, state)
    except Exception as exc:
        from rotaris_core.llm_errors import format_llm_runtime_error

        run_error = format_llm_runtime_error(exc)
        state.execution_status = "failed"
        state.transcript_events.append(
            {
                "role": "system",
                "content": f"Run failed: {run_error}",
            },
        )
        persist_session_state(session_manager, state)
    else:
        from rotaris_core.ralph.state import summarize_run_progress

        execution_status, run_text, _severity = summarize_run_progress(progress)
        state.execution_status = execution_status
        state.transcript_events.append(
            {
                "role": "system",
                "content": run_text,
            },
        )
        persist_session_state(session_manager, state)
        if post_run_improvement_job is not None and improvement_job_sink is not None:
            # Handed over rather than awaited: a host with a UI thread runs this
            # where it will not hold the run open, and applies the result the
            # same way the branch below does.
            improvement_job_sink(post_run_improvement_job)
        elif post_run_improvement_job is not None:
            # Awaited, not ``asyncio.run``: this coroutine used to run in a
            # second event loop opened after the first one closed, which a
            # host that owns its loop cannot do.
            improvement = await post_run_improvement_job.run()
            from rotaris_core.ralph import bootstrap

            bootstrap.apply_post_run_improvement_result(state, improvement)
            persist_session_state(session_manager, state)
    finally:
        _log.info("Finished background run for session %s", state.session_id)
        diag.timeline(
            "run_end",
            actor=_TIMELINE_ACTOR,
            message=f"Finished background run for session {state.session_id}",
            metadata={"execution_status": state.execution_status},
        )
        cleanup_logging()
        session_manager.release_lock(state.session_id)
        # In a ``finally`` so that even a BaseException the branches above do
        # not catch still leaves a terminal event, a released lock and a
        # discarded sink behind.
        run_result = build_run_result(
            session_id=state.session_id,
            state=state,
            progress=progress,
            report=_final_report_ref(state),
            error=run_error,
            # A caller that asked to stop is told the run was interrupted even
            # if the loop managed to finish first: "I cancelled it" and "it
            # reported success" must not both be true.
            interrupted=interrupted or (cancel_event is not None and cancel_event.is_set()),
        )
        # Guarded as a pair.  ``publish`` swallows a *sink's* failure, but these
        # two events are still *built* here, and a model that refused to
        # validate would raise out of the ``finally`` and skip the three
        # deregistrations below — the cleanups this block exists to guarantee.
        # The old direct write wrapped construction and delivery together for
        # exactly this reason; moving to the bus must not lose that.
        try:
            publish(state.session_id, _session_end_event(run_result, monotonic() - started_at))
            # Through the bus, like every other event, and *before* the sink is
            # discarded (SWR-1832).  It used to be written straight to the sink
            # object after the registration was already gone, so a consumer
            # attached at the bus — the documented place — watched the whole run
            # and then never learned how it ended.  Publishing keeps the stdout
            # ordering the direct write existed for (the sink registered above
            # forwards to the host's own sink synchronously, so this is still
            # the last line) and delivers the event exactly once, because the
            # direct write is now reached only by runs that never registered
            # anything.
            publish(state.session_id, _result_event(run_result))
        except Exception:  # noqa: BLE001 - a terminal event must not strand a run
            _log.warning(
                "Could not publish the terminal events for session %s.",
                state.session_id,
                exc_info=True,
            )
        # The disabled-hook tally lives on the runner and has to be read before
        # it is discarded below. Every host gets it, for the same reason every
        # host gets the start advisory: the run switched a hook off, and the
        # person whose config it is should hear so once (SWR-2704).
        if notice is not None:
            from rotaris_core.hooks.runner import disabled_hooks_notice

            with contextlib.suppress(Exception):
                finish_notice = disabled_hooks_notice(hook_runner)
                if finish_notice:
                    notice(finish_notice)
        discard_event_sink(state.session_id)
        # Same reason the sink is discarded here: a store or a hook runner left
        # registered would append this session's history — or fire its hooks —
        # on the next run in the same process.
        detach_session_store(state.session_id)
        discard_hook_runner(state.session_id)

    return run_result
