from __future__ import annotations

from rotaris_core.config.schema import (
    CircuitBreakerConfig,
    CompressorConfig,
    MCPServerConfig,
    ModelConfig,
    PersonaConfig,
    RequirementPersonaConfig,
    RequirementsConfig,
    RotarisConfig,
    RuntimePolicy,
)
from rotaris_core.reqtocode import SWR, traces

DEFAULT_RUNTIME_POLICY = RuntimePolicy()
DEFAULT_COMPRESSOR = CompressorConfig(model="small_model")
DEFAULT_CIRCUIT_BREAKER = CircuitBreakerConfig(model="small_model")

#: The persona that reads a repository to propose a requirement source mapping
#: (SWR-3106), and that carries the other read-only requirement analyses until a
#: slice gives one of them its own persona.
#:
#: `requirements-engineer` rather than a new name: its declared job already is
#: "turns goals into traceable requirements, acceptance criteria, and
#: requirements-store status updates", it already carries Serena's reading tools
#: (SWR-2801), and adding a fifteenth persona for a job an existing one names
#: would make every persona-roster decision in this file harder to read.
REQUIREMENTS_ANALYSIS_PERSONA = "requirements-engineer"

#: The persona that splits a requirement into execution units (SWR-3404).
#:
#: Decomposition is an *analysis*, not an implementation: it reads the
#: requirement, weighs the eight factors SWR-3404 names and answers with units
#: and a rationale. Nothing it produces touches code, so it stays on the
#: read-only analysis persona rather than on one that can write — a planner able
#: to edit the repository would be a planner able to start the work it is only
#: supposed to describe.
REQUIREMENTS_DECOMPOSITION_PERSONA = REQUIREMENTS_ANALYSIS_PERSONA

#: The persona that carries one execution unit's run (SWR-3407, SWR-3413).
#:
#: `coding-agent` rather than a requirement-specific name: a unit run *is* an
#: implementation task — it edits code, updates tests and commits inside its own
#: worktree (SWR-3405) — and what makes it a requirement run is the structured
#: context it is handed (SWR-3407), not a different set of tools. A workspace
#: that wants a specialised implementer points
#: `requirements.personas.execution` at it; the default names the persona whose
#: declared job this already is.
REQUIREMENT_EXECUTION_PERSONA = "coding-agent"

#: The persona that decides what a requirement change costs (SWR-3503).
#:
#: The read-only analysis persona, and here that is a safety property rather
#: than a convenience: an impact analysis reads two requirement versions, the
#: existing traces and tests and the evidence health, and answers with one of
#: six outcomes. It must not be able to *act* on that answer — the units it
#: causes are minted by SWR-3505 and run by
#: :data:`REQUIREMENT_EXECUTION_PERSONA`, which is what keeps "this needs a code
#: change" and "here is the code change" two separately reviewable steps.
REQUIREMENT_IMPACT_PERSONA = REQUIREMENTS_ANALYSIS_PERSONA

#: The persona that builds a superseding requirement's migration worklist
#: (SWR-3507, SWR-3509).
#:
#: Read-only for the same reason, and with more at stake: this is the one
#: analysis in the requirement machinery whose outcome is a list of *removals*
#: and *re-points* in somebody else's code. It classifies the sites; a person
#: approves the worklist, and only then does an executor touch a file. A
#: migration analyst able to write would collapse those three steps into one.
REQUIREMENT_MIGRATION_PERSONA = REQUIREMENTS_ANALYSIS_PERSONA

#: Defaults of the `requirements:` block (SWR-3117).
#:
#: Deliberately close to empty: `sources` stays unset so a workspace with a
#: ReqToCode store gets the built-in source (SWR-3103) and one without gets no
#: source rather than a misconfigured one, and scheduling stays `manual` so
#: adopting the board never starts an agent nobody asked for. Every other value
#: is the schema's own documented default — one place, not two.
DEFAULT_REQUIREMENTS = RequirementsConfig(
    personas=RequirementPersonaConfig(
        source_discovery=REQUIREMENTS_ANALYSIS_PERSONA,
        decomposition=REQUIREMENTS_DECOMPOSITION_PERSONA,
        execution=REQUIREMENT_EXECUTION_PERSONA,
        impact_analysis=REQUIREMENT_IMPACT_PERSONA,
        migration_analysis=REQUIREMENT_MIGRATION_PERSONA,
    ),
)

