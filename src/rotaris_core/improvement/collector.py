"""Post-run :class:`ImprovementCollector` — dedicated analyst LLM.

Modelled on :class:`~rotaris_core.orchestrator.summary_agent.SummaryAgent`:
same retry-then-empty-fallback contract so a collector failure never blocks
``task_run`` completion (REQ-20260515-POSTRUN-IMPROVE-012).

The collector authors a structured
:class:`~rotaris_core.improvement.proposals.ImprovementProposalArtifact` from
already-finished run state. It must not influence the orchestrator's decisions
during the active run (REQ-20260515-POSTRUN-IMPROVE-002,003).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.improvement.proposals import (
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    new_artifact_id,
    new_proposal_id,
)
from rotaris_core.improvement.types import RunType
from rotaris_core.llm_threads import call_llm_detached
from rotaris_core.model_input import sanitize_completion_messages
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk import LLM

_log = logging.getLogger(__name__)

_MAX_TRANSCRIPT_CHARS = 12_000
_MAX_EVENT_CONTENT_CHARS = 2_000
_MAX_REPORT_CHARS = 6_000


IMPROVEMENT_COLLECTOR_SYSTEM_PROMPT = """You are an Improvement Collector.

You analyse a completed task run AFTER it has reached a terminal state. You do
NOT decide what the user task should do, you do NOT execute any change, and
you do NOT propose work the user did not ask for. Your only job is to surface
durable, evidence-backed workspace improvements that would reduce friction on
future runs.

Output ONLY valid JSON matching this schema:

{
  "proposals": [
    {
      "category": "documentation_update | agents_md_update | workspace_note | \
config_change | tool_enablement | dependency_install | persona_or_prompt_adjustment | \
persona_memory_update | preflight_check | verifier_gate_update",
      "summary": "1-2 sentence headline of the improvement.",
      "recommended_action": "Concrete bounded action a future improvement run \
could execute.",
      "risk": "low | medium | high",
      "target_persona": "persona name, REQUIRED for persona_memory_update, otherwise null",
      "proposed_verifier_section": "REQUIRED for verifier_gate_update, otherwise null. \
The complete verifier: block approval would produce, e.g. \
{\"checks\": [{\"name\": \"pytest\", \"command\": \"uv run pytest -q\", \"role\": \"test\"}]}",
      "evidence": [
        {
          "kind": "transcript_observation | repeated_tool_failure | \
missing_resource | child_report_finding | repeated_search | other",
          "text": "Why this improvement is justified.",
          "source_task_id": "task_id if applicable, else null",
          "source_artifact_id": "artifact id if applicable, else null",
          "excerpt": "verbatim excerpt if useful, else null"
        }
      ]
    }
  ],
  "notes": "Optional short remark about coverage or gaps. Omit when not needed."
}

Hard rules:

1. Every proposal MUST carry at least one evidence entry that points at a
   concrete observation from the completed run. If you cannot cite evidence,
   do NOT emit the proposal.
2. Do NOT speculate about future features, refactors, or product work the
   user did not request.
3. Do NOT propose anything that would be executed automatically. Approval is
   user-gated downstream.
4. If the run shows no credible improvement signals, return
   ``{"proposals": [], "notes": "no actionable signals"}``.
5. Persona-memory proposals must target a single persona via
   ``target_persona`` and must describe small operational guidance only —
   never a full persona rewrite.
6. ``verifier_gate_update`` is for changes to the workspace's check suite that
   the automatic paths are not allowed to make on their own: removing a check,
   lowering one from blocking to advisory, adding the first check for a role, or
   adopting a newly appeared sub-project's suite. Use it ONLY when the GATE
   EVIDENCE below shows something concrete — a check that could not be executed,
   a role with markers and no check, a suite that no longer matches the tree.
   You MUST supply ``proposed_verifier_section`` with the *complete* block, not a
   fragment and not a description: the user reviews the resulting configuration.
   Do not propose one because the gate looks improvable in the abstract.

