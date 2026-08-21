---
req-id: SWR-2700
status: approved
trace: optional
test: optional
title: "User-Defined Lifecycle Hooks"
---

# SWR-2700 — User-Defined Lifecycle Hooks

User-configurable hooks: shell commands declared in config that run at defined
lifecycle points (before/after tool calls, iteration end, session start/end,
child completion) with deterministic exit-code semantics. Together with the
permission policy (epic 2500) and the verifier (epic 2600) this provides the
"deterministic orchestration on top of prompts" capability the market analysis
names as differentiation candidate #2 —
[docs/research/marktanalyse-agentic-harnesses-2026-08.md](../research/marktanalyse-agentic-harnesses-2026-08.md).
Builds on the internal `RalphIterationObserver` seam. See
[NOTE-marktreife-priorisierung.md](NOTE-marktreife-priorisierung.md).

## Requirements

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| [SWR-2701](2700-lifecycle-hooks/SWR-2701-hook-configuration.md) | Hook configuration schema | P1 | approved |
| [SWR-2702](2700-lifecycle-hooks/SWR-2702-tool-hooks.md) | Pre/post tool hooks with exit-code semantics | P1 | approved |
| [SWR-2703](2700-lifecycle-hooks/SWR-2703-lifecycle-event-hooks.md) | Lifecycle event hooks | P1 | approved |
| [SWR-2704](2700-lifecycle-hooks/SWR-2704-hook-failure-handling.md) | Hook timeouts & failure handling | P1 | approved |
| [SWR-2815](2700-lifecycle-hooks/SWR-2815-workspace-hook-trust-gate.md) | Workspace hook trust gate | — | approved |
| [SWR-2816](2700-lifecycle-hooks/SWR-2816-hook-scope-fallback.md) | Hook scope fallback when a workspace list is refused | — | approved |

Derived requirements: [SWR-2815 — Workspace hook trust gate](2700-lifecycle-hooks/SWR-2815-workspace-hook-trust-gate.md), [SWR-2816 — Hook scope fallback when a workspace list is refused](2700-lifecycle-hooks/SWR-2816-hook-scope-fallback.md)

## History

- 2026-08-03 — Epic created from the market gap analysis: only the internal
  `RalphIterationObserver` seam existed; no user-facing hook system comparable
  to Claude Code / GitHub Copilot hooks.
- 2026-08-08 — Delivered and approved (SWR-2701–SWR-2704). Two properties that
  the original four requirements did not describe were discovered during the
  build and written up afterwards: the workspace hook **trust gate** (SWR-2815),
  without which opening a cloned repository would run its author's shell
  commands, and the **scope fallback** (SWR-2816), without which declining that
  prompt would silently disable the user's own global hooks. The
  `RalphIterationObserver` seam this epic was expected to build on had no
  session-level hooks; `on_session_start`/`on_session_end` were added to it.
