from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.auth.provider import AuthStatus
from rotaris_core.cli.auth_flow import LoginResult, LoginUI, run_login
from rotaris_core.config import loader, validation
from rotaris_core.config.project_snapshot import (
    ProjectSnapshot,
    SnapshotModel,
    SnapshotProvider,
    read_snapshot,
    snapshot_path,
    write_snapshot,
)
from rotaris_core.providers.catalog import list_providers
from rotaris_core.providers.discovery import DiscoveredModel, DiscoveryResult
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


@dataclass
class AuthState:
    status: AuthStatus = AuthStatus.UNAUTHENTICATED
    token: str = "ghu_test"
    authenticate_calls: int = 0
    check_status_calls: int = 0
    get_token_calls: int = 0
    prompt: object | None = None


class RecordingAuthManager:
    state = AuthState()

    def __init__(self) -> None:
        self.state = self.__class__.state

    async def check_status(self, provider_id: str) -> AuthStatus:
        self.state.check_status_calls += 1
        return self.state.status

    async def authenticate(self, provider_id: str, *, on_prompt: Any | None = None) -> object:
        self.state.authenticate_calls += 1
        if self.state.prompt is not None and on_prompt is not None:
            await on_prompt(self.state.prompt)
        self.state.status = AuthStatus.AUTHENTICATED
        return object()

    async def get_token(self, provider_id: str) -> str:
        self.state.get_token_calls += 1
        return self.state.token

    def get_stored_tokens(self, provider_id: str) -> object | None:
        del provider_id
        return (
            type("StoredTokens", (), {"extra": {}, "account_id": None})()
            if self.state.status
            else None
        )

    def logout(self, provider_id: str) -> None:
        del provider_id
        self.state.status = AuthStatus.UNAUTHENTICATED


@dataclass(frozen=True)
class RecordingUI(LoginUI):
    providers: list[str | None] = field(default_factory=list)
    recoveries: list[str] = field(default_factory=list)
    confirms: list[bool] = field(default_factory=lambda: [False])
    provider_options: list[list[tuple[str, str]]] = field(default_factory=list)
    infos: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    confirm_prompts: list[tuple[str, bool]] = field(default_factory=list)
    auth_prompts: list[tuple[str, str, str]] = field(default_factory=list)
    text_responses: list[str | None] = field(default_factory=list)
    secret_responses: list[str | None] = field(default_factory=list)
    model_selections: list[str | None] = field(default_factory=list)
    model_prompt_calls: list[tuple[str, list[tuple[str, str]], str | None, bool]] = field(
        default_factory=list,
    )

    def choose_provider(self, options: list[tuple[str, str]]) -> str | None:
        self.provider_options.append(options)
        return self.providers.pop(0)

    def info(self, message: str) -> None:
        self.infos.append(message)

    def prompt_text(self, prompt: str, *, default: str | None = None) -> str | None:
        del prompt
        if self.text_responses:
            return self.text_responses.pop(0)
        return default

    def prompt_secret(self, prompt: str) -> str | None:
        del prompt
        if self.secret_responses:
            return self.secret_responses.pop(0)
        return None

    def choose_model(
        self,
        prompt: str,
        options: list[tuple[str, str]],
        *,
        default: str | None = None,
        allow_skip: bool = False,
    ) -> str | None:
        self.model_prompt_calls.append((prompt, list(options), default, allow_skip))
        if self.model_selections:
            return self.model_selections.pop(0)
        return default

    def show_auth_prompt(
        self,
        *,
        verification_url: str,
        user_code: str,
        message: str,
    ) -> None:
        self.auth_prompts.append((verification_url, user_code, message))

    def warning(self, message: str) -> None:
        self.warnings.append(message)

    def error(self, message: str) -> None:
        self.errors.append(message)

    def confirm(self, prompt: str, *, default: bool = False) -> bool:
        self.confirm_prompts.append((prompt, default))
        if self.confirms:
            return self.confirms.pop(0)
        return default

    def choose_recovery(self) -> str:
        return self.recoveries.pop(0)


def _model(model_id: str, *, display_name: str | None = None) -> DiscoveredModel:
    return DiscoveredModel(
        id=model_id,
        display_name=display_name or model_id,
        capabilities={"chat": True},
        limits={"context_window": 128_000},
    )


