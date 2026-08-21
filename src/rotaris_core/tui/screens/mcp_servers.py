from __future__ import annotations

from typing import TYPE_CHECKING, Any

from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.tui.mcp_toggles import MCPToggleStore


@traces(SWR.SWR_1717, SWR.SWR_1718, SWR.SWR_1719, SWR.SWR_1720, SWR.SWR_1721)
class MCPServersScreen(ModalScreen[None]):
    BINDINGS = [
        Binding("space", "toggle_selected", "Toggle"),
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, servers: list[dict[str, Any]], toggle_store: MCPToggleStore) -> None:
        super().__init__()
        self._servers = servers
        self._toggle_store = toggle_store

    def compose(self) -> ComposeResult:
        with Vertical(id="mcp-servers-container"):
            yield Static(
                "MCP Servers — space/enter to toggle, esc to close",
                id="mcp-servers-title",
            )
            if not self._servers:
                yield Static("No MCP servers configured.")
            else:
                yield DataTable(id="mcp-servers-table", cursor_type="row")

    def on_mount(self) -> None:
        if not self._servers:
            return

        table = self.query_one("#mcp-servers-table", DataTable)
        table.add_column("Name", key="name")
        table.add_column("Source", key="source")
        table.add_column("Type", key="type")
        table.add_column("Status", key="status")
        table.add_column("Enabled", key="enabled")

        for server in self._servers:
            name = server["name"]
            source = server.get("source", "default")
            type_str = server.get("type", "stdio")
            status = server.get("status", "active")
            enabled = self._toggle_store.is_enabled(name)
            enabled_str = "[x]" if enabled else "[ ]"

            table.add_row(name, source, type_str, status, enabled_str, key=name)

        if table.row_count > 0:
            table.focus()

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        self.action_toggle_selected()

    def action_toggle_selected(self) -> None:
        if not self._servers:
            return

        table = self.query_one("#mcp-servers-table", DataTable)
        if table.cursor_row is None:
            return

        row_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key
        name = str(row_key.value)

        current_state = self._toggle_store.is_enabled(name)
        new_state = not current_state

        self._toggle_store.set_enabled(name, new_state)

        new_label = "[x]" if new_state else "[ ]"
        table.update_cell(row_key, "enabled", new_label)

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)
