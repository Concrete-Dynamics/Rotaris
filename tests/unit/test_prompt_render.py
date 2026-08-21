from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from rotaris_core.agents.prompt_render import (
    TOOL_HINTS,
    PromptRenderContext,
    render_system_prompt,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    import pytest


def _ctx(
    *,
    name: str = "test-persona",
    tools: list[str] | None = None,
    delegates: list[str] | None = None,
    mcps: list[str] | None = None,
    playbook: str = "",
) -> PromptRenderContext:
    return PromptRenderContext(
        persona_name=name,
        tools=tools or [],
        delegates_to=delegates or [],
        mcp_servers=mcps or [],
        playbook=playbook,
    )


@verifies(SWR.SWR_326, SWR.SWR_333)
def test_passthrough_no_placeholders() -> None:
    raw = "You are a helpful agent.\n\nDo good work."
    assert render_system_prompt(raw, _ctx()) == raw


@verifies(SWR.SWR_320)
def test_persona_name_replacement() -> None:
    template = "You are the [[ROTARIS:PERSONA_NAME]] persona."
    result = render_system_prompt(template, _ctx(name="coding-agent"))
    assert result == "You are the coding-agent persona."


@verifies(SWR.SWR_321)
def test_tool_names_replacement() -> None:
    template = "Tools: [[ROTARIS:TOOL_NAMES]]"
    result = render_system_prompt(template, _ctx(tools=["write_file", "terminal"]))
    assert "`write_file`" in result
    assert "`terminal`" in result


@verifies(SWR.SWR_321)
def test_tool_names_empty() -> None:
    template = "Tools: [[ROTARIS:TOOL_NAMES]]"
    result = render_system_prompt(template, _ctx(tools=[]))
    assert "(none)" in result


@verifies(SWR.SWR_322, SWR.SWR_332)
def test_tools_section_with_hints() -> None:
    template = "### Permitted Actions\n[[ROTARIS:TOOLS_SECTION]]"
    result = render_system_prompt(template, _ctx(tools=["write_file", "fetch"]))
    assert "- `write_file`" in result
    assert TOOL_HINTS["write_file"] in result
    assert "- `fetch`" in result
    assert TOOL_HINTS["fetch"] in result


@verifies(SWR.SWR_322)
def test_tools_section_unknown_tool_no_hint() -> None:
    template = "[[ROTARIS:TOOLS_SECTION]]"
    result = render_system_prompt(template, _ctx(tools=["custom_tool"]))
    assert "- `custom_tool`" in result
    assert "—" not in result


@verifies(SWR.SWR_322)
def test_tools_section_empty() -> None:
    template = "[[ROTARIS:TOOLS_SECTION]]"
    result = render_system_prompt(template, _ctx(tools=[]))
    assert "_No tools configured._" in result


@verifies(SWR.SWR_323)
def test_delegate_names_replacement() -> None:
    template = "Delegates: [[ROTARIS:DELEGATE_NAMES]]"
    result = render_system_prompt(template, _ctx(delegates=["architect", "tester"]))
    assert "`architect`" in result
    assert "`tester`" in result


@verifies(SWR.SWR_323)
def test_delegate_names_empty() -> None:
    template = "Delegates: [[ROTARIS:DELEGATE_NAMES]]"
    result = render_system_prompt(template, _ctx(delegates=[]))
    assert "(none)" in result


@verifies(SWR.SWR_324)
def test_delegates_section() -> None:
    template = "[[ROTARIS:DELEGATES_SECTION]]"
    result = render_system_prompt(template, _ctx(delegates=["architect", "coding-agent"]))
    assert "- `architect`" in result
    assert "- `coding-agent`" in result


@verifies(SWR.SWR_324, SWR.SWR_359)
def test_delegates_section_empty() -> None:
    template = "[[ROTARIS:DELEGATES_SECTION]]"
    result = render_system_prompt(template, _ctx(delegates=[]))
    assert "_No delegate personas configured._" in result


@verifies(SWR.SWR_324, SWR.SWR_352, SWR.SWR_353, SWR.SWR_359)
def test_delegates_section_with_purposes() -> None:
    template = "[[ROTARIS:DELEGATES_SECTION]]"
    ctx = PromptRenderContext(
        persona_name="orchestrator",
        delegates_to=["architect", "tester"],
        delegate_purposes={
            "architect": "System architect: designs scalable solutions.",
            "tester": "QA specialist: writes and runs tests.",
        },
    )
    result = render_system_prompt(template, ctx)
    assert "- `architect` \u2014 System architect: designs scalable solutions." in result
    assert "- `tester` \u2014 QA specialist: writes and runs tests." in result


@verifies(SWR.SWR_324)
def test_delegates_section_partial_purposes() -> None:
    """Delegates with no purpose entry fall back to bare name format."""
    template = "[[ROTARIS:DELEGATES_SECTION]]"
    ctx = PromptRenderContext(
        persona_name="planner",
        delegates_to=["architect", "librarian"],
        delegate_purposes={"architect": "System architect: designs solutions."},
    )
    result = render_system_prompt(template, ctx)
    assert "- `architect` \u2014 System architect: designs solutions." in result
    assert "- `librarian`\n" in result or result.endswith("- `librarian`")


@verifies(SWR.SWR_324, SWR.SWR_354, SWR.SWR_359)
def test_delegates_section_no_purposes_fallback() -> None:
    """When delegate_purposes is empty, renders bare name format for all delegates."""
    template = "[[ROTARIS:DELEGATES_SECTION]]"
    ctx = PromptRenderContext(
        persona_name="test-persona",
        delegates_to=["architect", "coding-agent"],
    )
    result = render_system_prompt(template, ctx)
    assert "- `architect`" in result
    assert "- `coding-agent`" in result
    assert "\u2014" not in result


@verifies(SWR.SWR_386, SWR.SWR_2416)
def test_delegates_section_reports_each_delegate_capacity() -> None:
    """The section reports capacity as a fact; how to cut work is the playbook's CHUNKING."""
    expected_capacity = {
        "large_model": "whole cohesive deliverable end to end",
        "medium_model": "scoped deliverable spanning related files",
        "small_model": "narrow, fully specified deliverable",
    }

    for model_tier, expected in expected_capacity.items():
        result = render_system_prompt(
            "[[ROTARIS:DELEGATES_SECTION]]",
            PromptRenderContext(
                persona_name="orchestrator",
                delegates_to=["coding-agent"],
                delegate_model_tiers={"coding-agent": model_tier},
            ),
        )

        assert f"**Model size:** `{model_tier}`" in result
        assert expected in result


@verifies(SWR.SWR_386)
def test_delegates_section_uses_truthful_unknown_model_fallback() -> None:
    result = render_system_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        PromptRenderContext(
            persona_name="orchestrator",
            delegates_to=["coding-agent"],
            delegate_model_tiers={"coding-agent": None},
        ),
    )

    assert "**Model size:** custom/unknown" in result
    assert "treat it conservatively" in result


