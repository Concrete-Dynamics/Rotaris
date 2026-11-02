## A compact composer strip loses its end alignment

The token estimate's `margin-inline-start: auto` is what pushes the strip's actions to its end. At the tight and narrow
densities the estimate is hidden (`display: none`), and its margin goes with it. So the steer, pause, stop and continue
actions and the send pill floated left. At 1440×900 a paused strip's continues ended at 1044 px in a strip that ends
at 1119 px.

Noticed 2026-09-27 by the second adversarial review of PD-ORCH-005 phase 5, in the built app.

## Specs

None directly. The design material draws the strip's actions at its end, and so does the full density.

## Relevant files

- `packages/ui/src/attachments.css` — `.composer__estimate`, which carries the margin.
- `packages/ui/src/shell.css` — the compact-strip rules that hide the estimate.

## Repaired — 2026-09-27

By PD-ORCH-005 phase 5's second repair. While the estimate is hidden, the control after it takes the margin
(`[data-testid='composer-estimate-strip'] + *`), so the actions stay at the end at every density.

Evidence: the built app, paused, at six window sizes from 1000×680 to 1600×1000. At each size the last action ends
8 px before the strip's edge, which is the strip's own padding. At 1440×900 that is 1111 px in a strip ending at
1119 px.
