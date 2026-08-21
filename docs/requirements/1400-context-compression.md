---
req-id: [SWR-1400, SWR-1401, SWR-1402, SWR-1403, SWR-1404, SWR-1405, SWR-1406, SWR-1407, SWR-1408, SWR-1409, SWR-1410, SWR-1411, SWR-1412, SWR-1413, SWR-1414, SWR-1415, SWR-1416, SWR-1417, SWR-1418, SWR-1419, SWR-1420, SWR-1421, SWR-1422, SWR-1423, SWR-1424, SWR-1425, SWR-1426, SWR-1427, SWR-1428, SWR-1429, SWR-1430, SWR-1431, SWR-1432, SWR-1433, SWR-1434, SWR-1435, SWR-1436, SWR-1437, SWR-1438, SWR-1439, SWR-1440, SWR-1441, SWR-1442, SWR-1443, SWR-1444, SWR-1445, SWR-1446, SWR-1447, SWR-1448, SWR-1449, SWR-1450, SWR-1451, SWR-1452, SWR-1453, SWR-1454, SWR-1455]
status: approved
trace: required
test: required
title: "Context Compression & Monitoring"
---

# 1400-context-compression spec

## SWR-1400 — Context Compression & Monitoring
trace: optional
test: optional

Managing context windows: compression engine, runtime monitoring UI, global threshold slider, and on-demand /compress.

## SWR-1401 — Context Compression: Automatic Trigger
legacy-id: REQ-20260413-204058-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The framework must automatically initiate context compression when the accumulated context token count for an agent session reaches or exceeds the configured threshold. The check must occur before each new LLM call; if the threshold is exceeded, compression runs first and the original call uses the compressed context.

## SWR-1402 — Context Compression: Default Threshold
legacy-id: REQ-20260413-204058-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The default context compression threshold is 120,000 tokens. This value applies to all models unless overridden.

## SWR-1403 — Context Compression: Per-Model Threshold Override
legacy-id: REQ-20260413-204058-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The configuration file must support a per-model threshold override that supersedes the default. When a model entry specifies a `context_compression_threshold` value, that value is used for all agents running on that model. The override must not affect models that do not define it.

## SWR-1404 — Context Compression: Auto-Derive Threshold From Model Capacity
legacy-id: REQ-20260413-204058-003a
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

When a model defines `max_input_tokens` but no explicit `context_compression_threshold`, the effective threshold is `int(max_input_tokens * compressor.auto_threshold_ratio)` (default ratio: 0.6). This binds the compression trigger to the model's actual context window so deployments with smaller windows (e.g. local models at 40k) compress proportionally. The auto-derive only applies when no explicit per-model override is set; explicit overrides always win. When neither is set, `compressor.default_threshold` applies unchanged.

## SWR-1405 — Context Compression: Compressor Agent Definition
legacy-id: REQ-20260413-204058-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

A dedicated agent named `Compressor` must be defined in the framework. The Compressor is not a general-purpose agent; it accepts only a context window as input and returns a compressed representation. It must not be invocable as a regular task delegate.

## SWR-1406 — Context Compression: Compressor Model Configuration
legacy-id: REQ-20260413-204058-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The model used by the Compressor agent must be independently configurable in the configuration file. The configuration key must be distinct from the model key of any other agent so that the Compressor can be assigned a cheaper or faster model without affecting other agents.

## SWR-1407 — Context Compression: Compression Output Size
legacy-id: REQ-20260413-204058-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The Compressor agent's output must be a summary of at most a few hundred lines (target: ≤ 300 lines). The exact line budget may be made configurable; the default is 300 lines.

## SWR-1408 — Context Compression: Preserved Content - System Prompt
legacy-id: REQ-20260413-204058-007
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The original system prompt of the agent whose context is being compressed must be retained verbatim. Compressor must not have access to the system prompt.

## SWR-1409 — Context Compression: Preserved Content - Tool Definitions
legacy-id: REQ-20260413-204058-008
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

