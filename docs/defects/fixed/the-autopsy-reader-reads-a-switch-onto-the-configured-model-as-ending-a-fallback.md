## The autopsy reader reads a switch onto the configured model as ending a fallback

After the ladder moves the root (`quota_fallback_model`, `llm_unresponsive`), the autopsy reader's `entryModelKeys`
reads any later `entry_model_switched` as the root's new key. The run does not always rebuild the root's cell on a
switch: `rootResilience` (`packages/engine/src/run/run.ts`) rebuilds it only when the switched-to model is not the
same reference as the one already applied (`sameRef`: provider id, model id and base URL). A switch to a key that
resolves to the model already configured therefore leaves the fallback in force for the rest of the run, while the
reader prints the root back on the configured key. The configuration snapshot records `provider|model` pairs and base
URLs per `models:` key, not the `ModelRef` the run compares, so the reader cannot tell the two cases apart with
certainty. No 2026-10-01 store holds such a switch after a fallback. Noticed while repairing
[the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md](the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md)
(fin3, repair round 1); the reading is pinned as it stands by the moves table in
`apps/desktop/scripts/lib/autopsy-entry-model.test.ts` ("a switch ends the root's move …"), so a repair changes that row.

## Specs

- None; harness reader. The run's behaviour is REQ-MONITOR-142's switch "from the next iteration" over the ladder of
  REQ-ORCH-090 and REQ-ORCH-091 b; the reader's line is the run-autopsy skill's evidence for the entry agent's model.

## Relevant files

- `packages/engine/src/autopsy.ts` — `entryModelKeys`, the `entry_model_switched` branch.
- `apps/desktop/scripts/lib/autopsy-entry-model.mjs` — the script's copy.
- `packages/engine/src/run/run.ts` — `rootResilience` and its `sameRef` test; `setEntryModel`, which records the switch.
- `packages/engine/src/run/resilience.ts` — `sameRef`.

## Outcome — repaired 2026-10-02 (fin5, harness-readers)

The run now records the fact the reader could not reconstruct. `setEntryModel` (`packages/engine/src/run/run.ts`) writes
`entry_model_switched` with `{ model, rebuilds }`, where `rebuilds` is the predicate `rootResilience` applies at the next
turn (`rootRebuildsFor`: no cell yet, or the cell last built from another model, by `sameRef`): `false` on a switch onto
the model the root's cell was last built from, so a ladder move in force stands. The entry name is unchanged, so the
timeline vocabulary gate (OQ-157) is untouched. Both readers (`entryModelKeys` in `packages/engine/src/autopsy.ts` and its
copy in `apps/desktop/scripts/lib/autopsy-entry-model.mjs`) now end a move only on a switch whose `rebuilds` is not
`false`; on `rebuilds: false` with a move in force the switched key becomes the configured one (a later continuation
recording no snapshot returns to it) and the root stays on its fallback. A store written before the run recorded
`rebuilds` keeps the earlier reading: the switch ends the move.

Pinned by:
- `packages/engine/src/run/ladder.test.ts`, "REQ-MONITOR-142 over REQ-ORCH-091 b: a switch records whether the root's cell
  is rebuilt for it …": the root falls back `a1 → b1` on a quota, and while its call on `b1` is in flight a switch to `a1`
  records `rebuilds: false` and one to `c1` records `rebuilds: true`. It failed before the repair (`{ model }` alone).
- `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`, the moves table: the row "a switch ends the root's move (read so
  even onto the model already configured …)" is replaced by five rows (a rebuilt switch ends the move; a `rebuilds: false`
  switch leaves it in force; the next bare continuation then ends it; with no move in force a `rebuilds: false` switch
  runs on the switched key; an older store's switch ends the move). The second failed on both copies before the repair.
- `packages/engine/src/autopsy.test.ts`, "a switch ends the root's move only where the run records it rebuilt the root's
  cell for it": a synthetic store fixture, since no live pack holds the case. It failed before the repair
  (`root-model → spare-model → root-model`).

**Corrected in place, repair round 1 (2026-10-02).** The first form of this outcome said: "One reading stays coarse, stated
in both copies' doc comments: two switches within one iteration, the first away from the configured model while a move is
in force and the second back onto it before the root takes another turn, read as ending the move, though the cell was
never rebuilt between them; the record does not say whether a turn fell between the two." The verifier showed that this
was the note's own symptom left reachable, not a coarse edge. `rebuilds` is a prediction made at the switch, and a later
switch made before the root's next turn overtakes it. The first record (`rebuilds: true`) was then untrue, and both readers
printed the root back on the configured key while the run stayed on its fallback.

Repaired at its root: the run now also records whether a record **supersedes** a switch that never applied. `Run` keeps
`entrySwitchPending`. A switch sets it, and `rootResilience` clears it where the root's cell is settled at each root turn.
Two records carry it:
- `entry_model_switched` carries `{ model, rebuilds, supersedes }`.
- The root's own wait choice (`model_override`, REQ-MONITOR-303) carries `supersedes`, true when it replaced such a
  switch. A child's wait choice records `false` and leaves the pending switch standing.

Both readers keep the state from before the first unapplied switch, including the keys printed up to it. A superseding
record returns to that state before it is read. Switching away and back with no turn between therefore leaves the move
standing, and a chain of three is read from the state before the first. A store that records no `supersedes` keeps the
earlier reading. Pinned by:
- `packages/engine/src/run/ladder.test.ts`, "a switch away and back before the root's next turn supersedes the first …":
  - The root falls back to `b1` and delegates. While its call is in flight, the user switches to `c1` and back to `a1`.
  - The run records `{c1, rebuilds: true, supersedes: false}` then `{a1, rebuilds: false, supersedes: true}`.
  - The root's resumed turn after the child still goes to `b1`. In the control run, the switch to `c1` alone moves that
    turn to `c1`.
  - `entryModelKeys` over the run's own store reads `['b1']`, and `['b1', 'c1']` in the control.
  - The case fails without the run change and without the reader change.
- The same file's "the root's own wait choice supersedes a switch recorded since its last turn …": a switch to `f1`, made
  while the root's call is in flight, is overtaken by the root's wait choice of `c1`. The override records
  `supersedes: true`. The case fails without the run change.
- The earlier case in that file, which switches to `a1` then `c1` with no turn between, now expects
  `supersedes: false` then `supersedes: true`.
- `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`, four moves-table rows:
  - away and back with no turn between;
  - a third switch in the chain;
  - a switch after an applied one, read as recorded;
  - the root's superseding wait choice.

  The first, second and fourth failed on both copies before the change.

The other coarse reading these doc comments state is a different defect: a switched key is carried across a continuation
that records no snapshot. It is now recorded as an open note,
[the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot.md](../the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot.md).

The product's own row is a separate matter and is recorded, not repaired, here:
[a-switch-onto-the-configured-entry-model-leaves-a-ladder-fallback-in-force.md](../a-switch-onto-the-configured-entry-model-leaves-a-ladder-fallback-in-force.md)
(the system row says the switch applies from the next iteration, and REQ-MONITOR-145 names the switch as the way back to a
primary model, while the run keeps the fallback).
