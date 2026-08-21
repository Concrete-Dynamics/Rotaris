---
req-id: SWR-2437
status: approved
trace: required
test: required
title: "Checkpoint rollback"
epic: SWR-2400
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2437 — Checkpoint rollback

Users MUST be able to restore the working tree to any recorded checkpoint
(SWR-2436) of the current session.

- **Rotaris (primary interface)** lists the session's checkpoints (iteration,
  time, files changed) and offers restore; a CLI subcommand provides the same
  for headless sessions. A TUI listing is a deferred follow-up (secondary
  interface) — TUI users can use the CLI subcommand in the meantime.
- Restore is confirmation-gated and shows the diff summary (files that would
  change) before applying; uncommitted user changes on top are detected and
  block a silent overwrite.
- A restore is itself recorded (audit/diagnostics) and creates a safety
  checkpoint of the pre-restore state, so a rollback can be rolled back.
- Restore never rewrites the user's branch history; it only changes working
  tree contents.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Restore plan computation; conflict/uncommitted-change detection; refusal while a run owns the session | Checkpoint engine API | `tests/unit/test_checkpoint_restore.py`, `tests/unit/test_checkpoints.py` |
| Integration | Restore returns the tree to the checkpoint state and records the safety checkpoint, from the CLI subcommand | Git seam | `tests/integration/test_checkpoint_cli.py` |
| User-flow E2E | A user runs a session, restores to an earlier checkpoint, and the file contents match that iteration's state — from the CLI and from the desktop | Public product boundary → user-observable result | `tests/integration/test_checkpoint_user_flow.py`, `apps/rotaris/tests/test_checkpoints_ui.py` |

Derived requirements: [SWR-2817 — Stale run status detection and repair](SWR-2817-stale-run-status-recovery.md)

Epic: [Git Worktree Isolation](../2400-git-worktrees.md)
