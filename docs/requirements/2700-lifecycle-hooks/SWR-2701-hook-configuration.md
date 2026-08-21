---
req-id: SWR-2701
status: approved
trace: required
test: required
title: "Hook configuration schema"
epic: SWR-2700
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2701 — Hook configuration schema

Hooks MUST be declarable in the layered config (`~/.config/rotaris/` <
`<workspace>/.rotaris/`): a list of hook entries, each with an event
(SWR-2702/SWR-2703), an optional matcher (tool name / command pattern reusing
the SWR-2502 pattern syntax), the shell command to run, and an optional
timeout.

- Config validation rejects unknown events and malformed matchers at load
  time with field-level errors (consistent with SWR-1827 presentation).
- Hook lists follow the established overlay semantics (workspace list
  replaces global list).
- The effective hook set for a session is recorded in the session snapshot.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Schema validation; unknown event, malformed matcher, blank command and non-positive timeout rejected at load time | Config schema | `tests/unit/test_hook_config.py` |
| Integration | Workspace hooks replace the global list through the real loader; scope provenance is stamped; the effective set is recorded in the session snapshot with commands redacted | Config loader → session state | `tests/unit/test_hook_config.py`, `tests/unit/test_checkpoint_persistence.py` |
| User-flow E2E | Covered by the SWR-2702 E2E flow (configured hook observably fires) | Public product boundary → user-observable result | `tests/integration/test_hooks_user_flow.py` (shared with SWR-2702) |

Derived requirements: [SWR-2815 — Workspace hook trust gate](SWR-2815-workspace-hook-trust-gate.md), [SWR-2816 — Hook scope fallback when a workspace list is refused](SWR-2816-hook-scope-fallback.md)

Epic: [User-Defined Lifecycle Hooks](../2700-lifecycle-hooks.md)
