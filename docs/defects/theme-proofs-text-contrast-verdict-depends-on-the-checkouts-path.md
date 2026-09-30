## `theme-proof`'s text-contrast verdict at 150 % depends on the checkout's path, not on the palette

`pnpm theme-proof --skip-build --theme=rotaris-dim --scale=1.5` fails its contrast section in one worktree and passes in
another on the same product. The failing string is the status strip's `applied 0 · reset 0 · refused 0` item, drawn in
`oklch(0.68 0 0)` at 11 px and elided to a 48 px box, measured at **3.05:1** against the 4.5:1 floor. The status strip also
carries the workspace's `svc:` path. That path is the proof's own scratch directory, so its length moves every item after it:
the item sits at x = 1064.8 in `/home/user/Rotaris-crw-wt-compgrnd` and at x = 1025.2 in
`/home/user/Rotaris-crw-wt-compgrnd-base`. `pixels.cjs`'s `textContrast` takes the single pixel farthest from the box's modal
colour as the foreground. At a fractional device-pixel ratio, where a thin glyph stroke lands on the pixel grid decides
whether any pixel reaches the text's own colour, so one phase passes and the other reads a third of the way short.

Measured 2026-09-29 as root under Xvfb on Linux, Node 24, with other workflows' Electron proofs on the host:
- origin/main `e4aac2b`, built in `…-wt-compgrnd-base`: **PASS** (minimum 3.71:1, no failure).
- The branch `fix-composer-ground`: **FAIL**, and it still fails with its one product change (`highlight.ts`) reverted and
  the app rebuilt. The slash colours are painted only while a slash command is typed, and this proof types none.
- The full matrix on the branch: `rotaris-dim` fails at 1.5 (the item above) and at 1.75 (the `svc:` path itself, 4.20:1).
  Every other theme and scale passes.

Recorded, not repaired: noticed while running `theme-proof` for the slash-colour repair (R-067). There are two possible
fixes, and the proof's owner should choose: the proof pins its scratch path's length (or measures the strip with a fixed
path), or `textContrast` reads a glyph's colour so that it does not depend on the subpixel phase. OQ-56's
`--rt-text-disabled` reds are a separate matter, measured on disabled controls.

## Specs

None contradicted by the product. The flaw is in the proof: REQ-SHELL-145 and REQ-SHELL-160 (a) are measured from rendered
pixels, and here the verdict turns on the checkout's directory name.

## Relevant files

- `apps/desktop/scripts/pixels.cjs`: `textContrast`, which takes the farthest pixel from the modal colour.
- `apps/desktop/scripts/theme-proof.mjs`: the scratch workspace under the evidence directory, whose path the status strip shows.
- `apps/desktop/src/renderer/main.tsx`: where the status strip's `svc:` item and its `applied · reset · refused` counters are composed.
