#!/usr/bin/env python3
"""Authentication flow helpers for the CLI login process."""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from importlib import import_module
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol, cast

from rotaris_core.config.paths import WORKSPACE_CONFIG_DIR_NAME as _WORKSPACE_CONFIG_DIR_NAME
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.auth.manager import AuthManager
    from rotaris_core.config.project_snapshot import ProjectSnapshot
    from rotaris_core.config.schema import ModelConfig, RotarisConfig, ThinkingLevel
    from rotaris_core.providers.discovery import DiscoveryResult


@dataclass(frozen=True)
class LoginUI(Protocol):
    def choose_provider(self, options: list[tuple[str, str]]) -> str | None:
        """Choose a provider from the given options."""
        ...

    def prompt_text(self, prompt: str, *, default: str | None = None) -> str | None:
        """Prompt the user for text input."""
        ...

    def prompt_secret(self, prompt: str) -> str | None:
        """Prompt the user for a secret value."""
        ...

    def choose_model(
        self,
        prompt: str,
        options: list[tuple[str, str]],
        *,
        default: str | None = None,
        allow_skip: bool = False,
    ) -> str | None:
        """Choose a model from the given options."""
        ...

    def show_auth_prompt(
        self,
        *,
        verification_url: str,
        user_code: str,
        message: str,
    ) -> None:
        """Show the authentication prompt to the user."""
        ...

    def info(self, message: str) -> None:
        """Display an info-level message."""
        ...

    def warning(self, message: str) -> None:
        """Display a warning-level message."""
        ...

    def error(self, message: str) -> None:
        """Display an error-level message."""
        ...

    def confirm(self, prompt: str, *, default: bool = False) -> bool:
        """Ask for confirmation from the user."""
        ...

    def choose_recovery(self) -> str:
        """Ask the user to choose a recovery action."""
        ...


class StoredTokensLike(Protocol):
    extra: dict[str, str]


class AuthManagerLike(Protocol):
    async def check_status(self, provider_id: str) -> object:
        """Check the authentication status for a provider."""
        ...

    async def authenticate(self, provider_id: str, *, on_prompt: Any | None = None) -> object:
        """Authenticate with a provider."""
        ...

    async def get_token(self, provider_id: str) -> str | None:
        """Get the stored token for a provider."""
        ...

    def logout(self, provider_id: str) -> None:
        """Log out from a provider."""
        ...

    def get_stored_tokens(self, provider_id: str) -> StoredTokensLike | None:
        """Get stored tokens for a provider."""
        ...

    def get_last_error(self, provider_id: str) -> str | None:
        """Get the last authentication error for a provider."""
        ...


class EditorResultLike(Protocol):
    launched: bool
    error: object | None


@dataclass(frozen=True)
class LoginResult:
    provider_id: str
    success: bool
    models_discovered: int
    bootstrap_written: bool
    advanced_editor_launched: bool
    message: str
    advanced_editor_validation_errors: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class _AdvancedConfigResult:
    success: bool
    editor_launched: bool
    validation_errors: list[str] = field(default_factory=list)
    message: str | None = None


@dataclass(frozen=True)
class _OpenAICompatibleCredentials:
    instance_id: str
    label: str
    base_url: str
    api_key: str


class _LaunchEditor(Protocol):
    def __call__(self, path: Path, *, blocking: bool = False) -> object: ...


yaml = cast("Any", import_module("yaml"))


@traces(
    SWR.SWR_729,
    SWR.SWR_730,
    SWR.SWR_731,
    SWR.SWR_732,
    SWR.SWR_733,
    SWR.SWR_734,
    SWR.SWR_737,
    SWR.SWR_739,
    SWR.SWR_742,
    SWR.SWR_743,
    SWR.SWR_744,
)
def run_login(
    provider_id: str | None,
    *,
    workspace_root: Path,
    reauth: bool,
    ui: LoginUI,
) -> LoginResult:
    return asyncio.run(
        _run_login_async(provider_id, workspace_root=workspace_root, reauth=reauth, ui=ui),
    )


