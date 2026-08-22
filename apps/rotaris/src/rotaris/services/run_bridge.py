"""Qt thread bridge for running Rotaris orchestration without blocking UI."""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast

from PySide6.QtCore import QObject, QThread, QTimer, Signal, Slot
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.permissions import EffectiveMode
    from rotaris_core.tools.ask_questions import AskQuestionsStep

    from rotaris.models.store import WorkspaceStore
    from rotaris.services.config_service import ConfigService
    from rotaris.services.session_projection import (
        SessionProjection,
        SessionProjectionContext,
    )
    from rotaris.services.todo_editing import TodoEditOperation


_log = logging.getLogger(__name__)

#: How a check's outcome reads as a transcript row status (SWR-2609). A skip is
#: deliberately ``blocked`` rather than ``ok``: nothing was verified, and a green
#: row would say the opposite. A timeout reads as a failure because that is what
#: the completion gate makes of it.
_VERIFIER_ROW_STATUS: dict[str, str] = {
    "passed": "ok",
    "failed": "failed",
    "timeout": "failed",
    "skipped": "blocked",
}


@traces(SWR.SWR_2436, SWR.SWR_2437, SWR.SWR_2701, SWR.SWR_2704)
class RunLifecycleExtras:
    """The hook runner and loop observers a desktop run must carry.

    Rotaris does not go through ``rotaris_core.run_host.execute_run``: its
    workers drive ``cli.background._run_task`` directly, because the desktop
    owns the event loop, the observer slot and the session identity in ways the
    headless lifecycle does not model. That shortcut used to skip the two things
    ``execute_run`` composes on top of the loop — the lifecycle-hook dispatcher
    (SWR-2701/2703) and the per-iteration checkpoint writer (SWR-2436) — so the
    desktop, the *primary* interface, was the one host with neither.

    This object is that composition, reproduced verbatim:

    * hooks come from :func:`~rotaris_core.hooks.trust.trusted_hooks_for_config`
      and never from ``resolve_hooks``, because a workspace's ``agents.yaml``
      travels inside a clone and running it unreviewed is remote code execution;
    * the trust verdict is looked up in the **base** workspace while the hook
      processes start in the run's ``workspace_root`` — in an isolated session
      the latter is a throwaway worktree, and the file the user reviewed is in
      the repository they opened;
    * the hook observer is composed *before* the checkpoint observer, so an
      ``iteration_end`` hook that reformats the tree has already run when the
      checkpoint is taken and the recorded state is the one a restore returns.

    Never raises: an undo facility or a hook feature that cannot start is a run
    without undo, not a failed run.
    """

    __slots__ = ("_notice", "_observers", "_runner", "_session_id")

    def __init__(
        self,
        *,
        session_id: str,
        observers: tuple[Any, ...],
        notice: str,
        runner: Any | None,
    ) -> None:
        self._session_id = session_id
        self._observers = observers
        self._notice = notice
        self._runner = runner

    @property
    def observers(self) -> tuple[Any, ...]:
        """Loop observers to append to ``_run_task(extra_observers=…)``."""
        return self._observers

    @property
    def notice(self) -> str:
        """Why some hooks did not run, or ``""``. Never contains a command."""
        return self._notice

    @traces(SWR.SWR_2704)
    def finish_notice(self) -> str:
        """Warning for hooks this run switched off after repeated failures.

        Reports the count only. A hook's *name* is written by whoever wrote the
        config it came from, and a toast is not a place to render text the user
        has not opened on purpose.
        """
        runner = self._runner
        if runner is None:
            return ""
        try:
            disabled = runner.disabled_hook_ids
        except Exception:  # noqa: BLE001 - a warning must not become the failure.
            return ""
        count = len(disabled)
        if not count:
            return ""
        noun = "hook" if count == 1 else "hooks"
        return (
            f"{count} {noun} failed repeatedly and {'was' if count == 1 else 'were'} "
            f"switched off for the rest of this session. See the session's "
            f"diagnostics for the command output."
        )

    def discard(self) -> None:
        """Unregister the hook runner. Idempotent, and never raises.

        Called from the run's ``finally`` for the same reason ``execute_run``
        does it there: a runner left registered fires one session's hooks on the
        next run in the same process.
        """
        if self._runner is None:
            return
        self._runner = None
        try:
            from rotaris_core.hooks.registry import discard_hook_runner

            discard_hook_runner(self._session_id)
        except Exception:  # noqa: BLE001 - cleanup must not fail a finished run.
            _log.warning("Could not discard the hook runner for %s.", self._session_id)


@traces(SWR.SWR_2436, SWR.SWR_2703, SWR.SWR_2901)
def accepts_keyword(run_task: Any, name: str) -> bool:
    """Whether *run_task* can be handed ``name=…``.

    Checked rather than assumed because ``_run_task`` is a patch point: test
    doubles and external hosts install their own callable there, and one written
    against the older signature must still run the task rather than raise a
    ``TypeError`` the user would see as "the run would not start". A callable
    with a ``**kwargs`` catch-all counts — that is how most doubles are written.
    """
    try:
        parameters = inspect.signature(run_task).parameters
    except (TypeError, ValueError):  # pragma: no cover - a non-introspectable double
        return False
    if name in parameters:
        return True
    return any(parameter.kind is inspect.Parameter.VAR_KEYWORD for parameter in parameters.values())


@traces(SWR.SWR_2436, SWR.SWR_2703)
def accepts_extra_observers(run_task: Any) -> bool:
    """Whether *run_task* can be handed ``extra_observers=…``.

    Kept as its own name because a second desktop path
    (``services.worktree_integration``) binds to it; the rule itself lives in
    :func:`accepts_keyword`, so the two callers cannot drift apart.
    """
    return accepts_keyword(run_task, "extra_observers")


@traces(SWR.SWR_2436, SWR.SWR_2437, SWR.SWR_2701, SWR.SWR_2703)
def install_run_lifecycle_extras(
    *,
    config: Any,
    session_manager: Any,
    state: Any,
) -> RunLifecycleExtras:
    """Register this run's hook runner and compose its extra loop observers.

    Call it immediately before the run and pair every call with
    :meth:`RunLifecycleExtras.discard` in a ``finally``. Never raises: on any
    failure the run continues with no hooks and no checkpoints.
    """
    session_id = str(getattr(state, "session_id", "") or "")
    try:
        from rotaris_core.hooks.observer import HookLifecycleObserver
        from rotaris_core.hooks.registry import register_hook_runner
        from rotaris_core.hooks.runner import HookRunner
        from rotaris_core.hooks.trust import TrustedHookSet, trusted_hooks_for_config
        from rotaris_core.session.checkpoint_observer import CheckpointObserver
        from rotaris_core.session.checkpoint_service import CheckpointService
        from rotaris_core.session.diagnostics import SessionDiagnostics

        diagnostics = SessionDiagnostics(session_manager.session_dir(session_id))
        trust_root = getattr(config, "metadata_workspace_root", None) or config.workspace_root
        try:
            trusted = trusted_hooks_for_config(config, trust_root)
        except Exception:  # noqa: BLE001 - hooks must never stop a run starting.
            _log.warning("Could not resolve this run's hooks; continuing without them.")
            trusted = TrustedHookSet(allowed=(), blocked=(), restored=(), notice="")
        runner = HookRunner(
            session_id=session_id,
            workspace=config.workspace_root,
            hooks=trusted.allowed,
            diagnostics=diagnostics,
            # Same reasoning as the CLI/SDK path in `run_host`: a hook the
            # trust gate refused is reported as a skipped `hook.finish`
            # (SWR-1832) rather than silently absent.
            skipped=trusted.blocked,
        )
        checkpoints = CheckpointObserver(
            CheckpointService(
                session_manager=session_manager,
                state=state,
                tree_root=config.workspace_root,
                config=config,
                diagnostics=diagnostics,
                isolated=getattr(state, "worktree", None) is not None,
            ),
        )
        register_hook_runner(session_id, runner)
    except Exception:  # noqa: BLE001 - a run without undo beats a run that dies.
        _log.warning("Could not compose hooks and checkpoints for %s.", session_id, exc_info=True)
        return RunLifecycleExtras(
            session_id=session_id,
            observers=(),
            notice="",
            runner=None,
        )
    return RunLifecycleExtras(
        session_id=session_id,
        observers=(HookLifecycleObserver(runner), checkpoints),
        notice=trusted.notice,
        runner=runner,
    )


@traces(SWR.SWR_2901)
def install_run_event_store(*, session_manager: Any, session_id: str) -> None:
    """Persist every event this desktop run emits (SWR-2901).

    Rotaris drives ``cli.background._run_task`` directly, one layer below
    ``run_host.execute_run`` — which is the layer where the store is attached.
    Without this call the *primary* interface is the one host that leaves no
    trace behind: the CLI stores, the Python SDK stores, and the desktop
    sessions a user actually cares about replay and export as empty.

    The pair is the one ``execute_run`` uses, not a second invention.
    :func:`~rotaris_core.eventstore.attach_session_store` opens
    ``<session_dir>/evidence/events.jsonl``, registers it under the session id
    and returns a tee; registering that tee on the event bus is what makes the
    store see exactly the sequence a stream consumer sees. Both registries bind
    late and are keyed by session, so no signature has to change and two
    concurrent desktop runs cannot write into each other's history.

    Call it immediately before the guarded run block, so nothing this run
    publishes can predate the store, and pair every call with
    :func:`discard_run_event_store` in that block's ``finally``.

    What that does *not* buy is a guaranteed ``session.start``. This host takes
    that event from the Ralph loop, which ``_run_task`` builds only after it has
    classified the run's intent — a model call that can fail. A run that dies
    there is stored with its terminal ``result`` and nothing else, where a
    headless run would still have the ``session.start`` ``execute_run``
    publishes itself. Closing that last gap means the two hosts sharing one
    bootstrap rather than this one growing a second copy of the lifecycle.

    Never raises. When the store cannot be opened — a read-only session
    directory, an exhausted disk — the user loses this session's replay
    (SWR-2902) and its trajectory export (SWR-2903). They must not also lose
    the run.
    """
    if not session_id:
        return
    try:
        from rotaris_core.events.bus import register_event_sink
        from rotaris_core.eventstore import attach_session_store

        register_event_sink(
            session_id,
            attach_session_store(
                session_manager.session_dir(session_id),
                session_id=session_id,
            ),
        )
    except Exception:  # noqa: BLE001 - a run without history beats a run that dies.
        _log.warning(
            "Could not attach the event store for %s; this session will have no "
            "stored history to replay or export.",
            session_id,
            exc_info=True,
        )


@traces(SWR.SWR_2901)
def discard_run_event_store(session_id: str) -> None:
    """Stop persisting for *session_id*. Idempotent, and never raises.

    Must run *after* the terminal ``result`` event has been published, for the
    reason the store's own coverage attaches at the sink seam rather than at
    the registry: a stored session whose last line is not the terminal event is
    indistinguishable from one whose process was killed mid-run.

    Both halves are dropped together. A sink left registered would append the
    next run's events to this session, and a store left registered would keep
    the file handle bound to a session that is over.
    """
    if not session_id:
        return
    try:
        from rotaris_core.events.bus import discard_event_sink
        from rotaris_core.eventstore import detach_session_store

        discard_event_sink(session_id)
        detach_session_store(session_id)
    except Exception:  # noqa: BLE001 - cleanup must not fail a finished run.
        _log.warning("Could not detach the event store for %s.", session_id, exc_info=True)


