---
req-id: [SWR-1200, SWR-1201, SWR-1202, SWR-1203, SWR-1204, SWR-1205, SWR-1206, SWR-1207, SWR-1208, SWR-1209, SWR-1210, SWR-1211, SWR-1212, SWR-1213, SWR-1214, SWR-1215, SWR-1216, SWR-1217, SWR-1218, SWR-1219, SWR-1220, SWR-1221, SWR-1222, SWR-1223, SWR-1224, SWR-1225, SWR-1226, SWR-1227, SWR-1228, SWR-1229, SWR-1230, SWR-1231, SWR-1232, SWR-1233, SWR-1234, SWR-1235, SWR-1236, SWR-1237, SWR-1238, SWR-1239, SWR-1240, SWR-1241, SWR-1242, SWR-1243, SWR-1244, SWR-1245, SWR-1246, SWR-1247, SWR-1248, SWR-1249, SWR-1250, SWR-1251, SWR-1258, SWR-1259, SWR-1260, SWR-1261, SWR-1262, SWR-1263, SWR-1264, SWR-1265, SWR-1266, SWR-1267, SWR-1268, SWR-1269, SWR-1270, SWR-1271, SWR-1272, SWR-1273, SWR-1274, SWR-1279, SWR-1280, SWR-1281, SWR-1282, SWR-1283]
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

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