@verifies(SWR.SWR_386, SWR.SWR_2416)
def test_delegates_section_reports_capacity_for_every_delegate() -> None:
    """SWR-2416 widens tier reporting past `coding-agent`."""
    result = render_system_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        PromptRenderContext(
            persona_name="orchestrator",
            delegates_to=["architect"],
            delegate_model_tiers={"architect": "large_model"},
        ),
    )

    assert "**Model size:** `large_model`" in result


@verifies(SWR.SWR_2416)
def test_delegates_section_carries_no_task_sizing_prose() -> None:
    """Sizing lives in the playbook's CHUNKING slot — restating it here is duplication."""
    result = render_system_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        PromptRenderContext(
            persona_name="orchestrator",
            delegates_to=["coding-agent"],
            delegate_model_tiers={"coding-agent": "large_model"},
        ),
    )

    assert "Assignment guidance" not in result
    assert "Split only" not in result


@verifies(SWR.SWR_386, SWR.SWR_2416)
def test_delegates_section_omits_tier_guidance_when_no_tier_is_known() -> None:
    result = render_system_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        PromptRenderContext(
            persona_name="orchestrator",
            delegates_to=["architect"],
        ),
    )

    assert "Model size" not in result
    assert "Assignment guidance" not in result


@verifies(SWR.SWR_325)
def test_mcp_section_no_tools_declared() -> None:
    template = "### Tools via MCP\n[[ROTARIS:MCP_SECTION]]"
    result = render_system_prompt(template, _ctx(mcps=["filesystem", "tavily"]))
    assert "- `filesystem`" in result
    assert "- `tavily`" in result


