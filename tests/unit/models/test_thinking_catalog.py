from __future__ import annotations

import litellm
import pytest

from rotaris_core.models.thinking_catalog import (
    resolve_reasoning_control,
    supported_reasoning_levels,
)
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_2096)
@pytest.mark.parametrize(
    ("level", "effort"),
    [("low", "low"), ("medium", "medium"), ("high", "high"), ("max", "xhigh")],
)
def test_resolve_reasoning_control_uses_litellm_vocabulary(level: str, effort: str) -> None:
    resolved = resolve_reasoning_control(
        model_name="any/model",
        provider="any",
        level=level,  # type: ignore[arg-type]
    )

    assert resolved.source == "litellm"
    assert resolved.effort == effort


@verifies(SWR.SWR_2096, SWR.SWR_852)
def test_supported_reasoning_levels_follow_litellm_metadata(monkeypatch) -> None:
    monkeypatch.setattr(
        litellm,
        "get_supported_openai_params",
        lambda **_kwargs: ["reasoning_effort"],
    )
    monkeypatch.setattr(
        litellm,
        "get_model_info",
        lambda **_kwargs: {
            "supports_low_reasoning_effort": False,
            "supports_xhigh_reasoning_effort": True,
        },
    )

    assert supported_reasoning_levels("openai/gpt-test", "openai") == (
        "medium",
        "high",
        "max",
    )


@verifies(SWR.SWR_2096, SWR.SWR_852)
def test_model_without_litellm_reasoning_support_has_no_levels(monkeypatch) -> None:
    monkeypatch.setattr(
        litellm,
        "get_supported_openai_params",
        lambda **_kwargs: ["temperature"],
    )

    assert supported_reasoning_levels("custom/plain-model", "custom") == ()
