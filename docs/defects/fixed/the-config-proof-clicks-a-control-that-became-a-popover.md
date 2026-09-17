## `pnpm config-proof` has been red since the composer's permission mode became a press-revealed chip

Scenario 4 drives the composer's permission-mode control through the capture seam
`ROTARIS_CAPTURE_MODE=autonomous`, which clicked `.seg-opt` — the always-drawn segmented row REQ-TOOLS-077
was first built as. `PD-CHAT-001` replaced that row with a value chip whose three presets open in a
press-revealed popover (`PopoverMenu`, `chip-menu__panel`, `chip-menu__item`), and the seam was not moved
with it. Since that commit the launch logs `capture: no "autonomous" control on screen`, no write happens,
and the script fails with `the composer's control did not write its key` — which reads as a product defect
in the per-field configuration write (REQ-CONFIG-288) and is not one: the control works, the seam misses it.

The failure is at scenario 4 of 5, so the scenarios after it have been unmeasured for the same period.

## Specs

No product requirement is contradicted. REQ-CONFIG-288's per-field write and REQ-TOOLS-077's
confirmation-before-`autonomous` both behave as specified; the unit tests and `WorkspaceView.tsx` cover
them. What failed is the rule in `.claude/rules/tests-and-proofs.md` that a moved seam breaks a
neighbour's proof and that the change which moves it owns the repair — and, worse than a plain red, this
one accuses the wrong mechanism.

## Relevant files

- `apps/desktop/src/main/capture/seams.ts` — the `ROTARIS_CAPTURE_MODE` seam, which held the `.seg-opt`
  selector.
- `apps/desktop/scripts/config-proof.mjs` — scenario 4, the assertion over the written `agents.yaml`.
- `packages/ui/src/WorkspaceView.tsx` — `ModeSelector`, the chip (`data-testid="chip-mode"`) and the
  confirmation dialog.
- `packages/ui/src/design-system/overlays.tsx` — `PopoverMenu`: the trigger `.chip-menu`, the panel
  `.chip-menu__panel` and each option's `.chip-menu__label`.

Noticed 2026-09-17 by Part AT (`PD-LIBRARY-002`) running the wider proof sweep, and confirmed to pre-date
that work by running the script against a clean `main` build, where it fails identically.

## Repaired — 2026-09-17

The seam now performs the gesture a user performs: click the chip, wait for the popover, click the preset's
own label (the option's text is label + hint, so the exact-text match lands on `.chip-menu__label`), then
confirm `autonomous` in the dialog as before. `pnpm config-proof` is green again, and scenario 5 is measured
for the first time since the redesign.
