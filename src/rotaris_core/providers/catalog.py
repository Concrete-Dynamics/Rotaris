from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

from .instances import OPENAI_COMPATIBLE_PROVIDER_ID
from .types import ConnectionMode, ProviderDescriptor

BUILTIN_PROVIDERS: dict[str, ProviderDescriptor] = {
    "concrete-cloud": ProviderDescriptor(
        id="concrete-cloud",
        display_name="Rotaris Cloud (recommended)",
        auth_provider_id="concrete-cloud",
        discovery_endpoint="https://rotaris.ai/v1/models",
        discovery_auth_header="Bearer",
        default_base_url="https://rotaris.ai/v1",
        connection_mode=ConnectionMode.ROTARIS_CLOUD,
        operator_name="Concrete Dynamics UG (haftungsbeschränkt)",
        privacy_url="https://rotaris.ai/privacy",
    ),
    "copilot": ProviderDescriptor(
        id="copilot",
        display_name="GitHub Copilot",
        auth_provider_id="copilot",
        discovery_endpoint="https://api.githubcopilot.com/models",
        discovery_auth_header="Bearer",
        default_base_url="https://api.githubcopilot.com",
        connection_mode=ConnectionMode.DIRECT,
        operator_name="GitHub",
    ),
    "codex": ProviderDescriptor(
        id="codex",
        display_name="OpenAI Codex",
        auth_provider_id="codex",
        discovery_endpoint="https://chatgpt.com/backend-api/codex/models",
        discovery_auth_header="Bearer",
        default_base_url="https://chatgpt.com/backend-api/codex",
        connection_mode=ConnectionMode.DIRECT,
        operator_name="OpenAI",
    ),
    OPENAI_COMPATIBLE_PROVIDER_ID: ProviderDescriptor(
        id=OPENAI_COMPATIBLE_PROVIDER_ID,
        display_name="OpenAI-compatible",
        auth_provider_id=OPENAI_COMPATIBLE_PROVIDER_ID,
        discovery_endpoint="https://api.openai.com/v1/models",
        discovery_auth_header="Bearer",
        default_base_url="https://api.openai.com/v1",
        connection_mode=ConnectionMode.CUSTOM,
    ),
    "claude-code": ProviderDescriptor(
        id="claude-code",
        display_name="Claude Code (subscription)",
        auth_provider_id="claude-code",
        # The Agent SDK is a local runtime, not an HTTP endpoint; these are
        # sentinels — discovery is static and requests never hit a base URL.
        discovery_endpoint="claude-agent-sdk://local",
        discovery_auth_header="Bearer",
        default_base_url="claude-agent-sdk://local",
        connection_mode=ConnectionMode.LOCAL_SDK,
        operator_name="Anthropic",
    ),
    "deepseek": ProviderDescriptor(
        id="deepseek",
        display_name="DeepSeek",
        auth_provider_id="deepseek",
        discovery_endpoint="https://api.deepseek.com/models",
        discovery_auth_header="Bearer",
        default_base_url="https://api.deepseek.com/v1",
        connection_mode=ConnectionMode.DIRECT,
        operator_name="DeepSeek",
    ),
}


def get_provider(id: str) -> ProviderDescriptor:
    return BUILTIN_PROVIDERS[id]


@traces(SWR.SWR_746, SWR.SWR_747, SWR.SWR_748)
def list_providers() -> list[ProviderDescriptor]:
    return list(BUILTIN_PROVIDERS.values())


@traces(SWR.SWR_3721)
def validate_provider_catalog() -> None:
    """Fail loudly when a built-in provider lacks its transparency metadata.

    SWR-3721 AC-001/AC-005: every built-in must carry a connection-mode
    classification, and direct/cloud providers must state a destination host.
    Adding a provider without those fields fails this check — and the test that
    pins it — instead of shipping an unclassifiable data path.
    """
    for provider_id, descriptor in BUILTIN_PROVIDERS.items():
        if not descriptor.connection_mode:
            raise ValueError(f"provider {provider_id!r} has no connection_mode")
        if (
            descriptor.connection_mode
            in (
                ConnectionMode.ROTARIS_CLOUD,
                ConnectionMode.DIRECT,
            )
            and not descriptor.destination_host()
        ):
            raise ValueError(f"provider {provider_id!r} has no destination host")
        if descriptor.connection_mode is ConnectionMode.CUSTOM and descriptor.operator_name:
            raise ValueError(f"provider {provider_id!r} must not name a fixed operator")
