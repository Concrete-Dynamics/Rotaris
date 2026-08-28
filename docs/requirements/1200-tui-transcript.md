---
req-id: [SWR-1200, SWR-1201, SWR-1202, SWR-1203, SWR-1204, SWR-1205, SWR-1206, SWR-1207, SWR-1208, SWR-1209, SWR-1210, SWR-1211, SWR-1212, SWR-1213, SWR-1214, SWR-1215, SWR-1216, SWR-1217, SWR-1218, SWR-1219, SWR-1220, SWR-1221, SWR-1222, SWR-1223, SWR-1224, SWR-1225, SWR-1226, SWR-1227, SWR-1228, SWR-1229, SWR-1230, SWR-1231, SWR-1232, SWR-1233, SWR-1234, SWR-1235, SWR-1236, SWR-1237, SWR-1238, SWR-1239, SWR-1240, SWR-1241, SWR-1242, SWR-1243, SWR-1244, SWR-1245, SWR-1246, SWR-1247, SWR-1248, SWR-1249, SWR-1250, SWR-1251, SWR-1252, SWR-1253, SWR-1254, SWR-1255, SWR-1256, SWR-1257, SWR-1258, SWR-1259, SWR-1260, SWR-1261, SWR-1262, SWR-1263, SWR-1264, SWR-1265, SWR-1266, SWR-1267, SWR-1268, SWR-1269, SWR-1270, SWR-1271, SWR-1272, SWR-1273, SWR-1274, SWR-1279, SWR-1280, SWR-1281, SWR-1282, SWR-1283, SWR-1284]
status: approved
trace: required
test: required
title: "TUI Transcript & Rendering Performance"
---

# 1200-tui-transcript spec

## SWR-1200 — TUI Transcript & Rendering Performance
trace: optional
test: optional

Transcript rendering: streaming markdown and thinking blocks, lazy/virtual rendering, live diffs, copy reliability, transcript header, pre-run info pane, and TUI testing standards.

Derived requirements: [SWR-1285 — Deterministic lorem and mock-LLM test/demo data generators](1200-tui-transcript/SWR-1285-lorem-test-demo-generators.md)

## SWR-1201 — `tui/AGENTS.md` Documentation Reference
trace: optional
legacy-id: REQ-20260413-213222-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

`tui/AGENTS.md` must contain an explicit reference to the TUI testing standards document at `docs/textualize_testing_guide.md`.

## SWR-1202 — TUI Testing Standards File Location
trace: optional
test: optional
legacy-id: REQ-20260413-213222-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

The TUI testing standards must be defined in a dedicated markdown file placed under the documentation folder (`docs/textualize_testing_guide.md`).

## SWR-1203 — Test Category: Full User Workflow Paths
trace: optional
legacy-id: REQ-20260413-213222-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

TUI tests must cover complete user workflow paths from start to finish (A to Z) using the `Pilot` API via `app.run_test()`. These tests drive key presses (`pilot.press()`), widget clicks (`pilot.click("#id")`), and call `await pilot.pause()` after each action to flush pending messages before asserting state. They may be long-running and must validate the entire flow without shortcutting intermediate steps.

## SWR-1204 — Test Category: Alternative Workflow Paths
trace: optional
legacy-id: REQ-20260413-213222-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

TUI tests must cover alternative user workflow paths - scenarios where the user takes a different action than the primary path assumes (e.g., pressing `Ctrl+Q` mid-flow, opening the command palette via `Ctrl+P` instead of the default entry, submitting via `Ctrl+J` instead of `Enter`). Coverage must be as comprehensive as reasonably achievable. ◆1

## SWR-1205 — Test Category: Random Interaction Tests
trace: optional
legacy-id: REQ-20260413-213222-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

TUI tests must cover random interaction scenarios where a user navigates within a workflow and then triggers an unrelated or unexpected action (e.g., pressing an unmapped key, resizing the terminal, switching screens mid-task). These tests must assert that the app does not crash, does not raise `NoMatches`, and does not enter an undefined widget state. Use `await pilot.pause()` after the unexpected action to confirm the message queue drains cleanly.

## SWR-1206 — Test-First Approach
trace: optional
test: optional
legacy-id: REQ-20260413-213222-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

TUI tests must be written before verifying whether they pass. Implementation or fixes are only applied after the tests are in place. Snapshot baselines (`pytest --snapshot-update`) are committed only after visually confirming the initial output is correct.

## SWR-1207 — Test Coverage Update on New Workflow Paths
trace: optional
test: optional
legacy-id: REQ-20260413-213222-007
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

When a new user workflow path is introduced (new screen, new command palette entry, new key binding), tests for that path must be added to all three test categories (full workflow, alternative paths, random interactions) before the path is considered complete.

## SWR-1208 — Test Framework
trace: optional
legacy-id: REQ-20260413-213222-010
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

All TUI tests must use `pytest` with `pytest-asyncio` (`asyncio_mode = auto`). Tests run `RotarisTuiApp` (or the relevant screen/widget) via `app.run_test()` in headless mode. No `unittest.IsolatedAsyncioTestCase` unless an explicit justification is documented.

## SWR-1209 — Snapshot Testing for Visual Regressions
trace: optional
legacy-id: REQ-20260413-213222-011
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

Visual layout tests must use `pytest-textual-snapshot` (`snap_compare`). Baseline SVGs are stored in the project under `tests/`. Interactions before snapshot capture are passed via the `run_before` callback. Snapshots are updated with `pytest --snapshot-update` only after a deliberate visual review.

## SWR-1210 — Async Timing Safety
trace: optional
legacy-id: REQ-20260413-213222-012
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

Every TUI test must call `await pilot.pause()` after each simulated interaction (key press, click, reactive assignment) before making assertions. This ensures all pending Textual messages have been processed and reactive watchers have fired.

## SWR-1211 — Test Category Completeness
trace: optional
legacy-id: REQ-20260413-213222-008
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

All three test categories (full workflow, alternative paths, random interactions) are mandatory. No category may be omitted.

## SWR-1212 — Documentation Co-location
trace: optional
test: optional
legacy-id: REQ-20260413-213222-009
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-213222.md

The TUI testing standards document must reside at `docs/textualize_testing_guide.md`. It must not be embedded directly inside `tui/AGENTS.md`.

## SWR-1213 — Collapsible Thinking Block
legacy-id: FR-20260414-143201
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall display the model's internal thinking as a collapsible section within the interaction transcript.

## SWR-1214 — Thinking Visibility Toggle
legacy-id: FR-20260414-143202
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall allow users to expand and collapse the thinking section on demand.

