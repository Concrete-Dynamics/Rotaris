"""Per-model response-format capability resolution for the structured-output ladders.

The resolver is driven with plain dicts and monkeypatched LiteLLM metadata —
no provider is ever reached.
"""

from __future__ import annotations

import litellm
import pytest

from rotaris_core.models.response_format_catalog import normalize_response_formats
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit

_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {"name": "x", "strict": True, "schema": {"type": "object"}},
}
_JSON_OBJECT = {"type": "json_object"}
_LADDER = (_JSON_SCHEMA, _JSON_OBJECT, None)


@verifies(SWR.SWR_921)
def test_a_deepseek_model_gets_json_object_where_json_schema_was_asked() -> None:
    """Productive use: a workspace judges and classifies on a DeepSeek model.

    Expected outcome: the strict schema is never offered — the rung becomes
    json_object and the ladder is deduplicated, so no refusal round trip happens.
    """
    assert normalize_response_formats(_LADDER, model="deepseek/deepseek-v4-pro") == (
        _JSON_OBJECT,
        None,
    )


@verifies(SWR.SWR_921)
def test_a_deepseek_provider_named_by_configuration_maps_the_same_way() -> None:
    """Productive use: startup classification knows the provider, not a qualified id.

    Expected outcome: the mapping applies through the provider parameter alone.
    """
    assert normalize_response_formats(
        _LADDER,
        model="deepseek-small",
        provider="deepseek",
    ) == (
        _JSON_OBJECT,
        None,
    )


@verifies(SWR.SWR_921)
def test_a_deepseek_ladder_without_a_schema_is_left_alone() -> None:
    assert normalize_response_formats(
        (_JSON_OBJECT, None),
        model="deepseek/deepseek-v4-pro",
    ) == (_JSON_OBJECT, None)


@verifies(SWR.SWR_921)
def test_a_model_whose_metadata_omits_response_format_gets_only_the_unconstrained_rung(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a model cannot take any response_format at all.

    Expected outcome: both typed rungs are dropped ahead of the first call, and
    the unconstrained last rung stays.
    """
    monkeypatch.setattr(
        litellm,
        "get_supported_openai_params",
        lambda **_kwargs: ["temperature"],
    )

    assert normalize_response_formats(_LADDER, model="anthropic/claude-sonnet-4") == (None,)


@verifies(SWR.SWR_921)
def test_a_model_whose_metadata_lists_response_format_keeps_the_ladder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        litellm,
        "get_supported_openai_params",
        lambda **_kwargs: ["response_format", "tools"],
    )

    assert normalize_response_formats(_LADDER, model="openai/gpt-4o") == _LADDER


@verifies(SWR.SWR_921)
def test_unreadable_metadata_leaves_the_ladder_to_the_runtime_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: a private model has no capability metadata at all.

    Expected outcome: the ladder is untouched — the runtime refusal memory
    (SWR-919) is the only source left.
    """

    def _unknown(**kwargs: object) -> object:
        del kwargs
        raise ValueError("unknown provider")

    monkeypatch.setattr(litellm, "get_supported_openai_params", _unknown)

    assert normalize_response_formats(_LADDER, model="custom/private-model") == _LADDER


@verifies(SWR.SWR_921)
def test_a_model_nobody_named_is_never_changed() -> None:
    """Productive use: a judge driven through an injected completion names no model.

    Expected outcome: the ladder stays intact — assuming a refusal would silently
    drop the closed set for a model that honours it (SWR-919).
    """
    assert normalize_response_formats(_LADDER, model="") == _LADDER
