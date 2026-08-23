---
req-id:
  [
    SWR-2000,
    SWR-2001,
    SWR-2002,
    SWR-2003,
    SWR-2004,
    SWR-2005,
    SWR-2006,
    SWR-2007,
    SWR-2008,
    SWR-2009,
    SWR-2010,
    SWR-2011,
    SWR-2012,
    SWR-2013,
    SWR-2014,
    SWR-2015,
    SWR-2016,
    SWR-2017,
    SWR-2018,
    SWR-2019,
    SWR-2020,
    SWR-2021,
    SWR-2022,
    SWR-2023,
    SWR-2024,
    SWR-2025,
    SWR-2026,
    SWR-2027,
    SWR-2028,
    SWR-2029,
    SWR-2030,
    SWR-2031,
    SWR-2032,
    SWR-2033,
    SWR-2034,
    SWR-2035,
    SWR-2036,
    SWR-2037,
    SWR-2038,
    SWR-2039,
    SWR-2040,
    SWR-2041,
    SWR-2042,
    SWR-2043,
    SWR-2044,
    SWR-2045,
    SWR-2046,
    SWR-2047,
    SWR-2048,
    SWR-2049,
    SWR-2050,
    SWR-2051,
    SWR-2052,
    SWR-2053,
    SWR-2054,
    SWR-2055,
    SWR-2056,
    SWR-2057,
    SWR-2058,
    SWR-2059,
    SWR-2060,
    SWR-2061,
    SWR-2062,
    SWR-2063,
    SWR-2064,
    SWR-2065,
    SWR-2066,
    SWR-2067,
    SWR-2068,
    SWR-2069,
    SWR-2070,
    SWR-2071,
    SWR-2072,
    SWR-2073,
    SWR-2074,
    SWR-2075,
    SWR-2076,
    SWR-2077,
    SWR-2078,
    SWR-2079,
    SWR-2080,
    SWR-2081,
    SWR-2082,
    SWR-2083,
    SWR-2084,
    SWR-2085,
    SWR-2086,
    SWR-2087,
    SWR-2088,
    SWR-2097,
    SWR-2098,
  ]
status: approved
trace: required
test: required
title: "Rotaris Desktop"
---

# 2000-rotaris-desktop spec

## SWR-2098 — Skill injection controls

Settings → Skills must let a user control each discovered portable skill's invocation
policy (`default`, `manual-only`, or `auto-only`) and load policy (`on-demand`,
`always`, `manual-only`, or `hidden`). The chosen workspace policy is persisted
in `.rotaris/agents.yaml` and controls construction of subsequent agents:
hidden skills are absent from the injected catalog, on-demand skills expose only
metadata, manual-only skills remain available to user invocation but are absent
from the model catalog, and always-loaded skills include their full `SKILL.md`
body. A global enable switch must prevent all portable-skill injection. Existing
workspaces default to on-demand and default invocation.

Traces: `src/rotaris_core/config/schema.py`, `src/rotaris_core/skills/catalog.py`,
`src/rotaris_core/agents/factory.py`, `apps/rotaris/src/rotaris/models/store.py`,
`apps/rotaris/src/rotaris/services/config_service.py`,
`apps/rotaris/src/rotaris/views/settings.py`.

Verifies: `tests/unit/test_skill_agent_injection.py`,
`apps/rotaris/tests/test_views.py`, `apps/rotaris/tests/test_services.py`.

## SWR-2000 — Rotaris Desktop

trace: optional
test: optional

PySide6 desktop app: workspace views, transcript rendering and performance, provider auth, model slots, prompt queue, diagnostics, and skill scoping.

## SWR-2001 — PySide6 desktop package under `apps/rotaris` in the Rotaris monorepo.

trace: optional
test: optional
legacy-id: FR-ROTARIS-001
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2002 — Six primary views: Overview, Workspace, Mission, Git, Library, Settings.

legacy-id: FR-ROTARIS-002
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2003 — Agent delegation tree, lifecycle state, context use, tools, artifacts, model, and reasoning controls.

legacy-id: FR-ROTARIS-003
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2004 — Separate persona windows with one tab per agent instance.

legacy-id: FR-ROTARIS-004
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2005 — Git branch, worktree, diff-stat, commit history, and worktree-creation workflows.

legacy-id: FR-ROTARIS-005
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2006 — Layered config, MCP, skills, models, personas, runtime policy, and workspace settings persistence.

legacy-id: FR-ROTARIS-006
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2007 — Non-blocking run bridge with persisted live lifecycle polling, pause, resume, and steering.

legacy-id: FR-ROTARIS-007
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2008 — Session browser and persisted session reattachment.

legacy-id: FR-ROTARIS-008
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2009 — pytest-qt coverage for primary frontend workflows.

trace: optional
test: optional
legacy-id: FR-ROTARIS-009
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2010 — Root setup, run, lint, typecheck, and test commands include desktop app.

trace: optional
test: optional
legacy-id: FR-ROTARIS-010
date: 2026-07-11
source: docs/requirement-log/done/requirements-20260711-rotaris-desktop.md

## SWR-2011 — Tool `ActionEvent` handling updates persisted global and per-agent call counters immediately.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-live-tool-metrics.md

## SWR-2012 — Replayed events with the same agent and tool-call ID do not inflate counters.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-live-tool-metrics.md

## SWR-2013 — Child inspector nodes expose live count and called-tool history.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-live-tool-metrics.md

## SWR-2014 — Synthetic root/orchestrator node exposes aggregate run count and called-tool history.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-live-tool-metrics.md

## SWR-2015 — Existing active-tool start/result tracking remains unchanged.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-live-tool-metrics.md

## SWR-2016 — Workspace transcript messages with `kind == \"message\"` from agent roles must render Markdown as Qt rich text (HTML subset). Code fences must use monospace styling with a distinct background; bold, italic, inline code, and links must be visually distinct.

legacy-id: REQ-20260713-001
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md
priority: High

## SWR-2017 — Streaming/in-progress messages must degrade gracefully when Markdown is incomplete (unclosed fences, partial links). The renderer must not crash or produce garbled output on partial input.

legacy-id: REQ-20260713-002
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md
priority: High

## SWR-2018 — Artifact dialog must show a rendered Markdown preview alongside (or toggleable with) the raw editor. The editor itself stays plain text for editing.

legacy-id: REQ-20260713-003
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md
priority: Medium

## SWR-2019 — Any other Rotaris view that displays model-authored content (library card previews, mission summaries, inspector detail fields) must also render Markdown where the content originates from a model response.

legacy-id: REQ-20260713-004
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md
priority: Medium

## SWR-2020 — Links in rendered Markdown must be clickable — opening in the system browser (consistent with `ChatPanel._open_url` in the TUI).

legacy-id: REQ-20260713-005
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md
priority: Medium

## SWR-2021 — A lightweight Markdown→HTML converter must be added as a Rotaris dependency. No network calls at render time; conversion is synchronous and fast enough for 60fps transcript rebuilds on poll ticks (currently every ~750ms).

trace: optional
test: optional
legacy-id: REQ-20260713-006
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md
priority: High

## SWR-2022 — Per-slot control

legacy-id: FR-ROTARIS-MODEL-THINKING-001
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-model-slot-thinking.md

Each model slot must show an accessible thinking-strength selector with provider default, auto, low, medium, high, and max where supported.

## SWR-2023 — Persist and apply

legacy-id: FR-ROTARIS-MODEL-THINKING-002
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-model-slot-thinking.md

Selected strengths must persist through existing `*_thinking` workspace fields and reach runtime model configuration.

## SWR-2024 — Normalize run lifecycle state and expose clear start, running, pause, cancel, completion, failure, quota, and recovery feedback.

legacy-id: FR-ROTARIS-UX-001
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2025 — Keep Workspace usable at `1000×680`; render agent/todo and inspector panes as mutually exclusive overlay drawers at compact widths.

legacy-id: FR-ROTARIS-UX-002
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2026 — Make composer modes explicit, lock invalid submission during active runs, preserve prompt history and stash, and support shell-style prompt recall.

legacy-id: FR-ROTARIS-UX-003
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

The composer states its mode through the primary action beside it — `Start
run`, `Continue run`, or `Queue` while a run is active — and through the
placeholder text. The separate in-box mode label was removed (2026-08-23) as
redundant: the action and the placeholder already say it, and the label
competed with the model and persona chips for the composer's front row.

## SWR-2027 — Provide transcript search, match navigation, new-output indication, collapsible reasoning, manual compression, and confirmed transcript clearing.

legacy-id: FR-ROTARIS-UX-004
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2028 — Support phase-aware inline todo add, rename, and remove with stable backend IDs, optimistic UI updates, live run write-through, and saved-session persistence.

legacy-id: FR-ROTARIS-UX-005
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2029 — Provide onboarding, contextual primary actions, useful empty states, progress states, and disabled-reason text across all six views.

legacy-id: FR-ROTARIS-UX-006
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2030 — Centralize commands and expose keyboard access for navigation, settings, search, composer focus/submission, help, and overlay dismissal.

legacy-id: FR-ROTARIS-UX-007
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

Rotaris must provide discoverable keyboard shortcuts for primary actions through a central
command registry (`CommandRegistry`). Keyboard help must be accessible via `F1`.

The workspace composer (`PromptComposer`) must intercept **Enter** (no modifier) to
submit the current prompt and **Shift+Enter** to insert a newline. The composer widget
handles this directly via its `keyPressEvent`, emitting a `submit_requested` signal on
Enter. The existing `Ctrl+Return` global shortcut is retained for submission when the
composer does not have focus.