def _auth_prompt_parts(prompt: object) -> tuple[str, str, str]:
    verification_uri = getattr(prompt, "verification_uri", None)
    user_code = getattr(prompt, "user_code", "")
    if isinstance(verification_uri, str):
        code = user_code if isinstance(user_code, str) else str(user_code)
        message = f"Open {verification_uri} and enter code {code}."
        return verification_uri, code, message

    verification_url = str(prompt)
    return verification_url, "", f"Open {verification_url} to authenticate."


def _login_provider_display_name(provider_id: str, display_name: str) -> str:
    if provider_id == "codex":
        return f"{display_name} (Sign in with ChatGPT)"
    return display_name


def _editor_launched(ui: LoginUI, editor_result: EditorResultLike) -> bool:
    if editor_result.error is not None:
        ui.warning(f"Editor failed: {editor_result.error}")
        return False
    return bool(editor_result.launched)


@traces(SWR.SWR_725)
def _ensure_global_config_dir(ui: LoginUI) -> None:
    try:
        import platformdirs as _platformdirs  # noqa: PLC0415

        Path(_platformdirs.user_config_dir("rotaris")).mkdir(parents=True, exist_ok=True)
        home = os.environ.get("HOME")
        if home:
            (Path(home) / ".config" / "rotaris").mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        ui.warning(f"Failed to create global config directory: {exc}")


@traces(SWR.SWR_783)
def _resolve_provider_id(provider_id: str | None, ui: LoginUI) -> str | LoginResult:
    from rotaris_core.providers.catalog import list_providers  # noqa: PLC0415

    providers = list_providers()
    options = [
        (
            provider.id,
            (
                f"{_login_provider_display_name(provider.id, provider.display_name)} — Coming soon"
                if not provider.available
                else _login_provider_display_name(provider.id, provider.display_name)
            ),
        )
        for provider in providers
    ]
    if provider_id is None:
        provider_id = ui.choose_provider(options)
        if provider_id is None:
            return LoginResult("", False, 0, False, False, "cancelled")  # noqa: FBT003

    known_provider_ids = {provider_id_option for provider_id_option, _ in options}
    if provider_id not in known_provider_ids:
        ui.error(f"Unknown provider: {provider_id}")
        return LoginResult(provider_id, False, 0, False, False, f"Unknown provider: {provider_id}")  # noqa: FBT003
    provider = next(candidate for candidate in providers if candidate.id == provider_id)
    if not provider.available:
        message = provider.unavailable_reason or f"{provider.display_name} is unavailable."
        ui.error(message)
        return LoginResult(provider_id, False, 0, False, False, message)  # noqa: FBT003
    return provider_id


def _discard_stored_authentication(
    auth_manager: AuthManagerLike,
    provider_id: str,
    display_name: str,
    ui: LoginUI,
    *,
    severity: str = "warning",
) -> bool:
    get_stored = getattr(auth_manager, "get_stored_tokens", None)
    if not callable(get_stored):
        return False
    try:
        stored_tokens = get_stored(provider_id)
    except (AttributeError, OSError, TypeError, ValueError):
        return False
    if stored_tokens is None:
        return False
    auth_manager.logout(provider_id)
    message = f"Discarded stored authentication for {display_name}."
    if severity == "info":
        ui.info(message)
    else:
        ui.warning(message)
    return True


def _build_auth_prompt_callback(ui: LoginUI, *, provider_id: str) -> Any:
    async def on_prompt(prompt: object) -> None:
        try:
            verification_url, user_code, message = _auth_prompt_parts(prompt)
            if provider_id == "codex" and not user_code:
                message = "Sign in with ChatGPT to authenticate Codex."
            await asyncio.to_thread(
                ui.show_auth_prompt,
                verification_url=verification_url,
                user_code=user_code,
                message=message,
            )
        except (OSError, RuntimeError, TypeError, ValueError) as exc:
            ui.warning(f"Error displaying auth prompt: {exc}")

    return on_prompt


def _validate_workspace_config(workspace_root: Path) -> list[str]:
    from pydantic import ValidationError  # noqa: PLC0415

    from rotaris_core.config.loader import load_config  # noqa: PLC0415
    from rotaris_core.config.validation import validate_config  # noqa: PLC0415

    try:
        config = load_config(workspace_root)
    except (OSError, ValidationError, ValueError) as exc:
        return [str(exc)]
    return validate_config(config)


