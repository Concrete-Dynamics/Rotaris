from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Annotated, cast

import typer

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.cli.auth_flow import LoginUI


class _RichUI:
    def __init__(self) -> None:
        from rich.console import Console

        self._console = Console()

    def choose_provider(self, options: list[tuple[str, str]]) -> str | None:
        from rich.prompt import Prompt

        from rotaris_core.cli.interactive_selection import (
            is_interactive_terminal,
            prompt_for_selection,
        )

        if is_interactive_terminal():
            return prompt_for_selection("Choose provider to sign in with:", options)

        self._console.print("Choose provider:")
        for index, (_, display_name) in enumerate(options, start=1):
            self._console.print(f"{index}) {display_name}")
        raw = Prompt.ask("Provider number", default="")
        if raw.strip() == "":
            return None
        try:
            selected = int(raw)
        except ValueError:
            return None
        if selected < 1 or selected > len(options):
            return None
        return options[selected - 1][0]

    def prompt_text(self, prompt: str, *, default: str | None = None) -> str | None:
        from rich.prompt import Prompt

        raw = Prompt.ask(prompt, default=default or "")
        return raw.strip() or None

    def prompt_secret(self, prompt: str) -> str | None:
        from rich.prompt import Prompt

        raw = Prompt.ask(prompt, password=True, default="")
        return raw.strip() or None

    def choose_model(
        self,
        prompt: str,
        options: list[tuple[str, str]],
        *,
        default: str | None = None,
        allow_skip: bool = False,
    ) -> str | None:
        from rich.prompt import Prompt

        self._console.print(prompt)
        if allow_skip:
            self._console.print("0) inherit/default")
        default_choice = "0" if allow_skip and default is None else ""
        option_map: dict[str, str] = {}
        for index, (model_id, label) in enumerate(options, start=1):
            self._console.print(f"{index}) {label} [{model_id}]")
            option_map[str(index)] = model_id
            if model_id == default:
                default_choice = str(index)

        raw = Prompt.ask("Choice", default=default_choice)
        if allow_skip and raw == "0":
            return None
        return option_map.get(raw, default)

    def info(self, message: str) -> None:
        self._console.print(message)

    def show_auth_prompt(
        self,
        *,
        verification_url: str,
        user_code: str,
        message: str,
    ) -> None:
        if user_code:
            # Device Code flow — user must open URL and enter a code manually
            self._console.print(f"[bold]{message}[/bold]")
            self._console.print(
                f"[bold]URL:[/bold] [link={verification_url}]{verification_url}[/link]",
            )
            self._console.print(f"[bold]Code:[/bold] {user_code}")
        else:
            # PKCE browser flow — browser will open automatically
            self._console.print(f"[bold]{message}[/bold]")
            self._console.print(
                f"If your browser did not open, visit: "
                f"[link={verification_url}]{verification_url}[/link]",
            )

    def warning(self, message: str) -> None:
        self._console.print(f"[yellow]{message}[/yellow]")

    def error(self, message: str) -> None:
        self._console.print(f"[red]{message}[/red]")

    def confirm(self, prompt: str, *, default: bool = False) -> bool:
        from rich.prompt import Confirm

        return Confirm.ask(prompt, default=default)

    def choose_recovery(self) -> str:
        from rich.prompt import Prompt

        self._console.print("No models were discovered. Choose recovery:")
        self._console.print("1) retry")
        self._console.print("2) try other provider")
        self._console.print("3) advanced config")
        self._console.print("4) abort")
        raw = Prompt.ask("Recovery option", choices=["1", "2", "3", "4"], default="4")
        return {"1": "retry", "2": "try-other-provider", "3": "advanced-config", "4": "abort"}[raw]


@traces(SWR.SWR_729)
def register(app: typer.Typer) -> None:
    @app.command("login")
    def login(
        provider: Annotated[str | None, typer.Argument(help="Provider to authenticate")] = None,
        reauth: Annotated[
            bool,
            typer.Option("--reauth", help="Force re-authentication"),
        ] = False,
        workspace: Annotated[Path | None, typer.Option("--workspace", "-w")] = None,
    ) -> None:
        from rotaris_core.cli import auth_flow

        ui = cast("LoginUI", _RichUI())
        try:
            result = auth_flow.run_login(
                provider,
                workspace_root=(workspace or Path.cwd()).resolve(),
                reauth=reauth,
                ui=ui,
            )
        except KeyboardInterrupt:
            ui.info("Cancelled.")
            raise typer.Exit(code=1) from None
        ui.info(result.message)
        if not result.success:
            raise typer.Exit(code=1)
