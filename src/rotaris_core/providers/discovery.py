from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any, NamedTuple
from urllib.parse import urlparse, urlunparse

import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator

from rotaris_core.providers.catalog import get_provider
from rotaris_core.providers.model_availability import (
    AVAILABLE,
    NO_SUPPORTED_ROUTE,
    POLICY_DISABLED,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping


_CODEX_MODELS_ENDPOINT = "https://chatgpt.com/backend-api/codex/models"
_CODEX_CLIENT_VERSION = "0.144.6"


class DiscoveredModel(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    qualified_id: str = ""
    display_name: str | None = None
    capabilities: dict[str, Any] = Field(default_factory=dict)
    limits: dict[str, Any] = Field(default_factory=dict)
    pricing: dict[str, float] = Field(default_factory=dict)
    raw: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _default_qualified_id(self) -> DiscoveredModel:
        if not self.qualified_id:
            object.__setattr__(self, "qualified_id", self.id)
        return self


class DiscoveryResult(NamedTuple):
    models: list[DiscoveredModel]
    error: str | None
    http_status: int | None
    suggestions: dict[str, str | None] | None = None


def _override_endpoint_host(endpoint: str, api_base: str) -> str:
    """Replace scheme+netloc of ``endpoint`` with the one from ``api_base``.

    ``api_base`` is typically ``https://api.individual.githubcopilot.com`` (or
    ``api.business.githubcopilot.com``) returned by the Copilot session-token
    exchange. The provider descriptor's ``discovery_endpoint`` keeps its path
    (``/models``); only host/scheme are swapped.
    """
    base = urlparse(api_base)
    if not base.scheme or not base.netloc:
        return endpoint
    parsed = urlparse(endpoint)
    return urlunparse(
        (base.scheme, base.netloc, parsed.path, parsed.params, parsed.query, parsed.fragment),
    )


_CHAT_COMPLETIONS_ENDPOINT = "/v1/chat/completions"
_RESPONSES_ENDPOINT = "/v1/responses"


@traces(SWR.SWR_2811)
def normalize_copilot_endpoints(raw: Any) -> list[str]:
    """Translate Copilot's ``supported_endpoints`` into LiteLLM's vocabulary.

    Copilot writes unversioned paths (``/chat/completions``, ``/responses``) and
    also advertises non-HTTP transports (``ws:/responses``). LiteLLM's model
    metadata uses versioned HTTP paths only, so the websocket entries are
    dropped rather than translated: they are not a route Rotaris can dispatch to.
    """
    if not isinstance(raw, list):
        return []
    normalized: list[str] = []
    for entry in raw:
        if not isinstance(entry, str):
            continue
        path = entry.strip()
        if not path.startswith("/"):
            # ``ws:/responses`` and friends — a transport, not an HTTP route.
            continue
        if not path.startswith("/v1/"):
            path = f"/v1{path}"
        if path not in normalized:
            normalized.append(path)
    return normalized


@traces(SWR.SWR_2811)
def copilot_api_mode(endpoints: list[str]) -> str | None:
    """Pick the route for a Copilot model, or ``None`` when it has none.

    Chat wins whenever it is offered, so dual-endpoint models (``gpt-5``,
    ``gpt-5.1``) keep the path they already work on. Legacy entries advertise no
    endpoints at all and route fine on chat, so an empty list means "chat".
    """
    if not endpoints:
        return "chat"
    if _CHAT_COMPLETIONS_ENDPOINT in endpoints:
        return "chat"
    if _RESPONSES_ENDPOINT in endpoints:
        return "responses"
    return None


def normalize_api_base(api_base: str) -> str:
    normalized = api_base.strip().rstrip("/")
    if not normalized:
        raise ValueError("API base URL must not be empty.")
    parsed = urlparse(normalized)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("API base URL must include a scheme and hostname.")
    if parsed.path.endswith("/models"):
        trimmed_path = parsed.path[: -len("/models")] or ""
        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                trimmed_path,
                parsed.params,
                parsed.query,
                parsed.fragment,
            ),
        ).rstrip("/")
    return normalized


