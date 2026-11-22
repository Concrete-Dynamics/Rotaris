## theme-proof's focus section fails on the Linux host at varying scales, on main too

**Outcome: repaired 2026-11-22.** The cause was the window, not the capture's timing: the driven window never received the
system's focus on this host, so `document.hasFocus()` was false, `:focus` and `:focus-visible` matched nothing and no ring
painted, while `activeElement` still named the control the proof had Tabbed to. The driver gained `emulateFocus`
(`main/driver.ts`; Chromium's focus emulation through the DevTools protocol), and `theme-proof.mjs` calls it before its
focus section and stops as a harness failure if the document still is not focused. rotaris-dim at 1.75, red before with
twenty rings at 1:1, measured all 41 with the weakest at 6.1:1; `--counterfactual=focus` still turns it red. The
resize-to-force-a-frame fallback that grew the viewport by a pixel per capture was a symptom (every Tab returned the same
picture) and no longer fires.

`pnpm theme-proof` reports `FAIL focus` for most theme × scale runs on this Linux host (X11 session, `WAYLAND_DISPLAY`
unset), and which runs fail moves from one execution to the next:

- `main` at `26c5767c`: 10 of 15 runs fail.
- `feat/r-121-configure-undo` at `c316b508`: 14 of 15 runs fail.

The failing controls are the same family in both:
- the title bar's window buttons and Sessions;
- the navigation sidebar's views;
- the Settings category list;
- `Status`, `Open project folder` and the Diagnostics controls;
- `Dismiss this notice`.

Most failures measure a ratio of exactly 1 (no ring captured at all), others 1.16–2.8. The branch changes none of
those controls, so the red does not come from the branch. The run that passes or fails at a given scale is not stable,
which points at the capture (a frame taken before the ring paints; the script's own note of 2026-09-12 records
byte-identical focus captures once before) rather than at the product. Not investigated further. Found 2026-11-22
while landing R-121's Undo.

## Specs

`REQ-SHELL-144`..`168`'s focus obligations as `theme-proof` measures them (its record, `docs/proofs/`), against
`REQ-SHELL-128`'s three themes. No product contradiction is established: the instrument's readings are not stable.

## Relevant files

- `apps/desktop/scripts/theme-proof.mjs` — the focus section (`focus-NN` captures, the `mustChange` frame forcing).
- `apps/desktop/scripts/pixels.cjs` — `focusContrast`.
- `.proof/theme-proof/results.json` — per run, `items.focus.failures` names each control and its ratio.
