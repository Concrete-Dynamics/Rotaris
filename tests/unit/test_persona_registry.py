from __future__ import annotations

from unittest.mock import patch

import pytest
from openhands.sdk.subagent.schema import AgentDefinition

from rotaris_core.agents.registry import PersonaRegistry
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies


def build_config() -> RotarisConfig:
    personas = {
        "orchestrator": PersonaConfig(
            name="orchestrator",
            model="gpt-4o",
            tools=["delegate", "todo", "write_file"],
            system_prompt="orchestrate",
        ),
        "tester": PersonaConfig(
            name="tester",
            model="gpt-4o-mini",
            tools=["write_file", "terminal"],
            system_prompt="test things",
        ),
        "docs-writer": PersonaConfig(
            name="docs-writer",
            model="gpt-4o-mini",
            tools=["write_file", "git_commit"],
            system_prompt="write docs",
        ),
    }
    return RotarisConfig(personas=personas)


@verifies(SWR.SWR_301, SWR.SWR_302, SWR.SWR_305, SWR.SWR_309, SWR.SWR_311)
def test_load_all_registers_all_personas() -> None:
    config = build_config()
    registry = PersonaRegistry(config)

    with patch("rotaris_core.agents.registry.register_agent") as register_agent_mock:
        registry.load_all()

    assert register_agent_mock.call_count == 3
    first_call = register_agent_mock.call_args_list[0]
    assert first_call.args[0] == "orchestrator"
    assert callable(first_call.args[1])
    assert isinstance(first_call.args[2], AgentDefinition)
    assert first_call.args[2].name == "orchestrator"
    assert first_call.args[2].model == "gpt-4o"
    assert first_call.args[2].tools == ["delegate", "todo", "write_file"]
    assert first_call.args[2].system_prompt == "orchestrate"


@verifies(SWR.SWR_304)
def test_get_persona_returns_matching_config() -> None:
    config = build_config()
    registry = PersonaRegistry(config)

    with patch("rotaris_core.agents.registry.register_agent"):
        registry.load_all()

    persona = registry.get_persona("tester")

    assert persona == config.personas["tester"]


@verifies(SWR.SWR_301)
def test_get_persona_raises_for_unknown_name() -> None:
    registry = PersonaRegistry(build_config())

    with pytest.raises(KeyError, match="Persona not found: missing"):
        registry.get_persona("missing")


@verifies(SWR.SWR_301)
def test_list_personas_returns_loaded_names() -> None:
    registry = PersonaRegistry(build_config())

    with patch("rotaris_core.agents.registry.register_agent"):
        registry.load_all()

    assert registry.list_personas() == ["orchestrator", "tester", "docs-writer"]


def _load_prompt(persona_name: str) -> str:
    """Load a default-persona prompt the same way the factory does."""
    from rotaris_core.agents.factory import load_system_prompt
    from rotaris_core.config.defaults import DEFAULT_PERSONAS

    return load_system_prompt(DEFAULT_PERSONAS[persona_name])


@verifies(SWR.SWR_301)
def test_specialised_personas_use_rotaris_token_placeholders() -> None:
    """REQ-OMO-PHASE5: every specialised persona prompt uses the dynamic
    ``[[ROTARIS:...]]`` token system instead of hard-coding tool / persona
    names. Without these tokens the prompts cannot adapt to per-persona
    config overlays.
    """
    for persona in ("codebase-analyst", "librarian", "planner"):
        prompt = _load_prompt(persona)
        assert "[[ROTARIS:PERSONA_NAME]]" in prompt, (
            f"{persona} prompt must use the dynamic PERSONA_NAME token"
        )
        assert "[[ROTARIS:TOOLS_SECTION]]" in prompt, (
            f"{persona} prompt must use the dynamic TOOLS_SECTION token"
        )


# ---------------------------------------------------------------------------


@verifies(SWR.SWR_328, SWR.SWR_334, SWR.SWR_335, SWR.SWR_336, SWR.SWR_2416)
def test_persona_prompts_own_their_hard_blocks_and_style_sections() -> None:
    """SWR-2416 moved these out of generated sections and into the prompt files.

    They are layer-1 content: non-overridable prohibitions and persona voice, neither
    of which varies with the run.
    """
    for persona in ("orchestrator", "coding-agent"):
        prompt = _load_prompt(persona)
        assert "# Hard Blocks (NEVER)" in prompt, persona
        assert "NEVER" in prompt, persona
        assert "# Communication Style" in prompt, persona
        assert "The playbook cannot relax them." in prompt, persona

    assert "# Anti-Patterns (AVOID)" in _load_prompt("orchestrator")


@verifies(SWR.SWR_301, SWR.SWR_2416)
def test_orchestrator_prompt_carries_its_run_invariant_sections() -> None:
    """Delegation economy and the completion gate moved into the playbook (SWR-2416).

    What must stay in the prompt file is the run-invariant part: how the delegation
    tools work, how to recover from repeated failure, and the non-overridable blocks.
    """
    prompt = _load_prompt("orchestrator")

    for header in (
        "[[ROTARIS:DELEGATION_MECHANICS]]",
        "[[ROTARIS:PLAYBOOK]]",
        "# Failure Recovery Protocol",
        "# Hard Blocks (NEVER)",
    ):
        assert header in prompt, f"orchestrator prompt missing section {header!r}"


@verifies(SWR.SWR_301)
def test_codebase_analyst_prompt_declares_internal_scope_boundary() -> None:
    """The internal research persona must clearly advertise its repository-only scope."""
    prompt = _load_prompt("codebase-analyst")

    for text in (
        "Internal Codebase Analyst",
        "Scope Boundary (NON-NEGOTIABLE)",
        "anything inside this workspace",
        "Request Classification",
        "TYPE A: Call Graph / Symbol Usage",
    ):
        assert text in prompt, f"codebase-analyst prompt missing {text!r}"


@verifies(SWR.SWR_301)
def test_codebase_analyst_prompt_has_fast_path_for_targeted_queries() -> None:
    prompt = _load_prompt("codebase-analyst")

    for text in (
        "## Fast Path",
        "Skip broad inventory",
        "Stop as soon as you have enough evidence",
        "Keep normal reports under",
    ):
        assert text in prompt, f"codebase-analyst prompt missing {text!r}"


@verifies(SWR.SWR_301, SWR.SWR_2416)
def test_planner_prompt_has_its_pipeline_without_reclassifying_intent() -> None:
    """The planner no longer re-classifies intent — the run classifier already did."""
    prompt = _load_prompt("planner")

    for header in (
        "## Research routing",
        "## Interview",
        "## Plan Generation",
        "## Review",
    ):
        assert header in prompt, f"planner prompt missing section {header!r}"

    assert "Intent Classification" not in prompt


@verifies(SWR.SWR_301, SWR.SWR_355)
def test_default_prompts_do_not_route_to_retired_personas() -> None:
    prompts = {
        "orchestrator": _load_prompt("orchestrator"),
        "planner": _load_prompt("planner"),
    }
    retired_role_references = (
        "pre-planning analyst",
        "structural-discovery specialist",
        "review specialist",
        "metis",
        "momus",
        "explore persona",
    )

    for persona, prompt in prompts.items():
        prompt_lower = prompt.lower()
        for reference in retired_role_references:
            assert reference not in prompt_lower, (
                f"{persona} prompt still routes to retired role/persona {reference!r}"
            )
