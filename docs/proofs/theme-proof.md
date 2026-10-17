# `theme-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/theme-proof.mjs`](../../apps/desktop/scripts/theme-proof.mjs).

The themes and scales, rendered — plus two counterfactuals that must stay red; since 2026-09-30 a text's contrast is read only from the part of it left on screen by the window and by every ancestor whose `overflow` is not `visible` (scroll, `hidden` and `clip` alike), and a fragment under one em is skipped with its size (`lib/text-sample.mjs`), so a status-strip item scrolled 1.2 px onto the screen no longer decides the verdict; since 2026-10-01 the contrast verdict is bounded by what it measured (`lib/contrast-coverage.mjs`: every capture needs a measured text inside its own surface and at most 25% of that surface's texts skipped, the run at most 10% skipped, skips counted by reason), and a third counterfactual, `theme-proof:counterfactual:offscreen`, pushes the Workspace view off the screen and must stay red
