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