@verifies(SWR.SWR_325)
def test_mcp_section_with_tools() -> None:
    template = "[[ROTARIS:MCP_SECTION]]"
    ctx = PromptRenderContext(
        persona_name="test",
        mcp_servers=["serena"],
        mcp_server_tools={
            "serena": [
                ("definition", "Jump to definition for a symbol."),
                ("references", "Find all references to a symbol."),
            ],
        },
    )
    result = render_system_prompt(template, ctx)
    assert "**`serena`**" in result
    assert "- `definition` — Jump to definition for a symbol." in result
    assert "- `references` — Find all references to a symbol." in result


@verifies(SWR.SWR_325)
def test_mcp_section_empty() -> None:
    template = "[[ROTARIS:MCP_SECTION]]"
    result = render_system_prompt(template, _ctx(mcps=[]))
    assert "_No MCP servers configured._" in result


def _serena_ctx(tool_names: list[str]) -> PromptRenderContext:
    return PromptRenderContext(
        persona_name="test",
        mcp_servers=["serena"],
        mcp_server_tools={"serena": [(name, "") for name in tool_names]},
    )


@verifies(SWR.SWR_2822)
def test_memory_protocol_renders_for_a_persona_holding_the_tools() -> None:
    """Productive use: an agent granted the memory store is told what it is for.

    Expected outcome: the rendered prompt tells it to read before exploring, to
    record durable findings, and to leave `AGENTS.md` where it is — without which
    the grant is a tool the model never learns it has."""
    template = "[[ROTARIS:MCP_SECTION]]"

    result = render_system_prompt(
        template,
        _serena_ctx(["find_symbol", "list_memories", "read_memory", "write_memory"]),
    )

    assert "Project memories" in result
    assert "`list_memories` before" in result
    assert "AGENTS.md" in result


@verifies(SWR.SWR_2822)
def test_memory_protocol_is_absent_without_the_tools() -> None:
    """Productive use: a persona whose workspace narrowed the grant is not told to
    call tools it does not have.

    Expected outcome: withholding the memory tools withholds the protocol too."""
    template = "[[ROTARIS:MCP_SECTION]]"

    result = render_system_prompt(template, _serena_ctx(["find_symbol"]))

    assert "Project memories" not in result


@verifies(SWR.SWR_2822)
def test_memory_protocol_belongs_to_serena_not_to_a_tool_name() -> None:
    """Productive use: another server that happens to expose a similarly named tool
    does not inherit Serena's memory protocol.

    Expected outcome: the protocol is keyed on the server as well as the grant."""
    template = "[[ROTARIS:MCP_SECTION]]"
    ctx = PromptRenderContext(
        persona_name="test",
        mcp_servers=["tavily"],
        mcp_server_tools={"tavily": [("list_memories", ""), ("read_memory", "")]},
    )

    assert "Project memories" not in render_system_prompt(template, ctx)


@verifies(SWR.SWR_327, SWR.SWR_2416)
def test_playbook_empty_by_default() -> None:
    template = "before[[ROTARIS:PLAYBOOK]]after"
    assert render_system_prompt(template, _ctx()) == "beforeafter"


