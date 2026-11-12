## The Windows gate goes red on a different test each time, on one tree

On 2026-10-25 the `gate (pnpm check)` job of CI (`.github/workflows/ci.yml`, R-079) ran six times and both verdicts
appeared three times each, and **the reds share no failing test with one another** — nor with the tree they ran on. Three
of them are one tree, red twice on one run (the second attempt started by `gh run rerun --failed`) and then, hours
later, once more on a documentation-only branch cut from it. The hosted runner was the same every time — Microsoft
Windows Server 2025, runner `2.338.0`, Image `windows-2025-vs2026` (version `20261021.278.1`), Node `v24.22.1`:

| Run | Attempt | Job | `gate:check` | Result | Files red | Tests red |
| --- | --- | --- | --- | --- | --- | --- |
| `40224242238` | 1 | `121262129893` | 7m05s, exit 1 | fail | 2 | 3 |
| `40224242238` | 2 | `121295741355` | 7m11s, exit 1 | fail | 1 | 1 |
| `40238212536` | 1 | `121304222655` | 6m55s, exit 1 | fail | 1 | 1 |
| `40238232052` | 1 | `121304283546` | 6m46s, exit 0 | **pass** | — | — |

Run `40224242238` is the CI run of `main`'s merge commit `807a0c30` ("Merge pull request #19 from
Concrete-Dynamics/feat/prerelease-marking"). The last two rows are the sharpest form of it, and they were not planned:
they are the **two CI runs of this note's own branch**, `docs/windows-gate-flake-note`, both on the same head `4df29878`
— a commit that adds one `.md` file and changes no code — both started at 22:01Z seconds apart on the same image
`windows-2025-vs2026`, and the `push`-event run went red while the `pull_request`-event run passed
(`Test Files 478 passed | 5 skipped (483)`, `Tests 6966 passed | 128 skipped (7094)`, `gate:check` 6m46s exit 0). One
tree, one image, one hour, both verdicts.

Attempt 1 (job `121262129893`, log at
`gh api repos/Concrete-Dynamics/Rotaris/actions/jobs/121262129893/logs`) ended `Test Files 2 failed | 476 passed | 5 skipped (483)`
and `Tests 3 failed | 6963 passed | 128 skipped (7094)`, with three failures:

- `packages/mcp/src/mcp.test.ts:333` — `Error: EBUSY: resource busy or locked, rename 'D:\a\_temp\rotaris-mcp-r2wcDh\stubborn-workspace' -> 'D:\a\_temp\rotaris-mcp-r2wcDh\stubborn-workspace-closed'`,
  in `OwnedStdioTransport (ADR-0033, ADR-0007) > REQ-MCP-066/067: a runner whose server ignores EOF is closed as a tree at the grace bound`, at the first of the case's two `renameSync` calls straight after `await t.close()`. The log also carries a `Failed Suites 1` for the same file: `Error: EPERM, Permission denied: 'D:\a\_temp\rotaris-mcp-r2wcDh'` at `mcp.test.ts:48`, the suite's `afterAll`, which closes its registries and then removes that scratch directory (`rm`).
- `packages/agent-tools/src/terminal/terminal.test.ts:1750` — `AssertionError: expected [ true, false ] to deeply equal [ false, false ]`, in `the window's kill of a running command ends it and its grandchild, asks node-pty for no signal, and the next call is in a fresh shell`, two seconds after the kill, at `expect(pids.map(tasklistHas)).toEqual([false, false])`. The command's own pid was gone from `tasklist`; its grandchild's was not.
- `packages/agent-tools/src/terminal/terminal.test.ts:2008` — `AssertionError: setup at 77: expected undefined to be +0 // Object.is equality`, in `PD-TOOLS-001, REQ-TOOLS-099/128: at every width from 20 to 240 columns a hard-timeout reset restores PowerShell's directory and environment byte for byte`, at `expect(diag(setup.text)['exit_code'], \`setup at ${cols}\`).toBe(0)` with `cols` = 77, one of the widths in the case's loop (`[20, 33, 34, 40, 64, 75, 76, 77, 120, 240]`). `diagnosticBlock` drops null-valued keys, so an `exit_code` of `undefined` is a call that reported no exit status at all, not a call that exited non-zero.

