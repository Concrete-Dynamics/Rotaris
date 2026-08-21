"""CLI ``rotaris-cli secrets`` subcommand group.

Manages per-server environment-variable secrets stored in ``secrets.yaml``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from rotaris_core.reqtocode import SWR, traces


def _mask_value(value: str) -> str:
    """Return a masked representation of *value* (first 2 + last 2 chars visible)."""
    if len(value) <= 4:
        return "·" * len(value)
    return value[:2] + "·" * (len(value) - 4) + value[-2:]


def _resolve_config_dir(workspace: Path | None, *, global_scope: bool) -> Path:
    from rotaris_core.config.paths import GLOBAL_CONFIG_DIR

    if global_scope:
        return GLOBAL_CONFIG_DIR
    return (workspace or Path.cwd()).resolve() / ".rotaris"


@traces(SWR.SWR_1722)
def register(app: typer.Typer) -> None:
    """Attach the ``secrets`` subcommand group to *app*."""
    secrets_app = typer.Typer(help="Manage MCP server environment secrets.")

    @secrets_app.command("set")
    def set_cmd(
        server: Annotated[str, typer.Argument(help="MCP server name (e.g. 'tavily')")],
        key: Annotated[
            str,
            typer.Argument(help="Environment variable name (e.g. 'TAVILY_API_KEY')"),
        ],
        value: Annotated[
            str | None,
            typer.Argument(help="Secret value (prompted securely if omitted)"),
        ] = None,
        workspace: Annotated[
            Path | None,
            typer.Option("--workspace", "-w", help="Workspace root (default: CWD)"),
        ] = None,
        global_scope: Annotated[
            bool,
            typer.Option("--global", "-g", help="Write to global config dir instead of workspace"),
        ] = False,
    ) -> None:
        """Set an environment-variable secret for an MCP server."""
        from rich.console import Console
        from rich.prompt import Prompt

        from rotaris_core.config.secrets import set_secret

        console = Console()
        if value is None:
            value = Prompt.ask(f"Enter value for {key}", password=True)
            if not value:
                console.print("[red]Aborted: no value provided.[/red]")
                raise typer.Exit(code=1)

        config_dir = _resolve_config_dir(workspace, global_scope=global_scope)
        set_secret(config_dir, server, key, value)
        console.print(f"[green]✓[/green] Set [bold]{server}[/bold].{key} = {_mask_value(value)}")

    @secrets_app.command("unset")
    def unset_cmd(
        server: Annotated[str, typer.Argument(help="MCP server name")],
        key: Annotated[str, typer.Argument(help="Environment variable name to remove")],
        workspace: Annotated[
            Path | None,
            typer.Option("--workspace", "-w", help="Workspace root (default: CWD)"),
        ] = None,
        global_scope: Annotated[
            bool,
            typer.Option("--global", "-g", help="Remove from global config dir"),
        ] = False,
    ) -> None:
        """Remove a single environment-variable secret for an MCP server."""
        from rich.console import Console

        from rotaris_core.config.secrets import unset_secret

        console = Console()
        config_dir = _resolve_config_dir(workspace, global_scope=global_scope)
        removed = unset_secret(config_dir, server, key)
        if removed:
            console.print(f"[green]✓[/green] Removed [bold]{server}[/bold].{key}")
        else:
            console.print(f"[yellow]Not found:[/yellow] {server}.{key}")

    @secrets_app.command("unset-all")
    def unset_all_cmd(
        server: Annotated[str, typer.Argument(help="MCP server name")],
        workspace: Annotated[
            Path | None,
            typer.Option("--workspace", "-w", help="Workspace root (default: CWD)"),
        ] = None,
        global_scope: Annotated[
            bool,
            typer.Option("--global", "-g", help="Clear from global config dir"),
        ] = False,
    ) -> None:
        """Remove all secrets for an MCP server."""
        from rich.console import Console

        from rotaris_core.config.secrets import unset_all_secrets

        console = Console()
        config_dir = _resolve_config_dir(workspace, global_scope=global_scope)
        count = unset_all_secrets(config_dir, server)
        if count:
            console.print(f"[green]✓[/green] Cleared {count} secret(s) for [bold]{server}[/bold]")
        else:
            console.print(f"[yellow]No secrets found for:[/yellow] {server}")

    @secrets_app.command("list")
    def list_cmd(
        workspace: Annotated[
            Path | None,
            typer.Option("--workspace", "-w", help="Workspace root (default: CWD)"),
        ] = None,
    ) -> None:
        """List all stored secrets (values masked) merged from global and workspace scopes."""
        from rich.console import Console
        from rich.table import Table

        from rotaris_core.config.secrets import load_merged_secrets

        console = Console()
        root = (workspace or Path.cwd()).resolve()
        merged = load_merged_secrets(root)
        if not merged:
            console.print("[dim]No secrets stored.[/dim]")
            return

        table = Table(title="MCP Server Secrets", show_header=True, header_style="bold")
        table.add_column("Server", style="cyan bold")
        table.add_column("Key", style="bold")
        table.add_column("Value", style="dim")

        for server in sorted(merged):
            for key in sorted(merged[server]):
                table.add_row(server, key, _mask_value(merged[server][key]))

        console.print(table)

    app.add_typer(secrets_app, name="secrets")
