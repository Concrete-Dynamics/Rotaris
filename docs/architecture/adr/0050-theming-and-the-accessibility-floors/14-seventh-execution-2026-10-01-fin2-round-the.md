# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Seventh execution — 2026-10-01 (fin2 round), the contrast verdict bounded by what it measured

Part 14 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Seventh execution — 2026-10-01 (fin2 round), the contrast verdict bounded by what it measured

The sixth execution made every admitted text counted, measured or skipped, and its coverage boundary named the texts a
skip hides. Nothing read the skips as a failure: the contrast item passed with no text below its floor, one text
measured in the whole cell and no incoherent capture. A regression that pushed one surface's text off the screen, or left
it animating at capture, passed on the rail and the status strip, which every capture shows
(`../../../defects/fixed/theme-proofs-contrast-verdict-sets-no-bound-on-the-texts-it-skips.md`). Repaired in the proof:
- The probe marks each admitted text `inSurface` when it sits inside the capture's own surface: the primary view's root
  element (`.overview`, `.workspace`, `.mission`, `.req`, `.git`, `.library`), or the Settings view's (`.settings`).
- `apps/desktop/scripts/lib/contrast-coverage.mjs` fails a capture with no measured text inside its surface, a capture
  with more than 25% of the texts inside its surface skipped, and a cell with more than 10% of every admitted text
  skipped. The skips are counted by reason (`tiny`, `animating`, `offscreen`, `sliver`), per cell and per capture.
- A text pushed wholly off the screen is not admitted at all (`visible()` needs its box on screen), so it never shows as
  a skip; the per-surface measured count is what catches it.

**Measured**, as root under Xvfb on Linux, Node 24, `--skip-build` after one `pnpm build`, with another plan's agents on
the host:
- **The full matrix with the bound: 15 of 15 PASS.** The largest share skipped in a cell was 1.42% (`rotaris-dim` at
  150 %, the status strip's `svc:` item, 5.8 CSS px on screen, in each of 15 captures, none inside a surface). The
  largest share inside one surface was 9.5% (`settings-03` at 125 % on every theme: the four rows the sixth execution
  names, cut vertically by their pane, 4 of 42). The fewest measured texts inside a surface was 7 (`view-1`, the
  Overview, in every cell). The bounds sit well above all three.
- **`--counterfactual=offscreen` (new): red.** It moves the Workspace view one window-width to the right and clips the
  pane that holds it. `rotaris-dim` at 100 % failed `contrast` on `view-2: no text inside the surface was measured (0
  discovered there, 0 skipped)`, while 1232 texts were measured, none below its floor, and no capture was incoherent:
  the verdict before this execution passes that cell. The first forms moved the view without clipping the pane; the
  pane scrolled the view back into sight to show the focused composer, and the cell passed. The clipped form is kept.
- **Again, by the builder who finished the round**, on the same build, with the other plan's agents on the host (load
  average 3.3 to 3.9): the full matrix 15 of 15 PASS, the largest share skipped in a cell 1.51% (`high-contrast` at
  175 %, 17 status-strip slivers), the largest inside one surface 9.5% (`settings-03` at 125 %, 4 of 42), the fewest
  measured inside a surface 7 (`view-1`); `--counterfactual=offscreen` exit 1 on `contrast` alone, with the same
  `view-2` failure, 1366 texts measured, none below its floor and no capture incoherent.
- **Not run here:** the `text` and `focus` counterfactuals (their code is unchanged), and Windows or macOS (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

The palette is unchanged.
