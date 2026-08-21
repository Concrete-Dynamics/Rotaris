from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable, Static

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tui.widgets.model_catalog_table import (
    ModelCatalogRow,
    ModelCatalogTable,
    build_configured_catalog_rows,
    build_provider_catalogs,
    merge_runtime_catalog_row,
    model_catalog_row_key,
)

if TYPE_CHECKING:
    from textual.app import ComposeResult

    from rotaris_core.config.schema import RotarisConfig


@dataclass(frozen=True)
class RuntimeModelSelection:
    provider_id: str
    provider_display_name: str
    model_id: str
    qualified_model_id: str
    limits: dict[str, object]


@dataclass(frozen=True)
class RuntimeModelResult:
    selection: RuntimeModelSelection


class _ScreenRefreshUI:
    def __init__(self, screen: RuntimeModelsScreen) -> None:
        self._screen = screen

    def info(self, message: str) -> None:
        self._screen.set_status(message)

    def warning(self, message: str) -> None:
        self._screen.set_status(message)

    def error(self, message: str) -> None:
        self._screen.set_status(message)


@traces(
    SWR.SWR_802,
    SWR.SWR_803,
    SWR.SWR_804,
    SWR.SWR_805,
    SWR.SWR_806,
    SWR.SWR_807,
    SWR.SWR_808,
    SWR.SWR_809,
    SWR.SWR_811,
)
class RuntimeModelsScreen(ModalScreen[RuntimeModelResult | None]):
    BINDINGS = [
        Binding("enter", "select_model", "Select"),
        Binding("r", "refresh_catalogs", "Refresh"),
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, config: RotarisConfig) -> None:
        super().__init__()
        self._config = config
        self._rows: dict[str, RuntimeModelSelection] = {}
        self._catalog_rows: dict[str, ModelCatalogRow] = {}

    def compose(self) -> ComposeResult:
        with Vertical(id="runtime-models-container"):
            yield Static("Runtime Models", id="runtime-models-title")
            yield Static(
                "Provider catalogs from configured and authenticated providers",
                id="runtime-models-help",
            )
            yield Static("Loading provider catalogs...", id="runtime-models-status")
            yield ModelCatalogTable(id="runtime-models-table", cursor_type="row")

    async def on_mount(self) -> None:
        table = self.query_one("#runtime-models-table", ModelCatalogTable)
        table.ensure_model_catalog_columns()
        table.focus()
        await self._load_catalogs()

    async def action_refresh_catalogs(self) -> None:
        await self._load_catalogs()

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        del event
        self.action_select_model()

    def action_select_model(self) -> None:
        table = self.query_one("#runtime-models-table", ModelCatalogTable)
        if table.row_count == 0:
            return

        if table.cursor_row is None:
            row_key = next(iter(self._rows), "")
        else:
            row_key = str(table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value)
        selection = self._rows.get(row_key)
        if selection is None:
            self.notify(
                "No runtime model is available in this row.",
                severity="warning",
            )
            return
        self.dismiss(RuntimeModelResult(selection))

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)

    async def _load_catalogs(self) -> None:
        from rotaris_core.auth.manager import AuthManager
        from rotaris_core.cli.model_refresh import discover_authenticated_models

        table = self.query_one("#runtime-models-table", ModelCatalogTable)
        table.clear()
        self._rows.clear()
        self._catalog_rows = build_configured_catalog_rows(self._config)
        self.set_status("Loading provider catalogs...")

        auth_manager = AuthManager()
        messages: list[str] = []
        for catalog in build_provider_catalogs(self._config):
            discovery = await discover_authenticated_models(
                catalog.provider_id,
                auth_manager=auth_manager,
                ui=_ScreenRefreshUI(self),
            )
            if discovery.error is not None:
                messages.append(f"{catalog.display_name}: {discovery.error}")
                continue
            if not discovery.models:
                messages.append(f"{catalog.display_name}: no runtime models returned.")
                continue

            for model in discovery.models:
                row = merge_runtime_catalog_row(
                    self._catalog_rows,
                    provider_id=catalog.provider_id,
                    provider_display_name=catalog.display_name,
                    model=model,
                )
                row_key = model_catalog_row_key(row.identity)
                qualified_id = model.qualified_id or f"{catalog.provider_id}/{model.id}"
                selection = RuntimeModelSelection(
                    provider_id=catalog.provider_id,
                    provider_display_name=catalog.display_name,
                    model_id=model.id,
                    qualified_model_id=qualified_id,
                    limits=dict(model.limits),
                )
                self._rows[row_key] = selection
                table.add_row(
                    row.provider_display_name,
                    row.model_display_name,
                    row.source,
                    key=row_key,
                )

        if table.row_count > 0:
            message = f"Loaded {table.row_count} runtime model"
            if table.row_count != 1:
                message += "s"
            if messages:
                message += f"; {messages[0]}"
            self.set_status(message)
            return

        self.set_status(
            "Runtime model selection is unavailable. "
            + (" ".join(messages) if messages else "No provider catalog could be loaded."),
        )

    def set_status(self, message: str) -> None:
        status = self.query_one("#runtime-models-status", Static)
        status.update(message)
