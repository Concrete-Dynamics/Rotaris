#!/usr/bin/env python3
"""Background mode runner — the headless host on top of the shared run entry.

Two output channels live here (SWR-1828).  ``--output-format text`` is the
historical one: human-readable progress on stdout, errors on stderr.
``--output-format stream-json`` hands stdout to the JSONL event stream and
moves *every* human-readable message to stderr, because a single stray line of
prose makes the whole stream unparseable for its consumer.

Both channels end the same way: one :class:`~rotaris_core.run_result.RunResult`
decides what is printed, the ``result`` event's payload *and* the process exit
code, so none of the three can disagree.

The run *lifecycle* is no longer here.  It moved to
:func:`rotaris_core.run_host.execute_run` so the Python SDK (SWR-1830) could
reach it without forking it; :func:`run_background` is the thin synchronous,
``typer``-shaped host around it.  What stayed is what is genuinely
runtime-shaped rather than lifecycle-shaped: :func:`_run_task`, the wiring
between a session and the Ralph loop, which the Rotaris desktop app drives
directly.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.events.stream import (
    OUTPUT_FORMAT_STREAM_JSON,
    OUTPUT_FORMAT_TEXT,
    JsonlEventStream,
    stream_json_sink,
)
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.run_host import (
    RunRequest,
    config_for_session_worktree,
    execute_run,
)
from rotaris_core.run_host import (
    persist_session_state as _persist_session_state,
)
from rotaris_core.run_result import RunStatus
from rotaris_core.session.transcript import (
    discard_transcript_recorder,
    ensure_transcript_recorder,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.events.bus import EventSink
    from rotaris_core.events.schema import RotarisEvent
    from rotaris_core.ralph.state import RalphProgressFile
    from rotaris_core.run_result import RunResult
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState

_log = logging.getLogger(__name__)

#: Re-exported from :mod:`rotaris_core.run_host`: the Rotaris desktop app binds
#: to ``config_for_session_worktree`` at this path, and the message-limit
#: observer below still persists state the same way the run does.
__all__ = [
    "config_for_session_worktree",
    "run_background",
]


@traces(SWR.SWR_915)
class _BackgroundMessageLimitObserver(RalphIterationObserver):
    """Persist the durable hand-off state when a headless run reaches its limit."""

    def __init__(self, session_manager: SessionManager, state: SessionState) -> None:
        self._session_manager = session_manager
        self._state = state

    def on_message_limit_reached(self, message_count: int, message_limit: int) -> None:
        signal_file = self._session_manager.session_dir(self._state.session_id) / (
            ".message_limit_paused"
        )
        signal_file.touch()
        self._state.message_count = message_count
        self._state.message_limit = message_limit
        self._state.execution_status = "paused_message_limit"
        _persist_session_state(self._session_manager, self._state)


async def _flush_session_state(session_manager: SessionManager, state: SessionState) -> None:
    from rotaris_core.session.metrics import sync_tracker_to_session

    sync_tracker_to_session(state)
    await session_manager.persister.flush(state)


@traces(SWR.SWR_1828)
def _with_stream_observer(
    base: RalphIterationObserver,
    session_id: str,
) -> RalphIterationObserver:
    """Compose *base* with the event-publishing observer.

    ``RalphLoop`` has a single ``iteration_observer`` slot, and the background
    runner already fills it with ``_BackgroundMessageLimitObserver`` — dropping
    that to stream events would lose the durable message-limit hand-off
    (SWR-915).  The composite keeps both.

    Imported inside the function rather than at module scope: subclassing
    ``RalphIterationObserver`` pulls in ``ralph`` and the whole agent SDK, which
    a text-mode run never needs to pay for.
    """
    from rotaris_core.events.observer import (
        CompositeIterationObserver,
        StreamEventObserver,
    )

    composite: RalphIterationObserver = CompositeIterationObserver(
        base,
        StreamEventObserver(session_id),
    )
    return composite


@traces(SWR.SWR_1830)
def _with_extra_observers(
    base: RalphIterationObserver,
    extra_observers: Sequence[RalphIterationObserver],
) -> RalphIterationObserver:
    """Compose *base* with observers that only want to watch the run.

    The distinction from the ``iteration_observer`` argument matters: that one
    means "a host supplied its own observer" and both replaces the message-limit
    observer and switches on the entry-model resolver.  Anything that merely
    watches — the event stream above, and whatever
    :func:`~rotaris_core.run_host.execute_run` composes for a host — must be
    added instead of substituted, or turning a feature on would quietly change
    which agent factory the run gets.
    """
    if not extra_observers:
        return base
    from rotaris_core.events.observer import CompositeIterationObserver

    composite: RalphIterationObserver = CompositeIterationObserver(base, *extra_observers)
    return composite


@traces(SWR.SWR_1828, SWR.SWR_1830)
def _announcing_sink(
    machine_sink: JsonlEventStream | None,
    *,
    created: bool,
    out: Callable[[str], None],
) -> EventSink:
    """Wrap the machine channel with the human "which session is this" line.

    That line has always been printed the *moment the session existed*, before
    the run rather than after it, because on a run that takes minutes it is the
    only way to reach the session from another terminal.  Now that the host no
    longer creates the session itself, ``session.start`` is the moment it learns
    the id — published at exactly the point the old code printed the line — so
    announcing from the sink keeps the original ordering on both channels.

    A run that never starts publishes no ``session.start`` and therefore still
    announces nothing: there would be no session to resume with the id.
    """
    announced = False

    def _sink(event: RotarisEvent) -> None:
        nonlocal announced
        # The Ralph loop publishes a ``session.start`` of its own; the line
        # belongs to the session, not to each announcement of it.
        if event.event == "session.start" and not announced:
            announced = True
            out(
                f"Created session {event.session_id}"
                if created
                else f"Resuming session {event.session_id}"
            )
        if machine_sink is not None:
            machine_sink(event)

    return _sink


@traces(SWR.SWR_1828, SWR.SWR_2408, SWR.SWR_2409)
def run_background(
    task: str,
    config: RotarisConfig,
    session_manager: SessionManager,
    session_id: str | None = None,
    max_iterations: int | None = None,
    *,
    isolate: bool = False,
    worktree_path: Path | None = None,
    worktree_branch: str | None = None,
    output_format: str = OUTPUT_FORMAT_TEXT,
) -> None:
    """Execute task in background (no TUI).

    Args:
        output_format: ``"text"`` (default) keeps today's human-readable output
            on stdout.  ``"stream-json"`` hands stdout to the JSONL event
            stream (SWR-1828) and reroutes every human-readable message to
            stderr.  The flag switches the channel; it changes nothing about
            how the run itself executes.

    Raises:
        typer.Exit: with the run's :attr:`RunResult.exit_code` whenever that
            code is non-zero.  The exit code and the terminal ``result`` event
            are read from the same :class:`RunResult`, so they cannot disagree.
    """
    import typer

    from rotaris_core.runtime_interrupts import DoubleCtrlCHandler

    streaming = output_format == OUTPUT_FORMAT_STREAM_JSON
    # Constructed before anything can fail: an argument error still owes the
    # consumer a terminal ``result`` event on the stream.
    event_stream: JsonlEventStream | None = stream_json_sink() if streaming else None

    def _out(message: str) -> None:
        """Normal human-readable output — stderr while the stream owns stdout."""
        typer.echo(message, err=streaming)

    def _err(message: str) -> None:
        typer.echo(message, err=True)

    # Even the text channel wants the session line at the moment the session
    # appears, so both channels take their sink from the same wrapper; the text
    # one simply has nothing behind it to forward to.
    event_sink = _announcing_sink(event_stream, created=not session_id, out=_out)

    request = RunRequest(
        task=task,
        config=config,
        session_id=session_id,
        max_iterations=max_iterations,
        isolate=isolate,
        worktree_path=worktree_path,
        worktree_branch=worktree_branch,
    )
    # Ctrl-C no longer reaches the loop by calling into it from the signal
    # handler; it sets the cancel event the shared entry point watches, which
    # is the one cancellation channel every host uses.  The handler itself
    # stays here: only a process may take SIGINT, and only this host is one.
    # Its messages go to the terminal, which on the stream path is stderr, or
    # the very first interrupt would corrupt stdout.
    cancel_event = asyncio.Event()
    interrupt_handler = DoubleCtrlCHandler(emit=_err if streaming else typer.echo)
    interrupt_handler.set_callbacks(
        on_first_interrupt=cancel_event.set,
        on_second_interrupt=cancel_event.set,
    )
    interrupt_handler.install()
    try:
        result = asyncio.run(
            execute_run(
                request,
                session_manager,
                event_sink=event_sink,
                cancel_event=cancel_event,
                # Hooks this workspace declared but nobody has trusted yet are
                # skipped silently otherwise, which is indistinguishable from a
                # broken hook (SWR-2701).
                notice=_out,
            ),
        )
    finally:
        interrupt_handler.restore()
        if event_stream is not None:
            event_stream.close()

    _report_outcome(result, out=_out, err=_err)

    # One value decides both the reported outcome and the process exit code.
    if result.exit_code:
        raise typer.Exit(result.exit_code)


@traces(SWR.SWR_1828)
def _report_outcome(
    result: RunResult,
    *,
    out: Callable[[str], None],
    err: Callable[[str], None],
) -> None:
    """Print the run's human-readable summary, one line per historical message.

    Everything here is read off the same :class:`RunResult` the ``result`` event
    carries, so the prose and the machine-readable channel can no longer report
    different outcomes — which they could while the text channel re-derived its
    own summary from the progress file.  The session line is not here: it is
    owed to the user while the run is still going, so :func:`_announcing_sink`
    prints it as the session appears.

    The two ``error`` shapes are deliberate.  A failure that happened *before*
    the run (a rejected flag combination, an unavailable lock) already carries
    its ``Error: `` prefix, because that exact string is both what the user
    reads and what the ``result`` payload reports; a runtime failure carries
    only the message.
    """
    if result.status is RunStatus.ERROR:
        message = result.error or result.summary
        err(message if message.startswith("Error:") else f"Error: {message}")
        return
    if result.status is RunStatus.INTERRUPTED and not result.stop_reason:
        # No progress file at all: the run was cancelled or interrupted before
        # it could report anything of its own.
        out("\nInterrupted.")
        return
    if result.status is RunStatus.FAILED:
        err(result.summary)
        return
    if result.summary and result.summary != _NOTHING_TO_REPORT:
        out(result.summary)
        return
    out("Done.")


#: The summary of a run that completed with nothing worth saying about it.
#: ``Done.`` has been the headless runner's success line since before there was
#: a :class:`RunResult`, and scripts grep for it.
_NOTHING_TO_REPORT = "Run completed."


@traces(SWR.SWR_1017, SWR.SWR_1019, SWR.SWR_915, SWR.SWR_918)
async def _run_task(
    task: str,
    config: RotarisConfig,
    session_manager: SessionManager,
    state: SessionState,
    max_iterations: int | None,
    interrupt_handler: Any | None = None,
    iteration_observer: RalphIterationObserver | None = None,
    delegation_strategy: str | None = None,
    run_type: Any | None = None,
    post_run_improvement_job_sink: Any | None = None,
    stream_events: bool = False,
    extra_observers: Sequence[RalphIterationObserver] = (),
    publish_session_lifecycle: bool = True,
) -> RalphProgressFile:
    """Wire background execution to the RalphLoop orchestration engine.

    ``stream_events`` composes the event-publishing observer on top of whatever
    observer this run already uses.  It is deliberately separate from
    ``iteration_observer``: that argument means "a host supplied its own
    observer" and gates the entry-model resolver, and streaming must not change
    which agent factory the run gets (SWR-1828: the flag switches the channel,
    not the behaviour).

    ``extra_observers`` is the same idea generalised: observers the shared run
    entry point composed for this run (SWR-1830) watch the loop without taking
    the host's observer slot.

    ``publish_session_lifecycle`` decides whether the *loop* owns the
    ``session.start`` / ``session.end`` pair on the wire.  It defaults to ``True``
    because the callers that reach this function directly — Rotaris' run bridge
    and its worktree integration — have no other source for those events.
    ``run_host.execute_run`` passes ``False``: it publishes richer versions of
    both from the run aggregates the loop cannot see, and two publishers would
    put each event on the stream twice (SWR-1829).
    """
    from openhands.sdk.event.condenser import Condensation

    from rotaris_core.auth.session_auth import keep_auth_fresh
    from rotaris_core.improvement import RunType
    from rotaris_core.ralph import bootstrap
    from rotaris_core.ralph.intent_classifier import (
        classification_status_text,
        intent_tools_for,
    )
    from rotaris_core.ralph.loop import RalphLoop
    from rotaris_core.session.diagnostics import SessionDiagnostics, conversations_dir
    from rotaris_core.tracking.tracker import GlobalTracker

    # Credentials are resolved once, here, on the run's own loop, and kept ahead
    # of their expiry for as long as the run lasts (SWR-3712). Before this, every
    # model build resolved its own, and whichever build first met an expired
    # token paid for the refresh on whatever thread it happened to be on.
    async with keep_auth_fresh(config) as auth_report:
        session_dir = session_manager.session_dir(state.session_id)
        diag = SessionDiagnostics(session_dir)
        if not auth_report.ok:
            # Named here so a run that later fails on a provider call has the
            # authentication reason in its own record, not only in the log.
            diag.timeline(
                "auth_not_primed",
                actor="background",
                message="Some provider credentials could not be resolved before the run.",
                metadata={"providers": auth_report.unresolved},
            )
        # From here the run keeps its own transcript, for every host and for no
        # host (SWR-2454). It used to be the Rotaris desktop that built these
        # rows, from callbacks the desktop installed, so a CLI or headless
        # session recorded almost nothing until it ended.
        recorder = ensure_transcript_recorder(state.session_id, state)
        recorder.record_user(task)
        _persist_session_state(session_manager, state)

        classification = await bootstrap.classify_run_intent(
            config,
            task,
            entrypoint="background",
            progress=state.ralph_progress,
            # Read before the assignment below overwrites it: on a resume this
            # still holds the *previous* run's intent, which is what an
            # unclassifiable continuation prompt inherits (SWR-176).
            prior_intent=state.run_intent,
            todo_state=state.todo_state,
        )
        intent_tools = intent_tools_for(classification.intent)
        state.run_intent = classification.intent.value
        classification_prompt_text = f"Intent classified: {classification.intent.value}"
        user_visible_classification_text = classification_status_text(classification)
        classification_row = recorder.record_system(classification_prompt_text)
        diag.timeline(
            "intent_classified",
            actor="background",
            message=user_visible_classification_text,
            metadata={"fallback": classification.fallback, "reason": classification.reason},
        )
        _persist_session_state(session_manager, state)

        todo, _top_level_task = bootstrap.build_run_todo(state, task, session_dir)
        state.todo_state = todo.model_dump(mode="json")
        if user_visible_classification_text != classification_prompt_text:
            recorder.amend(classification_row, content=user_visible_classification_text)
        _persist_session_state(session_manager, state)

        def apply_conversation_event(record: Any, event: object) -> None:
            if isinstance(event, Condensation):
                from uuid import uuid4

                GlobalTracker().track_compression_completion(
                    record.canonical_name,
                    event.llm_response_id or str(uuid4()),
                )
                diag.timeline(
                    "compression",
                    actor=record.canonical_name,
                    message="Conversation compression completed",
                    metadata={"llm_response_id": event.llm_response_id},
                )
            elif (
                getattr(event, "event_type", None) == "compression"
                and getattr(event, "phase", None) == "done"
            ):
                from uuid import uuid4

                GlobalTracker().track_compression_completion(record.canonical_name, str(uuid4()))
                diag.timeline(
                    "compression",
                    actor=record.canonical_name,
                    message="Conversation compression completed",
                )

        message_limit_observer = iteration_observer or _BackgroundMessageLimitObserver(
            session_manager, state
        )
        # ``message_limit_observer`` stays the host/background observer everywhere
        # below (entry-model resolver, ``bind_ralph_loop``, ``persists_transcript``);
        # only the loop sees the composite, so streaming adds hooks without changing
        # which agent factory or transcript policy the run uses.
        loop_observer = (
            _with_stream_observer(message_limit_observer, state.session_id)
            if stream_events
            else message_limit_observer
        )
        loop_observer = _with_extra_observers(loop_observer, extra_observers)

        ralph = RalphLoop(
            config=config,
            workspace_root=str(config.workspace_root),
            conversation_persistence_dir=conversations_dir(session_dir),
            conversation_event_callback=apply_conversation_event,
            run_type=run_type or RunType.TASK_RUN,
            summary_agent=bootstrap.make_summary_agent_factory(config),
            improvement_collector_factory=bootstrap.make_improvement_collector_factory(config),
            improvement_context_provider=bootstrap.make_improvement_context_provider(state),
            iteration_observer=loop_observer,
            mcp_manager=session_manager.mcp_manager,
            publish_session_lifecycle=publish_session_lifecycle,
        )
        ralph._message_count = state.message_count  # noqa: SLF001
        ralph._message_limit = state.message_limit or config.runtime.message_limit  # noqa: SLF001
        if state.message_limit is None:
            state.message_limit = ralph._message_limit  # noqa: SLF001
        ralph.run_intent = classification.intent.value
        bind_ralph_loop = getattr(message_limit_observer, "bind_ralph_loop", None)
        if callable(bind_ralph_loop):
            bind_ralph_loop(ralph)
        if interrupt_handler is not None:
            interrupt_handler.set_callbacks(
                on_first_interrupt=lambda: ralph.request_shutdown(force=False),
                on_second_interrupt=lambda: ralph.request_shutdown(force=True),
            )

        # An unanswerable approval under the 'abort' policy has to stop the run
        # (SWR-2504).  A desktop host registered its interactive host before this
        # runner started, so attach to whatever is there instead of replacing it.
        from rotaris_core.permissions import discard_approval_host, ensure_approval_host

        ensure_approval_host(state.session_id).on_abort = lambda: ralph.request_shutdown(
            force=False
        )

        # With the host settled, the run's effective permission mode is known:
        # an unattended, unsandboxed run in a permissive mode is downgraded to
        # 'ask' unless the workspace opted in (SWR-2508).
        from rotaris_core.permissions import announce_effective_permission_mode

        announce_effective_permission_mode(state, config, diag)
        _persist_session_state(session_manager, state)

        # From here on every permission decision of every agent in this session is
        # appended to <session_dir>/evidence/permissions.jsonl (SWR-2506).
        from rotaris_core.permissions import discard_audit_session, register_audit_session

        register_audit_session(state.session_id, session_dir)

        agent_factory = bootstrap.make_agent_factory(
            config,
            intent_tools=intent_tools,
            intent=classification.intent.value,
            run_override=delegation_strategy or "",
            # Hosts (Rotaris) flip observer.entry_model_override mid-run to move
            # the entry persona onto another model from the next iteration on —
            # e.g. back to the primary model after a provider re-authentication.
            resolve_model=(
                bootstrap.make_entry_model_resolver(config, message_limit_observer)
                if iteration_observer is not None
                else None
            ),
        )

        try:
            progress = await ralph.run(
                todo=todo,
                agent_factory=agent_factory,
                session_id=state.session_id,
                max_iterations=max_iterations,
            )
        finally:
            # Releases any thread still blocked on an approval, so a cancelled or
            # failed run cannot leave a dispatch waiting forever (SWR-2504).
            discard_approval_host(state.session_id)
            discard_audit_session(state.session_id)
            # A mode the user switched to mid-run belongs to that run only; a later
            # run of the same session id starts from its config again (SWR-2503).
            from rotaris_core.permissions import discard_session_mode_override

            discard_session_mode_override(state.session_id)

        # An iteration's outcome needs a row of its own only when the
        # conversation left none. It normally does leave one — the recorder above
        # writes every agent message as it is said — and appending these on top
        # would post each answer twice. What still reaches here is the run whose
        # conversation this process never saw: a summarised child whose report is
        # the only answer there is.
        if not recorder.has_agent_rows():
            for iteration in progress.iterations:
                response_text = iteration.agent_response or iteration.report_summary
                if not response_text:
                    continue
                recorder.record_agent(iteration.task_id, response_text)

        from rotaris_core.tokens import TokenSnapshot

        # Each iteration stores the GlobalTracker's cumulative aggregate (already
        # includes all prior iterations), so we must NOT sum them — doing so would
        # multiply-count tokens.  Take the last non-None value instead.
        final_token_usage: TokenSnapshot | None = None
        for iteration in progress.iterations:
            if iteration.token_usage is not None:
                final_token_usage = TokenSnapshot.model_validate(iteration.token_usage)
        if final_token_usage is not None:
            state.token_usage = final_token_usage.model_dump(mode="json")

        bootstrap.apply_progress_to_state(state, progress, todo, ralph)
        if post_run_improvement_job_sink is not None:
            post_run_improvement_job_sink(
                ralph.capture_post_run_improvement_job(
                    session_id=state.session_id,
                    progress=progress,
                    todo=todo,
                ),
            )
        # Guaranteed final write before the event loop shuts down.
        await _flush_session_state(session_manager, state)
        # The run is over, so nothing may still be writing its transcript. Late
        # binding through the registry is what makes this final: an event that
        # escapes a conversation's teardown finds no recorder rather than
        # appending to a session that has ended.
        discard_transcript_recorder(state.session_id)
        return progress
