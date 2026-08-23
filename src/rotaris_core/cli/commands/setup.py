"""``rotaris-cli setup`` machine-tool repair command."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.setup import SetupEvent, SetupEventKind, SetupOutcome, run_setup


@traces(SWR.SWR_3715)
def register(app: typer.Typer) -> None:
    @app.command("setup")
    @traces(SWR.SWR_3715)
    def setup_command(
        workspace: Annotated[
            Path,
            typer.Option("--workspace", "-w", help="Workspace whose merged MCP config is warmed"),
        ] = Path("."),
    ) -> None:
        """Probe, provision, warm, and repair Rotaris machine tools."""
        from rotaris_core.config import load_config

        config = load_config(workspace.resolve())

        def report(event: SetupEvent) -> None:
            if event.kind in {
                SetupEventKind.PROGRESS,
                SetupEventKind.COMPLETE,
                SetupEventKind.FAILURE,
                SetupEventKind.CANCELLED,
            }:
                typer.echo(event.message, err=True)
            if event.detail:
                typer.echo(event.detail, err=True)

        outcome = run_setup(
            mcp_servers=config.mcp_servers,
            emit=report,
            manual=True,
            continue_on_failure=False,
        )
        typer.echo(outcome.value)
        if outcome in {SetupOutcome.DEGRADED, SetupOutcome.CANCELLED}:
            raise typer.Exit(code=1)
