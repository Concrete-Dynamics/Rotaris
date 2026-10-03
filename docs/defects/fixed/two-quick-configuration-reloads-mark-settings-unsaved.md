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

## Repaired 2026-10-03

The Settings hook holds the saved and pending values as one form state (`SettingsForm`) and adopts every snapshot in one
functional update of it, folded through `adoptSnapshot` (`packages/ui/src/settings/config-state.ts`): a read or a save
repopulates both halves; a reload from elsewhere rebases the pending half against the saved half the form holds at that
moment, which is what the previous adoption left, however close behind it this one arrives. `savedRef` and the effect
that refreshed it are gone; Save, Discard and the per-field edit act on the same form. `rebasePending` itself did not
change.

Evidence:

- `packages/ui/src/settings/config-state.test.ts`, "two reloads adopted back to back leave the form clean and on the
  second file values": two adoptions chained are clean and on the second file's values, the same pair rebased against
  the values from before the first (the hook's old reading) is dirty, an edit made before the pair survives it, and a
  read repopulates clean.
- `apps/desktop/src/renderer/settings-form-wiring.test.ts`: the hook adopts through `setForm((current) =>
  adoptSnapshot(current, fresh, keepPending))` and keeps no `savedRef`, `setSaved` or `setPending`; both cases are red
  on the unrepaired `main.tsx`.
- `pnpm settings-proof`, launch 11′ (`reload-last-write`), no provider: Settings open on Runtime, then the capture's new
  pair seam (`ROTARIS_CAPTURE_CONFIG_PAIR_AT`, `apps/desktop/src/main/capture/seams.ts`) makes two real
  `config.setField` writes of the circuit breaker (off, then on), holds the window's two `config:changed` deliveries
  and hands them over in one synchronous loop. Against a build of the unrepaired hook the launch failed there with
  `{"unsavedFlag":true,"status":"Unsaved changes","breaker":false,"mode":"ask"}`; repaired, it reads
  `{"unsavedFlag":false,"status":"All changes saved","breaker":true}` (run at a load average of about 6 on 4 CPUs,
  beside other agents' builds).

Not measured here: two writes from elsewhere arriving together in a real session. No live scenario arranges two
announcements in one tick; the nearest live check is the live run's `sign-in` scenario, its `sign-in.png` strip read with
no `unsaved settings`, which the orchestrator runs after the merge.