def _copilot_models() -> list[DiscoveredModel]:
    return [
        _model("gpt-5", display_name="GPT-5"),
        _model("gpt-5-mini", display_name="GPT-5 mini"),
        _model("gpt-5-nano", display_name="GPT-5 nano"),
        _model("o4-mini", display_name="o4 mini"),
        _model("claude-sonnet-4", display_name="Claude Sonnet 4"),
    ]


def _codex_models() -> list[DiscoveredModel]:
    return [
        _model("gpt-5", display_name="GPT-5"),
        _model("gpt-5-mini", display_name="GPT-5 mini"),
        _model("gpt-5-nano", display_name="GPT-5 nano"),
    ]


def _install_onboarding_fakes(
    monkeypatch: Any,
    tmp_path: Path,
    discoveries: DiscoveryResult | list[DiscoveryResult],
    *,
    auth_state: AuthState | None = None,
    launched: list[tuple[Path, bool]] | None = None,
    patch_global_config: bool = True,
) -> AuthState:
    state = auth_state or AuthState()
    RecordingAuthManager.state = state
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager", RecordingAuthManager)
    if patch_global_config:
        monkeypatch.setattr(
            "rotaris_core.config.loader.GLOBAL_CONFIG_DIR", tmp_path / "global-config"
        )
        monkeypatch.setattr(
            "rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR",
            tmp_path / "global-config",
        )
    monkeypatch.setattr(
        "rotaris_core.auth.storage._get_default_token_dir",
        lambda: tmp_path / "tokens",
    )

    discovery_queue = discoveries if isinstance(discoveries, list) else [discoveries]

    def fake_discover(
        provider_id: str,
        *,
        token: str,
        api_base: str | None = None,
        discovery_endpoint: str | None = None,
        qualified_provider_id: str | None = None,
        display_name: str | None = None,
        account_id: str | None = None,
        timeout: float = 10.0,
    ) -> DiscoveryResult:
        del token, api_base, discovery_endpoint, display_name, account_id, timeout
        result = discovery_queue[0] if len(discovery_queue) == 1 else discovery_queue.pop(0)
        models = [
            model.model_copy(update={"qualified_id": f"{provider_id}/{model.id}"})
            if model.qualified_id == model.id and qualified_provider_id is None
            else model.model_copy(update={"qualified_id": f"{qualified_provider_id}/{model.id}"})
            if qualified_provider_id is not None
            else model
            for model in result.models
        ]
        return DiscoveryResult(models, result.error, result.http_status)

    monkeypatch.setattr("rotaris_core.providers.discovery.discover_models", fake_discover)

    def fake_launch(path: Path, *, blocking: bool = False) -> object:
        if launched is not None:
            launched.append((path, blocking))
        return type("EditorResult", (), {"launched": True, "error": None})()

    monkeypatch.setattr("rotaris_core.cli.editor_launcher.launch_editor", fake_launch)
    return state


def _run_successful_login(
    monkeypatch: Any,
    tmp_path: Path,
    *,
    provider_id: str = "copilot",
    models: list[DiscoveredModel] | None = None,
    ui: RecordingUI | None = None,
) -> LoginResult:
    selected_models = models or _copilot_models()
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(selected_models, None, 200),
    )
    return run_login(provider_id, workspace_root=tmp_path, reauth=False, ui=ui or RecordingUI())


@verifies(SWR.SWR_1201)
def test_cold_start_to_working_config_copilot(monkeypatch: Any, tmp_path: Path) -> None:
    ui = RecordingUI()

    result = _run_successful_login(monkeypatch, tmp_path, ui=ui)

    assert result.success is True
    assert result.models_discovered == 5
    assert result.bootstrap_written is True
    assert (tmp_path / ".rotaris" / "agents.yaml").exists()
    assert snapshot_path(tmp_path / "global-config").exists()
    snapshot = read_snapshot(tmp_path / "global-config")
    assert snapshot is not None
    provider = snapshot.providers["copilot"]
    assert provider.id == "copilot"
    assert provider.authenticated is True
    assert {model.id for model in provider.models} == {
        "copilot/gpt-5",
        "copilot/gpt-5-mini",
        "copilot/gpt-5-nano",
        "copilot/o4-mini",
        "copilot/claude-sonnet-4",
    }

    config = loader.load_config(tmp_path)
    assert config.large_model == "copilot/gpt-5"
    assert config.medium_model == "copilot/gpt-5-mini"
    assert config.small_model == "copilot/gpt-5-nano"
    assert config.default_summary_model == "copilot/gpt-5-mini"
    assert config.models[config.large_model].auth_provider == "copilot"
    assert config.models[config.medium_model].auth_provider == "copilot"
    assert config.models[config.small_model].auth_provider == "copilot"


