---
req-id: SWR-2436
status: approved
trace: required
test: required
title: "Automatic per-iteration git checkpoints"
epic: SWR-2400
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2436 — Automatic per-iteration git checkpoints

Sessions in a git workspace MUST be able to record an automatic checkpoint of
the working tree after every iteration that modified files, so any agent step
can be undone (SWR-2437).

- Checkpoints are implemented with plumbing that does not disturb the user's
  branch, index, or reflog expectations (e.g. out-of-branch commit objects or
  stash-like refs under a `refs/rotaris/` namespace) — never commits on the
  user's branch.
- Each checkpoint records: session id, iteration number, triggering child, and
  the file set; the mapping is stored with the session so checkpoints survive
  resume.
- Checkpointing is on by default in worktree-isolated sessions and
  configurable elsewhere; failures to checkpoint warn but do not abort the
  iteration.
- Old checkpoints are pruned with the session lifecycle (no unbounded ref
  growth). The refs do not live in the session directory — they are git refs
  under `refs/rotaris/checkpoints/` in the workspace (or, for an isolated
  session, in its worktree) — so `SessionPersistence.delete_session` deletes
  them alongside the session directory. Ref cleanup is best-effort: a session
  must still delete when the repository has moved or was never there.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Ref naming; checkpoint metadata; retention/prune policy; configuration defaults | Checkpoint engine API | `tests/unit/test_checkpoints.py`, `tests/unit/test_checkpoint_service.py`, `tests/unit/test_checkpoint_config.py`, `tests/unit/test_checkpoint_persistence.py` |
| Integration | An iteration with edits creates a checkpoint without touching branch/index; resume still lists it | Iteration observer → git seam | `tests/integration/test_checkpoint_iteration.py`, `tests/unit/test_lifecycle_hooks.py` |
| User-flow E2E | Covered by the SWR-2437 E2E flow (checkpoint visibly restorable) | Public product boundary → user-observable result | `tests/integration/test_checkpoint_user_flow.py` (shared with SWR-2437) |

Epic: [Git Worktree Isolation](../2400-git-worktrees.md)
