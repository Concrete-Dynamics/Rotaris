## A `:root` rule setting `caret-color` and `accent-color` stops a proof launch presenting frames

With `:root { caret-color: var(--rt-accent-300); accent-color: var(--rt-accent-500); }` in `packages/ui/src/shell.css`, a window launched by a proof script stopped presenting frames after a navigation: `pnpm driver-proof`'s "a shot straight after a navigation differs from the shot before it" read paint confirmed 0 of 7 and 2 of 7 in two runs, and 7 of 7 in the build that differed by that one rule. Every capture step that waits two animation frames before it presses (`targetProbe`) then ran up to two seconds late, which turned `settings-proof`, `sessions-proof`, `mission-proof` (a 23-agent refresh read 778.5 ms against 7.1 ms on `main`) and `resilience-proof` red at a different step in each run. A window driven by `pnpm app:drive` on the same display presented its frames with the rule in place, so the condition is the proof launch's, not every launch's.

Found 2026-11-14 on Linux (X11, Electron 45.2.1) while building [R-101](../product/requests.md#r-101), by bisecting the stylesheet against `pnpm driver-proof`. The rule is withdrawn and never reached `main`. What inside the browser links the two properties to frame presentation was not established, and which of the two it is was not separated.

## Specs

None contradicted by the product as it stands: the rule is not shipped. It is recorded because the next attempt to theme the caret or the native accent (`docs/design/README/08-8-the-2026-11-14-revision.md`, R8) meets it, and because a proof going red at a different step each run reads as a flake and is not one.

## Relevant files

- `packages/ui/src/shell.css` — the comment where the rule stood.
- `apps/desktop/src/main/capture/host.ts` — `targetProbe`, which waits two frames before it reads the point a click presses.
- `apps/desktop/scripts/driver-proof.mjs` — the navigation-and-shot check that shows the condition in 36 s.

**Added later on 2026-11-14 — the evidence is weaker than the paragraph above states.** On builds without the rule, `pnpm driver-proof`'s paint check also read 0 of 7 and 1 of 7, once each, and 7 of 7 on eight other runs of the same two builds, with no pattern found (not the first launch after a build, no stray process). So the single runs of the bisect prove less than they were taken to: a host flake of unknown cause produces the same reading. What still points at the rule is the sequence of whole runs: with it, 25 suites and then 5 suites in a row went red in this way; without it, the same suites read as on `main`. Whether the rule causes the condition or only makes it frequent is not established.
