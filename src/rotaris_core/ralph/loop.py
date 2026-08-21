from __future__ import annotations

import asyncio
import copy
import datetime as dt
import logging
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from rotaris_core.core.prompt_types import PromptRegistry
from rotaris_core.events import SessionEndEvent, SessionStartEvent, publish
from rotaris_core.improvement.types import RunType
from rotaris_core.orchestrator.child_manager import ChildManager
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.scheduler import Scheduler
from rotaris_core.ralph.iteration_observer import RalphIterationObserver
from rotaris_core.ralph.state import RalphIterationOutcome, RalphIterationState, RalphProgressFile
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.todo_state import TaskStatus, TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from pathlib import Path
    from typing import Protocol

    from openhands.sdk import Agent

    from rotaris_core.config.schema import RotarisConfig, RuntimePolicy
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.orchestrator.summary_agent import SummaryAgent
    from rotaris_core.ralph.completion_classifier import CompletionClassifier, CompletionVerdict
    from rotaris_core.ralph.intent_validator import IntentValidator
    from rotaris_core.verifier.evidence import VerifierEvidence
    from rotaris_core.verifier.gate import CompletionGateDecision
    from rotaris_core.verifier.repair import RepairDecision
    from rotaris_core.verifier.requirement_evidence import IterationEvidence
    from rotaris_core.verifier.runner import CheckResult, VerifierRunControl, VerifierRunResult
    from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

    class RalphAgentFactory(Protocol):
        def __call__(
            self,
            persona: str,
            runtime_kwargs: dict[str, Any] | None = None,
            model_override: str | None = None,
        ) -> Agent: ...

    SummaryAgentFactory = SummaryAgent | Callable[[str], SummaryAgent]
    ConversationEventCallback = Callable[[ChildTaskRecord, object], None]
ImprovementCollectorFactory = Callable[[], Any]

#: Appended to a re-queued task's payload when the agent left todos incomplete.
_TODO_CONTINUATION_MARKER = "\n\nRALPH CONTINUATION:\n"

#: Appended when the completion gate charged a repair attempt (SWR-2605); the
#: failing checks' own output follows it.
_REPAIR_CONTINUATION_MARKER = "\n\nVERIFICATION FAILURE:\n"

#: Every block the loop appends to an execution payload. Stripped before a new
#: block is added, so a task re-queued repeatedly never accumulates stale ones.
_CONTINUATION_MARKERS = (_TODO_CONTINUATION_MARKER, _REPAIR_CONTINUATION_MARKER)


