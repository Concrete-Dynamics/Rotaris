# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — The crash record settles the ring — 2026-09-30 (R-067)

Part 9 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

## The crash record settles the ring — 2026-09-30 (R-067)

**Measured, then repaired.** The duress live run of 2026-09-29 (pack `2026-09-29T12-40-51-800Z`, session `c0066cc5`) ended
at its deadline by the harness's immediate exit, a crash, with the orchestrator's `wait_for_tasks` call open; a repair of a
copy of its store settled that call's transcript row and left its ring row (ordinal 218) `running`
([`a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md`](../../../defects/fixed/a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md),
acceptance A30). An orderly end settles every ring row still open when the run's tool ports close (the run host's gate
sink, `close`); a crash closes none, and no other path settled one.

**What the crash record now does.** `recordCrash` (`packages/engine/src/run/crash.ts`, `settleDeadToolCalls`) settles every
`tool_calls` row still `running` in the session through `SessionWriter.settleToolCall` — the ring's one settling update,
with its `tool.finish` in the same transaction (REQ-EVENTS-072) — as `failed`, `is_error`, with the statement its transcript
row is given (the call was interrupted by a crash before it completed and was not re-run). Three readings:

- **Every running row is a dead run's — unless a parked run of this process may still hold it.** The crash is recorded at
  a repair, which runs only when no process holds the session, and at a continue before its run is built. So no row is
  singled out by agent: the paused agents', a plan cycle's root's and an orphan the stale-child settle will cancel all
  settle alike. A run of this process closes its tool ports only at its teardown; one that parked — the message-limit
  pause, the plan gate — closed none (`Run.closedItsPorts` false), and a call of its that ignored its abort may still be
  under way. A continue after such a run passes `ownCallsMayRun` and leaves the ring to that call's own settle; since
  2026-10-01 the continue reads every such run of this process on the session (`Live.portsOpen`,
  `packages/engine/src/sessions.ts`), not only the last, so a later run's teardown does not re-arm the settle over an
  earlier parked run's rows (residual 2 of `a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md`; what a
  park or a continue does with the ports is OQ-170's). *Ruled 2026-10-06 by the owner (OQ-170, R-071), and built (plan
  fin21): a park closes its run's ports as the teardown does (`Run.closePorts` in `pauseAtLimit` and at the plan gate), so
  every call still open settles `failed` at the park through the gate sink's `close`, a parked run reports
  `closedItsPorts`, and the skip above no longer arises from a park; the note is closed.* (This
  reading first said "a run of this process closed its ports when it ended", which holds only for a teardown; the review
  of 2026-10-01 found the two parks that close none, and it was corrected here.)
- **No duration is invented.** No process observed the call's end, so `elapsed_ms` is NULL on the row, its entry and its
  `tool.finish` (`ToolCallSettle.elapsed_ms` admits null for this case alone). Every reader of the column already treats
  NULL as unknown (the export's slowest list skips it, the autopsy sums it as nothing).
- **The settle-once rule holds.** The trigger admits exactly one move out of `running`; a second recording finds none.

Pinned by the case "REQ-SESSION-129 with ADR-0024 (the repair of a-crash-leaves-its-cut-calls-ring-row-running-after-the-
repair.md) …" in `packages/engine/src/run/crash.test.ts`, which fails without the settle; shown on a copy of the first
duress pack's store (`2026-09-29T03-06-14-929Z`, ordinal 294 `running` before a repair from the workspace source and
`failed` with the statement after; `running` after it without the settle). The duress live run on the repaired branch (pack `2026-09-30T23-24-06-244Z`) ended by an orderly quit, whose port close
left no ring row `running`; it no longer reaches a crash, so it could not show the settle.
