"""Tool for retrieving the result of a completed background task by ID."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence
    from typing import Self

    from rotaris_core.orchestrator.child_manager import ChildManager
    from rotaris_core.orchestrator.report import ChildReportArtifact


class BackgroundOutputAction(Action):
    task_id: str = Field(
        description="The task ID (e.g. 'bg_f8bd7970') returned by a prior delegate call.",
    )
    detail_level: Literal["summary", "verbatim"] = Field(
        default="summary",
        description=(
            "Retrieval mode. Use 'summary' for the compact report or 'verbatim' for an "
            "expanded payload with the exact last reply and stored evidence."
        ),
    )


class BackgroundOutputObservation(Observation):
    status: Literal["ok", "not_found", "still_running"] = Field(
        description="Result status: ok (report available), not_found, or still_running.",
    )
    task_id: str = Field(description="The requested task ID.")
    report_text: str | None = Field(
        default=None,
        description="Serialised report content (populated when status is 'ok').",
    )

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        if self.status == "ok":
            header = f"background_output({self.task_id}): ok"
            body = self.report_text or self.text or ""
            return [TextContent(text=f"{header}\n{body}")]
        return [TextContent(text=f"background_output({self.task_id}): {self.status}")]


@traces(
    SWR.SWR_141,
    SWR.SWR_1501,
    SWR.SWR_1502,
    SWR.SWR_1503,
    SWR.SWR_1504,
    SWR.SWR_1505,
    SWR.SWR_1506,
    SWR.SWR_1507,
    SWR.SWR_1508,
    SWR.SWR_1509,
    SWR.SWR_2132,
)
class BackgroundOutputExecutor(
    ToolExecutor[BackgroundOutputAction, BackgroundOutputObservation],
):
    def __init__(
        self,
        child_manager: ChildManager,
        *,
        parent_canonical_name: str | None = None,
    ) -> None:
        self.child_manager = child_manager
        self.parent_canonical_name = parent_canonical_name

    def __call__(
        self,
        action: BackgroundOutputAction,
        conversation: object = None,
    ) -> BackgroundOutputObservation:
        task_id = action.task_id
        record = self.child_manager.get_record_by_task_id(task_id)
        if record is None or record.parent_agent_id != self.parent_canonical_name:
            return BackgroundOutputObservation.from_text(
                f"No task found with ID '{task_id}'.",
                is_error=True,
                status="not_found",
                task_id=task_id,
            )

        report = self.child_manager.results_by_task_id.get(task_id)
        if report is not None:
            report_text = self._render_report_text(report, action.detail_level)
            return BackgroundOutputObservation.from_text(
                report_text,
                status="ok",
                task_id=task_id,
                report_text=report_text,
            )

        record = self.child_manager.get_record_by_task_id(task_id)
        if record is not None:
            return BackgroundOutputObservation.from_text(
                f"Task {task_id} is still running (state: {record.state.value}).",
                status="still_running",
                task_id=task_id,
            )

        return BackgroundOutputObservation.from_text(
            f"No task found with ID '{task_id}'.",
            is_error=True,
            status="not_found",
            task_id=task_id,
        )

    def _render_report_text(
        self,
        report: ChildReportArtifact,
        detail_level: Literal["summary", "verbatim"],
    ) -> str:
        if detail_level == "verbatim":
            return self._render_verbatim_report_text(report)
        return self._render_summary_report_text(report)

    def _render_summary_report_text(self, report: ChildReportArtifact) -> str:
        response = report.final_response or report.last_response
        lines = [
            f"Agent: {report.agent_name} ({report.persona})",
            f"Status: {report.status}",
            f"Summary: {report.summary}",
        ]
        if report.artifacts:
            artifact_summary = "; ".join(
                artifact.description for artifact in report.artifacts if artifact.description
            )
            if artifact_summary:
                lines.append(f"Artifacts: {artifact_summary}")
        if report.key_findings:
            lines.append(f"Key findings: {report.key_findings}")
        if response:
            lines.extend(["Last reply:", response])
        return "\n".join(lines)

        lines = [
            f"Agent: {report.agent_name} ({report.persona})",
            f"Status: {report.status}",
            f"Summary: {report.summary}",
        ]
        if report.artifacts:
            artifact_summary = "; ".join(
                artifact.description for artifact in report.artifacts if artifact.description
            )
            if artifact_summary:
                lines.append(f"Artifacts: {artifact_summary}")
        if report.key_findings:
            lines.append(f"Key findings: {report.key_findings}")
        if report.final_response:
            lines.append("Last reply:")
            lines.append(report.final_response)
        return "\n".join(lines)

    def _render_verbatim_report_text(self, report: ChildReportArtifact) -> str:
        response = report.final_response or report.last_response
        lines = [
            f"Agent: {report.agent_name} ({report.persona})",
            f"Status: {report.status}",
            f"Summary: {report.summary}",
            "Detail level: verbatim",
        ]
        if report.key_findings:
            lines.extend(["", "Key findings:", report.key_findings])
        lines.extend(["", "Exact last reply:", response or "Unavailable"])
        touched_paths = self._collect_touched_paths(report)
        if touched_paths:
            lines.extend(["", "Touched files:", *(f"- {path}" for path in touched_paths)])
        detail_payload = report.detail_payload
        if detail_payload and detail_payload.highlight_paths:
            lines.extend(["", "Highlighted paths:"])
            for item in detail_payload.highlight_paths:
                line = f"- {item.path}"
                if item.reason:
                    line += f": {item.reason}"
                lines.append(line)
        if detail_payload and detail_payload.snippets:
            lines.extend(["", "Highlighted snippets:"])
            for index, snippet in enumerate(detail_payload.snippets, start=1):
                label = f"{index}."
                if snippet.path:
                    label += f" ({snippet.path})"
                if snippet.reason:
                    label += f" {snippet.reason}"
                lines.extend([label, snippet.content])
        return "\n".join(lines)

        lines = [
            f"Agent: {report.agent_name} ({report.persona})",
            f"Status: {report.status}",
            f"Summary: {report.summary}",
            "Detail level: verbatim",
        ]
        if report.key_findings:
            lines.append("")
            lines.append("Key findings:")
            lines.append(report.key_findings)

        lines.append("")
        lines.append("Exact last reply:")
        if report.final_response:
            lines.append(report.final_response)
        else:
            lines.append("Unavailable")

        touched_paths = self._collect_touched_paths(report)
        if touched_paths:
            lines.append("")
            lines.append("Touched files:")
            lines.extend(f"- {path}" for path in touched_paths)

        detail_payload = report.detail_payload
        if detail_payload and detail_payload.highlight_paths:
            lines.append("")
            lines.append("Highlighted paths:")
            for item in detail_payload.highlight_paths:
                line = f"- {item.path}"
                if item.reason:
                    line += f": {item.reason}"
                lines.append(line)

        if detail_payload and detail_payload.snippets:
            lines.append("")
            lines.append("Highlighted snippets:")
            for index, snippet in enumerate(detail_payload.snippets, start=1):
                label = f"- Snippet {index}"
                if snippet.path:
                    label += f" ({snippet.path})"
                if snippet.reason:
                    label += f": {snippet.reason}"
                lines.append(label)
                lines.append(snippet.content)

        return "\n".join(lines)

    def _collect_touched_paths(self, report: ChildReportArtifact) -> list[str]:
        paths: list[str] = []
        seen: set[str] = set()

        def _add(path: str | None) -> None:
            if not path or path in seen:
                return
            seen.add(path)
            paths.append(path)

        for edited_file in report.edited_files:
            _add(edited_file.path)
        for created_file in report.created_files:
            _add(created_file.path)
        for artifact in report.artifacts:
            _add(artifact.path)

        return paths


_BACKGROUND_OUTPUT_TOOL_DESCRIPTION = (
    "Retrieve the full result of a completed background task by its task_id. "
    "Call this after receiving a completion notification for a background task. "
    "Returns status='ok' with the stored report if the task has completed, "
    "status='still_running' if the task is in progress, or "
    "status='not_found' if the task_id is unknown. "
    "Required parameter: task_id (str) — the ID returned by a prior delegate call. "
    "Optional parameter: detail_level ('summary'|'verbatim', default 'summary') — "
    "use 'verbatim' when you need the exact last reply and any stored detailed evidence."
)


class BackgroundOutputTool(
    ToolDefinition[BackgroundOutputAction, BackgroundOutputObservation],
):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        del conv_state
        child_manager = kwargs["child_manager"]
        return [
            cls(
                description=_BACKGROUND_OUTPUT_TOOL_DESCRIPTION,
                action_type=BackgroundOutputAction,
                observation_type=BackgroundOutputObservation,
                executor=BackgroundOutputExecutor(
                    child_manager,
                    parent_canonical_name=kwargs.get("canonical_name") or kwargs.get("persona"),
                ),
            ),
        ]
