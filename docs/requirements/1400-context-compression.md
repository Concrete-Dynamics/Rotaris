---
req-id: [SWR-1400, SWR-1401, SWR-1402, SWR-1403, SWR-1404, SWR-1405, SWR-1406, SWR-1407, SWR-1408, SWR-1409, SWR-1410, SWR-1411, SWR-1412, SWR-1413, SWR-1414, SWR-1415, SWR-1416, SWR-1417, SWR-1418, SWR-1419, SWR-1420, SWR-1421, SWR-1422, SWR-1423, SWR-1424, SWR-1425, SWR-1426, SWR-1427, SWR-1428, SWR-1429, SWR-1430, SWR-1431, SWR-1432, SWR-1433, SWR-1434, SWR-1435, SWR-1436, SWR-1437, SWR-1438, SWR-1439, SWR-1440, SWR-1441, SWR-1442, SWR-1443, SWR-1444, SWR-1445, SWR-1446, SWR-1447, SWR-1448]
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

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