| Shortcut      | Scope            | Action                   |
| ------------- | ---------------- | ------------------------ |
| `Enter`       | Composer focused | Submit prompt            |
| `Shift+Enter` | Composer focused | Insert newline           |
| `Ctrl+Return` | Global           | Submit prompt (fallback) |
| `Ctrl+L`      | Global           | Focus composer           |
| `Ctrl+,`      | Global           | Open Settings            |
| `Ctrl+F`      | Global           | Search transcript        |
| `F1`          | Global           | Keyboard help            |
| `Escape`      | Global           | Close current overlay    |

Implementation: `PromptComposer.submit_requested` signal → `WorkspaceView._submit()`.

## SWR-2031 — Preserve unsaved settings with save/discard/cancel flow and explicitly confirm access outside the workspace.

legacy-id: FR-ROTARIS-UX-008
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2032 — Improve focus visibility, accessible names/descriptions, component-boundary contrast, and small secondary-text contrast.

trace: optional
test: optional
legacy-id: FR-ROTARIS-UX-009
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2033 — Persist actionable completion/failure notices and copyable technical details instead of relying only on transient toasts.

legacy-id: FR-ROTARIS-UX-010
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2034 — Validate Rotaris tests, Ruff, and mypy on Ubuntu and Windows with offscreen Qt.

trace: optional
test: optional
legacy-id: FR-ROTARIS-UX-011
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md

## SWR-2035 — `FR-ROTARIS-PROMPT-QUEUE-001`: Active runs keep the composer editable and label submission as

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-prompt-queue-and-stash.md

## SWR-2036 — `FR-ROTARIS-PROMPT-QUEUE-002`: Queued messages appear in a persistent, scrollable panel directly

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-prompt-queue-and-stash.md

## SWR-2037 — `FR-ROTARIS-PROMPT-QUEUE-003`: Each pending message can be edited or deleted before backend

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-prompt-queue-and-stash.md

## SWR-2038 — `FR-ROTARIS-PROMPT-STASH-001`: Workspace transcript toolbar exposes prompt stash count and a

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-prompt-queue-and-stash.md

## SWR-2039 — `FR-ROTARIS-PROMPT-STASH-002`: `Apply` copies a selected stash entry into the composer while

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-prompt-queue-and-stash.md

## SWR-2040 — Provider health check

legacy-id: FR-ROTARIS-PROVIDER-AUTH-001
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-provider-auth.md

Rotaris must check local authentication status and validate authenticated providers through their free model-discovery endpoint or provider-specific equivalent.

## SWR-2041 — Truthful status indicator

legacy-id: FR-ROTARIS-PROVIDER-AUTH-002
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-provider-auth.md

Provider dots must distinguish checking, healthy, warning, unauthenticated, and failed states instead of always displaying green.

## SWR-2042 — Manage authentication

legacy-id: FR-ROTARIS-PROVIDER-AUTH-003
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-provider-auth.md

Each supported provider row must offer authenticate/re-authenticate and logout actions, with confirmation before logout.

## SWR-2043 — Authentication modal

legacy-id: FR-ROTARIS-PROVIDER-AUTH-004
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-provider-auth.md

Authentication must use a modal that securely prompts for API keys or displays OAuth/device-code instructions, validates credentials, and persists discovered models like `rotaris-cli login`.

## SWR-2044 — Responsive desktop

legacy-id: FR-ROTARIS-PROVIDER-AUTH-005
date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-provider-auth.md

Network and provider authentication work must run outside the Qt UI thread and surface failures in the provider row or modal.

## SWR-2045 — Force-load configuration — per-session storage\*\*: A session-scoped record of which skills are force-loaded and for which agents. Each entry identifies the skill and its scoping (session-wide, per-persona, or per-agent-instance). Absence of configuration means no skills are force-loaded (backward compatible).

status: draft
legacy-id: REQ-20260713-001
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: High

## SWR-2046 — Persistent body injection\*\*: When an agent is constructed, force-loaded skills matching that agent's scope must have their full body injected into the agent's context. The injection must survive context compaction. Skills not force-loaded must continue to participate only through the existing metadata catalog / on-demand retrieval flow.

status: draft
legacy-id: REQ-20260713-002
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: High

## SWR-2047 — Rotaris Skills tab — force-load toggle\*\*: Each discovered skill in the Skills tab must have a toggle control. When activated, the skill body is force-loaded for the configured scope. When deactivated, the skill reverts to metadata-catalog-only participation. Toggle changes take effect immediately.

status: draft
legacy-id: REQ-20260713-003
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: High

## SWR-2048 — Rotaris Skills tab — scope selector\*\*: Each skill must have a scope control with at minimum: session-wide (all agents) and per-persona (select from configured personas). Per-agent-instance pattern matching is a valid scope option but its UI may be deferred. Scope changes take effect immediately.

status: draft
legacy-id: REQ-20260713-004
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: High

## SWR-2049 — Rotaris Skills tab — body-in-context indicator\*\*: Each skill row must show whether that skill's body is currently loaded in the selected agent's context.

status: draft
legacy-id: REQ-20260713-005
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: Medium

## SWR-2050 — Rotaris Skills tab — rescan\*\*: A rescan action must re-discover skills from disk, preserve force-load configuration for skills still present, add newly discovered skills with force-load off, and remove entries for skills no longer on disk.

status: draft
legacy-id: REQ-20260713-006
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: Medium

## SWR-2051 — Rotaris workspace composer — skill visibility\*\*: Force-loaded skills applicable to the currently selected persona must be shown as visible, removable indicators near the persona and model selectors. Removing an indicator deactivates the force-load for that skill+persona combination. Indicators must update when the persona selector changes.

status: draft
legacy-id: REQ-20260713-007
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: Medium

## SWR-2052 — Automatic skill detection on workspace open\*\*: Skill discovery must run automatically when a workspace is opened, with no user action required. The skill catalog must be available before any agent is constructed. (Already implemented — confirmed requirement.)

status: draft
legacy-id: REQ-20260713-008
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: High

## SWR-2053 — Backward compatibility\*\*: When no force-load configuration exists, all skills must behave exactly as they do today — metadata catalog only, no bodies pre-loaded. Zero migration cost for existing workspaces.

status: draft
legacy-id: REQ-20260713-009
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: High

## SWR-2054 — Force-load survives agent restarts within session\*\*: Force-load configuration must persist across run stop/start within the same Rotaris session. It is cleared when the workspace is closed (session-scoped).

status: draft
legacy-id: REQ-20260713-010
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: Medium

## SWR-2055 — Metadata catalog completeness\*\*: The metadata catalog that each agent receives must continue to list ALL discovered skills, including those that are force-loaded. Force-loading a body must not remove that skill from the catalog — agents must always know what skills are available.

status: draft
legacy-id: REQ-20260713-011
date: 2026-07-13
source: docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md
priority: High

## SWR-2056 — Replayed `MessageEvent` objects with the same stable event ID are persisted once.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-message-deduplication.md

## SWR-2057 — Cumulative committed text snapshots update the current response row instead of appending rows.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-message-deduplication.md

## SWR-2058 — A streamed response still finalizes in place.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-message-deduplication.md

## SWR-2059 — A response after a tool boundary or a new streaming segment remains a distinct row.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-message-deduplication.md

## SWR-2060 — Identical persisted session snapshots emit no store signals that trigger UI refreshes.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-render-performance.md

## SWR-2061 — Unchanged transcript refreshes perform no Qt layout work.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-render-performance.md

## SWR-2062 — Streamed message updates retain their existing row widget and remeasure only that row.

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-render-performance.md

## SWR-2063 — Added, removed, or structurally changed transcript events continue to update scroll extent and

date: 2026-07-13
source: docs/requirement-log/done/requirements-20260713-rotaris-transcript-render-performance.md

## SWR-2064 — Synchronous LiteLLM streams must not expand the process to the 100-worker per-chunk logging pool.

legacy-id: REQ-20260714-ROTARIS-MEM-001
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

## SWR-2065 — OpenHands streaming, token callbacks, usage metrics, and telemetry must remain active.

legacy-id: REQ-20260714-ROTARIS-MEM-002
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

## SWR-2066 — Rotaris live session refresh must perform snapshot I/O and projection outside the Qt event loop, with one read in flight and one coalesced pending refresh.

legacy-id: REQ-20260714-ROTARIS-MEM-003
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

**Scope narrowed by [SWR-2454 — The live view keeps up with the run](2000-rotaris-desktop/SWR-2454-live-view-keeps-up-with-the-run.md).**
This requirement is not superseded: its property — no run-driven I/O or
projection on the Qt event loop — is one SWR-2454 explicitly preserves, and it
remains binding. What SWR-2454 removes is the assumption behind the second half
of the sentence: that a periodic whole-session *refresh* is how the desktop
learns what a run is doing. Where that assumption no longer holds, "one read in
flight and one coalesced pending refresh" governs the reconciling read that
remains — the one serving sessions this process is not executing — rather than
the focused session's liveness. Read the two together; neither alone states the
whole obligation.

## SWR-2067 — Reasoning-content repair must run before execution resumes, never during read-only UI polling.

legacy-id: REQ-20260714-ROTARIS-MEM-004
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

## SWR-2068 — Diagnostic trigger and close snapshots must not call `tracemalloc.take_snapshot()` on the Qt thread.

legacy-id: REQ-20260714-ROTARIS-MEM-005
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

