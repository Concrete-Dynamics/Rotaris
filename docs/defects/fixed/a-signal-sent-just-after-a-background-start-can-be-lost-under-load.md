## A signal sent just after a background start can be lost under load

`send_signal SIGINT` sent to a background session immediately after it started reported "Sent SIGINT to session …",
yet the session stayed `running` for the whole 20 s the test polls. It happened once, in a full `pnpm test` run of a
branch that touches no terminal code (the `PD-ORCH-005` phase 3 gate, 2026-09-27); the same file then passed three
times in a row on its own. The likeliest reading, not established, is a race: under load the signal reaches the
session before its shell has started the command, and nothing re-delivers it. Noticed while gating other work; not
root-caused.

It recurred on 2026-09-28 in at least three full gate runs of the merged revision 4 build of `PD-ORCH-005` (R-065),
which changed nothing under `packages/agent-tools`, listed each time as a new failure against the baseline: "Sent
SIGINT" was reported and the session list still showed it `▶ … running` twenty seconds later. The test passed alone
and its file passed 33 of 33. Still not reproduced in isolation and not repaired.

On 2026-09-29 it failed in the gate of the live-run branch (R-066), which also changes nothing under
`packages/agent-tools`, and then once in three runs of its file alone — the first failure in isolation. The race
reading was tested outside the product and did not hold: `bash -c 'sleep 30'` spawned detached, as `spawnChild` spawns
a background session, and sent SIGINT to its process group at once, ended 200 times out of 200, and 200 of 200 again with
the signal 50 ms later. Whatever keeps the session running lies in what the product does around the spawn or the
signal, not in the shell's startup. Not repaired.

*Corrected 2026-09-29 (see the outcome below): that reproduction did not run the product's shell. `findShell` starts
`/bin/sh`, which is `dash` on this host, and `bash` does not have the window `dash` has. With `/bin/sh` the same
reproduction loses the signal, and the race reading holds, refined: the window is `dash` launching the command, not
the shell's start-up as such.*

## Specs

`OQ-10` as ruled by `R-044` — `send_signal SIGINT` stops a background session instead of refusing it. A signal that is
reported sent and does not stop the session contradicts it, if the race reading holds; if it does not, the defect is
the test's timing.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — "OQ-10 (R-044): send_signal SIGINT stops a background
  session instead of refusing it", which starts `sleep 30` and signals it at once.
- `packages/agent-tools/src/terminal/` — the background session and its `send_signal` path.

## Outcome — 2026-09-29 under R-067: the test flake repaired, the product's exposure recorded open

**Diagnosis: `dash` discards a SIGINT that reaches a command between its `vfork` and its `exec`.** Measured outside the
product, spawning as `spawnChild` does (`detached`, piped stdio) and sending SIGINT to the group at once, counting the
sessions still alive 3 s later, Node 24 on the 4-CPU container:

| shell and command | host | SIGINT sent | alive after 3 s |
|---|---|---|---|
| `/bin/sh -c 'sleep 30'` (`dash` 0.5.12-6ubuntu5) | idle | at once | 1 of 100 |
| the same | six CPU burners | at once | 38 of 200; 12 of 150 |
| `/bin/sh -c ':; sleep 30'`, `/bin/sh -c 'sleep 30; :'` | six CPU burners | at once | 14 of 150; 8 of 150 |
| `/bin/sh -c 'sleep 30'` | six CPU burners | after 50 ms; after 300 ms | 0 of 150; 0 of 150 |
| `/bin/sh -c 'exec sleep 30'` | six CPU burners | at once | 0 of 150 |
| `/bin/bash -c 'sleep 30'` | idle; six CPU burners | at once | 0 of 100; 0 of 150 |

Every survivor was the same pair: the shell leading its group and catching SIGINT (`SigCgt` 0x10002), and `sleep`, its
child, at SIGINT's default. Neither process had SIGINT blocked, ignored or pending. With `sleep 4`, 29 of 120 sessions
under load ended by SIGINT only after the command's 4 s, and the other 91 ended at once. `dash`'s public source
(0.5.12, `trap.c` and `jobs.c`) accounts for all of it:
- given `-c`, `dash` catches SIGINT;
- this build forks even a lone last command, and it forks with `vfork`;
- until the child `exec`s, the child runs `dash`'s handler, which returns at once in a `vfork`ed child
  (`if (vforked) return;`).

So a SIGINT that reaches the group in that instant is discarded by the command about to start. The parent shell keeps
its own copy, holds it while it waits for the command in the foreground, and acts on it when the command ends. The
session therefore ran on until its command ended, and `sleep 30` outlived the test's 20 s poll. `bash` does not run its
handler in that window, and `exec` takes the fork away, which is why neither loses the signal.

**Every recurrence ran the case in its old form.** The case once sent SIGINT the instant `start` returned, to `sleep 30`.
Commit `9fc2fdc` made it wait until the command is observably running and made the command `exec sleep`; that commit
repaired [`the-sigint-background-session-test-fails-under-full-suite-load`](the-sigint-background-session-test-fails-under-full-suite-load.md).
The three recurrences above were all on the `PD-ORCH-005` line, which did not hold `9fc2fdc` until its merge `b80e8de`:
the phase 3 gate of 2026-09-27, the revision 4 gates of 2026-09-28, and the live-run branch's gate and isolated run of
2026-09-29.

**Only the test flake is repaired: the case's own timing, already landed, with no product change.** `send_signal`
delivers the signal to every process of the session's group, as REQ-TOOLS-110 says, and reports that it did. The case's
comment now names this mechanism in place of "a SIGINT-masked window", and the sibling note is corrected in place.

**The product's exposure is not repaired, and is recorded open.** A `send_signal SIGINT` or an interrupt that lands on
a command between `dash`'s `vfork` and its `exec` is reported sent, and the session runs on until that command ends:
for a server, indefinitely. By this note's own Specs criterion that contradicts OQ-10 as ruled by R-044, now that the
race reading holds. The window is microseconds on an idle host and wider under load, and it reopens at every command a
script starts. It is recorded in
[`a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session`](../a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md).
Whether the product owes more than the delivery (re-delivery, `exec`, another shell) is
[OQ-135](../../architecture/open-questions.md).

*Corrected 2026-09-29 in the branch's verification round: this section first read "Repair: the case's own timing,
already landed, with no product change", and called the exposure "the shell's" with no open record of it. That moved
the note to `fixed/` while the product still lost the signal it describes.*

**Pinned by** `terminal.test.ts`, "OQ-10 (R-044): send_signal SIGINT stops a background session instead of refusing it".
It passed in every loaded repeat of the whole file: 25 of 25 runs under six CPU burners, and 20 of 20 under eight
with this round's two signal cases beside it (`pnpm vitest run packages/agent-tools/src/terminal/terminal.test.ts`,
Node 24). Its old form lost the signal in the reproduction above. The test flake was repaired 2026-09-29 under R-067; the
product's exposure stays open, as above.
