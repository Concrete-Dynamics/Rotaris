---
req-id: [SWR-1800, SWR-1801, SWR-1802, SWR-1803, SWR-1804, SWR-1805, SWR-1806, SWR-1807, SWR-1808, SWR-1809, SWR-1810, SWR-1811, SWR-1812, SWR-1813, SWR-1814, SWR-1815, SWR-1816, SWR-1817, SWR-1818, SWR-1819, SWR-1820, SWR-1821, SWR-1822, SWR-1823, SWR-1824, SWR-1825, SWR-1826]
status: approved
trace: optional
test: required
title: "CLI & Headless Mode"
---

# 1800-cli-headless spec

## Requirements

Requirements added to this epic after the 2026-07-18 migration live one file per
requirement in [1800-cli-headless/](1800-cli-headless/); SWR-1800–SWR-1826 are
declared in the sections below.

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| [SWR-1827](1800-cli-headless/SWR-1827-cli-config-error-presentation.md) | CLI configuration-load error presentation | — | approved |
| [SWR-1828](1800-cli-headless/SWR-1828-json-event-stream.md) | Structured JSON event stream for headless runs | P0 | approved |
| [SWR-1829](1800-cli-headless/SWR-1829-event-schema.md) | Versioned event schema & coverage | P0 | approved |
| [SWR-1830](1800-cli-headless/SWR-1830-python-sdk.md) | Python SDK entry point over the same runtime | P1 | approved |
| [SWR-1831](1800-cli-headless/SWR-1831-p1-feature-events.md) | Event coverage for hooks, checkpoints, gate decisions and approval requests | P1 | draft |
| [SWR-1832](1800-cli-headless/SWR-1832-p1-feature-event-emission.md) | Emission of the P1-feature events, and the terminal event on the bus | P1 | draft |

## SWR-1800 — CLI & Headless Mode
test: optional

Command-line entry points: headless background mode, prompt/tool improvement commands, and --help.

Derived requirements: [SWR-1827 — CLI configuration-load error presentation](1800-cli-headless/SWR-1827-cli-config-error-presentation.md)

## SWR-1801 — Orchestrator Agent: Phase-Driven Execution
legacy-id: REQ-20260413-201248-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The orchestrator agent's system prompt must define a structured, numbered execution pipeline: (0) Intent classification, (1) Codebase/context assessment, (2A) Parallel exploration, (2B) Implementation, (2C) Failure recovery, (3) Completion and verification. Each phase must specify entry conditions and expected outputs. | **Complete** - `agents/prompts/orchestrator.md` rewritten with phases 0-3

## SWR-1802 — Orchestrator Agent: Intent Classification Gate
legacy-id: REQ-20260413-201248-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The orchestrator's system prompt must include an explicit intent-classification step before any action. The prompt must enumerate at least these intent classes with decision branches: Trivial (single-file, known location → direct tool use), Explicit (specific file/line, clear command → execute directly), Exploratory ("find", "how does" → fire research agents), Open-ended ("improve", "refactor" → assess codebase first), Ambiguous (unclear scope → ask exactly one clarifying question). | **Complete** - Phase 0 intent gate with 5 classes in `orchestrator.md`

## SWR-1803 — Orchestrator Agent: Todo-Driven Workflow
legacy-id: REQ-20260413-201248-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The orchestrator's system prompt must instruct the agent to create a todo list before starting any non-trivial task, marking each item as pending/in-progress/done. The prompt must state that the agent must not begin implementation before todos exist for multi-step tasks. | **Complete** - Todo-driven workflow section in `orchestrator.md`

## SWR-1804 — Orchestrator Agent: Delegation Decision Rules
legacy-id: REQ-20260413-201248-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The orchestrator's system prompt must contain explicit rules for when to delegate versus execute directly. Rules must cover: (1) always delegate tasks that match a specialist role, (2) use category-based routing (by task type, not model name), (3) execute directly only when the task is trivially simple. | **Complete** - Delegation rules in Phase 2B of `orchestrator.md`

## SWR-1805 — Orchestrator Agent: Communication Style Rules
legacy-id: REQ-20260413-201248-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The orchestrator's system prompt must include a communication style section defining: no unsolicited status updates mid-task, no flattery or filler phrases, concise final responses, direct pushback when user assumptions are incorrect. | **Complete** - Communication style section in `orchestrator.md`

## SWR-1806 — Specialist Agent Prompts: Role Identity and Boundaries
legacy-id: REQ-20260413-201248-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

