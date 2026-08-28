---
req-id: [SWR-1000, SWR-1001, SWR-1002, SWR-1003, SWR-1004, SWR-1005, SWR-1006, SWR-1009, SWR-1010, SWR-1011, SWR-1012, SWR-1013, SWR-1014, SWR-1015, SWR-1016, SWR-1017, SWR-1018, SWR-1019, SWR-1020, SWR-1021, SWR-1022, SWR-1023, SWR-1024, SWR-1025, SWR-1026, SWR-1027, SWR-1028, SWR-1029, SWR-1030, SWR-1031, SWR-1032, SWR-1033, SWR-1034, SWR-1035, SWR-1036, SWR-1037, SWR-1038, SWR-1040, SWR-1041, SWR-1042, SWR-1043, SWR-1044, SWR-1045, SWR-1046, SWR-1047, SWR-1048, SWR-1050, SWR-1051, SWR-1052, SWR-1053, SWR-1054, SWR-1055, SWR-1056, SWR-1057, SWR-1058, SWR-1059, SWR-1060, SWR-1061, SWR-1064, SWR-1065, SWR-1066, SWR-1067, SWR-1068, SWR-1069, SWR-1070, SWR-1071, SWR-1072, SWR-1073, SWR-1074, SWR-1075, SWR-1076, SWR-1077, SWR-1078, SWR-1079, SWR-1080, SWR-1081, SWR-1082, SWR-1083, SWR-1084, SWR-1085, SWR-1086, SWR-1087, SWR-1088, SWR-1089, SWR-1090]
status: approved
trace: required
test: required
title: "TUI Core Layout & Chrome"
---

# 1000-tui-core spec

## SWR-1000 — TUI Core Layout & Chrome
trace: optional
test: optional

Textual TUI shell: 3-pane layout, right rail, status bar, timing strip, todo panel, scrolling, theme contract, and tool-event display configuration.

## SWR-1001 — Framework
legacy-id: FR-6-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Textual (`https://textual.textualize.io/guide/`)

## SWR-1002 — Chat/Transcript Panel
legacy-id: FR-6-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

A primary chat/transcript panel with Markdown rendering for code blocks, diffs, agent output, and inline report artifacts.

## SWR-1003 — Agent Status Pane
legacy-id: FR-6-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

An agent status pane that shows each active or completed agent's name, persona, state, dependency state, and last activity time. Summarizing children must render an explicit animated `Summarizing response` row-level cue (braille spinner + cyan "Summarizing response" text) rather than relying on the state chip alone, and parents waiting on active descendants must render a dedicated single-symbol waiting animation. See `requirements-20260511-164500.md` for compact presentation and collapsed-range rules. **Gap resolved (2026-06-09):** The `_summarizing_callback` in `TuiRalphLoop._run_iteration` already sets live activity and calls `_sync_children()` before the summary agent blocks, ensuring the summarizing animation is visible in the TUI.

## SWR-1004 — Todo Pane
legacy-id: FR-6-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

A persistent todo pane or toggleable todo view that renders the current anchored phase/task list.

## SWR-1005 — Input Composer
legacy-id: FR-6-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

A persistent input composer at the bottom that supports single-line and multiline entry. See `requirements-20260511-164500.md` for the composer-adjacent run-timing indicator requirement. **Gap resolved (2026-06-10):** When a run is already active, Enter now queues the follow-up into a dedicated transcript-bottom queue section with per-item `unqueue` controls instead of mixing it into transcript chronology.

## SWR-1006 — Keyboard-First
legacy-id: FR-6-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

The TUI must be fully usable from the keyboard. Mouse support is optional.

## SWR-1009 — Agent State Labels
legacy-id: FR-6-009
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

TUI must distinguish at least: `queued`, `running`, `waiting_on_dependencies`, `summarizing`, `succeeded`, `failed`, `cancelled`, `blocked`.

## SWR-1010 — Report Artifact Rendering
legacy-id: FR-6-010
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Structured child report artifacts are rendered inline in the transcript with clear attribution to the child agent that produced them.

## SWR-1011 — No Edit Confirm/Reject
trace: optional
test: optional
legacy-id: FR-6-011
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

The TUI does **not** include confirm/reject prompts for proposed edits; v1 operates with fully autonomous edits.

## SWR-1012 — Reasoning Summary
legacy-id: FR-6-012
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

"Show thinking" refers to framework-generated reasoning summaries and orchestration notes only. v1 must not display or persist raw chain-of-thought tokens.

## SWR-1013 — Inline Error Rendering
legacy-id: FR-6-013
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Recoverable errors must be rendered inline in the transcript and reflected in the status pane. Modal error dialogs are not required.

## SWR-1014 — Color Scheme
trace: optional
test: optional
legacy-id: FR-6-014
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

The UI must respect terminal color schemes and remain legible on light and dark terminal backgrounds.

## SWR-1015 — Not Color-Only Status
trace: optional
legacy-id: FR-6-015
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Status must not be communicated by color alone; textual labels or icons are required alongside color.

## SWR-1016 — First-Class Mode
legacy-id: FR-BG-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Background mode is a first-class session mode in v1.

## SWR-1017 — --background Flag
legacy-id: FR-BG-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

`--background` starts the session detached from the TUI and continues agent execution without an attached UI.

## SWR-1018 — Detach from TUI
trace: optional
legacy-id: FR-BG-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

The TUI settings menu or command palette must allow detaching a currently running session into background mode.

## SWR-1019 — Continues Full Execution
legacy-id: FR-BG-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

A background session must continue agent execution, tool execution, Ralph loop progression, session-state persistence, and artifact generation after the UI detaches.

## SWR-1020 — Reattachable
trace: optional
legacy-id: FR-BG-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

A background session must be reattachable later from the same workspace.

## SWR-1021 — Session Directory
legacy-id: FR-BG-006
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Starting background mode creates a session directory under `.rotaris/sessions/<session_id>/` containing at minimum: a versioned session snapshot, a process metadata file, and a lock file indicating active ownership.

## SWR-1022 — Reattach Mechanism
trace: optional
legacy-id: FR-BG-007
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Reattaching looks up the session by workspace and session ID, reads the snapshot, and reconnects the TUI to the latest persisted state.

## SWR-1023 — Multiple Sessions
legacy-id: FR-BG-008
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Multiple background sessions may exist for a workspace, but only one may hold the active lock for a given session ID.

## SWR-1024 — Incremental Writes
legacy-id: FR-SESSION-001
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Session state must be written incrementally so the TUI can recover after a crash or restart.