Do not add commentary outside the JSON object."""


@traces(
    SWR.SWR_1601,
    SWR.SWR_1602,
    SWR.SWR_1603,
    SWR.SWR_1606,
    SWR.SWR_1607,
    SWR.SWR_1610,
    SWR.SWR_1611,
    SWR.SWR_1612,
    SWR.SWR_1617,
)
class ImprovementCollector:
    """Generates :class:`ImprovementProposalArtifact` from a completed run."""

    def __init__(self, llm: LLM, timeout: float = 60.0) -> None:
        self.llm = llm
        self.timeout = timeout

    async def generate_artifact(
        self,
        *,
        session_id: str,
        run_type: RunType = RunType.TASK_RUN,
        progress: Any,
        todo: Any,
        transcript_events: list[dict[str, Any]] | None = None,
        child_reports: list[dict[str, Any]] | None = None,
        workspace_history: list[ImprovementProposalArtifact] | None = None,
        gate_evidence: dict[str, Any] | None = None,
    ) -> ImprovementProposalArtifact:
        """Authors a structured artifact. Never raises into the caller."""
        transcript_events = transcript_events or []
        child_reports = child_reports or []
        workspace_history = workspace_history or []
        gate_evidence = gate_evidence or {}

        async def _run() -> ImprovementProposalArtifact:
            prompt = self._build_user_prompt(
                progress=progress,
                todo=todo,
                transcript_events=transcript_events,
                child_reports=child_reports,
                workspace_history=workspace_history,
                gate_evidence=gate_evidence,
            )
            try:
                first_output = await self._request_completion(prompt)
                return self._deduplicated(
                    self._parse_artifact(
                        first_output,
                        session_id=session_id,
                        run_type=run_type,
                        considered_session_ids=[
                            artifact.source_session_id for artifact in workspace_history
                        ],
                    ),
                    gate_evidence,
                    workspace_history,
                )
            except Exception as first_error:  # noqa: BLE001
                _log.warning(
                    "Improvement collector first pass failed: %s",
                    first_error,
                )
                retry_prompt = (
                    f"{prompt}\n\n"
                    "Previous response could not be parsed as the required JSON. "
                    f"Parse error: {first_error}\n"
                    "Return ONLY corrected JSON."
                )
                try:
                    second_output = await self._request_completion(retry_prompt)
                    return self._deduplicated(
                        self._parse_artifact(
                            second_output,
                            session_id=session_id,
                            run_type=run_type,
                            considered_session_ids=[
                                artifact.source_session_id for artifact in workspace_history
                            ],
                        ),
                        gate_evidence,
                        workspace_history,
                    )
                except Exception as second_error:  # noqa: BLE001
                    _log.warning(
                        "Improvement collector retry failed: %s",
                        second_error,
                    )
                    return self._empty_artifact(
                        session_id=session_id,
                        run_type=run_type,
                        considered_session_ids=[
                            artifact.source_session_id for artifact in workspace_history
                        ],
                        notes=f"collector parse failed: {second_error}",
                    )

        try:
            return await asyncio.wait_for(_run(), timeout=self.timeout)
        except TimeoutError:
            _log.warning(
                "Improvement collector timed out after %ss",
                self.timeout,
            )
            return self._empty_artifact(
                session_id=session_id,
                run_type=run_type,
                considered_session_ids=[
                    artifact.source_session_id for artifact in workspace_history
                ],
                notes=f"collector timed out after {self.timeout} seconds",
            )
        except Exception as exc:  # noqa: BLE001 — defensive: never bubble up.
            _log.exception("Improvement collector crashed: %s", exc)
            return self._empty_artifact(
                session_id=session_id,
                run_type=run_type,
                considered_session_ids=[
                    artifact.source_session_id for artifact in workspace_history
                ],
                notes=f"collector crashed: {exc}",
            )

    # -- LLM I/O ---------------------------------------------------------

    async def _request_completion(self, prompt: str) -> str:
        messages = sanitize_completion_messages(
            [
                Message(
                    role="system",
                    content=[TextContent(text=IMPROVEMENT_COLLECTOR_SYSTEM_PROMPT)],
                ),
                Message(role="user", content=[TextContent(text=prompt)]),
            ],
        )
        # Detached: a hung provider must not delay the host past self.timeout
        # (REQ-20260515-POSTRUN-IMPROVE-012).
        response = await call_llm_detached(self.llm.completion, messages)
        return self._response_text(response)

    @staticmethod
    def _response_text(response: object) -> str:
        message = getattr(response, "message", None)
        if message is None:
            raise ValueError("LLM response did not include a message")

        parts: list[str] = []
        for item in getattr(message, "content", []) or []:
            if isinstance(item, TextContent):
                parts.append(item.text)
            else:
                text = getattr(item, "text", None)
                if isinstance(text, str):
                    parts.append(text)

        text = "\n".join(part for part in parts if part).strip()
        if not text:
            raise ValueError("LLM response message was empty")
        return text

    # -- Prompt construction --------------------------------------------

    def _build_user_prompt(
        self,
        *,
        progress: Any,
        todo: Any,
        transcript_events: list[dict[str, Any]],
        child_reports: list[dict[str, Any]],
        workspace_history: list[ImprovementProposalArtifact],
        gate_evidence: dict[str, Any] | None = None,
    ) -> str:
        progress_block = self._compact_progress(progress)
        todo_block = self._compact_todo(todo)
        transcript_block = self._compact_transcript(transcript_events)
        reports_block = self._compact_child_reports(child_reports)
        workspace_history_block = self._compact_workspace_history(workspace_history)
        gate_block = self._compact_gate_evidence(gate_evidence)
        return (
            "Analyse this completed task run and return improvement proposals.\n\n"
            f"RUN PROGRESS:\n{progress_block}\n\n"
            f"TODO STATE:\n{todo_block}\n\n"
            f"CHILD REPORTS:\n{reports_block}\n\n"
            f"GATE EVIDENCE:\n{gate_block}\n\n"
            f"TRANSCRIPT SUMMARY:\n{transcript_block}\n\n"
            f"RECENT WORKSPACE IMPROVEMENT HISTORY:\n{workspace_history_block}"
        )

    @staticmethod
    @traces(SWR.SWR_2617)
    def _compact_gate_evidence(evidence: dict[str, Any] | None) -> str:
        """What this run learned about its own quality gate (SWR-2617).

        Rendered by the verifier rather than here: the collector reads evidence,
        it does not decide what the gate's state means. Absent evidence says so
        rather than being omitted, because "no gate evidence" and "a gate with
        nothing to report" are different facts and only one of them invites a
        proposal.
        """
        from rotaris_core.verifier.drift import describe_gate_evidence

        if not evidence:
            return "(no gate evidence available)"
        described = describe_gate_evidence(evidence)
        return described or "(the gate is calibrated and had nothing to report)"

    @staticmethod
    def _compact_progress(progress: Any) -> str:
        if progress is None:
            return "(no progress available)"
        try:
            data = progress.model_dump(mode="json")
        except AttributeError:
            return str(progress)
        iterations = data.get("iterations") or []
        lines = [
            f"stop_reason: {data.get('stop_reason')}",
            f"total_tasks: {data.get('total_tasks')}",
            f"completed_tasks: {data.get('completed_tasks')}",
            f"abandoned_tasks: {data.get('abandoned_tasks')}",
            f"iteration_count: {len(iterations)}",
        ]
        for iteration in iterations[-8:]:
            lines.append(
                "- iter "
                f"{iteration.get('iteration_number')}: "
                f"{iteration.get('outcome')} "
                f"task={iteration.get('task_name')!r} "
                f"summary={iteration.get('report_summary')!r}",
            )
        return "\n".join(lines)

    @staticmethod
    def _compact_todo(todo: Any) -> str:
        if todo is None:
            return "(no todo available)"
        try:
            data = todo.model_dump(mode="json")
        except AttributeError:
            return str(todo)
        lines: list[str] = []
        for phase in data.get("phases", []) or []:
            lines.append(f"[{phase.get('name')}]")
            for task in phase.get("tasks", []) or []:
                lines.append(
                    f"  - {task.get('status')} :: {task.get('name')}",
                )
        return "\n".join(lines) or "(empty todo)"

    @staticmethod
    def _compact_transcript(events: list[dict[str, Any]]) -> str:
        if not events:
            return "(no transcript events)"
        lines: list[str] = []
        for event in events:
            role = str(event.get("role", "unknown"))
            tool_name = event.get("tool_name")
            content = str(event.get("content", "")).strip().replace("\n", " ")
            if len(content) > _MAX_EVENT_CONTENT_CHARS:
                content = content[: _MAX_EVENT_CONTENT_CHARS - 1].rstrip() + "…"
            prefix = f"[{role}:{tool_name}]" if tool_name else f"[{role}]"
            lines.append(f"{prefix} {content}".rstrip())
        transcript = "\n".join(lines)
        if len(transcript) > _MAX_TRANSCRIPT_CHARS:
            transcript = transcript[: _MAX_TRANSCRIPT_CHARS - 1].rstrip() + "…"
        return transcript

    @staticmethod
    def _compact_child_reports(reports: list[dict[str, Any]]) -> str:
        if not reports:
            return "(no child reports)"
        blob = json.dumps(reports, default=str, indent=2)
        if len(blob) > _MAX_REPORT_CHARS:
            blob = blob[: _MAX_REPORT_CHARS - 1].rstrip() + "…"
        return blob

    @staticmethod
    def _compact_workspace_history(
        artifacts: list[ImprovementProposalArtifact],
    ) -> str:
        if not artifacts:
            return "(no prior workspace artifacts)"

        lines: list[str] = []
        for artifact in artifacts:
            lines.append(
                f"- artifact={artifact.artifact_id} "
                f"generated_at={artifact.generated_at.isoformat()} "
                f"source_session={artifact.source_session_id} "
                f"run_type={artifact.source_run_type.value}",
            )
            if artifact.notes:
                lines.append(f"  notes: {artifact.notes}")
            for proposal in artifact.proposals[:8]:
                lines.append(
                    "  proposal="
                    f"{proposal.id} status={proposal.status.value} "
                    f"category={proposal.category.value} "
                    f"summary={proposal.summary!r}",
                )
        return "\n".join(lines)

    # -- Output parsing -------------------------------------------------

    def _parse_artifact(
        self,
        llm_output: str,
        *,
        session_id: str,
        run_type: RunType,
        considered_session_ids: list[str],
    ) -> ImprovementProposalArtifact:
        cleaned = llm_output.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines:
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        payload = json.loads(cleaned)
        if not isinstance(payload, dict):
            raise ValueError("collector output must be a JSON object")

        raw_proposals = payload.get("proposals", [])
        if not isinstance(raw_proposals, list):
            raise ValueError("'proposals' must be a list")

        proposals: list[ImprovementProposal] = []
        for raw in raw_proposals:
            if not isinstance(raw, dict):
                raise ValueError("each proposal must be a JSON object")
            raw = dict(raw)
            raw.setdefault("id", new_proposal_id(session_id))
            evidence_list = raw.get("evidence")
            if isinstance(evidence_list, list):
                normalized_evidence: list[dict[str, Any] | Any] = []
                for evidence in evidence_list:
                    if isinstance(evidence, dict):
                        evidence = dict(evidence)
                        evidence.setdefault("source_session_id", session_id)
                    normalized_evidence.append(evidence)
                raw["evidence"] = normalized_evidence
            # Coerce category from unknown values to a safe fallback rather
            # than silently dropping the proposal — surfacing the evidence is
            # the higher priority.
            category = raw.get("category")
            if category not in {c.value for c in ImprovementProposalCategory}:
                raw["category"] = ImprovementProposalCategory.WORKSPACE_NOTE.value
            proposals.append(ImprovementProposal.model_validate(raw))

        notes = payload.get("notes")
        if notes is not None and not isinstance(notes, str):
            notes = str(notes)

        return ImprovementProposalArtifact(
            artifact_id=new_artifact_id(session_id),
            source_session_id=session_id,
            source_run_type=run_type,
            collector_model=getattr(self.llm, "model", None),
            proposals=proposals,
            considered_session_ids=list(dict.fromkeys(considered_session_ids)),
            notes=notes,
        )

    @traces(SWR.SWR_2617, SWR.SWR_1640)
    def _deduplicated(
        self,
        artifact: ImprovementProposalArtifact,
        gate_evidence: dict[str, Any],
        history: list[ImprovementProposalArtifact],
    ) -> ImprovementProposalArtifact:
        """Drop gate proposals the user has already been shown and not acted on.

        After the answer rather than inside the prompt, deliberately (SWR-2617):
        a model told not to repeat itself repeats itself, and an unanswered
        question asked every single run stops being read — which costs the user
        the next question too.
        """
        from rotaris_core.verifier.drift import (
            is_duplicate_gate_proposal,
            stamp_gate_proposal,
        )

        if not artifact.proposals:
            return artifact
        kept = [
            # Stamped with the evidence it was made from, which is both the
            # citation SWR-2617 requires and what lets the *next* run tell this
            # proposal apart from the same block against a changed workspace.
            stamp_gate_proposal(proposal, gate_evidence)
            for proposal in artifact.proposals
            if not is_duplicate_gate_proposal(proposal, gate_evidence, history)
        ]
        if len(kept) == len(artifact.proposals):
            return artifact.model_copy(update={"proposals": kept})
        _log.info(
            "Dropped %d unchanged gate proposal(s) already awaiting review",
            len(artifact.proposals) - len(kept),
        )
        return artifact.model_copy(update={"proposals": kept})

    def _empty_artifact(
        self,
        *,
        session_id: str,
        run_type: RunType,
        considered_session_ids: list[str],
        notes: str | None,
    ) -> ImprovementProposalArtifact:
        return ImprovementProposalArtifact(
            artifact_id=new_artifact_id(session_id),
            source_session_id=session_id,
            source_run_type=run_type,
            collector_model=getattr(self.llm, "model", None),
            proposals=[],
            considered_session_ids=list(dict.fromkeys(considered_session_ids)),
            notes=notes,
        )
