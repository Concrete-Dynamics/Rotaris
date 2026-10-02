## A parked run's call that never returns keeps its ring row running

A run that parks without tearing down — at the plan gate (REQ-ORCH-153) or at the message-limit pause (REQ-ORCH-087) —
never closes the tool ports it built (`Run.closePorts` runs only at the run's teardown), so the gate sink's `close`, which
settles every open `tool_calls` ring row `failed` at an orderly end, never runs for it. The crash record's ring settle
(`run/crash.ts` `settleDeadToolCalls`, the repair of
[`a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md`](fixed/a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md))
deliberately skips a continue whose session still holds such a run (`ownCallsMayRun`, from `Run.closedItsPorts`), because a
call of that run that ignored its abort may still be under way and its own settle still to come. Three residuals follow;
each is reasoned from the code, none is measured in the built app:

1. **A call of a parked run that never returns keeps its ring row `running` for good.** Nothing closes the parked run's
   ports, the continue's crash record leaves the row to the call, and the call never settles it. The driven case that pins
   the skip asserts exactly this: its `stray` row still reads `running` after the continuation run completes
   (`packages/engine/src/run/crash.test.ts`, "a continue after a run of this process parked at the plan gate leaves a ring
   row its call may still hold `running`"; there the row has no call behind it at all).
2. **A later run of this process that tears down re-arms the settle over the earlier parked run's rows.** `ownCallsMayRun`
   reads only the session's current run (`s.run`). Once a continuation run has torn down (`closedItsPorts` true), the next
   continue settles `failed`, as a crash's, a ring row the earlier parked run's call may still hold — the drop of a real
   settle the skip exists to prevent.
3. **Two processes over one workspace.** Process A parks a run and keeps it as `s.run`; process B continues the session and
   crashes; A continues again and, holding its parked run, skips the settle, leaving B's dead ring rows `running`. The ring
   rows carry no process identity, so a crash record cannot tell a dead process's row from a live one's.

The transcript rows are not affected: the crash record answers those under REQ-SESSION-129 whatever the ring holds.

**Residual 2 repaired 2026-10-01; residuals 1 and 3 wait on [OQ-170](../architecture/open-questions.md).** `Sessions` now
keeps, per live session, every run of this process that parked without closing its tool ports (`Live.portsOpen`,
`packages/engine/src/sessions.ts`), and a continue passes `ownCallsMayRun` while any of them still has its ports open
(`ownCallsMayRunOf`); a run leaves the set once it has closed them. A later run's teardown no longer re-arms the settle over
an earlier parked run's rows. Pinned by `packages/engine/src/run/crash.test.ts`, "a later run of this process that tore down
does not re-arm the settle over an earlier parked run's ring row" (run 1 parks at the plan gate, run 2 is approved and tears
down, run 3 continues: run 1's `stray` row stays `running`; without the repair run 3's continue settled it `failed`), and by
"a continue after a run of this process that completed and tore down settles a ring row no live call holds" (a run leaves
the set at its teardown, so the settle is not skipped for good). A parked run never reaches its teardown and so never
leaves the set: once any run of a session parks, this process skips the ring settle for that session for as long as the
session stays live in it. That widens residual 3 — another process's dead rows, which a later teardown used to re-arm the
settle over, are no longer settled by this process after a park — and it waits on the same question. Whether
a park closes its run's ports, a continue abandons them, or ring rows carry a process identity is OQ-170's, raised with the
reading the build proceeds under; the note stays open for residuals 1 and 3 until it is ruled.

## Specs

REQ-MONITOR-105 reads a `running` row as a call still under way, which residual 1's row is not once its run has moved on;
REQ-MONITOR-228 has no row still in progress after a run ends. Residual 2 drops a real settle, the ADR-0024 ring recording
the crash's statement where the call returned something else. No requirement names a parked run's ports or the ring row of
a call that outlives its run's park, so whether the parked run should close its ports at the park, or the continue should
abandon them, may be an open question rather than a defect.

## Relevant files

- `packages/engine/src/run/run.ts` — `closePorts` and `closedItsPorts`; a parked run never reaches its teardown.
- `packages/engine/src/sessions.ts` — `launchContinuation`, which passed `s.run !== null && !s.run.closedItsPorts` and now
  passes `ownCallsMayRunOf(s)` over `Live.portsOpen`.
- `packages/engine/src/run/crash.ts` — `recordCrash`'s `ownCallsMayRun` and `settleDeadToolCalls`.
- `apps/desktop/src/run-host/tools.ts` — the gate sink's `close`, the orderly-end settle a parked run never reaches.
- `packages/engine/src/run/crash.test.ts` — the driven case whose `stray` row stays `running` (residual 1).