## SWR-2069 — Diagnostic in-memory statistics, streams, allocation work, and snapshot bytes must remain bounded.

legacy-id: REQ-20260714-ROTARIS-MEM-006
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

## SWR-2070 — Repeated provider-health updates must reuse the existing Settings widget tree.

legacy-id: REQ-20260714-ROTARIS-MEM-007
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

## SWR-2071 — Benchmark output must expose robust RSS trend, handle, thread, widget, and event-loop measurements.

legacy-id: REQ-20260714-ROTARIS-MEM-008
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md

## SWR-2072 — Persona model control

legacy-id: FR-ROTARIS-PERSONA-MODEL-001
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-per-persona-model-selection.md

Each persona exposes model slots and concrete catalog models in an accessible selector.

## SWR-2073 — Persona reasoning control

legacy-id: FR-ROTARIS-PERSONA-MODEL-002
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-per-persona-model-selection.md

Each persona exposes provider default and supported reasoning levels.

## SWR-2074 — Durable scope

legacy-id: FR-ROTARIS-PERSONA-MODEL-003
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-per-persona-model-selection.md

Persona model and reasoning edits persist only to the selected workspace or global
`agents.yaml`. Switching edit scope displays that layer's value and must not copy or mutate
values from the previously selected scope.

## SWR-2075 — Origin and fallback

legacy-id: FR-ROTARIS-PERSONA-MODEL-004
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-per-persona-model-selection.md

Each field shows the origin of the value visible in the selected edit scope. Workspace values
fall back to global and then default values; global values fall back to defaults. An explicit
workspace or global override can be unset without modifying the other configuration layer.

## SWR-2076 — Save and discard

legacy-id: FR-ROTARIS-PERSONA-MODEL-005
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-per-persona-model-selection.md

Persona values and pending unsets participate in Settings dirty-state save/discard behavior.
Navigating between edit scopes is transient UI state and does not make Settings dirty.

## SWR-2077 — Rotaris needs evidence for long-run UI slowdowns and memory growth without imposing profiling overhead on normal runs. It also needs a deterministic, backend-free way to replay UI-visible persisted session data and compare rendering behavior across revisions.

trace: optional
test: optional
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-ui-diagnostics-benchmark.md

## SWR-2078 — Transcript rendering shall not allocate one persistent QWidget tree per event.

legacy-id: REQ-20260714-001
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-virtual-transcript.md

## SWR-2079 — Snapshot updates shall notify Qt only about inserted, removed, or changed rows.

legacy-id: REQ-20260714-002
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-virtual-transcript.md

## SWR-2080 — Tail updates and resize work shall remain interactive for transcripts with at least 1,000 events.

legacy-id: REQ-20260714-003
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-virtual-transcript.md

## SWR-2081 — Markdown, safe HTML escaping, external links, collapsible reasoning, search navigation, reader scroll position, stable tail following, and exact message copy shall remain available.

legacy-id: REQ-20260714-004
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-virtual-transcript.md

## SWR-2082 — Markdown caching shall have both entry-count and retained-content bounds so streamed revisions cannot grow memory without limit.

legacy-id: REQ-20260714-005
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-virtual-transcript.md

## SWR-2083 — New transcript output shall not expose an unpainted or black viewport frame during model updates.

legacy-id: REQ-20260714-006
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-rotaris-virtual-transcript.md

## SWR-2084 — Inspector wired to backend

legacy-id: FR-ROTARIS-TRUTHFUL-CONTROLS-001
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-truthful-controls.md

Replace `WorkspaceStore.set_agent_model()` / `set_agent_reasoning()` in the Rotaris inspector with `RunBridge.switch_entry_model()` / `switch_entry_reasoning()`. Orchestrator controls are enabled only during an active run, and the scope note reads “takes effect from the next iteration.”

## SWR-2085 — Backend reasoning seam

legacy-id: FR-ROTARIS-TRUTHFUL-CONTROLS-002
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-truthful-controls.md

Add `switch_entry_reasoning()` mirroring `switch_entry_model()` across `RunBridge`, `_RunWorker`, and `_SessionObserver`, and consume `entry_reasoning_override` in `resolve_model` so the next entry agent receives the selected reasoning effort.

## SWR-2086 — Child-agent controls read-only

legacy-id: FR-ROTARIS-TRUTHFUL-CONTROLS-003
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-truthful-controls.md

Disable model and reasoning controls for non-orchestrator agents and terminal agents. Scope note reads “Model and reasoning are set per persona. Edit in Settings → Personas.”

## SWR-2087 — Auxiliary window controls removed

legacy-id: FR-ROTARIS-TRUTHFUL-CONTROLS-004
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-truthful-controls.md

Remove editable `QComboBox` and `SegmentedControl` for model and reasoning from auxiliary agent windows. Replace with read-only `QLabel` values so the windows reflect rather than claim to change runtime state.

## SWR-2088 — Next-iteration semantics explicit

legacy-id: FR-ROTARIS-TRUTHFUL-CONTROLS-005
date: 2026-07-14
source: docs/requirement-log/done/requirements-20260714-truthful-controls.md

All orchestrator model and reasoning controls explicitly convey “takes effect from the next iteration” so users understand the change window.

## SWR-2097 — MCP server live status indicator

date: 2026-07-22
priority: Medium

Settings → MCP Servers shows a per-server status dot next to each configured server, reflecting whether it is actually reachable — not just whether its command is on `PATH` (the existing `available` check). States: unknown (not yet checked), checking (probe in flight, pulsing dot), healthy (connected, tool count in tooltip), unreachable (probe failed, error in tooltip). A "Check status" button in the card header triggers an on-demand probe of all configured servers; probing does not block the GUI thread. Status is not persisted across app restarts — every launch starts at "unknown" until checked.

Derived requirements: [SWR-1732 — MCP server health probe](1700-config-mcp/SWR-1732-mcp-server-health-probe.md)

## SWR-2428 — Live terminal preview in the transcript and interactive pop-out

A running shell command streams its live terminal screen into its transcript row, with ANSI
colour and cursor addressing, and the same terminal opens in a separate interactive window
from the row, from a workspace toolbar control, or from `Ctrl+Shift+T`. Typing is forwarded
only after the user takes control; interrupt and kill stay available, and kill is confirmed.
A finished command's row folds back to an ordinary tool row showing that command's own output.

Full requirement: [SWR-2428 — Live terminal preview in the transcript and interactive pop-out](2000-rotaris-desktop/SWR-2428-terminal-session-workspace-integration.md)

## SWR-2429 — Terminal emulator widget

Technical requirement derived from SWR-2428. A monospace character-grid widget paints an
emulated terminal screen — per-cell colour and attributes, cursor, scrollback, selection —
and encodes key presses into the backend's key vocabulary, reporting the keys it discards
while input is disabled and keeping a keyboard path to the scrollback while it is armed.

Full requirement: [SWR-2429 — Terminal emulator widget](2000-rotaris-desktop/SWR-2429-terminal-emulator-widget.md)

## SWR-2431 — In-App Workspace Selection

status: draft

The user must be able to set and change the active workspace path from within
the Rotaris UI, without relying on the CLI launch argument. This enables
workspace selection when Rotaris is launched outside a terminal (desktop
shortcut, application launcher, file association).

Two access points expose the same directory-browser dialog:

- **Title bar workspace chip** — the existing workspace-path chip in the title
  bar is clickable and opens a native directory chooser.
- **Settings view** — a workspace path row with the current path and a "Browse…"
  button that opens the same directory chooser.

When no workspace has been set, the main window opens in an empty-workspace
state: the title bar chip shows a placeholder, the Settings row shows an empty
path, and dependent views display their existing empty-state prompts.

Changing the workspace reloads configuration, sessions, git state, skills, and
MCP servers for the new path. If a run is active when the workspace changes,
the active run continues against the old workspace; new runs use the new
workspace. A dismissible notice informs the user when a workspace switch leaves
an active run on the previous workspace. Previously opened agent windows stay
open and continue to reflect the old workspace's transcripts.

Full requirement: [SWR-2431 — In-App Workspace Selection](2000-rotaris-desktop/SWR-2431-in-app-workspace-selection.md)

## SWR-2432 — Consecutive tool-call grouping in transcript

Consecutive `kind == "tool"` rows uninterrupted by messages or thinking render as a single
collapsible group row with gerund labels ("reading · editing"). Clicking expands to reveal
individual rows — bottommost expanded, upper ones collapsed. Single calls stay standalone.
Layers on SWR-2417/SWR-2420.

Full requirement: [SWR-2432 — Consecutive tool-call grouping in transcript](2000-rotaris-desktop/SWR-2432-tool-call-grouping.md)

## SWR-2433 — Delegation context header in child-agent transcript

When a user selects a child agent, a collapsible header above the transcript shows the
delegation parameters — task description, persona, category, background/blocking mode,
and dependencies — so the user immediately sees what the child was asked to do.
Collapsed state shows a single-line summary. Root agents show no header.

Full requirement: [SWR-2433 — Delegation context header in child-agent transcript](2000-rotaris-desktop/SWR-2433-delegation-context-header.md)

## SWR-2438 — Composer slash commands execute instead of starting a run

Submitting a single-line composer entry that begins with `/` invokes the named command
instead of sending its literal text to an agent. `/ ` is an escape for ordinary prompts,
multi-line text is never a command, and unknown or unavailable commands report the reason
while keeping the user's text in the composer.