DEFAULT_MODELS = {
    "gpt-4o": ModelConfig(
        provider="openai",
        model_id="gpt-4o",
        api_key_env="OPENAI_API_KEY",
    ),
    "gpt-4o-mini": ModelConfig(
        provider="openai",
        model_id="gpt-4o-mini",
        api_key_env="OPENAI_API_KEY",
    ),
}

ARTIFACT_READ_TOOLS = ["artifact_read", "artifact_list"]
ARTIFACT_ALL_TOOLS = [*ARTIFACT_READ_TOOLS, "artifact_write"]
LEGACY_PERSONA_ALIASES = {"oracle": "codebase-analyst"}

SERENA_PINNED_VERSION = "1.7.0"
"""The one place the Serena release is named (SWR-2819).

Upgrading Serena is a single edit here with the whole suite behind it, which is
the point: this server is the only semantic code intelligence Rotaris ships
(SWR-2818), so an unpinned launch would let an upstream push rename tools,
withhold one a persona prompt tells an agent to call, or fail to build — on some
machines and not others, depending only on whose `uvx` cache was cold.
"""

SERENA_READ_TOOLS = [
    "find_symbol",
    "get_symbols_overview",
    "find_referencing_symbols",
    "find_implementations",
    "find_declaration",
    "search_for_pattern",
    "get_diagnostics_for_file",
    "list_memories",
    "read_memory",
    "initial_instructions",
]
"""Everything a persona needs to *understand* the tree, and nothing that changes it.

Names come from the pinned build (`SERENA_PINNED_VERSION`) under `--context ide`;
a name a future release drops is inert rather than fatal (SWR-3009), which is what
lets this list be explicit instead of defensive.
"""

SERENA_EDIT_TOOLS = [
    "replace_symbol_body",
    "insert_before_symbol",
    "insert_after_symbol",
    "rename_symbol",
    "safe_delete_symbol",
    "replace_content",
    "replace_in_files",
]
"""Symbolic editing. Only the three personas whose job is changing code get these."""

SERENA_MEMORY_WRITE_TOOLS = [
    "write_memory",
    "edit_memory",
]
"""Recording what this repository taught an agent, for the next one (SWR-2822).

Every persona that carries `serena` gets these, because a memory only one persona
may write is a memory nobody maintains: the reader already holds `list_memories`
and `read_memory` through `SERENA_READ_TOOLS`, and a finding worth reading is
worth correcting by whoever found it wrong.

`delete_memory` and `rename_memory` stay absent from every grant. Removing a
memory is a maintenance decision about the store as a whole, not something a
persona should reach for mid-task.
"""

SERENA_ONBOARDING_TOOLS = [
    "onboarding",
]
"""Serena's own onboarding walkthrough — for an *agentic* initialization task.

Separate from `SERENA_MEMORY_WRITE_TOOLS` because it is not memory writing:
Serena's `onboarding` writes nothing, it returns instructions telling the model
what to gather and then write. Only a persona whose whole job is that guided
first pass needs it, which today is `project-initializer` (SWR-2803) — a task
Rotaris no longer registers by default (SWR-2820).
"""

