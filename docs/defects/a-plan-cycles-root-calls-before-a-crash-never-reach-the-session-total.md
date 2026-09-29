## A plan cycle's root calls before a crash never reach the session total

A plan cycle's root (`Run.turn` with iteration 0, PD-ORCH-003 / REQ-ORCH-153) has its tool calls added to the session's
tool-call total when its turn returns, as an execution root's are. A crash ends that turn without returning, and a plan
cycle has no `iterations` row (a plan cycle is not an iteration; a crash during one leaves no row open, OQ-96), so neither
the crash record nor the per-root count that repaired the execution root's case
([`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](fixed/a-roots-calls-before-a-crash-never-reach-the-session-total.md))
reaches it: the calls the plan cycle's root made before the crash are in its conversation record (under iteration 0)
and its transcript rows, and never in `sessions.tool_calls`. Noticed while repairing that note (2026-09-29), established
by reading the code; not driven. A plan cycle is read-only work, so the calls lost are reads.

## Specs

`REQ-MONITOR-102` (a session-wide total tool-call count is persisted; the displayed total is the persisted value), which a
call never counted does not meet.

## Relevant files

- `packages/engine/src/run/run.ts` — `turn`, where a plan cycle's root has no `rootCount` (no iteration row).
- `packages/engine/src/run/crash.ts` — `recordCrash`, which reads only the open execution iteration.
- `packages/engine/src/run/record.ts` — the plan cycle root's record, under iteration 0.
