from __future__ import annotations

import httpx
import pytest
import respx

from rotaris_core.providers.discovery import discover_models
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_727)
@respx.mock
def test_discover_models_parses_copilot_models() -> None:
    route = respx.get("https://api.githubcopilot.com/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "gpt-4.1",
                        "name": "GPT-4.1",
                        "vendor": "openai",
                        "capabilities": {"chat": True},
                        "limits": {"context_window": 128000},
                        "extra": "snapshot",
                    },
                ],
            },
        ),
    )

    result = discover_models("copilot", token="token")

    assert result.error is None
    assert result.http_status == 200
    assert len(result.models) == 1
    model = result.models[0]
    assert model.id == "gpt-4.1"
    assert model.qualified_id == "copilot/gpt-4.1"
    assert model.display_name == "GPT-4.1"
    assert model.capabilities == {"chat": True, "api_mode": "chat", "availability": "available"}
    assert model.limits == {"context_window": 128000, "output_tokens": 32768}
    assert model.raw["vendor"] == "openai"
    request = route.calls[0].request
    assert request.headers["Authorization"] == "Bearer token"
    assert request.headers["User-Agent"] == "GithubCopilot/0.28.0"
    assert request.headers["Copilot-Integration-Id"] == "vscode-chat"
    assert request.headers["Editor-Version"] == "vscode/1.99.1"
    assert request.headers["Editor-Plugin-Version"] == "copilot-chat/0.28.0"
    assert request.headers["Accept"] == "application/json"


@verifies(SWR.SWR_727)
@respx.mock
def test_discover_models_overrides_host_with_api_base() -> None:
    route = respx.get("https://api.business.githubcopilot.com/models").mock(
        return_value=httpx.Response(200, json={"data": []}),
    )

    result = discover_models(
        "copilot",
        token="token",
        api_base="https://api.business.githubcopilot.com",
    )

    assert result.error is None
    assert route.called


@verifies(SWR.SWR_727)
@respx.mock
def test_discover_models_codex_uses_subscription_catalog() -> None:
    """A signed-in Codex subscriber receives only models exposed to their account."""
    route = respx.get(
        "https://chatgpt.com/backend-api/codex/models",
        params={"client_version": "0.144.6"},
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "models": [
                    {
                        "slug": "gpt-5.6-terra",
                        "display_name": "GPT-5.6 Terra",
                        "supported_in_api": True,
                        "visibility": "list",
                        "context_window": 272000,
                        "supported_reasoning_levels": ["low", "high"],
                    },
                    {
                        "slug": "codex-auto-review",
                        "supported_in_api": True,
                        "visibility": "hide",
                    },
                ],
            },
        ),
    )

    result = discover_models("codex", token="token", account_id="account-123")

    assert result.error is None
    assert result.http_status == 200
    assert len(result.models) == 1
    model = result.models[0]
    assert model.id == "gpt-5.6-terra"
    assert model.qualified_id == "codex/gpt-5.6-terra"
    assert model.display_name == "GPT-5.6 Terra"
    assert model.capabilities == {"reasoning_levels": ["low", "high"]}
    assert model.limits == {"context_window": 272000}
    request = route.calls[0].request
    assert request.headers["Authorization"] == "Bearer token"
    assert request.headers["originator"] == "codex_cli_rs"
    assert request.headers["chatgpt-account-id"] == "account-123"
    assert route.called


@verifies(SWR.SWR_727)
@pytest.mark.parametrize("status", [401, 403])
@respx.mock
def test_discover_models_returns_auth_error_for_unauthorized_status(status: int) -> None:
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=httpx.Response(status, json={"error": "nope"}),
    )

    result = discover_models("copilot", token="token")

    assert result.models == []
    assert result.http_status == status
    assert result.error == f"Authentication failed for GitHub Copilot: {status}"


@verifies(SWR.SWR_727)
@respx.mock
def test_discover_models_returns_failure_for_server_error() -> None:
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=httpx.Response(500, text="boom"),
    )

    result = discover_models("copilot", token="token")

    assert result.models == []
    assert result.http_status == 500
    assert result.error == "Discovery request failed: Internal Server Error"


@verifies(SWR.SWR_727)
@respx.mock
def test_discover_models_returns_failure_for_timeout() -> None:
    respx.get("https://api.githubcopilot.com/models").mock(
        side_effect=httpx.TimeoutException("timeout"),
    )

    result = discover_models("copilot", token="token")

    assert result.models == []
    assert result.http_status is None
    assert result.error == "Discovery request failed: timeout"


