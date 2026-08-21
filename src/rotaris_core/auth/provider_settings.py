from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.auth.api_key import api_key_validation_error
from rotaris_core.auth.provider import AuthFlowType, AuthStatus, TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.providers.discovery import DiscoveryResult


@dataclass(frozen=True)
class ProviderSettings:
    provider_id: str
    display_name: str
    family: str
    auth_flow: AuthFlowType
    authenticated: bool
    base_url: str | None
    masked_key: str | None


@dataclass(frozen=True)
class ProviderHealthIssue:
    provider_id: str
    display_name: str
    message: str
    can_edit_api_key: bool


@dataclass(frozen=True)
class ProviderUpdateResult:
    success: bool
    message: str
    provider_id: str
    models_discovered: int = 0


@dataclass(frozen=True)
class ProviderDeleteResult:
    success: bool
    message: str
    provider_id: str
    removed_credentials: bool = False
    removed_snapshot: bool = False


@traces(SWR.SWR_769, SWR.SWR_771)
def register_openai_compatible_provider(
    label: str,
    base_url: str,
    api_key: str,
    *,
    storage: TokenStorage | None = None,
) -> ProviderUpdateResult:
    """Validate and persist a new user-global OpenAI-compatible endpoint."""
    from rotaris_core.auth.api_key import api_key_validation_error
    from rotaris_core.auth.provider import TokenSet
    from rotaris_core.cli.model_refresh import persist_discovered_models
    from rotaris_core.config.project_snapshot import read_snapshot
    from rotaris_core.providers import OPENAI_COMPATIBLE_PROVIDER_ID, build_instance_id
    from rotaris_core.providers.discovery import normalize_api_base

    label = label.strip()
    try:
        provider_id = build_instance_id(OPENAI_COMPATIBLE_PROVIDER_ID, label)
    except ValueError as exc:
        return ProviderUpdateResult(False, str(exc), "")
    if not label:
        return ProviderUpdateResult(False, "Label is required.", provider_id)
    try:
        normalized_url = normalize_api_base(base_url)
    except ValueError as exc:
        return ProviderUpdateResult(False, str(exc), provider_id)
    api_key = api_key.strip()
    if not api_key:
        return ProviderUpdateResult(False, "API key is required.", provider_id)
    validation_error = api_key_validation_error(api_key)
    if validation_error is not None:
        return ProviderUpdateResult(False, validation_error, provider_id)

    active_storage = storage or TokenStorage()
    snapshot = read_snapshot()
    if active_storage.has_tokens(provider_id) or (
        snapshot is not None and provider_id in snapshot.providers
    ):
        return ProviderUpdateResult(
            False,
            f"Provider {provider_id} already exists; re-authenticate the existing endpoint.",
            provider_id,
        )

    discovery = _discover_for_provider(
        provider_id,
        token=api_key,
        base_url=normalized_url,
        display_name=label,
        family=OPENAI_COMPATIBLE_PROVIDER_ID,
    )
    if discovery.error is not None:
        return ProviderUpdateResult(
            False,
            f"Model discovery failed for {label}: "
            f"{str(discovery.error).replace(api_key, '[redacted]')}",
            provider_id,
        )
    if not discovery.models:
        return ProviderUpdateResult(
            False, f"Model discovery failed for {label}: no models discovered.", provider_id
        )

    active_storage.save(
        provider_id,
        TokenSet(
            access_token=api_key,
            refresh_token="",
            extra={"provider_family": OPENAI_COMPATIBLE_PROVIDER_ID, "api_base": normalized_url},
        ),
    )
    try:
        persisted = persist_discovered_models(
            provider_id,
            discovery.models,
            display_name=label,
            provider_family=OPENAI_COMPATIBLE_PROVIDER_ID,
            base_url=normalized_url,
        )
    except (OSError, ValueError) as exc:
        active_storage.delete(provider_id)
        return ProviderUpdateResult(
            False,
            f"Could not save provider {provider_id}: {str(exc).replace(api_key, '[redacted]')}",
            provider_id,
        )
    return ProviderUpdateResult(
        True,
        f"Added {label}; discovered {persisted.models_discovered} model"
        f"{'s' if persisted.models_discovered != 1 else ''}.",
        provider_id,
        models_discovered=persisted.models_discovered,
    )