## SWR-1215 — Thinking Animation
legacy-id: FR-20260414-143203
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall display an animation next to the thinking section while the model is processing.

## SWR-1216 — Completion State Rendering
legacy-id: FR-20260414-143204
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall stop active thinking animations after completion, and successful tool-call animations shall resolve in place to a static finished indicator without appending a separate completion row.

## SWR-1217 — Streaming Markdown Rendering
legacy-id: FR-20260414-143205
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall render model responses incrementally in Markdown format during streaming.

## SWR-1218 — Real-Time Output Display
legacy-id: FR-20260414-143206
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall display partial outputs in real time instead of waiting for the final response.

## SWR-1219 — Agent-Level Transcript Isolation
legacy-id: FR-20260414-143207
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall display only the outputs and processes of the currently active agent in the transcript.

## SWR-1220 — Orchestrator Visibility
legacy-id: FR-20260414-143208
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall display all calls, delegations, and reasoning processes of the orchestrator agent when it is the active level.

## SWR-1221 — Hierarchical Transcript Navigation
legacy-id: FR-20260414-143209
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall support navigation between agent levels, allowing users to switch context to child agents.

## SWR-1222 — Context-Specific Transcript Rendering
legacy-id: FR-20260414-143210
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall update the transcript view to show only the selected agent's interaction history upon navigation.

## SWR-1223 — UI Responsiveness
trace: optional
legacy-id: NFR-20260414-143211
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall ensure that streaming and UI updates occur with minimal latency (<200ms perceived delay).

## SWR-1224 — Animation Performance
trace: optional
legacy-id: NFR-20260414-143212
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall ensure that thinking animations do not degrade UI performance or responsiveness.

## SWR-1225 — Usability of Transcript
trace: optional
test: optional
legacy-id: NFR-20260414-143213
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall present transcript elements in a clear and intuitive hierarchical structure.

## SWR-1226 — Consistent Markdown Rendering
legacy-id: NFR-20260414-143214
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall ensure consistent and accurate Markdown rendering during streaming and after completion.

## SWR-1227 — Scalability of Transcript View
trace: optional
legacy-id: NFR-20260414-143215
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall support large transcripts without performance degradation.

## SWR-1228 — State Consistency
trace: optional
legacy-id: NFR-20260414-143216
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall maintain consistent UI state when switching between agent levels.

## SWR-1229 — Visual Clarity of Thinking State
trace: optional
legacy-id: NFR-20260414-143217
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall clearly distinguish between “thinking,” “streaming,” and “completed” states.

## SWR-1230 — Accessibility Compliance
status: draft
legacy-id: NFR-20260414-143218
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall ensure that collapsible sections and animations are accessible (e.g., keyboard navigation, screen readers).

## SWR-1231 — Maintainability
trace: optional
test: optional
legacy-id: NFR-20260414-143219
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall structure transcript rendering logic to allow easy extension for additional agent layers.

## SWR-1232 — Reliability of Streaming
trace: optional
legacy-id: NFR-20260414-143220
date: 2026-04-14
source: docs/requirement-log/done/requirements-202604141613000.md

The system shall ensure that partial outputs are delivered and rendered without loss or duplication.

## SWR-1233 — System shall compute a line-based unified diff from the before and after file contents at the moment each file-write tool commits its change. The diff must be computed in-memory with no additional disk I/O.
legacy-id: REQ-20260511-DIFF-001
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1234 — Diff text shall use a line-prefix convention: deletions prefixed with `- ` in red colour, additions prefixed with `+ ` in green colour, context lines prefixed with ` ` in dim grey. Each prefix line shall be preceded by `[line_number]` (numeric only, no file path repetition).
legacy-id: REQ-20260511-DIFF-002
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1235 — Each diff block shall begin with a header line identifying the file path, using Rich-styled bold text (e.g., `[bold]@ file/path/to/target.ext @[/bold][green] +8 -3[/green]`).
legacy-id: REQ-20260511-DIFF-003
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1236 — Diff data shall be classified as user-only UI data. It must not be stored in the ordinary model-visible transcript stream and must not be represented as ordinary `role/content` transcript text.
trace: optional
test: optional
legacy-id: REQ-20260511-DIFF-004
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1237 — ChatPanel shall render the diff as an expanded colour-coded block directly beneath the triggering observation line. No collapsing, no click-to-toggle interaction - the block is visible by default.
legacy-id: REQ-20260511-DIFF-005
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1238 — Maximum rendered diff lines per write shall be 50 (counting all `+` and `-` lines combined). If the diff exceeds 50 lines, render only the first 50 and append `[dim]… +N more lines, diff truncated[/dim]` at the end, where N equals the remaining uncaptured lines.
legacy-id: REQ-20260511-DIFF-006
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1239 — The diff rendering shall cover all file-write tool paths uniformly: write_file (engine), haet_edit (HAET engine). (SDK file_editor removed in v0.60.0 — no longer applicable.)
legacy-id: REQ-20260511-DIFF-007
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1240 — All write operations - create, edit, overwrite, insert, undo - shall receive diff rendering treatment. Create operations with no before-state shall render with only addition lines and a `[Created]` tag. Undo operations shall render the restoration diff (lines reverted appear as removals).
legacy-id: REQ-20260511-DIFF-008
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: Medium



## SWR-1241 — Failed writes (errors, validation failures, binary detection) shall carry no diff block. They retain existing error-only rendering in the transcript.
legacy-id: REQ-20260511-DIFF-009
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: Medium



## SWR-1242 — If session recovery or history replay is supported for this feature, the system shall persist enough diff data to reconstruct the user-visible transcript after reload, but that persisted representation must remain separate from model-visible transcript content and must not be consumed by prompt building, summarization, or compression.
trace: optional
test: optional
legacy-id: REQ-20260511-DIFF-010
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1243 — Diff data shall be excluded from continuation-context assembly for follow-up tasks, from child-summary generation inputs, from compressor transcript extraction, and from any prompt text sent to an LLM.
trace: optional
legacy-id: REQ-20260511-DIFF-011
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1244 — Diff data shall be excluded from token estimation, token-usage displays, context-threshold warnings, compression-trigger calculations, and any other context-size heuristics shown to the user or used by the runtime.
trace: optional
legacy-id: REQ-20260511-DIFF-012
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1245 — The presence or absence of the diff-rendering feature shall not change the model's effective conversational context for the same run. Enabling this feature is a visibility enhancement only, not a prompt-content change.
trace: optional
test: optional
legacy-id: REQ-20260511-DIFF-013
date: 2026-05-11
source: docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md
priority: High



