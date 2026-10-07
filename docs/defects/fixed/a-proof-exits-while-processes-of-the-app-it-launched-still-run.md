## A proof exits while processes of the app it launched still run

Final acceptance finacc3, round 2 (at `d12f1f2`), finding A2-19. `layout-proof`, `driver-proof` and `workspace-proof` exited
while their process group still held live Electron zygotes, GPU, utility and renderer children, and a `git diff --numstat`
child of the Git view; the sweep runner killed them. `driver-proof`'s quit had returned exit 0, yet that git child was
still running. After r1's red, `requirements-proof`'s app also stayed alive until the next proof started. A proof waits for
the main process it launched (`spawnBounded`'s exit, `stopApp`'s `exitWithin`), never for the rest of the tree, so a later
proof can meet a neighbour. A driven launch (`lib/driver.mjs` `startApp`) does not even lead a process group of its own,
so nothing could end its tree as a whole.

Separately, `driver-proof`'s workspaces (`workspace`, `family-a`, `family-b`) are plain directories under the git-ignored
`.proof/` of the checkout the proof runs in, so the app's git discovery climbs into the enclosing repository: the
leftover child diffed `main...fin27-d`, a parallel plan's branch. That matters to a reader of its Git rows, not to its
assertions.

Evidence: `<scratchpad>/sweep-finacc3-a/leftovers.r1.txt` (pid 19569
`git -C …/.proof/driver-proof/family-a diff --numstat … main...fin27-d`; zygotes 28236/28237) and
`sweep-finacc3-b/leftovers.r1.txt` (before `requirements-runs-proof`: the electron main process and zygotes alive).

## Specs

None found: no requirement says whether the product should end an in-flight git child at its quit, and this note does
not decide it. The defect is the harness's: a proof's launch is bounded (R-062, `lib/bounded-launch.mjs`) and a proof
measured beside a neighbour's leftovers measures the neighbour too.

## Relevant files

- `apps/desktop/scripts/lib/bounded-launch.mjs` — `spawnBounded` returns once the leader has exited; the group is
  signalled only on an overrun.
- `apps/desktop/scripts/lib/driver.mjs` — `startApp` spawns a driven launch in the proof's own process group;
  `stopApp` waits for the main process alone.
- `apps/desktop/scripts/driver-proof.mjs` — its workspaces under `.proof/` with no repository of their own; its two
  `finally` blocks end the main process only.
- `apps/desktop/scripts/layout-proof.mjs`, `apps/desktop/scripts/workspace-proof.mjs` — driven launches ended the same way.
- `packages/workspace/src/git/view.ts` — the Git view's reads, one of which outlived the quit.

## Outcome — repaired 2026-10-07 (fin30)

A launch now ends with its whole process group. `drainGroup` (`lib/bounded-launch.mjs`), called once the main process has
exited, gives the rest of the group three seconds to leave by itself, then SIGKILLs what is left and names each straggler on
the proof's standard error (`bounded-launch: N process(es) of the launch's group … outlived it …`); a zombie waiting on PID 1
counts as gone. `spawnBounded` drains every launch it starts and reports the account as `group`; a group-kill that finds
no group falls back to the process. A driven launch (`startApp`) now leads a group of its own on POSIX and is in the proof's
care (`trackLaunch`) — ended with the proof on its exit or on SIGINT, SIGTERM or SIGHUP — and `stopApp`, `connectOrEnd` and
the new `endLaunch` drain it; `driver-proof`, `layout-proof` and `workspace-proof` call `endLaunch` in their `finally`.
`driver-proof`'s three workspaces carry `GIT_CEILING_DIRECTORIES` at the evidence directory, so the app's git no longer
climbs into the enclosing checkout. The first form of the drain waited on unreferenced timers and ended a proof with
nothing else to wait on as "unsettled top-level await" (exit 13), found by a scratch loop and pinned. Whether the product
itself should end an in-flight git child at its quit is untouched: no requirement says, and this note does not decide it.

Pinned by `apps/desktop/scripts/lib/bounded-launch.test.ts`: a member of the launch's group that outlives a leader which
exited by itself is ended and named (red before: `group` absent and the member alive), a group that leaves inside the grace
is left alone, and a proof with nothing else to wait on still settles (red with the unreferenced timers: exit 13); and
`lib/driver.test.ts`'s `stopApp` cases with the group-kill fallback. Shown 2026-10-07 by `pnpm driver-proof --skip-build`
(27 passed, 0 failed; load 13.5 to 14.2), `pnpm layout-proof --skip-build` (28 passed; load 12.0 to 11.5) and
`pnpm workspace-proof --skip-build` (51 passed, 2 skipped; load 11.5 to 7.9), each followed by a process listing with no
process of its launches left and no straggler named. The same climb into the enclosing repository in other proofs is
recorded open: [`proof-workspaces-under-the-checkouts-proof-directory-read-the-enclosing-repository.md`](../proof-workspaces-under-the-checkouts-proof-directory-read-the-enclosing-repository.md).