All tool definitions that were injected into the agent's context at session start must be retained verbatim. The compressor must not have access to these definitions.

## SWR-1410 — Context Compression: Preserved Content - User Request
legacy-id: REQ-20260413-204058-009
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The original request (the first message that initiated the current task) must be retained verbatim in the compressed context.

## SWR-1411 — Context Compression: Compressed Content Scope
legacy-id: REQ-20260413-204058-010
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

Only the agent's action history - tool calls, tool results, and intermediate assistant messages generated after the initial user request - is subject to compression. The Compressor must produce a concise narrative of what the system has done, what was found, and what remains unresolved, without reproducing raw tool output verbatim.

## SWR-1412 — Context Compression: Context Reconstruction
legacy-id: REQ-20260413-204058-011
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

After compression, the reconstructed context passed to the next LLM call must be ordered as: (1) original system prompt + original tool definitions, (2) original request / task, (3) compressor summary. No other messages from the pre-compression history may appear.

## SWR-1413 — Context Compression: Preserved Content - Todos
legacy-id: REQ-20260413-204058-012-COMPRESSION-TODOS
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

All todos associated with the current task must be retained in the compressed context exactly as they were, copied 1:1 without modification or summarization. Todos must appear after the compressor summary in the reconstructed context.

## SWR-1414 — Agent Monitor: Sub-Agent Status List
legacy-id: REQ-20260413-204058-012
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

While agents are running, the orchestrator view must display a live list of all currently active sub-agents. For each entry the list must show: agent name/role, number of tool calls dispatched so far, and elapsed wall-clock time since the agent was started.

## SWR-1415 — Agent Monitor: Arrow-Key Tree Navigation - Descend
legacy-id: REQ-20260413-204058-013
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

Pressing the down arrow key + ctrl at the orchestrator level must move focus into the first active child agent (depth + 1). If no child agents are active, the key press has no effect.

## SWR-1416 — Agent Monitor: Arrow-Key Tree Navigation - Sibling Traversal
legacy-id: REQ-20260413-204058-014
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

Pressing the left or right arrow key + ctrl while focused on an agent at depth ≥ 1 must cycle focus to the previous or next sibling agent at the same depth level. If there is only one agent at that level, the key press has no effect.

## SWR-1417 — Agent Monitor: Arrow-Key Tree Navigation - Ascend
legacy-id: REQ-20260413-204058-015
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

Pressing the up arrow key + ctrl while focused on a child agent must move focus back to its parent agent. Pressing up at the root/orchestrator level has no effect.

## SWR-1418 — Agent Monitor: Focused Agent Context Display
legacy-id: REQ-20260413-204058-016
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

When focus moves to an agent via arrow-key + ctrl navigation, the main chat/log view must update to display that agent's message history and tool calls. The view must make the currently focused agent's identity visible (e.g., a breadcrumb).

## SWR-1419 — Right Panel: Token Usage Estimate
legacy-id: REQ-20260413-204058-017
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must display a running estimate of tokens consumed by the current agent session. The estimate is derived from character count using a configurable characters-per-token ratio (default: 4 characters per token). The display must update after each message or tool call.

## SWR-1420 — Right Panel: Active MCP Servers
legacy-id: REQ-20260413-204058-018
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must list the MCP servers that are currently active in the context of the focused agent, showing at minimum each server's name and connection status.

## SWR-1421 — Right Panel: Active Tools
legacy-id: REQ-20260413-204058-019
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must list the tools available to the focused agent. Tools that have been called at least once in the current session must be visually distinguishable from tools that have not been called.

## SWR-1422 — Right Panel: Warnings and Problems
legacy-id: REQ-20260413-204058-020
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must display a warnings/problems section. It must surface at minimum: context approaching compression threshold (e.g., at 80% of threshold), tool call errors from the current session, and agent-level errors or unexpected terminations.