@traces(SWR.SWR_1828, SWR.SWR_2901)
def publish_terminal_run_result(
    *,
    state: Any,
    progress: Any,
    error: str | None,
    interrupted: bool,
) -> None:
    """Close this run on the bus with its terminal ``result`` event.

    The Ralph loop publishes ``session.start``/``session.end`` but deliberately
    not ``result``: that event carries the session state and the aggregate
    token/cost figures the loop does not hold, so it belongs to whoever owns the
    run's end. For the CLI and the SDK that is ``run_host.execute_run``; for the
    desktop it is this worker, or every stored desktop session ends without the
    one event that says how it ended.

    Built from the same :func:`~rotaris_core.run_result.build_run_result` the
    headless hosts use, so a stored desktop session and a stored CI run describe
    their outcome with identical fields.

    Never raises: ``build_run_result`` cannot and ``publish`` swallows a sink
    failure, but the event model is still *constructed* here, and a validation
    error escaping into the caller's ``finally`` would skip the deregistrations
    that follow it.
    """
    session_id = str(getattr(state, "session_id", "") or "")
    if not session_id:
        return
    try:
        from rotaris_core.events.bus import publish
        from rotaris_core.events.schema import ResultEvent
        from rotaris_core.run_result import build_run_result

        # The run's last report artifact, in the ``_artifact_refs`` shape
        # ``build_run_result`` filters down to four keys.
        report = next(
            (
                artifact
                for artifact in reversed(list(getattr(state, "report_artifacts", None) or []))
                if isinstance(artifact, dict)
            ),
            None,
        )
        result = build_run_result(
            session_id=session_id,
            state=state,
            progress=progress,
            report=report,
            error=error,
            interrupted=interrupted,
        )
        publish(
            session_id,
            ResultEvent(session_id=session_id, result=result.model_dump(mode="json")),
        )
    except Exception:  # noqa: BLE001 - a terminal event must not strand a run.
        _log.warning(
            "Could not publish the terminal result event for %s.",
            session_id,
            exc_info=True,
        )