# `serena` belongs on every persona that reads or changes repository code
# (SWR-2801), which is all of them but two: `librarian` is the *external*
# reference specialist and repository symbol tools would contradict the contract
# its callers delegate against, and `intent-classifier` has no tools at all.
# Reading code through symbols is cheaper for a persona that only reads it, so
# the read-only personas get it too.
#
# Carrying the server is not carrying its whole surface (SWR-3008): each persona's
# `mcp_tools` names the Serena tools its role needs. Without that, a `read_only`
# persona would hold `replace_symbol_body` and `safe_delete_symbol` — the native
# tool restriction only ever looked at native tools. `open_dashboard` appears in no
# grant: it opens Serena's own web UI and belongs to no persona's job.
#
# The memory store is the one part of that surface every Serena persona shares
# (SWR-2822): reading it is in `SERENA_READ_TOOLS` and writing it is in
# `SERENA_MEMORY_WRITE_TOOLS`. A store only one persona may write is a store
# nobody maintains, and the agent that discovers a memory is wrong is the one
# holding the correction.
DEFAULT_PERSONAS = {
    "orchestrator": PersonaConfig(
        name="orchestrator",
        model="large_model",
        purpose=(
            "Orchestrating tech lead: decomposes goals, plans execution, and delegates "
            "to specialist personas."
        ),
        tools=[
            "delegate",
            "todo",
            "haet_read",
            "read_file",
            *ARTIFACT_READ_TOOLS,
            # Extended tool set available only when intent policy grants direct write
            # access (e.g. explicit_trivial, single_file_change). These are filtered
            # out by _apply_tool_restrictions when no intent_tools override is in
            # effect and coordinator_only=True is the fallback.
            "write_file",
            "grep",
            "glob",
            "fetch",
            "terminal",
            "git_commit",
        ],
        coordinator_only=True,
        delegates_to=[
            "architect",
            "coding-agent",
            "tester",
            "ui-verifier",
            "docs-writer",
            "refactorer",
            "planner",
            "requirements-engineer",
            "librarian",
            "codebase-analyst",
            "verifier",
        ],
        mcp_servers=["tavily", "serena"],
        # Coordinator: routes on symbols, never edits.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/orchestrator.md",
    ),
    "intent-classifier": PersonaConfig(
        name="intent-classifier",
        model="small_model",
        purpose="Pre-flight classifier: maps the user's raw request to an orchestration intent.",
        tools=[],
        delegates_to=[],
        system_prompt_file="prompts/intent_classifier.md",
    ),
    "architect": PersonaConfig(
        name="architect",
        model="large_model",
        purpose=(
            "System architect: designs solutions, reviews structure, and resolves "
            "technical decisions before implementation."
        ),
        tools=[
            "write_file",
            "read_file",
            "haet_read",
            "haet_edit",
            "terminal",
            "fetch",
            "grep",
            "glob",
            "delegate",
            *ARTIFACT_ALL_TOOLS,
        ],
        can_publish_artifacts=True,
        delegates_to=["librarian", "codebase-analyst"],
        mcp_servers=["tavily", "serena"],
        # Designs; what it writes is prose, through `write_file`.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/architect.md",
    ),
    "coding-agent": PersonaConfig(
        name="coding-agent",
        model="medium_model",
        purpose=("Implementation specialist: makes scoped code changes and verifies them."),
        tools=[
            "delegate",
            "write_file",
            "read_file",
            "haet_read",
            "haet_edit",
            "terminal",
            "fetch",
            "glob",
            "grep",
            *ARTIFACT_READ_TOOLS,
        ],
        delegates_to=["librarian", "codebase-analyst", "ui-verifier"],
        mcp_servers=["serena"],
        # The implementation persona.
        mcp_tools={
            "serena": [*SERENA_READ_TOOLS, *SERENA_EDIT_TOOLS, *SERENA_MEMORY_WRITE_TOOLS],
        },
        system_prompt_file="prompts/coding_agent.md",
    ),
    "tester": PersonaConfig(
        name="tester",
        model="medium_model",
        purpose=(
            "QA specialist: writes and runs tests, validates correctness, and reports "
            "coverage gaps."
        ),
        tools=[
            "write_file",
            "read_file",
            "haet_read",
            "haet_edit",
            "terminal",
            "git_commit",
            "grep",
            "glob",
            *ARTIFACT_READ_TOOLS,
        ],
        delegates_to=["librarian", "codebase-analyst", "ui-verifier"],
        mcp_servers=["playwright", "serena"],
        # Authors tests, so it writes code.
        mcp_tools={
            "serena": [*SERENA_READ_TOOLS, *SERENA_EDIT_TOOLS, *SERENA_MEMORY_WRITE_TOOLS],
        },
        system_prompt_file="prompts/tester.md",
    ),
    "docs-writer": PersonaConfig(
        name="docs-writer",
        model="medium_model",
        purpose=(
            "Documentation specialist: writes and updates technical documentation and "
            "code comments."
        ),
        tools=[
            "write_file",
            "haet_read",
            "haet_edit",
            "read_file",
            "grep",
            "glob",
            *ARTIFACT_ALL_TOOLS,
        ],
        can_publish_artifacts=True,
        delegates_to=["librarian", "codebase-analyst"],
        mcp_servers=["tavily", "serena"],
        # Reads code to document it; the documents go through `write_file`.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/docs_writer.md",
    ),
    "refactorer": PersonaConfig(
        name="refactorer",
        model="large_model",
        purpose="Code quality specialist: restructures and cleans code while preserving behavior.",
        tools=[
            "write_file",
            "haet_read",
            "haet_edit",
            "terminal",
            *ARTIFACT_READ_TOOLS,
        ],
        delegates_to=[],
        mcp_servers=["serena"],
        # `rename_symbol` and `safe_delete_symbol` are this persona's whole job.
        mcp_tools={
            "serena": [*SERENA_READ_TOOLS, *SERENA_EDIT_TOOLS, *SERENA_MEMORY_WRITE_TOOLS],
        },
        system_prompt_file="prompts/refactorer.md",
    ),
    "planner": PersonaConfig(
        name="planner",
        model="large_model",
        purpose=(
            "Task planner: produces structured execution plans with ordered steps and "
            "dependency maps."
        ),
        tools=["read_file", "grep", "glob", "delegate", "haet_read", *ARTIFACT_ALL_TOOLS],
        can_publish_artifacts=True,
        delegates_to=["architect", "requirements-engineer", "librarian", "codebase-analyst"],
        mcp_servers=["tavily", "serena"],
        # Plans against the tree it reads.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/planner.md",
    ),
    "requirements-engineer": PersonaConfig(
        name="requirements-engineer",
        model="medium_model",
        purpose=(
            "Requirements engineer: turns goals into traceable requirements, acceptance "
            "criteria, and requirements-store status updates."
        ),
        tools=[
            "write_file",
            "haet_read",
            "haet_edit",
            "read_file",
            "grep",
            "glob",
            "delegate",
            *ARTIFACT_ALL_TOOLS,
        ],
        can_publish_artifacts=True,
        delegates_to=["librarian", "codebase-analyst"],
        mcp_servers=["serena"],
        # Traces requirements through code; the requirement store is `write_file`.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/requirements_engineer.md",
    ),
    "librarian": PersonaConfig(
        name="librarian",
        model="medium_model",
        purpose=(
            "External reference specialist: fetches third-party library docs, API "
            "references, RFCs, and web research from outside the workspace."
        ),
        tools=[
            "read_file",
            "fetch",
            "haet_read",
            "glob",
            "grep",
            *ARTIFACT_ALL_TOOLS,
        ],
        can_publish_artifacts=True,
        delegates_to=[],
        mcp_servers=["tavily"],
        system_prompt_file="prompts/librarian.md",
    ),
    "codebase-analyst": PersonaConfig(
        name="codebase-analyst",
        model="medium_model",
        purpose=(
            "Internal codebase analyst: answers targeted repository questions with "
            "concise, evidence-backed findings."
        ),
        thinking="low",
        tools=["read_file", "grep", "glob", *ARTIFACT_ALL_TOOLS],
        can_publish_artifacts=True,
        read_only=True,
        delegates_to=[],
        mcp_servers=["git", "serena"],
        # `read_only=True` — the declaration the whole-server grant used to contradict.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/oracle.md",
    ),
    "verifier": PersonaConfig(
        name="verifier",
        model="medium_model",
        purpose=(
            "Post-implementation verifier: validates completed work against the "
            "original user request, todo list, and acceptance criteria. "
            "Read-only verification — runs tests/lints but does not edit code."
        ),
        tools=[
            "haet_read",
            "grep",
            "glob",
            "terminal",
            *ARTIFACT_READ_TOOLS,
        ],
        delegates_to=[],
        mcp_servers=["serena"],
        # Runs tests and lints; verifying is not editing.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/verifier.md",
    ),
    "ui-verifier": PersonaConfig(
        name="ui-verifier",
        model="large_model",
        purpose=(
            "UI verifier: drives a headless browser via Playwright to verify UI paths, "
            "interactions, and visual correctness during development. Returns structured "
            "PASS / GAPS reports with screenshot evidence."
        ),
        tools=["haet_read", "grep", "glob", *ARTIFACT_READ_TOOLS],
        read_only=True,
        delegates_to=[],
        mcp_servers=["playwright", "serena"],
        # `read_only=True`; it drives a browser, it does not change the tree.
        mcp_tools={"serena": [*SERENA_READ_TOOLS, *SERENA_MEMORY_WRITE_TOOLS]},
        system_prompt_file="prompts/ui_verifier.md",
    ),
    # System-only persona (SWR-2614): reached through the gate-authoring runner,
    # never through `delegate`. Absent from every other persona's `delegates_to`,
    # the same arrangement `project-initializer` and `compressor-agent` use — and
    # here it is a safety property rather than tidiness. Authoring the gate must
    # not be done by a persona whose completion that gate constrains, so no task
    # persona may reach this one.
    #
    # `read_only=True` covers the tree. The two things it *can* change reach it as
    # internal tools the authoring run attaches: `verifier_probe` and
    # `verifier_gate_write`. Neither appears in `TOOL_NAME_MAP`, so no
    # configuration can hand them to anybody else, and the write tool enforces its
    # own authority rule rather than trusting the prompt above it.
    "gatekeeper": PersonaConfig(
        name="gatekeeper",
        # `small_model` so the persona is valid out of the box: `gatekeeper_model`
        # is a *slot*, not a tier alias, and an unset slot must not leave this
        # persona pointing at a model name nobody defined. The slot overrides this
        # at run time through `resolve_gatekeeper_model` (SWR-2614).
        model="small_model",
        purpose=(
            "Quality-gate author: reads a workspace's manifests, probes the commands "
            "they imply, and writes the check suite that verifies it."
        ),
        tools=["read_file", "grep", "glob"],
        read_only=True,
        delegates_to=[],
        mcp_servers=[],
        system_prompt_file="prompts/gatekeeper.md",
    ),
    # System-only persona (SWR-2803): reached through the project-initialization
    # runner, never through `delegate`. It is deliberately absent from every
    # other persona's `delegates_to`, which is what keeps it out of the
    # delegation DAG — the same arrangement `compressor-agent` uses.
    #
    # It stays configured while no registered task runs it (SWR-2820): setting a
    # project up is deterministic work the CLI does without a model, so the
    # persona is kept for an initialization task that genuinely needs prose,
    # not deleted and re-derived when one arrives.
    "project-initializer": PersonaConfig(
        name="project-initializer",
        model="small_model",
        purpose=(
            "First-run project initializer: activates the workspace in Serena and, for "
            "code projects, runs Serena onboarding so durable project memories exist "
            "before any other persona touches the codebase."
        ),
        tools=["read_file", "grep", "glob"],
        read_only=True,
        delegates_to=[],
        mcp_servers=["serena"],
        # The only persona holding `onboarding`: Serena's guided first pass is its
        # whole task (SWR-2803). `read_only=True` is about the *tree*, not the
        # memory store — which every Serena persona may now write (SWR-2822).
        mcp_tools={
            "serena": [
                *SERENA_READ_TOOLS,
                *SERENA_MEMORY_WRITE_TOOLS,
                *SERENA_ONBOARDING_TOOLS,
            ],
        },
        system_prompt_file="prompts/project_initializer.md",
    ),
}

