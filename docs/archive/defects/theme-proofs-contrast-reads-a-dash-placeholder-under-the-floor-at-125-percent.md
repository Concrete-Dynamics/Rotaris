## theme-proof's contrast reads a dash placeholder under the floor at 125 %

## Outcome: repaired 2026-11-21 (R-119's branch, `feat/r-117-web-search-setup`)

The harness, not the product. `pnpm theme-proof` failed `rotaris-dim @ 1.25` and `nocturne @ 1.25` on contrast, on
`main` and branches alike (recorded in passing in
[the settings proofs' repoint note](../../defects/the-settings-proofs-were-repointed-to-the-pages-by-reading-and-not-run.md)).
The failing texts were the "—" placeholders of the Personas table's Tools column, drawn in `--rt-text-secondary`, which
computes to 9.5:1 (rotaris-dim) and 11.8:1 (nocturne) against its surface. `pixels.cjs`'s `textContrast` takes the single
pixel farthest from the background as the text's colour; a dash's one stroke is about a device pixel thick, and at 125 % it
straddles two rows, so no pixel reaches the colour (3.75:1 read where 100 % and 150 % read 9.47:1).

A text drawn only of horizontal rules is now read by `ruleContrast`: two vertically adjacent pixels' summed excess over
the painted background, never farther than the computed colour, so a dim colour or the wrong surface still fails
(`lib/text-sample.test.ts` holds all three). `pnpm theme-proof` green alone on this host, 2026-11-21; run beside
workspace-proof the same day it read the focus rings red, the load-dependent verdict
[recorded on its own](../../defects/theme-proofs-focus-verdict-reads-no-ring-on-the-rail-in-one-run-and-a-ring-in-the-next.md).

## Specs

REQ-SHELL-145 and REQ-SHELL-160 (a), which the product meets.

## Relevant files

- `apps/desktop/scripts/pixels.cjs`: `textContrast`, `ruleContrast`, `cssColour`.
- `apps/desktop/scripts/theme-proof.mjs`: `RULES_ONLY` and the contrast reading.
- `packages/ui/src/settings/ConfigSettings.tsx`: the Tools column's placeholder.