## SWR-1025 — Versioned Snapshots
legacy-id: FR-SESSION-002
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

Session snapshots are versioned.

## SWR-1026 — Partial Recovery
legacy-id: FR-SESSION-003
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

If a saved snapshot is partially readable, missing or invalid sections are omitted with a warning and the session resumes from the remaining valid state.

## SWR-1027 — Incompatible Snapshot
legacy-id: FR-SESSION-004
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

If a saved snapshot is incompatible and cannot be recovered safely, the framework must warn the user and start a new empty session rather than attempting a lossy restore.

## SWR-1028 — Continue Session
legacy-id: FR-SESSION-005
date: 2026-04-13
source: docs/requirement-log/done/requirements-20260413-000004-tui-core.md

"Continue session" means reopening a saved session for the same workspace from on-disk state under `.rotaris/sessions/`. A continued session restores the transcript, child-agent state history, tool event history, report artifacts, and config snapshot used by that session.

## SWR-1029 — Independent Scrollable Agents Panel
legacy-id: REQ-20260426-020611-001
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

The `agents` panel shall become vertically scrollable when its rendered content exceeds the height allocated to it. Scrolling this panel must not require scrolling the `info` or `todo` panels.

## SWR-1030 — Independent Scrollable Info Panel
legacy-id: REQ-20260426-020611-002
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

The `info` panel shall become vertically scrollable when its rendered content exceeds the height allocated to it. Scrolling this panel must not require scrolling the `agents` or `todo` panels.

## SWR-1031 — Independent Scrollable Todo Panel
legacy-id: REQ-20260426-020611-003
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

The `todo` panel shall become vertically scrollable when its rendered content exceeds the height allocated to it. Scrolling this panel must not require scrolling the `agents` or `info` panels.

## SWR-1032 — Default Right-Rail Vertical Split
legacy-id: REQ-20260426-020611-004
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

In the default layout, the right rail shall allocate its available vertical space using a `2:1:1` ratio: `agents` gets `2/4`, `info` gets `1/4`, and `todo` gets `1/4`.

## SWR-1033 — Resize-Safe Overflow Behavior
legacy-id: REQ-20260426-020611-005
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

When the terminal height is reduced, each right-rail panel shall preserve its title and remain usable by falling back to internal scrolling instead of expanding past its assigned region.

## SWR-1034 — Input Routing for Scroll Interaction
legacy-id: REQ-20260426-020611-006
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

Mouse-wheel and focus-driven vertical scrolling in the right rail shall affect the hovered or focused panel's scroll region rather than a parent container that moves unrelated panels off-screen.

## SWR-1035 — No Regression in Data Rendering
trace: optional
legacy-id: REQ-20260426-020611-007
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

The `agents`, `info`, and `todo` panels shall continue to render the same content and update from the same app state sources after the layout change.

## SWR-1036 — Flex-Grow Right-Rail Space Fill
legacy-id: REQ-20260426-020611-008
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

The `agents`, `info`, and `todo` scroll regions shall collectively occupy the full available vertical space inside `#right-pane`, growing and shrinking with the terminal like a CSS flex column while preserving the default `2:1:1` share. Short content must not cause unused vertical gaps outside the panel regions.

## SWR-1037 — Layout Stability
test: optional
legacy-id: REQ-20260426-020611-NF-001
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

The default `2:1:1` split should remain visually stable across normal terminal sizes and window resizes.

## SWR-1038 — Graceful Small-Terminal Degradation
legacy-id: REQ-20260426-020611-NF-002
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

On very small terminal heights, exact fractional sizing may degrade, but independent scrollability and panel usability must be preserved.

## SWR-1040 — Dynamic Layout Coverage
trace: optional
legacy-id: REQ-20260426-020611-NF-004
date: 2026-04-26
source: docs/requirement-log/done/requirements-20260426-020611.md

Automated tests or snapshot coverage shall assert that the right-rail scroll regions fill the full available height across representative terminal sizes, including cases where panel content is shorter than its allocated region.

## SWR-1041 — Per-child todo state field
trace: optional
legacy-id: REQ-20260429-120000-001
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

`ChildTaskRecord` shall have an optional `todo_state: dict[str, Any] \

## SWR-1042 — Per-child todo callback wiring
trace: optional
legacy-id: REQ-20260429-120000-002
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

When the Scheduler spawns a child conversation that has a `todo_state_callback` capability, the callback shall update the corresponding `ChildTaskRecord.todo_state` instead of the global `session.agent_todo_state`. The top-level (non-child) agent retains the existing `session.agent_todo_state` mechanism.

## SWR-1043 — Context-aware todo resolution in view model
legacy-id: REQ-20260429-120000-003
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

`build_screen_view_model` shall resolve the todo as follows: (a) if `focused_agent_id` is set and a matching child state dict contains a non-null `todo_state`, use that child's `TodoList`; (b) otherwise fall back to `session.agent_todo_state` then `session.todo_state` (existing priority). The `todo_source` label shall be set to the canonical child name when a child's todo is used, or `"agent"` / `"plan"` in the fallback cases.

## SWR-1044 — Markdown checkbox rendering
legacy-id: REQ-20260429-120000-004
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

`TodoPane.render()` shall render each task as a Markdown-style checkbox: `[x] task name` for `COMPLETED` status and `[ ] task name` for all other statuses (`PENDING`, `IN_PROGRESS`, `ABANDONED`, etc.). Phase group headers may remain to separate phases. The existing chip labels (`done`, `run`, `todo`, `drop`) shall be removed.

## SWR-1045 — Scrollable panel compatibility
legacy-id: REQ-20260429-120000-005
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

The `#todo-pane-scroll` `VerticalScroll` wrapper in `MainScreen` shall remain present. When the rendered checkbox list exceeds the panel height, the existing scroll container shall provide vertical scrolling without requiring changes beyond the rendering format.

## SWR-1046 — Backward compatibility with old snapshots
trace: optional
test: optional
legacy-id: REQ-20260429-120000-NF-001
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

Adding `todo_state` to `ChildTaskRecord` must use a `None` default. Loading a serialised session that predates this field must not raise validation errors.

## SWR-1047 — Thread safety for per-child todo writes
trace: optional
test: optional
legacy-id: REQ-20260429-120000-NF-002
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

The per-child `todo_state` callback runs inside `asyncio.to_thread` (same thread-safety context as `spawn_child` / `mark_child_terminal`). Write access to `ChildTaskRecord.todo_state` shall be protected by the same `threading.Lock` already used in `ChildManager`.

