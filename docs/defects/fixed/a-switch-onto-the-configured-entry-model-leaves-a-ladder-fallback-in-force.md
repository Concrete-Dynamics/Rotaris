## A switch onto the configured entry model leaves a ladder fallback in force

After the ladder moves the root agent off its configured model (a same-tier fallback, REQ-ORCH-091 b, or the role's
fallback on an unresponsive model, REQ-ORCH-090; `ladder.ts` sets `cell.model`), a mid-run switch of the entry model back
to the configured key changes nothing the run does. `rootResilience` (`packages/engine/src/run/run.ts`) rebuilds the root's
cell only when the requested entry model differs from `appliedEntryModel`, the model the cell was last *built* from, not
the one it currently runs on; the switch names that very model, so the cell is kept and the fallback stays in force for the
rest of the run. `setEntryModel` nonetheless appends the system row "Entry model switched to <key>; it applies from the
next iteration." The user is told the run is back on the primary model while every later root turn goes to the fallback.

Noticed 2026-10-02 while repairing
[the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md](the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md)
(fin5, harness-readers), and first named in the third triage of open notes as a candidate to record. Read from the code;
the run now records the fact on the switch (`entry_model_switched` carries `rebuilds: false`), pinned by
`packages/engine/src/run/ladder.test.ts` ("a switch records whether the root's cell is rebuilt for it …"). The same holds
when the user switches away and back before the root's next turn: the second switch records `supersedes: true`, and the
root keeps its fallback (the same file, "a switch away and back before the root's next turn …"). Not reached in a
live pack. Not repaired: whether the run should rebuild the root's cell on such a switch (and with it reset or keep the
cell's one-fallback budgets) is a product change outside that task.

## Specs

- REQ-MONITOR-142: each switch's system row states the new model and that it applies from the next iteration; here it does
  not apply.
- REQ-MONITOR-145: mid-run model switching is the supported recovery lever for moving back to a primary model in a run
  that has meanwhile been proceeding on a fallback; switching to the primary is exactly the switch that is not applied.
- REQ-ORCH-090, REQ-ORCH-091 b: the ladder moves the switch should be able to end.

## Relevant files

- `packages/engine/src/run/run.ts` — `rootRebuildsFor` and `rootResilience` (the rebuild test against
  `appliedEntryModel`); `setEntryModel` (the system row and the `entry_model_switched` entry).
- `packages/engine/src/run/ladder.ts` — the moves that set `cell.model` without touching `appliedEntryModel`.
- `packages/engine/src/run/resilience.ts` — `sameRef`.
- `packages/engine/src/run/ladder.test.ts` — the case that records `rebuilds: false` for the switch.

## Outcome

Repaired 2026-10-02 on `fin5-noticed-gaps`, as the same defect as
[an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md](an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md),
which that branch recorded in parallel from the same triage finding (the two notes met at its merge of `origin/main`;
that note carries the repair, its tests and its proof). Whether a user's switch onto the configured model should end a
ladder move is raised as OQ-176 for the owner; the build proceeds under the reading that it does, REQ-MONITOR-145's
recovery lever. `rootRebuildsFor` now counts a pending model switch, so the root's cell is rebuilt on the chosen model at
its next turn (the once-per-agent budgets carried over) and every switch records `rebuilds: true`. The `rebuilds: false`
this note described is found only in stores written before the repair, and the autopsy reader keeps reading it.

The two `ladder.test.ts` cases this note named as pinning the defect were changed to pin the repair: "a switch records
whether the root's cell is rebuilt for it …" now expects the switch back onto `a1` to record `rebuilds: true` and the
root's next turn to run on `a1`, and "a switch away and back before the root's next turn …" now expects `a1` after the
superseding switch. Both failed against the repair until changed, as a pin of the defect should.
