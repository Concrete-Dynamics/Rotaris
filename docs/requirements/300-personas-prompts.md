---
req-id: [SWR-300, SWR-301, SWR-302, SWR-303, SWR-304, SWR-305, SWR-306, SWR-308, SWR-309, SWR-310, SWR-311, SWR-313, SWR-314, SWR-315, SWR-316, SWR-317, SWR-318, SWR-319, SWR-320, SWR-321, SWR-322, SWR-323, SWR-324, SWR-325, SWR-326, SWR-327, SWR-328, SWR-329, SWR-330, SWR-331, SWR-332, SWR-333, SWR-334, SWR-335, SWR-336, SWR-337, SWR-338, SWR-339, SWR-340, SWR-341, SWR-342, SWR-343, SWR-344, SWR-346, SWR-347, SWR-348, SWR-349, SWR-350, SWR-351, SWR-352, SWR-353, SWR-354, SWR-355, SWR-356, SWR-357, SWR-358, SWR-359, SWR-361, SWR-362, SWR-364, SWR-365, SWR-366, SWR-367, SWR-368, SWR-369, SWR-370, SWR-372, SWR-373, SWR-374, SWR-375, SWR-376, SWR-377, SWR-378, SWR-379, SWR-380, SWR-381, SWR-382, SWR-384, SWR-385]
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

## SWR-333 — Test Coverage
trace: optional
legacy-id: REQ-20260414-160000-015
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-160000.md

Unit tests must cover all token types, edge cases (empty lists, no tokens, unknown tokens, partial tokens).

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

## SWR-359 — Tests
trace: optional
legacy-id: REQ-20260425-120000-NF-003
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-120000.md

Add unit tests for the updated `_format_delegates_section` covering: (a) delegates with purposes, (b) delegates without purposes (fallback), (c) empty delegate list. Update any existing snapshot or assertion tests that check the rendered delegates section.

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

## SWR-370 — Regression Coverage
trace: optional
legacy-id: REQ-20260503-REQENG-NF-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md

Unit tests shall cover default registration, delegation wiring, prompt loading, prompt guardrails, active routing text, and research-context propagation.

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

## SWR-382 — Regression Coverage
trace: optional
legacy-id: REQ-20260528-UV-NF-002
date: 2026-05-28
source: docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md
priority: High

Unit tests shall cover: default registration in `DEFAULT_PERSONAS`, delegation wiring in orchestrator/coding-agent/tester `delegates_to` lists, prompt loading and guardrail validation, and the structured output contract.

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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Role-Based Agent Personas and LLM Configuration (2026-04-13)

Original: `docs/requirement-log/done/requirements-20260413-000002-personas-and-config.md` — document status: Done - implemented requirements are complete and provider/model data-layer items superseded by newer provider-registry requirements.

#### Description

Agents are declared as role-based personas in YAML configuration. Each persona carries a system prompt, a specific toolset, a model assignment, and optional skill files. A layered configuration architecture allows global defaults to be overridden per workspace. For the ordinary startup UX, tier slots such as `small_model`, `medium_model`, and `large_model` act as the primary saved model-selection surface; personas may still override those defaults with explicit model references.

#### Implementation Notes

**Requirements - Personas & LLM Configuration:**

