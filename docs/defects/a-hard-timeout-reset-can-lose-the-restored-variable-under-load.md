## A hard-timeout reset can lose the restored variable under load

After REQ-TOOLS-097's hard timeout resets the shell, `PD-TOOLS-001` re-applies the environment snapshot, and the test
then reads back a variable set before the timeout. Once, in a full `pnpm test` run of a branch that touches no terminal
code (the `PD-ORCH-005` phase 4 merge gate, 2026-09-27), the read came back empty (`[]` where `[set]` was expected) even
though the command named its own 15 s timeout, which the test's comment says takes the no-output window out of the
question. The same file passed three times in a row on its own. Either the restore is not complete when the next
command runs, or the read reaches a shell other than the restored one; neither is established. Noticed while gating
other work; not root-caused.

## Specs

`PD-TOOLS-001` (the reset re-applies the snapshot) and `REQ-TOOLS-099` (what a reset loses). A reset that reports
"were restored" and then answers without the restored variable contradicts the directive, if it is the product's; if it
is the test's timing, the defect is the test's.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — "REQ-TOOLS-097/099: the hard timeout kills the tree, restarts
  the session, reports 124 and session_reset; shell state is gone" (the `[set]` read).
- `packages/agent-tools/src/terminal/` — the reset, the respawn and the snapshot's re-application.
