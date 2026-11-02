## The autopsy reader can print a switched key a child's wait choice overrode before the root ran on it

A switch of the entry model (`setEntryModel`, REQ-MONITOR-142) applies at the root's next turn, where `rootResilience`
builds the root's cell through the session's overrides (`ResilienceMemory.effective`). A child's wait choice
(`model_override`, REQ-MONITOR-303) recorded after the switch and before that turn therefore applies to the switched model
before the root ever runs on it. Say the user switches the entry model to `c1` while the root's call is in flight, and a
child waiting on `c1`'s pair is then moved to `spare`. The root's next turn runs on `spare`, and never on `c1`. The autopsy
reader (`entryModelKeys`) reads the child's choice after the switch, as recorded, because nothing says whether the root's
next turn came before it. It prints `… → c1 → spare`, where the root ran `… → spare`.

The last key, and so the key the root's later calls are printed under, is right. Only a key the root never ran on is
printed in between. The run records where a ladder move of the root falls against a pending switch (`switch_pending`), and
whether a switch or the root's own wait choice supersedes one (`supersedes`). A child's wait choice records neither: its
`supersedes` is always `false`.

Recorded 2026-10-02 (fin5, harness-readers, repair round 2) as the residual of
[the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md](the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md),
whose repair placed the root's own moves and the superseded switches. It was read from the code; no live pack and no test
holds the case. A repair would have the child's `model_override` record `switch_pending` as the root's moves do, so the
reader can read it before the pending switch.

Repair round 3 weighed that sketch and did not take it. Read before the switch as it stands, the choice would print its
target whenever it replaced the pair the root was on before the switch, and children run on the root's model by
default. The root's live cell never follows a child's choice, though
([a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md)).
So the sketch trades a key printed in between for another, in the commoner case. A repair here reads such a choice before
the pending switch without printing it, so that it counts only through the switched cell's rebuild. Where the choice
belongs once the root does follow it depends on how that product note is repaired, so this note waits on it.

## Outcome — repaired 2026-10-02 (fin8, ladder-overrides, task 1)

Repaired after the product note it waited on
([a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md)),
in the same task. With the root following a session-wide override from its next call, round 3's objection no longer
holds: a choice replacing the pair the root runs on before a pending switch does move the root, on the cell from before
the switch, and the switch's rebuild then resolves through the choice.

- `packages/engine/src/run/run.ts`, `setEntryModel`'s wait branch: a child's `model_override` records
  `switch_pending: this.entrySwitchPending`, as a ladder move of the root does (the root's own choice keeps `supersedes`).
- `packages/engine/src/autopsy.ts` and `apps/desktop/scripts/lib/autopsy-entry-model.mjs`, `entryModelKeys`: a
  `model_override` recording `switch_pending: true` is read before the pending switch, as a root move recording it is;
  `false` says the switch had applied. A store recording none reads the choice where it stands, as before.

Pinned by three rows of the moves table in `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`, run against both
copies: a switch to `child-model`, then a child's choice `child-model`'s pair → `spare-model` with `switch_pending: true`,
prints `root-model → spare-model` (red before: `… → child-model → spare-model`); with `switch_pending: false` it prints
`root-model → child-model → spare-model`; and a pending-switch choice replacing the root's own pair prints
`root-model → spare-model → child-model` (red before: `… → child-model` alone, the choice read against the switched key).
The run's record is pinned in `packages/engine/src/run/ladder.test.ts` ("a child's wait choice records whether an entry
switch is pending at it"): `switch_pending` true with a switch pending and false without (red before: absent), and the
root's requests `a1, a1, c1, …, f1` — the choice from its resume, the switch from the next iteration.

## Specs

- None; harness reader. The run's behaviour it misreads is REQ-MONITOR-142 (a switch applies from the next iteration)
  and REQ-MONITOR-303 / REQ-ORCH-091 d (the wait's change of model, stored for the session).

## Relevant files

- `packages/engine/src/autopsy.ts` — `entryModelKeys`: the loop's `after` records, read after the pending switch.
- `apps/desktop/scripts/lib/autopsy-entry-model.mjs` — the script's copy.
- `packages/engine/src/run/run.ts` — `setEntryModel`'s wait branch, which writes the child's `model_override`;
  `rootResilience`, which builds the root's cell through the overrides.
