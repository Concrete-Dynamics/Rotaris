---
req-id: SWR-1554
status: draft
trace: required
test: required
title: "Session fork entry points"
epic: SWR-1500
date: 2026-08-20
---

# SWR-1554 — Session fork entry points

Forking is reachable from three surfaces, all producing the behavior of
SWR-1552 and SWR-1553:

1. **CLI** — a `rotaris fork` command shows a picker of past sessions and
   forks the selected one; `rotaris fork --last` forks the most recent past
   session without a picker. The forked session opens interactively.
2. **Rotaris desktop** — a past session exposes a fork action that creates
   the fork and opens it.
3. **In-session slash command** — `/fork` forks the running session up to the
   current point into a new session without stopping or otherwise affecting
   the running session.

## Acceptance criteria

- `rotaris fork` presents a picker listing past sessions with their
  identifiers and display names; selecting one creates the fork.
- `rotaris fork --last` forks the most recent past session.
- Forking a session by an identifier that does not exist fails with a clear,
  visible error and creates nothing.
- The desktop fork action on a past session creates the fork and opens it.
- `/fork` inside a running session creates a fork whose history ends at the
  current point; the running session continues unaffected.
- Every surface records the same `forked-from` provenance.

## Test portfolio

| Level         | Productive scenario                                                                                                                               | Exercised boundary                               | Planned/covering test                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Unit          | CLI argument handling: picker, `--last`, unknown id error                                                                                         | CLI contract                                     | `tests/unit/test_session_fork_cli.py`                              |
| Integration   | CLI fork of a recorded session produces a resumable fork; `/fork` mid-run captures history up to the current point while the source keeps running | CLI → session boundary, running-session fork     | `tests/integration/test_session_fork.py`                           |
| Integration   | Desktop fork action opens the forked session                                                                                                      | Desktop session browser → fork flow              | `apps/rotaris/tests/test_session_fork.py`                          |
| User-flow E2E | Fork via one public surface, diverge, verify source untouched (same hermetic flow as SWR-1552/1553, asserting all three ids)                      | Public product boundary → user-observable result | Hermetic E2E `@verifies(SWR.SWR_1552, SWR.SWR_1553, SWR.SWR_1554)` |

Epic: [Session Persistence & Diagnostics](../1500-sessions-diagnostics.md)
