## An entry-model switch row says it applies while a ladder move keeps the root

When the ladder has moved the entry agent off its configured model — the unresponsive-model fallback (REQ-ORCH-090) or the
same-tier fallback (REQ-ORCH-091 b) — and the user then switches the entry model to the configured key, `setEntryModel`
appends "Entry model switched to X; it applies from the next iteration." but the next iteration runs on the fallback
still. `rootResilience` rebuilds the root's cell only when the *requested* model changes (`sameRef(appliedEntryModel,
entryModel)`), and a switch onto the key already requested changes nothing it compares, so the cell the ladder moved
is kept for the rest of the run. The row is untrue. Found read-only by the third triage of open defect notes; confirmed
on `fin5-noticed-gaps` by `packages/engine/src/run/ladder.test.ts` (the `OQ-176` block): the requests after the switch
went to `b1` (same-tier) and `f1` (unresponsive), not `a1`.

The same comparison makes three more rows of the same family untrue, confirmed by the same block:

- **A reasoning switch** (`setEntryReasoning`) never rebuilds the cell either, and the level a step is sent is the
  cell's (`ladder.ts`'s `call(cell.model, …)`), so "Entry reasoning level switched to high; it applies from the next
  iteration." was followed by requests at the old level.
- **The iteration in flight** did not finish on the previous setting: `rootResilience` was read at every call of the
  root's turn function, so a root resumed after its children *within the same iteration* was rebuilt on the switched
  model (REQ-MONITOR-142, "the iteration already in flight finishes on the previous setting").
- **A switch onto a pair a change-model resolution moved** (REQ-ORCH-091 d's override, "for the rest of the session")
  is followed by the override's model, through the session memory's `effective`, while the row says the switch
  applies.

Whether a user's switch onto the configured model ends a REQ-ORCH-090/091 b move is a question the specification leaves
open: [OQ-176](../architecture/open-questions.md).

## Specs

- REQ-MONITOR-142 — "applies from the next iteration onward; the iteration already in flight finishes on the previous
  setting. Each switch appends a system transcript row stating the new model or reasoning level and that it applies from
  the next iteration." The row is the requirement's; what it states did not happen.
- REQ-ORCH-090, REQ-ORCH-091 (b) and (d) — the moves and the override the switch meets; OQ-176.

## Relevant files

- `packages/engine/src/run/run.ts` — `rootResilience` (the rebuild test), `setEntryModel` and `setEntryReasoning` (the
  rows), `turn` (where the root's ladder is read for the turn function).
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory.effective`, the override chain a rebuilt cell follows.
- `packages/engine/src/run/ladder.ts` — the moves (`cell.model = …`) the cell carries.
- `packages/engine/src/run/ladder.test.ts` — the reproduction.