def _report_validation_errors(ui: LoginUI, validation_errors: list[str]) -> None:
    for err in validation_errors:
        ui.error(err)


def _load_declared_model_names(config_dir: Path) -> list[str]:
    model_names: list[str] = []
    for file_name in ("agents.yaml", "models.yml"):
        path = config_dir / file_name
        if not path.exists():
            continue
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError, ValueError):
            continue
        if not isinstance(raw, dict):
            continue
        models = raw.get("models")
        if not isinstance(models, dict):
            continue
        model_names.extend(str(model_name) for model_name in models)
    return model_names


def _resolve_model_choice_provider_label(
    model_cfg: ModelConfig,
    snapshot: ProjectSnapshot | None,
) -> str:
    from rotaris_core.providers.catalog import get_provider  # noqa: PLC0415

    auth_provider = model_cfg.auth_provider
    if auth_provider:
        if snapshot is not None:
            snapshot_provider = snapshot.providers.get(auth_provider)
            if snapshot_provider is not None:
                return snapshot_provider.display_name
        try:
            return get_provider(auth_provider).display_name
        except KeyError:
            return auth_provider
    return model_cfg.provider


def _build_model_choice_label(
    model_name: str,
    model_cfg: ModelConfig,
    snapshot: ProjectSnapshot | None,
) -> str:
    provider_label = _resolve_model_choice_provider_label(model_cfg, snapshot)
    model_label = model_cfg.model_id or model_name

    if snapshot is not None and model_cfg.auth_provider:
        snapshot_provider = snapshot.providers.get(model_cfg.auth_provider)
        if snapshot_provider is not None:
            snapshot_model = next(
                (model for model in snapshot_provider.models if model.id == model_name),
                None,
            )
            if snapshot_model is not None and snapshot_model.display_name:
                model_label = snapshot_model.display_name

    return f"{provider_label}: {model_label}"


def _build_startup_model_choices(workspace_root: Path) -> list[tuple[str, str]]:
    config_loader = cast("Any", import_module("rotaris_core.config.loader"))
    from rotaris_core.config.project_snapshot import read_snapshot  # noqa: PLC0415

    global_config_dir = Path(config_loader.GLOBAL_CONFIG_DIR)
    config = config_loader.load_config(workspace_root)
    snapshot = read_snapshot(global_config_dir)

    model_names: list[str] = []
    if snapshot is not None:
        for provider in snapshot.providers.values():
            if not provider.authenticated:
                continue
            model_names.extend(model.id for model in provider.models)

    model_names.extend(_load_declared_model_names(global_config_dir))
    model_names.extend(_load_declared_model_names(workspace_root / _WORKSPACE_CONFIG_DIR_NAME))

    if not model_names:
        model_names.extend(config.models)

    seen: set[str] = set()
    choices: list[tuple[str, str]] = []
    for model_name in model_names:
        if model_name in seen:
            continue
        seen.add(model_name)
        model_cfg = config.models.get(model_name)
        if model_cfg is None:
            continue
        choices.append(
            (
                model_name,
                _build_model_choice_label(model_name, model_cfg, snapshot),
            ),
        )

    return choices


