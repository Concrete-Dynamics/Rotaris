## The SIGINT background-session test fails under full-suite load

`packages/agent-tools/src/terminal/terminal.test.ts`, "OQ-10 (R-044): send_signal SIGINT stops a background
session instead of refusing it", failed once in a full `pnpm check` on a 4-vCPU Linux container (Node 22, root),
on the tree that merged the first-release step-2 work into `main` (2026-09-27). The signal was reported as sent. The
session list the test polls (80 × 250 ms) then showed another session, `✓ ts_… completed`, and never showed the
signalled session as `✗` before the assertion: `expected '✓ ts_b9b5ee6d  completed  0  …' to contain '✗ ts_f4c74c26'`.
Run alone, the same case passed three times out of three on the same tree, and `packages/agent-tools/src/terminal/`
there is byte-identical to `main`'s. So the reading is that the case depends on timing and full-suite load makes it
miss. The cause is not diagnosed: whether the tree takes longer than 20 s to end under load, or the list drops the
session, is open. Noticed while merging; not repaired.

## Specs

None contradicted as observed: `REQ-TOOLS-099`/OQ-10's ruling (SIGINT on a win32 pipe or background session ends
the tree) held whenever the case ran alone. The note is about the test's reliability, which `pnpm check` depends on.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts`: the case and its 20 s polling loop.
- `packages/agent-tools/src/terminal/`: the background-session manager whose `list` it polls.
