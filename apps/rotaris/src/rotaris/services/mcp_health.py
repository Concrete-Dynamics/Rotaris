"""Background probe for live MCP server connectivity, off the Qt GUI thread."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, QThread, Signal
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import MCPServerConfig


@traces(SWR.SWR_2097)
class McpHealthCheckTask(QThread):
    """Probes each configured MCP server sequentially and emits per-server results."""

    server_checked = Signal(str, bool, str, object)  # name, healthy, error, tool_count

    def __init__(
        self,
        workspace: Path,
        servers: dict[str, MCPServerConfig],
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._workspace = workspace
        self._servers = dict(servers)

    def run(self) -> None:
        from rotaris_core.config.mcp_tool_discovery import probe_mcp_server_health

        for name, server_cfg in self._servers.items():
            result = probe_mcp_server_health(name, server_cfg, self._workspace)
            self.server_checked.emit(name, result.healthy, result.error or "", result.tool_count)
