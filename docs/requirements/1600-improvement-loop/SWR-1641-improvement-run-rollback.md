---
req-id: SWR-1641
status: draft
trace: required
test: required
title: "Rollback of an applied improvement run"
epic: SWR-1600
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-1641 — Rollback of an applied improvement run

An improvement run lets an agent edit the user's workspace — persona memory, `AGENTS.md`,
configuration, whatever an approved proposal's `recommended_action` describes. Approval is
gated (SWR-1618), but **application is one-way**: there is no undo. A proposal that reads
well and turns out to make the agent worse can only be reversed by hand, and the user has
to reconstruct what changed from the transcript.

Requirement: an improvement run is checkpointed and reversible.

- Before an improvement run applies anything, a checkpoint of the workspace tree is
  taken, using the existing generic engine (`CheckpointEngine`, `session/checkpoints.py`)
  under an improvement-specific ref namespace so it can never be pruned by, or confused
  with, an ordinary session's iteration checkpoints.
- The checkpoint is recorded on the improvement artifact, so "what was applied" and "how
  to undo it" live together and survive a restart.
- A rollback restores that checkpoint, and — like SWR-2437 — takes a safety checkpoint of
  the current state **first**, so undoing an undo is possible.
- A rollback is previewable: the user sees which files would change and how (delete,
  recreate, overwrite) before confirming, and uncommitted work made since the improvement
  run blocks the rollback with a named reason unless explicitly forced.
- Rolling back sets the applied proposals back to a non-applied state so the history
  (SWR-1640) shows the reversal instead of silently disagreeing with the files on disk.
- If the workspace is not a git repository, the improvement run still works — it reports
  that no rollback point could be taken rather than refusing to run.

## Acceptance criteria

- Applying an improvement in a real git workspace, then rolling back, leaves every
  touched file byte-identical to its pre-run content, including files the run created
  (they are removed) and files it deleted (they return).
- The rollback refuses, with a reason naming the paths, when the user has edited the
  workspace since the improvement run — unless forced.
- Improvement checkpoints are not removed by session checkpoint pruning, and session
  checkpoints are not removed by improvement rollback.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Preview classifies added/modified/deleted paths; a dirty workspace blocks without `force`; a non-git workspace degrades to "no rollback point" | Rollback service over a temp git tree | `tests/unit/improvement/test_rollback.py` |
| Integration | Apply → rollback in a real temp git repository restores the tree exactly; the safety checkpoint exists afterwards | Improvement service + `CheckpointEngine` | `tests/integration/test_improvement_rollback_flow.py` |
| User-flow E2E | A user approves a proposal, the run applies it, the user rolls it back and the workspace is as before — through the public improvement API, no internals touched | Public product boundary → user-observable result | `tests/integration/test_improvement_rollback_flow.py` |

Epic: [Post-Run Improvement Loop](../1600-improvement-loop.md)
