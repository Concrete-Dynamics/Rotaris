---
req-id: SWR-1553
status: draft
trace: required
test: required
title: "Forked sessions work in an isolated working tree"
epic: SWR-1500
date: 2026-08-20
---

# SWR-1553 — Forked sessions work in an isolated working tree

A forked session always works in its own isolated working tree. At fork time
the tree is seeded with the source session's working-tree contents and branch
position; when the source session had no working tree of its own, the tree is
seeded from the workspace's current state. After the fork, file changes made
by either session are invisible to the other and never touch the main
checkout or the source session's workspace. Session metadata records the
fork's working tree, like any other worktree-isolated session.

## Acceptance criteria

- Forking a session that has a working tree yields a fork whose tree contains
  the same file contents and branch position at fork time.
- Edits made in the fork's tree do not appear in the source's tree, in the
  main checkout, or in any other session's tree.
- Forking a session without a working tree yields a fork with its own tree
  seeded from the workspace's current state; subsequent fork edits leave the
  workspace untouched.
- Forking a still-running session does not disturb the source session's tree
  or its ongoing work.
- If the fork's working tree cannot be created, the fork fails as a whole
  with a visible error; no partial session or tree remains.

## Test portfolio

| Level         | Productive scenario                                                                                                                      | Exercised boundary                               | Planned/covering test                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| Unit          | Seeding decision: source-with-tree vs. source-without-tree selects the correct seed                                                      | Source-state branching                           | `tests/unit/test_session_fork.py`             |
| Integration   | Fork of a session with dirty working-tree contents lands in an isolated tree; edits in fork never reach the source tree or main checkout | Real git fixture, isolation guarantee            | `tests/integration/test_session_fork.py`      |
| Integration   | Fork while the source session is running; both sessions continue in separate trees                                                       | Concurrent session isolation                     | `tests/integration/test_session_fork.py`      |
| User-flow E2E | Fork a completed session, make divergent edits in the fork, verify source workspace unchanged and fork changes confined to its own tree  | Public product boundary → user-observable result | Hermetic E2E (shared with SWR-1552, SWR-1554) |

Epic: [Session Persistence & Diagnostics](../1500-sessions-diagnostics.md)
