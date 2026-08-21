from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.auth.storage import TokenStorage
    from rotaris_core.config.project_snapshot import ProjectSnapshot

from rotaris_core.cli.interactive_selection import is_interactive_terminal, prompt_for_selection
from rotaris_core.reqtocode import SWR, traces


class LogoutSelectionError(RuntimeError):
    pass


class LogoutSelectionUnavailableError(LogoutSelectionError):
    pass


class LogoutSelectionCancelledError(LogoutSelectionError):
    pass


@traces(SWR.SWR_717)
def build_logout_options(
    *,
    storage: TokenStorage | None = None,
    snapshot_base: Path | None = None,
) -> list[tuple[str, str]]:
    from rotaris_core.auth.storage import TokenStorage
    from rotaris_core.providers import OPENAI_COMPATIBLE_PROVIDER_ID
    from rotaris_core.providers.catalog import list_providers

    builtin_labels = {
        provider.id: provider.display_name
        for provider in list_providers()
        if provider.id != OPENAI_COMPATIBLE_PROVIDER_ID
    }
    active_storage = storage if isinstance(storage, TokenStorage) else TokenStorage()
    snapshot = _read_snapshot(snapshot_base)
    options: list[tuple[str, str]] = []

    for provider_id in active_storage.list_provider_ids():
        snapshot_provider = None if snapshot is None else snapshot.providers.get(provider_id)
        if provider_id in builtin_labels:
            label = builtin_labels[provider_id]
        elif snapshot_provider is not None:
            label = f"{snapshot_provider.display_name} [{provider_id}]"
        else:
            label = provider_id
        options.append((provider_id, label))

    return options


def resolve_logout_provider_id(
    provider_id: str | None,
    *,
    snapshot_base: Path | None = None,
) -> str:
    if provider_id is not None:
        return provider_id

    if not is_interactive_terminal():
        raise LogoutSelectionUnavailableError(
            "Provider is required when interactive selection is unavailable.",
        )

    options = build_logout_options(snapshot_base=snapshot_base)
    if not options:
        raise LogoutSelectionUnavailableError("No providers are available for logout.")

    selected = prompt_for_selection(
        "Choose provider to sign out of:",
        options,
    )
    if selected is None:
        raise LogoutSelectionCancelledError("Logout cancelled.")
    return selected


def _read_snapshot(base: Path | None) -> ProjectSnapshot | None:
    from rotaris_core.config.project_snapshot import read_snapshot

    try:
        return read_snapshot(base)
    except ValueError:
        return None