Each specialist agent template (e.g., planner, executor, researcher, reviewer) must have a system prompt that explicitly states: the agent's single purpose, which actions it is permitted to take, which actions are out of scope, and the expected output format. | **Complete** - `architect.md`, `backend_dev.md`, `tester.md`, `docs_writer.md`, `refactorer.md` all rewritten

## SWR-1807 — Specialist Agent Prompts: Model-Family Awareness
legacy-id: REQ-20260413-201248-007
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

Agent system prompt templates that are used with multiple model families (e.g., Claude-family vs. GPT-family) must include model-family-specific behavioral guidance. The template mechanism must support a variant section that is conditionally injected based on the resolved model at runtime. | **Complete** - `model_family_variants` field in `PersonaConfig`, `_inject_model_family_variant()` in `factory.py`

## SWR-1808 — Planner Agent: Interview-Mode Protocol
legacy-id: REQ-20260413-201248-008
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The planner agent's system prompt must specify an interview-mode protocol: the agent asks clarifying questions to identify full scope, never writes implementation code, and produces a structured plan document (task breakdown, file paths affected, open questions) as its sole output. | **Complete** - `agents/prompts/planner.md` created, planner persona in `defaults.py`

## SWR-1809 — Delegation Tool: Structured Prompt Schema
legacy-id: REQ-20260413-201248-009
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The delegation tool's description must specify that callers must structure the `prompt` parameter using the following labeled sections: `TASK` (what to do), `EXPECTED OUTCOME` (verifiable result), `REQUIRED TOOLS` (which tools the subagent needs), `MUST DO` (mandatory constraints), `MUST NOT DO` (explicit prohibitions), `CONTEXT` (relevant file paths, patterns, architectural notes). | **Complete** - `_DELEGATE_TOOL_DESCRIPTION` in `delegate_tool.py`

## SWR-1810 — Delegation Tool: Category-Based Routing
legacy-id: REQ-20260413-201248-010
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The delegation tool's description must document a category parameter that routes to the right agent configuration by task type, not by model name. Minimum categories to document: `quick` (trivial fixes), `deep` (thorough autonomous execution), `planning` (scope and plan only), `research` (information gathering). The description must explicitly warn against passing a model name where a category is expected. | **Complete** - Category routing docs in `_DELEGATE_TOOL_DESCRIPTION`

## SWR-1811 — Delegation Tool: Session Continuity
legacy-id: REQ-20260413-201248-011
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The delegation tool's description must document a `session_id` parameter. The description must state that when following up on a previous delegation (retry, continuation, or clarification), callers must pass the original `session_id` instead of opening a new session, in order to preserve full context and reduce token consumption. | **Complete** - Session continuity docs in `_DELEGATE_TOOL_DESCRIPTION`

## SWR-1812 — Delegation Tool: Background Execution Mode
legacy-id: REQ-20260413-201248-012
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The delegation tool's description must document a `run_in_background` flag. The description must state when background mode is appropriate (parallel, independent sub-queries with 3+ concurrent tasks) versus when it must not be used (sequential tasks where each depends on the prior result). | **Complete** - Background mode docs in `_DELEGATE_TOOL_DESCRIPTION`

## SWR-1813 — Delegation Tool: Mandatory Parameter Callouts
legacy-id: REQ-20260413-201248-013
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The delegation tool's description must list every required parameter, mark them explicitly as required, and provide a one-line example value for each. Parameters where a common mistake exists (e.g., passing `[]` explicitly for an optional list) must include a callout note. | **Complete** - Mandatory params with examples in `_DELEGATE_TOOL_DESCRIPTION`

## SWR-1814 — File Edit Tool: Hash-Anchored Line Identification
trace: required
legacy-id: REQ-20260413-201248-014
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The file-edit tool's description must document that line references use content-hash anchors (format: `LINE_NUMBER:HASH`), not raw line numbers alone. The description must explain that the hash is returned with file-read output and must be passed back unmodified. It must state that a hash mismatch causes the edit to be rejected before any file is modified. ◆1 | **Complete** - `_HAET_EDIT_DESCRIPTION` in `haet/tool.py` documents anchor format

## SWR-1815 — File Edit Tool: Rejection-Before-Corruption Semantics
trace: required
legacy-id: REQ-20260413-201248-015
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The file-edit tool's description must state that any edit where the anchor hash does not match the current file content is rejected entirely - no partial writes are performed. The description must tell the agent to re-read the file and obtain fresh hashes before retrying. | **Complete** - Rejection semantics in `_HAET_EDIT_DESCRIPTION`