@verifies(SWR.SWR_1201, SWR.SWR_732)
def test_cold_start_codex_provider(monkeypatch: Any, tmp_path: Path) -> None:
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_codex_models(), None, 200),
    )

    result = run_login("codex", workspace_root=tmp_path, reauth=False, ui=RecordingUI())

    assert result.success is True
    assert result.models_discovered == 3
    snapshot = read_snapshot(tmp_path / "global-config")
    assert snapshot is not None
    assert snapshot.providers["codex"].authenticated is True
    config = loader.load_config(tmp_path)
    assert config.large_model == "codex/gpt-5"
    assert config.medium_model == "codex/gpt-5-mini"
    assert config.small_model == "codex/gpt-5-nano"
    assert config.models[config.large_model].auth_provider == "codex"
    assert config.models[config.medium_model].auth_provider == "codex"
    assert config.models[config.small_model].auth_provider == "codex"


@verifies(SWR.SWR_1201)
def test_login_then_run_command_simulation(monkeypatch: Any, tmp_path: Path) -> None:
    result = _run_successful_login(monkeypatch, tmp_path)

    config = loader.load_config(tmp_path)

    assert result.success is True
    assert validation.validate_config(config) == []


@verifies(SWR.SWR_1201)
def test_reauth_flag_forces_authenticate_call(monkeypatch: Any, tmp_path: Path) -> None:
    state = AuthState(status=AuthStatus.AUTHENTICATED)
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_copilot_models(), None, 200),
        auth_state=state,
    )

    first = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=RecordingUI())
    second = run_login("copilot", workspace_root=tmp_path, reauth=True, ui=RecordingUI())

    assert first.success is True
    assert second.success is True
    assert state.authenticate_calls == 1


@verifies(SWR.SWR_1201, SWR.SWR_741)
def test_empty_discovery_continue_recovery(monkeypatch: Any, tmp_path: Path) -> None:
    _install_onboarding_fakes(monkeypatch, tmp_path, DiscoveryResult([], None, 200))
    ui = RecordingUI(recoveries=["continue"], confirms=[False])

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert result.models_discovered == 0
    assert result.bootstrap_written is True
    assert result.message == "manual config required"
    assert result.advanced_editor_launched is True
    assert read_snapshot(tmp_path / "global-config") is None


@verifies(SWR.SWR_1201)
def test_empty_discovery_abort_recovery(monkeypatch: Any, tmp_path: Path) -> None:
    _install_onboarding_fakes(monkeypatch, tmp_path, DiscoveryResult([], None, 200))
    ui = RecordingUI(recoveries=["abort"])

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert not snapshot_path(tmp_path / "global-config").exists()
    assert not (tmp_path / ".rotaris" / "agents.yaml").exists()


@verifies(SWR.SWR_1201)
def test_existing_agents_yaml_not_overwritten(monkeypatch: Any, tmp_path: Path) -> None:
    agents_yaml = tmp_path / ".rotaris" / "agents.yaml"
    agents_yaml.parent.mkdir(parents=True)
    agents_yaml.write_text("# user-customized\ndefault_persona: orchestrator\n", encoding="utf-8")

    result = _run_successful_login(monkeypatch, tmp_path)

    assert result.success is True
    assert result.bootstrap_written is False
    assert agents_yaml.read_text(encoding="utf-8").startswith("# user-customized")


@verifies(SWR.SWR_1201, SWR.SWR_735)
def test_advanced_editor_launched_when_user_confirms(monkeypatch: Any, tmp_path: Path) -> None:
    launched: list[tuple[Path, bool]] = []
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_copilot_models(), None, 200),
        launched=launched,
    )
    ui = RecordingUI(confirms=[True])

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert result.advanced_editor_launched is True
    assert launched == [(tmp_path / ".rotaris" / "agents.yaml", True)]


