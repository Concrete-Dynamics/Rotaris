## A snapshot reads every file of a directory before it checks the limit

`snapshotTree`, the walk that learns what a cross-file code-intelligence EDIT call changed (OQ-245), reads a directory's files'
statuses with one `Promise.all` over the whole directory and checks `SNAPSHOT_FILE_LIMIT` only afterwards. A directory holding
far more files than the limit is therefore read whole, where the synchronous walk it replaced (fin38) stopped at the limit plus
one, and every read is issued in one turn of the run host's event loop, so the walk's longest stall grows with the largest
directory. Measured on `origin/main` `e6a04a3`: a directory of 1,000 files walked with a limit of 10 reads 1,001 statuses, all
1,000 in flight at once. Found by fin38's review (optional finding), recorded by fin39.

**Repaired 2026-10-13 (fin39, `fin39-insert-noop-optionals`).** `snapshotTree` reads a directory's files in batches of
`SNAPSHOT_STAT_BATCH` (256) and checks the limit after each, so the same walk reads at most 257 statuses and at most 256 are in
flight. Pinned by `packages/agent-tools/src/tools/observe-walk.test.ts`, which counts the status reads through a wrapped
`node:fs/promises` rather than timing them, so it holds at any load: both cases are red on the code before (1,001 reads against
a bound of 257; 1,000 in flight against 256), and the second also counts the event loop's turns between batches. Every case in
`observe.test.ts` is unchanged.

## Specs

- No requirement's text is contradicted. OQ-245's ruling bounds the walk by `SNAPSHOT_FILE_LIMIT` so that a call on an
  unbounded tree is reported unobserved rather than stalled; reading a whole directory past that bound works against it. The
  repair of `a-cross-file-edit-calls-tree-walk-blocks-the-run-hosts-event-loop` measured the walk's longest stall, which one
  `Promise.all` per directory leaves proportional to the directory's size.

## Relevant files

- `packages/agent-tools/src/tools/observe.ts`: `snapshotTree`'s `visit`, the `Promise.all` over a directory's files before
  the limit check.
- `packages/agent-tools/src/tools/observe.test.ts`: "the walk yields to the event loop", which any single awaited read
  satisfies.