def _collect_openai_compatible_credentials(
    ui: LoginUI,
    *,
    reauth: bool,
) -> _OpenAICompatibleCredentials | LoginResult:
    from rotaris_core.auth.storage import TokenStorage  # noqa: PLC0415
    from rotaris_core.config.project_snapshot import read_snapshot  # noqa: PLC0415
    from rotaris_core.providers import (  # noqa: PLC0415
        OPENAI_COMPATIBLE_PROVIDER_ID,
        build_instance_id,
    )
    from rotaris_core.providers.discovery import normalize_api_base  # noqa: PLC0415

    label = (ui.prompt_text("OpenAI-compatible label") or "").strip()
    if not label:
        return LoginResult("", False, 0, False, False, "OpenAI-compatible label is required.")  # noqa: FBT003

    try:
        instance_id = build_instance_id(OPENAI_COMPATIBLE_PROVIDER_ID, label)
    except ValueError as exc:
        message = str(exc)
        ui.error(message)
        return LoginResult("", False, 0, False, False, message)  # noqa: FBT003

    base_url_raw = ui.prompt_text("Endpoint URL", default="https://api.openai.com/v1")
    if base_url_raw is None:
        return LoginResult(instance_id, False, 0, False, False, "Endpoint URL is required.")  # noqa: FBT003
    try:
        base_url = normalize_api_base(base_url_raw)
    except ValueError as exc:
        message = str(exc)
        ui.error(message)
        return LoginResult(instance_id, False, 0, False, False, message)  # noqa: FBT003

    api_key = (ui.prompt_secret("API key") or "").strip()
    if not api_key:
        return LoginResult(instance_id, False, 0, False, False, "API key is required.")  # noqa: FBT003

    snapshot = read_snapshot()
    has_existing_provider = snapshot is not None and instance_id in snapshot.providers
    has_existing_tokens = TokenStorage().has_tokens(instance_id)
    if (
        (has_existing_provider or has_existing_tokens)
        and not reauth
        and not ui.confirm(f"Replace the existing provider instance '{label}'?", default=False)
    ):
        return LoginResult(instance_id, False, 0, False, False, "cancelled")  # noqa: FBT003

    return _OpenAICompatibleCredentials(
        instance_id=instance_id,
        label=label,
        base_url=base_url,
        api_key=api_key,
    )


def _configure_openai_compatible_models(
    workspace_root: Path,
    *,
    ui: LoginUI,
    model_choices: list[tuple[str, str]],
    default_slot_values: dict[str, str | None] | None = None,
) -> None:
    from rotaris_core.config.loader import load_config  # noqa: PLC0415
    from rotaris_core.config.startup_models import (  # noqa: PLC0415
        STARTUP_MODEL_FIELDS,
        STARTUP_MODEL_THINKING_FIELDS,
        write_startup_model_preferences,
    )

    if not ui.confirm("Configure startup model assignments now?", default=True):
        return

    config = load_config(workspace_root)
    slot_updates: dict[str, str | None] = {}
    slot_thinking_updates: dict[str, ThinkingLevel | None] = {}
    for field_name in STARTUP_MODEL_FIELDS:
        current_value = (
            default_slot_values[field_name]
            if default_slot_values is not None and field_name in default_slot_values
            else getattr(config, field_name)
        )
        selected = ui.choose_model(
            f"Select {field_name}",
            model_choices,
            default=current_value,
            allow_skip=False,
        )
        slot_updates[field_name] = selected
        slot_thinking_updates[field_name] = _choose_startup_slot_thinking(
            ui,
            config=config,
            slot_name=field_name,
            model_name=selected,
            default=getattr(config, STARTUP_MODEL_THINKING_FIELDS[field_name]),
        )

    persona_updates: dict[str, str | None] = {}
    if ui.confirm("Configure persona-specific model overrides now?", default=False):
        for persona_name in sorted(config.personas):
            current_value = config.personas[persona_name].model
            persona_updates[persona_name] = ui.choose_model(
                f"Override model for persona '{persona_name}' (current: {current_value})",
                model_choices,
                default=None,
                allow_skip=True,
            )

    write_startup_model_preferences(
        workspace_root,
        slots=slot_updates,
        slot_thinking=slot_thinking_updates,
        persona_models=persona_updates or None,
    )


def _startup_slot_thinking_choices(
    config: RotarisConfig,
    model_name: str | None,
) -> list[ThinkingLevel | None]:
    if model_name is None:
        return [None]

    model_cfg = config.models.get(model_name)
    if model_cfg is None:
        return [None]

    model_id = str(model_cfg.model_id)
    provider = str(model_cfg.provider)
    qualified_model_name = (
        model_id if model_id.startswith(f"{provider}/") else f"{provider}/{model_id}"
    )

    from rotaris_core.models.thinking_catalog import supported_reasoning_levels  # noqa: PLC0415

    return [None, *supported_reasoning_levels(qualified_model_name, provider)]


def _choose_startup_slot_thinking(
    ui: LoginUI,
    *,
    config: RotarisConfig,
    slot_name: str,
    model_name: str | None,
    default: ThinkingLevel | None,
) -> ThinkingLevel | None:
    choices = _startup_slot_thinking_choices(config, model_name)
    if choices == [None]:
        return None

    options: list[tuple[str, str]] = [
        (level, "disabled" if level is None else level) for level in choices if level is not None
    ]
    selected = ui.choose_model(
        f"Select {slot_name} thinking (0 disables)",
        options,
        default=default,
        allow_skip=True,
    )
    return cast("ThinkingLevel | None", selected)


