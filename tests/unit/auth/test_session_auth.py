"""A run resolves its provider credentials up front and keeps them staged."""

from __future__ import annotations

import asyncio
import time

import pytest

from rotaris_core.auth import session_auth
from rotaris_core.auth.provider import AuthResult, AuthStatus, TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.config.schema import ModelConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies


class FakeProvider:
    """A provider whose verdict follows the token set's expiry, like the real ones."""

    def __init__(self, *, refreshed: TokenSet | None = None, fail: str | None = None) -> None:
        self.refreshed = refreshed
        self.fail = fail
        self.refresh_calls = 0

    @property
    def provider_id(self) -> str:
        return "fake"

    def status(self, token_set: TokenSet) -> AuthStatus:
        if not token_set.access_token:
            return AuthStatus.UNAUTHENTICATED
        if token_set.is_expired:
            return AuthStatus.EXPIRED
        return AuthStatus.AUTHENTICATED

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        return self.status(token_set)

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        self.refresh_calls += 1
        if self.fail is not None:
            return AuthResult(success=False, error=self.fail)
        return AuthResult(success=True, tokens=self.refreshed)

    async def authenticate(self, on_prompt=None, cancel_event=None) -> AuthResult:  # noqa: ANN001
        return AuthResult(success=False, error="interactive auth is not available to a run")


def _config(tmp_path, provider_id: str = "fake") -> RotarisConfig:
    return RotarisConfig(
        workspace_root=tmp_path,
        models={
            "a-model": ModelConfig(
                provider="openai",
                model_id="a-model",
                auth_provider=provider_id,
            ),
        },
    )


def _install_provider(monkeypatch: pytest.MonkeyPatch, provider: FakeProvider) -> None:
    """Make ``AuthManager`` hand out *provider* for the id the config references."""
    from rotaris_core.auth import manager as manager_module

    monkeypatch.setattr(
        manager_module,
        "_get_provider_class",
        lambda provider_id: (lambda: provider) if provider_id == "fake" else None,
    )


@verifies(SWR.SWR_3712)
def test_priming_reports_a_usable_credential_without_refreshing_it(tmp_path, monkeypatch) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "fake",
        TokenSet(access_token="good", refresh_token="ref", expires_at=time.time() + 3600),
    )
    provider = FakeProvider()
    _install_provider(monkeypatch, provider)

    report = asyncio.run(prime(_config(tmp_path), storage))

    assert report.ok
    assert report.authenticated == ("fake",)
    assert report.refreshed == ()
    assert provider.refresh_calls == 0


@verifies(SWR.SWR_3712)
def test_priming_refreshes_an_expired_credential_before_the_run_builds_a_model(
    tmp_path,
    monkeypatch,
) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "fake",
        TokenSet(access_token="stale", refresh_token="ref", expires_at=time.time() - 1),
    )
    provider = FakeProvider(
        refreshed=TokenSet(
            access_token="fresh",
            refresh_token="ref",
            expires_at=time.time() + 3600,
        ),
    )
    _install_provider(monkeypatch, provider)

    report = asyncio.run(prime(_config(tmp_path), storage))

    assert report.refreshed == ("fake",)
    assert provider.refresh_calls == 1
    stored = storage.load("fake")
    assert stored is not None
    assert stored.access_token == "fresh"


@verifies(SWR.SWR_3712)
def test_a_provider_that_cannot_be_primed_is_reported_rather_than_raised(
    tmp_path,
    monkeypatch,
) -> None:
    """One broken credential must not stop a run that may never use it."""
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "fake",
        TokenSet(access_token="stale", refresh_token="ref", expires_at=time.time() - 1),
    )
    _install_provider(monkeypatch, FakeProvider(fail="invalid_grant"))

    report = asyncio.run(prime(_config(tmp_path), storage))

    assert not report.ok
    assert "fake" in report.unresolved


@verifies(SWR.SWR_3712)
def test_a_credential_expiring_mid_run_is_refreshed_before_its_deadline(
    tmp_path,
    monkeypatch,
) -> None:
    """The run outlives the credential, so the refresher must renew it in place."""
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "fake",
        TokenSet(
            access_token="expiring",
            refresh_token="ref",
            # Inside the refresh margin already: due the moment the poll fires.
            expires_at=time.time() + session_auth.REFRESH_MARGIN_S / 2,
        ),
    )
    provider = FakeProvider(
        refreshed=TokenSet(
            access_token="renewed",
            refresh_token="ref",
            expires_at=time.time() + 3600,
        ),
    )
    _install_provider(monkeypatch, provider)
    monkeypatch.setattr(session_auth, "REFRESH_POLL_S", 0.01)

    config = _config(tmp_path)

    async def run_until_renewed() -> str:
        async with session_auth.keep_auth_fresh(config, storage=storage):
            for _ in range(200):
                await asyncio.sleep(0.01)
                stored = storage.load("fake")
                if stored is not None and stored.access_token == "renewed":
                    return "renewed"
        return "never"

    assert asyncio.run(run_until_renewed()) == "renewed"


@verifies(SWR.SWR_3712)
def test_the_refresher_stops_with_the_run(tmp_path, monkeypatch) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "fake",
        TokenSet(access_token="good", refresh_token="ref", expires_at=time.time() + 3600),
    )
    _install_provider(monkeypatch, FakeProvider())
    monkeypatch.setattr(session_auth, "REFRESH_POLL_S", 0.01)

    config = _config(tmp_path)

    async def leave_through_an_error() -> set[asyncio.Task]:
        with pytest.raises(RuntimeError, match="the run failed"):
            async with session_auth.keep_auth_fresh(config, storage=storage):
                await asyncio.sleep(0.05)
                raise RuntimeError("the run failed")
        return {task for task in asyncio.all_tasks() if task.get_name() == "auth-refresher"}

    assert asyncio.run(leave_through_an_error()) == set()


@verifies(SWR.SWR_3712)
def test_priming_covers_every_provider_the_configuration_references(tmp_path) -> None:
    config = RotarisConfig(
        workspace_root=tmp_path,
        models={
            "one": ModelConfig(provider="openai", model_id="one", auth_provider="codex"),
            "two": ModelConfig(provider="openai", model_id="two", auth_provider="copilot"),
            "three": ModelConfig(provider="openai", model_id="three", auth_provider="copilot"),
            "keyed": ModelConfig(provider="openai", model_id="keyed"),
        },
    )

    assert session_auth.configured_provider_ids(config) == ("codex", "copilot")


async def prime(config: RotarisConfig, storage: TokenStorage) -> session_auth.PrimeReport:
    return await session_auth.prime_auth_providers(config, storage=storage)


@verifies(SWR.SWR_3712)
def test_a_credential_already_past_expiry_is_not_rescheduled_every_poll(tmp_path) -> None:
    """Priming already reported it; scheduling it forever would only repeat that."""
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save(
        "fake",
        TokenSet(access_token="gone", refresh_token="ref", expires_at=time.time() - 60),
    )

    assert session_auth.seconds_until_refresh(_config(tmp_path), storage=storage) is None


@verifies(SWR.SWR_3712)
def test_a_credential_with_no_expiry_never_needs_refreshing(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save("fake", TokenSet(access_token="an-api-key", refresh_token=""))

    assert session_auth.seconds_until_refresh(_config(tmp_path), storage=storage) is None