@traces(SWR.SWR_773)
def delete_openai_compatible_provider(
    provider_id: str,
    *,
    storage: TokenStorage | None = None,
) -> ProviderDeleteResult:
    """Delete a user-defined endpoint without rewriting workspace references."""
    from rotaris_core.config.project_snapshot import read_snapshot, remove_provider
    from rotaris_core.providers import is_openai_compatible_instance

    normalized = provider_id.strip().lower()
    if not is_openai_compatible_instance(normalized):
        return ProviderDeleteResult(
            False,
            f"Provider {normalized or provider_id!r} is built-in or not user-defined.",
            normalized,
        )
    active_storage = storage or TokenStorage()
    snapshot = read_snapshot()
    in_snapshot = snapshot is not None and normalized in snapshot.providers
    has_credentials = active_storage.has_tokens(normalized)
    if not in_snapshot and not has_credentials:
        return ProviderDeleteResult(
            False, f"Unknown user-defined provider: {normalized}.", normalized
        )
    removed_snapshot = remove_provider(normalized)
    active_storage.delete(normalized)
    return ProviderDeleteResult(
        True,
        f"Deleted user-defined provider {normalized}.",
        normalized,
        removed_credentials=has_credentials,
        removed_snapshot=removed_snapshot,
    )


@traces(SWR.SWR_764)
def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 4:
        return "****"
    return f"{value[:2]}****{value[-2:]}"


def configured_auth_provider_ids(config: RotarisConfig) -> tuple[str, ...]:
    provider_ids: set[str] = set()
    model_keys = {
        config.default_summary_model,
        config.small_model,
        config.medium_model,
        config.large_model,
        config.fallback_model,
    }
    model_keys.update(persona.model for persona in config.personas.values() if persona.model)

    for model_key in model_keys:
        if model_key is None:
            continue
        model = config.models.get(model_key)
        if model is not None and model.auth_provider:
            provider_ids.add(model.auth_provider)

    return tuple(sorted(provider_ids))


@traces(SWR.SWR_760, SWR.SWR_761)
def list_provider_settings(*, storage: TokenStorage | None = None) -> tuple[ProviderSettings, ...]:
    from rotaris_core.config.project_snapshot import read_snapshot
    from rotaris_core.providers.catalog import BUILTIN_PROVIDERS

    storage = storage or TokenStorage()
    snapshot = read_snapshot()
    provider_ids = set(storage.list_provider_ids())
    provider_ids.update(BUILTIN_PROVIDERS)
    if snapshot is not None:
        provider_ids.update(snapshot.providers)

    return tuple(
        _settings_for_provider(provider_id, storage=storage) for provider_id in sorted(provider_ids)
    )


def get_provider_settings(
    provider_id: str,
    *,
    storage: TokenStorage | None = None,
) -> ProviderSettings:
    return _settings_for_provider(provider_id, storage=storage or TokenStorage())


async def check_configured_provider_health(
    config: RotarisConfig,
    *,
    storage: TokenStorage | None = None,
) -> tuple[ProviderHealthIssue, ...]:
    from rotaris_core.auth.manager import AuthManager

    storage = storage or TokenStorage()
    auth = AuthManager(storage=storage, workspace_root=Path(config.workspace_root))
    issues: list[ProviderHealthIssue] = []
    for provider_id in configured_auth_provider_ids(config):
        settings = get_provider_settings(provider_id, storage=storage)
        status = await auth.check_status(provider_id)
        if status == AuthStatus.AUTHENTICATED:
            continue
        if settings.auth_flow == AuthFlowType.API_KEY:
            message = f"{settings.display_name} is missing an API key."
        elif status == AuthStatus.EXPIRED:
            message = f"{settings.display_name} authentication is expired."
        else:
            message = f"{settings.display_name} is not authenticated."
        issues.append(
            ProviderHealthIssue(
                provider_id=provider_id,
                display_name=settings.display_name,
                message=message,
                can_edit_api_key=settings.auth_flow == AuthFlowType.API_KEY,
            ),
        )
    return tuple(issues)


@traces(SWR.SWR_762, SWR.SWR_765)
def update_api_key(
    provider_id: str,
    api_key: str,
    *,
    validate: bool = True,
    storage: TokenStorage | None = None,
) -> ProviderUpdateResult:
    return asyncio.run(
        _update_api_key_async(provider_id, api_key, validate=validate, storage=storage),
    )


