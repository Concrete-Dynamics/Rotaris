from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path


class StartupRecoveryUI(Protocol):
    def info(self, message: str) -> None: ...
    def warning(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...


@traces(SWR.SWR_819)
def maybe_refresh_models_for_config_error(
    messages: list[str],
    *,
    workspace_root: Path,
    ui: StartupRecoveryUI,
) -> bool:
    """Attempt a non-interactive model refresh for snapshot-backed model errors."""
    if not _should_attempt_model_refresh(messages):
        return False

    from rotaris_core.cli.model_refresh import run_refresh_models

    ui.warning(
        "Detected incomplete provider model overrides. Refreshing authenticated provider models...",
    )
    result = run_refresh_models(
        None,
        workspace_root=workspace_root,
        ui=ui,
    )
    ui.info(result.message)
    return True


def _should_attempt_model_refresh(messages: list[str]) -> bool:
    return any(
        message.startswith("Model '")
        and " is incomplete: missing required " in message
        and ("'model_id'" in message or "'provider'" in message)
        for message in messages
    )