def build_models_endpoint(api_base: str) -> str:
    normalized_base = normalize_api_base(api_base)
    return f"{normalized_base}/models"


def _customer_pricing(item: Mapping[str, Any]) -> dict[str, float]:
    raw_pricing = item.get("pricing")
    if not isinstance(raw_pricing, dict):
        return {}
    pricing: dict[str, float] = {}
    for source, target in (
        ("prompt_usd_per_token", "input_cost_per_token"),
        ("completion_usd_per_token", "output_cost_per_token"),
    ):
        value = raw_pricing.get(source)
        if not isinstance(value, str):
            continue
        try:
            decimal = Decimal(value)
        except InvalidOperation:
            continue
        if decimal.is_finite() and decimal >= 0:
            pricing[target] = float(decimal)
    return pricing


def _cloud_suggestions(
    client: httpx.Client,
    *,
    endpoint: str,
    headers: Mapping[str, str],
    qualified_prefix: str,
    model_ids: set[str],
) -> dict[str, str | None] | None:
    try:
        response = client.get(f"{normalize_api_base(endpoint)}/model-suggestions", headers=headers)
        payload = response.json() if response.is_success else None
    except (httpx.HTTPError, ValueError):
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        return None
    suggestions: dict[str, str | None] = {}
    for role in ("small", "medium", "large", "fallback"):
        value = payload["data"].get(role)
        model_id = value.get("id") if isinstance(value, dict) else None
        qualified_id = f"{qualified_prefix}/{model_id}" if isinstance(model_id, str) else None
        suggestions[role] = qualified_id if qualified_id in model_ids else None
    return suggestions