## SWR-1246 — Focused agent identity in transcript top bar
legacy-id: REQ-20260513-203000-001
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

The transcript top bar MUST render a centered focus badge that displays the currently inspected agent name (or compact label) whenever an agent is selected via keyboard navigation or mouse selection.

## SWR-1247 — Arrow-key navigation updates header immediately
legacy-id: REQ-20260513-203000-002
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

Up/Down arrow navigation across the logical agent list MUST update the transcript top-center focus badge in the same interaction cycle as transcript switching. The badge MUST always reflect the same agent whose transcript is currently shown.

## SWR-1248 — Focused agent elapsed runtime display
legacy-id: REQ-20260513-203000-003
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

The transcript top-center badge MUST include elapsed wall-clock runtime for the focused agent. - For running states, elapsed time is live and continues increasing. - For terminal states, elapsed time is frozen at final duration.

## SWR-1249 — State-based color coding
legacy-id: REQ-20260513-203000-004
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

The focused-agent badge MUST be color-coded by focused agent state using semantic status colors, including at minimum: - running - queued/waiting - succeeded - failed - cancelled/blocked Color mapping may follow existing semantic theme tokens but MUST remain visually distinct from plain transcript text.

## SWR-1250 — Empty-focus fallback
legacy-id: REQ-20260513-203000-005
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

If no agent is available/selected, the top-center header MUST show a neutral placeholder (for example, "No agent selected") and MUST NOT raise a UI exception.

## SWR-1251 — Transcript-only chrome, no prompt contamination
legacy-id: REQ-20260513-203000-006
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

This focused-agent header is a user-facing TUI artifact only. Agent label and elapsed display text MUST NOT be injected into model-visible prompt continuation, transcript event payloads, compression inputs, or summarization context.

## SWR-1252 — Unit: focus selection drives header label
trace: optional
legacy-id: REQ-20260513-203000-T001
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

Given a focus change event, the top-center header label updates to the selected agent identifier.

## SWR-1253 — Unit: elapsed formatting for focused running agent
trace: optional
legacy-id: REQ-20260513-203000-T002
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

For a running focused agent with known start timestamp, displayed elapsed text increases between refresh ticks.

## SWR-1254 — Unit: elapsed freeze on terminal state
trace: optional
legacy-id: REQ-20260513-203000-T003
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

When focused agent transitions to a terminal state, displayed elapsed stops increasing.

## SWR-1255 — Unit: color mapping by state
trace: optional
legacy-id: REQ-20260513-203000-T004
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

Focused header applies expected style token/class for running, waiting, succeeded, failed, and cancelled/blocked states.

## SWR-1256 — TUI workflow: arrow-key traversal
trace: optional
legacy-id: REQ-20260513-203000-T005
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

In a Textual `app.run_test()` flow with multiple agents, pressing Up/Down changes focused agent, transcript body, and top-center header in lockstep.

## SWR-1257 — TUI resilience: no focus available
trace: optional
legacy-id: REQ-20260513-203000-T006
date: 2026-05-13
source: docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md

With zero agents present, rendering the top-center header shows fallback placeholder and does not raise `NoMatches` or crash on navigation input.

## SWR-1258 — When no session is active, the info pane must show ALL configured MCP servers from `config.mcp_servers`, regardless of persona
legacy-id: REQ-20260521-PRERUN-001
date: 2026-05-21
source: docs/requirement-log/done/requirements-20260521-prerun-info-pane.md
priority: High



## SWR-1259 — Stdio MCP servers whose command is not found on PATH must be displayed as unavailable (dimmed) in the info pane
legacy-id: REQ-20260521-PRERUN-002
date: 2026-05-21
source: docs/requirement-log/done/requirements-20260521-prerun-info-pane.md
priority: High



## SWR-1260 — HTTP/SSE MCP servers must be shown as active in pre-run state (no connection check without a live agent)
legacy-id: REQ-20260521-PRERUN-003
date: 2026-05-21
source: docs/requirement-log/done/requirements-20260521-prerun-info-pane.md
priority: Medium



## SWR-1261 — When no session is active, the info pane must show ALL public built-in tools from `ALLOWED_PUBLIC_TOOL_NAMES`, sorted alphabetically
legacy-id: REQ-20260521-PRERUN-004
date: 2026-05-21
source: docs/requirement-log/done/requirements-20260521-prerun-info-pane.md
priority: High



## SWR-1262 — Token stats, context-window size, and per-agent metrics must be hidden in pre-run state (no meaningful data to display)
legacy-id: REQ-20260521-PRERUN-005
date: 2026-05-21
source: docs/requirement-log/done/requirements-20260521-prerun-info-pane.md
priority: Medium



## SWR-1263 — The Warnings section must be hidden in pre-run state when there are no warnings
legacy-id: REQ-20260521-PRERUN-006
date: 2026-05-21
source: docs/requirement-log/done/requirements-20260521-prerun-info-pane.md
priority: Low



## SWR-1264 — The info pane must be populated from config immediately on screen mount, before any user interaction
legacy-id: REQ-20260521-PRERUN-007
date: 2026-05-21
source: docs/requirement-log/done/requirements-20260521-prerun-info-pane.md
priority: Medium



## SWR-1265 — Transcript Right-Click Copy
legacy-id: REQ-20260522-001
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-152500.md
priority: High

When the user selects text inside the main transcript panel and right-clicks within that panel, the system shall copy exactly the selected text to the system clipboard.

## SWR-1266 — Clipboard Result Must Be Observable
legacy-id: REQ-20260522-002
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-152500.md
priority: High

The transcript copy interaction shall be considered successful only when the copied text is available to paste into another local application or terminal input on the same machine.

## SWR-1267 — Cross-Platform Clipboard Support
legacy-id: REQ-20260522-003
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-152500.md
priority: High

The transcript right-click copy flow shall work in the project's supported desktop environments on Windows, macOS, and Linux without requiring users to install unrelated platform-specific clipboard tools from another operating system family.

## SWR-1268 — Accurate Failure Feedback
legacy-id: REQ-20260522-004
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-152500.md
priority: Medium

If the system cannot complete transcript copy, it shall present an explicit failure message that matches the active platform and describes the actual limitation rather than suggesting irrelevant tools.

## SWR-1269 — No Interaction Regression in Transcript Panel
trace: optional
legacy-id: REQ-20260522-005
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-152500.md
priority: Medium

