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
