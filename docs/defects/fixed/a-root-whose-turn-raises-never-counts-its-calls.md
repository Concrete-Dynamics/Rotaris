## A root whose turn raises never counts its calls

An execution root's tool calls join the session's tool-call total when its turn returns (`Run.turn` adds its
outcome's `toolCallCount`), and since the repair of
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](a-roots-calls-before-a-crash-never-reach-the-session-total.md)
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

## Outcome

Confirmed on `fix-accept1-17` (from `origin/main` `f4ae181`) by two cases, both red before the repair: a root that ran one
call and raised out of the next ended its failed iteration with `sessions.tool_calls` and `root_tool_calls` **0** where **2**
were due; a root that raised while a pause brought the run to rest left its open iteration at **0** of 2, and the continue
that resumed it closed the session at **1** where **3** were due — the resumed execution's `recordedAtStart` read the two
uncounted calls as counted.

`Run.turn`'s `finally` now counts every root whose turn never returned — raised as well as given up on (`outcome === null`)
— from its record, less `recordedAtStart`, through `persistToolCalls`, so the total and `iterations.root_tool_calls` move in
one transaction. Before counting, a raise that no rest paused has its open call answered, and its row settled, as cut off,
naming no rest (OQ-96), as the explicit cancel's give-up already did: otherwise a call the raising step asked for and never
started would be counted (the first case reads **3** without that piece), and the call it raised out of would stay
`running` (REQ-SESSION-129). A rest already answers them. A root that returned is counted with its outcome, unchanged.

Pinned by: `packages/engine/src/children/children.test.ts` — "REQ-MONITOR-102 (the repair of
a-root-whose-turn-raises-never-counts-its-calls.md): a root whose turn raises counts its calls from its record" — "a raise
that closes the iteration failed: …" and "a raise while the run comes to rest leaves the iteration open; the continue counts
only the calls the resumed root adds". Not driven in the built app or live: no proof or live-run scenario makes a root's turn
raise, and the note was found by reading the code.

Repaired 2026-09-29 under R-067.