def _run_advanced_config_flow(
    provider_id: str,
    *,
    workspace_root: Path,
    ui: LoginUI,
    launch_editor: _LaunchEditor,
) -> LoginResult:
    from rotaris_core.cli.model_refresh import warn_on_config_errors  # noqa: PLC0415
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml  # noqa: PLC0415

    bootstrap_result = write_minimal_agents_yaml(
        workspace_root / ".rotaris" / "agents.yaml",
        default_persona="orchestrator",
        overwrite=False,
    )
    editor_result = launch_editor(
        workspace_root / ".rotaris" / "agents.yaml",
        blocking=True,
    )
    typed_editor_result = cast("EditorResultLike", editor_result)
    if typed_editor_result.error is not None:
        ui.error(f"Editor failed: {typed_editor_result.error}")
        warn_on_config_errors(workspace_root, ui, phase="login")
        return LoginResult(
            provider_id,
            False,  # noqa: FBT003
            0,
            bool(bootstrap_result.written),
            False,  # noqa: FBT003
            "manual config required",
        )

    advanced_editor_launched = _editor_launched(ui, typed_editor_result)
    validation_errors = _validate_workspace_config(workspace_root)
    if validation_errors:
        _report_validation_errors(ui, validation_errors)

    warn_on_config_errors(workspace_root, ui, phase="login")
    return LoginResult(  # noqa: FBT003
        provider_id,
        not validation_errors,
        0,
        bool(bootstrap_result.written),
        advanced_editor_launched,
        "manual config required",
        validation_errors,
    )


def _resolve_empty_discovery_recovery(ui: LoginUI, *, discovery_retries: int) -> str:
    recovery = ui.choose_recovery()
    while recovery == "retry" and discovery_retries >= 2:
        ui.warning("Model discovery retry limit reached.")
        recovery = ui.choose_recovery()
    return recovery


async def _ensure_authenticated(
    provider_id: str,
    *,
    display_name: str,
    reauth: bool,
    auth_manager: AuthManager,
    ui: LoginUI,
) -> LoginResult | None:
    from rotaris_core.auth.manager import AuthenticationError  # noqa: PLC0415
    from rotaris_core.auth.provider import AuthStatus  # noqa: PLC0415
    from rotaris_core.cli.model_refresh import maybe_await  # noqa: PLC0415

    on_prompt = _build_auth_prompt_callback(ui, provider_id=provider_id)
    try:
        status = await maybe_await(auth_manager.check_status(provider_id))
        if reauth:
            _discard_stored_authentication(
                auth_manager,
                provider_id,
                display_name,
                ui,
                severity="info",
            )
            status = AuthStatus.UNAUTHENTICATED

        if status == AuthStatus.AUTHENTICATED:
            ui.info(f"Using stored authentication for {display_name}.")
            return None

        auth_result = await maybe_await(auth_manager.authenticate(provider_id, on_prompt=on_prompt))
    except AuthenticationError as exc:
        message = str(exc)
        ui.error(message)
        return LoginResult(provider_id, False, 0, False, False, message)  # noqa: FBT003

    if getattr(auth_result, "success", True) is False:
        message = str(getattr(auth_result, "error", None) or "Authentication failed")
        ui.error(message)
        return LoginResult(provider_id, False, 0, False, False, message)  # noqa: FBT003
    return None