@verifies(SWR.SWR_1201)
def test_provider_menu_lists_all_catalog_providers(monkeypatch: Any, tmp_path: Path) -> None:
    _install_onboarding_fakes(monkeypatch, tmp_path, DiscoveryResult(_copilot_models(), None, 200))
    ui = RecordingUI(providers=["copilot"])

    result = run_login(None, workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert ui.provider_options
    option_ids = {provider_id for provider_id, _ in ui.provider_options[0]}
    assert {provider.id for provider in list_providers()} <= option_ids
    assert {"copilot", "codex"} <= option_ids


@verifies(SWR.SWR_1201)
def test_unknown_provider_no_side_effects(monkeypatch: Any, tmp_path: Path) -> None:
    state = _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_copilot_models(), None, 200),
    )
    ui = RecordingUI()

    result = run_login("bogus", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert state.authenticate_calls == 0
    assert not snapshot_path(tmp_path / "global-config").exists()
    assert not (tmp_path / ".rotaris" / "agents.yaml").exists()


@verifies(SWR.SWR_1201)
def test_empty_discovery_try_other_provider_succeeds(monkeypatch: Any, tmp_path: Path) -> None:
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        [
            DiscoveryResult([], None, 200),
            DiscoveryResult(_codex_models(), None, 200),
        ],
    )
    ui = RecordingUI(providers=["codex"], recoveries=["try-other-provider"])

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert result.provider_id == "codex"
    snapshot = read_snapshot(tmp_path / "global-config")
    assert snapshot is not None
    assert set(snapshot.providers) == {"codex"}
    assert {model.id for model in snapshot.providers["codex"].models} == {
        "codex/gpt-5",
        "codex/gpt-5-mini",
        "codex/gpt-5-nano",
    }


@verifies(SWR.SWR_1201, SWR.SWR_731)
def test_second_provider_login_preserves_first_provider_snapshot(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_copilot_models(), None, 200),
    )
    first = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=RecordingUI())

    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_codex_models(), None, 200),
    )
    second = run_login("codex", workspace_root=tmp_path, reauth=False, ui=RecordingUI())

    assert first.success is True
    assert second.success is True
    snapshot = read_snapshot(tmp_path / "global-config")
    assert snapshot is not None
    assert set(snapshot.providers) == {"copilot", "codex"}
    assert snapshot.providers["copilot"].large_model == "copilot/gpt-5"
    assert snapshot.providers["codex"].large_model == "codex/gpt-5"
    assert {model.id for model in snapshot.providers["copilot"].models} >= {"copilot/gpt-5"}
    assert {model.id for model in snapshot.providers["codex"].models} >= {"codex/gpt-5"}


@verifies(SWR.SWR_1201, SWR.SWR_733)
def test_openai_compatible_login_writes_instance_snapshot_and_assignments(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(
            [
                _model("gpt-4.1", display_name="GPT-4.1"),
                _model("gpt-4.1-mini", display_name="GPT-4.1 mini"),
            ],
            None,
            200,
        ),
    )
    ui = RecordingUI(confirms=[True, False, False])
    ui.text_responses.extend(["Lab", "http://localhost:11434/v1"])
    ui.secret_responses.append("api-key")
    for _ in range(6):
        ui.model_selections.append("openai-compatible--lab/gpt-4.1-mini")

    result = run_login("openai-compatible", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    snapshot = read_snapshot(tmp_path / "global-config")
    assert snapshot is not None
    provider = snapshot.providers["openai-compatible--lab"]
    assert provider.family == "openai-compatible"
    assert provider.base_url == "http://localhost:11434/v1"
    config = loader.load_config(tmp_path)
    assert config.small_model == "openai-compatible--lab/gpt-4.1-mini"
    assert config.models[config.small_model].model_id == "gpt-4.1-mini"
    assert config.models[config.small_model].base_url == "http://localhost:11434/v1"
    assert config.models[config.small_model].thinking is None


@verifies(SWR.SWR_1201)
def test_openai_compatible_login_model_prompt_includes_existing_provider_models(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_copilot_models(), None, 200),
    )
    first = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=RecordingUI())
    assert first.success is True

    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(
            [
                _model("gpt-4.1", display_name="GPT-4.1"),
                _model("gpt-4.1-mini", display_name="GPT-4.1 mini"),
            ],
            None,
            200,
        ),
    )
    ui = RecordingUI(confirms=[True, False, False])
    ui.text_responses.extend(["Lab", "http://localhost:11434/v1"])
    ui.secret_responses.append("api-key")

    result = run_login("openai-compatible", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert ui.model_prompt_calls
    option_ids = {model_id for model_id, _label in ui.model_prompt_calls[0][1]}
    assert "copilot/gpt-5" in option_ids
    assert "openai-compatible--lab/gpt-4.1" in option_ids
    config = loader.load_config(tmp_path)
    assert config.small_model == "copilot/gpt-5-nano"
    assert config.medium_model == "copilot/gpt-5-mini"
    assert config.large_model == "copilot/gpt-5"


@verifies(SWR.SWR_1201)
def test_bootstrap_writes_all_required_startup_keys(monkeypatch: Any, tmp_path: Path) -> None:
    result = _run_successful_login(monkeypatch, tmp_path)

    raw = (tmp_path / ".rotaris" / "agents.yaml").read_text(encoding="utf-8")

    assert result.success is True
    for key in (
        "default_persona",
        "default_summary_model",
        "large_model",
        "medium_model",
        "small_model",
        "fallback_model",
    ):
        assert f"{key}:" in raw
    assert validation.validate_config(loader.load_config(tmp_path)) == []


@verifies(SWR.SWR_1201, SWR.SWR_725)
def test_global_config_dir_created_on_login(monkeypatch: Any, tmp_path: Path) -> None:
    home = tmp_path / "home"
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setattr(
        "rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR",
        tmp_path / "fake-global",
    )
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_copilot_models(), None, 200),
        patch_global_config=False,
    )

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=RecordingUI())

    assert result.success is True
    assert (home / ".config" / "rotaris").is_dir()