**Migrated From:** `REQUIREMENTS.md` FR-2, FR-5, Configuration Architecture (dissolved 2026-05-03) **Note (2026-05-11):** FR-5-002 (`models.yml` as the startup model registry) and FR-5-007 (inline API keys in `models.yml`) are superseded for the provider/model-data layer by [`requirements-20260511-model-provider-registry.md`](requirements-20260511-model-provider-registry.md). That document establishes `ProjectModelStore` as the single source of truth for provider registration, model discovery, stable identifiers, and project-snapshot persistence. `models.yml` remains optional only for advanced static custom-provider authoring; inline API keys are now forbidden in project files. All other FR-5 requirements, FR-2 (personas), and the Configuration Architecture section remain valid. > **Cross-references:** > > - Startup model defaults editor and persistent persona override UX: > `requirements-20260511-startup-model-defaults.md` - takes priority for the tier-first > startup-model editing flow, saved `agents.yaml` defaults, and the distinction between > persistent startup settings and temporary runtime model overrides. > - Specialist prompt contracts (role identity, model-family variants, planner interview mode): > `requirements-20260413-201248.md` REQ-006 through REQ-008 - those take priority. > - OMO-style prompt adaptation (phase-driven orchestrator, specialist templates): > `requirements-20260416-omo-prompt-adaptation.md` - supersedes prompt authoring guidance. > - Dynamic system prompt templates (`[[ROTARIS:TOKEN]]`): > `requirements-20260414-160000.md` - supersedes any static prompt approach. > - Agent persona purpose field and delegate section: > `requirements-20260425-120000.md` - extends the persona config schema. > - Architect-owned architecture documentation and canonical architecture-doc layout: > `requirements-20260509-120000.md` - takes priority for architecture documentation > ownership, location, and architect/docs-writer responsibility boundaries. > - Runtime provider model selection (Copilot/Codex live catalog): > `requirements-20260503-123000.md` - takes priority over FR-5 runtime override notes. > - Authentication (Copilot Device Flow, Codex PKCE): > `requirements-20260418-143500.md` - takes priority over auth-related config notes. > - Fast provider onboarding and minimal startup config: > `requirements-20260511-000003.md` - takes priority over the `models.yml`-centric quickstart assumptions in FR-5 and over the conceptual startup examples below. > - Config wiring hardening (merge logic, researcher override): > `requirements-20260414-155438.md` - takes priority over loader behavior described here. > - Field-wise overlay semantics: > `requirements-20260413-201248.md` REQ-025 - takes priority over merge description here.

**FR-2: Role-Based Agent Personas:**

**FR-5: LLM Configuration:**

**Configuration Architecture:**

**Configuration File Structure (conceptual):**

`agents.yaml`:

```yaml
default_persona: orchestrator
default_summary_model: gpt-4o-mini
personas:
orchestrator:
model: gpt-4o
summary_model: gpt-4o-mini
system_prompt: |
You are the lead engineer. Decompose tasks and delegate to specialists.
tools: [delegate, filesystem, shell, todo, fetch]
delegates_to: [architect, backend-dev, tester]
architect:
model: claude-3-7-sonnet
summary_model: gpt-4o-mini
system_prompt_file: prompts/architect.md
tools: [delegate, filesystem, lsp, shell, fetch]
mcp_servers: [memory-mcp, playwright]
backend-dev:
model: claude-3-7-sonnet
summary_model: gpt-4o-mini
tools: [delegate, filesystem, shell, haet, lsp, todo]
custom_tools:
- tools/db_schema_tool.py
```

`models.yml`:

```yaml
models:
gpt-4o:
provider: openai
model_id: gpt-4o
api_key_env: OPENAI_API_KEY
claude-3-7-sonnet:
provider: anthropic
model_id: claude-3-7-sonnet-20250219
api_key_env: ANTHROPIC_API_KEY

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to the document status above.

### Dynamic System Prompt Templates (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-160000.md` — document status: Complete

#### Description

System prompt files previously hardcoded tool names, persona names, and delegate lists. This feature introduces a `[[ROTARIS:TOKEN]]` template system that dynamically injects tool names, behavioral hints, delegate personas, and MCP server names into agent system prompts at render time. Prompts auto-adapt when tools or delegates change in config, eliminating manual prompt maintenance.

#### Implementation Notes

**Requirements Document:**

**Implementation Notes:**

- New module: `src/rotaris_core/agents/prompt_render.py` - `PromptRenderContext` dataclass + `render_system_prompt()` function

- MCP tool metadata is discovered at prompt-render time via `src/rotaris_core/config/mcp_tool_discovery.py`, which starts/connects to each active server, calls `tools/list`, caches the response per server config, and filters `disabled_tools`.

- 19 unit tests in `tests/unit/test_prompt_render.py`

