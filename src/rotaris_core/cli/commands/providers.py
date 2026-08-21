from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Annotated, cast

import typer

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.cli.auth_flow import LoginUI


@traces(SWR.SWR_760)
def register(app: typer.Typer) -> None:
    providers_app = typer.Typer(help="Manage AI provider settings.")

    @providers_app.command("list")
    def list_providers() -> None:
        from rotaris_core.auth.provider_settings import list_provider_settings

        for provider in list_provider_settings():
            auth = "authenticated" if provider.authenticated else "not authenticated"
            key = f", key={provider.masked_key}" if provider.masked_key else ""
            base = f", base_url={provider.base_url}" if provider.base_url else ""
            typer.echo(
                f"{provider.provider_id}: {provider.display_name} "
                f"({provider.auth_flow.value}, {auth}{key}{base})",
            )

    @providers_app.command("set-key")
    def set_key(
        provider: Annotated[str, typer.Argument(help="Provider ID to update")],
        api_key: Annotated[
            str | None,
            typer.Option("--api-key", help="Replacement API key. Prompts when omitted."),
        ] = None,
        no_validate: Annotated[
            bool,
            typer.Option("--no-validate", help="Store without model-discovery validation."),
        ] = False,
    ) -> None:
        from rich.prompt import Prompt

        from rotaris_core.auth.provider_settings import update_api_key

        key = api_key if api_key is not None else Prompt.ask("API key", password=True, default="")
        result = update_api_key(provider, key, validate=not no_validate)
        typer.echo(result.message)
        if not result.success:
            raise typer.Exit(code=1)

    @providers_app.command("set-base-url")
    def set_base_url(
        provider: Annotated[str, typer.Argument(help="Provider ID to update")],
        base_url: Annotated[str, typer.Argument(help="Replacement API base URL")],
        no_validate: Annotated[
            bool,
            typer.Option("--no-validate", help="Store without model-discovery validation."),
        ] = False,
    ) -> None:
        from rotaris_core.auth.provider_settings import update_base_url

        result = update_base_url(provider, base_url, validate=not no_validate)
        typer.echo(result.message)
        if not result.success:
            raise typer.Exit(code=1)

    @providers_app.command("validate")
    def validate(
        provider: Annotated[str | None, typer.Argument(help="Provider ID to validate")] = None,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        from rotaris_core.cli.commands.login import _RichUI
        from rotaris_core.cli.model_refresh import run_refresh_models

        result = run_refresh_models(
            provider,
            workspace_root=(workspace or Path.cwd()).resolve(),
            ui=_RichUI(),
        )
        typer.echo(result.message)
        if not result.success:
            raise typer.Exit(code=1)

    @providers_app.command("reauth")
    def reauth(
        provider: Annotated[str, typer.Argument(help="Provider ID to reauthenticate")],
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        from rotaris_core.cli import auth_flow
        from rotaris_core.cli.commands.login import _RichUI

        ui = _RichUI()
        result = auth_flow.run_login(
            provider,
            workspace_root=(workspace or Path.cwd()).resolve(),
            reauth=True,
            ui=cast("LoginUI", ui),
        )
        ui.info(result.message)
        if not result.success:
            raise typer.Exit(code=1)

    @providers_app.command("delete")
    def delete_provider(
        provider: Annotated[
            str,
            typer.Argument(help="User-defined OpenAI-compatible provider ID to delete"),
        ],
        yes: Annotated[
            bool,
            typer.Option("--yes", "-y", help="Skip the irreversible deletion confirmation."),
        ] = False,
    ) -> None:
        """Permanently delete a user-defined endpoint and its discovered models."""
        from rotaris_core.auth.provider_settings import delete_openai_compatible_provider

        if not yes and not typer.confirm(
            f"Delete {provider} user-wide? Workspace model references will not be changed.",
            default=False,
        ):
            typer.echo("Deletion cancelled.")
            return
        result = delete_openai_compatible_provider(provider)
        typer.echo(result.message, err=not result.success)
        if not result.success:
            raise typer.Exit(code=2)

    app.add_typer(providers_app, name="providers")
