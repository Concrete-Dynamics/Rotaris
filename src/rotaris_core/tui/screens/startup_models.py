from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, cast

from textual.binding import Binding
from textual.containers import Vertical
from textual.screen import ModalScreen
from textual.widgets import DataTable, Static

from rotaris_core.config.startup_models import (
    PERSONA_MODEL_ALIAS_FIELDS,
    STARTUP_MODEL_FIELDS,
    read_startup_model_preferences,
    write_startup_model_preferences,
)
from rotaris_core.models.thinking_catalog import supported_reasoning_levels
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
    from collections.abc import Sequence
    from pathlib import Path

    from textual.app import ComposeResult

    from rotaris_core.config.schema import RotarisConfig, ThinkingLevel


_SYNTHETIC_STARTUP_MODEL_PREFIX = "__startup_slot__:"
_TABLE_COLUMN_INDEX = {
    "target": 0,
    "scope": 1,
    "selection": 2,
    "thinking": 3,
}
_THINKING_DEFAULT_LABEL = "provider / endpoint default"


@dataclass(frozen=True)
class StartupModelsResult:
    saved: bool
    path: Path | None = None


@dataclass
class _RowState:
    kind: Literal["startup", "persona"]
    name: str
    label: str
    model_choices: list[str | None]
    model_value: str | None
    thinking_choices: list[str | None]
    thinking_value: str | None = None
    default_model: str | None = None
    resolved_model: str | None = None


@dataclass(frozen=True)
class _PickerResult:
    value: str | None  # None = inherit default (persona rows only)