- `_render_prompt()` helper added to `factory.py`, wired into both `create_agent_for_persona()` and `registry.load_all()`

- All 8 prompt files converted: orchestrator, architect, backend_dev, tester, docs_writer, refactorer, planner, librarian

- 2026-05-27: Added `[[ROTARIS:MCP_SECTION]]` to the remaining shipped prompts that declare MCP servers but previously only rendered `[[ROTARIS:TOOLS_SECTION]]` (`orchestrator`, `planner`, `requirements-engineer`, `librarian`, `docs-writer`, `oracle`), plus regression coverage to keep prompt-visible MCP capabilities aligned with persona config.

- 2026-07-22: Added a `git` entry to `DEFAULT_MCP_SERVERS` (`cyanheads/git-mcp-server`, curated to its read-only tools — `git_status`, `git_diff`, `git_log`, `git_show`, `git_blame`, `git_reflog`, `git_changelog_analyze` — via `disabled_tools`, mirroring the existing `lsp` curation pattern) and granted it to `codebase-analyst`'s `mcp_servers`, giving the read-only analyst native git-history tooling alongside `grep`/`glob`/`read_file`.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### 2026-04-16 OMO Prompt Adaptation (Phases 1-5) (2026-04-16)

Original: `docs/requirement-log/done/requirements-20260416-omo-prompt-adaptation.md` — document status: Complete (all five phases delivered)

#### Description

Historical requirement entry normalized from the requirement log.

#### Implementation Notes

**Requirement Log - 2026-04-16 OMO Prompt Adaptation (Phases 1-5):**

> Distinct from `requirements-20260416-120000.md` (delegation runtime overhaul). > This log covers prompt-level OMO pattern adaptation: persona prompts, tool > restrictions, model-specific variants, specialised personas, and dynamic > prompt rendering.

**Phase 1 - Hard Blocks & Anti-Patterns (Orchestrator Prompt):**

**Touched:** `src/rotaris_core/agents/prompts/orchestrator.md` (10 hard blocks, 9 anti-patterns).

**Phase 2 - Model-Specific Persona Variants:**

**Touched:** `src/rotaris_core/agents/prompt_render.py`, prompt fragments under `src/rotaris_core/agents/prompts/variants/`.

**Phase 3 - Tool Restrictions & Read-Only Specialists:**

**Touched:** `src/rotaris_core/agents/factory.py`, `config/schema.py`, `agents/prompts/oracle.md`, retired `agents/prompts/explore.md`, `config/defaults.py`, `agents/prompts/orchestrator.md`, `agents/prompts/planner.md`.

**Phase 4 - Specialised Personas:**

Task | Output | Status 4.1 Momus (plan reviewer) | `agents/prompts/momus.md` | Removed - retired from defaults on 2026-05-03 because it did not contribute enough value 4.2 Metis (pre-planning analyst) | `agents/prompts/metis.md` | Removed - retired from defaults on 2026-05-03 because it did not contribute enough value 4.3 Librarian enhancements | doc-recon protocol | Complete 4.4 Planner enhancements | execution plan template | Complete

**Phase 5 - Dynamic Prompt Generation:**

