## A root whose turn raises never counts its calls

An execution root's tool calls join the session's tool-call total when its turn returns (`Run.turn` adds its
outcome's `toolCallCount`), and since the repair of
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](fixed/a-roots-calls-before-a-crash-never-reach-the-session-total.md)
also from its record when the stop's grace gives up on it, or when a crash is recorded. A root whose turn **raises** —
neither a crash nor given up on — takes none of those paths: `Run.turn`'s race rejects, `outcome` stays null, and neither
the run's aggregate nor `iterations.root_tool_calls` moves, so the calls it made in that execution are in its conversation
record and its transcript rows and never in `sessions.tool_calls`. When such an iteration is left open and later
continued, the resumed execution's `recordedAtStart` reads them as already counted, so a later give-up does not count
them either. The same class of loss as the repaired note. Noticed by the verifier's review of that repair (2026-09-29),
established by reading the code; not driven.

## Specs

`REQ-MONITOR-102` (a session-wide total tool-call count is persisted; the displayed total is the persisted value), which a
call never counted does not meet.

## Relevant files

- `packages/engine/src/run/run.ts` — `turn`: the race over `runWithChildren` / `firstTurn`, the count at the root's
  return, the count from its record for a root given up on, and `recordedAtStart`.
- `packages/engine/src/run/interruption.ts` — `callsRun`, the count a record holds.
