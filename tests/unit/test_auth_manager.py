from __future__ import annotations

from rotaris_core.auth.manager import AuthManager
from rotaris_core.auth.provider import AuthResult, AuthStatus, DeviceCodePrompt, TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.reqtocode import SWR, verifies


class FakeProvider:
    def __init__(
        self,
        *,
        check_result: AuthStatus = AuthStatus.AUTHENTICATED,
        refresh_result: AuthResult | None = None,
        auth_result: AuthResult | None = None,
    ) -> None:
        self._check_result = check_result
        self._refresh_result = refresh_result or AuthResult(success=False, error="not configured")
        self._auth_result = auth_result or AuthResult(success=False, error="not configured")

    @property
    def provider_id(self) -> str:
        return "fake"

    def status(self, token_set: TokenSet) -> AuthStatus:
        return self._check_result

    async def check_status(self, token_set: TokenSet) -> AuthStatus:
        return self.status(token_set)

    async def refresh(self, token_set: TokenSet) -> AuthResult:
        return self._refresh_result

    async def authenticate(self, on_prompt=None, cancel_event=None) -> AuthResult:
        if on_prompt:
            await on_prompt("Please authenticate")
        return self._auth_result


@verifies(SWR.SWR_703)
async def test_get_token_returns_stored_valid_token(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="stored_token", refresh_token="ref"))

    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(check_result=AuthStatus.AUTHENTICATED)

    token = await manager.get_token("fake")
    assert token == "stored_token"


@verifies(SWR.SWR_704)
async def test_get_token_refreshes_expired_token(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="old", refresh_token="ref"))

    refreshed = TokenSet(access_token="refreshed_token", refresh_token="new_ref")
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        check_result=AuthStatus.EXPIRED,
        refresh_result=AuthResult(success=True, tokens=refreshed),
    )

    token = await manager.get_token("fake")
    assert token == "refreshed_token"

    loaded = storage.load("fake")
    assert loaded is not None
    assert loaded.access_token == "refreshed_token"


@verifies(SWR.SWR_704, SWR.SWR_723)
async def test_get_token_authenticates_when_no_stored_tokens(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    new_tokens = TokenSet(access_token="new_token", refresh_token="new_ref")

    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        auth_result=AuthResult(success=True, tokens=new_tokens),
    )

    prompts: list[str] = []

    async def on_prompt(prompt: DeviceCodePrompt | str) -> None:
        prompts.append(str(prompt))

    token = await manager.get_token("fake", on_prompt=on_prompt)
    assert token == "new_token"
    assert len(prompts) == 1

    loaded = storage.load("fake")
    assert loaded is not None
    assert loaded.access_token == "new_token"


@verifies(SWR.SWR_704)
async def test_get_token_returns_none_without_callback_when_unauthenticated(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider()

    token = await manager.get_token("fake", on_prompt=None)
    assert token is None


@verifies(SWR.SWR_704)
async def test_get_token_reauthenticates_when_refresh_fails(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="old", refresh_token="ref"))

    new_tokens = TokenSet(access_token="reauthed", refresh_token="new_ref")
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        check_result=AuthStatus.EXPIRED,
        refresh_result=AuthResult(success=False, error="invalid_grant"),
        auth_result=AuthResult(success=True, tokens=new_tokens),
    )

    prompts: list[str] = []

    async def on_prompt(prompt: DeviceCodePrompt | str) -> None:
        prompts.append(str(prompt))

    token = await manager.get_token("fake", on_prompt=on_prompt)
    assert token == "reauthed"
    assert len(prompts) == 1


@verifies(SWR.SWR_704)
async def test_get_token_reauthenticates_when_stored_token_is_unauthenticated(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="old", refresh_token="ref"))

    new_tokens = TokenSet(access_token="reauthed", refresh_token="new_ref")
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        check_result=AuthStatus.UNAUTHENTICATED,
        auth_result=AuthResult(success=True, tokens=new_tokens),
    )

    prompts: list[str] = []

    async def on_prompt(prompt: DeviceCodePrompt | str) -> None:
        prompts.append(str(prompt))

    token = await manager.get_token("fake", on_prompt=on_prompt)
    assert token == "reauthed"
    assert len(prompts) == 1


@verifies(SWR.SWR_703)
async def test_get_token_unknown_provider_returns_none(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)

    token = await manager.get_token("totally_unknown")
    assert token is None
    assert manager.get_last_error("totally_unknown") == "Unknown provider: totally_unknown"


@verifies(SWR.SWR_704, SWR.SWR_722)
async def test_get_token_records_provider_error_on_auth_failure(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        auth_result=AuthResult(success=False, error="scope rejected"),
    )

    async def on_prompt(_prompt: DeviceCodePrompt | str) -> None:
        return None

    token = await manager.get_token("fake", on_prompt=on_prompt)

    assert token is None
    assert manager.get_last_error("fake") == "scope rejected"


