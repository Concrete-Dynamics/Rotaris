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
open: [OQ-176](../../architecture/open-questions.md).

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

## Outcome

Repaired 2026-10-02 on `fin5-noticed-gaps`, under OQ-176's reading (the question stays open for the owner; the row is
true under either answer, because it now says what the next iteration runs on).

- `Run.rootResilience` rebuilds the root's cell when a user's model switch is pending (`pendingEntrySwitch`), not only
  when the requested model changed, so a switch onto the configured key ends a REQ-ORCH-090 or REQ-ORCH-091 b move; the
  cell's once-per-agent budgets carry over. A reasoning switch sets the level on the model the cell has, so a move
  stands under it.
- `Run.turn` reads the root's ladder once per root turn and hands that one to every call of the turn function, so the
  iteration in flight, its resumes after its children included, finishes on the setting it had.
- `Run.setEntryModel` asks the session memory whether a change-model resolution moved the chosen pair
  (`ResilienceMemory.overrideReaching`); when one did, the row names the model the entry agent runs on instead of saying
  the switch applies.

Pinned by `packages/engine/src/run/ladder.test.ts`'s `OQ-176` block, five tests that each failed before the repair (the
requests went to `b1`, `f1`, the old reasoning level, `c1` within the iteration, and the row said "it applies"). Shown in
the built app by `resilience-proof`'s new `switch-back` scenario: a 429 moves the root from alpha to beta, the user
switches back to alpha from the run header and queues a follow-up, and iteration 2 runs on alpha under the row
"Entry model switched to alpha; it applies from the next iteration." Against the build before the repair the same
scenario failed with the calls alpha, beta, beta; after it all twelve scenarios pass.

**One defect, two notes.** Plan fin5's harness-readers bundle recorded the same defect in parallel, from the same triage
finding, as
[a-switch-onto-the-configured-entry-model-leaves-a-ladder-fallback-in-force.md](a-switch-onto-the-configured-entry-model-leaves-a-ladder-fallback-in-force.md),
and made the run record on each switch whether it rebuilds the root's cell (`rebuilds`), with `rebuilds: false` on the
switch this repair makes rebuild. The two met when this branch merged `origin/main`: that note is closed by this repair
and says so, `rootRebuildsFor` counts the pending switch so every switch records `rebuilds: true`, and that bundle's four
`ladder.test.ts` cases that pinned the defect (a switch onto the model last built from, away and back, a move between two
switches, an unresponsive fallback while a switch is pending) were changed to pin the repair: each now adds a second task,
so the switch reaches a next iteration (the root's resume after its child is still the iteration in flight), and the
root ends on the switched model with the reader reading the fallback then that model.
