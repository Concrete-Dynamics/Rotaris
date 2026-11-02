## The process-group test reads the shell's SIGINT standing before dash unblocks it

`packages/platform/src/process-group.test.ts` has a case named "a `dash -c` group reads its shell catching SIGINT
under the shell's name, and its command at the default under its own". It spawns `/bin/sh -c 'sleep 30'` (`dash`).
It polls `table.group(pid)` until a member is named `sleep`, then asserts at `:103` that the shell stands at
`sigint: 'caught'`. Seeing `sleep` only shows that the command has `exec`'d. It does not show that the shell has run
since. In that interval `/proc/<pid>/status` can still show SIGINT in the shell's `SigBlk`, so the product reads
`'blocked'`. That is right for that moment, but the case fails. The likely cause is that `dash` blocks signals across
its `vfork` and restores its mask only once it is scheduled again. This window is adjacent to the one OQ-135 and
acceptance finding A8 concern: theirs runs from `dash`'s `vfork` to the command's `exec`, and this one from that `exec`
until `dash` next runs.

**What was observed on 2026-10-01** while repairing
[`the-process-group-test-compares-two-proc-reads-including-each-process-state.md`](the-process-group-test-compares-two-proc-reads-including-each-process-state.md):
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

- `packages/platform/src/process-group.test.ts:98-103` as recorded (`:98-109` after the repair): the poll that waited
  only for the command's name, and the shell's assertion at `:103` (`:109` after the repair).
- `packages/platform/src/process-group.ts`: `sigintStanding`, which reads `'blocked'` first when `SigBlk` holds
  SIGINT, and `GroupMember.sigint`.
- `docs/architecture/open-questions.md`, OQ-135: the `dash` `vfork` window.

## Repaired 2026-10-01

Repaired 2026-10-01 on `fin2-load-robust-tests`, in the repair round of the branch that recorded it. The case now waits
for the shell's standing as it already waited for the command's name. It polls `table.group(pid)` until a member is
named `sleep` **and** the leader no longer reads `'blocked'`, within the same bound of 200 polls 10 ms apart. The wait
never takes `'blocked'` as the answer. The assertion is unchanged: the shell must read `sigint: 'caught'` (now at
`:109`). No product code changed.

**What showed the repair works.**
- **A probe of both waits.** A scratch test repeated the case's steps 100 times with each wait, alternating, and read
  the shell's standing when the wait ended. On the host as it was (load average 13 to 15 from other agents), the old
  wait ended with the shell `'blocked'` 11 times in 100, and the new wait 0 times in 100, with no timeout. Beside twelve
  CPU-bound `node` loops (load average 13 to 16), the old wait ended `'blocked'` 2 times in 100, and the new wait 0
  times in 100.
- **A transient `'blocked'` on both forms.** A scratch copy wrapped the table so the leader reads `'blocked'` until its
  real standing is `'caught'` and three group reads have passed. The old form failed at `:103` with `"sigint":
  "blocked"`. The new form passed.
- **It still fails when the shell does not catch SIGINT.** Two more scratch copies pinned the leader's standing in
  every read. Pinned to `'default'`, the case failed at the shell's assertion with `"sigint": "default"`. Pinned to a
  permanent `'blocked'`, the wait ran out its 200 polls (2.58 s) and the case failed at the same assertion with
  `"sigint": "blocked"`.

All scratch copies and the probe were removed.

**Pinned by** the case itself. It passed the file alone, 6 of 6 (`pnpm vitest run
packages/platform/src/process-group.test.ts`). Beside twelve CPU-bound loops (load average rising from 7.6 to 20.3),
`pnpm vitest run … -t "dash -c"` ran 20 times on the new form and 20 times on the old, alternating. The new form
passed all 20. The old form also passed all 20 in that run, so those 40 runs alone do not tell the forms apart; the
probe above does.
