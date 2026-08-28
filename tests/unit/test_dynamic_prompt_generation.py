"""Unit tests for dynamic prompt generation.

The per-persona section builders (`build_hard_blocks_section`,
`build_anti_patterns_section`, `build_workflow_section`,
`build_troubleshooting_section`, `build_category_skills_guide`) and the
`INTENT_INSTRUCTIONS` / `DELEGATION_STRATEGY` tokens were retired by SWR-2416:
run-varying behaviour now comes from the playbook, and persona-invariant text lives in
the persona prompt file. What remains here is the token substitution machinery itself.
"""

from __future__ import annotations

import pytest

from rotaris_core.agents.prompt_render import (
    PromptRenderContext,
    render_system_prompt,
)
from rotaris_core.reqtocode import SWR, verifies

#: Tokens retired by SWR-2416. A persona prompt using one of these would silently
#: render the literal token text into the agent's system prompt.
RETIRED_TOKENS = (
    "HARD_BLOCKS",
    "ANTI_PATTERNS",
    "WORKFLOW",
    "TROUBLESHOOTING",
    "CATEGORY_SKILLS",
    "INTENT_INSTRUCTIONS",
    "DELEGATION_STRATEGY",
)


@verifies(SWR.SWR_319, SWR.SWR_322, SWR.SWR_348, SWR.SWR_349)
class TestRenderSystemPromptTokens:
    """Token substitution mechanics."""

    @verifies(SWR.SWR_320, SWR.SWR_321)
    def test_persona_and_tool_tokens_render_together(self) -> None:
        template = "You are [[ROTARIS:PERSONA_NAME]].\n\nTools: [[ROTARIS:TOOL_NAMES]]"
        ctx = PromptRenderContext(persona_name="orchestrator", tools=["delegate", "todo"])
        result = render_system_prompt(template, ctx)
        assert "You are orchestrator." in result
        assert "`delegate`, `todo`" in result

    @verifies(SWR.SWR_144, SWR.SWR_2416)
    def test_delegation_mechanics_token_replaced(self) -> None:
        template = "# Prompt\n[[ROTARIS:DELEGATION_MECHANICS]]\n# End"
        result = render_system_prompt(template, PromptRenderContext(persona_name="orchestrator"))
        assert "[[ROTARIS:DELEGATION_MECHANICS]]" not in result
        assert "## Delegation mechanics" in result
        assert "wait_for_tasks" in result
        assert "background_output" in result

    @verifies(SWR.SWR_2416)
    def test_delegation_mechanics_carries_no_fan_out_policy(self) -> None:
        """How widely to fan out is the playbook's BUDGET slot, not the mechanics block."""
        result = render_system_prompt(
            "[[ROTARIS:DELEGATION_MECHANICS]]",
            PromptRenderContext(persona_name="orchestrator"),
        )
        assert "Delegation economy" not in result
        assert "Rule of thumb" not in result

    @verifies(SWR.SWR_319)
    def test_case_sensitive_token_matching(self) -> None:
        template = "[[ROTARIS:persona_name]]\n[[ROTARIS:PERSONA_NAME]]"
        result = render_system_prompt(template, PromptRenderContext(persona_name="orchestrator"))
        assert "[[ROTARIS:persona_name]]" in result
        assert "orchestrator" in result

    @verifies(SWR.SWR_319)
    def test_multiple_same_tokens_all_replaced(self) -> None:
        template = "[[ROTARIS:PERSONA_NAME]]\n\nMore text\n\n[[ROTARIS:PERSONA_NAME]]"
        result = render_system_prompt(template, PromptRenderContext(persona_name="tester"))
        assert result.count("tester") == 2
        assert "[[ROTARIS:" not in result

    @pytest.mark.parametrize("token", RETIRED_TOKENS)
    @verifies(SWR.SWR_2416)
    def test_retired_tokens_are_left_in_place_and_warned_about(
        self,
        token: str,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Unknown tokens must survive visibly, not silently vanish from the prompt."""
        result = render_system_prompt(
            f"[[ROTARIS:{token}]]",
            PromptRenderContext(persona_name="orchestrator"),
        )
        assert f"[[ROTARIS:{token}]]" in result
        assert "Unresolved prompt placeholder" in caplog.text


@verifies(SWR.SWR_322)
class TestPromptRenderContext:
    def test_context_is_frozen(self) -> None:
        ctx = PromptRenderContext(persona_name="orchestrator")
        with pytest.raises(AttributeError):
            ctx.persona_name = "other"  # type: ignore[misc]

    @verifies(SWR.SWR_2416)
    def test_context_has_no_retired_fields(self) -> None:
        ctx = PromptRenderContext(persona_name="orchestrator")
        assert not hasattr(ctx, "categories")
        assert not hasattr(ctx, "intent_instructions")


@verifies(SWR.SWR_322)
class TestIntegrationDynamicPromptGeneration:
    def test_orchestrator_prompt_renders_every_live_token(self) -> None:
        template = """\
You are [[ROTARIS:PERSONA_NAME]].

Tools: [[ROTARIS:TOOLS_SECTION]]

Delegates: [[ROTARIS:DELEGATES_SECTION]]

[[ROTARIS:DELEGATION_MECHANICS]]

[[ROTARIS:PLAYBOOK]]
"""
        ctx = PromptRenderContext(
            persona_name="orchestrator",
            tools=["delegate", "todo"],
            delegates_to=["architect", "coding-agent"],
            playbook="## Active Playbook — intent `small_feature`",
        )
        result = render_system_prompt(template, ctx)

        assert "You are orchestrator." in result
        assert "- `delegate`" in result
        assert "- `coding-agent`" in result
        assert "## Delegation mechanics" in result
        assert "## Active Playbook" in result
        assert "[[ROTARIS:" not in result
