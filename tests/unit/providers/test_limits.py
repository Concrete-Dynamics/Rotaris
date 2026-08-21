from __future__ import annotations

from rotaris_core.providers import limits
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_727, SWR.SWR_842, SWR.SWR_845)
def test_apply_known_token_limits_uses_exact_registry_match() -> None:
    resolved = limits.apply_known_token_limits("openai/gpt-4o", {})

    assert resolved == {"context_tokens": 128000, "output_tokens": 16384}


@verifies(SWR.SWR_727, SWR.SWR_845)
def test_apply_known_token_limits_uses_versionless_model_match() -> None:
    resolved = limits.apply_known_token_limits("openai/gpt-4o-2024-08-06", {})

    assert resolved == {"context_tokens": 128000, "output_tokens": 16384}


@verifies(SWR.SWR_727, SWR.SWR_845)
def test_apply_known_token_limits_uses_provider_alias_match() -> None:
    resolved = limits.apply_known_token_limits("copilot/gpt-4o-mini", {})

    assert resolved == {"context_tokens": 128000, "output_tokens": 16384}


@verifies(SWR.SWR_727, SWR.SWR_847)
def test_apply_known_token_limits_uses_prefix_fallback() -> None:
    resolved = limits.apply_known_token_limits("deepseek/deepseek-v4-preview", {})

    assert resolved == {"context_tokens": 1_048_576, "output_tokens": 384_000}


@verifies(SWR.SWR_727, SWR.SWR_846)
def test_apply_known_token_limits_leaves_unknown_model_unset() -> None:
    assert limits.apply_known_token_limits("openai/unknown-model", {}) == {}


# ---------------------------------------------------------------------------
# DeepSeek legacy alias tests — REQ-20260528-009
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_758)
def test_apply_known_token_limits_handles_legacy_deepseek_chat_alias() -> None:
    """deepseek-chat is a legacy alias; should still get known token limits."""
    resolved = limits.apply_known_token_limits("deepseek/deepseek-chat", {})

    assert resolved == {"context_tokens": 64_000, "output_tokens": 8_000}


@verifies(SWR.SWR_758)
def test_apply_known_token_limits_handles_legacy_deepseek_reasoner_alias() -> None:
    """deepseek-reasoner is a legacy alias; should still get known token limits."""
    resolved = limits.apply_known_token_limits("deepseek/deepseek-reasoner", {})

    assert resolved == {"context_tokens": 64_000, "output_tokens": 64_000}
