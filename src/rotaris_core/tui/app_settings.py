from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.tui.app import RotarisTuiApp


@traces(SWR.SWR_1725)
def show_mcp_servers(app: RotarisTuiApp) -> None:
    from rotaris_core.tui.mcp_toggles import MCPToggleStore
    from rotaris_core.tui.screens.mcp_servers import MCPServersScreen

    if not app.config:
        app.push_screen(MCPServersScreen([], MCPToggleStore()))
        return

    servers = [
        {
            "name": name,
            "source": app.config.mcp_server_sources.get(name, "default"),
            "type": cfg.type,
            "status": "active",
        }
        for name, cfg in app.config.mcp_servers.items()
    ]
    app.push_screen(MCPServersScreen(servers, MCPToggleStore()))


def show_mcp_secrets(app: RotarisTuiApp) -> None:
    from rotaris_core.config.paths import GLOBAL_CONFIG_DIR
    from rotaris_core.tui.screens.mcp_secrets import MCPSecretsResult, MCPSecretsScreen

    if not app.config:
        app.push_screen(
            MCPSecretsScreen(
                [],
                Path.cwd(),
                Path.cwd() / ".rotaris",
                GLOBAL_CONFIG_DIR,
            ),
        )
        return

    server_names = list(app.config.mcp_servers.keys())

    # Extract expected env-var keys per server from agents.yaml config
    server_envs: dict[str, list[str]] = {}
    for name, cfg in app.config.mcp_servers.items():
        if cfg.env:
            server_envs[name] = sorted(cfg.env.keys())

    def on_close(result: MCPSecretsResult | None) -> None:
        if result is None:
            return
        app.notify(result.message or "MCP secrets updated.")

    app.push_screen(
        MCPSecretsScreen(
            server_names,
            app.config.workspace_root,
            app.config.workspace_root / ".rotaris",
            GLOBAL_CONFIG_DIR,
            server_envs,
        ),
        on_close,
    )


def show_provider_settings(app: RotarisTuiApp, provider_id: str | None = None) -> None:
    from rotaris_core.tui.screens.provider_settings import (
        ProviderSettingsResult,
        ProviderSettingsScreen,
    )

    def on_close(result: ProviderSettingsResult | None) -> None:
        app._provider_settings_prompt_visible = False
        if result is None or not result.saved:
            return
        app.notify(result.message or "Provider settings saved.")

    app.push_screen(ProviderSettingsScreen(provider_id), on_close)


def show_tool_result_settings(app: RotarisTuiApp, logger: logging.Logger) -> None:
    del logger
    if app.config is None:
        app.notify("No config available.", severity="warning")
        return

    from rotaris_core.tui.screens.tool_result_settings import (
        ToolResultSettingsResult,
        ToolResultSettingsScreen,
    )

    def on_close(result: ToolResultSettingsResult | None) -> None:
        if result is None or not result.saved:
            return
        persist_display_config(app)
        app._refresh_widgets()
        app.notify(
            f"Tool results: {'shown' if result.display.show_tool_results else 'hidden'}"
            f", max {result.display.tool_result_max_lines} lines",
        )

    app.push_screen(ToolResultSettingsScreen(app.config.display), on_close)


def show_compression_settings(app: RotarisTuiApp, logger: logging.Logger) -> None:
    del logger
    if app.config is None:
        app.notify("No config available.", severity="warning")
        return

    from rotaris_core.tui.screens.compression_settings import (
        CompressionSettingsResult,
        CompressionSettingsScreen,
    )

    def on_close(result: CompressionSettingsResult | None) -> None:
        if result is None or not result.saved:
            return
        persist_compressor_config(app)
        app._refresh_widgets()
        app.notify(f"Compression threshold: {result.compressor.threshold_percentage}%")

    app.push_screen(CompressionSettingsScreen(app.config.compressor), on_close)


def show_dev_options(app: RotarisTuiApp) -> None:
    if app.config is None:
        app.notify("No config available.", severity="warning")
        return

    from rotaris_core.tui.screens.dev_options import DevOptionsScreen

    app.push_screen(DevOptionsScreen(dev_options_state(app)))


def persist_display_config(app: RotarisTuiApp) -> None:
    if app.config is None:
        return

    persist_config_sections(
        app,
        {"display": app.config.display.model_dump(mode="python")},
        scope="project",
    )