Attempt 2 (job `121295741355`, 21:25:07Z to 21:33:21Z UTC — 22:25 to 22:33 Berlin) ended
`Test Files 1 failed | 477 passed | 5 skipped (483)` and `Tests 1 failed | 6965 passed | 128 skipped (7094)`, with one
failure, **none of the three above repeated**:

- `packages/workspace/src/delivery/runs.test.ts:201` — `AssertionError: expected false to be true // Object.is equality`, in `provisioning against a scratch repository (REQ-GIT-137/140/141, REQ-GIT-010, REQ-TRACE-498) > provisions under rotaris/req/ in the fixed directory, reads back top level and branch, and suffixes a collision with -2 in a directory of its own`, at `expect(second.ok).toBe(true)` — the second `provisionUnitWorktree` for the same unit, taken directly after line 199's `git(root, 'worktree', 'remove', '--force', first.value.path)` removed the first tree and left its branch behind, which REQ-GIT-010's suffix is the case for. Its sibling in the same `describe`, `REQ-TRACE-464: the tree recorded for a unit is taken over where Git lists it on its branch …`, passed in that run (2,184 ms), so git itself was working in the same file at the same time.

A **fifth** site, in a fourth red of the day and one not on `main`: run `40238212536` (job `121304222655`, `gate:check`
6m55s exit 1, 22:01:28Z to 22:09:23Z UTC) ended `Test Files 1 failed | 477 passed | 5 skipped (483)` and
`Tests 1 failed | 6965 passed | 128 skipped (7094)` with one failure in
`apps/desktop/scripts/lib/model-traffic.test.ts:223` — `AssertionError: expected '' to contain 'NO ANSWER'`. Its
sibling run `40238232052`, on the same head and image, is the pass in the table above.