Full requirement: [SWR-2438 — Composer slash commands execute instead of starting a run](2000-rotaris-desktop/SWR-2438-composer-slash-command-execution.md)

## SWR-2439 — Slash command suggestion popup in the composer

Typing `/` opens a focus-free suggestion list above the composer and narrows it on every
keystroke, ranking prefix matches ahead of substring and description matches. Unavailable
commands stay listed with their reason (SWR-2124).

Full requirement: [SWR-2439 — Slash command suggestion popup in the composer](2000-rotaris-desktop/SWR-2439-slash-command-suggestion-popup.md)

## SWR-2440 — Composer highlights whether a typed slash command matches

The leading `/name` token is coloured as resolved, partial, or unknown while it is typed, so
a typo is visible before submission. Arguments render as secondary text. All colours come
from `rotaris.theme` and clear the contrast floor.

Full requirement: [SWR-2440 — Composer highlights whether a typed slash command matches](2000-rotaris-desktop/SWR-2440-slash-command-match-highlighting.md)

## SWR-2441 — Slash popup keyboard navigation takes precedence over history recall

While the popup is open, `↑`/`↓` move the selection instead of recalling prompt history,
`Tab`/`Enter` complete the selected command without submitting, and `Escape` closes the
popup. With the popup closed, every binding behaves as before (SWR-2003).

Full requirement: [SWR-2441 — Slash popup keyboard navigation takes precedence over history recall](2000-rotaris-desktop/SWR-2441-slash-popup-keyboard-navigation.md)

## SWR-2442 — Slash command catalogue covers palette actions, run control, and skills

The catalogue mirrors every `CommandRegistry` entry (SWR-2030), adds run-control commands
over existing main-window behaviour, adds `/model` and `/persona` with validated arguments,
and exposes user-invocable skills. It rebuilds when settings change.

Full requirement: [SWR-2442 — Slash command catalogue covers palette actions, run control, and skills](2000-rotaris-desktop/SWR-2442-slash-command-catalogue.md)

## SWR-2443 — Framework-free slash command registry

Technical requirement derived from SWR-2438. Parsing, ranking, availability, and dispatch
live in a Qt-free `rotaris/models/` module that does not import `rotaris_core.tui`, so the
rules are testable without a `QApplication`.

Full requirement: [SWR-2443 — Framework-free slash command registry](2000-rotaris-desktop/SWR-2443-slash-command-registry.md)

## SWR-2444 — Structured tool rows in the Nocturne mono idiom

Tool rows carry a machine-readable `status` (running/ok/failed/blocked) and `duration`
instead of a glyph baked into the result text, and render per the design comp: a mono
`▸ toolname args` header with the chevron + name in teal and the outcome trailing inline
in the status colour (`ok · 3.2s`, `failed`, pulsing `◉ running…`). Legacy rows with a
`✓`/`✗`/`!` prefix render without the glyph.

Full requirement: [SWR-2444 — Structured tool rows in the Nocturne mono idiom](2000-rotaris-desktop/SWR-2444-structured-tool-rows.md)

## SWR-2445 — Expanded tool rows render an INPUT/OUTPUT rail card

Expanding a tool row (SWR-2417) shows a Nocturne rail card — surface, border, 2px
status-coloured left rail — with uppercase `INPUT`/`OUTPUT` micro-labels over the full
call summary and result. Collapsed rows keep a one-line dim result preview behind a `⤷`
glyph after the header.

Full requirement: [SWR-2445 — Expanded tool rows render an INPUT/OUTPUT rail card](2000-rotaris-desktop/SWR-2445-tool-in-out-panel.md)

## SWR-2446 — Thinking rows show duration and a live token estimate

Thinking rows summarise as a mono `▸ reasoning · 7s · ~230 tok` header in the accent
family; while reasoning streams they read `◉ reasoning… 7s · ~230 tok` with a pulsing dot
and both numbers counting upward. The bridge stamps `started_at`, accumulates streamed
`chars` (past the content cap), and stamps `duration` when the burst ends. Token figures
are `chars/4` estimates.

Full requirement: [SWR-2446 — Thinking rows show duration and a live token estimate](2000-rotaris-desktop/SWR-2446-thinking-duration-token-counter.md)

## SWR-2447 — Transcript repaints on a timer while a row is live

A ~1 s repaint timer runs only while the model holds a live thinking row or a running tool
row, so elapsed labels keep counting between store refreshes and an idle transcript costs
no wakeups.

Full requirement: [SWR-2447 — Transcript repaints on a timer while a row is live](2000-rotaris-desktop/SWR-2447-live-transcript-repaint-tick.md)

## SWR-2448 — Row expansion state keyed by stable identity

Technical requirement derived from SWR-2417. Expanded/collapsed state keys on a stable
per-event identity (tool event key, thinking start, delegation agent id) rather than the row
index, so open boxes survive rows being inserted above them in a live transcript.

Full requirement: [SWR-2448 — Row expansion state keyed by stable identity](2000-rotaris-desktop/SWR-2448-stable-expansion-identity.md)

## SWR-2449 — Copy tool input/output from the transcript context menu

Right-clicking a tool row adds "Copy tool input" and "Copy tool output" to the context
menu, copying the untruncated call summary and result; entries are disabled when empty and
absent on non-tool rows.

Full requirement: [SWR-2449 — Copy tool input/output from the transcript context menu](2000-rotaris-desktop/SWR-2449-copy-tool-input-output.md)

## SWR-2450 — Full agents.yaml configurability in Settings

Settings → Personas gains a per-persona detail panel covering every PersonaConfig
field: delegation drag-and-drop, a block-based system prompt editor with inline token chips,
MCP server assignment, persona flags, and advanced options. A new General card exposes
top-level defaults (default persona, model slots, summary model). The Runtime tab gets a
Circuit Breaker card. All controls participate in save/discard and workspace/global scoping.

Full requirement: [SWR-2450 — Full agents.yaml configurability in Settings](2000-rotaris-desktop/SWR-2450-agents-yaml-configurability.md)

## SWR-2451 — Create and delete personas from Settings UI

Settings → Personas gains a `+ New Persona` button and right-click Duplicate / Delete
actions. The create dialog captures name, purpose, model, starter tools, and an optional
clone source with scope selection. Delete confirms with safety guards: cascade removed
delegates_to references, blocks on default_persona or last-remaining persona, and warns
on active sessions. Built-in personas are protected from deletion.

Full requirement: [SWR-2451 — Create and delete personas from Settings UI](2000-rotaris-desktop/SWR-2451-create-delete-personas.md)

## SWR-2452 — Transcript geometry is incremental and never partially laid out

Technical requirement derived from SWR-2447. The transcript view owns its row geometry
instead of borrowing `QListView`'s, which discarded the whole item layout on every
insertion and every `dataChanged` and rebuilt it a batch per event-loop pass — leaving the
transcript blank for `rowCount / batchSize` frames on every refresh. Appending measures the
appended rows and their successor; painting touches only the visible rows.

Full requirement: [SWR-2452 — Transcript geometry is incremental and never partially laid out](2000-rotaris-desktop/SWR-2452-incremental-transcript-geometry.md)

## SWR-2453 — Every run the desktop starts is the same run as a CLI run

Every run the desktop starts must behave the same as one started from the CLI, the TUI
or the SDK for the same workspace, task and config, and no host may keep a private
re-composition of run-lifecycle behaviour — session creation and resume, locking,
worktree binding, event-store attach, session start/end, hook dispatch, per-iteration
checkpointing, result derivation, and release on every exit path. Satisfied on every
desktop run path since 2026-08-23: the worktree integration run was the last holdout
and the second half of the exemption SWR-1830 recorded. States sameness, not
mechanism: the desktop keeps its own event loop, worker thread and session identity.

Full requirement: [SWR-2453 — Every run the desktop starts is the same run as a CLI run](2000-rotaris-desktop/SWR-2453-desktop-runs-on-the-shared-run-lifecycle.md)

## SWR-2454 — The live view keeps up with the run

While a run executes, the desktop's live surfaces must reflect new activity within a
bounded latency, and the per-update work must be proportional to what changed rather
than to how much the session has accumulated — a 3000-event session costs what a
30-event one costs. Preserves what any design must keep: sessions executing in another
process stay observable, the view never contradicts what a resume would restore, no
run-driven work on the Qt event loop (SWR-2066), and a failing view consumer never
touches the run. Narrows SWR-2066; extends SWR-2452's bounded-cost property upstream of
the view.

Full requirement: [SWR-2454 — The live view keeps up with the run](2000-rotaris-desktop/SWR-2454-live-view-keeps-up-with-the-run.md)

## SWR-2913 — A session that is not running shows no live agent

The run header and the agent list are two readings of one snapshot (SWR-2122), and nothing
tied them together, so a snapshot whose `execution_status` and `child_states` disagreed was
rendered as a contradiction. The projection now reconciles the agents against the session
status, so a session that does not claim a run can never present a live agent — whatever it
reads back from disk.

Full requirement: [SWR-2913 — A session that is not running shows no live agent](2000-rotaris-desktop/SWR-2913-no-live-agent-in-a-finished-session.md)

## SWR-3005 — Persona-published artifacts in the chat transcript

When a persona publishes an artifact, the chat transcript shows a dedicated row with a
clickable hyperlink and — depending on a three-way display setting — the body clipped to the
first N lines with a fading gradient (partial, the default; N configurable, defaulting to 10),
only the hyperlink (hidden), or the entire body (full). Activating the link or the clipped
body opens the artifact dialog.