def persist_compressor_config(app: RotarisTuiApp) -> None:
    if app.config is None:
        return

    persist_config_sections(
        app,
        {"compressor": app.config.compressor.model_dump(mode="python")},
        scope="project",
    )


def persist_config_sections(
    app: RotarisTuiApp,
    sections: dict[str, Any],
    *,
    scope: str,
) -> None:
    if app.config is None:
        return

    import os
    import tempfile
    from contextlib import suppress
    from pathlib import Path

    import yaml

    from rotaris_core.config.paths import GLOBAL_CONFIG_DIR, WORKSPACE_CONFIG_DIR_NAME

    if scope == "global":
        config_dir = GLOBAL_CONFIG_DIR
    else:
        config_dir = app.config.workspace_root / WORKSPACE_CONFIG_DIR_NAME
    agents_yaml_path = config_dir / "agents.yaml"

    data: dict[str, Any] = {}
    if agents_yaml_path.exists():
        try:
            with agents_yaml_path.open("r", encoding="utf-8") as handle:
                loaded = yaml.safe_load(handle) or {}
            if isinstance(loaded, dict):
                data = loaded
        except yaml.YAMLError:
            logging.getLogger(__name__).warning(
                "Could not parse %s for workspace config write",
                agents_yaml_path,
            )

    data.update(sections)
    rendered = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)

    agents_yaml_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".agents.", dir=agents_yaml_path.parent)
    os.close(fd)
    tmp_path = Path(tmp)
    try:
        tmp_path.write_text(rendered, encoding="utf-8")
        os.chmod(tmp_path, 0o644)
        os.replace(tmp_path, agents_yaml_path)
    finally:
        with suppress(FileNotFoundError):
            tmp_path.unlink()


def toggle_memory_diagnostics_scope(app: RotarisTuiApp, scope: str) -> Any:
    from rotaris_core.tui.screens.dev_options import DevOptionsState

    if app.config is None:
        return DevOptionsState(False, None, None)

    current_value = scope_runtime_memory_setting(app, scope)
    next_value = not bool(current_value)
    persist_config_sections(
        app,
        {"runtime": {"memory_diagnostics_enabled": next_value}},
        scope=scope,
    )
    reload_config_after_settings_save(app)
    app.notify(f"Memory diagnostics {'enabled' if next_value else 'disabled'} for {scope}.")
    return dev_options_state(app)


def reload_config_after_settings_save(app: RotarisTuiApp) -> None:
    if app.config is None:
        return

    from rotaris_core.config.loader import load_config

    current_workspace = app.config.workspace_root
    app.config = load_config(current_workspace)
    app._update_composer_model()
    app._refresh_widgets()


def scope_runtime_memory_setting(app: RotarisTuiApp, scope: str) -> bool | None:
    runtime_cfg = read_scope_runtime_config(app, scope)
    if runtime_cfg is None:
        return None
    value = runtime_cfg.get("memory_diagnostics_enabled")
    return value if isinstance(value, bool) else None


def read_scope_runtime_config(app: RotarisTuiApp, scope: str) -> dict[str, Any] | None:
    if app.config is None:
        return None

    from pathlib import Path

    import yaml

    from rotaris_core.config.paths import GLOBAL_CONFIG_DIR, WORKSPACE_CONFIG_DIR_NAME

    config_dir = (
        GLOBAL_CONFIG_DIR
        if scope == "global"
        else app.config.workspace_root / WORKSPACE_CONFIG_DIR_NAME
    )
    agents_yaml_path = Path(config_dir) / "agents.yaml"
    if not agents_yaml_path.exists():
        return None
    try:
        with agents_yaml_path.open("r", encoding="utf-8") as handle:
            loaded = yaml.safe_load(handle) or {}
    except yaml.YAMLError:
        return None
    if not isinstance(loaded, dict):
        return None
    runtime_cfg = loaded.get("runtime")
    return runtime_cfg if isinstance(runtime_cfg, dict) else None


def dev_options_state(app: RotarisTuiApp) -> Any:
    from rotaris_core.tui.screens.dev_options import DevOptionsState

    if app.config is None:
        return DevOptionsState(False, None, None)

    return DevOptionsState(
        effective_enabled=app.config.runtime.memory_diagnostics_enabled,
        global_enabled=scope_runtime_memory_setting(app, "global"),
        project_enabled=scope_runtime_memory_setting(app, "project"),
    )