@traces(SWR.SWR_828, SWR.SWR_833, SWR.SWR_834, SWR.SWR_858, SWR.SWR_861, SWR.SWR_862)
class StartupModelsScreen(ModalScreen[StartupModelsResult | None]):
    BINDINGS = [
        Binding("left", "cycle_prev", "Prev", priority=True),
        Binding("a", "cycle_prev", "Prev", show=False, priority=True),
        Binding("right", "cycle_next", "Next", priority=True),
        Binding("d", "cycle_next", "Next", show=False, priority=True),
        Binding("space", "cycle_next", "Next", show=False, priority=True),
        Binding("enter", "open_dropdown", "Pick", priority=True),
        Binding("tab", "next_field", "Next Field", show=False, priority=True),
        Binding("shift+tab", "prev_field", "Prev Field", show=False, priority=True),
        Binding("s", "save", "Save"),
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(self, config: RotarisConfig, onboarding_review: bool = False) -> None:
        super().__init__()
        self._config = config
        self._onboarding_review = onboarding_review
        self._rows: dict[str, _RowState] = {}

    def compose(self) -> ComposeResult:
        with Vertical(id="startup-models-container"):
            if self._onboarding_review:
                yield Static(
                    "Review Your Model Assignments",
                    id="startup-models-title",
                )
                yield Static(
                    (
                        "Rotaris discovered these models during setup. "
                        "Review and adjust as needed, then Save & Continue to proceed."
                    ),
                    id="startup-models-help",
                )
            else:
                yield Static(
                    "Startup Models — Tab to switch field · ← → / A D to cycle · Enter to pick · S to save · Esc to close",
                    id="startup-models-title",
                )
                yield Static(
                    (
                        "Top rows are persistent startup slots. Edit Selection and "
                        "Thinking in every row: Tab to reach the Thinking column, then "
                        "← → to cycle."
                    ),
                    id="startup-models-help",
                )
            yield DataTable(id="startup-models-table", cursor_type="cell")

    def on_mount(self) -> None:
        table = self.query_one("#startup-models-table", DataTable)
        table.add_column("Target", key="target")
        table.add_column("Scope", key="scope")
        table.add_column("Selection", key="selection")
        table.add_column("Thinking", key="thinking")

        prefs = read_startup_model_preferences(self._config.workspace_root, self._config)
        available_models = self._available_model_names()

        for field_name in STARTUP_MODEL_FIELDS:
            value = prefs.slots[field_name]
            slot_choices: list[str | None] = list(available_models)
            if value is not None and value not in slot_choices:
                slot_choices.insert(0, value)
            row_state = _RowState(
                kind="startup",
                name=field_name,
                label=field_name,
                model_choices=slot_choices,
                model_value=value,
                thinking_choices=self._thinking_choices_for_model(value),
                thinking_value=prefs.slot_thinking[field_name],
            )
            row_key = self._row_key(row_state)
            self._rows[row_key] = row_state
            table.add_row(
                row_state.label,
                "startup",
                self._format_model_value(row_state),
                self._format_thinking_value(row_state),
                key=row_key,
            )

        for persona_name, pref in sorted(prefs.personas.items()):
            persona_choices: list[str | None] = []
            if pref.default_model is not None:
                persona_choices.append(None)
            persona_choices.extend(PERSONA_MODEL_ALIAS_FIELDS)
            persona_choices.extend(self._config.models.keys())
            if pref.configured_model is not None and pref.configured_model not in persona_choices:
                persona_choices.insert(0, pref.configured_model)

            value = pref.configured_model
            row_state = _RowState(
                kind="persona",
                name=persona_name,
                label=persona_name,
                model_choices=_dedupe(persona_choices),
                model_value=value,
                thinking_choices=self._thinking_choices_for_model(pref.resolved_model),
                thinking_value=pref.thinking,
                default_model=pref.default_model,
                resolved_model=pref.resolved_model,
            )
            row_key = self._row_key(row_state)
            self._rows[row_key] = row_state
            table.add_row(
                row_state.label,
                "persona",
                self._format_model_value(row_state),
                self._format_thinking_value(row_state),
                key=row_key,
            )

        if table.row_count > 0:
            table.move_cursor(row=0, column=_TABLE_COLUMN_INDEX["selection"])
            table.focus()

    def _current_row_state(self) -> tuple[str, str, _RowState] | None:
        table = self.query_one("#startup-models-table", DataTable)
        if table.cursor_row is None:
            return None
        cell_key = table.coordinate_to_cell_key(table.cursor_coordinate)
        row_key = str(cell_key.row_key.value)
        column_key = str(cell_key.column_key.value)
        return row_key, column_key, self._rows[row_key]

    def action_cycle_next(self) -> None:
        self._cycle_current_value(step=1)

    def action_cycle_prev(self) -> None:
        self._cycle_current_value(step=-1)

    def action_open_dropdown(self) -> None:
        result = self._current_edit_state()
        if result is None:
            return
        row_key, column_key, row_state = result
        if column_key == "thinking":
            self.action_cycle_next()
            return
        if column_key != "selection":
            return

        def _on_picked(pick: _PickerResult | None) -> None:
            if pick is None:
                return
            row_state.model_value = pick.value
            self.query_one("#startup-models-table", DataTable).update_cell(
                row_key,
                "selection",
                self._format_model_value(row_state),
            )
            self._sync_related_rows(row_state)

        self.app.push_screen(_ModelPickerScreen(self._config, row_state), _on_picked)

    def action_save(self) -> None:
        slot_updates = {
            row.name: row.model_value for row in self._rows.values() if row.kind == "startup"
        }
        slot_thinking_updates: dict[str, ThinkingLevel | None] = {}
        for row in self._rows.values():
            if row.kind != "startup":
                continue
            slot_thinking_updates[row.name] = cast("ThinkingLevel | None", row.thinking_value)
        persona_updates = {
            row.name: row.model_value for row in self._rows.values() if row.kind == "persona"
        }
        persona_thinking_updates: dict[str, ThinkingLevel | None] = {}
        for row in self._rows.values():
            if row.kind != "persona":
                continue
            persona_thinking_updates[row.name] = cast("ThinkingLevel | None", row.thinking_value)
        try:
            path = write_startup_model_preferences(
                self._config.workspace_root,
                slots=slot_updates,
                slot_thinking=slot_thinking_updates,
                persona_models=persona_updates,
                persona_thinking=persona_thinking_updates,
            )
        except Exception as exc:  # noqa: BLE001
            self.notify(f"Unable to save startup models: {exc}", severity="error")
            return

        self.dismiss(StartupModelsResult(saved=True, path=path))

    def action_dismiss_screen(self) -> None:
        self.dismiss(None)

    def action_next_field(self) -> None:
        self._move_to_adjacent_editable_column(step=1)

    def action_prev_field(self) -> None:
        self._move_to_adjacent_editable_column(step=-1)

    def _row_key(self, row: _RowState) -> str:
        return f"{row.kind}:{row.name}"

    def _format_model_value(self, row: _RowState) -> str:
        if row.kind == "startup":
            return row.model_value or "unset"

        if row.model_value is None:
            if row.default_model is None:
                return row.resolved_model or "default"
            if row.resolved_model is None:
                return f"default ({row.default_model})"
            return f"default ({row.default_model} -> {row.resolved_model})"

        if row.model_value in PERSONA_MODEL_ALIAS_FIELDS:
            resolved = getattr(self._config, row.model_value, None)
            if resolved is None:
                return f"{row.model_value} -> unconfigured"
            return f"{row.model_value} -> {resolved}"

        return row.model_value

    def _format_thinking_value(self, row: _RowState) -> str:
        if row.kind == "persona":
            return row.thinking_value or _THINKING_DEFAULT_LABEL
        if row.kind != "startup":
            return ""
        return row.thinking_value or _THINKING_DEFAULT_LABEL

    def _available_model_names(self) -> list[str]:
        return [
            model_name
            for model_name in self._config.models
            if not model_name.startswith(_SYNTHETIC_STARTUP_MODEL_PREFIX)
        ]

    def _thinking_choices_for_model(self, model_name: str | None) -> list[str | None]:
        if model_name is None:
            return [None]

        model_cfg = self._config.models.get(model_name)
        if model_cfg is None:
            return [None]

        model_id = str(model_cfg.model_id)
        provider = str(model_cfg.provider)
        qualified_model_name = (
            model_id if model_id.startswith(f"{provider}/") else f"{provider}/{model_id}"
        )
        return [None, *supported_reasoning_levels(qualified_model_name, provider)]

    def _editable_column_keys(self, row_state: _RowState) -> tuple[str, ...]:
        if row_state.kind == "startup":
            return ("selection", "thinking")
        if row_state.kind == "persona" and len(row_state.thinking_choices) > 1:
            return ("selection", "thinking")
        return ("selection",)

    def _current_edit_state(self) -> tuple[str, str, _RowState] | None:
        result = self._current_row_state()
        if result is None:
            return None

        row_key, column_key, row_state = result
        editable_columns = self._editable_column_keys(row_state)
        if column_key in editable_columns:
            return row_key, column_key, row_state

        self._move_cursor_to_column(editable_columns[0])
        return row_key, editable_columns[0], row_state

    def _move_to_adjacent_editable_column(self, step: int) -> None:
        result = self._current_edit_state()
        if result is None:
            return

        _row_key, column_key, row_state = result
        editable_columns = self._editable_column_keys(row_state)
        current_index = editable_columns.index(column_key)
        next_column = editable_columns[(current_index + step) % len(editable_columns)]
        self._move_cursor_to_column(next_column)

    def _move_cursor_to_column(self, column_key: str) -> None:
        table = self.query_one("#startup-models-table", DataTable)
        table.move_cursor(column=_TABLE_COLUMN_INDEX[column_key])

    def _cycle_current_value(self, *, step: int) -> None:
        result = self._current_edit_state()
        if result is None:
            return

        row_key, column_key, row_state = result
        if column_key == "selection":
            choices = row_state.model_choices
            current_value = row_state.model_value
        else:
            choices = row_state.thinking_choices
            current_value = row_state.thinking_value
        if not choices:
            return

        try:
            current_index = choices.index(current_value)
        except ValueError:
            current_index = -1 if step > 0 else 0
        next_value = choices[(current_index + step) % len(choices)]

        table = self.query_one("#startup-models-table", DataTable)
        if column_key == "selection":
            row_state.model_value = next_value
            table.update_cell(row_key, "selection", self._format_model_value(row_state))
            self._sync_related_rows(row_state)
            return

        row_state.thinking_value = next_value
        table.update_cell(row_key, "thinking", self._format_thinking_value(row_state))

    def _sync_related_rows(self, row_state: _RowState) -> None:
        if row_state.kind == "persona":
            model_name = self._resolve_persona_model_for_thinking(row_state)
            row_state.thinking_choices = self._thinking_choices_for_model(model_name)
            if row_state.thinking_value not in row_state.thinking_choices:
                row_state.thinking_value = None
            table = self.query_one("#startup-models-table", DataTable)
            table.update_cell(
                self._row_key(row_state), "thinking", self._format_thinking_value(row_state)
            )
            return
        if row_state.kind != "startup":
            return

        row_state.thinking_choices = self._thinking_choices_for_model(row_state.model_value)
        if row_state.thinking_value not in row_state.thinking_choices:
            row_state.thinking_value = None
        table = self.query_one("#startup-models-table", DataTable)
        table.update_cell(
            self._row_key(row_state), "thinking", self._format_thinking_value(row_state)
        )

    def _resolve_persona_model_for_thinking(self, row_state: _RowState) -> str | None:
        if row_state.model_value is None:
            return row_state.resolved_model
        if row_state.model_value in PERSONA_MODEL_ALIAS_FIELDS:
            resolved = getattr(self._config, row_state.model_value, None)
            return resolved or row_state.resolved_model
        return row_state.model_value


def _dedupe(values: Sequence[str | None]) -> list[str | None]:
    deduped: list[str | None] = []
    seen: set[str | None] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


class _ModelPickerScreen(ModalScreen[_PickerResult | None]):
    """Rich model picker: provider/model/source table, auth status, live catalog.

    Dismisses with a _PickerResult (value=str|None) or None if the user cancels.
    """

    BINDINGS = [
        Binding("enter", "confirm_selection", "Select"),
        Binding("r", "refresh_catalogs", "Refresh"),
        Binding("escape", "dismiss_none", "Cancel"),
    ]

    def __init__(self, config: RotarisConfig, row_state: _RowState) -> None:
        super().__init__()
        self._config = config
        self._row_state = row_state
        self._row_values: dict[str, str | None] = {}
        self._model_rows: dict[str, ModelCatalogRow] = {}
        self._selection_applied = False

    def compose(self) -> ComposeResult:
        with Vertical(id="model-picker-container"):
            yield Static("", id="model-picker-auth-status")
            yield Static(
                "Model Picker  ·  Enter/click to confirm  ·  R to refresh  ·  Esc to cancel",
                id="model-picker-title",
            )
            yield Static("Loading runtime catalogs...", id="model-picker-status")
            yield ModelCatalogTable(id="model-picker-table", cursor_type="row")

    async def on_mount(self) -> None:
        table = self.query_one("#model-picker-table", ModelCatalogTable)
        table.ensure_model_catalog_columns()

        self._update_auth_status()

        row_to_select: int | None = None
        row_idx = 0

        if self._row_state.kind == "persona":
            row_idx, row_to_select = self._add_special_rows(table, row_idx, row_to_select)

        row_idx, row_to_select = self._add_configured_model_rows(table, row_idx, row_to_select)

        if row_to_select is not None:
            table.move_cursor(row=row_to_select)
            self._selection_applied = True
        table.focus()
        await self._load_runtime_catalogs()

    def _update_auth_status(self) -> None:
        from rotaris_core.auth.manager import AuthManager

        auth = AuthManager()
        warnings: list[str] = []
        for catalog in build_provider_catalogs(self._config):
            if not auth.is_authenticated(catalog.provider_id):
                if catalog.provider_id == "copilot":
                    hint = "`gh auth login --web`"
                else:
                    hint = f"`rotaris-cli login {catalog.provider_id}`"
                warnings.append(f"{catalog.display_name} not authenticated — {hint}")
        status_widget = self.query_one("#model-picker-auth-status", Static)
        if warnings:
            status_widget.update("\u26a0  " + "   |   ".join(warnings))
        else:
            status_widget.update("\u2713  All providers authenticated")

    def _add_special_rows(
        self,
        table: DataTable[str],
        row_idx: int,
        row_to_select: int | None,
    ) -> tuple[int, int | None]:
        rs = self._row_state
        row_key = "special:inherit"
        if rs.default_model is None:
            model_label = "(inherit default)"
        elif rs.resolved_model is None:
            model_label = f"(inherit default: {rs.default_model})"
        else:
            model_label = f"(inherit default: {rs.default_model} \u2192 {rs.resolved_model})"
        self._row_values[row_key] = None
        table.add_row("\u2014", model_label, "inherit", key=row_key)
        if rs.model_value is None and row_to_select is None:
            row_to_select = row_idx
        row_idx += 1

        for alias in PERSONA_MODEL_ALIAS_FIELDS:
            row_key = f"special:alias:{alias}"
            resolved = getattr(self._config, alias, None)
            model_label = (
                f"{alias} \u2192 {resolved}" if resolved else f"{alias} \u2192 unconfigured"
            )
            self._row_values[row_key] = alias
            table.add_row("\u2014", model_label, "alias", key=row_key)
            if rs.model_value == alias and row_to_select is None:
                row_to_select = row_idx
            row_idx += 1

        return row_idx, row_to_select

    def _add_configured_model_rows(
        self,
        table: DataTable[str],
        row_idx: int,
        row_to_select: int | None,
    ) -> tuple[int, int | None]:
        for row in build_configured_catalog_rows(self._config).values():
            self._model_rows[row.identity] = row
            row_key = model_catalog_row_key(row.identity)
            self._row_values[row_key] = row.selection_value
            table.add_row(
                row.provider_display_name,
                row.model_display_name,
                row.source,
                key=row_key,
            )
            if self._row_state.model_value == row.selection_value and row_to_select is None:
                row_to_select = row_idx
            row_idx += 1
        return row_idx, row_to_select

    def _upsert_model_row(self, table: ModelCatalogTable, row: ModelCatalogRow) -> None:
        row_key = model_catalog_row_key(row.identity)
        if row_key in self._row_values:
            table.update_cell(row_key, "provider", row.provider_display_name)
            table.update_cell(row_key, "model", row.model_display_name)
            table.update_cell(row_key, "source", row.source)
            return

        self._row_values[row_key] = row.selection_value
        table.add_row(
            row.provider_display_name,
            row.model_display_name,
            row.source,
            key=row_key,
        )
        if not self._selection_applied and self._row_state.model_value == row.selection_value:
            table.move_cursor(row=table.row_count - 1)
            self._selection_applied = True

    async def _load_runtime_catalogs(self) -> None:
        from rotaris_core.auth.manager import AuthManager
        from rotaris_core.cli.model_refresh import discover_authenticated_models

        table = self.query_one("#model-picker-table", ModelCatalogTable)
        status = self.query_one("#model-picker-status", Static)
        auth_manager = AuthManager()
        total = 0
        errors: list[str] = []

        for catalog in build_provider_catalogs(self._config):
            status.update(f"Loading {catalog.display_name}...")
            discovery = await discover_authenticated_models(
                catalog.provider_id,
                auth_manager=auth_manager,
            )
            if discovery.error is not None:
                errors.append(f"{catalog.display_name}: {discovery.error}")
                continue
            if not discovery.models:
                errors.append(f"{catalog.display_name}: no models returned")
                continue
            for model in discovery.models:
                row = merge_runtime_catalog_row(
                    self._model_rows,
                    provider_id=catalog.provider_id,
                    provider_display_name=catalog.display_name,
                    model=model,
                )
                self._upsert_model_row(table, row)
                total += 1

        if total > 0:
            msg = f"Loaded {total} runtime model{'s' if total != 1 else ''}"
            if errors:
                msg += "  |  " + "  |  ".join(errors)
            status.update(msg)
        elif errors:
            status.update("  |  ".join(errors))
        else:
            status.update("No runtime models available")

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        del event
        self.action_confirm_selection()

    def action_confirm_selection(self) -> None:
        table = self.query_one("#model-picker-table", ModelCatalogTable)
        if table.row_count == 0 or table.cursor_row is None:
            return
        row_key = str(table.coordinate_to_cell_key(table.cursor_coordinate).row_key.value)
        if row_key not in self._row_values:
            return
        self.dismiss(_PickerResult(value=self._row_values[row_key]))

    async def action_refresh_catalogs(self) -> None:
        table = self.query_one("#model-picker-table", ModelCatalogTable)
        to_remove = [k for k in self._row_values if k.startswith("model:")]
        for row_key in to_remove:
            table.remove_row(row_key)
            del self._row_values[row_key]
        self._model_rows.clear()
        self._selection_applied = False
        row_idx = len(self._row_values)
        row_idx, row_to_select = self._add_configured_model_rows(table, row_idx, None)
        if row_to_select is not None:
            table.move_cursor(row=row_to_select)
            self._selection_applied = True
        self._update_auth_status()
        await self._load_runtime_catalogs()

    def action_dismiss_none(self) -> None:
        self.dismiss(None)