DEFAULT_MCP_SERVERS = {
    "tavily": MCPServerConfig(
        type="http",
        url="https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}",
        request_timeout=600,
    ),
    "playwright": MCPServerConfig(
        command="npx",
        args=["-y", "@playwright/mcp@latest", "--headless"],
    ),
    # Symbolic code intelligence (symbol search, references, diagnostics, edits)
    # plus project onboarding memories — and, since SWR-2818, the *only* one of
    # those Rotaris ships. The `lsp` server that used to sit beside it answered a
    # strict subset of the same questions and had to be told its root at runtime;
    # Serena answers them bound to the run's own tree. `lsp` is still
    # configurable by a user who wants it, it is simply no longer a default.
    #
    # Launched through `uvx`, so no separate install step is required. When
    # `uvx` is not on PATH the factory drops this server and personas keep
    # working with their remaining toolset (grep/glob/read_file/haet_read —
    # see agents/factory.py::_mcp_server_is_available).
    #
    # `--project <workspace_root>` is deliberately absent here: it is filled in
    # per run by `mcp_resolution._bind_serena_to_workspace`, because the directory
    # a run works in is only known then — an isolated session runs in a worktree
    # (SWR-2905). That binding is what puts Serena in single-project mode, where
    # it stops advertising `activate_project` and `get_current_config`.
    #
    # `--context ide`, not `ide-assistant`: the latter is a deprecated alias
    # Serena remaps to its `claude-code` context, whose prompt is written for
    # another product's built-in tools and which withholds `search_for_pattern`.
    #
    # The published `serena-agent` release, pinned (SWR-2819) — not
    # `git+https://github.com/oraios/serena`, which resolves to whatever the
    # upstream default branch holds the moment a machine's `uvx` cache is cold.
    # Serena is the harness's only semantic navigator; it does not get to change
    # underneath a run.
    "serena": MCPServerConfig(
        type="stdio",
        command="uvx",
        args=[
            "--from",
            f"serena-agent=={SERENA_PINNED_VERSION}",
            "serena",
            "start-mcp-server",
            "--context",
            "ide",
            "--transport",
            "stdio",
        ],
    ),
    "git": MCPServerConfig(
        command="npx",
        args=["-y", "@cyanheads/git-mcp-server@latest"],
        disabled_tools=[
            "git_init",
            "git_clone",
            "git_clean",
            "git_add",
            "git_commit",
            "git_checkout",
            "git_merge",
            "git_rebase",
            "git_cherry_pick",
            "git_branch",
            "git_remote",
            "git_tag",
            "git_fetch",
            "git_pull",
            "git_push",
            "git_stash",
            "git_reset",
            "git_worktree",
            "git_set_working_dir",
            "git_clear_working_dir",
            "git_wrapup_instructions",
        ],
    ),
}