@verifies(SWR.SWR_1201)
def test_auth_prompt_callback_invoked(monkeypatch: Any, tmp_path: Path) -> None:
    state = AuthState(prompt="https://example.test/device")
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult(_copilot_models(), None, 200),
        auth_state=state,
    )
    ui = RecordingUI()

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert ui.auth_prompts == [
        (
            "https://example.test/device",
            "",
            "Open https://example.test/device to authenticate.",
        ),
    ]


@verifies(SWR.SWR_1201, SWR.SWR_743)
def test_editor_launch_failure_surfaces(monkeypatch: Any, tmp_path: Path) -> None:
    _install_onboarding_fakes(monkeypatch, tmp_path, DiscoveryResult(_copilot_models(), None, 200))
    ui = RecordingUI(confirms=[True])

    def fake_launch(path: Path, *, blocking: bool = False) -> object:
        return type("EditorResult", (), {"launched": False, "error": "editor not found"})()

    monkeypatch.setattr("rotaris_core.cli.editor_launcher.launch_editor", fake_launch)

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert result.advanced_editor_launched is False
    assert ui.errors == ["Editor failed: editor not found"]


@verifies(SWR.SWR_1201)
def test_user_defined_model_entry_not_mutated(monkeypatch: Any, tmp_path: Path) -> None:
    agents_yaml = tmp_path / ".rotaris" / "agents.yaml"
    agents_yaml.parent.mkdir(parents=True)
    agents_yaml.write_text(
        """default_persona: orchestrator
models:
  my-gpt-5:
    provider: openai
    model_id: gpt-5
    api_key: user-key
""",
        encoding="utf-8",
    )
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult([_model("gpt-5", display_name="GPT-5")], None, 200),
    )

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=RecordingUI())

    assert result.success is True
    config = loader.load_config(tmp_path)
    assert config.models["my-gpt-5"].api_key is not None
    assert config.models["my-gpt-5"].api_key.get_secret_value() == "user-key"
    assert config.models["my-gpt-5"].auth_provider is None
    assert config.models["copilot/gpt-5"].auth_provider == "copilot"


@verifies(SWR.SWR_1201)
def test_snapshot_scrubs_bearer_token(tmp_path: Path) -> None:
    snapshot = ProjectSnapshot(
        providers={
            "copilot": SnapshotProvider(
                id="copilot",
                display_name="GitHub Copilot",
                authenticated=True,
                discovered_at="2026-05-11T00:00:00+00:00",
                models=[
                    SnapshotModel(
                        id="copilot/gpt-5",
                        display_name="GPT-5",
                        capabilities={"notes": "Bearer ghu_xxx"},
                        limits={},
                        discovered_at="2026-05-11T00:00:00+00:00",
                    ),
                ],
            ),
        },
    )

    with pytest.raises(ValueError, match="secret-like field detected"):
        write_snapshot(snapshot, base=tmp_path)


@verifies(SWR.SWR_1201)
def test_post_login_validation_warns_on_unresolvable_summary(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    ui = RecordingUI()
    _install_onboarding_fakes(
        monkeypatch,
        tmp_path,
        DiscoveryResult([_model("codex-mini", display_name="Codex mini")], None, 200),
    )

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    config = loader.load_config(tmp_path)
    assert config.default_summary_model == "copilot/codex-mini"
    assert validation.validate_config(config) == []
    assert ui.warnings == []
