## The script's autopsy reader ignores a taken-back pin

The autopsy script's copy of `entryModelKeys` (`apps/desktop/scripts/lib/autopsy-entry-model.mjs`) is meant to mirror
the engine's line for line, and `autopsy-entry-model.test.ts` pins the two against each other. Since fin6's
authentication recovery the engine's copy (`packages/engine/src/autopsy.ts`) reads a `model_override` entry carrying
`cleared: true` as taking the pin on its pair back (as `ResilienceMemory.rehydrate` does, REQ-NOTIFY-070/078). The
script's copy does not: such an entry names no `model_key`, so it is skipped, and the pin stays in force for the reader.
Over a store where an authentication pin was set and then taken back (a restart that could not begin, a re-authentication
that re-pinned the primary, a hand-chosen model in the recovery dialog), the script prints the root on the fallback where
the engine's reader and the run put it back on the primary. Probed 2026-10-02 (fin8, ladder-overrides) with a pin of
`katalyst/r` to `spare-model` followed by its `cleared: true` entry: the script printed `root-model → spare-model`, the
engine's copy `root-model → spare-model → root-model`. No row of the moves table holds a `cleared: true` entry, so the
parity test did not catch it. Noticed while editing both copies for
[the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it.md](the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it.md);
not repaired there, being outside that task.

**Outcome, 2026-10-02 (fin8, repaired with the second round of
[a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md)).**
That round has the run take back an override a later wait choice supersedes, as a `model_override` entry carrying
`cleared: true` (`cause: 'superseded'`), so the two copies could no longer disagree on it quietly. The script's
`model_override` branch now reads `cleared: true` as the engine's does (the pin on the pair deleted, the key printed
again), and both copies keep their overrides in the order last set and end a cycle on the newest override's target.
Pinned in `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`'s parity table: "a pin taken back returns the root to its
own key" (the probe above; red in the script's copy before, `root-model → spare-model`) and "a cycle of overrides ends on
the newest override's target" (red in both before).

## Specs

- None; harness reader. The run's behaviour it misreads is REQ-NOTIFY-070 ("where the restart cannot begin, the fallback
  bookkeeping is cleared") and REQ-NOTIFY-078 (the re-pinned primary), as OQ-182's reading builds them.

## Relevant files

- `apps/desktop/scripts/lib/autopsy-entry-model.mjs` — `entryModelKeys`'s `model_override` branch: no `cleared` reading.
- `packages/engine/src/autopsy.ts` — the engine's copy, which reads it.
- `apps/desktop/scripts/lib/autopsy-entry-model.test.ts` — the parity table, which holds no `cleared: true` row.
