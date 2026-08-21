"""Tests for model-family-specific variant injection in agent factory."""

from __future__ import annotations

from rotaris_core.agents.factory import _inject_model_family_variant
from rotaris_core.config.schema import PersonaConfig
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_303, SWR.SWR_337, SWR.SWR_338, SWR.SWR_1807)
def test_inject_model_family_variant_gpt_orchestrator() -> None:
    """Test GPT variant injection for orchestrator persona."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance\n- Use structured reasoning",
            "claude": "## Claude-Specific Guidance\n- Use natural language reasoning",
        },
    )
    prompt = "Base orchestrator prompt"
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")

    assert "Base orchestrator prompt" in result
    assert "GPT-Specific Guidance" in result
    assert "Claude-Specific Guidance" not in result


@verifies(SWR.SWR_303, SWR.SWR_338, SWR.SWR_1807)
def test_inject_model_family_variant_claude_orchestrator() -> None:
    """Test Claude variant injection for orchestrator persona."""
    persona = PersonaConfig(
        name="orchestrator",
        model="claude-3-sonnet",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance\n- Use structured reasoning",
            "claude": "## Claude-Specific Guidance\n- Use natural language reasoning",
        },
    )
    prompt = "Base orchestrator prompt"
    result = _inject_model_family_variant(prompt, persona, "claude-3-sonnet")

    assert "Base orchestrator prompt" in result
    assert "Claude-Specific Guidance" in result
    assert "GPT-Specific Guidance" not in result


@verifies(SWR.SWR_303, SWR.SWR_338, SWR.SWR_1807)
def test_inject_model_family_variant_gemini() -> None:
    """Test Gemini variant injection."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gemini-2.0-flash",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance",
            "claude": "## Claude-Specific Guidance",
            "gemini": "## Gemini-Specific Guidance\n- Use multimodal reasoning",
        },
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "gemini-2.0-flash")

    assert "Base prompt" in result
    assert "Gemini-Specific Guidance" in result
    assert "GPT-Specific Guidance" not in result
    assert "Claude-Specific Guidance" not in result


@verifies(SWR.SWR_303)
def test_inject_model_family_variant_no_variants() -> None:
    """Test that prompt is unchanged when no variants are configured."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        model_family_variants=None,
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")

    assert result == prompt


@verifies(SWR.SWR_303)
def test_inject_model_family_variant_empty_variants() -> None:
    """Test that prompt is unchanged when variants dict is empty."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        model_family_variants={},
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")

    assert result == prompt


@verifies(SWR.SWR_303)
def test_inject_model_family_variant_no_matching_family() -> None:
    """Test that prompt is unchanged when model family doesn't match any variant."""
    persona = PersonaConfig(
        name="orchestrator",
        model="ollama-llama3",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance",
            "claude": "## Claude-Specific Guidance",
        },
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "ollama-llama3")

    assert result == prompt


@verifies(SWR.SWR_303, SWR.SWR_341, SWR.SWR_1807)
def test_inject_model_family_variant_case_insensitive() -> None:
    """Test that variant matching is case-insensitive."""
    persona = PersonaConfig(
        name="orchestrator",
        model="GPT-4O",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance",
        },
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "GPT-4O")

    assert "GPT-Specific Guidance" in result


@verifies(SWR.SWR_303, SWR.SWR_339, SWR.SWR_1806, SWR.SWR_1807)
def test_inject_model_family_variant_backend_dev_gpt() -> None:
    """Test GPT variant injection for backend-dev (coding_agent) persona."""
    persona = PersonaConfig(
        name="backend-dev",
        model="gpt-4o",
        model_family_variants={
            "gpt": "## GPT-Specific Autonomy\n- Make autonomous decisions",
            "claude": "## Claude-Specific Autonomy\n- Use implicit reasoning",
        },
    )
    prompt = "Base backend-dev prompt"
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")

    assert "Base backend-dev prompt" in result
    assert "GPT-Specific Autonomy" in result
    assert "Claude-Specific Autonomy" not in result


@verifies(SWR.SWR_303, SWR.SWR_340, SWR.SWR_1807, SWR.SWR_1808)
def test_inject_model_family_variant_planner_claude() -> None:
    """Test Claude variant injection for planner persona."""
    persona = PersonaConfig(
        name="planner",
        model="claude-3-sonnet",
        model_family_variants={
            "claude": "## Claude-Specific Planning\n- Use natural language planning",
            "gpt": "## GPT-Specific Planning\n- Use structured planning",
        },
    )
    prompt = "Base planner prompt"
    result = _inject_model_family_variant(prompt, persona, "claude-3-sonnet")

    assert "Base planner prompt" in result
    assert "Claude-Specific Planning" in result
    assert "GPT-Specific Planning" not in result


@verifies(SWR.SWR_303, SWR.SWR_337, SWR.SWR_341, SWR.SWR_1807)
def test_inject_model_family_variant_preserves_prompt_structure() -> None:
    """Test that variant injection preserves the base prompt structure."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance",
        },
    )
    prompt = "# Main Section\n\nBase content"
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")

    # Original prompt should be intact
    assert "# Main Section" in result
    assert "Base content" in result
    # Variant should be appended
    assert "GPT-Specific Guidance" in result
    # Variant should come after original prompt
    assert result.index("Base content") < result.index("GPT-Specific Guidance")


@verifies(SWR.SWR_303)
def test_inject_model_family_variant_empty_prompt() -> None:
    """Test variant injection with empty base prompt."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance",
        },
    )
    prompt = ""
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")

    # Should return just the variant when base prompt is empty
    assert result == "## GPT-Specific Guidance"


@verifies(SWR.SWR_303)
def test_inject_model_family_variant_multiline_variant() -> None:
    """Test variant injection with multiline variant text."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        model_family_variants={
            "gpt": "## GPT-Specific Guidance\n- Point 1\n- Point 2\n- Point 3",
        },
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")

    assert "Base prompt" in result
    assert "## GPT-Specific Guidance" in result
    assert "- Point 1" in result
    assert "- Point 2" in result
    assert "- Point 3" in result
