---
req-id: [SWR-500, SWR-501, SWR-502, SWR-503, SWR-504, SWR-505, SWR-506, SWR-507, SWR-508, SWR-509, SWR-510, SWR-511, SWR-512, SWR-513, SWR-514, SWR-515, SWR-516, SWR-517, SWR-518, SWR-519, SWR-520, SWR-521, SWR-522, SWR-523, SWR-524, SWR-525, SWR-526, SWR-527, SWR-528, SWR-529, SWR-530, SWR-531, SWR-532, SWR-533, SWR-534, SWR-535, SWR-536, SWR-537, SWR-538, SWR-539, SWR-540, SWR-541, SWR-542, SWR-543, SWR-544, SWR-545, SWR-546, SWR-547, SWR-548, SWR-549, SWR-550, SWR-553, SWR-554, SWR-555, SWR-559, SWR-560, SWR-561, SWR-562, SWR-563]
status: approved
trace: required
test: required
title: "Tool Platform & Integrations"
---

# 500-tool-platform spec

## SWR-500 — Tool Platform & Integrations
trace: optional
test: optional

Core tool integration surface: custom Python tool plugins, terminal tool reliability, tool-call schema alignment, and tool-calling stall hardening.

Derived requirements: [SWR-2126 — Background terminal session registry](500-tool-platform/SWR-2126-background-terminal-sessions.md), [SWR-2127 — Terminal tool module import robustness](500-tool-platform/SWR-2127-terminal-module-import-robustness.md), [SWR-2129 — Malformed tool-call argument repair](500-tool-platform/SWR-2129-tool-call-argument-repair.md), [SWR-2418 — Per-agent runtime tool binding isolation](500-tool-platform/SWR-2418-per-agent-tool-binding-isolation.md), [SWR-2808 — Terminal completion signal is not housekeeping](500-tool-platform/SWR-2808-terminal-completion-signal-not-housekeeping.md), [SWR-2809 — Answer-only routes complete without a task-advancing tool](500-tool-platform/SWR-2809-answer-only-routes-complete-without-execution.md), [SWR-2908 — Terminal PowerShell probe caching](500-tool-platform/SWR-2908-terminal-powershell-probe-caching.md), [SWR-3004 — A final assistant message is the completion signal](500-tool-platform/SWR-3004-no-terminal-completion-tool.md), [SWR-3617 — Terminal output stream hub](500-tool-platform/SWR-3617-terminal-output-stream-hub.md), [SWR-3618 — Per-backend terminal stream tap](500-tool-platform/SWR-3618-terminal-stream-tap.md)

## SWR-501 — Unavailable Tool Handling
legacy-id: FR-3-001
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

If a configured tool is unavailable at runtime, the TUI shows it as unavailable and the tool is not injected into the agent's prompt/tool list.

## SWR-502 — Path Resolution
legacy-id: FR-3-002
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

File-system-backed tools must resolve all paths to their real path before access. Symlinks, junctions, and relative-path tricks that escape the resolved workspace root are rejected.

## SWR-503 — Shell CWD
legacy-id: FR-3-003
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Shell execution starts with `cwd` set to the resolved workspace root. By default, the framework rejects shell invocations that explicitly target a working directory outside the workspace or that use framework-supplied path arguments resolving outside the workspace.

## SWR-504 — No Full OS Sandboxing
trace: optional
test: optional
legacy-id: FR-3-004
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

v1 does **not** claim full OS-level sandboxing of arbitrary shell syntax. Shell subprocesses inherit the host process environment and network access unless the user runs the framework inside Docker or another sandbox.

## SWR-505 — Secret Redaction
legacy-id: FR-3-006
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Secrets loaded from configuration are treated as sensitive material. Values of keys such as `api_key`, `token`, `secret`, and `password` must be redacted in the TUI, logs, transcripts, and report artifacts, and must never be injected into agent prompts unless the tool itself requires them at execution time.

## SWR-506 — Tool Timeouts
legacy-id: FR-3-007
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

All tools have a default timeout to prevent infinite hangs.

## SWR-507 — Preinstalled MCP Servers
status: draft
legacy-id: FR-3-008
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Some tools/MCP may ship preinstalled: Tavily MCP for web search (`https://github.com/tavily-ai/tavily-mcp`). LSP candidate: `https://github.com/isaacphi/mcp-language-server`. Playwright MCP preconfigured in v1.

## SWR-508 — Hard Timeout Kill
legacy-id: FR-TERM-001
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

When a terminal command exceeds its wall-clock `timeout`, the executor force-kills the process by resetting the backend session (single-session) or replacing the tmux pane (pooled). The shell state (cwd, exports, aliases, jobs) for that session is lost.