Enabling reliable right-click copy shall not break existing transcript selection, clickable-link behavior, or left-click reasoning-toggle behavior.

## SWR-1270 — Auth and Recovery Text Remains Copyable
legacy-id: REQ-20260522-006
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-152500.md
priority: Medium

Any authentication code, URL-adjacent token, error excerpt, or other plain text rendered in the transcript shall remain copyable through the same transcript right-click copy interaction.

## SWR-1271 — In-Memory Event Cap
legacy-id: FR-TRANS-001
date: 2026-06-10
source: docs/requirement-log/done/requirements-20260610-tui-lazy-transcript.md

`SessionState.transcript_events` SHALL be capped at a configurable maximum (default 100). When exceeded, oldest events are evicted to a disk-backed archive under `<session_dir>/state/transcript_archive.jsonl` and replaced with a `{"role":"page","offset":N}` sentinel.

## SWR-1272 — Scroll-Up Loading Trigger
legacy-id: FR-TRANS-002
date: 2026-06-10
source: docs/requirement-log/done/requirements-20260610-tui-lazy-transcript.md

When the user scrolls the ChatPanel above the sentinel line, the TUI SHALL asynchronously load the previous page of events from the archive and prepend them to the in-memory transcript.

## SWR-1273 — Archive Format
legacy-id: FR-TRANS-003
date: 2026-06-10
source: docs/requirement-log/done/requirements-20260610-tui-lazy-transcript.md

The transcript archive SHALL use JSONL format (one event per line) for O(1) append and page-based random access. Each page SHALL contain up to 50 events.

## SWR-1274 — Disk I/O Off Main Thread
legacy-id: FR-TRANS-004
date: 2026-06-10
source: docs/requirement-log/done/requirements-20260610-tui-lazy-transcript.md

Archive reads SHALL run via `asyncio.to_thread` or a worker thread to avoid blocking the TUI event loop.

## SWR-1279 — Virtualized Rendering
legacy-id: REQ-20260629-001
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-virtual-transcript-renderer.md

The transcript pane renders from a block store and only materializes visible blocks plus buffer rows.

## SWR-1280 — Stable Markdown Cache
legacy-id: REQ-20260629-002
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-virtual-transcript-renderer.md

Stable transcript blocks are cached by render-affecting fingerprint, width, and theme.

## SWR-1281 — Volatile Stream Handling
legacy-id: REQ-20260629-003
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-virtual-transcript-renderer.md

Live streaming previews remain bounded and are not stored as stable rendered blocks.

## SWR-1282 — Bounded Memory
legacy-id: REQ-20260629-004
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-virtual-transcript-renderer.md

Rendered block and markdown source caches have internal size limits.

## SWR-1283 — Behavior Compatibility
legacy-id: REQ-20260629-005
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-virtual-transcript-renderer.md

Follow mode, paused scroll anchoring, archive-page loading, queued prompts, links, and reasoning toggles remain supported.

## SWR-1284 — Regression Coverage
trace: optional
legacy-id: REQ-20260629-006
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-virtual-transcript-renderer.md

Tests cover fingerprint invalidation, bounded rendering, streaming volatility, and existing TUI transcript behavior.

## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### TUI Testing Standards & Documentation Reference (2026-04-13)

Original: `docs/requirement-log/done/requirements-20260413-213222.md` — document status: Complete (normative IDs retained here; prose and executable coverage consolidated

#### Description

The project enforces a structured TUI (Textual UI) testing standard that must be formally documented in a dedicated markdown file under the documentation folder (`docs/textualize_testing_guide.md`). `tui/AGENTS.md` must reference this file. The standard defines three mandatory test categories - full user workflow tests, alternative workflow path tests, and random interaction tests - and mandates a test-first approach. All TUI tests use the Textual `Pilot` API via `app.run_test()` in headless mode with `pytest` + `pytest-asyncio` (`asyncio_mode = auto`). Whenever new user workflow paths are introduced, coverage across all three categories must be updated accordingly.

#### Implementation Notes

**Requirements Document:**

into the testing guide and workflow suite) > **Consolidation note:** Keep this file as the stable requirement-ID source. The living prose > standard is consolidated in `docs/textualize_testing_guide.md`, and the executable traceability > anchor is `tests/unit/test_tui_workflows.py`.

**Resolution Items:**

**◆1** `REQ-20260413-213222-004` - [RESOLVED] No minimum count is imposed. Alternative paths are determined per workflow based on the number of distinct key bindings, command palette entries, and screen transitions available at each step. At minimum, every non-default entry point to a screen or action must have one alternative path test.

#### Acceptance Criteria

**Constraints:**

### TUI Streaming Transcript & Thinking Rendering (2026-04-14)

Original: `docs/requirement-log/done/requirements-202604141613000.md` — document status: Complete

#### Description

Historical requirement entry normalized from the requirement log.

#### Implementation Notes

**Requirements Document:**

**Project Name:** Interactive Agent Transcript UI **Generated On:** 2026-04-14 14:32 (UTC)

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Rotaris - Visual Transcription of File Edits (2026-05-11)

Original: `docs/requirement-log/partial/requirements-20260511-live-diff-transcript.md` — document status: Partial

#### Description

Users running the terminal UI need visual insight into what file modifications agents are performing, streamed inline in the transcript pane. After each file-write tool (write_file, haet_edit, SDK file_editor) commits a change, the system must render a colour-coded, side-by-side line diff that mirrors the familiar `git diff` aesthetic: green for added lines, red for removed lines, with the file header and line-number prefixes. The diff appears as a block appended to the agent's activity stream in the ChatPanel - no overlays, no secondary panes, no blocking gates. All operations are treated uniformly regardless of edit mode (create, edit, overwrite, undo). Maximum rendered output is capped at 50 diff lines per write, with a soft truncation message if exceeded. The diff is strictly a user-facing TUI artifact: it must not be injected into model-visible transcript history, prompt continuation context, summarization inputs, compression inputs, or token-estimation logic.

**Problem being solved:**

When agents write files, the TUI transcript currently shows only a terse success/error line (e.g., `✓ write file` or `✗ write file: error`). Users have no visibility into _what_ was changed - which lines were added, which removed, what the new content looks like. This is the same opacity problem that Aider, Claude Code, and VS Code solved by surfacing diffs directly in the UI. Users expect to watch the editing unfold character by character.

**Current behaviour:**

- `WriteFileObservation` carries `path`, `lines_changed`, `success`, and a `content_hash`, but no text diff.