@traces(
    SWR.SWR_740,
    SWR.SWR_751,
    SWR.SWR_777,
    SWR.SWR_782,
    SWR.SWR_2810,
    SWR.SWR_2811,
    SWR.SWR_2813,
)
def discover_models(
    provider_id: str,
    *,
    token: str,
    api_base: str | None = None,
    discovery_endpoint: str | None = None,
    qualified_provider_id: str | None = None,
    display_name: str | None = None,
    extra_headers: Mapping[str, str] | None = None,
    account_id: str | None = None,
    timeout: float = 10.0,
) -> DiscoveryResult:
    provider = get_provider(provider_id)
    if provider.id == "codex":
        return discover_codex_models(
            token=token,
            account_id=account_id,
            qualified_provider_id=qualified_provider_id,
            display_name=display_name,
            timeout=timeout,
        )

    if provider.id == "claude-code":
        # The Agent SDK is a local runtime with no models endpoint: validate
        # the pasted subscription token offline and return the static catalog.
        from rotaris_core.providers.claude_code import (
            claude_code_models,
            subscription_token_validation_error,
        )

        token_error = subscription_token_validation_error(token)
        if token_error is not None:
            return DiscoveryResult(models=[], error=token_error, http_status=None)
        return DiscoveryResult(
            models=claude_code_models(qualified_provider_id=qualified_provider_id),
            error=None,
            http_status=None,
        )

    from rotaris_core.auth.api_key import api_key_validation_error

    validation_error = api_key_validation_error(token)
    if validation_error is not None:
        return DiscoveryResult(models=[], error=validation_error, http_status=None)

    headers: dict[str, str] = {
        "Authorization": f"{provider.discovery_auth_header} {token}",
        "User-Agent": "rotaris/discovery",
    }

    if provider.id == "copilot":
        # Copilot rejects requests without editor-identity headers (returns
        # empty body / HTML, which fails JSON parsing). Inject the same headers
        # we use for the session-token exchange.
        from rotaris_core.auth.copilot_token import COPILOT_INTEGRATION_HEADERS

        headers.update(COPILOT_INTEGRATION_HEADERS)
        headers["Accept"] = "application/json"

    if extra_headers:
        headers.update(extra_headers)

    endpoint = discovery_endpoint or provider.discovery_endpoint
    if api_base:
        endpoint = _override_endpoint_host(endpoint, api_base)
    qualified_prefix = qualified_provider_id or provider.id
    provider_display_name = display_name or provider.display_name

    with httpx.Client(timeout=timeout) as client:
        try:
            response = client.get(endpoint, headers=headers)
        except httpx.TimeoutException as exc:
            return DiscoveryResult(
                models=[],
                error=f"Discovery request failed: {exc}",
                http_status=None,
            )
        except httpx.HTTPError as exc:
            return DiscoveryResult(
                models=[],
                error=f"Discovery request failed: {exc}",
                http_status=None,
            )

    status = response.status_code
    if status in {401, 403}:
        return DiscoveryResult(
            models=[],
            error=f"Authentication failed for {provider_display_name}: {status}",
            http_status=status,
        )

    if status >= 500:
        detail = response.reason_phrase or f"HTTP {status}"
        return DiscoveryResult(
            models=[],
            error=f"Discovery request failed: {detail}",
            http_status=status,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        return DiscoveryResult(
            models=[],
            error=f"Invalid response format: {exc}",
            http_status=status,
        )

    if not isinstance(payload, dict):
        return DiscoveryResult(
            models=[],
            error="Invalid response format: expected JSON object",
            http_status=status,
        )

    data = payload.get("data")
    if not isinstance(data, list):
        return DiscoveryResult(
            models=[],
            error="Invalid response format: expected data list",
            http_status=status,
        )

    if not data:
        return DiscoveryResult(models=[], error=None, http_status=status)

    models: list[DiscoveredModel] = []
    for item in data:
        if not isinstance(item, dict):
            return DiscoveryResult(
                models=[],
                error="Invalid response format: expected model objects",
                http_status=status,
            )
        capabilities = item.get("capabilities")
        if not isinstance(capabilities, dict):
            capabilities = {}
        raw_limits = item.get("limits")
        limits: dict[str, Any] = dict(raw_limits) if isinstance(raw_limits, dict) else {}
        from rotaris_core.providers.limits import apply_known_token_limits

        model_qualified_id = f"{qualified_prefix}/{item['id']}"
        limits = apply_known_token_limits(model_qualified_id, limits)
        display_name = item.get("display_name", item.get("name"))
        if isinstance(item.get("context_length"), int):
            limits.setdefault("context_window", item["context_length"])
        if provider.id == "copilot":
            # Copilot's /models lists everything the account can *see*, which is
            # more than it can call. Only one kind is dropped outright:
            #
            #   capabilities.type == "embeddings" -> not a chat model at all
            #
            # A non-chat type was never a candidate for a run, so hiding it costs
            # the user nothing. The other two rejections are conditions the user
            # can act on, so they are recorded and presented rather than filtered
            # (SWR-2812):
            #
            #   policy.state == "disabled"  -> a toggle in the account's settings
            #   no dispatchable endpoint    -> nothing to send the request to
            #
            # Each check disqualifies only on an explicit negative; legacy entries
            # (gpt-4.1, gpt-4o) carry neither field yet route fine, so an absent
            # field means "usable".
            if capabilities.get("type") not in (None, "chat"):
                continue
            capabilities = {**capabilities}
            policy = item.get("policy")
            endpoints = normalize_copilot_endpoints(item.get("supported_endpoints"))
            api_mode = copilot_api_mode(endpoints)
            if isinstance(policy, dict) and policy.get("state") == "disabled":
                capabilities["availability"] = POLICY_DISABLED
                terms = policy.get("terms")
                if isinstance(terms, str) and terms.strip():
                    capabilities["unavailable_detail"] = terms.strip()
            elif api_mode is None:
                # Advertises endpoints, none of them dispatchable.
                capabilities["availability"] = NO_SUPPORTED_ROUTE
            else:
                capabilities["availability"] = AVAILABLE
                capabilities["api_mode"] = api_mode
            if endpoints:
                capabilities["supported_endpoints"] = endpoints

            models.append(
                DiscoveredModel(
                    id=str(item["id"]),
                    qualified_id=model_qualified_id,
                    display_name=display_name if isinstance(display_name, str) else None,
                    capabilities=capabilities,
                    limits=limits,
                    raw=item,
                ),
            )
        else:
            models.append(
                DiscoveredModel(
                    id=str(item["id"]),
                    qualified_id=model_qualified_id,
                    display_name=display_name if isinstance(display_name, str) else None,
                    capabilities=capabilities,
                    limits=limits,
                    pricing=_customer_pricing(item) if provider.id == "concrete-cloud" else {},
                    raw=item,
                ),
            )
    suggestions = None
    if provider.id == "concrete-cloud":
        with httpx.Client(timeout=timeout) as client:
            suggestions = _cloud_suggestions(
                client,
                endpoint=endpoint,
                headers=headers,
                qualified_prefix=qualified_prefix,
                model_ids={model.qualified_id for model in models},
            )
    return DiscoveryResult(models=models, error=None, http_status=status, suggestions=suggestions)


@traces(SWR.SWR_702, SWR.SWR_727)
def discover_codex_models(
    *,
    token: str,
    account_id: str | None = None,
    qualified_provider_id: str | None = None,
    display_name: str | None = None,
    timeout: float = 10.0,
) -> DiscoveryResult:
    """Discover models granted to a ChatGPT/Codex subscription OAuth session."""
    provider = get_provider("codex")
    headers = {
        "Authorization": f"Bearer {token}",
        "originator": "codex_cli_rs",
        "OpenAI-Beta": "responses=experimental",
        "User-Agent": "rotaris/discovery",
    }
    if account_id:
        headers["chatgpt-account-id"] = account_id

    with httpx.Client(timeout=timeout) as client:
        try:
            response = client.get(
                _CODEX_MODELS_ENDPOINT,
                headers=headers,
                params={"client_version": _CODEX_CLIENT_VERSION},
            )
        except httpx.TimeoutException as exc:
            return DiscoveryResult([], f"Discovery request failed: {exc}", None)
        except httpx.HTTPError as exc:
            return DiscoveryResult([], f"Discovery request failed: {exc}", None)

    status = response.status_code
    provider_display_name = display_name or provider.display_name
    if status in {401, 403}:
        return DiscoveryResult(
            [],
            f"Authentication failed for {provider_display_name}: {status}",
            status,
        )
    if status >= 500:
        detail = response.reason_phrase or f"HTTP {status}"
        return DiscoveryResult([], f"Discovery request failed: {detail}", status)

    try:
        payload = response.json()
    except ValueError as exc:
        return DiscoveryResult([], f"Invalid response format: {exc}", status)
    if not isinstance(payload, dict):
        return DiscoveryResult([], "Invalid response format: expected JSON object", status)

    data = payload.get("models")
    if not isinstance(data, list):
        return DiscoveryResult([], "Invalid response format: expected models list", status)

    qualified_prefix = qualified_provider_id or provider.id
    models: list[DiscoveredModel] = []
    for item in data:
        if not isinstance(item, dict):
            return DiscoveryResult([], "Invalid response format: expected model objects", status)
        slug = item.get("slug")
        if not isinstance(slug, str) or not slug:
            return DiscoveryResult([], "Invalid response format: expected model slug", status)
        if item.get("supported_in_api") is False or item.get("visibility") == "hide":
            continue

        display = item.get("display_name")
        reasoning_levels = item.get("supported_reasoning_levels")
        capabilities: dict[str, Any] = {}
        if isinstance(reasoning_levels, list):
            capabilities["reasoning_levels"] = [
                level for level in reasoning_levels if isinstance(level, str)
            ]
        input_modalities = item.get("input_modalities")
        if isinstance(input_modalities, list):
            capabilities["input_modalities"] = [
                modality for modality in input_modalities if isinstance(modality, str)
            ]
        context_window = item.get("context_window", item.get("max_context_window"))
        limits: dict[str, Any] = {}
        if isinstance(context_window, int):
            limits["context_window"] = context_window

        models.append(
            DiscoveredModel(
                id=slug,
                qualified_id=f"{qualified_prefix}/{slug}",
                display_name=display if isinstance(display, str) else None,
                capabilities=capabilities,
                limits=limits,
                raw=item,
            ),
        )

    return DiscoveryResult(models=models, error=None, http_status=status)
