"""Child conversation execution for the Scheduler.

This module owns the per-child LocalConversation run loop. ``Scheduler.run_child``
remains the public seam; the implementation lives here so scheduler.py can stay
focused on orchestration wiring.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

from rotaris_core.llm_errors import (
    extract_quota_exhausted_model,
    format_llm_runtime_error,
    is_insufficient_quota_error,
    is_rate_limit_error,
    is_transient_llm_runtime_error,
    should_condense_llm_bad_request,
)
from rotaris_core.model_input import model_input_context
from rotaris_core.orchestrator.child_report_builder import _STALL_RECOVERY_LIMIT
from rotaris_core.orchestrator.child_state import ChildTaskRecord, ChildTaskState
from rotaris_core.orchestrator.report import (
    ChildReportArtifact,
    extract_final_response,
    extract_last_response,
)
from rotaris_core.orchestrator.scheduler_conversation import (
    _llm_bad_request_errors,
    close_conversation_async,
)
from rotaris_core.orchestrator.scheduler_diagnostics import (
    describe_timed_tool_event,
    diagnose_mcp_error,
)
from rotaris_core.orchestrator.scheduler_drain import _LLM_BAD_REQUEST_RECOVERY_LIMIT
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tracking.tracker import GlobalTracker

if TYPE_CHECKING:
    from collections.abc import Callable

    from openhands.sdk import Agent

    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.scheduler import Scheduler

    ChildAgentFactory = Callable[..., Agent]
    TodoCorrectionProvider = Callable[[], str | None]
    OpenTodoItemsProvider = Callable[[], list[str]]

_log = logging.getLogger("rotaris_core.orchestrator.scheduler")
_tracker = GlobalTracker()

_RECOVERY_ELIGIBLE_OUTCOMES = frozenset(
    {
        "housekeeping_only",
        "malformed_tool_attempt",
        "message_only",
        "empty_stalled",
        # A child that terminated without doing the work is still a stall on an
        # execution route (SWR-2808); the answer-only route opts out below.
        "answered",
    },
)


@traces(SWR.SWR_3010)
def _record_resolved_tool_set(self: Scheduler, record: ChildTaskRecord, agent: Agent) -> None:
    """Store on the record the tool set this agent was actually built with.

    The inspector needs the resolved set, not the persona's declaration, and it
    must not re-derive it — re-deriving means re-running MCP discovery, on the UI
    thread. Recording it here is cheap: ``agent.tools`` is the registered native
    set, and the MCP names come from the discovery cache the agent's own creation
    just warmed. A failure here costs a panel a detail, never a run — hence the
    broad catch.
    """
    try:
        record.granted_tools = [tool.name for tool in agent.tools]
        mcp_config = getattr(agent, "mcp_config", None) or {}
        if not mcp_config:
            record.granted_mcp_tools = {}
            return

        from rotaris_core.agents.factory import _runtime_mcp_tools
        from rotaris_core.config.mcp_grants import resolve_mcp_tool_grants

        persona = self.config.personas.get(record.persona)
        if persona is None:
            return
        grants = resolve_mcp_tool_grants(persona, self.config)
        record.granted_mcp_tools = {
            server: [tool.name for tool in _runtime_mcp_tools(server, self.config, grants)]
            for server in mcp_config
            if server in self.config.mcp_servers
        }
    except Exception:  # noqa: BLE001
        _log.debug(
            "Could not record the resolved tool set for child %s",
            record.canonical_name,
            exc_info=True,
        )


@traces(SWR.SWR_165, SWR.SWR_2132, SWR.SWR_2809)
async def run_child_impl(
    self: Scheduler,
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
    self._loop = asyncio.get_running_loop()
    current_task = asyncio.current_task()
    if current_task is not None:
        with self._task_lock:
            self._inflight_run_tasks.add(current_task)

    from rotaris_core.agents.circuit_breaker import CircuitBreakerSession

    breaker_session = CircuitBreakerSession(self.config.circuit_breaker)
    callbacks: list[Any] | None = None
    conversation_ref: dict[str, Any] = {}
    event_callback = self._conversation_event_callback
    # Stall watchdog: updated by every event/token; consulted by watchdog task.
    last_activity = [time.monotonic()]
    run_start = time.monotonic()
    tool_call_started_at: dict[str, float] = {}
    tool_call_args: dict[str, str] = {}
    active_tool_call_ids: set[str] = set()
    completed_tool_call_ids: set[str] = set()
    recent_tool_calls: list[dict[str, str]] = []
    last_llm_event_type: str | None = None

    def _elapsed() -> float:
        return time.monotonic() - run_start

    def _mark_activity() -> None:
        last_activity[0] = time.monotonic()

    def _log_tool_call_timing(event: object) -> None:
        described = describe_timed_tool_event(event)
        if described is None:
            return

        phase, tool_name, tool_call_id, status, args, result = described
        now = time.monotonic()
        if phase == "start":
            if tool_call_id not in completed_tool_call_ids:
                tool_call_started_at.setdefault(tool_call_id, now)
                active_tool_call_ids.add(tool_call_id)
                # wait_for_tasks is a meta-scheduling tool that blocks the
                # parent for minutes.  Tracking it in the tool-activity
                # registry causes graceful_pause_conversation to force-close
                # the parent after a 30 s deadline, because the pause itself
                # races with the SDK's tool_finished callback, leaking the
                # call ID forever.  Exclude it so the parent can be paused
                # normally while waiting for delegated children.
                if tool_name != "wait_for_tasks":
                    self._tool_activity.tool_started(record.canonical_name, tool_call_id)
                if args is not None:
                    tool_call_args[tool_call_id] = args
            return

        if tool_call_id in completed_tool_call_ids:
            return

        started_at = tool_call_started_at.pop(tool_call_id, None)
        if started_at is None:
            active_tool_call_ids.discard(tool_call_id)
            return

        completed_tool_call_ids.add(tool_call_id)
        active_tool_call_ids.discard(tool_call_id)
        # Update the scheduler-level registry (used by graceful pause).
        # Exclude wait_for_tasks — see comment at tool_started site above.
        if tool_name != "wait_for_tasks":
            self._tool_activity.tool_finished(record.canonical_name, tool_call_id)
        elapsed_s = max(0.0, now - started_at)
        elapsed_ms = max(1, int(round(elapsed_s * 1000)))
        is_error = status in {"error", "failed", "rejected"}
        # Track last 5 tool calls for stall/timeout diagnostics.
        recent_tool_calls.append(
            {"tool": tool_name, "status": status, "elapsed_ms": str(elapsed_ms)},
        )
        if len(recent_tool_calls) > 5:
            recent_tool_calls[:] = recent_tool_calls[-5:]
        _log.info(
            "Child %s tool %s call_id=%s status=%s elapsed_ms=%d",
            record.canonical_name,
            tool_name,
            tool_call_id,
            status,
            elapsed_ms,
        )
        self._diag.tool_call(
            agent_name=record.canonical_name,
            tool_name=tool_name,
            call_id=tool_call_id,
            status=status,
            elapsed_ms=elapsed_ms,
            is_error=is_error,
            args=tool_call_args.pop(tool_call_id, None),
            result=result,
            outcome_kind=described.outcome_kind,
            exit_code=described.exit_code,
            failure_kind=described.failure_kind,
            warnings=described.warnings,
        )

    def _emit_event(event: object) -> None:
        _mark_activity()
        # Track last LLM event type for stall/timeout diagnostics.
        event_type_name = type(event).__name__
        if "Message" in event_type_name or "Token" in event_type_name or "LLM" in event_type_name:
            nonlocal last_llm_event_type
            last_llm_event_type = event_type_name
        _log_tool_call_timing(event)
        conversation = conversation_ref.get("conversation")
        if conversation is not None:
            try:
                breaker_session.observe_event(
                    event,
                    pause=lambda: conversation.pause(),
                )
            except Exception:  # noqa: BLE001
                _log.exception(
                    "Circuit breaker event handling failed for child %s",
                    record.canonical_name,
                )

        if event_callback is None:
            return
        try:
            event_callback(record, event)
        except Exception:  # noqa: BLE001
            _log.exception(
                "Conversation event callback failed for child %s",
                record.canonical_name,
            )

    callbacks = [_emit_event]

    token_callback = self._conversation_token_callback

    def _emit_token(chunk: object) -> None:
        _mark_activity()
        if token_callback is not None:
            try:
                token_callback(record, chunk)
            except Exception:  # noqa: BLE001
                _log.exception(
                    "Conversation token callback failed for child %s",
                    record.canonical_name,
                )

    token_callbacks: list[Any] = [_emit_token]

    _record_resolved_tool_set(self, record, agent)
    conversation = self._create_conversation(
        agent,
        callbacks=callbacks,
        token_callbacks=token_callbacks,
        persona=record.persona,
    )
    self._validate_conversation_workspace(conversation, record)
    conversation_ref["conversation"] = conversation
    record.conversation_id = str(
        getattr(conversation, "id", None) or record.session_id or record.canonical_name,
    )
    with self._conversation_lock:
        self._active_conversations[record.canonical_name] = conversation

    transcript: list[dict[str, Any]] = []
    try:
        agent_model = getattr(getattr(agent, "llm", None), "model", "?")
        persona_cfg = self.config.personas.get(record.persona)
        persona_stall_timeout = (
            persona_cfg.stall_timeout
            if persona_cfg is not None and persona_cfg.stall_timeout is not None
            else self.config.runtime.child_stall_timeout
        )
        _log.info(
            "Starting child %s persona=%s model=%s timeout=%ds stall=%ds",
            record.canonical_name,
            record.persona,
            agent_model,
            self.config.runtime.child_timeout,
            persona_stall_timeout,
        )
        self._diag.timeline(
            "child_start",
            actor=record.canonical_name,
            message=f"Starting child {record.canonical_name}",
            metadata={
                "persona": record.persona,
                "model": agent_model,
                "task_id": record.task_id,
                "timeout_s": self.config.runtime.child_timeout,
                "stall_timeout_s": persona_stall_timeout,
            },
        )
        self._record_memory_snapshot(
            "child_start",
            record,
            metadata={
                "persona": record.persona,
                "task_id": record.task_id,
                "active_tasks": len(self._active_tasks),
                "active_conversations": len(self._active_conversations),
            },
        )
        self._diag.conversation_index(
            conversation_id=record.conversation_id or record.canonical_name,
            agent_name=record.canonical_name,
            persona=record.persona,
            model=agent_model,
            task_id=record.task_id,
            status="running",
        )
        correction_attempts = 0
        llm_bad_request_recoveries = 0
        transient_recoveries = 0
        quota_wait_attempts = 0
        tracked_transcript_len = 0

        try:
            breaker_session.mark_new_user_instruction()
            with model_input_context(
                session_dir=self._diag.session_dir_str,
                actor=record.canonical_name,
                model=str(getattr(getattr(agent, "llm", None), "model", "")) or None,
                purpose="child_conversation",
            ):
                await asyncio.to_thread(conversation.send_message, record.task_payload)

            while True:  # outer: todo-correction loop
                recovery_attempts = 0
                # Track whether the LLM has *ever* produced an event in
                # this run_child call.  Used to decide whether to apply
                # the ``llm_response_timeout`` early-fallback check.
                _first_llm_response_received = False

                inner_done = False
                while not inner_done:
                    try:
                        _mark_activity()
                        with model_input_context(
                            session_dir=self._diag.session_dir_str,
                            actor=record.canonical_name,
                            model=str(getattr(getattr(agent, "llm", None), "model", "")) or None,
                            purpose="child_conversation",
                        ):
                            # Phase 1 - short timeout: detect unresponsive LLMs early.
                            # If the model produces no events at all within
                            # ``llm_response_timeout``, trigger persona-level fallback
                            # before the full ``child_timeout`` elapses.
                            # Only applied before *any* LLM response has been received
                            # (``_first_llm_response_received`` guard).
                            llm_timeout = self.config.runtime.llm_response_timeout
                            if (
                                llm_timeout < self.config.runtime.child_timeout
                                and not _first_llm_response_received
                            ):
                                try:
                                    await asyncio.wait_for(
                                        self._run_with_stall_watchdog(
                                            conversation,
                                            record,
                                            last_activity,
                                            stall_timeout_override=persona_stall_timeout,
                                            on_steering_injected=(
                                                breaker_session.mark_new_user_instruction
                                            ),
                                            active_tool_call_ids=active_tool_call_ids,
                                            recent_tool_calls=recent_tool_calls,
                                            last_llm_event_type=last_llm_event_type,
                                        ),
                                        timeout=llm_timeout,
                                    )
                                except TimeoutError:
                                    self._graceful_pause_conversation(
                                        conversation,
                                        record.canonical_name,
                                        force_close_when_stuck=True,
                                    )
                                    fallback_result = await self._try_unresponsive_llm_fallback(
                                        record,
                                        persona_cfg,
                                        agent_factory,
                                        manager,
                                        todo_correction_provider,
                                        max_todo_corrections,
                                        open_todo_items_provider,
                                    )
                                    if fallback_result is not None:
                                        return fallback_result
                                    _mark_activity()
                                    # Fallback not configured / not available -
                                    # continue waiting with full child_timeout.
                                    _first_llm_response_received = True
                                    continue  # retry the inner while iteration
                                else:
                                    # LLM responded within llm_response_timeout -
                                    # mark and fall through to normal processing.
                                    _first_llm_response_received = True
                            else:
                                await asyncio.wait_for(
                                    self._run_with_stall_watchdog(
                                        conversation,
                                        record,
                                        last_activity,
                                        stall_timeout_override=persona_stall_timeout,
                                        on_steering_injected=(
                                            breaker_session.mark_new_user_instruction
                                        ),
                                        active_tool_call_ids=active_tool_call_ids,
                                        recent_tool_calls=recent_tool_calls,
                                        last_llm_event_type=last_llm_event_type,
                                    ),
                                    timeout=self.config.runtime.child_timeout,
                                )

                    except _llm_bad_request_errors as run_exc:
                        if not should_condense_llm_bad_request(run_exc):
                            raise
                        if llm_bad_request_recoveries >= _LLM_BAD_REQUEST_RECOVERY_LIMIT:
                            raise
                        llm_bad_request_recoveries += 1
                        _log.warning(
                            "Child %s hit LLM bad request; attempting "
                            "context condensation (%d/%d): %s",
                            record.canonical_name,
                            llm_bad_request_recoveries,
                            _LLM_BAD_REQUEST_RECOVERY_LIMIT,
                            run_exc,
                        )
                        self._diag.issue(
                            kind="llm_bad_request",
                            severity="warning",
                            actor=record.canonical_name,
                            message=format_llm_runtime_error(run_exc),
                            metadata={"attempt": llm_bad_request_recoveries},
                        )
                        try:
                            with model_input_context(
                                session_dir=self._diag.session_dir_str,
                                actor=record.canonical_name,
                                model=str(getattr(getattr(agent, "llm", None), "model", ""))
                                or None,
                                purpose="context_condense",
                            ):
                                await asyncio.to_thread(conversation.condense)
                        except Exception:
                            _log.exception(
                                "Context condensation failed for "
                                "child %s; re-raising original error",
                                record.canonical_name,
                            )
                            raise run_exc from None
                        _log.info(
                            "Context condensation succeeded for child %s; retrying",
                            record.canonical_name,
                        )
                        continue
                    except Exception as run_exc:
                        if is_insufficient_quota_error(run_exc) or is_rate_limit_error(run_exc):
                            quota_wait_attempts += 1
                            requested_model = (
                                extract_quota_exhausted_model(run_exc)
                                or str(getattr(getattr(agent, "llm", None), "model", ""))
                                or "?"
                            )
                            provider_exhausted = is_insufficient_quota_error(run_exc)
                            if provider_exhausted:
                                self._exhausted_provider_models.add(requested_model)
                            prior_quota_fallback = any(
                                actor_name == record.canonical_name
                                for actor_name, _model_name in self._quota_fallback_attempts
                            )
                            if agent_factory is not None and not prior_quota_fallback:
                                for fallback_model in self._same_tier_fallback_models(
                                    requested_model,
                                ):
                                    attempt_key = (record.canonical_name, fallback_model)
                                    if (
                                        fallback_model in self._exhausted_provider_models
                                        or attempt_key in self._quota_fallback_attempts
                                    ):
                                        continue
                                    new_agent = await self._build_model_override_agent(
                                        agent_factory,
                                        record,
                                        model_override=fallback_model,
                                    )
                                    if new_agent is None:
                                        break
                                    self._quota_fallback_attempts.add(attempt_key)
                                    _log.warning(
                                        "Child %s hit %s on model %s; retrying with same-tier "
                                        "fallback %s",
                                        record.canonical_name,
                                        (
                                            "provider quota exhaustion"
                                            if provider_exhausted
                                            else "rate limit"
                                        ),
                                        requested_model,
                                        fallback_model,
                                    )
                                    self._diag.timeline(
                                        "quota_fallback_model",
                                        severity="warning",
                                        actor=record.canonical_name,
                                        message=(f"Retrying with fallback model {fallback_model}"),
                                        metadata={
                                            "requested_model": requested_model,
                                            "fallback_model": fallback_model,
                                            "provider_exhausted": provider_exhausted,
                                        },
                                    )
                                    self._diag.issue(
                                        kind="quota_fallback",
                                        severity="warning",
                                        actor=record.canonical_name,
                                        message=(
                                            "Provider quota exhausted; retrying with "
                                            f"{fallback_model}"
                                            if provider_exhausted
                                            else (f"Rate limit hit; retrying with {fallback_model}")
                                        ),
                                        metadata={
                                            "requested_model": requested_model,
                                            "fallback_model": fallback_model,
                                            "provider_exhausted": provider_exhausted,
                                        },
                                    )
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

                            wait_seconds = self._quota_wait_seconds(
                                run_exc,
                                attempt=quota_wait_attempts,
                            )
                            allow_auto_resume = not provider_exhausted
                            _log.warning(
                                "Child %s hit %s for model %s; wait=%ss "
                                "attempt=%d auto_resume=%s: %s",
                                record.canonical_name,
                                (
                                    "provider quota exhaustion"
                                    if provider_exhausted
                                    else "rate limit"
                                ),
                                requested_model,
                                wait_seconds,
                                quota_wait_attempts,
                                allow_auto_resume,
                                format_llm_runtime_error(run_exc),
                            )
                            self._diag.issue(
                                kind="provider_quota_exhausted",
                                severity="warning",
                                actor=record.canonical_name,
                                message=format_llm_runtime_error(run_exc),
                                metadata={
                                    "attempt": quota_wait_attempts,
                                    "model": requested_model,
                                    "wait_seconds": wait_seconds,
                                    "allow_auto_resume": allow_auto_resume,
                                    "provider_exhausted": provider_exhausted,
                                },
                            )
                            decision = await self._await_quota_wait_decision(
                                actor=record.canonical_name,
                                wait_seconds=wait_seconds,
                                allow_auto_resume=allow_auto_resume,
                            )
                            if decision.action == "change_model" and decision.model_override:
                                new_agent = await self._build_model_override_agent(
                                    agent_factory,
                                    record,
                                    model_override=decision.model_override,
                                )
                                if new_agent is not None:
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
                            _mark_activity()
                            continue
                        if (
                            not is_transient_llm_runtime_error(run_exc)
                            or transient_recoveries >= self.config.runtime.auto_retries_transient
                        ):
                            raise
                        transient_recoveries += 1
                        delay = min(2.0, float(transient_recoveries))
                        _log.warning(
                            "Child %s hit transient LLM runtime error; retrying "
                            "(%d/%d) after %.1fs: %s",
                            record.canonical_name,
                            transient_recoveries,
                            self.config.runtime.auto_retries_transient,
                            delay,
                            format_llm_runtime_error(run_exc),
                        )
                        self._diag.issue(
                            kind="transient_llm_error",
                            severity="warning",
                            actor=record.canonical_name,
                            message=format_llm_runtime_error(run_exc),
                            metadata={"attempt": transient_recoveries},
                        )
                        await asyncio.sleep(delay)
                        _mark_activity()
                        continue
                    if self._inject_pending_steering_prompts(
                        conversation,
                        record,
                        on_injected=breaker_session.mark_new_user_instruction,
                    ):
                        _mark_activity()
                        continue
                    transcript = self._get_transcript_for_conversation(conversation)

                    # _get_transcript_for_conversation returns the full cumulative
                    # transcript on every call, so only score the suffix not yet
                    # counted to avoid re-tallying tool calls already tracked in a
                    # prior outer-loop iteration.
                    if tracked_transcript_len > len(transcript):
                        tracked_transcript_len = 0
                    for event in transcript[tracked_transcript_len:]:
                        if event.get("role") == "tool" and "tool_name" in event:
                            _tracker.track_tool_call(record.canonical_name, event["tool_name"])
                    tracked_transcript_len = len(transcript)

                    # Track accumulated token usage and cost for the focused
                    # agent so the InfoPane can show per-agent figures. The SDK
                    # ``LLM.metrics.accumulated_token_usage`` / ``accumulated_cost``
                    # are running totals, so we replace rather than add.
                    try:
                        from rotaris_core.cost import extract_cost_usage
                        from rotaris_core.tokens import (
                            extract_token_usage,
                            get_last_prompt_token_count,
                        )

                        agent_llm = getattr(agent, "llm", None)
                        if agent_llm is not None:
                            _tracker.set_agent_tokens(
                                record.canonical_name,
                                extract_token_usage(agent_llm),
                            )
                            _tracker.set_agent_cost(
                                record.canonical_name,
                                extract_cost_usage(agent_llm),
                            )
                            last_prompt = get_last_prompt_token_count(agent_llm)
                            if last_prompt is not None and last_prompt > 0:
                                _tracker.set_agent_last_prompt_tokens(
                                    record.canonical_name, last_prompt
                                )
                    except Exception:  # noqa: BLE001
                        _log.debug(
                            "Failed to capture token usage for child %s",
                            record.canonical_name,
                            exc_info=True,
                        )

                    progress = self._assess_transcript_progress(transcript)
                    self._log_progress_assessment(record, progress)
                    terminal_status = self._conversation_terminal_failure_status(conversation)
                    if terminal_status == "stuck":
                        breaker_session.schedule_terminal_stuck_activation()

                    circuit_breaker = self._get_circuit_breaker()
                    activation = None
                    if circuit_breaker is not None:
                        activation = await breaker_session.activate(
                            circuit_breaker,
                            events=self._recent_circuit_breaker_events(conversation),
                            session_id=record.conversation_id or record.canonical_name,
                        )
                    if activation is None:
                        if (
                            progress.outcome in _RECOVERY_ELIGIBLE_OUTCOMES
                            and recovery_attempts < _STALL_RECOVERY_LIMIT
                            # An answer-only route has nothing to recover to: the
                            # corrective prompt would order an edit the playbook
                            # forbids (SWR-2809).
                            and not self._allow_answer_only_completion(record, progress)
                        ):
                            recovery_attempts += 1
                            corrective_message = self._build_execution_recovery_message(
                                progress,
                            )
                            breaker_session.mark_new_user_instruction()
                            _log.warning(
                                "Child %s ended iteration with %s; sending execution "
                                "recovery prompt (%d/%d)",
                                record.canonical_name,
                                progress.outcome,
                                recovery_attempts,
                                _STALL_RECOVERY_LIMIT,
                            )
                            with model_input_context(
                                session_dir=self._diag.session_dir_str,
                                actor=record.canonical_name,
                                model=str(getattr(getattr(agent, "llm", None), "model", ""))
                                or None,
                                purpose="recovery_message",
                            ):
                                await asyncio.to_thread(
                                    conversation.send_message,
                                    corrective_message,
                                )
                            continue
                        inner_done = True
                        break

                    if activation.escalation is not None:
                        if record.state != ChildTaskState.FAILED:
                            record.transition(ChildTaskState.FAILED)
                        transcript = self._get_transcript_for_conversation(conversation)
                        _log.warning(
                            "Child %s aborted after repeated circuit-breaker activations",
                            record.canonical_name,
                        )
                        self._diag.issue(
                            kind="circuit_breaker_escalation",
                            severity="error",
                            actor=record.canonical_name,
                            message=("Child aborted after repeated circuit-breaker activations"),
                        )
                        return self._build_circuit_breaker_escalation_report(
                            record,
                            transcript,
                            activation.escalation,
                        )

                    if activation.loop_detected and activation.corrective_message:
                        _log.warning(
                            "Child %s triggered %s recovery; sending corrective message",
                            record.canonical_name,
                            terminal_status or "circuit-breaker",
                        )
                        with model_input_context(
                            session_dir=self._diag.session_dir_str,
                            actor=record.canonical_name,
                            model=str(getattr(getattr(agent, "llm", None), "model", "")) or None,
                            purpose="circuit_breaker_recovery",
                        ):
                            await asyncio.to_thread(
                                conversation.send_message,
                                activation.corrective_message,
                            )
                        continue

                    continue

                terminal_status = self._conversation_terminal_failure_status(conversation)
                if terminal_status is not None:
                    if record.state != ChildTaskState.FAILED:
                        record.transition(ChildTaskState.FAILED)
                    transcript = self._get_transcript_for_conversation(conversation)
                    _log.warning(
                        "Child %s ended in terminal failure state '%s'",
                        record.canonical_name,
                        terminal_status,
                    )
                    return self._build_terminal_failure_report(
                        record,
                        transcript,
                        terminal_status,
                    )
                if manager is not None and agent_factory is not None:
                    try:
                        await self._drain_delegated_children(
                            manager=manager,
                            agent_factory=agent_factory,
                            conversation=conversation,
                            parent_record=record,
                            open_todo_items_provider=open_todo_items_provider,
                        )
                    except RuntimeError as _drain_exc:
                        _log.exception(
                            "BUG: _drain_delegated_children raised RuntimeError for "
                            "%s - likely a bare-raise glitch in SDK thread boundary: %s",
                            record.canonical_name,
                            _drain_exc,
                        )
                        # Treat this as a terminal failure: the orchestrator is
                        # unrecoverable but the session should carry on.
                        if record.state != ChildTaskState.FAILED:
                            record.transition(ChildTaskState.FAILED)
                        transcript = self._get_transcript_for_conversation(conversation)
                        return self._build_terminal_failure_report(
                            record,
                            transcript,
                            "failed",
                        )
                    terminal_status = self._conversation_terminal_failure_status(conversation)
                    if terminal_status is not None:
                        if record.state != ChildTaskState.FAILED:
                            record.transition(ChildTaskState.FAILED)
                        transcript = self._get_transcript_for_conversation(conversation)
                        _log.warning(
                            "Child %s entered terminal failure state '%s' after delegation",
                            record.canonical_name,
                            terminal_status,
                        )
                        return self._build_terminal_failure_report(
                            record,
                            transcript,
                            terminal_status,
                        )
                transcript = self._get_transcript_for_conversation(conversation)
                progress = self._assess_transcript_progress(transcript)
                if progress.outcome in _RECOVERY_ELIGIBLE_OUTCOMES:
                    if self._allow_answer_only_completion(record, progress):
                        _log.info(
                            "Child %s completed on an answer-only route (outcome=%s)",
                            record.canonical_name,
                            progress.outcome,
                        )
                        return self._build_answer_only_completion_report(record, transcript)
                    if self._allow_message_only_completion(
                        record,
                        progress,
                        recovery_attempts=recovery_attempts,
                    ):
                        _log.info(
                            "Child %s accepted message-only completion after recovery",
                            record.canonical_name,
                        )
                        return self._build_message_only_completion_report(
                            record,
                            transcript,
                            recovery_attempts=recovery_attempts,
                        )
                    if record.state != ChildTaskState.FAILED:
                        record.transition(ChildTaskState.FAILED)
                    _log.warning(
                        "Child %s stopped without substantive execution (outcome=%s)",
                        record.canonical_name,
                        progress.outcome,
                    )
                    self._diag.issue(
                        kind="incomplete_execution",
                        severity="warning",
                        actor=record.canonical_name,
                        message=(
                            f"Child stopped without substantive execution: {progress.outcome}"
                        ),
                        metadata={"outcome": progress.outcome},
                    )
                    return self._build_incomplete_execution_report(
                        record,
                        transcript,
                        progress,
                        recovery_attempts=recovery_attempts,
                    )
                report = self._build_terminal_child_report(record, transcript)
                report = self._validate_child_report(
                    record,
                    report,
                    execution_elapsed_s=_elapsed(),
                    summary_elapsed_s=None,
                )
                self._diag.timeline(
                    "child_result",
                    actor=record.canonical_name,
                    message=f"Child completed with status={report.status}",
                    metadata={
                        "status": report.status,
                        "elapsed_s": round(_elapsed(), 1),
                        "has_final_response": bool(report.final_response),
                        "has_last_response": bool(report.last_response),
                    },
                )
                if (
                    report.status == "succeeded"
                    and todo_correction_provider is not None
                    and correction_attempts < max_todo_corrections
                ):
                    correction_message = todo_correction_provider()
                    if correction_message is not None:
                        correction_attempts += 1
                        breaker_session.mark_new_user_instruction()
                        _log.info(
                            "Child %s: sending todo completion correction (%d/%d)",
                            record.canonical_name,
                            correction_attempts,
                            max_todo_corrections,
                        )
                        with model_input_context(
                            session_dir=self._diag.session_dir_str,
                            actor=record.canonical_name,
                            model=str(getattr(getattr(agent, "llm", None), "model", "")) or None,
                            purpose="todo_correction",
                        ):
                            await asyncio.to_thread(conversation.send_message, correction_message)
                        continue
                return report

        except TimeoutError:
            # Dispatch to daemon thread - conversation.pause() can block
            # waiting on the SDK worker thread (stuck in a synchronous LLM
            # call).  Calling it inline would freeze the asyncio event loop
            # and prevent Ctrl+Q / force-quit from firing.
            self._graceful_pause_conversation(conversation, record.canonical_name)
            # Persona-level fallback: if a fallback_model is configured and
            # an agent_factory was provided, retry the task once with the
            # fallback model. This rescues runs from persistent provider
            # latency on the primary model (e.g. copilot-gpt5).
            persona_fallback: str | None = (
                persona_cfg.fallback_model if persona_cfg is not None else None
            )
            if (
                persona_fallback is not None
                and agent_factory is not None
                and record.canonical_name not in self._fallback_attempts
            ):
                self._fallback_attempts.add(record.canonical_name)
                _log.warning(
                    "Child %s timed out after %.1fs on primary model; "
                    "retrying with fallback_model=%s",
                    record.canonical_name,
                    _elapsed(),
                    persona_fallback,
                )
                self._diag.timeline(
                    "fallback_model",
                    severity="warning",
                    actor=record.canonical_name,
                    message=f"Retrying with fallback model {persona_fallback}",
                    metadata={
                        "fallback_model": persona_fallback,
                        "elapsed_s": round(_elapsed(), 1),
                    },
                )
                self._diag.issue(
                    kind="timeout_fallback",
                    severity="warning",
                    actor=record.canonical_name,
                    message=f"Primary model timed out; retrying with {persona_fallback}",
                    metadata={"fallback_model": persona_fallback},
                )
                try:
                    new_agent = await asyncio.to_thread(
                        agent_factory,
                        record.persona,
                        None,
                        persona_fallback,
                    )
                except TypeError:
                    # Older agent_factory signatures don't accept the
                    # model_override positional. Skip fallback gracefully.
                    new_agent = None
                if new_agent is not None:
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
            record.transition(ChildTaskState.FAILED)
            _log.warning(
                "Child %s timed out after %.1fs (limit=%ds)",
                record.canonical_name,
                _elapsed(),
                self.config.runtime.child_timeout,
            )
            self._diag.issue(
                kind="timeout",
                severity="error",
                actor=record.canonical_name,
                message=f"Child timed out after {self.config.runtime.child_timeout}s",
                metadata={
                    "elapsed_s": round(_elapsed(), 1),
                    "active_tools": list(active_tool_call_ids),
                    "recent_tool_calls": list(recent_tool_calls),
                    "last_llm_event_type": last_llm_event_type,
                },
            )
            return ChildReportArtifact(
                agent_name=record.canonical_name,
                persona=record.persona,
                status="failed",
                summary=f"Child timed out after {self.config.runtime.child_timeout}s",
                last_response=extract_last_response(transcript),
                final_response=extract_final_response(transcript),
            )
        except asyncio.CancelledError:
            # Dispatch to daemon thread - same reason as the TimeoutError
            # handler above.  Calling conversation.pause() inline here is
            # the root cause of the Ctrl+Q TUI freeze: CancelledError is
            # injected here during shutdown, and if the SDK worker is stuck
            # in a live LLM call the event loop blocks until the call
            # returns, neutralising the 2-second force-quit deadline.
            self._graceful_pause_conversation(conversation, record.canonical_name)
            raise
        except Exception as exc:
            if record.state != ChildTaskState.FAILED:
                record.transition(ChildTaskState.FAILED)
            _log.exception("Child %s failed before summary", record.canonical_name)

            # Provide actionable diagnostics for MCP connection failures.
            _mcp_diag = diagnose_mcp_error(exc, record)
            if _mcp_diag is not None:
                _log.warning("MCP diagnostic for %s: %s", record.canonical_name, _mcp_diag)

            self._diag.issue(
                kind="child_exception",
                severity="error",
                actor=record.canonical_name,
                message=format_llm_runtime_error(exc),
            )
            return ChildReportArtifact(
                agent_name=record.canonical_name,
                persona=record.persona,
                status="failed",
                summary=f"Child failed: {format_llm_runtime_error(exc)}",
                last_response=extract_last_response(transcript),
                final_response=extract_final_response(transcript),
            )
    finally:
        with self._conversation_lock:
            self._active_conversations.pop(record.canonical_name, None)
        self._tool_activity.clear(record.canonical_name)
        if manager is not None:
            manager.wait_barrier.discard(conversation)
        self.user_prompt_barrier.discard(conversation)
        if current_task is not None:
            with self._task_lock:
                self._inflight_run_tasks.discard(current_task)
        # Close in a daemon thread: ``conversation.close()`` may block waiting
        # for the underlying ``conversation.run`` worker thread (which can be
        # stuck inside the SDK / LLM call) to finish. Doing it inline would
        # freeze the asyncio event loop - and on the TUI that means Ctrl+C
        # bindings can no longer fire. The worker thread is a daemon thread
        # so it will not prevent process exit.
        close_conversation_async(conversation, name_hint=record.canonical_name)
        self._diag.timeline(
            "child_conversation_closed",
            actor=record.canonical_name,
            message=f"Child {record.canonical_name} conversation closed",
            metadata={
                "persona": record.persona,
                "conversation_id": record.conversation_id,
                "elapsed_s": round(_elapsed(), 1),
                "state": record.state.value
                if hasattr(record.state, "value")
                else str(record.state),
            },
        )
        self._record_memory_snapshot(
            "child_conversation_closed",
            record,
            metadata={
                "persona": record.persona,
                "conversation_id": record.conversation_id,
                "elapsed_s": round(_elapsed(), 1),
                "state": record.state.value
                if hasattr(record.state, "value")
                else str(record.state),
                "active_tasks": len(self._active_tasks),
                "active_conversations": len(self._active_conversations),
            },
        )
