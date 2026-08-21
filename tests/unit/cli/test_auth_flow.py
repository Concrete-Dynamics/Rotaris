from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rotaris_core.auth.manager import AuthenticationError
from rotaris_core.auth.provider import AuthStatus
from rotaris_core.cli.auth_flow import run_login
from rotaris_core.config import loader
from rotaris_core.config.project_snapshot import read_snapshot, snapshot_path
from rotaris_core.providers.discovery import DiscoveredModel, DiscoveryResult
from rotaris_core.reqtocode import SWR, verifies


@dataclass
class AuthState:
    status: AuthStatus = AuthStatus.UNAUTHENTICATED
    authenticate_calls: int = 0
    logout_calls: int = 0
    token: str = "token"
    auth_error: Exception | None = None
    prompt: object | None = None
    has_stored_tokens: bool = False


class FakeAuthManager:
    state = AuthState()

    def __init__(self) -> None:
        self.state = self.__class__.state

    async def check_status(self, provider_id: str) -> AuthStatus:
        return self.state.status

    async def authenticate(self, provider_id: str, *, on_prompt: Any | None = None) -> object:
        self.state.authenticate_calls += 1
        if self.state.auth_error is not None:
            raise self.state.auth_error
        if self.state.prompt is not None and on_prompt is not None:
            await on_prompt(self.state.prompt)
        self.state.status = AuthStatus.AUTHENTICATED
        self.state.has_stored_tokens = True
        return object()

    async def get_token(self, provider_id: str) -> str:
        return self.state.token

    def logout(self, provider_id: str) -> None:
        self.state.logout_calls += 1
        self.state.status = AuthStatus.UNAUTHENTICATED
        self.state.has_stored_tokens = False

    def get_stored_tokens(self, provider_id: str) -> object | None:
        if not self.state.has_stored_tokens:
            return None
        return type("StoredTokens", (), {"extra": {}, "account_id": None})()


class FakeUI:
    def __init__(
        self,
        *,
        providers: list[str | None] | None = None,
        recoveries: list[str] | None = None,
        confirms: list[bool] | None = None,
    ) -> None:
        self.providers = providers or []
        self.recoveries = recoveries or []
        self.confirms = confirms or [False]
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.infos: list[str] = []
        self.auth_prompts: list[tuple[str, str, str]] = []
        self.provider_option_calls: list[list[tuple[str, str]]] = []
        self.text_responses: list[str | None] = []
        self.secret_responses: list[str | None] = []
        self.model_choices: list[str | None] = []
        self.model_prompt_calls: list[tuple[str, list[tuple[str, str]], str | None, bool]] = []

    def choose_provider(self, options: list[tuple[str, str]]) -> str | None:
        self.provider_option_calls.append(list(options))
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
        if self.model_choices:
            return self.model_choices.pop(0)
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
        if self.confirms:
            return self.confirms.pop(0)
        return default

    def choose_recovery(self) -> str:
        return self.recoveries.pop(0)


def _model(model_id: str, *, provider_id: str = "copilot") -> DiscoveredModel:
    return DiscoveredModel(
        id=model_id,
        qualified_id=f"{provider_id}/{model_id}",
        display_name=model_id,
    )


def _install_fakes(
    monkeypatch: Any,
    discoveries: list[DiscoveryResult] | None = None,
    *,
    auth_state: AuthState | None = None,
    launched: list[Path] | None = None,
    global_config_dir: Path | None = None,
) -> None:
    FakeAuthManager.state = auth_state or AuthState()
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager", FakeAuthManager)
    if global_config_dir is not None:
        monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_config_dir)
        monkeypatch.setattr(
            "rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR",
            global_config_dir,
        )
    monkeypatch.setattr(
        "rotaris_core.auth.storage._get_default_token_dir",
        lambda: (
            (global_config_dir.parent if global_config_dir is not None else Path.cwd()) / "tokens"
        ),
    )
    queue = discoveries or [DiscoveryResult([_model("gpt-4o"), _model("gpt-4o-mini")], None, 200)]

    def fake_discover(
        provider_id: str,
        *,
        token: str,
        api_base: str | None = None,
        discovery_endpoint: str | None = None,
        qualified_provider_id: str | None = None,
        display_name: str | None = None,
        account_id: str | None = None,
        extra_headers: dict[str, str] | None = None,
        timeout: float = 10.0,
    ) -> DiscoveryResult:
        del token, api_base, discovery_endpoint, display_name, account_id, extra_headers, timeout
        result = queue.pop(0)
        models = [
            model.model_copy(
                update={"qualified_id": f"{qualified_provider_id or provider_id}/{model.id}"},
            )
            if model.qualified_id == model.id or qualified_provider_id is not None
            else model
            for model in result.models
        ]
        return DiscoveryResult(models, result.error, result.http_status)

    monkeypatch.setattr("rotaris_core.providers.discovery.discover_models", fake_discover)

    def fake_launch(path: Path, *, blocking: bool = False) -> object:
        if launched is not None:
            launched.append(path)
        return type("Result", (), {"launched": True, "error": None})()

    monkeypatch.setattr("rotaris_core.cli.editor_launcher.launch_editor", fake_launch)