@traces(
    SWR.SWR_2007,
    SWR.SWR_2024,
    SWR.SWR_2064,
    SWR.SWR_2065,
    SWR.SWR_2066,
    SWR.SWR_2067,
    SWR.SWR_2085,
    SWR.SWR_2401,
    SWR.SWR_2404,
    SWR.SWR_2412,
    SWR.SWR_2414,
    SWR.SWR_2415,
    SWR.SWR_2434,
    SWR.SWR_561,
)
class RunBridge(QObject):
    run_started = Signal(str)
    run_finished = Signal(str)
    run_failed = Signal(str)
    refresh_failed = Signal(str)
    store_updated = Signal()
    compression_finished = Signal(int, str)  # success count, error summary
    #: session id, execution status, worktree branch — published on every
    #: refresh so a coordinator can keep unfocused session rows live.
    session_summary = Signal(str, str, str)
    #: session id, resolved worktree branch — emitted before the agent starts.
    worktree_resolved = Signal(str, str)
    #: This handle has (or no longer has) post-run analysis in flight.
    improvement_activity_changed = Signal(bool)
    _refresh_requested = Signal(str, int, object)

    def __init__(
        self,
        workspace: Path,
        store: WorkspaceStore,
        config_service: ConfigService,
        diagnostics: Any | None = None,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self.workspace = workspace
        self.store = store
        self.config_service = config_service
        # Only the focused handle owns the shared store surfaces. A background
        # handle still refreshes its own session, but publishes a summary
        # instead of overwriting the focused run's projection and queue.
        self.projection_enabled = True
        # Single-handle hosts keep driving the store's analysis indicator; a
        # coordinator turns this off and aggregates across handles instead.
        self.owns_improvement_indicator = True
        if diagnostics is None:
            from rotaris.diagnostics import NoopDiagnostics

            diagnostics = NoopDiagnostics()
        self.diagnostics = diagnostics
        self._thread: QThread | None = None
        self._worker: _RunWorker | None = None
        self._refresh_thread: QThread | None = None
        self._refresh_worker: _SessionRefreshWorker | None = None
        self._improvement_thread: QThread | None = None
        self._improvement_worker: _ImprovementWorker | None = None
        self._queued_improvement_jobs: list[object] = []
        self._improvement_active = False
        self._session_id = ""
        # True from start() until the worker reports finished/failed. The
        # QThread outlives the run by a moment (its event loop still has to
        # quit), so restart decisions — e.g. the auth-failure fallback retry
        # fired from the run_failed handler — must key off this flag, not
        # QThread.isRunning(); start() then joins the winding-down thread.
        self._run_active = False
        self._refresh_busy = False
        self._refresh_pending = False
        self._refresh_pending_final = False
        self._refresh_generation = 0
        self._refresh_inflight_generation = 0
        self._refresh_inflight_final = False
        self._final_completion: tuple[str, str] | None = None
        self._final_refresh_attempts = 0
        self._shutting_down = False
        self._poller = QTimer(self)
        self._poller.setInterval(750)
        self._poller.timeout.connect(self._poll)

    @property
    def running(self) -> bool:
        return self._run_active

    @property
    def session_id(self) -> str:
        """Session this handle drives ('' before the run reports started)."""
        return self._session_id

    @traces(SWR.SWR_2434)
    def set_projection_enabled(self, enabled: bool) -> None:
        """Focus (or unfocus) this handle's writes to the shared store."""
        self.projection_enabled = enabled

    @traces(SWR.SWR_2504)
    def resolve_approval(self, request_id: str, option: str) -> bool:
        """Answer one pending permission approval shown by Rotaris.

        Returns ``False`` when the waiting dispatch is already gone (run ended,
        request timed out), so the caller can show a delivery error instead of
        pretending the tool call proceeds.
        """
        from rotaris_core.permissions import ApprovalOption, resolve_approval_host

        if not request_id or not self._session_id:
            return False
        host = resolve_approval_host(self._session_id)
        if host is None:
            return False
        try:
            choice = ApprovalOption(option)
        except ValueError:
            return False
        return bool(host.barrier.resolve(request_id, choice))

    def resolve_questions(self, agent_id: str, prompt_id: str, answers: object) -> bool:
        """Resolve the exact pending prompt shown by Rotaris."""
        return self._finish_questions(agent_id, prompt_id, answers)

    def cancel_questions(self, agent_id: str, prompt_id: str) -> bool:
        """Cancel the exact pending prompt shown by Rotaris."""
        return self._finish_questions(agent_id, prompt_id, None)

    def _finish_questions(
        self,
        agent_id: str,
        prompt_id: str,
        answers: object | None,
    ) -> bool:
        if self._worker is None:
            return False
        ralph = getattr(self._worker, "_ralph", None)
        if ralph is None:
            return False
        scheduler = getattr(ralph, "scheduler", None)
        if scheduler is None:
            return False
        barrier = getattr(scheduler, "user_prompt_barrier", None)
        if barrier is None:
            return False
        conversation = getattr(scheduler, "_active_conversations", {}).get(agent_id)
        if conversation is None:
            return False

        if answers is None:
            return bool(barrier.cancel(conversation, prompt_id))

        from rotaris.models.state import QuestionAnswers

        if isinstance(answers, QuestionAnswers):
            answers_dict = answers.answers
        else:
            answers_dict = getattr(answers, "answers", {})
        return bool(barrier.resolve(conversation, prompt_id, answers_dict))

    def start(
        self,
        prompt: str,
        session_id: str | None = None,
        isolation: Any | None = None,
        *,
        new_session_id: str | None = None,
        run_config: Any | None = None,
    ) -> bool:
        """Start (or restart) this handle's run.

        ``new_session_id`` pre-assigns the identity of a session that does not
        exist yet, so a caller can show the run in its lists before the worker
        reports back. ``run_config`` pins an immutable configuration snapshot;
        without one the current desktop settings are snapshotted here.
        """
        if self._run_active or self._final_completion is not None or not prompt.strip():
            return False
        # Reap the previous run's thread before creating a new one — the old
        # reference is only dropped after a join (see _join_thread).
        if not self._join_thread():
            return False
        if self.config_service.config is None:
            self.config_service.load()
        thread = QThread(self)
        worker = _RunWorker(
            self.workspace,
            run_config if run_config is not None else self.config_service.build_run_config(),
            prompt.strip(),
            session_id,
            self.store.delegation.strategy,
            isolation,
            new_session_id=new_session_id,
        )
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.started.connect(self._on_started)
        worker.finished.connect(self._on_finished)
        worker.failed.connect(self._on_failed)
        worker.compression_finished.connect(self.compression_finished.emit)
        worker.improvement_job_ready.connect(self._queue_improvement_job)
        worker.worktree_ready.connect(self._on_worktree_ready)
        worker.hook_notice.connect(self._on_hook_notice)
        worker.finished.connect(thread.quit)
        worker.failed.connect(thread.quit)
        self._thread = thread
        self._worker = worker
        thread.start()
        self._run_active = True
        return True

    @Slot(str)
    @traces(SWR.SWR_2701, SWR.SWR_2704)
    def _on_hook_notice(self, message: str) -> None:
        """Surface a hook advisory as a persistent warning the user can act on.

        Persistent on purpose: "your hooks did not run" outlives a toast, and a
        user who cannot tell a blocked hook from a broken one will conclude the
        feature is broken.

        Written straight to the store rather than re-emitted for the window to
        relay: a run handle may sit behind a coordinator that owns the window's
        signal wiring, and a notice that only some hosts forward is a notice the
        user sometimes does not get.
        """
        if not message or self._shutting_down:
            return
        from rotaris.models.state import NoticeSeverity, UiNotice

        self.store.publish_notice(
            UiNotice(
                id=self.store.new_notice_id(),
                severity=NoticeSeverity.WARNING,
                title="Lifecycle hooks need your attention",
                message=message,
                persistent=True,
                action_label="Open hook settings",
                action_id="settings.hooks",
            )
        )

    @Slot(str, str)
    @traces(SWR.SWR_2415)
    def _on_worktree_ready(self, session_id: str, branch: str) -> None:
        """Publish the resolved branch before the agent begins work."""
        self._session_id = session_id
        self.worktree_resolved.emit(session_id, branch)

    def steer(self, agent_id: str, text: str) -> bool:
        if not self.running or not agent_id or not text.strip():
            return False
        from rotaris_core.api.prompts import prompt_api

        prompt_api.submit_steering(agent_id, text.strip())
        return True

    @traces(SWR.SWR_2434)
    def queue_prompt(self, text: str) -> str:
        """Queue a follow-up owned by — and only consumable by — this run."""
        if not self.running or not text.strip():
            return ""
        from rotaris_core.api.prompts import prompt_api

        return prompt_api.submit_queued(
            text.strip(),
            {"session_id": self._session_id},
            session_id=self._session_id,
        )

    def edit_queued_prompt(self, prompt_id: str, text: str) -> bool:
        if not self.running or not prompt_id or not text.strip():
            return False
        from rotaris_core.api.prompts import prompt_api

        try:
            prompt_api.update_queued(prompt_id, text)
        except (KeyError, ValueError):
            return False
        return True

    def delete_queued_prompt(self, prompt_id: str) -> bool:
        if not self.running or not prompt_id:
            return False
        from rotaris_core.api.prompts import prompt_api

        try:
            prompt_api.unqueue(prompt_id)
        except (KeyError, ValueError):
            return False
        return True

    def cancel_agent(self, agent_id: str) -> bool:
        if not self.running:
            return False
        if agent_id == "orchestrator":
            self.cancel()
            return True
        return self._worker.cancel_agent(agent_id) if self._worker is not None else False

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        """Stop the check the verifier is running, leaving the run active.

        Returns False when nothing is being verified, so a host may wire this
        to an always-present control without tracking the phase itself.
        """
        if not self.running or self._worker is None:
            return False
        return self._worker.skip_verifier_check()

    def pause(self) -> bool:
        """Ask the run to finish its current step, then stop (graceful — as
        opposed to :meth:`cancel`, which cancels the run task outright)."""
        if not self.running or self._worker is None:
            return False
        return self._worker.pause()

    def pause_agent(self, agent_id: str) -> bool:
        """Graceful pause only applies to the whole run (orchestrator node) —
        there's no per-child equivalent, mirroring the TUI's loop-level /pause."""
        if agent_id != "orchestrator":
            return False
        return self.pause()

    def switch_entry_model(self, model_key: str) -> bool:
        """Point the active run's entry persona at another model.

        Takes effect from the next Ralph iteration (each iteration spawns a
        fresh entry agent); the in-flight iteration finishes on its current
        model. Used to switch back to the primary model after the user
        re-authenticated its provider while the run continued on the fallback.
        """
        if not self.running or self._worker is None or not model_key:
            return False
        return self._worker.switch_entry_model(model_key)

    def switch_entry_reasoning(self, reasoning: str) -> bool:
        """Point the active run's entry persona at another reasoning level.

        Takes effect from the next Ralph iteration (each iteration spawns a
        fresh entry agent); the in-flight iteration finishes on its current
        reasoning. Used to change entry-agent reasoning without restarting the
        run.
        """
        if not self.running or self._worker is None or not reasoning:
            return False
        return self._worker.switch_entry_reasoning(reasoning)

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    def set_permission_mode(self, mode: str) -> bool:
        """Switch the active run's permission mode (SWR-2503 mid-session change).

        Unlike the model and reasoning switches, this does not wait for the next
        Ralph iteration: it re-points the policy of every engine already built
        for this session, so the run's very next tool call is judged under the
        new mode. Returns ``False`` when there is no run to change.
        """
        if not self.running or self._worker is None or not mode:
            return False
        return self._worker.set_permission_mode(mode)

    def force_compress(self) -> bool:
        """Request context compression for every currently active conversation."""
        if not self.running or self._worker is None:
            return False
        return self._worker.force_compress()

    def clear_transcript(self) -> bool:
        """Clear and persist transcript state on the active run loop."""
        if not self.running or self._worker is None:
            return False
        return self._worker.clear_transcript()

    def edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str = "",
    ) -> bool:
        """Write a desktop todo edit into the active agent's live list."""
        if not self.running or self._worker is None:
            return False
        return self._worker.edit_todo(operation, target_id, text)

    def cancel(self) -> None:
        if self._worker is not None:
            self._worker.cancel_pending_questions()
            self._worker.cancel_pending_approvals()
            self._worker.cancel()

    def shutdown(self) -> None:
        self._shutting_down = True
        self._poller.stop()
        self._refresh_pending = False
        self._refresh_pending_final = False
        self._final_completion = None
        self.cancel()
        self._queued_improvement_jobs.clear()
        self._cancel_improvement_collection()
        if self._thread is not None and self._thread.isRunning():
            self._thread.quit()
        # App shutdown must not destroy the QThread while its worker is still
        # unwinding an uninterruptible SDK/network call.
        self._join_thread(timeout_ms=None)
        self._stop_refresh_worker()
        self._set_improvement_active(False)

    @traces(SWR.SWR_2415)
    def _set_improvement_active(self, active: bool) -> None:
        """Publish this handle's improvement activity.

        Handles that share a window with other runs hand ownership of the
        indicator to the coordinator, which ORs every handle together — one run
        finishing its analysis must not clear another run's indicator.
        """
        self._improvement_active = active
        if self.owns_improvement_indicator:
            self.store.set_improvement_collection_active(active)
        self.improvement_activity_changed.emit(active)

    @property
    def improvement_active(self) -> bool:
        """True while this handle has improvement analysis queued or running."""
        return self._improvement_active

    @Slot(object)
    @traces(SWR.SWR_2414)
    def _queue_improvement_job(self, job: object) -> None:
        """Run terminal improvement analysis separately from the task worker."""
        if self._shutting_down:
            cancel = getattr(job, "request_cancel", None)
            if callable(cancel):
                cancel()
            return
        self._queued_improvement_jobs.append(job)
        self._set_improvement_active(True)
        self._start_next_improvement_job()

    def _start_next_improvement_job(self) -> None:
        if self._shutting_down or self._improvement_thread is not None:
            return
        if not self._queued_improvement_jobs:
            self._set_improvement_active(False)
            return

        job = self._queued_improvement_jobs.pop(0)
        thread = QThread(self)
        worker = _ImprovementWorker(job)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.completed.connect(thread.quit)
        worker.failed.connect(thread.quit)
        worker.completed.connect(self._on_improvement_completed)
        worker.failed.connect(self._on_improvement_failed)
        thread.finished.connect(worker.deleteLater)
        thread.finished.connect(self._on_improvement_thread_finished)
        self._improvement_thread = thread
        self._improvement_worker = worker
        thread.start()

    def _cancel_improvement_collection(self) -> None:
        worker = self._improvement_worker
        if worker is not None:
            worker.cancel()
        thread = self._improvement_thread
        if thread is not None and thread.isRunning():
            thread.quit()
            thread.wait()
        self._improvement_worker = None
        self._improvement_thread = None

    @Slot(object)
    def _on_improvement_completed(self, result: object) -> None:
        if self._shutting_down:
            return

        cancelled = bool(getattr(result, "cancelled", False))
        artifact_id = getattr(result, "artifact_id", None)
        proposal_count = int(getattr(result, "proposal_count", 0))
        if artifact_id is not None:
            self.config_service.refresh_improvement_proposals()
            if not cancelled:
                from rotaris.models.state import NoticeSeverity, UiNotice

                if proposal_count:
                    suffix = "proposal" if proposal_count == 1 else "proposals"
                    self.store.publish_notice(
                        UiNotice(
                            id=self.store.new_notice_id(),
                            severity=NoticeSeverity.SUCCESS,
                            title=f"{proposal_count} improvement {suffix} ready",
                            persistent=True,
                            action_label="Review proposals",
                            action_id="library.proposals",
                        )
                    )
                else:
                    self.store.publish_notice(
                        UiNotice(
                            id=self.store.new_notice_id(),
                            severity=NoticeSeverity.INFO,
                            title="Improvement analysis complete — no proposals",
                            persistent=True,
                        )
                    )

    @Slot(str)
    def _on_improvement_failed(self, _message: str) -> None:
        if self._shutting_down:
            return

    @Slot()
    def _on_improvement_thread_finished(self) -> None:
        thread = self._improvement_thread
        if thread is not None:
            # QThread.finished precedes the final OS-thread join by a moment;
            # keep the Python wrapper alive until that join is complete.
            thread.wait()
        self._improvement_worker = None
        self._improvement_thread = None
        if not self._shutting_down:
            self._start_next_improvement_job()

    @Slot(str)
    def _on_started(self, session_id: str) -> None:
        self._session_id = session_id
        self._ensure_refresh_worker()
        self._poller.start()
        self.run_started.emit(session_id)

    @Slot(str)
    def _on_finished(self, status: str) -> None:
        self._run_active = False
        self._poller.stop()
        self._begin_final_refresh("finished", status)

    @Slot(str)
    def _on_failed(self, message: str) -> None:
        self._run_active = False
        self._poller.stop()
        self._begin_final_refresh("failed", message)

    @Slot()
    def _poll(self) -> None:
        with self.diagnostics.span("RunBridge._poll"):
            self.sync_queued_prompts()
            if not self._session_id:
                return
            self._request_refresh()

    def _ensure_refresh_worker(self) -> None:
        if self._refresh_thread is not None:
            return
        config = self.config_service.config
        if config is None:
            raise RuntimeError("Cannot start session refresh before configuration is loaded")
        thread = QThread(self)
        worker = _SessionRefreshWorker(self.workspace, config)
        worker.moveToThread(thread)
        self._refresh_requested.connect(worker.refresh)
        worker.completed.connect(self._on_refresh_completed)
        worker.failed.connect(self._on_refresh_failed)
        thread.finished.connect(worker.deleteLater)
        self._refresh_thread = thread
        self._refresh_worker = worker
        thread.start()

    def _stop_refresh_worker(self) -> None:
        thread = self._refresh_thread
        if thread is None:
            return
        thread.quit()
        thread.wait()
        thread.deleteLater()
        self._refresh_thread = None
        self._refresh_worker = None
        self._refresh_busy = False

    def _request_refresh(self, *, final: bool = False) -> None:
        if not self._session_id or self._shutting_down:
            return
        if self._refresh_busy:
            self._refresh_pending = True
            self._refresh_pending_final = self._refresh_pending_final or final
            return
        self._ensure_refresh_worker()
        self._refresh_generation += 1
        self._refresh_inflight_generation = self._refresh_generation
        self._refresh_inflight_final = final
        self._refresh_busy = True
        self._refresh_requested.emit(
            self._session_id,
            self._refresh_generation,
            self.config_service.projection_context(),
        )

    @Slot(str, int, object, float, float)
    def _on_refresh_completed(
        self,
        session_id: str,
        generation: int,
        projection: object,
        load_ms: float,
        projection_ms: float,
    ) -> None:
        if generation != self._refresh_inflight_generation:
            return
        was_final = self._refresh_inflight_final
        self._refresh_busy = False
        recorder = getattr(self.diagnostics, "record_duration", None)
        if recorder is not None:
            recorder("session.load", load_ms)
            recorder("session.projection", projection_ms)
        if session_id == self._session_id and not self._shutting_down:
            typed = cast("SessionProjection", projection)
            # A background run keeps refreshing its own snapshot, but only the
            # focused handle may rewrite the shared transcript/agents/KPIs.
            if self.projection_enabled:
                self.config_service.apply_session_projection(typed)
                self.store_updated.emit()
            self.session_summary.emit(
                session_id,
                str(getattr(typed, "session_status", "") or ""),
                str(getattr(typed, "worktree_branch", "") or ""),
            )
        if self._refresh_pending:
            pending_final = self._refresh_pending_final
            self._refresh_pending = False
            self._refresh_pending_final = False
            self._request_refresh(final=pending_final)
        elif was_final:
            self._complete_run_signal()

    @Slot(str, int, str)
    def _on_refresh_failed(self, session_id: str, generation: int, message: str) -> None:
        del session_id
        if generation != self._refresh_inflight_generation:
            return
        was_final = self._refresh_inflight_final
        self._refresh_busy = False
        if self._refresh_pending:
            pending_final = self._refresh_pending_final
            self._refresh_pending = False
            self._refresh_pending_final = False
            self._request_refresh(final=pending_final)
            return
        if was_final and self._final_refresh_attempts < 3:
            QTimer.singleShot(100, self._request_final_refresh_attempt)
            return
        if was_final:
            self.refresh_failed.emit(f"Final session refresh failed after 3 attempts: {message}")
            self._complete_run_signal()

    @traces(SWR.SWR_2507)
    def _begin_final_refresh(self, kind: str, payload: str) -> None:
        self._final_completion = (kind, payload)
        self._final_refresh_attempts = 0
        if not self._session_id:
            # The run failed before it announced a session — a refused sandbox
            # (SWR-2507), a lock it could not take — so there is no snapshot to
            # read back. Report it now: _request_refresh drops a refresh with no
            # session id, which would leave the failure unreported *and* the
            # handle pinned by an unfinished completion.
            self._complete_run_signal()
            return
        self._request_final_refresh_attempt()

    def _request_final_refresh_attempt(self) -> None:
        if self._final_completion is None or self._shutting_down:
            return
        self._final_refresh_attempts += 1
        self._request_refresh(final=True)

    def _complete_run_signal(self) -> None:
        completion = self._final_completion
        if completion is None:
            return
        self._final_completion = None
        self.config_service.refresh_sessions()
        self.config_service.refresh_improvement_proposals()
        self._stop_refresh_worker()
        kind, payload = completion
        if kind == "finished":
            self.run_finished.emit(payload)
        else:
            self.run_failed.emit(payload)

    @traces(SWR.SWR_2434)
    def sync_queued_prompts(self) -> None:
        """Refresh desktop queue from thread-safe backend registry state.

        Scoped to this handle's session once it has one, and written to the
        store only while this handle is the focused run — a background run must
        not replace the focused run's visible queue.
        """
        if not self.projection_enabled:
            return
        from rotaris_core.api.prompts import prompt_api
        from rotaris_core.core.prompt_types import QueuedStatus

        from rotaris.models.state import QueuedPromptItem

        pending = [
            QueuedPromptItem(prompt.id, prompt.content)
            for prompt in prompt_api.list_queued(self._session_id or None)
            if prompt.status is QueuedStatus.QUEUED
        ]
        self.store.set_queued_prompts(pending)

    def _join_thread(self, *, timeout_ms: int | None = 5000) -> bool:
        """Join and release the worker thread — the only place thread refs die.

        Thread/worker references are deliberately NOT cleared from a
        ``thread.finished`` slot: that delivery is queued, so it can land after
        a new run has already started and would then null the new run's worker
        (destroying its C++ object before its queued ``run`` slot executes —
        the run silently never starts). Instead the previous run is reaped
        synchronously here, called only from ``start`` and ``shutdown``.

        The join itself matters too: ``finished`` fires when the thread's event
        loop stops, but the OS thread winds down a moment later. Destroying the
        bridge (the QThread's C++ parent) in that window is a Qt process abort
        ("QThread: Destroyed while thread is still running"). After ``finished``
        this wait is a microsecond-level join. Normal restarts use a 5s cap;
        app shutdown waits until completion because destroying a live QThread
        aborts the process.
        """
        thread = self._thread
        if thread is None:
            return True
        joined = thread.wait() if timeout_ms is None else thread.wait(timeout_ms)
        if not joined:
            return False
        self._thread = None
        self._worker = None
        return True