## SWR-509 — Structured Error Payload
legacy-id: FR-TERM-002
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Timeout observations carry `failure_kind`, `timeout_seconds`, `kill_status`, `session_reinitialized`, `backend`, and an explicit `detail` string so agents can interpret the failure without parsing unstructured output.

## SWR-510 — Default Timeout
legacy-id: FR-TERM-003
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

A per-tool-call `default_timeout_seconds` can be configured. When set, every command without an explicit `timeout` inherits this value, preventing unbounded hangs.

## SWR-511 — Soft No-Output Annotation
legacy-id: FR-TERM-004
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

When a command produces no stdout for the SDK's no-change timeout, the observation is annotated with a human-readable detail explaining that the process may still be running and suggesting corrective actions (`is_input`, `C-c`, `2>&1`).

## SWR-512 — TUI Command Visibility
trace: optional
legacy-id: FR-TERM-005
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

When a terminal command is being executed, the TUI must display the command string in both the agent status pane (as `$ <command>`) and the transcript feed (as `terminal: $ <command>`). Metadata flags - timeout value, reset, and is_input mode - must also be visible alongside the command.

## SWR-513 — Reset Capability
legacy-id: FR-TERM-006
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

`reset=true` creates a fresh terminal session before running the command. An empty command with `reset=true` returns a confirmation observation. Reset cannot be combined with `is_input=true`.

## SWR-514 — Interactive Input
legacy-id: FR-TERM-007
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

`is_input=true` sends the command string as input to a running foreground process rather than executing a new shell command. Supports special key sequences (`C-c`, `C-d`, `UP`, `TAB`, etc.).

## SWR-515 — Backend Transparency
legacy-id: FR-TERM-008
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Every observation carries a `backend` field (`"single-session"` or `"tmux-pool"`) so agents and diagnostics can distinguish the execution mode.

## SWR-516 — Atomic Observation Coercion
legacy-id: FR-TERM-009
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

All observations pass through `_coerce_observation`, which stamps the backend and annotates soft-no-output pauses. The result is always a `HardenedTerminalObservation`, even when the underlying SDK returns a plain `TerminalObservation`.

## SWR-517 — Session-Scoped
legacy-id: FR-TODO-001
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The todo list is session-scoped and persisted with the session state.

## SWR-518 — Stable IDs
legacy-id: FR-TODO-002
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Phases and tasks have stable unique IDs. Task names and phase names are **not** required to be unique.

## SWR-519 — Operations
legacy-id: FR-TODO-003
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The tool exposes exactly these operations in v1: `replace`, `add_phase`, `add_task`, `update`, `remove_task`.

## SWR-520 — ID-Based Targeting
legacy-id: FR-TODO-004
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The `update` and `remove_task` operations target items by stable ID, not by name.

## SWR-521 — Update Capabilities
legacy-id: FR-TODO-005
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The `update` operation must support status changes and text edits.

## SWR-522 — Phase/Task Structure
legacy-id: FR-TODO-006
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Tasks belong to a phase. A phase contains an ordered list of tasks.

## SWR-523 — Task States
legacy-id: FR-TODO-007
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The four allowed task states are: `pending`, `in_progress`, `completed`, `abandoned`. At most one task per agent may be `in_progress` at a time unless a future version explicitly enables parallel in-progress task tracking.

## SWR-524 — Replace Constraints
legacy-id: FR-TODO-008
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

`replace` may overwrite future `pending` tasks and future phases, but it must **not** overwrite: the current `in_progress` task, any task already marked `completed`, or any task already marked `abandoned`.

## SWR-525 — TUI Visibility
trace: optional
legacy-id: FR-TODO-009
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The current todo list must be visible in the TUI and included in saved session state.

## SWR-526 — Ralph Loop Anchor
legacy-id: FR-TODO-010
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Ralph loop mode must use the todo list as its default progress anchor.

## SWR-527 — One Page Per Call
legacy-id: FR-FETCH-001
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The fetch tool is intended for direct page retrieval, not broad web search. One page per tool call.

## SWR-528 — Default Format
legacy-id: FR-FETCH-002
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The fetch tool returns raw HTML by default.

## SWR-529 — Line Truncation
legacy-id: FR-FETCH-003
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The default response is truncated to at most `1000` lines of content.

## SWR-530 — Optional Parameters
legacy-id: FR-FETCH-004
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The tool exposes optional parameters to increase the maximum returned line count and to select a line range via `from_line` and `to_line`.

## SWR-531 — Structured Metadata
legacy-id: FR-FETCH-005
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The fetch tool must return structured metadata including the final URL, HTTP status when available, content type when available, and the returned HTML payload.

