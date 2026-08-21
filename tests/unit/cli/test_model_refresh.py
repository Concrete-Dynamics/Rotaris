from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from rotaris_core.auth.provider import AuthStatus
from rotaris_core.cli.model_refresh import run_refresh_models
from rotaris_core.config.project_snapshot import (
    ProjectSnapshot,
    SnapshotModel,
    SnapshotProvider,
    read_snapshot,
    snapshot_path,
    write_snapshot,
)
from rotaris_core.providers.discovery import DiscoveredModel, DiscoveryResult
from rotaris_core.reqtocode import SWR, verifies


@dataclass
class ProviderState:
    status: AuthStatus = AuthStatus.AUTHENTICATED
    token: str = "token"
    has_stored_tokens: bool = True
    last_error: str | None = None
    logout_calls: int = 0
    extra: dict[str, str] = field(default_factory=dict)
    account_id: str | None = None


class FakeAuthManager:
    states: dict[str, ProviderState] = {}

    def __init__(self) -> None:
        self.states = self.__class__.states

    def is_authenticated(self, provider_id: str) -> bool:
        state = self.states.get(provider_id)
        return state is not None and state.has_stored_tokens

    async def check_status(self, provider_id: str) -> AuthStatus:
        state = self.states.get(provider_id)
        if state is None:
            return AuthStatus.UNAUTHENTICATED
        return state.status

    async def get_token(self, provider_id: str) -> str | None:
        state = self.states.get(provider_id)
        return None if state is None else state.token

    def get_stored_tokens(self, provider_id: str) -> object | None:
        state = self.states.get(provider_id)
        if state is None or not state.has_stored_tokens:
            return None
        return type(
            "StoredTokens",
            (),
            {"extra": state.extra, "account_id": state.account_id},
        )()

    def logout(self, provider_id: str) -> None:
        state = self.states[provider_id]
        state.logout_calls += 1
        state.status = AuthStatus.UNAUTHENTICATED
        state.has_stored_tokens = False

    def get_last_error(self, provider_id: str) -> str | None:
        state = self.states.get(provider_id)
        return None if state is None else state.last_error


class FakeUI:
    def __init__(self) -> None:
        self.infos: list[str] = []
        self.warnings: list[str] = []
        self.errors: list[str] = []

    def info(self, message: str) -> None:
        self.infos.append(message)

    def warning(self, message: str) -> None:
        self.warnings.append(message)

    def error(self, message: str) -> None:
        self.errors.append(message)


def _model(model_id: str, *, provider_id: str) -> DiscoveredModel:
    return DiscoveredModel(
        id=model_id,
        qualified_id=f"{provider_id}/{model_id}",
        display_name=model_id,
    )


def _install_fakes(
    monkeypatch: Any,
    *,
    global_config_dir: Any,
    discoveries: dict[str, DiscoveryResult],
    states: dict[str, ProviderState],
    expected_tokens: dict[str, str] | None = None,
) -> list[str]:
    FakeAuthManager.states = states
    monkeypatch.setattr("rotaris_core.auth.manager.AuthManager", FakeAuthManager)
    monkeypatch.setattr("rotaris_core.config.loader.GLOBAL_CONFIG_DIR", global_config_dir)
    monkeypatch.setattr(
        "rotaris_core.config.project_snapshot._GLOBAL_CONFIG_DIR", global_config_dir
    )
    provider_ids = list(dict.fromkeys([*discoveries, *states]))
    monkeypatch.setattr(
        "rotaris_core.providers.catalog.list_providers",
        lambda: [SimpleNamespace(id=provider_id) for provider_id in provider_ids],
    )
    calls: list[str] = []

    def fake_discover(
        provider_id: str,
        *,
        token: str,
        **_kwargs: object,
    ) -> DiscoveryResult:
        expected_token = (
            "token" if expected_tokens is None else expected_tokens.get(provider_id, "token")
        )
        assert token == expected_token
        calls.append(provider_id)
        return discoveries[provider_id]

    monkeypatch.setattr("rotaris_core.providers.discovery.discover_models", fake_discover)
    return calls


