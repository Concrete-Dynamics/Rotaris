## The identity-on-its-way-out case counts too few readings under load

`packages/agent-tools/src/terminal/terminal.test.ts`'s Linux case "OQ-144 / OQ-164: a process on its way out reads no
identity, never another program's" spawns sixty `/bin/sh` children that count to 300 and exit. It reads each one's identity
from its start to its end, and then asserts two things: that no reading named another program (`foreign` empty), and that
at least 20 of the sixty were caught running `sh` at all (`measured >= 20`). The second is the instrument's own floor:
fewer than 20 children read means the case measured too little to show the first. Under load, a child counts to 300 and
exits before the tight loop has read it as `sh`, and the floor fails although no reading was foreign.

Met on 2026-10-22 on the Linux agent host (4 CPUs, load about 4.9 from other work on the host), in a full `pnpm check` of
the R-081 dependency patch, a change that touches no `agent-tools` source: `expected 11 to be greater than or equal to 20`
at line 235, with `foreign` empty. Every other case of the file passed in that run. The file passed alone on the same
tree right after (117 passed, 18 skipped).

Not repaired: it is outside that task. The safety half held. What fails is how much the case manages to observe, so a
repair belongs to the instrument: a longer-lived child, or a floor scaled to what the host can read, rather than to the
product.

## Specs

None is contradicted. The behaviour under test, OQ-144's and OQ-164's reading that a process on its way out reads no
identity, held in the failing run.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts`: the case, and its `measured >= 20` floor.
- `packages/agent-tools/src/terminal/foreground.ts`: `processIdentity`, read by the case.
