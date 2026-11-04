## The PTY process-death assertions flake on a loaded host

On 2026-10-23 the gate job on one commit both passed and failed. PR #12's head commit (`38882812`, "notices: drop the
two certifi exceptions no lock can select") changes `tools/notices/reviewed-exceptions.json` and one line of an
existing defect note — nothing that is compiled or run by a terminal test — and the same commit gave:

| Run | Attempt | Result | Red |
| --- | --- | --- | --- |
| `39985772952` (gate) | 1 | pass | — |
| `39985748563` | 1 | fail | `terminal-shapes.test.ts` and a PowerShell case in `terminal.test.ts` (the leg names no line) |
| `39985748563` | 2 | fail | `terminal.test.ts:1750`, `[false, true]` where the test expects `[false, false]` |
| `39985748563` | 3 | pass | — |

The gate job runs on a Windows runner. All three reds are checks that a process has died:

- `packages/agent-tools/src/terminal/terminal.test.ts:1750`, in the case at 1734, "the window's kill of a running
  command ends it and its grandchild, asks node-pty for no signal, and the next call is in a fresh shell". Two
  seconds after the kill, `expect(pids.map(tasklistHas)).toEqual([false, false])` read `[false, true]`. The
  command's own pid was gone from `tasklist`; its grandchild's was not. `tasklistHas` (line 1668) runs `tasklist`
  with a PID filter and answers whether its output contains the pid.
- The `goneWithin(pids, 5_000)` assertions of the soft-paused kill suite (`describe` at 1161, tagged
  `REQ-SHELL-092, REQ-TOOLS-098`), at lines 1195, 1228, 1241 and 1267. `goneWithin` (1166) polls `alive` every
  200 ms until every pid is gone or the 5 s is up, then returns the map it compares to `[false, false]`. `alive`
  reads `tasklist` on Windows and `process.kill(pid, 0)` elsewhere. A run leg was also reported at line ~2013;
  this tree does not place a `goneWithin` call there, so that site is taken from the log and not read here.
- `apps/desktop/scripts/lib/terminal-shapes.test.ts:237`, the case "prints run 2e21e324's docker line in lower
  case and exits 0, run for real": a real `spawnSync` of the
  `failed-word` shape's command (PowerShell on Windows, `sh -c` elsewhere) with a 60 s timeout, asserting
  `status === 0` and that stdout trims to `failed to connect to the docker API`. This one waits on a child
  process, not on a PTY session's tree.

Many `Error: AttachConsole failed` lines precede these failures in the log. node-pty's
`conpty_console_list_agent.js` prints them, and green runs on the Windows host
[the Vitest worker note](a-vitest-fork-worker-exits-unexpectedly-during-the-gate-and-its-test-file-goes-unreported.md)
measured print them too, so their presence alone is not the cause and whether they mark the same moment is not
established.

**Why this is not PR #12.** The failing runs and the passing gate attempt ran the same commit, with no change between
them; attempt 3 of the same run passed. Nothing in the diff is loaded by these tests. And the same assertions fail on
trees that do not contain the change: on the NUC (Linux), at `a99bd2a9` and `2bb0e577` — before the merge
`47ec9f2e` — five cases in `terminal.test.ts` failed, and repeating a case on its own did not turn it green. On that
host the red therefore repeats rather than flaking away on a retry: host and load dependence, not the code under
review either way.

**What it costs.** This repository treats the gate as evidence, so a gate that goes red twice and green once on one
commit spends a rerun on ordinary landings, can hold a release behind a failure that says nothing about the change,
and weakens the green even when it comes: a pass on the third attempt is not the pass a first attempt gives.

**What is open.** Whether a grandchild genuinely outlives the window's kill on Windows — which would be a product
fault — or the assertion reads before the host has finished terminating the tree, this note does not decide. The
`[false, true]` alone cannot tell those apart, and neither the shapes case's own reading nor the PowerShell case
attempt 1 failed is in this note's evidence. The assertions were not reproduced here and nothing was repaired;
the note records the runs above.