## SWR-1423 — Right Panel: Current Workspace
legacy-id: REQ-20260413-204058-021
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must display the active workspace directory path. The path must reflect the workspace of the focused agent if the focused agent operates in a different directory than the orchestrator.

## SWR-1424 — Right Panel: Active Model
legacy-id: REQ-20260413-204058-022
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must display the model identifier currently assigned to the focused agent, including any variant or parameter qualifier (e.g., `claude-opus-4-6 / max`).

## SWR-1425 — Right Panel: Open Todos
legacy-id: REQ-20260413-204058-023
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must display the list of open todos belonging to the focused agent's current task. Each entry must show the todo text and its status (pending / in-progress).

## SWR-1426 — Chat View: Mouse-Wheel Scroll Up
legacy-id: REQ-20260413-204058-024
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The chat view must support scrolling upward through message history using the mouse wheel. Scrolling up must not interrupt active agent execution.

## SWR-1427 — Chat View: Auto-Scroll on New Messages
legacy-id: REQ-20260413-204058-025
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

When the chat view is scrolled to or near the bottom, incoming new messages must automatically scroll the view to the latest message (standard auto-scroll behavior). When the user has manually scrolled up, new messages must not force the view back to the bottom; instead a visual indicator must appear signaling that new messages are available.

## SWR-1428 — Header: Current Version Display
legacy-id: REQ-20260413-204058-030
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The main TUI header must display the current application version in the top-right corner so the running build is always visible during interactive use.

## SWR-1429 — Panel Scrollability
legacy-id: REQ-20260413-204058-031
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side TUI pane that contains the agent status, info, and todo panels must support vertical scrolling whenever the combined panel content exceeds the visible height.

## SWR-1430 — Context Compression: Latency Transparency
trace: optional
legacy-id: REQ-20260413-204058-026
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The Compressor agent call must not block the user's visible UI thread. While compression is in progress, the UI must indicate that compression is running (e.g., a status label). The total added latency from compression must be logged for observability.

## SWR-1431 — Right Panel: Render Performance
legacy-id: REQ-20260413-204058-027
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

The right-side panel must refresh at a rate that does not visibly degrade terminal rendering performance. Refresh must be event-driven (update on state change), not polled.

## SWR-1432 — Context Compression: No Loss of Request
legacy-id: REQ-20260413-204058-028
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

It is a hard constraint that the original request is never omitted from the compressed context, regardless of its length. If the request alone exceeds the target summary line budget, the line budget must expand to accommodate it.

## SWR-1433 — Arrow-Key Navigation: No Interference with Text Input
legacy-id: REQ-20260413-204058-029
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-204058.md

Unmodified text-entry keys must remain owned by the chat input while the user is typing, but the explicit `ctrl+arrow` agent-navigation shortcuts must still work from the composer without discarding unsent text. The two modes must not interfere.

## SWR-1434 — The TUI must provide a user-facing slider that lets the user choose the context compression trigger as a percentage value.
legacy-id: REQ-20260509-001
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: High



## SWR-1435 — The slider-controlled percentage must be a single global setting that applies across all models rather than a per-model setting.
legacy-id: REQ-20260509-002
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: High



## SWR-1436 — The selected global percentage must be the primary runtime rule for determining the compression trigger during interactive use, taking precedence over configuration-defined token thresholds and internal auto-threshold ratios.
legacy-id: REQ-20260509-003
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: High



## SWR-1437 — When the active model exposes a known context capacity, the effective compression threshold in tokens must be computed as `floor(min(model_context_capacity, compressor.default_threshold) * selected_percentage / 100)`, unless the model defines an explicit `context_compression_threshold` capacity cap. This prevents very-large advertised context windows from delaying compression until generation performance is already degraded.
legacy-id: REQ-20260509-004
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: High



## SWR-1438 — When the active model does not expose a known context capacity, the effective compression threshold in tokens must be computed as `floor(120000 * selected_percentage / 100)`.
legacy-id: REQ-20260509-005
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: High



## SWR-1439 — The selected percentage must persist as a global user setting and must be restored after application restart.
legacy-id: REQ-20260509-006
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: High



