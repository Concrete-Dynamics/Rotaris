from __future__ import annotations

import pytest
from pydantic import ValidationError

from rotaris_core.providers import PickedModels, pick_default_models
from rotaris_core.providers.discovery import DiscoveredModel
from rotaris_core.reqtocode import SWR, verifies


def model(model_id: str) -> DiscoveredModel:
    return DiscoveredModel(id=model_id)


def provider_model(provider_id: str, model_id: str) -> DiscoveredModel:
    return DiscoveredModel(id=model_id, qualified_id=f"{provider_id}/{model_id}")


@verifies(SWR.SWR_727)
def test_pick_default_models_returns_none_for_empty_input() -> None:
    picked = pick_default_models([])

    assert picked == PickedModels()


@verifies(SWR.SWR_727)
def test_pick_default_models_prefers_gpt_5_family() -> None:
    picked = pick_default_models([model("gpt-5"), model("gpt-5-mini"), model("gpt-5-nano")])

    assert picked.large_model == "gpt-5"
    assert picked.medium_model == "gpt-5-mini"
    assert picked.small_model == "gpt-5-nano"


@verifies(SWR.SWR_727)
def test_pick_default_models_returns_qualified_ids_when_available() -> None:
    picked = pick_default_models(
        [
            provider_model("copilot", "gpt-5"),
            provider_model("copilot", "gpt-5-mini"),
            provider_model("copilot", "gpt-5-nano"),
        ],
    )

    assert picked.large_model == "copilot/gpt-5"
    assert picked.medium_model == "copilot/gpt-5-mini"
    assert picked.small_model == "copilot/gpt-5-nano"


@verifies(SWR.SWR_727)
def test_pick_default_models_finds_distinct_copilot_style_tiers() -> None:
    picked = pick_default_models(
        [model("gpt-4o"), model("gpt-4o-mini"), model("claude-3-7-sonnet"), model("claude-haiku")],
    )

    assert picked.large_model == "gpt-4o"
    assert picked.medium_model == "gpt-4o-mini"
    assert picked.small_model == "claude-haiku"


@verifies(SWR.SWR_727)
def test_pick_default_models_single_gpt_4o_only_picks_large() -> None:
    picked = pick_default_models([model("gpt-4o")])

    assert picked.large_model == "gpt-4o"
    assert picked.medium_model is None
    assert picked.small_model is None


@verifies(SWR.SWR_727)
def test_pick_default_models_dedupes_single_gpt_4o_mini() -> None:
    picked = pick_default_models([model("gpt-4o-mini")])

    assert picked.large_model is None
    assert picked.medium_model == "gpt-4o-mini"
    assert picked.small_model is None


@verifies(SWR.SWR_727)
def test_pick_default_models_matches_case_insensitively() -> None:
    picked = pick_default_models([model("GPT-5")])

    assert picked.large_model == "GPT-5"


@verifies(SWR.SWR_727)
def test_pick_default_models_handles_claude_opus_alone() -> None:
    picked = pick_default_models([model("claude-opus")])

    assert picked.large_model == "claude-opus"
    assert picked.medium_model is None
    assert picked.small_model is None


@verifies(SWR.SWR_727)
def test_pick_default_models_uses_small_fallback_over_missing_medium() -> None:
    picked = pick_default_models([model("gpt-3.5-turbo"), model("gpt-4o")])

    assert picked.large_model == "gpt-4o"
    assert picked.medium_model is None
    assert picked.small_model == "gpt-3.5-turbo"


@verifies(SWR.SWR_727)
def test_pick_default_models_picks_codex_mini_for_medium_fallback() -> None:
    picked = pick_default_models([model("codex-mini")])

    assert picked.large_model is None
    assert picked.medium_model == "codex-mini"
    assert picked.small_model is None


@verifies(SWR.SWR_727)
def test_pick_default_models_finds_distinct_opus_and_turbo_family_picks() -> None:
    picked = pick_default_models(
        [model("opus"), model("gpt-4o"), model("gpt-4o-mini"), model("gpt-3.5-turbo")],
    )

    assert picked.large_model == "gpt-4o"
    assert picked.medium_model == "gpt-4o-mini"
    assert picked.small_model == "gpt-3.5-turbo"


@verifies(SWR.SWR_727)
def test_picked_models_is_frozen() -> None:
    picked = PickedModels()

    with pytest.raises(ValidationError):
        picked.small_model = "gpt-4o-mini"


# ---------------------------------------------------------------------------
# DeepSeek picker tests
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_727, SWR.SWR_753)
def test_pick_deepseek_v4_pro_for_large() -> None:
    picked = pick_default_models([model("deepseek-v4-pro"), model("deepseek-v4-flash")])

    assert picked.large_model == "deepseek-v4-pro"
    assert picked.medium_model == "deepseek-v4-flash"
    assert picked.small_model is None  # only 2 models; flash used for medium


@verifies(SWR.SWR_727, SWR.SWR_753)
def test_pick_deepseek_v4_flash_for_medium_and_small() -> None:
    picked = pick_default_models([model("deepseek-v4-flash")])

    assert picked.large_model is None
    assert picked.medium_model == "deepseek-v4-flash"
    assert picked.small_model is None


@verifies(SWR.SWR_727)
def test_pick_deepseek_gpt_takes_priority_over_deepseek_for_large() -> None:
    """GPT-5 patterns appear before DeepSeek in preferred lists, so GPT-5 wins."""
    picked = pick_default_models([model("gpt-5"), model("deepseek-v4-pro")])

    assert picked.large_model == "gpt-5"
    assert picked.medium_model is None
    assert picked.small_model is None


@verifies(SWR.SWR_727, SWR.SWR_753)
def test_pick_deepseek_qualified_ids() -> None:
    picked = pick_default_models(
        [
            provider_model("deepseek", "deepseek-v4-pro"),
            provider_model("deepseek", "deepseek-v4-flash"),
        ],
    )

    assert picked.large_model == "deepseek/deepseek-v4-pro"
    assert picked.medium_model == "deepseek/deepseek-v4-flash"
    assert picked.small_model is None  # only 2 models; flash used for medium
