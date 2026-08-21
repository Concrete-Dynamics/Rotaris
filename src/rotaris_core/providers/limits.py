from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping

_INPUT_LIMIT_KEYS = (
    "context_tokens",
    "max_input_tokens",
    "context_window",
    "max_context_window_tokens",
    "max_context_tokens",
    "context_length",
    "max_prompt_tokens",
    "input_tokens",
    "token_limit",
    "max_tokens",
)

_OUTPUT_LIMIT_KEYS = (
    "output_tokens",
    "max_output_tokens",
    "max_completion_tokens",
)


@traces(SWR.SWR_844, SWR.SWR_846)
def extract_token_limits(limits: Mapping[str, Any]) -> tuple[int | None, int | None]:
    """Return canonical input/output token limits from provider-native metadata."""
    return _first_int(limits, _INPUT_LIMIT_KEYS), _first_int(limits, _OUTPUT_LIMIT_KEYS)


# Known token limits keyed by canonical ``qualified_id`` (``provider/model``).
# Entries ending with ``/`` are provider-family wildcard defaults.
_KNOWN_MODEL_LIMITS: dict[str, tuple[int, int]] = {
    # OpenAI
    "openai/gpt-3.5-turbo": (16_384, 4_096),
    "openai/gpt-4": (8_192, 8_192),
    "openai/gpt-4-32k": (32_768, 32_768),
    "openai/gpt-4-turbo": (128_000, 16_384),
    "openai/gpt-4o": (128_000, 16_384),
    "openai/gpt-4o-mini": (128_000, 16_384),
    "openai/gpt-4.1": (1_000_000, 32_768),
    "openai/gpt-4.1-mini": (1_000_000, 32_768),
    "openai/gpt-4.1-nano": (1_000_000, 32_768),
    "openai/o1": (200_000, 100_000),
    "openai/o1-mini": (200_000, 100_000),
    "openai/o3": (200_000, 100_000),
    "openai/o3-mini": (200_000, 100_000),
    "openai/o4-mini": (200_000, 100_000),
    "openai/gpt-5": (400_000, 128_000),
    "openai/gpt-5-mini": (400_000, 128_000),
    "openai/gpt-5-nano": (400_000, 128_000),
    "openai/gpt-5.4": (1_100_000, 128_000),
    "openai/gpt-5.4-mini": (272_000, 128_000),
    "openai/gpt-5.4-nano": (272_000, 128_000),
    "openai/gpt-5.5": (1_100_000, 128_000),
    # Anthropic
    "anthropic/claude-3-opus": (200_000, 4_096),
    "anthropic/claude-3-sonnet": (200_000, 4_096),
    "anthropic/claude-3-haiku": (200_000, 4_096),
    "anthropic/claude-3-5-sonnet": (200_000, 8_192),
    "anthropic/claude-3-5-haiku": (200_000, 8_192),
    "anthropic/claude-3-7-sonnet": (200_000, 64_000),
    "anthropic/claude-sonnet-4": (200_000, 64_000),
    "anthropic/claude-sonnet-4-5": (200_000, 64_000),
    "anthropic/claude-sonnet-4-6": (1_000_000, 128_000),
    "anthropic/claude-opus-4": (200_000, 32_000),
    "anthropic/claude-opus-4-1": (200_000, 32_000),
    "anthropic/claude-opus-4-5": (200_000, 64_000),
    "anthropic/claude-opus-4-6": (1_000_000, 128_000),
    "anthropic/claude-opus-4-7": (1_000_000, 128_000),
    # DeepSeek
    "deepseek/deepseek-v4-pro": (1_048_576, 384_000),
    "deepseek/deepseek-v4-flash": (1_048_576, 384_000),
    "deepseek/deepseek-v3": (163_840, 8_000),
    "deepseek/deepseek-v3.1": (163_840, 8_192),
    "deepseek/deepseek-v3.2": (163_840, 8_192),
    "deepseek/deepseek-r1": (163_840, 64_000),
    "deepseek/deepseek-chat": (64_000, 8_000),
    "deepseek/deepseek-reasoner": (64_000, 64_000),
    # Wildcard defaults
    "deepseek/": (1_048_576, 384_000),
}