## SWR-1048 — No regression in top-level todo display
legacy-id: REQ-20260429-120000-NF-003
date: 2026-04-29
source: docs/requirement-log/done/requirements-20260429-120000.md

When `focused_agent_id` is `None`, the Todo panel shall continue to display the top-level agent's todo list exactly as before.

## SWR-1050 — Semantic Theme Schema
legacy-id: REQ-20260503-STYLE-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

The TUI shall define a central immutable `Theme` schema with semantic fields for backgrounds, foreground hierarchy, borders, status/accent colors, and footer key styling. Theme values must be consumed by semantic role rather than by widget-specific color names.

## SWR-1051 — CSS Variable Export
legacy-id: REQ-20260503-STYLE-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

Each `Theme` shall export a complete Textual CSS variable map using the `$theme-*` namespace so stylesheet rules can remain theme-agnostic.

## SWR-1052 — Built-In Themes
legacy-id: REQ-20260503-STYLE-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

The application shall ship with `tokyo-night` and `dark` themes registered in the central theme registry.

## SWR-1053 — Default Theme
legacy-id: REQ-20260503-STYLE-004
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

The default TUI theme shall be `mono` (black/gray/white baseline per REQ-20260511-004). `tokyo-night` and `dark` remain available as alternates.

## SWR-1054 — Stylesheet Theme Use
legacy-id: REQ-20260503-STYLE-005
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

Shared TUI styles shall use `$theme-*` variables for backgrounds, foregrounds, borders, focus states, selections, and warnings/errors. New stylesheet rules must prefer existing theme variables over literal colors.

## SWR-1055 — Rich Render Palette
legacy-id: REQ-20260503-STYLE-006
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

Rich-rendered widget content shall route visual roles through `RenderPalette.from_theme(get_theme())` or directly through `get_theme()` when a narrower semantic mapping is clearer.

## SWR-1056 — Runtime Theme Switching
legacy-id: REQ-20260503-STYLE-007
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

Users shall be able to switch themes at runtime by invoking `/theme <name>` or the corresponding command palette action. Invalid theme names shall produce a user-visible error instead of crashing.

## SWR-1057 — Style-Guided Feature Work
trace: optional
test: optional
legacy-id: REQ-20260503-STYLE-008
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

New TUI features shall preserve the existing dark, restrained, panel-oriented terminal style. Feature work shall not introduce a broad visual redesign, new dominant palette, or hardcoded styling scheme unless a separate requirement explicitly authorizes that change.

## SWR-1058 — Visual Continuity
trace: optional
test: optional
legacy-id: REQ-20260503-STYLE-NF-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

The TUI shall remain visually coherent across chat, composer, right rail, command palette, modal screens, and notifications by using the same semantic theme layer.

## SWR-1059 — State Distinguishability
status: draft
legacy-id: REQ-20260503-STYLE-NF-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

Important UI states such as focused, active, muted, warning, error, success, running, and disabled shall remain visually distinguishable in every built-in theme.

## SWR-1060 — Snapshot-Based Regression Guard
trace: optional
test: optional
legacy-id: REQ-20260503-STYLE-NF-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

User-facing TUI layout states shall be covered by Textual snapshot baselines where visual regressions would be meaningful.

## SWR-1061 — Reviewed Snapshot Updates
trace: optional
test: optional
legacy-id: REQ-20260503-STYLE-NF-004
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

Snapshot baselines shall be updated only after a deliberate visual review confirms that the new output is intended.

## SWR-1064 — Theme Contract Tests
status: draft
legacy-id: REQ-20260503-STYLE-T-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-style-guided-theme.md

Automated tests should assert that registered themes provide every required semantic field and that stylesheet-facing variable names remain stable.

## SWR-1065 — Display absolute workspace path
legacy-id: REQ-20260511-001
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-120000-status-bar.md
priority: High



## SWR-1066 — Display active git branch
legacy-id: REQ-20260511-002
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-120000-status-bar.md
priority: High



## SWR-1067 — Tilde-expand `$HOME` in displayed path
legacy-id: REQ-20260511-003
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-120000-status-bar.md
priority: Medium



## SWR-1068 — Hide branch info when no git repo detected
legacy-id: REQ-20260511-004
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-120000-status-bar.md
priority: Medium



## SWR-1069 — Reactive update: refresh on session switch and periodic poll
legacy-id: REQ-20260511-005
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-120000-status-bar.md
priority: Medium



## SWR-1070 — Themed appearance matching existing TUI style
legacy-id: REQ-20260511-006
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-120000-status-bar.md
priority: Medium



## SWR-1071 — The TUI shall render a dedicated run-timing indicator in the composer metadata region directly above the prompt input field, so timing is visible in the same gaze zone as message composition.
legacy-id: REQ-20260511-001
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1072 — While a run is active, the timing indicator shall show the elapsed duration of the current in-flight model-execution segment. When execution advances to a new segment within the same run, this live elapsed value shall reset and begin counting again.
legacy-id: REQ-20260511-002
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1073 — When a run reaches a terminal state, the timing indicator shall present the total elapsed wall-clock duration for the completed run until a new run replaces it.
legacy-id: REQ-20260511-003
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1074 — The default TUI visual baseline shall use black as the primary application background, light gray for chrome and secondary UI text such as borders, labels, counters, and panel titles, and white for primary user-facing content text.
trace: optional
test: optional
legacy-id: REQ-20260511-004
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1075 — Semantic accent colors for states such as success, warning, error, and active focus may remain in use, but they shall be visually subordinate to the black/gray/white default hierarchy rather than replacing it as the main chrome language.
trace: optional
test: optional
legacy-id: REQ-20260511-005
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: Medium



