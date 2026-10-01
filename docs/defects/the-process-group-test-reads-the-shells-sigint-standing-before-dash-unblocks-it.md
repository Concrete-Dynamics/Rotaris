## The process-group test reads the shell's SIGINT standing before dash unblocks it

`packages/platform/src/process-group.test.ts` has a case named "a `dash -c` group reads its shell catching SIGINT
under the shell's name, and its command at the default under its own". It spawns `/bin/sh -c 'sleep 30'` (`dash`).
It polls `table.group(pid)` until a member is named `sleep`, then asserts at `:103` that the shell stands at
`sigint: 'caught'`. Seeing `sleep` only shows that the command has `exec`'d. It does not show that the shell has run
since. In that interval `/proc/<pid>/status` can still show SIGINT in the shell's `SigBlk`, so the product reads
`'blocked'`. That is right for that moment, but the case fails. The likely cause is that `dash` blocks signals across
its `vfork` and restores its mask only once it is scheduled again. This is the window OQ-135 and acceptance finding A8
concern.

**What was observed on 2026-10-01** while repairing
[`the-process-group-test-compares-two-proc-reads-including-each-process-state.md`](fixed/the-process-group-test-compares-two-proc-reads-including-each-process-state.md):
- **Under load.** Beside twelve CPU-bound `node` loops (load average about 21 on 4 CPUs), 24 runs of the case
  (`pnpm vitest run … -t "dash -c"`) failed twice at `:103`, with `"sigint": "blocked"` received for `"caught"`.
- **A probe on the host as it was.** A scratch probe repeated the case's steps 100 times and found the shell
  `'blocked'` at that read 14 times. Every pair of reads that differed went from `'blocked'` at the group read to
  `'caught'` at the walk that follows, never the other way.
- **Alone.** The file passed 6 of 6.

Found while doing other work. Recorded, not repaired.

A faithful repair keeps what `:103` means: once the shell is past starting its command, it catches SIGINT. It should
wait for that standing as it already waits for the command's name, for example by polling until the shell is no
longer `'blocked'`, within the same bound. It should not accept `'blocked'` as an answer, and it should not drop the
assertion.

## Specs

The product is right on every count; no specification is contradicted. The case pins the process-group reading that
the terminal's signal delivery stands on: REQ-TOOLS-110, REQ-TOOLS-128, and OQ-135 with acceptance finding A8,
round 3. The case expects a steady state at an instant that does not guarantee one.

## Relevant files

- `packages/platform/src/process-group.test.ts:98-103`: the poll that waits only for the command's name, and the
  shell's assertion at `:103`.
- `packages/platform/src/process-group.ts`: `sigintStanding`, which reads `'blocked'` first when `SigBlk` holds
  SIGINT, and `GroupMember.sigint`.
- `docs/architecture/open-questions.md`, OQ-135: the `dash` `vfork` window.
