from __future__ import annotations

from typing import TYPE_CHECKING

from openhands.sdk.llm.llm import LLM

from rotaris_core.agents.factory import create_agent_for_persona
from rotaris_core.config.schema import PersonaConfig, RotarisConfig, SkillSettings
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.skills import clear_skill_catalog_cache

if TYPE_CHECKING:
    from pathlib import Path


@verifies(SWR.SWR_425, SWR.SWR_426, SWR.SWR_429)
def test_factory_injects_portable_skill_catalog_without_body(tmp_path: Path) -> None:
    clear_skill_catalog_cache()
    skill_dir = tmp_path / ".agents" / "skills" / "review"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: Review\ndescription: Review changes.\n---\n\nsecret body\n",
        encoding="utf-8",
    )
    persona = PersonaConfig(name="tester", model="gpt-4o")
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_path)

    agent = create_agent_for_persona(persona, config)(
        LLM(model="openai/gpt-4o-mini", api_key="test"),
    )

    assert agent.agent_context is not None
    skill = next(s for s in agent.agent_context.skills if s.name == "portable_skill_catalog")
    assert "Review: Review changes." in skill.content
    assert str(skill_dir / "SKILL.md") in skill.content
    assert "secret body" not in skill.content


@verifies(SWR.SWR_429)
def test_factory_orders_skill_catalog_between_agents_md_and_memory(tmp_path: Path) -> None:
    clear_skill_catalog_cache()
    (tmp_path / ".git").mkdir()
    (tmp_path / "AGENTS.md").write_text("workspace instructions\n", encoding="utf-8")
    memory_dir = tmp_path / ".rotaris" / "persona_memory"
    memory_dir.mkdir(parents=True)
    (memory_dir / "tester.md").write_text("persona memory\n", encoding="utf-8")
    skill_dir = tmp_path / ".agents" / "skills" / "review"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\nname: Review\ndescription: Review changes.\n---\n\nbody\n",
        encoding="utf-8",
    )
    persona = PersonaConfig(name="tester", model="gpt-4o")
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_path)

    agent = create_agent_for_persona(persona, config)(
        LLM(model="openai/gpt-4o-mini", api_key="test"),
    )

    assert agent.agent_context is not None
    names = [skill.name for skill in agent.agent_context.skills]
    assert names == [
        "workspace_agents_context",
        "portable_skill_catalog",
        "persona_memory_tester",
    ]


@verifies(SWR.SWR_1619, SWR.SWR_1615)
def test_persona_memory_augments_context_without_rewriting_the_persona_prompt(
    tmp_path: Path,
) -> None:
    """Productive use: workspace memory carries operating hints, not a new role.
    Expected outcome: the memory reaches the agent as its own context skill while the
    persona's maintained system prompt is delivered unchanged."""
    clear_skill_catalog_cache()
    memory_dir = tmp_path / ".rotaris" / "persona_memory"
    memory_dir.mkdir(parents=True)
    (memory_dir / "tester.md").write_text("Run pytest with PYTHONPATH=src.\n", encoding="utf-8")
    persona = PersonaConfig(
        name="tester",
        model="gpt-4o",
        system_prompt="You are the tester persona.",
    )
    config = RotarisConfig(personas={persona.name: persona}, workspace_root=tmp_path)

    agent = create_agent_for_persona(persona, config)(
        LLM(model="openai/gpt-4o-mini", api_key="test"),
    )

    persona_prompt = agent.system_prompt_kwargs["persona_prompt"]
    assert "You are the tester persona." in persona_prompt
    assert "Run pytest with PYTHONPATH=src." not in persona_prompt

    assert agent.agent_context is not None
    memory_skills = [s for s in agent.agent_context.skills if s.name == "persona_memory_tester"]
    assert [s.content for s in memory_skills] == ["Run pytest with PYTHONPATH=src.\n"]


@verifies(SWR.SWR_2098)
def test_factory_applies_skill_injection_and_invocation_policies(tmp_path: Path) -> None:
    clear_skill_catalog_cache()
    for directory, name, extra in (
        ("ondemand", "On demand", ""),
        ("always", "Always", ""),
        ("manual", "Manual", "disable-model-invocation: true\n"),
        ("auto", "Auto", "user-invocable: false\n"),
        ("hidden", "Hidden", ""),
    ):
        skill_dir = tmp_path / ".agents" / "skills" / directory
        skill_dir.mkdir(parents=True)
        skill_dir.joinpath("SKILL.md").write_text(
            f"---\nname: {name}\ndescription: {name} description.\n{extra}---\n\n{name} body\n",
            encoding="utf-8",
        )
    persona = PersonaConfig(name="tester", model="gpt-4o")
    config = RotarisConfig(
        personas={persona.name: persona},
        workspace_root=tmp_path,
        skills=SkillSettings(overrides={"always": "on", "hidden": "off"}),
    )

    agent = create_agent_for_persona(persona, config)(
        LLM(model="openai/gpt-4o-mini", api_key="test"),
    )

    assert agent.agent_context is not None
    skills = {skill.name: skill.content for skill in agent.agent_context.skills}
    catalog = skills["portable_skill_catalog"]
    assert "On demand: On demand description." in catalog
    assert "Auto: Auto description." in catalog
    assert "Manual: Manual description." not in catalog
    assert "Hidden: Hidden description." not in catalog
    # "always" is force-loaded in full below, so it must not also appear as a
    # catalog stub (that framing implies it's not yet in context, and reading
    # both confuses the model about whether the skill is active).
    assert "Always: Always description." not in catalog
    assert skills["portable_skill_always"].endswith("Always body\n")
    assert "always active for this persona" in skills["portable_skill_always"]
    assert "On demand body" not in catalog
