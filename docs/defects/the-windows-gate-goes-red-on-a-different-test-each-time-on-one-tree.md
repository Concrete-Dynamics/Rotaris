## The Windows gate goes red on a different test each time, on one tree

On 2026-10-25 the `gate (pnpm check)` job of CI (`.github/workflows/ci.yml`, R-079) was run twice on **one tree** and
went red twice, and the two reds share not a single failing test. The hosted runner was the same for both — Microsoft
Windows Server 2025, runner `2.338.0`, Image `windows-2025-vs2026` (version `20261021.278.1`), Node `v24.22.1` — and
the two jobs are the same job, the second started by `gh run rerun --failed` on run `40224242238`, which is the CI run
of `main`'s merge commit `807a0c30` ("Merge pull request #19 from Concrete-Dynamics/feat/prerelease-marking"):

| Run | Attempt | Job | `gate:check` | Result | Files red | Tests red |
| --- | --- | --- | --- | --- | --- | --- |
| `40224242238` | 1 | `121262129893` | 7m05s, exit 1 | fail | 2 | 3 |
| `40224242238` | 2 | `121295741355` | 7m11s, exit 1 | fail | 1 | 1 |

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

**Why this is not the change.** Both job IDs belong to one run of one commit — `807a0c30`, whose tree is
`0dfb8bb9a2675cfbd2ffec4c46ab432bd3f2ba4d` — and `5091352f` (the tip of PR #19's branch) is `5091352f^{tree}` =
`0dfb8bb9a2675cfbd2ffec4c46ab432bd3f2ba4d` as well; `git diff --stat 5091352f 807a0c3` is empty, so the merge added
nothing to the tree it merged. On **exactly that tree** the gate job had already gone green twice on 2026-10-25T18:21Z:
run `40220870635` (CI, `pull_request`, head `5091352f`) and run `40220867257` (CI, `push`, head `5091352f`), both with
`Test Files 478 passed | 5 skipped (483)` and `Tests 6966 passed | 128 skipped (7094)`, `gate:check` 6m59s and 7m04s
exit 0 — and the Release run `40220870626` was green beside them. Nothing separates those greens from the two reds but
which machine of the runner pool ran the job and what else it was doing. This repository treats the gate as evidence,
so a gate that fails twice on a tree that passed twice says nothing about that tree — but it costs a rerun on ordinary
landings and weakens the green when it comes.

**The job beside it.** `package (windows-x64, development)` was green in both red attempts (`121262130141` attempt 1,
`121295742512` attempt 2) and in the green runs, so the failure is confined to the gate job's test stage, not to the
runner's ability to build. `AttachConsole failed` traces from node-pty's `conpty_console_list_agent.js` surround both
red logs (48 lines in attempt 1, 53 in attempt 2) — as they surround green runs on Windows, so their presence alone is
not the cause and whether they mark the same moment is not established.

**What is already recorded, and what is new.** All four failures are the same shape — a check on something Windows has
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
- `runs.test.ts:201` has **no note at all**, and neither does `setup at 77`. Those two are this note's new content.

**Not repaired here.** This note was written while recording a defect noticed in CI, on a documentation-only branch cut
from `807a0c30`; nothing under `.github/workflows/`, in any test, or in product code was touched, and no cause was
found for either of the two new sites. Whether the two new reds are a product fault or a reading taken early is not
decided by these logs: for `runs.test.ts:201` the assertion alone does not say *which* refusal `provisionUnitWorktree`
returned — a `-2` branch collision reads the same as an unexpected Git failure, because the case checks `second.ok` and
prints no error — and for `setup at 77` the log records the missing `exit_code` without the detail line the diagnostic
block does carry, which would name the failure kind. A next step that costs nothing would be to have each case print
its failure reason when it fails, so the next red is diagnosable rather than merely red.

**Stabilisation options, sketched and not decided.** Which of these is right is a decision for the work that owns each
case, and this note deliberately decides none of them:

- *More information first.* The two new sites fail without saying why (`second.ok` with no `second.error`; a diagnostic
  block whose `detail` the log does not quote). Making the assertion name what it saw is the cheapest change and the
  only one that cannot hide a real fault.
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
another host — the failure appeared once per site on the hosted Windows runner.

*Seen again 2026-10-25* (this host, Linux x64, `pnpm check` in a worktree sitting untouched at `807a0c30`): the **full
gate on Linux** was red too, with 5 failures in `packages/agent-tools/src/terminal/terminal.test.ts` — the
`REQ-SHELL-092, REQ-TOOLS-098: the window's kill of a soft-paused command` family's `goneWithin` assertions at 1195,
1228, 1241 and 1267, and one at 1105 — `Test Files 1 failed | 477 passed | 5 skipped (483)`,
`Tests 5 failed | 7032 passed | 57 skipped (7094)`, `gate:check` 4m42s exit 1, on a host at load average 1.6 to 4.8 with
eight logical processors. The same file run alone straight after failed the same four of the `soft-paused` cases
(`Tests 4 failed | 113 passed | 18 skipped (135)`, 208.8 s), so on this host the red repeats rather than flaking away on
a retry — which is the load/host dependence the PTY note records for the same family. It is *not* the Windows site
above, and it is recorded here only because it shows the same family's bounds being met on a second platform on this
tree; the repo's documentation gate `pnpm lint` passed in that same worktree (48.6 s, exit 0), and `pnpm test` alone
was not used to judge the tree.

## Specs

None contradicted on this evidence. The failures are the harness's readings and its bounds: `REQ-MCP-066`/`REQ-MCP-067`
ask that a close end the server's process tree (which the passing runs show), and `REQ-GIT-010`, `REQ-GIT-137`,
`REQ-GIT-140`, `REQ-GIT-141` and `REQ-TRACE-498` ask for the `-2` suffix, the derived directory, the base read-back and
the read-back of the provisioned tree — none of which the failing assertion shows to be wrong, because it does not say
what `provisionUnitWorktree` refused. The gate itself is development tooling no requirement governs
([R-079](../product/requests.md#r-079)); if the two new reds do turn out to be product faults rather than early
readings, those requirements are where they would land.

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
- `packages/agent-tools/src/terminal/classify.ts` — `diagnosticBlock` at 129, which drops null-valued keys: why a
  missing `exit_code` reads as `undefined` and not as a non-zero exit.
- `.github/workflows/ci.yml` — the `gate` job (`pnpm check`) and the `package` job on `windows-latest`, per R-079.
- `docs/defects/the-stubborn-runner-case-renames-its-workspace-before-windows-releases-the-closed-trees-handle.md`,
  `docs/defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md`,
  `docs/defects/the-powershell-shell-exit-case-exceeds-its-bound-under-full-gate-load.md` — the three notes this one
  points at, and the neighbourhoods it leaves to them.
