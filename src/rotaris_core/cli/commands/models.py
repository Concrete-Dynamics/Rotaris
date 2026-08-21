from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Annotated, cast

import typer

from rotaris_core.cli.commands.login import _RichUI
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.cli.model_refresh import RefreshUI


@traces(SWR.SWR_819)
def register(app: typer.Typer) -> None:
    models_app = typer.Typer(help="Manage discovered provider models.")

    @models_app.command("refresh")
    def refresh(
        provider: Annotated[
            str | None,
            typer.Option(
                "--provider",
                help="Refresh models for a single provider (e.g. 'copilot', 'codex').",
            ),
        ] = None,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        from rotaris_core.cli import model_refresh

        ui = cast("RefreshUI", _RichUI())
        result = model_refresh.run_refresh_models(
            provider,
            workspace_root=(workspace or Path.cwd()).resolve(),
            ui=ui,
        )
        ui.info(result.message)
        if not result.success:
            raise typer.Exit(code=1)

    app.add_typer(models_app, name="models")