@verifies(SWR.SWR_319, SWR.SWR_333)
def test_multiple_placeholders_in_one_template() -> None:
    template = (
        "Name: [[ROTARIS:PERSONA_NAME]]\n"
        "Tools: [[ROTARIS:TOOL_NAMES]]\n"
        "Delegates: [[ROTARIS:DELEGATE_NAMES]]\n"
        "MCP:\n[[ROTARIS:MCP_SECTION]]"
    )
    result = render_system_prompt(
        template,
        _ctx(
            name="orchestrator",
            tools=["delegate", "todo"],
            delegates=["architect"],
            mcps=["filesystem"],
        ),
    )
    assert "orchestrator" in result
    assert "`delegate`" in result
    assert "`todo`" in result
    assert "`architect`" in result
    assert "`filesystem`" in result


@verifies(SWR.SWR_327)
def test_unresolved_token_warns_and_preserved(caplog: pytest.LogCaptureFixture) -> None:
    template = "[[ROTARIS:NONEXISTENT_TOKEN]]"
    with caplog.at_level(logging.WARNING):
        result = render_system_prompt(template, _ctx())
    assert result == "[[ROTARIS:NONEXISTENT_TOKEN]]"
    assert "NONEXISTENT_TOKEN" in caplog.text


@verifies(SWR.SWR_331)
def test_braces_in_markdown_not_affected() -> None:
    template = 'Use `todo(operation="add_phase", payload={"name": "..."})`'
    result = render_system_prompt(template, _ctx())
    assert result == template


@verifies(SWR.SWR_332, SWR.SWR_661)
def test_all_default_tools_have_hints() -> None:
    expected = {
        "terminal",
        "git_commit",
        "fetch",
        "grep",
        "delegate",
        "todo",
        "glob",
        "background_output",
        "wait_for_tasks",
        "read_file",
        "write_file",
        "haet",
        "haet_edit",
        "haet_read",
        "artifact_list",
        "artifact_read",
        "artifact_write",
    }
    assert expected == set(TOOL_HINTS.keys())


@verifies(SWR.SWR_144, SWR.SWR_665)
def test_rendered_prompt_file_snapshot() -> None:
    from pathlib import Path

    prompts_dir = (
        Path(__file__).parent.parent.parent / "src" / "rotaris_core" / "agents" / "prompts"
    )
    template = (prompts_dir / "coding_agent.md").read_text(encoding="utf-8")

    ctx = _ctx(
        name="coding-agent",
        tools=["write_file", "read_file", "terminal", "git_commit", "fetch"],
    )
    result = render_system_prompt(template, ctx)

    assert "[[ROTARIS:" not in result
    assert "coding-agent" in result
    assert TOOL_HINTS["write_file"] in result
    assert TOOL_HINTS["terminal"] in result


@verifies(SWR.SWR_2416, SWR.SWR_1801, SWR.SWR_1803, SWR.SWR_1805)
def test_orchestrator_prompt_renders_delegates() -> None:
    from pathlib import Path

    prompts_dir = (
        Path(__file__).parent.parent.parent / "src" / "rotaris_core" / "agents" / "prompts"
    )
    template = (prompts_dir / "orchestrator.md").read_text(encoding="utf-8")

    ctx = _ctx(
        name="orchestrator",
        tools=["delegate", "todo", "write_file"],
        delegates=["architect", "coding-agent", "tester"],
        playbook="## Active Playbook — intent `moderate_feature`",
    )
    result = render_system_prompt(template, ctx)

    assert "[[ROTARIS:" not in result
    assert "## Active Playbook — intent `moderate_feature`" in result
    assert "orchestrator" in result
    assert "Assign exactly one active owner per task or slice" in result
    assert "NEVER give two children the same task" in result
    assert "- `architect`" in result
    assert "- `coding-agent`" in result
    assert "- `tester`" in result


