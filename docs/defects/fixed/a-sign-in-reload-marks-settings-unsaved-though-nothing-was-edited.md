## A sign-in's reload marks Settings unsaved though nothing was edited

Observed 2026-10-03 by the orchestrator's default live run at origin/main `1763f7f` (katalyst, pack
`2026-10-03T05-56-27-364Z`, finding D2 of its autopsy). After the first sign-in made from Settings, `sign-in.png`'s
status strip reads **unsaved settings** under "Added Katalyst; discovered 1 model.", while `sign-in/app.log`
05:56:29.850 to 05:56:32.577 shows only the category select, the `add-endpoint` click, the dialog fill and its button:
no settings edit was made.

The mechanism: the main process announces the reloaded snapshot after a provider change; the Settings hook adopts it
keeping the pending state, which calls `rebasePending`. That function builds its result with its top-level keys in a
different order from `pendingFrom`'s, and `isDirty` compares the two `JSON.stringify` strings, so equal values read as
different. The flag turns the strip's `unsaved settings` on and arms both the navigation guard and the window-close
guard, which would then ask Save, Discard or Cancel about edits the user never made. The same path fires on any
configuration change made elsewhere while Settings is open. The covering test compared with `toEqual`, which ignores
key order, so it never saw it.

## Specs

- REQ-CONFIG-419 — a reload must leave the form clean and produce no dirty transition at any point.
- REQ-SHELL-041 and REQ-WORKSPACE-022 — the strip's `unsaved settings` flag shows only while Settings holds unsaved
  edits.
- REQ-CONFIG-286 — the unsaved-changes guard returns immediately when the form is clean.

## Relevant files

- `packages/ui/src/settings/config-state.ts` — `pendingFrom`, `rebasePending`, `isDirty` and the string comparison.
- `packages/ui/src/settings/config-state.test.ts` — the rebase test that compared with `toEqual`.
- `apps/desktop/src/renderer/main.tsx` — the Settings hook: `adopt(next, keepPending)`, the `dirty` flag, the strip
  item and both guards it arms.
- `apps/desktop/src/main/index.ts` — the reload announced after a provider change.

Noticed 2026-10-03 by the autopsy of the live run at `1763f7f`; recorded before the repair.

## Repaired 2026-10-03

`isDirty` and the rebase's whole-block checks now use a structural comparison (`sameValue` in
`packages/ui/src/settings/config-state.ts`): equal values are equal whatever order an object holds its keys in, an
array's order is part of its value, and a key holding `undefined` counts as absent, as it did under `JSON.stringify`.
`rebasePending` also compares each runtime key by value, so a list the user edited and put back counts as untouched
and takes the file's new value. Nothing in the renderer changed: the strip's flag and both guards read the same
`dirty`, which is now false after a reload with no edit and stays true across a reload with one.

Evidence:

- `packages/ui/src/settings/config-state.test.ts` — three cases, each red on the unrepaired file: a reload with no
  edit is clean (and an edit stays dirty across it, and is clean again once undone); equal values in another key order
  are clean at every depth while a different value or a reordered list is dirty; a list edited and put back takes the
  file's new value.
- `pnpm settings-proof`, launch 11 (`reload-clean`), no provider: Settings open on Runtime, the memory-diagnostics
  switch written twice (each write announced back to the window as a sign-in's reload is), the strip and the save bar
  read after each. Against a build of the unrepaired file the launch failed at the first reload with
  `{"unsavedFlag":true,"status":"Unsaved changes","diagnostics":true,…}`; repaired, the form stays clean after the
  reload with no edit, and a circuit-breaker edit stays dirty and kept across the second reload.

Not measured here: the sign-in itself. The live check that shows it is the live run's `sign-in` scenario, its
`sign-in.png` strip read with no `unsaved settings`; the orchestrator runs it after the merge.
