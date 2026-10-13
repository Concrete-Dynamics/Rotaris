## A cross-file EDIT call's tree walk blocks the run host's event loop

`observeReach` (`packages/agent-tools/src/tools/observe.ts`) takes a snapshot of what a cross-file code-intelligence EDIT call can
reach before and after the call (OQ-245), and `snapshotTree` walks it with synchronous `lstatSync` and `readdirSync`. For a
project-wide call (a symbol rename, a whole-project replacement) that is the whole workspace, twice per call, up to
`SNAPSHOT_FILE_LIMIT` (200,000) files each time. The walk runs on the run host's event loop, so for its length nothing else the
run host does moves: other agents' model streams, tool results and the events the window draws wait behind it. OQ-245's ruling
accepts the cost of the walk; it does not say the walk should stall every other agent. An asynchronous walk (or one that yields
between directories) would remove the stall without changing what is observed. Found by fin35's review
(`review:edits-and-reports#1`); recorded by fin36, not repaired: the walk's two synchronous callers and its tests change with it,
and its cost on a large repository has not been measured.

## Specs

- OQ-245 (XE1, ruled under R-072): the observation and its accepted cost.
- REQ-ORCH-089 / REQ-MONITOR-117: a stalled run host can make other agents' progress look like a stall; no requirement names the
  walk.

## Relevant files

- `packages/agent-tools/src/tools/observe.ts` — `snapshotTree` (synchronous), `observeReach` (calls it twice per call).
- `apps/desktop/src/run-host/mcp.ts` — the MCP executor that runs every code-intelligence EDIT call inside `observeReach`.

## Outcome (fin38, 2026-10-13) — repaired

`snapshotTree` is asynchronous: it lists each directory with `readdir` and reads its files' status with `lstat` from
`node:fs/promises`, a directory's files together (`Promise.all`), and `observeReach` awaits both snapshots. What is observed is
unchanged (the same pruning, the same identity, the same limit and the same `null` for a walk that cannot be completed); only the
event loop moves between reads. Pinned by `observe.test.ts` ("the walk yields to the event loop while it reads the tree": a
`setImmediate` queued before the walk runs before it ends), red on the synchronous walk; the other observe tests now await it.

**Measured** (vitest, load 1.0 on 4 CPUs, a scratch tree of 20,000 empty files in 200 directories, two runs each, a 1 ms interval
counting how long the loop went unserved): the synchronous walk took 265 and 186 ms with the loop held for all of it (0 interval
ticks, longest stall 265 and 186 ms); the asynchronous walk took 472 and 375 ms with the longest stall 8.9 and 8.8 ms (283 and 255
ticks). So a project-wide call costs about twice the wall time per walk and no longer stalls the run host; at
`SNAPSHOT_FILE_LIMIT` (200,000 files) the old stall would have been about two seconds per walk, twice per call. This repository's
own tree (2,195 files once the ignores prune it) walked in 73 to 92 ms with a longest stall of 11 to 15 ms. No proof drives a
large project-wide call; `code-intel-proof`'s `child-across` launch drives the path on its small fixture.
