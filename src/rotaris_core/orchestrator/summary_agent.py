"""Cheap summary agent that generates ChildReportArtifact from child transcript."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

from openhands.sdk.llm.message import Message, TextContent

from rotaris_core.model_input import sanitize_completion_messages
from rotaris_core.orchestrator.report import ChildReportArtifact, ErrorInfo, extract_final_response
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from openhands.sdk import LLM

    from rotaris_core.orchestrator.child_state import ChildTaskRecord

_log = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = """You are a summary agent. Given a child agent's execution transcript,
produce a structured JSON report.

You must output ONLY valid JSON matching this schema:
{
  "agent_name": "string",
  "persona": "string",
  "status": "succeeded|failed|cancelled|blocked",
  "summary": "1-2 sentence summary of what happened",
  "key_findings": "Concise digest (≤5 bullet points, ≤600 chars total) of the most important \
findings, evidence, or conclusions. This text is injected as a summary into downstream agents' \
context — it MUST be short and scannable. Use the full body_markdown in `detail_payload.snippets` \
for verbatim evidence. Omit only if the child produced no findings (e.g. pure implementation).",
    "detail_payload": {
        "highlight_paths": [{"path": "str", "reason": "str|null"}],
        "snippets": [{"path": "str|null", "content": "str", "reason": "str|null"}],
        "tags": ["research"]
    },
  "edited_files": [{"path": "str", "change_type": "modified|deleted|renamed",
  "commit_sha": "str|null"}],
  "created_files": [{"path": "str", "commit_sha": "str|null"}],
  "artifacts": [{"type": "str", "path": "str|null", "description": "str"}],
  "commands": [{"command": "str", "exit_code": 0, "summary": "str"}],
  "tests": [{"name": "str", "status": "passed|failed|skipped|not_run", "summary": "str"}],
  "errors": [{"type": "str", "message": "str"}],
  "next_recommended_actions": ["str"]
}

Only include `detail_payload` when you have concrete evidence to preserve.
Any snippet in `detail_payload.snippets` must copy exact transcript-visible text rather than a
paraphrase. Omit uncertain snippets instead of guessing.

For research / planning / advisory personas (librarian, codebase-analyst, architect,
planner, researcher), `detail_payload.snippets` MUST contain at least one
verbatim snippet of the evidence you relied on — downstream agents will read
these instead of re-running your searches. If you cannot produce a snippet,
explain why in `key_findings` rather than fabricating one.

`detail_payload.tags` is an optional list of labels drawn from a closed vocabulary:
`research`, `planning`, `implementation`, `review`, `verification`, `errors`.
Choose 1-2 tags that best describe the work done (e.g. `["research"]` for a
librarian lookup, `["implementation", "errors"]` for a coding task with failures).
Do not use any other values.

