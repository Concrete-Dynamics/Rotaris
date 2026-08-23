"""Unit coverage for the built-in configuration defaults."""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest

from rotaris_core.config.defaults import (
    DEFAULT_CONFIG,
    DEFAULT_MCP_SERVERS,
    DEFAULT_PERSONAS,
    SERENA_EDIT_TOOLS,
    SERENA_MEMORY_WRITE_TOOLS,
    SERENA_ONBOARDING_TOOLS,
    SERENA_PINNED_VERSION,
    SERENA_READ_TOOLS,
)
from rotaris_core.config.validation import validate_config
from rotaris_core.mcp.bundled_serena import BUNDLED_SERENA_COMMAND
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit

#: Personas that read or change the user's codebase and therefore get Serena's
#: symbolic code-intelligence tools out of the box (SWR-2801). Reading code
#: through symbols is cheaper than reading files, so the read-only ones are here
#: too — the list is "touches the repository", not "edits the repository".
DEVELOPER_PERSONAS = (
    "orchestrator",
    "architect",
    "coding-agent",
    "tester",
    "docs-writer",
    "refactorer",
    "planner",
    "requirements-engineer",
    "codebase-analyst",
    "verifier",
    "ui-verifier",
    "project-initializer",
)

#: The personas Serena is deliberately withheld from, and why (SWR-2801).
#:
#: `librarian` researches outside the repository; `intent-classifier` has no
#: tools at all; and `gatekeeper` (SWR-2614) reads manifests and probes commands
#: — its subject is the project's build configuration, not its symbols, and a
#: symbol index would be cost with nothing to spend it on.
NON_CODEBASE_PERSONAS = ("librarian", "intent-classifier", "gatekeeper")

#: The personas whose job is changing code, and which therefore get Serena's
#: symbolic *editing* tools on top of the reading ones (SWR-3008).
SERENA_EDITING_PERSONAS = ("coding-agent", "tester", "refactorer")


@verifies(SWR.SWR_2801)
def test_developer_personas_have_serena_mcp() -> None:
    """Productive use: whichever persona a developer's work lands on, it can look code up
    by symbol instead of re-reading whole files, with no config editing.
    Expected outcome: every persona that touches the repository ships ``serena`` in its
    default ``mcp_servers`` list."""
    for persona_name in DEVELOPER_PERSONAS:
        persona = DEFAULT_PERSONAS[persona_name]
        assert "serena" in persona.mcp_servers, (
            f"persona '{persona_name}' must request the 'serena' MCP server by default"
        )


@verifies(SWR.SWR_2801)
def test_external_and_classifier_personas_have_no_serena() -> None:
    """Productive use: a caller delegating to the librarian gets outside research, not a
    second opinion on the local repository.
    Expected outcome: ``librarian`` — the *external* reference specialist —
    ``intent-classifier``, which has no tools at all, and ``gatekeeper``, whose
    subject is the build configuration rather than the code, do not request
    Serena."""
    for persona_name in NON_CODEBASE_PERSONAS:
        persona = DEFAULT_PERSONAS[persona_name]
        assert "serena" not in persona.mcp_servers, (
            f"persona '{persona_name}' works outside the codebase; Serena would contradict "
            "the contract its callers delegate against"
        )


@verifies(SWR.SWR_3008)
def test_serena_grants_match_persona_roles() -> None:
    """Productive use: a user reads a persona's declaration and learns what it can do.

    Expected outcome: every persona carrying Serena declares a grant, the reading
    tools are in all of them, and only the three personas whose job is changing
    code carry the editing ones."""
    for persona_name in DEVELOPER_PERSONAS:
        persona = DEFAULT_PERSONAS[persona_name]
        granted = (persona.mcp_tools or {}).get("serena")
        assert granted is not None, (
            f"persona '{persona_name}' carries Serena without saying which of its "
            "tools it needs; an absent grant hands over the whole surface"
        )
        assert set(SERENA_READ_TOOLS) <= set(granted), (
            f"persona '{persona_name}' must be able to read the tree through symbols"
        )
        has_edit_tools = bool(set(SERENA_EDIT_TOOLS) & set(granted))
        assert has_edit_tools is (persona_name in SERENA_EDITING_PERSONAS), (
            f"persona '{persona_name}' holds Serena's editing tools only if changing "
            "code is its job"
        )


@verifies(SWR.SWR_3008)
def test_read_only_and_coordinator_personas_hold_no_serena_edit_tools() -> None:
    """Productive use: a persona declared read-only really cannot change the tree.

    Expected outcome: the native tool restriction's blind spot is closed — no
    persona declaring ``read_only`` or ``coordinator_only`` is granted a Serena
    tool that edits code or destroys a memory. Writing a memory is not on that
    list: those declarations are about the working tree, and the memory store is
    not part of it (SWR-2822)."""
    mutating = set(SERENA_EDIT_TOOLS) | {"delete_memory", "rename_memory"}
    for persona_name, persona in DEFAULT_PERSONAS.items():
        if not (persona.read_only or persona.coordinator_only):
            continue
        granted = set((persona.mcp_tools or {}).get("serena") or ())
        assert not (granted & mutating), (
            f"persona '{persona_name}' declares itself read-only/coordinator-only but "
            f"is granted {sorted(granted & mutating)}"
        )