**A repair to consider, not a decided one.** The repository already carries the shape that answers half of this.
`apps/desktop/scripts/lib/bounded-launch.test.ts:52` reads `/proc/<pid>/stat` so that a process that has exited but
is not yet reaped counts as gone, with the measurement recorded there that `kill(pid, 0)` still finds a zombie and
that only PID 1 reaping took 1.7 to 1.8 s after a dead proof's launch, later under load; its bound is 15 s, and its
comment says the bound asks *that* the process dies, not how fast a loaded host gets round to it. The terminal tests'
own `alive` does not read `/proc`, so on Linux a zombie is read as alive for as long as it is unreaped — which fits
that host's repeated red and has not been measured for these cases. Porting that `alive`, giving the death check a
deadline it can reach on a loaded runner rather than the fixed 2 s and 5 s, and recording how long each pid took and
which pid and command line survived would make the next red diagnosable rather than merely red. Retrying the case at
the runner level would stop the gate costing a whole rerun, but it hides the signal and is a stopgap while this note
is open, not a repair. The shapes case is a different question: its `spawnSync` already has 60 s, so its red is not
obviously a timeout, and what it read has to come from the log before a change is chosen.

## Specs

- None contradicted as far as is known. If a grandchild really survives the window's kill, the product contradicts
  `REQ-SHELL-092` and the tree kill `REQ-TOOLS-097` and `REQ-TOOLS-098` name; if the reading alone is early, no
  requirement is contradicted and the test's bound is at fault. This note does not decide which, and either way the red is in
  the harness's reading until the difference is shown.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — `tasklistHas` at 1668; the kill-of-a-running-command case
  at 1734 with its assertion at 1750; the `alive` and `goneWithin` helpers at 1162–1168 and their `5_000` uses at
  1195, 1228, 1241 and 1267; a second `goneWithin` at 2789 with `6_000` uses and a `2_000` assertion at 2841.
- `packages/agent-tools/src/terminal/foreground.ts` — `killTree` at 757, `taskkill /T` (`/F` when forced) on
  Windows and `process.kill(-pid, …)` on POSIX: the tree the assertions are about, and what "gone" has to mean.
- `apps/desktop/scripts/lib/terminal-shapes.test.ts` — the docker-line case at 237, a real `spawnSync` of the shape's
  command with a 60 s timeout.
- `apps/desktop/scripts/lib/bounded-launch.test.ts` — `alive` at 52 and `goneWithin` at 65, the same kind of
  process-death check with the zombie-aware reading and a 15 s bound; not observed red here.