@verifies(SWR.SWR_727)
@respx.mock
def test_discover_models_returns_empty_success_for_no_models() -> None:
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=httpx.Response(200, json={"data": []}),
    )

    result = discover_models("copilot", token="token")

    assert result.models == []
    assert result.error is None
    assert result.http_status == 200


@verifies(SWR.SWR_727)
@respx.mock
def test_discover_models_returns_invalid_format_error_for_bad_json() -> None:
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=httpx.Response(200, text="not json", headers={"content-type": "text/plain"}),
    )

    result = discover_models("copilot", token="token")

    assert result.models == []
    assert result.http_status == 200
    assert result.error is not None
    assert "Invalid response format" in result.error


@verifies(SWR.SWR_727)
def test_discover_models_raises_for_unknown_provider() -> None:
    with pytest.raises(KeyError):
        discover_models("unknown", token="token")


# ---------------------------------------------------------------------------
# Copilot endpoint routing
# ---------------------------------------------------------------------------


def _copilot_catalog(*entries: dict[str, object]) -> httpx.Response:
    return httpx.Response(200, json={"data": list(entries)})


@verifies(SWR.SWR_2810, SWR.SWR_2811)
@respx.mock
def test_discover_models_keeps_responses_only_copilot_models() -> None:
    """Productive use: an operator can pick a Copilot model that only speaks /responses.
    Expected outcome: the model stays in the catalog, tagged for the responses route."""
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=_copilot_catalog(
            {
                "id": "gpt-5.6-terra",
                "name": "GPT-5.6 Terra",
                "capabilities": {"type": "chat"},
                "supported_endpoints": ["/responses", "ws:/responses"],
            },
        ),
    )

    result = discover_models("copilot", token="token")

    assert [model.id for model in result.models] == ["gpt-5.6-terra"]
    model = result.models[0]
    assert model.capabilities["availability"] == "available"
    assert model.capabilities["api_mode"] == "responses"
    # ``ws:`` is a transport, not a dispatchable route, so it is not carried over.
    assert model.capabilities["supported_endpoints"] == ["/v1/responses"]


@verifies(SWR.SWR_2810, SWR.SWR_2811)
@respx.mock
def test_discover_models_keeps_chat_route_for_dual_endpoint_copilot_models() -> None:
    """Productive use: models that already work on chat completions keep working.
    Expected outcome: dual-endpoint and endpoint-less entries stay on the chat route."""
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=_copilot_catalog(
            {
                "id": "gpt-5.2",
                "capabilities": {"type": "chat"},
                "supported_endpoints": ["/chat/completions", "/responses"],
            },
            {"id": "gpt-4.1", "capabilities": {"type": "chat"}},
        ),
    )

    result = discover_models("copilot", token="token")

    assert [model.id for model in result.models] == ["gpt-5.2", "gpt-4.1"]
    assert result.models[0].capabilities["api_mode"] == "chat"
    assert result.models[0].capabilities["supported_endpoints"] == [
        "/v1/chat/completions",
        "/v1/responses",
    ]
    assert result.models[1].capabilities["api_mode"] == "chat"
    assert "supported_endpoints" not in result.models[1].capabilities


@verifies(SWR.SWR_2810, SWR.SWR_2812, SWR.SWR_2813)
@respx.mock
def test_discover_models_tags_uncallable_copilot_models_with_their_cause() -> None:
    """Productive use: the picker can show why a listed model cannot be chosen.
    Expected outcome: policy-disabled and unroutable entries survive, each tagged."""
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=_copilot_catalog(
            {
                "id": "gpt-5.6-sol",
                "capabilities": {"type": "chat"},
                "policy": {
                    "state": "disabled",
                    "terms": "Enable this model in your Copilot settings",
                },
                "supported_endpoints": ["/chat/completions"],
            },
            {
                "id": "copilot-search-internal",
                "capabilities": {"type": "chat"},
                "supported_endpoints": ["/search"],
            },
            {"id": "claude-sonnet-4.5", "capabilities": {"type": "chat"}},
        ),
    )

    result = discover_models("copilot", token="token")

    by_id = {model.id: model for model in result.models}
    assert set(by_id) == {"gpt-5.6-sol", "copilot-search-internal", "claude-sonnet-4.5"}

    disabled = by_id["gpt-5.6-sol"].capabilities
    assert disabled["availability"] == "policy_disabled"
    assert disabled["unavailable_detail"] == "Enable this model in your Copilot settings"
    # No route is chosen for something that cannot be dispatched at all.
    assert "api_mode" not in disabled

    unroutable = by_id["copilot-search-internal"].capabilities
    assert unroutable["availability"] == "no_supported_route"
    assert "api_mode" not in unroutable

    assert by_id["claude-sonnet-4.5"].capabilities["availability"] == "available"