Full requirement: [SWR-3005 — Persona-published artifacts in the chat transcript](2000-rotaris-desktop/SWR-3005-published-artifacts-in-transcript.md)

## SWR-3006 — Sticky prompt header in the chat transcript

When a reader scrolls up away from the newest output, a header pinned to the top of the
transcript shows the most recent user prompt scrolled above the viewport, clipped to three
lines. Scrolling past earlier prompts updates it; clicking it scrolls back to that prompt.
Hidden while following the tail or when no user prompt exists.

Full requirement: [SWR-3006 — Sticky prompt header in the chat transcript](2000-rotaris-desktop/SWR-3006-sticky-prompt-header.md)

## SWR-3010 — The agent inspector lists the tools the agent actually has

The inspector's Tools field printed the persona's declared `tools:` list, which is neither the
native set the runtime resolved (it showed tools `coordinator_only` had already stripped) nor
inclusive of MCP tools (it showed none). It now lists the agent's resolved native tools plus
its granted MCP tools grouped per server (SWR-3008), falling back to the persona declaration
for a snapshot that recorded neither.

Full requirement: [SWR-3010 — The agent inspector lists the tools the agent actually has](2000-rotaris-desktop/SWR-3010-inspector-shows-the-real-tool-set.md)

## SWR-3011 — Every content pane is drag-resizable and remembers its size

Every pane that sits beside another one had a hard-coded width chosen for a 1440-wide
window. Panes are now separated by draggable, keyboard-reachable dividers with stated
minimums, and the sizes a user sets are global and survive a relaunch — including across
the 1180 px compact breakpoint, which still owns the overlay-drawer behaviour.

Full requirement: [SWR-3011 — Every content pane is drag-resizable and remembers its size](2000-rotaris-desktop/SWR-3011-resizable-persistent-panels.md)

## SWR-3012 — Panel sizes can be reset to their defaults from Settings

Settings → Interface gains a `Reset panel sizes` control that discards the stored sizes for
every divider in the application and snaps the live panes back to their defaults without a
relaunch, reporting completion afterwards.

Full requirement: [SWR-3012 — Panel sizes can be reset to their defaults from Settings](2000-rotaris-desktop/SWR-3012-reset-panel-sizes.md)

## SWR-3013 — Rotaris Cloud credit is visible before it runs out

Rotaris Cloud is prepaid, yet the app showed no balance anywhere. Overview gains a
`Rotaris Cloud credit` tile and the status bar a balance chip, both fed by a self-refreshing
background read; a run whose models the account cannot pay for is caught before it starts,
and a quota failure names the real balance.

Full requirement: [SWR-3013 — Rotaris Cloud credit is visible before it runs out](2000-rotaris-desktop/SWR-3013-cloud-credit-surface.md)

## SWR-3716 — The first launch offers Rotaris Cloud and lets the user in without it

A launch with no usable provider credential opens a first-launch guide: Rotaris Cloud
as the one recommendation, `Other providers` and `I have an API key` beside it, and a
skip that opens the application fully rather than leaving a shell behind a nag. After a
skip the guide is reachable from a dismissible notice, from Settings → Providers, and
from every surface that cannot start a run without a credential.

Full requirement: [SWR-3716 — The first launch offers Rotaris Cloud and lets the user in without it](2000-rotaris-desktop/SWR-3716-first-launch-provider-guide.md)

## SWR-3619 — Desktop terminal stream bridge and emulated screen

Technical requirement derived from SWR-2428. The desktop side of terminal streaming: a Qt
bridge that marshals engine-thread frames onto the GUI thread, and one emulated screen per
stream shared by the transcript preview and the pop-out so the two stages cannot disagree.

Full requirement: [SWR-3619 — Desktop terminal stream bridge and emulated screen](2000-rotaris-desktop/SWR-3619-terminal-stream-bridge.md)

## SWR-3621 — Image attachments in the desktop prompt

The desktop prompt accepts image attachments via drag-and-drop or a file picker,
validates format and size, and delivers them to the model alongside the prompt
text; sending is hard-blocked with a clear error when the model cannot accept
images.

Full requirement: [SWR-3621 — Image attachments in the desktop prompt](2000-rotaris-desktop/SWR-3621-image-attachments-in-prompt.md)

## SWR-3700 — Themeable design-token layer

Technical requirement derived from SWR-2093. The token layer becomes a *theme*: semantic token
groups filled in by a palette, obtained through a registry and read through one accessor, so a
second palette costs one file and no widget edits. Rotaris ships Rotaris Dim (the design system),
Nocturne (the previous palette) and High Contrast.

Full requirement: [SWR-3700 — Themeable design-token layer](2000-rotaris-desktop/SWR-3700-themeable-design-token-layer.md)

## SWR-3701 — A user can choose the Rotaris theme, and it applies without a relaunch

Settings → Interface gains a theme control listing every built-in theme with its label and
character. Choosing one repaints the running application — every view, dialog and self-painting
widget — while the run, transcript position, unsent prompt and panel sizes survive; the choice
persists, and an unknown stored name starts on the default.

Full requirement: [SWR-3701 — A user can choose the Rotaris theme, and it applies without a relaunch](2000-rotaris-desktop/SWR-3701-theme-selection.md)

## SWR-3702 — Design-system component library

Technical requirement derived from SWR-3700. The design system's inventory — core, forms,
surfaces, data, feedback, navigation and the composed patterns — as one reusable library whose
components resolve no literal presentation value and restyle themselves when the theme changes.
Existing primitives move into it rather than being duplicated beside it.

Full requirement: [SWR-3702 — Design-system component library](2000-rotaris-desktop/SWR-3702-design-system-components.md)

## SWR-3703 — Typography ships with the application

Technical requirement derived from SWR-3700. Space Grotesk, Roboto, Manrope and JetBrains Mono
are bundled as variable faces and registered with Qt at startup, so no type stack depends on a face
the machine might not have. Which face the interface is *set* in is a product decision: the display
keeps the design system's Space Grotesk, the body is set in Roboto — with Manrope as the first
fallback — and the design system's type system — ramp, weight roles, tracking — carries over.
Registration never blocks launch, and the type properties QSS accepts and discards — tracking,
tabular figures — are applied as font settings instead.

Full requirement: [SWR-3703 — Typography ships with the application](2000-rotaris-desktop/SWR-3703-brand-typography.md)

## SWR-3704 — Brand motif and elevation in Qt

Technical requirement derived from SWR-3700. The two parts of the design system Qt has no
equivalent for: elevation, split into a stylesheet hairline plus a drop-shadow effect because QSS
implements no shadow at all; and the brand motif — grid, dot grid, fade rule, axis mark — as
painters that read the active theme on the theme's own grid unit.

Full requirement: [SWR-3704 — Brand motif and elevation in Qt](2000-rotaris-desktop/SWR-3704-motif-and-elevation.md)

## SWR-3723 — Motion respects the reduced-motion preference

Technical requirement derived from SWR-3704. The design system's reduced-motion rule
becomes a single motion gate: the platform preference and a Settings toggle, and every
animation completes instantly behind a closed gate — the end state is reached, only the
travel is gone.

Full requirement: [SWR-3723 — Motion respects the reduced-motion preference](2000-rotaris-desktop/SWR-3723-reduced-motion-gate.md)

## SWR-3705 — Colour tokens are authored in OKLCH and resolved to sRGB

Technical requirement derived from SWR-3700. Palettes stay written in the design system's own
units and are resolved once per theme, so a palette line and the stylesheet line it came from are
the same text. Out-of-gamut colours are fitted by reducing chroma at fixed hue and lightness
rather than clipped, and contrast is measured after compositing translucency onto its ground.

Full requirement: [SWR-3705 — Colour tokens are authored in OKLCH and resolved to sRGB](2000-rotaris-desktop/SWR-3705-oklch-colour-resolution.md)

## SWR-3706 — Every surface reads tokens at paint time

Technical requirement derived from SWR-3700. Every presentation read across the view and widget
modules resolves against the active theme when the surface paints or restyles — never in a class
body, a module constant or a default argument — and a static test keeps that true as the app
grows.

Full requirement: [SWR-3706 — Every surface reads tokens at paint time](2000-rotaris-desktop/SWR-3706-tokens-read-at-paint-time.md)

## SWR-3708 — Iconography ships with the application

Technical requirement derived from SWR-3700. The Phosphor icon fonts are bundled and registered
like the text faces, and one module owns the curated name → glyph vocabulary, DPI-aware
rasterisation and theme-following button icons — so which symbol a surface shows stops being a
property of the host's font directory, and the nav rail's fallback characters become the design
system's own icons.

Full requirement: [SWR-3708 — Iconography ships with the application](2000-rotaris-desktop/SWR-3708-phosphor-iconography.md)

## SWR-3709 — Views compose in the design system's vocabulary

Technical requirement derived from SWR-3700. The UI kit's compositional details become one
reusable pattern instead of per-call-site improvisation: a section header pairs its uppercase
kicker with a mono, tone-coloured datum; the workspace chip separates place from session by
face; the branch fact carries its icon. The workspace sidebar's counted sections and the window
chrome adopt them.

