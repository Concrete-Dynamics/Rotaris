## terminal-proof's gutter colour reads off at 150% display scale

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Electron 44.1.1 arm64, dev tree, display scale 150% (the window
reports a device pixel ratio of 1.5), at `9f4b144b` (the Windows ARM64 session's B9), four runs alike:
`theme.gutterPaintedWithTermBg` sampled `#020202` where `--rt-term-bg` is `#000000` (CSS `oklch(0.05 0 0)`), and
`theme.gutterPaintedWithTermBgDim` sampled `#181818` where the dim theme's token is `#0d0d0d`. The Linux runs on record are
at a ratio of 1.0.

Whether the sample lands on a pixel the 1.5 ratio blends with the grid's or the border's colour (the harness), or the gutter
is painted with another colour at this ratio (the product), is not separated here: changing the display scale is the owner's
setting, and no 100% run was taken.

Not repaired (record-only).

## Specs

The adopted design language's terminal tokens (`--rt-term-bg`) as `terminal-proof` reads them; ADR-0047.

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs` — the gutter sample (`theme.gutterPaintedWithTermBg*`).
- `packages/ui/src/terminal/` — the grid and its gutter.