## SWR-1076 — The agents panel shall use a compact row presentation that abbreviates the agent task or display label and suppresses non-essential verbosity for non-focused rows, so the default panel consumes less vertical space per visible agent.
legacy-id: REQ-20260511-006
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1077 — The default agents panel presentation shall display at most five concrete agent rows at one time, regardless of how many agents exist in the current logical navigation set.
legacy-id: REQ-20260511-007
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1078 — When the logical agent set contains more items than can be shown directly, the TUI shall represent hidden contiguous ranges with ellipsis placeholders. In the default collapsed state for a single hidden middle range, the panel shall render two visible rows above the ellipsis and three visible rows below it.
legacy-id: REQ-20260511-008
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1079 — Agent ordering in the panel shall be newest-first from top to bottom. When keyboard navigation selects an agent that would otherwise be hidden inside a collapsed range, that agent shall surface into the visible five-row presentation and the ellipsis placeholders shall move above and/or below it to represent the remaining hidden ranges.
legacy-id: REQ-20260511-009
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1080 — Collapsing or hiding agents from the default panel view shall not remove them from transcript history, session state, or keyboard navigation. Hidden agents remain part of the navigable logical list even when not shown as concrete rows.
legacy-id: REQ-20260511-010
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1081 — When the focused agent changes while the user is traversing hidden history, the focus cursor shall remain on the selected logical agent rather than snapping back to the newest agent solely because the visible panel summary re-collapses or new agent activity appears elsewhere.
legacy-id: REQ-20260511-011
date: 2026-05-11
source: docs/requirement-log/done/requirements-20260511-164500.md
priority: High



## SWR-1082 — TUI Scrolling Inside Borders
legacy-id: REQ-20260527-TUI-SCROLLIN-001
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-tui-scrolling.md

Right-hand TUI panels must scroll their content independently while borders remain fixed, with the vertical split distributed as `3fr`, `2fr`, `2fr`.

## SWR-1083 — Add `TuiDisplayConfig` model with `show_tool_results: bool = True` and `tool_result_max_lines: int = Field(default=10, ge=0)`. Add `display: TuiDisplayConfig` to `RotarisConfig`.
legacy-id: REQ-20260603-TRUNC-001
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: High



## SWR-1084 — `ChatPanel.add_tool_event()` shall truncate content to `max_lines` newline-separated lines. When truncated, append a dim indicator `… +N more lines, tool result truncated` (or `tool call input truncated` for inputs). When `max_lines=None` or `max_lines=0`, render full content unchanged.
legacy-id: REQ-20260603-TRUNC-002
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: High



## SWR-1085 — The `show_tool_events` reactive shall be replaced by a property reading `config.display.show_tool_results`. Toggling the value shall persist to workspace `agents.yaml` via atomic write.
legacy-id: REQ-20260603-TRUNC-003
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: High



## SWR-1086 — A `ToolResultSettingsScreen` (ModalScreen) shall provide toggles (Switch) for show/hide results and inputs, and dropdowns (Select) for max lines each (presets: 1, 2, 5, 10, 20, 50, No limit). Settings are saved via ctrl+s and persisted to workspace config. The screen is accessible from the command palette under \"Tool result settings\".
legacy-id: REQ-20260603-TRUNC-004
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: High



## SWR-1087 — Truncation shall be render-only. Full tool input and result content shall remain in `session.transcript_events` unchanged for model context, summaries, compression, and session replay.
legacy-id: REQ-20260603-TRUNC-005
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: High



## SWR-1088 — The command palette hit \"Toggle tool events\" shall be renamed to \"Toggle tool results\" and shall still toggle `show_tool_results` visibility.
legacy-id: REQ-20260603-TRUNC-006
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: Low



## SWR-1089 — Add `show_tool_inputs: bool = True` and `tool_input_max_lines: int = Field(default=2, ge=0)` to `TuiDisplayConfig`. In `_render_chat_event`, tool events without a `phase` key (tool inputs from scheduler/compressor) shall respect `show_tool_inputs` and `tool_input_max_lines`, while events with a `phase` key (tool results) shall respect the existing `show_tool_results` and `tool_result_max_lines`.
legacy-id: REQ-20260603-TRUNC-007
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: High



## SWR-1090 — A `show_tool_inputs` property on `RotarisTuiApp` shall mirror the `show_tool_events` pattern: read from `config.display.show_tool_inputs`, fall back to `_show_tool_inputs_fallback`.
legacy-id: REQ-20260603-TRUNC-008
date: 2026-06-03
source: docs/requirement-log/done/requirements-20260603-tool-result-truncation.md
priority: High



## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Terminal User Interface (Core) (2026-04-13)

Original: `docs/requirement-log/done/requirements-20260413-000004-tui-core.md` — document status: Complete

#### Description

The TUI is built with Textual. It presents a three-pane layout: chat/transcript panel on the left, agent status and todo pane on the right, and a persistent input composer at the bottom. Background mode is a first-class session type: sessions can be detached, continued headlessly, and reattached. Session state is persisted incrementally and versioned for crash recovery.

#### Implementation Notes

**Requirements - TUI Core Layout, Background Mode & Session Recovery:**

**Migrated From:** `REQUIREMENTS.md` FR-6 (dissolved 2026-05-03) and some UX polish items ongoing. Composer-adjacent timing and compact agent-list presentation are refined by `requirements-20260511-164500.md`. > **Cross-references** (these files supersede conflicting items in this document): > > - Context compression & detailed right-panel contents (token estimate, MCP server list, > active tools, warnings, token meter, per-agent model display, open todos in panel, > arrow-key tree navigation, chat scroll behavior, panel scrollability, version display): > `requirements-20260413-204058.md` - takes priority. > - Interactive agent transcript UI: > `requirements-202604141613000.md` - takes priority. > - TUI right-rail independent scrolling and layout: > `requirements-20260426-020611.md` - takes priority. > - Composer-adjacent timing, default chrome refresh, and collapsed agent list: > `requirements-20260511-164500.md` - takes priority. > - Slash commands: > `requirements-20260417-slash-commands.md` - takes priority. > - TUI testing standards (three mandatory test categories): > `requirements-20260413-213222.md` - takes priority. > - Double Ctrl+C immediate stop: > `requirements-20260414-170500.md` - takes priority. > - Background output detail levels: > `requirements-20260430-160000.md` - takes priority. > - Context-aware todo panel and markdown checkbox rendering: > `requirements-20260429-120000.md` - takes priority. > - Authentication and model selection screens: > `requirements-20260418-143500.md`, `requirements-20260503-123000.md` - take priority. > - Style-guided theme: > `requirements-20260503-style-guided-theme.md` - takes priority. > - Keyboard shortcut architecture (leader-chord system, IDE/terminal-safe bindings): > `requirements-20260616-000001-keyboard-shortcut-architecture.md` - **supersedes FR-6-007 and FR-6-008.**

**FR-6: Terminal User Interface - Core:**

**Background Mode:**

**Session State & Recovery:**

#### Acceptance Criteria

All requirement rows are implemented.

### TUI Right-Rail Independent Scrolling & Default Vertical Split (2026-04-26)

Original: `docs/requirement-log/done/requirements-20260426-020611.md` — document status: Complete

#### Description