**Why this is not the change.** The first two job IDs belong to one run of one commit — `807a0c30`, whose tree is
`0dfb8bb9a2675cfbd2ffec4c46ab432bd3f2ba4d` — and `5091352f` (the tip of PR #19's branch) is `5091352f^{tree}` =
`0dfb8bb9a2675cfbd2ffec4c46ab432bd3f2ba4d` as well; `git diff --stat 5091352f 807a0c3` is empty, so the merge added
nothing to the tree it merged. On **exactly that tree** the gate job had already gone green twice on 2026-10-25T18:21Z:
run `40220870635` (CI, `pull_request`, head `5091352f`) and run `40220867257` (CI, `push`, head `5091352f`), both with
`Test Files 478 passed | 5 skipped (483)` and `Tests 6966 passed | 128 skipped (7094)`, `gate:check` 6m59s and 7m04s
exit 0 — and the Release run `40220870626` was green beside them. Nothing separates those greens from the three reds but
which machine of the runner pool ran the job and what else it was doing. This repository treats the gate as evidence,
so a gate that fails on a tree that passed twice, and that fails one of two runs on one head, says nothing about that
tree — but it costs a rerun on ordinary landings and weakens the green when it comes.

**The job beside it.** `package (windows-x64, development)` was green in both red attempts on `main` (`121262130141`
attempt 1, `121295742512` attempt 2) and in the green runs — and, on this note's head, green in the red run `40238212536`
(`121304222893`) as well as in the passing one (`121304283746`) — so the failure is confined to the gate job's test
stage, not to the runner's ability to build. `AttachConsole failed` traces from node-pty's
`conpty_console_list_agent.js` surround all four
red logs (48 lines in attempt 1, 53 in attempt 2, 53 in job `121304222655`) — as they surround green runs on Windows,
so their presence alone is not the cause and whether they mark the same moment is not established.

**What is already recorded, and what is new.** All five failures are the same shape — a check on something Windows has
not yet let go of, or a reading taken before a loaded host has finished — but only two of the sites have a note:

- `mcp.test.ts:333`'s rename is
  [the stubborn-runner case](the-stubborn-runner-case-renames-its-workspace-before-windows-releases-the-closed-trees-handle.md),
  whose own suggestion that a handle a terminated process held is not always released by the time `close()` resolves
  fits this red as well; the EPERM at `mcp.test.ts:48` is the same complaint one step earlier, on the scratch directory
  itself, and is not named in that note.
- `terminal.test.ts:1750` is
  [the PTY process-death assertions](the-pty-process-death-assertions-flake-on-a-loaded-host.md), which records this
  exact assertion reading `[true, false]` on Windows and `[false, true]` on another attempt of one run.
- `terminal.test.ts:2008` fails in the neighbourhood of
  [the PowerShell shell-exit case](the-powershell-shell-exit-case-exceeds-its-bound-under-full-gate-load.md) — same
  file, same real-ConPTY family, same under-load timing — but that note is about a wall-clock bound being exceeded with
  the reading correct, and here the reading itself (no `exit_code` in the diagnostic block) is what is wrong. Nothing
  in that note covers it.
- `apps/desktop/scripts/lib/model-traffic.test.ts:223` is the fifth site and also had no note: in `the live run's
  recording proxy > answers a child process only while the parent awaits it asynchronously — not under spawnSync`,
  `expect(blocked.stdout).toContain('NO ANSWER')` read `AssertionError: expected '' to contain 'NO ANSWER'` — the
  child's stdout was **empty**, so it printed neither `NO ANSWER` nor `ANSWERED`. The case's comment (lines 195–203)
  fixes why the client's outcome is the assertion — the abandoned request is usually recorded anyway, because it sits
  in the listen backlog and is served once `spawnSync` returns — and the leg waits
  `spawnSync(…, { timeout: 20_000 })` on a child whose own fetch aborts at 1,500 ms. What an empty stdout means — the
  child killed rather than reaching its fetch's end, or its output lost — is not decided by this log. The repaired note
  [the recording proxy could not answer a single call, because `spawnSync` blocked the loop it listened on](../archive/defects/the-recording-proxy-could-not-answer-while-spawnsync-blocked.md)
  is a **different** defect (the recorder itself was inert under `spawnSync`, since repaired); this is the case that
  pins that arrangement going red on a loaded runner.
- `runs.test.ts:201` and `setup at 77` had **no note at all** before this one. Those three sites are this note's new
  content.

**Not repaired here.** This note was written while recording a defect noticed in CI, on a documentation-only branch cut
from `807a0c30`; nothing under `.github/workflows/`, in any test, or in product code was touched, and no cause was
found for any of the three sites that had no note. Whether the new reds are product faults or readings taken early is
not decided by these logs: for `runs.test.ts:201` the assertion alone does not say *which* refusal
`provisionUnitWorktree` returned — a `-2` branch collision reads the same as an unexpected Git failure, because the
case checks `second.ok` and prints no error — for `setup at 77` the log records the missing `exit_code` without the
detail line the diagnostic block does carry, which would name the failure kind, and for `model-traffic.test.ts:223` an
empty stdout says only that the child printed nothing. A next step that costs nothing would be to have each case print
what it saw when it fails — the refusal text, the diagnostic `detail`, the child's exit status and stderr — so the next
red is diagnosable rather than merely red.

**Stabilisation options, sketched and not decided.** Which of these is right is a decision for the work that owns each
case, and this note deliberately decides none of them:

- *More information first.* The three new sites fail without saying why (`second.ok` with no `second.error`; a
  diagnostic block whose `detail` the log does not quote; a `spawnSync` result whose status and stderr went unread).
  Making the assertion name what it saw is the cheapest change and the only one that cannot hide a real fault.
- *Bounds that a loaded runner can reach*, as the PTY note already sketches: a deadline honouring that the process
  dies rather than how fast a loaded host gets round to it, and recording how long each pid took. That fits `runs.test.ts`
  too: the case waits on Git's own completion of `worktree remove --force`, and on Windows that is the same
  handle-release question one level down.
- *Give the sequence a moment.* `runs.test.ts:201` asks Git to reuse a branch whose tree was force-removed microseconds
  earlier; a bounded retry on a refusal that is not REQ-GIT-010's collision would fit the case's own intent (the `-2`
  suffix), where a bare retry of the whole gate would not.
- *A runner-level retry of the case* (Vitest's own `retry`, or `--retry` on the stage) would stop a flake costing a
  whole rerun. It is a stopgap, not a repair: it hides the signal while these notes are open.

**The gate is right to go red.** A test that reports a failure has failed; the defect is that the same tree is not
judged the same way twice, so a red here is not by itself evidence about the commit. Nothing above was reproduced on
another host — each site appeared once on the hosted Windows runner.

*Seen again 2026-10-25* (this host, Linux x64, `pnpm check` in a worktree sitting untouched at `807a0c30`): the **full
gate on Linux** was red too, with 5 failures in `packages/agent-tools/src/terminal/terminal.test.ts` — the
`REQ-SHELL-092, REQ-TOOLS-098: the window's kill of a soft-paused command` family's `goneWithin` assertions at 1195,
1228, 1241 and 1267, and one at 1105 — `Test Files 1 failed | 477 passed | 5 skipped (483)`,
`Tests 5 failed | 7032 passed | 57 skipped (7094)`, `gate:check` 4m42s exit 1, on a host at load average 1.6 to 4.8 with
eight logical processors. The same file run alone straight after failed the same four of the `soft-paused` cases
(`Tests 4 failed | 113 passed | 18 skipped (135)`, 208.8 s), so on this host the red repeats rather than flaking away on
a retry — which is the host dependence the PTY note records for the same family. It meets none of the five Windows sites
above, and it is recorded here only because it shows a related family's bounds being met on a second platform on this
tree; the repo's documentation gate `pnpm lint` passed in that same worktree (48.6 s and 46.0 s, exit 0 both times),
and the docs-only change this note is does not move the test stage either way.

*Seen again 2026-11-01* (Windows 11 Home, build 26300, Node 26.13.0, `pnpm check` in `pnpm worktree:land`'s landing trees, one
landing after another, 5m32s to 6m42s a gate): four sites no note named as open, each in a file the branch being landed did not
touch, and none repeated in that day's gates.

- `tools/dev-time/dev-time.test.ts:138`, "recordSpan writes one span with its context; a store that cannot be written is
  answered, not thrown": `Error: git commit -q -m fixture:` from the case's `gitRun`, with nothing on stderr. Green on the next
  run of the same head.
- `apps/desktop/scripts/lib/proof-git-bar.test.ts:39`, "a workspace holding a repository of its own still reads that repository":
  `Command failed: git init -q -b own-branch` under the landing tree's `.proof/git-bar-test-<pid>/own`. Not green on the next
  run only because that run ended on a different red: this case did not fail again.
- `packages/agent-tools/src/terminal/terminal.test.ts`, "PD-TOOLS-001 (OQ-134): a reset restores the snapshot of the last command
  the product saw complete": `expected 93106.2667 to be less than 93050.296`, a timing reading. The case is named in
  [the repaired note on the restored variable](../archive/defects/a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md), which is
  about a different reading.
- `packages/agent-tools/src/terminal/terminal.test.ts`, "REQ-TOOLS-098/100/103 (OQ-144): a soft-paused command that ends the shell
  is handed over by the poll as an execution_error": `expected 'soft_pause' not to be 'soft_pause'`. The case comes from
  [the repaired note on a command that exits the shell](../archive/defects/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md);
  this is its reading going red under the gate's load, not shown to be that defect back. Green on the next run of the same head.

The same day's other reds were at recorded sites: `runs.test.ts`'s `-2` collision, `setup at 77`, the soft-paused kill family, the
shell-exit bound, and [the fork worker's exit](a-vitest-fork-worker-exits-unexpectedly-during-the-gate-and-its-test-file-goes-unreported.md),
which came three times. No cause was found for any of the four; nothing was repaired.

*Seen again 2026-11-01, later that day* (the same host, `pnpm worktree:land`'s gate on `claude/fix-instance-reclaim-pd-startup-009-ad2d06`'s
rebased head, 10m46s with a second worktree's gate running on the host at the same time): two Git-driven cases hit vitest's
30,000 ms case bound, both in files the branch did not touch, and neither at a site this note named before —
`packages/workspace/src/git/checkpoints.test.ts`, "REQ-GIT-039/040/056/057/061: the preview letters state what the restore
does; the restore puts the tree back and touches exactly the union; drift against a recorded baseline", and
`packages/workspace/src/improvements/executor.test.ts:75`, "records dedicated checkpoints, previews later edits, requires
the dirty override, and restores the approved scope". Rerun together alone straight after on the quiet host: 17 passed in
41.2 s, the two cases in 7,982 ms and 12,463 ms. The same gate's run of the head in its own worktree, an hour earlier
beside the same neighbour, had gone red on the shell-exit case alone (its own note). A second landing attempt followed.

*Seen again 2026-11-01, in the evening* (the same host, `pnpm worktree:land`'s gate on `hardening-record`'s rebased head
`f3812fee`, 10m01s, with two other sessions' landing gates and a third session's build running on the host at the same time; the
branch is docs-only): two cases hit their bounds, neither in a file the branch touched — `packages/workspace/src/git/checkpoints.test.ts`,
the same REQ-GIT-039/040/056/057/061 restore case as the sighting above, at 30,097 ms, and
`packages/agent-tools/src/terminal/terminal.test.ts`, the PowerShell shell-exit case (its own note), at 20,180 ms. Rerun together alone
straight after, the host still loaded by the neighbours: 107 passed, 42 skipped, in 281 s, both cases green. The first attempt at this
landing, an hour earlier beside the consortium's twenty-one agents, had gone red on the same checkpoints case and on
`packages/mcp/src/setup.test.ts`'s 2 s cancellation bound, both green alone in 58.8 s. A third landing attempt follows this note.

*Seen again 2026-11-03, late evening* (the same host, `pnpm worktree:land`'s gate on `claude/busy-noyce-b7b850`'s rebased head
`45665fa9`, the consortium's rulings of OQ-493 to OQ-540 — a docs-only branch plus one word in a skill file — while the two sibling
sessions and the hardening orchestration's run 4 ran on the host: CPU 91 % with 19 node and 12 Electron processes at 22:12, 100 %
with 25 and 23 at 22:39). Two landing attempts, the gate red both times and nothing pushed. The first (24m21s): 14 cases in five
files — `tools/worktree/land.test.ts` (five, four of them 30–40 s timeouts, "re-rebases and gates again when origin/main moves
under the push" among them), `packages/mcp/src/setup.test.ts` (two, the 600 ms step budget and the 300 ms hurry),
`apps/desktop/src/main/terminal-display.test.ts` (one, the live-run L9 second-command case),
`packages/agent-tools/src/terminal/terminal.test.ts` (five, the shell-ending case of its own note among them) and
`packages/workspace/src/improvements/executor.test.ts` (its 30 s timeout). The second, 25 minutes later (16m35s): 5 cases in
three files — `land.test.ts` (one), `terminal.test.ts` (three, the shell-ending case again) and `executor.test.ts`. The five
files rerun together alone between the two attempts: 130 passed, 46 skipped, 0 failed. Before either, the branch worktree's own
full `pnpm check` (798 s) had gone red on 11 cases in four files (`terminal.test.ts`, `checkpoints.test.ts`'s restore case,
`executor.test.ts`, `land.test.ts`), those four alone green but for one different PTY case, and `terminal.test.ts` alone
after that 93 passed, 42 skipped. The third attempt, 25 minutes after the second (23m35s, the host still at 100 %): 8 cases in two files — `terminal.test.ts` (seven) and `executor.test.ts` (one). Recorded, not investigated; the landing waits for a quiet host, and nothing was pushed or landed by hand (the starting session's ruling, the owner asked).

*Seen again 2026-11-04, after midnight* (the same host; the consortium branch rebuilt on origin/main `4930c49a`, head `89d0f14a`,
docs-only): `pnpm worktree:land --reviewed --keep`'s gate red after 21m16s on 6 cases in three files — `tools/worktree/land.test.ts`
(two: the re-rebase case and the explicit-review stop), `packages/agent-tools/src/terminal/terminal.test.ts` (three: the shell-ending
case, the soft-paused hand-over of OQ-144, the kill's next command) and `packages/workspace/src/improvements/executor.test.ts` (its
30 s case) — while the hardening orchestration's proof sweep ran on the host (`questions-proof`, `exit-trace-proof` and
`plan-gate-proof` with their Electron instances, from two of its trees) and a sibling session ran `land.test.ts` of its own: CPU 50 %
with 7 node processes when the attempt started (01:07), 83 % during the rerun (01:36). The three files rerun together alone under that
load: 117 passed, 42 skipped, 0 failed, in 4m39s. The attempt before it had been the install red of its own note (a kept landing
tree not reinstalled when the rebased head adds a dependency). The seventh attempt, on the branch rebuilt over origin/main `de779d29` (head `c640ffd9`, 15m06s): one case, the
shell-exit case of its own note, 1 of 7,779; `terminal.test.ts` alone straight after at 97 % CPU: Tests 93 passed | 42 skipped (135). Another attempt
follows this note.

## Specs

None contradicted on this evidence. The failures are the harness's readings and its bounds: `REQ-MCP-066`/`REQ-MCP-067`
ask that a close end the server's process tree (which the passing runs show), and `REQ-GIT-010`, `REQ-GIT-137`,
`REQ-GIT-140`, `REQ-GIT-141` and `REQ-TRACE-498` ask for the `-2` suffix, the derived directory, the base read-back and
the read-back of the provisioned tree — none of which the failing assertion shows to be wrong, because it does not say
what `provisionUnitWorktree` refused. The gate itself is development tooling no requirement governs
([R-079](../product/requests.md#r-079)); if one of the new reds does turn out to be a product fault rather than an early
reading, those requirements are where it would land.

## Relevant files

- `packages/workspace/src/delivery/runs.test.ts` — the case at 184, its `-2` collision block at 197–204, the assertion
  at 201, and the passing sibling at 212 (`REQ-TRACE-464`). No note covered this site before this one.
- `packages/workspace/src/delivery/runs.ts` — `provisionUnitWorktree` at 121, its `COLLISION_ATTEMPTS` loop at 130,
  the `isBranchCollision` test at 136 and the base read-back at 139–142: the refusals the case cannot distinguish.
- `packages/workspace/src/git/worktrees.ts` — `createWorktree` at 96 (its `Worktree path already exists` refusal at
  99), `isBranchCollision` at 52 and `COLLISION_ATTEMPTS = 50` at 56.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the PowerShell capture-restore case at 1982 with the width loop
  at 2002 and the `setup at ${cols}` assertion at 2008; the `goneWithin` assertions at 1195, 1228, 1241 and 1267 seen
  red on Linux; the `diag` parser at 103.
- `apps/desktop/scripts/lib/model-traffic.test.ts` — the case at 207, its blocking leg at 222
  (`spawnSync(…, { timeout: 20_000 })`) and the assertion at 223, the asynchronous leg at 226–234, and the comment at
  195–203 that fixes why the client's outcome is the assertion.
- `apps/desktop/scripts/lib/model-traffic.mjs` and `apps/desktop/scripts/live-run.mjs` — the in-process recorder the
  case is about, and the asynchronous `launch` the passing leg pins.
- `packages/agent-tools/src/terminal/classify.ts` — `diagnosticBlock` at 129, which drops null-valued keys: why a
  missing `exit_code` reads as `undefined` and not as a non-zero exit.
- `.github/workflows/ci.yml` — the `gate` job (`pnpm check`) and the `package` job on `windows-latest`, per R-079.
- `docs/defects/the-stubborn-runner-case-renames-its-workspace-before-windows-releases-the-closed-trees-handle.md`,
  `docs/defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md`,
  `docs/defects/the-powershell-shell-exit-case-exceeds-its-bound-under-full-gate-load.md` — the three notes this one
  points at, and the neighbourhoods it leaves to them.

**Observed again, 2026-11-03, on a local tree under full host load (the Overview audit's execution branch over `83910dc8`,
Windows 11 ARM64, Node 26.13.0).** `pnpm check` ran 22 m 31 s (the tests' own clock 3,229 s) from 20:52 local with the host at
100 % CPU — six Electron and twenty-one Node processes of two sibling sessions' gates and proof reruns beside it — and went
red on 7 files, 17 cases, every one process-bound and most at a 30 s bound: `tools/worktree/land.test.ts` (5, each a real
rebase and landing, timed out), `packages/agent-tools/src/terminal/terminal.test.ts` (6: the shell-exit case at 5,671.5 ms
against its 5 s bound, a 19,961 ms read against 10 s, four timeouts), `packages/mcp/src/mcp.test.ts` (1, the stubborn
runner's `EBUSY` on the rename of its closed workspace), `apps/desktop/src/main/terminal-display.test.ts` (1),
`packages/workspace/src/git/checkpoints.test.ts` (2), `packages/workspace/src/git/worktrees.test.ts` (1: the attach check
read `baseBranch` as `HEAD`, the fallback `checkAttach` takes when its bounded `rev-parse --abbrev-ref HEAD` answers
nothing in time) and `packages/workspace/src/improvements/executor.test.ts` (1). The same seven files run alone, one after
another, 23:08 to 23:19 with the host still at 100 %: all green — the landing 21 of 21 in 112 s, the terminal 93 passed and
42 skipped in 427 s, the MCP 22, the display 1, the checkpoints 14, the worktrees 36, the executor 3. The shape this note
records, on a developer's tree rather than the hosted runner: a red that names no defect of the code, only the bound a
case gives a child process under load. Recorded, not investigated; the commit went on the green reruns, as the rule in
`.claude/rules/tests-and-proofs.md` says.

**Observed again, 2026-11-04, in a landing's own gate (`pnpm worktree:land` on the Overview audit's execution branch over
`4930c49a`, Windows 11 ARM64, Node 26.13.0).** The gate on the rebased head ran 21 m 53 s (the tests' own clock 2,405 s) from
01:13 local with the host at 73 to 100 % CPU — nineteen Electron and seven Node processes of two sibling sessions' proof runs
beside it — and went red on 3 cases in 2 files: `tools/worktree/land.test.ts` (the development-time store case, a real landing
in a scratch repository, timed out at 30 s) and `packages/agent-tools/src/terminal/terminal.test.ts` (the soft-paused kill's
next command at 11,050 ms against its 10 s bound; the keystrokes-without-Enter case timed out at 30 s). Both files alone, one
after another, 01:36 to 01:42 with the host still at 100 %: 21 of 21 in 104 s, and 93 passed with 42 skipped in 261 s. The
landing was run again on the reruns' green: the tool runs the whole gate on each attempt and retries no red, so a loaded
host costs a landing attempt per red, not a file. Recorded, not investigated.

**Seen again 2026-11-07, and the sharpest form of it yet — one head, two events, both verdicts, twice** (the hosted
Windows runner; recorded from `gh` in Sessionanalyse S-52). Runs `42327641858` (push) and `42327648964`
(pull_request) are the **same head** `4a5ba0fd` (the electron Dependabot group), seconds apart on the same image: the
push run's `gate` **and** `package` both failed, the pull_request run had both green. The pair repeats on head
`067ce107` (production group): run `42328149486` (push) `gate` failure, run `42328154744` (pull_request) `gate` success.
And `main` itself was red twice on its **unchanged** head `6b521dc6`: job `128151925670` on `AssertionError: expected
'(no output)' to be 'AAA'` in `packages/agent-tools/src/terminal/terminal.test.ts` (the A10/OQ-168 family), and job
`128256342101` (a `gh run rerun --failed`) on the `EBUSY` rename in `packages/mcp/src/mcp.test.ts:359` (the
stubborn-runner case) — a different file each time, neither touched by the head. Two more sites the same night: job
`128268183066` on head `067ce107` was **wholly green in its tests** (`557 passed`, `7949 passed`) and fell only on
`Errors 1 error`, `Error: [vitest-pool]: Worker forks emitted error` — [the worker exit](a-vitest-fork-worker-exits-unexpectedly-during-the-gate-and-its-test-file-goes-unreported.md)
family; and job `128267160826` on head `98c3cfae` was a **typecheck** failure, ~40 `TS2694`/`TS2339` reading
`node_modules/typescript/lib/version` as if it were the compiler's API (a non-deterministic `tsc` resolution, not the
diff). The two chronic Windows sites this note holds (the PTY process-death assertions and the stubborn-runner
`EBUSY` rename) are the two that recurred on `main`. First slice repaired 2026-11-07 (branch
`fix/gate-flake-softpaused-death`): the PTY suite's death reading is now the `/proc`-aware one
[the PTY note](the-pty-process-death-assertions-flake-on-a-loaded-host.md) already named, with a case that pins the reading.
The `EBUSY`, worker-exit and typecheck families stay open.

**Seen again 2026-11-12, on a dictation-settings branch, in the same push/pull_request shape** (the hosted Windows
runner; recorded from `gh` while landing `feat/dictation-endpoint-credential`). Runs `43250903048` (push) and
`43250947748` (pull_request) are the **same head** `e9e8ed57`, seconds apart on the same image: the push run's `gate`
failed at 6m59s and the pull_request run's `gate` passed at 17m55s, while both runs' `package` jobs passed. The red was
a **sixth site**, in a file the head does not touch:

- `packages/agent-tools/src/terminal/terminal.test.ts:2036` — `AssertionError: reset at 77: expected 'The command exceeded its timeout of 1…' to contain 'were restored'`, in `PD-TOOLS-001, REQ-TOOLS-099/128: at every width from 20 to 240 columns a hard-timeout reset restores PowerShell's directory and environment byte for byte`, at `expect(r.text, \`reset at ${cols}\`).toContain('were restored')` with `cols` = 77. The call's own text says the restore failed: "Restoring the working directory and variables failed; the session is at its defaults." The same case's `setup` step is the site the note's first table already holds (`setup at 77`), so the width loop's 77th column is where this case gives way on this runner.

`Test Files 1 failed | 579 passed | 5 skipped (585)`, `Tests 1 failed | 8295 passed | 136 skipped (8432)`. The failed job
was re-run with `gh run rerun --failed`; the branch's own gate on the same head was green in three of five local runs,
the two reds being [the handshake-cancel flake](a-cancel-during-the-first-calls-handshake-can-read-as-cancelled-before-the-command-completed.md).
