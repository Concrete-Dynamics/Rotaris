from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from textual.widgets import DataTable

from rotaris_core.reqtocode import SWR, traces

_SYNTHETIC_STARTUP_MODEL_PREFIX = "__startup_slot__:"

if TYPE_CHECKING:
    from collections.abc import Mapping

    from rotaris_core.config.project_snapshot import SnapshotProvider
    from rotaris_core.config.schema import ModelConfig, RotarisConfig
    from rotaris_core.providers.discovery import DiscoveredModel


@dataclass(frozen=True)
class ProviderCatalog:
    provider_id: str
    display_name: str


def build_provider_catalogs(config: RotarisConfig) -> tuple[ProviderCatalog, ...]:
    from rotaris_core.providers.catalog import list_providers

    snapshot_providers = _load_snapshot_providers()
    provider_ids = {
        model_cfg.auth_provider
        for model_cfg in config.models.values()
        if isinstance(model_cfg.auth_provider, str) and model_cfg.auth_provider
    }
    provider_ids.update(
        provider_id
        for provider_id, provider in snapshot_providers.items()
        if provider.authenticated
    )

    builtin_order = {provider.id: index for index, provider in enumerate(list_providers())}
    builtin_catalogs: list[tuple[int, ProviderCatalog]] = []
    custom_catalogs: list[ProviderCatalog] = []
    for provider_id in provider_ids:
        catalog = ProviderCatalog(
            provider_id=provider_id,
            display_name=resolve_provider_display_name(
                provider_id,
                snapshot_providers=snapshot_providers,
            ),
        )
        order = builtin_order.get(provider_id)
        if order is None:
            custom_catalogs.append(catalog)
            continue
        builtin_catalogs.append((order, catalog))

    ordered_catalogs = [catalog for _order, catalog in sorted(builtin_catalogs)]
    ordered_catalogs.extend(
        sorted(
            custom_catalogs,
            key=lambda catalog: (catalog.display_name.lower(), catalog.provider_id),
        ),
    )
    return tuple(ordered_catalogs)


@dataclass
class ModelCatalogRow:
    identity: str
    selection_value: str
    provider_display_name: str
    model_display_name: str
    configured: bool = False
    runtime: bool = False

    @property
    def source(self) -> str:
        if self.configured and self.runtime:
            return "configured + runtime"
        if self.configured:
            return "configured"
        return "runtime"


@traces(SWR.SWR_1176)
class ModelCatalogTable(DataTable[str]):
    def on_mount(self) -> None:
        self.ensure_model_catalog_columns()

    def ensure_model_catalog_columns(self) -> None:
        if getattr(self, "_columns_initialized", False):
            return
        self.add_column("Provider Catalog", key="provider")
        self.add_column("Models", key="model")
        self.add_column("Source", key="source")
        self._columns_initialized = True


def model_catalog_row_key(identity: str) -> str:
    return f"model:{identity}"


def configured_model_identity(config_key: str, model_cfg: ModelConfig) -> str:
    auth_provider = model_cfg.auth_provider
    model_id = model_cfg.model_id
    if auth_provider and model_id:
        return f"{auth_provider}/{model_id}"
    return config_key


def build_configured_catalog_rows(config: RotarisConfig) -> dict[str, ModelCatalogRow]:
    snapshot_providers = _load_snapshot_providers()
    rows: dict[str, ModelCatalogRow] = {}
    for config_key, model_cfg in config.models.items():
        if config_key.startswith(_SYNTHETIC_STARTUP_MODEL_PREFIX):
            continue
        identity = configured_model_identity(config_key, model_cfg)
        row = ModelCatalogRow(
            identity=identity,
            selection_value=config_key,
            provider_display_name=configured_provider_display_name(
                model_cfg,
                snapshot_providers=snapshot_providers,
            ),
            model_display_name=model_cfg.model_id or config_key,
            configured=True,
        )
        existing = rows.get(identity)
        if existing is None or config_key == identity:
            rows[identity] = row
    return rows


def merge_runtime_catalog_row(
    rows: dict[str, ModelCatalogRow],
    *,
    provider_id: str,
    provider_display_name: str,
    model: DiscoveredModel,
) -> ModelCatalogRow:
    qualified_id = model.qualified_id or f"{provider_id}/{model.id}"
    row = rows.get(qualified_id)
    if row is None:
        row = ModelCatalogRow(
            identity=qualified_id,
            selection_value=qualified_id,
            provider_display_name=provider_display_name,
            model_display_name=model.display_name or qualified_id,
            runtime=True,
        )
        rows[qualified_id] = row
        return row

    row.runtime = True
    row.provider_display_name = provider_display_name
    if model.display_name:
        row.model_display_name = model.display_name
    return row


def configured_provider_display_name(
    model_cfg: ModelConfig,
    *,
    snapshot_providers: Mapping[str, SnapshotProvider] | None = None,
) -> str:
    auth_provider = model_cfg.auth_provider
    if auth_provider:
        return resolve_provider_display_name(
            auth_provider,
            snapshot_providers=snapshot_providers,
        )
    return model_cfg.provider or "unknown"


def resolve_provider_display_name(
    provider_id: str,
    *,
    snapshot_providers: Mapping[str, SnapshotProvider] | None = None,
) -> str:
    from rotaris_core.providers.catalog import get_provider

    providers = snapshot_providers if snapshot_providers is not None else _load_snapshot_providers()
    snapshot_provider = providers.get(provider_id)
    if snapshot_provider is not None and snapshot_provider.display_name:
        return snapshot_provider.display_name

    try:
        return get_provider(provider_id).display_name
    except KeyError:
        return provider_id


def _load_snapshot_providers() -> dict[str, SnapshotProvider]:
    from rotaris_core.config.project_snapshot import read_snapshot

    try:
        snapshot = read_snapshot()
    except ValueError:
        return {}
    if snapshot is None:
        return {}
    return dict(snapshot.providers)
