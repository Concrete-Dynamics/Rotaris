---
req-id: SWR-2912
status: approved
trace: required
test: required
title: "Every child record reaches a terminal state when its run ends"
epic: SWR-100
date: 2026-08-10
---

# SWR-2912 — Every child record reaches a terminal state when its run ends

SWR-112 names the child terminal states. It does not say when a record must
reach one, and the iteration path has four exits that never do: an iteration
whose report is `blocked`, one that falls through to a plain re-queue, one that
is cancelled, and one that crashes. On each of those the iteration's own record
— the entry persona's, spawned by the loop and rebound as the iteration parent
— is left at `running` in the session snapshot, permanently.

A record that outlives its run is not a cosmetic problem. The snapshot is what
every host reads back: the desktop's agent tree, the TUI's agent panel, and any
session reopened tomorrow all take `child_states` at its word and report a
delegating agent as live long after the loop stopped. `Scheduler.cancel_children`
looks like it covers the cancellation case but does not — it iterates the
scheduler's dispatched asyncio tasks, and the iteration's own record is awaited
inline and was never among them.

A run that has ended MUST leave no record claiming to be running.

## Acceptance criteria

- When `RalphLoop._run_iteration` returns, its own child record is terminal on
  every exit path: `succeeded`, `failed`, `blocked`, a plain re-queue,
  cancellation, and an unhandled exception.
- A re-queued iteration (`blocked` or the plain PENDING fallthrough) records
  `succeeded`. The conversation it describes did end; the outstanding work is
  carried by the task's own `PENDING` status, not by a record left open. It is
  not recorded as `blocked`, which hosts render as a failure.
- A cancelled iteration records `cancelled`; one that raised records `failed`.
  Both carry a `ChildReportArtifact` whose summary names the reason.
- On the cancellation and failure exits, every *other* non-terminal record the
  iteration's `ChildManager` still holds is swept to `cancelled` as well, so a
  child that never got dispatched cannot outlive the run either.
- The sweep is `ChildManager.finalize_incomplete`, which goes through the
  existing `mark_child_terminal` so dependency cascade, model-slot release, and
  the terminal-state callback that hosts persist from all fire exactly as they
  do for an ordinary completion. It is idempotent and leaves already-terminal
  records untouched.
- The sweep does **not** run on the `blocked` exit. Background children
  deliberately outlive the iteration that spawned them, and
  `_drain_active_children_before_stop` is what collects them when the loop
  concludes.
- Records are moved with `record.transition(...)`; `cancelled` is the sweep's
  target precisely because it is the one terminal state reachable from every
  non-terminal state in `VALID_TRANSITIONS`.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A run that delegates, is re-queued, is cancelled, or crashes leaves no record claiming to run; a sweep closes undispatched children without disturbing finished ones | `RalphLoop._run_iteration`; `ChildManager.finalize_incomplete` | `tests/unit/test_ralph_loop.py::test_a_blocked_iteration_leaves_its_record_terminal`, `::test_a_requeued_iteration_leaves_its_record_terminal`, `::test_a_cancelled_iteration_leaves_its_record_cancelled`, `::test_a_crashed_iteration_leaves_its_record_failed`, `tests/unit/test_child_manager.py::test_finalize_incomplete_cancels_every_unfinished_record`, `::test_finalize_incomplete_leaves_terminal_records_alone`, `::test_finalize_incomplete_is_idempotent`, `::test_finalize_incomplete_notifies_the_terminal_state_callback` |
| Integration | A real loop run that ends on a delegating iteration persists a session snapshot in which no agent is still running | `RalphLoop` → `Scheduler` → `ChildManager` → session snapshot | `tests/integration/test_ralph_e2e.py::test_a_run_that_ends_while_delegating_persists_no_running_agent` |
| User-flow E2E | A user watches a run finish in Rotaris and the agent list agrees with the run header instead of contradicting it | Public product boundary → user-observable result | `apps/rotaris/tests/test_run_wiring_e2e.py::test_a_finished_run_leaves_no_live_agent` |

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)