**Observed again, 2026-10-29 (R-088's branch, Linux host with `DISPLAY=:97`).** Not only under load: `pnpm vitest run
packages/agent-tools/src/terminal/terminal.test.ts` **alone** went red on the base commit `3ed01f9f` itself (a detached
worktree, nothing of R-088 in it) — 5 failed, 112 passed — and on R-088's head — 4 failed, 113 passed. The four
soft-paused kill cases (`goneWithin` read `[true, true]` where `[false, false]` is expected, i.e. neither the command nor
its grandchild was gone within 5 s), and on the base run also the handshake case of
[`a-cancel-during-the-first-calls-handshake-can-read-as-cancelled-before-the-command-completed.md`](a-cancel-during-the-first-calls-handshake-can-read-as-cancelled-before-the-command-completed.md).
R-088 changes nothing the terminal loads. Recorded, not investigated.

**Observed again, 2026-11-01 (the design-knowledge branch, Windows 11 ARM64, Node 26.13.0, Developer Mode on).** The
full `pnpm check` on `f11fbec4`'s tree — a change to documentation, skills and one lint, nothing the terminal loads —
went red on the soft-paused kill case at line 1267 only: `goneWithin(pids, 5_000)` read `[false, true]` (the command gone,
its grandchild not) after 10.4 s in a 416 s test run, with a Vitest fork worker exiting unexpectedly in the same run; the
host also carried a thirty-agent research workflow at the time. `pnpm vitest run packages/agent-tools/src/terminal/terminal.test.ts`
alone, minutes later on the same tree: 93 passed, 42 skipped, 363 s. The Windows reading therefore still flakes away
alone where the Linux reading of 2026-10-29 did not. Recorded, not investigated.

**Observed again, 2026-11-03 (the design-knowledge branch at `e4a6d08b`, Windows 11 ARM64, Node 26.13.0).** The full
`pnpm check` went red on one case only, the shell-ending command of line 1031 (REQ-TOOLS-097/098/100/103, OQ-144):
`Write-Output 'bye'; exit 3` took 5241.7 ms against the 5 s bound, in a 420 s test run while a proof rerun
(`code-intel-proof`) still ran beside it for part of the gate — a different case from the 2026-11-01 reading, the same
shape. `pnpm vitest run packages/agent-tools/src/terminal/terminal.test.ts` alone, ten minutes later on the same tree
(CPU at 74 % before it): 93 passed, 42 skipped, 281.6 s. Recorded, not investigated.

**Observed again, 2026-11-03, later the same day (the Overview audit's execution branch over `83910dc8`, Windows 11 ARM64,
Node 26.13.0, the host at 100 % CPU from two sibling sessions' gates and proof reruns).** Six cases of
`packages/agent-tools/src/terminal/terminal.test.ts` went red in a 22 m 31 s `pnpm check`: the shell-exit case at 5,671.5 ms
against 5 s, one read at 19,961 ms against 10 s, and four at their 30 s and 60 s bounds (the hard-timeout restart, the
soft-paused command's own exit status, the PowerShell typeahead case, the kill-and-restore case). The file alone, with the
host still at 100 %: 93 passed, 42 skipped, 427 s. Recorded, not investigated; the umbrella note
`the-windows-gate-goes-red-on-a-different-test-each-time-on-one-tree.md` holds the whole gate's reading.

**Observed again, 2026-11-04 (a landing's gate on the Overview audit's execution branch, Windows 11 ARM64, Node 26.13.0, the
host at 73 to 100 % CPU with nineteen Electron processes of two sibling sessions' proof runs).** Two cases of
`packages/agent-tools/src/terminal/terminal.test.ts` red in a 21 m 53 s `pnpm check`: the soft-paused kill's next command at
11,050 ms against 10 s, and the keystrokes-without-Enter case at its 30 s bound. The file alone, the host still at 100 %: 93
passed, 42 skipped, 261 s. Recorded, not investigated; the umbrella note holds the gate's reading.

**Observed again, 2026-11-03, late evening (the consortium branch `claude/busy-noyce-b7b850` at `45665fa9`, Windows 11 ARM64,
Node 26.13.0, the host at 91–100 % CPU under the sibling sessions and the hardening orchestration).** `pnpm worktree:land`'s
gate went red twice on this file among others: five cases the first time (the shell-ending command of line 1031 again, the
window's kill of a soft-paused command twice, the two A10 typeahead cases), three the second (the shell-ending case, the
soft-paused hand-over of OQ-144, the kill's next command). The file alone on the same tree, between the attempts, with the
neighbours still running: 93 passed, 42 skipped; and once more alone with four other red files, 130 passed across the five, 0
failed. A third landing attempt went red on seven cases of this file (the three above, the hard-timeout kill, the PD-TOOLS-001 reset, the A10 typeahead case and the throwing single-line command). Once more on 2026-11-04 after midnight, on the branch rebuilt over origin/main (head `89d0f14a`): the same three cases red in the landing's gate (the shell-ending case, the soft-paused hand-over, the kill's next command) with the hardening orchestration's proof sweep on the host at 50–83 % CPU; the file rerun alone beside two others, 117 passed, 0 failed. Recorded, not investigated; the landing waits for a quiet host.
