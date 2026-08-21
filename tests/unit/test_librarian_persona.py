from __future__ import annotations

from rotaris_core.agents.factory import load_system_prompt
from rotaris_core.config.defaults import DEFAULT_PERSONAS
from rotaris_core.reqtocode import SWR, verifies

# --- Persona existence and basic config ---


@verifies(SWR.SWR_1901, SWR.SWR_1911)
def test_librarian_in_default_personas() -> None:
    assert "librarian" in DEFAULT_PERSONAS


@verifies(SWR.SWR_1901)
def test_librarian_model_inherits_large_startup_slot() -> None:
    assert DEFAULT_PERSONAS["librarian"].model == "medium_model"


# --- Tool permissions (read-only constraint) ---


WRITE_TOOLS = {"terminal", "git_commit", "delegate", "todo"}


@verifies(SWR.SWR_503, SWR.SWR_1909, SWR.SWR_1912)
def test_librarian_tools_are_read_only() -> None:
    tools = set(DEFAULT_PERSONAS["librarian"].tools)
    assert tools == {
        "read_file",
        "fetch",
        "haet_read",
        "glob",
        "grep",
        "artifact_read",
        "artifact_list",
        "artifact_write",
    }


@verifies(SWR.SWR_1909, SWR.SWR_1912)
def test_librarian_has_no_write_tools() -> None:
    tools = set(DEFAULT_PERSONAS["librarian"].tools)
    assert tools.isdisjoint(WRITE_TOOLS), (
        f"Librarian must not have write tools, found: {tools & WRITE_TOOLS}"
    )


# --- Delegation wiring ---


@verifies(SWR.SWR_1913)
def test_librarian_has_no_delegates() -> None:
    assert DEFAULT_PERSONAS["librarian"].delegates_to == []


@verifies(SWR.SWR_1908)
def test_orchestrator_delegates_to_librarian() -> None:
    assert "librarian" in DEFAULT_PERSONAS["orchestrator"].delegates_to


@verifies(SWR.SWR_1907)
def test_architect_delegates_to_librarian() -> None:
    assert "librarian" in DEFAULT_PERSONAS["architect"].delegates_to


@verifies(SWR.SWR_105)
def test_architect_has_delegate_tool() -> None:
    assert "delegate" in DEFAULT_PERSONAS["architect"].tools


@verifies(SWR.SWR_1913)
def test_librarian_not_delegated_by_other_personas() -> None:
    # Personas that may delegate research work to librarian:
    # - orchestrator, architect, planner (coordination layer)
    # - coding-agent, tester, docs-writer (implementation layer — allowed research support)
    # - requirements-engineer (requirement/source-traceability support)
    # Leaf/utility personas (codebase-analyst, refactorer) must not delegate.
    allowed = {
        "orchestrator",
        "architect",
        "planner",
        "coding-agent",
        "tester",
        "docs-writer",
        "requirements-engineer",
    }
    for name, persona in DEFAULT_PERSONAS.items():
        if name not in allowed:
            assert "librarian" not in persona.delegates_to, (
                f"{name} should not delegate to librarian"
            )


# --- MCP server membership ---


@verifies(SWR.SWR_1904)
def test_librarian_mcp_servers_excludes_playwright() -> None:
    mcp = DEFAULT_PERSONAS["librarian"].mcp_servers
    assert "playwright" not in mcp
    assert "tavily" in mcp


# --- System prompt ---
@verifies(SWR.SWR_1906)
def test_librarian_system_prompt_file_points_to_prompt() -> None:
    assert DEFAULT_PERSONAS["librarian"].system_prompt_file == "prompts/librarian.md"


@verifies(SWR.SWR_1906)
def test_librarian_system_prompt_loads_successfully() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "persona for Rotaris" in prompt


@verifies(SWR.SWR_1906, SWR.SWR_1910)
def test_librarian_prompt_mentions_read_only_constraint() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "Do not create, edit, or delete" in prompt


@verifies(SWR.SWR_1905)
def test_librarian_prompt_prescribes_markdown_output() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "Markdown" in prompt


# --- Prompt tool alignment: must not reference unavailable tools ---


_UNAVAILABLE_TOOL_PATTERNS = [
    "git blame",
    "git log",
    "ast_grep",
    "context7",
]


@verifies(SWR.SWR_501)
def test_librarian_prompt_does_not_reference_git_blame() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "git blame" not in prompt, (
        "Librarian prompt must not reference 'git blame' — tool not available"
    )


@verifies(SWR.SWR_501)
def test_librarian_prompt_does_not_reference_git_log() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "git log" not in prompt, (
        "Librarian prompt must not reference 'git log' — tool not available"
    )


@verifies(SWR.SWR_501)
def test_librarian_prompt_does_not_reference_ast_grep() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "ast_grep" not in prompt, (
        "Librarian prompt must not reference 'ast_grep' — tool not available"
    )


@verifies(SWR.SWR_501)
def test_librarian_prompt_does_not_reference_context7() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "context7" not in prompt, (
        "Librarian prompt must not reference 'context7' — tool not available"
    )


@verifies(SWR.SWR_1902, SWR.SWR_1904, SWR.SWR_1911)
def test_librarian_prompt_says_prefer_fetch() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "Prefer `fetch`" in prompt


@verifies(SWR.SWR_1902, SWR.SWR_1904, SWR.SWR_1911)
def test_librarian_prompt_does_not_hardcode_tavily() -> None:
    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    assert "Tavily web search tool" not in prompt
    assert "configured MCP web-search tools" in prompt


@verifies(SWR.SWR_1902, SWR.SWR_1904, SWR.SWR_1911)
def test_librarian_prompt_tool_sections_reference_only_configured_tools() -> None:
    """Every tool name in the TYPE A/B/C/D 'Tools:' lines must be in the configured tool set."""
    import re

    prompt = load_system_prompt(DEFAULT_PERSONAS["librarian"])
    configured = set(DEFAULT_PERSONAS["librarian"].tools)

    # Extract tool lists from lines like: **Tools:** grep, glob, read_file
    tool_line_pattern = re.compile(r"\*\*Tools:\*\*\s+(.+)")
    for match in tool_line_pattern.finditer(prompt):
        raw_tools = [t.strip().rstrip(",") for t in match.group(1).split(",")]
        for tool in raw_tools:
            # Strip markdown backticks if present
            tool_name = tool.strip("`")
            assert tool_name in configured, (
                f"Librarian prompt 'Tools:' line references '{tool_name}' "
                f"which is not in the configured tool set {configured}"
            )