Full requirement: [SWR-3709 — Views compose in the design system's vocabulary](2000-rotaris-desktop/SWR-3709-design-language-composition.md)

## SWR-3717 — Legal and product information is always reachable from the desktop app

Settings gains an `About` tab — also reachable from the command palette — that renders the
product identity (version, build/commit id when present, installation flavour, publisher,
security contact), names and opens each canonical legal document (Privacy Policy, EULA,
Terms/AGB, AUP, withdrawal information), and opens the Rotaris license and the bundled
`THIRD-PARTY-LICENSES.txt` locally. Rendering performs no HTTP request; a failed
browser launch reports inline and leaves the surface usable.

Full requirement: [SWR-3717 — Legal and product information is always reachable from the desktop app](2000-rotaris-desktop/SWR-3717-about-legal-center.md)

## SWR-3719 — Desktop credentials are protected with platform-appropriate user access controls

Credential storage is stated as a security property rather than a Unix mode string: tokens
live below the platform-specific per-user data directory (never the workspace), POSIX runs
restrict the directory to `0700` and files to `0600`, and Windows relies on the user
profile's inherited ACLs — `chmod` is not invoked there, so no POSIX-mode claim is made for
Windows. Secret values are masked across logs, diagnostics, hook payloads and UI errors, and
provider-scoped logout removes the stored credential so the next launch sees the provider
unauthenticated.

Full requirement: [SWR-3719 — Desktop credentials are protected with platform-appropriate user access controls](2000-rotaris-desktop/SWR-3719-platform-credential-protection.md)

## SWR-3721 — Provider settings state where model traffic is sent

Every built-in provider declares a connection mode (Rotaris-managed cloud, direct remote
API, local SDK, custom endpoint) with operator and destination metadata in the runtime
catalog — the one product source. Settings → Providers renders that metadata under each
row, the add-provider dialog states the destination before configuration completes, and
a provider without transparency metadata fails catalog validation.

Full requirement: [SWR-3721 — Provider settings state where model traffic is sent](2000-rotaris-desktop/SWR-3721-provider-data-destination-transparency.md)

## SWR-3726 — Brand mark ships with the application

Technical requirement derived from SWR-3700. The design system's logo ships as an asset and is
rasterised by one module for the title-bar mark slot and the application window icon, and the
packaging assets that PyInstaller and the AppImage recipe embed are the same mark — so a build
and a running window stop showing the placeholder letter or a platform default.

Full requirement: [SWR-3726 — Brand mark ships with the application](2000-rotaris-desktop/SWR-3726-brand-mark-ships-with-the-app.md)


## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris Desktop Workspace (2026-07-11)

Original: `docs/requirement-log/done/requirements-20260711-rotaris-desktop.md` — document status: Complete

#### Description

Rotaris is the standalone PySide6 desktop host for Rotaris. It keeps the existing
orchestration backend while replacing terminal-first interaction with an information-rich,
mouse-friendly workspace.

#### Verification

- `make test-rotaris`
- `make lint`
- `make typecheck`
- `python -m rotaris --demo`

### Requirements Document (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-live-tool-metrics.md` — document status: Done

#### Summary

Rotaris must update inspector tool-call counts and used-tool indicators while a run is active, without waiting for the conversation or iteration to finish.

#### Acceptance Criteria

- [x] First tool call changes inspector state during the active conversation.
- [x] Later calls increment the displayed count.
- [x] Replaying one stable call ID keeps the count unchanged.
- [x] Persist/reload path used by the 750 ms GUI poller retains live metrics.
- [x] Regression test drives real OpenHands SDK events through `_SessionObserver` and `ConfigService`.

### Requirements Document (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md` — document status: Done

#### Summary

Model responses in the Rotaris desktop UI contain Markdown formatting (code blocks, bold, italic, links, lists, inline code, headings) but are currently rendered as plain text in `QLabel` widgets. The Textual TUI already renders these correctly via `rich.markdown.Markdown`. Rotaris needs equivalent Markdown→rich-text rendering so that code blocks are monospaced, links are clickable, and structural formatting is visually preserved — matching the TUI's presentation fidelity.

---

#### Context

### Problem being solved

Users reading model responses in the Rotaris workspace transcript and library views see raw Markdown syntax (e.g. triple backtick fences, `**bold**` markers, bare URLs) instead of formatted output. This makes code samples hard to read, hides document structure, and degrades the experience compared to the TUI — where the same content is properly formatted.

### Current behaviour

- **TUI** (`src/rotaris_core/tui/widgets/chat_panel.py`, `src/rotaris_core/tui/transcript_renderer.py`): Transcript events are rendered through `rich.markdown.Markdown` inside a `RichLog`. Full Markdown support — code fences, bold, italic, links, lists, tables.
- **Rotaris transcript** (`apps/rotaris/src/rotaris/views/workspace.py::_event_row()`): Message content (`TranscriptEvent.text`) is set as plain text on a `QLabel` with `setWordWrap(True)` and text-selectable flags. No Markdown parsing.
- **Rotaris artifact dialog** (`apps/rotaris/src/rotaris/views/artifact_dialog.py`): Body is loaded as raw Markdown into a `QPlainTextEdit` for editing. Renders as plain monospaced text — no preview rendering.
- **Event mapping** (`apps/rotaris/src/rotaris/services/config_service.py::_event_from_dict()`): Passes `raw["content"]` straight through to `TranscriptEvent.text` — no transformation.
- **Streaming** (`apps/rotaris/src/rotaris/services/run_bridge.py`): Token deltas are concatenated into `content` strings that may contain partial Markdown syntax mid-stream.

### What needs to change

1. All `QLabel` widgets displaying model-generated content in Rotaris must render Markdown as formatted rich text.
2. Streaming (in-progress) messages must handle partial/broken Markdown gracefully without crashing the renderer.
3. The artifact dialog should offer a read-time rendered preview (or split view) in addition to the raw Markdown editor.
4. Any other view (library, mission, inspector) that displays model-authored text must also render Markdown.

---

#### Acceptance Criteria

- [x] A model response containing `**bold**`, `*italic*`, `` `inline code` ``, and a ` ```python\nprint("hello")\n``` ` fenced block renders with correct typographic styling in the workspace transcript.
- [x] A message ending mid-fence (` ```python\npartial `) during streaming does not crash the view or produce permanently broken layout; the next poll tick that completes the fence renders correctly.
- [x] Clicking an `https://` link in a rendered message opens the system browser.
- [x] Artifact dialog shows a read-only rendered preview tab/split that updates when the raw Markdown is saved.
- [x] Transcript rebuild performance (diff-based incremental, every ~750ms poll) does not regress measurably for 500+ event transcripts — markdown conversion adds ≤5ms per event.
- [x] Bare URLs (not in `<>` or `[]()` syntax) in model output are auto-linked and clickable.
- [x] System messages, intent messages, and user messages (not authored by models) remain plain text — only `kind == "message"` events where `role` maps to an agent/model role get Markdown rendering.
- [x] Tool-call rows and thinking rows are unchanged — they already have their own structured rendering.

---

#### Dependencies

- Depends on: REQ-20260711-rotaris-desktop (Rotaris exists and is functional)
- Blocks: none

---

#### Notes

### Markdown library choice

Neither `pyproject.toml` (Rotaris) nor `apps/rotaris/pyproject.toml` currently include a Markdown→HTML library. `rich` is available transitively through Rotaris but its Markdown renderer targets terminal output, not HTML. Recommended approach: add `mistune` (v3.x, pure Python, ~50KB, no C extensions needed) as a Rotaris dependency. It's fast enough for 500+ conversions per poll tick and handles the CommonMark spec. Alternative: Python `markdown` library (heavier, extension ecosystem, also works).

### Qt RichText subset

`QLabel` with `setTextFormat(Qt.RichText)` supports HTML 4.0 subset — enough for `<b>`, `<i>`, `<code>`, `<pre>`, `<a href>`, `<ul>/<ol>/<li>`, `<h1>-<h6>`. Tables (`<table>`) are **not** supported by QLabel's rich text engine. If table rendering is needed, a `QTextBrowser` widget would be required instead. This requirement scopes to the QLabel-supported subset for now; tables can be a follow-up.

### Safety

Model output may contain arbitrary text that looks like HTML. The converter must escape HTML entities in non-Markdown text to prevent accidental HTML injection through model responses. `mistune` escapes by default.

### Self-resolved decisions

- Only `kind == "message"` events from agent/model roles get markdown rendering (not tool calls, thinking, system, user, intent).
- Artifact dialog preview is read-only rendered HTML; editor stays raw Markdown `QPlainTextEdit`.
- No table support in v1 (QLabel limitation).
- `mistune` is the recommended library (lightest option that meets the requirements).

### Rotaris Model Slot Thinking Strength (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-model-slot-thinking.md` — document status: Complete

#### Description

Rotaris model-slot settings previously selected only a model. Each slot now also exposes the
reasoning or thinking strength supported by that model, matching terminal startup-model settings.

#### Acceptance Criteria

- Supported OpenAI, Anthropic, and DeepSeek model slots expose configurable thinking strengths.
- Unsupported models show a disabled provider-default selector with an explanatory tooltip.
- Changing a model clears an incompatible thinking selection.
- Save and discard include model-slot thinking values.
- Runtime configuration receives the selected slot-specific thinking value.

### Rotaris Production UX (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-production-ux.md` — document status: Complete

#### Description

Bring the six-view Rotaris desktop host to a production-ready UX baseline for technical teams on
Linux and Windows. The release keeps PySide6, supports a minimum `1000×680` viewport, and applies
WCAG 2.2 AA principles where they map to Qt desktop controls.

#### Verification

- `pytest apps/rotaris/tests -q --timeout=30 -p no:textual-snapshot`
- `ruff check apps/rotaris/src apps/rotaris/tests`
- `mypy apps/rotaris/src/rotaris`
- Offscreen visual inspection at `1000×680` with compact drawers closed and open.
- Confirm no files under `src/rotaris_core/tui/` changed.

### Requirements Document (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-prompt-queue-and-stash.md` — document status: Done

#### Summary

Rotaris keeps its workspace composer usable during active orchestration, queues follow-up
messages for later iterations, and exposes prompt stash management beside transcript actions.

#### Acceptance Criteria

- [x] Running-state composer remains writable and submission enters backend queued-prompt registry.
- [x] Queue accepts repeated follow-ups and uses a bounded-height scroll surface rather than a
      fixed item limit.
- [x] Queue edit preserves prompt ID, timestamp, context snapshot, and position.
- [x] Queue delete and edit fail safely after prompt triggering.
- [x] Queue panel hides when no pending messages remain.
- [x] Stash dialog explains and implements Apply versus Pop behavior.
- [x] Existing bottom `Stash` action remains available while a run is active.

### Rotaris Provider Authentication and Health (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-provider-auth.md` — document status: Complete

#### Description

Rotaris previously rendered every configured provider with a green connected dot without
checking stored authentication or contacting the provider. The Settings provider card now
supports authentication, logout, re-authentication, and provider-specific health validation
without blocking the Qt event loop.

#### Implementation Notes

- API-key flows validate the secret before persistence through the existing provider settings
  service. OAuth, PKCE, and device-code flows reuse `AuthManager`, then run existing model
  discovery and persistence.
- Codex uses its provider-specific subscription catalog validation; providers exposing a live
  model endpoint use that endpoint. Network failures are warnings; rejected credentials and
  missing authentication are red error states.
- Providers whose credentials are supplied directly by model configuration remain visible but
  show a warning that authentication is model-configured, because they do not expose a registered
  interactive auth flow.

#### Acceptance Criteria

- Opening Rotaris checks supported provider rows asynchronously.
- A healthy provider is green; a checking provider is blue; an unreachable/expired provider is
  yellow; missing or rejected authentication is red.
- The `+` action opens the appropriate credential/browser-flow modal and successful completion
  refreshes the row to healthy.
- Logout asks for confirmation, removes stored provider authentication, and turns the row red.
- Provider validation discovers and persists models without consuming a completion request.

### Requirements Document (2026-07-13)

Original: `docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md` — document status: Not Started

#### Summary

Rotaris desktop users need to **force-load specific skill bodies into agent context** — not just announce them in the metadata catalog and wait for the model to decide. The user explicitly selects which skills are loaded, for which agents (all, specific personas, or individual agent instances), per session. This gives deterministic control over what procedural knowledge each agent carries.

Force-loaded skills must appear as persistent context (surviving context compaction), not as one-shot transcript messages. Unselected skills continue to participate through the normal metadata-catalog / on-demand retrieval flow.

---

#### Context

### Problem being solved

The current skill model delegates all body-loading decisions to the LLM. The model sees a metadata catalog and decides whether to read a skill file via its filesystem tools. This is unreliable: the model may fail to recognize a skill is relevant, may load it too late, or may never load it at all. Users need a deterministic override: "this skill WILL be in context for this agent, period."

The TUI has a partial escape hatch — slash commands that inject a skill body as a transcript message. But this is one-shot (doesn't survive context compaction), not scoped per-agent, and not available in Rotaris at all.

### Current behaviour

1. All discovered skills contribute only their name and description to each agent's context (metadata catalog). Full skill bodies are never pre-loaded.
2. Skill bodies are retrieved on demand by the model via filesystem reads (Level 2 of the 3-level skill model). The framework does not pre-load them.
3. The TUI can inject a skill body as a one-shot system message in the conversation transcript. This does not persist across context compaction and is not scoped per-agent.
4. The Rotaris Skills tab displays discovered skills in a read-only table. No toggles, no controls, no way to load or scope skills.
5. All agents receive identical skill metadata regardless of persona or task.
6. There is no user-facing indicator for which skill bodies are currently loaded into an agent's context.

### What needs to change

1. **Force-load configuration**: A per-session record of which skills the user has explicitly force-loaded, and for which agents that load applies. This configuration must survive agent restarts within the same session but is cleared when the workspace is closed.

2. **Persistent body injection**: Force-loaded skill bodies must be injected into agent context in a way that survives context compaction — not as one-shot transcript messages.

3. **Scoping model** — three levels:
   - **Session-wide**: The skill body is loaded into every agent.
   - **Per-persona**: The skill body is loaded only into agents with specific persona names.
   - **Per-agent-instance**: The skill body is loaded only into agents spawned for a specific task or role.

4. **Rotaris Skills tab becomes interactive**:
   - A toggle per skill to force-load or unload its body.
   - A scope selector per skill (all agents, specific personas, agent instance pattern).
   - A visual indicator showing whether a skill body is currently loaded in the selected agent's context.
   - A rescan action that re-discovers skills from disk without restarting.

5. **Rotaris workspace composer gains skill visibility**:
   - Force-loaded skills for the currently selected persona appear as visible, removable indicators near the persona/model selectors.
   - These indicators update when the persona selector changes.

6. **Automatic skill detection** runs on workspace open (already implemented — confirmed as a requirement).

7. **Per-session persistence**: Force-load selections survive agent restarts within a session but are cleared on workspace close. Not persisted across sessions by default.

Derived requirements: [SWR-2092 — DPI-aware nav-rail icon rendering](2000-rotaris-desktop/SWR-2092-dpi-aware-nav-icons.md), [SWR-2093 — Nocturne design-system tokens and reusable UI primitives](2000-rotaris-desktop/SWR-2093-design-system-primitives.md)

---

#### Acceptance Criteria

- [ ] **AC-001**: With a workspace containing 5 discovered skills and no force-load configuration, all 5 skills show in the Skills tab with force-load toggles OFF. Agent construction behaves identically to current behavior (metadata catalog only, no bodies pre-loaded).

- [ ] **AC-002**: When the user activates force-load for skill "frontend-design" with scope restricted to persona "ui-designer", then starts a run: agents with persona "ui-designer" receive the full skill body in their context. Agents with persona "backend-engineer" do not receive the body — only the metadata catalog entry.

- [ ] **AC-003**: When the user activates force-load for a skill with session-wide scope ("All agents"), then ALL agents receive the full body in their context.

- [ ] **AC-004**: When the user deactivates a force-loaded skill, the next agent construction for matching personas no longer includes the body. The skill remains visible in the metadata catalog.

- [ ] **AC-005**: The metadata catalog visible to each agent always contains ALL discovered skills regardless of force-load state.

- [ ] **AC-006**: Force-load configuration persists across run stop/start within the same Rotaris session. Closing and reopening the workspace clears force-load configuration.

- [ ] **AC-007**: In the Workspace view, when the persona selector is set to "ui-designer", only skills force-loaded for all agents plus those scoped to "ui-designer" appear as indicators. Switching to "backend-engineer" updates the indicators accordingly.

- [ ] **AC-008**: Removing a skill indicator in the Workspace view deactivates the force-load for that skill+persona combination. The Skills tab reflects the change.

- [ ] **AC-009**: Rescanning discovers new skills from disk, adds them with force-load OFF, preserves existing force-load configuration, and removes entries for skills no longer on disk.

- [ ] **AC-010**: A skill file that is unreadable or malformed cannot be force-loaded. The toggle is disabled with an explanation. The skill still appears in the metadata catalog (its name and description were parsed at discovery time).

- [ ] **AC-011**: Existing tests for skill discovery, agent construction, and skill configuration continue to pass without modification (no force-load configuration = no behavior change).

---

#### Dependencies

- **Depends on**: `docs/requirement-log/done/requirements-20260503-skill-md-protocol.md` (SKILL.md discovery, parsing, 3-level model)
- **Depends on**: `docs/requirement-log/done/requirements-20260711-rotaris-desktop.md` (Rotaris desktop foundation)
- **Related**: `docs/superpowers/plans/2026-07-13-rotaris-tui-feature-parity-plan.md` item 5 (slash-command skill invocation — distinct but adjacent)
- **Blocks**: Nothing currently.

---

#### Resolved Conflicts

| Prior Requirement                                                   | Conflict                                                                            | Resolution                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-20260503-SKILL-008 (metadata catalog injected unconditionally)  | Force-loading adds full-body content alongside the catalog                          | No conflict. The metadata catalog remains unconditional for all agents. Force-loaded body content is additional, not a replacement. The agent sees both.                                   |
| REQ-20260503-SKILL-009 (Level 2 body retrieval is model-initiated)  | Force-loading pre-loads bodies, bypassing model-initiated retrieval                 | Force-loading is a user-directed override of the normal flow. The model can still retrieve non-force-loaded skills on demand. This is additive, not a replacement of the 3-level model.    |
| REQ-20260503-SKILL-013 (skills are filesystem-resident)             | Force-loaded bodies are provided at construction time rather than read by the agent | The skill body still originates from the filesystem SKILL.md file. It is loaded at construction time rather than through an agent tool call, but the file remains the source of truth.     |
| REQ-20260503-SKILL-016 (manual skill loads are session-scoped only) | Force-load config is also session-scoped                                            | Consistent. Both mechanisms treat explicit user loads as session-only.                                                                                                                     |
| TUI skill body injection (one-shot transcript message)              | Rotaris requires persistent injection surviving compaction                          | Different delivery mechanism for different hosts. Both serve the same user intent (explicit skill loading). The TUI approach may be harmonized later but is unchanged by this requirement. |

---

#### Notes

### Assumptions and self-resolved decisions

1. **Persistent injection required**: Force-loaded skill bodies must survive context compaction. One-shot transcript-message injection (as the TUI currently does) is insufficient.

2. **Session-scoped, not workspace-persistent**: Force-load configuration is per-session. This matches the existing boundary for manual skill loads. Users who want permanent force-loads can include the skill body in their persona's system prompt. A "pin to workspace" feature is a natural follow-up.

3. **Metadata catalog stays complete**: All discovered skills remain listed in the catalog regardless of force-load state. This ensures non-targeted agents still know about skills they might retrieve on demand.

4. **Per-agent-instance scoping UI is deferred**: The scope selector initially supports "All agents" and named persona selection. Free-text agent-instance pattern matching is a valid scope but its UI is deferred to a follow-up.

5. **Unreadable skills**: Skills with unreadable files cannot be force-loaded but still appear in the metadata catalog (their name and description were parsed from frontmatter at discovery time).

### Out of scope (explicitly deferred)

- "Pin to workspace" persistence (force-load config surviving workspace close/reopen).
- Skill body editing from Rotaris.
- Slash-command skill invocation from Rotaris composer (separate requirement).
- TUI migration to persistent force-loading (TUI's one-shot approach continues to work).
- Conditional force-loading based on runtime conditions (intent classification, file patterns, etc.).

### Requirements Document (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-transcript-message-deduplication.md` — document status: Done

#### Summary

Rotaris must render one transcript row for one agent response when the OpenHands SDK replays a committed message event or emits cumulative snapshots of the same response.

#### Acceptance Criteria

- [x] Reconstructing and replaying one committed SDK message keeps one row.
- [x] `Draft` followed by `Draft complete` renders only `Draft complete`.
- [x] Two separately streamed and finalized responses remain two rows.
- [x] Regression coverage exercises `_SessionObserver` through persisted session reload.

### Requirements Document (2026-07-13)

Original: `docs/requirement-log/done/requirements-20260713-rotaris-transcript-render-performance.md` — document status: Done

#### Summary

Rotaris must remain responsive during long-running sessions. Session polling and streamed token
updates must not rebuild unchanged UI state or remeasure every historical transcript row.

#### Acceptance Criteria

- [x] Reapplying one identical session snapshot emits no transcript, agent, todo, artifact, status,
      or run-state update.
- [x] An unchanged 1,000-row transcript refresh avoids layout synchronization.
- [x] Updating the final streamed message preserves row identity and passes only that row to extent
      measurement.
- [x] Existing transcript scrolling, resizing, search, Markdown, and session mapping tests pass.

### Rotaris memory and responsiveness remediation (2026-07-14)

Original: `docs/requirement-log/done/requirements-20260714-rotaris-memory-responsiveness.md` — document status: Done

#### Delivered behavior

- Shared LLM construction disables LiteLLM per-chunk streaming logging/cache work before the first completion. Missing support fails explicitly.
- `SessionManager.read_session_snapshot()` separates read-only state access from run-open repair.
- Rotaris uses a dedicated single-flight `QThread` reader, immutable projections, generation checks, coalescing, and a retried final-refresh barrier.
- Diagnostics schema v2 uses one-frame tracing, lightweight thread triggers, five-minute single-flight allocation captures, a one-second degradation circuit breaker, deterministic reservoirs, and exact online RSS slope/endpoints.
- Settings provider rows update in place; structural changes alone rebuild the view.
- Replay inspection adds per-iteration Theil-Sen RSS slopes and handle counts.

#### Verification

- LiteLLM runtime policy unit tests.
- Session read/repair separation unit test.
- Rotaris run-bridge end-to-end test and slow-reader Qt heartbeat/coalescing test.
- Diagnostics bounds, privacy, trigger, close, and circuit-breaker tests.
- Settings widget-identity stress test.
- Benchmark analytics and headless replay tests.
- Ruff and focused mypy validation for every changed subsystem.

No session-persistence schema changed. No TUI user-interface behavior changed.

### Rotaris Per-Persona Model Selection (2026-07-14)

Original: `docs/requirement-log/done/requirements-20260714-rotaris-per-persona-model-selection.md` — document status: Complete

#### Description

Rotaris Settings now edits each persona's durable model and reasoning configuration without
requiring users to hand-edit `agents.yaml`. Edits can target the workspace or global scope while
preserving the existing workspace-over-global precedence.

#### Acceptance Criteria

- Persona model choices contain configured model slots followed by concrete catalog models.
- Persona reasoning choices include provider default and the selected model's supported levels.
- Workspace and global persona keys are merged atomically while unrelated persona keys survive.
- Unset removes only the selected workspace field and reveals the global or built-in fallback.
- Malformed scope YAML does not crash origin detection.
- Store, persistence, and pytest-qt behavior are covered by automated tests.

### Rotaris opt-in UI diagnostics and replay benchmark (2026-07-14)

Original: `docs/requirement-log/done/requirements-20260714-rotaris-ui-diagnostics-benchmark.md` — document status: done

#### Resolution

- Added CLI/environment opt-in light and deep diagnostics with synchronous bounded JSONL streams,
  threshold/close snapshots, process and Qt counters, operation spans, and summaries.
- Kept disabled mode as a no-op with no timers, files, worker threads, or `tracemalloc` activation.
- Added explicit session fixture capture plus fresh-process offscreen replay, inspect, and compare
  commands through `rotaris-benchmark`.
- Replay fixes Qt/environment inputs, exercises canonical append/stream/tail/unchanged/resize phases,
  and preserves raw values alongside aggregate statistics.
- Added portable process metrics through the direct `psutil` dependency.

#### Privacy boundary

Live diagnostics record counts and sanitized stack locations only. They do not record transcript
text, prompts, tool output, secrets, environment values, or the full workspace path. Benchmark
fixture capture is explicit and warns that UI transcript/tool content remains in the fixture.

### Rotaris Virtual Transcript Rendering (2026-07-14)

Original: `docs/requirement-log/done/requirements-20260714-rotaris-virtual-transcript.md` — document status: Done

#### Summary

Long Rotaris sessions caused linear UI slowdown, CPU spikes, irregular repaints, and high memory
use. The Workspace transcript allocated a `QWidget` tree for every event and forced Qt to lay out
and paint that retained tree when streamed output or window geometry changed.

#### Implementation

- Replaced per-event widgets with `QAbstractListModel`, batched `QListView`, and a
  `QStyledItemDelegate` that paints visible rows.
- Added incremental append, truncate, and streamed-tail model synchronization.
- Added bounded Markdown caching: at most 256 entries and 2,000,000 retained source/output
  characters; oversized entries bypass the cache.
- Added whole-message context-menu/keyboard copy because delegate-painted text does not create a
  selectable child widget.
- Added explicit user-intent tail state. Incoming rows and progressive layout range changes stay
  pinned only while the reader is at the bottom; a green transcript border shows this state.
- Made the transcript viewport opaque with the workspace background so model insertions cannot
  expose Qt's black transparent backing surface between layout and paint passes.

This follows Qt's documented model/view guidance: use item delegates for dynamic list content,
use batched `QListView` layout for large item sets, and signal model deltas with
`dataChanged()`/row insertion and removal APIs.

#### Verification

Headless benchmark, 1,000 Markdown events, same `WorkspaceView` scenario:

| Metric                       | Before |   After |
| ---------------------------- | -----: | ------: |
| Initial render               | 4.79 s |  0.30 s |
| Streamed tail update, median | 252 ms | 0.54 ms |
| Resize, maximum              | 1.16 s | 10.5 ms |
| Workspace child widgets      |  4,138 |     138 |
| Peak RSS                     | 167 MB |   83 MB |

Automated coverage verifies model delta emission, bounded caching, constant transcript widget
count, Markdown/plain-text routing, link activation, reasoning toggling, search, copy, empty and
shrink states, tail scroll preservation, and opaque viewport repainting at compact and wide sizes.

#### References

- [Qt Model/View Programming](https://doc.qt.io/qt-6/model-view-programming.html)
- [QListView performance and batched layout](https://doc.qt.io/qt-6/qlistview.html)
- [QAbstractItemView delegate guidance](https://doc.qt.io/qtforpython-6/PySide6/QtWidgets/QAbstractItemView.html)

### Make Agent Model and Reasoning Controls Truthful (2026-07-14)

Original: `docs/requirement-log/done/requirements-20260714-truthful-controls.md` — document status: Complete

#### Description

Replace in-memory `WorkspaceStore` mutations with real backend seams so that
model and reasoning controls in Rotaris actually change runtime behavior instead
of only updating display state. Orchestrator changes use `RunBridge.switch_entry_model()`
and the newly added `switch_entry_reasoning()` seam, taking effect from the next
iteration. Child-agent controls become read-only, directing users to per-persona
Settings. Duplicate cosmetic controls in auxiliary agent windows are removed.

#### Acceptance Criteria

- Model and reasoning changes on the orchestrator inspector propagate through
  `RunBridge` and are consumed by the next spawned entry agent.
- Child-agent and terminal-agent model/reasoning controls are non-editable with
  a scope note directing to Settings → Personas.
- Auxiliary agent windows display model and reasoning as read-only labels.
- No `WorkspaceStore.set_agent_model()` or `set_agent_reasoning()` call sites
  remain for runtime model/reasoning changes.
- Backward compatibility is preserved: existing consumers of `switch_entry_model`
  and the scheduler construction path are unaffected.
