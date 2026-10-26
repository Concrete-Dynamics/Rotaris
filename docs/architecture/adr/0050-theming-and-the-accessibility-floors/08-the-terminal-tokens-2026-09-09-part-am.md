# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — The terminal tokens — 2026-09-09 (Part AM)

Part 8 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## The terminal tokens — 2026-09-09 (Part AM)

`REQ-SHELL-098` makes the sixteen ANSI colours theme tokens, and ADR-0047's first execution added them to every
palette as **additions only**: `--rt-term-bg`, `--rt-term-fg`, `--rt-term-cursor`, `--rt-term-selection` and
`--rt-term-{black..white}` / `--rt-term-bright-{black..white}`, twenty per theme, each a direct OKLCH value on the
language's own hues (red on danger 25, green on axis Y 165, yellow on axis X 86, blue and magenta either side of the
accent's 292, cyan on info 210). No adopted key moved; the zero-drift guard in `contracts.test.ts` is unaffected.

**A static check joins the others** in `static-contrast.ts`: every terminal ink clears 4.5:1 on `--rt-term-bg`, black
clears 3:1 (it is a grey, never the ground, and is used as a foreground only over a coloured cell), the cursor
clears 3:1. `assertThemeContrast` runs it for all three palettes; the lowest measured ratio is black at 3.13:1 on
Nocturne's ground.

**The grid resolves tokens at run time**, because the emulator library takes colour strings it can parse and the
tokens are OKLCH text on the document root: `ui/src/terminal/colours.ts` reads the computed custom property and
converts through this package's own colour mathematics (`parseOklch` → `oklchToSrgb` → hex, alpha appended), and
re-resolves on every theme change. No literal colour appears in the grid; `tools/check-theme-colours.mjs` still fails
the lint on one — it caught the proof harness's own window background on the first full check, which was removed.

The rendered-pixel pass this record requires is extended, not replaced: `pnpm terminal-proof` samples the grid's
gutter after a theme switch and compares it to the resolved `--rt-term-bg`. `pnpm theme-proof` was run with the
tokens in place and is red for reasons that predate them — the same run against `main` at `9febbb3` fails the same
items (Workspace view-2 contrast, focus) — which is stated in Part AM's handoff rather than absorbed here.