## SWR-1816 — File Edit Tool: Error Message Guidance
trace: required
legacy-id: REQ-20260413-201248-016
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The file-edit tool's description must include the canonical error messages the tool emits (e.g., hash mismatch, line not found, ambiguous anchor) and the correct recovery action for each. | **Complete** - All 4 error messages + recovery actions in `_HAET_EDIT_DESCRIPTION`

## SWR-1817 — Python Application: Full Argparse Coverage
trace: required
legacy-id: REQ-20260413-201248-017
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

Every operation currently accessible through the application's UI must be accessible via argparse arguments on the command line. There must be no functionality gap between the UI path and the argparse path. | **Complete** - `cli/argparse_app.py` with `run`, `sessions`, `version` subcommands

## SWR-1818 — Python Application: Argparse as Primary Entry Point
trace: required
legacy-id: REQ-20260413-201248-018
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The argparse-based entry point must function without any UI library imported or initialized. Running the application with argparse arguments must not trigger UI initialization, event loops, or display rendering code. | **Complete** - No TUI imports in `argparse_app.py`, `rotaris-headless` entry point

## SWR-1819 — Python Application: Argparse Help Text
trace: required
legacy-id: REQ-20260413-201248-019
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

Each argparse argument must have a `help` string that mirrors the UI label or description for the corresponding control. Optional arguments must document their default values in the help text. | **Complete** - All args have help strings with defaults documented

## SWR-1820 — Python Application: Exit Codes
trace: required
legacy-id: REQ-20260413-201248-020
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

The argparse entry point must exit with code `0` on success and a non-zero code on failure. Error details must be written to stderr. Structured output (results, responses) must be written to stdout. | **Complete** - `main()` returns 0/1, errors to stderr via `print(..., file=sys.stderr)`

## SWR-1821 — Tests: Shared Behavior Contract
legacy-id: REQ-20260413-201248-021
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

A test fixture or base class must define the shared behavior contract that both the UI path and the argparse path must satisfy. All behavior assertions must be written against this contract, not against implementation details of either path. | **Complete** - `tests/integration/test_behavior_contract.py`

## SWR-1822 — Tests: Parametrized Path Coverage
legacy-id: REQ-20260413-201248-022
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

Existing and new functional tests must be parametrized to execute the same test logic against both the UI-driven code path and the argparse-driven code path. A test that passes for one path and fails for the other must be treated as a bug. | **Complete** - Parametrized across Typer and argparse backends

## SWR-1823 — Tests: Argparse-Specific Edge Cases
legacy-id: REQ-20260413-201248-023
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

New tests must cover argparse-specific edge cases: missing required arguments (expect non-zero exit + stderr message), unknown arguments (expect non-zero exit), conflicting argument combinations (expect non-zero exit + descriptive error), and `--help` (expect zero exit + usage text on stdout). | **Complete** - `tests/integration/test_cli_argparse.py`

## SWR-1824 — Tests: No UI Initialization in Argparse Tests
legacy-id: REQ-20260413-201248-024
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

Tests that exercise the argparse path must assert that no UI initialization code is called. This may be verified via mock/patch or by running the CLI as a subprocess and confirming it exits cleanly without a display. | **Complete** - No-UI-init assertion via `sys.modules` check

## SWR-1825 — Configuration Loader: Field-Wise Overlay Semantics
trace: required
legacy-id: REQ-20260413-201248-025
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-201248.md

Layered `agents.yaml` and `models.yml` overrides must preserve unspecified fields from lower-priority layers. Matching persona, model, MCP server, and runtime entries must merge by field, while explicitly provided list/dict fields still replace the inherited field value rather than deep-merging element contents. | **Complete** - loader now overlays matching entries by field in `config/loader.py`, with regression coverage in `tests/unit/test_config_loader.py`

## SWR-1826 — Rotaris - `--help` / `-h` flag
trace: required
legacy-id: REQ-20260425-001
date: 2026-04-25
source: docs/requirement-log/done/requirements-20260425-224446.md

## Summary The console interface shall provide a `--help` / `-h` flag that displays usage instructions, available commands, and argument descriptions. This gives users immediate guidance on how to interact with the tool without needing to consult external documentation. ## Requirements ### Functional Requirements ### Non-Functional Requirements ## Resolution | Complete (stdlib `argparse` covers all three subcommands)

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