## SWR-1440 — Changing the active model must keep the same selected global percentage and recompute the effective token threshold against the newly active model's bounded compression capacity, or against the `120000`-token fallback when that capacity is unknown.
legacy-id: REQ-20260509-007
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: Medium



## SWR-1441 — The user-facing compression control must present the percentage-based setting as the operative rule and must not require the user to edit token thresholds in configuration files to change compression timing.
legacy-id: REQ-20260509-008
date: 2026-05-09
source: docs/requirement-log/done/requirements-20260509-000001.md
priority: Medium



## SWR-1442 — Command registration
legacy-id: REQ-20260513-190000-001
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

The command `/compress` MUST be registered in the builtin `SlashCommandRegistry` (created by `create_builtin_registry()` in `tui/widgets/slash_commands.py`) alongside the existing built-in commands. - **Name:** `compress` - **Description:** `"Force context compression for all running agents"` - **Arguments:** none

## SWR-1443 — Message dispatch
legacy-id: REQ-20260513-190000-002
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

Executing `/compress` MUST post a new `ForceCompress` message (dataclass, no fields) to the `RotarisTuiApp` via `app.post_message(ForceCompress())`. The message class MUST live in `tui/app.py` with the other TUI messages and follow the same dataclass pattern.

## SWR-1444 — Handler in RotarisTuiApp
legacy-id: REQ-20260513-190000-003
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

