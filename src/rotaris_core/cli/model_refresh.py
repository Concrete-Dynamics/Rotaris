from __future__ import annotations

import asyncio
from dataclasses import dataclass
from inspect import isawaitable
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.auth.manager import AuthManager
    from rotaris_core.providers.discovery import DiscoveredModel, DiscoveryResult


class RefreshUI(Protocol):
    def info(self, message: str) -> None: ...
    def warning(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...


class StoredTokensLike(Protocol):
    extra: dict[str, str]
    account_id: str | None


@dataclass(frozen=True)
class PersistedProviderModels:
    provider_id: str
    display_name: str
    models_discovered: int
    models_persisted: int
    models_preserved: int


@dataclass(frozen=True)
class ProviderRefreshResult:
    provider_id: str
    success: bool
    models_discovered: int
    message: str


@dataclass(frozen=True)
class RefreshResult:
    success: bool
    provider_results: tuple[ProviderRefreshResult, ...]
    message: str


@dataclass(frozen=True)
class ProviderRefreshTarget:
    provider_id: str
    catalog_id: str
    display_name: str
    base_url: str | None = None


@traces(SWR.SWR_819, SWR.SWR_820, SWR.SWR_821, SWR.SWR_822, SWR.SWR_823, SWR.SWR_824, SWR.SWR_825)
def run_refresh_models(
    provider_id: str | None,
    *,
    workspace_root: Path,
    ui: RefreshUI,
) -> RefreshResult:
    return asyncio.run(_run_refresh_models_async(provider_id, workspace_root=workspace_root, ui=ui))


async def maybe_await(value: object) -> Any:
    if isawaitable(value):
        return await value
    return value


async def discover_authenticated_models(
    provider_id: str,
    *,
    auth_manager: AuthManager,
    ui: RefreshUI | None = None,
) -> DiscoveryResult:
    from rotaris_core.providers.discovery import build_models_endpoint, discover_models

    provider = _resolve_refresh_target(provider_id)
    status = await maybe_await(auth_manager.check_status(provider_id))
    stored_tokens = auth_manager.get_stored_tokens(provider_id)
    unauthenticated_result = _unauthenticated_discovery_result(
        provider_id,
        provider.display_name,
        status=status,
        stored_tokens=stored_tokens,
    )
    if unauthenticated_result is not None:
        return unauthenticated_result

    token_value = await maybe_await(auth_manager.get_token(provider_id))
    if not isinstance(token_value, str) or not token_value:
        return _missing_token_result(
            provider.display_name,
            auth_manager.get_last_error(provider_id),
        )

    stored_tokens = auth_manager.get_stored_tokens(provider_id)
    token_value, discovery_api_base, credential_error = _resolve_discovery_credentials(
        provider.catalog_id,
        token_value,
        stored_tokens,
        ui=ui,
    )
    if not isinstance(token_value, str) or not token_value:
        if credential_error:
            from rotaris_core.providers.discovery import DiscoveryResult

            return DiscoveryResult([], credential_error, None)
        return _missing_token_result(
            provider.display_name, auth_manager.get_last_error(provider_id)
        )

    discovery = discover_models(
        provider.catalog_id,
        token=token_value,
        api_base=discovery_api_base,
        discovery_endpoint=(
            build_models_endpoint(provider.base_url) if provider.base_url is not None else None
        ),
        qualified_provider_id=provider.provider_id,
        display_name=provider.display_name,
        account_id=(stored_tokens.account_id if stored_tokens is not None else None),
    )
    # A subscription OAuth token can be valid while catalog discovery is
    # temporarily refused. Keep it so the user can retry without signing in again.
    if (
        discovery.error is not None
        and discovery.http_status in {401, 403}
        and provider.catalog_id != "codex"
    ):
        auth_manager.logout(provider_id)
        if ui is not None:
            ui.warning(f"Discarded stored authentication for {provider.display_name}.")
    return discovery


def _unauthenticated_discovery_result(
    provider_id: str,
    display_name: str,
    *,
    status: object,
    stored_tokens: object | None,
) -> DiscoveryResult | None:
    from rotaris_core.auth.provider import AuthStatus
    from rotaris_core.providers.discovery import DiscoveryResult

    if status != AuthStatus.UNAUTHENTICATED and stored_tokens is not None:
        return None
    return DiscoveryResult(
        [],
        f"{display_name} is not authenticated. Run 'rotaris-cli login {provider_id}' first.",
        None,
    )


def _missing_token_result(display_name: str, last_error: str | None) -> DiscoveryResult:
    from rotaris_core.providers.discovery import DiscoveryResult

    if isinstance(last_error, str) and last_error:
        message = f"No valid credentials available for {display_name}: {last_error}"
    else:
        message = f"No token available for {display_name}."
    return DiscoveryResult([], message, None)


def _resolve_discovery_credentials(
    provider_id: str,
    token_value: str,
    stored_tokens: StoredTokensLike | None,
    *,
    ui: RefreshUI | None,
) -> tuple[str | None, str | None, str | None]:
    discovery_api_base: str | None = None
    if stored_tokens is None:
        return token_value, discovery_api_base, None

    raw_api_base = stored_tokens.extra.get("api_base")
    if isinstance(raw_api_base, str) and raw_api_base:
        discovery_api_base = raw_api_base

    return token_value, discovery_api_base, None


def _resolve_refresh_target(provider_id: str) -> ProviderRefreshTarget:
    from rotaris_core.config.project_snapshot import read_snapshot
    from rotaris_core.providers.catalog import get_provider
    from rotaris_core.providers.instances import OPENAI_COMPATIBLE_PROVIDER_ID

    try:
        provider = get_provider(provider_id)
        return ProviderRefreshTarget(
            provider_id=provider.id,
            catalog_id=provider.id,
            display_name=provider.display_name,
        )
    except KeyError:
        snapshot = read_snapshot()
        if snapshot is None or provider_id not in snapshot.providers:
            raise
        snapshot_provider = snapshot.providers[provider_id]
        family = snapshot_provider.family or provider_id
        return ProviderRefreshTarget(
            provider_id=provider_id,
            catalog_id=(
                OPENAI_COMPATIBLE_PROVIDER_ID if family == OPENAI_COMPATIBLE_PROVIDER_ID else family
            ),
            display_name=snapshot_provider.display_name,
            base_url=snapshot_provider.base_url,
        )


@traces(SWR.SWR_782, SWR.SWR_2813)
def persist_discovered_models(
    provider_id: str,
    models: list[DiscoveredModel],
    *,
    suggestions: dict[str, str | None] | None = None,
    display_name: str | None = None,
    provider_family: str | None = None,
    base_url: str | None = None,
) -> PersistedProviderModels:
    from datetime import UTC, datetime

    from rotaris_core.config.project_snapshot import (
        SnapshotModel,
        SnapshotProvider,
        read_snapshot,
        update_provider,
    )
    from rotaris_core.providers.catalog import get_provider
    from rotaris_core.providers.model_availability import is_available
    from rotaris_core.providers.picker import pick_default_models

    try:
        provider = get_provider(provider_id)
        resolved_display_name = display_name or provider.display_name
        resolved_family = provider_family or provider.id
    except KeyError:
        resolved_display_name = display_name or provider_id
        resolved_family = provider_family or provider_id
    # Every discovered model is persisted, including the ones the provider will not
    # accept — the pickers show those with a reason (SWR-2812). The startup slots may
    # only ever be filled from the usable subset.
    selectable = [model for model in models if is_available(model.capabilities.get("availability"))]
    picked_models = pick_default_models(selectable)
    first_model_id = selectable[0].qualified_id if selectable else None
    large_model = (
        picked_models.large_model or picked_models.medium_model or picked_models.small_model
    )
    medium_model = picked_models.medium_model or picked_models.small_model or large_model
    small_model = picked_models.small_model or medium_model or large_model
    large_model = large_model or first_model_id
    medium_model = medium_model or first_model_id
    small_model = small_model or first_model_id
    default_summary_model = picked_models.medium_model or small_model or medium_model or large_model
    eligible_suggestions = suggestions or {}
    small_model = eligible_suggestions.get("small") or small_model
    medium_model = eligible_suggestions.get("medium") or medium_model
    large_model = eligible_suggestions.get("large") or large_model
    fallback_model = eligible_suggestions.get("fallback") or small_model
    picked_ids = {
        model_id for model_id in (small_model, medium_model, large_model) if model_id is not None
    }
    discovered_at = datetime.now(UTC).isoformat()
    ordered_models = sorted(
        models,
        key=lambda model: (model.qualified_id not in picked_ids, model.qualified_id),
    )
    discovered_model_ids = {model.qualified_id for model in ordered_models}
    snapshot_models = [
        SnapshotModel(
            id=model.qualified_id,
            display_name=model.display_name,
            capabilities=model.capabilities,
            limits=model.limits,
            pricing=model.pricing,
            discovered_at=discovered_at,
        )
        for model in ordered_models
    ]
    existing_snapshot = read_snapshot()
    existing_provider = (
        None if existing_snapshot is None else existing_snapshot.providers.get(provider_id)
    )
    preserved_models = sorted(
        (
            model
            for model in (existing_provider.models if existing_provider is not None else [])
            if model.id not in discovered_model_ids
        ),
        key=lambda model: model.id,
    )
    snapshot_models.extend(preserved_models)
    update_provider(
        SnapshotProvider(
            id=provider_id,
            display_name=resolved_display_name,
            family=resolved_family,
            base_url=base_url,
            authenticated=True,
            models=snapshot_models,
            default_summary_model=default_summary_model,
            large_model=large_model,
            medium_model=medium_model,
            small_model=small_model,
            fallback_model=fallback_model,
            discovered_at=discovered_at,
        ),
    )
    return PersistedProviderModels(
        provider_id=provider_id,
        display_name=resolved_display_name,
        models_discovered=len(models),
        models_persisted=len(snapshot_models),
        models_preserved=len(preserved_models),
    )


def warn_on_config_errors(
    workspace_root: Path,
    ui: RefreshUI,
    *,
    phase: str = "refresh",
) -> None:
    try:
        from rotaris_core.config.loader import load_config
        from rotaris_core.config.validation import validate_config

        errors = validate_config(load_config(workspace_root))
    except ValueError as exc:
        ui.warning(f"Post-{phase} config validation failed: {exc}")
        return

    for error in errors:
        ui.warning(f"Post-{phase} config warning: {error}")


async def _run_refresh_models_async(
    provider_id: str | None,
    *,
    workspace_root: Path,
    ui: RefreshUI,
) -> RefreshResult:
    from rotaris_core.auth.manager import AuthManager
    from rotaris_core.config.project_snapshot import read_snapshot
    from rotaris_core.providers.catalog import list_providers

    workspace_root = Path(workspace_root)
    available_provider_ids = [provider.id for provider in list_providers()]
    snapshot = read_snapshot()
    snapshot_provider_ids = [] if snapshot is None else list(snapshot.providers)
    all_provider_ids = list(dict.fromkeys([*available_provider_ids, *snapshot_provider_ids]))
    target_provider_ids = [provider_id] if provider_id is not None else all_provider_ids

    if provider_id is not None and provider_id not in all_provider_ids:
        message = (
            f"Unknown provider: {provider_id}. Known providers: {', '.join(all_provider_ids)}."
        )
        ui.error(message)
        return RefreshResult(False, (), message)

    auth_manager = AuthManager()

    # Pre-filter: split target providers into authenticated vs skipped.
    authenticated_ids: list[str] = []
    skipped_ids: list[str] = []
    for target_provider_id in target_provider_ids:
        if auth_manager.is_authenticated(target_provider_id):
            authenticated_ids.append(target_provider_id)
        else:
            skipped_ids.append(target_provider_id)

    provider_results: list[ProviderRefreshResult] = []

    # When a specific provider was requested but is not authenticated, report it.
    if provider_id is not None and provider_id in skipped_ids:
        try:
            target = _resolve_refresh_target(provider_id)
            display = target.display_name
        except KeyError:
            display = provider_id
        message = (
            f"Skipped {display}: not authenticated. Run 'rotaris-cli login {provider_id}' first."
        )
        ui.error(message)
        provider_results.append(ProviderRefreshResult(provider_id, False, 0, message))

    for target_provider_id in authenticated_ids:
        provider = _resolve_refresh_target(target_provider_id)
        provider_results.append(
            await _refresh_provider_models(
                target_provider_id,
                provider=provider,
                auth_manager=auth_manager,
                ui=ui,
            ),
        )

    warn_on_config_errors(workspace_root, ui, phase="refresh")
    success_count = sum(1 for result in provider_results if result.success)
    failure_count = len(provider_results) - success_count

    # Build summary
    parts: list[str] = []
    if success_count > 0:
        parts.append(f"{success_count} provider{'s' if success_count != 1 else ''} succeeded")
    if failure_count > 0:
        parts.append(f"{failure_count} failed")
    # Only mention bulk-skips (not the explicit --provider case, which is in
    # failure_count)
    bulk_skipped = len(skipped_ids) - (
        1 if provider_id is not None and provider_id in skipped_ids else 0
    )
    if bulk_skipped > 0:
        parts.append(f"{bulk_skipped} skipped (not authenticated)")

    if failure_count == 0 and bulk_skipped == 0:
        summary = f"Refresh complete: {', '.join(parts)}."
        return RefreshResult(True, tuple(provider_results), summary)

    summary = f"Refresh finished: {', '.join(parts)}."
    return RefreshResult(False, tuple(provider_results), summary)


async def _refresh_provider_models(
    target_provider_id: str,
    *,
    provider: ProviderRefreshTarget,
    auth_manager: AuthManager,
    ui: RefreshUI,
) -> ProviderRefreshResult:
    ui.info(f"Refreshing models for {provider.display_name}...")
    discovery = await discover_authenticated_models(
        target_provider_id,
        auth_manager=auth_manager,
        ui=ui,
    )
    if discovery.error is not None:
        message = f"Model discovery failed for {provider.display_name}: {discovery.error}"
        ui.error(message)
        return ProviderRefreshResult(target_provider_id, False, 0, message)

    if not discovery.models:
        message = f"No models discovered for {provider.display_name}."
        ui.error(message)
        return ProviderRefreshResult(target_provider_id, False, 0, message)

    persisted = persist_discovered_models(
        target_provider_id,
        discovery.models,
        suggestions=discovery.suggestions,
        display_name=provider.display_name,
        provider_family=provider.catalog_id,
        base_url=provider.base_url,
    )
    message = _format_refresh_success_message(provider.display_name, persisted)
    ui.info(message)
    return ProviderRefreshResult(
        target_provider_id,
        True,
        persisted.models_discovered,
        message,
    )


def _format_refresh_success_message(
    display_name: str,
    persisted: PersistedProviderModels,
) -> str:
    message = (
        f"Refreshed {display_name}; discovered {persisted.models_discovered} "
        f"model{'s' if persisted.models_discovered != 1 else ''}"
    )
    if persisted.models_preserved:
        message += (
            f", preserved {persisted.models_preserved} previous "
            f"model{'s' if persisted.models_preserved != 1 else ''}"
        )
    return f"{message}."
