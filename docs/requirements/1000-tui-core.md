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

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