async def _run_discovery_with_recovery(
    provider_id: str,
    *,
    display_name: str,
    auth_manager: AuthManager,
    workspace_root: Path,
    ui: LoginUI,
    launch_editor: _LaunchEditor,
) -> DiscoveryResult | LoginResult:
    from rotaris_core.cli.model_refresh import discover_authenticated_models  # noqa: PLC0415

    discovery_retries = 0
    while True:
        discovery = await discover_authenticated_models(
            provider_id,
            auth_manager=auth_manager,
            ui=ui,
        )
        if discovery.error is not None:
            message = f"Model discovery failed for {display_name}: {discovery.error}"
            ui.error(message)
            return LoginResult(provider_id, False, 0, False, False, message)  # noqa: FBT003
        if discovery.models:
            return discovery

        recovery = _resolve_empty_discovery_recovery(ui, discovery_retries=discovery_retries)
        if recovery == "retry":
            discovery_retries += 1
            continue
        if recovery == "try-other-provider":
            return await _run_login_async(
                None,
                workspace_root=workspace_root,
                reauth=False,
                ui=ui,
            )
        if recovery in {"advanced-config", "continue"}:
            return _run_advanced_config_flow(
                provider_id,
                workspace_root=workspace_root,
                ui=ui,
                launch_editor=launch_editor,
            )
        return LoginResult(provider_id, False, 0, False, False, "Model discovery aborted")  # noqa: FBT003


def _maybe_open_advanced_config(
    *,
    workspace_root: Path,
    ui: LoginUI,
    launch_editor: _LaunchEditor,
) -> _AdvancedConfigResult:
    if not ui.confirm("Open advanced config in your editor?", default=False):
        return _AdvancedConfigResult(True, False)  # noqa: FBT003

    editor_result = launch_editor(
        workspace_root / ".rotaris" / "agents.yaml",
        blocking=True,
    )
    typed_editor_result = cast("EditorResultLike", editor_result)
    if typed_editor_result.error is not None:
        ui.error(f"Editor failed: {typed_editor_result.error}")
        return _AdvancedConfigResult(False, False, message="manual config required")  # noqa: FBT003

    advanced_editor_launched = _editor_launched(ui, typed_editor_result)
    validation_errors = _validate_workspace_config(workspace_root)
    if validation_errors:
        _report_validation_errors(ui, validation_errors)
        return _AdvancedConfigResult(
            False,  # noqa: FBT003
            advanced_editor_launched,
            validation_errors,
            "manual config required",
        )
    return _AdvancedConfigResult(True, advanced_editor_launched)  # noqa: FBT003


def _build_login_success_result(
    provider_id: str,
    *,
    display_name: str,
    models_discovered: int,
    workspace_root: Path,
    ui: LoginUI,
    launch_editor: _LaunchEditor,
    configure_models: bool = False,
    discovered_models: list[Any] | None = None,
    startup_model_defaults: dict[str, str | None] | None = None,
) -> LoginResult:
    from rotaris_core.cli.model_refresh import warn_on_config_errors  # noqa: PLC0415
    from rotaris_core.config.bootstrap import write_minimal_agents_yaml  # noqa: PLC0415

    bootstrap_result = write_minimal_agents_yaml(
        workspace_root / ".rotaris" / "agents.yaml",
        default_persona="orchestrator",
        overwrite=False,
    )
    message = (
        f"Login complete for {display_name}; discovered {models_discovered} model"
        f"{'s' if models_discovered != 1 else ''}."
    )
    if configure_models and discovered_models is not None:
        model_choices = _build_startup_model_choices(workspace_root)
        _configure_openai_compatible_models(
            workspace_root,
            ui=ui,
            model_choices=model_choices,
            default_slot_values=startup_model_defaults,
        )
    advanced_config = _maybe_open_advanced_config(
        workspace_root=workspace_root,
        ui=ui,
        launch_editor=launch_editor,
    )
    warn_on_config_errors(workspace_root, ui, phase="login")
    return LoginResult(
        provider_id,
        advanced_config.success,
        models_discovered,
        bool(bootstrap_result.written),
        advanced_config.editor_launched,
        advanced_config.message or message,
        advanced_config.validation_errors,
    )