The TUI right rail shall support independent vertical scrolling for the `agents`, `info`, and `todo` panels when any panel's content exceeds its available height. The default vertical layout of the right rail shall allocate half of the available height to `agents`, one quarter to `info`, and one quarter to `todo`. The right rail shall also behave like a flex column: its child panel regions must expand to consume the full available vertical space instead of leaving unused gaps when the terminal height changes or panel content is short. This requirement replaces the current behavior where the entire right rail scrolls as a single column. The goal is to keep each panel usable under heavy content load without forcing the user to scroll past unrelated sections. The current main screen composes the right rail as one `VerticalScroll` container (`#right-pane`) containing `AgentStatusPane`, `InfoPane`, and `TodoPane` directly. In CSS, the right rail currently owns `overflow-y: auto`, while `#agent-status`, `#info-pane`, and `#todo-pane` do not currently own their own scroll containers. The stylesheet already contains unused selectors for `#agent-status-scroll`, `#info-pane-scroll`, and `#todo-pane-scroll`, which suggests the layout was already moving toward per-panel scrolling but is not currently wired. As of 2026-05-03, the scroll wrappers exist and each panel has an explicit fractional height, but the right rail still needs a stronger dynamic-space-fill contract. The desired behavior is equivalent to CSS flex-grow: the scroll regions collectively occupy the whole available column, and each panel keeps its assigned share while growing or shrinking with the terminal. Existing tests also encode the current behavior: `tests/unit/test_tui_workflows.py` contains `test_layout_right_pane_scrolls_when_content_overflows`, which validates the scrollability of the overall right rail rather than each individual panel.

#### Implementation Notes

**Requirements Document:**

**Blockers / Dependencies:**

- The current unit test `test_layout_right_pane_scrolls_when_content_overflows` encodes the old container-level scroll model and will fail once the right rail stops being the only scroll owner.

- Nested scroll regions in Textual can create ambiguous wheel-routing and focus behavior. The implementation must choose a single clear scroll owner per panel and avoid leaving the parent right rail as a competing vertical scroller.

- If the current `Static`-based panel widgets cannot satisfy independent scrolling cleanly, the implementation may need to introduce dedicated scroll wrappers or convert the panel widgets to a scroll-capable composition. This is a design constraint, not a reason to defer the feature.

At the time of writing there is no confirmed hard blocker that makes the feature infeasible, but the above constraints must be treated as implementation-affecting requirements rather than optional cleanup.

**Excluded / Out of Scope:**

- Horizontal scrolling changes for any panel.

- Changes to the left chat/composer pane layout.

- User-configurable panel ratios; this requirement only defines the default layout.

- Styling redesign of the panel visuals beyond what is required to make the layout and scrolling behavior work.

#### Acceptance Criteria

All requirement rows are implemented.

### Rotaris - Context-Aware Todo Panel & Markdown Checkbox Rendering (2026-04-29)

Original: `docs/requirement-log/done/requirements-20260429-120000.md` — document status: Complete

#### Description

The TodoPane shall reflect the todo list of the currently focused agent rather than always showing the top-level session todo. When no child agent is focused (top-level view), the panel shows the orchestrator's todo as before. When the user navigates into a child agent (via Ctrl+Down / agent-status click), the panel shall switch to that child's own todo list for the duration of the focus. In addition, tasks shall be rendered as classic Markdown checkboxes: `[x] task` for completed items and `[ ] task` for all other open/pending/in-progress items. This replaces the current chip-based rendering (`done`, `run`, `todo`, `drop`). The panel already has independent scrolling from REQ-20260426-020611; the scroll wrapper must remain present and continue to work with the new rendering.

**Current behaviour:**

- `SessionState.agent_todo_state` holds the top-level (orchestrator) agent's todo

list, set by the `update_agent_todo` callback wired in `RotarisTuiApp._start_run`.

- `ChildTaskRecord` (in `orchestrator/child_state.py`) has no `todo_state` field -

per-child todos are not tracked at all.

- `build_screen_view_model` always reads from `session.agent_todo_state` or

`session.todo_state` regardless of `focused_agent_id`.

- `TodoPane.render()` uses chip labels (`done`, `run`, `todo`, `drop`) rather than

Markdown checkboxes.

**What needs to change:**

1. **`ChildTaskRecord`** - add an optional `todo_state: dict[str, Any] | None = None`

field so that each child's running todo can be persisted alongside its other lifecycle data.

2. **Scheduler / factory** - when spawning a child conversation, register a

per-child `todo_state_callback` that writes into the child's `ChildTaskRecord` rather than the global `session.agent_todo_state`.

3. **`SessionState.child_states`** - the child state dicts stored there will now

carry `todo_state` automatically once `ChildTaskRecord` is serialised.

4. **`build_screen_view_model`** - when `focused_agent_id` is set and a child state

dict with a `todo_state` key can be found for that agent, use that todo instead of the session-level one. Fall back to the session-level todo if none exists.

5. **`TodoPane.render()`** - replace chip-based task rows with Markdown checkbox

rows (`[x] name` / `[ ] name`). Phase headers and the summary block may be retained or simplified; the checkbox format is the primary display.

6. **Scroll compatibility** - the `#todo-pane-scroll` VerticalScroll wrapper

(introduced in REQ-20260426-020611) must remain in the compose tree and must not be removed or bypassed.

#### Implementation Notes

**Requirements Document:**

**Blockers / Dependencies:**

- REQ-20260426-020611 (independent scrollable panels) is marked Complete; the

`#todo-pane-scroll` wrapper it introduced is a prerequisite satisfied by that work.

- The per-child callback wiring touches `Scheduler.run_children` (or equivalent

spawn path). That code must be read carefully to avoid disrupting existing `todo_state_callback` routing for the top-level agent.

**Excluded / Out of Scope:**

- Nested child-of-child todo tracking (only one level of child focus is addressed).

- Custom icons or colours per task status beyond the `[x]` / `[ ]` distinction.

- Horizontal scrolling.

- Changes to the `AgentStatusPane` or `InfoPane` layout.

- User-configurable checkbox symbols.

#### Acceptance Criteria

**Constraints:**

- `ChildTaskRecord` is a Pydantic `BaseModel`; adding a field with a default satisfies

backward-compat without bumping `SESSION_SCHEMA_VERSION`.

- `scheduler ↔ child_manager ↔ delegate_tool` form a circular-import triangle; any

new callback wiring must keep imports inside functions.

- The existing `todo_state_callback` key in `runtime_kwargs` is shared between the

