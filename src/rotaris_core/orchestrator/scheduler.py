"""Asyncio scheduler for multi-agent orchestration."""

from __future__ import annotations

import asyncio
import inspect
import logging
import threading
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

from rotaris_core.llm_errors import (
    format_llm_runtime_error,
)
from rotaris_core.orchestrator.child_report_builder import ReportBuilderMixin
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.report import ChildReportArtifact
from rotaris_core.orchestrator.scheduler_compression import (
    SchedulerCompressionMixin,
    force_compress_child,  # noqa: F401 — re-exported for backward compat (tui/app.py)
)
from rotaris_core.orchestrator.scheduler_conversation import (
    ToolActivityRegistry,
    close_conversation_async,
    graceful_pause_conversation,
)
from rotaris_core.orchestrator.scheduler_diagnostics import (
    SchedulerDiagnosticsProxy,
)
from rotaris_core.orchestrator.scheduler_drain import (
    SchedulerDrainMixin,
)
from rotaris_core.orchestrator.scheduler_quota import (
    QuotaWaitDecision,
    await_quota_wait_decision,
    build_model_override_agent,
    quota_wait_seconds,
    same_tier_fallback_models,
)
from rotaris_core.orchestrator.scheduler_todo import (
    build_open_todo_reminder_lines,
    extract_open_todo_items,
    get_open_todo_items,
    make_open_todo_tracker,
)
from rotaris_core.orchestrator.scheduler_watchdog import (
    run_with_stall_watchdog,
)
from rotaris_core.orchestrator.transcript_progress import (  # noqa: F401
    ProgressAssessment,
    TranscriptProgressMixin,
    _format_tool_counts,
)
from rotaris_core.orchestrator.user_prompt_barrier import UserPromptBarrier
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.diagnostics import SessionDiagnostics

if TYPE_CHECKING:
    from collections.abc import Callable

    from openhands.sdk import Agent

    from rotaris_core.agents.circuit_breaker import CircuitBreaker
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.summary_agent import SummaryAgent

    ConversationEventCallback = Callable[[ChildTaskRecord, object], None]
    ConversationTokenCallback = Callable[[ChildTaskRecord, object], None]
    SpawnNotificationCallback = Callable[[ChildTaskRecord], None]
    ChildAgentFactory = Callable[..., Agent]
    StallCallback = Callable[[ChildTaskRecord, float, str], None]
    TodoCorrectionProvider = Callable[[], str | None]
    OpenTodoItemsProvider = Callable[[], list[str]]
    DiagnosticIssueCallback = Callable[[dict[str, Any]], None]

_log = logging.getLogger(__name__)


class AgentFactory(Protocol):
    """Protocol for creating agents for a given persona."""

    def __call__(self, persona: str, runtime_kwargs: dict[str, Any] | None = None) -> Agent: ...