async def _update_api_key_async(
    provider_id: str,
    api_key: str,
    *,
    validate: bool,
    storage: TokenStorage | None,
) -> ProviderUpdateResult:
    from rotaris_core.cli.model_refresh import persist_discovered_models

    storage = storage or TokenStorage()
    api_key = api_key.strip()
    if not api_key:
        return ProviderUpdateResult(False, "API key is required.", provider_id)
    validation_error = api_key_validation_error(api_key)
    if validation_error is not None:
        return ProviderUpdateResult(False, validation_error, provider_id)

    settings = get_provider_settings(provider_id, storage=storage)
    if settings.auth_flow != AuthFlowType.API_KEY:
        return ProviderUpdateResult(
            False,
            f"{settings.display_name} uses {settings.auth_flow.value}; use reauth instead.",
            provider_id,
        )

    previous_tokens = storage.load(provider_id)
    extra = dict(previous_tokens.extra) if previous_tokens is not None else {}
    family = _provider_family(provider_id, extra=extra)
    if family == "openai-compatible":
        extra["provider_family"] = "openai-compatible"
        if settings.base_url is not None:
            extra["api_base"] = settings.base_url

    discovery: DiscoveryResult | None = None
    if validate:
        discovery = _discover_for_provider(
            provider_id,
            token=api_key,
            base_url=settings.base_url,
            display_name=settings.display_name,
            family=family,
        )
        if discovery.error is not None:
            return ProviderUpdateResult(
                False,
                f"Validation failed for {settings.display_name}: {discovery.error}",
                provider_id,
            )
        if not discovery.models:
            return ProviderUpdateResult(
                False,
                f"Validation failed for {settings.display_name}: no models discovered.",
                provider_id,
            )

    tokens = TokenSet(access_token=api_key, refresh_token="", extra=extra)
    storage.save(provider_id, tokens)

    models_discovered = 0
    if discovery is not None and discovery.models:
        persist_discovered_models(
            provider_id,
            discovery.models,
            display_name=settings.display_name,
            provider_family=family,
            base_url=settings.base_url,
        )
        models_discovered = len(discovery.models)

    return ProviderUpdateResult(
        True,
        f"Updated API key for {settings.display_name}.",
        provider_id,
        models_discovered=models_discovered,
    )


@traces(SWR.SWR_763)
def update_base_url(
    provider_id: str,
    base_url: str,
    *,
    validate: bool = True,
    storage: TokenStorage | None = None,
) -> ProviderUpdateResult:
    from rotaris_core.providers.discovery import normalize_api_base

    storage = storage or TokenStorage()
    settings = get_provider_settings(provider_id, storage=storage)
    try:
        normalized = normalize_api_base(base_url)
    except ValueError as exc:
        return ProviderUpdateResult(False, str(exc), provider_id)

    tokens = storage.load(provider_id)
    token_value = None if tokens is None else tokens.access_token
    family = _provider_family(provider_id, extra={} if tokens is None else tokens.extra)

    discovery: DiscoveryResult | None = None
    if validate and token_value:
        discovery = _discover_for_provider(
            provider_id,
            token=token_value,
            base_url=normalized,
            display_name=settings.display_name,
            family=family,
        )
        if discovery.error is not None:
            return ProviderUpdateResult(
                False,
                f"Validation failed for {settings.display_name}: {discovery.error}",
                provider_id,
            )
        if not discovery.models:
            return ProviderUpdateResult(
                False,
                f"Validation failed for {settings.display_name}: no models discovered.",
                provider_id,
            )

    if tokens is not None:
        extra = dict(tokens.extra)
        extra["api_base"] = normalized
        if family == "openai-compatible":
            extra["provider_family"] = "openai-compatible"
        storage.save(
            provider_id,
            TokenSet(
                access_token=tokens.access_token,
                refresh_token=tokens.refresh_token,
                expires_at=tokens.expires_at,
                account_id=tokens.account_id,
                extra=extra,
            ),
        )

    _update_snapshot_base_url(provider_id, normalized)
    if discovery is not None and discovery.models:
        from rotaris_core.cli.model_refresh import persist_discovered_models

        persist_discovered_models(
            provider_id,
            discovery.models,
            display_name=settings.display_name,
            provider_family=family,
            base_url=normalized,
        )

    return ProviderUpdateResult(True, f"Updated base URL for {settings.display_name}.", provider_id)