@verifies(SWR.SWR_148, SWR.SWR_2416)
def test_orchestrator_prompt_no_longer_contains_phase_zero_gate() -> None:
    from pathlib import Path

    prompts_dir = (
        Path(__file__).parent.parent.parent / "src" / "rotaris_core" / "agents" / "prompts"
    )
    template = (prompts_dir / "orchestrator.md").read_text(encoding="utf-8")

    assert "Phase 0: Intent Classification" not in template
    assert "# Intent Classification Gate" not in template
    assert "The first line of your first user-visible response" not in template
    assert "[[ROTARIS:PLAYBOOK]]" in template
    # Retired by SWR-2416: intent-specific prompt text now comes from the playbook.
    assert "[[ROTARIS:INTENT_INSTRUCTIONS]]" not in template


@verifies(SWR.SWR_661)
def test_write_file_hint_documents_standard_commands() -> None:
    template = "[[ROTARIS:TOOLS_SECTION]]"
    result = render_system_prompt(template, _ctx(tools=["write_file"]))
    assert TOOL_HINTS["write_file"] in result


# ---------------------------------------------------------------------------


@verifies(SWR.SWR_329, SWR.SWR_330, SWR.SWR_352, SWR.SWR_353, SWR.SWR_386)
def test_render_prompt_pulls_persona_purpose_into_delegates_section() -> None:
    """Persona ``purpose`` declared in ``RotarisConfig`` must appear in the
    DELEGATES_SECTION of the rendered prompt for any persona that delegates
    to it. This is the end-to-end wiring test for the per-persona purpose
    field — the unit tests above only cover the formatter in isolation.
    """
    from rotaris_core.agents.factory import _render_prompt
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig

    config = RotarisConfig(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                tools=["delegate"],
                delegates_to=["architect", "tester"],
            ),
            "architect": PersonaConfig(
                name="architect",
                model="gpt-4o",
                purpose="System architect: designs scalable solutions.",
            ),
            "tester": PersonaConfig(
                name="tester",
                model="gpt-4o-mini",
                purpose="QA specialist: writes regression tests.",
            ),
        },
    )

    rendered = _render_prompt(
        "Delegates available:\n[[ROTARIS:DELEGATES_SECTION]]",
        config.personas["orchestrator"],
        config,
    )

    assert "System architect: designs scalable solutions." in rendered
    assert "QA specialist: writes regression tests." in rendered
    assert "- `architect`" in rendered
    assert "- `tester`" in rendered


@verifies(SWR.SWR_386)
def test_render_prompt_prefers_recorded_tier_when_model_slots_share_identity() -> None:
    from rotaris_core.agents.factory import _render_prompt
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig

    config = RotarisConfig(
        small_model="shared-model",
        medium_model="shared-model",
        large_model="large-model",
        resolved_persona_model_tiers={"coding-agent": "medium_model"},
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="large-model",
                delegates_to=["coding-agent"],
            ),
            "coding-agent": PersonaConfig(
                name="coding-agent",
                model="shared-model",
                purpose="Implementation specialist.",
            ),
        },
    )

    rendered = _render_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        config.personas["orchestrator"],
        config,
    )

    assert "**Model size:** `medium_model`" in rendered
    assert "scoped deliverable spanning related files" in rendered


@verifies(SWR.SWR_386)
def test_render_prompt_infers_unique_tier_for_explicit_model_match() -> None:
    from rotaris_core.agents.factory import _render_prompt
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig

    config = RotarisConfig(
        small_model="small-model",
        medium_model="medium-model",
        large_model="large-model",
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="large-model",
                delegates_to=["coding-agent"],
            ),
            "coding-agent": PersonaConfig(
                name="coding-agent",
                model="large-model",
            ),
        },
    )

    rendered = _render_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        config.personas["orchestrator"],
        config,
    )

    assert "**Model size:** `large_model`" in rendered
    assert "whole cohesive deliverable end to end" in rendered


@verifies(SWR.SWR_386)
def test_render_prompt_marks_unmatched_custom_coding_model_unknown() -> None:
    from rotaris_core.agents.factory import _render_prompt
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig

    config = RotarisConfig(
        small_model="small-model",
        medium_model="medium-model",
        large_model="large-model",
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="large-model",
                delegates_to=["coding-agent"],
            ),
            "coding-agent": PersonaConfig(
                name="coding-agent",
                model="custom-model",
            ),
        },
    )

    rendered = _render_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        config.personas["orchestrator"],
        config,
    )

    assert "**Model size:** custom/unknown" in rendered
    assert "treat it conservatively" in rendered


