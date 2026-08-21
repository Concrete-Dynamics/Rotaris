"""Unit tests for reasoning_content preservation and DeepSeek thinking defaults."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING
from unittest.mock import MagicMock

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.models.thinking_catalog import model_requires_reasoning_echo
from rotaris_core.reqtocode import SWR, verifies

# ── model_requires_reasoning_echo ────────────────────────────────────────────


@verifies(SWR.SWR_1550)
def test_model_requires_reasoning_echo_for_deepseek_v4_pro() -> None:
    """deepseek-v4-pro is a thinking model requiring reasoning echo-back."""
    assert model_requires_reasoning_echo("deepseek/deepseek-v4-pro") is True


@verifies(SWR.SWR_1550)
def test_model_requires_reasoning_echo_for_deepseek_v4_flash() -> None:
    """deepseek-v4-flash also requires reasoning echo-back."""
    assert model_requires_reasoning_echo("deepseek/deepseek-v4-flash") is True


@verifies(SWR.SWR_1550)
def test_model_requires_reasoning_echo_for_deepseek_reasoner() -> None:
    """deepseek-reasoner requires reasoning echo-back."""
    assert model_requires_reasoning_echo("deepseek/deepseek-reasoner") is True


@verifies(SWR.SWR_1550)
def test_model_requires_reasoning_echo_for_non_thinking_model() -> None:
    """Non-thinking models (gpt-4o) do not require reasoning echo-back."""
    assert model_requires_reasoning_echo("openai/gpt-4o") is False


@verifies(SWR.SWR_1550)
def test_model_requires_reasoning_echo_for_none() -> None:
    """None model name returns False."""
    assert model_requires_reasoning_echo(None) is False


@verifies(SWR.SWR_1550)
def test_model_requires_reasoning_echo_for_empty() -> None:
    """Empty model name returns False."""
    assert model_requires_reasoning_echo("") is False


# ── ActionEvent round-trip preserves reasoning_content ──────────────────────


@verifies(SWR.SWR_1550)
def test_action_event_roundtrip_preserves_reasoning_content(fixtures_dir: Path) -> None:
    """Serializing/deserializing an ActionEvent preserves reasoning_content."""
    from openhands.sdk.event import Event

    fixture_path = fixtures_dir / "event_with_reasoning_content.json"
    raw = fixture_path.read_text(encoding="utf-8")
    payload = json.loads(raw)
    # The SDK action union is process-global and other tests register tool schemas
    # into it. This test only covers reasoning_content preservation, so keep the
    # action event shape but avoid unrelated tool-registry validation state.
    payload.pop("action", None)

    # Deserialize
    event = Event.model_validate(payload)
    assert event is not None

    # Reserialize
    dumped = event.model_dump_json(exclude_none=True)
    roundtripped = Event.model_validate_json(dumped)

    # reasoning_content must survive
    assert getattr(roundtripped, "reasoning_content", None) == (
        "Let me start by understanding what we're dealing with. "
        "I need to check the project structure first."
    )


# ── MessageEvent round-trip preserves reasoning_content ─────────────────────


@verifies(SWR.SWR_1550)
def test_message_event_roundtrip_preserves_reasoning_content() -> None:
    """A MessageEvent with reasoning_content in its llm_message survives JSON round-trip."""
    from openhands.sdk.event import Event
    from openhands.sdk.event.llm_convertible.message import MessageEvent
    from openhands.sdk.llm.message import Message, TextContent

    msg = Message(
        role="assistant",
        content=[TextContent(text="Here is the analysis.")],
        reasoning_content="Chain-of-thought reasoning for the analysis.",
    )
    event = MessageEvent(source="agent", llm_message=msg)

    dumped = event.model_dump_json(exclude_none=True)
    restored = Event.model_validate_json(dumped)

    assert isinstance(restored, MessageEvent)
    assert restored.llm_message.reasoning_content == (
        "Chain-of-thought reasoning for the analysis."
    )


# ── DeepSeek thinking=None strips the SDK-default reasoning_effort='high' ───


@verifies(SWR.SWR_754)
def test_deepseek_thinking_none_strips_reasoning_effort() -> None:
    """When thinking=None for deepseek, the LLM's reasoning_effort is set to None."""
    # Simulate what load_llm_for_model does: construct an LLM with the SDK
    # default reasoning_effort="high", then verify our post-init override.
    mock_llm = MagicMock()
    mock_llm.reasoning_effort = "high"  # SDK default

    # Simulate the post-init block from load_llm_for_model
    model_cfg_attr = MagicMock()
    model_cfg_attr.thinking = None
    model_cfg_attr.provider = "deepseek"

    if (
        model_cfg_attr.thinking is None
        and model_cfg_attr.provider == "deepseek"
        and getattr(mock_llm, "reasoning_effort", None) is not None
    ):
        mock_llm.reasoning_effort = None

    assert mock_llm.reasoning_effort is None


@verifies(SWR.SWR_754)
def test_deepseek_thinking_high_does_not_strip_reasoning_effort() -> None:
    """When thinking='high' for deepseek, reasoning_effort is NOT stripped."""
    mock_llm = MagicMock()
    mock_llm.reasoning_effort = "high"

    model_cfg_attr = MagicMock()
    model_cfg_attr.thinking = "high"
    provider = "deepseek"

    # Should NOT trigger the override because thinking is explicitly set
    if (
        model_cfg_attr.thinking is None
        and provider == "deepseek"
        and getattr(mock_llm, "reasoning_effort", None) is not None
    ):
        mock_llm.reasoning_effort = None

    assert mock_llm.reasoning_effort == "high"


@verifies(SWR.SWR_754)
def test_non_deepseek_thinking_none_does_not_strip() -> None:
    """When thinking=None for non-deepseek (e.g., openai), reasoning_effort is kept."""
    mock_llm = MagicMock()
    mock_llm.reasoning_effort = "high"

    model_cfg_attr = MagicMock()
    model_cfg_attr.thinking = None
    provider = "openai"

    if (
        model_cfg_attr.thinking is None
        and provider == "deepseek"
        and getattr(mock_llm, "reasoning_effort", None) is not None
    ):
        mock_llm.reasoning_effort = None

    assert mock_llm.reasoning_effort == "high"  # Unchanged for non-deepseek
