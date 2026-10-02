## The slash token's colours clear 4.5:1 on `--rt-bg`, but the composer paints them on `--rt-surface`

REQ-CHAT-027's four colours are derived by `slashRoleColours` (`packages/ui/src/slash/highlight.ts`) against a surface
it takes to be the composer input's own ground — `--rt-bg` by default, "the design's `.input` paints on `--rt-bg`" —
and `WorkspaceView.tsx` calls it with that default. Since the composer dock landed on 2026-09-18 (`9b7d3cb`, the
compact strip), the input inside `.composer__dock` is transparent (`shell.css`: `.composer__dock .composer__input
{ background: transparent }`) and the ground the token is drawn on is the dock's `--rt-surface`, which is lighter than
`--rt-bg` in every dark palette. Each colour was corrected to clear the floor on a ground it is not painted on, and on
the ground it is painted on two of them do not.

Measured 2026-09-28 in the built product, as root under Xvfb on Linux, Node 24, by `pnpm slash-proof --skip-build`
once its reader was repaired (below), reading the painted ground as the first ancestor of `.composer__input` that paints
an opaque background (`.composer__dock` in every case). The proof stops at the first; a diagnostic run of the same
script with every check made non-fatal (not committed) measured all of them:

| palette | `--rt-bg` | ground painted (`--rt-surface`) | partial | unknown | resolved | argument |
|---|---|---|---|---|---|---|
| `rotaris-dim` | `oklch(21% 0 0)` | `oklch(0.25 0 0)` | **4.06:1** | **4.32:1** | 9.21:1 | 8.56:1 |
| `nocturne` | `oklch(14% 0 0)` | `oklch(0.18 0 0)` | **4.25:1** | 9.94:1 | 10.82:1 | 11.14:1 |
| `high-contrast` | `oklch(8% 0 0)` | `oklch(0.12 0 0)` | **4.39:1** | 13.91:1 | 15.07:1 | 16.02:1 |

The partial shade on `rotaris-dim`, `oklch(0.60404 0.05 292)`, is exactly 4.50:1 against `oklch(0.21 0 0)` — the
correction worked, against the wrong ground. The proof's palette launch also fails its "the composer's painted ground
is that palette's `--rt-bg`" check on all three palettes, which is the same fact read from the other side.

Until the proof's reader was repaired, this was invisible: the proof read the input's own `backgroundColor`, which has
been `rgba(0, 0, 0, 0)` since the dock, and its contrast arithmetic took the transparent value's channels as black, so
the catalogue launch "passed" REQ-CHAT-027's floor against a ground nobody sees — and the stuck eval at 5,900 ms
([fixed](fixed/slash-proofs-model-chip-eval-shares-its-offset-with-the-usage-notice-read.md)) kept the palette launch
from running at all.

Recorded, not repaired: the product's, noticed while repairing `slash-proof` under R-062. Which side moves — the
derivation to the dock's `--rt-surface`, or the input back onto `--rt-bg` — is the repair's to choose; the proof's
palette assertion encodes the product's stated premise (`--rt-bg`) and moves with the derivation if that is the choice.

## Specs

REQ-CHAT-027: "Every one of the four MUST then be lightened or darkened until it reaches a contrast ratio of at least
**4.5:1** against the surface it is painted on." The partial shade misses it on all three built-in palettes and the
unknown colour on `rotaris-dim`.

## Relevant files

- `packages/ui/src/slash/highlight.ts`: `slashRoleColours(theme, surfaceKey = '--rt-bg')` and its doc comment's premise.
- `packages/ui/src/WorkspaceView.tsx`: the call, with the default surface.
- `packages/ui/src/shell.css`: `.composer__dock` (`--rt-surface`) and `.composer__dock .composer__input` (transparent).
- `packages/ui/src/slash/slash.test.ts`: pins the colours against the theme's `--rt-bg`, so it stays green.
- `apps/desktop/scripts/slash-proof.mjs`: `GROUND`, the catalogue launch's ratios, the palette launch's ground check.
