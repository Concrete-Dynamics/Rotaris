from __future__ import annotations

import pytest

from rotaris_core.auth.manager import AuthManager
from rotaris_core.auth.provider import TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture
def tmp_storage(tmp_path):
    return TokenStorage(token_dir=tmp_path)


@pytest.fixture
def auth_manager(tmp_storage):
    return AuthManager(storage=tmp_storage)


@verifies(SWR.SWR_707)
def test_logout_success(tmp_storage, auth_manager):
    # Arrange
    provider = "copilot"
    tmp_storage.save(provider, TokenSet(access_token="abc", refresh_token="def"))
    assert tmp_storage.has_tokens(provider)

    # Act
    auth_manager.logout(provider)

    # Assert
    assert not tmp_storage.has_tokens(provider)
    assert provider not in auth_manager._providers


@verifies(SWR.SWR_707)
def test_logout_no_tokens(tmp_storage, auth_manager):
    # Arrange
    provider = "copilot"
    assert not tmp_storage.has_tokens(provider)

    # Act
    auth_manager.logout(provider)

    # Assert
    assert not tmp_storage.has_tokens(provider)


@verifies(SWR.SWR_707, SWR.SWR_717)
def test_logout_provider_scoping(tmp_storage, auth_manager):
    # Arrange
    p1 = "copilot"
    p2 = "codex"
    tmp_storage.save(p1, TokenSet(access_token="p1_acc", refresh_token="p1_ref"))
    tmp_storage.save(p2, TokenSet(access_token="p2_acc", refresh_token="p2_ref"))

    # Act
    auth_manager.logout(p1)

    # Assert
    assert not tmp_storage.has_tokens(p1)
    assert tmp_storage.has_tokens(p2)