class _SessionRefreshWorker(QObject):
    """Read and project persisted state without occupying the Qt event loop."""

    completed = Signal(str, int, object, float, float)
    failed = Signal(str, int, str)

    def __init__(self, workspace: Path, config: Any) -> None:
        super().__init__()
        from rotaris.services.session_projection import SessionProjectionReader

        self._reader = SessionProjectionReader(workspace, config)

    @Slot(str, int, object)
    def refresh(self, session_id: str, generation: int, context: object) -> None:
        try:
            result = self._reader.read(
                session_id,
                cast("SessionProjectionContext", context),
            )
        except Exception as exc:
            self.failed.emit(session_id, generation, str(exc))
            return
        self.completed.emit(
            session_id,
            generation,
            result.projection,
            result.load_ms,
            result.projection_ms,
        )


@traces(SWR.SWR_2414)
class _ImprovementWorker(QObject):
    """Own one optional collector job on its own cancellable Qt worker thread."""

    completed = Signal(object)
    failed = Signal(str)

    def __init__(self, job: object) -> None:
        super().__init__()
        self._job = job
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[Any] | None = None

    @Slot()
    def run(self) -> None:
        try:
            result = asyncio.run(self._execute())
        except asyncio.CancelledError:
            self.completed.emit(SimpleNamespace(artifact_id=None, proposal_count=0, cancelled=True))
        except Exception as exc:  # noqa: BLE001
            self.failed.emit(str(exc))
        else:
            self.completed.emit(result)

    async def _execute(self) -> object:
        self._loop = asyncio.get_running_loop()
        self._task = asyncio.current_task()
        try:
            return await cast("Any", self._job).run()
        finally:
            self._task = None
            self._loop = None

    def cancel(self) -> None:
        cancel = getattr(self._job, "request_cancel", None)
        if callable(cancel):
            cancel()
        loop, task = self._loop, self._task
        if loop is not None and task is not None and not task.done():
            loop.call_soon_threadsafe(task.cancel)


@traces(SWR.SWR_2507)
def _sandbox_verdict(run_config: Any) -> tuple[bool, str]:
    """``(sandboxed, backend name)`` for the config this run really launched with.

    Raises :class:`SandboxUnavailableError` when the config asks for a sandbox
    the host cannot provide, because SWR-2507 forbids downgrading that session
    to unsandboxed execution.

    The verdict comes from :func:`ensure_sandbox_available` rather than a second
    :func:`sandbox_status` call: one host probe decides both whether the run may
    start and what the snapshot records, so the two can never disagree, and the
    raised error carries the reason and remediation the window has to show.
    """
    from rotaris_core.sandbox.session import ensure_sandbox_available, resolve_sandbox_spec

    # ``workspace_root`` is read leniently: an ``off`` config never reaches a
    # path that needs it, and a host that hands the worker a duck-typed config
    # must not fail a run that asked for no sandbox at all.
    spec = resolve_sandbox_spec(run_config, getattr(run_config, "workspace_root", ""))
    if spec is None:
        return (False, "")
    return (True, ensure_sandbox_available(spec).name)


