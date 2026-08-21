"""Delegation drain and parent-resume logic for the Scheduler.

Extracted from ``scheduler.py`` as a mixin: the foreground/background drain
loops, notification injection, resume-message building, and the parent-
resume-with-recovery coroutine.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any, Protocol

from rotaris_core.llm_errors import (
    format_llm_runtime_error,
    should_condense_llm_bad_request,
)
from rotaris_core.model_input import model_input_context
from rotaris_core.orchestrator.child_state import ChildTaskState
from rotaris_core.orchestrator.scheduler_conversation import (
    _llm_bad_request_errors,
    should_unwrap_conversation_run_error,
)
from rotaris_core.orchestrator.scheduler_todo import (
    build_open_todo_reminder_lines,
    get_open_todo_items,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from openhands.sdk import Agent

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.child_state import ChildNotification, ChildTaskRecord
    from rotaris_core.orchestrator.report import ChildReportArtifact
    from rotaris_core.orchestrator.scheduler_conversation import ToolActivityRegistry
    from rotaris_core.orchestrator.scheduler_diagnostics import SchedulerDiagnosticsProxy

_log = logging.getLogger(__name__)

_PARENT_RESUME_DETAIL_CAP = 4000
_LLM_BAD_REQUEST_RECOVERY_LIMIT = 2


class AgentFactory(Protocol):
    def __call__(
        self,
        persona: str,
        runtime_kwargs: dict[str, Any] | None = None,
    ) -> Agent: ...


@traces(
    SWR.SWR_110,
    SWR.SWR_111,
    SWR.SWR_113,
    SWR.SWR_114,
    SWR.SWR_140,
    SWR.SWR_143,
    SWR.SWR_163,
    SWR.SWR_2132,
)
class SchedulerDrainMixin:
    """Delegation drain + parent-resume surface for the scheduler."""

    config: RotarisConfig
    _session_dir: Path | None
    _diag: SchedulerDiagnosticsProxy
    _active_tasks: dict[str, asyncio.Task[Any]]
    _tool_activity: ToolActivityRegistry

    async def spawn_children(self, manager: ChildManager, agent_factory: AgentFactory) -> list[str]:
        raise NotImplementedError

    async def wait_for_any_terminal(
        self,
        manager: ChildManager,
        only_names: set[str] | None = None,
    ) -> list[tuple[ChildTaskRecord, ChildReportArtifact]]:
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Drain orchestration
    # ------------------------------------------------------------------

    async def _drain_delegated_children(
        self,
        manager: ChildManager,
        agent_factory: AgentFactory,
        conversation: Any,
        parent_record: ChildTaskRecord,
        open_todo_items_provider: Callable[[], list[str]] | None = None,
    ) -> None:
        """Execute delegated children and resume the parent with their results.

        Runs as a loop: every drain pass resumes the parent, and the resumed
        parent may call ``wait_for_tasks`` or delegate more children — so the
        barrier / notification / queued-children checks re-run after each
        resume.  One-shot checking silently discarded wait requests registered
        during resumed runs and left late delegations QUEUED forever (the
        parent then ended "blocked" and RalphLoop spawned a duplicate
        orchestrator).

        Termination: exits when a pass finds no pending wait request, no
        pending notifications, and no queued children beyond those already
        attempted.  The ``attempted_spawn_names`` guard prevents an infinite
        spawn/resume cycle when children are stuck WAITING_ON_DEPENDENCIES.
        Unannounced RUNNING background children also count as pending because
        a completing sibling may auto-spawn newly delegated work between drain
        snapshots. The current record and foreground RUNNING records remain
        excluded because they can deadlock waiting for themselves.
        """
        attempted_spawn_names: set[str] = set()
        while True:
            if await self._run_wait_barrier_if_requested(
                manager,
                agent_factory,
                conversation,
                parent_record,
                open_todo_items_provider=open_todo_items_provider,
            ):
                continue

            if parent_record.canonical_name == getattr(
                manager,
                "_parent_id",
                None,
            ) and await self._drain_pending_background_notifications(
                manager,
                conversation,
                parent_record,
                open_todo_items_provider=open_todo_items_provider,
            ):
                continue

            pending_names = {
                record.canonical_name
                for record in manager.snapshot_children()
                if record.state in {ChildTaskState.QUEUED, ChildTaskState.WAITING_ON_DEPENDENCIES}
                or (
                    record.state == ChildTaskState.RUNNING
                    and record.run_in_background
                    and record.canonical_name != parent_record.canonical_name
                    and record.canonical_name not in attempted_spawn_names
                )
            }
            if not pending_names or pending_names <= attempted_spawn_names:
                return
            attempted_spawn_names |= pending_names

            has_foreground = any(
                not record.run_in_background
                for record in manager.snapshot_children()
                if record.canonical_name in pending_names
            )
            if has_foreground:
                await self._run_foreground_drain(
                    manager,
                    agent_factory,
                    conversation,
                    parent_record,
                    open_todo_items_provider=open_todo_items_provider,
                )
            else:
                await self._run_background_drain(
                    manager,
                    agent_factory,
                    conversation,
                    parent_record,
                    open_todo_items_provider=open_todo_items_provider,
                )
            # Parent was resumed during the drain — loop to re-check the
            # barrier, notifications, and any children delegated meanwhile.

    async def _run_foreground_drain(
        self,
        manager: ChildManager,
        agent_factory: AgentFactory,
        conversation: Any,
        parent_record: ChildTaskRecord,
        open_todo_items_provider: Callable[[], list[str]] | None = None,
    ) -> None:
        """Blocking drain: spawn → wait → resume → repeat.

        Tracks freshly spawned task names to avoid deadlocking on the *current*
        task when it was placed in ``_active_tasks`` by an outer
        ``spawn_children`` call.
        """
        fresh: set[str] = set()
        while True:
            prior_names = set(self._active_tasks.keys())
            await self.spawn_children(manager, agent_factory)
            # Track only tasks spawned by *this* drain — not the outer task.
            new_fresh = {name for name in self._active_tasks if name not in prior_names}
            fresh |= new_fresh
            if not fresh:
                break

            while fresh:
                terminal_children = await self.wait_for_any_terminal(manager, only_names=fresh)
                for child_record, _report in terminal_children:
                    fresh.discard(child_record.canonical_name)
                if not terminal_children:
                    continue
                manager.discard_notifications(
                    {record.task_id for record, _ in terminal_children if record.task_id},
                )

                resume_message = self._build_child_resume_message(
                    terminal_children,
                    still_running=len(fresh),
                    open_todo_items=get_open_todo_items(open_todo_items_provider),
                )
                await self._resume_parent_conversation_with_recovery(
                    conversation,
                    resume_message,
                    actor=parent_record.canonical_name,
                )
                # Parent may have delegated more children — loop back to spawn.
                break

    async def _run_background_drain(
        self,
        manager: ChildManager,
        agent_factory: AgentFactory,
        conversation: Any,
        parent_record: ChildTaskRecord,
        open_todo_items_provider: Callable[[], list[str]] | None = None,
    ) -> None:
        """Non-blocking drain: spawn ready background children and resume parent."""
        await self.spawn_children(manager, agent_factory)
        resume_message = self._build_background_spawn_resume_message(
            manager,
            parent_record,
            open_todo_items=get_open_todo_items(open_todo_items_provider),
        )
        await self._resume_parent_conversation_with_recovery(
            conversation,
            resume_message,
            actor=parent_record.canonical_name,
        )

    async def _run_wait_barrier_if_requested(
        self,
        manager: ChildManager,
        agent_factory: AgentFactory,
        conversation: Any,
        parent_record: ChildTaskRecord,
        open_todo_items_provider: Callable[[], list[str]] | None = None,
    ) -> bool:
        waited_ids = manager.wait_barrier.consume(conversation)
        if waited_ids is None:
            return False

        waited_ids = [task_id for task_id in waited_ids if task_id]
        if not waited_ids:
            waited_ids = [
                record.task_id
                for record in manager.snapshot_children()
                if record.run_in_background and record.task_id and not record.state.is_terminal()
            ]

        waited_set = set(waited_ids)

        # The parent conversation is already paused (WaitForTasksExecutor
        # dispatched pause_with_daemon before registering the wait request).
        # Clear tool activity for the parent now so that any concurrent
        # graceful_pause_conversation call doesn't see stale entries and
        # force-close the already-paused conversation.
        self._tool_activity.clear(parent_record.canonical_name)

        while True:
            await self.spawn_children(manager, agent_factory)
            waited_pairs = self._collect_reports_for_task_ids(manager, waited_set)
            completed_ids = {record.task_id for record, _ in waited_pairs if record.task_id}
            if waited_set <= completed_ids:
                manager.discard_notifications(
                    {record.task_id for record, _ in waited_pairs if record.task_id},
                )
                resume_msg = self._build_wait_resume_message(
                    waited_pairs,
                    open_todo_items=get_open_todo_items(open_todo_items_provider),
                )
                await self._resume_parent_conversation_with_recovery(
                    conversation,
                    resume_msg,
                    actor=parent_record.canonical_name,
                )
                return True

            active_wait_tasks = self._active_tasks_for_task_ids(manager, waited_set - completed_ids)
            if not active_wait_tasks:
                active_wait_tasks = list(self._active_tasks.values())
            if not active_wait_tasks:
                # A task handle can briefly disappear from the scheduler map
                # before its terminal report becomes visible to this drain.
                # Do not turn that transition window into a false completion:
                # wait_for_tasks must not resume while a requested child still
                # advertises RUNNING state.
                requested_child_still_running = any(
                    record.task_id in waited_set
                    and record.task_id not in completed_ids
                    and record.state == ChildTaskState.RUNNING
                    for record in manager.snapshot_children()
                )
                if requested_child_still_running:
                    await asyncio.sleep(0)
                    continue
                manager.discard_notifications(
                    {record.task_id for record, _ in waited_pairs if record.task_id},
                )
                resume_msg = self._build_wait_resume_message(
                    waited_pairs,
                    open_todo_items=get_open_todo_items(open_todo_items_provider),
                )
                await self._resume_parent_conversation_with_recovery(
                    conversation,
                    resume_msg,
                    actor=parent_record.canonical_name,
                )
                return True
            await asyncio.wait(active_wait_tasks, return_when=asyncio.FIRST_COMPLETED)

    async def _drain_pending_background_notifications(
        self,
        manager: ChildManager,
        conversation: Any,
        parent_record: ChildTaskRecord,
        open_todo_items_provider: Callable[[], list[str]] | None = None,
    ) -> bool:
        notifications = manager.get_pending_notifications()
        if not notifications:
            return False

        open_todo_items = get_open_todo_items(open_todo_items_provider)
        for notification in notifications:
            await self._inject_notification(
                notification,
                conversation,
                open_todo_items=open_todo_items,
            )
        await self._resume_parent_conversation_with_recovery(
            conversation,
            "",
            actor=parent_record.canonical_name,
            message_sent=True,
        )
        return True

    # ------------------------------------------------------------------
    # Notification injection
    # ------------------------------------------------------------------

    async def _inject_notification(
        self,
        notification: ChildNotification,
        conversation: Any,
        open_todo_items: list[str] | None = None,
    ) -> None:
        """Fire-and-forget message injection — send_message only, no run()."""
        duration = f"{notification.duration_s:.1f}s"
        lines = [
            "[BACKGROUND TASK COMPLETED]",
            f"**ID:** `{notification.task_id}`",
            (f"**Description:** {notification.canonical_name} — {notification.description}"),
            f"**Duration:** {duration}",
        ]
        if notification.artifact_ids:
            artifact_ids = ", ".join(
                f"`{artifact_id}`" for artifact_id in notification.artifact_ids
            )
            lines.append(f"**Published artifacts:** {artifact_ids}")
        if notification.still_running_count > 0:
            lines.append(
                f"**{notification.still_running_count} task(s) still in progress.** "
                "You WILL be notified when ALL complete.",
            )
            lines.append("Do NOT poll — continue productive work.")
            lines.append(
                f'Use `background_output(task_id="{notification.task_id}")` for the compact '
                "report, or "
                f'`background_output(task_id="{notification.task_id}", '
                'detail_level="verbatim")` '
                "for the exact last reply plus stored evidence.",
            )
        else:
            lines.append("All background tasks have completed.")

        lines.extend(build_open_todo_reminder_lines(open_todo_items))

        text = "\n".join(lines)
        await asyncio.to_thread(conversation.send_message, text)

    # ------------------------------------------------------------------
    # Report collection
    # ------------------------------------------------------------------

    def _collect_reports_for_task_ids(
        self,
        manager: ChildManager,
        task_ids: set[str],
    ) -> list[tuple[ChildTaskRecord, ChildReportArtifact]]:
        results: list[tuple[ChildTaskRecord, ChildReportArtifact]] = []
        for record in manager.snapshot_children():
            if not record.task_id or record.task_id not in task_ids:
                continue
            report = manager.results_by_task_id.get(record.task_id)
            if report is not None:
                results.append((record, report))
        return results

    def _active_tasks_for_task_ids(
        self,
        manager: ChildManager,
        task_ids: set[str],
    ) -> list[asyncio.Task[Any]]:
        tasks: list[asyncio.Task[Any]] = []
        for record in manager.snapshot_children():
            if not record.task_id or record.task_id not in task_ids:
                continue
            task = self._active_tasks.get(record.canonical_name)
            if task is not None:
                tasks.append(task)
        return tasks

    # ------------------------------------------------------------------
    # Resume message builders
    # ------------------------------------------------------------------

    def _append_child_report_lines(
        self,
        lines: list[str],
        record: ChildTaskRecord,
        report: ChildReportArtifact,
    ) -> None:
        """Append the shared per-report bullet block used by every resume message."""
        response = self._format_parent_resume_detail(report)
        lines.append(f"- **{record.canonical_name}** ({record.persona}) [{report.status}]")
        artifact_refs = self._format_report_artifact_refs(report)
        if artifact_refs:
            lines.append(f"  Artifacts: {artifact_refs}")
        if response:
            lines.append(f"\nResult from {record.canonical_name}:\n{response}")
        else:
            lines.append("\nResult: No assistant response was captured.")
        return

    def _build_wait_resume_message(
        self,
        reports: list[tuple[ChildTaskRecord, ChildReportArtifact]],
        open_todo_items: list[str] | None = None,
    ) -> str:
        lines = [
            "Background tasks you waited for have completed. Here are the results:",
            "",
        ]
        for record, report in reports:
            self._append_child_report_lines(lines, record, report)
        lines.extend(build_open_todo_reminder_lines(open_todo_items))
        return "\n".join(lines)

    def _build_background_spawn_resume_message(
        self,
        manager: ChildManager,
        parent_record: ChildTaskRecord,
        open_todo_items: list[str] | None = None,
    ) -> str:
        lines = [
            "Background tasks have started. Continue productive work.",
            "Use wait_for_tasks(task_ids) only when you need specific results.",
        ]
        running = [
            record
            for record in manager.snapshot_children()
            if record.run_in_background
            and record.parent_agent_id == parent_record.canonical_name
            and record.canonical_name != parent_record.canonical_name
            and not record.state.is_terminal()
        ]
        if running:
            lines.append("")
            lines.append("Active background tasks:")
            for record in running:
                task_id = f" `{record.task_id}`" if record.task_id else ""
                lines.append(f"- {record.canonical_name}{task_id}: {record.name}")
        lines.extend(build_open_todo_reminder_lines(open_todo_items))
        return "\n".join(lines)

    def _build_child_resume_message(
        self,
        terminal_children: list[tuple[ChildTaskRecord, ChildReportArtifact]],
        still_running: int = 0,
        open_todo_items: list[str] | None = None,
    ) -> str:
        lines = [
            "Child task updates are available. Continue orchestration using these results.",
        ]
        if still_running > 0:
            lines.append(
                f"{still_running} task(s) are still running in the background. "
                "If you have additional independent work to dispatch, call delegate with "
                "run_in_background=true now so it runs in parallel with the remaining tasks. "
                "Otherwise wait — you will be resumed again as each task completes.",
            )
        else:
            lines.append(
                "All background tasks have finished. "
                "To run the next batch in parallel, call delegate multiple times with "
                "run_in_background=true before returning. "
                "Only use run_in_background=false if the next step depends on this result.",
            )
        lines += ["", "Completed child updates:"]
        for child_record, report in terminal_children:
            self._append_child_report_lines(lines, child_record, report)
        lines.extend(build_open_todo_reminder_lines(open_todo_items))
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Parent resume
    # ------------------------------------------------------------------

    def _resume_parent_conversation(self, conversation: Any, resume_message: str) -> None:
        conversation.send_message(resume_message)
        conversation.run()

    async def _resume_parent_conversation_with_recovery(
        self,
        conversation: Any,
        resume_message: str,
        *,
        actor: str,
        message_sent: bool = False,
    ) -> None:
        recoveries = 0

        while True:
            try:
                with model_input_context(
                    session_dir=self._diag.session_dir_str,
                    actor=actor,
                    model=self._conversation_model_name(conversation),
                    purpose="parent_resume",
                ):
                    await asyncio.wait_for(
                        asyncio.to_thread(
                            self._resume_parent_conversation_once,
                            conversation,
                            resume_message,
                            message_sent,
                        ),
                        timeout=self.config.runtime.child_timeout,
                    )
                return
            except _llm_bad_request_errors as exc:
                if not should_condense_llm_bad_request(exc):
                    raise
                if recoveries >= _LLM_BAD_REQUEST_RECOVERY_LIMIT:
                    raise

                recoveries += 1
                message_sent = True
                _log.warning(
                    "Parent %s hit LLM bad request while resuming; attempting "
                    "context condensation (%d/%d): %s",
                    actor,
                    recoveries,
                    _LLM_BAD_REQUEST_RECOVERY_LIMIT,
                    exc,
                )
                self._diag.issue(
                    kind="parent_resume_bad_request",
                    severity="warning",
                    actor=actor,
                    message=format_llm_runtime_error(exc),
                    metadata={"attempt": recoveries},
                )
                try:
                    with model_input_context(
                        session_dir=self._diag.session_dir_str,
                        actor=actor,
                        model=self._conversation_model_name(conversation),
                        purpose="context_condense",
                    ):
                        await asyncio.to_thread(conversation.condense)
                except Exception:
                    _log.exception(
                        "Context condensation failed while resuming parent %s; re-raising "
                        "original error",
                        actor,
                    )
                    raise exc from None

                _log.info(
                    "Context condensation succeeded while resuming parent %s; retrying",
                    actor,
                )
            except RuntimeError as exc:
                # ``conversation.run()`` wraps all errors in
                # ``ConversationRunError``, which is a ``RuntimeError``.
                # Unwrap it and check whether the cause is an
                # ``LLMBadRequestError`` that would have been caught above.
                if not should_unwrap_conversation_run_error(exc):
                    raise
                inner = getattr(exc, "original_exception", exc.__cause__)
                if inner is None or not isinstance(inner, _llm_bad_request_errors):
                    raise
                if not should_condense_llm_bad_request(inner):
                    raise
                if recoveries >= _LLM_BAD_REQUEST_RECOVERY_LIMIT:
                    raise

                recoveries += 1
                message_sent = True
                _log.warning(
                    "Parent %s hit LLM bad request (wrapped in %s) while resuming; "
                    "attempting context condensation (%d/%d): %s",
                    actor,
                    type(exc).__name__,
                    recoveries,
                    _LLM_BAD_REQUEST_RECOVERY_LIMIT,
                    inner,
                )
                self._diag.issue(
                    kind="parent_resume_bad_request",
                    severity="warning",
                    actor=actor,
                    message=format_llm_runtime_error(inner),
                    metadata={"attempt": recoveries, "wrapper": type(exc).__name__},
                )
                try:
                    with model_input_context(
                        session_dir=self._diag.session_dir_str,
                        actor=actor,
                        model=self._conversation_model_name(conversation),
                        purpose="context_condense",
                    ):
                        await asyncio.to_thread(conversation.condense)
                except Exception:
                    _log.exception(
                        "Context condensation failed while resuming parent %s; re-raising "
                        "original error",
                        actor,
                    )
                    raise inner from None

                _log.info(
                    "Context condensation succeeded while resuming parent %s; retrying",
                    actor,
                )

    def _resume_parent_conversation_once(
        self,
        conversation: Any,
        resume_message: str,
        message_sent: bool,
    ) -> None:
        if not message_sent:
            conversation.send_message(resume_message)
        conversation.run()

    def _conversation_model_name(self, conversation: Any) -> str | None:
        model = getattr(getattr(getattr(conversation, "agent", None), "llm", None), "model", "")
        text = str(model).strip()
        return text or None

    def _format_parent_resume_detail(self, report: ChildReportArtifact) -> str | None:
        detail = report.final_response or report.last_response or report.key_findings
        if not detail:
            return None
        if len(detail) <= _PARENT_RESUME_DETAIL_CAP:
            return detail

        remaining = len(detail) - _PARENT_RESUME_DETAIL_CAP
        truncated = detail[:_PARENT_RESUME_DETAIL_CAP].rstrip()
        return f"{truncated}\n...[truncated, {remaining} more chars]"

    @staticmethod
    def _format_report_artifact_refs(report: ChildReportArtifact) -> str | None:
        refs = [artifact.description for artifact in report.artifacts if artifact.description]
        if not refs:
            return None
        return "; ".join(refs)
