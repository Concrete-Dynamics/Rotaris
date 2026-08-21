---
req-id: SWR-2703
status: approved
trace: required
test: required
title: "Lifecycle event hooks"
epic: SWR-2700
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2703 — Lifecycle event hooks

Beyond tool hooks (SWR-2702), hooks MUST be attachable to session lifecycle
events: `session_start`, `session_end`, `iteration_end`, `child_completed`,
and `verifier_finished` (SWR-2602).

- Event hooks receive the event payload as JSON on stdin (event name, session
  id, and event-specific data such as the child report summary or verifier
  verdict), secrets redacted.
- Lifecycle hooks are informational: exit codes other than 0 produce a
  non-blocking warning; they cannot block the loop (blocking control flow is
  the domain of tool hooks, the permission policy, and the verifier gate).
- Implementation is expected to bridge from the existing
  `RalphIterationObserver` seam without overriding `_run_iteration`. That seam
  carried no session-level hooks when this was written — `on_session_start` and
  `on_session_end` were added to it as part of this requirement, so a reader
  should not go hunting for pre-existing ones.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Event payload construction per event type; a lifecycle hook's exit code never blocks | Hook event bridge | `tests/unit/test_hook_payload.py`, `tests/unit/test_hook_runner.py` |
| Integration | Each event fires its configured hook exactly once per occurrence, through the observer seam the loop already drives | Observer → hook runner | `tests/unit/test_lifecycle_hooks.py`, `tests/integration/test_checkpoint_iteration.py`, `apps/rotaris/tests/test_desktop_hook_wiring.py` |
| User-flow E2E | A session with a `session_end` notification hook observably runs it when the run finishes | Public product boundary → user-observable result | `tests/integration/test_hooks_user_flow.py` |

Epic: [User-Defined Lifecycle Hooks](../2700-lifecycle-hooks.md)