## SWR-532 — Timeout and Error Handling
legacy-id: FR-FETCH-006
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

The fetch tool must respect the framework timeout policy and surface network failures as structured tool errors.

## SWR-533 — First-Class Integration
status: draft
legacy-id: FR-PLAYWRIGHT-001
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

v1 includes Playwright MCP as a first-class browser automation integration.

## SWR-534 — Per-Persona Configuration
status: draft
legacy-id: FR-PLAYWRIGHT-002
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Personas that need browser interaction may be configured with Playwright MCP in the same way as other MCP-backed tools.

## SWR-535 — Intended Use
trace: optional
test: optional
legacy-id: FR-PLAYWRIGHT-003
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Playwright MCP is intended for local app verification, browser inspection, and interaction testing in both interactive and background runs.

## SWR-536 — Headless Default
status: draft
legacy-id: FR-PLAYWRIGHT-004
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Headless mode is the default in v1.

## SWR-537 — Plugin Interface
legacy-id: FR-7-001
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Developers can register custom tools as Python functions via a decorator. The decorator is the discovery and naming mechanism.

## SWR-538 — Sync and Async
legacy-id: FR-7-002
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Both synchronous and asynchronous Python functions are supported.

## SWR-539 — Serialization
legacy-id: FR-7-003
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Arguments and return values must be JSON-serializable, or serializable through an explicitly supported schema layer such as Pydantic.

## SWR-540 — Per-Persona Config
legacy-id: FR-7-004
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Custom tools are declared per persona in `agents.yaml` under `custom_tools:` and loaded at runtime.

## SWR-541 — MCP vs Plugin Boundary
legacy-id: FR-7-005
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

MCP servers remain the primary mechanism for external tool integrations; Python function plugins handle local/custom logic.

## SWR-542 — In-Process Execution
legacy-id: FR-7-006
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Plugins run in-process with the same OS permissions as the main CLI process. They are **not** separately sandboxed in v1.

## SWR-543 — Stateless
legacy-id: FR-7-007
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Plugins are treated as stateless from the framework's perspective. Implementations must not rely on in-memory state surviving across turns or restarts.

## SWR-544 — Duplicate Name Error
legacy-id: FR-7-008
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Duplicate registered plugin tool names after config resolution are a startup error.

## SWR-545 — Exception Handling
legacy-id: FR-7-009
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

Exceptions raised by a plugin are converted into structured tool errors. The model receives the error type and message; full stack traces are for debug logs only.

## SWR-546 — Startup Validation
legacy-id: FR-7-010
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000003-tools.md

If a persona references a plugin that cannot be imported or validated at startup, startup fails fast for that session.

## SWR-547 — Detect Housekeeping-Only Runs
legacy-id: REQ-20260414-224700-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-224700.md

The scheduler must classify child transcripts and detect the incomplete execution pattern where the child emits planning text and `todo` calls but no task-advancing tool call.

## SWR-548 — Single Recovery Prompt
legacy-id: REQ-20260414-224700-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-224700.md

When a child ends an iteration in the housekeeping-only state, the scheduler must send exactly one corrective follow-up instructing the model to call a task-advancing non-`todo` tool.

## SWR-549 — Fail Incomplete Execution Cleanly
legacy-id: REQ-20260414-224700-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-224700.md

If the child still does not execute a task-advancing tool after the recovery prompt, the scheduler must return a failed report that explains the stall instead of allowing the run to be summarized as success.

## SWR-550 — Preserve Mixed Streaming Content
trace: optional
legacy-id: REQ-20260414-224700-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-224700.md

The TUI streaming filter must suppress pure model-internal markup while preserving chunks that contain both internal markers and user-visible text.

## SWR-553 — Disable Undocumented ThinkTool
legacy-id: REQ-20260414-230140-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-230140.md

Standard personas must not inherit `ThinkTool`; only `FinishTool` remains enabled by default so agents do not emit undocumented `think` calls.

## SWR-554 — Render Runtime Tool Names
trace: optional
legacy-id: REQ-20260414-230140-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-230140.md

System prompts must describe the actual runtime tool names (`haet_edit`, `terminal`, etc.) instead of config aliases when those differ.

## SWR-555 — Clarify Tool Argument Shapes
trace: optional
test: optional
legacy-id: REQ-20260414-230140-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-230140.md

Prompt tool hints must explicitly mention accepted argument names for HAET and terminal tooling to reduce malformed tool calls.

## SWR-559 — Terminal observations must classify command outcomes separately from internal tool errors.
legacy-id: REQ-20260709-TERM-001
date: 2026-07-09
source: docs/requirement-log/done/requirements-20260709-terminal-tool-reliability.md
priority: High

