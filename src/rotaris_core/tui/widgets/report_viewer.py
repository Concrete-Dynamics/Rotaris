from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rich import box
from rich.panel import Panel
from rich.text import Text
from textual.widgets import Static

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.themes import get_theme

if TYPE_CHECKING:
    from rich.console import RenderableType

    from rotaris_core.orchestrator.report import ChildReportArtifact


def build_report_renderable(report: ChildReportArtifact) -> RenderableType:
    t = get_theme()
    color = t.fg_dim
    if report.status == "succeeded":
        color = t.green
    elif report.status == "failed":
        color = t.red
    elif report.status == "cancelled":
        color = t.yellow

    content = Text(report.summary, style=t.fg)
    content.append("\n\n")

    if report.edited_files:
        content.append("Edited files:\n", style=f"bold {t.cyan}")
        for ef in report.edited_files:
            content.append(f"  - {ef.path} ({ef.change_type})\n", style=t.fg_subtle)
    if report.created_files:
        content.append("Created files:\n", style=f"bold {t.cyan}")
        for cf in report.created_files:
            content.append(f"  - {cf.path}\n", style=t.fg_subtle)
    if report.errors:
        content.append("Errors:\n", style=f"bold {t.red}")
        for err in report.errors:
            content.append(f"  - [{err.type}] {err.message}\n", style=t.red)

    title = f" report / {report.persona} / {report.status} "
    subtitle = report.agent_name
    return Panel(content, title=title, subtitle=subtitle, border_style=color, box=box.SQUARE)


@traces(SWR.SWR_1010)
class ReportViewer(Static):
    def __init__(self, report: ChildReportArtifact, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.report = report

    def render(self) -> RenderableType:
        return build_report_renderable(self.report)
