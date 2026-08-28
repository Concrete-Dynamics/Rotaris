---
req-id: [SWR-300, SWR-301, SWR-302, SWR-303, SWR-304, SWR-305, SWR-306, SWR-308, SWR-309, SWR-310, SWR-311, SWR-313, SWR-314, SWR-315, SWR-316, SWR-317, SWR-318, SWR-319, SWR-320, SWR-321, SWR-322, SWR-323, SWR-324, SWR-325, SWR-326, SWR-327, SWR-328, SWR-329, SWR-330, SWR-331, SWR-332, SWR-334, SWR-335, SWR-336, SWR-337, SWR-338, SWR-339, SWR-340, SWR-341, SWR-342, SWR-343, SWR-344, SWR-346, SWR-347, SWR-348, SWR-349, SWR-350, SWR-351, SWR-352, SWR-353, SWR-354, SWR-355, SWR-356, SWR-357, SWR-358, SWR-361, SWR-362, SWR-364, SWR-365, SWR-366, SWR-367, SWR-368, SWR-369, SWR-372, SWR-373, SWR-374, SWR-375, SWR-376, SWR-377, SWR-378, SWR-379, SWR-380, SWR-381, SWR-384, SWR-385]
status: approved
trace: required
test: required
title: "Agent Personas & Prompt System"
---

# 300-personas-prompts spec

## SWR-300 — Agent Personas & Prompt System
trace: optional
test: optional

Role-based personas, LLM configuration, dynamic system prompt templates, prompt adaptations (OMO/OpenCode), and specialized personas such as the requirements engineer and UI verifier.

## SWR-301 — Persona Definition
legacy-id: FR-2-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Agents are defined as **role-based personas** (e.g., `@architect`, `@backend-dev`, `@tester`, `@docs-writer`, `@refactorer`).

## SWR-302 — Persona Payload
legacy-id: FR-2-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Each persona carries: a system prompt defining its role, expertise, and behavior; a specific toolset (only the tools relevant to the role); a model assignment (can use different LLMs per persona); and optional skill definitions or knowledge files.

## SWR-303 — Persona Config Location
legacy-id: FR-2-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Personas are declared in configuration files (`agents.yaml`).

## SWR-304 — Custom Personas
legacy-id: FR-2-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Developers can define **custom personas** alongside built-in ones.

## SWR-305 — Orchestrator as Persona
legacy-id: FR-2-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

The orchestration role is expressed as a persona plus its toolset and system prompt. There is no separate non-persona scheduler schema in v1.

## SWR-306 — OpenHands SDK LLM Registry
legacy-id: FR-5-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Uses the **OpenHands SDK LLM Registry** for provider abstraction.

## SWR-308 — Supported Providers
legacy-id: FR-5-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Supported providers inherit from OpenHands SDK support (OpenAI, Anthropic, Ollama, etc.).

## SWR-309 — Per-Persona Model Reference
legacy-id: FR-5-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Each persona in `agents.yaml` references a model by its registry ID for startup defaults.

## SWR-310 — Summary Model
legacy-id: FR-5-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

v1 requires a `default_summary_model` registry ID for the mandatory cheap summary agent. A persona may override this with its own `summary_model`.

## SWR-311 — Per-Agent Model Routing
legacy-id: FR-5-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

This enables per-agent model routing: the orchestrator can use a powerful model while sub-agents use cheaper/faster ones.

## SWR-313 — Two-Tier Hierarchy
legacy-id: FR-CONFIG-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Configuration is loaded from two locations: `~/.config/rotaris/` (global, always loaded) and `<workspace>/.rotaris/` (workspace scope, higher priority).

## SWR-314 — Workspace Root
legacy-id: FR-CONFIG-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

The resolved **workspace root** defaults to the directory from which the CLI or TUI was launched. It may be overridden explicitly via CLI argument.

## SWR-315 — Path Resolution
legacy-id: FR-CONFIG-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Relative paths in global config resolve relative to `~/.config/rotaris/`. Relative paths in workspace config resolve relative to `<workspace>/.rotaris/`.

## SWR-316 — Keyed Registry Override
legacy-id: FR-CONFIG-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