Do not add commentary. Output ONLY JSON."""

_MAX_TRANSCRIPT_CHARS = 12000
_MAX_EVENT_CONTENT_CHARS = 2000

#: Report fields the runner and the loop own, not the model: the deterministic
#: evidence (SWR-2603), the gate decision derived from it (SWR-2604), and the
#: repair budget the gate charges (SWR-2605), the requirement-coverage evidence
#: (SWR-2606) and the scope-drift report (SWR-2607). They are stripped from LLM
#: output before validation, so a summarizing model can neither author nor
#: overwrite the evidence the completion gate reads, declare its own work
#: gate-passed, claim a repair attempt it never spent, claim requirement coverage
#: it never produced, nor hide the untraced files it touched. The summary prompt
#: deliberately omits them from its schema too, but the enforcement lives here —
#: structural, not prompt-dependent.
_RUNNER_OWNED_FIELDS = frozenset(
    {
        "verifier_results",
        "completion_gate",
        "repair",
        "requirement_evidence",
        "scope_drift",
        "gate_state",
    },
)


@traces(SWR.SWR_127, SWR.SWR_130)
class SummaryAgent:
    """Generates mandatory report artifacts for terminal child tasks."""

    def __init__(self, llm: LLM, timeout: float = 60.0) -> None:
        self.llm = llm
        self.timeout = timeout

    async def generate_report(
        self,
        child_record: ChildTaskRecord,
        transcript_events: list[dict[str, Any]],
        *,
        fallback_status: str = "failed",
    ) -> ChildReportArtifact:
        """Generate a ChildReportArtifact from the child's transcript."""
        final_response = extract_final_response(transcript_events)
        deterministic = self._deterministic_report_if_safe(
            child_record,
            transcript_events,
            fallback_status=fallback_status,
        )
        if deterministic is not None:
            return deterministic

        async def _run() -> ChildReportArtifact:
            transcript_summary = self._build_transcript_summary(transcript_events)
            _log.info(
                "Generating child report for %s with %d transcript events using %s",
                child_record.canonical_name,
                len(transcript_events),
                getattr(self.llm, "model", "unknown-model"),
            )
            base_prompt = (
                f"Agent: {child_record.canonical_name}\n"
                f"Persona: {child_record.persona}\n"
                f"Transcript summary:\n{transcript_summary}"
            )

            try:
                first_output = await self._request_completion(base_prompt)
                return self._with_final_response(
                    self._parse_report(first_output, child_record),
                    final_response,
                )
            except Exception as first_error:
                _log.warning(
                    "Summary generation first pass failed for %s: %s",
                    child_record.canonical_name,
                    first_error,
                )
                retry_prompt = (
                    f"{base_prompt}\n\n"
                    "Previous response could not be parsed as the required JSON report. "
                    f"Parse error: {first_error}\n"
                    "Return ONLY corrected JSON."
                )
                try:
                    second_output = await self._request_completion(retry_prompt)
                    return self._with_final_response(
                        self._parse_report(second_output, child_record),
                        final_response,
                    )
                except Exception as second_error:
                    _log.warning(
                        "Summary generation retry failed for %s: %s",
                        child_record.canonical_name,
                        second_error,
                    )
                    return self._fallback_report(
                        child_record,
                        str(second_error),
                        transcript_events,
                        fallback_status=fallback_status,
                    )

        try:
            return await asyncio.wait_for(_run(), timeout=self.timeout)
        except TimeoutError:
            _log.warning(
                "Summary generation timed out for %s after %ss",
                child_record.canonical_name,
                self.timeout,
            )
            return self._fallback_report(
                child_record,
                f"timed out after {self.timeout} seconds",
                transcript_events,
                fallback_status=fallback_status,
            )

    async def _request_completion(self, prompt: str) -> str:
        response = await asyncio.to_thread(
            self.llm.completion,
            sanitize_completion_messages(
                [
                    Message(role="system", content=[TextContent(text=SUMMARY_SYSTEM_PROMPT)]),
                    Message(role="user", content=[TextContent(text=prompt)]),
                ],
            ),
        )
        return self._response_text(response)

    def _deterministic_report_if_safe(
        self,
        child_record: ChildTaskRecord,
        transcript_events: list[dict[str, Any]],
        *,
        fallback_status: str,
    ) -> ChildReportArtifact | None:
        """Avoid an extra LLM call for simple verification-only transcripts."""
        if child_record.persona != "tester" or fallback_status != "succeeded":
            return None
        tool_names = [
            str(event.get("tool_name"))
            for event in transcript_events
            if event.get("role") == "tool" and event.get("tool_name")
        ]
        if not tool_names or len(transcript_events) > 8:
            return None
        final_response = extract_final_response(transcript_events)
        if not final_response:
            return None
        summary = self._build_fallback_summary(
            transcript_events,
            "deterministic verification summary",
            fallback_status,
        )
        return ChildReportArtifact(
            agent_name=child_record.canonical_name,
            persona=child_record.persona,
            status="succeeded",
            summary=summary,
            final_response=final_response,
        )

    def _response_text(self, response: object) -> str:
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

    def _build_transcript_summary(self, events: list[dict[str, Any]]) -> str:
        """Compress transcript events into concise text."""
        if not events:
            return "No transcript events."

        lines: list[str] = []
        for event in events:
            role = str(event.get("role", "unknown"))
            tool_name = event.get("tool_name")
            content = str(event.get("content", "")).strip().replace("\n", " ")
            if len(content) > _MAX_EVENT_CONTENT_CHARS:
                content = content[: _MAX_EVENT_CONTENT_CHARS - 1].rstrip() + "…"

            prefix = f"[{role}]"
            if tool_name:
                prefix = f"[{role}:{tool_name}]"
            lines.append(f"{prefix} {content}".rstrip())

        transcript = "\n".join(lines)
        if len(transcript) <= _MAX_TRANSCRIPT_CHARS:
            return transcript

        return transcript[: _MAX_TRANSCRIPT_CHARS - 1].rstrip() + "…"

    def _parse_report(
        self,
        llm_output: str,
        child_record: ChildTaskRecord,
    ) -> ChildReportArtifact:
        """Parse LLM JSON output into validated ChildReportArtifact."""
        cleaned_output = llm_output.strip()
        if cleaned_output.startswith("```"):
            lines = cleaned_output.splitlines()
            if lines:
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            cleaned_output = "\n".join(lines).strip()

        payload = json.loads(cleaned_output)
        if not isinstance(payload, dict):
            raise ValueError("LLM report output must be a JSON object")

        payload = self._normalize_payload(payload)
        payload["agent_name"] = child_record.canonical_name
        payload["persona"] = child_record.persona
        return ChildReportArtifact.model_validate(payload)

    @traces(SWR.SWR_2603, SWR.SWR_2604, SWR.SWR_2605, SWR.SWR_2606, SWR.SWR_2607)
    def _normalize_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(payload)
        for field in _RUNNER_OWNED_FIELDS:
            normalized.pop(field, None)
        key_findings = normalized.get("key_findings")
        if isinstance(key_findings, list):
            items = [str(item).strip() for item in key_findings if str(item).strip()]
            normalized["key_findings"] = "\n".join(f"- {item}" for item in items) or None
        detail_payload = normalized.get("detail_payload")
        if isinstance(detail_payload, dict):
            highlight_paths = detail_payload.get("highlight_paths")
            if isinstance(highlight_paths, list):
                detail_payload["highlight_paths"] = [
                    {"path": item} if isinstance(item, str) and item.strip() else item
                    for item in highlight_paths
                    if (isinstance(item, str) and item.strip()) or isinstance(item, dict)
                ]
            snippets = detail_payload.get("snippets")
            if isinstance(snippets, list):
                detail_payload["snippets"] = [
                    {"content": item} if isinstance(item, str) and item.strip() else item
                    for item in snippets
                    if (isinstance(item, str) and item.strip()) or isinstance(item, dict)
                ]
            tags = detail_payload.get("tags")
            if isinstance(tags, list):
                cleaned_tags = [str(t).strip() for t in tags if str(t).strip()]
                if cleaned_tags and not normalized.get("tags"):
                    normalized["tags"] = cleaned_tags
            normalized["detail_payload"] = detail_payload
        return normalized

    def _with_final_response(
        self,
        report: ChildReportArtifact,
        final_response: str | None,
    ) -> ChildReportArtifact:
        if report.final_response or not final_response:
            return report

        report.final_response = final_response
        return report

    def _fallback_report(
        self,
        child_record: ChildTaskRecord,
        error: str,
        transcript_events: list[dict[str, Any]],
        *,
        fallback_status: str,
    ) -> ChildReportArtifact:
        """Generate a minimal report when structured summarization is unavailable."""
        summary = self._build_fallback_summary(transcript_events, error, fallback_status)
        return ChildReportArtifact(
            agent_name=child_record.canonical_name,
            persona=child_record.persona,
            status=fallback_status,
            summary=summary,
            final_response=extract_final_response(transcript_events),
            errors=[ErrorInfo(type="summary_failure", message=error)],
        )

    def _build_fallback_summary(
        self,
        transcript_events: list[dict[str, Any]],
        error: str,
        fallback_status: str,
    ) -> str:
        final_agent_message = extract_final_response(transcript_events) or ""

        if final_agent_message:
            preview = final_agent_message.replace("\n", " ")
            if len(preview) > 220:
                preview = preview[:219].rstrip() + "…"
            prefix = "Child completed" if fallback_status == "succeeded" else "Child response"
            return f"{prefix}: {preview} (structured summary unavailable: {error})"

        tool_names = [
            str(event.get("tool_name"))
            for event in transcript_events
            if event.get("role") == "tool" and event.get("tool_name")
        ]
        if tool_names:
            used_tools = ", ".join(tool_names[:4])
            if len(tool_names) > 4:
                used_tools += ", …"
            return f"Child used tools {used_tools}; structured summary unavailable: {error}"

        if fallback_status == "succeeded":
            return f"Child completed, but structured summary was unavailable: {error}"
        return f"Summary generation failed: {error}"