Terminal observations must classify command outcomes separately from internal tool errors.

## SWR-560 — Session diagnostics must record shell failures, suspicious successful terminal output, and terminal timeouts as issues.
legacy-id: REQ-20260709-TERM-002
date: 2026-07-09
source: docs/requirement-log/done/requirements-20260709-terminal-tool-reliability.md
priority: High

Session diagnostics must record shell failures, suspicious successful terminal output, and terminal timeouts as issues.

## SWR-561 — Completed child diagnostics must record terminal child states, not intermediate running or summarizing states.
legacy-id: REQ-20260709-TERM-003
date: 2026-07-09
source: docs/requirement-log/done/requirements-20260709-terminal-tool-reliability.md
priority: High

Completed child diagnostics must record terminal child states, not intermediate running or summarizing states.

## SWR-562 — Read/search/edit tools must provide recoverable behavior for common agent mistakes: wrong paths, absolute grep paths, and safe HAET anchor-line drift.
legacy-id: REQ-20260709-TERM-004
date: 2026-07-09
source: docs/requirement-log/done/requirements-20260709-terminal-tool-reliability.md
priority: Medium

Read/search/edit tools must provide recoverable behavior for common agent mistakes: wrong paths, absolute grep paths, and safe HAET anchor-line drift.

## SWR-563 — Interactive `ask_questions` Tool
status: approved
trace: required
test: required
date: 2026-07-28
source: docs/plans/2026-07-28-ask-questions-tool.md
priority: Medium

An `ask_questions` tool lets agents prompt the user with grouped, stepped
questions (options + freeform text). The tool blocks the conversation until
the user submits answers via the Rotaris question stepper, then returns
answers as a structured tool observation.

### Acceptance criteria

- **AC-563.1 — Tool Definition**: `AskQuestionsTool` is a registered
  `ToolDefinition` with a `AskQuestionsAction` schema: 1–10 steps, 0–8
  options per step, unique step IDs, non-empty titles, non-empty option
  labels, and a `allow_freeform` flag per step.
- **AC-563.2 — Action Validation**: A step with no options and
  `allow_freeform=False` is rejected. Duplicate step IDs, empty titles,
  empty option labels, fewer than 1 or more than 10 steps, and more than
  8 options per step are all rejected at construction time.
- **AC-563.3 — Observation Rendering**: `AskQuestionsObservation.to_llm_content`
  renders structured Q&A (step ID → selected option or freeform text),
  a cancellation message, a timeout message, and an empty-answers message.
- **AC-563.4 — Executor Wait**: `AskQuestionsExecutor` blocks on
  `UserPromptBarrier.wait_for_response` and returns a resolved, cancelled,
  or timed-out `AskQuestionsObservation`.
- **AC-563.5 — Reentrant Guard**: The executor refuses a second prompt while
  one is already pending for the conversation (RuntimeError → cancelled
  observation).
- **AC-563.6 — Callback**: An `on_questions_stored` callback receives the
  conversation, prompt ID, and steps before the blocking wait begins.
- **AC-563.7 — Callback Failure Cleanup**: If `on_questions_stored` raises,
  the barrier prompt is discarded and the executor returns a cancelled
  observation.
- **AC-563.8 — Timeout**: The configurable `response_timeout` (default 300 s)
  causes a timed-out observation when the user does not respond.
- **AC-563.9 — No Conversation**: An executor with `conversation=None`
  returns a cancelled observation.

### Implementation notes

- **Module**: `src/rotaris_core/tools/ask_questions.py`
- **Classes**:
  `AskQuestionsOption` (label, description),
  `AskQuestionsStep` (id, title, description, options, allow_freeform),
  `AskQuestionsAction` (steps with model-validator),
  `AskQuestionsObservation` (answers, cancelled, timed_out, to_llm_content),
  `AskQuestionsExecutor` (barrier → wait → observation, traced
  `@traces(SWR.SWR_563)`),
  `AskQuestionsTool` (factory via `_register_ask_questions_tool_factory`
  in `agents/tool_registration.py`).
- **User-facing bridge**: `UserPromptBarrier` (SWR-2423) in
  `orchestrator/user_prompt_barrier.py`; desktop stepper widget
  (SWR-2422).
- **Tests**: 20 cases in `tests/unit/tools/test_ask_questions.py`,
  covering action validation, observation rendering, executor paths
  (success, cancel, timeout, reentrant guard, no conversation, callback,
  callback failure).

Derived requirements: [SWR-2422 — Question Stepper Widget](2000-rotaris-desktop/SWR-2422-question-stepper.md), [SWR-2423 — User-Prompt Bridge](2000-rotaris-desktop/SWR-2423-user-prompt-bridge.md)

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
