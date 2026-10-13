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
