from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

from .instances import OPENAI_COMPATIBLE_PROVIDER_ID
from .types import ProviderDescriptor

BUILTIN_PROVIDERS: dict[str, ProviderDescriptor] = {
    "concrete-cloud": ProviderDescriptor(
        id="concrete-cloud",
        display_name="Rotaris Cloud (recommended)",
        auth_provider_id="concrete-cloud",
        discovery_endpoint="https://rotaris.ai/v1/models",
        discovery_auth_header="Bearer",
        default_base_url="https://rotaris.ai/v1",
    ),
    "copilot": ProviderDescriptor(
        id="copilot",
        display_name="GitHub Copilot",
        auth_provider_id="copilot",
        discovery_endpoint="https://api.githubcopilot.com/models",
        discovery_auth_header="Bearer",
        default_base_url="https://api.githubcopilot.com",
    ),
    "codex": ProviderDescriptor(
        id="codex",
        display_name="OpenAI Codex",
        auth_provider_id="codex",
        discovery_endpoint="https://chatgpt.com/backend-api/codex/models",
        discovery_auth_header="Bearer",
        default_base_url="https://chatgpt.com/backend-api/codex",
    ),
    OPENAI_COMPATIBLE_PROVIDER_ID: ProviderDescriptor(
        id=OPENAI_COMPATIBLE_PROVIDER_ID,
        display_name="OpenAI-compatible",
        auth_provider_id=OPENAI_COMPATIBLE_PROVIDER_ID,
        discovery_endpoint="https://api.openai.com/v1/models",
        discovery_auth_header="Bearer",
        default_base_url="https://api.openai.com/v1",
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
    ),
    "deepseek": ProviderDescriptor(
        id="deepseek",
        display_name="DeepSeek",
        auth_provider_id="deepseek",
        discovery_endpoint="https://api.deepseek.com/models",
        discovery_auth_header="Bearer",
        default_base_url="https://api.deepseek.com/v1",
    ),
}


def get_provider(id: str) -> ProviderDescriptor:
    return BUILTIN_PROVIDERS[id]


@traces(SWR.SWR_746, SWR.SWR_747, SWR.SWR_748)
def list_providers() -> list[ProviderDescriptor]:
    return list(BUILTIN_PROVIDERS.values())
