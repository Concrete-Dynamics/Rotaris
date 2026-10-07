## A fetch call's record carries its tool's name as `outcome_kind`

The fetch tool's observation set `outcomeKind: 'fetch'` on every call, succeeding or failing alike
(`packages/agent-tools/src/tools/fetch.ts`, the executor's `execute`), so its tool-call record carried
`outcome_kind: 'fetch'` and REQ-SESSION-139's tool-outcomes histogram filed every fetch under a `fetch` bucket: a fetch that
failed (`http_error`, `timeout`, `egress_denied`, …) could not be told from one that succeeded. `fetch` names the tool, not
how the call ended. It is the same shape OQ-208 asked about for an MCP call's `outcome_kind: 'mcp'`.

Written 2026-10-07 by fin28 on OQ-208's ruling, which reads the fetch record under the same clause, and repaired in the same
commit.

## Specs

REQ-SESSION-136 gives a tool-call record an `outcome_kind` "only when applicable", and the specification gives the field
outcome words only for the terminal (REQ-TOOLS-112) and the questions tool (REQ-TOOLS-158); REQ-SESSION-139 derives a
record's histogram bucket from `status` and `is_error` where it carries none. OQ-208, ruled 2026-10-07 under the owner's
delegation (R-072): a family name is no outcome.

## Relevant files

- `packages/agent-tools/src/tools/fetch.ts` — the executor's `execute`, which set `outcomeKind: 'fetch'`.
- `packages/agent-tools/src/tools/fetch.test.ts` — the cases that pin the record's fields.

## Outcome

Repaired 2026-10-07 by fin28 (bundle `fin28-session-records`): the observation carries no `outcomeKind` and keeps
`failureKind: r.failure_kind`, so REQ-SESSION-139 derives `success` or `tool_error`. Pinned by `fetch.test.ts`: "a 3-line
body" now expects no `outcomeKind`, and "a failing fetch (the server's 500) carries its failure_kind and no outcome_kind"
is new; both red on `d12f1f2`. The MCP half of the same ruling is pinned in `apps/desktop/src/run-host/mcp.test.ts`.
Records already stored keep `outcome_kind: 'fetch'`; no migration or reader shim is owed (the ruling).