@verifies(SWR.SWR_704)
async def test_get_token_clears_last_error_after_successful_authentication(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        auth_result=AuthResult(success=False, error="scope rejected"),
    )

    async def on_prompt(_prompt: DeviceCodePrompt | str) -> None:
        return None

    failed_token = await manager.get_token("fake", on_prompt=on_prompt)
    assert failed_token is None
    assert manager.get_last_error("fake") == "scope rejected"

    manager._providers["fake"] = FakeProvider(
        auth_result=AuthResult(
            success=True,
            tokens=TokenSet(access_token="fresh-token", refresh_token="fresh-refresh"),
        ),
    )

    token = await manager.get_token("fake", on_prompt=on_prompt)

    assert token == "fresh-token"
    assert manager.get_last_error("fake") is None


@verifies(SWR.SWR_703)
async def test_check_status_with_no_stored_tokens(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider()

    status = await manager.check_status("fake")
    assert status == AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_703)
async def test_check_status_with_stored_tokens(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="tok", refresh_token="ref"))

    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(check_result=AuthStatus.AUTHENTICATED)

    status = await manager.check_status("fake")
    assert status == AuthStatus.AUTHENTICATED


@verifies(SWR.SWR_704)
async def test_authenticate_saves_tokens_on_success(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    new_tokens = TokenSet(access_token="auth_tok", refresh_token="auth_ref")

    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        auth_result=AuthResult(success=True, tokens=new_tokens),
    )

    result = await manager.authenticate("fake")
    assert result.success

    loaded = storage.load("fake")
    assert loaded is not None
    assert loaded.access_token == "auth_tok"


@verifies(SWR.SWR_703)
async def test_authenticate_unknown_provider(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)

    result = await manager.authenticate("nonexistent")
    assert not result.success
    assert "Unknown" in (result.error or "")


@verifies(SWR.SWR_715, SWR.SWR_718, SWR.SWR_724)
def test_logout_removes_tokens_and_provider(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="x", refresh_token="y"))

    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider()

    manager.logout("fake")
    assert not storage.has_tokens("fake")
    assert "fake" not in manager._providers


@verifies(SWR.SWR_703)
def test_is_authenticated_reflects_storage(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)

    assert not manager.is_authenticated("fake")

    storage.save("fake", TokenSet(access_token="x", refresh_token="y"))
    assert manager.is_authenticated("fake")


@verifies(SWR.SWR_720)
async def test_get_or_create_provider_concrete_cloud_no_type_error(tmp_path) -> None:
    """Regression: ConcreteCloudAuthProvider() must take no required args (cls() pattern)."""
    manager = AuthManager(storage=TokenStorage(token_dir=tmp_path))
    # Should not raise TypeError
    status = await manager.check_status("concrete-cloud")
    assert status == AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_720)
async def test_get_or_create_provider_rotaris_cloud_alias(tmp_path) -> None:
    """geraet-cloud is a registered alias for ConcreteCloudAuthProvider."""
    from rotaris_core.auth.concrete_cloud import ConcreteCloudAuthProvider

    manager = AuthManager(storage=TokenStorage(token_dir=tmp_path))
    provider = manager._get_or_create_provider("geraet-cloud")
    assert provider is not None
    assert isinstance(provider, ConcreteCloudAuthProvider)


@verifies(SWR.SWR_720)
async def test_concrete_cloud_provider_id_is_canonical(tmp_path) -> None:
    """Both concrete-cloud and geraet-cloud aliases share the same provider class."""
    from rotaris_core.auth.concrete_cloud import ConcreteCloudAuthProvider

    manager = AuthManager(storage=TokenStorage(token_dir=tmp_path))
    cc = manager._get_or_create_provider("concrete-cloud")
    gc = manager._get_or_create_provider("geraet-cloud")
    assert isinstance(cc, ConcreteCloudAuthProvider)
    assert isinstance(gc, ConcreteCloudAuthProvider)
    assert cc.provider_id == "concrete-cloud"
    assert gc.provider_id == "concrete-cloud"


@verifies(SWR.SWR_702)
def test_stage_provider_tokens_bridges_codex_to_openhands(tmp_path, monkeypatch) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)
    calls: list[TokenSet] = []

    def fake_stage(tokens: TokenSet) -> None:
        calls.append(tokens)

    monkeypatch.setattr(
        "rotaris_core.auth.codex_bridge.stage_openhands_oauth_credentials",
        fake_stage,
    )
    tokens = TokenSet(access_token="codex-token", refresh_token="codex-refresh")

    manager._stage_provider_tokens("codex", tokens)

    assert calls == [tokens]


