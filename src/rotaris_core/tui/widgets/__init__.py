from __future__ import annotations

from typing import TYPE_CHECKING, Any

__all__ = [
    "AgentStatusPane",
    "ArtifactEditor",
    "ChatPanel",
    "InputComposer",
    "ModelCatalogTable",
    "ReportViewer",
    "TodoPane",
]

if TYPE_CHECKING:
    from rotaris_core.tui.widgets.agent_status import AgentStatusPane
    from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor
    from rotaris_core.tui.widgets.chat_panel import ChatPanel
    from rotaris_core.tui.widgets.input_composer import InputComposer
    from rotaris_core.tui.widgets.model_catalog_table import ModelCatalogTable
    from rotaris_core.tui.widgets.report_viewer import ReportViewer
    from rotaris_core.tui.widgets.todo_pane import TodoPane


def __getattr__(name: str) -> Any:
    if name == "AgentStatusPane":
        from rotaris_core.tui.widgets.agent_status import AgentStatusPane

        return AgentStatusPane
    if name == "ArtifactEditor":
        from rotaris_core.tui.widgets.artifact_editor import ArtifactEditor

        return ArtifactEditor
    if name == "ChatPanel":
        from rotaris_core.tui.widgets.chat_panel import ChatPanel

        return ChatPanel
    if name == "InputComposer":
        from rotaris_core.tui.widgets.input_composer import InputComposer

        return InputComposer
    if name == "ModelCatalogTable":
        from rotaris_core.tui.widgets.model_catalog_table import ModelCatalogTable

        return ModelCatalogTable
    if name == "ReportViewer":
        from rotaris_core.tui.widgets.report_viewer import ReportViewer

        return ReportViewer
    if name == "TodoPane":
        from rotaris_core.tui.widgets.todo_pane import TodoPane

        return TodoPane
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
