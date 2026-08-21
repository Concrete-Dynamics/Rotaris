from __future__ import annotations

import pytest

from rotaris_core.providers.copilot_model_registry import register_copilot_responses_model
from rotaris_core.reqtocode import SWR, verifies


@pytest.fixture(autouse=True)
def _restore_litellm_model_cost():
    """Keep registrations from leaking into LiteLLM's process-wide cost map."""
    import litellm

    original = dict(litellm.model_cost)
    yield
    litellm.model_cost.clear()
    litellm.model_cost.update(original)


def _resolved_mode(model_id: str) -> str | None:
    from litellm.main import responses_api_bridge_check

    model_info, _ = responses_api_bridge_check(model_id, "github_copilot")
    mode = model_info.get("mode")
    return mode if isinstance(mode, str) else None


@verifies(SWR.SWR_2810, SWR.SWR_2811)
def test_registering_a_responses_model_makes_litellm_bridge_the_call() -> None:
    """Productive use: an operator runs a Copilot model that only speaks /responses.
    Expected outcome: LiteLLM resolves it as responses-mode and bridges the request."""
    assert _resolved_mode("gpt-5.6-terra") != "responses"

    register_copilot_responses_model(
        "gpt-5.6-terra",
        max_input_tokens=272_000,
        max_output_tokens=128_000,
    )

    assert _resolved_mode("gpt-5.6-terra") == "responses"

    import litellm

    entry = litellm.model_cost["github_copilot/gpt-5.6-terra"]
    assert entry["litellm_provider"] == "github_copilot"
    assert entry["supported_endpoints"] == ["/v1/responses"]
    assert entry["max_input_tokens"] == 272_000
    assert entry["max_output_tokens"] == 128_000


@verifies(SWR.SWR_2811)
def test_registering_twice_is_idempotent() -> None:
    """Productive use: every LLM construction re-registers without side effects.
    Expected outcome: the resolved mode is stable across repeated registrations."""
    register_copilot_responses_model("gpt-5.6-luna")
    register_copilot_responses_model("gpt-5.6-luna")

    assert _resolved_mode("gpt-5.6-luna") == "responses"


@verifies(SWR.SWR_2811)
def test_registration_leaves_chat_models_alone() -> None:
    """Productive use: enabling a responses model must not disturb working models.
    Expected outcome: a chat-routed Copilot model keeps resolving as chat."""
    register_copilot_responses_model("gpt-5.6-terra")

    assert _resolved_mode("claude-sonnet-4.5") == "chat"


@verifies(SWR.SWR_2811)
def test_registration_rejects_an_empty_model_id() -> None:
    """Productive use: a malformed catalog entry surfaces instead of silently routing.
    Expected outcome: registering without a model id raises."""
    with pytest.raises(ValueError, match="without an id"):
        register_copilot_responses_model("")