- `describe_sdk_event()` in `live_activity.py` maps `ActionEvent` to `activity_text: "{tool}: {summary}"` - extremely condensed, no content detail.

- `ChatPanel` (extending Textual `RichLog`) renders Markdown, agent text, and tool observations - it supports Rich spans, colours, and styled text natively.

- `FileToolEngine.write()` retains both the before-state (from the read ledger) and after-state (new content) internally; the diff is computable but never exposed.

- HAET (`haet_edit`) produces a completely separate diff-like computation in `HaetEngine.apply_patch()`, also with no transcript exposure.

- `session.transcript_events` is not just a UI log. It is reused by continuation-context assembly, child-summary generation, compression, and fallback token estimation. Anything serialized there can influence what the model sees and how context pressure is estimated.

- FR-6-011 prohibits any confirm/reject gate for edits, reinforcing that transparency must be informational-only.

**What needs to change:**

1. Compute a stack-based coloured diff (additions → green, deletions → red) from the before/after file contents at write time.

2. Make the diff available to the TUI as user-only display data, separated from model-visible transcript content and any other prompt-building or token-accounting inputs.

3. Render the diff block in the `ChatPanel` transcript as an inline block immediately following the tool completion event - same rendering lane as code output and inline report artifacts.

4. Persist enough user-only diff state to allow transcript replay after session reload, without reclassifying the diff as ordinary transcript content.

5. Cap the rendered output at 50 diff lines per write. Excess lines are silently elided with a truncation indicator text.

6. Apply the diff uniformly to all file-write tool results (write_file, haet_edit), regardless of operation type (create, edit, overwrite, undo). (The SDK file_editor tool was removed in v0.60.0; it no longer applies.)

7. Exclude diff data from continuation prompts, summarization, compressor inputs, fallback token estimation, token-usage displays, and any other model-facing context assembly.

#### Implementation Notes

**Requirements - Live File Edit Diffs in Transcript:**

**Dependencies:**

- Depends on: `WriteFileObservation` and `FileToolEngine` infrastructure (already exists in `src/rotaris_core/tools/`)

- Depends on: `ChatPanel` transcript rendering (already exists in `src/rotaris_core/tui/widgets/chat_panel.py`)

- Depends on: separation between user-visible transcript rendering and model-visible transcript content in session/runtime event handling

- Depends on: continuation-context assembly in `src/rotaris_core/session/task_context.py`

- Depends on: summary generation input shaping in `src/rotaris_core/orchestrator/summary_agent.py`

- Depends on: compressor transcript extraction in `src/rotaris_core/agents/compressor.py`

- Depends on: fallback token estimation and warning logic in `src/rotaris_core/tui/view_model.py`

- Depends on: HAET engine diff computation in `src/rotaris_core/haet/engine.py`

- Blocked by: none (can be implemented as a horizontal slice)

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution FR-6-002 (req-20260413-000004-tui-core) | Existing requirement does not mention diff rendering in the transcript panel | Supplemented: FR-6-002 now implicitly covers colour-coded diff blocks alongside code output and report artifacts. No contradiction - new capability extends existing render contract. FR-6-011 (req-20260413-000004-tui-core) | Prohibits confirm/reject gates for edits | Reinforced: diff rendering is strictly informational, post-write only, with zero blocking impact on execution flow. `WriteFileObservation.lines_changed` (current) | Already tracks a numeric count but no human-readable detail | Extended: diff rendering uses the existing `lines_changed` as the statistical basis for `+N -M` in the header. Continuation/context reuse of `session.transcript_events` (current runtime behaviour) | Serializing diff text into ordinary transcript events would leak user-only UI content into follow-up prompts, summaries, and compressor inputs | Resolved by requiring a separate user-only representation for diff data and explicitly excluding it from all model-visible transcript assembly. Fallback token estimation in TUI (current runtime behaviour) | Counting diff text as transcript content would inflate displayed token/context estimates and could trigger misleading warnings | Resolved by explicitly excluding diff data from token estimates, token displays, compression heuristics, and context-threshold warnings.

**Notes:**

Assumptions made:

1. Rich spans in `ChatPanel` already support the required colours (`green`, `red`, `grey`/dim) - no Colour scheme redesign needed (Terminal colour limitations handled within the existing light/dark theme system from `requirements-20260503-style-guided-theme.md`).

2. A 50-line diff cap per individual write is sufficient for typical agent edits. Bulk file rewrites that produce huge diffs will trigger the truncation indicator - acceptable for v1.

3. User-visible diff history may still need persistence for session replay, but that persistence must remain semantically separate from ordinary transcript text even if it lives in the same snapshot file.

4. HAET snapshot-validation mismatches (where `haet_edit` returns a `snapshot_mismatch` error with recovery candidates) do not produce diffs, as per REQ-20260511-DIFF-009 - the write did not succeed.

5. Syntax highlighting within diff lines is **out of scope**. Content is rendered as plain text with colour-coded prefixes only. This avoids pulling in external lexer dependencies and keeps the feature isolated.

6. This requirement treats any user-only diff artifact as non-authoritative for agent reasoning. If the product later needs the model to reason about prior edits, that must happen through separately-authored ordinary transcript text, not by reusing the TUI diff artifact.

Out of scope (deferred):

- Character-level inline highlighting within diff lines (only whole-line colour change)

- Side-by-side gutter view (requires a new Textual widget/layout)

- Real-time diff streaming while the agent builds the edit string

- Configurable thresholds (cap size, colour selection, line-number visibility)

- Integration with Git to show diffs relative to HEAD (separate concern from agent-transparency)

- Reusing TUI diff artifacts as model context, summary material, or compression input

**Innovation Suggestion:**

Consider storing diffs as **structured user-only UI artifacts** rather than raw rendered text. A representation such as `diff_entries = [{op, path, line_no, content}]` would let the TUI choose its own presentation while still preserving the hard boundary between user-visible display data and model-visible transcript content. This also keeps future UI experiments possible without reopening the prompt-safety question.

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] When an agent performs `write_file` or `haet_edit`, the transcript shows a coloured block with green lines (prefixed `+`) for added content and red lines (prefixed `-`) for removed content.

- [ ] Each line of the diff displays the relevant line number in square brackets before the prefix and content (e.g., `[42]- old content` or `[43]+ new content`).

- [ ] The diff header displays the file path in bold alongside `+N -M` statistics.

- [ ] If a diff exceeds 50 `+/-` lines, exactly 50 lines render followed by the truncation indicator text (e.g., `… +12 more lines, diff truncated`).

