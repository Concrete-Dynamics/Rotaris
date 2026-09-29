## A child settled outside its execution fires no `child_completed` hook

`child_completed` fires from two places only, both in `children/orchestration.ts`:
- the end of a child's own execution (`IterationChildren.execute`);
- since 2026-09-29, `settleRaised`, which settles a child whose execution raised outside its turn.

Every other path that brings a child to a terminal state fires no hook:
- the blocking cascade (`Scheduler.cascadeBlocked`, REQ-ORCH-048);
- the finalize sweep (`Scheduler.finalizeIncomplete`, REQ-ORCH-052);
- the user's cancel of one child (`IterationChildren.cancel`, REQ-ORCH-133);
- the at-rest cancel (`Sessions.cancelPausedAtRest`, `PD-ORCH-005` clause 16);
- the settle of a child a previous run left (`settleStaleChildren`, REQ-ORCH-053);
- the decline of a resumable iteration (`PD-ORCH-005` clause 6).

A hook configured on `child_completed` therefore never hears of a child that was blocked or cancelled.

Noticed 2026-09-29 while repairing
[`a-child-blocked-by-its-dependency-gets-no-report.md`](fixed/a-child-blocked-by-its-dependency-gets-no-report.md).
Established by reading the code; not driven.

## Specs

`REQ-HOOKS-003`: "`child_completed` once a delegated child agent has finished, whatever its final state". Whether a
child that never started (`blocked`), or one cancelled while paused, has "finished" is a reading. `cancelled` and
`blocked` are terminal states (REQ-MONITOR-300), and REQ-ORCH-048 has terminal-state callbacks fire for cascaded
records "exactly as for directly completed ones", which suggests the hook should fire too. Some of these paths run
where no hook port is at hand, such as `Sessions` at rest.

## Relevant files

- `packages/engine/src/children/scheduler.ts`: `cascadeBlocked` and `finalizeIncomplete`. The scheduler has no hook
  port.
- `packages/engine/src/children/orchestration.ts`: `cancel`, `settleStaleChildren`, and the two paths that do fire.
- `packages/engine/src/sessions.ts`: the at-rest cancel.