top-level agent and child agents today (see `agents/factory.py`). Distinguishing per-child writes requires injecting a child-specific closure when spawning, not a global callback.

- `TodoPane` is a `Static` widget inside a `VerticalScroll`; as long as the content

height grows beyond the scroll container, scrolling works. No widget type change is needed.

**Acceptance Criteria:**

1. With `focused_agent_id = None`, the TodoPane shows the orchestrator/session-level

todo (same as today).

2. After focusing a child agent (Ctrl+Down), the TodoPane switches to show that

child's own todo list if one exists.

3. All tasks render as `[x] name` (completed) or `[ ] name` (all other statuses).

4. The panel scrolls when the task list overflows its allocated height.

5. Loading a pre-existing session snapshot (without `todo_state` in child records)

does not crash.

6. Automated tests pass for the view-model resolution logic and the new rendering

format.

### TUI Style-Guided Theme Contract (2026-05-03)

Original: `docs/requirement-log/done/requirements-20260503-style-guided-theme.md` — document status: Complete — default theme is now 'mono' (black/gray/white baseline per REQ-20260511-004). 'tokyo-night' and 'dark' remain available via `/theme <name>`. UI Style Guide (`docs/ui-styleguide.md`) is the single source of truth for all TUI visual decisions.

#### Description

The TUI visual style shall be governed by a central, semantic theme layer rather than by ad hoc widget-local color choices. The current design contract is a subdued dark terminal UI with panel-based structure, semantic accent colors, theme-switching support, and visual regression coverage through Textual snapshots. This document consolidates the current status quo into the conclusive requirement for future TUI style work, except where later TUI redesign requirements explicitly amend the default shipped visual baseline. New screens, widgets, and status indicators should extend the existing theme vocabulary first and introduce new style tokens only when the current semantic set cannot express the UI state clearly. > **Amendment note:** `requirements-20260511-164500.md` refines the default > TUI chrome toward a black/gray/white baseline while preserving semantic accent > colors and the shared theme system. That document takes priority for the > shipped default appearance.

- The default theme was `tokyo-night` at the time this historical contract was

written. `requirements-20260511-164500.md` now amends the shipped default baseline.

- The alternate built-in theme is `dark`.

- TUI CSS consumes injected `$theme-*` variables instead of hardcoding palette

values in selectors.

- Rich-rendered widgets obtain colors through `get_theme()` and

`RenderPalette.from_theme(...)`.

- Runtime theme switching is user-facing through `/theme <name>` and command

palette entries.

- Visual layout baselines are captured with `pytest-textual-snapshot` and may be

updated only after deliberate visual review.

#### Implementation Notes

**Requirements Document:**

amended by `requirements-20260511-164500.md`; automated enforcement remains partial)

**Evidence:**

- `src/rotaris_core/tui/themes/base.py` defines the semantic `Theme` schema and

CSS variable export.

- `src/rotaris_core/tui/themes/tokyo_night.py` and

`src/rotaris_core/tui/themes/dark.py` define the built-in themes.

- `src/rotaris_core/tui/themes/__init__.py` registers themes and sets the current

default to `tokyo-night`.

- `src/rotaris_core/tui/styles/app.tcss` consumes `$theme-*` variables.

- `src/rotaris_core/tui/palette.py` maps theme colors into Rich rendering roles.

- `src/rotaris_core/tui/widgets/slash_commands.py` implements `/theme`.

- `src/rotaris_core/tui/providers/command_palette.py` exposes theme entries.

- `tests/unit/test_slash_commands.py` covers the `/theme` command behavior.

- `tests/unit/test_tui_workflows.py` contains the primary TUI snapshot tests.

- `docs/textualize_testing_guide.md` defines snapshot review expectations.

**Excluded / Out of Scope:**

- Designing a new product brand or marketing visual identity.

- Replacing Textual, Rich, or the current terminal-panel layout model.

- Adding user-configurable custom theme files.

- Exhaustive accessibility certification for color contrast.

#### Acceptance Criteria

**Constraints:**

- Theme names are user-facing API because they are accepted by `/theme <name>`

and exposed in the command palette.

- New colors should normally be added as semantic theme fields, not as one-off

literals in widgets or CSS.

- Existing snapshot baselines are part of the style contract. Updating them is a

reviewable visual change, not a mechanical side effect.

- The style contract does not require a branded marketing aesthetic, a web-style

landing page, or a non-terminal design system.

**Acceptance Criteria:**

1. Future TUI work can identify the visual contract from this document without

inferring it from source files alone.

2. Theme-aware styling continues to flow through `Theme`, `$theme-*` CSS

variables, `get_theme()`, and `RenderPalette`.

3. `tokyo-night` and `dark` remain available runtime themes.

4. `/theme <name>` remains a supported user-facing control surface.

5. Meaningful TUI visual changes update snapshots only after visual review.

### Rotaris - TUI Status Bar: Working Directory and Git Branch (2026-05-11)

Original: `docs/requirement-log/done/requirements-20260511-120000-status-bar.md` — document status: Complete

#### Description

The TUI currently provides no persistent visual indication of which directory the user is working in or which git branch is checked out. Users lose context about their workspace location and branch identity, especially when switching sessions or running long iterations. This requirement adds a compact status bar beneath the right-hand panes showing the resolved absolute workspace path (with tilde expansion for `$HOME` paths) and the active git branch, separated by a subtle divider.

**Problem being solved:**

When interacting with the TUI, the user cannot easily see:

- Which absolute directory (workspace root) they are currently working in

- Which git branch is checked out in that workspace

**Current behaviour:**

The TUI (`MainScreen`) renders a 3-column layout:

- Left: `ChatPanel` + `InputComposer`

- Right: `AgentStatusPane` + `TodoPane` + `InfoPane`

No persistent status/footer row exists below these panes. The session picker shows a brief overlay but no continuous path/branch indicator during normal operation.

**What needs to change:**

1. Add a horizontal status bar widget below the right-side panes (truncated in the middle when necessary to fit).

2. Display the **resolved absolute workspace path**, with `$HOME` portions collapsed to `~` for readability. OS specific path separator and resolve.

3. Display the **active git branch** name (via `git rev-parse --abbrev-ref HEAD`), or `!` / `[detached]` when not in a repository or in detached HEAD state.

4. When no git repository is present, omit the branch portion entirely.

5. Update the display reactively - refresh when the session changes or the workspace root changes. A polling interval of 10 seconds is acceptable to catch external git changes.

