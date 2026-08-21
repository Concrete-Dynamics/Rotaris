---
req-id: SWR-1552
status: draft
trace: required
test: required
title: "Session forking"
epic: SWR-1500
date: 2026-08-20
---

# SWR-1552 — Session forking

Forking a past session creates a new session with a new session identifier
whose conversation history is a complete copy of the source session's history
at fork time. The source session is left unchanged: its history, transcript,
timeline, and artifact store remain byte-identical and fully resumable. The
new session records its provenance (the source session's identifier) and is
immediately available to continue like any other session. Continuing the fork
never affects the source session.

The forked session starts with its own copy of the source session's artifact
store. After the fork, the two stores evolve independently: reads and writes
in either session are invisible to the other.

## Acceptance criteria

- Forking session A creates session B where B's identifier differs from A's.
- B's conversation history contains every message of A's history up to the
  fork point, verbatim.
- A's stored state — resume state, transcript, timeline, artifacts — is
  unmodified by the fork operation.
- B's metadata records A as its source (`forked-from`).
- An artifact modified in B is unchanged in A, and vice versa.
- B can be resumed and continued through the existing continue-session flow.
- Forking a fork works; no nesting limit applies.
- Legacy-loadable sessions can be forked.
- A fork of a nonexistent or unloadable session fails with a visible error,
  creating nothing and leaving the source untouched.

## Test portfolio

| Level         | Productive scenario                                                                                                           | Exercised boundary                                        | Planned/covering test                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| Unit          | Fork of a completed session: new id, verbatim history copy, provenance recorded, source files unchanged                       | Id allocation, history copy fidelity, source immutability | `tests/unit/test_session_fork.py`             |
| Unit          | Artifact store is copied, then mutations in either session stay independent                                                   | Copy-on-fork store divergence                             | `tests/unit/test_session_fork.py`             |
| Integration   | Fork of a session with artifacts, timeline, and resume state is resumable via the existing continue flow; a forked fork works | Resume path integration, no depth limit                   | `tests/integration/test_session_fork.py`      |
| Integration   | Legacy snapshot-style session is forked successfully                                                                          | Backward-compatible load path                             | `tests/integration/test_session_fork.py`      |
| User-flow E2E | Start a session, fork it, diverge in the fork, verify the source is untouched and both sessions remain usable                 | Public product boundary → user-observable result          | Hermetic E2E (shared with SWR-1553, SWR-1554) |

Epic: [Session Persistence & Diagnostics](../1500-sessions-diagnostics.md)
