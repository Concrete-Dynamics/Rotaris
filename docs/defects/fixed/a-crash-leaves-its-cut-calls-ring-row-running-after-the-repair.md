## A crash leaves its cut call's ring row running after the repair

A call a run was making when its host died has two records: its transcript row and its row in the `tool_calls` ring
(ADR-0024). The crash record (`run/crash.ts` `recordCrash` → `answerOpenCalls`, at the next repair or continue) settles
the transcript row `failed` with the interruption's statement, as REQ-SESSION-129 asks, but nothing settles the ring row:
an orderly end settles every open ring row `failed` when the run's tool ports close (`apps/desktop/src/run-host/tools.ts`,
the sink's `close`), and a crash never closes them. After the repair the store holds the same call settled in the transcript
and `running` in the ring, for good — the ring's `tool_calls_settle_once` trigger lets a row settle once, so a later settle
would be allowed, but no path makes one.

Measured 2026-09-29 while taking the live evidence for the repair of
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](a-roots-calls-before-a-crash-never-reach-the-session-total.md):
the duress run's pack `.live-run/runs/2026-09-29T12-40-51-800Z/` (the `fix-turn-accounting` worktree; git-ignored), session
`c0066cc5`, ended at its 40-minute deadline by the harness's immediate exit. The orchestrator's `wait_for_tasks` call
`chatcmpl-tool-ba7e827bcc882804` was open: ring ordinal 218 `running`, transcript row 457 `running`. A repair of a copy of
that store (`Sessions.repair` from the workspace source) settled row 457 and left ordinal 218 `running`.

## Specs

REQ-SESSION-129 ("no transcript row of its own left at status `running`; every such row MUST be persisted at status
`failed`") names the transcript row, which the crash record meets; no requirement names the ring row's settling after a
crash, so the contradiction is by the same guarantee rather than by a clause. REQ-MONITOR-105's vocabulary reads a
`running` row as a call still under way, which no call of a dead host is. Whether the ring must settle here too may be an
open question rather than a defect.

## Relevant files

- `packages/engine/src/run/crash.ts` — `recordCrash` / `answerOpenCalls`, which settle transcript rows only.
- `apps/desktop/src/run-host/tools.ts` — the gate sink's `close`, which settles open ring rows at an orderly end.
- `packages/engine/src/session-writer.ts` — `settleToolCall`; `packages/store/src/dal.ts` — `settleToolCall`, the ring's
  settle-once statement.

## Outcome — repaired 2026-09-30 under R-067

Acceptance finding A30 (acceptance round 1). **Confirmed first on the branch's code** by a case over a real store: a call
settled and a call cut, each with its ring row and its transcript row, and a third agent's call left open; after
`recordCrash` the cut call's transcript row read `failed` and both open ring rows still read `running`. Confirmed again on a
copy of the first duress pack's store (`/home/user/Rotaris-crw-wt-sweep/.live-run/runs/2026-09-29T03-06-14-929Z/`, session
`379f1490`; the pack named above went with its worktree): the orchestrator's `wait_for_tasks` call
`chatcmpl-tool-aff737bb15a796a5` was ring ordinal 294 `running`, and a `Sessions.repair` of the copy from the workspace
source (a throwaway harness, not committed) left it `running` without the repair.

**The question the note left open is read as a defect, not an OQ.** No requirement names the ring row's settling after a
crash, but REQ-MONITOR-105's `running` is a call still under way, which no call of a dead host is, and the crash record
already settles the same call's transcript row under REQ-SESSION-129; the store holding one call settled in one record and
under way in the other is the disagreement. ADR-0024's first execution had recorded that such a row "needs no repair"
(`REQ-CHAT-049`'s dead-session drawing); that claim predates the crash record and is corrected in place there, the
falsified reason kept beside the correction.

**What changed.** `recordCrash` (`packages/engine/src/run/crash.ts`, `settleDeadToolCalls`) settles every `tool_calls` row
still `running` in the session, through the ring's one settling update (`SessionWriter.settleToolCall`, with its
`tool.finish`): `failed`, `is_error`, the result and the error the statement its transcript row is given (interrupted by a
crash before it completed, not re-run). Every such row is a dead run's — a repair runs only when no process holds the
session, and a continue records the crash before its run is built — so the rows of the paused agents, of a plan cycle's
root and of an orphan the stale-child settle will cancel settle alike. The one exception is a continue after a run of this
process that parked without closing its tool ports (the message-limit pause, the plan gate; `Run.closedItsPorts` is false):
a row still `running` then may be a call of that run that ignored its abort and is still under way, so the continue passes
`ownCallsMayRun` and the ring is left to that call's own settle. (This read "and a run of this process closed its ports when
it ended", which holds only for a run that ended at its teardown; corrected at review on 2026-10-01.)
What that exception leaves is recorded apart, not repaired here: a parked run never closes its ports, so a call of its that
never returns keeps its ring row `running` for good (the pinning case's `stray` row reads `running` after the continuation
run completes); a later run of this process that tears down re-arms the settle over the parked run's rows; and two processes
over one workspace can leave a dead process's rows to a live one's skip —
[`a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md`](../a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md).
No process observed the call's end, so its duration is NULL (`ToolCallSettle.elapsed_ms` admits null for this case alone),
never invented. Neither clause that gives a settled call a duration governs this row: REQ-EVENTS-057's `tool.finish` duration is
a **completed** call's, and this call did not complete; REQ-MONITOR-228's interval runs from a transcript row's start to the
run's terminal state, and a dead host recorded no terminal state — the moment of the crash is not known, so the interval has
no end to take. Its `tool.finish` carries `duration_ms: null` for the same reason (a reading stated at review, 2026-10-01). The ring's settle-once trigger is unchanged; a second recording finds none running.

Pinned by: `packages/engine/src/run/crash.test.ts` — "REQ-SESSION-129 with ADR-0024 (the repair of
a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md): the ring row of every call a dead run left running settles
`failed` with the crash's statement, once; a settled one keeps what it returned" — which fails with the settle removed (both
rows `running`) and passes with it — and "a continue after a run of this process parked at the plan gate leaves a ring row
its call may still hold `running`", which fails with the continue's `ownCallsMayRun` forced false (the row settles `failed`)
and passes with it.

**Shown on the pack's store.** The same harness over a fresh copy of the pack, on the repaired branch: ordinal 294 `running`
before the repair, `failed` with the statement and a NULL duration after, no ring row left `running`. With the one call
to `settleDeadToolCalls` removed, the same repair left ordinal 294 `running`. That store was written by a v22 build, before the
`iterations` table existed, so its crash record finds no open iteration and the call's transcript row 555 stays `running`
after the repair either way: a store from before PD-ORCH-005 has no root the crash record can name, and nothing in this
repair changes that.

**The live run cannot show it now.** `LIVE_RUN_DURESS_MS=900000 pnpm live-run --confirm --skip-build --only=duress` on the
repaired branch against `katalyst` (pack `.live-run/runs/2026-09-30T23-24-06-244Z/` of the `fix-accept1-16` worktree;
git-ignored; session `a8bcae4c`, PASSED, the window the bound) ended by the application's orderly quit, not a crash: the
iteration is open with interruption `quit`, and the quit's own port close left **0** ring rows and **0** transcript rows
`running`. The crash this note measured came from the harness's immediate exit at the deadline, which no longer happens, so
the scenario no longer reaches the crash record; the repair is shown by the case and the pack copy above.