DEFAULT_CONFIG = RotarisConfig(
    small_model="gpt-4o-mini",
    medium_model="gpt-4o-mini",
    large_model="gpt-4o",
    fallback_model="small_model",
    personas=DEFAULT_PERSONAS,
    models=DEFAULT_MODELS,
    mcp_servers=DEFAULT_MCP_SERVERS,
    runtime=DEFAULT_RUNTIME_POLICY,
    compressor=DEFAULT_COMPRESSOR,
    circuit_breaker=DEFAULT_CIRCUIT_BREAKER,
    requirements=DEFAULT_REQUIREMENTS,
)

traces(
    SWR.SWR_301,
    SWR.SWR_303,
    SWR.SWR_344,
    SWR.SWR_346,
    SWR.SWR_351,
    SWR.SWR_364,
    SWR.SWR_372,
    SWR.SWR_374,
    SWR.SWR_375,
    SWR.SWR_376,
    SWR.SWR_377,
    SWR.SWR_379,
    SWR.SWR_380,
    SWR.SWR_662,
    SWR.SWR_2801,
    SWR.SWR_2803,
    SWR.SWR_2818,
    SWR.SWR_3008,
)(DEFAULT_PERSONAS)

# The server map carries its own trace: SWR-2818 removed the `lsp` entry from it
# and SWR-2819 pins the Serena entry that remains — neither is a statement about
# the persona roster above.
traces(SWR.SWR_2818, SWR.SWR_2819)(DEFAULT_MCP_SERVERS)

# The requirements block's defaults, including which persona reads a repository
# to propose a source mapping (SWR-3106). Later slices change values here; the
# schema is not extended again (SWR-3117).
traces(SWR.SWR_3106, SWR.SWR_3117)(DEFAULT_REQUIREMENTS)