- [ ] A newly created file (command: `create`) shows only green `+` addition lines with a `[Created]` tag instead of a Modified header.

- [ ] Undo operations render the restoration diff (previous content lines shown as additions with `+`).

- [ ] A failed write produces no diff block - only the existing error message appears.

- [ ] The diff block renders correctly in the existing `ChatPanel` RichLog without requiring layout changes to the Textual application.

- [ ] Reloading a crashed or paused session reproduces the same diff blocks in the user-visible transcript history without inserting those blocks into ordinary `session.transcript_events` content.

- [ ] Concurrent or sequential file edits in the same agent turn each produce their own independently-rendered diff blocks, appearing in chronological order.

- [ ] A follow-up task started after one or more visible file diffs does not include diff line text in its continuation prompt unless the agent separately described the edit in ordinary agent-visible text.

- [ ] Child-summary generation and compressor transcript extraction ignore diff payloads and produce the same prompt inputs whether diff rendering is enabled or disabled.

- [ ] For the same run, fallback token estimation and context-threshold warnings remain unchanged whether user-visible diff rendering is enabled or disabled.

- [ ] The model-visible content for a file-write observation remains limited to the normal tool/action/result content and does not include the rendered diff block.

### Rotaris - Focused Agent Identity + Runtime in Transcript Top Bar (2026-05-13)

Original: `docs/requirement-log/done/requirements-20260513-focused-agent-transcript-header.md` — document status: Complete

#### Description

When the user navigates agents with arrow keys, the transcript header (top center area above the transcript content) must show which agent is currently being inspected and how long that agent has been running. The header label must be color-coded by agent state so focus and runtime are readable at a glance. Agent focus already changes as users traverse the agent list, and transcript content follows the selected agent history. However, the transcript chrome does not currently provide a strong, always-visible indicator of:

- which logical agent is currently in inspection focus

- how long that focused agent has been running

- whether that focused agent is still running or is terminal

This requirement adds a dedicated top-center transcript header indicator so focus state is explicit without requiring users to cross-reference the right-side list.

#### Implementation Notes

**Requirements Document - Focused Agent Transcript Header:**

**Requirement ID:** REQ-20260513-203000 **Completion Notes:** Implemented as a centered global `TopBar` focused-agent badge driven by the existing TUI focus state. The badge shows focused agent identity, live/frozen elapsed runtime, and semantic state coloring without writing badge text into transcripts or model-facing context.

**REQ-20260513-203000-001 - Focused agent identity in transcript top bar:**

The transcript top bar MUST render a centered focus badge that displays the currently inspected agent name (or compact label) whenever an agent is selected via keyboard navigation or mouse selection.

**REQ-20260513-203000-002 - Arrow-key navigation updates header immediately:**

Up/Down arrow navigation across the logical agent list MUST update the transcript top-center focus badge in the same interaction cycle as transcript switching. The badge MUST always reflect the same agent whose transcript is currently shown.

**REQ-20260513-203000-003 - Focused agent elapsed runtime display:**

The transcript top-center badge MUST include elapsed wall-clock runtime for the focused agent.

- For running states, elapsed time is live and continues increasing.

- For terminal states, elapsed time is frozen at final duration.

**REQ-20260513-203000-004 - State-based color coding:**

The focused-agent badge MUST be color-coded by focused agent state using semantic status colors, including at minimum:

- running

- queued/waiting

- succeeded

- failed

- cancelled/blocked

Color mapping may follow existing semantic theme tokens but MUST remain visually distinct from plain transcript text.

**REQ-20260513-203000-005 - Empty-focus fallback:**

If no agent is available/selected, the top-center header MUST show a neutral placeholder (for example, "No agent selected") and MUST NOT raise a UI exception.

**REQ-20260513-203000-006 - Transcript-only chrome, no prompt contamination:**

This focused-agent header is a user-facing TUI artifact only. Agent label and elapsed display text MUST NOT be injected into model-visible prompt continuation, transcript event payloads, compression inputs, or summarization context.

**Testing Requirements:**

**REQ-20260513-203000-T001 - Unit: focus selection drives header label:**

Given a focus change event, the top-center header label updates to the selected agent identifier.

**REQ-20260513-203000-T002 - Unit: elapsed formatting for focused running agent:**

For a running focused agent with known start timestamp, displayed elapsed text increases between refresh ticks.

**REQ-20260513-203000-T003 - Unit: elapsed freeze on terminal state:**

When focused agent transitions to a terminal state, displayed elapsed stops increasing.

**REQ-20260513-203000-T004 - Unit: color mapping by state:**

Focused header applies expected style token/class for running, waiting, succeeded, failed, and cancelled/blocked states.

**REQ-20260513-203000-T005 - TUI workflow: arrow-key traversal:**

In a Textual `app.run_test()` flow with multiple agents, pressing Up/Down changes focused agent, transcript body, and top-center header in lockstep.

**REQ-20260513-203000-T006 - TUI resilience: no focus available:**

With zero agents present, rendering the top-center header shows fallback placeholder and does not raise `NoMatches` or crash on navigation input.

**Dependencies:**

- Depends on: `src/rotaris_core/tui/widgets/top_bar.py`

- Depends on: `src/rotaris_core/tui/screens/main.py`

- Depends on: `src/rotaris_core/tui/widgets/agent_status.py`

- Depends on: `src/rotaris_core/tui/styles/app.tcss`

- Depends on: `docs/requirement-log/done/requirements-202604141613000.md`

- Depends on: `docs/requirement-log/partial/requirements-20260413-204058.md`

#### Acceptance Criteria

**Acceptance Criteria:**

AC-001 | When focus changes to another agent via arrow keys, the top-center transcript header immediately shows that agent label. AC-002 | The displayed label in the top-center header always matches the transcript currently visible in the chat pane. AC-003 | While the focused agent is running, the elapsed time in the header updates live and increases over time. AC-004 | When the focused agent reaches a terminal state, the elapsed time stops increasing and remains at final duration. AC-005 | Header color changes according to focused agent state (running vs success vs failure/cancelled/waiting). AC-006 | If there are no agents, the header shows a neutral placeholder and the app remains stable. AC-007 | Header text is not included in model-facing transcript assembly, context compression content, or summarization input.

### Rotaris - Pre-run Info Pane: All MCP Servers & Tools (2026-05-21)

Original: `docs/requirement-log/done/requirements-20260521-prerun-info-pane.md` — document status: Complete

#### Description