@traces(SWR.SWR_766, SWR.SWR_767)
def validate_provider(
    provider_id: str,
    *,
    storage: TokenStorage | None = None,
) -> ProviderUpdateResult:
    from rotaris_core.cli.model_refresh import persist_discovered_models

    storage = storage or TokenStorage()
    settings = get_provider_settings(provider_id, storage=storage)
    tokens = storage.load(provider_id)
    if tokens is None or not tokens.access_token:
        return ProviderUpdateResult(
            False,
            f"{settings.display_name} is not authenticated.",
            provider_id,
        )

    family = _provider_family(provider_id, extra=tokens.extra)
    discovery = _discover_for_provider(
        provider_id,
        token=tokens.access_token,
        base_url=settings.base_url,
        display_name=settings.display_name,
        family=family,
        account_id=tokens.account_id,
    )
    if discovery.error is not None:
        return ProviderUpdateResult(
            False,
            f"Validation failed for {settings.display_name}: {discovery.error}",
            provider_id,
        )
    if not discovery.models:
        return ProviderUpdateResult(
            False,
            f"Validation failed for {settings.display_name}: no models discovered.",
            provider_id,
        )

    persist_discovered_models(
        provider_id,
        discovery.models,
        display_name=settings.display_name,
        provider_family=family,
        base_url=settings.base_url,
    )
    return ProviderUpdateResult(
        True,
        f"Validated {settings.display_name}; discovered {len(discovery.models)} model"
        f"{'s' if len(discovery.models) != 1 else ''}.",
        provider_id,
        models_discovered=len(discovery.models),
    )


def _settings_for_provider(provider_id: str, *, storage: TokenStorage) -> ProviderSettings:
    from rotaris_core.config.project_snapshot import read_snapshot
    from rotaris_core.providers.catalog import BUILTIN_PROVIDERS

    tokens = storage.load(provider_id)
    extra = {} if tokens is None else tokens.extra
    snapshot = read_snapshot()
    snapshot_provider = None if snapshot is None else snapshot.providers.get(provider_id)
    family = _provider_family(provider_id, extra=extra)

    if snapshot_provider is not None:
        display_name = snapshot_provider.display_name
        base_url = snapshot_provider.base_url or extra.get("api_base")
    elif provider_id in BUILTIN_PROVIDERS:
        provider = BUILTIN_PROVIDERS[provider_id]
        display_name = provider.display_name
        base_url = extra.get("api_base") or provider.default_base_url
    else:
        display_name = provider_id
        base_url = extra.get("api_base")

    return ProviderSettings(
        provider_id=provider_id,
        display_name=display_name,
        family=family,
        auth_flow=_auth_flow_for(provider_id, family=family),
        authenticated=bool(tokens and tokens.access_token),
        base_url=base_url,
        masked_key=mask_secret(None if tokens is None else tokens.access_token),
    )


def _provider_family(provider_id: str, *, extra: dict[str, str]) -> str:
    from rotaris_core.config.project_snapshot import read_snapshot
    from rotaris_core.providers.catalog import BUILTIN_PROVIDERS
    from rotaris_core.providers.instances import is_openai_compatible_instance

    snapshot = read_snapshot()
    snapshot_provider = None if snapshot is None else snapshot.providers.get(provider_id)
    if snapshot_provider is not None and snapshot_provider.family:
        return snapshot_provider.family
    if extra.get("provider_family"):
        return extra["provider_family"]
    if is_openai_compatible_instance(provider_id):
        return "openai-compatible"
    if provider_id in BUILTIN_PROVIDERS:
        return provider_id
    return provider_id


def _auth_flow_for(provider_id: str, *, family: str) -> AuthFlowType:
    if family == "openai-compatible" or provider_id == "deepseek":
        return AuthFlowType.API_KEY
    if provider_id == "copilot":
        return AuthFlowType.DEVICE_CODE
    if provider_id in {"codex", "concrete-cloud", "geraet-cloud"}:
        return AuthFlowType.PKCE
    return AuthFlowType.API_KEY


def _discover_for_provider(
    provider_id: str,
    *,
    token: str,
    base_url: str | None,
    display_name: str,
    family: str,
    account_id: str | None = None,
) -> DiscoveryResult:
    from rotaris_core.providers.discovery import build_models_endpoint, discover_models

    if family == "openai-compatible":
        if base_url is None:
            from rotaris_core.providers.catalog import get_provider

            base_url = get_provider("openai-compatible").default_base_url
        return discover_models(
            "openai-compatible",
            token=token,
            discovery_endpoint=build_models_endpoint(base_url),
            qualified_provider_id=provider_id,
            display_name=display_name,
        )
    return discover_models(family, token=token, api_base=base_url, account_id=account_id)


def _update_snapshot_base_url(provider_id: str, base_url: str) -> None:
    from rotaris_core.config.project_snapshot import read_snapshot, update_provider

    snapshot = read_snapshot()
    if snapshot is None:
        return
    provider = snapshot.providers.get(provider_id)
    if provider is None:
        return
    update_provider(provider.model_copy(update={"base_url": base_url}))