async def _run_deepseek_login(
    *,
    workspace_root: Path,
    ui: LoginUI,
    launch_editor: _LaunchEditor,
) -> LoginResult:
    from rotaris_core.auth.provider import TokenSet  # noqa: PLC0415
    from rotaris_core.auth.storage import TokenStorage  # noqa: PLC0415
    from rotaris_core.cli.model_refresh import persist_discovered_models  # noqa: PLC0415
    from rotaris_core.providers.catalog import get_provider  # noqa: PLC0415
    from rotaris_core.providers.discovery import discover_models  # noqa: PLC0415

    api_key = (ui.prompt_secret("DeepSeek API key") or "").strip()
    if not api_key:
        return LoginResult("deepseek", False, 0, False, False, "API key is required.")  # noqa: FBT003

    discovery = discover_models(
        "deepseek",
        token=api_key,
    )
    if discovery.error is not None:
        message = f"Model discovery failed for DeepSeek: {discovery.error}"
        ui.error(message)
        return LoginResult("deepseek", False, 0, False, False, message)  # noqa: FBT003
    if not discovery.models:
        return _run_advanced_config_flow(
            "deepseek",
            workspace_root=workspace_root,
            ui=ui,
            launch_editor=launch_editor,
        )

    TokenStorage().save(
        "deepseek",
        TokenSet(
            access_token=api_key,
            refresh_token="",
        ),
    )
    persisted = persist_discovered_models(
        "deepseek",
        discovery.models,
        base_url=get_provider("deepseek").default_base_url,
    )
    return _build_login_success_result(
        "deepseek",
        display_name="DeepSeek",
        models_discovered=persisted.models_discovered,
        workspace_root=workspace_root,
        ui=ui,
        launch_editor=launch_editor,
    )


@traces(SWR.SWR_777)
async def _run_claude_code_login(
    *,
    workspace_root: Path,
    ui: LoginUI,
    launch_editor: _LaunchEditor,
) -> LoginResult:
    """Register the Claude Code subscription provider (SWR-777).

    ``claude setup-token`` is an interactive one-time browser mint Rotaris
    cannot drive itself, so the flow instructs the user to run it and paste
    the resulting subscription token.
    """
    from rotaris_core.auth.provider import TokenSet  # noqa: PLC0415
    from rotaris_core.auth.storage import TokenStorage  # noqa: PLC0415
    from rotaris_core.cli.model_refresh import persist_discovered_models  # noqa: PLC0415
    from rotaris_core.providers.claude_code import (  # noqa: PLC0415
        SETUP_TOKEN_INSTRUCTIONS,
        subscription_token_validation_error,
    )
    from rotaris_core.providers.discovery import discover_models  # noqa: PLC0415

    ui.info(SETUP_TOKEN_INSTRUCTIONS)
    token = (ui.prompt_secret("Claude Code subscription token (sk-ant-oat...)") or "").strip()
    validation_error = subscription_token_validation_error(token)
    if validation_error is not None:
        ui.error(validation_error)
        return LoginResult("claude-code", False, 0, False, False, validation_error)  # noqa: FBT003

    discovery = discover_models("claude-code", token=token)
    if discovery.error is not None:
        ui.error(discovery.error)
        return LoginResult("claude-code", False, 0, False, False, discovery.error)  # noqa: FBT003

    TokenStorage().save(
        "claude-code",
        TokenSet(access_token=token, refresh_token=""),
    )
    persisted = persist_discovered_models("claude-code", discovery.models)
    return _build_login_success_result(
        "claude-code",
        display_name="Claude Code (subscription)",
        models_discovered=persisted.models_discovered,
        workspace_root=workspace_root,
        ui=ui,
        launch_editor=launch_editor,
    )


