## resilience-proof's child-timeout-inspector scenario is red

`pnpm resilience-proof` fails this one scenario on the Linux agent host. With `--only=child-timeout-inspector` it read "the inspector
measured the child on alpha against null, not alpha's 100,000" twice on `3ed01f9f` and once on a branch that does not touch this path.
One whole-suite run on `3ed01f9f` failed the scenario earlier, "the child did not succeed on the fallback under its configured key".
Measured 2026-10-30; the cause was not established.

## Specs

None established. The scenario reads the inspector's context limit for a child after its fallback.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs`: `child-timeout-inspector`
