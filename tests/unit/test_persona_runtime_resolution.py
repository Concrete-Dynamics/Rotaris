from __future__ import annotations

from rotaris_core.agents.factory import resolve_persona_runtime
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_301)
def test_resolved_runtime_prompt_matches_coordinator_only_tools() -> None:
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        tools=["delegate", "todo", "read_file", "write_file", "glob"],
        coordinator_only=True,
    )
    config = RotarisConfig(default_persona="orchestrator", personas={"orchestrator": persona})

    runtime = resolve_persona_runtime(
        persona,
        config,
        raw_prompt="Tools:\n[[ROTARIS:TOOLS_SECTION]]",
        runtime_kwargs={
            "child_manager": object(),
            "scheduler": object(),
            "agent_factory": lambda persona_name: None,
        },
    )

    assert "write_file" not in runtime.prompt
    assert "glob" in runtime.prompt
    assert set(runtime.prompt_tool_names) == {
        "delegate",
        "background_output",
        "wait_for_tasks",
        "todo",
        "read_file",
        "glob",
    }


@verifies(SWR.SWR_301)
def test_resolved_runtime_removes_artifact_write_when_not_enabled() -> None:
    persona = PersonaConfig(
        name="coding-agent",
        model="gpt-4o",
        tools=["artifact_read", "artifact_list", "artifact_write"],
        can_publish_artifacts=False,
    )
    config = RotarisConfig(personas={"coding-agent": persona})

    runtime = resolve_persona_runtime(
        persona,
        config,
        raw_prompt="Tools:\n[[ROTARIS:TOOL_NAMES]]",
        runtime_kwargs={"artifact_store": object()},
    )

    assert "artifact_write" not in runtime.prompt_tool_names
    assert runtime.removed_tools["artifact_write"] == "artifact_write_not_enabled"


@verifies(SWR.SWR_301)
def test_resolved_runtime_keeps_artifact_browse_tools_for_read_only_persona() -> None:
    persona = PersonaConfig(
        name="codebase-analyst",
        model="gpt-4o",
        tools=["grep", "artifact_read", "artifact_list", "artifact_write"],
        can_publish_artifacts=True,
        read_only=True,
    )
    config = RotarisConfig(personas={persona.name: persona})

    runtime = resolve_persona_runtime(
        persona,
        config,
        raw_prompt="Tools:\n[[ROTARIS:TOOL_NAMES]]",
        runtime_kwargs={"artifact_store": object()},
    )

    assert runtime.public_tools == ["grep", "artifact_read", "artifact_list", "artifact_write"]
    assert runtime.prompt_tool_names == ["grep", "artifact_read", "artifact_list", "artifact_write"]
    assert "artifact_write" not in runtime.removed_tools