class _RunWorker(QObject):
    started = Signal(str)
    finished = Signal(str)
    failed = Signal(str)
    compression_finished = Signal(int, str)
    improvement_job_ready = Signal(object)
    #: session id, resolved worktree branch — emitted once isolation is set up
    #: and always before the agent starts working.
    worktree_ready = Signal(str, str)
    #: A hook advisory this run has to show the user (SWR-2701, SWR-2704).
    #: Never carries a hook's command text.
    hook_notice = Signal(str)

    def __init__(
        self,
        workspace: Path,
        config: Any,
        prompt: str,
        session_id: str | None,
        delegation_strategy: str,
        isolation: Any | None = None,
        *,
        new_session_id: str | None = None,
    ) -> None:
        super().__init__()
        self.workspace = workspace
        self.config = config
        self.prompt = prompt
        self.session_id = session_id
        self.delegation_strategy = delegation_strategy
        self.isolation = isolation
        self.new_session_id = new_session_id
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[Any] | None = None
        self._observer: _SessionObserver | None = None
        self._failure_detail = ""
        # Session whose approval host this worker registered (SWR-2504); kept
        # separate from ``session_id`` because a fresh run only learns its id
        # once the session exists.
        self._approval_session_id = ""
        # The config this run actually launched with (worktree-adjusted); the
        # mid-run mode change (SWR-2503) must re-resolve against it, not the
        # pre-launch copy.
        self._run_config: Any | None = None

    @Slot()
    def run(self) -> None:
        try:
            status = asyncio.run(self._execute())
        except Exception as exc:
            self.failed.emit(str(exc))
        else:
            if status == "failed":
                # RalphLoop caught the run's exception internally and only
                # summarized it into the progress file ("Run failed: ...").
                # Route it through `failed` so the window runs the same
                # recovery (fallback retry + reauth prompt) as for raised
                # exceptions — otherwise in-run auth failures end the session
                # with a plain "failed" toast and no recovery.
                self.failed.emit(self._failure_detail or "Run failed.")
            else:
                self.finished.emit(status)

    async def _execute(self) -> str:
        # The default 10s persistence debounce is tuned for headless/background
        # runs. Rotaris polls the persisted snapshot every 750ms to drive a
        # live view, so a 10s debounce made streaming look "stuck then bursty"
        # — batches of transcript/child-state changes would land all at once.
        from rotaris_core.cli.background import _run_task, config_for_session_worktree
        from rotaris_core.session.manager import SessionManager

        manager = SessionManager(self.workspace, persist_debounce_seconds=0.5)
        post_run_improvement_job: object | None = None

        def capture_post_run_improvement_job(job: object | None) -> None:
            nonlocal post_run_improvement_job
            post_run_improvement_job = job

        run_config = self.config
        if self.session_id:
            from rotaris_core.session.recovery import settle_orphaned_children

            state = manager.load_session(self.session_id)
            if not manager.acquire_lock(self.session_id):
                raise RuntimeError(f"Unable to acquire session lock: {self.session_id}")
            # The lock is ours and nothing of this run has started, so a record
            # still claiming to run belongs to a run that is gone (SWR-3714).
            # Left un-settled, the previous run's agents come back as live rows
            # in the tree the continuation is about to add to.
            settle_orphaned_children(state)
            run_config = config_for_session_worktree(run_config, manager, state)
        else:
            state = manager.create_session(
                run_config,
                session_id=self.new_session_id or getattr(self.isolation, "session_id", None),
            )
            try:
                if self.isolation is not None:
                    from rotaris_core.session.worktrees import GitWorktreeService

                    service = GitWorktreeService(
                        manager.workspace_root,
                        storage_subpath=run_config.worktree_storage_subpath,
                    )
                    if getattr(self.isolation, "create", True):
                        # Parallel launches routinely collide on the requested
                        # branch; the service resolves a free variant instead of
                        # failing the run.
                        state.worktree = service.create_for_session_unique(
                            state.session_id,
                            getattr(self.isolation, "branch", None),
                        )
                    else:
                        path = getattr(self.isolation, "path", None)
                        if path is None:
                            raise RuntimeError("An existing worktree path is required.")
                        state.worktree = service.attach_existing(path)
                    run_config = config_for_session_worktree(run_config, manager, state)
                    state.config_snapshot = run_config.model_dump(mode="json")
                    await manager.persister.flush(state)
            except Exception:
                manager.release_lock(state.session_id)
                manager.persistence.delete_session(state.session_id)
                raise
        self._run_config = run_config
        try:
            sandboxed, sandbox_backend = _sandbox_verdict(run_config)
        except Exception:
            # SWR-2507: a session that asked for a sandbox it cannot get must
            # fail visibly, never quietly run on the host. Same cleanup as the
            # worktree failure above — release the lock, drop a session this
            # run created — then re-raise so the window reports the backend's
            # own reason and remediation. Raised before ``started`` is emitted,
            # so the loop is never entered.
            manager.release_lock(state.session_id)
            if not self.session_id:
                # Only a session this run created; a resumed one is the user's
                # history and must survive a failed launch.
                manager.persistence.delete_session(state.session_id)
            raise
        state.sandboxed = sandboxed
        state.sandbox_backend = sandbox_backend
        worktree = getattr(state, "worktree", None)
        self.worktree_ready.emit(state.session_id, getattr(worktree, "branch", "") or "")
        self.started.emit(state.session_id)
        state.execution_status = "running"
        # All run writes must go through the persister: it serializes with its
        # own in-flight debounced writes. A bare manager.flush_session here can
        # collide with a debounced asyncio.to_thread write on the same snapshot
        # files (os.replace on Windows raises PermissionError on that race).
        await manager.persister.flush(state)
        self._loop = asyncio.get_running_loop()
        self._task = asyncio.current_task()
        # Outside the try, and paired with ``discard()`` in its ``finally``: the
        # hook runner has to be registered before the first agent is built, and
        # the tool-hook gate resolves it by session id from inside that agent.
        extras = install_run_lifecycle_extras(
            config=run_config,
            session_manager=manager,
            state=state,
        )
        # Same placement and the same reason as the extras above: attached
        # outside the try so nothing this run publishes can predate the store,
        # and paired with ``discard_run_event_store`` in the ``finally`` below.
        install_run_event_store(session_manager=manager, session_id=state.session_id)
        # Terminal-result inputs, declared here so the ``finally`` can build the
        # run's ``result`` event on every exit path — completion, cancellation
        # and failure alike.
        progress: Any = None
        run_error: str | None = None
        interrupted = False
        try:
            if extras.notice:
                self.hook_notice.emit(extras.notice)
            observer = _SessionObserver(asyncio.get_running_loop(), manager, state)
            self._observer = observer
            self._register_approval_host(observer, state.session_id)
            run_task_kwargs: dict[str, Any] = {
                "iteration_observer": observer,
                "delegation_strategy": self.delegation_strategy,
            }
            # Test doubles and external hosts that retain the old runner
            # signature still execute the task path; the real shared runner
            # receives the terminal-job hand-off.
            parameters = inspect.signature(_run_task).parameters
            if "post_run_improvement_job_sink" in parameters:
                run_task_kwargs["post_run_improvement_job_sink"] = capture_post_run_improvement_job
            if extras.observers and accepts_extra_observers(_run_task):
                run_task_kwargs["extra_observers"] = extras.observers
            # Unconditional, for the reason SWR-2901 makes it unconditional in
            # ``run_host.execute_run``: the loop's iteration, child and tool
            # events are what the store persists, so leaving them off would
            # attach a store to a run that emits almost nothing into it. The
            # flag switches the channel only — the desktop still reads its live
            # view from the persisted snapshot, not from the stream.
            if accepts_keyword(_run_task, "stream_events"):
                run_task_kwargs["stream_events"] = True
            progress = await _run_task(
                self.prompt,
                run_config,
                manager,
                state,
                run_config.runtime.max_iterations,
                **run_task_kwargs,
            )
            from rotaris_core.ralph.state import summarize_run_progress

            status, summary, _severity = summarize_run_progress(progress)
            state.execution_status = status
            self._failure_detail = summary if status == "failed" else ""
            state.transcript_events.append({"role": "system", "content": summary})
            await manager.persister.flush(state)
            if post_run_improvement_job is not None:
                self.improvement_job_ready.emit(post_run_improvement_job)
        except asyncio.CancelledError:
            interrupted = True
            state.execution_status = "paused"
            state.transcript_events.append(
                {"role": "system", "content": "Run paused from Rotaris."}
            )
            await manager.persister.flush(state)
        except Exception as exc:
            from rotaris_core.llm_errors import format_llm_runtime_error

            # The same rendering the headless hosts put in ``RunResult.error``,
            # so the stored outcome of a failed desktop run reads identically.
            run_error = format_llm_runtime_error(exc)
            state.execution_status = "failed"
            await manager.persister.flush(state)
            raise
        finally:
            from rotaris_core.permissions import discard_approval_host

            discard_approval_host(self._approval_session_id)
            self._approval_session_id = ""
            # Read before discarding: the disabled-hook tally lives on the
            # runner, and discard() drops the reference to it.
            finish_notice = extras.finish_notice()
            # Every exit path, cancellation and failure included: a runner left
            # registered would fire this session's hooks on the next run.
            extras.discard()
            if finish_notice:
                self.hook_notice.emit(finish_notice)
            # Published while the bus registration is still live, and only then
            # torn down: the ``result`` event is the half that proves the run
            # ended, and a stored session without it cannot be told apart from
            # one whose process was killed mid-run.
            #
            # Ordered *before* ``release_lock`` deliberately. Every other
            # statement in this block swallows its own failures; releasing a
            # session lock does not, and on Windows it is a documented raiser
            # (see the persister note above). A raise there would cost the run
            # its terminal event and leave both the sink and the store
            # registered for this session id for the life of the process — so
            # the next event published under it would append to a session that
            # is already over, which is precisely the ambiguity this pair
            # exists to prevent.
            publish_terminal_run_result(
                state=state,
                progress=progress,
                error=run_error,
                interrupted=interrupted,
            )
            discard_run_event_store(state.session_id)
            manager.release_lock(state.session_id)
            self._task = None
            self._loop = None
            self._observer = None
        return state.execution_status

    @traces(SWR.SWR_2504)
    def _register_approval_host(self, observer: _SessionObserver, session_id: str) -> None:
        """Make this run's ``ask`` decisions resolvable from the desktop UI.

        Registered before the run starts so every agent built during it — root,
        child, nested — resolves an interactive host rather than the fail-safe
        deny path.
        """
        from rotaris_core.permissions import ApprovalHost, register_approval_host

        register_approval_host(
            session_id,
            ApprovalHost(
                present=observer.present_approval,
                dismiss=observer.dismiss_approval,
            ),
        )
        self._approval_session_id = session_id

    def cancel(self) -> None:
        loop, task = self._loop, self._task
        if loop is not None and task is not None and not task.done():
            loop.call_soon_threadsafe(task.cancel)

    def cancel_pending_questions(self) -> None:
        """Release synchronous tool waits before cancelling the async run."""
        ralph = self._observer.ralph if self._observer is not None else None
        if ralph is not None:
            ralph.scheduler.user_prompt_barrier.cancel_all()

    @traces(SWR.SWR_2504)
    def cancel_pending_approvals(self) -> None:
        """Release dispatches blocked on an approval so the run can stop."""
        from rotaris_core.permissions import resolve_approval_host

        host = resolve_approval_host(self._approval_session_id)
        if host is not None:
            host.barrier.cancel_all()

    def pause(self) -> bool:
        # RalphLoop.request_shutdown is documented as safe to call from the
        # UI thread directly (it dispatches its own daemon-thread work) — the
        # same pattern the TUI uses from its synchronous action handlers.
        ralph = self._observer.ralph if self._observer is not None else None
        if ralph is None:
            return False
        ralph.request_shutdown(force=False)
        return True

    def cancel_agent(self, agent_id: str) -> bool:
        return self._observer.cancel_agent(agent_id) if self._observer is not None else False

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        return self._observer.skip_verifier_check() if self._observer is not None else False

    def switch_entry_model(self, model_key: str) -> bool:
        observer = self._observer
        if observer is None:
            return False
        observer.switch_entry_model(model_key)
        return True

    def switch_entry_reasoning(self, reasoning: str) -> bool:
        observer = self._observer
        if observer is None:
            return False
        observer.switch_entry_reasoning(reasoning)
        return True

    @traces(SWR.SWR_2503, SWR.SWR_2506, SWR.SWR_2508, SWR.SWR_2509)
    def set_permission_mode(self, mode: str) -> bool:
        """Switch the live run to *mode*, effective from its next tool call.

        Runs synchronously on the calling (GUI) thread rather than hopping to
        the run's loop: dispatches happen on SDK worker threads, so hopping
        would let calls in between be judged under the old mode. The registries
        it touches are lock-guarded and ``set_policy`` re-reads nothing eagerly.
        """
        from rotaris_core.permissions import change_session_permission_mode

        observer, session_id = self._observer, self._approval_session_id
        if observer is None or not session_id:
            return False
        effective = change_session_permission_mode(
            session_id,
            mode,
            config=self._run_config or self.config,
        )
        observer.apply_permission_mode(effective)
        return True

    def force_compress(self) -> bool:
        loop, observer = self._loop, self._observer
        ralph = observer.ralph if observer is not None else None
        scheduler = getattr(ralph, "scheduler", None)
        if loop is None or scheduler is None:
            return False
        conversation_lock = getattr(scheduler, "_conversation_lock", None)
        active_map = getattr(scheduler, "_active_conversations", None)
        if conversation_lock is None or not isinstance(active_map, dict):
            return False
        with conversation_lock:
            conversations = dict(active_map)
        if not conversations:
            return False

        future = asyncio.run_coroutine_threadsafe(
            self._compress_conversations(scheduler, conversations),
            loop,
        )

        def done(result: Any) -> None:
            try:
                success_count, errors = result.result()
            except Exception as exc:  # noqa: BLE001
                self.compression_finished.emit(0, str(exc))
            else:
                self.compression_finished.emit(success_count, errors)

        future.add_done_callback(done)
        return True

    def clear_transcript(self) -> bool:
        observer = self._observer
        if observer is None:
            return False
        observer.clear_transcript()
        return True

    def edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str = "",
    ) -> bool:
        observer = self._observer
        if observer is None:
            return False
        return observer.edit_todo(operation, target_id, text)

    async def _compress_conversations(
        self,
        scheduler: Any,
        conversations: dict[str, Any],
    ) -> tuple[int, str]:
        from rotaris_core.orchestrator.scheduler_compression import force_compress_child

        async def compress_one(name: str, conversation: Any) -> tuple[str, Exception | None]:
            try:
                await force_compress_child(scheduler, name, conversation)
            except Exception as exc:  # noqa: BLE001
                return name, exc
            return name, None

        results = await asyncio.gather(
            *(compress_one(name, conversation) for name, conversation in conversations.items())
        )
        errors = [f"{name}: {error}" for name, error in results if error is not None]
        return len(results) - len(errors), "; ".join(errors)


@traces(SWR.SWR_2428)
def _is_terminal_tool(tool_name: str) -> bool:
    """True for the shell tool under any of the names it has been called."""
    return tool_name.strip().lower() in {"terminal", "bash"}


@traces(SWR.SWR_2615)
def _gate_warning_for(result: Any) -> str:
    """The "no quality gate" sentence this run reported, or "".

    Read off the run rather than composed here. The verifier owns the sentence
    for the same reason it owns the verdict: a host that phrased it itself would
    eventually phrase it differently from the child report describing the same
    run — and the desktop is deliberately not allowed to reach into the verifier
    to ask.
    """
    return str(getattr(result, "gate_warning", "") or "")


