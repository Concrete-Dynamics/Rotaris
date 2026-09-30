## A live run's startup sweep deletes a concurrent live run's sandbox

`pnpm live-run` starts by sweeping every directory under `$TMPDIR/rotaris-live-run/` that is not marked `KEPT`: it drops
the credentials and deletes the directory. It does not check whether another live run on the same host is still using the
directory. When two live runs overlap, the one that starts second deletes the first one's workspace, store and leased key
while that run's app is still running. The first run then fails when it reads its store back.

Seen 2026-09-29: a `--only=ask` run started at 12:20:57 in `/home/user/Rotaris-crw-wt-inspagt`. Another workflow's live
run started at 12:21:24, and at 12:21 the first run died with `uncaughtException: Error: expected one workspace database
below /tmp/rotaris-live-run/2026-09-29T12-20-57-909Z/local; found 0` (`live-run.mjs` `oneDatabase` from `readSession`).
Afterwards `/tmp/rotaris-live-run/` held only the second run's directory.

The sweep's comment says what it is for: clearing up whatever a PREVIOUS run left behind. It has no way to tell a
leftover from a live sibling, such as a lock or pid file checked before deleting, or a per-run root.

## Specs

None. This is the harness, not the product. It breaks what `AGENTS.md` promises for `pnpm live-run`: a throwaway
workspace bounded by the endpoint's own accounting. The overlapped run spends its tokens and then yields no verdict.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: `SANDBOX_ROOT` and the startup sweep loop, which calls `dropCredentials` and
  `rmSync` on every entry not marked `KEPT`.

Recurred 2026-09-29: a `--only=faults,edit` run started at 20:59:46 in `/home/user/Rotaris-crw-wt-traffic`; another
worktree's live run started at 21:01:07, and when the first run's `edit` launch completed at 21:10:34 it died the same way
(`expected one workspace database below /tmp/rotaris-live-run/2026-09-29T20-59-46-627Z/local; found 0`). Its app and its
recording proxy kept working through the deletion — the `edit` pack's `model-traffic.jsonl` holds all 72 calls — so the
run spent its tokens and lost only its store.

Recurred again 2026-09-29, twice more. The verifier's first attempt on this branch (started 21:48:35) was swept by the
`/home/user/Rotaris-crw-wt-termout` live run that started at 21:52:23. The repairer's rerun of `--only=faults,edit`
(started 22:03:45, sandbox `/tmp/rotaris-live-run/2026-09-29T22-03-45-462Z`) was swept by the same worktree's live run
started at 22:08:13. It died reading `faults-stall`'s store back (`expected one workspace database … found 0`, at
`readSession` from the stall scenario), after `faults-ladder` had run.

Recurred a fourth time the same evening. The repairer's round-1 rerun of `--only=faults,edit` on `fix-traffic-proxy`
(started 22:44:39, sandbox `/tmp/rotaris-live-run/2026-09-29T22-44-40-230Z`) was swept by the
`/home/user/Rotaris-crw-wt-termout` live run (`--only=terminal`) that started at 22:46:42, and died at `readSession` with
`expected one workspace database … found 0` before any check was printed. The rerun that followed was held until no other
worktree's `node …/live-run.mjs` process was running — a workaround at the caller, not a repair of the sweep.

Recurred a fifth time on 2026-09-30. A `--only=duress` run on `fix-file-tools-plurals` started at 03:33:01, with sandbox
`/tmp/rotaris-live-run/2026-09-30T03-33-01-241Z`. It was swept by the `/home/user/Rotaris-crw-wt-compgrnd` live run that
started at 04:10:48. The duress app ran to its deadline quit at 04:13:19 on a deleted store. The script then died at
`readSession` with `expected one workspace database … found 0`, and printed no check. The pack's `model-traffic.jsonl`
kept all 201 calls. `ps` showed no other `live-run.mjs` process when this run started, so checking before starting is
not enough: the run that starts second does the sweeping.

## Outcome

Repaired 2026-09-29 under R-067 (acceptance round 1, finding A47), on branch `fix-accept1-1`.

- **What changed.** The sweep now tells a leftover from a live sibling, by a per-run owner file checked before deleting —
  the first remedy this note named. `live-run.mjs` makes its sandbox and writes `OWNER` (its pid and start) into it before
  anything else goes in; the sweep is `apps/desktop/scripts/lib/sandbox-sweep.mjs`'s `sweepSandboxes`. A sandbox whose
  `OWNER` probes alive (`pidExists`, the probe the proofs' lock reading already uses) is left, key included, and the run
  prints `sandbox sweep: left <dir> — a live run (pid N) is using it`. An `OWNER` naming a gone process is a leftover and
  is swept as before (`KEPT` still keeps everything but the credentials). An `OWNER` older than twelve hours
  (`LIVE_RUN_CEILING_MS`) is swept whatever the probe says, because a pid can be reused. The longest run on this host's
  evidence packs took about forty minutes. A sandbox with no `OWNER` is left while its stamp, or its mtime, is within
  those twelve hours, and swept after. Such a sandbox comes from a run on an older copy of the script, or from a run in
  the instant between making its directory and writing the file. The cost of that rule: an ownerless leftover keeps its
  key in the temp directory for up to twelve hours, where before it kept it until the next run started. A locked
  handle is still reported and skipped.
- **Pinned by** `apps/desktop/scripts/lib/sandbox-sweep.test.ts` (10 cases): the live sibling left whole, with its key; a
  real running child read as live through the default probe; a gone owner and an owner past the ceiling removed; `KEPT`
  honoured only for a leftover; ownerless sandboxes left inside the ceiling and removed past it, by stamp and by mtime; a
  removal failure reported with the sweep going on; the stamp read back as `live-run.mjs` writes it; and `live-run.mjs`
  having no sweep loop of its own and writing `OWNER` between making the sandbox and filling it. The first two and the
  last two fail on the old rule and the old script.
- **Shown.** Before the change, on the branch's old `live-run.mjs` under a private `TMPDIR`, the startup sweep deleted a
  planted sandbox whose `OWNER` named a running `sleep` process, along with its key. After it, the same plant survived
  with its key, and so did an ownerless sandbox made that second. A sandbox with a gone owner and an ownerless one from
  2026-09-01 were swept. Then two real live runs overlapped against the unmetered `katalyst` endpoint, as root under
  Xvfb, Node 24, after one `pnpm build`. `--only=ask,edit` started at 11:51:04 (sandbox
  `/tmp/rotaris-live-run/2026-09-30T11-51-04-588Z`), and `--only=ask` started at 11:51:25 while the first was in its
  sign-in and `ask`. The second printed `sandbox sweep: left /tmp/rotaris-live-run/2026-09-30T11-51-04-588Z — a live run
  (pid 22121) is using it` and `live-run PASSED` (pack `.live-run/runs/2026-09-30T11-51-25-612Z`). The first ran on
  through `edit`, read its store back, and printed `live-run PASSED` at 11:53:37 (pack
  `.live-run/runs/2026-09-30T11-51-04-588Z`, 35 checks passed). Afterwards `/tmp/rotaris-live-run/` was empty: both runs
  had cleaned up after themselves.
- **Not shown:** a run on another worktree's older copy of the script sweeping this one. That copy has no rule to read
  `OWNER`, so it still sweeps everything until it merges this. Also not shown: anything on Windows, where `pidExists`
  relies on the same `process.kill(pid, 0)` contract.
