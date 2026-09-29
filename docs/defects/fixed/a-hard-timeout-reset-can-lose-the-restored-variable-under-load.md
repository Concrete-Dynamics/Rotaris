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

## Repaired — 2026-09-29 under R-067

**Diagnosis: the variable's own call soft-paused, so no snapshot held it.** Both readings above are falsified. The
restore did complete before the next command, since `execute` awaits it. The read also reached the restored shell.
What was restored was an **older** snapshot, and the chain that produced it runs through the case before this one:
- The OQ-38 case before this one leaves `sleep 3; …` running soft-paused in the file's shared session.
- This case's first call, `export ROTARIS_GONE='set'`, named no timeout. It queued behind that `sleep` for its last
  ~1.45 s against REQ-TOOLS-098's 1.5 s no-output window, with nothing printed in between.
- Instrumented over 20 runs of the file under eight CPU burners, the whole call, its snapshot included, took 1,486 to
  1,707 ms. It won the race each time, by tens of milliseconds.
- Under a heavier load it lost: the call soft-paused. PD-TOOLS-001's snapshot is taken only after a command the
  product *sees* complete ([ADR-0020](../../architecture/adr/0020-terminal-execution.md)'s third first execution),
  and this completion was never seen. The next call's marker was the one being scanned for.
- The timed-out `sleep 20` then reset the shell and re-applied the snapshot of an earlier case's command. That
  snapshot was without the variable, and the detail still said "were restored". So `[]`.

Reproduced deterministically by widening the leftover to `sleep 5`: the old form of the case then fails with this
note's exact assertion, `expected '[]' to be '[set]'`, in 2,538 ms (2,553 ms in the recorded failure), and the new form
passes.

**Repair: the case, and a question for the rest.** The variable's call now names its own timeout, as the file's other
calls that read a shell do, so it cannot soft-pause and is seen to complete. The case also asserts that the call
succeeded, so a future coupling fails on its cause and not three steps later. The product's part is a reading
PD-TOOLS-001 does not settle. "Snapshot … before the respawn" cannot be taken from a wedged shell. The build takes the
snapshot after each command it sees complete, so a soft-paused command that finishes unseen is not in it. That is
raised as [OQ-133](../../architecture/open-questions.md), with the reading pinned by a new case, not changed here.

**Pinned by** `terminal.test.ts`:
- "REQ-TOOLS-097/099: the hard timeout kills the tree, …": red in its old form under the widened leftover, as above.
  In its new form it was green in 20 of 20 loaded runs of the file (`pnpm vitest run
  packages/agent-tools/src/terminal/terminal.test.ts`, eight CPU burners, Node 24).
- "PD-TOOLS-001 (OQ-133): a reset restores the snapshot of the last command the product saw complete, …": the
  flake's mechanism in a session of its own, with a margin of seconds rather than milliseconds, beside the same
  sequence with a timeout that restores the variable.

Repaired 2026-09-29 under R-067.
