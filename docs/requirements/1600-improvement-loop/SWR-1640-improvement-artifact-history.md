---
req-id: SWR-1640
status: draft
trace: required
test: required
title: "Versioned improvement artifact history"
epic: SWR-1600
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-1640 — Versioned improvement artifact history

An improvement artifact is rewritten in place: `save_improvement_artifact` validates the
model and atomically overwrites `<workspace>/.rotaris/improvement_artifacts/<id>.json`.
Every approval, rejection, edit and deletion therefore destroys the previous state. Nobody
can answer "what did this proposal say when it was approved?" or "who deferred it and
when?" — the learning loop that is supposed to be *auditable* keeps no audit.

Requirement: each mutation of an artifact appends a **version** rather than replacing the
only copy.

- Every write records the new state alongside a monotonically increasing version number,
  a UTC timestamp, and what caused it (`collected`, `status_change`, `edit`, `delete`).
- The current state stays readable exactly as today: `load_improvement_artifact` returns
  the latest version and its signature is unchanged, so existing callers — the collector,
  the approval flow, the Rotaris proposals screen — need no modification.
- The history is enumerable per artifact, newest first, and a specific version is
  loadable.
- History is bounded: a per-artifact retention limit keeps a long-lived workspace from
  growing without end, and the **oldest** versions are dropped first so the initial
  collected state and the current state are the last things lost.
- A pre-existing artifact written before this requirement stays loadable and is treated
  as version 1 with an unknown cause. Migration is lazy — opening a workspace must not
  rewrite files that nobody touched.

## Acceptance criteria

- Approving a proposal, then editing it, then rejecting it yields three retrievable
  versions plus the original collected state; each carries its own timestamp and cause.
- `load_improvement_artifact` on a workspace written by the previous implementation
  returns the same object it returned before.
- Writes stay atomic: an interrupted write can never leave the current state unreadable
  (the existing `atomic_write` contract from `rotaris_core.fs` still holds).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A sequence of status changes produces an ordered version history with distinct causes; retention drops the oldest; a legacy single-file artifact loads as version 1 | `improvement/persistence.py` public functions | `tests/unit/improvement/test_persistence.py` |
| Integration | The existing approval flow (collect → approve → prepare run) works unchanged while producing history entries | Approval + persistence together | `tests/integration/test_improvement_approval_flow.py` |
| User-flow E2E | Covered with SWR-1641: a user approves an improvement, sees it applied, and inspects what the proposal said at approval time | Public product boundary → user-observable result | `tests/integration/test_improvement_rollback_flow.py` (shared with SWR-1641) |

Epic: [Post-Run Improvement Loop](../1600-improvement-loop.md)
