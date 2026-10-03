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