6. Style the bar consistently with existing theme colours (`$theme-bg`, `$theme-fg-dim`).

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `workspace_root` availability from `RotarisTuiApp.current_session`

- No inter-REQ dependencies within this document

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution None identified | - | No conflicts with existing requirements.

**Notes:**

- **Design choice - placement:** The user specified "right side below the panes," which maps directly to inserting the bar inside the right column container (below `AgentStatusPane`, `TodoPane`, `InfoPane`). This keeps the bar visually anchored to the right panel stack as requested, though an alternative of a full-width bottom bar was considered.

- **Git detection:** Use `subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], …)` with a 1-second timeout from a worker thread. Catch all `OSError`/`CalledProcessError` - a non-zero exit code means detached HEAD, absence of git binary means no repo.

- **Threading constraint:** Following `AGENTS.md` - `subprocess` calls must go through `asyncio.to_thread`; never block the render loop.

- **Out of scope:** Clicking the bar to copy to clipboard, navigating to the path in a file browser, or showing remote/origin branch - these MAY be future enhancements.

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] A status bar row is rendered below the right-side panes in `MainScreen`, visibly separate from `AgentStatusPane` and `TodoPane`.

- [ ] The bar shows the absolute workspace path with `$HOME` replaced by `~` (e.g., `~/projects/myapp · main`).

- [ ] When the user is in a git repository, the bar shows `<path> · <branch>`. When in a detached HEAD state, it shows `<path> · [detached]`.

- [ ] When no git repository is found at the workspace root, only the path is shown (no trailing separator or dummy text).

- [ ] Switching sessions triggers a synchronous refresh of the bar content within one animation frame.

- [ ] The display does not lag or freeze the UI during polling; git detection is performed asynchronously (no blocking of the render loop).

- [ ] Styling uses `$theme-fg-dim` text colour with a `$theme-bg` background.

- [ ] The git branch name is color coded using an accent highlight color.

- [ ] The bar text is monospaced-compatible and truncates gracefully with ellipsis (`…`) when the workspace path exceeds the available space of the right pane width.

### Rotaris - TUI Timing Strip, Default Chrome Refresh, and Collapsed Agent List (2026-05-11)

Original: `docs/requirement-log/done/requirements-20260511-164500.md` — document status: Complete — default black/gray/white theme registered as 'mono', agent list collapsed to 5-row-max with ellipsis markers, Up/Down keyboard navigation through flattened newest-first list.

#### Description

The terminal UI needs a faster-to-scan execution surface. Users should be able to read run timing from the area directly above the prompt, distinguish the active in-flight elapsed segment from the final total run duration, rely on a clearer black/gray/white default visual baseline, and inspect agent activity without an ever-growing vertically stacked list. The agent panel should collapse the middle of long agent histories behind ellipsis markers while preserving full keyboard traversal and transcript navigation.

**Problem being solved:**

The current TUI makes a few important runtime signals harder to read than necessary:

- The user must look away from the prompt area to infer timing, and the current elapsed indicators

live inside agent rows rather than in the composer-adjacent interaction zone.

- The default theme uses a muted blue-tinted dark palette instead of a crisper black background

with stronger foreground separation for chrome vs content.

- The agent status pane renders too many rows with too much vertical detail, which makes the

right rail feel crowded and forces heavier scrolling as more agents accumulate.

**Current behaviour:**

- `InputComposer` renders a metadata strip above the prompt with status, multiline toggle, model,

stash, and settings affordances, but no dedicated run timer.

- `AgentStatusPane` renders every agent in the current logical tree, using multiple lines per

agent for persona, detail, activity, elapsed time, and tool counts.

- The TUI theme contract currently defines `tokyo-night` as the default theme and uses semantic

theme variables for backgrounds, chrome, and accent colors.

- Right-rail independent scrolling already exists, so the current overflow strategy is scrolling a

long agent list rather than aggressively collapsing what is shown.

**What needs to change:**

1. Add a dedicated run-timing display directly above the prompt input.

2. Distinguish a resetting in-flight elapsed timer during execution from the total elapsed time

shown after the run reaches a terminal state.

3. Refresh the default visual baseline so the TUI reads as black background, light-gray chrome,

and white primary content text, while retaining semantic accent colors for status states.

4. Reduce the visual density of the agents panel by abbreviating agent labels and limiting how

many concrete agent rows are displayed at once.

5. Replace the current unbounded stacked agent list with a collapsed presentation that uses

ellipsis markers for hidden ranges but preserves full arrow-key traversal across the logical agent history.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/src/rotaris_core/tui/widgets/input_composer.py`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/src/rotaris_core/tui/widgets/agent_status.py`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/src/rotaris_core/tui/themes/base.py`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/src/rotaris_core/tui/themes/tokyo_night.py`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/src/rotaris_core/tui/themes/dark.py`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/src/rotaris_core/tui/styles/app.tcss`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/docs/requirement-log/partial/requirements-20260413-000004-tui-core.md`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/docs/requirement-log/partial/requirements-20260413-204058.md`

- Depends on: `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/docs/requirement-log/done/requirements-20260503-style-guided-theme.md`