@verifies(SWR.SWR_2822)
def test_every_serena_persona_reads_and_writes_memories() -> None:
    """Productive use: an agent that learns something durable can record it, and the
    next agent to work here reads it instead of re-deriving it.

    Expected outcome: every persona carrying Serena holds both halves of the memory
    store. A store one persona may write is a store nobody maintains — and the agent
    that finds a memory wrong is the one holding the correction."""
    memory_reading = {"list_memories", "read_memory"}

    for persona_name, persona in DEFAULT_PERSONAS.items():
        granted = set((persona.mcp_tools or {}).get("serena") or ())
        if not granted:
            continue
        assert memory_reading <= granted, (
            f"persona '{persona_name}' carries Serena but cannot read its memories"
        )
        assert set(SERENA_MEMORY_WRITE_TOOLS) <= granted, (
            f"persona '{persona_name}' carries Serena but cannot record what it learns"
        )


@verifies(SWR.SWR_2822)
def test_no_persona_may_delete_or_rename_a_memory() -> None:
    """Productive use: a memory disappears only through deliberate maintenance, never
    as a side effect of some agent's task.

    Expected outcome: the two destructive memory tools are granted to nobody, even
    though every persona may now write."""
    destructive = {"delete_memory", "rename_memory"}

    for persona_name, persona in DEFAULT_PERSONAS.items():
        granted = set((persona.mcp_tools or {}).get("serena") or ())
        assert not (granted & destructive), (
            f"persona '{persona_name}' is granted {sorted(granted & destructive)}"
        )


@verifies(SWR.SWR_2822)
def test_only_the_project_initializer_holds_serena_onboarding() -> None:
    """Productive use: Serena's guided first pass belongs to the persona whose job it
    is, and to no persona that merely writes a memory in passing.

    Expected outcome: ``onboarding`` is declared apart from the memory-writing tools
    — it writes nothing, it returns instructions — and only the initializer has it."""
    holders = {
        name
        for name, persona in DEFAULT_PERSONAS.items()
        if set((persona.mcp_tools or {}).get("serena") or ()) & set(SERENA_ONBOARDING_TOOLS)
    }

    assert holders == {"project-initializer"}


@verifies(SWR.SWR_3008)
def test_no_persona_is_granted_a_tool_the_pinned_serena_does_not_ship() -> None:
    """Productive use: a grant list is only useful if it names real tools.

    Expected outcome: every granted name is one of the four curated sets, which
    are themselves written from the pinned build's own tool list."""
    known = (
        set(SERENA_READ_TOOLS)
        | set(SERENA_EDIT_TOOLS)
        | set(SERENA_MEMORY_WRITE_TOOLS)
        | set(SERENA_ONBOARDING_TOOLS)
    )
    for persona_name, persona in DEFAULT_PERSONAS.items():
        granted = set((persona.mcp_tools or {}).get("serena") or ())
        assert granted <= known, (
            f"persona '{persona_name}' grants unknown Serena tools: {sorted(granted - known)}"
        )


@verifies(SWR.SWR_2801)
def test_every_persona_is_accounted_for_in_the_serena_decision() -> None:
    """Productive use: a persona added later is a deliberate Serena decision, not an
    accidental omission that quietly costs it symbol search.
    Expected outcome: the two lists above together name every default persona."""
    assert set(DEVELOPER_PERSONAS) | set(NON_CODEBASE_PERSONAS) == set(DEFAULT_PERSONAS)


@verifies(SWR.SWR_2801)
def test_serena_default_server_keeps_default_config_valid() -> None:
    """Productive use: a user starts Rotaris with no custom config and the app comes up.
    Expected outcome: ``serena`` is a known default MCP server, so config validation reports no
    unknown-MCP-server error for the personas that reference it."""
    assert "serena" in DEFAULT_MCP_SERVERS

    errors = validate_config(DEFAULT_CONFIG)

    unknown_server_errors = [error for error in errors if "unknown MCP server" in error]
    assert unknown_server_errors == []


@verifies(SWR.SWR_2801, SWR.SWR_2819, SWR.SWR_3723)
def test_serena_default_server_launches_the_bundled_runtime_over_stdio() -> None:
    """Productive use: a user gets Serena directly from their Rotaris installation.
    Expected outcome: the default stdio entry uses the Rotaris-owned launcher."""
    serena = DEFAULT_MCP_SERVERS["serena"]

    assert serena.type == "stdio"
    assert serena.command == BUNDLED_SERENA_COMMAND
    assert "start-mcp-server" in serena.args