@verifies(SWR.SWR_304, SWR.SWR_329, SWR.SWR_330, SWR.SWR_354, SWR.SWR_357)
def test_render_prompt_omits_purpose_when_persona_has_none() -> None:
    """A delegate persona without a ``purpose`` must render as a bare bullet
    (no em-dash separator) — the formatter must not emit empty descriptions.
    """
    from rotaris_core.agents.factory import _render_prompt
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig

    config = RotarisConfig(
        personas={
            "orchestrator": PersonaConfig(
                name="orchestrator",
                model="gpt-4o",
                tools=["delegate"],
                delegates_to=["nameless"],
            ),
            "nameless": PersonaConfig(
                name="nameless",
                model="gpt-4o-mini",
                # no purpose
            ),
        },
    )

    rendered = _render_prompt(
        "[[ROTARIS:DELEGATES_SECTION]]",
        config.personas["orchestrator"],
        config,
    )

    assert "- `nameless`" in rendered
    # Em-dash separator must NOT appear because purpose is None.
    assert "- `nameless` \u2014" not in rendered


@verifies(SWR.SWR_661)
def test_artifact_tool_hints_appear_in_rendered_section() -> None:
    template = "[[ROTARIS:TOOLS_SECTION]]"
    result = render_system_prompt(
        template,
        _ctx(tools=["artifact_read", "artifact_list", "artifact_write"]),
    )
    assert TOOL_HINTS["artifact_read"] in result
    assert TOOL_HINTS["artifact_list"] in result
    assert TOOL_HINTS["artifact_write"] in result


@verifies(SWR.SWR_1804, SWR.SWR_2416)
def test_moderate_feature_routes_through_the_planner_at_every_tier() -> None:
    """Previously asserted against `intents/moderate_feature.md`; now the matrix owns it."""
    from rotaris_core.agents.playbook import resolve_playbook_cell

    for tier in ("small_model", "medium_model"):
        cell = resolve_playbook_cell("orchestrator", "moderate_feature", tier)
        assert cell is not None
        assert cell.variants["ROUTE"] == "plan-first", tier
    # A large-model implementation owner scopes its own work, so no plan step is forced.
    large = resolve_playbook_cell("orchestrator", "moderate_feature", "large_model")
    assert large is not None
    assert large.variants["ROUTE"] == "direct"


@verifies(SWR.SWR_1804, SWR.SWR_2416)
def test_problem_resolution_diagnoses_first_and_keeps_the_planner_out() -> None:
    from rotaris_core.agents.playbook import resolve_playbook_cell

    for tier in ("small_model", "medium_model", "large_model"):
        cell = resolve_playbook_cell("orchestrator", "problem_resolution", tier)
        assert cell is not None
        assert cell.variants["ROUTE"] != "plan-first", tier


@verifies(SWR.SWR_1531)
def test_planner_and_architect_prompts_end_the_turn_with_an_artifact_publish() -> None:
    """Productive use: downstream agents read the plan or design verbatim, not paraphrased.
    Expected outcome: both prompts close with an `artifact_write` publish step."""
    from pathlib import Path

    prompts_dir = (
        Path(__file__).parent.parent.parent / "src" / "rotaris_core" / "agents" / "prompts"
    )
    planner = (prompts_dir / "planner.md").read_text(encoding="utf-8")
    architect = (prompts_dir / "architect.md").read_text(encoding="utf-8")

    assert "## Final Step — Publish the Plan as an Artifact" in planner
    assert "artifact_write()" in planner
    assert "attach_artifacts" in planner

    assert "## Final Step — Publish the Design as an Artifact" in architect
    assert 'slug="design-' in architect
    assert "attach_artifacts" in architect
