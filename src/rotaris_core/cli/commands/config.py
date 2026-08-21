"""CLI ``rotaris-cli config`` subcommand group.

Provides convenience commands for common configuration tasks.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from rotaris_core.reqtocode import SWR, traces

_TAVILY_SERVER_NAME = "tavily"
_TAVILY_KEY_NAME = "TAVILY_API_KEY"


def _mask_value(value: str) -> str:
    if len(value) <= 4:
        return "·" * len(value)
    return value[:2] + "·" * (len(value) - 4) + value[-2:]


@traces(SWR.SWR_1800)
def register(app: typer.Typer) -> None:
    """Attach the ``config`` subcommand group to *app*."""
    config_app = typer.Typer(help="Manage rotaris-cli configuration.")

    @config_app.command("set-tavily-key")
    def set_tavily_key(
        key: Annotated[
            str | None,
            typer.Argument(help="Tavily API key value (prompted securely if omitted)"),
        ] = None,
        workspace: Annotated[
            Path | None,
            typer.Option("--workspace", "-w", help="Workspace root (default: CWD)"),
        ] = None,
        global_scope: Annotated[
            bool,
            typer.Option("--global", "-g", help="Store in global config dir instead of workspace"),
        ] = False,
    ) -> None:
        """Store the Tavily API key for the tavily MCP server."""
        from rich.console import Console
        from rich.prompt import Prompt

        from rotaris_core.config.paths import GLOBAL_CONFIG_DIR
        from rotaris_core.config.secrets import set_secret

        console = Console()
        if key is None:
            key = Prompt.ask("Enter Tavily API key", password=True)
            if not key:
                console.print("[red]Aborted: no key provided.[/red]")
                raise typer.Exit(code=1)

        if global_scope:
            config_dir = GLOBAL_CONFIG_DIR
        else:
            config_dir = (workspace or Path.cwd()).resolve() / ".rotaris"

        set_secret(config_dir, _TAVILY_SERVER_NAME, _TAVILY_KEY_NAME, key)
        console.print(
            f"[green]✓[/green] Tavily API key saved: "
            f"[bold]{_TAVILY_KEY_NAME}[/bold] = {_mask_value(key)}",
        )

    app.add_typer(config_app, name="config")
