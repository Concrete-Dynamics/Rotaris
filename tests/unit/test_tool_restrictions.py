"""Tests for tool restriction enforcement in agent factory."""

from __future__ import annotations

from rotaris_core.agents.factory import _apply_tool_restrictions
from rotaris_core.config.schema import PersonaConfig
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_read_only_true() -> None:
    """Test that read_only=True keeps read-only and artifact publishing tools only."""
    persona = PersonaConfig(
        name="codebase-analyst",
        model="gpt-4o",
        read_only=True,
        tools=[
            "grep",
            "glob",
            "fetch",
            "read_file",
            "artifact_read",
            "artifact_list",
            "artifact_write",
            "write_file",
            "terminal",
        ],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should only include read-only tools plus artifact publishing.
    assert set(result) == {
        "grep",
        "glob",
        "fetch",
        "read_file",
        "artifact_read",
        "artifact_list",
        "artifact_write",
    }
    assert "write_file" not in result
    assert "terminal" not in result


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_read_only_false() -> None:
    """Test that read_only=False allows all tools."""
    persona = PersonaConfig(
        name="backend-dev",
        model="gpt-4o",
        read_only=False,
        tools=["write_file", "terminal", "git_commit", "grep"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should include all tools
    assert set(result) == {"write_file", "terminal", "git_commit", "grep"}


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_tool_restrictions_dict() -> None:
    """Test that tool_restrictions dict filters tools correctly."""
    persona = PersonaConfig(
        name="librarian",
        model="gpt-4o",
        read_only=False,
        tool_restrictions={
            "librarian": ["grep", "glob", "fetch"],
            "orchestrator": ["delegate", "terminal", "todo"],
        },
        tools=["grep", "glob", "fetch", "terminal"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should only include tools in the restriction list for this persona
    assert set(result) == {"grep", "glob", "fetch"}
    assert "terminal" not in result


@verifies(SWR.SWR_342)
def test_apply_tool_restrictions_tool_restrictions_persona_not_in_dict() -> None:
    """Test that personas not in tool_restrictions dict get all tools."""
    persona = PersonaConfig(
        name="architect",
        model="gpt-4o",
        read_only=False,
        tool_restrictions={
            "librarian": ["grep", "glob"],
            "codebase-analyst": ["fetch"],
        },
        tools=["terminal", "write_file", "git_commit"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should include all tools since persona is not in restrictions
    assert set(result) == {"terminal", "write_file", "git_commit"}


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_read_only_takes_precedence() -> None:
    """Test that read_only takes precedence over tool_restrictions."""
    persona = PersonaConfig(
        name="codebase-analyst",
        model="gpt-4o",
        read_only=True,
        tool_restrictions={
            "codebase-analyst": ["grep", "glob", "write_file", "terminal"],
        },
        tools=["grep", "glob", "write_file", "terminal"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should only include read-only tools, ignoring tool_restrictions
    assert set(result) == {"grep", "glob"}
    assert "write_file" not in result
    assert "terminal" not in result


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_empty_tools_list() -> None:
    """Test that empty tools list returns empty list."""
    persona = PersonaConfig(
        name="test",
        model="gpt-4o",
        read_only=True,
        tools=[],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    assert result == []


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_no_restrictions() -> None:
    """Test that personas with no restrictions return all tools."""
    persona = PersonaConfig(
        name="backend-dev",
        model="gpt-4o",
        read_only=False,
        tool_restrictions=None,
        tools=["write_file", "terminal", "git_commit"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    assert set(result) == {"write_file", "terminal", "git_commit"}


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_read_only_with_all_read_only_tools() -> None:
    """Test read_only when all tools are already read-only."""
    persona = PersonaConfig(
        name="librarian",
        model="gpt-4o",
        read_only=True,
        tools=["grep", "glob", "fetch"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should return all tools unchanged
    assert set(result) == {"grep", "glob", "fetch"}


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_preserves_order() -> None:
    """Test that tool restriction preserves the order of tools."""
    persona = PersonaConfig(
        name="backend-dev",
        model="gpt-4o",
        read_only=False,
        tool_restrictions={
            "backend-dev": ["terminal", "write_file", "git_commit"],
        },
        tools=["git_commit", "write_file", "terminal", "fetch"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should preserve the order from the original tools list
    assert result == ["git_commit", "write_file", "terminal"]


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_case_sensitive() -> None:
    """Test that tool names are case-sensitive."""
    persona = PersonaConfig(
        name="test",
        model="gpt-4o",
        read_only=False,
        tool_restrictions={
            "test": ["Grep", "Glob"],  # Wrong case
        },
        tools=["grep", "glob", "fetch"],
    )

    result = _apply_tool_restrictions(persona, persona.tools)

    # Should not match due to case sensitivity
    assert result == []


@verifies(SWR.SWR_343)
def test_apply_tool_restrictions_multiple_personas() -> None:
    """Test tool restrictions with multiple personas."""
    personas = [
        PersonaConfig(
            name="librarian",
            model="gpt-4o",
            read_only=True,
            tools=["grep", "glob", "fetch"],
        ),
        PersonaConfig(
            name="backend-dev",
            model="gpt-4o",
            read_only=False,
            tool_restrictions={
                "backend-dev": ["write_file", "terminal", "git_commit"],
            },
            tools=["write_file", "terminal", "git_commit", "grep"],
        ),
    ]

    # Test librarian (read-only)
    result1 = _apply_tool_restrictions(personas[0], personas[0].tools)
    assert set(result1) == {"grep", "glob", "fetch"}

    # Test backend-dev (tool_restrictions)
    result2 = _apply_tool_restrictions(personas[1], personas[1].tools)
    assert set(result2) == {"write_file", "terminal", "git_commit"}


# --- intent_allowed_tools tests ---


@verifies(SWR.SWR_156)
def test_intent_allowed_tools_overrides_coordinator_only() -> None:
    """intent_allowed_tools takes priority over coordinator_only and allows write tools."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        coordinator_only=True,
        tools=["delegate", "todo", "haet_read", "read_file", "write_file"],
    )
    intent_tools = ["delegate", "todo", "haet_read", "read_file", "write_file"]

    result = _apply_tool_restrictions(persona, persona.tools, intent_allowed_tools=intent_tools)

    assert "read_file" in result
    assert "write_file" in result
    assert "delegate" in result


@verifies(SWR.SWR_156)
def test_intent_allowed_tools_none_falls_back_to_coordinator_only() -> None:
    """When intent_allowed_tools is None, coordinator_only still strips write tools."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        coordinator_only=True,
        tools=["delegate", "todo", "haet_read", "read_file", "write_file"],
    )

    result = _apply_tool_restrictions(persona, persona.tools, intent_allowed_tools=None)

    assert "read_file" in result  # read_file is a coordinator tool
    assert "write_file" not in result
    assert "delegate" in result
    assert "todo" in result


@verifies(SWR.SWR_156)
def test_intent_allowed_tools_intersects_with_declared_tools() -> None:
    """Tools in intent_allowed_tools but NOT in persona.tools are not included."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        coordinator_only=True,
        tools=["delegate", "todo"],
    )
    # intent_tools includes "write_file" but persona.tools does not
    intent_tools = ["delegate", "todo", "write_file"]

    result = _apply_tool_restrictions(persona, persona.tools, intent_allowed_tools=intent_tools)

    assert "write_file" not in result
    assert set(result) == {"delegate", "todo"}