`personas`, `models`, custom tool registrations, and MCP server registrations are keyed registries. When the workspace defines an entry with the same key as a global entry, the workspace entry **fully replaces** the global entry. There is no field-level deep merge on entries.

## SWR-317 — Collection-Valued Fields
legacy-id: FR-CONFIG-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Collection-valued fields inside an entry (tool lists, MCP server lists) are full replacement - they do not deep-merge element contents.

## SWR-318 — Global Fallback
legacy-id: FR-CONFIG-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md

Any configuration not specified at workspace level falls back to the global configuration. If no workspace config is present, global config is used as-is.

## SWR-319 — Template Syntax
legacy-id: REQ-20260414-160000-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

System prompts must support `[[ROTARIS:TOKEN]]` placeholders that are replaced at agent creation time.

## SWR-320 — PERSONA_NAME Token
legacy-id: REQ-20260414-160000-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`[[ROTARIS:PERSONA_NAME]]` must be replaced with the persona's configured name.

## SWR-321 — TOOL_NAMES Token
legacy-id: REQ-20260414-160000-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`[[ROTARIS:TOOL_NAMES]]` must be replaced with a comma-separated list of the persona's configured tools.

## SWR-322 — TOOLS_SECTION Token
legacy-id: REQ-20260414-160000-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`[[ROTARIS:TOOLS_SECTION]]` must be replaced with a formatted block listing each tool with a behavioral one-liner hint.

## SWR-323 — DELEGATE_NAMES Token
legacy-id: REQ-20260414-160000-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`[[ROTARIS:DELEGATE_NAMES]]` must be replaced with a comma-separated list of personas the agent can delegate to.

## SWR-324 — DELEGATES_SECTION Token
legacy-id: REQ-20260414-160000-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`[[ROTARIS:DELEGATES_SECTION]]` must be replaced with a formatted block listing each delegate persona.

## SWR-325 — MCP_SECTION Token
legacy-id: REQ-20260414-160000-007
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`[[ROTARIS:MCP_SECTION]]` must be replaced with a formatted bullet list of MCP servers; tool names and descriptions must come from the running MCP server's `tools/list` response, with disabled tools omitted. Servers whose tools cannot be listed render as a plain bullet.

## SWR-326 — Backward Compatibility
legacy-id: REQ-20260414-160000-008
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

Prompts without any `[[ROTARIS:...]]` tokens must pass through unchanged.

## SWR-327 — Unknown Token Handling
legacy-id: REQ-20260414-160000-009
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

Unknown tokens must be preserved in output with a warning logged, not silently removed.

## SWR-328 — All Prompts Converted
trace: optional
legacy-id: REQ-20260414-160000-010
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

All 8 shipped prompt `.md` files must use `[[ROTARIS:...]]` tokens instead of hardcoded names.

## SWR-329 — Factory Integration
legacy-id: REQ-20260414-160000-011
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`create_agent_for_persona()` must render templates before passing the system prompt to the SDK.

## SWR-330 — Registry Integration
legacy-id: REQ-20260414-160000-012
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

`PersonaRegistry.load_all()` must render templates for `AgentDefinition` registration.

## SWR-331 — No New Dependencies
trace: optional
test: optional
legacy-id: REQ-20260414-160000-013
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

Implementation must not introduce new package dependencies (e.g., no Jinja2).

## SWR-332 — Tool Hints Not Descriptions
legacy-id: REQ-20260414-160000-014
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

Tool hints in `TOOLS_SECTION` must be short behavioral one-liners, not full SDK parameter descriptions (those are provided via native function-calling).

## SWR-334 — Hard Blocks section in orchestrator prompt
legacy-id: REQ-OMO-PHASE1-001
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

The orchestrator prompt contains a Hard Blocks section rendered via `build_hard_blocks_section`.

## SWR-335 — Anti-Patterns section with examples
legacy-id: REQ-OMO-PHASE1-002
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

Persona prompts contain an Anti-Patterns section with examples rendered via `build_anti_patterns_section`.

## SWR-336 — Consolidated Communication Style section
trace: optional
legacy-id: REQ-OMO-PHASE1-003
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

Persona prompts contain a consolidated Communication Style section.

