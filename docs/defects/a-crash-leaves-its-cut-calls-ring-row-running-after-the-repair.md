## A crash leaves its cut call's ring row running after the repair

A call a run was making when its host died has two records: its transcript row and its row in the `tool_calls` ring
(ADR-0024). The crash record (`run/crash.ts` `recordCrash` → `answerOpenCalls`, at the next repair or continue) settles
the transcript row `failed` with the interruption's statement, as REQ-SESSION-129 asks, but nothing settles the ring row:
an orderly end settles every open ring row `failed` when the run's tool ports close (`apps/desktop/src/run-host/tools.ts`,
the sink's `close`), and a crash never closes them. After the repair the store holds the same call settled in the transcript
and `running` in the ring, for good — the ring's `tool_calls_settle_once` trigger lets a row settle once, so a later settle
would be allowed, but no path makes one.

Measured 2026-09-29 while taking the live evidence for the repair of
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](fixed/a-roots-calls-before-a-crash-never-reach-the-session-total.md):
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
