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

## Repaired — 2026-09-28 under R-062

**Diagnosis.** Neither of the note's two hypotheses — a teardown slower than the 20 s poll, or the `list`
dropping the session — is the cause. Under a reproduction (200–500 spawns under six CPU burners and a concurrent
full suite) the signal was reported sent in **every** run, yet ~11 % of freshly-spawned sessions kept running to
the 25 s cap with the shell (`Ss`, its own group leader) and its `sleep` child both alive at the two-second
mark. The cause is a **fork/exec/setsid establishment race**: the test sent SIGINT the instant `start` returned,
before the child had finished becoming the leader of its own group and `exec`ing the command, so the signal
landed on a process still in the shell's brief SIGINT-masked start-up window (an ignored disposition survives
`execve`, so `dash` and its child could then run on) and was absorbed. Once the command is observably running,
SIGINT to the group is reliable — 0 survivors in 500 under the same load.

**Fix (test only; the product's delivery was never at fault — it reported the signal sent every time).** The
case now (1) runs a command that prints a marker and then *becomes* the long-lived process (`printf 'up\n';
exec sleep 30` on POSIX, so the group's one process is `sleep` at SIGINT's default disposition with no shell left
to absorb it; Windows needs no `exec`, as OQ-10 there terminates the tree rather than delivering a signal),
(2) polls `query` until that marker reaches the buffer — the session is then observably running its command —
before sending SIGINT, and (3) bounds both polls by a deadline read from the clock port rather than a fixed
iteration count. Verified: the case run 30× back-to-back under six CPU burners and a concurrent full suite, all
green, and the whole `terminal.test.ts` file green five times alone.

Pinned by `packages/agent-tools/src/terminal/terminal.test.ts` ("OQ-10 (R-044): send_signal SIGINT stops a
background session instead of refusing it"). REQ-TOOLS-110 / OQ-10 unchanged in what it decides.
