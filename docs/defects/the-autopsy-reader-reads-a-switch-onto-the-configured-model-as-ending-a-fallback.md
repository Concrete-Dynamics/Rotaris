## The autopsy reader reads a switch onto the configured model as ending a fallback

After the ladder moves the root (`quota_fallback_model`, `llm_unresponsive`), the autopsy reader's `entryModelKeys`
reads any later `entry_model_switched` as the root's new key. The run does not always rebuild the root's cell on a
switch: `rootResilience` (`packages/engine/src/run/run.ts`) rebuilds it only when the switched-to model is not the
same reference as the one already applied (`sameRef`: provider id, model id and base URL). A switch to a key that
resolves to the model already configured therefore leaves the fallback in force for the rest of the run, while the
reader prints the root back on the configured key. The configuration snapshot records `provider|model` pairs and base
URLs per `models:` key, not the `ModelRef` the run compares, so the reader cannot tell the two cases apart with
certainty. No 2026-10-01 store holds such a switch after a fallback. Noticed while repairing
[the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md](fixed/the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md)
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