async def _run_openai_compatible_login(
    *,
    workspace_root: Path,
    reauth: bool,
    ui: LoginUI,
    launch_editor: _LaunchEditor,
) -> LoginResult:
    from rotaris_core.auth.provider import TokenSet  # noqa: PLC0415
    from rotaris_core.auth.storage import TokenStorage  # noqa: PLC0415
    from rotaris_core.cli.model_refresh import persist_discovered_models  # noqa: PLC0415
    from rotaris_core.providers import OPENAI_COMPATIBLE_PROVIDER_ID  # noqa: PLC0415
    from rotaris_core.providers.discovery import (  # noqa: PLC0415
        build_models_endpoint,
        discover_models,
    )

    collected = _collect_openai_compatible_credentials(ui, reauth=reauth)
    if isinstance(collected, LoginResult):
        return collected

    discovery = discover_models(
        OPENAI_COMPATIBLE_PROVIDER_ID,
        token=collected.api_key,
        discovery_endpoint=build_models_endpoint(collected.base_url),
        qualified_provider_id=collected.instance_id,
        display_name=collected.label,
    )
    if discovery.error is not None:
        message = f"Model discovery failed for {collected.label}: {discovery.error}"
        ui.error(message)
        return LoginResult(collected.instance_id, False, 0, False, False, message)  # noqa: FBT003
    if not discovery.models:
        return _run_advanced_config_flow(
            collected.instance_id,
            workspace_root=workspace_root,
            ui=ui,
            launch_editor=launch_editor,
        )

    from rotaris_core.config.loader import load_config  # noqa: PLC0415
    from rotaris_core.config.startup_models import STARTUP_MODEL_FIELDS  # noqa: PLC0415

    prior_config = load_config(workspace_root)
    startup_model_defaults = {
        field_name: getattr(prior_config, field_name) for field_name in STARTUP_MODEL_FIELDS
    }

    TokenStorage().save(
        collected.instance_id,
        TokenSet(
            access_token=collected.api_key,
            refresh_token="",
            extra={
                "provider_family": OPENAI_COMPATIBLE_PROVIDER_ID,
                "api_base": collected.base_url,
            },
        ),
    )
    persisted = persist_discovered_models(
        collected.instance_id,
        discovery.models,
        display_name=collected.label,
        provider_family=OPENAI_COMPATIBLE_PROVIDER_ID,
        base_url=collected.base_url,
    )
    return _build_login_success_result(
        collected.instance_id,
        display_name=collected.label,
        models_discovered=persisted.models_discovered,
        workspace_root=workspace_root,
        ui=ui,
        launch_editor=launch_editor,
        configure_models=True,
        discovered_models=discovery.models,
        startup_model_defaults=startup_model_defaults,
    )


async def _run_login_async(
    provider_id: str | None,
    *,
    workspace_root: Path,
    reauth: bool,
    ui: LoginUI,
) -> LoginResult:
    from rotaris_core.auth.manager import AuthManager  # noqa: PLC0415
    from rotaris_core.cli.editor_launcher import launch_editor  # noqa: PLC0415
    from rotaris_core.cli.model_refresh import persist_discovered_models  # noqa: PLC0415
    from rotaris_core.providers import OPENAI_COMPATIBLE_PROVIDER_ID  # noqa: PLC0415
    from rotaris_core.providers.catalog import get_provider  # noqa: PLC0415

    workspace_root = Path(workspace_root)
    _ensure_global_config_dir(ui)

    resolved_provider_id = _resolve_provider_id(provider_id, ui)
    if isinstance(resolved_provider_id, LoginResult):
        return resolved_provider_id
    provider_id = resolved_provider_id

    if provider_id == OPENAI_COMPATIBLE_PROVIDER_ID:
        return await _run_openai_compatible_login(
            workspace_root=workspace_root,
            reauth=reauth,
            ui=ui,
            launch_editor=launch_editor,
        )

    if provider_id == "claude-code":
        return await _run_claude_code_login(
            workspace_root=workspace_root,
            ui=ui,
            launch_editor=launch_editor,
        )

    if provider_id == "deepseek":
        return await _run_deepseek_login(
            workspace_root=workspace_root,
            ui=ui,
            launch_editor=launch_editor,
        )

    provider = get_provider(provider_id)
    auth_manager = AuthManager()
    authentication_result = await _ensure_authenticated(
        provider_id,
        display_name=provider.display_name,
        reauth=reauth,
        auth_manager=auth_manager,
        ui=ui,
    )
    if authentication_result is not None:
        return authentication_result

    discovery_result = await _run_discovery_with_recovery(
        provider_id,
        display_name=provider.display_name,
        auth_manager=auth_manager,
        workspace_root=workspace_root,
        ui=ui,
        launch_editor=launch_editor,
    )
    if isinstance(discovery_result, LoginResult):
        return discovery_result

    _stored = auth_manager.get_stored_tokens(provider_id)
    _api_base = _stored.extra.get("api_base") if _stored else None
    persisted = persist_discovered_models(
        provider.id,
        discovery_result.models,
        suggestions=discovery_result.suggestions,
        base_url=_api_base,
    )
    return _build_login_success_result(
        provider.id,
        display_name=provider.display_name,
        models_discovered=persisted.models_discovered,
        workspace_root=workspace_root,
        ui=ui,
        launch_editor=launch_editor,
    )
