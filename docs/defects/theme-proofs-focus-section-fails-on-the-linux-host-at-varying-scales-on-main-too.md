## theme-proof's focus section fails on the Linux host at varying scales, on main too

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