## SWR-337 — Variant infrastructure in `prompt_render`
legacy-id: REQ-OMO-PHASE2-001
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

`prompt_render` provides variant infrastructure for model-family prompt variants.

## SWR-338 — Orchestrator GPT/Claude/Gemini variants
legacy-id: REQ-OMO-PHASE2-002
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

The orchestrator prompt ships GPT/Claude/Gemini model-family variants.

## SWR-339 — `coding_agent` (backend-dev) variants
legacy-id: REQ-OMO-PHASE2-003
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

The coding-agent (backend-dev) prompt ships model-family variants.

## SWR-340 — Planner variants
legacy-id: REQ-OMO-PHASE2-004
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

The planner prompt ships model-family variants.

## SWR-341 — Variant selection from `LLM.model` family
legacy-id: REQ-OMO-PHASE2-005
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

The prompt variant is selected from the `LLM.model` model-family at agent construction.

## SWR-342 — `tool_restrictions` field on `PersonaConfig`
legacy-id: REQ-OMO-PHASE3-001
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

`PersonaConfig` exposes a `tool_restrictions` field.

## SWR-343 — Restrictions enforced in `agents/factory.py`
legacy-id: REQ-OMO-PHASE3-002
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

Tool restrictions are enforced during agent construction in `agents/factory.py`.

## SWR-344 — Oracle persona (read-only consultation)
legacy-id: REQ-OMO-PHASE3-003
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

A read-only consultation persona is available (formerly `oracle`; now `codebase-analyst`, with a legacy alias mapping `oracle` to `codebase-analyst`).

## SWR-346 — Default config wires both personas
legacy-id: REQ-OMO-PHASE3-005
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

The default configuration wires the read-only `codebase-analyst` persona (formerly `oracle`; `explore` is retired).

## SWR-347 — Documentation in AGENTS.md / examples
trace: optional
legacy-id: REQ-OMO-PHASE3-006
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

AGENTS.md and example configs document the consultation personas.

## SWR-348 — Token expansion (`[[ROTARIS:DELEGATES]]`, `[[ROTARIS:TOOLS]]`, etc.)
legacy-id: REQ-OMO-PHASE5-001
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

Prompt token expansion covers `[[ROTARIS:DELEGATES_SECTION]]`, `[[ROTARIS:TOOLS_SECTION]]`, and related tokens.

## SWR-349 — Variant + token rendering in single pipeline
legacy-id: REQ-OMO-PHASE5-002
date: 2026-04-16
source: docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md

Variant selection and token rendering run in a single rendering pipeline.

## SWR-350 — `purpose` Field on `PersonaConfig`
legacy-id: REQ-20260425-120000-001
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

Add an optional `purpose: str \ | None = None` field to `PersonaConfig`. It is a one-line description of what the persona does (e.g. `"Pre-planning analyst: identifies scope, risks, and ambiguities before planning."`).

## SWR-351 — Populate `purpose` for All Built-in Personas
legacy-id: REQ-20260425-120000-002
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

Set a non-empty `purpose` on every entry in `DEFAULT_PERSONAS` in `config/defaults.py`.

## SWR-352 — Surface `purpose` in `DELEGATES_SECTION`
legacy-id: REQ-20260425-120000-003
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

Update `_format_delegates_section` in `prompt_render.py` to accept the full list of `PersonaConfig` objects (not just names). When a persona has a `purpose`, render each bullet as `` `name` - <purpose> ``; when it is absent, fall back to the current `` `name` `` format.

## SWR-353 — Pass Config to Renderer
legacy-id: REQ-20260425-120000-004
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

Update `render_system_prompt` / `PromptRenderContext` and the call-sites in `agents/factory.py` so the renderer receives enough information to call the updated `_format_delegates_section`. The `delegates_to` list currently holds `str` names; it must be enriched (or a parallel list added) so the renderer can look up each delegate's `purpose`.

## SWR-354 — `AgentDefinition.description` Uses `purpose`
legacy-id: REQ-20260425-120000-005
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

In `registry.py`, use `persona.purpose` (when set) as the `description` field of `AgentDefinition` instead of the current `f"{persona.name} persona"` fallback.

## SWR-355 — Remove Hardcoded Agent-Name References in Orchestrator Prompt
trace: optional
legacy-id: REQ-20260425-120000-006
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

