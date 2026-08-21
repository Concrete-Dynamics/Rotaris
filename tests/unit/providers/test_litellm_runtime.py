from __future__ import annotations

import warnings

import litellm
import pytest

from rotaris_core.providers import litellm_runtime
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_865)
def test_configure_litellm_runtime_disables_chunk_logging(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(litellm, "disable_streaming_logging", False)
    monkeypatch.setattr(litellm_runtime, "_announced", False)

    litellm_runtime.configure_litellm_runtime()
    litellm_runtime.configure_litellm_runtime()

    assert litellm.disable_streaming_logging is True
    assert litellm_runtime._announced is True


@verifies(SWR.SWR_865)
def test_configure_litellm_runtime_rejects_missing_switch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delattr(litellm, "disable_streaming_logging")

    with pytest.raises(RuntimeError, match="disable_streaming_logging"):
        litellm_runtime.configure_litellm_runtime()


def _warn_like_openhands_telemetry(model: str, times: int) -> None:
    """Reproduce the SDK's per-completion unknown-pricing warning."""
    for _ in range(times):
        warnings.warn(
            f"Cost calculation failed: This model isn't mapped yet. model={model}, "
            "custom_llm_provider=openai.",
            UserWarning,
            stacklevel=2,
        )


@verifies(SWR.SWR_838, SWR.SWR_840)
def test_repeated_unknown_pricing_warning_surfaces_once_per_model() -> None:
    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        litellm_runtime.dedupe_cost_calculation_warnings()
        _warn_like_openhands_telemetry("Qwen/Qwen3.6-35B-A3B", times=5)

    messages = [str(item.message) for item in recorded]
    assert len(messages) == 1
    assert "Qwen/Qwen3.6-35B-A3B" in messages[0]


@verifies(SWR.SWR_840)
def test_distinct_models_each_keep_their_own_pricing_warning() -> None:
    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        litellm_runtime.dedupe_cost_calculation_warnings()
        _warn_like_openhands_telemetry("model-a", times=3)
        _warn_like_openhands_telemetry("model-b", times=3)

    messages = [str(item.message) for item in recorded]
    assert len(messages) == 2
    assert "model=model-a" in messages[0]
    assert "model=model-b" in messages[1]


@verifies(SWR.SWR_840)
def test_dedupe_leaves_unrelated_warnings_untouched() -> None:
    """The filter is scoped to the cost message; other warnings keep their policy."""
    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        litellm_runtime.dedupe_cost_calculation_warnings()
        for _ in range(3):
            warnings.warn("Something else entirely", UserWarning, stacklevel=2)

    assert len(recorded) == 3


@verifies(SWR.SWR_840)
def test_configure_litellm_runtime_installs_the_dedupe_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(litellm, "disable_streaming_logging", False)

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        litellm_runtime.configure_litellm_runtime()
        _warn_like_openhands_telemetry("unmapped-model", times=4)

    assert len(recorded) == 1