_PROVIDER_ALIASES: dict[str, str] = {
    "codex": "openai",
    "copilot": "openai",
}
_OPENAI_COMPATIBLE_INSTANCE_PREFIX = "openai-compatible--"
_COMMON_MODEL_SUFFIX_PATTERNS = (
    re.compile(r"^(?P<base>.+)-latest$"),
    re.compile(r"^(?P<base>.+)-\d{4}-\d{2}-\d{2}$"),
    re.compile(r"^(?P<base>.+)-\d{8}$"),
)
_DEEPSEEK_RELEASE_SUFFIX_RE = re.compile(r"^(?P<base>deepseek-.+)-\d{4}$")


@traces(SWR.SWR_758, SWR.SWR_842, SWR.SWR_847, SWR.SWR_848)
def resolve_known_token_limits(*qualified_ids: str) -> tuple[int | None, int | None]:
    """Resolve known token limits from one or more qualified model IDs."""
    for qualified_id in qualified_ids:
        match = _resolve_limits_for_qualified_id(qualified_id)
        if match != (None, None):
            return match
    return None, None


@traces(SWR.SWR_752, SWR.SWR_845)
def apply_known_token_limits(
    qualified_id: str,
    limits: dict[str, Any],
) -> dict[str, Any]:
    """Inject known token limits when discovery returned no explicit limits."""
    input_limit, output_limit = extract_token_limits(limits)
    if input_limit is not None and output_limit is not None:
        return limits

    known_input, known_output = resolve_known_token_limits(qualified_id)
    if known_input is None and known_output is None:
        return limits

    updated = dict(limits)
    if input_limit is None and known_input is not None:
        updated["context_tokens"] = known_input
    if output_limit is None and known_output is not None:
        updated["output_tokens"] = known_output
    return updated


def _resolve_limits_for_qualified_id(qualified_id: str) -> tuple[int | None, int | None]:
    provider_id, separator, model_id = qualified_id.partition("/")
    if not separator or not model_id:
        return None, None

    for candidate in _qualified_id_candidates(provider_id, model_id):
        match = _KNOWN_MODEL_LIMITS.get(candidate)
        if match is not None:
            return match

    for prefix in _provider_prefix_candidates(provider_id):
        match = _KNOWN_MODEL_LIMITS.get(prefix)
        if match is not None:
            return match

    return None, None


def _qualified_id_candidates(provider_id: str, model_id: str) -> list[str]:
    candidates: list[str] = []
    provider_candidates = _provider_id_candidates(provider_id)
    model_candidates = _model_id_candidates(model_id)

    for candidate_provider in provider_candidates:
        for candidate_model in model_candidates:
            qualified_id = f"{candidate_provider}/{candidate_model}"
            if qualified_id not in candidates:
                candidates.append(qualified_id)

    return candidates


def _provider_prefix_candidates(provider_id: str) -> list[str]:
    prefixes: list[str] = []
    for candidate_provider in _provider_id_candidates(provider_id):
        prefix = f"{candidate_provider}/"
        if prefix not in prefixes:
            prefixes.append(prefix)
    return prefixes


def _provider_id_candidates(provider_id: str) -> list[str]:
    candidates = [provider_id]
    if provider_id.startswith(_OPENAI_COMPATIBLE_INSTANCE_PREFIX):
        candidates.append("openai-compatible")

    alias = _PROVIDER_ALIASES.get(provider_id)
    if alias is not None and alias not in candidates:
        candidates.append(alias)

    return candidates


def _model_id_candidates(model_id: str) -> list[str]:
    candidates = [model_id]
    current = model_id
    while True:
        stripped = _strip_known_model_suffix(current)
        if stripped is None or stripped in candidates:
            break
        candidates.append(stripped)
        current = stripped
    return candidates


def _strip_known_model_suffix(model_id: str) -> str | None:
    for pattern in _COMMON_MODEL_SUFFIX_PATTERNS:
        match = pattern.match(model_id)
        if match is not None:
            return str(match.group("base"))

    deepseek_match = _DEEPSEEK_RELEASE_SUFFIX_RE.match(model_id)
    if deepseek_match is not None:
        return str(deepseek_match.group("base"))

    return None


def _first_int(limits: Mapping[str, Any], keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = limits.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int) and value > 0:
            return value
        if isinstance(value, float) and value > 0 and value.is_integer():
            return int(value)
        if isinstance(value, str):
            normalized = value.strip().replace("_", "").replace(",", "")
            if normalized.isdigit() and int(normalized) > 0:
                return int(normalized)
    return None
