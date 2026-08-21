from __future__ import annotations

from urllib.parse import urlparse

import pytest
from pydantic import ValidationError

from rotaris_core.providers import BUILTIN_PROVIDERS, get_provider, list_providers
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_308)
def test_builtin_provider_keys() -> None:
    expected_keys = {"concrete-cloud", "copilot", "codex", "openai-compatible", "deepseek"}
    actual_keys = set(BUILTIN_PROVIDERS.keys())
    assert expected_keys.issubset(actual_keys)


@verifies(SWR.SWR_745)
def test_provider_descriptor_is_frozen() -> None:
    provider = get_provider("copilot")

    with pytest.raises(ValidationError):
        type(provider).__setattr__(provider, "display_name", "Changed")


@verifies(SWR.SWR_745)
def test_get_provider_returns_expected_descriptor() -> None:
    """Productive use: Codex users can discover models with account authentication.
    Expected outcome: the built-in descriptor targets the Codex model endpoint.
    """
    provider = get_provider("codex")

    assert provider.id == "codex"
    assert provider.display_name == "OpenAI Codex"
    assert provider.auth_provider_id == "codex"
    assert provider.discovery_endpoint == "https://chatgpt.com/backend-api/codex/models"
    assert provider.discovery_auth_header == "Bearer"
    assert provider.default_base_url == "https://chatgpt.com/backend-api/codex"


@verifies(SWR.SWR_745)
def test_get_provider_raises_for_unknown_id() -> None:
    with pytest.raises(KeyError):
        get_provider("unknown")


@verifies(SWR.SWR_308)
def test_list_providers_is_deterministic() -> None:
    providers = list_providers()

    expected_ids = {"concrete-cloud", "copilot", "codex", "openai-compatible"}
    assert expected_ids.issubset({provider.id for provider in providers})
    assert len(providers) >= 3


@verifies(SWR.SWR_745)
@pytest.mark.parametrize(
    ("provider_id", "expected_endpoint_prefix", "expected_base_url"),
    [
        ("concrete-cloud", "https://", "https://rotaris.ai/v1"),
        ("copilot", "https://", "https://api.githubcopilot.com"),
        ("codex", "https://", "https://chatgpt.com/backend-api/codex"),
        ("openai-compatible", "https://", "https://api.openai.com/v1"),
    ],
)
def test_provider_urls_are_https(
    provider_id: str,
    expected_endpoint_prefix: str,
    expected_base_url: str,
) -> None:
    """Productive use: users can connect to built-in providers over secure endpoints.
    Expected outcome: each remote provider exposes valid HTTPS model and API URLs.
    """
    provider = get_provider(provider_id)

    assert provider.discovery_endpoint.startswith(expected_endpoint_prefix)
    assert provider.default_base_url == expected_base_url

    parsed = urlparse(provider.discovery_endpoint)
    assert parsed.scheme == "https"
    assert parsed.netloc