@verifies(SWR.SWR_727, SWR.SWR_821, SWR.SWR_822)
def test_run_refresh_models_single_provider_updates_snapshot(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    global_dir = tmp_path / "global-config"
    calls = _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={
            "copilot": DiscoveryResult(
                [_model("gpt-4o", provider_id="copilot")],
                None,
                200,
            ),
        },
        states={"copilot": ProviderState()},
    )
    ui = FakeUI()

    result = run_refresh_models("copilot", workspace_root=tmp_path, ui=ui)

    assert result.success is True
    assert calls == ["copilot"]
    assert result.message == "Refresh complete: 1 provider succeeded."
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    assert [model.id for model in snapshot.providers["copilot"].models] == ["copilot/gpt-4o"]
    assert any("Refreshed GitHub Copilot; discovered 1 model." in msg for msg in ui.infos)


@verifies(SWR.SWR_727, SWR.SWR_822)
def test_run_refresh_models_preserves_previous_models_missing_from_response(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    global_dir = tmp_path / "global-config"
    global_dir.mkdir()
    discovered_at = "2026-05-11T00:00:00+00:00"
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": SnapshotProvider(
                    id="copilot",
                    display_name="GitHub Copilot",
                    family="copilot",
                    authenticated=True,
                    models=[
                        SnapshotModel(
                            id="copilot/gpt-5.5",
                            display_name="gpt-5.5",
                            discovered_at=discovered_at,
                        ),
                        SnapshotModel(
                            id="copilot/claude-sonnet-4.6",
                            display_name="claude-sonnet-4.6",
                            discovered_at=discovered_at,
                        ),
                    ],
                    large_model="copilot/gpt-5.5",
                    medium_model="copilot/claude-sonnet-4.6",
                    small_model="copilot/claude-sonnet-4.6",
                    default_summary_model="copilot/claude-sonnet-4.6",
                    discovered_at=discovered_at,
                ),
            },
        ),
        base=global_dir,
    )
    calls = _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={
            "copilot": DiscoveryResult(
                [
                    _model("gpt-4o", provider_id="copilot"),
                    _model("gpt-4o-mini", provider_id="copilot"),
                ],
                None,
                200,
            ),
        },
        states={"copilot": ProviderState()},
    )
    ui = FakeUI()

    result = run_refresh_models("copilot", workspace_root=tmp_path, ui=ui)

    assert result.success is True
    assert calls == ["copilot"]
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    assert [model.id for model in snapshot.providers["copilot"].models] == [
        "copilot/gpt-4o",
        "copilot/gpt-4o-mini",
        "copilot/claude-sonnet-4.6",
        "copilot/gpt-5.5",
    ]
    assert any(
        "Refreshed GitHub Copilot; discovered 2 models, preserved 2 previous models." in msg
        for msg in ui.infos
    )


@verifies(SWR.SWR_727, SWR.SWR_825)
def test_run_refresh_models_unauthenticated_provider_skips_discovery(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    global_dir = tmp_path / "global-config"
    calls = _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={},
        states={
            "copilot": ProviderState(
                status=AuthStatus.UNAUTHENTICATED,
                has_stored_tokens=False,
            ),
        },
    )
    ui = FakeUI()

    result = run_refresh_models("copilot", workspace_root=tmp_path, ui=ui)

    assert result.success is False
    assert calls == []
    assert "not authenticated" in ui.errors[0]
    assert not snapshot_path(global_dir).exists()


@verifies(SWR.SWR_727, SWR.SWR_823, SWR.SWR_824)
def test_run_refresh_models_partial_failure_exits_with_errors(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    global_dir = tmp_path / "global-config"
    calls = _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={
            "copilot": DiscoveryResult(
                [_model("gpt-4o", provider_id="copilot")],
                None,
                200,
            ),
            "codex": DiscoveryResult([], "HTTP 500", 500),
        },
        states={
            "copilot": ProviderState(),
            "codex": ProviderState(extra={"auth_mode": "chatgpt"}),
        },
    )
    ui = FakeUI()

    result = run_refresh_models(None, workspace_root=tmp_path, ui=ui)

    assert result.success is False
    assert calls == ["copilot", "codex"]
    assert result.message == "Refresh finished: 1 provider succeeded, 1 failed."
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    assert set(snapshot.providers) == {"copilot"}
    assert any("Model discovery failed for OpenAI Codex: HTTP 500" in msg for msg in ui.errors)