`RotarisTuiApp` MUST handle `ForceCompress` with a method `on_force_compress`. The handler MUST: 1. Retrieve every currently-running `ChildTaskRecord` from the active `Scheduler` (or `ChildManager`), iterating only records in non-terminal states. 2. Call the compression path for each child, bypassing the token threshold check - i.e. call `_maybe_compress_context

## SWR-1445 — Threshold bypass
legacy-id: REQ-20260513-190000-004
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

The forced compression path MUST NOT consult `context_compression_threshold`, `auto_threshold_ratio`, or `default_threshold`. It MUST proceed directly to `run_compressor(...)` regardless of current token count. All other compression parameters (`preserve_recent_turns`, `chars_per_token`) continue to apply as normal.

## SWR-1446 — No configuration changes
trace: optional
test: optional
legacy-id: REQ-20260513-190000-005
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

`/compress` MUST NOT modify any persisted configuration, session state, or threshold values. It is a one-shot runtime action only.

## SWR-1447 — User feedback
legacy-id: REQ-20260513-190000-006
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

The user MUST receive clear feedback at each stage:

## SWR-1448 — Command visibility
legacy-id: REQ-20260513-190000-007
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

`/compress` MUST appear in the slash command autocomplete overlay (when that feature is active) with its description, identical to all other built-in commands.

## SWR-1449 — Unit: command registered
trace: optional
legacy-id: REQ-20260513-190000-T001
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

`create_builtin_registry()` returns a registry that contains `"compress"`.

## SWR-1450 — Unit: ForceCompress posted
trace: optional
legacy-id: REQ-20260513-190000-T002
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

Calling `registry.execute("/compress", mock_app)` posts exactly one `ForceCompress` message to the app.

## SWR-1451 — Unit: threshold bypass
trace: optional
legacy-id: REQ-20260513-190000-T003
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

`force_compress_child` (or the equivalent helper) does not call `_maybe_compress_context`'s threshold branch; `run_compressor` is invoked even when estimated tokens are 0.

## SWR-1452 — Unit: no agents running
trace: optional
legacy-id: REQ-20260513-190000-T004
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

`on_force_compress` with zero active children shows the `"No running agents to compress."` warning toast and does not call `run_compressor`.

## SWR-1453 — Integration: multiple agents compressed
trace: optional
legacy-id: REQ-20260513-190000-T005
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

With N > 1 mocked running children, `on_force_compress` calls compression N times and posts the completion toast mentioning N.

## SWR-1454 — TUI workflow
trace: optional
legacy-id: REQ-20260513-190000-T006
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

Full workflow test via `app.run_test()` + `Pilot`: type `/compress`, press Enter, assert toast appears and no crash.

## SWR-1455 — TUI no-crash (random interaction)
trace: optional
legacy-id: REQ-20260513-190000-T007
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-compress-command.md

Invoking `/compress` when no session is running must not raise an exception or leave the app in an undefined state.

## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Agentic Framework - Context Compression & Runtime Monitoring UI (2026-04-13)

Original: `docs/requirement-log/done/requirements-20260413-204058.md` — document status: Complete

#### Description

Two independent feature areas are specified here. First, an automatic context compression mechanism: when accumulated context exceeds a configurable token threshold, a dedicated Compressor agent is invoked to reduce the message history to a few hundred lines while preserving the original system prompt, tool definitions, and the user's initial request. Second, a set of runtime monitoring and navigation improvements to the orchestrator UI: live sub-agent status with tool-call counts and elapsed time, arrow-key navigation through the agent delegation tree, a right-side panel showing token estimates, active MCP servers, active tools, warnings, workspace, and open todos, and standard chat scroll behavior.

#### Implementation Notes

**Requirements Document:**

global slider requirements, and follow-up TUI documents take priority where they overlap, including `requirements-20260511-164500.md` for composer-adjacent timing and compact agent-list presentation) > **Consolidation note:** REQ-20260413-204058-001 through REQ-20260413-204058-011 and the > compression-related non-functional constraints remain the authority for context compression, > except that compression-trigger precedence and the user-facing threshold-selection policy are > now amended by `requirements-20260509-000001.md`. The overlapping TUI monitoring and right-rail > requirements in REQ-20260413-204058-012 through REQ-20260413-204058-031 are now refined by the > focused follow-up docs referenced from `requirements-20260413-000004-tui-core.md`, especially > `requirements-202604141613000.md`, `requirements-20260426-020611.md`, > `requirements-20260429-120000.md`, `requirements-20260430-160000.md`, > `requirements-20260503-style-guided-theme.md`, and `requirements-20260511-164500.md`.

**Implementation Status:**

All 31 requirements have been implemented across the following modules:

**Follow-up Fixes (2026-04-24, v0.18.1):**

Fixed a regression where the InfoPane static panes did not reflect the currently focused agent when navigating the sub-agent tree (REQ-019, REQ-022) and the per-session token meter always showed `~0` (REQ-017):

- `tui/app.py` now resolves the focused agent's persona from

`current_session.child_states`, uses `persona.model` for the displayed model name, `persona.tools + persona.custom_tools` for the Tools list, and filters `persona.mcp_servers` for the MCP Servers list.

- Tools called by the focused agent are marked "used" via

`GlobalTracker.get_agent_data(focused_agent_id).tool_calls`.

- `orchestrator/scheduler.py` now extracts accumulated SDK token usage

via `extract_token_usage(agent.llm)` after each `conversation.run()` and pushes it into `GlobalTracker.set_agent_tokens(...)` so per-agent token metrics are actually populated.

- `tracking/tracker.py` gained `set_agent_tokens` to replace (not merge)

the snapshot, since SDK metrics are already cumulative; the global aggregate is recomputed from the sum of all per-agent snapshots.

- `tui/widgets/info_pane.py` now prefers the session-level token

estimate supplied via `update_info(...)` over the tracker aggregate, re-labels the tools column as "tool calls" to disambiguate it from tokens, and renders per-agent rows as `<tokens> tok / <calls> calls` instead of the confusing `Nt/Mt` format.

**Follow-up Fixes (2026-05-03, v0.30.1):**

Added live compression counts to the right-side InfoPane for REQ-017, REQ-020, and REQ-026:

- `tracking/tracker.py` now records completed context compressions globally

and per agent.

- `tui/app.py` increments the counter when SDK condensation/compression

completion events arrive.

- `tui/widgets/info_pane.py` renders the top-level `compr` count and per-agent

rows as `<tokens> tok / <calls> calls / <compressions> compr`.

**Follow-up Fixes (2026-05-03, v0.31.2):**

Implemented REQ-20260413-204058-003a: auto-derive compression threshold from model capacity.

- `config/schema.py`: added `CompressorConfig.auto_threshold_ratio: float = 0.6`.

- `agents/compressor.py:build_context_condenser` (live production path used by

the SDK-registered `RotarisCondenser`): inserted middle tier in threshold resolution - explicit per-model override wins; otherwise derive from `max_input_tokens * auto_threshold_ratio`; otherwise fall back to `default_threshold`. Logs which branch was taken at debug level. This historical rule was superseded by the 2026-06-17 performance amendment in `requirements-20260509-000001.md`, which bounds large advertised context windows by `compressor.default_threshold`.

- `orchestrator/scheduler.py:_maybe_compress_context`: mirrored the same

three-tier logic for consistency, even though this path is currently only exercised by integration tests.

- `tests/unit/test_compressor.py`: added three unit tests covering explicit

override, auto-derive, and default fallback precedence rules.

**Context Compression (REQ-001 through REQ-012-COMPRESSION-TODOS, REQ-026, REQ-028):**

- **Config**: `CompressorConfig` in `config/schema.py`, defaults in `config/defaults.py`, validation in `config/validation.py`

- **Agent**: `agents/compressor.py` - `Compressor` class plus a compressor-backed SDK condenser for long-running agent conversations

- **Trigger**: `agents/factory.py` and `agents/researcher.py` attach the condenser to each `Agent(...)`, so compression happens before the next LLM call and the SDK can recover from `LLMContextWindowExceedError` by issuing `CondensationRequest`

- **UI Feedback**: `tui/live_activity.py` maps SDK `CondensationRequest` / `Condensation` events to compression status updates

- **Tests**: `tests/unit/test_compressor.py` (17 tests), `tests/integration/test_compression_e2e.py`

**TUI Monitoring & Navigation (REQ-012 through REQ-031):**

- **Agent Status**: `tui/widgets/agent_status.py` - tool call counts, elapsed time, focused highlight

- **Navigation**: `tui/app.py` - Ctrl+arrow key tree navigation (descend/ascend/sibling)

#### Acceptance Criteria

All requirement rows are implemented.

### Rotaris - Global Context Compression Threshold Slider (2026-05-09)

Original: `docs/requirement-log/done/requirements-20260509-000001.md` — document status: Complete

#### Description

Rotaris already supports automatic context compression based on token thresholds, but the trigger is currently controlled by configuration-level token values and an internal auto-threshold ratio. The system must add a user-facing global slider that lets the user choose the compression trigger as a percentage of the active model's compression capacity. That percentage becomes the primary runtime rule across all models, persists across restarts, and falls back to the existing default threshold base when the active model's context size is unknown.

**Current behaviour:**

- Context compression triggers when accumulated context reaches a configured token threshold.

- The existing requirement set defines a default token threshold of `120000`, optional per-model token overrides, and an internal auto-derived ratio based on `max_input_tokens`.

- There is no user-facing control for selecting the compression trigger as a percentage.

- There is no requirement that a user's compression-threshold preference persist as a global setting.

**What needs to change:**

1. Add a user-facing slider for context compression threshold selection.

2. Define the slider as a global control that applies across all models rather than per model.

3. Make the selected percentage the primary runtime rule for deciding when compression starts.

4. Compute the effective token threshold from the active model's bounded compression capacity whenever that capacity is known.

5. When the active model's context capacity is unknown, compute the effective threshold from the existing default threshold base of `120000` tokens.

6. Persist the selected percentage so the same global setting is restored after restart.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `/home/glados/Development/geraet-ai/docs/requirement-log/partial/requirements-20260413-204058.md`

- Blocks: persistent compression-preference storage, compression-settings TUI control, runtime threshold recalculation for model changes

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `/home/glados/Development/geraet-ai/docs/requirement-log/partial/requirements-20260413-204058.md` REQ-20260413-204058-002, REQ-20260413-204058-003, REQ-20260413-204058-003a | The earlier compression rules make token thresholds and the internal auto-threshold ratio the controlling trigger logic, with no user-facing global percentage selector. | Add a persistent global percentage slider as the primary interactive rule. Derive the effective token threshold from the active model's bounded compression capacity, or from the `120000`-token fallback base when capacity is unknown.

**Notes:**

- This requirement changes the precedence of compression-trigger selection during interactive use; it does not alter the preserved-content, reconstruction, latency, or no-loss constraints of the existing compression requirements.

- 2026-06-17 amendment: for performance, a model's advertised `max_input_tokens` is treated as an upper bound, not automatically as the compression capacity. The runtime uses `context_compression_threshold` when explicitly set; otherwise it uses `min(max_input_tokens, compressor.default_threshold)`, and falls back to `compressor.default_threshold` when capacity is unknown.

- The request defines a global control only. Per-model user-facing threshold sliders are out of scope for this requirement.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] A user can open the TUI control surface for compression settings and adjust a slider expressed as a percentage.

- [x] Selecting `50%` while the active model exposes a context capacity of `120000` tokens sets the effective compression threshold to `60000` tokens.

- [x] Selecting `50%` while the active model exposes a context capacity of `200000` tokens sets the effective compression threshold to `100000` tokens.

- [x] Selecting `50%` while the active model's context capacity is unknown sets the effective compression threshold to `60000` tokens, using the `120000`-token fallback base.

- [x] When a user changes the slider percentage and restarts the application, the same percentage is restored automatically.

- [x] When a user switches between models with different known bounded compression capacities, the selected percentage remains unchanged and the effective token threshold is recomputed for the newly active model.

- [x] Selecting `40%` while the active model advertises a `1048576`-token context and `compressor.default_threshold` is `120000` sets the effective compression threshold to `48000` tokens.

- [x] Interactive compression timing follows the persisted global percentage even if configuration files define a different explicit token threshold or an internal auto-threshold ratio.

### Rotaris - On-Demand Context Compression for All Running Agents (2026-05-13)

Original: `docs/requirement-log/done/requirements-20260513-compress-command.md` — document status: Complete

#### Description

Add a `/compress` slash command to the TUI input field that immediately triggers context compression for every currently running agent, bypassing all threshold checks and configuration limits. Context compression today is automatic and threshold-driven: `_maybe_compress_context` in `orchestrator/scheduler.py` only fires when the estimated token count exceeds a per-model or global threshold. There is no way for the user to force compression right now - the user must wait for the threshold to be reached organically. Users can find themselves in situations where they want to compress agent contexts immediately (e.g. before starting a costly phase, when they notice context drift, or when approaching a model's input ceiling) without changing any threshold configuration. The `/compress` command fills this gap. It is an ephemeral, one-shot user action that does not alter any persisted configuration.

#### Implementation Notes

**Requirements Document - `/compress` Slash Command:**

**Requirement ID:** REQ-20260513-190000

**REQ-20260513-190000-001 - Command registration:**

The command `/compress` MUST be registered in the builtin `SlashCommandRegistry` (created by `create_builtin_registry()` in `tui/widgets/slash_commands.py`) alongside the existing built-in commands.

- **Name:** `compress`

- **Description:** `"Force context compression for all running agents"`

- **Arguments:** none

**REQ-20260513-190000-002 - Message dispatch:**

Executing `/compress` MUST post a new `ForceCompress` message (dataclass, no fields) to the `RotarisTuiApp` via `app.post_message(ForceCompress())`. The message class MUST live in `tui/app.py` with the other TUI messages and follow the same dataclass pattern.

**REQ-20260513-190000-003 - Handler in RotarisTuiApp:**

`RotarisTuiApp` MUST handle `ForceCompress` with a method `on_force_compress`. The handler MUST:

1. Retrieve every currently-running `ChildTaskRecord` from the active `Scheduler` (or `ChildManager`), iterating only records in non-terminal states.

2. Call the compression path for each child, bypassing the token threshold check - i.e. call `_maybe_compress_context` with a flag or call a new dedicated `force_compress_child` helper that skips the `estimated_tokens < threshold` early-return.

3. Run compression for all eligible children concurrently (e.g. `asyncio.gather`).

4. Notify the user with a toast on completion: `"Compressing context for N agent(s)…"` (severity `"information"`).

5. If no agents are running, notify: `"No running agents to compress."` (severity `"warning"`).

**REQ-20260513-190000-004 - Threshold bypass:**

The forced compression path MUST NOT consult `context_compression_threshold`, `auto_threshold_ratio`, or `default_threshold`. It MUST proceed directly to `run_compressor(...)` regardless of current token count. All other compression parameters (`preserve_recent_turns`, `chars_per_token`) continue to apply as normal.

**REQ-20260513-190000-005 - No configuration changes:**

`/compress` MUST NOT modify any persisted configuration, session state, or threshold values. It is a one-shot runtime action only.

**REQ-20260513-190000-006 - User feedback:**

The user MUST receive clear feedback at each stage: Situation | Toast message | Severity Compression started | `"Compressing context for N agent(s)…"` | `information` All done | `"Context compressed for N agent(s)."` | `information` No running agents | `"No running agents to compress."` | `warning` Compression error for one child | `"Compression failed for <name>: <short reason>"` | `error`

**REQ-20260513-190000-007 - Command visibility:**

`/compress` MUST appear in the slash command autocomplete overlay (when that feature is active) with its description, identical to all other built-in commands.

**Testing Requirements:**

**REQ-20260513-190000-T001 - Unit: command registered:**

`create_builtin_registry()` returns a registry that contains `"compress"`.

**REQ-20260513-190000-T002 - Unit: ForceCompress posted:**

Calling `registry.execute("/compress", mock_app)` posts exactly one `ForceCompress` message to the app.

**REQ-20260513-190000-T003 - Unit: threshold bypass:**

`force_compress_child` (or the equivalent helper) does not call `_maybe_compress_context`'s threshold branch; `run_compressor` is invoked even when estimated tokens are 0.

**REQ-20260513-190000-T004 - Unit: no agents running:**

`on_force_compress` with zero active children shows the `"No running agents to compress."` warning toast and does not call `run_compressor`.

**REQ-20260513-190000-T005 - Integration: multiple agents compressed:**

With N > 1 mocked running children, `on_force_compress` calls compression N times and posts the completion toast mentioning N.

**REQ-20260513-190000-T006 - TUI workflow:**

Full workflow test via `app.run_test()` + `Pilot`: type `/compress`, press Enter, assert toast appears and no crash.

**REQ-20260513-190000-T007 - TUI no-crash (random interaction):**

Invoking `/compress` when no session is running must not raise an exception or leave the app in an undefined state.

**Implementation Notes:**

- Add `ForceCompress` dataclass to `tui/app.py` alongside `StopRun`, `PauseRun`, etc.

- Register the command in `create_builtin_registry()` in `tui/widgets/slash_commands.py`.

#### Acceptance Criteria

**Acceptance Criteria:**

AC-001 | Typing `/compress` and pressing Enter in the TUI input field triggers compression for every non-terminal child agent without any threshold configuration. AC-002 | If three agents are running, all three are compressed concurrently and a toast reports `"Context compressed for 3 agent(s)."` AC-003 | If no agents are running, a warning toast `"No running agents to compress."` is shown and no error is raised. AC-004 | No threshold values (`context_compression_threshold`, `auto_threshold_ratio`, `default_threshold`) are read or mutated. AC-005 | No persisted session state or config file is modified. AC-006 | `/compress` is case-insensitive (consistent with all other slash commands). AC-007 | The command is not forwarded to any agent as a chat message.
