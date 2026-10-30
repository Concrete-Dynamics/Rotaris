## resilience-proof's child-timeout-inspector scenario is red

`pnpm resilience-proof` fails this one scenario on the Linux agent host, with a different message each run: on `3ed01f9f` "the child did
not succeed on the fallback under its configured key" (58 s), on a branch that does not touch this path "the inspector measured the child
on alpha against null, not alpha's 100,000". Measured 2026-10-30. The two messages suggest timing, but the cause was not established.

## Specs

None established. The scenario reads the inspector's context limit for a child after its fallback.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs`: `child-timeout-inspector`