@verifies(SWR.SWR_2810, SWR.SWR_2812)
@respx.mock
def test_discover_models_withholds_non_chat_copilot_models() -> None:
    """Productive use: an embeddings model is not a blocked chat model, it is a different
    product. Expected outcome: it never reaches the catalog at all."""
    respx.get("https://api.githubcopilot.com/models").mock(
        return_value=_copilot_catalog(
            {"id": "text-embedding-3-small", "capabilities": {"type": "embeddings"}},
            {"id": "claude-sonnet-4.5", "capabilities": {"type": "chat"}},
        ),
    )

    result = discover_models("copilot", token="token")

    assert [model.id for model in result.models] == ["claude-sonnet-4.5"]


# ---------------------------------------------------------------------------
# DeepSeek discovery tests
# ---------------------------------------------------------------------------


@respx.mock
@verifies(SWR.SWR_740, SWR.SWR_751, SWR.SWR_771)
def test_discover_models_rejects_non_ascii_api_key_before_http() -> None:
    result = discover_models("deepseek", token="sk-test-ä")

    assert result.models == []
    assert result.http_status is None
    assert result.error is not None
    assert "ASCII" in result.error
    assert len(respx.calls) == 0


@verifies(SWR.SWR_751)
@respx.mock
def test_discover_models_parses_deepseek_format() -> None:
    respx.get("https://api.deepseek.com/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {"id": "deepseek-v4-pro", "object": "model", "owned_by": "deepseek"},
                    {"id": "deepseek-v4-flash", "object": "model", "owned_by": "deepseek"},
                ],
            },
        ),
    )

    result = discover_models("deepseek", token="sk-test")

    assert result.error is None
    assert result.http_status == 200
    assert len(result.models) == 2
    assert result.models[0].id == "deepseek-v4-pro"
    assert result.models[0].qualified_id == "deepseek/deepseek-v4-pro"
    assert result.models[0].display_name is None
    assert result.models[1].id == "deepseek-v4-flash"
    assert result.models[1].qualified_id == "deepseek/deepseek-v4-flash"


@verifies(SWR.SWR_752)
@respx.mock
def test_discover_models_applies_deepseek_token_limits() -> None:
    respx.get("https://api.deepseek.com/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {"id": "deepseek-v4-pro", "object": "model", "owned_by": "deepseek"},
                ],
            },
        ),
    )

    result = discover_models("deepseek", token="sk-test")

    assert result.models[0].limits == {
        "context_tokens": 1_048_576,
        "output_tokens": 384_000,
    }


@verifies(SWR.SWR_751)
@respx.mock
def test_discover_models_deepseek_empty_data() -> None:
    respx.get("https://api.deepseek.com/models").mock(
        return_value=httpx.Response(200, json={"object": "list", "data": []}),
    )

    result = discover_models("deepseek", token="sk-test")

    assert result.models == []
    assert result.error is None
    assert result.http_status == 200


@verifies(SWR.SWR_751)
@pytest.mark.parametrize("status", [401, 403])
@respx.mock
def test_discover_models_deepseek_auth_error(status: int) -> None:
    respx.get("https://api.deepseek.com/models").mock(
        return_value=httpx.Response(status, json={"error": "unauthorized"}),
    )

    result = discover_models("deepseek", token="sk-test")

    assert result.models == []
    assert result.http_status == status
    assert result.error == f"Authentication failed for DeepSeek: {status}"


@verifies(SWR.SWR_758)
@respx.mock
def test_discover_models_handles_legacy_deepseek_aliases() -> None:
    """Legacy deepseek-chat / deepseek-reasoner get proper token limits."""
    respx.get("https://api.deepseek.com/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"},
                    {"id": "deepseek-reasoner", "object": "model", "owned_by": "deepseek"},
                ],
            },
        ),
    )

    result = discover_models("deepseek", token="sk-test")

    assert result.error is None
    assert len(result.models) == 2
    assert result.models[0].id == "deepseek-chat"
    assert result.models[0].qualified_id == "deepseek/deepseek-chat"
    assert result.models[0].limits == {"context_tokens": 64_000, "output_tokens": 8_000}
    assert result.models[1].id == "deepseek-reasoner"
    assert result.models[1].qualified_id == "deepseek/deepseek-reasoner"
    assert result.models[1].limits == {"context_tokens": 64_000, "output_tokens": 64_000}