When the TUI is open but no run has been started (no active session), the info pane previously showed a generic idle message: _"No session info yet. Info will appear here once the session starts."_ The user wants the pre-run info pane to display **all configured MCP servers** (with live command-availability checking for stdio servers) and **all available built-in tools** so they can see at a glance what is working before submitting a task.

**Previous behaviour:**

- `InfoPane` showed a static placeholder until `session is not None`.

- The view model built MCP server and tool lists only when a session existed and a focused persona was known.

- Token statistics (`cum tok | tool calls | compr`) were rendered unconditionally once any data was present, resulting in a noisy `~0 tokens` row before any LLM call.

**What changed:**

1. **`view_model.py`** - `build_screen_view_model()`:

- Added `_check_mcp_server_available(server_cfg)` helper that returns `"active"` for HTTP/SSE servers (no connection check without a live agent) and performs a `shutil.which(resolved_command)` check for stdio servers, returning `"active"` or `"unavailable"`.

- When `session is None`: MCP servers section now shows **all** `config.mcp_servers` (not filtered by persona) with availability status from the helper.

- When `session is None`: Tools section now shows **all** `ALLOWED_PUBLIC_TOOL_NAMES` sorted alphabetically, each with `"used": False`.

- Added `info_kwargs["has_session"] = True` when `session is not None`.

2. **`info_pane.py`** - `InfoPane`:

- Added `self.has_session: bool = False` attribute (populated via `update_info`).

- Wrapped token stats (`cum tok | tool calls | compr`), context-window tokens, and per-agent metrics inside `if self.has_session:` - they are hidden in pre-run state.

- Tools section: in pre-run state (`not self.has_session`), all tools are shown in normal (non-dimmed) style without the used/unused checkmark indicator. During/after a run the existing green-checkmark behaviour is preserved.

- Warnings section: only rendered when `self._warnings or self.has_session` to avoid a distracting "Warnings / No warnings" footer in pre-run state.

3. **`screens/main.py`** - `MainScreen`:

- Added `on_mount` that calls `app.request_widget_refresh()` so the initial pre-run state is populated from config immediately when the screen is mounted, before any session interaction.

#### Implementation Notes

**Requirements Document:**

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Rotaris - Transcript Right-Click Copy Reliability (2026-05-22)

Original: `docs/requirement-log/done/requirements-20260522-152500.md` — document status: Complete

#### Description

The transcript section currently allows mouse-based text selection, but right-click copy does not reliably place the selected transcript text onto the system clipboard. This breaks a core transcript usability path, especially for copying one-time authentication codes, error output, file paths, and model responses. The system must make right-click copy in the transcript panel work reliably, with accurate feedback, across supported desktop platforms.

**Problem being solved:**

Users can visually select transcript text but cannot depend on right-click copy to move that selection into the system clipboard. This creates friction in normal debugging and reading workflows and undermines the existing requirement that transcript text be mouse-selectable for copying. The issue is particularly harmful for authentication and recovery flows where the transcript may display values that must be copied exactly.

**Current behaviour:**

- The canonical transcript-selection requirement already exists in `requirements-20260418-143500.md` as `REQ-20260418-144012-005`.

- The transcript widget (`src/rotaris_core/tui/widgets/chat_panel.py`) implements mouse selection highlighting and a right-click handler intended to copy the selected text.

- The application clipboard helper (`src/rotaris_core/tui/app.py`) currently attempts a limited set of external clipboard mechanisms and then falls back to terminal clipboard escape behavior.

- The current user-visible failure messaging is Unix-centric and does not describe a Windows-native recovery path.

- In practice, the transcript section still fails the end-user expectation: selecting text and right-clicking does not reliably produce a usable clipboard result.

**What needs to change:**

1. Selected transcript text must be copyable via right-click in the transcript panel.

2. Clipboard success must be defined by the selected text becoming available to paste in the local desktop session, not merely by attempting a best-effort terminal escape.

3. The transcript copy interaction must work in supported Windows, macOS, and Linux environments.

4. Failure feedback must be accurate for the active platform and must not suggest Linux-only remedies to Windows users.

5. Transcript copy behavior must remain compatible with existing transcript interactions such as selection, link clicking, and reasoning-toggle clicks.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `REQ-20260418-144012-002` (Auth Prompts in Transcript Panel), `REQ-20260418-144012-005` (Text Selection in Transcript Panel), `FR-6-002` (Chat/Transcript Panel)

- Blocks: Reliable in-TUI authentication copy flows, transcript usability parity across supported desktop platforms, regression tests for transcript selection/copy behavior

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `REQ-20260418-144012-005` in `requirements-20260418-143500.md` | The earlier requirement states that transcript text must support mouse-based selection, but it does not fully pin the end-to-end clipboard-success contract for the transcript's right-click copy interaction. | This document refines that contract: transcript selection is not functionally complete unless selected transcript text can be copied through the transcript interaction model with accurate platform-aware feedback.

**Notes:**

- This report is treated as a bug against an existing transcript usability requirement, not as a net-new feature request.

- The observed user report came from a Windows environment, so Windows clipboard reliability is treated as first-class rather than as an optional follow-up.

- The current implementation already exposes a transcript right-click copy path; the defect is that the user-visible contract is not being met reliably.

- Implementation note (2026-05-22): The clipboard helper now probes Windows `clip`/`clip.exe` before Unix/macOS tools, and transcript-related failure messages are platform-aware across the shared copy surfaces.

- Out of scope: adding a new global clipboard manager, adding transcript export, or redesigning terminal emulator context menus.

- Innovation suggestion: the product should keep the right-click interaction, but a parallel keyboard copy path for selected transcript text would reduce dependence on terminal mouse-event quirks and improve accessibility.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] A user selects plain text in the transcript panel, right-clicks inside the transcript panel, and can paste the exact selected text into another application.

- [x] The same transcript right-click copy flow succeeds on Windows without requiring `xclip`, `xsel`, or `wl-copy`.

- [x] If transcript copy cannot be completed, the UI shows an error that accurately reflects the active platform and does not recommend Linux-only clipboard tools to Windows users.

- [x] Right-click copy does not trigger left-click transcript actions such as opening links or toggling reasoning sections.

- [x] Right-clicking with no active transcript selection does not report a false successful copy.

- [x] A one-time authentication code rendered in the transcript can be selected and copied via right-click, then pasted elsewhere without character loss or reformatting.

### Rotaris - TUI Performance: Lazy Transcript & Virtual Rendering (2026-06-10)

Original: `docs/requirement-log/done/requirements-20260610-tui-lazy-transcript.md` — document status: Complete - archive-backed lazy transcript loading implemented; virtual-rendering scope superseded by `requirements-20260629-virtual-transcript-renderer.md`