@traces(SWR.SWR_104, SWR.SWR_110, SWR.SWR_111, SWR.SWR_131, SWR.SWR_162, SWR.SWR_177)
class Scheduler(
    ReportBuilderMixin,
    TranscriptProgressMixin,
    SchedulerCompressionMixin,
    SchedulerDrainMixin,
):
    """Core orchestration scheduler."""

    def __init__(
        self,
        config: RotarisConfig,
        workspace_root: str,
        summary_agent: SummaryAgent | Callable[[str], SummaryAgent],
        conversation_factory: Any | None = None,
        conversation_persistence_dir: str | Path | None = None,
        conversation_event_callback: ConversationEventCallback | None = None,
        conversation_token_callback: ConversationTokenCallback | None = None,
        spawn_notification_callback: SpawnNotificationCallback | None = None,
        circuit_breaker: CircuitBreaker | None = None,
        stall_callback: StallCallback | None = None,
        artifact_store: Any | None = None,
        mcp_tool_provider: Any | None = None,
    ):
        self.config = config
        self.workspace_root = workspace_root
        # Classified run intent, propagated by the owning RalphLoop once the host
        # has classified. Drives route-aware stall acceptance (SWR-2809); empty
        # means "unclassified", under which the stall guard behaves as before.
        self.run_intent: str = ""
        # This iteration's deterministic check evidence, published by the owning
        # RalphLoop after each verifier run (SWR-2619). It rides here because the
        # delegate tool holds a scheduler and not a loop, and because the suite
        # must be executed once: a persona handed the results has no reason to
        # re-run them, and one handed nothing knows to run them itself.
        self.last_verifier_evidence: Any | None = None
        self.summary_agent = summary_agent
        self._conversation_factory = conversation_factory
        self._mcp_tool_provider = mcp_tool_provider
        self._conversation_persistence_dir = (
            Path(conversation_persistence_dir) if conversation_persistence_dir is not None else None
        )
        self._session_dir: Path | None = None
        if self._conversation_persistence_dir is not None:
            if (
                self._conversation_persistence_dir.name == "conversations"
                and self._conversation_persistence_dir.parent.name == "evidence"
            ):
                self._session_dir = self._conversation_persistence_dir.parent.parent
            elif self._conversation_persistence_dir.name == "conversations":
                self._session_dir = self._conversation_persistence_dir.parent
            else:
                self._session_dir = self._conversation_persistence_dir
        self._diag: SchedulerDiagnosticsProxy = SchedulerDiagnosticsProxy(
            SessionDiagnostics(self._session_dir),
        )
        # Run-scoped namespace for tool binding keys. Parallel runs share one
        # process (Rotaris QThreads), so same-named agents in different runs
        # would otherwise clobber each other's entries in the process-global
        # binding registry (SWR-2426).
        from uuid import uuid4

        self.binding_session_id: str = (
            self._session_dir.name if self._session_dir is not None else uuid4().hex[:8]
        )
        self._conversation_event_callback = conversation_event_callback
        self._conversation_token_callback = conversation_token_callback
        self._spawn_notification_callback = spawn_notification_callback
        self._circuit_breaker = circuit_breaker
        self._circuit_breaker_disabled: bool = False
        self._stall_callback = stall_callback
        self._artifact_store = artifact_store
        self._active_tasks: dict[str, asyncio.Task[ChildReportArtifact]] = {}
        self._active_conversations: dict[str, Any] = {}
        self._tool_activity = ToolActivityRegistry()
        self._inflight_run_tasks: set[asyncio.Task[Any]] = set()
        self._task_lock = threading.Lock()
        self._conversation_lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._fallback_attempts: set[str] = set()
        self._quota_waiters: dict[str, asyncio.Future[QuotaWaitDecision]] = {}
        self._quota_fallback_attempts: set[tuple[str, str]] = set()
        self._exhausted_provider_models: set[str] = set()
        self._memory_diagnostics_enabled = bool(
            getattr(self.config.runtime, "memory_diagnostics_enabled", False),
        )
        self._memory_diagnostics_top_frames = int(
            getattr(self.config.runtime, "memory_diagnostics_top_frames", 8),
        )
        self.user_prompt_barrier = UserPromptBarrier()
        self.on_questions_stored: Callable[..., None] | None = None
        if self._memory_diagnostics_enabled:
            from rotaris_core.runtime_memory import ensure_tracemalloc_started

            ensure_tracemalloc_started(
                enabled=True,
                frames=max(self._memory_diagnostics_top_frames, 1),
            )

    @property
    def artifact_store(self) -> Any | None:
        """Session-scoped artifact store, propagated from RalphLoop."""
        return self._artifact_store

    @property
    def diagnostics(self) -> SchedulerDiagnosticsProxy:
        return self._diag

    def _record_memory_snapshot(
        self,
        label: str,
        record: ChildTaskRecord,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if not self._memory_diagnostics_enabled:
            return

        from rotaris_core.runtime_memory import capture_memory_snapshot

        snapshot = capture_memory_snapshot(
            label,
            top_frames=self._memory_diagnostics_top_frames,
        )
        self._diag.memory_snapshot(
            label=label,
            actor=record.canonical_name,
            rss_bytes=snapshot.rss_bytes,
            traced_current_bytes=snapshot.traced_current_bytes,
            traced_peak_bytes=snapshot.traced_peak_bytes,
            top_allocations=snapshot.top_allocations,
            metadata=metadata,
        )
        _log.info(
            "Memory %s child=%s rss=%s traced_current=%s traced_peak=%s",
            label,
            record.canonical_name,
            snapshot.rss_bytes,
            snapshot.traced_current_bytes,
            snapshot.traced_peak_bytes,
        )

    def set_diagnostic_issue_callback(self, callback: DiagnosticIssueCallback | None) -> None:
        self._diag.issue_callback = callback

    @traces(SWR.SWR_901, SWR.SWR_903, SWR.SWR_906, SWR.SWR_907, SWR.SWR_908)
    def resolve_quota_wait(
        self,
        actor: str,
        *,
        action: str,
        model_override: str | None = None,
    ) -> bool:
        future = self._quota_waiters.get(actor)
        if future is None or future.done():
            return False
        future.set_result(
            QuotaWaitDecision(action=action, model_override=model_override),
        )
        return True

    @traces(SWR.SWR_225)
    def _get_circuit_breaker(self) -> CircuitBreaker | None:
        if self._circuit_breaker_disabled:
            return None
        if self._circuit_breaker is None:
            from rotaris_core.agents.circuit_breaker import build_circuit_breaker

            circuit_breaker = build_circuit_breaker(self.config)
            if circuit_breaker is None:
                self._circuit_breaker_disabled = True
                return None
            self._circuit_breaker = circuit_breaker
        return self._circuit_breaker

    def _quota_wait_seconds(self, exc: Exception, *, attempt: int) -> int:
        return quota_wait_seconds(exc, attempt=attempt)

    def _same_tier_fallback_models(self, current_model: str) -> list[str]:
        return same_tier_fallback_models(self.config, current_model)

    async def _build_model_override_agent(
        self,
        agent_factory: ChildAgentFactory | None,
        record: ChildTaskRecord,
        *,
        model_override: str,
    ) -> Agent | None:
        return await build_model_override_agent(
            agent_factory,
            record,
            model_override=model_override,
        )

    async def _await_quota_wait_decision(
        self,
        *,
        actor: str,
        wait_seconds: int,
        allow_auto_resume: bool,
    ) -> QuotaWaitDecision:
        return await await_quota_wait_decision(
            self._quota_waiters,
            actor=actor,
            wait_seconds=wait_seconds,
            allow_auto_resume=allow_auto_resume,
        )

    async def _try_unresponsive_llm_fallback(
        self,
        record: ChildTaskRecord,
        persona_cfg: Any | None,
        agent_factory: ChildAgentFactory | None,
        manager: ChildManager | None,
        todo_correction_provider: Any,
        max_todo_corrections: int,
        open_todo_items_provider: Any,
    ) -> ChildReportArtifact | None:
        """Attempt persona-level fallback when the LLM is unresponsive.

        Called when ``_run_with_stall_watchdog`` exceeds ``llm_response_timeout``
        without receiving *any* LLM event.  Returns a ``ChildReportArtifact``
        if the fallback succeeded (so the caller can return it) or ``None``
        when no fallback is configured / available.

        The caller is responsible for pausing the old conversation before
        calling this method — the old LLM call may still be in-flight on a
        daemon thread.
        """
        persona_fallback: str | None = (
            persona_cfg.fallback_model if persona_cfg is not None else None
        )
        if (
            persona_fallback is None
            or agent_factory is None
            or record.canonical_name in self._fallback_attempts
        ):
            return None

        self._fallback_attempts.add(record.canonical_name)
        _log.warning(
            "Child %s LLM unresponsive after %.1fs; retrying with fallback_model=%s",
            record.canonical_name,
            self.config.runtime.llm_response_timeout,
            persona_fallback,
        )
        self._diag.timeline(
            "llm_unresponsive",
            severity="warning",
            actor=record.canonical_name,
            message=f"LLM unresponsive; retrying with fallback model {persona_fallback}",
            metadata={
                "llm_response_timeout_s": self.config.runtime.llm_response_timeout,
                "fallback_model": persona_fallback,
            },
        )
        self._diag.issue(
            kind="llm_unresponsive",
            severity="warning",
            actor=record.canonical_name,
            message=(
                f"LLM unresponsive after {self.config.runtime.llm_response_timeout}s; "
                f"retrying with {persona_fallback}"
            ),
            metadata={
                "llm_response_timeout_s": self.config.runtime.llm_response_timeout,
                "fallback_model": persona_fallback,
            },
        )
        try:
            new_agent = await asyncio.to_thread(
                agent_factory,
                record.persona,
                None,
                persona_fallback,
            )
        except TypeError:
            # Older agent_factory signatures don't accept model_override.
            new_agent = None
        if new_agent is None:
            return None

        if record.state != ChildTaskState.RUNNING:
            record.transition(ChildTaskState.RUNNING)
        return await self.run_child(
            record,
            new_agent,
            manager=manager,
            agent_factory=agent_factory,
            todo_correction_provider=todo_correction_provider,
            max_todo_corrections=max_todo_corrections,
            open_todo_items_provider=open_todo_items_provider,
        )

    @traces(SWR.SWR_3009)
    def _persona_mcp_tool_provider(self, persona: str) -> Any | None:
        """The session MCP provider, narrowed to what *persona* is granted.

        The persona is only known here, at conversation creation — the provider
        itself is session-scoped and shared. An unknown persona, or one that
        narrows nothing, gets the session provider unchanged.
        """
        from rotaris_core.mcp.scoped_tool_provider import scope_tool_provider_for_persona

        return scope_tool_provider_for_persona(
            self._mcp_tool_provider,
            self.config.personas.get(persona),
            self.config,
        )

    def _default_conversation_factory(
        self,
        agent: Agent,
        callbacks: list[Any] | None = None,
        token_callbacks: list[Any] | None = None,
        persona: str = "",
    ) -> Any:
        from openhands.sdk import LocalConversation

        from rotaris_core.providers.claude_sdk.conversation import (
            claude_sdk_conversation_if_supported,
        )

        persistence_dir = None
        if self._conversation_persistence_dir is not None:
            persistence_dir = self._conversation_persistence_dir / "event_logs"
            persistence_dir.mkdir(parents=True, exist_ok=True)

        # A claude-code agent runs Claude's own agent loop instead (SWR-778);
        # everything else about the child is identical, so the selector returns
        # None and the normal conversation is built when it does not apply.
        claude_conversation = claude_sdk_conversation_if_supported(
            agent,
            workspace=self.workspace_root,
            persistence_dir=persistence_dir,
            callbacks=callbacks,
            token_callbacks=token_callbacks,
            enabled=bool(getattr(self.config.runtime, "claude_sdk_native_loop", True)),
        )
        if claude_conversation is not None:
            return claude_conversation

        kwargs: dict[str, Any] = dict(
            agent=agent,
            workspace=self.workspace_root,
            persistence_dir=persistence_dir,
            callbacks=callbacks,
            token_callbacks=token_callbacks,
            visualizer=None,
            delete_on_close=False,
        )
        scoped_provider = self._persona_mcp_tool_provider(persona)
        if scoped_provider is not None:
            kwargs["mcp_tool_provider"] = scoped_provider

        return LocalConversation(**kwargs)

    def _create_conversation(
        self,
        agent: Agent,
        callbacks: list[Any] | None = None,
        token_callbacks: list[Any] | None = None,
        persona: str = "",
    ) -> Any:
        if self._conversation_factory is None:
            return self._default_conversation_factory(
                agent,
                callbacks=callbacks,
                token_callbacks=token_callbacks,
                persona=persona,
            )

        factory = self._conversation_factory
        try:
            signature = inspect.signature(factory)
        except (TypeError, ValueError):
            signature = None

        if signature is not None:
            accepts_kwargs = any(
                parameter.kind == inspect.Parameter.VAR_KEYWORD
                for parameter in signature.parameters.values()
            )
            kwargs: dict[str, Any] = {}
            if accepts_kwargs or "callbacks" in signature.parameters:
                kwargs["callbacks"] = callbacks
            if accepts_kwargs or "token_callbacks" in signature.parameters:
                kwargs["token_callbacks"] = token_callbacks
            if kwargs:
                return factory(agent, **kwargs)

        return factory(agent)

    def _validate_conversation_workspace(self, conversation: Any, record: ChildTaskRecord) -> None:
        workspace = getattr(conversation, "workspace", None)
        if workspace is None:
            workspace = getattr(getattr(conversation, "state", None), "workspace", None)
        working_dir = getattr(workspace, "working_dir", None)
        if working_dir is None:
            return

        expected = Path(self.workspace_root).resolve()
        actual = Path(str(working_dir)).resolve()
        if actual == expected:
            return

        raise RuntimeError(
            "Child conversation workspace mismatch for "
            f"{record.canonical_name}: expected {expected}, got {actual}. "
            "Refusing to run tools in a different workspace.",
        )

    def _inject_pending_steering_prompts(
        self,
        conversation: Any,
        record: ChildTaskRecord,
        *,
        on_injected: Any | None = None,
    ) -> bool:
        from rotaris_core.core.prompt_types import PromptRegistry, SteeringStatus

        registry = PromptRegistry()
        pending_prompts = [
            prompt
            for prompt in registry.get_steering_prompts(record.canonical_name)
            if prompt.status == SteeringStatus.PENDING
        ]
        if not pending_prompts:
            return False

        for prompt in pending_prompts:
            conversation.send_message(self._format_steering_prompt(prompt.content))
            registry.mark_steering_as_injected(prompt.id)
            if on_injected is not None:
                on_injected()
            _log.info(
                "Injected steering prompt for child %s prompt_id=%s",
                record.canonical_name,
                prompt.id,
            )
        return True

    @staticmethod
    def _format_steering_prompt(content: str) -> str:
        return f"[STEERING PROMPT]\n{content}"

    async def _run_with_stall_watchdog(
        self,
        conversation: Any,
        record: ChildTaskRecord,
        last_activity: list[float],
        stall_timeout_override: int | None = None,
        on_steering_injected: Any | None = None,
        active_tool_call_ids: set[str] | None = None,
        recent_tool_calls: list[dict[str, str]] | None = None,
        last_llm_event_type: str | None = None,
    ) -> None:
        """Run ``conversation.run`` off-thread while a watchdog logs stalls."""
        await run_with_stall_watchdog(
            conversation,
            record,
            last_activity,
            config=self.config,
            diag=self._diag,
            stall_callback=self._stall_callback,
            inject_steering=self._inject_pending_steering_prompts,
            stall_timeout_override=stall_timeout_override,
            on_steering_injected=on_steering_injected,
            active_tool_call_ids=active_tool_call_ids,
            recent_tool_calls=recent_tool_calls,
            last_llm_event_type=last_llm_event_type,
        )

    async def run_child(
        self,
        record: ChildTaskRecord,
        agent: Agent,
        *,
        manager: ChildManager | None = None,
        agent_factory: ChildAgentFactory | None = None,
        todo_correction_provider: TodoCorrectionProvider | None = None,
        max_todo_corrections: int = 0,
        open_todo_items_provider: OpenTodoItemsProvider | None = None,
    ) -> ChildReportArtifact:
        """Run a child agent conversation with timeout enforcement."""
        from rotaris_core.orchestrator.child_run import run_child_impl

        return await run_child_impl(
            self,
            record,
            agent,
            manager=manager,
            agent_factory=agent_factory,
            todo_correction_provider=todo_correction_provider,
            max_todo_corrections=max_todo_corrections,
            open_todo_items_provider=open_todo_items_provider,
        )

    async def spawn_children(
        self,
        manager: ChildManager,
        agent_factory: AgentFactory,
        parent_agent_id: str | None = None,
    ) -> list[str]:
        """Claim and spawn ready direct children as asyncio tasks."""
        from rotaris_core.agents.tool_registration import (
            build_binding_key,
            discard_runtime_binding,
        )

        spawned_names: list[str] = []
        for claim in manager.claim_ready_children(parent_agent_id):
            record = manager.record_for_launch_claim(claim)
            if record is None:
                self._record_stale_launch_claim(claim, "before agent construction")
                continue
            _capture_todo_state, open_todo_items_provider = self._make_open_todo_tracker()

            def _per_child_todo_callback(
                todo: Any,
                _capture: Any = _capture_todo_state,
                _manager: Any = manager,
                _record: Any = record,
            ) -> None:
                """Capture todo into the tracker AND persist into the child record.

                Runs inside ``asyncio.to_thread`` — protected by the same lock as
                ``spawn_child`` / ``mark_child_terminal`` (REQ-20260429-120000-NF-002).
                """
                _capture(todo)
                with _manager._lock:
                    _record.todo_state = todo.model_dump(mode="json")

            runtime_kwargs = {
                "todo_state_callback": _per_child_todo_callback,
                "child_manager": manager,
                "child_canonical_name": record.canonical_name,
                "child_task_id": record.task_id,
                "session_id": self.binding_session_id,
                "user_prompt_barrier": self.user_prompt_barrier,
                "on_questions_stored": self.on_questions_stored,
            }
            binding_key = build_binding_key(runtime_kwargs, record.persona)

            try:
                try:
                    agent = await asyncio.to_thread(
                        agent_factory,
                        record.persona,
                        runtime_kwargs,
                    )
                except TypeError:
                    agent = await asyncio.to_thread(agent_factory, record.persona)
            except asyncio.CancelledError:
                discard_runtime_binding(binding_key)
                report = ChildReportArtifact(
                    agent_name=record.canonical_name,
                    persona=record.persona,
                    status="cancelled",
                    summary="Child launch was cancelled during agent construction",
                )
                cancelled = manager.transition_launch_claim(claim, ChildTaskState.CANCELLED)
                if cancelled is not None:
                    manager.mark_child_terminal(
                        record.canonical_name,
                        ChildTaskState.CANCELLED,
                        report,
                    )
                raise
            except Exception as exc:  # noqa: BLE001
                discard_runtime_binding(binding_key)
                failed = manager.transition_launch_claim(claim, ChildTaskState.FAILED)
                if failed is None:
                    self._record_stale_launch_claim(claim, "after agent-construction failure")
                    continue
                report = ChildReportArtifact(
                    agent_name=record.canonical_name,
                    persona=record.persona,
                    status="failed",
                    summary=f"Child failed before launch: {format_llm_runtime_error(exc)}",
                )
                manager.mark_child_terminal(record.canonical_name, ChildTaskState.FAILED, report)
                _log.exception(
                    "Child %s failed before launch",
                    record.canonical_name,
                )
                continue

            running_record = manager.transition_launch_claim(claim, ChildTaskState.RUNNING)
            if running_record is None:
                discard_runtime_binding(binding_key)
                self._record_stale_launch_claim(claim, "after agent construction")
                continue
            record = running_record
            if self._spawn_notification_callback is not None:
                try:
                    self._spawn_notification_callback(record)
                except Exception:  # noqa: BLE001
                    _log.exception(
                        "Spawn notification callback failed for child %s",
                        record.canonical_name,
                    )
            task = asyncio.create_task(
                self._run_child_and_mark_terminal(
                    record,
                    agent,
                    manager=manager,
                    agent_factory=agent_factory,
                    open_todo_items_provider=open_todo_items_provider,
                ),
            )

            # Retries inside run_child rebuild the agent under the same key, so the
            # binding is only safe to drop once the whole child task is done.
            def _drop_binding(
                _task: asyncio.Task[ChildReportArtifact],
                _key: str = binding_key,
            ) -> None:
                discard_runtime_binding(_key)

            task.add_done_callback(_drop_binding)
            self._active_tasks[record.canonical_name] = task
            spawned_names.append(record.canonical_name)
        return spawned_names

    def _record_stale_launch_claim(self, claim: Any, phase: str) -> None:
        """Persist enough identity to diagnose a suppressed launch attempt."""
        metadata = {
            "task_id": claim.task_id,
            "parent_agent_id": claim.parent_agent_id,
            "claim_id": claim.claim_id,
            "phase": phase,
        }
        self._diag.timeline(
            "child_launch_suppressed",
            actor=claim.canonical_name,
            message=f"Suppressed stale launch claim {claim.claim_id} during {phase}",
            metadata=metadata,
        )
        self._diag.issue(
            kind="stale_child_launch_claim",
            severity="warning",
            actor=claim.canonical_name,
            message=f"Child launch claim {claim.claim_id} became stale during {phase}.",
            metadata=metadata,
        )

    async def _run_child_and_mark_terminal(
        self,
        record: ChildTaskRecord,
        agent: Agent,
        *,
        manager: ChildManager,
        agent_factory: AgentFactory,
        open_todo_items_provider: OpenTodoItemsProvider | None = None,
    ) -> ChildReportArtifact:
        """Run one child and persist its terminal state without a drain harvester."""
        try:
            report = await self.run_child(
                record,
                agent,
                manager=manager,
                agent_factory=agent_factory,
                open_todo_items_provider=open_todo_items_provider,
            )
            terminal_state = self._report_status_to_terminal_state(report.status)
        except asyncio.CancelledError:
            report = ChildReportArtifact(
                agent_name=record.canonical_name,
                persona=record.persona,
                status="cancelled",
                summary="Task was cancelled",
            )
            terminal_state = ChildTaskState.CANCELLED
            manager.mark_child_terminal(record.canonical_name, terminal_state, report)
            self._record_child_terminal_diagnostics(record, agent, terminal_state)
            self._diag.issue(
                kind="child_force_cancelled",
                severity="warning",
                actor=record.canonical_name,
                message=(
                    f"Child {record.canonical_name} ({record.persona}) was "
                    "cancelled before completing its task, most likely because "
                    "the run concluded (or was shut down) while it was still "
                    "in flight."
                ),
                metadata={"persona": record.persona, "task_id": record.task_id},
            )
            raise
        except Exception as exc:
            report = ChildReportArtifact(
                agent_name=record.canonical_name,
                persona=record.persona,
                status="failed",
                summary=f"Task failed: {format_llm_runtime_error(exc)}",
            )
            terminal_state = ChildTaskState.FAILED
            _log.exception("Child %s task failed outside run_child", record.canonical_name)

        try:
            manager.mark_child_terminal(record.canonical_name, terminal_state, report)
            self._record_child_terminal_diagnostics(record, agent, terminal_state)
            if record.run_in_background:
                self._pause_parent_for_background_notification(manager)

            await self.spawn_children(
                manager,
                agent_factory,
                parent_agent_id=record.parent_agent_id or manager.parent_agent_id,
            )
            return report
        finally:
            self._active_tasks.pop(record.canonical_name, None)

    def _record_child_terminal_diagnostics(
        self,
        record: ChildTaskRecord,
        agent: Agent,
        terminal_state: ChildTaskState,
    ) -> None:
        status = terminal_state.value if hasattr(terminal_state, "value") else str(terminal_state)
        self._diag.timeline(
            "child_end",
            actor=record.canonical_name,
            message=f"Child {record.canonical_name} ended with {status}",
            metadata={
                "persona": record.persona,
                "conversation_id": record.conversation_id,
                "state": status,
            },
        )
        self._record_memory_snapshot(
            "child_end",
            record,
            metadata={
                "persona": record.persona,
                "conversation_id": record.conversation_id,
                "state": status,
                "active_tasks": len(self._active_tasks),
                "active_conversations": len(self._active_conversations),
            },
        )
        self._diag.conversation_index(
            conversation_id=record.conversation_id or record.canonical_name,
            agent_name=record.canonical_name,
            persona=record.persona,
            model=str(getattr(getattr(agent, "llm", None), "model", "?")),
            task_id=record.task_id,
            status=status,
        )

    def _pause_parent_for_background_notification(self, manager: ChildManager) -> None:
        """Interrupt the parent conversation so queued notifications can be injected.

        Force-close is **disabled** on deadline — the parent will be resumed
        after the notification is injected and must keep its MCP connections
        alive.  If tools are still running when the deadline expires we pause
        immediately instead of killing the conversation.
        """
        parent_id = getattr(manager, "_parent_id", None)
        if not parent_id:
            return
        with self._conversation_lock:
            parent_conversation = self._active_conversations.get(parent_id)
        if parent_conversation is not None:
            self._graceful_pause_conversation(
                parent_conversation,
                str(parent_id),
                force_close_on_deadline=False,
            )

    async def cancel_children(self, manager: ChildManager) -> None:
        """Cancel all active asyncio tasks."""
        active_items = list(self._active_tasks.items())
        for _, task in active_items:
            if not task.done():
                task.cancel()
        if self._active_tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self._active_tasks.values(), return_exceptions=True),
                    timeout=5.0,
                )
            except TimeoutError:
                _log.warning(
                    "cancel_children: %d task(s) did not finish within 5s; "
                    "proceeding with forced cleanup",
                    sum(1 for t in self._active_tasks.values() if not t.done()),
                )
        for canonical_name, _ in active_items:
            record = manager._children.get(canonical_name)
            if record is None or record.state.is_terminal():
                continue
            report = ChildReportArtifact(
                agent_name=canonical_name,
                persona=record.persona,
                status="cancelled",
                summary="Task was cancelled during parent failure cleanup",
            )
            manager.mark_child_terminal(canonical_name, ChildTaskState.CANCELLED, report)
            self._diag.issue(
                kind="child_force_cancelled",
                severity="warning",
                actor=canonical_name,
                message=(
                    f"Child {canonical_name} ({record.persona}) was force-cancelled "
                    "during parent cleanup before it reached a terminal state."
                ),
                metadata={"persona": record.persona, "task_id": record.task_id},
            )
        self._active_tasks.clear()

    async def cancel_child(self, manager: ChildManager, canonical_name: str) -> bool:
        """Cancel one queued or running child and cascade dependency blocking."""
        record = manager._children.get(canonical_name)
        if record is None or record.state.is_terminal():
            return False
        task = self._active_tasks.get(canonical_name)
        if task is not None and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(asyncio.gather(task, return_exceptions=True), timeout=5.0)
            except TimeoutError:
                _log.warning("cancel_child: %s did not stop within 5s", canonical_name)
        if not record.state.is_terminal():
            report = ChildReportArtifact(
                agent_name=canonical_name,
                persona=record.persona,
                status="cancelled",
                summary="Task was cancelled by the user",
            )
            manager.mark_child_terminal(canonical_name, ChildTaskState.CANCELLED, report)
        self._diag.timeline(
            "child_user_cancelled",
            actor=canonical_name,
            message=f"Child {canonical_name} was cancelled by the user",
            metadata={"persona": record.persona, "task_id": record.task_id},
        )
        return True

    def has_active_children(self) -> bool:
        """True if any spawned child task is still running."""
        return any(not task.done() for task in self._active_tasks.values())

    async def drain_active_children(self, timeout: float) -> None:
        """Wait (without cancelling) for active child tasks to finish.

        Unlike :meth:`cancel_children`, this never cancels anything — it gives
        legitimately in-flight background work (e.g. a child an orchestrator
        delegated to and is waiting on via ``wait_for_tasks``) a bounded grace
        period to finish naturally so its results are captured, instead of the
        run concluding and teardown killing it mid-flight.
        """
        active = [task for task in self._active_tasks.values() if not task.done()]
        if not active or timeout <= 0:
            return
        try:
            await asyncio.wait_for(
                asyncio.gather(*active, return_exceptions=True),
                timeout=timeout,
            )
        except TimeoutError:
            still_running = sum(1 for task in active if not task.done())
            _log.warning(
                "drain_active_children: %d task(s) still running after %.0fs "
                "grace period; will be cancelled during shutdown",
                still_running,
                timeout,
            )
            self._diag.issue(
                kind="background_child_drain_timeout",
                severity="warning",
                actor="scheduler",
                message=(
                    f"{still_running} background child task(s) still running "
                    f"after {timeout:.0f}s drain grace period at run "
                    "conclusion; will be force-cancelled during shutdown."
                ),
                metadata={"still_running": still_running, "timeout_s": timeout},
            )

    async def wait_for_any_terminal(
        self,
        manager: ChildManager,
        only_names: set[str] | None = None,
    ) -> list[tuple[ChildTaskRecord, ChildReportArtifact]]:
        """Wait until at least one active task completes.

        When ``only_names`` is given, only tasks with those canonical names
        are awaited — the drain loops pass their freshly spawned names to
        avoid deadlocking on the *current* (outer) task, which is also in
        ``_active_tasks``.
        """
        if only_names is None:
            candidates = dict(self._active_tasks)
        else:
            candidates = {
                name: task for name, task in self._active_tasks.items() if name in only_names
            }
        if not candidates:
            return manager.get_newly_terminal()

        task_names = {task: name for name, task in candidates.items()}
        done, _ = await asyncio.wait(
            tuple(task_names.keys()),
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in done:
            canonical_name = task_names[task]
            record = manager._children[canonical_name]

            try:
                report = task.result()
                terminal_state = self._report_status_to_terminal_state(report.status)
            except asyncio.CancelledError:
                report = ChildReportArtifact(
                    agent_name=canonical_name,
                    persona=record.persona,
                    status="cancelled",
                    summary="Task was cancelled",
                )
                terminal_state = ChildTaskState.CANCELLED
            except Exception as exc:
                report = ChildReportArtifact(
                    agent_name=canonical_name,
                    persona=record.persona,
                    status="failed",
                    summary=f"Task failed: {exc}",
                )
                terminal_state = ChildTaskState.FAILED

            if not record.state.is_terminal():
                manager.mark_child_terminal(canonical_name, terminal_state, report)

        return manager.get_newly_terminal()

    @staticmethod
    def _report_status_to_terminal_state(status: str) -> ChildTaskState:
        normalized = status.strip().lower()
        mapping = {
            "succeeded": ChildTaskState.SUCCEEDED,
            "partial": ChildTaskState.SUCCEEDED,
            "failed": ChildTaskState.FAILED,
            "cancelled": ChildTaskState.CANCELLED,
            "blocked": ChildTaskState.BLOCKED,
        }
        return mapping.get(normalized, ChildTaskState.FAILED)

    def request_stop(self, *, force: bool = False) -> None:
        """Best-effort stop for all active conversations and tasks.

        This is invoked from the UI / signal-handler thread and **must not**
        block the caller. ``conversation.pause()`` and ``conversation.close()``
        can both block waiting on the SDK worker thread (which itself may be
        stuck inside a synchronous LLM call), so we dispatch them to daemon
        threads. Otherwise calling stop/pause from the TUI freezes the event
        loop and even Ctrl+C cannot recover.
        """
        self.user_prompt_barrier.cancel_all()
        self._release_pending_approvals()
        with self._conversation_lock:
            snap = list(self._active_conversations.items())
        for canonical_name, conversation in snap:
            self._graceful_pause_conversation(conversation, canonical_name)
            if force:
                close_conversation_async(conversation, name_hint=canonical_name)

        if self._loop is None or self._loop.is_closed():
            return
        self._loop.call_soon_threadsafe(self._cancel_inflight_tasks)

        if force:
            # Second-pass: force-cancel any remaining active tasks that may
            # have been added after the first pass over _active_tasks.  This
            # guarantees that even if run_child spawned a new child task
            # between the _cancel_inflight_tasks call and now, it gets
            # cancelled too.
            self._loop.call_soon_threadsafe(self._force_cancel_remaining)

    @traces(SWR.SWR_2504)
    def _release_pending_approvals(self) -> None:
        """Unblock dispatches waiting on a permission approval (SWR-2504).

        A stop must not wait out ``approval_timeout_seconds``: the cancelled
        waits resolve fail-safe to deny, exactly like the question prompts
        released one line above.
        """
        from rotaris_core.permissions import resolve_approval_host

        host = resolve_approval_host(self.binding_session_id)
        if host is not None:
            host.barrier.cancel_all()

    def _graceful_pause_conversation(
        self,
        conversation: Any,
        canonical_name: str,
        *,
        force_close_when_stuck: bool = False,
        force_close_on_deadline: bool = True,
    ) -> None:
        """Delegate to :func:`graceful_pause_conversation` with this scheduler's registry."""
        graceful_pause_conversation(
            conversation,
            canonical_name,
            registry=self._tool_activity,
            tool_deadline=float(
                getattr(self.config.runtime, "graceful_pause_tool_deadline", 30.0),
            ),
            force_close_when_stuck=force_close_when_stuck,
            force_close_on_deadline=force_close_on_deadline,
        )

    def _cancel_inflight_tasks(self) -> None:
        with self._task_lock:
            inflight_tasks = list(self._inflight_run_tasks)
        for task in inflight_tasks:
            if not task.done():
                task.cancel()

        for task in list(self._active_tasks.values()):
            if not task.done():
                task.cancel()

    def _force_cancel_remaining(self) -> None:
        """Second-pass: force-cancel all remaining active tasks.

        Called by ``request_stop(force=True)`` to ensure that any asyncio tasks
        created between the first cancellation pass and now are also cancelled.
        This is a safety net for race conditions during rapid shutdown.
        """
        with self._task_lock:
            for task in list(self._inflight_run_tasks):
                if not task.done():
                    task.cancel()

        for task in list(self._active_tasks.values()):
            if not task.done():
                task.cancel()

    def _conversation_terminal_failure_status(self, conversation: Any) -> str | None:
        state = getattr(conversation, "state", None)
        execution_status = getattr(state, "execution_status", None)
        if execution_status is None:
            return None

        status_value = str(getattr(execution_status, "value", execution_status)).lower()
        if status_value in {"stuck", "error"}:
            return status_value
        return None

    def _recent_circuit_breaker_events(self, conversation: Any) -> list[object]:
        """Return only the event tail the circuit breaker can inspect."""
        events = getattr(getattr(conversation, "state", None), "events", None)
        if events is None:
            return []
        max_recent = int(max(1, self.config.circuit_breaker.max_recent_events))
        return list(events[-max_recent:])

    @staticmethod
    def _extract_open_todo_items(todo: Any) -> list[str]:
        return extract_open_todo_items(todo)

    @staticmethod
    def _get_open_todo_items(
        provider: OpenTodoItemsProvider | None,
    ) -> list[str]:
        return get_open_todo_items(provider)

    @staticmethod
    def _build_open_todo_reminder_lines(open_todo_items: list[str] | None) -> list[str]:
        return build_open_todo_reminder_lines(open_todo_items)

    def _make_open_todo_tracker(self) -> tuple[Callable[[Any], None], OpenTodoItemsProvider]:
        return make_open_todo_tracker(extractor=self._extract_open_todo_items)


# Re-exported for backward compatibility — imported by tui/app.py.
# Actual implementation lives in scheduler_compression.py.
