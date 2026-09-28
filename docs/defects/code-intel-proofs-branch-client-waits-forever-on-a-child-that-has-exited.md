## `code-intel-proof`'s branch client waits forever on a child that has exited

`branch()` in `apps/desktop/scripts/code-intel-proof.mjs` launches the reserved-token branch and speaks JSON-RPC to it.
Its `send` resolves or rejects only when a reply with the request's id arrives. Nothing rejects the pending requests
when the child exits, and the guard timer only kills the child. So a branch that exits, or never becomes the server,
without answering `initialize` leaves `await send('initialize', …)` pending forever. The proof then hangs and does not
fail.

Measured 2026-09-28 in R-062's review round, as root under Xvfb on Linux (the branch is not recognised there; see
[`the-code-intelligence-server-dies-when-the-app-runs-as-root.md`](fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md)).
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
