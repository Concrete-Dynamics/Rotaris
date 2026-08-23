"""Provider transparency metadata: every built-in states where model traffic goes.

SWR-3721: the catalog — the one product source — carries the connection-mode
classification, operator and destination for each built-in provider. A provider
without that metadata must fail validation, not ship silently."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from rotaris_core.providers import (
    BUILTIN_PROVIDERS,
    get_provider,
    list_providers,
    validate_provider_catalog,
)
from rotaris_core.providers.types import ConnectionMode, ProviderDescriptor
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_3721)
def test_every_builtin_provider_declares_a_connection_mode() -> None:
    """AC-001: no built-in is left unclassifiable."""
    validate_provider_catalog()

    for provider_id, descriptor in BUILTIN_PROVIDERS.items():
        assert descriptor.connection_mode, provider_id
        assert isinstance(descriptor.connection_mode, ConnectionMode), provider_id


@verifies(SWR.SWR_3721)
def test_the_connection_modes_classify_the_known_boundaries() -> None:
    """The four data-flow boundaries are told apart: Rotaris-managed cloud,
    direct provider APIs, the local Claude Agent SDK, and user-defined endpoints."""
    assert get_provider("concrete-cloud").connection_mode is ConnectionMode.ROTARIS_CLOUD
    assert get_provider("copilot").connection_mode is ConnectionMode.DIRECT
    assert get_provider("codex").connection_mode is ConnectionMode.DIRECT
    assert get_provider("deepseek").connection_mode is ConnectionMode.DIRECT
    assert get_provider("openai-compatible").connection_mode is ConnectionMode.CUSTOM
    assert get_provider("claude-code").connection_mode is ConnectionMode.LOCAL_SDK


@verifies(SWR.SWR_3721)
def test_direct_providers_expose_operator_and_destination_host() -> None:
    """AC-002: a fixed endpoint names its operator and its canonical host."""
    copilot = get_provider("copilot")

    assert copilot.operator_name == "GitHub"
    assert copilot.destination_host() == "api.githubcopilot.com"

    assert get_provider("codex").operator_name == "OpenAI"
    assert get_provider("deepseek").operator_name == "DeepSeek"
    assert get_provider("deepseek").destination_host() == "api.deepseek.com"


@verifies(SWR.SWR_3721)
def test_claude_code_is_a_local_sdk_not_an_http_endpoint() -> None:
    """AC-003: the local Agent SDK is never presented as a Rotaris HTTP endpoint."""
    claude = get_provider("claude-code")

    assert claude.connection_mode is ConnectionMode.LOCAL_SDK
    assert claude.destination_host() is None


@verifies(SWR.SWR_3721)
def test_a_custom_endpoint_has_no_fixed_operator_or_host() -> None:
    """The destination of an OpenAI-compatible provider is whatever the user
    configured, so the catalog itself names neither host nor operator."""
    custom = get_provider("openai-compatible")

    assert custom.connection_mode is ConnectionMode.CUSTOM
    assert custom.destination_host() is None
    assert custom.operator_name is None


@verifies(SWR.SWR_3721)
def test_a_descriptor_without_a_connection_mode_is_rejected() -> None:
    """AC-005: the schema refuses a provider that cannot state its data path."""
    with pytest.raises(ValidationError):
        ProviderDescriptor(
            id="mystery",
            display_name="Mystery",
            auth_provider_id="mystery",
            discovery_endpoint="https://mystery.example/models",
            discovery_auth_header="Bearer",
            default_base_url="https://mystery.example/v1",
        )


@verifies(SWR.SWR_3721)
def test_an_unclassifiable_builtin_fails_catalog_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The catalog validator is the gate a new built-in must pass."""
    from rotaris_core.providers import catalog

    monkeypatch.setitem(
        catalog.BUILTIN_PROVIDERS,
        "copilot",
        ProviderDescriptor(
            id="copilot",
            display_name="GitHub Copilot",
            auth_provider_id="copilot",
            discovery_endpoint="https://api.githubcopilot.com/models",
            discovery_auth_header="Bearer",
            default_base_url="not-an-http-endpoint",
            connection_mode=ConnectionMode.DIRECT,
            operator_name="GitHub",
        ),
    )

    with pytest.raises(ValueError, match="destination host"):
        validate_provider_catalog()


@verifies(SWR.SWR_3721)
def test_the_catalog_is_the_single_source_providers_are_listed_from() -> None:
    """Any consumer enumerating built-ins goes through the runtime catalog."""
    providers = list_providers()

    assert {provider.id for provider in providers} >= {
        "concrete-cloud",
        "copilot",
        "codex",
        "openai-compatible",
        "claude-code",
        "deepseek",
    }