@verifies(SWR.SWR_707)
def test_run_login_explicit_provider_happy_path(monkeypatch: Any, tmp_path: Path) -> None:
    global_dir = tmp_path / "global-config"
    _install_fakes(monkeypatch, global_config_dir=global_dir)

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=FakeUI())

    assert result.success is True
    assert result.models_discovered == 2
    assert result.bootstrap_written is True
    assert (tmp_path / ".rotaris" / "agents.yaml").exists()
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    assert snapshot.providers["copilot"].authenticated is True
    assert [model.id for model in snapshot.providers["copilot"].models] == [
        "copilot/gpt-4o",
        "copilot/gpt-4o-mini",
    ]


@verifies(SWR.SWR_707, SWR.SWR_730)
def test_run_login_menu_selects_provider(monkeypatch: Any, tmp_path: Path) -> None:
    _install_fakes(monkeypatch)

    ui = FakeUI(providers=["copilot"])
    result = run_login(
        None,
        workspace_root=tmp_path,
        reauth=False,
        ui=ui,
    )

    assert result.success is True
    assert result.provider_id == "copilot"
    assert ("codex", "OpenAI Codex (Sign in with ChatGPT)") in ui.provider_option_calls[0]


@verifies(SWR.SWR_707)
def test_run_login_codex_auth_prompt_says_sign_in_with_chatgpt(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    state = AuthState(prompt="https://example.test/login")
    _install_fakes(monkeypatch, auth_state=state)
    ui = FakeUI()

    result = run_login("codex", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert ui.auth_prompts == [
        (
            "https://example.test/login",
            "",
            "Sign in with ChatGPT to authenticate Codex.",
        ),
    ]


@verifies(SWR.SWR_707, SWR.SWR_730)
def test_run_login_menu_cancelled(tmp_path: Path) -> None:
    result = run_login(None, workspace_root=tmp_path, reauth=False, ui=FakeUI(providers=[None]))

    assert result.success is False
    assert result.message == "cancelled"


@verifies(SWR.SWR_707)
def test_run_login_unknown_provider(monkeypatch: Any, tmp_path: Path) -> None:
    state = AuthState()
    _install_fakes(monkeypatch, auth_state=state)
    ui = FakeUI()

    result = run_login("bogus", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert state.authenticate_calls == 0
    assert ui.errors == ["Unknown provider: bogus"]


@verifies(SWR.SWR_707, SWR.SWR_742)
def test_run_login_skip_when_authenticated_no_reauth(monkeypatch: Any, tmp_path: Path) -> None:
    state = AuthState(status=AuthStatus.AUTHENTICATED, has_stored_tokens=True)
    _install_fakes(monkeypatch, auth_state=state)

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=FakeUI())

    assert result.success is True
    assert state.authenticate_calls == 0
    assert state.logout_calls == 0


@verifies(SWR.SWR_707)
def test_run_login_forces_reauth(monkeypatch: Any, tmp_path: Path) -> None:
    state = AuthState(status=AuthStatus.AUTHENTICATED, has_stored_tokens=True)
    _install_fakes(monkeypatch, auth_state=state)

    ui = FakeUI()
    result = run_login("copilot", workspace_root=tmp_path, reauth=True, ui=ui)
    assert result.success is True
    assert state.logout_calls == 1
    assert state.authenticate_calls == 1
    assert ui.infos == ["Discarded stored authentication for GitHub Copilot."]


@verifies(SWR.SWR_707)
def test_run_login_expired_status_reauthenticates(monkeypatch: Any, tmp_path: Path) -> None:
    state = AuthState(status=AuthStatus.EXPIRED)
    _install_fakes(monkeypatch, auth_state=state)

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=FakeUI())

    assert result.success is True
    assert state.authenticate_calls == 1


@verifies(SWR.SWR_707)
def test_run_login_auth_error(monkeypatch: Any, tmp_path: Path) -> None:
    _install_fakes(monkeypatch, auth_state=AuthState(auth_error=AuthenticationError("denied")))
    ui = FakeUI()

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert ui.errors == ["denied"]


@verifies(SWR.SWR_707, SWR.SWR_744)
def test_run_login_empty_discovery_retry_then_advanced_config(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    _install_fakes(
        monkeypatch,
        discoveries=[DiscoveryResult([], None, 200), DiscoveryResult([], None, 200)],
        global_config_dir=global_dir,
    )

    result = run_login(
        "copilot",
        workspace_root=tmp_path,
        reauth=False,
        ui=FakeUI(recoveries=["retry", "advanced-config"]),
    )

    assert result.success is False
    assert result.models_discovered == 0
    assert result.message == "manual config required"
    assert read_snapshot(global_dir) is None


@verifies(SWR.SWR_707, SWR.SWR_741)
def test_run_login_empty_discovery_abort(monkeypatch: Any, tmp_path: Path) -> None:
    _install_fakes(monkeypatch, discoveries=[DiscoveryResult([], None, 200)])

    result = run_login(
        "copilot",
        workspace_root=tmp_path,
        reauth=False,
        ui=FakeUI(recoveries=["abort"]),
    )

    assert result.success is False


@verifies(SWR.SWR_707)
def test_run_login_discovery_error(monkeypatch: Any, tmp_path: Path) -> None:
    global_dir = tmp_path / "global-config"
    _install_fakes(
        monkeypatch,
        discoveries=[DiscoveryResult([], "HTTP 500", 500)],
        global_config_dir=global_dir,
    )
    ui = FakeUI()

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert "HTTP 500" in ui.errors[0]
    assert not snapshot_path(global_dir).exists()


@verifies(SWR.SWR_707)
def test_run_login_openai_compatible_persists_instance_and_assignments(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    _install_fakes(
        monkeypatch,
        discoveries=[
            DiscoveryResult(
                [
                    _model("gpt-4.1", provider_id="placeholder"),
                    _model("gpt-4.1-mini", provider_id="placeholder"),
                ],
                None,
                200,
            ),
        ],
        global_config_dir=global_dir,
    )
    ui = FakeUI(confirms=[True, False, False])
    ui.text_responses = ["Local Model", "http://localhost:1234/v1"]
    ui.secret_responses = ["secret-key"]
    ui.model_choices = [
        "openai-compatible--local-model/gpt-4.1-mini",
        "openai-compatible--local-model/gpt-4.1-mini",
        "openai-compatible--local-model/gpt-4.1-mini",
        "openai-compatible--local-model/gpt-4.1-mini",
        "openai-compatible--local-model/gpt-4.1-mini",
        "openai-compatible--local-model/gpt-4.1-mini",
    ]

    result = run_login("openai-compatible", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    provider = snapshot.providers["openai-compatible--local-model"]
    assert provider.display_name == "Local Model"
    assert provider.family == "openai-compatible"
    assert provider.base_url == "http://localhost:1234/v1"
    assert {model.id for model in provider.models} == {
        "openai-compatible--local-model/gpt-4.1",
        "openai-compatible--local-model/gpt-4.1-mini",
    }
    agents_yaml = (tmp_path / ".rotaris" / "agents.yaml").read_text(encoding="utf-8")
    assert "openai-compatible--local-model/gpt-4.1-mini" in agents_yaml
    assert "default_summary_model_thinking" not in agents_yaml


@verifies(SWR.SWR_707)
def test_run_login_openai_compatible_model_prompt_uses_all_known_models(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    _install_fakes(
        monkeypatch,
        discoveries=[
            DiscoveryResult(
                [
                    _model("gpt-5", provider_id="copilot"),
                    _model("gpt-5-mini", provider_id="copilot"),
                    _model("gpt-5-nano", provider_id="copilot"),
                ],
                None,
                200,
            ),
        ],
        global_config_dir=global_dir,
    )
    first = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=FakeUI())
    assert first.success is True

    _install_fakes(
        monkeypatch,
        discoveries=[
            DiscoveryResult(
                [
                    _model("gpt-4.1", provider_id="placeholder"),
                    _model("gpt-4.1-mini", provider_id="placeholder"),
                ],
                None,
                200,
            ),
        ],
        global_config_dir=global_dir,
    )
    ui = FakeUI(confirms=[True, False, False])
    ui.text_responses = ["Local Model", "http://localhost:1234/v1"]
    ui.secret_responses = ["secret-key"]

    result = run_login("openai-compatible", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert ui.model_prompt_calls
    option_ids = {model_id for model_id, _label in ui.model_prompt_calls[0][1]}
    assert "copilot/gpt-5" in option_ids
    assert "openai-compatible--local-model/gpt-4.1" in option_ids
    config = loader.load_config(tmp_path)
    assert config.small_model == "copilot/gpt-5-nano"
    assert config.medium_model == "copilot/gpt-5-mini"
    assert config.large_model == "copilot/gpt-5"


@verifies(SWR.SWR_707)
def test_run_login_discovery_auth_error_discards_stored_auth(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    global_dir = tmp_path / "global-config"
    state = AuthState(status=AuthStatus.AUTHENTICATED, has_stored_tokens=True)
    _install_fakes(
        monkeypatch,
        discoveries=[DiscoveryResult([], "Authentication failed for GitHub Copilot: 403", 403)],
        auth_state=state,
        global_config_dir=global_dir,
    )
    ui = FakeUI()

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert state.logout_calls == 1
    assert state.has_stored_tokens is False
    assert ui.warnings == ["Discarded stored authentication for GitHub Copilot."]
    assert "Authentication failed for GitHub Copilot: 403" in ui.errors[0]
    assert not snapshot_path(global_dir).exists()


@verifies(SWR.SWR_707, SWR.SWR_737)
def test_run_login_bootstrap_skipped_when_file_exists(monkeypatch: Any, tmp_path: Path) -> None:
    agents_yaml = tmp_path / ".rotaris" / "agents.yaml"
    agents_yaml.parent.mkdir(parents=True)
    agents_yaml.write_text("default_persona: orchestrator\n", encoding="utf-8")
    _install_fakes(monkeypatch)

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=FakeUI())

    assert result.success is True
    assert result.bootstrap_written is False


@verifies(SWR.SWR_707, SWR.SWR_735)
def test_run_login_advanced_editor_launched_when_confirmed(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    launched: list[Path] = []
    _install_fakes(monkeypatch, launched=launched)

    result = run_login(
        "copilot",
        workspace_root=tmp_path,
        reauth=False,
        ui=FakeUI(confirms=[True]),
    )

    assert result.advanced_editor_launched is True
    assert launched == [tmp_path / ".rotaris" / "agents.yaml"]


@verifies(SWR.SWR_707, SWR.SWR_734, SWR.SWR_736)
def test_run_login_advanced_editor_skipped_when_declined(
    monkeypatch: Any,
    tmp_path: Path,
) -> None:
    launched: list[Path] = []
    _install_fakes(monkeypatch, launched=launched)

    result = run_login(
        "copilot",
        workspace_root=tmp_path,
        reauth=False,
        ui=FakeUI(confirms=[False]),
    )

    assert result.advanced_editor_launched is False
    assert launched == []


@verifies(SWR.SWR_707)
def test_run_login_auth_prompt_callback_invoked(monkeypatch: Any, tmp_path: Path) -> None:
    state = AuthState(prompt="https://example.test/login")
    _install_fakes(monkeypatch, auth_state=state)
    ui = FakeUI()

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is True
    assert ui.auth_prompts == [
        (
            "https://example.test/login",
            "",
            "Open https://example.test/login to authenticate.",
        ),
    ]


@verifies(SWR.SWR_707, SWR.SWR_743)
def test_run_login_editor_launch_failure_surfaces(monkeypatch: Any, tmp_path: Path) -> None:
    _install_fakes(monkeypatch)
    ui = FakeUI(confirms=[True])

    def fake_launch(path: Path, *, blocking: bool = False) -> object:
        return type("Result", (), {"launched": False, "error": "editor not found"})()

    monkeypatch.setattr("rotaris_core.cli.editor_launcher.launch_editor", fake_launch)

    result = run_login("copilot", workspace_root=tmp_path, reauth=False, ui=ui)

    assert result.success is False
    assert result.advanced_editor_launched is False
    assert ui.errors == ["Editor failed: editor not found"]
