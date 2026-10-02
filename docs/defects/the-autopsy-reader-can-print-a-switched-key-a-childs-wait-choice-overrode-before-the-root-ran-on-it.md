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
[the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md](fixed/the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md),
whose repair placed the root's own moves and the superseded switches. It was read from the code; no live pack and no test
holds the case. A repair would have the child's `model_override` record `switch_pending` as the root's moves do, so the
reader can read it before the pending switch.

## Specs

- None; harness reader. The run's behaviour it misreads is REQ-MONITOR-142 (a switch applies from the next iteration)
  and REQ-MONITOR-303 / REQ-ORCH-091 d (the wait's change of model, stored for the session).

## Relevant files

- `packages/engine/src/autopsy.ts` — `entryModelKeys`: the loop's `after` records, read after the pending switch.
- `apps/desktop/scripts/lib/autopsy-entry-model.mjs` — the script's copy.
- `packages/engine/src/run/run.ts` — `setEntryModel`'s wait branch, which writes the child's `model_override`;
  `rootResilience`, which builds the root's cell through the overrides.
