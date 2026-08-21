"""MCP Secrets screen — manage MCP server environment-variable secrets.

REQ-20260526-004 — TUI screen for browsing MCP servers and adding/editing/deleting
env vars with masked display and immediate persistence to ``secrets.yaml``.

Supports Workspace / Global scope selection for save/delete operations, and
displays the expected environment-variable keys each MCP server requires
(read from the ``env:`` block in ``agents.yaml``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.screen import ModalScreen
from textual.widgets import DataTable, Input, Select, Static

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

    from textual.app import ComposeResult

SCOPE_WORKSPACE = "Workspace"
SCOPE_GLOBAL = "Global"


def _mask_value(value: str) -> str:
    """Return a masked representation of *value* (first 2 + last 2 chars visible)."""
    if len(value) <= 4:
        return "\u00b7" * len(value)
    return value[:2] + "\u00b7" * (len(value) - 4) + value[-2:]


@dataclass(frozen=True)
class MCPSecretsResult:
    saved: bool = False
    message: str = ""


def _expected_keys_for_server(
    server_envs_map: dict[str, list[str]],
    server_name: str,
) -> list[str]:
    """Return sorted expected env-var keys for *server_name*."""
    keys: list[str] = list(server_envs_map.get(server_name, []))
    keys.sort()
    return keys


@dataclass
class _SecretEntry:
    key: str
    value: str
    scope: str  # SCOPE_WORKSPACE or SCOPE_GLOBAL


def _load_merged_with_scope(
    global_config_dir: Path,
    workspace_config_dir: Path,
    server_name: str,
) -> list[_SecretEntry]:
    """Load secrets for *server_name* from both scopes, tagged with origin."""
    from rotaris_core.config.secrets import _load_secrets_file

    global_secrets = _load_secrets_file(global_config_dir)
    workspace_secrets = _load_secrets_file(workspace_config_dir)

    seen: set[str] = set()
    entries: list[_SecretEntry] = []

    # Workspace first (higher priority, shown first)
    for key in sorted(workspace_secrets.get(server_name, {})):
        entries.append(
            _SecretEntry(
                key=key,
                value=workspace_secrets[server_name][key],
                scope=SCOPE_WORKSPACE,
            ),
        )
        seen.add(key)

    # Then global (only if not overridden by workspace)
    for key in sorted(global_secrets.get(server_name, {})):
        if key not in seen:
            entries.append(
                _SecretEntry(
                    key=key,
                    value=global_secrets[server_name][key],
                    scope=SCOPE_GLOBAL,
                ),
            )

    return entries


@traces(SWR.SWR_1725, SWR.SWR_1727)
class MCPSecretsScreen(ModalScreen[MCPSecretsResult | None]):
    BINDINGS = [
        Binding("ctrl+s", "save_settings", "Save"),
        Binding("a", "add_secret", "Add"),
        Binding("e", "edit_secret", "Edit"),
        Binding("d", "delete_secret", "Delete"),
        Binding("escape", "dismiss_screen", "Close"),
    ]

    def __init__(  # noqa: PLR0913
        self,
        server_names: list[str],
        workspace_root: Path,
        workspace_config_dir: Path,
        global_config_dir: Path,
        server_envs: dict[str, list[str]] | None = None,
    ) -> None:
        super().__init__()
        self._server_names = sorted(server_names)
        self._workspace_root = workspace_root
        self._workspace_config_dir = workspace_config_dir
        self._global_config_dir = global_config_dir
        self._server_envs: dict[str, list[str]] = server_envs or {}
        self._current_scope: str = SCOPE_WORKSPACE

    @property
    def _active_config_dir(self) -> Path:
        """Return the config dir for the currently selected scope."""
        if self._current_scope == SCOPE_GLOBAL:
            return self._global_config_dir
        return self._workspace_config_dir

    def compose(self) -> ComposeResult:
        with Vertical(id="mcp-secrets-container"):
            yield Static("MCP Server Secrets", id="mcp-secrets-title")
            if not self._server_names:
                yield Static("No MCP servers configured.", id="mcp-secrets-status")
                return
            yield Select(
                [(name, name) for name in self._server_names],
                id="mcp-secrets-server-select",
                prompt="Select MCP server",
            )
            with Horizontal(id="mcp-secrets-scope-row"):
                yield Static("Save to:", id="mcp-secrets-scope-label")
                yield Select(
                    [(SCOPE_WORKSPACE, SCOPE_WORKSPACE), (SCOPE_GLOBAL, SCOPE_GLOBAL)],
                    id="mcp-secrets-scope-select",
                    value=SCOPE_WORKSPACE,
                )
            yield Static("", id="mcp-secrets-status")
            yield DataTable(id="mcp-secrets-table", cursor_type="row")
            yield Static("", id="mcp-secrets-expected")
            with Horizontal(id="mcp-secrets-form-row"):
                yield Input(placeholder="KEY", id="mcp-secrets-key-input")
                yield Input(
                    placeholder="VALUE",
                    password=True,
                    id="mcp-secrets-value-input",
                )
            yield Static("", id="mcp-secrets-hint")

    def on_mount(self) -> None:
        if self._server_names:
            self.query_one("#mcp-secrets-hint", Static).update(
                "Ctrl+S save  |  a add  |  e edit  |  d delete  |  esc close",
            )
            table = self.query_one("#mcp-secrets-table", DataTable)
            table.add_column("Key", key="key")
            table.add_column("Value", key="value")
            table.add_column("Scope", key="scope")
            self.query_one("#mcp-secrets-server-select", Select).focus()

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.select.id == "mcp-secrets-server-select":
            self._load_server(str(event.value))
        elif event.select.id == "mcp-secrets-scope-select":
            self._current_scope = (
                str(event.value) if event.value != Select.BLANK else SCOPE_WORKSPACE
            )
            server = self._current_server()
            if server:
                self._load_server(server)

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        self._populate_form_from_selection()

    def _current_server(self) -> str | None:
        try:
            select = self.query_one("#mcp-secrets-server-select", Select)
            value = select.value
            return str(value) if value and value != Select.BLANK else None
        except NoMatches:
            return None

    def _load_server(self, server_name: str) -> None:
        # Load merged secrets with scope tracking
        entries = _load_merged_with_scope(
            self._global_config_dir,
            self._workspace_config_dir,
            server_name,
        )

        table = self.query_one("#mcp-secrets-table", DataTable)
        table.clear()
        for entry in entries:
            table.add_row(
                entry.key,
                _mask_value(entry.value),
                entry.scope,
                key=entry.key,
            )

        status = self.query_one("#mcp-secrets-status", Static)
        status.update(
            f"[bold]{server_name}[/bold]: {len(entries)} env var(s) stored "
            f"(saving to [italic]{self._current_scope}[/italic])",
        )

        # Update expected-keys hint
        expected = _expected_keys_for_server(self._server_envs, server_name)
        hint = self.query_one("#mcp-secrets-expected", Static)
        if expected:
            keys_str = ", ".join(expected)
            hint.update(f"Expected keys: [bold]{keys_str}[/bold]")
        else:
            hint.update("")

    def action_save_settings(self) -> None:
        key_input = self.query_one("#mcp-secrets-key-input", Input)
        value_input = self.query_one("#mcp-secrets-value-input", Input)
        key = key_input.value.strip()
        value = value_input.value.strip()
        server = self._current_server()

        if not server:
            self.notify("No MCP server selected.", severity="warning")
            return
        if not key:
            self.notify("Key is required.", severity="warning")
            return
        if not value:
            self.notify("Value is required.", severity="warning")
            return

        self._persist_secret(server, key, value)

    def action_add_secret(self) -> None:
        key_input = self.query_one("#mcp-secrets-key-input", Input)
        key_input.value = ""
        self.query_one("#mcp-secrets-value-input", Input).value = ""
        key_input.focus()

    def action_edit_secret(self) -> None:
        table = self.query_one("#mcp-secrets-table", DataTable)
        if table.cursor_row is None:
            return
        self._populate_form_from_selection()
        self.query_one("#mcp-secrets-value-input", Input).focus()

    def action_delete_secret(self) -> None:
        server = self._current_server()
        if not server:
            self.notify("No MCP server selected.", severity="warning")
            return

        table = self.query_one("#mcp-secrets-table", DataTable)
        if table.cursor_row is None:
            return

        row_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key
        key = str(row_key.value)

        from rotaris_core.config.secrets import unset_secret

        unset_secret(self._active_config_dir, server, key)
        self._load_server(server)

        key_input = self.query_one("#mcp-secrets-key-input", Input)
        key_input.value = ""
        self.query_one("#mcp-secrets-value-input", Input).value = ""
        self.notify(f"Removed {server}.{key} from {self._current_scope}")

    def action_dismiss_screen(self) -> None:
        self.dismiss(MCPSecretsResult(saved=False))

    def _populate_form_from_selection(self) -> None:
        table = self.query_one("#mcp-secrets-table", DataTable)
        if table.cursor_row is None:
            return
        row_key = table.coordinate_to_cell_key(table.cursor_coordinate).row_key
        key = str(row_key.value)

        server = self._current_server()
        if not server:
            return

        # Load from merged to get the actual value (from whichever scope has it)
        entries = _load_merged_with_scope(
            self._global_config_dir,
            self._workspace_config_dir,
            server,
        )
        value = ""
        for entry in entries:
            if entry.key == key:
                value = entry.value
                break

        self.query_one("#mcp-secrets-key-input", Input).value = key
        self.query_one("#mcp-secrets-value-input", Input).value = value

    def _persist_secret(self, server: str, key: str, value: str) -> None:
        from rotaris_core.config.secrets import set_secret

        set_secret(self._active_config_dir, server, key, value)
        self._load_server(server)

        key_input = self.query_one("#mcp-secrets-key-input", Input)
        key_input.value = ""
        self.query_one("#mcp-secrets-value-input", Input).value = ""
        self.notify(f"Set {server}.{key} = {_mask_value(value)} in {self._current_scope}")
