---
req-id: SWR-3714
status: approved
trace: required
test: required
title: "Continuing a session settles the children its previous run left running"
epic: SWR-100
date: 2026-08-22
---

# SWR-3714 — Continuing a session settles the children its previous run left running

SWR-2912 makes a run close its own child records before it ends. It can only do
that from inside the process that owns the run: a desktop that was quit, a host
that was killed, a machine that lost power, and a cancel whose teardown outran
the last snapshot write all leave `child_states` entries at `running` with no
`completed_at`, permanently.

Nothing repairs them, and continuing the session makes them visible again.
`execution_status` legitimately reads `running` for the *new* run, so SWR-2913's
reconciliation — which only settles agents when the session claims no run —
correctly leaves them alone. The result is a workspace where a fresh
continuation shows the previous run's agents as live: a pulsing dot and a `N
live` counter for conversations that ended hours ago, mixed in with the two
agents that really are working. Cancelling one does nothing, because there is
nothing there to cancel.

The session lock is what makes the answer unambiguous. A run that has just taken
`<session_dir>/lock` owns the session alone, and it has not started any child
yet, so *every* non-terminal record it reads back belongs to a run that no longer
exists. This is the same reasoning `repair_stale_session` (SWR-2817) applies to
`execution_status`, one level down — and unlike that one it needs no liveness
probe, because holding the lock already proves the previous owner is gone.

A run that continues a session MUST NOT inherit a child claiming to be running.

## Acceptance criteria

- A run that continues an existing session settles every non-terminal
  `child_states` entry it loads — `queued`, `running`, `waiting_on_dependencies`,
  `waiting_on_model_slot` — before the first iteration starts. Already-terminal
  records are untouched, so a completed child keeps its outcome, its
  `completed_at` and its artifacts.
- The settled state is `cancelled`. It is the one terminal state reachable from
  every non-terminal state in `VALID_TRANSITIONS` (SWR-2912 chose it for the same
  reason), and it is what the desktop already renders for an agent that ended
  with its run.
- A settled record carries a `completed_at`, so a host cannot show it as an
  agent that has been running since yesterday, and its `active_tools` are
  cleared — a stopped agent holding a live tool chip is the same contradiction
  one step down.
- The sweep runs after the session lock is acquired and never on a read: loading
  a session to look at it, or to project it into the workspace, does not rewrite
  it. A session owned by another live run is therefore never touched, because
  that run holds the lock and this one does not start.
- Every host that continues a session gets it — the headless/CLI path through
  `run_host.run_session` and the desktop's own run worker alike. A new session
  has no children to settle and is unaffected.
- The settled records reach disk with the run's first persist, so a host reading
  the snapshot back — including the desktop's 750 ms projection — sees the
  corrected states rather than the inherited ones.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A snapshot left with running, queued and succeeded children is settled to exactly one outcome per child: the unfinished ones are cancelled with a completion time and no tool chips, the finished one is untouched; and the terminal states this reads from a snapshot are the state machine's own | `settle_orphaned_children` | `tests/unit/test_session_recovery.py::test_orphaned_children_are_settled_and_finished_ones_are_left_alone`, `::test_settling_orphaned_children_is_idempotent`, `::test_terminal_child_states_match_the_state_machine` |
| Integration | Continuing a session whose snapshot still claims a running child persists a snapshot in which only the new run's agents are live | `run_host.run_session` → session snapshot | `tests/integration/test_stale_session_repair.py::test_continuing_a_session_settles_the_children_its_previous_run_left_running` |
| User-flow E2E | A user continues a run whose previous one was killed and the agent list shows the dead agents as ended, not as live | Public product boundary → user-observable result | `apps/rotaris/tests/test_parallel_runs_e2e.py::test_continuing_a_session_does_not_inherit_the_previous_runs_live_agents` |

Epic: [Orchestration & Delegation Core](../100-orchestration-core.md)