After the above plumbing is in place, revise `prompts/orchestrator.md` to remove inline persona names (e.g. `metis`, `explore`, `librarian`, `oracle`) from the Phase-Driven Execution Pipeline and Delegation Decision Rules sections. Replace them with role-based descriptions sourced from the dynamically rendered `[[ROTARIS:DELEGATES_SECTION]]`. A short reference section such as _"Refer to the Available Delegates section above to choose the right specialist by purpose."_ is sufficient.

## SWR-356 — YAML Config Support
legacy-id: REQ-20260425-120000-007
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

The `purpose` field must round-trip correctly through the YAML loader/merger. A user-defined purpose in `agents.yaml` must override the default.

## SWR-357 — Backward Compatibility
legacy-id: REQ-20260425-120000-NF-001
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

`purpose` is optional with a `None` default. Existing `agents.yaml` files that omit it must continue to work without change.

## SWR-358 — No New Heavy Imports
trace: optional
test: optional
legacy-id: REQ-20260425-NF-002
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

The `purpose` field and delegate-section changes must not introduce module-level imports in widely-imported files. Follow the lazy-import rule.

## SWR-361 — Relentless (autonomous-completion) mode
legacy-id: REQ-20260425-OPENCODE-ALIGNMEN-002
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-opencode-alignment.md

Add a runtime mode in which the Ralph loop continues iterating after the planned todo list is exhausted, until the user's *original* request is genuinely satisfied. Acceptance: - New `RuntimePolicy.relentless: bool` (default `False`) and `RuntimePolicy.relentless_max_cycles: int` (default `3`). - New `rotaris_core.ralph.fulfillment_validator.FulfillmentValidato

## SWR-362 — Mode rename to Relentless
legacy-id: REQ-20260425-OPENCODE-ALIGNMEN-003
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-opencode-alignment.md

Rename the autonomous-completion mode from "ultrawork" to "relentless" across runtime configuration, Ralph loop internals, test naming, and operator-facing prompt text. Acceptance: - Runtime config fields renamed to `relentless` and `relentless_max_cycles`. - Ralph loop internals renamed to `relentless` terminology in method names, counters, log messages, an

## SWR-364 — Built-in Persona Config
legacy-id: REQ-20260503-REQENG-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md

`DEFAULT_PERSONAS` shall include `requirements-engineer` with a clear purpose, prompt file, requirement-log editing tools, and bounded delegation to read-only/reference specialists.

## SWR-365 — Requirements Engineer Prompt
legacy-id: REQ-20260503-REQENG-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md

The prompt shall define request classifications, workflow, hard blocks, status guidance, traceability rules, and output formats for requirement discovery, creation, update, and acceptance-criteria review.

## SWR-366 — Orchestrator Routing
trace: optional
legacy-id: REQ-20260503-REQENG-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md

The orchestrator prompt shall instruct delegation to the requirements specialist for broad goals, ambiguous scope, acceptance criteria, traceability, and requirement-log updates.

## SWR-367 — Planner Routing
trace: optional
legacy-id: REQ-20260503-REQENG-004
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md

The planner prompt shall consult the requirements specialist for requirement-log discovery, acceptance-criteria review, and traceability gaps before finalizing plans.

## SWR-368 — Context Propagation
legacy-id: REQ-20260503-REQENG-005
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md

Requirement-engineer outputs shall be treated as analysis/research context so downstream implementation agents receive full requirement findings through inherited context.

## SWR-369 — Prompt/Tool Alignment
trace: optional
legacy-id: REQ-20260503-REQENG-NF-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md

The prompt shall only instruct actions supported by the configured tools and shall forbid production-source edits.

## SWR-372 — Built-in Persona Config
legacy-id: REQ-20260528-UV-001
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

`DEFAULT_PERSONAS` shall include `ui-verifier` with a clear purpose, a dedicated prompt file, Playwright MCP, read-only code inspection tools, and no delegation targets (leaf node).

## SWR-373 — UI Verifier Prompt
trace: optional
legacy-id: REQ-20260528-UV-002
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