#### Description

Long-running sessions accumulate large transcript histories (200+ events, 2M+ tokens) that are
kept entirely in RAM as part of `SessionState.transcript_events`. The TUI `_refresh_widgets` loop
iterates over ALL events on every refresh (up to 13 Hz), rendering Rich Markdown for each one.
This causes 100% CPU saturation and UI sluggishness in sessions lasting more than ~30 minutes.

Two complementary optimizations are needed:

1. **Lazy-load transcript from disk on scroll-up**: Only keep the last N events in RAM.
   Older events are persisted to `state/ui_transcript.json` and loaded on demand when the user
   scrolls up in the ChatPanel.

2. **Virtual rendering (visible-only rebuild)**: Instead of iterating over all transcript events
   on every refresh, only render events that correspond to visible lines in the ChatPanel viewport.
   This is analogous to how web virtual lists work — measure, compute visible range, render only
   that slice.

#### Current Relevance

**Note (2026-07-03):** This document is now split in practice:

- The **virtual-rendering** half is no longer the canonical requirement. It was superseded by
  [`requirements-20260629-virtual-transcript-renderer.md`](requirements-20260629-virtual-transcript-renderer.md),
  which matches the current `ChatPanel.set_transcript(...)` + `TranscriptRenderStore` design and
  includes the compatibility expectations for selection, links, reasoning toggles, follow mode, and
  archive-page loading behavior.
- The **archive-backed lazy transcript loading** half remains relevant. The repo still contains the
  `TranscriptArchiver`, page sentinels, and `LoadTranscriptPage` flow introduced from this
  requirement.
- This document is complete for archive/lazy-load behavior, but it should not be used as the
  canonical source for current virtual-rendering design.

#### Implementation Notes

- The `chat_needs_full_rebuild` flag is currently set too aggressively — any tool icon/phase change
  triggers a full rebuild. After FR-VIRT-003, only structural transcript changes (new events, not
  updates to existing events) should trigger rebuilds.
- The `_min_widget_refresh_interval` of 75ms (13 Hz) may need to be lowered to 100-150ms once
  virtual rendering is in place, since each refresh will be much cheaper.
- `ChatPanel` currently extends `RichLog` which stores ALL lines in `self.lines`. Virtual rendering
  may require either: (a) overriding RichLog's line storage to be a sparse map, or (b) using a
  custom Widget that only stores visible lines and recomputes on scroll.

**Cross-references:**

- `requirements-20260413-000004-tui-core.md` — original TUI requirements
- `src/rotaris_core/tui/widgets/chat_panel.py` — ChatPanel implementation
- `src/rotaris_core/tui/app.py:816` — `_refresh_widgets` method
- `src/rotaris_core/tui/render_state.py` — RenderState tracking

#### Implementation History

**2026-06-16 — Partial (Phases 1–2, 4–6 implemented; Phase 3 deferred)**

Implemented:
- `TranscriptUiConfig` in `config/schema.py` with `max_in_memory_events` (default 100) and `archive_page_size` (default 50)
- `TranscriptArchiver` in `tui/transcript_archiver.py` — JSONL append/read with `threading.Lock`, `asyncio.to_thread` for reads
- Height map (`_event_line_starts`, `_event_line_counts`) in `ChatPanel` with `record_event_height()` and `extend_height_map()` for O(log n) viewport lookups
- Eviction logic in `TuiRalphLoop._trim_session_state()`: events beyond `max_in_memory_events` are appended to `transcript_archive.jsonl` and replaced with `{"role":"page","offset":N,"count":M}` sentinels
- Scroll-up loading trigger: `ChatPanel.watch_scroll_y` posts `LoadTranscriptPage` when `scroll_y < 3`; `RotarisTuiApp.on_load_transcript_page` loads from archive via `asyncio.to_thread` and prepends events
- Removed `len(transcript_events) < last_chat_event_count` from `needs_full` in `screen_refresh.py`
- `_min_widget_refresh_interval` raised from 75ms to 120ms
- Version bumped to 0.59.32

Not yet implemented:
- FR-VIRT-001: Visible-range rendering (placeholder lines for off-screen events)
- FR-VIRT-004: Compatibility validation with RichLog virtual rendering
- Targeted event update methods on ChatPanel (tool icon/phase streaming mutations still trigger full rebuild via existing `chat_needs_full_rebuild` triggers)
- Dedicated tests for height map methods and scroll-up loading flow

**2026-07-03 — Relevance review after renderer overhaul**

- The virtual-rendering follow-up was implemented under
  [`requirements-20260629-virtual-transcript-renderer.md`](requirements-20260629-virtual-transcript-renderer.md).
  The current refresh path calls `ChatPanel.set_transcript(...)` from `screen_refresh.py` and uses
  `TranscriptRenderStore` rather than rebuilding all `RichLog` lines.
- The archive-backed lazy-loading scope is now complete. `TuiRalphLoop._trim_session_state()`
  counts real transcript events separately from `{"role":"page",...}` sentinels, archives only
  real events, and keeps a single top sentinel for the newest archived page.
- `RotarisTuiApp.on_load_transcript_page()` now replaces the current sentinel with the loaded page and
  preserves a previous-page sentinel when older archive pages remain, so repeated scroll-up loading
  can walk backward through the archive.
- Regression coverage: `test_tui_loop_trim_archives_real_events_without_rearchiving_sentinel` and
  `test_load_transcript_page_keeps_previous_page_sentinel`.

### Virtual Transcript Renderer (2026-06-29)

Original: `docs/requirement-log/done/requirements-20260629-virtual-transcript-renderer.md` — document status: Complete

#### Description

The TUI transcript pane must remain responsive as transcript history grows. Markdown formatting should be preserved, but normal refresh and streaming updates should render only the visible transcript window plus a small buffer instead of materializing every historical line in `RichLog`.

#### Implementation Notes

- Added `TranscriptRenderStore` and block/key/cache structures in `src/rotaris_core/tui/transcript_renderer.py`.
- Kept `ChatPanel` as the widget facade while adding `set_transcript(...)` for virtualized transcript state.
- Refactored `screen_refresh.refresh_widgets()` to pass transcript state to the panel instead of rebuilding/appending every rendered row.
- Preserved existing direct `ChatPanel.add_*` methods for focused widget tests and compatibility.

#### Acceptance Criteria

All requirement rows are implemented or tracked as complete, with focused TUI regression tests and static checks run before release.