- Blocks: none

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/docs/requirement-log/partial/requirements-20260413-000004-tui-core.md` FR-6-003 | Existing agent status pane requirement establishes the pane but not its density, slot cap, or collapse behavior. | Refined: the pane remains required, but its default presentation is now constrained to a compact five-row collapsed summary model with focus surfacing. `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/docs/requirement-log/partial/requirements-20260413-000004-tui-core.md` FR-6-005 | Existing input composer requirement defines the prompt area but not composer-adjacent timing visibility. | Extended: the prompt area now includes a dedicated run-timing indicator in the metadata strip above the input field. `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/docs/requirement-log/partial/requirements-20260413-204058.md` REQ-20260413-204058-012 | The older runtime-monitor requirement implies a live list of active sub-agents and their metrics, which could be read as "show every row in full". | Clarified: the logical list remains intact, but the default panel view may collapse hidden ranges and abbreviate visible rows without losing navigability. `/media/cyberdave/BIGJ1/Development/Apps/geraet-ai/docs/requirement-log/done/requirements-20260503-style-guided-theme.md` REQ-20260503-STYLE-004 | The prior style document names `tokyo-night` as the default theme and documents a blue-tinted default palette. | Amended: the default shipped visual baseline now moves to a black/gray/white chrome hierarchy while preserving semantic accent colors and the semantic theme system.

**Notes:**

1. The spoken request contained one contradictory ordering phrase (`most recent agent should be on the bottom`) followed immediately by the opposite (`most recent agent should be on the top`). This document treats the later statement as authoritative and specifies newest-first ordering.

2. The phrase "discarded from the UI" is interpreted as "collapsed out of the default visible summary" rather than removed from the session model. This preserves arrow-key traversal and transcript access while still reducing visual crowding.

3. "Elapsed time of the model" is interpreted as a live per-segment elapsed timer during execution plus a total run elapsed timer after completion. This keeps the live number meaningful during long runs while still preserving the full run duration at the end.

4. This document intentionally does not remove runtime theme switching or ban alternate themes. It only redefines the required default visual baseline and foreground hierarchy.

5. The compact presentation requirement also applies to the embedded "Recent Activity" block inside the agents pane: when tool events are shown, the log should stay visually subordinate to the agent rows and collapse to a compact placeholder when empty.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] During an active run, the area directly above the prompt input shows a live elapsed timer for the current in-flight execution segment.

- [x] When the active execution segment changes during the same run, the live elapsed value resets rather than continuing to accumulate across the entire run.

- [x] After the run completes, the same composer-adjacent area shows the total elapsed run duration until the next run starts.

- [ ] In the default theme, the main app background renders black, chrome elements such as borders and panel titles render light gray, and ordinary transcript or prompt text renders white.

- [ ] Success, warning, and error states may still use semantic accent colors, but ordinary borders, labels, counters, and headings do not revert to blue-dominant chrome.

- [ ] With more than five logical agents available, the agents panel renders no more than five concrete agent rows at once.

- [ ] When a middle range is collapsed, the default panel arrangement shows two visible rows, then an ellipsis placeholder, then three visible rows.

- [ ] Arrow-key navigation can move into an agent that is initially hidden by the ellipsis placeholder, and that agent becomes visible without deleting any other logical agent from navigation.

- [ ] When the user navigates away from a surfaced middle agent, the panel may collapse again, but the logical focus remains on the newly selected agent instead of resetting to the newest row.

- [ ] Hidden agents remain available in transcript selection/history even when the default panel presentation does not render them as visible rows.

- [ ] Non-focused agent rows use abbreviated labels or truncated task text so the panel reads as a compact summary rather than a fully expanded tree of verbose entries.

### TUI Scrolling Inside Borders (2026-05-27)

Original: `docs/requirement-log/done/requirements-20260527-tui-scrolling.md` — document status: Complete

#### Description

The three right-hand panels (`AgentStatusPane`, `InfoPane`, and `TodoPane`) should scroll their content independently while the borders remain fixed. Additionally, the vertical flex split between them should be distributed as `3fr`, `2fr`, `2fr`. "Scrolling with the border" causes jumping UI elements and bad aesthetics. By letting Textual handle the borders and moving `overflow-y` to the pane itself (rather than wrapping it in a `VerticalScroll`), the border boundaries stay rigid while the content alone scrolls. Beautiful but simplistic UX.

#### Implementation Notes

**Requirement: TUI Scrolling Inside Borders:**

**Changes:**

1. Removed `rich.panel.Panel` wrappers in `render()` phase of the three widgets.

2. Migrated border usage to native Textual `styles.border` and `border_title` / `border_subtitle`.

3. Applied `overflow-y: auto;` in `app.tcss` instead of nesting within `VerticalScroll`.

4. Adjusted layout constants in `app.py` for a 3:2:2 ratio.

**Status:**

Complete.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Rotaris - TUI Display Configuration for Tool Events (2026-06-03)

Original: `docs/requirement-log/done/requirements-20260603-tool-result-truncation.md` — document status: Complete

#### Description

Users want both tool call inputs (commands, arguments) and tool call results (output, grep results, terminal output, etc.) displayed in the TUI transcript truncated to configurable numbers of lines. Currently, large tool inputs and results flood the transcript, making it hard to follow the conversation. Each direction (inputs/results) has independent show/hide toggles and line limits adjustable via the settings screen accessible from the command palette. Settings persist in workspace config.

**Problem being solved:**

Tool inputs (e.g., a massive `write_file` content, a long `grep` command with many arguments) and tool results (e.g., reading a large file, searching a large codebase, fetching a web page) can each be thousands of lines long. When rendered in full in the transcript, they overwhelm the chat, require excessive scrolling, and obscure the conversational flow. Users need independent control over how much tool input and tool output they see.

**Current behaviour:**

- `ChatPanel.add_tool_event()` renders tool events as a single `Text` line with no truncation.

- `show_tool_events` maps to `config.display.show_tool_results` (a property backed by persisted YAML).

- Tool **result** truncation exists (via `tool_result_max_lines`), but tool **inputs** are not truncated.

- No mechanism exists to limit rendered lines of tool input content.

- Full content is stored in `session.transcript_events` and used for model context.

**What needs to change:**

1. Add persistent config fields `display.show_tool_inputs` and `display.tool_input_max_lines`.

2. Distinguish tool input events (no `phase` key, from scheduler/compressor) from tool result events (has `phase` key).

3. Truncate tool input content at render time in `ChatPanel.add_tool_event()` with a distinct label.

4. Extend settings screen with input-specific controls (show/hide switch + line limit select).

5. Truncation is render-only - full content remains in session transcript for model context.

#### Implementation Notes

**Requirements - Tool Event Truncation in Transcript:**

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] When `show_tool_results=True` and `tool_result_max_lines=10`, a tool result with 50 lines renders the first 10 lines plus `… +40 more lines, tool result truncated`.

- [x] When `show_tool_inputs=True` and `tool_input_max_lines=2`, a tool input with 20 lines renders the first 2 lines plus `… +18 more lines, tool call input truncated`.

- [x] When `show_tool_results=False`, tool results are not rendered at all.

- [x] When `show_tool_inputs=False`, tool inputs are not rendered at all.

- [x] Toggling via command palette ("Toggle tool results") persists across session restarts.

- [x] Opening "Tool result settings" from the command palette shows switches and line limit dropdowns for both results and inputs.

- [x] Changing max lines to 5 and saving immediately affects the next tool event render.

- [x] Full tool input/result content remains in `session.transcript_events` regardless of truncation settings.

- [x] Config changes are written atomically to workspace `.rotaris/agents.yaml` under a `display:` key.

- [x] Tool event truncation does not affect agent messages, reasoning blocks, system messages, or user messages.

- [x] Tool inputs (no `phase` key) and tool results (has `phase` key) are correctly distinguished in `_render_chat_event`.
