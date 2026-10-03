## Two quick configuration reloads mark Settings unsaved

Reported 2026-10-03 by plan fin12's verifier and builder (merged `b56297e` and `bafd0cf`), outside their own tasks;
recorded by plan fin13 at origin/main `8850ea2`, before the repair.

The Settings hook's `adopt` (`apps/desktop/src/renderer/main.tsx`, lines 657 to 665 at `8850ea2`) rebases a reloaded
snapshot against `savedRef.current`, and that ref is updated only in an effect that runs after React commits the
render. When two `config:changed` announcements land before that effect runs — two writes made elsewhere in quick
succession, or a write and a sign-in's reload — the second is rebased against the saved state from before the first.
Every field the first announcement changed then reads as a user edit: the pending state keeps the first write's value,
`saved` holds the second's, and where the two differ the form is dirty and shows a value the file no longer holds.
The strip's `unsaved settings` flag comes on and both guards arm, as in the single-reload defect fin12 repaired
(`docs/defects/fixed/a-sign-in-reload-marks-settings-unsaved-though-nothing-was-edited.md`).

`pnpm settings-proof` launch 11 (`reload-clean`) spaces its two writes four seconds apart, so the effect has
always run between them and the launch cannot see this.

## Specs

- REQ-CONFIG-419 — no reload path may emit a change notification; a reload leaves the form clean and produces no
  dirty transition at any point.
- REQ-SHELL-041 and REQ-WORKSPACE-022 — the strip's `unsaved settings` flag shows only while Settings holds unsaved
  edits.
- REQ-CONFIG-286 — the unsaved-changes guard returns immediately when the form is clean.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — `useConfiguration`: `savedRef`, the effect that updates it, and `adopt`.
- `packages/ui/src/settings/config-state.ts` — `rebasePending`, which is correct for one reload and is handed a stale
  previous saved state by the second.
- `apps/desktop/scripts/settings-proof.mjs` — launch 11, whose writes are spaced.