@verifies(SWR.SWR_702)
def test_logout_clears_staged_codex_tokens(tmp_path, monkeypatch) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("codex", TokenSet(access_token="codex-token", refresh_token="codex-refresh"))
    manager = AuthManager(storage=storage)
    calls: list[bool] = []

    def fake_delete() -> bool:
        calls.append(True)
        return True

    monkeypatch.setattr(
        "rotaris_core.auth.codex_bridge.delete_openhands_oauth_credentials",
        fake_delete,
    )

    manager.logout("codex")

    assert calls == [True]
    assert not storage.has_tokens("codex")


@verifies(SWR.SWR_3711)
def test_peek_status_matches_check_status_without_a_loop(tmp_path) -> None:
    """The synchronous mirror answers the same as its awaitable face."""
    import asyncio

    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="stored", refresh_token="ref"))

    for verdict in (AuthStatus.AUTHENTICATED, AuthStatus.EXPIRED, AuthStatus.UNAUTHENTICATED):
        manager = AuthManager(storage=storage)
        manager._providers["fake"] = FakeProvider(check_result=verdict)

        assert manager.peek_status("fake") is verdict
        assert asyncio.run(manager.check_status("fake")) is verdict


@verifies(SWR.SWR_3711)
def test_peek_status_without_provider_or_tokens_is_unauthenticated(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    manager = AuthManager(storage=storage)

    assert manager.peek_status("nobody-knows-this-one") is AuthStatus.UNAUTHENTICATED

    manager._providers["fake"] = FakeProvider(check_result=AuthStatus.AUTHENTICATED)
    assert manager.peek_status("fake") is AuthStatus.UNAUTHENTICATED


@verifies(SWR.SWR_3711)
def test_run_auth_coro_returns_the_value_with_and_without_a_running_loop() -> None:
    import asyncio

    from rotaris_core.auth.manager import run_auth_coro

    async def answer() -> int:
        return 42

    assert run_auth_coro(answer()) == 42

    async def from_inside_a_loop() -> int:
        return run_auth_coro(answer())

    assert asyncio.run(from_inside_a_loop()) == 42


@verifies(SWR.SWR_3711)
def test_run_auth_coro_surfaces_a_failed_handoff_and_leaves_no_orphan(monkeypatch) -> None:
    """A refused handoff raises its own error, not a stray RuntimeWarning.

    The thread pool refuses new work once the interpreter is shutting down. If
    the coroutine were left unstarted, Python would report "never awaited" at
    whatever unrelated line the collector reached next, and the real error would
    be lost in whichever handler swallowed it.
    """
    import asyncio
    import concurrent.futures
    import gc
    import warnings

    from rotaris_core.auth.manager import run_auth_coro

    def refuse(self, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003, ANN202, ARG001
        raise RuntimeError("cannot schedule new futures after interpreter shutdown")

    monkeypatch.setattr(concurrent.futures.ThreadPoolExecutor, "submit", refuse)

    async def answer() -> int:
        return 42

    async def from_inside_a_loop() -> str:
        with warnings.catch_warnings():
            warnings.simplefilter("error", RuntimeWarning)
            try:
                run_auth_coro(answer())
            except RuntimeError as exc:
                message = str(exc)
            else:
                message = "no error raised"
            gc.collect()
        return message

    assert "interpreter shutdown" in asyncio.run(from_inside_a_loop())


@verifies(SWR.SWR_3712)
async def test_renew_refreshes_a_credential_that_is_still_valid(tmp_path) -> None:
    """A run looking past its own start renews a token that has not expired yet."""
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="valid-for-now", refresh_token="ref"))

    renewed = TokenSet(access_token="renewed", refresh_token="new-ref")
    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        check_result=AuthStatus.AUTHENTICATED,
        refresh_result=AuthResult(success=True, tokens=renewed),
    )

    assert await manager.renew("fake") == "renewed"
    stored = storage.load("fake")
    assert stored is not None
    assert stored.access_token == "renewed"


@verifies(SWR.SWR_3712)
async def test_renew_reports_why_it_could_not(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path)
    storage.save("fake", TokenSet(access_token="valid-for-now", refresh_token="ref"))

    manager = AuthManager(storage=storage)
    manager._providers["fake"] = FakeProvider(
        refresh_result=AuthResult(success=False, error="invalid_grant"),
    )

    assert await manager.renew("fake") is None
    assert manager.get_last_error("fake") == "invalid_grant"

    assert await manager.renew("unknown-provider") is None
    assert manager.get_last_error("unknown-provider") == "Unknown provider: unknown-provider"
