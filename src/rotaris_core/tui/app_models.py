from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    import logging

    from rotaris_core.tui.app import RotarisTuiApp


def configured_starting_model_key(app: RotarisTuiApp) -> str | None:
    if app.config is None:
        return None
    persona_cfg = app.config.personas.get(app.config.default_persona)
    if persona_cfg is None:
        return None
    return persona_cfg.model


def reset_active_model_to_config(app: RotarisTuiApp) -> None:
    app._runtime_model_configs.clear()
    app.active_model_key = configured_starting_model_key(app)
    sync_session_model_state(app)


def active_model_config(app: RotarisTuiApp) -> Any | None:
    if app.active_model_key is None:
        return None
    runtime_cfg = app._runtime_model_configs.get(app.active_model_key)
    if runtime_cfg is not None:
        return runtime_cfg
    if app.config is None:
        return None
    return app.config.models.get(app.active_model_key)


def restore_session_model_state(app: RotarisTuiApp, logger: logging.Logger) -> None:
    from rotaris_core.config.schema import ModelConfig

    if app.current_session is None:
        return

    app._runtime_model_configs.clear()
    for model_key, raw_cfg in app.current_session.runtime_model_configs.items():
        try:
            app._runtime_model_configs[model_key] = ModelConfig.model_validate(raw_cfg)
        except Exception:  # noqa: BLE001
            logger.exception("Ignoring invalid runtime model config for %s", model_key)
    app.active_model_key = app.current_session.active_model_key or configured_starting_model_key(
        app
    )


def sync_session_model_state(app: RotarisTuiApp) -> None:
    if app.current_session is None:
        return
    app.current_session.active_model_key = app.active_model_key
    app.current_session.runtime_model_configs = {
        model_key: model_cfg.model_dump(mode="python")
        for model_key, model_cfg in app._runtime_model_configs.items()
    }


def persist_session_model_state(app: RotarisTuiApp, logger: logging.Logger) -> None:
    sync_session_model_state(app)
    if app.current_session is None or app.session_manager is None:
        return
    try:
        app.session_manager.persister.request_save(app.current_session)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to persist session model override")


@traces(SWR.SWR_1176, SWR.SWR_1424)
def apply_runtime_model_selection(
    app: RotarisTuiApp,
    result: object | None,
    logger: logging.Logger,
) -> None:
    from rotaris_core.config.schema import ModelConfig
    from rotaris_core.providers.limits import extract_token_limits
    from rotaris_core.tui.screens.runtime_models import RuntimeModelResult

    if not isinstance(result, RuntimeModelResult) or app.config is None:
        return

    selection = result.selection
    model_key = selection.qualified_model_id
    max_input_tokens, max_output_tokens = extract_token_limits(selection.limits)
    if model_key not in app.config.models:
        app._runtime_model_configs[model_key] = ModelConfig(
            provider="openai",
            model_id=selection.model_id,
            auth_provider=selection.provider_id,
            base_url=resolve_runtime_model_base_url(selection.provider_id),
            max_input_tokens=max_input_tokens,
            max_output_tokens=max_output_tokens,
            api_key=None,
            api_key_env=None,
        )
    app.active_model_key = model_key
    persist_session_model_state(app, logger)
    update_composer_model(app)
    app._refresh_widgets()
    app.notify(f"Runtime model: {selection.provider_display_name} / {selection.model_id}")


def resolve_runtime_model_base_url(provider_id: str) -> str | None:
    from rotaris_core.config.project_snapshot import read_snapshot
    from rotaris_core.providers.catalog import get_provider

    try:
        return get_provider(provider_id).default_base_url
    except KeyError:
        snapshot = read_snapshot()
        snapshot_provider = None if snapshot is None else snapshot.providers.get(provider_id)
        if snapshot_provider is None:
            return None
        if snapshot_provider.base_url is not None:
            return snapshot_provider.base_url
        family = snapshot_provider.family
        if family is None:
            return None
        try:
            return get_provider(family).default_base_url
        except KeyError:
            return None


def update_composer_model(app: RotarisTuiApp) -> None:
    from textual.css.query import NoMatches

    from rotaris_core.tui.widgets.input_composer import InputComposer

    try:
        composer = app.screen.query_one(InputComposer)
    except (NoMatches, Exception):
        return
    if app.config and app.active_model_key:
        model_cfg = active_model_config(app)
        composer.update_model(app.active_model_key, bool(model_cfg and model_cfg.thinking))


def refresh_composer_meta(app: RotarisTuiApp) -> None:
    from textual.css.query import NoMatches

    from rotaris_core.tui.widgets.input_composer import InputComposer

    try:
        composer = app.screen.query_one(InputComposer)
    except (NoMatches, Exception):
        return
    composer.refresh_meta()