**Touched:** `src/rotaris_core/agents/prompt_render.py`, `src/rotaris_core/agents/factory.py`.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete (all five phases delivered)`.

### Agent Persona Purpose Field & Delegate Section Enhancement (2026-04-25)

Original: `docs/requirement-log/done/requirements-20260425-120000.md` — document status: Complete

#### Description

Each persona should carry a short, human-readable `purpose` string that describes what the agent does and why it exists. This purpose must be surfaced in the rendered `[[ROTARIS:DELEGATES_SECTION]]` so delegating agents see `agent name + purpose` instead of bare names. With this in place, orchestrator/planner prompts can drop hard-coded agent names (e.g. `metis`, `explore`) and refer to agents by their functional role, keeping prompts robust to persona renames and easier to reason about.

#### Implementation Notes

**Requirements Document:**

#### Acceptance Criteria

**Constraints:**

- `purpose` must be a single line (no newlines). Enforced via Pydantic field validator or documented convention.

- The `DELEGATES_SECTION` format must remain valid Markdown (bullet list).

- No changes to the token name `[[ROTARIS:DELEGATES_SECTION]]` - only its rendered content changes.

- Do not rename existing personas or change `delegates_to` lists as part of this requirement.

**Acceptance Criteria:**

1. `PersonaConfig` has a `purpose` field (optional `str | None`).

2. All 12 built-in personas have a non-empty `purpose` string.

3. `[[ROTARIS:DELEGATES_SECTION]]` renders as `` `name` - <purpose> `` for any delegate that has a purpose set.

4. `prompts/orchestrator.md` no longer hard-codes specific agent names in its execution pipeline narrative (names may still appear in examples if clearly labelled).

5. `AgentDefinition.description` reflects `purpose` when available.

6. All existing tests pass; new tests for `_format_delegates_section` with purpose data are green.

7. `purpose` field round-trips through YAML (load → merge → dump) without loss.

### Align Agent Prompts with OpenCode Strengths + Relentless Mode (2026-04-25)

Original: `docs/requirement-log/done/requirements-20260425-opencode-alignment.md` — document status: Complete

#### Description

Bring Rotaris's persona prompts closer to the strongest patterns from OhMyOpenCode (Sisyphus, Oracle, Prometheus, Metis, Momus) while preserving Rotaris's own framework - placeholder rendering (`[[ROTARIS:…]]`), todo / delegate / haet tooling, LSP integration, and the persona registry. Add a "relentless" mode to the Ralph loop so it iterates autonomously until the user's request is fully fulfilled, mirroring OhMyOpenCode's autonomous completion behaviour.

#### Implementation Notes

**Requirements - Align Agent Prompts with OpenCode Strengths + Relentless Mode:**

**R1 - Persona prompt upgrades - **Complete**:**

Refresh the following persona prompts with the strongest OpenCode patterns while keeping Rotaris's tool wiring and placeholders intact:

- **orchestrator** - added Sisyphus parallel-execution defaults, inherited-context

discipline, 3-failure recovery protocol (stop / oracle escalate / user return), and an explicit Completion Gate ("Relentless") that requires re-checking the original request before declaring done.

- **oracle** - full rewrite: pragmatic-minimalism Decision Framework, Output

Verbosity Spec (Bottom line / Action plan / Effort estimate), tiered Essential / Expanded / Edge cases response structure with Quick / Short / Medium / Large effort tags.

- **planner** (Prometheus) - full rewrite: mandatory Intent Classification,

parallel research phase, focused interview with Self-Clearance Checklist and Auto-Transition Triggers, Gap Classification, full plan template with parallel execution waves and executable QA scenarios, AI-slop self-review, capped 3-cycle review loop. The former momus review delegate was retired on 2026-05-03 because it did not contribute enough value.

- **metis** - full rewrite: Phase 0 Intent Classification (Refactoring / Build /

Mid-sized / Collaborative / Architecture / Research) with per-intent directives, AI-slop pattern catalogue, mandatory Zero-User-Intervention QA / acceptance-criteria directives. Retired on 2026-05-03.

- **momus** - full rewrite as a "blocker-finder, not perfectionist" reviewer:

default to OKAY, REJECT only on real blockers, max 3 issues, explicit list of what NOT to check. Retired on 2026-05-03. Files touched:

- `src/rotaris_core/agents/prompts/orchestrator.md`

- `src/rotaris_core/agents/prompts/oracle.md`

- `src/rotaris_core/agents/prompts/planner.md`

- `src/rotaris_core/agents/prompts/metis.md` (removed 2026-05-03)

- `src/rotaris_core/agents/prompts/momus.md` (removed 2026-05-03)

Notes: explore, librarian, architect, refactorer, tester, docs_writer, coding_agent already reflected the OpenCode patterns adequately and were left unchanged.

**R2 - Relentless (autonomous-completion) mode - **Complete**:**

Add a runtime mode in which the Ralph loop continues iterating after the planned todo list is exhausted, until the user's *original* request is genuinely satisfied. Acceptance:

- New `RuntimePolicy.relentless: bool` (default `False`) and

`RuntimePolicy.relentless_max_cycles: int` (default `3`).

- New `rotaris_core.ralph.fulfillment_validator.FulfillmentValidator` -

LLM-backed audit that compares the original user request against the cumulative iteration summaries and returns `FulfillmentResult(fulfilled, reason, gaps)`.

- `RalphLoop.run` now captures the original user request from the first

task in the first phase before any orchestrator-driven mutations.

- When all natural stop conditions are met (`all tasks completed` /

`no pending tasks`) and relentless mode is enabled, the loop runs the fulfillment validator. If `fulfilled == False`, a remediation `TodoPhase` is appended containing a single task with the original request, the audit reason, and the enumerated gaps. The loop continues.

- Hard cap at `relentless_max_cycles` to prevent infinite loops on

intractable requests.

- Validator failures and timeouts are treated as `fulfilled=True` to

avoid trapping the loop on transient LLM errors.

- User-requested stops, time limits, iteration limits, escalations, and

abort signals all bypass relentless mode. Files touched:

- `src/rotaris_core/config/schema.py`

- `src/rotaris_core/ralph/loop.py`

- `src/rotaris_core/ralph/fulfillment_validator.py` (new)

- `tests/unit/test_ralph_relentless.py` (new - 8 tests, all passing)

**R2.1 - Mode rename to Relentless - **Complete**:**

Rename the autonomous-completion mode from "ultrawork" to "relentless" across runtime configuration, Ralph loop internals, test naming, and operator-facing prompt text. Acceptance:

- Runtime config fields renamed to `relentless` and

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Requirements Engineer Persona (2026-05-03)

Original: `docs/requirement-log/done/requirements-20260503-requirements-engineer-persona.md` — document status: Complete

#### Description

Add a built-in `requirements-engineer` persona that can be delegated to by the orchestrator and planner whenever requirements, acceptance criteria, traceability, or requirement-log status must be defined or updated. The persona must have a strong, bounded prompt, must be wired into default delegation, and must preserve the project requirement-log workflow.

#### Implementation Notes

**Requirements Document:**

requirement shaping, acceptance criteria, traceability, and requirement-log status hygiene.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Rotaris - UI Verifier Persona (Playwright) (2026-05-28)

Original: `docs/requirement-log/done/requirements-20260528-ui-verifier-persona.md` — document status: Complete

#### Description

Add a built-in `ui-verifier` persona - a leaf-node specialist that coding agents can delegate to for verifying UI paths and functionality using Playwright during development. The persona drives a real browser (headless by default), navigates application flows, asserts visual and behavioural correctness, and returns a structured PASS / GAPS report with screenshot evidence. It is strictly read-only and does not modify code, write tests, or mutate the workspace.

**Problem being solved:**

Coding agents currently lack a dedicated delegate for browser-based UI verification. The existing `tester` persona writes and runs automated test suites but is focused on code-level testing (pytest, lint, typecheck), and the `verifier` persona validates completed work against requirements but only via static analysis and test execution - neither drives a browser to verify UI paths interactively. A coding agent implementing a frontend change needs a fast, focused way to say "verify that the login flow still works" or "check that the new settings dialog renders correctly and all buttons are reachable" without context-switching to test authoring or leaving the delegation model.

**Current behaviour:**

- `tester` persona has `playwright` MCP in its config but its prompt is oriented

around test-suite writing, not interactive UI path verification.

- `verifier` persona is read-only but lacks Playwright MCP and is focused on

requirement-to-code traceability, not browser interaction.

- `librarian` has `playwright` MCP but uses it for web research / doc scraping,

not structured UI verification.

- `coding-agent` delegates to `tester`, `librarian`, and `codebase-analyst` - none

of whom can verify UI paths in a running browser.

- Playwright MCP (`@playwright/mcp@latest --headless`) is already defined as a

default MCP server and the infrastructure to wire it to personas exists.

**What needs to change:**

1. A new `ui-verifier` persona config in `DEFAULT_PERSONAS` with Playwright MCP as

its primary tool.

2. A focused system prompt (`prompts/ui_verifier.md`) defining request

classification, verification protocol, output format, and hard boundaries.

3. Wiring into the orchestrator's and coding agent's `delegates_to` lists so it is

discoverable and delegatable.

4. Existing FR-PLAYWRIGHT-003 (Intended Use: local app verification, browser

inspection, interaction testing) updated to reflect this persona as the primary vehicle for that use case.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: Playwright MCP server config in `DEFAULT_MCP_SERVERS` (already exists - `@playwright/mcp@latest --headless`)

- Depends on: Delegation infrastructure (`delegate_tool.py`, `child_manager.py`) - already mature

- Depends on: `requirements-20260413-000003-tools.md` FR-PLAYWRIGHT-001 through FR-PLAYWRIGHT-004 (partial implementation of Playwright integration)

- Blocks: None

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution FR-PLAYWRIGHT-003 (Intended Use: "local app verification, browser inspection, and interaction testing") | No dedicated persona existed to fulfil this use case; tester had Playwright but was focused on test-suite authoring. | The `ui-verifier` persona is the dedicated vehicle for FR-PLAYWRIGHT-003. The tester retains Playwright MCP for test-authoring workflows that need browser context. Both coexist without conflict.

**Notes:**

- **Name choice**: `ui-verifier` was chosen over `playwright-verifier` to keep the name tool-agnostic (a future migration to a different browser-automation backend should not force a rename) and over `browser-agent` to stay consistent with the existing `verifier` naming convention.

- **Leaf node**: The persona has no `delegates_to` entries. UI verification is a terminal task - when a coding agent delegates "verify the login flow," the ui-verifier does the work and returns a report. No further decomposition is needed.

- **Not a test author**: The persona explicitly must NOT write test files. If the coding agent wants Playwright tests added to the repo, it should delegate to the `tester` persona. The `ui-verifier` is for ad-hoc verification during development, not for producing permanent test artifacts.

- **Screenshots**: The `@playwright/mcp` package supports `browser_take_screenshot`. The prompt should instruct the persona to capture screenshots at key assertion points and reference them in the report.

- **Out of scope for v1**: visual regression testing (pixel-diff), performance/lighthouse auditing, multi-browser matrix testing, mobile viewport emulation beyond what Playwright MCP supports natively, and accessibility audits beyond basic DOM checks.

- **Persona alias**: Consider adding `"playwright"` → `"ui-verifier"` to `_PERSONA_ALIASES` in `delegate_tool.py` for ergonomic delegation. This is a nice-to-have, not a hard requirement - the full name `ui-verifier` is already clear.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] `ui-verifier` appears in `DEFAULT_PERSONAS` with Playwright MCP, read-only tools, and empty `delegates_to`.

- [x] `prompts/ui_verifier.md` exists with a clear single-purpose mandate, request classification, verification protocol, PASS/GAPS output format, and hard blocks.

- [x] Orchestrator's `delegates_to` includes `"ui-verifier"`.

- [x] Coding agent's `delegates_to` includes `"ui-verifier"`.

- [x] Tester's `delegates_to` includes `"ui-verifier"`.

- [x] Unit test verifies that `ui-verifier` is registered and its config has the expected tools, MCP servers, and delegation targets.

- [x] Unit test verifies that the prompt file loads without errors and contains mandatory sections (mandate, classification, protocol, output format, hard blocks).

- [x] Unit test verifies that orchestrator, coding-agent, and tester `delegates_to` lists all contain `"ui-verifier"`.

- [x] `make lint` and `make typecheck` pass after the change.

- [x] FR-PLAYWRIGHT-003 status is updated in `requirements-20260413-000003-tools.md`.

- [x] `pyproject.toml` version is bumped.

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