The prompt shall define: (a) the persona's single-purpose mandate - drive a browser to verify UI paths and report findings; (b) a request classification schema covering at minimum flow verification, regression check, visual assertion, and accessibility smoke-test; (c) a structured verification protocol (understand what to verify → navigate → assert → capture evidence → report); (d) a mandatory PASS / GAPS output format with URL, screenshot references, and specific failure descriptions; (e) hard blocks against code editing, test writing, Git operations, and delegation.

## SWR-374 — Orchestrator Routing
legacy-id: REQ-20260528-UV-003
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

The orchestrator's `delegates_to` list shall include `ui-verifier` so the orchestrator can route UI verification tasks to it.

## SWR-375 — Coding-Agent Routing
legacy-id: REQ-20260528-UV-004
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

The coding agent's `delegates_to` list shall include `ui-verifier` so coding agents can directly delegate UI path verification during development.

## SWR-376 — Tester Routing
legacy-id: REQ-20260528-UV-005
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: Medium

The tester persona's `delegates_to` list shall include `ui-verifier` so testers can delegate browser-interaction verification as part of broader test campaigns.

## SWR-377 — Headless Default
legacy-id: REQ-20260528-UV-006
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

The persona shall use Playwright MCP in headless mode by default (inherited from the existing MCP server config). The prompt shall document that headed mode requires user configuration of the MCP server args.

## SWR-378 — Structured Output Contract
trace: optional
legacy-id: REQ-20260528-UV-007
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

Every verification response shall include: (a) overall verdict (PASS / PARTIAL / FAIL); (b) a checklist mapping each requested verification point to PASS/GAPS/NOT_TESTED with a brief rationale; (c) references to captured screenshots or DOM snapshots taken during the session; (d) any blocked or unreachable paths with the specific obstacle encountered.

## SWR-379 — Read-Only Boundary
legacy-id: REQ-20260528-UV-008
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

The persona shall have no file-write, shell-exec, Git, or delegation tools - it is strictly a read-only observer that can only read code for context and drive the browser for verification. It must not modify the workspace.

## SWR-380 — FR-PLAYWRIGHT-003 Realisation
legacy-id: REQ-20260528-UV-009
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: Medium

The `ui-verifier` persona shall be the primary implementation vehicle for FR-PLAYWRIGHT-003 (local app verification, browser inspection, interaction testing). That requirement's status shall be updated to reflect this.

## SWR-381 — Prompt/Tool Alignment
trace: optional
legacy-id: REQ-20260528-UV-NF-001
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

The prompt shall only instruct actions supported by the configured tools (Playwright MCP browser actions, `haet_read`, `grep`, `glob`, `find`, `artifact_read`, `artifact_list`).

## SWR-384 — No Overlap with Tester
trace: optional
legacy-id: REQ-20260528-UV-NF-004
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

The prompt shall explicitly distinguish the `ui-verifier` from the `tester` persona: the tester writes and maintains test suites; the ui-verifier drives a browser to verify UI paths interactively and reports findings without writing test code.

## SWR-385 — No Overlap with Verifier
trace: optional
legacy-id: REQ-20260528-UV-NF-005
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: Medium

The prompt shall explicitly distinguish the `ui-verifier` from the `verifier` persona: the verifier validates code changes against requirements and runs static analysis; the ui-verifier verifies runtime UI behaviour in a browser.

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.

## SWR-2416 — Persona × intent × model-tier prompt composition

Spec file: [SWR-2416](300-personas-prompts/SWR-2416-prompt-composition-matrix.md) ·
design: [prompt-composition-matrix.md](../architecture/prompt-composition-matrix.md)

Generalizes the tier-aware delegation guidance of
[SWR-386](300-personas-prompts/SWR-386-tier-aware-coding-delegation.md) into a full
persona × intent × model-tier matrix that decides which prompt sections are injected for
every persona, not just the orchestrator. Implemented via `agents/playbook.py` plus the
`agents/prompts/playbooks/` data files, rendered through the `[[ROTARIS:PLAYBOOK]]` token.
`[[ROTARIS:INTENT_INSTRUCTIONS]]` is retained as an orchestrator-only alias during migration
and is scheduled for retirement once the intent snippets are folded into `ROUTE`/`RESEARCH`
variants.