@traces(SWR.SWR_2609)
class _LoopVerifierProgress:
    """Adapts the verifier runner's progress calls onto the loop's reporting.

    A plain object rather than a closure pair so the runner can keep resolving
    hooks by name, and so the iteration number travels with the adapter instead
    of being threaded through every call site.
    """

    def __init__(self, loop: RalphLoop, iteration_num: int) -> None:
        self._loop = loop
        self._iteration_num = iteration_num

    def on_check_start(
        self,
        check: ResolvedCheck,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        self._loop._record_verifier_check_start(
            self._iteration_num,
            check,
            index,
            total,
            deadline_s,
        )

    def on_check_finish(self, result: CheckResult, index: int, total: int) -> None:
        self._loop._record_verifier_check_finish(self._iteration_num, result, index, total)


@dataclass(frozen=True)
class PostRunImprovementResult:
    """The observable outcome of one captured improvement-collection job."""

    artifact_id: str | None = None
    proposal_count: int = 0
    cancelled: bool = False


@traces(SWR.SWR_1639)
class PostRunImprovementJob:
    """Run improvement analysis from evidence frozen when a task run ended.

    The job deliberately owns no live ``RalphLoop`` state.  Hosts may await it
    during their normal cleanup or run it in a separate worker without letting
    a subsequent task mutate the evidence being reviewed.
    """

    def __init__(
        self,
        *,
        collector_factory: ImprovementCollectorFactory,
        workspace_root: Path,
        session_id: str,
        run_type: RunType,
        progress: RalphProgressFile,
        todo: TodoList,
        transcript_events: list[dict[str, Any]],
        child_reports: list[dict[str, Any]],
        workspace_history: list[Any],
        gate_evidence: dict[str, Any] | None = None,
    ) -> None:
        self._collector_factory = collector_factory
        self._workspace_root = workspace_root
        self.session_id = session_id
        self._run_type = run_type
        self._progress = copy.deepcopy(progress)
        self._todo = copy.deepcopy(todo)
        self._transcript_events = copy.deepcopy(transcript_events)
        self._child_reports = copy.deepcopy(child_reports)
        self._workspace_history = copy.deepcopy(workspace_history)
        # SWR-2617: what this run learned about its own gate. Frozen with the
        # rest of the evidence so a later task cannot change what is reviewed.
        self._gate_evidence = copy.deepcopy(gate_evidence or {})
        self._cancel_requested = False

    def request_cancel(self) -> None:
        """Suppress persistence if this optional job is being shut down."""
        self._cancel_requested = True

    async def run(self) -> PostRunImprovementResult:
        """Collect and persist proposals, or report an intentional cancellation."""
        if self._cancel_requested:
            return PostRunImprovementResult(cancelled=True)

        try:
            collector = self._collector_factory()
        except Exception:  # noqa: BLE001
            _log.exception("Improvement collector factory raised; skipping post-run pass.")
            return PostRunImprovementResult()

        try:
            artifact = await collector.generate_artifact(
                session_id=self.session_id,
                run_type=self._run_type,
                progress=self._progress,
                todo=self._todo,
                transcript_events=self._transcript_events,
                child_reports=self._child_reports,
                workspace_history=self._workspace_history,
                gate_evidence=self._gate_evidence,
            )
        except asyncio.CancelledError:
            self._cancel_requested = True
            return PostRunImprovementResult(cancelled=True)
        except Exception:  # noqa: BLE001
            _log.exception("Improvement collector post-run pass failed; continuing.")
            return PostRunImprovementResult()

        if self._cancel_requested:
            return PostRunImprovementResult(cancelled=True)

        try:
            from rotaris_core.improvement.persistence import save_improvement_artifact

            save_improvement_artifact(
                self._workspace_root,
                artifact,
                suppress_duplicates=True,
            )
        except Exception:  # noqa: BLE001
            _log.exception("Improvement collector artifact persistence failed; continuing.")
            return PostRunImprovementResult()

        _log.info(
            "Improvement collector wrote artifact %s with %d proposal(s).",
            artifact.artifact_id,
            len(artifact.proposals),
        )
        return PostRunImprovementResult(
            artifact_id=artifact.artifact_id,
            proposal_count=len(artifact.proposals),
        )


_log = logging.getLogger(__name__)


@traces(SWR.SWR_123)
class RalphStopCondition:
    @classmethod
    def should_stop(
        cls,
        progress: RalphProgressFile,
        todo: TodoList,
        max_iterations: int | None,
        max_time: float | None,
    ) -> tuple[bool, str]:
        all_tasks = [task for phase in todo.phases for task in phase.tasks]
        non_abandoned = [task for task in all_tasks if task.status != TaskStatus.ABANDONED]

        if non_abandoned and all(task.status == TaskStatus.COMPLETED for task in non_abandoned):
            return True, "all tasks completed"

        if max_iterations is not None and len(progress.iterations) >= max_iterations:
            return True, "iteration limit reached"

        if max_time is not None:
            now = dt.datetime.now(progress.started_at.tzinfo or dt.UTC)
            elapsed = (now - progress.started_at).total_seconds()
            if elapsed >= max_time:
                return True, "time limit reached"

        if not any(task.status == TaskStatus.PENDING for task in all_tasks):
            return True, "no pending tasks"

        return False, ""


@traces(
    SWR.SWR_101,
    SWR.SWR_117,
    SWR.SWR_118,
    SWR.SWR_119,
    SWR.SWR_120,
    SWR.SWR_121,
    SWR.SWR_122,
    SWR.SWR_123,
    SWR.SWR_124,
    SWR.SWR_125,
)
@traces(SWR.SWR_526, SWR.SWR_2434)
class RalphLoop:
    def __init__(
        self,
        config: RotarisConfig,
        workspace_root: str,
        summary_agent: SummaryAgentFactory,
        conversation_factory: Any | None = None,
        conversation_persistence_dir: str | Path | None = None,
        conversation_event_callback: ConversationEventCallback | None = None,
        *,
        run_type: RunType = RunType.TASK_RUN,
        improvement_collector_factory: ImprovementCollectorFactory | None = None,
        improvement_context_provider: Callable[[], dict[str, Any]] | None = None,
        iteration_observer: RalphIterationObserver | None = None,
        mcp_manager: Any | None = None,
        publish_session_lifecycle: bool = True,
    ):
        self.config = config
        self.workspace_root = workspace_root
        from pathlib import Path as _Path

        self._workspace_root_path = _Path(workspace_root)
        self._metadata_workspace_root_path = _Path(config.metadata_workspace_root or workspace_root)
        self.summary_agent = summary_agent
        self.conversation_factory = conversation_factory
        self._run_loop: asyncio.AbstractEventLoop | None = None
        self._run_task: asyncio.Task[Any] | None = None
        self._stop_requested = False
        self._session_abort_requested = False
        self._message_count = 0
        self._message_limit = config.runtime.message_limit
        self._message_limit_pause_event = asyncio.Event()
        self._message_limit_pause_result = ""
        self._intent_validator: IntentValidator | None = None
        self._completion_classifier: CompletionClassifier | None = None
        self._fulfillment_validator: Any | None = None
        self._relentless_cycles_used = 0
        # Classified run intent, set by the host after classification. Drives the
        # orchestrator's playbook cell and the BUDGET clamp below (SWR-2416), and
        # is mirrored onto the scheduler by the property setter (SWR-2809).
        self._run_intent: str = ""
        # Owning session for queued prompts. Hosts that can run several loops at
        # once (Rotaris parallel runs) set it so this loop only triggers its own
        # session's messages; leaving it empty keeps the whole-registry read the
        # TUI and headless CLI rely on.
        self.queued_prompt_session_id: str = ""
        self.run_type = run_type
        self._improvement_context_provider = improvement_context_provider
        self._improvement_collector_factory = improvement_collector_factory
        self._observer: RalphIterationObserver = iteration_observer or RalphIterationObserver()
        # Whether *this* loop owns the ``session.start``/``session.end`` pair on
        # the wire.  A host that publishes its own richer versions — the shared
        # ``run_host.execute_run``, which holds the run aggregates the loop does
        # not — turns this off, so a consumer counting ``session.start`` gets one
        # of each and not two (SWR-1829).  Hosts that drive the loop directly
        # (Rotaris' run bridge, the Textual TUI) leave it on and are unaffected.
        # The observer hooks below fire either way: they are the lifecycle-hook
        # seam (SWR-2703), not part of the event stream.
        self._publish_session_lifecycle = publish_session_lifecycle
        # Populated by the post-run pass; callers may read this back into
        # ``SessionState.improvement_artifact_ids`` after ``run()`` returns.
        self.last_improvement_artifact_id: str | None = None

        # Deterministic completion verifier (SWR-2601/SWR-2602). Hosts that
        # already resolved a suite for the session may assign ``check_suite``
        # from ``SessionState.check_suite`` so the snapshot stays authoritative;
        # otherwise it is resolved lazily from config + workspace on first use.
        self.check_suite: ResolvedCheckSuite | None = None
        self.last_verifier_run: VerifierRunResult | None = None
        # SWR-2616: one gate repair per role per session. Session state, not run
        # state — two iterations share it, which is what stops a workspace whose
        # every candidate is broken from re-detecting and re-probing on each one.
        self._gate_repair: Any = None
        # In-flight gate-authoring turns (SWR-2615). Held so a detached task is
        # not collected mid-flight, and discarded as each one settles.
        self._gate_authoring_tasks: set[asyncio.Task[None]] = set()
        # Live handle on the suite currently running (SWR-2610), so a host can
        # skip a check. Set for the duration of one ``run_check_suite`` call and
        # ``None`` at every other moment — ``skip_verifier_check`` reads it.
        self._verifier_control: VerifierRunControl | None = None

        # Repair attempts already spent per task id (SWR-2605). Keyed by task
        # rather than held globally so two tasks failing verification do not
        # share one budget. Reset per run in ``_run_main_loop``.
        self._repair_attempts: dict[str, int] = {}

        # Session-scoped artifact store survives across iterations.  The session
        # directory is the parent of the conversation persistence dir
        # (``<session_dir>/conversations/``) when the host passes one in; in
        # tests where ``conversation_persistence_dir`` is ``None`` we fall back
        # to an in-memory-only store (no disk persistence).
        from rotaris_core.orchestrator.artifacts import SessionArtifactStore

        session_dir = None
        if conversation_persistence_dir is not None:
            from pathlib import Path as _Path

            convo_path = _Path(conversation_persistence_dir)
            if convo_path.name == "conversations" and convo_path.parent.name == "evidence":
                session_dir = convo_path.parent.parent
            else:
                session_dir = (
                    convo_path.parent if convo_path.name == "conversations" else convo_path
                )
        self.artifact_store: SessionArtifactStore = SessionArtifactStore(session_dir)
        self._session_dir = session_dir
        try:
            loaded = self.artifact_store.hydrate()
            if loaded:
                _log.info("Hydrated %d artifact(s) from session store", loaded)
        except Exception:  # noqa: BLE001
            _log.exception("Artifact store hydration failed; continuing with empty store")

        mcp_tool_provider = None
        if mcp_manager is not None:
            from rotaris_core.mcp.shared_tool_provider import SharedMCPToolProvider

            mcp_tool_provider = SharedMCPToolProvider(mcp_manager, workspace_root=workspace_root)

        self.scheduler = Scheduler(
            config=config,
            workspace_root=workspace_root,
            summary_agent=summary_agent,
            conversation_factory=conversation_factory,
            conversation_persistence_dir=conversation_persistence_dir,
            conversation_event_callback=conversation_event_callback,
            artifact_store=self.artifact_store,
            mcp_tool_provider=mcp_tool_provider,
        )
        self.scheduler.run_intent = self._run_intent

    @property
    @traces(SWR.SWR_2416, SWR.SWR_2809)
    def run_intent(self) -> str:
        """Classified intent for this run; empty until the host classifies."""
        return self._run_intent

    @run_intent.setter
    def run_intent(self, value: str) -> None:
        """Mirror the intent onto the scheduler so its stall guard is route-aware.

        Hosts assign ``ralph.run_intent`` directly after classification; without the
        mirror the scheduler cannot tell an answer-only run from an execution one and
        fails a child for not editing files its playbook forbade it to edit.
        """
        self._run_intent = value
        scheduler = getattr(self, "scheduler", None)
        if scheduler is not None:
            scheduler.run_intent = value

    @traces(SWR.SWR_911, SWR.SWR_914)
    def resolve_message_limit_pause(self, action: str) -> None:
        """Resolve the active message-limit gate with a modal action."""
        self._message_limit_pause_result = action
        if action == "double" and self._message_limit is not None:
            self._message_limit *= 2
        self._message_limit_pause_event.set()

    @traces(SWR.SWR_911, SWR.SWR_914)
    def clear_message_limit_pause(self) -> None:
        """Release any active message-limit gate during shutdown."""
        self._message_limit_pause_event.set()

    @traces(SWR.SWR_910, SWR.SWR_918)
    def _record_message_count(self) -> None:
        """Allow a host surface to persist the updated message-limit state."""

    async def run(
        self,
        todo: TodoList,
        agent_factory: RalphAgentFactory,
        session_id: str,
        max_iterations: int | None = None,
        max_time: float | None = None,
    ) -> RalphProgressFile:
        return await self._run_main_loop(
            todo=todo,
            agent_factory=agent_factory,
            session_id=session_id,
            max_iterations=max_iterations,
            max_time=max_time,
        )

    @traces(SWR.SWR_911, SWR.SWR_914, SWR.SWR_2131)
    async def _run_main_loop(
        self,
        todo: TodoList,
        agent_factory: RalphAgentFactory,
        session_id: str,
        max_iterations: int | None = None,
        max_time: float | None = None,
    ) -> RalphProgressFile:
        self._run_loop = asyncio.get_running_loop()
        self._run_task = asyncio.current_task()
        self._stop_requested = False
        self._session_abort_requested = False
        self._relentless_cycles_used = 0
        self._repair_attempts.clear()
        progress = RalphProgressFile(
            session_id=session_id,
            started_at=dt.datetime.now(dt.UTC),
            total_tasks=sum(len(phase.tasks) for phase in todo.phases),
        )

        # Capture the user's *original* request before any orchestrator-added
        # phases mutate the todo list. This is the source of truth for both
        # per-iteration intent validation and end-of-run relentless fulfillment
        # auditing.
        original_request = ""
        if todo.phases and todo.phases[0].tasks:
            first_task = todo.phases[0].tasks[0]
            original_request = (
                first_task.execution_payload or first_task.description or first_task.name
            )

        # Track same-task iterations to detect stuck tasks.  The limit is set
        # to max_iterations so this guard can never abandon a legitimately-
        # progressing multi-phase task before the global iteration cap would.
        # A tighter hardcoded limit (e.g. 3) would cut off orchestrators that
        # need many iterations to delegate a large plan.
        _same_task_iterations: dict[str, int] = {}
        _max_same_task_iterations = self.config.runtime.max_iterations

        # The real session boundary: past this point the loop owns the run, and
        # every ``return progress`` below funnels through the ``finally``.
        self._notify_session_observer("on_session_start", session_id, original_request)
        self._publish_session_start(
            session_id=session_id,
            task=original_request,
            max_iterations=max_iterations,
        )

        try:
            while True:
                if self._stop_requested:
                    progress.stop_reason = "stopped by user"
                    return progress

                should_stop, reason = RalphStopCondition.should_stop(
                    progress=progress,
                    todo=todo,
                    max_iterations=max_iterations,
                    max_time=max_time,
                )

                if should_stop:
                    # Check for queued prompts before terminating
                    prompt_registry = cast("Any", PromptRegistry)()
                    queued_prompts = prompt_registry.get_queued_prompts(
                        self.queued_prompt_session_id or None
                    )
                    # We only care about prompts that are actually QUEUED
                    active_queued_prompts = [
                        p for p in queued_prompts if p.status.value == "QUEUED"
                    ]

                    if reason == "all tasks completed" and active_queued_prompts:
                        # Add queued prompts as a new phase in the TodoList
                        new_phase = TodoPhase(name="Queued Prompts")
                        for prompt in active_queued_prompts:
                            new_task = TodoTask(
                                name=f"Queued Prompt: {prompt.id[:8]}",
                                description=prompt.content,
                            )
                            new_task.set_execution_context(prompt.content)
                            new_phase.tasks.append(new_task)
                            prompt_registry.mark_queued_as_triggered(prompt.id)

                        todo.phases.append(new_phase)
                        progress.total_tasks += len(new_phase.tasks)

                        # Recalculate should_stop because we just added tasks
                        should_stop, reason = RalphStopCondition.should_stop(
                            progress=progress,
                            todo=todo,
                            max_iterations=max_iterations,
                            max_time=max_time,
                        )
                        if should_stop:
                            await self._drain_active_children_before_stop()
                            progress.stop_reason = reason
                            return progress
                        continue

                    # Relentless mode: run a final fulfillment check before stopping
                    # on natural completion (not on user-requested stops, time
                    # limits, iteration limits, or aborts).
                    if (
                        self.config.runtime.relentless
                        and reason in {"all tasks completed", "no pending tasks"}
                        and self._relentless_cycles_used < self.config.runtime.relentless_max_cycles
                        and not self._stop_requested
                        and not self._session_abort_requested
                        and original_request
                    ):
                        added = await self._run_relentless_check(
                            original_request=original_request,
                            progress=progress,
                            todo=todo,
                        )
                        if added:
                            # New remediation tasks queued — keep iterating.
                            continue

                    await self._drain_active_children_before_stop()
                    progress.stop_reason = reason
                    return progress

                task = self._find_next_pending(todo)
                if task is None:
                    progress.stop_reason = "no pending tasks"
                    return progress

                try:
                    iteration = await self._run_iteration(
                        iteration_num=len(progress.iterations) + 1,
                        task=task,
                        progress=progress,
                        agent_factory=agent_factory,
                        todo=todo,
                    )
                except Exception:
                    _log.exception(
                        "Iteration %d crashed; marking task abandoned and continuing",
                        len(progress.iterations) + 1,
                    )
                    task.status = TaskStatus.ABANDONED
                    progress.abandoned_tasks += 1
                    continue
                progress.iterations.append(iteration)
                self._message_count += 1
                self._record_message_count()
                message_limit = self._message_limit
                if message_limit is not None and self._message_count >= message_limit:
                    self._message_limit_pause_result = ""
                    self._message_limit_pause_event.clear()
                    self._observer.on_message_limit_reached(self._message_count, message_limit)
                    await self._message_limit_pause_event.wait()
                    if self._message_limit_pause_result == "cancel":
                        progress.stop_reason = "user cancelled at message limit"
                        return progress

                # Same-task loop detection: if the same task keeps coming
                # back as PENDING (e.g. report validation false-positive),
                # abandon it after a limit to prevent infinite loops.
                if iteration.outcome == RalphIterationOutcome.PENDING:
                    _same_task_iterations[task.id] = _same_task_iterations.get(task.id, 0) + 1
                    if _same_task_iterations[task.id] >= _max_same_task_iterations:
                        _log.warning(
                            "Task %r has been retried %d times with PENDING "
                            "outcome; abandoning to break potential loop.",
                            task.name,
                            _same_task_iterations[task.id],
                        )
                        task.status = TaskStatus.ABANDONED
                        progress.abandoned_tasks += 1
                else:
                    # Reset counter when task makes forward progress.
                    _same_task_iterations.pop(task.id, None)

                if self._session_abort_requested:
                    progress.stop_reason = "agent session aborted"
                    return progress
        except asyncio.CancelledError:
            progress.stop_reason = "interrupted by user"
            return progress
        finally:
            self._run_task = None
            self._run_loop = None
            self._stop_requested = False
            self._session_abort_requested = False
            # Exactly one ``session.end`` per run: every exit path above —
            # normal return, stop request, cancellation, or an exception that
            # escapes the loop — passes through here exactly once.
            status = self._terminal_status(session_id, progress)
            self._publish_session_end(session_id=session_id, progress=progress, status=status)
            self._notify_session_observer("on_session_end", session_id, status)

    @traces(SWR.SWR_1828, SWR.SWR_1829)
    def _publish_session_start(
        self,
        *,
        session_id: str,
        task: str,
        max_iterations: int | None,
    ) -> None:
        """Announce the run's guard rails, or stay silent if anything is off."""
        if not self._publish_session_lifecycle:
            return
        try:
            publish(
                session_id,
                SessionStartEvent(
                    session_id=session_id,
                    task=task,
                    workspace=str(self.workspace_root),
                    persona=self.config.default_persona,
                    permission_mode=str(getattr(self.config.runtime, "permission_mode", "") or ""),
                    sandboxed=self._sandboxed(),
                    max_iterations=max_iterations,
                ),
            )
        except Exception:  # noqa: BLE001 - the stream must not fail the run.
            _log.warning("Could not publish session.start", exc_info=True)

    @traces(SWR.SWR_1828, SWR.SWR_1829)
    def _publish_session_end(
        self,
        *,
        session_id: str,
        progress: RalphProgressFile,
        status: str,
    ) -> None:
        """Close the run on the wire with its terminal status.

        Deliberately not the ``result`` event: that one is the last line of the
        stream and belongs to the CLI's run-end wiring, which knows the session
        state and the aggregate figures this loop does not hold.
        """
        if not self._publish_session_lifecycle:
            return
        try:
            publish(
                session_id,
                SessionEndEvent(
                    session_id=session_id,
                    status=status,
                    stop_reason=progress.stop_reason or "",
                    iterations_completed=len(progress.iterations),
                    duration_seconds=self._run_duration_seconds(progress),
                ),
            )
        except Exception:  # noqa: BLE001 - see above.
            _log.warning("Could not publish session.end", exc_info=True)

    @traces(SWR.SWR_1829, SWR.SWR_2703)
    def _terminal_status(self, session_id: str, progress: RalphProgressFile) -> str:
        """How this run ended, as a :class:`~rotaris_core.run_result.RunStatus` value.

        Derived once and shared by the wire event and the ``session_end``
        lifecycle hook, so a hook and a stream consumer can never be told two
        different things about the same run. Empty when the status could not be
        derived at all, which the callers treat as "unknown", not "failed".
        """
        try:
            from rotaris_core.run_result import build_run_result

            return str(
                build_run_result(session_id=session_id, state=None, progress=progress).status
            )
        except Exception:  # noqa: BLE001 - the run is over; nothing here may raise.
            _log.warning("Could not derive the terminal run status", exc_info=True)
            return ""

    @traces(SWR.SWR_2703)
    def _notify_session_observer(self, hook_name: str, session_id: str, detail: str) -> None:
        """Offer the session boundary to the observer, defensively.

        Same shape as :meth:`_notify_verifier_observer`, and for the same
        reason: not every host observer subclasses ``RalphIterationObserver``
        (Rotaris' run bridge is duck-typed), so a host built before these hooks
        existed must not turn the end of a run into a crash. ``on_session_end``
        in particular runs inside the loop's ``finally``, where an exception
        would replace whatever the run was already returning.
        """
        hook = getattr(self._observer, hook_name, None)
        if hook is None:
            return
        try:
            hook(session_id, detail)
        except Exception:  # noqa: BLE001
            _log.exception("Iteration observer failed in %s", hook_name)

    @staticmethod
    def _run_duration_seconds(progress: RalphProgressFile) -> float | None:
        started_at = getattr(progress, "started_at", None)
        if not isinstance(started_at, dt.datetime):
            return None
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=dt.UTC)
        return (dt.datetime.now(dt.UTC) - started_at).total_seconds()

    def _sandboxed(self) -> bool:
        """Whether this run's terminal commands are confined (SWR-2507).

        Reports *configured and available*, not merely configured — the same
        verdict ``SessionState.sandboxed`` records and the SWR-2508 downgrade
        consults.  A stream consumer that saw ``sandboxed: true`` for a sandbox
        that never started would draw exactly the wrong conclusion about how
        much it can trust the run.
        """
        from rotaris_core.sandbox.session import sandbox_status

        active, _backend = sandbox_status(self.config)
        return active

    async def _drain_active_children_before_stop(self) -> None:
        """Give still-running background children a chance to finish.

        A "blocked" iteration outcome means an orchestrator delegated work
        to a background child and is waiting on it — the child's own
        ``ChildManager`` is discarded once ``_run_iteration`` returns, but
        the Scheduler still tracks the child's asyncio task. Without this
        drain, a run that naturally concludes (e.g. "no pending tasks")
        while that child is still executing would fall straight into
        session teardown, which force-cancels it mid-flight and discards
        its results. Wait up to ``runtime.shutdown_drain_timeout`` seconds
        before letting the run conclude.
        """
        if not self.scheduler.has_active_children():
            return
        timeout = self.config.runtime.shutdown_drain_timeout
        _log.info(
            "Run concluding with background children still active; "
            "draining up to %.0fs before shutdown.",
            timeout,
        )
        await self.scheduler.drain_active_children(timeout=timeout)

    # -- Post-run improvement pass (REQ-20260515-POSTRUN-IMPROVE) -------

    _IMPROVEMENT_SKIP_STOP_REASONS = frozenset(
        {
            "stopped by user",
            "interrupted by user",
            "agent session aborted",
        },
    )

    @traces(SWR.SWR_1639)
    def capture_post_run_improvement_job(
        self,
        *,
        session_id: str,
        progress: RalphProgressFile,
        todo: TodoList,
    ) -> PostRunImprovementJob | None:
        """Freeze terminal evidence for optional post-run improvement analysis."""
        if self.run_type != RunType.TASK_RUN:
            return None
        if self._improvement_collector_factory is None:
            return None
        if not getattr(self.config.runtime, "improvement_collector_enabled", True):
            return None
        if progress.stop_reason in self._IMPROVEMENT_SKIP_STOP_REASONS:
            return None
        if self._session_dir is None:
            _log.debug("Skipping improvement collector: no session_dir available.")
            return None

        transcript_events: list[dict[str, Any]] = []
        if self._improvement_context_provider is not None:
            try:
                provided = self._improvement_context_provider()
            except Exception:  # noqa: BLE001
                _log.debug(
                    "improvement_context_provider raised; using empty context.",
                    exc_info=True,
                )
                provided = None
            if provided is not None:
                transcript_events = list(provided.get("transcript_events") or [])

        return PostRunImprovementJob(
            collector_factory=self._improvement_collector_factory,
            workspace_root=self._metadata_workspace_root_path,
            session_id=session_id,
            run_type=self.run_type,
            progress=copy.deepcopy(progress),
            todo=copy.deepcopy(todo),
            transcript_events=copy.deepcopy(transcript_events),
            child_reports=copy.deepcopy(self._collect_child_reports_for_collector()),
            workspace_history=copy.deepcopy(
                self._collect_workspace_history_for_collector(source_session_id=session_id),
            ),
            gate_evidence=self._collect_gate_evidence(),
        )

    async def _run_post_run_improvement_pass(
        self,
        *,
        session_id: str,
        progress: RalphProgressFile,
        todo: TodoList,
    ) -> None:
        """Compatibility helper for hosts that still await collection directly.

        ``run()`` intentionally never calls this method: task execution now
        returns before optional analysis.  Legacy hosts and focused collector
        tests can still use the captured lifecycle while migrating.
        """
        job = self.capture_post_run_improvement_job(
            session_id=session_id,
            progress=progress,
            todo=todo,
        )
        if job is None:
            return
        result = await job.run()
        self.last_improvement_artifact_id = result.artifact_id

    def _collect_child_reports_for_collector(self) -> list[dict[str, Any]]:
        """Return JSON-serialisable child report dicts for the collector."""
        try:
            records = self.artifact_store.list()
        except Exception:  # noqa: BLE001
            _log.debug(
                "artifact_store.list() raised; passing empty reports.",
                exc_info=True,
            )
            return []
        return [self._coerce_report(r) for r in records]

    @traces(SWR.SWR_2617)
    def _collect_gate_evidence(self) -> dict[str, Any]:
        """What this run learned about its own gate, for the collector to cite.

        Everything the automatic paths were not allowed to change reaches the
        user through a proposal, and a proposal without evidence is not
        reviewable — so this is what makes that route usable rather than
        theoretical.
        """
        try:
            from rotaris_core.verifier.drift import gate_evidence

            return gate_evidence(self.check_suite, self.last_verifier_run)
        except Exception:  # noqa: BLE001 - missing evidence is not a failed run
            _log.debug("Could not collect gate evidence for the collector", exc_info=True)
            return {}

    def _collect_workspace_history_for_collector(
        self,
        *,
        source_session_id: str,
    ) -> list[Any]:
        """Return bounded prior workspace artifacts for cross-run collection."""
        try:
            from rotaris_core.improvement.persistence import list_improvement_artifacts

            artifacts = list_improvement_artifacts(self._metadata_workspace_root_path)
        except Exception:  # noqa: BLE001
            _log.debug(
                "Failed to load workspace improvement history; continuing without it.",
                exc_info=True,
            )
            return []

        history: list[Any] = []
        for artifact in artifacts:
            if artifact.source_run_type != RunType.TASK_RUN:
                continue
            if artifact.source_session_id == source_session_id:
                continue
            history.append(artifact)
            if len(history) >= 5:
                break
        return history

    @staticmethod
    def _coerce_report(report: object) -> dict[str, Any]:
        dump = getattr(report, "model_dump", None)
        if callable(dump):
            try:
                return cast("dict[str, Any]", dump(mode="json"))
            except Exception:  # noqa: BLE001
                pass
        if isinstance(report, dict):
            return report
        return {"repr": str(report)}

    def request_shutdown(self, *, force: bool = False) -> None:
        self._stop_requested = True
        self.clear_message_limit_pause()
        self.scheduler.request_stop(force=force)
        if self._run_loop is None or self._run_loop.is_closed() or self._run_task is None:
            return
        self._run_loop.call_soon_threadsafe(self._cancel_run_task)

    def _cancel_run_task(self) -> None:
        if self._run_task is not None and not self._run_task.done():
            self._run_task.cancel()

    @staticmethod
    def _get_incomplete_todo_tasks(todo: TodoList | None) -> list[TodoTask]:
        if todo is None:
            return []
        return [
            task
            for phase in todo.phases
            for task in phase.tasks
            if task.status in {TaskStatus.PENDING, TaskStatus.IN_PROGRESS}
        ]

    @staticmethod
    def _format_incomplete_todo_summary(incomplete: list[TodoTask]) -> str:
        names = ", ".join(task.name for task in incomplete[:5])
        return f"Agent declared success but left {len(incomplete)} todo task(s) incomplete: {names}"

    def _build_incomplete_todo_correction(self, incomplete: list[TodoTask]) -> str:
        return (
            f"{self._format_incomplete_todo_summary(incomplete)}. "
            "Continue with the todo list from where you left off and do not end your turn "
            "until every remaining todo item is completed."
        )

    @staticmethod
    def _strip_continuation_markers(payload: str) -> str:
        """Return *payload* with any loop-appended continuation block removed.

        Both the todo correction and the SWR-2605 repair context are appended to
        the task's execution payload before it is re-queued. Without this the
        payload grows one stale block per attempt, and a repair attempt would be
        handed the *previous* attempt's failure output alongside the current one.
        """
        cut = len(payload)
        for marker in _CONTINUATION_MARKERS:
            index = payload.find(marker)
            if index != -1:
                cut = min(cut, index)
        return payload[:cut]

    def _set_incomplete_todo_continuation_payload(
        self,
        task: TodoTask,
        incomplete: list[TodoTask],
        manager: ChildManager | None = None,
    ) -> None:
        marker = _TODO_CONTINUATION_MARKER
        base_payload = self._strip_continuation_markers(task.execution_payload)
        correction = self._build_incomplete_todo_correction(incomplete)

        # If there are background children still running from the just-completed
        # iteration, tell the next orchestrator about them so it doesn't
        # re-delegate the same work.  The tasks are already in flight — the
        # orchestrator should continue with the *remaining* todo items and trust
        # that completed results will appear as prior-sibling artifacts.
        if manager is not None:
            running_bg = [
                r
                for r in manager.snapshot_children()
                if r.run_in_background and not r.state.is_terminal()
            ]
            if running_bg:
                lines = [
                    "",
                    "BACKGROUND TASKS ALREADY IN FLIGHT from this iteration "
                    "(do NOT re-delegate these — they are running and will "
                    "produce artifacts automatically):",
                ]
                for r in running_bg:
                    lines.append(
                        f"  - {r.canonical_name} [{r.persona}] "
                        f"task_id={r.task_id or '?'} state={r.state.value}"
                    )
                lines.append("Proceed with the remaining incomplete todo items only.")
                correction += "\n".join(lines)

        task.set_execution_context(
            base_payload + marker + correction,
        )

    @traces(SWR.SWR_2416)
    def _budgeted_policy(self) -> RuntimePolicy:
        """Runtime policy narrowed to the orchestrator's playbook BUDGET ceiling.

        The BUDGET slot tells the orchestrator how wide it may fan out; without this the
        statement is advisory only and a model that ignores it still gets the full
        `max_active_children` allowance.
        """
        if not self.run_intent:
            return self.config.runtime
        try:
            from rotaris_core.agents.factory import resolve_playbook_for_persona
            from rotaris_core.agents.playbook import clamp_policy_to_budget

            cell = resolve_playbook_for_persona(
                self.config.default_persona,
                self.config,
                self.run_intent,
            )
            return clamp_policy_to_budget(self.config.runtime, cell)
        except Exception:  # noqa: BLE001
            _log.exception("Playbook budget clamp failed; using the configured policy")
            return self.config.runtime

    @traces(SWR.SWR_167)
    async def _run_iteration(
        self,
        iteration_num: int,
        task: TodoTask,
        progress: RalphProgressFile,
        agent_factory: RalphAgentFactory,
        todo: TodoList,
    ) -> RalphIterationState:
        started_at = dt.datetime.now(dt.UTC)
        task.status = TaskStatus.IN_PROGRESS
        self._observer.on_iteration_start(iteration_num, task)
        self.scheduler.diagnostics.timeline(
            "iteration_start",
            actor="ralph",
            message=f"Starting iteration {iteration_num}: {task.name}",
            metadata={"iteration": iteration_num, "task_id": task.id, "task_name": task.name},
        )

        manager = ChildManager(
            parent_agent_id="ralph",
            current_depth=0,
            policy=self._budgeted_policy(),
            spawn_notification_callback=lambda spawned: self._observer.on_child_spawned(
                spawned,
                manager,
            ),
            terminal_state_callback=lambda terminal: self._observer.on_child_terminal(
                terminal,
                manager,
            ),
            artifact_store=self.artifact_store,
        )
        record = manager.spawn_child(
            name=task.name,
            persona=self.config.default_persona,
            task_payload=task.execution_payload,
        )
        manager.rebind_parent(record.canonical_name)
        self._observer.on_child_created(record, manager, todo)

        record.transition(ChildTaskState.RUNNING)
        manager.bump_version()
        self._observer.on_child_running(record, manager)

        # Capture the agent's final todo state to validate completion.
        _last_todo_state: list[TodoList] = []

        def _capture_todo_state(todo_update: TodoList) -> None:
            _last_todo_state[:] = [todo_update]
            self._observer.on_todo_state(todo_update)

        runtime_kwargs: dict[str, Any] = {
            "child_manager": manager,
            "scheduler": self.scheduler,
            "agent_factory": agent_factory,
            "todo_state_callback": _capture_todo_state,
            # The root agent's child identity, mirroring spawn_children. Without
            # it the delegate executor records children under the rebound parent
            # (the task's canonical name) while background_output/wait_for_tasks
            # fall back to the persona name — the mismatch makes every lookup of
            # a valid task id return not_found (SWR-2426).
            "child_canonical_name": record.canonical_name,
            "child_task_id": record.task_id,
            "session_id": self.scheduler.binding_session_id,
            "user_prompt_barrier": self.scheduler.user_prompt_barrier,
            "on_questions_stored": self.scheduler.on_questions_stored,
        }
        runtime_kwargs.update(self._observer.extra_runtime_kwargs())

        def _todo_correction_provider() -> str | None:
            """Return a correction message if the agent left todos incomplete, else None."""
            incomplete_now = self._get_incomplete_todo_tasks(
                _last_todo_state[-1] if _last_todo_state else None,
            )
            if not incomplete_now:
                return None
            return self._build_incomplete_todo_correction(incomplete_now)

        def _open_todo_items_provider() -> list[str]:
            return [
                item.name
                for item in self._get_incomplete_todo_tasks(
                    _last_todo_state[-1] if _last_todo_state else None,
                )
            ]

        # Build a recursive factory for nested (delegated) children.  Passing
        # runtime_kwargs with the shared child_manager and scheduler lets nested
        # personas that declare ``delegate`` in their tools actually receive the
        # RotarisDelegateTool at agent-creation time.  Without this, create_agent_for_persona
        # silently drops the delegate tool when runtime_kwargs is None.
        _scheduler_ref = self.scheduler

        def _nested_child_factory(
            persona: str,
            _rk: dict[str, Any] | None = None,
            model_override: str | None = None,
        ) -> Any:
            nested_rk: dict[str, Any] = {
                "child_manager": manager,
                "scheduler": _scheduler_ref,
                "agent_factory": _nested_child_factory,
                "session_id": _scheduler_ref.binding_session_id,
                "user_prompt_barrier": _scheduler_ref.user_prompt_barrier,
                "on_questions_stored": _scheduler_ref.on_questions_stored,
            }
            if _rk:
                nested_rk.update(_rk)
            return agent_factory(persona, nested_rk, model_override=model_override)

        self._observer.bind_scheduler_callbacks(manager)
        # Baseline for the iteration's tool-call delta, which decides whether the
        # verifier suite runs (SWR-2602). The tracker is fed from the live
        # transcript, so the delta also covers nested delegated children.
        tool_calls_before = self._tool_call_counts()
        permission_engine: Any | None = None
        try:
            # Agent construction loads LLMs and reads config/prompts from
            # disk — keep it off the event loop.
            agent = await asyncio.to_thread(agent_factory, record.persona, runtime_kwargs)
            report = await self.scheduler.run_child(
                record,
                agent,
                manager=manager,
                agent_factory=_nested_child_factory,
                todo_correction_provider=_todo_correction_provider,
                max_todo_corrections=self.config.runtime.auto_retries_validation,
                open_todo_items_provider=_open_todo_items_provider,
            )
            # Resolve the child's policy engine while its binding still exists —
            # the ``finally`` below discards it, after which resolution would
            # silently fall back to the permissive default engine (SWR-2501).
            permission_engine = self._resolve_permission_engine(runtime_kwargs, record.persona)
        except asyncio.CancelledError:
            await self.scheduler.cancel_children(manager)
            # ``cancel_children`` sweeps the scheduler's *dispatched* tasks, and
            # this record is never among them — it is awaited inline above, not
            # spawned as one. Closing it here is what keeps a cancelled run from
            # leaving an agent that claims to be running for ever (SWR-2906).
            self._close_iteration_record(
                manager,
                record,
                ChildTaskState.CANCELLED,
                "Run was cancelled before this agent finished",
            )
            _log.info(
                "Child %s iteration cancelled during shutdown",
                record.canonical_name,
            )
            raise
        except Exception:
            await self.scheduler.cancel_children(manager)
            self._close_iteration_record(
                manager,
                record,
                ChildTaskState.FAILED,
                "Iteration ended with an unhandled error",
            )
            raise
        finally:
            self._observer.unbind_scheduler_callbacks()
            # The root binding key is per-iteration (child_canonical_name), so
            # drop it here the way spawn_children does for its children —
            # otherwise every iteration leaks an entry in the global registry.
            from rotaris_core.agents.tool_registration import (
                build_binding_key,
                discard_runtime_binding,
            )

            discard_runtime_binding(build_binding_key(runtime_kwargs, record.persona))

        _iter_token_usage = self._capture_iteration_tokens(record)
        self._observer.on_token_aggregate(_iter_token_usage)

        # Deterministic verification of this iteration's changes, before any
        # outcome is finalized. Runs on every outcome path; a read-only
        # iteration records the skip and its reason instead (SWR-2602).
        verifier_run = await self._run_post_change_verifier(
            iteration_num,
            report,
            tool_calls_before=tool_calls_before,
            permission_engine=permission_engine,
        )
        if verifier_run is not None:
            # Carry the evidence in the report itself (SWR-2603): the report is
            # the contract the parent agent and the hosts read, and it is what
            # the SWR-2604 completion gate will consult. Every mutation below
            # goes through model_copy(update=...), so the field survives.
            from rotaris_core.verifier.evidence import VerifierEvidence

            report = report.model_copy(
                update={"verifier_results": VerifierEvidence.from_run(verifier_run)},
            )

        # Requirement-coverage evidence and scope drift (SWR-2606/SWR-2607),
        # attached in the same place and the same way as the verifier evidence
        # above and for the same reason: both exits below rewrite the report with
        # ``model_copy(update=...)``, so a field attached here survives to either.
        report = await self._attach_requirement_evidence(iteration_num, report, verifier_run)

        # SWR-2615: the agent's conversation has ended and its report is written,
        # so this is the first moment the workspace can be asked what techstack it
        # now has. Authoring cannot change what this iteration is about to be
        # classified as — it changes the gate the *next* one resolves.
        report = await self._author_gate_if_needed(iteration_num, report)

        incomplete = self._get_incomplete_todo_tasks(
            _last_todo_state[-1] if _last_todo_state else None,
        )
        if report.status == "succeeded" and incomplete:
            # This path re-queues the task on its own, so the gate cannot change
            # the outcome here — but the decision still belongs on the report and
            # in the diagnostics, so a gated iteration is never silently requeued
            # for a different-looking reason (SWR-2604). No ``repair_task``: the
            # todo state machine already drives this re-queue and writes its own
            # continuation payload, so charging the SWR-2605 budget here would
            # give one task two competing budgets. The generic same-task guard in
            # ``_run_main_loop`` still bounds it.
            report = self._apply_completion_gate(report, iteration_num, llm_verdict=None)
            report = report.model_copy(
                update={
                    "summary": (
                        self._format_incomplete_todo_summary(incomplete)
                        + ". Re-queued task for the next iteration to continue the todo list."
                    ),
                },
            )
            self._set_incomplete_todo_continuation_payload(task, incomplete, manager=manager)
            task.status = TaskStatus.PENDING
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.SUCCEEDED, report)
            self._observer.on_iteration_end(
                record,
                report,
                manager,
                todo,
                RalphIterationOutcome.PENDING,
            )
            self.scheduler.diagnostics.timeline(
                "iteration_end",
                actor="ralph",
                message=f"Iteration {iteration_num} pending continuation",
                metadata={
                    "iteration": iteration_num,
                    "outcome": str(RalphIterationOutcome.PENDING),
                },
            )
            return RalphIterationState(
                iteration_number=iteration_num,
                task_id=task.id,
                task_name=task.name,
                started_at=started_at,
                ended_at=dt.datetime.now(dt.UTC),
                outcome=RalphIterationOutcome.PENDING,
                commit_sha=None,
                report_summary=report.summary,
                agent_response=report.final_response,
                persona=record.persona,
                token_usage=_iter_token_usage,
            )

        # Classify whether the work is complete or needs another iteration.
        # Uses the small_model LLM; skipped when classify_completion=False.
        open_todos = _open_todo_items_provider()
        report, llm_verdict = await self._classify_completion(task, report, open_todos=open_todos)

        # The deterministic gate runs last (SWR-2604): the LLM classifier judges
        # what the agent said about its work, the gate judges what the workspace's
        # own checks did to it, and the checks win. Passing the task also charges
        # its repair budget (SWR-2605), which is what bounds the re-queue.
        report = self._apply_completion_gate(
            report,
            iteration_num,
            llm_verdict=llm_verdict,
            repair_task=task,
        )

        if report.status == "succeeded":
            task.status = TaskStatus.COMPLETED
            outcome = RalphIterationOutcome.COMPLETED
            progress.completed_tasks += 1
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.SUCCEEDED, report)
        elif report.status in {"failed", "cancelled"}:
            await self.scheduler.cancel_children(manager)
            task.status = TaskStatus.ABANDONED
            outcome = RalphIterationOutcome.ABANDONED
            progress.abandoned_tasks += 1
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.FAILED, report)
            if report.escalation is not None:
                self._session_abort_requested = True
        elif report.status == "blocked":
            # Coordinator-only personas (e.g. orchestrator) may delegate work and
            # end their conversation before results arrive.  "blocked" means the
            # agent dispatched children and is waiting — re-queue for the next
            # iteration instead of aborting.  Do NOT cancel children: they are
            # still running (or have already completed) and the next iteration's
            # agent will collect their results via background_output/task_tracker.
            task.status = TaskStatus.PENDING
            outcome = RalphIterationOutcome.PENDING
            # The conversation this record describes *did* end; the outstanding
            # work is carried by the task's PENDING status, not by a record left
            # open. Recorded SUCCEEDED rather than BLOCKED because the hosts
            # render BLOCKED as a failure, and an ordinary delegation is not one
            # (SWR-2906). The children are deliberately not swept — that is what
            # the comment above is about.
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.SUCCEEDED, report)
        else:
            task.status = TaskStatus.PENDING
            outcome = RalphIterationOutcome.PENDING
            manager.mark_child_terminal(record.canonical_name, ChildTaskState.SUCCEEDED, report)

        self._observer.on_iteration_end(record, report, manager, todo, outcome)
        self.scheduler.diagnostics.timeline(
            "iteration_end",
            actor="ralph",
            message=f"Iteration {iteration_num} ended with {outcome}",
            metadata={
                "iteration": iteration_num,
                "outcome": str(outcome),
                "summary": report.summary,
            },
        )

        return RalphIterationState(
            iteration_number=iteration_num,
            task_id=task.id,
            task_name=task.name,
            started_at=started_at,
            ended_at=dt.datetime.now(dt.UTC),
            outcome=outcome,
            commit_sha=None,
            report_summary=report.summary,
            agent_response=report.final_response,
            persona=record.persona,
            token_usage=_iter_token_usage,
        )

    @traces(SWR.SWR_2602)
    def _tool_call_counts(self) -> dict[str, int]:
        """Snapshot the global per-tool call counters."""
        from rotaris_core.tracking.tracker import GlobalTracker

        return dict(GlobalTracker().get_global_tool_calls())

    @traces(SWR.SWR_2602)
    @traces(SWR.SWR_2912)
    def _close_iteration_record(
        self,
        manager: ChildManager,
        record: ChildTaskRecord,
        state: ChildTaskState,
        reason: str,
    ) -> None:
        """End an iteration that stopped without producing a report.

        Called only from the cancellation and failure handlers, where there is
        no ``ChildReportArtifact`` to record because the child never returned
        one. Closes the iteration's own record and then sweeps whatever else the
        manager still holds, so nothing this iteration owns survives it
        (SWR-2906).

        Swallows its own failures deliberately: both callers re-raise
        immediately afterwards, and a bookkeeping error here must not replace
        the cancellation or the original exception with a different one.
        """
        from rotaris_core.orchestrator.report import ChildReportArtifact  # noqa: PLC0415

        try:
            if not record.state.is_terminal():
                manager.mark_child_terminal(
                    record.canonical_name,
                    state,
                    ChildReportArtifact(
                        agent_name=record.canonical_name,
                        persona=record.persona,
                        status=str(state),
                        summary=reason,
                    ),
                )
            manager.finalize_incomplete(reason)
        except Exception:  # noqa: BLE001 - see the docstring.
            _log.exception(
                "Could not close iteration record %s after %s",
                record.canonical_name,
                state,
            )

    def _resolve_permission_engine(
        self,
        runtime_kwargs: dict[str, Any],
        persona: str,
    ) -> Any | None:
        """Return the running child's policy engine, or ``None`` if unavailable."""
        try:
            from rotaris_core.agents.tool_registration import build_binding_key
            from rotaris_core.permissions import resolve_permission_engine

            return resolve_permission_engine(build_binding_key(runtime_kwargs, persona))
        except Exception:  # noqa: BLE001 - a missing engine must not break the run
            _log.debug("Could not resolve a permission engine for the verifier", exc_info=True)
            return None

    @traces(SWR.SWR_2602)
    def _resolve_check_suite(self) -> ResolvedCheckSuite:
        """Return the suite this run verifies with, resolving it once on demand."""
        if self.check_suite is None:
            from rotaris_core.verifier.suite import resolve_check_suite

            self.check_suite = resolve_check_suite(self.config, self._workspace_root_path)
        return self.check_suite

    @traces(SWR.SWR_2615, SWR.SWR_2612)
    async def _author_gate_if_needed(
        self,
        iteration_num: int,
        report: ChildReportArtifact,
    ) -> ChildReportArtifact:
        """Record the gate's state on the report, and author one if this is the moment.

        Two jobs because they share one reading of the workspace. The state has to
        travel on the report either way — SWR-2615's whole visibility half is that
        an ungated run stops being indistinguishable from a verified one — and the
        techstack event is a property of that same reading.

        Never raises and never blocks: a workspace that cannot be fingerprinted, a
        gatekeeper that cannot be reached, and an authoring turn that finds nothing
        all leave the run exactly as it was.
        """
        try:
            from rotaris_core.verifier.authoring import authoring_decision
            from rotaris_core.verifier.gate_state import load_gate_record, refresh_gate_state
            from rotaris_core.verifier.suite import resolve_check_suite

            root = self._workspace_root_path
            before = load_gate_record(root)
            suite = await asyncio.to_thread(resolve_check_suite, self.config, root)
            after = await asyncio.to_thread(refresh_gate_state, suite, root)
        except Exception:  # noqa: BLE001 - the gate's state must never break an iteration
            _log.debug("Could not resolve the gate state after iteration %d", iteration_num)
            return report

        report = report.model_copy(update={"gate_state": after.state})
        decision = authoring_decision(self.config, before, after)
        if not decision.author:
            if decision.propose_instead:
                _log.info("Gate authoring is switched off; the drift is left for a proposal.")
            return report

        # Detached, like the improvement collector (SWR-2614): an authoring turn
        # is a model call, and awaiting it here would put its latency on the
        # critical path of an iteration it cannot change the outcome of. The
        # write lands within seconds and binds the next iteration to resolve a
        # suite; if it lands later than that, the one after binds it.
        self._start_gate_authoring(iteration_num, root, after, decision.reason)
        return report

    @traces(SWR.SWR_2614, SWR.SWR_2615)
    def _start_gate_authoring(
        self,
        iteration_num: int,
        root: Path,
        record: Any,
        reason: str,
    ) -> None:
        """Run one authoring turn beside the loop, never in front of it.

        The task is held so it is not garbage-collected mid-flight, and its
        result is applied when it arrives — including dropping the cached suite,
        so a gate written now is the gate resolved next.
        """
        from rotaris_core.verifier.authoring import record_authoring

        async def _author() -> None:
            outcome = await self._run_gatekeeper(iteration_num, root, reason)
            if outcome is None:
                return
            record_authoring(root, record, wrote=outcome.wrote, note=outcome.describe())
            if outcome.wrote:
                # The written suite must bind the next iteration, so the cached
                # resolution cannot outlive the file it came from.
                self.check_suite = None

        try:
            task = asyncio.create_task(_author())
        except RuntimeError:  # pragma: no cover - no running loop
            return
        self._gate_authoring_tasks.add(task)
        task.add_done_callback(self._gate_authoring_tasks.discard)

    @traces(SWR.SWR_2614, SWR.SWR_2615)
    async def _run_gatekeeper(self, iteration_num: int, root: Path, reason: str) -> Any:
        """One authoring turn, on the timeline. ``None`` when it could not run."""
        try:
            from rotaris_core.verifier.gatekeeper import author_gate

            outcome = await author_gate(self.config, root, reason=reason)
        except Exception:  # noqa: BLE001 - an unauthorable gate is not a failed run
            _log.warning("Gate authoring failed after iteration %d", iteration_num, exc_info=True)
            return None
        with suppress(Exception):
            self.scheduler.diagnostics.timeline(
                "verifier_gate_written" if outcome.wrote else "verifier_gate_authoring_skipped",
                actor="gatekeeper",
                message=f"Iteration {iteration_num}: {outcome.describe()}",
                metadata={
                    "iteration": iteration_num,
                    "wrote": outcome.wrote,
                    "reason": reason,
                    "refusals": list(outcome.refusals),
                    "failure": outcome.failure,
                },
            )
        return outcome

    @traces(SWR.SWR_2616)
    def _gate_repair_budget(self) -> Any:
        """This session's one-repair-per-role budget, created on first use."""
        if self._gate_repair is None:
            from rotaris_core.verifier.gate_repair import GateRepairBudget  # noqa: PLC0415

            self._gate_repair = GateRepairBudget()
        return self._gate_repair

    @traces(SWR.SWR_2612, SWR.SWR_2613)
    def _record_calibration(self, iteration_num: int, result: VerifierRunResult) -> None:
        """Put a probe pass on the timeline, so a gate that moved is visible.

        Only when this run actually probed something: a workspace whose verdicts
        were already current says nothing, which is the difference between a
        timeline and a heartbeat.
        """
        gate = result.gate
        if gate is None or not result.probed:
            return
        with suppress(Exception):
            self.scheduler.diagnostics.timeline(
                "verifier_gate_calibrated",
                actor="verifier",
                message=(
                    f"Iteration {iteration_num}: probed "
                    + ", ".join(f"{probe.check}={probe.verdict}" for probe in gate.probes)
                ),
                metadata={
                    "iteration": iteration_num,
                    "fingerprint": gate.fingerprint,
                    "state": gate.state,
                    "probes": [probe.model_dump(mode="json") for probe in gate.probes],
                },
            )

    @traces(SWR.SWR_2602, SWR.SWR_2603)
    async def _run_post_change_verifier(
        self,
        iteration_num: int,
        report: ChildReportArtifact,
        *,
        tool_calls_before: dict[str, int],
        permission_engine: Any | None,
    ) -> VerifierRunResult | None:
        """Run the resolved check suite when this iteration modified files.

        Records the run — or the skip and its reason — on the diagnostics
        timeline and hands it to the observer, then returns it so the caller can
        attach the evidence to the report (SWR-2603). Never raises: verification
        evidence is what SWR-2604 later gates on, but at this level a broken
        verifier must not be able to abort an iteration — the ``None`` return is
        that degraded path.
        """
        control: VerifierRunControl | None = None
        try:
            from rotaris_core.verifier.change_detection import detect_workspace_change
            from rotaris_core.verifier.runner import VerifierRunControl, run_check_suite

            delta = self._tool_call_delta(tool_calls_before)
            change = detect_workspace_change(
                tool_calls=delta,
                edited_files=report.edited_files,
                created_files=report.created_files,
            )
            evidence_dir = (
                self._session_dir / "evidence" / "verifier"
                if self._session_dir is not None
                else None
            )
            suite = self._resolve_check_suite()
            control = VerifierRunControl()
            if change.changed and suite.checks:
                # Only announce a suite that is actually going to run: a host
                # that lit up its verification indicator for a read-only
                # iteration would have to guess when to turn it off again.
                self._announce_verifier_start(iteration_num, suite, control)
                self._verifier_control = control
            result = await run_check_suite(
                suite,
                workspace_root=self._workspace_root_path,
                change=change,
                permission_engine=permission_engine,
                evidence_dir=evidence_dir,
                progress=_LoopVerifierProgress(self, iteration_num),
                control=control,
                # SWR-2613: the loop owns the gate's lifecycle, so the loop is
                # what pays for a probe. Every other caller reuses what it learns.
                calibrate=True,
                gate_repair=self._gate_repair_budget(),
            )
        except Exception:  # noqa: BLE001
            _log.exception("Post-change verifier run failed for iteration %d", iteration_num)
            return None
        finally:
            # Cleared on every path, including the degraded one: a host holding
            # a stale control would offer a Skip button for a suite that ended.
            self._verifier_control = None

        self.last_verifier_run = result
        # SWR-2619: the evidence has to reach the acceptance persona, and the
        # delegate tool holds the scheduler rather than the loop. Publishing it
        # here keeps one producer, and a host that never delegates simply never
        # reads it.
        with suppress(Exception):
            from rotaris_core.verifier.evidence import VerifierEvidence

            self.scheduler.last_verifier_evidence = VerifierEvidence.from_run(result)
        self._record_calibration(iteration_num, result)
        self._record_verifier_run(iteration_num, result)
        self._notify_verifier_observer(iteration_num, result)
        return result

    @traces(SWR.SWR_2609)
    def _announce_verifier_start(
        self,
        iteration_num: int,
        suite: ResolvedCheckSuite,
        control: VerifierRunControl,
    ) -> None:
        """Put the start of a verification phase on the timeline and the observer."""
        self.scheduler.diagnostics.timeline(
            "verifier_started",
            actor="verifier",
            message=(
                f"Iteration {iteration_num}: verifying with {len(suite.checks)} "
                f"check(s) from {suite.source}"
            ),
            metadata={
                "iteration": iteration_num,
                "suite_source": suite.source,
                "suite_timeout": suite.suite_timeout,
                "checks": [check.name for check in suite.checks],
            },
        )
        self._notify_observer_hook("on_verifier_started", iteration_num, suite, control)

    @traces(SWR.SWR_2609)
    def _record_verifier_check_start(
        self,
        iteration_num: int,
        check: ResolvedCheck,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        """Report one check going in, so a long run never looks like a stalled one."""
        self.scheduler.diagnostics.timeline(
            "verifier_check_started",
            actor="verifier",
            message=f"Iteration {iteration_num}: check {index}/{total} — {check.name}",
            metadata={
                "iteration": iteration_num,
                "check": check.name,
                "command": check.command,
                "index": index,
                "total": total,
                "deadline_s": round(deadline_s, 1),
                "severity": check.severity,
            },
        )
        self._notify_observer_hook(
            "on_verifier_check_started",
            iteration_num,
            check,
            index,
            total,
            deadline_s,
        )

    @traces(SWR.SWR_2609)
    def _record_verifier_check_finish(
        self,
        iteration_num: int,
        result: CheckResult,
        index: int,
        total: int,
    ) -> None:
        """Report one check's outcome as soon as it is known, not at suite end."""
        blocking_failure = result.severity == "blocking" and result.status in {"failed", "timeout"}
        self.scheduler.diagnostics.timeline(
            "verifier_check_finished",
            severity="warning" if blocking_failure else "info",
            actor="verifier",
            message=(
                f"Iteration {iteration_num}: check {index}/{total} — "
                f"{result.name} {result.status} in {result.duration_s}s"
            ),
            metadata={
                "iteration": iteration_num,
                "check": result.name,
                "index": index,
                "total": total,
                "status": result.status,
                "exit_code": result.exit_code,
                "duration_s": result.duration_s,
                "outcome_kind": result.outcome_kind,
                "skip_reason": result.skip_reason,
                "output_log_path": result.output_log_path,
            },
        )
        self._notify_observer_hook(
            "on_verifier_check_finished",
            iteration_num,
            result,
            index,
            total,
        )

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> bool:
        """Stop the check the verifier is running. Returns whether one was stopped.

        A no-op with no suite in flight, so a host may wire this to a button
        without tracking whether verification is live.
        """
        control = self._verifier_control
        if control is None:
            return False
        return control.skip_current()

    @traces(SWR.SWR_2609)
    def _notify_observer_hook(self, hook_name: str, *args: Any) -> None:
        """Offer one progress hook to the observer without depending on it.

        Same duck-typed, never-raises contract as
        :meth:`_notify_verifier_observer`: hosts predate these hooks, and a host
        that mishandles a progress report must not change what the run verified.
        """
        hook = getattr(self._observer, hook_name, None)
        if hook is None:
            return
        try:
            hook(*args)
        except Exception:  # noqa: BLE001
            _log.exception("Iteration observer failed in %s", hook_name)

    @traces(SWR.SWR_2606, SWR.SWR_2607)
    async def _attach_requirement_evidence(
        self,
        iteration_num: int,
        report: ChildReportArtifact,
        verifier_run: VerifierRunResult | None,
    ) -> ChildReportArtifact:
        """Attach requirement coverage and scope drift to *report*, or leave it alone.

        Returns the report unchanged when there is nothing to compute — the
        iteration declared no changed files, or the workspace has no requirement
        store. Both fields then stay ``None``, which reads as "not computed"
        rather than "nothing was touched".

        Never raises. This evidence reports; it does not gate, so a workspace
        whose requirement index is broken must still finish its iteration.
        """
        try:
            from rotaris_core.verifier.requirement_evidence import (
                build_iteration_evidence,
                changed_paths,
                has_requirement_store,
            )

            changed = changed_paths(
                self._workspace_root_path,
                report.edited_files,
                report.created_files,
            )
            if not changed:
                # A read-only iteration pays nothing: the sweep walks every source
                # file in the workspace and there is no answer to compute.
                return report
            if not has_requirement_store(self._workspace_root_path):
                # An unadopted workspace answers ``None`` no matter what the sweep
                # would find, so settle it here rather than paying a thread
                # hand-off per iteration to reach the same conclusion.
                return report

            checks = list(verifier_run.results) if verifier_run is not None else []
            evidence = await asyncio.to_thread(
                build_iteration_evidence,
                self._workspace_root_path,
                changed,
                checks,
            )
        except Exception:  # noqa: BLE001 - evidence must not abort an iteration.
            _log.exception(
                "Requirement-coverage evidence failed for iteration %d",
                iteration_num,
            )
            return report

        if evidence is None:
            return report

        self._record_requirement_evidence(iteration_num, evidence)
        return report.model_copy(
            update={
                "requirement_evidence": evidence.requirements,
                "scope_drift": evidence.scope_drift,
            },
        )

    @traces(SWR.SWR_2606, SWR.SWR_2607)
    def _record_requirement_evidence(
        self,
        iteration_num: int,
        evidence: IterationEvidence,
    ) -> None:
        """Make the coverage verdict visible in the session output."""
        requirements = evidence.requirements
        drift = evidence.scope_drift
        gaps = list(requirements.uncovered_requirements) + list(requirements.unrun_requirements)
        try:
            self.scheduler.diagnostics.timeline(
                "requirement_evidence",
                severity="warning" if gaps or drift.files else "info",
                actor="verifier",
                message=(
                    f"Iteration {iteration_num}: "
                    f"{len(requirements.requirements)} requirement(s) touched, "
                    f"{len(requirements.uncovered_requirements)} uncovered, "
                    f"{len(requirements.unrun_requirements)} unverified, "
                    f"{drift.total} untraced file(s) changed"
                ),
                metadata={
                    "iteration": iteration_num,
                    "touched": [req.req_id for req in requirements.requirements],
                    "uncovered": list(requirements.uncovered_requirements),
                    "unrun": list(requirements.unrun_requirements),
                    "failing": list(requirements.failing_requirements),
                    "scope_drift": list(drift.files),
                    "duration_s": requirements.duration_s,
                },
            )
        except Exception:  # noqa: BLE001 - diagnostics must not fail the run.
            _log.debug("Could not record requirement evidence on the timeline", exc_info=True)

    def _notify_verifier_observer(self, iteration_num: int, result: VerifierRunResult) -> None:
        """Offer the run to the observer without depending on it having the hook.

        Not every host observer subclasses ``RalphIterationObserver`` — Rotaris'
        run bridge is duck-typed — so a host built before this hook existed must
        not turn a verifier run into a crashed iteration.
        """
        hook = getattr(self._observer, "on_verifier_run", None)
        if hook is None:
            return
        try:
            hook(iteration_num, result)
        except Exception:  # noqa: BLE001
            _log.exception("Iteration observer failed to handle the verifier run")

    def _tool_call_delta(self, before: dict[str, int]) -> dict[str, int]:
        after = self._tool_call_counts()
        delta = {name: count - before.get(name, 0) for name, count in after.items()}
        return {name: count for name, count in delta.items() if count > 0}

    @traces(SWR.SWR_2602)
    def _record_verifier_run(self, iteration_num: int, result: VerifierRunResult) -> None:
        """Make the verifier's outcome visible in the session output."""
        if not result.executed:
            self.scheduler.diagnostics.timeline(
                "verifier_run_skipped",
                actor="verifier",
                message=f"Iteration {iteration_num}: check suite skipped. {result.skip_reason}",
                metadata={
                    "iteration": iteration_num,
                    "suite_source": result.suite_source,
                    "skip_reason": result.skip_reason,
                },
            )
            return

        failures = result.blocking_failures
        summary = ", ".join(f"{item.name}={item.status}" for item in result.results) or "no checks"
        self.scheduler.diagnostics.timeline(
            "verifier_run_completed",
            severity="warning" if failures else "info",
            actor="verifier",
            message=f"Iteration {iteration_num}: {summary}",
            metadata={
                "iteration": iteration_num,
                "suite_source": result.suite_source,
                "duration_s": result.duration_s,
                "blocking_failures": [item.name for item in failures],
                "checks": [
                    {
                        "name": item.name,
                        "command": item.command,
                        "severity": item.severity,
                        "status": item.status,
                        "exit_code": item.exit_code,
                        "duration_s": item.duration_s,
                        "outcome_kind": item.outcome_kind,
                        "output_log_path": item.output_log_path,
                        "skip_reason": item.skip_reason,
                    }
                    for item in result.results
                ],
            },
        )

    @traces(SWR.SWR_835)
    def _capture_iteration_tokens(self, record: ChildTaskRecord) -> dict[str, Any] | None:
        """Return this iteration's token usage snapshot.

        The GlobalTracker aggregate is authoritative — ``extract_token_usage``
        returns the LLM's *cumulative* running total, so summing per-iteration
        values double-counts.  The per-agent snapshot is only a fallback when
        the tracker has recorded nothing.  Also records the root agent's last
        prompt token count (context size) and the SDK-reported usage cost,
        both of which are cumulative and therefore replaced rather than summed.
        """
        from rotaris_core.cost import extract_cost_usage
        from rotaris_core.tokens import extract_token_usage, get_last_prompt_token_count
        from rotaris_core.tracking.tracker import GlobalTracker

        usage: dict[str, Any] | None = None
        aggregate = GlobalTracker().get_global_tokens()
        if aggregate.total_tokens > 0:
            usage = aggregate.model_dump(mode="json")

        agent_ref = getattr(record, "_agent_ref", None)
        if agent_ref is None:
            for conv in self.scheduler._active_conversations.values():
                agent_ref = getattr(conv, "agent", None)
                if agent_ref is not None:
                    break
        if agent_ref is not None:
            agent_llm = getattr(agent_ref, "llm", None)
            if agent_llm is not None:
                if usage is None:
                    snap = extract_token_usage(agent_llm)
                    if snap.total_tokens > 0:
                        usage = snap.model_dump(mode="json")
                GlobalTracker().set_agent_cost(
                    record.canonical_name,
                    extract_cost_usage(agent_llm),
                )
                last_prompt = get_last_prompt_token_count(agent_llm)
                if last_prompt is not None and last_prompt > 0:
                    GlobalTracker().set_agent_last_prompt_tokens(
                        record.canonical_name,
                        int(last_prompt),
                    )
                    self._observer.on_last_prompt_tokens(record, int(last_prompt))
        return usage

    def _get_intent_validator(self) -> IntentValidator | None:
        """Return a cached ``IntentValidator`` if ``validate_intent`` is enabled.

        Uses the summary model for the default persona as the LLM — no extra
        model configuration is needed.  Returns ``None`` if validation is
        disabled or the LLM cannot be resolved.
        """
        if not self.config.runtime.validate_intent:
            return None
        if self._intent_validator is not None:
            return self._intent_validator
        try:
            from rotaris_core.ralph.intent_validator import IntentValidator

            if callable(self.summary_agent):
                sa = self.summary_agent(self.config.default_persona)
            else:
                sa = self.summary_agent
            llm = getattr(sa, "llm", None)
            if llm is None:
                _log.warning("Intent validation enabled but summary agent has no LLM; skipping")
                return None
            self._intent_validator = IntentValidator(llm=llm)
        except Exception as exc:  # noqa: BLE001
            _log.warning("Failed to create IntentValidator (%s); skipping validation", exc)
            return None
        return self._intent_validator

    async def _apply_intent_validation(
        self,
        task: TodoTask,
        report: ChildReportArtifact,
    ) -> ChildReportArtifact:
        """If ``validate_intent`` is enabled and the report succeeded, verify alignment.

        Returns the original report unchanged when:
        - ``validate_intent`` is False (default)
        - The validator cannot be initialised
        - The validator returns ALIGNED or encounters an error

        Returns a failed-status report copy when the validator detects a clear
        misalignment between the task intent and the reported outcome.
        """
        if report.status != "succeeded":
            return report
        validator = self._get_intent_validator()
        if validator is None:
            return report
        result = await validator.validate(
            original_intent=task.execution_payload,
            report_summary=report.summary,
        )
        if not result.aligned:
            _log.warning(
                "Intent validation FAILED for task '%s': %s",
                task.name,
                result.reason,
            )
            return report.model_copy(
                update={
                    "status": "failed",
                    "summary": f"Intent verification failed: {result.reason}",
                },
            )
        return report

    def _find_next_pending(self, todo: TodoList) -> TodoTask | None:
        for phase in todo.phases:
            for task in phase.tasks:
                if task.status == TaskStatus.PENDING:
                    return task
        return None

    def _get_completion_classifier(self) -> CompletionClassifier | None:
        """Return a cached ``CompletionClassifier`` when ``classify_completion`` is enabled.

        Model resolution order: ``small_model`` → ``default_summary_model`` →
        summary agent's LLM → ``None`` (skip).  Returns ``None`` when disabled
        or when no suitable LLM can be resolved.
        """
        if not self.config.runtime.classify_completion:
            return None
        if self._completion_classifier is not None:
            return self._completion_classifier
        try:
            from rotaris_core.config.loader import build_llm_usage_id, load_llm_for_model
            from rotaris_core.ralph.completion_classifier import CompletionClassifier

            model_name = self.config.small_model or self.config.default_summary_model
            llm = None
            if model_name:
                try:
                    llm = load_llm_for_model(
                        self.config,
                        model_name,
                        usage_id=build_llm_usage_id("completion-classifier", model_name=model_name),
                    )
                except Exception as exc:  # noqa: BLE001
                    _log.warning(
                        "Could not load model '%s' for CompletionClassifier: %s; "
                        "falling back to summary agent LLM",
                        model_name,
                        exc,
                    )

            if llm is None:
                # Final fallback: reuse the summary agent's already-constructed LLM.
                sa = (
                    self.summary_agent(self.config.default_persona)
                    if callable(self.summary_agent)
                    else self.summary_agent
                )
                llm = getattr(sa, "llm", None)

            if llm is None:
                _log.warning("CompletionClassifier: no suitable LLM found; skipping classification")
                return None

            self._completion_classifier = CompletionClassifier(llm=llm)
        except Exception as exc:  # noqa: BLE001
            _log.warning("Failed to create CompletionClassifier (%s); skipping", exc)
            return None
        return self._completion_classifier

    async def _classify_completion(
        self,
        task: TodoTask,
        report: ChildReportArtifact,
        open_todos: list[str],
    ) -> tuple[ChildReportArtifact, CompletionVerdict | None]:
        """Run the LLM-based completion classifier on a succeeded report.

        Returns the report unchanged for non-succeeded statuses, when the
        classifier is disabled, or when it returns COMPLETE / UNCLEAR.
        Sets ``status`` to ``"partial"`` (re-queues the task) only on a
        confident NEEDS_ITERATION verdict.

        The verdict is returned alongside the report — ``None`` when the
        classifier did not run — so the deterministic gate (SWR-2604) can record
        what the LLM concluded before overriding it.
        """
        if report.status != "succeeded":
            return report, None
        # Coordinator personas (orchestrator) manage completion through child
        # delegation and the todo state machine — not through direct execution.
        # The classifier would false-positive on any orchestrator summary that
        # describes partially-delegated work ("started delegating but children
        # haven't finished"), which is the normal in-flight state for a
        # multi-phase run.  Skip classification and trust the todo state guard
        # and child DAG to drive the outcome for coordinator personas.
        if report.persona == "orchestrator":
            return report, None
        classifier = self._get_completion_classifier()
        if classifier is None:
            return report, None
        verdict = await classifier.classify(
            report=report,
            intent=task.execution_payload,
            open_todos=open_todos,
        )
        self.scheduler.diagnostics.timeline(
            "completion_classified",
            actor="ralph",
            message=f"Completion classifier: {verdict.verdict}",
            metadata={"verdict": verdict.verdict, "reason": verdict.reason},
        )
        if verdict.verdict == "NEEDS_ITERATION":
            _log.warning(
                "Completion classifier NEEDS_ITERATION for task '%s': %s",
                task.name,
                verdict.reason,
            )
            return (
                report.model_copy(
                    update={
                        "status": "partial",
                        "summary": (
                            f"Completion check: {verdict.reason}. "
                            f"Original summary: {report.summary}"
                        ),
                    },
                ),
                verdict,
            )
        return report, verdict

    @traces(SWR.SWR_2604, SWR.SWR_2605)
    def _apply_completion_gate(
        self,
        report: ChildReportArtifact,
        iteration_num: int,
        *,
        llm_verdict: CompletionVerdict | None,
        repair_task: TodoTask | None = None,
    ) -> ChildReportArtifact:
        """Let the deterministic verifier evidence overrule the LLM's verdict.

        Runs after the classifier, so a ``COMPLETE`` verdict on an iteration
        whose blocking checks failed is downgraded rather than trusted. An
        iteration that verified nothing is *exempt*, not gated — see
        :mod:`rotaris_core.verifier.gate` for why that distinction has to hold.

        Only a ``succeeded`` report is rewritten: a report that already says
        ``failed``/``cancelled``/``blocked`` has its own outcome, and gating it
        would just relabel the failure.

        Passing *repair_task* also charges the task's bounded repair budget
        (SWR-2605): a gated iteration either gets another attempt with the
        failing output injected, or — once the budget is spent — ends as
        failed-verification. Callers that re-queue the task for a different
        reason pass ``None`` and get the decision recorded without a charge,
        so two budgets never race for one task.
        """
        if not self.config.verifier.gate_completion:
            return report

        from rotaris_core.verifier.gate import evaluate_completion_gate

        decision = evaluate_completion_gate(
            report.verifier_results,
            llm_verdict=llm_verdict.verdict if llm_verdict is not None else None,
        )
        self._record_completion_gate(iteration_num, report, decision)

        gated = decision.decision == "gated" and report.status == "succeeded"
        if not gated:
            # The task verified clean (or was exempt): release any budget it
            # spent earlier, so a later regression starts from a full one.
            if repair_task is not None:
                self._repair_attempts.pop(repair_task.id, None)
            return report.model_copy(update={"completion_gate": decision})

        _log.warning(
            "Completion gate blocked iteration %d: %s",
            iteration_num,
            decision.reason,
        )
        gated_report = report.model_copy(
            update={
                "completion_gate": decision,
                "status": "partial",
                "summary": (
                    f"Verification gate: {decision.reason} Original summary: {report.summary}"
                ),
            },
        )
        if repair_task is None:
            return gated_report
        return self._apply_repair_budget(gated_report, iteration_num, task=repair_task)

    @traces(SWR.SWR_2605)
    def _apply_repair_budget(
        self,
        report: ChildReportArtifact,
        iteration_num: int,
        *,
        task: TodoTask,
    ) -> ChildReportArtifact:
        """Charge one repair attempt for a gated iteration and act on the result.

        ``retry`` keeps the ``partial`` status the gate already wrote — the task
        re-queues — and hands the next attempt the failing checks' own output.
        ``escalate`` ends the task instead: ``failed`` status, which the outcome
        dispatch turns into an abandoned task. It deliberately leaves
        ``report.escalation`` unset, because that field aborts the whole session,
        and one persistently red check should not take the other tasks with it.
        """
        from rotaris_core.verifier.repair import decide_repair

        max_attempts = self.config.verifier.max_repair_attempts
        attempts_used = self._repair_attempts.get(task.id, 0) + 1
        self._repair_attempts[task.id] = attempts_used

        gate = report.completion_gate
        unsatisfied = list(gate.unsatisfied_checks) if gate is not None else []
        decision = decide_repair(
            attempts_used=attempts_used,
            max_attempts=max_attempts,
            unsatisfied=unsatisfied,
        )
        repaired = report.model_copy(update={"repair": decision})

        if decision.action == "retry":
            self._set_repair_continuation_payload(task, repaired, decision)
            self.scheduler.diagnostics.timeline(
                "repair_attempt_scheduled",
                severity="warning",
                actor="verifier",
                message=f"Iteration {iteration_num}: {decision.reason}",
                metadata=self._repair_metadata(iteration_num, decision),
            )
            return repaired

        _log.warning("Repair budget exhausted for task %r: %s", task.name, decision.reason)
        escalated = repaired.model_copy(
            update={
                "status": "failed",
                "summary": f"{decision.reason} Original summary: {report.summary}",
            },
        )
        self._record_repair_escalation(iteration_num, escalated, decision)
        return escalated

    @traces(SWR.SWR_2605)
    def _set_repair_continuation_payload(
        self,
        task: TodoTask,
        report: ChildReportArtifact,
        decision: RepairDecision,
    ) -> None:
        """Hand the next attempt the failing checks instead of the same prompt.

        Without this a repair attempt is just the original task run again, which
        is how a red check used to consume every remaining iteration.
        """
        evidence = report.verifier_results
        if evidence is None:
            return

        from rotaris_core.verifier.repair import build_repair_context

        context = build_repair_context(
            evidence,
            attempt=decision.attempt + 1,
            max_attempts=decision.max_attempts,
        )
        base_payload = self._strip_continuation_markers(task.execution_payload)
        task.set_execution_context(base_payload + _REPAIR_CONTINUATION_MARKER + context)

    @traces(SWR.SWR_2605)
    def _record_repair_escalation(
        self,
        iteration_num: int,
        report: ChildReportArtifact,
        decision: RepairDecision,
    ) -> None:
        """Make an exhausted repair budget visible to the session and the host."""
        self.scheduler.diagnostics.timeline(
            "repair_escalation",
            severity="error",
            actor="verifier",
            message=f"Iteration {iteration_num}: {decision.reason}",
            metadata=self._repair_metadata(iteration_num, decision),
        )
        self._notify_repair_observer(iteration_num, decision, report.verifier_results)

    @staticmethod
    def _repair_metadata(iteration_num: int, decision: RepairDecision) -> dict[str, Any]:
        return {
            "iteration": iteration_num,
            "action": decision.action,
            "attempt": decision.attempt,
            "max_attempts": decision.max_attempts,
            "unsatisfied_checks": list(decision.unsatisfied_checks),
            "reason": decision.reason,
        }

    @traces(SWR.SWR_2605)
    def _notify_repair_observer(
        self,
        iteration_num: int,
        decision: RepairDecision,
        evidence: VerifierEvidence | None,
    ) -> None:
        """Offer the escalation to the observer without depending on the hook.

        Same duck-typing contract as ``_notify_verifier_observer``: Rotaris' run
        bridge does not subclass ``RalphIterationObserver``, so a host built
        before this hook existed must not turn an escalation into a crash.
        """
        hook = getattr(self._observer, "on_repair_escalation", None)
        if hook is None:
            return
        try:
            hook(iteration_num, decision, evidence)
        except Exception:  # noqa: BLE001
            _log.exception("Iteration observer failed to handle the repair escalation")

    @traces(SWR.SWR_2604)
    def _record_completion_gate(
        self,
        iteration_num: int,
        report: ChildReportArtifact,
        decision: CompletionGateDecision,
    ) -> None:
        """Make the gate decision visible in the session output."""
        evidence = report.verifier_results
        self.scheduler.diagnostics.timeline(
            "completion_gate_decision",
            severity="warning" if decision.decision == "gated" else "info",
            actor="verifier",
            message=f"Iteration {iteration_num}: completion {decision.decision}. {decision.reason}",
            metadata={
                "iteration": iteration_num,
                "decision": decision.decision,
                "reason": decision.reason,
                "unsatisfied_checks": list(decision.unsatisfied_checks),
                "advisory_failures": list(decision.advisory_failures),
                "llm_verdict": decision.llm_verdict,
                "suite_source": evidence.suite_source if evidence is not None else None,
                "verifier_verdict": evidence.verdict if evidence is not None else None,
            },
        )

    def _get_fulfillment_validator(self) -> Any | None:
        """Return a cached ``FulfillmentValidator`` if relentless is enabled."""
        if not self.config.runtime.relentless:
            return None
        if self._fulfillment_validator is not None:
            return self._fulfillment_validator
        try:
            from rotaris_core.ralph.fulfillment_validator import FulfillmentValidator

            if callable(self.summary_agent):
                sa = self.summary_agent(self.config.default_persona)
            else:
                sa = self.summary_agent
            llm = getattr(sa, "llm", None)
            if llm is None:
                _log.warning("Relentless mode enabled but summary agent has no LLM; skipping")
                return None
            self._fulfillment_validator = FulfillmentValidator(llm=llm)
        except Exception as exc:  # noqa: BLE001
            _log.warning("Failed to create FulfillmentValidator (%s); skipping", exc)
            return None
        return self._fulfillment_validator

    async def _run_relentless_check(
        self,
        original_request: str,
        progress: RalphProgressFile,
        todo: TodoList,
    ) -> bool:
        """Run the end-of-run fulfillment audit. Append remediation tasks if needed.

        Returns ``True`` when one or more remediation tasks were appended (so the
        caller should continue iterating). Returns ``False`` when the request is
        deemed fulfilled or the validator could not be initialised — in which
        case the loop terminates normally.
        """
        validator = self._get_fulfillment_validator()
        if validator is None:
            return False

        summaries = [
            it.report_summary or "(no summary)"
            for it in progress.iterations
            if it.outcome == RalphIterationOutcome.COMPLETED
        ]
        if not summaries:
            # Nothing succeeded — no point auditing; let the loop end naturally.
            return False

        result = await validator.validate(
            original_intent=original_request,
            iteration_summaries=summaries,
        )
        self._relentless_cycles_used += 1

        if result.fulfilled:
            _log.info(
                "Relentless mode: request fulfilled after %d cycle(s) — %s",
                self._relentless_cycles_used,
                result.reason,
            )
            return False

        # Build a remediation phase and let the orchestrator decompose it.
        gaps_text = (
            "\n".join(f"- {g}" for g in result.gaps)
            if result.gaps
            else "(no specific gaps enumerated; re-evaluate the original request)"
        )
        remediation_payload = (
            f"RELENTLESS REMEDIATION (cycle {self._relentless_cycles_used} of "
            f"{self.config.runtime.relentless_max_cycles}).\n\n"
            "The user's original request has not yet been fully addressed.\n\n"
            f"ORIGINAL REQUEST:\n{original_request}\n\n"
            f"AUDITOR FINDING: {result.reason}\n\n"
            f"REMAINING GAPS:\n{gaps_text}\n\n"
            "Address every remaining gap. Decompose into todo tasks, delegate to "
            "the appropriate specialists, verify the work, and only declare "
            "completion when every gap is closed."
        )
        remediation_task = TodoTask(
            name=f"Relentless remediation #{self._relentless_cycles_used}",
            description=result.reason,
        )
        remediation_task.set_execution_context(remediation_payload)
        new_phase = TodoPhase(
            name=f"Relentless Remediation {self._relentless_cycles_used}",
            tasks=[remediation_task],
        )
        todo.phases.append(new_phase)
        progress.total_tasks += len(new_phase.tasks)
        _log.info(
            "Relentless mode: cycle %d found %d gap(s); appended remediation phase",
            self._relentless_cycles_used,
            len(result.gaps),
        )
        return True
