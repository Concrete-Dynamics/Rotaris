## `code-intel-proof`'s branch client waits forever on a child that has exited

`branch()` in `apps/desktop/scripts/code-intel-proof.mjs` launches the reserved-token branch and speaks JSON-RPC to it.
Its `send` resolves or rejects only when a reply with the request's id arrives. Nothing rejects the pending requests
when the child exits, and the guard timer only kills the child. So a branch that exits, or never becomes the server,
without answering `initialize` leaves `await send('initialize', …)` pending forever. The proof then hangs and does not
fail.

Measured 2026-09-28 in R-062's review round, as root under Xvfb on Linux (the branch is not recognised there; see
[`the-code-intelligence-server-dies-when-the-app-runs-as-root.md`](the-code-intelligence-server-dies-when-the-app-runs-as-root.md)).
Eight minutes into section 1 the proof had printed nothing. No Electron process of the worktree was alive; the two
left behind were `<defunct>`. The node process sat idle in `ep_poll` with no child, and it ended only when it was
killed (exit 143). The builder's earlier run hung the same way for 12 minutes (exit 137). A child that has exited
should fail section 1 in seconds, with its exit status and its standard error.

Recorded, not repaired. The proof's section 1 cannot pass as root until the open note above is repaired, and changing
its client is outside R-062's sweep.

## Specs

None contradicted by the product. A proof that hangs where it should fail produces no evidence for ADR-0035 c.1's
branch guard (`.claude/rules/tests-and-proofs.md`).

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs`: `branch`, its `send`, the `guard` timer, and the `exit` wait that runs
  only after the requests settle.

## Repaired 2026-09-28 under R-062

**What changed** (the harness only; no product file). The client left `branch()` for a module,
`apps/desktop/scripts/lib/line-rpc-client.mjs` (`lineRpcClient`), and `branch()` now speaks through it. A request never
outlives the child: every pending request rejects when the child exits (on `close`, once standard output has drained, or
a one-second grace after `exit` when a grandchild keeps the pipe open), when it errors or fails to start, and at once
when the guard timer kills it (`callTimeoutMs + 60,000` ms, as before) — each message naming the method and id, the exit
status or signal and when it came, a broken standard input when there was one, and the last 2,000 characters of the
child's standard error. A request sent after any of those rejects without being written. An answer that arrives after
the guard is counted and ignored. The exit wait no longer attaches its listener after the requests settle: `exited`
is listened for from the spawn, so a child that had already gone reads as its own exit and not as `killed-after-30s`.
The preamble, the non-JSON lines and the first byte's time are read exactly as the inline client read them.

**The test that pins it.** `apps/desktop/scripts/lib/line-rpc-client.test.ts`, 12 cases over a fake child process: it
exits before answering (the exit code and the standard error in the message, settled well inside a second; a signal
named as a signal; a grandchild holding the pipe; a child already gone when the client was made; a spawn failure; a
broken standard input), it answers and then exits (both requests resolve, the preamble reads `0d0a`, the exit is
recorded, a later request rejects unsent; an answer written as the child exits is still read; an error answer), and it
answers late after the guard (both pending requests reject at the guard's instant with its message, the child is
killed once, the late answer is counted; `close` disarms the guard for a child that answered in time).

**Measured** as root under Xvfb on Linux, Node 24, after one `pnpm build`, with a scratch script driving the built
development entry through `lineRpcClient` exactly as `branch()` launches it (the bundle is absent on this tree and
`pnpm code-intel:bundle` refuses off Windows, so the proof itself was not run): the token-first launch
`electron out/main/index.js builtin:code-intelligence --no-sandbox -- start-mcp-server …` had `initialize` rejected at
**192 ms** with "the child exited with code 127 … the bundled code-intelligence runtime is not present in this
installation" — the fail-in-seconds this note asked for. The proof's own launch order,
`electron out/main/index.js --no-sandbox builtin:code-intelligence -- …`, is not the branch at all on this tree: the
full application starts, takes the token for a workspace path and never answers, so section 1 fails at the guard with
its message — three minutes at the proof's `callTimeoutMs`, not for ever — and the exit reads the application's own.
That is a second, separate harness defect, recorded and not repaired here
([note](../code-intel-proofs-branch-launch-puts-the-sandbox-switch-ahead-of-the-token.md)).