@verifies(SWR.SWR_727)
def test_run_refresh_models_codex_chatgpt_auth_does_not_require_api_key(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    global_dir = tmp_path / "global-config"
    state = ProviderState(extra={"auth_mode": "chatgpt"})
    calls = _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={
            "codex": DiscoveryResult(
                [
                    _model("gpt-5.5", provider_id="codex"),
                    _model("gpt-5.4", provider_id="codex"),
                    _model("gpt-5.4-mini", provider_id="codex"),
                ],
                None,
                200,
            ),
        },
        states={"codex": state},
    )
    ui = FakeUI()

    result = run_refresh_models("codex", workspace_root=tmp_path, ui=ui)

    assert result.success is True
    assert calls == ["codex"]
    assert state.logout_calls == 0
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    assert [model.id for model in snapshot.providers["codex"].models] == [
        "codex/gpt-5.4-mini",
        "codex/gpt-5.5",
        "codex/gpt-5.4",
    ]
    assert not any("API key exchange" in msg for msg in [*ui.warnings, *ui.errors])


@verifies(SWR.SWR_727)
def test_run_refresh_models_codex_403_keeps_subscription_credentials(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    """A temporary Codex catalog 403 leaves a completed subscription sign-in available to retry."""
    global_dir = tmp_path / "global-config"
    state = ProviderState(account_id="account-123")
    _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={
            "codex": DiscoveryResult([], "Authentication failed for OpenAI Codex: 403", 403)
        },
        states={"codex": state},
    )
    ui = FakeUI()

    result = run_refresh_models("codex", workspace_root=tmp_path, ui=ui)

    assert result.success is False
    assert state.logout_calls == 0
    assert state.has_stored_tokens is True
    assert not any("Discarded stored authentication" in message for message in ui.warnings)


@verifies(SWR.SWR_727, SWR.SWR_820, SWR.SWR_825)
def test_run_refresh_models_skips_unauthenticated_in_bulk_refresh(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    """Bulk refresh silently skips unauthenticated providers and mentions them in the summary."""
    global_dir = tmp_path / "global-config"
    calls = _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={
            "copilot": DiscoveryResult(
                [_model("gpt-4o", provider_id="copilot")],
                None,
                200,
            ),
        },
        states={
            "copilot": ProviderState(),
            "codex": ProviderState(
                status=AuthStatus.UNAUTHENTICATED,
                has_stored_tokens=False,
            ),
        },
    )
    ui = FakeUI()

    result = run_refresh_models(None, workspace_root=tmp_path, ui=ui)

    assert result.success is False
    assert calls == ["copilot"]
    assert result.message == (
        "Refresh finished: 1 provider succeeded, 1 skipped (not authenticated)."
    )
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    assert set(snapshot.providers) == {"copilot"}
    # No errors surfaced for silently skipped providers
    assert not any("not authenticated" in err for err in ui.errors)
    assert not any("codex" in info.lower() for info in ui.infos)


@verifies(SWR.SWR_2812, SWR.SWR_2813)
def test_run_refresh_models_never_fills_a_startup_slot_with_an_unusable_model(
    monkeypatch: Any,
    tmp_path: Any,
) -> None:
    """Productive use: a refresh that discovers a policy-blocked model must not hand it
    to the user as their default. Expected outcome: the model is stored for the picker to
    explain, and every startup slot resolves to the usable one."""
    global_dir = tmp_path / "global-config"
    blocked = DiscoveredModel(
        id="gpt-5.6-sol",
        qualified_id="copilot/gpt-5.6-sol",
        display_name="gpt-5.6-sol",
        capabilities={"availability": "policy_disabled"},
    )
    usable = DiscoveredModel(
        id="claude-sonnet-4.5",
        qualified_id="copilot/claude-sonnet-4.5",
        display_name="claude-sonnet-4.5",
        capabilities={"availability": "available"},
    )
    _install_fakes(
        monkeypatch,
        global_config_dir=global_dir,
        discoveries={"copilot": DiscoveryResult([blocked, usable], None, 200)},
        states={"copilot": ProviderState()},
    )

    result = run_refresh_models("copilot", workspace_root=tmp_path, ui=FakeUI())

    assert result.success is True
    snapshot = read_snapshot(global_dir)
    assert snapshot is not None
    provider = snapshot.providers["copilot"]
    assert {model.id for model in provider.models} == {
        "copilot/gpt-5.6-sol",
        "copilot/claude-sonnet-4.5",
    }
    slots = (
        provider.small_model,
        provider.medium_model,
        provider.large_model,
        provider.default_summary_model,
    )
    assert set(slots) == {"copilot/claude-sonnet-4.5"}
