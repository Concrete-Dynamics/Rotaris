from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.session.manager import SessionManager

_log = logging.getLogger(__name__)


@traces(SWR.SWR_1028, SWR.SWR_1126)
class SessionPickerScreen(ModalScreen[str]):
    def __init__(self, session_manager: SessionManager, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.session_manager = session_manager

    def compose(self) -> ComposeResult:
        with Vertical(id="session-picker-container"):
            yield DataTable(id="session-table", cursor_type="row")

    def on_mount(self) -> None:
        table = self.query_one(DataTable)
        table.add_columns("Session ID", "Created At", "Status")

        try:
            sessions = self.session_manager.list_sessions()
        except Exception as exc:  # noqa: BLE001
            _log.exception("Failed to list sessions")
            self.notify(
                f"Unable to list sessions: {exc}",
                severity="error",
            )
            sessions = []

        if not sessions:
            self.notify("No sessions found.", severity="information")

        for s in sessions:
            table.add_row(
                s.get("session_id", "unknown"),
                s.get("created_at", "unknown"),
                s.get("execution_status", "unknown"),
                key=s.get("session_id", "unknown"),
            )

        table.focus()

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        self.dismiss(event.row_key.value)
