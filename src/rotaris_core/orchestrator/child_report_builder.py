"""Child report construction, validation, and recovery messaging.

Carves the child-result surface out of ``scheduler``: given a child's
record, transcript, and progress assessment, produce the ``ChildReportArtifact``
that flows back to the parent — including deterministic response extraction and
stall-recovery prompts.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.orchestrator.report import (
    Artifact,
    ChildDetailPayload,
    ChildReportArtifact,
    CreatedFile,
    EditedFile,
    HighlightPath,
    SnippetExcerpt,
    extract_final_response,
    extract_last_response,
)
from rotaris_core.orchestrator.transcript_progress import (
    ProgressAssessment,
    _format_tool_counts,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.orchestrator.child_state import ChildTaskRecord
    from rotaris_core.orchestrator.scheduler_diagnostics import SchedulerDiagnosticsProxy

_log = logging.getLogger("rotaris_core.orchestrator.scheduler")

_STALL_RECOVERY_LIMIT = 1

#: Playbook ``ROUTE`` variant under which the deliverable is the answer itself.
_ANSWER_ONLY_ROUTE = "answer-only"

#: Outcomes an answer-only route may complete on (SWR-2809). ``malformed_tool_attempt``
#: and ``empty_stalled`` are absent on purpose: raw tool-call markup and a silent stall
#: are defects on every route, answer-only included.
_ANSWER_ONLY_ACCEPTED_OUTCOMES = frozenset(
    {
        "answered",
        "message_only",
        "housekeeping_only",
    },
)


@traces(SWR.SWR_126, SWR.SWR_129, SWR.SWR_164, SWR.SWR_1319, SWR.SWR_2132, SWR.SWR_2809)
class ReportBuilderMixin:
    """Report construction + validation surface for the scheduler."""

    _session_dir: Path | None
    _diag: SchedulerDiagnosticsProxy
    config: RotarisConfig
    #: Classified run intent, propagated from the owning ``RalphLoop``. Empty until
    #: the host classifies, which keeps route-aware acceptance off by default.
    run_intent: str

    @property
    def artifact_store(self) -> Any | None:
        raise NotImplementedError

    def _route_is_answer_only(self, record: ChildTaskRecord) -> bool:
        """Whether *record*'s playbook cell routes this run to an answer, not an edit.

        The matrix sends the ``question`` and ``exploration`` intents to
        ``ROUTE: answer-only``, whose text forbids editing files. Without this the
        stall guard demanded a task-advancing tool from an agent the same system had
        just told not to make one (SWR-2809).
        """
        if not self.run_intent:
            return False
        try:
            from rotaris_core.agents.factory import resolve_playbook_for_persona

            cell = resolve_playbook_for_persona(record.persona, self.config, self.run_intent)
        except Exception:  # noqa: BLE001
            _log.exception("Playbook route lookup failed; treating the route as execution")
            return False
        if cell is None or not cell.routed:
            return False
        return cell.variants.get("ROUTE") == _ANSWER_ONLY_ROUTE

    def _allow_answer_only_completion(
        self,
        record: ChildTaskRecord,
        progress: ProgressAssessment,
    ) -> bool:
        """Accept a child that answered on a route whose deliverable is the answer.

        No recovery attempt is required first: on this route there is nothing to
        recover *to*, so the corrective prompt would only contradict the playbook.

        Acceptance keys on a user-visible message rather than ``final_response``.
        A child that answers and then calls ``finish`` has ended on a tool, which
        under SWR-2132 leaves ``final_response`` empty and the answer in
        ``last_response`` — requiring the former would reject exactly the transcript
        this route is meant to produce.
        """
        return (
            progress.outcome in _ANSWER_ONLY_ACCEPTED_OUTCOMES
            and progress.has_user_visible_message
            and self._route_is_answer_only(record)
        )

    def _build_answer_only_completion_report(
        self,
        record: ChildTaskRecord,
        transcript: list[dict[str, Any]],
    ) -> ChildReportArtifact:
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary=(
                "Child answered the request. This run's playbook routes it to an answer, "
                "so no task-advancing tool call was required."
            ),
            last_response=extract_last_response(transcript),
            final_response=extract_final_response(transcript),
        )

    def _allow_message_only_completion(
        self,
        record: ChildTaskRecord,
        progress: ProgressAssessment,
        *,
        recovery_attempts: int,
    ) -> bool:
        return (
            record.persona == "orchestrator"
            # ``answered`` is the same shape as ``message_only`` plus an explicit
            # terminator (SWR-2808); calling ``finish`` must not cost the child its
            # acceptance path.
            and progress.outcome in {"message_only", "answered"}
            and bool(progress.final_response)
            and recovery_attempts >= _STALL_RECOVERY_LIMIT
        )

    def _build_message_only_completion_report(
        self,
        record: ChildTaskRecord,
        transcript: list[dict[str, Any]],
        *,
        recovery_attempts: int,
    ) -> ChildReportArtifact:
        summary = "Child provided a direct response without tool calls."
        if recovery_attempts:
            summary += " Recovery prompt was sent before the final direct response was accepted."

        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary=summary,
            last_response=extract_last_response(transcript),
            final_response=extract_final_response(transcript),
        )

    def _build_terminal_child_report(
        self,
        record: ChildTaskRecord,
        transcript: list[dict[str, Any]],
    ) -> ChildReportArtifact:
        """Build an in-memory child result without a terminal model call."""
        authored_artifact = self._get_latest_authored_artifact(record)
        if authored_artifact is not None:
            return self._build_artifact_backed_report(record, authored_artifact)

        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary="Child completed.",
            last_response=extract_last_response(transcript),
            final_response=extract_final_response(transcript),
        )

    def _get_latest_authored_artifact(self, record: ChildTaskRecord) -> Any | None:
        store = self.artifact_store
        if store is None:
            return None
        for artifact_id in reversed(record.produced_artifact_ids):
            artifact = store.get(artifact_id)
            if artifact is None or artifact.kind != "agent_published":
                continue
            if (
                artifact.canonical_name is not None
                and artifact.canonical_name != record.canonical_name
            ):
                continue
            if (
                artifact.source_task_id is not None
                and record.task_id
                and artifact.source_task_id != record.task_id
            ):
                continue
            return artifact
        return None

    def _build_artifact_backed_report(
        self,
        record: ChildTaskRecord,
        artifact: Any,
    ) -> ChildReportArtifact:
        highlight_paths = [
            HighlightPath(path=str(item.get("path", "")), reason=item.get("reason"))
            for item in artifact.highlight_paths
            if item.get("path")
        ]
        snippets = [
            SnippetExcerpt(
                path=item.get("path"),
                content=str(item.get("content", "")),
                reason=item.get("reason"),
            )
            for item in artifact.snippets
            if item.get("content")
        ]
        detail_payload = None
        if highlight_paths or snippets:
            detail_payload = ChildDetailPayload(
                highlight_paths=highlight_paths,
                snippets=snippets,
            )

        edited_files = [
            EditedFile(
                path=str(item.get("path", "")),
                change_type=str(item.get("change_type", "modified")),
                commit_sha=item.get("commit_sha"),
            )
            for item in artifact.edited_files
            if item.get("path")
        ]
        created_files = [
            CreatedFile(
                path=str(item.get("path", "")),
                commit_sha=item.get("commit_sha"),
            )
            for item in artifact.created_files
            if item.get("path")
        ]

        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="succeeded",
            summary=artifact.summary or artifact.title,
            key_findings=artifact.key_findings or artifact.body_markdown,
            last_response=artifact.body_markdown or artifact.key_findings,
            final_response=artifact.body_markdown or artifact.key_findings,
            detail_payload=detail_payload,
            edited_files=edited_files,
            created_files=created_files,
            artifacts=[
                Artifact(
                    type="agent_published",
                    description=f"{artifact.id} [{artifact.slug}] {artifact.title}",
                ),
            ],
            tags=list(artifact.tags),
        )

    def _validate_child_report(
        self,
        record: ChildTaskRecord,
        report: ChildReportArtifact,
        *,
        execution_elapsed_s: float | None = None,
        summary_elapsed_s: float | None = None,
    ) -> ChildReportArtifact:
        # Completion correctness is handled by the LLM-based CompletionClassifier
        # in the RalphLoop — no keyword-based heuristics here.  This method is
        # kept solely as a diagnostic hook that records the validation pass.
        self._record_report_validation(
            record,
            report.status,
            report.status,
            [],
            execution_elapsed_s=execution_elapsed_s,
            summary_elapsed_s=summary_elapsed_s,
        )
        return report

    def _record_report_validation(
        self,
        record: ChildTaskRecord,
        original_status: str,
        final_status: str,
        reasons: list[str],
        *,
        execution_elapsed_s: float | None,
        summary_elapsed_s: float | None,
    ) -> None:
        if self._session_dir is None:
            return
        self._diag.report_validation(
            actor=record.canonical_name,
            original_status=original_status,
            final_status=final_status,
            reasons=reasons,
            execution_elapsed_s=execution_elapsed_s,
            summary_elapsed_s=summary_elapsed_s,
        )

    def _build_incomplete_execution_report(
        self,
        record: ChildTaskRecord,
        transcript: list[dict[str, Any]],
        progress: ProgressAssessment,
        *,
        recovery_attempts: int,
    ) -> ChildReportArtifact:
        if progress.outcome == "housekeeping_only":
            summary = (
                "Child planned the work and used housekeeping tools, but never executed a "
                "task-advancing tool call."
            )
        elif progress.outcome == "answered":
            summary = (
                "Child declared the work finished without executing a task-advancing tool call."
            )
        elif progress.outcome == "malformed_tool_attempt":
            summary = (
                "Child emitted raw tool-call markup in its message, but no actual "
                "task-advancing tool call executed."
            )
        elif progress.outcome == "message_only":
            summary = (
                "Child replied with planning text only and never executed a task-advancing "
                "tool call."
            )
        else:
            summary = "Child stalled before producing any substantive execution."

        if recovery_attempts:
            summary += f" Recovery prompt sent {recovery_attempts} time(s) with no follow-through."

        tool_summary = ", ".join(progress.tool_names) if progress.tool_names else "none"
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="failed",
            summary=summary,
            key_findings=(
                f"Execution outcome: {progress.outcome}. Observed tools: {tool_summary}."
            ),
            last_response=extract_last_response(transcript),
            final_response=extract_final_response(transcript),
            next_recommended_actions=[
                "Retry with a stronger directive to execute a non-todo tool immediately.",
                "Switch persona or model if the agent repeatedly stops after planning.",
            ],
        )

    def _build_terminal_failure_report(
        self,
        record: ChildTaskRecord,
        transcript: list[dict[str, Any]],
        terminal_status: str,
    ) -> ChildReportArtifact:
        summary = f"Child stalled: conversation entered {terminal_status.upper()} state"
        if terminal_status == "stuck":
            summary = "Child session aborted after stuck recovery was exhausted."

        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="failed",
            summary=summary,
            last_response=extract_last_response(transcript),
            final_response=extract_final_response(transcript),
        )

    def _build_circuit_breaker_escalation_report(
        self,
        record: ChildTaskRecord,
        transcript: list[dict[str, Any]],
        escalation: Any,
    ) -> ChildReportArtifact:
        return ChildReportArtifact(
            agent_name=record.canonical_name,
            persona=record.persona,
            status="failed",
            summary="Child session aborted after repeated recovery attempts.",
            last_response=extract_last_response(transcript),
            final_response=extract_final_response(transcript),
            escalation=escalation,
        )

    def _build_execution_recovery_message(self, progress: ProgressAssessment) -> str:
        if progress.outcome == "housekeeping_only":
            return (
                "You created or updated the plan, but you have not executed any substantive work "
                "yet. Do not stop after todo management. In the next step, call a "
                "task-advancing tool such as delegate, write_file, terminal, fetch, or another "
                "non-todo tool that directly moves the task forward."
            )
        if progress.outcome == "answered":
            return (
                "You ended the run, but the task has not been carried out yet — you executed "
                "no substantive tool. If work remains, do it now: call a task-advancing tool "
                "such as delegate, write_file, terminal, fetch, or another non-todo tool "
                "before finishing."
            )
        if progress.outcome == "malformed_tool_attempt":
            return (
                "Your last response included raw tool-call markup, but no actual tool ran. "
                "Do not narrate a tool call in plain text. In the next step, invoke a "
                "task-advancing tool such as delegate, write_file, terminal, fetch, or another "
                "non-todo tool directly."
            )
        if progress.outcome == "message_only":
            return (
                "Your last response only described a plan. Do not stop after a narrative update. "
                "In the next step, call a task-advancing tool such as delegate, write_file, "
                "terminal, fetch, or another non-todo tool that directly moves the task forward."
            )
        return (
            "Your last response did not include any substantive execution. In the next step, "
            "call a task-advancing tool such as delegate, write_file, terminal, fetch, or another "
            "non-todo tool instead of only thinking or planning."
        )

    def _log_progress_assessment(
        self,
        record: ChildTaskRecord,
        progress: ProgressAssessment,
    ) -> None:
        tool_summary = _format_tool_counts(progress.tool_names)
        if progress.outcome == "executed_work":
            _log.info(
                "Child %s progress: outcome=%s tools=%s",
                record.canonical_name,
                progress.outcome,
                tool_summary,
            )
        else:
            _log.warning(
                "Child %s stalled: outcome=%s tools=%s",
                record.canonical_name,
                progress.outcome,
                tool_summary,
            )