class _SessionObserver:
    """Persist scheduler snapshots for the GUI poller without touching Qt."""

    #: Tells the shared backend runner (cli/background.py::_run_task) that this
    #: observer already streamed the transcript live, so it must not re-append
    #: per-iteration agent responses on top (they would duplicate in the chat).
    persists_transcript = True

    #: Caps for persisted chat payloads — snapshots rewrite every debounce tick.
    _TOOL_DETAIL_MAX = 400
    _TOOL_FULL_MAX = 2000
    _THINKING_MAX = 4000

    @staticmethod
    def _cap_full_text(text: str, *, preserve_lines: bool = False) -> str:
        """Truncate-with-ellipsis for the untruncated tool-row detail fields.

        Collapsing whitespace is right for a one-line summary and wrong for
        command output: a test run flattened into a single line is unreadable,
        and it is the persisted fallback a reloaded session renders from
        (SWR-2428).
        """
        if preserve_lines:
            text = "\n".join(line.rstrip() for line in text.splitlines())
        else:
            text = " ".join(text.split())
        if len(text) > _SessionObserver._TOOL_FULL_MAX:
            return text[: _SessionObserver._TOOL_FULL_MAX - 1].rstrip() + "…"
        return text

    def __init__(self, loop: asyncio.AbstractEventLoop, manager: Any, state: Any) -> None:
        self.loop = loop
        self.manager = manager
        self.state = state
        # Read by the backend's entry-model resolver on every agent spawn
        # (ralph/bootstrap.py::make_entry_model_resolver). The GUI thread
        # writes it via switch_entry_model; a plain attribute write is atomic,
        # so no lock is needed for this single-value handoff.
        self.entry_model_override: str | None = None
        self.entry_reasoning_override: str | None = None
        self.ralph: Any | None = None
        self._child_managers: dict[str, Any] = {}
        # Live row references (the dict objects inside state.transcript_events)
        # so streamed deltas / tool results update rows in place.
        self._stream_segments: dict[str, dict[str, Any]] = {}
        self._thinking_segments: dict[str, dict[str, Any]] = {}
        # Most recent thinking row per agent, kept past _finish_thinking so the
        # action event's complete reasoning_content can be folded into the
        # burst it repeats instead of duplicating it (SWR-2446).
        self._last_thinking_rows: dict[str, dict[str, Any]] = {}
        self._committed_message_segments: dict[str, dict[str, Any]] = {}
        self._tool_rows: dict[str, dict[str, Any]] = {}
        # Monotonic start per in-flight call (same key as _tool_rows) — kept
        # out of the persisted rows because the value is process-local.
        self._tool_started: dict[str, float] = {}
        # In-flight tool calls per agent (call_id → tool name) — drives the
        # inspector's "active tools" chips through the persisted child states.
        self._active_tool_calls: dict[str, dict[str, str]] = {}
        # SDK callbacks can replay an event while a conversation is being
        # resumed. Count each stable call ID once in the live session metrics.
        self._counted_tool_calls: set[str] = set()
        # The SDK can likewise replay a committed message event on resume.
        # Keep its stable event ID from creating a second transcript row.
        self._persisted_message_events: set[str] = set()
        # TodoExecutor invokes on_todo_state with its mutable state object.
        # Keep that exact reference so desktop edits affect next iteration.
        self._live_todo: Any | None = None
        # Live verifier rows keyed by "<iteration>:<index>", so a check that
        # settles updates the row it started rather than appending a new one
        # (SWR-2609). Same shape as ``_tool_rows``.
        self._verifier_rows: dict[str, dict[str, Any]] = {}
        # The running suite's control handle (SWR-2610), held only while a suite
        # is in flight so the GUI's Skip can never address a finished run.
        self._verifier_control: Any | None = None

    @traces(SWR.SWR_2434)
    def bind_ralph_loop(self, ralph: Any) -> None:
        self.ralph = ralph
        # Rotaris can run several loops at once against one registry, so each
        # loop may only consume the prompts queued against its own session.
        ralph.queued_prompt_session_id = getattr(self.state, "session_id", "") or ""

    def switch_entry_model(self, model_key: str) -> None:
        """Move the entry persona to ``model_key`` from the next iteration on."""
        import contextlib

        self.entry_model_override = model_key
        # RuntimeError: event loop already closed — the run ended; the override
        # still sticks for consistency but nothing is left to announce it to.
        with contextlib.suppress(RuntimeError):
            self.loop.call_soon_threadsafe(
                self._append_system_row,
                f"Switching to model {model_key} from the next iteration.",
            )

    def switch_entry_reasoning(self, reasoning: str) -> None:
        """Move the entry persona to ``reasoning`` from the next iteration on."""
        import contextlib

        self.entry_reasoning_override = reasoning
        with contextlib.suppress(RuntimeError):
            self.loop.call_soon_threadsafe(
                self._append_system_row,
                f"Switching to reasoning {reasoning} from the next iteration.",
            )

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    def apply_permission_mode(self, effective: EffectiveMode) -> None:
        """Announce a mid-run permission mode change in the session."""
        import contextlib

        with contextlib.suppress(RuntimeError):
            self.loop.call_soon_threadsafe(self._apply_permission_mode, effective)

    @traces(SWR.SWR_2509)
    def _apply_permission_mode(self, effective: EffectiveMode) -> None:
        """Write the mode change into the transcript, qualified by what it missed.

        The transcript row is the confirmation a desktop user actually reads, so
        it must never be broader than what happened (SWR-2509). A persona pin
        stricter than the chosen mode keeps that persona where it is, and an
        unqualified "changed to 'X'" would tell the user they had reined in — or
        loosened — agents that never moved.
        """
        self.state.permission_mode = effective.mode
        if effective.downgraded:
            self._append_system_row(effective.reason)
            return
        message = (
            f"Permission mode changed to '{effective.mode}' — it applies from the next tool call."
        )
        skipped = tuple(getattr(effective, "skipped_personas", ()) or ())
        if skipped:
            noun = "persona" if len(skipped) == 1 else "personas"
            names = ", ".join(skipped)
            message += (
                f" It does not apply to the {noun} {names}: their persona pin is "
                "stricter than the mode you chose."
            )
        self._append_system_row(message)

    def clear_transcript(self) -> None:
        self.loop.call_soon_threadsafe(self._clear_transcript)

    def _clear_transcript(self) -> None:
        self.state.transcript_events.clear()
        self._stream_segments.clear()
        self._thinking_segments.clear()
        self._last_thinking_rows.clear()
        self._committed_message_segments.clear()
        self._tool_rows.clear()
        self._tool_started.clear()
        self._verifier_rows.clear()
        self.manager.persister.request_save(self.state)

    def _append_system_row(self, content: str) -> None:
        self._append_row({"role": "system", "content": content})
        self.manager.persister.request_save(self.state)

    # ── verification phase (SWR-2609 / SWR-2610) ──────────────────────────
    #
    # These hooks are invoked by the Ralph loop on its own event-loop thread,
    # the same thread that owns ``self.state``, so they write the snapshot
    # directly instead of marshalling like the GUI-thread entry points below.

    @traces(SWR.SWR_2609)
    def on_verifier_started(self, iteration_num: int, suite: Any, control: Any) -> None:
        """Announce that the workspace's own checks are what the run now waits on."""
        del iteration_num
        self._verifier_control = control
        checks = list(getattr(suite, "checks", ()) or ())
        self.state.verifier_state = {
            "active": True,
            "check": "",
            "command": "",
            "index": 0,
            "total": len(checks),
            "started_at": time.time(),
            "deadline_s": 0.0,
        }
        self.manager.persister.request_save(self.state)

    @traces(SWR.SWR_2609)
    def on_verifier_check_started(
        self,
        iteration_num: int,
        check: Any,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        """Open a live row for one check and point the header at it."""
        name = str(getattr(check, "name", "") or "check")
        command = str(getattr(check, "command", "") or "")
        started = time.time()
        self.state.verifier_state = {
            "active": True,
            "check": name,
            "command": command,
            "index": index,
            "total": total,
            "started_at": started,
            "deadline_s": float(deadline_s),
        }
        row = self._append_row(
            {
                "role": "verifier",
                "name": "verifier",
                "persona": "verifier",
                "tool": name,
                "content": command,
                "detail": "",
                "full_text": self._cap_full_text(command),
                "full_detail": "",
                "tool_event_key": f"verify:{iteration_num}:{index}",
                "tool_terminal": False,
                "status": "running",
                "started_at": started,
            }
        )
        self._verifier_rows[f"{iteration_num}:{index}"] = row
        self.manager.persister.request_save(self.state)

    @traces(SWR.SWR_2609, SWR.SWR_2610)
    def on_verifier_check_finished(
        self,
        iteration_num: int,
        result: Any,
        index: int,
        total: int,
    ) -> None:
        """Settle the check's row on its own outcome, not on the suite's."""
        del total
        row = self._verifier_rows.pop(f"{iteration_num}:{index}", None)
        status = str(getattr(result, "status", "") or "")
        detail = str(getattr(result, "skip_reason", "") or "") or str(
            getattr(result, "output_excerpt", "") or ""
        )
        full_detail = self._cap_full_text(detail)
        capped = full_detail
        if len(capped) > self._TOOL_DETAIL_MAX:
            capped = capped[: self._TOOL_DETAIL_MAX - 1].rstrip() + "…"
        if row is None:
            # A check that was never announced (permission denial, or a suite
            # whose budget ran out before it started) still deserves a row.
            row = self._append_row(
                {
                    "role": "verifier",
                    "name": "verifier",
                    "persona": "verifier",
                    "tool": str(getattr(result, "name", "") or "check"),
                    "content": str(getattr(result, "command", "") or ""),
                    "tool_event_key": f"verify:{iteration_num}:{index}",
                }
            )
        row["detail"] = capped
        row["full_detail"] = full_detail
        row["tool_terminal"] = True
        row["status"] = _VERIFIER_ROW_STATUS.get(status, "failed")
        row["duration"] = float(getattr(result, "duration_s", 0.0) or 0.0)
        self.manager.persister.request_save(self.state)

    @traces(SWR.SWR_2609)
    def on_verifier_run(self, iteration_num: int, result: Any) -> None:
        """End the verification phase, whatever the suite concluded.

        And carry forward the one thing that outlives it: whether this workspace
        has a gate at all (SWR-2615). A run that verified nothing has nothing in
        flight to say so, which is precisely why its silence used to read as
        "verified".
        """
        del iteration_num
        self._verifier_control = None
        self._verifier_rows.clear()
        self.state.verifier_state = None
        self.state.gate_warning = _gate_warning_for(result)
        self.manager.persister.request_save(self.state)

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        """Ask the running check to stop. Safe to call with no suite in flight.

        Marshalled onto the loop thread on purpose: the runner arms and disarms
        the control there between checks, so skipping from the GUI thread could
        otherwise kill the terminal of the check that came *after* the one the
        user meant.
        """
        if self._verifier_control is None or self.loop.is_closed():
            return False
        try:
            self.loop.call_soon_threadsafe(self._skip_verifier_check)
        except RuntimeError:
            return False
        return True

    def _skip_verifier_check(self) -> None:
        control = self._verifier_control
        if control is None:
            return
        try:
            control.skip_current()
        except Exception:  # noqa: BLE001 - a failed skip must not end the run
            _log.warning("Could not skip the running verifier check", exc_info=True)

    def cancel_agent(self, agent_id: str) -> bool:
        manager = self._child_managers.get(agent_id)
        if self.ralph is None or manager is None or self.loop.is_closed():
            return False
        try:
            asyncio.run_coroutine_threadsafe(
                self.ralph.scheduler.cancel_child(manager, agent_id),
                self.loop,
            )
        except RuntimeError:
            return False
        return True

    def on_iteration_start(self, _iteration_num: int, task: Any) -> None:
        self.loop.call_soon_threadsafe(self._set_todo_task, task.id, "IN_PROGRESS")

    def on_child_spawned(self, _record: Any, manager: Any) -> None:
        self._schedule_manager(manager)

    def on_child_created(self, _record: Any, manager: Any, todo: Any) -> None:
        self._remember_manager(manager)
        self.loop.call_soon_threadsafe(self._apply, manager.snapshot_children(), todo)

    def on_child_running(self, _record: Any, manager: Any) -> None:
        self._schedule_manager(manager)

    def on_child_terminal(self, _record: Any, manager: Any) -> None:
        self._schedule_manager(manager)

    def on_todo_state(self, todo: Any) -> None:
        self._live_todo = todo
        self.loop.call_soon_threadsafe(self._apply_todo, todo)

    def edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str = "",
    ) -> bool:
        if self._live_todo is None or getattr(self.loop, "is_closed", lambda: False)():
            return False
        if operation not in {"add", "remove", "rename"}:
            return False
        if operation != "remove" and not text.strip():
            return False
        self.loop.call_soon_threadsafe(self._edit_todo, operation, target_id, text)
        return True

    def extra_runtime_kwargs(self) -> dict[str, Any]:
        return {}

    def bind_scheduler_callbacks(self, manager: Any) -> None:
        if self.ralph is None:
            return
        scheduler = self.ralph.scheduler

        def _conversation_event(record: Any, event: object) -> None:
            self.loop.call_soon_threadsafe(
                self._apply_conversation_event, record.canonical_name, record.persona, event
            )
            self._capture_live_prompt_tokens(record)
            self._schedule_manager(manager)

        def _conversation_token(record: Any, chunk: object) -> None:
            self.loop.call_soon_threadsafe(
                self._apply_token_event, record.canonical_name, record.persona, chunk
            )

        def _spawn_notification(_record: Any) -> None:
            # Fires when the scheduler flips a queued child to RUNNING (and on
            # other internal state changes) — without this, delegated children
            # stay shown as "queued" in the UI until the whole iteration ends.
            self._schedule_manager(manager)

        def _stall(_record: Any, _elapsed: float, _phase: str) -> None:
            self._schedule_manager(manager)

        def _questions_stored(
            conversation: object,
            prompt_id: str,
            steps: list[AskQuestionsStep],
        ) -> None:
            conversation_id = getattr(conversation, "id", None)
            with scheduler._conversation_lock:
                agent_id = next(
                    (
                        name
                        for name, active in scheduler._active_conversations.items()
                        if getattr(active, "id", None) == conversation_id
                    ),
                    "",
                )
            if not agent_id:
                raise RuntimeError("Prompt conversation is not active.")
            raw_steps = [step.model_dump(mode="json") for step in steps]
            self.loop.call_soon_threadsafe(
                self._store_pending_questions,
                agent_id,
                prompt_id,
                raw_steps,
            )
            self._schedule_manager(manager)

        self.ralph.scheduler._conversation_event_callback = _conversation_event
        self.ralph.scheduler._conversation_token_callback = _conversation_token
        self.ralph.scheduler._spawn_notification_callback = _spawn_notification
        self.ralph.scheduler._stall_callback = _stall
        self.ralph.scheduler.on_questions_stored = _questions_stored

    def unbind_scheduler_callbacks(self) -> None:
        if self.ralph is not None:
            self.ralph.scheduler.on_questions_stored = None

    @traces(SWR.SWR_2504)
    def present_approval(self, payload: dict[str, Any]) -> None:
        """Publish one pending approval for the desktop UI.

        Runs on the blocked agent's dispatch thread, so it only hands the
        payload to the run loop and returns immediately.
        """
        self.loop.call_soon_threadsafe(self._store_pending_approval, dict(payload))

    @traces(SWR.SWR_2504)
    def dismiss_approval(self, request_id: str) -> None:
        """Drop a resolved (or timed-out) approval from the persisted state."""
        self.loop.call_soon_threadsafe(self._clear_pending_approval, request_id)

    def _store_pending_approval(self, payload: dict[str, Any]) -> None:
        request_id = str(payload.get("request_id", ""))
        if not request_id:
            return
        pending = dict(self.state.pending_approvals or {})
        pending[request_id] = payload
        self.state.pending_approvals = pending
        self.manager.persister.request_save(self.state)

    def _clear_pending_approval(self, request_id: str) -> None:
        pending = dict(self.state.pending_approvals or {})
        if pending.pop(request_id, None) is None:
            return
        self.state.pending_approvals = pending
        self.manager.persister.request_save(self.state)

    def _store_pending_questions(
        self,
        agent_id: str,
        prompt_id: str,
        steps: list[dict[str, Any]],
    ) -> None:
        self.state.pending_questions = {
            "agent_id": agent_id,
            "prompt_id": prompt_id,
            "steps": steps,
        }
        self.manager.persister.request_save(self.state)

    @staticmethod
    def _timestamp() -> str:
        return time.strftime("%H:%M:%S")

    def _append_row(self, row: dict[str, Any]) -> dict[str, Any]:
        row.setdefault("ts", self._timestamp())
        self.state.transcript_events.append(row)
        return row

    @traces(SWR.SWR_2421)
    def _apply_conversation_event(self, agent_name: str, persona: str, event: object) -> None:
        from openhands.sdk.event.condenser import Condensation
        from openhands.sdk.event.llm_convertible.action import ActionEvent
        from openhands.sdk.event.llm_convertible.message import MessageEvent
        from openhands.sdk.event.llm_convertible.observation import (
            AgentErrorEvent,
            ObservationEvent,
            UserRejectObservation,
        )

        changed = False
        if isinstance(event, Condensation):
            self._append_row(
                {
                    "role": "system",
                    "content": (
                        "Memory condensed: preserved facts and cleared history to save tokens."
                    ),
                }
            )
            changed = True
        elif isinstance(event, ActionEvent):
            changed = self._apply_action_event(agent_name, persona, event)
        elif isinstance(event, ObservationEvent | UserRejectObservation | AgentErrorEvent):
            changed = self._apply_tool_result_event(agent_name, event)
        elif isinstance(event, MessageEvent) and str(getattr(event, "source", "")) == "agent":
            changed = self._apply_agent_message_event(agent_name, persona, event)

        if changed:
            self.manager.persister.request_save(self.state)

    @traces(SWR.SWR_2417, SWR.SWR_2444, SWR.SWR_2432)
    def _apply_action_event(self, agent_name: str, persona: str, event: Any) -> bool:
        """Persist one tool call as a chat row; flush thought/reasoning first."""
        from rotaris_core.tui.live_activity import describe_sdk_event

        reasoning = getattr(event, "reasoning_content", None)
        if isinstance(reasoning, str) and reasoning.strip():
            self._append_thinking(agent_name, persona, reasoning)

        thought_text = self._visible_text(getattr(event, "thought", None) or [])
        if thought_text:
            self._persist_visible_text(agent_name, persona, thought_text)

        # Tool call starts: streamed/thinking segments belong to the turn before it.
        self._close_segments(agent_name)

        update = describe_sdk_event(event) or {}
        summary = update.get("activity_text") or str(getattr(event, "tool_name", "tool"))
        full_summary = self._cap_full_text(str(update.get("feed_text") or summary))
        row = self._append_row(
            {
                "role": "tool",
                "name": agent_name,
                "persona": persona,
                "tool": str(getattr(event, "tool_name", "")),
                "content": summary,
                "detail": "",
                "full_text": full_summary,
                "full_detail": "",
                "tool_event_key": str(getattr(event, "tool_call_id", "") or ""),
                "tool_terminal": False,
                "status": "running",
                # Wall-clock, unlike the monotonic stamp below: the UI has to
                # count a running call upward across process boundaries, and a
                # grouped run of calls times itself from the first one (SWR-2432).
                "started_at": time.time(),
            }
        )
        call_id = str(getattr(event, "tool_call_id", "") or "")
        tool_name = str(getattr(event, "tool_name", "") or "")
        if _is_terminal_tool(tool_name):
            # The engine publishes this agent's foreground terminal under its
            # canonical name, which is the same name this row is stamped with —
            # so the preview can find the live screen (SWR-2428).
            row["stream_id"] = f"fg:{agent_name}"
        self._record_live_tool_call(agent_name, tool_name, call_id)
        if call_id:
            self._tool_rows[f"{agent_name}:{call_id}"] = row
            self._tool_started[f"{agent_name}:{call_id}"] = time.monotonic()
            if tool_name:
                self._active_tool_calls.setdefault(agent_name, {})[call_id] = tool_name
                self._sync_child_active_tools(agent_name)
        return True

    def _record_live_tool_call(self, agent_name: str, tool_name: str, call_id: str) -> None:
        """Mirror a started call into session metrics before conversation end."""
        if not tool_name:
            return
        stable_id = f"{agent_name}:{call_id}" if call_id else ""
        if stable_id and stable_id in self._counted_tool_calls:
            return
        if stable_id:
            self._counted_tool_calls.add(stable_id)

        from rotaris_core.session.state import AgentMetrics

        metrics = self.state.agent_metrics.setdefault(agent_name, AgentMetrics())
        metrics.tool_calls[tool_name] = metrics.tool_calls.get(tool_name, 0) + 1
        metrics.tool_call_count += 1
        self.state.global_tool_call_count += 1

    @traces(SWR.SWR_2417, SWR.SWR_2419, SWR.SWR_2444)
    def _apply_tool_result_event(self, agent_name: str, event: Any) -> bool:
        """Attach a tool result / failure to its originating tool row."""
        from rotaris_core.tui.live_activity import describe_sdk_event

        update = describe_sdk_event(event)
        if update is None:
            return False
        icon = update.get("activity_icon", "")
        status = {"completed": "ok", "failed": "failed", "blocked": "blocked"}.get(
            str(update.get("activity_phase", "")), "ok"
        )
        full_detail_text = str(update.get("feed_text") or update.get("activity_text") or "")
        call_id = str(getattr(event, "tool_call_id", "") or "")
        row = self._tool_rows.pop(f"{agent_name}:{call_id}", None)
        terminal_row = _is_terminal_tool(str((row or {}).get("tool") or ""))
        full_detail_text = self._cap_full_text(full_detail_text, preserve_lines=terminal_row)
        detail = " ".join(full_detail_text.split()) if terminal_row else full_detail_text
        if len(detail) > self._TOOL_DETAIL_MAX:
            detail = detail[: self._TOOL_DETAIL_MAX - 1].rstrip() + "…"
        started_at = self._tool_started.pop(f"{agent_name}:{call_id}", None)
        open_calls = self._active_tool_calls.get(agent_name)
        tool_name = open_calls.get(call_id, "") if open_calls is not None else ""
        if open_calls is not None and call_id in open_calls:
            del open_calls[call_id]
            self._sync_child_active_tools(agent_name)
        if row is not None:
            row["detail"] = detail
            row["full_detail"] = full_detail_text
            row["tool_terminal"] = True
            row["status"] = status
            if started_at is not None:
                row["duration"] = round(time.monotonic() - started_at, 1)
            self._persist_ui_edit_diff(agent_name, event, row)
        else:
            self._append_row({"role": "system", "content": f"{icon} {detail}".strip()})
        pending = self.state.pending_questions
        if (
            tool_name == "ask_questions"
            and isinstance(pending, dict)
            and pending.get("agent_id") == agent_name
        ):
            self.state.pending_questions = None
        return True

    @traces(SWR.SWR_2419)
    def _persist_ui_edit_diff(
        self,
        agent_name: str,
        event: Any,
        tool_row: dict[str, Any],
    ) -> None:
        """Persist one structured diff outside the model-visible transcript."""
        observation = getattr(event, "observation", None)
        raw_diff = getattr(observation, "ui_diff", None)
        if not isinstance(raw_diff, dict):
            return

        from rotaris_core.edit_diff import EditDiffArtifact

        tool_name = str(tool_row.get("tool") or getattr(event, "tool_name", "") or "")
        tool_event_key = str(tool_row.get("tool_event_key") or "").strip() or None
        diff_id = (
            f"{agent_name}:{tool_event_key}"
            if tool_event_key is not None
            else f"{agent_name}:{tool_name}:{len(self.state.ui_edit_diffs)}"
        )
        try:
            diff = EditDiffArtifact.model_validate(
                {
                    **raw_diff,
                    "diff_id": diff_id,
                    "agent_name": agent_name,
                    "tool_name": tool_name,
                    "tool_event_key": tool_event_key,
                }
            )
        except Exception:  # noqa: BLE001 - invalid SDK UI metadata must not break the run
            return

        payload = diff.model_dump(mode="json")
        for index, existing in enumerate(self.state.ui_edit_diffs):
            if str(existing.get("diff_id") or "") != diff_id:
                continue
            self.state.ui_edit_diffs[index] = payload
            return
        self.state.ui_edit_diffs.append(payload)

    def _active_tool_names(self, agent_name: str) -> list[str]:
        return sorted(set(self._active_tool_calls.get(agent_name, {}).values()))

    def _sync_child_active_tools(self, agent_name: str) -> None:
        """Mirror the live tool set onto the persisted child state entry."""
        tools = self._active_tool_names(agent_name)
        for item in self.state.child_states:
            if str(item.get("canonical_name") or item.get("name")) == agent_name:
                item["active_tools"] = tools

    def _apply_agent_message_event(self, agent_name: str, persona: str, event: Any) -> bool:
        content = self._visible_text(getattr(event.llm_message, "content", []) or [])
        if not content:
            return False
        event_id = str(getattr(event, "id", "") or "")
        stable_id = f"{agent_name}:{event_id}" if event_id else ""
        if stable_id and stable_id in self._persisted_message_events:
            return False
        self._persist_visible_text(agent_name, persona, content)
        if stable_id:
            self._persisted_message_events.add(stable_id)
        return True

    @staticmethod
    def _visible_text(items: Any) -> str:
        from rotaris_core.sdk_text import content_is_internal_deliberation, sanitize_visible_text

        parts: list[str] = []
        for item in items:
            raw_text = getattr(item, "text", None)
            if not raw_text or content_is_internal_deliberation(raw_text):
                continue
            cleaned = sanitize_visible_text(raw_text).strip()
            if cleaned:
                parts.append(cleaned)
        return "\n".join(parts).strip()

    def _apply_token_event(self, agent_name: str, persona: str, chunk: object) -> None:
        from rotaris_core.tui.streaming import extract_reasoning_text, extract_stream_text

        changed = False
        reasoning_delta = extract_reasoning_text(chunk)
        if reasoning_delta:
            self._append_thinking(agent_name, persona, reasoning_delta, streaming=True)
            changed = True

        text_delta, _has_reasoning = extract_stream_text(chunk)
        if text_delta:
            # Visible text ends the thinking burst.
            self._finish_thinking(agent_name)
            seg = self._stream_segments.get(agent_name)
            if seg is None:
                self._committed_message_segments.pop(agent_name, None)
                seg = self._append_row(
                    {
                        "role": "agent",
                        "name": agent_name,
                        "persona": persona,
                        "content": text_delta,
                    }
                )
                self._stream_segments[agent_name] = seg
            else:
                seg["content"] = str(seg.get("content", "")) + text_delta
            changed = True

        if changed:
            self.manager.persister.request_save(self.state)

    @traces(SWR.SWR_2446)
    def _append_thinking(
        self, agent_name: str, persona: str, text: str, *, streaming: bool = False
    ) -> None:
        if not streaming:
            self._reconcile_thinking(agent_name, persona, text)
            return
        seg = self._thinking_segments.get(agent_name)
        if seg is None:
            seg = self._append_row(
                {
                    "role": "thinking",
                    "name": agent_name,
                    "persona": persona,
                    "content": "",
                    "started_at": time.time(),
                    "chars": 0,
                }
            )
            self._thinking_segments[agent_name] = seg
            self._last_thinking_rows[agent_name] = seg
        # Count every streamed character — the persisted content is capped, but
        # the token estimate in the transcript keeps climbing past the cap.
        seg["chars"] = int(seg.get("chars", 0) or 0) + len(text)
        existing = str(seg.get("content", ""))
        if len(existing) < self._THINKING_MAX:
            seg["content"] = (existing + text)[: self._THINKING_MAX]

    @traces(SWR.SWR_2446)
    def _reconcile_thinking(self, agent_name: str, persona: str, text: str) -> None:
        """Fold an action event's complete ``reasoning_content`` into its burst.

        The SDK delivers reasoning twice: streamed as deltas, then whole on the
        action event that ends the turn. The second copy must never become its
        own row — it duplicated every burst, and with no duration ever stamped
        it rendered as a perpetually counting "reasoning…" row.
        """
        seg = self._thinking_segments.get(agent_name)
        if seg is not None:
            # The open streamed burst is the turn this action ends; the event's
            # reasoning is authoritative for it.
            seg["chars"] = max(int(seg.get("chars", 0) or 0), len(text))
            seg["content"] = text[: self._THINKING_MAX]
            return
        last = self._last_thinking_rows.get(agent_name)
        if last is not None:
            content = str(last.get("content", ""))
            if content and (text.startswith(content) or content.startswith(text)):
                # Burst already closed (visible text ended it) — same reasoning.
                last["chars"] = max(int(last.get("chars", 0) or 0), len(text))
                last["content"] = text[: self._THINKING_MAX]
                return
        # Reasoning the provider never streamed: it arrives whole with the
        # action, so the row is complete on creation — no started_at, nothing
        # for the live tick to count.
        row = self._append_row(
            {
                "role": "thinking",
                "name": agent_name,
                "persona": persona,
                "content": text[: self._THINKING_MAX],
                "chars": len(text),
            }
        )
        self._last_thinking_rows[agent_name] = row

    @traces(SWR.SWR_2446)
    def _finish_thinking(self, agent_name: str) -> None:
        """Stamp the thinking duration when a streamed burst ends."""
        seg = self._thinking_segments.pop(agent_name, None)
        if seg is None or "duration" in seg:
            return
        started_at = float(seg.get("started_at", 0.0) or 0.0)
        if started_at:
            seg["duration"] = round(max(0.0, time.time() - started_at), 1)

    def _close_segments(self, agent_name: str) -> None:
        self._stream_segments.pop(agent_name, None)
        self._finish_thinking(agent_name)
        self._committed_message_segments.pop(agent_name, None)

    def _persist_visible_text(self, agent_name: str, persona: str, content: str) -> None:
        """Commit an agent message, replacing its own streamed segment if any."""
        self._finish_thinking(agent_name)
        seg = self._stream_segments.pop(agent_name, None)
        if seg is not None:
            streamed = str(seg.get("content", ""))
            if not streamed.strip() or content.startswith(streamed) or streamed.startswith(content):
                seg["content"] = content
                self._committed_message_segments[agent_name] = seg
                return
        committed = self._committed_message_segments.get(agent_name)
        if committed is not None:
            prior = str(committed.get("content", ""))
            if prior and content.startswith(prior):
                committed["content"] = content
                return
        row = self._append_row(
            {"role": "agent", "name": agent_name, "persona": persona, "content": content}
        )
        self._committed_message_segments[agent_name] = row

    def on_last_prompt_tokens(self, record: Any, tokens: int) -> None:
        self.loop.call_soon_threadsafe(self._set_prompt_tokens, record.canonical_name, tokens)

    def _capture_live_prompt_tokens(self, record: Any) -> None:
        """Capture prompt usage after each model turn, while child still runs."""
        if self.ralph is None:
            return
        active_conversations = getattr(self.ralph.scheduler, "_active_conversations", {})
        conversation = active_conversations.get(record.canonical_name)
        agent = getattr(conversation, "agent", None)
        llm = getattr(agent, "llm", None)
        if llm is None:
            return

        from rotaris_core.cost import extract_cost_usage
        from rotaris_core.tokens import get_last_prompt_token_count
        from rotaris_core.tracking.tracker import GlobalTracker

        tokens = get_last_prompt_token_count(llm)
        if tokens is not None and tokens > 0:
            self.loop.call_soon_threadsafe(
                self._set_prompt_tokens,
                record.canonical_name,
                int(tokens),
            )

        GlobalTracker().set_agent_cost(record.canonical_name, extract_cost_usage(llm))

    def on_token_aggregate(self, usage: dict[str, Any] | None) -> None:
        if usage is not None:
            self.loop.call_soon_threadsafe(self._set_tokens, usage)

    def on_iteration_end(
        self,
        _record: Any,
        _report: Any,
        manager: Any,
        todo: Any,
        _outcome: Any,
    ) -> None:
        self._remember_manager(manager)
        self.loop.call_soon_threadsafe(self._finish_all_thinking)
        self.loop.call_soon_threadsafe(self._apply, manager.snapshot_children(), todo)

    @traces(SWR.SWR_2446)
    def _finish_all_thinking(self) -> None:
        """Stamp durations on any thinking burst still open at iteration end."""
        for agent_name in list(self._thinking_segments):
            self._finish_thinking(agent_name)

    def _schedule_manager(self, manager: Any) -> None:
        snapshots = manager.snapshot_children()
        self._remember_manager(manager, snapshots)
        self.loop.call_soon_threadsafe(self._apply, snapshots, None)

    def _remember_manager(self, manager: Any, records: list[Any] | None = None) -> None:
        snapshots = records if records is not None else manager.snapshot_children()
        for record in snapshots:
            self._child_managers[record.canonical_name] = manager

    _TERMINAL_CHILD_STATES = frozenset({"succeeded", "failed", "cancelled", "blocked"})

    def _apply(self, records: list[Any], todo: Any | None) -> None:
        existing = {
            str(item.get("canonical_name") or item.get("name")): item
            for item in self.state.child_states
        }
        for record in records:
            payload = record.model_dump(mode="json")
            name = str(payload.get("canonical_name") or payload.get("name"))
            if str(payload.get("state", "")).lower() in self._TERMINAL_CHILD_STATES:
                # A child that ended mid-call must not keep stale active chips.
                self._active_tool_calls.pop(name, None)
            payload["active_tools"] = self._active_tool_names(name)
            existing[name] = payload
        self.state.child_states = list(existing.values())
        if todo is not None:
            self.state.todo_state = todo.model_dump(mode="json")
        self.manager.persister.request_save(self.state)

    def _apply_todo(self, todo: Any) -> None:
        self.state.agent_todo_state = todo.model_dump(mode="json")
        self.manager.persister.request_save(self.state)

    def _edit_todo(
        self,
        operation: TodoEditOperation,
        target_id: str,
        text: str,
    ) -> None:
        todo = self._live_todo
        if todo is None:
            return
        from rotaris.services.todo_editing import edit_todo_list

        if edit_todo_list(todo, operation, target_id, text):
            self._apply_todo(todo)

    def _set_todo_task(self, task_id: str, status: str) -> None:
        for phase in (self.state.todo_state or {}).get("phases", []):
            for task in phase.get("tasks", []):
                if task.get("id") == task_id:
                    task["status"] = status
        self.manager.persister.request_save(self.state)

    def _set_prompt_tokens(self, agent_name: str, tokens: int) -> None:
        from rotaris_core.session.state import AgentMetrics

        metrics = self.state.agent_metrics.setdefault(agent_name, AgentMetrics())
        metrics.last_prompt_tokens = tokens
        self.state.root_context_tokens = tokens
        self.manager.persister.request_save(self.state)

    def _set_tokens(self, usage: dict[str, Any]) -> None:
        self.state.token_usage = usage
        self.manager.persister.request_save(self.state)