@verifies(SWR.SWR_2819, SWR.SWR_3723)
def test_serena_default_names_an_exact_release_not_a_moving_ref() -> None:
    """Productive use: two developers on two machines run the same Serena, and a bug
    report filed against one of them can be reproduced on the other.
    Expected outcome: the launch names an exact ``serena-agent`` release. A ``git+`` ref
    would resolve to whatever upstream's default branch held when the ``uvx`` cache was
    last cold, which is not a version anyone can cite."""
    dependencies = tomllib.loads(
        (Path(__file__).parents[2] / "pyproject.toml").read_text(encoding="utf-8")
    )["project"]["dependencies"]
    serena_dependency = next(
        dependency for dependency in dependencies if dependency.startswith("serena-agent")
    )

    assert re.fullmatch(r"\d+\.\d+\.\d+", SERENA_PINNED_VERSION), (
        f"SERENA_PINNED_VERSION must be an exact release, got {SERENA_PINNED_VERSION!r}"
    )
    assert serena_dependency == f"serena-agent=={SERENA_PINNED_VERSION}"
    assert "git+" not in serena_dependency
    assert "@latest" not in serena_dependency


@verifies(SWR.SWR_2818)
def test_no_default_persona_requests_the_lsp_server() -> None:
    """Productive use: a developer's agent starts one language-server backend, not two, and
    its prompt offers one vocabulary for "where is this defined?".
    Expected outcome: no built-in persona asks for ``lsp``. Serena answers definitions,
    references and diagnostics already, bound to the tree the run executes in."""
    with_lsp = [name for name, persona in DEFAULT_PERSONAS.items() if "lsp" in persona.mcp_servers]

    assert with_lsp == [], f"personas still requesting the removed 'lsp' server: {with_lsp}"


@verifies(SWR.SWR_2818)
def test_lsp_is_not_a_default_mcp_server() -> None:
    """Productive use: a user opening the MCP management screen sees the servers Rotaris
    actually uses, not a dead entry nothing references.
    Expected outcome: ``lsp`` is absent from the defaults, and the defaults still validate —
    removing a server that no persona names leaves no dangling reference behind."""
    assert "lsp" not in DEFAULT_MCP_SERVERS

    errors = validate_config(DEFAULT_CONFIG)

    assert [error for error in errors if "unknown MCP server" in error] == []


@verifies(SWR.SWR_3715)
def test_git_mcp_is_absent_from_the_shipped_configuration() -> None:
    """Productive use: an installed user starts agents without a redundant Git MCP process.
    Expected outcome: Git is absent from default MCP servers and every default persona grant."""
    assert "git" not in DEFAULT_MCP_SERVERS
    assert [
        name for name, persona in DEFAULT_PERSONAS.items() if "git" in persona.mcp_servers
    ] == []


@verifies(SWR.SWR_2818)
def test_code_personas_keep_serena_and_their_textual_fallback() -> None:
    """Productive use: when Serena cannot answer — a string in a comment, a config key, a
    file its language server does not index — the persona still has a way to look.
    Expected outcome: dropping ``lsp`` took nothing else with it. Every code-touching
    persona still has ``serena``, and every persona that had textual search still has it.
    Serena's ``ide`` context excludes its *own* ``read_file``/``find_file``/``list_dir``
    precisely because it expects the host to provide them."""
    for persona_name in DEVELOPER_PERSONAS:
        persona = DEFAULT_PERSONAS[persona_name]
        assert "serena" in persona.mcp_servers

    textual_tools = {"grep", "glob", "read_file", "haet_read"}
    for persona_name in DEVELOPER_PERSONAS:
        persona = DEFAULT_PERSONAS[persona_name]
        assert textual_tools & set(persona.tools), (
            f"persona '{persona_name}' has no textual fallback for what Serena cannot index"
        )


@verifies(SWR.SWR_2905)
def test_serena_default_uses_the_generic_ide_context() -> None:
    """Productive use: a user's agents get Serena's full search toolset and prose written
    for an IDE assistant rather than for another vendor's CLI.
    Expected outcome: the default asks for ``ide``. ``ide-assistant`` is a deprecated alias
    Serena remaps to its ``claude-code`` context, which withholds ``search_for_pattern``."""
    args = DEFAULT_MCP_SERVERS["serena"].args

    assert args[args.index("--context") + 1] == "ide"


@verifies(SWR.SWR_2905)
def test_serena_default_leaves_the_project_to_the_run() -> None:
    """Productive use: a user runs an isolated session and Serena indexes the worktree.
    Expected outcome: no ``--project`` is baked into the defaults — the directory a run
    works in is only known per run, so the binding is filled in there."""
    args = DEFAULT_MCP_SERVERS["serena"].args

    assert "--project" not in args
    assert "--project-from-cwd" not in args
