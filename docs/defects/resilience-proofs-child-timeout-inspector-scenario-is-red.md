## resilience-proof's child-timeout-inspector scenario is red

`pnpm resilience-proof` fails this one scenario on the Linux agent host. With `--only=child-timeout-inspector` it read "the inspector
measured the child on alpha against null, not alpha's 100,000" twice on `3ed01f9f` and once on a branch that does not touch this path.
One whole-suite run on `3ed01f9f` failed the scenario earlier, "the child did not succeed on the fallback under its configured key".
Measured 2026-10-30; the cause was not established.

## Specs

None established. The scenario reads the inspector's context limit for a child after its fallback.

Seen again on 2026-11-04 at the landing of R-091 bundle D3 (fence-hardening), rebased head `aacd3806`, Windows 11 ARM64, Node 26.13.0, the desktop free of other trees: red again, in the sweep and alone at 16 % CPU (the same sighting is in `windows-proof-reruns-leave-persona-and-recovery-readings-red.md`). Recorded, not repaired.

Seen again on 2026-11-04 (hrda), Windows 11 ARM64, Node 26.13.0, `C:/dev/Rotaris-wt-hrda-corruptstore` (bundle hrda-corrupt-store-resolution, OQ-477) on `origin/main` `3bf27f00` plus its commits; one proof at a time after `pnpm build`, no other tree's Electron running, host CPU about 54 % at launch: red, "the inspector measured the child on alpha against null, not alpha's 100,000" (the sighting is also in `windows-proof-reruns-leave-persona-and-recovery-readings-red.md`). Recorded, not repaired.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs`: `child-timeout-inspector`
