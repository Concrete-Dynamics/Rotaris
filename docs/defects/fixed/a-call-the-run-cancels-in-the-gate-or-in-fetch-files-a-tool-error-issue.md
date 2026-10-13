## A call the run cancels in the gate or in fetch files a `tool_error` issue

PD-ORCH-005 clause 3 records a call the run's rest cut off as interrupted, and the gate files no outcome-driven issue for an
observation whose failure kind is `interrupted` (a released wait, a withdrawn question, and since PD-TOOLS-013 a cancelled
terminal call). Two other cancel paths do not say so:

- **The gate's catch.** An executor that throws once the run's signal is aborted gets the observation "The '<tool>' call
  was cancelled before it completed." with failure kind `cancelled`, a word no vocabulary holds. It is not `interrupted`,
  so the result is not marked interrupted by the gate (the turn still reads the aborted signal), and `outcomeIssues` files a
  `tool_error` warning for it.
- **fetch.** A fetch the run's signal ends is recorded `network_error` (`NetworkError`, "The fetch of <url> was cancelled by
  the run before it completed."), so the cancel lands in the same failure kind as a real transport fault and files a
  `tool_error` warning.
- **The MCP executor** *(added 2026-10-13 by OQ-238's ruling, which found the third sibling)*. The SDK call receives the run's
  signal (`packages/mcp/src/client.ts`, `callTool`), and the executor's catch (`apps/desktop/src/run-host/mcp.ts`) records the
  throw on the abort as `execution_error`, "The call to '<tool>' on MCP server '<server>' failed: …", which files a
  `tool_error` warning.

A quit, a stop or a pause past the tool deadline therefore files a warning issue for such a call, where the terminal's
cancelled call (PD-TOOLS-013), a released wait and a withdrawn question file none.

Noticed by the R-072 consortium while ruling OQ-226 (2026-10-07, finding P2 of the final default live run at `a68f121`),
which records this and does not repair it. Recorded by fin31, not repaired.

## Specs

- PD-ORCH-005 clause 3: a call the rest cut off is recorded as interrupted.
- PD-TOOLS-013 extends REQ-SESSION-136 (its disposition block; `PD-SESSION-003` holds the narrowing) so a call recorded
  as interrupted files no outcome-driven issue; these two paths record a cancel under another kind, so the extension does
  not reach them.
- REQ-TOOLS-092 (fetch's closed vocabulary) has no cancellation kind; ADR-0023's reading records the cancel as
  `network_error`.

## Relevant files

- `packages/agent-tools/src/gate.ts`: the `catch` after `executor.execute` (`failureKind: aborted ? 'cancelled' : …`) and
  `outcomeIssues`.
- `packages/agent-tools/src/tools/fetch.ts`: `transportFailure`, the `ctx.signal.aborted` branch.
- `apps/desktop/src/run-host/mcp.ts`: the `catch` in each MCP tool executor's `execute`.
- `packages/engine/src/export.ts`: `outcomeOf`, which derives such a record (no `outcome_kind`) into `tool_error`.

## Repaired — 2026-10-13

Ruled as [OQ-238](../../architecture/open-questions.md) (GC1, under the owner's delegation, R-072) and built as
[`PD-TOOLS-013`](../../product/directives.md#pd-tools-013) revision 2 by fin34 (`fin34-record-and-cancels`): every call its
run cancels reads `interrupted` and files no issue.

- `packages/agent-tools/src/gate.ts`: the catch records a throw under an aborted signal as failure kind `interrupted`, "The
  '<tool>' call was cancelled by the run before it completed.", so the existing branches mark it interrupted and file no
  issue. A throw with no cancel still reads `execution_error` and files `tool_error`.
- `packages/agent-tools/src/tools/fetch.ts`: `transportFailure`'s abort branch returns `interrupted` / `InterruptedError`
  after the deadline test; `FETCH_FAILURE_KINDS` holds the ninth kind.
- `apps/desktop/src/run-host/mcp.ts`: after the allowance-timeout test, an aborted signal returns `interrupted`, "The call to
  '<tool>' on MCP server '<server>' was cancelled by the run before it completed; it was not retried."
- `packages/engine/src/export.ts`: `outcomeOf` derives a record with no `outcome_kind` and failure kind `interrupted` to the
  bucket `interrupted`, a released delegation wait included.

Pinned by `gate.test.ts`, `fetch.test.ts`, `mcp.test.ts` and `summary.test.ts` (each new case red on the old code), and by
`pnpm fetch-proof`'s ninth launch, `cancelled`: red on the old gate and fetch (`failed / network_error`), green after
(`interrupted`, `InterruptedError`, no issue).
